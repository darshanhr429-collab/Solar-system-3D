// WebXR / VR Support (issue #33):
// Wraps Three.js WebXRManager (renderer.xr) to provide an immersive VR experience.
// - Stereo rendering shares identical ephemeris calculations (VR and desktop frames use same simClock)
// - Controller ray picking for bodies, pinch-to-zoom, grab-to-drag
// - Graceful degradation: falls back to desktop mode when WebXR is unavailable
// - Performance: Quest 2/3 target >60fps, automatically reduces pixel ratio in VR mode
//
// Design considerations:
// - Non-invasive to main.js: injected via constructor with renderer/camera/scene, called on demand
// - Disables pointer lock in VR mode (renderer.xr manages render loop)
// - Controllers load actual models via XRControllerModelFactory, degrading to ray lines if model fails

import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

// Performance parameters in VR mode
const VR_PIXEL_RATIO = 1;       // High dual-eye VR rendering overhead, fixed at 1x pixel ratio
const RAY_LENGTH = 100;         // Controller ray length (world units, sufficient under floating origin)
const TELEPORT_SPEED = 50;      // Thumbstick teleport speed (km/s equivalent)
const PINCH_ZOOM_RATE = 0.5;    // Two-handed pinch zoom rate

export class WebXRManager {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Camera} camera
   * @param {THREE.Scene} scene
   */
  constructor(renderer, camera, scene) {
    this._renderer = renderer;
    this._camera = camera;
    this._scene = scene;

    this._supported = false;
    this._session = null;
    this._button = null;
    this._callback = null;        // Controller interaction callback

    // Controllers
    this._controllers = [];
    this._controllerGrips = [];
    this._raycaster = new THREE.Raycaster();
    this._rays = [];              // Ray visualization Line
    this._factory = null;         // XRControllerModelFactory (lazy creation)
    this._models = new Map();
    this._trackingRig = new THREE.Group();
    this._trackingRig.scale.setScalar(0.001); // XR metres -> scene kilometres
    this._poseMatrix = new THREE.Matrix4();

    // Gesture state
    this._squeezeState = [false, false];  // Left and right hand squeeze
    this._selectState = [false, false];   // Left and right hand select (trigger)
    this._prevPinchDist = 0;              // Previous frame two-hand distance (pinch zoom)
    this._grabOffset = null;              // Grab drag offset

    // Performance: save original desktop mode settings, restore after VR exit
    this._savedPixelRatio = renderer.getPixelRatio();
    this._savedCameraAutoUpdate = renderer.xr.cameraAutoUpdate;

    // Bind methods (avoid creating closures per frame)
    this._onSessionEnded = this._onSessionEnded.bind(this);
  }

  /**
   * Check WebXR support. Must be called before user interaction (some browsers require secure context).
   * @returns {Promise<boolean>}
   */
  async init() {
    if (typeof navigator === 'undefined' || !navigator.xr) {
      this._supported = false;
      return false;
    }
    try {
      this._supported = await navigator.xr.isSessionSupported('immersive-vr');
    } catch {
      this._supported = false;
    }
    return this._supported;
  }

  /** Whether WebXR immersive-vr is available */
  get supported() { return this._supported; }

  /** Currently active XRSession (or null if none) */
  get session() { return this._session; }

  /** Whether currently in VR mode */
  get inVR() { return this._session !== null; }

  /**
   * Create and return VR entry button. Returns null if WebXR is unavailable.
   * Button is pre-styled and can be appended directly to document.body.
   * @returns {HTMLElement|null}
   */
  createButton() {
    if (!this._supported) return null;
    // VRButton.createButton handles session request and renderer.xr.setSession internally
    this._button = VRButton.createButton(this._renderer, {
      optionalFeatures: ['local-floor', 'bounded-floor', 'layers'],
    });
    // Intercept session start/end to sync state
    const origOnClick = this._button.onclick;
    this._button.onclick = async () => {
      if (this._session === null) {
        await this.enterVR();
      } else {
        this.exitVR();
      }
    };
    return this._button;
  }

  /**
   * Enter VR session. On success, renderer.xr takes over the render loop.
   * @returns {Promise<boolean>} Whether entry succeeded
   */
  async enterVR() {
    if (!this._supported || this._session) return false;

    try {
      this._savedPixelRatio = this._renderer.getPixelRatio();
      this._savedCameraAutoUpdate = this._renderer.xr.cameraAutoUpdate;
      this._renderer.xr.setReferenceSpaceType('local');
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'layers'],
      });
      this._session = session;
      session.addEventListener('end', this._onSessionEnded);

      // Enable XR rendering
      this._renderer.xr.enabled = true;
      this._renderer.xr.cameraAutoUpdate = false;
      await this._renderer.xr.setSession(session);

      // Performance downgrade: lower pixel ratio due to stereo rendering load
      this._renderer.setPixelRatio(VR_PIXEL_RATIO);

      // Attempt to enable foveated rendering (supported on Quest 2/3, reduces peripheral resolution)
      this._tryFoveatedRendering();

      // Setup controllers
      this._setupControllers();

      return true;
    } catch (err) {
      console.warn('[WebXR] Failed to enter VR:', err);
      const session = this._session;
      this._onSessionEnded();
      await session?.end().catch(() => {});
      return false;
    }
  }

  /** Exit VR session */
  exitVR() {
    if (this._session) {
      this._session.end();
    }
  }

  /** Session end callback: clean up state, restore desktop parameters */
  _onSessionEnded() {
    if (this._session) {
      this._session.removeEventListener('end', this._onSessionEnded);
      this._session = null;
    }
    this._renderer.xr.enabled = false;
    this._renderer.xr.cameraAutoUpdate = this._savedCameraAutoUpdate;
    this._renderer.setPixelRatio(this._savedPixelRatio);
    this._cleanupControllers();
    this._callback?.({ type: 'sessionend' });
  }

  /**
   * Attempt to enable foveated rendering.
   * Quest 2/3 supports this via WebXR layers extension, substantially boosting performance.
   * Silently skipped when unavailable.
   */
  _tryFoveatedRendering() {
    this._renderer.xr.setFoveation?.(0.5);
    try {
      const gl = this._renderer.getContext();
      // WEBGL_qcom_framebuffer_foveated or similar extension
      const ext = gl.getExtension('WEBGL_qcom_framebuffer_foveated');
      if (ext) {
        // Extension available; parameters managed by driver
        console.info('[WebXR] foveated rendering extension enabled');
      }
    } catch {
      // Fail silently: does not affect VR functionality
    }
  }

  // -- Controller Setup ----------------------------------------------------

  _setupControllers() {
    this._scene.add(this._trackingRig);
    // Lazy instantiate factory (avoids unused loading in desktop mode)
    if (!this._factory) {
      try {
        this._factory = new XRControllerModelFactory();
      } catch {
        this._factory = null; // Degrade to pure ray line when GLTFLoader is unavailable
      }
    }

    for (let i = 0; i < 2; i++) {
      const controller = this._renderer.xr.getController(i);
      const grip = this._renderer.xr.getControllerGrip(i);

      // Ray visualization (thin line pointing in -Z direction)
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const ray = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x66ccff, transparent: true, opacity: 0.6,
      }));
      ray.scale.z = RAY_LENGTH;
      controller.add(ray);
      this._rays.push(ray);

      // Event bindings
      const handlers = {
        selectstart: () => this._onSelectStart(i), selectend: () => this._onSelectEnd(i),
        squeezestart: () => this._onSqueezeStart(i), squeezeend: () => this._onSqueezeEnd(i),
        connected: e => { controller.userData.swInputSource = e.data; },
        disconnected: () => { delete controller.userData.swInputSource; },
      };
      controller.userData.swXrHandlers = handlers;
      for (const [event, handler] of Object.entries(handlers)) controller.addEventListener(event, handler);

      this._trackingRig.add(controller);
      this._controllers.push(controller);

      // Load controller 3D model (falls back to ray line on failure)
      if (this._factory) {
        try {
          const model = this._models.get(grip) ?? this._factory.createControllerModel(grip);
          this._models.set(grip, model);
          grip.add(model);
        } catch { /* Model load failure does not break functionality */ }
      }
      this._trackingRig.add(grip);
      this._controllerGrips.push(grip);
    }
  }

  _cleanupControllers() {
    for (const c of this._controllers) {
      c.removeFromParent();
      for (const [event, handler] of Object.entries(c.userData.swXrHandlers ?? {})) c.removeEventListener(event, handler);
      delete c.userData.swXrHandlers;
    }
    for (const g of this._controllerGrips) { g.removeFromParent(); this._models.get(g)?.removeFromParent(); }
    this._trackingRig.removeFromParent();
    for (const r of this._rays) { r.removeFromParent(); r.geometry.dispose(); r.material.dispose(); }
    this._controllers = [];
    this._controllerGrips = [];
    this._rays = [];
    this._squeezeState = [false, false];
    this._selectState = [false, false];
    this._prevPinchDist = 0;
    this._grabOffset = null;
  }

  // -- Controller Event Handling --------------------------------------------

  /** Trigger press: point and select celestial body */
  _onSelectStart(hand) {
    this._selectState[hand] = true;
    const hit = this._raycastBody(hand);
    if (hit && this._callback) {
      this._callback({ type: 'select', hand, bodyId: hit.bodyId, point: hit.point });
    }
  }

  _onSelectEnd(hand) {
    this._selectState[hand] = false;
  }

  /** Squeeze press: grab / pinch */
  _onSqueezeStart(hand) {
    this._squeezeState[hand] = true;
    // Two-handed squeeze -> pinch zoom
    if (this._squeezeState[0] && this._squeezeState[1]) {
      this._prevPinchDist = this._controllerDistance();
    } else {
      // Single hand squeeze -> grab move
      this._grabOffset = this._controllers[hand].position.clone();
    }
  }

  _onSqueezeEnd(hand) {
    this._squeezeState[hand] = false;
    this._grabOffset = null;
    this._prevPinchDist = 0;
  }

  /** Pick celestial body from controller ray (requires external bodies list) */
  _raycastBody(hand) {
    const controller = this._controllers[hand];
    if (!controller) return null;

    // Controller world pose -> ray
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    controller.getWorldPosition(origin);
    controller.getWorldDirection(direction);
    // getWorldDirection returns -Z direction; invert per Three.js convention
    direction.negate();

    this._raycaster.set(origin, direction);
    this._raycaster.far = RAY_LENGTH;

    // External bodies provided via callback, or raycast scene children directly
    if (this._callback) {
      this._callback({
        type: 'raycast', hand,
        origin: { x: origin.x, y: origin.y, z: origin.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
      });
    }
    return null;
  }

  /** Distance between two controllers (world units) */
  _controllerDistance() {
    if (this._controllers.length < 2) return 0;
    return this._controllers[0].position.distanceTo(this._controllers[1].position);
  }

  // -- Per-frame Update ----------------------------------------------------

  /**
   * Per-frame controller state update: thumbstick locomotion, pinch zoom, grab move.
   * @param {number} dt Frame delta time (seconds)
   */
  update(dt) {
    if (!this._session || this._controllers.length === 0) return;
    this._updateTrackingCamera();

    // Thumbstick / touchpad locomotion
    for (let i = 0; i < this._controllers.length; i++) {
      const c = this._controllers[i];
      const source = c.userData.swInputSource ?? [...this._session.inputSources].find(s => s.handedness === (i === 0 ? 'left' : 'right'));
      const rawAxes = source?.gamepad?.axes;
      const axes = rawAxes?.length >= 4 ? rawAxes.slice(2, 4) : rawAxes ?? c.userData.axes;
      if (!axes) continue;

      // Touchpad / thumbstick Y axis -> forward / backward movement
      const forward = -axes[1] || 0;
      const sideways = axes[0] || 0;
      if (Math.abs(forward) > 0.1 || Math.abs(sideways) > 0.1) {
        if (this._callback) {
          this._callback({
            type: 'teleport',
            forward: forward * TELEPORT_SPEED * dt,
            sideways: sideways * TELEPORT_SPEED * dt,
          });
        }
      }
    }

    // Two-handed pinch zoom
    if (this._squeezeState[0] && this._squeezeState[1] && this._prevPinchDist > 0) {
      const dist = this._controllerDistance();
      const delta = this._prevPinchDist - dist; // Hands move closer -> zoom in
      if (Math.abs(delta) > 0.001 && this._callback) {
        this._callback({
          type: 'zoom',
          delta: delta * PINCH_ZOOM_RATE,
        });
      }
      this._prevPinchDist = dist;
    }

    // Single-hand grab move
    const grabHand = this._squeezeState[0] ? 0 : (this._squeezeState[1] ? 1 : -1);
    if (grabHand >= 0 && this._grabOffset) {
      const c = this._controllers[grabHand];
      const delta = c.position.clone().sub(this._grabOffset).multiplyScalar(0.001).applyQuaternion(this._camera.quaternion);
      if (delta.lengthSq() > 1e-8 && this._callback) {
        this._callback({
          type: 'grab',
          delta: { x: delta.x, y: delta.y, z: delta.z },
        });
      }
      this._grabOffset = c.position.clone();
    }
  }

  /** Three's XR poses use metres. Convert translations, preserve unit rotation,
   * and set kilometre clip planes before the XR ArrayCamera is rendered. */
  _updateTrackingCamera() {
    const xrCamera = this._renderer.xr.getCamera?.();
    if (!xrCamera?.cameras?.length) return;
    this._camera.updateMatrixWorld(true);
    this._trackingRig.position.copy(this._camera.position);
    this._trackingRig.quaternion.copy(this._camera.quaternion);
    this._trackingRig.updateMatrixWorld(true);
    for (const view of [...xrCamera.cameras, xrCamera]) {
      this._poseMatrix.copy(view.matrix);
      for (const i of [12, 13, 14]) this._poseMatrix.elements[i] *= 0.001;
      view.matrixWorld.multiplyMatrices(this._camera.matrixWorld, this._poseMatrix);
      view.matrixWorldInverse.copy(view.matrixWorld).invert();
      view.near = this._camera.near; view.far = this._camera.far;
      if (view !== xrCamera) {
        const p = view.projectionMatrix.elements, n = view.near, f = view.far;
        p[10] = -(f + n) / (f - n); p[14] = -2 * f * n / (f - n);
        view.projectionMatrixInverse.copy(view.projectionMatrix).invert();
      }
    }
    // A conservative central frustum covers both eyes for scene culling;
    // rendering still uses the original asymmetric per-eye projections.
    xrCamera.projectionMatrix.copy(xrCamera.cameras[0].projectionMatrix);
    xrCamera.projectionMatrix.elements[0] *= 0.9;
    xrCamera.projectionMatrix.elements[8] = 0;
    xrCamera.projectionMatrixInverse.copy(xrCamera.projectionMatrix).invert();
  }

  /**
   * Set controller interaction callback.
   * @param {function} cb Callback function receiving { type, hand, ...payload }
   *   type: 'select' | 'raycast' | 'teleport' | 'zoom' | 'grab'
   */
  setControllerCallback(cb) {
    this._callback = cb;
  }
}
