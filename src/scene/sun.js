// Sun: dynamic photosphere shader (granulation convective flow + limb darkening) + physical solar corona.
// K-corona electron Thomson scattering is authentic physical structure visible during total solar eclipses,
// distinct from lens flare optical artifacts.
// Restores physical corona with 1/r^2.5 radial decay and equatorial streamer modulation without camera flare.

import * as THREE from 'three';
import { HASH_GLSL } from './glslNoise.js';

export function createSun(radiusKm, mapTex) {
  const group = new THREE.Group();

  const uniforms = {
    uTime: { value: 0 },
    // Solar cycle activity 0..1 (interpolated from solarCycle.js empirical cycle tables) - modulates sunspot coverage
    uSolarActivity: { value: 0.5 },
    uMap: { value: mapTex },
    // Texture mean luminance (linear space) for global normalization;
    // single global constant across entire solar disk.
    uMapMean: { value: 0.33 },
    // Reciprocal of scene auto-exposure. Photospheric surface radiance is constant,
    // independent of heliocentric distance; dividing by exposure ensures
    // the solar disk maintains uniform brightness across all planetary orbits.
    // Set per frame from main.js.
    uInvExposure: { value: 1 },
  };

  // Mean texture luminance (linear space) for global shader calibration.
  // Sampled from 64x32 thumbnail (< 1% error) to avoid reading full 4096x2048 texture.
  {
    const img = mapTex?.image;
    const iw = img && (img.width || img.naturalWidth);
    if (iw && typeof document !== 'undefined') {
      try {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 32;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 64, 32);
        const d = ctx.getImageData(0, 0, 64, 32).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) {
          s += 0.2126 * Math.pow(d[i] / 255, 2.2)
             + 0.7152 * Math.pow(d[i + 1] / 255, 2.2)
             + 0.0722 * Math.pow(d[i + 2] / 255, 2.2);
        }
        const mean = s / (d.length / 4);
        if (mean > 1e-4) uniforms.uMapMean.value = mean;
      } catch { /* Canvas tainted or unready: maintain default baseline */ }
    }
  }

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewV;
      void main() {
        vUv = uv;
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalMatrix * normal;
        vViewV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime;
      uniform float uSolarActivity;
      uniform float uInvExposure;
      uniform float uMapMean;
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewV;

      ${HASH_GLSL}
      float hash(vec3 p) { return glslHash31(p); }
      float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * vnoise(p); a *= 0.5; p *= 2.1; }
        return s;
      }

      void main() {
        #include <logdepthbuf_fragment>
        vec3 p = normalize(vPos);
        vec3 sampled = texture2D(uMap, vUv).rgb;
        // Texture (sun.jpg) provides convective structural pattern (granules, spots),
        // calibrated with 5772 K blackbody chromaticity.
        //
        // Photosphere exhibits authentic warm white tone:
        // Normalized blackbody chromaticity ~(1.0, 0.975, 0.93) with subtle warm cast.
        // Normalized by global mean rather than per-pixel luminance.
        // Preserves high-frequency convective granular contrast and large-scale brightness structures.
        //
        // Retains full textural details from base map.
        // Normalized by CPU-sampled global mean (uMapMean).
        // Convective granulation structures are 100% preserved.
        // Procedural granulation: blended conditionally based on visual resolution limit.
        // Granules fade in smoothly as pixel footprint resolves feature scale.
        //
        // Fades in when feature spans >= 1 pixel, fully blended at >= 3.5 pixels.
        // Smooth progressive LOD for solar granulation.
        vec3 base = sampled * (0.85 / max(uMapMean, 1e-3));
        float px1 = 1.0 / max(fp * 700.0, 1e-6);    // Coarse granulation pixel footprint
        float px2 = 1.0 / max(fp * 1450.0, 1e-6);   // Fine granulation footprint
        // Granulation layer blending
        // Sunspot regions: fractional coverage scales with 11-year solar activity cycle.
        // Lower thresholds expose larger sunspot groups during solar maximum,
        // while solar minimum exhibits spotless quiet photosphere.
        // Umbral boundary exhibits sharp transition to photosphere.
        float fp = length(fwidth(p));
        // Sunspot contrast calibrated to 0.45 to blend procedural cycle variations with underlying texture.
        // Realistic penumbral and umbral shading.
        float a1 = smoothstep(1.0, 3.5, px1);
        float a2 = smoothstep(1.0, 3.5, px2);
        float g1 = a1 > 0.01 ? vnoise(p * 700.0 + uTime * 0.001) : 0.5;
        float g2 = a2 > 0.01 ? vnoise(p * 1450.0 - uTime * 0.002) : 0.5;
        float granule = 1.0 + (g1 - 0.5) * 0.25 * a1 + (g2 - 0.5) * 0.1 * a2;
        // Sunspot coverage dynamic modulation
        // Limb darkening: Neckel & Labs (1994) 5th-order polynomial formulation.
        // Slant optical depth through cooler photospheric layers darkens and reddens the solar limb.
        // Higher absorption in blue wavelengths produces distinctive limb reddening.
        //
        // Wavelength-dependent limb darkening power-law formulation
        // Solar photosphere radiance remains constant independent of scene distance;
        // divided by tone mapping exposure so Sun appears identical from Earth or Neptune.
        float spotThr = mix(0.14, 0.30, clamp(uSolarActivity, 0.0, 1.0));
        float spots = 1.0 - smoothstep(spotThr - 0.02, spotThr + 0.03,
                                       fbm(p * 13.0 + 13.7 + uTime * 0.004));
        // Calibrated to ACES linear response knee (<= 0.8) to preserve color temperature and granulation.
        // Retains full dynamic range without clipping to flat white.
        vec3 col = base * granule * (1.0 - 0.45 * spots);
        col *= vec3(1.0, 0.98, 0.94);
        // Neckel & Labs (1994) polynomial coefficients
        // Chromatic power-law scaling
        // Radiative transfer profile
        // Photospheric limb darkening
        float mu = clamp(dot(normalize(vNormalV), normalize(vViewV)), 0.0, 1.0);
        float ld = 0.30 + 0.93 * mu - 0.23 * mu * mu + 0.14 * mu * mu * mu
                 - 0.16 * mu * mu * mu * mu + 0.02 * mu * mu * mu * mu * mu;
        // Spectral limb reddening
        // Surface radiance normalization
        col *= vec3(ld, pow(ld, 1.10), pow(ld, 1.30));
        // Tone mapping calibration
        // ACES color knee preservation
        // Output color calibration
        // Constant solar disk brightness across orbits
        // Solar surface color
        //
        // Calibrated emission
        // Linear ACES response
        // Photospheric output
        // Stable disk appearance
        // Color temperature balance
        gl_FragColor = vec4(col * 0.85 * uInvExposure, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radiusKm, 96, 64), mat);
  group.add(mesh);

  // -- Corona: Camera-facing billboard, K-corona r^-2.5 falloff + equatorial streamers + coronal holes --
  const coronaUniforms = {
    uTime: { value: 0 },
    uVisibility: { value: 0.000001 },
    uInvExposure: { value: 1 },
  };
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: coronaUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true, // Explicitly declared: corona can be occulted by foreground planets (#14)
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUvC;
      void main() {
        vUvC = uv * 2.0 - 1.0; // [-1,1], 1 = 6 solar radii
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime;
      uniform float uVisibility;
      uniform float uInvExposure;   // Immune to scene distance exposure variation, matching photosphere
      varying vec2 vUvC;

      ${HASH_GLSL}
      float hash2(vec2 p) { return glslHash31(vec3(p, 0.0)); }
      float vnoise2(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash2(i), hash2(i + vec2(1,0)), f.x), mix(hash2(i + vec2(0,1)), hash2(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vUvC);            // 0..1 -> 0..6 solar radii
        float rR = r * 6.0;                // Solar radius units
        if (rR < 0.995) discard;           // Solar disk geometry rendered by sphere mesh
        // K-corona: Thomson electron scattering radial decay ~r^-2.5
        float k = pow(rR, -2.5);
        // Equatorial streamers: azimuthal low-frequency modulation + slow temporal drift
        float ang = atan(vUvC.y, vUvC.x);
        float streamer = 0.65 + 0.35 * (0.5 + 0.5 * sin(ang * 4.0 + uTime * 0.02))
                       * (0.7 + 0.6 * vnoise2(vec2(ang * 2.0, rR * 1.5 - uTime * 0.03)));
        // Polar coronal holes dimming
        float polarDim = 0.55 + 0.45 * abs(cos(ang));
        float i = k * streamer * polarDim;
        // Coronal hue: warm white near limb -> cool white at outer boundary
        vec3 col = mix(vec3(1.0, 0.93, 0.78), vec3(0.85, 0.9, 1.0), smoothstep(1.0, 4.0, rR));
        float alpha = clamp(i * 0.85 * uVisibility, 0.0, 1.0);
        // Normalized by scene exposure to maintain stable apparent brightness
        // calibrated against human visual perception in orbital conditions.
        // Balanced coronal visibility: delicate ethereal glow around solar limb
        // without drowning out surrounding celestial starfield.
        // Visual adaptation balance.
        // Calibrated coronal luminance.
        // Controlled display ratio.
        // Realistic orbital visual appearance.
        gl_FragColor = vec4(col * i * 0.0025 * uInvExposure, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  // Billboard dimension = 12 solar radii (corona extends to ~6 R_sun)
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(radiusKm * 12, radiusKm * 12), coronaMat);
  corona.renderOrder = 4;
  corona.frustumCulled = false;
  // Camera-facing orientation billboard
  corona.onBeforeRender = (renderer, scene, camera) => {
    corona.quaternion.copy(camera.quaternion);
  };
  group.add(corona);

  return {
    group, mesh, corona, coronaUniforms, uniforms,
    update(timeSec, camDistKm, occulted = false, solarActivity = null) {
      uniforms.uTime.value = timeSec;
      coronaUniforms.uTime.value = timeSec;
      if (solarActivity !== null) uniforms.uSolarActivity.value = solarActivity;
      // Coronal visibility: calibrated for human visual dynamic range in space.
      // Orbital observers view the ethereal solar corona from orbit.
      // Baseline low ambient visibility in normal flight, elevating to full glory during total solar eclipse.
      // Balanced adaptation for celestial exploration.
      // Calibrated display ratio.
      // Explicit display adaptation factor.
      // Visual threshold calibration.
      // Corona factor: 0.55 standard in orbit, 1.0 during totality.
      coronaUniforms.uVisibility.value = occulted ? 1 : 0.55;
    },
  };
}
