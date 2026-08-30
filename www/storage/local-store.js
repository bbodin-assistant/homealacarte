import { normalizePrivateState, sameJsonValue } from "./document-codec.js?v=homealacarte-110";

const DB_NAME = "homealacarte-private";
const DB_VERSION = 3;
const DOCUMENT_STORE = "state";
const ACTIVE_KEY = "active";
const DOCUMENT_META_KEY = "sync-meta";
const OBSOLETE_STORES = ["records", "outbox", "metadata"];

let writeChain = Promise.resolve();

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) database.createObjectStore(DOCUMENT_STORE);
      for (const storeName of OBSOLETE_STORES) {
        if (database.objectStoreNames.contains(storeName)) database.deleteObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

function enqueueWrite(operation) {
  const next = writeChain.then(operation, operation);
  writeChain = next.catch(() => {});
  return next;
}

async function readDocumentEntries() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DOCUMENT_STORE, "readonly");
    const completed = transactionDone(transaction);
    const store = transaction.objectStore(DOCUMENT_STORE);
    const [value, meta] = await Promise.all([
      requestValue(store.get(ACTIVE_KEY)),
      requestValue(store.get(DOCUMENT_META_KEY)),
    ]);
    await completed;
    return { value, meta: meta || {} };
  } finally {
    database.close();
  }
}

async function writeStateNow(value, metaPatch = {}) {
  const desired = normalizePrivateState(value);
  const current = await readDocumentEntries();
  const changed = !sameJsonValue(current.value, desired);
  const nextMeta = {
    ...current.meta,
    ...metaPatch,
    dirty: metaPatch.dirty ?? (changed || Boolean(current.meta.dirty)),
    ...(changed ? { locallyUpdatedAt: new Date().toISOString() } : {}),
  };
  if (!changed && sameJsonValue(current.meta, nextMeta)) return { changed: false };

  const database = await openDatabase();
  try {
    const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
    const completed = transactionDone(transaction);
    const store = transaction.objectStore(DOCUMENT_STORE);
    store.put(desired, ACTIVE_KEY);
    store.put(nextMeta, DOCUMENT_META_KEY);
    await completed;
  } finally {
    database.close();
  }
  return { changed };
}

export async function readLocalState() {
  const { value } = await readDocumentEntries();
  return value === undefined ? undefined : normalizePrivateState(value);
}

export async function readSyncMeta() {
  return (await readDocumentEntries()).meta;
}

export function writeLocalState(value, meta = {}) {
  return enqueueWrite(() => writeStateNow(value, meta));
}

export function reconcileSyncedLocalState(value, revision, userId, force = false) {
  return enqueueWrite(async () => {
    const remote = normalizePrivateState(value);
    const current = await readDocumentEntries();
    const matches = current.value === undefined || sameJsonValue(current.value, remote);
    const nextValue = force || matches ? remote : current.value;
    const database = await openDatabase();
    try {
      const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
      const completed = transactionDone(transaction);
      const store = transaction.objectStore(DOCUMENT_STORE);
      store.put(nextValue, ACTIVE_KEY);
      store.put({
        ...current.meta,
        dirty: force ? false : !matches,
        remoteRevision: Number(revision),
        userId,
        lastSyncedAt: new Date().toISOString(),
      }, DOCUMENT_META_KEY);
      await completed;
    } finally {
      database.close();
    }
    return { changed: !sameJsonValue(current.value, nextValue), dirty: force ? false : !matches };
  });
}

export async function clearLocalState() {
  await enqueueWrite(async () => {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
      const completed = transactionDone(transaction);
      transaction.objectStore(DOCUMENT_STORE).clear();
      await completed;
    } finally {
      database.close();
    }
  });
}
