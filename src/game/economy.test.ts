import test from 'node:test';
import assert from 'node:assert/strict';
import { addSilver, computeKillReward, getSilver, isTankOwned, setSilver } from './economy';
import { evaluateMatchState, getModeDef, sortScoreboardRows } from './modes';
import { getTankSpec } from './tanks';

test('T-55 is free (0 silver) and owned by default, while silver accumulates', () => {
  const t55 = getTankSpec('t55');
  assert.equal(t55.priceSilver, 0);
  assert.equal(isTankOwned('t55'), true);

  setSilver(0);
  assert.equal(getSilver(), 0);
  assert.equal(addSilver(50), 50);
  assert.equal(addSilver(150), 200);
  assert.equal(getSilver(), 200);
});

test('Kill rewards give +50 per kill and +150 / +300 streak bonuses at 10 and 20 kills', () => {
  const k1 = computeKillReward(1);
  assert.equal(k1.baseSilver, 50);
  assert.equal(k1.streakBonus, 0);
  assert.equal(k1.totalSilver, 50);
  assert.equal(k1.bonusLabel, null);

  const k10 = computeKillReward(10);
  assert.equal(k10.baseSilver, 50);
  assert.equal(k10.streakBonus, 150);
  assert.equal(k10.totalSilver, 200);
  assert.ok(k10.bonusLabel);

  const k11 = computeKillReward(11);
  assert.equal(k11.streakBonus, 0);
  assert.equal(k11.totalSilver, 50);

  const k20 = computeKillReward(20);
  assert.equal(k20.baseSilver, 50);
  assert.equal(k20.streakBonus, 300);
  assert.equal(k20.totalSilver, 350);
  assert.ok(k20.bonusLabel);

  const k21 = computeKillReward(21);
  assert.equal(k21.streakBonus, 0);
  assert.equal(k21.totalSilver, 50);
});

test('Mode tdm100 (Бой до 100 киллов) finishes at 100 kills and awards +500 silver on player team victory', () => {
  const mode = getModeDef('tdm100');
  assert.equal(mode.name, 'Бой до 100 киллов');
  assert.equal(mode.targetKills, 100);
  assert.equal(mode.victoryRewardSilver, 500);

  const ongoing = evaluateMatchState(mode, 99, 99);
  assert.equal(ongoing.finished, false);
  assert.equal(ongoing.winner, null);
  assert.equal(ongoing.victorySilver, 0);

  const winA = evaluateMatchState(mode, 100, 74);
  assert.equal(winA.finished, true);
  assert.equal(winA.winner, 'A');
  assert.equal(winA.victorySilver, 500);

  const winB = evaluateMatchState(mode, 88, 100);
  assert.equal(winB.finished, true);
  assert.equal(winB.winner, 'B');
  assert.equal(winB.victorySilver, 0);
});

test('Scoreboard sorting orders by highest kills, then fewest deaths, then player first', () => {
  const sorted = sortScoreboardRows([
    { name: 'Т-55 A2', team: 'A', tankName: 'Т-55', kills: 5, deaths: 1, isPlayer: false, alive: true },
    { name: 'ВЫ (Т-55)', team: 'A', tankName: 'Т-55', kills: 5, deaths: 1, isPlayer: true, alive: true },
    { name: 'Т-55 A3', team: 'A', tankName: 'Т-55', kills: 8, deaths: 2, isPlayer: false, alive: true },
  ]);
  assert.equal(sorted[0].name, 'Т-55 A3');
  assert.equal(sorted[1].name, 'ВЫ (Т-55)');
  assert.equal(sorted[2].name, 'Т-55 A2');
});
