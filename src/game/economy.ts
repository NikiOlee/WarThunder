import { DEFAULT_TANK_ID, getAllTanks, getTankSpec } from './tanks';

const SILVER_STORAGE_KEY = 'ironsky.silver.v1';
const OWNED_TANKS_STORAGE_KEY = 'ironsky.ownedTanks.v1';

export const KILL_REWARD_SILVER = 50;
export const STREAK_10_BONUS_SILVER = 150;
export const STREAK_20_BONUS_SILVER = 300;

let memorySilver = 0;
let memoryOwnedTanks: string[] | null = null;

function readStorage(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // ignore storage access issues
  }
  return null;
}

function writeStorage(key: string, val: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, val);
    }
  } catch {
    // ignore storage access issues
  }
}

export function getSilver(): number {
  const raw = readStorage(SILVER_STORAGE_KEY);
  if (raw !== null) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      memorySilver = Math.floor(parsed);
      return memorySilver;
    }
  }
  return memorySilver;
}

export function setSilver(amount: number): number {
  const safe = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
  memorySilver = safe;
  writeStorage(SILVER_STORAGE_KEY, String(safe));
  return safe;
}

export function addSilver(amount: number): number {
  const delta = Math.floor(Number.isFinite(amount) ? amount : 0);
  return setSilver(getSilver() + delta);
}

function ensureFreeTanks(list: Iterable<string>): string[] {
  const set = new Set<string>(list);
  set.add(DEFAULT_TANK_ID);
  for (const t of getAllTanks()) {
    if (t.priceSilver <= 0) set.add(t.id);
  }
  return Array.from(set);
}

export function getOwnedTanks(): string[] {
  const raw = readStorage(OWNED_TANKS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const list = ensureFreeTanks(parsed.filter((x): x is string => typeof x === 'string'));
        memoryOwnedTanks = list;
        return list;
      }
    } catch {
      // ignore corrupted storage
    }
  }
  if (!memoryOwnedTanks) {
    memoryOwnedTanks = ensureFreeTanks([DEFAULT_TANK_ID]);
  }
  return [...memoryOwnedTanks];
}

function saveOwnedTanks(list: string[]): string[] {
  const clean = ensureFreeTanks(list);
  memoryOwnedTanks = clean;
  writeStorage(OWNED_TANKS_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function isTankOwned(tankId: string): boolean {
  const spec = getTankSpec(tankId);
  if (spec.priceSilver <= 0) return true;
  return getOwnedTanks().includes(spec.id);
}

export function purchaseTank(tankId: string): {
  ok: boolean;
  reason?: 'owned' | 'insufficient';
  balance: number;
} {
  const spec = getTankSpec(tankId);
  const balance = getSilver();
  if (isTankOwned(spec.id)) {
    return { ok: false, reason: 'owned', balance };
  }
  if (balance < spec.priceSilver) {
    return { ok: false, reason: 'insufficient', balance };
  }
  const nextBalance = setSilver(balance - spec.priceSilver);
  const owned = getOwnedTanks();
  owned.push(spec.id);
  saveOwnedTanks(owned);
  return { ok: true, balance: nextBalance };
}

export interface KillRewardResult {
  baseSilver: number;
  streakBonus: number;
  totalSilver: number;
  bonusLabel: string | null;
}

export function computeKillReward(newPlayerKills: number): KillRewardResult {
  const baseSilver = KILL_REWARD_SILVER;
  let streakBonus = 0;
  let bonusLabel: string | null = null;
  if (newPlayerKills === 10) {
    streakBonus = STREAK_10_BONUS_SILVER;
    bonusLabel = 'Бонус за 10 киллов!';
  } else if (newPlayerKills === 20) {
    streakBonus = STREAK_20_BONUS_SILVER;
    bonusLabel = 'Бонус за 20 киллов!';
  }
  return {
    baseSilver,
    streakBonus,
    totalSilver: baseSilver + streakBonus,
    bonusLabel,
  };
}
