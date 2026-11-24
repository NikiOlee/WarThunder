export interface JoystickOutput {
  knobX: number;
  knobY: number;
  throttle: number;
  steer: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Normalizes raw touch offset (dx, dy) from joystick center into:
 * - clamped visual knob offset (knobX, knobY)
 * - tank throttle (-1..1, up is +1)
 * - tank steer (-1..1, left is +1, right is -1 to match keyboard input)
 */
export function computeJoystickOutput(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone = 0.14,
): JoystickOutput {
  const safeR = Math.max(1, maxRadius);
  const dist = Math.hypot(dx, dy);
  const clampedDist = Math.min(dist, safeR);
  const ratio = clampedDist / safeR;

  const knobX = dist > 1e-4 ? (dx / dist) * clampedDist : 0;
  const knobY = dist > 1e-4 ? (dy / dist) * clampedDist : 0;

  if (ratio <= deadzone) {
    return { knobX, knobY, throttle: 0, steer: 0 };
  }

  const scaled = (ratio - deadzone) / Math.max(0.01, 1 - deadzone);
  const nx = (dx / Math.max(1e-4, dist)) * scaled;
  const ny = (dy / Math.max(1e-4, dist)) * scaled;

  return {
    knobX: knobX || 0,
    knobY: knobY || 0,
    throttle: clamp(-ny, -1, 1) || 0,
    steer: clamp(-nx, -1, 1) || 0,
  };
}

export interface TouchInputState {
  throttle: number;
  steer: number;
  fireHeld: boolean;
  mgHeld: boolean;
}

export interface TouchControllerHooks {
  isTouchGameplayActive: () => boolean;
  onLookDelta: (dx: number, dy: number) => void;
  onBinocTap?: () => void;
  onToggleSniper: () => void;
  onToggleBinoc: () => void;
  onCycleZoom: () => void;
  onReloadMg: () => void;
  onActivateAbility?: () => void;
  onActivateAbility2?: () => void;
  onKstamHoldStart?: () => void;
  onKstamHoldEnd?: () => void;
  onPause: () => void;
  onToggleScoreboard: () => void;
}

export function attachTouchControls(hooks: TouchControllerHooks): {
  state: TouchInputState;
  reset: () => void;
  dispose: () => void;
} {
  const state: TouchInputState = {
    throttle: 0,
    steer: 0,
    fireHeld: false,
    mgHeld: false,
  };

  const joyBase = document.getElementById('touchJoyBase');
  const joyKnob = document.getElementById('touchJoyKnob');
  const btnFire = document.getElementById('tBtnFire');
  const btnMg = document.getElementById('tBtnMg');
  const mgKnob = document.getElementById('tMgJoyKnob');
  const btnMgReload = document.getElementById('tBtnMgReload');
  const btnAbility = document.getElementById('tBtnAbility');
  const btnAbility2 = document.getElementById('tBtnAbility2');
  const btnKstamLock = document.getElementById('tBtnKstamLock');
  const btnSniper = document.getElementById('tBtnSniper');
  const btnBinoc = document.getElementById('tBtnBinoc');
  const btnZoom = document.getElementById('tBtnZoom');
  const btnPause = document.getElementById('tBtnPause');
  const btnScore = document.getElementById('tBtnScore');

  let joyPointerId: number | null = null;
  let lookPointerId: number | null = null;
  let lookLastX = 0;
  let lookLastY = 0;
  let lookStartX = 0;
  let lookStartY = 0;
  let lookStartTime = 0;
  let firePointerId: number | null = null;
  let mgPointerId: number | null = null;
  let mgLastX = 0;
  let mgLastY = 0;
  let kstamPointerId: number | null = null;

  const setKnobVisual = (x: number, y: number) => {
    if (joyKnob) {
      joyKnob.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  };

  const setMgKnobVisual = (x: number, y: number) => {
    if (mgKnob) {
      mgKnob.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  };

  const updateMgKnobFromEvent = (clientX: number, clientY: number) => {
    if (!btnMg) return;
    const rect = btnMg.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(14, rect.width * 0.28);
    const out = computeJoystickOutput(clientX - cx, clientY - cy, maxR, 0.05);
    setMgKnobVisual(out.knobX, out.knobY);
  };

  const updateJoystickFromEvent = (clientX: number, clientY: number) => {
    if (!joyBase) return;
    const rect = joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(24, rect.width * 0.38);
    const out = computeJoystickOutput(clientX - cx, clientY - cy, maxR);
    state.throttle = out.throttle;
    state.steer = out.steer;
    setKnobVisual(out.knobX, out.knobY);
  };

  const resetJoystick = () => {
    joyPointerId = null;
    state.throttle = 0;
    state.steer = 0;
    joyBase?.classList.remove('active');
    setKnobVisual(0, 0);
  };

  const resetMgJoystick = () => {
    mgPointerId = null;
    state.mgHeld = false;
    btnMg?.classList.remove('pressed');
    setMgKnobVisual(0, 0);
  };

  const resetAll = () => {
    resetJoystick();
    resetMgJoystick();
    lookPointerId = null;
    firePointerId = null;
    state.fireHeld = false;
    btnFire?.classList.remove('pressed');
    if (kstamPointerId !== null) {
      kstamPointerId = null;
      btnKstamLock?.classList.remove('pressed');
      hooks.onKstamHoldEnd?.();
    }
  };

  const onJoyDown = (e: PointerEvent) => {
    if (!hooks.isTouchGameplayActive() || joyPointerId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    joyPointerId = e.pointerId;
    joyBase?.classList.add('active');
    try {
      joyBase?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    updateJoystickFromEvent(e.clientX, e.clientY);
  };

  const onJoyMove = (e: PointerEvent) => {
    if (e.pointerId !== joyPointerId) return;
    e.preventDefault();
    updateJoystickFromEvent(e.clientX, e.clientY);
  };

  const onJoyUp = (e: PointerEvent) => {
    if (e.pointerId !== joyPointerId) return;
    e.preventDefault();
    resetJoystick();
  };

  const onFireDown = (e: PointerEvent) => {
    if (!hooks.isTouchGameplayActive()) return;
    e.preventDefault();
    e.stopPropagation();
    firePointerId = e.pointerId;
    state.fireHeld = true;
    btnFire?.classList.add('pressed');
    try {
      btnFire?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onFireUp = (e: PointerEvent) => {
    if (e.pointerId !== firePointerId) return;
    e.preventDefault();
    firePointerId = null;
    state.fireHeld = false;
    btnFire?.classList.remove('pressed');
  };

  const onMgDown = (e: PointerEvent) => {
    if (!hooks.isTouchGameplayActive() || mgPointerId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    mgPointerId = e.pointerId;
    mgLastX = e.clientX;
    mgLastY = e.clientY;
    state.mgHeld = true;
    btnMg?.classList.add('pressed');
    try {
      btnMg?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    updateMgKnobFromEvent(e.clientX, e.clientY);
  };

  const onMgMove = (e: PointerEvent) => {
    if (e.pointerId !== mgPointerId) return;
    if (!hooks.isTouchGameplayActive()) {
      resetMgJoystick();
      return;
    }
    e.preventDefault();
    updateMgKnobFromEvent(e.clientX, e.clientY);
    const dx = e.clientX - mgLastX;
    const dy = e.clientY - mgLastY;
    mgLastX = e.clientX;
    mgLastY = e.clientY;
    if (dx !== 0 || dy !== 0) {
      hooks.onLookDelta(dx, dy);
    }
  };

  const onMgUp = (e: PointerEvent) => {
    if (e.pointerId !== mgPointerId) return;
    e.preventDefault();
    resetMgJoystick();
  };

  const onKstamDown = (e: PointerEvent) => {
    if (!hooks.isTouchGameplayActive() || kstamPointerId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    kstamPointerId = e.pointerId;
    btnKstamLock?.classList.add('pressed');
    try {
      btnKstamLock?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    hooks.onKstamHoldStart?.();
  };

  const onKstamUp = (e: PointerEvent) => {
    if (e.pointerId !== kstamPointerId) return;
    e.preventDefault();
    kstamPointerId = null;
    btnKstamLock?.classList.remove('pressed');
    hooks.onKstamHoldEnd?.();
  };

  const bindTapButton = (el: HTMLElement | null, handler: () => void) => {
    if (!el) return () => {};
    const onDown = (e: PointerEvent) => {
      if (!hooks.isTouchGameplayActive()) return;
      e.preventDefault();
      e.stopPropagation();
      handler();
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  };

  // Free-area camera & turret swipe anywhere outside touch controls/overlays
  const onDocPointerDown = (e: PointerEvent) => {
    if (!hooks.isTouchGameplayActive()) return;
    if (lookPointerId !== null) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('[data-touch-control="true"], #menu, #scoreboard, #console, #spectatorBar')) {
      return;
    }
    lookPointerId = e.pointerId;
    lookLastX = lookStartX = e.clientX;
    lookLastY = lookStartY = e.clientY;
    lookStartTime = performance.now();
  };

  const onDocPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== lookPointerId) return;
    if (!hooks.isTouchGameplayActive()) {
      lookPointerId = null;
      return;
    }
    const dx = e.clientX - lookLastX;
    const dy = e.clientY - lookLastY;
    lookLastX = e.clientX;
    lookLastY = e.clientY;
    if (dx !== 0 || dy !== 0) {
      hooks.onLookDelta(dx, dy);
    }
  };

  const onDocPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== lookPointerId) return;
    const moved = Math.hypot(e.clientX - lookStartX, e.clientY - lookStartY);
    const dt = performance.now() - lookStartTime;
    lookPointerId = null;
    if (moved < 9 && dt < 240 && hooks.onBinocTap) {
      hooks.onBinocTap();
    }
  };

  joyBase?.addEventListener('pointerdown', onJoyDown);
  joyBase?.addEventListener('pointermove', onJoyMove);
  joyBase?.addEventListener('pointerup', onJoyUp);
  joyBase?.addEventListener('pointercancel', onJoyUp);

  btnFire?.addEventListener('pointerdown', onFireDown);
  btnFire?.addEventListener('pointerup', onFireUp);
  btnFire?.addEventListener('pointercancel', onFireUp);

  btnMg?.addEventListener('pointerdown', onMgDown);
  btnMg?.addEventListener('pointermove', onMgMove);
  btnMg?.addEventListener('pointerup', onMgUp);
  btnMg?.addEventListener('pointercancel', onMgUp);

  btnKstamLock?.addEventListener('pointerdown', onKstamDown);
  btnKstamLock?.addEventListener('pointerup', onKstamUp);
  btnKstamLock?.addEventListener('pointercancel', onKstamUp);

  const unbindSniper = bindTapButton(btnSniper, hooks.onToggleSniper);
  const unbindBinoc = bindTapButton(btnBinoc, hooks.onToggleBinoc);
  const unbindZoom = bindTapButton(btnZoom, hooks.onCycleZoom);
  const unbindMgReload = bindTapButton(btnMgReload, hooks.onReloadMg);
  const unbindAbility = bindTapButton(btnAbility, () => hooks.onActivateAbility?.());
  const unbindAbility2 = bindTapButton(btnAbility2, () => hooks.onActivateAbility2?.());
  const unbindPause = bindTapButton(btnPause, hooks.onPause);
  const unbindScore = bindTapButton(btnScore, hooks.onToggleScoreboard);

  document.addEventListener('pointerdown', onDocPointerDown);
  document.addEventListener('pointermove', onDocPointerMove);
  document.addEventListener('pointerup', onDocPointerUp);
  document.addEventListener('pointercancel', onDocPointerUp);

  return {
    state,
    reset: resetAll,
    dispose: () => {
      resetAll();
      joyBase?.removeEventListener('pointerdown', onJoyDown);
      joyBase?.removeEventListener('pointermove', onJoyMove);
      joyBase?.removeEventListener('pointerup', onJoyUp);
      joyBase?.removeEventListener('pointercancel', onJoyUp);

      btnFire?.removeEventListener('pointerdown', onFireDown);
      btnFire?.removeEventListener('pointerup', onFireUp);
      btnFire?.removeEventListener('pointercancel', onFireUp);

      btnMg?.removeEventListener('pointerdown', onMgDown);
      btnMg?.removeEventListener('pointermove', onMgMove);
      btnMg?.removeEventListener('pointerup', onMgUp);
      btnMg?.removeEventListener('pointercancel', onMgUp);

      btnKstamLock?.removeEventListener('pointerdown', onKstamDown);
      btnKstamLock?.removeEventListener('pointerup', onKstamUp);
      btnKstamLock?.removeEventListener('pointercancel', onKstamUp);

      unbindSniper();
      unbindBinoc();
      unbindZoom();
      unbindMgReload();
      unbindAbility();
      unbindAbility2();
      unbindPause();
      unbindScore();

      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('pointermove', onDocPointerMove);
      document.removeEventListener('pointerup', onDocPointerUp);
      document.removeEventListener('pointercancel', onDocPointerUp);
    },
  };
}
