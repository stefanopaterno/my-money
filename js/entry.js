// Schermata di inserimento rapido: tastierino custom, chip categorie, modalità singola / carrello.
import { h, fill, backBtn, openSheet, toast, flash, haptic } from './ui.js';
import { state, addMovement, deleteMovement, saveCart, uid } from './store.js';
import { keypadPress, keypadToCents, formatEUR as fmtEUR } from './money.js';
const formatEUR = (c) => fmtEUR(c, true); // in inserimento gli importi si vedono sempre
import { todayStr } from './period.js';
import { cardRow } from './cardpick.js';

export const cartCount = () => state.cart.items.length;

function defaultCategoryId() {
  const active = state.categories.filter((c) => !c.archived);
  return (active.find((c) => c.name === 'Spesa cibo') || active[0] || {}).id;
}

export function openEntry({ onSaved } = {}) {
  let typed = '';
  let mode = cartCount() > 0 ? 'cart' : 'single';
  let catId = state.cart.categoryId && state.categories.some((c) => c.id === state.cart.categoryId && !c.archived)
    ? state.cart.categoryId : defaultCategoryId();
  let date = todayStr();
  let note = state.cart.note || '';
  let card = state.cart.card || null;
  const persist = () => saveCart({ items: state.cart.items, categoryId: catId, note, card });

  const root = h('div', { class: 'entry' });
  const sheet = openSheet({ title: 'Nuova spesa', full: true, content: [], left: backBtn(() => sheet.close()), onClose: () => onSaved && onSaved() });
  sheet.body.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column';
  sheet.body.append(root);

  const total = () => state.cart.items.reduce((s, i) => s + i.amount, 0);

  function press(key) {
    typed = keypadPress(typed, key);
    haptic();
    render();
  }

  function addToCart() {
    const c = keypadToCents(typed);
    if (!c) return;
    state.cart.items.push({ id: uid(), amount: c });
    typed = '';
    persist(); haptic(); render();
  }

  async function register() {
    const pending = keypadToCents(typed);
    let amount, memo = note.trim();
    if (mode === 'cart') {
      amount = total() + pending;
      if (!memo) memo = `Carrello (${state.cart.items.length + (pending ? 1 : 0)} articoli)`;
    } else amount = pending;
    if (!amount || !catId) return;
    const m = await addMovement({ date, amount, categoryId: catId, note: memo, card });
    if (mode === 'cart') { state.cart.items = []; note = ''; await persist(); }
    const cat = state.categories.find((c) => c.id === catId);
    haptic(true); flash();
    sheet.close();
    toast(`${formatEUR(amount)} · ${cat.emoji} ${cat.name}${card ? ' · ' + card : ''}`, {
      action: 'Annulla', onAction: async () => { await deleteMovement(m.id); haptic(); toast('Movimento annullato', { ms: 2000 }); onSaved && onSaved(); },
    });
  }

  function key(k, label) { return h('button', { onclick: () => press(k), 'aria-label': k === 'back' ? 'Cancella' : label || k }, label || k); }

  function render() {
    const pending = keypadToCents(typed);
    const typedTxt = typed === '' ? '0' : typed;
    const cart = mode === 'cart';
    fill(root, 
      h('div', { class: 'disp' },
        h('div', { class: 'seg', style: 'margin:0 auto 8px;max-width:260px' },
          h('button', { class: !cart ? 'on' : '', onclick: () => { mode = 'single'; render(); } }, 'Singola'),
          h('button', { class: cart ? 'on' : '', onclick: () => { mode = 'cart'; render(); } }, `🛒 Carrello${cartCount() ? ' (' + cartCount() + ')' : ''}`)),
        cart && h('div', { class: 'total' }, 'Totale parziale', h('b', { class: 'num' }, formatEUR(total() + pending))),
        h('div', { class: 'amt num' + (typed === '' ? ' dim' : '') }, typedTxt + ' €')),
      cart ? h('div', { class: 'cartlist' },
        state.cart.items.length === 0 ? h('span', { class: 'muted small', style: 'padding:8px' }, 'Digita un prezzo e premi “+ Aggiungi”.') : null,
        state.cart.items.map((it) => h('div', { class: 'it num' }, formatEUR(it.amount),
          h('button', { 'aria-label': 'Rimuovi', onclick: () => { state.cart.items = state.cart.items.filter((x) => x.id !== it.id); persist(); haptic(); render(); } }, '✕')))) : h('div', { style: 'flex:1' }),
      h('div', { class: 'chips' }, state.categories.filter((c) => !c.archived).map((c) =>
        h('button', { class: 'chip' + (c.id === catId ? ' on' : ''), onclick: () => { catId = c.id; persist(); haptic(); render(); } }, c.emoji, ' ', c.name))),
      cardRow({ card, date, compact: true, onChange: (v) => { card = v; persist(); render(); } }),
      h('div', { class: 'meta' },
        h('input', { type: 'date', value: date, 'aria-label': 'Data', onchange: (e) => { date = e.target.value || todayStr(); } }),
        h('input', { type: 'text', placeholder: 'Nota (opzionale)', value: note, enterkeyhint: 'done', oninput: (e) => { note = e.target.value; }, onchange: persist })),
      h('div', { class: 'pad-keys' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => key(k)), key(',', ','), key('0'), key('back', '⌫')),
      h('div', { class: 'actions' },
        cart && h('button', { class: 'add', disabled: !pending, onclick: addToCart }, '+ Aggiungi'),
        h('button', { class: 'ok', disabled: !(cart ? total() + pending : pending), onclick: register },
          cart ? `Registra ${formatEUR(total() + pending)}` : 'Salva')));
  }
  render();
  return sheet;
}
