// Local bookmarks management: persists location / time / focus to localStorage,
// supporting named bookmarks, load / delete, export / import JSON.
//
// Design principles:
// - Pure data layer, independent of DOM / Three.js.
// - State format aligned with main.js URL hash bookmarks,
//   preserving posKm and mode for fly / walk modes.
// - Graceful in-memory fallback if localStorage is unavailable.

const STORAGE_KEY = 'solar-wanderer:bookmarks';
const SCHEMA_VERSION = 1;

/** Generate short unique ID (time + random, zero dependencies) */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class Bookmarks {
  constructor() {
    /** @type {Array<{id,name,state,created}>} */
    this._items = [];
    this._load();
  }

  // ── Persistence ──

  /** Load from localStorage; gracefully fall back to empty list on failure */
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      // Compatibility: array (legacy) or { version, items } (new)
      const items = Array.isArray(data) ? data : data?.items;
      if (Array.isArray(items)) this._items = items;
    } catch {
      // Fallback to empty list on JSON parse error or localStorage unavailable
      this._items = [];
    }
  }

  /** Save to localStorage; silent failure keeps in-memory copy */
  _persist() {
    try {
      const payload = JSON.stringify({ version: SCHEMA_VERSION, items: this._items });
      localStorage.setItem(STORAGE_KEY, payload);
    } catch {
      // Quota exceeded / private browsing -> retain in-memory copy
    }
  }

  // ── Public API ──

  /**
   * Save current state as named bookmark.
   * @param {string} name Bookmark name
   * @param {{posKm:number[], focusId:string, lat:number, lon:number, dist:number, jdTT:number, mode:string}} state
   * @returns {string} New bookmark ID
   */
  save(name, state) {
    // Convert Float64Array posKm to array for JSON serialization
    const cleanState = {
      ...state,
      posKm: state.posKm
        ? Array.from(state.posKm)
        : undefined,
    };
    const bookmark = {
      id: genId(),
      name: name || `Bookmark ${this._items.length + 1}`,
      state: cleanState,
      created: Date.now(),
    };
    this._items.push(bookmark);
    this._persist();
    return bookmark.id;
  }

  /**
   * Load bookmark by ID.
   * @param {string} id
   * @returns {{id,name,state,created}|null}
   */
  load(id) {
    return this._items.find((b) => b.id === id) ?? null;
  }

  /** Return all bookmarks (sorted by creation time descending) */
  list() {
    return [...this._items].sort((a, b) => b.created - a.created);
  }

  /**
   * Delete bookmark by ID.
   * @returns {boolean} Whether delete succeeded
   */
  delete(id) {
    const idx = this._items.findIndex((b) => b.id === id);
    if (idx < 0) return false;
    this._items.splice(idx, 1);
    this._persist();
    return true;
  }

  /** Clear all bookmarks */
  clear() {
    this._items = [];
    this._persist();
  }

  /**
   * Export all bookmarks as JSON string for download / sharing.
   * @returns {string}
   */
  exportJSON() {
    return JSON.stringify(
      { version: SCHEMA_VERSION, exported: Date.now(), items: this._items },
      null,
      2,
    );
  }

  /**
   * Import bookmarks from JSON string (merges, deduplicates).
   * @param {string} json JSON string from exportJSON()
   * @returns {number} Number of imported bookmarks
   * @throws {Error} Throws if format is invalid
   */
  importJSON(json) {
    const data = JSON.parse(json);
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) {
      throw new Error('Invalid bookmark JSON: expected array or {items:[]}');
    }
    let count = 0;
    for (const b of items) {
      // Basic field validation
      if (!b || !b.id || !b.state) continue;
      // Skip duplicate IDs
      if (this._items.some((e) => e.id === b.id)) continue;
      this._items.push({
        id: b.id,
        name: b.name || 'Imported',
        state: b.state,
        created: b.created || Date.now(),
      });
      count++;
    }
    this._persist();
    return count;
  }
}
