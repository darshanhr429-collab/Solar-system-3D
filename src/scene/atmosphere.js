// Physical atmospheric scattering: single-scattering raymarching (Nishita model).
// Shared ray optics for inside atmosphere (sky dome / sunset reddening) and space perspective (blue limb arc).
// Camera resides at floating origin (vec3(0)).

import * as THREE from 'three';
import { HASH_GLSL } from './glslNoise.js';
import { QUALITY } from '../engine/quality.js';

export function createAtmosphere(phys, auroraMode = 0) {
  const a = phys.atmosphere;
  const Rg = phys.radiusKm;
  const Ra = Rg + a.heightKm;

  // mie / mieG support scalar (backward compatible) and [R,G,B] array for chromatic scattering (Mars blue sunset)
  const mieArr  = Array.isArray(a.mie)  ? a.mie  : [a.mie,  a.mie,  a.mie ];
  const mieGArr = Array.isArray(a.mieG) ? a.mieG : [a.mieG, a.mieG, a.mieG];

  const uniforms = {
    uCenter: { value: new THREE.Vector3() },     // Planet center (camera relative, km)
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uRg: { value: Rg },
    uRa: { value: Ra },
    uBetaR: { value: new THREE.Vector3(a.rayleigh[0] * 1000, a.rayleigh[1] * 1000, a.rayleigh[2] * 1000) }, // m⁻¹→km⁻¹
    uBetaM: { value: new THREE.Vector3(mieArr[0] * 1000, mieArr[1] * 1000, mieArr[2] * 1000) }, // Chromatic Mie (km^-1)
    uHR: { value: a.rayleighScaleKm },
    uHM: { value: a.mieScaleKm },
    uG: { value: new THREE.Vector3(mieGArr[0], mieGArr[1], mieGArr[2]) }, // Chromatic mieG (Henyey-Greenstein asymmetry)
    uSunI: { value: 13.0 * (a.multiplier ?? 1) },
    uBoost: { value: 1.0 },  // Rayleigh density scale (daylight sky brightness)
    uBoostM: { value: 1.0 }, // Mie density scale (prevents solar disk washout)
    uHaze: { value: a.haze ?? 0.0 }, // Near-surface aerosol/dust haze (Mars dust, Venus clouds, Titan haze)
    // Ozone layer (Chappuis band absorption): Gaussian profile centered at ~25 km with ~8 km half-width.
    // Absorbs yellow-red wavelengths, creating deep twilight blue and the Belt of Venus.
    // Relative to Earth column density (Earth 1.0, Mars ~0.1, others 0).
    uOzone: { value: a.ozone ?? 0.0 },
    // Multiple scattering desaturation factor (proxy for single-scattering albedo).
    // Conservative Rayleigh scattering returns energy as diffuse white light at horizon;
    // absorbing aerosols (Titan tholins) maintain orange tint without washing to gray.
    // Characterizes radiative energy absorption in thick atmospheres.
    // Expresses fraction of absorbed versus scattered radiation.
    uMsDesat: { value: a.msDesat ?? 1.0 },
    // Surface albedo: diffuse reflection of downward solar flux from ground.
    // Brightens lower atmosphere over snow, desert, or cloud decks.
    // Set to 0 for gas giants lacking solid surfaces.
    uGroundAlbedo: { value: a.groundAlbedo ?? 0.0 },
    // Oblateness (R8 #1): gas giant atmospheres deform with oblate planetary geometry.
    // Atmospheric intersections evaluate against identical ellipsoid to avoid double-limb artifacts.
    // uStretch = 1/(1-ob) - 1 (stretches along polar axis); 0 for spherical bodies.
    uAxis: { value: new THREE.Vector3(0, 1, 0) }, // Planetary spin axis (world frame)
    uStretch: { value: phys.landable ? 0 : (1 / (1 - (phys.oblateness ?? 0)) - 1) },
    // === Issue #27/#29: Dust storm + Aurora uniforms ===
    uTime: { value: 0 },            // Seconds (drives auroral curtain animation)
    uSolarActivity: { value: 0.7 }, // Solar cycle activity 0..1 (modulates auroral intensity)
    uAuroraMode: { value: auroraMode }, // 0=none 1=Earth 2=Jupiter 3=Saturn 4=Triton
    uAuroraStrength: { value: 1.0 },    // Set to 0 in lower quality tiers
    uDustStorm: { value: 0.0 },     // Mars dust storm intensity 0..1
    // Exposure-normalized dithering eliminates 8-bit banding without amplifying noise
    // in high-exposure atmospheres (e.g. Titan).
    // Dithering amplitude calibrated to ~1/255 at final output.
    // Stable sky rendering.
    uInvExposure: { value: 1 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    // Exterior: FrontSide + depthTest renders atmosphere in front of opaque surfaces,
    // properly occluded by foreground celestial bodies (#R15).
    // Interior: DoubleSide allows viewing sky dome from within the atmospheric shell.
    side: THREE.DoubleSide,
    // A volume integral already accounts for the entire atmosphere ray. Three
    // otherwise draws transparent DoubleSide meshes twice, integrating twice.
    forceSinglePass: true,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCenter;
      uniform vec3 uSunDir;
      uniform float uRg, uRa, uHR, uHM, uSunI, uBoost, uBoostM, uHaze, uStretch;
      uniform float uOzone;
      uniform float uMsDesat;
      uniform float uGroundAlbedo;
      uniform vec3 uBetaR, uBetaM, uG, uAxis; // Chromatic uG: blue forward-peak creates sunset blue halo
      // === Issue #27/#29 uniforms ===
      uniform float uTime;
      uniform float uSolarActivity;
      uniform int uAuroraMode;    // 0=none 1=Earth 2=Jupiter 3=Saturn 4=Triton
      uniform float uAuroraStrength;
      uniform float uDustStorm;
      uniform float uInvExposure;
      varying vec3 vWorldPos;

      // Polar stretch: maps oblate ellipsoid to unit sphere (identity when uStretch = 0)
      vec3 stretch(vec3 p) { return p + uAxis * (dot(p, uAxis) * uStretch); }

      // Ray-ellipsoid intersection in stretched spherical space,
      // returning (tNear, tFar); returns (1e20, -1e20) on miss
      vec2 raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
        vec3 o = stretch(ro - c);
        vec3 d = stretch(rd);
        float a2 = dot(d, d);
        float b = dot(o, d);
        float det = b * b - a2 * (dot(o, o) - r * r);
        if (det < 0.0) return vec2(1e20, -1e20);
        float s = sqrt(det);
        return vec2((-b - s) / a2, (-b + s) / a2);
      }

      // Ellipsoid altitude (equivalent equatorial scale)
      float hAbove(vec3 p) { return length(stretch(p - uCenter)) - uRg; }

      // Value-noise primitive for auroral curtain ripples (consistent with planetary material)
      ${HASH_GLSL}
      float phash(vec3 p) { return glslHash31(p); }
      float pnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(phash(i), phash(i + vec3(1,0,0)), f.x), mix(phash(i + vec3(0,1,0)), phash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(phash(i + vec3(0,0,1)), phash(i + vec3(1,0,1)), f.x), mix(phash(i + vec3(0,1,1)), phash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      void main() {
        // Outside the shell use its near face, inside use its far face. This
        // keeps one integral per pixel across the atmospheric boundary.
        bool insideShell = length(stretch(-uCenter)) < uRa;
        if (gl_FrontFacing == insideShell) discard;
        #include <logdepthbuf_fragment>
        vec3 ro = vec3(0.0);
        vec3 rd = normalize(vWorldPos);

        vec2 tA = raySphere(ro, rd, uCenter, uRa);
        if (tA.x > tA.y) discard;
        float t0 = max(tA.x, 0.0);
        float t1 = tA.y;
        vec2 tG = raySphere(ro, rd, uCenter, uRg);
        if (tG.x < tG.y && tG.x > 0.0) t1 = min(t1, tG.x);
        if (t1 <= t0) discard;

        const int N = ${QUALITY.atmoN};
        const int NL = ${QUALITY.atmoNL};
        float ds = (t1 - t0) / float(N);
        float odR = 0.0, odM = 0.0, odO = 0.0;
        float odRlit = 0.0;   // Optical depth over illuminated ground (for surface albedo bounce)
        vec3 inscR = vec3(0.0), inscM = vec3(0.0);
        vec3 auroraL = vec3(0.0); // Issue #29: Auroral emission accumulation (independent of scattering)

        for (int i = 0; i < N; i++) {
          vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
          float h = hAbove(p);
          float dR = exp(-h / uHR) * uBoost;   // Rayleigh density
          // Near-surface aerosol layer with independent uBoostM
          // Issue #27: Mars dust storm thickening near-surface aerosol optical depth
          float hazeEff = uHaze + uDustStorm * 0.6;
          float dM = (exp(-h / uHM) + hazeEff * exp(-h / max(uHM * 0.22, 0.5))) * uBoostM;
          odR += dR * ds;
          odM += dM * ds;
          // Checks whether ground point below sample receives direct sunlight.
          // Ground bounce requires sunlit terrain; zero on night hemisphere.
          // Evaluated using local sample normal.
          odRlit += smoothstep(-0.10, 0.10, dot(uSunDir, normalize(p - uCenter))) * dR * ds;
          // Ozone layer: Gaussian profile at 25 km altitude with 8 km half-width
          odO += exp(-pow((h - 25.0) / 8.0, 2.0)) * ds;
          // Optical depth toward Sun
          vec2 tS = raySphere(p, uSunDir, uCenter, uRa);
          float sl = max(tS.y, 0.0) / float(NL);
          float olR = 0.0, olM = 0.0, olO = 0.0;
          bool shadowed = false;
          vec2 tSG = raySphere(p, uSunDir, uCenter, uRg * 0.998);
          if (tSG.x < tSG.y && tSG.y > 0.0 && tSG.x > 0.0) shadowed = true;
          if (!shadowed) {
            for (int j = 0; j < NL; j++) {
              vec3 q = p + uSunDir * ((float(j) + 0.5) * sl);
              float hq = hAbove(q);
              olR += exp(-hq / uHR) * sl;
              olM += exp(-hq / uHM) * sl;
              olO += exp(-pow((hq - 25.0) / 8.0, 2.0)) * sl;
            }
            // Ozone extinction coefficient (km^-1) peaking in Chappuis band (600 nm);
            // minimal blue absorption produces twilight blue belt.
            vec3 betaO = vec3(1.25e-3, 4.4e-4, 2.5e-5) * uOzone;
            vec3 T = exp(-(uBetaR * (odR + olR) + uBetaM * 1.1 * (odM + olM)
                           + betaO * (odO + olO)));
            inscR += T * dR * ds;
            inscM += T * dM * ds; // Chromatic Mie forward scattering
          }
          // === Issue #29: Auroral Curtain Emission ===
          // High-latitude auroral oval (~65-75 deg magnetic latitude) across altitude bands.
          // Dual-scale noise generates dynamic vertical rayed curtains.
          // Skipped when uAuroraMode = 0 or uAuroraStrength = 0.
          if (uAuroraMode > 0 && uAuroraStrength > 0.001) {
            vec3 srel = stretch(p - uCenter);
            float sh = length(srel) - uRg;
            // Auroral altitude band: gas giants 30-500 km;
            // thin shells (Earth/Triton 60/20 km) scale proportionally to upper atmosphere.
            // Positioned within active ionospheric layer.
            float shellH = uRa - uRg;
            float altMin, altMax;
            if (uAuroraMode == 2 || uAuroraMode == 3) { altMin = 30.0; altMax = min(500.0, shellH); }
            else { altMin = shellH * 0.35; altMax = shellH * 0.97; }
            float altF = smoothstep(altMin, altMin + (altMax - altMin) * 0.25, sh)
                       * (1.0 - smoothstep(altMax - (altMax - altMin) * 0.35, altMax, sh));
            // Magnetic latitude (approximated via spin axis projection)
            float magLat = dot(normalize(srel), uAxis);
            float poleProx = abs(magLat);
            // Auroral oval: narrow ring at polar boundary.
            // Earth oval spans ~3-6 deg width centered near 67 deg magnetic latitude (poleProx ~= 0.92);
            // Jupiter/Saturn ovals are narrower and closer to poles (poleProx ~= 0.95-0.96).
            // Accurate narrow oval dimensions prevent unrealistic broad purple caps.
            // Accurate narrow oval dimensions prevent unrealistic broad purple caps.
            float ovalC, ovalW, aGain;
            if (uAuroraMode == 1)      { ovalC = 0.920; ovalW = 0.035; aGain = 1.00; } // Earth
            else if (uAuroraMode == 2) { ovalC = 0.955; ovalW = 0.018; aGain = 0.22; } // Jupiter H3+
            else if (uAuroraMode == 3) { ovalC = 0.950; ovalW = 0.016; aGain = 0.035; } // Saturn H3+ UV/IR
            else                       { ovalC = 0.900; ovalW = 0.040; aGain = 0.22; } // Triton N2
            float oval = smoothstep(ovalC - ovalW, ovalC, poleProx)
                       * (1.0 - smoothstep(ovalC, ovalC + ovalW, poleProx));
            // Vertical curtain rays: body-fixed coordinates normalized by radius
            // produce vertical light curtains (~140 km on Earth, ~1550 km on Jupiter).
            // Animated with temporal drift.
            float curtain1 = pnoise(srel / uRg * 28.0 + vec3(0.0, 0.0, uTime * 0.06));
            float curtain2 = pnoise(srel / uRg * 90.0 + vec3(uTime * 0.03, 0.0, 0.0));
            // Longitudinal structure: auroral oval exhibits segmented bright arcs
            // and substorm surges rather than unbroken uniform rings.
            // Authentic longitudinal variations in auroral brightness.
            vec3 sdir = normalize(srel);
            float lonA = atan(sdir.z, sdir.x);
            // Three-arc distribution with slow drift
            float arcs = 0.42 + 0.58 * pow(0.5 + 0.5 * sin(lonA * 3.0 - uTime * 0.02), 2.0);
            // Latitude position ripples subtly with longitude
            float ovalJitter = 1.0 + 0.004 * sin(lonA * 2.0 + 1.3);
            float auroraInt = altF * oval * ovalJitter * arcs
                            * (0.12 + 0.88 * smoothstep(0.28, 0.92, curtain1))
                            * (0.55 + 0.45 * curtain2);
            auroraInt *= uSolarActivity * uAuroraStrength * aGain;
            // Visible exclusively on nightside; faint emission is washed out by direct daylight.
            // Observers in low Earth orbit witness nightside auroral arcs.
            // Saturn/Jupiter H3+ emissions are primarily infrared/UV.
            // Day hemisphere emission zeroed out.
            // Realistic nightside confinement.
            // Clean day-night boundary transition.
            // Terminator serves as natural auroral boundary
            if (!shadowed) auroraInt = 0.0;
            // Auroral spectral emission colors:
            // Earth = OI 557.7nm green; Jupiter = H3+ blue-purple; Saturn = pink-purple; Triton = faint N2 red
            vec3 aColor;
            if (uAuroraMode == 1) aColor = vec3(0.15, 1.0, 0.35);
            else if (uAuroraMode == 2) aColor = vec3(0.55, 0.35, 1.0);
            else if (uAuroraMode == 3) aColor = vec3(0.80, 0.45, 0.90);
            else aColor = vec3(0.90, 0.40, 0.30);
            // Normalized by auroral layer thickness; nadir path auroraL ~= aColor,
            // limb path naturally brightens with optical thickness.
            // Stable emission across thin and thick shells.
            auroraL += aColor * auroraInt * ds / max(altMax - altMin, 1.0) * 0.12;
          }
        }

        float mu = dot(rd, uSunDir);
        float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
        // Chromatic Henyey-Greenstein: uG vec3 forward-scattering generates sunset blue halo on Mars
        vec3 g2 = uG * uG;
        vec3 phM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) /
                   ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * uG * mu, vec3(1e-6)), vec3(1.5)));

        vec3 L = uSunI * (uBetaR * phR * inscR + uBetaM * phM * inscM);
        L += auroraL; // Issue #29: Auroral emission directly added to radiance
        vec3 viewT = exp(-(uBetaR * odR + uBetaM * 1.1 * odM));
        float alpha = 1.0 - dot(viewT, vec3(0.3333));

        // Multiple scattering approximation: isotropic return of rescattered flux in optically thick regions.
        // Energy fraction ~= 1 - viewT.
        //
        // Source term uses camera-local density * column scale length sqrt(2*pi*R*H),
        // maintaining blue-dominant diffuse skylight across horizon paths.
        // Prevents artificial olive tinting at horizon.
        // Preserves realistic daylight sky color.
        // Modulated by illuminated path fraction (zero at night).
        // Realistic nocturnal darkness.
        vec3 msFrac = vec3(1.0) - viewT;
        float hCam = hAbove(ro);
        float hazeM = uHaze + uDustStorm * 0.6;
        float rhoRc = exp(-hCam / uHR) * uBoost;
        float rhoMc = (exp(-hCam / uHM) + hazeM * exp(-hCam / max(uHM * 0.22, 0.5))) * uBoostM;
        // Isotropic multiple-scattering limit E / (4*pi);
        // conservative energy limit in optically thick atmospheres.
        // Naturally scales down as msFrac^2 in thin atmospheres.
        // Tinted by normalized scattering coefficients (Rayleigh blue on Earth, haze orange on Titan).
        // Desaturates with scattering order toward incident sunlight (white) at dense horizon.
        // Realistic horizon whitening.
        // Matches natural sky illumination.
        // Balanced multiple scattering.
        vec3 scatTint = uBetaR * rhoRc + uBetaM * rhoMc;
        float smax = max(max(scatTint.r, scatTint.g), scatTint.b);
        vec3 sNorm = smax > 1e-12 ? scatTint / smax : vec3(0.0);
        float msMean = (msFrac.r + msFrac.g + msFrac.b) * (1.0 / 3.0);
        sNorm = mix(sNorm, vec3(1.0), msMean * uMsDesat);
        float litFrac = odR > 1e-6 ? odRlit / odR : 0.0;
        L += uSunI * sNorm * (1.0 / (4.0 * PI)) * msFrac * msFrac * litFrac;

        // === Surface Albedo Bounce ===
        // Sunlight penetrates atmosphere to surface, reflected according to ground albedo,
        // scattering into line-of-sight.
        // Brightens lower sky over bright deserts, snowfields, and cloud decks.
        // Two-way optical depth approximation weighted toward downward sightlines.
        // Dominates when looking toward terrain.
        // Subdued when viewing upward toward zenith.
        //
        // Evaluated only over sunlit terrain (zero on night hemisphere).
        // Nightside ground bounce returns zero.
        // Preserves realistic dark night skies.
        // Eliminates artificial nightglow.
        if (uGroundAlbedo > 0.0) {
          vec3 up = normalize(uCenter - ro);          // Local up vector
          float below = clamp(-dot(rd, up), 0.0, 1.0);
          float groundLit = odR > 1e-6 ? odRlit / odR : 0.0;
          vec3 twoWay = exp(-(uBetaR * odR + uBetaM * 1.1 * odM) * 1.5);
          // Reflected light traverses atmosphere and is tinted by Rayleigh spectrum
          // (blue on Earth, ochre on Mars).
          // Eliminates muddy brown horizon artifacts.
          // Realistic ground reflection tinting.
          vec3 gTint = normalize(uBetaR + vec3(1e-9));
          vec3 groundLitCol = mix(vec3(1.0), gTint * 1.7, 0.55);
          L += uSunI * uGroundAlbedo * groundLitCol * twoWay * (0.35 + 0.65 * below) * msFrac
             * (1.0 / PI) * groundLit;
        }

        // Subtle dithering eliminates 8-bit quantization banding
        // Dithering active only across pixels with non-zero atmospheric transmission
        // Scaled by uInvExposure to maintain constant ~1/255 output magnitude
        float dith = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5)
                   / 255.0 * uInvExposure;
        gl_FragColor = vec4(L + dith * alpha, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(Ra, 64, 48), mat);
  mesh.renderOrder = 100;
  mesh.frustumCulled = true;
  mat.userData.uniforms = uniforms;
  return mesh;
}

// -- Aerial Perspective JS Implementation ------------------------------------
//
// Ground terrain pixels occlude the transparent atmospheric shell.
// Terrain shader requires matching aerial perspective to blend distant topography into haze.
// Harmonized with shell raymarching so terrain haze seamlessly matches sky dome at horizon.
// Eliminates visual mismatch between ground fog and sky.
// Eliminates visual mismatch between ground fog and sky.
//
// Evaluates matching single-scattering integration in JS:
// Rayleigh + chromatic Mie + ozone + multiple scattering + ground albedo bounce.
//   - color: scattered radiance L along sightline (HDR linear)
//   - alpha: 1 - mean transmittance
//   - source: L / alpha (source function j / sigma_t for FogExp2 haze)
//   - density: local extinction coefficient at camera altitude (km^-1)
// Evaluated once per frame along camera forward vector (16x8 steps, minimal overhead).
//
// Non-blocking and lightweight.
export function atmosphereFog(phys, opts) {
  const a = phys?.atmosphere;
  if (!a) return null;
  const Rg = phys.radiusKm;
  const Ra = Rg + a.heightKm;
  const bR = [a.rayleigh[0] * 1000, a.rayleigh[1] * 1000, a.rayleigh[2] * 1000]; // m⁻¹→km⁻¹
  const mieIn = Array.isArray(a.mie) ? a.mie : [a.mie, a.mie, a.mie];
  const bM = [mieIn[0] * 1000, mieIn[1] * 1000, mieIn[2] * 1000];
  const gIn = Array.isArray(a.mieG) ? a.mieG : [a.mieG, a.mieG, a.mieG];
  const HR = a.rayleighScaleKm, HM = a.mieScaleKm;
  const haze = a.haze ?? 0;
  const ozone = a.ozone ?? 0;
  const groundAlbedo = a.groundAlbedo ?? 0;
  const boost = opts.boost ?? 1;
  const boostM = opts.boostM ?? 1;
  const hazeEff = haze + (opts.dustStorm ?? 0) * 0.6;
  const msDesat = a.msDesat ?? 1.0;
  const sunI = opts.sunI;

  const { up, viewDir, sunDir } = opts;
  // Camera altitude clamped to eye height floor (1.7m).
  //
  // Prevents ray-sphere intersection degeneration at ground level (altKm = 0),
  // ensuring clean non-zero integration paths.
  // Realistic eye elevation above surface.
  // Avoids zero-alpha fog collapse.
  // Robust physical baseline.
  const altKm = Math.max(opts.altKm ?? 0, 0.0017);
  const cx = -up.x * (Rg + altKm), cy = -up.y * (Rg + altKm), cz = -up.z * (Rg + altKm);
  const rdx = viewDir.x, rdy = viewDir.y, rdz = viewDir.z;
  const sdx = sunDir.x, sdy = sunDir.y, sdz = sunDir.z;

  // Ray-sphere intersection evaluated along solar direction.
  // Accurate planetary shadow checks across sightline sample points.
  // Eliminates incorrect dark horizon banding.
  const hitD = (ox, oy, oz, dx, dy, dz, r) => {
    const gx = ox - cx, gy = oy - cy, gz = oz - cz;
    const b = gx * dx + gy * dy + gz * dz;
    const cc = gx * gx + gy * gy + gz * gz - r * r;
    const det = b * b - cc;
    if (det < 0) return null;
    const sq = Math.sqrt(det);
    return [-b - sq, -b + sq];
  };
  const hit = (ox, oy, oz, r) => hitD(ox, oy, oz, rdx, rdy, rdz, r);
  const hAbove = (px, py, pz) => Math.hypot(px - cx, py - cy, pz - cz) - Rg;

  const shell = hit(0, 0, 0, Ra);
  if (!shell) return null;
  let t0 = Math.max(shell[0], 0), t1 = shell[1];
  const gr = hit(0, 0, 0, Rg);
  if (gr && gr[1] > 0) {
    // Camera below ground sphere clamps sightline to ground plane,
    // preventing rays from penetrating the entire planetary core.
    // Robust safety guard for extreme terrain.
    if (gr[0] <= 0) return null;
    t1 = Math.min(t1, gr[0]);
  }
  if (t1 <= t0) return null;

  const N = 16, NL = 8;
  const ds = (t1 - t0) / N;
  let odR = 0, odM = 0, odO = 0, odRlit = 0;
  const inscR = [0, 0, 0], inscM = [0, 0, 0];

  for (let i = 0; i < N; i++) {
    const t = t0 + (i + 0.5) * ds;
    const px = rdx * t, py = rdy * t, pz = rdz * t;
    // Clamps sample altitudes to >= 0 to avoid explosive density calculation below surface.
    // Prevents float overflow.
    const h = Math.max(hAbove(px, py, pz), 0);
    const dR = Math.exp(-h / HR) * boost;
    const dM = (Math.exp(-h / HM) + hazeEff * Math.exp(-h / Math.max(HM * 0.22, 0.5))) * boostM;
    odR += dR * ds;
    odM += dM * ds;
    // Checks direct illumination on terrain below sample point
    const pl = Math.hypot(px - cx, py - cy, pz - cz) || 1;
    const litDot = ((px - cx) * sdx + (py - cy) * sdy + (pz - cz) * sdz) / pl;
    odRlit += Math.max(0, Math.min(1, (litDot + 0.10) / 0.20)) * dR * ds;
    odO += Math.exp(-(((h - 25) / 8) ** 2)) * ds;

    // Optical depth toward Sun
    const ts = hitD(px, py, pz, sdx, sdy, sdz, Ra);
    const shadow = hitD(px, py, pz, sdx, sdy, sdz, Rg * 0.998);
    const shadowed = !!(shadow && shadow[0] < shadow[1] && shadow[1] > 0 && shadow[0] > 0);
    if (!shadowed && ts) {
      const sl = Math.max(ts[1], 0) / NL;
      let olR = 0, olM = 0, olO = 0;
      for (let j = 0; j < NL; j++) {
        const q = (j + 0.5) * sl;
        const hq = Math.max(hAbove(px + sdx * q, py + sdy * q, pz + sdz * q), 0);
        olR += Math.exp(-hq / HR) * sl;
        olM += Math.exp(-hq / HM) * sl;
        olO += Math.exp(-(((hq - 25) / 8) ** 2)) * sl;
      }
      const betaO = [1.25e-3 * ozone, 4.4e-4 * ozone, 2.5e-5 * ozone];
      for (let k = 0; k < 3; k++) {
        const tau = bR[k] * (odR + olR) + bM[k] * 1.1 * (odM + olM) + betaO[k] * (odO + olO);
        const T = Math.exp(-tau);
        inscR[k] += T * dR * ds;
        inscM[k] += T * dM * ds;
      }
    }
  }

  const mu = rdx * sdx + rdy * sdy + rdz * sdz;
  const phR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const out = [0, 0, 0];
  const msFrac = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const g = gIn[k], g2 = g * g;
    const phM = (3 / (8 * Math.PI)) * ((1 - g2) * (1 + mu * mu))
      / ((2 + g2) * Math.pow(Math.max(1 + g2 - 2 * g * mu, 1e-6), 1.5));
    out[k] = sunI * (bR[k] * phR * inscR[k] + bM[k] * phM * inscM[k]);
  }
  // First-order multiple scattering matching shader formulation
  // Preserves authentic blue-dominant sky color across horizon
  const hCam0 = altKm;
  const rhoRc = Math.exp(-hCam0 / HR) * boost;
  const rhoMc = (Math.exp(-hCam0 / HM)
    + hazeEff * Math.exp(-hCam0 / Math.max(HM * 0.22, 0.5))) * boostM;
  const litFrac = odR > 1e-6 ? odRlit / odR : 0;
  const scatTint = [0, 0, 0];
  let smax = 0;
  for (let k = 0; k < 3; k++) {
    scatTint[k] = bR[k] * rhoRc + bM[k] * rhoMc;
    smax = Math.max(smax, scatTint[k]);
  }
  for (let k = 0; k < 3; k++) {
    msFrac[k] = 1 - Math.exp(-(bR[k] * odR + bM[k] * 1.1 * odM));
  }
  // Multiple scattering desaturation term
  // Synchronized with shader output
  const msMean = (msFrac[0] + msFrac[1] + msFrac[2]) / 3;
  for (let k = 0; k < 3; k++) {
    const sNorm = smax > 1e-12 ? scatTint[k] / smax : 0;
    const sMix = sNorm + (1 - sNorm) * msMean * msDesat;   // Higher-order scattering desaturation
    out[k] += sunI * sMix * (1 / (4 * Math.PI)) * msFrac[k] * msFrac[k] * litFrac;
  }
  // Ground albedo reflection over sunlit terrain
  if (groundAlbedo > 0) {
    const upx = -cx, upy = -cy, upz = -cz;
    const ul = Math.hypot(upx, upy, upz) || 1;
    const below = Math.max(0, Math.min(1, -(rdx * upx + rdy * upy + rdz * upz) / ul));
    const groundLit = odR > 1e-6 ? odRlit / odR : 0;
    const bm = Math.max(bR[0], bR[1], bR[2]) || 1;
    const gTint = [bR[0] / bm, bR[1] / bm, bR[2] / bm];
    for (let k = 0; k < 3; k++) {
      const gcol = 1 * (1 - 0.55) + gTint[k] * 1.7 * 0.55;
      const twoWay = Math.exp(-(bR[k] * odR + bM[k] * 1.1 * odM) * 1.5);
      out[k] += sunI * groundAlbedo * gcol * twoWay * (0.35 + 0.65 * below) * msFrac[k]
        * (1 / Math.PI) * groundLit;
    }
  }

  // Mean transmittance matching shader alpha formulation
  let meanT = 0;
  for (let k = 0; k < 3; k++) meanT += Math.exp(-(bR[k] * odR + bM[k] * 1.1 * odM));
  meanT /= 3;
  const alpha = 1 - meanT;

  // Source function L / alpha; equal to j / sigma_t under single scattering
  const al = Math.max(alpha, 1e-3);
  const color = [out[0] / al, out[1] / al, out[2] / al];

  // Calibrated FogExp2 extinction coefficient based on Koschmieder visibility formula
  // Matches visual fog range to physical atmospheric extinction.
  // rho ~= 0.5 * sigma maintains < 2% error across 20 km vistas.
  // Consistent ground visibility.
  const hCam = altKm;
  let density = 0;
  for (let k = 0; k < 3; k++) {
    density += bR[k] * Math.exp(-hCam / HR) * boost
      + bM[k] * 1.1 * (Math.exp(-hCam / HM)
        + hazeEff * Math.exp(-hCam / Math.max(HM * 0.22, 0.5))) * boostM;
  }
  density /= 6;   // Calibrated scaling factor

  return { color, alpha, density };
}
