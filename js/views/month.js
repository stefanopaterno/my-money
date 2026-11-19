// "Il mese": visione d'insieme del periodo in tre aree colorate (fisse · previsionali · altre variabili).
import { h, openSheet, haptic, toast } from '../ui.js';
import { state, addCategory, addPlanned, updatePlanned, deletePlanned } from '../store.js';
import { ctx } from '../ctx.js';
import { monthPlan, fixedStatus } from '../calc.js';
import { formatEUR, formatShort, parseAmount, centsToInput } from '../money.js';
import { todayStr, periodRange, addPeriods, addDays, diffDays, fmtDMY } from '../period.js';
import { paySheet, togglePaid } from './fixed.js';

const COLORS = ['#34c759', '#ff9500', '#ff3b30', '#af52de', '#5856d6', '#30b0c7', '#ffcc00', '#007aff'];

/** `openCategory(cat, key)` apre il dettaglio/budget di una categoria (passato da chi chiama per evitare import circolari). */
export function monthOverview(key, openCategory) {
  const p = monthPlan(state, key), s = p.summary, today = todayStr();
  const box = h('div', {});

  // ---- barra riassuntiva: come si divide lo stipendio ----
  const free = s.income - p.committed;
  const parts = [
    ['fix', 'Fisse', s.fixedTotal], ['plan', 'Previsionali', p.plannedCommitted], ['var', 'Altre', p.otherSpent], ['free', free < 0 ? 'Oltre' : 'Libero', Math.max(0, free)]];
  const base = Math.max(s.income, p.committed) || 1;
  box.append(h('div', { class: 'card pad' },
    h('div', { class: 'cap-row' }, h('span', {}, 'Impegnato'), h('b', { class: 'num' }, formatEUR(p.committed), h('span', { class: 'muted small' }, ` / ${formatShort(s.income)} entrate`))),
    h('div', { class: 'stack' }, parts.filter((x) => x[2] > 0).map(([c, , v]) => h('i', { class: c, style: `width:${(v / base) * 100}%` }))),
    h('div', { class: 'legend', style: 'flex-wrap:wrap;padding:8px 0 0' }, parts.map(([c, l, v]) => h('span', {}, h('i', { class: 'dot ' + c }), `${l} ${formatShort(v)}`))),
    h('div', { class: 'forecast' }, h('span', {}, 'Saldo previsto a fine periodo'), h('b', { class: 'num ' + (p.forecastBalance < 0 ? 'neg' : 'pos') }, formatEUR(p.forecastBalance)))));

  // ---- area 1: spese fisse con interruttore ----
  const due = s.fixedTotal - s.fixedPaid;
  const fixCard = h('div', { class: 'card area fix' });
  fixCard.append(areaHead('Spese fisse', `pagate ${formatShort(s.fixedPaid)} / ${formatShort(s.fixedTotal)}`, due > 0 ? `da pagare ${formatEUR(due)}` : 'tutto pagato', due > 0 ? 'warn' : 'pos'));
  if (!s.fixedItems.length) fixCard.append(h('div', { class: 'empty', style: 'padding:14px' }, 'Nessuna spesa fissa attiva'));
  for (const x of s.fixedItems) {
    const st = fixedStatus(x, today);
    fixCard.append(h('div', { class: 'row fx' },
      h('button', { class: 'fxmain grow', onclick: () => paySheet(x, key) },
        h('div', { class: 'ell ' + (x.paid ? 'muted' : '') }, x.fixed.name), h('div', { class: 'small ' + st.cls }, st.text)),
      h('b', { class: 'num ' + (x.paid ? 'muted' : '') }, formatEUR(x.amount)),
      h('button', { class: 'swbtn', role: 'switch', 'aria-checked': x.paid, 'aria-label': 'Pagata', onclick: async () => { haptic(); await togglePaid(x, key); } },
        h('span', { class: 'sw' + (x.paid ? ' on' : '') }))));
  }
  box.append(fixCard);

  // ---- area 2: previsionali che diventano consuntivi ----
  const r0 = s.range;
  const planCard = h('div', { class: 'card area plan' });
  const rest = Math.max(0, p.plannedBudget - p.plannedSpent);
  planCard.append(areaHead('Previsionali', `speso ${formatShort(p.plannedSpent)} / ${formatShort(p.plannedBudget)}`, `restano ${formatEUR(rest)}`, ''));
  for (const x of p.planned) {
    const pct = Math.min(100, (x.spent / x.budget) * 100), cls = x.over > 0 ? 'r' : pct > 80 ? 'o' : '';
    planCard.append(h('button', { class: 'row', style: 'align-items:stretch', onclick: () => openCategory(x.cat, key) },
      h('div', { class: 'emo', style: `background:${x.cat.color}22;align-self:center` }, x.cat.emoji),
      h('div', { class: 'grow' },
        h('div', { style: 'display:flex;justify-content:space-between;gap:8px' },
          h('span', { class: 'ell' }, x.cat.name),
          h('span', { class: 'num' }, formatShort(x.spent), h('span', { class: 'muted small' }, ` / ${formatShort(x.budget)}`))),
        h('div', { class: 'bar' }, h('i', { class: cls, style: `width:${pct}%` })),
        h('div', { class: 'small ' + (x.over > 0 ? 'neg' : 'muted') }, x.over > 0 ? `sforato di ${formatEUR(x.over)}` : x.spent === 0 ? 'previsto, non ancora speso' : `restano ${formatEUR(x.left)}`))));
  }
  if (!p.planned.length) planCard.append(h('div', { class: 'empty', style: 'padding:14px' }, 'Nessuna previsione. Aggiungi cibo, ricarica auto… con data a fine periodo.'));
  planCard.append(h('button', { class: 'row addrow', onclick: () => plannedForm(null, key, null, ctx.rerender) }, '＋ Nuova previsione'));
  if (!state.planned.some((x) => x.date >= r0.start && x.date < r0.endExcl) && state.planned.some((x) => { const pr = periodRange(addPeriods(key, -1), state.settings.startDay); return x.date >= pr.start && x.date < pr.endExcl; }))
    planCard.append(h('button', { class: 'row addrow', onclick: async () => { const n = await copyFromPrevious(key); toast(`${n} previsioni copiate dal periodo precedente`, { ms: 2500 }); ctx.rerender(); } }, '⧉ Copia previsioni dal periodo precedente'));
  box.append(planCard);

  // ---- area 3: altre variabili (senza previsione) ----
  if (p.other.length) {
    const varCard = h('div', { class: 'card area var' });
    varCard.append(areaHead('Altre variabili', `speso ${formatShort(p.otherSpent)}`, 'senza previsione', 'muted'));
    for (const x of p.other) {
      varCard.append(h('button', { class: 'row', onclick: () => openCategory(x.cat, key) },
        h('div', { class: 'emo', style: `background:${x.cat.color}22` }, x.cat.emoji),
        h('div', { class: 'grow ell' }, x.cat.name), h('b', { class: 'num' }, formatEUR(x.spent))));
    }
    box.append(varCard);
  }
  return box;
}

const areaHead = (title, left, right, rightCls) => h('div', { class: 'ahead' },
  h('b', {}, title), h('span', { class: 'small muted grow' }, left), h('span', { class: 'small num ' + rightCls }, right));

/**
 * Form di una previsione con data (nuova o esistente). Il periodo si ricava dalla data:
 * di norma l'ultimo giorno del periodo (26), così la previsione pesa su quel mese.
 */
export function plannedForm(item, key, catId, onDone) {
  const r = periodRange(key, state.settings.startDay);
  const cats = state.categories.filter((c) => !c.archived);
  const NEW = '__new';
  const sel = h('select', {}, cats.map((c) => h('option', { value: c.id }, `${c.emoji} ${c.name}`)), h('option', { value: NEW }, '＋ Nuova categoria…'));
  sel.value = item ? item.categoryId : (catId || (cats[0] && cats[0].id));
  const newName = h('input', { type: 'text', placeholder: 'Nome (es. Ricarica auto)' });
  const nameField = h('div', { class: 'field', hidden: true }, h('label', {}, 'Nome'), newName);
  sel.addEventListener('change', () => { nameField.hidden = sel.value !== NEW; if (!nameField.hidden) newName.focus(); });
  const amount = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00', value: item ? centsToInput(item.amount) : '', style: 'font-size:28px;font-weight:700' });
  const date = h('input', { type: 'date', value: item ? item.date : r.endIncl });
  const note = h('input', { type: 'text', placeholder: 'Facoltativa', value: item ? item.note : '' });
  const hint = h('div', { class: 'small muted', style: 'margin:6px 4px' }, `Di solito l'ultimo giorno del periodo (${fmtDMY(r.endIncl)}). La data decide in quale periodo pesa.`);
  const s = openSheet({ title: item ? 'Previsione' : 'Nuova previsione', content: [
    h('div', { class: 'card' },
      h('div', { class: 'field', style: 'min-height:64px' }, h('label', {}, 'Importo €'), amount),
      h('div', { class: 'field' }, h('label', {}, 'Categoria'), sel), nameField,
      h('div', { class: 'field' }, h('label', {}, 'Data'), date),
      h('div', { class: 'field' }, h('label', {}, 'Nota'), note)),
    hint,
    h('button', { class: 'btn-primary', onclick: async () => {
      const c = parseAmount(amount.value);
      if (!c || Number.isNaN(c) || c <= 0 || !date.value) { amount.focus(); haptic(true); return; }
      let categoryId = sel.value;
      if (categoryId === NEW) {
        const n = newName.value.trim(); if (!n) { newName.focus(); return; }
        const ex = state.categories.find((x) => !x.archived && x.name.trim().toLowerCase() === n.toLowerCase());
        categoryId = (ex || await addCategory({ name: n, emoji: '🏷️', color: COLORS[state.categories.length % COLORS.length] })).id;
      }
      const data = { date: date.value, amount: c, categoryId, note: note.value.trim() };
      if (item) await updatePlanned(item.id, data); else await addPlanned(data);
      haptic(true); s.close(); onDone && onDone();
    } }, 'Salva'),
    item && h('button', { class: 'btn-danger', onclick: async () => { await deletePlanned(item.id); s.close(); onDone && onDone(); } }, 'Elimina previsione')] });
  setTimeout(() => amount.focus(), 350);
}

/** Copia nel periodo le previsioni di quello precedente, spostate di un mese sulla stessa posizione. */
async function copyFromPrevious(key) {
  const prev = addPeriods(key, -1), pr = periodRange(prev, state.settings.startDay), r = periodRange(key, state.settings.startDay);
  const items = state.planned.filter((x) => x.date >= pr.start && x.date < pr.endExcl);
  for (const x of items) {
    const off = Math.min(diffDays(pr.start, x.date), diffDays(r.start, r.endIncl));
    await addPlanned({ date: addDays(r.start, off), amount: x.amount, categoryId: x.categoryId, note: x.note });
  }
  return items.length;
}
