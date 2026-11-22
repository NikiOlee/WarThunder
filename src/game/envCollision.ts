export const ROCK_COLLISION_DAMAGE = 5;
export const ROCK_MIN_IMPACT_SPEED = 3.0; // m/s (~10.8 km/h)
export const ROCK_COOLDOWN_SEC = 1.1;
export const TREE_FALL_DURATION = 0.55;
export const TREE_TARGET_TILT_DEFAULT = 1.46; // ~83.6 degrees

export type TreeFallState = 'standing' | 'falling' | 'fallen';

export interface TreeInstanceState {
  index: number;
  x: number;
  y: number;
  z: number;
  baseYaw: number;
  sx: number;
  sy: number;
  sz: number;
  trunkRadius: number;
  state: TreeFallState;
  fallProgress: number;
  fallDirX: number;
  fallDirZ: number;
  tiltAngle: number;
  targetTilt: number;
}

export interface RockCollisionResult {
  collided: boolean;
  x: number;
  z: number;
  newSpeed: number;
  closingSpeed: number;
  contactX: number;
  contactZ: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Resolves tank circle collision against a circular rock obstacle.
 * Pushes the tank cleanly outside the rock radius and stops forward speed
 * when the tank drives into the rock, while allowing reversing away.
 */
export function resolveRockCircleCollision(params: {
  tankX: number;
  tankZ: number;
  tankRadius: number;
  tankVx: number;
  tankVz: number;
  tankSpeed: number;
  rockX: number;
  rockZ: number;
  rockRadius: number;
}): RockCollisionResult {
  const { tankX, tankZ, tankRadius, tankVx, tankVz, tankSpeed, rockX, rockZ, rockRadius } = params;
  const minDist = tankRadius + rockRadius;
  const dx = tankX - rockX;
  const dz = tankZ - rockZ;
  const d2 = dx * dx + dz * dz;

  if (d2 >= minDist * minDist) {
    return {
      collided: false,
      x: tankX,
      z: tankZ,
      newSpeed: tankSpeed,
      closingSpeed: 0,
      contactX: rockX,
      contactZ: rockZ,
    };
  }

  let nx: number;
  let nz: number;
  let dist: number;
  if (d2 > 1e-8) {
    dist = Math.sqrt(d2);
    nx = dx / dist;
    nz = dz / dist;
  } else {
    // Fallback push direction opposite velocity or +Z
    const vLen = Math.hypot(tankVx, tankVz);
    if (vLen > 1e-5) {
      nx = -tankVx / vLen;
      nz = -tankVz / vLen;
    } else {
      nx = 0;
      nz = 1;
    }
    dist = 0;
  }

  const outX = rockX + nx * minDist;
  const outZ = rockZ + nz * minDist;
  const contactX = rockX + nx * rockRadius;
  const contactZ = rockZ + nz * rockRadius;

  // Positive closingSpeed means tank velocity points INTO the rock (-n)
  const closingSpeed = -(tankVx * nx + tankVz * nz);
  const newSpeed = closingSpeed > 0.05 ? 0 : tankSpeed;

  return {
    collided: true,
    x: outX,
    z: outZ,
    newSpeed,
    closingSpeed: Math.max(0, closingSpeed),
    contactX,
    contactZ,
  };
}

/**
 * Checks whether a rock impact warrants applying ROCK_COLLISION_DAMAGE (5 HP)
 * based on closing speed and per-tank cooldown.
 */
export function shouldApplyRockDamage(
  tankId: string,
  closingSpeed: number,
  nowSec: number,
  cooldowns: Map<string, number>,
): number {
  if (closingSpeed < ROCK_MIN_IMPACT_SPEED) return 0;
  const readyAt = cooldowns.get(tankId) ?? -1e9;
  if (nowSec < readyAt) return 0;
  cooldowns.set(tankId, nowSec + ROCK_COOLDOWN_SEC);
  return ROCK_COLLISION_DAMAGE;
}

/**
 * Computes terrain-aware target tilt angle so a fallen tree rests on the ground
 * without sinking deeply into uphill slopes or floating above downhill slopes.
 */
export function computeFallTargetTilt(
  treeY: number,
  groundAheadY: number,
  sampleDist = 5.0,
): number {
  const slopeAngle = Math.atan2(groundAheadY - treeY, Math.max(0.5, sampleDist));
  return clamp(Math.PI * 0.5 - slopeAngle - 0.07, 1.15, 1.72);
}

/**
 * Attempts to knock down a standing tree when touched by a moving tank.
 * Always deals 0 damage and returns true if the tree newly starts falling.
 */
export function triggerTreeKnockdown(
  tree: TreeInstanceState,
  tankX: number,
  tankZ: number,
  tankVx: number,
  tankVz: number,
  targetTilt = TREE_TARGET_TILT_DEFAULT,
): boolean {
  if (tree.state !== 'standing') return false;

  const rx = tree.x - tankX;
  const rz = tree.z - tankZ;
  const rLen = Math.hypot(rx, rz);
  const vLen = Math.hypot(tankVx, tankVz);

  let dirX = rLen > 1e-4 ? rx / rLen : 0;
  let dirZ = rLen > 1e-4 ? rz / rLen : 1;

  if (vLen > 0.15) {
    const vxN = tankVx / vLen;
    const vzN = tankVz / vLen;
    const bx = vxN * 0.65 + dirX * 0.35;
    const bz = vzN * 0.65 + dirZ * 0.35;
    const bLen = Math.hypot(bx, bz);
    if (bLen > 1e-4) {
      dirX = bx / bLen;
      dirZ = bz / bLen;
    } else {
      dirX = vxN;
      dirZ = vzN;
    }
  }

  tree.state = 'falling';
  tree.fallProgress = 0;
  tree.fallDirX = dirX;
  tree.fallDirZ = dirZ;
  tree.tiltAngle = 0;
  tree.targetTilt = targetTilt;
  return true;
}

/**
 * Advances falling tree animations and returns the indices of trees whose
 * tiltAngle changed this step.
 */
export function stepFallingTrees(trees: TreeInstanceState[], dt: number, outChanged: number[] = []): number[] {
  outChanged.length = 0;
  if (dt <= 0) return outChanged;

  for (let i = 0; i < trees.length; i++) {
    const tr = trees[i];
    if (tr.state !== 'falling') continue;

    tr.fallProgress = Math.min(1, tr.fallProgress + dt / TREE_FALL_DURATION);
    const p = tr.fallProgress;

    // Gravity-accelerated topple with a subtle ground bounce at the end
    let factor: number;
    if (p < 0.84) {
      const k = p / 0.84;
      factor = k * k;
    } else {
      const b = (p - 0.84) / 0.16;
      factor = 1 - Math.sin(b * Math.PI) * 0.055;
    }

    tr.tiltAngle = tr.targetTilt * factor;
    outChanged.push(i);

    if (p >= 1) {
      tr.tiltAngle = tr.targetTilt;
      tr.state = 'fallen';
    }
  }

  return outChanged;
}

/**
 * Resets all trees back to standing upright state (for match restart).
 */
export function resetTreeStates(trees: TreeInstanceState[]): void {
  for (let i = 0; i < trees.length; i++) {
    const tr = trees[i];
    tr.state = 'standing';
    tr.fallProgress = 0;
    tr.fallDirX = 0;
    tr.fallDirZ = 1;
    tr.tiltAngle = 0;
    tr.targetTilt = TREE_TARGET_TILT_DEFAULT;
  }
}
