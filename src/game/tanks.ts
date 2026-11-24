import type { MachineGunSpec } from './machineGun';
import type { TrophyApsConfig } from './aps';
import type { TankAbilitySpec } from './abilities';

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
  /**
   * Необязательный точный диапазон входящего урона в лоб [мин, макс].
   * Если задан, заменяет расчёт через frontDamageReduction для этой машины.
   */
  frontDamageRange?: [number, number];
  /** Множитель урона по боссу в режиме «Джагернаут» (база 50 ХП за выстрел). */
  bossDamageCoef: number;
  armor: TankArmorSpec;
  damage: {
    front: number;
    sideRear: number;
    fuel: number;
  };
  mg: MachineGunSpec;
  aps?: TrophyApsConfig;
  ability?: TankAbilitySpec;
  secondaryAbility?: TankAbilitySpec;
  accelBoost?: number;
  pivotBoost?: number;
  stabilized?: boolean;
  engineAudio?: 'diesel' | 'turbine';
  adaptiveSuspension?: boolean;
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
  m1a1: {
    id: 'm1a1',
    name: 'M1A1 Abrams',
    role: 'Основной боевой танк',
    country: 'США',
    gunName: '120-мм гладкоствольная M256',
    description:
      'Американский основной боевой танк с широким приземистым корпусом, массивной угловатой башней со скошенными «скулами» и длинной 120-мм гладкоствольной пушкой. Мощная композитная броня с урановыми вставками отлично держит удары в лоб, а высокая скорость и быстрая перезарядка делают его опасным на любых дистанциях.',
    priceSilver: 6800,
    maxSpeedKmh: 70,
    maxSpeed: 70 / 3.6,
    maxReverse: 9.5,
    traverseRate: 34 * DEG,
    elevRate: 20 * DEG,
    elevMin: -10 * DEG,
    elevMax: 20 * DEG,
    reload: 2.9,
    muzzleVelocity: 680,
    maxRange: 680,
    caliber: 0.12,
    penetrationMm: 330,
    maxHp: 120,
    gunDamage: 70,
    frontDamageReduction: 35,
    frontDamageRange: [25, 35],
    bossDamageCoef: 1.7,
    armor: {
      hullFront: 245,
      hullSide: 80,
      hullRear: 45,
      deck: 25,
      turretFront: 265,
      turretSide: 135,
      turretRear: 70,
      turretTop: 25,
    },
    damage: {
      front: 25,
      sideRear: 70,
      fuel: 999,
    },
    mg: {
      name: '12.7-мм пулемёт M2HB',
      damage: 0.985,
      fireRate: 13,
      magSize: 180,
      totalAmmo: 720,
      reloadTime: 2.7,
      muzzleVelocity: 930,
      maxRange: 520,
      spread: 0.0055,
    },
  },
  ztz96a: {
    id: 'ztz96a',
    name: 'ZTZ-96A',
    role: 'Основной боевой танк',
    country: 'Китай',
    gunName: '125-мм гладкоствольная ZPT-98',
    description:
      'Китайский основной боевой танк с приземистым корпусом, клиновидной башней, плотно обвешанной блоками встроенной динамической защиты, и длинной 125-мм гладкоствольной пушкой с автоматом заряжания. Клиновидная композитная броня уверенно гасит удары спереди, а стабильное орудие награждает точную стрельбу.',
    priceSilver: 8500,
    maxSpeedKmh: 65,
    maxSpeed: 65 / 3.6,
    maxReverse: 8.0,
    traverseRate: 32 * DEG,
    elevRate: 19 * DEG,
    elevMin: -6 * DEG,
    elevMax: 19 * DEG,
    reload: 3.5,
    muzzleVelocity: 700,
    maxRange: 700,
    caliber: 0.125,
    penetrationMm: 335,
    maxHp: 120,
    gunDamage: 80,
    frontDamageReduction: 33,
    frontDamageRange: [25, 30],
    bossDamageCoef: 1.8,
    armor: {
      hullFront: 235,
      hullSide: 80,
      hullRear: 45,
      deck: 25,
      turretFront: 255,
      turretSide: 130,
      turretRear: 65,
      turretTop: 25,
    },
    damage: {
      front: 25,
      sideRear: 80,
      fuel: 999,
    },
    mg: {
      name: '12.7-мм пулемёт QJC-88',
      damage: 0.99,
      fireRate: 12,
      magSize: 160,
      totalAmmo: 640,
      reloadTime: 2.8,
      muzzleVelocity: 900,
      maxRange: 500,
      spread: 0.006,
    },
  },
  t90m: {
    id: 't90m',
    name: 'Т-90М',
    role: 'Современный ОБТ',
    country: 'Россия',
    gunName: '125-мм гладкоствольная 2А46М-5',
    description:
      'Современный российский основной боевой танк с новой сварной башней, характерным забашенным ящиком, плотной обшивкой динамической защиты «Реликт» по корпусу и башне, а также длинной 125-мм пушкой с теплозащитным кожухом. Мощнейшая лобовая защита и отличная динамика.',
    priceSilver: 10500,
    maxSpeedKmh: 70,
    maxSpeed: 70 / 3.6,
    maxReverse: 9.0,
    traverseRate: 34 * DEG,
    elevRate: 20 * DEG,
    elevMin: -7 * DEG,
    elevMax: 20 * DEG,
    reload: 3.0,
    muzzleVelocity: 730,
    maxRange: 730,
    caliber: 0.125,
    penetrationMm: 340,
    maxHp: 120,
    gunDamage: 75,
    frontDamageReduction: 38,
    frontDamageRange: [20, 28],
    bossDamageCoef: 1.9,
    armor: {
      hullFront: 250,
      hullSide: 85,
      hullRear: 45,
      deck: 25,
      turretFront: 270,
      turretSide: 140,
      turretRear: 75,
      turretTop: 25,
    },
    damage: {
      front: 20,
      sideRear: 75,
      fuel: 999,
    },
    mg: {
      name: '12.7-мм пулемёт Корд',
      damage: 0.995,
      fireRate: 14,
      magSize: 200,
      totalAmmo: 800,
      reloadTime: 2.6,
      muzzleVelocity: 940,
      maxRange: 540,
      spread: 0.005,
    },
  },
  merkava4: {
    id: 'merkava4',
    name: 'Merkava Mk.4',
    role: 'Современный ОБТ',
    country: 'Израиль',
    gunName: '120-мм гладкоствольная MG253',
    description:
      'Современный израильский основной боевой танк с передним расположением двигателя, массивным скошенным носом, сильно сдвинутой назад клиновидной башней «летающая тарелка» с цепями-экранами сзади, стабилизированной 120-мм пушкой и комплексом активной защиты «Trophy» (Ветровка), перехватывающим вражеский снаряд каждые 15–20 секунд.',
    priceSilver: 12000,
    maxSpeedKmh: 85,
    maxSpeed: 85 / 3.6,
    maxReverse: 10.5,
    traverseRate: 38 * DEG,
    elevRate: 22 * DEG,
    elevMin: -8 * DEG,
    elevMax: 20 * DEG,
    reload: 2.5,
    muzzleVelocity: 760,
    maxRange: 750,
    caliber: 0.12,
    penetrationMm: 350,
    maxHp: 155,
    gunDamage: 82,
    frontDamageReduction: 42,
    frontDamageRange: [16, 24],
    bossDamageCoef: 2.0,
    accelBoost: 1.35,
    pivotBoost: 1.55,
    stabilized: true,
    aps: {
      cooldownMin: 15,
      cooldownMax: 20,
      interceptRadius: 6.5,
    },
    armor: {
      hullFront: 260,
      hullSide: 90,
      hullRear: 45,
      deck: 28,
      turretFront: 275,
      turretSide: 145,
      turretRear: 70,
      turretTop: 28,
    },
    damage: {
      front: 18,
      sideRear: 82,
      fuel: 999,
    },
    mg: {
      name: '7.62-мм пулемёт MAG',
      damage: 0.995,
      fireRate: 15,
      magSize: 220,
      totalAmmo: 880,
      reloadTime: 2.5,
      muzzleVelocity: 940,
      maxRange: 550,
      spread: 0.0042,
    },
  },
  challenger2: {
    id: 'challenger2',
    name: 'Challenger 2',
    role: 'Основной боевой танк',
    country: 'Великобритания',
    gunName: '120-мм нарезная L30A1',
    description:
      'Британский основной боевой танк с массивным длинным корпусом, крупной угловатой башней со скосами композитной брони «Чобхэм» и мощнейшей 120-мм нарезной пушкой L30A1, наносящей 90 единиц урона.',
    priceSilver: 13000,
    maxSpeedKmh: 55,
    maxSpeed: 55 / 3.6,
    maxReverse: 7.5,
    traverseRate: 30 * DEG,
    elevRate: 19 * DEG,
    elevMin: -10 * DEG,
    elevMax: 20 * DEG,
    reload: 4.0,
    muzzleVelocity: 780,
    maxRange: 750,
    caliber: 0.12,
    penetrationMm: 365,
    maxHp: 135,
    gunDamage: 90,
    frontDamageReduction: 40,
    frontDamageRange: [18, 25],
    bossDamageCoef: 2.15,
    armor: {
      hullFront: 265,
      hullSide: 95,
      hullRear: 48,
      deck: 28,
      turretFront: 285,
      turretSide: 150,
      turretRear: 75,
      turretTop: 30,
    },
    damage: {
      front: 20,
      sideRear: 90,
      fuel: 999,
    },
    mg: {
      name: '7.62-мм пулемёт L94A1',
      damage: 0.995,
      fireRate: 13,
      magSize: 200,
      totalAmmo: 800,
      reloadTime: 2.6,
      muzzleVelocity: 930,
      maxRange: 540,
      spread: 0.005,
    },
  },
  leclerc: {
    id: 'leclerc',
    name: 'AMX-56 Leclerc',
    role: 'Современный ОБТ',
    country: 'Франция',
    gunName: '120-мм гладкоствольная F1 (CN120-26)',
    description:
      'Французский основной боевой танк с компактным низким корпусом, классически центрированной плоской башней с кормовым автоматом заряжания (2.5 с), лазерной стабилизацией без разброса на ходу (100 км/ч) и способностью [E] «Форсаж + Дым GALIX» (рывок и густая дымовая завеса раз в 15 с).',
    priceSilver: 58000,
    maxSpeedKmh: 100,
    maxSpeed: 100 / 3.6,
    maxReverse: 13.0,
    traverseRate: 46 * DEG,
    elevRate: 24 * DEG,
    elevMin: -8 * DEG,
    elevMax: 20 * DEG,
    reload: 2.5,
    muzzleVelocity: 840,
    maxRange: 780,
    caliber: 0.12,
    penetrationMm: 380,
    maxHp: 140,
    gunDamage: 85,
    frontDamageReduction: 35,
    frontDamageRange: [26, 36],
    bossDamageCoef: 2.25,
    accelBoost: 1.55,
    pivotBoost: 1.65,
    stabilized: true,
    ability: {
      type: 'galix_overdrive',
      cooldown: 15,
      duration: 3.5,
      speedMult: 1.28,
      accelMult: 1.45,
      smokeDuration: 8.5,
      smokeRadius: 9.5,
    },
    armor: {
      hullFront: 245,
      hullSide: 82,
      hullRear: 45,
      deck: 25,
      turretFront: 265,
      turretSide: 130,
      turretRear: 65,
      turretTop: 25,
    },
    damage: {
      front: 28,
      sideRear: 85,
      fuel: 999,
    },
    mg: {
      name: '12.7-мм пулемёт M2HB (F1)',
      damage: 0.995,
      fireRate: 15,
      magSize: 220,
      totalAmmo: 880,
      reloadTime: 2.4,
      muzzleVelocity: 950,
      maxRange: 560,
      spread: 0.0038,
    },
  },
  leopard2a7v: {
    id: 'leopard2a7v',
    name: 'Leopard 2A7V',
    role: 'Тяжёлый современный ОБТ',
    country: 'Германия',
    gunName: '120-мм гладкоствольная Rheinmetall L/55A1',
    description:
      'Тяжёлый немецкий основной боевой танк со стреловидной композитной бронёй башни, усиленным носовым модулем корпуса и сверхдлинной 120-мм пушкой L/55A1. Уверенный лобовой танкинг, 95 ед. урона, высокая скорость полёта снаряда и способность [E] «Выстрел DM63/DM73» (500–550 урона, игнор брони и КАЗ раз в 15 с).',
    priceSilver: 75000,
    maxSpeedKmh: 85,
    maxSpeed: 85 / 3.6,
    maxReverse: 10.5,
    traverseRate: 38 * DEG,
    elevRate: 22 * DEG,
    elevMin: -9 * DEG,
    elevMax: 20 * DEG,
    reload: 3.2,
    muzzleVelocity: 930,
    maxRange: 820,
    caliber: 0.12,
    penetrationMm: 420,
    maxHp: 150,
    gunDamage: 95,
    frontDamageReduction: 44,
    frontDamageRange: [18, 25],
    bossDamageCoef: 2.4,
    accelBoost: 1.3,
    pivotBoost: 1.15,
    stabilized: true,
    ability: {
      type: 'dm63_apfsds',
      cooldown: 15,
      damageMin: 500,
      damageMax: 550,
      velocityBoost: 1180,
    },
    armor: {
      hullFront: 280,
      hullSide: 95,
      hullRear: 48,
      deck: 30,
      turretFront: 305,
      turretSide: 155,
      turretRear: 75,
      turretTop: 30,
    },
    damage: {
      front: 18,
      sideRear: 95,
      fuel: 999,
    },
    mg: {
      name: '7.62-мм пулемёт MG3A1',
      damage: 0.995,
      fireRate: 16,
      magSize: 240,
      totalAmmo: 960,
      reloadTime: 2.4,
      muzzleVelocity: 960,
      maxRange: 580,
      spread: 0.004,
    },
  },
  k2: {
    id: 'k2',
    name: 'K2 Black Panther',
    role: 'Современный ОБТ',
    country: 'Южная Корея',
    gunName: '120-мм гладкоствольная CN08 L/55',
    description:
      'Южнокорейский основной боевой танк с угловатым низкопрофильным корпусом, конвейерным автоматом заряжания (2.5 с, 110 ед. урона), активной гидропневматической подвеской ISU (без потери скорости на подъёмах и УВН -13°..+24°) и управляемым снарядом [E]+[ПКМ] «KSTAM» (наведение 1.5 с, атака в крышу на 500 ед. урона и сплэш 10 м только по врагам).',
    priceSilver: 10000,
    maxSpeedKmh: 85,
    maxSpeed: 85 / 3.6,
    maxReverse: 11.0,
    traverseRate: 42 * DEG,
    elevRate: 24 * DEG,
    elevMin: -13 * DEG,
    elevMax: 24 * DEG,
    reload: 2.5,
    muzzleVelocity: 940,
    maxRange: 850,
    caliber: 0.12,
    penetrationMm: 415,
    maxHp: 140,
    gunDamage: 110,
    frontDamageReduction: 41,
    frontDamageRange: [17, 25],
    bossDamageCoef: 2.35,
    accelBoost: 1.42,
    pivotBoost: 1.5,
    stabilized: true,
    adaptiveSuspension: true,
    ability: {
      type: 'kstam_missile',
      cooldown: 18,
      lockDuration: 1.5,
      splashRadius: 10,
      damage: 500,
    },
    armor: {
      hullFront: 270,
      hullSide: 88,
      hullRear: 42,
      deck: 25,
      turretFront: 295,
      turretSide: 145,
      turretRear: 68,
      turretTop: 26,
    },
    damage: {
      front: 21,
      sideRear: 110,
      fuel: 999,
    },
    mg: {
      name: '12.7-мм пулемёт K6 + 7.62-мм',
      damage: 0.995,
      fireRate: 15,
      magSize: 220,
      totalAmmo: 880,
      reloadTime: 2.4,
      muzzleVelocity: 950,
      maxRange: 570,
      spread: 0.004,
    },
  },
  m1a2sep: {
    id: 'm1a2sep',
    name: 'M1A2 SEP (Abrams)',
    role: 'Современный ОБТ',
    country: 'США',
    gunName: '120-мм гладкоствольная M256',
    description:
      'Американский основной боевой танк с приземистым корпусом, «рубленой» башней со сверхпрочной урановой бронёй лба (180 HP, 100 ед. урона на 1500 м, перезарядка 2.7 с), газотурбинным двигателем, тепловизором Gen-2 [E] (подсветка врагов, красных топливных баков и уязвимых зон на 15 с) и способностью [F] «Бронебойный шквал» (+35% скорострельности и +50% пробития на 6 с).',
    priceSilver: 13060,
    maxSpeedKmh: 95,
    maxSpeed: 95 / 3.6,
    maxReverse: 11.5,
    traverseRate: 44 * DEG,
    elevRate: 24 * DEG,
    elevMin: -10 * DEG,
    elevMax: 20 * DEG,
    reload: 2.7,
    muzzleVelocity: 900,
    maxRange: 1500,
    caliber: 0.12,
    penetrationMm: 410,
    maxHp: 180,
    gunDamage: 100,
    frontDamageReduction: 46,
    frontDamageRange: [14, 22],
    bossDamageCoef: 2.35,
    accelBoost: 1.48,
    pivotBoost: 1.4,
    stabilized: true,
    engineAudio: 'turbine',
    ability: {
      type: 'thermal_sight',
      cooldown: 30,
      duration: 15,
    },
    secondaryAbility: {
      type: 'ap_barrage',
      cooldown: 18,
      duration: 6,
      reloadMult: 0.65,
      penMult: 1.5,
    },
    armor: {
      hullFront: 270,
      hullSide: 90,
      hullRear: 38,
      deck: 20,
      turretFront: 340,
      turretSide: 145,
      turretRear: 60,
      turretTop: 22,
    },
    damage: {
      front: 18,
      sideRear: 100,
      fuel: 999,
    },
    mg: {
      name: '12.7-мм M2HB + 7.62-мм M240',
      damage: 0.995,
      fireRate: 15,
      magSize: 220,
      totalAmmo: 880,
      reloadTime: 2.5,
      muzzleVelocity: 950,
      maxRange: 580,
      spread: 0.004,
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

export function getTankPowerRating(spec: TankSpec): number {
  const effectiveHp =
    spec.maxHp * (1 + spec.frontDamageReduction * 0.015) +
    (spec.armor.hullFront + spec.armor.turretFront) * 0.14 +
    (spec.aps ? 65 : 0);
  const dpm = spec.gunDamage / Math.max(0.1, spec.reload);
  const firepower =
    dpm * 2.1 +
    spec.gunDamage * 1.05 +
    spec.penetrationMm * 0.18 +
    spec.maxRange * 0.05;
  const mobility =
    spec.maxSpeedKmh * 0.42 +
    (spec.stabilized ? 25 : 0) +
    (spec.adaptiveSuspension ? 18 : 0);
  const singleAbilityScore = (type?: string) =>
    type === 'dm63_apfsds'
      ? 150
      : type === 'kstam_missile'
        ? 140
        : type === 'galix_overdrive'
          ? 125
          : type === 'thermal_sight' || type === 'ap_barrage'
            ? 75
            : 0;
  const abilityPower =
    singleAbilityScore(spec.ability?.type) + singleAbilityScore(spec.secondaryAbility?.type);
  return effectiveHp + firepower + mobility + abilityPower;
}

export function getAllTanks(): TankSpec[] {
  return Object.values(TANK_CATALOG).sort((a, b) => getTankPowerRating(a) - getTankPowerRating(b));
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
