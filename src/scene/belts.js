// Asteroid main belt and Kuiper belt (statistical point clouds with deterministic seed) + Oort cloud particles.
// Note: Zodiacal dust halo is omitted as it is not visible to naked eye in deep space.

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

function makeBelt({ count, aMinAU, aMaxAU, inclSigmaDeg, color, size, opacity, seed }) {
  const pos = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;
  for (let i = 0; i < count; i++) {
    const a = (aMinAU + (aMaxAU - aMinAU) * Math.sqrt(rnd())) * KM_PER_AU;
    const th = rnd() * Math.PI * 2;
    const inc = gauss() * inclSigmaDeg * (Math.PI / 180);
    const r = a * (1 + 0.12 * gauss());
  // World axes: ecliptic plane is XZ
    pos[i * 3] = r * Math.cos(th) * Math.cos(inc);
    pos[i * 3 + 1] = r * Math.sin(inc);
    pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(inc);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // Soft point sprite: avoids blocky PointsMaterial square rendering
  // Uses smooth 32x32 radial alpha falloff texture.
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
  // Main belt 2.1 - 3.4 AU
  group.add(makeBelt({
    count: 14000, aMinAU: 2.1, aMaxAU: 3.4, inclSigmaDeg: 9,
    color: 0x9a8e80, size: 2.6, opacity: 0.16, seed: 4242,
  }));
  // Kuiper belt 32 - 48 AU
  group.add(makeBelt({
    count: 9000, aMinAU: 32, aMaxAU: 48, inclSigmaDeg: 4,
    color: 0x8fa3b8, size: 2.6, opacity: 0.14, seed: 7777,
  }));

  return group;
}

/**
 * Oort cloud statistical particle shell (visual representation, uncomputed orbits).
 * Inner Oort cloud (Hills cloud): 2,000 - 20,000 AU, mildly flattened.
 * Outer Oort cloud: 20,000 - 100,000 AU, spherical isotropic shell.
 * Registered with floating origin at heliocentric center.
 */
function makeOortShell({ count, rMinAU, rMaxAU, inclSigmaDeg, spherical, color, size, opacity, seed }) {
  const pos = new Float32Array(count * 3);
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;
  for (let i = 0; i < count; i++) {
    // Radius: uniform volume distribution (cbrt(uniform))
    const r = (rMinAU + (rMaxAU - rMinAU) * Math.cbrt(rnd())) * KM_PER_AU;
    if (spherical) {
    // Spherical isotropic distribution (outer Oort cloud)
      const cosT = rnd() * 2 - 1;
      const sinT = Math.sqrt(1 - cosT * cosT);
      const phi = rnd() * Math.PI * 2;
      pos[i * 3] = r * sinT * Math.cos(phi);
      pos[i * 3 + 1] = r * cosT;
      pos[i * 3 + 2] = r * sinT * Math.sin(phi);
    } else {
    // Toroidal / flattened distribution (inner Oort cloud / Hills cloud)
      const th = rnd() * Math.PI * 2;
      const inc = gauss() * inclSigmaDeg * (Math.PI / 180);
      pos[i * 3] = r * Math.cos(th) * Math.cos(inc);
      pos[i * 3 + 1] = r * Math.sin(inc);
      pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(inc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, sizeAttenuation: false, transparent: true, opacity,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.baseOpacity = opacity;
  return pts;
}

/**
 * Oort cloud: extremely sparse in reality (trillions of bodies across enormous volume).
 * Rendered as subtle, distant dust hints that fade when camera penetrates interior,
 * preventing camera pan parallax artifacts (#5).
 * Returns { group, update(dSunAU) }.
 */
export function createOortCloud() {
  const group = new THREE.Group();
  const shells = [];

  // Inner Oort cloud (Hills cloud): 2,000 - 20,000 AU.
  // Mostly spherical with mild equatorial concentration;
  // avoids harsh flat rings when viewed from within.
  const inner = makeOortShell({
    count: 1400, rMinAU: 2000, rMaxAU: 20000,
    inclSigmaDeg: 30, spherical: true,
    color: 0x8ca8c8, size: 1.1, opacity: 0.20, seed: 31415,
  });
  // Outer Oort cloud: 20,000 - 100,000 AU, nearly spherical and isotropic
  const outer = makeOortShell({
    count: 2600, rMinAU: 20000, rMaxAU: 100000,
    spherical: true,
    color: 0x7090b0, size: 1.0, opacity: 0.14, seed: 27183,
  });
  group.add(inner); group.add(outer);
  shells.push(inner, outer);
  group.frustumCulled = false;

  function update(dSunAU) {
    // Full opacity when viewed externally from inner Solar System; fades when inside,
    // preserving realistic cosmic emptiness.
    let f;
    if (dSunAU < 1000) f = 1;
    else if (dSunAU < 60000) f = 1 - 0.78 * ((dSunAU - 1000) / 59000);
    else f = 0.22;
    for (const sh of shells) sh.material.opacity = sh.userData.baseOpacity * f;
  }

  return { group, update };
}
