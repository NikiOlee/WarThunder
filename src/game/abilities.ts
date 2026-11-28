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

export interface AmpGuidanceInput {
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  elapsed: number;
  dt: number;
  sampleSurfaceY: (x: number, z: number) => number;
}

export interface AmpGuidanceOutput {
  velX: number;
  velY: number;
  velZ: number;
  speed: number;
}

function scanMaxTerrainSlope(
  posX: number,
  posY: number,
  posZ: number,
  hx: number,
  hz: number,
  horizDist: number,
  sampleSurfaceY: (x: number, z: number) => number,
): number {
  const scanEnd = Math.max(4, horizDist - 6);
  const samples = Math.min(24, Math.max(6, Math.ceil((scanEnd - 4) / 6)));
  let maxSlope = -Infinity;
  for (let s = 0; s <= samples; s++) {
    const d = 4 + ((scanEnd - 4) * s) / samples;
    const sx = posX + hx * d;
    const sz = posZ + hz * d;
    const surfaceY = sampleSurfaceY(sx, sz);
    const clearance = d < 14 ? 5.5 : 7.0;
    const reqY = surfaceY + clearance;
    const slope = (reqY - posY) / Math.max(d, 3);
    if (slope > maxSlope) maxSlope = slope;
  }
  return maxSlope;
}

export function computeAmpLaunchDirection(
  posX: number,
  posY: number,
  posZ: number,
  barrelDirX: number,
  barrelDirY: number,
  barrelDirZ: number,
  targetX: number | null,
  targetY: number | null,
  targetZ: number | null,
  sampleSurfaceY?: (x: number, z: number) => number,
): { x: number; y: number; z: number } {
  let dx = barrelDirX;
  let dy = barrelDirY;
  let dz = barrelDirZ;
  const bLen = Math.hypot(dx, dy, dz) || 1;
  dx /= bLen;
  dy /= bLen;
  dz /= bLen;

  let minSlope = Math.max(0.38, dy + 0.24);
  if (targetX !== null && targetY !== null && targetZ !== null) {
    const tx = targetX - posX;
    const tz = targetZ - posZ;
    const horizDist = Math.hypot(tx, tz);
    if (horizDist > 1) {
      const hx = tx / horizDist;
      const hz = tz / horizDist;
      // Bias initial horizontal direction slightly toward target while keeping barrel feel
      dx = hx * 0.55 + dx * 0.45;
      dz = hz * 0.55 + dz * 0.45;
      const hNorm = Math.hypot(dx, dz) || 1;
      dx /= hNorm;
      dz /= hNorm;
      if (sampleSurfaceY && horizDist > 10) {
        const crestSlope = scanMaxTerrainSlope(posX, posY, posZ, hx, hz, horizDist, sampleSurfaceY);
        if (Number.isFinite(crestSlope)) {
          minSlope = Math.max(minSlope, crestSlope + 0.14);
        }
      }
    }
  }

  const clampedSlope = Math.min(2.1, Math.max(0.38, minSlope));
  const hLen = Math.hypot(dx, dz) || 1;
  const rx = dx / hLen;
  const rz = dz / hLen;
  const outLen = Math.hypot(rx, clampedSlope, rz);
  return {
    x: rx / outLen,
    y: clampedSlope / outLen,
    z: rz / outLen,
  };
}

export function computeAmpGuidance(input: AmpGuidanceInput): AmpGuidanceOutput {
  const {
    posX,
    posY,
    posZ,
    velX,
    velY,
    velZ,
    targetX,
    targetY,
    targetZ,
    elapsed,
    dt,
    sampleSurfaceY,
  } = input;

  const curSpeed = Math.hypot(velX, velY, velZ) || 130;
  const curX = velX / curSpeed;
  const curY = velY / curSpeed;
  const curZ = velZ / curSpeed;

  const dx = targetX - posX;
  const dy = targetY - posY;
  const dz = targetZ - posZ;
  const horizDist = Math.hypot(dx, dz);

  let tgtX: number;
  let tgtY: number;
  let tgtZ: number;

  if (horizDist <= 9.5) {
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-4) {
      return { velX, velY, velZ, speed: curSpeed };
    }
    tgtX = dx / dist;
    tgtY = dy / dist;
    tgtZ = dz / dist;
  } else {
    const hx = dx / horizDist;
    const hz = dz / horizDist;
    const directSlope = dy / horizDist;
    const crestSlope = scanMaxTerrainSlope(posX, posY, posZ, hx, hz, horizDist, sampleSurfaceY);
    const loftSlope = elapsed < 0.25 && horizDist > 26 ? Math.min(0.45, 0.2 + horizDist * 0.001) : 0;

    let desiredSlope = Math.max(directSlope, crestSlope, loftSlope);

    // Immediate terrain floor clearance so missile never scrapes hillsides
    const groundHere = sampleSurfaceY(posX, posZ);
    const groundAhead = sampleSurfaceY(posX + hx * 5.5, posZ + hz * 5.5);
    const safeFloorY = Math.max(groundHere, groundAhead) + 5.2;
    if (posY < safeFloorY) {
      desiredSlope = Math.max(desiredSlope, (safeFloorY - posY) / 4.2 + 0.25);
    }

    desiredSlope = Math.max(-2.8, Math.min(2.6, desiredSlope));
    const dirLen = Math.hypot(hx, desiredSlope, hz);
    tgtX = hx / dirLen;
    tgtY = desiredSlope / dirLen;
    tgtZ = hz / dirLen;
  }

  const dot = Math.max(-1, Math.min(1, curX * tgtX + curY * tgtY + curZ * tgtZ));
  let steerRate = elapsed < 0.12 ? 18 : 20;
  if (horizDist <= 9.5) {
    steerRate = 38;
  } else if (tgtY > curY + 0.06) {
    steerRate = 30;
  } else if (horizDist < 55) {
    steerRate = 28;
  }

  const blend = 1 - Math.exp(-steerRate * Math.max(0, dt));
  let nx = curX + (tgtX - curX) * blend;
  let ny = curY + (tgtY - curY) * blend;
  let nz = curZ + (tgtZ - curZ) * blend;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;

  // Modulate speed during sharp hill-crest dive turns so turning radius shrinks and prevents overshooting
  const sharpTurn = dot < 0.88 || (horizDist < 42 && dot < 0.96);
  const targetSpeed = sharpTurn
    ? 82 + 48 * Math.max(0, Math.min(1, (dot - 0.25) / 0.75))
    : 132;
  const speedBlend = 1 - Math.exp(-10 * Math.max(0, dt));
  const speed = curSpeed + (targetSpeed - curSpeed) * speedBlend;

  return {
    velX: nx * speed,
    velY: ny * speed,
    velZ: nz * speed,
    speed,
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
