export type GameModeId = 'tdm100' | 'rounds5v5' | 'training' | 'juggernaut' | 'dead' | (string & {});

export interface GameModeDef {
  id: GameModeId;
  name: string;
  shortDesc: string;
  teamSize: number;
  /** Необязательное явное количество врагов (если отличается от teamSize, например 1 против 5). */
  enemyCount?: number;
  targetKills: number;
  roundsToWin: number;
  /** Длительность режима выживания в секундах (если задана, победа по истечении таймера). */
  survivalSeconds?: number;
  /** Задержка возрождения вражеских ботов в секундах (по умолчанию 14). */
  botRespawnSeconds?: number;
  /** Вражеские боты появляются на случайных танках из каталога. */
  randomEnemyTanks?: boolean;
  /** Боты непрерывно преследуют игрока по всей карте. */
  huntPlayer?: boolean;
  /** Записывать ли завершённые бои этого режима в «Историю боёв». */
  recordHistory?: boolean;
  respawns: boolean;
  spectatorOnDeath: boolean;
  allowConsole: boolean;
  allowCheats: boolean;
  allowBotAccuracy: boolean;
  silverRewards: boolean;
  victoryRewardSilver: number;
  /** Босс-режим: вместо вражеской команды один ИИ-босс (Маус) в центре карты. */
  boss?: boolean;
}

export const DEFAULT_MODE_ID: GameModeId = 'tdm100';

export const GAME_MODES: Record<string, GameModeDef> = {
  tdm100: {
    id: 'tdm100',
    name: 'Бой до 100 киллов',
    shortDesc: '4 на 4 с возрождениями до 100 уничтожений. +500 серебра за победу. Консоль без читов (sv_cheats off), точность ботов фиксирована.',
    teamSize: 4,
    targetKills: 100,
    roundsToWin: 0,
    respawns: true,
    spectatorOnDeath: false,
    allowConsole: true,
    allowCheats: false,
    allowBotAccuracy: false,
    silverRewards: true,
    victoryRewardSilver: 500,
    recordHistory: true,
  },
  rounds5v5: {
    id: 'rounds5v5',
    name: '5 на 5 (Раунды)',
    shortDesc: 'Командный бой 5 на 5 по раундам (до 3 побед) без возрождений. После гибели — режим наблюдателя. +500 серебра за победу.',
    teamSize: 5,
    targetKills: 0,
    roundsToWin: 3,
    respawns: false,
    spectatorOnDeath: true,
    allowConsole: true,
    allowCheats: false,
    allowBotAccuracy: false,
    silverRewards: true,
    victoryRewardSilver: 500,
    recordHistory: true,
  },
  training: {
    id: 'training',
    name: 'Тренировка',
    shortDesc: 'Свободный тренировочный полигон 4 на 4. Разрешены читы (sv_cheats on) и настройка точности ботов в Настройках.',
    teamSize: 4,
    targetKills: 0,
    roundsToWin: 0,
    respawns: true,
    spectatorOnDeath: false,
    allowConsole: true,
    allowCheats: true,
    allowBotAccuracy: true,
    silverRewards: false,
    victoryRewardSilver: 0,
    recordHistory: false,
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'Джагернаут',
    shortDesc:
      'Охотники (вы + 5 союзных ботов) против сверхтяжёлого босса Pz.Kpfw. VIII «Маус» (4000 ХП) в центре карты. Смертельное 128-мм орудие, таран и огнемёт на 20 м с перегревом. +1500 серебра за победу.',
    teamSize: 6,
    targetKills: 0,
    roundsToWin: 0,
    respawns: true,
    spectatorOnDeath: false,
    allowConsole: true,
    allowCheats: false,
    allowBotAccuracy: false,
    silverRewards: false,
    victoryRewardSilver: 1500,
    boss: true,
    recordHistory: true,
  },
  dead: {
    id: 'dead',
    name: 'Мертвецы',
    shortDesc:
      'Выживание 5:00 в одиночку против 5 преследующих ботов на случайных танках. Без возрождения игрока, респаун врагов каждые 4 с. Награда: 1500 серебра.',
    teamSize: 1,
    enemyCount: 5,
    targetKills: 0,
    roundsToWin: 0,
    survivalSeconds: 300,
    botRespawnSeconds: 4,
    randomEnemyTanks: true,
    huntPlayer: true,
    respawns: false,
    spectatorOnDeath: false,
    allowConsole: true,
    allowCheats: false,
    allowBotAccuracy: false,
    silverRewards: true,
    victoryRewardSilver: 1500,
    recordHistory: true,
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

export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function evaluateSurvivalState(
  mode: GameModeDef,
  remainingSeconds: number,
  playerAlive: boolean,
): MatchEvaluation {
  if (!mode.survivalSeconds || mode.survivalSeconds <= 0) {
    return {
      finished: false,
      winner: null,
      victorySilver: 0,
    };
  }
  if (!playerAlive) {
    return {
      finished: true,
      winner: 'B',
      victorySilver: 0,
    };
  }
  if (remainingSeconds <= 0) {
    return {
      finished: true,
      winner: 'A',
      victorySilver: mode.victoryRewardSilver,
    };
  }
  return {
    finished: false,
    winner: null,
    victorySilver: 0,
  };
}

export function evaluateMatchState(
  mode: GameModeDef,
  teamAKills: number,
  teamBKills: number,
): MatchEvaluation {
  if (mode.targetKills <= 0) {
    return {
      finished: false,
      winner: null,
      victorySilver: 0,
    };
  }
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

export interface RoundEvaluation {
  roundEnded: boolean;
  roundWinner: 'A' | 'B' | null;
  teamARounds: number;
  teamBRounds: number;
  matchFinished: boolean;
  matchWinner: 'A' | 'B' | null;
  victorySilver: number;
}

export function evaluateRoundState(
  aliveA: number,
  aliveB: number,
  teamARounds: number,
  teamBRounds: number,
  roundsToWin: number,
  victoryRewardSilver = 500,
): RoundEvaluation {
  if (aliveA > 0 && aliveB > 0) {
    return {
      roundEnded: false,
      roundWinner: null,
      teamARounds,
      teamBRounds,
      matchFinished: false,
      matchWinner: null,
      victorySilver: 0,
    };
  }

  const roundWinner: 'A' | 'B' = aliveB <= 0 && aliveA > 0 ? 'A' : aliveA <= 0 && aliveB > 0 ? 'B' : 'B';
  const nextA = teamARounds + (roundWinner === 'A' ? 1 : 0);
  const nextB = teamBRounds + (roundWinner === 'B' ? 1 : 0);

  if (nextA >= roundsToWin) {
    return {
      roundEnded: true,
      roundWinner,
      teamARounds: nextA,
      teamBRounds: nextB,
      matchFinished: true,
      matchWinner: 'A',
      victorySilver: victoryRewardSilver,
    };
  }
  if (nextB >= roundsToWin) {
    return {
      roundEnded: true,
      roundWinner,
      teamARounds: nextA,
      teamBRounds: nextB,
      matchFinished: true,
      matchWinner: 'B',
      victorySilver: 0,
    };
  }

  return {
    roundEnded: true,
    roundWinner,
    teamARounds: nextA,
    teamBRounds: nextB,
    matchFinished: false,
    matchWinner: null,
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
