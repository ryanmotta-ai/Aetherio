/**
 * Comprehensive Pixel Art Sprite Registry.
 * Generates transparent-background 16x16 pixel sprites for tiles, resources, disasters, items, fauna, and kingdom badges.
 */
export class SpriteRegistry {
  private static cache: Map<string, HTMLCanvasElement> = new Map();

  private static createTransparentCanvas(width: number = 16, height: number = 16): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    return { canvas, ctx };
  }

  /** Helper: set individual pixel */
  private static px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }

  public static get(key: string): HTMLCanvasElement | null {
    return this.cache.get(key) || null;
  }

  public static registerSprite(key: string, drawFn: (ctx: CanvasRenderingContext2D) => void, width: number = 16, height: number = 16): HTMLCanvasElement {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const { canvas, ctx } = this.createTransparentCanvas(width, height);
    drawFn(ctx);
    this.cache.set(key, canvas);
    return canvas;
  }

  public static initializeAllTransparentSprites(): void {
    const px = this.px;

    // === TREES & VEGETATION ===

    this.registerSprite('tree_oak', (ctx) => {
      // Trunk with root
      ctx.fillStyle = '#78350f'; ctx.fillRect(7, 10, 2, 6);
      ctx.fillStyle = '#92400e'; ctx.fillRect(6, 12, 1, 2); ctx.fillRect(9, 13, 1, 1);
      // Foliage layers (dark -> mid -> light)
      ctx.fillStyle = '#14532d'; ctx.fillRect(3, 4, 10, 7);
      ctx.fillStyle = '#166534'; ctx.fillRect(4, 3, 8, 6);
      ctx.fillStyle = '#15803d'; ctx.fillRect(5, 2, 6, 5);
      // Highlight spots
      ctx.fillStyle = '#22c55e'; ctx.fillRect(5, 3, 2, 2); ctx.fillRect(9, 4, 2, 2);
      ctx.fillStyle = '#4ade80';
      px(ctx, 6, 3, '#4ade80'); px(ctx, 10, 5, '#4ade80');
      // Leaf edges
      px(ctx, 3, 5, '#14532d'); px(ctx, 12, 6, '#14532d');
    });

    this.registerSprite('tree_pine', (ctx) => {
      // Trunk
      ctx.fillStyle = '#451a03'; ctx.fillRect(7, 12, 2, 4);
      // Snow cap
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(7, 1, 2, 2);
      px(ctx, 6, 2, '#e2e8f0');
      // Upper tier (narrow)
      ctx.fillStyle = '#065f46'; ctx.fillRect(5, 3, 6, 3);
      ctx.fillStyle = '#047857'; ctx.fillRect(6, 3, 4, 2);
      // Lower tier (wide)
      ctx.fillStyle = '#065f46'; ctx.fillRect(3, 6, 10, 3);
      ctx.fillStyle = '#047857'; ctx.fillRect(4, 6, 8, 2);
      // Middle tier
      ctx.fillStyle = '#065f46'; ctx.fillRect(4, 9, 8, 3);
      ctx.fillStyle = '#047857'; ctx.fillRect(5, 9, 6, 2);
      // Snow flecks
      px(ctx, 5, 4, '#e2e8f0'); px(ctx, 9, 7, '#e2e8f0'); px(ctx, 4, 10, '#e2e8f0');
    });

    this.registerSprite('tree_palm', (ctx) => {
      // Curved trunk
      ctx.fillStyle = '#a16207'; ctx.fillRect(8, 8, 2, 8);
      ctx.fillStyle = '#92400e'; ctx.fillRect(7, 10, 2, 4);
      ctx.fillStyle = '#78350f'; ctx.fillRect(7, 12, 1, 2);
      // Coconuts
      px(ctx, 7, 6, '#92400e'); px(ctx, 8, 7, '#78350f');
      // Palm fronds (spreading out)
      ctx.fillStyle = '#65a30d';
      ctx.fillRect(2, 2, 5, 2); ctx.fillRect(9, 2, 5, 2);
      ctx.fillRect(3, 4, 4, 2); ctx.fillRect(9, 4, 4, 2);
      ctx.fillStyle = '#84cc16';
      ctx.fillRect(4, 1, 3, 2); ctx.fillRect(9, 1, 3, 2);
      ctx.fillRect(6, 3, 4, 2);
      // Frond highlights
      px(ctx, 5, 1, '#a3e635'); px(ctx, 10, 1, '#a3e635');
    });

    this.registerSprite('swamp_reed', (ctx) => {
      // Stems
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(4, 5, 1, 11); ctx.fillRect(7, 3, 1, 13); ctx.fillRect(10, 6, 1, 10);
      ctx.fillRect(12, 4, 1, 10);
      // Reed tops (brown fuzzy)
      ctx.fillStyle = '#78350f';
      ctx.fillRect(3, 3, 2, 3); ctx.fillRect(6, 1, 2, 3); ctx.fillRect(9, 4, 2, 3);
      ctx.fillRect(11, 2, 2, 3);
      // Cattail detail
      ctx.fillStyle = '#92400e';
      px(ctx, 4, 4, '#92400e'); px(ctx, 7, 2, '#92400e'); px(ctx, 10, 5, '#92400e');
      // Water drops at base
      px(ctx, 5, 14, '#38bdf8'); px(ctx, 8, 15, '#38bdf8');
    });

    this.registerSprite('arcane_crystal', (ctx) => {
      // Crystal cluster (diamond shapes via rectangles)
      // Main crystal
      ctx.fillStyle = '#7c3aed';
      ctx.fillRect(6, 2, 4, 10);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(7, 3, 2, 8);
      // Side crystals
      ctx.fillStyle = '#6d28d9';
      ctx.fillRect(3, 6, 3, 7); ctx.fillRect(10, 5, 3, 8);
      ctx.fillStyle = '#8b5cf6';
      ctx.fillRect(4, 7, 1, 5); ctx.fillRect(11, 6, 1, 6);
      // Shine/sparkle
      ctx.fillStyle = '#e9d5ff';
      px(ctx, 7, 3, '#e9d5ff'); px(ctx, 4, 7, '#e9d5ff'); px(ctx, 11, 6, '#e9d5ff');
      // Glow at base
      ctx.fillStyle = '#c4b5fd';
      ctx.fillRect(5, 12, 6, 2);
      // Magic particles
      px(ctx, 2, 4, '#c4b5fd'); px(ctx, 13, 3, '#c4b5fd'); px(ctx, 8, 0, '#e9d5ff');
    });

    this.registerSprite('corrupted_skull', (ctx) => {
      // Skull shape
      ctx.fillStyle = '#d4d4d8'; ctx.fillRect(4, 3, 8, 7);
      ctx.fillStyle = '#e4e4e7'; ctx.fillRect(5, 4, 6, 5);
      // Eye sockets (dark)
      ctx.fillStyle = '#18181b'; ctx.fillRect(5, 5, 2, 2); ctx.fillRect(9, 5, 2, 2);
      // Purple glow in eyes
      px(ctx, 5, 5, '#a855f7'); px(ctx, 9, 5, '#a855f7');
      // Nose hole
      px(ctx, 7, 7, '#27272a'); px(ctx, 8, 7, '#27272a');
      // Teeth
      ctx.fillStyle = '#e4e4e7'; ctx.fillRect(5, 9, 6, 2);
      ctx.fillStyle = '#18181b'; px(ctx, 6, 9, '#18181b'); px(ctx, 8, 9, '#18181b'); px(ctx, 10, 9, '#18181b');
      // Jaw
      ctx.fillStyle = '#a1a1aa'; ctx.fillRect(5, 10, 6, 1);
      // Corruption mist
      ctx.fillStyle = 'rgba(168, 85, 247, 0.3)';
      ctx.fillRect(2, 11, 12, 4);
      px(ctx, 3, 10, 'rgba(168, 85, 247, 0.2)'); px(ctx, 12, 10, 'rgba(168, 85, 247, 0.2)');
    });

    // === RESOURCE NODES ===

    this.registerSprite('node_wood', (ctx) => {
      // Log stack (3 logs)
      ctx.fillStyle = '#92400e'; ctx.fillRect(2, 8, 12, 4);
      ctx.fillStyle = '#a16207'; ctx.fillRect(3, 5, 10, 4);
      ctx.fillStyle = '#b45309'; ctx.fillRect(5, 3, 6, 3);
      // Log ends (circles -> squares at pixel level)
      ctx.fillStyle = '#fde68a'; ctx.fillRect(2, 8, 2, 2); ctx.fillRect(12, 8, 2, 2);
      ctx.fillRect(3, 5, 2, 2); ctx.fillRect(11, 5, 2, 2);
      ctx.fillRect(5, 3, 2, 2);
      // Ring detail
      px(ctx, 3, 9, '#d97706'); px(ctx, 4, 6, '#d97706'); px(ctx, 6, 4, '#d97706');
      // Bark texture
      px(ctx, 7, 7, '#78350f'); px(ctx, 9, 9, '#78350f');
    });

    this.registerSprite('node_stone', (ctx) => {
      // Main boulder
      ctx.fillStyle = '#64748b'; ctx.fillRect(3, 5, 10, 9);
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(4, 6, 8, 7);
      // Highlight face
      ctx.fillStyle = '#cbd5e1'; ctx.fillRect(5, 7, 4, 3);
      // Shadow areas
      ctx.fillStyle = '#475569'; ctx.fillRect(3, 11, 10, 3);
      // Cracks
      px(ctx, 7, 8, '#475569'); px(ctx, 9, 10, '#475569'); px(ctx, 5, 11, '#334155');
      // Smaller rock
      ctx.fillStyle = '#64748b'; ctx.fillRect(11, 10, 3, 4);
      // Mineral sparkle
      px(ctx, 6, 7, '#e2e8f0'); px(ctx, 10, 9, '#e2e8f0');
    });

    this.registerSprite('node_iron', (ctx) => {
      // Ore body (dark)
      ctx.fillStyle = '#334155'; ctx.fillRect(3, 5, 10, 9);
      ctx.fillStyle = '#475569'; ctx.fillRect(4, 6, 8, 7);
      // Iron veins (metallic silver streaks)
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(5, 7, 3, 1); ctx.fillRect(8, 9, 3, 1); ctx.fillRect(6, 11, 4, 1);
      // Metallic glints
      ctx.fillStyle = '#e2e8f0';
      px(ctx, 5, 7, '#e2e8f0'); px(ctx, 10, 9, '#e2e8f0');
      px(ctx, 7, 11, '#f1f5f9');
      // Dark crevices
      px(ctx, 6, 8, '#1e293b'); px(ctx, 9, 10, '#1e293b');
    });

    this.registerSprite('node_gold', (ctx) => {
      // Rock matrix
      ctx.fillStyle = '#78350f'; ctx.fillRect(3, 5, 10, 9);
      ctx.fillStyle = '#92400e'; ctx.fillRect(4, 6, 8, 7);
      // Gold veins (bright)
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(5, 7, 3, 2); ctx.fillRect(8, 9, 3, 2); ctx.fillRect(6, 11, 2, 2);
      // Gold nugget highlights
      ctx.fillStyle = '#fef08a';
      px(ctx, 5, 7, '#fef08a'); px(ctx, 10, 9, '#fef08a'); px(ctx, 7, 11, '#fef08a');
      // Sparkle
      px(ctx, 4, 6, '#fef3c7'); px(ctx, 11, 10, '#fef3c7');
      // Dark cracks
      px(ctx, 7, 8, '#451a03'); px(ctx, 9, 11, '#451a03');
    });

    this.registerSprite('node_coal', (ctx) => {
      // Rock matrix
      ctx.fillStyle = '#3f3f46'; ctx.fillRect(3, 5, 10, 9);
      ctx.fillStyle = '#52525b'; ctx.fillRect(4, 6, 8, 7);
      // Coal seams (near-black with a cold sheen)
      ctx.fillStyle = '#18181b';
      ctx.fillRect(5, 7, 4, 3); ctx.fillRect(8, 10, 3, 2); ctx.fillRect(4, 11, 3, 2);
      ctx.fillStyle = '#09090b';
      px(ctx, 6, 8, '#09090b'); px(ctx, 9, 11, '#09090b');
      // Glossy facets
      px(ctx, 5, 7, '#71717a'); px(ctx, 10, 10, '#71717a'); px(ctx, 4, 11, '#71717a');
    });

    this.registerSprite('node_gems', (ctx) => {
      // Rock matrix
      ctx.fillStyle = '#3b0764'; ctx.fillRect(3, 6, 10, 8);
      ctx.fillStyle = '#4c1d95'; ctx.fillRect(4, 7, 8, 6);
      // Faceted crystals poking out
      ctx.fillStyle = '#a855f7'; ctx.fillRect(5, 4, 3, 5);
      ctx.fillStyle = '#c084fc'; ctx.fillRect(6, 5, 1, 3);
      ctx.fillStyle = '#ec4899'; ctx.fillRect(9, 6, 3, 4);
      ctx.fillStyle = '#f9a8d4'; ctx.fillRect(10, 7, 1, 2);
      ctx.fillStyle = '#22d3ee'; ctx.fillRect(7, 10, 2, 3);
      // Sparkles
      px(ctx, 5, 4, '#f5d0fe'); px(ctx, 11, 6, '#fbcfe8'); px(ctx, 8, 10, '#a5f3fc');
    });

    this.registerSprite('node_berry', (ctx) => {
      // Bush foliage
      ctx.fillStyle = '#166534'; ctx.fillRect(2, 5, 12, 9);
      ctx.fillStyle = '#15803d'; ctx.fillRect(3, 4, 10, 8);
      ctx.fillStyle = '#22c55e'; ctx.fillRect(4, 5, 8, 6);
      // Red berries scattered
      ctx.fillStyle = '#ef4444';
      px(ctx, 4, 6, '#ef4444'); px(ctx, 7, 5, '#ef4444'); px(ctx, 10, 7, '#ef4444');
      px(ctx, 5, 9, '#ef4444'); px(ctx, 9, 9, '#ef4444'); px(ctx, 6, 11, '#ef4444');
      // Berry highlights
      px(ctx, 4, 5, '#fca5a5'); px(ctx, 10, 6, '#fca5a5');
      // Leaf detail
      px(ctx, 3, 6, '#16a34a'); px(ctx, 11, 8, '#16a34a');
    });

    // === DISASTER EFFECTS ===

    this.registerSprite('fx_lightning', (ctx) => {
      // Bright core bolt (zig-zag)
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(9, 0, 2, 3);
      ctx.fillRect(7, 2, 3, 2);
      ctx.fillRect(8, 4, 3, 2);
      ctx.fillRect(5, 5, 4, 2);
      ctx.fillRect(6, 7, 3, 2);
      ctx.fillRect(3, 8, 4, 3);
      ctx.fillRect(4, 11, 3, 2);
      ctx.fillRect(2, 12, 3, 3);
      // White hot center
      ctx.fillStyle = '#ffffff';
      px(ctx, 9, 1, '#fff'); px(ctx, 8, 3, '#fff'); px(ctx, 6, 6, '#fff');
      px(ctx, 7, 8, '#fff'); px(ctx, 4, 10, '#fff'); px(ctx, 3, 13, '#fff');
      // Outer glow
      ctx.fillStyle = '#fde68a';
      px(ctx, 8, 0, '#fde68a'); px(ctx, 6, 2, '#fde68a'); px(ctx, 4, 5, '#fde68a');
      px(ctx, 5, 8, '#fde68a'); px(ctx, 1, 12, '#fde68a');
    });

    this.registerSprite('fx_fire', (ctx) => {
      // Flame base (red)
      ctx.fillStyle = '#dc2626'; ctx.fillRect(3, 10, 10, 6);
      ctx.fillStyle = '#ef4444'; ctx.fillRect(4, 8, 8, 4);
      // Middle (orange)
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(5, 6, 6, 4);
      ctx.fillStyle = '#f97316'; ctx.fillRect(4, 7, 8, 3);
      // Tips (yellow)
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(6, 3, 4, 4);
      ctx.fillStyle = '#fde047'; ctx.fillRect(7, 1, 2, 3);
      // White hot core
      ctx.fillStyle = '#fef08a'; ctx.fillRect(7, 5, 2, 3);
      px(ctx, 7, 2, '#fef3c7');
      // Flame tongues
      px(ctx, 4, 6, '#ef4444'); px(ctx, 11, 7, '#f59e0b');
      px(ctx, 3, 9, '#dc2626'); px(ctx, 12, 10, '#dc2626');
      // Embers
      px(ctx, 2, 5, '#f59e0b'); px(ctx, 13, 4, '#fbbf24');
    });

    this.registerSprite('fx_tornado', (ctx) => {
      // Wide top
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(1, 1, 14, 3);
      ctx.fillStyle = '#cbd5e1'; ctx.fillRect(2, 2, 12, 1);
      // Narrowing body
      ctx.fillStyle = '#64748b'; ctx.fillRect(3, 4, 10, 3);
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(4, 5, 8, 1);
      ctx.fillStyle = '#475569'; ctx.fillRect(5, 7, 6, 3);
      ctx.fillStyle = '#64748b'; ctx.fillRect(6, 8, 4, 1);
      // Narrow bottom
      ctx.fillStyle = '#334155'; ctx.fillRect(6, 10, 4, 3);
      ctx.fillStyle = '#475569'; ctx.fillRect(7, 11, 2, 1);
      ctx.fillRect(7, 13, 2, 2);
      // Debris dots
      px(ctx, 2, 2, '#78350f'); px(ctx, 12, 3, '#15803d');
      px(ctx, 4, 6, '#92400e'); px(ctx, 10, 8, '#64748b');
      px(ctx, 7, 12, '#475569');
    });

    this.registerSprite('fx_meteor', (ctx) => {
      // Fire trail (top-left to center)
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(1, 1, 5, 3);
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(2, 2, 4, 2);
      ctx.fillStyle = '#dc2626'; ctx.fillRect(0, 0, 3, 2);
      // Rock core
      ctx.fillStyle = '#78350f'; ctx.fillRect(5, 4, 7, 7);
      ctx.fillStyle = '#92400e'; ctx.fillRect(6, 5, 5, 5);
      // Hot cracks in rock
      ctx.fillStyle = '#f59e0b';
      px(ctx, 7, 6, '#f59e0b'); px(ctx, 9, 8, '#fbbf24');
      // Dark rocky surface
      ctx.fillStyle = '#451a03'; ctx.fillRect(7, 7, 3, 3);
      // Trailing sparks
      px(ctx, 0, 3, '#fde047'); px(ctx, 3, 1, '#fef08a'); px(ctx, 1, 4, '#f59e0b');
      // Impact glow
      ctx.fillStyle = '#ef4444'; ctx.fillRect(8, 11, 4, 3);
    });

    this.registerSprite('fx_plague', (ctx) => {
      // Toxic cloud
      ctx.fillStyle = 'rgba(34, 197, 94, 0.6)';
      ctx.fillRect(2, 3, 12, 10);
      ctx.fillStyle = 'rgba(22, 163, 74, 0.5)';
      ctx.fillRect(3, 2, 10, 8);
      ctx.fillStyle = 'rgba(21, 128, 61, 0.4)';
      ctx.fillRect(4, 4, 8, 6);
      // Skull silhouette inside cloud
      ctx.fillStyle = 'rgba(5, 46, 22, 0.7)';
      ctx.fillRect(5, 5, 6, 5);
      // Eye sockets
      ctx.fillStyle = 'rgba(74, 222, 128, 0.8)';
      px(ctx, 6, 6, 'rgba(74, 222, 128, 0.8)'); px(ctx, 9, 6, 'rgba(74, 222, 128, 0.8)');
      // Dripping wisps
      px(ctx, 3, 12, 'rgba(34, 197, 94, 0.3)');
      px(ctx, 7, 13, 'rgba(34, 197, 94, 0.3)');
      px(ctx, 11, 12, 'rgba(34, 197, 94, 0.3)');
    });

    // === LEGENDARY ITEMS ===

    this.registerSprite('item_sunfire_blade', (ctx) => {
      // Blade
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(7, 1, 2, 8);
      ctx.fillStyle = '#fde047'; px(ctx, 7, 1, '#fde047'); px(ctx, 8, 2, '#fef08a');
      // Blade edge glow
      px(ctx, 6, 2, '#fef3c7'); px(ctx, 9, 3, '#fef3c7');
      // Cross-guard (sunburst)
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(4, 9, 8, 2);
      ctx.fillStyle = '#d97706'; px(ctx, 4, 9, '#d97706'); px(ctx, 11, 9, '#d97706');
      // Hilt
      ctx.fillStyle = '#78350f'; ctx.fillRect(7, 11, 2, 3);
      // Pommel
      ctx.fillStyle = '#ef4444'; ctx.fillRect(7, 14, 2, 1);
      // Sun glow
      px(ctx, 6, 0, '#fef3c7'); px(ctx, 9, 0, '#fef3c7');
    });

    this.registerSprite('item_dragon_armor', (ctx) => {
      // Chestplate
      ctx.fillStyle = '#b91c1c'; ctx.fillRect(3, 3, 10, 9);
      ctx.fillStyle = '#dc2626'; ctx.fillRect(4, 4, 8, 7);
      // Scale pattern
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(4, 5, 2, 1); ctx.fillRect(8, 5, 2, 1);
      ctx.fillRect(5, 7, 2, 1); ctx.fillRect(9, 7, 2, 1);
      ctx.fillRect(4, 9, 2, 1); ctx.fillRect(8, 9, 2, 1);
      // Golden trim
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(3, 3, 10, 1); ctx.fillRect(3, 11, 10, 1);
      ctx.fillRect(3, 3, 1, 9); ctx.fillRect(12, 3, 1, 9);
      // Central dragon emblem
      ctx.fillStyle = '#fde047'; ctx.fillRect(6, 6, 4, 3);
      px(ctx, 7, 6, '#fef08a'); px(ctx, 8, 7, '#fef08a');
      // Shoulder guards
      ctx.fillStyle = '#7f1d1d'; ctx.fillRect(2, 3, 2, 3); ctx.fillRect(12, 3, 2, 3);
    });

    this.registerSprite('item_aether_bow', (ctx) => {
      // Bow limb (curved via px)
      ctx.fillStyle = '#7c3aed';
      ctx.fillRect(3, 1, 1, 3); ctx.fillRect(2, 3, 1, 3);
      ctx.fillRect(2, 6, 1, 2); ctx.fillRect(3, 8, 1, 3);
      ctx.fillRect(3, 11, 1, 3); ctx.fillRect(4, 13, 1, 2);
      // Limb highlight
      ctx.fillStyle = '#a78bfa';
      px(ctx, 3, 2, '#a78bfa'); px(ctx, 2, 5, '#a78bfa'); px(ctx, 3, 9, '#a78bfa');
      px(ctx, 3, 12, '#a78bfa');
      // String (thin white line)
      ctx.fillStyle = '#e9d5ff';
      ctx.fillRect(9, 1, 1, 14);
      // Arrow nocked
      ctx.fillStyle = '#92400e'; ctx.fillRect(5, 7, 7, 1);
      ctx.fillStyle = '#94a3b8'; ctx.fillRect(11, 7, 2, 1); // Arrowhead
      // Magic glow particles
      px(ctx, 1, 0, '#c4b5fd'); px(ctx, 5, 14, '#c4b5fd'); px(ctx, 8, 3, '#e9d5ff');
    });

    this.registerSprite('item_iron_shield', (ctx) => {
      // Shield body
      ctx.fillStyle = '#475569'; ctx.fillRect(3, 2, 10, 12);
      ctx.fillStyle = '#64748b'; ctx.fillRect(4, 3, 8, 10);
      // Border rivets
      ctx.fillStyle = '#94a3b8';
      px(ctx, 3, 3, '#94a3b8'); px(ctx, 12, 3, '#94a3b8');
      px(ctx, 3, 13, '#94a3b8'); px(ctx, 12, 13, '#94a3b8');
      px(ctx, 7, 2, '#94a3b8'); px(ctx, 8, 2, '#94a3b8');
      // Blue gemstone center
      ctx.fillStyle = '#2563eb'; ctx.fillRect(6, 6, 4, 4);
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(7, 7, 2, 2);
      // Gem sparkle
      px(ctx, 7, 6, '#93c5fd');
      // Cross pattern
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(7, 3, 2, 3); ctx.fillRect(7, 10, 2, 3);
      ctx.fillRect(4, 7, 3, 2); ctx.fillRect(10, 7, 3, 2);
    });

    // === EXTRA FAUNA ===

    this.registerSprite('species_rabbit', (ctx) => {
      // Ears (long)
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(5, 1, 2, 5); ctx.fillRect(9, 1, 2, 5);
      // Inner ear (pink)
      px(ctx, 5, 2, '#fda4af'); px(ctx, 9, 2, '#fda4af');
      px(ctx, 5, 3, '#fda4af'); px(ctx, 9, 3, '#fda4af');
      // Body
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(4, 6, 8, 6);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(5, 7, 6, 4);
      // Eyes
      px(ctx, 6, 7, '#18181b'); px(ctx, 9, 7, '#18181b');
      // Nose
      px(ctx, 7, 8, '#fda4af'); px(ctx, 8, 8, '#fda4af');
      // Cottontail
      ctx.fillStyle = '#ffffff'; ctx.fillRect(11, 9, 2, 2);
      // Paws
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(5, 12, 2, 2); ctx.fillRect(9, 12, 2, 2);
    });

    this.registerSprite('species_bird', (ctx) => {
      // Body
      ctx.fillStyle = '#2563eb'; ctx.fillRect(5, 6, 6, 5);
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(6, 7, 4, 3);
      // Wings spread
      ctx.fillStyle = '#1d4ed8'; ctx.fillRect(1, 4, 5, 4); ctx.fillRect(10, 4, 5, 4);
      ctx.fillStyle = '#2563eb'; ctx.fillRect(2, 5, 4, 2); ctx.fillRect(10, 5, 4, 2);
      // Wing tips
      px(ctx, 1, 4, '#1e40af'); px(ctx, 14, 4, '#1e40af');
      // Head
      ctx.fillStyle = '#3b82f6'; ctx.fillRect(6, 4, 4, 3);
      // Eye
      px(ctx, 7, 5, '#18181b');
      // Beak
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(5, 6, 2, 1);
      // Belly (lighter)
      ctx.fillStyle = '#93c5fd'; ctx.fillRect(6, 9, 4, 2);
      // Tail feathers
      ctx.fillStyle = '#1e40af'; ctx.fillRect(9, 10, 3, 2);
    });

    this.registerSprite('species_golem', (ctx) => {
      // Head (blocky)
      ctx.fillStyle = '#475569'; ctx.fillRect(4, 1, 8, 5);
      ctx.fillStyle = '#64748b'; ctx.fillRect(5, 2, 6, 3);
      // Rune eyes (purple glow)
      px(ctx, 6, 3, '#a855f7'); px(ctx, 9, 3, '#a855f7');
      px(ctx, 6, 2, '#c4b5fd'); px(ctx, 9, 2, '#c4b5fd');
      // Body (massive stone)
      ctx.fillStyle = '#475569'; ctx.fillRect(2, 6, 12, 7);
      ctx.fillStyle = '#64748b'; ctx.fillRect(3, 6, 10, 6);
      // Rune on chest
      ctx.fillStyle = '#a855f7'; ctx.fillRect(6, 8, 4, 3);
      px(ctx, 7, 9, '#c4b5fd');
      // Rock cracks
      px(ctx, 4, 7, '#334155'); px(ctx, 10, 9, '#334155'); px(ctx, 6, 11, '#334155');
      // Arms (thick)
      ctx.fillStyle = '#334155'; ctx.fillRect(0, 7, 3, 5); ctx.fillRect(13, 7, 3, 5);
      // Fists
      ctx.fillStyle = '#475569'; ctx.fillRect(0, 11, 3, 2); ctx.fillRect(13, 11, 3, 2);
      // Legs
      ctx.fillStyle = '#334155'; ctx.fillRect(4, 13, 3, 3); ctx.fillRect(9, 13, 3, 3);
    });

    // === KINGDOM BADGES ===

    this.registerSprite('badge_shield', (ctx) => {
      // Shield shape (white, tinted by kingdom color at render time)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(3, 1, 10, 10);
      ctx.fillRect(4, 11, 8, 2);
      ctx.fillRect(5, 13, 6, 1);
      ctx.fillRect(6, 14, 4, 1);
      ctx.fillRect(7, 15, 2, 1);
      // Border
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(3, 1, 10, 1); ctx.fillRect(3, 1, 1, 10);
      ctx.fillRect(12, 1, 1, 10);
    });

    this.registerSprite('badge_crown', (ctx) => {
      // Crown base
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(3, 8, 10, 4);
      // Crown peaks
      ctx.fillRect(3, 4, 2, 5); ctx.fillRect(7, 3, 2, 6); ctx.fillRect(11, 4, 2, 5);
      // Jewels
      px(ctx, 4, 5, '#ef4444'); px(ctx, 8, 4, '#3b82f6'); px(ctx, 12, 5, '#22c55e');
      // Gold shine
      ctx.fillStyle = '#fde047';
      ctx.fillRect(4, 8, 8, 1);
    });

    this.registerSprite('badge_war', (ctx) => {
      // Crossed swords
      ctx.fillStyle = '#ef4444';
      // Sword 1 (diagonal TL to BR)
      ctx.fillRect(2, 2, 2, 2); ctx.fillRect(4, 4, 2, 2); ctx.fillRect(6, 6, 2, 2);
      ctx.fillRect(8, 8, 2, 2); ctx.fillRect(10, 10, 2, 2); ctx.fillRect(12, 12, 2, 2);
      // Sword 2 (diagonal TR to BL)
      ctx.fillRect(12, 2, 2, 2); ctx.fillRect(10, 4, 2, 2); ctx.fillRect(8, 4, 2, 2);
      ctx.fillRect(4, 8, 2, 2); ctx.fillRect(2, 10, 2, 2);
      // Hilts
      ctx.fillStyle = '#92400e';
      ctx.fillRect(1, 1, 2, 1); ctx.fillRect(13, 1, 2, 1);
      ctx.fillRect(1, 12, 2, 2); ctx.fillRect(13, 12, 2, 2);
    });

    this.registerSprite('badge_peace', (ctx) => {
      // Olive branch
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(3, 4, 2, 1); ctx.fillRect(5, 5, 2, 1); ctx.fillRect(7, 6, 2, 1);
      ctx.fillRect(9, 7, 2, 1); ctx.fillRect(11, 8, 2, 1);
      // Leaves
      ctx.fillStyle = '#15803d';
      px(ctx, 3, 3, '#15803d'); px(ctx, 6, 4, '#15803d'); px(ctx, 9, 6, '#15803d');
      px(ctx, 12, 7, '#15803d');
      px(ctx, 4, 5, '#15803d'); px(ctx, 7, 7, '#15803d'); px(ctx, 10, 9, '#15803d');
      // Dove body
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(5, 8, 6, 4);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(6, 9, 4, 2);
      // Wing
      ctx.fillStyle = '#ffffff'; ctx.fillRect(3, 7, 4, 2);
      // Eye
      px(ctx, 6, 9, '#18181b');
      // Beak
      px(ctx, 5, 10, '#f59e0b');
    });

    this.registerSprite('badge_alliance', (ctx) => {
      // Two clasped hands
      // Left hand
      ctx.fillStyle = '#fcd34d'; ctx.fillRect(2, 6, 5, 5);
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(3, 5, 4, 2);
      // Right hand
      ctx.fillStyle = '#a7f3d0'; ctx.fillRect(9, 6, 5, 5);
      ctx.fillStyle = '#86efac'; ctx.fillRect(9, 5, 4, 2);
      // Clasped center
      ctx.fillStyle = '#fde68a'; ctx.fillRect(6, 7, 4, 3);
      // Fingers interlock
      px(ctx, 6, 6, '#fbbf24'); px(ctx, 9, 6, '#86efac');
      px(ctx, 7, 10, '#fbbf24'); px(ctx, 8, 10, '#86efac');
    });
  }
}

// Pre-initialize sprite cache
SpriteRegistry.initializeAllTransparentSprites();
