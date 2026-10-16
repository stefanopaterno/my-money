// Piccoli helper UI: creazione DOM, sheet, toast, feedback aptico.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

const layer = () => document.getElementById('layer');

export const backBtn = (fn, label = 'Indietro') => h('button', { class: 'btn back', 'aria-label': label, onclick: fn }, h('span', { class: 'chev' }, '‹'), label);

/** Apre uno sheet dal basso. Restituisce {el, body, close}. */
export function openSheet({ title = '', full = false, left, right, content, onClose } = {}) {
  const scrim = h('div', { class: 'scrim' });
  const sheet = h('div', { class: 'sheet' + (full ? ' full' : ''), role: 'dialog' });
  const body = h('div', { class: 'body' });
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    scrim.remove(); sheet.remove();
    onClose && onClose();
  };
  scrim.addEventListener('click', close);
  const header = h('header', {},
    left === undefined ? backBtn(close) : left,
    h('h3', {}, title), right || h('span', { style: 'min-width:44px' }));
  sheet.append(header, body);
  if (content) body.append(...[].concat(content));
  layer().append(scrim, sheet);
  return { el: sheet, body, header, close };
}

let toastTimer;
export function toast(text, { action, onAction, ms = 6000 } = {}) {
  document.getElementById('toast')?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { id: 'toast' }, h('span', {}, text));
  if (action) el.append(h('button', { onclick: () => { el.remove(); clearTimeout(toastTimer); onAction && onAction(); } }, action));
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), ms);
}

export function flash() {
  const el = h('div', { class: 'flash' }, h('i', {}, '✓'));
  document.body.append(el);
  setTimeout(() => el.remove(), 750);
}

// Haptic: navigator.vibrate non esiste su iOS Safari; da iOS 18 il tocco su un <input switch> produce un tick.
let hapLabel;
export function haptic(strong = false) {
  try {
    if (navigator.vibrate) { navigator.vibrate(strong ? [18, 40, 18] : 10); return; }
    if (!hapLabel) {
      const id = 'hap-sw';
      hapLabel = h('label', { class: 'hap', for: id }, h('input', { type: 'checkbox', id, switch: true }));
      document.body.append(hapLabel);
    }
    hapLabel.click();
    if (strong) setTimeout(() => hapLabel.click(), 90);
  } catch { /* nessun feedback disponibile */ }
}

export function confirmSheet(title, message, okLabel, onOk, danger = true) {
  const s = openSheet({ title });
  s.body.append(
    h('p', { class: 'muted center', style: 'margin:8px 0 4px' }, message),
    h('button', { class: danger ? 'btn-danger' : 'btn-primary', onclick: () => { s.close(); onOk(); } }, okLabel),
    h('button', { class: 'btn-plain', onclick: s.close }, 'Annulla'));
  return s;
}

/** Chiede un importo (testo, tastiera decimale iOS). */
export function askText(title, { value = '', placeholder = '', inputmode = 'text', okLabel = 'Fatto' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { type: 'text', inputmode, value, placeholder, autocomplete: 'off', style: 'text-align:left' });
    const finish = (v) => { if (done) return; done = true; s.close(); resolve(v); };
    const s = openSheet({ title, onClose: () => { if (!done) { done = true; resolve(null); } } });
    s.body.append(h('div', { class: 'card' }, h('div', { class: 'field' }, input)),
      h('button', { class: 'btn-primary', onclick: () => finish(input.value) }, okLabel));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value); });
    setTimeout(() => input.focus(), 300);
  });
}

/** Sostituisce i figli di `el`, appiattendo gli array e scartando i falsy. */
export function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}
