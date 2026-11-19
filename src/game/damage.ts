import { getTankSpec, type TankSpec } from './tanks';

const DEG = Math.PI / 180;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface ShellInfo {
  muzzleVelocity: number;
  caliber?: number;
  penetrationMm?: number;
  maxRange?: number;
}

export type HitPart = 'hull' | 'turret' | 'trackL' | 'trackR' | 'barrel' | 'fuel';
export type HitResultType = 'pen' | 'crit' | 'nopen' | 'ricochet' | 'track' | 'barrel' | 'fuel';

export interface HitResolution {
  result: HitResultType;
  damage: number;
  base: number;
  effective?: number;
  pen?: number;
  angleDeg: number;
  side?: 'L' | 'R';
  zone?: string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Directional armor & damage calculation for T-55 and future vehicles.
 * Local coordinates: +Z forward, -Z rear, +X left, -X right, +Y up.
 */
export function resolveHit(
  part: HitPart,
  n: Vec3Like,
  vdir: Vec3Like,
  shell: ShellInfo,
  speed: number,
  zone?: string,
  spec: TankSpec = getTankSpec('t55'),
): HitResolution {
  const muzzleV = shell.muzzleVelocity || spec.muzzleVelocity;
  const maxPen = shell.penetrationMm ?? spec.penetrationMm;
  const pen = maxPen * Math.pow(Math.max(0, speed) / muzzleV, 1.2);

  // Fuel tank weakspot (rear/side hull): instant lethal detonation on accurate hit
  if (part === 'fuel' || zone === 'fuel') {
    const cos = clamp(-(vdir.x * n.x + vdir.y * n.y + vdir.z * n.z), 0, 1);
    const angle = Math.acos(cos);
    return {
      result: 'fuel',
      damage: spec.damage.fuel,
      base: spec.armor.hullRear,
      effective: spec.armor.hullRear,
      pen,
      angleDeg: angle / DEG,
      zone: 'fuel',
    };
  }

  // Tracks & gun barrel
  if (part === 'trackL' || part === 'trackR' || part === 'barrel') {
    const cos = clamp(-(vdir.x * n.x + vdir.y * n.y + vdir.z * n.z), 0, 1);
    const ang = Math.acos(cos);
    if (ang > 72 * DEG) {
      return { result: 'ricochet', damage: 0, base: 0, angleDeg: ang / DEG };
    }
    return part === 'barrel'
      ? { result: 'barrel', damage: 6, base: 0, angleDeg: ang / DEG }
      : { result: 'track', damage: 4, base: 0, angleDeg: ang / DEG, side: part === 'trackL' ? 'L' : 'R' };
  }

  const A = spec.armor;
  const isFront = n.z > 0.5;
  const isRear = n.z < -0.5;
  const isTop = Math.abs(n.y) > 0.5;

  let base: number;
  if (isTop) base = part === 'turret' ? A.turretTop : A.deck;
  else if (isFront) base = part === 'turret' ? A.turretFront : A.hullFront;
  else if (isRear) base = part === 'turret' ? A.turretRear : A.hullRear;
  else base = part === 'turret' ? A.turretSide : A.hullSide;

  // Apply realistic frontal glacis slope (sloped ~25° from vertical) & rounded turret front
  let nx = n.x;
  let ny = n.y;
  let nz = n.z;
  if (isFront && part === 'hull') {
    ny += 0.42;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
  } else if (isFront && part === 'turret') {
    ny += 0.25;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
  }

  const cos = clamp(-(vdir.x * nx + vdir.y * ny + vdir.z * nz), 0, 1);
  const angle = Math.acos(cos);
  const ricochetLimit = isFront ? 60 * DEG : 72 * DEG;
  if (angle > ricochetLimit) {
    return { result: 'ricochet', damage: 0, base, angleDeg: angle / DEG };
  }

  const effective = base / Math.max(cos, 0.05);
  if (pen < effective) {
    return { result: 'nopen', damage: 0, base, effective, pen, angleDeg: angle / DEG };
  }

  // Frontal penetration: minimal damage (50), no random instant ammo-rack explosion
  if (isFront) {
    return {
      result: 'pen',
      damage: spec.damage.front,
      base,
      effective,
      pen,
      angleDeg: angle / DEG,
      zone: part === 'turret' ? 'turretFront' : 'hullFront',
    };
  }

  // Side / rear / roof penetration: 60 damage
  return {
    result: 'pen',
    damage: spec.damage.sideRear,
    base,
    effective,
    pen,
    angleDeg: angle / DEG,
    zone: isRear ? 'rear' : isTop ? 'deck' : 'side',
  };
}
