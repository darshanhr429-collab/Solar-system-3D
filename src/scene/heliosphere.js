// Heliosphere structure: Termination Shock (~90 AU) and Heliopause (~120 AU).
// Geometry follows Parker model r(alpha) = R0 * sqrt(2 / (1 + cos alpha)); nose points into interstellar wind
// (ecliptic lon ~255.4 deg, lat ~5.1 deg), extended tail. Includes real-time Voyager 1/2 positions.

import * as THREE from 'three';
import { KM_PER_AU } from '../config.js';
import { VOYAGER_STATES } from './voyagerData.generated.js';
import { sampledPosition } from '../astro/sampledEphemeris.js';

const DEG = Math.PI / 180;
// Upstream interstellar wind direction (nose), ecliptic coordinates
const NOSE_LON = 255.4 * DEG;
const NOSE_LAT = 5.1 * DEG;

function noseDirWorld() {
  const x = Math.cos(NOSE_LAT) * Math.cos(NOSE_LON);
  const y = Math.cos(NOSE_LAT) * Math.sin(NOSE_LON);
  const z = Math.sin(NOSE_LAT);
  return new THREE.Vector3(x, z, -y); // Ecliptic -> world
}

// sheath: heliosheath fill intensity (diffuse ENA glow, exterior to termination shock, 0 at heliopause)
function makeShell(noseAU, color, opacity, sheath = 0) {
  // 256x160 subdivision eliminates polygonal facets at extreme distances
  const geo = new THREE.SphereGeometry(1, 256, 160);
  const nose = new THREE.Vector3(0, 0, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const cosA = v.dot(nose);
    // Parker nose compression model (before cosA -> -0.55), smoothly blending into parabolic tail
    // Eliminates abrupt flat disc boundary artifacts.
    const parkerR = Math.sqrt(2 / (1 + cosA + 1e-4));
    const tailMax = 3.5; // Maximum tail extension 3.5x nose distance (~315 / 424 AU)
    // Smoothstep ensures C1 continuity across geometry blends
    const raw = Math.max(0, Math.min(1, (-cosA - 0.55) / 0.45));
    const t = raw * raw * (3 - 2 * raw);
    // Parabolic tail: r(cosA) = tailMax * (1 - cosA) / 2 with hemispherical cap
    const parabolR = tailMax * 0.5 * (1 - cosA);
    const r = (1 - t) * Math.min(parkerR, tailMax) + t * Math.min(parabolR, tailMax);
    v.multiplyScalar(noseAU * KM_PER_AU * r);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uSheath: { value: sheath },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Three.js transparent + DoubleSide renders both passes; additive blending prevents over-accumulation
    // of limb glow on double-sided geometry.
    forceSinglePass: true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN;
      varying vec3 vPosW;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSheath;
      varying vec3 vN;
      varying vec3 vPosW;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 vDir = normalize(-vPosW);
        // gl_FrontFacing corrects normal orientation (SphereGeometry exterior is front)
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        float cosNV = max(0.0, dot(n, vDir));
        // Pure Fresnel rim glow: physically corresponds to maximum ENA column density along line-of-sight
        // 5th-power falloff ensures transparent center and sharp boundary
        float fres = pow(1.0 - cosNV, 5.0);
        // Heliosheath fill (exterior only): diffuse ENA glow between shock and heliopause, sin^2 profile
        float fill = gl_FrontFacing ? uSheath * (1.0 - cosNV * cosNV) : 0.0;
        float intensity = fres + fill;
        // Alpha modulates intensity; hue remains unscaled for pure chromatic tone
        gl_FragColor = vec4(uColor, uOpacity * intensity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // Rotate +Z (reference nose) to authentic interstellar wind direction
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), noseDirWorld());
  mesh.frustumCulled = false;
  return mesh;
}

/** Approximate Voyager ephemeris (linear extrapolation, epoch 2026.0; landmark guide) */
export const VOYAGERS = [
  { id: 'voyager1', nameZh: 'Voyager 1', nameEn: 'Voyager 1',
    r0AU: 166.3, rateAUyr: 3.57, lonDeg: 255.3, latDeg: 35.0, epochYear: 2026.0,
    desc: 'Launched in 1977; crossed the heliopause into interstellar space in 2012 — the most distant human-made object.' },
  { id: 'voyager2', nameZh: 'Voyager 2', nameEn: 'Voyager 2',
    r0AU: 139.0, rateAUyr: 3.16, lonDeg: 289.0, latDeg: -32.5, epochYear: 2026.0,
    desc: 'The only probe to have visited Uranus and Neptune; entered interstellar space in 2018.' },
];

const GM_SUN = 1.32712440018e11; // km³/s²
const DAY_SEC = 86400;

/** Voyager probes heliocentric position (km, ecliptic J2000).
 * Prefers Horizons state vector ballistic extrapolation (constant velocity + second-order solar gravity);
 * falls back to coarse linear kinematic model if telemetry data is absent. */
export function voyagerPosition(vg, jdTT) {
  const sampled = sampledPosition(vg.id, jdTT);
  if (sampled) return sampled;
  const st = VOYAGER_STATES[vg.id];
  if (st) {
    const dtSec = (jdTT - st.epochJd) * DAY_SEC;
    const r0 = Math.hypot(...st.posKm);
    // Solar gravitational deceleration (second-order): a0 = -GM * r_hat / r^2
    const a0 = -GM_SUN / (r0 * r0);
    return {
      x: st.posKm[0] + st.velKmS[0] * dtSec + 0.5 * a0 * (st.posKm[0] / r0) * dtSec * dtSec,
      y: st.posKm[1] + st.velKmS[1] * dtSec + 0.5 * a0 * (st.posKm[1] / r0) * dtSec * dtSec,
      z: st.posKm[2] + st.velKmS[2] * dtSec + 0.5 * a0 * (st.posKm[2] / r0) * dtSec * dtSec,
    };
  }
  const year = 2000 + (jdTT - 2451545.0) / 365.25;
  const r = (vg.r0AU + vg.rateAUyr * (year - vg.epochYear)) * KM_PER_AU;
  const lon = vg.lonDeg * DEG, lat = vg.latDeg * DEG;
  const x = r * Math.cos(lat) * Math.cos(lon);
  const y = r * Math.cos(lat) * Math.sin(lon);
  const z = r * Math.sin(lat);
  return { x, y, z }; // Ecliptic
}

export function createHeliosphere() {
  const group = new THREE.Group();
  // Termination shock: warm orange rim glow + subtle heliosheath ENA glow
  const ts = makeShell(90,  0xff9a55, 0.48, 0.06);
  // Heliopause: cold blue rim glow, transparent interior (beyond interstellar boundary)
  const hp = makeShell(121, 0x55c8ff, 0.52, 0.0);
  group.add(ts, hp);
  group.renderOrder = -6;
  return group;
}
