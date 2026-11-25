export const LONDON_MAP_ID = 'london';
export const BOMBARDMENT_MODE_ID = 'bombardment';
export const BOMBARDMENT_DURATION_SEC = 300;
export const BOMBARDMENT_REWARD_SILVER = 1000;
export const MAX_BOMB_DIAMETER_M = 20;
export const MAX_BOMB_RADIUS_M = MAX_BOMB_DIAMETER_M * 0.5;
export const TANK_HIT_MARGIN_M = 1.6;

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
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

export type BombStrikeKind = 'bomb' | 'rocket';

export interface BombStrike {
  id: number;
  kind: BombStrikeKind;
  x: number;
  groundY: number;
  z: number;
  radius: number;
  fuseTotal: number;
  fuseRemaining: number;
  startHeight: number;
  whistlePlayed: boolean;
}

export interface BombDetonationEvent {
  strike: BombStrike;
  hitPlayer: boolean;
}

export interface BombardmentWaveConfig {
  elapsedSec: number;
  totalSec?: number;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  playerSpeed: number;
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

export function createBombStrike(
  id: number,
  x: number,
  groundY: number,
  z: number,
  kind: BombStrikeKind,
  rng: () => number = Math.random,
): BombStrike {
  const isBomb = kind === 'bomb';
  // Bombs up to 20m diameter (radius 7.5..10.0m); rockets 10..13.5m diameter (radius 5.0..6.75m)
  const rawRadius = isBomb ? 7.5 + rng() * 2.5 : 5.0 + rng() * 1.75;
  const radius = Math.min(MAX_BOMB_RADIUS_M, Math.max(4.5, rawRadius));
  const fuseTotal = isBomb ? 2.35 + rng() * 0.75 : 1.65 + rng() * 0.55;
  const startHeight = isBomb ? 145 + rng() * 35 : 120 + rng() * 30;
  return {
    id,
    kind,
    x,
    groundY,
    z,
    radius,
    fuseTotal,
    fuseRemaining: fuseTotal,
    startHeight,
    whistlePlayed: false,
  };
}

export function getBombardmentIntervalSec(elapsedSec: number, totalSec = BOMBARDMENT_DURATION_SEC): number {
  const progress = clamp01(elapsedSec / Math.max(1, totalSec));
  // Starts measured (1.35s) and tightens to intense finale (0.62s)
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

  for (let attempt = 0; attempt < 24; attempt++) {
    const nearRoll = rng();
    let x: number;
    let z: number;
    if (nearRoll < 0.34) {
      // Predictive strike slightly ahead along tank travel vector (leave dodge space!)
      const lead = Math.min(34, Math.max(12, Math.abs(cfg.playerSpeed) * 1.35 + 14 + rng() * 18));
      const side = (rng() - 0.5) * 28;
      x = cfg.playerX + fwdX * lead + fwdZ * side;
      z = cfg.playerZ + fwdZ * lead - fwdX * side;
    } else if (nearRoll < 0.78) {
      // Tactical zone around player (14m .. 78m)
      const ang = rng() * Math.PI * 2;
      const dist = 14 + rng() * (64 - progress * 12);
      x = cfg.playerX + Math.cos(ang) * dist;
      z = cfg.playerZ + Math.sin(ang) * dist;
    } else {
      // Ambient city-wide bombing (within ~165m so visible in combat area)
      const ang = rng() * Math.PI * 2;
      const dist = 48 + rng() * 115;
      x = cfg.playerX + Math.cos(ang) * dist;
      z = cfg.playerZ + Math.sin(ang) * dist;
    }

    x = Math.max(-limit, Math.min(limit, x));
    z = Math.max(-limit, Math.min(limit, z));

    if (cfg.isSpotOpen && !cfg.isSpotOpen(x, z)) continue;

    // Prevent cluttering exact same spot so escape lanes remain readable
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
      detonations.push({ strike: s, hitPlayer });
    }
  }
  return detonations;
}
