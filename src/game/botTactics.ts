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
  rushBoss?: boolean;
  botIndex?: number;
}

export interface EngagementDriveOutput {
  desiredHeading: number;
  throttle: number;
  brake: boolean;
}

/**
 * Keeps bots aggressively pushing and firing on the move (never stopping to shoot).
 * When rushBoss=true (Juggernaut), bots swarm the Maus from varied flanking angles.
 */
export function computeEngagementDrive(inp: EngagementDriveInput): EngagementDriveOutput {
  const range = Math.hypot(inp.dx, inp.dz);
  const directYaw = Math.atan2(inp.dx, inp.dz);

  // Check if target's frontal glacis is facing straight at us
  const toBotX = -inp.dx / Math.max(1, range);
  const toBotZ = -inp.dz / Math.max(1, range);
  const frontDot = toBotX * Math.sin(inp.targetHeading) + toBotZ * Math.cos(inp.targetHeading);
  const headOn = frontDot > 0.65;

  if (inp.rushBoss) {
    // Meat-grinder rush against Maus: swarm from different angles at full speed and fire continuously
    const spreadSlot = (inp.botIndex ?? 0) % 3;
    if (!inp.canSeeTarget || range > 65) {
      const spread = inp.flankSign * (0.18 + spreadSlot * 0.2);
      return {
        desiredHeading: wrapPi(directYaw + spread),
        throttle: 1.0,
        brake: false,
      };
    }
    if (range > 26) {
      const orbitOffset = inp.flankSign * (0.65 + spreadSlot * 0.16);
      return {
        desiredHeading: wrapPi(directYaw + orbitOffset),
        throttle: 1.0,
        brake: false,
      };
    }
    return {
      desiredHeading: wrapPi(directYaw + inp.flankSign * 1.15),
      throttle: 0.92,
      brake: false,
    };
  }

  if (!inp.canSeeTarget || range > 205) {
    // Push aggressively into 90–200m range along an offset flank line
    const offset = inp.flankSign * (headOn ? 0.45 : 0.25);
    return {
      desiredHeading: wrapPi(directYaw + offset),
      throttle: 1.0,
      brake: false,
    };
  }

  if (range >= 90) {
    // Sweet spot: stay at full combat speed & fire on the move without braking!
    const flankOffset = inp.flankSign * (headOn ? 0.65 : 0.42);
    return {
      desiredHeading: wrapPi(directYaw + flankOffset),
      throttle: 0.92,
      brake: false,
    };
  }

  // Close brawl (< 90m): orbit aggressively at ~55–68 deg to hit thin side/rear armor at full speed
  if (range > 34) {
    return {
      desiredHeading: wrapPi(directYaw + inp.flankSign * 0.98),
      throttle: 0.88,
      brake: false,
    };
  }

  return {
    desiredHeading: wrapPi(directYaw + inp.flankSign * 1.18),
    throttle: 0.82,
    brake: false,
  };
}

export interface AntiStuckState {
  checkTimer: number;
  anchorX: number;
  anchorZ: number;
  prevHeading: number;
  headingAccum: number;
  reverseT: number;
  escapeT: number;
  avoidSign: number;
}

export function createAntiStuckState(x: number, z: number, heading: number, avoidSign = 1): AntiStuckState {
  return {
    checkTimer: 0,
    anchorX: x,
    anchorZ: z,
    prevHeading: heading,
    headingAccum: 0,
    reverseT: 0,
    escapeT: 0,
    avoidSign: avoidSign >= 0 ? 1 : -1,
  };
}

export interface AntiStuckStepResult {
  reversing: boolean;
  escaping: boolean;
  overrideThrottle: number | null;
  overrideSteer: number | null;
}

/**
 * Prevents bots from spinning in place or staying wedged against walls:
 * if net displacement over ~1.15s is < 2.2m (or bot pirouettes without advancing),
 * automatically reverses, turns the hull, and commits to driving clear.
 */
export function stepAntiStuck(
  state: AntiStuckState,
  x: number,
  z: number,
  heading: number,
  dt: number,
): AntiStuckStepResult {
  const safeDt = Math.max(0, dt);
  state.headingAccum += Math.abs(wrapPi(heading - state.prevHeading));
  state.prevHeading = heading;

  if (state.reverseT > 0) {
    state.reverseT = Math.max(0, state.reverseT - safeDt);
    return {
      reversing: true,
      escaping: false,
      overrideThrottle: -1,
      overrideSteer: state.avoidSign,
    };
  }

  if (state.escapeT > 0) {
    state.escapeT = Math.max(0, state.escapeT - safeDt);
    return {
      reversing: false,
      escaping: true,
      overrideThrottle: 1,
      overrideSteer: state.avoidSign * 0.55,
    };
  }

  state.checkTimer += safeDt;
  if (state.checkTimer >= 1.15) {
    const moved = Math.hypot(x - state.anchorX, z - state.anchorZ);
    const stuckInPlace = moved < 2.2;
    const spinningInCircle = state.headingAccum > 2.2 && moved < 6.5;
    state.checkTimer = 0;
    state.headingAccum = 0;
    state.anchorX = x;
    state.anchorZ = z;

    if (stuckInPlace || spinningInCircle) {
      state.avoidSign = -state.avoidSign;
      state.reverseT = 1.05;
      state.escapeT = 0.9;
      return {
        reversing: true,
        escaping: false,
        overrideThrottle: -1,
        overrideSteer: state.avoidSign,
      };
    }
  }

  return {
    reversing: false,
    escaping: false,
    overrideThrottle: null,
    overrideSteer: null,
  };
}

/**
 * Computes angular tolerance for firing so bots shoot decisively on the move
 * whenever the barrel is genuinely aligned with the enemy tank silhouette.
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
  const maxYaw = Math.max(0.036, Math.atan2(2.05, safeRange) * 1.42);
  const maxElev = Math.max(0.032, Math.atan2(1.4, safeRange) * 1.42);
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
