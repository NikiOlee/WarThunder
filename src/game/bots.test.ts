import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEngagementDrive,
  computeShotGate,
  computeWeakspotAimOffset,
  createAntiStuckState,
  pickBestTarget,
  pickCombatSectorWaypoint,
  stepAntiStuck,
} from './botTactics';
import { computePlayerSkillRating, resolveBotSkillMultiplier } from './playerSkill';

test('Bot tactical targeting prioritizes wounded and exposed targets over full-HP head-on targets', () => {
  const chosen = pickBestTarget(
    { x: 0, z: 0 },
    [
      {
        id: 'full_headon',
        x: 0,
        z: 180,
        heading: Math.PI, // facing directly at bot
        hp: 120,
        maxHp: 120,
        range: 180,
        hasLineOfSight: true,
        isPlayer: false,
      },
      {
        id: 'wounded_flank',
        x: 15,
        z: 195,
        heading: Math.PI / 2, // side exposed
        hp: 35,
        maxHp: 120,
        range: 196,
        hasLineOfSight: true,
        isPlayer: false,
      },
    ],
    null,
  );
  assert.ok(chosen);
  assert.equal(chosen.id, 'wounded_flank');
});

test('Bots advance into active combat sectors and toward wounded enemies when occluded', () => {
  const wp = pickCombatSectorWaypoint({
    botX: 0,
    botZ: -300,
    flankSign: 1,
    enemies: [
      { x: -180, z: 220, hp: 120, maxHp: 120 },
      { x: 90, z: 120, hp: 30, maxHp: 120 },
    ],
    allies: [{ x: 40, z: 50, inCombat: true }],
    fallback: { x: 0, z: 0 },
  });
  // Waypoint moves forward toward wounded combat sector near x=90, z=120
  assert.ok(wp.z > -200);
  assert.ok(wp.x > -40);
});

test('Engagement drive fires on the move without braking or slowing when ready to shoot', () => {
  const farDrive = computeEngagementDrive({
    dx: 0,
    dz: 330,
    targetHeading: Math.PI,
    flankSign: 1,
    reloadTimer: 0.2,
    yawErr: 0.02,
    canSeeTarget: true,
  });
  assert.equal(farDrive.throttle, 1.0);
  assert.equal(farDrive.brake, false);

  const readyMidDrive = computeEngagementDrive({
    dx: 0,
    dz: 140,
    targetHeading: Math.PI,
    flankSign: 1,
    reloadTimer: 0.0,
    yawErr: 0.01,
    canSeeTarget: true,
  });
  assert.ok(readyMidDrive.throttle >= 0.88);
  assert.equal(readyMidDrive.brake, false);

  const brawlDrive = computeEngagementDrive({
    dx: 0,
    dz: 135,
    targetHeading: Math.PI,
    flankSign: 1,
    reloadTimer: 2.5,
    yawErr: 0.2,
    canSeeTarget: true,
  });
  assert.ok(brawlDrive.throttle >= 0.7);
  assert.ok(Math.abs(brawlDrive.desiredHeading) > 0.4);
});

test('rushBoss swarm pushes Maus at full speed from varied flanking angles by botIndex', () => {
  const d0 = computeEngagementDrive({
    dx: 0,
    dz: 120,
    targetHeading: Math.PI,
    flankSign: 1,
    reloadTimer: 0,
    yawErr: 0.02,
    canSeeTarget: true,
    rushBoss: true,
    botIndex: 0,
  });
  const d2 = computeEngagementDrive({
    dx: 0,
    dz: 120,
    targetHeading: Math.PI,
    flankSign: 1,
    reloadTimer: 0,
    yawErr: 0.02,
    canSeeTarget: true,
    rushBoss: true,
    botIndex: 2,
  });
  assert.equal(d0.throttle, 1.0);
  assert.equal(d2.throttle, 1.0);
  assert.equal(d0.brake, false);
  assert.ok(d2.desiredHeading > d0.desiredHeading);
});

test('stepAntiStuck triggers reverse and escape turn when wedged against wall or spinning in place', () => {
  // 1. Stuck against wall (< 2.2m displacement over 1.2s)
  const wallState = createAntiStuckState(10, 10, 0, 1);
  let res = stepAntiStuck(wallState, 10.4, 10.2, 0.1, 0.6);
  assert.equal(res.reversing, false);
  res = stepAntiStuck(wallState, 10.8, 10.3, 0.2, 0.6);
  assert.equal(res.reversing, true);
  assert.equal(res.overrideThrottle, -1);
  assert.equal(res.overrideSteer, -1); // flips avoidSign from +1 to -1

  // Finish reverse phase, then transition into forward escape drive
  stepAntiStuck(wallState, 7, 7, -0.4, 1.1);
  res = stepAntiStuck(wallState, 6, 6, -0.5, 0.2);
  assert.equal(res.escaping, true);
  assert.equal(res.overrideThrottle, 1);

  // 2. Spinning in circles (> 2.2 rad turn with < 6.5m net displacement)
  const spinState = createAntiStuckState(0, 0, 0, -1);
  stepAntiStuck(spinState, 1, 0, 1.5, 0.6);
  const spinRes = stepAntiStuck(spinState, 1.2, 0.2, 3.0, 0.6);
  assert.equal(spinRes.reversing, true);
  assert.equal(spinRes.overrideThrottle, -1);
  assert.equal(spinRes.overrideSteer, 1);
});

test('Shot gate fires decisively at realistic combat alignment instead of rejecting 1-degree errors', () => {
  assert.equal(
    computeShotGate({
      range: 180,
      maxEffectiveRange: 388,
      reactT: 0,
      yawErr: 0.022,
      elevErr: 0.018,
      hasLineOfSight: true,
    }),
    true,
  );
  assert.equal(
    computeShotGate({
      range: 180,
      maxEffectiveRange: 388,
      reactT: 0,
      yawErr: 0.25,
      elevErr: 0.01,
      hasLineOfSight: true,
    }),
    false,
  );
});

test('Weakspot aimer shifts point toward rear fuel bay when attacking from behind', () => {
  const rearOffset = computeWeakspotAimOffset({
    botX: 0,
    botZ: -120,
    targetX: 0,
    targetZ: 0,
    targetHeading: 0, // enemy facing +Z away from bot
    skill: 1.0,
  });
  assert.ok(rearOffset.oz < -1.0);
});

test('Adaptive player skill script scales difficulty smoothly and maintains confident bot-vs-bot floor', () => {
  const rookie = computePlayerSkillRating({
    shots: 40,
    hits: 6,
    pens: 2,
    kills: 1,
    deaths: 8,
    damageDealt: 120,
  });
  const ace = computePlayerSkillRating({
    shots: 60,
    hits: 44,
    pens: 34,
    kills: 18,
    deaths: 2,
    damageDealt: 2800,
  });

  assert.ok(rookie >= 0.75 && rookie < 1.0);
  assert.ok(ace > 1.15 && ace <= 1.45);

  // Competitive mode adapts vs player, keeps >= 1.05 floor vs other bots
  assert.equal(
    resolveBotSkillMultiplier({
      configuredSkill: 0.4,
      allowBotAccuracy: false,
      playerSkillRating: rookie,
      targetIsPlayer: true,
    }),
    rookie,
  );
  assert.ok(
    resolveBotSkillMultiplier({
      configuredSkill: 0.4,
      allowBotAccuracy: false,
      playerSkillRating: rookie,
      targetIsPlayer: false,
    }) >= 1.05,
  );

  // Training mode obeys user's manual slider
  assert.equal(
    resolveBotSkillMultiplier({
      configuredSkill: 1.6,
      allowBotAccuracy: true,
      playerSkillRating: rookie,
      targetIsPlayer: true,
    }),
    1.6,
  );
});
