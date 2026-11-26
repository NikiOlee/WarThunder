export interface AirRaidConfig {
  /** Задержка в начале раунда до появления и атаки авиации (сек), даёт игроку 2–3 с на старт. */
  startDelaySec: number;
  /** Общая длительность фазы авианалёта и работы ПВО (сек, 5 минут = 300 с). */
  phaseDurationSec: number;

  /** Общее число самолётов в волне: 1 точный + 1 на упреждение + 5 по площади = 7. */
  totalAircraft: number;
  /** Количество бомбардировщиков, работающих по случайным точкам карты. */
  areaAircraftCount: number;

  /** Крейсерские скорости (м/с) и эшелоны высоты (м) для разных ролей. */
  exactAircraftSpeedMps: number;
  predictiveAircraftSpeedMps: number;
  areaAircraftSpeedMps: number;
  cruiseAltitudeMinM: number;
  cruiseAltitudeMaxM: number;

  /** Дистанция появления/захода с периметра (м), дистанция пролёта после сброса (м) и пауза на разворот (сек). */
  spawnPerimeterRadiusM: number;
  exactInitialDistanceM: number;
  predictiveInitialDistanceM: number;
  egressDistanceM: number;
  rearmCooldownSec: number;
  turnRateRadPerSec: number;

  /** Логика физического сброса и упреждения. */
  /** Горизонтальный радиус (м) над точкой сброса, при пролёте через который из самолёта выпадает бомба. */
  dropTriggerDistanceM: number;
  /** Дистанция до цели (м), на которой 1-й (точный) самолёт фиксирует точку прямо перед сбросом. */
  exactCommitDistanceM: number;
  /** Время упреждения (сек) для 2-го самолёта при расчёте точки встречи с танком. */
  predictiveLeadTimeSec: number;
  /** Задержка/окно фиксации цели (сек до сброса): после фиксации смена курса позволяет танку уклониться. */
  predictiveLockFreezeSec: number;
  /** Небольшой допуск разброса цели (м) для упреждающего самолёта. */
  predictiveToleranceM: number;

  /** Параметры обычных бомб (сбрасываются только при достижении самолётом расчётной точки). */
  normalBombMinRadiusM: number;
  normalBombRadiusM: number;
  normalBombFallTimeSec: number;
  /** Урон обычной бомбы в зоне взрыва (180 — летально для всех игровых танков; можно уменьшить для баланса по ХП). */
  normalBombDamage: number;
  /** Радиус зоны сброса по площади относительно границы карты (отступ от края, м). */
  areaDropEdgeMarginM: number;

  /** Работа ПВО и крушение сбитых самолётов. */
  /** Тайминги (сек от начала боевой фазы) постепенного сбития 7 самолётов за 300 с. */
  aaKillTimesSec: readonly [number, number, number, number, number, number, number];
  /** За сколько секунд до сбития ПВО открывает плотный прицельный огонь по очередному самолёту. */
  aaFocusFireLeadSec: number;
  /** Горизонтальная скорость (м/с), начальная скорость снижения (м/с) и ускорение падения (м/с²) сбитого самолёта. */
  crashForwardSpeedMps: number;
  crashDescentSpeedMps: number;
  crashGravityMps2: number;
  /** Увеличенный радиус (м) и урон взрыва упавшего самолёта («одна большая бомба»). */
  crashBombRadiusM: number;
  crashBombDamage: number;
  /** Дополнительный запас корпуса танка (м) при проверке попадания по краю круга. */
  tankHitMarginM: number;
}

export const AIR_RAID_CONFIG: AirRaidConfig = {
  startDelaySec: 2.5,
  phaseDurationSec: 300,

  totalAircraft: 7,
  areaAircraftCount: 5,

  exactAircraftSpeedMps: 74,
  predictiveAircraftSpeedMps: 78,
  areaAircraftSpeedMps: 80,
  cruiseAltitudeMinM: 112,
  cruiseAltitudeMaxM: 142,

  spawnPerimeterRadiusM: 320,
  exactInitialDistanceM: 185,
  predictiveInitialDistanceM: 225,
  egressDistanceM: 195,
  rearmCooldownSec: 1.4,
  turnRateRadPerSec: 1.55,

  dropTriggerDistanceM: 8.5,
  exactCommitDistanceM: 16,
  predictiveLeadTimeSec: 3.1,
  predictiveLockFreezeSec: 1.65,
  predictiveToleranceM: 2.8,

  normalBombMinRadiusM: 7.5,
  normalBombRadiusM: 10.0,
  normalBombFallTimeSec: 2.35,
  normalBombDamage: 180,
  areaDropEdgeMarginM: 48,

  // 5 случайных бомбардировщиков сбиваются первыми (36..210 с), 2 основных — строго последними (254 и 290 с)
  aaKillTimesSec: [36, 78, 122, 166, 210, 254, 290],
  aaFocusFireLeadSec: 3.8,

  crashForwardSpeedMps: 42,
  crashDescentSpeedMps: 14,
  crashGravityMps2: 9.5,
  crashBombRadiusM: 22.0,
  crashBombDamage: 500,
  tankHitMarginM: 1.6,
};

export function createAirRaidConfig(overrides?: Partial<AirRaidConfig>): AirRaidConfig {
  if (!overrides) return { ...AIR_RAID_CONFIG };
  return { ...AIR_RAID_CONFIG, ...overrides };
}
