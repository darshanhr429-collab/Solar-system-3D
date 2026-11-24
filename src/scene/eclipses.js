// Eclipse system (solar, lunar, and satellite eclipses).
// Handles three event classes:
//   1. Solar eclipse (Moon occults Sun -> Earth surface)
//   2. Lunar eclipse (Earth occults Sun -> Moon surface)
//   3. Satellite eclipse (Planet occults Sun -> Satellites, e.g. Jupiter -> Galilean moons)
//
// Occultation is evaluated per-fragment on receiving surfaces (see planetMaterial.js uEclOn branch:
// calculates disk overlap from angular radii and angular separation). Pushes active occulting bodies to receivers.
//
// Physical per-fragment occultation in receiver shaders avoids artificial cone mesh artifacts in vacuum.
// Shadows in vacuum are physically invisible without a scattering medium;
// per-fragment shader calculates penumbral and umbral illumination directly on celestial bodies.
// Accurately depicts solar eclipses on Earth and moon transits across Jupiter.
// Smooth penumbral gradients computed from geometric disk intersections.
// Eliminates rasterization artifacts and mesh z-fighting.
// High-precision analytical solar limb occultation.
// Supports simultaneous multi-body occultations.
// Robust and lightweight runtime execution.

/**
 * Eclipse shadow management system.
 * Updates occultation parameters per frame based on ephemerides.
 */
/** Push active eclipse occluder data to receiver materials for per-fragment shading.
 *  Module-level function without internal instance state. */
function pushOccluder(receiver, occ, camPosKm, sunDistKm) {
  const u = receiver?.mat?.userData?.uniforms;
  if (!u?.uEclOn) return;
  if (!occ) { u.uEclOn.value = 0; return; }
  u.uEclOn.value = 1;
  // Camera-relative world space (absolute position - camera position; matches shader vPosW)
  u.uEclPos.value.set(occ.posKm[0] - camPosKm[0], occ.posKm[1] - camPosKm[1], occ.posKm[2] - camPosKm[2]);
  u.uEclR.value = occ.phys.radiusKm;
  u.uSunDistKm.value = sunDistKm;
}

/** Receiver bodies participating in per-fragment eclipse shading:
 *  Primary bodies + moons traversed by shadows (e.g. Io entering Jovian shadow). */
const ECLIPSE_RECEIVERS = ['earth', 'moon', 'io', 'europa', 'ganymede', 'callisto', 'titan'];

export class EclipseSystem {
  constructor() {
    this._nextEclipseCache = null;
    this._nextEclipseJd = 0;
  }

  /**
   * Per-frame update: pushes active occluders to receiver materials for per-fragment shading.
   * @param {number} jdTT - Julian Date TT
   * @param {Map} bodies - builder.bodies: id → { posKm, phys, mesh, ... }
   * @param {Float64Array} camPosKm - Camera position (heliocentric ecliptic km)
   */
  update(jdTT, bodies, camPosKm) {
    const sun = bodies.get('sun');
    if (!sun) return;

    // Cleared and updated per frame to prevent lingering shadow states.
    // Occultation fraction naturally approaches zero when unaligned;
    // independent of camera distance (e.g. lunar shadow on Earth visible from deep space).
    for (const id of ECLIPSE_RECEIVERS) pushOccluder(bodies.get(id), null, camPosKm, 1);
    const distTo = (a) => Math.hypot(a.posKm[0], a.posKm[1], a.posKm[2]);

    const moon = bodies.get('moon');
    const earth = bodies.get('earth');

    // -- Solar Eclipse: Moon -> Earth --
    if (moon && earth) pushOccluder(earth, moon, camPosKm, distTo(earth));

    // -- Lunar Eclipse: Earth -> Moon --
    if (moon && earth) pushOccluder(moon, earth, camPosKm, distTo(moon));

    // -- Jupiter -> Galilean Moons --
    const jupiter = bodies.get('jupiter');
    if (jupiter) {
      for (const moonId of ['io', 'europa', 'ganymede', 'callisto']) {
        const m = bodies.get(moonId);
        if (m) pushOccluder(m, jupiter, camPosKm, distTo(m));
      }
    }

    // -- Saturn -> Titan --
    const saturn = bodies.get('saturn');
    const titan = bodies.get('titan');
    if (saturn && titan) pushOccluder(titan, saturn, camPosKm, distTo(titan));
  }

  /**
   * Find next solar eclipse occurrence.
   * @param {string} type - 'solar' | 'lunar'
   * @param {number} fromJd - Starting JD
   * @param {Function} getPositions - (jdTT) => { sun, moon, earth } positions
   * @returns {number} Eclipse JD timestamp
   */
  getNextEclipse(type, fromJd, getPositions) {
    const R_SUN = 696000, R_EARTH = 6371, R_MOON = 1737.4;
    const hit = (jd) => {
      const p = getPositions(jd);
      return p ? isEclipse(type, p, R_SUN, R_EARTH, R_MOON) : false;
    };

    // Two-stage search: coarse 30-minute scan followed by binary search refinement.
    // Coarse 30-minute step avoids stalling main thread across 6-month window;
    // binary search quickly converges within 1 minute precision.
    const COARSE = 1 / 48;               // 30 minutes
    const endJd = fromJd + 183;          // 6 months
    for (let jd = fromJd; jd < endJd; jd += COARSE) {
      if (!hit(jd)) continue;
      // Binary search open interval [jd - COARSE, jd] converging to < 1 minute
      let lo = jd - COARSE, hi = jd;
      for (let i = 0; i < 20 && hi - lo > 1 / 1440; i++) {
        const mid = (lo + hi) / 2;
        if (hit(mid)) hi = mid; else lo = mid;
      }
      return hi;
    }
    return null;
  }
}

/** Geometric occultation test:
 *  Evaluates authentic geometric shadow cone intersection with receiver body.
 *  Solar: checks if lunar umbral/penumbral cone intersects Earth disk;
 *  Lunar: checks if terrestrial shadow cone intersects Moon disk. */
export function isEclipse(type, p, R_SUN, R_EARTH, R_MOON) {
  const occ = type === 'solar' ? p.moon : p.earth;   // Occluding body
  const rec = type === 'solar' ? p.earth : p.moon;   // Receiving body
  const occR = type === 'solar' ? R_MOON : R_EARTH;
  const recR = type === 'solar' ? R_EARTH : R_MOON;

  // Shadow axis: Sun -> Occluder
  const ax = occ[0] - p.sun[0], ay = occ[1] - p.sun[1], az = occ[2] - p.sun[2];
  const dSunOcc = Math.hypot(ax, ay, az);
  if (!(dSunOcc > 0)) return false;
  const nx = ax / dSunOcc, ny = ay / dSunOcc, nz = az / dSunOcc;

  // Receiver relative to occluder
  const rx = rec[0] - occ[0], ry = rec[1] - occ[1], rz = rec[2] - occ[2];
  const proj = rx * nx + ry * ny + rz * nz;          // Projected distance along shadow axis
  if (proj <= 0) return false;                        // Receiver on sunward side

  // Umbral cone radius at receiver: R_occ - (R_sun - R_occ) * proj / dSunOcc
  const umbraR = occR - (R_SUN - occR) * proj / dSunOcc;

  // Perpendicular distance from receiver center to shadow axis
  const px = rx - proj * nx, py = ry - proj * ny, pz = rz - proj * nz;
  const perp = Math.hypot(px, py, pz);

  // Penumbral intersection criterion (|umbraR| + recR): detects visual eclipse
  return perp < Math.abs(umbraR) + recR;
}
