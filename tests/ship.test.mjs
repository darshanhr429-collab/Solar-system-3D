// Spacecraft physics regressions: gravity integration, arcade damping, atmospheric drag.
//
// These define the boundary between 1:1 simulation and camera roaming.
// Test prerequisites:
//  - posKm is heliocentric coordinates, making solar gravity valid;
//  - Earth moves along true orbit, otherwise fictitious relative acceleration appears.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship, aeroAt } from '../src/engine/ship.js';

const GM_EARTH = 3.986004418e5;
const GM_SUN = 1.32712440018e11;
const R_EARTH = 6371;
const AU = 1.496e8;

const idleInput = {
  dx: 0, dy: 0, wheel: 0, fovWheel: 0, locked: false,
  drag: { active: false, dx: 0, dy: 0 }, pan: { active: false, dx: 0, dy: 0 },
  look: { active: false, dx: 0, dy: 0 }, joystick: { x: 0, y: 0 },
  touchAscend: false, touchDescend: false, touchSprint: false,
  keys: new Set(), down: () => false, tapped: () => false, justPressed: new Set(),
};

function makeEarth(altKm, atmosphere = null) {
  return {
    id: 'earth', posKm: new Float64Array([AU, 0, 0]), radiusKm: R_EARTH,
    distSurface: altKm, landable: true,
    phys: { gm: GM_EARTH, radiusKm: R_EARTH, atmosphere },
  };
}
function makeEnv(earth) {
  return { nearest: earth, get: () => earth, baseReady: () => true, phys: () => earth.phys };
}

test('Gravity mode: 600km circular orbit radius drift < 0.5% over 2 hours', () => {
  const alt = 600, r0 = R_EARTH + alt;
  const vCirc = Math.sqrt(GM_EARTH / r0);
  const vEarth = Math.sqrt(GM_SUN / AU);
  const earth = makeEarth(alt);
  const s = new Ship();
  s.mode = 'fly'; s.gravityMode = true;
  s.posKm[0] = AU + r0;
  s.vel.set(0, vEarth, vCirc);

  let minR = Infinity, maxR = -Infinity;
  const dt = 0.1;
  for (let i = 0; i < 72000; i++) {           // 2 hours
    // Earth moves along true orbit (prevents spurious relative acceleration)
    const ang = (vEarth * i * dt) / AU;
    earth.posKm[0] = AU * Math.cos(ang);
    earth.posKm[1] = AU * Math.sin(ang);
    s.update(dt, idleInput, makeEnv(earth));
    const r = Math.hypot(s.posKm[0] - earth.posKm[0], s.posKm[1] - earth.posKm[1], s.posKm[2] - earth.posKm[2]);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  }
  const drift = (maxR - minR) / r0;
  assert.ok(drift < 0.005, `Circular orbit radius drift ${(drift * 100).toFixed(3)}% exceeds 0.5%`);
});

test('Arcade mode decelerates on input release; gravity mode conserves velocity', () => {
  const speedAfter = (gravityMode) => {
    const earth = makeEarth(600);
    const s = new Ship();
    s.mode = 'fly'; s.gravityMode = gravityMode;
    s.posKm[0] = AU + R_EARTH + 600;
    s.vel.set(0, 0, 7.5);
    for (let i = 0; i < 200; i++) s.update(0.016, idleInput, makeEnv(earth));
    return s.vel.length();
  };
  assert.ok(speedAfter(false) < 1, 'Arcade mode should decelerate significantly after release');
  assert.ok(speedAfter(true) > 7, 'Gravity mode should conserve velocity after release');
});

test('Atmospheric drag: high-speed flight (60km / 7.8km/s) produces measurable deceleration', () => {
  const atm = { rayleighScaleKm: 8.5, rho0: 1.225 };
  const earth = makeEarth(60, atm);
  const s = new Ship();
  s.mode = 'fly'; s.gravityMode = true;
  s.posKm[0] = AU + R_EARTH + 60;
  s.vel.set(0, 0, 7.8);
  const v0 = s.vel.length();
  for (let i = 0; i < 600; i++) s.update(0.016, idleInput, makeEnv(earth));   // ~10 s
  assert.ok(s.vel.length() < v0 * 0.98, `Drag not effective: ${v0} -> ${s.vel.length()}`);
  assert.ok(s.aero && s.aero.q > 1e4, `Dynamic pressure ${s.aero?.q} should be >10 kPa`);
});

test('No atmospheric drag in vacuum (aero is zero)', () => {
  const earth = makeEarth(600);               // No atmosphere
  const s = new Ship();
  s.mode = 'fly'; s.gravityMode = true;
  s.posKm[0] = AU + R_EARTH + 600;
  s.vel.set(0, 0, 7.5);
  s.update(0.016, idleInput, makeEnv(earth));
  assert.equal(s.aero.q, 0);
  assert.equal(s.aero.rho, 0);
});

test('aeroAt: dynamic pressure matches realistic peak at 60 km, near zero at 120 km', () => {
  const atm = { rayleighScaleKm: 8.5, rho0: 1.225 };
  const q60 = aeroAt(60, 7.8, atm).q;
  assert.ok(q60 > 1e4 && q60 < 4e4, `60km dynamic pressure ${(q60 / 1000).toFixed(1)} kPa not in 10-40 kPa`);
  assert.ok(aeroAt(120, 7.8, atm).q < 100, '120km should be near vacuum');
});

test('Propellant: thrust consumes delta-v budget in gravity mode, cannot accelerate when depleted', () => {
  const earth = makeEarth(600);
  const s = new Ship();
  s.mode = 'fly'; s.gravityMode = true;
  s.posKm[0] = AU + R_EARTH + 600;
  s.vel.set(0, 0, 0);
  const thrustInput = {
    ...idleInput,
    keys: new Set(['KeyW']),
    down: (c) => c === 'KeyW',
  };
  const dv0 = s.dvBudget;
  assert.ok(dv0 > 5 && dv0 < 15, `delta-v budget ${dv0} not in order of 9.4`);
  for (let i = 0; i < 100; i++) s.update(0.05, thrustInput, makeEnv(earth));
  assert.ok(s.dvBudget < dv0, 'Thrust should consume delta-v');
  // Cannot accelerate when depleted
  s.dvBudget = 0;
  const v0 = s.vel.length();
  for (let i = 0; i < 20; i++) s.update(0.02, thrustInput, makeEnv(earth));
  assert.ok(s.vel.length() <= v0 + 1e-6, 'Accelerating after delta-v exhausted');
});

test('Aerodynamic lift drops precipitously below stall velocity', () => {
  const atm = { rayleighScaleKm: 8.5, rho0: 1.225 };
  const earth = makeEarth(20, atm);          // 20km altitude, dense enough air
  const run = (speedKmS) => {
    const s = new Ship();
    s.mode = 'fly'; s.gravityMode = true;
    s.posKm[0] = AU + R_EARTH + 20;
    s.vel.set(0, 0, speedKmS);               // Horizontal flight
    for (let i = 0; i < 30; i++) s.update(0.016, idleInput, makeEnv(earth));
    return s.aero.liftMS ?? 0;
  };
  const fast = run(1.0);                     // 1000 m/s
  const slow = run(0.03);                    // 30 m/s, below stall speed
  assert.ok(fast > 10, `High speed lift ${fast.toFixed(0)} m/s² too small (expected ~2g at 20km/1km/s)`);
  assert.ok(slow < 1, `Low speed lift ${slow.toFixed(1)} m/s² should be near zero (stall)`);
});
