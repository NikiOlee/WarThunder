import test from 'node:test';
import assert from 'node:assert/strict';
import { computeJoystickOutput } from './touchControls';
import { DEFAULTS, resetSettings, setSetting, settings } from './settings';

test('computeJoystickOutput returns zero throttle/steer inside deadzone while moving visual knob', () => {
  const out = computeJoystickOutput(4, -3, 50, 0.14);
  assert.equal(out.throttle, 0);
  assert.equal(out.steer, 0);
  assert.equal(out.knobX, 4);
  assert.equal(out.knobY, -3);
});

test('computeJoystickOutput maps up/down/left/right axes to tank throttle and steer', () => {
  // Dragging UP (negative dy) produces forward throttle (+1)
  const up = computeJoystickOutput(0, -50, 50, 0.14);
  assert.equal(up.throttle, 1);
  assert.equal(up.steer, 0);
  assert.equal(up.knobX, 0);
  assert.equal(up.knobY, -50);

  // Dragging DOWN (positive dy) produces reverse throttle (-1)
  const down = computeJoystickOutput(0, 50, 50, 0.14);
  assert.equal(down.throttle, -1);
  assert.equal(down.steer, 0);

  // Dragging LEFT (negative dx) produces positive steer (+1, matching KeyA)
  const left = computeJoystickOutput(-50, 0, 50, 0.14);
  assert.equal(left.steer, 1);
  assert.equal(left.throttle, 0);

  // Dragging RIGHT (positive dx) produces negative steer (-1, matching KeyD)
  const right = computeJoystickOutput(50, 0, 50, 0.14);
  assert.equal(right.steer, -1);
  assert.equal(right.throttle, 0);
});

test('computeJoystickOutput clamps visual knob and axes beyond maxRadius', () => {
  const out = computeJoystickOutput(-120, -160, 50, 0.14);
  const knobDist = Math.hypot(out.knobX, out.knobY);
  assert.ok(Math.abs(knobDist - 50) < 1e-6);
  assert.ok(out.throttle > 0.7 && out.throttle <= 1);
  assert.ok(out.steer > 0.5 && out.steer <= 1);
});

test('settings preserve controlMode and controlChosen on resetSettings while restoring defaults', () => {
  setSetting('controlMode', 'touch');
  setSetting('controlChosen', true);
  setSetting('touchSens', 1.65);
  setSetting('master', 0.25);

  resetSettings();

  assert.equal(settings.controlMode, 'touch');
  assert.equal(settings.controlChosen, true);
  assert.equal(settings.touchSens, DEFAULTS.touchSens);
  assert.equal(settings.master, DEFAULTS.master);

  // Restore initial clean default state
  setSetting('controlMode', DEFAULTS.controlMode);
  setSetting('controlChosen', DEFAULTS.controlChosen);
});
