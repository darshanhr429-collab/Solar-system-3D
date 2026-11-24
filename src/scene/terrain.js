// Planetary surface terrain system: concentric ring LOD terrain generated under camera.
// - Heightfield: large-scale tectonics + mountain mask + dual-scale craters + 3 detail octaves (meter-scale bumps)
// - Color: physical albedo * slope cliffing * elevation tint
// - Fragment tri-scale detail noise
// - Deterministic rock scatter (InstancedMesh, stable on reload)
// heightFn supplies walking collision (shares geometry source, zero clipping).

import * as THREE from 'three';
import { HASH_GLSL } from './glslNoise.js';
import { shapeRadiusKm, hasShapeModel } from './shapeModels.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise, hashSeed } from '../util/noise.js';
import { QUALITY } from '../engine/quality.js';
import { DEMTileSource } from './demTiles.js';
import { TERRAIN_GRADE } from './planetMaterial.js';

/** sRGB byte -> linear albedo (matches GPU texture decoding).
 * Vertex colors read canvas sRGB bytes matching GPU decoded linear values,
 * preventing over-bright washed-out terrain,
 * eliminating color mismatches and seams with planetary disc. */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Polar frost palette [r, g, b] for untextured bodies
const FROST_PALETTES = {
  mars:   [0.86, 0.82, 0.78], // CO2 dry ice with rose tint
  ice:    [0.94, 0.96, 1.00], // Water ice, white-blue
  pluto:  [0.90, 0.88, 0.84], // Nitrogen ice, off-white
  triton: [0.88, 0.86, 0.92], // Nitrogen + methane ice, faint blue-violet
  gray:   [0.80, 0.80, 0.82], // Lunar polar slight high albedo
};

const PALETTES = {
  gray:     [[0.32, 0.32, 0.33], [0.55, 0.55, 0.56]],
  dark:     [[0.18, 0.17, 0.17], [0.34, 0.33, 0.32]],
  ice:      [[0.72, 0.78, 0.84], [0.95, 0.97, 1.0]],
  earth:    [[0.35, 0.4, 0.28], [0.65, 0.62, 0.55]],
  mars:     [[0.45, 0.24, 0.13], [0.75, 0.46, 0.28]],
  venus:    [[0.45, 0.36, 0.22], [0.72, 0.6, 0.4]],
  io:       [[0.75, 0.65, 0.25], [0.95, 0.85, 0.5]],
  titan:    [[0.5, 0.36, 0.18], [0.72, 0.55, 0.3]],
  triton:   [[0.7, 0.68, 0.66], [0.88, 0.84, 0.8]],
  pluto:    [[0.55, 0.45, 0.35], [0.85, 0.8, 0.72]],
  callisto: [[0.3, 0.28, 0.25], [0.55, 0.5, 0.45]],
  iapetus:  [[0.15, 0.12, 0.1], [0.85, 0.85, 0.82]],
};

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Height/color field per landable body (lazy created) */
/** Integer hash -> [0, 1) for deterministic crater distribution per grid cell. */
function ihash(x, y, z, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
        ^ Math.imul(z | 0, 2147483647) ^ Math.imul(s | 0, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Crater depth (km). Empirical morphological transition:
 *  Simple craters (D < 15km): bowl-shaped, depth/diameter ~0.2;
 *  Complex craters (D >= 15km): non-linear power law, flat floor, central peak, terraces
 *  fitted to empirical measurements (Orientale ~6km, Caloris ~8km).
 *  Prevents exaggerated depth artifacts from linear extrapolation. */
function craterDepth(D) {
  return D < 15 ? 0.20 * D : 2.4 * Math.pow(D / 15, 0.28);
}

/** Normalized profile (x = r/R, return value is factor of depth). */
function craterProfile(x, complex) {
  if (x >= 2.4) return 0;
  if (x >= 1.0) {
    // Ejecta blanket: outer slope elevation with power-law decay
    const t = (2.4 - x) / 1.4;
    return 0.18 * t * t * t;
  }
  // Crater rim uplift
  const rim = 0.24 * Math.exp(-((x - 0.94) ** 2) / 0.012);
  let bowl;
  if (complex) {
    // Complex crater: flat floor + central peak + terraces
    bowl = x < 0.62 ? -1 : -(1 - ((x - 0.62) / 0.38) ** 2);
    bowl += 0.35 * Math.exp(-(x * x) / 0.012);
    if (x > 0.62) bowl += 0.09 * Math.cos(x * 22);
  } else {
    bowl = -(1 - x * x);   // Bowl shape
  }
  return bowl + rim;
}

/**
 * Impact crater field: layered placement following size-frequency distribution.
 *
 * Why noise contours fail: real craters exhibit distinct morphology with raised rims and floors.
 * Bowl shape/、、、，。
 * ，。
 *
 *  **N(>D) ∝ D⁻²**： ≥D  D² 。
 * " ∝ D"，********，
 * —— 3.2（ 3.2 ，）。
 */
class CraterField {
  constructor(seed, radiusKm, maxD, minDOverride = null) {
    this.R = radiusKm;
    this.salt = seed >>> 0;
    this.classes = [];
    //  8m  R/40000 ：
    // （ 8–50m ——****，
    //   50m ）。
    // minDOverride：****（8m，），——
    //  R/40000  43m，。
    const minD = minDOverride ?? Math.max(0.008, radiusKm / 40000);
    let i = 0;
    for (let D = maxD; D > minD; D /= 2.2, i++) {
      this.classes.push({ D, cell: D * 2.6, depth: craterDepth(D), complex: D >= 15, k: i });
    }
  }

  /** dir: 。（km）。 */
  at(dir) {
    const R = this.R;
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const lon = Math.atan2(-dir.z, dir.x);
    const cosLat = Math.max(Math.cos(lat), 1e-3);
    let h = 0;
    // ****（""），：
    //  −17km， 8km。，
    // ，。
    // ： 11km， 1.8km  16%，
    // 。。
    const maxD = Math.min(this.classes.length ? this.classes[0].depth : 0, this.R * 0.06);
    let bowl = 0, rim = 0;
    for (const c of this.classes) {
      // ： cell/R ， cosLat （）
      const dLat = c.cell / R;
      const dLon = c.cell / (R * cosLat);
      const iLat = Math.floor(lat / dLat), iLon = Math.floor(lon / dLon);
      const seed = this.salt + c.k * 7919;
      for (let a = -1; a <= 1; a++) {
        const gi = iLat + a;
        for (let b = -1; b <= 1; b++) {
          const gj = iLon + b;
          if (ihash(gi, gj, c.k, seed) > 0.62) continue;   // 
          const u = ihash(gi, gj, c.k + 101, seed);
          const v = ihash(gi, gj, c.k + 202, seed);
          const rr = ihash(gi, gj, c.k + 303, seed);
          // （，）
          const cLat = (gi + 0.15 + u * 0.7) * dLat;
          const cLon = (gj + 0.15 + v * 0.7) * dLon;
          //  [0.55, 1.0]·D/2 
          const cr = c.D * (0.275 + rr * 0.225);
          //  → （km）
          const dLatA = lat - cLat;
          const dLonA = lon - cLon;
          const cosD = Math.sin(lat) * Math.sin(cLat)
                     + Math.cos(lat) * Math.cos(cLat) * Math.cos(dLonA);
          const ang = Math.acos(Math.max(-1, Math.min(1, cosD)));
          const rKm = ang * R;
          if (rKm > cr * 2.4) continue;
          const contrib = c.depth * craterProfile(rKm / cr, c.complex);
          if (contrib < 0) bowl += contrib; else rim += contrib;
        }
      }
    }
    //  −1.2×；/ +0.6×。
    h = Math.max(-1.2 * maxD, Math.min(0.6 * maxD, bowl)) + Math.min(0.6 * maxD, rim);
    return h;
  }
}

/**  DEM 。
 *
 *  ：****（ _lowRelief），
 *  ——（freq 30）、、
 *  ，。
 *
 *  " ×1.7"， 5–10 km：
 *  ，，（ C-2）。
 *  ， _heightNoise ——，
 *  。
 *
 *  （builder ），。 */
export function terrainReliefOffset(phys) {
  // ，（/）
  if (!phys?.landable) return 0;
  const amp = Math.min(phys.surface?.ampKm ?? 2, phys.radiusKm * 0.05);
  // （ _heightNoise ）
  const mid = 0.16 + 0.05 + 0.022 + 0.009 + 0.45 * 0.12;
  // （ ≈ 0.1R）（0.45R，）
  const typD = craterDepth(phys.radiusKm * 0.1) * (phys.surface?.craters ?? 0);
  return amp * 0.5 * mid + Math.max(0, typD) * 1.2;
}

export class HeightField {
  constructor(bodyId, phys, mapImageData = null) {
    this.bodyId = bodyId;
    this.phys = phys;
    this.sp = phys.surface ?? { ampKm: 2, roughness: 0.5, craters: 0.5, palette: 'gray' };
    this.noise = makeNoise(hashSeed(bodyId));
    // ： craters 。 45%——
    // （ Herschel 139km = 0.7R、 Caloris 1550km
    // = 0.64R），，。
    // ： 0.62·ampKm（），
    //  3–6km、""。
    // ： R （±0.5·ampKm）， 0.5·ampKm 。
    // DEM ， 0。
    // （） height() 
    // （builder.deformIrregular **** height()），
    // ——、，
    // 。（ _buildLevel）。
    //  =  height() 。（）
    this.deformed = !!phys.shape?.dims || hasShapeModel(bodyId);
    //  baseSphereRadius （ DEM ）
    this.reliefSphere = !!phys.landable && !this.deformed;
    this.baseOffset = this.deformed ? 0 : terrainReliefOffset(phys);
    // ： _heightNoise  effAmp 
    this.effAmp = Math.min(this.sp.ampKm ?? 2, phys.radiusKm * 0.05);
    this.craterField = (this.sp.craters ?? 0) > 0
      ? new CraterField(hashSeed(bodyId + ':crater'), phys.radiusKm, phys.radiusKm * 0.45)
      : null;
    // ：DEM （ 2.67km/px、 2.60、 9.77），
    // ****——。 DEM
    // ，（ DEM ）。
    this.craterFine = (this.sp.craters ?? 0) > 0
      ? new CraterField(hashSeed(bodyId + ':crater-fine'), phys.radiusKm,
          { moon: 2.6, mars: 2.5, earth: 9.5 }[bodyId] ?? 2.5, 0.008)
      : null;
    this.map = mapImageData; // {data,width,height} 
    this.demSource = null;   // DEM （ LOLA /  MOLA）， setDEMSource 
    this._alb = null;        // ， _albedoReliefAt
  }

  /**
   * ****（）。
   *
   * ： DEM ，、，**
   * **——、、，。
   * （ − ）：、、
   * ，，" ≈ "
   * 。
   *
   * ""—— DEM 。****，
   * ，。
   *  256×128 （），。
   */
  _buildAlbedoField() {
    const m = this.map;
    if (!m) return null;
    const W = 256, H = 128;
    const lum = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const sy = Math.min(m.height - 1, ((y + 0.5) / H * m.height) | 0);
      for (let x = 0; x < W; x++) {
        const sx = Math.min(m.width - 1, ((x + 0.5) / W * m.width) | 0);
        const i = (sy * m.width + sx) * 4;
        lum[y * W + x] = (m.data[i] * 0.299 + m.data[i + 1] * 0.587 + m.data[i + 2] * 0.114) / 255;
      }
    }
    // （ 4，，）
    const R = 4;
    const tmp = new Float32Array(W * H), low = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -R; k <= R; k++) s += lum[y * W + ((x + k + W) % W)];
        tmp[y * W + x] = s / (2 * R + 1);
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -R; k <= R; k++) s += tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x];
        low[y * W + x] = s / (2 * R + 1);
      }
    }
    //  ×2 ：，、
    let mean = 0;
    for (let i = 0; i < lum.length; i++) mean += lum[i];
    mean /= lum.length;
    let varr = 0;
    for (let i = 0; i < lum.length; i++) { const d = lum[i] - mean; varr += d * d; }
    const sd = Math.max(Math.sqrt(varr / lum.length), 1e-3);
    const hi = new Float32Array(W * H);
    for (let i = 0; i < hi.length; i++) {
      hi[i] = Math.max(-1.5, Math.min(1.5, (lum[i] - low[i]) / (2 * sd)));
    }
    return { W, H, hi };
  }

  /** （-1.5..1.5）； 0 */
  _albedoReliefAt(dir) {
    if (!this._alb) {
      this._alb = this._buildAlbedoField() ?? { none: true };
    }
    if (this._alb.none) return 0;
    const { W, H, hi } = this._alb;
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const lon = Math.atan2(-dir.z, dir.x);
    // ****。 256×128（ 1.4°），
    // ——，
    // 。。
    const fx = Math.min(W - 1.001, Math.max(0, ((lon / Math.PI + 1) * 0.5) * W - 0.5));
    const fy = Math.min(H - 1.001, Math.max(0, (0.5 - lat / Math.PI) * H - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    const a = hi[y0 * W + x0], b = hi[y0 * W + x1];
    const c = hi[y1 * W + x0], d = hi[y1 * W + x1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  }

  /**  DEM ： height() ， */
  setDEMSource(source) {
    this.demSource = source;
    //  DEM ，，
    if (source) { this.baseOffset = 0; this.reliefSphere = false; }
  }

  /** ： →  +  */
  crater(dir, f) {
    const c = this.noise.fbm(dir.x * f, dir.y * f, dir.z * f, 3);
    const rim = Math.max(0, 1 - Math.abs(c - 0.18) * 14);
    const pit = Math.max(0, 1 - Math.abs(c - 0.3) * 9);
    return rim * rim * 0.25 - pit * pit * 0.35;
  }

  /** ：；shape.dims=[X,Y,Z]（km ）
   * （，+X  / +Y ，R9-2c）。 */
  /** （） =  −  + 。
   *
   *  ****：，
   *  ，""—— C-2 ，
   *  ""。，
   *  （），/。
   *  （ builder  reliefSphereGeo）。 */
  reliefRadius(dir) {
    if (!this.reliefSphere) return this.baseRadius(dir);
    return this.baseRadius(dir) - (this.baseOffset ?? 0) + this.effAmp * 0.5 * this._lowRelief(dir);
  }

  baseSphereRadius(dir) {
    const r = this.reliefRadius(dir);
    // ****：（~R·4e-4， 0.7km）。
    // ，。
    return this.reliefSphere ? r * (1 - 4e-4) : r;
  }

  /**  height() （），""。 */
  get hasBaseSphere() { return !this.deformed; }

  baseRadius(dir) {
    // （PDS  Thomas ）：。
    // ，。
    const sm = shapeRadiusKm(this.bodyId, dir);
    if (sm != null) return sm;
    const s = this.phys.shape?.dims;
    if (!s) return this.phys.radiusKm;
    const a = s[0] / 2, b = s[1] / 2, c = s[2] / 2;
    const q = (dir.x * dir.x) / (a * a) + (dir.y * dir.y) / (b * b) + (dir.z * dir.z) / (c * c);
    return 1 / Math.sqrt(Math.max(q, 1e-12));
  }

  /** （ 0.7–4 km /，R9-2b ） */
  oceanFloor(dir) {
    const demH = this.demSource?.getHeightSync(dir);
    if (demH != null && demH < 0) return this.baseRadius(dir) + demH;
    const n = this.noise;
    const d = 1.0 + 2.4 * (0.5 + 0.5 * n.fbm(dir.x * 22 + 11.1, dir.y * 22, dir.z * 22, 3))
      + 0.5 * n.fbm(dir.x * 240, dir.y * 240, dir.z * 240, 2);
    return this.phys.radiusKm + 0.001 - Math.max(d, 0.3);
  }

  /** ：（/——，） */
  heightSolid(dir) {
    if (this.sp.ocean && this.isOcean(dir)) return this.oceanFloor(dir);
    return this.height(dir);
  }

  /** dir: （+Y=, +X=）。 km
   *  DEM（），（）。
   * ：DEM （），（），
   * ，—— DEM， DEM
   * ， + uFade （#18）。 */
  height(dir) {
    const sp = this.sp;
    // DEM ：， + 。
    // ：DEM  =  → （，""）
    if (this.demSource) {
      const demH = this.demSource.getHeightSync(dir);
      if (demH !== null) {
        if (sp.ocean && demH < 0) return this.phys.radiusKm + 0.001;
        return this._heightWithDEM(dir, demH);
      }
    }
    // （DEM ）
    if (sp.ocean && this.isOcean(dir)) return this.phys.radiusKm + 0.001;
    // ：（//）
    return this._heightNoise(dir);
  }

  /** DEM + ：DEM ， DEM  */
  _heightWithDEM(dir, demH) {
    const R = this.baseRadius(dir);
    const n = this.noise;
    // Synthetic sub-resolution relief is bounded to 1.6 m, independent of the
    // body's kilometre-scale mountain amplitude. This is detail, not measured DEM.
    const detail = 0.001 * n.fbm(dir.x * 8000, dir.y * 8000, dir.z * 8000, 2)
      + 0.0006 * n.fbm(dir.x * 42000, dir.y * 42000, dir.z * 42000, 2);
    // DEM （ craterFine ）。（km），。
    const fine = this.craterFine
      ? Math.max(-0.5, Math.min(0.5, this.craterFine.at(dir) * (this.sp.craters ?? 0)))
      : 0;
    return R + demH + detail + fine;
  }

  /** ****（， ±1）。。
   *
   *   ~6 cycles/rad： 192×128  6 ，
   *  （）。，
   *  ——。 */
  _lowRelief(dir) {
    const n = this.noise;
    const mMask = sstep(-0.05, 0.5, n.fbm(dir.x * 2.7 + 31.7, dir.y * 2.7, dir.z * 2.7, 3));
    return 0.42 * n.fbm(dir.x * 1.6, dir.y * 1.6, dir.z * 1.6, 3)
      + mMask * 0.6 * this.sp.roughness * (n.ridged(dir.x * 4, dir.y * 4, dir.z * 4, 2) * 2 - 1);
  }

  /** （）：。
   *  「」，。 */
  _midRelief(dir) {
    const n = this.noise;
    const bodyR = this.phys.radiusKm;
    const detailScale = Math.min(1, bodyR / 400);
    let h = 0.16 * n.fbm(dir.x * 30, dir.y * 30, dir.z * 30, 4);
    h += 0.05 * detailScale * n.fbm(dir.x * 900, dir.y * 900, dir.z * 900, 3);
    h += 0.022 * detailScale * n.fbm(dir.x * 8000, dir.y * 8000, dir.z * 8000, 2);
    h += 0.009 * detailScale * n.fbm(dir.x * 42000, dir.y * 42000, dir.z * 42000, 2);
    h += 0.45 * this._albedoReliefAt(dir);
    return h;
  }

  /** （，DEM ） */
  _heightNoise(dir) {
    const R = this.baseRadius(dir);
    const sp = this.sp;
    const n = this.noise;
    let hCrater = 0;   // （km，）
    // Large-scale tectonics（//）——， _lowRelief
    let h = this._lowRelief(dir);
    // （freq-30  +  + ）
    h += this._midRelief(dir);
    // ： CraterField -****（km），
    // 。（）， ampKm；
    //  craters ，" 8%"。
    if (this.craterField) {
      const cap = this.phys.radiusKm * 0.08;
      hCrater = Math.max(-cap, Math.min(cap, this.craterField.at(dir) * sp.craters));
    }
    // ： 5%，（Phobos ）
    const effAmp = this.effAmp;
    //  R ****（±0.5·effAmp）： baseOffset 。
    let hh = R + effAmp * h * 0.5 + hCrater;
    // ：， → 。
    //  baseOffset ：。
    if (!this.deformed) hh = Math.max(this.baseSphereRadius(dir), hh);
    return hh;
  }

  isOcean(dir) {
    const demH = this.demSource?.getHeightSync(dir);
    if (demH != null) return demH < 0;
    const c = this.sampleMap(dir);
    if (!c) return false;
    return c[2] > c[0] * 1.15 && c[2] > 60; // 
  }

  /** （→）， [r,g,b] 0-255  null */
  sampleMap(dir) {
    if (!this.map) return null;
    const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const lon = Math.atan2(-dir.z, dir.x); // （）
    const u = (lon / Math.PI + 1) * 0.5;
    const v = 0.5 - lat / Math.PI;
    // ****，。， GPU 
    //  + mipmap；， 2048px  5.3km/texel，
    // 300km  texel  9px —— ，
    // （ C-5 ）。
    // （ W-1  0 ），x 。
    const W = this.map.width, H = this.map.height;
    const fx = u * W - 0.5, fy = v * H - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const x0w = ((x0 % W) + W) % W, x1w = ((x0 + 1) % W + W) % W;
    const y0c = Math.min(H - 1, Math.max(0, y0));
    const y1c = Math.min(H - 1, Math.max(0, y0 + 1));
    const d = this.map.data;
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const a = d[(y0c * W + x0w) * 4 + k], b = d[(y0c * W + x1w) * 4 + k];
      const c = d[(y1c * W + x0w) * 4 + k], e = d[(y1c * W + x1w) * 4 + k];
      const top = a + (b - a) * tx, bot = c + (e - c) * tx;
      out[k] = top + (bot - top) * ty;
    }
    return out;
  }

  /** Vertex color： ×  × Height modulation */
  color(dir, hKm, slope, out) {
    // ：——（grade/sat）
    // planetMaterial ""（uBodyId==3）。
    // ，：
    // /（ 400km 、20–100km 
    // ）。（，）。
    if (this.sp.ocean && this.isOcean(dir)) {
      const m = this.sampleMap(dir);
      if (m) {
        const tg = TERRAIN_GRADE[this.bodyId];
        const gr = tg?.grade ?? [1, 1, 1];
        let r = srgbToLinear(m[0] / 255) * gr[0];
        let g = srgbToLinear(m[1] / 255) * gr[1];
        let b = srgbToLinear(m[2] / 255) * gr[2];
        const ts = tg?.sat ?? 1;
        if (ts !== 1) {
          const lum = (r + g + b) / 3;
          r = lum + (r - lum) * ts; g = lum + (g - lum) * ts; b = lum + (b - lum) * ts;
        }
        if (this.bodyId === 'earth') {
          const om = Math.min(1, Math.max(0, (b - Math.max(r, g * 0.9)) * 6));
          const k = om * 0.8;
          r *= 1 - 0.48 * k; g *= 1 - 0.40 * k; b *= 1 - 0.14 * k;
        }
        out.setRGB(
          Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))
        );
        return out;
      }
      // ：（ × ）
      const w = 0.5 + 0.5 * this.noise.fbm(dir.x * 300, dir.y * 300, dir.z * 300, 2);
      out.setRGB(0.03 + w * 0.02, 0.1 + w * 0.04, 0.22 + w * 0.06);
      return out;
    }
    const m = this.sampleMap(dir);
    const pal = PALETTES[this.sp.palette] ?? PALETTES.gray;
    const n = this.noise;
    const t = 0.5 + 0.5 * n.fbm(dir.x * 60, dir.y * 60, dir.z * 60, 3);
    let r, g, b;
    if (m) {
      // （： 0.5  ×  0.40）
      const tg = TERRAIN_GRADE[this.bodyId];
      const gr = tg?.grade ?? [1, 1, 1];
      r = srgbToLinear(m[0] / 255) * gr[0];
      g = srgbToLinear(m[1] / 255) * gr[1];
      b = srgbToLinear(m[2] / 255) * gr[2];
      // （ACES ）：（ uSat，）
      const ts = tg?.sat ?? 1;
      if (ts !== 1) {
        const lum = (r + g + b) / 3;
        r = lum + (r - lum) * ts; g = lum + (g - lum) * ts; b = lum + (b - lum) * ts;
      }
      // ：，
      // ，/
    } else {
      r = pal[0][0] + (pal[1][0] - pal[0][0]) * t;
      g = pal[0][1] + (pal[1][1] - pal[0][1]) * t;
      b = pal[0][2] + (pal[1][2] - pal[0][2]) * t;
    }
    // ""（/）。
    // ： map×grade×sat(+)，
    //  hue/rock/shade/frost， 20%±
    // （ 200km  mean|Δ|=18/255），。
    // ， DEM  + 。
    if (!m) {
      // （，SpaceEngine ）
      const hue = n.fbm(dir.x * 12 + 7.3, dir.y * 12, dir.z * 12, 3);
      r *= 1 + hue * 0.07;
      b *= 1 - hue * 0.06;
      g *= 1 + hue * 0.02;
      //  → （、）
      const rock = sstep(0.3, 0.62, slope);
      const lum2 = (r + g + b) / 3;
      r = r * (1 - rock) + (lum2 * 0.5 + r * 0.12) * rock;
      g = g * (1 - rock) + (lum2 * 0.5 + g * 0.12) * rock;
      b = b * (1 - rock) + (lum2 * 0.52 + b * 0.12) * rock;
      // ： ±y （ FROST_PALETTES ）
      const frost = FROST_PALETTES[this.sp.palette];
      if (frost) {
        const polar = sstep(0.76, 0.90, Math.abs(dir.y));
        if (polar > 0) {
          r = r * (1 - polar) + frost[0] * polar;
          g = g * (1 - polar) + frost[1] * polar;
          b = b * (1 - polar) + frost[2] * polar;
        }
      }
    }
    // Height modulation（）
    const shade = m ? 1 : 0.85 + 0.3 * ((hKm - this.phys.radiusKm) / Math.max(this.sp.ampKm, 0.01) - 0.5);
    out.setRGB(
      Math.min(1, Math.max(0, r * shade)),
      Math.min(1, Math.max(0, g * shade)),
      Math.min(1, Math.max(0, b * shade))
    );
    return out;
  }
}


/** Terrain material（ LOD ）：StandardMaterial + （）。
 * uFade: 0→1  uniform，LOD  0 ，800ms  1（）。
 * vSlope: ， PBR（，）。
 * radiusKm: /，（Phobos ）。
 * ：land/water （vWater∈(0,1)）。
 * ：（SpaceEngine ）。 */
export function makeTerrainMaterial(uPatchRel, uTime, uFade, polyUnits, radiusKm = 6371, uWaterFade = null, uSunDir = null, uUnderwater = null) {
  const detailScale = Math.min(1, radiusKm / 400); //  HeightField.height() 
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0, fog: true,
    side: THREE.DoubleSide, // （R9-2b）
    transparent: true, depthWrite: true, //  uFade （#18）
    //  rings.js ：three  transparent+DoubleSide 。
    // （ tnoise2 + ），
    // ， alpha  a(2-a)、readyCover 。
    forceSinglePass: true,
    polygonOffset: polyUnits > 0, polygonOffsetFactor: polyUnits > 0 ? 2 : 0,
    polygonOffsetUnits: polyUnits, // ， LOD  z-fight（R9-2a）
  });
  const uDetailScale = { value: detailScale };
  mat.defines = { SW_LOW: QUALITY.detail ? 0 : 1 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPatchRel = uPatchRel;
    shader.uniforms.uTime = uTime;
    shader.uniforms.uFade = uFade;
    shader.uniforms.uDetailScale = uDetailScale;
    if (uWaterFade) shader.uniforms.uWaterFade = uWaterFade;
    if (uUnderwater) shader.uniforms.uUnderwater = uUnderwater;
    shader.uniforms.uSunDir = uSunDir ?? { value: new THREE.Vector3(1, 0, 0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uPatchRel;
        attribute float water;
        attribute float slope;
        attribute float detfade;
        varying float vWater;
        varying float vSlope;
        varying float vDetFade;
        varying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObjPos = position + uPatchRel;
        vWater = water;
        vSlope = slope;
        vDetFade = detfade;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        varying vec3 vObjPos;
        varying float vWater;
        varying float vSlope;
        varying float vDetFade;
        uniform float uTime;
        uniform float uFade;
        uniform float uDetailScale;
        uniform vec3 uSunDir;        // （）
        uniform float uWaterFade;
        // 。** dot(V, normal) **：three 
        // normal （DOUBLE_SIDED），，
        // ，""（）。
        uniform float uUnderwater;
        uniform mat3 normalMatrix;
        ${HASH_GLSL}
        float thash(vec3 p) { return glslHash31(p); }
        float tnoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(thash(i), thash(i + vec3(1,0,0)), f.x), mix(thash(i + vec3(0,1,0)), thash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(thash(i + vec3(0,0,1)), thash(i + vec3(1,0,1)), f.x), mix(thash(i + vec3(0,1,1)), thash(i + vec3(1,1,1)), f.x), f.y),
            f.z);
        }
        // ：（"/"），
        // （zxy ≈ (1,1,1)120°）。
        float tnoise2(vec3 p) {
          #if SW_LOW
          return tnoise(p);
          #else
          return tnoise(p) * 0.667 + tnoise(p.zxy * 2.13 + vec3(17.31, 9.17, 5.23)) * 0.333;
          #endif
        }
        // Analytic object-space gradient avoids screen-derivative discontinuities
        // along triangle boundaries and remains stable during camera movement.
        vec3 tnoiseGrad(vec3 p) {
          vec3 i = floor(p), f = fract(p), df = 6.0 * f * (1.0 - f);
          f = f * f * (3.0 - 2.0 * f);
          float a=thash(i), b=thash(i+vec3(1,0,0)), c=thash(i+vec3(0,1,0)), d=thash(i+vec3(1,1,0));
          float e=thash(i+vec3(0,0,1)), h=thash(i+vec3(1,0,1)), j=thash(i+vec3(0,1,1)), k=thash(i+vec3(1,1,1));
          return df * vec3(mix(mix(b-a,d-c,f.y),mix(h-e,k-j,f.y),f.z),
            mix(mix(c-a,d-b,f.x),mix(j-e,k-h,f.x),f.z),
            mix(mix(e-a,h-b,f.x),mix(j-c,k-d,f.x),f.y));
        }
        vec3 tnoise2Grad(vec3 p) {
          #if SW_LOW
          return tnoiseGrad(p);
          #else
          vec3 q=tnoiseGrad(p.zxy*2.13+vec3(17.31,9.17,5.23));
          return tnoiseGrad(p)*0.667+q.yzx*(2.13*0.333);
          #endif
        }
        `)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        {
          // ：~29m / ~11m / ~2.4m / ~19cm / ~4cm。
          //
          // vObjPos ****（uPatchRel  noiseOriginU， 2km
          // ）， |vObjPos| ""、，
          // fp32 。""，
          // ： ×35/×90 ，。
          //
          // ****，：（f2/f3/f4）
          // （aa*），
          // （20cm  f3  90m ， 180m ）。
          // ： 0.09–0.29，
          //  1.8。****——（Nyquist：
          // ），。
          //
          //  (0.35, 0.9)  (0.7, 1.6) /： 0.35 ，
          // 。（tools/audit-bands.mjs，）：
          //    0.357 → 0.699（+96%）、 0.250 → 0.424（+70%）、
          //   ** 0.053 → 0.053（）**。
          // ——、； 0.29
          // （），****。
          float fp = length(fwidth(vObjPos));
          float aa1 = 1.0 - smoothstep(0.7, 1.6, fp * 35.0);
          float aa2 = 1.0 - smoothstep(0.7, 1.6, fp * 420.0);
          float aa3 = 1.0 - smoothstep(0.7, 1.6, fp * 5200.0);
          // d1（28m ）： 28m ，
          // ， ~11/255（ 200km ），
          // 。 aa2/aa3 ，。
          float g1 = aa1;
          float g2 = aa2, g3 = aa3;
          // 4cm （）：/-
          // ，""。 ~7m 。
          float aa4 = 1.0 - smoothstep(0.7, 1.6, fp * 26000.0);
          float g4 = aa4 * uDetailScale;
          float d1 = tnoise2(vObjPos * 35.0) * g1;
          float d2 = tnoise2(vObjPos * 420.0) * g2 * uDetailScale;
          #if SW_LOW
          float d3 = 0.5 * g3 * uDetailScale;
          float d4 = 0.5 * g4;
          #else
          float d3 = g3 > 0.01 ? tnoise2(vObjPos * 5200.0) * g3 * uDetailScale : 0.0;
          float d4 = g4 > 0.01 ? tnoise(vObjPos * 26000.0) * g4 : 0.0;
          #endif
          // ── ：×90（ 11 m）────────────────────────────────
          // 11m ：28m 、2.4m ，
          // ""。。
          float d1b = tnoise2(vObjPos * 90.0 + vec3(7.3, 2.1, 5.7)) * g1;
          // ：（ σ≈0.12， ≈0.12），
          //  ±7% —— 8 ，
          // ""。，
          //  [0.62, 1.38]，/。
          float nsum = d1 * 0.30 + d1b * 0.24 + d2 * 0.24 + d3 * 0.15 + d4 * 0.07;
          float dm = clamp(1.0 + 2.2 * (nsum - 0.5), 0.62, 1.38)
                   + (1.0 - g1) * 0.21
                   + (1.0 - g2) * 0.075 + (1.0 - g3) * 0.05 + (1.0 - g4) * 0.02;
          // ：。、、****
          // ，（），
          // 。：
          // "/"，。
          // （±6%），""，。
          float c1 = tnoise2(vObjPos * 90.0 + vec3(3.1, 9.4, 1.7)) * g1;
          vec3 tintVar = mix(vec3(1.06, 1.00, 0.94), vec3(0.94, 0.99, 1.05), c1);
          // （ 2 m），，
          float c2 = tnoise2(vObjPos * 420.0 + vec3(21.7, 4.9, 13.3)) * g2 * uDetailScale;
          tintVar *= mix(vec3(0.97), vec3(1.03, 1.0, 0.97), c2);
          //  vDetFade ：，/
          // ，"""
          // "，（C-5 ）。
          float df = vDetFade;
          diffuseColor.rgb *= mix(1.0, mix(dm, 1.0, vWater), df) * mix(vec3(1.0), tintVar, df);
          // ：land→water （vWater 0..1 ）（#21）
          float foam = smoothstep(0.05, 0.38, vWater) * (1.0 - smoothstep(0.62, 0.95, vWater));
          if (foam > 0.01) {
            float fw = tnoise(vObjPos * 1500.0 + vec3(uTime * 0.15, -uTime * 0.08, 0.0));
            fw *= fw;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.91, 0.96), foam * fw * 0.72);
          }
        }`)
      .replace('#include <roughnessmap_fragment>', /* glsl */ `#include <roughnessmap_fragment>
        //  PBR ：=0.82，=1.0，=0.12（#21）
        roughnessFactor = mix(0.82 + clamp(vSlope, 0.0, 1.0) * 0.18, 0.12, vWater);`)
      .replace('#include <normal_fragment_begin>', /* glsl */ `#include <normal_fragment_begin>
        {
          float vd = length(vViewPosition), fp = length(fwidth(vObjPos));
          float fade = 1.0 - smoothstep(0.1, 1.2, vd);
          float aa2 = 1.0 - smoothstep(0.35, 0.9, fp * 420.0);
          vec3 grad = tnoise2Grad(vObjPos * 420.0) * (420.0 * 0.00015 * aa2 * fade * uDetailScale * vDetFade);
          #if !SW_LOW
          float aa3 = 1.0 - smoothstep(0.35, 0.9, fp * 5200.0);
          if (aa3 > 0.01) grad += tnoise2Grad(vObjPos * 5200.0) * (5200.0 * 0.00002 * aa3 * fade * uDetailScale * vDetFade);
          #endif
          if (vWater > 0.001) {
            // 。 (0.25, 0.65) ****：
            //  ~0.3m，，
            // 。 (0.7, 1.6)（
            // ），。
            float w1 = 1.0 - smoothstep(0.7, 1.6, fp * 820.0);
            float w2 = 1.0 - smoothstep(0.7, 1.6, fp * 2800.0);
            float w3 = 1.0 - smoothstep(0.7, 1.6, fp * 7200.0);
            vec3 waterGrad = tnoiseGrad(vObjPos * 820.0 + vec3(uTime * 0.07, 0.0, uTime * 0.05)) * (820.0 * 0.50 * w1);
            if (w2 > 0.01) waterGrad += tnoiseGrad(vObjPos * 2800.0 - vec3(uTime * 0.12, uTime * 0.04, 0.0)) * (2800.0 * 0.35 * w2);
            if (w3 > 0.01) waterGrad += tnoiseGrad(vObjPos * 7200.0 + vec3(uTime * 0.19, -uTime * 0.09, uTime * 0.11)) * (7200.0 * 0.15 * w3);
            // ：0.00025  ~0.15，；
            // 0.0012  0.7 （≈35°），。
            //  30km ——（）。
            grad = mix(grad, waterGrad * 0.0012 * (1.0 - smoothstep(0.3, 30.0, vd)), vWater);
          }
          vec3 gradView = normalMatrix * grad;
          normal = normalize(normal - gradView + normal * dot(normal, gradView));
        }`)
      .replace('#include <colorspace_fragment>',
        `#include <colorspace_fragment>
        // LOD （#18）+ ： PBR（roughness 0.12）
        // ，——
        // /，。 0.6→2.5km
        // ，；（vWater=0）。
        gl_FragColor.a *= uFade * mix(1.0, uWaterFade, vWater);`) // LOD （#18）
      .replace('#include <opaque_fragment>',
        `// === ： +  ===
        // ，PBR ""；
        // （Schlick ， F0 = 0.02），
        // ，——""。
        if (vWater > 0.001) {
          vec3 V = normalize(vViewPosition);          //  → 
          float ndv = dot(V, normal);
          float cosT = clamp(ndv, 0.0, 1.0);
          float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
          vec3 refl = reflect(-V, normal);
          // ： → （ Rayleigh ，）
          float upR = clamp(dot(refl, normal), 0.0, 1.0);
          vec3 skyCol = mix(vec3(0.72, 0.82, 0.92), vec3(0.16, 0.36, 0.80), pow(upR, 0.55));
          // ，（）
          float sunUp = dot(uSunDir, normal);
          float lowSun = 1.0 - clamp(sunUp * 1.6, 0.0, 1.0);
          skyCol = mix(skyCol, vec3(1.0, 0.55, 0.30),
                       pow(clamp(dot(refl, uSunDir), 0.0, 1.0), 3.0) * lowSun * 0.85);
          float wmask = smoothstep(0.0, 0.35, vWater) * uWaterFade;
          if (uUnderwater < 0.5) {
            // ：
            outgoingLight += skyCol * fres * wmask;
          } else {
            // === ： +  ===
            //  1.333 →  48.6°（cos = 0.661）。****
            // —— 97° ，
            // ，；****，
            // ，，。
            // ，；" + "
            // （""）。
            //  |ndv|： normal  three ，。
            float ca = clamp(abs(ndv), 0.0, 1.0);
            float win = smoothstep(0.58, 0.70, ca);
            vec3 through = mix(vec3(0.55, 0.75, 0.90), skyCol, 0.65);
            // （，）
            through *= 1.0 + 0.7 * smoothstep(0.70, 0.62, ca) * step(0.58, ca);
            // ：。。
            vec3 below = mix(vec3(0.010, 0.030, 0.045), through, win);
            // ：（ normal ）
            float caus = tnoise2(vObjPos * 260.0 + vec3(uTime * 0.12, 0.0, uTime * 0.07));
            below += through * win * pow(caus, 3.0) * 0.6;
            outgoingLight = mix(outgoingLight, below, wmask);
          }
        }
        #include <opaque_fragment>`);
  };
  return mat;
}

/** ：，。
 * （）：
 * - （），
 * - （：，）
 * -  0（： 330m /）
 * - （0.15×）：，""
 * - （60m  DEM ）： 7.5m ，
 *   DEM （""） */
class RockField {
  constructor(field) {
    this.field = field;
    const sp = field.sp;
    this.density = sp.craters > 0.8 ? 0.42 : sp.palette === 'ice' ? 0.16 : 0.3;
    if (sp.ocean) this.density = 0.12;
    this.CELL = 0.018;  // 18 m （，）
    this.RANGE = 0.34;  // 340 m 
    const N = Math.floor(this.RANGE / this.CELL);
    this.MAX = Math.min(QUALITY.rockCount, Math.ceil((2 * N + 1) * (2 * N + 1) * this.density * 1.1));
    // ：detail 2 （detail 1 ，
    // ""）
    const raw = new THREE.IcosahedronGeometry(1, QUALITY.detail ? 4 : 2);
    // PolyhedronGeometry is non-indexed. Weld before calculating normals;
    // otherwise every triangle has its own normal and rocks look faceted.
    raw.deleteAttribute('normal'); raw.deleteAttribute('uv');
    const geo = mergeVertices(raw); raw.dispose();
    const n = makeNoise(hashSeed(field.bodyId + ':rock'));
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = 1 + 0.42 * n.fbm(v.x * 1.7, v.y * 1.7, v.z * 1.7, 3)
              + 0.14 * n.fbm(v.x * 5.1, v.y * 5.1, v.z * 5.1, 2);
      pos.setXYZ(i, v.x * k, v.y * k * 0.72, v.z * k);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // （setColorAt）
      roughness: 0.93, metalness: 0, fog: true,
    });
    // ：" +  fbm"，。
    // /、。****
    // （，/）。
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPos = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */ `#include <common>
          varying vec3 vRockPos;
          uniform mat3 normalMatrix;   // three 
          ${HASH_GLSL}
          float rhash(vec3 p){ return glslHash31(p); }
          float rnoise(vec3 p){
            vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(mix(rhash(i),rhash(i+vec3(1,0,0)),f.x),mix(rhash(i+vec3(0,1,0)),rhash(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(rhash(i+vec3(0,0,1)),rhash(i+vec3(1,0,1)),f.x),mix(rhash(i+vec3(0,1,1)),rhash(i+vec3(1,1,1)),f.x),f.y),f.z);
          }
          vec3 rgrad(vec3 p){
            vec3 i = floor(p), f = fract(p), df = 6.0*f*(1.0-f); f = f*f*(3.0-2.0*f);
            float a=rhash(i), b=rhash(i+vec3(1,0,0)), c=rhash(i+vec3(0,1,0)), d=rhash(i+vec3(1,1,0));
            float e=rhash(i+vec3(0,0,1)), h=rhash(i+vec3(1,0,1)), j=rhash(i+vec3(0,1,1)), k=rhash(i+vec3(1,1,1));
            return df * vec3(mix(mix(b-a,d-c,f.y),mix(h-e,k-j,f.y),f.z),
                             mix(mix(c-a,d-b,f.x),mix(j-e,k-h,f.x),f.z),
                             mix(mix(e-a,h-b,f.x),mix(j-c,k-d,f.x),f.y));
          }`)
        .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
          {
            // ：（~30cm ）、、。 km。
            vec3 g = rgrad(vRockPos * 900.0) * 0.0014
                   + rgrad(vRockPos * 3200.0) * 0.0005
                   + rgrad(vRockPos * 9000.0) * 0.00022;
            normal = normalize(normal + (normalMatrix * g));
          }`);
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, this.MAX);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;    // （builder ）
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this._anchor = null; // （）
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  /** （ → [0,1)） */
  static hash(ix, iy, iz, salt) {
    let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + salt * 144665) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** origin: （， fp32 ，R9-2a）。
   * force: DEM （，）；
   *  <60m （，） */
  rebuild(anchorDir, origin, force = false) {
    const R = this.field.phys.radiusKm;
    if (!force && this._anchor && this._anchor.distanceTo(anchorDir) * R < 0.06) return;
    this._anchor = (this._anchor ?? new THREE.Vector3()).copy(anchorDir);
    const CELL = this.CELL, RANGE = this.RANGE;
    this.mesh.position.copy(origin);
    const u = anchorDir.clone().normalize();
    const lat0 = Math.asin(u.y), lon0 = Math.atan2(-u.z, u.x);
    const latStep = CELL / R, latIndex = Math.floor(lat0 / latStep);
    const N = Math.ceil(RANGE / CELL), candidates = [];
    const dir = new THREE.Vector3();
    // Fixed latitude rows and fixed rings: candidate positions do not depend on
    // the camera anchor. Moving/rebuilding changes visibility, not rock locations.
    for (let row = latIndex - N; row <= latIndex + N; row++) {
      const lat = (row + 0.5) * latStep;
      if (Math.abs(lat) >= Math.PI / 2) continue;
      const rings = Math.max(1, Math.round(2 * Math.PI * R * Math.cos(lat) / CELL));
      const step = 2 * Math.PI / rings, center = Math.floor((lon0 + Math.PI) / step);
      for (let offset = -Math.min(N, Math.floor(rings / 2)); offset <= Math.min(N, Math.floor(rings / 2)); offset++) {
        const cell = ((center + offset) % rings + rings) % rings;
        if (RockField.hash(cell, row, 0, 1) > this.density) continue;
        const r1 = RockField.hash(cell, row, 0, 2), r2 = RockField.hash(cell, row, 0, 3);
        const r3 = RockField.hash(cell, row, 0, 4), r4 = RockField.hash(cell, row, 0, 5);
        const lon = (cell + 0.5 + (r1 - 0.5) * 0.7) * step - Math.PI;
        const jitterLat = lat + (r2 - 0.5) * latStep * 0.7;
        dir.set(Math.cos(jitterLat) * Math.cos(lon), Math.sin(jitterLat), -Math.cos(jitterLat) * Math.sin(lon));
        const distance = dir.distanceTo(u) * R;
        if (distance >= RANGE || (this.field.sp.ocean && this.field.isOcean(dir))) continue;
        candidates.push({ dir: dir.clone(), distance, r1, r2, r3, r4 });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    let count = 0;
    const up = new THREE.Vector3(0, 1, 0), yaw = new THREE.Quaternion();
    for (const candidate of candidates.slice(0, this.MAX)) {
        const { distance: dAnchor, r1, r2, r3, r4 } = candidate;
        dir.copy(candidate.dir);
        const edge = 1 - sstep(RANGE * 0.74, RANGE * 0.97, dAnchor);
        if (edge <= 0.01) continue;
        const h = this.field.height(dir);
        // ：0.12m ，~2.8m （r1³ ）
        const scale = (0.00012 + r1 * r1 * r1 * 0.0026) * edge;
        this._p.copy(dir).multiplyScalar(h + scale * 0.15).sub(origin);
        this._q.setFromUnitVectors(up, dir).multiply(yaw.setFromAxisAngle(up, r2 * Math.PI * 2));
        this._s.set(scale * (0.7 + r3 * 0.7), scale, scale * (0.7 + r2 * 0.7));
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(count, this._m);
        //  =  × （0.62–1.02）：
        // （/），
        this.field.color(dir, h, 0.35, this._c);
        const v = 0.62 + r4 * 0.4;
        this.mesh.setColorAt(count, this._c.multiplyScalar(v));
        count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}

/**  LOD （，） */
export class TerrainPatchSet {
  constructor(field) {
    this.field = field;
    this.grid = QUALITY.terrainGrid; // （R7 #8）
    const GRID = this.grid;
    const R = field.phys.radiusKm;
    // （km）： 0.012km →  ~0.4m（，
    //  <2cm）； 0.03km （R9-2a ）
    // （600/1500km ）****：300km 
    // ~1000km ， 280km 。
    // （ _buildLevel），。
    this.extents = [0.012, 0.03, 0.12, 0.5, 2.5, 12, 60, 280, 600, 1500]
      .filter((e) => e < R * 0.7);
    if (this.extents.length === 0) this.extents = [R * 0.3];
    this.group = new THREE.Group();
    this.levels = [];
    this.anchorDir = new THREE.Vector3(0, 1, 0);
    this.uTime = { value: 0 };
    this.uSunDir = { value: new THREE.Vector3(1, 0, 0) };   // 
    // （0=，；）
    this.uWaterFade = { value: 1 };
    this.uUnderwater = { value: 0 };
    // ：、 2km （）
    this.noiseOriginU = { value: new THREE.Vector3(1e9, 0, 0) };
    this._initialized = false; // ：
    this.demDirty = false;     // DEM ：
    for (let li = 0; li < this.extents.length; li++) {
      const geo = new THREE.BufferGeometry();
      const verts = (GRID + 1) * (GRID + 1);
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
      geo.setAttribute('water', new THREE.BufferAttribute(new Float32Array(verts), 1));
      geo.setAttribute('slope', new THREE.BufferAttribute(new Float32Array(verts), 1)); //  PBR
      // ：，。
      // ，""""，
      // （C-5 ）。
      geo.setAttribute('detfade', new THREE.BufferAttribute(new Float32Array(verts).fill(1), 1));
      const idx = [];
      const hole = li === 0 ? 0 : (this.extents[li - 1] / this.extents[li]) * GRID * 0.5 * 0.92;
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) {
          const cx = Math.abs(x + 0.5 - GRID / 2), cy = Math.abs(y + 0.5 - GRID / 2);
          if (li > 0 && cx < hole && cy < hole) continue;
          const a = y * (GRID + 1) + x;
          idx.push(a, a + 1, a + GRID + 1, a + 1, a + GRID + 2, a + GRID + 1);
        }
      }
      geo.setIndex(idx);
      // （R9-2a ）： + （ polygonOffset ）
      const uPatchRel = { value: new THREE.Vector3() };
      const uFade = { value: 0 }; //  0 ， LOD （#18）
      // ： li*2  z-fight——
      // ****（）。 li*6 +  2。
      const mat = makeTerrainMaterial(uPatchRel, this.uTime, uFade, li * 6, R, this.uWaterFade, this.uSunDir, this.uUnderwater);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true; // （/）
      mesh.castShadow = li < (QUALITY.detail ? 4 : 2);
      this.group.add(mesh);
      this.levels.push({
        mesh, geo, mat, uPatchRel, uFade, extent: this.extents[li],
        origin: new THREE.Vector3(), builtAnchor: new THREE.Vector3(1e9, 0, 0),
        built: false,   // （/ DEM ，）
        fadeStart: -1, // -1 = 
      });
    }
    // 
    this.rocks = new RockField(field);
    this.group.add(this.rocks.mesh);
  }

  /** （ km）： manager.update  wantId ，
   * ， */
  static actDist(R) {
    return R < 100 ? Math.max(10, R * 0.8) : Math.max(500, R * 0.18);
  }

  /** DEM ：——
   * （，
   * ""）； pending， update  ≥1.5s  */
  markDirty() {
    this.demPending = true;
  }

  /** dirLocal: （）。timeSec: 。
   *  1 。（）；。
   *  0.8s ， LOD （#18）。 */
  update(dirLocal, timeSec = 0, sunDirLocal = null) {
    const R = this.field.phys.radiusKm;
    this.uTime.value = timeSec;
    if (sunDirLocal) this.uSunDir.value.copy(sunDirLocal);
    // （>2km ， 90m ，）
    const px = dirLocal.x * R, py = dirLocal.y * R, pz = dirLocal.z * R;
    const o = this.noiseOriginU.value;
    if (Math.hypot(px - o.x, py - o.y, pz - o.z) > 2) {
      o.set(Math.round(px), Math.round(py), Math.round(pz));
      for (const lv of this.levels) lv.uPatchRel.value.copy(lv.origin).sub(o);
    }
    // ：
    const now = performance.now();
    for (const lv of this.levels) {
      if (lv.fadeStart >= 0 && lv.uFade.value < 1) {
        const p = Math.min(1, (now - lv.fadeStart) / (lv.fadeDur ?? 800));
        lv.uFade.value = (lv.fadeFrom ?? 0) + (1 - (lv.fadeFrom ?? 0)) * p;
      }
    }
    // DEM ：（ ≥1.5s）
    if (this.demPending && !this.demDirty && now - (this._lastDemSweep ?? -1e9) > 1500) {
      this.demDirty = true;
      this.demPending = false;
      this._lastDemSweep = now;
      for (const lv of this.levels) lv.demClean = false;
    }
    // ：（，）
    const initMode = !this._initialized;
    if (this._buildTask) {
      const task = this._buildTask, start = performance.now();
      let result;
      do { result = task.steps.next(); } while (!result.done && performance.now() - start < 3);
      if (result.done) {
        task.lv.builtAnchor.copy(task.anchor);
        task.lv.demClean = true;
        if (task.li === 0) this.rocks.rebuild(task.anchor, task.lv.origin, task.demRebuild);
        this._buildTask = null;
        if (this.levels.every(l => l.demClean)) this.demDirty = false;
      }
    }
    for (let i = 0; i < this.levels.length; i++) {
      const li = initMode ? this.levels.length - 1 - i : i;
      const lv = this.levels[li];
      const moveKm = lv.builtAnchor.distanceTo(dirLocal) * R;
      // DEM  → （：
      // ， DEM /，30m 
      // ）。（），。
      const demRebuild = !initMode && this.demDirty && !lv.demClean;
      if (!this._buildTask && (moveKm > lv.extent * 0.25 || demRebuild)) {
        // ""：；DEM 
        // （0.35→1, 500ms，）；
        // （，
        // ——/，#18 ）
        const anchor = dirLocal.clone();
        this._buildTask = { lv, li, anchor, demRebuild,
          steps: this._buildSteps(lv, anchor, !lv.built ? 'full' : 'none') };
        break; // ：
      }
    }
    // 
    if (initMode && this.levels.every(lv => lv.built)) {
      this._initialized = true;
    }
    // ：
    this.readyCover = this._initialized && this.levels.every(lv => lv.uFade.value > 0.999);
  }

  build(lv, anchor, fadeMode = 'full') {
    for (const unused of this._buildSteps(lv, anchor, fadeMode)) { /* synchronous utility */ }
  }

  *_buildSteps(lv, anchor, fadeMode = 'full') {
    const geo = lv.geo.clone();
    this._stagingGeometry = geo;
    const GRID = this.grid;
    const R = this.field.phys.radiusKm;
    const u = anchor.clone().normalize();
    const east = Math.abs(u.y) > 0.999
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0).cross(u).normalize();
    const north = new THREE.Vector3().crossVectors(u, east);
    // ：（fround  fp32  → mesh.position ），
    // （ ≤ 2×extent，，R9-2a ）
    const origin = new THREE.Vector3(
      Math.fround(u.x * R), Math.fround(u.y * R), Math.fround(u.z * R)
    );
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    const wat = geo.attributes.water.array;
    const dfd = geo.attributes.detfade.array;
    const dir = new THREE.Vector3();
    const c = new THREE.Color();
    const dirs = lv.dirs ??= new Float32Array((GRID + 1) * (GRID + 1) * 3);
    const hs = lv.heights ??= new Float64Array((GRID + 1) * (GRID + 1));
    const isO = this.field.sp.ocean;
    let k = 0;
    for (let y = 0; y <= GRID; y++) {
      for (let x = 0; x <= GRID; x++, k++) {
        const fx = ((x / GRID) * 2 - 1) * lv.extent;
        const fy = ((y / GRID) * 2 - 1) * lv.extent;
        dir.copy(u).addScaledVector(east, fx / R).addScaledVector(north, fy / R).normalize();
        let h = this.field.height(dir);
        // ：****，。
        // ：""
        // ""（ baseOffset， terrainReliefOffset）。
        // ，——300km 
        // （、）。
        if (lv.extent >= R * 0.2 && !this.field.deformed) {
          const edge = Math.max(Math.abs(fx), Math.abs(fy)) / lv.extent;
          //  30%（ 14%）： | − |，，
          // 14% ；30% 。
          const blend = sstep(0.7, 1.0, edge);
          if (blend > 0) {
            h = h * (1 - blend) + this.field.baseSphereRadius(dir) * blend;
            dfd[k] = 1 - blend;   // 
          }
        }
        hs[k] = h;
        dirs[k * 3] = dir.x; dirs[k * 3 + 1] = dir.y; dirs[k * 3 + 2] = dir.z;
        pos[k * 3] = dir.x * h - origin.x;
        pos[k * 3 + 1] = dir.y * h - origin.y;
        pos[k * 3 + 2] = dir.z * h - origin.z;
        wat[k] = isO && this.field.isOcean(dir) ? 1 : 0;
      }
      yield;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.water.needsUpdate = true;
    geo.attributes.detfade.needsUpdate = true;
    geo.computeVertexNormals();
    geo.attributes.normal.needsUpdate = true;
    // ：（）（PBR ）
    const nrm = geo.attributes.normal.array;
    const slp = geo.attributes.slope.array;
    k = 0;
    for (let y = 0; y <= GRID; y++) {
      for (let x = 0; x <= GRID; x++, k++) {
        dir.set(dirs[k * 3], dirs[k * 3 + 1], dirs[k * 3 + 2]);
        const ndotu = nrm[k * 3] * dir.x + nrm[k * 3 + 1] * dir.y + nrm[k * 3 + 2] * dir.z;
        const slope = 1 - Math.min(1, Math.max(0, ndotu));
        this.field.color(dir, hs[k], slope, c);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        slp[k] = slope;
      }
      yield;
    }
    geo.attributes.color.needsUpdate = true;
    geo.attributes.slope.needsUpdate = true;
    if (fadeMode === 'none' || fadeMode === 'dem') {
      lv.uFade.value = 1; // ：，
    } else {
      //  0  0.55： 0 
      // ，""——
      // 。0.55 ， 600ms。
      // ：，****（
      // ），。
      lv.fadeFrom = fadeMode === 'dem' ? 0.55 : 0.55;
      lv.fadeDur = fadeMode === 'dem' ? 450 : 600;
      lv.uFade.value = lv.fadeFrom;
      lv.fadeStart = performance.now();
    }
    const previous = lv.geo;
    lv.geo = geo; lv.mesh.geometry = geo;
    lv.origin.copy(origin); lv.mesh.position.copy(origin);
    lv.uPatchRel.value.copy(origin).sub(this.noiseOriginU.value);
    previous.dispose();
    this._stagingGeometry = null;
    lv.built = true;
  }

  dispose() {
    this._buildTask = null;
    this._stagingGeometry?.dispose();
    this._stagingGeometry = null;
    for (const lv of this.levels) { lv.geo.dispose(); lv.mesh.material.dispose(); }
    this.rocks.dispose();
  }
}

/** ：，/ TerrainPatchSet， DEM  */
export class TerrainManager {
  constructor() {
    this.fields = new Map();     // bodyId -> HeightField
    this.demSources = new Map(); // bodyId -> DEMTileSource（ LOLA /  MOLA）
    this.active = null;          // { bodyId, patches }
    this.getMapData = null;      //  builder ：bodyId -> ImageData|null
    this.physOf = null;          // bodyId -> phys
    this.meshOf = null;          // bodyId -> （）
  }

  /**  DEM （/）， null（） */
  _createDEMFor(bodyId) {
    if (!DEMTileSource.hasSource(bodyId)) return null;
    const src = new DEMTileSource(bodyId);
    this.demSources.set(bodyId, src);
    return src;
  }

  field(bodyId) {
    let f = this.fields.get(bodyId);
    if (!f) {
      f = new HeightField(bodyId, this.physOf(bodyId), this.getMapData?.(bodyId) ?? null);
      //  DEM （ LOLA /  MOLA）；，
      const dem = this.demSources.get(bodyId) ?? this._createDEMFor(bodyId);
      if (dem) f.setDEMSource(dem);
      this.fields.set(bodyId, f);
      if (this.fields.size > 4) {
        const oldest = [...this.fields.keys()].find(id => id !== bodyId && id !== this.active?.bodyId);
        if (oldest) this.fields.delete(oldest);
      }
    }
    const map = this.getMapData?.(bodyId);
    if (map && map !== f.map) {
      f.map = map;
      if (this.active?.bodyId === bodyId) this.active.patches.markDirty();
    }
    return f;
  }

  /** //：（ = ，，R10） */
  heightAt(bodyId, dirLocal) {
    return this.field(bodyId).height(dirLocal);
  }

  /** （）——（R10） */
  heightSolidAt(bodyId, dirLocal) {
    return this.field(bodyId).heightSolid(dirLocal);
  }

  /** （/） */
  isWater(bodyId, dirLocal) {
    const f = this.field(bodyId);
    return !!(f.sp.ocean && f.isOcean(dirLocal));
  }

  /** DEM （ 1×1 ）： height() ，
   * ——。/，
   * ""。 */
  baseReady(bodyId) {
    if (!DEMTileSource.hasSource(bodyId)) return true;
    const dem = this.demSources.get(bodyId);
    if (!dem) return false; // （）
    return dem.isOffline || dem.cache.size > 0;
  }

  /**
   *  DEM （=，=）。
   *
   * ： L8， LOLA 
   * （5760×2880） L4， L5， L6（ demTiles.js  maxLevel ）。
   * ，****——，
   *  LOD 。
   *
   * @param {number} distKm 
   * @param {number} ceiling  DEM 
   */
  _demLevelForDistance(distKm, ceiling = 8) {
    let want;
    if (distKm < 1) want = 8;        // ：
    else if (distKm < 5) want = 7;
    else if (distKm < 20) want = 6;
    else if (distKm < 80) want = 5;
    else if (distKm < 200) want = 4;
    else if (distKm < 500) want = 3;
    else want = 2;                   // ：（）
    return Math.min(want, ceiling);
  }

  /** （） */
  _showBase(bodyId) {
    const mesh = this.meshOf?.(bodyId);
    if (mesh) mesh.material.visible = true;
  }

  update(nearest, camLocalDir, timeSec = 0) {
    // （#18 ： LOD ，）
    // ： 1147km、 610km、 500km；
    let wantId = null;
    if (nearest && nearest.landable) {
      const actDist = TerrainPatchSet.actDist(this.physOf(nearest.id).radiusKm);
      if (nearest.distSurface < actDist) wantId = nearest.id;
    }

    if (this.active && this.active.bodyId !== wantId) {
      this._showBase(this.active.bodyId); // 
      this.active.patches.group.removeFromParent();
      this.active.patches.dispose();
      this.active = null;
    }
    if (wantId && !this.active) {
      const patches = new TerrainPatchSet(this.field(wantId));
      this.meshOf(wantId).add(patches.group);
      this.active = { bodyId: wantId, patches };
      //  DEM （ 1×1 ），
      const dem = this.demSources.get(wantId);
      if (dem) dem.preloadBase();
    }
    if (this.active && camLocalDir) {
      this.active.patches.update(camLocalDir, timeSec);
      // ：0.6km （//），2.5km 
      // ，
      if (nearest) {
        const wf = 1 - THREE.MathUtils.smoothstep(nearest.distSurface, 0.6, 2.5);
        this.active.patches.uWaterFade.value = wf;
        // ：（ = R + 1m）
        const fld = this.field(this.active.bodyId);
        this.active.patches.uUnderwater.value =
          (fld.sp.ocean && nearest.distSurface < 0.0005 && fld.isOcean(camLocalDir)) ? 1 : 0;
      }
      // DEM ： + 
      const dem = this.demSources.get(this.active.bodyId);
      if (dem) {
        dem.preloadBase(); // retries are throttled in the tile source
        const dist = nearest ? nearest.distSurface : 100;
        dem.setPriority(1 / Math.max(0.1, dist)); // =
        dem.requestTiles(camLocalDir, this._demLevelForDistance(dist, dem.config?.maxLevel ?? 0));
        //  → （ update ）
        if (dem.hasNewTiles) {
          this.active.patches.markDirty();
          dem.clearDirty();
        }
      }
    }
  }
}
