import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROCK_COLLISION_DAMAGE,
  ROCK_MIN_IMPACT_SPEED,
  ROCK_COOLDOWN_SEC,
  TREE_FALL_DURATION,
  TreeInstanceState,
  resolveRockCircleCollision,
  shouldApplyRockDamage,
  computeFallTargetTilt,
  triggerTreeKnockdown,
  stepFallingTrees,
  resetTreeStates,
} from './envCollision';

function makeTree(index = 0, x = 20, z = 30): TreeInstanceState {
  return {
    index,
    x,
    y: 3,
    z,
    baseYaw: 0.5,
    sx: 1,
    sy: 1.1,
    sz: 1,
    trunkRadius: 0.6,
    state: 'standing',
    fallProgress: 0,
    fallDirX: 0,
    fallDirZ: 1,
    tiltAngle: 0,
    targetTilt: 1.46,
  };
}

test('Rock collision pushes tank outside rock and stops forward movement', () => {
  const res = resolveRockCircleCollision({
    tankX: 10,
    tankZ: 15,
    tankRadius: 2.9,
    tankVx: 0,
    tankVz: 14,
    tankSpeed: 14,
    rockX: 10,
    rockZ: 18.5,
    rockRadius: 2.0,
  });

  assert.equal(res.collided, true);
  assert.equal(res.newSpeed, 0, 'Tank must stop completely when crashing into a rock');
  assert.ok(res.closingSpeed >= 13.9);
  const distAfter = Math.hypot(res.x - 10, res.z - 18.5);
  assert.ok(Math.abs(distAfter - 4.9) < 1e-6, 'Tank should be pushed out to tankRadius + rockRadius');
});

test('Rock collision allows tank to reverse away without clamping speed to 0', () => {
  const res = resolveRockCircleCollision({
    tankX: 10,
    tankZ: 14.0,
    tankRadius: 2.9,
    tankVx: 0,
    tankVz: -6, // reversing away from rock at z=18.5
    tankSpeed: -6,
    rockX: 10,
    rockZ: 18.5,
    rockRadius: 2.0,
  });

  assert.equal(res.collided, true);
  assert.equal(res.closingSpeed, 0);
  assert.equal(res.newSpeed, -6, 'Reversing away from rock must not be stopped');
});

test('Rock collision deals exactly 5 damage above impact speed threshold and respects cooldown', () => {
  const cooldowns = new Map<string, number>();

  // Gentle bump below ROCK_MIN_IMPACT_SPEED deals 0 damage
  assert.equal(shouldApplyRockDamage('player', ROCK_MIN_IMPACT_SPEED - 0.5, 10, cooldowns), 0);

  // High speed crash deals exactly 5 damage
  assert.equal(ROCK_COLLISION_DAMAGE, 5);
  assert.equal(shouldApplyRockDamage('player', 12, 10, cooldowns), 5);

  // Immediate follow-up frame within cooldown deals 0 damage
  assert.equal(shouldApplyRockDamage('player', 12, 10 + ROCK_COOLDOWN_SEC * 0.5, cooldowns), 0);

  // After cooldown expires, hitting a rock again deals 5 damage
  assert.equal(shouldApplyRockDamage('player', 12, 10 + ROCK_COOLDOWN_SEC + 0.05, cooldowns), 5);
});

test('Tree knockdown triggers once per standing tree, animates smoothly, and resets cleanly', () => {
  const tree = makeTree(0, 20, 30);

  // Tank driving north (+Z) clips tree
  const knocked = triggerTreeKnockdown(tree, 20, 27, 0, 12);
  assert.equal(knocked, true);
  assert.equal(tree.state, 'falling');
  assert.ok(tree.fallDirZ > 0.9, 'Tree should fall away in tank travel direction');

  // Touching an already falling tree does not re-trigger
  assert.equal(triggerTreeKnockdown(tree, 20, 28, 0, 12), false);

  const changed: number[] = [];
  stepFallingTrees([tree], TREE_FALL_DURATION * 0.5, changed);
  assert.deepEqual(changed, [0]);
  assert.equal(tree.state, 'falling');
  assert.ok(tree.tiltAngle > 0.2 && tree.tiltAngle < tree.targetTilt);

  stepFallingTrees([tree], TREE_FALL_DURATION * 0.6, changed);
  assert.deepEqual(changed, [0]);
  assert.equal(tree.state, 'fallen');
  assert.equal(tree.tiltAngle, tree.targetTilt);

  // Fallen tree no longer updates or re-triggers
  stepFallingTrees([tree], 0.1, changed);
  assert.deepEqual(changed, []);
  assert.equal(triggerTreeKnockdown(tree, 20, 29, 0, 12), false);

  // Match reset stands tree back up
  resetTreeStates([tree]);
  assert.equal(tree.state, 'standing');
  assert.equal(tree.tiltAngle, 0);
  assert.equal(tree.fallProgress, 0);
});

test('computeFallTargetTilt adapts fallen tree angle to uphill and downhill terrain', () => {
  const flatTilt = computeFallTargetTilt(10, 10, 5);
  const uphillTilt = computeFallTargetTilt(10, 12, 5);
  const downhillTilt = computeFallTargetTilt(10, 8, 5);

  assert.ok(uphillTilt < flatTilt, 'Uphill tree should stop at smaller angle so crown does not sink into slope');
  assert.ok(downhillTilt > flatTilt, 'Downhill tree should lean further down the slope');
});
