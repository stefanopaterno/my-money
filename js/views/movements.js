import { h } from '../ui.js';
import { state } from '../store.js';
import { ctx, periodBar, catById } from '../ctx.js';
import { periodSummary, effDate } from '../calc.js';
import { cardNote, cardIcon } from '../cardpick.js';
import { fmtDMY } from '../period.js';
import { formatEUR } from '../money.js';
import { editMovement, incomeForm } from '../forms.js';
import { fmtDate } from './dashboard.js';

let filter = null;

export function renderMovements() {
  const s = periodSummary(state, ctx.period);
  const view = h('div', {}, h('h1', {}, 'Movimenti'), periodBar());
  const used = [...new Set(s.movements.map((m) => m.categoryId))];
  if (filter && !used.includes(filter)) filter = null;
  if (used.length > 1) {
    view.append(h('div', { class: 'chips', style: 'margin:0 -16px;padding:4px 16px 10px' },
      h('button', { class: 'chip' + (!filter ? ' on' : ''), onclick: () => { filter = null; ctx.rerender(); } }, 'Tutte'),
      used.map((id) => { const c = catById(id); return h('button', { class: 'chip' + (filter === id ? ' on' : ''), onclick: () => { filter = id; ctx.rerender(); } }, c.emoji, ' ', c.name); })));
  }
  const rows = [
    ...s.movements.filter((m) => !filter || m.categoryId === filter).map((m) => ({ type: 'm', date: effDate(m), m })),
    ...(filter ? [] : s.extras.map((i) => ({ type: 'i', date: i.date, i }))),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!rows.length) { view.append(h('div', { class: 'empty' }, 'Nessun movimento in questo periodo.', h('br'), 'Tocca + per aggiungerne uno.')); return view; }
  const total = rows.filter((r) => r.type === 'm').reduce((t, r) => t + r.m.amount, 0);
  view.append(h('div', { class: 'small muted', style: 'margin:0 4px 6px' }, `Speso: ${formatEUR(total)}`));
  let day = null, card = null;
  for (const r of rows) {
    if (r.date !== day) { day = r.date; view.append(h('h2', {}, fmtDate(day))); card = h('div', { class: 'card' }); view.append(card); }
    if (r.type === 'm') {
      const c = catById(r.m.categoryId);
      card.append(h('button', { class: 'row', onclick: () => editMovement(r.m, ctx.rerender) },
        h('div', { class: 'emo', style: `background:${c.color}22` }, c.emoji),
        h('div', { class: 'grow' }, h('div', { class: 'ell' }, c.name), r.m.note && h('div', { class: 'small muted ell' }, r.m.note),
          r.m.card && h('div', { class: 'small cardtag' }, cardIcon(), cardNote(r.m))),
        h('b', { class: 'num' }, formatEUR(r.m.amount))));
    } else {
      card.append(h('button', { class: 'row', onclick: () => incomeForm(r.i, null, ctx.rerender) },
        h('div', { class: 'emo', style: 'background:#34c75922' }, '💶'),
        h('div', { class: 'grow ell' }, r.i.description),
        h('b', { class: 'num pos' }, '+' + formatEUR(r.i.amount))));
    }
  }
  return view;
}
