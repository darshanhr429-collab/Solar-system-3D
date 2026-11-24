// Camera feel regression tests: gait bobbing, impulse damping, FOV dynamics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraFeel } from '../src/engine/cameraFeel.js';

/** Converts quaternion to small Euler angles (radians), YXZ order */
function toEuler(q) {
  const e = { x: 0, y: 0, z: 0 };
  const { x, y, z, w } = q;
  const m23 = 2 * (y * z - w * x);
  e.x = Math.asin(Math.max(-1, Math.min(1, -m23)));
  e.y = Math.atan2(2 * (x * z + w * y), 1 - 2 * (y * y + z * z));
  e.z = Math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z));
  return e;
}

const rest = { mode: 'orbit', walking: false, walkSpeedMS: 0, submerged: false, speedKmS: 0, boosting: false };

test('Camera remains completely undisturbed when stationary and without impulse', () => {
  const f = createCameraFeel();
  let r;
  for (let i = 0; i < 60; i++) r = f.update(1 / 60, rest);
  const e = toEuler(r.quaternion);
  assert.ok(Math.abs(e.x) < 1e-9 && Math.abs(e.y) < 1e-9 && Math.abs(e.z) < 1e-9,
    `Stationary should have zero offset, got ${e.x},${e.y},${e.z}`);
  assert.equal(r.fovBiasDeg, 0);
});

test('Gait bob: periodic pitch during walking, smoothly returns to zero upon stopping', () => {
  const f = createCameraFeel();
  const walk = { ...rest, mode: 'walk', walking: true, walkSpeedMS: 3 };
  const pitches = [];
  for (let i = 0; i < 240; i++) pitches.push(toEuler(f.update(1 / 60, walk).quaternion).x);
  const amp = Math.max(...pitches) - Math.min(...pitches);
  assert.ok(amp > 0.004 && amp < 0.02, `Gait pitch amplitude ${amp.toFixed(4)} rad outside expected range`);

  const stop = { ...rest, mode: 'walk', walking: false, walkSpeedMS: 0 };
  let rs;
  for (let i = 0; i < 120; i++) rs = f.update(1 / 60, stop);
  assert.ok(Math.abs(toEuler(rs.quaternion).x) < 5e-4, 'Bobbing should return to zero after stopping');
});

test('Impulse: instantaneous displacement with exponential decay to zero', () => {
  const f = createCameraFeel();
  f.impulse(0.03, 24);
  assert.ok(f.amplitude === 0.03, 'Impulse amplitude should take effect immediately');
  const first = toEuler(f.update(1 / 60, rest).quaternion);
  assert.ok(Math.abs(first.x) > 1e-4 || Math.abs(first.z) > 1e-4, 'First frame of impulse should show visible offset');
  for (let i = 0; i < 60; i++) f.update(1 / 60, rest);
  assert.ok(f.amplitude < 0.03 * 0.01, `Amplitude after 1s should decay below 1%, got ${f.amplitude}`);
  for (let i = 0; i < 240; i++) f.update(1 / 60, rest);
  assert.equal(f.amplitude, 0, 'Amplitude should completely zero out');
});

test('FOV converges during impulse and recovers to baseline', () => {
  const f = createCameraFeel();
  f.impulse(0.03, 24);
  let minFov = 0;
  for (let i = 0; i < 30; i++) minFov = Math.min(minFov, f.update(1 / 60, rest).fovBiasDeg);
  assert.ok(minFov < -1, `Impulse should narrow FOV, got minimum ${minFov.toFixed(2)} deg`);
  let rr;
  for (let i = 0; i < 300; i++) rr = f.update(1 / 60, rest);
  assert.ok(Math.abs(rr.fovBiasDeg) < 0.05, `FOV bias should recover to zero, got ${rr.fovBiasDeg}`);
});

test('High-speed micro-jitter: imperceptible at low speed, bounded ceiling at high speed', () => {
  const slowFeel = createCameraFeel();
  const slow = { ...rest, mode: 'fly', speedKmS: 0.01 };
  let slowMax = 0;
  for (let i = 0; i < 60; i++) slowMax = Math.max(slowMax, Math.abs(toEuler(slowFeel.update(1 / 60, slow).quaternion).x));
  assert.ok(slowMax < 1e-4, `Low-speed cruise should not jitter, got ${slowMax}`);

  const fastFeel = createCameraFeel();
  const fast = { ...rest, mode: 'fly', speedKmS: 1000 };
  let fastMax = 0;
  for (let i = 0; i < 120; i++) fastMax = Math.max(fastMax, Math.abs(toEuler(fastFeel.update(1 / 60, fast).quaternion).x));
  assert.ok(fastMax > 5e-4, `High speed should have perceptible tremor, got ${fastMax}`);
  assert.ok(fastMax < 0.004, `Tremor must be capped to prevent disorientation, got ${fastMax}`);
});

test('Camera feel only modulates attitude and FOV without position offset', () => {
  const f = createCameraFeel();
  f.impulse(0.02, 24);
  const r = f.update(1 / 60, { ...rest, mode: 'walk', walking: true, walkSpeedMS: 3 });
  assert.deepEqual(Object.keys(r).sort(), ['fovBiasDeg', 'quaternion'],
    'Return value should only contain attitude quaternion and FOV');
});

test('Gait bob frequency synchronizes with footstep audio cadence', () => {
  const f = createCameraFeel();
  const dt = 1 / 120;
  const walk = { mode: 'walk', walking: true, walkSpeedMS: 3, submerged: false, speedKmS: 0.003, boosting: false };
  for (let i = 0; i < 120; i++) f.update(dt, walk);
  const xs = [];
  for (let i = 0; i < 360; i++) xs.push(toEuler(f.update(dt, walk).quaternion).x);
  let crossings = 0;
  for (let i = 1; i < xs.length; i++) if ((xs[i - 1] < 0) !== (xs[i] < 0)) crossings++;
  const measuredHz = crossings / 2 / (xs.length * dt);
  const fStep = 1.2 + Math.min(3 / 9, 1) * 1.3;
  assert.ok(Math.abs(measuredHz - fStep) < 0.25,
    `Gait frequency should match ~${fStep.toFixed(2)} Hz, got ${measuredHz.toFixed(2)} Hz`);
  assert.ok(measuredHz > 1 && measuredHz < 3.5,
    `Gait frequency should be within normal human walking range, got ${measuredHz.toFixed(2)} Hz`);
});
