// Trans-Neptunian Object (TNO) scene: comet-like soft glow head (distant primary visual, palette-tinted) + close sphere mesh + orbit line.
// Driven per frame by tno.js ephemeris; follows comet visual rendering style (soft additive glow sprite), visible at extreme distances (#6).

import * as THREE from 'three';
import { TNO_IDS, TNO_DATA, tnoPosition, tnoOrbitPoints } from '../astro/tno.js';
import { createPlanetMaterial } from './planetMaterial.js';
import { createRings } from './rings.js';
import { proceduralMapLazy } from './proceduralTextures.js';
import { eclToWorldArr } from '../config.js';
import { J2000 } from '../astro/time.js';
import { QUALITY } from '../engine/quality.js';

const KM_PER_AU = 149597870.7;

/** Color palette -> glow RGB (0-255). Cool distant bodies tint blue-gray; reddish bodies tint orange. */
const PALETTE_GLOW = {
  mars:   [255, 170, 110], // Red-orange (Sedna, Gonggong, etc.)
  pluto:  [235, 205, 185], // Pink-white (Quaoar)
  ice:    [170, 215, 255], // Ice-blue (Haumea, Orcus)
  triton: [185, 230, 255], // Cyan-white
  dark:   [190, 170, 140], // Dark brownish-red (Makemake, Varuna)
  gray:   [200, 205, 220], // Neutral cool white (default)
};

/** Soft glow head: bright inner core + expanding diffuse halo (additive blending), tinted by palette. */
function makeGlowSprite(palette) {
  const [r, g, b] = PALETTE_GLOW[palette] ?? PALETTE_GLOW.gray;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  // Diffuse outer halo (coma-like)
  const g1 = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g1.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
  g1.addColorStop(0.22, `rgba(${r},${g},${b},0.45)`);
  g1.addColorStop(0.5, `rgba(${r},${g},${b},0.12)`);
  g1.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, 64, 64);
  // Inner bright core (white specular highlight, mimics sunlight-reflecting point source)
  const g2 = ctx.createRadialGradient(32, 32, 0, 32, 32, 7);
  g2.addColorStop(0, 'rgba(255,255,255,0.95)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
}

/** Orbit color: cool blue-gray, distinct from planetary orange-yellow orbits */
const ORBIT_COLOR = 0x6680aa;

/**
 * Create all TNO scene entities, register floating origins, return entries and per-frame update.
 */
export function createTNOScene(scene, world, orbitLinesGroup) {
  const entries = new Map();
  const segLo = QUALITY.segLo ?? [24, 12];

  for (const id of TNO_IDS) {
    const d = TNO_DATA[id];
    const group = new THREE.Group();

    // Sphere mesh: moderate resolution (TNOs are non-landable, no high-res DEM needed)
    const seg = Math.max(16, segLo[0]);
    const geo = new THREE.SphereGeometry(d.radiusKm, seg, Math.round(seg / 2));
    const tex = proceduralMapLazy(id, d.palette ?? 'gray', 512, 256);
    const mat = createPlanetMaterial({ map: tex, detailMode: 0, radiusKm: d.radiusKm });
    const mesh = new THREE.Mesh(geo, mat);
    // Triaxial ellipsoid: scale unit sphere by axis ratios (geometric radius is radiusKm,
    // so equivalent volume sphere matches rendered volume).
    if (d.axes) {
      const [a, b, c] = d.axes;
      const R = d.radiusKm;
      mesh.scale.set(a / R, c / R, b / R);   // Body-fixed +Y is polar axis (shortest axis)
    }
    group.add(mesh);
    // Rings: Haumea (Ortiz 2017) and Quaoar (Morgado 2023) both have observed rings.
    // Render rings to accurately match empirical observations.
    let ringMesh = null;
    if (d.rings) {
      ringMesh = createRings({ rings: d.rings, radiusKm: d.radiusKm }, null);
      mesh.add(ringMesh);
    }

    // Comet-style soft glow head (distant primary visual, superimposed on sphere)
    const glint = makeGlowSprite(d.palette ?? 'gray');
    group.add(glint);

    const posKm = new Float64Array(3);
    world.register(posKm, group);
    scene.add(group);

    // Orbit line (displayed only for bodies with diameter > 200 km)
    let orbitLine = null;
    if (d.radiusKm >= 100) {
      const pts = tnoOrbitPoints(id, 192);
      const arr = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i += 3) {
        const w = eclToWorldArr({ x: pts[i], y: pts[i + 1], z: pts[i + 2] });
        arr[i] = w[0]; arr[i + 1] = w[1]; arr[i + 2] = w[2];
      }
      const og = new THREE.BufferGeometry();
      og.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      orbitLine = new THREE.LineLoop(og, new THREE.LineBasicMaterial({
        color: ORBIT_COLOR, transparent: true, opacity: 0.18, fog: false,
      }));
      orbitLine.userData.isOrbit = true;
      orbitLine.userData.baseOpacity = 0.18;
      orbitLine.frustumCulled = false;
      orbitLine.visible = false; // Off by default (toggled via main.js KeyK, #4)
      orbitLinesGroup.add(orbitLine);
    }

    entries.set(id, { id, phys: d, posKm, group, mesh, mat, glint, orbitLine, ringMesh });
  }

  const _sunDir = new THREE.Vector3();
  let skyFadeF = 1; // Fade glow marker inside daylight atmosphere (real TNO >= 17 mag, invisible in daylight)

  // Speed of light (km/day): light-time position correction (consistent with builder)
  const C_KM_PER_DAY = 299792.458 * 86400;

  // Empirical rotation periods (hours). Only includes bodies with reliable observations;
  // others remain stationary rather than relying on guessed values.
  const TNO_ROT_HOURS = {
    pluto: 153.29, eris: 15.77, haumea: 3.92, makemake: 22.83, quaoar: 17.68,
    orcus: 13.19, sedna: 10.27, varuna: 6.34, ixion: 12.4, salacia: 6.09,
    az84: 6.76, ms4: 7.33, varda: 5.91, gonggong: 22.4, huya: 17.1,
  };
  function update(jdTT, shipPosKm) {
    for (const [id, e] of entries) {
      // Position (with light-time rollback: camera sees position at t - d/c; shipPosKm is world km)
      let jdUse = jdTT;
      if (shipPosKm) {
        let ecl0 = tnoPosition(id, jdTT);
        for (let k = 0; k < 2; k++) {
          const w0 = eclToWorldArr(ecl0);
          const d = Math.hypot(w0[0] - shipPosKm[0], w0[1] - shipPosKm[1], w0[2] - shipPosKm[2]);
          jdUse = jdTT - d / C_KM_PER_DAY;
          ecl0 = tnoPosition(id, jdUse);
        }
      }
      const ecl = tnoPosition(id, jdUse);
      const w = eclToWorldArr(ecl);
      e.posKm[0] = w[0]; e.posKm[1] = w[1]; e.posKm[2] = w[2];

      // Solar direction + irradiance (dark adaptation compensation matching planets, R7 #4)
      const dKm = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]);
      const dAU = Math.max(dKm / KM_PER_AU, 1e-6);
      _sunDir.set(-e.posKm[0] / dKm, -e.posKm[1] / dKm, -e.posKm[2] / dKm);
      // Standard exposure law: pure inverse-square, no compression exponent for d > 1.
      // Exposure = 0.75 * d^2 compensates so surface brightness depends purely on albedo.
      const sunI = 1 / (dAU * dAU);
      const u = e.mat.userData.uniforms;
      u.uSunDir.value.copy(_sunDir);
      u.uSunI.value = sunI;
      // Ring lighting: rings require solar direction and irradiance; also provides ring plane normal
      if (e.ringMesh) {
        const ru = e.ringMesh.material?.uniforms;
        if (ru?.uSunDir) { ru.uSunDir.value.copy(_sunDir); ru.uSunI.value = sunI; }
        if (ru?.uRingNormal) ru.uRingNormal.value.set(0, 1, 0).applyQuaternion(e.mesh.quaternion);
      }

      // Rotation: rotates around polar axis according to empirical period.
      // Matches documented rotational periods for Haumea (3.9h), Varuna (6.3h), etc.
      // Accurately conveys rapid spin and rotational light variation.
      const rotH = TNO_ROT_HOURS[id];
      if (rotH > 0) {
        const ang = ((jdTT - J2000) * 24 / rotH) % 1 * Math.PI * 2;
        e.mesh.rotation.y = ang;
      }

      // Comet-style glow head: maintains ~constant screen size, visible at distance, fades close up
      const dist = Math.hypot(
        e.posKm[0] - shipPosKm[0], e.posKm[1] - shipPosKm[1], e.posKm[2] - shipPosKm[2]
      );
      // Scale: visual angular size ~0.6 deg (dist * 0.006), ensuring halo exceeds planetary radius
      e.glint.scale.setScalar(Math.max(dist * 0.006, e.phys.radiusKm * 6));
      // Opacity: visible at distance, fades within < 60x radius to reveal surface.
      // Modulated by distance and phase angle:
      // Prevents distant bodies from appearing uniformly bright regardless of distance.
      // Flux proportional to (1/d^2) * phase_function; normalized at 40 AU, clamped to 0.25 minimum.
      const dAUg = Math.max(dKm / 149597870.7, 1e-3);
      const flux = Math.min(1, (40 / dAUg) * (40 / dAUg));
      // Phase angle alpha (Sun - Body - Observer): cos alpha = (toSun . toCam) / (|toSun| * |toCam|).
      // Here e.posKm is heliocentric coordinates (Sun at origin), camera is at shipPosKm.
      let cosPhase = 1;
      if (shipPosKm) {
        const tsx = -e.posKm[0], tsy = -e.posKm[1], tsz = -e.posKm[2];
        const tcx = shipPosKm[0] - e.posKm[0];
        const tcy = shipPosKm[1] - e.posKm[1];
        const tcz = shipPosKm[2] - e.posKm[2];
        const ls = Math.hypot(tsx, tsy, tsz), lc = Math.hypot(tcx, tcy, tcz);
        if (ls > 0 && lc > 0) {
          cosPhase = Math.max(-1, Math.min(1, (tsx * tcx + tsy * tcy + tsz * tcz) / (ls * lc)));
        }
      }
      const phase = 0.25 + 0.75 * Math.max(0, cosPhase);
      e.glint.material.opacity =
        THREE.MathUtils.clamp((dist / (e.phys.radiusKm * 60) - 0.3), 0, 1)
        * 0.85 * skyFadeF * (0.35 + 0.65 * flux) * phase;
      // Sphere: rendered only at close range (distant point relies purely on glow sprite to save fillrate)
      e.mesh.visible = dist < e.phys.radiusKm * 900;
    }
  }

  return {
    entries,
    update,
    /** Fade glow marker inside daylight atmosphere (same threshold as starlight fade) */
    setSkyFade(f) { skyFadeF = f > 0.4 ? 1 : 0; },
  };
}
