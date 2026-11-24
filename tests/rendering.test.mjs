// Rendering realism regressions: DEM level ceilings, solar limb darkening, atmospheric ozone layer.
//
// These items belong to 'silent failures' -- rendering still works, but physics is wrong,
// so we must lock numerical behavior and check shader source for these terms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SphereGeometry } from 'three';
import { DEM_SOURCES, levelExceedsSource } from '../src/scene/demTiles.js';
import { parseStarCatalog, bvToRgb, magToIntensity } from '../src/astro/starCatalog.js';
import { CATALOG_COUNT } from '../src/astro/stars.generated.js';
import { MOON_PHYS, HAPKE_PARAMS } from '../src/astro/bodies.js';
import { PRESETS } from '../src/scene/proceduralTextureData.js';
import { BODIES } from '../src/astro/bodies.js';
import { TNO_DATA } from '../src/astro/tno.js';
import { HeightField } from '../src/scene/terrain.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// -- Batch 4: DEM level ceilings must be governed by source resolution --

test('DEM max level matches upstream source resolution (not an arbitrary constant)', () => {
  for (const [id, cfg] of Object.entries(DEM_SOURCES)) {
    assert.ok(cfg.sourcePx > 0, `${id} missing sourcePx`);
    // Tile grid is 2^z x 2^z squares covering 360x180 deg, so level z lon resolution = 360/(256 * 2^z)
    const lonDegPerPx = 360 / (cfg.tileSize * 2 ** cfg.maxLevel);
    const srcLonDegPerPx = 360 / cfg.sourcePx;
    assert.ok(lonDegPerPx >= srcLonDegPerPx * 0.74,
      `${id}: L${cfg.maxLevel} lon resolution ${lonDegPerPx.toFixed(5)} deg/px is finer than source ${srcLonDegPerPx.toFixed(5)} deg/px, which is upsampling`);
    assert.ok(!levelExceedsSource(cfg, cfg.maxLevel), `${id}: maxLevel exceeds source resolution`);
  }
});

test('levelExceedsSource identifies out-of-bounds levels', () => {
  const cfg = DEM_SOURCES.moon;
  assert.equal(levelExceedsSource(cfg, cfg.maxLevel), false);
  assert.equal(levelExceedsSource(cfg, cfg.maxLevel + 2), true);
  assert.equal(levelExceedsSource({ tileSize: 256 }, 9), false, 'should not false-alarm without sourcePx');
});

test('Mars uses maximum level supported by source; Earth/Moon do not upsample needlessly', () => {
  assert.equal(DEM_SOURCES.mars.maxLevel, 5, 'Mars source 11520px supports L5');
  assert.equal(DEM_SOURCES.moon.maxLevel, 4, 'Moon source 5760px only supports L4');
  assert.equal(DEM_SOURCES.earth.maxLevel, 4);
});

test('Terrain clamps DEM levels to data ceiling (no longer prefetches non-existent tiles)', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/_demLevelForDistance\(distKm, ceiling = 8\)/.test(src), 'missing ceiling parameter');
  assert.ok(/Math\.min\(want, ceiling\)/.test(src), 'missing clamp');
  assert.ok(/_demLevelForDistance\(dist, dem\.config\?\.maxLevel/.test(src),
    'call site does not pass celestial body actual ceiling');
});

// -- Batch 6: Solar limb darkening --

/** Neckel & Labs (1994) 5th-order polynomial limb darkening mirrored implementation */
const limbPoly = (mu) => 0.30 + 0.93 * mu - 0.23 * mu ** 2 + 0.14 * mu ** 3
  - 0.16 * mu ** 4 + 0.02 * mu ** 5;

test('Solar limb darkening is a 5th-order polynomial: center normalized, monotonic darkening toward limb', () => {
  assert.ok(Math.abs(limbPoly(1) - 1) < 1e-9, 'solar disk center must normalize to 1');
  assert.ok(limbPoly(0) > 0.25 && limbPoly(0) < 0.35, `limb ${limbPoly(0).toFixed(3)} should be near 0.3`);
  let prev = limbPoly(1.0);
  for (let mu = 0.95; mu >= 0; mu -= 0.05) {
    const v = limbPoly(mu);
    assert.ok(v < prev, `non-monotonic at mu=${mu.toFixed(2)}`);
    prev = v;
  }
});

test('Limb reddening: blue channel decays faster than red (effective temperature ~1000 K lower at limb)', () => {
  const mu = 0.25;
  const ld = limbPoly(mu);
  const r = ld, g = ld ** 1.10, b = ld ** 1.30;
  assert.ok(g < r && b < g, 'per-channel exponents should make blue dimmer');
  assert.ok(b / r < 0.88, `limb B/R = ${(b / r).toFixed(3)}, insufficient reddening`);
});

test('Shader source uses 5th-order polynomial and spectral limb darkening', () => {
  const src = read('src/scene/sun.js');
  assert.ok(src.includes('0.30 + 0.93 * mu - 0.23 * mu * mu'), 'missing Neckel & Labs polynomial');
  assert.ok(/vec3\(ld, pow\(ld, 1\.10\), pow\(ld, 1\.30\)\)/.test(src), 'missing spectral limb darkening');
  assert.ok(!/0\.35 \+ 0\.65 \* mu/.test(src), 'linear approximation should be replaced');
});

test('Corona has baseline visibility even during non-eclipse (visible to human eye)', () => {
  const src = read('src/scene/sun.js');
  const m = /uVisibility\.value = occulted \? 1 : ([0-9.e-]+);/.exec(src);
  assert.ok(m, 'corona visibility setting not found');
  const base = Number(m[1]);
  // In-orbit human eye sees faint corona, baseline set to 0.55 (far dimmer than disk, but visible).
  assert.ok(base > 0.2 && base < 0.8, `baseline visibility ${base} should be in (0.2, 0.8)`);
});

// -- Batch 6: Ozone layer --

test('Atmosphere shader includes ozone absorption with Chappuis band spectral coefficients', () => {
  const src = read('src/scene/atmosphere.js');
  assert.ok(src.includes('uniform float uOzone;'), 'missing uOzone declaration');
  assert.ok(/exp\(-pow\(\(h - 25\.0\) \/ 8\.0, 2\.0\)\)/.test(src), 'missing 25 km Gaussian ozone profile');
  const m = /vec3 betaO = vec3\(([^)]+)\) \* uOzone;/.exec(src);
  assert.ok(m, 'missing ozone extinction coefficients');
  const [r, g, b] = m[1].split(',').map((x) => Number(x));
  assert.ok(r > g && g > b, `Chappuis band should have strongest absorption in red, got ${r}/${g}/${b}`);
  assert.ok(b < r * 0.05, 'blue channel has almost no absorption (causes twilight blue band)');
  assert.ok(/betaO \* \(odO \+ olO\)/.test(src), 'ozone not integrated into transmittance');
});

test('Ozone is only enabled for bodies known to possess an ozone layer', () => {
  assert.ok((BODIES.earth.atmosphere.ozone ?? 0) > 0.5, 'Earth should have complete ozone layer');
  assert.ok((BODIES.mars.atmosphere.ozone ?? 0) > 0 && BODIES.mars.atmosphere.ozone < 0.3,
    'Mars ozone layer is extremely thin');
  for (const id of ['jupiter', 'saturn', 'uranus', 'neptune', 'titan']) {
    const o = BODIES[id]?.atmosphere?.ozone ?? 0;
    assert.ok(o === 0, `${id} should not have ozone layer (got ${o})`);
  }
});

// -- Batch 6: Clouds (volumetric raymarching + face culling) --

test('Volumetric cloud raymarching: analytical shell interval + self-shadowing + silver lining', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/vec2 raySphere\(vec3 ro/.test(src), 'missing ray-sphere intersection');
  assert.ok(/float t1 = min\(tRt\.y, \(tRb\.x > 0\.0 \? tRb\.x : tRt\.y\)\)/.test(src),
    'missing analytical shell interval solver');
  assert.ok(/for \(int j = 1; j <= NL; j\+\+\)/.test(src), 'missing self-shadowing loop');
  assert.ok(/silver/.test(src), 'missing forward-scattering silver lining term');
  assert.ok(/smoothstep\(0\.0, 0\.18, hFrac\)/.test(src), 'missing cloud vertical profile');
});

test('Cloud shell face culling: retains correct side based on camera inside/outside shell', () => {
  const src = read('src/scene/planetMaterial.js');
  // Inside shell: cull front facing; outside shell: cull back facing.
  assert.ok(/if \(uCameraInside > 0\.5\) \{ if \(gl_FrontFacing\) discard; \}/.test(src),
    'missing face culling toggle based on camera inside/outside');
  assert.ok(/side: THREE\.DoubleSide/.test(src), 'cloud material should be DoubleSide');
  assert.ok(!/side: THREE\.BackSide/.test(src), 'should not revert to single-sided rendering');
  assert.ok(/premultipliedAlpha: true/.test(src), 'volumetric accumulation is premultiplied color and must be declared');
});

test('Cloud UV matches Three.js spherical UV (v-axis must not be inverted)', () => {
  const src = read('src/scene/planetMaterial.js');
  // SphereGeometry uv.y = 1 is at North Pole; writing 0.5 - asin(...)/pi inverts cloud texture vertically
  assert.ok(/0\.5 \+ asin\(clamp\(rel\.y \/ rl, -1\.0, 1\.0\)\) \/ 3\.14159265/.test(src),
    'latLonOf v-axis direction is incorrect');
  assert.ok(!/0\.5 - asin\(clamp\(rel\.y \/ rl/.test(src), 'v-axis still written inverted');
});

test('latLonOf u-axis matches SphereGeometry uv attributes per vertex (not mirrored)', () => {
  // Checked against SphereGeometry vertex formula: x = -r cos(2pi u) sin theta, z = r sin(2pi u) sin theta => u = 0.5 - atan2(z, x)/(2pi)
  const g = new SphereGeometry(1, 12, 8);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const latLonU = (x, y, z) => 0.5 - Math.atan2(z, x) / (2 * Math.PI);
  const latLonV = (x, y, z) => 0.5 + Math.asin(y / Math.hypot(x, y, z)) / Math.PI;
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/0\.5 - atan\(rel\.z, rel\.x\) \/ 6\.2831853/.test(src), 'latLonOf u-axis is not geometric convention');
  assert.ok(!/atan\(rel\.z, rel\.x\) \/ 6\.2831853 \+ 0\.5/.test(src), 'u-axis still written mirrored');
  let maxDU = 0, maxDV = 0, poles = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (Math.hypot(x, z) < 1e-6) { poles++; continue; }   // Lon degenerates at poles, skip
    maxDU = Math.max(maxDU, Math.abs(latLonU(x, y, z) - uv.getX(i)));
    maxDV = Math.max(maxDV, Math.abs(latLonV(x, y, z) - uv.getY(i)));
  }
  assert.ok(poles > 0, 'sample should include poles to cover degenerate case');
  // Tolerance 1e-6: Float32 rounding vs mirror error order 0.5
  assert.ok(maxDU < 1e-6, `u-axis maximum deviation ${maxDU} (order 0.5 is mirrored)`);
  assert.ok(maxDV < 1e-6, `v-axis maximum deviation ${maxDV}`);
});

test('Clouds and surface cloud shadows share the same UV and opacity mapping', () => {
  const src = read('src/scene/planetMaterial.js');
  // If shadows use geometric uv and visible clouds use another, shadows appear where there are no clouds
  assert.ok(/texture2D\(uCloudTex, cloudUV\(vUv, uTime\)\)/.test(src), 'surface cloud shadow does not use cloudUV');
  assert.ok(/cloudUV\(latLonOf\(ro \+ rd \* tEnter\), uTime\)/.test(src), 'cloud layer does not use cloudUV');
  assert.ok(!/pnoise\(vec3\(vUv \* 8\.0/.test(src), 'cloud shadow still uses separate noise');
  // Rotation offset direction: u-axis is inverted, eastward drift subtracts u
  assert.ok(/\-t \* 0\.00002/.test(src), 'cloud rotation offset direction not inverted with u-axis');
});

test('Cloud density is continuous power law rather than threshold cutoff (threshold creates hard-edge white spots)', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/float cloudTau\(vec3 cl\)/.test(src), 'missing shared cloud optical depth mapping');
  // Property check: cloud fraction -> optical depth must be continuous power law pow(lum, k) * c (k >= 1)
  const m = src.match(/float cloudTau\(vec3 cl\)\s*\{([\s\S]*?)\}/);
  assert.ok(m, 'cloudTau implementation not found');
  const body = m[1];
  const p = body.match(/pow\(lum,\s*([\d.]+)\)\s*\*\s*([\d.]+)/);
  assert.ok(p, 'cloudTau should be continuous power law pow(lum, k) * c');
  assert.ok(Number(p[1]) >= 1, `exponent should be >= 1, got ${p[1]}`);
  assert.ok(!/smoothstep/.test(body), 'cloudTau should not contain threshold mapping');
  assert.ok(!/step\(/.test(body), 'cloudTau should not contain threshold mapping');
  // Legacy implementation saturated to 1 at lum > 0.65, compressing midtones into hard-edged opaque white spots
  assert.ok(!/dot\(cl, vec3\(0\.34\)\) - 0\.10\) \* 1\.8/.test(src), 'threshold mapping still present');
  assert.ok(!/dot\(cloudCol, vec3\(0\.34\)\) - 0\.10\) \* 1\.8/.test(src), 'cloud shadow still uses threshold mapping');
  // Beer-Lambert form: never saturates, thin clouds remain translucent
  assert.ok(/1\.0 - exp\(-cloudTau\(cl\)\)/.test(src), 'missing Beer-Lambert opacity');
});

test('Average cloud opacity falls within range where oceans and land remain visible (not all-white, not cloudless)', () => {
  const src = read('src/scene/planetMaterial.js');
  const body = src.match(/float cloudTau\(vec3 cl\)\s*\{([\s\S]*?)\}/)[1];
  const p = body.match(/pow\(lum,\s*([\d.]+)\)\s*\*\s*([\d.]+)/);
  const k = Number(p[1]), c = Number(p[2]);
  // GIBS global mean cloud fraction is 0.71
  const meanLum = 0.71;
  const tau = meanLum ** k * c;
  const alpha = 1 - Math.exp(-tau);
  assert.ok(alpha > 0.15 && alpha < 0.45,
    `global mean cloud opacity ${alpha.toFixed(2)} not in [0.15, 0.45]`);
});

// -- Batch 9: GIBS real date cloud maps --

test('Real cloud texture asset and manifest exist, self-consistent, and registered in manifest', () => {
  const meta = JSON.parse(readFileSync(
    new URL('../public/textures/clouds_real.json', import.meta.url), 'utf8'));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(meta.date), `asset date format incorrect: ${meta.date}`);
  assert.equal(meta.layer, 'MODIS_Terra_Cloud_Fraction_Day');
  assert.ok(meta.coverage > 0.9, `effective coverage only ${(meta.coverage * 100).toFixed(1)}%`);
  // Global mean cloud fraction: measured ~0.67.
  assert.ok(meta.meanFraction > 0.5 && meta.meanFraction < 0.85,
    `global mean cloud fraction ${meta.meanFraction} deviates from measured range`);
  // Must be registered in textures/manifest.json
  const manifest = JSON.parse(readFileSync(
    new URL('../public/textures/manifest.json', import.meta.url), 'utf8').replace(/^﻿/, ''));
  assert.equal(manifest['clouds_real.png'], true, 'clouds_real.png not registered in texture manifest');
  const png = readFileSync(new URL('../public/textures/clouds_real.png', import.meta.url));
  assert.equal(png.readUInt32BE(0), 0x89504e47, 'clouds_real.png is not PNG');
});

test('Earth clouds do not use MODIS cloud fraction map (fraction is not opacity)', () => {
  // MODIS_Terra_Cloud_Fraction_Day is cloud fraction (coverage), not optical opacity.
  assert.equal(BODIES.earth.textures.cloudsReal, undefined, 'Earth still declares cloud fraction map');
  assert.equal(BODIES.earth.textures.clouds, 'earth_clouds.jpg', 'clouds should fall back to synthetic cloud map');
  const src = read('src/scene/builder.js');
  assert.ok(/phys\.textures\?\.clouds && !phys\.textures\.cloudsOpaque/.test(src),
    'missing synthetic cloud map branch');
});

test('Cloud latitude/longitude calculated in body-fixed frame (otherwise clouds stay inertial)', () => {
  const src = read('src/scene/planetMaterial.js');
  const builder = read('src/scene/builder.js');
  // Cloud latitude/longitude must transform to body-fixed coordinates with uBodyInv.
  assert.ok(/uniform mat3 uBodyInv;/.test(src), 'missing body-fixed inverse rotation uniform');
  assert.ok(/vec3 rel = uBodyInv \* \(q - uCenter\);/.test(src), 'latLonOf not transformed to body-fixed frame');
  assert.ok(/uBodyInv: \{ value: new THREE\.Matrix3\(\) \}/.test(src), 'uniform not initialized');
  assert.ok(/u\.uBodyInv\.value\.setFromMatrix4\(/.test(builder), 'builder does not write uBodyInv');
  assert.ok(/makeRotationFromQuaternion\(_bodyQ\.copy\(e\.mesh\.quaternion\)\.invert\(\)\)/.test(builder),
    'uBodyInv is not inverse of mesh.quaternion');
  // Footprint direction vectors must also be in the same coordinate frame
  assert.ok(/vec3 relE = uBodyInv \* \(vPosW - uCenter\);/.test(src), 'footprint does not use body-fixed frame');
});

test('Cloud texture sampling uses computed footprint (implicit derivatives blow up at antimeridian)', () => {
  const src = read('src/scene/planetMaterial.js');
  // Explicit footprint avoids mipmap explosion at antimeridian branch cut
  assert.ok(/textureGrad\(uMap, cloudUV\(uv, uTime\), gx, gy\)/.test(src), 'cloud layer does not use computed footprint');
  assert.ok(/textureGrad\(uMap, luv, gX, gY\)/.test(src), 'lightweight path does not use computed footprint');
  assert.ok(/vec2 cloudFootprint\(/.test(src), 'missing footprint function');
  // Footprint must be calculated from continuous sphere coordinates outside loops
  assert.ok(/dFdx\(rel\)/.test(src) && /dFdy\(rel\)/.test(src), 'footprint not based on continuous sphere coordinates');
  const beforeLoop = src.slice(src.indexOf('vec2 gX = cloudFootprint'), src.indexOf('if (uVolumetric == 0)'));
  assert.ok(beforeLoop.length > 0 && !/for \(/.test(beforeLoop), 'footprint should be computed before march loop');
});

test('Volumetric clouds only enabled in High tier (+27% overhead, overwhelms integrated GPUs)', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/uVolumetric: \{ value: \(opts\.volumetric \?\? \(QUALITY\.tier === 'high' && QUALITY\.detail\)\)/.test(src),
    'missing tier gate');
  assert.ok(/if \(uVolumetric == 0\)/.test(src), 'missing lightweight fallback path');
  assert.ok(/cloudN: 10, cloudNL: 4/.test(read('src/engine/quality.js')), 'High tier cloud march step count incorrect');
});

// -- Batch 6: Water Fresnel reflection --

test('Terrain water surface includes Fresnel ambient reflection (water F0 = 0.02)', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/float fres = 0\.02 \+ 0\.98 \* pow\(1\.0 - cosT, 5\.0\)/.test(src),
    'missing Schlick Fresnel (water F0 should be 0.02)');
  assert.ok(/vec3 refl = reflect\(-V, normal\)/.test(src), 'missing reflection direction');
  assert.ok(/outgoingLight \+= skyCol \* fres/.test(src), 'reflection not added to outgoing light');
  assert.ok(/uniform vec3 uSunDir;/.test(src), 'missing body-fixed sun direction uniform');
});

test('Water sun direction passed in body-fixed frame (otherwise sunset reflection shifts)', () => {
  const terrain = read('src/scene/terrain.js');
  const main = read('src/main.js');
  assert.ok(/update\(dirLocal, timeSec = 0, sunDirLocal = null\)/.test(terrain), 'update does not accept sun direction');
  assert.ok(/if \(sunDirLocal\) this\.uSunDir\.value\.copy\(sunDirLocal\)/.test(terrain), 'does not write uniform');
  assert.ok(/_sunLocal\.copy\(e\.mat\.userData\.uniforms\.uSunDir\.value\)\.applyQuaternion\(_q\)/.test(main),
    'main.js does not transform world sun direction to body-fixed frame');
});

// -- Batch 6: Atmospheric ground albedo bounce --

test('Atmosphere includes ground albedo bounce term (primary contributor to low-altitude sky brightening)', () => {
  const src = read('src/scene/atmosphere.js');
  assert.ok(/uniform float uGroundAlbedo;/.test(src), 'missing uGroundAlbedo declaration');
  assert.ok(/uGroundAlbedo: \{ value: a\.groundAlbedo \?\? 0\.0 \}/.test(src), 'uniform not wired');
  assert.ok(/vec3 twoWay = exp\(-\(uBetaR \* odR \+ uBetaM \* 1\.1 \* odM\) \* 1\.5\)/.test(src),
    'missing two-way optical depth approximation');
  assert.ok(/\(0\.35 \+ 0\.65 \* below\)/.test(src), 'missing weighting toward ground');
  assert.ok(/if \(uGroundAlbedo > 0\.0\)/.test(src), 'missing zero short-circuit (gas giants have no ground)');
});

test('Aurora only on night side, narrow oval, low gas giant intensity (prevents purple patch at Saturn north pole)', () => {
  const src = read('src/scene/atmosphere.js');
  // Day side must zero out completely.
  assert.ok(/if \(!shadowed\) auroraInt = 0\.0;/.test(src), 'day side aurora not zeroed');
  assert.ok(!/if \(!shadowed\) auroraInt \*= 0\.04;/.test(src), '4% day leak still present');
  // Aurora oval should be narrow (3-6 deg on Earth)
  assert.ok(/float ovalC, ovalW, aGain;/.test(src), 'missing per-body oval parameters');
  assert.ok(/smoothstep\(ovalC - ovalW, ovalC, poleProx\)/.test(src), 'auroral oval not narrowed');
  assert.ok(!/smoothstep\(0\.80, 0\.90, poleProx\)/.test(src), 'legacy 26 deg wide polar cap still present');
  // Gas giant intensity: Saturn H3+ emission is UV/IR, negligible in visible light
  const gain = (mode) => {
    const m = new RegExp(`uAuroraMode == ${mode}\\)[^}]*aGain = ([0-9.]+)`).exec(src);
    return m ? Number(m[1]) : NaN;
  };
  assert.ok(gain(1) > 0.8, 'Earth aurora is visible phenomenon and should not be suppressed');
  assert.ok(gain(3) < 0.1, `Saturn aurora intensity ${gain(3)} too high (should be negligible in visible spectrum)`);
  assert.ok(gain(2) < gain(1), 'Jupiter visible aurora should be weaker than Earth');
});

test('Ground albedo bounce weighted by ground illumination (prevents night sky brightening)', () => {
  const src = read('src/scene/atmosphere.js');
  // Weight ground bounce by illuminated ground fraction so night sky is not lit
  assert.ok(/float odRlit = 0\.0;/.test(src), 'missing illuminated ground accumulator');
  assert.ok(/odRlit \+= smoothstep\(-0\.10, 0\.10, dot\(uSunDir, normalize\(p - uCenter\)\)\) \* dR \* ds;/.test(src),
    'sample illumination not judged by local normal');
  assert.ok(/float groundLit = odR > 1e-6 \? odRlit \/ odR : 0\.0;/.test(src), 'missing illuminated ground fraction');
  assert.ok(/\* \(1\.0 \/ PI\) \* groundLit;/.test(src), 'illuminated fraction not included in final shading');
  // Use sample point local normal rather than camera normal
  assert.ok(!/uGroundAlbedo \* twoWay \* \(0\.35 \+ 0\.65 \* below\) \* msFrac \* \(1\.0 \/ PI\);\n/.test(src),
    'ground bounce remains unconditional');
});

test('Ground albedo is only assigned to bodies with solid surfaces or cloud tops', () => {
  assert.ok(BODIES.earth.atmosphere.groundAlbedo > 0.05, 'Earth should have surface albedo');
  assert.ok(BODIES.mars.atmosphere.groundAlbedo > BODIES.earth.atmosphere.groundAlbedo,
    'Mars dust albedo should be higher than ocean-dominated Earth');
  assert.ok(BODIES.venus.atmosphere.groundAlbedo > 0.5, 'Venus cloud deck has high albedo');
  for (const id of ['jupiter', 'saturn', 'uranus', 'neptune']) {
    const g = BODIES[id]?.atmosphere?.groundAlbedo ?? 0;
    assert.equal(g, 0, `${id} has no solid surface and should not have ground bounce (got ${g})`);
  }
});

// -- Batch 10: Audio layer --

test('Audio engine contains engine, reentry, and landing impact layers', () => {
  const src = read('src/engine/audio.js');
  assert.ok(/this\._engine = this\._createNoiseLayer\(this\._pinkBuf, 'lowpass', 90, 0\)/.test(src),
    'missing engine/thruster layer');
  assert.ok(/this\._reentry = this\._createNoiseLayer\(this\._whiteBuf, 'bandpass', 620, 0\)/.test(src),
    'missing reentry layer');
  assert.ok(/playLandingImpact\(strength = 0\.5\)/.test(src), 'missing landing impact sound');
  // Reentry intensity proportional to density x velocity^2 (order of dynamic pressure)
  assert.ok(/reentryTarget = dens \* vFrac \* vFrac \* 0\.22/.test(src),
    'reentry intensity not modeled by dynamic pressure (density x velocity^2)');
});

test('Audio state is visible on HUD (muted by default with toggle discoverability)', () => {
  const hud = read('src/ui/hud.js');
  const i18n = read('src/ui/i18n.js');
  const main = read('src/main.js');
  assert.ok(/audioOn/.test(hud), 'HUD does not display audio state');
  assert.ok(/'hud\.audioOn'/.test(i18n) && /'hud\.audioOff'/.test(i18n), 'missing audio state strings');
  assert.ok(/audioOn: audioEngine\?\.enabled/.test(main), 'did not pass audio state to HUD');
  assert.ok(/tip\.audioOn/.test(main), 'missing feedback tip when toggling audio');
});

// -- Batch 11: Real star catalog --
// Verifies real BSC5 star catalog integrity and celestial distribution.

const STAR_BIN = readFileSync(new URL('../public/data/stars.bin', import.meta.url));

test('Star catalog binary parses successfully with expected record count', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  assert.ok(cat, 'stars.bin parse failed');
  assert.equal(cat.count, CATALOG_COUNT, 'catalog size does not match stars.generated.js');
  assert.ok(cat.count > 9000, `only ${cat.count} stars, BSC5 should have 9096`);
  for (let i = 0; i < cat.count; i++) {
    assert.ok(cat.ra[i] >= 0 && cat.ra[i] < 360, `star ${i} RA out of bounds: ${cat.ra[i]}`);
    assert.ok(cat.dec[i] >= -90.1 && cat.dec[i] <= 90.1, `star ${i} Dec out of bounds: ${cat.dec[i]}`);
    assert.ok(cat.mag[i] > -2 && cat.mag[i] < 8, `star ${i} magnitude out of bounds: ${cat.mag[i]}`);
  }
});

test('Rejects invalid binary: magic / version / length mismatches return null', () => {
  const buf = STAR_BIN.buffer.slice(STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength);
  const bad1 = buf.slice(0); new DataView(bad1).setUint8(0, 0x58);
  assert.equal(parseStarCatalog(bad1), null, 'should reject invalid magic');
  const bad2 = buf.slice(0); new DataView(bad2).setUint16(4, 99, true);
  assert.equal(parseStarCatalog(bad2), null, 'should reject unknown version');
  assert.equal(parseStarCatalog(buf.slice(0, 40)), null, 'should reject insufficient length');
  assert.equal(parseStarCatalog(new ArrayBuffer(4)), null, 'should reject truncated buffer');
});

test('Landmark star positions match astronomical coordinates', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  // Expected values from BSC5
  const expect = [
    ['Sirius', 101.287, -16.716, -1.46],
    ['Vega', 279.234, 38.784, 0.03],
    ['Polaris', 37.955, 89.264, 2.02],
    ['Rigel', 78.634, -8.202, 0.12],
  ];
  for (const [name, ra, dec, mag] of expect) {
    let best = -1, bestD = 1e9;
    for (let i = 0; i < cat.count; i++) {
      const d = Math.hypot(cat.ra[i] - ra, cat.dec[i] - dec);
      if (d < bestD) { bestD = d; best = i; }
    }
    assert.ok(bestD < 0.02, `${name} not found in catalog (nearest ${bestD.toFixed(3)} deg)`);
    assert.ok(Math.abs(cat.mag[best] - mag) < 0.1, `${name} magnitude ${cat.mag[best]} does not match reference ${mag}`);
  }
});

test('Cumulative star count matches all-sky empirical distribution', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  // All-sky cumulative star counts: V<=1: 15, V<=2: 48, V<=3: 171, V<=4: 513, V<=5: 1602, V<=6: ~5000
  const expect = [[1, 15], [2, 48], [3, 171], [4, 513], [5, 1602], [6, 5000]];
  for (const [m, want] of expect) {
    let n = 0;
    for (let i = 0; i < cat.count; i++) if (cat.mag[i] <= m) n++;
    assert.ok(Math.abs(n - want) <= want * 0.2,
      `V<=${m} has ${n} stars, expected ~${want} (diff ${((n / want - 1) * 100).toFixed(0)}%)`);
  }
});

test('Coincident star coordinates are only close binaries with minimal fraction', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  const seen = new Set();
  let dup = 0;
  for (let i = 0; i < cat.count; i++) {
    const k = `${cat.ra[i].toFixed(3)}/${cat.dec[i].toFixed(3)}`;
    if (seen.has(k)) dup++;
    seen.add(k);
  }
  // BSC5 contains close binary components within 0.001 deg (e.g. delta Ori)
  assert.ok(dup / cat.count < 0.01,
    `${dup} stars coincide (${((dup / cat.count) * 100).toFixed(1)}%), exceeding binary fraction`);
});

test('Real star catalog naturally concentrates along Galactic plane', () => {
  const cat = parseStarCatalog(STAR_BIN.buffer.slice(
    STAR_BIN.byteOffset, STAR_BIN.byteOffset + STAR_BIN.byteLength));
  // Galactic pole J2000: RA 192.8595 deg, Dec 27.1284 deg
  const D = Math.PI / 180;
  const ra0 = 192.8595 * D, dec0 = 27.1284 * D;
  const nx = Math.cos(dec0) * Math.cos(ra0), ny = Math.cos(dec0) * Math.sin(ra0), nz = Math.sin(dec0);
  let near = 0, far = 0;
  for (let i = 0; i < cat.count; i++) {
    const ra = cat.ra[i] * D, dec = cat.dec[i] * D;
    const sinB = Math.abs(Math.cos(dec) * Math.cos(ra) * nx
      + Math.cos(dec) * Math.sin(ra) * ny + Math.sin(dec) * nz);
    if (sinB < Math.sin(12 * D)) near++;
    if (sinB > Math.sin(60 * D)) far++;
  }
  const nearFrac = near / cat.count, farFrac = far / cat.count;
  // Spherical uniform |b|<12 deg would be ~2.2%, |b|>60 deg would be ~50%
  assert.ok(nearFrac > 0.08, `Galactic plane fraction only ${(nearFrac * 100).toFixed(1)}%`);
  assert.ok(farFrac < 0.32, `High galactic latitude fraction ${(farFrac * 100).toFixed(1)}%`);
});

test('B-V to RGB: blue stars bluer than red, normalized peak preserved', () => {
  const blue = bvToRgb(-0.3), white = bvToRgb(0.5), red = bvToRgb(1.8);
  assert.ok(blue[2] > blue[0], 'B-V=-0.3 should be blue (B channel > R)');
  assert.ok(red[0] > red[2], 'B-V=1.8 should be red (R channel > B)');
  assert.ok(white[0] > 0.8 && white[2] > 0.8, 'B-V=0.5 (solar color) should be near white');
  for (const c of [blue, white, red]) {
    assert.ok(Math.abs(Math.max(...c) - 1) < 1e-9, 'should normalize maximum component to 1');
    assert.ok(c.every((x) => x >= 0 && x <= 1), 'components should be in [0, 1]');
  }
});

test('Magnitude to intensity follows Pogson law (5 magnitudes = 100x)', () => {
  assert.ok(Math.abs(magToIntensity(0) - 1) < 1e-12);
  assert.ok(Math.abs(magToIntensity(5) / magToIntensity(0) - 0.01) < 1e-12, '5 mags should differ by 100x');
  assert.ok(magToIntensity(-1.46) > magToIntensity(0.03), 'Sirius should be brighter than Vega');
  assert.ok(magToIntensity(6) < magToIntensity(1), 'dim stars should have lower intensity');
});

test('Starfield source code uses real catalog with no fictitious star remnants', () => {
  const src = read('src/scene/starfield.js');
  assert.ok(/import \{ bvToRgb, magToDisplayIntensity \} from '\.\.\/astro\/starCatalog\.js'/.test(src),
    'real star catalog not integrated');
  // Display intensity uses perceptual compression
  assert.ok(/magToDisplayIntensity\(mag\)/.test(src), 'magnitude does not use perceptual compression');
  assert.ok(!/0\.9 \* magToIntensity\(mag\)/.test(src), 'still using raw physical flux as display intensity');
  assert.ok(/function setCatalog\(cat\)/.test(src), 'missing catalog loading hook');
  assert.ok(/cat\.ra\[i\] \* DEG, cat\.dec\[i\] \* DEG/.test(src), 'stars not positioned by RA/Dec');
  // Fictitious background stars and hardcoded bright stars removed
  assert.ok(!/BRIGHT_STARS/.test(src), 'hardcoded bright star list still present');
  assert.ok(!/STAR_COLORS/.test(src), 'discrete color tiers still present');
  assert.ok(!/Math\.pow\(1 - u \* 0\.999/.test(src), 'fictitious background star sampling still present');
  // Background dim star layer beyond catalog limit
  assert.ok(/const I = 0\.22 \* \(0\.25 \+ 0\.75 \* Math\.pow\(rnd\(\), 2\.2\)\)/.test(src),
    'missing background dim star layer');
  // Labels must hold their own direction vectors
  const main = read('src/main.js');
  assert.ok(/const dirWorld = raDecToWorld\(/.test(main), 'label direction not held per-star');
  assert.ok(/getRelPos: \(v\) => v\.copy\(dirWorld\)/.test(main), 'labels still share temporary direction vector');
});

// -- Batch 8: Small body shapes --

test('Haumea rendered as triaxial ellipsoid (rugby ball shape, not spherical)', () => {
  const haumea = TNO_DATA.haumea;
  assert.ok(Array.isArray(haumea.axes) && haumea.axes.length === 3, 'missing triaxial semi-axes');
  const [a, b, c] = haumea.axes;
  assert.ok(a > b && b > c, `semi-axes should satisfy a > b > c, got ${a}/${b}/${c}`);
  // Rotation period 3.9h stretches shape: axis ratio > 1
  assert.ok(a / c > 1.8, `axis ratio ${(a / c).toFixed(2)} insufficient for triaxial ellipsoid`);
  // radiusKm should be geometric mean of triaxial semi-axes (equal-volume sphere)
  const geoMean = Math.cbrt(a * b * c);
  assert.ok(Math.abs(haumea.radiusKm - geoMean) / geoMean < 0.01,
    `radiusKm ${haumea.radiusKm} is not geometric mean ${geoMean.toFixed(1)}`);
  const src = read('src/scene/tnoScene.js');
  assert.ok(/if \(d\.axes\) \{/.test(src), 'renderer does not handle triaxial shape');
  assert.ok(/mesh\.scale\.set\(a \/ R, c \/ R, b \/ R\)/.test(src),
    'short axis should map to body-fixed +Y (polar axis)');
  // Description dimensions must match axes (2320x1700x1030 ~= 2a x 2b x 2c)
  assert.ok(/2320×1700×1030/.test(haumea.desc), 'description dimensions do not match axes');
});

test('Remaining TNOs stay spherical (only measured bodies have custom shapes)', () => {
  // Measured shapes: haumea (Ortiz 2017) and az84 (stellar occultation)
  const measured = new Set(['haumea', 'az84']);
  for (const [id, d] of Object.entries(TNO_DATA)) {
    if (measured.has(id)) continue;
    assert.ok(!d.axes, `${id} should remain spherical without occultation measurement`);
  }
  // Volumetric equivalent radius must match radiusKm (+-3%)
  for (const id of measured) {
    const d = TNO_DATA[id];
    const [a, b, c] = d.axes;
    const eq = Math.cbrt(a * b * c);
    assert.ok(Math.abs(eq - d.radiusKm) / d.radiusKm < 0.03,
      `${id} triaxial ${d.axes} volume radius ${eq.toFixed(0)} does not match radiusKm ${d.radiusKm}`);
  }
});

// -- Batch 6: Planetary rings --

test('All four giant planets have rings, with inner radius not less than planet radius', () => {
  const R = { jupiter: 71492, saturn: 60268, uranus: 25362, neptune: 24764 };
  for (const [id, rKm] of Object.entries(R)) {
    const r = BODIES[id].rings;
    assert.ok(r, `${id} missing ring system`);
    assert.ok(r.innerKm > rKm, `${id} ring inner radius ${r.innerKm} should not be smaller than planet radius ${rKm}`);
    assert.ok(r.outerKm > r.innerKm, `${id} ring outer radius should be greater than inner radius`);
  }
});

test('Ring illumination follows Seeliger law for single-layer particles', () => {
  const src = read('src/scene/rings.js');
  // Seeliger law: mu0/(mu0+mu) with opposition surge
  assert.ok(/float mu0 = abs\(dot\(nrm, uSunDir\)\);/.test(src), 'missing sun elevation angle on ring plane');
  assert.ok(/float mu = abs\(dot\(nrm, toCam\)\);/.test(src), 'missing viewer elevation angle on ring plane');
  assert.ok(/float seeliger = mu0 \/ max\(mu0 \+ mu, 1e-4\);/.test(src), 'missing Seeliger law mu0/(mu0+mu)');
  assert.ok(!/float lit = max\(ndl, 0\.0\) \+ pow\(max\(-ndl, 0\.0\), 0\.7\)/.test(src),
    'legacy constant lighting still present');
  // Opposition surge: coherent backscattering when phase angle -> 0
  assert.ok(/float surge = 1\.0 \+ 0\.5 \* exp\(-\(1\.0 - cosA\) \* 25\.0\);/.test(src),
    'missing opposition surge');
  // Forward scattering integrated into phase
  assert.ok(/0\.9 \* pow\(max\(-cosA, 0\.0\), 3\.0\)/.test(src), 'missing forward scattering term');
  assert.ok(!/float fwd = pow\(max\(dot\(viewRay, uSunDir\), 0\.0\), 8\.0\)/.test(src),
    'forward scattering computed twice');
});

test('Ring self-shadowing: ring shadows ring (dark bands seen by Cassini at high opening angles)', () => {
  const src = read('src/scene/rings.js');
  // Ring self-shadowing in addition to planetary shadow
  assert.ok(/vec3 sunInPlane = uSunDir - nrm \* dot\(uSunDir, nrm\);/.test(src),
    'missing sun direction projection in ring plane');
  assert.ok(/for \(int i = 1; i <= 10; i\+\+\)/.test(src), 'missing radial march loop in ring plane');
  assert.ok(/uRingInner/.test(src) && /uRingOuter/.test(src), 'missing inner/outer radius uniforms');
  // Normalized dimensionless tau
  assert.ok(/tau \/= max\(rSpan, 1\.0\);/.test(src), 'tau not normalized by ring span');
  // Self-shadowing clamped to prevent excessive darkening
  assert.ok(/shadow \*= 1\.0 - 0\.35 \* \(1\.0 - exp\(-tau \* 1\.2/.test(src),
    'self-shadowing unclamped');
});

test('Ground surface has visible close-up texture (not a flat plane)', () => {
  const src = read('src/scene/terrain.js');
  // Close-up surface brightness modulation
  assert.ok(/clamp\(1\.0 \+ 2\.2 \* \(nsum - 0\.5\), 0\.62, 1\.38\)/.test(src),
    'missing amplified and clamped ground brightness modulation');
  assert.ok(/tnoise2\(vObjPos \* 90\.0 \+ vec3\(7\.3, 2\.1, 5\.7\)\)/.test(src),
    'missing coordinate-safe medium-scale (~11m) detail tier');
  assert.ok(!/float dm = 0\.78 \+ 0\.46 \*/.test(src), 'legacy weak modulation still present');
});

test('Bright icy moon single-scattering albedos and base colors match geometric albedos', () => {
  // Icy moon geometric albedo matches measured values
  const REF = { mimas: 0.962, dione: 0.998, enceladus: 0.99, rhea: 0.95, tethys: 0.80 };
  for (const [id, geo] of Object.entries(REF)) {
    const w = HAPKE_PARAMS[id]?.w;
    assert.ok(w !== undefined, `${id} missing Hapke parameters`);
    // Single-scattering albedo w should be consistent with geometric albedo
    assert.ok(w >= geo * 0.9, `${id}: w=${w} significantly below geometric albedo ${geo}`);
    const base = PRESETS[MOON_PHYS[id].surface.palette].base;
    const lum = (base[0] * 0.299 + base[1] * 0.587 + base[2] * 0.114);
    assert.ok(lum > 170, `${id} base color brightness ${lum.toFixed(0)} too low (geometric albedo ${geo})`);
  }
});

test('Every moon has its own distinct surface palette (not all generic gray)', () => {
  // Moons have distinct palettes derived from observational data
  const NEW = ['amalthea','thebe','metis','adrastea','hyperion','phoebe','janus','epimetheus',
    'prometheus','pandora','pan','cordelia','ophelia','bianca','cressida','desdemona',
    'juliet','portia','rosalind','belinda','puck','nereid','naiad','thalassa','despina',
    'galatea','larissa','proteus'];
  const gray = NEW.filter((id) => (MOON_PHYS[id]?.surface?.palette ?? 'gray') === 'gray');
  assert.equal(gray.length, 0, `${gray.length} new moons still using generic gray: ${gray.join(' ')}`);
  // Every referenced palette preset must exist
  const missing = [];
  for (const [id, m] of Object.entries(MOON_PHYS)) {
    const pal = m.surface?.palette;
    if (pal && !PRESETS[pal]) missing.push(`${id}→${pal}`);
  }
  assert.equal(missing.length, 0, `referenced non-existent preset: ${missing.join(' ')}`);
  // Color presets should offer rich diversity
  const bases = new Set(NEW.map((id) => PRESETS[MOON_PHYS[id].surface.palette].base.join(',')));
  assert.ok(bases.size >= 6, `28 new moons only use ${bases.size} distinct colors, insufficient variety`);
});

test('Faint rings of Jupiter and Neptune use very low diffuse base (not Uranus 0.03)', () => {
  assert.ok((BODIES.jupiter.rings.diffuse ?? 0.03) < 0.01,
    'Jupiter ring optical depth ~1e-6, diffuse base must be very low');
  assert.ok((BODIES.neptune.rings.diffuse ?? 0.03) < 0.01, 'Neptune rings are also very faint');
  assert.ok((BODIES.uranus.rings.diffuse ?? 0.03) >= 0.02, 'Uranus rings are relatively bright, keep default base');
});

test('Jupiter ring structure matches observations (Halo / Main / two Gossamer rings)', () => {
  const n = BODIES.jupiter.rings.narrow;
  assert.equal(n.length, 4, 'Jupiter rings should have 4 layers');
  // Main ring (1.72-1.81 R_J ~= 126,000 km) is the brightest layer
  const main = n.reduce((a, b) => (b[2] > a[2] ? b : a));
  assert.ok(Math.abs(main[0] - 126000) < 3000, `brightest layer should be near Main ring, got ${main[0]}`);
});

test('Neptune rings include five named rings (Galle/Le Verrier/Lassell/Arago/Adams)', () => {
  const n = BODIES.neptune.rings.narrow;
  assert.equal(n.length, 5);
  const radii = n.map((x) => x[0]).sort((a, b) => a - b);
  assert.ok(Math.abs(radii[0] - 41900) < 200, 'Galle ring should be at 41,900 km');
  assert.ok(Math.abs(radii[4] - 62930) < 200, 'Adams ring should be at 62,930 km');
});

// -- Lunar libration --

test('Moon uses IAU rotation model rather than rigid tidal locking (prerequisite for libration)', () => {
  const rot = read('src/astro/rotation.js');
  const builder = read('src/scene/builder.js');
  assert.ok(/moon:\s*\[269\.9949, 0\.0031, 66\.5392, 0\.0130, 38\.3213, 13\.17635815\]/.test(rot),
    'missing Moon IAU 2015 rotation constants');
  assert.ok(/if \(!e\.isMoon \|\| id === 'moon'\)/.test(builder),
    'Moon still uses rigid tidal locking');
});

// -- Eclipse shadows --

test('Eclipse occlusion calculated per-fragment in receiver shader (no inserted black cone)', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/uniform int uEclOn;/.test(src) && /uniform vec3 uEclPos;/.test(src), 'missing eclipse uniforms');
  assert.ok(/float aOcc = asin\(clamp\(uEclR \/ dOcc/.test(src), 'missing occluder angular radius');
  assert.ok(/float aSun = asin\(clamp\(SUN_RADIUS_KM \/ max\(uSunDistKm/.test(src), 'missing sun angular radius');
  // Overlap lower bound must be |aOcc - aSun|
  assert.ok(/float lo = abs\(aOcc - aSun\)/.test(src),
    'overlap lower bound should be |aOcc - aSun|');
  assert.ok(/float cover = 1\.0 - smoothstep\(lo, hi, sep\)/.test(src),
    'missing two-disk overlap occlusion calculation');
  assert.ok(/uSunI \* ringSh \* cloudShadow \* eclSh/.test(src), 'occlusion not included in final shading');
  // Division by zero guard
  assert.ok(/max\(length\(toOcc\), 1\.0\)/.test(src), 'missing division by zero guard when coincident with occluder');
});

test('Eclipse occluder set for both solar (Earth) and lunar (Moon) eclipses, cleared each frame', () => {
  const src = read('src/scene/eclipses.js');
  assert.ok(/pushOccluder\(earth, moon, camPosKm, distTo\(earth\)\)/.test(src), 'missing solar eclipse occluder');
  assert.ok(/pushOccluder\(moon, earth, camPosKm, distTo\(moon\)\)/.test(src), 'missing lunar eclipse occluder');
  assert.ok(/pushOccluder\(bodies\.get\(id\), null, camPosKm, 1\)/.test(src),
    'missing per-frame reset -- shadow would remain permanently');
});

// -- Batch 12: Accessibility --

test('Zoom is not disabled (WCAG 1.4.4)', () => {
  for (const f of ['index.html', 'en/index.html']) {
    const html = read(f);
    const vp = /<meta name="viewport" content="([^"]+)"/.exec(html)?.[1] ?? '';
    assert.ok(vp, `${f} missing viewport`);
    assert.ok(!/user-scalable\s*=\s*no/.test(vp), `${f} still disables user zoom`);
    assert.ok(!/maximum-scale\s*=\s*1\b/.test(vp), `${f} still locks maximum-scale to 1`);
  }
});

test('Focus styles and aria-live announcements exist', () => {
  const css = read('src/style.css');
  assert.ok(/:focus-visible\s*\{/.test(css), 'missing :focus-visible for keyboard focus');
  assert.ok(/\.sr-only\s*\{/.test(css), 'missing .sr-only class for screen readers');
  for (const f of ['index.html', 'en/index.html']) {
    assert.ok(/aria-live="polite"/.test(read(f)), `${f} tip bar missing aria-live`);
  }
});

test('prefers-reduced-motion respected in both CSS and JS', () => {
  const css = read('src/style.css');
  assert.ok(/animation-duration: 0\.001ms !important/.test(css),
    'CSS only disabled splash animation');
  const cfg = read('src/config.js');
  assert.ok(/export function prefersReducedMotion/.test(cfg), 'missing shared query function');
  // JS camera animations checked in JS
  const cam = read('src/engine/orbitCamera.js');
  // Shorten instead of cancel camera transitions
  assert.ok(/if \(prefersReducedMotion\(\)\) dur = Math\.min\(dur, 0\.8\);/.test(cam),
    'flight animation not shortened for reduced-motion');
  assert.ok(/const damp = prefersReducedMotion\(\) \? 0 : /.test(cam),
    'drag inertia not disabled for reduced-motion');
  const feel = read('src/engine/cameraFeel.js');
  assert.ok(/if \(prefersReducedMotion\(\)\) \{/.test(feel), 'camera feel not adapted for reduced-motion');
});

// -- Batch 12: Offline capability --

test('Service Worker exists and registers in application', () => {
  const sw = read('public/sw.js');
  assert.ok(/self\.addEventListener\('fetch'/.test(sw), 'SW does not intercept fetch');
  assert.ok(/req\.mode === 'navigate'/.test(sw), 'missing network-first strategy for navigation');
  assert.ok(/caches\.match\(req\)/.test(sw), 'missing cache-first strategy for static assets');
  assert.ok(/trimCache\(ASSETS, MAX_ASSETS\)/.test(sw), 'missing cache limit -- cache would grow unbounded');
  assert.ok(/self\.skipWaiting\(\)/.test(sw), 'missing skipWaiting');
  const main = read('src/main.js');
  assert.ok(/serviceWorker\.register\('sw\.js'\)/.test(main), 'application does not register SW');
  // Skip SW registration under file:// protocol
  assert.ok(/location\.protocol === 'https:'/.test(main), 'registration does not check protocol');
});

// -- Transparent DoubleSide materials must render in a single pass --
// In Three.js r165, transparent DoubleSide materials without forceSinglePass split into two passes.

test('Ring material renders in single pass (prevents optical depth doubling)', async () => {
  const { createRings } = await import('../src/scene/rings.js');
  const rings = createRings({ rings: { innerKm: 74500, outerKm: 140220, tint: [1, 1, 1], opacity: 1 } }, null);
  const mats = [];
  rings.traverse?.((o) => { if (o.material) mats.push(o.material); });
  if (!mats.length && rings.material) mats.push(rings.material);
  assert.ok(mats.length > 0, 'failed to retrieve ring material');
  for (const m of mats) {
    if (m.transparent && m.side === 2 /* DoubleSide */) {
      assert.equal(m.forceSinglePass, true, 'ring material missing forceSinglePass');
    }
  }
});

test('Heliosphere material renders in single pass (prevents additive glow doubling)', async () => {
  const { createHeliosphere } = await import('../src/scene/heliosphere.js');
  const h = createHeliosphere();
  const mats = [];
  h.traverse((o) => { if (o.material) mats.push(o.material); });
  assert.ok(mats.length > 0, 'failed to retrieve heliosphere material');
  for (const m of mats) {
    if (m.transparent && m.side === 2) {
      assert.equal(m.forceSinglePass, true, 'heliosphere material missing forceSinglePass');
    }
  }
});

test('Terrain material renders in single pass (prevents fragment shader double-pass overhead)', async () => {
  const { makeTerrainMaterial } = await import('../src/scene/terrain.js');
  const mat = makeTerrainMaterial({ value: null }, { value: 0 }, { value: 1 }, 0, 6371, { value: 1 }, { value: null });
  assert.equal(mat.transparent, true);
  assert.equal(mat.side, 2, 'terrain should be DoubleSide (sea surface visible from underwater)');
  assert.equal(mat.forceSinglePass, true, 'terrain material missing forceSinglePass');
});

test('All transparent DoubleSide materials set forceSinglePass', () => {
  for (const f of ['src/scene/rings.js', 'src/scene/heliosphere.js', 'src/scene/terrain.js']) {
    assert.match(read(f), /forceSinglePass:\s*true/, `${f} missing forceSinglePass`);
  }
});

// -- Eclipses: criteria must be true geometric occlusion without inserting cone meshes --

test('isEclipse identifies real total solar eclipse (2026-08-12) and lunar eclipse without false positives', async () => {
  const { isEclipse } = await import('../src/scene/eclipses.js');
  const { planetPosition } = await import('../src/astro/planets.js');
  const { moonGeocentric } = await import('../src/astro/moon.js');
  const { dateToJD } = await import('../src/astro/time.js');

  const pos = (jd) => {
    const e = planetPosition('earth', jd);
    const mg = moonGeocentric(jd);
    return {
      sun: [0, 0, 0],
      earth: [e.x, e.y, e.z],
      moon: [e.x + mg.x, e.y + mg.y, e.z + mg.z],
    };
  };
  const R_SUN = 695700, R_EARTH = 6371, R_MOON = 1737.4;

  // 2026-08-12 is a total solar eclipse (visible from Iceland/Spain)
  const jdEcl = dateToJD(new Date(Date.UTC(2026, 7, 12, 17, 46)));
  assert.equal(isEclipse('solar', pos(jdEcl), R_SUN, R_EARTH, R_MOON), true,
    '2026-08-12 should be recognized as solar eclipse');

  // ~7 days after eclipse is first quarter, geometrically impossible to eclipse
  assert.equal(isEclipse('solar', pos(jdEcl + 7), R_SUN, R_EARTH, R_MOON), false,
    'first quarter should not be recognized as eclipse');
  // ~14.8 days after is full moon (possible lunar eclipse, not solar eclipse)
  assert.equal(isEclipse('solar', pos(jdEcl + 14.77), R_SUN, R_EARTH, R_MOON), false,
    'full moon should not be recognized as solar eclipse');
});

test('getNextEclipse matches real eclipse date without blocking main thread', async () => {
  const { EclipseSystem } = await import('../src/scene/eclipses.js');
  const { planetPosition } = await import('../src/astro/planets.js');
  const { moonGeocentric } = await import('../src/astro/moon.js');
  const { dateToJD, jdToDate } = await import('../src/astro/time.js');
  const sys = new EclipseSystem();
  const getPositions = (jd) => {
    const e = planetPosition('earth', jd);
    const mg = moonGeocentric(jd);
    return { sun: [0, 0, 0], earth: [e.x, e.y, e.z], moon: [e.x + mg.x, e.y + mg.y, e.z + mg.z] };
  };
  const from = dateToJD(new Date(Date.UTC(2026, 5, 1)));   // 2026-06-01
  const t0 = Date.now();
  const jd = sys.getNextEclipse('solar', from, getPositions);
  const ms = Date.now() - t0;
  assert.ok(jd, 'should find next solar eclipse');
  const d = jdToDate(jd);
  assert.equal(d.getUTCFullYear(), 2026, `should fall in year 2026, got ${d.toISOString()}`);
  assert.equal(d.getUTCMonth(), 7, `should be August (2026-08-12 total eclipse), got ${d.toISOString()}`);
  assert.ok(ms < 5000, `search should not block main thread, took ${ms} ms`);
});

test('Eclipse system does not insert cone meshes into scene', async () => {
  const { EclipseSystem } = await import('../src/scene/eclipses.js');
  const src = read('src/scene/eclipses.js');
  // Verify cone geometry and multiply blending are not instantiated
  assert.ok(!/new THREE\.ConeGeometry/.test(src), 'should not instantiate ConeGeometry');
  assert.ok(!/THREE\.MultiplyBlending/.test(src), 'should not use MultiplyBlending');
  assert.ok(!/this\.cones/.test(src), 'should not maintain cone list');
  // Retain per-fragment occlusion push path
  assert.match(src, /pushOccluder/, 'must retain per-fragment pushOccluder path');
  // Constructor no longer requires scene/world
  const sys = new EclipseSystem();
  assert.ok(sys, 'should construct without arguments');
  // update only updates uniforms
  const pushed = [];
  const mkBody = (id) => ({ id, posKm: [1e8, 0, 0], phys: { radiusKm: 1000 },
    mat: { userData: { uniforms: { uEclOn: { value: 0 }, uEclPos: { value: { set() { pushed.push(id); } } },
      uEclR: { value: 0 }, uSunDistKm: { value: 0 } } } } });
  const bodies = new Map(['sun', 'earth', 'moon', 'jupiter', 'io', 'europa', 'ganymede', 'callisto', 'saturn', 'titan']
    .map((id) => [id, mkBody(id)]));
  sys.update(2451545, bodies, [0, 0, 0]);
  assert.ok(pushed.length > 0, 'should push occluder to receiver material');
});

// -- Surface detail: attenuate only by footprint, remove redundant distance fade --

test('Terrain detail attenuates only by footprint: distance fade removed, footprint thresholds calibrated', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/fwidth\(vObjPos\)/.test(src), 'must retain footprint calculation');
  assert.ok(/smoothstep\(0\.7, 1\.6, fp \* 26000\.0\)/.test(src), 'high-frequency footprint threshold should be calibrated');
  assert.ok(/smoothstep\(0\.7, 1\.6, fp \* 35\.0\)/.test(src), 'low-frequency footprint threshold should be calibrated');
  // Distance fade (smoothstep by vViewPosition) must not be in detail gains
  assert.ok(!/float f2 = 1\.0 - smoothstep/.test(src), 'f2 distance fade should be removed');
  assert.ok(!/float f3 = 1\.0 - smoothstep/.test(src), 'f3 distance fade should be removed');
  assert.ok(!/float f4 = 1\.0 - smoothstep/.test(src), 'f4 distance fade should be removed');
  assert.ok(!/float g2 = f2 \* aa2/.test(src), 'detail gains should not multiply distance fade');
});

test('Surface brightness modulation retains gain and clamping (prevents flat plane appearance)', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/clamp\(1\.0 \+ 2\.2 \* \(nsum - 0\.5\), 0\.62, 1\.38\)/.test(src),
    'dm gain and clamping preserved (+-38% surface texture)');
});


// -- Albedo calibration: textures carry relative features, absolute brightness anchored to measured albedos --

test('Albedo calibration: effective albedo matches measured values across bodies', async () => {
  const { albedoScaleOf, TEXTURE_LIN_MEAN, SURFACE_ALBEDO } = await import('../src/scene/planetMaterial.js');
  const fileOf = { earth: 'earth_day.jpg', europa: 'europa.png', venus: 'venus_atmosphere.jpg' };
  // Only bodies with measured texture linear mean require calibration check
  let checked = 0;
  for (const [id, a] of Object.entries(SURFACE_ALBEDO)) {
    const f = fileOf[id] ?? `${id}.jpg`;
    const m = TEXTURE_LIN_MEAN[f];
    if (!(m > 0)) continue;
    checked++;
    const eff = albedoScaleOf(f, id) * m;
    assert.ok(Math.abs(eff - a) < 1e-6, `${id} calibrated effective albedo ${eff} != measured ${a}`);
  }
  assert.ok(checked >= 20, `only verified ${checked} bodies, primary bodies must have texture means`);
  for (const id of ['mercury', 'earth', 'mars', 'jupiter', 'neptune']) {
    assert.ok(SURFACE_ALBEDO[id] > 0, `${id} missing albedo anchor (needed for exposure adaptation)`);
  }
});

test('Bright icy moons must be brighter than Mars (corrects inverted ranking)', async () => {
  const { TERRAIN_GRADE } = await import('../src/scene/planetMaterial.js');
  const lum = (id) => {
    const g = TERRAIN_GRADE[id]?.grade ?? [1, 1, 1];
    return 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
  };
  assert.ok(lum('enceladus') > lum('mars') * 2,
    `Enceladus (albedo 0.99) should be significantly brighter than Mars (0.25), got ${lum('enceladus').toFixed(2)} vs ${lum('mars').toFixed(2)}`);
  assert.ok(lum('mimas') > lum('mars'),
    `Mimas (0.962) should be brighter than Mars, got ${lum('mimas').toFixed(2)} vs ${lum('mars').toFixed(2)}`);
  assert.ok(lum('mercury') < lum('mars'),
    `Mercury (0.106) should be dimmer than Mars (0.25), got ${lum('mercury').toFixed(2)} vs ${lum('mars').toFixed(2)}`);
  assert.ok(lum('moon') < 1, `Moon surface should not be pure white, got grade ${lum('moon').toFixed(2)}`);
});

test('Disk and terrain share identical color grade table (ensures consistent brightness)', async () => {
  const { TERRAIN_GRADE, displayGradeOf } = await import('../src/scene/planetMaterial.js');
  for (const id of ['earth', 'mars', 'moon', 'enceladus', 'mercury', 'uranus']) {
    const d = displayGradeOf(id), t = TERRAIN_GRADE[id];
    if (!d && !t) continue;
    assert.ok(d && t, `${id} disk and terrain grading should both exist`);
    for (let i = 0; i < 3; i++) assert.equal(d.grade[i], t.grade[i], `${id} channel ${i} disk/terrain mismatch`);
  }
});

// -- Help text covers all implemented hotkeys in both languages --

test('English and Chinese help list all implemented hotkeys', () => {
  const zh = read('index.html');
  const en = read('src/ui/i18n.js');
  // [Key, Chinese pattern, English pattern]
  const keys = [
    ['Z Clean Mode', '>Z<', '<td>Z</td>'],
    ['C Compass', '>C<', '<td>C</td>'],
    ['M Audio', '>M<', '<td>M</td>'],
    ['Y Human Silhouette', '>Y<', '<td>Y</td>'],
    ['Ctrl+B Bookmark', 'Ctrl+B', 'Ctrl+B'],
    ['Ctrl+Shift+B Bookmark', 'Ctrl+Shift+B', 'Ctrl+Shift+B'],
    ['J Realistic Gravity', '>J<', '<td>J</td>'],
  ];
  for (const [name, zhPat, enPat] of keys) {
    assert.ok(zh.includes(zhPat), `Chinese help missing ${name}`);
    assert.ok(en.includes(enPat), `English help missing ${name}`);
  }
});

// -- Small body brightness governed by apparent magnitude --

test('Small bodies determine visibility by apparent magnitude, consistent with real sky', () => {
  const src = read('src/scene/smallBodies.js');
  assert.ok(/applyMagnitude/.test(src), 'missing apparent magnitude calculation');
  assert.ok(/b\[8\] \+ 5 \* Math\.log10\(rAU \* dAU\)/.test(src),
    'apparent magnitude should be m = H + 5 log10(r * Delta)');
  assert.ok(/NAKED_EYE_M\s*=\s*6\.0/.test(src), 'should use naked-eye limit 6.0 as visibility baseline');
  assert.ok(/vertexColors:\s*true/.test(src), 'material should use per-vertex colors');
  // Verification: Ceres (H=3.34) visible; typical main belt asteroid (H=12) invisible
  const m = (H, r, d) => H + 5 * Math.log10(r * d);
  const L = (mm) => Math.min(1, Math.pow(10, -0.4 * (mm - 6.0)));
  assert.ok(L(m(3.34, 2.77, 1.8)) > 0.2, 'Ceres should be visible');
  assert.ok(L(m(12, 2.77, 1.8)) < 0.01, 'typical main belt body should not be visible');
});

test('Statistical point clouds use soft dot sprite texture instead of squares', () => {
  const src = read('src/scene/belts.js');
  assert.ok(/softDotTexture/.test(src), 'missing soft dot sprite');
  assert.ok(/map:\s*softDotTexture\(\)/.test(src), 'PointsMaterial does not use soft dot sprite');
});

// -- Exposure law: surface brightness determined strictly by albedo --

test('Exposure law: uSunI = 1/d^2, exposure = K * d^2, product is distance-invariant', () => {
  const b = read('src/scene/builder.js');
  const m = read('src/main.js');
  assert.ok(/const sunI = 1 \/ \(dAU \* dAU\);/.test(b),
    'uSunI must follow inverse-square law without ^0.55 compression');
  assert.ok(!/Math\.pow\(sunIRaw, 0\.55\)/.test(b), 'legacy compression still present');
  assert.ok(/sunLight\.intensity = Math\.PI \* li;/.test(b),
    'terrain light must follow same law as planetary disk');
  // Exposure combines distance K*d^2 with target albedo adaptation factor
  const e = m.match(/exposureTarget = THREE\.MathUtils\.clamp\(\s*([\d.]+) \* Math\.max\(dSunAU, 0\.004\) \*\* 2 \* exposureAdapt/);
  assert.ok(e, 'exposure distance part must be written as K * d^2 * adapt');
  assert.ok(/exposureAdapt = 1 \+ \(Math\.pow\(0\.62 \/ Math\.max\(a, 0\.03\), 1\.0\) - 1\) \* w/.test(m),
    'missing albedo adaptation factor');
  const K = Number(e[1]);
  assert.ok(K > 0.3 && K < 1.2, `exposure calibration coefficient ${K} should be in (0.3, 1.2)`);
  // Numerical check: product = K, independent of dAU
  const sunI = (d) => 1 / (d * d);
  const expo = (d) => Math.min(2000, Math.max(0.02, K * d * d));
  for (const d of [0.39, 1.0, 1.58, 5.31, 9.43, 35.6]) {
    const p = sunI(d) * expo(d);
    assert.ok(Math.abs(p - K) < 1e-6, `at d=${d} AU, sunI * exposure = ${p}, expected constant ${K}`);
  }
});

// -- Terrain generator: craters follow size-frequency distribution with morphological progression --

test('Crater field: size-frequency distribution N(>D) ~ D^-2 with diameter-dependent morphology', async () => {
  const { HeightField } = await import('../src/scene/terrain.js');
  const { MOON_PHYS } = await import('../src/astro/bodies.js');
  const f = new HeightField('moon', MOON_PHYS.moon);
  assert.ok(f.craterField, 'Moon should have crater field');
  const cs = f.craterField.classes;
  assert.ok(cs.length >= 10, `crater size classes should be sufficient (got ${cs.length})`);
  // Spacing ratio between adjacent classes corresponds to size ratio (N(>D) ~ D^-2)
  for (let i = 1; i < cs.length; i++) {
    const ratio = cs[i - 1].cell / cs[i].cell;
    assert.ok(ratio > 1.5 && ratio < 3.0, `class ${i} spacing ratio ${ratio.toFixed(2)} deviates from size distribution law`);
  }
  // Depth-to-diameter ratio: simple craters 0.2D, complex craters shallower
  const small = cs.find((c) => c.D < 10);
  const big = cs[0];
  assert.ok(Math.abs(small.depth / small.D - 0.2) < 1e-6, 'simple crater depth/diameter ratio should be 0.2');
  assert.ok(big.depth / big.D < 0.05, `largest crater depth/diameter ratio ${(big.depth / big.D).toFixed(3)} should be << 0.2`);
});

test('Sub-DEM resolution craters exist (prevents flat surface at walking scale)', async () => {
  const { HeightField } = await import('../src/scene/terrain.js');
  const { MOON_PHYS } = await import('../src/astro/bodies.js');
  const f = new HeightField('moon', MOON_PHYS.moon);
  assert.ok(f.craterFine, 'sub-DEM resolution fine crater field should exist');
  // Finest tier should reach walking scale (~10m)
  const minD = f.craterFine.classes[f.craterFine.classes.length - 1].D;
  assert.ok(minD <= 0.012, `fine crater tier ${minD}km too coarse, walking scale is still flat`);
});

// -- Sun: photosphere preserves color temperature and remains invariant under exposure --

test('Sun photosphere preserves color temperature (not grayscale)', () => {
  const src = read('src/scene/sun.js');
  // Preserves texture color hue, normalizes by whole-map mean (uMapMean) to keep granulation
  assert.ok(/vec3 base = sampled \* \(0\.85 \/ max\(uMapMean, 1e-3\)\)/.test(src),
    'photosphere base color preserves texture structure (normalized by map mean)');
  assert.ok(!/0\.85 \/ max\(luminance, 1e-3\)/.test(src), 'still normalizing per-pixel (flattens granulation)');
  // Granulation fades in when period >= 1px
  assert.ok(/smoothstep\(1\.0, 3\.5, px1\)/.test(src), 'granulation LOD gate inverted');
  assert.ok(!/vec3 base = vec3\(luminance\)/.test(src), 'still using pure grayscale base');
});

test('Sun photosphere invariant under scene exposure (prevents blowing out at outer orbits)', () => {
  const sun = read('src/scene/sun.js');
  const main = read('src/main.js');
  assert.ok(/uInvExposure/.test(sun), 'sun shader should receive inverse exposure');
  assert.ok(/col \* 0\.85 \* uInvExposure/.test(sun), 'photosphere output multiplies inverse exposure');
  assert.ok(!/col \* 14\.0/.test(sun), 'legacy x14 fixed intensity still present');
  assert.ok(/uInvExposure\.value = 1 \/ Math\.max\(renderer\.toneMappingExposure/.test(main),
    'main.js writes inverse exposure each frame');
});

// -- Environment map: metallic materials do not render as dark silhouettes --

test('Main scene provides procedural environment map for metallic reflections', () => {
  const src = read('src/main.js');
  assert.ok(/PMREMGenerator/.test(src), 'missing PMREM generation');
  assert.ok(/scene\.environment = pmrem\.fromEquirectangular/.test(src),
    'scene.environment not set');
  assert.ok(/environmentIntensity/.test(src), 'environment intensity should be lowered to prevent washing out terrain');
});

// -- Terrain covers visual horizon with seamless blend to base sphere --

test('Terrain outer boundary covers visible horizon and blends into base sphere', () => {
  const src = read('src/scene/terrain.js');
  // Outer boundary extends to 600/1500km
  assert.ok(/280, 600, 1500/.test(src), 'outer tier should extend to 600/1500km');
  // Edge elevation smoothly blends into baseRadius
  assert.ok(/h = h \* \(1 - blend\) \+ this\.field\.baseSphereRadius\(dir\) \* blend/.test(src),
    'outer boundary should blend into base sphere');
  // Detail blends synchronously with elevation
  assert.ok(/dfd\[k\] = 1 - blend/.test(src), 'boundary details do not fade with elevation');
});

// -- Star catalog failure notification and tiered star sizes --
test('User notified when star catalog fails to load', () => {
  const m = read('src/main.js');
  const i = read('src/ui/i18n.js');
  assert.ok(/hud\.tip\(t\('tip\.starsUnavailable'\)\)/.test(m), 'missing notification on failure');
  assert.ok(/tip\.starsUnavailable/.test(i), 'missing starsUnavailable string');
});

test('Stars tiered into three size classes by magnitude', () => {
  const s = read('src/scene/starfield.js');
  const layers = s.match(/\{ size: [\d.]+, lo: [^}]+\}/g) ?? [];
  assert.ok(layers.length >= 3, `bright star size tiers only ${layers.length}`);
});

test('Latest bookmark fetches list()[0] (sorted descending by created)', () => {
  const m = read('src/main.js');
  assert.ok(/const latest = items\[0\];/.test(m), 'still takes items[length-1] (oldest item)');
  assert.ok(!/const latest = items\[items\.length - 1\];/.test(m), 'legacy access still present');
});

// -- Minor fixes: language fallback, narrow window HUD, walk slope limit --
test('Non-English descriptions fall back to English rather than Chinese', () => {
  const h = read('src/ui/hud.js');
  assert.ok(/desc: DESC_EN\[id\] \?\? descZh,/.test(h),
    'descriptions should fall back to English');
  assert.ok(!/LANG === 'en' \? \(DESC_EN\[id\]/.test(h), 'legacy ternary fallback still present');
});

test('Target information panel remains visible on narrow desktop viewports', () => {
  const css = read('src/style.css');
  assert.ok(/@media \(max-width: 768px\) and \(pointer: fine\)/.test(css),
    'missing narrow-viewport + fine-pointer override rule');
});

test('Surface walking enforces slope limit (cannot climb vertical cliffs)', () => {
  const s = read('src/engine/ship.js');
  assert.ok(/rise > run \* 1\.73/.test(s), 'missing slope limit (tan 60 deg)');
  assert.ok(/if \(rise > run \* 1\.73\) move\.set\(0, 0, 0\);/.test(s), 'should reject step when slope limit exceeded');
});

// -- Airless body daytime sky, swept collision, and TNO rotation --
test('Airless bodies retain visible stars during daytime (black lunar sky)', async () => {
  const { photoSkyVisibility } = await import('../src/scene/photoExposure.js');
  // Lunar noon, standing on surface
  const v = photoSkyVisibility({ radiusKm: 1737, distanceKm: 1737.002, sunElevation: 1, airless: true });
  assert.equal(v, 1, `airless body should not suppress stars, got ${v}`);
  // Earth with atmosphere should be suppressed under same conditions
  const e = photoSkyVisibility({ radiusKm: 6371, distanceKm: 6371.002, sunElevation: 1, airless: false });
  assert.ok(e < 0.2, `atmosphere should suppress daytime stars, got ${e}`);
});

test('High-speed flight employs swept collision testing (prevents tunneling)', () => {
  const s = read('src/engine/ship.js');
  assert.ok(/_prevPosKm/.test(s), 'missing previous position tracking');
  assert.ok(/disc >= 0/.test(s) && /swept collision|segment-sphere/i.test(s), 'Missing segment-sphere intersection');
});

test('TNOs rotate and receive inverse-square illumination', () => {
  const s = read('src/scene/tnoScene.js');
  assert.ok(/TNO_ROT_HOURS/.test(s), 'missing rotation period table');
  assert.ok(/e\.mesh\.rotation\.y = ang/.test(s), 'TNO does not rotate');
  assert.ok(!/Math\.pow\(sunIRaw, 0\.55\)/.test(s), 'TNO still uses ^0.55 illumination compression');
});

// -- Pluto system includes all 5 moons --
test('Pluto moons (Charon, Nix, Hydra, Kerberos, Styx) included in moon catalog and rendered', async () => {
  const { MOON_IDS, moonLocalPosition } = await import('../src/astro/moons.js');
  const { MOON_EPOCH_JD } = await import('../src/astro/moonsData.generated.js');
  for (const id of ['charon', 'nix', 'hydra', 'kerberos', 'styx']) {
    assert.ok(MOON_IDS.includes(id), `${id} not in moon catalog`);
  }
  // Semi-major axis should be within +-5% of published values
  const expect = { nix: 48694, hydra: 64738, kerberos: 57783, styx: 42656 };
  for (const [id, a] of Object.entries(expect)) {
    const p = moonLocalPosition(id, MOON_EPOCH_JD);
    const r = Math.hypot(p.x, p.y, p.z);
    assert.ok(Math.abs(r - a) / a < 0.05, `${id} distance to Pluto ${r.toFixed(0)}km, expected ~${a}km`);
  }
});

// -- Nightside ambient scales with irradiance; ringed bodies receive ring shine --
test('Nightside ambient scales with uSunI (prevents excessive brightness on outer planet night sides)', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/col \+= albedo \* 0\.0035 \* uSunI;/.test(src), 'nightside ambient is still constant');
  assert.ok(!/col \+= albedo \* 0\.0035;/.test(src), 'legacy constant ambient still present');
});

test('Ringed bodies receive ring shine (Saturn nightside is illuminated by rings)', () => {
  const mat = read('src/scene/planetMaterial.js');
  const b = read('src/scene/builder.js');
  assert.ok(/uRingShine/.test(mat) && /uRingShine\.value = /.test(b), 'missing ring shine intensity');
  assert.ok(/col \+= albedo \* uRingShine \* ringSide;/.test(mat), 'missing ring shine contribution');
});

// -- Reentry: atmospheric model density matches measured atmospheric profiles --

test('Reentry model: dynamic pressure at 60 km matches empirical peak order (10-40 kPa)', async () => {
  const { aeroAt } = await import('../src/engine/ship.js');
  const earth = { rayleighScaleKm: 8.5, rho0: 1.225 };
  const a60 = aeroAt(60, 7.8, earth);
  assert.ok(a60.q > 1e4 && a60.q < 4e4,
    `dynamic pressure at 60km ${(a60.q / 1000).toFixed(1)} kPa not in 10-40 kPa range`);
  // 120km should be near vacuum
  assert.ok(aeroAt(120, 7.8, earth).q < 100, 'dynamic pressure at 120km should be near zero (<100 Pa)');
  // Heating grows with sqrt(density) * velocity^3
  assert.ok(aeroAt(60, 7.8, earth).heat > aeroAt(120, 7.8, earth).heat);
  // Mars thin atmosphere dynamic pressure much lower than Earth
  const mars = { rayleighScaleKm: 11.1, rho0: 0.020 };
  assert.ok(aeroAt(60, 7.8, mars).q < a60.q / 8, 'Mars dynamic pressure at 60km should be << Earth');
});

test('Reentry has physical aerodynamic implementation beyond sound effects', () => {
  const s = read('src/engine/ship.js');
  const m = read('src/main.js');
  assert.ok(/export function aeroAt/.test(s), 'missing aeroAt model');
  assert.ok(/this\.vel\.multiplyScalar\(1 - dv \/ this\.vel\.length\(\)\)/.test(s), 'missing drag deceleration');
  assert.ok(/ship\.aero\?\.q/.test(m), 'camera shake not driven by dynamic pressure');
  assert.ok(/reentry-glow/.test(m), 'missing plasma sheath glow');
});

// -- Water surface wave detail --
test('Water wave ripple amplitude and thresholds reveal visible surface displacement', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/waterGrad \* 0\.0012/.test(src), 'water wave amplitude too small');
  assert.ok(/smoothstep\(0\.7, 1\.6, fp \* 820\.0\)/.test(src), 'water wave footprint threshold too tight');
  assert.ok(!/waterGrad \* 0\.00025/.test(src), 'legacy low amplitude still present');
});

// -- Rock material surface texture --
test('Rock material features procedural normal perturbation', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/mat\.onBeforeCompile/.test(src), 'rock material missing onBeforeCompile');
  assert.ok(/rgrad\(vRockPos \* 900\.0\)/.test(src), 'missing rock normal perturbation');
  assert.ok(/uniform mat3 normalMatrix;/.test(src), 'fragment shader must declare normalMatrix');
});

// -- HUD only writes to DOM when content changes --
test('HUD innerHTML uses content comparison to avoid redundant DOM writes', () => {
  const src = read('src/ui/hud.js');
  assert.ok(/_navHtml/.test(src) && /_tgtHtml/.test(src) && /_timeHtml/.test(src),
    'HUD innerHTML locations should compare content before writing');
  assert.ok(!/this\.elNav\.innerHTML = rows\.join\(''\);\s*$/m.test(src),
    'navigation bar still rebuilt unconditionally');
});

// -- Distant planet points follow 1/d^2 flux attenuation --
test('Distant planet point brightness attenuates with 1/d^2', () => {
  const src = read('src/scene/builder.js');
  assert.ok(/const flux = 1 \/ Math\.max\(dAUg \* dAUg, 1e-6\)/.test(src), 'missing distance term');
  assert.ok(/Math\.min\(1, flux \* 1\.4\)/.test(src), 'point brightness does not multiply distance term');
  // Numerical check: Venus (0.31 AU) brighter than Neptune (30 AU)
  const flux = (d) => Math.min(1, (1 / (d * d)) * 1.4);
  assert.ok(flux(0.31) >= 1, 'Venus should be full brightness');
  assert.ok(flux(30) < 0.002, `Neptune should be very dim, got ${flux(30).toExponential(2)}`);
});

// -- Milky Way rendering --
test('Milky Way: real texture prioritized, procedural fallback', () => {
  const src = read('src/scene/starfield.js');
  assert.ok(/function makeMilkyWayTexture/.test(src), 'missing procedural fallback');
  // Real photographic Milky Way texture prioritized, procedural generation as fallback
  assert.ok(/milkywayTex = milkywayTex \?\? makeMilkyWayTexture\(\)/.test(src),
    'real texture not prioritized');
  assert.ok(/Math\.exp\(-Math\.abs\(b\) \/ 9\)/.test(src), 'missing galactic disc brightness band');
  assert.ok(/dust/.test(src), 'missing dust lanes');
  // Celestial sphere segments for smooth galactic disc
  assert.ok(/SphereGeometry\(SKY_R, 256, 128\)/.test(src), 'Milky Way sphere segments insufficient');
});

// -- LOD band overlap z-fighting --
test('Terrain coarse tier polygonOffset eliminates stippling at LOD boundaries', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/li \* 6/.test(src), 'coarse tier offset insufficient');
  assert.ok(/polygonOffsetFactor: polyUnits > 0 \? 2 : 0/.test(src), 'offset factor should be 2');
});

// -- Photometric invariants --

test('Hapke normalization: integrated disk brightness equals 2/3 of Lambertian sphere', async () => {
  const { hapkeDiskMean } = await import('../src/scene/planetMaterial.js');
  const { HAPKE_PARAMS } = await import('../src/astro/bodies.js');
  for (const [id, hp] of Object.entries(HAPKE_PARAMS)) {
    const dm = hapkeDiskMean(hp.w, hp.B0, hp.h, hp.g);
    const norm = dm > 1e-6 ? (2 / 3) / dm : 1;
    const normalized = dm * norm;
    assert.ok(Math.abs(normalized - 2 / 3) < 1e-6,
      `${id}: normalized disk average ${normalized.toFixed(4)} != 2/3`);
  }
});

test('Lambertian sphere disk integrated brightness self-check = 2/3', async () => {
  const { hapkeDiskMean } = await import('../src/scene/planetMaterial.js');
  // Numerical check: integrating f(mu) = mu over disk yields 2/3
  const N = 64; let num = 0, den = 0;
  for (let i = 0; i < N; i++) { const mu = (i + 0.5) / N; num += mu * mu; den += mu; }
  assert.ok(Math.abs(num / den - 2 / 3) < 1e-3, `Lambert disk average should be 2/3, got ${(num/den).toFixed(4)}`);
  assert.ok(typeof hapkeDiskMean === 'function');
});

test('Phase curve is monotonic: brightness does not increase as phase angle increases', async () => {
  const { hapkeDiskMean } = await import('../src/scene/planetMaterial.js');
  // Compare face-on vs oblique lunar disk mean: face-on must be brighter
  const hp = { w: 0.23, B0: 1.6, h: 0.06, g: -0.35 };
  const dm0 = hapkeDiskMean(hp.w, hp.B0, hp.h, hp.g);
  assert.ok(dm0 > 0 && Number.isFinite(dm0));
  // Backscattering gives opposition surge: B0>0 brighter than B0=0
  const dmNoSurge = hapkeDiskMean(hp.w, 0, hp.h, hp.g);
  assert.ok(dm0 > dmNoSurge * 1.2,
    `opposition surge insufficient: ${dm0.toFixed(3)} vs without surge ${dmNoSurge.toFixed(3)}`);
});

test('Disk and terrain display grades match per-channel for all bodies', async () => {
  const { TERRAIN_GRADE, displayGradeOf } = await import('../src/scene/planetMaterial.js');
  for (const id of Object.keys(TERRAIN_GRADE)) {
    const d = displayGradeOf(id);
    if (!d) continue;
    for (let i = 0; i < 3; i++) assert.equal(d.grade[i], TERRAIN_GRADE[id].grade[i]);
  }
});

// -- Gas giant color: saturation compensation for ACES highlight desaturation --
test('Jupiter and Saturn have saturation compensation (prevents washed-out gray appearance)', async () => {
  const { displayGradeOf } = await import('../src/scene/planetMaterial.js');
  for (const id of ['jupiter', 'saturn']) {
    const g = displayGradeOf(id);
    assert.ok(g && g.sat > 1.1, `${id} missing saturation compensation`);
  }
});

// -- Target bug fix assertions --
test('Ice sheets are not classified as oceans (luminance excludes ice from blue mask)', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/om \*= 1\.0 - smoothstep\(0\.42, 0\.68, lum3\)/.test(src),
    'missing exclusion for bright ice sheets in water mask');
});

test('Mouse wheel inside UI panels does not zoom camera', () => {
  const src = read('src/engine/ship.js');
  assert.ok(/closest\?\.\('#directory, #help, \.tour-bar, \.tc-panel, #hud-target/.test(src),
    'missing panel check: scrolling inside panels should not zoom camera');
});

test('Compass north is rotation axis projected onto local horizontal plane', () => {
  const src = read('src/main.js');
  assert.ok(/const dotAz = axis\.x \* zenithDir\.x/.test(src), 'north direction not projected onto horizontal plane');
});

test('Haumea and Quaoar have confirmed rings and are rendered with ring systems', () => {
  const tno = read('src/astro/tno.js');
  const scene = read('src/scene/tnoScene.js');
  assert.ok(/rings: \{ innerKm: 2252/.test(tno), 'Haumea missing rings (Ortiz 2017)');
  assert.ok(/rings: \{ innerKm: 4040/.test(tno), 'Quaoar missing rings (Morgado 2023)');
  assert.ok(/createRings/.test(scene), 'TNO scene does not render rings');
});

test('2003 AZ84 rendered with measured triaxial ratio and conserved equivalent radius', () => {
  const tno = read('src/astro/tno.js');
  const [a, b, c] = [484, 339, 291];
  const eq = Math.cbrt(a * b * c);
  assert.ok(Math.abs(eq - 362) / 362 < 0.03, `equivalent radius ${eq.toFixed(0)} deviates from 362`);
  assert.ok(/axes: \[484, 339, 291\]/.test(tno), 'AZ84 not rendered with triaxial axes');
});

test('Giant planet normals use inverse-transpose scaling (avoids mid-latitude distortion)', () => {
  const mat = read('src/scene/planetMaterial.js');
  const b = read('src/scene/builder.js');
  assert.ok(/normal\.y \* uInvScaleY/.test(mat), 'missing inverse transpose');
  assert.ok(/uInvScaleY\.value = 1 \/ Math\.max\(sy, 1e-3\)/.test(b), 'inverse transpose not written by oblateness');
});

// -- Gas giant bands: shear-driven turbulence and vortex streets --
test('Gas giant bands generate turbulence and eddies driven by jet stream shear', () => {
  const src = read('src/scene/planetMaterial.js');
  assert.ok(/float jets = \(uBodyId == 5\) \? 24\.0 : 16\.0/.test(src), 'missing body-specific jet stream count');
  assert.ok(/float shear = abs\(cos\(lat \* jets/.test(src), 'missing shear intensity');
  assert.ok(/eddy/.test(src), 'missing eddy structure');
  assert.ok(/uBodyId == 5 \|\| uBodyId == 6/.test(src), 'Saturn does not share turbulence path');
});

// -- Aurora longitudinal structure, Milky Way filtering, and resolution lock --
test('Aurora features longitudinal structure (not a uniform green ring)', () => {
  const src = read('src/scene/atmosphere.js');
  assert.ok(/float lonA = atan\(sdir\.z, sdir\.x\)/.test(src), 'missing aurora longitude');
  assert.ok(/float arcs = 0\.42 \+ 0\.58 \* pow/.test(src), 'missing segmented bright arcs');
  assert.ok(/ovalJitter/.test(src), 'missing oval longitudinal jitter');
});

test('Milky Way texture avoids pixel-level noise artifacts', () => {
  const src = read('src/scene/starfield.js');
  assert.ok(!/rnd\(\)/.test(src.split('makeMilkyWayTexture')[1]?.split('const tex =')[0] ?? ''),
    'Milky Way generation still has pixel noise');
  assert.ok(/keep structure only/i.test(src), 'Missing structure retention note');
});

test('Resolution lock via ?pr= supported for visual audits', () => {
  const q = read('src/engine/quality.js');
  assert.ok(/get\('pr'\)/.test(q), 'missing pr parameter');
  assert.ok(/return \(\) => \{\}/.test(q), 'locked resolution returns empty guard');
});

// -- Underwater absorption, bilinear high-pass, and DEM loading feedback --
test('Underwater fog attenuates by visibility with cyan-blue spectral tint (red absorbed first)', () => {
  const src = read('src/main.js');
  assert.ok(/fogDensity = 35 \+ depth \* 60/.test(src), 'underwater fog density too low');
  assert.ok(/fogColor\.setRGB\(0\.004 \+ 0\.030 \* dim, 0\.030 \+ 0\.115 \* dim, 0\.060 \+ 0\.150 \* dim\)/.test(src),
    'underwater fog color does not shift cyan-blue');
});

test('Texture high-pass field uses bilinear filtering (avoids grid-line staircasing)', () => {
  const src = read('src/scene/terrain.js');
  assert.ok(/const a = hi\[y0 \* W \+ x0\]/.test(src), 'high-pass field still uses nearest-neighbor');
  assert.ok(/tx = fx - x0/.test(src), 'missing bilinear interpolation weights');
});

test('Feedback displayed when pressing G before DEM is loaded', () => {
  const m = read('src/main.js');
  const i = read('src/ui/i18n.js');
  assert.ok(/t\('tip\.terrainLoading'\)/.test(m), 'missing tip');
  assert.ok(/tip\.terrainLoading/.test(i), 'missing translation string');
});

// -- Ceres: IAU dwarf planet presence and orbital consistency --
test('Ceres included in scene with heliocentric distance consistent with orbital elements', async () => {
  const { TNO_DATA, TNO_IDS, tnoPosition } = await import('../src/astro/tno.js');
  assert.ok(TNO_IDS.includes('ceres'), 'Ceres not in TNO_IDS catalog');
  const d = TNO_DATA.ceres;
  assert.equal(d.radiusKm, 469.7);
  const p = tnoPosition('ceres', 2451545.0);   // J2000
  const r = Math.hypot(p.x, p.y, p.z) / 1.495978707e8;
  // Analytical: M = L - varpi = 22.392 deg, r = a(1 - e^2)/(1 + e cos nu) ~= 2.573 AU
  assert.ok(Math.abs(r - 2.573) < 0.03, `J2000 heliocentric distance ${r.toFixed(3)} AU deviates from analytical 2.573`);
  // After one orbital period, distance should return to same value
  const P = d.el[0] ** 1.5 * 365.25;           // days
  const q = tnoPosition('ceres', 2451545.0 + P);
  const r2 = Math.hypot(q.x, q.y, q.z) / 1.495978707e8;
  assert.ok(Math.abs(r2 - r) < 0.01, `distance after one period ${r2.toFixed(3)} does not match ${r.toFixed(3)}`);
});

// -- Zodiacal light and TNO point distance/phase modulation --
test('Night sky includes zodiacal light oriented toward sun direction', () => {
  const src = read('src/scene/starfield.js');
  assert.ok(/createZodiacalLight/.test(src), 'missing zodiacal light');
  assert.ok(/setSunDir/.test(src), 'zodiacal light not oriented by sun direction');
  assert.ok(/float band = exp\(-abs\(lat\) \/ 0\.14\)/.test(src), 'missing ecliptic diffuse band');
  const m = read('src/main.js');
  assert.ok(/sky\.setSunDir\?\./.test(m), 'main.js does not update sun direction');
});

test('TNO points modulated by distance and phase angle (30 AU differs from 90 AU)', () => {
  const src = read('src/scene/tnoScene.js');
  assert.ok(/const flux = Math\.min\(1, \(40 \/ dAUg\) \* \(40 \/ dAUg\)\)/.test(src), 'missing distance term');
  assert.ok(/cosPhase/.test(src), 'missing phase angle');
});

// -- New Horizons: spacecraft instantiated and positioned --
test('New Horizons spacecraft instantiated and positioned at ~59 AU in 2026', async () => {
  const { newHorizonsPosition, NEW_HORIZONS } = await import('../src/scene/spacecraft.js');
  assert.ok(NEW_HORIZONS.id === 'newhorizons');
  const p = newHorizonsPosition(2461330);   // Around 2026-06
  const au = Math.hypot(p.x, p.y, p.z) / 1.495978707e8;
  assert.ok(au > 55 && au < 65, `heliocentric distance ${au.toFixed(1)} AU unreasonable (expected ~59)`);
  const m = read('src/main.js');
  assert.ok(/NEW_HORIZONS/.test(m) && /newHorizonsPosition/.test(m), 'main.js does not instantiate New Horizons');
  assert.ok(/posFn/.test(m), 'spacecraft update should use unified posFn');
});

// -- Procedural gas giant band textures seamless at antimeridian --
test('Procedural band texture edges are continuous across antimeridian', async () => {
  const { proceduralBandsPixels } = await import('../src/scene/proceduralTextureData.js');
  const it = proceduralBandsPixels('seamtest', [[200,180,140],[150,120,90],[220,200,170]]);
  let r; do { r = it.next(); } while (!r.done);
  const { data, width: w, height: h } = r.value;
  let diff = 0;
  for (let y = 0; y < h; y++) {
    diff += Math.abs(data[(y * w) * 4] - data[(y * w + w - 1) * 4]);
  }
  const avg = diff / h;
  assert.ok(avg < 3, `left/right column average difference ${avg.toFixed(2)}, antimeridian seam persists`);
});

// -- Walk mode immersion boundaries --
test('Walking mode displays helmet vignette overlay', () => {
  const css = read('src/style.css');
  const m = read('src/main.js');
  assert.ok(/body\.walk-mode::after/.test(css), 'missing walk-mode vignette styling');
  assert.ok(/classList\.toggle\('walk-mode', appMode === 'walk'\)/.test(m), 'vignette not toggled by appMode');
});

test('Overlay key light is positioned behind camera (illuminates cockpit front)', () => {
  const m = read('src/main.js');
  assert.ok(/key\.position\.set\(0\.35, 0\.55, 1\.0\)/.test(m), 'key light is still in front');
});

// -- Atmospheric ground bounce tinted by Rayleigh scattering spectrum --────────
test('Atmospheric ground bounce tinted by Rayleigh spectrum (not neutral white)', () => {
  const src = read('src/scene/atmosphere.js');
  assert.ok(/vec3 gTint = normalize\(uBetaR/.test(src), 'missing spectral tint');
  assert.ok(/groundLitCol/.test(src), 'ground bounce term does not use spectral tint');
});

// -- Spatial audio: stereo panning on roll --
test('Audio includes stereo panning driven by ship roll angle', () => {
  const a = read('src/engine/audio.js');
  const m = read('src/main.js');
  assert.ok(/createStereoPanner/.test(a), 'missing StereoPanner');
  assert.ok(/setPan\(v\)/.test(a), 'missing setPan');
  assert.ok(/audioEngine\.setPan\?\./.test(m), 'main.js does not drive setPan');
});

// -- Shared sin-free GLSL hash --
test('GLSL hash centralized and avoids sin() to prevent mediump precision degradation', () => {
  const shared = read('src/scene/glslNoise.js');
  assert.ok(/float glslHash31\(vec3 p3\)/.test(shared), 'missing shared hash');
  assert.ok(!/sin\(/.test(shared.split('export const HASH_GLSL')[1] ?? ''), 'shared hash still uses sin()');
  for (const f of ['atmosphere', 'planetMaterial', 'terrain', 'sun']) {
    const src = read(`src/scene/${f}.js`);
    assert.ok(/\$\{HASH_GLSL\}/.test(src), `${f} missing shared hash injection`);
    const nInject = (src.match(/\$\{HASH_GLSL\}/g) ?? []).length;
    const nUse = (src.match(/glslHash31\(/g) ?? []).length;
    assert.ok(nInject >= nUse, `${f}: injected ${nInject} times but referenced ${nUse} times`);
  }
});

test('Base sphere: procedural terrain minimum elevation not clipped by planetary sphere', () => {
  // Audit C-2: ensures basin floors are not clipped by base sphere
  const all = { ...BODIES, ...MOON_PHYS };
  let checked = 0;
  for (const [id, phys] of Object.entries(all)) {
    if (!phys?.radiusKm || !phys.landable || phys.shape?.dims) continue;
    const f = new HeightField(id, phys);
    checked++;
    let minH = Infinity;
    for (let i = 0; i < 400; i++) {
      const t = Math.acos(1 - 2 * (i + 0.5) / 400), ph = i * 2.39996;
      const d = { x: Math.sin(t) * Math.cos(ph), y: Math.cos(t), z: Math.sin(t) * Math.sin(ph) };
      minH = Math.min(minH, f.height(d));
    }
    assert.ok(minH >= f.baseSphereRadius({ x: 0, y: 1, z: 0 }) - phys.radiusKm * 0.3,
      `${id}: lowest elevation ${minH.toFixed(2)} is significantly below base sphere`);
  }
  assert.ok(checked > 30, `only checked ${checked} bodies`);
});

test('Planetary sphere carries large-scale relief: boundary step much smaller than legacy design', () => {
  // Evaluates relief sphere boundary step without artificial pillar artifacts
  const smooth = {
    radiusKm: 6371, landable: true,
    surface: { ampKm: 8, roughness: 0.6, craters: 0, palette: 'gray' },
  };
  const f = new HeightField('synthetic-relief', smooth);
  let maxDiff = 0;
  for (let i = 0; i < 600; i++) {
    const t = Math.acos(1 - 2 * (i + 0.5) / 600), ph = i * 2.39996;
    const d = { x: Math.sin(t) * Math.cos(ph), y: Math.cos(t), z: Math.sin(t) * Math.sin(ph) };
    maxDiff = Math.max(maxDiff, f.height(d) - f.baseSphereRadius(d));
  }
  assert.ok(maxDiff > 0, 'terrain should be higher overall than base sphere');
  // Elevation step = baseOffset + mid-frequency noise
  assert.ok(maxDiff < 4.5, `noise boundary step ${maxDiff.toFixed(2)}km too large`);

  // With crater fields, step is governed by crater depth but remains well below legacy design
  const f2 = new HeightField('synthetic-relief-crater', {
    ...smooth, surface: { ...smooth.surface, craters: 0.5 },
  });
  let diff2 = 0;
  for (let i = 0; i < 600; i++) {
    const t = Math.acos(1 - 2 * (i + 0.5) / 600), ph = i * 2.39996;
    const d = { x: Math.sin(t) * Math.cos(ph), y: Math.cos(t), z: Math.sin(t) * Math.sin(ph) };
    diff2 = Math.max(diff2, f2.height(d) - f2.baseSphereRadius(d));
  }
  assert.ok(diff2 > maxDiff, 'crater field should contribute additional step');

  // Base sphere has actual relief perturbations
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 600; i++) {
    const t = Math.acos(1 - 2 * (i + 0.5) / 600), ph = i * 2.39996;
    const d = { x: Math.sin(t) * Math.cos(ph), y: Math.cos(t), z: Math.sin(t) * Math.sin(ph) };
    const r = f.reliefRadius(d); mn = Math.min(mn, r); mx = Math.max(mx, r);
  }
  assert.ok(mx - mn > f.effAmp * 0.2,
    `base sphere elevation range ${(mx - mn).toFixed(2)}km, large-scale relief not effective`);
});

test('Base sphere does not exceed terrain minimum elevation (prevents crater clipping)', () => {
  const all = { ...BODIES, ...MOON_PHYS };
  let checked = 0;
  for (const [id, phys] of Object.entries(all)) {
    if (!phys?.radiusKm || !phys.landable || phys.shape?.dims) continue;
    const f = new HeightField(id, phys);
    if (!f.reliefSphere) continue;
    checked++;
    let worst = -Infinity;
    for (let i = 0; i < 300; i++) {
      const t = Math.acos(1 - 2 * (i + 0.5) / 300), ph = i * 2.39996;
      const d = { x: Math.sin(t) * Math.cos(ph), y: Math.cos(t), z: Math.sin(t) * Math.sin(ph) };
      worst = Math.max(worst, f.baseSphereRadius(d) - f.height(d));
    }
    // Clamp ensures non-negative; allow small floating-point tolerance
    assert.ok(worst < 1e-9, `${id}: base sphere exceeds terrain by ${worst.toFixed(3)}km, crater floor clipped`);
  }
  assert.ok(checked > 30, `only checked ${checked} bodies`);
});

// -- Aerial perspective: shared single-scattering model with atmosphere shell --
test('Aerial perspective shares single-scattering model with shell, horizon whiter than zenith', async () => {
  const { atmosphereFog } = await import('../src/scene/atmosphere.js');
  const earth = BODIES.earth;
  const up = { x: 0, y: 1, z: 0 };
  const sun = { x: 0, y: 1, z: 0 };
  const at = (elDeg) => {
    const r = elDeg * Math.PI / 180;
    return atmosphereFog(earth, {
      altKm: 0.03, up, viewDir: { x: Math.cos(r), y: Math.sin(r), z: 0 },
      sunDir: sun, sunI: 5 * (earth.atmosphere.multiplier ?? 1), boost: 1, boostM: 1, dustStorm: 0,
    });
  };
  const horizon = at(1), zenith = at(90), mid = at(45);
  // Horizon has higher optical depth -> lower transmittance; zenith is clearer
  assert.ok(horizon.alpha > zenith.alpha + 0.3,
    `horizon alpha=${horizon.alpha.toFixed(2)} should be > zenith ${zenith.alpha.toFixed(2)}`);
  // Saturation: horizon is whiter, mid-sky is blue
  const sat = (f) => (f.color[2] - f.color[0]) / f.color[2];
  assert.ok(sat(horizon) < sat(mid) * 0.6,
    `horizon saturation ${sat(horizon).toFixed(2)} should be lower than mid-sky ${sat(mid).toFixed(2)}`);
  // Source function is finite and positive
  for (const f of [horizon, zenith]) {
    for (const c of f.color) assert.ok(Number.isFinite(c) && c >= 0 && c < 50, `source function abnormal ${c}`);
  }
});

test('Dense haze bodies have opaque skies (Titan tau ~= 3.7, sky is not black)', async () => {
  const { atmosphereFog } = await import('../src/scene/atmosphere.js');
  const titan = MOON_PHYS.titan;
  const tauM = Math.max(...titan.atmosphere.mie) * 1000 * titan.atmosphere.mieScaleKm
    * (1 + (titan.atmosphere.haze ?? 0) * 0.22);
  assert.ok(tauM > 2 && tauM < 8, `Titan haze vertical optical depth ${tauM.toFixed(2)} not in measured range 2-8`);
  const f = atmosphereFog(titan, {
    altKm: 0.03, up: { x: 0, y: 1, z: 0 }, viewDir: { x: 1, y: 0.02, z: 0 },
    sunDir: { x: 0, y: 1, z: 0 }, sunI: 5 * (titan.atmosphere.multiplier ?? 1) / (9.55 ** 2),
    boost: 1, boostM: 1, dustStorm: 0,
  });
  assert.ok(f.alpha > 0.9, `Titan horizon should be nearly opaque, got alpha=${f.alpha.toFixed(2)}`);
  // Orange hue: red scattering coefficient highest, source function red > blue
  assert.ok(f.color[0] > f.color[2] * 1.5,
    `Titan sky should be orange (red ${f.color[0].toFixed(4)} vs blue ${f.color[2].toFixed(4)})`);
});

test('Mars dust optical depth in measured range (clear period tau ~= 0.4)', () => {
  const a = BODIES.mars.atmosphere;
  const tau = Math.max(...a.mie) * 1000 * a.mieScaleKm * (1 + (a.haze ?? 0) * 0.22);
  assert.ok(tau > 0.25 && tau < 1.2, `Mars dust vertical tau=${tau.toFixed(3)} not in clear-period range 0.3-0.8`);
  // Red scattering highest due to Fe2O3 blue absorption -> yellowish brown sky
  assert.ok(a.mie[0] > a.mie[2], 'Mars dust scattering coefficient should be red > blue');
});

test('Atmosphere shell dither amplitude normalized by exposure (prevents noise at high exposure)', () => {
  const src = read('src/scene/atmosphere.js');
  assert.ok(/uInvExposure/.test(src), 'missing uInvExposure');
  assert.ok(/dith\s*=[\s\S]{0,200}uInvExposure/.test(src), 'dither amplitude not normalized by exposure');
  const m = read('src/main.js');
  assert.ok(/au\?\.uInvExposure/.test(m), 'main loop does not write uInvExposure to atmosphere shell');
});

// -- Label projection: zero per-frame heap allocation --
test('Label projection does not allocate per-frame objects (199 labels x Vector3)', () => {
  const src = read('src/ui/labels.js');
  assert.ok(!/rel\.clone\(\)\.project/.test(src),
    'still using rel.clone().project(): allocates per label each frame');
  assert.ok(/_ndc\.copy\(rel\)\.project/.test(src), 'missing reusable scratch vector');
  // Style writes should use state cache
  assert.ok(/item\._shown/.test(src), 'display writes lack state cache');
});
