import { settings, setSetting, setKeyBind, resetSettings, KEY_LABELS, keyName, storage } from './settings.js';
import { audio } from './audio.js';

const TABS = {
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

export function createUI(h) {
  const $ = (id) => document.getElementById(id);
  const menu = $('menu'), panels = { main: $('mainPanel'), pause: $('pausePanel'), settings: $('settingsPanel'), maps: $('mapPanel') };
  const ui = { rebinding: false, from: 'main' };
  let tab = 'sound';

  function show(which) {
    if (!which) { menu.classList.add('hidden'); return; }
    menu.classList.remove('hidden');
    for (const k in panels) panels[k].classList.toggle('hidden', k !== which);
    if (which === 'main') {
      $('bPlay').textContent = h.started() ? 'ПРОДОЛЖИТЬ БИТВУ' : 'ИГРАТЬ';
      $('bNew').style.display = h.started() ? 'block' : 'none';
      $('mapName').textContent = 'Карта: ' + h.maps.find((m) => m.id === h.getMap()).name;
    }
  }
  ui.show = show;

  function openSettings(from, t) { ui.from = from; if (t) tab = t; renderSettings(); show('settings'); }

  const click = () => audio.ui('click');
  $('bPlay').onclick = () => { click(); h.play(false); };
  $('bNew').onclick = () => { click(); h.play(true); };
  $('bMaps').onclick = () => { click(); renderMaps(); show('maps'); };
  $('bMapsBack').onclick = () => { click(); show('main'); };
  $('bSet').onclick = () => { click(); openSettings('main'); };
  $('bCtl').onclick = () => { click(); openSettings('main', 'controls'); };
  $('bResume').onclick = () => { click(); h.resume(); };
  $('bPauseSet').onclick = () => { click(); openSettings('pause'); };
  $('bToMenu').onclick = () => { click(); h.toMenu(); };
  $('bBack').onclick = () => { click(); show(ui.from); };
  $('bReset').onclick = () => { click(); resetSettings(); renderSettings(); };

  function renderMaps() {
    const box = $('mapCards'); box.innerHTML = '';
    for (const m of h.maps) {
      const card = document.createElement('div');
      card.className = 'mapcard ' + m.id + (h.getMap() === m.id ? ' sel' : '');
      card.innerHTML = `<div class="mname">${m.name}</div><div class="mdesc">${m.desc}</div>`;
      card.onclick = () => {
        if (h.getMap() === m.id) return;
        click(); card.querySelector('.mdesc').textContent = 'Загрузка...';
        setTimeout(() => { h.setMap(m.id); renderMaps(); }, 40);              // let the browser paint the label first
      };
      box.appendChild(card);
    }
  }

  function renderSettings() {
    const tabs = $('tabs'), body = $('tabBody');
    tabs.innerHTML = '';
    for (const id in TABS) {
      const b = document.createElement('button'); b.textContent = TABS[id].label; b.className = 'tab' + (id === tab ? ' on' : '');
      b.onclick = () => { tab = id; renderSettings(); }; tabs.appendChild(b);
    }
    body.innerHTML = '';
    const st = document.createElement('div'); st.className = 'sub';
    st.textContent = storage.ok ? 'Настройки сохраняются автоматически.' : 'Внимание: браузер блокирует localStorage, настройки не сохранятся после перезагрузки.';
    st.style.color = storage.ok ? '#9aa58a' : '#ff9a7a'; body.appendChild(st);
    for (const it of TABS[tab].items) {
      if (it.t === 'keys') { renderKeys(body); continue; }
      const row = document.createElement('div'); row.className = 'row';
      const lab = document.createElement('label'); lab.textContent = it.l; row.appendChild(lab);
      if (it.t === 'range') {
        const inp = document.createElement('input'); inp.type = 'range'; inp.min = it.min; inp.max = it.max; inp.step = it.step; inp.value = settings[it.k];
        const val = document.createElement('span'); val.className = 'val';
        const fmt = (v) => (it.pct ? Math.round(v * 100) + '%' : (+v).toFixed(2).replace(/\.?0+$/, ''));
        val.textContent = fmt(settings[it.k]);
        inp.oninput = () => { const v = parseFloat(inp.value); val.textContent = fmt(v); setSetting(it.k, v); };
        inp.onchange = () => audio.ui('click');
        row.append(inp, val);
      } else if (it.t === 'check') {
        const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!settings[it.k];
        inp.onchange = () => { setSetting(it.k, inp.checked); audio.ui('click'); };
        row.appendChild(inp);
      } else if (it.t === 'select') {
        const sel = document.createElement('select');
        for (const [v, name] of it.opts) { const o = document.createElement('option'); o.value = v; o.textContent = name; if (String(settings[it.k]) === String(v)) o.selected = true; sel.appendChild(o); }
        sel.onchange = () => { setSetting(it.k, it.num ? parseFloat(sel.value) : sel.value); audio.ui('click'); };
        row.appendChild(sel);
      }
      body.appendChild(row);
    }
  }

  function renderKeys(body) {
    const head = document.createElement('div'); head.className = 'sub'; head.textContent = 'Клавиши (нажмите кнопку и затем новую клавишу, Esc — отмена)';
    body.appendChild(head);
    for (const action in KEY_LABELS) {
      const row = document.createElement('div'); row.className = 'row';
      const lab = document.createElement('label'); lab.textContent = KEY_LABELS[action];
      const btn = document.createElement('button'); btn.className = 'key'; btn.textContent = keyName(settings.keys[action]);
      btn.onclick = () => {
        if (ui.rebinding) return;
        ui.rebinding = true; btn.textContent = 'нажмите клавишу...'; btn.classList.add('wait');
        const cap = (e) => {
          e.preventDefault(); e.stopImmediatePropagation();
          window.removeEventListener('keydown', cap, true); ui.rebinding = false; btn.classList.remove('wait');
          if (e.code !== 'Escape') setKeyBind(action, e.code);
          btn.textContent = keyName(settings.keys[action]);
        };
        window.addEventListener('keydown', cap, true);
      };
      row.append(lab, btn); body.appendChild(row);
    }
    const note = document.createElement('div'); note.className = 'sub';
    note.textContent = 'Стрельба — левая кнопка мыши. Колесо — зум. Эти действия не переназначаются.';
    body.appendChild(note);
  }

  ui.openSettings = openSettings;
  return ui;
}
