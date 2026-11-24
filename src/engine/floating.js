// Floating origin world manager: entity absolute coordinates stored in double precision (Float64Array, km).
// Each frame sets mesh.position to (absolutePos - cameraAbsolutePos). GPU only sees small relative coordinates,
// pairing with logarithmicDepthBuffer for jitter-free rendering from 10 cm to 10^10 km.

import * as THREE from 'three';

export class World {
  constructor() {
    this.entities = []; // { posKm: Float64Array(3), object3D }
  }

  register(posKm, object3D) {
    const e = { posKm, object3D };
    this.entities.push(e);
    return e;
  }

  /** cameraPosKm: Float64Array(3) absolute coordinates (camera/player) */
  update(cameraPosKm) {
    for (const e of this.entities) {
      e.object3D.position.set(
        e.posKm[0] - cameraPosKm[0],
        e.posKm[1] - cameraPosKm[1],
        e.posKm[2] - cameraPosKm[2]
      );
    }
  }
}

const _v = new THREE.Vector3();

/** Absolute coordinate distance -> km */
export function distKm(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Unit direction vector from absolute position a to b (Three.js Vector3, world axes) */
export function dirTo(a, b, out = _v) {
  out.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return out.normalize();
}
