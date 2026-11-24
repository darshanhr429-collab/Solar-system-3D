// Empirical small body shape models (PDS SBN / Thomas et al.).
//
// Replaces procedural ellipsoids with empirical radius grids derived from flyby imagery
// (Phobos, Deimos, Janus, Epimetheus, Hyperion, etc.).
// Measured crater features (like Stickney crater on Phobos) are authentic geometric depressions
// rather than flat textures on an idealized ellipsoid.
//
// Data format (see tools/fetch-shapes.mjs): magic 'SHP1' + nLat/nLon(u32) +
// scale/mn(f32) + uint16 radii. 2 deg x 2 deg grid, planetocentric, IAU west longitude
// (Prime meridian W = ..., matching bodies.js rotation models).
//
// Synchronous reading on hot path: loaded once during application initialization.

const grids = new Map();   // id -> { nLat, nLon, scale, mn, data: Uint16Array }

/** Called once during startup. Gracefully falls back to procedural shape on failure. */
export async function loadShapeModels(ids, base = '') {
  await Promise.all(ids.map(async (id) => {
    try {
      const res = await fetch(`${base}data/shapes/${id}.bin`);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 20) return;
      const dv = new DataView(buf);
      if (dv.getUint32(0, false) !== 0x53485031) return;   // 'SHP1'
      const nLat = dv.getUint32(4, true), nLon = dv.getUint32(8, true);
      const scale = dv.getFloat32(12, true), mn = dv.getFloat32(16, true);
      if (!nLat || !nLon || !(scale > 0) || 20 + nLat * nLon * 2 > buf.byteLength) return;
      const data = new Uint16Array(nLat * nLon);
      for (let i = 0; i < data.length; i++) data[i] = dv.getUint16(20 + i * 2, true);
      grids.set(id, { nLat, nLon, scale, mn, data });
    } catch { /* Fallback */ }
  }));
  return grids.size;
}

export function hasShapeModel(id) { return grids.has(id); }

/**
 * Body-fixed unit direction -> empirical radius (km).
 * Planetocentric latitude (= asin(y)); longitude follows terrain.sampleMap convention.
 * Bilinear interpolation avoids derivative discontinuities across 2 deg grid lines.
 * Smooth radius continuity across planetary coordinates.
 */
export function shapeRadiusKm(id, dir) {
  const g = grids.get(id);
  if (!g) return null;
  const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  const lon = Math.atan2(-dir.z, dir.x);
  // Latitude -> row (uniform -90..90), Longitude -> col (uniform 0..360, lon in [-pi, pi] mapped to [0, 360))
  let fy = (0.5 - lat / Math.PI) * (g.nLat - 1);
  let fx = ((lon / Math.PI + 1) * 0.5) * (g.nLon - 1);
  fy = Math.max(0, Math.min(g.nLat - 1.0001, fy));
  // Wrapped longitude: col nLon-1 and col 0 represent same meridian; wrap with modulo
  const nLonWrap = g.nLon - 1;
  fx = ((fx % nLonWrap) + nLonWrap) % nLonWrap;
  const y0 = Math.floor(fy), x0 = Math.floor(fx);
  const ty = fy - y0, tx = fx - x0;
  const x1 = (x0 + 1) % nLonWrap;
  const y1 = Math.min(y0 + 1, g.nLat - 1);
  const at = (y, x) => g.mn + g.data[y * g.nLon + x] * g.scale;
  const a = at(y0, x0), b = at(y0, x1), c = at(y1, x0), d = at(y1, x1);
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}
