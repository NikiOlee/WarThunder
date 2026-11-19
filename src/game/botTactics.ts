export interface TargetCandidate {
  id: string;
  x: number;
  z: number;
  heading: number;
  hp: number;
  maxHp: number;
  range: number;
  hasLineOfSight: boolean;
  isPlayer: boolean;
}

export interface BotPose {
  x: number;
  z: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const wrapPi = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

/**
 * Scores visible enemy targets so bots prioritize wounded threats, close targets,
 * and exposed side/rear angles instead of tunneling on full-HP frontal standoffs.
 */
export function pickBestTarget<T extends TargetCandidate>(
  bot: BotPose,
  candidates: T[],
  currentTargetId: string | null,
): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;

  for (const c of candidates) {
    if (!c.hasLineOfSight || c.range > 720) continue;

    const toBotX = bot.x - c.x;
    const toBotZ = bot.z - c.z;
    const len = Math.hypot(toBotX, toBotZ) || 1;
    const enemyFwdX = Math.sin(c.heading);
    const enemyFwdZ = Math.cos(c.heading);
    // 1 = enemy faces us head-on, -1 = we are behind enemy
    const frontDot = (toBotX * enemyFwdX + toBotZ * enemyFwdZ) / len;

    const rangeScore = Math.max(0, 1 - c.range / 600) * 55;
    const hpRatio = clamp(c.hp / Math.max(1, c.maxHp), 0, 1);
    const finishWoundedBonus = (1 - hpRatio) * 42;
    const flankExposureBonus = (1 - frontDot) * 14; // prefer side/rear targets
    const stickBonus = currentTargetId && c.id === currentTargetId ? 14 : 0;

    const score = rangeScore + finishWoundedBonus + flankExposureBonus + stickBonus;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

export interface SectorAlly {
  x: number;
  z: number;
  inCombat: boolean;
}

export interface SectorEnemy {
  x: number;
  z: number;
  hp: number;
  maxHp: number;
}

/**
 * Chooses a tactical combat sector when no enemy is directly in line of sight:
 * pushes toward active fights and wounded enemies (with a flanking offset).
 */
export function pickCombatSectorWaypoint(params: {
  botX: number;
  botZ: number;
  flankSign: number;
  enemies: SectorEnemy[];
  allies: SectorAlly[];
  fallback: { x: number; z: number };
}): { x: number; z: number } {
  const { botX, botZ, flankSign, enemies, allies, fallback } = params;
  if (enemies.length === 0) return fallback;

  let bestEnemy = enemies[0];
  let bestScore = -Infinity;

  for (const e of enemies) {
    const dist = Math.hypot(e.x - botX, e.z - botZ);
    const hpRatio = clamp(e.hp / Math.max(1, e.maxHp), 0, 1);
    const woundedScore = (1 - hpRatio) * 90;
    const distScore = Math.max(0, 1 - dist / 900) * 65;

    let allySupportBonus = 0;
    for (const a of allies) {
      const da = Math.hypot(a.x - e.x, a.z - e.z);
      if (da < 260) {
        allySupportBonus += a.inCombat ? 28 : 12;
      }
    }

    const total = woundedScore + distScore + Math.min(45, allySupportBonus);
    if (total > bestScore) {
      bestScore = total;
      bestEnemy = e;
    }
  }

  const dx = bestEnemy.x - botX;
  const dz = bestEnemy.z - botZ;
  const dist = Math.hypot(dx, dz) || 1;
  const baseAngle = Math.atan2(dx, dz);
  // Approach on a flanking offset (~22 deg) when far away so teams envelop rather than blobbing head-on
  const flankAngle = baseAngle + flankSign * (dist > 220 ? 0.38 : 0.22);
  const stepDist = Math.max(35, Math.min(dist * 0.72, dist - 115));

  return {
    x: botX + Math.sin(flankAngle) * stepDist,
    z: botZ + Math.cos(flankAngle) * stepDist,
  };
}

export interface EngagementDriveInput {
  dx: number;
  dz: number;
  targetHeading: number;
  flankSign: number;
  reloadTimer: number;
  yawErr: number;
  canSeeTarget: boolean;
}

export interface EngagementDriveOutput {
  desiredHeading: number;
  throttle: number;
  brake: boolean;
}

/**
 * Keeps bots inside the aggressive 90–200m lethal sweet-spot, flanking head-on
 * 200mm frontal armor and pushing confidently instead of parking at 320–360m.
 */
export function computeEngagementDrive(inp: EngagementDriveInput): EngagementDriveOutput {
  const range = Math.hypot(inp.dx, inp.dz);
  const directYaw = Math.atan2(inp.dx, inp.dz);

  // Check if target's frontal glacis is facing straight at us
  const toBotX = -inp.dx / Math.max(1, range);
  const toBotZ = -inp.dz / Math.max(1, range);
  const frontDot = toBotX * Math.sin(inp.targetHeading) + toBotZ * Math.cos(inp.targetHeading);
  const headOn = frontDot > 0.65;

  if (!inp.canSeeTarget || range > 205) {
    // Push aggressively into 90–200m range along an offset flank line
    const offset = inp.flankSign * (headOn ? 0.48 : 0.28);
    return {
      desiredHeading: wrapPi(directYaw + offset),
      throttle: 1.0,
      brake: false,
    };
  }

  if (range >= 90) {
    // Sweet spot: 90–200m. Slow down briefly only when gun is ready and close to target lock;
    // otherwise keep maneuvering around target's flank!
    const readyToShoot = inp.reloadTimer <= 0.35 && inp.yawErr < 0.14;
    if (readyToShoot) {
      return {
        desiredHeading: wrapPi(directYaw + inp.flankSign * 0.55),
        throttle: 0.15,
        brake: false,
      };
    }
    const flankOffset = inp.flankSign * (headOn ? 0.72 : 0.48);
    return {
      desiredHeading: wrapPi(directYaw + flankOffset),
      throttle: 0.78,
      brake: false,
    };
  }

  // Close brawl (< 90m): orbit aggressively at ~70–85 deg to hit thin side/rear/fuel armor
  if (range > 34) {
    return {
      desiredHeading: wrapPi(directYaw + inp.flankSign * 1.15),
      throttle: 0.68,
      brake: false,
    };
  }

  // Only ease back slightly if almost touching (< 34m) while reloading
  return {
    desiredHeading: wrapPi(directYaw + inp.flankSign * 1.25),
    throttle: inp.reloadTimer > 0.6 ? -0.45 : 0.35,
    brake: false,
  };
}

/**
 * Computes angular tolerance for firing so bots shoot decisively whenever
 * the barrel is genuinely aligned with the enemy tank silhouette.
 */
export function computeShotGate(params: {
  range: number;
  maxEffectiveRange: number;
  reactT: number;
  yawErr: number;
  elevErr: number;
  hasLineOfSight: boolean;
}): boolean {
  const { range, maxEffectiveRange, reactT, yawErr, elevErr, hasLineOfSight } = params;
  if (!hasLineOfSight || reactT > 0 || range > maxEffectiveRange || range < 3) {
    return false;
  }
  const safeRange = Math.max(20, range);
  const maxYaw = Math.max(0.032, Math.atan2(1.85, safeRange) * 1.35);
  const maxElev = Math.max(0.028, Math.atan2(1.25, safeRange) * 1.35);
  return yawErr <= maxYaw && elevErr <= maxElev;
}

/**
 * Chooses local aim offset on target hull/weakspots based on viewing angle & bot skill.
 */
export function computeWeakspotAimOffset(params: {
  botX: number;
  botZ: number;
  targetX: number;
  targetZ: number;
  targetHeading: number;
  skill: number;
}): { ox: number; oy: number; oz: number } {
  const dx = params.botX - params.targetX;
  const dz = params.botZ - params.targetZ;
  const dist = Math.hypot(dx, dz) || 1;
  const dirX = dx / dist;
  const dirZ = dz / dist;

  const fwdX = Math.sin(params.targetHeading);
  const fwdZ = Math.cos(params.targetHeading);
  const frontDot = dirX * fwdX + dirZ * fwdZ;

  // Higher skill bots exploit rear/side fuel tanks & thin rear hull (-Z local)
  if (frontDot < -0.25 && params.skill >= 0.85) {
    return {
      ox: -fwdX * 1.9,
      oy: 1.22,
      oz: -fwdZ * 1.9,
    };
  }
  if (Math.abs(frontDot) < 0.45 && params.skill >= 0.95) {
    // Side shot: bias slightly rearward toward side fuel / ammo
    return {
      ox: -fwdX * 0.85,
      oy: 1.18,
      oz: -fwdZ * 0.85,
    };
  }
  // Clean center-of-mass hull/lower-turret shot
  return { ox: 0, oy: 1.15, oz: 0 };
}
