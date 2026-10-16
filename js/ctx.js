import { periodKeyForDate, todayStr, addPeriods, periodLabel, periodRange } from './period.js';
import { state } from './store.js';
import { h } from './ui.js';

export const ctx = { tab: 'dashboard', period: null, rerender: () => {} };

export const currentKey = () => periodKeyForDate(todayStr(), state.settings.startDay);

export function periodBar(after) {
  const cur = currentKey();
  const refresh = () => { ctx.rerender(); after && after(); };
  const go = (n) => { ctx.period = addPeriods(ctx.period, n); refresh(); };
  const rel = ctx.period === cur ? 'Periodo corrente' : ctx.period < cur ? 'Passato' : 'Futuro';
  return h('div', { class: 'pbar' },
    h('button', { class: 'nav', 'aria-label': 'Periodo precedente', onclick: () => go(-1) }, '‹'),
    h('button', { class: 'lbl', onclick: () => { ctx.period = cur; refresh(); } },
      h('span', {}, periodLabel(ctx.period, state.settings.startDay), h('small', {}, rel + (ctx.period !== cur ? ' · tocca per tornare a oggi' : '')))),
    h('button', { class: 'nav', 'aria-label': 'Periodo successivo', onclick: () => go(1) }, '›'));
}

export const catById = (id) => state.categories.find((c) => c.id === id)
  || { id, name: 'Categoria eliminata', emoji: '❔', color: '#8e8e93', archived: true };

/** Data predefinita per una nuova voce nel periodo: oggi se cade nel periodo, altrimenti il primo giorno. */
export function defaultDateFor(key) {
  const r = periodRange(key, state.settings.startDay), t = todayStr();
  return t >= r.start && t < r.endExcl ? t : r.start;
}
