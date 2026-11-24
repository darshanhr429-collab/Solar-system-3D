// Asteroid main belt, Jupiter Trojans, Kuiper belt (statistical point clouds with NASA taxonomy)
// and Oort cloud cometary planetesimals.
// Physical modeling incorporates Kirkwood Gaps (Jupiter orbital resonances),
// authentic Tholen / Bus-DeMeo spectral classification colors, and Lucy mission Trojan swarms.

import * as THREE from 'three';
import { KM_PER_AU } from '../config.js';

let _softDot = null;
/** 32x32 radial gradient point sprite (shared with starfield.js). Cached and reused. */
function softDotTexture() {
  if (_softDot) return _softDot;
  const S = 32, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  _softDot = new THREE.CanvasTexture(cv);
  _softDot.colorSpace = THREE.SRGBColorSpace;
  return _softDot;
}

/**
 * Kirkwood Gaps survival probability.
 * Gravitational perturbations from mean-motion orbital resonances with Jupiter (a_jup ≈ 5.2044 AU)
 * clear out distinctive depleted lanes across the main asteroid belt:
 * - 3:1 resonance at 2.502 AU
 * - 5:2 resonance at 2.824 AU
 * - 7:3 resonance at 2.957 AU
 * - 2:1 resonance at 3.278 AU (Hecuba gap, outer boundary)
 */
function kirkwoodSurvival(aAU) {
  const gaps = [
    { a0: 2.502, w: 0.038, depth: 0.90 }, // 3:1
    { a0: 2.824, w: 0.032, depth: 0.88 }, // 5:2
    { a0: 2.957, w: 0.026, depth: 0.80 }, // 7:3
    { a0: 3.278, w: 0.045, depth: 0.94 }, // 2:1
  ];
  let p = 1.0;
  for (let k = 0; k < gaps.length; k++) {
    const d = (aAU - gaps[k].a0) / gaps[k].w;
    p *= (1.0 - gaps[k].depth * Math.exp(-d * d * 0.5));
  }
  return p;
}

/**
 * Main Asteroid Belt generator with Kirkwood Gaps and NASA spectral taxonomy.
 * - S-type (siliceous / stony): dominant in inner belt (~2.1–2.6 AU), warm stony tan [0.72, 0.67, 0.60]
 * - C-type (carbonaceous): dominant in middle/outer belt (~2.6–3.4 AU), dark carbonaceous chondrite [0.35, 0.33, 0.31] (~75% of belt)
 * - M-type (metallic nickel-iron, like 16 Psyche): silvery muted luster [0.78, 0.76, 0.72] (~5%)
 * - D/P-type (primitive outer belt, organics/tholins): dark reddish-brown [0.48, 0.36, 0.28] (~5%)
 */
function makeMainAsteroidBelt({ count = 16000, seed = 4242 } = {}) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;

  let placed = 0;
  while (placed < count) {
    // Semi-major axis between 2.10 AU and 3.38 AU
    const aAU = 2.10 + (3.38 - 2.10) * Math.sqrt(rnd());
    // Apply Kirkwood gap rejection sampling
    if (rnd() > kirkwoodSurvival(aAU)) continue;

    const th = rnd() * Math.PI * 2;
    // Main belt inclination dispersion ~ 8.5 deg
    const inc = gauss() * (8.5 * Math.PI / 180);
    // Radial dispersion from eccentricities (e ~ 0.08–0.18)
    const r = aAU * (1 + 0.10 * gauss()) * KM_PER_AU;

    // Three.js world axes: ecliptic plane is XZ (x = r*cos(th)*cos(inc), y = r*sin(inc), z = r*sin(th)*cos(inc))
    const i3 = placed * 3;
    pos[i3] = r * Math.cos(th) * Math.cos(inc);
    pos[i3 + 1] = r * Math.sin(inc);
    pos[i3 + 2] = r * Math.sin(th) * Math.cos(inc);

    // NASA Spectral Taxonomy based on semi-major axis:
    let baseR = 0.35, baseG = 0.33, baseB = 0.31; // Default C-type (carbonaceous)
    const typeRoll = rnd();
    if (aAU < 2.50) {
      if (typeRoll < 0.68) {
        // S-type (siliceous)
        baseR = 0.70; baseG = 0.65; baseB = 0.58;
      } else if (typeRoll < 0.78) {
        // M-type (metallic)
        baseR = 0.78; baseG = 0.76; baseB = 0.72;
      }
    } else if (aAU < 2.82) {
      if (typeRoll < 0.38) {
        // S-type
        baseR = 0.68; baseG = 0.63; baseB = 0.56;
      } else if (typeRoll < 0.48) {
        // M-type
        baseR = 0.76; baseG = 0.74; baseB = 0.70;
      }
    } else if (aAU < 3.25) {
      if (typeRoll < 0.12) {
        // S-type
        baseR = 0.65; baseG = 0.60; baseB = 0.54;
      } else if (typeRoll > 0.88) {
        // D/P-type organic tholin
        baseR = 0.48; baseG = 0.36; baseB = 0.28;
      }
    } else {
      // Outer belt / Cybele zone
      if (typeRoll > 0.70) {
        baseR = 0.46; baseG = 0.34; baseB = 0.26;
      }
    }

    // Natural albedo & illumination variance
    const lum = 0.60 + 0.55 * rnd();
    col[i3] = Math.min(1.0, baseR * lum);
    col[i3 + 1] = Math.min(1.0, baseG * lum);
    col[i3 + 2] = Math.min(1.0, baseB * lum);

    placed++;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.22,
    vertexColors: true, depthWrite: false, fog: false, map: softDotTexture(),
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/**
 * Jupiter Trojans ("Jupiter belt"): L4 Greek Camp (+60 deg) and L5 Trojan Camp (-60 deg).
 * NASA's Lucy mission targets these ancient primitive swarms trapped in Jupiter's 1:1 resonance at 5.2 AU.
 * Rich in dark D-type and P-type tholins.
 */
function makeJupiterTrojans({ countPerCamp = 3000, seed = 5252 } = {}) {
  const count = countPerCamp * 2;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;

  for (let i = 0; i < count; i++) {
    const isL4 = i < countPerCamp;
    // L4 leads at +60 deg (+PI/3), L5 trails at -60 deg (-PI/3)
    const baseLagrange = isL4 ? Math.PI / 3 : -Math.PI / 3;
    // Libration along orbit: ~14 deg gaussian width
    const th = baseLagrange + gauss() * (14.0 * Math.PI / 180);
    // Radial distribution around Jupiter's semi-major axis a ~ 5.204 AU (5.05 - 5.35 AU)
    const aAU = 5.204 + 0.10 * gauss();
    const r = aAU * KM_PER_AU;
    // High inclination dispersion of Trojans: sigma ~ 14 deg (up to ~35 deg)
    const inc = gauss() * (14.0 * Math.PI / 180);

    const i3 = i * 3;
    // Ecliptic coordinates mapped to Three.js: (x, z, -y)
    // x = r*cos(th)*cos(inc), y = r*sin(inc), z = -r*sin(th)*cos(inc)
    pos[i3] = r * Math.cos(th) * Math.cos(inc);
    pos[i3 + 1] = r * Math.sin(inc);
    pos[i3 + 2] = -r * Math.sin(th) * Math.cos(inc);

    // NASA Lucy D-type and P-type primitive organic tholins (very dark reddish-brown / mahogany)
    const typeRoll = rnd();
    let rCol = 0.42, gCol = 0.28, bCol = 0.22;
    if (typeRoll < 0.45) {
      rCol = 0.34; gCol = 0.25; bCol = 0.21;
    } else if (typeRoll > 0.85) {
      rCol = 0.48; gCol = 0.32; bCol = 0.24;
    }
    const lum = 0.65 + 0.50 * rnd();
    col[i3] = rCol * lum;
    col[i3 + 1] = gCol * lum;
    col[i3 + 2] = bCol * lum;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.26,
    vertexColors: true, depthWrite: false, fog: false, map: softDotTexture(),
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/**
 * Kuiper Belt: 30 - 48 AU disk of primitive icy bodies.
 * Features cold classical KBOs (rich in reddish tholins) and plutinos / scattered disc.
 */
function makeKuiperBelt({ count = 9000, seed = 7777 } = {}) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;

  for (let i = 0; i < count; i++) {
    const aAU = 31.0 + (48.0 - 31.0) * Math.sqrt(rnd());
    const th = rnd() * Math.PI * 2;
    // Bimodal inclination: cold classical (~4 deg) vs hot/scattered (~12 deg)
    const isHot = rnd() < 0.35;
    const incDeg = isHot ? gauss() * 12.0 : gauss() * 3.8;
    const inc = incDeg * (Math.PI / 180);
    const r = aAU * (1 + 0.08 * gauss()) * KM_PER_AU;

    const i3 = i * 3;
    pos[i3] = r * Math.cos(th) * Math.cos(inc);
    pos[i3 + 1] = r * Math.sin(inc);
    pos[i3 + 2] = r * Math.sin(th) * Math.cos(inc);

    // Cold classical (ultra-red tholin rich) vs Plutino/hot classical (slate-blue/gray ice)
    let rCol, gCol, bCol;
    if (rnd() < 0.50) {
      // Reddish organic tholin (like Arrokoth and Sedna)
      rCol = 0.52; gCol = 0.36; bCol = 0.30;
    } else {
      // Muted slate-blue water/methane ice
      rCol = 0.38; gCol = 0.44; bCol = 0.50;
    }
    const lum = 0.60 + 0.50 * rnd();
    col[i3] = rCol * lum;
    col[i3 + 1] = gCol * lum;
    col[i3 + 2] = bCol * lum;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.16,
    vertexColors: true, depthWrite: false, fog: false, map: softDotTexture(),
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Backward-compatible makeBelt function */
export function makeBelt({ count, aMinAU, aMaxAU, inclSigmaDeg, color, size, opacity, seed }) {
  const pos = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;
  for (let i = 0; i < count; i++) {
    const a = (aMinAU + (aMaxAU - aMinAU) * Math.sqrt(rnd())) * KM_PER_AU;
    const th = rnd() * Math.PI * 2;
    const inc = gauss() * inclSigmaDeg * (Math.PI / 180);
    const r = a * (1 + 0.12 * gauss());
    pos[i * 3] = r * Math.cos(th) * Math.cos(inc);
    pos[i * 3 + 1] = r * Math.sin(inc);
    pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(inc);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, sizeAttenuation: false, transparent: true, opacity,
    depthWrite: false, fog: false, map: softDotTexture(),
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function createBelts() {
  const group = new THREE.Group();
  group.name = 'belts';

  const mainBelt = makeMainAsteroidBelt({ count: 16000, seed: 4242 });
  const kuiperBelt = makeKuiperBelt({ count: 9000, seed: 7777 });

  // Jupiter Trojans sub-group, rotated to follow Jupiter's orbital longitude
  const trojanGroup = new THREE.Group();
  trojanGroup.name = 'jupiterTrojansGroup';
  const trojanMesh = makeJupiterTrojans({ countPerCamp: 3000, seed: 5252 });
  trojanGroup.add(trojanMesh);

  group.add(mainBelt);
  group.add(kuiperBelt);
  group.add(trojanGroup);

  /**
   * Update Jupiter Trojans rotation to track Jupiter's position.
   * @param {Float64Array|Array|THREE.Vector3} jupPosKm - Jupiter's heliocentric position in Three.js world coordinates
   */
  group.update = function(jupPosKm) {
    if (!jupPosKm) return;
    const x = jupPosKm[0] ?? jupPosKm.x;
    const z = jupPosKm[2] ?? jupPosKm.z;
    if (x == null || z == null) return;
    // Ecliptic longitude in Three.js XZ plane: x = r*cos(lon), z = -r*sin(lon) => lon = atan2(-z, x)
    const jupLon = Math.atan2(-z, x);
    trojanGroup.rotation.y = jupLon;
  };

  return group;
}

/**
 * Oort cloud statistical particle shell (visual representation, uncomputed orbits).
 * Realistic cometary dirty-ice planetesimals (albedo ~0.04).
 * Rendered with soft non-additive blending and muted celestial slate/charcoal tones,
 * preventing artificial bright cyan/white noise.
 * Inner Oort cloud (Hills cloud): 2,000 - 20,000 AU, mildly flattened torus.
 * Outer Oort cloud: 20,000 - 100,000 AU, spherical isotropic shell.
 */
function makeOortShell({ count, rMinAU, rMaxAU, inclSigmaDeg, spherical, opacity, seed }) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;

  for (let i = 0; i < count; i++) {
    // Radius: volume distribution cbrt(uniform)
    const r = (rMinAU + (rMaxAU - rMinAU) * Math.cbrt(rnd())) * KM_PER_AU;
    const i3 = i * 3;
    if (spherical) {
      // Spherical isotropic shell (outer Oort cloud)
      const cosT = rnd() * 2 - 1;
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const phi = rnd() * Math.PI * 2;
      pos[i3] = r * sinT * Math.cos(phi);
      pos[i3 + 1] = r * cosT;
      pos[i3 + 2] = r * sinT * Math.sin(phi);
    } else {
      // Toroidal / flattened distribution (inner Oort cloud / Hills cloud)
      const th = rnd() * Math.PI * 2;
      const inc = gauss() * (inclSigmaDeg * Math.PI / 180);
      pos[i3] = r * Math.cos(th) * Math.cos(inc);
      pos[i3 + 1] = r * Math.sin(inc);
      pos[i3 + 2] = r * Math.sin(th) * Math.cos(inc);
    }

    // Realistic cometary dirty ice (desaturated, faint slate-blue and carbonaceous tones)
    const roll = rnd();
    let rC = 0.36, gC = 0.42, bC = 0.48;
    if (roll < 0.33) {
      rC = 0.30; gC = 0.36; bC = 0.42;
    } else if (roll > 0.66) {
      rC = 0.42; gC = 0.48; bC = 0.54;
    }
    const lum = 0.65 + 0.45 * rnd();
    col[i3] = rC * lum;
    col[i3 + 1] = gC * lum;
    col[i3 + 2] = bC * lum;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  // NormalBlending avoids harsh additive stacking; softDotTexture gives ethereal cometary haze
  const mat = new THREE.PointsMaterial({
    size: 1.8, sizeAttenuation: false, transparent: true, opacity,
    vertexColors: true, depthWrite: false, fog: false, blending: THREE.NormalBlending,
    map: softDotTexture(),
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.baseOpacity = opacity;
  return pts;
}

export function createOortCloud() {
  const group = new THREE.Group();
  group.name = 'oortCloud';
  const shells = [];

  // Inner Oort cloud (Hills cloud): 2,000 - 20,000 AU (toroidal, inclination dispersion ~28 deg)
  const inner = makeOortShell({
    count: 1800, rMinAU: 2000, rMaxAU: 20000,
    inclSigmaDeg: 28, spherical: false,
    opacity: 0.16, seed: 31415,
  });
  // Outer Oort cloud: 20,000 - 100,000 AU (spherical isotropic)
  const outer = makeOortShell({
    count: 3200, rMinAU: 20000, rMaxAU: 100000,
    spherical: true,
    opacity: 0.12, seed: 27183,
  });
  group.add(inner); group.add(outer);
  shells.push(inner, outer);
  group.frustumCulled = false;

  function update(dSunAU) {
    let f;
    if (dSunAU < 1000) f = 1;
    else if (dSunAU < 60000) f = 1 - 0.78 * ((dSunAU - 1000) / 59000);
    else f = 0.22;
    for (const sh of shells) sh.material.opacity = sh.userData.baseOpacity * f;
  }

  return { group, update };
}
