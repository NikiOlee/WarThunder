import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearMatchHistory,
  formatMatchTimestamp,
  getMatchHistory,
  MAX_MATCH_HISTORY,
  recordMatchHistory,
  summarizeMatchHistory,
} from './matchHistory';
import { evaluateSurvivalState, formatCountdown, getModeDef } from './modes';
import { computeEngagementDrive, pickBestTarget } from './botTactics';

test('Match history stores newest first, caps at 20 entries, summarizes stats, and clears cleanly', () => {
  clearMatchHistory();
  assert.deepEqual(getMatchHistory(), []);
  assert.deepEqual(summarizeMatchHistory([]), {
    total: 0,
    wins: 0,
    losses: 0,
    winRatePct: 0,
    totalSilver: 0,
  });

  for (let i = 1; i <= 25; i++) {
    recordMatchHistory({
      id: `match_${i}`,
      timestamp: 1700000000000 + i * 60000,
      modeId: i % 2 === 0 ? 'dead' : 'tdm100',
      modeName: i % 2 === 0 ? 'Мертвецы' : 'Бой до 100 киллов',
      mapId: 'hills',
      mapName: 'Холмы',
      won: i % 2 === 0,
      tankId: 't62m',
      tankName: 'Т-62М',
      scoreText: i % 2 === 0 ? '05:00 · 9 фрагов' : `${80 + i} : 100`,
      playerKills: i,
      playerDeaths: i % 2 === 0 ? 0 : 3,
      silverEarned: i % 2 === 0 ? 1500 : 150,
    });
  }

  const list = getMatchHistory();
  assert.equal(list.length, MAX_MATCH_HISTORY);
  assert.equal(list[0].id, 'match_25');
  assert.equal(list[list.length - 1].id, 'match_6');
  assert.equal(list[0].tankName, 'Т-62М');

  const summary = summarizeMatchHistory(list);
  assert.equal(summary.total, 20);
  assert.equal(summary.wins, 10);
  assert.equal(summary.losses, 10);
  assert.equal(summary.winRatePct, 50);
  assert.equal(summary.totalSilver, 10 * 1500 + 10 * 150);

  assert.match(formatMatchTimestamp(list[0].timestamp), /^\d{2}\.\d{2} \d{2}:\d{2}$/);

  clearMatchHistory();
  assert.deepEqual(getMatchHistory(), []);
});

test('Режим «Мертвецы»: соло 1 против 5, респаун врагов 4 с, случайные танки и награда 1500 за 5:00 выживания', () => {
  const dead = getModeDef('dead');
  assert.equal(dead.name, 'Мертвецы');
  assert.equal(dead.teamSize, 1);
  assert.equal(dead.enemyCount, 5);
  assert.equal(dead.survivalSeconds, 300);
  assert.equal(dead.botRespawnSeconds, 4);
  assert.equal(dead.randomEnemyTanks, true);
  assert.equal(dead.huntPlayer, true);
  assert.equal(dead.respawns, false);
  assert.equal(dead.victoryRewardSilver, 1500);
  assert.equal(dead.allowCheats, false);

  assert.equal(formatCountdown(300), '05:00');
  assert.equal(formatCountdown(61), '01:01');
  assert.equal(formatCountdown(0.2), '00:01');
  assert.equal(formatCountdown(0), '00:00');

  const mid = evaluateSurvivalState(dead, 142, true);
  assert.equal(mid.finished, false);
  assert.equal(mid.winner, null);

  const died = evaluateSurvivalState(dead, 210, false);
  assert.equal(died.finished, true);
  assert.equal(died.winner, 'B');
  assert.equal(died.victorySilver, 0);

  const survived = evaluateSurvivalState(dead, 0, true);
  assert.equal(survived.finished, true);
  assert.equal(survived.winner, 'A');
  assert.equal(survived.victorySilver, 1500);
});

test('Bot pursuit tactics support long-range player hunting in «Мертвецы»', () => {
  const farPlayer = pickBestTarget(
    { x: 0, z: 0 },
    [
      {
        id: 'ВЫ (Т-55)',
        x: 900,
        z: 0,
        heading: 0,
        hp: 120,
        maxHp: 120,
        range: 900,
        hasLineOfSight: true,
        isPlayer: true,
      },
    ],
    null,
    1600,
  );
  assert.ok(farPlayer);
  assert.equal(farPlayer.id, 'ВЫ (Т-55)');

  const drive = computeEngagementDrive({
    dx: 240,
    dz: 0,
    targetHeading: 0,
    flankSign: 1,
    reloadTimer: 1.5,
    yawErr: 0.2,
    canSeeTarget: false,
    huntPlayer: true,
    botIndex: 2,
  });
  assert.equal(drive.throttle, 1.0);
  assert.equal(drive.brake, false);
});
