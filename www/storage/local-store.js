const DB_NAME = "homealacarte-private";
const DB_VERSION = 1;
const STORE = "state";
const ACTIVE_KEY = "active";
const META_KEY = "sync-meta";

function openDatabase(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(databaseName, mode, operation) {
  const database = await openDatabase(databaseName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  } finally {
    database.close();
  }
}

async function readEntry(databaseName, key) {
  const database = await openDatabase(databaseName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function readLocalState() {
  return readEntry(DB_NAME, ACTIVE_KEY);
}

export async function readSyncMeta() {
  return (await readEntry(DB_NAME, META_KEY)) || {};
}

export async function writeLocalState(value, meta) {
  await withStore(DB_NAME, "readwrite", (store) => {
    store.put(value, ACTIVE_KEY);
    store.put(meta, META_KEY);
  });
}

export async function reconcileSyncedLocalState(value, revision, userId, force) {
  const database = await openDatabase(DB_NAME);
  try {
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const currentRequest = store.get(ACTIVE_KEY);
      const metaRequest = store.get(META_KEY);
      let currentReady = false;
      let metaReady = false;
      const reconcile = () => {
        if (!currentReady || !metaReady) return;
        const current = currentRequest.result;
        const matches = current === undefined
          || JSON.stringify(current) === JSON.stringify(value);
        store.put(force || matches ? value : current, ACTIVE_KEY);
        store.put({
          ...(metaRequest.result || {}),
          dirty: force ? false : !matches,
          remoteRevision: revision,
          userId,
          lastSyncedAt: new Date().toISOString(),
        }, META_KEY);
      };
      currentRequest.onsuccess = () => {
        currentReady = true;
        reconcile();
      };
      metaRequest.onsuccess = () => {
        metaReady = true;
        reconcile();
      };
      currentRequest.onerror = () => reject(currentRequest.error);
      metaRequest.onerror = () => reject(metaRequest.error);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  } finally {
    database.close();
  }
}

export async function clearLocalState() {
  await withStore(DB_NAME, "readwrite", (store) => {
    store.delete(ACTIVE_KEY);
    store.delete(META_KEY);
  });
}
