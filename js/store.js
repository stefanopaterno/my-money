// Stato in memoria + scrittura su IndexedDB. Tutto è piccolo (un solo utente), quindi si carica tutto all'avvio.
import { db } from './db.js';
import { SCHEMA_VERSION, migrate, validate } from './migrate.js';
import { withVersion, withVersionOnly } from './calc.js';
import { todayStr, addDays } from './period.js';

export const DEFAULT_CATEGORIES = [
  ['Spesa cibo', '🛒', '#34c759'], ['Cene', '🍽️', '#ff9500'], ['Spese mediche', '💊', '#ff3b30'],
  ['Spese casa', '🏠', '#8e6e53'], ['Spese personali', '🧴', '#af52de'], ['Vestiti', '👕', '#5856d6'],
  ['Elettricità', '💡', '#ffcc00'], ['Gas', '🔥', '#ff6b35'], ['ADSL', '🌐', '#30b0c7'], ['Telefono', '📱', '#007aff'], ['Altro', '📦', '#8e8e93'],
];

export const state = {
  settings: { startDay: 27, salaryDefault: 0, createdAt: null, lastBackup: null, showGate: true, privacyOnOpen: true, lastBank: 'ING' },
  categories: [], movements: [], incomes: [], fixed: [],
  periods: [], // [{key, salary?, budgets:{catId:cents}}]
  paid: {},    // 'fixedId|periodKey' -> true
  cart: { items: [], categoryId: null, note: '' },
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const notify = () => listeners.forEach((fn) => fn());

async function metaGet(key) { const r = await db.get('meta', key); return r ? r.value : undefined; }
const metaSet = (key, value) => db.put('meta', { key, value });

export async function init() {
  const [settings, cart, version, cats, movs, incs, fixed, periods, paid] = await Promise.all([
    metaGet('settings'), metaGet('cart'), metaGet('schemaVersion'),
    db.all('categories'), db.all('movements'), db.all('incomes'), db.all('fixed'), db.all('periods'), db.all('paid'),
  ]);
  if (version === undefined) {
    // primo avvio: categorie predefinite
    state.settings.createdAt = Date.now();
    state.categories = DEFAULT_CATEGORIES.map(([name, emoji, color], i) => ({ id: uid(), name, emoji, color, order: i, archived: false }));
    await db.replace({ categories: state.categories });
    await metaSet('settings', state.settings);
    await metaSet('schemaVersion', SCHEMA_VERSION);
    await metaSet('altroSeeded', true);
  } else {
    Object.assign(state.settings, settings);
    state.categories = cats.sort((a, b) => a.order - b.order);
    state.movements = movs; state.incomes = incs; state.fixed = fixed; state.periods = periods;
    state.paid = Object.fromEntries(paid.map((p) => [p.id, { date: p.date || null }]));
    if (cart) state.cart = cart;
    if (version < SCHEMA_VERSION) await metaSet('schemaVersion', SCHEMA_VERSION);
    // categoria "Altro" per le installazioni precedenti (una sola volta)
    if (!(await metaGet('altroSeeded'))) {
      if (!state.categories.some((c) => c.name === 'Altro')) {
        const c = { id: uid(), name: 'Altro', emoji: '📦', color: '#8e8e93', order: state.categories.length, archived: false };
        state.categories.push(c); await db.put('categories', c);
      }
      await metaSet('altroSeeded', true);
    }
  }
  state.movements.sort(byDateDesc);
}

const byDateDesc = (a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1);

// ---- impostazioni ----
export async function updateSettings(patch) {
  Object.assign(state.settings, patch);
  await metaSet('settings', state.settings);
  notify();
}

// ---- movimenti ----
export async function addMovement({ date, amount, categoryId, note = '', card = null }) {
  const m = { id: uid(), date: date || todayStr(), amount, categoryId, note, card, createdAt: Date.now() };
  state.movements.push(m); state.movements.sort(byDateDesc);
  await db.put('movements', m); notify();
  return m;
}
export async function updateMovement(id, patch) {
  const m = state.movements.find((x) => x.id === id);
  Object.assign(m, patch); state.movements.sort(byDateDesc);
  await db.put('movements', m); notify();
}
export async function deleteMovement(id) {
  state.movements = state.movements.filter((x) => x.id !== id);
  await db.del('movements', id); notify();
}

// ---- entrate extra ----
export async function addIncome({ date, amount, description }) {
  const i = { id: uid(), date, amount, description, createdAt: Date.now() };
  state.incomes.push(i); await db.put('incomes', i); notify();
}
export async function updateIncome(id, patch) {
  const i = state.incomes.find((x) => x.id === id); Object.assign(i, patch);
  await db.put('incomes', i); notify();
}
export async function deleteIncome(id) {
  state.incomes = state.incomes.filter((x) => x.id !== id);
  await db.del('incomes', id); notify();
}

// ---- periodi (stipendio / budget) ----
function periodRec(key) {
  let p = state.periods.find((x) => x.key === key);
  if (!p) { p = { key, budgets: {} }; state.periods.push(p); }
  return p;
}
export async function setSalary(key, cents) {
  const p = periodRec(key);
  if (cents === null) delete p.salary; else p.salary = cents;
  await db.put('periods', p); notify();
}
export async function setBudget(key, catId, cents) {
  const p = periodRec(key); p.budgets[catId] = cents;
  await db.put('periods', p); notify();
}

// ---- categorie ----
export async function updateCategory(id, patch) {
  const c = state.categories.find((x) => x.id === id);
  Object.assign(c, patch);
  await db.put('categories', c); notify();
}
export async function addCategory({ name, emoji, color }) {
  const c = { id: uid(), name, emoji, color, order: state.categories.length, archived: false };
  state.categories.push(c); await db.put('categories', c); notify(); return c;
}
export async function reorderCategories(idsInOrder) {
  const map = new Map(state.categories.map((c) => [c.id, c]));
  idsInOrder.forEach((id, i) => { map.get(id).order = i; });
  state.categories.sort((a, b) => a.order - b.order);
  await Promise.all(state.categories.map((c) => db.put('categories', c))); notify();
}

// ---- spese fisse ----
export async function addFixed({ name, amount, from, dueDay = null }) {
  const f = { id: uid(), name, order: state.fixed.length, dueDay, versions: [{ from, active: true, amount }] };
  state.fixed.push(f); await db.put('fixed', f); notify(); return f;
}
export async function renameFixed(id, name) {
  const f = state.fixed.find((x) => x.id === id); f.name = name;
  await db.put('fixed', f); notify();
}
/** Imposta stato/importo da un periodo in avanti; lo storico precedente resta com'è. */
export async function setFixedFrom(id, from, { active, amount }) {
  const i = state.fixed.findIndex((x) => x.id === id);
  state.fixed[i] = withVersion(state.fixed[i], from, { active, amount });
  await db.put('fixed', state.fixed[i]); notify();
}
/** Solo per un periodo (es. salto la rata questo mese). */
export async function setFixedOnlyFor(id, key, patch) {
  const i = state.fixed.findIndex((x) => x.id === id);
  state.fixed[i] = withVersionOnly(state.fixed[i], key, patch);
  await db.put('fixed', state.fixed[i]); notify();
}
export async function removeFixedVersion(id, from) {
  const f = state.fixed.find((x) => x.id === id);
  if (f.versions.length <= 1) return;
  f.versions = f.versions.filter((v) => v.from !== from);
  await db.put('fixed', f); notify();
}
export async function setDueDay(id, dueDay) {
  const f = state.fixed.find((x) => x.id === id); f.dueDay = dueDay;
  await db.put('fixed', f); notify();
}
/** Segna pagata (con data di pagamento) o da pagare. */
export async function setPaid(fixedId, key, paid, date = null) {
  const id = `${fixedId}|${key}`;
  if (paid) { state.paid[id] = { date }; await db.put('paid', { id, fixedId, period: key, date }); }
  else { delete state.paid[id]; await db.del('paid', id); }
  notify();
}

// ---- carrello (persistente) ----
export async function saveCart(cart) {
  state.cart = cart;
  await metaSet('cart', cart);
}

// ---- backup ----
export function buildExport() {
  return {
    app: 'My Money', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    settings: state.settings, categories: state.categories, movements: state.movements, incomes: state.incomes,
    fixed: state.fixed, periods: state.periods,
    paid: Object.keys(state.paid).map((id) => { const [fixedId, period] = id.split('|'); return { id, fixedId, period, date: state.paid[id].date || null }; }),
  };
}
export async function markBackup() { await updateSettings({ lastBackup: Date.now() }); }

export async function importData(raw) {
  const d = validate(migrate(raw));
  await db.replace({
    categories: d.categories, movements: d.movements, incomes: d.incomes, fixed: d.fixed, periods: d.periods, paid: d.paid,
    meta: [
      { key: 'settings', value: { startDay: 27, salaryDefault: 0, createdAt: Date.now(), lastBackup: null, showGate: true, privacyOnOpen: true, lastBank: 'ING', ...d.settings } },
      { key: 'schemaVersion', value: SCHEMA_VERSION },
      { key: 'cart', value: { items: [], categoryId: null, note: '' } },
    ],
  });
  await reloadFromDb();
}

async function reloadFromDb() {
  state.settings = { startDay: 27, salaryDefault: 0, createdAt: null, lastBackup: null, showGate: true, privacyOnOpen: true, lastBank: 'ING' };
  state.cart = { items: [], categoryId: null, note: '' };
  await init();
  notify();
}

export async function wipeAll() {
  await db.clearAll();
  state.categories = []; state.movements = []; state.incomes = []; state.fixed = []; state.periods = []; state.paid = {};
  await reloadFromDb();
}

// ---- dati di esempio ----
export async function seedDemo(currentKey, addPeriods, periodRange) {
  const cat = (n) => state.categories.find((c) => c.name === n)?.id;
  await updateSettings({ salaryDefault: 190000 });
  const mutuo = await addFixed({ name: 'Mutuo', amount: 80000, from: addPeriods(currentKey, -5) });
  const mant = await addFixed({ name: 'Mantenimento', amount: 40000, from: addPeriods(currentKey, -5) });
  await setFixedFrom(mant.id, addPeriods(currentKey, -1), { active: false });
  const budgets = { 'Spesa cibo': 40000, Cene: 15000, 'Spese mediche': 10000, 'Spese casa': 8000, 'Spese personali': 6000, Vestiti: 8000, Elettricità: 7000, Gas: 6000, ADSL: 2900, Telefono: 1500 };
  for (const [n, v] of Object.entries(budgets)) await setBudget(addPeriods(currentKey, -5), cat(n), v);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = -5; k <= 0; k++) {
    const key = addPeriods(currentKey, k);
    const r = periodRange(key, state.settings.startDay);
    if (k > -5) await setFixedPaid(mutuo.id, key, k < 0);
    const days = k === 0 ? 14 : 28;
    for (let d = 0; d < days; d += 1 + Math.floor(rnd() * 3)) {
      const date = addDays(r.start, d);
      const pick = rnd();
      const [n, lo, hi] = pick < 0.55 ? ['Spesa cibo', 1500, 9000] : pick < 0.7 ? ['Cene', 2500, 6000] : pick < 0.8 ? ['Spese personali', 800, 3000] : pick < 0.88 ? ['Spese casa', 1000, 5000] : ['Vestiti', 2000, 7000];
      await addMovement({ date, amount: Math.round((lo + rnd() * (hi - lo)) / 10) * 10, categoryId: cat(n), note: '' });
    }
  }
}
const setFixedPaid = (id, key, v) => setPaid(id, key, v);
