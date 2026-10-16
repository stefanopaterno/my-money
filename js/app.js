import { init, state, onChange } from './store.js';
import { ctx, currentKey } from './ctx.js';
import { openEntry, cartCount } from './entry.js';
import { renderDashboard } from './views/dashboard.js';
import { renderMovements } from './views/movements.js';
import { renderFixed } from './views/fixed.js';
import { renderProspetto } from './views/prospetto.js';
import { renderSettings } from './views/settings.js';
import { haptic } from './ui.js';
import { setMasked, isMasked } from './money.js';
import { showGate, repaintGate, gateOpen } from './gate.js';

// Icone a tratto come nelle app delle banche: occhio aperto = importi visibili, occhio barrato = nascosti.
const svg = (d) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const EYE_ON = svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
const EYE_OFF = svg('<path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.9 3.9M6.6 6.6A17.3 17.3 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>');

const VIEWS = { dashboard: renderDashboard, movimenti: renderMovements, prospetto: renderProspetto, fisse: renderFixed, impostazioni: renderSettings };
const view = document.getElementById('view');

function render() {
  const y = view.scrollTop;
  view.replaceChildren(VIEWS[ctx.tab]());
  view.scrollTop = ctx.keepScroll === false ? 0 : y;
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ctx.tab));
  document.getElementById('eye').innerHTML = isMasked() ? EYE_OFF : EYE_ON;
  const n = cartCount(), badge = document.getElementById('fab-badge');
  badge.hidden = n === 0; badge.textContent = n;
}
ctx.rerender = render;

document.querySelectorAll('#tabbar button').forEach((b) => b.addEventListener('click', () => {
  if (ctx.tab !== b.dataset.tab) { ctx.tab = b.dataset.tab; view.scrollTop = 0; haptic(); }
  render();
}));
document.getElementById('eye').addEventListener('click', () => { setMasked(!isMasked()); haptic(); render(); repaintGate(); });
document.getElementById('fab').addEventListener('click', () => { haptic(); openEntry({ onSaved: render }); });

let hiddenAt = 0;
async function start() {
  try { await navigator.storage?.persist?.(); } catch { /* ignora */ }
  await init();
  ctx.period = currentKey();
  setMasked(state.settings.privacyOnOpen);
  render();
  if (state.settings.showGate) showGate();
  const cover = document.getElementById('cover');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (state.settings.privacyOnOpen) { setMasked(true); cover.hidden = false; render(); repaintGate(); }
      return;
    }
    cover.hidden = true;
    const away = Date.now() - hiddenAt;
    if (away > 5 * 60 * 1000) { ctx.period = currentKey(); if (state.settings.showGate && !gateOpen()) showGate(); }
    render();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
