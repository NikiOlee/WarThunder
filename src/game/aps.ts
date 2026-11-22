export interface TrophyApsConfig {
  cooldownMin: number;
  cooldownMax: number;
  interceptRadius: number;
}

export interface TrophyApsState {
  cooldown: number;
  lastCooldownDuration: number;
  intercepts: number;
}

export function createApsState(): TrophyApsState {
  return {
    cooldown: 0,
    lastCooldownDuration: 0,
    intercepts: 0,
  };
}

export function stepApsState(state: TrophyApsState, dt: number): void {
  if (state.cooldown > 0) {
    state.cooldown = Math.max(0, state.cooldown - Math.max(0, dt));
  }
}

export function closestPointOnSegment(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): { distSq: number; ix: number; iy: number; iz: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (abLenSq > 1e-9) {
    t = ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / abLenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const ix = ax + abx * t;
  const iy = ay + aby * t;
  const iz = az + abz * t;
  const dx = cx - ix;
  const dy = cy - iy;
  const dz = cz - iz;
  return {
    distSq: dx * dx + dy * dy + dz * dz,
    ix,
    iy,
    iz,
    t,
  };
}

export interface CanInterceptParams {
  alive: boolean;
  apsConfig?: TrophyApsConfig | null;
  apsState?: TrophyApsState | null;
  projectileType: string;
  isFriendlyOrSelf: boolean;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  vx: number;
  vy: number;
  vz: number;
  tx: number;
  ty: number;
  tz: number;
}

export function canInterceptProjectile(params: CanInterceptParams): {
  intercept: boolean;
  ix: number;
  iy: number;
  iz: number;
} {
  if (!params.alive || !params.apsConfig || !params.apsState) {
    return { intercept: false, ix: params.bx, iy: params.by, iz: params.bz };
  }
  if (params.apsState.cooldown > 0) {
    return { intercept: false, ix: params.bx, iy: params.by, iz: params.bz };
  }
  // Active protection ignores machine gun bullets and only engages shells/rockets
  if (params.projectileType === 'MG') {
    return { intercept: false, ix: params.bx, iy: params.by, iz: params.bz };
  }
  if (params.isFriendlyOrSelf) {
    return { intercept: false, ix: params.bx, iy: params.by, iz: params.bz };
  }

  // Only intercept shells actually approaching the vehicle center
  const approachDot = params.vx * (params.tx - params.ax) + params.vy * (params.ty - params.ay) + params.vz * (params.tz - params.az);
  if (approachDot <= 0) {
    return { intercept: false, ix: params.bx, iy: params.by, iz: params.bz };
  }

  const closest = closestPointOnSegment(
    params.ax,
    params.ay,
    params.az,
    params.bx,
    params.by,
    params.bz,
    params.tx,
    params.ty,
    params.tz,
  );
  const rSq = params.apsConfig.interceptRadius * params.apsConfig.interceptRadius;
  if (closest.distSq > rSq) {
    return { intercept: false, ix: params.bx, iy: params.by, iz: params.bz };
  }

  // Place visual detonation slightly forward of closest approach so sparks pop in mid-air outside armor
  const backShift = Math.max(0, closest.t - 0.35);
  const ix = params.ax + (params.bx - params.ax) * backShift;
  const iy = params.ay + (params.by - params.ay) * backShift;
  const iz = params.az + (params.bz - params.az) * backShift;
  return { intercept: true, ix, iy, iz };
}

export function triggerApsIntercept(
  state: TrophyApsState,
  config: TrophyApsConfig,
  rng: () => number = Math.random,
): number {
  const r = Math.min(1, Math.max(0, rng()));
  const duration = config.cooldownMin + r * Math.max(0, config.cooldownMax - config.cooldownMin);
  state.cooldown = duration;
  state.lastCooldownDuration = duration;
  state.intercepts += 1;
  return duration;
}
