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
  mg: 'KeyF',
  ability: 'KeyE',
  sniper: 'ShiftLeft',
  binoc: 'KeyB',
  comp: 'KeyC',
  post: 'KeyP',
  console: 'Backquote',
};

export type KeyAction = keyof typeof DEFAULT_KEYS;

export type SupportedLanguage = 'ru' | 'sr' | 'en';

export const KEY_LABELS: Record<KeyAction, string> = {
  forward: 'Вперёд',
  back: 'Назад',
  left: 'Влево (поворот)',
  right: 'Вправо (поворот)',
  brake: 'Ручной тормоз',
  mg: 'Пулемёт (огонь)',
  ability: 'Способность (Рывок / Дым / DM63)',
  sniper: 'Снайперский прицел',
  binoc: 'Бинокль',
  comp: 'Баллистический вычислитель',
  post: 'Пост-обработка вкл/выкл',
  console: 'Консоль',
};

export function getKeyLabels(lang: SupportedLanguage = settings?.language || 'ru'): Record<KeyAction, string> {
  if (lang === 'sr') {
    return {
      forward: 'Napred',
      back: 'Nazad',
      left: 'Levo (skretanje)',
      right: 'Desno (skretanje)',
      brake: 'Ručna kočnica',
      mg: 'Mitraljez (paljba)',
      ability: 'Sposobnost (Dim / DM63)',
      sniper: 'Snajperski nišan',
      binoc: 'Dvogled',
      comp: 'Balistički računar',
      post: 'Naknadna obrada uklj/isklj',
      console: 'Konzola',
    };
  }
  if (lang === 'en') {
    return {
      forward: 'Forward',
      back: 'Backward',
      left: 'Steer Left',
      right: 'Steer Right',
      brake: 'Handbrake',
      mg: 'Machine Gun (fire)',
      ability: 'Active Ability (GALIX / DM63)',
      sniper: 'Sniper Scope',
      binoc: 'Binoculars',
      comp: 'Ballistic Computer',
      post: 'Post-Processing toggle',
      console: 'Console',
    };
  }
  return KEY_LABELS;
}

export type ControlMode = 'pc' | 'touch';

export interface GameSettings {
  language: SupportedLanguage;
  languageChosen: boolean;
  master: number;
  music: number;
  sfx: number;
  engine: number;
  sens: number;
  sensSniper: number;
  touchSens: number;
  controlMode: ControlMode;
  controlChosen: boolean;
  invertY: boolean;
  fov: number;
  fpsLimit: 0 | 30 | 60 | 120;
  shadows: 'off' | 'low' | 'medium' | 'high' | 'ultra';
  shadowType: 'basic' | 'pcf' | 'soft';
  bloom: number;
  post: boolean;
  grass: number;
  drawDist: 'low' | 'medium' | 'high' | 'ultra';
  resolution: number;
  dprCap: 1 | 1.5 | 2;
  lodScale: number;
  particles: number;
  envReflections: boolean;
  colorSaturation: number;
  exposureBias: number;
  showFps: boolean;
  vignette: boolean;
  hitcam: boolean;
  hints: boolean;
  botSkill: number;
  keys: Record<KeyAction, string>;
}

export const DEFAULTS: GameSettings = {
  language: 'ru',
  languageChosen: false,
  master: 0.8,
  music: 0.5,
  sfx: 0.9,
  engine: 0.6,
  sens: 1,
  sensSniper: 1,
  touchSens: 1,
  controlMode: 'pc',
  controlChosen: false,
  invertY: false,
  fov: 60,
  fpsLimit: 0,
  shadows: 'high',
  shadowType: 'soft',
  bloom: 0.45,
  post: true,
  grass: 1,
  drawDist: 'high',
  resolution: 1,
  dprCap: 1.5,
  lodScale: 1,
  particles: 1,
  envReflections: true,
  colorSaturation: 1,
  exposureBias: 1,
  showFps: false,
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

export function detectTouchDeviceHint(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const touchPts = typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
  return coarse || touchPts || window.innerWidth <= 820;
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

export function applySettingsPatch(patch: Partial<GameSettings>, persistPatch = true): void {
  for (const k in patch) {
    if (k === 'keys' || !(k in DEFAULTS)) continue;
    const val = patch[k as keyof GameSettings];
    if (val !== undefined) {
      (settings as unknown as Record<string, unknown>)[k] = val;
    }
  }
  if (persistPatch) persist();
  emit('*', null);
}

export function setKeyBind(action: KeyAction, code: string): void {
  settings.keys[action] = code;
  persist();
  emit('keys', settings.keys);
}

export function resetSettings(): void {
  const keepControlMode = settings.controlMode;
  const keepControlChosen = settings.controlChosen;
  const keepLanguage = settings.language;
  const keepLanguageChosen = settings.languageChosen;
  const d = JSON.parse(JSON.stringify(DEFAULTS)) as GameSettings;
  for (const k in d) {
    if (k === 'keys') Object.assign(settings.keys, d.keys);
    else (settings as unknown as Record<string, unknown>)[k] = (d as unknown as Record<string, unknown>)[k];
  }
  settings.controlMode = keepControlMode;
  settings.controlChosen = keepControlChosen;
  settings.language = keepLanguage;
  settings.languageChosen = keepLanguageChosen;
  persist();
  emit('*', null);
}

export function keyName(code: string, lang: SupportedLanguage = settings?.language || 'ru'): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const mapRu: Record<string, string> = {
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
  const mapSr: Record<string, string> = {
    Space: 'Razmak',
    ShiftLeft: 'Shift (levi)',
    ShiftRight: 'Shift (desni)',
    ControlLeft: 'Ctrl (levi)',
    ControlRight: 'Ctrl (desni)',
    AltLeft: 'Alt (levi)',
    Backquote: '~',
    Tab: 'Tab',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
  };
  const mapEn: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Shift (L)',
    ShiftRight: 'Shift (R)',
    ControlLeft: 'Ctrl (L)',
    ControlRight: 'Ctrl (R)',
    AltLeft: 'Alt (L)',
    Backquote: '~',
    Tab: 'Tab',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
  };
  const activeMap = lang === 'sr' ? mapSr : lang === 'en' ? mapEn : mapRu;
  return activeMap[code] || code;
}
