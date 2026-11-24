// Scale reference objects: toggleable human silhouette and Earth-Moon scale comparison.
//
// Two independent features:
// 1. Human silhouette (toggleHuman): 1.7 m figure placed in front of camera.
//    Visible near surface for intuitive scale comparison.
//    Naturally culled at high orbital altitudes.
// 2. Comparison mode (toggleCompare): Earth and Moon displayed side-by-side with true scale and distance.
//    Includes educational annotations (diameters, distance, light travel time).
//    3D spheres constructed with physical radii.
//
// Floating origin: camera always at origin, attach directly to scene.
// Near plane adaptation: distance = max(near*5, 500) km.

import * as THREE from 'three';
import { t, LANG } from './i18n.js';

// ── Physical Astronomical Data (NASA/IAU, consistent with bodies.js) ──
const EARTH_RADIUS_KM = 6371.0;
const MOON_RADIUS_KM = 1737.4;
const EARTH_MOON_DIST_KM = 384400; // Average distance
const LIGHT_TIME_S = EARTH_MOON_DIST_KM / 299792.458; // ≈1.28 s

// ── Local i18n Fallback ──
const I18N = {
  'scaleref.title':     { zh: 'Earth – Moon Scale', en: 'Earth – Moon Scale', es: 'Escala Tierra – Luna', ja: 'Earth – Moon Scale', fr: 'Échelle Terre – Lune', de: 'Erde – Mond Maßstab', ru: 'Earth – Moon Scale' },
  'scaleref.earthD':    { zh: 'Earth Ø', en: 'Earth Ø', es: 'Ø Tierra', ja: 'Earth Ø', fr: 'Ø Terre', de: 'Erde Ø', ru: 'Earth Ø' },
  'scaleref.moonD':     { zh: 'Moon Ø', en: 'Moon Ø', es: 'Ø Luna', ja: 'Moon Ø', fr: 'Ø Lune', de: 'Mond Ø', ru: 'Moon Ø' },
  'scaleref.distance':  { zh: 'Avg. distance', en: 'Avg. distance', es: 'Dist. media', ja: 'Avg. distance', fr: 'Dist. moyenne', de: 'Ø Entfernung', ru: 'Avg. distance' },
  'scaleref.lightTime': { zh: 'Light travel', en: 'Light travel', es: 'Tiempo de luz', ja: 'Light travel', fr: 'Temps de lumière', de: 'Lichtzeit', ru: 'Light travel' },
  'scaleref.scale':     { zh: 'Scale', en: 'Scale', es: 'Escala', ja: 'Scale', fr: 'Échelle', de: 'Maßstab', ru: 'Scale' },
  'scaleref.human':     { zh: 'Human reference 1.7 m', en: 'Human reference 1.7 m', es: 'Referencia humana 1.7 m', ja: 'Human reference 1.7 m', fr: 'Référence humaine 1,7 m', de: 'Mensch-Referenz 1,7 m', ru: 'Human reference 1.7 m' },
};

function tt(key, vars) {
  const g = t(key, vars);
  if (g !== key) return g;
  const e = I18N[key];
  if (!e) return key;
  let s = typeof e === 'string' ? e : (e.en ?? e[LANG] ?? key);
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

// Reuse scratch vectors to avoid allocation per frame
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _pos = new THREE.Vector3();

export class ScaleReference {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._human = null;       // THREE.Group
    this._humanGeos = [];
    this._humanMat = null;
    this._compareGroup = null; // THREE.Group
    this._compareGeos = [];
    this._compareMats = [];
    this._compareOverlay = null;
    this._curCompareScale = 0;
  }

  // ── Human Silhouette ──────

  /** Toggle human silhouette display. Returns new state (true=visible) */
  toggleHuman() {
    if (this._human) {
      this._disposeHuman();
      return false;
    }
    this._createHuman();
    return true;
  }

  _createHuman() {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a3a4a });

    // Body (capsule): radius 0.2m, cylinder 1.1m -> height 1.5m
    const bodyGeo = new THREE.CapsuleGeometry(0.0002, 0.0011, 4, 8);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.00075; // Capsule center, base at y=0
    group.add(body);

    // Head (sphere): radius 0.12m
    const headGeo = new THREE.SphereGeometry(0.00012, 12, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 0.00162; // Body top + head radius
    group.add(head);

    // Total height ~ 1.74m
    this._human = group;
    this._humanGeos = [bodyGeo, headGeo];
    this._humanMat = mat;
    this.scene.add(group);
  }

  _updateHuman(camPos, camQuat) {
    _forward.set(0, 0, -1).applyQuaternion(camQuat);
    _right.set(1, 0, 0).applyQuaternion(camQuat);
    _up.set(0, 1, 0).applyQuaternion(camQuat);

    // Positioned 5m in front of camera, 2m right, 1.5m below
    _pos.copy(camPos)
      .addScaledVector(_forward, 0.005)
      .addScaledVector(_right, 0.002)
      .addScaledVector(_up, -0.0015);
    this._human.position.copy(_pos);
  }

  _disposeHuman() {
    if (!this._human) return;
    this.scene.remove(this._human);
    for (const g of this._humanGeos) g.dispose();
    this._humanMat?.dispose();
    this._human = null;
    this._humanGeos = [];
    this._humanMat = null;
  }

  // ── Earth-Moon Comparison Mode ──────

  /** Toggle Earth-Moon comparison mode. Returns new state (true=visible) */
  toggleCompare() {
    if (this._compareGroup) {
      this._disposeCompare();
      return false;
    }
    this._createCompare();
    return true;
  }

  _createCompare() {
    const group = new THREE.Group();

    // Earth: built with physical radius
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS_KM, 32, 16);
    const earthMat = new THREE.MeshBasicMaterial({ color: 0x2266bb });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earth.position.x = -EARTH_MOON_DIST_KM / 2;
    group.add(earth);

    // Moon: physical radius (27.3% of Earth)
    const moonGeo = new THREE.SphereGeometry(MOON_RADIUS_KM, 24, 12);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.x = EARTH_MOON_DIST_KM / 2;
    group.add(moon);

    // Distance reference line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-EARTH_MOON_DIST_KM / 2, 0, 0),
      new THREE.Vector3(EARTH_MOON_DIST_KM / 2, 0, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x6688aa, transparent: true, opacity: 0.35 });
    const line = new THREE.Line(lineGeo, lineMat);
    group.add(line);

    this._compareGroup = group;
    this._compareGeos = [earthGeo, moonGeo, lineGeo];
    this._compareMats = [earthMat, moonMat, lineMat];
    this.scene.add(group);

    // HTML annotation overlay panel
    this._createCompareOverlay();
  }

  _createCompareOverlay() {
    const el = document.createElement('div');
    el.className = 'scaleref-overlay';
    el.style.cssText = [
      'position:fixed', 'top:14px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:15', 'pointer-events:none',
      'background:rgba(8,16,28,0.62)', 'border:1px solid rgba(110,160,210,0.25)',
      'border-radius:8px', 'padding:10px 16px',
      'font-size:13px', 'line-height:1.7', 'color:#cfe3f5',
      'backdrop-filter:blur(6px)', 'white-space:nowrap',
      'font-family:inherit',
    ].join(';');

    const fmt = (n) => n.toLocaleString();
    el.innerHTML = [
      `<div style="font-size:14px;font-weight:bold;color:#e8f4ff;margin-bottom:4px;">${tt('scaleref.title')}</div>`,
      `<div>${tt('scaleref.earthD')}: <b>${fmt(Math.round(EARTH_RADIUS_KM * 2))}</b> km</div>`,
      `<div>${tt('scaleref.moonD')}: <b>${fmt(Math.round(MOON_RADIUS_KM * 2))}</b> km <span style="opacity:0.6">(${(MOON_RADIUS_KM / EARTH_RADIUS_KM * 100).toFixed(1)}%)</span></div>`,
      `<div>${tt('scaleref.distance')}: <b>${fmt(EARTH_MOON_DIST_KM)}</b> km <span style="opacity:0.6">(${(EARTH_MOON_DIST_KM / EARTH_RADIUS_KM).toFixed(1)} R⊕)</span></div>`,
      `<div>${tt('scaleref.lightTime')}: <b>${LIGHT_TIME_S.toFixed(2)}</b> s</div>`,
      `<div class="sr-scale-row">${tt('scaleref.scale')}: <b class="sr-scale-val">1 : …</b></div>`,
    ].join('');

    document.body.appendChild(el);
    this._compareOverlay = el;
  }

  _updateCompare(camPos, camQuat) {
    // Dynamically compute placement distance and scale from camera FOV
    const fovRad = this.camera.fov * Math.PI / 180;
    const hFovRad = 2 * Math.atan(Math.tan(fovRad / 2) * this.camera.aspect);
    const limitingFov = Math.min(fovRad, hFovRad);

    // Placement distance: at least near * 5, minimum 500 km
    const minDist = Math.max(this.camera.near * 5 + 10, 500);
    // Earth-Moon baseline spans ~60% of viewport width
    const viewWidth = 2 * minDist * Math.tan(limitingFov / 2);
    const scale = (viewWidth * 0.6) / EARTH_MOON_DIST_KM;

    _forward.set(0, 0, -1).applyQuaternion(camQuat);
    this._compareGroup.position.copy(camPos).addScaledVector(_forward, minDist);
    this._compareGroup.scale.setScalar(scale);

    // Update scale ratio annotation (write DOM only when delta > 1%)
    if (Math.abs(this._curCompareScale - scale) / Math.max(scale, 1e-9) > 0.01) {
      this._curCompareScale = scale;
      const ratio = Math.round(1 / scale);
      const val = this._compareOverlay?.querySelector('.sr-scale-val');
      if (val) val.textContent = `1 : ${ratio.toLocaleString()}`;
    }
  }

  _disposeCompare() {
    if (!this._compareGroup) return;
    this.scene.remove(this._compareGroup);
    for (const g of this._compareGeos) g.dispose();
    for (const m of this._compareMats) m.dispose();
    this._compareOverlay?.remove();
    this._compareGroup = null;
    this._compareGeos = [];
    this._compareMats = [];
    this._compareOverlay = null;
    this._curCompareScale = 0;
  }

  // ── Frame Update ──

  /**
   * Called every frame to keep reference objects aligned with camera.
   * @param {object} [state] Optional state; defaults to reading this.camera
   */
  update(state = {}) {
    if (!this._human && !this._compareGroup) return;
    // Cinematic mode: hide scale reference objects along with overlay layer
    // so recording/screenshots remain completely clean.
    const show = !state.cinematic;
    if (this._human) this._human.visible = show;
    if (this._compareGroup) this._compareGroup.visible = show;
    if (!show) return;
    const camPos = this.camera.position;
    const camQuat = this.camera.quaternion;
    if (this._human) this._updateHuman(camPos, camQuat);
    if (this._compareGroup) this._updateCompare(camPos, camQuat);
  }

  /** Dispose all resources */
  dispose() {
    this._disposeHuman();
    this._disposeCompare();
  }
}
