import test from 'node:test';
import assert from 'node:assert/strict';
import { RAM_COOLDOWN_SEC, RAM_DAMAGE, resolveTankCollisionPair } from './collision';

test('Tanks cannot pass through each other (head-on and side-on capsule separation)', () => {
  const cooldowns = new Map<string, number>();

  // Head-on overlap along Z
  const resHeadOn = resolveTankCollisionPair(
    { id: 'a', x: 0, z: 0, heading: 0, speed: 1, alive: true, team: 'A' },
    { id: 'b', x: 0, z: 5.0, heading: Math.PI, speed: 1, alive: true, team: 'B' },
    0,
    cooldowns,
  );
  assert.equal(resHeadOn.separated, true);
  assert.ok(resHeadOn.dzA < 0, 'Tank A should be pushed backward');
  assert.ok(resHeadOn.dzB > 0, 'Tank B should be pushed forward');
  // After applying separation, closing gap >= 3.7m between capsules
  const sepDz = 5.0 + resHeadOn.dzB - (0 + resHeadOn.dzA);
  assert.ok(sepDz >= 6.99, `Head-to-head centers must stay >= ~7m apart, got ${sepDz}`);

  // Side-by-side overlap along X
  const resSide = resolveTankCollisionPair(
    { id: 'a', x: 0, z: 0, heading: 0, speed: 0, alive: true, team: 'A' },
    { id: 'b', x: 2.5, z: 0, heading: 0, speed: 0, alive: true, team: 'A' },
    1,
    cooldowns,
  );
  assert.equal(resSide.separated, true);
  const newDistX = 2.5 + resSide.dxB - (0 + resSide.dxA);
  assert.ok(Math.abs(newDistX - 3.7) < 0.01);

  // Alive tank cannot drive through destroyed wreck; wreck stays put
  const resWreck = resolveTankCollisionPair(
    { id: 'a', x: 0, z: 0, heading: 0, speed: 5, alive: true, team: 'A' },
    { id: 'wreck', x: 2.0, z: 0, heading: 0, speed: 0, alive: false, team: 'B' },
    2,
    cooldowns,
  );
  assert.equal(resWreck.separated, true);
  assert.ok(resWreck.dxA < -1.5);
  assert.equal(resWreck.dxB, 0);
  assert.equal(resWreck.ramHits.length, 0);
});

test('Ramming deals 20 HP to struck enemy tank with cooldown and no friendly fire', () => {
  const cooldowns = new Map<string, number>();

  // Fast tank A rams stationary enemy B
  const ram1 = resolveTankCollisionPair(
    { id: 'player', x: 0, z: 0, heading: 0, speed: 12, alive: true, team: 'A' },
    { id: 'enemy1', x: 0, z: 6.2, heading: 0, speed: 0, alive: true, team: 'B' },
    10.0,
    cooldowns,
  );
  assert.equal(ram1.separated, true);
  assert.equal(ram1.ramHits.length, 1);
  assert.equal(ram1.ramHits[0].attackerId, 'player');
  assert.equal(ram1.ramHits[0].victimId, 'enemy1');
  assert.equal(ram1.ramHits[0].damage, RAM_DAMAGE);
  assert.equal(RAM_DAMAGE, 20);

  // Immediate next frame within cooldown does NOT double-deal 20 HP
  const ramCooldown = resolveTankCollisionPair(
    { id: 'player', x: 0, z: 0, heading: 0, speed: 12, alive: true, team: 'A' },
    { id: 'enemy1', x: 0, z: 6.2, heading: 0, speed: 0, alive: true, team: 'B' },
    10.2,
    cooldowns,
  );
  assert.equal(ramCooldown.ramHits.length, 0);

  // After cooldown expires, ramming can deal 20 HP again
  const ramAfterCooldown = resolveTankCollisionPair(
    { id: 'player', x: 0, z: 0, heading: 0, speed: 12, alive: true, team: 'A' },
    { id: 'enemy1', x: 0, z: 6.2, heading: 0, speed: 0, alive: true, team: 'B' },
    10.0 + RAM_COOLDOWN_SEC + 0.1,
    cooldowns,
  );
  assert.equal(ramAfterCooldown.ramHits.length, 1);
  assert.equal(ramAfterCooldown.ramHits[0].damage, 20);

  // Bumping an ally at high speed separates tanks without dealing friendly damage
  const allyBump = resolveTankCollisionPair(
    { id: 'player', x: 0, z: 0, heading: 0, speed: 13, alive: true, team: 'A' },
    { id: 'ally1', x: 0, z: 6.2, heading: 0, speed: 0, alive: true, team: 'A' },
    20.0,
    cooldowns,
  );
  assert.equal(allyBump.separated, true);
  assert.equal(allyBump.ramHits.length, 0);
});
