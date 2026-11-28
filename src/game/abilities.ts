// =====================================================================
//  ACTIVE TANK ABILITIES & VOLUMETRIC SMOKE CONCEALMENT (pure logic)
// =====================================================================

export type TankAbilityType =
  | 'galix_overdrive'
  | 'dm63_apfsds'
  | 'thermal_sight'
  | 'ap_barrage'
  | 'kstam_missile'
  | 'afghanit_shield'
  | 'trophy_reflect'
  | 'amp_homing';

export interface TankAbilitySpec {
  type: TankAbilityType;
  cooldown: number;        // seconds
  duration?: number;       // seconds (for overdrive, thermal_sight, ap_barrage, afghanit_shield, trophy_reflect)
  speedMult?: number;      // max-speed multiplier while active
  accelMult?: number;      // acceleration multiplier while active
  smokeDuration?: number;  // seconds smoke clouds linger
  smokeRadius?: number;    // meters radius per smoke cloud
  damageMin?: number;      // DM63 minimum fixed damage
  damageMax?: number;      // DM63 maximum fixed damage
  velocityBoost?: number;  // DM63 muzzle velocity (m/s)
  reloadMult?: number;     // AP Barrage reload time multiplier (e.g. 0.65 = 35% faster)
  penMult?: number;        // AP Barrage penetration multiplier (e.g. 1.5 = +50%)
  lockDuration?: number;   // KSTAM lock duration (seconds)
  splashRadius?: number;   // KSTAM / AMP AoE splash radius (meters)
  damage?: number;         // KSTAM / AMP fixed direct damage
  splashDamage?: number;   // AMP flat AoE splash damage (meters)
}

export interface TankAbilityState {
  cooldownRemaining: number;
  activeRemaining: number;
  primed: boolean;
}

export interface SmokeCloud {
  x: number;
  y: number;
  z: number;
  radius: number;
  createdAt: number;
  expiresAt: number;
}

export interface AbilityActivationResult {
  activated: boolean;
  type: TankAbilityType | null;
  spawnSmoke: boolean;
  primed: boolean;
}

export interface ConsumedPrimedShot {
  active: boolean;
  damage: number;
  muzzleVelocity: number;
  ignoreArmor: boolean;
  ignoreAps: boolean;
}

export interface ConsumedKstamLaunch {
  launched: boolean;
  damage: number;
  splashRadius: number;
}

export interface KstamLockStepResult {
  progress: number;
  locked: boolean;
  color: 'red' | 'green';
}

export function createAbilityState(): TankAbilityState {
  return {
    cooldownRemaining: 0,
    activeRemaining: 0,
    primed: false,
  };
}

export function resetAbilityState(state: TankAbilityState): void {
  state.cooldownRemaining = 0;
  state.activeRemaining = 0;
  state.primed = false;
}

export function stepAbilityState(
  state: TankAbilityState | null | undefined,
  dt: number,
): void {
  if (!state) return;
  if (state.activeRemaining > 0) {
    state.activeRemaining = Math.max(0, state.activeRemaining - dt);
  }
  if (state.cooldownRemaining > 0) {
    state.cooldownRemaining = Math.max(0, state.cooldownRemaining - dt);
  }
}

export function canActivateAbility(
  state: TankAbilityState | null | undefined,
  spec: TankAbilitySpec | undefined,
): boolean {
  if (!state || !spec) return false;
  if (state.cooldownRemaining > 0.001) return false;
  if (
    (spec.type === 'galix_overdrive' ||
      spec.type === 'thermal_sight' ||
      spec.type === 'ap_barrage' ||
      spec.type === 'afghanit_shield' ||
      spec.type === 'trophy_reflect') &&
    state.activeRemaining > 0.001
  ) {
    return false;
  }
  if ((spec.type === 'dm63_apfsds' || spec.type === 'kstam_missile') && state.primed) return false;
  return true;
}

export function activateAbility(
  state: TankAbilityState | null | undefined,
  spec: TankAbilitySpec | undefined,
): AbilityActivationResult {
  if (!state || !spec || !canActivateAbility(state, spec)) {
    return { activated: false, type: spec?.type ?? null, spawnSmoke: false, primed: Boolean(state?.primed) };
  }
  if (spec.type === 'galix_overdrive') {
    state.activeRemaining = spec.duration ?? 3.5;
    state.cooldownRemaining = spec.cooldown ?? 15;
    return {
      activated: true,
      type: 'galix_overdrive',
      spawnSmoke: true,
      primed: false,
    };
  }
  if (spec.type === 'thermal_sight') {
    state.activeRemaining = spec.duration ?? 15;
    state.cooldownRemaining = spec.cooldown ?? 30;
    return {
      activated: true,
      type: 'thermal_sight',
      spawnSmoke: false,
      primed: false,
    };
  }
  if (spec.type === 'ap_barrage') {
    state.activeRemaining = spec.duration ?? 6;
    state.cooldownRemaining = spec.cooldown ?? 18;
    return {
      activated: true,
      type: 'ap_barrage',
      spawnSmoke: false,
      primed: false,
    };
  }
  if (spec.type === 'afghanit_shield') {
    state.activeRemaining = spec.duration ?? 3;
    state.cooldownRemaining = spec.cooldown ?? 16;
    return {
      activated: true,
      type: 'afghanit_shield',
      spawnSmoke: false,
      primed: false,
    };
  }
  if (spec.type === 'trophy_reflect') {
    state.activeRemaining = spec.duration ?? 10;
    state.cooldownRemaining = spec.cooldown ?? 25;
    return {
      activated: true,
      type: 'trophy_reflect',
      spawnSmoke: false,
      primed: false,
    };
  }
  if (spec.type === 'amp_homing') {
    state.cooldownRemaining = spec.cooldown ?? 15;
    return {
      activated: true,
      type: 'amp_homing',
      spawnSmoke: false,
      primed: false,
    };
  }
  // dm63_apfsds & kstam_missile: prime shot/missile; cooldown starts when launched
  state.primed = true;
  return {
    activated: true,
    type: spec.type,
    spawnSmoke: false,
    primed: true,
  };
}

export function consumePrimedShot(
  state: TankAbilityState | null | undefined,
  spec: TankAbilitySpec | undefined,
  baseVelocity: number,
  randomFn: () => number = Math.random,
): ConsumedPrimedShot {
  if (!state || !spec || spec.type !== 'dm63_apfsds' || !state.primed) {
    return {
      active: false,
      damage: 0,
      muzzleVelocity: baseVelocity,
      ignoreArmor: false,
      ignoreAps: false,
    };
  }
  state.primed = false;
  state.cooldownRemaining = spec.cooldown ?? 15;
  const minD = spec.damageMin ?? 500;
  const maxD = spec.damageMax ?? 550;
  const t = Math.max(0, Math.min(1, randomFn()));
  const damage = Math.round(minD + (maxD - minD) * t);
  return {
    active: true,
    damage,
    muzzleVelocity: Math.max(baseVelocity, spec.velocityBoost ?? 1160),
    ignoreArmor: true,
    ignoreAps: true,
  };
}

export function consumeKstamLaunch(
  state: TankAbilityState | null | undefined,
  spec: TankAbilitySpec | undefined,
): ConsumedKstamLaunch {
  if (!state || !spec || spec.type !== 'kstam_missile' || !state.primed) {
    return { launched: false, damage: 0, splashRadius: 0 };
  }
  state.primed = false;
  state.cooldownRemaining = spec.cooldown ?? 18;
  return {
    launched: true,
    damage: spec.damage ?? 500,
    splashRadius: spec.splashRadius ?? 10,
  };
}

export function getOverdriveMultipliers(
  state: TankAbilityState | null | undefined,
  spec: TankAbilitySpec | undefined,
): { speedMult: number; accelMult: number; active: boolean } {
  if (!state || !spec || spec.type !== 'galix_overdrive' || state.activeRemaining <= 0) {
    return { speedMult: 1, accelMult: 1, active: false };
  }
  return {
    speedMult: spec.speedMult ?? 1.28,
    accelMult: spec.accelMult ?? 1.45,
    active: true,
  };
}

export function getBarrageMultipliers(
  state: TankAbilityState | null | undefined,
  spec: TankAbilitySpec | undefined,
): { active: boolean; reloadMult: number; penMult: number } {
  if (!state || !spec || spec.type !== 'ap_barrage' || state.activeRemaining <= 0) {
    return { active: false, reloadMult: 1, penMult: 1 };
  }
  return {
    active: true,
    reloadMult: spec.reloadMult ?? 0.65,
    penMult: spec.penMult ?? 1.5,
  };
}

export function isThermalActive(
  state: TankAbilityState | null | undefined,
  spec: TankAbilitySpec | undefined,
): boolean {
  return Boolean(state && spec && spec.type === 'thermal_sight' && state.activeRemaining > 0);
}

export function isAfghanitActive(
  state: TankAbilityState | null | undefined,
  spec: TankAbilitySpec | undefined,
): boolean {
  return Boolean(state && spec && spec.type === 'afghanit_shield' && state.activeRemaining > 0);
}

export function isTrophyReflectActive(
  state: TankAbilityState | null | undefined,
  spec: TankAbilitySpec | undefined,
): boolean {
  return Boolean(state && spec && spec.type === 'trophy_reflect' && state.activeRemaining > 0);
}

export function stepKstamLock(
  currentProgress: number,
  hasTargetInCone: boolean,
  holdingLock: boolean,
  dt: number,
  lockDuration = 1.5,
): KstamLockStepResult {
  if (!holdingLock) {
    return { progress: 0, locked: false, color: 'red' };
  }
  const safeDur = Math.max(0.1, lockDuration);
  const next = hasTargetInCone
    ? Math.min(safeDur, currentProgress + Math.max(0, dt))
    : Math.max(0, currentProgress - Math.max(0, dt) * 0.75);
  const locked = hasTargetInCone && next >= safeDur - 1e-4;
  return {
    progress: next,
    locked,
    color: locked ? 'green' : 'red',
  };
}

export function computeKstamSplashDamage(
  dist: number,
  radius = 10,
  maxSplashDmg = 280,
  isAllyOrSelf = false,
): number {
  if (isAllyOrSelf || radius <= 0 || dist > radius || dist < 0) return 0;
  const f = Math.max(0, Math.min(1, 1 - (dist / radius) * 0.65));
  return Math.round(maxSplashDmg * f);
}

export function computeAmpSplashDamage(
  dist: number,
  radius = 5,
  splashDamage = 40,
  isAllyOrSelf = false,
): number {
  if (isAllyOrSelf || radius <= 0 || dist > radius || dist < 0) return 0;
  return Math.round(splashDamage);
}

export interface EnemyPositionCandidate {
  alive: boolean;
  team: string;
  x: number;
  z: number;
}

export function findNearestEnemyIndex(
  originX: number,
  originZ: number,
  ownerTeam: string,
  candidates: readonly EnemyPositionCandidate[],
): number {
  let bestIdx = -1;
  let bestDistSq = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.alive || c.team === ownerTeam) continue;
    const dx = c.x - originX;
    const dz = c.z - originZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function computeGalixArcPosition(
  sx: number,
  sy: number,
  sz: number,
  ex: number,
  ey: number,
  ez: number,
  progress: number,
  arcHeight = 3.2,
): { x: number; y: number; z: number } {
  const t = Math.max(0, Math.min(1, progress));
  const arc = 4 * arcHeight * t * (1 - t);
  return {
    x: sx + (ex - sx) * t,
    y: sy + (ey - sy) * t + arc,
    z: sz + (ez - sz) * t,
  };
}

export function createSmokeRing(
  cx: number,
  cy: number,
  cz: number,
  heading: number,
  simTime: number,
  duration = 8.5,
  radius = 9.5,
): SmokeCloud[] {
  const clouds: SmokeCloud[] = [];
  const expiresAt = simTime + duration;
  const dist = Math.max(4.2, radius * 0.68);
  // Central screen + 6 perimeter canisters discharged around turret
  clouds.push({ x: cx, y: cy + 1.3, z: cz, radius: radius * 1.12, createdAt: simTime, expiresAt });
  for (let i = 0; i < 6; i++) {
    const a = heading + (i / 6) * Math.PI * 2;
    clouds.push({
      x: cx + Math.sin(a) * dist,
      y: cy + 1.0,
      z: cz + Math.cos(a) * dist,
      radius,
      createdAt: simTime,
      expiresAt,
    });
  }
  return clouds;
}

export function pruneSmokeClouds(clouds: SmokeCloud[], simTime: number): SmokeCloud[] {
  let write = 0;
  for (let i = 0; i < clouds.length; i++) {
    if (clouds[i].expiresAt > simTime) {
      clouds[write++] = clouds[i];
    }
  }
  clouds.length = write;
  return clouds;
}

export function isTankConcealedBySmoke(
  clouds: readonly SmokeCloud[] | undefined,
  x: number,
  z: number,
  simTime: number,
): boolean {
  if (!clouds || clouds.length === 0) return false;
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    if (c.expiresAt <= simTime) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz <= c.radius * c.radius) {
      return true;
    }
  }
  return false;
}

export function isLineBlockedBySmoke(
  clouds: readonly SmokeCloud[] | undefined,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  simTime: number,
): boolean {
  if (!clouds || clouds.length === 0) return false;
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    if (c.expiresAt <= simTime) continue;
    let t = 0;
    if (lenSq > 1e-6) {
      t = ((c.x - ax) * abx + (c.z - az) * abz) / lenSq;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
    }
    const px = ax + abx * t - c.x;
    const pz = az + abz * t - c.z;
    if (px * px + pz * pz <= c.radius * c.radius) {
      return true;
    }
  }
  return false;
}
