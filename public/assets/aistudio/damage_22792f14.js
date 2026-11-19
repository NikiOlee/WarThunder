// Interim (Phase 1.5) armor model: per-face plate thickness, ricochet at >70 deg, effective armor = T / cos(theta).
// Phase 2 will replace the single HP pool with crew + internal modules.
const DEG = Math.PI / 180;

export const ARMOR_MM = { hullFront: 75, hullSide: 45, hullRear: 40, deck: 20, turretFront: 100, turretSide: 60, turretRear: 45, turretTop: 20 };

/**
 * @param part   'hull' | 'turret'
 * @param n      outward face normal in tank-local space (axis aligned)
 * @param vdir   shell travel direction in tank-local space (normalised)
 * @param shell  {muzzleVelocity}
 * @param speed  impact speed (m/s)
 */
export function resolveHit(part, n, vdir, shell, speed, zone) {
  if (part === 'trackL' || part === 'trackR' || part === 'barrel') {
    const c = Math.min(1, Math.max(0, -(vdir.x * n.x + vdir.y * n.y + vdir.z * n.z)));
    const ang = Math.acos(c);
    if (ang > 72 * DEG) return { result: 'ricochet', damage: 0, base: 0, angleDeg: ang / DEG };
    // tracks and gun barrel are thin: any non-grazing hit counts
    return part === 'barrel'
      ? { result: 'barrel', damage: 6, base: 0, angleDeg: ang / DEG }
      : { result: 'track', damage: 4, base: 0, angleDeg: ang / DEG, side: part === 'trackL' ? 'L' : 'R' };
  }
  let base;
  if (Math.abs(n.y) > 0.5) base = part === 'turret' ? ARMOR_MM.turretTop : ARMOR_MM.deck;
  else if (n.z > 0.5) base = part === 'turret' ? ARMOR_MM.turretFront : ARMOR_MM.hullFront;
  else if (n.z < -0.5) base = part === 'turret' ? ARMOR_MM.turretRear : ARMOR_MM.hullRear;
  else base = part === 'turret' ? ARMOR_MM.turretSide : ARMOR_MM.hullSide;

  const cos = Math.min(1, Math.max(0, -(vdir.x * n.x + vdir.y * n.y + vdir.z * n.z)));
  const angle = Math.acos(cos);
  if (angle > 70 * DEG) return { result: 'ricochet', damage: 0, base, angleDeg: angle / DEG };

  const effective = base / Math.max(cos, 0.05);
  const pen = 130 * Math.pow(speed / shell.muzzleVelocity, 1.2);        // mm, falls off with velocity
  if (pen < effective) return { result: 'nopen', damage: 0, base, effective, pen, angleDeg: angle / DEG };

  if (zone === 'fuel') return { result: 'fuel', damage: 999, base, effective, pen, angleDeg: angle / DEG };   // fuel tanks / engine bay: explosion
  let damage = 34 + Math.random() * 34 + (part === 'turret' ? 14 : 0);
  let crit = false;
  if (Math.random() < 0.12) { damage = 999; crit = true; }               // ammunition rack
  return { result: crit ? 'crit' : 'pen', damage, base, effective, pen, angleDeg: angle / DEG };
}
