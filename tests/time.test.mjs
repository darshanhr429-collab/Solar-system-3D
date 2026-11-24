// Time system tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { dateToJD, jdToDate, deltaT, deltaTUncertainty, jdUTtoTT, SimClock, J2000 } from '../src/astro/time.js';

/** JD for Jan 1 of a given year. Note that Date.UTC treats 0-99 as 1900+, so explicitly call setUTCFullYear. */
function jdOfYear(year) {
  const d = new Date(Date.UTC(2000, 0, 1));
  d.setUTCFullYear(year, 0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return dateToJD(d);
}

test('J2000 epoch: 2000-01-01T12:00Z -> JD 2451545.0', () => {
  assert.ok(Math.abs(dateToJD(new Date('2000-01-01T12:00:00Z')) - J2000) < 1e-9);
});

test('JD round-trip conversion consistency', () => {
  const d = new Date('2026-06-10T08:30:00Z');
  assert.ok(Math.abs(jdToDate(dateToJD(d)).getTime() - d.getTime()) < 2);
});

test('Delta-T is ~69-71 seconds in 2026', () => {
  const dt = deltaT(dateToJD(new Date('2026-06-10T00:00:00Z')));
  assert.ok(dt > 67 && dt < 73, `Delta-T=${dt}`);
});

test('TT > UT (Terrestrial Time leads Universal Time)', () => {
  const jd = dateToJD(new Date());
  assert.ok(jdUTtoTT(jd) > jd);
});

test('SimClock: time rate advance and pause', () => {
  const c = new SimClock();
  const jd0 = c.jdTT;
  c.rate = 86400; // 1 day/sec
  c.tick(1);
  assert.ok(Math.abs(c.jdTT - jd0 - 1) < 1e-9, '1 sec advances 1 day');
  c.paused = true;
  c.tick(100);
  assert.ok(Math.abs(c.jdTT - jd0 - 1) < 1e-9, 'paused clock does not advance');
  c.paused = false;
  c.rate = -86400;
  c.tick(2);
  assert.ok(Math.abs(c.jdTT - jd0 + 1) < 1e-9, 'negative rate moves backwards');
});

test('SimClock.setNow approximates system time', () => {
  const c = new SimClock();
  const now = jdUTtoTT(dateToJD(new Date()));
  assert.ok(Math.abs(c.jdTT - now) < 1e-5);
});

test('SimClock: catchup pool empties rapidly after background/sleep recovery without teleporting', () => {
  const c = new SimClock();
  c.rate = 1; // Real-time
  const jd0 = c.jdTT;
  // Simulate system sleep of 2 hours (_wallMs rewinds)
  c._wallMs -= 2 * 3600 * 1000;
  c.tick(0);
  // Initial frame dtReal=0 does not advance, difference enters catchup pool
  assert.ok(Math.abs(c.jdTT - jd0) < 1e-12, 'initial recovery frame should not teleport');
  // Successive frames drain catchup pool at <=1000x, ultimately matching 2 hours
  for (let i = 0; i < 20; i++) c.tick(1);
  const expected = jd0 + (2 * 3600) / 86400 + 20 / 86400; // catch up 2h + 20 frames at 1s real-time each
  assert.ok(Math.abs(c.jdTT - expected) < 1e-6, `catchup should accurately match elapsed time, diff ${(c.jdTT - expected) * 86400}s`);
});

test('SimClock: does not catch up wall-clock time when paused', () => {
  const c = new SimClock();
  c.rate = 86400;
  c.paused = true;
  const jd0 = c.jdTT;
  c._wallMs -= 3600 * 1000;
  c.tick(0);
  assert.ok(Math.abs(c.jdTT - jd0) < 1e-9, 'should not advance while paused');
});

test('Ephemeris validity range evaluation', () => {
  const c = new SimClock();
  assert.equal(c.inHighAccuracyRange(), true);
  c.jdTT = J2000 + 80 * 365.25; // Year 2080
  assert.equal(c.inHighAccuracyRange(), false);
});

// -- Delta-T regression: historical lookup previously used a single polynomial valid only in 2005-2050 --
// Literature values from Espenak & Meeus piecewise polynomials and IERS measurements (Delta-T = TT - UT1, in seconds).
test('Delta-T historical values: error < 1 s vs literature after year 1600', () => {
  const REF = {
    1600: 120, 1700: 9, 1800: 13.7, 1850: 7.1, 1900: -2.79, 1920: 21.2,
    1950: 29.15, 1960: 33.15, 1970: 40.18, 1980: 50.54, 2000: 63.83,
    2010: 66.07, 2020: 69.36, 2026: 69.2,
  };
  for (const [y, expected] of Object.entries(REF)) {
    const got = deltaT(jdOfYear(Number(y)));
    assert.ok(Math.abs(got - expected) < 1,
      `Year ${y} Delta-T=${got.toFixed(2)}, literature ${expected}, diff ${(got - expected).toFixed(2)}s`);
  }
});

test('Delta-T historical values: pre-fix 2005-2050 formula caused hundreds of seconds deviation (regression guard)', () => {
  // Legacy implementation applied 62.92 + 0.32217t + 0.005589t^2 for all jd < 1972
  const legacy = (year) => { const t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; };
  assert.ok(legacy(1800) - deltaT(jdOfYear(1800)) > 200, 'Year 1800 should eliminate >200s bias');
  assert.ok(legacy(1900) - deltaT(jdOfYear(1900)) > 80, 'Year 1900 should eliminate >80s bias');
  // Earth rotation amplification of Delta-T error: 1 s error in Delta-T ~= 360/86164 degrees in longitude
  const rotDeg = (legacy(1800) - deltaT(jdOfYear(1800))) * 360 / 86164;
  assert.ok(rotDeg > 0.8, `Year 1800 Earth rotation position previously deviated by ${rotDeg.toFixed(2)} deg, expected > 0.8 deg`);
});

test('Delta-T piecewise continuity at 1972 boundary (leap second table joins polynomial)', () => {
  const before = deltaT(jdOfYear(1972) - 1);
  const after = deltaT(jdOfYear(1972));
  assert.ok(Math.abs(before - after) < 0.2, `boundary jump ${Math.abs(before - after).toFixed(3)}s`);
});

test('Delta-T has no spurious discontinuities (daily scan 1800-2150)', () => {
  // Delta-T itself is neither monotonic nor smooth: Earth rotation sped up in the 19th century, decreasing ~1 s/yr around 1867.
  // The invariant to enforce is no spurious discontinuity: day-to-day jumps are only permitted from
  // 1) leap seconds (+1 s integer) or 2) piecewise polynomial seams (< 0.1 s).
  const jd0 = jdOfYear(1800), jd1 = jdOfYear(2150);
  let prev = deltaT(jd0), worst = 0, worstAt = jd0;
  for (let jd = jd0 + 1; jd <= jd1; jd += 1) {
    const v = deltaT(jd);
    const d = v - prev;
    if (d < -0.1 || d > 1.05) { worst = d; worstAt = jd; break; }
    if (Math.abs(d) > Math.abs(worst)) { worst = d; worstAt = jd; }
    prev = v;
  }
  assert.ok(worst >= -0.1 && worst <= 1.05,
    `JD ${worstAt} (${jdToDate(worstAt).toISOString().slice(0, 10)}) spurious jump ${worst.toFixed(3)}s`);
});

test('Delta-T long-term extrapolation is bounded and converges to long-term parabola', () => {
  const u = (2150 - 1820) / 100;
  // jdOfYear(2150) corresponds to Julian year 2149.998, allow 2s margin
  assert.ok(Math.abs(deltaT(jdOfYear(2150)) - (-20 + 32 * u * u)) < 2);
  // Constant extrapolation in 2100 would underestimate by tens of seconds; now should be significantly above 69.184
  assert.ok(deltaT(jdOfYear(2100)) > 100, `Year 2100 Delta-T=${deltaT(jdOfYear(2100)).toFixed(1)}, constant extrapolation gives 69.184`);
});

test('Delta-T uncertainty: bounded in modern era, explicitly magnified in distant future', () => {
  assert.ok(deltaTUncertainty(jdOfYear(2026)) <= 1);
  assert.ok(deltaTUncertainty(jdOfYear(1900)) < 5);
  assert.ok(deltaTUncertainty(jdOfYear(2100)) > 10, 'distant future must be flagged as low confidence');
});
