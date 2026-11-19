const STORE_KEY = 'ironsky.settings.v2';
export const storage = { ok: false };
try {
  localStorage.setItem('ironsky.test', '1');
  localStorage.removeItem('ironsky.test');
  storage.ok = true;
} catch {
  storage.ok = false;
}

export const DEFAULT_KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  brake: 'Space',
  sniper: 'ShiftLeft',
  binoc: 'KeyB',
  comp: 'KeyC',
  post: 'KeyP',
  console: 'Backquote',
};

export type KeyAction = keyof typeof DEFAULT_KEYS;

export const KEY_LABELS: Record<KeyAction, string> = {
  forward: 'Вперёд',
  back: 'Назад',
  left: 'Влево (поворот)',
  right: 'Вправо (поворот)',
  brake: 'Ручной тормоз',
  sniper: 'Снайперский прицел',
  binoc: 'Бинокль',
  comp: 'Баллистический вычислитель',
  post: 'Пост-обработка вкл/выкл',
  console: 'Консоль',
};

export interface GameSettings {
  master: number;
  music: number;
  sfx: number;
  engine: number;
  sens: number;
  sensSniper: number;
  invertY: boolean;
  fov: number;
  shadows: 'off' | 'medium' | 'high';
  bloom: number;
  post: boolean;
  grass: number;
  drawDist: 'low' | 'medium' | 'high';
  resolution: number;
  vignette: boolean;
  hitcam: boolean;
  hints: boolean;
  botSkill: number;
  keys: Record<KeyAction, string>;
}

export const DEFAULTS: GameSettings = {
  master: 0.8,
  music: 0.5,
  sfx: 0.9,
  engine: 0.6,
  sens: 1,
  sensSniper: 1,
  invertY: false,
  fov: 60,
  shadows: 'high',
  bloom: 0.45,
  post: true,
  grass: 1,
  drawDist: 'high',
  resolution: 1,
  vignette: true,
  hitcam: true,
  hints: true,
  botSkill: 1,
  keys: { ...DEFAULT_KEYS },
};

export const settings: GameSettings = JSON.parse(JSON.stringify(DEFAULTS));

try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    const o = JSON.parse(raw);
    for (const k in o) {
      if (k === 'keys') Object.assign(settings.keys, o.keys);
      else if (k in DEFAULTS) (settings as unknown as Record<string, unknown>)[k] = o[k];
    }
  }
} catch {
  // no storage available
}

type Listener = (key: string, value: unknown) => void;
const listeners = new Set<Listener>();
export function onSettings(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    storage.ok = true;
  } catch {
    storage.ok = false;
  }
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', persist);

function emit(k: string, v: unknown): void {
  listeners.forEach((f) => f(k, v));
}

export function setSetting<K extends keyof GameSettings>(k: K, v: GameSettings[K]): void {
  settings[k] = v;
  persist();
  emit(String(k), v);
}

export function setKeyBind(action: KeyAction, code: string): void {
  settings.keys[action] = code;
  persist();
  emit('keys', settings.keys);
}

export function resetSettings(): void {
  const d = JSON.parse(JSON.stringify(DEFAULTS)) as GameSettings;
  for (const k in d) {
    if (k === 'keys') Object.assign(settings.keys, d.keys);
    else (settings as unknown as Record<string, unknown>)[k] = (d as unknown as Record<string, unknown>)[k];
  }
  persist();
  emit('*', null);
}

export function keyName(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Пробел',
    ShiftLeft: 'Shift (лев)',
    ShiftRight: 'Shift (прав)',
    ControlLeft: 'Ctrl (лев)',
    ControlRight: 'Ctrl (прав)',
    AltLeft: 'Alt (лев)',
    Backquote: '~ / Ё',
    Tab: 'Tab',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
  };
  return map[code] || code;
}
