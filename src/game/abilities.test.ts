import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAbilityState,
  resetAbilityState,
  stepAbilityState,
  canActivateAbility,
  activateAbility,
  consumePrimedShot,
  getOverdriveMultipliers,
  createSmokeRing,
  pruneSmokeClouds,
  isTankConcealedBySmoke,
  isLineBlockedBySmoke,
  type TankAbilitySpec,
} from './abilities.ts';

const GALIX_SPEC: TankAbilitySpec = {
  type: 'galix_overdrive',
  cooldown: 15,
  duration: 3.5,
  speedMult: 1.28,
  accelMult: 1.45,
  smokeDuration: 4.5,
  smokeRadius: 6.2,
};

const DM63_SPEC: TankAbilitySpec = {
  type: 'dm63_apfsds',
  cooldown: 15,
  damageMin: 500,
  damageMax: 550,
  velocityBoost: 1160,
};

describe('GALIX Overdrive + Smoke ability', () => {
  it('activates overdrive + smoke and enforces 15s cooldown', () => {
    const s = createAbilityState();
    assert.equal(canActivateAbility(s, GALIX_SPEC), true);

    const res = activateAbility(s, GALIX_SPEC);
    assert.equal(res.activated, true);
    assert.equal(res.spawnSmoke, true);
    assert.equal(s.activeRemaining, 3.5);
    assert.equal(s.cooldownRemaining, 15);
    assert.equal(canActivateAbility(s, GALIX_SPEC), false);

    const multDuring = getOverdriveMultipliers(s, GALIX_SPEC);
    assert.equal(multDuring.active, true);
    assert.ok(multDuring.speedMult > 1.2);
    assert.ok(multDuring.accelMult > 1.3);

    stepAbilityState(s, 3.6);
    assert.equal(s.activeRemaining, 0);
    assert.equal(getOverdriveMultipliers(s, GALIX_SPEC).active, false);
    assert.ok(s.cooldownRemaining > 11);
    assert.equal(canActivateAbility(s, GALIX_SPEC), false);

    stepAbilityState(s, 12);
    assert.equal(s.cooldownRemaining, 0);
    assert.equal(canActivateAbility(s, GALIX_SPEC), true);
  });

  it('conceals tanks and blocks LOS inside active smoke clouds', () => {
    const clouds = createSmokeRing(100, 0, 200, 0, 10, 4.5, 6);
    assert.equal(clouds.length, 7);
    assert.equal(isTankConcealedBySmoke(clouds, 100, 200, 11), true);
    assert.equal(isTankConcealedBySmoke(clouds, 130, 200, 11), false);
    assert.equal(isLineBlockedBySmoke(clouds, 70, 200, 130, 200, 11), true);
    assert.equal(isLineBlockedBySmoke(clouds, 70, 240, 130, 240, 11), false);

    // Expired smoke no longer blocks
    assert.equal(isLineBlockedBySmoke(clouds, 70, 200, 130, 200, 15), false);
    pruneSmokeClouds(clouds, 15);
    assert.equal(clouds.length, 0);
  });
});

describe('DM63/DM73 APFSDS ability', () => {
  it('primes next cannon shot, ignores armor & APS, and starts 15s cooldown on fire', () => {
    const s = createAbilityState();
    const act = activateAbility(s, DM63_SPEC);
    assert.equal(act.activated, true);
    assert.equal(act.primed, true);
    assert.equal(s.cooldownRemaining, 0);
    assert.equal(canActivateAbility(s, DM63_SPEC), false);

    const shotLow = consumePrimedShot(s, DM63_SPEC, 930, () => 0);
    assert.equal(shotLow.active, true);
    assert.equal(shotLow.damage, 500);
    assert.equal(shotLow.ignoreArmor, true);
    assert.equal(shotLow.ignoreAps, true);
    assert.equal(shotLow.muzzleVelocity, 1160);
    assert.equal(s.primed, false);
    assert.equal(s.cooldownRemaining, 15);

    // Second shot without priming does not trigger DM63
    const normalShot = consumePrimedShot(s, DM63_SPEC, 930);
    assert.equal(normalShot.active, false);

    // Reset restores ready state
    resetAbilityState(s);
    assert.equal(canActivateAbility(s, DM63_SPEC), true);
    activateAbility(s, DM63_SPEC);
    const shotHigh = consumePrimedShot(s, DM63_SPEC, 930, () => 1);
    assert.equal(shotHigh.damage, 550);
  });
});
