// Planetary rotation models: subsolar point (terminator line) and spin axis orientation
import test from 'node:test';
import assert from 'node:assert/strict';
import { subsolarPoint, poleEcliptic, bodyToEclipticMatrix } from '../src/astro/rotation.js';
import { planetPosition } from '../src/astro/planets.js';
import { dateToJD, jdUTtoTT } from '../src/astro/time.js';

function sunDirFrom(name, jdTT) {
  const p = planetPosition(name, jdTT);
  const d = Math.hypot(p.x, p.y, p.z);
  return { x: -p.x / d, y: -p.y / d, z: -p.z / d };
}

test('Earth subsolar point longitude: near 0 deg at 12:00 UTC (error < 4 deg)', () => {
  const jdTT = jdUTtoTT(dateToJD(new Date('2026-06-10T12:00:00Z')));
  const sp = subsolarPoint('earth', jdTT, sunDirFrom('earth', jdTT));
  const lonErr = Math.abs(((sp.lon + 180) % 360 + 360) % 360 - 180);
  assert.ok(lonErr < 4, `Subsolar longitude ${sp.lon.toFixed(2)} deg (expected ~0 deg)`);
});

test('Earth subsolar point latitude: June ≈ +23 deg (around northern summer solstice)', () => {
  const jdTT = jdUTtoTT(dateToJD(new Date('2026-06-21T12:00:00Z')));
  const sp = subsolarPoint('earth', jdTT, sunDirFrom('earth', jdTT));
  assert.ok(Math.abs(sp.lat - 23.4) < 0.5, `Subsolar latitude ${sp.lat.toFixed(2)} deg`);
});

test('Earth subsolar point longitude advances with UTC: 18:00 UTC ≈ 90 deg W', () => {
  const jdTT = jdUTtoTT(dateToJD(new Date('2026-06-10T18:00:00Z')));
  const sp = subsolarPoint('earth', jdTT, sunDirFrom('earth', jdTT));
  assert.ok(Math.abs(sp.lon + 90) < 4, `Subsolar longitude ${sp.lon.toFixed(2)} deg (expected ~-90 deg)`);
});

test('Earth polar axis vs ecliptic north pole angle = 23.4 deg (obliquity of ecliptic)', () => {
  const jdTT = 2461202.0;
  const p = poleEcliptic('earth', jdTT);
  const tilt = (Math.acos(p.z) * 180) / Math.PI;
  assert.ok(Math.abs(tilt - 23.44) < 0.1, `Axial tilt ${tilt.toFixed(2)} deg`);
});

test('Uranus sideways rotation: IAU north pole tilt ~82.2 deg with retrograde rotation', () => {
  const p = poleEcliptic('uranus', 2461202.0);
  const tilt = (Math.acos(p.z) * 180) / Math.PI;
  assert.ok(Math.abs(tilt - 82.2) < 1.5, `IAU north pole tilt ${tilt.toFixed(2)} deg`);
});

test('Uranus and Venus: W rate is negative (retrograde rotation)', async () => {
  const { IAU_ROTATION } = await import('../src/astro/rotation.js');
  assert.ok(IAU_ROTATION.uranus[5] < 0);
  assert.ok(IAU_ROTATION.venus[5] < 0);
});

test('Body-fixed to ecliptic transformation matrix is orthogonal (determinant = +1)', () => {
  const jdTT = 2461202.0;
  for (const name of ['earth', 'mars', 'jupiter', 'uranus']) {
    const m = bodyToEclipticMatrix(name, jdTT);
    const det =
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[1] * (m[3] * m[8] - m[5] * m[6]) +
      m[2] * (m[3] * m[7] - m[4] * m[6]);
    assert.ok(Math.abs(det - 1) < 1e-4, `${name} det=${det}`);
  }
});

test('Rotation propagation: Earth prime meridian returns after 1 sidereal day', () => {
  const jd0 = 2461202.0;
  const p0 = subsolarPoint('earth', jd0, { x: 1, y: 0, z: 0 });
  const p1 = subsolarPoint('earth', jd0 + 0.99726968, { x: 1, y: 0, z: 0 });
  const d = Math.abs(((p1.lon - p0.lon + 180) % 360 + 360) % 360 - 180);
  assert.ok(d < 0.1, `Prime meridian drift ${d.toFixed(3)} deg after 1 sidereal day`);
});
