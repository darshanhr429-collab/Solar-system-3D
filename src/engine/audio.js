// Ambient audio engine: purely procedural synthesis (Web Audio API), no external audio files.
// Design goal: immersive without being intrusive - subtle volumes, muted by default, explicit user opt-in.
// Audio graph:
//   [vacuum hiss]  ─┐
//   [atmo wind]    ─┤
//   [footstep]     ─┤→ bus(gain) → underwaterFilter(lowpass) → master(gain) → destination
//   [bubble]       ─┘
// underwaterFilter is always in series on the main bus: 20kHz cutoff when above water (transparent),
// drops to ~450Hz when submerged, applying muffled acoustics to all sounds.

// -- Footstep Surface Configurations -----------------------------------------
// Each surface uses distinct filter types, frequencies, and envelopes:
//   rock  - Moon / asteroid: crisp fracturing, mid-high bandpass + short decay
//   sand  - Mars / Titan: granular friction, low bandpass + longer decay
//   dirt  - Earth soil: dull thud, lowpass + soft envelope
//   ice   - Ice surface: glassy splintering, highpass + ultra-short decay
const FOOTSTEP_PROFILES = {
  rock:  { filter: 'bandpass', freq: 1800, q: 1.5, gain: 0.13, dur: 0.12, freqJitter: 400 },
  sand:  { filter: 'bandpass', freq: 600,  q: 0.8, gain: 0.12, dur: 0.18, freqJitter: 200 },
  dirt:  { filter: 'lowpass',  freq: 900,  q: 1.2, gain: 0.14, dur: 0.12, freqJitter: 0   },
  ice:   { filter: 'highpass', freq: 3000, q: 0.7, gain: 0.10, dur: 0.08, freqJitter: 0   },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;

    // User controls: muted by default, requires explicit user interaction (browser autoplay policy)
    this._enabled = false;
    this._volume = 0.6;           // Master volume 0-1
    this._vacuumEnabled = false;  // Cosmic radio hiss toggle (disabled by default)

    // Current mode and environment (configured via setMode)
    this._mode = 'fly';
    this._env = { nearest: null, inAtmosphere: false, underwater: false, surface: 'rock' };

    // Per-frame dynamic state (configured via update, typically from Ship.audioState)
    this._state = { speed: 0, walking: false, submerged: false, surfaceType: 'rock' };

    // -- Main Bus Nodes (created on init) --
    this._bus = null;              // Main bus GainNode: all audio layers converge here
    this._underwaterFilter = null; // BiquadFilterNode: lowpass muffling when submerged
    this._master = null;           // GainNode: final output volume + master switch

    // -- Noise Buffers (pre-generated on init, looped) --
    this._whiteBuf = null;  // White noise (radio hiss / footstep pulse)
    this._pinkBuf = null;   // Pink noise (atmospheric wind, natural -3dB/oct)

    // -- Continuous Layers (created on init, gain-controlled) --
    this._vacuum = null;    // { source, filter, gain } Space radio hiss
    this._atmo = null;      // { source, filter, gain } Atmospheric entry wind
    this._engine = null;    // { source, filter, gain } Engine / thruster rumble
    this._reentry = null;   // { source, filter, gain } Atmospheric reentry broadband roar

    // -- Timers --
    this._stepTimer = 0;    // Footstep accumulator
    this._stepInterval = 0.5;
    this._bubbleTimer = 0;  // Submerged bubble accumulator
  }

  get enabled() { return this._enabled; }

  get vacuumEnabled() { return this._vacuumEnabled; }

  /**
   * Lazily create AudioContext on first user interaction (browser autoplay compliance).
   * Must be called in user gesture callback (click/touch/keydown) to prevent context suspension.
   * Builds complete audio graph and pre-generates noise buffers.
   */
  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // Web Audio API unavailable (legacy browser) -> silent fallback

    this.ctx = new Ctx();

    // Main bus: bus -> underwaterFilter -> master -> destination
    this._bus = this.ctx.createGain();
    this._bus.gain.value = 1;
    // Stereo panner bus: engine/thruster cockpit rumble pans laterally with roll.
    // Adds spatial acoustic depth beyond mono playback.
    // Full HRTF/Doppler would require 3D spatial sources; lateral pan covers primary cabin cue.
    this._stereo = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (this._stereo) { this._bus.connect(this._stereo); }

    this._underwaterFilter = this.ctx.createBiquadFilter();
    this._underwaterFilter.type = 'lowpass';
    this._underwaterFilter.frequency.value = 20000; // Transparent when above water
    this._underwaterFilter.Q.value = 0.5;

    this._master = this.ctx.createGain();
    this._master.gain.value = 0; // Muted by default, fades in when setEnabled

    (this._stereo ?? this._bus).connect(this._underwaterFilter);
    this._underwaterFilter.connect(this._master);
    this._master.connect(this.ctx.destination);

    // Pre-generate noise buffers (2-second loop, avoids perceptible repeating seams)
    this._whiteBuf = this._makeNoiseBuffer('white');
    this._pinkBuf = this._makeNoiseBuffer('pink');

    // Continuous sound layers: start immediately, volume controlled via gain (avoids alloc churn)
    // Cosmic radio hiss: white noise + lowpass filter (ambient cosmic radio background)
    this._vacuum = this._createNoiseLayer(this._whiteBuf, 'lowpass', 600, 0);
    this._vacuum.gain.connect(this._bus);

    // Atmospheric entry wind: pink noise + bandpass filter (wind shear friction)
    this._atmo = this._createNoiseLayer(this._pinkBuf, 'bandpass', 500, 0);
    this._atmo.gain.connect(this._bus);

    // Engine / thrusters: low-frequency hull-conducted rumble.
    // Sound does not travel through vacuum, but hull structural vibrations are audible inside cockpit.
    // Treated as internal cabin acoustic conduction.
    this._engine = this._createNoiseLayer(this._pinkBuf, 'lowpass', 90, 0);
    this._engine.gain.connect(this._bus);

    // Atmospheric reentry: broadband roar at high atmospheric velocity (shockwave plasma sheath)
    this._reentry = this._createNoiseLayer(this._whiteBuf, 'bandpass', 620, 0);
    this._reentry.gain.connect(this._bus);
  }

  /**
   * Generate noise buffers.
   * white - uniform white noise (radio hiss, footstep impulse)
   * pink  - Paul Kellet algorithm pink noise (-3dB/octave, natural wind friction)
   */
  _makeNoiseBuffer(type) {
    const sr = this.ctx.sampleRate;
    const len = sr * 2; // 2 seconds
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else {
      // Paul Kellet refined pink noise filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  /**
   * Create continuous looping noise layer: BufferSource(loop) -> BiquadFilter -> Gain
   * Returns { source, filter, gain }; gain initialized to 0 (silent), modulated in update.
   */
  _createNoiseLayer(buffer, filterType, freq, gainVal) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.value = gainVal;
    src.connect(filter);
    filter.connect(g);
    src.start();
    return { source: src, filter, gain: g };
  }

  /**
   * Set current mode and environment.
   * @param mode 'orbit' | 'fly' | 'walk'
   * @param env  { nearest, inAtmosphere, underwater, surface }
   *   - nearest: nearest body { id, radiusKm, distSurface, ... }
   *   - inAtmosphere: whether inside atmosphere
   *   - underwater: whether submerged (walking dive mode)
   *   - surface: surface type 'rock'|'sand'|'dirt'|'ice'
   */
  setMode(mode, env) {
    this._mode = mode || 'fly';
    if (env) {
      this._env = {
        nearest: env.nearest || null,
        inAtmosphere: !!env.inAtmosphere,
        underwater: !!env.underwater,
        surface: env.surface || 'rock',
      };
    }
  }

  /**
   * Per-frame update: modulates volume and filtering parameters across sound layers.
   * @param dt    Frame delta time (seconds)
   * @param state { speed, walking, submerged, surfaceType }
   *   - speed: movement speed (km/s, walking or ship velocity)
   *   - walking: whether currently walking (movement input active)
   *   - submerged: whether submerged
   *   - surfaceType: current ground surface type
   */
  update(dt, state) {
    if (!this.ctx || !this._enabled) return;
    if (state) Object.assign(this._state, state);

    const now = this.ctx.currentTime;
    const submerged = this._state.submerged || this._env.underwater;

    // -- Submerged Lowpass Filter: applies across all audio layers --
    // Transparent 20kHz cutoff above water; drops to 450Hz submerged
    // to simulate acoustic attenuation underwater.
    const targetCutoff = submerged ? 450 : 20000;
    this._underwaterFilter.frequency.setTargetAtTime(targetCutoff, now, 0.15);

    // -- Cosmic Radio Hiss (fly/orbit + vacuum + user enabled) --
    // Very faint (0.03), non-intrusive; disabled by default, enabled via setVacuum(true)
    const inVacuum = (this._mode === 'fly' || this._mode === 'orbit')
      && !this._env.inAtmosphere && !submerged;
    const vacuumTarget = (inVacuum && this._vacuumEnabled) ? 0.03 : 0;
    this._vacuum.gain.gain.setTargetAtTime(vacuumTarget, now, 0.3);

    // -- Atmospheric Entry Wind (fly/orbit + within atmosphere) --
    // Volume scales with atmospheric density (closer to surface); frequency shifts with speed
    let atmoTarget = 0;
    if ((this._mode === 'fly' || this._mode === 'orbit')
      && this._env.inAtmosphere && !submerged) {
      const n = this._env.nearest;
      if (n) {
        // Density proxy: denser closer to surface (0 = top of atmosphere, 1 = surface)
        const altFactor = Math.max(0, 1 - n.distSurface / Math.max(n.radiusKm * 0.3, 0.001));
        atmoTarget = 0.03 + altFactor * 0.07; // 0.03-0.10
      } else {
        atmoTarget = 0.04;
      }
      // Bandpass center frequency shifts upward with velocity (high-speed friction pitch)
      const speedFreq = 400 + Math.min(this._state.speed * 50, 800);
      this._atmo.filter.frequency.setTargetAtTime(speedFreq, now, 0.2);
    }
    this._atmo.gain.gain.setTargetAtTime(atmoTarget, now, 0.15);

    // -- Engine / Thrusters (fly + cockpit interior) --
    // Gain scales logarithmically with speed: subtle at low speed, steady background hum at cruise.
    let engineTarget = 0;
    if (this._mode === 'fly' && !submerged) {
      const vKmS = Math.max(0, this._state.speed ?? 0);
      const vNorm = Math.min(1, Math.log10(1 + vKmS * 1000) / 4);  // 1 m/s -> 0, 10 km/s -> 1
      engineTarget = 0.015 + vNorm * 0.055;
      this._engine.filter.frequency.setTargetAtTime(70 + vNorm * 130, now, 0.25);
    }
    this._engine.gain.gain.setTargetAtTime(engineTarget, now, 0.12);

    // -- Atmospheric Reentry Roar (in atmosphere + high velocity) --
    // Intensity proportional to atmospheric density * velocity^2 (dynamic pressure q = 0.5 * rho * v^2).
    let reentryTarget = 0;
    if (this._env.inAtmosphere && !submerged && this._mode !== 'walk') {
      const n = this._env.nearest;
      const dens = n ? Math.max(0, Math.min(1, 1 - n.distSurface / Math.max(n.radiusKm * 0.3, 0.001))) : 0;
      const vFrac = Math.min(1, Math.max(0, (this._state.speed ?? 0) / 8));  // 8 km/s ~= LEO orbital velocity
      reentryTarget = dens * vFrac * vFrac * 0.22;
      this._reentry.filter.frequency.setTargetAtTime(420 + vFrac * 900, now, 0.3);
    }
    this._reentry.gain.gain.setTargetAtTime(reentryTarget, now, 0.2);

    // -- Footsteps (walk + moving + above water) --
    if (this._mode === 'walk' && this._state.walking && !submerged) {
      this._stepTimer += dt;
      // Cadence scales with movement speed: walking ~1.2 Hz, sprinting ~2.5 Hz
      const speedNorm = Math.min(this._state.speed / 0.009, 1);
      this._stepInterval = 1 / (1.2 + speedNorm * 1.3);
      if (this._stepTimer >= this._stepInterval) {
        this._stepTimer = 0;
        this._playFootstep(this._state.surfaceType);
      }
    } else {
      this._stepTimer = 0;
    }

    // -- Bubbles (random short pulses when submerged) --
    if (submerged) {
      this._bubbleTimer += dt;
      const bubbleInterval = 0.8 + Math.random() * 1.5; // 0.8-2.3s random interval
      if (this._bubbleTimer >= bubbleInterval) {
        this._bubbleTimer = 0;
        this._playBubble();
      }
    } else {
      this._bubbleTimer = 0;
    }
  }

  /**
   * Play single footstep: short noise impulse + surface-specific filtering.
   * Randomizes frequency and playback rate slightly per step to prevent mechanical repetition.
   */
  _playFootstep(surfaceType) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const profile = FOOTSTEP_PROFILES[surfaceType] || FOOTSTEP_PROFILES.rock;

    // Noise impulse source: slice from white noise buffer
    const src = this.ctx.createBufferSource();
    src.buffer = this._whiteBuf;
    src.loop = false;
    src.playbackRate.value = 0.8 + Math.random() * 0.4; // Pitch variation for natural cadence

    const filter = this.ctx.createBiquadFilter();
    filter.type = profile.filter;
    filter.frequency.value = profile.freq + (Math.random() * 2 - 1) * profile.freqJitter;
    filter.Q.value = profile.q;

    const g = this.ctx.createGain();
    const dur = profile.dur;
    // Simplified ADSR: rapid attack + exponential decay
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(profile.gain, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(this._bus);

    // Play slice from random offset in noise buffer with dur * 1.5 length
    src.start(now, Math.random() * 1.5, dur * 1.5);
    src.stop(now + dur * 1.5);
  }

  /**
   * Play single bubble sound: upward sine wave frequency sweep + brief envelope.
   * Simulates rising air bubble acoustics underwater.
   */
  /**
   * Landing shock: lowpass filtered broadband noise with rapid decay envelope.
   * Intensity scales with impact velocity; synchronized with cameraFeel.impulse.
   */
  playLandingImpact(strength = 0.5) {
    if (!this.ctx || !this._enabled) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._whiteBuf;
    src.loop = false;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180 + strength * 220;
    filter.Q.value = 0.9;
    const g = ctx.createGain();
    const peak = Math.min(0.5, 0.12 + strength * 0.38);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    src.connect(filter); filter.connect(g); g.connect(this._bus);
    src.start(now);
    src.stop(now + 0.36);
  }

  _playBubble() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const startFreq = 200 + Math.random() * 400;
    const endFreq = startFreq + 200 + Math.random() * 300;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

    const g = this.ctx.createGain();
    const peak = 0.035 + Math.random() * 0.035; // Subtle low volume
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(g);
    g.connect(this._bus);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Master audio switch. Lazily initializes AudioContext on first activation (must be user gesture).
   * Resumes suspended audio context (mobile browser tabs auto-suspend audio).
   */
  setEnabled(on) {
    this._enabled = !!on;
    if (this._enabled) {
      if (!this.ctx) this.init();
      if (!this.ctx) return; // Web Audio unavailable
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const target = this._enabled ? this._volume : 0;
    // 50ms smooth fade to prevent clicks/pops
    this._master.gain.setTargetAtTime(target, now, 0.05);
  }

  /** Stereo pan offset (-1 left ... +1 right). Enhances engine roll perception.
   *  Silently falls back to mono if StereoPanner is unsupported. */
  setPan(v) {
    if (!this._stereo) return;
    this._stereo.pan.setTargetAtTime(
      Math.max(-1, Math.min(1, v)), this.ctx.currentTime, 0.08);
  }

  /** Master volume 0-1 */
  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this._enabled) {
      this._master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Independent cosmic radio hiss toggle.
   * Remains off by default even when audio is enabled, allowing users
   * to opt into ambient space hiss if desired.
   */
  setVacuum(on) {
    this._vacuumEnabled = !!on;
  }

  /** Toggle master audio switch, returns new state */
  toggle() {
    this.setEnabled(!this._enabled);
    return this._enabled;
  }
}
