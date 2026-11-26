export interface MachineGunSpec {
  name: string;
  /** Урон за одну пулю (строго < 1 ХП, растёт с ценой танка). */
  damage: number;
  /** Скорострельность (выстрелов в секунду). */
  fireRate: number;
  /** Размер ленты / магазина. */
  magSize: number;
  /** Общий боезапас (лента + запас) при появлении танка. */
  totalAmmo: number;
  /** Время перезарядки ленты (сек). */
  reloadTime: number;
  /** Начальная скорость пули (м/с). */
  muzzleVelocity: number;
  /** Максимальная дальность полёта пули (м). */
  maxRange: number;
  /** Рассеивание (рад). */
  spread: number;
}

export interface MachineGunState {
  magAmmo: number;
  reserveAmmo: number;
  cooldownT: number;
  reloadT: number;
}

export function createMgState(spec: MachineGunSpec): MachineGunState {
  const mag = Math.min(spec.magSize, spec.totalAmmo);
  return {
    magAmmo: mag,
    reserveAmmo: Math.max(0, spec.totalAmmo - mag),
    cooldownT: 0,
    reloadT: 0,
  };
}

export function stepMgState(state: MachineGunState, spec: MachineGunSpec, dt: number): void {
  const safeDt = Math.max(0, dt);
  if (state.cooldownT > 0) {
    state.cooldownT = Math.max(0, state.cooldownT - safeDt);
  }
  if (state.reloadT > 0) {
    state.reloadT = Math.max(0, state.reloadT - safeDt);
    if (state.reloadT === 0 && state.reserveAmmo > 0) {
      const need = Math.max(0, spec.magSize - state.magAmmo);
      const load = Math.min(need, state.reserveAmmo);
      state.magAmmo += load;
      state.reserveAmmo -= load;
    }
  }
}

export function startMgReload(state: MachineGunState, spec: MachineGunSpec): boolean {
  if (state.reloadT > 0 || state.reserveAmmo <= 0 || state.magAmmo >= spec.magSize) {
    return false;
  }
  state.reloadT = spec.reloadTime;
  return true;
}

export function tryFireMg(state: MachineGunState, spec: MachineGunSpec): boolean {
  if (state.reloadT > 0 || state.cooldownT > 0) return false;
  if (state.magAmmo <= 0) {
    if (state.reserveAmmo > 0) {
      state.reloadT = spec.reloadTime;
    }
    return false;
  }
  state.magAmmo -= 1;
  state.cooldownT = 1 / Math.max(0.1, spec.fireRate);
  if (state.magAmmo === 0 && state.reserveAmmo > 0) {
    state.reloadT = spec.reloadTime;
  }
  return true;
}

export function isMgExhausted(state: MachineGunState): boolean {
  return state.magAmmo <= 0 && state.reserveAmmo <= 0;
}

const DEG = Math.PI / 180;
export const MG_MAX_ELEV = 85 * DEG;
export const MG_FRONT_MIN_ELEV = -15 * DEG;
export const MG_REAR_MIN_ELEV = -13 * DEG;
export const MG_SIDE_MIN_ELEV = -21 * DEG;

function wrapPi(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Returns the minimum hull-local depression angle (radians, negative) for the
 * roof-mounted / free-aim MG at the given hull-relative azimuth `relYaw`.
 * Blocks only the very bottom where the tank's own hull obstructs firing.
 */
export function computeMgMinLocalElev(relYaw: number): number {
  const c = Math.cos(relYaw);
  const frontOrRear = c >= 0 ? MG_FRONT_MIN_ELEV : MG_REAR_MIN_ELEV;
  return MG_SIDE_MIN_ELEV + (frontOrRear - MG_SIDE_MIN_ELEV) * (c * c);
}

/**
 * Resolves hull-relative MG yaw (full 360°) and hull-relative MG elevation
 * (up to +85°, clamped at the bottom only by hull clearance).
 */
export function resolveMgAim(params: {
  alive: boolean;
  heading: number;
  pitchUp: number;
  rollLeftUp: number;
  aimYaw: number;
  aimElev: number;
  prevYaw?: number;
  prevElev?: number;
}): { mgYaw: number; mgElev: number; minLocalElev: number; clampedBottom: boolean } {
  if (!params.alive) {
    const yaw = params.prevYaw ?? 0;
    return {
      mgYaw: yaw,
      mgElev: params.prevElev ?? 0,
      minLocalElev: computeMgMinLocalElev(yaw),
      clampedBottom: false,
    };
  }
  const mgYaw = wrapPi(params.aimYaw - params.heading);
  const tilt = params.pitchUp * Math.cos(mgYaw) + params.rollLeftUp * Math.sin(mgYaw);
  const rawLocalElev = params.aimElev - tilt;
  const minLocalElev = computeMgMinLocalElev(mgYaw);
  const clampedBottom = rawLocalElev < minLocalElev - 1e-4;
  const mgElev = clamp(rawLocalElev, minLocalElev, MG_MAX_ELEV);
  return { mgYaw, mgElev, minLocalElev, clampedBottom };
}

