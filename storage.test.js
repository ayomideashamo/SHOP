const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function createStorageContext() {
  const store = new Map();
  const localStorage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); }
  };
  const sessionStorage = {
    getItem(key) { return store.has(`session:${key}`) ? store.get(`session:${key}`) : null; },
    setItem(key, value) { store.set(`session:${key}`, String(value)); },
    removeItem(key) { store.delete(`session:${key}`); },
    clear() { for (const key of [...store.keys()]) if (key.startsWith('session:')) store.delete(key); }
  };
  const context = { localStorage, sessionStorage, console, Math, Date, JSON, setTimeout, clearTimeout };
  context.global = context;
  context.window = context;
  return { context, store };
}

test('storage helpers support owner-scoped keys', () => {
  const { context } = createStorageContext();
  const storageSource = fs.readFileSync(path.join(__dirname, 'file', 'storage.js'), 'utf8');
  vm.runInContext(storageSource, vm.createContext(context));

  const scopedKey = context.buildScopedStorageKey('shop-items', 'owner_1');
  assert.equal(scopedKey, 'shop-items:owner_1');

  const saved = context.saveStoredForOwner('shop-items', [{ id: 'item-1' }], 'owner_1');
  assert.equal(saved, true);

  const loaded = context.loadStoredForOwner('shop-items', [], 'owner_1');
  assert.deepEqual(loaded, [{ id: 'item-1' }]);
});
