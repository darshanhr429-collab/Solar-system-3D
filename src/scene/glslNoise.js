// Shared GLSL noise primitives.
//
// Motivation: previously duplicated across 4 scene files (planetMaterial, atmosphere,
// terrain, sun).
// In addition, sin-based hash degrades on mediump GPUs where arguments lose precision,
//
// deteriorating into repeating patterns on mobile GPUs.
// Replaced with Dave Hoskins integer-style non-sin hash;
// fract/dot is significantly more stable in mediump.

export const HASH_GLSL = /* glsl */ `
  // Deterministic 3D point -> [0,1) hash. Non-sin, stable under mediump.
  float glslHash31(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`;
