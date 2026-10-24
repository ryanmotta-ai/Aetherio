import { el, clear, badge, titleCase, formatNumber } from '../core/Dom';
import { ALL_GOODS, GOODS, GoodId } from '../../civ/Goods';
import { GOVERNMENTS } from '../../civ/Government';
import type { Screen } from '../core/ScreenManager';
import type { GameContext } from '../core/GameContext';
import { chronicle } from '../../civ/Chronicle';
import { stockChart } from '../components/Charts';

export type EconomySubTab = 'stock_market' | 'goods_matrix' | 'trade_sanctions';

export class EconomyScreen implements Screen {
  public readonly id = 'economy' as const;
  public readonly kind = 'overlay' as const;
  public readonly dismissable = true;

  private activeTab: EconomySubTab = 'stock_market';
  private selectedGood: GoodId = 'iron';
  private selectedKingdomId: string | null = null;
  private activeEmbargos: Set<string> = new Set();
  private userPortfolios: Map<GoodId, number> = new Map(); // Player speculative holdings
  private playerGold: number = 500;

  public build(ctx: GameContext): HTMLElement {
    const market = ctx.sim.market;
    const kingdoms = Array.from(ctx.sim.kingdoms.values());
    if (!this.selectedKingdomId && kingdoms.length > 0) {
      this.selectedKingdomId = kingdoms[0].id;
    }
    const currentKingdom = kingdoms.find(k => k.id === this.selectedKingdomId) ?? kingdoms[0];
    const totalGold = kingdoms.reduce((acc, k) => acc + k.treasury.get('gold'), 0);
    const activeRoutes = ctx.sim.trade.routes.size || Math.max(2, ctx.sim.cities.size);
    const maritimeShips = ctx.sim.naval.activeShips.size;

    // Calculate Price Changes (% surge/drop)
    const goodsChanges = ALL_GOODS.map(id => {
      const g = GOODS[id];
      const curPrice = market.price(id);
      const hist = market.priceHistory(id);
      const prevPrice = hist.length > 1 ? hist[hist.length - 2] : g.basePrice;
      const changePct = ((curPrice - prevPrice) / prevPrice) * 100;
      const baseDiffPct = ((curPrice - g.basePrice) / g.basePrice) * 100;
      return {
        id,
        good: g,
        price: curPrice,
        prevPrice,
        changePct,
        baseDiffPct,
        supply: market.supplyOf(id),
        demand: market.demandOf(id),
        history: hist
      };
    });

    // Top Gainers & Top Losers
    const gainers = [...goodsChanges].sort((a, b) => b.changePct - a.changePct).slice(0, 3);
    const losers = [...goodsChanges].sort((a, b) => a.changePct - b.changePct).slice(0, 3);

    const selectedChange = goodsChanges.find(g => g.id === this.selectedGood) ?? goodsChanges[0];

    const root = el('div', { class: 'screen-container glass-panel econ-gameawards-container' }, [
      // ================= TOP HEADER =================
      el('div', { class: 'screen-header econ-header-hero' }, [
        el('div', { class: 'header-hero-title' }, [
          el('span', { class: 'hero-icon', text: '📈' }),
          el('div', {}, [
            el('h2', { class: 'gold-gradient-text', text: 'Bolsa de Valores & Mercado Global (AETH50)' }),
            el('p', { class: 'hero-subtitle', text: 'Terminal Financeiro em Tempo Real · Especulação, Cotações, Matriz dos 9 Recursos e Sanções' })
          ])
        ]),
        el('button', { class: 'close-btn-hero', text: '✕', on: { click: () => ctx.screens.back() } })
      ]),

      el('div', { class: 'screen-body econ-hero-body' }, [
        // ================= HERO METRICS TICKER BANNER =================
        el('div', { class: 'econ-metrics-banner-hero' }, [
          el('div', { class: 'e-metric-card' }, [
            el('span', { class: 'e-metric-icon', text: '💰' }),
            el('div', {}, [
              el('span', { class: 'e-metric-lbl', text: 'Tesouro Global Acumulado' }),
              el('div', { class: 'e-metric-val highlight-gold', text: `${totalGold} Ouro 🪙` })
            ])
          ]),
          el('div', { class: 'e-metric-card' }, [
            el('span', { class: 'e-metric-icon', text: '🚢' }),
            el('div', {}, [
              el('span', { class: 'e-metric-lbl', text: 'Frota Mercante & Rotas' }),
              el('div', { class: 'e-metric-val highlight-cyan', text: `${maritimeShips} Navios · ${activeRoutes} Rotas` })
            ])
          ]),
          el('div', { class: 'e-metric-card' }, [
            el('span', { class: 'e-metric-icon', text: '📊' }),
            el('div', {}, [
              el('span', { class: 'e-metric-lbl', text: `Índice ${selectedChange.good.name}` }),
              el('div', { class: `e-metric-val ${selectedChange.changePct >= 0 ? 'highlight-green' : 'highlight-red'}`, text: `${selectedChange.price.toFixed(1)} 🪙 (${selectedChange.changePct >= 0 ? '+' : ''}${selectedChange.changePct.toFixed(1)}%)` })
            ])
          ]),
          el('div', { class: 'e-metric-card' }, [
            el('span', { class: 'e-metric-icon', text: '💼' }),
            el('div', {}, [
              el('span', { class: 'e-metric-lbl', text: 'Carteira de Especulação' }),
              el('div', { class: 'e-metric-val highlight-purple', text: `${this.playerGold} Ouro Disponível` })
            ])
          ])
        ]),

        // ================= MAIN NAVIGATION TABS =================
        el('div', { class: 'econ-nav-tabs' }, [
          el('button', {
            class: `econ-nav-btn ${this.activeTab === 'stock_market' ? 'active' : ''}`,
            on: { click: () => { this.activeTab = 'stock_market'; ctx.screens.refresh(); } }
          }, [
            el('span', { text: '📈 Bolsa de Valores & Especulação' })
          ]),
          el('button', {
            class: `econ-nav-btn ${this.activeTab === 'goods_matrix' ? 'active' : ''}`,
            on: { click: () => { this.activeTab = 'goods_matrix'; ctx.screens.refresh(); } }
          }, [
            el('span', { text: '📦 Matriz dos 9 Recursos & Preços' })
          ]),
          el('button', {
            class: `econ-nav-btn ${this.activeTab === 'trade_sanctions' ? 'active' : ''}`,
            on: { click: () => { this.activeTab = 'trade_sanctions'; ctx.screens.refresh(); } }
          }, [
            el('span', { text: '🌐 Tarifas, Embargos & Casa da Moeda' })
          ])
        ]),

        // ================= TAB 1: STOCK MARKET & SPECULATION =================
        this.activeTab === 'stock_market' ? el('div', { class: 'econ-grid-layout' }, [
          
          // LEFT PANEL: LIVE CHART & COMMODITY SELECTOR
          el('div', { class: 'econ-col glass-card-hero span-2' }, [
            
            // COMMODITY SELECTOR TABS
            el('div', { class: 'econ-tab-bar' },
              ALL_GOODS.map(goodId => {
                const g = GOODS[goodId];
                const changeData = goodsChanges.find(item => item.id === goodId);
                const isSelected = this.selectedGood === goodId;
                const isUp = (changeData?.changePct ?? 0) >= 0;
                return el('button', {
                  class: `econ-tab-btn ${isSelected ? 'active' : ''}`,
                  on: { click: () => { this.selectedGood = goodId; ctx.screens.refresh(); } }
                }, [
                  el('span', { class: 'tab-emoji', text: g.icon }),
                  el('span', { class: 'tab-name', text: g.name }),
                  el('span', { class: `tab-pct ${isUp ? 'up' : 'down'}`, text: `${isUp ? '▲' : '▼'}${Math.abs(changeData?.changePct ?? 0).toFixed(0)}%` })
                ]);
              })
            ),

            // LIVE CHART CANVAS CONTAINER
            el('div', { class: 'stock-chart-card' }, [
              el('div', { class: 'chart-card-header' }, [
                el('div', { class: 'chart-title-box' }, [
                  el('span', { class: 'chart-good-icon', text: selectedChange.good.icon }),
                  el('div', {}, [
                    el('h3', { text: `Histórico de Cotação: ${selectedChange.good.name}` }),
                    el('span', { class: 'desc-text-sm', text: selectedChange.good.description })
                  ])
                ]),
                el('div', { class: 'chart-price-box' }, [
                  el('span', { class: 'chart-current-price', text: `${selectedChange.price.toFixed(2)} 🪙` }),
                  el('span', { class: `chart-badge ${selectedChange.changePct >= 0 ? 'badge-up' : 'badge-down'}`, text: `${selectedChange.changePct >= 0 ? '▲ +' : '▼ '}${selectedChange.changePct.toFixed(2)}%` })
                ])
              ]),

              // HTML5 CANVAS STOCK CHART RENDERING
              this.renderChartCanvas(selectedChange.history, selectedChange.changePct >= 0, selectedChange.good.name)
            ]),

            // REPORT: GAINERS & LOSERS (EM ALTA / EM BAIXA)
            el('div', { class: 'market-reports-row' }, [
              // GAINERS
              el('div', { class: 'report-box gainers-box' }, [
                el('h4', { text: '🚀 Maiores Altas do Ano' }),
                el('div', { class: 'report-list' },
                  gainers.map(item => el('div', { class: 'report-item' }, [
                    el('span', { text: `${item.good.icon} ${item.good.name}` }),
                    el('strong', { class: 'highlight-green', text: `${item.price.toFixed(1)} 🪙 (+${item.changePct.toFixed(1)}%)` })
                  ]))
                )
              ]),
              // LOSERS
              el('div', { class: 'report-box losers-box' }, [
                el('h4', { text: '📉 Maiores Baixas do Ano' }),
                el('div', { class: 'report-list' },
                  losers.map(item => el('div', { class: 'report-item' }, [
                    el('span', { text: `${item.good.icon} ${item.good.name}` }),
                    el('strong', { class: 'highlight-red', text: `${item.price.toFixed(1)} 🪙 (${item.changePct.toFixed(1)}%)` })
                  ]))
                )
              ])
            ])
          ]),

          // RIGHT PANEL: NEWSFEED & SPECULATION PORTFOLIO
          el('div', { class: 'econ-col glass-card-hero' }, [
            
            // SPECULATION & BUY/SELL TRADING DESK
            el('div', { class: 'trading-desk-card' }, [
              el('div', { class: 'card-hero-header' }, [
                el('h3', { text: '⚡ Mesa de Operações Financeiras' })
              ]),
              el('p', { class: 'desc-text-sm', text: `Compre e venda títulos de ${selectedChange.good.name} para lucrar com as oscilações.` }),

              el('div', { class: 'trade-controls-box' }, [
                el('div', { class: 'trade-row-info' }, [
                  el('span', { text: 'Sua Posição:' }),
                  el('strong', { class: 'highlight-cyan', text: `${this.userPortfolios.get(this.selectedGood) ?? 0} Unidades` })
                ]),
                el('div', { class: 'trade-row-info' }, [
                  el('span', { text: 'Preço de Compra:' }),
                  el('strong', { class: 'highlight-gold', text: `${selectedChange.price.toFixed(1)} 🪙 / un` })
                ]),
                el('div', { class: 'trade-btn-group' }, [
                  el('button', {
                    class: 'trade-buy-btn',
                    text: `Comprar +10 (${(selectedChange.price * 10).toFixed(0)} 🪙)`,
                    on: { click: () => {
                      const cost = selectedChange.price * 10;
                      if (this.playerGold >= cost) {
                        this.playerGold -= cost;
                        this.userPortfolios.set(this.selectedGood, (this.userPortfolios.get(this.selectedGood) ?? 0) + 10);
                        ctx.screens.refresh();
                      }
                    }}
                  }),
                  el('button', {
                    class: 'trade-sell-btn',
                    text: `Vender +10 (${(selectedChange.price * 10).toFixed(0)} 🪙)`,
                    on: { click: () => {
                      const current = this.userPortfolios.get(this.selectedGood) ?? 0;
                      if (current >= 10) {
                        this.userPortfolios.set(this.selectedGood, current - 10);
                        this.playerGold += selectedChange.price * 10;
                        ctx.screens.refresh();
                      }
                    }}
                  })
                ])
              ])
            ]),

            el('hr', { class: 'hero-divider' }),

            // FINANCIAL NEWSFEED & EVENTS LOG
            el('div', { class: 'newsfeed-card' }, [
              el('div', { class: 'card-hero-header' }, [
                el('h3', { text: '📰 Notícias & Eventos Econômicos' })
              ]),
              el('div', { class: 'newsfeed-list-scroll' },
                this.getFinancialNews(ctx).map(news => el('div', { class: 'news-item-card' }, [
                  el('span', { class: 'news-year', text: `Ano ${news.year}` }),
                  el('span', { class: 'news-text', text: news.text })
                ]))
              )
            ])
          ])
        ]) : null,

        // ================= TAB 2: GOODS MATRIX TABLE =================
        this.activeTab === 'goods_matrix' ? el('div', { class: 'econ-col glass-card-hero' }, [
          el('div', { class: 'card-hero-header' }, [
            el('h3', { text: '📦 Matriz Completa dos 9 Recursos & Oferta Global' }),
            el('span', { class: 'badge-tag-gold', text: '9 MERCADORIAS MONITORADAS' })
          ]),

          el('div', { class: 'goods-matrix-table-container' }, [
            el('table', { class: 'styled-table econ-table-hero' }, [
              el('thead', {}, [
                el('tr', {}, [
                  el('th', { text: 'Mercadoria' }),
                  el('th', { text: 'Tipo' }),
                  el('th', { text: 'Preço Base' }),
                  el('th', { text: 'Cotação Atual' }),
                  el('th', { text: 'Variação Anual' }),
                  el('th', { text: 'Oferta Global' }),
                  el('th', { text: 'Demanda Global' }),
                  el('th', { text: 'Ação' })
                ])
              ]),
              el('tbody', {}, goodsChanges.map(item => {
                const g = item.good;
                const isUp = item.changePct >= 0;
                return el('tr', { class: 'good-row-hero' }, [
                  el('td', { class: 'good-cell-title' }, [
                    el('span', { class: 'good-emoji', text: g.icon }),
                    el('strong', { text: g.name })
                  ]),
                  el('td', {}, [
                    el('span', { class: `kind-pill ${g.kind}`, text: g.kind.toUpperCase() })
                  ]),
                  el('td', { text: `${g.basePrice} 🪙` }),
                  el('td', { class: 'highlight-gold font-bold', text: `${item.price.toFixed(2)} 🪙` }),
                  el('td', { class: isUp ? 'highlight-green font-bold' : 'highlight-red font-bold', text: `${isUp ? '▲ +' : '▼ '}${item.changePct.toFixed(1)}%` }),
                  el('td', { text: `${item.supply} u` }),
                  el('td', { text: `${item.demand} u` }),
                  el('td', {}, [
                    el('button', {
                      class: 'btn-sm btn-primary',
                      text: '📈 Ver Gráfico',
                      on: { click: () => {
                        this.selectedGood = item.id;
                        this.activeTab = 'stock_market';
                        ctx.screens.refresh();
                      }}
                    })
                  ])
                ]);
              }))
            ])
          ])
        ]) : null,

        // ================= TAB 3: SANCTIONS & MINT =================
        this.activeTab === 'trade_sanctions' ? el('div', { class: 'econ-grid-layout' }, [
          // EMBARGOES & SANCTIONS
          el('div', { class: 'econ-col glass-card-hero span-2' }, [
            el('div', { class: 'card-hero-header' }, [
              el('h3', { text: '🌐 Sanções, Tarifas e Embargos Comerciais' })
            ]),
            el('p', { class: 'gov-desc-text', text: 'Gerencie os acordos comerciais internacionais e decrete embargos financeiros contra impérios rivais.' }),

            el('div', { class: 'realm-embargo-list' },
              kingdoms.map(realm => {
                const isEmbargoed = this.activeEmbargos.has(realm.id);
                return el('div', { class: 'realm-embargo-card', style: `border-left: 4px solid ${realm.color}` }, [
                  el('div', { class: 're-top' }, [
                    el('strong', { text: realm.name }),
                    el('span', { class: 're-gold', text: `${realm.treasury.get('gold')} 🪙` })
                  ]),
                  el('div', { class: 're-info' }, [
                    el('span', { text: `Cidades: ${realm.cityIds.size}` }),
                    el('span', { text: `Alíquota Tributária: ${(GOVERNMENTS[realm.government].taxRate * 100).toFixed(0)}%` }),
                    el('span', { text: `Riqueza Estatal: ${Math.floor(realm.wealth)}` })
                  ]),
                  el('button', {
                    class: `embargo-action-btn ${isEmbargoed ? 'active-danger' : ''}`,
                    text: isEmbargoed ? '⛔ EMBARGO ATIVO (REMOVER SANÇÃO)' : '🚫 DECRETAR EMBARGO COMERCIAL',
                    on: { click: () => {
                      if (isEmbargoed) this.activeEmbargos.delete(realm.id);
                      else this.activeEmbargos.add(realm.id);
                      ctx.screens.refresh();
                    }}
                  })
                ]);
              })
            )
          ]),

          // MINT & TRADE BALANCE LEDGER
          el('div', { class: 'econ-col glass-card-hero' }, [
            el('div', { class: 'card-hero-header' }, [
              el('h3', { text: '⚖️ Balança Comercial & Alfândega dos Reinos' })
            ]),
            el('p', { class: 'desc-text-sm', text: 'Rastreamento em tempo real de exportações, importações, superávits e arrecadação tarifária alfandegária.' }),

            el('div', { class: 'trade-balance-ledger-list', style: 'display: flex; flex-direction: column; gap: 8px; margin: 12px 0;' },
              kingdoms.map(realm => {
                const netBalance = (realm.exportVolume || 0) - (realm.importVolume || 0);
                const isSurplus = netBalance >= 0;
                return el('div', { class: 'report-item-box', style: `border-left: 4px solid ${realm.color}; background: rgba(15, 23, 42, 0.6); padding: 8px 12px; border-radius: 6px;` }, [
                  el('div', { style: 'display: flex; justify-content: space-between; font-weight: bold;' }, [
                    el('span', { text: realm.name, style: `color: ${realm.color}` }),
                    el('span', {
                      class: isSurplus ? 'highlight-green' : 'highlight-red',
                      text: `${isSurplus ? '▲ Superávit' : '▼ Déficit'}: ${Math.abs(netBalance)} 🪙`
                    })
                  ]),
                  el('div', { style: 'display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8; margin-top: 4px;' }, [
                    el('span', { text: `📤 Exp: ${realm.exportVolume || 0} 🪙` }),
                    el('span', { text: `📥 Imp: ${realm.importVolume || 0} 🪙` }),
                    el('span', { text: `📜 Tarifas: ${realm.tariffRevenue || 0} 🪙`, style: 'color: #fbbf24;' })
                  ])
                ]);
              })
            ),

            el('div', { class: 'card-hero-header', style: 'margin-top: 14px;' }, [
              el('h3', { text: '🪙 Casa da Moeda Real' })
            ]),
            el('p', { class: 'desc-text-sm', text: 'Cunhe novas moedas estatais para expandir a liquidez e enriquecer o tesouro estatal.' }),

            el('div', { class: 'mint-realm-selector' },
              kingdoms.map(realm => el('button', {
                class: `realm-chip-btn ${realm.id === currentKingdom?.id ? 'active' : ''}`,
                style: `border-left: 4px solid ${realm.color}`,
                on: { click: () => { this.selectedKingdomId = realm.id; ctx.screens.refresh(); } }
              }, [
                el('span', { text: realm.name }),
                el('strong', { text: `${realm.treasury.get('gold')} 🪙` })
              ]))
            ),

            el('button', {
              class: 'mint-hero-btn',
              text: `⚡ Cunhar +250 Ouro em ${currentKingdom?.name ?? 'Reino'}`,
              on: { click: () => {
                if (currentKingdom) {
                  currentKingdom.treasury.add('gold', 250);
                  currentKingdom.wealth += 250;
                  ctx.screens.refresh();
                }
              }}
            })
          ])
        ]) : null
      ])
    ]);

    return root;
  }

  private renderChartCanvas(history: number[], isUp: boolean, _goodName: string): HTMLElement {
    // Ensure we always have at least 8 data points so the line has some shape even on Year 1
    let data = [...history];
    if (data.length < 2) {
      const base = data[0] || 10;
      data = [0.96, 0.98, 1.02, 0.99, 1.04, 1.01, 1.03, 0.97, 1.05, 1].map(f => base * f);
    } else if (data.length < 8) {
      const first = data[0];
      const prefix: number[] = [];
      for (let i = 0; i < 8 - data.length; i++) prefix.push(first * (0.95 + Math.sin(i) * 0.04));
      data = [...prefix, ...data];
    }

    return stockChart(data, isUp ? '#7fb069' : '#d9534f', {
      height: 220,
      yRange: [Math.min(...data) * 0.92, Math.max(...data) * 1.08],
      callout: v => v.toFixed(1)
    });
  }

  private getFinancialNews(ctx: GameContext): { year: number; text: string }[] {
    const logs = chronicle.getEvents().slice(0, 8);
    if (logs.length === 0) {
      return [
        { year: ctx.sim.currentYear, text: 'Abertura dos mercados globais em Aethoria. Preços estabilizados.' },
        { year: ctx.sim.currentYear, text: 'Rotas de navegação ativas unindo os portos imperiais.' }
      ];
    }
    return logs.map((l: any) => ({ year: l.year, text: l.text }));
  }
}
