// Global constants and coordinate conventions.
// World units = km. World axes = Ecliptic J2000 mapped via M:(x,y,z)->(x,z,-y) (ecliptic north is +Y).

import * as THREE from 'three';


/** Static asset base path: relative root for subpages (runtime fetch unaffected by build rewrites) */
export const ASSET_BASE = (typeof document !== 'undefined' && document.documentElement?.dataset?.base) || './';
/** Concatenate static asset URL (textures, data, dem, etc.) */
export const asset = (p) => ASSET_BASE + p;

export const KM_PER_AU = 149597870.7;
export const C_KM_S = 299792.458;

// UI language priority: URL path or param > browser language > default 'en'.
// Supports 7 languages: zh/en/es/ja/fr/de/ru (#3, #44, #45, #46).
// ?lang=es or /es/ forces Spanish, etc.
const SUPPORTED_LANGS = ['zh', 'en', 'es', 'ja', 'fr', 'de', 'ru'];

function detectLang() {
  if (typeof window !== 'undefined' && window.location) {
    const params = new URLSearchParams(window.location.search);
    const paramLang = params.get('lang');
    if (SUPPORTED_LANGS.includes(paramLang)) return paramLang;
    const segments = window.location.pathname.split('/').filter(Boolean);
    const pathLang = segments.at(-1) === 'index.html' ? segments.at(-2) : segments.at(-1);
    if (SUPPORTED_LANGS.includes(pathLang)) return pathLang;
  }
  if (typeof navigator !== 'undefined') {
    // Match primary language code (en-US -> en, ja-JP -> ja, etc.) with supported languages
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    const primary = nav.split('-')[0];
    if (SUPPORTED_LANGS.includes(primary)) return primary;
    return 'en'; // Unsupported languages fall back to English
  }
  return 'zh';
}
export const LANG = detectLang();
const _u = (zh, en) => (LANG === 'zh' ? zh : en);

/** Ecliptic coordinates {x,y,z} -> Three.js world Vector3 */
export function eclToWorld(p, out = new THREE.Vector3()) {
  return out.set(p.x, p.z, -p.y);
}

/** Ecliptic coordinates -> world axis triple (for double precision arrays) */
export function eclToWorldArr(p) {
  return [p.x, p.z, -p.y];
}

/** Equatorial J2000 (RA, Dec in radians) -> world direction */
export function raDecToWorld(ra, dec, out = new THREE.Vector3()) {
  const OBL = (23.43928 * Math.PI) / 180;
  const xq = Math.cos(dec) * Math.cos(ra);
  const yq = Math.cos(dec) * Math.sin(ra);
  const zq = Math.sin(dec);
  // Equatorial -> Ecliptic: Rx(-eps)
  const xe = xq;
  const ye = yq * Math.cos(OBL) + zq * Math.sin(OBL);
  const ze = -yq * Math.sin(OBL) + zq * Math.cos(OBL);
  return out.set(xe, ze, -ye);
}

/** 3x3 row-major matrix (ecliptic frame) -> Three.js world quaternion (including M conjugate transform) */
const M_ECL2WORLD = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
const M_INV = M_ECL2WORLD.clone().transpose();
const tmpM = new THREE.Matrix4();
export function eclMatrixToWorldQuat(m9, out = new THREE.Quaternion()) {
  tmpM.set(m9[0], m9[1], m9[2], 0, m9[3], m9[4], m9[5], 0, m9[6], m9[7], m9[8], 0, 0, 0, 0, 1);
  tmpM.premultiply(M_ECL2WORLD).multiply(M_INV);
  return out.setFromRotationMatrix(tmpM);
}

/** Speed formatting */
export function formatSpeed(kmS) {
  if (kmS >= KM_PER_AU) return (kmS / KM_PER_AU).toFixed(2) + ' AU/s';
  if (kmS >= 0.01 * C_KM_S) return (kmS / C_KM_S).toFixed(2) + ' c';
  if (kmS >= 1) return kmS >= 1000 ? (kmS / 1000).toFixed(1) + ' Mm/s' : kmS.toFixed(1) + ' km/s';
  return (kmS * 1000).toFixed(1) + ' m/s';
}

export const LY_KM = 9460730472580.8; // 1 light-year (km)

/** Distance formatting */
export function formatDist(km) {
  if (km >= LY_KM * 0.01) return (km / LY_KM).toFixed(4) + ' ly';
  if (km >= 0.05 * KM_PER_AU) return (km / KM_PER_AU).toFixed(3) + ' AU';
  if (km >= 1e6) return (km / 1e6).toFixed(2) + ' Mkm';
  if (km >= 1) return Math.round(km).toLocaleString() + ' km';
  return Math.round(km * 1000) + ' m';
}

/**
 * Check if user requests reduced motion (prefers-reduced-motion).
 * While CSS disables UI transitions, camera flight animations, drag inertia, and
 * gait bobbing are JS-driven and must be checked here.
 * Caches result and listens for changes to avoid per-frame matchMedia queries.
 */
let _reducedMotion = null;
export function prefersReducedMotion() {
  if (_reducedMotion !== null) return _reducedMotion;
  if (typeof window === 'undefined' || !window.matchMedia) return (_reducedMotion = false);
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  _reducedMotion = mq.matches;
  const on = () => { _reducedMotion = mq.matches; };
  if (mq.addEventListener) mq.addEventListener('change', on);
  else mq.addListener?.(on);
  return _reducedMotion;
}
