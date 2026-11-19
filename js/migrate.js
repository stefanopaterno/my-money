// Schema dei dati: ogni modifica futura aggiunge un passo in MIGRATIONS e incrementa SCHEMA_VERSION.
export const SCHEMA_VERSION = 2;

const MIGRATIONS = {
  // v0 (file senza versione) -> v1: riempie i campi mancanti.
  0: (d) => ({
    ...d,
    settings: { startDay: 27, salaryDefault: 0, ...(d.settings || {}) },
    categories: d.categories || [],
    movements: d.movements || [],
    incomes: d.incomes || [],
    fixed: d.fixed || [],
    periods: d.periods || [],
    paid: d.paid || [],
    schemaVersion: 1,
  }),
  // v1 -> v2: voci previste (previsionali) con data
  1: (d) => ({ ...d, planned: d.planned || [], schemaVersion: 2 }),
};

export function migrate(data) {
  if (!data || typeof data !== 'object') throw new Error('File non valido');
  let v = Number.isInteger(data.schemaVersion) ? data.schemaVersion : 0;
  if (v > SCHEMA_VERSION) throw new Error('File creato da una versione più recente dell\'app');
  let d = data;
  while (v < SCHEMA_VERSION) {
    d = MIGRATIONS[v](d);
    v = d.schemaVersion;
  }
  return d;
}

export function validate(d) {
  const arrays = ['categories', 'movements', 'incomes', 'fixed', 'periods', 'paid'];
  for (const k of arrays) if (!Array.isArray(d[k])) throw new Error(`Campo "${k}" mancante`);
  if (d.planned === undefined) d.planned = [];
  if (!Array.isArray(d.planned) || !d.planned.every((m) => m.id && /^\d{4}-\d{2}-\d{2}$/.test(m.date) && Number.isInteger(m.amount))) throw new Error('Previsionali non validi');
  const intOk = (n) => Number.isInteger(n);
  if (!d.movements.every((m) => m.id && /^\d{4}-\d{2}-\d{2}$/.test(m.date) && intOk(m.amount))) throw new Error('Movimenti non validi');
  if (!d.incomes.every((m) => m.id && /^\d{4}-\d{2}-\d{2}$/.test(m.date) && intOk(m.amount))) throw new Error('Entrate non valide');
  if (!d.fixed.every((f) => f.id && Array.isArray(f.versions))) throw new Error('Spese fisse non valide');
  return d;
}
