// Persistent texture cache: stores full-size texture blobs in IndexedDB for instant hits on revisits.
// Gracefully degrades to regular network fetch on any error - cache is an optional accelerator.

const DB_NAME = 'sw-texture-cache';
const STORE = 'blobs';
const CAP_BYTES = 256 * 1024 * 1024; // LRU eviction threshold

let dbPromise = null;
let lastEvict = 0;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

export async function idbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result?.blob ?? null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function idbPut(key, blob) {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ blob, ts: Date.now(), size: blob.size }, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    // Low-frequency cleanup runs asynchronously without blocking writes
    if (Date.now() - lastEvict > 60000) {
      lastEvict = Date.now();
      evictIfNeeded(db);
    }
  } catch { /* Write errors (quota exceeded, etc.) degrade silently */ }
}

async function evictIfNeeded(db) {
  try {
    const entries = await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve([]);
    });
    let total = entries.reduce((s, e) => s + (e.size ?? 0), 0);
    if (total <= CAP_BYTES) return;
    const doomed = entries
      .map((e, i) => ({ i, ts: e.ts ?? 0, size: e.size ?? 0 }))
      .sort((a, b) => a.ts - b.ts);
    const keys = await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve([]);
    });
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const d of doomed) {
      if (total <= CAP_BYTES) break;
      store.delete(keys[d.i]);
      total -= d.size;
    }
  } catch { /* Cleanup failures retry on next invocation */ }
}
