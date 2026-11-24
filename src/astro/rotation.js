// Planetary rotation: IAU/WGCCRE rotation models (pole RA/Dec + prime meridian angle W = W0 + W_dot*d).
// Ensures physically accurate subsolar longitude and terminator positioning.
// Satellites are tidally locked (z = orbit normal, prime meridian points to parent planet).
//
// Coordinate chain: Body-fixed --IAU--> Equatorial J2000(ICRF) --Obliquity--> Ecliptic J2000 --M--> Three.js world
// where M:(x,y,z)->(x,z,-y) (rotation of -90 deg around X axis).
// (Three.js SphereGeometry: prime meridian = local +X, north pole = +Y, east longitude = -Z).

import { DEG } from './kepler.js';
import { J2000 } from './time.js';

/** Obliquity of the ecliptic at J2000 */
export const OBLIQUITY = 23.43928 * DEG;

/** Mean obliquity of the ecliptic (secular decrease -46.8"/century; IAU 1976/2000): eps = eps0 - 0.013 deg * T */
export function obliquityAt(jdTT) {
  const T = (jdTT - J2000) / 36525;
  return (23.43928 - 0.0130042 * T) * DEG;
}

// IAU 2009/2015 rotation constants (degrees; d = days from J2000, T = Julian centuries)
// [RA0, RAdot(/T), Dec0, Decdot(/T), W0, Wdot(/d)]
export const IAU_ROTATION = {
  sun:     [286.13, 0, 63.87, 0, 84.176, 14.1844000],
  mercury: [281.0097, -0.0328, 61.4143, -0.0049, 329.5469, 6.1385025],
  venus:   [272.76, 0, 67.16, 0, 160.20, -1.4813688],
  earth:   [0.00, -0.641, 90.00, -0.557, 190.147, 360.9856235],
  mars:    [317.68143, -0.1061, 52.88650, -0.0609, 176.630, 350.89198226],
  jupiter: [268.056595, -0.006499, 64.495303, 0.002413, 284.95, 870.5360000],
  saturn:  [40.589, -0.036, 83.537, -0.004, 38.90, 810.7939024],
  uranus:  [257.311, 0, -15.175, 0, 203.81, -501.1600928],
  neptune: [299.36, 0, 43.46, 0, 253.18, 536.3128492],
  pluto:   [132.993, 0, -6.163, 0, 302.695, 56.3625225],
  // Moon (IAU 2015). Using the true IAU rotation model naturally reproduces optical libration:
  // 59% of the lunar surface is visible from Earth over time rather than exactly 50%.
  moon:    [269.9949, 0.0031, 66.5392, 0.0130, 38.3213, 13.17635815],
};

const cos = Math.cos, sin = Math.sin;

/** 3x3 matrix utilities (row-major 9-element array) */
function matMul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
const Rx = (t) => [1, 0, 0, 0, cos(t), sin(t), 0, -sin(t), cos(t)];   // v' = Rx(t)*v (coordinate system rotation about X)
const Rz = (t) => [cos(t), sin(t), 0, -sin(t), cos(t), 0, 0, 0, 1];

export function applyMat(m, v) {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}
export function transpose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/**
 * Body-fixed frame -> Ecliptic J2000 rotation matrix.
 * ICRF -> body-fixed = Rz(W)*Rx(90 deg - Dec)*Rz(90 deg + RA); invert to get body-fixed -> ICRF, then premultiply Rx(-eps) to transform to ecliptic frame.
 */
export function bodyToEclipticMatrix(bodyId, jdTT) {
  const p = IAU_ROTATION[bodyId];
  if (!p) return null;
  const d = jdTT - J2000;
  const T = d / 36525;
  const RA = (p[0] + p[1] * T) * DEG;
  const Dec = (p[2] + p[3] * T) * DEG;
  const W = (p[4] + p[5] * d) * DEG;
  const icrfToBody = matMul(Rz(W), matMul(Rx(Math.PI / 2 - Dec), Rz(Math.PI / 2 + RA)));
  const bodyToIcrf = transpose(icrfToBody);
  // Equatorial -> Ecliptic: Rx is a passive rotation matrix; eps uses mean obliquity at epoch
  // for correct pole positions across millennia
  return matMul(Rx(obliquityAt(jdTT)), bodyToIcrf);
}

/** Spin axis (north pole) direction, unit vector in Ecliptic J2000 */
export function poleEcliptic(bodyId, jdTT) {
  const m = bodyToEclipticMatrix(bodyId, jdTT);
  return { x: m[2], y: m[5], z: m[8] }; // Image of body-fixed z-axis
}

/**
 * Subsolar longitude and latitude (planetographic coordinates in degrees) - for accuracy verification.
 * @param {object} sunDirEcl Unit vector pointing from planet to Sun (Ecliptic J2000)
 */
export function subsolarPoint(bodyId, jdTT, sunDirEcl) {
  const eclToBody = transpose(bodyToEclipticMatrix(bodyId, jdTT));
  const s = applyMat(eclToBody, sunDirEcl);
  const lon = Math.atan2(s.y, s.x) / DEG;        // Positive east longitude
  const lat = Math.asin(Math.max(-1, Math.min(1, s.z))) / DEG;
  return { lon, lat };
}

/**
 * Body-fixed -> Ecliptic matrix for tidally locked satellites: z = orbit normal nHat, prime meridian (+x) points toward parent planet.
 * @param {object} nHat Orbit normal (Ecliptic J2000)
 * @param {object} toParent Unit vector from satellite to parent planet
 */
export function tidalLockMatrix(nHat, toParent) {
  // x = projection of vector to parent planet onto orbital plane
  let dot = toParent.x * nHat.x + toParent.y * nHat.y + toParent.z * nHat.z;
  let x = { x: toParent.x - dot * nHat.x, y: toParent.y - dot * nHat.y, z: toParent.z - dot * nHat.z };
  const len = Math.hypot(x.x, x.y, x.z) || 1;
  x = { x: x.x / len, y: x.y / len, z: x.z / len };
  const y = { // y = z × x
    x: nHat.y * x.z - nHat.z * x.y,
    y: nHat.z * x.x - nHat.x * x.z,
    z: nHat.x * x.y - nHat.y * x.x,
  };
  // Column vectors are images of body-fixed basis vectors -> row-major matrix
  return [x.x, y.x, nHat.x, x.y, y.y, nHat.y, x.z, y.z, nHat.z];
}
