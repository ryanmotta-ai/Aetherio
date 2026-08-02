import { TerrainType } from '../world/Biomes';
import type { Tile, TileResource } from '../world/Tile';
import { ALL_GOODS, GOODS } from '../civ/Goods';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface TerrainVisual {
  base: string;
  low: string;
  high: string;
  shadow: string;
  accent: string;
}

export const TERRAIN_VISUALS: Record<TerrainType, TerrainVisual> = {
  [TerrainType.DEEP_OCEAN]: {
    base: '#102542',
    low: '#07111f',
    high: '#2e6fa4',
    shadow: '#030712',
    accent: '#7dd3fc'
  },
  [TerrainType.SHALLOW_WATER]: {
    base: '#2478a6',
    low: '#14547f',
    high: '#5fd0dd',
    shadow: '#0c3564',
    accent: '#d7fbff'
  },
  [TerrainType.SAND]: {
    base: '#d8b968',
    low: '#a77738',
    high: '#f7df9b',
    shadow: '#815428',
    accent: '#fff4bf'
  },
  [TerrainType.SOIL]: {
    base: '#765033',
    low: '#4d2f20',
    high: '#a7794e',
    shadow: '#2e1c15',
    accent: '#c6935f'
  },
  [TerrainType.GRASS]: {
    base: '#3f9849',
    low: '#1f6035',
    high: '#76bf65',
    shadow: '#173f28',
    accent: '#c9db6d'
  },
  [TerrainType.FOREST]: {
    base: '#236d3e',
    low: '#123d29',
    high: '#4f9f58',
    shadow: '#0a241a',
    accent: '#9fd46e'
  },
  [TerrainType.SAVANNA]: {
    base: '#b89445',
    low: '#75632b',
    high: '#d9c76d',
    shadow: '#4f3d1c',
    accent: '#f3df8a'
  },
  [TerrainType.SWAMP]: {
    base: '#3d6b47',
    low: '#1c4038',
    high: '#698756',
    shadow: '#102522',
    accent: '#8fbf7a'
  },
  [TerrainType.TUNDRA]: {
    base: '#6a9b9b',
    low: '#405f66',
    high: '#a7c8bd',
    shadow: '#263b46',
    accent: '#d7eadf'
  },
  [TerrainType.SNOW]: {
    base: '#d9e7eb',
    low: '#a4b6bf',
    high: '#fffaf0',
    shadow: '#7f9fb2',
    accent: '#ffffff'
  },
  [TerrainType.MOUNTAIN]: {
    base: '#71777c',
    low: '#40484f',
    high: '#b0b4b8',
    shadow: '#232b32',
    accent: '#e2e8f0'
  },
  [TerrainType.LAVA]: {
    base: '#cf3b24',
    low: '#5a1915',
    high: '#ffca4e',
    shadow: '#1b0f12',
    accent: '#fff0a6'
  },
  [TerrainType.ARCANE]: {
    base: '#7951b8',
    low: '#2d1b50',
    high: '#c79bff',
    shadow: '#171024',
    accent: '#dff7ff'
  },
  [TerrainType.CORRUPTED]: {
    base: '#4d315f',
    low: '#1c1424',
    high: '#8050a0',
    shadow: '#0f0a14',
    accent: '#d946ef'
  }
};

/**
 * Map colour for each deposit, taken straight from the goods table so a new
 * material never renders as an untinted blank tile.
 */
export const RESOURCE_COLORS: Record<Exclude<TileResource, null>, string> =
  Object.fromEntries(ALL_GOODS.map(good => [good, GOODS[good].color])) as Record<Exclude<TileResource, null>, string>;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hash2(x: number, y: number, salt: number = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function parseColor(color: string): Rgb {
  if (color.startsWith('#')) {
    const raw = color.slice(1);
    const hex = raw.length === 3
      ? raw.split('').map(ch => ch + ch).join('')
      : raw.padEnd(6, '0').slice(0, 6);
    const num = parseInt(hex, 16);
    if (!Number.isNaN(num)) {
      return {
        r: (num >> 16) & 0xff,
        g: (num >> 8) & 0xff,
        b: num & 0xff
      };
    }
  }

  const nums = color.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return {
      r: clamp(Math.round(Number(nums[0])), 0, 255),
      g: clamp(Math.round(Number(nums[1])), 0, 255),
      b: clamp(Math.round(Number(nums[2])), 0, 255)
    };
  }

  return { r: 0, g: 0, b: 0 };
}

export function toRgbString(rgb: Rgb): string {
  return `rgb(${clamp(Math.round(rgb.r), 0, 255)}, ${clamp(Math.round(rgb.g), 0, 255)}, ${clamp(Math.round(rgb.b), 0, 255)})`;
}

export function mixColor(a: string, b: string, amount: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const t = clamp(amount, 0, 1);
  return toRgbString({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t
  });
}

export function shadeColor(color: string, factor: number): string {
  const c = parseColor(color);
  return toRgbString({
    r: c.r * factor,
    g: c.g * factor,
    b: c.b * factor
  });
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${clamp(alpha, 0, 1)})`;
}

export function terrainSurfaceColor(tile: Tile, x: number, y: number, animTimer: number = 0): string {
  const visual = TERRAIN_VISUALS[tile.type];
  const grain = hash2(x, y, 11) - 0.5;

  if (tile.type === TerrainType.DEEP_OCEAN || tile.type === TerrainType.SHALLOW_WATER) {
    const wave = Math.sin(x * 0.38 + y * 0.46 + animTimer * 0.8) * 0.5 + 0.5;
    const tide = Math.sin(x * 0.11 - y * 0.16 + animTimer * 0.35) * 0.5 + 0.5;
    return mixColor(visual.low, visual.high, clamp(wave * 0.55 + tide * 0.25 + hash2(x, y, 19) * 0.2, 0, 1));
  }

  if (tile.type === TerrainType.LAVA) {
    const pulse = Math.sin(x * 0.7 + y * 0.9 + animTimer * 1.8) * 0.5 + 0.5;
    return mixColor(visual.low, visual.high, clamp(0.25 + pulse * 0.55 + hash2(x, y, 31) * 0.2, 0, 1));
  }

  let factor = 0.84 + tile.height * 0.28 + grain * 0.14;
  if (tile.moisture > 0.65 && (tile.type === TerrainType.GRASS || tile.type === TerrainType.FOREST)) factor += 0.05;
  if (tile.temperature < -5 && tile.type !== TerrainType.SNOW) factor += 0.04;

  return shadeColor(visual.base, clamp(factor, 0.58, 1.25));
}
