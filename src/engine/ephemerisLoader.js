import { asset } from '../config.js';
import { MOON_PHYS } from '../astro/bodies.js';
import { installEphemeris, ephemerisCovers } from '../astro/sampledEphemeris.js';
import { resourceQueue, whenIdle } from './resourceQueue.js';

/**
 * On-demand loader for JPL sampled ephemerides (sharded by year).
 *
 * 10-year window (2025-2035) downloaded in annual slices for minimal bandwidth,
 * providing 7.5x longer coverage than legacy 16-month blocks.
 * Efficient on-demand streaming.
 *
 * Shard boundaries: samplesAt() queries first covering slice;
 * prefetch loads adjacent years smoothly across annual boundaries.
 * Main loop refreshes focus/nearest targets periodically.
 */
export function createEphemerisLoader() {
  let manifestPromise;
  const pending = new Map(), failedUntil = new Map();
  const loaded = new Set();                 // Set of loaded shard keys `${id}:${year}`
  const stats = { loaded: 0, failed: 0, bytes: 0, validity: null, window: null };

  const manifest = () => manifestPromise ??= resourceQueue.run('ephemeris:manifest', async () => {
    const r = await fetch(asset('data/ephemeris/manifest.json'), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw Error('Ephemeris manifest HTTP ' + r.status);
    const m = await r.json();
    stats.window = { start: m.start, end: m.end, years: m.years?.length ?? 0 };
    stats.validity = { start: m.start, end: m.end };
    return m;
  }, 20).catch((e) => { manifestPromise = null; throw e; });

  /** Find year key covering target timestamp jd */
  function yearKeyFor(entry, jd) {
    const files = entry.files ?? {};
    for (const [year, f] of Object.entries(files)) {
      if (jd >= f.startJD && jd <= f.endJD) return year;
    }
    // Boundary fallback: nearest available slice
    let best = null, bestGap = Infinity;
    for (const [year, f] of Object.entries(files)) {
      const gap = jd < f.startJD ? f.startJD - jd : jd > f.endJD ? jd - f.endJD : 0;
      if (gap < bestGap) { bestGap = gap; best = year; }
    }
    return best;
  }

  async function loadShard(id, year, file, priority) {
    const key = `${id}:${year}`;
    if (loaded.has(key)) return true;
    if (pending.has(key)) return pending.get(key);
    if ((failedUntil.get(key) ?? 0) > Date.now()) return false;
    const job = (async () => {
      const buffer = await resourceQueue.run('ephemeris:' + key, async () => {
        const r = await fetch(asset('data/ephemeris/' + file.file) + '?v=' + file.sha256,
          { signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw Error('HTTP ' + r.status);
        return r.arrayBuffer();
      }, priority);
      if (buffer.byteLength !== file.bytes) throw Error('Invalid byte length');
      if (globalThis.crypto?.subtle) {
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
          .map((x) => x.toString(16).padStart(2, '0')).join('');
        if (hash !== file.sha256) throw Error('Ephemeris integrity mismatch');
      }
      await whenIdle();
      installEphemeris(id, buffer);
      loaded.add(key);
      stats.loaded++; stats.bytes += buffer.byteLength;
      return true;
    })().catch((e) => {
      stats.failed++;
      failedUntil.set(key, Date.now() + 30000);
      console.warn(`[ephemeris] ${key}: ${e.message}`);
      return false;
    }).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  }

  /** Load shard covering jd (defaults to current simulation time) */
  async function load(id, jd = Date.now() / 86400000 + 2440587.5, priority = 10) {
    if (ephemerisCovers(id, jd)) return true;   // Already covered, avoid duplicate fetch
    let m;
    try { m = await manifest(); } catch { return false; }
    const entry = m.bodies[id];
    if (!entry) return false;
    const year = yearKeyFor(entry, jd);
    if (year == null) return false;
    return loadShard(id, year, entry.files[year], priority);
  }

  /** Prefetch: target + parent + moons for current simulation year */
  function prefetch(id, jd) {
    if (!id) return;
    load(id, jd, 30);
    const parent = MOON_PHYS[id]?.parent;
    if (parent) load(parent, jd, 30);
    for (const [moon, phys] of Object.entries(MOON_PHYS)) {
      if (phys.parent === id) load(moon, jd, 15);
    }
  }

  return { prefetch, load, stats };
}
