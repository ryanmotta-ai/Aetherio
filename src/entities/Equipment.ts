export type ItemType = 'weapon' | 'armor' | 'accessory';
export type WeaponCategory = 'melee' | 'ranged' | 'siege' | 'magic';

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  category?: WeaponCategory;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  damageBonus: number;
  defenseBonus: number;
  hpBonus: number;
  attackRange?: number; // Melee = 1.8, Ranged = 5.5, Siege = 8
  techRequired?: string;
}

export const WEAPON_TIERS: Record<string, Omit<Item, 'id'>[]> = {
  primitive: [
    { name: 'Wooden Spear', type: 'weapon', category: 'melee', rarity: 'common', damageBonus: 4, defenseBonus: 1, hpBonus: 0, attackRange: 2.2 },
    { name: 'Stone Club', type: 'weapon', category: 'melee', rarity: 'common', damageBonus: 6, defenseBonus: 0, hpBonus: 0, attackRange: 1.8 },
    { name: 'Hunting Sling', type: 'weapon', category: 'ranged', rarity: 'common', damageBonus: 3, defenseBonus: 0, hpBonus: 0, attackRange: 4.5 }
  ],
  iron: [
    { name: 'Iron Broadsword', type: 'weapon', category: 'melee', rarity: 'uncommon', damageBonus: 12, defenseBonus: 3, hpBonus: 10, attackRange: 1.8 },
    { name: 'War Crossbow', type: 'weapon', category: 'ranged', rarity: 'uncommon', damageBonus: 14, defenseBonus: 0, hpBonus: 0, attackRange: 5.5 },
    { name: 'Iron Halberd', type: 'weapon', category: 'melee', rarity: 'uncommon', damageBonus: 15, defenseBonus: 4, hpBonus: 15, attackRange: 2.5 }
  ],
  steel: [
    { name: 'Steel Greatsword', type: 'weapon', category: 'melee', rarity: 'rare', damageBonus: 22, defenseBonus: 6, hpBonus: 25, attackRange: 2.0 },
    { name: 'Composite Longbow', type: 'weapon', category: 'ranged', rarity: 'rare', damageBonus: 20, defenseBonus: 0, hpBonus: 10, attackRange: 6.0 },
    { name: 'Siege Catapult', type: 'weapon', category: 'siege', rarity: 'rare', damageBonus: 45, defenseBonus: 0, hpBonus: 50, attackRange: 8.0 }
  ]
};

export const ARMOR_TIERS: Record<string, Omit<Item, 'id'>[]> = {
  primitive: [
    { name: 'Leather Hide Vest', type: 'armor', rarity: 'common', damageBonus: 0, defenseBonus: 3, hpBonus: 10 }
  ],
  iron: [
    { name: 'Iron Chainmail', type: 'armor', rarity: 'uncommon', damageBonus: 0, defenseBonus: 8, hpBonus: 30 },
    { name: 'Iron Heater Shield', type: 'armor', rarity: 'rare', damageBonus: 0, defenseBonus: 12, hpBonus: 45 }
  ],
  steel: [
    { name: 'Full Steel Plate Mail', type: 'armor', rarity: 'rare', damageBonus: 2, defenseBonus: 18, hpBonus: 80 }
  ]
};

export const LEGENDARY_ITEMS: Omit<Item, 'id'>[] = [
  { name: 'Sunfire Blade', type: 'weapon', category: 'melee', rarity: 'legendary', damageBonus: 35, defenseBonus: 8, hpBonus: 50, attackRange: 2.0 },
  { name: 'Dragon Scale Armor', type: 'armor', rarity: 'legendary', damageBonus: 5, defenseBonus: 28, hpBonus: 120 },
  { name: 'Aether Bow of Lumos', type: 'weapon', category: 'ranged', rarity: 'legendary', damageBonus: 38, defenseBonus: 0, hpBonus: 30, attackRange: 7.0 },
  { name: 'Ironheart Citadel Shield', type: 'armor', rarity: 'rare', damageBonus: 0, defenseBonus: 22, hpBonus: 75 },
  { name: 'Emberkin Forge Hammer', type: 'weapon', category: 'melee', rarity: 'rare', damageBonus: 26, defenseBonus: 6, hpBonus: 30, attackRange: 2.0 }
];
