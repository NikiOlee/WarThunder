export interface OrbitBoxCollider {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface MenuOrbitConfig {
  targetX: number;
  targetY: number;
  targetZ: number;
  minPitch: number;
  maxPitch: number;
  minDist: number;
  maxDist: number;
  groundClearance: number;
  obstaclePadding: number;
  dampingRate: number;
}

export const DEFAULT_MENU_ORBIT_CONFIG: MenuOrbitConfig = {
  targetX: 0,
  targetY: 1.75,
  targetZ: 0,
  minPitch: 0.08, // ~4.6 deg strictly above horizon/ground
  maxPitch: 1.15, // ~66 deg overhead cap
  minDist: 6.2,
  maxDist: 21.0,
  groundClearance: 0.65,
  obstaclePadding: 0.55,
  dampingRate: 12,
};

export interface MenuOrbitState {
  yaw: number;
  pitch: number;
  dist: number;
  targetYaw: number;
  targetPitch: number;
  targetDist: number;
  dragging: boolean;
}

export function createMenuOrbitState(
  yaw = 0.62,
  pitch = 0.24,
  dist = 11.4,
  config: MenuOrbitConfig = DEFAULT_MENU_ORBIT_CONFIG,
): MenuOrbitState {
  const clampedPitch = clampPitch(pitch, config);
  const clampedDist = clampDist(dist, config);
  return {
    yaw,
    pitch: clampedPitch,
    dist: clampedDist,
    targetYaw: yaw,
    targetPitch: clampedPitch,
    targetDist: clampedDist,
    dragging: false,
  };
}

export function clampVal(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clampPitch(pitch: number, config: MenuOrbitConfig = DEFAULT_MENU_ORBIT_CONFIG): number {
  return clampVal(pitch, config.minPitch, config.maxPitch);
}

export function clampDist(dist: number, config: MenuOrbitConfig = DEFAULT_MENU_ORBIT_CONFIG): number {
  return clampVal(dist, config.minDist, config.maxDist);
}

export function applyMenuOrbitDrag(
  state: MenuOrbitState,
  deltaX: number,
  deltaY: number,
  sensitivity = 0.0065,
  config: MenuOrbitConfig = DEFAULT_MENU_ORBIT_CONFIG,
): void {
  state.targetYaw -= deltaX * sensitivity;
  state.targetPitch = clampPitch(state.targetPitch + deltaY * sensitivity, config);
}

export function applyMenuOrbitZoom(
  state: MenuOrbitState,
  wheelDeltaY: number,
  config: MenuOrbitConfig = DEFAULT_MENU_ORBIT_CONFIG,
): void {
  const dir = Math.sign(wheelDeltaY);
  if (dir === 0) return;
  const factor = dir > 0 ? 1.09 : 1 / 1.09;
  state.targetDist = clampDist(state.targetDist * factor, config);
}

export function stepMenuOrbitState(
  state: MenuOrbitState,
  dt: number,
  smooth: boolean,
  config: MenuOrbitConfig = DEFAULT_MENU_ORBIT_CONFIG,
): void {
  state.targetPitch = clampPitch(state.targetPitch, config);
  state.targetDist = clampDist(state.targetDist, config);
  if (!smooth || dt <= 0) {
    state.yaw = state.targetYaw;
    state.pitch = state.targetPitch;
    state.dist = state.targetDist;
    return;
  }
  const alpha = 1 - Math.exp(-config.dampingRate * Math.min(dt, 0.1));
  state.yaw += (state.targetYaw - state.yaw) * alpha;
  state.pitch += (state.targetPitch - state.pitch) * alpha;
  state.dist += (state.targetDist - state.dist) * alpha;
}

/**
 * Computes ray entry fraction t in [0, 1] along segment A -> B against an AABB expanded by `pad`.
 * Returns null if segment misses or starts already inside (in which case caller handles minimum separation).
 */
export function segmentAabbHitFraction(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  box: OrbitBoxCollider,
  pad: number,
): number | null {
  const minX = box.minX - pad;
  const minY = box.minY - pad;
  const minZ = box.minZ - pad;
  const maxX = box.maxX + pad;
  const maxY = box.maxY + pad;
  const maxZ = box.maxZ + pad;

  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;

  let tmin = 0;
  let tmax = 1;

  const checkAxis = (o: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-8) {
      return o >= lo && o <= hi;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  };

  if (!checkAxis(ax, dx, minX, maxX)) return null;
  if (!checkAxis(ay, dy, minY, maxY)) return null;
  if (!checkAxis(az, dz, minZ, maxZ)) return null;

  if (tmin <= 0 || tmin > 1) return null;
  return tmin;
}

export interface ResolvedOrbitCameraPose {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  effectiveDist: number;
  clampedByObstacle: boolean;
  clampedByGround: boolean;
}

/**
 * Resolves desired spherical orbit position around target against terrain height ridges
 * and obstacle AABB colliders so the camera never dips below terrain or passes through rocks/props.
 */
export function resolveMenuCameraPose(
  state: Pick<MenuOrbitState, 'yaw' | 'pitch' | 'dist'>,
  heightAt: (x: number, z: number) => number,
  obstacles: ReadonlyArray<OrbitBoxCollider>,
  config: MenuOrbitConfig = DEFAULT_MENU_ORBIT_CONFIG,
  out?: ResolvedOrbitCameraPose,
): ResolvedOrbitCameraPose {
  const res: ResolvedOrbitCameraPose = out ?? {
    x: 0,
    y: 0,
    z: 0,
    targetX: config.targetX,
    targetY: config.targetY,
    targetZ: config.targetZ,
    effectiveDist: state.dist,
    clampedByObstacle: false,
    clampedByGround: false,
  };

  const pitch = clampPitch(state.pitch, config);
  const desiredDist = clampDist(state.dist, config);

  const cosP = Math.cos(pitch);
  const dirX = Math.sin(state.yaw) * cosP;
  const dirY = Math.sin(pitch);
  const dirZ = Math.cos(state.yaw) * cosP;

  const tx = config.targetX;
  const ty = config.targetY;
  const tz = config.targetZ;

  // Compute desired unclipped camera position
  const rawX = tx + dirX * desiredDist;
  const rawY = ty + dirY * desiredDist;
  const rawZ = tz + dirZ * desiredDist;

  // 1. Check ray from target toward desired camera against obstacle boxes
  let safeFrac = 1;
  let hitObstacle = false;
  for (let i = 0; i < obstacles.length; i++) {
    const t = segmentAabbHitFraction(tx, ty, tz, rawX, rawY, rawZ, obstacles[i], config.obstaclePadding);
    if (t !== null && t < safeFrac) {
      safeFrac = t;
      hitObstacle = true;
    }
  }

  // 2. Check terrain height along the ray so hills/ridges between target & camera also pull camera in
  // Wait until clearance is violated, then binary search exact entry point
  let hitGround = false;
  const minSafeFrac = Math.min(1, 3.6 / Math.max(0.1, desiredDist));
  const STEPS = 18;
  let prevSafe = 0;
  for (let s = 1; s <= STEPS; s++) {
    const f = (s / STEPS) * safeFrac;
    const sx = tx + (rawX - tx) * f;
    const sy = ty + (rawY - ty) * f;
    const sz = tz + (rawZ - tz) * f;
    const floorY = heightAt(sx, sz) + config.groundClearance;
    if (sy < floorY) {
      let lo = prevSafe;
      let hi = f;
      for (let it = 0; it < 7; it++) {
        const mid = (lo + hi) * 0.5;
        const mx = tx + (rawX - tx) * mid;
        const my = ty + (rawY - ty) * mid;
        const mz = tz + (rawZ - tz) * mid;
        if (my < heightAt(mx, mz) + config.groundClearance) hi = mid;
        else lo = mid;
      }
      if (lo < safeFrac) {
        safeFrac = lo;
        hitGround = true;
      }
      break;
    }
    prevSafe = f;
  }

  // Pull back slightly if clamped by obstacle, while respecting minimum hull clearance
  if (hitObstacle || hitGround) {
    safeFrac = Math.max(minSafeFrac, safeFrac * 0.96);
  }

  let finalDist = desiredDist * safeFrac;
  let cx = tx + dirX * finalDist;
  let cy = ty + dirY * finalDist;
  let cz = tz + dirZ * finalDist;

  // Final strict safety floor guarantee at resolved (cx, cz)
  const finalFloor = heightAt(cx, cz) + config.groundClearance;
  if (cy < finalFloor) {
    cy = finalFloor;
    hitGround = true;
  }

  // Ensure camera does not fall inside the tank hull bounds even under extreme corner pull-in
  const horiz = Math.hypot(cx - tx, cz - tz);
  if (horiz < 3.4 && cy < ty + 2.2) {
    const scale = 3.4 / Math.max(0.01, horiz);
    cx = tx + (cx - tx) * scale;
    cz = tz + (cz - tz) * scale;
    finalDist = Math.hypot(cx - tx, cy - ty, cz - tz);
    const clampedFloor = heightAt(cx, cz) + config.groundClearance;
    if (cy < clampedFloor) {
      cy = clampedFloor;
      hitGround = true;
    }
  }

  res.x = cx;
  res.y = cy;
  res.z = cz;
  res.targetX = tx;
  res.targetY = ty;
  res.targetZ = tz;
  res.effectiveDist = finalDist;
  res.clampedByObstacle = hitObstacle;
  res.clampedByGround = hitGround;
  return res;
}
