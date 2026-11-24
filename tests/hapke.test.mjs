// Airless body Hapke regolith BRDF physical regression test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HAPKE_PARAMS } from '../src/astro/bodies.js';

/** JS mirror of the Hapke shader implementation in src/scene/planetMaterial.js */
function hapkeShade({ w, B0, h, g }, mu0, mu, ca) {
  const alpha = Math.acos(Math.max(-1, Math.min(1, ca)));
  const B = B0 / (1 + Math.tan(alpha * 0.5) / Math.max(h, 1e-4));
  const denom = 1 + g * g + 2 * g * ca;
  const P = (1 - g * g) / Math.pow(Math.max(denom, 1e-4), 1.5);
  const sq = Math.sqrt(Math.max(1 - w, 1e-4));
  const H0 = (1 + 2 * mu0) / (1 + 2 * mu0 * sq);
  const H1 = (1 + 2 * mu) / (1 + 2 * mu * sq);
  const r = (w / (4 * Math.PI)) * (mu0 / Math.max(mu0 + mu, 1e-4))
    * ((1 + B) * P + H0 * H1 - 1);
  return Math.max(0, Math.min(4, r * Math.PI / Math.max(w, 1e-3)));
}

const atPhase = (p, deg) => {
  const ca = Math.cos(deg * Math.PI / 180);
  return hapkeShade(p, Math.max(ca, 0), 1, ca);
};

test('Opposition surge: steep brightness surge as phase angle approaches 0 deg', () => {
  for (const id of ['moon', 'mercury', 'phobos', 'callisto', 'europa', 'iapetus']) {
    const p = HAPKE_PARAMS[id];
    const r30 = atPhase(p, 0) / atPhase(p, 30);
    const r60 = atPhase(p, 0) / atPhase(p, 60);
    assert.ok(r30 > 1.3, `${id}: 0 deg/30 deg ratio only ${r30.toFixed(2)}, opposition effect too weak`);
    assert.ok(r30 < 4, `${id}: 0 deg/30 deg ratio ${r30.toFixed(2)}, unphysically magnified`);
    assert.ok(r60 > 2.2 && r60 < 12, `${id}: 0 deg/60 deg ratio ${r60.toFixed(2)} outside plausible range`);
  }
});

test('Higher albedo yields weaker opposition surge (dark regolith vs bright ice ordering)', () => {
  const moon = atPhase(HAPKE_PARAMS.moon, 0) / atPhase(HAPKE_PARAMS.moon, 30);
  const enceladus = atPhase(HAPKE_PARAMS.enceladus, 0) / atPhase(HAPKE_PARAMS.enceladus, 30);
  assert.ok(moon > enceladus * 1.5,
    `Dark regolith (Moon ${moon.toFixed(2)}) should exhibit much stronger surge than bright ice (Enceladus ${enceladus.toFixed(2)})`);
  assert.ok(atPhase(HAPKE_PARAMS.moon, 0) < 1.4, 'Full moon brightness should not exceed 1.4x Lambert');
});

test('Phase curve monotonically decreases across 0-90 deg and reaches zero at 90 deg', () => {
  const p = HAPKE_PARAMS.moon;
  const vals = [0, 1, 2, 5, 10, 20, 40, 60, 89].map((d) => atPhase(p, d));
  for (let i = 1; i < vals.length; i++) {
    assert.ok(vals[i] < vals[i - 1], `Brightness must decrease monotonically with increasing phase angle (point ${i})`);
  }
  assert.ok(atPhase(p, 90) < 1e-9, `alpha=90 deg (terminator) must tend to zero, got ${atPhase(p, 90)}`);
});

test('Night side and grazing angle behavior: zero without illumination, zero at grazing', () => {
  const p = HAPKE_PARAMS.moon;
  assert.equal(hapkeShade(p, 0, 1, 1), 0, 'Must be zero when mu0=0 (terminator)');
  assert.equal(hapkeShade(p, -0.5, 1, 1), 0, 'Backlit surface must be zero');
  const graze = hapkeShade(p, 0.02, 1, 0.02);
  assert.ok(graze < 0.05, `Grazing angle brightness ${graze.toFixed(4)} should be near 0`);
});

test('Parameter table covers all airless bodies with values within physical bounds', () => {
  const airless = ['mercury', 'pluto', 'moon', 'phobos', 'deimos', 'io', 'europa', 'ganymede',
    'callisto', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'iapetus', 'miranda',
    'ariel', 'umbriel', 'titania', 'oberon', 'triton', 'charon'];
  for (const id of airless) {
    const p = HAPKE_PARAMS[id];
    assert.ok(p, `${id} missing Hapke parameters`);
    assert.ok(p.w > 0 && p.w < 1, `${id}.w out of bounds: ${p.w}`);
    assert.ok(p.B0 >= 0 && p.B0 < 3, `${id}.B0 out of bounds: ${p.B0}`);
    assert.ok(p.h > 0 && p.h < 0.5, `${id}.h out of bounds: ${p.h}`);
    assert.ok(p.g > -1 && p.g < 0, `${id}.g should be backward scattering (negative): ${p.g}`);
  }
});

test('Shader source correctly implements Hapke functions', () => {
  const src = readFileSync(new URL('../src/scene/planetMaterial.js', import.meta.url), 'utf8');
  for (const frag of ['uHapke', 'uB0', 'uHh', 'uHg',
    '(1.0 + B) * P + H0 * H1 - 1.0',
    'uB0 / (1.0 + tan(alpha * 0.5)',
    '1.0 + gg * gg + 2.0 * gg * ca']) {
    assert.ok(src.includes(frag), `Shader missing: ${frag}`);
  }
  assert.ok(/float shade = max\(ndl, 0\.0\);/.test(src), 'Missing default Lambert shade fallback');
  assert.ok(/vec3 col = albedo \* shade \* uSunI/.test(src), 'Main shading line does not use shade variable');
});
