// Solar activity cycle: interpolated from *measured* historical cycle extrema tables rather than a simple sine from J2000.
//
// Older implementations used 0.5 + 0.3*sin((jd - J2000)/(365.25*11)*2pi). While period length was similar,
// the phase differed by 3-4 years from real solar cycles: placing maxima at 2005.5 / 2016.5 / 2027.5,
// whereas actual Cycle 23 peaked in 2000.3, Cycle 24 in 2014.3, Cycle 25 in 2024.9.
// Activity modulates auroral intensity and corona; accurate phase is essential for realism.
// Realistic solar system simulation requires accurate cycle phase.
//
// Data source: SILSO / NOAA 13-month smoothed sunspot numbers (cycle minimum year, maximum year, peak value).

/** [minimum year, maximum year, 13-month smoothed sunspot number at maximum] */
const CYCLES = [
  [1933.7, 1937.4, 119.2],
  [1944.0, 1947.4, 151.8],
  [1954.2, 1958.2, 201.3],   // Strongest recorded cycle
  [1964.9, 1968.9, 110.6],
  [1976.5, 1979.9, 164.5],
  [1986.8, 1989.6, 158.5],
  [1996.4, 2000.3, 120.8],
  [2008.9, 2014.3, 81.9],    // Weakest cycle in a century
  [2019.9, 2024.9, 144.0],
];
/** Normalization baseline: maximum value of the strongest recorded cycle */
const REFERENCE_MAX = 201.3;
/** Forecasted year of the next minimum (Cycle 26) - used as tail boundary beyond observations */
const NEXT_MIN_YEAR = 2030.5;

/** Convert calendar year to 'Julian years from J2000' to align with simulation clock */
const J2000_YEAR = 2000.0;

/**
 * Solar activity strength 0..1 (relative to the maximum of the strongest recorded cycle).
 *
 * Both rise and decay phases use cosine interpolation - the standard empirical solar cycle shape:
 * flat near minima and maxima, steepest at mid-cycle.
 *
 * @param {number} jdTT Julian Date in TT
 */
export function solarActivityAt(jdTT) {
  const year = J2000_YEAR + (jdTT - 2451545.0) / 365.25;
  if (year <= CYCLES[0][0]) return 0.05;
  for (let i = 0; i < CYCLES.length; i++) {
    const [minY, maxY, maxV] = CYCLES[i];
    const peak = maxV / REFERENCE_MAX;
    if (year < minY) continue;
    if (year <= maxY) {
      // Ascending phase: minimum -> maximum
      const u = (year - minY) / Math.max(maxY - minY, 0.1);
      return 0.05 + (peak - 0.05) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
    const nextMinY = i + 1 < CYCLES.length ? CYCLES[i + 1][0] : NEXT_MIN_YEAR;
    if (year <= nextMinY) {
      // Descending phase: maximum -> next minimum
      const u = (year - maxY) / Math.max(nextMinY - maxY, 0.1);
      return 0.05 + (peak - 0.05) * (0.5 + 0.5 * Math.cos(Math.PI * u));
    }
  }
  return 0.05;
}

/** For testing and diagnostics: read-only copy of cycle extrema table */
export const SOLAR_CYCLE_EXTREMA = CYCLES.map((c) => [...c]);
