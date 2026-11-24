// Teacher Toolkit: Lesson plan generation, classroom mode sync, Q&A target highlighting.
//
// Design principles:
// - Lesson plan: plain text outline, ready to copy into curricula, works offline
// - Classroom mode: URL bookmark sync with ?tour= parameter for synchronized group viewing
//   allowing entire classroom to follow along
// - Q&A mode: teacher question -> select + flyTo highlights target body
// - Offline distribution: Vite build outputs pure static files

import { LANG } from './i18n.js';
import { TOURS } from './tours.js';

// ── Teacher Toolkit UI Strings ──
const UI = {
  'teacher.lessonTitle': { zh: 'Lesson Plan', en: 'Lesson Plan', es: 'Plan de lección', ja: 'レッスンプラン', fr: 'Plan de cours', de: 'Unterrichtsplan', ru: 'План урока' },
  'teacher.duration':   { zh: 'Duration', en: 'Duration', es: 'Duración', ja: 'Duration', fr: 'Durée', de: 'Dauer', ru: 'Duration' },
  'teacher.action':     { zh: 'Action', en: 'Action', es: 'Acción', ja: 'アクション', fr: 'Action', de: 'Aktion', ru: 'Действие' },
  'teacher.totalDuration': { zh: 'Total duration', en: 'Total duration', es: 'Duración total', ja: 'Total duration', fr: 'Durée totale', de: 'Gesamtdauer', ru: 'Total duration' },
  'teacher.checkpoints': { zh: 'Checkpoints', en: 'Checkpoints', es: 'Puntos de control', ja: 'チェックポイント', fr: 'Points de contrôle', de: 'Kontrollpunkte', ru: 'Контрольные точки' },
  'teacher.classroomUrl': { zh: 'Classroom sync URL', en: 'Classroom sync URL', es: 'URL de sincronización', ja: 'Classroom sync URL', fr: 'URL de synchronisation', de: 'Sync-URL', ru: 'Classroom sync URL' },
  'teacher.classroomCopied': { zh: '📋 Classroom sync URL copied to clipboard', en: '📋 Classroom sync URL copied to clipboard', es: '📋 URL copiada', ja: '📋 Classroom sync URL copied', fr: '📋 URL copiée', de: '📋 URL kopiert', ru: '📋 Classroom sync URL copied' },
  'teacher.askHighlight': { zh: '🎯 Highlight: {name}', en: '🎯 Highlight: {name}', es: '🎯 Destacar: {name}', ja: '🎯 Highlight: {name}', fr: '🎯 Surligner : {name}', de: '🎯 Hervorheben: {name}', ru: '🎯 Highlight: {name}' },
  'teacher.offlineTitle': { zh: 'Offline usage', en: 'Offline usage', es: 'Uso sin conexión', ja: 'Offline usage', fr: 'Utilisation hors ligne', de: 'Offline-Nutzung', ru: 'Offline usage' },
};

function tt(key, vars) {
  const e = UI[key];
  let s = e ? (e.en ?? e[LANG] ?? key) : key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

/** Action type localized labels */
const ACTION_LABELS = {
  flyTo:   { zh: 'Fly to', en: 'Fly to', es: 'Volar a', ja: 'Fly to', fr: 'Vol vers', de: 'Flug zu', ru: 'Fly to' },
  land:    { zh: 'Land', en: 'Land', es: 'Aterrizar', ja: 'Land', fr: 'Atterrir', de: 'Landen', ru: 'Land' },
  lookAt:  { zh: 'Look at', en: 'Look at', es: 'Mirar', ja: 'Look at', fr: 'Regarder', de: 'Betrachten', ru: 'Look at' },
  zoomOut: { zh: 'Zoom out', en: 'Zoom out', es: 'Alejar', ja: 'Zoom out', fr: 'Dézoomer', de: 'Herauszoomen', ru: 'Zoom out' },
};

/**
 * Teacher toolkit: lesson plans, classroom sync, Q&A highlighting.
 *
 * @param {Object}   opts
 * @param {Object}   opts.tours   TourSystem instance
 * @param {Function} opts.select  (bodyId) => void - select body
 * @param {Function} opts.flyTo   (bodyId) => void - fly to body
 * @param {Object}   [opts.hud]   HUD instance (optional)
 * @param {Function} [opts.nameOf] (bodyId) => string - localized body name
 */
export class TeacherToolkit {
  constructor({ tours, select, flyTo, hud, nameOf }) {
    this.tours = tours;
    this.select = select;
    this.flyTo = flyTo;
    this.hud = hud;
    this.nameOf = nameOf ?? ((id) => id);
  }

  /**
   * Generate lesson plan text outline.
   * Plain text format, ready to copy into curricula.
   * @param {string} tourId 'backyard' | 'earth-moon'
   * @returns {string|null} Lesson plan text, or null if tour not found
   */
  generateLessonPlan(tourId) {
    const tour = TOURS[tourId];
    if (!tour) return null;

    const title = tour.title[LANG] ?? tour.title.en ?? tour.title.zh;
    const desc = tour.description[LANG] ?? tour.description.en ?? tour.description.zh;
    const lines = [];

    lines.push(`═══════════════════════════════════════════════════════════`);
    lines.push(`  ${tt('teacher.lessonTitle')}: ${title}`);
    lines.push(`═══════════════════════════════════════════════════════════`);
    lines.push('');
    lines.push(desc);
    lines.push('');
    lines.push(`${tt('teacher.checkpoints')}: ${tour.checkpoints.length}`);
    const totalDur = tour.checkpoints.reduce((s, c) => s + (c.duration || 0), 0);
    lines.push(`${tt('teacher.totalDuration')}: ${totalDur} s`);
    lines.push('');

    tour.checkpoints.forEach((cp, i) => {
      const narration = cp.narration[LANG] ?? cp.narration.en ?? cp.narration.zh;
      const actionLabel = ACTION_LABELS[cp.action]?.en
        ?? ACTION_LABELS[cp.action]?.[LANG]
        ?? cp.action;
      const distText = cp.dist != null
        ? `${cp.dist}× R`
        : 'default';

      lines.push(`─── ${tt('teacher.checkpoints')} ${i + 1}/${tour.checkpoints.length} ───`);
      lines.push(`  Body: ${cp.bodyId}`);
      lines.push(`  Distance: ${distText}`);
      lines.push(`  ${tt('teacher.action')}: ${actionLabel}`);
      lines.push(`  ${tt('teacher.duration')}: ${cp.duration} s`);
      lines.push(`  Narration:`);
      // Wrap narration at 60 characters for readability
      lines.push(this._wrapText(narration, 60, '    '));
      lines.push('');
    });

    // Offline usage documentation
    lines.push(`─── ${tt('teacher.offlineTitle')} ───`);
    lines.push(this._offlineInstructions());

    return lines.join('\n');
  }

  /**
   * Generate classroom sync URL.
   * Appends ?tour= query param to URL bookmark hash,
   * allowing students to automatically enter synchronized tour.
   * @param {string} [tourId] Tour ID to sync (defaults to active tour)
   * @returns {string|null} Sync URL, or null on failure
   */
  startClassroomMode(tourId) {
    if (typeof window === 'undefined' || !window.location) return null;

    // Prefer provided tourId, fallback to active tour
    let finalTourId = tourId;
    if (!finalTourId && this.tours?.isActive) {
      finalTourId = this.tours._activeTourId;
    }
    if (!finalTourId || !TOURS[finalTourId]) return null;

    // Preserve view bookmark hash, append tour query param
    const url = new URL(window.location.href);
    url.searchParams.set('tour', finalTourId);

    const syncUrl = url.toString();

    // Attempt copying to clipboard
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(syncUrl).catch(() => {});
    }

    if (this.hud) this.hud.tip(tt('teacher.classroomCopied'));

    return syncUrl;
  }

  /**
   * Q&A mode: highlight target celestial body.
   * Flies to and selects target body for classroom focus.
   * @param {string} bodyId Target body ID
   */
  askQuestion(bodyId) {
    this.select(bodyId);
    this.flyTo(bodyId);
    if (this.hud) {
      this.hud.tip(tt('teacher.askHighlight', { name: this.nameOf(bodyId) }));
    }
  }

  // ── Internal ──

  /** Text word wrap helper. */
  _wrapText(text, width, indent = '') {
    if (!text) return '';
    const chars = [...text]; // Correctly handle Unicode glyphs
    const lines = [];
    for (let i = 0; i < chars.length; i += width) {
      lines.push(indent + chars.slice(i, i + width).join(''));
    }
    return lines.join('\n');
  }

  /** Offline usage instructions text. */
  _offlineInstructions() {
    return [
      '  1. Run `npm run build` to produce static files (dist/)',
      '  2. Copy dist/ to any offline device / USB / LAN server',
      '  3. Open index.html in a browser — works fully offline',
      '  4. Ephemeris data is bundled in the code; no network needed',
      '  5. Texture assets are in public/textures/ — copy them too',
    ].join('\n');
  }
}
