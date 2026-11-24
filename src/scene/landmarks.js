// Landmark system: Apollo landing sites, Chandrayaan-3 lunar south pole, and Mars rover sites.
// Procedural low-poly models, 1:1 metric scale, parented under celestial body meshes (co-rotating).
// LOD: Distant billboard sprites, close-range 3D models, smooth fade transitions.
// Coordinate frame: Body-fixed frame (+Y=North pole, +X=Prime meridian, East longitude positive),
// consistent with terrain.js HeightField.sampleMap: lon = atan2(-dir.z, dir.x).

import * as THREE from 'three';

const DEG = Math.PI / 180;
const m = (v) => v * 0.001; // meters -> kilometers (project world unit is km)

// -- Coordinate Utilities ------------------------------------------------
function latLonToDir(latDeg, lonDeg) {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    -Math.cos(lat) * Math.sin(lon)
  );
}

function alignToNormal(group, normal) {
  const up = new THREE.Vector3(0, 1, 0);
  group.quaternion.setFromUnitVectors(up, normal);
}

function surfaceNormal(terrainMgr, id, dir, radiusKm) {
  const up = dir.clone().normalize();
  const helper = Math.abs(up.y) < 0.9
    ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(up, helper).normalize();
  const t2 = new THREE.Vector3().crossVectors(up, t1).normalize();
  const d = 4e-4;                      // Angular step (~0.7 km on the Moon)
  const h0 = terrainMgr.heightAt(id, up);
  const h1 = terrainMgr.heightAt(id, up.clone().addScaledVector(t1, d).normalize());
  const h2 = terrainMgr.heightAt(id, up.clone().addScaledVector(t2, d).normalize());
  const run = d * radiusKm;
  return new THREE.Vector3()
    .addScaledVector(t1, -(h1 - h0) / run)
    .addScaledVector(t2, -(h2 - h0) / run)
    .add(up)
    .normalize();
}

// -- Billboard Sprite Factory --------------------------------------------
function makeBillboard(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const hex = '#' + color.toString(16).padStart(6, '0');
  // Crosshair lines
  ctx.strokeStyle = hex;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 6); ctx.lineTo(32, 58);
  ctx.moveTo(6, 32); ctx.lineTo(58, 32);
  ctx.stroke();
  // Center dot (white highlight)
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(32, 32, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hex;
  ctx.lineWidth = 2;
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.85,
    depthWrite: false, depthTest: true,
  }));
}

// ════════════════════════════════════════════════════════════════════
// Lunar Landing Sites Catalog (Apollo Missions & Chandrayaan-3)
// Focused on scientific equipment, payloads, and surface environment.
// ════════════════════════════════════════════════════════════════════
export const APOLLO_SITES = [
  {
    id: 'apollo11',
    nameZh: 'Apollo 11', nameEn: 'Apollo 11',
    latDeg: 0.6741, lonDeg: 23.4730,
    siteNameZh: 'Mare Tranquillitatis', siteNameEn: 'Mare Tranquillitatis (Sea of Tranquility)',
    date: '1969-07-20',
    equipment: 'Lunar Module Eagle Descent Stage, EASEP, Lunar Laser Ranging Retroreflector (LRRR), Solar Wind Foil',
    descEn: 'First human lunar surface touchdown site. Deployed the Early Apollo Surface Experiments Package (EASEP) and the 100-corner-cube quartz laser retroreflector still tracked by Earth observatories today.',
    facts: ['Surface stay: 21.6 hours', 'Returned samples: 21.5 kg titanium-rich mare basalt', 'Scientific instruments: EASEP, PSEP seismometer, LRRR optical array'],
    hasRover: false,
    hasALSEP: true,
  },
  {
    id: 'apollo12',
    nameZh: 'Apollo 12', nameEn: 'Apollo 12',
    latDeg: -3.0128, lonDeg: -23.4219,
    siteNameZh: 'Oceanus Procellarum', siteNameEn: 'Oceanus Procellarum (Ocean of Storms)',
    date: '1969-11-19',
    equipment: 'Lunar Module Intrepid Descent Stage, ALSEP Station, SNAP-27 RTG, Surveyor 3 Retrieval Hardware',
    descEn: 'Pinpoint precision touchdown within 160 meters of the robotic Surveyor 3 lander. Retrieved Surveyor 3 television camera and tubing to study long-term cosmic radiation exposure.',
    facts: ['Surface stay: 31.5 hours', 'Returned samples: 34.4 kg basaltic rock and soil', 'Hardware recovered: Surveyor 3 optical camera and mechanical arm'],
    hasRover: false,
    hasALSEP: true,
  },
  {
    id: 'apollo15',
    nameZh: 'Apollo 15', nameEn: 'Apollo 15',
    latDeg: 26.1324, lonDeg: 3.6330,
    siteNameZh: 'Hadley Rille / Apennines', siteNameEn: 'Hadley-Apennine Region (Hadley Rille)',
    date: '1971-07-30',
    equipment: 'Lunar Roving Vehicle (LRV #1), Deep Lunar Surface Drill (3m core), Heat Flow Experiment, Laser Altimeter',
    descEn: 'First extended scientific J-mission featuring the electric Lunar Roving Vehicle (LRV). Explored the 300-meter-deep Hadley Rille volcanic canyon and discovered the pristine 4.1-billion-year-old anorthositic Genesis Rock.',
    facts: ['Surface stay: 66.9 hours', 'Returned samples: 77.3 kg highland & mare rocks', 'LRV traverse: 27.9 km total roving distance'],
    hasRover: true,
    hasALSEP: true,
  },
  {
    id: 'apollo16',
    nameZh: 'Apollo 16', nameEn: 'Apollo 16',
    latDeg: -8.9734, lonDeg: 15.5008,
    siteNameZh: 'Descartes Highlands', siteNameEn: 'Descartes Highlands',
    date: '1972-04-21',
    equipment: 'Lunar Roving Vehicle (LRV #2), Far Ultraviolet Camera / Spectrograph, Active Seismic Mortar Package',
    descEn: 'Highland exploration mission investigating ancient impact breccias at North Ray and Stone Mountain craters, operating astronomical ultraviolet spectrographs in true lunar vacuum.',
    facts: ['Surface stay: 71.0 hours', 'Returned samples: 95.7 kg highland impact breccia', 'LRV traverse: 26.7 km across Descartes plateau'],
    hasRover: true,
    hasALSEP: true,
  },
  {
    id: 'apollo17',
    nameZh: 'Apollo 17', nameEn: 'Apollo 17',
    latDeg: 20.1911, lonDeg: 30.7723,
    siteNameZh: 'Taurus-Littrow Valley', siteNameEn: 'Taurus-Littrow Valley',
    date: '1972-12-11',
    equipment: 'Lunar Roving Vehicle (LRV #3), Traverse Gravimeter, Surface Electrical Properties Transmitter, Lunar Atmospheric Gauge',
    descEn: 'Exploration of deep graben valley bounded by massif mountains. Discovered orange pyroclastic volcanic glass beads from ancient lunar fire fountain eruptions 3.6 billion years ago.',
    facts: ['Surface stay: 75.0 hours', 'Returned samples: 110.5 kg lunar rocks & regolith cores', 'LRV traverse: 35.7 km, maximum record for Apollo program'],
    hasRover: true,
    hasALSEP: true,
  },
  {
    id: 'chandrayaan3',
    nameZh: 'Chandrayaan-3', nameEn: 'Chandrayaan-3',
    latDeg: -69.3730, lonDeg: 32.3190,
    siteNameZh: 'Shiv Shakti Point', siteNameEn: 'Shiv Shakti Point (Lunar South Pole)',
    date: '2023-08-23',
    equipment: 'Vikram Lander, Pragyan Rover, ChaSTE Thermal Gradient Probe, ILSA Seismometer, RAMBHA-LP, LIBS Laser Spectrometer, APXS',
    descEn: 'Historic touchdown in the high southern latitudes of the Moon. Vikram lander deployed Pragyan rover and penetrated polar regolith with the ChaSTE thermal probe, confirming elemental sulfur and measuring extreme surface-to-subsurface thermal gradients.',
    facts: ['Location: 69.37° S (Lunar Southern Polar Region)', 'Pragyan traverse: >100 m on polar soil', 'Scientific discoveries: In-situ elemental sulfur detection & regolith thermal profile'],
    hasRover: false,
    hasALSEP: false,
    isChandrayaan: true,
  },
];

// -- 3D Scientific Equipment & Lander Models ------------------------------

// LM Descent Stage: octagonal prism + 4 landing gear struts + descent engine bell
function createLMDescentStage() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });
  const engineMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.3 });

  // Descent stage bus: octagonal prism (aluminized Kapton foil wrapped), base ~1.8m above ground
  const stage = new THREE.Mesh(
    new THREE.CylinderGeometry(m(4.3), m(4.3), m(2.3), 8), gold);
  stage.position.y = m(2.95);
  group.add(stage);

  // Descent Engine Bell (underneath bus center)
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.4), m(1.0), m(1.2), 16, 1, true), engineMat);
  bell.position.y = m(1.4);
  group.add(bell);

  // 4 landing gear legs extending outward and downward to surface
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 8;
    const hip = new THREE.Vector3(
      Math.cos(angle) * m(3.0), m(1.8), Math.sin(angle) * m(3.0));
    const foot = new THREE.Vector3(
      Math.cos(angle) * m(4.5), 0, Math.sin(angle) * m(4.5));
    const dir = foot.clone().sub(hip);
    const len = dir.length();
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.08), m(0.08), len, 4), dark);
    leg.position.copy(hip).addScaledVector(dir, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(leg);

    // Landing footpad dish
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.35), m(0.35), m(0.06), 8), dark);
    pad.position.copy(foot);
    group.add(pad);
  }

  return group;
}

// Lunar Roving Vehicle (LRV): deployed on Apollo 15, 16, and 17
function createLRV() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.5 });

  // Chassis frame
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(m(3.1), m(0.25), m(1.8)), gold);
  chassis.position.y = m(0.7);
  group.add(chassis);

  // Crew seating and control console
  for (const z of [-m(0.4), m(0.4)]) {
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(m(0.8), m(0.6), m(0.5)), dark);
    seat.position.set(0, m(1.1), z);
    group.add(seat);
  }

  // High-gain directional antenna umbrella dish
  const antPole = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.02), m(0.02), m(1.4), 4), dark);
  antPole.position.set(m(1.2), m(1.4), -m(0.6));
  group.add(antPole);
  const antDish = new THREE.Mesh(
    new THREE.ConeGeometry(m(0.45), m(0.15), 12), white);
  antDish.rotation.x = -Math.PI / 3;
  antDish.position.set(m(1.2), m(2.0), -m(0.6));
  group.add(antDish);

  // 4 wire-mesh open wheels with chevron titanium treads
  for (let i = 0; i < 4; i++) {
    const wx = (i < 2 ? -1 : 1) * m(1.15);
    const wz = (i % 2 === 0 ? -1 : 1) * m(0.9);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.42), m(0.42), m(0.3), 12), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, m(0.42), wz);
    group.add(wheel);
  }

  return group;
}

// ALSEP (Apollo Lunar Surface Experiments Package):
// Central station transmitter + RTG generator + LRRR Laser Retroreflector + Seismometer
function createALSEP() {
  const group = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.5 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.4 });
  const optical = new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.9, roughness: 0.1 });

  // 1. Central Station: control hub and radio transmitter box
  const station = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.8), m(0.6), m(0.8)), gold);
  station.position.set(0, m(0.3), 0);
  group.add(station);

  // Helical S-band transmitter antenna on station roof
  const antMast = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.02), m(0.02), m(1.2), 6), dark);
  antMast.position.set(0, m(1.2), 0);
  group.add(antMast);

  // 2. Radioisotope Thermoelectric Generator (SNAP-27 RTG)
  // Hexagonal cylinder with heat radiator fins
  const rtg = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.2), m(0.2), m(0.5), 8), silver);
  rtg.position.set(m(2.5), m(0.25), m(1.0));
  group.add(rtg);

  // 3. Lunar Laser Ranging Retroreflector (LRRR)
  // Tilted array containing 100 fused silica corner-cube prisms
  const lrrrBase = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.7), m(0.15), m(0.7)), dark);
  lrrrBase.position.set(-m(3.0), m(0.1), -m(1.5));
  lrrrBase.rotation.x = 0.4; // Tilted toward Earth
  group.add(lrrrBase);
  const lrrrArray = new THREE.Mesh(
    new THREE.PlaneGeometry(m(0.6), m(0.6)), optical);
  lrrrArray.position.set(-m(3.0), m(0.2), -m(1.5));
  lrrrArray.rotation.x = 0.4 - Math.PI / 2;
  group.add(lrrrArray);

  // 4. Passive Seismic Experiment (PSEP) seismometer package
  const seismo = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.25), m(0.25), m(0.35), 8), silver);
  seismo.position.set(m(1.5), m(0.18), -m(2.0));
  group.add(seismo);

  return group;
}

// Chandrayaan-3: Vikram Lander + Pragyan Rover + ChaSTE Thermal Probe
function createChandrayaan3Model() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.5 });
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x112244, metalness: 0.7, roughness: 0.2 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.4, roughness: 0.5 });

  // ── Vikram Lander Body (2.0m x 2.0m x 1.16m gold-insulated box) ──
  const landerBody = new THREE.Mesh(
    new THREE.BoxGeometry(m(2.0), m(1.2), m(2.0)), gold);
  landerBody.position.y = m(1.4);
  group.add(landerBody);

  // Top deck solar arrays (tilted)
  const topSolar = new THREE.Mesh(
    new THREE.PlaneGeometry(m(1.8), m(1.8)), solarMat);
  topSolar.rotation.x = -Math.PI / 2;
  topSolar.position.set(0, m(2.02), 0);
  group.add(topSolar);

  // Communications dish & antenna
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.3), m(0.05), m(0.1), 12), whiteMat);
  dish.rotation.x = 0.5;
  dish.position.set(m(0.6), m(2.2), m(0.6));
  group.add(dish);

  // 4 Main bipropellant 800N throttleable liquid engines
  for (let i = 0; i < 4; i++) {
    const ex = (i < 2 ? -1 : 1) * m(0.5);
    const ez = (i % 2 === 0 ? -1 : 1) * m(0.5);
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.1), m(0.2), m(0.4), 8), dark);
    engine.position.set(ex, m(0.6), ez);
    group.add(engine);
  }

  // 4 Landing legs with crushable shock absorbers and broad footpads
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const hip = new THREE.Vector3(
      Math.cos(angle) * m(1.2), m(1.1), Math.sin(angle) * m(1.2));
    const foot = new THREE.Vector3(
      Math.cos(angle) * m(2.2), 0, Math.sin(angle) * m(2.2));
    const dir = foot.clone().sub(hip);
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.06), m(0.06), dir.length(), 4), dark);
    leg.position.copy(hip).addScaledVector(dir, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(leg);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.25), m(0.25), m(0.05), 8), dark);
    pad.position.copy(foot);
    group.add(pad);
  }

  // Deployment Ramp for Pragyan rover (extending from lander side to ground)
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.8), m(0.04), m(2.2)), dark);
  ramp.position.set(m(1.5), m(0.5), 0);
  ramp.rotation.z = -0.45;
  group.add(ramp);

  // ChaSTE (Chandra's Surface Thermophysical Experiment) probe penetrating soil
  const chasteProbe = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.02), m(0.02), m(0.6), 4), dark);
  chasteProbe.position.set(-m(1.2), -m(0.1), 0);
  group.add(chasteProbe);

  // ── Pragyan Rover (6-wheeled lunar rover, deployed on surface) ──
  const roverGroup = new THREE.Group();
  roverGroup.position.set(m(3.8), 0, 0); // Positioned ~3.8m from lander

  // Rover chassis box
  const roverBox = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.9), m(0.3), m(0.75)), gold);
  roverBox.position.y = m(0.35);
  roverGroup.add(roverBox);

  // Solar panel wing
  const roverSolar = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.85), m(0.02), m(0.7)), solarMat);
  roverSolar.position.set(0, m(0.52), 0);
  roverGroup.add(roverSolar);

  // Sensor mast with NavCam and LIBS (Laser Induced Breakdown Spectroscope)
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.02), m(0.02), m(0.5), 4), dark);
  mast.position.set(m(0.3), m(0.75), 0);
  roverGroup.add(mast);

  // 6 wheels with rocker-bogie mechanism
  for (let i = 0; i < 6; i++) {
    const wx = ((i % 3) - 1) * m(0.35);
    const wz = (i < 3 ? -1 : 1) * m(0.42);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.12), m(0.12), m(0.08), 8), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, m(0.12), wz);
    roverGroup.add(wheel);
  }

  group.add(roverGroup);
  return group;
}

// -- Apollo & Lunar Landmark Scene Construction --------------------------
export function createApolloLandmarks(scene, terrainMgr) {
  const moonMesh = terrainMgr.meshOf('moon');
  const group = new THREE.Group();
  moonMesh.add(group);

  const entries = APOLLO_SITES.map((site) => {
    const dir = latLonToDir(site.latDeg, site.lonDeg);
    const h = terrainMgr.heightAt('moon', dir);
    const pos = dir.clone().multiplyScalar(h + m(0.05));

    const siteGroup = new THREE.Group();
    siteGroup.position.copy(pos);
    alignToNormal(siteGroup, surfaceNormal(terrainMgr, 'moon', dir, 1737.4));

    // 3D model group (close range)
    const model = new THREE.Group();
    if (site.isChandrayaan) {
      model.add(createChandrayaan3Model());
    } else {
      model.add(createLMDescentStage());
      if (site.hasRover) {
        const lrv = createLRV();
        lrv.position.set(m(8), 0, m(2));
        model.add(lrv);
      }
      if (site.hasALSEP) {
        const alsep = createALSEP();
        alsep.position.set(-m(12), 0, m(5));
        model.add(alsep);
      }
    }
    model.visible = false;
    siteGroup.add(model);

    // Billboard marker
    const billboardColor = site.isChandrayaan ? 0x44ddff : 0xffaa44;
    const billboard = makeBillboard(billboardColor);
    billboard.scale.setScalar(m(15));
    siteGroup.add(billboard);

    group.add(siteGroup);

    return { site, group: siteGroup, model, billboard, dir, posLocal: pos };
  });

  function update(camRelPosKm) {
    if (!camRelPosKm) return;
    for (const e of entries) {
      const h = terrainMgr.heightAt('moon', e.dir);
      e.posLocal.copy(e.dir).multiplyScalar(h + m(0.05));
      e.group.position.copy(e.posLocal);
      const dx = camRelPosKm.x - e.posLocal.x;
      const dy = camRelPosKm.y - e.posLocal.y;
      const dz = camRelPosKm.z - e.posLocal.z;
      const dist = Math.hypot(dx, dy, dz);
      const modelFade = THREE.MathUtils.clamp((10 - dist) / 5, 0, 1);
      e.model.visible = modelFade > 0.01;
      e.billboard.visible = dist > 0.5;
      const bbScale = THREE.MathUtils.clamp(dist * 0.008, m(15), m(200));
      e.billboard.scale.setScalar(bbScale);
    }
  }

  return { entries, group, update };
}

// ════════════════════════════════════════════════════════════════════
// Mars rover landing sites and traverses (Issue #35)
// ════════════════════════════════════════════════════════════════════
export const ROVER_SITES = [
  {
    id: 'perseverance',
    nameZh: 'Perseverance', nameEn: 'Perseverance',
    latDeg: 18.4447, lonDeg: 77.4508,
    siteNameZh: 'Jezero Crater', siteNameEn: 'Jezero Crater',
    landingDate: '2021-02-18',
    agency: 'NASA',
    descZh: 'Searching for ancient biosignatures and caching samples for future return. Carried Ingenuity helicopter for first powered flights on Mars.',
    roverType: 'nuclear',
    path: [
      { latDeg: 18.4447, lonDeg: 77.4508, date: '2021-02-18',
        titleZh: 'Landing', descZh: 'Octavia E. Butler Landing site, autonomous landing accuracy < 10m.' },
      { latDeg: 18.4230, lonDeg: 77.4510, date: '2021-06-01',
        titleZh: 'Seítah Unit', descZh: 'Traversed olivine-rich area, analyzing rock composition with SuperCam laser.' },
      { latDeg: 18.4000, lonDeg: 77.4400, date: '2022-04-01',
        titleZh: 'Delta Front', descZh: 'Discovered sedimentary rocks, confirming Jezero was an ancient lake delta.' },
      { latDeg: 18.3700, lonDeg: 77.4200, date: '2023-02-01',
        titleZh: 'Three Forks', descZh: 'Sample depot, initial sample tubes deposited on surface for future Mars Sample Return.' },
      { latDeg: 18.3500, lonDeg: 77.4000, date: '2024-06-01',
        titleZh: 'Bright Angel', descZh: 'Exploring carbonate-rich mudstones favorable for preserving biosignatures.' },
    ],
  },
  {
    id: 'curiosity',
    nameZh: 'Curiosity', nameEn: 'Curiosity',
    latDeg: -4.5895, lonDeg: 137.4417,
    siteNameZh: 'Gale Crater', siteNameEn: 'Gale Crater',
    landingDate: '2012-08-06',
    agency: 'NASA',
    descZh: 'Assessing past habitability and climbing Mount Sharp (Aeolis Mons) to study sedimentary sequences.',
    roverType: 'nuclear',
    path: [
      { latDeg: -4.5895, lonDeg: 137.4417, date: '2012-08-06',
        titleZh: 'Landing', descZh: 'Bradbury Landing, successful Entry-Descent-Landing.' },
      { latDeg: -4.5900, lonDeg: 137.4400, date: '2013-03-01',
        titleZh: 'Yellowknife Bay', descZh: 'Found clay minerals confirming an ancient neutral-pH liquid water lake.' },
      { latDeg: -4.5900, lonDeg: 137.3800, date: '2014-09-01',
        titleZh: 'Pahrump Hills', descZh: 'First drilling of Mount Sharp base sediments, finding hematite bands.' },
      { latDeg: -4.7500, lonDeg: 137.3000, date: '2016-09-01',
        titleZh: 'Murray Buttes', descZh: 'Traversed the Murray formation, photographing wind-sculpted buttes.' },
      { latDeg: -4.8600, lonDeg: 137.2700, date: '2017-09-01',
        titleZh: 'Vera Rubin Ridge', descZh: 'Discovered hematite ridge, tracking climate change from wet to dry.' },
      { latDeg: -4.9200, lonDeg: 137.3000, date: '2019-05-01',
        titleZh: 'Glen Torridon', descZh: 'Found clay minerals and organic molecules (thiophenes, benzene rings).' },
      { latDeg: -5.0000, lonDeg: 137.3500, date: '2024-06-01',
        titleZh: 'Marker Band Valley', descZh: 'Found fossilized wave ripples formed by an ancient shallow lake.' },
    ],
  },
  {
    id: 'zhurong',
    nameZh: 'Zhurong', nameEn: 'Zhurong',
    latDeg: 25.066, lonDeg: 109.926,
    siteNameZh: 'Utopia Planitia', siteNameEn: 'Utopia Planitia',
    landingDate: '2021-05-15',
    agency: 'CNSA',
    descZh: 'First Mars rover of China, utilizing ground-penetrating radar to study water and ice distribution.',
    roverType: 'solar',
    path: [
      { latDeg: 25.066, lonDeg: 109.926, date: '2021-05-15',
        titleZh: 'Landing', descZh: 'Tianwen-1 landing site, successful Mars surface landing.' },
      { latDeg: 25.055, lonDeg: 109.920, date: '2021-07-01',
        titleZh: 'Roving Began', descZh: 'Drove off lander platform to begin surface exploration.' },
      { latDeg: 25.050, lonDeg: 109.915, date: '2021-09-01',
        titleZh: 'Radar Sounding', descZh: 'Dual-frequency GPR revealed layered structures within 40m depth.' },
      { latDeg: 25.045, lonDeg: 109.910, date: '2022-05-01',
        titleZh: 'Water Ice Evidence', descZh: 'Radar data revealed possible ice-rich layers at 35m depth.' },
    ],
  },
  {
    id: 'opportunity',
    nameZh: 'Opportunity', nameEn: 'Opportunity',
    latDeg: -1.9462, lonDeg: 354.4734,
    siteNameZh: 'Meridiani Planum', siteNameEn: 'Meridiani Planum',
    landingDate: '2004-01-25',
    agency: 'NASA',
    descZh: 'Operated for 14 years across 45.16 km, finding hematite blueberries that confirmed ancient water.',
    roverType: 'solar',
    path: [
      { latDeg: -1.9462, lonDeg: 354.4734, date: '2004-01-25',
        titleZh: 'Landing', descZh: 'Landed directly inside Eagle Crater.' },
      { latDeg: -1.9500, lonDeg: 354.3500, date: '2004-04-01',
        titleZh: 'Endurance Crater', descZh: 'Found hematite blueberries precipitated in ancient water.' },
      { latDeg: -2.0500, lonDeg: 354.2500, date: '2007-09-01',
        titleZh: 'Victoria Crater', descZh: 'Explored 750m wide crater and exposed strata.' },
      { latDeg: -1.9500, lonDeg: 354.5000, date: '2011-08-01',
        titleZh: 'Endeavour Crater', descZh: 'Arrived at 22km crater and found gypsum veins formed by ancient water.' },
      { latDeg: -1.9500, lonDeg: 354.5500, date: '2018-06-01',
        titleZh: 'Perseverance Valley', descZh: 'Final station after a 2018 dust storm concluded the 45.16 km mission.' },
    ],
  },
];

// -- Mars Rover 3D Model Builders ----------------------------------------
function createNuclearRover() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.7, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(m(2.8), m(1.2), m(1.8)), body);
  chassis.position.y = m(1.0);
  group.add(chassis);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.05), m(0.05), m(1.5), 6), dark);
  mast.position.set(0, m(2.3), 0);
  group.add(mast);

  const camHead = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.4), m(0.3), m(0.3)), body);
  camHead.position.set(0, m(3.1), 0);
  group.add(camHead);

  // 6 wheels
  for (let i = 0; i < 6; i++) {
    const wx = ((i % 3) - 1) * m(1.1);
    const wz = (i < 3 ? -1 : 1) * m(1.0);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.25), m(0.25), m(0.2), 8), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, m(0.25), wz);
    group.add(wheel);
  }

  return group;
}

function createSolarRover() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 });
  const solar = new THREE.MeshStandardMaterial({ color: 0x112244, metalness: 0.8, roughness: 0.2 });

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(m(1.6), m(0.6), m(1.2)), body);
  chassis.position.y = m(0.6);
  group.add(chassis);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(m(2.2), m(0.05), m(1.8)), solar);
  panel.position.y = m(0.95);
  group.add(panel);

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.03), m(0.03), m(1.1), 4), dark);
  mast.position.set(0, m(1.5), 0);
  group.add(mast);

  for (let i = 0; i < 6; i++) {
    const wx = ((i % 3) - 1) * m(0.7);
    const wz = (i < 3 ? -1 : 1) * m(0.7);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.15), m(0.15), m(0.12), 8), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, m(0.15), wz);
    group.add(wheel);
  }

  return group;
}

// -- Mars Rover Scene Construction ---------------------------------------
export function createRoverSites(scene, terrainMgr) {
  const marsMesh = terrainMgr.meshOf('mars');
  const group = new THREE.Group();
  marsMesh.add(group);

  const entries = ROVER_SITES.map((rover) => {
    const dir = latLonToDir(rover.latDeg, rover.lonDeg);
    const h = terrainMgr.heightAt('mars', dir);
    const pos = dir.clone().multiplyScalar(h + m(0.05));

    const siteGroup = new THREE.Group();
    siteGroup.position.copy(pos);
    alignToNormal(siteGroup, surfaceNormal(terrainMgr, 'mars', dir, 3389.5));

    const model = rover.roverType === 'nuclear'
      ? createNuclearRover()
      : createSolarRover();
    model.visible = false;
    siteGroup.add(model);

    const billboard = makeBillboard(0xff4422);
    billboard.scale.setScalar(m(15));
    siteGroup.add(billboard);

    group.add(siteGroup);

    return { rover, group: siteGroup, model, billboard, dir, posLocal: pos };
  });

  function update(camRelPosKm) {
    if (!camRelPosKm) return;
    for (const e of entries) {
      const h = terrainMgr.heightAt('mars', e.dir);
      e.posLocal.copy(e.dir).multiplyScalar(h + m(0.05));
      e.group.position.copy(e.posLocal);
      const dx = camRelPosKm.x - e.posLocal.x;
      const dy = camRelPosKm.y - e.posLocal.y;
      const dz = camRelPosKm.z - e.posLocal.z;
      const dist = Math.hypot(dx, dy, dz);
      const modelFade = THREE.MathUtils.clamp((10 - dist) / 5, 0, 1);
      e.model.visible = modelFade > 0.01;
      e.billboard.visible = dist > 0.5;
      const bbScale = THREE.MathUtils.clamp(dist * 0.008, m(15), m(200));
      e.billboard.scale.setScalar(bbScale);
    }
  }

  return { entries, group, update };
}
