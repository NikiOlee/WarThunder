import test from 'node:test';
import assert from 'node:assert/strict';
import { worldToMinimap } from './minimap';
import { getBossMusicStepData } from './audio';

test('worldToMinimap projects center, forward (+Z up), right (-X right), and clamps edges', () => {
  const S = 156;
  const L = 480;

  const center = worldToMinimap(0, 0, L, S);
  assert.equal(center.x, 78);
  assert.equal(center.y, 78);

  // +Z is North (top of minimap => smaller y)
  const north = worldToMinimap(0, 240, L, S);
  assert.equal(north.x, 78);
  assert.ok(north.y < 78);

  // -X is screen right (larger x)
  const right = worldToMinimap(-240, 0, L, S);
  assert.ok(right.x > 78);
  assert.equal(right.y, 78);

  // Out-of-bounds clamps cleanly inside canvas border
  const oob = worldToMinimap(-999, 999, L, S);
  assert.equal(oob.x, S - 2);
  assert.equal(oob.y, 2);
});

test('getBossMusicStepData generates syncopated industrial metal rhythm with choked stops', () => {
  const s0 = getBossMusicStepData(0);
  assert.equal(s0.isStop, false);
  assert.equal(s0.kick, true);
  assert.equal(s0.bassAccent, true);
  assert.ok(s0.bassMidi !== null);
  assert.ok(s0.stabMidi !== null);

  // Bar tail (steps 30-31) chokes out into sudden breakcore stop
  const stop30 = getBossMusicStepData(30);
  assert.equal(stop30.isStop, true);
  assert.equal(stop30.kick, false);
  assert.equal(stop30.bassMidi, null);
  assert.equal(stop30.stabMidi, null);

  // Phrase 3 adds extended 4-step break at end of 128-step cycle
  const phrase3Tail = getBossMusicStepData(32 * 3 + 28);
  assert.equal(phrase3Tail.isStop, true);
});
