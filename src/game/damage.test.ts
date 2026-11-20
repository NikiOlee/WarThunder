import test from 'node:test';
import assert from 'node:assert/strict';
import { getTankSpec, getSelectedTankId, setSelectedTankId, DEFAULT_TANK_ID, getAllTanks } from './tanks';
import { BARREL_HITBOX_BOUNDS, isPointInBarrelZone, resolveHit } from './damage';

test('T-55, M60A3 Patton, T-62M, T-72B3, Leopard 2A4, M1A1 Abrams, ZTZ-96A, and T-90M specs match order, speed, reload, maxRange, price, and gunDamage values', () => {
  const tanks = getAllTanks();
  assert.equal(tanks.length, 8);
  assert.equal(tanks[0].id, 't55');
  assert.equal(tanks[0].name, 'Т-55');
  assert.equal(tanks[1].id, 'm60a3');
  assert.equal(tanks[1].name, 'M60A3 Patton');
  assert.equal(tanks[2].id, 't62m');
  assert.equal(tanks[2].name, 'Т-62М');
  assert.equal(tanks[3].id, 't72b3');
  assert.equal(tanks[3].name, 'Т-72Б3');
  assert.equal(tanks[4].id, 'leopard2a4');
  assert.equal(tanks[4].name, 'Leopard 2A4');
  assert.equal(tanks[5].id, 'm1a1');
  assert.equal(tanks[5].name, 'M1A1 Abrams');
  assert.equal(tanks[6].id, 'ztz96a');
  assert.equal(tanks[6].name, 'ZTZ-96A');
  assert.equal(tanks[7].id, 't90m');
  assert.equal(tanks[7].name, 'Т-90М');

  const t55 = getTankSpec(DEFAULT_TANK_ID);
  assert.equal(t55.maxSpeedKmh, 50);
  assert.ok(Math.abs(t55.maxSpeed * 3.6 - 50) < 0.01);
  assert.equal(t55.reload, 4.0);
  assert.equal(t55.maxRange, 400);
  assert.equal(t55.gunDamage, 60);
  assert.equal(t55.armor.hullFront, 200);
  assert.equal(getSelectedTankId(), 't55');
  assert.equal(setSelectedTankId('t55'), 't55');

  const m60 = getTankSpec('m60a3');
  assert.equal(m60.priceSilver, 1500);
  assert.equal(m60.maxSpeedKmh, 48);
  assert.ok(Math.abs(m60.maxSpeed * 3.6 - 48) < 0.01);
  assert.equal(m60.reload, 3.5);
  assert.equal(m60.maxRange, 500);
  assert.equal(m60.gunDamage, 55);
  assert.ok(m60.damage.fuel >= m60.maxHp);

  const t62m = getTankSpec('t62m');
  assert.equal(t62m.priceSilver, 2500);
  assert.equal(t62m.maxSpeedKmh, 50);
  assert.ok(Math.abs(t62m.maxSpeed * 3.6 - 50) < 0.01);
  assert.equal(t62m.reload, 3.5);
  assert.equal(t62m.maxRange, 550);
  assert.equal(t62m.gunDamage, 60);
  assert.ok(t62m.gunDamage >= t55.gunDamage && t62m.gunDamage >= m60.gunDamage);
  assert.ok(t62m.damage.fuel >= t62m.maxHp);

  const t72b3 = getTankSpec('t72b3');
  assert.equal(t72b3.priceSilver, 4000);
  assert.equal(t72b3.maxSpeedKmh, 60);
  assert.ok(Math.abs(t72b3.maxSpeed * 3.6 - 60) < 0.01);
  assert.equal(t72b3.reload, 3.6);
  assert.equal(t72b3.maxRange, 600);
  assert.equal(t72b3.gunDamage, 65);
  assert.ok(t72b3.damage.fuel >= t72b3.maxHp);

  const leo = getTankSpec('leopard2a4');
  assert.equal(leo.priceSilver, 5500);
  assert.equal(leo.maxSpeedKmh, 65);
  assert.ok(Math.abs(leo.maxSpeed * 3.6 - 65) < 0.01);
  assert.equal(leo.reload, 3.0);
  assert.equal(leo.maxRange, 650);
  assert.equal(leo.gunDamage, 70);
  assert.ok(leo.damage.fuel >= leo.maxHp);

  const m1a1 = getTankSpec('m1a1');
  assert.equal(m1a1.priceSilver, 6800);
  assert.equal(m1a1.maxSpeedKmh, 70);
  assert.ok(Math.abs(m1a1.maxSpeed * 3.6 - 70) < 0.01);
  assert.equal(m1a1.reload, 2.9);
  assert.equal(m1a1.maxRange, 680);
  assert.equal(m1a1.gunDamage, 70);
  assert.deepEqual(m1a1.frontDamageRange, [25, 35]);
  assert.ok(m1a1.damage.fuel >= m1a1.maxHp);

  const ztz96a = getTankSpec('ztz96a');
  assert.equal(ztz96a.priceSilver, 8500);
  assert.equal(ztz96a.maxSpeedKmh, 65);
  assert.ok(Math.abs(ztz96a.maxSpeed * 3.6 - 65) < 0.01);
  assert.equal(ztz96a.reload, 3.5);
  assert.equal(ztz96a.maxRange, 700);
  assert.equal(ztz96a.gunDamage, 80);
  assert.deepEqual(ztz96a.frontDamageRange, [25, 30]);
  assert.ok(ztz96a.damage.fuel >= ztz96a.maxHp);

  const t90m = getTankSpec('t90m');
  assert.equal(t90m.priceSilver, 10500);
  assert.equal(t90m.maxSpeedKmh, 70);
  assert.ok(Math.abs(t90m.maxSpeed * 3.6 - 70) < 0.01);
  assert.equal(t90m.reload, 3.0);
  assert.equal(t90m.maxRange, 730);
  assert.equal(t90m.gunDamage, 75);
  assert.deepEqual(t90m.frontDamageRange, [20, 28]);
  assert.ok(t90m.damage.fuel >= t90m.maxHp);
});

test('Damage depends on attacker gunDamage and target armor zone (Patton and T-62M)', () => {
  const t55 = getTankSpec('t55');
  const m60 = getTankSpec('m60a3');
  const t62m = getTankSpec('t62m');

  const t55Shell = { muzzleVelocity: t55.muzzleVelocity, penetrationMm: t55.penetrationMm, gunDamage: t55.gunDamage };
  const m60Shell = { muzzleVelocity: m60.muzzleVelocity, penetrationMm: m60.penetrationMm, gunDamage: m60.gunDamage };
  const t62Shell = { muzzleVelocity: t62m.muzzleVelocity, penetrationMm: t62m.penetrationMm, gunDamage: t62m.gunDamage };

  // M60A3 Patton hit by T-55 (60 dmg) -> 40 front, 60 side/rear; hit by Patton (55 dmg) -> 35 front, 55 side/rear
  const m60FrontFromT55 = resolveHit('hull', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t55Shell, 495, 'hull', m60);
  assert.equal(m60FrontFromT55.result, 'pen');
  assert.equal(m60FrontFromT55.damage, 40);

  const m60SideFromPatton = resolveHit('hull', { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, m60Shell, 480, 'hull', m60);
  assert.equal(m60SideFromPatton.result, 'pen');
  assert.equal(m60SideFromPatton.damage, 55);

  const m60Fuel = resolveHit('fuel', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, m60Shell, 460, 'fuel', m60);
  assert.equal(m60Fuel.result, 'fuel');
  assert.ok(m60Fuel.damage >= m60.maxHp);

  // T-62M reinforced front takes 35-45 damage depending on enemy gun; side/rear takes full attacker base damage; fuel is oneshot
  const t62FrontFromPatton = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, m60Shell, 535, 'turret', t62m);
  assert.equal(t62FrontFromPatton.result, 'pen');
  assert.equal(t62FrontFromPatton.damage, 35);
  assert.ok(t62FrontFromPatton.damage >= 35 && t62FrontFromPatton.damage <= 45);

  const t62FrontFromT55 = resolveHit('hull', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t55Shell, 498, 'hull', t62m);
  assert.equal(t62FrontFromT55.result, 'pen');
  assert.equal(t62FrontFromT55.damage, 40);
  assert.ok(t62FrontFromT55.damage >= 35 && t62FrontFromT55.damage <= 45);

  const t62FrontFromT62 = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t62Shell, 575, 'turret', t62m);
  assert.equal(t62FrontFromT62.result, 'pen');
  assert.equal(t62FrontFromT62.damage, 44);
  assert.ok(t62FrontFromT62.damage >= 35 && t62FrontFromT62.damage <= 45);

  const t62SideFromT55 = resolveHit('hull', { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, t55Shell, 460, 'hull', t62m);
  assert.equal(t62SideFromT55.result, 'pen');
  assert.equal(t62SideFromT55.damage, 60);

  const t62RearFromPatton = resolveHit('hull', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, m60Shell, 480, 'hull', t62m);
  assert.equal(t62RearFromPatton.result, 'pen');
  assert.equal(t62RearFromPatton.damage, 55);

  const t62Fuel = resolveHit('fuel', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, m60Shell, 450, 'fuel', t62m);
  assert.equal(t62Fuel.result, 'fuel');
  assert.ok(t62Fuel.damage >= t62m.maxHp);

  // T-72B3 Relikt front takes 30-40 damage depending on enemy gun; side/rear takes full attacker base damage; fuel is oneshot
  const t72b3 = getTankSpec('t72b3');
  const t72Shell = { muzzleVelocity: t72b3.muzzleVelocity, penetrationMm: t72b3.penetrationMm, gunDamage: t72b3.gunDamage };

  const t72FrontFromPatton = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, m60Shell, 535, 'turret', t72b3);
  assert.equal(t72FrontFromPatton.result, 'pen');
  assert.equal(t72FrontFromPatton.damage, 30);

  const t72FrontFromT55 = resolveHit('hull', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t55Shell, 498, 'hull', t72b3);
  assert.equal(t72FrontFromT55.result, 'pen');
  assert.equal(t72FrontFromT55.damage, 35);

  const t72FrontFromT62 = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t62Shell, 575, 'turret', t72b3);
  assert.equal(t72FrontFromT62.result, 'pen');
  assert.equal(t72FrontFromT62.damage, 35);

  const t72FrontFromT72 = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t72Shell, 615, 'turret', t72b3);
  assert.equal(t72FrontFromT72.result, 'pen');
  assert.equal(t72FrontFromT72.damage, 40);

  const t72SideFromT55 = resolveHit('hull', { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, t55Shell, 460, 'hull', t72b3);
  assert.equal(t72SideFromT55.result, 'pen');
  assert.equal(t72SideFromT55.damage, 60);

  const t72RearFromT72 = resolveHit('hull', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, t72Shell, 580, 'hull', t72b3);
  assert.equal(t72RearFromT72.result, 'pen');
  assert.equal(t72RearFromT72.damage, 65);

  const t72Fuel = resolveHit('fuel', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, m60Shell, 450, 'fuel', t72b3);
  assert.equal(t72Fuel.result, 'fuel');
  assert.ok(t72Fuel.damage >= t72b3.maxHp);

  // Leopard 2A4 composite front takes 30-35 damage depending on enemy gun; side/rear takes full attacker base damage; fuel is oneshot
  const leo = getTankSpec('leopard2a4');
  const leoShell = { muzzleVelocity: leo.muzzleVelocity, penetrationMm: leo.penetrationMm, gunDamage: leo.gunDamage };

  const leoFrontFromPatton = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, m60Shell, 535, 'turret', leo);
  assert.equal(leoFrontFromPatton.result, 'pen');
  assert.equal(leoFrontFromPatton.damage, 30);

  const leoFrontFromT55 = resolveHit('hull', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t55Shell, 498, 'hull', leo);
  assert.equal(leoFrontFromT55.result, 'pen');
  assert.ok(leoFrontFromT55.damage >= 30 && leoFrontFromT55.damage <= 35);

  const leoFrontTurretFromT55 = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t55Shell, 498, 'turret', leo);
  assert.equal(leoFrontTurretFromT55.result, 'pen');
  assert.ok(leoFrontTurretFromT55.damage >= 30 && leoFrontTurretFromT55.damage <= 35);

  const leoFrontFromT72 = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t72Shell, 615, 'turret', leo);
  assert.equal(leoFrontFromT72.result, 'pen');
  assert.ok(leoFrontFromT72.damage >= 30 && leoFrontFromT72.damage <= 35);

  const leoFrontFromLeo = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, leoShell, 645, 'turret', leo);
  assert.equal(leoFrontFromLeo.result, 'pen');
  assert.equal(leoFrontFromLeo.damage, 35);

  const leoSideFromT55 = resolveHit('hull', { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, t55Shell, 460, 'hull', leo);
  assert.equal(leoSideFromT55.result, 'pen');
  assert.equal(leoSideFromT55.damage, 60);

  const leoRearFromLeo = resolveHit('hull', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, leoShell, 610, 'hull', leo);
  assert.equal(leoRearFromLeo.result, 'pen');
  assert.equal(leoRearFromLeo.damage, 70);

  const leoFuel = resolveHit('fuel', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, m60Shell, 450, 'fuel', leo);
  assert.equal(leoFuel.result, 'fuel');
  assert.ok(leoFuel.damage >= leo.maxHp);
});

test('M1A1 Abrams, ZTZ-96A and T-90M reduce frontal damage, take full side/rear damage and die to a fuel hit', () => {
  const m1a1 = getTankSpec('m1a1');
  const ztz96a = getTankSpec('ztz96a');
  const t90m = getTankSpec('t90m');
  const strongShell = { muzzleVelocity: 750, penetrationMm: 420, gunDamage: 80 };
  const t55Shell = { muzzleVelocity: 500, penetrationMm: 240, gunDamage: 60 };

  const m1Front = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, strongShell, 745, 'turret', m1a1);
  assert.equal(m1Front.result, 'pen');
  assert.equal(m1Front.damage, 35);
  const m1HullFront = resolveHit('hull', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, strongShell, 745, 'hull', m1a1);
  assert.equal(m1HullFront.result, 'pen');
  assert.equal(m1HullFront.damage, 35);

  const ztzFront = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, strongShell, 745, 'turret', ztz96a);
  assert.equal(ztzFront.result, 'pen');
  assert.equal(ztzFront.damage, 30);

  const t90Front = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, strongShell, 745, 'turret', t90m);
  assert.equal(t90Front.result, 'pen');
  assert.equal(t90Front.damage, 28);

  // Old 100mm AP cannot punch the modern composite front
  const oldVsAbrams = resolveHit('hull', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, t55Shell, 498, 'hull', m1a1);
  assert.notEqual(oldVsAbrams.result, 'pen');

  for (const target of [m1a1, ztz96a, t90m]) {
    const side = resolveHit('hull', { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, t55Shell, 460, 'hull', target);
    assert.equal(side.result, 'pen');
    assert.equal(side.damage, 60);

    const rear = resolveHit('hull', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, t55Shell, 460, 'hull', target);
    assert.equal(rear.result, 'pen');
    assert.equal(rear.damage, 60);

    const fuel = resolveHit('fuel', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, t55Shell, 440, 'fuel', target);
    assert.equal(fuel.result, 'fuel');
    assert.ok(fuel.damage >= target.maxHp);
  }
});

test('Frontal 200mm sloped armor on T-55 deals 50 damage vs T-55 gun and resists angled/long-range shots', () => {
  const t55 = getTankSpec('t55');
  const shell = { muzzleVelocity: t55.muzzleVelocity, penetrationMm: t55.penetrationMm, gunDamage: t55.gunDamage };

  // Perpendicular close-range hit to frontal hull
  const closeFront = resolveHit('hull', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, shell, 495, 'hull', t55);
  assert.equal(closeFront.result, 'pen');
  assert.equal(closeFront.damage, 50);
  assert.equal(closeFront.base, 200);

  // Frontal turret hit
  const closeTurret = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, shell, 495, 'turret', t55);
  assert.equal(closeTurret.result, 'pen');
  assert.equal(closeTurret.damage, 50);

  // Angled frontal hull shot fails to penetrate due to 200mm + slope
  const angledDir = { x: Math.sin(0.55), y: 0, z: -Math.cos(0.55) };
  const angledFront = resolveHit('hull', { x: 0, y: 0, z: 1 }, angledDir, shell, 490, 'hull', t55);
  assert.ok(angledFront.result === 'nopen' || angledFront.result === 'ricochet');
  assert.equal(angledFront.damage, 0);

  // Steep grazing angle ricochets
  const grazeDir = { x: Math.sin(1.2), y: 0, z: -Math.cos(1.2) };
  const graze = resolveHit('hull', { x: 0, y: 0, z: 1 }, grazeDir, shell, 500, 'hull', t55);
  assert.equal(graze.result, 'ricochet');
  assert.equal(graze.damage, 0);

  // Long-range (low speed) frontal shot does not penetrate
  const longFront = resolveHit('hull', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, shell, 420, 'hull', t55);
  assert.equal(longFront.result, 'nopen');
  assert.equal(longFront.damage, 0);
});

test('Side and rear hull hits on T-55 from T-55 deal full 60 damage', () => {
  const t55 = getTankSpec('t55');
  const shell = { muzzleVelocity: t55.muzzleVelocity, penetrationMm: t55.penetrationMm, gunDamage: t55.gunDamage };

  const leftSide = resolveHit('hull', { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, shell, 450, 'hull', t55);
  assert.equal(leftSide.result, 'pen');
  assert.equal(leftSide.damage, 60);

  const rightSide = resolveHit('hull', { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, shell, 450, 'hull', t55);
  assert.equal(rightSide.result, 'pen');
  assert.equal(rightSide.damage, 60);

  const rear = resolveHit('hull', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, shell, 450, 'hull', t55);
  assert.equal(rear.result, 'pen');
  assert.equal(rear.damage, 60);
});

test('Fuel tank weakspot hit causes instant lethal destruction (oneshot)', () => {
  const t55 = getTankSpec('t55');
  const shell = { muzzleVelocity: t55.muzzleVelocity, penetrationMm: t55.penetrationMm, gunDamage: t55.gunDamage };

  const fuelHit = resolveHit('fuel', { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, shell, 440, 'fuel', t55);
  assert.equal(fuelHit.result, 'fuel');
  assert.ok(fuelHit.damage >= t55.maxHp);

  const fuelRearHit = resolveHit('hull', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, shell, 440, 'fuel', t55);
  assert.equal(fuelRearHit.result, 'fuel');
  assert.ok(fuelRearHit.damage >= t55.maxHp);
});

test('Expanded zone around barrel and muzzle counts as barrel hit', () => {
  const t55 = getTankSpec('t55');
  const shell = { muzzleVelocity: t55.muzzleVelocity, penetrationMm: t55.penetrationMm, gunDamage: t55.gunDamage };

  // Zone around muzzle tip and barrel shaft (+/- 0.3m lateral, ahead of muzzle z=4.75..5.4, collar z=-0.2)
  assert.ok(BARREL_HITBOX_BOUNDS.max.x >= 0.35);
  assert.equal(isPointInBarrelZone(0.32, 0.25, 2.5), true);
  assert.equal(isPointInBarrelZone(0.0, 0.0, 5.5), true);
  assert.equal(isPointInBarrelZone(-0.2, 0.1, -0.2), true);

  // Grazing shot along the barrel zone still resolves as 'barrel' damage
  const barrelHit = resolveHit('barrel', { x: 1, y: 0, z: 0 }, { x: -0.25, y: 0, z: -0.96 }, shell, 480, 'barrel', t55);
  assert.equal(barrelHit.result, 'barrel');
  assert.ok(barrelHit.damage > 0);
});

test('Juggernaut Maus spec has 4000 HP (+3000), -5% speed/turret traverse, and 8.5s reload', () => {
  const maus = getTankSpec('maus');
  assert.equal(maus.id, 'maus');
  assert.equal(maus.maxHp, 4000);
  assert.ok(Math.abs(maus.maxSpeedKmh - 20.9) < 1e-6);
  assert.ok(Math.abs(maus.maxSpeed - (22 * 0.95) / 3.6) < 1e-6);
  assert.ok(Math.abs(maus.traverseRate - 16 * 0.95 * (Math.PI / 180)) < 1e-6);
  assert.equal(maus.reload, 8.5);
});
