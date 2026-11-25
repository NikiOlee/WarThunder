import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOMBARDMENT_DURATION_SEC,
  BOMBARDMENT_MODE_ID,
  BOMBARDMENT_REWARD_SILVER,
  CUTSCENE_TOTAL_SEC,
  LONDON_MAP_ID,
  MAX_BOMB_DIAMETER_M,
  MAX_BOMB_RADIUS_M,
  TANK_HIT_MARGIN_M,
  createBombStrike,
  isBombardmentMode,
  isLondonMap,
  isModeOptionLocked,
  isTankCaughtInBomb,
  pickStrikeCandidate,
  resolveMapAndModeOnMapChange,
  resolveMapAndModeOnModeChange,
  stepBombStrikes,
  stepCutscene,
  type BombStrike,
} from './bombardment';

test('London map strictly locks mode to Bombardment and restores when leaving London', () => {
  assert.equal(isLondonMap('london'), true);
  assert.equal(isLondonMap('hills'), false);
  assert.equal(isBombardmentMode('bombardment'), true);

  // Switching map to London forces Bombardment
  const toLondon = resolveMapAndModeOnMapChange(LONDON_MAP_ID, 'tdm100');
  assert.deepEqual(toLondon, { mapId: 'london', modeId: 'bombardment' });

  // While on London, trying to select another mode stays locked on Bombardment
  assert.equal(isModeOptionLocked('london', 'tdm100'), true);
  assert.equal(isModeOptionLocked('london', 'dead'), true);
  assert.equal(isModeOptionLocked('london', 'bombardment'), false);
  assert.equal(isModeOptionLocked('hills', 'tdm100'), false);

  const attemptOtherMode = resolveMapAndModeOnModeChange('rounds5v5', LONDON_MAP_ID);
  assert.deepEqual(attemptOtherMode, { mapId: 'london', modeId: 'bombardment' });

  // Picking Bombardment from another map switches map to London
  const pickBombardment = resolveMapAndModeOnModeChange(BOMBARDMENT_MODE_ID, 'city');
  assert.deepEqual(pickBombardment, { mapId: 'london', modeId: 'bombardment' });

  // Switching map away from London unlocks normal default mode
  const leaveLondon = resolveMapAndModeOnMapChange('hills', BOMBARDMENT_MODE_ID);
  assert.deepEqual(leaveLondon, { mapId: 'hills', modeId: 'tdm100' });
});

test('Cutscene transitions smoothly from calm blue sky + 1940 caption to crimson sky, bombers, survive prompt, and combat', () => {
  const s0 = stepCutscene(0.4);
  assert.equal(s0.phase, 'calm_sky');
  assert.equal(s0.skyCrimson, 0);
  assert.equal(s0.topCaptionKey, 'cutsceneLondon1940');
  assert.equal(s0.centerCaptionKey, null);
  assert.equal(s0.showHud, false);

  const sFlyMid = stepCutscene(4.5);
  assert.equal(sFlyMid.phase, 'bombers_passing');
  assert.ok(sFlyMid.skyCrimson > 0.1 && sFlyMid.skyCrimson < 0.95);
  assert.ok(sFlyMid.bomberFlightProgress > 0.3 && sFlyMid.bomberFlightProgress < 0.8);
  assert.equal(sFlyMid.showHud, false);

  const sPrompt = stepCutscene(8.0);
  assert.equal(sPrompt.phase, 'final_prompt');
  assert.equal(sPrompt.skyCrimson, 1);
  assert.equal(sPrompt.centerCaptionKey, 'cutsceneSurvivePrompt');
  assert.ok(sPrompt.centerCaptionAlpha > 0.9);
  assert.equal(sPrompt.showHud, false);

  const sDrop = stepCutscene(10.4);
  assert.equal(sDrop.phase, 'camera_drop');
  assert.ok(sDrop.camDropProgress > 0.1 && sDrop.camDropProgress < 0.9);
  assert.equal(sDrop.showHud, false);

  const sCombat = stepCutscene(CUTSCENE_TOTAL_SEC + 0.1);
  assert.equal(sCombat.phase, 'combat');
  assert.equal(sCombat.skyCrimson, 1);
  assert.equal(sCombat.camDropProgress, 1);
  assert.equal(sCombat.topCaptionKey, null);
  assert.equal(sCombat.centerCaptionKey, null);
  assert.equal(sCombat.showHud, true);
});

test('Bomb strikes enforce max 20m diameter (10m radius) and exact one-shot lethal boundary check', () => {
  assert.equal(MAX_BOMB_DIAMETER_M, 20);
  assert.equal(MAX_BOMB_RADIUS_M, 10);
  assert.equal(BOMBARDMENT_DURATION_SEC, 300);
  assert.equal(BOMBARDMENT_REWARD_SILVER, 1000);

  for (let i = 0; i < 50; i++) {
    const b = createBombStrike(i, 10, 0, 20, i % 2 === 0 ? 'bomb' : 'rocket');
    assert.ok(b.radius <= MAX_BOMB_RADIUS_M, `Radius ${b.radius} exceeded 10m`);
    assert.ok(b.radius * 2 <= MAX_BOMB_DIAMETER_M);
    assert.ok(b.fuseTotal >= 1.5);
  }

  // Inside warning ring -> lethal hit
  assert.equal(isTankCaughtInBomb(0, 0, 5, 0, 10), true);
  // Touching outer edge within tank margin -> lethal hit
  assert.equal(isTankCaughtInBomb(0, 0, 10 + TANK_HIT_MARGIN_M - 0.1, 0, 10), true);
  // Safely outside yellow ring -> survives
  assert.equal(isTankCaughtInBomb(0, 0, 10 + TANK_HIT_MARGIN_M + 0.5, 0, 10), false);
});

test('stepBombStrikes detonates expired strikes and reports instant player hit', () => {
  const strikes: BombStrike[] = [
    { ...createBombStrike(1, 0, 0, 0, 'bomb', () => 0.5), fuseRemaining: 0.2 },
    { ...createBombStrike(2, 40, 0, 40, 'rocket', () => 0.5), fuseRemaining: 1.4 },
  ];

  const ev1 = stepBombStrikes(strikes, 0.25, 2, 1, true);
  assert.equal(ev1.length, 1);
  assert.equal(ev1[0].strike.id, 1);
  assert.equal(ev1[0].hitPlayer, true);
  assert.equal(strikes.length, 1);

  const ev2 = stepBombStrikes(strikes, 1.5, 0, 0, true);
  assert.equal(ev2.length, 1);
  assert.equal(ev2[0].strike.id, 2);
  assert.equal(ev2[0].hitPlayer, false);
  assert.equal(strikes.length, 0);
});

test('pickStrikeCandidate respects world bounds, open spots, and spacing', () => {
  let seed = 1;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const existing: BombStrike[] = [createBombStrike(1, 10, 0, -210, 'bomb', rng)];
  const cand = pickStrikeCandidate({
    elapsedSec: 60,
    playerX: 0,
    playerZ: -220,
    playerHeading: 0,
    playerSpeed: 8,
    worldLimit: 480,
    heightAt: () => 0,
    isSpotOpen: (x, z) => Math.hypot(x, z) > 0,
    existingStrikes: existing,
    rng,
  });
  assert.ok(cand !== null);
  assert.ok(Math.abs(cand.x) <= 456);
  assert.ok(Math.abs(cand.z) <= 456);
  assert.ok(Math.hypot(cand.x - existing[0].x, cand.z - existing[0].z) >= 8.5);
});

test('Anti-camp targeting drops lethal overlapping strikes when tank stands still or hugs a wall', () => {
  let seed = 7;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Even if spot-open rejects everything (simulating hugging a building footprint), stillSec >= 1.5 forces a direct strike!
  const candWall = pickStrikeCandidate({
    elapsedSec: 12,
    playerX: 40,
    playerZ: -120,
    playerHeading: 0,
    playerSpeed: 0,
    stillSec: 2.0,
    worldLimit: 480,
    heightAt: () => 0,
    isSpotOpen: () => false,
    existingStrikes: [],
    rng,
  });
  assert.ok(candWall !== null);
  const sWall = createBombStrike(1, candWall.x, 0, candWall.z, candWall.kind, rng);
  assert.equal(isTankCaughtInBomb(40, -120, sWall.x, sWall.z, sWall.radius), true);

  // Standing completely still for 6 seconds in simulation must result in at least one lethal hit
  const active: BombStrike[] = [];
  let hitCount = 0;
  for (let tick = 0; tick < 60; tick++) {
    const t = tick * 0.1;
    if (tick % 10 === 0 && active.length < 4) {
      const c = pickStrikeCandidate({
        elapsedSec: t,
        playerX: 0,
        playerZ: -240,
        playerHeading: 0,
        playerSpeed: 0,
        stillSec: t,
        worldLimit: 480,
        heightAt: () => 0,
        isSpotOpen: () => true,
        existingStrikes: active,
        rng,
      });
      if (c) active.push(createBombStrike(tick + 1, c.x, 0, c.z, c.kind, rng));
    }
    const evs = stepBombStrikes(active, 0.1, 0, -240, true);
    for (const ev of evs) if (ev.hitPlayer) hitCount++;
  }
  assert.ok(hitCount >= 1, 'Expected stationary AFK tank to be hit by bombardment');
});
