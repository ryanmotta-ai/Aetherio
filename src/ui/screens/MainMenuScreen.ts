import { el, button } from '../core/Dom';
import { SaveSystem } from '../../core/SaveSystem';
import type { Screen } from '../core/ScreenManager';
import type { GameContext } from '../core/GameContext';

const TAGLINES = [
  'Esculpa a terra. Semeie a vida. Testemunhe a evolução dos reinos.',
  'Todo império erguer-se-á e um dia cairá.',
  'Os deuses observam em silêncio. Exceto quando decidem intervir.',
  'O mundo simula sua história. Você apenas segura o pincel da criação.',
  'O fogo do conflito espalha-se mais rápido que a diplomacia.'
];

/** Title screen. The live world rendering behind it is driven by main.ts. */
export class MainMenuScreen implements Screen {
  public readonly id = 'main-menu' as const;
  public readonly kind = 'fullscreen' as const;
  public readonly dismissable = false;

  public build(ctx: GameContext): HTMLElement {
    const slots = SaveSystem.listSlots();
    const hasSaves = slots.some(s => s.exists);
    const mostRecent = slots.filter(s => s.exists).sort((a, b) => b.timestamp - a.timestamp)[0];

    const tagline = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

    return el('div', { class: 'menu-screen' }, [
      el('div', { class: 'menu-vignette' }),

      el('div', { class: 'menu-inner' }, [
        el('div', { class: 'menu-hero' }, [
          el('div', { class: 'menu-mark', text: '✦' }),
          el('h1', { class: 'menu-title', text: 'AETHORIA' }),
          el('p', { class: 'menu-subtitle', text: 'SANDBOX DIVINO 2D' }),
          el('p', { class: 'menu-tagline', text: tagline })
        ]),

        el('nav', { class: 'menu-nav' }, [
          button('Novo Mundo', () => ctx.screens.open('world-setup'), {
            variant: 'menu', icon: '🌍', class: 'menu-primary', hint: 'N'
          }),
          hasSaves
            ? button('Continuar', () => {
                if (!mostRecent) return;
                const data = SaveSystem.readSlot(mostRecent.slot);
                if (data && ctx.loadSaveData(data)) {
                  ctx.toast(`Continuando “${mostRecent.name}” no ano ${mostRecent.year}`, 'success');
                } else {
                  ctx.toast('Não foi possível ler este arquivo de save', 'warning');
                }
              }, { variant: 'menu', icon: '▶️', hint: 'Ano ' + (mostRecent?.year ?? 1) })
            : null,
          button('Carregar Mundo', () => ctx.screens.open('saveload', { fromMenu: true }), { variant: 'menu', icon: '💾' }),
          button('Bestiário', () => ctx.screens.open('bestiary'), { variant: 'menu', icon: '📖' }),
          button('Configurações', () => ctx.screens.open('settings'), { variant: 'menu', icon: '⚙️' }),
          button('Como Jogar', () => ctx.screens.open('help'), { variant: 'menu', icon: '❓' }),
          button('Créditos', () => ctx.screens.open('credits'), { variant: 'menu', icon: '🏅' })
        ].filter(Boolean) as HTMLElement[]),

        el('footer', { class: 'menu-footer' }, [
          el('span', { class: 'menu-version', text: 'v1.0.0 · Motor de Simulação 2D' })
        ])
      ])
    ]);
  }
}
