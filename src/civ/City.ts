import { Building, BuildingType, BUILDINGS } from './Building';
import { SpeciesType } from '../entities/Species';
import { Stockpile, GoodId } from './Goods';
import { TerrainType, TERRAINS } from '../world/Biomes';

/**
 * A settlement. Grows through tiers as its population rises, and each tier
 * unlocks more building slots, more territory and a larger stockpile.
 */

export type SettlementTier = 'camp' | 'hamlet' | 'village' | 'town' | 'city' | 'metropolis';

export interface TierInfo {
  id: SettlementTier;
  name: string;
  icon: string;
  minPopulation: number;
  /** How many buildings this tier supports. */
  buildingSlots: number;
  /** Territory tiles it may claim, before technology bonuses. */
  territoryLimit: number;
  storage: number;
  color: string;
}

export const SETTLEMENT_TIERS: TierInfo[] = [
  { id: 'camp', name: 'Camp', icon: '⛺', minPopulation: 0, buildingSlots: 3, territoryLimit: 9, storage: 250, color: '#a8a29e' },
  { id: 'hamlet', name: 'Hamlet', icon: '🛖', minPopulation: 8, buildingSlots: 6, territoryLimit: 20, storage: 400, color: '#b45309' },
  { id: 'village', name: 'Village', icon: '🏘️', minPopulation: 20, buildingSlots: 11, territoryLimit: 40, storage: 650, color: '#22c55e' },
  { id: 'town', name: 'Town', icon: '🏙️', minPopulation: 45, buildingSlots: 18, territoryLimit: 75, storage: 950, color: '#38bdf8' },
  { id: 'city', name: 'City', icon: '🏛️', minPopulation: 90, buildingSlots: 28, territoryLimit: 130, storage: 1400, color: '#a855f7' },
  { id: 'metropolis', name: 'Metropolis', icon: '🌆', minPopulation: 180, buildingSlots: 42, territoryLimit: 220, storage: 2200, color: '#fbbf24' }
];

export function tierForPopulation(population: number): TierInfo {
  let result = SETTLEMENT_TIERS[0];
  for (const tier of SETTLEMENT_TIERS) {
    if (population >= tier.minPopulation) result = tier;
  }
  return result;
}

export class City {
  public id: string;
  public name: string;
  public species: SpeciesType;
  public x: number;
  public y: number;
  public kingdomId: string | null = null;
  public founderName: string;
  public foundingYear: number;
  public population: number = 0;
  public mayorId: string | null = null;

  /** Everything this settlement physically holds. */
  public stock: Stockpile;
  public territory: Set<string> = new Set();
  public buildings: Map<string, Building> = new Map();

  public tier: SettlementTier = 'camp';
  /** Settlement this one was founded from, if any. */
  public parentCityId: string | null = null;
  /** 0..1 — how well fed and housed the population is. */
  public prosperity: number = 0.5;
  /** Years the settlement has gone hungry in a row. */
  public famineYears: number = 0;
  // ============ SIEGE ============
  /** Realm currently besieging this settlement, if any. */
  public besiegerId: string | null = null;
  /** 0..1 — how close the besieger is to taking the walls. */
  public siegeProgress: number = 0;
  /** Years this settlement has been under siege without relief. */
  public siegeYears: number = 0;
  /** Year the settlement last changed hands by force. */
  public capturedYear: number | null = null;
  /** Realm that held this settlement before it was taken. */
  public formerOwnerId: string | null = null;

  /** Research points this settlement contributed last year. */
  public researchOutput: number = 0;
  /** Value of goods produced last year, at market prices. */
  public economicOutput: number = 0;

  // ========== RESOURCE CACHE (rebuilt yearly) ==========
  private resourceCacheYear: number = 0;
  public resourcesByTileType: Map<TerrainType, { x: number; y: number }[]> = new Map();
  public resourcesByGood: Map<GoodId, { x: number; y: number }[]> = new Map();

  constructor(id: string, name: string, species: SpeciesType, x: number, y: number, founderName: string, foundingYear: number) {
    this.id = id;
    this.name = name;
    this.species = species;
    this.x = x;
    this.y = y;
    this.founderName = founderName;
    this.foundingYear = foundingYear;

    this.stock = new Stockpile(SETTLEMENT_TIERS[0].storage, { food: 100, wood: 50, stone: 30 });
    this.territory.add(`${x},${y}`);

    const tc = new Building(`b_tc_${id}`, 'town_center', x, y, id);
    this.buildings.set(tc.id, tc);
  }

  // ============================ TIERS ============================

  public get tierInfo(): TierInfo {
    return SETTLEMENT_TIERS.find(t => t.id === this.tier) ?? SETTLEMENT_TIERS[0];
  }

  /** Recomputes the tier from population. Returns the new tier if it changed. */
  public updateTier(): TierInfo | null {
    const next = tierForPopulation(this.population);
    if (next.id === this.tier) return null;

    const previous = this.tier;
    this.tier = next.id;
    this.stock.capacity = next.storage + this.storageBonus();

    // Only announce growth, not decline from plague or war.
    const grew = SETTLEMENT_TIERS.findIndex(t => t.id === next.id) >
      SETTLEMENT_TIERS.findIndex(t => t.id === previous);
    return grew ? next : null;
  }

  public storageBonus(): number {
    let bonus = 0;
    for (const b of this.buildings.values()) {
      bonus += (b.definition.storage ?? 0) * b.level;
    }
    return bonus;
  }

  // ============================ CAPACITY ============================

  public get buildingSlots(): number {
    return this.tierInfo.buildingSlots;
  }

  public hasFreeBuildingSlot(): boolean {
    return this.buildings.size < this.buildingSlots;
  }

  public territoryLimit(techBonus: number = 0, governmentBonus: number = 0): number {
    return this.tierInfo.territoryLimit + techBonus + governmentBonus;
  }

  /** Total citizens the settlement can house. Growth stalls beyond this. */
  public housingCapacity(): number {
    let capacity = 0;
    for (const b of this.buildings.values()) {
      capacity += (b.definition.housing ?? 0) * b.level;
    }
    return capacity;
  }

  /** Workers needed to fully staff every building. */
  public jobsAvailable(): number {
    let jobs = 0;
    for (const b of this.buildings.values()) {
      jobs += (b.definition.jobs ?? 0) * b.level;
    }
    return jobs;
  }

  /** Combined defensive multiplier from walls, barracks and keeps. */
  public defenseMultiplier(): number {
    let multiplier = 1;
    for (const b of this.buildings.values()) {
      const def = b.definition.defense;
      if (def) multiplier *= 1 + (def - 1) * (1 + (b.level - 1) * 0.4);
    }
    return multiplier;
  }

  // ============================ BUILDINGS ============================

  public countOfType(type: BuildingType): number {
    let count = 0;
    for (const b of this.buildings.values()) if (b.type === type) count++;
    return count;
  }

  public hasBuilding(type: BuildingType): boolean {
    return this.countOfType(type) > 0;
  }

  public addBuilding(type: BuildingType, bx: number, by: number): Building {
    const b = new Building(`b_${this.id}_${this.buildings.size}_${Math.floor(Math.random() * 100000)}`, type, bx, by, this.id);
    this.buildings.set(b.id, b);
    this.stock.capacity = this.tierInfo.storage + this.storageBonus();
    return b;
  }

  public removeBuilding(id: string): void {
    this.buildings.delete(id);
    this.stock.capacity = this.tierInfo.storage + this.storageBonus();
  }

  /** Buildings of a category, used by the construction AI to balance a settlement. */
  public buildingsOfCategory(category: string): Building[] {
    return [...this.buildings.values()].filter(b => b.definition.category === category);
  }

  /** Unassign worker from all buildings in this city (on death or migration). */
  public unassignWorker(workerId: string): void {
    for (const building of this.buildings.values()) {
      building.assignedWorkerIds.delete(workerId);
    }
  }

  /** Total job slots vs filled slots for a building type. */
  public jobSlotInfo(type: BuildingType): { total: number; filled: number } {
    let total = 0, filled = 0;
    for (const b of this.buildings.values()) {
      if (b.type === type) {
        total += (b.definition.jobs ?? 0);
        filled += b.assignedWorkerIds.size;
      }
    }
    return { total, filled };
  }

  /** Rebuild cached lists of nearby resource tiles.  Called once per year. */
  public rebuildResourceCache(tileMap: import('../world/TileMap').TileMap, year: number, surveyRadius: number): void {
    if (this.resourceCacheYear === year) return;
    this.resourceCacheYear = year;
    this.resourcesByTileType.clear();
    this.resourcesByGood.clear();

    const cx = Math.floor(this.x), cy = Math.floor(this.y);
    for (let dx = -surveyRadius; dx <= surveyRadius; dx++) {
      for (let dy = -surveyRadius; dy <= surveyRadius; dy++) {
        const tile = tileMap.getTile(cx + dx, cy + dy);
        if (!tile || TERRAINS[tile.type].isWater || tile.type === TerrainType.LAVA) continue;
        if (tile.resourceAmount > 0) {
          const pos = { x: tile.x, y: tile.y };
          // Index by terrain type
          if (tile.type === TerrainType.FOREST) {
            let arr = this.resourcesByTileType.get(TerrainType.FOREST);
            if (!arr) { arr = []; this.resourcesByTileType.set(TerrainType.FOREST, arr); }
            arr.push(pos);
          }
          // Index by resource good
          if (tile.resourceType) {
            let arr = this.resourcesByGood.get(tile.resourceType);
            if (!arr) { arr = []; this.resourcesByGood.set(tile.resourceType, arr); }
            arr.push(pos);
          }
        }
      }
    }
    // Sort each array by distance to city center
    const sortFn = (a: {x:number;y:number}, b: {x:number;y:number}) =>
      ((a.x - cx) ** 2 + (a.y - cy) ** 2) - ((b.x - cx) ** 2 + (b.y - cy) ** 2);
    for (const [, arr] of this.resourcesByTileType) arr.sort(sortFn);
    for (const [, arr] of this.resourcesByGood) arr.sort(sortFn);
  }

  public nearestCached(type: TerrainType, fromX: number, fromY: number): { x: number; y: number } | null {
    const sites = this.resourcesByTileType.get(type);
    if (!sites || sites.length === 0) return null;
    let best: { x: number; y: number } | null = null, bestDist = Infinity;
    for (const s of sites) {
      const d = (s.x - fromX) ** 2 + (s.y - fromY) ** 2;
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return best;
  }

  // ============================ CONVENIENCE ============================

  /** Legacy accessor kept so older UI paths keep reading sensible numbers. */
  public get resources(): Record<'wood' | 'stone' | 'iron' | 'food' | 'gold', number> {
    return {
      wood: Math.round(this.stock.get('wood')),
      stone: Math.round(this.stock.get('stone')),
      iron: Math.round(this.stock.get('iron')),
      food: Math.round(this.stock.get('food')),
      gold: Math.round(this.stock.get('gold'))
    };
  }

  public give(good: GoodId, amount: number): number {
    return this.stock.add(good, amount);
  }

  public take(good: GoodId, amount: number): number {
    return this.stock.take(good, amount);
  }

  public serialize(): any {
    return {
      id: this.id,
      name: this.name,
      species: this.species,
      x: this.x,
      y: this.y,
      kingdomId: this.kingdomId,
      founderName: this.founderName,
      foundingYear: this.foundingYear,
      population: this.population,
      mayorId: this.mayorId,
      tier: this.tier,
      parentCityId: this.parentCityId,
      prosperity: this.prosperity,
      famineYears: this.famineYears,
      besiegerId: this.besiegerId,
      siegeProgress: this.siegeProgress,
      siegeYears: this.siegeYears,
      capturedYear: this.capturedYear,
      formerOwnerId: this.formerOwnerId,
      stock: this.stock.serialize(),
      territory: Array.from(this.territory),
      buildings: [...this.buildings.values()].map(b => ({
        id: b.id,
        type: b.type,
        x: b.x,
        y: b.y,
        level: b.level,
        hp: b.hp,
        extractedGood: b.extractedGood,
        assignedWorkerIds: [...b.assignedWorkerIds]
      }))
    };
  }

  public static deserialize(data: any): City {
    const city = new City(data.id, data.name, data.species, data.x, data.y, data.founderName, data.foundingYear);
    city.kingdomId = data.kingdomId ?? null;
    city.population = data.population ?? 0;
    city.mayorId = data.mayorId ?? null;
    city.tier = data.tier ?? 'camp';
    city.parentCityId = data.parentCityId ?? null;
    city.prosperity = data.prosperity ?? 0.5;
    city.famineYears = data.famineYears ?? 0;
    city.besiegerId = data.besiegerId ?? null;
    city.siegeProgress = data.siegeProgress ?? 0;
    city.siegeYears = data.siegeYears ?? 0;
    city.capturedYear = data.capturedYear ?? null;
    city.formerOwnerId = data.formerOwnerId ?? null;
    city.territory = new Set(data.territory ?? [`${data.x},${data.y}`]);

    if (Array.isArray(data.buildings) && data.buildings.length > 0) {
      city.buildings.clear();
      for (const bd of data.buildings) {
        const b = new Building(bd.id, bd.type, bd.x, bd.y, city.id);
        b.level = bd.level ?? 1;
        b.maxHp = (BUILDINGS[bd.type as BuildingType]?.maxHp ?? 150) * (1 + (b.level - 1) * 0.5);
        b.hp = bd.hp ?? b.maxHp;
        b.extractedGood = bd.extractedGood ?? null;
        b.assignedWorkerIds = new Set(bd.assignedWorkerIds ?? []);
        city.buildings.set(b.id, b);
      }
    }

    city.stock.capacity = city.tierInfo.storage + city.storageBonus();
    city.stock.deserialize(data.stock);
    return city;
  }
}
