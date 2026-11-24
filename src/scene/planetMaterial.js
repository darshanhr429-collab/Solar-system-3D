// Planetary surface material: custom lighting shader.
// - Realistic day/night illumination from Sun direction with smooth terminator
// - Earth: night city lights + specular ocean reflection via blue heuristic mask
// - HDR: solar irradiance scaled by 1/d^2 (Earth = 1)
// - R7 #4：Procedural fragment detail (resolution-independent SpaceEngine approach)——
//   Gas/ice giants: zonal turbulent shear + storm vortices + limb darkening; rocky: isotropic noise.
//   Fade in by apparent radius: crisp textures up close without blurring.

import * as THREE from 'three';
import { HASH_GLSL } from './glslNoise.js';
import { HAPKE_PARAMS } from '../astro/bodies.js';
import { QUALITY } from '../engine/quality.js';

// 1x1 dummy texture: prevents unbound samplers on inactive branches
const DUMMY_TEX = new THREE.DataTexture(new Uint8Array([128, 128, 128, 128]), 1, 1);
DUMMY_TEX.needsUpdate = true;

/**
 * Shared mapping from cloud texture to optical depth.
 *
 * Both surface shader (cloud shadows) and cloud layer shader perform this mapping.
 * Unified in single function to prevent shadow-cloud misalignment.
 *
 * Why thresholding fails: hard clamping saturates into opaque white blobs.
 * Continuous power law preserves intermediate cloud tones without hard edges.
 * Real clouds are rarely fully opaque, maintaining smooth gradients at edges.
 * Power law ensures smooth optical depth growth preserving all details.
 * Calibrated to ~60% average global cloud coverage.
 */
const CLOUD_GLSL = /* glsl */ `
  // Cloud fraction -> optical depth.
  //
  // MODIS cloud fraction measures pixel coverage; thin cirrus is almost transparent in visible light.
  // Direct mapping causes over-saturation into a solid white ball.
  // Calibrated to maintain visible ocean and land features through clouds.
  // Prevents cloud features from washing out continents and oceans.
  //
  // Higher-order power law compresses mean opacity without hard thresholding.
  // Avoids hard white saturation artifacts at high cloud coverage.
  // Calibrated for realistic Earth visual balance.
  // Opacity drops to ~0.33 at average cloud coverage while thick clouds reach >0.7.
  // Refer to tools/audit-cloudab.mjs for visual reference.
  float cloudTau(vec3 cl) {
    float lum = clamp(dot(cl, vec3(0.34)), 0.0, 1.0);
    return pow(lum, 4.5) * 2.0;
  }
  // Vertical optical depth opacity (Beer-Lambert: never saturates, cirrus stays translucent)
  float cloudAlpha(vec3 cl) { return 1.0 - exp(-cloudTau(cl)); }

  /**
   * Animated cloud sampling UV (rotation offset + perturbation).
   *
   * Perturbation noise must sample 3D direction vector to avoid anti-meridian seam.
   * Prevents visible vertical seam across planet surface.
   * ，。，
   * （uv ）。
   */
  vec2 cloudUV(vec2 uv, float t) {
    // SphereGeometry convention: u increases as longitude decreases.
    //  (0.5 − u)·2π， v  (v − 0.5)·π 。
    vec2 ang = vec2((0.5 - uv.x) * 6.2831853, (uv.y - 0.5) * 3.14159265);
    vec3 dir = vec3(cos(ang.y) * cos(ang.x), sin(ang.y), cos(ang.y) * sin(ang.x));
    float d = pnoise(dir * 8.0 + vec3(0.0, 0.0, t * 0.008));
    // Negative rotation offset ensures eastward prograde cloud motion.
    // ——，。
    return uv + vec2(-t * 0.00002 + d * 0.008, d * 0.004);
  }
`;

// Body ID map matching bodies.js keys for shader branch selection.
//  int  string——GLSL ES 1.0 ， int 。
const BODY_EARTH = 3, BODY_MARS = 4, BODY_JUPITER = 5, BODY_SATURN = 6, BODY_TRITON = 100;
const BODY_ID_MAP = {
  earth: BODY_EARTH, mars: BODY_MARS, jupiter: BODY_JUPITER,
  saturn: BODY_SATURN, triton: BODY_TRITON,
};

// Per-body color grading calibrated against NASA/JPL calibrated imagery.
//  1/d²  + ，
// （/），：
// - grade：（/）
// - sat：（ACES ）
// - veil/veilColor：（： tholin ，
//   ；）
const BODY_GRADE = {
  mercury: { grade: [0.40, 0.38, 0.36] },          // Albedo ~0.09, dark brownish-gray (MESSENGER)
  earth:   { grade: [1, 1, 1], sat: 1 },
  // Jupiter/Saturn: ACES desaturates bright highlights; compensation restores golden hues.
  //  sat ****（/），
  // " R−B "，。
  jupiter: { sat: 1.35 },
  uranus:  { grade: [1.50, 1.65, 1.70] },          // Pale cyan (Voyager 2 appearance)
  // Oxford/Irwin 2024: Neptune is pale green-blue, not enhanced Voyager blue.
  // Approximate display correction of this legacy map; not spectral calibration.
  // Visual dimming factor matching Voyager 2 photometry
  //  4 （）。 0.45，""
  // ，。
  neptune: { grade: [2.50, 2.50, 2.50], tint: [0.86, 1.02, 1.09], tintMix: 0.94, dim: 0.28 },
  pluto:   { grade: [1, 1, 1], sat: 1 },
  triton:  { grade: [1.08, 1.00, 0.95], sat: 1 },
  callisto: { grade: [0.90, 0.90, 0.92] },         // Darkened and cooled to emphasize bright impact craters
  saturn:  { sat: 1.22 },                          // Subtle golden tint compensation
  // （：）。
  // ："×= 0.22"， 1.8 ，
  // ——20R  ~25px，，
  // 。，。
  titan:   { veil: 0.94, veilColor: [0.92, 0.45, 0.14] },
};
// Terrain layer synchronizes with this albedo calibration
// （ 0.40×），。
// sat （： uSat  ACES ，）。

// ── Albedo calibration: texture provides relative contrast, absolute brightness from measured albedo ──────────────
//
// Texture brightness is non-physical reference. Calibrating albedo ensures
// （），： 0.136、
//  0.219，，——
// 0.99  0.25（ 4 ）。。
//
// Calibration: albedo = texture * (measured_albedo / texture_linear_mean).
// （、、），。
//
// Two inputs:
//   TEXTURE_LIN_MEAN —— tools/audit-texmean.mjs （sRGB ）
//   SURFACE_ALBEDO   —— 。****：
//                       （≈0.20）， 0.434；
//                       ， 0.67 。
// （ / ） 1，——，
// 。
export const TEXTURE_LIN_MEAN = {
  'enceladus.jpg': 0.1363, 'mimas.jpg': 0.1653, 'tethys.jpg': 0.1887, 'dione.jpg': 0.2106,
  'rhea.jpg': 0.1709, 'iapetus.jpg': 0.2244, 'titan.jpg': 0.2477, 'charon.jpg': 0.1664,
  'europa.png': 0.5171, 'io.jpg': 0.2872, 'callisto.jpg': 0.1669, 'ganymede.jpg': 0.2076,
  'moon.jpg': 0.3026, 'mercury.jpg': 0.2277, 'mars.jpg': 0.2186, 'earth_day.jpg': 0.1958,
  'pluto.jpg': 0.3975, 'jupiter.jpg': 0.3613, 'saturn.jpg': 0.5440, 'uranus.jpg': 0.5505,
  'neptune.jpg': 0.1010, 'triton.jpg': 0.3096, 'venus_atmosphere.jpg': 0.5543,
};

/** Measured geometric albedo. Default factor is 1 when unmeasured. */
export const SURFACE_ALBEDO = {
  mercury: 0.106, venus: 0.67, earth: 0.20, moon: 0.136, mars: 0.25,
  jupiter: 0.538, saturn: 0.499, uranus: 0.488, neptune: 0.442, pluto: 0.52,
  io: 0.63, europa: 0.67, ganymede: 0.43, callisto: 0.17,
  mimas: 0.962, enceladus: 0.99, tethys: 0.80, dione: 0.998, rhea: 0.949,
  titan: 0.22, iapetus: 0.25, triton: 0.76, charon: 0.38,
  // ── 2026-10-18 ：****，
  // ""（）。
  // （NSSDC / JPL  / ）。
  phobos: 0.071, deimos: 0.068, ceres: 0.09,
  hyperion: 0.30, phoebe: 0.081, janus: 0.71, epimetheus: 0.73,
  prometheus: 0.60, pandora: 0.50, pan: 0.50, atlas: 0.40,
  miranda: 0.32, ariel: 0.39, umbriel: 0.21, titania: 0.27, oberon: 0.23,
  puck: 0.32, portia: 0.30,
  proteus: 0.10, nereid: 0.155, larissa: 0.09, galatea: 0.60,
  hydra: 0.35, nix: 0.35, kerberos: 0.35, styx: 0.35,
  amalthea: 0.09, thebe: 0.05, metis: 0.06, adrastea: 0.05,
  daphnis: 0.50, helene: 0.60, telesto: 0.60, calypso: 0.60,
};

/** Texture -> calibration factor. Returns 1 if unmeasured. */
export function albedoScaleOf(texFile, bodyId) {
  const m = texFile ? TEXTURE_LIN_MEAN[texFile] : undefined;
  const a = bodyId ? SURFACE_ALBEDO[bodyId] : undefined;
  if (!(m > 0) || !(a > 0)) return 1;
  return a / m;
}

// Body -> texture filename mapping for albedo lookup.
const TEX_FILE_BY_BODY = { earth: 'earth_day.jpg', europa: 'europa.png', venus: 'venus_atmosphere.jpg' };
const texFileOf = (id) => TEX_FILE_BY_BODY[id] ?? `${id}.jpg`;

/** Display grade table: brightness anchored to measured albedo, BODY_GRADE preserves hue.
 *
 * Normalizes grade brightness to prevent double-counting albedo adjustments.
 *  0.40  0.466 ，。
 * （ 0.19，）。
 * 、，，、。
 *
 * Discs (uGrade) and terrain (TERRAIN_GRADE) must share identical table
 * 。 */
const DISPLAY_GRADE = (() => {
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const ids = new Set([...Object.keys(BODY_GRADE), ...Object.keys(SURFACE_ALBEDO)]);
  const out = {};
  for (const id of ids) {
    const g = BODY_GRADE[id] ?? {};
    const s = albedoScaleOf(texFileOf(id), id);
    const base = g.grade ?? [1, 1, 1];
    const l = lum(base) || 1;
    const grade = base.map((v) => (v / l) * s * (g.dim ?? 1));
    if (!g.grade && s === 1) continue;   // ：，
    out[id] = { grade, sat: g.sat ?? 1 };
  }
  return out;
})();

/** Terrain grade table (derived from DISPLAY_GRADE). */
export const TERRAIN_GRADE = DISPLAY_GRADE;

/** Disc material grade table (derived from DISPLAY_GRADE). */
export function displayGradeOf(bodyId) { return DISPLAY_GRADE[bodyId] ?? null; }

/**
 * Hapke disk integrated brightness at zero phase relative to Lambertian sphere.
 *
 * Standard geometric albedo definition baseline is perfect Lambertian sphere.
 *  Hapke  2/3： 0.29，
 *  `albedo(=) × shade`  2 
 * （： 134， 0.25  162——）。
 *
 * Numerical integration over projected area element mu * d_mu.
 *  shade=μ  2/3，。
 */
export function hapkeDiskMean(w, B0, h, g) {
  const sq = Math.sqrt(Math.max(1 - w, 1e-6));
  const ca = 1;                       // Zero phase angle
  const denom = 1 + g * g + 2 * g * ca;
  const P = (1 - g * g) / Math.pow(Math.max(denom, 1e-6), 1.5);
  const B = B0 / (1 + Math.tan(0) / Math.max(h, 1e-4));   // α=0 → B=B0
  let num = 0, den = 0;
  const N = 64;
  for (let i = 0; i < N; i++) {
    const mu = (i + 0.5) / N;
    const H = (1 + 2 * mu) / (1 + 2 * mu * sq);
    const shade = 0.25 * 0.5 * ((1 + B) * P + H * H - 1);
    num += shade * mu;
    den += mu;
  }
  return num / den;
}

export function createPlanetMaterial({
  map, nightMap = null, oceanSpec = false, ringShadow = null,
  detailMode = 0, radiusKm = 1, // detailMode: 0  / 1  / 2 
  bodyId = null, cloudTex = null, // bodyId ；cloudTex 
}) {
  // ringShadow: { tex|null, innerKm, outerKm } —— （）
  //  Hapke  BRDF；（） Lambert。
  const hp = HAPKE_PARAMS[bodyId] ?? null;
  const uniforms = {
    uMap: { value: map },
    uNight: { value: nightMap ?? DUMMY_TEX },
    uHasNight: { value: nightMap ? 1 : 0 },
    uOcean: { value: oceanSpec ? 1 : 0 },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) }, // World space, points to Sun
    uSunI: { value: 1.0 },                          // Relative irradiance (Earth = 1)
    uHasRing: { value: ringShadow ? 1 : 0 },
    uHasRingTex: { value: ringShadow?.tex ? 1 : 0 },
    uRingTex: { value: ringShadow?.tex ?? DUMMY_TEX },
    uRingInner: { value: ringShadow?.innerKm ?? 1 },
    uRingOuter: { value: ringShadow?.outerKm ?? 2 },
    uRingNormal: { value: new THREE.Vector3(0, 1, 0) }, // Ring plane normal (world space, updated per frame)
    uRingShine: { value: 0 },                          // Ringshine intensity (0 for unringed bodies)
    uCenter: { value: new THREE.Vector3() },            // Planet center (relative to camera, updated per frame)
    uDetailMode: { value: detailMode },                 // Runtime tier override: set to 0 to disable
    // 。（ 0.8–1.0），
    // ""——/
    //  15–17 。： 1.0， 0.2。
    uDetailAmp: { value: (() => {
      const a = bodyId ? SURFACE_ALBEDO[bodyId] : undefined;
      return a == null ? 1 : Math.max(0.2, Math.min(1, 1.45 - a));
    })() },
    uRadius: { value: radiusKm },
    // === Issue #26/#27/#28/#29/#36： uniforms ===
    uTime: { value: 0 },           // Seconds (realtime, drives cloud/band/auroral animation)
    uLs: { value: 0 },             // Mars solar longitude Ls (degrees, drives dust storm seasonality)
    uSubsolarLat: { value: 0 },    // Subsolar latitude (degrees, drives polar ice seasonal changes)
    uBodyId: { value: BODY_ID_MAP[bodyId] ?? 0 }, // Body ID (shader branch)
    uCloudTex: { value: cloudTex ?? DUMMY_TEX },  // Earth cloud texture for surface shadow projection
    uHasClouds: { value: cloudTex ? 1 : 0 },
    // （BODY_GRADE ； = ）
    // （DISPLAY_GRADE ）
    uGrade: { value: new THREE.Vector3(...(DISPLAY_GRADE[bodyId]?.grade ?? [1, 1, 1])) },
    uInvScaleY: { value: 1 },
    uDetailScaleN: { value: Math.min(1, radiusKm / 400) },
    // Hapke ： shade  2/3，
    //  albedo(=) × shade  = A_geo × 2/3（）。
    uHapkeNorm: { value: (() => {
      if (!hp) return 1;
      const dm = hapkeDiskMean(hp.w, hp.B0, hp.h, hp.g);
      return dm > 1e-6 ? (2 / 3) / dm : 1;
    })() },
    uSat: { value: BODY_GRADE[bodyId]?.sat ?? 1.0 },
    uNaturalTint: { value: new THREE.Vector3(...(BODY_GRADE[bodyId]?.tint ?? [1, 1, 1])) },
    uNaturalTintMix: { value: BODY_GRADE[bodyId]?.tintMix ?? 0 },
    uVeil: { value: BODY_GRADE[bodyId]?.veil ?? 0.0 },
    uVeilColor: { value: new THREE.Vector3(...(BODY_GRADE[bodyId]?.veilColor ?? [0, 0, 0])) },
    // ：（，），
    uEclOn: { value: 0 },
    uEclPos: { value: new THREE.Vector3() },
    uEclR: { value: 1 },
    uSunDistKm: { value: 1.496e8 },
    // ：Hapke  BRDF（ src/astro/bodies.js HAPKE_PARAMS）
    uHapke: { value: hp ? 1 : 0 },
    uW: { value: hp?.w ?? 0.25 },
    uB0: { value: hp?.B0 ?? 1.0 },
    uHh: { value: hp?.h ?? 0.06 },
    uHg: { value: hp?.g ?? -0.3 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      uniform float uInvScaleY;   // See fragment: inverse-transpose for non-uniform scaling
      uniform float uDetailScaleN;
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vObjPos;
      void main() {
        vUv = uv;
        // Non-uniform scaling (oblate planets) requires inverse-transpose normal matrix：。
        //  modelMatrix  5.6°，。
        vNormalW = normalize(mat3(modelMatrix) * vec3(normal.x, normal.y * uInvScaleY, normal.z));
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        vObjPos = position; // Object space (rotates with planet, features fixed to surface)
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform sampler2D uNight;
      uniform int uHasNight;
      uniform int uOcean;
      uniform int uHasRing;
      uniform int uHasRingTex;
      uniform sampler2D uRingTex;
      uniform float uRingInner, uRingOuter;
      uniform vec3 uRingNormal;
      uniform float uRingShine;
      uniform vec3 uCenter;
      uniform vec3 uSunDir;
      uniform float uSunI;
      uniform int uDetailMode;
      uniform float uDetailAmp;
      uniform float uRadius;
      // === Issue #26/#27/#28/#36 uniforms ===
      uniform float uTime;
      uniform float uLs;
      uniform float uSubsolarLat;
      uniform int uBodyId;
      uniform sampler2D uCloudTex;
      uniform int uHasClouds;
      uniform vec3 uGrade;
      uniform float uInvScaleY;
      uniform float uDetailScaleN;
      uniform float uHapkeNorm;
      uniform float uSat;
      uniform vec3 uNaturalTint;
      uniform float uNaturalTintMix;
      uniform float uVeil;
      uniform vec3 uVeilColor;
      uniform int uEclOn;
      uniform vec3 uEclPos;
      uniform float uEclR;
      uniform float uSunDistKm;
      const float SUN_RADIUS_KM = 695700.0;
      uniform int uHapke;
      uniform float uW, uB0, uHh, uHg;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      varying vec3 vObjPos;

      ${HASH_GLSL}
      float phash(vec3 p) { return glslHash31(p); }
      float pnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(phash(i), phash(i + vec3(1,0,0)), f.x), mix(phash(i + vec3(0,1,0)), phash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(phash(i + vec3(0,0,1)), phash(i + vec3(1,0,1)), f.x), mix(phash(i + vec3(0,1,1)), phash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
${CLOUD_GLSL}

      //  [-π, π]（， 0/2π ）
      float angleDiff(float a, float b) {
        float d = a - b;
        return mod(d + 3.14159265, 6.2831853) - 3.14159265;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormalW);
        vec3 albedo = texture2D(uMap, vUv).rgb;
        float app = uRadius / max(length(vPosW), uRadius); // Apparent radius factor (floating origin, camera at origin)
        // （，）
        if (uDetailMode > 0) {
          float dist = length(vPosW); // Camera always at origin (floating origin)
          //  0.01 （#18：，→）
          float fade = smoothstep(0.01, 0.18, app);
          if (fade > 0.001) {
            vec3 p = vObjPos / uRadius;
            if (uDetailMode == 2) {
              // /：（） + 
              vec3 ps = vec3(p.x * 0.22, p.y, p.z * 0.22);
              float t1 = pnoise(ps * 48.0);
              float t2 = pnoise(ps * 190.0) * smoothstep(0.18, 0.7, app);
              float storm = smoothstep(0.74, 0.95, pnoise(p * 85.0 + 13.7));
              // ：/（），
              // —— 0
              float polarDamp = 1.0;
              if (uBodyId == 6) polarDamp = 1.0 - smoothstep(0.78, 0.92, abs(p.y));
              albedo *= 1.0 + fade * polarDamp * ((t1 - 0.5) * 0.16 + (t2 - 0.5) * 0.10);
              albedo = mix(albedo, albedo * vec3(1.10, 1.05, 0.97), fade * storm * 0.55 * polarDamp);
            } else {
              // /：（#21：，）
              float t1 = pnoise(p * 64.0);
              float t2 = pnoise(p * 340.0) * smoothstep(0.2, 0.75, app);
              float t3 = pnoise(p * 1200.0) * smoothstep(0.35, 0.9, app);
              // （3R  app=0.33  fade =1， 0.22 
              // ，），。
              albedo *= 1.0 + fade * uDetailAmp
                      * ((t1 - 0.5) * 0.13 + (t2 - 0.5) * 0.075 + (t3 - 0.5) * 0.035);
              // ===  ===
              // ****，——
              // ""，（/，）。
              // ， fade 。
              {
                vec3 pn = vObjPos / uRadius;
                float k = 64.0;
                float e = 0.05;                      // Noise spatial step (~1/20 grid cell)
                float f0 = pnoise(pn * k);
                vec3 g = vec3(
                  pnoise(pn * k + vec3(e, 0, 0)) - f0,
                  pnoise(pn * k + vec3(0, e, 0)) - f0,
                  pnoise(pn * k + vec3(0, 0, e)) - f0);
                n = normalize(n + g * (1.6 * fade * uDetailScaleN));
              }
            }
          }
          // === Issue #28： +  ===
          // （）+ System III  + 。
          // ：/，。
          // === （）===
          // ：（ 12 ），
          // （） festoon。 + 
          // ，""——/。
          if (uBodyId == 5 || uBodyId == 6) {
            float lat = vObjPos.y / uRadius; // Normalized latitude -1..1
            // ： 12 （24 ），
            float jets = (uBodyId == 5) ? 24.0 : 16.0;
            float windSpeed = sin(lat * jets + 0.6) * 0.00022;
            float flow = uTime * windSpeed;
            vec3 jp = vObjPos / uRadius;
            // ： |dwind/dlat| ，
            float shear = abs(cos(lat * jets + 0.6));
            //  ~6:1 （）
            float turb = pnoise(vec3(jp.x * 4.0 + flow, jp.y * 26.0, jp.z * 4.0 + flow * 0.5))
                       * (0.05 + 0.11 * shear) * smoothstep(0.015, 0.12, app);
            albedo *= 1.0 + turb;
            // （eddy）：，（）
            float eddyN = pnoise(vec3(jp.x * 9.0 - flow * 0.7, jp.y * 42.0, jp.z * 9.0 - flow * 0.35));
            float eddy = smoothstep(0.60, 0.86, eddyN) * shear
                       * smoothstep(0.03, 0.18, app);
            albedo = mix(albedo, albedo * vec3(1.13, 1.06, 0.96), eddy * 0.40);
            // （）：，
            if (uBodyId == 5) {
              float conv = pnoise(jp * 25.0 + vec3(uTime * 0.03)) * smoothstep(0.15, 0.5, app);
              albedo *= 1.0 + conv * 0.06;
            }
            // ：（） GRS  ~22°S——。
            // ，/。
            //  UV （ UV ）： GRS  u≈0.368, v≈0.628。
            if (uBodyId == 5) {
              vec2 grsD = vec2(angleDiff(vUv.x, 0.368), vUv.y - 0.628);
              float grs = (1.0 - smoothstep(0.008, 0.040, abs(grsD.x)))
                        * (1.0 - smoothstep(0.004, 0.022, abs(grsD.y)));
              vec3 grsCol = albedo * vec3(1.80, 0.74, 0.52) + vec3(0.05, 0.004, 0.0);
              albedo = mix(albedo, grsCol, grs * 0.85);
            }
          }
          // === Issue #36：（） ===
          // ： ~51°  70% ，
          // （ 80°+），、 —— 。
          if (uBodyId == 3) { // Earth: 23.5 deg axial tilt, water ice cap overlay
            float lat = vObjPos.y / uRadius;
            float ss = uSubsolarLat / 23.5;
            float nCap = smoothstep(0.85 + ss * 0.04, 0.92 + ss * 0.04, lat);
            float sCap = smoothstep(0.85 - ss * 0.04, 0.92 - ss * 0.04, -lat);
            float cap = max(nCap, sCap);
            albedo = mix(albedo, vec3(0.95, 0.97, 1.0), cap * 0.5);
          }
          if (uBodyId == 4) { // Mars: seasonal polar caps (CO2 frost expansion + summer residual water ice)
            float latS = vObjPos.y / uRadius; // sin(latitude)
            //  Ls=270°； Ls=90°
            float winterN = 0.5 + 0.5 * cos((uLs - 270.0) * 0.0174532925);
            float winterS = 0.5 + 0.5 * cos((uLs - 90.0) * 0.0174532925);
            //  sin(82°)≈0.990； sin(55°)≈0.819
            float edgeN = mix(0.990, 0.819, winterN * winterN);
            float edgeS = mix(0.990, 0.819, winterS * winterS);
            float capN = smoothstep(edgeN - 0.015, edgeN + 0.02, latS);
            float capS = smoothstep(edgeS - 0.015, edgeS + 0.02, -latS);
            float cap = max(capN, capS);
            // CO₂ 、；
            albedo = mix(albedo, vec3(0.92, 0.94, 0.99), cap * 0.55);
          }
        }
        // （；BODY_GRADE ）
        // （DISPLAY_GRADE）：，
        albedo *= uGrade;
        albedo = mix(albedo, dot(albedo, vec3(0.2126, 0.7152, 0.0722)) * uNaturalTint, uNaturalTintMix);
        albedo = mix(vec3(dot(albedo, vec3(0.3333))), albedo, uSat);
        // ：（~0.03-0.06，），
        // ；（Blue Marble/）
        if (uBodyId == 3) {
          float om = clamp((albedo.b - max(albedo.r, albedo.g * 0.9)) * 6.0, 0.0, 1.0);
          // ：/""（），
          // ， 24%。""
          // —— 0.7–0.9， 0.03–0.06，。
          float lum3 = dot(albedo, vec3(0.3333));
          om *= 1.0 - smoothstep(0.42, 0.68, lum3);
          albedo *= mix(vec3(1.0), vec3(0.52, 0.60, 0.86), om * 0.8);
        }
        // ：（2013 ），+ACES 
        // ；（2017+ ）。
        // （~77°N  6 ，；）。
        if (uBodyId == 6) {
          vec3 pp = vObjPos / uRadius;
          float poleF = smoothstep(0.84, 0.95, abs(pp.y));
          albedo = mix(albedo, vec3(0.79, 0.74, 0.60), poleF * 0.78);
          float hexBand = smoothstep(0.950, 0.968, pp.y) * (1.0 - smoothstep(0.978, 0.995, pp.y));
          albedo *= 1.0 + cos(6.0 * atan(pp.z, pp.x)) * hexBand * 0.06;
        }
        // （）：（）；
        // （~200 km，app≈0.93  < 7.5%R）。
        float veilEff = uVeil;
        if (uDetailMode > 0) veilEff = uVeil * (1.0 - smoothstep(0.50, 0.93, app));
        albedo = mix(albedo, uVeilColor, veilEff);
        float ndl = dot(n, uSunDir);
        float day = smoothstep(-0.06, 0.12, ndl);
        // === Issue #26： ===
        // （1.0035×），UV ；，
        // （day>0），。（）。
        float cloudShadow = 1.0;
        if (uBodyId == 3 && uHasClouds == 1 && uDetailMode > 0) {
          //  UV （ + ），
          vec3 cloudCol = texture2D(uCloudTex, cloudUV(vUv, uTime)).rgb;
          // （ CLOUD_GLSL），
          cloudShadow = 1.0 - cloudAlpha(cloudCol) * 0.32 * day;
        }
        // ：，
        float ringSh = 1.0;
        if (uHasRing == 1) {
          vec3 rel = vPosW - uCenter;
          float denom = dot(uRingNormal, uSunDir);
          if (abs(denom) > 1e-4) {
            float t = -dot(uRingNormal, rel) / denom;
            if (t > 0.0) {
              float r = length(rel + uSunDir * t);
              float u = (r - uRingInner) / (uRingOuter - uRingInner);
              if (u > 0.0 && u < 1.0) {
                float a = uHasRingTex == 1 ? texture2D(uRingTex, vec2(u, 0.5)).a : 0.3;
                ringSh = 1.0 - a * 0.88;
              }
            }
          }
        }
        // === ：Hapke  BRDF  Lambert ===
        //  0° （ 40%+），
        // ，Lambert 。 Hapke(1981/1986) ：
        //   r = (w/4π)·[μ0/(μ0+μ)]·[(1+B(α))·P(α) + H(μ0)H(μ) − 1]
        //   B(α) = B0/(1+tan(α/2)/h)          
        //   P(α) = Henyey-Greenstein（ g = ）
        //   H(x) = (1+2x)/(1+2x√(1−w))        Chandrasekhar 
        // r  cos()， ndl； r·π/w 
        // Lambert，（uSunI /  / ）。
        float shade = max(ndl, 0.0);
        if (uHapke == 1) {
          vec3 V = normalize(cameraPosition - vPosW);
          vec3 L = normalize(uSunDir);
          float mu0 = max(dot(n, L), 0.0);
          float mu  = max(dot(n, V), 0.0);
          float ca  = clamp(dot(L, V), -1.0, 1.0);
          float alpha = acos(ca);
          float B = uB0 / (1.0 + tan(alpha * 0.5) / max(uHh, 1e-4));
          float gg = uHg;
          float denom = 1.0 + gg * gg + 2.0 * gg * ca;
          float P = (1.0 - gg * gg) / pow(max(denom, 1e-4), 1.5);
          float sq = sqrt(max(1.0 - uW, 1e-4));
          float H0 = (1.0 + 2.0 * mu0) / (1.0 + 2.0 * mu0 * sq);
          float H1 = (1.0 + 2.0 * mu)  / (1.0 + 2.0 * mu  * sq);
          float r = (uW / 12.566370614) * (mu0 / max(mu0 + mu, 1e-4))
                  * ((1.0 + B) * P + H0 * H1 - 1.0);
          shade = clamp(r * 3.14159265 / max(uW, 1e-3), 0.0, 4.0);
        // （ hapkeDiskMean）： Hapke ，
        // 、。
        shade *= uHapkeNorm;
        }
        // === （）===
        // ：，
        // ""——。
        // ：，****、
        // ****，（Baily's beads/）。
        float eclSh = 1.0;
        if (uEclOn == 1) {
          vec3 toOcc = uEclPos - vPosW;
          float dOcc = max(length(toOcc), 1.0);
          float aOcc = asin(clamp(uEclR / dOcc, 0.0, 1.0));
          // === Baily's beads ===
          // ：，/
          // （Baily's beads）。""
          // ——，****。
          {
            vec3 toOccN = toOcc / dOcc;
            vec3 helper = abs(toOccN.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
            vec3 e1 = normalize(cross(toOccN, helper));
            vec3 e2 = cross(toOccN, e1);
            vec3 toSunN = -normalize(uSunDir);
            float az = atan(dot(toSunN, e2), dot(toSunN, e1));
            float edge = 1.0 + 0.0045 * (sin(az * 9.0) * 0.5
                        + sin(az * 17.0 + 1.3) * 0.3 + sin(az * 31.0 + 2.7) * 0.2);
            aOcc *= edge;
          }
          float aSun = asin(clamp(SUN_RADIUS_KM / max(uSunDistKm, 1.0), 0.0, 1.0));
          float sep = acos(clamp(dot(toOcc / dOcc, normalize(uSunDir)), -1.0, 1.0));
          // Disc overlap ratio。 |aOcc−aSun|  aSun−aOcc：
          // （：9.6° vs 0.05°），
          //  sep=0  aSun−aOcc  aSun+aOcc ， 50% —— 
          // ，。
          float lo = abs(aOcc - aSun), hi = aOcc + aSun;
          float cover = 1.0 - smoothstep(lo, hi, sep);
          eclSh = 1.0 - cover;
        }
        vec3 col = albedo * shade * uSunI * ringSh * cloudShadow * eclSh;
        // Gas giant limb darkening（ → ，/）
        if (uDetailMode == 2) {
          float muv = max(dot(n, normalize(-vPosW)), 0.0);
          col *= 0.55 + 0.45 * pow(muv, 0.55);
        }
        // === Issue #27：Mars global dust storms ===
        // Ls 180-360 （）；，
        // ，（ Fe₂O₃ ）。
        if (uBodyId == 4 && uDetailMode > 0) {
          // Dust storm season intensity：Ls 180-220 ，220-330 ，330-360 
          float stormSeason = smoothstep(180.0, 220.0, uLs) * (1.0 - smoothstep(330.0, 360.0, uLs));
          vec3 dp = vObjPos / uRadius;
          // Dual-scale noise： + 
          float dust = 0.5 + 0.5 * pnoise(dp * 4.0 + vec3(uTime * 0.015));
          dust *= 0.6 + 0.4 * pnoise(dp * 10.0 + vec3(uTime * 0.03));
          // Yellow-pink dust haze veil：
          vec3 dustColor = vec3(0.82, 0.62, 0.45);
          float haze = stormSeason * dust * 0.55;
          col = mix(col, col * dustColor * 0.7 + dustColor * 0.12, haze);
        }
        // Faint ambient light (starlight/interplanetary scatter) prevents pure black nightside
        // （/）。****：
        //  0.0035，（sunI≈0.011） 31%，
        // ； 0.35%，。
        col += albedo * 0.0035 * uSunI;
        // Ringshine: Saturn's nightside illuminated by reflected ring sunlight.
        // （、）。
        if (uHasRing == 1) {
          float ringSide = max(0.0, dot(n, uRingNormal));
          col += albedo * uRingShine * ringSide;
        }
        if (uHasNight == 1) {
          vec3 city = texture2D(uNight, vUv).rgb;
          // City lights: 3.0x gain + warm color temperature matching ISS photography
        vec3 cityGlow = city * vec3(1.12, 1.0, 0.82);
        col += cityGlow * (1.0 - day) * 3.0;
        }
        if (uOcean == 1) {
          // Ocean-land mask uses smoothstep for realistic coastlines：
          // 0/1 （）。 0.02–0.12 ，
          // 。
          float oceanMask = smoothstep(0.02, 0.12, albedo.b - max(albedo.r, albedo.g * 0.9));
          vec3 v = normalize(cameraPosition - vPosW);
          vec3 h = normalize(uSunDir + v);
          // Solar specular glint: compact specular highlight across open waters（ ~3° ），
          //  90 （），1.6 
          float spec = pow(max(dot(n, h), 0.0), 340.0);
          col += vec3(1.0, 0.97, 0.9) * spec * oceanMask * uSunI * max(ndl, 0.0) * 1.1;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.uniforms = uniforms;
  return mat;
}

/** Cloud layer material (translucent shell illuminated by Sun)
 *  Issue #26：——（）+  UV。
 *   builder （），。 */
export function createCloudMaterial(cloudTex, opts = {}) {
  const R = opts.radiusKm ?? 6371;
  // Cloud vertical span: base 1.5 km to top 22 km（ 12–16 km， 20 km）。
  // ，，。
  const baseR = R * (opts.baseRatio ?? 1.0002);
  const topR = R * (opts.topRatio ?? 1.0035);
  const uniforms = {
    uMap: { value: cloudTex },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uSunI: { value: 1.0 },
    uTime: { value: 0 }, // Seconds, drives cloud rotation and perturbation
    uCenter: { value: new THREE.Vector3() }, // Planet center relative to camera (km), updated per frame
    uRBase: { value: baseR },
    uRTop: { value: topR },
    uThicknessKm: { value: topR - baseR },
    // Volumetric clouds enabled exclusively on High quality tier（）
    uVolumetric: { value: (opts.volumetric ?? (QUALITY.tier === 'high' && QUALITY.detail)) ? 1 : 0 },
    uSteps: { value: QUALITY.cloudN },
    uLightSteps: { value: QUALITY.cloudNL },
    uCameraInside: { value: 0 },
    // Inverse rotation (world -> body-fixed) for stable cloud UVs，
    // latLonOf ； builder  mesh.quaternion 。
    uBodyInv: { value: new THREE.Matrix3() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    // Volumetric raymarching accumulates premultiplied alpha（ alpha ），
    // ， alpha 。
    premultipliedAlpha: true,
    // DoubleSide rendering discarding unneeded side based on camera position：
    // ，，。
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      uniform float uInvScaleY;   // See fragment: inverse-transpose for non-uniform scaling
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vUv = uv;
        // Non-uniform scaling (oblate planets) requires inverse-transpose normal matrix：。
        //  modelMatrix  5.6°，。
        vNormalW = normalize(mat3(modelMatrix) * vec3(normal.x, normal.y * uInvScaleY, normal.z));
        vPosW = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform vec3 uSunDir;
      uniform float uSunI;
      uniform float uTime;
      uniform vec3 uCenter;
      uniform float uRBase;
      uniform float uRTop;
      uniform float uThicknessKm;
      uniform int uVolumetric;   // 0 = lightweight single sample (Low / mobile tier)
      uniform int uSteps;        // Adaptive raymarching steps within compile-time bound
      uniform int uLightSteps;
      uniform float uCameraInside;  // Camera inside cloud shell (determines front/back face retention)
      uniform mat3 uBodyInv;        // World -> body-fixed coordinate transformation matrix
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vPosW;

      // Ray-sphere intersection -> (tNear, tFar); returns (1, -1) on miss
      vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
        vec3 oc = ro - c;
        float b = dot(oc, rd);
        float h = b * b - (dot(oc, oc) - r * r);
        if (h < 0.0) return vec2(1.0, -1.0);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }

      // World coordinates -> body-fixed equirectangular UV
      //
      // Transform to body-fixed space to maintain rotation alignment， vPosW 
      // 。——
      //   ① （）；
      //   ② atan ，，
      //      ，，。
      // ，。
      //
      // Must match Three.js SphereGeometry UV convention，
      // 。SphereGeometry 
      //     x = −r·cos(2πu)·sin(θ),  z = r·sin(2πu)·sin(θ)
      //  atan2(z, x) = π − 2πu，
      //     u_ = 0.5 − atan2(z,x)/2π        （**** + 0.5）
      //  +0.5 ****。u  1−u 
      // SphereGeometry  uv ， tests/rendering.test.mjs。
      // v ：uv.y = 1 ， 0.5 + asin(y)/π 。
      vec2 latLonOf(vec3 q) {
        vec3 rel = uBodyInv * (q - uCenter);
        float rl = max(length(rel), 0.001);
        return vec2(0.5 - atan(rel.z, rel.x) / 6.2831853,
                    0.5 + asin(clamp(rel.y / rl, -1.0, 1.0)) / 3.14159265);
      }

      // Identical value-noise ensures cloud visual alignment with surface shadows
      ${HASH_GLSL}
      float phash(vec3 p) { return glslHash31(p); }
      float pnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(phash(i), phash(i + vec3(1,0,0)), f.x), mix(phash(i + vec3(0,1,0)), phash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(phash(i + vec3(0,0,1)), phash(i + vec3(1,0,1)), f.x), mix(phash(i + vec3(0,1,1)), phash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
${CLOUD_GLSL}

      /**
       * Cloud density: texture defines horizontal coverage; empirical vertical profile.
       * 、、——""，
       * 。
       */
      /**
       * Spherical tangent basis for texture footprint computation.
       */
      void cloudBasis(vec3 rel, out vec3 east, out vec3 north, out float rl, out float cosLat) {
        rl = max(length(rel), 0.001);
        vec3 nn = rel / rl;
        cosLat = max(length(nn.xz), 0.02);      // Clamped near poles to prevent footprint divergence
        vec2 h = nn.xz / cosLat;
        east = vec3(-h.y, 0.0, h.x);
        north = cross(nn, east);
      }

      /**
       * Cloud texture sampling footprint per pixel.
       *
       * Explicit footprint calculation avoids anti-meridian derivative explosion.
       * uv.x  1  0。dFdx(uv.x) ，GPU 
       * mip，；，
       * ****——，，
       * （：， 0 、
       * ； mipmap —— LOD ）。
       *
       * Uses continuous spherical position vectors across the anti-meridian.
       * 。****——
       * continue/break， dFdx 。
       */
      vec2 cloudFootprint(vec3 rel, vec3 east, vec3 north, float rl, float cosLat, bool dxAxis) {
        vec3 d = dxAxis ? dFdx(rel) : dFdy(rel);
        return vec2(dot(d, east) / (6.2831853 * rl * cosLat),
                    dot(d, north) / (3.14159265 * rl));
      }

      float cloudDensity(vec2 uv, float hFrac, vec2 gx, vec2 gy) {
        vec3 cl = textureGrad(uMap, cloudUV(uv, uTime), gx, gy).rgb;
        float prof = smoothstep(0.0, 0.18, hFrac) * (1.0 - smoothstep(0.55, 1.0, hFrac));
        return cloudTau(cl) * prof;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormalW);
        vec3 rd = normalize(vPosW);
        vec3 ro = vec3(0.0);            // Floating origin: camera fixed at world origin
        vec3 L = normalize(uSunDir);

        // Compute footprint before any fragment discards.
        //
        // ，：
        //  · —— continue/break， dFdx 。
        //  ·  discard ——discard ****
        //    ；，（1.0），
        //    ， →  mip → 
        //    。****：，。
        vec3 relE = uBodyInv * (vPosW - uCenter);
        vec3 cEast, cNorth; float cRl, cCos;
        cloudBasis(relE, cEast, cNorth, cRl, cCos);
        vec2 gX = cloudFootprint(relE, cEast, cNorth, cRl, cCos, true);
        vec2 gY = cloudFootprint(relE, cEast, cNorth, cRl, cCos, false);

        // Shell face culling: keep front face when camera is outside shell（，，），
        // （、）——，，
        // ""。 FrontSide  BackSide 。
        // ，。
        if (uCameraInside > 0.5) { if (gl_FrontFacing) discard; }
        else { if (!gl_FrontFacing) discard; }

        vec2 tRt = raySphere(ro, rd, uCenter, uRTop);
        float tEnter = max(tRt.x, 0.0);
        if (tRt.y <= tEnter) discard;

        float dayF = smoothstep(-0.06, 0.12, dot(n, L));
        vec3 nightTint = mix(vec3(0.010, 0.013, 0.020), vec3(0.004), dayF);

        // ── Lightweight path: single sample ───────────────────────────────────────
        // Low / 。SwiftShader （，p50）：
        //    92.4 ms ｜  99.3 ms（+7%）｜  126.6 ms（+37%）
        //  27 ms， 45 FPS  30 ——
        //  High （）。，
        // 。
        // ****， premultipliedAlpha 。
        if (uVolumetric == 0) {
          // Single sample integrates full vertical optical depth
          // —— cloudAlpha（Beer–Lambert） cloudDensity。
          //  hFrac=0.5  alpha ，，
          // ，，。
          vec2 luv = cloudUV(latLonOf(ro + rd * tEnter), uTime);
          // Cloud shell uses alpha blending——
          // （）。
          //  0.65，""，。
          float alpha = cloudAlpha(textureGrad(uMap, luv, gX, gY).rgb) * mix(0.42, 1.0, dayF) * 0.65;
          vec3 col = vec3(max(dot(n, L), 0.0)) * uSunI + nightTint;
          gl_FragColor = vec4(col * alpha, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          return;
        }

        // ── Volumetric path: bounded raymarching inside thin shell ─────────────────────────
        //  22 km（ 1.5 km）。——
        // ""：。
        vec2 tRb = raySphere(ro, rd, uCenter, uRBase);
        float t1 = min(tRt.y, (tRb.x > 0.0 ? tRb.x : tRt.y));
        if (t1 <= tEnter) discard;
        float span = t1 - tEnter;

        const int N = ${QUALITY.cloudN};
        const int NL = ${QUALITY.cloudNL};
        float ds = span / float(N);
        vec3 acc = vec3(0.0);
        float T = 1.0;
        for (int i = 0; i < N; i++) {
          if (i >= uSteps) break;
          vec3 pp = ro + rd * (tEnter + (float(i) + 0.5) * ds);
          vec3 rel = pp - uCenter;
          float rl = length(rel);
          float hFrac = clamp((rl - uRBase) / max(uThicknessKm, 0.001), 0.0, 1.0);
          float d = cloudDensity(latLonOf(pp), hFrac, gX, gY);
          if (d <= 0.002) continue;
          // Self-shadowing: light-ray march accumulates optical depth toward Sun（）
          float shadow = 0.0;
          for (int j = 1; j <= NL; j++) {
            if (j > uLightSteps) break;
            vec3 q = pp + L * (float(j) * ds);
            float ql = max(length(q - uCenter), 0.001);
            float qh = clamp((ql - uRBase) / max(uThicknessKm, 0.001), 0.0, 1.0);
            shadow += cloudDensity(latLonOf(q), qh, gX, gY);
          }
          float sunT = exp(-shadow * 1.7);
          // Forward scattering silver lining：（）
          float silver = pow(clamp(dot(rd, L), 0.0, 1.0), 8.0) * 1.6;
          float ndl = dot(normalize(rel), L);
          vec3 lit = (vec3(max(ndl, 0.0)) * sunT + vec3(silver * sunT * 0.3)) * uSunI;
          float a = 1.0 - exp(-d * ds * 0.55);
          acc += lit * a * T;
          T *= 1.0 - a;
          if (T < 0.01) break;
        }
        acc += nightTint * (1.0 - T);
        gl_FragColor = vec4(acc, 1.0 - T);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.uniforms = uniforms;
  return mat;
}
