export const CHEAT_COMMANDS = new Set<string>([
  'god',
  'heal',
  'kill',
  'spawn',
  'removebots',
  'hit',
  'tp',
  'reload',
  'ai',
  'timescale',
]);

export interface CheatRuntimeState {
  svCheats: boolean;
  god: boolean;
  ai: boolean;
  timeScale: number;
}

export function isCheatCommand(cmd: string): boolean {
  return CHEAT_COMMANDS.has(cmd.trim().toLowerCase());
}

export function enforceCheatsOff(state: CheatRuntimeState): void {
  state.svCheats = false;
  state.god = false;
  state.ai = true;
  state.timeScale = 1;
}

export interface SvCheatsResult {
  svCheats: boolean;
  ok: boolean;
  message: string;
}

export function setSvCheats(state: CheatRuntimeState, arg: string | undefined, allowCheats: boolean): SvCheatsResult {
  if (arg === undefined) {
    if (!allowCheats) enforceCheatsOff(state);
    return {
      svCheats: state.svCheats,
      ok: true,
      message: `sv_cheats = ${state.svCheats ? 'on (1)' : 'off (0)'}`,
    };
  }

  const norm = arg.trim().toLowerCase();
  const isOn = ['on', '1', 'true', 'вкл'].includes(norm);
  const isOff = ['off', '0', 'false', 'выкл'].includes(norm);

  if (!isOn && !isOff) {
    return {
      svCheats: state.svCheats,
      ok: false,
      message: 'Использование: sv_cheats <on|off|1|0>',
    };
  }

  if (!allowCheats) {
    enforceCheatsOff(state);
    if (isOn) {
      return {
        svCheats: false,
        ok: false,
        message: 'sv_cheats отключён (off): читы можно включить только в режиме «Тренировка».',
      };
    }
    return {
      svCheats: false,
      ok: true,
      message: 'sv_cheats = off (0). Все читы отключены.',
    };
  }

  if (isOn) {
    state.svCheats = true;
    return {
      svCheats: true,
      ok: true,
      message: 'sv_cheats = on (1). Читерские команды разблокированы.',
    };
  }

  enforceCheatsOff(state);
  return {
    svCheats: false,
    ok: true,
    message: 'sv_cheats = off (0). Все читерские команды и эффекты отключены.',
  };
}

export interface CommandAccessResult {
  allowed: boolean;
  reason?: 'mode_locked' | 'cheats_off';
}

export function canRunConsoleCommand(cmd: string, svCheats: boolean, allowCheats: boolean): CommandAccessResult {
  if (!isCheatCommand(cmd)) return { allowed: true };
  if (!allowCheats) return { allowed: false, reason: 'mode_locked' };
  if (!svCheats) return { allowed: false, reason: 'cheats_off' };
  return { allowed: true };
}
