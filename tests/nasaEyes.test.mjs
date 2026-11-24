// Unit test suite for NASA's Eyes 3D Models and Authentic Telemetry Catalog
// Validates 3D procedural geometries, NAIF SPICE IDs, orbital elements,
// and official NASA open resource references.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  NASA_EYES_CATALOG,
  createEyesModel,
  createDetailedVoyagerModel,
  createBennuModel,
  createRyuguModel,
  createErosModel,
  createItokawaModel,
  createPsycheModel,
  createVestaModel,
  createComet67PModel,
  REAL_ASTEROIDS_ORBITS,
  getAsteroidEclipticPosition,
} from '../src/scene/nasaEyesModels.js';

test('NASA Eyes Catalog: All key spacecraft and asteroids are cataloged', () => {
  const expectedKeys = [
    'voyager1',
    'voyager2',
    'bennu',
    'ryugu',
    'eros',
    'itokawa',
    'psyche',
    'vesta',
    'comet67p',
  ];

  for (const k of expectedKeys) {
    const item = NASA_EYES_CATALOG[k];
    assert.ok(item, `Missing NASA Eyes catalog entry for ${k}`);
    assert.ok(typeof item.name === 'string' && item.name.length > 0, `${k} has no valid name`);
    assert.ok(item.naifId != null, `${k} missing NAIF SPICE ID`);
    assert.ok(item.operator, `${k} missing operator agency`);
    assert.ok(item.description && item.description.length > 50, `${k} missing comprehensive description`);
    assert.ok(typeof item.realTimeTelemetry === 'function', `${k} missing telemetry calculation function`);
    assert.ok(Array.isArray(item.hotspots) && item.hotspots.length > 0, `${k} missing 3D hotspot annotations`);
    assert.ok(item.eyesUrl && item.eyesUrl.includes('eyes.nasa.gov'), `${k} missing eyes.nasa.gov verified link`);
  }
});

test('NASA NAIF SPICE IDs match official JPL NAIF database', () => {
  assert.equal(NASA_EYES_CATALOG.voyager1.naifId, -31);
  assert.equal(NASA_EYES_CATALOG.voyager2.naifId, -32);
  assert.equal(NASA_EYES_CATALOG.bennu.naifId, 2101955);
  assert.equal(NASA_EYES_CATALOG.ryugu.naifId, 2162173);
  assert.equal(NASA_EYES_CATALOG.eros.naifId, 2000433);
  assert.equal(NASA_EYES_CATALOG.itokawa.naifId, 2025143);
  assert.equal(NASA_EYES_CATALOG.psyche.naifId, 2000016);
  assert.equal(NASA_EYES_CATALOG.vesta.naifId, 2000004);
  assert.equal(NASA_EYES_CATALOG.comet67p.naifId, 1000012);
});

test('Real-time telemetry calculations produce physical results', () => {
  // Epoch 2026.0 (approx JD 2461041.5)
  const jd2026 = 2461041.5;

  const v1 = NASA_EYES_CATALOG.voyager1.realTimeTelemetry(jd2026);
  assert.ok(parseFloat(v1.distAU) >= 166.0, `Voyager 1 distance should be >= 166 AU, got ${v1.distAU}`);
  assert.ok(parseFloat(v1.speedKmS) > 16.0, `Voyager 1 speed should be ~17 km/s, got ${v1.speedKmS}`);
  assert.ok(v1.lightTime.includes('h'), 'Light time should be in hours');

  const bennu = NASA_EYES_CATALOG.bennu.realTimeTelemetry(jd2026);
  assert.ok(parseFloat(bennu.distAU) > 0.8 && parseFloat(bennu.distAU) < 1.5, 'Bennu AU distance reasonable');
});

test('Voyager 3D Model Generator creates authentic components', () => {
  const model = createDetailedVoyagerModel({ isVoyager2: false, scale: 1.0 });
  assert.ok(model instanceof THREE.Group, 'Model is a Three.js Group');
  assert.equal(model.name, 'Voyager1_Model');

  // Verify that model contains meshes for HGA dish, decagonal bus, RTG boom, Golden Record
  let hasDish = false;
  let hasGoldenRecord = false;
  let hasRTGs = false;
  let meshCount = 0;

  model.traverse((child) => {
    if (child.isMesh) {
      meshCount++;
      if (child.material?.name === 'AntennaCompositeDish') hasDish = true;
      if (child.material?.name === 'GoldenRecordCover') hasGoldenRecord = true;
      if (child.material?.name === 'GraphiteRadiatorFins') hasRTGs = true;
    }
  });

  assert.ok(meshCount >= 15, `Expected detailed model with 15+ meshes, found ${meshCount}`);
  assert.ok(hasDish, 'Missing High-Gain Antenna parabolic dish mesh');
  assert.ok(hasGoldenRecord, 'Missing Golden Record ("Sounds of Earth") on Voyager bus');
  assert.ok(hasRTGs, 'Missing Plutonium-238 RTG radiator fins');
});

test('Asteroid 3D Models create perturbed geometries', () => {
  const bennu = createBennuModel();
  assert.ok(bennu instanceof THREE.Group);
  let bennuVerts = 0;
  bennu.traverse((c) => {
    if (c.isMesh) bennuVerts += c.geometry.attributes.position.count;
  });
  assert.ok(bennuVerts >= 100, `Bennu mesh has insufficient vertices: ${bennuVerts}`);

  const eros = createErosModel();
  assert.ok(eros instanceof THREE.Group);
  let erosBbox = new THREE.Box3().setFromObject(eros);
  let erosSize = erosBbox.getSize(new THREE.Vector3());
  // Eros is peanut-shaped, elongated along X
  assert.ok(erosSize.x > erosSize.y * 1.5, 'Eros model is elongated along X');

  const vesta = createVestaModel();
  assert.ok(vesta instanceof THREE.Group);
  assert.equal(vesta.name, 'Vesta_Model');
});

test('createEyesModel factory resolves all catalog items', () => {
  const ids = ['voyager1', 'voyager2', 'bennu', 'ryugu', 'eros', 'itokawa', 'psyche', 'vesta', 'comet67p'];
  for (const id of ids) {
    const res = createEyesModel(id);
    assert.ok(res.group instanceof THREE.Group, `createEyesModel(${id}) did not return Group`);
    assert.equal(res.entry.id, id, `createEyesModel(${id}) returned wrong entry`);
    assert.ok(res.hotspots.length >= 2, `${id} should have at least 2 annotated hotspots`);
  }
});

test('Keplerian orbit propagation for real asteroids produces bounded coordinates', () => {
  const jdEpoch = 2451545.0; // J2000.0

  for (const [id, ast] of Object.entries(REAL_ASTEROIDS_ORBITS)) {
    const pos = getAsteroidEclipticPosition(id, jdEpoch);
    assert.ok(pos, `Position null for ${id}`);
    assert.ok(Number.isFinite(pos.x), `x non-finite for ${id}`);
    assert.ok(Number.isFinite(pos.y), `y non-finite for ${id}`);
    assert.ok(Number.isFinite(pos.z), `z non-finite for ${id}`);

    const rKm = Math.hypot(pos.x, pos.y, pos.z);
    const rAU = rKm / 149597870.7;

    // Check perihelion and aphelion bounds: a(1-e) <= r <= a(1+e) with small margin
    const minAU = ast.aAU * (1 - ast.e) * 0.98;
    const maxAU = ast.aAU * (1 + ast.e) * 1.02;

    assert.ok(
      rAU >= minAU && rAU <= maxAU,
      `Asteroid ${id} distance ${rAU.toFixed(3)} AU outside expected [${minAU.toFixed(3)}, ${maxAU.toFixed(3)}]`
    );
  }
});
