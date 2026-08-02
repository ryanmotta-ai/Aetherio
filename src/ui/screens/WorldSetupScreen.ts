import { el, button, clear } from '../core/Dom';
import { MapPreview } from '../components/MapPreview';
import { WORLD_PRESET_INFO, WorldConfig } from '../core/GameContext';
import { SpeciesType, SPECIES_DEFINITIONS } from '../../entities/Species';
import { WorldEra } from '../../world/WeatherEras';
import { GeneratorPreset } from '../../world/WorldGenerator';
import type { Screen } from '../core/ScreenManager';
import type { GameContext } from '../core/GameContext';

const SIZES = [
  { value: 64, label: 'Small', detail: '64 × 64 · fast, cramped' },
  { value: 128, label: 'Standard', detail: '128 × 128 · balanced' },
  { value: 192, label: 'Large', detail: '192 × 192 · room to expand' },
  { value: 256, label: 'Huge', detail: '256 × 256 · heavy on older machines' }
];

const PLAYABLE_SPECIES: SpeciesType[] = [
  SpeciesType.LUMINI,
  SpeciesType.SYLVANII,
  SpeciesType.STONEKIN,
  SpeciesType.EMBERKIN
];

const ERAS: WorldEra[] = [
  WorldEra.GOLDEN_AGE,
  WorldEra.ABUNDANCE,
  WorldEra.AGE_OF_ASHES,
  WorldEra.DARK_AGE,
  WorldEra.FROZEN_AGE
];

const PREVIEW_SIZE = 300;
/** Previews are generated at this resolution regardless of world size — generation is O(n²). */
const PREVIEW_RESOLUTION = 96;

/** Full-screen world creation: parameters on the left, a live generated preview on the right. */
export class WorldSetupScreen implements Screen {
  public readonly id = 'world-setup' as const;
  public readonly kind = 'fullscreen' as const;
  public readonly dismissable = true;

  private config!: WorldConfig;
  private preview!: MapPreview;
  private seedInput!: HTMLInputElement;
  private popValue!: HTMLElement;
  private optionRoots: Map<string, HTMLElement> = new Map();
  private previewTimer: number | null = null;

  public build(ctx: GameContext): HTMLElement {
    this.config = {
      size: 128,
      preset: 'single_continent',
      seed: Math.floor(Math.random() * 2147483647),
      species: [SpeciesType.LUMINI, SpeciesType.SYLVANII],
      startingPopulation: 2,
      spawnWildlife: true,
      era: WorldEra.GOLDEN_AGE
    };

    this.preview = new MapPreview(PREVIEW_SIZE, PREVIEW_SIZE, 'setup-preview');
    this.optionRoots.clear();

    const layout = el('div', { class: 'setup-screen' }, [
      el('header', { class: 'screen-head' }, [
        el('div', {}, [
          el('h2', { class: 'screen-title', text: '🌍 Create a New World' }),
          el('p', { class: 'screen-sub', text: 'Every setting below changes how history will unfold.' })
        ]),
        button('Back', () => ctx.screens.back(), { icon: '←', hint: 'Esc' })
      ]),

      el('div', { class: 'setup-body' }, [
        el('div', { class: 'setup-options' }, [
          this.sizeSection(),
          this.presetSection(),
          this.speciesSection(),
          this.populationSection(),
          this.eraSection()
        ]),

        el('aside', { class: 'setup-preview-pane' }, [
          el('div', { class: 'preview-frame' }, [this.preview.canvas]),
          this.seedSection(),
          el('div', { class: 'preview-summary' }, [
            el('p', { class: 'muted small', text: 'The preview is generated at reduced resolution. The real world uses your chosen size.' })
          ]),
          button('Create World', () => this.create(ctx), { variant: 'primary', icon: '✨', class: 'wide' })
        ])
      ])
    ]);

    this.refreshPreview();
    return layout;
  }

  public dispose(): void {
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
  }

  // ============================ SECTIONS ============================

  private sizeSection(): HTMLElement {
    const group = el('div', { class: 'option-grid cols-2' });
    this.optionRoots.set('size', group);

    for (const size of SIZES) {
      group.appendChild(
        el('button', {
          class: `option-card${this.config.size === size.value ? ' selected' : ''}`,
          dataset: { value: `${size.value}` },
          on: {
            click: () => {
              this.config.size = size.value;
              this.syncSelection('size', `${size.value}`);
            }
          }
        }, [
          el('span', { class: 'option-name', text: size.label }),
          el('span', { class: 'option-detail', text: size.detail })
        ])
      );
    }

    return this.field('World Size', 'How much land history has to spread across.', group);
  }

  private presetSection(): HTMLElement {
    const group = el('div', { class: 'option-grid cols-2' });
    this.optionRoots.set('preset', group);

    for (const preset of WORLD_PRESET_INFO) {
      group.appendChild(
        el('button', {
          class: `option-card${this.config.preset === preset.id ? ' selected' : ''}`,
          dataset: { value: preset.id },
          on: {
            click: () => {
              this.config.preset = preset.id as GeneratorPreset;
              this.syncSelection('preset', preset.id);
              this.refreshPreview();
            }
          }
        }, [
          el('span', { class: 'option-icon', text: preset.icon }),
          el('span', { class: 'option-name', text: preset.name }),
          el('span', { class: 'option-detail', text: preset.description })
        ])
      );
    }

    return this.field('Terrain Shape', 'The generator that carves your continents.', group);
  }

  private speciesSection(): HTMLElement {
    const group = el('div', { class: 'option-grid cols-2' });
    this.optionRoots.set('species', group);

    for (const species of PLAYABLE_SPECIES) {
      const config = SPECIES_DEFINITIONS[species];
      const selected = this.config.species.includes(species);

      group.appendChild(
        el('button', {
          class: `option-card species-card${selected ? ' selected' : ''}`,
          dataset: { value: species },
          style: { '--species-color': config.primaryColor } as any,
          on: { click: () => this.toggleSpecies(species) }
        }, [
          el('span', { class: 'species-dot', style: { background: config.primaryColor } }),
          el('span', { class: 'option-name', text: config.name }),
          el('span', { class: 'option-detail', text: `${config.baseHp} HP · ${config.baseDamage} DMG · likes ${config.preferredBiomes.join(', ')}` })
        ])
      );
    }

    const wildlife = el('label', { class: 'switch-row' }, [
      el('input', {
        attrs: { type: 'checkbox', checked: this.config.spawnWildlife },
        on: { change: (ev: Event) => { this.config.spawnWildlife = (ev.target as HTMLInputElement).checked; } }
      }),
      el('span', { class: 'switch-track' }, [el('span', { class: 'switch-knob' })]),
      el('span', { class: 'switch-text', text: 'Populate the wild with deer, wolves and bears' })
    ]);

    return this.field('Starting Species', 'Pick at least one founding civilization.', el('div', {}, [group, wildlife]));
  }

  private populationSection(): HTMLElement {
    this.popValue = el('span', { class: 'range-value', text: `${this.config.startingPopulation} per species` });

    const slider = el('input', {
      class: 'range',
      attrs: { type: 'range', min: '2', max: '60', step: '2', value: `${this.config.startingPopulation}` },
      on: {
        input: (ev: Event) => {
          this.config.startingPopulation = parseInt((ev.target as HTMLInputElement).value, 10);
          this.popValue.textContent = `${this.config.startingPopulation} per species`;
        }
      }
    });

    return this.field('Starting Population', 'How many founders each species begins with.', el('div', { class: 'range-row' }, [slider, this.popValue]));
  }

  private eraSection(): HTMLElement {
    const group = el('div', { class: 'chip-select' });
    this.optionRoots.set('era', group);

    for (const era of ERAS) {
      group.appendChild(
        el('button', {
          class: `chip-option${this.config.era === era ? ' selected' : ''}`,
          text: era,
          dataset: { value: era },
          on: {
            click: () => {
              this.config.era = era;
              this.syncSelection('era', era);
            }
          }
        })
      );
    }

    return this.field('Opening Era', 'The world climate at the dawn of history.', group);
  }

  private seedSection(): HTMLElement {
    this.seedInput = el('input', {
      class: 'text-input',
      attrs: { type: 'text', value: `${this.config.seed}`, placeholder: 'World seed' },
      on: {
        input: (ev: Event) => {
          const raw = (ev.target as HTMLInputElement).value.trim();
          const parsed = parseInt(raw, 10);
          this.config.seed = Number.isFinite(parsed) ? parsed : hashString(raw);
          this.refreshPreview();
        }
      }
    }) as HTMLInputElement;

    return el('div', { class: 'seed-row' }, [
      el('label', { class: 'field-label', text: 'SEED' }),
      el('div', { class: 'seed-controls' }, [
        this.seedInput,
        el('button', {
          class: 'btn btn-ghost',
          title: 'Roll a random seed',
          text: '🎲',
          on: {
            click: () => {
              this.config.seed = Math.floor(Math.random() * 2147483647);
              this.seedInput.value = `${this.config.seed}`;
              this.refreshPreview();
            }
          }
        })
      ])
    ]);
  }

  // ============================ HELPERS ============================

  private field(label: string, hint: string, control: HTMLElement): HTMLElement {
    return el('div', { class: 'setup-field' }, [
      el('div', { class: 'field-head' }, [
        el('span', { class: 'field-label', text: label }),
        el('span', { class: 'field-hint', text: hint })
      ]),
      control
    ]);
  }

  private syncSelection(groupKey: string, value: string): void {
    const group = this.optionRoots.get(groupKey);
    if (!group) return;
    for (const child of Array.from(group.children)) {
      child.classList.toggle('selected', (child as HTMLElement).dataset.value === value);
    }
  }

  private toggleSpecies(species: SpeciesType): void {
    const idx = this.config.species.indexOf(species);
    if (idx === -1) {
      this.config.species.push(species);
    } else if (this.config.species.length > 1) {
      this.config.species.splice(idx, 1);
    }

    const group = this.optionRoots.get('species');
    if (!group) return;
    for (const child of Array.from(group.children)) {
      const value = (child as HTMLElement).dataset.value as SpeciesType;
      child.classList.toggle('selected', this.config.species.includes(value));
    }
  }

  /** Debounced so dragging the seed field doesn't regenerate on every keystroke. */
  private refreshPreview(): void {
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
    this.preview.drawPlaceholder('Generating preview…');
    this.previewTimer = window.setTimeout(() => {
      this.preview.drawGenerated(PREVIEW_RESOLUTION, this.config.preset, this.config.seed);
    }, 90);
  }

  private create(ctx: GameContext): void {
    if (this.config.species.length === 0) {
      ctx.toast('Select at least one starting species', 'warning');
      return;
    }
    ctx.startNewWorld({ ...this.config, species: [...this.config.species] });
  }
}

function hashString(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}
