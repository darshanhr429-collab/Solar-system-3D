// Procedural 3D Milky Way Galaxy, Interstellar Dust Lanes, and Extragalactic Cosmos
// Generates a true 3D spiral galaxy (Bulge, 4 major spiral arms + Orion Spur,
// dark interstellar molecular dust lanes, and H II star-forming emission nebulae)
// along with surrounding Local Group galaxies (Andromeda M31, Triangulum M33, LMC, SMC)
// and deep-field intergalactic space.
// 100% code-generated in Three.js, lightweight, performant, and educational.

import * as THREE from 'three';
import { raDecToWorld, LY_KM } from '../config.js';

const DEG = Math.PI / 180;

// Galactic coordinate directions in Three.js world frame
// Galactic Center (Sagittarius A*): RA 17h 45.7m, Dec -29° 00'
const GC_DIR = raDecToWorld(266.417 * DEG, -29.008 * DEG, new THREE.Vector3());
// North Galactic Pole (NGP): RA 12h 51.4m, Dec +27° 08'
const NGP_DIR = raDecToWorld(192.8595 * DEG, 27.1284 * DEG, new THREE.Vector3());

// Orthonormal basis for Galactic Plane:
// +X: Towards Galactic Center (Sagittarius A*)
// +Y: Towards North Galactic Pole (NGP)
// +Z: In the direction of Galactic rotation (l = 90°, Cygnus)
const GAL_X = GC_DIR.clone().normalize();
const GAL_Y = NGP_DIR.clone().normalize();
const GAL_Z = new THREE.Vector3().crossVectors(GAL_X, GAL_Y).normalize();

// Reusable pseudo-random generator with deterministic seed
function createRng(seed = 123456789) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Convert galactic cylindrical coordinates (r_ly, theta_rad, z_ly)
// into Three.js world coordinates (km) centered at our Sun
function galacticToWorld(rLy, theta, zLy) {
  // Center of Milky Way is at distance ~26,000 ly along GAL_X
  const SUN_DIST_LY = 26000;
  // Position in galaxy centered at Sagittarius A*:
  const gx = rLy * Math.cos(theta);
  const gz = rLy * Math.sin(theta);
  const gy = zLy;

  // Relative to our Sun (Sun is at gx = SUN_DIST_LY, gz = 0, gy = 0)
  const relX = gx - SUN_DIST_LY;
  const relY = gy;
  const relZ = gz;

  const w = new THREE.Vector3()
    .addScaledVector(GAL_X, relX * LY_KM)
    .addScaledVector(GAL_Y, relY * LY_KM)
    .addScaledVector(GAL_Z, relZ * LY_KM);

  return w;
}

/**
 * 32x32 soft radial particle texture for smooth stellar glow and dust
 */
let _cachedParticleTex = null;
function getParticleTexture() {
  if (_cachedParticleTex) return _cachedParticleTex;
  if (typeof document === 'undefined') return null;
  const S = 32;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const grd = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1.0)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.65, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, S, S);
  _cachedParticleTex = new THREE.CanvasTexture(cv);
  _cachedParticleTex.colorSpace = THREE.SRGBColorSpace;
  return _cachedParticleTex;
}

/**
 * Creates the 3D Procedural Milky Way Galaxy with:
 * - Galactic Core Bulge (warm amber spheroid with Sagittarius A*)
 * - 4 Logarithmic Spiral Arms + Local Orion Spur
 * - Interstellar Dark Molecular Dust Clouds & Silicate Dust Lanes
 * - Radiant H II Star-Forming Emission Nebulae
 * - Our Solar System / Sun Location Indicator
 */
export function createMilkyWay3D() {
  const group = new THREE.Group();
  group.name = 'MilkyWay3D';

  const rnd = createRng(421098);
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.707;
  const pTex = getParticleTexture();

  // ── 1. Galactic Core & Central Bulge ──────────────────────────────────────
  // Spheroid of ~12,000 elder Population II stars with warm amber colors
  const CORE_STAR_COUNT = 12000;
  const corePos = new Float32Array(CORE_STAR_COUNT * 3);
  const coreCol = new Float32Array(CORE_STAR_COUNT * 3);

  for (let i = 0; i < CORE_STAR_COUNT; i++) {
    // Exponential radial decay towards Sagittarius A*
    const rLy = 9500 * Math.pow(rnd(), 1.8);
    const th = rnd() * Math.PI * 2;
    // Flattened bulge (vertical scale height ~2,500 ly)
    const zLy = gauss() * 2500 * Math.exp(-rLy / 7000);

    const w = galacticToWorld(rLy, th, zLy);
    corePos[i * 3] = w.x;
    corePos[i * 3 + 1] = w.y;
    corePos[i * 3 + 2] = w.z;

    // Warm golden-amber blackbody chromaticity (3800K - 5500K)
    const tempT = rnd();
    const cr = 1.0;
    const cg = 0.72 + 0.24 * tempT;
    const cb = 0.38 + 0.38 * tempT;
    const bright = (0.45 + 0.55 * (1.0 - rLy / 10000)) * (0.6 + 0.4 * rnd());

    coreCol[i * 3] = cr * bright;
    coreCol[i * 3 + 1] = cg * bright;
    coreCol[i * 3 + 2] = cb * bright;
  }

  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute('position', new THREE.BufferAttribute(corePos, 3));
  coreGeo.setAttribute('color', new THREE.BufferAttribute(coreCol, 3));

  const coreMat = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: pTex,
  });
  const coreMesh = new THREE.Points(coreGeo, coreMat);
  coreMesh.frustumCulled = false;
  group.add(coreMesh);

  // ── 2. Logarithmic Spiral Arms ─────────────────────────────────────────────
  // 4 Main Arms + Orion Spur (where our Solar System is situated)
  // Spiral arm formula: r = r0 * exp(b * theta)
  const SPIRAL_ARMS = [
    { name: 'Scutum-Centaurus', thOffset: 0.0, r0: 9500, b: 0.22, length: 3.2 * Math.PI },
    { name: 'Perseus', thOffset: Math.PI, r0: 9500, b: 0.22, length: 3.2 * Math.PI },
    { name: 'Sagittarius', thOffset: 0.42 * Math.PI, r0: 10500, b: 0.21, length: 2.8 * Math.PI },
    { name: 'Norma-Outer', thOffset: 1.45 * Math.PI, r0: 10500, b: 0.21, length: 2.8 * Math.PI },
    { name: 'Orion Spur (Local)', thOffset: 0.32 * Math.PI, r0: 18000, b: 0.18, length: 1.1 * Math.PI },
  ];

  const ARM_STAR_COUNT = 36000;
  const armPos = new Float32Array(ARM_STAR_COUNT * 3);
  const armCol = new Float32Array(ARM_STAR_COUNT * 3);

  let sIdx = 0;
  for (const arm of SPIRAL_ARMS) {
    const armStars = Math.floor(ARM_STAR_COUNT / SPIRAL_ARMS.length);
    for (let i = 0; i < armStars && sIdx < ARM_STAR_COUNT; i++) {
      const t = rnd();
      const th = t * arm.length;
      // Logarithmic spiral radius + Gaussian dispersion across arm width
      const idealR = arm.r0 * Math.exp(arm.b * th);
      const armWidth = 1400 + 0.08 * idealR;
      const rLy = Math.min(58000, Math.max(9000, idealR + gauss() * armWidth));
      const angle = arm.thOffset + th;

      // Thin galactic disk thickness (~400 ly)
      const zLy = gauss() * 400 * Math.exp(rLy / 60000);

      const w = galacticToWorld(rLy, angle, zLy);
      armPos[sIdx * 3] = w.x;
      armPos[sIdx * 3 + 1] = w.y;
      armPos[sIdx * 3 + 2] = w.z;

      // Multi-spectral stellar distribution:
      // Hot blue O/B stars along leading edge (30%), white A/F stars (40%), yellow/red (30%)
      const starType = rnd();
      let cr = 1.0, cg = 1.0, cb = 1.0;
      if (starType < 0.32) {
        // Young blue giants
        cr = 0.65; cg = 0.82; cb = 1.0;
      } else if (starType < 0.72) {
        // Bright white/cream stars
        cr = 0.96; cg = 0.98; cb = 1.0;
      } else {
        // Yellow/orange stars
        cr = 1.0; cg = 0.84; cb = 0.62;
      }
      const bright = (0.5 + 0.5 * rnd()) * Math.exp(-rLy / 70000);
      armCol[sIdx * 3] = cr * bright;
      armCol[sIdx * 3 + 1] = cg * bright;
      armCol[sIdx * 3 + 2] = cb * bright;

      sIdx++;
    }
  }

  const armGeo = new THREE.BufferGeometry();
  armGeo.setAttribute('position', new THREE.BufferAttribute(armPos, 3));
  armGeo.setAttribute('color', new THREE.BufferAttribute(armCol, 3));

  const armMat = new THREE.PointsMaterial({
    size: 1.8,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: pTex,
  });
  const armMesh = new THREE.Points(armGeo, armMat);
  armMesh.frustumCulled = false;
  group.add(armMesh);

  // ── 3. Interstellar Molecular Dust Clouds & Dark Absorption Lanes ──────────
  // Dense dark silicate and polycyclic dust lanes weaving inside the spiral arms
  // Provides authentic dark nebulae silhouettes (Great Rift, Coalsack, Cygnus Rift)
  const DUST_COUNT = 15000;
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustCol = new Float32Array(DUST_COUNT * 3);

  let dIdx = 0;
  for (const arm of SPIRAL_ARMS) {
    const armDust = Math.floor(DUST_COUNT / SPIRAL_ARMS.length);
    for (let i = 0; i < armDust && dIdx < DUST_COUNT; i++) {
      const t = rnd();
      const th = t * arm.length;
      // Dust clouds cluster on the inner concave edge of the spiral arms
      const idealR = arm.r0 * Math.exp(arm.b * th) - (700 + 400 * rnd());
      const rLy = Math.min(56000, Math.max(8500, idealR + gauss() * 750));
      const angle = arm.thOffset + th;
      const zLy = gauss() * 220; // Very thin dust disk (~200 ly)

      const w = galacticToWorld(rLy, angle, zLy);
      dustPos[dIdx * 3] = w.x;
      dustPos[dIdx * 3 + 1] = w.y;
      dustPos[dIdx * 3 + 2] = w.z;

      // Dark brown-charcoal absorption hue
      const dDarkness = 0.08 + 0.08 * rnd();
      dustCol[dIdx * 3] = dDarkness * 1.0;
      dustCol[dIdx * 3 + 1] = dDarkness * 0.82;
      dustCol[dIdx * 3 + 2] = dDarkness * 0.65;

      dIdx++;
    }
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));

  const dustMat = new THREE.PointsMaterial({
    size: 4.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    map: pTex,
  });
  const dustMesh = new THREE.Points(dustGeo, dustMat);
  dustMesh.frustumCulled = false;
  group.add(dustMesh);

  // ── 4. H II Star-Forming Emission Nebulae ──────────────────────────────────
  // Luminous pink/red ionized hydrogen gas clouds (H-alpha 656.3 nm)
  const NEBULA_COUNT = 650;
  const nebPos = new Float32Array(NEBULA_COUNT * 3);
  const nebCol = new Float32Array(NEBULA_COUNT * 3);

  for (let i = 0; i < NEBULA_COUNT; i++) {
    const arm = SPIRAL_ARMS[Math.floor(rnd() * SPIRAL_ARMS.length)];
    const th = rnd() * arm.length;
    const rLy = Math.min(54000, Math.max(9500, arm.r0 * Math.exp(arm.b * th) + gauss() * 900));
    const angle = arm.thOffset + th;
    const zLy = gauss() * 300;

    const w = galacticToWorld(rLy, angle, zLy);
    nebPos[i * 3] = w.x;
    nebPos[i * 3 + 1] = w.y;
    nebPos[i * 3 + 2] = w.z;

    // Glowing magenta-pink H-alpha emission
    nebCol[i * 3] = 1.0;
    nebCol[i * 3 + 1] = 0.28 + 0.2 * rnd();
    nebCol[i * 3 + 2] = 0.58 + 0.3 * rnd();
  }

  const nebGeo = new THREE.BufferGeometry();
  nebGeo.setAttribute('position', new THREE.BufferAttribute(nebPos, 3));
  nebGeo.setAttribute('color', new THREE.BufferAttribute(nebCol, 3));

  const nebMat = new THREE.PointsMaterial({
    size: 4.8,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: pTex,
  });
  const nebMesh = new THREE.Points(nebGeo, nebMat);
  nebMesh.frustumCulled = false;
  group.add(nebMesh);

  // ── 5. Solar System Location Marker (Orion Spur) ──────────────────────────
  // Golden beacon showing our Sun's position in the galaxy (26,000 ly from Sagittarius A*)
  const sunMarkerGeo = new THREE.RingGeometry(250 * LY_KM, 320 * LY_KM, 32);
  const sunMarkerMat = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sunMarker = new THREE.Mesh(sunMarkerGeo, sunMarkerMat);
  sunMarker.position.set(0, 0, 0); // Sun is at origin in world space
  sunMarker.lookAt(GAL_Y);
  group.add(sunMarker);

  return {
    group,
    coreMesh,
    armMesh,
    dustMesh,
    nebMesh,
    sunMarker,
    /**
     * Updates visibility and scale adaptation based on camera distance from Sun.
     * When inside solar system, galaxy provides authentic celestial backdrop;
     * when zooming out to interstellar and galactic scales, 3D structure is revealed!
     */
    update(dSunAU) {
      // Always visible; points are rendered with sizeAttenuation: false
      // for crisp visual clarity at all scales.
    },
  };
}

/**
 * Creates Extragalactic Cosmos:
 * - Andromeda Galaxy (M31, 2.537 Mly): 3D tilted spiral disk with nucleus & satellite dwarfs M32/M110
 * - Triangulum Galaxy (M33, 2.73 Mly): Face-on pinwheel spiral galaxy
 * - Large Magellanic Cloud (LMC, 163 kly): Barred irregular dwarf galaxy with Tarantula Nebula
 * - Small Magellanic Cloud (SMC, 204 kly): Irregular dwarf galaxy
 * - Deep Space Galaxies & Cosmic Web: 1,000+ distant background galaxies across intergalactic space
 */
export function createExtragalacticCosmos() {
  const group = new THREE.Group();
  group.name = 'ExtragalacticCosmos';

  const rnd = createRng(987654321);
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.707;
  const pTex = getParticleTexture();

  // ── 1. Andromeda Galaxy (M31) ─────────────────────────────────────────────
  // RA: 00h 42.7m (10.68°), Dec: +41° 16' (41.27°), Distance: 2.537 Mly
  const ANDROMEDA_DIR = raDecToWorld(10.68 * DEG, 41.27 * DEG, new THREE.Vector3()).normalize();
  const ANDROMEDA_DIST_KM = 2.537e6 * LY_KM;
  const andromedaCenter = ANDROMEDA_DIR.clone().multiplyScalar(ANDROMEDA_DIST_KM);

  const M31_STAR_COUNT = 8500;
  const m31Pos = new Float32Array(M31_STAR_COUNT * 3);
  const m31Col = new Float32Array(M31_STAR_COUNT * 3);

  // M31 disk orientation (inclination ~77° to line of sight)
  const m31Normal = new THREE.Vector3(0.35, 0.88, 0.32).normalize();
  const m31U = new THREE.Vector3().crossVectors(m31Normal, new THREE.Vector3(0, 1, 0)).normalize();
  const m31V = new THREE.Vector3().crossVectors(m31Normal, m31U).normalize();

  const M31_RADIUS_KM = 110000 * LY_KM; // 110,000 ly radius (~220,000 ly diameter)

  for (let i = 0; i < M31_STAR_COUNT; i++) {
    // Dense central nucleus + 2 spiral arms
    const isBulge = i < 2200;
    let r, th, z;
    if (isBulge) {
      r = Math.pow(rnd(), 2.0) * M31_RADIUS_KM * 0.22;
      th = rnd() * Math.PI * 2;
      z = gauss() * M31_RADIUS_KM * 0.08;
    } else {
      const armChoice = (i % 2) * Math.PI;
      const t = rnd() * 2.8 * Math.PI;
      r = M31_RADIUS_KM * (0.2 + 0.8 * (t / (2.8 * Math.PI))) + gauss() * M31_RADIUS_KM * 0.07;
      th = armChoice + t;
      z = gauss() * M31_RADIUS_KM * 0.025;
    }

    const p = andromedaCenter.clone()
      .addScaledVector(m31U, r * Math.cos(th))
      .addScaledVector(m31V, r * Math.sin(th))
      .addScaledVector(m31Normal, z);

    m31Pos[i * 3] = p.x;
    m31Pos[i * 3 + 1] = p.y;
    m31Pos[i * 3 + 2] = p.z;

    // Golden-orange nucleus, cyan-blue spiral arms
    if (isBulge) {
      m31Col[i * 3] = 1.0;
      m31Col[i * 3 + 1] = 0.88;
      m31Col[i * 3 + 2] = 0.62;
    } else {
      m31Col[i * 3] = 0.72 + 0.25 * rnd();
      m31Col[i * 3 + 1] = 0.84 + 0.15 * rnd();
      m31Col[i * 3 + 2] = 1.0;
    }
  }

  const m31Geo = new THREE.BufferGeometry();
  m31Geo.setAttribute('position', new THREE.BufferAttribute(m31Pos, 3));
  m31Geo.setAttribute('color', new THREE.BufferAttribute(m31Col, 3));

  const m31Mat = new THREE.PointsMaterial({
    size: 2.0,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: pTex,
  });
  const m31Mesh = new THREE.Points(m31Geo, m31Mat);
  m31Mesh.frustumCulled = false;
  group.add(m31Mesh);

  // ── 2. Triangulum Galaxy (M33) ─────────────────────────────────────────────
  // RA: 01h 33.8m (23.46°), Dec: +30° 39' (30.66°), Distance: 2.73 Mly
  const M33_DIR = raDecToWorld(23.46 * DEG, 30.66 * DEG, new THREE.Vector3()).normalize();
  const M33_DIST_KM = 2.73e6 * LY_KM;
  const m33Center = M33_DIR.clone().multiplyScalar(M33_DIST_KM);

  const M33_STAR_COUNT = 4500;
  const m33Pos = new Float32Array(M33_STAR_COUNT * 3);
  const m33Col = new Float32Array(M33_STAR_COUNT * 3);

  const M33_RADIUS_KM = 30000 * LY_KM; // 30,000 ly radius
  const m33Normal = new THREE.Vector3(0.72, 0.35, 0.60).normalize();
  const m33U = new THREE.Vector3().crossVectors(m33Normal, new THREE.Vector3(0, 1, 0)).normalize();
  const m33V = new THREE.Vector3().crossVectors(m33Normal, m33U).normalize();

  for (let i = 0; i < M33_STAR_COUNT; i++) {
    const isBulge = i < 900;
    let r, th, z;
    if (isBulge) {
      r = Math.pow(rnd(), 1.8) * M33_RADIUS_KM * 0.25;
      th = rnd() * Math.PI * 2;
      z = gauss() * M33_RADIUS_KM * 0.08;
    } else {
      const armChoice = (i % 2) * Math.PI;
      const t = rnd() * 2.5 * Math.PI;
      r = M33_RADIUS_KM * (0.2 + 0.8 * (t / (2.5 * Math.PI))) + gauss() * M33_RADIUS_KM * 0.08;
      th = armChoice + t;
      z = gauss() * M33_RADIUS_KM * 0.03;
    }

    const p = m33Center.clone()
      .addScaledVector(m33U, r * Math.cos(th))
      .addScaledVector(m33V, r * Math.sin(th))
      .addScaledVector(m33Normal, z);

    m33Pos[i * 3] = p.x;
    m33Pos[i * 3 + 1] = p.y;
    m33Pos[i * 3 + 2] = p.z;

    // Cyan-blue star-forming tint with pink NGC 604 nebular spots
    if (rnd() < 0.06) {
      m33Col[i * 3] = 1.0; m33Col[i * 3 + 1] = 0.35; m33Col[i * 3 + 2] = 0.65; // H II nebulae
    } else {
      m33Col[i * 3] = 0.75; m33Col[i * 3 + 1] = 0.90; m33Col[i * 3 + 2] = 1.0;
    }
  }

  const m33Geo = new THREE.BufferGeometry();
  m33Geo.setAttribute('position', new THREE.BufferAttribute(m33Pos, 3));
  m33Geo.setAttribute('color', new THREE.BufferAttribute(m33Col, 3));

  const m33Mat = new THREE.PointsMaterial({
    size: 1.8,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: pTex,
  });
  const m33Mesh = new THREE.Points(m33Geo, m33Mat);
  m33Mesh.frustumCulled = false;
  group.add(m33Mesh);

  // ── 3. Large & Small Magellanic Clouds (LMC & SMC) ────────────────────────
  // LMC: RA 05h 23.6m (80.89°), Dec -69° 45' (-69.76°), 163,000 ly
  const LMC_DIR = raDecToWorld(80.89 * DEG, -69.76 * DEG, new THREE.Vector3()).normalize();
  const lmcCenter = LMC_DIR.clone().multiplyScalar(163000 * LY_KM);

  // SMC: RA 00h 52.6m (13.19°), Dec -72° 50' (-72.83°), 204,000 ly
  const SMC_DIR = raDecToWorld(13.19 * DEG, -72.83 * DEG, new THREE.Vector3()).normalize();
  const smcCenter = SMC_DIR.clone().multiplyScalar(204000 * LY_KM);

  const MAG_COUNT = 3200;
  const magPos = new Float32Array(MAG_COUNT * 3);
  const magCol = new Float32Array(MAG_COUNT * 3);

  for (let i = 0; i < MAG_COUNT; i++) {
    const isLMC = i < 2100;
    const center = isLMC ? lmcCenter : smcCenter;
    const radius = (isLMC ? 14000 : 7000) * LY_KM;

    const r = Math.pow(rnd(), 1.5) * radius;
    const th = rnd() * Math.PI * 2;
    const phi = (rnd() - 0.5) * Math.PI;

    const p = center.clone().add(new THREE.Vector3(
      r * Math.cos(th) * Math.cos(phi),
      r * Math.sin(phi),
      r * Math.sin(th) * Math.cos(phi)
    ));

    magPos[i * 3] = p.x;
    magPos[i * 3 + 1] = p.y;
    magPos[i * 3 + 2] = p.z;

    // LMC Tarantula Nebula glowing knot
    if (isLMC && i < 150) {
      magCol[i * 3] = 1.0; magCol[i * 3 + 1] = 0.4; magCol[i * 3 + 2] = 0.7;
    } else {
      magCol[i * 3] = 0.88; magCol[i * 3 + 1] = 0.92; magCol[i * 3 + 2] = 1.0;
    }
  }

  const magGeo = new THREE.BufferGeometry();
  magGeo.setAttribute('position', new THREE.BufferAttribute(magPos, 3));
  magGeo.setAttribute('color', new THREE.BufferAttribute(magCol, 3));

  const magMat = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: pTex,
  });
  const magMesh = new THREE.Points(magGeo, magMat);
  magMesh.frustumCulled = false;
  group.add(magMesh);

  // ── 4. Deep Field Galaxies & Intergalactic Space ───────────────────────────
  // 1,200 distant background galaxies distributed across the intergalactic void
  const DEEP_COUNT = 1200;
  const deepPos = new Float32Array(DEEP_COUNT * 3);
  const deepCol = new Float32Array(DEEP_COUNT * 3);

  for (let i = 0; i < DEEP_COUNT; i++) {
    // Distances from 5 Mly out to 50 Mly
    const dLy = (5e6 + 45e6 * rnd());
    const dKm = dLy * LY_KM;

    // Isotropic spherical distribution
    const cosT = rnd() * 2 - 1;
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = rnd() * Math.PI * 2;

    deepPos[i * 3] = dKm * sinT * Math.cos(phi);
    deepPos[i * 3 + 1] = dKm * cosT;
    deepPos[i * 3 + 2] = dKm * sinT * Math.sin(phi);

    // Galaxy classification colors: Ellipticals (golden-red), Spirals (blue/white)
    const gType = rnd();
    if (gType < 0.45) {
      // Elliptical galaxy (red-golden)
      deepCol[i * 3] = 1.0; deepCol[i * 3 + 1] = 0.78; deepCol[i * 3 + 2] = 0.52;
    } else if (gType < 0.80) {
      // Spiral galaxy (cyan-blue)
      deepCol[i * 3] = 0.65; deepCol[i * 3 + 1] = 0.85; deepCol[i * 3 + 2] = 1.0;
    } else {
      // Luminous starburst / quasar point
      deepCol[i * 3] = 0.95; deepCol[i * 3 + 1] = 0.98; deepCol[i * 3 + 2] = 1.0;
    }
  }

  const deepGeo = new THREE.BufferGeometry();
  deepGeo.setAttribute('position', new THREE.BufferAttribute(deepPos, 3));
  deepGeo.setAttribute('color', new THREE.BufferAttribute(deepCol, 3));

  const deepMat = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: pTex,
  });
  const deepMesh = new THREE.Points(deepGeo, deepMat);
  deepMesh.frustumCulled = false;
  group.add(deepMesh);

  return {
    group,
    m31Mesh,
    m33Mesh,
    magMesh,
    deepMesh,
    andromedaCenter,
    m33Center,
    lmcCenter,
    smcCenter,
  };
}

/**
 * Educational Astronomical Data Catalog for Galaxies
 */
export const GALAXY_CATALOG = {
  milkyway: {
    id: 'milkyway',
    nameZh: 'Milky Way Galaxy',
    nameEn: 'Milky Way Galaxy (Sagittarius A*)',
    kind: 'galaxy',
    type: 'Barred Spiral Galaxy (SBbc)',
    diameter: '100,000 light-years (~30 kpc)',
    stars: '100 to 400 billion stars',
    mass: '1.15 to 1.5 trillion solar masses',
    centralObject: 'Sagittarius A* (Supermassive Black Hole, 4.15 million M☉)',
    solarLocation: 'Orion-Cygnus Arm (Orion Spur), 26,000 light-years from Center',
    rotationSpeed: '220 km/s (Takes 230 million years for one Galactic Year)',
    desc: 'Our home galaxy is a colossal barred spiral galaxy spanning 100,000 light-years. Our Sun and Solar System reside in the Orion-Cygnus Spur, orbiting the supermassive black hole Sagittarius A* once every 230 million years. The galaxy features four primary spiral arms, majestic interstellar dark dust lanes, and vast nebulae.',
    viewDist: 100000 * LY_KM,
  },
  andromeda: {
    id: 'andromeda',
    nameZh: 'Andromeda Galaxy',
    nameEn: 'Andromeda Galaxy (M31)',
    kind: 'galaxy',
    type: 'Barred Spiral Galaxy (SA(s)b)',
    distance: '2.537 million light-years (778 kpc)',
    diameter: '220,000 light-years',
    stars: 'Approx. 1 trillion stars (Largest in Local Group)',
    collision: 'Approaching the Milky Way at 110 km/s; will merge in ~4.5 billion years',
    desc: 'The Andromeda Galaxy (Messier 31) is the largest galaxy in our Local Group, containing approximately one trillion stars. It is accompanied by satellite dwarf galaxies M32 and M110. Gravitationally bound to the Milky Way, the two giant galaxies are moving toward each other and will merge in approximately 4.5 billion years.',
    viewDist: 300000 * LY_KM,
  },
  triangulum: {
    id: 'triangulum',
    nameZh: 'Triangulum Galaxy',
    nameEn: 'Triangulum Galaxy (M33)',
    kind: 'galaxy',
    type: 'Unbarred Spiral Galaxy (SA(s)cd)',
    distance: '2.73 million light-years',
    diameter: '60,000 light-years',
    stars: 'Approx. 40 billion stars',
    features: 'Hosts NGC 604, one of the largest known star-forming H II regions (1,500 ly wide)',
    desc: 'The Triangulum Galaxy (Messier 33) is the third-largest member of the Local Group. Its open, face-on spiral arms glow brightly with young blue star clusters and massive stellar nurseries, including NGC 604, an immense H II emission nebula containing over 200 massive O-type stars.',
    viewDist: 80000 * LY_KM,
  },
  lmc: {
    id: 'lmc',
    nameZh: 'Large Magellanic Cloud',
    nameEn: 'Large Magellanic Cloud (LMC)',
    kind: 'galaxy',
    type: 'Magellanic Spiral / Dwarf Irregular',
    distance: '163,000 light-years (50 kpc)',
    diameter: '14,000 light-years',
    stars: 'Approx. 20 billion stars',
    features: 'Tarantula Nebula (30 Doradus) & Supernova 1987A remnant',
    desc: 'The Large Magellanic Cloud is a prominent satellite galaxy orbiting the Milky Way in the southern celestial hemisphere. It is home to the Tarantula Nebula (30 Doradus), the most active starburst region known in the entire Local Group of galaxies.',
    viewDist: 25000 * LY_KM,
  },
  smc: {
    id: 'smc',
    nameZh: 'Small Magellanic Cloud',
    nameEn: 'Small Magellanic Cloud (SMC)',
    kind: 'galaxy',
    type: 'Dwarf Irregular Galaxy (dIrr)',
    distance: '204,000 light-years (61 kpc)',
    diameter: '7,000 light-years',
    stars: 'Approx. 3 billion stars',
    desc: 'The Small Magellanic Cloud is a dwarf irregular satellite galaxy interacting gravitationally with the LMC and the Milky Way, connected by the Magellanic Bridge of hydrogen gas.',
    viewDist: 15000 * LY_KM,
  },
};
