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
  /** Множитель урона по боссу в режиме «Джагернаут» (база 50 ХП за выстрел). */
  bossDamageCoef: number;
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
    bossDamageCoef: 1.0,
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
  m60a3: {
    id: 'm60a3',
    name: 'M60A3 Patton',
    role: 'Основной боевой танк',
    country: 'США',
    gunName: '105-мм пушка M68',
    description:
      'Тяжёлый американский основной боевой танк с массивным корпусом, усиленной маской орудия и дальнобойным 105-мм нарезным орудием. Уступает Т-55 в максимальной скорости, но превосходит по скорострельности, дальности боя и лобовой защите.',
    priceSilver: 1500,
    maxSpeedKmh: 48,
    maxSpeed: 48 / 3.6, // ~13.33 m/s -> 48 km/h
    maxReverse: 6.5,
    traverseRate: 28 * DEG,
    elevRate: 16 * DEG,
    elevMin: -8 * DEG,
    elevMax: 19 * DEG,
    reload: 3.5,
    muzzleVelocity: 540,
    maxRange: 500,
    caliber: 0.105,
    penetrationMm: 255,
    maxHp: 120,
    bossDamageCoef: 1.2,
    armor: {
      hullFront: 215,
      hullSide: 75,
      hullRear: 45,
      deck: 25,
      turretFront: 225,
      turretSide: 110,
      turretRear: 60,
      turretTop: 25,
    },
    damage: {
      front: 40,
      sideRear: 55,
      fuel: 999,
    },
  },
};

export const BOSS_TANK_ID = 'maus';
export const BOSS_BASE_DAMAGE = 50;

/** Босс режима «Джагернаут». Не входит в каталог ангара и не продаётся. */
export const MAUS_SPEC: TankSpec = {
  id: BOSS_TANK_ID,
  name: 'Маус',
  role: 'Сверхтяжёлый танк (босс)',
  country: 'Германия',
  gunName: '128-мм пушка KwK 44',
  description: 'ИИ-босс режима «Джагернаут». Медленный, но смертоносный.',
  priceSilver: 0,
  maxSpeedKmh: 22,
  maxSpeed: 22 / 3.6,
  maxReverse: 2.5,
  traverseRate: 16 * DEG,
  elevRate: 12 * DEG,
  elevMin: -6 * DEG,
  elevMax: 18 * DEG,
  reload: 6.0,
  muzzleVelocity: 520,
  maxRange: 600,
  caliber: 0.128,
  penetrationMm: 9999,
  maxHp: 1000,
  bossDamageCoef: 0,
  armor: {
    hullFront: 350,
    hullSide: 190,
    hullRear: 160,
    deck: 60,
    turretFront: 240,
    turretSide: 200,
    turretRear: 200,
    turretTop: 60,
  },
  damage: { front: 50, sideRear: 50, fuel: 50 },
};

export function getAllTanks(): TankSpec[] {
  return Object.values(TANK_CATALOG);
}

export function getTankSpec(id?: string | null): TankSpec {
  if (id === BOSS_TANK_ID) return MAUS_SPEC;
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
