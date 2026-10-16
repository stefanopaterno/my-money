// Tab "Prospetto": prospetto entrate/uscite del periodo + cronologia (passati, corrente, futuri previsti).
import { h, backBtn } from '../ui.js';
import { state } from '../store.js';
import { ctx, periodBar, catById, currentKey, defaultDateFor } from '../ctx.js';
import { partials, projection, inheritedBudget, fixedStatus } from '../calc.js';
import { formatEUR, formatShort } from '../money.js';
import { addPeriods, periodLabel, todayStr } from '../period.js';
import { barChart } from '../chart.js';
import { incomeForm, extraSheet } from '../forms.js';
import { fmtDate } from './dashboard.js';
import { cardIcon } from '../cardpick.js';
import { CARD_BANKS, CARD_CHARGE_DAY } from '../period.js';

export const prosp = { mode: 'periodo' };

export function renderProspetto() {
  const view = h('div', {}, h('h1', {}, 'Prospetto'),
    h('div', { class: 'seg', style: 'margin-bottom:10px' },
      h('button', { class: prosp.mode === 'periodo' ? 'on' : '', onclick: () => { prosp.mode = 'periodo'; ctx.rerender(); } }, 'Periodo'),
      h('button', { class: prosp.mode === 'cronologia' ? 'on' : '', onclick: () => { prosp.mode = 'cronologia'; ctx.rerender(); } }, 'Cronologia')));
  view.append(prosp.mode === 'cronologia' ? cronologia() : periodo());
  return view;
}

const line = (label, value, cls = '', sub) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'ell' }, label), sub && h('div', { class: 'small muted' }, sub)), h('b', { class: 'num ' + cls }, value));

/** Blocco "parziali" del mese corrente: incassato / sostenuto / previsto a fine periodo. */
export function partialsCard(key) {
  const p = partials(state, key, todayStr());
  const pct = (a, b) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);
  return h('div', { class: 'card pad' },
    h('div', { class: 'cap-row' }, h('span', {}, '💶 Entrate'), h('b', { class: 'num pos' }, formatShort(p.incomeIn), h('span', { class: 'muted small' }, ` / ${formatShort(p.income)}`))),
    h('div', { class: 'bar' }, h('i', { style: `width:${pct(p.incomeIn, p.income)}%` })),
    h('div', { class: 'small muted', style: 'margin:4px 0 14px' }, `Incassate ${formatEUR(p.incomeIn)} · ancora da incassare ${formatEUR(p.incomeLater)}`),
    h('div', { class: 'cap-row' }, h('span', {}, '💸 Uscite'), h('b', { class: 'num' }, formatShort(p.spent), h('span', { class: 'muted small' }, ` / ${formatShort(p.expectedOut)} previste`))),
    h('div', { class: 'bar' }, h('i', { class: p.expectedOut && p.spent / p.expectedOut > 0.8 ? 'o' : '', style: `width:${pct(p.spent, p.expectedOut)}%` })),
    h('div', { class: 'small muted', style: 'margin-top:4px' }, `Sostenute ${formatEUR(p.spent)} (fisse pagate ${formatEUR(p.fixedPaid)} + variabili ${formatEUR(p.variableTotal)})`),
    h('div', { class: 'small muted' }, `Ancora: fisse da pagare ${formatEUR(p.fixedDue)} · budget residuo ${formatEUR(p.budgetLeft)}`),
    h('div', { class: 'forecast' }, h('span', {}, 'Saldo previsto a fine periodo'), h('b', { class: 'num ' + (p.forecastBalance < 0 ? 'neg' : 'pos') }, formatEUR(p.forecastBalance))));
}

/** Carte di credito: addebitato in questo periodo / da addebitare nel prossimo, per banca. Null se non c'è nulla. */
export function cardsCard(key) {
  const p = partials(state, key, todayStr());
  const sum = (o) => CARD_BANKS.reduce((t, b) => t + (o[b] || 0), 0);
  if (!sum(p.cardCharged) && !sum(p.cardNext)) return null;
  const block = (title, sub, o) => sum(o) > 0 && [
    h('div', { class: 'row' }, cardIcon(), h('div', { class: 'grow' }, h('b', {}, title), h('div', { class: 'small muted' }, sub)), h('b', { class: 'num' }, formatEUR(sum(o)))),
    CARD_BANKS.filter((b) => o[b]).map((b) => h('div', { class: 'row sub' }, h('span', { class: 'grow muted' }, b), h('span', { class: 'num' }, formatEUR(o[b]))))];
  return h('div', { class: 'card' },
    block('Addebitato in questo periodo', `Acquisti con carta, addebito il ${CARD_CHARGE_DAY}`, p.cardCharged),
    block('Da addebitare nel prossimo periodo', `Acquisti fatti ora, addebito il ${CARD_CHARGE_DAY} del mese dopo`, p.cardNext));
}

function periodo() {
  const key = ctx.period, cur = currentKey();
  const p = partials(state, key, todayStr());
  const box = h('div', {}, h('div', { style: 'margin:-4px 0 0 -8px' }, backBtn(() => { prosp.mode = 'cronologia'; ctx.rerender(); }, 'Cronologia')), periodBar());
  if (key === cur) box.append(h('h2', { style: 'margin-top:6px' }, 'Parziali di oggi'), partialsCard(key));

  const addIn = () => incomeForm(null, defaultDateFor(key), ctx.rerender);
  box.append(h('h2', {}, 'Entrate'), h('div', { class: 'card' },
    line('Stipendio', formatEUR(p.salary), 'pos'),
    p.extras.map((i) => h('button', { class: 'row', onclick: () => incomeForm(i, null, ctx.rerender) }, h('div', { class: 'grow' }, i.description, h('div', { class: 'small muted' }, fmtDate(i.date))), h('b', { class: 'num pos' }, '+' + formatEUR(i.amount)))),
    h('button', { class: 'row addrow', onclick: addIn }, '＋ Aggiungi entrata extra'),
    line('Totale entrate', formatEUR(p.income), 'pos tot')));

  box.append(h('h2', {}, 'Spese fisse'), h('div', { class: 'card' },
    p.fixedItems.length ? p.fixedItems.map((x) => line(x.fixed.name, formatEUR(x.amount), x.paid ? 'muted' : '', fixedStatus(x, todayStr()).text)) : h('div', { class: 'empty', style: 'padding:14px' }, 'Nessuna spesa fissa attiva'),
    line('Totale fisse', formatEUR(p.fixedTotal), 'tot')));

  const cats = [...state.categories.filter((c) => !c.archived || p.byCat[c.id])];
  box.append(h('h2', {}, 'Spese variabili'), h('div', { class: 'card' },
    cats.map((c) => { const b = inheritedBudget(state.periods, key, c.id), sp = p.byCat[c.id] || 0; return line(`${c.emoji} ${c.name}`, formatEUR(sp), sp > b && b ? 'neg' : '', b ? `budget ${formatEUR(b)}` : undefined); }),
    line('Totale variabili', formatEUR(p.variableTotal), 'tot')));

  const cc = cardsCard(key); if (cc) box.append(h('h2', {}, 'Carte di credito'), cc);
  box.append(h('div', { class: 'card', style: 'margin-top:12px' },
    line('Entrate', formatEUR(p.income), 'pos'), line('Uscite (fisse + variabili)', formatEUR(p.fixedTotal + p.variableTotal)),
    line('Saldo del periodo', formatEUR(p.balance), (p.balance < 0 ? 'neg' : 'pos') + ' tot')),
    h('button', { class: 'btn-primary', onclick: () => extraSheet('in', defaultDateFor(key), ctx.rerender) }, '＋ Voce extra del mese'));
  return box;
}

function cronologia() {
  const cur = currentKey();
  const keys = [];
  for (let i = -5; i <= 12; i++) keys.push(addPeriods(cur, i));
  const open = (k) => { ctx.period = k; prosp.mode = 'periodo'; ctx.keepScroll = false; ctx.rerender(); ctx.keepScroll = true; };
  const box = h('div', {},
    h('div', { class: 'small muted', style: 'margin:0 4px 8px' }, 'I periodi futuri sono una previsione: stipendio standard, spese fisse attive e budget delle categorie.'),
    h('div', { class: 'card pad', style: 'padding-bottom:4px' },
      barChart(keys.slice(2, 14), ctx.period, open),
      h('div', { class: 'legend' },
        h('span', {}, h('i', { style: 'background:var(--muted)' }), 'Fisse'), h('span', {}, h('i', { style: 'background:var(--blue)' }), 'Variabili'),
        h('span', {}, h('i', { style: 'background:var(--green);height:3px;vertical-align:3px' }), 'Entrate'), h('span', {}, 'Chiare = previste'))));
  const list = h('div', { class: 'card' });
  let curRow;
  for (const k of keys) {
    const p = projection(state, k, cur);
    const row = h('button', { class: 'row hist' + (k === cur ? ' now' : ''), onclick: () => open(k) },
      h('div', { class: 'grow' },
        h('div', {}, periodLabel(k, state.settings.startDay)),
        h('div', { class: 'small muted' }, k === cur ? 'Periodo corrente' : p.future ? 'Previsto' : 'Concluso', ` · entrate ${formatShort(p.income)} · uscite ${formatShort(p.out)}`)),
      h('b', { class: 'num ' + (p.balance < 0 ? 'neg' : 'pos') }, (p.balance > 0 ? '+' : '') + formatShort(p.balance)), h('span', { class: 'muted' }, '›'));
    if (k === cur) curRow = row;
    list.append(row);
  }
  box.append(h('h2', {}, 'Cronologia'), list);
  requestAnimationFrame(() => curRow && curRow.scrollIntoView({ block: 'center' }));
  return box;
}
