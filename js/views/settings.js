import { h, openSheet, askText, confirmSheet, toast, haptic } from '../ui.js';
import { state, updateSettings, addCategory, updateCategory, reorderCategories, buildExport, markBackup, importData, wipeAll, seedDemo } from '../store.js';
import { ctx, currentKey } from '../ctx.js';
import { clampStartDay, addPeriods, periodRange } from '../period.js';
import { formatEUR, parseAmount, centsToInput, setMasked } from '../money.js';

const COLORS = ['#34c759', '#ff9500', '#ff3b30', '#8e6e53', '#af52de', '#5856d6', '#ffcc00', '#ff6b35', '#30b0c7', '#007aff', '#ff2d55', '#8e8e93'];

export async function exportBackup() {
  const json = JSON.stringify(buildExport(), null, 1);
  const name = `my-money-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup My Money' });
    } else {
      const a = h('a', { href: URL.createObjectURL(file), download: name });
      document.body.append(a); a.click(); a.remove();
    }
    await markBackup();
    toast('Backup esportato', { ms: 2500 });
    ctx.rerender();
  } catch (e) {
    if (e.name !== 'AbortError') toast('Esportazione non riuscita: ' + e.message, { ms: 4000 });
  }
}

function importBackup() {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  input.addEventListener('change', async () => {
    const f = input.files[0]; input.remove();
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { toast('File non valido', { ms: 3000 }); return; }
    const n = (a) => (Array.isArray(a) ? a.length : 0);
    confirmSheet('Sovrascrivere i dati?',
      `Il backup contiene ${n(data.movements)} movimenti e ${n(data.fixed)} spese fisse. TUTTI i dati attuali verranno sostituiti.`,
      'Sostituisci con il backup', async () => {
        try { await importData(data); toast('Dati importati', { ms: 2500 }); ctx.period = currentKey(); ctx.rerender(); }
        catch (e) { toast('Importazione non riuscita: ' + e.message, { ms: 5000 }); }
      });
  });
  document.body.append(input); input.click();
}

export function renderSettings() {
  const st = state.settings;
  const view = h('div', {}, h('h1', {}, 'Impostazioni'));

  view.append(h('h2', {}, 'Periodo e stipendio'), h('div', { class: 'card' },
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Giorno di inizio periodo'),
      h('button', { class: 'pill', 'aria-label': 'Diminuisci', onclick: () => setDay(st.startDay - 1) }, '−'),
      h('b', { class: 'num', style: 'min-width:28px;text-align:center' }, st.startDay),
      h('button', { class: 'pill', 'aria-label': 'Aumenta', onclick: () => setDay(st.startDay + 1) }, '+')),
    h('button', { class: 'row', onclick: async () => {
      const v = await askText('Stipendio standard', { value: st.salaryDefault ? centsToInput(st.salaryDefault) : '', inputmode: 'decimal', placeholder: '0,00' });
      if (v === null) return; const c = parseAmount(v); if (Number.isNaN(c)) return;
      await updateSettings({ salaryDefault: c }); ctx.rerender();
    } }, h('span', { class: 'grow' }, 'Stipendio standard'), h('b', { class: 'num' }, formatEUR(st.salaryDefault)), h('span', { class: 'muted' }, '›'))),
    h('div', { class: 'small muted', style: 'margin:0 16px' }, 'Il giorno va da 1 a 28. Cambiandolo, i movimenti esistenti vengono riassegnati ai nuovi periodi in base alla loro data.'));

  view.append(h('h2', {}, 'Privacy e apertura'), h('div', { class: 'card' },
    toggleRow('Nascondi gli importi all\'apertura', 'Si vedono toccando l\'icona dell\'occhio in alto a destra', st.privacyOnOpen, async (v) => { await updateSettings({ privacyOnOpen: v }); setMasked(v); ctx.rerender(); }),
    toggleRow('Schermata iniziale', 'Chiede subito cosa vuoi fare', st.showGate, (v) => updateSettings({ showGate: v }).then(ctx.rerender))));

  const active = state.categories.filter((c) => !c.archived), arch = state.categories.filter((c) => c.archived);
  view.append(h('h2', {}, 'Categorie (trascina ≡ per riordinare)'));
  const list = h('div', { class: 'card', id: 'catlist' }, active.map((c) => catRow(c)));
  view.append(list, h('button', { class: 'btn-plain', onclick: () => catForm(null) }, '+ Nuova categoria'));
  if (arch.length) view.append(h('h2', {}, 'Archiviate'), h('div', { class: 'card' }, arch.map((c) =>
    h('button', { class: 'row', onclick: () => catForm(c) }, h('div', { class: 'emo', style: `background:${c.color}22` }, c.emoji), h('span', { class: 'grow muted' }, c.name), h('span', { class: 'muted' }, '›')))));

  const last = st.lastBackup ? new Date(st.lastBackup).toLocaleDateString('it-IT') : 'mai';
  view.append(h('h2', {}, 'Backup'), h('div', { class: 'card' },
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Ultimo backup'), h('b', {}, last)),
    h('button', { class: 'row', onclick: exportBackup }, h('span', { class: 'grow', style: 'color:var(--blue)' }, 'Esporta tutti i dati (JSON)')),
    h('button', { class: 'row', onclick: importBackup }, h('span', { class: 'grow', style: 'color:var(--blue)' }, 'Importa da file JSON'))),
    h('div', { class: 'small muted', style: 'margin:0 16px' }, 'I dati sono solo su questo iPhone. Esporta e salva il file in iCloud Drive / File.'));

  const persistRow = h('span', { class: 'muted' }, '…');
  navigator.storage?.persisted?.().then((p) => { persistRow.textContent = p ? 'Protetto' : 'Non garantito'; });
  view.append(h('h2', {}, 'Avanzate'), h('div', { class: 'card' },
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Archivio persistente'), persistRow),
    h('button', { class: 'row', onclick: () => confirmSheet('Caricare dati di esempio?', 'Aggiunge spese fisse e movimenti finti negli ultimi 6 periodi. Puoi rimuoverli con “Cancella tutti i dati”.', 'Carica esempio', async () => {
      await seedDemo(currentKey(), addPeriods, periodRange); ctx.rerender(); toast('Dati di esempio caricati', { ms: 2500 });
    }, false) }, h('span', { class: 'grow', style: 'color:var(--blue)' }, 'Carica dati di esempio')),
    h('button', { class: 'row', onclick: () => confirmSheet('Cancellare tutto?', 'Verranno eliminati movimenti, spese fisse, budget e impostazioni. Fai prima un backup.', 'Cancella tutti i dati', async () => { await wipeAll(); ctx.period = currentKey(); ctx.rerender(); }) },
      h('span', { class: 'grow neg' }, 'Cancella tutti i dati'))),
    h('div', { class: 'small muted center', style: 'margin:16px' }, 'My Money · v1.0 · schema dati 1'));
  return view;

  async function setDay(n) {
    const day = clampStartDay(n);
    if (day === st.startDay) return;
    const wasCurrent = ctx.period === currentKey();
    await updateSettings({ startDay: day });
    ctx.period = currentKey();
    haptic(); ctx.rerender();
  }
}

function toggleRow(title, sub, value, onChange) {
  return h('button', { class: 'row', role: 'switch', 'aria-checked': !!value, onclick: () => { haptic(); onChange(!value); } },
    h('div', { class: 'grow' }, h('div', {}, title), h('div', { class: 'small muted' }, sub)), h('span', { class: 'sw' + (value ? ' on' : '') }));
}

function catRow(c) {
  const row = h('div', { class: 'row', 'data-id': c.id, style: 'padding-left:4px' },
    h('div', { class: 'handle', 'aria-label': 'Trascina' }, '≡'),
    h('button', { class: 'row', style: 'flex:1;padding:0;min-height:44px', onclick: () => catForm(c) },
      h('div', { class: 'emo', style: `background:${c.color}22` }, c.emoji), h('span', { class: 'grow ell' }, c.name), h('span', { class: 'muted' }, '›')));
  const handle = row.firstChild;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault(); handle.setPointerCapture(e.pointerId); row.classList.add('dragging');
    const move = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#catlist > .row');
      if (!el || el === row) return;
      const r = el.getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) el.before(row); else el.after(row);
    };
    const up = async () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      const ids = [...row.parentElement.querySelectorAll(':scope > .row')].map((r) => r.dataset.id);
      const arch = state.categories.filter((x) => x.archived).map((x) => x.id);
      await reorderCategories([...ids, ...arch]); haptic();
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  });
  return row;
}

function catForm(cat) {
  let color = cat?.color || COLORS[0];
  const name = h('input', { type: 'text', value: cat?.name || '', placeholder: 'Nome' });
  const emoji = h('input', { type: 'text', value: cat?.emoji || '🏷️', maxlength: 4, style: 'font-size:24px' });
  const sw = h('div', { class: 'swatches' });
  const paintSw = () => sw.replaceChildren(...COLORS.map((c) => h('button', { class: c === color ? 'on' : '', style: `background:${c}`, 'aria-label': c, onclick: () => { color = c; paintSw(); } })));
  paintSw();
  const s = openSheet({ title: cat ? 'Categoria' : 'Nuova categoria', right: h('button', { class: 'btn', onclick: save }, 'Salva') });
  s.body.append(h('div', { class: 'card' }, h('div', { class: 'field' }, h('label', {}, 'Nome'), name), h('div', { class: 'field' }, h('label', {}, 'Emoji'), emoji)), sw,
    cat && h('button', { class: cat.archived ? 'btn-primary' : 'btn-danger', onclick: async () => { await updateCategory(cat.id, { archived: !cat.archived }); s.close(); ctx.rerender(); } },
      cat.archived ? 'Ripristina categoria' : 'Archivia categoria'),
    cat && !cat.archived && h('div', { class: 'small muted', style: 'margin:8px 4px' }, 'Archiviata: non compare più per nuove spese, ma i movimenti passati restano nello storico.'));
  async function save() {
    const n = name.value.trim(); if (!n) { name.focus(); return; }
    const e = emoji.value.trim() || '🏷️';
    if (cat) await updateCategory(cat.id, { name: n, emoji: e, color }); else await addCategory({ name: n, emoji: e, color });
    s.close(); ctx.rerender();
  }
}
