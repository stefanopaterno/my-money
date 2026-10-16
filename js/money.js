// Importi sempre interi in centesimi.

const fmt = new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR', useGrouping: 'always',
});
const fmtPlain = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always',
});

// Privacy: quando attiva, ogni importo mostrato nell'app diventa "•••• €" (tranne dove si passa reveal=true, es. mentre si digita).
let masked = false;
export const setMasked = (b) => { masked = !!b; };
export const isMasked = () => masked;
const MASK = '••••\u00a0€';

export const formatEUR = (cents, reveal = false) => (masked && !reveal ? MASK : fmt.format(cents / 100));
/** Senza simbolo, es. "1.234,56". */
export const formatNum = (cents, reveal = false) => (masked && !reveal ? '••••' : fmtPlain.format(cents / 100));
/** Senza decimali se interi: "800 €" / "12,50 €". */
export const formatShort = (cents, reveal = false) =>
  masked && !reveal ? MASK : cents % 100 === 0
    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' }).format(cents / 100)
    : formatEUR(cents);

/** "12,5" | "12.50" | "1.234,56" -> 1250 | 1250 | 123456. NaN se non valido. */
export function parseAmount(str) {
  let s = String(str).trim().replace(/\s|€/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === '.') return NaN;
  return Math.round(parseFloat(s) * 100);
}

/** Stringa del tastierino ("12,5") -> centesimi (0 se vuota). */
export function keypadToCents(str) {
  if (!str) return 0;
  const v = parseAmount(str);
  return Number.isNaN(v) ? 0 : v;
}

/** Aggiunge un tasto alla stringa del tastierino con le regole: max 2 decimali, una sola virgola, max 7 cifre intere. */
export function keypadPress(str, key) {
  if (key === 'back') return str.slice(0, -1);
  if (key === ',') {
    if (str.includes(',')) return str;
    return (str === '' ? '0' : str) + ',';
  }
  const [int, dec] = str.split(',');
  if (dec !== undefined) return dec.length >= 2 ? str : str + key;
  if (str === '0') return key === '0' ? str : key;
  return int.length >= 7 ? str : str + key;
}

/** Cents -> stringa editabile "12,50". */
export const centsToInput = (c) => (c / 100).toFixed(2).replace('.', ',');
