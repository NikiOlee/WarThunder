import { settings, setSetting, setKeyBind, resetSettings, KEY_LABELS, keyName, storage, type GameSettings, type KeyAction } from './settings';
import { audio } from './audio';
import { getAllTanks, getSelectedTankId, getTankSpec, setSelectedTankId } from './tanks';

interface SettingItem {
  k?: keyof GameSettings;
  t: 'range' | 'check' | 'select' | 'keys';
  l?: string;
  min?: number;
  max?: number;
  step?: number;
  pct?: boolean;
  num?: boolean;
  opts?: Array<[string | number, string]>;
}

const TABS: Record<string, { label: string; items: SettingItem[] }> = {
  sound: {
    label: 'Звук',
    items: [
      { k: 'master', t: 'range', l: 'Общая громкость', min: 0, max: 1, step: 0.05, pct: true },
      { k: 'music', t: 'range', l: 'Музыка', min: 0, max: 1, step: 0.05, pct: true },
      { k: 'sfx', t: 'range', l: 'Звуки (выстрелы, взрывы)', min: 0, max: 1, step: 0.05, pct: true },
      { k: 'engine', t: 'range', l: 'Двигатель и гусеницы', min: 0, max: 1, step: 0.05, pct: true },
    ],
  },
  controls: {
    label: 'Управление',
    items: [
      { k: 'sens', t: 'range', l: 'Чувствительность мыши', min: 0.2, max: 3, step: 0.05 },
      { k: 'sensSniper', t: 'range', l: 'Чувствительность в прицеле', min: 0.2, max: 3, step: 0.05 },
      { k: 'invertY', t: 'check', l: 'Инвертировать вертикаль' },
      { t: 'keys' },
    ],
  },
  graphics: {
    label: 'Графика',
    items: [
      { k: 'shadows', t: 'select', l: 'Тени', opts: [['off', 'Выкл'], ['medium', 'Средние'], ['high', 'Высокие']] },
      { k: 'post', t: 'check', l: 'Пост-обработка (свечение, тонемаппинг)' },
      { k: 'bloom', t: 'range', l: 'Сила свечения', min: 0, max: 1, step: 0.05 },
      { k: 'grass', t: 'select', num: true, l: 'Трава', opts: [[0, 'Выкл'], [0.5, 'Средняя'], [1, 'Высокая']] },
      { k: 'drawDist', t: 'select', l: 'Дальность прорисовки', opts: [['low', 'Низкая'], ['medium', 'Средняя'], ['high', 'Высокая']] },
      { k: 'resolution', t: 'select', num: true, l: 'Разрешение рендера', opts: [[0.6, '60%'], [0.8, '80%'], [1, '100%']] },
      { k: 'fov', t: 'range', l: 'Поле зрения (FOV)', min: 50, max: 95, step: 1 },
      { k: 'vignette', t: 'check', l: 'Виньетка' },
    ],
  },
  game: {
    label: 'Игра',
    items: [
      { k: 'hitcam', t: 'check', l: 'Камера попадания (рентген)' },
      { k: 'hints', t: 'check', l: 'Подсказки по управлению' },
      { k: 'botSkill', t: 'range', l: 'Меткость ботов', min: 0.4, max: 1.8, step: 0.05 },
    ],
  },
};

export interface MapDef {
  id: string;
  name: string;
  desc: string;
}

export interface UIHandlers {
  play: (fresh: boolean) => void;
  resume: () => void;
  toMenu: () => void;
  started: () => boolean;
  maps: MapDef[];
  getMap: () => string;
  setMap: (id: string) => void;
  onSelectTank: (tankId: string) => void;
  onHangarToggle: (open: boolean) => void;
}

export function createUI(h: UIHandlers) {
  const $ = (id: string) => document.getElementById(id)!;
  const menu = $('menu');
  const panels: Record<string, HTMLElement> = {
    main: $('mainPanel'),
    pause: $('pausePanel'),
    settings: $('settingsPanel'),
    maps: $('mapPanel'),
    hangar: $('hangarScreen'),
  };

  const ui = {
    rebinding: false,
    from: 'main',
    currentScreen: 'main' as string | null,
    show(which: string | null) {},
    openSettings(from: string, t?: string) {},
  };

  let tab = 'sound';
  let inspectedTankId: string | null = null;

  function show(which: string | null): void {
    ui.currentScreen = which;
    h.onHangarToggle(which === 'hangar');
    if (!which) {
      menu.classList.add('hidden');
      menu.classList.remove('hangar-mode');
      return;
    }
    menu.classList.remove('hidden');
    menu.classList.toggle('hangar-mode', which === 'hangar');
    for (const k in panels) panels[k].classList.toggle('hidden', k !== which);
    document.body.dataset.screen = which;

    if (which === 'main') {
      $('bPlay').textContent = h.started() ? 'ПРОДОЛЖИТЬ БИТВУ' : 'ИГРАТЬ';
      $('bNew').style.display = h.started() ? 'block' : 'none';
      const activeMap = h.maps.find((m) => m.id === h.getMap());
      const activeTank = getTankSpec(getSelectedTankId());
      $('mapName').textContent = `Карта: ${activeMap ? activeMap.name : ''} · Танк: ${activeTank.name}`;
    } else if (which === 'hangar') {
      renderHangar();
    }
  }
  ui.show = show;

  function openSettings(from: string, t?: string): void {
    ui.from = from;
    if (t) tab = t;
    renderSettings();
    show('settings');
  }
  ui.openSettings = openSettings;

  const click = () => audio.ui('click');

  $('bPlay').onclick = () => {
    click();
    h.play(false);
  };
  $('bNew').onclick = () => {
    click();
    h.play(true);
  };
  $('bMaps').onclick = () => {
    click();
    renderMaps();
    show('maps');
  };
  $('bMapsBack').onclick = () => {
    click();
    show('main');
  };
  $('bHangar').onclick = () => {
    audio.init();
    audio.music('menu');
    click();
    inspectedTankId = null;
    show('hangar');
  };
  $('bHangarBack').onclick = () => {
    click();
    show('main');
  };
  $('bSet').onclick = () => {
    click();
    openSettings('main');
  };
  $('bCtl').onclick = () => {
    click();
    openSettings('main', 'controls');
  };
  $('bResume').onclick = () => {
    click();
    h.resume();
  };
  $('bPauseSet').onclick = () => {
    click();
    openSettings('pause');
  };
  $('bToMenu').onclick = () => {
    click();
    h.toMenu();
  };
  $('bBack').onclick = () => {
    click();
    show(ui.from);
  };
  $('bReset').onclick = () => {
    click();
    resetSettings();
    renderSettings();
  };

  function renderHangar(): void {
    const listEl = $('hangarList');
    const infoEl = $('hangarInfo');
    const hintEl = $('hangarHint');
    const selectedId = getSelectedTankId();

    listEl.innerHTML = '';
    for (const t of getAllTanks()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'hangar-item' +
        (t.id === inspectedTankId ? ' inspected' : '') +
        (t.id === selectedId ? ' equipped' : '');
      btn.dataset.tankId = t.id;
      btn.setAttribute('aria-label', t.name);
      btn.innerHTML = `
        <div class="hi-top">
          <span class="hi-name">${t.name}</span>
          <span class="hi-badge">${t.id === selectedId ? 'ВЫБРАН' : 'В НАЛИЧИИ'}</span>
        </div>
        <div class="hi-sub">${t.role} · ${t.country}</div>
      `;
      btn.onclick = () => {
        click();
        inspectedTankId = t.id;
        renderHangar();
      };
      listEl.appendChild(btn);
    }

    if (!inspectedTankId) {
      infoEl.classList.add('hidden');
      hintEl.classList.remove('hidden');
      return;
    }

    hintEl.classList.add('hidden');
    infoEl.classList.remove('hidden');
    const spec = getTankSpec(inspectedTankId);
    const isEquipped = spec.id === selectedId;

    $('hangarTankTitle').textContent = spec.name;
    $('hangarTankRole').textContent = `${spec.role} · ${spec.country}`;
    $('hangarTankDesc').textContent = spec.description;

    $('hangarStats').innerHTML = `
      <div class="hstat"><span>Макс. скорость</span><b>${spec.maxSpeedKmh} км/ч</b></div>
      <div class="hstat"><span>Перезарядка орудия</span><b>${spec.reload.toFixed(1)} сек</b></div>
      <div class="hstat"><span>Дальность полёта снаряда</span><b>${spec.maxRange} м</b></div>
      <div class="hstat"><span>Прочность корпуса</span><b>${spec.maxHp} ед.</b></div>
      <div class="hstat"><span>Орудие</span><b>${spec.gunName}</b></div>
      <div class="hstat"><span>Лобовая броня</span><b>${spec.armor.hullFront} мм (наклонная)</b></div>
      <div class="hstat"><span>Урон при пробитии лба</span><b>${spec.damage.front} ед.</b></div>
      <div class="hstat"><span>Урон в борта и корму</span><b>${spec.damage.sideRear} ед.</b></div>
      <div class="hstat hstat-warn"><span>Уязвимая зона</span><b>Бензобак (ваншот)</b></div>
    `;

    const statusEl = $('hangarEquipStatus');
    const selectBtn = $('bHangarSelect') as HTMLButtonElement;
    statusEl.textContent = isEquipped ? 'Танк закреплён за вами для боя' : 'Готов к выходу в бой';
    statusEl.className = 'hangar-equip-status' + (isEquipped ? ' active' : '');
    selectBtn.textContent = 'ВЫБРАТЬ';
    selectBtn.className = 'btn hangar-select-btn' + (isEquipped ? ' selected' : '');
    selectBtn.onclick = () => {
      click();
      setSelectedTankId(spec.id);
      h.onSelectTank(spec.id);
      renderHangar();
    };
  }

  function renderMaps(): void {
    const box = $('mapCards');
    box.innerHTML = '';
    for (const m of h.maps) {
      const sel = h.getMap() === m.id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mapcard ' + m.id + (sel ? ' sel' : '');
      card.innerHTML = `<div class="mname">${m.name}</div><div class="mdesc">${m.desc}</div>${sel ? '<span class="m-badge">ВЫБРАНО</span>' : ''}`;
      card.onclick = () => {
        if (h.getMap() === m.id) return;
        click();
        card.querySelector('.mdesc')!.textContent = 'Загрузка...';
        setTimeout(() => {
          h.setMap(m.id);
          renderMaps();
        }, 40);
      };
      box.appendChild(card);
    }
  }

  function renderSettings(): void {
    const tabs = $('tabs');
    const body = $('tabBody');
    tabs.innerHTML = '';
    for (const id in TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = TABS[id].label;
      b.className = 'tab' + (id === tab ? ' on' : '');
      b.onclick = () => {
        tab = id;
        renderSettings();
      };
      tabs.appendChild(b);
    }
    body.innerHTML = '';
    const st = document.createElement('div');
    st.className = 'sub';
    st.textContent = storage.ok
      ? 'Настройки сохраняются автоматически.'
      : 'Внимание: браузер блокирует localStorage, настройки не сохранятся после перезагрузки.';
    st.style.color = storage.ok ? '#9aa58a' : '#ff9a7a';
    body.appendChild(st);
    for (const it of TABS[tab].items) {
      if (it.t === 'keys') {
        renderKeys(body);
        continue;
      }
      const key = it.k!;
      const row = document.createElement('div');
      row.className = 'row';
      const lab = document.createElement('label');
      lab.textContent = it.l || '';
      row.appendChild(lab);
      if (it.t === 'range') {
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = String(it.min);
        inp.max = String(it.max);
        inp.step = String(it.step);
        inp.value = String(settings[key]);
        const val = document.createElement('span');
        val.className = 'val';
        const fmt = (v: number) => (it.pct ? Math.round(v * 100) + '%' : (+v).toFixed(2).replace(/\.?0+$/, ''));
        val.textContent = fmt(Number(settings[key]));
        inp.oninput = () => {
          const v = parseFloat(inp.value);
          val.textContent = fmt(v);
          setSetting(key, v as never);
        };
        inp.onchange = () => audio.ui('click');
        row.append(inp, val);
      } else if (it.t === 'check') {
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = !!settings[key];
        inp.onchange = () => {
          setSetting(key, inp.checked as never);
          audio.ui('click');
        };
        row.appendChild(inp);
      } else if (it.t === 'select') {
        const sel = document.createElement('select');
        for (const [v, name] of it.opts || []) {
          const o = document.createElement('option');
          o.value = String(v);
          o.textContent = name;
          if (String(settings[key]) === String(v)) o.selected = true;
          sel.appendChild(o);
        }
        sel.onchange = () => {
          setSetting(key, (it.num ? parseFloat(sel.value) : sel.value) as never);
          audio.ui('click');
        };
        row.appendChild(sel);
      }
      body.appendChild(row);
    }
  }

  function renderKeys(body: HTMLElement): void {
    const head = document.createElement('div');
    head.className = 'sub';
    head.textContent = 'Клавиши (нажмите кнопку и затем новую клавишу, Esc — отмена)';
    body.appendChild(head);
    for (const action of Object.keys(KEY_LABELS) as KeyAction[]) {
      const row = document.createElement('div');
      row.className = 'row';
      const lab = document.createElement('label');
      lab.textContent = KEY_LABELS[action];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key';
      btn.textContent = keyName(settings.keys[action]);
      btn.onclick = () => {
        if (ui.rebinding) return;
        ui.rebinding = true;
        btn.textContent = 'нажмите клавишу...';
        btn.classList.add('wait');
        const cap = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          window.removeEventListener('keydown', cap, true);
          ui.rebinding = false;
          btn.classList.remove('wait');
          if (e.code !== 'Escape') setKeyBind(action, e.code);
          btn.textContent = keyName(settings.keys[action]);
        };
        window.addEventListener('keydown', cap, true);
      };
      row.append(lab, btn);
      body.appendChild(row);
    }
    const note = document.createElement('div');
    note.className = 'sub';
    note.textContent = 'Стрельба — левая кнопка мыши. Колесо — зум. Эти действия не переназначаются.';
    body.appendChild(note);
  }

  return ui;
}
