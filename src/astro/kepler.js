// Keplerian orbital mechanics: Kepler's equation solver and orbital elements -> Ecliptic Cartesian coordinates.

export const DEG = Math.PI / 180;
export const KM_PER_AU = 149597870.7;

/** Normalize angle to [-pi, pi) */
export function wrapPI(a) {
  a = a % (2 * Math.PI);
  if (a >= Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Normalize angle to [0, 360) degrees */
export function wrap360(deg) {
  deg = deg % 360;
  return deg < 0 ? deg + 360 : deg;
}

/**
 * Solve Kepler's equation: M = E - e*sin(E).
 * Uses Newton-Raphson iteration with bisection fallback for high eccentricity.
 * @param {number} M Mean anomaly (rad)
 * @param {number} e Eccentricity [0,1)
 * @returns {number} Eccentric anomaly E (rad)
 */
export function solveKepler(M, e) {
  M = wrapPI(M);
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 30; i++) {
    const f = E - e * Math.sin(E) - M;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-13) return E;
  }
  // Bisection fallback (rarely triggered theoretically)
  let lo = M - e, hi = M + e;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (mid - e * Math.sin(mid) - M > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Classical orbital elements -> heliocentric Ecliptic J2000 Cartesian coordinates (km).
 * @param {object} el { aAU, e, iDeg, LDeg, periDeg(ϖ), nodeDeg(Ω) }
 */
export function elementsToEcliptic(el) {
  const { aAU, e, iDeg, LDeg, periDeg, nodeDeg } = el;
  const omega = (periDeg - nodeDeg) * DEG; // Argument of periapsis omega
  const M = (LDeg - periDeg) * DEG;        // Mean anomaly
  const E = solveKepler(M, e);

  // Orbital plane coordinates (periapsis direction along x')
  const xp = aAU * (Math.cos(E) - e);
  const yp = aAU * Math.sqrt(1 - e * e) * Math.sin(E);

  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cO = Math.cos(nodeDeg * DEG), sO = Math.sin(nodeDeg * DEG);
  const ci = Math.cos(iDeg * DEG), si = Math.sin(iDeg * DEG);

  const x = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
  const y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
  const z = (sw * si) * xp + (cw * si) * yp;

  return { x: x * KM_PER_AU, y: y * KM_PER_AU, z: z * KM_PER_AU };
}
