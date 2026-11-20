import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAME_BURN_DPS,
  FLAME_BURN_DURATION_SEC,
  FLAME_MAX_CONTINUOUS_SEC,
  FLAME_OVERHEAT_COOLDOWN_SEC,
  FLAME_RANGE_M,
  createFlamethrowerHeatState,
  createTargetFireState,
  getFlameDirectDps,
  integrateFlameDirectDamage,
  isPointInFlameStream,
  stepFlamethrowerHeat,
  stepTargetFireExposure,
} from './flamethrower';

test('Flamethrower constants match Maus specification', () => {
  assert.equal(FLAME_RANGE_M, 20);
  assert.equal(FLAME_MAX_CONTINUOUS_SEC, 4.5);
  assert.equal(FLAME_OVERHEAT_COOLDOWN_SEC, 2.5);
  assert.equal(FLAME_BURN_DURATION_SEC, 4);
  assert.equal(FLAME_BURN_DPS, 10);
});

test('Direct flame contact escalates 20 -> 40 -> 60 HP/s across seconds', () => {
  assert.equal(getFlameDirectDps(0.2), 20);
  assert.equal(getFlameDirectDps(1.0), 40);
  assert.equal(getFlameDirectDps(1.9), 40);
  assert.equal(getFlameDirectDps(2.0), 60);
  assert.equal(getFlameDirectDps(3.5), 60);

  assert.ok(Math.abs(integrateFlameDirectDamage(0, 1.0) - 20) < 1e-6);
  assert.ok(Math.abs(integrateFlameDirectDamage(1.0, 1.0) - 40) < 1e-6);
  assert.ok(Math.abs(integrateFlameDirectDamage(2.0, 1.0) - 60) < 1e-6);
  assert.ok(Math.abs(integrateFlameDirectDamage(0, 3.0) - 120) < 1e-6);
});

test('Target fire exposure applies escalating damage and 4s residual burn at 10 HP/s', () => {
  const fire = createTargetFireState();

  // 1st second in stream: 20 HP
  const s1 = stepTargetFireExposure(fire, true, 1.0, false);
  assert.equal(s1.inFlame, true);
  assert.ok(Math.abs(s1.damage - 20) < 1e-6);
  assert.equal(s1.directDps, 40);

  // 2nd second in stream: 40 HP
  const s2 = stepTargetFireExposure(fire, true, 1.0, false);
  assert.ok(Math.abs(s2.damage - 40) < 1e-6);
  assert.equal(s2.directDps, 60);

  // 3rd second in stream: 60 HP
  const s3 = stepTargetFireExposure(fire, true, 1.0, false);
  assert.ok(Math.abs(s3.damage - 60) < 1e-6);

  // Leaves flame: resets exposure, burns at 10 HP/s for 4 seconds = 40 total damage
  let burnTotal = 0;
  for (let i = 0; i < 4; i++) {
    const b = stepTargetFireExposure(fire, false, 1.0, false);
    assert.equal(b.inFlame, false);
    assert.equal(b.burnDps, 10);
    burnTotal += b.damage;
  }
  assert.ok(Math.abs(burnTotal - 40) < 1e-6);

  // After 4s, burn has stopped
  const done = stepTargetFireExposure(fire, false, 1.0, false);
  assert.equal(done.damage, 0);
  assert.equal(done.burning, false);

  // God mode prevents damage
  const godStep = stepTargetFireExposure(createTargetFireState(), true, 1.0, true);
  assert.equal(godStep.damage, 0);
});

test('Flamethrower overheat triggers after 4.5s continuous fire and cools in 2.5s without fixed cooldown', () => {
  const heat = createFlamethrowerHeatState();

  // Brief burst + idle cooling: never triggers forced cooldown
  stepFlamethrowerHeat(heat, true, 2.0);
  assert.equal(heat.active, true);
  assert.equal(heat.overheated, false);
  stepFlamethrowerHeat(heat, false, 1.0);
  assert.equal(heat.active, false);
  assert.equal(heat.overheated, false);

  // Can immediately fire again without waiting
  stepFlamethrowerHeat(heat, true, 0.2);
  assert.equal(heat.active, true);

  // Firing past 4.5s total locks into overheat
  const fresh = createFlamethrowerHeatState();
  stepFlamethrowerHeat(fresh, true, 4.6);
  assert.equal(fresh.overheated, true);
  assert.equal(fresh.active, false);
  assert.equal(fresh.heat, 1);

  // Even while trying to fire during overheat, it stays inactive until 2.5s cooldown passes
  stepFlamethrowerHeat(fresh, true, 1.5);
  assert.equal(fresh.overheated, true);
  assert.equal(fresh.active, false);

  stepFlamethrowerHeat(fresh, true, 1.1);
  assert.equal(fresh.overheated, false);
  assert.equal(fresh.heat, 0);

  // Now usable again
  stepFlamethrowerHeat(fresh, true, 0.2);
  assert.equal(fresh.active, true);
});

test('Flame stream geometry hits within 20m cone/cylinder and misses outside or behind occlusion', () => {
  const origin = { x: 0, y: 2, z: 0 };
  const dir = { x: 0, y: 0, z: 1 };

  assert.equal(isPointInFlameStream(origin, dir, 20, { x: 0, y: 2, z: 14 }), true);
  assert.equal(isPointInFlameStream(origin, dir, 20, { x: 1.4, y: 2, z: 19.5 }), true);
  assert.equal(isPointInFlameStream(origin, dir, 20, { x: 0, y: 2, z: 22.0 }), false);
  assert.equal(isPointInFlameStream(origin, dir, 20, { x: 3.5, y: 2, z: 10 }), false);
  assert.equal(isPointInFlameStream(origin, dir, 8, { x: 0, y: 2, z: 12 }), false);
});
