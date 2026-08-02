import { Tile } from './Tile';
import { TerrainType } from './Biomes';
import { RandomService } from '../core/Random';
import { GoodId, GOODS } from '../civ/Goods';

/**
 * Geology / surface-resource generation.
 *
 * Design goals:
 * - common resources are widespread;
 * - regional resources occur in recognisable belts/clusters;
 * - strategic resources are deliberately concentrated into a few basins so
 *   trade, diplomacy and conquest have something material to fight over;
 * - every placed resource is already a GoodId, so extraction never needs a
 *   translation table.
 */

export interface DepositSummary {
  tiles: Partial<Record<GoodId, number>>;
  amount: Partial<Record<GoodId, number>>;
}

const RENEWABLE = new Set<GoodId>(['food', 'wood', 'horses', 'cotton', 'spices', 'furs', 'rubber']);

export function isRenewableGood(good: GoodId | null | undefined): boolean {
  return !!good && RENEWABLE.has(good);
}

export function isFiniteDeposit(good: GoodId | null | undefined): boolean {
  return !!good && !RENEWABLE.has(good);
}

function isWater(type: TerrainType): boolean {
  return type === TerrainType.DEEP_OCEAN || type === TerrainType.SHALLOW_WATER;
}

function isLand(tile: Tile): boolean {
  return !isWater(tile.type) && tile.type !== TerrainType.LAVA;
}

function tierRank(good: GoodId | null): number {
  if (!good) return -1;
  const tier = GOODS[good]?.tier;
  return tier === 'strategic' ? 3 : tier === 'regional' ? 2 : 1;
}

function canReplace(existing: GoodId | null, incoming: GoodId): boolean {
  if (!existing || existing === incoming) return true;
  // Higher-tier geology may displace a common surface resource, but two deposits
  // of the same strategic importance should not erase each other by generation order.
  return tierRank(incoming) > tierRank(existing);
}

function setResource(tile: Tile, good: GoodId, amount: number, maxAmount: number = amount): void {
  if (!canReplace(tile.resourceType, good)) return;
  tile.resourceType = good;
  tile.resourceAmount = Math.max(1, Math.round(amount));
  tile.resourceMax = Math.max(tile.resourceAmount, Math.round(maxAmount));
}

function countForArea(width: number, height: number, baseAt128: number, minimum: number = 1): number {
  const scale = (width * height) / (128 * 128);
  return Math.max(minimum, Math.round(baseAt128 * scale));
}

type TilePredicate = (tile: Tile, x: number, y: number, grid: Tile[][]) => boolean;

interface ClusterSpec {
  good: GoodId;
  clusters: number;
  radius: number;
  minAmount: number;
  maxAmount: number;
  density: number;
  predicate: TilePredicate;
}

function placeClusteredResource(
  grid: Tile[][],
  width: number,
  height: number,
  rng: RandomService,
  spec: ClusterSpec
): void {
  const eligible: Array<{ x: number; y: number }> = [];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = grid[x][y];
      if (spec.predicate(tile, x, y, grid)) eligible.push({ x, y });
    }
  }
  if (eligible.length === 0) return;

  const usedCenters: Array<{ x: number; y: number }> = [];
  const minimumCenterDistance = Math.max(4, spec.radius * 2.2);

  for (let cluster = 0; cluster < spec.clusters; cluster++) {
    let center = rng.pick(eligible);
    for (let attempt = 0; attempt < 80; attempt++) {
      const candidate = rng.pick(eligible);
      const separated = usedCenters.every(c => Math.hypot(c.x - candidate.x, c.y - candidate.y) >= minimumCenterDistance);
      if (separated) {
        center = candidate;
        break;
      }
    }
    usedCenters.push(center);

    const r = spec.radius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const tile = grid[x][y];
        if (!spec.predicate(tile, x, y, grid)) continue;

        const dist = Math.hypot(dx, dy);
        if (dist > r + 0.35) continue;
        const centerBias = 1 - dist / (r + 0.75);
        const chance = Math.min(0.98, spec.density * (0.48 + centerBias * 0.72));
        if (!rng.chance(chance) && !(dx === 0 && dy === 0)) continue;

        const richness = 0.75 + centerBias * 0.55 + rng.range(-0.12, 0.12);
        const maxAmount = rng.range(spec.minAmount, spec.maxAmount) * richness;
        const initial = maxAmount * rng.range(0.72, 1.0);
        setResource(tile, spec.good, initial, maxAmount);
      }
    }
  }
}

function coastalLand(grid: Tile[][], width: number, height: number, x: number, y: number): boolean {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (isWater(grid[nx][ny].type)) return true;
  }
  return false;
}

/** Generate every natural resource deposit in a deterministic pass. */
export function generateDeposits(grid: Tile[][], width: number, height: number, seed: number): DepositSummary {
  const rng = new RandomService((seed ^ 0x5f3759df) >>> 0);

  // ---------------- Common surface resources ----------------
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = grid[x][y];
      if (!isLand(tile)) continue;

      if (tile.type === TerrainType.FOREST) {
        if (rng.chance(0.85)) {
          const max = rng.range(80, 170) * (0.75 + tile.moisture * 0.5);
          setResource(tile, 'wood', max * rng.range(0.72, 1), max);
        } else if (rng.chance(0.25)) {
          // Wild forest berry & mushroom food deposits
          const max = rng.range(50, 120) * (0.8 + tile.fertility * 0.5);
          setResource(tile, 'food', max * rng.range(0.6, 0.95), max);
        }
      } else if ((tile.type === TerrainType.GRASS || tile.type === TerrainType.SAVANNA || tile.type === TerrainType.SOIL) && rng.chance(0.35 + tile.moisture * 0.25)) {
        // Generous wild food, fruit trees and berry bush deposits
        const max = rng.range(60, 150) * (0.8 + tile.fertility * 0.6);
        setResource(tile, 'food', max * rng.range(0.65, 1.0), max);
      }

      if (tile.type === TerrainType.MOUNTAIN && rng.chance(0.5)) {
        const max = rng.range(90, 190);
        setResource(tile, 'stone', max * rng.range(0.75, 1), max);
      } else if ((tile.type === TerrainType.SOIL || tile.type === TerrainType.SAND) && rng.chance(coastalLand(grid, width, height, x, y) ? 0.22 : 0.09)) {
        const max = rng.range(50, 110);
        setResource(tile, 'clay', max * rng.range(0.7, 1), max);
      }
    }
  }

  const mountainOrHighland: TilePredicate = tile =>
    tile.type === TerrainType.MOUNTAIN || ((tile.type === TerrainType.SOIL || tile.type === TerrainType.GRASS) && tile.height > 0.61);

  const rockyDry: TilePredicate = tile =>
    tile.type === TerrainType.MOUNTAIN || tile.type === TerrainType.SAND || (tile.type === TerrainType.SOIL && tile.moisture < 0.42);

  const warmField: TilePredicate = tile =>
    (tile.type === TerrainType.GRASS || tile.type === TerrainType.SAVANNA || tile.type === TerrainType.SOIL) && tile.temperature >= 14;

  const tropical: TilePredicate = tile =>
    (tile.type === TerrainType.FOREST || tile.type === TerrainType.SWAMP) && tile.temperature >= 22 && tile.moisture >= 0.55;

  const coldLand: TilePredicate = tile =>
    tile.type === TerrainType.TUNDRA || tile.type === TerrainType.SNOW;

  // ---------------- Regional resources ----------------
  const regional: ClusterSpec[] = [
    { good: 'copper', clusters: countForArea(width, height, 11, 4), radius: 2, minAmount: 55, maxAmount: 120, density: 0.72, predicate: mountainOrHighland },
    { good: 'iron', clusters: countForArea(width, height, 13, 5), radius: 2, minAmount: 75, maxAmount: 155, density: 0.78, predicate: mountainOrHighland },
    { good: 'coal', clusters: countForArea(width, height, 9, 3), radius: 3, minAmount: 85, maxAmount: 180, density: 0.68, predicate: tile => mountainOrHighland(tile, 0, 0, grid) || tile.type === TerrainType.SWAMP },
    { good: 'salt', clusters: countForArea(width, height, 7, 3), radius: 2, minAmount: 60, maxAmount: 135, density: 0.62, predicate: (tile, x, y, g) => tile.type === TerrainType.SAND || (tile.type === TerrainType.SOIL && coastalLand(g, width, height, x, y)) },
    { good: 'gold', clusters: countForArea(width, height, 5, 2), radius: 2, minAmount: 30, maxAmount: 75, density: 0.5, predicate: mountainOrHighland },
    { good: 'gems', clusters: countForArea(width, height, 4, 2), radius: 1, minAmount: 24, maxAmount: 58, density: 0.6, predicate: tile => tile.type === TerrainType.MOUNTAIN && tile.height > 0.7 },
    { good: 'horses', clusters: countForArea(width, height, 8, 3), radius: 3, minAmount: 45, maxAmount: 100, density: 0.5, predicate: tile => tile.type === TerrainType.GRASS || tile.type === TerrainType.SAVANNA },
    { good: 'cotton', clusters: countForArea(width, height, 9, 3), radius: 3, minAmount: 55, maxAmount: 115, density: 0.58, predicate: warmField },
    { good: 'spices', clusters: countForArea(width, height, 5, 2), radius: 2, minAmount: 35, maxAmount: 85, density: 0.5, predicate: tropical },
    { good: 'furs', clusters: countForArea(width, height, 6, 2), radius: 3, minAmount: 40, maxAmount: 90, density: 0.5, predicate: coldLand }
  ];
  for (const spec of regional) placeClusteredResource(grid, width, height, rng, spec);

  // ---------------- Strategic resources ----------------
  // Few clusters, but each cluster is rich enough to support a region for many years.
  const strategic: ClusterSpec[] = [
    { good: 'tin', clusters: countForArea(width, height, 5, 2), radius: 2, minAmount: 45, maxAmount: 100, density: 0.56, predicate: mountainOrHighland },
    { good: 'oil', clusters: countForArea(width, height, 4, 2), radius: 3, minAmount: 140, maxAmount: 310, density: 0.7, predicate: tile => (tile.type === TerrainType.SAND || tile.type === TerrainType.SWAMP || tile.type === TerrainType.SAVANNA || tile.type === TerrainType.SOIL) && tile.height < 0.72 },
    { good: 'saltpeter', clusters: countForArea(width, height, 5, 2), radius: 2, minAmount: 55, maxAmount: 120, density: 0.55, predicate: rockyDry },
    { good: 'rubber', clusters: countForArea(width, height, 5, 2), radius: 3, minAmount: 70, maxAmount: 150, density: 0.58, predicate: tropical },
    { good: 'uranium', clusters: countForArea(width, height, 2, 1), radius: 2, minAmount: 45, maxAmount: 95, density: 0.48, predicate: tile => tile.type === TerrainType.MOUNTAIN && tile.height > 0.78 }
  ];
  for (const spec of strategic) placeClusteredResource(grid, width, height, rng, spec);

  const summary: DepositSummary = { tiles: {}, amount: {} };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = grid[x][y];
      const good = tile.resourceType;
      if (!good) continue;
      summary.tiles[good] = (summary.tiles[good] ?? 0) + 1;
      summary.amount[good] = (summary.amount[good] ?? 0) + tile.resourceAmount;
    }
  }
  return summary;
}
