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
  gunDamage?: number;
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

// Gun-pivot local bounds expanded so the zone around the barrel & muzzle counts as barrel
export const BARREL_HITBOX_BOUNDS = {
  min: { x: -0.42, y: -0.42, z: -0.35 },
  max: { x: 0.42, y: 0.42, z: 5.65 },
} as const;

export function isPointInBarrelZone(x: number, y: number, z: number): boolean {
  const { min, max } = BARREL_HITBOX_BOUNDS;
  return x >= min.x && x <= max.x && y >= min.y && y <= max.y && z >= min.z && z <= max.z;
}

export function computeFrontDamage(baseGunDamage: number, maxPen: number, target: TankSpec): number {
  if (target.frontDamageRange) {
    const [minDmg, maxDmg] = target.frontDamageRange;
    const t = clamp((baseGunDamage - 55) / 25, 0, 1);
    return Math.round(minDmg + t * (maxDmg - minDmg));
  }
  if (target.frontDamageReduction >= 30) {
    const t = clamp((baseGunDamage - 55) / 15, 0, 1);
    return Math.round(30 + t * 5);
  }
  const smoothboreBonus =
    target.frontDamageReduction >= 20 && target.frontDamageReduction < 25 && maxPen >= 280 && baseGunDamage <= 60 ? 4 : 0;
  return Math.max(15, Math.round(baseGunDamage - target.frontDamageReduction + smoothboreBonus));
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

  // Tracks & gun barrel (expanded barrel/muzzle zone rarely ricochets)
  if (part === 'trackL' || part === 'trackR' || part === 'barrel') {
    const cos = clamp(-(vdir.x * n.x + vdir.y * n.y + vdir.z * n.z), 0, 1);
    const ang = Math.acos(cos);
    const limit = part === 'barrel' ? 84 * DEG : 72 * DEG;
    if (ang > limit) {
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
    ny += spec.id === 'leopard2a4' ? 0.05 : 0.25;
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

  const baseGunDamage = shell.gunDamage ?? 60;

  // Frontal penetration: reduced by target's frontal armor protection
  if (isFront) {
    const frontDmg = computeFrontDamage(baseGunDamage, maxPen, spec);
    return {
      result: 'pen',
      damage: frontDmg,
      base,
      effective,
      pen,
      angleDeg: angle / DEG,
      zone: part === 'turret' ? 'turretFront' : 'hullFront',
    };
  }

  // Side / rear / roof penetration: full base damage from the attacker's gun
  return {
    result: 'pen',
    damage: Math.round(baseGunDamage),
    base,
    effective,
    pen,
    angleDeg: angle / DEG,
    zone: isRear ? 'rear' : isTop ? 'deck' : 'side',
  };
}

/**
 * Machine gun bullet resolution: deals tiny chip damage (< 1 HP, scaled by attacker tank price)
 * without triggering cannon-grade fuel tank instant kills or track/barrel 1-shot breaks.
 */
export function resolveMgHit(part: HitPart, mgDamage: number): HitResolution {
  const safeDmg = clamp(mgDamage, 0.05, 0.99);
  return {
    result: 'pen',
    damage: safeDmg,
    base: 0,
    angleDeg: 0,
    zone: part,
  };
}
