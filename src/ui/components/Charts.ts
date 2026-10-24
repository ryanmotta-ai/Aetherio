import { el, formatNumber } from '../core/Dom';

/**
 * Pixel-art chart helpers, styled after gritty WW2 strategy-game HUDs:
 * gunmetal plates, rivets, stencil lettering and hard-edged, dithered fills.
 *
 * Every chart is drawn on a tiny logical canvas (1 logical px = PX css px) and
 * scaled up with `image-rendering: pixelated`, so nothing is ever anti-aliased.
 * Deliberately dependency-free — the whole game ships without a chart library.
 */

/** Css pixels per logical pixel. */
const PX = 3;

const STEEL = {
  void: '#0b0e11',
  plate: '#1a2026',
  plateLight: '#242c34',
  bevelHi: '#4a5560',
  bevelLo: '#07090b',
  rivet: '#6b7782',
  rivetHi: '#a3afb9',
  grid: '#2c353e',
  axis: '#56626d',
  text: '#b4bfc8',
  textHi: '#f1f5f9'
};

export interface LineSeries {
  label: string;
  color: string;
  values: number[];
}

// ---------------------------------------------------------------------------
// Pixel toolkit
// ---------------------------------------------------------------------------

/** 3x5 stencil font — digits, capitals and a little punctuation. */
const GLYPHS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111',
  A: '111101111101101', B: '110101110101110', C: '111100100100111', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '111100101101111', H: '101101111101101',
  I: '111010010010111', J: '001001001101111', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '111101101101111', P: '111101111100100',
  Q: '111101101111001', R: '110101110101101', S: '111100111001111', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '.': '000000000000010', '-': '000000111000000', ' ': '000000000000000', '/': '001001010100100',
  '+': '000010111010000', '%': '101001010100101'
};

class Pixels {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(readonly w: number, readonly h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.className = 'pixel-canvas';
    this.canvas.style.aspectRatio = `${w} / ${h}`;
    this.canvas.style.maxWidth = `${w * PX}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  px(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Bresenham line, 1px wide. */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  text(str: string, x: number, y: number, color: string, align: 'left' | 'right' | 'center' = 'left'): void {
    const s = str.toUpperCase();
    const width = s.length * 4 - 1;
    let cx = align === 'left' ? x : align === 'right' ? x - width : x - Math.floor(width / 2);
    for (const ch of s) {
      const bits = GLYPHS[ch] ?? GLYPHS[' '];
      for (let i = 0; i < 15; i++) {
        if (bits[i] === '1') this.px(cx + (i % 3), y + Math.floor(i / 3), color);
      }
      cx += 4;
    }
  }

  /** Riveted steel plate with a bevel, filling the whole canvas. */
  plate(): void {
    const { w, h } = this;
    this.rect(0, 0, w, h, STEEL.void);
    this.rect(1, 1, w - 2, h - 2, STEEL.plate);
    this.rect(0, 0, w, 1, STEEL.bevelHi);
    this.rect(0, 0, 1, h, STEEL.bevelHi);
    this.rect(0, h - 1, w, 1, STEEL.bevelLo);
    this.rect(w - 1, 0, 1, h, STEEL.bevelLo);
    for (const [rx, ry] of [[2, 2], [w - 4, 2], [2, h - 4], [w - 4, h - 4]]) this.rivet(rx, ry);
  }

  rivet(x: number, y: number): void {
    this.rect(x, y, 2, 2, STEEL.rivet);
    this.px(x, y, STEEL.rivetHi);
  }
}

function shade(hex: string, amount: number): string {
  const full = hex.replace('#', '');
  const f = full.length === 3 ? full.split('').map(c => c + c).join('') : full;
  const n = parseInt(f, 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * (amount < 0 ? v : 255 - v))));
  return `rgb(${ch((n >> 16) & 255)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

function axisNumber(v: number): string {
  return formatNumber(v).replace('k', 'K');
}

function legend(items: { label: string; color: string; value?: string }[], cls: string): HTMLElement {
  return el(
    'div',
    { class: cls },
    items.map(s =>
      el('div', { class: 'legend-item' }, [
        el('i', { class: 'legend-swatch', style: { background: s.color } }),
        el('span', { class: 'legend-name', text: s.label }),
        s.value ? el('span', { class: 'legend-value', text: s.value }) : null
      ])
    )
  );
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

interface PlotOptions {
  height?: number;
  /** Prefix for X axis labels, e.g. "YR". */
  xPrefix?: string;
  /** Override the logical width (default 214 ≈ 640 css px). */
  width?: number;
  /** Draw a value callout over the final point of the first series. */
  callout?: (v: number) => string;
  /** Pin the Y range instead of using 0..max. */
  yRange?: [number, number];
}

function drawPlot(series: LineSeries[], labels: number[], opts: PlotOptions): Pixels {
  const W = opts.width ?? 214;
  const H = Math.round((opts.height ?? 200) / PX);
  const g = new Pixels(W, H);
  g.plate();

  const padL = 20;
  const padR = 8;
  const padT = 8;
  const padB = 12;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const all = series.flatMap(s => s.values);
  const [minV, maxV] = opts.yRange ?? [0, Math.max(1, ...all)];
  const range = Math.max(1e-6, maxV - minV);
  const count = Math.max(...series.map(s => s.values.length), 1);

  const xAt = (i: number) => padL + (count <= 1 ? plotW / 2 : (plotW / (count - 1)) * i);
  const yAt = (v: number) => padT + plotH - ((v - minV) / range) * plotH;

  // Dotted gridlines + Y labels
  // Small integer ranges get one gridline per whole unit so labels never repeat.
  const steps = !opts.yRange && maxV <= 4 && Number.isInteger(maxV) ? maxV : 4;
  for (let i = 0; i <= steps; i++) {
    const y = Math.round(padT + (plotH / steps) * i);
    for (let x = padL; x <= padL + plotW; x += 2) g.px(x, y, i === steps ? STEEL.axis : STEEL.grid);
    g.text(axisNumber(minV + range * (1 - i / steps)), padL - 3, y - 2, STEEL.text, 'right');
  }
  // Y axis rail
  g.rect(padL, padT, 1, plotH + 1, STEEL.axis);

  // X ticks
  if (labels.length > 0) {
    const marks = [...new Set([0, Math.floor(labels.length / 2), labels.length - 1])];
    for (const idx of marks) {
      const x = Math.round(xAt(idx));
      g.rect(x, padT + plotH + 1, 1, 2, STEEL.axis);
      const align = idx === 0 ? 'left' : idx === labels.length - 1 ? 'right' : 'center';
      g.text(`${opts.xPrefix ?? 'YR'} ${labels[idx]}`, x, H - 7, STEEL.text, align);
    }
  }

  const baseY = padT + plotH;
  for (const s of series) {
    if (s.values.length === 0) continue;
    const fill = shade(s.color, -0.62);

    // Dithered area fill: checkerboard under the line, fading out toward the base.
    for (let i = 0; i < s.values.length - 1; i++) {
      const x0 = Math.round(xAt(i));
      const x1 = Math.round(xAt(i + 1));
      for (let x = x0; x <= x1; x++) {
        const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
        const top = Math.round(yAt(s.values[i] + (s.values[i + 1] - s.values[i]) * t));
        for (let y = top + 2; y < baseY; y++) {
          const depth = (y - top) / Math.max(1, baseY - top);
          const dense = depth < 0.4 ? (x + y) % 2 === 0 : (x % 2 === 0 && y % 2 === 0);
          if (dense) g.px(x, y, fill);
        }
      }
    }

    // Line: 1px shadow underneath, then the bright core.
    const dark = shade(s.color, -0.55);
    for (let i = 0; i < s.values.length - 1; i++) {
      g.line(xAt(i), yAt(s.values[i]) + 1, xAt(i + 1), yAt(s.values[i + 1]) + 1, dark);
    }
    for (let i = 0; i < s.values.length - 1; i++) {
      g.line(xAt(i), yAt(s.values[i]), xAt(i + 1), yAt(s.values[i + 1]), s.color);
    }
    if (s.values.length === 1) g.px(xAt(0), yAt(s.values[0]), s.color);
  }

  // Head markers drawn last so they sit above every line.
  for (const s of series) {
    if (s.values.length === 0) continue;
    const hx = Math.round(xAt(s.values.length - 1));
    const hy = Math.round(yAt(s.values[s.values.length - 1]));
    g.rect(hx - 2, hy - 2, 5, 5, STEEL.void);
    g.rect(hx - 1, hy - 1, 3, 3, s.color);
    g.px(hx, hy, STEEL.textHi);
  }

  // Callout tag riveted onto the first series' last point.
  if (opts.callout && series[0]?.values.length) {
    const s = series[0];
    const last = s.values[s.values.length - 1];
    const label = opts.callout(last);
    const tw = label.length * 4 + 3;
    const hx = Math.round(xAt(s.values.length - 1));
    const hy = Math.round(yAt(last));
    const tx = Math.max(padL + 2, Math.min(W - padR - tw, hx - tw - 3));
    const ty = hy - 12 < padT ? hy + 5 : hy - 12;
    g.rect(tx - 1, ty - 1, tw + 2, 9, STEEL.void);
    g.rect(tx, ty, tw, 7, s.color);
    g.text(label, tx + 2, ty + 1, STEEL.void);
  }

  return g;
}

/** Multi-series line chart with a labelled Y axis and a legend. */
export function lineChart(
  series: LineSeries[],
  labels: number[],
  opts: { width?: number; height?: number; yLabel?: string } = {}
): HTMLElement {
  const g = drawPlot(series, labels, { height: opts.height });
  return el('div', { class: 'chart' }, [g.canvas, legend(series, 'chart-legend')]);
}

/** Single-series price chart used by the stock market screen. */
export function stockChart(
  values: number[],
  color: string,
  opts: { height?: number; yRange?: [number, number]; xPrefix?: string; callout?: (v: number) => string } = {}
): HTMLElement {
  const g = drawPlot(
    [{ label: '', color, values }],
    values.map((_, i) => i + 1),
    { height: opts.height ?? 220, xPrefix: opts.xPrefix ?? 'ANO', yRange: opts.yRange, callout: opts.callout }
  );
  return el('div', { class: 'chart chart-stock' }, [g.canvas]);
}

// ---------------------------------------------------------------------------
// Bar list
// ---------------------------------------------------------------------------

export interface BarDatum {
  label: string;
  value: number;
  color: string;
  sublabel?: string;
}

/** Horizontal gauge list — used for kingdom power and species population. */
export function barList(data: BarDatum[], opts: { max?: number; formatValue?: (v: number) => string } = {}): HTMLElement {
  const max = opts.max ?? Math.max(1, ...data.map(d => d.value));
  const fmt = opts.formatValue ?? formatNumber;

  return el(
    'div',
    { class: 'bar-list' },
    data.map(d =>
      el('div', { class: 'bar-row' }, [
        el('div', { class: 'bar-head' }, [
          el('span', { class: 'bar-label', text: d.label }),
          el('span', { class: 'bar-value', text: fmt(d.value) })
        ]),
        el('div', { class: 'bar-track' }, [
          el('div', {
            class: 'bar-fill',
            style: {
              width: `${Math.max(2, (d.value / max) * 100)}%`,
              background: d.color,
              boxShadow: `inset 0 3px 0 ${shade(d.color, 0.35)}, inset 0 -3px 0 ${shade(d.color, -0.4)}`
            }
          })
        ]),
        d.sublabel ? el('span', { class: 'bar-sub', text: d.sublabel }) : null
      ])
    )
  );
}

// ---------------------------------------------------------------------------
// Donut
// ---------------------------------------------------------------------------

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Pixel donut with a stencilled total in the hub, used for the species split. */
export function donutChart(slices: DonutSlice[], centerLabel: string, size = 180): HTMLElement {
  const N = Math.round(size / 3);
  const g = new Pixels(N, N);
  g.canvas.style.width = `${N * 3}px`;
  g.canvas.style.maxWidth = '';
  g.canvas.style.aspectRatio = '1 / 1';

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const c = (N - 1) / 2;
  const outer = N / 2 - 1.5;
  const inner = outer * 0.64;

  // Cumulative slice boundaries, as fractions of a full turn starting at 12 o'clock.
  const bounds: number[] = [];
  let acc = 0;
  for (const s of slices) {
    acc += total > 0 ? s.value / total : 0;
    bounds.push(acc);
  }

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d > outer + 1 || d < inner - 1) continue;

      // Steel casing on the rim of the ring.
      if (d > outer || d < inner) { g.px(x, y, STEEL.void); continue; }
      if (d > outer - 1 || d < inner + 1) {
        g.px(x, y, d > outer - 1 ? STEEL.bevelHi : STEEL.plateLight);
        continue;
      }

      if (total <= 0) { g.px(x, y, STEEL.plateLight); continue; }
      const turn = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
      let idx = bounds.findIndex(b => turn < b);
      if (idx < 0) idx = slices.length - 1;
      // Slice divider: one dark pixel column at each boundary.
      const edge = bounds.some(b => Math.abs(turn - b) * Math.PI * 2 * d < 0.75) || turn * Math.PI * 2 * d < 0.75;
      const base = slices[idx].color;
      // Light from the top-left: outer edge brighter, inner edge darker.
      const t = (d - inner) / (outer - inner);
      g.px(x, y, edge ? STEEL.void : t > 0.7 ? shade(base, 0.25) : t < 0.25 ? shade(base, -0.3) : base);
    }
  }

  // Hub plate with the total.
  g.text(axisNumber(total), Math.round(c), Math.round(c) - 3, STEEL.textHi, 'center');
  g.text(centerLabel.slice(0, 8), Math.round(c), Math.round(c) + 3, STEEL.axis, 'center');

  return el('div', { class: 'donut' }, [
    g.canvas,
    legend(slices.map(s => ({ label: s.label, color: s.color, value: formatNumber(s.value) })), 'donut-legend')
  ]);
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

/** Compact inline sparkline for HUD/stat tiles. */
export function sparkline(values: number[], color: string, width = 120, height = 32): HTMLElement {
  const W = Math.round(width / 2);
  const H = Math.round(height / 2);
  const g = new Pixels(W, H);
  g.canvas.style.width = `${width}px`;
  g.canvas.style.maxWidth = '';
  g.canvas.style.aspectRatio = `${W} / ${H}`;
  if (values.length < 2) return el('div', { class: 'sparkline' }, [g.canvas]);

  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const pt = (v: number, i: number): [number, number] => [
    ((W - 1) / (values.length - 1)) * i,
    H - 2 - ((v - min) / range) * (H - 4)
  ];

  const dark = shade(color, -0.55);
  for (let i = 0; i < values.length - 1; i++) {
    const [x0, y0] = pt(values[i], i);
    const [x1, y1] = pt(values[i + 1], i + 1);
    g.line(x0, y0 + 1, x1, y1 + 1, dark);
  }
  for (let i = 0; i < values.length - 1; i++) {
    const [x0, y0] = pt(values[i], i);
    const [x1, y1] = pt(values[i + 1], i + 1);
    g.line(x0, y0, x1, y1, color);
  }
  return el('div', { class: 'sparkline' }, [g.canvas]);
}
