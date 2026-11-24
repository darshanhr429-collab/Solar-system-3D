// Tour UI: directory drawer tour entries + bottom playback control bar.
// Connects TourSystem and Narrator to the DOM.

import { LANG } from './i18n.js';

const UI = {
  'tour.group': { zh: '🎬 Tours', en: '🎬 Tours', es: '🎬 Visitas', ja: '🎬 Tours', fr: '🎬 Visites', de: '🎬 Touren', ru: '🎬 Tours' },
  'tour.exit':  { zh: 'Exit tour', en: 'Exit tour', es: 'Salir', ja: 'Exit', fr: 'Quitter', de: 'Beenden', ru: 'Exit' },
  'tour.prev':  { zh: 'Previous', en: 'Previous', es: 'Anterior', ja: 'Previous', fr: 'Précédent', de: 'Zurück', ru: 'Previous' },
  'tour.next':  { zh: 'Next', en: 'Next', es: 'Siguiente', ja: 'Next', fr: 'Suivant', de: 'Weiter', ru: 'Next' },
  'tour.stops': { zh: '{n} stops', en: '{n} stops', es: '{n} paradas', ja: '{n} stops', fr: '{n} arrêts', de: '{n} Stopps', ru: '{n} stops' },
};

function tt(key, vars) {
  const e = UI[key];
  let s = e ? (e.en ?? e[LANG] ?? key) : key;
  if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
  return s;
}

/**
 * Build the Tour UI.
 * @param {Object} tourSystem TourSystem instance
 * @param {Object} narrator   Narrator instance (TTS; hides audio button if unsupported)
 * @returns {{ ttsOn: boolean }} Read-write toggle state
 */
export function buildTourUI(tourSystem, narrator) {
  const state = { ttsOn: true };

  // ── Directory Drawer: Tour entries group ──
  const dirBody = document.getElementById('dir-body');
  if (dirBody) {
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = tt('tour.group');
    det.appendChild(sum);
    for (const tour of tourSystem.tours) {
      const btn = document.createElement('button');
      btn.className = 'dir-item';
      btn.innerHTML = `${tour.title} <span>${tt('tour.stops', { n: tour.checkpointCount })}</span>`;
      btn.addEventListener('click', () => {
        // Satisfies user gesture requirement for iOS Safari TTS
        tourSystem.start(tour.id);
        refreshBar();
      });
      det.appendChild(btn);
    }
    dirBody.appendChild(det);
  }

  // ── Bottom Control Bar (visible during tour playback) ──
  const bar = document.createElement('div');
  bar.id = 'tour-bar';
  bar.style.display = 'none';
  bar.innerHTML = `
    <span id="tour-bar-title"></span>
    <button id="tour-bar-prev" title="${tt('tour.prev')}">⏮</button>
    <button id="tour-bar-next" title="${tt('tour.next')}">⏭</button>
    ${narrator?.supported ? '<button id="tour-bar-tts" title="TTS">🔊</button>' : ''}
    <button id="tour-bar-exit" title="${tt('tour.exit')}">✕</button>`;
  document.body.appendChild(bar);

  bar.querySelector('#tour-bar-prev').addEventListener('click', () => { tourSystem.prev(); refreshBar(); });
  bar.querySelector('#tour-bar-next').addEventListener('click', () => { tourSystem.next(); refreshBar(); });
  bar.querySelector('#tour-bar-exit').addEventListener('click', () => {
    tourSystem.skip();
    narrator?.stop?.();
    refreshBar();
  });
  bar.querySelector('#tour-bar-tts')?.addEventListener('click', (e) => {
    state.ttsOn = !state.ttsOn;
    e.target.textContent = state.ttsOn ? '🔊' : '🔇';
    if (!state.ttsOn) narrator?.stop?.();
  });

  function refreshBar() {
    const cur = tourSystem.current;
    if (!tourSystem.isActive || !cur) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    const total = cur.checkpoint ? tourSystem.tours.find((x) => x.title === cur.title)?.checkpointCount : null;
    bar.querySelector('#tour-bar-title').textContent =
      `${cur.title} · ${tourSystem.checkpointIndex + 1}${total ? '/' + total : ''}`;
  }

  // Periodic sync for tour progress updates
  setInterval(refreshBar, 800);
  return state;
}
