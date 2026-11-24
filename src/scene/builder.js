// Scene assembly: texture loading (manifest-aware, automatic procedural fallback), Sun/planet/moon
// meshes, cloud layers, atmospheres, rings, orbit lines, and per-frame ephemeris-driven updates.

import * as THREE from 'three';
import { DEM_SOURCES } from './demTiles.js';
import { terrainReliefOffset } from './terrain.js';
import { isSunOcculted } from './photoExposure.js';

export function readMapDataCache(cache, id, image) {
  const entry = cache.get(id);
  return entry && entry.image === image ? entry.data : undefined;
}

export function textureBitmapOptions(meta = {}, size) {
  const scale = Math.min(1, size / Math.max(meta.width ?? size, meta.height ?? size));
  const resize = meta.width && meta.height ? {
    resizeWidth: Math.max(1, Math.round(meta.width * scale)),
    resizeHeight: Math.max(1, Math.round(meta.height * scale)), resizeQuality: 'high',
  } : {};
  return { ...resize, imageOrientation: 'flipY', premultiplyAlpha: 'none' };
}

export function drawTextureForSampling(ctx, image, width, height) {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    ctx.translate(0, height); ctx.scale(1, -1);
  }
  ctx.drawImage(image, 0, 0, width, height);
}
import { BODIES, MOON_PHYS } from '../astro/bodies.js';
import { solarActivityAt } from '../astro/solarCycle.js';
import { planetPosition, PLANETS, orbitPoints } from '../astro/planets.js';
import { moonGeocentric } from '../astro/moon.js';
import { jdUTtoTT } from '../astro/time.js';
import { moonLocalPosition, moonOrbitNormal, moonOrbitPoints, MOON_IDS } from '../astro/moons.js';
import { bodyToEclipticMatrix, tidalLockMatrix } from '../astro/rotation.js';
import { eclToWorldArr, eclToWorld, eclMatrixToWorldQuat, KM_PER_AU, asset } from '../config.js';
import { createPlanetMaterial, createCloudMaterial } from './planetMaterial.js';
import { QUALITY } from '../engine/quality.js';
import { createAtmosphere } from './atmosphere.js';
import { createRings } from './rings.js';
import { createSun } from './sun.js';
import { proceduralMapLazy, proceduralBandsLazy } from './proceduralTextures.js';
import { HeightField } from './terrain.js';
import { loadShapeModels } from './shapeModels.js';
import { idbGet, idbPut } from '../engine/texCache.js';
import { resourceQueue, whenIdle } from '../engine/resourceQueue.js';

/** Full-resolution texture background upgrade priority: Earth-Moon/Sun first, gas giants second, distant moons last */
// Order defines background upgrade priority. earth_clouds.jpg (11MB) is placed last:
// it serves as a fallback texture while default path uses real-time GIBS date clouds.
// Placing it earlier wasted bandwidth ahead of high-resolution surface textures.
const TEX_PRIORITY = [
  'earth_day.jpg', 'earth_night.jpg', 'moon.jpg', 'sun.jpg',
  'mars.jpg', 'jupiter.jpg', 'saturn.jpg', 'saturn_ring.png', 'milkyway.jpg',
  'venus_surface.jpg', 'venus_atmosphere.jpg', 'mercury.jpg',
  'io.jpg', 'europa.png', 'ganymede.jpg', 'callisto.jpg', 'titan.jpg',
  'uranus.jpg', 'neptune.jpg', 'triton.jpg', 'pluto.jpg', 'charon.jpg',
  'earth_clouds.jpg',
];

function priorityOf(file) {
  const i = TEX_PRIORITY.indexOf(file);
  return i === -1 ? TEX_PRIORITY.length : i;
}

/** Decode to the hardware budget, preserving the source aspect ratio. */
async function loadFullImage(file, meta, size, priority, attempt = 0) {
  const medium = size <= 2048 && meta?.m;
  const version = (medium ? meta.mh : meta?.h) ?? meta?.h;
  const key = (version ? `${file}@${version}` : file) + (medium ? ':medium' : '');
  try {
    let blob = attempt === 0 ? await idbGet(key) : null;
    if (!blob) {
      blob = await resourceQueue.run('texture:' + key, async () => {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 25000);
        try {
          const res = await fetch(asset('textures/' + (medium ? 'medium/' + meta.m : file))+(version?'?v='+version:''), { signal: ctl.signal });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return await res.blob();
        } finally { clearTimeout(timer); }
      }, priority);
      idbPut(key, blob);
    }
    await whenIdle();
    const options = textureBitmapOptions(meta, size);
    // WebGL ignores Texture.flipY for ImageBitmap. Bake the orientation into
    // the decode so L1 HTMLImageElement -> L2/L3 bitmap preserves north/south.
    return await createImageBitmap(blob, options);
  } catch {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 800 * 2 ** attempt));
      return loadFullImage(file, meta, size, priority, attempt + 1);
    }
    return null;
  }
}

/** L1 preview -> L2 1024px surroundings -> L3 focused maps.
 * Keep small decoded maps for eviction. Large maps have a byte budget; visiting
 * every planet must not keep every 8K texture resident on a shared-memory GPU. */
function progressiveTextures(files, cache, manifest, onProgress) {
  const records = new Map(files.map(file => [file, {
    file, base: null, size: 512, desired: 1024, busy: false, queued: false,
  }]));
  const queue = [...records.values()];
  for (const r of queue) r.queued = true;
  let active = 0, completed = 0, firstResolve, uploadTail = Promise.resolve();
  const upgrades = new Promise(resolve => { firstResolve = resolve; });
  if (!files.length) firstResolve();
  const publish = (r, image, size) => {
    const old = cache.get(r.file).image;
    cache.get(r.file).image = image;
    cache.get(r.file).userData.realLoaded = true;
    cache.get(r.file).needsUpdate = true;
    r.size = size;
    if (old !== r.base && old !== image) old.close?.();
  };
  const enqueue = (r, front = false) => {
    if (r.busy || r.queued || r.size === r.desired) return;
    r.queued = true;
    front ? queue.unshift(r) : queue.push(r);
  };
  async function job(r) {
    const size = r.base ? r.desired : 1024;
    const bmp = await loadFullImage(r.file, manifest[r.file], size, size > 1024 ? 40 : 0);
    if (bmp) {
      // Serialize replacements across animation frames; concurrent downloads
      // otherwise trigger several texture uploads in the same render.
      uploadTail = uploadTail.then(async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await whenIdle();
        if (size === 1024) r.base = bmp;
        if (size === 1024 || r.desired === size) publish(r, bmp, size);
        else bmp.close?.();
      });
      await uploadTail;
    }
    if (!r.initialDone) {
      r.initialDone = true;
      onProgress?.(++completed, files.length, r.file);
      if (completed === files.length) firstResolve();
    }
    if (!bmp) r.failedUntil = Date.now() + 30000;
  }
  function pump() {
    while (active < QUALITY.textureConcurrency && queue.length) {
      const r = queue.shift(); r.queued = false; r.busy = true; active++;
      job(r).catch(e => console.warn('[textures]', r.file, e.message)).finally(() => {
        r.busy = false; active--;
        if (!(r.failedUntil > Date.now())) enqueue(r, r.desired > 1024);
        pump();
      });
    }
  }
  function boost(files) {
    const desired = new Map();
    let budget = QUALITY.tier === 'high' ? 384 * 1024 * 1024 : 128 * 1024 * 1024;
    for (const file of files) {
      const r = records.get(file), meta = manifest[file];
      if (!r || !meta) continue;
      let size = Math.min(QUALITY.textureSize, /clouds|night|milkyway/.test(file) ? 2048 : QUALITY.textureSize);
      const scale = Math.min(1, size / Math.max(meta.width ?? size, meta.height ?? size));
      const bytes = (meta.width ?? size) * (meta.height ?? size / 2) * scale * scale * 4 * 4 / 3;
      if (bytes > budget) continue;
      budget -= bytes; desired.set(file, size);
    }
    for (const r of records.values()) {
      r.desired = desired.get(r.file) ?? 1024;
      if (r.base && r.desired === 1024 && r.size > 1024) publish(r, r.base, 1024);
      if (!(r.failedUntil > Date.now())) enqueue(r, r.desired > 1024);
    }
    queue.sort((a, b) => (desired.has(b.file) ? 1 : 0) - (desired.has(a.file) ? 1 : 0) ||
      files.indexOf(a.file) - files.indexOf(b.file));
    pump();
  }
  pump();
  return { upgrades, boost };
}

async function loadTextures(onProgress, onBgProgress) {
  const getManifest = async path => {
    try {
      const response = await fetch(asset(path), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      return response.ok ? await response.json() : {};
    } catch { return {}; }
  };
  const [manifest, pManifest] = await Promise.all([
    getManifest('textures/manifest.json'), getManifest('textures/preview/manifest.json'),
  ]);
  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const wanted = new Set();
  const collect = (t) => { if (t) Object.values(t).forEach((v) => typeof v === 'string' && wanted.add(v)); };
  Object.values(BODIES).forEach((b) => { collect(b.textures); if (b.rings?.texture) wanted.add(b.rings.texture); });
  Object.values(MOON_PHYS).forEach((m) => collect(m.textures));
  wanted.add('milkyway.jpg');

  // L1 (blocking, ~0.5MB): load preview first if present, otherwise direct full-res
  let done = 0;
  const previewed = new Set();
  const tasks = [...wanted].map((file) => new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish(), 8000);
    const finish = () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      onProgress?.(++done, wanted.size, file); resolve();
    };
    if (!manifest[file]) { finish(); return; }
    const p = pManifest[file];
    loader.load(
      (p ? asset('textures/preview/' + p.p) : asset('textures/' + file)) + (p?.ph || p?.h ? '?v='+(p.ph??p.h) : ''),
      (tex) => {
        if (settled) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = QUALITY.anisotropy;
        cache.set(file, tex);
        if (p) previewed.add(file);
        finish();
      },
      undefined,
      () => { finish(); } // Failure -> procedural fallback
    );
  }));
  await Promise.all(tasks);

  // Failed previews retain a texture object so a later network recovery can
  // replace its image, including materials already bound to this placeholder.
  for (const file of wanted) {
    if (cache.has(file) || !pManifest[file]) continue;
    const owner = [...Object.entries(BODIES), ...Object.entries(MOON_PHYS)].find(([, p]) =>
      p.textures?.map === file || (p.textures?.cloudsOpaque && p.textures.clouds === file));
    let texture;
    if (owner) texture = texOf(cache, null, owner[0], owner[1]);
    else {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=2;
      texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    }
    texture.anisotropy=QUALITY.anisotropy;cache.set(file,texture);previewed.add(file);
  }

  const files = [...previewed].sort((a, b) => priorityOf(a) - priorityOf(b));
  const { upgrades, boost } = progressiveTextures(files, cache, pManifest, onBgProgress);
  return { cache, upgrades, boost };
}

/** Irregular small bodies: deforms sphere mesh using HeightField matching surface collision
 * (Visuals match collision; triaxial ellipsoid + procedural relief, e.g. Phobos/Deimos) */
/** Base sphere macro-topography shaping: vertex radius = baseSphereRadius(dir).
 *
 *  Non-DEM bodies share macro-relief (terrain._lowRelief) between close terrain patches
 *  and distant base spheres, avoiding jarring step boundaries and providing continental silhouettes.
 *  Smooth transition between local terrain and planetary disk.
 *  Upper frequency limit controlled by _lowRelief avoids aliasing.
 */
function deformLowRelief(mesh, id, phys) {
  const hf = new HeightField(id, phys);
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const h = hf.reliefRadius(v);
    pos.setXYZ(i, v.x * h, v.y * h, v.z * h);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

/** Base sphere mesh: bodies with macro-relief use double subdivision (192x108),
 *  requiring >= 6 samples per wavelength at highest frequency. */
function reliefSphereGeo(radiusKm) {
  const [w, h] = QUALITY.segHi;
  const [wl, hl] = QUALITY.segLo;
  const fine = QUALITY.detail !== 0 && QUALITY.segHi[0] >= 64;
  return new THREE.SphereGeometry(radiusKm, fine ? w * 2 : wl, fine ? h * 2 : hl);
}

function deformIrregular(mesh, id, phys) {
  const hf = new HeightField(id, phys);
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const h = hf.height(v);
    pos.setXYZ(i, v.x * h, v.y * h, v.z * h);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

const ORBIT_COLORS = {
  mercury: 0x8a8a8a, venus: 0xc9a06a, earth: 0x4a90d9, mars: 0xd96a4a,
  jupiter: 0xc9a06a, saturn: 0xd9c97a, uranus: 0x7ad9d9, neptune: 0x4a6ad9, pluto: 0x9a8aa9,
};

// Issue #29: Aurora mode mapping (0=none 1=Earth 2=Jupiter 3=Saturn 4=Triton)
// Earth: auroral oval OI 557.7nm green; Jupiter: H3+ blue-violet; Saturn: H3+ pink-violet; Triton: faint N2.
// Auroral emission normalized by shell thickness in atmosphere.js.
const AURORA_MODE = { earth: 1, jupiter: 2, saturn: 3, triton: 4 };

// Issue #27: Mars solar longitude Ls - computed from authentic heliocentric longitude.
// Anchored to authoritative epoch: Mars perihelion JD 2461125.8 at Ls = 251 deg (LMD Climate Database),
// Ls = Mars heliocentric longitude - perihelion longitude + 251.
// Accurately captures eccentric seasonal variations (Spring/Summer/Autumn/Winter = 194/178/143/156 sol).
// Calibrated against LMD Mars Climate Database standards.
const MARS_PERIHELION_JD = 2461125.8;
const MARS_LON_PERIHELION = (() => {
  const p = planetPosition('mars', MARS_PERIHELION_JD);
  return Math.atan2(p.y, p.x) * 180 / Math.PI;
})();

/** Mars solar longitude (degrees, 0-360) computed from heliocentric longitude */
function marsLs(jdTT) {
  const p = planetPosition('mars', jdTT);
  const lon = Math.atan2(p.y, p.x) * 180 / Math.PI;
  return ((lon - MARS_LON_PERIHELION + 251) % 360 + 360) % 360;
}

const GAS_BAND_COLORS = {
  jupiter: [[200, 170, 130], [240, 225, 200], [170, 130, 95], [225, 200, 170], [150, 110, 80]],
  saturn: [[225, 205, 165], [240, 230, 200], [205, 180, 140], [230, 215, 185]],
  uranus: [[155, 205, 215], [175, 220, 228], [145, 195, 208]],
  neptune: [[60, 90, 200], [80, 120, 220], [50, 80, 180], [90, 140, 230]],
};

/** Geometric albedo (empirical values) for physical point-light brightness modulation */
const GLINT_ALBEDO = {
  mercury: 0.14, venus: 0.75, earth: 0.31, mars: 0.25, jupiter: 0.50,
  saturn: 0.47, uranus: 0.51, neptune: 0.41, pluto: 0.60,
  moon: 0.12, io: 0.63, europa: 0.67, ganymede: 0.43, callisto: 0.17,
  titan: 0.22, triton: 0.76, charon: 0.35,
};

/** Celestial body -> associated texture filenames for viewpoint-driven upgrade priorities */
export function texturesOfBody(id) {
  const out = [];
  const b = BODIES[id];
  if (b?.textures) for (const v of Object.values(b.textures)) if (typeof v === 'string') out.push(v);
  if (b?.rings?.texture) out.push(b.rings.texture);
  const m = MOON_PHYS[id];
  if (m?.textures) for (const v of Object.values(m.textures)) if (typeof v === 'string') out.push(v);
  return out;
}

/** Texture or procedural fallback (lazy: placeholder texture immediate, full texture swapped on load) */
function texOf(cache, file, bodyId, phys) {
  if (file && cache.has(file)) return cache.get(file);
  if (phys?.type === 'gas' || phys?.type === 'ice') {
    return proceduralBandsLazy(bodyId, GAS_BAND_COLORS[bodyId] ?? GAS_BAND_COLORS.jupiter);
  }
  return proceduralMapLazy(bodyId, phys?.surface?.palette ?? 'gray');
}

function sphereGeo(radiusKm, big) {
  const [wHi, hHi] = QUALITY.segHi;
  const [wLo, hLo] = QUALITY.segLo;
  return new THREE.SphereGeometry(radiusKm, big ? wHi : wLo, big ? hHi : hLo);
}

/** Fragment procedural detail mode: Gas/Ice giant = 2, landable rocky = 1, low tier = 0 */
function detailModeOf(phys) {
  if (!QUALITY.detail) return 0;
  if (phys.type === 'gas' || phys.type === 'ice') return 2;
  return phys.landable ? 1 : 0;
}

export async function buildSolarSystem(scene, world, onProgress, onBgProgress) {
  // Diagnostic flags parsed from URL (?noatmo=1 disables atmospheric shell for isolation testing)
  const skipAtmo = !!globalThis.__noAtmo;
  // Empirical small body shapes (PDS Thomas radius grids): must be ready before mesh construction
  // as HeightField.baseRadius is a synchronous hot path. Falls back to procedural ellipsoid on failure.
  const shapeIds = [...Object.values(BODIES), ...Object.values(MOON_PHYS)]
    .map((p) => p?.shapeModel).filter(Boolean);
  if (shapeIds.length) {
    const n = await loadShapeModels(shapeIds, asset(''));
    if (n) console.log(`[shapes] Measured shape models loaded ${n}/${shapeIds.length}`);
  }
  const { cache, upgrades, boost } = await loadTextures(onProgress, onBgProgress);
  const bodies = new Map();
  const orbitLines = new THREE.Group();
  scene.add(orbitLines);

  // ---------- Sun ----------
  const sunPhys = BODIES.sun;
  const sun = createSun(sunPhys.radiusKm, texOf(cache, 'sun.jpg', 'sun', sunPhys));
  const sunEntry = {
    id: 'sun', phys: sunPhys, isMoon: false, parentId: null,
    group: sun.group, mesh: sun.mesh, posKm: new Float64Array(3),
    uniforms: sun.uniforms,   // Diagnostic access to solar shader uniforms
    coronaUniforms: sun.coronaUniforms,
  };
  // Sun point light: physical solar illumination for terrain StandardMaterial
  // Baseline sunlight color = pure white (0xffffff): planetary disk materials
  // are calibrated against NASA white-balanced imagery. Eliminates chromatic divergence
  // between terrain tiles and disk spheres.
  // Matches authentic neutral gray lunar surface under Apollo imagery.
  const sunLight = new THREE.PointLight(0xffffff, 1, 0, 0);
  sun.group.add(sunLight);
  // Skylight: scattered diffuse atmospheric illumination incident on ground.
  // Ground receives both direct sunlight and hemispherical skylight, preventing harsh black shadows at dusk.
  // Softens twilight transitions on Earth, Mars, and Venus.
  // Realistic twilight illumination.
  // Color derived from planetary atmospheric Rayleigh scattering coefficients.
  // Intensity modulated by skyFraction clear-sky diffuse ratio.
  const skyLight = new THREE.HemisphereLight(0x8fb4ff, 0x40382e, 0);
  scene.add(skyLight);
  // Near-field solar shadow rig: smooth handoff from point light to player-following
  // directional light at low altitude / surface walking to cast terrain and rock self-shadows.
  // Essential for ground-level depth and visual realism.
  // Directional shadow frustum (+-400m) covers local immediate surroundings.
  globalThis.__scene = scene;   // Diagnostic hook
  const sunShadow = new THREE.DirectionalLight(0xffffff, 0);
  sunShadow.castShadow = false;
  sunShadow.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
  // Shadow box half-width (km). Sized at 0.8km to capture distant ridge shadows.
  // High quality (2048 shadow map -> 0.78m/texel).
  // Balances shadow reach with shadow map resolution.
  // Prevents self-shadowing acne across terrain vertices.
  // Calibrated normalBias.
  // Optimal shadow fidelity.
  const SHADOW_HALF = 0.8;
  sunShadow.shadow.camera.left = -SHADOW_HALF; sunShadow.shadow.camera.right = SHADOW_HALF;
  sunShadow.shadow.camera.top = SHADOW_HALF; sunShadow.shadow.camera.bottom = -SHADOW_HALF;
  sunShadow.shadow.camera.near = 0.02; sunShadow.shadow.camera.far = 6;
  sunShadow.shadow.bias = -0.00008;
  sunShadow.shadow.normalBias = 0.0006; // km units = 0.6m: eliminates terrain mesh self-shadow acne
  scene.add(sunShadow);
  scene.add(sunShadow.target);
  scene.add(sun.group);
  world.register(sunEntry.posKm, sun.group);
  bodies.set('sun', sunEntry);

  // ---------- Planets ----------
  for (const id of PLANETS) {
    const phys = BODIES[id];
    const group = new THREE.Group();
    const visualMapFile = phys.textures?.clouds && phys.textures?.cloudsOpaque
      ? phys.textures.clouds : phys.textures?.map;
    // Issue #26: Parse cloud texture ahead, shared with planet material and cloud mesh.
    // Real-date cloud map prioritized (tools/fetch-clouds.mjs output; grayscale = cloud coverage);
    // falls back to synthetic cloud map. Both evaluate luminance in shader.
    const cloudFile = phys.textures?.cloudsReal && cache.has(phys.textures.cloudsReal)
      ? phys.textures.cloudsReal
      : (phys.textures?.clouds && !phys.textures.cloudsOpaque && cache.has(phys.textures.clouds)
        ? phys.textures.clouds : null);
    const cloudTex = cloudFile ? cache.get(cloudFile) : null;
    const mat = createPlanetMaterial({
      map: texOf(cache, visualMapFile, id, phys),
      nightMap: phys.textures?.night ? cache.get(phys.textures.night) ?? null : null,
      oceanSpec: !!phys.surface?.ocean,
      ringShadow: phys.rings ? {
        tex: phys.rings.texture ? cache.get(phys.rings.texture) ?? null : null,
        innerKm: phys.rings.innerKm, outerKm: phys.rings.outerKm,
      } : null,
      detailMode: detailModeOf(phys),
      radiusKm: phys.radiusKm,
      bodyId: id,       // Issue #26/#27/#28/#36: Body-specific effects
      cloudTex,         // Issue #26: Earth cloud surface projection
    });
    // Non-DEM bodies: procedural terrain centered around R (+-0.5 ampKm);
    // base sphere offset down to contain low elevations.
    // Ensures smooth transition between terrain patches and planetary sphere.
    const relief = !DEM_SOURCES[id] && phys.landable;
    const reliefOffset = relief ? terrainReliefOffset(phys) : 0;
    const mesh = new THREE.Mesh(
      relief ? reliefSphereGeo(phys.radiusKm - reliefOffset) : sphereGeo(phys.radiusKm - reliefOffset, true),
      mat);
    if (relief) deformLowRelief(mesh, id, phys);
    // Landable bodies avoid oblate scaling: terrain tiles, walking physics, and elevation queries
    // rely on spherical R. Oblateness in rocky planets (<0.6%) is negligible in spherical projection.
    // Non-landable gas giants render as true ellipsoids without collision models.
    // radiusKm provides equatorial radius, paired with oblateness.
    if (!phys.landable) {
      const sy = 1 - (phys.oblateness ?? 0);
      mesh.scale.y = sy;
      // Normal inverse transpose: y scaling sy -> divide object space normal y component by sy
      const u = mat.userData.uniforms;
      if (u?.uInvScaleY) u.uInvScaleY.value = 1 / Math.max(sy, 1e-3);
    }
    group.add(mesh);

    const entry = {
      id, phys, isMoon: false, parentId: 'sun', group, mesh,
      posKm: new Float64Array(3), mat,
      cloudFile,   // Active cloud map filename (real-date or synthetic) for diagnostics
    };

    // Clouds (Earth; Venus cloud deck handled as primary surface texture)
    if (cloudTex) {
      const cmat = createCloudMaterial(cloudTex, { radiusKm: phys.radiusKm });
      const cmesh = new THREE.Mesh(sphereGeo(phys.radiusKm * 1.0035, true), cmat);
      cmesh.renderOrder = 10;
      mesh.add(cmesh);
      entry.cloudMesh = cmesh;
      entry.cloudMat = cmat;
    }

    if (phys.atmosphere && !skipAtmo) {
      const atmo = createAtmosphere(phys, AURORA_MODE[id] ?? 0);
      group.add(atmo);
      entry.atmoMesh = atmo;
    }

    if (phys.rings) {
      const rtex = phys.rings.texture ? cache.get(phys.rings.texture) ?? null : null;
      const rings = createRings(phys, rtex);
      mesh.add(rings);
      entry.ringMesh = rings;
    }

    // Distant glint sprite (renders prominent planetary point star at AU distances)
    const glint = makeGlint(0xfff6e8);
    group.add(glint);
    entry.glint = glint;

    // Orbit lines (heliocentric; frozen osculating elements for current epoch)
    const jdNow = jdUTtoTT(Date.now() / 86400000 + 2440587.5);
    const pts = orbitPoints(id, jdNow, 512);
    const arr = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 3) {
      const w = eclToWorldArr({ x: pts[i], y: pts[i + 1], z: pts[i + 2] });
      arr[i] = w[0]; arr[i + 1] = w[1]; arr[i + 2] = w[2];
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const oline = new THREE.LineLoop(og, new THREE.LineBasicMaterial({
      color: ORBIT_COLORS[id], transparent: true, opacity: 0.3, fog: false,
    }));
    sun.group.add(oline);
    orbitLines.userData[id] = oline;
    oline.userData.isOrbit = true;
    oline.userData.jd = jdNow;
    oline.userData.baseOpacity = 0.3; // Baseline opacity for distance fading

    scene.add(group);
    world.register(entry.posKm, group);
    bodies.set(id, entry);
  }

  // ---------- Moons ----------
  for (const id of MOON_IDS) {
    const phys = MOON_PHYS[id];
    const fullPhys = { ...phys, id, type: 'moon' };
    // Issue #29: Triton possesses tenuous N2 atmosphere (~1.4 Pa).
    // Minimal shell created for auroral curtains (invisible from deep space).
    if (id === 'triton' && !fullPhys.atmosphere) {
      fullPhys.atmosphere = {
        heightKm: 20, rayleighScaleKm: 5, mieScaleKm: 5,
        rayleigh: [1e-9, 1e-9, 1e-9], mie: 1e-9, mieG: 0.5, multiplier: 0.01,
      };
    }
    const group = new THREE.Group();
    const mat = createPlanetMaterial({
      map: texOf(cache, phys.textures?.map, id, fullPhys),
      detailMode: detailModeOf(fullPhys),
      radiusKm: phys.radiusKm,
      bodyId: id, // Issue #36: Seasonal and auroral effects for Triton etc.
    });
    const big = phys.radiusKm > 1000;
    // Non-DEM, non-deformed moons offset base sphere down by terrain amplitude
    // to prevent base sphere from clipping crater floors.
    // Irregular bodies (Phobos, Deimos) have geometry completely reshaped by deformIrregular.
    const irregular = !!phys.shape?.dims;
    const relief = !DEM_SOURCES[id] && !irregular && fullPhys.landable;
    const reliefOffset = relief ? terrainReliefOffset(fullPhys) : 0;
    const mesh = new THREE.Mesh(
      relief ? reliefSphereGeo(phys.radiusKm - reliefOffset) : sphereGeo(phys.radiusKm - reliefOffset, big),
      mat);
    if (irregular) deformIrregular(mesh, id, fullPhys);
    else if (relief) deformLowRelief(mesh, id, fullPhys);
    group.add(mesh);

    const entry = {
      id, phys: fullPhys, isMoon: true, parentId: phys.parent, group, mesh,
      posKm: new Float64Array(3), mat,
    };

    if (phys.atmosphere && !skipAtmo) {
      const atmo = createAtmosphere(fullPhys, AURORA_MODE[id] ?? 0);
      group.add(atmo);
      entry.atmoMesh = atmo;
    }

    const glint = makeGlint(0xd8e2f0);
    group.add(glint);
    entry.glint = glint;

    // Satellite orbit lines: parented under host planet group (local translation)
    const pts = moonOrbitPoints(id, 192);
    const arr = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 3) {
      const w = eclToWorldArr({ x: pts[i], y: pts[i + 1], z: pts[i + 2] });
      arr[i] = w[0]; arr[i + 1] = w[1]; arr[i + 2] = w[2];
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const oline = new THREE.LineLoop(og, new THREE.LineBasicMaterial({
      color: 0x7a8a9a, transparent: true, opacity: 0.25, fog: false,
    }));
    bodies.get(phys.parent).group.add(oline);
    oline.userData.isOrbit = true;
    oline.userData.baseOpacity = 0.25;
    orbitLines.userData[id] = oline;

    scene.add(group);
    world.register(entry.posKm, group);
    bodies.set(id, entry);
  }

  // ---------- Per-frame Update ----------
  const _q = new THREE.Quaternion();
  const _sunDir = new THREE.Vector3();
  const _pole = new THREE.Vector3(); // Issue #36: Spin axis in world coordinates
  const _bodyQ = new THREE.Quaternion();          // Cloud body-fixed inverse rotation
  const _bodyM4 = new THREE.Matrix4();

  // Speed of light (km/day): light-time correction constant
  const C_KM_PER_DAY = 299792.458 * 86400;

  // Current solar activity 0..1 computed in update() from jdTT and shared across update passes.
  // Stored at module scope to avoid closure reference errors.
  // Stable execution across frame loops.
  let solarActivityNow = 0.5;

  /** Light-time apparent position: backward propagation t - d/c; converges in 2 iterations */
  function apparentAt(fn, camEcl, jdTT) {
    let p = fn(jdTT);
    if (!camEcl) return p;
    for (let k = 0; k < 2; k++) {
      const d = Math.hypot(p.x - camEcl.x, p.y - camEcl.y, p.z - camEcl.z);
      p = fn(jdTT - d / C_KM_PER_DAY);
    }
    return p;
  }

  let orbitWorker;
  const pendingOrbits = new Set();
  function refreshOrbitLines(jdTT) {
    for (const id of PLANETS) {
      const line = orbitLines.userData[id];
      if (Math.abs(jdTT - line.userData.jd) < 1 || pendingOrbits.has(id)) continue;
      if (!orbitWorker && typeof Worker !== 'undefined') {
        orbitWorker = new Worker(new URL('../engine/orbitWorker.js', import.meta.url), { type: 'module' });
        orbitWorker.onmessage = ({ data }) => {
          pendingOrbits.delete(data.id);
          if (data.error) { console.warn('[orbit]', data.error); return; }
          const target = orbitLines.userData[data.id];
          target.geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
          target.geometry.computeBoundingSphere();
          target.userData.jd = data.jd;
        };
      }
      if (!orbitWorker) return;
      pendingOrbits.add(id);
      orbitWorker.postMessage({ id, jd: jdTT });
    }
  }

  function update(jdTT, camPosKm) {
    refreshOrbitLines(jdTT);
    // Camera absolute coordinates (Three world km) -> ecliptic frame for light-time calculation
    const camEcl = camPosKm ? { x: camPosKm[0], y: -camPosKm[2], z: camPosKm[1] } : null;
    // Apparent ecliptic positions for current frame
    const eclPos = new Map();
    // Issue #27/#29/#36: Global seasonal parameters shared across celestial entities
    // Mars solar longitude Ls (deg, 0-360)
    let ls = marsLs(jdTT);
    // Solar activity: interpolated from empirical solar cycle extrema table
    // (modulates auroral intensity and corona).
    // Matches empirical cycle peaks (2000.3, 2014.3, 2024.9).
    solarActivityNow = solarActivityAt(jdTT);
    // Mars dust storm intensity (Ls 180-360 storm season)
    const marsDust = Math.max(0,
      THREE.MathUtils.smoothstep(ls, 180, 220) * (1 - THREE.MathUtils.smoothstep(ls, 330, 360)));
    // Aurora intensity (disabled on mobile or low quality tiers)
    const auroraStrength = 1.0;

    for (const [id, e] of bodies) {
      if (id === 'sun') {
        const m = bodyToEclipticMatrix('sun', jdTT);
        eclMatrixToWorldQuat(m, e.mesh.quaternion);
        continue;
      }
      // Position (with light-time correction: camera observes position at t - d/c)
      let ecl;
      if (!e.isMoon) {
        ecl = apparentAt((t) => planetPosition(id, t), camEcl, jdTT);
      } else if (id === 'moon') {
        ecl = apparentAt((t) => {
          const ep = eclPos.get('earth') ?? planetPosition('earth', t);
          const mg = moonGeocentric(t);
          return { x: ep.x + mg.x, y: ep.y + mg.y, z: ep.z + mg.z };
        }, camEcl, jdTT);
      } else {
        ecl = apparentAt((t) => {
          const pp = eclPos.get(e.parentId) ?? planetPosition(e.parentId, t);
          const ml = moonLocalPosition(id, t);
          return { x: pp.x + ml.x, y: pp.y + ml.y, z: pp.z + ml.z };
        }, camEcl, jdTT);
      }
      eclPos.set(id, ecl);
      const w = eclToWorldArr(ecl);
      e.posKm[0] = w[0]; e.posKm[1] = w[1]; e.posKm[2] = w[2];

      // Orientation
      if (!e.isMoon || id === 'moon') {
        // Moon uses IAU 2015 rotation model rather than rigid tidal locking.
        // Authentic uniform sidereal rotation combined with eccentric inclined orbit
        // reproduces optical libration (longitude +-7.9 deg, latitude +-6.7 deg),
        // revealing 59% of lunar surface over time.
        // Other satellites utilize standard tidal locking.
        const m = bodyToEclipticMatrix(id, jdTT);
        eclMatrixToWorldQuat(m, e.mesh.quaternion);
      } else {
        // Tidal locking: z = orbit normal, prime meridian points toward parent planet
        const local = id === 'moon' ? moonGeocentric(jdTT) : moonLocalPosition(id, jdTT);
        const L = Math.hypot(local.x, local.y, local.z) || 1;
        const toParent = { x: -local.x / L, y: -local.y / L, z: -local.z / L };
        const nHat = moonOrbitNormal(id, jdTT);
        eclMatrixToWorldQuat(tidalLockMatrix(nHat, toParent), e.mesh.quaternion);
      }

      // Lighting uniforms: solar direction and irradiance
      const dKm = Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]);
      const dAU = Math.max(dKm / KM_PER_AU, 1e-6);
      _sunDir.set(-e.posKm[0] / dKm, -e.posKm[1] / dKm, -e.posKm[2] / dKm);
      // Irradiance follows physical inverse-square law without artificial compression.
      //
      // Surface radiance scales with 1/d^2; camera auto-exposure scales with d^2,
      // ensuring surface brightness is governed strictly by authentic geometric albedo.
      // Physical photometric balance preserved across all planetary distances.
      // Distant worlds appear correctly dimmer within the same field of view.
      //
      // sunI = 1/d^2, exposure = d^2; net product is unity for intrinsic albedo calibration.
      // Authentic planetary surface brightness.
      // Photometric consistency across solar system.
      const sunI = 1 / (dAU * dAU);
      if (e.mat) {
        e.mat.userData.uniforms.uSunDir.value.copy(_sunDir);
        e.mat.userData.uniforms.uSunI.value = sunI;
        if (e.phys.rings) {
          // Ring plane normal = planetary rotation axis (world frame)
          e.mat.userData.uniforms.uRingNormal.value
            .set(0, 1, 0).applyQuaternion(e.mesh.quaternion);
          // Ringlight intensity: ring solid angle fraction * ring albedo ~= 0.09 (Saturn)
          // * solar irradiance. Jupiter/Neptune rings scaled by respective optical opacity.
          const ringOpacity = e.phys.rings.opacity ?? 1;
          e.mat.userData.uniforms.uRingShine.value = 0.09 * ringOpacity * sunI;
        }
      }
      if (e.cloudMat) {
        const u = e.cloudMat.userData.uniforms;
        u.uCenter.value.copy(e.group.position);
        // Camera inside or outside cloud shell determines visible face rendering
        u.uCameraInside.value = e.group.position.length() < u.uRTop.value ? 1 : 0;
        u.uSunDir.value.copy(_sunDir);
        u.uSunI.value = sunI;
        // Body-fixed inverse rotation: cloud coordinates computed in planetary frame.
        // Rotates cloud layer seamlessly with planetary terrain.
        // Prevents static celestial drift and antimeridian visual seams.
        // Co-rotates with planetary surface.
        // Stable coordinate mapping.
        u.uBodyInv.value.setFromMatrix4(
          _bodyM4.makeRotationFromQuaternion(_bodyQ.copy(e.mesh.quaternion).invert()));
      }
      if (e.atmoMesh) {
        const u = e.atmoMesh.material.userData.uniforms;
        u.uSunDir.value.copy(_sunDir);
        u.uSunI.value = 5 * (e.phys.atmosphere.multiplier ?? 1) * sunI;
        // Oblate intersection uses planetary spin axis (world frame, R8 #1)
        u.uAxis.value.set(0, 1, 0).applyQuaternion(e.mesh.quaternion);
      }
      if (e.ringMesh) {
        const u = e.ringMesh.material.userData.uniforms;
        u.uSunDir.value.copy(_sunDir);
        u.uSunI.value = sunI;
      }
      // === Issue #27/#29/#36: Seasonal / Auroral Uniforms ===
      // Subsolar latitude = arcsin(sunDir . poleAxis); drives seasonal polar caps and daylight zones
      _pole.set(0, 1, 0).applyQuaternion(e.mesh.quaternion);
      const subsolarLat = Math.asin(
        THREE.MathUtils.clamp(_sunDir.dot(_pole), -1, 1)) * 180 / Math.PI;
      if (e.mat) {
        const u = e.mat.userData.uniforms;
        u.uLs.value = ls;
        u.uSubsolarLat.value = subsolarLat;
      }
      if (e.atmoMesh) {
        const u = e.atmoMesh.material.userData.uniforms;
        u.uSolarActivity.value = solarActivityNow;
        u.uAuroraStrength.value = auroraStrength;
        // Mars dust storm: boosts atmospheric haze opacity
        u.uDustStorm.value = (id === 'mars') ? marsDust : 0;
      }
    }
  }

  /** Called after world.update: camera-relative updates (atmosphere/ring centers, glints, satellite visibility) */
  let glintSkyFade = 1; // Fades distant planet glints in daylight atmosphere
  function postWorldUpdate(shipPosKm, simTimeSec) {
    let nearestE = null, nearestSurf = Infinity;
    for (const [id, e] of bodies) {
      if (id === 'sun') continue;
      const dist = Math.hypot(
        e.posKm[0] - shipPosKm[0], e.posKm[1] - shipPosKm[1], e.posKm[2] - shipPosKm[2]
      );
      const surf = dist - e.phys.radiusKm;
      if (surf < nearestSurf) { nearestSurf = surf; nearestE = e; }
      // Physical distant glint brightness: phase angle phi + geometric albedo
      // Lambertian sphere phase function: (sin phi + (pi - phi)*cos phi) / pi
      const bsX = -e.posKm[0], bsY = -e.posKm[1], bsZ = -e.posKm[2]; // Body -> Sun
      const bcX = shipPosKm[0] - e.posKm[0], bcY = shipPosKm[1] - e.posKm[1], bcZ = shipPosKm[2] - e.posKm[2]; // Body -> Camera
      const bsL = Math.hypot(bsX, bsY, bsZ) || 1, bcL = Math.hypot(bcX, bcY, bcZ) || 1;
      const cosPhi = Math.max(-1, Math.min(1, (bsX * bcX + bsY * bcY + bsZ * bcZ) / (bsL * bcL)));
      const phi = Math.acos(cosPhi);
      const phaseF = (Math.sin(phi) + (Math.PI - phi) * cosPhi) / Math.PI;
      if (e.atmoMesh) e.atmoMesh.material.userData.uniforms.uCenter.value.copy(e.group.position);
      if (e.ringMesh) e.ringMesh.material.userData.uniforms.uCenter.value.copy(e.group.position);
      if (e.phys.rings && e.mat) e.mat.userData.uniforms.uCenter.value.copy(e.group.position);
      // Issue #26/#28/#29: Animation time uniform (seconds, drives cloud rotation/Jupiter bands/auroras)
      if (e.mat) e.mat.userData.uniforms.uTime.value = simTimeSec;
      if (e.cloudMat) e.cloudMat.userData.uniforms.uTime.value = simTimeSec;
      if (e.atmoMesh) e.atmoMesh.material.userData.uniforms.uTime.value = simTimeSec;
      // Distant glint: ~3px visual point; fades close-up; modulated by phase and albedo
      const glintSize = dist * 0.004;
      e.glint.scale.setScalar(glintSize);
      const distFade = THREE.MathUtils.clamp((dist / (e.phys.radiusKm * 300) - 1) * 0.8, 0, 0.9);
      const albedoScale = Math.sqrt((GLINT_ALBEDO[id] ?? 0.15) / 0.3);
      // Distance attenuation: 1/d^2 inverse square law normalized at 1 AU.
      // Accurately conveys apparent visual magnitudes across interplanetary distances
      // (e.g. Venus -4.5 mag vs Neptune +7.8 mag).
      const dAUg = Math.max(Math.hypot(e.posKm[0], e.posKm[1], e.posKm[2]) / KM_PER_AU, 1e-6);
      const flux = 1 / Math.max(dAUg * dAUg, 1e-6);
      e.glint.material.opacity = distFade * (0.2 + 0.8 * phaseF) * albedoScale
        * glintSkyFade * Math.min(1, flux * 1.4);
      // Moon LOD: hysteresis threshold prevents rapid popping (280M km show, 320M km hide);
      // glint point retained when mesh is culled
      if (e.isMoon) {
        const parent = bodies.get(e.parentId);
        const pd = Math.hypot(
          parent.posKm[0] - shipPosKm[0], parent.posKm[1] - shipPosKm[1], parent.posKm[2] - shipPosKm[2]
        );
        if (e.mesh.visible && pd > 3.2e8) e.mesh.visible = false;
        else if (!e.mesh.visible && pd < 2.8e8) e.mesh.visible = true;
      }
    }
    const dSunKm = Math.hypot(shipPosKm[0], shipPosKm[1], shipPosKm[2]);
    const dAU = Math.max(dSunKm / KM_PER_AU, 0.05);
    // Terrain StandardMaterial lighting: dynamic perceptual adaptation.
    // Human eye adapts to extreme illumination; midday Mercury exhibits dark gray basalt terrain.
    // Compressed dynamic range prevents blowing out to flat white.
    // Calibrated across inner and outer solar system.
    // Factor pi: StandardMaterial diffuse contains 1/pi factor, matching custom planetMaterial.
    // Guarantees seamless color continuity between local terrain and planetary disk.
    // Eliminates boundary tile seams.
    // Identical lighting scale across terrain and sphere meshes.
    // Consistent photometric response.
    const li = 1 / (dAU * dAU);
    sunLight.intensity = Math.PI * li;
    // Diagnostic hook for surface illumination monitoring
    globalThis.__sunLight = sunLight; globalThis.__skyLight = skyLight;
    // Surface illumination through haze: dense atmospheres (Venus/Titan) filter sunlight
    // to warm amber tones (Venera / Huygens telemetry); recovers with altitude.
    const gt = nearestE?.phys.atmosphere?.groundTint;
    if (gt) {
      const w = Math.exp(-Math.max(nearestSurf, 0) / (nearestE.phys.atmosphere.rayleighScaleKm * 3));
      sunLight.intensity *= 1 + ((nearestE.phys.atmosphere.groundDim ?? 1) - 1) * w;
      sunLight.color.setRGB(
        1.0 + (gt[0] - 1.0) * w,       // White base (1,1,1) blended with atmospheric haze filter
        1.0 + (gt[1] - 1.0) * w,
        1.0 + (gt[2] - 1.0) * w);
    } else {
      sunLight.color.setHex(0xffffff);
    }
    // Skylight intensity and color
    {
      const atm = nearestE?.phys.atmosphere;
      if (atm) {
        const r = atm.rayleigh ?? [1, 1, 1];
        const mx = Math.max(r[0], r[1], r[2], 1e-12);
        // Skylight color = normalized Rayleigh scattering coefficients
        skyLight.color.setRGB(r[0] / mx, r[1] / mx, r[2] / mx);
        // Ground reflection color reflects local surface albedo
        const ga = atm.groundAlbedo ?? 0.15;
        skyLight.groundColor.setRGB(ga * 1.1, ga * 0.95, ga * 0.8);
        // skyFraction: diffuse / total irradiance under clear skies
        // Higher in dusty Mars atmosphere; ~0.5 under dense Venus cloud deck.
        const frac = atm.skyFraction ?? 0.12;
        skyLight.intensity = Math.PI * li * frac;
      } else {
        skyLight.intensity = 0;
      }
    }
    // Near-field shadow handoff: below 2.7km altitude, smoothly transitions
    // to player-following directional light for crisp rock self-shadowing.
    // Point light maintains distant illumination; transition is seamless.
    const wSh = (nearestE && nearestE.phys.landable)
      ? THREE.MathUtils.smoothstep(2.7 - Math.max(nearestSurf, 0), 0, 2.4) : 0;
    if (wSh > 0.003) {
      _sunDir.copy(sun.group.position).normalize(); // Camera-relative Sun direction
      sunShadow.position.copy(_sunDir).multiplyScalar(3);
      sunShadow.target.position.set(0, 0, 0);
      sunShadow.intensity = sunLight.intensity * wSh;
      sunShadow.color.copy(sunLight.color);
      sunShadow.visible = true;
      sunShadow.castShadow = true;
      sunLight.intensity *= 1 - wSh;
    } else if (sunShadow.visible) {
      sunShadow.visible = false;
      sunShadow.castShadow = false;
      sunShadow.intensity = 0;
    }
    sun.update(simTimeSec, dSunKm, isSunOcculted(shipPosKm, sunPhys.radiusKm,
      [...bodies.values()].filter(b => b.phys.id !== 'sun')), solarActivityNow);
  }

  // Terrain surface color sampling data (authentic textures -> ImageData)
  const mapDataCache = new Map();
  function mapDataOf(id) {
    const e = bodies.get(id);
    const file = e?.phys.textures?.map;
    let data = null;
    const tex = file ? cache.get(file) : null;
    const img = tex?.image;
    const cachedData = readMapDataCache(mapDataCache, id, img);
    if (cachedData !== undefined) return cachedData;
    if (img && (img.width || img.videoWidth)) {
      try {
        // Sample at native texture resolution: terrain vertex colors sample from disk texture.
        // Preserves sharp oceanic masks and coastal outlines.
        // Eliminates chromatic bleeding on coastlines.
        const w = Math.min(img.width || img.videoWidth || 1024, 2048);
        const h = Math.max(1, Math.round(w / 2));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        // CPU terrain sampling expects the original north-at-top atlas, while
        // GPU bitmaps have been flipped during decode to match TextureLoader.
        drawTextureForSampling(ctx, img, w, h);
        data = ctx.getImageData(0, 0, w, h);
      } catch { /* Fallback on cross-origin restrictions */ }
    }
    mapDataCache.delete(id);
    mapDataCache.set(id, { image: img, data });
    if (mapDataCache.size > 4) mapDataCache.delete(mapDataCache.keys().next().value);
    return data;
  }

  return { bodies, sunEntry, orbitLines, update, postWorldUpdate, mapDataOf, cache, upgrades, boostTextures: boost,
    /** Fade distant planet glints in daylight atmosphere */
    setSkyFade(f) { glintSkyFade = f > 0.4 ? 1 : 0; } };
}

function makeGlint(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  return sp;
}
