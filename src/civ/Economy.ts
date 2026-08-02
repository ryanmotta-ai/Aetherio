import { GoodId, GOODS, ALL_GOODS } from './Goods';
import { SpeciesType } from '../entities/Species';
import { rng } from '../core/Random';

/**
 * Money, prices and national accounts.
 *
 * Before the `currency` technology a realm barters — its treasury is measured in
 * raw gold. Once currency is minted the realm gets a named money whose value
 * floats against every other realm's, driven by how much gold backs it and how
 * much of it has been printed.
 */

// ============================ CURRENCY ============================

const CURRENCY_ROOTS: Record<SpeciesType, string[]> = {
  [SpeciesType.LUMINI]: ['Sol', 'Auren', 'Lumen', 'Radia', 'Helio'],
  [SpeciesType.SYLVANII]: ['Leaf', 'Verdan', 'Thorn', 'Silva', 'Bloom'],
  [SpeciesType.STONEKIN]: ['Grani', 'Ingot', 'Forge', 'Anvil', 'Basalt'],
  [SpeciesType.EMBERKIN]: ['Ember', 'Ash', 'Pyre', 'Cinder', 'Scoria'],
  [SpeciesType.DEER]: ['Fawn'],
  [SpeciesType.WOLF]: ['Fang'],
  [SpeciesType.BEAR]: ['Claw'],
  [SpeciesType.DRAGON]: ['Hoard'],
  [SpeciesType.BOAR]: ['Tusk'],
  [SpeciesType.EAGLE]: ['Talon'],
  [SpeciesType.MAMMOTH]: ['Ivory']
};

const CURRENCY_SUFFIXES = ['mark', 'crown', 'denar', 'talent', 'shilling', 'florin', 'ducat', 'stater'];
const CURRENCY_SYMBOLS = ['₳', '₡', '₢', '₤', '₥', '₦', '₩', '₫', '₭', '₮', '₰', '₲', '₴', '₸', '₼'];

let symbolIndex = 0;

export interface Currency {
  name: string;
  symbol: string;
  /** Year the mint opened. */
  foundedYear: number;
  /** Value of one unit in abstract world units. Floats with gold backing and money supply. */
  value: number;
  /** Units in circulation. Printing money without gold devalues it. */
  supply: number;
  /** Year-on-year change in value, as a fraction. Positive means the money is losing worth. */
  inflation: number;
}

export function mintCurrency(species: SpeciesType, kingdomName: string, year: number): Currency {
  const roots = CURRENCY_ROOTS[species] ?? ['Coin'];
  const root = rng.pick(roots);
  const suffix = rng.pick(CURRENCY_SUFFIXES);
  const symbol = CURRENCY_SYMBOLS[symbolIndex++ % CURRENCY_SYMBOLS.length];

  // Half the time the money is named after the realm instead of the species.
  const realmWord = kingdomName.split(' ').pop() ?? root;
  const name = rng.chance(0.5) ? `${root} ${suffix}` : `${realmWord} ${suffix}`;

  return {
    name,
    symbol,
    foundedYear: year,
    value: 1,
    supply: 500,
    inflation: 0
  };
}

// ============================ WORLD MARKET ============================

interface MarketEntry {
  price: number;
  /** Units offered for sale across all realms this year. */
  supply: number;
  /** Units realms wanted to buy this year. */
  demand: number;
  /** Rolling price history for the economy screen. */
  history: number[];
}

const MAX_PRICE_HISTORY = 120;

/**
 * A single global market that all realms trade against.
 * Prices move toward whatever clears supply against demand, with the base price
 * acting as a gravity well so nothing runs away entirely.
 */
export class WorldMarket {
  private entries: Map<GoodId, MarketEntry> = new Map();
  public year: number = 1;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.entries.clear();
    for (const good of ALL_GOODS) {
      this.entries.set(good, {
        price: GOODS[good].basePrice,
        supply: 0,
        demand: 0,
        history: [GOODS[good].basePrice]
      });
    }
  }

  public price(good: GoodId): number {
    return this.entries.get(good)?.price ?? GOODS[good].basePrice;
  }

  public priceHistory(good: GoodId): number[] {
    return this.entries.get(good)?.history ?? [];
  }

  public supplyOf(good: GoodId): number {
    return this.entries.get(good)?.supply ?? 0;
  }

  public demandOf(good: GoodId): number {
    return this.entries.get(good)?.demand ?? 0;
  }

  /** Called by producers so the market knows what exists this year. */
  public reportSupply(good: GoodId, amount: number): void {
    const entry = this.entries.get(good);
    if (entry) entry.supply += amount;
  }

  /** Called by consumers so the market knows what is wanted this year. */
  public reportDemand(good: GoodId, amount: number): void {
    const entry = this.entries.get(good);
    if (entry) entry.demand += amount;
  }

  /** Value of a basket of goods at current prices. */
  public valueOf(goods: Partial<Record<GoodId, number>>): number {
    let total = 0;
    for (const [good, amount] of Object.entries(goods)) {
      total += this.price(good as GoodId) * (amount as number);
    }
    return total;
  }

  /** Settles the year: prices move, then supply and demand reset. */
  public settle(year: number): void {
    this.year = year;

    for (const good of ALL_GOODS) {
      const entry = this.entries.get(good)!;
      const base = GOODS[good].basePrice;

      // Ratio above 1 means scarcity. Clamped so a single year cannot dominate.
      const ratio = (entry.demand + 1) / (entry.supply + 1);
      const target = base * Math.max(0.35, Math.min(3.2, Math.pow(ratio, 0.6)));

      // Prices are sticky — they drift toward the clearing price rather than jumping.
      entry.price += (target - entry.price) * 0.25;
      entry.price = Math.max(base * 0.3, Math.min(base * 4, entry.price));

      entry.history.push(Math.round(entry.price * 100) / 100);
      if (entry.history.length > MAX_PRICE_HISTORY) entry.history.shift();

      entry.supply = 0;
      entry.demand = 0;
    }
  }

  public serialize(): any {
    const out: Record<string, any> = {};
    for (const [good, entry] of this.entries) {
      out[good] = { price: entry.price, history: entry.history };
    }
    return { year: this.year, entries: out };
  }

  public deserialize(data: any): void {
    this.reset();
    if (!data?.entries) return;
    this.year = data.year ?? 1;
    for (const [good, saved] of Object.entries<any>(data.entries)) {
      const entry = this.entries.get(good as GoodId);
      if (!entry) continue;
      entry.price = saved.price ?? entry.price;
      entry.history = saved.history ?? entry.history;
    }
  }
}

// ============================ NATIONAL ACCOUNTS ============================

export interface YearlyLedger {
  year: number;
  taxIncome: number;
  tradeIncome: number;
  upkeep: number;
  net: number;
  gdp: number;
  treasury: number;
}

const MAX_LEDGER_HISTORY = 120;

/**
 * One kingdom's economy: what it owns, what it earns, and what its money is worth.
 */
export class KingdomEconomy {
  /** Held in the realm's own currency once minted, otherwise in raw gold. */
  public treasury: number = 100;
  public currency: Currency | null = null;

  /** Total value of everything produced last year. */
  public gdp: number = 0;
  /** Value produced per citizen — drives government choices and unrest. */
  public gdpPerCapita: number = 0;
  /** Fraction of output from factories rather than farms and mines, 0..1. */
  public industrialisation: number = 0;
  /** 0..1 — how content the population is with its material conditions. */
  public stability: number = 0.7;
  /** How unequally the wealth is spread, 0..1. Rises under capitalism. */
  public inequality: number = 0.3;

  public ledger: YearlyLedger[] = [];

  public get hasCurrency(): boolean {
    return this.currency !== null;
  }

  public get moneyName(): string {
    return this.currency?.name ?? 'raw gold';
  }

  public get moneySymbol(): string {
    return this.currency?.symbol ?? '⛁';
  }

  /** Formats an amount in this realm's money. */
  public format(amount: number): string {
    const rounded = Math.round(amount);
    return `${this.moneySymbol}${rounded.toLocaleString()}`;
  }

  /** Converts an amount of this realm's money into abstract world units. */
  public toWorldValue(amount: number): number {
    return amount * (this.currency?.value ?? 1);
  }

  /** Converts abstract world units into this realm's money. */
  public fromWorldValue(worldValue: number): number {
    const rate = this.currency?.value ?? 1;
    return rate <= 0 ? worldValue : worldValue / rate;
  }

  public recordYear(entry: YearlyLedger): void {
    this.ledger.push(entry);
    if (this.ledger.length > MAX_LEDGER_HISTORY) this.ledger.shift();
  }

  public latest(): YearlyLedger | null {
    return this.ledger.length ? this.ledger[this.ledger.length - 1] : null;
  }

  /**
   * Revalues the currency. Money backed by real gold reserves and real output
   * holds its worth; money printed to cover deficits does not.
   */
  public revalue(goldReserves: number, output: number): void {
    if (!this.currency) return;

    const backing = (goldReserves * 6 + output) / Math.max(1, this.currency.supply);
    const target = Math.max(0.15, Math.min(4, backing));
    const previous = this.currency.value;

    this.currency.value += (target - this.currency.value) * 0.2;
    this.currency.inflation = previous > 0 ? (previous - this.currency.value) / previous : 0;
  }

  /** Printing money to cover a shortfall. Cheap now, expensive later. */
  public printMoney(amount: number): void {
    if (!this.currency) return;
    this.currency.supply += amount;
    this.treasury += amount;
  }

  public serialize(): any {
    return {
      treasury: this.treasury,
      currency: this.currency,
      gdp: this.gdp,
      gdpPerCapita: this.gdpPerCapita,
      industrialisation: this.industrialisation,
      stability: this.stability,
      inequality: this.inequality,
      ledger: this.ledger
    };
  }

  public deserialize(data: any): void {
    if (!data) return;
    this.treasury = data.treasury ?? 100;
    this.currency = data.currency ?? null;
    this.gdp = data.gdp ?? 0;
    this.gdpPerCapita = data.gdpPerCapita ?? 0;
    this.industrialisation = data.industrialisation ?? 0;
    this.stability = data.stability ?? 0.7;
    this.inequality = data.inequality ?? 0.3;
    this.ledger = data.ledger ?? [];
  }
}

/**
 * Exchange rate between two realms' currencies.
 * Returns how many units of `to` one unit of `from` buys.
 */
export function exchangeRate(from: KingdomEconomy, to: KingdomEconomy): number {
  const fromValue = from.currency?.value ?? 1;
  const toValue = to.currency?.value ?? 1;
  if (toValue <= 0) return 0;
  return fromValue / toValue;
}
