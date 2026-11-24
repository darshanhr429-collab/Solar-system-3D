// Planetary rings: authentic inner/outer radii, radial texture sampling, lit/unlit transmission, planetary umbra shadow.

import * as THREE from 'three';

/** Untextured narrow rings (Uranus): generates 1D radial alpha texture from authentic radius/width/tau */
function makeNarrowRingTexture(innerKm, outerKm, narrow, diffuse = 0.03) {
  const W = 1024;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = 1;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, 1);
  for (let i = 0; i < W; i++) {
    const r = innerKm + (i / (W - 1)) * (outerKm - innerKm);
    let a = diffuse; // Diffuse dust baseline (Jupiter/Neptune rings much fainter than Uranus)
    for (const [rc, w, tau] of narrow) {
      const d = Math.abs(r - rc) / Math.max(w, 1);
      a += tau * Math.exp(-d * d * 2.8);
    }
    const v = Math.max(0, Math.min(255, Math.round(a * 255)));
    img.data[i * 4] = 200; img.data[i * 4 + 1] = 200; img.data[i * 4 + 2] = 205;
    img.data[i * 4 + 3] = v;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createRings(phys, ringTex) {
  const { innerKm, outerKm, opacity = 1, narrow } = phys.rings;
  // No texture but has narrow ring parameters -> procedural authentic ring structure texture
  if (!ringTex && narrow) ringTex = makeNarrowRingTexture(innerKm, outerKm, narrow, phys.rings.diffuse);
  const SEG = 256;

  // Custom ring geometry: uv.x = radial normalized coordinate
  const geo = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(innerKm * c, 0, innerKm * s, outerKm * c, 0, outerKm * s);
    uv.push(0, 0.5, 1, 0.5);
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);

  // Ring color tones: Saturn rings are warm yellowish-brown water ice + silicate dust (Cassini imagery);
  // Uranus rings are dark charcoal gray (covered in dark carbonaceous material)
  const tint = phys.rings.tint ?? [1, 1, 1];
  const uniforms = {
    uMap: { value: ringTex },
    uHasMap: { value: ringTex ? 1 : 0 },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uCenter: { value: new THREE.Vector3() }, // Planet center (camera relative)
    uPlanetR: { value: phys.radiusKm },
    // Ring self-shadowing marches radially within ring plane; requires inner/outer radii (km)
    uRingInner: { value: innerKm },
    uRingOuter: { value: outerKm },
    uSunI: { value: 1.0 },
    uOpacity: { value: opacity },
    uTint: { value: new THREE.Vector3(tint[0], tint[1], tint[2]) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    // Three.js r165 defaults to two passes (BackSide/FrontSide) for transparent + DoubleSide.
    // A single coplanar ring layer rendered twice squares transparency 1 - (1 - a)^2,
    // doubling effective optical depth and flattening ring contrast.
    forceSinglePass: true,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vPosW;
      varying vec3 vNormalW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vPosW = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap;
      uniform int uHasMap;
      uniform vec3 uSunDir;
      uniform vec3 uCenter;
      uniform float uPlanetR, uSunI, uOpacity;
      uniform float uRingInner, uRingOuter;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying vec3 vPosW;
      varying vec3 vNormalW;

      void main() {
        #include <logdepthbuf_fragment>
        vec4 tex = uHasMap == 1
          ? texture2D(uMap, vec2(vUv.x, 0.5))
          : vec4(0.55, 0.5, 0.45, 0.5);
        // -- Ring Photometry ---------------------------------------------------
        // Rings are a sparse sheet of particles; governed by Seeliger single-scattering law:
        //     I/F ∝ μ0/(μ0+μ) · P(α)
        // mu0 = sin(solar elevation), mu = sin(observer elevation), alpha = phase angle.
        //
        // Photometric behavior reproduces two key ring characteristics:
        // - Elevation dependence: oblique edge-on view (mu -> 0) foreshortens surface, appearing brighter;
        // - Opposition surge: coherent backscattering and shadow hiding as phase angle approaches zero
        //   (Cassini observed ~30% brightness surge between 1 deg and 0 deg phase).
        // Ring plane is double-sided; elevation angles take absolute value.
        // Ring normal is identical across disk.
        // Consistent illumination across both sunlit and unlit faces.
        // Evaluated continuously per fragment.
        vec3 nrm = normalize(vNormalW);
        vec3 toCam = -normalize(vPosW - cameraPosition);   // Fragment -> camera
        float mu0 = abs(dot(nrm, uSunDir));
        float mu = abs(dot(nrm, toCam));
        float seeliger = mu0 / max(mu0 + mu, 1e-4);
        float cosA = dot(toCam, uSunDir);                  // Cosine of phase angle
        float surge = 1.0 + 0.5 * exp(-(1.0 - cosA) * 25.0);   // Opposition surge: narrow peak ~+-8 deg
        float phase = 0.55 + 0.45 * cosA                       // Gentle backscattering baseline
                    + 0.9 * pow(max(-cosA, 0.0), 3.0);         // Forward scattering (Cassini backlit views)
        float lit = seeliger * phase * surge;
        // Planetary umbra shadow: fragment is shadowed if inside cylindrical shadow on anti-sunward side
        vec3 rel = vPosW - uCenter;
        float along = dot(rel, uSunDir);
        vec3 perp = rel - along * uSunDir;
        float shadow = 1.0;
        if (along < 0.0) {
          shadow = smoothstep(uPlanetR * 0.985, uPlanetR * 1.02, length(perp));
        }
        // Forward scattering integrated into phase function;
        // prevents redundant amplification on backlit side.
        // Factor 3.2 compensates baseline to maintain calibrated overall ring brightness.
        // Preserves relative physical contrast.
        // Correctly matches observed ring transmission profiles.
        // -- Ring Self-Shadowing: ring occults itself -------------------------
        // Particles in the ring have finite optical depth; points on the ring
        // are shadowed by ring material situated closer to the Sun.
        // Cassini captured distinct dark shadow bands cast by Ring B onto Ring A at equinox.
        //
        // Project solar direction onto ring plane, raymarch along vector accumulating optical depth,
        // scaled by 1/mu0 slant-path correction.
        // 10 radial steps provide smooth self-shadowing across large ring dimensions.
        vec3 sunInPlane = uSunDir - nrm * dot(uSunDir, nrm);
        float sunInPlaneLen = length(sunInPlane);
        if (sunInPlaneLen > 1e-4 && mu0 > 0.02) {
          vec3 mdir = sunInPlane / sunInPlaneLen;
          float rSpan = uRingOuter - uRingInner;
          float dstep = rSpan / 24.0;
          float tau = 0.0;
          for (int i = 1; i <= 10; i++) {
            vec3 q = vPosW + mdir * (float(i) * dstep);
            vec3 rq = q - uCenter;
            float rr = length(rq - nrm * dot(rq, nrm));   // Distance to rotation axis
            if (rr < uRingInner || rr > uRingOuter) continue;
            float uu = (rr - uRingInner) / max(rSpan, 1.0);
            tau += texture2D(uMap, vec2(uu, 0.5)).a * dstep;
          }
          // Dimensionless optical depth attenuation:
          // tau represents cumulative tau * delta_r normalized by ring span.
          // Slant path correction 1/mu0 clamped to avoid grazing divergence.
          // Independent of absolute planetary ring scale.
          tau /= max(rSpan, 1.0);
          // Clamped attenuation: ring shadowing modulates brightness by 20-40%
          // (matching Cassini measurements of Ring B shadow on Ring A)
          // without completely obliterating underlying ring structures.
          shadow *= 1.0 - 0.35 * (1.0 - exp(-tau * 1.2 / max(mu0, 0.06)));
        }
        vec3 col = tex.rgb * uTint * (lit * shadow * uSunI * 3.2 + 0.002);
        gl_FragColor = vec4(col, tex.a * uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  mat.userData.uniforms = uniforms;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 50;
  return mesh;
}
