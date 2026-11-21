export const MATCH_HISTORY_STORAGE_KEY = 'ironsky.matchHistory.v1';
export const MAX_MATCH_HISTORY = 20;

export interface MatchHistoryEntry {
  id: string;
  timestamp: number;
  modeId: string;
  modeName: string;
  mapId?: string;
  mapName?: string;
  won: boolean;
  tankId: string;
  tankName: string;
  scoreText: string;
  playerKills: number;
  playerDeaths: number;
  silverEarned: number;
}

export interface RecordMatchInput {
  id?: string;
  timestamp?: number;
  modeId: string;
  modeName: string;
  mapId?: string;
  mapName?: string;
  won: boolean;
  tankId: string;
  tankName: string;
  scoreText: string;
  playerKills: number;
  playerDeaths: number;
  silverEarned: number;
}

export interface MatchHistorySummary {
  total: number;
  wins: number;
  losses: number;
  winRatePct: number;
  totalSilver: number;
}

let memoryHistory: MatchHistoryEntry[] | null = null;
let seqCounter = 1;

function canUseStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  } catch {
    return false;
  }
}

function sanitizeEntry(raw: unknown): MatchHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.modeName !== 'string' || typeof r.tankName !== 'string' || typeof r.scoreText !== 'string') {
    return null;
  }
  const timestamp = typeof r.timestamp === 'number' && Number.isFinite(r.timestamp) ? r.timestamp : Date.now();
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `m_${timestamp}_${seqCounter++}`,
    timestamp,
    modeId: typeof r.modeId === 'string' ? r.modeId : 'tdm100',
    modeName: r.modeName,
    mapId: typeof r.mapId === 'string' ? r.mapId : undefined,
    mapName: typeof r.mapName === 'string' ? r.mapName : undefined,
    won: Boolean(r.won),
    tankId: typeof r.tankId === 'string' ? r.tankId : 't55',
    tankName: r.tankName,
    scoreText: r.scoreText,
    playerKills: typeof r.playerKills === 'number' && Number.isFinite(r.playerKills) ? Math.max(0, Math.floor(r.playerKills)) : 0,
    playerDeaths: typeof r.playerDeaths === 'number' && Number.isFinite(r.playerDeaths) ? Math.max(0, Math.floor(r.playerDeaths)) : 0,
    silverEarned: typeof r.silverEarned === 'number' && Number.isFinite(r.silverEarned) ? Math.max(0, Math.floor(r.silverEarned)) : 0,
  };
}

function writeHistory(entries: MatchHistoryEntry[]): void {
  const trimmed = entries.slice(0, MAX_MATCH_HISTORY);
  memoryHistory = trimmed;
  if (canUseStorage()) {
    try {
      localStorage.setItem(MATCH_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore storage quota errors
    }
  }
}

export function getMatchHistory(): MatchHistoryEntry[] {
  if (canUseStorage()) {
    try {
      const raw = localStorage.getItem(MATCH_HISTORY_STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const clean = parsed
            .map(sanitizeEntry)
            .filter((item): item is MatchHistoryEntry => item !== null)
            .slice(0, MAX_MATCH_HISTORY);
          memoryHistory = clean;
          return clean.slice();
        }
      }
      if (memoryHistory === null) {
        memoryHistory = [];
      }
      return memoryHistory.slice();
    } catch {
      // fall back to in-memory list
    }
  }
  if (memoryHistory === null) {
    memoryHistory = [];
  }
  return memoryHistory.slice();
}

export function recordMatchHistory(input: RecordMatchInput): MatchHistoryEntry[] {
  const current = getMatchHistory();
  const ts = typeof input.timestamp === 'number' && Number.isFinite(input.timestamp) ? input.timestamp : Date.now();
  const entry: MatchHistoryEntry = {
    id: input.id && input.id.trim() ? input.id : `match_${ts}_${seqCounter++}`,
    timestamp: ts,
    modeId: input.modeId,
    modeName: input.modeName,
    mapId: input.mapId,
    mapName: input.mapName,
    won: input.won,
    tankId: input.tankId,
    tankName: input.tankName,
    scoreText: input.scoreText,
    playerKills: Math.max(0, Math.floor(input.playerKills)),
    playerDeaths: Math.max(0, Math.floor(input.playerDeaths)),
    silverEarned: Math.max(0, Math.floor(input.silverEarned)),
  };
  const next = [entry, ...current].slice(0, MAX_MATCH_HISTORY);
  writeHistory(next);
  return next.slice();
}

export function clearMatchHistory(): MatchHistoryEntry[] {
  memoryHistory = [];
  if (canUseStorage()) {
    try {
      localStorage.removeItem(MATCH_HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return [];
}

export function summarizeMatchHistory(entries: MatchHistoryEntry[]): MatchHistorySummary {
  const total = entries.length;
  let wins = 0;
  let totalSilver = 0;
  for (const e of entries) {
    if (e.won) wins++;
    totalSilver += Math.max(0, Math.floor(e.silverEarned));
  }
  const losses = total - wins;
  const winRatePct = total > 0 ? Math.round((wins / total) * 100) : 0;
  return {
    total,
    wins,
    losses,
    winRatePct,
    totalSilver,
  };
}

export function formatMatchTimestamp(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
