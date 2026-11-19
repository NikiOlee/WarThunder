/* In-game developer console (key ` / Ё). `game` is the API object created in main.js. */
export class GameConsole {
  constructor(root, game) {
    this.root = root; this.game = game; this.open = false;
    this.log = root.querySelector('#conLog'); this.input = root.querySelector('#conIn');
    this.hist = []; this.hi = 0;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = this.input.value.trim(); this.input.value = ''; if (v) { this.hist.push(v); this.hi = this.hist.length; this.exec(v); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (this.hi > 0) this.input.value = this.hist[--this.hi]; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.hi = Math.min(this.hist.length, this.hi + 1); this.input.value = this.hist[this.hi] || ''; }
      else if (e.key === 'Escape' || e.code === this.game.consoleKey()) { e.preventDefault(); this.close(); }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.print('Консоль Iron & Sky. Введите help для списка команд.', '#9fd0ff');
  }

  toggle() { this.open ? this.close() : this.openIt(); }
  openIt() { this.open = true; this.root.style.display = 'flex'; this.input.value = ''; setTimeout(() => this.input.focus(), 0); this.game.onConsole(true); }
  close() { this.open = false; this.root.style.display = 'none'; this.input.blur(); this.game.onConsole(false); }

  print(text, color) {
    const d = document.createElement('div'); d.textContent = text; if (color) d.style.color = color;
    this.log.appendChild(d); while (this.log.children.length > 80) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
  err(t) { this.print(t, '#ff8a7a'); }
  ok(t) { this.print(t, '#9fe39a'); }

  exec(line) {
    this.print('> ' + line, '#ffffff');
    const [cmd, ...a] = line.split(/\s+/);
    const fn = this.commands[cmd.toLowerCase()];
    if (!fn) { this.err(`Неизвестная команда: ${cmd}. Введите help.`); return; }
    try { fn.call(this, a); } catch (e) { this.err('Ошибка: ' + e.message); }
  }

  get commands() {
    const g = this.game, num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
    const onoff = (v, cur) => (v === undefined ? !cur : ['on', '1', 'true', 'вкл'].includes(String(v).toLowerCase()));
    const teamOf = (w) => ({ enemy: 'B', enemies: 'B', ally: 'A', allies: 'A', e: 'B', a: 'A' })[String(w).toLowerCase()];
    return {
      help() {
        [
          'help — список команд          clear — очистить консоль',
          'god [on|off] — бессмертие      heal — вылечить и починить себя',
          'kill <me|enemies|allies|all> — уничтожить танки',
          'spawn <enemy|ally> [n] — создать ботов у точки прицела',
          'removebots <enemy|ally|all> — удалить ботов',
          'hit <tracks|gun|fuel|crit> [me|enemies|allies] — применить повреждение',
          'tp <x> <z> — телепорт              reload — мгновенная перезарядка',
          'ai <on|off> — включить/выключить ИИ ботов',
          'timescale <0.1-3> — скорость игры   fps — счётчик FPS',
          'fov <40-100>   sens <0.1-4>   vol <master|music|sfx|engine> <0-1>',
          'music <menu|battle|off>   shadows <off|medium|high>   grass <0-1>   post <on|off>',
          'bots — статус ботов           newbattle — начать битву заново',
        ].forEach((l) => this.print(l, '#d6d3bd'));
      },
      clear() { this.log.innerHTML = ''; },
      god(a) { g.tank.god = onoff(a[0], g.tank.god); this.ok('Бессмертие: ' + (g.tank.god ? 'ВКЛ' : 'ВЫКЛ')); },
      heal() { g.tank.hp = g.tank.maxHp; g.tank.immobT = 0; g.tank.gunDownT = 0; g.tank.reloadTimer = 0; this.ok('Танк восстановлен.'); },
      kill(a) {
        const w = (a[0] || '').toLowerCase(); let n = 0;
        if (w === 'me') { g.tank.destroy(true); n = 1; }
        else for (const t of g.allTanks()) {
          if (!t.alive || t === g.tank) continue;
          if (w === 'all' || (w === 'enemies' && t.team === 'B') || (w === 'allies' && t.team === 'A')) { t.destroy(true); n++; }
        }
        if (!w) return this.err('kill <me|enemies|allies|all>');
        this.ok(`Уничтожено: ${n}`);
      },
      spawn(a) {
        const team = teamOf(a[0]); if (!team) return this.err('spawn <enemy|ally> [n]');
        const n = Math.min(10, Math.max(1, Math.round(num(a[1], 1))));
        for (let i = 0; i < n; i++) g.spawnBot(team);
        this.ok(`Создано ботов: ${n}`);
      },
      removebots(a) {
        const w = (a[0] || 'all').toLowerCase(); const team = w === 'all' ? null : teamOf(w);
        this.ok(`Удалено: ${g.removeBots(team)}`);
      },
      hit(a) {
        const type = (a[0] || '').toLowerCase(), w = (a[1] || 'me').toLowerCase();
        if (!['tracks', 'gun', 'fuel', 'crit'].includes(type)) return this.err('hit <tracks|gun|fuel|crit> [me|enemies|allies]');
        const targets = w === 'me' ? [g.tank] : g.allTanks().filter((t) => t !== g.tank && t.alive && (w === 'all' || (w === 'enemies' && t.team === 'B') || (w === 'allies' && t.team === 'A')));
        for (const t of targets) g.hitTank(t, type);
        this.ok(`Применено к целям: ${targets.length}`);
      },
      tp(a) { const x = num(a[0], NaN), z = num(a[1], NaN); if (isNaN(x) || isNaN(z)) return this.err('tp <x> <z>'); g.tank.root.position.set(x, 0, z); g.tank.speed = 0; this.ok(`Телепорт: ${x}, ${z}`); },
      reload() { g.tank.reloadTimer = 0; g.tank.gunDownT = 0; this.ok('Орудие заряжено.'); },
      ai(a) { g.flags.ai = onoff(a[0], g.flags.ai); this.ok('ИИ ботов: ' + (g.flags.ai ? 'ВКЛ' : 'ВЫКЛ')); },
      timescale(a) { g.flags.timeScale = Math.min(3, Math.max(0.1, num(a[0], 1))); this.ok('Скорость игры: x' + g.flags.timeScale); },
      fps() { g.flags.fps = !g.flags.fps; g.showFps(g.flags.fps); },
      fov(a) { g.set('fov', Math.min(100, Math.max(40, num(a[0], 60)))); this.ok('FOV: ' + g.settings.fov); },
      sens(a) { g.set('sens', Math.min(4, Math.max(0.1, num(a[0], 1)))); this.ok('Чувствительность: ' + g.settings.sens); },
      vol(a) {
        const k = (a[0] || '').toLowerCase();
        if (!['master', 'music', 'sfx', 'engine'].includes(k)) return this.err('vol <master|music|sfx|engine> <0-1>');
        g.set(k, Math.min(1, Math.max(0, num(a[1], 0.5)))); this.ok(`${k}: ${g.settings[k]}`);
      },
      music(a) { const m = (a[0] || '').toLowerCase(); if (!['menu', 'battle', 'off'].includes(m)) return this.err('music <menu|battle|off>'); g.audio.music(m); this.ok('Музыка: ' + m); },
      shadows(a) { const m = (a[0] || '').toLowerCase(); if (!['off', 'medium', 'high'].includes(m)) return this.err('shadows <off|medium|high>'); g.set('shadows', m); this.ok('Тени: ' + m); },
      grass(a) { g.set('grass', Math.min(1, Math.max(0, num(a[0], 1)))); this.ok('Трава: ' + g.settings.grass); },
      post(a) { g.set('post', onoff(a[0], g.settings.post)); this.ok('Пост-обработка: ' + (g.settings.post ? 'ВКЛ' : 'ВЫКЛ')); },
      bots() {
        for (const t of g.allTanks()) if (t !== g.tank) this.print(`${t.name}  [${t.team}]  ${t.alive ? 'HP ' + Math.max(0, Math.round(t.hp)) : 'уничтожен'}${t.immobT > 0 ? '  гусеница' : ''}${t.gunDownT > 0 ? '  ствол' : ''}`, t.team === 'A' ? '#9fe39a' : '#ffb09a');
      },
      newbattle() { g.newBattle(); this.ok('Новая битва.'); },
      echo(a) { this.print(a.join(' ')); },
    };
  }
}
