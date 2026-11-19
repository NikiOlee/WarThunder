const STORE_KEY = 'ironsky.settings.v2';
export const storage = { ok: false };
try { localStorage.setItem('ironsky.test', '1'); localStorage.removeItem('ironsky.test'); storage.ok = true; } catch (e) { storage.ok = false; }

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', brake: 'Space',
  sniper: 'ShiftLeft', binoc: 'KeyB', comp: 'KeyC', post: 'KeyP', console: 'Backquote',
};

export const KEY_LABELS = {
  forward: 'Вперёд', back: 'Назад', left: 'Влево (поворот)', right: 'Вправо (поворот)', brake: 'Ручной тормоз',
  sniper: 'Снайперский прицел', binoc: 'Бинокль', comp: 'Баллистический вычислитель', post: 'Пост-обработка вкл/выкл', console: 'Консоль',
};

export const DEFAULTS = {
  master: 0.8, music: 0.5, sfx: 0.9, engine: 0.6,
  sens: 1, sensSniper: 1, invertY: false,
  fov: 60, shadows: 'high', bloom: 0.45, post: true, grass: 1, drawDist: 'high', resolution: 1, vignette: true,
  hitcam: true, hints: true, botSkill: 1,
  keys: { ...DEFAULT_KEYS },
};

export const settings = JSON.parse(JSON.stringify(DEFAULTS));

try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    const o = JSON.parse(raw);
    for (const k in o) {
      if (k === 'keys') Object.assign(settings.keys, o.keys);
      else if (k in DEFAULTS) settings[k] = o[k];
    }
  }
} catch (e) { /* no storage available */ }

const listeners = new Set();
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); storage.ok = true; } catch (e) { storage.ok = false; } }
if (typeof window !== 'undefined') window.addEventListener('pagehide', persist);
function emit(k, v) { listeners.forEach((f) => f(k, v)); }

export function setSetting(k, v) { settings[k] = v; persist(); emit(k, v); }
export function setKeyBind(action, code) { settings.keys[action] = code; persist(); emit('keys', settings.keys); }
export function resetSettings() {
  const d = JSON.parse(JSON.stringify(DEFAULTS));
  for (const k in d) { if (k === 'keys') Object.assign(settings.keys, d.keys); else settings[k] = d[k]; }
  persist(); emit('*', null);
}

export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Space: 'Пробел', ShiftLeft: 'Shift (лев)', ShiftRight: 'Shift (прав)', ControlLeft: 'Ctrl (лев)', ControlRight: 'Ctrl (прав)',
    AltLeft: 'Alt (лев)', Backquote: '~ / Ё', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter' };
  return map[code] || code;
}
