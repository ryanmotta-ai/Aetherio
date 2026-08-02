import { SimulationEngine } from '../src/ai/EntityAI';
import { TileMap } from '../src/world/TileMap';
import { ParticleManager } from '../src/renderer/Particles';
import { BUILDINGS } from '../src/civ/Building';
import { TECHNOLOGIES } from '../src/civ/TechTree';

console.log('=== ECONOMY & NAVAL DIAGNOSTIC RUN (500 TICKS / 5 YEARS) ===\n');

const tileMap = new TileMap(100, 100, 'archipelago');

const sim = new SimulationEngine();
const particles = new ParticleManager();

// Spawn 4 settlements for different species
sim.spawnEntity('lumini' as any, 25, 25, tileMap);
sim.spawnEntity('lumini' as any, 26, 25, tileMap);
sim.spawnEntity('lumini' as any, 25, 26, tileMap);

sim.spawnEntity('sylvanii' as any, 75, 25, tileMap);
sim.spawnEntity('sylvanii' as any, 76, 25, tileMap);
sim.spawnEntity('sylvanii' as any, 75, 26, tileMap);

sim.spawnEntity('stonekin' as any, 25, 75, tileMap);
sim.spawnEntity('stonekin' as any, 26, 75, tileMap);

sim.spawnEntity('emberkin' as any, 75, 75, tileMap);
sim.spawnEntity('emberkin' as any, 76, 75, tileMap);

// Fast-forward 500 ticks (5 years)
for (let tick = 1; tick <= 500; tick++) {
  sim.tickAI(tileMap, particles);
}

console.log('--- DIAGNOSTIC RESULTS AFTER 5 YEARS ---');
console.log(`Year: ${sim.currentYear}`);
console.log(`Total Kingdoms: ${sim.kingdoms.size}`);
console.log(`Total Cities: ${sim.cities.size}`);

for (const kingdom of sim.kingdoms.values()) {
  console.log(`\n👑 Kingdom: ${kingdom.name} (${kingdom.species})`);
  console.log(`   - Gold: ${kingdom.treasury.get('gold')}`);
  console.log(`   - Tech Known: ${[...kingdom.research.known].join(', ')}`);
  console.log(`   - Current Research: ${kingdom.research.current} (${kingdom.research.progress} pts)`);
  console.log(`   - Unlocked Buildings: ${[...kingdom.research.unlockedBuildings()].join(', ')}`);
}

for (const city of sim.cities.values()) {
  console.log(`\n🏰 City: ${city.name} (Pop: ${city.population})`);
  console.log(`   - Buildings Built: ${[...city.buildings.values()].map(b => b.type).join(', ')}`);
  console.log(`   - Stockpile: Wood=${city.stock.get('wood')}, Stone=${city.stock.get('stone')}, Food=${city.stock.get('food')}, Iron=${city.stock.get('iron')}`);
}

console.log('\n🌐 TRADE & NAVAL STATUS:');
console.log(`   - Trade Agreements: ${sim.trade.agreements.size}`);
console.log(`   - Trade Routes: ${sim.trade.routes.size}`);
console.log(`   - Active Ships: ${sim.naval.activeShips.size}`);
console.log(`   - Active Caravans: ${sim.caravans.activeCaravans.size}`);
