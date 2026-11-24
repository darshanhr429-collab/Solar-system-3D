// ：Google Earth  × 。
// ：
//   orbit(, ) — GE ：///，
//   fly()     —  6DOF （F ）
//   walk()    —  G ，
// （，/） →  → HDR 。

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { SimClock } from './astro/time.js';
import { surfaceGravity } from './astro/bodies.js';
import { World } from './engine/floating.js';
import { Ship, Input } from './engine/ship.js';
import { OrbitCamera } from './engine/orbitCamera.js';
import { buildSolarSystem, texturesOfBody } from './scene/builder.js';
import { createStarfield, SKY_R } from './scene/starfield.js';
import { loadStarCatalog } from './astro/starCatalog.js';
import { NAMED_STARS } from './astro/stars.generated.js';
import { photoSkyVisibility } from './scene/photoExposure.js';
import { SURFACE_ALBEDO } from './scene/planetMaterial.js';
import { createMetering } from './engine/metering.js';
import { atmosphereFog } from './scene/atmosphere.js';
import { createBelts, createOortCloud } from './scene/belts.js';
import { createSmallBodies } from './scene/smallBodies.js';
import { createTNOScene } from './scene/tnoScene.js';
import { createComets } from './scene/comets.js';
import { createHeliosphere, VOYAGERS, voyagerPosition } from './scene/heliosphere.js';
import { TerrainManager } from './scene/terrain.js';
import { Labels } from './ui/labels.js';
import { HUD, targetInfo } from './ui/hud.js';
import { SearchUI } from './ui/search.js';
import { eclToWorldArr, KM_PER_AU, raDecToWorld } from './config.js';
import { initQuality, makeFpsGuard, QUALITY, IS_MOBILE } from './engine/quality.js';
import { TouchControls } from './ui/touchControls.js';
import { t, bodyName, LANG, applyDomI18n } from './ui/i18n.js';
import { AudioEngine } from './engine/audio.js';
import { Compass } from './ui/compass.js';
import { ScaleReference } from './ui/scaleRef.js';
import { Bookmarks } from './ui/bookmarks.js';
import { TourSystem } from './ui/tours.js';
import { Narrator } from './ui/tts.js';
import { buildTourUI } from './ui/tourUI.js';
import { TeacherToolkit } from './ui/teacher.js';
import { EclipseSystem } from './scene/eclipses.js';
import { WebXRManager } from './engine/webxr.js';
import { createCockpit, createShipModel, createHelmet, createEvaSuit } from './scene/cockpit.js';
import { createSpacecraftModel, makeSpacecraftGlow, SPACECRAFT_TIMELINES,
         NEW_HORIZONS, newHorizonsPosition } from './scene/spacecraft.js';
import { createApolloLandmarks, createRoverSites } from './scene/landmarks.js';
import { createEarthSatellites, SATELLITE_STATS } from './scene/earthSatellites.js';
import { setupNasaNewsUI } from './ui/nasaNews.js';
import { setupUserGuideUI } from './ui/userGuide.js';
import { createEphemerisLoader } from './engine/ephemerisLoader.js';
import { createCameraFeel } from './engine/cameraFeel.js';
import { bootstrapRenderer } from './engine/rendererBootstrap.js';

const renderBoot = await bootstrapRenderer({
  canvas: document.getElementById('app'), create: options => new THREE.WebGLRenderer(options),
  status({ state }) {
    const text = document.getElementById('start-btn-text');
    if (text) { text.removeAttribute('data-i18n'); text.textContent = t(state === 'failed' ? 'start.retryGpu' : 'start.retryingGpu'); }
    if (state === 'failed') {
      const message = document.createElement('p');message.id = 'startup-error';message.setAttribute('role', 'alert');message.textContent = t('start.gpuUnavailable');
      const button = document.getElementById('start-btn');button.before(message);button.disabled = false;button.onclick = () => location.reload();
    }
  },
});
// Failure leaves an interactive retry screen; skip graphics-dependent setup.
if (renderBoot) {
const { renderer, canvas } = renderBoot;
initQuality(renderer); //  buildSolarSystem （/）
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.pixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
// （/ builder  DirectionalLight ；
//  castShadow ，）
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;

const STAR_DEG = Math.PI / 180; // /（）→ 

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0); // （ fog:true ）

// （IBL）。 envMap， metalness 0.6–0.8 ——
// ""、、、：
// MeshStandardMaterial ， (1−metalness)  20%，
//  0，。""。
//
// ：，，
// 。，""。
{
  const W = 256, H = 128;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0.0, '#1a2233');   // ：
  grd.addColorStop(0.5, '#2a2a30');   // 
  grd.addColorStop(1.0, '#3a332c');   // ：
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // ：（，）
  const sunGrd = g.createRadialGradient(W * 0.5, H * 0.28, 0, W * 0.5, H * 0.28, W * 0.16);
  sunGrd.addColorStop(0, 'rgba(255,244,230,1)');
  sunGrd.addColorStop(0.25, 'rgba(255,230,200,0.55)');
  sunGrd.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = sunGrd; g.fillRect(0, 0, W, H);
  const envTex = new THREE.CanvasTexture(cv);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
  // ：/，；
  // ，。
  scene.environmentIntensity = 0.35;
  envTex.dispose(); pmrem.dispose();
}
// R11：far  ~106 ly  3D （）+ （100000 AU=1.58 ly）
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 5e-7, 1e15);
scene.add(camera);
// （ scene/cockpit.js）。
//
// ** + **：
// （ 2.2R  near=5849 km）， 0.6m、 16m ——
//  camera ，。
// ， 1cm，。
const overlayScene = new THREE.Scene();
const overlayCam = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 200);
// ：，/（，
// ）。，；
// ，。
{
  // ****（+z）：， +z 
  // 。 -z（），，
  // /。
  const key = new THREE.DirectionalLight(0xfff4e8, 2.4);
  key.position.set(0.35, 0.55, 1.0);
  overlayScene.add(key);
  const fill = new THREE.DirectionalLight(0x8fa8c8, 0.9);
  fill.position.set(-0.6, -0.4, 0.8);
  overlayScene.add(fill);
  overlayScene.add(new THREE.AmbientLight(0x5a6472, 0.35));
}
const cockpit = createCockpit();
overlayScene.add(cockpit);
const shipModel = createShipModel();
overlayScene.add(shipModel);
const helmet = createHelmet();
// （EVA /）， cockpit.js 
const evaSuit = createEvaSuit();
evaSuit.visible = false;
// ****，： ship.quat ，
// （）。
// ——""，。
// ，。
overlayScene.add(overlayCam);
overlayCam.add(evaSuit);
overlayScene.add(helmet);
let thirdPerson = false;   // V /

const ambient = new THREE.AmbientLight(0x404858, 0.02);
scene.add(ambient);

// HDR ：HalfFloat ——（ ×14 HDR、、）
// ACES  8-bit  1.0，
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
  window.innerWidth, window.innerHeight,
  { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace,
    samples: QUALITY.tier === 'high' ? Math.min(4, renderer.capabilities.maxSamples) : 0 }
));
composer.addPass(new RenderPass(scene, camera));
// ===  ===
// ""——（/），
// ：（）。
//  HDR ：（×14）、、
// ，（ ~1–5）。
// /， radius 。
const bloomPass = (QUALITY.tier === 'high' || QUALITY.tier === 'low')
  ? new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight),
      QUALITY.tier === 'high' ? 0.22 : 0.16,   // strength：
      QUALITY.tier === 'high' ? 0.14 : 0.12,   // radius：
      1.05)                                     // threshold（HDR ）
  : null;
if (bloomPass) composer.addPass(bloomPass);
composer.addPass(new OutputPass());
const fxaaPass = QUALITY.tier === 'low' ? new ShaderPass(FXAAShader) : null;
if (fxaaPass) composer.addPass(fxaaPass);
composer.setPixelRatio(renderer.getPixelRatio());
function syncRenderResolution() {
  composer.setPixelRatio(renderer.getPixelRatio());
  if (bloomPass) bloomPass.setSize(window.innerWidth, window.innerHeight);
  if (fxaaPass) fxaaPass.uniforms.resolution.value.set(
    1 / (window.innerWidth * renderer.getPixelRatio()),
    1 / (window.innerHeight * renderer.getPixelRatio()));
}
syncRenderResolution();

// ：、（）
const fpsGuard = makeFpsGuard(renderer, () => {
  for (const [, e] of builder.bodies) {
    if (e.mat?.userData.uniforms?.uDetailMode) e.mat.userData.uniforms.uDetailMode.value =
      QUALITY.detail ? ((e.phys.type === 'gas' || e.phys.type === 'ice') ? 2 : (e.phys.landable ? 1 : 0)) : 0;
  }
  hud.tip(t('tip.quality'));
}, () => {
  // ： detailMode（ builder.detailModeOf ）
  for (const [, e] of builder.bodies) {
    if (e.mat?.userData.uniforms?.uDetailMode) {
      e.mat.userData.uniforms.uDetailMode.value =
        QUALITY.detail ? ((e.phys.type === 'gas' || e.phys.type === 'ice') ? 2 : (e.phys.landable ? 1 : 0)) : 0;
    }
  }
}, syncRenderResolution);

const hud = new HUD();
const world = new World();
const input = new Input(window, canvas);
const ship = new Ship();
const orbitCam = new OrbitCamera(camera);
const simClock = new SimClock();
const clock = new THREE.Clock();

let builder, comets, labels, searchUI, touchControls, sky, belts, oortCloud, tnoScene, smallBodies;
let appMode = 'orbit'; // orbit | fly | walk
const registry = new Map();
let selectedId = null;
const ephemerisLoader = createEphemerisLoader();
// ： /  / FOV （ engine/cameraFeel.js）
const cameraFeel = createCameraFeel();
let cameraFovBase = 58;   //  FOV，
const voyagerEntries = [];
const boundaryEntries = [];
const IDENTITY_Q = new THREE.Quaternion();
let lastLabelClickFocus = 'earth';
let lastLabelClickId = null;
let labelClickTimer = null;
const LABEL_CLICK_WINDOW = 250;

// （#3-#55 ）
let audioEngine, compass, scaleRef, bookmarks, tourSystem, narrator, teacherToolkit, eclipseSystem, webxr;
let apolloLandmarks, roverSites, earthSatellites, nasaNewsUI, userGuideUI;

init();

async function init() {
  applyDomI18n();
  builder = await buildSolarSystem(scene, world, (d, total) => hud.setLoading(d, total), (d, total) => hud.setBgLoading(d, total));

  sky = createStarfield(builder.cache.get('milkyway.jpg'));
  scene.add(sky.group); // （）

  // ： 3D （，R11）。
  // ——，。
  scene.add(sky.brightGroup);
  world.register(new Float64Array(3), sky.brightGroup);
  loadStarCatalog().then((cat) => {
    if (cat) { sky.setCatalog(cat); return; }
    // ****（ HUD ）。
    // 、、——
    // """"。。
    hud.tip(t('tip.starsUnavailable'));
  });

  // //：，
  belts = createBelts();
  scene.add(belts);
  world.register(new Float64Array(3), belts);

  // （JPL SBDB ，， scene/smallBodies.js）
  smallBodies = createSmallBodies();
  scene.add(smallBodies.group);
  world.register(new Float64Array(3), smallBodies.group);

  // R11：（2000–100000 AU）
  oortCloud = createOortCloud(); // { group, update(dSunAU) }
  scene.add(oortCloud.group);
  world.register(new Float64Array(3), oortCloud.group);
  const helio = createHeliosphere();
  scene.add(helio);
  world.register(new Float64Array(3), helio);
  comets = createComets(world);
  for (const e of comets.entries) scene.add(e.group);

  // （#30, #31：3D  + ）
  for (const vg of VOYAGERS) {
    const group = new THREE.Group();
    const posKm = new Float64Array(3);
    world.register(posKm, group);
    scene.add(group);
    //  1:1  3D （）
    try {
      const model = createSpacecraftModel(vg.id);
      group.add(model);
      // （AU ）
      const glow = makeSpacecraftGlow(0x88ccff);
      group.add(glow);
    } catch { /* Fallback to empty Group on model error */ }
    voyagerEntries.push({ vg, posKm, group, posFn: (jd) => voyagerPosition(vg, jd) });
  }

  // ：（NEW_HORIZONS / newHorizonsPosition /
  // createSpacecraftModel('newhorizons')），——。
  {
    const group = new THREE.Group();
    const posKm = new Float64Array(3);
    world.register(posKm, group);
    scene.add(group);
    try {
      group.add(createSpacecraftModel('newhorizons'));
      group.add(makeSpacecraftGlow(0x88ffcc));
    } catch { /* Fallback to empty Group on model failure */ }
    voyagerEntries.push({ vg: NEW_HORIZONS, posKm, group, posFn: (jd) => newHorizonsPosition(jd) });
  }

  // （""）
  const DEG = Math.PI / 180;
  const noseLon = 255.4 * DEG, noseLat = 5.1 * DEG;
  const noseEcl = {
    x: Math.cos(noseLat) * Math.cos(noseLon),
    y: Math.cos(noseLat) * Math.sin(noseLon),
    z: Math.sin(noseLat),
  };
  for (const [id, nameZh, nameEn, rAU, desc] of [
    ['termshock', 'Termination Shock', 'Termination Shock', 90,
      'The boundary where the solar wind abruptly slows from supersonic to subsonic speed (approx. 90 AU). Crossed by Voyager 1 in 2004.'],
    ['heliopause', 'Heliopause', 'Heliopause', 121,
      'The boundary where solar wind pressure balances interstellar medium pressure—the outer edge of the Sun\'s sphere of influence (approx. 121 AU). Crossing here enters interstellar space.'],
  ]) {
    const posKm = new Float64Array([0, 0, 0]);
    const w = eclToWorldArr({ x: noseEcl.x * rAU * KM_PER_AU, y: noseEcl.y * rAU * KM_PER_AU, z: noseEcl.z * rAU * KM_PER_AU });
    posKm[0] = w[0]; posKm[1] = w[1]; posKm[2] = w[2];
    const group = new THREE.Group();
    group.position.set(0, 0, 0);
    world.register(posKm, group);
    scene.add(group);
    boundaryEntries.push({ id, nameZh, nameEn, desc, posKm, group, rAU });
  }

  // R11：28 （TNO）— 、、
  //  sun.group（，）
  tnoScene = createTNOScene(scene, world, builder.sunEntry.group);
  for (const [id, e] of tnoScene.entries) {
    registry.set(id, {
      nameZh: e.phys.nameZh, nameEn: e.phys.nameEn,
      desc: e.phys.desc, kind: 'tno',
      phys: { radiusKm: e.phys.radiusKm, type: 'dwarf' },
      posKm: e.posKm, relObj: e.group, quatRef: null,
      groundRadius: null,
      minDistKm: e.phys.radiusKm * 1.5, // 
      viewDist: Math.max(e.phys.radiusKm * 12, 3e5),
    });
  }

  buildRegistry();
  setupLabels();
  searchUI = new SearchUI(registry, (id) => flyTo(id), {
    getOrbits: () => orbitLinesOn,
    toggleOrbits: () => { orbitLinesOn = !orbitLinesOn; },
    onSelect: () => { touchControls?.closeDirectory(); },
  });

  // Mobile on-screen controls — only created on touch devices (IS_MOBILE)
  if (IS_MOBILE) {
    touchControls = new TouchControls(input, {
      switchToFly:    switchToFly,
      switchToOrbit:  switchToOrbit,
      toggleOrbits:   () => { orbitLinesOn = !orbitLinesOn; },
      toggleAudio:    () => { audioEngine?.toggle(); },
      warpUp:         () => hud.warpUp(),
      warpDown:       () => hud.warpDown(),
    });
  }

  setupTerrainMgr();

  // ：GE （）
  builder.update(simClock.jdTT, ship.posKm);
  orbitCam.init(orbitEnv, 'earth', 4);
  syncShipToOrbit();
  select('earth');

  // ---- URL hash （#1）：；Ctrl+L  ----
  applyLocationHash();
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyL' && !e.shiftKey) {
      e.preventDefault(); // 
      copyShareUrl();
    }
  });

  document.getElementById('start-btn').addEventListener('click', () => hud.hideStart());
  let downX = 0, downY = 0;
  canvas.addEventListener('mousedown', (e) => { downX = e.clientX; downY = e.clientY; });
  canvas.addEventListener('click', (e) => {
    // fly/walk （）；
    if ((appMode === 'fly' || appMode === 'walk') && !input.locked && !IS_MOBILE) canvas.requestPointerLock();
    else if (input.locked && labels.aimedId) select(labels.aimedId);
    else if (appMode === 'orbit' && !input.locked && !orbitCam.flight &&
      Math.hypot(e.clientX - downX, e.clientY - downY) < 6) {
      //  = （R10-fix-3：，）
      const hit = pickBody(e.clientX, e.clientY);
      if (hit && hit.id !== orbitCam.focusId) {
        orbitCam.setPendingFocus(hit.id, hit.localDir, hit.localDist);
        select(hit.id);
        focusTipUntil = performance.now() + 2600;
      }
    }
  });
  input.onLockChange = (locked) => {
    // Esc  → （；）
    if (!locked && appMode === 'fly' && !IS_MOBILE) switchToOrbit();
  };
  window.addEventListener('resize', onResize);
  hud.loadingDone();

  // ── （#3-#55 ）──────────────────────────────
  // （#4, #32）：，
  audioEngine = new AudioEngine();

  // 3D （#37）：
  compass = new Compass(document.body);

  // Scale reference（#38）： + 
  scaleRef = new ScaleReference(scene, camera);

  // （#52）：localStorage 
  bookmarks = new Bookmarks();

  // Speech narration（#41）：Web Speech API
  narrator = new Narrator();

  // （#39, #40）： flyTo/select 
  tourSystem = new TourSystem({
    flyTo: (id) => flyTo(id),
    select: (id) => select(id),
    getMode: () => appMode,
    setMode: (m) => { if (m === 'orbit' && appMode !== 'orbit') switchToOrbit(); },
    hud: hud,
    orbitCam: orbitCam,
    orbitEnv: orbitEnv,
  });
  //  UI （ + ）；onNarration  TTS 
  const tourUIState = buildTourUI(tourSystem, narrator);
  tourSystem.onNarration = (text) => {
    if (narrator.supported && tourUIState.ttsOn) narrator.speak(text, LANG);
  };

  // Teacher toolkit: passed TourSystem instance
  teacherToolkit = new TeacherToolkit({
    tours: tourSystem,
    select: (id) => select(id),
    flyTo: (id) => flyTo(id),
    hud: hud,
    nameOf: (id) => bodyName(registry.get(id) ?? { nameZh: id, nameEn: id }),
  });

  // （#25）
  eclipseSystem = new EclipseSystem();

  // WebXR/VR （#33）：
  webxr = new WebXRManager(renderer, camera, scene);
  webxr.init().then((supported) => {
    if (!supported) return;
    const btn = webxr.createButton();
    if (btn) document.body.appendChild(btn);
    webxr.setControllerCallback(handleXREvent);
  });

  // Apollo （#34）（#35）—— try-catch ，
  try { apolloLandmarks = createApolloLandmarks(scene, terrainMgr); } catch (e) { console.error('[Apollo landmarks]', e); }
  try { roverSites = createRoverSites(scene, terrainMgr); } catch (e) { console.error('[Rover sites]', e); }
  try {
    const earthBody = builder.bodies.get('earth');
    earthSatellites = createEarthSatellites(scene, world, earthBody?.group);
  } catch (e) { console.error('[Earth satellites]', e); }
  try {
    nasaNewsUI = setupNasaNewsUI({
      flyTo: (id) => flyTo(id),
      select: (id) => select(id),
      toggleSatellites: (v) => {
        if (earthSatellites) {
          earthSatellites.visible = (v !== undefined) ? v : !earthSatellites.visible;
          showActionTip(earthSatellites.visible ? 'Earth Satellites (10,000+): Visible' : 'Earth Satellites: Hidden');
        }
      },
      orbitCam,
    });
  } catch (e) { console.error('[NASA News UI]', e); }
  try {
    userGuideUI = setupUserGuideUI({
      flyTo: (id) => flyTo(id),
      select: (id) => select(id),
      toggleSatellites: (v) => {
        if (earthSatellites) {
          earthSatellites.visible = (v !== undefined) ? v : !earthSatellites.visible;
          showActionTip(earthSatellites.visible ? 'Earth Satellites (10,000+): Visible' : 'Earth Satellites: Hidden');
        }
      },
      openNasaNews: () => { nasaNewsUI?.open?.(); },
    });
  } catch (e) { console.error('[User Guide UI]', e); }

  // ：C 、M 、Ctrl+B 、Ctrl+Shift+B 、Y （）
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC' && !e.repeat) { e.preventDefault(); compass?.toggle(); }
    if (e.code === 'KeyM' && !e.repeat) {
      e.preventDefault();
      const on = audioEngine?.toggle();
      hud.tip(t(on ? 'tip.audioOn' : 'tip.audioOff'));
    }
    // I-14：（ScaleReference.toggleCompare）——
    // ，。U 。
    if (e.code === 'KeyU' && !e.repeat) {
      e.preventDefault();
      const on = scaleRef?.toggleCompare();
      if (on !== undefined) showActionTip(t(on ? 'tip.compareOn' : 'tip.compareOff'));
    }
    if (e.code === 'KeyY' && !e.repeat && appMode === 'walk') {
      e.preventDefault();
      const on = scaleRef?.toggleHuman();
      showActionTip(t(on ? 'tip.humanOn' : 'tip.humanOff'));
    }
    if (e.code === 'KeyK' && !e.repeat) {
      e.preventDefault();
      if (earthSatellites) {
        earthSatellites.visible = !earthSatellites.visible;
        showActionTip(earthSatellites.visible ? 'Earth Satellites (10,000+): Visible' : 'Earth Satellites: Hidden');
      }
    }
    if (e.code === 'KeyB' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) restoreLatestBookmark();
      else saveBookmark();
    }
  });

  // I-15：Classroom ?tour= URL parameter handling
  // ，（）。
  try {
    const wantTour = new URLSearchParams(window.location.search).get('tour');
    if (wantTour && tourSystem?.start) {
      // ，
      setTimeout(() => { try { tourSystem.start(wantTour); } catch { /* Unknown tour id */ } }, 1500);
    }
  } catch { /* Non-browser location environment */ }

  window.__game = { get __nearest() { return nearestCache; }, ship, simClock, overlayScene, overlayCam, cockpit, shipModel, select, flyTo, orbitCam, orbitEnv, builder, registry, input, terrainMgr, camera, getMode: () => appMode, setOrbitLinesVisible: (v) => { orbitLinesOn = v; }, audioEngine, compass, scaleRef, bookmarks, tourSystem, narrator, teacherToolkit, eclipseSystem, webxr, smallBodies, quality: QUALITY, ephemerisLoader, renderer, composer, apolloLandmarks, roverSites, earthSatellites, nasaNewsUI, userGuideUI, sky, labels, tnoScene, comets, oortCloud };
  renderer.setAnimationLoop(loop);

  // ── ：// ──
  // requestAnimationFrame ， simClock 。
  // ，。
  function syncClockAfterWake() {
    if (simClock.paused) return;
    const jdBefore = simClock.jdTT;
    simClock.tick(0);
    const jdAfter = simClock.jdTT;
    // ，/，
    if (Math.abs(jdAfter - jdBefore) > 1e-12) {
      builder.update(jdAfter, ship.posKm);
      comets.update(jdAfter, ship.posKm);
      tnoScene.update(jdAfter, ship.posKm);
      for (const v of voyagerEntries) {
        const p = v.posFn(jdAfter);
        const w = eclToWorldArr(p);
        v.posKm[0] = w[0]; v.posKm[1] = w[1]; v.posKm[2] = w[2];
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncClockAfterWake();
  });
  window.addEventListener('pageshow', syncClockAfterWake);
  window.addEventListener('focus', syncClockAfterWake);
}

function buildRegistry() {
  for (const [id, e] of builder.bodies) {
    registry.set(id, {
      nameZh: e.phys.nameZh, nameEn: e.phys.nameEn, phys: e.phys,
      desc: e.phys.desc, parentId: e.parentId,
      kind: id === 'sun' ? 'star' : e.isMoon ? 'moon' : 'planet',
      posKm: e.posKm, relObj: e.group, quatRef: e.mesh.quaternion,
      // （）；（R7 #1/#5）
      groundRadius: e.phys.landable ? (dir) => terrainMgr.heightAt(id, dir) : null,
      minDistKm: !e.phys.landable && e.phys.atmosphere && id !== 'sun'
        ? e.phys.radiusKm * 1.0012 : null,
    });
  }
  for (const e of comets.entries) {
    registry.set(e.c.id, {
      nameZh: e.c.nameZh, nameEn: e.c.nameEn, desc: e.c.desc, kind: 'comet',
      phys: { radiusKm: 10 }, posKm: e.posKm, relObj: e.group, viewDist: 2.5e6,
    });
  }
  for (const v of voyagerEntries) {
    registry.set(v.vg.id, {
      nameZh: v.vg.nameZh, nameEn: v.vg.nameEn, desc: v.vg.desc, kind: 'probe',
      phys: { radiusKm: 0.01 }, posKm: v.posKm, relObj: v.group, viewDist: 8e5,
    });
  }
  for (const b of boundaryEntries) {
    registry.set(b.id, {
      nameZh: b.nameZh, nameEn: b.nameEn, desc: b.desc, kind: 'boundary',
      phys: { radiusKm: 1 }, posKm: b.posKm, relObj: b.group, viewDist: 2.5 * KM_PER_AU,
    });
  }
  // （ + ，#7）。kind:'region'  pickBody/centerHit 
  // （、/），。
  // radiusKm （dist < radiusKm×1.6 ）：，
  // 、，。
  registry.set('asteroidbelt', {
    nameZh: 'Asteroid Belt', nameEn: 'Asteroid Belt', kind: 'region',
    desc: 'Main Asteroid Belt (2.1–3.4 AU): A circumstellar disc between Mars and Jupiter containing hundreds of thousands of small rocky bodies.',
    phys: { radiusKm: 2 * KM_PER_AU }, posKm: new Float64Array(3), relObj: belts, viewDist: 5.5 * KM_PER_AU,
  });
  registry.set('kuiperbelt', {
    nameZh: 'Kuiper Belt', nameEn: 'Kuiper Belt', kind: 'region',
    desc: 'Kuiper Belt (30–50 AU): A disc of icy bodies beyond Neptune\'s orbit, home to dwarf planets such as Pluto and Haumea.',
    phys: { radiusKm: 40 * KM_PER_AU }, posKm: new Float64Array(3), relObj: belts, viewDist: 75 * KM_PER_AU,
  });
  registry.set('oortcloud', {
    nameZh: 'Oort Cloud', nameEn: 'Oort Cloud', kind: 'region',
    desc: 'The outermost spherical cloud of icy planetesimals, extending approx. 2,000–100,000 AU from the Sun, source of long-period comets.',
    phys: { radiusKm: 200 * KM_PER_AU }, posKm: new Float64Array(3), relObj: oortCloud.group, viewDist: 6000 * KM_PER_AU,
  });

  // Lunar Expeditions & Equipment Landmarks
  const moonEntry = builder.bodies.get('moon');
  const moonPos = moonEntry?.posKm ?? new Float64Array(3);
  const moonGroup = moonEntry?.group;

  registry.set('chandrayaan3', {
    nameZh: 'Chandrayaan-3', nameEn: 'Chandrayaan-3 (Shiv Shakti Point)', kind: 'probe',
    desc: 'India\'s historic lunar south pole mission at 69.37°S, 32.32°E. Vikram lander and Pragyan rover.',
    phys: { radiusKm: 0.005 },
    parentId: 'moon',
    posKm: moonPos,
    relObj: moonGroup,
    viewDist: 1745,
  });
  registry.set('apollo11', {
    nameZh: 'Apollo 11', nameEn: 'Apollo 11 (Mare Tranquillitatis)', kind: 'probe',
    desc: 'Apollo 11 lunar landing site (0.67°N, 23.47°E). Lunar Module Descent Stage, EASEP, and Laser Retroreflector.',
    phys: { radiusKm: 0.005 },
    parentId: 'moon',
    posKm: moonPos,
    relObj: moonGroup,
    viewDist: 1745,
  });
  registry.set('apollo15', {
    nameZh: 'Apollo 15', nameEn: 'Apollo 15 (Hadley Rille)', kind: 'probe',
    desc: 'Apollo 15 landing site (26.13°N, 3.63°E). Lunar Roving Vehicle (LRV) and ALSEP deep drill station.',
    phys: { radiusKm: 0.005 },
    parentId: 'moon',
    posKm: moonPos,
    relObj: moonGroup,
    viewDist: 1745,
  });

  // Earth Artificial Satellites
  const earthEntry = builder.bodies.get('earth');
  const earthPos = earthEntry?.posKm ?? new Float64Array(3);
  const earthGroup = earthEntry?.group;

  registry.set('iss', {
    nameZh: 'ISS', nameEn: 'International Space Station', kind: 'probe',
    desc: 'Modular orbital microgravity laboratory at ~415 km altitude, orbiting at 7.66 km/s.',
    phys: { radiusKm: 0.05 },
    parentId: 'earth',
    posKm: earthPos,
    relObj: earthGroup,
    viewDist: 6800,
  });
  registry.set('hubble', {
    nameZh: 'Hubble', nameEn: 'Hubble Space Telescope', kind: 'probe',
    desc: 'Pioneering space telescope at ~540 km altitude in low Earth orbit.',
    phys: { radiusKm: 0.01 },
    parentId: 'earth',
    posKm: earthPos,
    relObj: earthGroup,
    viewDist: 6950,
  });
  registry.set('satellites', {
    nameZh: 'Earth Satellites', nameEn: 'Earth Satellites (10,000+ Swarm)', kind: 'region',
    desc: 'Humanity\'s orbital network: over 10,240 active satellites across LEO, MEO, and GEO belts.',
    phys: { radiusKm: 42164 },
    parentId: 'earth',
    posKm: earthPos,
    relObj: earthGroup,
    viewDist: 70000,
  });
}

/** OrbitCamera  */
const orbitEnv = {
  get(id) {
    const t = registry.get(id);
    return {
      posKm: t.posKm,
      radiusKm: t.phys?.radiusKm ?? 1,
      ringsOuterKm: t.phys?.rings?.outerKm ?? null,
      quat: t.quatRef ?? IDENTITY_Q,
      viewDist: t.viewDist,
      groundRadius: t.groundRadius ?? null,
      minDistKm: t.minDistKm ?? null,
    };
  },
  /** （id+ km）——
   * （R8 #2 / R9-1b/1d）。 null。 */
  centerHit(posKm, dir) {
    let best = null;
    for (const [id, t] of registry) {
      if (t.kind === 'region') continue; // （/）
      const R = t.phys?.radiusKm ?? 0;
      if (R < 1) continue; // /
      const margin = R * 1.004 + 1; // 
      const ox = t.posKm[0] - posKm[0];
      const oy = t.posKm[1] - posKm[1];
      const oz = t.posKm[2] - posKm[2];
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      if (b <= 0) continue;
      const det = b * b - (ox * ox + oy * oy + oz * oz - margin * margin);
      if (det < 0) continue;
      const tHit = b - Math.sqrt(det);
      if (tHit > 1e-6 && (best === null || tHit < best.depth)) best = { id, depth: tHit };
    }
    return best;
  },
  centerDepth(posKm, dir) { return this.centerHit(posKm, dir)?.depth ?? null; },
};

function setupLabels() {
  labels = new Labels(document.getElementById('labels'), camera);
  // ：（，/PageUpDown ）；
  // 。，
  //  fromId 。
  labels.onSelect = (id) => {
    // （/），——。
    if (appMode === 'orbit' && !orbitCam.flight && !id.startsWith('star_') &&
        registry.get(id)?.kind !== 'region') {
      if (!labelClickTimer || lastLabelClickId !== id) {
        lastLabelClickFocus = orbitCam.focusId;
      }
      lastLabelClickId = id;
      clearTimeout(labelClickTimer);
      labelClickTimer = setTimeout(() => { labelClickTimer = null; lastLabelClickId = null; }, LABEL_CLICK_WINDOW);
      if (id !== orbitCam.focusId) {
        orbitCam.setPendingFocus(id);
        focusTipUntil = performance.now() + 2600;
      }
    }
    select(id);
  };
  labels.onFlyTo = (id) => {
    clearTimeout(labelClickTimer);
    labelClickTimer = null;
    lastLabelClickId = null;
    const fromId = appMode === 'orbit' ? (lastLabelClickFocus ?? orbitCam.focusId) : null;
    flyTo(id, fromId);
  };
  for (const [id, t] of registry) {
    labels.add({
      id, name: bodyName(t),
      kind: t.kind === 'moon' ? 'moon' : t.kind === 'planet' || t.kind === 'star' ? 'planet'
        : ['region', 'tno', 'comet', 'probe', 'boundary'].includes(t.kind) ? t.kind : 'poi',
      radiusKm: t.phys?.radiusKm ?? 1,
      getRelPos: (v) => v.copy(t.relObj.position),
    });
  }
  // （，；——）。
  //  2.5 ：BSC5  436 ，；2.5 ，
  // ""。——
  // stars.generated.js  zh ，，。
  for (const s of NAMED_STARS) {
    if (s.mag > 2.5) continue;
    // ****：，
    // （——、，）。
    const dirWorld = raDecToWorld(s.ra * 15 * STAR_DEG, s.dec * STAR_DEG, new THREE.Vector3());
    const name = s.en;
    labels.add({
      id: 'star_' + s.en, name, kind: 'fixstar', radiusKm: 0.001,
      distText: s.ly > 0 ? s.ly + ' ' + t('u.ly') : '',
      getRelPos: (v) => v.copy(dirWorld).multiplyScalar(SKY_R * 0.97),
    });
  }
}

function select(id) {
  ephemerisLoader.prefetch(id, simClock.jdTT);
  selectedId = id;
}

/** （，~0.7° ，R10）。 { id, t, localDir, localDist }  null */
const _pickDir = new THREE.Vector3();
const _pickP = new THREE.Vector3();
const _pickHit = new THREE.Vector3();
const _pickQ = new THREE.Quaternion();
let focusTipUntil = 0;
let actionTipUntil = 0; // （/）

/** ： 2.5 ， updateTip  */
function showActionTip(text, ms = 2500) {
  actionTipUntil = performance.now() + ms;
  hud.tip(text);
}
function pickBody(cx, cy) {
  _pickDir.set(
    (cx / window.innerWidth) * 2 - 1, -((cy / window.innerHeight) * 2 - 1), 0.5
  ).unproject(camera).normalize(); // ：，
  let best = null;
  for (const [id, t] of registry) {
    if (t.kind === 'region') continue; // 
    const R = t.phys?.radiusKm ?? 0;
    if (R < 1) continue;
    _pickP.copy(t.relObj.position); // 
    const b = _pickP.dot(_pickDir);
    if (b <= 0) continue;
    const margin = Math.max(R, b * 0.012); //  ~0.7° 
    const det = b * b - (_pickP.lengthSq() - margin * margin);
    if (det < 0) continue;
    const tHit = b - Math.sqrt(det);
    if (best === null || tHit < best.t) best = { id, t: Math.max(tHit, 0), entry: t, p: _pickP.clone() };
  }
  if (!best) return null;
  const R = best.entry.phys?.radiusKm ?? 1;
  // （）
  _pickHit.copy(_pickDir).multiplyScalar(best.t).sub(best.p);
  // 
  _pickQ.copy(best.entry.quatRef ?? IDENTITY_Q).invert();
  const localDist = Math.max(_pickHit.length(), R * 0.1);
  const localDir = _pickHit.clone().applyQuaternion(_pickQ).normalize();
  return { id: best.id, t: best.t, localDir, localDist };
}

/** GE ： →  → （fromId  orbit ） */
function flyTo(id, fromId = null) {
  if (!registry.has(id)) return;
  select(id);
  if (appMode !== 'orbit') {
    // Take over from ship/walk mode to orbit mode with continuous orientation
    const focus = nearestCache?.id ?? 'sun';
    document.exitPointerLock?.();
    orbitCam.adoptPosition(orbitEnv, focus, ship.posKm, ship.quat);
    appMode = 'orbit';
    ship.mode = 'fly';
  }
  const DEG = Math.PI / 180;
  if (id === 'chandrayaan3') {
    orbitCam.flyTo(orbitEnv, 'moon', fromId);
    orbitCam.lat = -69.373 * DEG;
    orbitCam.lon = 32.319 * DEG;
    orbitCam.dist = orbitCam.distTarget = 1737.4 * 1.05;
    orbitCam.tilt = 35 * DEG;
    return;
  }
  if (id === 'apollo11') {
    orbitCam.flyTo(orbitEnv, 'moon', fromId);
    orbitCam.lat = 0.674 * DEG;
    orbitCam.lon = 23.473 * DEG;
    orbitCam.dist = orbitCam.distTarget = 1737.4 * 1.05;
    orbitCam.tilt = 35 * DEG;
    return;
  }
  if (id === 'apollo15') {
    orbitCam.flyTo(orbitEnv, 'moon', fromId);
    orbitCam.lat = 26.132 * DEG;
    orbitCam.lon = 3.634 * DEG;
    orbitCam.dist = orbitCam.distTarget = 1737.4 * 1.05;
    orbitCam.tilt = 40 * DEG;
    return;
  }
  if (id === 'iss' || id === 'hubble' || id === 'satellites') {
    orbitCam.flyTo(orbitEnv, 'earth', fromId);
    if (earthSatellites) earthSatellites.visible = true;
    if (id === 'iss') orbitCam.dist = orbitCam.distTarget = 6371 + 415 + 200;
    else if (id === 'hubble') orbitCam.dist = orbitCam.distTarget = 6371 + 540 + 200;
    else orbitCam.dist = orbitCam.distTarget = 30000;
    return;
  }
  orbitCam.flyTo(orbitEnv, id, fromId);
}

function syncShipToOrbit() {
  ship.posKm[0] = orbitCam.posKm[0];
  ship.posKm[1] = orbitCam.posKm[1];
  ship.posKm[2] = orbitCam.posKm[2];
  ship.quat.copy(orbitCam.quat);
  ship.vel.set(0, 0, 0);
}

function switchToOrbit() {
  appMode = 'orbit';
  ship.mode = 'fly';
  document.exitPointerLock?.();
  const focus = nearestCache?.id ?? selectedId ?? 'sun';
  orbitCam.adoptPosition(orbitEnv, focus, ship.posKm, ship.quat); // （R7 #7）
  // /， GE 、
  // ，""（R10 ）。
  // ：adoptPosition  this.tilt  -autoTilt，
  //  auto-tilt ， tilt ，、
  //  dolly。 auto-tilt 。
  orbitCam.tilt = 0;
  orbitCam.panOffset.set(0, 0, 0); //  dolly
  orbitCam.distTarget = orbitCam.dist + Math.max(orbitCam.dist * 0.002, 0.05);
  //  walk/fly  0.8s ，
  //  walk，“/”。
  lastTakeoff = performance.now();
  input.cancelGestures(); // ，/
}

function switchToFly() {
  if (orbitCam.flight) orbitCam.cancelFlight(orbitEnv);
  appMode = 'fly';
  ship.mode = 'fly';
  syncShipToOrbit();
  if (!IS_MOBILE) canvas.requestPointerLock();
}

// ----------  ----------
const terrainMgr = new TerrainManager();
function setupTerrainMgr() {
  terrainMgr.physOf = (id) => builder.bodies.get(id).phys;
  terrainMgr.meshOf = (id) => builder.bodies.get(id).mesh;
  terrainMgr.getMapData = (id) => builder.mapDataOf(id);
}

// ----------  ----------
const _rel = new THREE.Vector3();
const _fogView = new THREE.Vector3();
const _fogUp = new THREE.Vector3();
const _fogSun = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _sunLocal = new THREE.Vector3();
let exposureTarget = 1;
let meter = null;
let lastMeterAt = 0;
let meteredLog2 = null;
let nearestCache = null;
let lastTakeoff = -1e9; // （ 0.8s ，）
let prevOrbitDist = 0;   // （km），
let approachMS = 0;      // （m/s，=），

function loop() {
  const frameDelta = clock.getDelta();
  const dtReal = Math.min(frameDelta, 0.1);

  // 
  handleTimeKeys();
  input.pollGamepad(appMode); // （，）
  simClock.rateTarget = hud.warpRate(simClock.paused); // rate  tick （）
  const jdTT = simClock.tick(dtReal);

  // （try-catch ：builder.update ，）
  try {
    builder.update(jdTT, ship.posKm);
  } catch (e) {
    if (!loop._builderErr) {
      loop._builderErr = true;
      console.error('[builder.update]', e);
      hud.tip('Ephemeris update error: ' + e.message);
    }
  }
  try { comets.update(jdTT, ship.posKm); } catch (e) { loopErr('comets', e); }
  try { tnoScene.update(jdTT, ship.posKm); } catch (e) { loopErr('tnoScene', e); }
  try { smallBodies.update(jdTT, ship.posKm); } catch (e) { loopErr('smallBodies', e); }
  try {
    for (const v of voyagerEntries) {
      const p = v.posFn(jdTT);
      const w = eclToWorldArr(p);
      v.posKm[0] = w[0]; v.posKm[1] = w[1]; v.posKm[2] = w[2];
    }
  } catch (e) { loopErr('voyagers', e); }

  const nearest = findNearest();
  nearestCache = nearest;
  const env = makeEnv(nearest);

  // （）：//，
  // 。
  //
  //  _lastTexBoost ： performance.now() - undefined  NaN，
  //  NaN > 1000  false，——
  // （）。
  if (builder?.boostTextures && performance.now() - (loop._lastTexBoost ?? 0) > 1000) {
    loop._lastTexBoost = performance.now();
    const files = [];
    for (const id of [orbitCam.focusId, nearest?.id, selectedId]) {
      ephemerisLoader.prefetch(id, simClock.jdTT);
      if (id) for (const f of texturesOfBody(id)) if (!files.includes(f)) files.push(f);
    }
    if (files.length) builder.boostTextures(files);
  }

  // ----------  ----------
  try {
  if (appMode === 'orbit') {
    // （GE ）
    if (orbitCam.flight && input.drag.active) orbitCam.cancelFlight(orbitEnv);
    orbitCam.update(dtReal, input, orbitEnv);
    syncShipToOrbit();
    // （m/s）：， ship.vel——
    // syncShipToOrbit()  ship.vel ， ship.vel.length()
    //  0，"0.004–0.03 rad "，
    // 。
    //  dist。
    {
      const dDist = prevOrbitDist - orbitCam.dist;
      //  adoptPosition  dist ， 1km/ 
      approachMS = Math.abs(dDist) < 1 ? dDist / Math.max(dtReal, 1e-4) * 1000 : 0;
      prevOrbitDist = orbitCam.dist;
    }
    // ： G，（NMS ，R7 #1）
    //  ship.js  20km 。 max(20, R*0.05)：
    //  318km—— G  300km **** +1.7m，
    // 、。。
    const landRange = 20;
    let autoLand = false;
    // ：/，
    // ，""。
    const inputIdle = !input.drag.active && !input.pan.active && input.wheel === 0;
    if (nearest?.landable && !orbitCam.flight && nearest.distSurface < 30 &&
      performance.now() - lastTakeoff > 800 && inputIdle &&
      terrainMgr.baseReady(nearest.id)) { // DEM （→）
      _rel.set(
        ship.posKm[0] - nearest.posKm[0], ship.posKm[1] - nearest.posKm[1], ship.posKm[2] - nearest.posKm[2]
      );
      const relLen = _rel.length();
      _q.copy(builder.bodies.get(nearest.id).mesh.quaternion).invert();
      _rel.applyQuaternion(_q).normalize();
      const altGround = relLen - terrainMgr.heightAt(nearest.id, _rel);
      //  5m：，
      autoLand = altGround < (IS_MOBILE ? 0.005 : 0.0022);
    }
    // DEM  G ： baseReady，，
    //  G ，。
    if (input.tapped('KeyG') && nearest?.landable && nearest.distSurface < landRange &&
        !terrainMgr.baseReady(nearest.id)) {
      hud.tip(t('tip.terrainLoading'));
    }
    if ((autoLand || (input.tapped('KeyG') && nearest?.landable && nearest.distSurface < landRange &&
        terrainMgr.baseReady(nearest.id)))
      && !orbitCam.flight) {
      // ：（0.004–0.03 rad， 0.23°–1.7°）
      const impactMS = Math.max(0, approachMS);
      const landStrength = Math.min(1, impactMS / 50);              // 50 m/s 
      cameraFeel.impulse(Math.min(0.03, 0.004 + impactMS * 0.0005), 24);
      audioEngine?.playLandingImpact?.(landStrength);
      ship.enterWalk(env); // （yaw+pitch ）
      appMode = 'walk';
      // ：，
      if (!IS_MOBILE) try { canvas.requestPointerLock(); } catch { /* Non-gesture context */ }
    }
    if (input.tapped('KeyF') && !orbitCam.flight) switchToFly();
  } else {
    // /PageUp → （，R7 #1；
    //  0.5 ； = ，，R10）
    if (appMode === 'walk' && !ship.walk.diving &&
      (input.wheel >= 0.5 || input.down('PageUp'))) {
      lastTakeoff = performance.now();
      document.exitPointerLock?.();
      orbitCam.adoptPosition(orbitEnv, ship.walk.bodyId, ship.posKm, ship.quat);
      //  tilt ， adoptPosition  -autoTilt  auto-tilt
      // ，、 dolly。
      orbitCam.tilt = 0;
      orbitCam.panOffset.set(0, 0, 0); // ：
      orbitCam.distTarget = orbitCam.dist + Math.max(orbitCam.dist * 0.002, 0.05);
      appMode = 'orbit';
      ship.mode = 'fly';
      ship.vel.set(0, 0, 0);
      input.cancelGestures(); // ，/
    } else {
      // D-6：。 dtReal，""
      //  90 。****（ 16×：
      // ，）。
      //  tapped， n 。
      {
        const warp = Math.min(16, Math.max(1, Math.round(simClock._rate ?? 1)));
        for (let i = 0; i < warp; i++) {
          if (i > 0) input.justPressed?.clear?.();
          ship.update(dtReal, input, env);
        }
      }
      if (appMode === 'walk' && ship.mode === 'fly') {
        switchToOrbit(); //  G  → 
      } else {
        appMode = ship.mode === 'walk' ? 'walk' : 'fly';
      }
      if (appMode === 'fly' && input.tapped('KeyF')) switchToOrbit();
    }
  }
  if (input.tapped('KeyT') && selectedId) flyTo(selectedId);
  } catch (e) { loopErr('modeUpdate', e); }

  // （=）
  try { world.update(ship.posKm); } catch (e) { loopErr('world', e); }
  try {
    builder.postWorldUpdate(ship.posKm, performance.now() / 1000);
  } catch (e) {
    if (!loop._postWorldErr) {
      loop._postWorldErr = true;
      console.error('[postWorldUpdate]', e);
    }
  }
  // ──  /  ──────────────────────────────────────────────────────
  // ""：=，=（）。
  //  +Z （）。
  {
    if (appMode === 'fly' && input.tapped('KeyV')) thirdPerson = !thirdPerson;
    const showCockpit = appMode === 'fly' && !thirdPerson;
    cockpit.visible = showCockpit;
    shipModel.visible = appMode === 'fly' && thirdPerson;
    // ""： CSS ， 3D 。
    // 3D /（），
    // ——。
    // 、FOV、，。
    document.body.classList.toggle('walk-mode', appMode === 'walk');
    helmet.visible = false;
    // ：""（EVA / + ）
    evaSuit.visible = appMode === 'walk';
    if (evaSuit.visible) {
      const a = ship.audioState ?? {};
      evaSuit.userData.update?.(dtReal, a.speed ?? 0, !!a.walking, !!a.submerged);
    }
    if (shipModel.visible) {
      shipModel.position.set(0, 0, 0);
      shipModel.quaternion.copy(ship.quat);
      const fl = shipModel.userData.flame;
      if (fl) {
        // " / "：
        const thr = Math.min(1, ship.vel.length() / Math.max(ship.speedSetting, 1e-9) * 0.9);
        fl.material.opacity = 0.25 + 0.6 * thr;
        fl.scale.set(0.8 + 0.5 * thr, 0.6 + 1.4 * thr, 0.8 + 0.5 * thr);
      }
    }
    // ：、； 16m、。
    // **** FOV/，
    overlayCam.fov = camera.fov;
    overlayCam.aspect = camera.aspect;
    overlayCam.updateProjectionMatrix();
    cockpit.userData.layout?.(overlayCam.fov, overlayCam.aspect);
    helmet.userData.layout?.(overlayCam.fov, overlayCam.aspect);
    evaSuit.userData.layout?.(overlayCam.fov, overlayCam.aspect);
    if (thirdPerson && shipModel.visible) {
      overlayCam.position.set(0, 2.6, 16).applyQuaternion(ship.quat);
      overlayCam.quaternion.copy(ship.quat);
      overlayCam.lookAt(0, 0, 0);
    } else {
      overlayCam.position.set(0, 0, 0);
      overlayCam.quaternion.copy(ship.quat);
    }
  }

  camera.quaternion.copy(ship.quat);
  // ：//。
  //  FOV，——。
  try {
    const feel = cameraFeel.update(dtReal, {
      mode: appMode,
      walking: ship.audioState?.walking,
      walkSpeedMS: (ship.audioState?.speed ?? 0) * 1000,   // km/s → m/s
      submerged: ship.audioState?.submerged,
      speedKmS: ship.vel.length(),
      boosting: input.keys?.has?.('ShiftLeft') || input.keys?.has?.('ShiftRight'),
    });
    camera.quaternion.multiply(feel.quaternion);   // ，
    // ： q = ½ρv² 。""——
    // ，****，。
    {
      const q = ship.aero?.q ?? 0;
      if (q > 150) {
        const amp = Math.min(0.022, q * 2.2e-5);
        const t = performance.now() * 0.001;
        _shakeE.set(Math.sin(t * 37.0) * amp, Math.sin(t * 29.0 + 1.7) * amp, Math.sin(t * 43.0 + 3.1) * amp * 0.6);
        _shakeQ.setFromEuler(_shakeE);
        camera.quaternion.multiply(_shakeQ);
      }
    }
    //  / ：Sutton–Graves  q̇ ∝ √ρ·v³。
    //  2e10（60km/7.8km/s  1）， ~85km 。
    {
      const heat = ship.aero?.heat ?? 0;
      const plasma = Math.min(1, Math.max(0, heat / 2e10));
      if (Math.abs(plasma - _plasmaShown) > 0.004) {
        _plasmaShown = plasma;
        reentryGlow.style.opacity = plasma.toFixed(3);
      }
    }
    camera.fov = THREE.MathUtils.clamp(cameraFovBase + feel.fovBiasDeg, 10, 100);
    camera.updateProjectionMatrix();
  } catch (e) { loopErr('cameraFeel', e); }

  // （try-catch ：DEM ）
  try {
    if (nearest && nearest.landable) {
      const e = builder.bodies.get(nearest.id);
      _rel.set(
        ship.posKm[0] - e.posKm[0], ship.posKm[1] - e.posKm[1], ship.posKm[2] - e.posKm[2]
      );
      _q.copy(e.mesh.quaternion).invert();
      _rel.applyQuaternion(_q).normalize();
      // ：_q 
      _sunLocal.copy(e.mat.userData.uniforms.uSunDir.value).applyQuaternion(_q);
      terrainMgr.update(nearest, _rel, performance.now() / 1000, _sunLocal);
    } else {
      terrainMgr.update(null, null);
    }
  } catch (e) {
    if (!loop._terrainErr) {
      loop._terrainErr = true;
      console.error('[terrain]', e);
    }
  }

  try { updateAtmosphereFogAndExposure(nearest, dtReal); } catch (e) { loopErr('atmoFog', e); }
  try { handleUIKeys(); } catch (e) { loopErr('uiKeys', e); }

  // HUD
  try {
  hud.updateTime(simClock);
  const flight = orbitCam.flight;
  hud.updateNav({ audioOn: audioEngine?.enabled,
    mode: appMode,
    flight: flight ? { toName: bodyName(registry.get(flight.toId)), t: flight.t } : null,
    speed: ship.vel.length(),
    speedSetting: ship.speedSetting,
    focusName: appMode === 'orbit' ? bodyName(registry.get(orbitCam.focusId)) : null,
    nearest: nearest ? { name: bodyName(registry.get(nearest.id)), distSurface: nearest.distSurface } : null,
    gravity: appMode === 'walk' ? surfaceGravity(builder.bodies.get(ship.walk.bodyId).phys) : null,
    //  Δv （）
    dv: (appMode === 'fly' && ship.gravityMode) ? ship.dvBudget : null,
  });
  updateTip(nearest);
  if (selectedId) {
    const t = registry.get(selectedId);
    const dist = Math.hypot(
      t.posKm[0] - ship.posKm[0], t.posKm[1] - ship.posKm[1], t.posKm[2] - ship.posKm[2]
    );
    const dSun = Math.hypot(t.posKm[0], t.posKm[1], t.posKm[2]);
    hud.updateTarget(targetInfo(selectedId, registry, dist, dSun, jdTT));
  } else {
    hud.updateTarget(null);
  }
  // ：（ → ）。
  //  0.002 rad ≈ 0.11°：，-。
  const occluders = [];
  for (const [bid, be] of builder.bodies) {
    const gp = be.group.position; // 
    const d = gp.length();
    const r = be.phys.radiusKm;
    if (d > r && r / d > 0.002) occluders.push({ id: bid, pos: gp, r: r * 0.999 });
  }
  labels.update(selectedId, occluders);
  // ： try-catch ，，
  // （：，"60 FPS "）。
  // ， DOM。
  try {
    const errN = window.__errLog?.length ?? 0;
    if (errN !== loop._errShown) {
      loop._errShown = errN;
      hud.setErrorCount(errN, errN ? window.__errLog[errN - 1].tag : null);
    }
  } catch { /* Badge error does not interrupt main loop */ }
  document.getElementById('crosshair').style.display =
    appMode === 'orbit' ? 'none' : '';

  // ：，。
  // （#8）：5e-7 km  + 1e15 km far ，
  // ""（）。（），
  // （ < ，）。
  {
    let dNear = nearest ? nearest.distSurface : Infinity;
    for (const [, e] of tnoScene.entries) {
      const d = Math.hypot(
        e.posKm[0] - ship.posKm[0], e.posKm[1] - ship.posKm[1], e.posKm[2] - ship.posKm[2]
      ) - e.phys.radiusKm;
      if (d < dNear) dNear = d;
    }
    // /：""（ 1e8 km）
    //  5e7 km， 2.5e6 km ——，。
    //  Sprite，（ ~2.8e6 km），。
    for (const [, t] of registry) {
      if (t.kind !== 'comet' && t.kind !== 'probe') continue;
      //  Sprite， ~2.8e6 km（），
      const half = t.kind === 'comet'
        ? Math.max(t.phys?.radiusKm ?? 1, t.relObj?.children?.[0]?.scale?.x ?? 0)
        : (t.phys?.radiusKm ?? 1);
      const d = Math.hypot(
        t.posKm[0] - ship.posKm[0], t.posKm[1] - ship.posKm[1], t.posKm[2] - ship.posKm[2]
      ) - half;
      if (d < dNear) dNear = d;
    }
    const want = appMode === 'walk'
      ? 5e-7
      : THREE.MathUtils.clamp(Math.max(dNear, 0) * 0.3, 5e-7, 1e10);
    if (Math.abs(want - camera.near) > camera.near * 0.02) {
      camera.near = want;
      camera.updateProjectionMatrix();
    }
  }

  // ： held-zoom、
  touchControls?.update(appMode, nearestCache, orbitCam);
  } catch (e) { loopErr('hud', e); }

  // ── （#3-#55 ）──────────────────────────────
  //  try-catch：
  try {
    // （#4, #32）：//
    if (audioEngine) {
      //  → （）。
      //  HRTF/ 3D ，。
      {
        const rollIn = (input.down('KeyQ') ? 1 : 0) - (input.down('KeyE') ? 1 : 0);
        _audioPan += (rollIn * 0.55 - _audioPan) * Math.min(dtReal * 3, 1);
        audioEngine.setPan?.(_audioPan);
      }
      const nearestBody = nearest ? builder.bodies.get(nearest.id) : null;
      const atm = nearestBody?.phys?.atmosphere;
      const inAtmo = !!(atm && nearest.distSurface < atm.heightKm);
      audioEngine.setMode(appMode, {
        nearest: nearest ? { id: nearest.id, radiusKm: nearest.radiusKm, distSurface: nearest.distSurface } : null,
        inAtmosphere: inAtmo,
        underwater: !!ship.walk?.submerged,
        surface: ship.audioState?.surfaceType || 'rock',
      });
      audioEngine.update(dtReal, ship.audioState);
    }
  } catch (e) { console.error('[audioEngine]', e); }

  try {
    // 3D （#37）：
    if (compass && compass.visible) {
      const nearestBody = nearest ? builder.bodies.get(nearest.id) : null;
      let sunDir = null, zenithDir = null, northDir = null, nearestBodyDir = null;
      if (nearestBody) {
        //  = （）
        _rel.set(
          ship.posKm[0] - nearestBody.posKm[0],
          ship.posKm[1] - nearestBody.posKm[1],
          ship.posKm[2] - nearestBody.posKm[2]
        );
        const relLen = _rel.length() || 1;
        zenithDir = { x: _rel.x / relLen, y: _rel.y / relLen, z: _rel.z / relLen };
        //  = ****（）。
        // ： 45° "" 45°，
        // 。；，。
        const bodyQuat = nearestBody.mesh.quaternion;
        const nq = _q.copy(bodyQuat);
        const axis = {
          x: 2 * (nq.x * nq.y - nq.w * nq.z),
          y: 1 - 2 * (nq.x * nq.x + nq.z * nq.z),
          z: 2 * (nq.y * nq.z + nq.w * nq.x),
        };
        const dotAz = axis.x * zenithDir.x + axis.y * zenithDir.y + axis.z * zenithDir.z;
        let nx = axis.x - dotAz * zenithDir.x;
        let ny = axis.y - dotAz * zenithDir.y;
        let nz = axis.z - dotAz * zenithDir.z;
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-4) { nx = axis.x; ny = axis.y; nz = axis.z; }
        else { nx /= nl; ny /= nl; nz /= nl; }
        northDir = { x: nx, y: ny, z: nz };
        // （，）
        const sunPos = builder.bodies.get('sun').posKm;
        sunDir = {
          x: sunPos[0] - ship.posKm[0],
          y: sunPos[1] - ship.posKm[1],
          z: sunPos[2] - ship.posKm[2],
        };
        const sunLen = Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1;
        sunDir.x /= sunLen; sunDir.y /= sunLen; sunDir.z /= sunLen;
        // （ fly/orbit ）
        if (appMode !== 'walk') {
          nearestBodyDir = { x: -zenithDir.x, y: -zenithDir.y, z: -zenithDir.z };
        }
      }
      compass.update({
        cameraQuat: camera.quaternion,
        sunDir,
        zenithDir,
        northDir,
        nearestBodyDir,
        nearestBodyName: nearest ? bodyName(registry.get(nearest.id)) : null,
      });
    }
  } catch (e) { console.error('[compass]', e); }

  try {
    // Scale reference（#38）：
    scaleRef?.update({ mode: appMode, cinematic });
  } catch (e) { console.error('[scaleRef]', e); }
  try {
    for (const [id, landmarks] of [['moon', apolloLandmarks], ['mars', roverSites]]) {
      const entry = builder.bodies.get(id);
      if (!landmarks || !entry) continue;
      const local = _rel.set(ship.posKm[0] - entry.posKm[0], ship.posKm[1] - entry.posKm[1], ship.posKm[2] - entry.posKm[2]);
      local.applyQuaternion(_q.copy(entry.mesh.quaternion).invert());
      landmarks.update(local);
    }
  } catch (e) { loopErr('landmarks', e); }

  try {
    earthSatellites?.update?.(jdTT);
  } catch (e) { loopErr('earthSatellites', e); }

  try {
    // （#25）：
    eclipseSystem?.update(jdTT, builder.bodies, ship.posKm);
  } catch (e) { console.error('[eclipseSystem]', e); }

  try {
    // WebXR/VR（#33）：
    webxr?.update(dtReal);
  } catch (e) { console.error('[webxr]', e); }

  try { fpsGuard(frameDelta); } catch (e) { loopErr('fpsGuard', e); }
  // Shift+：FOV （10°–100°，）
  try {
    if (input.fovWheel !== 0) {
      cameraFovBase = THREE.MathUtils.clamp(cameraFovBase * Math.pow(1.12, input.fovWheel), 10, 100);
      camera.fov = cameraFovBase;
      camera.updateProjectionMatrix();
      const mm = 43.27 / (2 * Math.tan(camera.fov * Math.PI / 360));
      showActionTip(t('tip.fov', { deg: camera.fov.toFixed(0), mm: mm.toFixed(0) }), 1200);
    }
  } catch (e) { loopErr('fov', e); }
  try { input.endFrame(); } catch (e) { loopErr('input', e); }
  try {
    if (renderer.xr.isPresenting) renderer.render(scene, camera);
    else composer.render();
    // ── （?meter=1，）────────────────────────────────────
    //  150ms  HDR ，""。
    // ：，；
    // ，。
    if (DEBUG_FLAGS.meter) {
      if (!meter) meter = createMetering(renderer);
      if (meter && performance.now() - lastMeterAt > 150) {
        lastMeterAt = performance.now();
        const src = composer.readBuffer?.texture ?? null;
        const lg = meter.sample(src);
        if (lg !== null) meteredLog2 = lg;
      }
    }
    // /：，（）
    if ((appMode === 'fly' && (cockpit.visible || shipModel.visible))
        || (appMode === 'walk' && evaSuit.visible)) {
      if (!overlayScene.environment) overlayScene.environment = scene.environment;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(overlayScene, overlayCam);
      renderer.autoClear = true;
    }
  } catch (e) {
    // ：，
    if (!loop._renderErr) {
      loop._renderErr = true;
      console.error('[composer.render]', e);
    }
  }
}

// ：，（），。
// ： composer.render()  → 。
//  window.__errLog（/""），。
function loopErr(tag, e) {
  const k = '_e_' + tag;
  (window.__errLog = window.__errLog || []).push({ tag, msg: String(e?.message || e), t: Date.now() });
  if (!loop[k]) {
    loop[k] = true;
    console.error('[' + tag + ']', e);
    try { hud.tip(tag + ' error: ' + (e?.message || e)); } catch { /* hud may not be ready */ }
  }
}

function findNearest() {
  let best = null;
  for (const [id, e] of builder.bodies) {
    const d = Math.hypot(
      e.posKm[0] - ship.posKm[0], e.posKm[1] - ship.posKm[1], e.posKm[2] - ship.posKm[2]
    );
    const ds = d - e.phys.radiusKm;
    if (!best || ds < best.distSurface) {
      best = {
        id, posKm: e.posKm, radiusKm: e.phys.radiusKm,
        landable: !!e.phys.landable, distSurface: ds,
        //  phys：/ nearest.phys.atmosphere。
        //  id， builder.bodies.get(id).phys。
        phys: e.phys,
      };
    }
  }
  return best;
}

function makeEnv(nearest) {
  return {
    nearest,
    getBodyQuat: (id) => builder.bodies.get(id).mesh.quaternion,
    getBodyPos: (id) => builder.bodies.get(id).posKm,
    heightFn: (id, dir) => terrainMgr.heightAt(id, dir),
    heightSolidFn: (id, dir) => terrainMgr.heightSolidAt(id, dir),
    isWater: (id, dir) => terrainMgr.isWater(id, dir),
    phys: (id) => builder.bodies.get(id).phys,
    baseReady: (id) => terrainMgr.baseReady(id),
  };
}

function handleTimeKeys() {
  if (input.tapped('BracketRight')) hud.warpUp();
  if (input.tapped('BracketLeft')) hud.warpDown();
  if (input.tapped('KeyP')) simClock.paused = !simClock.paused;
  if (input.tapped('KeyN')) { simClock.setNow(); hud.warpReset(); simClock.paused = false; }
}

const PLANET_KEYS = {
  Digit1: 'mercury', Digit2: 'venus', Digit3: 'earth', Digit4: 'mars', Digit5: 'jupiter',
  Digit6: 'saturn', Digit7: 'uranus', Digit8: 'neptune', Digit9: 'pluto', Digit0: 'sun',
};

// ****：，。
//  6–8 （ earth-space），""。
//  O 。TNO （）。
let orbitLinesOn = true;   // ：
let tnoOrbitsOn = false;
let directoryTabKeyBound = false;

function handleUIKeys() {
  if (!directoryTabKeyBound) {
    directoryTabKeyBound = true;
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab' || e.repeat) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      document.querySelector('#directory')?.classList.toggle('open');
    });
  }
  for (const [key, id] of Object.entries(PLANET_KEYS)) {
    if (input.tapped(key)) flyTo(id); // GE ：
  }
  if (input.tapped('KeyO')) orbitLinesOn = !orbitLinesOn;
  if (input.tapped('KeyK')) { // K：（#4）
    tnoOrbitsOn = !tnoOrbitsOn;
    hud.tip(tnoOrbitsOn ? t('tip.tnoOrbitsOn') : t('tip.tnoOrbitsOff'));
  }
  // V：（——/，R9-1e）
  if (input.tapped('KeyV') && appMode === 'orbit' && !orbitCam.flight) {
    orbitCam.setInertial(!orbitCam.inertial, orbitEnv);
  }
  // /（）。
  //  body.cinematic  CSS ， WebGL 、CSS ——
  // ""/。3D 。
  const showOrbits = orbitLinesOn && appMode !== 'walk' && !cinematic;
  // ：，/
  // （""）。
  // 6R→300R ： 38  km ，。
  for (const [id, line] of Object.entries(builder.orbitLines.userData)) {
    const e = builder.bodies.get(id);
    let f = 1;
    if (e) {
      const R = e.phys.radiusKm;
      const d = Math.hypot(
        e.posKm[0] - ship.posKm[0], e.posKm[1] - ship.posKm[1], e.posKm[2] - ship.posKm[2]
      ) - R;
      f = THREE.MathUtils.smoothstep(d, R * 6, R * 300);
    }
    line.visible = showOrbits && f > 0.01;
    if (line.visible) line.material.opacity = (line.userData.baseOpacity ?? 0.3) * f;
  }
  // （TNO）：（K），（#4）
  const showTnoOrbits = tnoOrbitsOn && appMode !== 'walk' && !cinematic;
  for (const [, e] of tnoScene.entries) {
    if (!e.orbitLine) continue;
    const R = e.phys.radiusKm ?? 500;
    const d = Math.hypot(
      e.posKm[0] - ship.posKm[0], e.posKm[1] - ship.posKm[1], e.posKm[2] - ship.posKm[2]
    ) - R;
    const f = THREE.MathUtils.smoothstep(d, R * 6, R * 300);
    e.orbitLine.visible = showTnoOrbits && f > 0.01;
    if (e.orbitLine.visible) e.orbitLine.material.opacity = (e.orbitLine.userData.baseOpacity ?? 0.18) * f;
  }
  // J：（）。，。
  if (input.tapped('KeyJ') && appMode === 'fly') {
    ship.gravityMode = !ship.gravityMode;
    hud.tip(t(ship.gravityMode ? 'tip.gravityOn' : 'tip.gravityOff'));
  }
  if (input.tapped('KeyL')) labels.setVisible(!labels.visible);
  if (input.tapped('KeyH')) hud.toggleHelp();
  // Z：/——（HUD/////），
  // 。（L 、O 、C ），
  // 、、、VR ""。
  if (input.tapped('KeyZ')) setCinematic(!cinematic);
}

let cinematic = false;
let cinematicTimer = 0;
function setCinematic(on) {
  cinematic = on;
  clearTimeout(cinematicTimer);
  if (on) {
    // ——
    hud.tip(t('tip.cinematicOn'));
    cinematicTimer = setTimeout(() => document.body.classList.add('cinematic'), 1200);
  } else {
    document.body.classList.remove('cinematic');
    hud.tip(t('tip.cinematicOff'));
  }
}

// （）：
//   ?noatmo=1  （" vs "）
//   ?nofog=1   
const DEBUG_FLAGS = (() => {
  const q = new URLSearchParams(window.location.search);
  const f = { noatmo: q.get('noatmo') === '1', nofog: q.get('nofog') === '1', meter: q.get('meter') === '1' };
  globalThis.__noAtmo = f.noatmo;   // builder 
  return f;
})();

// （/）：?clean=1
if (typeof document !== 'undefined' && document.body
    && new URLSearchParams(window.location.search).get('clean') === '1') {
  cinematic = true;
  document.body.classList.add('cinematic');
}

function updateTip(nearest) {
  // （/） 2.5s ，
  if (performance.now() < actionTipUntil) return;
  const atm = nearest ? builder.bodies.get(nearest.id)?.phys.atmosphere : null;
  if (performance.now() < focusTipUntil && appMode === 'orbit') {
    const tipId = orbitCam.pendingFocusId ?? selectedId ?? orbitCam.focusId;
    const tipName = bodyName(registry.get(tipId)) || t('word.target');
    if (orbitCam.pendingFocusId && orbitCam.pendingFocusId !== orbitCam.focusId) {
      hud.tip(t('tip.pendingFocus', { name: tipName }));
    } else {
      hud.tip(t('tip.lockedFocus', { name: tipName }));
    }
  } else if (orbitCam.flight) {
    hud.tip(t('tip.flyingTo', { name: bodyName(registry.get(orbitCam.flight.toId)) }));
  } else if (appMode === 'walk') {
    hud.tip(IS_MOBILE ? t('tip.walkTouch') : (input.locked ? t('tip.walkLocked') : t('tip.walkUnlocked')));
  } else if (nearest && nearest.landable &&
    nearest.distSurface < Math.max(20, nearest.radiusKm * 0.05)) {
    hud.tip(t('tip.landNear', { name: bodyName(registry.get(nearest.id)) }));
  } else if (appMode === 'orbit' && nearest && nearest.landable &&
    nearest.distSurface < nearest.radiusKm * 0.6) {
    hud.tip(t('tip.landAny'));
  } else if (nearest && !nearest.landable && nearest.id !== 'sun' && atm &&
    nearest.distSurface < atm.heightKm) {
    hud.tip(t('tip.enterAtmo', { name: bodyName(registry.get(nearest.id)) }));
  } else if (nearest && !nearest.landable && nearest.id !== 'sun' && nearest.distSurface < nearest.radiusKm * 0.5) {
    hud.tip(t('tip.gasGiant'));
  } else if (nearest && nearest.id === 'sun' && nearest.distSurface < nearest.radiusKm * 2) {
    hud.tip(t('tip.sun'));
  } else if (appMode === 'orbit' && orbitCam.inertial) {
    hud.tip(t('tip.inertial', { name: bodyName(registry.get(orbitCam.focusId)) }));
  } else {
    hud.tip(null);
  }
}

const immersionEl = document.getElementById('immersion');
let lastBoosted = null; // （ 1）

function updateAtmosphereFogAndExposure(nearest, dt) {
  const dSunAU = Math.hypot(ship.posKm[0], ship.posKm[1], ship.posKm[2]) / KM_PER_AU;
  // ；≈1；
  //  = （）。 uSunI = 1/d²  1，
  // ""——，""：
  // ，，；
  // ，。
  //
  //  pow(dAU, 0.85)  [0.25, 12]：13 AU ， uSunI 
  //  (1/d²)^0.55  → （）。
  //
  //  0.75 ****： 1（）
  // ACES （ 0.8 ），（""
  //  ~0.86）。 1.0  10.6% 、。
  // ──  ─────────────────────────────────────────────────
  // （0.75·d²）****，****：（0.106）
  // 、（0.136），。
  // ——。
  // ****（ 0.75）：
  // ，""。
  // （40R 、100R ），
  // 。
  let exposureAdapt = 1;
  {
    const fid = orbitCam.focusId ?? nearest?.id;
    const a = fid ? SURFACE_ALBEDO[fid] : null;
    const e = fid ? builder.bodies.get(fid) : null;
    if (a > 0 && e && fid !== 'sun') {
      const rr = Math.hypot(
        ship.posKm[0] - e.posKm[0], ship.posKm[1] - e.posKm[1], ship.posKm[2] - e.posKm[2]
      ) / Math.max(e.phys.radiusKm, 1e-6);
      const w = 1 - THREE.MathUtils.smoothstep(rr, 40, 100);
      if (w > 0) {
        exposureAdapt = 1 + (Math.pow(0.62 / Math.max(a, 0.03), 1.0) - 1) * w;
      }
    }
  }
  exposureTarget = THREE.MathUtils.clamp(
    0.75 * Math.max(dSunAU, 0.004) ** 2 * exposureAdapt, 0.02, 6000);
  // ："" 0.22 。
  // ——；
  // （ / ）。
  if (DEBUG_FLAGS.meter && meteredLog2 !== null) {
    const L = Math.pow(2, meteredLog2);
    if (L > 1e-9) exposureTarget = THREE.MathUtils.clamp(0.30 / L, 0.02, 6000);
  }

  let fogDensity = 0;
  let skyFade = 1; // （，）
  let immersion = 0; // （，R7 #5）
  let immTint = null;
  let waterFx = null; // （R9-2b）
  let _groundTintW = 0;        // （/，0=）
  let _groundTintCol = null;   //  [r,g,b]
  const fogColor = new THREE.Color(0x000000);
  if (nearest) {
    const e = builder.bodies.get(nearest.id);
    const atm = e.phys.atmosphere;
    for (const id of new Set([nearest.id, orbitCam.focusId])) {
      const body = builder.bodies.get(id); if (!body) continue;
      const radial = new THREE.Vector3(ship.posKm[0] - body.posKm[0], ship.posKm[1] - body.posKm[1], ship.posKm[2] - body.posKm[2]);
      const distanceKm = radial.length();
      radial.normalize();
      const towardSun = new THREE.Vector3(...body.posKm).normalize().negate();
      const view = camera.getWorldDirection(new THREE.Vector3());
      skyFade = Math.min(skyFade, photoSkyVisibility({ radiusKm: body.phys.radiusKm, distanceKm,
        sunElevation: id === 'sun' ? 1 : radial.dot(towardSun), phaseCosine: id === 'sun' ? 1 : radial.dot(towardSun),
        viewCosine: -view.dot(radial), dSunAU,
        airless: !body.phys.atmosphere }));
    }
    const inAtmo = atm && nearest.distSurface < atm.heightKm;
    // ：/； interiorBoost """"
    if (e.atmoMesh) {
      const gasGiant = e.phys.type === 'gas' || e.phys.type === 'ice';
      const depth = inAtmo ? 1 - Math.max(nearest.distSurface, 0) / atm.heightKm : 0;
      let boostVal = 1, boostMVal = 1;
      // depth  NaN（ distSurface ）—— interiorBoost
      //  uBoost，（ NaN，
      // three ）。。
      if (!Number.isFinite(depth)) {
        //  1 / 1
      } else if (gasGiant && inAtmo) {
        boostVal = boostMVal = 1 + depth * depth * 24;
      } else if (inAtmo && atm.interiorBoost) {
        const t = THREE.MathUtils.smoothstep(depth, 0.05, 0.35);
        boostVal  = 1 + (atm.interiorBoost          - 1) * t;
        boostMVal = 1 + ((atm.interiorBoostM ?? 1)  - 1) * t;
      }
      const u = e.atmoMesh.material.userData.uniforms;
      u.uBoost.value  = boostVal;
      u.uBoostM.value = boostMVal;
      if (lastBoosted && lastBoosted !== e.atmoMesh) {
        const lu = lastBoosted.material.userData.uniforms;
        lu.uBoost.value = 1; lu.uBoostM.value = 1;
      }
      lastBoosted = e.atmoMesh;
      if (gasGiant && inAtmo) {
        // ：（）
        immersion = THREE.MathUtils.smoothstep(depth, 0.45, 0.85);
        const b = atm.rayleigh;
        const m = Math.max(b[0], b[1], b[2]);
        immTint = [b[0] / m, b[1] / m, b[2] / m];
      }
    }
    // （R9-2b）： →  +  + 
    if (e.phys.landable && e.phys.surface?.ocean) {
      _rel.set(
        ship.posKm[0] - e.posKm[0], ship.posKm[1] - e.posKm[1], ship.posKm[2] - e.posKm[2]
      );
      const relLen = _rel.length();
      _q.copy(e.mesh.quaternion).invert();
      _rel.applyQuaternion(_q).normalize();
      const surfR = e.phys.radiusKm + 0.001;
      if (relLen < surfR - 0.00003 && terrainMgr.isWater(nearest.id, _rel)) {
        const depth = surfR - relLen; // km
        const dim = Math.exp(-depth * 1.6); // 
        waterFx = { depth, dim };
      }
    }
    if (inAtmo) {
      const alt = Math.max(nearest.distSurface, 0);
      if (atm.groundTint) {
        _groundTintCol = atm.groundTint;
        _groundTintW = Math.exp(-alt / (atm.rayleighScaleKm * 3));
      }
      _rel.set(
        ship.posKm[0] - e.posKm[0], ship.posKm[1] - e.posKm[1], ship.posKm[2] - e.posKm[2]
      ).normalize();
      const sunDir = new THREE.Vector3(-e.posKm[0], -e.posKm[1], -e.posKm[2]).normalize();
      const sunElev = _rel.dot(sunDir);
      const day = THREE.MathUtils.clamp(sunElev * 4 + 0.1, 0, 1);
      // ── ：****（ C-4）──────────────
      //  depthTest ，；
      // ，。——
      // ，。
      // ，""""
      // （ Mie  + ），。
      // ****：atmosphereFog  up·view、up·sun ，
      //  Three （ (x,y,z)→(x,z,−y) ）。
      //  up/sunDir  0 → 。
      _fogUp.set(_rel.x, _rel.z, -_rel.y);
      _fogSun.set(-e.posKm[0], -e.posKm[2], e.posKm[1]).normalize();
      const fogRes = atmosphereFog(e.phys, {
        altKm: alt,
        up: _fogUp,
        viewDir: camera.getWorldDirection(_fogView),
        sunDir: _fogSun,
        sunI: 5 * (atm.multiplier ?? 1) / Math.max(dSunAU * dSunAU, 1e-6),
        boost: e.atmoMesh?.material.userData.uniforms.uBoost.value ?? 1,
        boostM: e.atmoMesh?.material.userData.uniforms.uBoostM.value ?? 1,
        dustStorm: e.atmoMesh?.material.userData.uniforms.uDustStorm.value ?? 0,
      });
      renderer.__fogDbg = {
        color: fogRes ? [...fogRes.color] : null, alpha: fogRes?.alpha, density: fogRes?.density,
        alt, up: [_fogUp.x, _fogUp.y, _fogUp.z], view: [_fogView.x, _fogView.y, _fogView.z],
        sun: [_fogSun.x, _fogSun.y, _fogSun.z], sunI: 5 * (atm.multiplier ?? 1) / Math.max(dSunAU * dSunAU, 1e-6),
        boost: e.atmoMesh?.material.userData.uniforms.uBoost.value,
        boostM: e.atmoMesh?.material.userData.uniforms.uBoostM.value,
        dust: e.atmoMesh?.material.userData.uniforms.uDustStorm.value,
        distSurface: nearest.distSurface,
      };
      // ： NaN（ distSurface 
      // NaN， depth→interiorBoost→uBoost ）
      // NaN，three 。 NaN。
      if (fogRes && fogRes.color.every(Number.isFinite) && Number.isFinite(fogRes.density)) {
        //  = L/α：FogExp2  mix(, ) = ·(1−α) + L，
        // 。fogDensityMult ""（
        //  Venera ），****。
        fogColor.setRGB(fogRes.color[0], fogRes.color[1], fogRes.color[2]);
        fogDensity = Math.min(fogRes.density * (atm.fogDensityMult ?? 1), 2.5);
      }
      // ：
      const density = Math.exp(-alt / (atm.rayleighScaleKm * 2.2));
      // ：，——
      //  21km ，。
      //  3.0：/ → skyFade=0 （）；
      // 30km  density≈0.2 → skyFade≈0.4 （）。
      skyFade = Math.min(skyFade, THREE.MathUtils.clamp(1 - day * density * 3.0, 0, 1));
      // （R9-2b）：，
      if (e.cloudMesh && !waterFx) {
        const hc = e.phys.radiusKm * 0.0035;
        const veil = Math.exp(-(((alt - hc) / 1.8) ** 2)) * 0.4 * (0.3 + 0.7 * day);
        if (veil > immersion) {
          immersion = veil;
          immTint = [0.9, 0.94, 1.0];
        }
      }
    }
  }
  if (waterFx) {
    // （R9-2b）： +  +  + 
    const { depth, dim } = waterFx;
    // ：（ 650nm 
    // 450nm  30 ），。，。
    fogColor.setRGB(0.004 + 0.030 * dim, 0.030 + 0.115 * dim, 0.060 + 0.150 * dim);
    // ： 20–50m（）；。
    // FogExp2  1−exp(−(ρd)²)  d=1/ρ  63%， ρ  1/L。
    //  16（L≈62m）——，。
    fogDensity = 35 + depth * 60;
    skyFade = Math.min(skyFade, 0.04);
    exposureTarget = Math.max(exposureTarget * Math.max(dim, 0.045), 0.05);
    const wr = Math.round((0.04 + 0.16 * dim) * 255);
    const wg = Math.round((0.12 + 0.34 * dim) * 255);
    const wb = Math.round((0.2 + 0.42 * dim) * 255);
    immersionEl.style.background =
      `radial-gradient(ellipse at center, rgba(${wr},${wg},${wb},0.45) 0%, rgba(${Math.round(wr * 0.4)},${Math.round(wg * 0.4)},${Math.round(wb * 0.4)},0.9) 85%)`;
    immersionEl.style.opacity = THREE.MathUtils.clamp(0.3 + depth * 0.5, 0, 0.9).toFixed(3);
  } else {
    // /：（，）
    if (immersion > 0 && immTint) {
      skyFade = Math.min(skyFade, 1 - immersion); // 
      const cr = Math.round((immTint[0] * 0.45 + 0.55) * 255);
      const cg = Math.round((immTint[1] * 0.45 + 0.55) * 255);
      const cb = Math.round((immTint[2] * 0.45 + 0.55) * 255);
      immersionEl.style.background =
        `radial-gradient(ellipse at center, rgba(${cr},${cg},${cb},0.75) 0%, rgb(${cr},${cg},${cb}) 78%)`;
    }
    immersionEl.style.opacity = immersion.toFixed(3);
  }

  scene.fog.color.copy(fogColor);
  scene.fog.density = DEBUG_FLAGS.nofog ? 0 : fogDensity;
  renderer.__fogRef = scene.fog;   // （tools/probe-titanfog.mjs）
  sky.setFade(skyFade / Math.max(1, renderer.toneMappingExposure));
  // （），
  try {
    const sp = builder.bodies.get('sun')?.posKm;
    if (sp) sky.setSunDir?.(-sp[0], -sp[1], -sp[2]);   // ：，
  } catch { /* Sun not ready */ }
  // /：（skyFade），
  // ——/、、、
  // TNO （≥17 ）、
  // （：）。
  // //（）。
  const surfVis = skyFade > 0.4 && appMode !== 'walk';
  belts.visible = surfVis;
  oortCloud.group.visible = surfVis;
  smallBodies.group.visible = surfVis;
  comets.setSkyFade(skyFade);
  tnoScene.setSkyFade(surfVis ? 1 : 0);
  builder.setSkyFade(skyFade);
  for (const v of voyagerEntries) v.group.visible = surfVis;
  oortCloud.update(dSunAU);            // （#5）
  // ****。 skyFade<0.5 ，
  //  skyFade ""——，
  // （）。
  document.getElementById('labels').classList.toggle('daysky', skyFade < 0.5 && appMode === 'walk');
  // ：（TNO////），
  document.getElementById('labels').classList.toggle('walksky', appMode === 'walk');

  // （/，）
  ambient.intensity += ((appMode === 'walk' ? 0.14 : 0.02) - ambient.intensity) * Math.min(dt * 3, 1);
  // ：""（， builder ）
  {
    const gt = _groundTintW > 0 ? _groundTintCol : null;
    if (gt) {
      ambient.color.setRGB(
        0x40 / 255 + (gt[0] * 0.6 - 0x40 / 255) * _groundTintW,
        0x48 / 255 + (gt[1] * 0.6 - 0x48 / 255) * _groundTintW,
        0x58 / 255 + (gt[2] * 0.6 - 0x58 / 255) * _groundTintW);
    } else {
      ambient.color.setHex(0x404858);
    }
  }

  // （#21）：（ ~0.4s），（ ~1.4s）
  const adaptSpeed = exposureTarget < renderer.toneMappingExposure ? 2.5 : 0.7;
  renderer.toneMappingExposure +=
    (exposureTarget - renderer.toneMappingExposure) * Math.min(dt * adaptSpeed, 1);
  // （ sun.js  uInvExposure ）
  {
    const su = builder.bodies.get('sun')?.uniforms;
    if (su?.uInvExposure) su.uInvExposure.value = 1 / Math.max(renderer.toneMappingExposure, 1e-4);
    // （ sun.js ）
    const cu = builder.bodies.get('sun')?.coronaUniforms;
    if (cu?.uInvExposure) cu.uInvExposure.value = 1 / Math.max(renderer.toneMappingExposure, 1e-4);
    // （）。
    // ：，
    // （）， uniform 。
    const invExp = 1 / Math.max(renderer.toneMappingExposure, 1e-4);
    for (const bd of builder.bodies.values()) {
      const au = bd.atmoMesh?.material.userData.uniforms;
      if (au?.uInvExposure) au.uInvExposure.value = invExp;
    }
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  syncRenderResolution();
}

// ----  URL（issue #1）----
// ：#<focusId>,<lat_deg>,<lon_deg>,<dist_km>,<jdTT>
// ；fly/walk 。

function applyLocationHash() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  const parts = hash.split(',');
  if (parts.length < 4) return;
  const [focusId, latDeg, lonDeg, distKm, jdStr] = parts;
  if (!registry.has(focusId)) return;
  const DEG = Math.PI / 180;
  const lat = parseFloat(latDeg), lon = parseFloat(lonDeg), dist = parseFloat(distKm);
  if (!isFinite(lat) || !isFinite(lon) || !isFinite(dist) || dist <= 0) return;
  orbitCam.focusId = focusId;
  orbitCam.lat = lat * DEG;
  orbitCam.lon = lon * DEG;
  orbitCam.dist = dist;
  orbitCam.distTarget = dist;
  orbitCam.tilt = 0;
  orbitCam.heading = 0;
  orbitCam.panOffset.set(0, 0, 0);
  if (jdStr) {
    const jd = parseFloat(jdStr);
    if (isFinite(jd) && jd > 2000000) simClock.jdTT = jd;
  }
  syncShipToOrbit();
  select(focusId);
}

// ── VR （WebXRManager ）─────────────────────────────────
let _audioPan = 0;   // 
const _shakeE = new THREE.Euler();
const _shakeQ = new THREE.Quaternion();
let _plasmaShown = -1;
// （DOM ：， HDR ）
const reentryGlow = (() => {
  const d = document.createElement('div');
  d.id = 'reentry-glow';
  d.setAttribute('aria-hidden', 'true');
  document.body.appendChild(d);
  return d;
})();
const _xrOrigin = new THREE.Vector3();
const _xrDir = new THREE.Vector3();
const _xrV = new THREE.Vector3();

function handleXREvent(ev) {
  if (ev.type === 'sessionend') { syncRenderResolution(); return; }
  if (ev.type === 'grab' && appMode === 'orbit') {
    orbitCam.panOffset.sub(_xrV.set(ev.delta.x, ev.delta.y, ev.delta.z));
    return;
  }
  if (ev.type === 'teleport' || ev.type === 'zoom') {
    //  /  → （：/=）
    if (appMode !== 'orbit') return;
    const factor = ev.type === 'teleport' ? (1 - ev.forward * 0.4) : (1 + ev.delta * 4);
    const next = orbitCam.distTarget * Math.min(1.5, Math.max(0.67, factor));
    const minD = registry.get(orbitCam.focusId)?.minDistKm ?? 0.01;
    orbitCam.distTarget = Math.max(next, minD);
  } else if (ev.type === 'raycast') {
    // ：（ pickBody  VR ）
    _xrOrigin.set(ev.origin.x, ev.origin.y, ev.origin.z);
    _xrDir.set(ev.direction.x, ev.direction.y, ev.direction.z).normalize();
    const hit = pickBodyByRay(_xrOrigin, _xrDir);
    if (hit) {
      select(hit);
      showActionTip(`${bodyName(registry.get(hit))}`, 1800);
    }
  }
  // grab（）：， VR 
}

/** VR ： = min( + 0.3° )， */
function pickBodyByRay(origin, dir) {
  let best = null, bestScore = 1;
  for (const [id, e] of registry) {
    if (!e.relObj || !e.phys?.radiusKm) continue;
    e.relObj.getWorldPosition(_xrV);
    _xrV.sub(origin);
    const dist = _xrV.length();
    if (dist < 1e-6) continue;
    _xrV.divideScalar(dist);
    const ang = Math.acos(Math.min(1, Math.max(-1, _xrV.dot(dir))));
    const hitAng = Math.atan(e.phys.radiusKm / dist) + 0.005;
    const score = ang / hitAng;
    if (score < bestScore) { bestScore = score; best = id; }
  }
  return best;
}

/** （Ctrl+B）；orbit ，fly/walk  */function saveBookmark() {
  if (!bookmarks) return;
  const focusId = appMode === 'orbit' ? orbitCam.focusId : (selectedId ?? orbitCam.focusId);
  const entry = registry.get(focusId);
  const name = bodyName(entry ?? { nameZh: focusId, nameEn: focusId });
  bookmarks.save(name, {
    focusId,
    lat: orbitCam.lat, lon: orbitCam.lon, dist: orbitCam.dist,
    jdTT: simClock.jdTT, mode: appMode,
  });
  showActionTip(t('tip.bookmarkSaved', { name }));
}

/** （Ctrl+Shift+B）：orbit ； */
function restoreLatestBookmark() {
  const items = bookmarks?.list?.() ?? [];
  // list()  created ****（）， items[0]。
  //  items[length-1] = ——""。
  const latest = items[0];
  if (!latest) { showActionTip(t('tip.bookmarkNone')); return; }
  const s = latest.state ?? {};
  if (s.jdTT) simClock.set(s.jdTT);
  if (s.focusId && registry.has(s.focusId)) {
    if (appMode !== 'orbit') switchToOrbit();
    if (s.lat != null) orbitCam.lat = s.lat;
    if (s.lon != null) orbitCam.lon = s.lon;
    if (s.dist != null) { orbitCam.dist = s.dist; orbitCam.distTarget = s.dist; }
    select(s.focusId);
  }
}

function copyShareUrl() {
  if (appMode !== 'orbit') return; // （fly/walk ）
  const DEG = Math.PI / 180;
  const lat = (orbitCam.lat / DEG).toFixed(5);
  const lon = (orbitCam.lon / DEG).toFixed(5);
  const dist = orbitCam.dist.toFixed(3);
  const jd = simClock.jdTT.toFixed(3);
  const hash = `#${orbitCam.focusId},${lat},${lon},${dist},${jd}`;
  const url = location.href.replace(/#.*$/, '') + hash;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => showActionTip(t('tip.urlCopied')))
      .catch(() => { history.replaceState(null, '', hash); showActionTip(t('tip.urlUpdated')); });
  } else {
    history.replaceState(null, '', hash);
    showActionTip(t('tip.urlUpdated'));
  }
}

} // Graphics-dependent application setup.

// ── Service Worker：（ public/sw.js）───────────────
//  https  localhost、；file:// （
// " U  index.html"） serviceWorker，。
// ——，。
//
// ：sw.js  GET ""， /src/*.js
// ，、——
// ，。 worker ，
// ，。
const DEV = import.meta.env?.DEV === true;
if (DEV && typeof navigator !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.getRegistrations?.()
    .then((rs) => rs.forEach((r) => r.unregister()))
    .catch(() => {});
}
if (!DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && (location.protocol === 'https:' || location.hostname === 'localhost'
        || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.info('[sw] Registration failed (does not affect usage)', e?.message ?? e);
    });
  });
}
