// Physical data and satellite orbit consistency tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { BODIES, MOON_PHYS, surfaceGravity } from '../src/astro/bodies.js';
import { MOON_ELEMENTS } from '../src/astro/moonsData.generated.js';
import { moonLocalPosition, moonOrbitNormal, MOON_IDS } from '../src/astro/moons.js';
import { makeNoise, hashSeed } from '../src/util/noise.js';
import { solarActivityAt, SOLAR_CYCLE_EXTREMA } from '../src/astro/solarCycle.js';

test('Surface gravity: Earth 9.81, Moon 1.62, Mars 3.71 m/s²', () => {
  assert.ok(Math.abs(surfaceGravity(BODIES.earth) - 9.81) < 0.03);
  assert.ok(Math.abs(surfaceGravity(MOON_PHYS.moon) - 1.62) < 0.02);
  assert.ok(Math.abs(surfaceGravity(BODIES.mars) - 3.71) < 0.03);
});

test('Satellite fitted periods match astronomical literature (±0.5%)', () => {
  const expect = {
    io: 1.769138, europa: 3.551181, ganymede: 7.154553, callisto: 16.689017,
    titan: 15.945421, triton: 5.876854, charon: 6.387230, phobos: 0.318910,
  };
  for (const [id, pLit] of Object.entries(expect)) {
    const p = 360 / MOON_ELEMENTS[id].nDegPerDay;
    assert.ok(Math.abs(p - pLit) / pLit < 0.005, `${id}: P=${p.toFixed(5)}d (ref ${pLit})`);
  }
});

test('Satellite position propagation: closes loop after one orbital period (circular approximation)', () => {
  for (const id of ['io', 'titan', 'triton']) {
    const epoch = 2461202.0;
    const P = 360 / MOON_ELEMENTS[id].nDegPerDay;
    const p0 = moonLocalPosition(id, epoch);
    const p1 = moonLocalPosition(id, epoch + P);
    const r = Math.hypot(p0.x, p0.y, p0.z);
    const d = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    assert.ok(d / r < 0.01, `${id}: periodic closure deviation ${(d / r * 100).toFixed(3)}%`);
  }
});

test('Triton retrograde orbit (normal z-component is negative)', () => {
  assert.ok(moonOrbitNormal('triton').z < 0);
});

test('All satellites: complete physical data with radius > 0', () => {
  for (const id of MOON_IDS) {
    const m = MOON_PHYS[id];
    assert.ok(m && m.radiusKm > 0 && m.gm > 0 && m.nameZh, id);
  }
});

const OBLATE_REFERENCE = {
  jupiter: { a: 71492, b: 66854, f: 0.06487 },
  saturn:  { a: 60268, b: 54364, f: 0.09796 },
  uranus:  { a: 25559, b: 24973, f: 0.02293 },
  neptune: { a: 24764, b: 24341, f: 0.01708 },
};

test('Giant planet radius is equatorial radius paired with oblateness', () => {
  for (const [id, ref] of Object.entries(OBLATE_REFERENCE)) {
    const p = BODIES[id];
    assert.ok(Math.abs(p.radiusKm - ref.a) < 1,
      `${id} radiusKm=${p.radiusKm} is not equatorial radius ${ref.a}`);
    assert.ok(Math.abs(p.oblateness - ref.f) < 1e-4, `${id} oblateness ${p.oblateness} mismatch with standard ${ref.f}`);
    const b = p.radiusKm * (1 - p.oblateness);
    assert.ok(Math.abs(b - ref.b) < 1, `${id} polar radius calculated ${b.toFixed(0)}, expected ${ref.b}`);
  }
});

test('Landable bodies render as true spheres: radiusKm should be volumetric mean radius', () => {
  assert.ok(Math.abs(BODIES.earth.radiusKm - 6371.0) < 1,
    `Earth ${BODIES.earth.radiusKm} should be mean radius 6371`);
  assert.ok(Math.abs(BODIES.mars.radiusKm - 3389.5) < 1, `Mars ${BODIES.mars.radiusKm} should be mean radius 3389.5`);
  assert.ok(Math.abs(BODIES.sun.radiusKm - 695700) < 1);
});

test('Solar activity reaches min/max at empirically observed cycle extrema', () => {
  const jd = (y) => 2451545.0 + (y - 2000) * 365.25;
  assert.ok(solarActivityAt(jd(2008.9)) < 0.08, `2008.9 (SC24 min) activity should be lowest, got ${solarActivityAt(jd(2008.9))}`);
  assert.ok(solarActivityAt(jd(2019.9)) < 0.08, `2019.9 (SC25 min) activity should be lowest`);
  assert.ok(solarActivityAt(jd(2014.3)) > 0.35, `2014.3 (SC24 max) should be significantly higher than min`);
  assert.ok(solarActivityAt(jd(2024.9)) > 0.6, `2024.9 (SC25 max) should approach peak strength`);
  assert.ok(solarActivityAt(jd(2014.3)) < solarActivityAt(jd(2024.9)), 'SC24 should be weaker than SC25');
  assert.ok(solarActivityAt(jd(1958.2)) > solarActivityAt(jd(2024.9)), 'SC19 (strongest recorded) should be strongest');
});

test('Solar activity curve is continuous and bounded across historical epochs', () => {
  const jd = (y) => 2451545.0 + (y - 2000) * 365.25;
  let prev = solarActivityAt(jd(1950));
  let maxJump = 0;
  for (let y = 1950; y <= 2035; y += 0.02) {
    const v = solarActivityAt(jd(y));
    assert.ok(v >= 0.04 && v <= 1.0, `${y.toFixed(2)} activity ${v} out of bounds`);
    maxJump = Math.max(maxJump, Math.abs(v - prev));
    prev = v;
  }
  assert.ok(maxJump < 0.02, `Curve has discontinuities (max jump ${maxJump.toFixed(4)})`);
  assert.ok(solarActivityAt(jd(2014.3)) > 0.35, '2014.3 should be near solar maximum');
  for (const [, , maxV] of SOLAR_CYCLE_EXTREMA) {
    assert.ok(maxV > 60 && maxV <= 210, `Cycle maximum sunspot number ${maxV} outside empirical range`);
  }
});

test('Terrain noise: deterministic (same seed yields same output) and bounded', () => {
  const n1 = makeNoise(hashSeed('moon'));
  const n2 = makeNoise(hashSeed('moon'));
  for (let i = 0; i < 50; i++) {
    const x = Math.sin(i) * 3, y = Math.cos(i * 1.7) * 3, z = Math.sin(i * 0.7) * 3;
    const a = n1.fbm(x, y, z, 5);
    assert.equal(a, n2.fbm(x, y, z, 5));
    assert.ok(a > -1.001 && a < 1.001);
    const r = n1.ridged(x, y, z, 4);
    assert.ok(r >= -0.001 && r <= 1.001);
  }
});

test('Different bodies have distinct terrain signatures (seed isolation)', () => {
  const a = makeNoise(hashSeed('moon')).fbm(1, 2, 3, 5);
  const b = makeNoise(hashSeed('mars')).fbm(1, 2, 3, 5);
  assert.notEqual(a, b);
});

test('Gravity mode: circular orbit radius is stable, velocity conserved; arcade mode decays to zero', async () => {
  const { Ship } = await import('../src/engine/ship.js');
  const GM_E = 3.986004418e5, GM_S = 1.32712440018e11;
  const RE = 6371, ALT = 600, AU = 1.496e8;
  const r0 = RE + ALT;
  const vc = Math.sqrt(GM_E / r0), vE = Math.sqrt(GM_S / AU);
  const idle = {
    dx: 0, dy: 0, wheel: 0, fovWheel: 0, locked: false,
    drag: { active: false, dx: 0, dy: 0 }, pan: { active: false, dx: 0, dy: 0 },
    look: { active: false, dx: 0, dy: 0 }, joystick: { x: 0, y: 0 },
    touchAscend: false, touchDescend: false, touchSprint: false,
    down: () => false, tapped: () => false,
  };
  const run = (gravityMode) => {
    const earth = {
      id: 'earth', posKm: new Float64Array([AU, 0, 0]), radiusKm: RE,
      distSurface: ALT, landable: true, phys: { gm: GM_E, radiusKm: RE },
    };
    const env = { nearest: earth, get: () => earth, baseReady: () => true, phys: () => earth.phys };
    const s = new Ship();
    s.mode = 'fly'; s.gravityMode = gravityMode;
    s.posKm[0] = AU + r0; s.vel.set(0, vE, vc);
    let mn = Infinity, mx = -Infinity, absV = Infinity;
    const dt = 0.1, steps = Math.round(7200 / dt);
    for (let i = 0; i < steps; i++) {
      const th = (i * dt * vE) / AU;
      earth.posKm[0] = AU * Math.cos(th); earth.posKm[1] = AU * Math.sin(th);
      s.update(dt, idle, env);
      mn = Math.min(mn, Math.hypot(s.posKm[0] - earth.posKm[0], s.posKm[1] - earth.posKm[1], s.posKm[2]));
      mx = Math.max(mx, Math.hypot(s.posKm[0] - earth.posKm[0], s.posKm[1] - earth.posKm[1], s.posKm[2]));
      absV = Math.min(absV, s.vel.length());
    }
    return { drift: (mx - mn) / r0, absV };
  };
  const g = run(true), a = run(false);
  assert.ok(g.drift < 0.005, `Gravity mode relative drift ${(g.drift * 100).toFixed(4)}%, should be <0.5%`);
  assert.ok(a.absV < 1, `Arcade mode without thrust should decay to zero, got ${a.absV.toFixed(2)} km/s`);
});

test('Terrain collision: ship is blocked at physical surface rather than mean sphere', async () => {
  const { Ship } = await import('../src/engine/ship.js');
  const THREE = await import('three');
  const R = 1737.4;
  const MOUNTAIN = 5;
  const idle = {
    dx: 0, dy: 0, wheel: 0, fovWheel: 0, locked: false,
    drag: { active: false, dx: 0, dy: 0 }, pan: { active: false, dx: 0, dy: 0 },
    look: { active: false, dx: 0, dy: 0 }, joystick: { x: 0, y: 0 },
    touchAscend: false, touchDescend: false, touchSprint: false,
    down: () => false, tapped: () => false,
  };
  const mkEnv = (withTerrain) => {
    const moon = {
      id: 'moon', posKm: new Float64Array([0, 0, 0]), radiusKm: R,
      distSurface: 1, landable: true, phys: { gm: 4.9028e3, radiusKm: R },
    };
    return {
      nearest: moon, get: () => moon, baseReady: () => true, phys: () => moon.phys,
      getBodyQuat: () => new THREE.Quaternion(),
      heightFn: withTerrain ? () => R + MOUNTAIN : undefined,
    };
  };
  const fly = (withTerrain) => {
    const s = new Ship();
    s.mode = 'fly';
    s.posKm[0] = R + 1; s.vel.set(-0.05, 0, 0);
    for (let i = 0; i < 200; i++) s.update(0.05, idle, mkEnv(withTerrain));
    return Math.hypot(s.posKm[0], s.posKm[1], s.posKm[2]);
  };
  const withT = fly(true), without = fly(false);
  assert.ok(Math.abs(withT - (R + MOUNTAIN + 0.005)) < 0.05,
    `With terrain should stop at ${(R + MOUNTAIN).toFixed(1)} km mountain surface, got ${withT.toFixed(3)}`);
  assert.ok(without < R + MOUNTAIN - 4,
    `Without terrain data stops at mean sphere ${(R + 0.005).toFixed(3)}, got ${without.toFixed(3)}`);
});
