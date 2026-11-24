// Camera feeling: restores weight and physical momentum to the viewport.
//
// Without physical feedback, movements feel weightless: landing feels like texture switching,
// running feels like ice skating, acceleration feels like a number change.
// Natural physical cues include:
//   - Head bobbing with stride (2x stride frequency, impact on each footstep)
//   - Landing shock absorption with quick compression and subtle vibration
//   - Subtle FOV expansion during acceleration and contraction during deceleration
//   - High-frequency micro-jitter at extreme velocities
//
// Magnitudes are kept subtle (arcseconds to arcminutes) to prevent motion sickness
// and maintain floating origin precision and landing detection accuracy.
import * as THREE from 'three';
import { prefersReducedMotion } from '../config.js';

const DEG = Math.PI / 180;

/** State of a single impact: amplitude (radians) and frequency (Hz) */
function makeImpulse() { return { amp: 0, freq: 26, phase: 0 }; }

export function createCameraFeel() {
  const impulse = makeImpulse();
  let bobPhase = 0;          // Stride phase (radians), advanced by distance traveled
  let bobAmp = 0;            // Current bob amplitude (smoothly interpolated)
  let fovBias = 0;           // Offset relative to base FOV (degrees)
  let time = 0;

  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');

  // Deterministic noise phases for jitter to prevent per-frame random() flickering
  const n = (t, k) => Math.sin(t * 1.7 + k) * 0.6 + Math.sin(t * 3.1 + k * 2.3) * 0.4;

  return {
    /** Trigger impact shock. Strength in radians, 0.01 rad ~= 0.57 deg (landing scale) */
    impulse(strength, freq = 26) {
      if (strength > impulse.amp) { impulse.amp = strength; impulse.freq = freq; }
    },

    /**
     * @param {number} dt Real-time delta step (seconds)
     * @param {object} s  { mode, speedKmS, walkSpeedMS, walking, altGroundKm, boosting }
     * @returns {{ quaternion, fovBiasDeg }} Camera orientation and FOV offsets
     */
    update(dt, s) {
      // Reduced motion: zero out head bob, impact jitter, and dynamic FOV
      // to avoid vestibular discomfort for sensitive users.
      if (prefersReducedMotion()) {
        impulse.amp = 0; bobAmp = 0; fovBias = 0;
        q.identity();
        return { quaternion: q, fovBiasDeg: 0 };
      }
      time += dt;
      const mode = s.mode ?? 'orbit';

      // -- Head Bobbing --
      // Head bobs vertically with footsteps: frequency is 2x stride rate, amplitude ~0.25 deg.
      // Phase advances with distance traveled, naturally adapting to movement speed.
      const wantBob = (mode === 'walk' && s.walking && !s.submerged) ? 1 : 0;
      bobAmp += (wantBob - bobAmp) * Math.min(dt * 6, 1);
      // Stride frequency is synchronized with footstep audio timing.
      // Both camera feel and audio.js (_stepInterval) share identical cadence formulas.
      const fStep = 1.2 + Math.min(s.walkSpeedMS / 9, 1) * 1.3;    // Hz
      if (mode === 'walk' && s.walkSpeedMS > 0.05) {
        bobPhase += fStep * Math.PI * 2 * dt;
      }
      // Each step produces vertical pitch; lateral sway completes full cycle every two steps
      const bobPitch = Math.sin(bobPhase) * 0.0044 * bobAmp;        // ≈0.25°
      const bobRoll = Math.sin(bobPhase * 0.5) * 0.0031 * bobAmp;   // ≈0.18°

      // -- Impact Damping --
      // Exponential decay with falling frequency, mimicking spring stabilization.
      let shakePitch = 0, shakeRoll = 0, shakeYaw = 0;
      if (impulse.amp > 1e-5) {
        const t = time * impulse.freq;
        shakePitch = n(t, 0.0) * impulse.amp;
        shakeYaw = n(t, 2.1) * impulse.amp * 0.7;
        shakeRoll = n(t, 4.3) * impulse.amp * 0.5;
        impulse.amp *= Math.exp(-dt * 5.5);
      } else impulse.amp = 0;

      // -- High-speed Micro-jitter --
      // Active only in flight mode; referenced to 10 km/s, capped at 0.12 deg,
      // scaling with square root of velocity (imperceptible at low cruising speeds).
      let hiPitch = 0, hiRoll = 0;
      if (mode === 'fly') {
        const v = Math.max(0, s.speedKmS ?? 0);
        const a = Math.min(0.0021, Math.sqrt(v / 10) * 0.0004);
        if (a > 1e-6) {
          const t = time * 34;
          hiPitch = n(t, 1.3) * a;
          hiRoll = n(t, 5.7) * a * 0.8;
        }
      }

      e.set(
        bobPitch + shakePitch + hiPitch,
        shakeYaw,
        bobRoll + shakeRoll + hiRoll,
      );
      q.setFromEuler(e);

      // -- Dynamic FOV --
      // Brief FOV contraction on impact; subtle expansion during flight acceleration.
      const target = impulse.amp > 0 ? -impulse.amp * 220 : 0;
      const boostTarget = (mode === 'fly' && s.boosting) ? 3.5 : 0;
      fovBias += ((target + boostTarget) - fovBias) * Math.min(dt * (impulse.amp > 0 ? 22 : 4), 1);

      return { quaternion: q, fovBiasDeg: fovBias };
    },

    /** Current jitter amplitude (radians) - for diagnostics and regression assertions */
    get amplitude() { return impulse.amp; },
  };
}
