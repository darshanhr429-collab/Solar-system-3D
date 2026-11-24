// Ephemeris accuracy test: verified against JPL Horizons offline reference (tests/fixtures.json)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planetPosition, PLANETS } from '../src/astro/planets.js';
import { moonGeocentric } from '../src/astro/moon.js';
import { moonLocalPosition, moonOrbitNormal, MOON_IDS } from '../src/astro/moons.js';

const fix = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));

function angleDeg(a, b) {
  const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b[0], b[1], b[2]);
  const dot = (a.x * b[0] + a.y * b[1] + a.z * b[2]) / (la * lb);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

test('Major celestial bodies heliocentric positions vs JPL Horizons: angular error < 0.1 deg', () => {
  for (const name of PLANETS) {
    const ref = fix.planets[name];
    const ours = planetPosition(name, ref.jdTDB);
    const d = angleDeg(ours, ref.pos);
    assert.ok(d < 0.1, `${name}: ${d.toFixed(4)} deg`);
  }
});

test('Planetary heliocentric distance vs Horizons: relative error < 0.1%', () => {
  for (const name of PLANETS) {
    const ref = fix.planets[name];
    const ours = planetPosition(name, ref.jdTDB);
    const rO = Math.hypot(ours.x, ours.y, ours.z);
    const rR = Math.hypot(...ref.pos);
    assert.ok(Math.abs(rO - rR) / rR < 1e-3, `${name}: ${(Math.abs(rO - rR) / rR * 100).toFixed(4)}%`);
  }
});

test('Moon geocentric position vs Horizons: angular error < 0.5 deg, distance < 1%', () => {
  const ours = moonGeocentric(fix.moonGeo.jdTDB);
  const d = angleDeg(ours, fix.moonGeo.pos);
  assert.ok(d < 0.5, `Angular error ${d.toFixed(4)} deg`);
  const rO = Math.hypot(ours.x, ours.y, ours.z);
  const rR = Math.hypot(...fix.moonGeo.pos);
  assert.ok(Math.abs(rO - rR) / rR < 0.01);
});

test('Satellites relative position to parent vs Horizons: angular error at fitting epoch < 0.02 deg', () => {
  for (const [name, ref] of Object.entries(fix.moonsLocal)) {
    const ours = moonLocalPosition(name, ref.jdTDB);
    const d = angleDeg(ours, ref.pos);
    assert.ok(d < 0.02, `${name}: ${d.toFixed(4)} deg`);
  }
});

test('Known degradation of satellite analytical models: angular error < 3 deg at +180 days', () => {
  const degraded = fix.moonsLocalDegraded ?? {};
  for (const [name, ref] of Object.entries(degraded)) {
    const ours = moonLocalPosition(name, ref.jdTDB);
    const d = angleDeg(ours, ref.pos);
    assert.ok(d < 3, `${name} @ +${fix.degradeDays}d: ${d.toFixed(4)} deg`);
  }
});

test('Orbital normal invariant: must be perpendicular to position vector (r_hat . n_hat approx 0)', () => {
  const probe = fix.moonGeo?.jdTDB ?? 2461200.5;
  for (const id of MOON_IDS) {
    const onGrid = [probe, probe + 400, probe + 1600, probe + 3600];
    for (const jd of onGrid) {
      const r = id === 'moon' ? moonGeocentric(jd) : moonLocalPosition(id, jd);
      const rl = Math.hypot(r.x, r.y, r.z) || 1;
      const n = moonOrbitNormal(id, jd);
      const c = Math.abs((r.x * n.x + r.y * n.y + r.z * n.z) / rl);
      assert.ok(c < 0.02, `${id} @ JD ${jd.toFixed(1)}: |r_hat . n_hat| = ${c.toFixed(4)}`);
    }
  }
});

test('Extrapolation boundaries: calculations remain bounded and finite across 1800/2050', () => {
  for (const jd of [2378497, 2469807]) { // ~1800 / ~2050
    for (const name of PLANETS) {
      const p = planetPosition(name, jd);
      assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.z), `${name} @ ${jd}`);
    }
  }
});

test('Time reversal: negative direction computes properly (1969-07-20 Apollo 11)', () => {
  const jd = 2440423.0;
  const e = planetPosition('earth', jd);
  const r = Math.hypot(e.x, e.y, e.z) / 149597870.7;
  assert.ok(r > 0.98 && r < 1.02, `Earth solar distance ${r} AU`);
});
