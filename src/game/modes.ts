export type GameModeId = 'tdm100' | (string & {});

export interface GameModeDef {
  id: GameModeId;
  name: string;
  shortDesc: string;
  targetKills: number;
  victoryRewardSilver: number;
}

export const DEFAULT_MODE_ID: GameModeId = 'tdm100';

export const GAME_MODES: Record<string, GameModeDef> = {
  tdm100: {
    id: 'tdm100',
    name: 'Бой до 100 киллов',
    shortDesc: 'Командный бой до 100 уничтожений. За победу в раунде начисляется +500 серебра.',
    targetKills: 100,
    victoryRewardSilver: 500,
  },
};

export function getAllModes(): GameModeDef[] {
  return Object.values(GAME_MODES);
}

export function getModeDef(id?: string | null): GameModeDef {
  if (id && GAME_MODES[id]) return GAME_MODES[id];
  return GAME_MODES[DEFAULT_MODE_ID];
}

export interface MatchEvaluation {
  finished: boolean;
  winner: 'A' | 'B' | null;
  victorySilver: number;
}

export function evaluateMatchState(
  mode: GameModeDef,
  teamAKills: number,
  teamBKills: number,
): MatchEvaluation {
  if (teamAKills >= mode.targetKills) {
    return {
      finished: true,
      winner: 'A',
      victorySilver: mode.victoryRewardSilver,
    };
  }
  if (teamBKills >= mode.targetKills) {
    return {
      finished: true,
      winner: 'B',
      victorySilver: 0,
    };
  }
  return {
    finished: false,
    winner: null,
    victorySilver: 0,
  };
}

export interface ScoreboardRow {
  name: string;
  team: 'A' | 'B';
  tankName: string;
  kills: number;
  deaths: number;
  isPlayer: boolean;
  alive: boolean;
}

export function sortScoreboardRows(rows: ScoreboardRow[]): ScoreboardRow[] {
  return [...rows].sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    if (a.deaths !== b.deaths) return a.deaths - b.deaths;
    if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru');
  });
}
