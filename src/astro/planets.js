// Planetary ephemerides: Keplerian element tables from JPL Standish 'Approximate Positions of the Planets',
// valid 1800 AD - 2050 AD, arcminute-level accuracy. Elements relative to Ecliptic J2000.
// a(AU)  e  I(deg)  L(deg)  varpi(deg)  Omega(deg), second row indicates rate of change per Julian century.
//
// High-precision mode (issue #55): switches to truncated VSOP87 series (+/-3000 years < 0.1 deg),
// defaulting to VSOP87D; interpolated JPL ephemeris takes precedence when available.

import { elementsToEcliptic } from './kepler.js';
import { centuriesTT } from './time.js';
import { moonGeocentric } from './moon.js';
import { planetaryPositionVSOP } from './vsop87.js';
import { sampledPosition } from './sampledEphemeris.js';

const TABLE = {
  mercury: {
    el: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  venus: {
    el: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    rate: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  },
  emb: { // Earth-Moon Barycenter
    el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  },
  mars: {
    el: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  jupiter: {
    el: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  saturn: {
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  uranus: {
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  neptune: {
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  },
  pluto: {
    el: [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rate: [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  },
};

export const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/** Lunar mass / (Earth + Moon mass), used to derive geocenter from Earth-Moon barycenter */
const MOON_MASS_FRACTION = 1 / 82.300577 / (1 + 1 / 82.300577);

/**
 * High-precision ephemeris toggle: true = truncated VSOP87 (+/-3000 yrs < 0.1 deg, enabled by default),
 * false = Standish elements (1800-2050 AD baseline, fast fallback for low-end devices).
 * Truncated VSOP87 per-frame overhead is negligible on modern hardware and excels at long-term extrapolation.
 */
let useHighPrecision = true;

/** Switch ephemeris source: true -> VSOP87 (default), false -> Standish (low-end fallback) */
export function setHighPrecision(v) { useHighPrecision = !!v; }
/** Whether VSOP87 high-precision ephemerides are currently active */
export function isHighPrecision() { return useHighPrecision; }

/** Direct position evaluation from orbital element tables (without special Earth treatment) */
function tablePosition(key, jdTT) {
  const T = centuriesTT(jdTT);
  const { el, rate } = TABLE[key];
  return elementsToEcliptic({
    aAU: el[0] + rate[0] * T,
    e: el[1] + rate[1] * T,
    iDeg: el[2] + rate[2] * T,
    LDeg: el[3] + rate[3] * T,
    periDeg: el[4] + rate[4] * T,
    nodeDeg: el[5] + rate[5] * T,
  });
}

/**
 * Planetary heliocentric Ecliptic J2000 coordinates (km).
 * Defaults to VSOP87D. Only Standish EMB elements require subtracting lunar barycentric offset.
 */
export function planetPosition(name, jdTT) {
  const sampled = sampledPosition(name, jdTT);
  if (sampled) return sampled;
  // VSOP87 high-precision path
  if (useHighPrecision) {
    // The VSOP87D .ear series is Earth, not EMB (CDS VI/81).
    // Subtracting the Moon here applied the barycentre correction twice.
    return planetaryPositionVSOP(name, jdTT);
  }

  // Standish elements path (baseline)
  if (name === 'earth') {
    const emb = tablePosition('emb', jdTT);
    const m = moonGeocentric(jdTT);
    return {
      x: emb.x - m.x * MOON_MASS_FRACTION,
      y: emb.y - m.y * MOON_MASS_FRACTION,
      z: emb.z - m.z * MOON_MASS_FRACTION,
    };
  }
  return tablePosition(name, jdTT);
}

/** Orbital period (Julian years) derived from mean longitude rate, used for orbit line sampling */
export function orbitalPeriodYears(name) {
  const key = name === 'earth' ? 'emb' : name;
  return 360 / (TABLE[key].rate[3] / 100);
}

/**
 * Orbit line sampling: trace a full orbital revolution from the current epoch using real ephemeris evaluations
 * (including VSOP87 periodic terms and Earth-Moon barycentric wobble).
 * Avoids systematic divergence between static Keplerian ellipses and actual planetary trajectories.
 * Numerical tracking guarantees the orbit line always intersects the planet body accurately.
 * Uniform time sampling yields higher point density near perihelion
 * in accordance with Kepler's second law.
 */
export function orbitPoints(name, jdTT, n = 512) {
  const key = name === 'earth' ? 'emb' : name;
  const T = centuriesTT(jdTT);
  const { el, rate } = TABLE[key];
  const aAU = el[0] + rate[0] * T;
  // Sidereal period (days) from Gaussian gravitational constant: sqrt(a^3) * tropical year
  const periodDays = Math.sqrt(aAU * aAU * aAU) * 365.256898326;
  const pts = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = planetPosition(name, jdTT + (i / (n - 1)) * periodDays);
    pts[i * 3] = p.x;
    pts[i * 3 + 1] = p.y;
    pts[i * 3 + 2] = p.z;
  }
  return pts;
}
