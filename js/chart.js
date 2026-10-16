// Grafico a colonne in SVG: uscite impilate (fisse + variabili), tick verde per le entrate. I periodi futuri sono attenuati.
import { state } from './store.js';
import { projection } from './calc.js';
import { periodShort } from './period.js';
import { isMasked } from './money.js';
import { currentKey } from './ctx.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, a, t) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (t) e.textContent = t; return e; };

export function barChart(keys, selected, onPick) {
  const cur = currentKey();
  const data = keys.map((k) => projection(state, k, cur));
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.out)));
  const n = data.length, W = 340, H = 170, top = 16, bot = 22;
  const bw = Math.min(30, (W - 8) / n * 0.62), gap = (W - n * bw) / (n + 1), ch = H - top - bot;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', width: '100%', role: 'img', 'aria-label': 'Entrate e uscite per periodo' });
  data.forEach((d, i) => {
    const x = gap + i * (bw + gap);
    const hf = (d.fixed / max) * ch, hv = (d.variable / max) * ch;
    const dim = d.future ? 0.4 : d.k === selected ? 1 : 0.6;
    const g = el('g', { style: 'cursor:pointer' });
    g.addEventListener('click', () => onPick(d.key));
    g.append(el('rect', { x: x - gap / 2, y: 0, width: bw + gap, height: H, fill: 'transparent' }));
    if (d.key === selected) g.append(el('rect', { x: x - 4, y: 2, width: bw + 8, height: H - 4, rx: 6, fill: 'var(--fill)' }));
    g.append(el('rect', { x, y: top + ch - hf - hv, width: bw, height: hv, rx: 3, fill: 'var(--blue)', opacity: d.key === selected ? 1 : dim }));
    g.append(el('rect', { x, y: top + ch - hf, width: bw, height: hf, rx: 3, fill: 'var(--muted)', opacity: d.key === selected ? 0.85 : dim * 0.75 }));
    if (d.income) {
      const yi = top + ch - (d.income / max) * ch;
      g.append(el('line', { x1: x - 3, x2: x + bw + 3, y1: yi, y2: yi, stroke: 'var(--green)', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: d.future ? 0.55 : 1 }));
    }
    g.append(el('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle', 'font-weight': d.key === cur ? 700 : 400, style: d.key === cur ? 'fill:var(--blue)' : '' }, periodShort(d.key).split(' ')[0]));
    if (n <= 8 && d.out && !isMasked()) g.append(el('text', { x: x + bw / 2, y: top + ch - hf - hv - 3, 'text-anchor': 'middle' }, Math.round(d.out / 100)));
    svg.append(g);
  });
  return svg;
}
