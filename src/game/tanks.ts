const DEG = Math.PI / 180;
const TANK_STORAGE_KEY = 'ironsky.selectedTank.v1';

export interface TankArmorSpec {
  hullFront: number;
  hullSide: number;
  hullRear: number;
  deck: number;
  turretFront: number;
  turretSide: number;
  turretRear: number;
  turretTop: number;
}

export interface TankSpec {
  id: string;
  name: string;
  role: string;
  country: string;
  gunName: string;
  description: string;
  priceSilver: number;
  maxSpeedKmh: number;
  maxSpeed: number; // m/s
  maxReverse: number; // m/s
  traverseRate: number; // rad/s
  elevRate: number; // rad/s
  elevMin: number; // rad
  elevMax: number; // rad
  reload: number; // seconds
  muzzleVelocity: number; // m/s
  maxRange: number; // meters
  caliber: number; // meters
  penetrationMm: number;
  maxHp: number;
  armor: TankArmorSpec;
  damage: {
    front: number;
    sideRear: number;
    fuel: number;
  };
}

export const DEFAULT_TANK_ID = 't55';

export const TANK_CATALOG: Record<string, TankSpec> = {
  t55: {
    id: 't55',
    name: 'Т-55',
    role: 'Средний танк',
    country: 'СССР',
    gunName: '100-мм пушка Д-10Т2С',
    description:
      'Базовый средний танк, выдаваемый всем бойцам по умолчанию. Оснащён 200-мм наклонной лобовой бронёй, 100-мм нарезным орудием и внешними кормовыми топливными баками.',
    priceSilver: 0,
    maxSpeedKmh: 50,
    maxSpeed: 50 / 3.6, // ~13.89 m/s -> 50 km/h in game speed scale
    maxReverse: 6.0,
    traverseRate: 26 * DEG,
    elevRate: 15 * DEG,
    elevMin: -5 * DEG,
    elevMax: 18 * DEG,
    reload: 4.0,
    muzzleVelocity: 500,
    maxRange: 400,
    caliber: 0.1,
    penetrationMm: 240,
    maxHp: 120,
    armor: {
      hullFront: 200,
      hullSide: 80,
      hullRear: 45,
      deck: 25,
      turretFront: 200,
      turretSide: 120,
      turretRear: 65,
      turretTop: 25,
    },
    damage: {
      front: 50,
      sideRear: 60,
      fuel: 999,
    },
  },
};

export function getAllTanks(): TankSpec[] {
  return Object.values(TANK_CATALOG);
}

export function getTankSpec(id?: string | null): TankSpec {
  if (id && TANK_CATALOG[id]) return TANK_CATALOG[id];
  return TANK_CATALOG[DEFAULT_TANK_ID];
}

let memorySelectedTankId = DEFAULT_TANK_ID;

export function getSelectedTankId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(TANK_STORAGE_KEY);
      if (saved && TANK_CATALOG[saved]) {
        memorySelectedTankId = saved;
        return saved;
      }
    }
  } catch {
    // ignore storage failures
  }
  return memorySelectedTankId;
}

export function setSelectedTankId(id: string): string {
  const validId = TANK_CATALOG[id] ? id : DEFAULT_TANK_ID;
  memorySelectedTankId = validId;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TANK_STORAGE_KEY, validId);
    }
  } catch {
    // ignore storage failures
  }
  return validId;
}
