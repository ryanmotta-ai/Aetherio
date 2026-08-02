export interface EntityNeeds {
  hunger: number;     // 0 (full) to 100 (starving)
  safety: number;     // 0 (danger) to 100 (safe)
  shelter: boolean;   // Has home or town
}

export type Profession = 'farmer' | 'woodcutter' | 'miner' | 'builder' | 'soldier' | 'archer' | 'scout' | 'healer' | 'leader' | 'king' | 'none';

export type PersonalityType = 'ambitious' | 'diplomatic' | 'aggressive' | 'paranoid' | 'peaceful' | 'greedy';

/** AI behavioral state machine states */
export type AIState =
  | 'idle'           // Standing still, breathing
  | 'wander'         // Random exploration
  | 'patrol'         // Walking guard route near city
  | 'gather_wood'    // Moving to forest (visual workplace)
  | 'gather_food'    // Moving to farm (visual workplace)
  | 'gather_ore'     // Moving to mine (visual workplace)
  | 'return_city'    // Carrying resources back to city
  | 'build'          // Constructing building
  | 'hunt'           // Chasing prey (fauna)
  | 'attack'         // Engaging enemy combatant
  | 'flee'           // Running from danger
  | 'heal'           // Resting to recover HP
  | 'socialize'      // Moving toward friendly entity
  | 'explore'        // Scouting unknown territory
  | 'defend_city'    // Moving to defend city under attack
  | 'raid'           // Moving to attack enemy territory
  | 'forage'         // Animals eating
  | 'pack_hunt'      // Coordinated wolf pack behavior
  | 'sleep'          // Resting at home during night
  | 'return_home'    // Walking home at dusk
  | 'go_to_work';    // Walking to workplace at dawn
