/**
 * T-HUB Librarian IndexedDB Storage Layer (thubDB)
 * High-capacity, non-blocking persistent storage replacing localStorage for large datasets
 * (book catalogs, library inventory, Supabase query cache, page snapshots).
 */
(function initThubIndexedDB() {
  const DB_NAME = "thub_librarian_cache_db";
  const DB_VERSION = 1;
  const STORES = {
    PAGE_CACHE: "page_cache",
    BOOKS_CACHE: "books_cache",
    SUPABASE_CACHE: "supabase_cache",
    KEYVAL: "keyval",
  };

  const memoryStore = new Map();
  let dbPromise = null;
  let dbInstance = null;

  function memoryKey(storeName, key) {
    return `${storeName}:${key}`;
  }

  function getIndexedDB() {
    try {
      return (
        window.indexedDB ||
        window.mozIndexedDB ||
        window.webkitIndexedDB ||
        window.msIndexedDB ||
        null
      );
    } catch {
      return null;
    }
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;

    const idb = getIndexedDB();
    if (!idb) {
      console.warn("IndexedDB is not supported or available. Falling back to in-memory store.");
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }

    dbPromise = new Promise((resolve) => {
      try {
        const request = idb.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          for (const storeName of Object.values(STORES)) {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName, { keyPath: "key" });
            }
          }
        };

        request.onsuccess = (event) => {
          dbInstance = event.target.result;

          // Warm in-memory cache with all persistent records
          warmMemoryStore(dbInstance).then(() => {
            resolve(dbInstance);
          });
        };

        request.onerror = (event) => {
          console.warn("Could not open IndexedDB, falling back to in-memory store:", event.target.error);
          resolve(null);
        };

        request.onblocked = () => {
          console.warn("IndexedDB connection blocked by another open tab.");
        };
      } catch (error) {
        console.warn("IndexedDB open exception, falling back to memory:", error);
        resolve(null);
      }
    });

    return dbPromise;
  }

  async function warmMemoryStore(db) {
    if (!db) return;
    try {
      for (const storeName of [STORES.PAGE_CACHE, STORES.BOOKS_CACHE, STORES.KEYVAL]) {
        if (!db.objectStoreNames.contains(storeName)) continue;
        const items = await new Promise((resolve) => {
          try {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        });

        for (const item of items) {
          if (item && item.key) {
            memoryStore.set(memoryKey(storeName, item.key), item.value !== undefined ? item.value : item);
          }
        }
      }
    } catch (e) {
      console.warn("Error warming in-memory cache from IndexedDB:", e);
    }
  }

  function getStore(db, storeName, mode = "readonly") {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async function get(storeName, key) {
    if (!key) return null;

    // Check memory first
    const memVal = memoryStore.get(memoryKey(storeName, key));
    if (memVal !== undefined) return memVal;

    const db = await openDatabase();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const store = getStore(db, storeName, "readonly");
        const request = store.get(key);
        request.onsuccess = () => {
          const result = request.result;
          if (!result) {
            resolve(null);
            return;
          }
          const val = result.value !== undefined ? result.value : result;
          memoryStore.set(memoryKey(storeName, key), val);
          resolve(val);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function set(storeName, key, value) {
    if (!key) return;

    // Save in memory immediately
    memoryStore.set(memoryKey(storeName, key), value);

    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const store = getStore(db, storeName, "readwrite");
        let record;
        if (value && typeof value === "object" && !Array.isArray(value) && storeName === STORES.SUPABASE_CACHE) {
          record = { ...value, key, savedAt: Date.now() };
        } else if (value && typeof value === "object" && !Array.isArray(value) && storeName === STORES.PAGE_CACHE) {
          record = { ...value, key, savedAt: value.savedAt || Date.now() };
        } else {
          record = { key, value, savedAt: Date.now() };
        }

        const request = store.put(record);
        request.onsuccess = () => resolve(true);
        request.onerror = (e) => {
          console.warn(`IndexedDB put failed for ${storeName}/${key}:`, e.target.error);
          resolve(false);
        };
      } catch (err) {
        console.warn(`IndexedDB set exception for ${storeName}/${key}:`, err);
        resolve(false);
      }
    });
  }

  async function del(storeName, key) {
    if (!key) return;
    memoryStore.delete(memoryKey(storeName, key));

    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const store = getStore(db, storeName, "readwrite");
        const request = store.delete(key);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function getAll(storeName) {
    const db = await openDatabase();
    if (!db) {
      const results = [];
      const prefix = `${storeName}:`;
      for (const [k, v] of memoryStore.entries()) {
        if (k.startsWith(prefix)) results.push(v);
      }
      return results;
    }

    return new Promise((resolve) => {
      try {
        const store = getStore(db, storeName, "readonly");
        const request = store.getAll();
        request.onsuccess = () => {
          const list = (request.result || []).map((item) =>
            item.value !== undefined ? item.value : item
          );
          resolve(list);
        };
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async function clear(storeName) {
    const prefix = `${storeName}:`;
    for (const k of Array.from(memoryStore.keys())) {
      if (k.startsWith(prefix)) memoryStore.delete(k);
    }

    const db = await openDatabase();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const store = getStore(db, storeName, "readwrite");
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function clearAll() {
    memoryStore.clear();

    const db = await openDatabase();
    if (!db) return;

    await Promise.all(
      Object.values(STORES).map((storeName) => clear(storeName))
    );
  }

  function getSync(storeName, key) {
    if (!key) return null;
    return memoryStore.get(memoryKey(storeName, key)) || null;
  }

  function setSync(storeName, key, value) {
    if (!key) return;
    memoryStore.set(memoryKey(storeName, key), value);
    set(storeName, key, value);
  }

  function deleteSync(storeName, key) {
    if (!key) return;
    memoryStore.delete(memoryKey(storeName, key));
    del(storeName, key);
  }

  /**
   * Migrate legacy data from localStorage to IndexedDB, then remove the heavy items
   * from localStorage to reclaim space and prevent QuotaExceededError.
   */
  function migrateFromLocalStorage() {
    try {
      const keysToMigrate = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith("thubLibraryBooksCatalog:") ||
            key.startsWith("thubStudentBooksCatalog:") ||
            key.startsWith("thubLibraryBooksAccess:") ||
            key.startsWith("thubStudentBooksAccess:") ||
            key.startsWith("thubLibraryInventory:") ||
            key.startsWith("thubLibraryPageCache:") ||
            key.startsWith("thubStudentPageCache:") ||
            key.startsWith("thubSupabaseRead:") ||
            key === "thubLibrary:canDelete")
        ) {
          keysToMigrate.push(key);
        }
      }

      for (const key of keysToMigrate) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }

        if (
          key.startsWith("thubLibraryBooksCatalog:") ||
          key.startsWith("thubStudentBooksCatalog:") ||
          key.startsWith("thubLibraryBooksAccess:") ||
          key.startsWith("thubStudentBooksAccess:") ||
          key.startsWith("thubLibraryInventory:")
        ) {
          setSync(STORES.BOOKS_CACHE, key, parsed);
        } else if (
          key.startsWith("thubLibraryPageCache:") ||
          key.startsWith("thubStudentPageCache:")
        ) {
          setSync(STORES.PAGE_CACHE, key, parsed);
        } else if (key.startsWith("thubSupabaseRead:")) {
          setSync(STORES.SUPABASE_CACHE, key, parsed);
        } else {
          setSync(STORES.KEYVAL, key, parsed);
        }

        // Clean from localStorage to free up quota
        try {
          localStorage.removeItem(key);
        } catch {}
      }
    } catch (e) {
      console.warn("Could not migrate localStorage entries into IndexedDB:", e);
    }
  }

  // Run migration immediately
  migrateFromLocalStorage();

  // Trigger database open and memory warm-up
  const readyPromise = openDatabase();

  const api = Object.freeze({
    STORES,
    get,
    set,
    delete: del,
    getAll,
    clear,
    clearAll,
    getSync,
    setSync,
    deleteSync,
    ready: () => readyPromise,
  });

  window.thubDB = api;
  window.thubDBReady = readyPromise;
})();
