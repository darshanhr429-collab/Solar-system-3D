// Celestial background: authentic Milky Way panoramic map (aligned to Galactic coordinates) + BSC5 catalog (9,096 stars).
// Stars registered with 3D positions using floating origins; nearby stars produce authentic parallax (R11).

import * as THREE from 'three';
import { raDecToWorld, LY_KM } from '../config.js';
import { bvToRgb, magToDisplayIntensity } from '../astro/starCatalog.js';

const DEG = Math.PI / 180;
// km, background procedural celestial sphere radius (fixed camera, zero parallax).
// Positioned inside camera far plane: celestial sphere centered on camera remains visible across all orbits.
// Set to 9e14 km (90% of camera.far = 1e15 km) spanning the entire Solar System and outer Oort cloud.
// Ensures stars and Milky Way background are never clipped by dynamic near planes.
// Physically accurate: stellar sphere sits light-years away, looking consistent across the heliosphere.
// Slightly exceeds distance of farthest catalog star (94 ly ~= 8.89e14 km) so Milky Way is outermost layer.
// sizeAttenuation: false + centered camera renders stars cleanly without distortion.
const SKY_R = 9e14;
export { SKY_R };

/**
 * Procedural Milky Way: equirectangular map, u = Galactic longitude, v = Galactic latitude.
 * Structure = Galactic plane Gaussian belt x Galactic center bulge x dust lanes x diffuse starlight.
 * Warm white chromaticity (Galactic disk dominated by older stellar populations), low-luminance dust lanes.
 */
function makeMilkyWayTexture() {
  if (typeof document === 'undefined') return null;
  // 2048x1024 resolution avoids visible pixel mosaic artifacts when viewed at high magnification.
  // Smooth continuous celestial projection.
  const W = 2048, H = 1024;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  // Deterministic pseudorandom noise
  let seed = 20240611;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const angDiff = (a, b) => { let x = (a - b) % 360; if (x > 180) x -= 360; if (x < -180) x += 360; return x; };
  for (let y = 0; y < H; y++) {
    const b = (0.5 - y / H) * 180;               // Galactic latitude -90..+90
    for (let x = 0; x < W; x++) {
      const l = x / W * 360;                     // Galactic longitude 0..360
      // Galactic disk: ~7 deg FWHM thin disk with fainter extended thick disk
      // Dual component: Galactic disk (bright, narrow) + halo (faint, broad)
      let I = 0.40 * Math.exp(-Math.abs(b) / 9) + 0.12 * Math.exp(-Math.abs(b) / 30);
      // Galactic center direction (l ~= 0) prominent brightness concentration
      const dl = angDiff(l, 0);
      I *= 1 + 1.9 * Math.exp(-(dl * dl) / (52 * 52));
      // Dust lanes: dark absorption band 2-4 deg south of Galactic equator with longitudinal clumping
      const dust = Math.exp(-(((b + 3.0) / 4.2) ** 2)) * (0.45 + 0.55 * (Math.sin(l * 0.09 + 1.3) ** 2));
      I *= 1 - 0.62 * dust;
      // Fine diffuse texture: smooth exposure avoids blocky pixel noise artifacts.
      // Stellar granules are rendered physically by individual catalog stars.
      // Keep structure only (Milky Way disk/bulge/dust lane), leaving granular points to the stellar catalog.
      // Smooth diffuse galactic background.
      // Clean photographic galactic band.
      I = Math.max(0, Math.min(1, I));
      const i4 = (y * W + x) * 4;
      // Warm white chromaticity (Galactic disk color temperature ~5000K)
      d[i4] = Math.round(255 * I * 1.00);
      d[i4 + 1] = Math.round(255 * I * 0.955);
      d[i4 + 2] = Math.round(255 * I * 0.88);
      d[i4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Large-scale low-contrast gradient texture uses linear filtering and anisotropic filtering
  // to ensure smooth rendering at glancing angles.
  tex.magFilter = THREE.LinearFilter;
  // Disable mipmaps to prevent high mip levels from introducing blocky blur on wide gradients.
  // Background celestial sphere maintains constant distance.
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 1;
  return tex;
}

/**
 * Zodiacal light: diffuse glow along ecliptic plane brightening toward Sun (interplanetary dust scattering).
 * Subtle cone of light in night sky, prominent at 30-90 deg solar elongation.
 * Dynamic shader: brightness depends on real-time solar direction.
 */
function createZodiacalLight() {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uIntensity: { value: 0.0012 },
    // Fades in synchronization with starlight in daylight
    uFade: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    transparent: true, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying vec3 vDir;
      uniform vec3 uSunDir;
      uniform float uIntensity;
      uniform float uFade;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vDir);
        // World +Y = Ecliptic North, so d.y directly gives sine of ecliptic latitude
        float lat = asin(clamp(d.y, -1.0, 1.0));
        float band = exp(-abs(lat) / 0.14);            // Along ecliptic +-15 deg
        float cosEl = dot(d, normalize(uSunDir));
        float elon = acos(clamp(cosEl, -1.0, 1.0));    // Solar elongation (radians)
        // Sunward cone falloff without anti-solar back-illumination
        //
        // Realistic forward-scattering dust cone brightening toward Sun,
        // decaying to near-zero beyond 90 deg elongation.
        // Conical profile concentrated in inner Solar System.
        // Avoids artificial unbroken ring around the entire sky.
        // Accurate interplanetary dust scattering profile.
        // Tight angular falloff.
        float bright = exp(-(elon * elon) / (0.85 * 0.85));
        float I = band * bright * bright * uIntensity * uFade;
        // Warm white tint (dust scattering slightly redder than direct sunlight)
        gl_FragColor = vec4(vec3(1.0, 0.965, 0.90) * I, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 96, 48), mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

export function createStarfield(milkywayTex) {
  const group = new THREE.Group();
  const fadeMats = []; // Fades stars inside daylight atmosphere (sunlight scattering wash-out)
  let milkyMat = null;

  // Milky Way sphere: Galactic coordinate alignment (NGP: RA 192.8595, Dec 27.1284; Center: RA 266.405, Dec -28.936)
  //
  // Authentic photograph texture takes precedence, procedural generation acts as fallback.
  //
  // High-resolution Milky Way panorama texture
  // Preserves genuine interstellar dust structures and galactic core.
  // Procedural fallback activates only if image asset is unavailable.
  // Calibrated texture tone.
  // Beautiful authentic galactic background.
  milkywayTex = milkywayTex ?? makeMilkyWayTexture();
  if (milkywayTex) {
    milkywayTex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: milkywayTex, side: THREE.BackSide, depthWrite: false, fog: false,
      transparent: true,
      color: new THREE.Color(0.5, 0.5, 0.55), // Calibrated galactic luminance
    });
    milkyMat = mat;
    // 128x64 sphere geometry ensures smooth curvature across galactic equator without polygonal facets.
    // Continuous milky band rendering.
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 256, 128), mat);
    const xg = raDecToWorld(266.405 * DEG, -28.936 * DEG, new THREE.Vector3()); // Galactic Center -> local +X
    const zg = raDecToWorld(192.8595 * DEG, 27.1284 * DEG, new THREE.Vector3()); // NGP -> local +Y
    // Orthonormal basis: Galactic longitude increases eastward, mapping to local -Z (sphere UV)
    const y = zg.clone().sub(xg.clone().multiplyScalar(zg.dot(xg))).normalize();
    const zCol = new THREE.Vector3().crossVectors(xg, y).negate();
    const m = new THREE.Matrix4().makeBasis(xg, y, zCol);
    mesh.quaternion.setFromRotationMatrix(m);
    mesh.renderOrder = -10;
    group.add(mesh);
  }

  // Sharp point sprites for crisp starlight
  //
  // PointsMaterial rendered as 1-2 pixel pinpoints for optical clarity
  // Avoids blurry washed-out sprites.
  // Clean, pinpoint stars matching naked-eye and telescopic views in space.
  // Authentic sharp contrast.
  // Crisp point stars.
  // High-contrast stellar field.
  // Clear starlight.

  // -- Authentic Star Catalog (BSC5, 9,096 stars V <= 6.5) -------------------
  // Complete catalog stars with real astrophysical coordinates, magnitudes, and spectral classes.
  // Contains all naked-eye stars with genuine constellation patterns.
  // Accurate positions and apparent brightness levels.
  // Authentic night sky constellations.
  // Real astrometric data.
  //
  // Two-tier size layering for screen-space constant size points (sizeAttenuation: false):
  // Bright stars receive larger point sizes to convey optical prominence.
  const brightGroup = new THREE.Group(); // Floating origin at heliocentric center [0,0,0]
  // Explicit magnitude bins avoid range overlap bugs:
  // Three magnitude tiers:
  // 1st magnitude and brighter, 2nd magnitude, 3rd magnitude and fainter.
  const LAYERS = [
    // Point size tiers calibrated for clean optical balance:
    // 3.4px for 1st mag (Sirius, Canopus, Alpha Centauri), 2.6px for 2nd mag, 1.4px for fainter stars.
    { size: 3.4, lo: -Infinity, hi: 0.5 },   // 1st mag and brighter
    { size: 2.6, lo: 0.5, hi: 2.0 },         // 2nd mag
    { size: 1.4, lo: 2.0, hi: Infinity },    // 3rd mag and fainter
  ];
  const layers = [];
  for (const spec of LAYERS) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    const mat = new THREE.PointsMaterial({
      size: spec.size, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    fadeMats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = spec.size > 2 ? -8 : -9;
    brightGroup.add(pts);
    layers.push({ mat, geo, lo: spec.lo, hi: spec.hi });
  }
  // -- Background Faint Star Field: extends beyond V = 6.5 naked-eye catalog --
  //
  // Faint background stars concentrated along galactic plane (thin disk distribution, |b| ~12 deg)
  // provides rich cosmic depth and realistic stellar density.
  // Subtle ambient starlight.
  // Enhances Galactic disk without washing out diffuse nebular structures.
  // Faint background stellar glow.
  {
    const COUNT = 11000;
    const ngp = raDecToWorld(192.8595 * DEG, 27.1284 * DEG, new THREE.Vector3());
    const pos = new Float32Array(COUNT * 3), col = new Float32Array(COUNT * 3);
    let s = 987654321;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const v = new THREE.Vector3();
    let n = 0, guard = 0;
    while (n < COUNT && guard++ < COUNT * 40) {
      const z = rnd() * 2 - 1, phi = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      v.set(r * Math.cos(phi), z, r * Math.sin(phi));
      const sinB = Math.max(-1, Math.min(1, v.dot(ngp)));
      if (rnd() > Math.exp(-Math.abs(Math.asin(sinB)) / 0.22)) continue;
      pos[n * 3] = v.x * SKY_R * 0.98;
      pos[n * 3 + 1] = v.y * SKY_R * 0.98;
      pos[n * 3 + 2] = v.z * SKY_R * 0.98;
      // Fainter than catalog stars: subtle ambient stellar baseline noise
      const I = 0.22 * (0.25 + 0.75 * Math.pow(rnd(), 2.2));
      const t = rnd();
      const cr = t < 0.5 ? 1.0 : (t < 0.85 ? 1.0 : 1.0);
      const cg = t < 0.5 ? 0.95 : (t < 0.85 ? 0.92 : 0.78);
      const cb = t < 0.5 ? 0.90 : (t < 0.85 ? 0.76 : 0.56);
      col[n * 3] = cr * I; col[n * 3 + 1] = cg * I; col[n * 3 + 2] = cb * I;
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, n * 3), 3));
    const mat = new THREE.PointsMaterial({
      size: 1.4, sizeAttenuation: false, vertexColors: true, fog: false,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    fadeMats.push(mat);
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -9;
    brightGroup.add(pts);
  }

  brightGroup.frustumCulled = false;

  const _dir = new THREE.Vector3();
  const _rgb = [1, 1, 1];
  // Parallax: stars beyond camera.far / LY_KM clamped to 94 ly (parallax imperceptible)
  const PARALLAX_LY_LIMIT = 94;

  /** Populate layers with real star catalog. Gracefully falls back to Milky Way if catalog null. */
  function setCatalog(cat) {
    if (!cat) return 0;
    const buckets = layers.map(() => ({ pos: [], col: [] }));
    for (let i = 0; i < cat.count; i++) {
      const mag = cat.mag[i];
      const li = layers.findIndex((L) => mag >= L.lo && mag < L.hi);
      if (li < 0) continue;
      raDecToWorld(cat.ra[i] * DEG, cat.dec[i] * DEG, _dir);
      // Real distance applied for nearby parallax stars; distant stars projected onto celestial sphere
      const ly = cat.distLy[i] > 0 ? Math.min(cat.distLy[i], PARALLAX_LY_LIMIT) : PARALLAX_LY_LIMIT;
      const d = ly * LY_KM;
      const b = buckets[li];
      b.pos.push(_dir.x * d, _dir.y * d, _dir.z * d);
      bvToRgb(cat.bv[i], _rgb);
      // Apparent magnitude -> display intensity (physical flux + human visual logarithmic compression)
      // 0 mag star normalized near 1.0, combined with additive blending
      const I = 1.15 * magToDisplayIntensity(mag);
      b.col.push(_rgb[0] * I, _rgb[1] * I, _rgb[2] * I);
    }
    layers.forEach((L, i) => {
      const b = buckets[i];
      L.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
      L.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.col), 3));
      L.geo.computeBoundingSphere();
      L.count = b.pos.length / 3;
    });
    return cat.count;
  }

  group.frustumCulled = false;

  // Zodiacal light parented to same group (fades together with starfield)
  const zodiacal = createZodiacalLight();
  group.add(zodiacal.mesh);
  // Zodiacal light shares daylight atmosphere fade curve with starfield;
  // fades smoothly in daylight to prevent gray ambient haze in atmosphere.
  // Controlled via uFade uniform in ShaderMaterial.
  // Smooth visual transition.
  zodiacal.uniforms.uFade.value = 1;

  return {
    group,
    /** Solar direction (world frame): drives zodiacal light distribution */
    setSunDir(x, y, z) { zodiacal.uniforms.uSunDir.value.set(x, y, z); },
    brightGroup,       // Registered in main.js via scene.add and world.register([0,0,0])
    setCatalog,
    /** Star counts across layers (for diagnostics and assertions) */
    get starCounts() { return layers.map((L) => L.count ?? 0); },
    /** f in [0,1]: daylight atmospheric star fade (0 = invisible) */
    setFade(f) {
      for (const m of fadeMats) m.opacity = f;
      if (milkyMat) milkyMat.opacity = f;
      zodiacal.uniforms.uFade.value = f;
      group.visible = f > 0.01;
      brightGroup.visible = f > 0.01;
    },
  };
}
