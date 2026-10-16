// Selettore "Carta di credito" (sì/no + banca). card = null | 'ING' | 'Fineco'.
import { h, haptic } from './ui.js';
import { state, updateSettings } from './store.js';
import { CARD_BANKS, CARD_CHARGE_DAY, chargeDate, fmtDMY } from './period.js';

export const ICON_CARD = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/></svg>';
export const cardIcon = () => h('span', { class: 'ic', html: ICON_CARD });

/** compact: una sola riga (schermata di inserimento rapido). */
export function cardRow({ card, date, onChange, compact = false }) {
  const on = !!card;
  const set = (v) => { haptic(); if (v) updateSettings({ lastBank: v }); onChange(v); };
  const toggle = h('button', { class: 'cr-toggle', role: 'switch', 'aria-checked': on, onclick: () => set(on ? null : (state.settings.lastBank || CARD_BANKS[0])) },
    cardIcon(),
    h('span', { class: 'grow' }, h('b', {}, 'Carta di credito'),
      !compact && h('span', { class: 'small muted' }, on ? `Addebito il ${fmtDMY(chargeDate(date))}` : `Addebito il ${CARD_CHARGE_DAY} del mese dopo`)),
    h('span', { class: 'sw' + (on ? ' on' : '') }));
  const banks = on && h('div', { class: 'seg' }, CARD_BANKS.map((b) => h('button', { class: b === card ? 'on' : '', onclick: () => set(b) }, b)));
  return h('div', { class: 'cardrow' + (compact ? ' compact' : '') }, toggle, banks);
}

/** Testo per i movimenti con carta: "Carta ING · acquisto 16/10". */
export const cardNote = (m) => (m.card ? `Carta ${m.card} · acquisto ${fmtDMY(m.date).slice(0, 5)}` : '');
