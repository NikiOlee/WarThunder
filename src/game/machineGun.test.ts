import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMgState,
  isMgExhausted,
  startMgReload,
  stepMgState,
  tryFireMg,
  type MachineGunSpec,
} from './machineGun';
import { resolveMgHit } from './damage';
import { getAllTanks, getTankSpec, MAUS_SPEC } from './tanks';

test('tank MG specs deal < 1 HP per shot and scale damage with tank price', () => {
  const tanks = getAllTanks();
  assert.ok(tanks.length >= 3);
  const t55 = getTankSpec('t55');
  const m60 = getTankSpec('m60a3');
  const t62m = getTankSpec('t62m');

  for (const spec of [...tanks, MAUS_SPEC]) {
    assert.ok(spec.mg.damage > 0 && spec.mg.damage < 1, `${spec.id} MG damage must be < 1`);
    assert.ok(spec.mg.fireRate >= 8, `${spec.id} MG must fire rapidly`);
    assert.ok(spec.mg.magSize > 0 && spec.mg.totalAmmo >= spec.mg.magSize);
    assert.ok(spec.mg.reloadTime > 0);
  }

  assert.ok(m60.priceSilver > t55.priceSilver);
  assert.ok(m60.mg.damage > t55.mg.damage, 'More expensive tank must deal higher MG damage');
  assert.ok(t62m.priceSilver > m60.priceSilver);
  assert.ok(t62m.mg.damage > m60.mg.damage, 'T-62M must deal higher MG damage than M60A3 Patton');
});

test('machine gun enforces rapid fire rate, reloads empty belt from reserve, and can run completely out of ammo', () => {
  const spec: MachineGunSpec = {
    name: 'Test MG',
    damage: 0.4,
    fireRate: 10,
    magSize: 3,
    totalAmmo: 5,
    reloadTime: 2.0,
    muzzleVelocity: 800,
    maxRange: 300,
    spread: 0.005,
  };

  const st = createMgState(spec);
  assert.equal(st.magAmmo, 3);
  assert.equal(st.reserveAmmo, 2);
  assert.equal(isMgExhausted(st), false);

  // Fire 1st shot -> cooldown 0.1s blocks immediate 2nd shot
  assert.equal(tryFireMg(st, spec), true);
  assert.equal(st.magAmmo, 2);
  assert.equal(tryFireMg(st, spec), false);

  // Advance cooldown and fire 2nd + 3rd shots -> belt empties & reload begins automatically
  stepMgState(st, spec, 0.11);
  assert.equal(tryFireMg(st, spec), true);
  assert.equal(st.magAmmo, 1);

  stepMgState(st, spec, 0.11);
  assert.equal(tryFireMg(st, spec), true);
  assert.equal(st.magAmmo, 0);
  assert.equal(st.reloadT, 2.0);
  assert.equal(tryFireMg(st, spec), false);

  // Partial reload wait still keeps weapon reloading
  stepMgState(st, spec, 1.0);
  assert.ok(st.reloadT > 0);
  assert.equal(st.magAmmo, 0);
  assert.equal(tryFireMg(st, spec), false);

  // Completing reload loads remaining 2 reserve rounds
  stepMgState(st, spec, 1.1);
  assert.equal(st.reloadT, 0);
  assert.equal(st.magAmmo, 2);
  assert.equal(st.reserveAmmo, 0);

  // Exhaust final 2 rounds -> ammo reaches 0 / 0, cannot reload or fire
  assert.equal(tryFireMg(st, spec), true);
  stepMgState(st, spec, 0.11);
  assert.equal(tryFireMg(st, spec), true);
  assert.equal(st.magAmmo, 0);
  assert.equal(st.reserveAmmo, 0);
  assert.equal(st.reloadT, 0);
  assert.equal(isMgExhausted(st), true);
  assert.equal(startMgReload(st, spec), false);
  stepMgState(st, spec, 5.0);
  assert.equal(tryFireMg(st, spec), false);
});

test('manual MG reload tops off partial belt from reserve when available', () => {
  const spec = getTankSpec('t55').mg;
  const st = createMgState(spec);
  assert.equal(startMgReload(st, spec), false, 'Full belt does not need reload');
  assert.equal(tryFireMg(st, spec), true);
  assert.equal(st.magAmmo, spec.magSize - 1);
  assert.equal(startMgReload(st, spec), true);
  assert.equal(st.reloadT, spec.reloadTime);
  stepMgState(st, spec, spec.reloadTime + 0.05);
  assert.equal(st.magAmmo, spec.magSize);
  assert.equal(st.reserveAmmo, spec.totalAmmo - spec.magSize - 1);
});

test('resolveMgHit always deals sub-1 HP damage without fuel instant-kill', () => {
  const fuelHit = resolveMgHit('fuel', 0.65);
  assert.equal(fuelHit.result, 'pen');
  assert.equal(fuelHit.damage, 0.65);
  assert.ok(fuelHit.damage < 1);

  const clamped = resolveMgHit('hull', 5.0);
  assert.ok(clamped.damage < 1);
});
