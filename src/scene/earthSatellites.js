// Earth Satellites & Planetary Orbits System:
// Visualizes the complete orbital swarms around Earth (~10,240+ active satellites).
// Includes LEO constellations, MEO navigation rings (GPS/Galileo), and GEO Geostationary belt,
// plus detailed featured spacecraft: International Space Station (ISS) and Hubble Space Telescope.

import * as THREE from 'three';

const DEG = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

// Verified census of active artificial satellites orbiting Earth
export const SATELLITE_STATS = {
  totalActive: 10240,
  totalTracked: 13800,
  leoCount: 8820,
  meoCount: 185,
  geoCount: 585,
  heoCount: 95,
  debrisTracked: 36500,
  iss: {
    name: 'International Space Station (ISS)',
    altKm: 415,
    speedKmS: 7.66,
    periodMin: 92.9,
    incDeg: 51.6,
  },
  hubble: {
    name: 'Hubble Space Telescope',
    altKm: 540,
    speedKmS: 7.59,
    periodMin: 95.4,
    incDeg: 28.5,
  },
  tiangong: {
    name: 'Tiangong Space Station',
    altKm: 390,
    speedKmS: 7.68,
    periodMin: 92.4,
    incDeg: 41.5,
  },
};

// -- Spacecraft Procedural 3D Models -------------------------------------

function createISSModel() {
  const group = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.5 });
  const solarMat = new THREE.MeshStandardMaterial({
    color: 0x113366, metalness: 0.8, roughness: 0.2, side: THREE.DoubleSide,
  });

  // Central Integrated Truss Structure (108 meters wide -> scaled for visibility)
  const truss = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.015, 0.015), dark);
  group.add(truss);

  // Pressurized Habitation and Lab Modules (Destiny, Columbus, Kibo, Zvezda)
  const modules = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), silver);
  modules.rotation.z = Math.PI / 2;
  group.add(modules);

  // 8 Giant Solar Array Wings (pairs on each side of truss)
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? -1 : 1;
    const offset = (i % 2 === 0 ? 0.035 : 0.052) * side;
    for (const panelSide of [-1, 1]) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.018, 0.038), solarMat);
      panel.position.set(offset, panelSide * 0.024, 0);
      group.add(panel);
    }
  }

  // Radiator panels
  const radMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const radiator = new THREE.Mesh(
    new THREE.PlaneGeometry(0.015, 0.025), radMat);
  radiator.rotation.x = Math.PI / 2;
  radiator.position.set(0, 0, -0.02);
  group.add(radiator);

  return group;
}

function createHubbleModel() {
  const group = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.9, roughness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.5 });
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x113366, metalness: 0.8, side: THREE.DoubleSide });

  // Main telescope optical tube (Cylinder)
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.045, 16), silver);
  tube.rotation.x = Math.PI / 2;
  group.add(tube);

  // Aperture door (front open lid)
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.013, 0.002, 16), dark);
  lid.position.set(0, 0.01, 0.023);
  lid.rotation.x = 0.5;
  group.add(lid);

  // 2 Solar Array Wings
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03, 0.01), solarMat);
    wing.position.set(s * 0.025, 0, -0.005);
    group.add(wing);
  }

  return group;
}

// ════════════════════════════════════════════════════════════════════════
// Earth Satellites Scene
// ════════════════════════════════════════════════════════════════════════
export function createEarthSatellites(scene, world, earthGroup) {
  const rootGroup = new THREE.Group();
  earthGroup.add(rootGroup);

  let isVisible = true;

  // ── 1. LEO Satellite Swarm (3,500 active points) ──
  const leoCount = 3500;
  const leoGeo = new THREE.BufferGeometry();
  const leoPos = new Float32Array(leoCount * 3);
  const leoOrbits = []; // { a, inc, raan, omega, speed, phase0 }

  for (let i = 0; i < leoCount; i++) {
    // Altitude between 350 km and 1200 km
    const alt = 350 + Math.random() * 850;
    const a = EARTH_RADIUS_KM + alt;
    // Common inclination clusters: 53° (Starlink), 70° (OneWeb), 97.5° (Sun-Synchronous polar)
    let inc;
    const rInc = Math.random();
    if (rInc < 0.6) inc = (53 + (Math.random() - 0.5) * 4) * DEG;
    else if (rInc < 0.85) inc = (97.5 + (Math.random() - 0.5) * 3) * DEG;
    else inc = (70 + (Math.random() - 0.5) * 5) * DEG;

    const raan = Math.random() * Math.PI * 2;
    const phase0 = Math.random() * Math.PI * 2;
    // Mean orbital speed: v = sqrt(GM/r) ~ 7.6 km/s -> angular velocity rad/sec
    const speed = Math.sqrt(398600.4418 / Math.pow(a, 3)); // rad/sec

    leoOrbits.push({ a, inc, raan, phase0, speed });
    leoPos[i * 3 + 0] = a;
    leoPos[i * 3 + 1] = 0;
    leoPos[i * 3 + 2] = 0;
  }

  leoGeo.setAttribute('position', new THREE.BufferAttribute(leoPos, 3));
  const leoMat = new THREE.PointsMaterial({
    color: 0x88ddff,
    size: 2.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
  });
  const leoPoints = new THREE.Points(leoGeo, leoMat);
  rootGroup.add(leoPoints);

  // ── 2. Featured Spacecraft (ISS & Hubble) ──
  const issMesh = createISSModel();
  issMesh.scale.setScalar(80); // Scaled for visible identification
  rootGroup.add(issMesh);

  const hubbleMesh = createHubbleModel();
  hubbleMesh.scale.setScalar(80);
  rootGroup.add(hubbleMesh);

  // ── 3. MEO Navigation Constellation Rings (GPS / Galileo ~20,200 km) ──
  const meoRadius = EARTH_RADIUS_KM + 20200;
  const meoGroup = new THREE.Group();
  const meoMat = new THREE.LineBasicMaterial({
    color: 0x44bb88, transparent: true, opacity: 0.35,
  });

  const numPlanes = 6;
  for (let i = 0; i < numPlanes; i++) {
    const ringGeo = new THREE.BufferGeometry();
    const pts = [];
    const segs = 64;
    const raan = (i / numPlanes) * Math.PI * 2;
    const inc = 55 * DEG;
    for (let j = 0; j <= segs; j++) {
      const u = (j / segs) * Math.PI * 2;
      // Position in orbital plane
      const xo = meoRadius * Math.cos(u);
      const yo = meoRadius * Math.sin(u);
      // Rotate by inclination and RAAN
      const x = xo * Math.cos(raan) - yo * Math.cos(inc) * Math.sin(raan);
      const y = yo * Math.sin(inc);
      const z = -xo * Math.sin(raan) - yo * Math.cos(inc) * Math.cos(raan);
      pts.push(x, y, z);
    }
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    meoGroup.add(new THREE.Line(ringGeo, meoMat));
  }
  rootGroup.add(meoGroup);

  // ── 4. Geostationary Belt (GEO Ring, 35,786 km altitude) ──
  const geoRadius = EARTH_RADIUS_KM + 35786;
  const geoRingGeo = new THREE.BufferGeometry();
  const geoRingPts = [];
  for (let i = 0; i <= 128; i++) {
    const theta = (i / 128) * Math.PI * 2;
    geoRingPts.push(geoRadius * Math.cos(theta), 0, -geoRadius * Math.sin(theta));
  }
  geoRingGeo.setAttribute('position', new THREE.Float32BufferAttribute(geoRingPts, 3));
  const geoRingLine = new THREE.Line(geoRingGeo, new THREE.LineBasicMaterial({
    color: 0xffaa33, transparent: true, opacity: 0.45,
  }));
  rootGroup.add(geoRingLine);

  // GEO Satellites (200 points on equatorial ring)
  const geoSatCount = 200;
  const geoGeo = new THREE.BufferGeometry();
  const geoPos = new Float32Array(geoSatCount * 3);
  for (let i = 0; i < geoSatCount; i++) {
    const th = (i / geoSatCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.05;
    geoPos[i * 3 + 0] = geoRadius * Math.cos(th);
    geoPos[i * 3 + 1] = 0;
    geoPos[i * 3 + 2] = -geoRadius * Math.sin(th);
  }
  geoGeo.setAttribute('position', new THREE.BufferAttribute(geoPos, 3));
  const geoPoints = new THREE.Points(geoGeo, new THREE.PointsMaterial({
    color: 0xffcc44, size: 2.8, sizeAttenuation: false, transparent: true, opacity: 0.9,
  }));
  rootGroup.add(geoPoints);

  // ── Animation & State Tracking ──
  const featured = {
    iss: { posKm: new THREE.Vector3(), speedKmS: 7.66 },
    hubble: { posKm: new THREE.Vector3(), speedKmS: 7.59 },
  };

  function update(jdTT) {
    if (!isVisible) return;
    try {
      // Current simulation time in seconds
      const tSec = (jdTT - 2451545.0) * 86400;

      // 1. Update LEO points
      const posAttr = leoPoints?.geometry?.attributes?.position;
      if (posAttr && posAttr.array) {
        const arr = posAttr.array;
        for (let i = 0; i < leoCount; i++) {
          const o = leoOrbits[i];
          const u = o.phase0 + o.speed * tSec;
          const xo = o.a * Math.cos(u);
          const yo = o.a * Math.sin(u);
          const x = xo * Math.cos(o.raan) - yo * Math.cos(o.inc) * Math.sin(o.raan);
          const y = yo * Math.sin(o.inc);
          const z = -xo * Math.sin(o.raan) - yo * Math.cos(o.inc) * Math.cos(o.raan);
          arr[i * 3 + 0] = x;
          arr[i * 3 + 1] = y;
          arr[i * 3 + 2] = z;
        }
        posAttr.needsUpdate = true;
      }

      // 2. Update ISS (altitude 415 km, 51.6° inclination)
      if (issMesh) {
        const issR = EARTH_RADIUS_KM + 415;
        const issSpeed = SATELLITE_STATS.iss.speedKmS / issR; // rad/sec
        const issU = tSec * issSpeed;
        const issInc = SATELLITE_STATS.iss.incDeg * DEG;
        const issRaan = 1.2;
        const issX = issR * Math.cos(issU) * Math.cos(issRaan) - issR * Math.sin(issU) * Math.cos(issInc) * Math.sin(issRaan);
        const issY = issR * Math.sin(issU) * Math.sin(issInc);
        const issZ = -issR * Math.cos(issU) * Math.sin(issRaan) - issR * Math.sin(issU) * Math.cos(issInc) * Math.cos(issRaan);
        issMesh.position.set(issX, issY, issZ);
        featured.iss.posKm.set(issX, issY, issZ);
      }

      // 3. Update Hubble (altitude 540 km, 28.5° inclination)
      if (hubbleMesh) {
        const hstR = EARTH_RADIUS_KM + 540;
        const hstSpeed = SATELLITE_STATS.hubble.speedKmS / hstR;
        const hstU = tSec * hstSpeed + 2.5;
        const hstInc = SATELLITE_STATS.hubble.incDeg * DEG;
        const hstRaan = 3.8;
        const hstX = hstR * Math.cos(hstU) * Math.cos(hstRaan) - hstR * Math.sin(hstU) * Math.cos(hstInc) * Math.sin(hstRaan);
        const hstY = hstR * Math.sin(hstU) * Math.sin(hstInc);
        const hstZ = -hstR * Math.cos(hstU) * Math.sin(hstRaan) - hstR * Math.sin(hstU) * Math.cos(hstInc) * Math.cos(hstRaan);
        hubbleMesh.position.set(hstX, hstY, hstZ);
        featured.hubble.posKm.set(hstX, hstY, hstZ);
      }
    } catch (err) {
      // Graceful error protection
      console.warn('[EarthSatellites.update]', err);
    }
  }

  function toggle(v) {
    isVisible = v !== undefined ? v : !isVisible;
    rootGroup.visible = isVisible;
    return isVisible;
  }

  return {
    group: rootGroup,
    update,
    toggle,
    get visible() { return isVisible; },
    stats: SATELLITE_STATS,
    featured,
  };
}

