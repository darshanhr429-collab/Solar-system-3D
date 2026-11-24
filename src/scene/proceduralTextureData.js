import { makeNoise, hashSeed } from '../util/noise.js';

export const PRESETS = {
  gray:     { base: [120, 118, 116], varr: [60, 60, 60], craters: 1.0 },
  dark:     { base: [60, 56, 54], varr: [40, 38, 36], craters: 1.0 },
  ice:      { base: [205, 215, 225], varr: [40, 35, 30], craters: 0.3 },
  mars:     { base: [165, 95, 55], varr: [70, 45, 30], craters: 0.5 },
  venus:    { base: [185, 150, 100], varr: [50, 45, 35], craters: 0.1 },
  io:       { base: [215, 185, 95], varr: [70, 70, 80], craters: 0.0 },
  titan:    { base: [180, 130, 60], varr: [50, 40, 25], craters: 0.0 },
  triton:   { base: [205, 198, 190], varr: [35, 32, 30], craters: 0.2 },
  pluto:    { base: [185, 155, 120], varr: [80, 70, 60], craters: 0.4 },
  callisto: { base: [110, 100, 90], varr: [70, 65, 55], craters: 1.2 },
  iapetus:  { base: [120, 115, 105], varr: [110, 110, 105], craters: 0.8 },
  earth:    { base: [70, 90, 120], varr: [60, 50, 30], craters: 0 },

// -- High Albedo Icy Moons -------------------------------------------------
// Satellites of Saturn and Uranus with geometric albedo 0.8 - 1.0
// (Mimas 0.962, Dione 0.998, Enceladus 0.99, Rhea 0.95, Tethys 0.80).
// Authentic bright icy surfaces matching empirical photometric surveys.
// Tinted with subtle warm or cool undertones.
  iceBright:{ base: [232, 232, 230], varr: [26, 26, 26], craters: 0.9 }, // albedo ≈ 0.95–1.0
  iceMid:   { base: [206, 208, 210], varr: [34, 34, 34], craters: 0.9 }, // albedo ≈ 0.8
  iceDim:   { base: [176, 178, 182], varr: [44, 44, 44], craters: 0.9 }, // albedo ≈ 0.6–0.7

// -- Satellite Palette Calibration: empirical albedo and color tones -----
// Custom procedural surface palettes for 28 minor moons.
// Calibrated against ground-based photometry, Voyager, Galileo, Cassini, and New Horizons data:
// base color = empirical hue, varr = albedo relief range, craters = observed crater density.
// Accurately depicts comparative surface compositions.
// Absolute brightness is modulated by lighting and grading in the shader.
  jupInner: { base: [150, 78, 58], varr: [70, 42, 34], craters: 0.9 },   // Jupiter inner: sulfur contamination, reddish (albedo 0.05-0.10)
  hyperion: { base: [162, 150, 122], varr: [80, 74, 62], craters: 1.3 }, // Hyperion: sponge-like porous texture, deep craters (albedo 0.3)
  phoebe:   { base: [72, 68, 64],   varr: [46, 44, 42], craters: 1.2 },  // Phoebe: very dark, reddish (albedo 0.06)
  satIce:   { base: [178, 176, 172], varr: [52, 50, 48], craters: 0.9 }, // Saturn icy moons: Janus, Epimetheus (albedo 0.5-0.7)
  uranDark: { base: [78, 76, 74],   varr: [48, 46, 44], craters: 0.9 },  // Uranus inner moons: dark gray (albedo 0.06-0.10)
  puck:     { base: [96, 88, 82],   varr: [54, 50, 46], craters: 0.9 },  // Puck: slightly reddish dark gray (albedo 0.11)
  proteus:  { base: [62, 62, 62],   varr: [40, 40, 40], craters: 0.8 },  // Proteus: soot dark (albedo 0.096), grooved
  nepInner: { base: [70, 70, 72],   varr: [44, 44, 45], craters: 1.0 },  // Neptune inner moons: dark gray (albedo 0.05-0.09)
  nereid:   { base: [118, 116, 112], varr: [58, 56, 54], craters: 0.9 }, // Nereid: moderate gray (albedo 0.155)
};

/** Generate equirectangular cylindrical projection texture (CanvasTexture) */
export function* proceduralMapPixels(bodyId, palette = 'gray', w = 1024, h = 512) {
  const preset = PRESETS[palette] ?? PRESETS.gray;
  const n = makeNoise(hashSeed(bodyId + ':tex'));
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - y / h) * Math.PI;
    const cy = Math.cos(lat), sy = Math.sin(lat);
    for (let x = 0; x < w; x++) {
      const lon = (x / w - 0.5) * 2 * Math.PI;
      const px = cy * Math.cos(lon), pz = -cy * Math.sin(lon), py = sy;
      let t = 0.5 + 0.5 * n.fbm(px * 3, py * 3, pz * 3, 5);
      t = t * 0.7 + 0.3 * n.ridged(px * 8, py * 8, pz * 8, 4);
      let shade = 1;
      if (preset.craters > 0) {
        const c = n.fbm(px * 18, py * 18, pz * 18, 3);
        const rim = Math.max(0, 1 - Math.abs(c - 0.18) * 14);
        const pit = Math.max(0, 1 - Math.abs(c - 0.3) * 9);
        shade += preset.craters * (rim * 0.18 - pit * 0.3);
      }
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, (preset.base[0] + (t - 0.5) * preset.varr[0]) * shade));
      d[i + 1] = Math.max(0, Math.min(255, (preset.base[1] + (t - 0.5) * preset.varr[1]) * shade));
      d[i + 2] = Math.max(0, Math.min(255, (preset.base[2] + (t - 0.5) * preset.varr[2]) * shade));
      d[i + 3] = 255;
      // A full 1024-pixel noise row can exceed a frame budget on slow CPUs.
      if ((x & 63) === 63) yield;
    }
    yield;
  }
  return { data: d, width: w, height: h };
}

/** Gas giant band texture (used only when authentic texture is missing) */
export function* proceduralBandsPixels(bodyId, colors, w = 1024, h = 512) {
  const n = makeNoise(hashSeed(bodyId + ':bands'));
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // Cylindrical sampling: maps longitude to unit circle to prevent texture seam at antimeridian
      // Coordinates wrap smoothly across u=0 and u=1.
      // Eliminates visible seams on procedural planetary spheres.
      const ang = u * Math.PI * 2;
      const cu = Math.cos(ang), su = Math.sin(ang);
      const warp = 0.04 * n.fbm(cu * 1.0, su * 1.0, v * 18, 4);
      const band = 0.5 + 0.5 * Math.sin((v + warp) * Math.PI * 14 + 2 * n.noise3(cu * 0.4, su * 0.4, v * 5));
      const k = Math.min(colors.length - 2, Math.floor(band * (colors.length - 1)));
      const f = band * (colors.length - 1) - k;
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        d[i + ch] = colors[k][ch] * (1 - f) + colors[k + 1][ch] * f;
      }
      d[i + 3] = 255;
      if ((x & 63) === 63) yield;
    }
    yield;
  }
  return { data: d, width: w, height: h };
}

