import { h, fill, openSheet, askText, haptic } from '../ui.js';
import { state, setSalary, setBudget } from '../store.js';
import { ctx, periodBar, catById, currentKey, defaultDateFor } from '../ctx.js';
import { periodSummary, inheritedBudget } from '../calc.js';
import { barChart } from '../chart.js';
import { openEntry } from '../entry.js';
import { cardNote, cardIcon } from '../cardpick.js';
import { partialsCard, cardsCard, prosp } from './prospetto.js';
import { formatEUR, formatShort, parseAmount, centsToInput } from '../money.js';
import { daysLeft, nextStartLabel, todayStr, addPeriods } from '../period.js';
import { editMovement, incomeForm, extraSheet } from '../forms.js';
import { exportBackup, importFromCode } from './settings.js';

const DAY30 = 30 * 86400000;

export function renderDashboard() {
  const key = ctx.period, sd = state.settings.startDay;
  const s = periodSummary(state, key);
  const today = todayStr();
  const cur = currentKey();
  const days = daysLeft(key, today, sd);
  const hr = new Date().getHours();
  const hello = hr < 6 ? 'Buonanotte' : hr < 13 ? 'Buongiorno' : hr < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const view = h('div', {},
    h('div', { class: 'welcome' }, h('div', { class: 'muted small' }, new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })), h('h1', {}, `${hello}, Stefano`)),
    periodBar());

  // primo avvio: guida in 3 passi
  const fresh = !state.movements.length && !state.fixed.length && !state.settings.salaryDefault;
  if (fresh) {
    view.append(h('div', { class: 'card pad onboard' },
      h('b', { style: 'font-size:19px' }, 'Benvenuto in My Money'),
      h('p', { class: 'muted', style: 'margin:4px 0 10px' }, 'Tre passi per partire. I dati restano solo su questo iPhone.'),
      step('1', 'Imposta il tuo stipendio', 'Impostazioni', () => { ctx.tab = 'impostazioni'; ctx.rerender(); }),
      step('2', 'Aggiungi le spese fisse', 'Spese fisse', () => { ctx.tab = 'fisse'; ctx.rerender(); }),
      step('3', 'Registra la prima spesa', 'Prova', () => openEntry({ onSaved: ctx.rerender })),
      h('button', { class: 'btn-plain', style: 'margin-top:10px', onclick: importFromCode }, 'Ho un codice di importazione')));
  }

  // promemoria backup
  const last = state.settings.lastBackup || state.settings.createdAt;
  const hasData = state.movements.length || state.fixed.length;
  if (hasData && last && Date.now() - last > DAY30) {
    view.append(h('div', { class: 'banner' }, h('span', {}, '💾'),
      h('div', { class: 'grow small' }, state.settings.lastBackup ? 'L\'ultimo backup ha più di 30 giorni.' : 'Non hai ancora fatto un backup.'),
      h('button', { class: 'pill on', onclick: exportBackup }, 'Esporta')));
  }

  // hero
  const neg = s.balance < 0;
  view.append(h('div', { class: 'card hero-card' },
    h('div', { class: 'hero' },
      h('div', { class: 'cap' }, 'Saldo disponibile'),
      h('div', { class: 'big num' }, formatEUR(s.balance)),
      key === cur && h('div', { style: 'margin-top:6px;opacity:.92' },
        days > 0 ? `${days} ${days === 1 ? 'giorno' : 'giorni'} al ${nextStartLabel(key, sd)} · ` : '',
        days > 0 ? (neg ? h('b', {}, 'sei in rosso') : h('b', { class: 'num' }, `${formatEUR(Math.floor(s.balance / days))} al giorno`)) : ''),
      key > cur && h('div', { style: 'margin-top:6px;opacity:.9' }, 'Periodo futuro'),
      key < cur && h('div', { style: 'margin-top:6px;opacity:.9' }, 'Periodo concluso')),
    h('div', { class: 'triple' },
      h('button', { onclick: () => incomeSheet(key) }, h('span', { class: 'small' }, 'Entrate'), h('b', { class: 'num' }, formatShort(s.income))),
      h('button', { onclick: () => { ctx.tab = 'fisse'; ctx.rerender(); } }, h('span', { class: 'small' }, 'Fisse'), h('b', { class: 'num' }, formatShort(s.fixedTotal))),
      h('button', { onclick: () => { ctx.tab = 'movimenti'; ctx.rerender(); } }, h('span', { class: 'small' }, 'Variabili'), h('b', { class: 'num' }, formatShort(s.variableTotal))))));

  // azioni rapide
  view.append(h('div', { class: 'tiles' },
    tile('🛒', 'Spesa', 'Carrello e prezzi', () => openEntry({ onSaved: ctx.rerender })),
    tile('💶', 'Entrata extra', 'Rimborso, bonus…', () => extraSheet('in', defaultDateFor(key), ctx.rerender)),
    tile('💸', 'Uscita extra', 'Una tantum', () => extraSheet('out', defaultDateFor(key), ctx.rerender)),
    tile('📈', 'Prospetto', 'E mesi futuri', () => { ctx.tab = 'prospetto'; prosp.mode = 'cronologia'; ctx.rerender(); })));

  // parziali del periodo corrente
  if (key === cur) view.append(h('h2', {}, 'Parziali di oggi'), partialsCard(key));
  const cc = cardsCard(key); if (cc) view.append(h('h2', {}, 'Carte di credito'), cc);

  // categorie
  const cats = state.categories.filter((c) => !c.archived || s.byCat[c.id]);
  const orphan = Object.keys(s.byCat).filter((id) => !state.categories.some((c) => c.id === id)).map(catById);
  view.append(h('h2', {}, 'Categorie'));
  const list = h('div', { class: 'card' });
  for (const c of [...cats, ...orphan]) {
    const spent = s.byCat[c.id] || 0, budget = inheritedBudget(state.periods, key, c.id);
    const pct = budget > 0 ? spent / budget : 0;
    const cls = pct > 1 ? 'r' : pct > 0.8 ? 'o' : '';
    list.append(h('button', { class: 'row', style: 'align-items:stretch', onclick: () => categorySheet(c, key) },
      h('div', { class: 'emo', style: `background:${c.color}22;align-self:center` }, c.emoji),
      h('div', { class: 'grow' },
        h('div', { style: 'display:flex;justify-content:space-between;gap:8px' },
          h('span', { class: 'ell' }, c.name + (c.archived ? ' (archiviata)' : '')),
          h('span', { class: 'num ' + (pct > 1 ? 'neg' : '') }, formatShort(spent), h('span', { class: 'muted small' }, budget ? ` / ${formatShort(budget)}` : ''))),
        h('div', { class: 'bar' }, h('i', { class: cls, style: `width:${budget ? Math.min(100, pct * 100) : 0}%` })))));
  }
  view.append(list);

  view.append(h('h2', {}, 'Ultimi periodi'), historyCard(key),
    h('button', { class: 'btn-plain', onclick: () => { ctx.tab = 'prospetto'; prosp.mode = 'cronologia'; ctx.rerender(); } }, 'Cronologia completa e mesi futuri ›'));
  return view;
}

const tile = (emoji, title, sub, fn) => h('button', { class: 'tile', onclick: () => { haptic(); fn(); } }, h('span', { class: 'ti' }, emoji), h('b', {}, title), h('span', { class: 'small muted' }, sub));
const step = (n, text, cta, fn) => h('button', { class: 'row step', onclick: fn }, h('span', { class: 'stepn' }, n), h('span', { class: 'grow' }, text), h('span', { class: 'pill on' }, cta));

function historyCard(key) {
  const keys = [];
  for (let i = -5; i <= 0; i++) keys.push(addPeriods(key, i));
  return h('div', { class: 'card pad', style: 'padding-bottom:4px' }, barChart(keys, key, (k) => { ctx.period = k; ctx.rerender(); }),
    h('div', { class: 'legend' },
      h('span', {}, h('i', { style: 'background:var(--muted)' }), 'Fisse'),
      h('span', {}, h('i', { style: 'background:var(--blue)' }), 'Variabili'),
      h('span', {}, h('i', { style: 'background:var(--green);height:3px;vertical-align:3px' }), 'Entrate')),
    h('div', { class: 'small muted center', style: 'padding-bottom:8px' }, 'Tocca una colonna per aprire quel periodo · valori in €'));
}

function categorySheet(cat, key) {
  const sd = state.settings.startDay;
  const s = openSheet({ title: `${cat.emoji} ${cat.name}` });
  const paint = () => {
    const sum = periodSummary(state, key);
    const movs = sum.movements.filter((m) => m.categoryId === cat.id);
    const budget = inheritedBudget(state.periods, key, cat.id);
    fill(s.body, 
      h('div', { class: 'card' },
        h('button', { class: 'row', onclick: async () => {
          const v = await askText(`Budget ${cat.name}`, { value: budget ? centsToInput(budget) : '', inputmode: 'decimal', placeholder: '0,00' });
          if (v === null) return;
          const c = v.trim() === '' ? 0 : parseAmount(v);
          if (Number.isNaN(c)) return;
          await setBudget(key, cat.id, c); paint();
        } }, h('span', { class: 'grow' }, 'Budget del periodo'), h('b', { class: 'num' }, formatEUR(budget)), h('span', { class: 'muted' }, '›')),
        h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Speso'), h('b', { class: 'num' }, formatEUR(sum.byCat[cat.id] || 0)))),
      h('div', { class: 'small muted', style: 'margin:-4px 16px 8px' }, 'Il budget vale anche per i periodi successivi finché non lo cambi.'),
      h('h2', {}, `Movimenti (${movs.length})`),
      movs.length ? h('div', { class: 'card' }, movs.map((m) => h('button', { class: 'row', onclick: () => editMovement(m, paint) },
        h('div', { class: 'grow' }, h('div', {}, m.note || cat.name), h('div', { class: 'small muted' }, fmtDate(m.date)), m.card && h('div', { class: 'small cardtag' }, cardIcon(), cardNote(m))),
        h('b', { class: 'num' }, formatEUR(m.amount))))) : h('div', { class: 'empty' }, 'Nessun movimento in questo periodo.'));
  };
  paint();
  return s;
}

export function fmtDate(d) {
  const [y, m, day] = d.split('-').map(Number);
  const wd = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(y, m - 1, day).getDay()];
  return `${wd} ${day}/${String(m).padStart(2, '0')}`;
}

function incomeSheet(key) {
  const s = openSheet({ title: 'Entrate' });
  const paint = () => {
    const sum = periodSummary(state, key);
    fill(s.body, 
      h('div', { class: 'card' },
        h('button', { class: 'row', onclick: async () => {
          const v = await askText('Stipendio del periodo', { value: centsToInput(sum.salary), inputmode: 'decimal' });
          if (v === null) return;
          const c = parseAmount(v); if (Number.isNaN(c)) return;
          await setSalary(key, c); paint();
        } }, h('div', { class: 'grow' }, 'Stipendio', h('div', { class: 'small muted' }, 'Tocca per modificarlo solo in questo periodo')), h('b', { class: 'num pos' }, formatEUR(sum.salary)), h('span', { class: 'muted' }, '›')),
        sum.extras.map((i) => h('button', { class: 'row', onclick: () => incomeForm(i, null, paint) },
          h('div', { class: 'grow' }, i.description, h('div', { class: 'small muted' }, fmtDate(i.date))), h('b', { class: 'num pos' }, '+' + formatEUR(i.amount))))),
      h('button', { class: 'btn-primary', onclick: () => incomeForm(null, sum.range.start > todayStr() ? sum.range.start : (todayStr() < sum.range.endExcl ? todayStr() : sum.range.start), paint) }, '+ Entrata extra'),
      h('div', { class: 'small muted center', style: 'margin-top:12px' }, 'Lo stipendio standard si imposta in Impostazioni.'));
  };
  paint();
}
