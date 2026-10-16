import test from 'node:test';
import assert from 'node:assert/strict';
import {
  periodKeyForDate, periodRange, periodLabel, chargeDate, addPeriods, daysLeft, diffDays, addDays, clampStartDay, inPeriod,
} from '../js/period.js';
import { formatEUR, parseAmount, keypadPress, keypadToCents } from '../js/money.js';
import { fixedAmountAt, withVersion, inheritedBudget, periodSummary, partials, projection, budgetSum, withVersionOnly } from '../js/calc.js';
import { migrate, validate, SCHEMA_VERSION } from '../js/migrate.js';

test('il giorno 27 apre un nuovo periodo, il 26 chiude il precedente', () => {
  assert.equal(periodKeyForDate('2026-10-27'), '2026-10');
  assert.equal(periodKeyForDate('2026-10-26'), '2026-09');
  assert.equal(periodKeyForDate('2026-11-26'), '2026-10');
  assert.equal(periodKeyForDate('2026-11-27'), '2026-11');
  assert.equal(periodKeyForDate('2026-10-01'), '2026-09');
});

test('range e label: 27 ott – 26 nov 2026', () => {
  assert.deepEqual(periodRange('2026-10'), { start: '2026-10-27', endExcl: '2026-11-27', endIncl: '2026-11-26' });
  assert.equal(periodLabel('2026-10'), '27 ott – 26 nov 2026');
});

test('cambio d\'anno: 27 dic → 26 gen', () => {
  assert.deepEqual(periodRange('2026-12'), { start: '2026-12-27', endExcl: '2027-01-27', endIncl: '2027-01-26' });
  assert.equal(periodLabel('2026-12'), '27 dic 2026 – 26 gen 2027');
  assert.equal(periodKeyForDate('2027-01-26'), '2026-12');
  assert.equal(periodKeyForDate('2027-01-27'), '2027-01');
  assert.equal(periodKeyForDate('2026-12-31'), '2026-12');
  assert.equal(addPeriods('2026-12', 1), '2027-01');
  assert.equal(addPeriods('2027-01', -1), '2026-12');
  assert.equal(addPeriods('2026-03', -15), '2024-12');
});

test('febbraio non bisestile (2027): 28 giorni di mese', () => {
  assert.equal(periodKeyForDate('2027-02-26'), '2027-01');
  assert.equal(periodKeyForDate('2027-02-27'), '2027-02');
  assert.equal(periodKeyForDate('2027-02-28'), '2027-02');
  assert.equal(periodKeyForDate('2027-03-01'), '2027-02');
  assert.deepEqual(periodRange('2027-01'), { start: '2027-01-27', endExcl: '2027-02-27', endIncl: '2027-02-26' });
  assert.equal(diffDays('2027-01-27', '2027-02-27'), 31);
  assert.equal(diffDays('2027-02-27', '2027-03-27'), 28);
});

test('anno bisestile (2028): 29 febbraio appartiene al periodo di febbraio', () => {
  assert.equal(periodKeyForDate('2028-02-29'), '2028-02');
  assert.equal(periodKeyForDate('2028-02-26'), '2028-01');
  assert.equal(periodRange('2028-02').endIncl, '2028-03-26');
  assert.equal(diffDays('2028-02-27', '2028-03-27'), 29);
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
});

test('giorno di inizio configurabile', () => {
  assert.equal(periodKeyForDate('2026-10-10', 10), '2026-10');
  assert.equal(periodKeyForDate('2026-10-09', 10), '2026-09');
  assert.equal(periodLabel('2026-10', 1), '1 ott – 31 ott 2026');
  assert.equal(clampStartDay(31), 28);
  assert.equal(clampStartDay(0), 1);
  assert.equal(clampStartDay('abc'), 27);
  // con giorno 28 febbraio esiste sempre
  assert.equal(periodRange('2027-02', 28).start, '2027-02-28');
});

test('ogni data appartiene a un solo periodo', () => {
  for (let d = '2027-12-01', i = 0; i < 800; d = addDays(d, 1), i++) {
    const k = periodKeyForDate(d);
    assert.ok(inPeriod(d, k));
    assert.ok(!inPeriod(d, addPeriods(k, 1)));
    assert.ok(!inPeriod(d, addPeriods(k, -1)));
  }
});

test('giorni mancanti al prossimo 27', () => {
  assert.equal(daysLeft('2026-10', '2026-10-27'), 31);
  assert.equal(daysLeft('2026-10', '2026-11-26'), 1);
  assert.equal(daysLeft('2026-10', '2026-11-27'), 0);
  assert.equal(daysLeft('2026-10', '2026-11-10'), 17);
  assert.equal(daysLeft('2026-11', '2026-10-16'), 30); // periodo futuro: lunghezza intera
});

test('importi: formato it-IT e parsing', () => {
  assert.equal(formatEUR(123456).replace(/\s/g, ' '), '1.234,56 €');
  assert.equal(formatEUR(1234).replace(/\s/g, ' '), '12,34 €');
  assert.equal(formatEUR(-500).replace(/\s/g, ' '), '-5,00 €');
  assert.equal(parseAmount('12,5'), 1250);
  assert.equal(parseAmount('12.50'), 1250);
  assert.equal(parseAmount('1.234,56'), 123456);
  assert.equal(parseAmount('0,10') + parseAmount('0,20'), 30); // niente 0.30000000000000004
  assert.ok(Number.isNaN(parseAmount('abc')));
  assert.ok(Number.isNaN(parseAmount('1,234')));
});

test('tastierino: regole di input', () => {
  const type = (s) => [...s].reduce((acc, k) => keypadPress(acc, k === '<' ? 'back' : k), '');
  assert.equal(type('1250'), '1250');
  assert.equal(type('12,505'), '12,50');
  assert.equal(type('12,,5'), '12,5');
  assert.equal(type(',5'), '0,5');
  assert.equal(type('007'), '7');
  assert.equal(type('12<<'), '');
  assert.equal(keypadToCents('12,5'), 1250);
  assert.equal(keypadToCents(''), 0);
});

const fx = (versions) => ({ id: 'f1', name: 'Mutuo', versions });

test('spesa fissa: disattivazione da un periodo, storico intatto', () => {
  let f = fx([{ from: '2026-01', active: true, amount: 80000 }]);
  f = withVersion(f, '2026-11', { active: false });
  assert.equal(fixedAmountAt(f, '2026-10'), 80000);
  assert.equal(fixedAmountAt(f, '2026-11'), null);
  assert.equal(fixedAmountAt(f, '2027-05'), null);
  assert.equal(fixedAmountAt(f, '2025-12'), null); // prima di validoDa
  // riattivazione da 2027-03
  f = withVersion(f, '2027-03', { active: true, amount: 82000 });
  assert.equal(fixedAmountAt(f, '2027-02'), null);
  assert.equal(fixedAmountAt(f, '2027-03'), 82000);
  assert.equal(fixedAmountAt(f, '2026-10'), 80000);
});

test('spesa fissa: cambio importo da un periodo in avanti', () => {
  let f = fx([{ from: '2026-01', active: true, amount: 80000 }]);
  f = withVersion(f, '2026-12', { active: true, amount: 85000 });
  assert.equal(fixedAmountAt(f, '2026-11'), 80000);
  assert.equal(fixedAmountAt(f, '2026-12'), 85000);
  assert.equal(fixedAmountAt(f, '2028-01'), 85000);
});

test('budget categoria ereditato dal periodo precedente', () => {
  const periods = [{ key: '2026-08', budgets: { c1: 30000 } }, { key: '2026-10', budgets: { c1: 35000 } }];
  assert.equal(inheritedBudget(periods, '2026-07', 'c1'), 0);
  assert.equal(inheritedBudget(periods, '2026-09', 'c1'), 30000);
  assert.equal(inheritedBudget(periods, '2026-10', 'c1'), 35000);
  assert.equal(inheritedBudget(periods, '2027-02', 'c1'), 35000);
  assert.equal(inheritedBudget(periods, '2027-02', 'c2'), 0);
});

test('riepilogo del periodo', () => {
  const state = {
    settings: { startDay: 27, salaryDefault: 200000 },
    periods: [{ key: '2026-10', salary: 210000 }],
    incomes: [{ id: 'i', date: '2026-11-05', amount: 5000 }, { id: 'j', date: '2026-11-27', amount: 9999 }],
    fixed: [fx([{ from: '2026-01', active: true, amount: 80000 }]), { id: 'f2', name: 'X', versions: [{ from: '2026-11', active: true, amount: 100 }] }],
    paid: { 'f1|2026-10': true },
    movements: [
      { id: 'a', date: '2026-10-27', amount: 1000, categoryId: 'c1' },
      { id: 'b', date: '2026-11-26', amount: 2500, categoryId: 'c1' },
      { id: 'c', date: '2026-11-27', amount: 7777, categoryId: 'c1' },
    ],
  };
  const s = periodSummary(state, '2026-10');
  assert.equal(s.income, 215000);
  assert.equal(s.fixedTotal, 80000);
  assert.equal(s.fixedPaid, 80000);
  assert.equal(s.variableTotal, 3500);
  assert.equal(s.balance, 215000 - 80000 - 3500);
  const s2 = periodSummary(state, '2026-11');
  assert.equal(s2.salary, 200000);
  assert.equal(s2.variableTotal, 7777);
  assert.equal(s2.fixedTotal, 80100);
});

test('migrazione schema', () => {
  const d = migrate({ movements: [], categories: [] });
  assert.equal(d.schemaVersion, SCHEMA_VERSION);
  assert.equal(d.settings.startDay, 27);
  assert.ok(Array.isArray(d.paid));
  validate(d);
  assert.throws(() => migrate({ schemaVersion: 999 }));
  assert.throws(() => validate({ ...d, movements: [{ id: 1, date: 'x', amount: 1.5 }] }));
});

test('parziali e proiezioni', () => {
  const state = {
    settings: { startDay: 27, salaryDefault: 200000 },
    categories: [{ id: 'c1', archived: false }, { id: 'c2', archived: false }, { id: 'c3', archived: true }],
    periods: [{ key: '2026-10', budgets: { c1: 30000, c2: 10000, c3: 5000 } }],
    incomes: [{ id: 'i', date: '2026-10-20', amount: 5000 }, { id: 'j', date: '2026-11-10', amount: 7000 }],
    fixed: [{ id: 'f1', versions: [{ from: '2026-01', active: true, amount: 80000 }] }, { id: 'f2', versions: [{ from: '2026-01', active: true, amount: 20000 }] }],
    paid: { 'f1|2026-10': true },
    movements: [{ id: 'a', date: '2026-10-28', amount: 12000, categoryId: 'c1' }, { id: 'b', date: '2026-11-01', amount: 15000, categoryId: 'c2' }],
  };
  assert.equal(budgetSum(state, '2026-10'), 40000); // archiviata esclusa
  const p = partials(state, '2026-10', '2026-11-05');
  assert.equal(p.incomeIn, 200000);       // stipendio; l'extra del 10/11 non è ancora arrivato
  assert.equal(p.incomeLater, 7000);
  assert.equal(p.spent, 80000 + 27000);
  assert.equal(p.fixedDue, 20000);
  assert.equal(p.budgetLeft, 18000);      // c1: 30000-12000, c2 sforata -> 0
  assert.equal(p.forecastBalance, 207000 - 107000 - 20000 - 18000);
  assert.equal(partials(state, '2026-10', '2026-10-20').incomeIn, 0); // periodo non ancora iniziato: niente stipendio
  const past = projection(state, '2026-10', '2026-12');
  assert.equal(past.forecast, false);
  assert.equal(past.out, 100000 + 27000);
  const fut = projection(state, '2026-11', '2026-10'); // futuro: fisse + budget ereditato
  assert.equal(fut.future, true);
  assert.equal(fut.variable, 40000);
  assert.equal(fut.income, 200000);
});

test('spesa fissa: spegnere/accendere solo per un periodo', () => {
  let f = { id: 'f', versions: [{ from: '2026-01', active: true, amount: 80000 }] };
  f = withVersionOnly(f, '2026-10', { active: false });
  assert.equal(fixedAmountAt(f, '2026-09'), 80000);
  assert.equal(fixedAmountAt(f, '2026-10'), null);
  assert.equal(fixedAmountAt(f, '2026-11'), 80000);
  assert.equal(fixedAmountAt(f, '2027-06'), 80000);
  // accensione una tantum di una voce spenta
  let g = { id: 'g', versions: [{ from: '2026-01', active: true, amount: 100 }, { from: '2026-06', active: false, amount: 100 }] };
  g = withVersionOnly(g, '2026-10', { active: true, amount: 100 });
  assert.equal(fixedAmountAt(g, '2026-09'), null);
  assert.equal(fixedAmountAt(g, '2026-10'), 100);
  assert.equal(fixedAmountAt(g, '2026-11'), null);
  // se esiste già una versione nel periodo dopo, non viene toccata
  let h = { id: 'h', versions: [{ from: '2026-01', active: true, amount: 100 }, { from: '2026-11', active: false, amount: 100 }] };
  h = withVersionOnly(h, '2026-10', { active: false });
  assert.equal(fixedAmountAt(h, '2026-10'), null);
  assert.equal(fixedAmountAt(h, '2026-11'), null);
  assert.equal(h.versions.length, 3);
});

test('privacy: importi mascherati, reveal li mostra', async () => {
  const m = await import('../js/money.js');
  m.setMasked(true);
  assert.equal(m.formatEUR(123456), '••••\u00a0€');
  assert.equal(m.formatShort(80000), '••••\u00a0€');
  assert.equal(m.formatEUR(123456, true).replace(/\s/g, ' '), '1.234,56 €');
  m.setMasked(false);
  assert.equal(m.formatEUR(100).replace(/\s/g, ' '), '1,00 €');
});

test('carta di credito: addebito il 10 del mese dopo, anche a cavallo d\'anno', () => {
  assert.equal(chargeDate('2026-10-16'), '2026-11-10');
  assert.equal(chargeDate('2026-12-31'), '2027-01-10');
  assert.equal(chargeDate('2027-01-31'), '2027-02-10');
});

test('carta di credito: l\'importo pesa nel periodo dell\'addebito', () => {
  const state = {
    settings: { startDay: 27, salaryDefault: 0 }, periods: [], incomes: [], fixed: [], paid: {},
    movements: [
      { id: 'a', date: '2026-10-16', amount: 10000, categoryId: 'c', card: 'ING' },     // periodo set, addebito 10/11 -> periodo ott
      { id: 'b', date: '2026-10-28', amount: 2000, categoryId: 'c', card: 'Fineco' },   // periodo ott, addebito 10/11 -> stesso periodo
      { id: 'c', date: '2026-11-05', amount: 500, categoryId: 'c', card: 'ING' },       // periodo ott, addebito 10/12 -> periodo nov
      { id: 'd', date: '2026-10-16', amount: 300, categoryId: 'c', card: null },
    ],
  };
  const set = periodSummary(state, '2026-09');
  assert.equal(set.variableTotal, 300);           // la carta non pesa ancora
  assert.equal(set.cardNext.ING, 10000);
  const ott = periodSummary(state, '2026-10');
  assert.equal(ott.variableTotal, 10000 + 2000);
  assert.equal(ott.cardCharged.ING, 10000);
  assert.equal(ott.cardCharged.Fineco, 2000);
  assert.equal(ott.cardNext.ING, 500);            // 05/11 addebitato il 10/12
  assert.equal(ott.cardNext.Fineco, 0);
  assert.equal(periodSummary(state, '2026-11').cardCharged.ING, 500);
});
