export const TANK_CAPSULE_HALF_LEN = 1.65;
export const TANK_CAPSULE_RADIUS = 1.85;
export const TANK_MIN_SEPARATION = TANK_CAPSULE_RADIUS * 2; // 3.7m across hull width, ~7m length
export const RAM_DAMAGE = 20;
export const RAM_MIN_CLOSING_SPEED = 4.0; // m/s (~14.4 km/h)
export const RAM_COOLDOWN_SEC = 1.2;

export interface CollidableTank {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  alive: boolean;
  team: 'A' | 'B';
}

export interface RamHit {
  attackerId: string;
  victimId: string;
  damage: number;
  closingSpeed: number;
  nx: number;
  nz: number;
}

export interface CollisionResolution {
  separated: boolean;
  dxA: number;
  dzA: number;
  dxB: number;
  dzB: number;
  speedFactorA: number;
  speedFactorB: number;
  ramHits: RamHit[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Computes closest points between two 2D segments P1..Q1 and P2..Q2 (Ericson, Real-Time Collision Detection).
 */
export function closestPointsSegments2D(
  p1x: number,
  p1z: number,
  q1x: number,
  q1z: number,
  p2x: number,
  p2z: number,
  q2x: number,
  q2z: number,
) {
  const d1x = q1x - p1x;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z;
  const e = d2x * d2x + d2z * d2z;
  const f = d2x * rx + d2z * rz;

  let s = 0;
  let t = 0;

  if (a <= 1e-8 && e <= 1e-8) {
    return { c1x: p1x, c1z: p1z, c2x: p2x, c2z: p2z };
  }
  if (a <= 1e-8) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1z * rz;
    if (e <= 1e-8) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }

  return {
    c1x: p1x + d1x * s,
    c1z: p1z + d1z * s,
    c2x: p2x + d2x * t,
    c2z: p2z + d2z * t,
  };
}

export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

export function resolveTankCollisionPair(
  a: CollidableTank,
  b: CollidableTank,
  nowSec: number,
  ramCooldowns: Map<string, number>,
): CollisionResolution {
  const empty: CollisionResolution = {
    separated: false,
    dxA: 0,
    dzA: 0,
    dxB: 0,
    dzB: 0,
    speedFactorA: 1,
    speedFactorB: 1,
    ramHits: [],
  };

  if (!a.alive && !b.alive) return empty;

  // Quick broadphase reject
  const maxReach = (TANK_CAPSULE_HALF_LEN + TANK_CAPSULE_RADIUS) * 2 + 0.5;
  const cdx = b.x - a.x;
  const cdz = b.z - a.z;
  if (cdx * cdx + cdz * cdz > maxReach * maxReach) return empty;

  const ax = Math.sin(a.heading) * TANK_CAPSULE_HALF_LEN;
  const az = Math.cos(a.heading) * TANK_CAPSULE_HALF_LEN;
  const bx = Math.sin(b.heading) * TANK_CAPSULE_HALF_LEN;
  const bz = Math.cos(b.heading) * TANK_CAPSULE_HALF_LEN;

  const cp = closestPointsSegments2D(
    a.x - ax,
    a.z - az,
    a.x + ax,
    a.z + az,
    b.x - bx,
    b.z - bz,
    b.x + bx,
    b.z + bz,
  );

  let dx = cp.c2x - cp.c1x;
  let dz = cp.c2z - cp.c1z;
  let dist = Math.hypot(dx, dz);

  if (dist >= TANK_MIN_SEPARATION) return empty;

  let nx: number;
  let nz: number;
  if (dist > 1e-5) {
    nx = dx / dist;
    nz = dz / dist;
  } else {
    const cl = Math.hypot(cdx, cdz);
    if (cl > 1e-5) {
      nx = cdx / cl;
      nz = cdz / cl;
    } else {
      nx = 1;
      nz = 0;
    }
    dist = 0;
  }

  const overlap = TANK_MIN_SEPARATION - dist;
  const shareA = a.alive && b.alive ? 0.5 : a.alive ? 1.0 : 0.0;
  const shareB = a.alive && b.alive ? 0.5 : b.alive ? 1.0 : 0.0;

  const dxA = -nx * overlap * shareA;
  const dzA = -nz * overlap * shareA;
  const dxB = nx * overlap * shareB;
  const dzB = nz * overlap * shareB;

  const vAx = Math.sin(a.heading) * a.speed;
  const vAz = Math.cos(a.heading) * a.speed;
  const vBx = Math.sin(b.heading) * b.speed;
  const vBz = Math.cos(b.heading) * b.speed;

  // Positive when A and B are moving toward each other along the contact normal (A -> B)
  const closingSpeed = (vAx - vBx) * nx + (vAz - vBz) * nz;

  let speedFactorA = 1;
  let speedFactorB = 1;
  if (closingSpeed > 0.5) {
    speedFactorA = 0.25;
    speedFactorB = 0.25;
  } else if (overlap > 0.02) {
    speedFactorA = 0.7;
    speedFactorB = 0.7;
  }

  const ramHits: RamHit[] = [];
  if (a.alive && b.alive && a.team !== b.team && closingSpeed >= RAM_MIN_CLOSING_SPEED) {
    const key = pairKey(a.id, b.id);
    const readyAt = ramCooldowns.get(key) ?? -1e9;
    if (nowSec >= readyAt) {
      ramCooldowns.set(key, nowSec + RAM_COOLDOWN_SEC);
      const approachA = vAx * nx + vAz * nz; // A moving toward B
      const approachB = -(vBx * nx + vBz * nz); // B moving toward A

      if (approachA >= 3.5 && approachA > approachB * 1.15) {
        ramHits.push({ attackerId: a.id, victimId: b.id, damage: RAM_DAMAGE, closingSpeed, nx, nz });
      } else if (approachB >= 3.5 && approachB > approachA * 1.15) {
        ramHits.push({ attackerId: b.id, victimId: a.id, damage: RAM_DAMAGE, closingSpeed, nx: -nx, nz: -nz });
      } else {
        // Mutual high-speed head-on impact
        ramHits.push({ attackerId: a.id, victimId: b.id, damage: RAM_DAMAGE, closingSpeed, nx, nz });
        ramHits.push({ attackerId: b.id, victimId: a.id, damage: RAM_DAMAGE, closingSpeed, nx: -nx, nz: -nz });
      }
    }
  }

  return {
    separated: true,
    dxA,
    dzA,
    dxB,
    dzB,
    speedFactorA,
    speedFactorB,
    ramHits,
  };
}
