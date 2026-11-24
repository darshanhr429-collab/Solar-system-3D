// Speech narration system: reads tour narration text via Web Speech API (speechSynthesis).
//
// Design principles:
// - Native browser API, zero dependencies; graceful fallback to text.
// - Multilingual voice selection via BCP-47 tags.
// - Mobile compatibility: iOS Safari requires first speak() inside user gesture;
//   Chrome mobile loads voices asynchronously via voiceschanged event.
// - Configurable rate (0.1-10), default 1.0; 0.9 recommended for tours.

import { LANG } from './i18n.js';

/** Project language code -> BCP-47 voice tag */
const LANG_TO_BCP47 = {
  zh: 'zh-CN',
  en: 'en-US',
  es: 'es-ES',
  ja: 'ja-JP',
  fr: 'fr-FR',
  de: 'de-DE',
  ru: 'ru-RU',
};

/**
 * Speech narration player: wraps speechSynthesis with speak/stop/pause/resume controls.
 *
 * Usage:
 *   const narrator = new Narrator();
 *   if (narrator.supported) narrator.speak('Hello world', 'en');
 *
 * Mobile note: First speak() must be triggered within user gesture event chain
 * on iOS Safari.
 */
export class Narrator {
  constructor() {
    // Node/SSR environment: graceful fallback when window is undefined
    this._synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this._utteranceCtor = typeof SpeechSynthesisUtterance !== 'undefined' ? SpeechSynthesisUtterance : null;
    this._voices = [];
    this._rate = 1;
    this._volume = 1;
    this._pitch = 1;
    this._currentUtterance = null;
    this._paused = false;

    if (this._synth) {
      this._loadVoices();
      // Chrome / Edge async voice loading: first getVoices() returns empty,
      // listen for voiceschanged event to populate list.
      this._synth.onvoiceschanged = () => this._loadVoices();
    }
  }

  /** Whether browser supports Web Speech API. */
  get supported() {
    return !!this._synth && !!this._utteranceCtor;
  }

  /** Whether narration is playing. */
  get speaking() {
    return this._synth ? this._synth.speaking && !this._synth.paused : false;
  }

  /** Whether narration is paused. */
  get paused() {
    return this._paused;
  }

  /** Available voice list. */
  get voices() {
    return this._voices;
  }

  /**
   * Speak text.
   * @param {string} text Content to speak
   * @param {string} [lang] Language code (default current interface language)
   */
  speak(text, lang = LANG) {
    if (!this.supported || !text) return;
    // Cancel ongoing speech before queuing new utterance
    this.stop();

    const utterance = new this._utteranceCtor(text);
    utterance.lang = LANG_TO_BCP47[lang] || lang || 'en-US';
    utterance.rate = this._rate;
    utterance.volume = this._volume;
    utterance.pitch = this._pitch;

    // Match voice: prefer exact BCP-47, fallback to language prefix
    const voice = this._findVoice(utterance.lang);
    if (voice) utterance.voice = voice;

    // Clean up state on speech end
    utterance.onend = () => {
      if (this._currentUtterance === utterance) this._currentUtterance = null;
      this._paused = false;
    };
    utterance.onerror = () => {
      if (this._currentUtterance === utterance) this._currentUtterance = null;
      this._paused = false;
    };

    this._currentUtterance = utterance;
    this._paused = false;
    this._synth.speak(utterance);
  }

  /** Stop speaking and clear queue. */
  stop() {
    if (this._synth) this._synth.cancel();
    this._currentUtterance = null;
    this._paused = false;
  }

  /** Pause speaking. */
  pause() {
    if (this._synth && this._synth.speaking && !this._synth.paused) {
      this._synth.pause();
      this._paused = true;
    }
  }

  /** Resume speaking. */
  resume() {
    if (this._synth && this._synth.paused) {
      this._synth.resume();
      this._paused = false;
    }
  }

  /**
   * Set speech rate.
   * @param {number} rate 0.1 to 10 (default 1.0).
   */
  setRate(rate) {
    this._rate = Math.max(0.1, Math.min(10, rate));
  }

  /**
   * Set speech volume.
   * @param {number} volume 0 to 1 (default 1.0).
   */
  setVolume(volume) {
    this._volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set speech pitch.
   * @param {number} pitch 0 to 2 (default 1.0).
   */
  setPitch(pitch) {
    this._pitch = Math.max(0, Math.min(2, pitch));
  }

  // ── Internal ──

  _loadVoices() {
    if (this._synth) {
      this._voices = this._synth.getVoices() || [];
    }
  }

  /**
   * Find matching voice for language.
   * Strategy: exact BCP-47 match, then prefix match.
   * @param {string} langTag BCP-47 tag, e.g. 'en-US'
   * @returns {SpeechSynthesisVoice|null}
   */
  _findVoice(langTag) {
    if (!this._voices.length) return null;
    const tag = langTag.toLowerCase();
    // Exact match (case insensitive)
    let voice = this._voices.find((v) => v.lang.toLowerCase() === tag);
    if (voice) return voice;
    // Language prefix match
    const prefix = tag.split('-')[0];
    voice = this._voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    return voice || null;
  }
}
