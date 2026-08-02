import { Camera } from './Camera';
import { TileMap } from '../world/TileMap';
import { TerrainType } from '../world/Biomes';
import type { Tile } from '../world/Tile';
import { Entity } from '../entities/Entity';
import { SpeciesType, SPECIES_DEFINITIONS } from '../entities/Species';
import { Kingdom } from '../civ/Kingdom';
import { City } from '../civ/City';
import { ParticleManager } from './Particles';
import { OverlayMode } from './Overlays';
import { WorldEra } from '../world/WeatherEras';
import { SpriteGenerator, type EntitySpriteAnimation, type SpriteDirection } from './SpriteGenerator';
import { SpriteRegistry } from './SpriteRegistry';
import { PixelIcons } from './PixelIcons';
import { DiplomacyManager } from '../civ/Diplomacy';
import { Ship, SHIP_TIERS } from '../civ/NavalSystem';
import { OverlandCaravan } from '../civ/CaravanSystem';
import {
  RESOURCE_COLORS,
  TERRAIN_VISUALS,
  clamp,
  hash2,
  mixColor,
  parseColor,
  terrainSurfaceColor,
  withAlpha
} from './TerrainPalette';

/** Player-controlled visual toggles, driven by the Settings screen. */
export interface RenderOptions {
  showGrid: boolean;
  showCityNames: boolean;
  showKingdomBadges: boolean;
  showHealthBars: boolean;
  showParticles: boolean;
  showBrushCursor: boolean;
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  showGrid: false,
  showCityNames: true,
  showKingdomBadges: true,
  showHealthBars: true,
  showParticles: true,
  showBrushCursor: true
};

export class PixelRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animTimer: number = 0;
  private diplomacy: DiplomacyManager | null = null;
  private options: RenderOptions = { ...DEFAULT_RENDER_OPTIONS };
  /** Last ambient FX emission per building; avoids particle spam at high FPS. */
  private buildingFxTime: Map<string, number> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
  }

  public setDiplomacy(diplomacy: DiplomacyManager): void {
    this.diplomacy = diplomacy;
  }

  public setOptions(options: Partial<RenderOptions>): void {
    this.options = { ...this.options, ...options };
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Parse hex color to RGB */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    return parseColor(hex);
  }

  private getEntityDirection(e: Entity, moving: boolean): SpriteDirection {
    const movedX = e.x - e.prevX;
    const movedY = e.y - e.prevY;

    if (moving && Math.abs(movedX) + Math.abs(movedY) > 0.002) {
      if (Math.abs(movedX) >= Math.abs(movedY)) return movedX >= 0 ? 'right' : 'left';
      return movedY >= 0 ? 'down' : 'up';
    }

    if ((e.aiState === 'attack' || e.aiState === 'hunt' || e.aiState === 'flee') && e.targetX !== null && e.targetY !== null) {
      const targetDx = e.targetX - e.x;
      const targetDy = e.targetY - e.y;
      if (Math.abs(targetDx) >= Math.abs(targetDy)) return targetDx >= 0 ? 'right' : 'left';
      return targetDy >= 0 ? 'down' : 'up';
    }

    return e.facing < 0 ? 'left' : 'right';
  }

  private getEntityAnimation(e: Entity, moving: boolean): EntitySpriteAnimation {
    if ((e.aiState === 'attack' || e.aiState === 'hunt') && e.attackCooldown > 0) {
      return e.equipment.weapon?.category === 'ranged' ? 'shoot' : 'attack';
    }
    if (e.aiState === 'flee') return 'flee';
    if (e.aiState === 'heal') return 'heal';

    // Slow simulation states now have their own readable animation instead of
    // being rendered as generic walking/idle characters.
    if (e.aiState === 'gather_wood' || e.aiState === 'gather_food' || e.aiState === 'gather_ore' || (e.aiState === 'forage' && SPECIES_DEFINITIONS[e.species].isHumanoid)) return 'gather';
    if (e.aiState === 'build') return 'build';
    if (e.aiState === 'return_city') return 'carry';
    if (e.aiState === 'socialize') return 'socialize';
    if (e.aiState === 'idle' && e.energy < 18) return 'rest';
    if (moving) return 'walk';
    return 'idle';
  }

  private getAnimationFrame(e: Entity, animation: EntitySpriteAnimation, idHash: number): number {
    const rate = animation === 'attack' || animation === 'shoot' ? 11
      : animation === 'flee' ? 13
      : animation === 'walk' || animation === 'carry' ? 8
      : animation === 'gather' || animation === 'build' ? 6
      : animation === 'heal' || animation === 'socialize' ? 4
      : animation === 'rest' ? 1.5
      : 2;
    return Math.floor(this.animTimer * rate + idHash) % 4;
  }

  private getDirectionVector(direction: SpriteDirection): { x: number; y: number } {
    switch (direction) {
      case 'left': return { x: -1, y: 0 };
      case 'right': return { x: 1, y: 0 };
      case 'up': return { x: 0, y: -1 };
      case 'down':
      default:
        return { x: 0, y: 1 };
    }
  }

  private getSpeciesFxColor(e: Entity): string {
    switch (e.species) {
      case SpeciesType.LUMINI: return '#fef08a';
      case SpeciesType.SYLVANII: return '#bef264';
      case SpeciesType.STONEKIN: return '#cbd5e1';
      case SpeciesType.EMBERKIN: return '#fb923c';
      case SpeciesType.DRAGON: return '#f97316';
      case SpeciesType.WOLF: return '#e2e8f0';
      case SpeciesType.BEAR: return '#d97706';
      case SpeciesType.DEER:
      default:
        return '#fde68a';
    }
  }



  private buildingCategory(type: string): 'civic' | 'residential' | 'market' | 'industrial' | 'military' | 'faith' | 'utility' | 'rural' {
    if (['town_center', 'palace', 'academy', 'great_library', 'bank', 'stock_exchange', 'monument', 'colosseum'].includes(type)) return 'civic';
    if (['house', 'manor', 'apartment'].includes(type)) return 'residential';
    if (['market', 'harbor', 'port', 'caravanserai'].includes(type)) return 'market';
    if (['factory', 'refinery', 'oil_well', 'workshop', 'smithy', 'mine', 'quarry', 'lumberyard'].includes(type)) return 'industrial';
    if (['barracks', 'keep', 'wall'].includes(type)) return 'military';
    if (['temple', 'hospital'].includes(type)) return 'faith';
    if (['granary', 'warehouse', 'aqueduct', 'grand_aqueduct', 'well', 'bridge'].includes(type)) return 'utility';
    return 'rural';
  }

  private cityTierScore(city: City): number {
    return ({
      camp: 0, hamlet: 1, village: 2, town: 3, city: 4, metropolis: 5
    } as Record<string, number>)[city.tier] ?? 0;
  }

  private getCityAnchor(city: City): { x: number; y: number } {
    const civic = Array.from(city.buildings.values()).find(b => b.type === 'town_center')
      ?? Array.from(city.buildings.values()).find(b => b.type === 'palace')
      ?? Array.from(city.buildings.values()).find(b => b.type === 'keep');
    return civic ? { x: civic.x, y: civic.y } : { x: city.x, y: city.y };
  }

  private drawCityUrbanPattern(
    city: City,
    k: Kingdom | null,
    camera: Camera,
    width: number,
    height: number,
    tileSize: number
  ): void {
    if (tileSize < 8 || city.buildings.size === 0) return;

    const anchor = this.getCityAnchor(city);
    const center = camera.worldToScreen(anchor.x, anchor.y, width, height);
    const score = this.cityTierScore(city);
    const style = SPECIES_DEFINITIONS[city.species].urbanGridStyle ?? 'concentric_rings';
    const pathColor = city.prosperity >= 0.66 ? 'rgba(203, 186, 129, 0.22)'
      : city.prosperity <= 0.35 ? 'rgba(99, 74, 45, 0.18)'
      : 'rgba(154, 132, 92, 0.18)';
    const plazaColor = k ? `${k.color}22` : 'rgba(255,255,255,0.06)';
    const radius = tileSize * (1.2 + score * 0.55 + Math.min(1.4, city.buildings.size * 0.035));

    // Urban core / district tint.
    this.ctx.save();
    this.ctx.fillStyle = plazaColor;
    this.ctx.beginPath();
    this.ctx.ellipse(center.x + tileSize * 0.5, center.y + tileSize * 0.55, radius * 1.05, radius * 0.72, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Species-specific street grammar.
    this.ctx.strokeStyle = pathColor;
    this.ctx.lineWidth = Math.max(1, tileSize * 0.08);
    if (style === 'concentric_rings') {
      for (let r = 1; r <= Math.min(3, score); r++) {
        this.ctx.beginPath();
        this.ctx.ellipse(center.x + tileSize * 0.5, center.y + tileSize * 0.55, radius * (0.32 * r), radius * (0.22 * r), 0, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    } else if (style === 'organic_canopy') {
      this.ctx.beginPath();
      this.ctx.moveTo(center.x - radius * 0.55, center.y + radius * 0.1);
      this.ctx.quadraticCurveTo(center.x - radius * 0.1, center.y - radius * 0.65, center.x + radius * 0.5, center.y - radius * 0.1);
      this.ctx.quadraticCurveTo(center.x + radius * 0.75, center.y + radius * 0.15, center.x + radius * 0.2, center.y + radius * 0.5);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(center.x - radius * 0.4, center.y + radius * 0.35);
      this.ctx.quadraticCurveTo(center.x + radius * 0.05, center.y, center.x + radius * 0.65, center.y + radius * 0.25);
      this.ctx.stroke();
    } else if (style === 'orthogonal_citadel') {
      for (let i = -1; i <= 1; i++) {
        this.ctx.strokeRect(center.x - radius * 0.5 + i * tileSize * 1.1, center.y - radius * 0.32 + i * tileSize * 0.35, radius, radius * 0.48);
      }
    } else if (style === 'diagonal_chevron') {
      for (let i = -1; i <= 1; i++) {
        this.ctx.beginPath();
        this.ctx.moveTo(center.x - radius * 0.75, center.y + i * tileSize * 0.9);
        this.ctx.lineTo(center.x, center.y - radius * 0.36 + i * tileSize * 0.9);
        this.ctx.lineTo(center.x + radius * 0.75, center.y + i * tileSize * 0.9);
        this.ctx.stroke();
      }
    }

    // Connect up to a handful of visible buildings to the core.
    const visibleBuildings = Array.from(city.buildings.values()).slice(0, 10);
    for (const b of visibleBuildings) {
      const pos = camera.worldToScreen(b.x, b.y, width, height);
      this.ctx.beginPath();
      this.ctx.moveTo(center.x + tileSize * 0.5, center.y + tileSize * 0.6);
      if (style === 'organic_canopy') {
        this.ctx.quadraticCurveTo(
          (center.x + pos.x) * 0.5 + Math.sin(b.x * 0.9 + b.y * 1.1) * tileSize * 0.8,
          (center.y + pos.y) * 0.5 - tileSize * 0.5,
          pos.x + tileSize * 0.5, pos.y + tileSize * 0.75
        );
      } else if (style === 'orthogonal_citadel') {
        this.ctx.lineTo(pos.x + tileSize * 0.5, center.y + tileSize * 0.6);
        this.ctx.lineTo(pos.x + tileSize * 0.5, pos.y + tileSize * 0.75);
      } else if (style === 'diagonal_chevron') {
        const midX = (center.x + pos.x) * 0.5;
        const midY = (center.y + pos.y) * 0.5 - tileSize * 0.25;
        this.ctx.lineTo(midX, midY);
        this.ctx.lineTo(pos.x + tileSize * 0.5, pos.y + tileSize * 0.75);
      } else {
        this.ctx.lineTo(pos.x + tileSize * 0.5, pos.y + tileSize * 0.75);
      }
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawBuildingLotBackdrop(
    city: City,
    b: { type: string; x: number; y: number },
    k: Kingdom | null,
    screenPos: { x: number; y: number },
    tileSize: number
  ): void {
    if (tileSize < 7) return;
    const category = this.buildingCategory(b.type);
    const prosperity = city.prosperity ?? 0.5;
    const lotY = screenPos.y + tileSize * 0.66;
    let base = prosperity > 0.7 ? 'rgba(175, 156, 117, 0.24)' : 'rgba(122, 98, 64, 0.16)';
    if (category === 'industrial') base = 'rgba(82, 78, 74, 0.24)';
    if (category === 'market') base = 'rgba(201, 164, 88, 0.18)';
    if (category === 'military') base = 'rgba(92, 88, 102, 0.2)';
    if (category === 'faith') base = 'rgba(116, 153, 198, 0.14)';
    if (category === 'residential') base = prosperity > 0.7 ? 'rgba(88, 148, 103, 0.14)' : 'rgba(88, 107, 78, 0.1)';
    if (category === 'utility') base = 'rgba(119, 123, 134, 0.16)';

    this.ctx.fillStyle = base;
    const lotW = category === 'industrial' || category === 'civic' ? tileSize * 1.15 : tileSize * 0.94;
    const offset = (tileSize - lotW) * 0.5;
    this.ctx.fillRect(screenPos.x + offset, lotY, lotW, Math.max(2, tileSize * 0.22));

    // A couple of tiny lot props so whole districts read differently.
    if (category === 'market') {
      this.ctx.fillStyle = '#d6b15f';
      this.ctx.fillRect(screenPos.x + tileSize * 0.12, lotY - 1, 2, 2);
      this.ctx.fillRect(screenPos.x + tileSize * 0.72, lotY - 1, 2, 2);
    } else if (category === 'industrial') {
      this.ctx.fillStyle = '#475569';
      this.ctx.fillRect(screenPos.x + tileSize * 0.12, lotY - 1, 2, 2);
      this.ctx.fillRect(screenPos.x + tileSize * 0.72, lotY - 1, 2, 2);
    } else if (category === 'residential' && prosperity > 0.55) {
      this.ctx.fillStyle = '#16a34a';
      this.ctx.fillRect(screenPos.x + tileSize * 0.1, lotY + 1, 1, 1);
      this.ctx.fillRect(screenPos.x + tileSize * 0.84, lotY + 1, 1, 1);
    } else if (category === 'civic' && k) {
      this.ctx.fillStyle = k.secondaryColor;
      this.ctx.fillRect(screenPos.x + tileSize * 0.47, lotY - 1, 2, 2);
    }
  }



  private isLandmark(type: string): boolean {
    return SpriteGenerator.isLandmarkBuilding(type);
  }

  private drawCityMacroPresence(
    city: City,
    k: Kingdom | null,
    camera: Camera,
    width: number,
    height: number,
    tileSize: number
  ): void {
    if (city.buildings.size === 0 || tileSize < 3) return;
    const anchor = this.getCityAnchor(city);
    const center = camera.worldToScreen(anchor.x, anchor.y, width, height);
    const score = this.cityTierScore(city);
    const economicPerCapita = city.economicOutput / Math.max(1, city.population);
    const activity = Math.max(0, Math.min(1, economicPerCapita / 6));
    const isCapital = !!k && k.capitalCityId === city.id;

    // At zoomed-out scales, preserve a readable city silhouette instead of a pile of pixels.
    if (tileSize <= 9 && score >= 2) {
      const baseW = tileSize * (1.3 + score * 0.32);
      const baseH = Math.max(3, tileSize * (0.35 + score * 0.05));
      this.ctx.fillStyle = k ? `${k.color}55` : 'rgba(148,163,184,0.32)';
      this.ctx.fillRect(center.x - baseW * 0.5 + tileSize * 0.5, center.y + tileSize * 0.58, baseW, baseH);

      const bars = Math.min(5, 2 + Math.floor(score / 1.3));
      for (let i = 0; i < bars; i++) {
        const h = tileSize * (0.25 + score * 0.09 + ((i * 7 + city.population) % 3) * 0.08);
        const w = Math.max(2, tileSize * 0.26);
        const x = center.x + tileSize * 0.5 - (bars * w * 0.55) + i * w * 1.1;
        this.ctx.fillStyle = isCapital && i === Math.floor(bars / 2)
          ? (k?.secondaryColor ?? '#fbbf24')
          : 'rgba(30,41,59,0.72)';
        this.ctx.fillRect(x, center.y + tileSize * 0.58 - h, w, h);
      }
    }

    // Economic activity is a soft ambient pulse, not a fake trade route.
    if (activity > 0.15 && tileSize >= 5) {
      const pulse = 0.72 + Math.sin(this.animTimer * 1.8 + city.x * 0.31) * 0.18;
      const radius = tileSize * (0.65 + score * 0.22 + activity * 0.55);
      this.ctx.strokeStyle = `rgba(245, 158, 11, ${0.08 + activity * 0.12 * pulse})`;
      this.ctx.lineWidth = Math.max(1, tileSize * 0.05);
      this.ctx.beginPath();
      this.ctx.ellipse(center.x + tileSize * 0.5, center.y + tileSize * 0.55, radius, radius * 0.58, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Capital halo stays subtle but makes the realm seat legible at medium zoom.
    if (isCapital && tileSize >= 6) {
      const radius = tileSize * (1.15 + score * 0.18);
      this.ctx.strokeStyle = k ? `${k.secondaryColor}66` : 'rgba(251,191,36,0.35)';
      this.ctx.lineWidth = Math.max(1, tileSize * 0.07);
      this.ctx.beginPath();
      this.ctx.ellipse(center.x + tileSize * 0.5, center.y + tileSize * 0.56, radius, radius * 0.56, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  private drawCityInfrastructureLinks(
    city: City,
    camera: Camera,
    width: number,
    height: number,
    tileSize: number
  ): void {
    if (tileSize < 6) return;

    const all = Array.from(city.buildings.values());
    const walls = all.filter(b => b.type === 'wall');
    const aqueducts = all.filter(b => b.type === 'aqueduct' || b.type === 'grand_aqueduct');

    const connectNearest = (
      items: typeof all,
      maxDistance: number,
      outer: string,
      inner: string,
      outerW: number,
      innerW: number
    ) => {
      for (const a of items) {
        let nearest: (typeof items)[number] | null = null;
        let nearestD = Infinity;
        for (const b of items) {
          if (a.id === b.id) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < nearestD && d <= maxDistance) {
            nearestD = d;
            nearest = b;
          }
        }
        if (!nearest || a.id > nearest.id) continue;
        const pa = camera.worldToScreen(a.x, a.y, width, height);
        const pb = camera.worldToScreen(nearest.x, nearest.y, width, height);
        this.ctx.lineCap = 'square';
        this.ctx.strokeStyle = outer;
        this.ctx.lineWidth = Math.max(2, tileSize * outerW);
        this.ctx.beginPath();
        this.ctx.moveTo(pa.x + tileSize * 0.5, pa.y + tileSize * 0.72);
        this.ctx.lineTo(pb.x + tileSize * 0.5, pb.y + tileSize * 0.72);
        this.ctx.stroke();
        this.ctx.strokeStyle = inner;
        this.ctx.lineWidth = Math.max(1, tileSize * innerW);
        this.ctx.stroke();
      }
    };

    connectNearest(walls, 4.5, 'rgba(30,41,59,0.8)', 'rgba(100,116,139,0.92)', 0.25, 0.13);
    connectNearest(aqueducts, 7, 'rgba(71,85,105,0.75)', 'rgba(125,211,252,0.72)', 0.18, 0.07);
  }

  private drawSpecialBuildingGroundworks(
    city: City,
    b: { type: string; x: number; y: number },
    k: Kingdom | null,
    screenPos: { x: number; y: number },
    tileSize: number,
    era: string
  ): void {
    if (tileSize < 7) return;

    if (b.type === 'harbor' || b.type === 'port') {
      // Timber/stone waterfront apron, crane mast and water glints.
      const advanced = era === 'industrial' || era === 'modern';
      this.ctx.fillStyle = advanced ? 'rgba(71,85,105,0.8)' : 'rgba(120,72,38,0.82)';
      this.ctx.fillRect(screenPos.x - tileSize * 0.12, screenPos.y + tileSize * 0.68, tileSize * 1.25, tileSize * 0.26);
      this.ctx.fillStyle = advanced ? 'rgba(148,163,184,0.72)' : 'rgba(180,120,62,0.62)';
      for (let i = 0; i < 3; i++) {
        this.ctx.fillRect(screenPos.x + i * tileSize * 0.35, screenPos.y + tileSize * 0.72, tileSize * 0.26, Math.max(1, tileSize * 0.05));
      }

      if (city.tier === 'city' || city.tier === 'metropolis') {
        this.ctx.fillStyle = '#475569';
        this.ctx.fillRect(screenPos.x + tileSize * 0.84, screenPos.y + tileSize * 0.16, Math.max(1, tileSize * 0.06), tileSize * 0.55);
        this.ctx.fillRect(screenPos.x + tileSize * 0.62, screenPos.y + tileSize * 0.18, tileSize * 0.28, Math.max(1, tileSize * 0.05));
      }

      const wave = 0.35 + (Math.sin(this.animTimer * 3.2 + b.x + b.y) + 1) * 0.12;
      this.ctx.fillStyle = `rgba(125,211,252,${wave})`;
      this.ctx.fillRect(screenPos.x - tileSize * 0.16, screenPos.y + tileSize * 0.98, tileSize * 0.34, Math.max(1, tileSize * 0.05));
      this.ctx.fillRect(screenPos.x + tileSize * 0.48, screenPos.y + tileSize * 1.02, tileSize * 0.42, Math.max(1, tileSize * 0.05));
      return;
    }

    if (b.type === 'palace' || b.type === 'monument' || b.type === 'great_library' || b.type === 'colosseum') {
      const civicColor = k?.secondaryColor ?? '#fbbf24';
      this.ctx.fillStyle = `${civicColor}22`;
      this.ctx.beginPath();
      this.ctx.ellipse(screenPos.x + tileSize * 0.5, screenPos.y + tileSize * 0.74, tileSize * 0.78, tileSize * 0.28, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = `${civicColor}55`;
      this.ctx.lineWidth = Math.max(1, tileSize * 0.05);
      this.ctx.stroke();
    }
  }

  private drawLandmarkPresence(
    city: City,
    b: { type: string; x: number; y: number },
    k: Kingdom | null,
    screenPos: { x: number; y: number },
    tileSize: number
  ): void {
    if (!this.isLandmark(b.type) || tileSize < 7) return;
    const capital = !!k && k.capitalCityId === city.id;
    const glowColor = b.type === 'great_library' || b.type === 'academy'
      ? '56,189,248'
      : b.type === 'colosseum'
        ? '249,115,22'
        : capital
          ? '251,191,36'
          : '226,232,240';
    const pulse = 0.8 + Math.sin(this.animTimer * 1.5 + b.x * 0.4) * 0.2;
    const grad = this.ctx.createRadialGradient(
      screenPos.x + tileSize * 0.5, screenPos.y + tileSize * 0.45, 1,
      screenPos.x + tileSize * 0.5, screenPos.y + tileSize * 0.45, tileSize * 1.25
    );
    grad.addColorStop(0, `rgba(${glowColor},${0.12 * pulse})`);
    grad.addColorStop(1, `rgba(${glowColor},0)`);
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(screenPos.x + tileSize * 0.5, screenPos.y + tileSize * 0.45, tileSize * 1.25, 0, Math.PI * 2);
    this.ctx.fill();
  }


  private drawBuildingAmbientEffects(b: { id: string; type: string; x: number; y: number }, particles: ParticleManager): void {
    const last = this.buildingFxTime.get(b.id) ?? -999;
    const interval = b.type === 'factory' || b.type === 'refinery' ? 0.45
      : b.type === 'smithy' || b.type === 'workshop' || b.type === 'oil_well' ? 0.75
      : b.type === 'harbor' || b.type === 'port' ? 1.15
      : 999;
    if (this.animTimer - last < interval) return;
    this.buildingFxTime.set(b.id, this.animTimer);

    if (b.type === 'factory' || b.type === 'refinery' || b.type === 'smithy' || b.type === 'workshop' || b.type === 'oil_well') {
      const dark = b.type === 'oil_well' || b.type === 'refinery';
      particles.spawnParticle(
        b.x + 0.58,
        b.y - 0.42,
        dark ? 'rgba(71, 85, 105, 0.48)' : 'rgba(180, 180, 180, 0.38)',
        Math.sin(b.x * 1.7 + b.y) * 0.05,
        -0.28,
        1.1,
        b.type === 'factory' || b.type === 'refinery' ? 3 : 2
      );
      return;
    }

    if (b.type === 'harbor' || b.type === 'port') {
      particles.spawnParticle(b.x + 0.45, b.y + 0.55, 'rgba(125, 211, 252, 0.38)', 0.06, -0.04, 0.55, 2);
    }
  }

  private drawEntityActionEffects(
    e: Entity,
    centerX: number,
    centerY: number,
    tileSize: number,
    direction: SpriteDirection,
    animation: EntitySpriteAnimation,
    frame: number
  ): void {
    const fxColor = this.getSpeciesFxColor(e);

    if (animation === 'attack') {
      const dir = this.getDirectionVector(direction);
      const sideX = -dir.y;
      const sideY = dir.x;
      const reach = tileSize * (0.48 + frame * 0.04);
      const fxX = centerX + dir.x * reach;
      const fxY = centerY + dir.y * reach - tileSize * 0.08;
      const slash = Math.max(1, tileSize * 0.11);

      this.ctx.fillStyle = withAlpha(fxColor, frame === 0 ? 0.88 : 0.58);
      this.ctx.fillRect(fxX - slash / 2, fxY - slash / 2, slash, slash);
      this.ctx.fillRect(fxX + sideX * slash, fxY + sideY * slash, slash, slash);
      this.ctx.fillRect(fxX - sideX * slash, fxY - sideY * slash, slash, slash);

      if (e.species === SpeciesType.EMBERKIN || e.species === SpeciesType.DRAGON) {
        this.ctx.fillStyle = 'rgba(250, 204, 21, 0.5)';
        this.ctx.fillRect(fxX + dir.x * slash, fxY + dir.y * slash, slash, slash * 1.4);
      } else if (e.species === SpeciesType.SYLVANII) {
        this.ctx.fillStyle = 'rgba(217, 249, 157, 0.7)';
        this.ctx.fillRect(fxX - dir.x * tileSize * 0.25, fxY - dir.y * tileSize * 0.25, slash * 2.4, Math.max(1, slash * 0.55));
      } else if (e.species === SpeciesType.STONEKIN || e.species === SpeciesType.BEAR) {
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
        this.ctx.fillRect(fxX - sideX * slash * 2, fxY - sideY * slash * 2, slash * 3, slash);
      }
      return;
    }

    if (animation === 'heal') {
      const pulse = 0.24 + Math.sin(this.animTimer * 5) * 0.1;
      this.ctx.strokeStyle = withAlpha(fxColor, pulse);
      this.ctx.lineWidth = Math.max(1, tileSize * 0.06);
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, tileSize * (0.48 + frame * 0.05), 0, Math.PI * 2);
      this.ctx.stroke();
      return;
    }

    if ((animation === 'gather' || animation === 'build') && tileSize > 7) {
      const dir = this.getDirectionVector(direction);
      const sparkX = centerX + dir.x * tileSize * 0.42;
      const sparkY = centerY + dir.y * tileSize * 0.28 + tileSize * 0.18;
      const dust = animation === 'build' ? '#d6b783' : (e.profession === 'miner' ? '#cbd5e1' : '#86efac');
      this.ctx.fillStyle = withAlpha(dust, 0.38 + (frame % 2) * 0.18);
      this.ctx.fillRect(sparkX, sparkY, Math.max(1, tileSize * 0.12), Math.max(1, tileSize * 0.08));
      this.ctx.fillRect(sparkX - tileSize * 0.16, sparkY + tileSize * 0.10, Math.max(1, tileSize * 0.08), Math.max(1, tileSize * 0.06));
      return;
    }

    if (animation === 'shoot' && tileSize > 7) {
      const dir = this.getDirectionVector(direction);
      const flight = tileSize * (0.46 + frame * 0.08);
      const ax = centerX + dir.x * flight;
      const ay = centerY + dir.y * flight - tileSize * 0.08;
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.fillRect(ax, ay, Math.max(2, tileSize * 0.24), Math.max(1, tileSize * 0.055));
      this.ctx.fillStyle = fxColor;
      this.ctx.fillRect(ax + dir.x * tileSize * 0.14, ay, Math.max(1, tileSize * 0.08), Math.max(1, tileSize * 0.08));
      return;
    }

    if (animation === 'socialize' && tileSize > 7) {
      const pulse = 0.34 + Math.sin(this.animTimer * 4 + frame) * 0.12;
      this.ctx.fillStyle = withAlpha('#f8fafc', pulse);
      this.ctx.fillRect(centerX + tileSize * 0.26, centerY - tileSize * 0.50, Math.max(1, tileSize * 0.10), Math.max(1, tileSize * 0.10));
      this.ctx.fillStyle = withAlpha(fxColor, pulse);
      this.ctx.fillRect(centerX + tileSize * 0.34, centerY - tileSize * 0.60, Math.max(1, tileSize * 0.08), Math.max(1, tileSize * 0.08));
      return;
    }

    if (animation === 'flee' && tileSize > 7) {
      const dir = this.getDirectionVector(direction);
      this.ctx.fillStyle = 'rgba(214, 188, 135, 0.28)';
      this.ctx.fillRect(centerX - dir.x * tileSize * 0.38, centerY - dir.y * tileSize * 0.38, Math.max(1, tileSize * 0.14), Math.max(1, tileSize * 0.08));
      this.ctx.fillRect(centerX - dir.x * tileSize * 0.55, centerY - dir.y * tileSize * 0.22, Math.max(1, tileSize * 0.1), Math.max(1, tileSize * 0.06));
    }
  }

  private drawPixelCrown(x: number, y: number, size: number): void {
    const s = Math.max(1, size / 8);
    this.ctx.fillStyle = '#92400e';
    this.ctx.fillRect(x + s, y + s * 5, s * 6, s * 2);
    this.ctx.fillStyle = '#fbbf24';
    this.ctx.fillRect(x + s, y + s * 2, s * 2, s * 4);
    this.ctx.fillRect(x + s * 3, y + s, s * 2, s * 5);
    this.ctx.fillRect(x + s * 5, y + s * 2, s * 2, s * 4);
    this.ctx.fillStyle = '#fef08a';
    this.ctx.fillRect(x + s * 3, y + s * 5, s * 2, s);
    this.ctx.fillStyle = '#ef4444';
    this.ctx.fillRect(x + s * 2, y + s * 3, s, s);
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillRect(x + s * 4, y + s * 2, s, s);
  }

  private drawPixelStar(x: number, y: number, size: number): void {
    const s = Math.max(1, size / 7);
    this.ctx.fillStyle = '#fef08a';
    this.ctx.fillRect(x + s * 3, y, s, s * 2);
    this.ctx.fillRect(x + s, y + s * 2, s * 5, s);
    this.ctx.fillRect(x + s * 2, y + s * 3, s * 3, s);
    this.ctx.fillStyle = '#f59e0b';
    this.ctx.fillRect(x, y + s * 3, s * 2, s);
    this.ctx.fillRect(x + s * 5, y + s * 3, s * 2, s);
    this.ctx.fillRect(x + s * 2, y + s * 4, s, s * 2);
    this.ctx.fillRect(x + s * 4, y + s * 4, s, s * 2);
  }

  private isWater(type: TerrainType): boolean {
    return type === TerrainType.DEEP_OCEAN || type === TerrainType.SHALLOW_WATER;
  }

  private getOverlayTerrainColor(tile: Tile, overlayMode: OverlayMode): string | null {
    if (overlayMode === 'temperature') {
      const tNorm = clamp((tile.temperature + 20) / 70, 0, 1);
      if (tNorm < 0.5) return mixColor('#1d4ed8', '#a7f3d0', tNorm * 2);
      return mixColor('#f8e7a2', '#dc2626', (tNorm - 0.5) * 2);
    }

    if (overlayMode === 'resources' && tile.resourceType) {
      return RESOURCE_COLORS[tile.resourceType] ?? '#fbbf24';
    }

    return null;
  }

  private drawTerrainTile(
    tileMap: TileMap,
    tile: Tile,
    x: number,
    y: number,
    screenX: number,
    screenY: number,
    tileSize: number,
    overlayMode: OverlayMode
  ): void {
    const overlayColor = this.getOverlayTerrainColor(tile, overlayMode);
    const color = overlayColor ?? terrainSurfaceColor(tile, x, y, this.animTimer);

    this.ctx.fillStyle = color;
    this.ctx.fillRect(screenX, screenY, tileSize + 0.75, tileSize + 0.75);

    if (overlayColor) {
      this.drawDataTileTexture(tile, x, y, screenX, screenY, tileSize);
      return;
    }

    this.drawTerrainTexture(tile, x, y, screenX, screenY, tileSize);
    this.drawHeightRelief(tileMap, tile, x, y, screenX, screenY, tileSize);
    this.drawTerrainEdges(tileMap, tile, x, y, screenX, screenY, tileSize);

    if (tileSize >= 8) {
      this.drawTerrainDetails(tile, x, y, screenX, screenY, tileSize);
    }
  }

  private drawDataTileTexture(tile: Tile, x: number, y: number, screenX: number, screenY: number, tileSize: number): void {
    if (tileSize < 6) return;

    const grain = hash2(x, y, 201);
    this.ctx.fillStyle = grain > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    this.ctx.fillRect(
      screenX + tileSize * (0.2 + hash2(x, y, 202) * 0.45),
      screenY + tileSize * (0.2 + hash2(x, y, 203) * 0.45),
      Math.max(1, tileSize * 0.12),
      Math.max(1, tileSize * 0.12)
    );
  }

  private drawTerrainTexture(tile: Tile, x: number, y: number, screenX: number, screenY: number, tileSize: number): void {
    const visual = TERRAIN_VISUALS[tile.type];
    if (tileSize < 4) return;

    if (this.isWater(tile.type)) {
      const lineCount = tile.type === TerrainType.SHALLOW_WATER ? 2 : 1;
      for (let i = 0; i < lineCount; i++) {
        const drift = (this.animTimer * (tile.type === TerrainType.SHALLOW_WATER ? 0.26 : 0.16) + hash2(x, y, 220 + i)) % 1;
        const lineY = screenY + ((hash2(x, y, 221 + i) + drift) % 1) * tileSize;
        const lineX = screenX + tileSize * (0.12 + hash2(x, y, 222 + i) * 0.18);
        const lineW = tileSize * (0.38 + hash2(x, y, 223 + i) * 0.36);
        this.ctx.fillStyle = withAlpha(visual.accent, tile.type === TerrainType.SHALLOW_WATER ? 0.2 : 0.11);
        this.ctx.fillRect(lineX, lineY, lineW, Math.max(1, tileSize * 0.045));
      }
      return;
    }

    const flecks = tileSize > 18 ? 5 : tileSize > 10 ? 3 : 1;
    for (let i = 0; i < flecks; i++) {
      const rx = hash2(x, y, 240 + i);
      const ry = hash2(x, y, 250 + i);
      const strong = hash2(x, y, 260 + i) > 0.55;
      const size = Math.max(1, tileSize * (0.035 + hash2(x, y, 270 + i) * 0.035));
      this.ctx.fillStyle = withAlpha(strong ? visual.high : visual.low, strong ? 0.16 : 0.14);
      this.ctx.fillRect(screenX + rx * tileSize, screenY + ry * tileSize, size, size);
    }
  }

  private drawHeightRelief(
    tileMap: TileMap,
    tile: Tile,
    x: number,
    y: number,
    screenX: number,
    screenY: number,
    tileSize: number
  ): void {
    if (this.isWater(tile.type) || tileSize < 5) return;

    const width = Math.max(1, tileSize * (tile.type === TerrainType.MOUNTAIN ? 0.16 : 0.08));
    const shadowAlpha = tile.type === TerrainType.MOUNTAIN ? 0.24 : 0.11;
    const highlightAlpha = tile.type === TerrainType.MOUNTAIN ? 0.2 : 0.08;
    const east = tileMap.getTile(x + 1, y);
    const south = tileMap.getTile(x, y + 1);
    const west = tileMap.getTile(x - 1, y);
    const north = tileMap.getTile(x, y - 1);

    if (east && tile.height - east.height > 0.055) {
      this.paintEdge(screenX, screenY, tileSize, 'right', `rgba(0,0,0,${shadowAlpha})`, width);
    }
    if (south && tile.height - south.height > 0.055) {
      this.paintEdge(screenX, screenY, tileSize, 'bottom', `rgba(0,0,0,${shadowAlpha})`, width);
    }
    if (west && tile.height - west.height > 0.08) {
      this.paintEdge(screenX, screenY, tileSize, 'left', `rgba(255,255,255,${highlightAlpha})`, width);
    }
    if (north && tile.height - north.height > 0.08) {
      this.paintEdge(screenX, screenY, tileSize, 'top', `rgba(255,255,255,${highlightAlpha})`, width);
    }
  }

  private drawTerrainEdges(
    tileMap: TileMap,
    tile: Tile,
    x: number,
    y: number,
    screenX: number,
    screenY: number,
    tileSize: number
  ): void {
    if (tileSize < 5) return;

    const dirs = [
      { dx: -1, dy: 0, edge: 'left' as const },
      { dx: 1, dy: 0, edge: 'right' as const },
      { dx: 0, dy: -1, edge: 'top' as const },
      { dx: 0, dy: 1, edge: 'bottom' as const }
    ];
    const water = this.isWater(tile.type);

    for (const dir of dirs) {
      const neighbor = tileMap.getTile(x + dir.dx, y + dir.dy);
      if (!neighbor || neighbor.type === tile.type) continue;

      const neighborWater = this.isWater(neighbor.type);
      if (water && !neighborWater) {
        const alpha = tile.type === TerrainType.SHALLOW_WATER ? 0.5 : 0.22;
        this.paintEdge(screenX, screenY, tileSize, dir.edge, withAlpha('#f8fafc', alpha), Math.max(1, tileSize * 0.09));
        this.paintEdge(screenX, screenY, tileSize, dir.edge, withAlpha(TERRAIN_VISUALS[TerrainType.SAND].high, 0.16), Math.max(1, tileSize * 0.2));
      } else if (!water && neighborWater) {
        const beach = tile.type === TerrainType.SAND ? TERRAIN_VISUALS[TerrainType.SAND].high : TERRAIN_VISUALS[TerrainType.SAND].base;
        this.paintEdge(screenX, screenY, tileSize, dir.edge, withAlpha(beach, 0.3), Math.max(1, tileSize * 0.15));
      } else if (!water && !neighborWater) {
        const blended = mixColor(TERRAIN_VISUALS[tile.type].base, TERRAIN_VISUALS[neighbor.type].base, 0.42);
        this.paintEdge(screenX, screenY, tileSize, dir.edge, withAlpha(blended, 0.12), Math.max(1, tileSize * 0.08));
      }
    }
  }

  private paintEdge(
    screenX: number,
    screenY: number,
    tileSize: number,
    edge: 'left' | 'right' | 'top' | 'bottom',
    color: string,
    width: number
  ): void {
    const w = Math.max(1, width);
    this.ctx.fillStyle = color;

    if (edge === 'left') {
      this.ctx.fillRect(screenX, screenY, w, tileSize + 0.75);
    } else if (edge === 'right') {
      this.ctx.fillRect(screenX + tileSize - w, screenY, w + 0.75, tileSize + 0.75);
    } else if (edge === 'top') {
      this.ctx.fillRect(screenX, screenY, tileSize + 0.75, w);
    } else {
      this.ctx.fillRect(screenX, screenY + tileSize - w, tileSize + 0.75, w + 0.75);
    }
  }

  private tileRect(
    screenX: number,
    screenY: number,
    tileSize: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    color: string
  ): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      screenX + rx * tileSize,
      screenY + ry * tileSize,
      Math.max(1, rw * tileSize),
      Math.max(1, rh * tileSize)
    );
  }

  private drawTerrainDetails(tile: Tile, x: number, y: number, screenX: number, screenY: number, tileSize: number): void {
    const visual = TERRAIN_VISUALS[tile.type];
    const h = (salt: number) => hash2(x, y, salt);

    if (tile.type === TerrainType.GRASS || tile.type === TerrainType.FOREST) {
      const count = tile.type === TerrainType.FOREST ? 2 : 3;
      for (let i = 0; i < count; i++) {
        const rx = 0.16 + h(300 + i) * 0.68;
        const ry = 0.26 + h(310 + i) * 0.55;
        this.tileRect(screenX, screenY, tileSize, rx, ry, 0.045, 0.18, withAlpha(visual.accent, 0.34));
        this.tileRect(screenX, screenY, tileSize, rx + 0.035, ry + 0.05, 0.035, 0.12, withAlpha(visual.high, 0.26));
      }
      if (tile.type === TerrainType.GRASS && h(330) > 0.82) {
        this.tileRect(screenX, screenY, tileSize, 0.48 + h(331) * 0.2, 0.34 + h(332) * 0.3, 0.055, 0.055, '#fef08a');
      }
      return;
    }

    if (tile.type === TerrainType.SAND) {
      this.tileRect(screenX, screenY, tileSize, 0.12, 0.34 + h(340) * 0.18, 0.52, 0.045, withAlpha(visual.high, 0.25));
      this.tileRect(screenX, screenY, tileSize, 0.34, 0.64 + h(341) * 0.12, 0.42, 0.04, withAlpha(visual.low, 0.2));
      if (h(342) > 0.66) this.tileRect(screenX, screenY, tileSize, 0.22 + h(343) * 0.56, 0.2 + h(344) * 0.58, 0.055, 0.055, withAlpha(visual.shadow, 0.35));
      return;
    }

    if (tile.type === TerrainType.SOIL) {
      for (let i = 0; i < 3; i++) {
        this.tileRect(screenX, screenY, tileSize, 0.1, 0.22 + i * 0.22 + h(350 + i) * 0.04, 0.78, 0.04, withAlpha(visual.low, 0.24));
      }
      this.tileRect(screenX, screenY, tileSize, 0.2 + h(355) * 0.5, 0.2 + h(356) * 0.58, 0.05, 0.05, withAlpha(visual.high, 0.24));
      return;
    }

    if (tile.type === TerrainType.SAVANNA) {
      for (let i = 0; i < 3; i++) {
        const rx = 0.15 + h(360 + i) * 0.68;
        const ry = 0.22 + h(370 + i) * 0.58;
        this.tileRect(screenX, screenY, tileSize, rx, ry, 0.12, 0.035, withAlpha(visual.accent, 0.28));
        this.tileRect(screenX, screenY, tileSize, rx + 0.03, ry + 0.04, 0.04, 0.16, withAlpha(visual.low, 0.24));
      }
      return;
    }

    if (tile.type === TerrainType.SWAMP) {
      this.tileRect(screenX, screenY, tileSize, 0.16 + h(380) * 0.2, 0.46 + h(381) * 0.18, 0.32, 0.16, withAlpha('#183f4a', 0.34));
      this.tileRect(screenX, screenY, tileSize, 0.58, 0.2 + h(382) * 0.42, 0.08, 0.08, withAlpha('#b7f7bd', 0.3));
      this.tileRect(screenX, screenY, tileSize, 0.72, 0.58, 0.06, 0.06, withAlpha('#b7f7bd', 0.22));
      return;
    }

    if (tile.type === TerrainType.TUNDRA) {
      this.tileRect(screenX, screenY, tileSize, 0.12, 0.28 + h(390) * 0.12, 0.68, 0.04, withAlpha(visual.high, 0.24));
      this.tileRect(screenX, screenY, tileSize, 0.28 + h(391) * 0.34, 0.58 + h(392) * 0.14, 0.14, 0.08, withAlpha('#d8f3dc', 0.28));
      return;
    }

    if (tile.type === TerrainType.SNOW) {
      this.tileRect(screenX, screenY, tileSize, 0.08, 0.68 + h(400) * 0.12, 0.74, 0.04, withAlpha(visual.shadow, 0.18));
      if (h(401) > 0.5) this.tileRect(screenX, screenY, tileSize, 0.2 + h(402) * 0.56, 0.18 + h(403) * 0.48, 0.055, 0.055, withAlpha('#ffffff', 0.82));
      return;
    }

    if (tile.type === TerrainType.MOUNTAIN) {
      this.ctx.fillStyle = withAlpha(visual.high, 0.24);
      this.ctx.beginPath();
      this.ctx.moveTo(screenX + tileSize * 0.5, screenY + tileSize * 0.08);
      this.ctx.lineTo(screenX + tileSize * 0.16, screenY + tileSize * 0.82);
      this.ctx.lineTo(screenX + tileSize * 0.52, screenY + tileSize * 0.62);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.fillStyle = withAlpha(visual.shadow, 0.34);
      this.ctx.beginPath();
      this.ctx.moveTo(screenX + tileSize * 0.5, screenY + tileSize * 0.08);
      this.ctx.lineTo(screenX + tileSize * 0.86, screenY + tileSize * 0.88);
      this.ctx.lineTo(screenX + tileSize * 0.52, screenY + tileSize * 0.62);
      this.ctx.closePath();
      this.ctx.fill();

      this.tileRect(screenX, screenY, tileSize, 0.45, 0.22, 0.06, 0.42, withAlpha(visual.accent, 0.38));
      if (h(410) > 0.48) this.tileRect(screenX, screenY, tileSize, 0.58, 0.58, 0.22, 0.05, withAlpha(visual.low, 0.38));
      return;
    }

    if (tile.type === TerrainType.LAVA) {
      const pulse = 0.35 + Math.sin(this.animTimer * 2.2 + x * 0.4 + y * 0.6) * 0.2;
      this.tileRect(screenX, screenY, tileSize, 0.12, 0.28, 0.76, 0.06, withAlpha(visual.high, pulse));
      this.tileRect(screenX, screenY, tileSize, 0.36, 0.34, 0.08, 0.38, withAlpha(visual.accent, pulse * 0.8));
      this.tileRect(screenX, screenY, tileSize, 0.52, 0.62, 0.32, 0.06, withAlpha(visual.high, pulse));
      return;
    }

    if (tile.type === TerrainType.ARCANE) {
      const glow = 0.35 + Math.sin(this.animTimer * 2.4 + h(420) * 6) * 0.18;
      this.tileRect(screenX, screenY, tileSize, 0.2 + h(421) * 0.5, 0.22 + h(422) * 0.48, 0.07, 0.07, withAlpha(visual.accent, glow));
      this.tileRect(screenX, screenY, tileSize, 0.44, 0.42, 0.18, 0.05, withAlpha(visual.high, 0.22));
      return;
    }

    if (tile.type === TerrainType.CORRUPTED) {
      this.tileRect(screenX, screenY, tileSize, 0.18, 0.32, 0.44, 0.055, withAlpha(visual.shadow, 0.42));
      this.tileRect(screenX, screenY, tileSize, 0.58, 0.38, 0.06, 0.34, withAlpha(visual.accent, 0.24));
      if (h(430) > 0.62) this.tileRect(screenX, screenY, tileSize, 0.3 + h(431) * 0.42, 0.18 + h(432) * 0.56, 0.055, 0.055, withAlpha(visual.accent, 0.36));
    }
  }

  public render(
    camera: Camera,
    tileMap: TileMap,
    entities: Entity[],
    cities: Map<string, City>,
    kingdoms: Map<string, Kingdom>,
    particles: ParticleManager,
    overlayMode: OverlayMode,
    currentEra: WorldEra,
    brushX: number | null,
    brushY: number | null,
    brushSize: number,
    ships?: Iterable<Ship>,
    caravans?: Iterable<OverlandCaravan>
  ): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.ctx.fillStyle = '#090d16';
    this.ctx.fillRect(0, 0, width, height);
    this.animTimer = (this.animTimer + 0.04) % 628.318;

    // Determine visible tile bounds
    const topLeft = camera.screenToWorld(0, 0, width, height);
    const bottomRight = camera.screenToWorld(width, height, width, height);

    const minX = Math.max(0, Math.floor(topLeft.x));
    const maxX = Math.min(tileMap.width - 1, Math.ceil(bottomRight.x));
    const minY = Math.max(0, Math.floor(topLeft.y));
    const maxY = Math.min(tileMap.height - 1, Math.ceil(bottomRight.y));

    const tileSize = camera.tileSize * camera.zoom;

    // ========== 1. RENDER TERRAIN TILES ==========
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const tile = tileMap.grid[x][y];
        const screenPos = camera.worldToScreen(x, y, width, height);
        this.drawTerrainTile(tileMap, tile, x, y, screenPos.x, screenPos.y, tileSize, overlayMode);

        // ===== EVOLVING CONNECTED ROAD TILE OVERLAY =====
        if (tile.roadLevel > 0) {
          const roadW = Math.max(2, Math.min(tileSize * 0.35, tileSize - 2));
          const halfT = tileSize / 2;
          const halfR = roadW / 2;

          // Check 8 neighbors
          const nN = tileMap.getTile(x, y - 1);
          const nS = tileMap.getTile(x, y + 1);
          const nE = tileMap.getTile(x + 1, y);
          const nW = tileMap.getTile(x - 1, y);
          const nNE = tileMap.getTile(x + 1, y - 1);
          const nNW = tileMap.getTile(x - 1, y - 1);
          const nSE = tileMap.getTile(x + 1, y + 1);
          const nSW = tileMap.getTile(x - 1, y + 1);

          const hasN = !!(nN && nN.roadLevel > 0);
          const hasS = !!(nS && nS.roadLevel > 0);
          const hasE = !!(nE && nE.roadLevel > 0);
          const hasW = !!(nW && nW.roadLevel > 0);
          const hasNE = !!(nNE && nNE.roadLevel > 0);
          const hasNW = !!(nNW && nNW.roadLevel > 0);
          const hasSE = !!(nSE && nSE.roadLevel > 0);
          const hasSW = !!(nSW && nSW.roadLevel > 0);

          const roadCity = tile.cityId && cities.has(tile.cityId) ? cities.get(tile.cityId)! : null;
          const roadKingdom = tile.kingdomId && kingdoms.has(tile.kingdomId) ? kingdoms.get(tile.kingdomId)! : null;
          const roadSpecies = roadCity?.species ?? roadKingdom?.species;
          const roadEra = roadKingdom ? roadKingdom.research.currentEra() : 'stone';

          let mainColor = tile.roadLevel === 1 ? '#8b5a2b' : tile.roadLevel === 2 ? '#6b7280' : '#374151';
          let borderColor = tile.roadLevel === 1 ? '#4a2d18' : tile.roadLevel === 2 ? '#374151' : '#9ca3af';

          if (tile.roadLevel >= 2 && roadSpecies) {
            if (roadSpecies === SpeciesType.LUMINI) {
              mainColor = tile.roadLevel === 2 ? '#9f8a62' : '#a4873e';
              borderColor = tile.roadLevel === 2 ? '#65543a' : '#e7c65c';
            } else if (roadSpecies === SpeciesType.SYLVANII) {
              mainColor = tile.roadLevel === 2 ? '#66705d' : '#4f6655';
              borderColor = tile.roadLevel === 2 ? '#3d493b' : '#77a66f';
            } else if (roadSpecies === SpeciesType.STONEKIN) {
              mainColor = tile.roadLevel === 2 ? '#6b7280' : '#475569';
              borderColor = tile.roadLevel === 2 ? '#303846' : '#94a3b8';
            } else if (roadSpecies === SpeciesType.EMBERKIN) {
              mainColor = tile.roadLevel === 2 ? '#5c504c' : '#493c3a';
              borderColor = tile.roadLevel === 2 ? '#2b2525' : '#c2410c';
            }
          }

          // Organic edge offset for dirt trails
          const edgeOff = tile.roadLevel === 1 ? Math.sin(x * 3.7 + y * 2.1) * 1 : 0;

          const sx = screenPos.x;
          const sy = screenPos.y;

          // Render Bridge Deck when road crosses water!
          if (this.isWater(tile.type)) {
            const bridgeColor = tile.roadLevel === 1 ? '#78350f' : tile.roadLevel === 2 ? '#475569' : '#1e293b';
            const railColor = tile.roadLevel === 1 ? '#451a03' : tile.roadLevel === 2 ? '#334155' : '#fbbf24';

            // Bridge base platform
            this.ctx.fillStyle = railColor;
            this.ctx.fillRect(sx, sy, tileSize, tileSize);
            this.ctx.fillStyle = bridgeColor;
            this.ctx.fillRect(sx + 1, sy + 1, tileSize - 2, tileSize - 2);

            // Plank lines for wooden bridge or stone seams
            this.ctx.fillStyle = railColor;
            const step = Math.max(3, Math.floor(tileSize * 0.25));
            for (let p = 2; p < tileSize - 2; p += step) {
              this.ctx.fillRect(sx + 1, sy + p, tileSize - 2, 1);
            }
          }

          // Center node
          this.ctx.fillStyle = borderColor;
          this.ctx.fillRect(sx + halfT - halfR - 1 + edgeOff, sy + halfT - halfR - 1, roadW + 2, roadW + 2);
          this.ctx.fillStyle = mainColor;
          this.ctx.fillRect(sx + halfT - halfR + edgeOff, sy + halfT - halfR, roadW, roadW);

          // Cardinal arms
          if (hasN) {
            this.ctx.fillStyle = borderColor;
            this.ctx.fillRect(sx + halfT - halfR - 1 + edgeOff, sy, roadW + 2, halfT);
            this.ctx.fillStyle = mainColor;
            this.ctx.fillRect(sx + halfT - halfR + edgeOff, sy, roadW, halfT);
          }
          if (hasS) {
            this.ctx.fillStyle = borderColor;
            this.ctx.fillRect(sx + halfT - halfR - 1 + edgeOff, sy + halfT, roadW + 2, halfT);
            this.ctx.fillStyle = mainColor;
            this.ctx.fillRect(sx + halfT - halfR + edgeOff, sy + halfT, roadW, halfT);
          }
          if (hasW) {
            this.ctx.fillStyle = borderColor;
            this.ctx.fillRect(sx, sy + halfT - halfR - 1, halfT + edgeOff, roadW + 2);
            this.ctx.fillStyle = mainColor;
            this.ctx.fillRect(sx, sy + halfT - halfR, halfT + edgeOff, roadW);
          }
          if (hasE) {
            this.ctx.fillStyle = borderColor;
            this.ctx.fillRect(sx + halfT + edgeOff, sy + halfT - halfR - 1, halfT - edgeOff, roadW + 2);
            this.ctx.fillStyle = mainColor;
            this.ctx.fillRect(sx + halfT + edgeOff, sy + halfT - halfR, halfT - edgeOff, roadW);
          }

          // Diagonal corners: fill the corner quadrant when a diagonal neighbor has a road
          const cSize = Math.max(2, roadW * 0.6);
          if (hasNE) {
            this.ctx.fillStyle = borderColor;
            this.ctx.fillRect(sx + halfT + halfR - 1 + edgeOff, sy + halfT - halfR - cSize, cSize + 1, cSize + 1);
            this.ctx.fillStyle = mainColor;
            this.ctx.fillRect(sx + halfT + halfR + edgeOff, sy + halfT - halfR - cSize + 1, cSize, cSize);
          }
          if (hasNW) {
            this.ctx.fillStyle = borderColor;
            this.ctx.fillRect(sx + halfT - halfR - cSize + edgeOff, sy + halfT - halfR - cSize, cSize + 1, cSize + 1);
            this.ctx.fillStyle = mainColor;
            this.ctx.fillRect(sx + halfT - halfR - cSize + edgeOff, sy + halfT - halfR - cSize + 1, cSize, cSize);
          }
          if (hasSE) {
            this.ctx.fillStyle = borderColor;
            this.ctx.fillRect(sx + halfT + halfR - 1 + edgeOff, sy + halfT + halfR - 1, cSize + 1, cSize + 1);
            this.ctx.fillStyle = mainColor;
            this.ctx.fillRect(sx + halfT + halfR + edgeOff, sy + halfT + halfR, cSize, cSize);
          }
          if (hasSW) {
            this.ctx.fillStyle = borderColor;
            this.ctx.fillRect(sx + halfT - halfR - cSize + edgeOff, sy + halfT + halfR - 1, cSize + 1, cSize + 1);
            this.ctx.fillStyle = mainColor;
            this.ctx.fillRect(sx + halfT - halfR - cSize + edgeOff, sy + halfT + halfR, cSize, cSize);
          }

          // V4 road furniture: paved roads gain stones, advanced roads gain lane/street accents.
          if (tileSize >= 8 && tile.roadLevel === 2) {
            this.ctx.fillStyle = 'rgba(226,232,240,0.22)';
            this.ctx.fillRect(sx + halfT - 1, sy + halfT - 1, 2, 1);
            if ((x + y) % 2 === 0) this.ctx.fillRect(sx + halfT - halfR + 1, sy + halfT + 2, 1, 1);
          } else if (tileSize >= 8 && tile.roadLevel >= 3) {
            const modernRoad = roadEra === 'industrial' || roadEra === 'modern';
            this.ctx.fillStyle = modernRoad ? 'rgba(250,204,21,0.62)' : 'rgba(226,232,240,0.36)';
            if ((hasN || hasS) && !(hasE || hasW)) {
              this.ctx.fillRect(sx + halfT, sy + tileSize * 0.16, Math.max(1, tileSize * 0.05), tileSize * 0.18);
              this.ctx.fillRect(sx + halfT, sy + tileSize * 0.63, Math.max(1, tileSize * 0.05), tileSize * 0.18);
            } else if ((hasE || hasW) && !(hasN || hasS)) {
              this.ctx.fillRect(sx + tileSize * 0.16, sy + halfT, tileSize * 0.18, Math.max(1, tileSize * 0.05));
              this.ctx.fillRect(sx + tileSize * 0.63, sy + halfT, tileSize * 0.18, Math.max(1, tileSize * 0.05));
            }
            if (roadCity && (roadCity.tier === 'city' || roadCity.tier === 'metropolis') && (x + y) % 4 === 0) {
              this.ctx.fillStyle = roadSpecies === SpeciesType.EMBERKIN ? '#fb923c'
                : roadSpecies === SpeciesType.SYLVANII ? '#86efac'
                : roadSpecies === SpeciesType.STONEKIN ? '#93c5fd'
                : '#fde68a';
              this.ctx.fillRect(sx + 1, sy + 1, Math.max(1, tileSize * 0.06), Math.max(1, tileSize * 0.10));
            }
          }
        }

        // ===== KINGDOM TERRITORY PAINT (WorldBox style) =====
        if (tile.kingdomId && kingdoms.has(tile.kingdomId)) {
          const k = kingdoms.get(tile.kingdomId)!;
          this.ctx.fillStyle = overlayMode === 'political' ? k.cachedRgba45 : k.cachedRgba18;
          this.ctx.fillRect(screenPos.x, screenPos.y, tileSize + 0.5, tileSize + 0.5);

          // Territory border
          if (tileSize > 4) {
            const borderWidth = Math.max(1, tileSize * 0.12);
            this.ctx.fillStyle = k.cachedRgbaBorder;
            if (x > 0 && tileMap.grid[x - 1][y].kingdomId !== tile.kingdomId) {
              this.ctx.fillRect(screenPos.x, screenPos.y, borderWidth, tileSize);
            }
            if (x < tileMap.width - 1 && tileMap.grid[x + 1][y].kingdomId !== tile.kingdomId) {
              this.ctx.fillRect(screenPos.x + tileSize - borderWidth, screenPos.y, borderWidth, tileSize);
            }
            if (y > 0 && tileMap.grid[x][y - 1].kingdomId !== tile.kingdomId) {
              this.ctx.fillRect(screenPos.x, screenPos.y, tileSize, borderWidth);
            }
            if (y < tileMap.height - 1 && tileMap.grid[x][y + 1].kingdomId !== tile.kingdomId) {
              this.ctx.fillRect(screenPos.x, screenPos.y + tileSize - borderWidth, tileSize, borderWidth);
            }
          }
        }

        // ===== SPECIES URBAN GRID CULTURE OVERLAY =====
        if (tile.cityId && cities.has(tile.cityId) && tileSize > 5) {
          const city = cities.get(tile.cityId)!;
          const speciesDef = SPECIES_DEFINITIONS[city.species];
          const gridStyle = speciesDef?.urbanGridStyle;
          const dx = x - city.x;
          const dy = y - city.y;

          if (gridStyle === 'concentric_rings') {
            // Lumini: Radial Golden Rings & Sunbeam Avenues
            const dist = Math.hypot(dx, dy);
            if (Math.abs(dist - Math.round(dist)) < 0.2 || dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) {
              this.ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
              this.ctx.fillRect(screenPos.x, screenPos.y, tileSize, tileSize);
            }
          } else if (gridStyle === 'orthogonal_citadel') {
            // Stonekin: Square Citadel Blocks
            if (dx % 2 === 0 || dy % 2 === 0) {
              this.ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
              this.ctx.fillRect(screenPos.x, screenPos.y, tileSize, tileSize);
            }
          } else if (gridStyle === 'diagonal_chevron') {
            // Emberkin: Diagonal Chevron Diamonds
            if (Math.abs(dx) === Math.abs(dy) || (dx + dy) % 3 === 0) {
              this.ctx.fillStyle = 'rgba(249, 115, 22, 0.22)';
              this.ctx.fillRect(screenPos.x, screenPos.y, tileSize, tileSize);
            }
          } else if (gridStyle === 'organic_canopy') {
            // Sylvanii: Organic Emerald Boardwalks
            if ((dx * dx + dy * dy) % 3 === 0) {
              this.ctx.fillStyle = 'rgba(52, 211, 153, 0.18)';
              this.ctx.fillRect(screenPos.x, screenPos.y, tileSize, tileSize);
            }
          }
        }

        // ===== TREE & VEGETATION SPRITES with Sway =====
        const sway = Math.sin(this.animTimer * 2 + x * 0.5 + y * 0.3) * 1.5;

        if (tile.type === TerrainType.FOREST) {
          const s = SpriteRegistry.get('tree_oak');
          if (s) this.ctx.drawImage(s, screenPos.x + sway, screenPos.y - tileSize * 0.2, tileSize, tileSize * 1.2);
        } else if (tile.type === TerrainType.TUNDRA || tile.type === TerrainType.SNOW) {
          const s = SpriteRegistry.get('tree_pine');
          if (s) this.ctx.drawImage(s, screenPos.x + sway, screenPos.y - tileSize * 0.2, tileSize, tileSize * 1.2);
        } else if (tile.type === TerrainType.SAVANNA) {
          const s = SpriteRegistry.get('tree_palm');
          if (s) this.ctx.drawImage(s, screenPos.x + sway, screenPos.y - tileSize * 0.15, tileSize, tileSize * 1.15);
        } else if (tile.type === TerrainType.SWAMP) {
          const s = SpriteRegistry.get('swamp_reed');
          if (s) this.ctx.drawImage(s, screenPos.x + sway * 0.5, screenPos.y, tileSize, tileSize);
        } else if (tile.type === TerrainType.ARCANE) {
          const s = SpriteRegistry.get('arcane_crystal');
          if (s) {
            // Pulsing glow for crystals
            this.ctx.globalAlpha = 0.7 + Math.sin(this.animTimer * 3) * 0.3;
            this.ctx.drawImage(s, screenPos.x, screenPos.y, tileSize, tileSize);
            this.ctx.globalAlpha = 1.0;
          }
        } else if (tile.type === TerrainType.CORRUPTED) {
          const s = SpriteRegistry.get('corrupted_skull');
          if (s) this.ctx.drawImage(s, screenPos.x, screenPos.y, tileSize, tileSize);
        }

        // Resource Node Sprites
        if (tile.resourceType) {
          const nodeSprite = SpriteRegistry.get(`node_${tile.resourceType}`);
          if (nodeSprite) this.ctx.drawImage(nodeSprite, screenPos.x, screenPos.y, tileSize, tileSize);
        }

        // Fire overlay
        if (tile.isOnFire) {
          const fireSprite = SpriteRegistry.get('fx_fire');
          if (fireSprite) {
            // Flickering animation
            const flicker = Math.sin(this.animTimer * 8 + x * 2 + y * 3) > 0;
            this.ctx.globalAlpha = flicker ? 1.0 : 0.75;
            this.ctx.drawImage(fireSprite, screenPos.x, screenPos.y - tileSize * 0.3, tileSize, tileSize * 1.3);
            this.ctx.globalAlpha = 1.0;
          } else {
            this.ctx.fillStyle = Math.random() < 0.5 ? '#ef4444' : '#f59e0b';
            this.ctx.fillRect(screenPos.x, screenPos.y, tileSize, tileSize);
          }

          // Glow gradient
          if (tileSize > 8) {
            const grad = this.ctx.createRadialGradient(
              screenPos.x + tileSize / 2, screenPos.y + tileSize / 2, 2,
              screenPos.x + tileSize / 2, screenPos.y + tileSize / 2, tileSize * 1.5
            );
            grad.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
            grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(screenPos.x + tileSize / 2, screenPos.y + tileSize / 2, tileSize * 1.5, 0, Math.PI * 2);
            this.ctx.fill();
          }
        }
      }
    }

    // ========== 2. RENDER BUILDINGS ==========
    for (const city of cities.values()) {
      const k = city.kingdomId && kingdoms.has(city.kingdomId) ? kingdoms.get(city.kingdomId)! : null;
      this.drawCityMacroPresence(city, k, camera, width, height, tileSize);
      this.drawCityUrbanPattern(city, k, camera, width, height, tileSize);
      this.drawCityInfrastructureLinks(city, camera, width, height, tileSize);
      for (const b of city.buildings.values()) {
        if (b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY) {
          const screenPos = camera.worldToScreen(b.x, b.y, width, height);
          const era = k ? k.research.currentEra() : 'stone';
          this.drawBuildingLotBackdrop(city, b, k, screenPos, tileSize);
          this.drawSpecialBuildingGroundworks(city, b, k, screenPos, tileSize, era);
          this.drawLandmarkPresence(city, b, k, screenPos, tileSize);

          // Building Drop Shadow
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          this.ctx.fillRect(screenPos.x + 3, screenPos.y + tileSize * 0.7, tileSize * 0.9, tileSize * 0.3);

          // V4 architecture composer: the sprite now reflects the real building
          // level, damage, staffing, extracted resource, era and city species.
          const hpRatio = b.maxHp > 0 ? b.hp / b.maxHp : 1;
          const sprite = SpriteGenerator.getBuildingSprite(b.type, {
            species: city.species,
            era,
            level: b.level,
            hpRatio,
            staffing: b.staffing,
            extractedGood: b.extractedGood,
            prosperity: city.prosperity,
            tier: city.tier,
            population: city.population,
            isCapital: !!k && k.capitalCityId === city.id
          });

          const baseScale = b.level >= 3 ? 1.12 : b.level === 2 ? 1.06 : 1;
          const landmarkBoost = this.isLandmark(b.type) ? 0.10 : 0;
          const capitalBoost = !!k && k.capitalCityId === city.id && ['town_center', 'palace', 'keep'].includes(b.type) ? 0.07 : 0;
          const levelScale = baseScale + landmarkBoost + capitalBoost;
          const drawW = tileSize * levelScale;
          const drawH = tileSize * 1.15 * levelScale;
          const drawX = screenPos.x - (drawW - tileSize) * 0.5;
          const drawY = screenPos.y - tileSize * 0.15 - (drawH - tileSize * 1.15);
          this.ctx.drawImage(sprite, drawX, drawY, drawW, drawH);

          this.drawBuildingAmbientEffects(b, particles);

          // Realm standards mark seats of government and major fortifications.
          if (k && (b.type === 'town_center' || b.type === 'palace' || b.type === 'keep')) {
            const bannerHeight = b.type === 'palace' ? tileSize * 0.72 : tileSize * 0.6;
            this.ctx.fillStyle = '#78350f';
            this.ctx.fillRect(screenPos.x + tileSize - 3, screenPos.y - tileSize * 0.52, 2, bannerHeight);
            const flagWave = Math.sin(this.animTimer * 4 + b.x * 0.7 + b.y) * 1;
            this.ctx.fillStyle = k.color;
            this.ctx.fillRect(screenPos.x + tileSize - 12 + flagWave, screenPos.y - tileSize * 0.52, 9, 6);
            this.ctx.fillStyle = k.secondaryColor;
            this.ctx.fillRect(screenPos.x + tileSize - 12 + flagWave, screenPos.y - tileSize * 0.52 + 2, 9, 2);
          }

          // Damaged buildings expose their actual condition instead of looking
          // pristine until they disappear. Health bars only appear when useful.
          if (hpRatio < 0.9 && tileSize > 8) {
            const barW = tileSize * 0.82;
            const barX = screenPos.x + (tileSize - barW) * 0.5;
            const barY = screenPos.y - tileSize * 0.28;
            this.ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
            this.ctx.fillRect(barX, barY, barW, 3);
            this.ctx.fillStyle = hpRatio > 0.55 ? '#f59e0b' : '#ef4444';
            this.ctx.fillRect(barX + 1, barY + 1, Math.max(0, (barW - 2) * hpRatio), 1);
          }
        }
      }
    }

    // ========== 3. RENDER ENTITIES ==========
    for (const e of entities) {
      if (e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY) {
        const screenPos = camera.worldToScreen(e.x, e.y, width, height);

        const idHash = parseInt(e.id.slice(-4) || '0', 16);
        const safeHash = Number.isNaN(idHash) ? 0 : idHash;
        const movement = Math.hypot(e.x - e.prevX, e.y - e.prevY);
        const isMoving = movement > 0.0005 || (e.targetX !== null && e.targetY !== null && e.aiState !== 'idle');
        const direction = this.getEntityDirection(e, isMoving);
        const animation = this.getEntityAnimation(e, isMoving);
        const frame = this.getAnimationFrame(e, animation, safeHash);
        const strideSpeed = Math.min(18, Math.max(8, movement * 350));
        const bob = (animation === 'walk' || animation === 'flee' || animation === 'carry') ? Math.sin(this.animTimer * strideSpeed + safeHash) * 1.2 : 0;
        const breathe = animation === 'idle' ? Math.sin(this.animTimer * 2.2 + safeHash * 0.01) * 0.45 : 0;
        const entitySize = tileSize;
        const ageScale = e.lifeStage === 'infant' ? 0.52
          : e.lifeStage === 'child' ? 0.70
          : e.lifeStage === 'adolescent' ? 0.86
          : 1.0;
        const speciesScale = e.species === SpeciesType.DRAGON ? 1.45
          : e.species === SpeciesType.BEAR ? 1.22
          : e.species === SpeciesType.DEER || e.species === SpeciesType.WOLF ? 1.05
          : 1.12;
        const spriteSize = entitySize * speciesScale * ageScale;
        const centerX = screenPos.x + entitySize / 2;
        const centerY = screenPos.y + entitySize * 0.55;
        const spriteX = centerX - spriteSize / 2;
        const spriteY = screenPos.y + entitySize * 0.98 - spriteSize + bob + breathe;

        // Great-person aura sits behind the body instead of washing over the sprite.
        if (e.isGreatPerson) {
          const goldGlow = 0.16 + Math.sin(this.animTimer * 4 + safeHash * 0.01) * 0.06;
          this.ctx.fillStyle = `rgba(251, 191, 36, ${goldGlow})`;
          this.ctx.beginPath();
          this.ctx.arc(centerX, centerY, tileSize * 0.78, 0, Math.PI * 2);
          this.ctx.fill();
        }

        this.ctx.fillStyle = e.species === SpeciesType.DRAGON ? 'rgba(0, 0, 0, 0.36)' : 'rgba(0, 0, 0, 0.28)';
        this.ctx.beginPath();
        this.ctx.ellipse(
          centerX,
          screenPos.y + entitySize * 0.88,
          entitySize * (e.species === SpeciesType.DRAGON ? 0.58 : 0.35),
          entitySize * (e.species === SpeciesType.BEAR ? 0.16 : 0.12),
          0, 0, Math.PI * 2
        );
        this.ctx.fill();

        if (animation === 'heal' || animation === 'flee' || animation === 'socialize') {
          this.drawEntityActionEffects(e, centerX, centerY, entitySize, direction, animation, frame);
        }

        const sprite = SpriteGenerator.getEntitySprite(e.species, direction, animation, frame, {
          profession: e.profession,
          weaponName: e.equipment.weapon?.name,
          weaponCategory: e.equipment.weapon?.category,
          armorName: e.equipment.armor?.name,
          isGreatPerson: e.isGreatPerson,
          greatPersonType: e.greatPersonType
        });
        this.ctx.drawImage(sprite, spriteX, spriteY, spriteSize, spriteSize);

        if (animation === 'attack' || animation === 'shoot' || animation === 'gather' || animation === 'build') {
          this.drawEntityActionEffects(e, centerX, centerY, entitySize, direction, animation, frame);
        }

        // Kingdom-colored outline for humanoid species
        if (e.kingdomId && kingdoms.has(e.kingdomId) && tileSize > 8) {
          const k = kingdoms.get(e.kingdomId)!;
          const rgb = this.hexToRgb(k.color);
          this.ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`;
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(spriteX + spriteSize * 0.18, spriteY + spriteSize * 0.18, spriteSize * 0.64, spriteSize * 0.72);
        }

        if (e.profession === 'king') {
          const crownSize = Math.max(7, Math.floor(tileSize * 0.45));
          this.drawPixelCrown(centerX - crownSize / 2, spriteY - crownSize * 0.35, crownSize);
        }


        // Equipment is now rendered inside the cached entity sprite, so it follows
        // direction, animation and the actual item category instead of floating beside it.

        // Health Bar if Damaged
        if (this.options.showHealthBars && e.hp < e.maxHp) {
          const barW = tileSize;
          const barH = Math.max(2, tileSize * 0.12);
          const hpRatio = Math.max(0, e.hp / e.maxHp);
          const barX = screenPos.x;
          const barY = spriteY - 4;

          // Background
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          this.ctx.fillRect(barX - 0.5, barY - 0.5, barW + 1, barH + 1);
          // HP fill
          const hpColor = hpRatio > 0.5 ? '#10b981' : (hpRatio > 0.2 ? '#f59e0b' : '#ef4444');
          this.ctx.fillStyle = hpColor;
          this.ctx.fillRect(barX, barY, barW * hpRatio, barH);
        }

        // Floating Emote Pixel-Art Icon Bubble
        if (e.emote && e.emoteTimer > 0 && tileSize > 6) {
          const emoteSize = Math.max(12, Math.floor(tileSize * 0.65));
          const icon = PixelIcons.getIcon(e.emote);
          this.ctx.drawImage(icon, centerX - emoteSize / 2, spriteY - emoteSize, emoteSize, emoteSize);
        }

        if (e.isGreatPerson) {
          const starSize = Math.max(8, tileSize * 0.4);
          this.drawPixelStar(centerX - starSize / 2, spriteY - starSize * 0.8, starSize);
        }

        if (e.isFavorite) {
          const starSize = Math.max(7, tileSize * 0.34);
          this.drawPixelStar(centerX - starSize / 2, screenPos.y + entitySize + 2, starSize);
        }
      }
    }

    // ========== 3c. NAVAL SHIPS & CARAVANS ==========
    if (ships) {
      for (const ship of ships) {
        if (ship.x < minX || ship.x > maxX || ship.y < minY || ship.y > maxY) continue;
        const screenPos = camera.worldToScreen(ship.x, ship.y, width, height);
        const shipSize = Math.max(16, tileSize * 1.3);

        // Animated water wake behind ship
        const wakeRadius = Math.max(4, tileSize * 0.45);
        const wakeX = screenPos.x + (ship.direction > 0 ? -4 : shipSize + 4);
        const wakeY = screenPos.y + shipSize * 0.65;
        this.ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
        this.ctx.beginPath();
        this.ctx.arc(wakeX, wakeY, wakeRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Pixel-Art Ship Sprite
        const spriteKey = `ship_tier_${ship.tier}`;
        const sprite = SpriteGenerator.has(spriteKey)
          ? SpriteGenerator.getSprite(spriteKey, () => {}, 24, 24)
          : SpriteGenerator.getSprite('ship_tier_1', () => {}, 24, 24);

        this.ctx.save();
        if (ship.direction < 0) {
          this.ctx.translate(screenPos.x + shipSize, screenPos.y);
          this.ctx.scale(-1, 1);
          this.ctx.drawImage(sprite, 0, 0, shipSize, shipSize);
        } else {
          this.ctx.drawImage(sprite, screenPos.x, screenPos.y, shipSize, shipSize);
        }
        this.ctx.restore();

        // Kingdom Flag Banner on Mast
        if (tileSize > 6) {
          const flagX = screenPos.x + shipSize * 0.45;
          const flagY = screenPos.y - 4;
          const flagWave = Math.sin(this.animTimer * 5 + ship.x) * 1.2;
          this.ctx.fillStyle = ship.kingdomColor ?? '#fbbf24';
          this.ctx.fillRect(flagX + flagWave, flagY, 9, 6);
          this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(flagX + flagWave, flagY, 9, 6);
        }
      }
    }

    // ========== 3d. OVERLAND CARAVANS ==========
    if (caravans) {
      for (const caravan of caravans) {
        if (caravan.x < minX || caravan.x > maxX || caravan.y < minY || caravan.y > maxY) continue;
        const screenPos = camera.worldToScreen(caravan.x, caravan.y, width, height);
        const caravanSize = Math.max(14, tileSize * 1.15);

        // Ground dust trail effect
        this.ctx.fillStyle = 'rgba(217, 119, 6, 0.25)';
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x + caravanSize * 0.5, screenPos.y + caravanSize * 0.8, caravanSize * 0.35, 0, Math.PI * 2);
        this.ctx.fill();

        // Pixel-Art Caravan Sprite
        const spriteKey = `caravan_${caravan.caravanType}`;
        const sprite = SpriteGenerator.has(spriteKey)
          ? SpriteGenerator.getSprite(spriteKey, () => {}, 24, 24)
          : SpriteGenerator.getSprite('caravan_donkey', () => {}, 24, 24);

        this.ctx.save();
        if (caravan.direction < 0) {
          this.ctx.translate(screenPos.x + caravanSize, screenPos.y);
          this.ctx.scale(-1, 1);
          this.ctx.drawImage(sprite, 0, 0, caravanSize, caravanSize);
        } else {
          this.ctx.drawImage(sprite, screenPos.x, screenPos.y, caravanSize, caravanSize);
        }
        this.ctx.restore();

        // Kingdom Banner on Pack Saddle
        if (tileSize > 6) {
          this.ctx.fillStyle = caravan.kingdomColor ?? '#fbbf24';
          this.ctx.fillRect(screenPos.x + caravanSize * 0.4, screenPos.y - 2, 7, 4);
        }
      }
    }

    // ========== 3a. SIEGE RINGS ==========
    // A besieged settlement gets a pulsing red ring so the player can see where
    // a war is actually being decided, not just that one was declared.
    if (tileSize > 3) {
      for (const city of cities.values()) {
        if (!city.besiegerId) continue;
        if (city.x < minX - 8 || city.x > maxX + 8 || city.y < minY - 8 || city.y > maxY + 8) continue;

        const screenPos = camera.worldToScreen(city.x, city.y, width, height);
        const centerX = screenPos.x + tileSize / 2;
        const centerY = screenPos.y + tileSize / 2;
        const radius = 7 * tileSize;
        const pulse = 0.45 + Math.sin(this.animTimer * 4) * 0.2;

        this.ctx.strokeStyle = `rgba(239, 68, 68, ${pulse})`;
        this.ctx.lineWidth = Math.max(1.5, tileSize * 0.12);
        this.ctx.setLineDash([tileSize * 0.5, tileSize * 0.4]);
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Progress arc: how close the walls are to falling.
        if (city.siegeProgress > 0) {
          this.ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
          this.ctx.lineWidth = Math.max(2, tileSize * 0.2);
          this.ctx.beginPath();
          this.ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, city.siegeProgress));
          this.ctx.stroke();
        }
      }
    }

    // ========== 3b. CITY NAME LABELS ==========
    if (this.options.showCityNames && tileSize > 5) {
      this.ctx.textAlign = 'center';
      for (const city of cities.values()) {
        if (city.x < minX || city.x > maxX || city.y < minY || city.y > maxY) continue;
        const screenPos = camera.worldToScreen(city.x, city.y, width, height);
        const k = city.kingdomId ? kingdoms.get(city.kingdomId) : null;
        const fontSize = Math.max(9, Math.min(13, tileSize * 0.6));

        const labelX = screenPos.x + tileSize / 2;
        const labelY = screenPos.y + tileSize * 1.6;

        this.ctx.font = `600 ${fontSize}px 'Outfit', sans-serif`;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillText(city.name, labelX + 1, labelY + 1);
        this.ctx.fillStyle = k ? k.secondaryColor : '#e2e8f0';
        this.ctx.fillText(city.name, labelX, labelY);

        // Population count under the name
        this.ctx.font = `${Math.max(8, fontSize * 0.75)}px 'Outfit', sans-serif`;
        this.ctx.fillStyle = 'rgba(226, 232, 240, 0.65)';
        this.ctx.fillText(`${city.population}`, labelX, labelY + fontSize);
      }
      this.ctx.textAlign = 'start';
    }

    // ========== 4. RENDER PARTICLES & DAMAGE NUMBERS ==========
    if (this.options.showParticles) for (const p of particles.activeParticles) {
      if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
        const screenPos = camera.worldToScreen(p.x, p.y, width, height);
        this.ctx.globalAlpha = p.alpha;

        if (p.text) {
          this.ctx.font = 'bold 12px var(--font-mono)';
          this.ctx.fillStyle = p.color;
          // Text shadow
          this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
          this.ctx.fillText(p.text, screenPos.x + 1, screenPos.y + 1);
          this.ctx.fillStyle = p.color;
          this.ctx.fillText(p.text, screenPos.x, screenPos.y);
        } else {
          this.ctx.fillStyle = p.color;
          this.ctx.fillRect(screenPos.x, screenPos.y, p.size, p.size);
        }

        this.ctx.globalAlpha = 1.0;
      }
    }

    // ========== 5. FLOATING KINGDOM BADGES (WorldBox-style) ==========
    if (this.options.showKingdomBadges && tileSize > 3) {
      for (const kingdom of kingdoms.values()) {
        if (kingdom.cityIds.size === 0) continue;

        // Use cached kingdom center
        const center = kingdom.cachedCenter;
        if (center.x < minX || center.x > maxX || center.y < minY || center.y > maxY) continue;

        const screenCenter = camera.worldToScreen(center.x, center.y, width, height);

        // Floating bounce animation
        const floatY = Math.sin(this.animTimer * 1.5 + center.x * 0.1) * 3;
        const badgeX = screenCenter.x;
        const badgeY = screenCenter.y - tileSize * 2 + floatY;

        // Measure text
        const fontSize = Math.max(10, Math.min(14, tileSize * 0.7));
        this.ctx.font = `bold ${fontSize}px 'Inter', sans-serif`;
        const textWidth = this.ctx.measureText(kingdom.name).width;
        const badgeW = textWidth + 32;
        const badgeH = fontSize + 12;

        // Badge background (glassmorphic pill)
        const rgb = this.hexToRgb(kingdom.color);
        this.ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75)`;
        const bx = badgeX - badgeW / 2;
        const by = badgeY - badgeH / 2;
        this.ctx.beginPath();
        this.ctx.roundRect(bx, by, badgeW, badgeH, badgeH / 2);
        this.ctx.fill();

        // Badge border glow
        this.ctx.strokeStyle = `rgba(${Math.min(255, rgb.r + 60)}, ${Math.min(255, rgb.g + 60)}, ${Math.min(255, rgb.b + 60)}, 0.6)`;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        // Pixel-Art Emblem icon
        const emblemIcon = PixelIcons.getIcon(kingdom.emblem);
        const iconSize = Math.max(12, fontSize);
        this.ctx.drawImage(emblemIcon, bx + 5, badgeY - iconSize / 2, iconSize, iconSize);

        // Kingdom name text
        this.ctx.font = `bold ${fontSize}px 'Inter', sans-serif`;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(kingdom.name, bx + iconSize + 10, badgeY + fontSize * 0.35);
        this.ctx.textAlign = 'start';

        // War indicator: crossed swords pixel icon if at war
        if (this.diplomacy) {
          const wars = this.diplomacy.getWarsFor(kingdom.id);
          if (wars.length > 0) {
            // Red pulsing war indicator
            const warPulse = Math.sin(this.animTimer * 5) * 0.3 + 0.7;
            this.ctx.globalAlpha = warPulse;
            const warIcon = PixelIcons.getIcon('swords');
            this.ctx.drawImage(warIcon, bx + badgeW - iconSize - 4, badgeY - iconSize / 2, iconSize, iconSize);
            this.ctx.globalAlpha = 1.0;
          }
        }

        // Connection line from badge to territory center
        this.ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(badgeX, by + badgeH);
        this.ctx.lineTo(screenCenter.x, screenCenter.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }

    // ========== 6. ERA VIGNETTE ==========
    if (currentEra === WorldEra.AGE_OF_ASHES) {
      this.ctx.fillStyle = 'rgba(239, 68, 68, 0.06)';
      this.ctx.fillRect(0, 0, width, height);
    } else if (currentEra === WorldEra.FROZEN_AGE) {
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
      this.ctx.fillRect(0, 0, width, height);
    } else if (currentEra === WorldEra.DARK_AGE) {
      this.ctx.fillStyle = 'rgba(88, 28, 135, 0.1)';
      this.ctx.fillRect(0, 0, width, height);
    }

    // ========== 6b. TILE GRID ==========
    if (this.options.showGrid && tileSize >= 6) {
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      for (let x = minX; x <= maxX + 1; x++) {
        const sx = Math.round(camera.worldToScreen(x, minY, width, height).x) + 0.5;
        this.ctx.moveTo(sx, camera.worldToScreen(x, minY, width, height).y);
        this.ctx.lineTo(sx, camera.worldToScreen(x, maxY + 1, width, height).y);
      }
      for (let y = minY; y <= maxY + 1; y++) {
        const sy = Math.round(camera.worldToScreen(minX, y, width, height).y) + 0.5;
        this.ctx.moveTo(camera.worldToScreen(minX, y, width, height).x, sy);
        this.ctx.lineTo(camera.worldToScreen(maxX + 1, y, width, height).x, sy);
      }
      this.ctx.stroke();
    }

    // ========== 7. BRUSH CURSOR ==========
    if (this.options.showBrushCursor && brushX !== null && brushY !== null) {
      const screenPos = camera.worldToScreen(brushX, brushY, width, height);
      const brushRadiusPx = brushSize * tileSize;

      this.ctx.beginPath();
      this.ctx.arc(screenPos.x, screenPos.y, brushRadiusPx, 0, Math.PI * 2);
      this.ctx.strokeStyle = '#fbbf24';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }
}
