import type { MachineGunSpec } from './machineGun';

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
  /** Базовая сила выстрела основного орудия («Урон»). */
  gunDamage: number;
  /** Снижение входящего урона лобовой бронёй при пробитии. */
  frontDamageReduction: number;
  /** Множитель урона по боссу в режиме «Джагернаут» (база 50 ХП за выстрел). */
  bossDamageCoef: number;
  armor: TankArmorSpec;
  damage: {
    front: number;
    sideRear: number;
    fuel: number;
  };
  mg: MachineGunSpec;
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
    gunDamage: 60,
    frontDamageReduction: 10,
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
    mg: {
      name: '7.62-мм пулемёт ПКТ',
      damage: 0.35,
      fireRate: 10,
      magSize: 100,
      totalAmmo: 400,
      reloadTime: 3.2,
      muzzleVelocity: 820,
      maxRange: 360,
      spread: 0.0085,
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
    penetrationMm: 260,
    maxHp: 120,
    gunDamage: 55,
    frontDamageReduction: 20,
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
    mg: {
      name: '12.7-мм пулемёт M85',
      damage: 0.65,
      fireRate: 11,
      magSize: 120,
      totalAmmo: 480,
      reloadTime: 3.0,
      muzzleVelocity: 860,
      maxRange: 420,
      spread: 0.007,
    },
  },
  t62m: {
    id: 't62m',
    name: 'Т-62М',
    role: 'Основной боевой танк',
    country: 'СССР',
    gunName: '115-мм гладкоствольная У-5ТС',
    description:
      'Модернизированная советская классика с удлинённым корпусом, бортовыми экранами, характерными накладками брони («бровями») на башне и дальнобойной 115-мм гладкоствольной пушкой.',
    priceSilver: 2500,
    maxSpeedKmh: 50,
    maxSpeed: 50 / 3.6,
    maxReverse: 6.5,
    traverseRate: 28 * DEG,
    elevRate: 16 * DEG,
    elevMin: -6 * DEG,
    elevMax: 18 * DEG,
    reload: 3.5,
    muzzleVelocity: 580,
    maxRange: 550,
    caliber: 0.115,
    penetrationMm: 285,
    maxHp: 120,
    gunDamage: 60,
    frontDamageReduction: 20,
    bossDamageCoef: 1.4,
    armor: {
      hullFront: 210,
      hullSide: 80,
      hullRear: 45,
      deck: 25,
      turretFront: 230,
      turretSide: 125,
      turretRear: 65,
      turretTop: 25,
    },
    damage: {
      front: 40,
      sideRear: 60,
      fuel: 999,
    },
    mg: {
      name: '12.7-мм пулемёт ДШКМ',
      damage: 0.85,
      fireRate: 12,
      magSize: 140,
      totalAmmo: 560,
      reloadTime: 2.9,
      muzzleVelocity: 880,
      maxRange: 460,
      spread: 0.0065,
    },
  },
  t72b3: {
    id: 't72b3',
    name: 'Т-72Б3',
    role: 'Современный ОБТ',
    country: 'Россия',
    gunName: '125-мм гладкоствольная 2А46М-5',
    description:
      'Современный российский основной боевой танк с комплектом динамической защиты «Реликт» на корпусе и башне, тепловизионным прицелом и 125-мм пушкой с теплозащитным кожухом.',
    priceSilver: 4000,
    maxSpeedKmh: 60,
    maxSpeed: 60 / 3.6,
    maxReverse: 7.0,
    traverseRate: 30 * DEG,
    elevRate: 18 * DEG,
    elevMin: -6 * DEG,
    elevMax: 18 * DEG,
    reload: 3.6,
    muzzleVelocity: 620,
    maxRange: 600,
    caliber: 0.125,
    penetrationMm: 300,
    maxHp: 120,
    gunDamage: 65,
    frontDamageReduction: 25,
    bossDamageCoef: 1.5,
    armor: {
      hullFront: 215,
      hullSide: 85,
      hullRear: 45,
      deck: 25,
      turretFront: 232,
      turretSide: 135,
      turretRear: 70,
      turretTop: 25,
    },
    damage: {
      front: 35,
      sideRear: 65,
      fuel: 999,
    },
    mg: {
      name: '7.62-мм пулемёт ПКТМ',
      damage: 0.95,
      fireRate: 12,
      magSize: 150,
      totalAmmo: 600,
      reloadTime: 2.8,
      muzzleVelocity: 900,
      maxRange: 480,
      spread: 0.006,
    },
  },
  leopard2a4: {
    id: 'leopard2a4',
    name: 'Leopard 2A4',
    role: 'Основной боевой танк',
    country: 'Германия',
    gunName: '120-мм гладкоствольная Rh-120 L/44',
    description:
      'Немецкий основной боевой танк с характерной угловатой башней с вертикальной многослойной лобовой бронёй, длинным корпусом, высокой скоростью 65 км/ч и скорострельной 120-мм пушкой.',
    priceSilver: 5500,
    maxSpeedKmh: 65,
    maxSpeed: 65 / 3.6,
    maxReverse: 8.0,
    traverseRate: 34 * DEG,
    elevRate: 20 * DEG,
    elevMin: -9 * DEG,
    elevMax: 20 * DEG,
    reload: 3.0,
    muzzleVelocity: 650,
    maxRange: 650,
    caliber: 0.12,
    penetrationMm: 320,
    maxHp: 120,
    gunDamage: 70,
    frontDamageReduction: 35,
    bossDamageCoef: 1.6,
    armor: {
      hullFront: 215,
      hullSide: 75,
      hullRear: 45,
      deck: 25,
      turretFront: 235,
      turretSide: 120,
      turretRear: 65,
      turretTop: 25,
    },
    damage: {
      front: 32,
      sideRear: 70,
      fuel: 999,
    },
    mg: {
      name: '7.62-мм пулемёт MG3',
      damage: 0.98,
      fireRate: 14,
      magSize: 175,
      totalAmmo: 700,
      reloadTime: 2.7,
      muzzleVelocity: 920,
      maxRange: 500,
      spread: 0.0055,
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
  gunName: '128-мм пушка KwK 44 + Огнемёт',
  description: 'ИИ-босс режима «Джагернаут». Сверхтяжёлый танк в тёмно-серой броне Dunkelgrau с 128-мм орудием и огнемётом на 20 м.',
  priceSilver: 0,
  maxSpeedKmh: 20.9,
  maxSpeed: (22 * 0.95) / 3.6,
  maxReverse: 2.5 * 0.95,
  traverseRate: 16 * 0.95 * DEG,
  elevRate: 12 * DEG,
  elevMin: -6 * DEG,
  elevMax: 18 * DEG,
  reload: 8.5,
  muzzleVelocity: 520,
  maxRange: 600,
  caliber: 0.128,
  penetrationMm: 9999,
  maxHp: 4000,
  gunDamage: 999999,
  frontDamageReduction: 0,
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
  mg: {
    name: '7.92-мм спаренный MG 34',
    damage: 0.55,
    fireRate: 10,
    magSize: 150,
    totalAmmo: 600,
    reloadTime: 3.5,
    muzzleVelocity: 820,
    maxRange: 380,
    spread: 0.008,
  },
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
