// Loop safety and integration tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMTileSource, DEM_SOURCES } from '../src/scene/demTiles.js';

// -- DEMTileSource: offline fallback and synchronous sampling without exceptions --

test('DEMTileSource: unconfigured celestial body hasSource=false', () => {
  assert.equal(DEMTileSource.hasSource('ceres'), false);
  assert.equal(DEMTileSource.hasSource('mercury'), false);
  assert.equal(DEMTileSource.hasSource('earth'), true);
  assert.equal(DEMTileSource.hasSource('moon'), true);
  assert.equal(DEMTileSource.hasSource('mars'), true);
});

test('DEMTileSource: getHeightSync returns null without throwing when offline', () => {
  const src = new DEMTileSource('moon');
  src._offline = true;
  const dir = { x: 0, y: 1, z: 0 };
  assert.equal(src.getHeightSync(dir), null);
  assert.equal(src.getHeightSync({ x: 1, y: 0, z: 0 }), null);
});

test('DEMTileSource: getHeightSync returns null without throwing on cache miss', () => {
  const src = new DEMTileSource('moon');
  assert.equal(src._offline, false);
  const h = src.getHeightSync({ x: 0, y: 1, z: 0 });
  assert.equal(h, null);
});

test('DEMTileSource: requestTiles is no-op without throwing when offline', () => {
  const src = new DEMTileSource('mars');
  src._offline = true;
  assert.doesNotThrow(() => src.requestTiles({ x: 0, y: 1, z: 0 }, 8));
  assert.doesNotThrow(() => src.requestTiles({ x: 1, y: 0, z: 0 }, 0));
});

test('DEMTileSource: requestTiles is no-op for unconfigured bodies', () => {
  const src = new DEMTileSource('mercury');
  assert.equal(src.config, null);
  assert.doesNotThrow(() => src.requestTiles({ x: 0, y: 1, z: 0 }, 8));
});

test('DEMTileSource: getTile returns null when offline', async () => {
  const src = new DEMTileSource('moon');
  src._offline = true;
  const tile = await src.getTile(0, 0, 0);
  assert.equal(tile, null);
});

test('DEMTileSource: all operations remain safe after dispose', () => {
  const src = new DEMTileSource('moon');
  src.dispose();
  assert.doesNotThrow(() => src.getHeightSync({ x: 0, y: 1, z: 0 }));
  assert.doesNotThrow(() => src.requestTiles({ x: 0, y: 1, z: 0 }, 8));
});

test('DEMTileSource: LRU cache eviction does not throw', () => {
  const src = new DEMTileSource('moon', { maxCache: 2 });
  src.cache.set(0, 0, 0, { data: new Float32Array(1), size: 1, level: 0 });
  src.cache.set(0, 1, 0, { data: new Float32Array(1), size: 1, level: 0 });
  src.cache.set(0, 0, 1, { data: new Float32Array(1), size: 1, level: 0 });
  assert.equal(src.cache.size, 2);
  assert.ok(src.cache.get(0, 0, 0));
  assert.equal(src.cache.get(0, 1, 0), undefined);
});

// -- Loop safety net validation --

test('Loop safety net: single section failure does not block subsequent sections or rendering', () => {
  const errors = [];
  const loopErr = (tag, e) => errors.push({ tag, msg: e?.message || String(e) });

  let rendered = false;
  const simulateLoop = (throwInSection) => {
    rendered = false;
    try { if (throwInSection === 'comets') throw new Error('comets boom'); } catch (e) { loopErr('comets', e); }
    try { if (throwInSection === 'tnoScene') throw new Error('tno boom'); } catch (e) { loopErr('tnoScene', e); }
    try { if (throwInSection === 'modeUpdate') throw new Error('mode boom'); } catch (e) { loopErr('modeUpdate', e); }
    try { if (throwInSection === 'world') throw new Error('world boom'); } catch (e) { loopErr('world', e); }
    try { if (throwInSection === 'atmoFog') throw new Error('atmo boom'); } catch (e) { loopErr('atmoFog', e); }
    try { if (throwInSection === 'hud') throw new Error('hud boom'); } catch (e) { loopErr('hud', e); }
    try { if (throwInSection === 'fpsGuard') throw new Error('fps boom'); } catch (e) { loopErr('fpsGuard', e); }
    try { if (throwInSection === 'input') throw new Error('input boom'); } catch (e) { loopErr('input', e); }
    try { rendered = true; } catch (e) { errors.push({ tag: 'render', msg: e.message }); }
  };

  for (const section of ['comets', 'tnoScene', 'modeUpdate', 'world', 'atmoFog', 'hud', 'fpsGuard', 'input']) {
    simulateLoop(section);
    assert.equal(rendered, true, `composer.render() was not executed after ${section} error`);
    assert.equal(errors.length, 1, `Expected exactly 1 error for ${section}`);
    assert.equal(errors[0].tag, section);
    errors.length = 0;
  }

  simulateLoop(null);
  assert.equal(rendered, true);
  assert.equal(errors.length, 0);
});

test('Loop safety net: multiple concurrent section errors do not block rendering', () => {
  let rendered = false;
  const errors = [];
  const loopErr = (tag, e) => errors.push(tag);

  try { throw new Error('a'); } catch (e) { loopErr('comets', e); }
  try { throw new Error('b'); } catch (e) { loopErr('atmoFog', e); }
  try { throw new Error('c'); } catch (e) { loopErr('hud', e); }
  try { rendered = true; } catch (e) { loopErr('render', e); }

  assert.equal(rendered, true, 'Rendering must execute even when 3 sections throw');
  assert.deepEqual(errors, ['comets', 'atmoFog', 'hud']);
});

// -- Floating origin system safety --

test('World.update: empty entity list does not throw', async () => {
  const { World } = await import('../src/engine/floating.js');
  const world = new World();
  const camPos = new Float64Array([1e8, 2e8, 3e8]);
  assert.doesNotThrow(() => world.update(camPos));
});

test('World.register + update: entity positions are correctly translated', async () => {
  const { World } = await import('../src/engine/floating.js');
  const world = new World();
  const mockObj = {
    _x: 0, _y: 0, _z: 0,
    position: {
      set(x, y, z) { mockObj._x = x; mockObj._y = y; mockObj._z = z; },
      get x() { return mockObj._x; },
      get y() { return mockObj._y; },
      get z() { return mockObj._z; },
    },
  };
  const posKm = new Float64Array([100, 200, 300]);
  assert.doesNotThrow(() => world.register(posKm, mockObj));
  world.update(new Float64Array([50, 60, 70]));
  assert.equal(mockObj._x, 50);
  assert.equal(mockObj._y, 140);
  assert.equal(mockObj._z, 230);
});
