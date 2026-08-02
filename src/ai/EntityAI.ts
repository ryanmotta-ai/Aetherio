import { Entity } from '../entities/Entity';
import { SpeciesType, SPECIES_DEFINITIONS } from '../entities/Species';
import { TraitId } from '../entities/Traits';
import { AIState } from '../entities/Needs';
import { TileMap } from '../world/TileMap';
import { TerrainType, TERRAINS } from '../world/Biomes';
import { SpatialHash } from '../core/SpatialHash';
import { City } from '../civ/City';
import { Kingdom, generateKingdomName, getNextKingdomColor } from '../civ/Kingdom';
import { BuildingType, BASE_BUILDINGS } from '../civ/Building';
import { DiplomacyManager } from '../civ/Diplomacy';
import { LEGENDARY_ITEMS, WEAPON_TIERS, ARMOR_TIERS } from '../entities/Equipment';
import { SimplePathfinder } from './Pathfinding';
import { ParticleManager } from '../renderer/Particles';
import { chronicle } from '../civ/Chronicle';
import { sound } from '../core/SoundSynth';
import { rng } from '../core/Random';
import { WorldMarket } from '../civ/Economy';
import { TradeNetwork } from '../civ/Trade';
import { GoodId, MINEABLE_GOODS } from '../civ/Goods';
import { tileResourceToGood } from '../world/Tile';
import { events } from '../core/EventBus';
import { CivilizationEngine } from '../civ/CivilizationEngine';
import { canPairWith, formPartnership, conceiveChild, chooseSuccessor, generateDynastyName, DeceasedEntityRecord } from '../civ/Lineage';
import { GOVERNMENTS } from '../civ/Government';
import { WarfareSystem, SIEGE_RADIUS } from '../civ/Warfare';
import { NavalSystem } from '../civ/NavalSystem';
import { CaravanSystem } from '../civ/CaravanSystem';

const ATTACK_COOLDOWN = 8; // Ticks between attacks
const COMBAT_RANGE = 1.8;
const DETECTION_RANGE = 8;
const FLEE_THRESHOLD = 0.25; // Flee when HP below 25%

export class SimulationEngine {
  public entities: Entity[] = [];
  public deceasedAncestors: Map<string, DeceasedEntityRecord> = new Map();
  public cities: Map<string, City> = new Map();
  public kingdoms: Map<string, Kingdom> = new Map();
  public diplomacy: DiplomacyManager = new DiplomacyManager();
  public spatialHash: SpatialHash<Entity> = new SpatialHash<Entity>(8);

  /** Global price-setting market every realm trades against. */
  public market: WorldMarket = new WorldMarket();
  /** Trade agreements and caravan routes between realms. */
  public trade: TradeNetwork = new TradeNetwork();
  /** Active maritime ships and naval trade routes. */
  public naval: NavalSystem = new NavalSystem();
  /** Active overland caravans. */
  public caravans: CaravanSystem = new CaravanSystem();
  /** Runs everything slow and structural, once per simulated year. */
  public civ: CivilizationEngine = new CivilizationEngine();
  /** Resolves sieges and transfers cities taken by force. */
  public warfare: WarfareSystem = new WarfareSystem();

  public currentYear: number = 1;
  private yearTickCounter: number = 0;
  public timeOfDay: 'dawn' | 'day' | 'dusk' | 'night' = 'day';

  /** Lifetime counters surfaced by the Statistics screen. */
  public totalBirths: number = 0;
  public totalDeaths: number = 0;

  constructor() {}

  public spawnEntity(species: SpeciesType, x: number, y: number, tileMap?: TileMap, forcedGender?: 'male' | 'female'): Entity {
    let spawnX = x;
    let spawnY = y;
    if (tileMap) {
      const safe = SimplePathfinder.findNearestLand(x, y, tileMap);
      if (safe) {
        spawnX = safe.x;
        spawnY = safe.y;
      }
    }
    const id = `ent_${Date.now()}_${Math.random()}`;
    const entity = new Entity(id, species, spawnX, spawnY);
    if (forcedGender) {
      entity.gender = forcedGender;
    }
    this.entities.push(entity);
    this.spatialHash.insert(entity);
    this.totalBirths++;

    // Auto assign to existing nearby city of same species
    const nearby = this.spatialHash.queryRadius(spawnX, spawnY, 10);
    for (const other of nearby) {
      if (other.species === species && other.cityId && this.cities.has(other.cityId)) {
        entity.cityId = other.cityId;
        const city = this.cities.get(other.cityId)!;
        city.population++;
        entity.kingdomId = city.kingdomId;
        break;
      }
    }
    return entity;
  }

  // ===================== MAIN TICK =====================
  public tickAI(tileMap: TileMap, particles: ParticleManager): void {
    // 1. Rebuild spatial hash
    this.spatialHash.clear();
    for (const e of this.entities) this.spatialHash.insert(e);

    // Update active maritime ships & naval trade
    this.naval.updateShips(this.trade.routes, this.cities, this.kingdoms, tileMap, particles, this.currentYear);

    // 2. Process each entity
    const deadEntities: Entity[] = [];

    for (const e of this.entities) {
      // Save previous position for facing direction
      e.prevX = e.x;
      e.prevY = e.y;

      // Anti-water safety check: Units MUST NOT walk on water or be inside water
      const currentTile = tileMap.getTile(Math.floor(e.x), Math.floor(e.y));
      if (currentTile && TERRAINS[currentTile.type].isWater) {
        const safe = SimplePathfinder.findNearestLand(e.x, e.y, tileMap);
        if (safe) {
          e.x = safe.x;
          e.y = safe.y;
        }
      }

      // Cooldowns
      if (e.attackCooldown > 0) e.attackCooldown--;
      if (e.aiCooldown > 0) e.aiCooldown--;
      if (e.emoteTimer > 0) {
        e.emoteTimer--;
        if (e.emoteTimer <= 0) e.emote = null;
      }

      // Environmental damage
      if (currentTile) {
        if (currentTile.isOnFire || currentTile.type === TerrainType.LAVA) {
          if (!e.traits.has(TraitId.FLAMMABLE) || e.species !== SpeciesType.EMBERKIN) {
            const dmg = e.traits.has(TraitId.FLAMMABLE) ? 30 : 15;
            e.hp -= dmg;
            particles.spawnDamageNumber(e.x, e.y, dmg);
            // AI: Flee from fire
            if (e.aiState !== 'flee') {
              e.aiState = 'flee';
              e.aiCooldown = 20;
            }
          }
        }
        // Regen trait. Only the living regenerate — otherwise a regenerator
        // heals off the killing blow before the death check ever sees it, and
        // becomes accidentally immortal.
        if (e.hp > 0 && e.traits.has(TraitId.REGENERATOR) && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + 2);
        }
      }

      // Death check
      if (e.hp <= 0) { deadEntities.push(e); continue; }

      // Behavior by species type
      const isHumanoid = SPECIES_DEFINITIONS[e.species].isHumanoid;
      if (!isHumanoid) {
        this.tickFauna(e, tileMap, particles);
      } else {
        this.tickHumanoid(e, tileMap, particles);
      }

      // Update facing direction, facing angle & particle trail from movement
      const movedX = e.x - e.prevX;
      const movedY = e.y - e.prevY;
      const distMoved = Math.hypot(movedX, movedY);

      if (distMoved > 0.001) {
        e.facingAngle = Math.atan2(movedY, movedX);
        if (Math.abs(movedX) > 0.003) {
          e.facing = movedX > 0 ? 1 : -1;
        }

        // Particle feedback: footstep dust puffs on dry land
        if (Math.random() < 0.04 && currentTile && !TERRAINS[currentTile.type].isWater) {
          particles.spawnParticle(e.x, e.y + 0.3, 'rgba(180, 150, 110, 0.25)', (Math.random() - 0.5) * 0.04, -0.02, 0.3);
        }

        // Organic desire paths: repeated footsteps form dirt tracks & upgrade roads!
        if (currentTile && !TERRAINS[currentTile.type].isWater && currentTile.type !== TerrainType.MOUNTAIN) {
          if (Math.random() < 0.25) {
            currentTile.roadTraffic++;
            if (currentTile.roadTraffic >= 5 && currentTile.roadLevel === 0) {
              currentTile.roadLevel = 1; // Dirt track / desire path
            } else if (currentTile.roadTraffic >= 25 && currentTile.roadLevel === 1) {
              currentTile.roadLevel = 2; // Stone Road
            } else if (currentTile.roadTraffic >= 75 && currentTile.roadLevel === 2) {
              currentTile.roadLevel = 3; // Imperial Highway
            }
          }
        }

        // Flocking Separation: gentle push so characters walk alongside each other instead of stacking
        if (isHumanoid) {
          const neighbors = this.spatialHash.queryRadius(e.x, e.y, 0.4);
          for (const other of neighbors) {
            if (other.id !== e.id && other.species === e.species && other.hp > 0) {
              const sepDx = e.x - other.x;
              const sepDy = e.y - other.y;
              const sepDist = Math.hypot(sepDx, sepDy);
              if (sepDist > 0.01 && sepDist < 0.38) {
                const push = (0.38 - sepDist) * 0.025;
                const nx = e.x + (sepDx / sepDist) * push;
                const ny = e.y + (sepDy / sepDist) * push;
                const nTile = tileMap.getTile(Math.floor(nx), Math.floor(ny));
                if (nTile && !TERRAINS[nTile.type].isWater && TERRAINS[nTile.type].isWalkable) {
                  e.x = nx;
                  e.y = ny;
                }
              }
            }
          }
        }
      }

      if (distMoved < 0.005 && e.aiState !== 'idle' && e.aiState !== 'heal' && e.aiState !== 'sleep') {
        e.stuckTicks = (e.stuckTicks || 0) + 1;
        if (e.stuckTicks >= 2) {
          e.stuckTicks = 0;
          const jittered = SimplePathfinder.jitterAround(e.x, e.y, tileMap, SPECIES_DEFINITIONS[e.species].baseSpeed * 0.025);
          if (jittered) { e.x = jittered.x; e.y = jittered.y; e._jitterFailures++; }
          if ((jittered ? e._jitterFailures : 3) >= 3) {
            e._jitterFailures = 0;
            e.targetX = null;
            e.targetY = null;
            e.aiState = 'idle';
            e.aiCooldown = rng.rangeInt(20, 50);
            const safe = SimplePathfinder.findNearestLand(e.x, e.y, tileMap);
            if (safe) { e.x = safe.x; e.y = safe.y; }
          }
        }
      } else {
        e.stuckTicks = 0;
        e._jitterFailures = 0;
      }
    }

    // Update maritime ships and overland caravans
    this.naval.updateShips(this.trade.routes, this.cities, this.kingdoms, tileMap, particles, this.currentYear);
    this.caravans.updateCaravans(this.trade.routes, this.cities, this.kingdoms, tileMap, particles, this.currentYear);

    // Process deaths
    for (const dead of deadEntities) this.handleEntityDeath(dead, particles);

    // 3. A year passes: 24-hour day calculation (1,440 ticks/day, 24 days/year)
    this.yearTickCounter++;
    
    // 24-Hour Day Clock & Time of Day Phase
    const dayTicks = this.yearTickCounter % 1440;
    const currentHour = Math.floor(dayTicks / 60);

    if (currentHour >= 5 && currentHour < 8) this.timeOfDay = 'dawn';
    else if (currentHour >= 8 && currentHour < 18) this.timeOfDay = 'day';
    else if (currentHour >= 18 && currentHour < 21) this.timeOfDay = 'dusk';
    else this.timeOfDay = 'night';

    if (this.yearTickCounter >= 34560) {
      this.yearTickCounter = 0;
      this.currentYear++;
      this.tickAge();
      this.tickFamilies(tileMap);
      this.civ.tickYear({
        year: this.currentYear,
        cities: this.cities,
        kingdoms: this.kingdoms,
        entities: this.entities,
        tileMap,
        diplomacy: this.diplomacy,
        market: this.market,
        trade: this.trade,
        spawn: (species, x, y) => this.spawnEntity(species, x, y),
        sim: this
      });
      this.warfare.tickYear({
        year: this.currentYear,
        cities: this.cities,
        kingdoms: this.kingdoms,
        entities: this.entities,
        tileMap,
        diplomacy: this.diplomacy
      });
      this.tickGeopolitics();
    }
  }

  public get24HourTime(): { hour: number; minute: number; timeString: string; periodLabel: string; icon: string } {
    const dayTicks = this.yearTickCounter % 1440;
    const hour = Math.floor(dayTicks / 60);
    const minute = dayTicks % 60;
    const hh = hour.toString().padStart(2, '0');
    const mm = minute.toString().padStart(2, '0');
    const timeString = `${hh}:${mm}`;

    let periodLabel = 'Dia';
    let icon = '☀️';

    if (hour >= 5 && hour < 8) {
      periodLabel = 'Alvorada'; icon = '🌅';
    } else if (hour >= 8 && hour < 18) {
      periodLabel = 'Dia'; icon = '☀️';
    } else if (hour >= 18 && hour < 21) {
      periodLabel = 'Crepúsculo'; icon = '🌇';
    } else {
      periodLabel = 'Noite'; icon = '🌙';
    }

    return { hour, minute, timeString, periodLabel, icon };
  }

  public getCalendarDate(): { month: number; day: number; year: number } {
    const dayInYear = Math.floor((this.yearTickCounter % 34560) / 1440);
    const month = Math.min(12, Math.floor(dayInYear / 2) + 1);
    const day = (dayInYear % 2) + 1;
    return { month, day, year: this.currentYear };
  }

  // ===================== FAUNA AI (ANIMALS) =====================
  private tickFauna(e: Entity, tileMap: TileMap, particles: ParticleManager): void {
    const speed = SPECIES_DEFINITIONS[e.species].baseSpeed * 0.025;

    switch (e.species) {
      case SpeciesType.DEER:
        this.tickDeerAI(e, tileMap, speed);
        break;
      case SpeciesType.WOLF:
        this.tickWolfAI(e, tileMap, particles, speed);
        break;
      case SpeciesType.BEAR:
        this.tickBearAI(e, tileMap, particles, speed);
        break;
      case SpeciesType.DRAGON:
        this.tickDragonAI(e, tileMap, particles, speed);
        break;
      case SpeciesType.BOAR:
        this.tickBoarAI(e, tileMap, particles, speed);
        break;
      case SpeciesType.EAGLE:
        this.tickEagleAI(e, tileMap, particles, speed);
        break;
      case SpeciesType.MAMMOTH:
        this.tickMammothAI(e, tileMap, particles, speed);
        break;
      default:
        this.tickGenericFauna(e, tileMap, speed);
    }
  }

  // ===================== NEW SPECIES FAUNA AI =====================

  private tickBoarAI(e: Entity, tileMap: TileMap, particles: ParticleManager, speed: number): void {
    const nearbyHumanoids = this.spatialHash.queryRadius(e.x, e.y, 3).filter(other => SPECIES_DEFINITIONS[other.species].isHumanoid && other.hp > 0 && other.age >= 3);
    if (nearbyHumanoids.length > 0) {
      const target = nearbyHumanoids[0];
      const dist = Math.hypot(target.x - e.x, target.y - e.y);
      if (dist <= COMBAT_RANGE) {
        if (e.attackCooldown <= 0) {
          const dmg = Math.max(1, e.damage - target.defense);
          target.hp -= dmg;
          e.attackCooldown = ATTACK_COOLDOWN;
          particles.spawnDamageNumber(target.x, target.y, dmg);
        }
      } else {
        const pos = SimplePathfinder.getStepTowards(e.x, e.y, target.x, target.y, tileMap, speed * 1.3);
        e.x = pos.x; e.y = pos.y;
      }
    } else {
      this.tickGenericFauna(e, tileMap, speed);
    }
  }

  private tickEagleAI(e: Entity, tileMap: TileMap, particles: ParticleManager, speed: number): void {
    const preyList = this.spatialHash.queryRadius(e.x, e.y, 8).filter(other => (other.species === SpeciesType.DEER || other.species === SpeciesType.BOAR) && other.hp > 0);
    if (preyList.length > 0) {
      const prey = preyList[0];
      const dist = Math.hypot(prey.x - e.x, prey.y - e.y);
      if (dist <= COMBAT_RANGE) {
        if (e.attackCooldown <= 0) {
          const dmg = Math.max(1, e.damage - prey.defense);
          prey.hp -= dmg;
          e.attackCooldown = ATTACK_COOLDOWN;
          particles.spawnDamageNumber(prey.x, prey.y, dmg);
        }
      } else {
        const pos = SimplePathfinder.getStepTowards(e.x, e.y, prey.x, prey.y, tileMap, speed * 1.4);
        e.x = pos.x; e.y = pos.y;
      }
    } else {
      this.tickGenericFauna(e, tileMap, speed * 1.2);
    }
  }

  private tickMammothAI(e: Entity, tileMap: TileMap, particles: ParticleManager, speed: number): void {
    const threats = this.spatialHash.queryRadius(e.x, e.y, 4).filter(other => SPECIES_DEFINITIONS[other.species].isHumanoid && other.hp > 0 && other.age >= 3);
    if (e.hp < e.maxHp && threats.length > 0) {
      const target = threats[0];
      const dist = Math.hypot(target.x - e.x, target.y - e.y);
      if (dist <= COMBAT_RANGE) {
        if (e.attackCooldown <= 0) {
          const dmg = Math.max(1, e.damage - target.defense);
          target.hp -= dmg;
          e.attackCooldown = ATTACK_COOLDOWN;
          particles.spawnDamageNumber(target.x, target.y, dmg);
        }
      } else {
        const pos = SimplePathfinder.getStepTowards(e.x, e.y, target.x, target.y, tileMap, speed);
        e.x = pos.x; e.y = pos.y;
      }
    } else {
      this.tickGenericFauna(e, tileMap, speed * 0.8);
    }
  }

  /** DEER: Peaceful herbivore. Flees from predators and humanoids. Grazes near forests. */
  private tickDeerAI(e: Entity, tileMap: TileMap, speed: number): void {
    const nearby = this.spatialHash.queryRadius(e.x, e.y, 7);
    
    // Check for threats — flee from predators, wolves, bears, humanoids
    for (const other of nearby) {
      if (other.id === e.id) continue;
      const dist = SimplePathfinder.distance(e.x, e.y, other.x, other.y);
      const isThreat = other.species === SpeciesType.WOLF || other.species === SpeciesType.BEAR ||
                       other.species === SpeciesType.DRAGON || SPECIES_DEFINITIONS[other.species].isHumanoid;
      if (isThreat && dist < 6) {
        e.aiState = 'flee';
        const pos = SimplePathfinder.fleeFrom(e.x, e.y, other.x, other.y, tileMap, speed * 1.5);
        e.x = pos.x; e.y = pos.y;
        e.targetX = null; e.targetY = null;
        return;
      }
    }

    // Graze near forests
    if (e.aiState !== 'forage' || e.aiCooldown <= 0) {
      e.aiState = 'forage';
      e.aiCooldown = rng.rangeInt(30, 80);
      const target = SimplePathfinder.findRandomWalkable(e.x, e.y, 6, tileMap);
      if (target) { e.targetX = target.x; e.targetY = target.y; }
    }

    if (e.targetX !== null && e.targetY !== null) {
      const pos = SimplePathfinder.getStepTowards(e.x, e.y, e.targetX, e.targetY, tileMap, speed);
      e.x = pos.x; e.y = pos.y;
      if (SimplePathfinder.distance(e.x, e.y, e.targetX, e.targetY) < 0.3) {
        // Arrived — idle briefly
        e.targetX = null; e.targetY = null;
        e.aiState = 'idle';
        e.aiCooldown = rng.rangeInt(15, 40);
      }
    }
  }

  /** WOLF: Pack hunter. Coordinates with nearby wolves to chase humanoids. Fast and aggressive. */
  private tickWolfAI(e: Entity, tileMap: TileMap, particles: ParticleManager, speed: number): void {
    const nearby = this.spatialHash.queryRadius(e.x, e.y, 10);
    
    // Flee if badly hurt
    if (e.hp < e.maxHp * 0.2) {
      const threats = nearby.filter(o => SPECIES_DEFINITIONS[o.species].isHumanoid && SimplePathfinder.distance(e.x, e.y, o.x, o.y) < 5);
      if (threats.length > 0) {
        e.aiState = 'flee';
        const pos = SimplePathfinder.fleeFrom(e.x, e.y, threats[0].x, threats[0].y, tileMap, speed * 1.3);
        e.x = pos.x; e.y = pos.y;
        return;
      }
    }

    // Find prey — prefer lone targets, avoid large groups
    let bestPrey: Entity | null = null;
    let bestScore = -Infinity;
    for (const other of nearby) {
      if (other.id === e.id || other.species === SpeciesType.WOLF) continue;
      const isDeer = other.species === SpeciesType.DEER;
      const isHumanoid = SPECIES_DEFINITIONS[other.species].isHumanoid && other.age >= 3;
      if (!isDeer && !isHumanoid) continue;

      const dist = SimplePathfinder.distance(e.x, e.y, other.x, other.y);
      // Score: prefer close, weak, lone targets
      let score = -dist;
      if (isDeer) score += 5; // Prefer deer
      if (other.hp < other.maxHp * 0.5) score += 3; // Prefer wounded
      // Count nearby pack members for pack hunting bonus
      const packCount = nearby.filter(p => p.species === SpeciesType.WOLF && p.id !== e.id && SimplePathfinder.distance(p.x, p.y, other.x, other.y) < 8).length;
      score += packCount * 2;

      if (score > bestScore) { bestScore = score; bestPrey = other; }
    }

    if (bestPrey) {
      e.aiState = 'hunt';
      e.targetX = bestPrey.x;
      e.targetY = bestPrey.y;

      const dist = SimplePathfinder.distance(e.x, e.y, bestPrey.x, bestPrey.y);
      if (dist <= COMBAT_RANGE && e.attackCooldown <= 0) {
        const dmg = Math.max(3, e.damage - bestPrey.defense);
        bestPrey.hp -= dmg;
        e.attackCooldown = ATTACK_COOLDOWN;
        particles.spawnDamageNumber(bestPrey.x, bestPrey.y, dmg);
        sound.playHit();
        if (bestPrey.hp <= 0) e.kills++;
      } else {
        // Chase at higher speed
        const pos = SimplePathfinder.getStepTowards(e.x, e.y, bestPrey.x, bestPrey.y, tileMap, speed * 1.2);
        e.x = pos.x; e.y = pos.y;
      }
      return;
    }

    // No prey: wander
    this.doWander(e, tileMap, speed, 8);
  }

  /** BEAR: Territorial apex predator. Guards area, attacks intruders. Slow but powerful. */
  private tickBearAI(e: Entity, tileMap: TileMap, particles: ParticleManager, speed: number): void {
    const nearby = this.spatialHash.queryRadius(e.x, e.y, 8);

    // Attack anything that comes too close (territorial)
    let closestIntruder: Entity | null = null;
    let closestDist = DETECTION_RANGE;
    for (const other of nearby) {
      if (other.id === e.id || other.species === SpeciesType.BEAR) continue;
      // Bears ignore infants — too small to be worth the swipe
      if (SPECIES_DEFINITIONS[other.species]?.isHumanoid && other.age < 3) continue;
      const dist = SimplePathfinder.distance(e.x, e.y, other.x, other.y);
      if (dist < closestDist && dist < 6) {
        closestDist = dist;
        closestIntruder = other;
      }
    }

    if (closestIntruder) {
      e.aiState = 'attack';
      e.targetX = closestIntruder.x;
      e.targetY = closestIntruder.y;

      if (closestDist <= COMBAT_RANGE && e.attackCooldown <= 0) {
        // Bear swipe — heavy damage
        const dmg = Math.max(5, e.damage - closestIntruder.defense);
        closestIntruder.hp -= dmg;
        e.attackCooldown = ATTACK_COOLDOWN + 2; // Slower swings
        particles.spawnDamageNumber(closestIntruder.x, closestIntruder.y, dmg);
        // Knockback particle
        particles.spawnExplosion(closestIntruder.x, closestIntruder.y, '#78350f', 5);
        sound.playHit();
        if (closestIntruder.hp <= 0) e.kills++;
      } else {
        const pos = SimplePathfinder.getStepTowards(e.x, e.y, closestIntruder.x, closestIntruder.y, tileMap, speed);
        e.x = pos.x; e.y = pos.y;
      }
      return;
    }

    // Patrol territory slowly
    this.doWander(e, tileMap, speed * 0.6, 5);
  }

  /** DRAGON: Boss entity. Breathes fire, flies over terrain, hunts everything. */
  private tickDragonAI(e: Entity, tileMap: TileMap, particles: ParticleManager, speed: number): void {
    const nearby = this.spatialHash.queryRadius(e.x, e.y, 16);

    // Hunt the strongest nearby target
    let bestTarget: Entity | null = null;
    let bestHp = 0;
    for (const other of nearby) {
      if (other.id === e.id || other.species === SpeciesType.DRAGON) continue;
      // Dragons ignore infants — too small to bother with
      if (SPECIES_DEFINITIONS[other.species]?.isHumanoid && other.age < 3) continue;
      if (other.hp > bestHp) {
        bestHp = other.hp;
        bestTarget = other;
      }
    }

    if (bestTarget) {
      e.aiState = 'hunt';
      e.targetX = bestTarget.x;
      e.targetY = bestTarget.y;
      const dist = SimplePathfinder.distance(e.x, e.y, bestTarget.x, bestTarget.y);

      if (dist <= COMBAT_RANGE * 1.5 && e.attackCooldown <= 0) {
        // Dragon fire breath — area damage
        const hitRange = this.spatialHash.queryRadius(bestTarget.x, bestTarget.y, 2);
        for (const victim of hitRange) {
          if (victim.id === e.id) continue;
          const dmg = Math.max(10, e.damage - victim.defense);
          victim.hp -= dmg;
          particles.spawnDamageNumber(victim.x, victim.y, dmg);
        }
        // Set tiles on fire
        tileMap.applyBrush(Math.floor(bestTarget.x), Math.floor(bestTarget.y), 2, t => {
          if (t.type !== TerrainType.DEEP_OCEAN && t.type !== TerrainType.SHALLOW_WATER) {
            t.isOnFire = true;
          }
        });
        particles.spawnExplosion(bestTarget.x, bestTarget.y, '#f59e0b', 30);
        e.attackCooldown = ATTACK_COOLDOWN + 5;
        sound.playExplosion();
      } else {
        // Fly toward target (faster, ignores some terrain)
        const pos = SimplePathfinder.getStepTowards(e.x, e.y, bestTarget.x, bestTarget.y, tileMap, speed * 1.5);
        e.x = pos.x; e.y = pos.y;
      }
      return;
    }

    // Roam the world
    this.doWander(e, tileMap, speed, 20);
  }

  private tickGenericFauna(e: Entity, tileMap: TileMap, speed: number): void {
    this.doWander(e, tileMap, speed, 6);
  }

  // ===================== HUMANOID AI =====================
  private tickHumanoid(e: Entity, tileMap: TileMap, particles: ParticleManager): void {
    const speed = SPECIES_DEFINITIONS[e.species].baseSpeed * 0.025;

    // 1. Try to join or found a city if homeless
    if (!e.cityId) {
      this.tryJoinOrFoundCity(e, tileMap);
    }

    // 2. Decide AI state if cooldown expired
    if (e.aiCooldown <= 0) {
      this.decideHumanoidState(e, tileMap, particles);
    }

    // 3. Execute current AI state
    this.executeHumanoidState(e, tileMap, particles, speed);
  }

  /** Decide what the humanoid should be doing based on needs, threats, and personality. */
  private decideHumanoidState(e: Entity, tileMap: TileMap, particles: ParticleManager): void {
    const nearby = this.spatialHash.queryRadius(e.x, e.y, DETECTION_RANGE);

    // ===== PRIORITY 1: Flee if critically low HP =====
    if (e.hp < e.maxHp * FLEE_THRESHOLD && e.profession !== 'king') {
      const threats = nearby.filter(o => this.isEnemy(e, o) && SimplePathfinder.distance(e.x, e.y, o.x, o.y) < 6);
      if (threats.length > 0) {
        e.aiState = 'flee';
        e.aiCooldown = 15;
        return;
      }
    }

    // ===== PRIORITY 2: Combat if enemies nearby =====
if (e.kingdomId) {
      const enemies = nearby.filter(o => this.isEnemy(e, o) && o.age >= 3); // Skip infants
      if (enemies.length > 0) {
        // Species-specific combat behavior
        switch (e.species) {
          case SpeciesType.STONEKIN:
            // Stonekin: Always stand and fight (tanky, never flee)
            e.aiState = 'attack';
            e.aiCooldown = 5;
            return;
          case SpeciesType.EMBERKIN:
            // Emberkin: Aggressive, charge in immediately
            e.aiState = 'attack';
            e.aiCooldown = 3;
            return;
          case SpeciesType.SYLVANII:
            // Sylvanii: If outnumbered, flee. Otherwise pick off weakest.
            if (enemies.length > 2 && e.profession !== 'soldier') {
              e.aiState = 'flee';
              e.aiCooldown = 10;
              return;
            }
            e.aiState = 'attack';
            e.aiCooldown = 5;
            return;
          case SpeciesType.LUMINI:
            // Lumini: Diplomatic preference. Soldiers fight, others flee.
            if (e.profession === 'soldier' || e.profession === 'king') {
              e.aiState = 'attack';
              e.aiCooldown = 5;
            } else {
              e.aiState = 'flee';
              e.aiCooldown = 12;
            }
            return;
          default:
            e.aiState = 'attack';
            e.aiCooldown = 5;
            return;
        }
      }
    }

    // Check for dangerous fauna threats
    const faunaThreats = nearby.filter(o =>
      (o.species === SpeciesType.WOLF || o.species === SpeciesType.BEAR || o.species === SpeciesType.DRAGON) &&
      SimplePathfinder.distance(e.x, e.y, o.x, o.y) < 5
    );
    if (faunaThreats.length > 0 && e.profession !== 'soldier') {
      e.aiState = 'flee';
      e.aiCooldown = 12;
      return;
    }
    if (faunaThreats.length > 0 && e.profession === 'soldier') {
      e.aiState = 'attack';
      e.aiCooldown = 5;
      return;
    }

    // ===== PRIORITY 3: Heal if wounded =====
    if (e.hp < e.maxHp * 0.6 && e.aiState !== 'heal') {
      e.aiState = 'heal';
      e.aiCooldown = rng.rangeInt(20, 50);
      return;
    }

    // ===== PRIORITY 4: Time-of-day routine (dawn/dusk/night overrides profession) =====
    // Night: sleep. Dawn: go to work. Dusk: return home.
    if (e.cityId) {
      switch (this.timeOfDay) {
        case 'night':
          e.aiState = 'sleep';
          e.aiCooldown = rng.rangeInt(20, 40);
          return;
        case 'dawn':
          if (e.workplaceId) {
            e.aiState = 'go_to_work';
            e.aiCooldown = rng.rangeInt(20, 40);
            return;
          }
          break;
        case 'dusk':
          if (e.workplaceId || e.homeX != null) {
            e.aiState = 'return_home';
            e.aiCooldown = rng.rangeInt(20, 40);
            return;
          }
          break;
      }
    }

    // ===== PRIORITY 5: Work / Profession-specific tasks (day only) =====
    if (e.cityId && this.cities.has(e.cityId)) {
      const city = this.cities.get(e.cityId)!;

      // Assign profession if none (now job-slot based)
      if (e.profession === 'none') {
        this.assignProfession(e, city);
      }

      // Choose task based on profession
      switch (e.profession) {
        case 'woodcutter':
          e.aiState = 'gather_wood';
          e.aiCooldown = rng.rangeInt(30, 60);
          return;
        case 'farmer':
          e.aiState = 'gather_food';
          e.aiCooldown = rng.rangeInt(20, 50);
          return;
        case 'miner':
          e.aiState = 'gather_ore';
          e.aiCooldown = rng.rangeInt(30, 60);
          return;
        case 'soldier': {
          // In wartime soldiers march on the enemy instead of circling home.
          const target = this.pickRaidTarget(e);
          if (target) {
            e.aiState = 'raid';
            e.targetX = target.x;
            e.targetY = target.y;
            e.aiCooldown = rng.rangeInt(60, 140);
          } else {
            e.aiState = 'patrol';
            e.aiCooldown = rng.rangeInt(30, 80);
          }
          return;
        }
        case 'scout':
          e.aiState = 'explore';
          e.aiCooldown = rng.rangeInt(50, 120);
          return;
        case 'king':
          e.aiState = 'patrol'; // King walks around city
          e.aiCooldown = rng.rangeInt(20, 60);
          return;
        default:
          e.aiState = 'wander';
          e.aiCooldown = rng.rangeInt(20, 60);
          return;
      }
    }

    // Homeless: explore
    e.aiState = 'explore';
    e.aiCooldown = rng.rangeInt(30, 80);
  }

  /** Assign profession and workplace based on real job slots in city buildings. */
  private assignProfession(e: Entity, city: City): void {
    const kingdom = e.kingdomId ? this.kingdoms.get(e.kingdomId) : null;
    const unlocked = new Set<import('../civ/Building').BuildingType>(BASE_BUILDINGS);
    for (const b of kingdom?.research.unlockedBuildings() ?? []) unlocked.add(b);

    let best: { building: import('../civ/Building').Building; score: number } | null = null;
    for (const building of city.buildings.values()) {
      const def = building.definition;
      const jobs = def.jobs ?? 0;
      if (jobs <= 0 || building.assignedWorkerIds.size >= jobs * building.level) continue;
      if (!unlocked.has(building.type)) continue;
      const score = jobs * building.level
        + (def.category === 'food' ? 1000 : def.category === 'extraction' ? 800 : def.category === 'craft' ? 600 : 400);
      if (!best || score > best.score) best = { building, score };
    }

    if (best) {
      const b = best.building;
      const type = b.type;
      if (type === 'farm' || type === 'pasture') e.profession = 'farmer';
      else if (type === 'lumber_camp') e.profession = 'woodcutter';
      else if (type === 'mine' || type === 'quarry' || type === 'oil_well') e.profession = 'miner';
      else if (type === 'workshop' || type === 'smithy' || type === 'factory' || type === 'refinery') e.profession = 'builder';
      else if (type === 'barracks') e.profession = 'soldier';
      else if (type === 'library' || type === 'academy') e.profession = 'scout';
      else e.profession = 'builder';

      e.workplaceId = b.id;
      e.homeX = city.x + rng.range(-3, 3) * 0.8 + 0.5;
      e.homeY = city.y + rng.range(-3, 3) * 0.8 + 0.5;
      b.assignedWorkerIds.add(e.id);
    }
  }

  /** Execute the current AI state. */
  private executeHumanoidState(e: Entity, tileMap: TileMap, particles: ParticleManager, speed: number): void {
    switch (e.aiState) {
      case 'idle':
        // Do nothing, just breathe animation
        break;

      case 'flee': {
        e.showEmote('run', 20);
        // Find nearest threat and run away
        const threats = this.spatialHash.queryRadius(e.x, e.y, 8)
          .filter(o => this.isEnemy(e, o) || this.isFaunaThreat(o));
        if (threats.length > 0) {
          let closest = threats[0];
          let closestDist = SimplePathfinder.distance(e.x, e.y, closest.x, closest.y);
          for (const t of threats) {
            const d = SimplePathfinder.distance(e.x, e.y, t.x, t.y);
            if (d < closestDist) { closest = t; closestDist = d; }
          }
          // Sylvanii flee faster (forest agility)
          const fleeSpeed = e.species === SpeciesType.SYLVANII ? speed * 1.5 : speed * 1.2;
          const pos = SimplePathfinder.fleeFrom(e.x, e.y, closest.x, closest.y, tileMap, fleeSpeed);
          e.x = pos.x; e.y = pos.y;
        } else {
          e.aiState = 'idle';
          e.aiCooldown = 0;
        }
        break;
      }

      case 'attack': {
        const nearby = this.spatialHash.queryRadius(e.x, e.y, DETECTION_RANGE);
        let target: Entity | null = null;
        let targetDist = Infinity;

        // Auto-arm soldier with tech-tiered equipment if unequipped
        this.autoArmSoldier(e);

        for (const other of nearby) {
          // Skip infant targets — combatants ignore babies
          if (other.lifeStage === 'infant') continue;
          if (this.isEnemy(e, other) || this.isFaunaThreat(other)) {
            const dist = SimplePathfinder.distance(e.x, e.y, other.x, other.y);
            if (e.species === SpeciesType.SYLVANII) {
              if (other.hp < (target?.hp ?? Infinity)) { target = other; targetDist = dist; }
            } else if (e.species === SpeciesType.STONEKIN) {
              if (other.hp > (target?.hp ?? 0)) { target = other; targetDist = dist; }
            } else {
              if (dist < targetDist) { target = other; targetDist = dist; }
            }
          }
        }

        if (target) {
          // Emote based on species role & morale
          if (e.profession === 'king') e.showEmote('crown', 25);
          else if (e.species === SpeciesType.SYLVANII) e.showEmote('bow', 20);
          else e.showEmote('swords', 20);

          // General / Commander Morale Bonus
          const hasCommanderNearby = nearby.some(o => o.kingdomId === e.kingdomId && o.profession === 'king');
          const moraleMult = hasCommanderNearby ? 1.25 : 1.0;

          // Reach based on weapon / species
          const maxReach = e.species === SpeciesType.SYLVANII || e.equipment.weapon?.category === 'ranged' ? 5.5 : COMBAT_RANGE;

          if (targetDist <= maxReach && e.attackCooldown <= 0) {
            let dmg = Math.max(1, Math.floor((e.damage - target.defense) * moraleMult));
            
            // Emberkin: Fireball pyromancy!
            if (e.species === SpeciesType.EMBERKIN) {
              dmg = Math.floor(dmg * 1.25);
              particles.spawnParticle(target.x, target.y, '#f59e0b', 0, -0.4, 0.4, 3);
              const tile = tileMap.getTile(Math.floor(target.x), Math.floor(target.y));
              if (tile && Math.random() < 0.05) tile.isOnFire = true;
            }
            // Stonekin: Armor-piercing smash
            if (e.species === SpeciesType.STONEKIN) {
              dmg = Math.max(dmg, Math.floor(e.damage * 0.75 * moraleMult));
            }
            // Sylvanii: Archery arrow flight particle
            if (e.species === SpeciesType.SYLVANII || e.equipment.weapon?.category === 'ranged') {
              particles.spawnParticle(target.x, target.y, '#34d399', 0, -0.2, 0.3, 2);
            }

            target.hp -= dmg;
            e.attackCooldown = ATTACK_COOLDOWN;
            particles.spawnDamageNumber(target.x, target.y, dmg);
            sound.playHit();

            if (target.hp <= 0) {
              e.kills++;
              e.gainXp(30 + target.level * 5);
              if (e.kingdomId && target.kingdomId) {
                this.diplomacy.recordBattle(e.kingdomId, target.kingdomId, 1, 0);
              }
            }
          } else {
            const isArcher = (e.species === SpeciesType.SYLVANII || e.equipment.weapon?.category === 'ranged') && targetDist < 4;
            if (!isArcher) {
              const attackSpeed = e.species === SpeciesType.EMBERKIN ? speed * 1.3 :
                                  e.species === SpeciesType.STONEKIN ? speed * 0.8 : speed;
              const pos = SimplePathfinder.getStepTowards(e.x, e.y, target.x, target.y, tileMap, attackSpeed);
              e.x = pos.x; e.y = pos.y;
            }
          }
        } else {
          // SIEGE WARFARE: If no enemy soldier nearby, attack enemy city buildings & conquer Town Center!
          this.executeSiegeWarfare(e, tileMap, particles, speed);
        }
        break;
      }

      case 'gather_wood': {
        // Purely visual — yearly produceGoods handles actual economy
        e.showEmote('🪓', 20);
        if (!e.cityId || !this.cities.has(e.cityId)) { e.aiState = 'wander'; break; }
        const gCity = this.cities.get(e.cityId)!;
        if (e.targetX === null || e.targetY === null) {
          const cached = gCity.nearestCached(TerrainType.FOREST, e.x, e.y);
          const target = cached ?? this.findNearestTileType(e.x, e.y, TerrainType.FOREST, tileMap, 12);
          if (target) { e.targetX = target.x + 0.5; e.targetY = target.y + 0.5; }
          else { e.aiState = 'idle'; e.aiCooldown = 0; break; }
        }
        const gDist = SimplePathfinder.distance(e.x, e.y, e.targetX!, e.targetY!);
        if (gDist < 1.0) {
          e.energy = Math.max(0, e.energy - 0.3);
          e.gainXp(1);
          e.targetX = null; e.targetY = null;
        } else {
          const pos = SimplePathfinder.getStepTowards(e.x, e.y, e.targetX!, e.targetY!, tileMap, speed);
          e.x = pos.x; e.y = pos.y;
          if (pos.blocked) { e.targetX = null; e.targetY = null; }
        }
        break;
      }

      case 'gather_food': {
        // Purely visual — yearly produceGoods handles farm output
        e.showEmote('🌾', 20);
        if (!e.cityId || !this.cities.has(e.cityId)) { e.aiState = 'wander'; break; }
        const gCity = this.cities.get(e.cityId)!;
        const bld = e.workplaceId ? gCity.buildings.get(e.workplaceId) : null;
        const fx = bld ? bld.x + 0.5 : gCity.x;
        const fy = bld ? bld.y + 0.5 : gCity.y;
        const fDist = Math.hypot(fx - e.x, fy - e.y);
        if (fDist < 0.8) {
          e.energy = Math.max(0, e.energy - 0.2);
          e.gainXp(1);
        } else {
          const pos = SimplePathfinder.getStepTowards(e.x, e.y, fx, fy, tileMap, speed);
          e.x = pos.x; e.y = pos.y;
        }
        break;
      }

      case 'gather_ore': {
        // Purely visual — yearlyApiGoods handles extraction
        e.showEmote('⛏️', 20);
        if (!e.cityId || !this.cities.has(e.cityId)) { e.aiState = 'wander'; break; }
        const gCity = this.cities.get(e.cityId)!;
        if (e.targetX === null || e.targetY === null) {
          const deposit = this.findNearestResourceTile(e.x, e.y, tileMap, 10);
          if (deposit) { e.targetX = deposit.x + 0.5; e.targetY = deposit.y + 0.5; }
          else { e.aiState = 'idle'; e.aiCooldown = 0; break; }
        }
        const oDist = SimplePathfinder.distance(e.x, e.y, e.targetX!, e.targetY!);
        if (oDist < 1.0) {
          e.energy = Math.max(0, e.energy - 0.3);
          e.gainXp(1);
          e.targetX = null; e.targetY = null;
        } else {
          const pos = SimplePathfinder.getStepTowards(e.x, e.y, e.targetX!, e.targetY!, tileMap, speed);
          e.x = pos.x; e.y = pos.y;
          if (pos.blocked) { e.targetX = null; e.targetY = null; }
        }
        break;
      }

      case 'raid': {
        // March on the assigned enemy settlement. Once in siege range the army
        // holds position — the warfare layer resolves the siege each year, and
        // the combat priority handles anyone who comes out to meet them.
        if (e.targetX === null || e.targetY === null) {
          e.aiState = 'patrol';
          e.aiCooldown = 0;
          break;
        }

        const distance = SimplePathfinder.distance(e.x, e.y, e.targetX, e.targetY);
        if (distance > SIEGE_RADIUS - 1.5) {
          // An army on campaign moves far faster than a soldier walking his beat.
          // At patrol pace a war would end long before anyone reached the border.
          const pos = SimplePathfinder.getStepTowards(e.x, e.y, e.targetX, e.targetY, tileMap, speed * 2.5);
          e.x = pos.x; e.y = pos.y;
          if (pos.blocked) { e.targetX = null; e.targetY = null; e.aiState = 'patrol'; }
        } else {
          // Encamped outside the walls. The camp is anchored to the city, not to
          // wherever the soldier happens to stand — otherwise the army drifts off
          // and the siege never musters enough men to count.
          this.doEncampAround(e, e.targetX, e.targetY, tileMap, speed * 0.6, 4.5);
        }
        break;
      }

      case 'patrol': {
        e.showEmote(e.profession === 'king' ? 'crown' : 'shield', 25);
        if (!e.cityId || !this.cities.has(e.cityId)) { e.aiState = 'wander'; break; }
        const city = this.cities.get(e.cityId)!;
        const patrolRadius = e.species === SpeciesType.STONEKIN ? 6 :
                             e.species === SpeciesType.EMBERKIN ? 10 : 8;
        this.doWanderNearCity(e, city, tileMap, speed * 0.9, patrolRadius);
        break;
      }

      case 'explore': {
        // Scout/explore far from home
        const exploreRadius = e.species === SpeciesType.SYLVANII ? 25 : 18;
        this.doWander(e, tileMap, speed * 1.1, exploreRadius);
        break;
      }

      case 'heal': {
        // Stay still and regenerate
        e.hp = Math.min(e.maxHp, e.hp + 3);
        // Lumini heal faster (sun blessing)
        if (e.species === SpeciesType.LUMINI) e.hp = Math.min(e.maxHp, e.hp + 2);
        if (e.hp >= e.maxHp * 0.9) {
          e.aiState = 'idle';
          e.aiCooldown = 0;
        }
        break;
      }

      case 'wander':
      default:
        if (e.cityId && this.cities.has(e.cityId)) {
          this.doWanderNearCity(e, this.cities.get(e.cityId)!, tileMap, speed, 8);
        } else {
          this.doWander(e, tileMap, speed, 10);
        }
        break;

      case 'sleep': {
        e.showEmote('😴', 20);
        e.energy = Math.min(e.maxEnergy, e.energy + 3);
        const hx = e.homeX ?? (e.cityId ? this.cities.get(e.cityId)?.x : e.x) ?? e.x;
        const hy = e.homeY ?? (e.cityId ? this.cities.get(e.cityId)?.y : e.y) ?? e.y;
        const homeDist = Math.hypot(hx - e.x, hy - e.y);
        if (homeDist > 2) {
          const pos = SimplePathfinder.getStepTowards(e.x, e.y, hx, hy, tileMap, speed * 0.4);
          e.x = pos.x; e.y = pos.y;
        }
        break;
      }

      case 'go_to_work': {
        e.showEmote('🚶', 15);
        const bid = e.workplaceId;
        if (!bid || !e.cityId) { e.aiState = 'idle'; break; }
        const wCity = this.cities.get(e.cityId);
        if (!wCity) { e.aiState = 'idle'; break; }
        const bld = wCity.buildings.get(bid);
        if (!bld) { e.aiState = 'idle'; break; }
        const wx = bld.x + 0.5, wy = bld.y + 0.5;
        const dist = Math.hypot(wx - e.x, wy - e.y);
        if (dist < 0.8) {
          e.aiState = 'idle';
          e.targetX = wx;
          e.targetY = wy;
        } else {
          const pos = SimplePathfinder.getStepTowards(e.x, e.y, wx, wy, tileMap, speed);
          e.x = pos.x; e.y = pos.y;
        }
        break;
      }

      case 'return_home': {
        e.showEmote('🏠', 15);
        const hx = e.homeX ?? (e.cityId ? this.cities.get(e.cityId)?.x : null) ?? e.x;
        const hy = e.homeY ?? (e.cityId ? this.cities.get(e.cityId)?.y : null) ?? e.y;
        const dist = Math.hypot(hx - e.x, hy - e.y);
        if (dist < 0.8) {
          e.aiState = 'idle';
          e.targetX = null; e.targetY = null;
        } else {
          const pos = SimplePathfinder.getStepTowards(e.x, e.y, hx, hy, tileMap, speed);
          e.x = pos.x; e.y = pos.y;
          if (pos.blocked) { e.x = hx; e.y = hy; } // snap home if stuck
        }
        break;
      }
    }
  }

  // ===================== MOVEMENT HELPERS =====================

  private doWander(e: Entity, tileMap: TileMap, speed: number, radius: number): void {
    if (e.targetX === null || e.targetY === null ||
        SimplePathfinder.distance(e.x, e.y, e.targetX, e.targetY) < 0.3) {
      const target = SimplePathfinder.findRandomWalkable(e.x, e.y, radius, tileMap);
      if (target) { e.targetX = target.x; e.targetY = target.y; }
      else { e.targetX = null; e.targetY = null; return; }
    }
    const pos = SimplePathfinder.getStepTowards(e.x, e.y, e.targetX!, e.targetY!, tileMap, speed);
    e.x = pos.x; e.y = pos.y;
    if (pos.blocked) { e.targetX = null; e.targetY = null; }
  }

  private doWanderNearCity(e: Entity, city: City, tileMap: TileMap, speed: number, radius: number): void {
    if (e.targetX === null || e.targetY === null ||
        SimplePathfinder.distance(e.x, e.y, e.targetX, e.targetY) < 0.3) {
      const target = SimplePathfinder.findRandomWalkable(city.x, city.y, radius, tileMap);
      if (target) { e.targetX = target.x; e.targetY = target.y; }
      else { e.targetX = null; e.targetY = null; return; }
    }
    const pos = SimplePathfinder.getStepTowards(e.x, e.y, e.targetX!, e.targetY!, tileMap, speed);
    e.x = pos.x; e.y = pos.y;
    if (pos.blocked) { e.targetX = null; e.targetY = null; }
  }

  /**
   * Holds a besieging soldier on a ring around the city he is investing.
   *
   * Each soldier takes his own arc of the encirclement, derived from his id, so
   * an army spreads around the walls instead of piling on one spot. Crucially it
   * does not touch `targetX/targetY`, which stay pointed at the city — the army
   * must not forget what it came to besiege.
   */
  private doEncampAround(e: Entity, cx: number, cy: number, tileMap: TileMap, speed: number, radius: number): void {
    // Stable per-soldier angle so the camp holds its shape year to year.
    let hash = 0;
    for (let i = e.id.length - 6; i < e.id.length; i++) {
      hash = (hash * 31 + e.id.charCodeAt(Math.max(0, i))) | 0;
    }
    const angle = (Math.abs(hash) % 360) * (Math.PI / 180);

    const postX = cx + Math.cos(angle) * radius;
    const postY = cy + Math.sin(angle) * radius;

    if (SimplePathfinder.distance(e.x, e.y, postX, postY) < 0.4) return;
    const pos = SimplePathfinder.getStepTowards(e.x, e.y, postX, postY, tileMap, speed);
    e.x = pos.x;
    e.y = pos.y;
  }

  /** Auto-arm soldiers with tech-tiered weapons & armor. */
  private autoArmSoldier(e: Entity): void {
    if (e.profession !== 'soldier' && e.profession !== 'king') return;
    if (e.equipment.weapon) return; // Already armed

    const kingdom = e.kingdomId ? this.kingdoms.get(e.kingdomId) : null;
    const knowsIron = kingdom?.research.knows('metallurgy') || kingdom?.research.knows('iron_working');
    const knowsSteel = kingdom?.research.knows('steel') || kingdom?.research.knows('factories');

    if (knowsSteel) {
      const weaponTemplate = rng.pick(WEAPON_TIERS.steel);
      const armorTemplate = rng.pick(ARMOR_TIERS.steel);
      e.equipment.weapon = { ...weaponTemplate, id: `w_${Date.now()}` };
      e.equipment.armor = { ...armorTemplate, id: `a_${Date.now()}` };
    } else if (knowsIron) {
      const weaponTemplate = rng.pick(WEAPON_TIERS.iron);
      const armorTemplate = rng.pick(ARMOR_TIERS.iron);
      e.equipment.weapon = { ...weaponTemplate, id: `w_${Date.now()}` };
      e.equipment.armor = { ...armorTemplate, id: `a_${Date.now()}` };
    } else {
      const weaponTemplate = rng.pick(WEAPON_TIERS.primitive);
      const armorTemplate = rng.pick(ARMOR_TIERS.primitive);
      e.equipment.weapon = { ...weaponTemplate, id: `w_${Date.now()}` };
      e.equipment.armor = { ...armorTemplate, id: `a_${Date.now()}` };
    }
    e.recalculateStats();
  }

  /**
   * With no enemy soldier in reach, a warband presses on toward the nearest
   * enemy settlement and invests it.
   *
   * Taking the city is *not* decided here. A single soldier touching a town
   * centre must not annex it — the yearly warfare tick weighs the besieging army
   * against the city's walls and garrison, and only then does it fall.
   */
  private executeSiegeWarfare(e: Entity, tileMap: TileMap, particles: ParticleManager, speed: number): void {
    if (!e.kingdomId) return;

    // Find nearest enemy city
    let enemyCity: City | null = null;
    let closestDist = Infinity;

    for (const city of this.cities.values()) {
      if (city.kingdomId && this.diplomacy.isAtWar(e.kingdomId, city.kingdomId)) {
        const dist = Math.hypot(city.x - e.x, city.y - e.y);
        if (dist < closestDist) {
          closestDist = dist;
          enemyCity = city;
        }
      }
    }

    if (!enemyCity) {
      e.aiState = 'idle';
      e.aiCooldown = 0;
      return;
    }

    e.showEmote('⚔️', 25);

    if (closestDist > SIEGE_RADIUS - 1.5) {
      // Still marching. Campaign pace, not patrol pace.
      const pos = SimplePathfinder.getStepTowards(e.x, e.y, enemyCity.x, enemyCity.y, tileMap, speed * 2.5);
      e.x = pos.x; e.y = pos.y;
      return;
    }

    // Investing the city: hold the ring and let the siege resolve over years.
    this.doEncampAround(e, enemyCity.x, enemyCity.y, tileMap, speed * 0.6, 4.5);

    // Siege engines and fires wear the defences down while the army sits there.
    if (rng.chance(0.02)) {
      particles.spawnExplosion(enemyCity.x, enemyCity.y, '#ef4444', 6);
      const buildings = [...enemyCity.buildings.values()].filter(b => b.type !== 'town_center');
      if (buildings.length > 0) {
        const hit = rng.pick(buildings);
        hit.hp -= e.damage;
        if (hit.hp <= 0) {
          enemyCity.removeBuilding(hit.id);
          const tile = tileMap.getTile(hit.x, hit.y);
          if (tile && tile.buildingId === hit.id) tile.buildingId = null;
        }
      }
    }
  }

  // ===================== HELPER CHECKS =====================

  private isEnemy(self: Entity, other: Entity): boolean {
    if (self.id === other.id) return false;
    if (!self.kingdomId || !other.kingdomId) return false;
    if (self.kingdomId === other.kingdomId) return false;
    return this.diplomacy.isAtWar(self.kingdomId, other.kingdomId);
  }

  private isFaunaThreat(entity: Entity): boolean {
    return entity.species === SpeciesType.WOLF ||
           entity.species === SpeciesType.BEAR ||
           entity.species === SpeciesType.DRAGON;
  }

  private findNearestTileType(x: number, y: number, type: TerrainType, tileMap: TileMap, radius: number): { x: number; y: number } | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const tile = tileMap.getTile(cx + dx, cy + dy);
        if (tile && tile.type === type) {
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            best = { x: cx + dx, y: cy + dy };
          }
        }
      }
    }
    return best;
  }

  // ===================== CITY / KINGDOM FOUNDING =====================

  private tryJoinOrFoundCity(e: Entity, tileMap: TileMap): void {
    // Try join existing same-species city
    const nearby = this.spatialHash.queryRadius(e.x, e.y, 8);
    for (const other of nearby) {
      if (other.species === e.species && other.cityId && this.cities.has(other.cityId)) {
        e.cityId = other.cityId;
        const city = this.cities.get(other.cityId)!;
        city.population++;
        e.kingdomId = city.kingdomId;
        return;
      }
    }

    // Found new city
    const tile = tileMap.getTile(Math.floor(e.x), Math.floor(e.y));
    if (tile && !tile.type.includes('ocean') && tile.type !== TerrainType.MOUNTAIN && !tile.cityId) {
      const cityId = `city_${Date.now()}_${Math.random()}`;
      const cityName = `${e.name}ton`;
      const city = new City(cityId, cityName, e.species, tile.x, tile.y, e.name, this.currentYear);
      city.population = 1;
      this.cities.set(cityId, city);
      e.cityId = cityId;
      tile.cityId = cityId;
      chronicle.log(this.currentYear, 'founding', `The settlement of ${cityName} was founded by ${e.name}.`);
      this.checkKingdomFounding(city, e);
    }
  }

  private checkKingdomFounding(city: City, rulerCandidate: Entity): void {
    if (!city.kingdomId) {
      const kingdomId = `king_${Date.now()}_${Math.random()}`;
      const color = getNextKingdomColor();
      const kingdomName = generateKingdomName();

      const kingdom = new Kingdom(kingdomId, kingdomName, city.species, color, city.id, this.currentYear);
      kingdom.rulerId = rulerCandidate.id;
      rulerCandidate.profession = 'king';

      // Found the ruling house. Every later succession is measured against it.
      if (!rulerCandidate.dynasty) rulerCandidate.dynasty = generateDynastyName(rulerCandidate.species);
      kingdom.dynasty = rulerCandidate.dynasty;
      // The realm starts as a tribe and evolves from there through the political
      // tree. adoptGovernment retitles it to match, so a brand new realm is never
      // called a Republic before anyone has invented one.
      kingdom.adoptGovernment('tribe', this.currentYear);

      this.kingdoms.set(kingdomId, kingdom);
      city.kingdomId = kingdomId;
      rulerCandidate.kingdomId = kingdomId;

      chronicle.log(this.currentYear, 'kingdom', `The ${kingdom.name} was established. ${rulerCandidate.fullName} leads its people.`);
    }
  }

  // ===================== GEOPOLITICS (YEARLY) =====================

  /**
   * War, peace and rivalry between realms. Runs once a year alongside the
   * civilization engine, which handles everything economic and political.
   */
  private tickGeopolitics(): void {
    if (this.kingdoms.size < 2) return;
    const kingdoms = Array.from(this.kingdoms.values());

    // Realms only quarrel with realms they have actually met.
    for (let i = 0; i < kingdoms.length; i++) {
      for (let j = i + 1; j < kingdoms.length; j++) {
        const k1 = kingdoms[i];
        const k2 = kingdoms[j];
        if (!k1.knownKingdoms.has(k2.id)) continue;

        // Vassals do not fight their overlord, nor their overlord's other vassals.
        if (k1.overlordId === k2.id || k2.overlordId === k1.id) continue;
        if (k1.overlordId && k1.overlordId === k2.overlordId) continue;

        // Different peoples drift apart; kin drift together.
        if (rng.chance(0.35)) {
          const drift = k1.species !== k2.species ? -2 : 1;
          this.diplomacy.changeRelation(k1.id, k2.id, drift);
        }

        // Ideology matters once realms have one.
        const gov1 = GOVERNMENTS[k1.government];
        const gov2 = GOVERNMENTS[k2.government];
        if (gov1.economy !== gov2.economy && (gov1.economy === 'planned' || gov2.economy === 'planned')) {
          if (rng.chance(0.3)) this.diplomacy.changeRelation(k1.id, k2.id, -3);
        }

        if (this.diplomacy.isAtWar(k1.id, k2.id)) continue;

        const relation = this.diplomacy.getRelation(k1.id, k2.id);
        if (relation > -35) continue;

        // Aggression comes from the government and the ruler's temperament.
        const aggressor = gov1.aggression >= gov2.aggression ? k1 : k2;
        const defender = aggressor === k1 ? k2 : k1;
        const aggression =
          GOVERNMENTS[aggressor.government].aggression *
          (0.72 +
            aggressor.culture.militarism * 0.28 +
            aggressor.culture.expansionism * 0.2 -
            aggressor.culture.warTrauma * 0.18 -
            aggressor.culture.diplomaticTrust * 0.08) *
          (0.78 + aggressor.society.warPressure * 0.34 - aggressor.society.peacePressure * 0.18);

        // A realm only starts a war it believes it can win.
        const powerRatio = aggressor.computePower() / Math.max(1, defender.computePower());
        const confidence = Math.min(2, powerRatio);
        if (rng.chance(0.06 * aggression * confidence)) {
          const reason = aggressor.isEmpire ? 'Imperial Expansion'
            : powerRatio > 1.8 ? 'Conquest'
            : relation <= -80 ? 'Blood Feud'
            : 'Border Dispute';
          if (this.diplomacy.declareWar(aggressor.id, defender.id, this.currentYear, reason)) {
            chronicle.log(this.currentYear, 'war', `${aggressor.name} declared war upon ${defender.name}. Reason: ${reason}`);
          }
        }
      }
    }

    // Long wars exhaust the realms fighting them.
    for (const kingdom of kingdoms) {
      const wars = this.diplomacy.getWarsFor(kingdom.id);
      kingdom.warWeariness = wars.length > 0
        ? Math.min(100, kingdom.warWeariness + wars.length * 4)
        : Math.max(0, kingdom.warWeariness - 6);
    }
  }

  // ===================== FAMILIES & REPRODUCTION (YEARLY) =====================

  /**
   * Couples form, children are born, and bloodlines carry traits forward.
   * This is the only source of new citizens — settlements grow because people
   * actually have families in them.
   */
  private tickFamilies(tileMap: TileMap): void {
    const byCity = new Map<string, Entity[]>();
    for (const e of this.entities) {
      if (!e.cityId || !SPECIES_DEFINITIONS[e.species].isHumanoid) continue;
      if (!byCity.has(e.cityId)) byCity.set(e.cityId, []);
      byCity.get(e.cityId)!.push(e);
    }

    for (const [cityId, residents] of byCity) {
      const city = this.cities.get(cityId);
      if (!city) continue;

      const housing = Math.max(4, city.housingCapacity());
      const crowded = residents.length >= housing;
      const foodPerHead = city.stock.get('food') / Math.max(1, residents.length);

      // Courtship: pair off unattached adults.
      const single = residents.filter(e => !e.partnerId && e.isFertile(SPECIES_DEFINITIONS[e.species].maxAge));
      for (let i = 0; i < single.length; i++) {
        if (single[i].partnerId) continue;
        for (let j = i + 1; j < single.length; j++) {
          if (single[j].partnerId) continue;
          if (!canPairWith(single[i], single[j])) continue;
          if (!rng.chance(0.45)) continue;
          formPartnership(single[i], single[j]);
          break;
        }
      }

      // Childbirth: only when there is food and room.
      if (crowded || foodPerHead < 1.6) continue;

      const couples = new Set<string>();
      for (const parent of residents) {
        if (parent.gender !== 'female' || parent.isPregnant) continue;
        if (!parent.partnerId || couples.has(parent.id)) continue;
        const partner = this.entities.find(e => e.id === parent.partnerId);
        if (!partner || partner.cityId !== cityId) continue;

        couples.add(parent.id);
        couples.add(partner.id);

        const maxAge = SPECIES_DEFINITIONS[parent.species].maxAge;
        if (!parent.isFertile(maxAge) || !partner.isFertile(maxAge)) continue;

        // Species-Specific Reproduction Rates & Resource Requirements
        let chance = 0.35 * city.prosperity + Math.min(0.25, foodPerHead / 25);

        if (parent.species === SpeciesType.STONEKIN) {
          if (city.stock.get('stone') < 8) continue;
          city.stock.take('stone', 8);
          chance *= 0.85;
        } else if (parent.species === SpeciesType.EMBERKIN) {
          chance *= 1.25;
        } else if (parent.species === SpeciesType.SYLVANII) {
          chance *= 0.75;
        }

        if (!rng.chance(chance)) continue;

        const father = partner.gender === 'male' ? partner : parent;
        const mother = parent.gender === 'female' ? parent : partner;

        // Start Gestation / Pregnancy Phase!
        const gestation = SPECIES_DEFINITIONS[mother.species].gestationYears ?? 1;
        mother.isPregnant = true;
        mother.pregnancyTimer = gestation;
        mother.pregnantFatherId = father.id;
        mother.showEmote('🤰', 60);

        chronicle.log(
          this.currentYear,
          'society',
          `🤰 ${mother.fullName} está gestando um novo herdeiro(a) com ${father.fullName} em ${city.name}.`
        );

        city.stock.take('food', 4);
      }
    }
  }

  private findWalkableNear(x: number, y: number, radius: number, tileMap: TileMap): { x: number; y: number } {
    for (let i = 0; i < 10; i++) {
      const nx = x + rng.rangeInt(-radius, radius);
      const ny = y + rng.rangeInt(-radius, radius);
      const tile = tileMap.getTile(nx, ny);
      if (tile && !tile.type.includes('ocean') && tile.type !== TerrainType.MOUNTAIN) return { x: nx, y: ny };
    }
    return { x, y };
  }

  /**
   * The enemy settlement this soldier should march on, or null in peacetime.
   *
   * Realms concentrate on the nearest enemy city, so armies converge into a real
   * siege rather than scattering across the whole front.
   */
  private pickRaidTarget(soldier: Entity): City | null {
    if (!soldier.kingdomId) return null;
    const enemies = this.diplomacy.getEnemies(soldier.kingdomId);
    if (enemies.length === 0) return null;

    // A realm being invaded defends itself before it goes raiding.
    const homeUnderSiege = [...this.cities.values()].find(
      c => c.kingdomId === soldier.kingdomId && c.besiegerId
    );
    if (homeUnderSiege) {
      return homeUnderSiege;
    }

    let best: City | null = null;
    let bestScore = Infinity;

    for (const city of this.cities.values()) {
      if (!city.kingdomId || !enemies.includes(city.kingdomId)) continue;
      const distance = Math.hypot(city.x - soldier.x, city.y - soldier.y);
      // Prefer close, weakly held settlements.
      const score = distance + city.defenseMultiplier() * 12;
      if (score < bestScore) {
        bestScore = score;
        best = city;
      }
    }

    // Don't send armies on a march they cannot finish before the war is over.
    return best && Math.hypot(best.x - soldier.x, best.y - soldier.y) < 55 ? best : null;
  }

  /** Nearest tile carrying any harvestable deposit. Used by miners. */
  private findNearestResourceTile(x: number, y: number, tileMap: TileMap, radius: number) {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let best = null;
    let bestDist = Infinity;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const tile = tileMap.getTile(cx + dx, cy + dy);
        if (!tile || !tile.resourceType || !MINEABLE_GOODS.includes(tile.resourceType)) continue;
        if (tile.resourceAmount <= 0) continue;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = tile; }
      }
    }
    return best;
  }

  private tickAge(): void {
    const toKill: Entity[] = [];

    for (const e of [...this.entities]) {
      if (e.fertilityCooldown > 0) e.fertilityCooldown--;

      // Process Gestation & Birth Event
      if (e.isPregnant) {
        e.pregnancyTimer--;
        e.showEmote('🤰', 40);
        if (e.pregnancyTimer <= 0) {
          this.processBirthEvent(e);
        }
      }

      if (e.traits.has(TraitId.IMMORTAL)) continue;

      const oldAge = e.age;
      e.age++;
      const maxAge = SPECIES_DEFINITIONS[e.species].maxAge;
      const isHumanoid = SPECIES_DEFINITIONS[e.species].isHumanoid;

      // --- INFANT MORTALITY (age 0→1) ---
      // Infants have a baseline risk of dying from disease. City prosperity
      // mitigates this heavily — well-fed, safe settlements keep them alive.
      if (oldAge <= 2 && e.lifeStage === 'infant') {
        const city = e.cityId ? this.cities.get(e.cityId) : null;
        const prosperity = city?.prosperity ?? 0;
        let risk = isHumanoid ? 0.03 : 0.06;
        // Prosperity ≥ 0.6 cuts risk by 80%
        if (prosperity >= 0.6) risk *= 0.2;
        if (rng.chance(risk)) {
          toKill.push(e);
          chronicle.log(this.currentYear, 'society',
            isHumanoid
              ? `🕊️ Bebê ${e.fullName} (${Math.floor(e.age)} anos) faleceu por doença infantil em ${city?.name ?? 'terras ermas'}.`
              : `🕊️ Filhote ${e.name} (${e.species}) não sobreviveu à infância.`);
          continue;
        }
      }

      // --- First birthday milestone ---
      if (oldAge === 0 && e.age === 1 && isHumanoid) {
        const city = e.cityId ? this.cities.get(e.cityId) : null;
        if (city) {
          chronicle.log(this.currentYear, 'society',
            `🍼 ${e.fullName} sobreviveu ao primeiro ano de vida em ${city.name}!`);
        }
      }

      // --- Adolescent milestone (age 13) ---
      if (oldAge === 12 && e.age === 13 && isHumanoid) {
        e.showEmote('📖', 50);
        if (e.cityId && this.cities.has(e.cityId)) {
          const city = this.cities.get(e.cityId)!;
          chronicle.log(this.currentYear, 'society',
            `📖 ${e.fullName} tornou-se adolescente em ${city.name}.`);
        }
      }

      // Coming of age at 18: Gains full adult status!
      if (oldAge < 18 && e.age >= 18) {
        e.showEmote('✨', 60);
        e.recalculateStats();
        e.hp = e.maxHp; // Full heal — physical maturation complete
        if (e.cityId && this.cities.has(e.cityId)) {
          const city = this.cities.get(e.cityId)!;
          if (e.profession === 'none') {
            this.assignProfession(e, city);
          }
          chronicle.log(
            this.currentYear,
            'society',
            `✨ ${e.fullName} alcançou a idade adulta (18 anos) e ganhou cidadania plena em ${city.name}!`
          );
        }
      }

      // Mortality climbs steeply once past the species' natural span.
      if (e.age > maxAge * 0.85) {
        const frailty = (e.age - maxAge * 0.85) / (maxAge * 0.3);
        if (rng.chance(0.05 + frailty * 0.25)) e.hp = 0;
      }
    }

    // Kill entities that didn't survive infancy
    for (const dead of toKill) {
      dead.hp = 0;
      this.handleEntityDeath(dead, null!);
    }
  }

  private processBirthEvent(mother: Entity): void {
    mother.isPregnant = false;
    mother.pregnancyTimer = 0;
    mother.fertilityCooldown = rng.rangeInt(3, 6);

    const city = mother.cityId ? this.cities.get(mother.cityId) : null;
    const kingdom = mother.kingdomId ? this.kingdoms.get(mother.kingdomId) : null;

    let fatherEntity: Entity;
    const fatherMember = mother.pregnantFatherId ? (this.entities.find(e => e.id === mother.pregnantFatherId) || this.deceasedAncestors.get(mother.pregnantFatherId)) : null;

    if (fatherMember && !('isDeceased' in fatherMember)) {
      fatherEntity = fatherMember as Entity;
    } else {
      fatherEntity = new Entity(`f_${Date.now()}`, mother.species, mother.x, mother.y, fatherMember?.name ?? 'Pai Ancestral');
      fatherEntity.dynasty = fatherMember?.dynasty ?? mother.dynasty;
    }

    const birthX = mother.homeX ?? mother.x;
    const birthY = mother.homeY ?? mother.y;

    // Check for Twin Birth (5% chance)
    const isTwins = rng.chance(0.05);
    const birthCount = isTwins ? 2 : 1;

    for (let b = 0; b < birthCount; b++) {
      const { child } = conceiveChild(fatherEntity, mother, birthX + (b * 0.3), birthY, () => `ent_${Date.now()}_${Math.random()}`);
      child.showEmote('👶', 60);

      // Check for Royal Birth
      const isRoyal = (fatherEntity.profession === 'king' || mother.profession === 'king') || (kingdom && kingdom.rulerId === mother.id);

      if (isRoyal && kingdom) {
        chronicle.log(
          this.currentYear,
          'king',
          `👑 Nascimentos Imperiais! Nasceu o herdeiro(a) real ${child.fullName} da Dinastia ${kingdom.dynasty ?? child.dynasty} em ${city?.name ?? 'Capital'}!`
        );
      } else {
        chronicle.log(
          this.currentYear,
          'society',
          isTwins
            ? `👶👶 Gêmeos! Nasceu ${child.fullName}, filho(a) de ${fatherEntity.name} e ${mother.name} em ${city?.name ?? 'Vila'}!`
            : `👶 Nasceu ${child.fullName}, filho(a) de ${fatherEntity.name} e ${mother.name} em ${city?.name ?? 'Vila'}!`
        );
      }

      this.entities.push(child);
      this.spatialHash.insert(child);
      this.totalBirths++;
    }

    if (city) city.stock.take('food', 4);
    sound.playMagic();
  }

  private handleEntityDeath(dead: Entity, particles: ParticleManager): void {
    // Record ancestor in genealogy history map before removal
    this.deceasedAncestors.set(dead.id, {
      id: dead.id,
      name: dead.name,
      dynasty: dead.dynasty,
      fullName: dead.fullName,
      species: dead.species,
      gender: dead.gender,
      birthYear: Math.max(1, this.currentYear - dead.age),
      deathYear: this.currentYear,
      ageAtDeath: dead.age,
      profession: dead.profession,
      title: dead.title,
      isGreatPerson: dead.isGreatPerson,
      fatherId: dead.fatherId,
      motherId: dead.motherId,
      partnerId: dead.partnerId,
      childrenIds: [...dead.childrenIds],
      generation: dead.generation,
      isDeceased: true
    });

    const idx = this.entities.indexOf(dead);
    if (idx !== -1) this.entities.splice(idx, 1);
    this.spatialHash.remove(dead);
    this.totalDeaths++;

    // Death particles (skip if called from infant mortality with no particle manager)
    if (particles) particles.spawnExplosion(dead.x, dead.y, '#ef4444', 8);

    // Boss / Hero loot drop
    if (dead.species === SpeciesType.DRAGON || dead.species === SpeciesType.BEAR || dead.profession === 'king' || dead.level >= 5) {
      const nearbyHumanoids = this.spatialHash.queryRadius(dead.x, dead.y, 4)
        .filter(e => SPECIES_DEFINITIONS[e.species].isHumanoid);
      if (nearbyHumanoids.length > 0) {
        const hero = rng.pick(nearbyHumanoids);
        const itemTemplate = rng.pick(LEGENDARY_ITEMS);
        const item = { ...itemTemplate, id: `item_${Date.now()}` };
        if (item.type === 'weapon') hero.equipment.weapon = item;
        else hero.equipment.armor = item;
        hero.recalculateStats();
        chronicle.log(this.currentYear, 'disaster', `${hero.name} looted the legendary ${item.name} from the slain ${dead.name}!`);
      }
    }

    if (dead.cityId && this.cities.has(dead.cityId)) {
      const city = this.cities.get(dead.cityId)!;
      city.population = Math.max(0, city.population - 1);
      city.unassignWorker(dead.id);
    }

    if (dead.partnerId) {
      const partner = this.entities.find(e => e.id === dead.partnerId);
      if (partner) partner.partnerId = null;
    }

    if (dead.profession === 'king' && dead.kingdomId && this.kingdoms.has(dead.kingdomId)) {
      const kingdom = this.kingdoms.get(dead.kingdomId)!;
      const title = kingdom.rulerTitle;
      chronicle.log(this.currentYear, 'king', `${title} ${dead.fullName} of ${kingdom.name} has passed away.`);

      const candidates = this.entities.filter(e => e.kingdomId === kingdom.id && e.id !== dead.id);
      const successionMode = GOVERNMENTS[kingdom.government].succession;
      const heir = chooseSuccessor(dead.id, kingdom.dynasty, candidates, successionMode);

      if (heir) {
        heir.profession = 'king';
        kingdom.rulerId = heir.id;

        if (successionMode === 'bloodline' && heir.dynasty) {
          kingdom.dynasty = heir.dynasty;
        } else if (!heir.dynasty) {
          heir.dynasty = generateDynastyName(heir.species);
          kingdom.dynasty = heir.dynasty;
        } else {
          kingdom.dynasty = heir.dynasty;
        }

        const how = successionMode === 'election' ? 'was elected'
          : (heir.fatherId === dead.id || heir.motherId === dead.id) ? 'inherited the throne as heir'
          : 'seized the throne';
        chronicle.log(this.currentYear, 'king', `${heir.fullName} ${how} of ${kingdom.name}.`);
        events.emit('rulerCrowned', { kingdom, ruler: heir, previous: dead, year: this.currentYear });
      } else {
        kingdom.rulerId = null;
        chronicle.log(this.currentYear, 'king', `${kingdom.name} is left without a ruler.`);
      }
    }
  }
}
