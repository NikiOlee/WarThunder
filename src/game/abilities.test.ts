import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAbilityState,
  resetAbilityState,
  stepAbilityState,
  canActivateAbility,
  activateAbility,
  consumePrimedShot,
  consumeKstamLaunch,
  getOverdriveMultipliers,
  getBarrageMultipliers,
  isThermalActive,
  isAfghanitActive,
  isTrophyReflectActive,
  stepKstamLock,
  computeKstamSplashDamage,
  computeAmpSplashDamage,
  findNearestEnemyIndex,
  computeGalixArcPosition,
  createSmokeRing,
  pruneSmokeClouds,
  isTankConcealedBySmoke,
  isLineBlockedBySmoke,
  type TankAbilitySpec,
} from './abilities.ts';
import { getTankSpec } from './tanks.ts';

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

  it('computes parabolic GALIX grenade trajectories and uses expanded 8.5s / 9.5m Leclerc smoke', () => {
    const start = computeGalixArcPosition(0, 2, 0, 6, 0.5, 8, 0, 3.6);
    assert.deepEqual(start, { x: 0, y: 2, z: 0 });
    const mid = computeGalixArcPosition(0, 2, 0, 6, 0.5, 8, 0.5, 3.6);
    assert.equal(mid.x, 3);
    assert.ok(Math.abs(mid.y - (1.25 + 3.6)) < 1e-6);
    assert.equal(mid.z, 4);
    const end = computeGalixArcPosition(0, 2, 0, 6, 0.5, 8, 1, 3.6);
    assert.deepEqual(end, { x: 6, y: 0.5, z: 8 });

    const leclerc = getTankSpec('leclerc');
    assert.equal(leclerc.ability?.smokeDuration, 8.5);
    assert.equal(leclerc.ability?.smokeRadius, 9.5);
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

describe('M1A2 SEP Thermal Sight & AP Barrage abilities', () => {
  it('activates Thermal Sight Gen-2 for 15s with 30s cooldown', () => {
    const abrams = getTankSpec('m1a2sep');
    assert.equal(abrams.ability?.type, 'thermal_sight');
    const s = createAbilityState();
    assert.equal(isThermalActive(s, abrams.ability), false);

    const res = activateAbility(s, abrams.ability);
    assert.equal(res.activated, true);
    assert.equal(res.type, 'thermal_sight');
    assert.equal(isThermalActive(s, abrams.ability), true);
    assert.equal(s.activeRemaining, 15);
    assert.equal(s.cooldownRemaining, 30);

    stepAbilityState(s, 15.1);
    assert.equal(isThermalActive(s, abrams.ability), false);
    assert.equal(canActivateAbility(s, abrams.ability), false);
    stepAbilityState(s, 15);
    assert.equal(canActivateAbility(s, abrams.ability), true);
  });

  it('activates AP Barrage [G] boosting reload speed +35% and penetration +50% for 6s', () => {
    const abrams = getTankSpec('m1a2sep');
    assert.equal(abrams.secondaryAbility?.type, 'ap_barrage');
    const s = createAbilityState();
    assert.deepEqual(getBarrageMultipliers(s, abrams.secondaryAbility), {
      active: false,
      reloadMult: 1,
      penMult: 1,
    });

    const res = activateAbility(s, abrams.secondaryAbility);
    assert.equal(res.activated, true);
    assert.equal(res.type, 'ap_barrage');
    assert.deepEqual(getBarrageMultipliers(s, abrams.secondaryAbility), {
      active: true,
      reloadMult: 0.65,
      penMult: 1.5,
    });

    stepAbilityState(s, 6.1);
    assert.equal(getBarrageMultipliers(s, abrams.secondaryAbility).active, false);
    assert.equal(canActivateAbility(s, abrams.secondaryAbility), false);
    stepAbilityState(s, 12);
    assert.equal(canActivateAbility(s, abrams.secondaryAbility), true);
  });
});

describe('K2 Black Panther KSTAM Top-Attack & Splash ability', () => {
  it('locks red -> green over 1.5s, cancels cleanly on early release, and launches for 500 dmg + enemy-only 10m splash', () => {
    const k2 = getTankSpec('k2');
    assert.equal(k2.ability?.type, 'kstam_missile');
    const s = createAbilityState();

    const act = activateAbility(s, k2.ability);
    assert.equal(act.activated, true);
    assert.equal(act.primed, true);
    assert.equal(s.cooldownRemaining, 0);

    // Partial lock remains red and resets to 0 on early release without consuming cooldown
    const stepMid = stepKstamLock(0, true, true, 0.9, 1.5);
    assert.equal(stepMid.color, 'red');
    assert.equal(stepMid.locked, false);
    const cancelled = stepKstamLock(stepMid.progress, true, false, 0.016, 1.5);
    assert.equal(cancelled.progress, 0);
    assert.equal(s.primed, true);
    assert.equal(s.cooldownRemaining, 0);

    // Full 1.5s lock turns green
    const stepDone = stepKstamLock(stepMid.progress, true, true, 0.7, 1.5);
    assert.equal(stepDone.color, 'green');
    assert.equal(stepDone.locked, true);

    const launch = consumeKstamLaunch(s, k2.ability);
    assert.equal(launch.launched, true);
    assert.equal(launch.damage, 500);
    assert.equal(launch.splashRadius, 10);
    assert.equal(s.primed, false);
    assert.equal(s.cooldownRemaining, 18);

    // Splash damages enemies within 10m and deals strictly 0 damage to allies/self
    assert.ok(computeKstamSplashDamage(0, 10, 280, false) === 280);
    assert.ok(computeKstamSplashDamage(5, 10, 280, false) > 0);
    assert.equal(computeKstamSplashDamage(10.5, 10, 280, false), 0);
    assert.equal(computeKstamSplashDamage(2, 10, 280, true), 0);
    assert.equal(computeKstamSplashDamage(0, 10, 280, true), 0);
  });
});

describe('T-14 Armata Afghanit 360° APS ability', () => {
  it('activates for 3s on a 16s cooldown and reports active state cleanly', () => {
    const t14 = getTankSpec('t14armata');
    assert.equal(t14.ability?.type, 'afghanit_shield');
    const s = createAbilityState();
    assert.equal(isAfghanitActive(s, t14.ability), false);

    const res = activateAbility(s, t14.ability);
    assert.equal(res.activated, true);
    assert.equal(res.type, 'afghanit_shield');
    assert.equal(s.activeRemaining, 3);
    assert.equal(s.cooldownRemaining, 16);
    assert.equal(isAfghanitActive(s, t14.ability), true);
    assert.equal(canActivateAbility(s, t14.ability), false);

    stepAbilityState(s, 3.1);
    assert.equal(isAfghanitActive(s, t14.ability), false);
    assert.equal(canActivateAbility(s, t14.ability), false);

    stepAbilityState(s, 13);
    assert.equal(canActivateAbility(s, t14.ability), true);
  });
});

describe('M1A2 SEPv3 Trophy Reflect [E] & AMP Homing [G] abilities', () => {
  it('activates Trophy Reflect for 10s with 25s cooldown', () => {
    const sepv3 = getTankSpec('m1a2sepv3');
    assert.equal(sepv3.ability?.type, 'trophy_reflect');
    const s = createAbilityState();
    assert.equal(isTrophyReflectActive(s, sepv3.ability), false);

    const res = activateAbility(s, sepv3.ability);
    assert.equal(res.activated, true);
    assert.equal(res.type, 'trophy_reflect');
    assert.equal(s.activeRemaining, 10);
    assert.equal(s.cooldownRemaining, 25);
    assert.equal(isTrophyReflectActive(s, sepv3.ability), true);

    stepAbilityState(s, 10.1);
    assert.equal(isTrophyReflectActive(s, sepv3.ability), false);
    assert.equal(canActivateAbility(s, sepv3.ability), false);

    stepAbilityState(s, 15);
    assert.equal(canActivateAbility(s, sepv3.ability), true);
  });

  it('launches AMP homing on 15s cooldown, locks nearest alive enemy, and deals 40 AoE splash to enemies only', () => {
    const sepv3 = getTankSpec('m1a2sepv3');
    assert.equal(sepv3.secondaryAbility?.type, 'amp_homing');
    const s = createAbilityState();

    const res = activateAbility(s, sepv3.secondaryAbility);
    assert.equal(res.activated, true);
    assert.equal(res.type, 'amp_homing');
    assert.equal(s.cooldownRemaining, 15);

    const idx = findNearestEnemyIndex(0, 0, 'A', [
      { alive: true, team: 'A', x: 5, z: 5 },     // ally closer -> ignore
      { alive: false, team: 'B', x: 8, z: 0 },    // dead enemy -> ignore
      { alive: true, team: 'B', x: 40, z: 30 },   // enemy dist 50
      { alive: true, team: 'B', x: 18, z: 0 },    // nearest alive enemy
    ]);
    assert.equal(idx, 3);

    assert.equal(computeAmpSplashDamage(0, 5, 40, false), 40);
    assert.equal(computeAmpSplashDamage(4.9, 5, 40, false), 40);
    assert.equal(computeAmpSplashDamage(5.2, 5, 40, false), 0);
    assert.equal(computeAmpSplashDamage(2.0, 5, 40, true), 0);
  });
});
