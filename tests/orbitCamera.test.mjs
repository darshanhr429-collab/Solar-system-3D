// OrbitCamera exploration mode state machine regression assertions.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitCamera } from '../src/engine/orbitCamera.js';

function makeEnv() {
  const bodies = {
    earth: { posKm: [0, 0, 0], radiusKm: 6371, quat: new THREE.Quaternion() },
    mars: { posKm: [1.5e8, 0, 0], radiusKm: 3390, quat: new THREE.Quaternion() },
  };
  return {
    get(id) {
      const b = bodies[id];
      if (!b) throw new Error('Unknown body ' + id);
      return { ...b, ringsOuterKm: null, viewDist: undefined, groundRadius: null, minDistKm: null };
    },
  };
}

function makeInput(over = {}) {
  const keys = over.keys ?? new Set();
  return {
    keys,
    dx: 0, dy: 0, wheel: 0, fovWheel: 0,
    drag: { active: false, dx: 0, dy: 0 },
    pan: { active: false, dx: 0, dy: 0 },
    look: { active: false, dx: 0, dy: 0 },
    down: (c) => keys.has(c),
    tapped: () => false,
    cancelGestures() {},
    ...over,
  };
}

function setup() {
  const env = makeEnv();
  const cam = new OrbitCamera();
  cam.init(env, 'earth', 4);
  return { env, cam };
}

function run(cam, env, input, frames = 3, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) cam.update(dt, input, env);
}

test('Clicking celestial body initiates deferred focus transition', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  assert.ok(cam.transition, 'Transition should be initiated');
  assert.equal(cam.transition.toId, 'mars');
  assert.equal(cam.focusId, 'earth', 'Focus should not commit before transition finishes');
});

test('Dragging during transition cancels transition and immediately restores manual control', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  assert.ok(cam.transition, 'Precondition: transition active');

  const lonBefore = cam.lon;
  const dragInput = makeInput({ drag: { active: true, dx: 40, dy: 0 } });
  cam.update(1 / 60, dragInput, env);

  assert.equal(cam.transition, null, 'Drag should cancel transition');
  assert.equal(cam.pendingFocusId, null, 'Drag should clear pending focus');
  assert.equal(cam.focusId, 'earth', 'Should remain focused on original body');

  run(cam, env, dragInput, 30);
  assert.ok(Math.abs(cam.lon - lonBefore) > 1e-3,
    `Longitude should change on drag, got ${lonBefore} -> ${cam.lon}`);
});

test('Arrow keys and WASD during transition cancel transition', () => {
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft']) {
    const { env, cam } = setup();
    cam.setPendingFocus('mars');
    run(cam, env, makeInput(), 2);
    assert.ok(cam.transition);
    cam.update(1 / 60, makeInput({ keys: new Set([key]) }), env);
    assert.equal(cam.transition, null, `${key} should cancel transition`);
  }
});

test('Scrolling outward with zero progress cancels transition', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  assert.ok(cam.transition);
  assert.equal(cam.transition.t, 0, 'Precondition: transition has not progressed');

  cam.update(1 / 60, makeInput({ wheel: 1 }), env);
  assert.equal(cam.transition, null, 'Outward wheel scroll should cancel transition');
  assert.equal(cam.pendingFocusId, null);
});

test('Scrolling inward advances transition and commits new focus when t >= 1', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  for (let i = 0; i < 40 && cam.transition; i++) {
    cam.update(1 / 60, makeInput({ wheel: -1 }), env);
  }
  assert.equal(cam.transition, null, 'Continuous inward scroll should complete transition');
  assert.equal(cam.focusId, 'mars', 'Focus should commit to target body upon completion');
});

test('Transition remains active when undisturbed with idle input', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 60);
  assert.ok(cam.transition, 'Transition should persist without user input');
  assert.equal(cam.focusId, 'earth');
});

test('Orbit parameters and camera position remain self-consistent after drag cancellation', () => {
  const { env, cam } = setup();
  cam.setPendingFocus('mars');
  run(cam, env, makeInput(), 2);
  const posBefore = Float64Array.from(cam.posKm);

  cam.update(1 / 60, makeInput({ drag: { active: true, dx: 0.6, dy: 0 } }), env);
  const moved = Math.hypot(
    cam.posKm[0] - posBefore[0], cam.posKm[1] - posBefore[1], cam.posKm[2] - posBefore[2]);
  assert.ok(moved < cam.dist * 0.5, `Canceling transition should not produce position jump, got displacement ${moved} km`);
  assert.ok(cam.dist > 0 && Number.isFinite(cam.dist));
});
