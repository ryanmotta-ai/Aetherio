import { GoodId, GOODS } from './Goods';
import { TradeRoute } from './Trade';
import { City } from './City';
import { Kingdom } from './Kingdom';
import { TileMap } from '../world/TileMap';
import { TERRAINS } from '../world/Biomes';
import { ParticleManager } from '../renderer/Particles';
import { SimplePathfinder } from '../ai/Pathfinding';
import { chronicle } from './Chronicle';

export type CaravanType = 'donkey' | 'camel' | 'cart';

export interface OverlandCaravan {
  id: string;
  routeId: string;
  fromKingdomId: string;
  toKingdomId: string;
  fromCityName: string;
  toCityName: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  x: number;
  y: number;
  progress: number; // 0..1
  direction: 1 | -1; // 1: towards end, -1: returning to start
  caravanType: CaravanType;
  cargo: GoodId;
  cargoAmount: number;
  kingdomColor: string;
  speed: number;
  path?: { x: number; y: number }[];
}

/** Road speed multiplier per road level */
const ROAD_SPEED_BONUS: Record<number, number> = {
  0: 1.0,
  1: 1.25,
  2: 1.5,
  3: 2.0
};

/** Road traffic thresholds for road evolution */
const ROAD_UPGRADE_THRESHOLDS = {
  dirt: 5,       // traffic >= 5 → Dirt Trail (Level 1)
  stone: 25,     // traffic >= 25 → Stone Road (Level 2)
  imperial: 80   // traffic >= 80 → Imperial Highway (Level 3)
};

/** Minimum traffic fraction to maintain a road level (below this, road degrades) */
const ROAD_DEGRADE_FRACTION = 0.3;

/** Yearly traffic decay factor */
const ROAD_TRAFFIC_DECAY = 0.85;

export class CaravanSystem {
  public activeCaravans: Map<string, OverlandCaravan> = new Map();

  /**
   * Called once per year to decay road traffic across the entire map.
   * Roads that are no longer used will gradually degrade.
   */
  public decayRoadTraffic(tileMap: TileMap): void {
    for (let x = 0; x < tileMap.width; x++) {
      for (let y = 0; y < tileMap.height; y++) {
        const tile = tileMap.grid[x][y];
        if (tile.roadTraffic > 0) {
          tile.roadTraffic = Math.floor(tile.roadTraffic * ROAD_TRAFFIC_DECAY);

          // Degrade road level if traffic drops too low
          if (tile.roadLevel === 3 && tile.roadTraffic < ROAD_UPGRADE_THRESHOLDS.imperial * ROAD_DEGRADE_FRACTION) {
            tile.roadLevel = 2;
          } else if (tile.roadLevel === 2 && tile.roadTraffic < ROAD_UPGRADE_THRESHOLDS.stone * ROAD_DEGRADE_FRACTION) {
            tile.roadLevel = 1;
          } else if (tile.roadLevel === 1 && tile.roadTraffic < ROAD_UPGRADE_THRESHOLDS.dirt * ROAD_DEGRADE_FRACTION) {
            tile.roadLevel = 0;
          }
        }
      }
    }
  }

  public updateCaravans(
    routes: Map<string, TradeRoute>,
    cities: Map<string, City>,
    kingdoms: Map<string, Kingdom>,
    tileMap: TileMap,
    particles: ParticleManager,
    currentYear: number
  ): void {
    const activeRouteIds = new Set<string>();

    for (const route of routes.values()) {
      if (route.kind !== 'overland' || !route.active) continue;
      activeRouteIds.add(route.id);

      const fromCity = cities.get(route.fromCityId);
      const toCity = cities.get(route.toCityId);
      if (!fromCity || !toCity) continue;

      const fromKingdom = route.fromKingdomId ? kingdoms.get(route.fromKingdomId) : null;
      const toKingdom = route.toKingdomId ? kingdoms.get(route.toKingdomId) : null;

      // Spawn caravan if not present for this overland route
      if (!this.activeCaravans.has(route.id)) {
        const dist = Math.hypot(toCity.x - fromCity.x, toCity.y - fromCity.y);
        const caravanType: CaravanType = dist > 15 ? 'camel' : dist > 8 ? 'cart' : 'donkey';
        const baseSpeed = caravanType === 'camel' ? 0.015 : caravanType === 'cart' ? 0.012 : 0.009;
        const landPath = SimplePathfinder.findPath(fromCity.x, fromCity.y, toCity.x, toCity.y, tileMap, 'land');

        // Don't spawn caravan if no valid land path exists
        if (landPath.length === 0) continue;

        const caravan: OverlandCaravan = {
          id: route.id,
          routeId: route.id,
          fromKingdomId: route.fromKingdomId,
          toKingdomId: route.toKingdomId,
          fromCityName: fromCity.name,
          toCityName: toCity.name,
          startX: fromCity.x,
          startY: fromCity.y,
          endX: toCity.x,
          endY: toCity.y,
          x: fromCity.x,
          y: fromCity.y,
          progress: 0,
          direction: 1,
          caravanType,
          cargo: route.good,
          cargoAmount: Math.min(route.volume * 5, Math.floor(route.volume * (3 + (currentYear % 5) * 0.4))),
          kingdomColor: fromKingdom?.color ?? '#fbbf24',
          speed: baseSpeed,
          path: landPath
        };
        this.activeCaravans.set(route.id, caravan);
      }

      // Update position along route
      const caravan = this.activeCaravans.get(route.id)!;

      // Road speed bonus: check current tile's road level
      const tileX = Math.floor(caravan.x);
      const tileY = Math.floor(caravan.y);
      const currentTile = tileMap.getTile(tileX, tileY);
      const roadLevel = currentTile?.roadLevel ?? 0;
      const speedMultiplier = ROAD_SPEED_BONUS[roadLevel] ?? 1.0;
      caravan.progress += caravan.speed * caravan.direction * speedMultiplier;

      if (caravan.progress >= 1.0) {
        caravan.progress = 1.0;
        caravan.direction = -1; // Return trip

        // Docking at Destination Market — generate mercantile revenue & tariffs
        this.settleCaravanTrade(caravan, fromKingdom, toKingdom, route, particles);

      } else if (caravan.progress <= 0.0) {
        caravan.progress = 0.0;
        caravan.direction = 1; // Outward trip again

        // Return trip completion — generate return-trade revenue (bidirectional commerce)
        this.settleCaravanTrade(caravan, toKingdom, fromKingdom, route, particles);
      }

      // Interpolate current world position along land waypoints path
      if (caravan.path && caravan.path.length > 1) {
        const totalSegs = caravan.path.length - 1;
        const rawIdx = Math.max(0, Math.min(totalSegs - 0.001, caravan.progress * totalSegs));
        const pathIdx = Math.floor(rawIdx);
        const subFrac = rawIdx - pathIdx;
        const p1 = caravan.path[pathIdx] ?? caravan.path[0];
        const p2 = caravan.path[Math.min(totalSegs, pathIdx + 1)] ?? p1;
        if (p1 && p2) {
          caravan.x = p1.x + (p2.x - p1.x) * subFrac;
          caravan.y = p1.y + (p2.y - p1.y) * subFrac;
        }
      } else {
        caravan.x = caravan.startX + (caravan.endX - caravan.startX) * caravan.progress;
        caravan.y = caravan.startY + (caravan.endY - caravan.startY) * caravan.progress;
      }

      // Pave and evolve roads under caravan wheels & hooves
      const paveTileX = Math.floor(caravan.x);
      const paveTileY = Math.floor(caravan.y);
      const paveTile = tileMap.getTile(paveTileX, paveTileY);
      if (paveTile && TERRAINS[paveTile.type].isWalkable && !TERRAINS[paveTile.type].isWater) {
        paveTile.roadTraffic++;
        const hasRoadsTech = fromKingdom?.research.knows('roads') || fromKingdom?.research.knows('masonry');
        const hasEngineering = fromKingdom?.research.knows('engineering');

        if (paveTile.roadLevel === 0 && paveTile.roadTraffic >= ROAD_UPGRADE_THRESHOLDS.dirt) {
          paveTile.roadLevel = 1; // Dirt Trail (Trilha de Terra)
        } else if (paveTile.roadLevel === 1 && paveTile.roadTraffic >= ROAD_UPGRADE_THRESHOLDS.stone && hasRoadsTech) {
          paveTile.roadLevel = 2; // Stone Road (Estrada de Pedra Talhada)
        } else if (paveTile.roadLevel === 2 && paveTile.roadTraffic >= ROAD_UPGRADE_THRESHOLDS.imperial && hasEngineering) {
          paveTile.roadLevel = 3; // Paved Imperial Highway (Via Calçada Imperial)
        }
      }
    }

    // Clean up dead caravans
    for (const [id] of this.activeCaravans) {
      if (!activeRouteIds.has(id)) {
        this.activeCaravans.delete(id);
      }
    }
  }

  /**
   * Settle trade at either end of a caravan trip.
   * Called both when arriving at destination AND when returning to origin (bidirectional trade).
   */
  private settleCaravanTrade(
    caravan: OverlandCaravan,
    sellerKingdom: Kingdom | null | undefined,
    buyerKingdom: Kingdom | null | undefined,
    route: TradeRoute,
    particles: ParticleManager
  ): void {
    const basePrice = GOODS[caravan.cargo]?.basePrice ?? 8;
    const MercantilismBonus = (sellerKingdom?.culture.mercantilism ?? 0.5) * 0.35;
    let revenue = Math.floor(caravan.cargoAmount * basePrice * (1 + MercantilismBonus));

    // Buyer solvency check: reduce revenue if buyer can't afford it
    if (buyerKingdom) {
      const buyerCanAfford = Math.max(0, buyerKingdom.treasury.get('gold') ?? 0);
      const tariffRate = 0.10 + ((buyerKingdom.culture?.mercantilism ?? 0.5) * 0.15);
      const buyerCost = Math.floor(revenue * tariffRate);
      if (buyerCost > buyerCanAfford) {
        // Scale down revenue proportionally to what buyer can pay
        const scale = buyerCanAfford / Math.max(1, buyerCost);
        revenue = Math.floor(revenue * Math.max(0.2, scale));
      }
    }

    if (sellerKingdom) {
      sellerKingdom.treasury.add('gold', revenue);
      sellerKingdom.wealth += revenue;
      sellerKingdom.exportVolume += revenue;
    }

    // Custom Tariffs collected by buyer/destination kingdom
    if (buyerKingdom && buyerKingdom.id !== sellerKingdom?.id) {
      const tariffRate = 0.10 + (buyerKingdom.culture.mercantilism * 0.15);
      const tariffGold = Math.floor(revenue * tariffRate);
      buyerKingdom.treasury.add('gold', tariffGold);
      buyerKingdom.wealth += tariffGold;
      buyerKingdom.tariffRevenue += tariffGold;
      buyerKingdom.importVolume += revenue;
    }

    route.totalValue += revenue;
    particles.spawnDamageNumber(caravan.x, caravan.y, revenue);
  }
}
