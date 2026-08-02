import { TileMap } from '../../world/TileMap';
import { SimulationEngine } from '../../ai/EntityAI';
import { Camera } from '../../renderer/Camera';
import { ParticleManager } from '../../renderer/Particles';
import { BrushManager } from '../../powers/BrushManager';
import { EraManager, WorldEra } from '../../world/WeatherEras';
import { OverlayManager } from '../../renderer/Overlays';
import { GeneratorPreset } from '../../world/WorldGenerator';
import { SpeciesType } from '../../entities/Species';
import { StatsTracker } from './StatsTracker';
import type { ScreenManager } from './ScreenManager';
import type { ToastType } from '../components/Toasts';

/** Everything the "New World" screen can configure. */
export interface WorldConfig {
  size: number;
  preset: GeneratorPreset;
  seed: number;
  species: SpeciesType[];
  startingPopulation: number;
  spawnWildlife: boolean;
  era: WorldEra;
}

export const WORLD_PRESET_INFO: { id: GeneratorPreset; name: string; icon: string; description: string }[] = [
  { id: 'single_continent', name: 'Continente Único', icon: '🗺️', description: 'Uma grande massa continental cercada por oceano. O estilo sandbox clássico.' },
  { id: 'two_continents', name: 'Dois Continentes', icon: '🌍', description: 'Duas massas de terra rivais separadas pelo mar aberto. Ideal para grandes guerras.' },
  { id: 'archipelago', name: 'Arquipélago de Ilhas', icon: '🏝️', description: 'Ilhas dispersas. Culturas isoladas, navegação marinha e expansão gradativa.' },
  { id: 'ring_atoll', name: 'Atol Volcânico Mágico', icon: '🌋', description: 'Uma ilha em formato de anel circular com uma lagoa interior e encostas férteis.' },
  { id: 'fragmented', name: 'Caos Fragmentado', icon: '🌀', description: 'Fragmentos imprevisíveis de terreno e relevo.' },
  { id: 'desert', name: 'Deserto Escaldante', icon: '🏜️', description: 'Quente e árido. Emberkin prosperam, camponeses lutam pela água.' },
  { id: 'frozen', name: 'Terras Glaciais', icon: '🧊', description: 'Tundra congelada e neve eterna. Condições extremas de sobrevivência.' },
  { id: 'random', name: 'Ruído Puro', icon: '🎲', description: 'Geração procedural pura sem máscaras. Qualquer relevo pode emergir.' }
];

/**
 * The bridge between the UI layer and the engine.
 * Screens never hold direct references to the simulation — a new world replaces
 * `sim`/`tileMap`, so everything must go through these live getters.
 */
export interface GameContext {
  readonly sim: SimulationEngine;
  readonly tileMap: TileMap;
  readonly camera: Camera;
  readonly particles: ParticleManager;
  readonly brush: BrushManager;
  readonly eras: EraManager;
  readonly overlays: OverlayManager;
  readonly stats: StatsTracker;
  readonly screens: ScreenManager;

  /** Current world generation parameters (for re-rolls and the pause screen summary). */
  readonly worldConfig: WorldConfig;

  readonly fps: number;
  readonly activeFires: number;
  readonly simSpeed: number;
  /** True once a world is running (i.e. not sitting on the title screen). */
  readonly inGame: boolean;

  setSpeed(speed: number): void;
  togglePause(): void;

  /** Generate a brand new world and enter the game. */
  startNewWorld(config: WorldConfig): void;
  /** Restore a serialized save and enter the game. */
  loadSaveData(data: any): boolean;
  /** Build a save payload for the current world. */
  buildSaveData(): any;
  /** Tear the world down and return to the title screen. */
  quitToMenu(): void;

  /** Center the camera on world tile coordinates. */
  focusOn(x: number, y: number, zoom?: number): void;
  /** Follow a specific entity until the camera is panned manually. */
  trackEntity(entityId: string | null): void;

  toast(message: string, type?: ToastType): void;
  /** Re-read the settings store and push the values into the renderer/audio. */
  applySettings(): void;
}
