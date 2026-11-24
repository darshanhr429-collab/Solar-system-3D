// Geometric ecliptic J2000 states, km / km/s. Data is optional and fetched by
// the engine; the astronomy hot path never starts network work or waits.
//
// Sharding (from format 2): a target can load multiple time slices sharded by year,
// and sampledState locates the slice covering the current simulation timestamp.
//
// Two sample precisions with identical interpolation:
//   format 1: float64, 48 B/sample - planets, TNOs, comets, spacecraft (heliocentric vectors up to 10^10 km)
//   format 2: float32, 24 B/sample - moons (vectors relative to parent planet 10^4-10^6 km, quantization error < 0.3 km)
const HEADER_BYTES = 32;
const COMPONENTS = 6;              // x, y, z, vx, vy, vz
const UNIT_BYTES = { 1: 8, 2: 4 };

/** id -> array of time slices sorted in ascending order by start */
const shards = new Map();

function parseShard(id, buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength <= HEADER_BYTES) {
    throw new Error(`Invalid ephemeris buffer: ${id}`);
  }
  const view = new DataView(buffer);
  const start = view.getFloat64(0, true), step = view.getFloat64(8, true);
  const count = view.getFloat64(16, true), format = view.getFloat64(24, true);
  const unit = UNIT_BYTES[format];
  if (!unit) throw new Error(`Unknown ephemeris format ${format}: ${id}`);
  if (!Number.isFinite(start) || !Number.isFinite(step) || !(step > 0)) {
    throw new Error(`Invalid ephemeris header: ${id}`);
  }
  if (!Number.isInteger(count) || count < 2
      || buffer.byteLength !== HEADER_BYTES + count * COMPONENTS * unit) {
    throw new Error(`Invalid ephemeris length: ${id}`);
  }
  const states = format === 2
    ? new Float32Array(count * COMPONENTS)
    : new Float64Array(count * COMPONENTS);
  for (let i = 0; i < states.length; i++) {
    const value = format === 2
      ? view.getFloat32(HEADER_BYTES + i * 4, true)
      : view.getFloat64(HEADER_BYTES + i * 8, true);
    if (!Number.isFinite(value)) throw new Error(`Non-finite ephemeris state: ${id}`);
    states[i] = value;
  }
  return { start, step, count, states, end: start + step * (count - 1) };
}

export function installEphemeris(id, buffer) {
  const shard = parseShard(id, buffer);
  const list = shards.get(id) ?? [];
  const at = list.findIndex((s) => Math.abs(s.start - shard.start) < 1e-6);
  if (at >= 0) list[at] = shard; else list.push(shard);
  list.sort((a, b) => a.start - b.start);
  shards.set(id, list);
}

/** Coverage interval: union of multiple slices; step taken from first slice (display/validation only) */
export function ephemerisCoverage(id) {
  const list = shards.get(id);
  if (!list?.length) return null;
  return {
    start: list[0].start, end: list[list.length - 1].end,
    step: list[0].step, shards: list.length,
  };
}

/** Number of loaded time slices (for testing and diagnostics) */
export function ephemerisShardCount(id) {
  return shards.get(id)?.length ?? 0;
}

/**
 * Check whether the timestamp is truly covered by loaded ephemeris data.
 * Cannot simply test union coverage: shards may be loaded non-consecutively,
 * in which case a gap in between would incorrectly report as covered.
 * Verifies true sample coverage.
 */
export function ephemerisCovers(id, jd) {
  return shardAt(id, jd) !== null;
}

/**
 * Clear loaded ephemeris data (for testing; not called at runtime).
 * Passing an id clears only that target;
 * preserves loaded shards across unrelated bodies.
 */
export function resetEphemeris(id) {
  if (id === undefined) shards.clear(); else shards.delete(id);
}

function shardAt(id, jd) {
  const list = shards.get(id);
  if (!list) return null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (jd >= s.start && jd <= s.end) return s;
  }
  return null;
}

/** Cubic Hermite interpolation uses actual velocities, not a straight chord.
 * No extrapolation beyond measured samples: the caller retains its analytic model. */
export function sampledState(id, jd) {
  if (!Number.isFinite(jd)) return null;
  const s = shardAt(id, jd);
  if (!s) return null;
  const t = (jd - s.start) / s.step;
  const k = Math.min(Math.floor(t), s.count - 2), u = t - k, u2 = u * u, u3 = u2 * u;
  const a = 2 * u3 - 3 * u2 + 1, b = u3 - 2 * u2 + u;
  const c = -2 * u3 + 3 * u2, d = u3 - u2;
  const seconds = s.step * 86400, states = s.states, first = k * 6, next = first + 6;
  const position = [], velocity = [];
  for (let i = 0; i < 3; i++) {
    position[i] = a * states[first + i] + b * seconds * states[first + i + 3]
      + c * states[next + i] + d * seconds * states[next + i + 3];
    velocity[i] = ((6 * u2 - 6 * u) * states[first + i] + (-6 * u2 + 6 * u) * states[next + i]) / seconds
      + (3 * u2 - 4 * u + 1) * states[first + i + 3] + (3 * u2 - 2 * u) * states[next + i + 3];
  }
  return { x: position[0], y: position[1], z: position[2], vx: velocity[0], vy: velocity[1], vz: velocity[2] };
}

export function sampledPosition(id, jd) {
  const state = sampledState(id, jd);
  return state ? { x: state.x, y: state.y, z: state.z } : null;
}
