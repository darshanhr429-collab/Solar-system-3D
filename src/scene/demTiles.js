// DEM Tile Streaming LOD System: Streaming real digital elevation models for Moon (LOLA) and Mars (MOLA).
//
// Motivation:
//   Authentic lunar and Martian exploration requires real digital elevation data (craters, Olympus Mons,
//   Valles Marineris, Apollo landing sites). Multi-gigabyte elevation models must be streamed as quadtree tiles.
//   Olympus Mons, Valles Marineris). Gigabyte-scale DEM datasets must be streamed in chunks.
//
// Architecture:
//   - Tile pyramid: Levels 0-8 (2^level x 2^level tiles, equirectangular projection)
//   - LRU Cache: Desktop 64 tiles, mobile 32 tiles (bounded memory footprint, avoids OOM)
//   - Distance-priority scheduling (nearer high-resolution tiles prioritized)
//   - Offline fallback: Retains valid cache on network failure, 30s cooldown before retrying failed tiles
//   - Synchronous sampling: height() reads synchronously from cache, returning null on cache miss for fallback
//
// Spectral fusion with procedural noise:
//   - DEM provides low-frequency macro-topography
//   - Procedural noise injects sub-pixel high-frequency surface detail
//   - Close range: High-res DEM + high-frequency micro-relief
//   - Mid range: Low-res DEM + procedural noise
//   - Distant / offline: Pure procedural noise fallback (seamless continuity)
//   - Crack prevention: height() uses highest available DEM level; smooth uFade blend animation
//     on tile arrival eliminates seams and popping.
//
// Data sources: Local pre-processed DEM tiles (tools/fetch-dem.mjs from NASA PDS / NOAA LOLA/MOLA/ETOPO1).
// Automatic offline fallback to procedural terrain if tiles are missing.
// Falls back gracefully to procedural noise if elevation files are absent.

import { IS_MOBILE } from '../engine/quality.js';
import { asset } from '../config.js';
import { resourceQueue, whenIdle } from '../engine/resourceQueue.js';

/**
 * DEM datasource configuration.
 * url template: {z}=level, {x}=col, {y}=row (equirectangular projection).
 * heightScale/heightOffset: decodes 16-bit elevation into kilometers.
 *   elevation = heightOffset + (raw / 65535) * heightScale
 *
 * maxLevel determined by authentic upstream sensor resolution:
 * Tile grid uses 2^z x 2^z tiles across 360 deg x 180 deg; longitude resolution is 360 / (256 * 2^z) deg/pixel.
 * maxLevel selected to match source resolution without redundant upsampling.
 * maxLevel selected so longitude resolution matches or exceeds native source resolution;
 * higher levels merely upscale pixels without adding genuine topographical information.
 *
 *   moon  LOLA GDR ldem_16     5760x2880  -> 0.0625 deg/px -> maxLevel 4
 *   mars  MOLA MEGDR 32ppd    11520x5760 -> 0.03125 deg/px -> maxLevel 5
 *   earth ETOPO1             21600x10800 -> 0.01667 deg/px -> maxLevel 6
 *
 * 16-bit elevation values packed into R (high 8 bits) + G (low 8 bits) channels (Terrain RGB format).
 * Packing preserves 16-bit fidelity across standard 8-bit per channel web canvas environments.
 */
export const DEM_SOURCES = {
  moon: {
    name: 'LOLA',
    url: 'dem/moon/{z}/{x}/{y}.png',  // Relative to site base via asset()
    // LOLA elevation range: -9 km (deep crater floors) to +11 km, span 20 km
    heightScale: 20,
    heightOffset: -9,
    tileSize: 256,
    maxLevel: 4,
    sourcePx: 5760,
  },
  mars: {
    name: 'MOLA',
    url: 'dem/mars/{z}/{x}/{y}.png',
    // MOLA elevation range: -9 km to +22 km (Hellas -8.2 km, Olympus +21.2 km), span 31 km
    heightScale: 31,
    heightOffset: -9,
    tileSize: 256,
    maxLevel: 5,
    sourcePx: 11520,
  },
  earth: {
    name: 'ETOPO1',
    url: 'dem/earth/{z}/{x}/{y}.png',
    // ETOPO1 elevation range: -11 km (Mariana) to +9 km (Everest), span 20 km
    heightScale: 20,
    heightOffset: -11,
    tileSize: 256,
    maxLevel: 4,
    sourcePx: 21600,
  },
};

/** Whether level exceeds native source resolution (for diagnostics/assertions) */
export function levelExceedsSource(cfg, level) {
  if (!cfg?.sourcePx) return false;
  return 360 / (cfg.tileSize * 2 ** level) < 360 / cfg.sourcePx * 0.75;
}

/** Convert unit direction (+Y=North, +X=Prime meridian) to lat/lon (degrees) */
function dirToLatLon(dir) {
  const lat = Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI;
  const lon = Math.atan2(-dir.z, dir.x) * 180 / Math.PI; // East positive (consistent with terrain.js)
  return { lat, lon };
}

/** Convert lat/lon (deg) to tile coordinates + fractional tile UV (equirectangular) */
function latLonToTile(lat, lon, level) {
  const n = 2 ** level;
  // Equirectangular projection: lon [-180,180] -> [0,n], lat [90,-90] -> [0,n]
  const x = ((lon + 180) / 360) * n;
  const y = ((90 - lat) / 180) * n;
  const ix = Math.floor(x), iy = Math.floor(y);
  return {
    x: ((ix % n) + n) % n, // Longitude wrapping (antimeridian wrap)
    y: Math.max(0, Math.min(n - 1, iy)), // Latitude clamping (poles do not wrap)
    fx: x - ix,
    fy: y - iy,
  };
}

/**
 * LRU Tile Cache: Map maintains insertion order; delete + set provides O(1) LRU eviction.
 * Map iteration order preserves insertion order (first item is least recently used).
 * Eliminates need for custom linked list implementations.
 */
class LRUTileCache {
  constructor(max) {
    this.max = max;
    this.map = new Map(); // key "z/x/y" → { data, size, level }
  }

  get(level, x, y) {
    const key = `${level}/${x}/${y}`;
    const v = this.map.get(key);
    if (v) {
      // Move to end (most recently used) via delete + set
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  peek(level, x, y) { return this.map.get(`${level}/${x}/${y}`); }

  set(level, x, y, tile) {
    const key = `${level}/${x}/${y}`;
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.max) {
      // Evict least recently used (first item)
      const oldest = [...this.map.keys()].find(k => k !== '0/0/0');
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, tile);
  }

  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}

/**
 * DEM Tile Stream Source: Manages tile fetching, caching, and bilinear sampling for a single body.
 *
 * Usage pattern:
 *   1. TerrainManager creates DEMTileSource for Moon / Mars / Earth
 *   2. requestTiles() preloads tiles per frame based on camera distance
 *   3. HeightField.height() invokes getHeightSync() for synchronous sampling
 *   4. Returns null on miss or offline, triggering procedural noise fallback
 */
export class DEMTileSource {
  constructor(bodyId, options = {}) {
    this.bodyId = bodyId;
    // Datasource configuration: allows options.sources override (testing/extensions)
    const sources = options.sources ?? DEM_SOURCES;
    this.config = sources[bodyId] ?? null;
    // Unconfigured bodies (Mercury, etc.) always fall back to procedural noise
    this.cache = new LRUTileCache(options.maxCache ?? (IS_MOBILE ? 32 : 64));
    this.loading = new Map(); // key -> Promise for deduplicating in-flight requests
    this._priority = 0;
    this._offline = false;
    this._failures = new Map();
    this._controllers = new Set();
    this._dirty = false; // Flag indicating new tile arrival, triggering terrain rebuild
    this.revision = 0;
    this._disposed = false;
    // Mobile lite quality: reduced DEM resolution ceiling
    const maxLvl = this.config?.maxLevel ?? 0;
    this.sampleLevel = IS_MOBILE ? Math.min(6, maxLvl) : maxLvl;
  }

  /** Whether body has configured DEM datasource */
  static hasSource(bodyId, sources = DEM_SOURCES) {
    return !!sources[bodyId];
  }

  get hasSource() { return this.config !== null; }
  get isOffline() { return this._offline; }
  get priority() { return this._priority; }

  /** Set loading priority (scaled by TerrainManager based on camera proximity) */
  setPriority(p) { this._priority = p; }

  /** Whether new tiles arrived (triggers terrain mesh update) */
  get hasNewTiles() { return this._dirty; }
  clearDirty() { this._dirty = false; }

  /**
   * Asynchronously fetch tile elevation data (public API).
   * @param {number} level Quadtree level 0-8
   * @param {number} x Column (longitude, wrapped)
   * @param {number} y Row (latitude, clamped)
   * @returns {Promise<{level,x,y,data:Float32Array,size:number}|null>}
   */
  async getTile(level, x, y) {
    if (!this.config || this._disposed) return null;
    level = Math.min(level, this.config.maxLevel);
    const n = 2 ** level;
    x = ((x % n) + n) % n; // Longitude wrapping
    y = Math.max(0, Math.min(n - 1, y));

    const cached = this.cache.get(level, x, y);
    if (cached) return cached;

    const key = `${level}/${x}/${y}`;
    // Deduplication: merge concurrent requests for same tile into single fetch
    if (this.loading.has(key)) return this.loading.get(key);

    if ((this._failures.get(key) ?? 0) > Date.now()) return null;
    const promise = resourceQueue.run(`dem:${this.bodyId}/${key}`,
      () => this._fetchTile(level, x, y), 100 + this._priority + (level === 0 ? 10 : 0));
    this.loading.set(key, promise);
    try {
      const tile = await promise;
      if (tile && !this._disposed) {
        this.cache.set(level, x, y, tile);
        this._offline = false;
        this._failures.delete(key);
        this._dirty = true; // Mark terrain dirty for rebuild
        this.revision++;
      }
      return tile;
    } finally {
      this.loading.delete(key);
    }
  }

  /** Fetch and decode tile from network / local assets */
  async _fetchTile(level, x, y) {
    const url = asset(this.config.url
      .replace('{z}', level)
      .replace('{x}', x)
      .replace('{y}', y));
    if (this._disposed) return null;
    const ctl = new AbortController();
    this._controllers.add(ctl);
    const timer = setTimeout(() => ctl.abort(), 12000);
    try {
      const res = await fetch(url, { mode: 'cors', signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      await whenIdle();
      const data = await this._decodeTile(blob);
      if (!data) throw new Error('Decode failed');
      return { level, x, y, data, size: this.config.tileSize };
    } catch (e) {
      // Keep valid cached terrain. A failed fine tile must not discard the
      // whole planet's DEM, and transient errors retry after a bounded cooldown.
      this._failures.set(`${level}/${x}/${y}`, Date.now() + 30000);
      this._offline = this.cache.size === 0;
      if (!this._disposed) console.warn(`[DEM] ${this.bodyId} ${level}/${x}/${y}: ${e.message}`);
      return null;
    } finally {
      clearTimeout(timer);
      this._controllers.delete(ctl);
    }
  }

  /**
   * Decode tile image to elevation Float32Array (km).
   * Browser uses createImageBitmap + Canvas pixel read;
   * Node/test environment returns null (triggering offline fallback).
   * Encoding: 16-bit elevation packed in R (high 8) + G (low 8) channels (Terrain RGB).
   */
  async _decodeTile(blob) {
    if (typeof createImageBitmap === 'undefined') return null;
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const w = bmp.width, h = bmp.height;
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    bmp.close?.();
    const { heightScale, heightOffset } = this.config;
    const n = w * h;
    const heights = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = img.data[i * 4];
      const g = img.data[i * 4 + 1];
      const raw = (r << 8) | g; // 16-bit elevation value
      heights[i] = heightOffset + (raw / 65535) * heightScale;
    }
    return heights;
  }

  /**
   * Asynchronously sample elevation at lat/lon (km, relative to reference sphere).
   * @param {number} lat Latitude (deg)
   * @param {number} lon Longitude (deg)
   * @param {number} [level] Quadtree level, defaults to sampleLevel
   * @returns {Promise<number|null>} Elevation in km, or null (offline/unconfigured)
   */
  async getHeight(lat, lon, level) {
    if (!this.config) return null;
    level = Math.min(level ?? this.sampleLevel, this.config.maxLevel);
    const t = latLonToTile(lat, lon, level);
    const tile = await this.getTile(level, t.x, t.y);
    if (!tile) return null;
    return this._sampleTile(tile, t.fx, t.fy);
  }

  /**
   * Synchronous elevation sampling (reads from cache, non-blocking).
   * Hot path for HeightField.height() - non-blocking to prevent frame stalls.
   *
   * Global pixel-grid continuous bilinear sampling across tile boundaries:
   * Tiles are cut from a global canvas (fetch-dem.mjs). Bilinear interpolation
   * across continuous global coordinates samples adjacent tiles at boundaries,
   * eliminating elevation cliff seams at tile edges.
   * Continuous and seamless across antimeridian and quadtree borders.
   * Across steep crater walls, independent pixel boundaries previously created vertical seam walls.
   * Continuous global coordinate bilinear sampling fetches adjacent boundary pixels across seams,
   * ensuring continuous elevation across all quadtree tile borders.
   *
   * @param {THREE.Vector3} dir Unit direction (+Y=North, +X=Prime meridian)
   * @returns {number|null} Elevation in km, or null on cache miss / offline
   */
  getHeightSync(dir) {
    if (!this.config) return null;
    const { lat, lon } = dirToLatLon(dir);
    const s = this.config.tileSize;
    // Attempt from highest to lowest resolution: all 4 neighborhood tiles must be cached
    for (let level = this.sampleLevel; level >= 0; level--) {
      const n = 2 ** level;
      const span = n * s; // Global pixel width
      // Global continuous pixel coordinates
      let gx = ((lon + 180) / 360) * span - 0.5;
      let gy = ((90 - lat) / 180) * span - 0.5;
      gx = ((gx % span) + span) % span;              // Longitude wrapping
      gy = Math.max(0, Math.min(span - 1.001, gy));  // Latitude clamping
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const tx = gx - x0, ty = gy - y0;
      const px = (X, Y) => {
        const Xi = ((X % span) + span) % span;
        const Yi = Math.max(0, Math.min(span - 1, Y));
        const tile = this.cache.peek(level, Math.floor(Xi / s), Math.floor(Yi / s));
        return tile ? tile.data[(Yi % s) * s + (Xi % s)] : null;
      };
      const h00 = px(x0, y0), h10 = px(x0 + 1, y0);
      const h01 = px(x0, y0 + 1), h11 = px(x0 + 1, y0 + 1);
      if (h00 === null || h10 === null || h01 === null || h11 === null) continue;
      return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty)
           + h01 * (1 - tx) * ty + h11 * tx * ty;
    }
    return null; // Cache miss -> caller falls back to procedural noise
  }

  /** Bilinear height interpolation within cached tile */
  _sampleTile(tile, fx, fy) {
    const s = tile.size;
    const px = fx * (s - 1);
    const py = fy * (s - 1);
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = Math.min(x0 + 1, s - 1), y1 = Math.min(y0 + 1, s - 1);
    const tx = px - x0, ty = py - y0;
    const h00 = tile.data[y0 * s + x0];
    const h10 = tile.data[y0 * s + x1];
    const h01 = tile.data[y1 * s + x0];
    const h11 = tile.data[y1 * s + x1];
    return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty)
         + h01 * (1 - tx) * ty + h11 * tx * ty;
  }

  /**
   * Request tiles based on camera position (background preloading).
   * Requests 3x3 neighborhood (center tile prioritized), fire-and-forget.
   * @param {THREE.Vector3} dirLocal Camera direction in body-fixed frame
   * @param {number} level Desired quadtree level
   */
  requestTiles(dirLocal, level) {
    if (!this.config || this._disposed) return;
    level = Math.min(level, this.config.maxLevel);
    const { lat, lon } = dirToLatLon(dirLocal);
    const t = latLonToTile(lat, lon, level);
    // Center tile has highest priority, followed by 3x3 neighborhood
    this.getTile(level, t.x, t.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        this.getTile(level, t.x + dx, t.y + dy);
      }
    }
  }

  /** Preload root level (global 1x1 tile) to ensure macro-topography is immediately ready */
  async preloadBase() {
    if (!this.config) return;
    await this.getTile(0, 0, 0);
  }

  dispose() {
    this._disposed = true;
    for (const ctl of this._controllers) ctl.abort();
    this._controllers.clear();
    this._failures.clear();
    this.cache.clear();
    this.loading.clear();
  }
}
