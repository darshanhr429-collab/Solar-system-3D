// Google Earth style location search (auto-complete) + categorized celestial catalog sidebar.
// Selection triggers flyTo flight animation, delivering a dynamic exploration experience.

import { t, bodyName, LANG } from './i18n.js';

function altName(e) {
  return '';
}

export class SearchUI {
  /**
   * @param registry Map<id, {nameZh, nameEn, kind, phys, parentId?}>
   * @param onGo (id) => void  Fly to target
   * @param opts { getOrbits:()=>bool, toggleOrbits:()=>void, onSelect?:(id)=>void }
   */
  constructor(registry, onGo, opts = {}) {
    this.registry = registry;
    this.onGo = onGo;
    this.opts = opts;
    this.buildDirectory();
    this.buildSearch(); // Search box DOM ready at catalog header, wire up search
  }

  entries() {
    return [...this.registry.entries()].map(([id, t]) => ({
      id, en: (t.nameEn ?? t.name ?? '').toLowerCase(), kind: t.kind, parentId: t.parentId,
    }));
  }

  buildSearch() {
    const box = document.getElementById('search-box');
    const input = document.getElementById('search-input');
    const list = document.getElementById('search-results');
    let items = [];
    let sel = -1;

    const render = () => {
      list.innerHTML = '';
      items.forEach((it, i) => {
        const div = document.createElement('div');
        div.className = 'search-item' + (i === sel ? ' active' : '');
        if (it.special === 'orbits') {
          const on = this.opts.getOrbits?.() ?? true;
          div.innerHTML = `<b>${t('search.orbits')}</b> <span>${t('search.cur')}: ${on ? t('search.on') : t('search.off')}</span><em>${t('search.toggle')}</em>`;
          div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.opts.toggleOrbits?.();
            render(); // Refresh status text, keep dropdown open
          });
        } else {
          const e = this.registry.get(it.id);
          div.innerHTML = `<b>${bodyName(e)}</b> <span>${altName(e)}</span><em>${KIND_LABEL[e.kind] ?? ''}</em>`;
          div.addEventListener('mousedown', (ev) => { ev.preventDefault(); go(it.id); });
        }
        list.appendChild(div);
      });
      list.style.display = items.length ? '' : 'none';
    };

    // Default empty query list: orbit lines toggle + popular destinations
    const showDefault = () => {
      const hot = ['earth', 'moon', 'mars', 'jupiter', 'saturn', 'halley', 'voyager1', 'heliopause']
        .filter((id) => this.registry.has(id))
        .map((id) => ({ id }));
      items = [{ special: 'orbits' }, ...hot];
      sel = -1;
      render();
    };

    const go = (id) => {
      input.value = '';
      items = []; sel = -1;
      render();
      input.blur();
      this.onGo(id);
    };

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { showDefault(); return; }
      items = this.entries()
        .filter((e) => e.en.includes(q) || e.id.includes(q))
        .map((e) => ({ id: e.id }))
        .slice(0, 8);
      sel = items.length ? 0 : -1;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && sel >= 0 && items[sel].id) { go(items[sel].id); }
      else if (e.key === 'Escape') { input.value = ''; items = []; render(); input.blur(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 150));
    input.addEventListener('focus', () => {
      if (!input.value.trim()) showDefault();
      else if (items.length) list.style.display = '';
    });
    box.style.display = '';
  }

  buildDirectory() {
    const panel = document.getElementById('directory');
    const head = panel.querySelector('.dir-head');
    head.addEventListener('click', () => {
      panel.classList.toggle('open');
    });

    const PLANET_GROUP = t('grp.planet');
    const groups = [
      { title: t('grp.star'), filter: (e) => e.kind === 'star' },
      { title: PLANET_GROUP, filter: (e) => e.kind === 'planet' && e.phys?.type !== 'dwarf' },
      { title: t('grp.dwarf'), filter: (e) => e.kind === 'planet' && e.phys?.type === 'dwarf' },
      { title: t('grp.moon'), filter: (e) => e.kind === 'moon', groupByParent: true },
      { title: t('grp.comet'), filter: (e) => e.kind === 'comet' },
      { title: t('grp.tno'), filter: (e) => e.kind === 'tno' },
      { title: t('grp.asteroid'), filter: (e) => e.kind === 'asteroid' },
      { title: t('grp.probe'), filter: (e) => e.kind === 'probe' },
      { title: t('grp.boundary'), filter: (e) => e.kind === 'boundary' },
      { title: t('grp.region'), filter: (e) => e.kind === 'region' },
    ];

    const body = document.getElementById('dir-body');
    body.innerHTML = '';
    for (const g of groups) {
      const ents = [...this.registry.entries()].filter(([, e]) => g.filter(e));
      if (!ents.length) continue;
      const det = document.createElement('details');
      det.open = g.title === PLANET_GROUP;
      const sum = document.createElement('summary');
      sum.textContent = `${g.title} (${ents.length})`;
      det.appendChild(sum);
      let lastParent = null;
      for (const [id, e] of ents) {
        if (g.groupByParent && e.parentId !== lastParent) {
          lastParent = e.parentId;
          const ph = document.createElement('div');
          ph.className = 'dir-parent';
          ph.textContent = bodyName(this.registry.get(e.parentId)) || e.parentId;
          det.appendChild(ph);
        }
        const btn = document.createElement('button');
        btn.className = 'dir-item';
        btn.innerHTML = `${bodyName(e)} <span>${altName(e)}</span>`;
        btn.addEventListener('click', () => {
          this.onGo(id);
          this.opts.onSelect?.(id);
        });
        det.appendChild(btn);
      }
      body.appendChild(det);
    }
  }
}

const KIND_LABEL = {
  star: t('kind.star'), planet: t('kind.planet'), moon: t('kind.moon'), comet: t('kind.comet'),
  probe: t('kind.probe'), boundary: t('kind.boundary'), poi: t('kind.poi'),
  tno: t('kind.tno'), region: t('kind.region'),
};
