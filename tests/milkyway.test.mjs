// Unit tests for 3D Procedural Milky Way Galaxy, Extragalactic Cosmos, and Deep Space Rendering
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMilkyWay3D, createExtragalacticCosmos, GALAXY_CATALOG } from '../src/scene/milkyway3d.js';
import { createHeliosphere } from '../src/scene/heliosphere.js';
import { createSun } from '../src/scene/sun.js';
import { LY_KM } from '../src/config.js';

test('3D Milky Way Galaxy: structure, arms, dust rifts, and solar beacon', () => {
  const mw = createMilkyWay3D();
  assert.ok(mw.group, 'Milky Way group exists');
  assert.ok(mw.coreMesh, 'Galactic bulge core exists');
  assert.ok(mw.armMesh, 'Spiral arms mesh exists');
  assert.ok(mw.dustMesh, 'Interstellar dust lanes mesh exists');
  assert.ok(mw.nebMesh, 'H II emission nebulae mesh exists');
  assert.ok(mw.sunMarker, 'Sun position marker exists');

  // Verify vertex counts
  const coreCount = mw.coreMesh.geometry.attributes.position.count;
  assert.equal(coreCount, 12000, 'Core should have 12,000 stars');

  const armCount = mw.armMesh.geometry.attributes.position.count;
  assert.equal(armCount, 36000, 'Spiral arms should have 36,000 stars');

  const dustCount = mw.dustMesh.geometry.attributes.position.count;
  assert.equal(dustCount, 15000, 'Interstellar dust lanes should have 15,000 particles');

  const nebCount = mw.nebMesh.geometry.attributes.position.count;
  assert.equal(nebCount, 650, 'Star-forming emission nebulae should have 650 points');

  // Sun marker situated at origin (world coordinates centered on Sun)
  assert.equal(mw.sunMarker.position.x, 0);
  assert.equal(mw.sunMarker.position.y, 0);
  assert.equal(mw.sunMarker.position.z, 0);

  // Update function works seamlessly across distances
  assert.doesNotThrow(() => mw.update(1.0));
  assert.doesNotThrow(() => mw.update(100.0));
  assert.doesNotThrow(() => mw.update(50000.0));
});

test('Extragalactic Cosmos: Andromeda, Triangulum, Magellanic Clouds, and Deep Field', () => {
  const cosmos = createExtragalacticCosmos();
  assert.ok(cosmos.group, 'Cosmos group exists');
  assert.ok(cosmos.m31Mesh, 'Andromeda M31 mesh exists');
  assert.ok(cosmos.m33Mesh, 'Triangulum M33 mesh exists');
  assert.ok(cosmos.magMesh, 'LMC and SMC mesh exists');
  assert.ok(cosmos.deepMesh, 'Deep field galaxies mesh exists');

  // Verify astronomical distances in km
  const andromedaDistLy = cosmos.andromedaCenter.length() / LY_KM;
  assert.ok(Math.abs(andromedaDistLy - 2.537e6) < 1000, `Andromeda distance ~2.537 Mly, got ${andromedaDistLy}`);

  const m33DistLy = cosmos.m33Center.length() / LY_KM;
  assert.ok(Math.abs(m33DistLy - 2.73e6) < 1000, `Triangulum distance ~2.73 Mly, got ${m33DistLy}`);

  const lmcDistLy = cosmos.lmcCenter.length() / LY_KM;
  assert.ok(Math.abs(lmcDistLy - 163000) < 1000, `LMC distance ~163 kly, got ${lmcDistLy}`);

  const smcDistLy = cosmos.smcCenter.length() / LY_KM;
  assert.ok(Math.abs(smcDistLy - 204000) < 1000, `SMC distance ~204 kly, got ${smcDistLy}`);

  const deepCount = cosmos.deepMesh.geometry.attributes.position.count;
  assert.equal(deepCount, 1200, 'Deep space cosmos should have 1,200 distant galaxies');
});

test('Astronomical Galaxy Catalog: educational metadata and accuracy', () => {
  const keys = ['milkyway', 'andromeda', 'triangulum', 'lmc', 'smc'];
  for (const k of keys) {
    const entry = GALAXY_CATALOG[k];
    assert.ok(entry, `Catalog entry for ${k} exists`);
    assert.ok(entry.nameEn, `English name for ${k} exists`);
    assert.ok(entry.desc, `Scientific description for ${k} exists`);
    assert.ok(entry.viewDist > 0, `Valid view distance for ${k}`);
    assert.equal(entry.kind, 'galaxy');
  }
});

test('Heliosphere: smooth interstellar distance fade', () => {
  const helio = createHeliosphere();
  assert.ok(typeof helio.update === 'function', 'Heliosphere has update method');

  // Within solar system: full opacity
  helio.update(50);
  const shellTS = helio.children[0];
  const shellHP = helio.children[1];
  assert.equal(shellTS.material.uniforms.uOpacity.value, 0.38);
  assert.equal(shellHP.material.uniforms.uOpacity.value, 0.40);

  // Far beyond heliopause: opacity fades to prevent white washout
  helio.update(360);
  assert.ok(shellTS.material.uniforms.uOpacity.value < 0.1, 'TS should fade outside solar system');
  assert.ok(shellHP.material.uniforms.uOpacity.value < 0.1, 'HP should fade outside solar system');
});

test('Sun Star: GLSL compilation and distant visibility beacon', () => {
  const sun = createSun();
  assert.ok(sun.mesh, 'Sun mesh exists');
  assert.ok(sun.corona, 'Sun corona exists');
  assert.ok(sun.uniforms, 'Sun uniforms exist');
  assert.ok(typeof sun.update === 'function', 'Sun has update function');

  // Verify update works with various distances and occultation
  assert.doesNotThrow(() => sun.update(10.0, 1.496e8, false, 0.5));
  assert.doesNotThrow(() => sun.update(20.0, 1.496e10, true, 0.8));
});
