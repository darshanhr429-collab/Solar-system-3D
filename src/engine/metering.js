// Evaluative scene metering (camera light metering). Disabled by default (?meter=1 toggle):
// Switches distance-based exposure to content-based scene luminance.
//
// Samples on-screen luminance to balance high dynamic range across celestial encounters.
// Balances exposure across planetary closeups and deep space.
// Mimics biological ocular adaptation.
//
// Method: render HDR output to 1x1 target with 16-point logarithmic average
// (log-domain geometric mean avoids highlight skew).
// Low-frequency sampling (150ms) amortizes readback stalls.
import * as THREE from 'three';

const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  varying vec2 vUv;
  void main() {
    float acc = 0.0, wsum = 0.0;
    for (int y = 0; y < 4; y++) {
      for (int x = 0; x < 4; x++) {
        // Sample central 60% of viewport (center-weighted evaluative metering)
        vec2 uv = 0.2 + (vec2(float(x), float(y)) + 0.5) / 4.0 * 0.6;
        vec3 c = texture2D(uTex, uv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // Discard deep black background to prevent overexposing foreground bodies
        // Evaluative metering rejects vast dark space.
        float w = smoothstep(2e-4, 4e-3, l);
        acc += log2(max(l, 1e-6)) * w;
        wsum += w;
      }
    }
    // Deep space frame (pure black): fall back to solar distance exposure law
    if (wsum < 1e-3) { gl_FragColor = vec4(0.0); return; }
    gl_FragColor = vec4(acc / wsum, 0.0, 0.0, 1.0);
  }
`;

export function createMetering(renderer) {
  let rt;
  try {
    rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    });
  } catch { return null; }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const buf = new Float32Array(4);
  let ok = true;
  return {
    /** Returns log2(scene average luminance); returns null on failure */
    sample(srcTex) {
      if (!ok || !srcTex) return null;
      try {
        mat.uniforms.uTex.value = srcTex;
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, buf);
        renderer.setRenderTarget(prev);
        const v = buf[0];
        if (!Number.isFinite(v)) { ok = false; return null; }
        return v;
      } catch { ok = false; return null; }
    },
  };
}
