import test from 'node:test';
import assert from 'node:assert/strict';
import { addSilver, computeKillReward, getSilver, isTankOwned, purchaseTank, setSilver } from './economy';
import { evaluateMatchState, evaluateRoundState, getAllModes, getModeDef, sortScoreboardRows } from './modes';
import { getSelectedTankId, getTankSpec, setSelectedTankId } from './tanks';

test('T-55 is free (0 silver) and owned by default, while paid tanks scale strictly from 1500 to 120000 silver', () => {
  const t55 = getTankSpec('t55');
  assert.equal(t55.priceSilver, 0);
  assert.equal(isTankOwned('t55'), true);

  const checkBuy = (id: string, expectedPrice: number) => {
    const spec = getTankSpec(id);
    assert.equal(spec.priceSilver, expectedPrice);
    assert.equal(isTankOwned(id), false);

    setSilver(expectedPrice - 100);
    const failed = purchaseTank(id);
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, 'insufficient');
    assert.equal(isTankOwned(id), false);

    addSilver(200); // expectedPrice + 100
    const bought = purchaseTank(id);
    assert.equal(bought.ok, true);
    assert.equal(bought.balance, 100);
    assert.equal(getSilver(), 100);
    assert.equal(isTankOwned(id), true);

    assert.equal(setSelectedTankId(id), id);
    assert.equal(getSelectedTankId(), id);
  };

  checkBuy('m60a3', 1500);
  checkBuy('t62m', 2300);
  checkBuy('t72b3', 4500);
  checkBuy('leopard2a4', 11500);
  checkBuy('ztz96a', 12300);
  checkBuy('m1a1', 12500);
  checkBuy('t90m', 16800);
  checkBuy('challenger2', 19000);
  checkBuy('merkava4', 65600);
  checkBuy('leclerc', 69300);
  checkBuy('leopard2a7v', 76200);
  checkBuy('k2', 105900);
  checkBuy('m1a2sep', 120000);

  setSelectedTankId('t55');
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

test('Mode tdm100 (Бой до 100 киллов) finishes at 100 kills and locks cheats & bot accuracy', () => {
  const mode = getModeDef('tdm100');
  assert.equal(mode.name, 'Бой до 100 киллов');
  assert.equal(mode.teamSize, 4);
  assert.equal(mode.targetKills, 100);
  assert.equal(mode.victoryRewardSilver, 500);
  assert.equal(mode.allowConsole, true);
  assert.equal(mode.allowCheats, false);
  assert.equal(mode.allowBotAccuracy, false);

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

test('Training mode unlocks cheats and bot accuracy, while 5v5 rounds mode enables spectator and round wins', () => {
  const all = getAllModes();
  assert.equal(all.length, 5);

  const training = getModeDef('training');
  assert.equal(training.name, 'Тренировка');
  assert.equal(training.allowConsole, true);
  assert.equal(training.allowCheats, true);
  assert.equal(training.allowBotAccuracy, true);
  assert.equal(training.silverRewards, false);
  assert.equal(evaluateMatchState(training, 500, 500).finished, false);

  const rounds = getModeDef('rounds5v5');
  assert.equal(rounds.teamSize, 5);
  assert.equal(rounds.respawns, false);
  assert.equal(rounds.spectatorOnDeath, true);
  assert.equal(rounds.allowConsole, true);
  assert.equal(rounds.allowCheats, false);
  assert.equal(rounds.allowBotAccuracy, false);
  assert.equal(rounds.roundsToWin, 3);

  // Mid-round: both sides alive
  const rMid = evaluateRoundState(3, 2, 1, 1, rounds.roundsToWin, rounds.victoryRewardSilver);
  assert.equal(rMid.roundEnded, false);

  // Round win (all enemies destroyed)
  const rWin = evaluateRoundState(2, 0, 1, 1, rounds.roundsToWin, rounds.victoryRewardSilver);
  assert.equal(rWin.roundEnded, true);
  assert.equal(rWin.roundWinner, 'A');
  assert.equal(rWin.teamARounds, 2);
  assert.equal(rWin.matchFinished, false);

  // Match victory on 3rd round win
  const mWin = evaluateRoundState(1, 0, 2, 1, rounds.roundsToWin, rounds.victoryRewardSilver);
  assert.equal(mWin.roundEnded, true);
  assert.equal(mWin.matchFinished, true);
  assert.equal(mWin.matchWinner, 'A');
  assert.equal(mWin.victorySilver, 500);
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

test('Джагернаут: 6 охотников против босса, респавн включён, награда 1500', () => {
  const m = getModeDef('juggernaut');
  assert.equal(m.name, 'Джагернаут');
  assert.equal(m.teamSize, 6);
  assert.equal(m.boss, true);
  assert.equal(m.respawns, true);
  assert.equal(m.victoryRewardSilver, 1500);
  assert.equal(m.allowCheats, false);
});
