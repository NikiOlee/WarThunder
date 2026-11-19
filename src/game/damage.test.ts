import test from 'node:test';
import assert from 'node:assert/strict';
import { getTankSpec, getSelectedTankId, setSelectedTankId, DEFAULT_TANK_ID, getAllTanks } from './tanks';
import { BARREL_HITBOX_BOUNDS, isPointInBarrelZone, resolveHit } from './damage';

test('T-55 and M60A3 Patton specs match speed, reload, maxRange, price, and damage values', () => {
  const tanks = getAllTanks();
  assert.equal(tanks.length, 2);
  assert.equal(tanks[0].id, 't55');
  assert.equal(tanks[0].name, 'Т-55');
  assert.equal(tanks[1].id, 'm60a3');
  assert.equal(tanks[1].name, 'M60A3 Patton');

  const t55 = getTankSpec(DEFAULT_TANK_ID);
  assert.equal(t55.maxSpeedKmh, 50);
  assert.ok(Math.abs(t55.maxSpeed * 3.6 - 50) < 0.01);
  assert.equal(t55.reload, 4.0);
  assert.equal(t55.maxRange, 400);
  assert.equal(t55.armor.hullFront, 200);
  assert.equal(t55.damage.front, 50);
  assert.equal(t55.damage.sideRear, 60);
  assert.equal(getSelectedTankId(), 't55');
  assert.equal(setSelectedTankId('t55'), 't55');

  const m60 = getTankSpec('m60a3');
  assert.equal(m60.priceSilver, 1500);
  assert.equal(m60.maxSpeedKmh, 48);
  assert.ok(Math.abs(m60.maxSpeed * 3.6 - 48) < 0.01);
  assert.equal(m60.reload, 3.5);
  assert.equal(m60.maxRange, 500);
  assert.equal(m60.damage.front, 40);
  assert.equal(m60.damage.sideRear, 55);
  assert.ok(m60.damage.fuel >= m60.maxHp);
});

test('M60A3 Patton armor deals 40 front, 55 side/rear, and instant fuel tank oneshot', () => {
  const m60 = getTankSpec('m60a3');
  const shell = { muzzleVelocity: 540, penetrationMm: 265 };

  const frontHull = resolveHit('hull', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, shell, 535, 'hull', m60);
  assert.equal(frontHull.result, 'pen');
  assert.equal(frontHull.damage, 40);

  const frontTurret = resolveHit('turret', { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, shell, 535, 'turret', m60);
  assert.equal(frontTurret.result, 'pen');
  assert.equal(frontTurret.damage, 40);

  const sideHit = resolveHit('hull', { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, shell, 480, 'hull', m60);
  assert.equal(sideHit.result, 'pen');
  assert.equal(sideHit.damage, 55);

  const rearHit = resolveHit('hull', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, shell, 480, 'hull', m60);
  assert.equal(rearHit.result, 'pen');
  assert.equal(rearHit.damage, 55);

  const fuelHit = resolveHit('fuel', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, shell, 460, 'fuel', m60);
  assert.equal(fuelHit.result, 'fuel');
  assert.ok(fuelHit.damage >= m60.maxHp);
});

test('Frontal 200mm sloped armor deals 50 damage only on clean close hit and resists angled/long-range shots', () => {
  const t55 = getTankSpec('t55');
  const shell = { muzzleVelocity: t55.muzzleVelocity, penetrationMm: t55.penetrationMm };

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

test('Side and rear hull hits deal 60 damage', () => {
  const t55 = getTankSpec('t55');
  const shell = { muzzleVelocity: t55.muzzleVelocity, penetrationMm: t55.penetrationMm };

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
  const shell = { muzzleVelocity: t55.muzzleVelocity, penetrationMm: t55.penetrationMm };

  const fuelHit = resolveHit('fuel', { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, shell, 440, 'fuel', t55);
  assert.equal(fuelHit.result, 'fuel');
  assert.ok(fuelHit.damage >= t55.maxHp);

  const fuelRearHit = resolveHit('hull', { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, shell, 440, 'fuel', t55);
  assert.equal(fuelRearHit.result, 'fuel');
  assert.ok(fuelRearHit.damage >= t55.maxHp);
});

test('Expanded zone around barrel and muzzle counts as barrel hit', () => {
  const t55 = getTankSpec('t55');
  const shell = { muzzleVelocity: t55.muzzleVelocity, penetrationMm: t55.penetrationMm };

  // Zone around muzzle tip and barrel shaft (+/- 0.3m lateral, ahead of muzzle z=4.75, collar z=-0.2)
  assert.ok(BARREL_HITBOX_BOUNDS.max.x >= 0.35);
  assert.equal(isPointInBarrelZone(0.32, 0.25, 2.5), true);
  assert.equal(isPointInBarrelZone(0.0, 0.0, 4.75), true);
  assert.equal(isPointInBarrelZone(-0.2, 0.1, -0.2), true);

  // Grazing shot along the barrel zone still resolves as 'barrel' damage
  const barrelHit = resolveHit('barrel', { x: 1, y: 0, z: 0 }, { x: -0.25, y: 0, z: -0.96 }, shell, 480, 'barrel', t55);
  assert.equal(barrelHit.result, 'barrel');
  assert.ok(barrelHit.damage > 0);
});
