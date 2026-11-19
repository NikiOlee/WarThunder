const SKILL_STORAGE_KEY = 'ironsky.playerSkill.v1';

export interface PlayerSkillStats {
  shots: number;
  hits: number;
  pens: number;
  kills: number;
  deaths: number;
  damageDealt: number;
}

const DEFAULT_STATS: PlayerSkillStats = {
  shots: 0,
  hits: 0,
  pens: 0,
  kills: 0,
  deaths: 0,
  damageDealt: 0,
};

let memoryStats: PlayerSkillStats | null = null;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function readStatsFromStorage(): PlayerSkillStats {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SKILL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PlayerSkillStats>;
        return {
          shots: Math.max(0, Number(parsed.shots) || 0),
          hits: Math.max(0, Number(parsed.hits) || 0),
          pens: Math.max(0, Number(parsed.pens) || 0),
          kills: Math.max(0, Number(parsed.kills) || 0),
          deaths: Math.max(0, Number(parsed.deaths) || 0),
          damageDealt: Math.max(0, Number(parsed.damageDealt) || 0),
        };
      }
    }
  } catch {
    // ignore storage failures
  }
  return { ...DEFAULT_STATS };
}

function saveStats(stats: PlayerSkillStats): void {
  memoryStats = { ...stats };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SKILL_STORAGE_KEY, JSON.stringify(memoryStats));
    }
  } catch {
    // ignore storage failures
  }
}

export function getPlayerSkillStats(): PlayerSkillStats {
  if (!memoryStats) {
    memoryStats = readStatsFromStorage();
  }
  return { ...memoryStats };
}

export function resetPlayerSkillStats(): PlayerSkillStats {
  const fresh = { ...DEFAULT_STATS };
  saveStats(fresh);
  return fresh;
}

export function recordPlayerShot(): void {
  const s = getPlayerSkillStats();
  s.shots += 1;
  saveStats(s);
}

export function recordPlayerHit(penetrated: boolean, damage: number): void {
  const s = getPlayerSkillStats();
  s.hits += 1;
  if (penetrated) s.pens += 1;
  if (damage > 0) s.damageDealt += Math.round(damage);
  saveStats(s);
}

export function recordPlayerKill(): void {
  const s = getPlayerSkillStats();
  s.kills += 1;
  saveStats(s);
}

export function recordPlayerDeath(): void {
  const s = getPlayerSkillStats();
  s.deaths += 1;
  saveStats(s);
}

/**
 * Computes an adaptive player skill multiplier in [0.75, 1.45].
 * Starts near 1.0 and smoothly adjusts based on accuracy, penetration rate, K/D, and damage.
 */
export function computePlayerSkillRating(stats: PlayerSkillStats): number {
  const accuracy = stats.hits / Math.max(8, stats.shots);
  const penRate = stats.pens / Math.max(4, stats.hits);
  const kd = (stats.kills + 2) / (stats.deaths + 2);
  const dmgPerLife = stats.damageDealt / Math.max(1, stats.deaths + 1);

  const accScore = clamp((accuracy - 0.35) * 0.7, -0.2, 0.25);
  const penScore = clamp((penRate - 0.45) * 0.4, -0.1, 0.2);
  const kdScore = clamp((kd - 1.0) * 0.22, -0.22, 0.32);
  const dmgScore = clamp((dmgPerLife - 140) / 700, -0.08, 0.18);

  const sampleConfidence = clamp((stats.shots + stats.kills * 3 + stats.deaths * 2) / 24, 0, 1);
  const rawRating = 1.0 + (accScore + penScore + kdScore + dmgScore) * sampleConfidence;
  return clamp(Number(rawRating.toFixed(3)), 0.75, 1.45);
}

export function getPlayerSkillRating(): number {
  return computePlayerSkillRating(getPlayerSkillStats());
}

/**
 * Resolves effective bot combat skill:
 * - In Training (allowBotAccuracy=true), respects user's configured botSkill slider.
 * - In competitive modes, scales dynamically to playerSkillRating, while keeping
 *   a confident floor (>= 1.05) for bot-vs-bot engagements so fights stay decisive.
 */
export function resolveBotSkillMultiplier(params: {
  configuredSkill: number;
  allowBotAccuracy: boolean;
  playerSkillRating: number;
  targetIsPlayer: boolean;
}): number {
  if (params.allowBotAccuracy) {
    return clamp(params.configuredSkill, 0.4, 2.0);
  }
  const adapted = clamp(params.playerSkillRating, 0.75, 1.45);
  return params.targetIsPlayer ? adapted : Math.max(1.05, adapted);
}
