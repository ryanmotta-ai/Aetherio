import { el } from '../core/Dom';
import { CRAFT_TECHS, POLITICAL_TECHS, TECH_ERAS, TechEra, techCost } from '../../civ/TechTree';
import type { Screen } from '../core/ScreenManager';
import type { GameContext } from '../core/GameContext';

export class TechTreeScreen implements Screen {
  public readonly id = 'techtree' as const;
  public readonly kind = 'overlay' as const;
  public readonly dismissable = true;

  private selectedTrack: 'craft' | 'politics' = 'craft';
  private selectedKingdomId: string | null = null;

  public build(ctx: GameContext): HTMLElement {
    const kingdoms = Array.from(ctx.sim.kingdoms.values());
    if (!this.selectedKingdomId && kingdoms.length > 0) {
      this.selectedKingdomId = kingdoms[0].id;
    }
    const currentKingdom = kingdoms.find(k => k.id === this.selectedKingdomId) ?? kingdoms[0];
    const knownTechs = currentKingdom?.research.known ?? new Set(['tribalism', 'stone_tools']);
    const techs = this.selectedTrack === 'craft' ? CRAFT_TECHS : POLITICAL_TECHS;
    const knownCount = techs.filter(t => knownTechs.has(t.id)).length;

    return el('div', { class: 'screen-container glass-panel tech-gameawards-container' }, [
      // Top Bar & Title Header
      el('div', { class: 'screen-header tech-header-hero' }, [
        el('div', { class: 'header-hero-title' }, [
          el('span', { class: 'hero-icon', text: '🎓' }),
          el('div', {}, [
            el('h2', { class: 'sapphire-gradient-text', text: 'Árvore de Tecnologias, Tradições & Ciência' }),
            el('p', { class: 'hero-subtitle', text: 'Desenvolvimento Científico, Manufatura, Regimes Políticos e Filosofia ao Longo das 6 Eras' })
          ])
        ]),
        el('button', { class: 'close-btn-hero', text: '✕', on: { click: () => ctx.screens.back() } })
      ]),

      el('div', { class: 'screen-body tech-hero-body' }, [
        // METRICS BANNER (4 Hero Cards)
        el('div', { class: 'tech-metrics-banner-hero' }, [
          el('div', { class: 'tc-metric-card' }, [
            el('span', { class: 'tc-metric-icon', text: '🏛️' }),
            el('div', {}, [
              el('span', { class: 'tc-metric-lbl', text: 'Reino em Análise' }),
              el('div', { class: 'tc-metric-val highlight-gold', text: currentKingdom?.name ?? 'Tribo' })
            ])
          ]),
          el('div', { class: 'tc-metric-card' }, [
            el('span', { class: 'tc-metric-icon', text: '💡' }),
            el('div', {}, [
              el('span', { class: 'tc-metric-lbl', text: 'Tecnologias Desbloqueadas' }),
              el('div', { class: 'tc-metric-val highlight-cyan', text: `${knownCount} / ${techs.length}` })
            ])
          ]),
          el('div', { class: 'tc-metric-card' }, [
            el('span', { class: 'tc-metric-icon', text: '⚡' }),
            el('div', {}, [
              el('span', { class: 'tc-metric-lbl', text: 'Geração Anual de Pesquisa' }),
              el('div', { class: 'tc-metric-val highlight-green', text: `+${currentKingdom?.research.output ?? 15} Pts / Ano` })
            ])
          ]),
          el('div', { class: 'tc-metric-card' }, [
            el('span', { class: 'tc-metric-icon', text: '📜' }),
            el('div', {}, [
              el('span', { class: 'tc-metric-lbl', text: 'Trilha Selecionada' }),
              el('div', { class: 'tc-metric-val highlight-blue', text: this.selectedTrack === 'craft' ? 'Manufatura & Ciência' : 'Política & Sociedade' })
            ])
          ])
        ]),

        // KINGDOM & TRACK SELECTOR TABS
        el('div', { class: 'tech-controls-bar' }, [
          el('div', { class: 'track-hero-tabs' }, [
            el('button', {
              class: `track-hero-tab ${this.selectedTrack === 'craft' ? 'active' : ''}`,
              on: { click: () => { this.selectedTrack = 'craft'; ctx.screens.refresh(); } }
            }, [el('span', { text: '⚒️ Manufatura, Ferramentas & Ciência' })]),
            el('button', {
              class: `track-hero-tab ${this.selectedTrack === 'politics' ? 'active' : ''}`,
              on: { click: () => { this.selectedTrack = 'politics'; ctx.screens.refresh(); } }
            }, [el('span', { text: '🏛️ Política, Leis & Filosofia Social' })])
          ]),
          el('div', { class: 'kingdom-select-dropdown' },
            kingdoms.map(realm => el('button', {
              class: `k-select-btn ${realm.id === currentKingdom?.id ? 'active' : ''}`,
              style: `border-bottom: 2px solid ${realm.color}`,
              on: { click: () => { this.selectedKingdomId = realm.id; ctx.screens.refresh(); } }
            }, [el('span', { text: realm.name })]))
          )
        ]),

        // TECH NODES GRID BY ERAS
        el('div', { class: 'techtree-nodes-hero-container glass-card-hero' }, [
          el('div', { class: 'card-hero-header' }, [
            el('h3', { text: '📜 Grafo de Conhecimento Civilizacional' }),
            el('span', { class: 'badge-tag-blue', text: '6 ERAS HISTÓRICAS' })
          ]),

          el('div', { class: 'techtree-hero-grid' },
            techs.map(t => {
              const isKnown = knownTechs.has(t.id);
              const eraInfo = TECH_ERAS[t.era as TechEra];
              return el('div', { class: `tech-node-hero-card ${isKnown ? 'unlocked' : 'locked'}` }, [
                el('div', { class: 'tech-node-top' }, [
                  el('div', { class: 'tech-icon-name' }, [
                    el('span', { class: 'tech-icon-emoji', text: t.icon }),
                    el('strong', { class: 'tech-title-text', text: t.name })
                  ]),
                  el('span', { class: 'tech-era-tag', style: `background: ${eraInfo?.color ?? '#3b82f6'}22; border: 1px solid ${eraInfo?.color ?? '#3b82f6'}; color: ${eraInfo?.color ?? '#3b82f6'}`, text: eraInfo?.name ?? 'Era' })
                ]),
                el('p', { class: 'tech-desc-hero', text: t.description }),
                el('div', { class: 'tech-node-footer' }, [
                  el('span', { class: `tech-status-badge ${isKnown ? 'known' : 'need'}`, text: isKnown ? '✓ DESBLOQUEADO' : `Custo: ${techCost(t)} Pts` }),
                  !isKnown ? el('button', {
                    class: 'unlock-tech-btn',
                    text: '⚡ Desbloquear',
                    on: { click: () => {
                      if (currentKingdom) {
                        currentKingdom.research.known.add(t.id);
                        ctx.screens.refresh();
                      }
                    }}
                  }) : null
                ])
              ]);
            })
          )
        ])
      ])
    ]);
  }
}
