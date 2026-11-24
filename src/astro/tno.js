// Trans-Neptunian Objects (TNOs) ephemeris: real JPL approximate orbital elements (epoch J2000.0).
// Includes classical Kuiper Belt objects, scattered disc objects, and extended scattered disc (ETNO), totaling 28 dwarf-planet-scale bodies.
// Format matches planets.js: el=[a(AU), e, i(°), L(°), ϖ(°), Ω(°)], rate=[...]/Julian century
// Source: JPL Small Body Database + MPC (Brown et al. 2004, Trujillo & Sheppard 2014, etc.)

import { elementsToEcliptic } from './kepler.js';
import { centuriesTT } from './time.js';
import { TNO_ORBITS, TNO_EPOCH_JD } from './tnoOrbits.generated.js';
import { sampledPosition } from './sampledEphemeris.js';

// el: [a, e, i, L, ϖ, Ω]  (all degrees; L = M + ϖ at J2000.0)
// rate: [da, de, di, dL, dϖ, dΩ] per Julian century (only dL significant for TNOs)
const TABLE = {
  // ── Recognized Dwarf Planets ──────────────────────────────────────────
  // Ceres: IAU dwarf planet in the asteroid belt.
  // Although not in the TNO zone, the data structure here is fully applicable.
  // Orbital elements at J2000: a=2.7675AU, e=0.07582, i=10.593 deg,
  // node=80.305 deg, peri=73.597 deg -> omega=353.292 deg, L=95.989 deg;
  // Mean motion n=0.2141 deg/day ≈ 7820 deg/century (rate unit is per Julian century).
  ceres: {
    // Note component 5 is longitude of perihelion ϖ (not argument of periapsis ω).
    // elementsToEcliptic computes omega = periDeg - nodeDeg internally.
    el: [2.7675, 0.07582, 10.593, 95.989, 73.597, 80.305],
    rate: [0, 0, 0, 7820.0, 0, 0],
    nameZh: 'Ceres', nameEn: 'Ceres', radiusKm: 469.7,
    palette: 'gray', dwarfPlanet: true,
    desc: 'The largest object in the asteroid belt and the only dwarf planet in the inner Solar System. Measuring about 940 km across, it contains roughly one-third the mass of the entire main belt. NASA\'s Dawn mission discovered carbonate salt deposits and evidence of subsurface briny activity.',
  },
  eris: {
    el: [67.864, 0.44068, 44.045, 29.59, 187.59, 35.95],
    rate: [0, 0, 0, 64.4, 0, 0],
    nameZh: 'Eris', nameEn: 'Eris', radiusKm: 1163,
    palette: 'ice',
    desc: 'The most massive known dwarf planet, with a diameter of ~2,326 km. Its discovery precipitated Pluto\'s reclassification as a dwarf planet. Covered in methane and nitrogen frost with a high albedo. Scattered disc object with an orbital period of ~559 years.',
  },
  sedna: {
    el: [506.8, 0.84320, 11.930, 92.91, 95.31, 144.26],
    rate: [0, 0, 0, 3.16, 0, 0],
    nameZh: 'Sedna', nameEn: 'Sedna', radiusKm: 497,
    palette: 'mars',
    desc: 'One of the reddest objects in the Solar System, rich in surface tholins. Orbital period of ~11,400 years with a perihelion at 76 AU far beyond the Kuiper Belt, belonging to the inner Oort Cloud or detached disc.',
  },
  makemake: {
    el: [45.436, 0.16200, 29.007, 150.12, 15.62, 79.62],
    rate: [0, 0, 0, 117.4, 0, 0],
    nameZh: 'Makemake', nameEn: 'Makemake', radiusKm: 717,
    palette: 'dark',
    desc: 'One of the brightest Kuiper Belt objects, named after the Rapa Nui creator deity. Reddish surface covered in methane ice and ethane with a high albedo of ~77%. Accompanied by a faint moon, MK2.',
  },
  haumea: {
    el: [43.218, 0.18890, 28.213, 144.10, 2.10, 121.90],
    rate: [0, 0, 0, 126.8, 0, 0],
    // Radius uses the geometric mean of the three semi-axes (equal-volume sphere).
    // Shape defined by axes: 3.9 h rotation period stretches Haumea into a triaxial ellipsoid.
    // Flattest known large body in the Solar System.
    // Rings: Ortiz et al. 2017 stellar occultation discovered a narrow ring (radius 2287 km, width ~70 km).
    // Rendered narrow ring system.
    rings: { innerKm: 2252, outerKm: 2322, opacity: 0.9, tint: [0.85, 0.88, 0.95],
      narrow: [[2287, 70, 0.6]] },   // [center km, full width km, opacity]
    // Semi-axes from Ortiz et al. 2017 Jacobi ellipsoid solution.
    nameZh: 'Haumea', nameEn: 'Haumea', radiusKm: 798,
    axes: [1161, 852, 513],   // Semi-axes in km (a/b/c)
    palette: 'ice',
    desc: 'The fastest-rotating large body in the Solar System (rotation period of only 3.9 hours), pulled into a triaxial ellipsoid shape (approx. 2320×1700×1030 km) by centrifugal force. Features crystalline water ice, a narrow ring system, and two moons (Hiʻiaka and Namaka). Named after the Hawaiian goddess of childbirth.',
  },
  quaoar: {
    el: [43.694, 0.03560, 7.987, 184.04, 336.44, 188.94],
    rate: [0, 0, 0, 124.6, 0, 0],
    nameZh: 'Quaoar', nameEn: 'Quaoar', radiusKm: 555,
    palette: 'pluto',
    // Rings: Morgado et al. 2023, radius ~4057 km (well beyond Roche limit).
    // Extremely narrow (~5 km), rendered as a fine line.
    rings: { innerKm: 4040, outerKm: 4074, opacity: 0.9, tint: [0.9, 0.92, 1.0],
      narrow: [[4057, 5, 0.85]] },   // Narrow (~5 km)
    desc: 'A classical cold Kuiper belt object with surface methane, ethane, and crystalline water ice. In 2023, it was discovered to possess a dense ring located well beyond its Roche limit, challenging classical theories of ring formation. Named after the Tongva creator deity.',
  },
  gonggong: {
    el: [67.38, 0.50060, 30.695, 289.15, 184.15, 336.85],
    rate: [0, 0, 0, 65.1, 0, 0],
    nameZh: 'Gonggong', nameEn: 'Gonggong', radiusKm: 621,
    palette: 'mars',
    desc: 'A distant scattered disc object with a distinctly red surface rich in organic tholins and water ice. Orbital inclination of 30° with a period of ~554 years, accompanied by moon Xiangliu.',
  },
  orcus: {
    el: [39.419, 0.22710, 20.573, 165.63, 341.63, 268.63],
    rate: [0, 0, 0, 145.4, 0, 0],
    nameZh: 'Orcus', nameEn: 'Orcus', radiusKm: 458,
    palette: 'ice',
    desc: 'A plutino in 3:2 orbital resonance with Neptune, often called the "anti-Pluto" due to its opposite orbital phase. Tidally locked to its large moon Vanth (~280 km diameter).',
  },
  // ── Intermediate Kuiper Belt Objects (KBOs) ───────────────────────────
  varuna: {
    el: [43.131, 0.05100, 17.200, 139.34, 357.34, 97.24],
    rate: [0, 0, 0, 127.1, 0, 0],
    nameZh: 'Varuna', nameEn: 'Varuna', radiusKm: 339,
    palette: 'dark',
    desc: 'A large classical Kuiper Belt object with a fast 6.3-hour rotation period that produces significant light-curve variations. Named after the Hindu deity of the celestial ocean.',
  },
  ixion: {
    el: [39.658, 0.24240, 19.580, 289.05, 11.05, 71.05],
    rate: [0, 0, 0, 144.2, 0, 0],
    nameZh: 'Ixion', nameEn: 'Ixion', radiusKm: 325,
    palette: 'dark',
    desc: 'A plutino in 3:2 resonance with Neptune with a reddish surface composed of water ice, dark carbon, and tholins. Named after the king in Greek mythology.',
  },
  huya: {
    el: [39.756, 0.28120, 15.467, 28.96, 236.96, 169.06],
    rate: [0, 0, 0, 143.6, 0, 0],
    nameZh: 'Huya', nameEn: 'Huya', radiusKm: 214,
    palette: 'gray',
    desc: 'A plutino in 3:2 resonance with Neptune, named after the Wayuu rain deity. Features a small satellite and a moderately red surface.',
  },
  salacia: {
    el: [42.189, 0.10500, 23.940, 331.06, 232.06, 280.76],
    rate: [0, 0, 0, 131.4, 0, 0],
    nameZh: 'Salacia', nameEn: 'Salacia', radiusKm: 427,
    palette: 'ice',
    desc: 'A large non-resonant classical Kuiper Belt object with a low albedo and water-ice surface, orbited by moon Actaea. Named after the Roman goddess of saltwater.',
  },
  ms4: {
    el: [41.932, 0.13800, 17.670, 273.00, 69.00, 216.00],
    rate: [0, 0, 0, 132.5, 0, 0],
    nameZh: '2002 MS4', nameEn: '2002 MS4', radiusKm: 400,
    palette: 'gray',
    desc: 'A large unnamed Kuiper Belt object roughly 800 km across with a near-spherical profile, representing a prominent dwarf planet candidate.',
  },
  chaos: {
    el: [46.059, 0.09600, 12.040, 325.37, 115.37, 58.87],
    rate: [0, 0, 0, 115.0, 0, 0],
    nameZh: 'Chaos', nameEn: 'Chaos', radiusKm: 300,
    palette: 'gray',
    desc: 'A classical Kuiper Belt object named after the primordial state of existence in Greek mythology, orbiting in the cold classical belt.',
  },
  varda: {
    el: [46.444, 0.13950, 21.485, 92.29, 254.29, 184.19],
    rate: [0, 0, 0, 113.7, 0, 0],
    nameZh: 'Varda', nameEn: 'Varda', radiusKm: 370,
    palette: 'gray',
    desc: 'A resonant classical Kuiper Belt object orbited by satellite Ilmarë, named after the Queen of the Stars in Tolkien\'s mythology.',
  },
  typhon: {
    el: [37.637, 0.53630, 2.430, 158.34, 348.34, 319.64],
    rate: [0, 0, 0, 156.0, 0, 0],
    nameZh: 'Typhon', nameEn: 'Typhon', radiusKm: 97,
    palette: 'mars',
    desc: 'A scattered disc object on a highly eccentric orbit with perihelion near 17 AU, crossing inside Neptune\'s orbit. Accompanied by moon Echidna.',
  },
  tx300: {
    el: [43.158, 0.12310, 25.882, 24.43, 175.43, 86.43],
    rate: [0, 0, 0, 127.0, 0, 0],
    nameZh: '2002 TX300', nameEn: '2002 TX300', radiusKm: 143,
    palette: 'ice',
    desc: 'A bright Haumea-family Kuiper Belt object with an exceptionally high albedo of ~88% and a surface rich in crystalline water ice.',
  },
  ux25: {
    el: [42.583, 0.14230, 19.466, 34.48, 209.48, 30.78],
    rate: [0, 0, 0, 129.6, 0, 0],
    nameZh: '2002 UX25', nameEn: '2002 UX25', radiusKm: 340,
    palette: 'gray',
    desc: 'A Kuiper Belt object orbited by a small satellite, notable for its low density of ~0.82 g/cm³, indicating a predominantly water-ice composition.',
  },
  uk126: {
    el: [73.67, 0.48980, 23.369, 108.16, 118.16, 131.36],
    rate: [0, 0, 0, 56.9, 0, 0],
    nameZh: '2007 UK126', nameEn: '2007 UK126', radiusKm: 315,
    palette: 'pluto',
    desc: 'A scattered disc object with a perihelion near 37 AU and aphelion near 109 AU. Moderately reddish surface rich in organic tholins.',
  },
  // ── Scattered Disc and Extended Objects (SDOs & ETNOs) ────────────────
  fy27: {
    el: [59.05, 0.48820, 33.000, 225.5, 35.5, 183.50],
    rate: [0, 0, 0, 79.2, 0, 0],
    nameZh: '2013 FY27', nameEn: '2013 FY27', radiusKm: 370,
    palette: 'gray',
    desc: 'A scattered disc object with a perihelion near 30 AU and orbital inclination of 33°, with an estimated diameter of ~740 km.',
  },
  ceto: {
    el: [102.1, 0.82890, 22.311, 3.01, 358.01, 180.21],
    rate: [0, 0, 0, 34.9, 0, 0],
    nameZh: 'Ceto', nameEn: 'Ceto', radiusKm: 87,
    palette: 'gray',
    desc: 'A binary scattered disc system with a perihelion near 17 AU and orbital period of ~1,032 years, accompanied by satellite Phorcys.',
  },
  az84: {
    el: [39.4, 0.18100, 13.600, 89.4, 266.4, 252.20],
    rate: [0, 0, 0, 145.5, 0, 0],
    nameZh: '2003 AZ84', nameEn: '2003 AZ84', radiusKm: 362,
    palette: 'gray',
    // Triaxial ratio 1:0.7:0.6. axes stores semi-axes [484, 339, 291].
    // Volume-equivalent radius is 362 km.
    axes: [484, 339, 291],
    desc: 'A resonant plutino (3:2 with Neptune) with a triaxial ellipsoid shape (semi-axes 484×339×291 km) determined by stellar occultation.',
  },
  gv9: {
    el: [42.1, 0.07800, 22.000, 190.5, 34.5, 133.50],
    rate: [0, 0, 0, 131.8, 0, 0],
    nameZh: '2004 GV9', nameEn: '2004 GV9', radiusKm: 265,
    palette: 'gray',
    desc: 'A classical Kuiper Belt object in a low-eccentricity orbit, with an estimated diameter of ~530 km from thermal radiometry.',
  },
  rhadamanthus: {
    el: [38.6, 0.21000, 13.000, 252.0, 39.0, 175.00],
    rate: [0, 0, 0, 150.1, 0, 0],
    nameZh: 'Rhadamanthus', nameEn: 'Rhadamanthus', radiusKm: 68,
    palette: 'gray',
    desc: 'A plutino in 3:2 resonance with Neptune, named after the mythological judge of the underworld in Greek lore.',
  },
  qu182: {
    el: [51.0, 0.12000, 14.000, 195.0, 359.0, 310.00],
    rate: [0, 0, 0, 98.8, 0, 0],
    nameZh: '2005 QU182', nameEn: '2005 QU182', radiusKm: 208,
    palette: 'gray',
    desc: 'A classical trans-Neptunian object on a 364-year orbit, measuring approximately 416 km in diameter.',
  },
  // ── Extremely Distant Objects (ETNO) ──────────────────────────────────
  goblin: {
    el: [1083.0, 0.93960, 11.670, 236.7, 237.2, 118.90],
    rate: [0, 0, 0, 1.01, 0, 0],
    nameZh: 'The Goblin', nameEn: 'The Goblin', radiusKm: 150,
    palette: 'ice',
  // ── Extremely Distant Objects (ETNO) ──────────────────────────────────
  },
  vp113: {
    el: [263.0, 0.69340, 24.070, 23.1, 24.3, 90.80],
    rate: [0, 0, 0, 8.44, 0, 0],
    nameZh: '2012 VP113', nameEn: '2012 VP113', radiusKm: 150,
    palette: 'ice',
    desc: 'A distant sednoid with a perihelion of ~80 AU, far beyond the gravitational reach of Neptune. Its orbital alignment provides key evidence for Planet Nine.',
  },
  farout: {
    el: [317.0, 0.79300, 9.960, 56.5, 68.3, 125.70],
    rate: [0, 0, 0, 6.38, 0, 0],
    nameZh: 'Farout (2018 VG18)', nameEn: 'Farout', radiusKm: 310,
    palette: 'ice',
    desc: 'Discovered in 2018 at ~124 AU from the Sun, this distant planetoid has a pinkish surface indicative of water ice and an orbital period exceeding 5,000 years.',
  },
  farfarout: {
    el: [312.0, 0.84200, 26.700, 353.6, 6.4, 84.90],
    rate: [0, 0, 0, 6.53, 0, 0],
    nameZh: 'FarFarOut (2018 AG37)', nameEn: 'FarFarOut', radiusKm: 175,
    palette: 'ice',
    desc: 'Discovered at ~132 AU from the Sun, Farfarout travels on an eccentric 5,500-year orbit ranging from 50 AU out to 575 AU from the Sun.',
  },
};

export const TNO_IDS = Object.keys(TABLE);
export const TNO_DATA = TABLE;

/** Calculate TNO heliocentric ecliptic J2000 position (km).
 * Prefers tnoOrbits.generated.js (JPL SBDB epoch osculating elements + secular rates);
 * falls back to built-in J2000 table when missing. */
export function tnoPosition(id, jdTT) {
  const sampled = sampledPosition(id, jdTT);
  if (sampled) return sampled;
  const o = TNO_ORBITS[id];
  if (o) {
    const dt = jdTT - (o.epochJd ?? TNO_EPOCH_JD);
    const periDeg = o.periDeg + o.periDotDegPerDay * dt;
    const nodeDeg = o.nodeDeg + o.nodeDotDegPerDay * dt;
    const M = o.M0Deg + o.nDegPerDay * dt;
    return elementsToEcliptic({
      aAU: o.aAU, e: o.e, iDeg: o.iDeg,
      LDeg: periDeg + M, periDeg, nodeDeg,
    });
  }
  const T = centuriesTT(jdTT);
  const { el, rate } = TABLE[id];
  return elementsToEcliptic({
    aAU: el[0] + rate[0] * T,
    e:    el[1] + rate[1] * T,
    iDeg: el[2] + rate[2] * T,
    LDeg: el[3] + rate[3] * T,
    periDeg: el[4] + rate[4] * T,
    nodeDeg: el[5] + rate[5] * T,
  });
}

/** Sample orbit points (ecliptic coordinates in km, complete closed orbit) */
export function tnoOrbitPoints(id, n = 192) {
  const o = TNO_ORBITS[id];
  const el = o ? [o.aAU, o.e, o.iDeg, 0, o.periDeg, o.nodeDeg] : TABLE[id].el;
  const pts = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = elementsToEcliptic({
      aAU: el[0], e: el[1], iDeg: el[2],
      LDeg: el[4] + (i / (n - 1)) * 360, // sweep M from 0→360
      periDeg: el[4], nodeDeg: el[5],
    });
    pts[i * 3] = p.x; pts[i * 3 + 1] = p.y; pts[i * 3 + 2] = p.z;
  }
  return pts;
}
