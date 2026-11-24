// Google Earth style exploration camera extended across the entire heliosphere:
// - Camera anchored in focus body coordinate system (lat/lon/dist), naturally co-rotating and revolving with celestial bodies
// - Left-click drag rotation (with inertial damping), exponential wheel zoom, north pole oriented up, focus anchored at screen center
// - flyTo: GE signature flight animation - logarithmic altitude profile + sinusoidal arc rise + early target locking,
//   arriving above the sunlit hemisphere with target centered

import * as THREE from 'three';
import { prefersReducedMotion } from '../config.js';
import { IS_MOBILE } from './quality.js';

const DEG = Math.PI / 180;
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _vm = new THREE.Vector3(); // Dedicated for minDist / groundRadius / cursor anchor (avoids collision with _v1-3)
const _va = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qf = new THREE.Quaternion(); // Dedicated for setInertial / handoff snapshot (avoids collision with _q)
const _qg = new THREE.Quaternion(); // Dedicated for groundRadiusOf (R10: must not reuse _qf;
                                    // setInertial via adoptPosition -> minDist -> groundRadiusOf
                                    // would overwrite target view direction, causing camera jump)
const IDENTITY_Q = new THREE.Quaternion();

const EYE_KM = 0.0017;          // Walking eye height 1.7 m (consistent with ship.js)
const AUTO_TILT_MAX = 80 * DEG; // Near-surface auto-tilt cap (nadir -> near-horizon landing transition)
// Maximum distance limit: 100,000 AU (outer Oort cloud boundary), 1 ly ~= 63,241 AU
const MAX_DIST = 1.5e13;

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Keyboard navigation keys: pressing any of these cancels pending focus transitions
const NAV_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export class OrbitCamera {
  constructor(camera = null) {
    this.camera = camera;
    this.focusId = 'earth';
    this.lat = 12 * DEG;
    this.lon = 0;
    this.dist = 1;        // km from body center
    this.distTarget = 1;
    this.vLat = 0;        // Inertial angular velocity rad/s
    this.vLon = 0;
    this.heading = 0;     // Heading (Shift+A/D rotate, offset from north)
    this.tilt = 0;        // Tilt (Shift+W/S, 0 = nadir/center, positive = toward horizon)
    this.panOffset = new THREE.Vector3(); // Spatial pan (body-fixed km, right-click drag: translation without rotation)
    this.flight = null;
    this.posKm = new Float64Array(3);
    this.quat = new THREE.Quaternion();
    this._autoTilt = 0;   // Near-surface auto-tilt (computed per frame from altitude, added to user tilt)
    this._dolly = 1;      // Remaining zoom factor for line-of-sight dolly zoom
    this._dollyDepth = null; // Dolly reference depth (tracked independently so offset absorption does not cause overshoot)
                             // Depth must be tracked independently to prevent convergence overshoot
    this._dollyTargetId = null; // Locked target body for current dolly gesture (prevents mid-gesture retargeting)
    this._radialGesture = false; // Whether current zoom gesture is locked to radial zoom
    this.inertial = false; // Inertial observation mode: camera ignores body rotation to observe planetary revolutions
    this._streak = 0;      // Wheel continuous scrolling acceleration (fine flick -> continuous acceleration)
    this._streakIdle = 0;
    this._zoomHold = 0;    // Continuous hold acceleration for PageUp/Down
    this._navHold = 0;     // Continuous hold acceleration for keyboard pan/rotation
    this.pendingFocusId = null; // Pending focus ID delayed until user scrolls (R10-fix-3)
    this.pendingTargetLocal = null; // Target local offset (optional, for precise surface click aiming)
    this.transition = null; // Focus transition state
  }

  /** Anchor reference frame: body-fixed (default, rotates with body) or inertial (observes revolution) */
  frameQuat(f) { return this.inertial ? IDENTITY_Q : f.quat; }

  /** Toggle inertial observation mode: seamlessly re-anchors at current pose (position/orientation continuous) */
  setInertial(on, env) {
    if (this.inertial === on) return;
    const pos = Float64Array.from(this.posKm);
    _qf.copy(this.quat);
    this.inertial = on;
    this.adoptPosition(env, this.focusId, pos, _qf);
  }

  /** env.get(id) -> { posKm:Float64Array, radiusKm, ringsOuterKm?, quat:THREE.Quaternion(bodyFixed->world), viewDist? } */
  init(env, focusId, distMul = 4) {
    this.focusId = focusId;
    const f = env.get(focusId);
    this.dist = this.distTarget = f.radiusKm * distMul;
    // Initial view: sunlit hemisphere (camera on sunward side)
    this.alignSunward(env);
    this.compute(env);
  }

  alignSunward(env) {
    const f = env.get(this.focusId);
    _v1.set(-f.posKm[0], -f.posKm[1], -f.posKm[2]).normalize(); // Sun direction
    _q.copy(this.frameQuat(f)).invert();
    _v1.applyQuaternion(_q); // -> body-fixed frame
    this.lat = Math.asin(THREE.MathUtils.clamp(_v1.y, -1, 1)) * 0.6;
    this.lon = Math.atan2(-_v1.z, _v1.x);
  }

  /**
   * Restore orbital parameters from arbitrary world position (when switching from ship/walking mode).
   * When quat is non-null, solves heading/tilt to ensure continuous view orientation across transitions.
   */
  adoptPosition(env, focusId, worldPosKm, quat = null) {
    this.focusId = focusId;
    const f = env.get(focusId);
    _v1.set(
      worldPosKm[0] - f.posKm[0], worldPosKm[1] - f.posKm[1], worldPosKm[2] - f.posKm[2]
    );
    const d = _v1.length();
    _v2.copy(_v1).normalize(); // Radial unit vector (world frame) for orientation solving
    _q.copy(this.frameQuat(f)).invert();
    _v1.applyQuaternion(_q).normalize();
    this.lat = Math.asin(THREE.MathUtils.clamp(_v1.y, -1, 1));
    this.lon = Math.atan2(-_v1.z, _v1.x);
    this.dist = this.distTarget = Math.max(d, this.minDist(f));
    this.vLat = this.vLon = 0;
    this.heading = 0;
    this.tilt = 0;
    this.panOffset.set(0, 0, 0);
    this.flight = null;
    this._dolly = 1;
    this._dollyDepth = null;
    this._dollyTargetId = null;
    this._radialGesture = false;
    this.pendingFocusId = null;
    this.pendingTargetLocal = null;
    this.transition = null;
    if (quat) this.adoptOrientation(f, _v2, quat);
  }

  /** Snapshot current camera state, allowing temporary calculation during transitions */
  _snapshot() {
    return {
      focusId: this.focusId,
      lat: this.lat, lon: this.lon, dist: this.dist, distTarget: this.distTarget,
      heading: this.heading, tilt: this.tilt,
      panOffset: this.panOffset.clone(),
      vLat: this.vLat, vLon: this.vLon,
      inertial: this.inertial,
      _dolly: this._dolly, _dollyDepth: this._dollyDepth,
      _dollyTargetId: this._dollyTargetId, _radialGesture: this._radialGesture,
    };
  }
  _restore(s) {
    this.focusId = s.focusId;
    this.lat = s.lat; this.lon = s.lon;
    this.dist = s.dist; this.distTarget = s.distTarget;
    this.heading = s.heading; this.tilt = s.tilt;
    this.panOffset.copy(s.panOffset);
    this.vLat = s.vLat; this.vLon = s.vLon;
    this.inertial = s.inertial;
    this._dolly = s._dolly; this._dollyDepth = s._dollyDepth;
    this._dollyTargetId = s._dollyTargetId; this._radialGesture = s._radialGesture;
  }

  /** Set pending focus: click target without immediate cut, smoothly transitioning on scroll.
   * @param targetLocalDir Direction in target body-fixed frame (optional, for surface click aiming)
   * @param targetLocalDist Distance along direction (usually surface radius)
   */
  setPendingFocus(id, targetLocalDir = null, targetLocalDist = 0) {
    this.pendingFocusId = id;
    this.pendingTargetLocal = targetLocalDir
      ? { dir: targetLocalDir.clone().normalize(), dist: targetLocalDist }
      : null;
  }

  /** Whether user is actively manipulating camera view. Aborts pending focus when true. */
  _userNavigating(input) {
    const d = input.drag, p = input.pan, l = input.look;
    if (d && (d.active || Math.abs(d.dx) + Math.abs(d.dy) > 0.5)) return true;
    if (p && (p.active || Math.abs(p.dx) + Math.abs(p.dy) > 0.5)) return true;
    if (l && l.active) return true;
    for (const k of NAV_KEYS) if (input.down(k)) return true;
    return false;
  }

  /** Initiate focus transition: records current pose and determines initial target distance */
  _startTransition(env) {
    if (!this.pendingFocusId || this.pendingFocusId === this.focusId) {
      this.transition = null;
      return;
    }
    const toId = this.pendingFocusId;
    const snap = this._snapshot();
    this.adoptPosition(env, toId, this.posKm, this.quat);
    const targetDist = this.dist;
    this._restore(snap);
    this.transition = {
      toId,
      fromPos: Float64Array.from(this.posKm),
      fromQuat: this.quat.clone(),
      targetDist,
      targetLocal: this.pendingTargetLocal
        ? { dir: this.pendingTargetLocal.dir.clone(), dist: this.pendingTargetLocal.dist }
        : null,
      t: 0,
      faceT: 0, // Independent look-at progress: smooth turn toward target decoupled from position
    };
  }

  /** Update focus transition: input-driven, scrolling simultaneously advances transition and adjusts target distance.
   * Target is dynamically centered via lookAt, maintaining visual stability throughout approach.
   * Stops input to pause midway; allows clicking other targets to retarget cleanly. */
  _updateTransition(dt, input, env) {
    const tr = this.transition;
    const toF = env.get(tr.toId);

    // Real-time target world position (center + optional surface click point, updated with rotation/orbit)
    _v1.set(toF.posKm[0], toF.posKm[1], toF.posKm[2]);
    if (tr.targetLocal) {
      _v2.copy(tr.targetLocal.dir).applyQuaternion(toF.quat).multiplyScalar(tr.targetLocal.dist);
      _v1.add(_v2);
    }
    const targetWorldPos = _v1; // alias

    // ---- Zoom input (shares parameters with orbit mode) ----
    let zoomK = 0;
    if (input.down('PageUp') || input.down('Equal') || input.down('NumpadAdd')) zoomK -= 1;
    if (input.down('PageDown') || input.down('Minus') || input.down('NumpadSubtract')) zoomK += 1;

    if (input.wheel !== 0) {
      this._streak = Math.min(this._streak + Math.abs(input.wheel) * 0.18, 1);
      this._streakIdle = 0;
    } else {
      this._streakIdle += dt;
      if (this._streakIdle > 0.35) this._streak = Math.max(this._streak - dt * 2, 0);
    }
    this._zoomHold = zoomK !== 0 ? Math.min(this._zoomHold + dt, 2.5) : 0;

    const zoomActive = input.wheel !== 0 || zoomK !== 0;
    if (zoomActive) {
      let zoomMul = 1;
      if (zoomK !== 0) zoomMul *= Math.exp(zoomK * (0.55 + this._zoomHold * 0.65) * dt);
      if (input.wheel !== 0) {
        zoomMul *= Math.pow(1.12 + 0.26 * this._streak, THREE.MathUtils.clamp(input.wheel, -3, 3));
      }
      tr.targetDist *= zoomMul;
      // Safety floor uses target radius (avoids terrain queries during transition before lat/lon ready)
      const minD = toF.minDistKm ?? toF.radiusKm * 1.004 + 1;
      tr.targetDist = THREE.MathUtils.clamp(tr.targetDist, minD, MAX_DIST);
      // Transition progress driven by zoom direction: scroll down / PageDown = advance (t up), scroll up / PageUp = retreat (t down)
      const advance = Math.abs(input.wheel) * 0.12 + Math.abs(zoomK) * dt * 0.9;
      const dir = (input.wheel < 0 || zoomK < 0) ? 1 : -1;
      // Scrolling out with no remaining progress = user canceled this transition target.
      // Canceling restores manual control immediately.
      if (dir < 0 && tr.t <= 1e-6) {
        this.adoptPosition(env, this.focusId, this.posKm, this.quat);
        return;
      }
      tr.t = THREE.MathUtils.clamp(tr.t + dir * advance, 0, 1);
      // Look-at direction advances independently: smoothly turns toward target within 0.35s
      tr.faceT = Math.min(1, tr.faceT + dt / 0.35);
    }
    // Once approach begins, continue look-at convergence even if scrolling pauses
    if (tr.t > 0 && tr.faceT < 1) {
      tr.faceT = Math.min(1, tr.faceT + dt / 0.35);
    }

    const u = smoother(tr.t);
    const uLook = smoother(tr.faceT);

    // Direction from target center to initial camera position (stable path direction)
    _v2.set(tr.fromPos[0] - toF.posKm[0], tr.fromPos[1] - toF.posKm[1], tr.fromPos[2] - toF.posKm[2]);
    const startDist = _v2.length();
    if (startDist > 1e-9) _v2.normalize(); else _v2.set(0, 0, 1);

    // Target arrival position: along same direction, at current targetDist
    _v3.copy(targetWorldPos).addScaledVector(_v2, tr.targetDist);

    // Current position interpolation
    this.posKm[0] = tr.fromPos[0] + (_v3.x - tr.fromPos[0]) * u;
    this.posKm[1] = tr.fromPos[1] + (_v3.y - tr.fromPos[1]) * u;
    this.posKm[2] = tr.fromPos[2] + (_v3.z - tr.fromPos[2]) * u;

    // Up direction: smooth transition from initial up vector to target north pole
    _va.set(0, 1, 0).applyQuaternion(tr.fromQuat);
    _vm.set(0, 1, 0).applyQuaternion(this.frameQuat(toF));
    const upX = _va.x + (_vm.x - _va.x) * uLook;
    const upY = _va.y + (_vm.y - _va.y) * uLook;
    const upZ = _va.z + (_vm.z - _va.z) * uLook;
    const upLen = Math.hypot(upX, upY, upZ) || 1;

    // Look-at orientation directly targets world position
    // Slerp orientation directly toward target world point, ensuring target stays centered
    // and converges quickly, even with large initial angular offsets.
    _m.lookAt(
      new THREE.Vector3(this.posKm[0], this.posKm[1], this.posKm[2]),
      targetWorldPos,
      new THREE.Vector3(upX / upLen, upY / upLen, upZ / upLen)
    );
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(_m);
    this.quat.slerpQuaternions(tr.fromQuat, targetQuat, uLook);

    if (tr.t >= 1 && tr.faceT >= 0.99) {
      // Transition complete: commit new focus and restore consistent orbital parameters
      this.focusId = tr.toId;
      this.adoptPosition(env, tr.toId, this.posKm, this.quat);
      this.pendingFocusId = null;
      this.pendingTargetLocal = null;
      this.transition = null;
    }
  }

  /** Solve heading/tilt from camera quaternion (u = radial unit vector, world frame) */
  adoptOrientation(f, u, quat) {
    const view = _va.set(0, 0, -1).applyQuaternion(quat);
    const cosT = THREE.MathUtils.clamp(-view.dot(u), -1, 1);
    const tiltTotal = Math.acos(cosT); // 0 = nadir/center, pi/2 = horizon
    // Horizon projection of sightline p (screen top orientation around radial vector)
    const p = _v3.copy(view).addScaledVector(u, -view.dot(u));
    if (p.lengthSq() < 1e-10) {
      // Sightline ~= radial: use camera up vector projection to determine heading
      p.set(0, 1, 0).applyQuaternion(quat);
      p.addScaledVector(u, -p.dot(u));
    }
    if (p.lengthSq() < 1e-10) { this.heading = 0; this.tilt = 0; return; }
    p.normalize();
    // Horizon projections of frame north (np) and east (ep)
    const np = _vm.set(0, 1, 0).applyQuaternion(this.frameQuat(f));
    np.addScaledVector(u, -np.dot(u));
    if (np.lengthSq() < 1e-10) { this.heading = 0; this.tilt = tiltTotal - this._autoTilt; return; }
    np.normalize();
    const ep = _va.crossVectors(u, np); // Matches chirality with applyAxisAngle(u, heading)
    this.heading = Math.atan2(p.dot(ep), p.dot(np));
    // Total tilt = user tilt + auto-tilt; isolate user component for exact orientation reconstruction
    const ground = this.groundRadiusOf(f);
    this.tilt = tiltTotal - this.autoTiltOf(f, Math.max(this.dist - ground, 0));
  }

  /** Ground surface radius at current lat/lon (matches walking collision; non-landable bodies = mean radius) */
  groundRadiusOf(f) {
    if (!f.groundRadius) return f.radiusKm;
    const cl = Math.cos(this.lat);
    _vm.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon));
    // In inertial mode, transform lat/lon from inertial to body-fixed frame before querying terrain
    if (this.inertial) _vm.applyQuaternion(_qg.copy(f.quat).invert());
    return f.groundRadius(_vm);
  }

  /** Near-surface auto-tilt: smoothly tilts from nadir toward horizon below startAlt */
  autoTiltOf(f, alt) {
    const startAlt = THREE.MathUtils.clamp(f.radiusKm * 0.04, 1, 600);
    const t = 1 - THREE.MathUtils.clamp(alt / startAlt, 0, 1);
    return t <= 0 ? 0 : AUTO_TILT_MAX * Math.pow(t, 1.6);
  }

  /**
   * Minimum distance (from body center):
   * - Landable bodies: terrain surface elevation + 1.7m eye height (wheel zooms all the way to ground)
   * - Gas/Ice giants: env provides minDistKm (allows diving into atmosphere above cloud deck)
   * - Other bodies (Sun, etc.): standard formula R * 1.004 + 1
   */
  minDist(f) {
    if (f.groundRadius) return this.groundRadiusOf(f) + EYE_KM;
    if (f.minDistKm) return f.minDistKm;
    return f.radiusKm * 1.004 + 1;
  }

  /**
   * Polar flip (chart flip): when latitude exceeds +-90 deg:
   * lat -> 180 deg - lat, lon += 180 deg, heading += 180 deg, negate vLat -
   * position and orientation remain seamless, allowing continuous polar circumnavigation.
   */
  poleNormalize() {
    const HALF = Math.PI / 2;
    if (this.lat > HALF || this.lat < -HALF) {
      this.lat = (this.lat > HALF ? Math.PI : -Math.PI) - this.lat;
      this.lon += Math.PI;
      this.heading += Math.PI;
      this.vLat = -this.vLat;
    }
    if (this.lon > Math.PI) this.lon -= 2 * Math.PI;
    else if (this.lon < -Math.PI) this.lon += 2 * Math.PI;
    if (this.heading > Math.PI) this.heading -= 2 * Math.PI;
    else if (this.heading < -Math.PI) this.heading += 2 * Math.PI;
  }

  arrivalDist(env, id) {
    const t = env.get(id);
    if (t.viewDist) return t.viewDist;
    // Effective radius: body radius or outer ring radius (Saturn, Uranus), ensuring entire system fits view
    const r = Math.max(t.radiusKm, t.ringsOuterKm ?? 0);
    // Desktop maintains 3.5x radius baseline; mobile calculates safe distance based on viewport FOV/aspect
    const fallback = Math.max(t.radiusKm * 3.5, 3);
    if (!IS_MOBILE || !this.camera) return fallback;
    const vFOV = this.camera.fov * DEG;
    const aspect = this.camera.aspect;
    const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * aspect);
    const limiting = Math.min(vFOV, hFOV);
    const margin = 1.18; // 18% margin to prevent screen edge clipping or UI overlap
    const distFit = (r * margin) / Math.tan(limiting / 2);
    return Math.max(distFit, fallback);
  }

  /** GE flight animation initiation (fromIdOverride used for takeoff from previous focus, e.g. label double-click) */
  flyTo(env, toId, fromIdOverride = null) {
    this.pendingFocusId = null;
    this.pendingTargetLocal = null;
    this.transition = null;
    const to = env.get(toId);
    const from = env.get(fromIdOverride ?? this.focusId);
    const sep = Math.hypot(
      to.posKm[0] - from.posKm[0], to.posKm[1] - from.posKm[1], to.posKm[2] - from.posKm[2]
    );
    const h0 = Math.max(this.dist, this.minDist(from));
    const h1 = this.arrivalDist(env, toId);
    // Start direction: camera relative to focus; end direction: target sunlit hemisphere (slightly elevated)
    _v1.set(
      this.posKm[0] - from.posKm[0], this.posKm[1] - from.posKm[1], this.posKm[2] - from.posKm[2]
    );
    const dir0 = _v1.lengthSq() > 0 ? _v1.clone().normalize() : new THREE.Vector3(0, 0.3, 1).normalize();
    _v2.set(-to.posKm[0], -to.posKm[1], -to.posKm[2]).normalize(); // Sun direction at target
    const dir1 = _v2.clone().addScaledVector(new THREE.Vector3(0, 1, 0), 0.45).normalize();
    // Duration: logarithmic distance scaling (~2s within local system, ~7s across heliosphere)
    let dur = THREE.MathUtils.clamp(1.6 + Math.log10(Math.max(sep + h0, 10) / 1e4) * 0.55, 1.8, 7);
    // Reduced motion: shorten and simplify transit without eliminating spatial continuity.
    // Users prefer concise, smooth transitions rather than sluggish animations.
    // Shorten and simplify the transit path rather than canceling it altogether.
    // Teleporting abruptly breaks spatial orientation across astronomical distances.
    // Maintains smooth progression even under reduced motion settings.
    // Spatial navigation is key to understanding the scale of the Solar System.
    if (prefersReducedMotion()) dur = Math.min(dur, 0.8);
    // Wall-clock driven (fixed real-time duration, drops frames if framerate falls)
    this.flight = { toId, fromId: fromIdOverride ?? this.focusId, t: 0, dur, h0, h1, dir0, dir1, start: performance.now() };
  }

  cancelFlight(env) {
    if (!this.flight) return;
    // In-place takeover: recover orbital parameters relative to closer celestial body
    const to = this.flight.toId;
    this.flight = null;
    this.adoptPosition(env, to, this.posKm);
  }

  update(dt, input, env) {
    this._dtLast = dt;
    if (this.flight) {
      this.updateFlight(dt, env);
      return;
    }
    // Pending focus: clicks do not jump instantly; scrolling smoothly initiates focus transition
    if (this.pendingFocusId && this.pendingFocusId !== this.focusId) {
      if (!this.transition || this.transition.toId !== this.pendingFocusId) {
        this._startTransition(env);
      }
    }
    if (this.transition) {
      // Drag / Pan / Orbit / Keyboard nav = user intent change: cancel pending focus and restore manual control immediately.
      // Avoids locking navigation in pending transition mode.
      // Restores responsive controls on any active gesture.
      if (this._userNavigating(input)) {
        this.adoptPosition(env, this.focusId, this.posKm, this.quat);
      } else {
        this._updateTransition(dt, input, env);
        return;
      }
    }
    let f = env.get(this.focusId);
    const drag = input.drag;

    // ---- Google Earth Keyboard Navigation ----
    const shift = input.down('ShiftLeft') || input.down('ShiftRight');
    // Altitude = distance above terrain in current direction; governs near-ground speed/tilt
    const groundR = this.groundRadiusOf(f);
    const alt = Math.max(this.dist - groundR, f.radiusKm * 1e-6);
    // Angular pan rate scales with altitude (slower near surface, faster at high altitudes).
    // Minimum 3e-6 rad/s (Earth ~= 19 m/s) ensures stable control down to 1.7m eye height.
    // Prevents high-speed overshoot when close to planetary surfaces.
    const panRate = 1.0 * THREE.MathUtils.clamp(alt / f.radiusKm, 3e-6, 1.2);
    const up = (input.down('KeyW') || input.down('ArrowUp')) ? 1 : 0;
    const dn = (input.down('KeyS') || input.down('ArrowDown')) ? 1 : 0;
    const lf = (input.down('KeyA') || input.down('ArrowLeft')) ? 1 : 0;
    const rt = (input.down('KeyD') || input.down('ArrowRight')) ? 1 : 0;
    // Progressive keyboard sensitivity: fine initial precision, accelerating with sustained keypress (0.45 -> 1.65x)
    this._navHold = (up || dn || lf || rt) ? Math.min(this._navHold + dt, 2) : 0;
    const navMul = 0.45 + this._navHold * 0.6;
    if (!shift) {
      // Pan (screen space, rotates with heading; Up=N, Down=S, Left=W, Right=E; polar flip supported)
      const sN = up - dn, sE = rt - lf;
      const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      this.lat += (sN * ch - sE * sh) * panRate * navMul * dt;
      this.lon += ((sN * sh + sE * ch) * panRate * navMul * dt) /
        Math.max(Math.abs(Math.cos(this.lat)), 0.15);
    } else {
      // Shift+A/D rotates heading; Shift+W/S tilts - both full 360-degree continuous rotation
      // (Design principle: free rotation across all axes, seamless polar latitude flip)
      this.heading += (lf - rt) * 1.1 * navMul * dt;
      this.tilt += (up - dn) * 0.9 * navMul * dt;
      if (this.tilt > Math.PI) this.tilt -= 2 * Math.PI;
      if (this.tilt < -Math.PI) this.tilt += 2 * Math.PI;
      if (this.heading > Math.PI) this.heading -= 2 * Math.PI;
      if (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    }
    // PageUp/PageDown and +/- zoom (unified with screen-center scroll logic below)
    let zoomK = 0;
    if (input.down('PageUp') || input.down('Equal') || input.down('NumpadAdd')) zoomK -= 1;
    if (input.down('PageDown') || input.down('Minus') || input.down('NumpadSubtract')) zoomK += 1;
    // R resets view (GE convention: north up, nadir view, zero pan) with smooth ~0.4s interpolation
    if (input.tapped('KeyR')) this._resetAnim = true;
    if (this._resetAnim) {
      const k = Math.exp(-dt * 7);
      this.heading *= k;
      this.tilt *= k;
      this.panOffset.multiplyScalar(k);
      if (Math.abs(this.heading) < 1e-3 && Math.abs(this.tilt) < 1e-3 && this.panOffset.lengthSq() < 1e-8) {
        this.heading = 0; this.tilt = 0; this.panOffset.set(0, 0, 0);
        this._resetAnim = false;
      }
    }

    // Ctrl + Left-drag -> Rotate heading and tilt (3D orbit around focus point)
    if (input.look?.active && (input.look.dx !== 0 || input.look.dy !== 0)) {
      this.heading += input.look.dx * 0.0035;
      this.tilt += input.look.dy * 0.0035;
      if (this.tilt > Math.PI) this.tilt -= 2 * Math.PI;
      if (this.tilt < -Math.PI) this.tilt += 2 * Math.PI;
      if (this.heading > Math.PI) this.heading -= 2 * Math.PI;
      if (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    }

    // Right / Middle drag -> Spatial pan (translation without rotation)
    if (input.pan.active && (input.pan.dx !== 0 || input.pan.dy !== 0)) {
      // Commit remaining dolly before pan begins to prevent offset overlap jumps
      if (Math.abs(this._dolly - 1) > 1e-4) {
        this._dolly = 1;
        this._dollyDepth = null;
        this._dollyTargetId = null;
      }
      const k = this.dist * 0.0012;
      _v2.set(1, 0, 0).applyQuaternion(this.quat);  // Camera right
      _v3.set(0, 1, 0).applyQuaternion(this.quat);  // Camera up
      _v2.multiplyScalar(-input.pan.dx * k).addScaledVector(_v3, input.pan.dy * k);
      _q.copy(this.frameQuat(f)).invert();
      _v2.applyQuaternion(_q); // World -> anchor frame
      this.panOffset.add(_v2);
      const maxPan = this.dist * 2 + f.radiusKm * 2;
      if (this.panOffset.length() > maxPan) this.panOffset.setLength(maxPan);
    }

    // ---- Drag -> Angular Velocity (immediate response + release inertia, oriented by heading) ----
    // Sensitivity scales with surface altitude (mimics "grabbing the terrain": slower close, faster high).
    // Mobile near-surface floor tuned for responsive single-finger drag without losing stability.
    // Retains lower sensitivity close to ground while preventing unresponsive touch controls.
    let sensMin = 2e-6;
    if (IS_MOBILE && alt < f.radiusKm * 0.5) sensMin = 1.2e-5;
    const sens = THREE.MathUtils.clamp(0.00123 * alt / f.radiusKm, sensMin, 0.0052);
    if (drag.active) {
      const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      this.vLat = ((drag.dy * ch - drag.dx * sh) * sens) / Math.max(dt, 1e-3);
      this.vLon = ((-drag.dx * ch - drag.dy * sh) * sens) / Math.max(dt, 1e-3);
    }
    this.lon += this.vLon * dt;
    this.lat += this.vLat * dt;
    this.poleNormalize();
    // Reduced motion: zero out release inertia
    const damp = prefersReducedMotion() ? 0 : Math.exp(-dt * (drag.active ? 0 : 4.5));
    this.vLon *= damp;
    this.vLat *= damp;

    // ---- Zoom (unified screen-center zoom for wheel and PageUp/Down) ----
    // Progressive sensitivity: fine control for single ticks, accelerating for continuous scrolling;
    // PageUp/Down rate scales with hold duration (0.55 -> 2.2 /s)
    if (input.wheel !== 0) {
      this._streak = Math.min(this._streak + Math.abs(input.wheel) * 0.18, 1);
      this._streakIdle = 0;
    } else {
      this._streakIdle += dt;
      if (this._streakIdle > 0.35) this._streak = Math.max(this._streak - dt * 2, 0);
    }
    this._zoomHold = zoomK !== 0 ? Math.min(this._zoomHold + dt, 2.5) : 0;
    let zoomMul = 1;
    if (zoomK !== 0) zoomMul *= Math.exp(zoomK * (0.55 + this._zoomHold * 0.65) * dt);
    if (input.wheel !== 0) {
      zoomMul *= Math.pow(1.12 + 0.26 * this._streak, THREE.MathUtils.clamp(input.wheel, -3, 3));
    }

    // Zoom strictly advances/retreats along screen center without implicit focus switches;
    // focus changes are driven exclusively by explicit user clicks, search, or label actions.

    // Determine whether to use radial zoom or line-of-sight dolly zoom:
    // - Panned: radial zoom (preserves panOffset / look-at point without snapping).
    // - Not panned, untilted: radial zoom (classic orbital exploration + landing).
    // - Not panned, tilted: radial zoom if sightline is radial; otherwise dolly.
    // Avoids resetting pan offsets during radial sightline zoom.
    // Correctly preserves user pan displacement.
    // Maintains consistent viewport reference space.
    const cl = Math.cos(this.lat);
    _v3.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon))
      .applyQuaternion(this.frameQuat(f)); // Focus radial (world)
    _va.set(0, 0, -1).applyQuaternion(this.quat); // Current sightline direction (world)
    const viewRadial = Math.abs(_va.dot(_v3) + 1) < 0.03; // Sightline ~= -radial
    // Detect whether pan is predominantly lateral:
    // lateral panning retains look-at anchor; significant radial components route to dolly.
    const panLen = this.panOffset.length();
    _vm.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon));
    const panDotRadial = panLen > 0 ? this.panOffset.dot(_vm) : 0;
    const panMostlyPerp = panLen > 0 && Math.abs(panDotRadial) < panLen * 0.25;
    // Gesture locking: ongoing dolly continues dolly; ongoing radial gesture continues radial.
    // Prevents mid-gesture auto-tilt from abruptly switching zoom modes.
    // Preserves consistent gesture handling across viewport transitions.
    // - Unpanned, untilted: radial zoom (classic orbit + landing/takeoff semantics).
    // - Lateral pan with radial sightline: radial zoom (maintains look-at anchor).
    // - Otherwise: dolly (sightline push/pull maintains screen-center focus).
    const zoomActive = input.wheel !== 0 || zoomK !== 0;
    const inDollyGesture = Math.abs(this._dolly - 1) > 1e-5;
    // Radial zoom selection criteria:
    // - Untilted and unpanned: classic orbit / landing / takeoff semantics.
    // - Radial sightline despite tilt compensation: maintain focus centered zoom.
    //   Prevents unintentional off-axis drift when zooming.
    // - Lateral pan with radial sightline: preserves look-at anchor.
    // - Mobile two-finger pinch: forced to radial zoom to avoid erratic depth shifts.
    //   Touch navigation near ground maintains stable radial scale.
    //   Provides consistent tactile feedback matching desktop wheel.
    const mobilePinchRadial = IS_MOBILE && zoomActive &&
      input.pan.dx === 0 && input.pan.dy === 0 && this.panOffset.lengthSq() === 0;
    const shouldBeRadial = (this.panOffset.lengthSq() === 0 &&
      (Math.abs(this.tilt) <= 0.02 || viewRadial || mobilePinchRadial)) ||
      (panMostlyPerp && viewRadial);
    const canStartRadial = zoomActive && !inDollyGesture && !this._radialGesture && shouldBeRadial;
    // External distTarget (e.g. takeoff / return to explore) smoothly converges even without zoom input
    const needsRadialSmooth = !inDollyGesture && !this._radialGesture &&
      Math.abs(this.dist - this.distTarget) > 1e-6 && shouldBeRadial;
    if (canStartRadial) this._radialGesture = true;
    const useRadial = this._radialGesture || canStartRadial || needsRadialSmooth;
    if (useRadial) {
      this._dolly = 1;
      this._dollyTargetId = null;
      const minD = this.minDist(f);
      const base = minD - 0.002; // Base floor slightly below minimum (>= 2m step size near ground)
      const a = Math.max(this.distTarget - base, 0.0008);
      let target = base + a * zoomMul;
      // Mobile: zoom out near surface guarantees at least 2% radius step to ensure
      // two-finger pinch-out remains responsive near planetary surfaces.
      // Balances rapid departure with precise close-range landing control.
      if (IS_MOBILE && zoomMul > 1 && this.distTarget < minD * 1.5) {
        target = Math.max(target, this.distTarget + f.radiusKm * 0.02);
      }
      this.distTarget = THREE.MathUtils.clamp(target, minD, MAX_DIST);
      this.dist += (this.distTarget - this.dist) * Math.min(dt * 7, 1);
    } else {
      this.distTarget = this.dist; // Freeze radial zoom channel
      if (zoomMul !== 1) {
        if (this._dolly === 1) {
          // New gesture: acquire and lock target (prefer celestial body hit, otherwise anchor projection)
          this._dollyDepth = null;
          this._dollyTargetId = null;
          _va.set(0, 0, -1).applyQuaternion(this.quat);
          const hit = env.centerHit?.(this.posKm, _va) ?? null;
          if (hit) {
            this._dollyTargetId = hit.id ?? null;
            this._dollyDepth = hit.depth;
          } else {
            const d = env.centerDepth?.(this.posKm, _va) ?? null;
            if (d != null) this._dollyDepth = d;
          }
        }
        this._dolly *= zoomMul;
      }
      if (Math.abs(this._dolly - 1) > 1e-5) {
        _va.set(0, 0, -1).applyQuaternion(this.quat);
        // Refresh depth: raycast against locked target only (no retargeting)
        if (this._dollyTargetId && env.get) {
          const tb = env.get(this._dollyTargetId);
          if (tb) {
            // Target = focus (user locked) -> terrain-aware floor for smooth landing transition
            const margin = this._dollyTargetId === this.focusId
              ? this.minDist(tb) : (tb.minDistKm ?? tb.radiusKm * 1.004 + 1);
            _v2.set(
              tb.posKm[0] - this.posKm[0], tb.posKm[1] - this.posKm[1], tb.posKm[2] - this.posKm[2]
            );
            const b = _v2.dot(_va);
            if (b > 0) {
              const det = b * b - (_v2.lengthSq() - margin * margin);
              if (det > 0) {
                const tHit = b - Math.sqrt(det);
                if (tHit > 1e-6) this._dollyDepth = tHit;
              }
            }
          }
        }
        if (this._dollyDepth == null) {
          _v1.copy(this.panOffset).applyQuaternion(this.frameQuat(f));
          _v1.set(
            f.posKm[0] + _v1.x - this.posKm[0],
            f.posKm[1] + _v1.y - this.posKm[1],
            f.posKm[2] + _v1.z - this.posKm[2]
          );
          const t = _v1.dot(_va);
          this._dollyDepth = t > f.radiusKm * 1e-6 ? t : null;
        }
        const depth = this._dollyDepth;
        if (depth == null || depth <= f.radiusKm * 1e-6) {
          this._dolly = 1; // No target at screen center -> halt dolly advance
        } else {
          // Smooth consumption rate (matches radial zoom cadence); T = absolute target depth
          const k = Math.min(dt * 7, 1);
          const T = depth * this._dolly;
          const sNew = Math.max(depth + (T - depth) * k, 1e-9);
          let delta = depth - sNew; // > 0 = forward along sightline
          // Prevent penetration into focus body: |pos + V*delta - f.pos| >= minDist
          if (delta > 0) {
            _v2.set(
              this.posKm[0] - f.posKm[0], this.posKm[1] - f.posKm[1], this.posKm[2] - f.posKm[2]
            );
            const minD = this.minDist(f);
            const b = _v2.dot(_va);
            const c = _v2.lengthSq() - minD * minD;
            const det = b * b - c;
            if (c > 0 && det > 0) {
              const tHit = -b - Math.sqrt(det);
              if (tHit > 0 && delta > tHit) delta = Math.max(tHit - 1e-6, 0);
            }
          }
          // Maximum retreat cap: heliocentric distance capped at heliospheric bounds
          if (delta < 0) {
            const rSun = Math.hypot(this.posKm[0], this.posKm[1], this.posKm[2]);
            if (rSun > MAX_DIST) delta = 0;
          }
          this.posKm[0] += _va.x * delta;
          this.posKm[1] += _va.y * delta;
          this.posKm[2] += _va.z * delta;
          // Position displacement absorbed into panOffset (lat/lon/dist/heading/tilt unchanged)
          _v1.set(
            this.posKm[0] - f.posKm[0], this.posKm[1] - f.posKm[1], this.posKm[2] - f.posKm[2]
          );
          const cl = Math.cos(this.lat);
          _v3.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon))
            .applyQuaternion(this.frameQuat(f)); // Radial (world)
          _v1.addScaledVector(_v3, -this.dist); // Anchor offset (world)
          _q.copy(this.frameQuat(f)).invert();
          this.panOffset.copy(_v1.applyQuaternion(_q));
          // Reference depth decreases as camera advances; remaining ratio = target / new depth
          this._dollyDepth = depth - delta;
          this._dolly = this._dollyDepth <= 1e-9 ? 1 : T / this._dollyDepth;
          if (Math.abs(this._dolly - 1) < 1e-4) this._dolly = 1;
        }
      } else {
        this._dollyDepth = null;
        this._dollyTargetId = null;
      }
    }

    // Zoom gesture completion: clear radial gesture lock after 0.35s idle without active dolly.
    // Prevents multi-tick wheel pauses from fragmenting a continuous gesture.
    // Avoids unintended mid-gesture switching between radial and dolly modes.
    if (input.wheel === 0 && zoomK === 0 && Math.abs(this._dolly - 1) < 1e-4 && this._streakIdle > 0.35) {
      this._radialGesture = false;
      this._dollyDepth = null;
      this._dollyTargetId = null;
    }

    this.compute(env);
  }

  compute(env) {    const f = env.get(this.focusId);
    const fq = this.frameQuat(f); // Body-fixed (default) or inertial frame
    // Anchor spherical coordinates -> world (orbit center = body center + pan offset)
    const cl = Math.cos(this.lat);
    _v1.set(cl * Math.cos(this.lon), Math.sin(this.lat), -cl * Math.sin(this.lon))
      .applyQuaternion(fq);
    let ox = 0, oy = 0, oz = 0;
    if (this.panOffset.lengthSq() > 0) {
      _v3.copy(this.panOffset).applyQuaternion(fq);
      ox = _v3.x; oy = _v3.y; oz = _v3.z;
    }
    this.posKm[0] = f.posKm[0] + ox + _v1.x * this.dist;
    this.posKm[1] = f.posKm[1] + oy + _v1.y * this.dist;
    this.posKm[2] = f.posKm[2] + oz + _v1.z * this.dist;
    // Smooth radial pushout if panned camera penetrates body interior
    const dcx = this.posKm[0] - f.posKm[0], dcy = this.posKm[1] - f.posKm[1], dcz = this.posKm[2] - f.posKm[2];
    const dc = Math.hypot(dcx, dcy, dcz);
    const minD = this.minDist(f);
    if (dc < minD && dc > 0) {
      const k = Math.min(1, (this._dtLast || 0.016) * 10); // Rapid pushout for deep penetration, gentle for grazing
      const nd = dc + (minD - dc) * k;
      const push = nd / dc;
      this.posKm[0] = f.posKm[0] + dcx * push;
      this.posKm[1] = f.posKm[1] + dcy * push;
      this.posKm[2] = f.posKm[2] + dcz * push;
    }
    // Orientation: look at body center; up vector = frame north rotated by heading
    _v2.set(0, 1, 0).applyQuaternion(fq);
    if (this.heading !== 0) _v2.applyAxisAngle(_v1, this.heading);
    _v3.copy(_v1).negate(); // Sightline
    _m.lookAt(new THREE.Vector3(), _v3, _v2);
    this.quat.setFromRotationMatrix(_m);
    // Tilt: user tilt + near-ground auto-tilt (nadir to horizon transition), around camera local X
    this._autoTilt = this.autoTiltOf(f, Math.max(this.dist - this.groundRadiusOf(f), 0));
    const tiltTotal = this.tilt + this._autoTilt;
    if (tiltTotal !== 0) {
      _q.set(Math.sin(tiltTotal / 2), 0, 0, Math.cos(tiltTotal / 2));
      this.quat.multiply(_q);
    }
  }

  updateFlight(dt, env) {
    const fl = this.flight;
    fl.t = Math.min(1, (performance.now() - fl.start) / 1000 / fl.dur);
    const s = smoother(fl.t);
    const from = env.get(fl.fromId);
    const to = env.get(fl.toId);

    // Path center (double precision component-wise interpolation for moving target accuracy)
    const cx = from.posKm[0] + (to.posKm[0] - from.posKm[0]) * s;
    const cy = from.posKm[1] + (to.posKm[1] - from.posKm[1]) * s;
    const cz = from.posKm[2] + (to.posKm[2] - from.posKm[2]) * s;
    const sep = Math.hypot(
      to.posKm[0] - from.posKm[0], to.posKm[1] - from.posKm[1], to.posKm[2] - from.posKm[2]
    );

    // Signature GE altitude profile: logarithmic interpolation + sinusoidal arc
    const h = Math.exp(Math.log(fl.h0) * (1 - s) + Math.log(fl.h1) * s) +
      Math.sin(Math.PI * s) * sep * 0.22;

    // Out-of-plane direction interpolation
    _v1.copy(fl.dir0).lerp(fl.dir1, s).normalize();
    this.posKm[0] = cx + _v1.x * h;
    this.posKm[1] = cy + _v1.y * h;
    this.posKm[2] = cz + _v1.z * h;

    // Sightline: smoothly locks onto target over first 60%, target remains centered thereafter
    const sLook = smoother(Math.min(1, fl.t / 0.6));
    const lx = cx + (to.posKm[0] - cx) * sLook;
    const ly = cy + (to.posKm[1] - cy) * sLook;
    const lz = cz + (to.posKm[2] - cz) * sLook;
    _v3.set(lx - this.posKm[0], ly - this.posKm[1], lz - this.posKm[2]).normalize();
    // Up vector: world north -> target body north
    _v2.set(0, 1, 0).lerp(_v1.set(0, 1, 0).applyQuaternion(to.quat), s).normalize();
    _m.lookAt(new THREE.Vector3(), _v3, _v2);
    this.quat.setFromRotationMatrix(_m);

    if (fl.t >= 1) {
      // Arrival: transition to orbit mode, recover parameters from current position
      this.flight = null;
      this.adoptPosition(env, fl.toId, this.posKm);
      this.distTarget = this.dist;
    }
  }
}
