// Logica dei periodi di budget. Le date sono stringhe 'YYYY-MM-DD' (nessun fuso orario in gioco).
// Un periodo è identificato dal mese in cui inizia: chiave 'YYYY-MM'.

export const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function addDays(s, n) {
  const { y, m, d } = parseYmd(s);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Giorni da a a b (b - a). */
export function diffDays(a, b) {
  const pa = parseYmd(a), pb = parseYmd(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

export function todayStr(now = new Date()) {
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Il giorno di inizio è limitato a 1..28 così esiste in ogni mese (febbraio compreso). */
export function clampStartDay(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return 27;
  return Math.min(28, Math.max(1, n));
}

const keyOf = (y, m) => `${y}-${pad(m)}`;
export function parseKey(key) {
  const [y, m] = key.split('-').map(Number);
  return { y, m };
}

export function addPeriods(key, n) {
  const { y, m } = parseKey(key);
  const idx = y * 12 + (m - 1) + n;
  return keyOf(Math.floor(idx / 12), (idx % 12) + 1);
}

export function periodKeyForDate(dateStr, startDay = 27) {
  const { y, m, d } = parseYmd(dateStr);
  return d >= startDay ? keyOf(y, m) : addPeriods(keyOf(y, m), -1);
}

/** start = primo giorno, endExcl = primo giorno del periodo successivo, endIncl = ultimo giorno. */
export function periodRange(key, startDay = 27) {
  const { y, m } = parseKey(key);
  const next = parseKey(addPeriods(key, 1));
  const start = ymd(y, m, startDay);
  const endExcl = ymd(next.y, next.m, startDay);
  return { start, endExcl, endIncl: addDays(endExcl, -1) };
}

export function inPeriod(dateStr, key, startDay = 27) {
  const r = periodRange(key, startDay);
  return dateStr >= r.start && dateStr < r.endExcl;
}

/** "27 ott – 26 nov 2026" (l'anno compare su entrambi i lati solo se diverso). */
export function periodLabel(key, startDay = 27) {
  const r = periodRange(key, startDay);
  const a = parseYmd(r.start), b = parseYmd(r.endIncl);
  const left = `${a.d} ${MESI[a.m - 1]}${a.y !== b.y ? ' ' + a.y : ''}`;
  return `${left} – ${b.d} ${MESI[b.m - 1]} ${b.y}`;
}

export function periodShort(key) {
  const { y, m } = parseKey(key);
  return `${MESI[m - 1]} ${String(y).slice(2)}`;
}

/** Giorni dal giorno `today` (compreso) fino alla fine del periodo (escluso il giorno di inizio del successivo). */
export function daysLeft(key, today, startDay = 27) {
  const r = periodRange(key, startDay);
  if (today < r.start) return diffDays(r.start, r.endExcl);
  if (today >= r.endExcl) return 0;
  return diffDays(today, r.endExcl);
}

export function nextStartLabel(key, startDay = 27) {
  const r = periodRange(key, startDay);
  const p = parseYmd(r.endExcl);
  return `${p.d} ${MESI[p.m - 1]}`;
}

/** "ott 2026" per la chiave di periodo. */
export function monthName(key) {
  const { y, m } = parseKey(key);
  return `${MESI[m - 1]} ${y}`;
}

// Carta di credito: gli acquisti vengono addebitati il giorno CARD_CHARGE_DAY del mese solare successivo.
export const CARD_CHARGE_DAY = 10;
export const CARD_BANKS = ['ING', 'Fineco'];

export function chargeDate(dateStr, day = CARD_CHARGE_DAY) {
  const { y, m } = parseYmd(dateStr);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return ymd(next.y, next.m, day);
}

/** "16/10/2026" */
export function fmtDMY(dateStr) {
  const { y, m, d } = parseYmd(dateStr);
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** Data di scadenza (giorno del mese `dueDay`) che cade nel periodo `key`; null se non impostata. Nei mesi corti usa l'ultimo giorno. */
export function dueDateFor(key, startDay, dueDay) {
  if (!dueDay) return null;
  const t = dueDay >= startDay ? parseKey(key) : parseKey(addPeriods(key, 1));
  const dim = new Date(Date.UTC(t.y, t.m, 0)).getUTCDate();
  return ymd(t.y, t.m, Math.min(dueDay, dim));
}
