import { events } from '../core/EventBus';
import { rng } from '../core/Random';

export type DiplomaticStatus = 'neutral' | 'friendly' | 'hostile' | 'war' | 'alliance';

export interface Alliance {
  id: string;
  name: string;
  members: Set<string>; // Kingdom IDs
  formedYear: number;
}

export interface WarRecord {
  id: string;
  attacker: string;
  defender: string;
  startYear: number;
  endYear: number | null;
  reason: string;
  battles: number;
  attackerKills: number;
  defenderKills: number;
  victor: string | null;
  settlement: PeaceSettlement | null;
}

export type PeaceSettlement = 'white_peace' | 'victory' | 'exhaustion' | 'independence';

export interface Truce {
  kingdoms: [string, string];
  signedYear: number;
  untilYear: number;
  reason: string;
}

export class DiplomacyManager {
  // Key: "k1_id:k2_id" -> numeric relation (-100 to +100)
  private relations: Map<string, number> = new Map();
  public alliances: Map<string, Alliance> = new Map();
  public activeWars: Map<string, WarRecord> = new Map(); // Key: "k1_id:k2_id" (sorted)
  public warHistory: WarRecord[] = [];
  private truces: Map<string, Truce> = new Map();

  private getPairKey(k1: string, k2: string): string {
    return k1 < k2 ? `${k1}:${k2}` : `${k2}:${k1}`;
  }

  public getRelation(k1: string, k2: string): number {
    if (k1 === k2) return 100;
    const key = this.getPairKey(k1, k2);
    return this.relations.get(key) ?? 0;
  }

  public getStatus(k1: string, k2: string): DiplomaticStatus {
    if (k1 === k2) return 'friendly';
    const key = this.getPairKey(k1, k2);
    if (this.activeWars.has(key)) return 'war';
    
    // Check alliances
    for (const alliance of this.alliances.values()) {
      if (alliance.members.has(k1) && alliance.members.has(k2)) return 'alliance';
    }
    
    const rel = this.getRelation(k1, k2);
    if (rel >= 50) return 'friendly';
    if (rel <= -50) return 'hostile';
    return 'neutral';
  }

  public setRelation(k1: string, k2: string, value: number): void {
    if (k1 === k2) return;
    const key = this.getPairKey(k1, k2);
    const clamped = Math.max(-100, Math.min(100, Math.round(value)));
    this.relations.set(key, clamped);
  }

  public changeRelation(k1: string, k2: string, delta: number): void {
    const current = this.getRelation(k1, k2);
    this.setRelation(k1, k2, current + delta);
  }

  public isAtWar(k1: string, k2: string): boolean {
    if (k1 === k2) return false;
    return this.activeWars.has(this.getPairKey(k1, k2));
  }

  public getTruce(k1: string, k2: string, year: number): Truce | null {
    const key = this.getPairKey(k1, k2);
    const truce = this.truces.get(key);
    if (!truce) return null;
    if (year <= truce.untilYear) return truce;
    this.truces.delete(key);
    return null;
  }

  public hasTruce(k1: string, k2: string, year: number): boolean {
    return this.getTruce(k1, k2, year) !== null;
  }

  public recordTruce(k1: string, k2: string, year: number, durationYears: number, reason: string): void {
    const key = this.getPairKey(k1, k2);
    const sorted = key.split(':') as [string, string];
    this.truces.set(key, {
      kingdoms: sorted,
      signedYear: year,
      untilYear: year + Math.max(1, Math.round(durationYears)),
      reason
    });
  }

  public declareWar(k1: string, k2: string, year: number, reason: string = 'Territorial Dispute'): boolean {
    if (k1 === k2) return false;
    const rebellion = /rebellion|secession|independence/i.test(reason);
    if (!rebellion && this.hasTruce(k1, k2, year)) return false;
    const key = this.getPairKey(k1, k2);
    if (!this.activeWars.has(key)) {
      const warRecord: WarRecord = {
        id: `war_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        attacker: k1,
        defender: k2,
        startYear: year,
        endYear: null,
        reason,
        battles: 0,
        attackerKills: 0,
        defenderKills: 0,
        victor: null,
        settlement: null
      };
      this.activeWars.set(key, warRecord);
      this.setRelation(k1, k2, -100);
      
      // Break alliances between warring kingdoms
      for (const [allyId, alliance] of this.alliances) {
        if (alliance.members.has(k1) && alliance.members.has(k2)) {
          alliance.members.delete(k2);
          if (alliance.members.size < 2) this.alliances.delete(allyId);
        }
      }
      
      events.emit('warStarted', { k1, k2, year, reason });
      return true;
    }
    return false;
  }

  public recordBattle(k1: string, k2: string, k1Kills: number, k2Kills: number): void {
    const key = this.getPairKey(k1, k2);
    const war = this.activeWars.get(key);
    if (war) {
      war.battles++;
      if (war.attacker === k1) {
        war.attackerKills += k1Kills;
        war.defenderKills += k2Kills;
      } else {
        war.defenderKills += k1Kills;
        war.attackerKills += k2Kills;
      }
    }
  }

  public endWar(k1: string, k2: string, year: number): void {
    const key = this.getPairKey(k1, k2);
    const war = this.activeWars.get(key);
    if (war) {
      war.endYear = year;
      war.settlement ??= 'white_peace';
      this.warHistory.push(war);
      this.activeWars.delete(key);
      this.setRelation(k1, k2, -20); // Still hostile but not at war
      this.recordTruce(k1, k2, year, 5, war.settlement);
      events.emit('warEnded', { k1, k2, year, war });
    }
  }

  public settleWar(
    k1: string,
    k2: string,
    year: number,
    settlement: PeaceSettlement,
    victor: string | null = null,
    relationAfter?: number,
    truceYears: number = 5
  ): void {
    const key = this.getPairKey(k1, k2);
    const war = this.activeWars.get(key);
    if (!war) return;

    war.endYear = year;
    war.settlement = settlement;
    war.victor = victor;
    this.warHistory.push(war);
    this.activeWars.delete(key);
    this.setRelation(k1, k2, relationAfter ?? (settlement === 'white_peace' ? -20 : -35));
    this.recordTruce(k1, k2, year, truceYears, settlement);
    events.emit('warEnded', { k1, k2, year, war });
  }

  public createAlliance(k1: string, k2: string, name: string, year: number): Alliance | null {
    if (this.isAtWar(k1, k2)) return null;
    const allianceId = `all_${Date.now()}`;
    const alliance: Alliance = {
      id: allianceId,
      name,
      members: new Set([k1, k2]),
      formedYear: year
    };
    this.alliances.set(allianceId, alliance);
    this.setRelation(k1, k2, 80);
    events.emit('allianceFormed', { alliance, k1, k2 });
    return alliance;
  }

  /** Diplomacy tick - natural drift, war declarations, peace treaties */
  public tickDiplomacy(kingdomIds: string[], year: number): void {
    const ids = [...kingdomIds];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const k1 = ids[i];
        const k2 = ids[j];
        const rel = this.getRelation(k1, k2);

        // Natural drift toward 0 (neutral)
        if (rel > 5) this.changeRelation(k1, k2, -0.5);
        else if (rel < -5) this.changeRelation(k1, k2, 0.5);

        // Random events
        if (!this.isAtWar(k1, k2)) {
          if (this.hasTruce(k1, k2, year)) continue;

          // Chance to start war if hostile
          if (rel <= -60 && rng.chance(0.02)) {
            this.declareWar(k1, k2, year, rel <= -80 ? 'Blood Feud' : 'Border Conflict');
          }
          // Chance to form alliance if friendly
          if (rel >= 60 && rng.chance(0.01)) {
            const name = `Pact of ${year}`;
            this.createAlliance(k1, k2, name, year);
          }
        } else {
          // Ongoing war: chance for peace rises with duration and casualties.
          const war = this.activeWars.get(this.getPairKey(k1, k2));
          if (war && (year - war.startYear) > 3) {
            const duration = year - war.startYear;
            const casualties = war.attackerKills + war.defenderKills;
            const peaceChance = Math.min(0.22, 0.02 + duration * 0.012 + casualties * 0.0015);
            if (rng.chance(peaceChance)) {
              this.settleWar(k1, k2, year, casualties > 10 ? 'exhaustion' : 'white_peace', null, -25, 4 + Math.floor(duration / 2));
            }
          }
        }
      }
    }
  }

  /** Get all wars involving a specific kingdom */
  public getWarsFor(kingdomId: string): WarRecord[] {
    const wars: WarRecord[] = [];
    for (const [key, war] of this.activeWars) {
      if (war.attacker === kingdomId || war.defender === kingdomId) {
        wars.push(war);
      }
    }
    return wars;
  }

  /** Get the enemy kingdom IDs for a given kingdom */
  public getEnemies(kingdomId: string): string[] {
    const enemies: string[] = [];
    for (const [key, war] of this.activeWars) {
      if (war.attacker === kingdomId) enemies.push(war.defender);
      else if (war.defender === kingdomId) enemies.push(war.attacker);
    }
    return enemies;
  }

  /** Snapshot for save files. Sets and Maps don't survive JSON on their own. */
  public serialize(): any {
    return {
      relations: Array.from(this.relations.entries()),
      alliances: Array.from(this.alliances.values()).map(a => ({
        id: a.id,
        name: a.name,
        members: Array.from(a.members),
        formedYear: a.formedYear
      })),
      activeWars: Array.from(this.activeWars.entries()),
      warHistory: this.warHistory,
      truces: Array.from(this.truces.entries())
    };
  }

  public deserialize(data: any): void {
    this.relations = new Map(data.relations ?? []);

    this.alliances.clear();
    for (const a of data.alliances ?? []) {
      this.alliances.set(a.id, {
        id: a.id,
        name: a.name,
        members: new Set(a.members),
        formedYear: a.formedYear
      });
    }

    this.activeWars = new Map(data.activeWars ?? []);
    this.warHistory = data.warHistory ?? [];
    this.truces = new Map(data.truces ?? []);
  }
}
