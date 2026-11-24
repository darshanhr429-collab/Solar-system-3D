// Time system: UTC -> Julian Date -> Terrestrial Time (TT), plus simulation clock with variable rate, pause, and history navigation.
// Ephemerides strictly use jdTT (Julian Date in TT).

export const J2000 = 2451545.0;
export const DAY_SECONDS = 86400;

/** UTC Date -> Julian Date (UT). Date.getTime is based on Unix epoch 1970-01-01T00:00Z = JD 2440587.5 */
export function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function jdToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

/**
 * Delta T = TT - UT1 (seconds), handled across three regimes:
 *
 *   1) Post-1972: Leap seconds table + 32.184s constant offset.
 *      TT - UT1 = (32.184 + TAI - UTC) - (UT1 - UTC), with |UT1 - UTC| < 0.9s.
 *      Error <= 0.9s (Moon position <= 0.5", Earth rotation <= 0.004 deg).
 *      Bounded approximation.
 *
 *   2) Pre-1972: Espenak & Meeus piecewise polynomials across historical epochs.
 *      Accurate over historical range: avoids massive offsets on historical dates.
 *      Essential for realistic historical sky observation.
 *      Polynomial segments calibrated to historical eclipse and occultation records.
 *
 *   3) Future: Extrapolations beyond leap second table.
 *      Short-term remains stable near ~69.2s.
 *      Converges smoothly to Espenak long-term parabola after 2150.
 *      Prevents unbounded constant drift over centuries.
 *      Append new entries to steps array when leap seconds are announced.
 */
const LEAP_SECONDS = (() => {
  // [UTC effective date, TAI - UTC]
  const steps = [
    ['1972-01-01', 10], ['1972-07-01', 11], ['1973-01-01', 12], ['1974-01-01', 13],
    ['1975-01-01', 14], ['1976-01-01', 15], ['1977-01-01', 16], ['1978-01-01', 17],
    ['1979-01-01', 18], ['1980-01-01', 19], ['1981-07-01', 20], ['1982-07-01', 21],
    ['1983-07-01', 22], ['1985-07-01', 23], ['1988-01-01', 24], ['1990-01-01', 25],
    ['1991-01-01', 26], ['1992-07-01', 27], ['1993-07-01', 28], ['1994-07-01', 29],
    ['1996-01-01', 30], ['1997-07-01', 31], ['1999-01-01', 32], ['2006-01-01', 33],
    ['2009-01-01', 34], ['2012-07-01', 35], ['2015-07-01', 36], ['2017-01-01', 37],
  ];
  return steps.map(([d, v]) => [dateToJD(new Date(d + 'T00:00:00Z')), v]);
})();

/** Horner polynomial evaluation, coefficients starting from constant term */
function poly(t, coeffs) {
  let r = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) r = r * t + coeffs[i];
  return r;
}

/**
 * Espenak & Meeus piecewise polynomials. Each entry: [startYear (inclusive), coefficients, zeroYear, variableScale],
 * where t = (year - zeroYear) / variableScale.
 * Sequential lookup: finds last segment with startYear <= year.
 */
const DELTA_T_SEGMENTS = [
  [-Infinity, [-20, 0, 32], 1820, 100],                              // u = (y−1820)/100
  [-500, [10583.6, -1014.41, 33.78311, -5.952053, -0.1798452,
    0.022174192, 0.0090316521], 0, 100],                             // u = y/100
  [500, [1574.2, -556.01, 71.23472, 0.319781, -0.8503463,
    -0.005050998, 0.0083572073], 1000, 100],                         // u = (y−1000)/100
  [1600, [120, -0.9808, -0.01532, 1 / 7129], 1600, 1],
  [1700, [8.83, 0.1603, -0.0059285, 0.00013336, -1 / 1174000], 1700, 1],
  [1800, [13.72, -0.332447, 0.0068612, 0.0041116, -0.00037436,
    0.0000121272, -0.0000001699, 0.000000000875], 1800, 1],
  [1860, [7.62, 0.5737, -0.251754, 0.01680668, -0.0004473624, 1 / 233174], 1860, 1],
  [1900, [-2.79, 1.494119, -0.0598939, 0.0061966, -0.000197], 1900, 1],
  [1920, [21.20, 0.84493, -0.076100, 0.0020936], 1920, 1],
  [1941, [29.07, 0.407, -1 / 233, 1 / 2547], 1950, 1],
  [1961, [45.45, 1.067, -1 / 260, -1 / 718], 1975, 1],
];

function deltaTBefore1972(year) {
  let seg = DELTA_T_SEGMENTS[0];
  for (const s of DELTA_T_SEGMENTS) if (year >= s[0]) seg = s;
  return poly((year - seg[2]) / seg[3], seg[1]);
}

/** Future projection beyond leap second table: flat through ~2035 then smoothly transitions to parabola */
const LEAP_TAIL_YEAR = 2017;
const DELTA_T_DRIFT_FROM = 2035;
const DELTA_T_LONG_TERM_YEAR = 2150;

function deltaTAfterLeapTable(year, exact) {
  if (year <= DELTA_T_DRIFT_FROM) return exact;
  const u = (year - 1820) / 100;
  const longTerm = -20 + 32 * u * u;
  const k = Math.min(1, (year - DELTA_T_DRIFT_FROM) / (DELTA_T_LONG_TERM_YEAR - DELTA_T_DRIFT_FROM));
  return exact + (longTerm - exact) * k * k;
}

export function deltaT(jd) {
  const year = 2000 + (jd - J2000) / 365.25;
  if (jd < LEAP_SECONDS[0][0]) return deltaTBefore1972(year);
  // Step function lookup: take last leap second entry not later than jd
  let taiUtc = LEAP_SECONDS[0][1];
  for (const [jdStart, v] of LEAP_SECONDS) {
    if (jd >= jdStart) taiUtc = v; else break;
  }
  const exact = 32.184 + taiUtc;
  return jd >= LEAP_SECONDS[LEAP_SECONDS.length - 1][0]
    ? deltaTAfterLeapTable(year, exact)
    : exact;
}

/** Current Delta T uncertainty (seconds) for HUD confidence indicators */
export function deltaTUncertainty(jd) {
  const year = 2000 + (jd - J2000) / 365.25;
  if (jd < LEAP_SECONDS[0][0]) return 2.5;                    // Polynomial fit: ~1-2s uncertainty
  if (year <= DELTA_T_DRIFT_FROM) return 0.9;                 // Upper bound of |UT1 - UTC|
  const k = Math.min(1, (year - DELTA_T_DRIFT_FROM) / (DELTA_T_LONG_TERM_YEAR - DELTA_T_DRIFT_FROM));
  return 0.9 + 150 * k * k;                                   // Far future projection uncertainty
}

/** UT Julian Date -> TT Julian Date */
export function jdUTtoTT(jdUT) {
  return jdUT + deltaT(jdUT) / DAY_SECONDS;
}

/** Julian centuries from J2000 */
export function centuriesTT(jdTT) {
  return (jdTT - J2000) / 36525;
}

/** Simulation clock: advances in TT Julian days with variable rate, pause, and now sync */
export class SimClock {
  constructor() {
    this._rate = 1;       // Current rate (smoothed actual value)
    this._rateTarget = 1; // Target rate (UI changes this, _rate exponentially approaches it)
    this.paused = false;
    this._wallMs = Date.now();
    this._lagSec = 0;     // Accumulated simulation seconds from background sleep (catch-up pool)
    this.setNow();
  }

  /** Current rate. Direct assignment instantly switches rate and resets target */
  get rate() { return this._rate; }
  set rate(v) { this._rate = v; this._rateTarget = v; }
  /** Target rate: set by UI, smoothly approached by actual rate */
  get rateTarget() { return this._rateTarget; }
  set rateTarget(v) { this._rateTarget = v; }

  setNow() {
    this.jdTT = jdUTtoTT(dateToJD(new Date()));
    this._wallMs = Date.now();
    this._lagSec = 0;
  }

  /** Jump to specified TT Julian date (for bookmarks, tours, classroom sync) */
  set(jdTT) {
    this.jdTT = jdTT;
    this._wallMs = Date.now();
    this._lagSec = 0;
  }

  /**
   * Advances simulation clock: approaches rateTarget smoothly (tau ~ 0.12s).
   * If wallElapsed exceeds dtReal by > 1s (background tab, sleep recovery), difference enters catch-up pool
   * and drains rapidly at min(1000x, rate*2) rather than teleporting.
   */
  tick(dtReal) {
    const nowMs = Date.now();
    const k = 1 - Math.exp(-Math.max(dtReal, 0) / 0.12);
    this._rate += (this._rateTarget - this._rate) * k; // Update directly to avoid setter resetting target
    if (!this.paused) {
      const wallElapsed = (nowMs - this._wallMs) / 1000;
      if (wallElapsed > dtReal + 1) {
        this._lagSec += Math.max(0, wallElapsed - dtReal) * this._rate;
      }
      let adv = dtReal * this._rate;
      if (this._lagSec !== 0) {
        const cap = dtReal * Math.max(1000, Math.abs(this._rate) * 2);
        const bleed = Math.abs(this._lagSec) > cap ? Math.sign(this._lagSec) * cap : this._lagSec;
        adv += bleed;
        this._lagSec -= bleed;
      }
      this.jdTT += adv / DAY_SECONDS;
    } else {
      this._lagSec = 0;
    }
    this._wallMs = nowMs;
    return this.jdTT;
  }

  /** UTC Date corresponding to current simulation time (for HUD display) */
  toDate() {
    const jdUT = this.jdTT - deltaT(this.jdTT) / DAY_SECONDS;
    return jdToDate(jdUT);
  }

  /** Ephemeris validity indicator: Standish elements nominal range 1800-2050 AD */
  inHighAccuracyRange() {
    const year = 2000 + (this.jdTT - J2000) / 365.25;
    return year >= 1800 && year <= 2050;
  }
}
