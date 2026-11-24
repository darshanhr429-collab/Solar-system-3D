// 3D Compass widget: lightweight SVG compass at bottom right.
// Displays local North, Zenith, Sun direction, and nearest body.
//
// Design highlights:
// - Pure SVG rendering, lightweight and fast.
// - Accepts {x,y,z} vectors and {x,y,z,w} quaternions.
//   Zero dependency on Three.js import.
// - Projection: transforms world direction into camera space via inverse quaternion,
//   then applies Lambert azimuthal equal-area projection onto disk.
// - i18n: query global t(), fallback to local dictionary.

import { t, LANG } from './i18n.js';

// ── Local i18n Fallback Dictionary ──
const I18N = {
  'compass.title':   { zh: 'Compass (C)', en: 'Compass (C)', es: 'Brújula (C)', ja: 'コンパス（C）', fr: 'Boussole (C)', de: 'Kompass (C)', ru: 'Компас (C)' },
  'compass.sun':     { zh: 'Sun', en: 'Sun', es: 'Sol', ja: 'Sun', fr: 'Soleil', de: 'Sonne', ru: 'Sun' },
  'compass.zenith':  { zh: 'Zenith', en: 'Zenith', es: 'Cenit', ja: 'Zenith', fr: 'Zénith', de: 'Zenit', ru: 'Zenith' },
  'compass.nearest': { zh: 'Nearest', en: 'Nearest', es: 'Cercano', ja: 'Nearest', fr: 'Proche', de: 'Nah', ru: 'Nearest' },
  'compass.north':   { zh: 'N', en: 'N', es: 'N', ja: 'N', fr: 'N', de: 'N', ru: 'N' },
  'compass.south':   { zh: 'S', en: 'S', es: 'S', ja: 'S', fr: 'S', de: 'S', ru: 'S' },
  'compass.east':    { zh: 'E', en: 'E', es: 'E', ja: 'E', fr: 'E', de: 'O', ru: 'E' },
  'compass.west':    { zh: 'W', en: 'W', es: 'O', ja: 'W', fr: 'O', de: 'W', ru: 'W' },
};

/** Query global i18n with fallback to local dictionary */
function tt(key, vars) {
  const g = t(key, vars);
  if (g !== key) return g;
  const e = I18N[key];
  if (!e) return key;
  let s = typeof e === 'string' ? e : (e.en ?? e[LANG] ?? key);
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 48; // Compass disk radius (SVG units)

// ── Quaternion / Vector Mathematics (No Three.js dependency) ──

/**
 * Rotate vector v by inverse unit quaternion q (world -> camera space).
 * For unit quaternion, q^-1 = conjugate = {x:-qx, y:-qy, z:-qz, w:qw}.
 * Formula: applyQuat(v, conjugate(q)).
 */
function applyInvQuat(v, q) {
  // Conjugate
  const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
  const vx = v.x, vy = v.y, vz = v.z;
  // t = 2 × cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  // v' = v + qw * t + cross(q.xyz, t)
  return {
    x: vx + qw * tx + (qy * tz - qz * ty),
    y: vy + qw * ty + (qz * tx - qx * tz),
    z: vz + qw * tz + (qx * ty - qy * tx),
  };
}

/** 3D cross product */
function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Normalize vector */
function normalize3(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-12) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Project world direction to compass disk coordinates.
 * Camera convention (Three.js): -Z = forward, +X = right, +Y = up.
 * SVG convention: +X = right, +Y = down.
 *
 * @returns {{x:number, y:number, opacity:number, behind:boolean}}
 */
function projectToDisc(dir, cameraQuat) {
  const cam = applyInvQuat(dir, cameraQuat);
  const sx = cam.x;
  const sy = -cam.y; // SVG Y flip
  const sz = cam.z;  // >0 = behind camera

  if (sz <= 0.001) {
    // Front hemisphere: Lambert azimuthal projection
    return { x: sx * R, y: sy * R, opacity: 1, behind: false };
  }
  // Back hemisphere: clamp to edge with dimmed opacity indicating turn direction
  const len = Math.hypot(sx, sy);
  if (len < 1e-6) {
    return { x: 0, y: R * 0.82, opacity: 0.22, behind: true };
  }
  return {
    x: (sx / len) * R * 0.82,
    y: (sy / len) * R * 0.82,
    opacity: 0.22,
    behind: true,
  };
}

export class Compass {
  /**
   * @param {HTMLElement} container Mount container (usually document.body)
   */
  constructor(container) {
    this.visible = true;
    this._build(container);
  }

  _build(container) {
    this.root = document.createElement('div');
    this.root.className = 'compass-widget';
    this.root.style.cssText = [
      'position:fixed', 'bottom:14px', 'right:14px', 'z-index:15',
      'pointer-events:none', 'opacity:0.88',
      'transition:opacity 0.3s',
      'font-family:inherit',
    ].join(';');

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '120');
    svg.setAttribute('height', '120');
    svg.setAttribute('viewBox', '-60 -60 120 120');
    svg.setAttribute('aria-label', tt('compass.title'));

    // ── Background Disk ──
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', '0'); bg.setAttribute('cy', '0'); bg.setAttribute('r', String(R + 4));
    bg.setAttribute('fill', 'rgba(8,16,28,0.55)');
    bg.setAttribute('stroke', 'rgba(110,160,210,0.28)');
    bg.setAttribute('stroke-width', '1');
    svg.appendChild(bg);

    // ── Inner Ring (Horizon reference) ──
    const inner = document.createElementNS(SVG_NS, 'circle');
    inner.setAttribute('cx', '0'); inner.setAttribute('cy', '0'); inner.setAttribute('r', String(R * 0.5));
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', 'rgba(110,160,210,0.12)');
    inner.setAttribute('stroke-width', '0.5');
    svg.appendChild(inner);

    // ── Crosshair Marks ──
    for (const [x1, y1, x2, y2] of [[0, -R, 0, R], [-R, 0, R, 0]]) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1)); line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2)); line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', 'rgba(110,160,210,0.1)');
      line.setAttribute('stroke-width', '0.5');
      svg.appendChild(line);
    }

    // ── Marker Container ──
    // Order: cardinal markers on base layer, then sun/body/zenith
    this._markers = {};

    // Cardinal: N / S / E / W
    for (const key of ['north', 'south', 'east', 'west']) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', '10');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', key === 'north' ? 'rgba(255,233,176,0.9)' : 'rgba(160,190,220,0.6)');
      text.setAttribute('opacity', '0');
      text.textContent = tt('compass.' + key);
      svg.appendChild(text);
      this._markers[key] = { el: text, opacity: 0 };
    }

    // Sun marker
    this._markers.sun = this._mkMarker(svg, '#ffcc55', '☉', 9);

    // Nearest body marker
    this._markers.body = this._mkMarker(svg, '#7fd4ff', '●', 7);

    // Zenith marker
    this._markers.zenith = this._mkMarker(svg, '#a8e8a8', '↑', 9);

    // ── Center Point (Camera Forward) ──
    const center = document.createElementNS(SVG_NS, 'circle');
    center.setAttribute('cx', '0'); center.setAttribute('cy', '0'); center.setAttribute('r', '1.5');
    center.setAttribute('fill', 'rgba(160,200,240,0.5)');
    svg.appendChild(center);

    // ── Mode Label ──
    this._modeLabel = document.createElementNS(SVG_NS, 'text');
    this._modeLabel.setAttribute('x', '0');
    this._modeLabel.setAttribute('y', String(R + 16));
    this._modeLabel.setAttribute('text-anchor', 'middle');
    this._modeLabel.setAttribute('font-size', '8');
    this._modeLabel.setAttribute('fill', 'rgba(160,190,220,0.5)');
    svg.appendChild(this._modeLabel);

    this.root.appendChild(svg);
    container.appendChild(this.root);
  }

  /** Create marker group (dot + symbol + label text) */
  _mkMarker(svg, color, symbol, fontSize) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('opacity', '0');

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', color);
    g.appendChild(dot);

    const sym = document.createElementNS(SVG_NS, 'text');
    sym.setAttribute('text-anchor', 'middle');
    sym.setAttribute('dominant-baseline', 'central');
    sym.setAttribute('font-size', String(fontSize));
    sym.setAttribute('fill', color);
    sym.setAttribute('y', '-8');
    sym.textContent = symbol;
    g.appendChild(sym);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('font-size', '6');
    label.setAttribute('fill', color);
    label.setAttribute('y', '10');
    g.appendChild(label);

    svg.appendChild(g);
    return { el: g, dot, sym, label, opacity: 0 };
  }

  /** Update individual marker position and visibility */
  _updateMarker(key, dir, quat, labelText) {
    const m = this._markers[key];
    if (!m || !dir) {
      m.el.setAttribute('opacity', '0');
      m.opacity = 0;
      return;
    }
    const p = projectToDisc(dir, quat);
    m.el.setAttribute('transform', `translate(${p.x.toFixed(2)},${p.y.toFixed(2)})`);
    m.el.setAttribute('opacity', String(p.opacity));
    if (labelText !== undefined) m.label.textContent = labelText;
    m.opacity = p.opacity;
  }

  /**
   * Update compass markers per frame.
   * @param {object} state
   *   mode: 'orbit'|'fly'|'walk'
   *   cameraQuat: {x,y,z,w} - camera world quaternion
   *   sunDir: {x,y,z}|null - unit vector to Sun (world space)
   *   nearestBodyDir: {x,y,z}|null - unit vector to nearest body
   *   nearestBodyName: string|null
   *   northDir: {x,y,z}|null - local North unit vector
   *   zenithDir: {x,y,z}|null - local Zenith unit vector
   */
  update(state) {
    if (!this.visible || !state) return;
    const q = state.cameraQuat;
    if (!q) return;

    // ── Sun ──
    this._updateMarker('sun', state.sunDir, q, state.sunDir ? tt('compass.sun') : '');

    // ── Nearest Body ──
    this._updateMarker('body', state.nearestBodyDir, q,
      state.nearestBodyDir ? (state.nearestBodyName || tt('compass.nearest')) : '');

    // ── Zenith ──
    this._updateMarker('zenith', state.zenithDir, q, state.zenithDir ? tt('compass.zenith') : '');

    // ── Cardinal Directions N / S / E / W ──
    const north = state.northDir ? normalize3(state.northDir) : null;
    const zenith = state.zenithDir ? normalize3(state.zenithDir) : null;

    if (north) {
      this._updateMarker('north', north, q);
      this._updateMarker('south', { x: -north.x, y: -north.y, z: -north.z }, q);

      // East = cross(North, Zenith)
      if (zenith) {
        const east = normalize3(cross3(north, zenith));
        if (east) {
          this._updateMarker('east', east, q);
          this._updateMarker('west', { x: -east.x, y: -east.y, z: -east.z }, q);
        } else {
          // North parallel to Zenith (poles): East/West undefined
          this._hideMarker('east');
          this._hideMarker('west');
        }
      } else {
        this._hideMarker('east');
        this._hideMarker('west');
      }
    } else {
      this._hideMarker('north');
      this._hideMarker('south');
      this._hideMarker('east');
      this._hideMarker('west');
    }

    // ── Mode Label ──
    if (state.mode) {
      this._modeLabel.textContent = state.mode.toUpperCase();
    }
  }

  _hideMarker(key) {
    const m = this._markers[key];
    if (m) {
      m.el.setAttribute('opacity', '0');
      m.opacity = 0;
    }
  }

  setVisible(on) {
    this.visible = on;
    this.root.style.display = on ? '' : 'none';
  }

  toggle() {
    this.setVisible(!this.visible);
    return this.visible;
  }

  dispose() {
    this.root.remove();
  }
}
