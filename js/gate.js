// Schermata iniziale: "Cosa vuoi fare?" all'apertura dell'app.
import { h, haptic, toast } from './ui.js';
import { state } from './store.js';
import { ctx, currentKey, defaultDateFor } from './ctx.js';
import { periodSummary } from './calc.js';
import { formatEUR, isMasked } from './money.js';
import { periodLabel, daysLeft, todayStr, nextStartLabel } from './period.js';
import { openEntry, cartCount } from './entry.js';
import { extraSheet } from './forms.js';
import { monthSetup } from './views/setup.js';
import { updateSettings } from './store.js';

let el = null;
export const gateOpen = () => !!el;

export function showGate() {
  hideGate(true);
  ctx.period = currentKey();
  el = h('div', { id: 'gate' });
  document.body.append(el);
  paint();
}

export function hideGate(instant) {
  if (!el) return;
  const g = el; el = null;
  if (instant) g.remove(); else { g.classList.add('out'); setTimeout(() => g.remove(), 250); }
}

/** Ridisegna la schermata (es. dopo aver acceso/spento la privacy). */
export function repaintGate() { if (el) paint(); }

function paint() {
  const key = currentKey(), sd = state.settings.startDay;
  const s = periodSummary(state, key);
  const days = daysLeft(key, todayStr(), sd);
  const hr = new Date().getHours();
  const hello = hr < 6 ? 'Buonanotte' : hr < 13 ? 'Buongiorno' : hr < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const back = () => { ctx.rerender(); repaintGate(); };
  const act = (fn) => () => { haptic(); fn(); };

  el.replaceChildren(
    h('div', { class: 'gate-in' },
      h('div', { class: 'gate-top' }, h('img', { class: 'logo', src: 'icons/icon-192.png', alt: '' }), h('span', { class: 'gate-name' }, 'My Money')),
      h('div', { class: 'gate-hello' }, h('div', { class: 'muted' }, hello + ', Stefano'), h('h1', {}, 'Cosa vuoi fare?')),
      h('div', { class: 'gate-sum' },
        h('div', {}, h('div', { class: 'small', style: 'opacity:.8' }, periodLabel(key, sd)), h('div', { class: 'gate-bal num' }, formatEUR(s.balance))),
        h('div', { class: 'small', style: 'text-align:right;opacity:.9' }, days > 0 ? `${days} ${days === 1 ? 'giorno' : 'giorni'}` : '', h('br'), days > 0 ? `al ${nextStartLabel(key, sd)}` : '')),
      h('div', { class: 'gate-actions' },
        big('💶', 'Registra un\'entrata', 'Rimborso, bonus, regalo…', 'g-in', act(() => extraSheet('in', defaultDateFor(key), back))),
        big('💸', 'Registra un\'uscita', 'Tastierino rapido e carrello', 'g-out', act(() => openEntry({ onSaved: back }))),
        big('🗓️', 'Configura il mese', 'Voci extra, spegni le spese ripetute', 'g-set', act(() => monthSetup(back))),
        cartCount() > 0 && big('🛒', `Riprendi il carrello (${cartCount()})`, 'Hai una spesa in corso', 'g-cart', act(() => openEntry({ onSaved: back })))),
      h('button', { class: 'gate-go', onclick: () => { haptic(); hideGate(); } }, 'Vai alla Home ›'),
      h('button', { class: 'gate-off', onclick: async () => { await updateSettings({ showGate: false }); hideGate(); toast('Schermata iniziale disattivata. Riattivala in Impostazioni.', { ms: 3500 }); } }, 'Non mostrare più all\'apertura')));
}

const big = (emoji, title, sub, cls, fn) => h('button', { class: 'gate-card ' + cls, onclick: fn },
  h('span', { class: 'gi' }, emoji), h('span', { class: 'grow' }, h('b', {}, title), h('span', { class: 'small' }, sub)), h('span', { class: 'chev2' }, '›'));
