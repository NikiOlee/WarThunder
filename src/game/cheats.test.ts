import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRunConsoleCommand,
  enforceCheatsOff,
  isCheatCommand,
  setSvCheats,
  type CheatRuntimeState,
} from './cheats';
import { getModeDef } from './modes';

test('Settings commands stay allowed everywhere while cheat commands require sv_cheats on', () => {
  assert.equal(isCheatCommand('fov'), false);
  assert.equal(isCheatCommand('sens'), false);
  assert.equal(isCheatCommand('vol'), false);
  assert.equal(isCheatCommand('shadows'), false);
  assert.equal(isCheatCommand('god'), true);
  assert.equal(isCheatCommand('kill'), true);
  assert.equal(isCheatCommand('spawn'), true);
  assert.equal(isCheatCommand('tp'), true);
  assert.equal(isCheatCommand('timescale'), true);

  // Non-training modes allow console settings but lock sv_cheats and cheat commands
  const tdm = getModeDef('tdm100');
  const r5 = getModeDef('rounds5v5');
  const tr = getModeDef('training');
  assert.equal(tdm.allowConsole, true);
  assert.equal(r5.allowConsole, true);
  assert.equal(tr.allowConsole, true);
  assert.equal(tdm.allowCheats, false);
  assert.equal(r5.allowCheats, false);
  assert.equal(tr.allowCheats, true);

  // Settings work even when sv_cheats is off
  assert.equal(canRunConsoleCommand('fov', false, false).allowed, true);
  assert.equal(canRunConsoleCommand('shadows', false, false).allowed, true);

  // Cheats blocked when sv_cheats is off (even in training)
  const trOff = canRunConsoleCommand('god', false, true);
  assert.equal(trOff.allowed, false);
  assert.equal(trOff.reason, 'cheats_off');

  // Cheats blocked in tdm/5v5 with mode_locked
  const tdmBlocked = canRunConsoleCommand('god', true, false);
  assert.equal(tdmBlocked.allowed, false);
  assert.equal(tdmBlocked.reason, 'mode_locked');

  // Cheats allowed in training once sv_cheats is on
  assert.equal(canRunConsoleCommand('god', true, true).allowed, true);
});

test('sv_cheats cannot be enabled outside Training and turning it off resets all cheat flags', () => {
  const state: CheatRuntimeState = {
    svCheats: false,
    god: true,
    ai: false,
    timeScale: 2.5,
  };

  // Trying sv_cheats on in non-training forces off and resets active cheats
  const denied = setSvCheats(state, 'on', false);
  assert.equal(denied.ok, false);
  assert.equal(denied.svCheats, false);
  assert.equal(state.svCheats, false);
  assert.equal(state.god, false);
  assert.equal(state.ai, true);
  assert.equal(state.timeScale, 1);

  // Enabling in training works
  const enabled = setSvCheats(state, 'on', true);
  assert.equal(enabled.ok, true);
  assert.equal(enabled.svCheats, true);
  assert.equal(state.svCheats, true);

  // Simulate active cheats, then turn sv_cheats off -> all cheat flags reset automatically
  state.god = true;
  state.ai = false;
  state.timeScale = 0.3;
  const disabled = setSvCheats(state, 'off', true);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.svCheats, false);
  assert.equal(state.svCheats, false);
  assert.equal(state.god, false);
  assert.equal(state.ai, true);
  assert.equal(state.timeScale, 1);

  // Direct enforceCheatsOff always clears any leftover cheat state
  state.svCheats = true;
  state.god = true;
  state.ai = false;
  state.timeScale = 3;
  enforceCheatsOff(state);
  assert.deepEqual(state, { svCheats: false, god: false, ai: true, timeScale: 1 });
});
