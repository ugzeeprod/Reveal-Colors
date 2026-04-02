// idb.js — module IndexedDB partagé builder + game
const RC_DB_NAME = 'RevealColors';
const RC_DB_VERSION = 1;

let _db = null;

function rcOpenDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RC_DB_NAME, RC_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('levels')) {
        db.createObjectStore('levels', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'id' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

function rcTx(store, mode, fn) {
  return rcOpenDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const s = tx.objectStore(store);
    const req = fn(s);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function rcGetConfig() {
  return rcTx('config', 'readonly', s => s.get('levelsConfig'))
    .then(r => (r ? r.value : { collections: [] }));
}

function rcSetConfig(cfg) {
  return rcTx('config', 'readwrite', s => s.put({ key: 'levelsConfig', value: cfg }));
}

async function rcPublishLevel({ meta, grid, palette, gameGrid, imageBase64 }) {
  const { id, title, categoryId, categoryName } = meta;
  await rcTx('levels', 'readwrite', s => s.put({ id, meta, grid, palette, gameGrid: gameGrid || null }));
  if (imageBase64) {
    await rcTx('images', 'readwrite', s => s.put({ id, imageBase64 }));
  }
  const cfg = await rcGetConfig();
  let col = cfg.collections.find(c => c.id === categoryId);
  if (!col) {
    col = { id: categoryId, name: categoryName || categoryId, emoji: '🎨', levels: [] };
    cfg.collections.push(col);
  }
  if (!col.levels.some(l => l.id === id)) {
    col.levels.push({ id, title: title || id });
  }
  await rcSetConfig(cfg);
  return { ok: true };
}

function rcGetLevel(id) {
  return rcTx('levels', 'readonly', s => s.get(id));
}

function rcGetImage(id) {
  return rcTx('images', 'readonly', s => s.get(id))
    .then(r => r ? r.imageBase64 : null);
}

async function rcDeleteLevel(categoryId, levelId) {
  await rcTx('levels', 'readwrite', s => s.delete(levelId));
  await rcTx('images', 'readwrite', s => s.delete(levelId));
  const cfg = await rcGetConfig();
  const col = cfg.collections.find(c => c.id === categoryId);
  if (col) col.levels = col.levels.filter(l => l.id !== levelId);
  await rcSetConfig(cfg);
  return { ok: true };
}

function rcGetProgress(levelId) {
  return rcTx('progress', 'readonly', s => s.get(levelId))
    .then(r => r ? r.data : null);
}

function rcSetProgress(levelId, data) {
  return rcTx('progress', 'readwrite', s => s.put({ id: levelId, data }));
}

function rcDeleteProgress(levelId) {
  return rcTx('progress', 'readwrite', s => s.delete(levelId));
}
