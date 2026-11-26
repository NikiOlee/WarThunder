import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MG_FRONT_MIN_ELEV,
  MG_MAX_ELEV,
  MG_REAR_MIN_ELEV,
  MG_SIDE_MIN_ELEV,
  computeMgMinLocalElev,
  createMgState,
  isMgExhausted,
  resolveMgAim,
  startMgReload,
  stepMgState,
  tryFireMg,
  type MachineGunSpec,
} from './machineGun';
import { resolveMgHit } from './damage';
import { getAllTanks, getTankSpec, MAUS_SPEC } from './tanks';

test('tank MG specs deal < 1 HP per shot and scale damage with tank price', () => {
  const tanks = getAllTanks();
  assert.ok(tanks.length >= 5);
  const t55 = getTankSpec('t55');
  const m60 = getTankSpec('m60a3');
  const t62m = getTankSpec('t62m');
  const t72b3 = getTankSpec('t72b3');
  const leo = getTankSpec('leopard2a4');
  const m1a1 = getTankSpec('m1a1');
  const ztz96a = getTankSpec('ztz96a');
  const t90m = getTankSpec('t90m');

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
  assert.ok(t72b3.priceSilver > t62m.priceSilver);
  assert.ok(t72b3.mg.damage > t62m.mg.damage, 'T-72B3 must deal higher MG damage than T-62M');
  assert.ok(leo.priceSilver > t72b3.priceSilver);
  assert.ok(leo.mg.damage > t72b3.mg.damage, 'Leopard 2A4 must deal higher MG damage than T-72B3');
  assert.ok(ztz96a.priceSilver > leo.priceSilver);
  assert.ok(ztz96a.mg.damage > leo.mg.damage, 'ZTZ-96A must deal higher MG damage than Leopard 2A4');
  assert.ok(m1a1.priceSilver > ztz96a.priceSilver);
  assert.ok(m1a1.mg.damage > leo.mg.damage, 'M1A1 Abrams must deal higher MG damage than Leopard 2A4');
  assert.ok(t90m.priceSilver > m1a1.priceSilver);
  assert.ok(t90m.mg.damage > ztz96a.mg.damage, 'T-90M must deal higher MG damage than ZTZ-96A');
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

test('resolveMgAim shoots freely in 360 deg and steeply upward, blocking only the hull bottom', () => {
  const DEG = Math.PI / 180;
  // Front, rear, and sides hull-clearance bounds
  assert.ok(Math.abs(computeMgMinLocalElev(0) - MG_FRONT_MIN_ELEV) < 1e-6);
  assert.ok(Math.abs(computeMgMinLocalElev(Math.PI) - MG_REAR_MIN_ELEV) < 1e-6);
  assert.ok(Math.abs(computeMgMinLocalElev(Math.PI / 2) - MG_SIDE_MIN_ELEV) < 1e-6);
  assert.ok(Math.abs(computeMgMinLocalElev(-Math.PI / 2) - MG_SIDE_MIN_ELEV) < 1e-6);

  // Shooting almost straight up (+75 deg) behind the tank (180 deg) works freely
  const upRear = resolveMgAim({
    alive: true,
    heading: 0,
    pitchUp: 0,
    rollLeftUp: 0,
    aimYaw: Math.PI,
    aimElev: 75 * DEG,
  });
  assert.equal(upRear.clampedBottom, false);
  assert.ok(Math.abs(Math.abs(upRear.mgYaw) - Math.PI) < 1e-6);
  assert.ok(Math.abs(upRear.mgElev - 75 * DEG) < 1e-6);

  // Shooting above +85 deg clamps cleanly to MG_MAX_ELEV
  const tooHigh = resolveMgAim({
    alive: true,
    heading: 0,
    pitchUp: 0,
    rollLeftUp: 0,
    aimYaw: 0.4,
    aimElev: 89 * DEG,
  });
  assert.equal(tooHigh.clampedBottom, false);
  assert.ok(Math.abs(tooHigh.mgElev - MG_MAX_ELEV) < 1e-6);

  // Shooting straight down into the bottom over front hull clamps at MG_FRONT_MIN_ELEV
  const bottomFront = resolveMgAim({
    alive: true,
    heading: 0,
    pitchUp: 0,
    rollLeftUp: 0,
    aimYaw: 0,
    aimElev: -45 * DEG,
  });
  assert.equal(bottomFront.clampedBottom, true);
  assert.ok(Math.abs(bottomFront.mgElev - MG_FRONT_MIN_ELEV) < 1e-6);

  // Over the side (-18 deg) is allowed because sides clear lower than front/rear (-21 deg min)
  const sideLow = resolveMgAim({
    alive: true,
    heading: 0,
    pitchUp: 0,
    rollLeftUp: 0,
    aimYaw: Math.PI / 2,
    aimElev: -18 * DEG,
  });
  assert.equal(sideLow.clampedBottom, false);
  assert.ok(Math.abs(sideLow.mgElev - -18 * DEG) < 1e-6);

  // Hull pitched uphill (+10 deg) prevents shooting into the raised uphill front glacis
  const uphill = resolveMgAim({
    alive: true,
    heading: 0,
    pitchUp: 10 * DEG,
    rollLeftUp: 0,
    aimYaw: 0,
    aimElev: -10 * DEG,
  });
  assert.equal(uphill.clampedBottom, true);
  assert.ok(Math.abs(uphill.mgElev - MG_FRONT_MIN_ELEV) < 1e-6);
});

