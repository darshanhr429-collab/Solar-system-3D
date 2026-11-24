// Spacecraft 3D models and mission timelines (Issue #30: Voyager 1/2, Issue #31: New Horizons).
// Procedural low-poly geometry at 1:1 metric scale, aluminized Kapton foil material.
// Distant visibility enhanced via billboard sprites (makeSpacecraftGlow factory).
// Position propagation matches heliosphere.js Voyager model: ballistic extrapolation + ecliptic frame.

import * as THREE from 'three';
import { KM_PER_AU } from '../config.js';
import { sampledPosition } from '../astro/sampledEphemeris.js';

const DEG = Math.PI / 180;
const m = (v) => v * 0.001; // meters -> kilometers (project world unit is km)

// -- Material Factories (instantiated per model to avoid disposal conflicts) --
// Gold aluminized Kapton multi-layer thermal insulation blanket
function goldFoilMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xd4af37, metalness: 0.8, roughness: 0.4,
  });
}
// Dark structural components: carbon fiber / titanium trusses
function darkStructMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x2a2a2a, metalness: 0.6, roughness: 0.5,
  });
}
// High-gain antenna reflector dish
function dishMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xe8e0d0, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide,
  });
}

// -- Geometry Helpers -----------------------------------------------------
// Parabolic antenna dish: LatheGeometry rotating parabola profile y = depth * (r / radius)^2
// Parabolic reflector focuses radio frequency signals onto subreflector/feed horn.
function parabolicDish(radiusKm, depthKm, radialSeg = 32, profileSeg = 12) {
  const points = [];
  for (let i = 0; i <= profileSeg; i++) {
    const t = i / profileSeg;
    points.push(new THREE.Vector2(t * radiusKm, depthKm * t * t));
  }
  return new THREE.LatheGeometry(points, radialSeg);
}

// -- Voyager Model (Launched 1977, operating in interstellar space) -------
// Key features: 3.7m high-gain dish, decagonal equipment bus, RTG boom, 13m magnetometer boom
function createVoyagerModel() {
  const group = new THREE.Group();
  const gold = goldFoilMat();
  const dark = darkStructMat();
  const dish = dishMat();

// High-gain antenna: 3.7m diameter parabolic dish facing +Y (Earth/Sunward)
// Iconic gold parabolic reflector dish
  const dishRadius = m(1.85);
  const dishDepth = m(0.30);
  const dishMesh = new THREE.Mesh(parabolicDish(dishRadius, dishDepth, 32, 12), dish);
  group.add(dishMesh);

// Subreflector feed horn support struts
  const hubGeo = new THREE.CylinderGeometry(m(0.12), m(0.15), m(0.40), 8);
  const hub = new THREE.Mesh(hubGeo, dark);
  hub.position.y = -m(0.20);
  group.add(hub);

// Decagonal equipment bus housing electronics and command systems
  const busGeo = new THREE.CylinderGeometry(m(0.80), m(0.80), m(0.50), 10);
  const bus = new THREE.Mesh(busGeo, gold);
  bus.position.y = -m(0.60);
  group.add(bus);

// RTG boom extending along -X with 3 Plutonium-238 radioisotope thermoelectric generators
// RTGs produce ~470W electrical power, primary power source in outer Solar System
  const rtgBoomLen = m(3.0);
  const rtgBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.04), m(0.04), rtgBoomLen, 6), dark);
  rtgBoom.rotation.z = Math.PI / 2;
  rtgBoom.position.set(-rtgBoomLen / 2, -m(0.60), 0);
  group.add(rtgBoom);
// 3 RTG power generation cylinders
  for (let i = 0; i < 3; i++) {
    const rtg = new THREE.Mesh(
      new THREE.CylinderGeometry(m(0.12), m(0.12), m(0.30), 8), gold);
    rtg.rotation.z = Math.PI / 2;
    rtg.position.set(-rtgBoomLen - m(0.15), -m(0.60), (i - 1) * m(0.25));
    group.add(rtg);
  }

// Deployable magnetometer boom extending 13m along +X
// Isolates sensitive magnetometers from spacecraft magnetic fields
  const magBoomLen = m(13.0);
  const magBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.02), m(0.02), magBoomLen, 4), dark);
  magBoom.rotation.z = Math.PI / 2;
  magBoom.position.set(magBoomLen / 2, -m(0.60), 0);
  group.add(magBoom);
// Triaxial magnetometer sensor canister
  const magSensor = new THREE.Mesh(
    new THREE.IcosahedronGeometry(m(0.10), 0), dark);
  magSensor.position.set(magBoomLen, -m(0.60), 0);
  group.add(magSensor);

// Science scan platform boom extending along -Z (cameras, IRIS, ultraviolet spectrometer)
  const instBoomLen = m(2.5);
  const instBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.05), m(0.05), instBoomLen, 6), dark);
  instBoom.rotation.x = Math.PI / 2;
  instBoom.position.set(0, -m(0.60), -instBoomLen / 2);
  group.add(instBoom);
// Science instrument package
  const inst = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.30), m(0.20), m(0.20)), gold);
  inst.position.set(0, -m(0.60), -instBoomLen);
  group.add(inst);

  return group;
}

// -- New Horizons Model (Launched 2006, Pluto flyby 2015) -----------------
// Key features: 2.1m high-gain dish, hexagonal equipment bus, RTG, attitude thruster clusters
function createNewHorizonsModel() {
  const group = new THREE.Group();
  const gold = goldFoilMat();
  const dark = darkStructMat();
  const dish = dishMat();

// High-gain antenna: 2.1m diameter parabolic reflector
  const dishRadius = m(1.05);
  const dishDepth = m(0.20);
  const dishMesh = new THREE.Mesh(parabolicDish(dishRadius, dishDepth, 32, 10), dish);
  group.add(dishMesh);

// Hexagonal spacecraft bus (distinctive New Horizons structure)
  const busGeo = new THREE.CylinderGeometry(m(0.70), m(0.70), m(0.50), 6);
  const bus = new THREE.Mesh(busGeo, gold);
  bus.position.y = -m(0.35);
  group.add(bus);

// RTG power source extending along -X (Plutonium-238)
  const rtgArmLen = m(1.5);
  const rtgArm = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.03), m(0.03), rtgArmLen, 4), dark);
  rtgArm.rotation.z = Math.PI / 2;
  rtgArm.position.set(-rtgArmLen / 2, -m(0.35), 0);
  group.add(rtgArm);
// Cylindrical RTG power unit
  const rtg = new THREE.Mesh(
    new THREE.CylinderGeometry(m(0.20), m(0.20), m(0.60), 8), gold);
  rtg.rotation.z = Math.PI / 2;
  rtg.position.set(-rtgArmLen - m(0.30), -m(0.35), 0);
  group.add(rtg);

// Attitude control and trajectory correction thruster pods
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const thruster = new THREE.Mesh(
      new THREE.ConeGeometry(m(0.05), m(0.15), 6), dark);
    thruster.position.set(
      Math.cos(angle) * m(0.70), -m(0.60), Math.sin(angle) * m(0.70));
    thruster.rotation.x = Math.PI; // Downward pointing
    group.add(thruster);
  }

// Instrument platform (+X face mounting LORRI long-range telescope, etc.)
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(m(0.40), m(0.01), m(0.30)), dark);
  platform.position.set(m(0.90), -m(0.35), 0);
  group.add(platform);

  return group;
}

// -- Main Factory Export: Create Spacecraft 3D Models ---------------------
// type: 'voyager1' | 'voyager2' | 'newhorizons'
// Returns THREE.Group at 1:1 scale (km), +Y aligned with high-gain antenna bore
export function createSpacecraftModel(type) {
  switch (type) {
    case 'voyager1':
    case 'voyager2':
      return createVoyagerModel();
    case 'newhorizons':
      return createNewHorizonsModel();
    default:
      throw new Error(`Unknown spacecraft type: ${type}`);
  }
}

// -- Distant Visibility: Billboard Glow Sprite (glint effect) -------------
// 1:1 metric spacecraft are invisible across astronomical distances; billboard maintains visual guide.
export function makeSpacecraftGlow(color = 0x88ccff) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
}

// ════════════════════════════════════════════════════════════════════
// Mission timeline milestones for educational information panels
// ════════════════════════════════════════════════════════════════════
export const SPACECRAFT_TIMELINES = {
  voyager1: {
    nameZh: 'Voyager 1', nameEn: 'Voyager 1',
    events: [
      { date: '1977-09-05', titleZh: 'Launch', titleEn: 'Launch',
        descZh: 'Launched from Cape Canaveral to explore Jupiter and Saturn.' },
      { date: '1979-03-05', titleZh: 'Jupiter Flyby', titleEn: 'Jupiter Flyby',
        descZh: 'Closest approach 349,000 km, first close-ups of Jupiter rings and Io volcanic activity.' },
      { date: '1980-11-12', titleZh: 'Saturn Flyby', titleEn: 'Saturn Flyby',
        descZh: 'Closest approach 124,000 km, investigated Titan atmosphere before departing ecliptic.' },
      { date: '1990-02-14', titleZh: 'Pale Blue Dot', titleEn: 'Pale Blue Dot',
        descZh: 'Looked back at inner planets; Earth was a 0.12-pixel dot — inspired Carl Sagan\'s Pale Blue Dot.' },
      { date: '2012-08-25', titleZh: 'Heliopause Crossing', titleEn: 'Heliopause Crossing',
        descZh: 'First human-made object to cross into interstellar space (~121 AU).' },
      { date: '2026-01-01', titleZh: 'Current', titleEn: 'Current',
        descZh: 'At ~166 AU from the Sun, still communicating weakly with Earth.' },
    ],
  },
  voyager2: {
    nameZh: 'Voyager 2', nameEn: 'Voyager 2',
    events: [
      { date: '1977-08-20', titleZh: 'Launch', titleEn: 'Launch',
        descZh: 'Launched two weeks before Voyager 1 on the Grand Tour trajectory.' },
      { date: '1979-07-09', titleZh: 'Jupiter Flyby', titleEn: 'Jupiter Flyby',
        descZh: 'Closest approach 570,000 km, discovered Jupiter rings and Io active volcanoes.' },
      { date: '1981-08-25', titleZh: 'Saturn Flyby', titleEn: 'Saturn Flyby',
        descZh: 'Closest approach 161,000 km, studied Saturn rings and icy moons.' },
      { date: '1986-01-24', titleZh: 'Uranus Flyby', titleEn: 'Uranus Flyby',
        descZh: 'First and only close exploration of Uranus, discovering 10 new moons and rings.' },
      { date: '1989-08-25', titleZh: 'Neptune Flyby', titleEn: 'Neptune Flyby',
        descZh: 'First and only close exploration of Neptune, discovering the Great Dark Spot and Triton geysers.' },
      { date: '2018-11-05', titleZh: 'Heliopause Crossing', titleEn: 'Heliopause Crossing',
        descZh: 'Second human-made object to enter interstellar space (~119 AU).' },
      { date: '2026-01-01', titleZh: 'Current', titleEn: 'Current',
        descZh: 'At ~139 AU from the Sun, continuing to transmit scientific data.' },
    ],
  },
  newhorizons: {
    nameZh: 'New Horizons', nameEn: 'New Horizons',
    events: [
      { date: '2006-01-19', titleZh: 'Launch', titleEn: 'Launch',
        descZh: 'Launched at 16.26 km/s, the fastest spacecraft departure speed at the time.' },
      { date: '2007-02-28', titleZh: 'Jupiter Flyby', titleEn: 'Jupiter Flyby',
        descZh: 'Jupiter gravity assist to gain speed and test scientific payloads.' },
      { date: '2015-07-14', titleZh: 'Pluto Flyby', titleEn: 'Pluto Flyby',
        descZh: 'Closest approach 12,500 km, discovered nitrogen-ice plains (Sputnik Planitia) and water-ice mountains.' },
      { date: '2019-01-01', titleZh: 'Arrokoth Flyby', titleEn: 'Arrokoth Flyby',
        descZh: 'Flew past Kuiper Belt object Arrokoth (2014 MU69) at 3,500 km, farthest flyby in history.' },
      { date: '2026-01-01', titleZh: 'Current', titleEn: 'Current',
        descZh: 'At ~59 AU from the Sun, continuing extended mission in the Kuiper Belt.' },
    ],
  },
};

// ════════════════════════════════════════════════════════════════════
// New Horizons trajectory and position calculation
// ════════════════════════════════════════════════════════════════════
export const NEW_HORIZONS = {
  id: 'newhorizons',
  nameZh: 'New Horizons', nameEn: 'New Horizons',
  // 2026.0 epoch linear extrapolation parameters
  r0AU: 58.6, rateAUyr: 2.95, lonDeg: 286.0, latDeg: -1.5, epochYear: 2026.0,
  desc: 'Launched in 2006, flew by Pluto in 2015 and Arrokoth in 2019. Continuing its extended Kuiper Belt mission, the fifth probe heading into interstellar space.',
};

/** New Horizons heliocentric position (km, ecliptic J2000) - consistent with voyagerPosition */
export function newHorizonsPosition(jdTT) {
  const sampled = sampledPosition('newhorizons', jdTT);
  if (sampled) return sampled;
  const year = 2000 + (jdTT - 2451545.0) / 365.25;
  const r = (NEW_HORIZONS.r0AU + NEW_HORIZONS.rateAUyr * (year - NEW_HORIZONS.epochYear)) * KM_PER_AU;
  const lon = NEW_HORIZONS.lonDeg * DEG, lat = NEW_HORIZONS.latDeg * DEG;
  return {
    x: r * Math.cos(lat) * Math.cos(lon),
    y: r * Math.cos(lat) * Math.sin(lon),
    z: r * Math.sin(lat),
  };
}

// ════════════════════════════════════════════════════════════════════
// Pluto flyby historical replay trajectory (Issue #31)
// 2015-07-14 11:47 UTC closest approach, ~12,500 km above Pluto surface (~13,688 km from center)
// Relative velocity ~13.78 km/s; approximated as linear trajectory across flyby window (< 0.01 deg deflection)
// ════════════════════════════════════════════════════════════════════
const NH_FLYBY_JD = 2457217.99;       // 2015-07-14 11:47 UTC
const NH_FLYBY_SPEED = 13.78;          // km/s relative to Pluto
const NH_FLYBY_CLOSEST = 13688;        // km from Pluto center

/** New Horizons relative position to Pluto (km, ecliptic J2000)
 *  Valid across flyby window (+- several days); returns linear extrapolation outside window.
 *  Summed with planetPosition('pluto', jdTT) to obtain heliocentric coordinates. */
export function newHorizonsPlutoRelativePosition(jdTT) {
  const dtSec = (jdTT - NH_FLYBY_JD) * 86400;
  // Velocity direction (ecliptic unit vector): lon ~= 286 deg, lat ~= 0 deg
  // Approaches Pluto from sunward side, continuing outbound into Kuiper belt
  const lon = 286 * DEG;
  const vx = Math.cos(lon), vy = Math.sin(lon);
  // Closest approach offset vector perpendicular to velocity (in ecliptic plane)
  const ox = -vy, oy = vx;
  return {
    x: vx * NH_FLYBY_SPEED * dtSec + ox * NH_FLYBY_CLOSEST,
    y: vy * NH_FLYBY_SPEED * dtSec + oy * NH_FLYBY_CLOSEST,
    z: 0,
  };
}

/** Flyby replay configuration: sets simulation clock and camera tracking */
export const NH_FLYBY = {
  jdStart: NH_FLYBY_JD - 1.0,   // Starts 1 day before closest approach
  jdEnd: NH_FLYBY_JD + 1.0,     // Concludes 1 day after closest approach
  jdClosest: NH_FLYBY_JD,
  closestApproachKm: NH_FLYBY_CLOSEST,
  speedKmS: NH_FLYBY_SPEED,
  // Recommended replay time acceleration: 2-day flyby compressed into ~60 seconds viewing
  recommendedRate: (2.0 * 86400) / 60,
};
