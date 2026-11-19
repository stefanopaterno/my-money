// Calcoli puri sullo stato (nessun accesso a DB/DOM): facili da testare.
import { periodRange, inPeriod, addPeriods, chargeDate, CARD_BANKS, dueDateFor, fmtDMY } from './period.js';

/** Data in cui l'importo pesa sul conto: per le carte è l'addebito, altrimenti la data stessa. */
export const effDate = (m) => (m.card ? chargeDate(m.date) : m.date);

/** Versione della spesa fissa valida nel periodo `key` (l'ultima con from <= key), o null se non ancora esistente. */
export function fixedVersionAt(fixed, key) {
  let found = null;
  for (const v of fixed.versions) if (v.from <= key && (!found || v.from >= found.from)) found = v;
  return found;
}

/** Importo in centesimi se la spesa è attiva nel periodo, altrimenti null. */
export function fixedAmountAt(fixed, key) {
  const v = fixedVersionAt(fixed, key);
  return v && v.active ? v.amount : null;
}

/** Aggiunge/sostituisce la versione che parte da `from` (modifica immutabile). */
export function withVersion(fixed, from, { active, amount }) {
  const rest = fixed.versions.filter((v) => v.from !== from);
  const prev = fixedVersionAt({ versions: rest }, from);
  const v = { from, active, amount: amount ?? prev?.amount ?? 0 };
  return { ...fixed, versions: [...rest, v].sort((a, b) => (a.from < b.from ? -1 : 1)) };
}

/** Valore ereditato da un periodo precedente (budget per categoria). */
export function inheritedBudget(periods, key, catId) {
  let best = null;
  for (const p of periods) {
    if (p.key <= key && p.budgets && p.budgets[catId] !== undefined && (!best || p.key > best.key)) best = p;
  }
  return best ? best.budgets[catId] : 0;
}

export function salaryFor(periods, key, defaultCents) {
  const p = periods.find((x) => x.key === key);
  return p && p.salary !== undefined && p.salary !== null ? p.salary : defaultCents;
}

export function periodSummary(state, key) {
  const startDay = state.settings.startDay;
  const r = periodRange(key, startDay);
  const within = (d) => d >= r.start && d < r.endExcl;

  const salary = salaryFor(state.periods, key, state.settings.salaryDefault);
  const extras = state.incomes.filter((i) => within(i.date));
  const extraTotal = extras.reduce((s, i) => s + i.amount, 0);

  const fixedItems = [];
  for (const f of state.fixed) {
    const amount = fixedAmountAt(f, key);
    if (amount === null) continue;
    const rec = state.paid[`${f.id}|${key}`];
    fixedItems.push({ fixed: f, amount, paid: !!rec, paidDate: (rec && rec.date) || null, dueDate: dueDateFor(key, startDay, f.dueDay) });
  }
  // ordine per scadenza (senza data in fondo)
  fixedItems.sort((a, b) => (a.dueDate && b.dueDate ? (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) : a.dueDate ? -1 : b.dueDate ? 1 : 0));
  const fixedTotal = fixedItems.reduce((s, x) => s + x.amount, 0);
  const fixedPaid = fixedItems.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0);

  const movements = state.movements.filter((m) => within(effDate(m)));
  // carte: addebitate in questo periodo (anche da acquisti precedenti) e acquisti di questo periodo addebitati dopo
  const cardCharged = {}, cardNext = {};
  for (const b of CARD_BANKS) { cardCharged[b] = 0; cardNext[b] = 0; }
  for (const m of movements) if (m.card) cardCharged[m.card] = (cardCharged[m.card] || 0) + m.amount;
  for (const m of state.movements) {
    if (m.card && within(m.date) && effDate(m) >= r.endExcl) cardNext[m.card] = (cardNext[m.card] || 0) + m.amount;
  }
  const byCat = {};
  for (const m of movements) byCat[m.categoryId] = (byCat[m.categoryId] || 0) + m.amount;
  const variableTotal = movements.reduce((s, m) => s + m.amount, 0);

  const income = salary + extraTotal;
  return {
    key, range: r, salary, extras, extraTotal, income,
    fixedItems, fixedTotal, fixedPaid,
    movements, byCat, variableTotal, cardCharged, cardNext,
    balance: income - fixedTotal - variableTotal,
  };
}

export { inPeriod };

/** Somma dei budget delle categorie attive nel periodo. */
export function budgetSum(state, key) {
  return state.categories.filter((c) => !c.archived).reduce((s, c) => s + inheritedBudget(state.periods, key, c.id), 0);
}

/** Parziali del periodo rispetto a `today`: incassato/da incassare, sostenuto/da sostenere, saldo previsto a fine periodo. */
export function partials(state, key, today) {
  const s = periodSummary(state, key);
  const salaryIn = today >= s.range.start ? s.salary : 0;
  const extraIn = s.extras.filter((i) => i.date <= today).reduce((t, i) => t + i.amount, 0);
  const incomeIn = salaryIn + extraIn;
  const spent = s.fixedPaid + s.variableTotal;
  const fixedDue = s.fixedTotal - s.fixedPaid;
  const budgetLeft = state.categories.filter((c) => !c.archived)
    .reduce((t, c) => t + Math.max(0, inheritedBudget(state.periods, key, c.id) - (s.byCat[c.id] || 0)), 0);
  return {
    ...s, incomeIn, incomeLater: s.income - incomeIn, spent, fixedDue, budgetLeft,
    expectedOut: spent + fixedDue + budgetLeft,
    forecastBalance: s.income - spent - fixedDue - budgetLeft,
  };
}

/** Entrate/uscite del periodo: consuntivo se passato, previsione (fisse + max(speso, budget)) se corrente o futuro. */
export function projection(state, key, curKey) {
  const s = periodSummary(state, key);
  const forecast = key >= curKey;
  const variable = forecast ? Math.max(s.variableTotal, budgetSum(state, key)) : s.variableTotal;
  return { key, income: s.income, fixed: s.fixedTotal, variable, out: s.fixedTotal + variable, balance: s.income - s.fixedTotal - variable, forecast, future: key > curKey };
}

/** Come withVersion, ma vale solo per `key`: dal periodo dopo torna lo stato precedente (se non c'è già una versione lì). */
export function withVersionOnly(fixed, key, patch) {
  const next = addPeriods(key, 1);
  const prev = fixedVersionAt(fixed, key);
  let f = withVersion(fixed, key, patch);
  if (prev && !fixed.versions.some((v) => v.from === next)) f = withVersion(f, next, { active: prev.active, amount: prev.amount });
  return f;
}

/** Testo di stato di una spesa fissa: "Pagata il 27/09" / "Scade il 17/10" / "Scaduta il 17/10" / "Da pagare". */
export function fixedStatus(x, today) {
  const dm = (d) => fmtDMY(d).slice(0, 5);
  if (x.paid) return { text: x.paidDate ? `Pagata il ${dm(x.paidDate)}` : 'Pagata', cls: 'pos' };
  if (x.dueDate) return x.dueDate < today ? { text: `Scaduta il ${dm(x.dueDate)}`, cls: 'warn' } : { text: `Scade il ${dm(x.dueDate)}`, cls: 'muted' };
  return { text: 'Da pagare', cls: 'muted' };
}

/**
 * Visione d'insieme del periodo in tre aree:
 *  - fisse (pagate / da pagare)
 *  - previsionali: categorie con budget > 0; il previsto si "consuma" man mano che si spende
 *  - altre variabili: spese in categorie senza budget
 * `committed` = quanto il periodo impegna: fisse + max(speso, previsto) per ogni previsionale + altre variabili.
 */
export function monthPlan(state, key) {
  const s = periodSummary(state, key);
  // previsioni con data dentro il periodo; se una categoria non ne ha, vale il budget ereditato (dati storici)
  const items = (state.planned || []).filter((x) => x.date >= s.range.start && x.date < s.range.endExcl);
  const cats = state.categories.filter((c) => !c.archived || s.byCat[c.id] || items.some((x) => x.categoryId === c.id));
  const planned = [], other = [];
  for (const c of cats) {
    const spent = s.byCat[c.id] || 0;
    const its = items.filter((x) => x.categoryId === c.id).sort((a, b) => (a.date < b.date ? -1 : 1));
    const budget = its.length ? its.reduce((t, x) => t + x.amount, 0) : inheritedBudget(state.periods, key, c.id);
    if (budget > 0) planned.push({ cat: c, spent, budget, items: its, left: budget - spent, over: Math.max(0, spent - budget) });
    else if (spent > 0) other.push({ cat: c, spent });
  }
  // movimenti in categorie ormai inesistenti
  for (const id of Object.keys(s.byCat)) {
    if (!cats.some((c) => c.id === id) && s.byCat[id] > 0) other.push({ cat: { id, name: 'Categoria eliminata', emoji: '❔', color: '#8e8e93' }, spent: s.byCat[id] });
  }
  const plannedBudget = planned.reduce((t, p) => t + p.budget, 0);
  const plannedSpent = planned.reduce((t, p) => t + p.spent, 0);
  const plannedCommitted = planned.reduce((t, p) => t + Math.max(p.spent, p.budget), 0);
  const otherSpent = other.reduce((t, p) => t + p.spent, 0);
  const committed = s.fixedTotal + plannedCommitted + otherSpent;
  return {
    summary: s, planned, other, plannedBudget, plannedSpent, plannedCommitted, otherSpent,
    committed, forecastBalance: s.income - committed,
  };
}
