export enum SpeciesType {
  LUMINI = 'lumini',       // Versatile, diplomatic, sun-affinity
  SYLVANII = 'sylvanii',   // Fast, forest regenerators, archers
  STONEKIN = 'stonekin',   // Mountain miners, tanky warriors
  EMBERKIN = 'emberkin',   // Flame-resistant, aggressive conquerors
  DEER = 'deer',
  WOLF = 'wolf',
  BEAR = 'bear',
  DRAGON = 'dragon',
  BOAR = 'boar',
  EAGLE = 'eagle',
  MAMMOTH = 'mammoth'
}

export interface SpeciesConfig {
  id: SpeciesType;
  name: string;
  isHumanoid: boolean;
  baseHp: number;
  baseSpeed: number;
  baseDamage: number;
  baseDefense: number;
  maxAge: number;
  /** Years between conception and birth. Mother carries the child during this time. */
  gestationYears?: number;
  primaryColor: string;
  buildingStyle: string;
  urbanGridStyle?: 'concentric_rings' | 'organic_canopy' | 'orthogonal_citadel' | 'diagonal_chevron';
  urbanGridName?: string;
  preferredBiomes: string[];
  advantage?: string;
  disadvantage?: string;
}

export const SPECIES_DEFINITIONS: Record<SpeciesType, SpeciesConfig> = {
  [SpeciesType.LUMINI]: {
    id: SpeciesType.LUMINI,
    name: 'Lumini',
    isHumanoid: true,
    baseHp: 100,
    baseSpeed: 1.05,
    baseDamage: 9,
    baseDefense: 4,
    maxAge: 85,
    gestationYears: 1,
    primaryColor: '#fbbf24',
    buildingStyle: 'Pedra Dourada',
    urbanGridStyle: 'concentric_rings',
    urbanGridName: 'Grid Radial Solar em Anéis Concêntricos',
    preferredBiomes: ['grass', 'soil'],
    advantage: '☀️ +30% Pesquisa & +25% Ouro Comercial (Cura Solar)',
    disadvantage: '🛡️ -15% Ataque/Defesa Física & +20% Custo de Vida'
  },
  [SpeciesType.SYLVANII]: {
    id: SpeciesType.SYLVANII,
    name: 'Sylvanii',
    isHumanoid: true,
    baseHp: 75,
    baseSpeed: 1.35,
    baseDamage: 11,
    baseDefense: 3,
    maxAge: 130,
    gestationYears: 2,
    primaryColor: '#34d399',
    buildingStyle: 'Madeira Viva',
    urbanGridStyle: 'organic_canopy',
    urbanGridName: 'Grid Orgânico Fluvial em Espirais da Natureza',
    preferredBiomes: ['forest', 'arcane'],
    advantage: '🏹 Arquearia Longa, +35% Velocidade & +50% Madeira',
    disadvantage: '💔 -25% Vida Máxima & Vulnerabilidade a Fogo'
  },
  [SpeciesType.STONEKIN]: {
    id: SpeciesType.STONEKIN,
    name: 'Stonekin',
    isHumanoid: true,
    baseHp: 150,
    baseSpeed: 0.75,
    baseDamage: 15,
    baseDefense: 12,
    maxAge: 110,
    gestationYears: 1,
    primaryColor: '#94a3b8',
    buildingStyle: 'Cidadela Fortificada',
    urbanGridStyle: 'orthogonal_citadel',
    urbanGridName: 'Grid Ortogonal de Cidadela Quadrada',
    preferredBiomes: ['mountain', 'tundra'],
    advantage: '🏰 Tanques Massivos (150 HP/12 Def) & +50% Mineração',
    disadvantage: '🐢 -25% Velocidade & -20% Taxa de Natalidade'
  },
  [SpeciesType.EMBERKIN]: {
    id: SpeciesType.EMBERKIN,
    name: 'Emberkin',
    isHumanoid: true,
    baseHp: 115,
    baseSpeed: 1.10,
    baseDamage: 14,
    baseDefense: 6,
    maxAge: 65,
    gestationYears: 1,
    primaryColor: '#f97316',
    buildingStyle: 'Forja Volcânica',
    urbanGridStyle: 'diagonal_chevron',
    urbanGridName: 'Grid Hexagonal em Chevron Volcânico',
    preferredBiomes: ['savanna', 'corrupted', 'sand'],
    advantage: '🔥 Piromancy, Imunidade a Fogo/Lava & +30% Dano de Cerco',
    disadvantage: '⏳ Vida Curta (65 anos) & Penalidade Diplomática'
  },
  [SpeciesType.DEER]: {
    id: SpeciesType.DEER,
    name: 'Veado Selvagem',
    isHumanoid: false,
    baseHp: 40,
    baseSpeed: 1.4,
    baseDamage: 0,
    baseDefense: 0,
    maxAge: 20,
    gestationYears: 1,
    primaryColor: '#d97706',
    buildingStyle: 'nenhum',
    preferredBiomes: ['forest', 'grass']
  },
  [SpeciesType.WOLF]: {
    id: SpeciesType.WOLF,
    name: 'Lobo Selvagem',
    isHumanoid: false,
    baseHp: 65,
    baseSpeed: 1.3,
    baseDamage: 12,
    baseDefense: 2,
    maxAge: 18,
    gestationYears: 1,
    primaryColor: '#64748b',
    buildingStyle: 'nenhum',
    preferredBiomes: ['forest', 'tundra']
  },
  [SpeciesType.BEAR]: {
    id: SpeciesType.BEAR,
    name: 'Urso Selvagem',
    isHumanoid: false,
    baseHp: 150,
    baseSpeed: 0.8,
    baseDamage: 22,
    baseDefense: 8,
    maxAge: 30,
    gestationYears: 1,
    primaryColor: '#78350f',
    buildingStyle: 'nenhum',
    preferredBiomes: ['forest', 'mountain']
  },
  [SpeciesType.DRAGON]: {
    id: SpeciesType.DRAGON,
    name: 'Dragão Ancião (Boss)',
    isHumanoid: false,
    baseHp: 1200,
    baseSpeed: 1.2,
    baseDamage: 65,
    baseDefense: 25,
    maxAge: 500,
    gestationYears: 3,
    primaryColor: '#ef4444',
    buildingStyle: 'Ninho Volcânico',
    preferredBiomes: ['mountain', 'savanna', 'corrupted']
  },
  [SpeciesType.BOAR]: {
    id: SpeciesType.BOAR,
    name: 'Javali Selvagem',
    isHumanoid: false,
    baseHp: 75,
    baseSpeed: 1.2,
    baseDamage: 10,
    baseDefense: 3,
    maxAge: 22,
    gestationYears: 1,
    primaryColor: '#78350f',
    buildingStyle: 'nenhum',
    preferredBiomes: ['forest', 'savanna']
  },
  [SpeciesType.EAGLE]: {
    id: SpeciesType.EAGLE,
    name: 'Águia Imperial',
    isHumanoid: false,
    baseHp: 35,
    baseSpeed: 1.8,
    baseDamage: 8,
    baseDefense: 1,
    maxAge: 25,
    gestationYears: 1,
    primaryColor: '#fbbf24',
    buildingStyle: 'nenhum',
    preferredBiomes: ['mountain', 'grass']
  },
  [SpeciesType.MAMMOTH]: {
    id: SpeciesType.MAMMOTH,
    name: 'Mamute Ancião',
    isHumanoid: false,
    baseHp: 250,
    baseSpeed: 0.65,
    baseDamage: 28,
    baseDefense: 12,
    maxAge: 70,
    gestationYears: 2,
    primaryColor: '#451a03',
    buildingStyle: 'nenhum',
    preferredBiomes: ['tundra', 'snow']
  }
};
