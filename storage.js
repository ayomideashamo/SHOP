 function parseStored(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function buildScopedStorageKey(key, ownerId) {
  const normalizedOwnerId = ownerId ? String(ownerId).trim() : '';
  return normalizedOwnerId ? `${key}:${normalizedOwnerId}` : key;
}

function getStorageKey(key, options = {}) {
  return buildScopedStorageKey(key, options.ownerId || options.shopOwnerId || options.scope);
}

function loadStored(key, fallback = null, options = {}) {
  const useSessionFallback = options.sessionFallback === true;
  const storageKey = getStorageKey(key, options);
  try {
    const raw = localStorage.getItem(storageKey);
    const value = parseStored(raw, null);
    if (value !== null) return value;
  } catch (e) {
    // ignore storage access errors
  }

  if (useSessionFallback) {
    try {
      const raw = sessionStorage.getItem(storageKey);
      const value = parseStored(raw, null);
      if (value !== null) return value;
    } catch (e) {
      // ignore session storage errors
    }
  }

  return fallback;
}

function saveStored(key, value, options = {}) {
  const storageKey = getStorageKey(key, options);
  const payload = JSON.stringify(value);
  let ok = true;
  try {
    localStorage.setItem(storageKey, payload);
  } catch (e) {
    ok = false;
  }
  if (options.alsoSession === true) {
    try {
      sessionStorage.setItem(storageKey, payload);
    } catch (e) {
      ok = false;
    }
  }
  return ok;
}

function removeStored(key, options = {}) {
  const storageKey = getStorageKey(key, options);
  let ok = true;
  try {
    localStorage.removeItem(storageKey);
  } catch (e) {
    ok = false;
  }
  if (options.alsoSession === true) {
    try {
      sessionStorage.removeItem(storageKey);
    } catch (e) {
      ok = false;
    }
  }
  return ok;
}

function clearStored(options = {}) {
  let ok = true;
  if (options.ownerId || options.shopOwnerId || options.scope) {
    const ownerId = options.ownerId || options.shopOwnerId || options.scope;
    const prefix = `${ownerId}:`;
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.includes(prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      ok = false;
    }
    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.includes(prefix)) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (e) {
      ok = false;
    }
    return ok;
  }

  try {
    localStorage.clear();
  } catch (e) {
    ok = false;
  }
  if (options.alsoSession === true) {
    try {
      sessionStorage.clear();
    } catch (e) {
      ok = false;
    }
  }
  return ok;
}

function loadStoredForOwner(key, fallback = null, ownerId, options = {}) {
  const scopedValue = loadStored(key, null, { ...options, ownerId });
  if (scopedValue !== null) return scopedValue;
  const legacyValue = loadStored(key, null, options);
  return legacyValue === null ? fallback : legacyValue;
}

function saveStoredForOwner(key, value, ownerId, options = {}) {
  return saveStored(key, value, { ...options, ownerId });
}

function removeStoredForOwner(key, ownerId, options = {}) {
  return removeStored(key, { ...options, ownerId });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}
