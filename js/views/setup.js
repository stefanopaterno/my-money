// "Configura il mese": stipendio, spese ripetute (spegni / riaccendi, solo questo mese o da ora in poi), voci extra.
import { h, fill, openSheet, askText, haptic } from '../ui.js';
import { state, setSalary, setFixedFrom, setFixedOnlyFor } from '../store.js';
import { ctx, periodBar } from '../ctx.js';
import { periodSummary, fixedVersionAt } from '../calc.js';
import { formatEUR, parseAmount, centsToInput } from '../money.js';
import { monthName, addPeriods } from '../period.js';
import { incomeForm, extraSheet } from '../forms.js';
import { defaultDateFor } from '../ctx.js';
import { fmtDate } from './dashboard.js';

export function monthSetup(onClose) {
  const s = openSheet({ title: 'Configura il mese', full: true, onClose: () => { ctx.rerender(); onClose && onClose(); } });
  const paint = () => {
    const key = ctx.period;
    const sum = periodSummary(state, key);
    const items = state.fixed.map((f) => ({ f, v: fixedVersionAt(f, key) })).filter((x) => x.v);
    fill(s.body,
      h('div', { class: 'pbar-wrap' }, periodBar(paint)),
      h('h2', {}, '1 · Stipendio'),
      h('div', { class: 'card' }, h('button', { class: 'row', onclick: async () => {
        const v = await askText('Stipendio di questo periodo', { value: centsToInput(sum.salary), inputmode: 'decimal' });
        if (v === null) return; const c = parseAmount(v); if (Number.isNaN(c)) return;
        await setSalary(key, c); paint();
      } }, h('span', { class: 'grow' }, 'Stipendio del periodo'), h('b', { class: 'num pos' }, formatEUR(sum.salary)), h('span', { class: 'muted' }, '›'))),
      h('h2', {}, '2 · Spese ripetute'),
      items.length
        ? h('div', { class: 'card' }, items.map(({ f, v }) => h('button', { class: 'row', onclick: () => toggleSheet(f, v, key, paint) },
          h('div', { class: 'grow' }, h('div', { class: v.active ? '' : 'muted' }, f.name), h('div', { class: 'small muted' }, v.active ? 'Attiva' : 'Spenta in questo periodo')),
          h('b', { class: 'num ' + (v.active ? '' : 'muted') }, formatEUR(v.amount)), h('span', { class: 'sw' + (v.active ? ' on' : '') }))))
        : h('div', { class: 'card empty' }, 'Nessuna spesa ripetuta. Aggiungile da Spese fisse.'),
      h('div', { class: 'small muted', style: 'margin:6px 4px' }, 'Tocca un interruttore: scegli se vale solo per questo mese o da questo mese in poi. Lo storico non cambia.'),
      h('h2', {}, '3 · Voci extra'),
      h('div', { class: 'duo' },
        h('button', { class: 'tile', onclick: () => extraSheet('in', defaultDateFor(key), paint) }, h('span', { class: 'ti' }, '💶'), h('b', {}, 'Entrata extra')),
        h('button', { class: 'tile', onclick: () => extraSheet('out', defaultDateFor(key), paint) }, h('span', { class: 'ti' }, '💸'), h('b', {}, 'Uscita extra'))),
      sum.extras.length > 0 && h('div', { class: 'card', style: 'margin-top:10px' }, sum.extras.map((i) => h('button', { class: 'row', onclick: () => incomeForm(i, null, paint) },
        h('div', { class: 'grow' }, i.description, h('div', { class: 'small muted' }, fmtDate(i.date))), h('b', { class: 'num pos' }, '+' + formatEUR(i.amount))))),
      h('button', { class: 'btn-primary', onclick: s.close }, 'Fatto'));
  };
  paint();
  return s;
}

function toggleSheet(f, v, key, paint) {
  const turningOff = v.active;
  const m = monthName(key), next = monthName(addPeriods(key, 1));
  const sh = openSheet({ title: f.name });
  const apply = async (only) => {
    const patch = turningOff ? { active: false } : { active: true, amount: v.amount };
    if (only) await setFixedOnlyFor(f.id, key, patch); else await setFixedFrom(f.id, key, patch);
    haptic(true); sh.close(); paint();
  };
  sh.body.append(
    h('p', { class: 'muted center', style: 'margin:8px 0 4px' }, turningOff ? `Spegnere “${f.name}”?` : `Riaccendere “${f.name}”?`),
    h('button', { class: 'btn-primary', onclick: () => apply(true) }, `Solo per ${m}`, h('div', { class: 'small', style: 'font-weight:400;opacity:.85' }, `da ${next} torna com'era`)),
    h('button', { class: turningOff ? 'btn-danger' : 'btn-plain', onclick: () => apply(false) }, `Da ${m} in poi`),
    h('button', { class: 'btn-plain', onclick: sh.close }, 'Annulla'));
}
