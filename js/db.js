// Piccolo wrapper promise-based su IndexedDB.
const DB_NAME = 'budget27';
const DB_VERSION = 1;
// store -> keyPath
export const STORES = {
  meta: 'key', categories: 'id', movements: 'id', incomes: 'id', fixed: 'id', periods: 'key', paid: 'id',
};

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    result = fn(tx);
  });
}

const reqP = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  async all(store) {
    const d = await open();
    return reqP(d.transaction(store).objectStore(store).getAll());
  },
  async get(store, key) {
    const d = await open();
    return reqP(d.transaction(store).objectStore(store).get(key));
  },
  put(store, obj) { return run([store], 'readwrite', (tx) => { tx.objectStore(store).put(obj); }); },
  del(store, key) { return run([store], 'readwrite', (tx) => { tx.objectStore(store).delete(key); }); },
  /** Sostituisce in un'unica transazione il contenuto degli store indicati. */
  replace(data) {
    const names = Object.keys(data);
    return run(names, 'readwrite', (tx) => {
      for (const n of names) {
        const s = tx.objectStore(n);
        s.clear();
        for (const o of data[n]) s.put(o);
      }
    });
  },
  clearAll() {
    const names = Object.keys(STORES);
    return run(names, 'readwrite', (tx) => { for (const n of names) tx.objectStore(n).clear(); });
  },
};
