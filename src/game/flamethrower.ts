export const FLAME_RANGE_M = 20;
export const FLAME_HIT_RADIUS_M = 1.75;
export const FLAME_MAX_CONTINUOUS_SEC = 4.5;
export const FLAME_OVERHEAT_COOLDOWN_SEC = 2.5;
export const FLAME_IDLE_COOL_SEC = 3.2;
export const FLAME_BURN_DURATION_SEC = 4.0;
export const FLAME_BURN_DPS = 10;

export interface FlamethrowerHeatState {
  heat: number; // 0..1
  overheated: boolean;
  active: boolean;
}

export function createFlamethrowerHeatState(): FlamethrowerHeatState {
  return { heat: 0, overheated: false, active: false };
}

/**
 * Pure flamethrower overheat state machine:
 * - No fixed cooldown between bursts; usable anytime when not overheated.
 * - Continuous firing > 4.5s heats up to 1.0 and locks into overheat.
 * - While overheated, cools down over 2.5s back to 0 before firing again.
 */
export function stepFlamethrowerHeat(
  state: FlamethrowerHeatState,
  wantFire: boolean,
  dt: number,
): FlamethrowerHeatState {
  const safeDt = Math.max(0, dt);
  if (state.overheated) {
    state.active = false;
    state.heat = Math.max(0, state.heat - safeDt / FLAME_OVERHEAT_COOLDOWN_SEC);
    if (state.heat <= 1e-6) {
      state.heat = 0;
      state.overheated = false;
    }
    return state;
  }

  if (wantFire) {
    state.heat = Math.min(1, state.heat + safeDt / FLAME_MAX_CONTINUOUS_SEC);
    if (state.heat >= 1 - 1e-6) {
      state.heat = 1;
      state.overheated = true;
      state.active = false;
    } else {
      state.active = true;
    }
    return state;
  }

  state.active = false;
  state.heat = Math.max(0, state.heat - safeDt / FLAME_IDLE_COOL_SEC);
  return state;
}

/**
 * Direct flame contact DPS:
 * - 1st second in fire (0..1s): 20 HP/s
 * - 2nd second in fire (1..2s): 40 HP/s
 * - 3rd+ seconds in fire (>=2s): 60 HP/s
 */
export function getFlameDirectDps(exposureSec: number): number {
  if (exposureSec < 1) return 20;
  if (exposureSec < 2) return 40;
  return 60;
}

/**
 * Integrates escalating direct flame damage smoothly across the 1s / 2s tier boundaries.
 */
export function integrateFlameDirectDamage(exposureStartSec: number, dt: number): number {
  const t0 = Math.max(0, exposureStartSec);
  const t1 = t0 + Math.max(0, dt);
  if (t1 <= t0) return 0;

  let dmg = 0;
  // [0, 1) -> 20 HP/s
  const a0 = Math.min(t1, 1) - Math.min(t0, 1);
  if (a0 > 0) dmg += a0 * 20;
  // [1, 2) -> 40 HP/s
  const a1 = Math.max(0, Math.min(t1, 2) - Math.max(t0, 1));
  if (a1 > 0) dmg += a1 * 40;
  // [2, inf) -> 60 HP/s
  const a2 = Math.max(0, t1 - Math.max(t0, 2));
  if (a2 > 0) dmg += a2 * 60;

  return dmg;
}

export interface TargetFireState {
  exposureSec: number;
  burnSec: number;
}

export function createTargetFireState(): TargetFireState {
  return { exposureSec: 0, burnSec: 0 };
}

export interface TargetFireStepResult {
  damage: number;
  directDps: number;
  burnDps: number;
  inFlame: boolean;
  burning: boolean;
  burnRemaining: number;
}

/**
 * Updates direct flame exposure + residual 4s burn (-10 HP/s) for a single target.
 */
export function stepTargetFireExposure(
  fire: TargetFireState,
  inFlame: boolean,
  dt: number,
  god = false,
): TargetFireStepResult {
  const safeDt = Math.max(0, dt);
  if (inFlame) {
    const rawDamage = integrateFlameDirectDamage(fire.exposureSec, safeDt);
    fire.exposureSec += safeDt;
    fire.burnSec = FLAME_BURN_DURATION_SEC;
    const directDps = getFlameDirectDps(fire.exposureSec);
    return {
      damage: god ? 0 : rawDamage,
      directDps,
      burnDps: 0,
      inFlame: true,
      burning: true,
      burnRemaining: fire.burnSec,
    };
  }

  fire.exposureSec = 0;
  if (fire.burnSec > 0) {
    const tickDt = Math.min(safeDt, fire.burnSec);
    fire.burnSec = Math.max(0, fire.burnSec - safeDt);
    return {
      damage: god ? 0 : FLAME_BURN_DPS * tickDt,
      directDps: 0,
      burnDps: FLAME_BURN_DPS,
      inFlame: false,
      burning: fire.burnSec > 0,
      burnRemaining: fire.burnSec,
    };
  }

  return {
    damage: 0,
    directDps: 0,
    burnDps: 0,
    inFlame: false,
    burning: false,
    burnRemaining: 0,
  };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Checks whether a target's body lies inside the straight 20m flame jet cylinder/cone.
 */
export function isPointInFlameStream(
  origin: Vec3,
  dir: Vec3,
  effectiveRange: number,
  targetCenter: Vec3,
  hitRadius = FLAME_HIT_RADIUS_M,
): boolean {
  const rx = targetCenter.x - origin.x;
  const ry = targetCenter.y - origin.y;
  const rz = targetCenter.z - origin.z;
  const dLen = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const nx = dir.x / dLen;
  const ny = dir.y / dLen;
  const nz = dir.z / dLen;

  const along = rx * nx + ry * ny + rz * nz;
  if (along < -0.5 || along > Math.min(FLAME_RANGE_M, effectiveRange) + 1.0) {
    return false;
  }

  const clampedAlong = Math.max(0, Math.min(FLAME_RANGE_M, along));
  const px = rx - nx * clampedAlong;
  const py = ry - ny * clampedAlong;
  const pz = rz - nz * clampedAlong;
  const perp2 = px * px + py * py + pz * pz;
  return perp2 <= hitRadius * hitRadius;
}
