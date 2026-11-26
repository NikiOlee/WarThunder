import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HILLS_OBJECTIVES,
  SPAWN,
  SPAWN_B,
  heightAt,
  hillsSpawnA,
  hillsSpawnB,
  normalAt,
} from './world';

test('Hills terrain heightAt and normalAt are mirror-symmetrical across z = 0', () => {
  const xs = [-420, -280, -160, -75, 0, 75, 160, 210, 320, 440];
  const zs = [5, 35, 90, 150, 240, 330, 420, 460];

  for (const x of xs) {
    for (const z of zs) {
      const hNorth = heightAt(x, -z);
      const hSouth = heightAt(x, z);
      assert.ok(
        Math.abs(hNorth - hSouth) < 1e-6,
        `Height mismatch at x=${x}, z=±${z}: north=${hNorth}, south=${hSouth}`,
      );

      const nNorth = normalAt(x, -z);
      const nSouth = normalAt(x, z);
      assert.ok(Math.abs(nNorth.x - nSouth.x) < 1e-6);
      assert.ok(Math.abs(nNorth.y - nSouth.y) < 1e-6);
      assert.ok(Math.abs(nNorth.z + nSouth.z) < 1e-6);
    }
  }
});

test('Hills spawns for both teams are mirrored on flat plateaus of equal height', () => {
  assert.equal(SPAWN.x, SPAWN_B.x);
  assert.equal(SPAWN.z, -SPAWN_B.z);
  assert.equal(heightAt(SPAWN.x, SPAWN.z), heightAt(SPAWN_B.x, SPAWN_B.z));

  for (let i = 0; i < 6; i++) {
    const a = hillsSpawnA(i);
    const b = hillsSpawnB(i);
    assert.equal(a.x, b.x);
    assert.equal(a.z, -b.z);
    assert.equal(a.heading, 0);
    assert.equal(b.heading, Math.PI);
    assert.ok(Math.abs(heightAt(a.x, a.z) - heightAt(b.x, b.z)) < 1e-6);
  }
});

test('Hills objectives are symmetrical across z = 0', () => {
  const keys = new Set(HILLS_OBJECTIVES.map((o) => `${o.x},${o.z}`));
  for (const o of HILLS_OBJECTIVES) {
    assert.ok(keys.has(`${o.x},${-o.z}`), `Missing mirrored objective for (${o.x}, ${o.z})`);
  }
});
