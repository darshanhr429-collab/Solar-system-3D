// Kepler solver and orbital geometry unit tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveKepler, elementsToEcliptic, wrap360, KM_PER_AU } from '../src/astro/kepler.js';

test('Kepler equation: converges across all eccentricities and satisfies M = E - e*sin(E)', () => {
  for (const e of [0, 0.0167, 0.2, 0.5, 0.8, 0.93, 0.967, 0.97]) {
    for (let i = 0; i <= 24; i++) {
      const M = -Math.PI + (i / 24) * 2 * Math.PI;
      const E = solveKepler(M, e);
      const M2 = E - e * Math.sin(E);
      const diff = Math.atan2(Math.sin(M2 - M), Math.cos(M2 - M));
      assert.ok(Math.abs(diff) < 1e-9, `e=${e} M=${M}: residual ${diff}`);
    }
  }
});

test('Circular orbit: position radius equals semi-major axis a', () => {
  for (let L = 0; L < 360; L += 45) {
    const p = elementsToEcliptic({ aAU: 1, e: 0, iDeg: 0, LDeg: L, periDeg: 0, nodeDeg: 0 });
    const r = Math.hypot(p.x, p.y, p.z);
    assert.ok(Math.abs(r - KM_PER_AU) < 1, `L=${L}: r=${r}`);
  }
});

test('Elliptical orbit: perihelion/aphelion distance = a(1∓e)', () => {
  const a = 5.2, e = 0.3;
  const peri = elementsToEcliptic({ aAU: a, e, iDeg: 10, LDeg: 40, periDeg: 40, nodeDeg: 70 });
  const apo = elementsToEcliptic({ aAU: a, e, iDeg: 10, LDeg: 220, periDeg: 40, nodeDeg: 70 });
  assert.ok(Math.abs(Math.hypot(peri.x, peri.y, peri.z) / KM_PER_AU - a * (1 - e)) < 1e-9);
  assert.ok(Math.abs(Math.hypot(apo.x, apo.y, apo.z) / KM_PER_AU - a * (1 + e)) < 1e-9);
});

test('Zero inclination orbit lies within ecliptic plane', () => {
  const p = elementsToEcliptic({ aAU: 2, e: 0.1, iDeg: 0, LDeg: 123, periDeg: 11, nodeDeg: 0 });
  assert.ok(Math.abs(p.z) < 1e-6);
});

test('wrap360 normalization', () => {
  assert.equal(wrap360(370), 10);
  assert.equal(wrap360(-10), 350);
  assert.equal(wrap360(0), 0);
});
