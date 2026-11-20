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
