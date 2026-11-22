import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canInterceptProjectile,
  createApsState,
  stepApsState,
  triggerApsIntercept,
  type TrophyApsConfig,
} from './aps';

const TROPHY_CFG: TrophyApsConfig = {
  cooldownMin: 15,
  cooldownMax: 20,
  interceptRadius: 6.5,
};

test('Trophy APS starts ready, intercepts incoming enemy shell once, and enters 15-20s cooldown', () => {
  const state = createApsState();
  assert.equal(state.cooldown, 0);
  assert.equal(state.intercepts, 0);

  const check1 = canInterceptProjectile({
    alive: true,
    apsConfig: TROPHY_CFG,
    apsState: state,
    projectileType: 'AP',
    isFriendlyOrSelf: false,
    ax: 0,
    ay: 2,
    az: 8,
    bx: 0,
    by: 2,
    bz: 3,
    vx: 0,
    vy: 0,
    vz: -600,
    tx: 0,
    ty: 1.8,
    tz: 0,
  });
  assert.equal(check1.intercept, true);
  assert.ok(Math.abs(check1.iz) > 2.5, `detonation point should happen mid-air outside hull (got z=${check1.iz})`);

  const cdMin = triggerApsIntercept(state, TROPHY_CFG, () => 0);
  assert.equal(cdMin, 15);
  assert.equal(state.cooldown, 15);
  assert.equal(state.intercepts, 1);

  // Immediately after intercept, second incoming shell cannot be intercepted during cooldown
  const checkWhileCooling = canInterceptProjectile({
    alive: true,
    apsConfig: TROPHY_CFG,
    apsState: state,
    projectileType: 'AP',
    isFriendlyOrSelf: false,
    ax: 0,
    ay: 2,
    az: 7,
    bx: 0,
    by: 2,
    bz: 2,
    vx: 0,
    vy: 0,
    vz: -600,
    tx: 0,
    ty: 1.8,
    tz: 0,
  });
  assert.equal(checkWhileCooling.intercept, false);

  // Advance 14.5s -> still cooling
  stepApsState(state, 14.5);
  assert.ok(state.cooldown > 0);
  // Advance 1.0s -> ready again
  stepApsState(state, 1.0);
  assert.equal(state.cooldown, 0);

  const cdMax = triggerApsIntercept(state, TROPHY_CFG, () => 1);
  assert.equal(cdMax, 20);
  assert.equal(state.cooldown, 20);
  assert.equal(state.intercepts, 2);
});

test('Trophy APS ignores MG bullets, friendly/self shots, receding shells, out-of-range shells, and dead tanks', () => {
  const state = createApsState();

  // MG bullet ignored
  assert.equal(
    canInterceptProjectile({
      alive: true,
      apsConfig: TROPHY_CFG,
      apsState: state,
      projectileType: 'MG',
      isFriendlyOrSelf: false,
      ax: 0,
      ay: 2,
      az: 6,
      bx: 0,
      by: 2,
      bz: 2,
      vx: 0,
      vy: 0,
      vz: -800,
      tx: 0,
      ty: 1.8,
      tz: 0,
    }).intercept,
    false,
  );

  // Friendly/self shot ignored
  assert.equal(
    canInterceptProjectile({
      alive: true,
      apsConfig: TROPHY_CFG,
      apsState: state,
      projectileType: 'AP',
      isFriendlyOrSelf: true,
      ax: 0,
      ay: 2,
      az: 6,
      bx: 0,
      by: 2,
      bz: 2,
      vx: 0,
      vy: 0,
      vz: -500,
      tx: 0,
      ty: 1.8,
      tz: 0,
    }).intercept,
    false,
  );

  // Receding shell ignored
  assert.equal(
    canInterceptProjectile({
      alive: true,
      apsConfig: TROPHY_CFG,
      apsState: state,
      projectileType: 'AP',
      isFriendlyOrSelf: false,
      ax: 0,
      ay: 2,
      az: 4,
      bx: 0,
      by: 2,
      bz: 8,
      vx: 0,
      vy: 0,
      vz: 500,
      tx: 0,
      ty: 1.8,
      tz: 0,
    }).intercept,
    false,
  );

  // Out-of-radius shell ignored
  assert.equal(
    canInterceptProjectile({
      alive: true,
      apsConfig: TROPHY_CFG,
      apsState: state,
      projectileType: 'AP',
      isFriendlyOrSelf: false,
      ax: 15,
      ay: 2,
      az: 12,
      bx: 15,
      by: 2,
      bz: 8,
      vx: 0,
      vy: 0,
      vz: -500,
      tx: 0,
      ty: 1.8,
      tz: 0,
    }).intercept,
    false,
  );

  // Dead tank ignored
  assert.equal(
    canInterceptProjectile({
      alive: false,
      apsConfig: TROPHY_CFG,
      apsState: state,
      projectileType: 'AP',
      isFriendlyOrSelf: false,
      ax: 0,
      ay: 2,
      az: 6,
      bx: 0,
      by: 2,
      bz: 2,
      vx: 0,
      vy: 0,
      vz: -500,
      tx: 0,
      ty: 1.8,
      tz: 0,
    }).intercept,
    false,
  );
});
