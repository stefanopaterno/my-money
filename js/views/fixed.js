import { h, fill, openSheet, askText, confirmSheet, haptic } from '../ui.js';
import { state, setPaid, addFixed, renameFixed, setFixedFrom, removeFixedVersion } from '../store.js';
import { ctx, periodBar } from '../ctx.js';
import { periodSummary, fixedVersionAt } from '../calc.js';
import { formatEUR, parseAmount, centsToInput } from '../money.js';
import { periodLabel, periodRange, parseKey, MESI } from '../period.js';

const from = (key) => { const { y, m } = parseKey(key); return `${MESI[m - 1]} ${y}`; };

export function renderFixed() {
  const key = ctx.period;
  const s = periodSummary(state, key);
  const view = h('div', {}, h('h1', {}, 'Spese fisse'), periodBar());
  view.append(h('div', { class: 'card' },
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Totale periodo'), h('b', { class: 'num' }, formatEUR(s.fixedTotal))),
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Già pagate'), h('b', { class: 'num pos' }, formatEUR(s.fixedPaid))),
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Da pagare'), h('b', { class: 'num ' + (s.fixedTotal - s.fixedPaid ? 'warn' : '') }, formatEUR(s.fixedTotal - s.fixedPaid)))));
  if (!s.fixedItems.length) {
    view.append(h('div', { class: 'empty' }, state.fixed.length ? 'Nessuna spesa fissa attiva in questo periodo.' : 'Non hai ancora spese fisse.', h('br'), 'Aggiungile da “Gestione spese fisse”.'));
  } else {
    view.append(h('h2', {}, 'In questo periodo'), h('div', { class: 'card' }, s.fixedItems.map((x) =>
      h('button', { class: 'row', 'aria-pressed': x.paid, onclick: async () => { haptic(); await setPaid(x.fixed.id, key, !x.paid); } },
        h('div', { class: 'grow' }, h('div', { class: x.paid ? 'muted' : '', style: x.paid ? 'text-decoration:line-through' : '' }, x.fixed.name), h('div', { class: 'small muted' }, x.paid ? 'Pagata' : 'Da pagare')),
        h('b', { class: 'num' }, formatEUR(x.amount)),
        h('span', { class: 'sw' + (x.paid ? ' on' : '') })))));
  }
  view.append(h('button', { class: 'btn-primary', onclick: () => manageSheet() }, 'Gestione spese fisse'));
  return view;
}

function manageSheet() {
  const s = openSheet({ title: 'Gestione spese fisse', full: true, onClose: ctx.rerender });
  const paint = () => {
    const key = ctx.period;
    const active = [], off = [];
    for (const f of state.fixed) { const v = fixedVersionAt(f, key); (v && v.active ? active : off).push({ f, v }); }
    fill(s.body, 
      h('div', { class: 'small muted', style: 'margin:4px 4px 8px' }, `Le modifiche valgono dal periodo ${periodLabel(key, state.settings.startDay)} in avanti. I periodi precedenti non cambiano.`),
      h('button', { class: 'btn-primary', style: 'margin-top:0', onclick: () => newFixed(paint) }, '+ Nuova spesa fissa'),
      active.length > 0 && [h('h2', {}, 'Attive'), h('div', { class: 'card' }, active.map(({ f, v }) => itemRow(f, `${formatEUR(v.amount)} / periodo`, paint)))],
      off.length > 0 && [h('h2', {}, 'Non attive in questo periodo'), h('div', { class: 'card' }, off.map(({ f, v }) =>
        itemRow(f, v ? `Disattivata da ${from(v.from)}` : `Parte da ${from(f.versions[0].from)}`, paint)))]);
  };
  paint();
}

const itemRow = (f, sub, paint) => h('button', { class: 'row', onclick: () => itemSheet(f.id, paint) },
  h('div', { class: 'grow' }, h('div', {}, f.name), h('div', { class: 'small muted' }, sub)), h('span', { class: 'muted' }, '›'));

async function newFixed(paint) {
  const name = await askText('Nome spesa fissa', { placeholder: 'es. Mutuo' });
  if (!name || !name.trim()) return;
  const v = await askText('Importo mensile', { inputmode: 'decimal', placeholder: '0,00' });
  const amount = v === null ? NaN : parseAmount(v);
  if (Number.isNaN(amount)) return;
  await addFixed({ name: name.trim(), amount, from: ctx.period });
  paint();
}

function itemSheet(id, parentPaint) {
  const s = openSheet({ title: 'Spesa fissa' });
  const paint = () => {
    const f = state.fixed.find((x) => x.id === id);
    const key = ctx.period;
    const v = fixedVersionAt(f, key);
    const isActive = v && v.active;
    const when = periodLabel(key, state.settings.startDay);
    const change = async (patch, question) => {
      await setFixedFrom(id, key, patch); paint(); parentPaint();
    };
    fill(s.body, 
      h('div', { class: 'card' },
        h('button', { class: 'row', onclick: async () => { const n = await askText('Rinomina', { value: f.name }); if (n && n.trim()) { await renameFixed(id, n.trim()); paint(); parentPaint(); } } },
          h('span', { class: 'grow' }, 'Nome'), h('b', {}, f.name), h('span', { class: 'muted' }, '›')),
        h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Nel periodo selezionato'),
          h('b', { class: isActive ? 'num' : 'muted' }, isActive ? formatEUR(v.amount) : 'non attiva'))),
      h('div', { class: 'small muted', style: 'margin:4px 4px' }, `Periodo selezionato: ${when}`),
      isActive && h('button', { class: 'btn-plain', onclick: async () => {
        const a = await askText('Nuovo importo da questo periodo', { value: centsToInput(v.amount), inputmode: 'decimal' });
        const c = a === null ? NaN : parseAmount(a); if (Number.isNaN(c)) return;
        change({ active: true, amount: c });
      } }, 'Cambia importo da questo periodo'),
      isActive
        ? h('button', { class: 'btn-danger', onclick: () => confirmSheet('Disattivare?', `Dal periodo ${when} non comparirà più. I periodi precedenti restano com'erano.`, 'Disattiva da questo periodo', () => change({ active: false })) }, 'Disattiva da questo periodo')
        : h('button', { class: 'btn-primary', onclick: async () => {
          const a = await askText('Importo da questo periodo', { value: centsToInput(v ? v.amount : f.versions.at(-1).amount), inputmode: 'decimal' });
          const c = a === null ? NaN : parseAmount(a); if (Number.isNaN(c)) return;
          change({ active: true, amount: c });
        } }, 'Riattiva da questo periodo'),
      h('h2', {}, 'Cronologia'),
      h('div', { class: 'card' }, f.versions.map((ver, i) => h('div', { class: 'row' },
        h('div', { class: 'grow' }, h('div', {}, ver.active ? formatEUR(ver.amount) : 'Disattivata'), h('div', { class: 'small muted' }, `da ${from(ver.from)}`)),
        i > 0 && h('button', { class: 'pill', onclick: async () => { await removeFixedVersion(id, ver.from); paint(); parentPaint(); } }, 'Rimuovi')))));
  };
  paint();
}
