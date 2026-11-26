import { AIR_RAID_CONFIG, type AirRaidConfig } from './airRaidConfig';

export { AIR_RAID_CONFIG, createAirRaidConfig, type AirRaidConfig } from './airRaidConfig';

export const LONDON_MAP_ID = 'london';
export const BOMBARDMENT_MODE_ID = 'bombardment';
export const BOMBARDMENT_DURATION_SEC = AIR_RAID_CONFIG.phaseDurationSec;
export const BOMBARDMENT_REWARD_SILVER = 1000;
export const MAX_BOMB_DIAMETER_M = AIR_RAID_CONFIG.normalBombRadiusM * 2;
export const MAX_BOMB_RADIUS_M = AIR_RAID_CONFIG.normalBombRadiusM;
export const TANK_HIT_MARGIN_M = AIR_RAID_CONFIG.tankHitMarginM;

export type CutscenePhase =
  | 'calm_sky'
  | 'bombers_passing'
  | 'final_prompt'
  | 'camera_drop'
  | 'combat';

export interface CutsceneState {
  phase: CutscenePhase;
  elapsed: number;
  skyCrimson: number;
  bomberFlightProgress: number;
  topCaptionKey: string | null;
  topCaptionAlpha: number;
  centerCaptionKey: string | null;
  centerCaptionAlpha: number;
  camDropProgress: number;
  showHud: boolean;
}

export const CUTSCENE_TOTAL_SEC = 11.2;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function wrapAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function segmentToPointDistSq(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): { distSq: number; cx: number; cz: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-8) {
    return { distSq: (px - ax) * (px - ax) + (pz - az) * (pz - az), cx: ax, cz: az };
  }
  const u = clamp01(((px - ax) * dx + (pz - az) * dz) / len2);
  const cx = ax + dx * u;
  const cz = az + dz * u;
  return {
    distSq: (px - cx) * (px - cx) + (pz - cz) * (pz - cz),
    cx,
    cz,
  };
}

export function isLondonMap(mapId: string | null | undefined): boolean {
  return mapId === LONDON_MAP_ID;
}

export function isBombardmentMode(modeId: string | null | undefined): boolean {
  return modeId === BOMBARDMENT_MODE_ID;
}

export function resolveMapAndModeOnMapChange(
  nextMapId: string,
  currentModeId: string,
  fallbackModeId = 'tdm100',
): { mapId: string; modeId: string } {
  if (nextMapId === LONDON_MAP_ID) {
    return { mapId: LONDON_MAP_ID, modeId: BOMBARDMENT_MODE_ID };
  }
  return {
    mapId: nextMapId,
    modeId: currentModeId === BOMBARDMENT_MODE_ID ? fallbackModeId : currentModeId,
  };
}

export function resolveMapAndModeOnModeChange(
  nextModeId: string,
  currentMapId: string,
): { mapId: string; modeId: string } {
  if (currentMapId === LONDON_MAP_ID) {
    return { mapId: LONDON_MAP_ID, modeId: BOMBARDMENT_MODE_ID };
  }
  if (nextModeId === BOMBARDMENT_MODE_ID) {
    return { mapId: LONDON_MAP_ID, modeId: BOMBARDMENT_MODE_ID };
  }
  return { mapId: currentMapId, modeId: nextModeId };
}

export function isModeOptionLocked(currentMapId: string, candidateModeId: string): boolean {
  return isLondonMap(currentMapId) && candidateModeId !== BOMBARDMENT_MODE_ID;
}

export function stepCutscene(elapsedSec: number): CutsceneState {
  const t = Math.max(0, elapsedSec);

  if (t >= CUTSCENE_TOTAL_SEC) {
    return {
      phase: 'combat',
      elapsed: t,
      skyCrimson: 1,
      bomberFlightProgress: 1,
      topCaptionKey: null,
      topCaptionAlpha: 0,
      centerCaptionKey: null,
      centerCaptionAlpha: 0,
      camDropProgress: 1,
      showHud: true,
    };
  }

  let phase: CutscenePhase = 'calm_sky';
  if (t >= 9.6) phase = 'camera_drop';
  else if (t >= 6.8) phase = 'final_prompt';
  else if (t >= 2.2) phase = 'bombers_passing';

  const skyCrimson = smoothstep(2.3, 5.2, t);
  const bomberFlightProgress = clamp01((t - 2.0) / 4.8);

  const topCaptionVisible = t < 6.6;
  const topCaptionAlpha = topCaptionVisible
    ? Math.min(smoothstep(0.15, 0.75, t), 1 - smoothstep(5.8, 6.6, t))
    : 0;

  const centerCaptionVisible = t >= 6.8 && t < 10.2;
  const centerCaptionAlpha = centerCaptionVisible
    ? Math.min(smoothstep(6.8, 7.35, t), 1 - smoothstep(9.5, 10.2, t))
    : 0;

  const camDropProgress = smoothstep(9.6, CUTSCENE_TOTAL_SEC, t);

  return {
    phase,
    elapsed: t,
    skyCrimson,
    bomberFlightProgress,
    topCaptionKey: topCaptionVisible ? 'cutsceneLondon1940' : null,
    topCaptionAlpha,
    centerCaptionKey: centerCaptionVisible ? 'cutsceneSurvivePrompt' : null,
    centerCaptionAlpha,
    camDropProgress,
    showHud: false,
  };
}

export type BombStrikeKind = 'bomb' | 'rocket' | 'crash';

export interface BombStrike {
  id: number;
  kind: BombStrikeKind;
  x: number;
  groundY: number;
  z: number;
  radius: number;
  damage: number;
  fuseTotal: number;
  fuseRemaining: number;
  startHeight: number;
  whistlePlayed: boolean;
}

export interface BombDetonationEvent {
  strike: BombStrike;
  hitPlayer: boolean;
  damage: number;
}

export interface BombardmentWaveConfig {
  elapsedSec: number;
  totalSec?: number;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  playerSpeed: number;
  stillSec?: number;
  worldLimit: number;
  heightAt: (x: number, z: number) => number;
  isSpotOpen?: (x: number, z: number) => boolean;
  existingStrikes: ReadonlyArray<BombStrike>;
  rng?: () => number;
}

export function isTankCaughtInBomb(
  tankX: number,
  tankZ: number,
  bombX: number,
  bombZ: number,
  bombRadius: number,
  tankMargin = TANK_HIT_MARGIN_M,
): boolean {
  return Math.hypot(tankX - bombX, tankZ - bombZ) <= bombRadius + tankMargin;
}

export function hasThreateningBombAt(
  tankX: number,
  tankZ: number,
  strikes: ReadonlyArray<BombStrike>,
  marginAdjust = -0.35,
): boolean {
  for (let i = 0; i < strikes.length; i++) {
    const s = strikes[i];
    if (isTankCaughtInBomb(tankX, tankZ, s.x, s.z, s.radius, Math.max(0, TANK_HIT_MARGIN_M + marginAdjust))) {
      return true;
    }
  }
  return false;
}

export function createBombStrike(
  id: number,
  x: number,
  groundY: number,
  z: number,
  kind: BombStrikeKind,
  rng: () => number = Math.random,
  overrides?: {
    radius?: number;
    damage?: number;
    fuseTotal?: number;
    startHeight?: number;
  },
  config: AirRaidConfig = AIR_RAID_CONFIG,
): BombStrike {
  const isCrash = kind === 'crash';
  const isBomb = kind === 'bomb';
  const defaultRadius = isCrash
    ? config.crashBombRadiusM
    : isBomb
      ? config.normalBombMinRadiusM + rng() * Math.max(0, config.normalBombRadiusM - config.normalBombMinRadiusM)
      : Math.max(4.5, config.normalBombMinRadiusM * 0.68 + rng() * 1.75);
  const radius = overrides?.radius ?? (isCrash ? config.crashBombRadiusM : Math.min(config.normalBombRadiusM, Math.max(4.5, defaultRadius)));
  const damage = overrides?.damage ?? (isCrash ? config.crashBombDamage : config.normalBombDamage);
  const fuseTotal = overrides?.fuseTotal ?? (isBomb ? config.normalBombFallTimeSec : 1.85);
  const startHeight = overrides?.startHeight ?? (isBomb ? 125 : 110);
  return {
    id,
    kind,
    x,
    groundY,
    z,
    radius,
    damage,
    fuseTotal,
    fuseRemaining: fuseTotal,
    startHeight,
    whistlePlayed: false,
  };
}

// ============================================================================
// 7-Aircraft Air Raid & AA Defense State Machine
// ============================================================================

export type RaidAircraftRole = 'exact' | 'predictive' | 'area';
export type RaidAircraftFlightState = 'approaching' | 'egress' | 'crashing' | 'crashed';

export interface RaidAircraft {
  id: number;
  role: RaidAircraftRole;
  variant: 'he111' | 'ju88';
  state: RaidAircraftFlightState;
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
  speed: number;
  altitude: number;
  targetX: number;
  targetZ: number;
  targetLocked: boolean;
  predictiveJitterX: number;
  predictiveJitterZ: number;
  bombReleasedOnPass: boolean;
  egressRemainM: number;
  rearmTimerSec: number;
  aaUnderFire: boolean;
  crashVx: number;
  crashVy: number;
  crashVz: number;
  crashTargetX: number;
  crashTargetGroundY: number;
  crashTargetZ: number;
  crashRollRate: number;
}

export interface AirRaidState {
  started: boolean;
  elapsedSec: number;
  nextBombId: number;
  aaKillsTriggered: number;
  activeAaTargetId: number | null;
  aircraft: RaidAircraft[];
}

export interface CrashExplosionEvent {
  aircraftId: number;
  role: RaidAircraftRole;
  x: number;
  groundY: number;
  z: number;
  radius: number;
  damage: number;
  hitPlayer: boolean;
}

export interface AirRaidStepEvents {
  raidJustStarted: boolean;
  droppedBombs: BombStrike[];
  shotDownAircraft: RaidAircraft[];
  crashExplosions: CrashExplosionEvent[];
}

export interface AirRaidStepParams {
  dt: number;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  playerSpeed: number;
  playerAlive: boolean;
  worldLimit: number;
  heightAt: (x: number, z: number) => number;
  isSpotOpen?: (x: number, z: number) => boolean;
  config?: AirRaidConfig;
  rng?: () => number;
}

export function createAirRaidState(startBombId = 1): AirRaidState {
  return {
    started: false,
    elapsedSec: 0,
    nextBombId: startBombId,
    aaKillsTriggered: 0,
    activeAaTargetId: null,
    aircraft: [],
  };
}

export function selectNextAaTarget(
  aircraft: ReadonlyArray<RaidAircraft>,
  rng: () => number = Math.random,
): RaidAircraft | null {
  // Strict priority: 5 area bombers first, 2 primary (exact & predictive) strictly last!
  const areaAlive = aircraft.filter(
    (p) => p.role === 'area' && (p.state === 'approaching' || p.state === 'egress'),
  );
  if (areaAlive.length > 0) {
    const idx = Math.floor(rng() * areaAlive.length);
    return areaAlive[Math.min(areaAlive.length - 1, idx)];
  }
  const primaryAlive = aircraft.filter(
    (p) => (p.role === 'exact' || p.role === 'predictive') && (p.state === 'approaching' || p.state === 'egress'),
  );
  if (primaryAlive.length > 0) {
    const idx = Math.floor(rng() * primaryAlive.length);
    return primaryAlive[Math.min(primaryAlive.length - 1, idx)];
  }
  return null;
}

function pickRandomAreaPoint(
  worldLimit: number,
  cfg: AirRaidConfig,
  rng: () => number,
  isSpotOpen?: (x: number, z: number) => boolean,
): { x: number; z: number } {
  const bound = Math.max(45, worldLimit - cfg.areaDropEdgeMarginM);
  for (let attempt = 0; attempt < 16; attempt++) {
    const x = (rng() * 2 - 1) * bound;
    const z = (rng() * 2 - 1) * bound;
    if (!isSpotOpen || isSpotOpen(x, z)) return { x, z };
  }
  return {
    x: (rng() * 2 - 1) * bound,
    z: (rng() * 2 - 1) * bound,
  };
}

function computePredictivePoint(
  playerX: number,
  playerZ: number,
  playerHeading: number,
  playerSpeed: number,
  jitterX: number,
  jitterZ: number,
  worldLimit: number,
  cfg: AirRaidConfig,
): { x: number; z: number } {
  const bound = Math.max(40, worldLimit - 24);
  const vx = Math.sin(playerHeading) * playerSpeed;
  const vz = Math.cos(playerHeading) * playerSpeed;
  return {
    x: clamp(playerX + vx * cfg.predictiveLeadTimeSec + jitterX, -bound, bound),
    z: clamp(playerZ + vz * cfg.predictiveLeadTimeSec + jitterZ, -bound, bound),
  };
}

function spawnWaveAircraft(
  params: AirRaidStepParams,
  cfg: AirRaidConfig,
  rng: () => number,
): RaidAircraft[] {
  const list: RaidAircraft[] = [];
  const total = Math.max(2, cfg.totalAircraft);
  const altSpan = Math.max(0, cfg.cruiseAltitudeMaxM - cfg.cruiseAltitudeMinM);

  for (let i = 0; i < total; i++) {
    const role: RaidAircraftRole = i === 0 ? 'exact' : i === 1 ? 'predictive' : 'area';
    const variant: 'he111' | 'ju88' = i % 2 === 0 ? 'he111' : 'ju88';
    const altitude = cfg.cruiseAltitudeMinM + ((i * 0.37) % 1) * altSpan;
    const speed =
      role === 'exact'
        ? cfg.exactAircraftSpeedMps
        : role === 'predictive'
          ? cfg.predictiveAircraftSpeedMps
          : cfg.areaAircraftSpeedMps;

    const jitAng = rng() * Math.PI * 2;
    const jitMag = rng() * cfg.predictiveToleranceM;
    const predictiveJitterX = Math.cos(jitAng) * jitMag;
    const predictiveJitterZ = Math.sin(jitAng) * jitMag;

    let targetX: number;
    let targetZ: number;
    if (role === 'exact') {
      targetX = params.playerX;
      targetZ = params.playerZ;
    } else if (role === 'predictive') {
      const pt = computePredictivePoint(
        params.playerX,
        params.playerZ,
        params.playerHeading,
        params.playerSpeed,
        predictiveJitterX,
        predictiveJitterZ,
        params.worldLimit,
        cfg,
      );
      targetX = pt.x;
      targetZ = pt.z;
    } else {
      const pt = pickRandomAreaPoint(params.worldLimit, cfg, rng, params.isSpotOpen);
      targetX = pt.x;
      targetZ = pt.z;
    }

    const bearing = (i / total) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const spawnDist =
      role === 'exact'
        ? cfg.exactInitialDistanceM
        : role === 'predictive'
          ? cfg.predictiveInitialDistanceM
          : cfg.spawnPerimeterRadiusM + (i - 2) * 28;
    const bound = Math.max(80, params.worldLimit + 60);
    const x = clamp(targetX + Math.cos(bearing) * spawnDist, -bound, bound);
    const z = clamp(targetZ + Math.sin(bearing) * spawnDist, -bound, bound);
    const heading = Math.atan2(targetX - x, targetZ - z);

    list.push({
      id: i,
      role,
      variant,
      state: 'approaching',
      x,
      y: altitude,
      z,
      heading,
      pitch: 0,
      roll: 0,
      speed,
      altitude,
      targetX,
      targetZ,
      targetLocked: false,
      predictiveJitterX,
      predictiveJitterZ,
      bombReleasedOnPass: false,
      egressRemainM: 0,
      rearmTimerSec: 0,
      aaUnderFire: false,
      crashVx: 0,
      crashVy: 0,
      crashVz: 0,
      crashTargetX: x,
      crashTargetGroundY: 0,
      crashTargetZ: z,
      crashRollRate: (i % 2 === 0 ? 1 : -1) * 1.25,
    });
  }

  return list;
}

function initiateAircraftCrash(
  plane: RaidAircraft,
  cfg: AirRaidConfig,
  worldLimit: number,
  heightAt: (x: number, z: number) => number,
): void {
  plane.state = 'crashing';
  plane.aaUnderFire = false;
  const g = Math.max(1, cfg.crashGravityMps2);
  const v0 = Math.max(1, cfg.crashDescentSpeedMps);
  const groundHere = heightAt(plane.x, plane.z);
  const h0 = Math.max(18, plane.y - groundHere);
  const fallSec = (-v0 + Math.sqrt(v0 * v0 + 2 * g * h0)) / g;

  const rawImpactX = plane.x + Math.sin(plane.heading) * cfg.crashForwardSpeedMps * fallSec;
  const rawImpactZ = plane.z + Math.cos(plane.heading) * cfg.crashForwardSpeedMps * fallSec;
  const safeBound = Math.max(40, worldLimit - cfg.crashBombRadiusM - 6);
  const impactX = clamp(rawImpactX, -safeBound, safeBound);
  const impactZ = clamp(rawImpactZ, -safeBound, safeBound);
  const impactGroundY = heightAt(impactX, impactZ);

  // Re-solve exact fall time to target ground height so crash lands cleanly at (impactX, impactZ)
  const hTarget = Math.max(18, plane.y - impactGroundY);
  const exactFallSec = (-v0 + Math.sqrt(v0 * v0 + 2 * g * hTarget)) / g;

  plane.crashVx = (impactX - plane.x) / Math.max(0.4, exactFallSec);
  plane.crashVz = (impactZ - plane.z) / Math.max(0.4, exactFallSec);
  plane.crashVy = -v0;
  plane.heading = Math.atan2(plane.crashVx, plane.crashVz);
  plane.crashTargetX = impactX;
  plane.crashTargetGroundY = impactGroundY;
  plane.crashTargetZ = impactZ;
}

export function stepAirRaid(
  raid: AirRaidState,
  strikes: BombStrike[],
  params: AirRaidStepParams,
): AirRaidStepEvents {
  const cfg = params.config ?? AIR_RAID_CONFIG;
  const rng = params.rng ?? Math.random;
  const dt = Math.max(0, Math.min(0.25, params.dt));
  const events: AirRaidStepEvents = {
    raidJustStarted: false,
    droppedBombs: [],
    shotDownAircraft: [],
    crashExplosions: [],
  };

  raid.elapsedSec += dt;
  if (!raid.started) {
    if (raid.elapsedSec < cfg.startDelaySec) {
      return events;
    }
    raid.started = true;
    events.raidJustStarted = true;
    raid.aircraft = spawnWaveAircraft(params, cfg, rng);
  }

  // Schedule AA target focus & gradual kills across the 300s phase
  const killTimes = cfg.aaKillTimesSec;
  if (raid.aaKillsTriggered < killTimes.length) {
    const nextKillTime = killTimes[raid.aaKillsTriggered];
    // Pick/keep focus target during focus-fire lead window
    if (raid.elapsedSec >= nextKillTime - cfg.aaFocusFireLeadSec) {
      let focused = raid.aircraft.find(
        (p) => p.id === raid.activeAaTargetId && (p.state === 'approaching' || p.state === 'egress'),
      );
      if (!focused) {
        focused = selectNextAaTarget(raid.aircraft, rng) ?? undefined;
        raid.activeAaTargetId = focused ? focused.id : null;
      }
    }
    if (raid.elapsedSec >= nextKillTime) {
      let victim = raid.aircraft.find(
        (p) => p.id === raid.activeAaTargetId && (p.state === 'approaching' || p.state === 'egress'),
      );
      if (!victim) {
        victim = selectNextAaTarget(raid.aircraft, rng) ?? undefined;
      }
      // Enforce strict priority invariant even if activeAaTargetId pointed elsewhere
      if (victim && victim.role !== 'area') {
        const stillArea = raid.aircraft.some(
          (p) => p.role === 'area' && (p.state === 'approaching' || p.state === 'egress'),
        );
        if (stillArea) {
          victim = selectNextAaTarget(raid.aircraft, rng) ?? undefined;
        }
      }
      if (victim) {
        initiateAircraftCrash(victim, cfg, params.worldLimit, params.heightAt);
        events.shotDownAircraft.push(victim);
      }
      raid.aaKillsTriggered++;
      raid.activeAaTargetId = null;
    }
  } else {
    raid.activeAaTargetId = null;
  }

  const dropRadSq = cfg.dropTriggerDistanceM * cfg.dropTriggerDistanceM;
  const predLockDist = Math.max(25, cfg.predictiveLockFreezeSec * cfg.predictiveAircraftSpeedMps);

  for (let i = 0; i < raid.aircraft.length; i++) {
    const p = raid.aircraft[i];
    p.aaUnderFire = raid.activeAaTargetId === p.id && (p.state === 'approaching' || p.state === 'egress');

    if (p.state === 'crashed') continue;

    if (p.state === 'crashing') {
      p.x += p.crashVx * dt;
      p.z += p.crashVz * dt;
      p.y += p.crashVy * dt;
      p.crashVy -= cfg.crashGravityMps2 * dt;
      p.pitch = Math.min(0.65, p.pitch + dt * 0.45);
      p.roll += p.crashRollRate * dt;

      const groundAtCrash = params.heightAt(p.x, p.z);
      if (p.y <= groundAtCrash) {
        p.y = groundAtCrash;
        p.state = 'crashed';
        const hitPlayer =
          params.playerAlive &&
          isTankCaughtInBomb(
            params.playerX,
            params.playerZ,
            p.x,
            p.z,
            cfg.crashBombRadiusM,
            cfg.tankHitMarginM,
          );
        events.crashExplosions.push({
          aircraftId: p.id,
          role: p.role,
          x: p.x,
          groundY: groundAtCrash,
          z: p.z,
          radius: cfg.crashBombRadiusM,
          damage: cfg.crashBombDamage,
          hitPlayer,
        });
      }
      continue;
    }

    if (p.state === 'egress') {
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      p.pitch = 0;
      p.roll *= Math.max(0, 1 - dt * 3.5);
      p.egressRemainM -= p.speed * dt;
      if (p.egressRemainM <= 0) {
        if (p.rearmTimerSec > 0) {
          p.rearmTimerSec -= dt;
        } else {
          // Begin next bombing pass
          p.state = 'approaching';
          p.bombReleasedOnPass = false;
          p.targetLocked = false;
          if (p.role === 'exact') {
            p.targetX = params.playerX;
            p.targetZ = params.playerZ;
          } else if (p.role === 'predictive') {
            const jitAng = rng() * Math.PI * 2;
            const jitMag = rng() * cfg.predictiveToleranceM;
            p.predictiveJitterX = Math.cos(jitAng) * jitMag;
            p.predictiveJitterZ = Math.sin(jitAng) * jitMag;
            const pt = computePredictivePoint(
              params.playerX,
              params.playerZ,
              params.playerHeading,
              params.playerSpeed,
              p.predictiveJitterX,
              p.predictiveJitterZ,
              params.worldLimit,
              cfg,
            );
            p.targetX = pt.x;
            p.targetZ = pt.z;
          } else {
            const pt = pickRandomAreaPoint(params.worldLimit, cfg, rng, params.isSpotOpen);
            p.targetX = pt.x;
            p.targetZ = pt.z;
          }
        }
      }
      continue;
    }

    // State === 'approaching'
    const distToTarget = Math.hypot(p.targetX - p.x, p.targetZ - p.z);
    if (p.role === 'exact') {
      if (!p.targetLocked) {
        if (distToTarget <= cfg.exactCommitDistanceM) {
          p.targetLocked = true;
        } else {
          p.targetX = params.playerX;
          p.targetZ = params.playerZ;
        }
      }
    } else if (p.role === 'predictive') {
      if (!p.targetLocked) {
        if (distToTarget <= predLockDist) {
          p.targetLocked = true;
        } else {
          const pt = computePredictivePoint(
            params.playerX,
            params.playerZ,
            params.playerHeading,
            params.playerSpeed,
            p.predictiveJitterX,
            p.predictiveJitterZ,
            params.worldLimit,
            cfg,
          );
          p.targetX = pt.x;
          p.targetZ = pt.z;
        }
      }
    }

    const desiredHeading = Math.atan2(p.targetX - p.x, p.targetZ - p.z);
    const deltaHeading = wrapAngle(desiredHeading - p.heading);
    const maxTurn = cfg.turnRateRadPerSec * dt;
    const actualTurn = clamp(deltaHeading, -maxTurn, maxTurn);
    p.heading = wrapAngle(p.heading + actualTurn);
    const targetRoll = clamp(-deltaHeading * 0.45, -0.42, 0.42);
    p.roll += (targetRoll - p.roll) * Math.min(1, dt * 5);
    p.pitch = 0;

    const prevX = p.x;
    const prevZ = p.z;
    p.x += Math.sin(p.heading) * p.speed * dt;
    p.z += Math.cos(p.heading) * p.speed * dt;
    p.y = p.altitude;

    // Bomb only drops once the aircraft physically reaches the calculated drop coordinates!
    const seg = segmentToPointDistSq(prevX, prevZ, p.x, p.z, p.targetX, p.targetZ);
    if (!p.bombReleasedOnPass && seg.distSq <= dropRadSq) {
      p.bombReleasedOnPass = true;
      const dropX = seg.cx;
      const dropZ = seg.cz;
      const groundY = params.heightAt(dropX, dropZ);
      const radius =
        p.role === 'exact'
          ? cfg.normalBombRadiusM
          : cfg.normalBombMinRadiusM + rng() * Math.max(0, cfg.normalBombRadiusM - cfg.normalBombMinRadiusM);
      const bomb = createBombStrike(
        raid.nextBombId++,
        dropX,
        groundY,
        dropZ,
        'bomb',
        rng,
        {
          radius: Math.min(cfg.normalBombRadiusM, radius),
          damage: cfg.normalBombDamage,
          fuseTotal: cfg.normalBombFallTimeSec,
          startHeight: Math.max(20, p.y - groundY),
        },
        cfg,
      );
      strikes.push(bomb);
      events.droppedBombs.push(bomb);

      p.state = 'egress';
      p.egressRemainM = cfg.egressDistanceM + rng() * 45;
      p.rearmTimerSec = cfg.rearmCooldownSec;
    }
  }

  return events;
}

export function getBombardmentIntervalSec(elapsedSec: number, totalSec = BOMBARDMENT_DURATION_SEC): number {
  const progress = clamp01(elapsedSec / Math.max(1, totalSec));
  return 1.35 - progress * 0.73;
}

export function getMaxConcurrentBombs(elapsedSec: number, totalSec = BOMBARDMENT_DURATION_SEC): number {
  const progress = clamp01(elapsedSec / Math.max(1, totalSec));
  if (progress < 0.25) return 4;
  if (progress < 0.6) return 6;
  return 8;
}

export function pickStrikeCandidate(cfg: BombardmentWaveConfig): { x: number; z: number; kind: BombStrikeKind } | null {
  const rng = cfg.rng ?? Math.random;
  const progress = clamp01(cfg.elapsedSec / Math.max(1, cfg.totalSec ?? BOMBARDMENT_DURATION_SEC));
  const limit = Math.max(40, cfg.worldLimit - 24);
  const fwdX = Math.sin(cfg.playerHeading);
  const fwdZ = Math.cos(cfg.playerHeading);
  const stillSec = cfg.stillSec ?? 0;
  const isSlowOrStopped = Math.abs(cfg.playerSpeed) < 1.8;
  const alreadyThreatened = hasThreateningBombAt(cfg.playerX, cfg.playerZ, cfg.existingStrikes, -0.5);

  if (!alreadyThreatened && (stillSec >= 1.5 || (isSlowOrStopped && rng() < 0.55))) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const ang = rng() * Math.PI * 2;
      const jit = attempt === 0 ? 1.2 + rng() * 2.0 : rng() * 3.8;
      const x = Math.max(-limit, Math.min(limit, cfg.playerX + Math.cos(ang) * jit));
      const z = Math.max(-limit, Math.min(limit, cfg.playerZ + Math.sin(ang) * jit));
      if (attempt < 5 && cfg.isSpotOpen && !cfg.isSpotOpen(x, z)) continue;
      let overlapsExact = false;
      for (let i = 0; i < cfg.existingStrikes.length; i++) {
        const s = cfg.existingStrikes[i];
        if (Math.hypot(x - s.x, z - s.z) < 4.5) {
          overlapsExact = true;
          break;
        }
      }
      if (overlapsExact) continue;
      return { x, z, kind: rng() < 0.72 ? 'bomb' : 'rocket' };
    }
    return {
      x: Math.max(-limit, Math.min(limit, cfg.playerX)),
      z: Math.max(-limit, Math.min(limit, cfg.playerZ)),
      kind: 'bomb',
    };
  }

  for (let attempt = 0; attempt < 24; attempt++) {
    const nearRoll = rng();
    let x: number;
    let z: number;
    if (nearRoll < 0.36) {
      const spd = Math.abs(cfg.playerSpeed);
      const lead = spd < 2.2 ? (rng() - 0.15) * 14 : Math.min(34, Math.max(6, spd * 1.25 + 6 + rng() * 16));
      const side = (rng() - 0.5) * 24;
      x = cfg.playerX + fwdX * lead + fwdZ * side;
      z = cfg.playerZ + fwdZ * lead - fwdX * side;
    } else if (nearRoll < 0.8) {
      const ang = rng() * Math.PI * 2;
      const dist = 4 + rng() * (60 - progress * 12);
      x = cfg.playerX + Math.cos(ang) * dist;
      z = cfg.playerZ + Math.sin(ang) * dist;
    } else {
      const ang = rng() * Math.PI * 2;
      const dist = 42 + rng() * 112;
      x = cfg.playerX + Math.cos(ang) * dist;
      z = cfg.playerZ + Math.sin(ang) * dist;
    }

    x = Math.max(-limit, Math.min(limit, x));
    z = Math.max(-limit, Math.min(limit, z));

    if (cfg.isSpotOpen && !cfg.isSpotOpen(x, z)) continue;

    let overlapsTooClose = false;
    for (let i = 0; i < cfg.existingStrikes.length; i++) {
      const s = cfg.existingStrikes[i];
      if (Math.hypot(x - s.x, z - s.z) < Math.max(8.5, s.radius * 0.95)) {
        overlapsTooClose = true;
        break;
      }
    }
    if (overlapsTooClose) continue;

    const rocketChance = 0.25 + progress * 0.22;
    const kind: BombStrikeKind = rng() < rocketChance ? 'rocket' : 'bomb';
    return { x, z, kind };
  }
  return null;
}

export function stepBombStrikes(
  strikes: BombStrike[],
  dt: number,
  tankX: number,
  tankZ: number,
  tankAlive: boolean,
): BombDetonationEvent[] {
  const detonations: BombDetonationEvent[] = [];
  for (let i = strikes.length - 1; i >= 0; i--) {
    const s = strikes[i];
    s.fuseRemaining -= dt;
    if (s.fuseRemaining <= 0) {
      strikes.splice(i, 1);
      const hitPlayer = tankAlive && isTankCaughtInBomb(tankX, tankZ, s.x, s.z, s.radius);
      detonations.push({ strike: s, hitPlayer, damage: s.damage });
    }
  }
  return detonations;
}
