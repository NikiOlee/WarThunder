// =====================================================================
//  ACTIVE TANK ABILITIES & VOLUMETRIC SMOKE CONCEALMENT (pure logic)
// =====================================================================

export type TankAbilityType = 'galix_overdrive' | 'dm63_apfsds';

export interface TankAbilitySpec {
  type: TankAbilityType;
  cooldown: number;        // seconds
  duration?: number;       // seconds (for overdrive)
  speedMult?: number;      // max-speed multiplier while active
  accelMult?: number;      // acceleration multiplier while active
  smokeDuration?: number;  // seconds smoke clouds linger
  smokeRadius?: number;    // meters radius per smoke cloud
  damageMin?: number;      // DM63 minimum fixed damage
  damageMax?: number;      // DM63 maximum fixed damage
  velocityBoost?: number;  // DM63 muzzle velocity (m/s)
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
  if (spec.type === 'galix_overdrive' && state.activeRemaining > 0.001) return false;
  if (spec.type === 'dm63_apfsds' && state.primed) return false;
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
  // dm63_apfsds: prime next cannon shot; cooldown starts when fired
  state.primed = true;
  return {
    activated: true,
    type: 'dm63_apfsds',
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
