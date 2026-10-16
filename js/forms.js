// Form di modifica (movimenti, entrate extra, budget categoria).
import { h, fill, openSheet, confirmSheet, haptic, toast } from './ui.js';
import { state, updateMovement, deleteMovement, addIncome, updateIncome, deleteIncome, addMovement } from './store.js';
import { parseAmount, centsToInput, formatEUR } from './money.js';
import { todayStr } from './period.js';
import { cardRow } from './cardpick.js';

export function editMovement(m, onDone) {
  const amount = h('input', { type: 'text', inputmode: 'decimal', value: centsToInput(m.amount) });
  const cat = h('select', {}, state.categories.filter((c) => !c.archived || c.id === m.categoryId)
    .map((c) => h('option', { value: c.id, selected: c.id === m.categoryId }, `${c.emoji} ${c.name}`)));
  const date = h('input', { type: 'date', value: m.date });
  const note = h('input', { type: 'text', value: m.note || '', placeholder: 'Nota' });
  let card = m.card || null;
  const cardBox = h('div');
  const paintCard = () => cardBox.replaceChildren(cardRow({ card, date: date.value || m.date, onChange: (v) => { card = v; paintCard(); } }));
  date.addEventListener('change', paintCard);
  paintCard();
  const s = openSheet({
    title: 'Movimento',
    right: h('button', { class: 'btn', onclick: save }, 'Salva'),
  });
  s.body.append(
    h('div', { class: 'card' },
      h('div', { class: 'field' }, h('label', {}, 'Importo'), amount),
      h('div', { class: 'field' }, h('label', {}, 'Categoria'), cat),
      h('div', { class: 'field' }, h('label', {}, 'Data'), date),
      h('div', { class: 'field' }, h('label', {}, 'Nota'), note)),
    cardBox,
    h('button', { class: 'btn-danger', onclick: () => confirmSheet('Eliminare?', formatEUR(m.amount), 'Elimina', async () => { await deleteMovement(m.id); haptic(); s.close(); onDone && onDone(); }) }, 'Elimina movimento'));
  async function save() {
    const c = parseAmount(amount.value);
    if (!c || Number.isNaN(c) || c < 0) { amount.focus(); return; }
    await updateMovement(m.id, { amount: c, categoryId: cat.value, date: date.value || m.date, note: note.value.trim(), card });
    s.close(); onDone && onDone();
  }
}

export function incomeForm(existing, defaultDate, onDone) {
  const amount = h('input', { type: 'text', inputmode: 'decimal', value: existing ? centsToInput(existing.amount) : '', placeholder: '0,00' });
  const desc = h('input', { type: 'text', value: existing?.description || '', placeholder: 'es. Rimborso' });
  const date = h('input', { type: 'date', value: existing?.date || defaultDate || todayStr() });
  const s = openSheet({ title: existing ? 'Entrata' : 'Nuova entrata', right: h('button', { class: 'btn', onclick: save }, 'Salva') });
  s.body.append(
    h('div', { class: 'card' },
      h('div', { class: 'field' }, h('label', {}, 'Importo'), amount),
      h('div', { class: 'field' }, h('label', {}, 'Descrizione'), desc),
      h('div', { class: 'field' }, h('label', {}, 'Data'), date)),
    existing && h('button', { class: 'btn-danger', onclick: async () => { await deleteIncome(existing.id); s.close(); onDone && onDone(); } }, 'Elimina entrata'));
  setTimeout(() => !existing && amount.focus(), 300);
  async function save() {
    const c = parseAmount(amount.value);
    if (!c || Number.isNaN(c)) { amount.focus(); return; }
    const data = { amount: c, description: desc.value.trim() || 'Entrata extra', date: date.value };
    if (existing) await updateIncome(existing.id, data); else await addIncome(data);
    s.close(); onDone && onDone();
  }
}

const IN_PRESETS = ['Rimborso', 'Bonus', 'Regalo', 'Vendita', 'Affitto', 'Altro'];
const chipLabel = (emoji, text) => [h('span', { class: 'ce' }, emoji), h('span', { class: 'ct' }, text)];

/** Inserimento rapido di una voce extra: entrata o uscita, con "salva e aggiungi un'altra". */
export function extraSheet(type = 'in', defaultDate, onDone) {
  let t = type;
  let card = null;
  let catId = (state.categories.find((c) => c.name === 'Altro' && !c.archived) || state.categories.find((c) => !c.archived) || {}).id;
  const amount = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00', enterkeyhint: 'next', style: 'font-size:28px;font-weight:700' });
  const desc = h('input', { type: 'text', placeholder: 'Descrizione' });
  const date = h('input', { type: 'date', value: defaultDate || todayStr() });
  const body = h('div');
  date.addEventListener('change', () => { if (t === 'out') paint(); });
  const s = openSheet({ title: 'Voce extra', content: [body] });
  let added = 0;

  function paint() {
    const isIn = t === 'in';
    fill(body, [
      h('div', { class: 'seg', style: 'margin-bottom:12px' },
        h('button', { class: isIn ? 'on' : '', onclick: () => { t = 'in'; paint(); } }, '💶 Entrata'),
        h('button', { class: !isIn ? 'on' : '', onclick: () => { t = 'out'; paint(); } }, '💸 Uscita')),
      h('div', { class: 'card' },
        h('div', { class: 'field', style: 'min-height:64px' }, h('label', {}, 'Importo €'), amount),
        h('div', { class: 'field' }, h('label', {}, 'Descrizione'), desc),
        h('div', { class: 'field' }, h('label', {}, 'Data'), date)),
      isIn
        ? h('div', { class: 'chips grid c3' }, IN_PRESETS.map((p) => h('button', { class: 'chip', onclick: () => { desc.value = p; haptic(); } }, h('span', { class: 'ell' }, p))))
        : [h('div', { class: 'chips grid' }, state.categories.filter((c) => !c.archived).map((c) =>
          h('button', { class: 'chip' + (c.id === catId ? ' on' : ''), onclick: () => { catId = c.id; haptic(); paint(); } }, chipLabel(c.emoji, c.name)))),
          cardRow({ card, date: date.value, onChange: (v) => { card = v; paint(); } })],
      h('button', { class: 'btn-primary', onclick: () => save(false) }, added ? `Salva e chiudi (${added} aggiunte)` : 'Salva'),
      h('button', { class: 'btn-plain', onclick: () => save(true) }, 'Salva e aggiungi un\'altra'),
    ]);
  }

  async function save(more) {
    const c = parseAmount(amount.value);
    if (!c || Number.isNaN(c) || c < 0) { amount.focus(); haptic(true); return; }
    if (t === 'in') await addIncome({ amount: c, description: desc.value.trim() || 'Entrata extra', date: date.value });
    else await addMovement({ amount: c, categoryId: catId, note: desc.value.trim(), date: date.value, card });
    haptic(true); added++;
    onDone && onDone();
    if (more) {
      toast(`${t === 'in' ? 'Entrata' : 'Uscita'} di ${formatEUR(c, true)} salvata`, { ms: 2200 });
      amount.value = ''; desc.value = ''; card = null; paint(); amount.focus();
    } else { s.close(); toast(`${t === 'in' ? 'Entrata' : 'Uscita'} di ${formatEUR(c, true)} salvata`, { ms: 2500 }); }
  }
  paint();
  setTimeout(() => amount.focus(), 350);
  return s;
}
