import * as THREE from 'three';
import { createWorld, type GameWorld } from './world';
import { createCityWorld } from './city';
import { Tank } from './tank';
import { BallisticsSystem, G, DRAG_K, SUBSTEP } from './ballistics';
import { Bot, setMap } from './bots';
import { JuggernautBoss, BOSS_RAM_DISTANCE } from './boss';
import { settings, onSettings, setSetting, type GameSettings } from './settings';
import { audio } from './audio';
import { HitCam } from './hitcam';
import { GameConsole, type ConsoleGameAPI } from './console';
import { createUI } from './ui';
import { getSelectedTankId, DEFAULT_TANK_ID } from './tanks';
import { addSilver, computeKillReward, getSilver } from './economy';
import { DEFAULT_MODE_ID, evaluateMatchState, evaluateRoundState, getModeDef, sortScoreboardRows, type ScoreboardRow } from './modes';
import { resolveTankCollisionPair } from './collision';
import { recordPlayerDeath, recordPlayerHit, recordPlayerKill, recordPlayerShot } from './playerSkill';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const DEG = Math.PI / 180;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export function initGame(mountEl: HTMLElement): () => void {
  const isSoftwareGl = detectSoftwareGl();

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: isSoftwareGl,
  });
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mountEl.innerHTML = '';
  mountEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd2dde6);
  scene.fog = new THREE.Fog(0xcbd8e2, 450, 2600);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 4500);
  audio.setListener(camera);

  const MAPS = [
    {
      id: 'hills',
      name: 'Холмы',
      desc: 'Открытая местность: холмы, рощи, лощины и небольшой городок. Дальние дистанции, укрытия за рельефом.',
      build: createWorld,
    },
    {
      id: 'city',
      name: 'Город',
      desc: 'Разрушенный войной город: руины, обломки стен, воронки и трещины в асфальте. Серая мгла, тесные улицы, ближний бой.',
      build: createCityWorld,
    },
  ];

  let selectedMap = 'hills';
  let currentMap = 'hills';
  let world: GameWorld = createWorld(scene);
  setMap(world);

  const tank = new Tank(scene, world, {
    x: world.spawnPlayer.x,
    z: world.spawnPlayer.z,
    heading: 0,
    team: 'A',
    name: 'ВЫ (Т-55)',
    specId: getSelectedTankId(),
  });
  tank.isPlayer = true;

  const ballistics = new BallisticsSystem(scene, world);
  ballistics.addTarget(tank);

  const bots: Bot[] = [];
  let boss: JuggernautBoss | null = null;
  let jugVictoryT = 0;
  const tankIds = new Map<Tank, string>();
  let nextTankSeq = 1;
  const getTankId = (t: Tank) => {
    let id = tankIds.get(t);
    if (!id) {
      id = t.isPlayer ? 'player' : `bot_${nextTankSeq++}`;
      tankIds.set(t, id);
    }
    return id;
  };
  getTankId(tank);

  function syncBoss(want: boolean) {
    if (want && !boss) {
      boss = new JuggernautBoss(scene, world, ballistics);
      getTankId(boss.tank);
    } else if (!want && boss) {
      scene.remove(boss.tank.root);
      ballistics.targets = ballistics.targets.filter((t) => t !== boss!.tank);
      boss = null;
    }
  }

  function syncTeamRoster(teamSize: number, hasBoss = false) {
    syncBoss(hasBoss);
    const wantAllies = Math.max(0, teamSize - 1);
    const wantEnemies = hasBoss ? 0 : Math.max(1, teamSize);

    const removeExtra = (team: 'A' | 'B', keep: number) => {
      let seen = 0;
      for (let i = 0; i < bots.length; ) {
        if (bots[i].team !== team) {
          i++;
          continue;
        }
        seen++;
        if (seen > keep) {
          scene.remove(bots[i].tank.root);
          ballistics.targets = ballistics.targets.filter((t) => t !== bots[i].tank);
          bots.splice(i, 1);
        } else {
          i++;
        }
      }
    };

    removeExtra('A', wantAllies);
    removeExtra('B', wantEnemies);

    while (bots.filter((b) => b.team === 'A').length < wantAllies) {
      const idx = bots.filter((b) => b.team === 'A').length + 1;
      const b = new Bot(scene, world, ballistics, 'A', idx);
      getTankId(b.tank);
      bots.push(b);
    }
    while (bots.filter((b) => b.team === 'B').length < wantEnemies) {
      const idx = bots.filter((b) => b.team === 'B').length;
      const b = new Bot(scene, world, ballistics, 'B', idx);
      getTankId(b.tank);
      bots.push(b);
    }
  }

  syncTeamRoster(getModeDef(DEFAULT_MODE_ID).teamSize, !!getModeDef(DEFAULT_MODE_ID).boss);
  const allTanks = () => [tank, ...bots.map((b) => b.tank), ...(boss ? [boss.tank] : [])];
  const tanksOf = (team: 'A' | 'B') => allTanks().filter((t) => t.team === team);

  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let gradePass: ShaderPass | null = null;
  if (!isSoftwareGl) {
    try {
      const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.55, 1.0);
      composer.addPass(bloomPass);
      gradePass = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, sat: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform sampler2D tDiffuse; uniform float sat; uniform vec3 tint; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(mix(vec3(l), c.rgb, sat) * tint, c.a); }',
      });
      composer.addPass(gradePass);
      composer.addPass(new OutputPass());
    } catch {
      composer = null;
    }
  }

  const SNIPER_FOV = [14, 7, 3.5];
  const BINOC_FOV = [18, 9, 4.5];
  const flags = { ai: true, timeScale: 1, fps: false, svCheats: false };
  function enforceCheatsOff() {
    flags.svCheats = false;
    tank.god = false;
    flags.ai = true;
    flags.timeScale = 1;
  }
  let state: 'menu' | 'play' | 'pause' | 'matchEnd' = 'menu';
  let hangarOpen = false;
  let battleStarted = false;
  let currentModeId = DEFAULT_MODE_ID;
  let matchEnded = false;
  let teamAKills = 0;
  let teamBKills = 0;
  let teamARounds = 0;
  let teamBRounds = 0;
  let roundNum = 1;
  let roundPhase: 'active' | 'intermission' = 'active';
  let roundEndT = 0;
  let pendingRoundMatchWinner: { winner: 'A' | 'B'; victorySilver: number } | null = null;
  let spectating = false;
  let spectateIdx = 0;
  let spectateTarget: Tank | null = null;
  let simTime = 0;
  const ramCooldowns = new Map<string, number>();
  let matchSilverEarned = 0;
  let scoreboardOpen = false;
  let mode: 'third' | 'sniper' | 'binoc' = 'third';
  let zoomIdx = 0;
  let fovCur = 60;
  let camDist = 14;
  let ballComp = false;
  let kick = 0;
  let shake = 0;
  let locked = false;
  let fallback = false;
  let mouseDown = false;
  let kills = 0;
  let playerDeadT = 0;
  let msgT = 0;
  let menuAngle = 0;
  let consoleOpen = false;
  const keys: Record<string, boolean> = Object.create(null);
  const cam = { yaw: 0, pitch: 0.2 };
  const aim = { yaw: 0, elev: 0, point: new THREE.Vector3(), range: null as number | null };
  let binocFrozen = false;

  const hitcam = new HitCam($<HTMLCanvasElement>('hitcam'));

  function applyGraphics() {
    const sun = world.sun;
    const pr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2) * settings.resolution;
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    if (composer) {
      composer.setPixelRatio(pr);
      composer.setSize(innerWidth, innerHeight);
    }
    sun.castShadow = !isSoftwareGl && settings.shadows !== 'off';
    const ms = settings.shadows === 'high' ? 4096 : 2048;
    if (!isSoftwareGl && sun.shadow.mapSize.x !== ms) {
      sun.shadow.mapSize.set(ms, ms);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        (sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
      }
    }
    if (bloomPass) bloomPass.strength = settings.bloom;
    world.setGrass(settings.grass);
    const f = ({ low: 0.4, medium: 0.7, high: 1 } as const)[settings.drawDist] || 1;
    (scene.fog as THREE.Fog).far = world.fogFar * f;
    (scene.fog as THREE.Fog).near = world.fogNear * Math.min(1, f);
    $('vignette').style.display = settings.vignette ? 'block' : 'none';
    $('help').style.display = settings.hints ? 'block' : 'none';
    $('hitcam').dataset.on = settings.hitcam ? '1' : '0';
    if (!settings.hitcam) hitcam.hide();
    updateHelp();
    if (state !== 'menu') resizeScope();
  }

  function updateHelp() {
    const K = settings.keys;
    const n = (c: string) => (c || '').replace('Key', '').replace('Space', 'ПРОБЕЛ').replace('ShiftLeft', 'SHIFT').replace('Backquote', '~');
    $('help').innerHTML =
      `<b>${n(K.forward)}/${n(K.back)}</b> газ/реверс &nbsp; <b>${n(K.left)}/${n(K.right)}</b> поворот &nbsp; <b>${n(K.brake)}</b> тормоз<br>` +
      `<b>МЫШЬ</b> прицел &nbsp; <b>ЛКМ</b> огонь &nbsp; <b>${n(K.sniper)}</b> прицел &nbsp; <b>${n(K.binoc)}</b> бинокль &nbsp; <b>TAB</b> счёт<br>` +
      `<b>КОЛЕСО</b> зум &nbsp; <b>${n(K.comp)}</b> баллист. комп. &nbsp; <b>${n(K.console)}</b> консоль &nbsp; <b>ESC</b> пауза`;
  }

  const GFX_KEYS = new Set(['shadows', 'post', 'bloom', 'grass', 'drawDist', 'resolution', 'vignette', 'hitcam', 'hints', 'keys', '*']);
  const unsubSettings = onSettings((k) => {
    if (GFX_KEYS.has(k)) applyGraphics();
  });

  function applyMapLook() {
    world.createEnvironment(renderer);
    (scene.background as THREE.Color).setHex(world.background);
    (scene.fog as THREE.Fog).color.setHex(world.fogColor);
    renderer.toneMappingExposure = world.exposure;
    if (gradePass) {
      gradePass.uniforms.sat.value = world.grade.sat;
      gradePass.uniforms.tint.value.set(...world.grade.tint);
    }
  }

  function loadMap(id: string) {
    const def = MAPS.find((x) => x.id === id);
    if (!def || id === currentMap) {
      selectedMap = id;
      return;
    }
    const old = world;
    world = def.build(scene);
    currentMap = selectedMap = id;
    setMap(world);
    ballistics.setWorld(world);
    tank.world = world;
    for (const b of bots) {
      b.world = world;
      b.tank.world = world;
    }
    if (boss) {
      boss.world = world;
      boss.tank.world = world;
    }
    old.dispose();
    applyMapLook();
    applyGraphics();
    tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, getSelectedTankId());
    for (const b of bots) b.respawn();
    if (boss) boss.respawn();
    battleStarted = false;
  }

  function updateModeScoreHud() {
    const activeMode = getModeDef(currentModeId);
    $('alive').textContent = tanksOf('A').filter((t) => t.alive).length + ' v ' + tanksOf('B').filter((t) => t.alive).length;
    if (activeMode.roundsToWin > 0) {
      $('modeTitleHud').textContent = `${activeMode.name.toUpperCase()} · РАУНД ${roundNum}`;
      $('teamAKills').textContent = String(teamARounds);
      $('teamBKills').textContent = String(teamBRounds);
      $('modeGoalHud').textContent = `/ ${activeMode.roundsToWin}`;
    } else if (activeMode.boss) {
      $('modeTitleHud').textContent = activeMode.name.toUpperCase();
      $('teamAKills').textContent = String(teamAKills);
      $('teamBKills').textContent = String(teamBKills);
      $('modeGoalHud').textContent = '· УНИЧТОЖЬТЕ МАУСА';
    } else if (activeMode.targetKills > 0) {
      $('modeTitleHud').textContent = activeMode.name.toUpperCase();
      $('teamAKills').textContent = String(teamAKills);
      $('teamBKills').textContent = String(teamBKills);
      $('modeGoalHud').textContent = `/ ${activeMode.targetKills}`;
    } else {
      $('modeTitleHud').textContent = activeMode.name.toUpperCase();
      $('teamAKills').textContent = String(teamAKills);
      $('teamBKills').textContent = String(teamBKills);
      $('modeGoalHud').textContent = '· СВОБОДНЫЙ БОЙ';
    }
  }

  function showRoundBanner(text: string | null, color = '#ffd27a') {
    const elB = $('roundBanner');
    if (!text) {
      elB.classList.add('hidden');
      return;
    }
    elB.textContent = text;
    elB.style.color = color;
    elB.classList.remove('hidden');
  }

  function startRound(isFirstRound: boolean) {
    const chosenTankId = getSelectedTankId();
    ballistics.clear();
    ramCooldowns.clear();
    tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, chosenTankId);
    tank.name = `ВЫ (${tank.spec.name})`;
    if (isFirstRound) {
      tank.matchKills = 0;
      tank.matchDeaths = 0;
    }
    $('mv').textContent = String(tank.stats.muzzleVelocity);
    if (boss) {
      boss.respawn();
      boss.tank.matchKills = 0;
      boss.tank.matchDeaths = 0;
    }
    jugVictoryT = 0;
    $('victoryBanner').classList.add('hidden');
    for (const b of bots) {
      b.respawn();
      if (isFirstRound) {
        b.tank.matchKills = 0;
        b.tank.matchDeaths = 0;
      }
    }
    spectating = false;
    spectateTarget = null;
    spectateIdx = 0;
    $('spectatorBar').classList.add('hidden');
    playerDeadT = 0;
    $('dead').style.display = 'none';
    aim.yaw = 0;
    aim.elev = 0;
    cam.yaw = 0;
    cam.pitch = 0.2;
    mode = 'third';
    fovCur = settings.fov;
    binocFrozen = false;
    hitcam.hide();
    roundPhase = 'active';
    roundEndT = 0;
    pendingRoundMatchWinner = null;
    showRoundBanner(null);
    msgT = 0;
    $('msg').style.opacity = '0';
    $('msg').textContent = '';
    updateModeScoreHud();
    const activeMode = getModeDef(currentModeId);
    if (activeMode.roundsToWin > 0) {
      showMsg(`РАУНД ${roundNum}`, '#ffd27a');
    }
  }

  function newBattle() {
    const activeMode = getModeDef(currentModeId);
    syncTeamRoster(activeMode.teamSize, !!activeMode.boss);
    if (!activeMode.allowCheats || !flags.svCheats) {
      enforceCheatsOff();
    }
    kills = 0;
    teamAKills = 0;
    teamBKills = 0;
    teamARounds = 0;
    teamBRounds = 0;
    roundNum = 1;
    matchSilverEarned = 0;
    matchEnded = false;
    setScoreboardOpen(false);
    $('silverToasts').innerHTML = '';
    $('feed').innerHTML = '';
    startRound(true);
    battleStarted = true;
  }

  function spawnBot(team: 'A' | 'B') {
    const idx = bots.filter((b) => b.team === team).length + (team === 'A' ? 1 : 0);
    const b = new Bot(scene, world, ballistics, team, idx);
    getTankId(b.tank);
    const fwd = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
    const base =
      team === 'A'
        ? tank.root.position.clone().addScaledVector(fwd, -12)
        : aim.range
          ? aim.point.clone()
          : tank.root.position.clone().addScaledVector(fwd, 80);
    b.tank.reset(
      clamp(base.x + (Math.random() - 0.5) * 30, -450, 450),
      clamp(base.z + (Math.random() - 0.5) * 30, -450, 450),
      team === 'A' ? cam.yaw : cam.yaw + Math.PI,
      DEFAULT_TANK_ID,
    );
    bots.push(b);
  }

  function removeBots(team: 'A' | 'B' | null) {
    let n = 0;
    for (let i = bots.length - 1; i >= 0; i--) {
      if (team && bots[i].team !== team) continue;
      scene.remove(bots[i].tank.root);
      ballistics.targets = ballistics.targets.filter((t) => t !== bots[i].tank);
      bots.splice(i, 1);
      n++;
    }
    return n;
  }

  function hitTank(t: Tank, type: string) {
    if (type === 'tracks') t.immobilize(10);
    else if (type === 'gun') t.disableGun(10);
    else if (type === 'fuel' || type === 'crit') {
      t.destroy(true);
      const p = t.root.position;
      ballistics.fx.emit({ additive: true, x: p.x, y: p.y + 2, z: p.z, life: 0.8, s0: 10, s1: 30, r: 1, g: 0.6, b: 0.2, a: 1 });
      audio.play(type === 'fuel' ? 'fuelExplosion' : 'bigexplosion', p);
    }
  }

  const game: ConsoleGameAPI = {
    get tank() {
      return tank;
    },
    get bots() {
      return bots;
    },
    get world() {
      return world;
    },
    ballistics,
    flags,
    audio,
    settings,
    allTanks,
    spawnBot,
    removeBots,
    hitTank,
    newBattle,
    consoleKey: () => settings.keys.console,
    set: (k: keyof GameSettings, v: unknown) => setSetting(k, v as never),
    showFps: (on: boolean) => {
      $('fps').style.display = on ? 'block' : 'none';
    },
    onConsole: (open: boolean) => {
      consoleOpen = open;
      if (open) {
        for (const k in keys) keys[k] = false;
        mouseDown = false;
        if (document.pointerLockElement) document.exitPointerLock();
      } else if (state === 'play') {
        tryLock();
        setTimeout(() => {
          if (state === 'play' && !locked && !consoleOpen) tryLock();
        }, 120);
      }
    },
    canOpen: () => state !== 'menu' && getModeDef(currentModeId).allowConsole,
    allowCheats: () => getModeDef(currentModeId).allowCheats,
    enforceCheatsOff,
  };
  const gcon = new GameConsole($('console'), game);

  let lockTries = 0;
  let everLocked = false;
  let lockTimer: ReturnType<typeof setTimeout> | undefined;

  function tryLock() {
    if (isSoftwareGl || fallback) {
      locked = true;
      return;
    }
    const el = renderer.domElement;
    if (!el.requestPointerLock) {
      enableFallback();
      return;
    }
    clearTimeout(lockTimer);
    try {
      const r = el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && r.catch) r.catch(() => {});
    } catch {
      // retried via pointerlockerror
    }
  }
  function enableFallback() {
    fallback = true;
    locked = true;
  }

  function startPlay(fresh: boolean) {
    audio.init();
    audio.resume();
    if (fresh || !battleStarted || matchEnded) newBattle();
    state = 'play';
    hangarOpen = false;
    document.body.className = 'play';
    document.body.dataset.state = 'playing';
    ui.show(null);
    audio.music('off');
    resizeScope();
    applyGraphics();
    tryLock();
  }

  function openPause() {
    if (state !== 'play') return;
    state = 'pause';
    setScoreboardOpen(false);
    mouseDown = false;
    locked = false;
    for (const k in keys) keys[k] = false;
    audio.engineSilence();
    document.body.dataset.state = 'paused';
    ui.show('pause');
  }

  function resumeGame() {
    if (matchEnded) return;
    state = 'play';
    document.body.dataset.state = 'playing';
    ui.show(null);
    tryLock();
  }

  function toMenu() {
    const wasMatchEnded = matchEnded;
    state = 'menu';
    if (gcon.open) gcon.close();
    setScoreboardOpen(false);
    if (wasMatchEnded) {
      matchEnded = false;
      battleStarted = false;
      roundPhase = 'active';
      roundEndT = 0;
      pendingRoundMatchWinner = null;
      showRoundBanner(null);
      jugVictoryT = 0;
      $('victoryBanner').classList.add('hidden');
      $('bossBar').classList.add('hidden');
      spectating = false;
      spectateTarget = null;
      spectateIdx = 0;
      $('spectatorBar').classList.add('hidden');
      $('dead').style.display = 'none';
      $('msg').style.opacity = '0';
      $('msg').textContent = '';
      hitcam.hide();
      ballistics.clear();
      tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, getSelectedTankId());
      tank.name = `ВЫ (${tank.spec.name})`;
      for (const b of bots) b.respawn();
      if (boss) boss.respawn();
      mode = 'third';
      fovCur = settings.fov;
      menuAngle = 0;
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
    if (!getModeDef(currentModeId).allowCheats) enforceCheatsOff();
    document.body.className = 'menu';
    document.body.dataset.state = 'title';
    mouseDown = false;
    if (document.pointerLockElement) document.exitPointerLock();
    fallback = false;
    locked = false;
    audio.engineSilence();
    audio.music('menu');
    tank.root.visible = true;
    ui.show('main');
  }

  const ui = createUI({
    play: startPlay,
    resume: resumeGame,
    toMenu,
    started: () => battleStarted,
    maps: MAPS,
    getMap: () => selectedMap,
    setMap: (id: string) => loadMap(id),
    getModeId: () => currentModeId,
    setModeId: (id: string) => {
      const def = getModeDef(id);
      currentModeId = def.id;
      if (!def.allowCheats) enforceCheatsOff();
      if (gcon.open) gcon.close();
      battleStarted = false;
      matchEnded = false;
      syncTeamRoster(def.teamSize, !!def.boss);
      updateHelp();
    },
    onSelectTank: (tankId: string) => {
      if (!battleStarted) {
        tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, tankId);
        tank.name = `ВЫ (${tank.spec.name})`;
      }
    },
    onPreviewTank: (tankId: string) => {
      if (!battleStarted) {
        tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, tankId);
        tank.name = `ВЫ (${tank.spec.name})`;
      }
    },
    onHangarToggle: (open: boolean) => {
      hangarOpen = open;
      if (open) {
        menuAngle = 0.58;
      } else if (!battleStarted) {
        tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, getSelectedTankId());
        tank.name = `ВЫ (${tank.spec.name})`;
      }
    },
  });

  document.body.dataset.state = 'title';
  ui.show('main');

  const unlockMenuMusic = () => {
    if (audio.init() && state === 'menu') audio.music('menu');
  };
  addEventListener('pointerdown', unlockMenuMusic, { once: true });

  const onPointerLockChange = () => {
    locked = document.pointerLockElement === renderer.domElement;
    if (locked) {
      everLocked = true;
      lockTries = 0;
      clearTimeout(lockTimer);
    }
    if (!locked && state === 'play' && !consoleOpen && !fallback && !isSoftwareGl) openPause();
  };
  const onPointerLockError = () => {
    if (state !== 'play' || consoleOpen) return;
    if (++lockTries > 8 && !everLocked) {
      enableFallback();
      return;
    }
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => {
      if (state === 'play' && !locked && !consoleOpen) tryLock();
    }, 350);
  };
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', onPointerLockError);

  function getAliveAllies(): Tank[] {
    return tanksOf('A').filter((t) => t.alive && t !== tank);
  }

  function cycleSpectateTarget(step: number) {
    const allies = getAliveAllies();
    if (allies.length === 0) {
      spectateTarget = null;
      return;
    }
    spectateIdx = (((spectateIdx + step) % allies.length) + allies.length) % allies.length;
    spectateTarget = allies[spectateIdx];
    $('specTargetName').textContent = spectateTarget.name;
    $('specTargetHp').textContent = `(${Math.max(0, Math.round(spectateTarget.hp))}/${spectateTarget.maxHp} ХП)`;
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (ui.rebinding) return;
    const K = settings.keys;
    if (e.code === K.console && state !== 'menu') {
      e.preventDefault();
      gcon.toggle();
      return;
    }
    if (consoleOpen) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
      if (state === 'play') e.preventDefault();
    }
    if (e.code === 'Tab') {
      if (state === 'play' && !matchEnded) {
        setScoreboardOpen(true);
      }
      return;
    }
    if (e.code === 'Escape') {
      if (state === 'play' && (fallback || isSoftwareGl)) openPause();
      else if (state === 'pause') resumeGame();
      else if (state === 'menu' && hangarOpen) ui.show('main');
      return;
    }
    if (state !== 'play') return;
    if (!locked && !fallback) tryLock();
    keys[e.code] = true;
    if (e.repeat) return;
    if (spectating) {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') cycleSpectateTarget(1);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') cycleSpectateTarget(-1);
      return;
    }
    if (e.code === K.sniper || (K.sniper === 'ShiftLeft' && e.code === 'ShiftRight')) setMode(mode === 'sniper' ? 'third' : 'sniper');
    else if (e.code === K.binoc) setMode(mode === 'binoc' ? 'third' : 'binoc');
    else if (e.code === K.comp) ballComp = !ballComp;
    else if (e.code === K.post) setSetting('post', !settings.post);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
    if (e.code === 'Tab') setScoreboardOpen(false);
  };
  const onBlur = () => {
    for (const k in keys) keys[k] = false;
    mouseDown = false;
    setScoreboardOpen(false);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!locked || state !== 'play') return;
    const s = 0.0022 * clamp(fovCur / 60, 0.06, 1) * settings.sens * (mode === 'third' || spectating ? 1 : settings.sensSniper);
    cam.yaw -= e.movementX * s;
    cam.pitch -= e.movementY * s * (settings.invertY ? -1 : 1);
  };
  const onMouseDown = (e: MouseEvent) => {
    if (state !== 'play' || consoleOpen) return;
    if (!locked) {
      tryLock();
      return;
    }
    if (spectating) {
      if (e.button === 0) cycleSpectateTarget(-1);
      else if (e.button === 2) cycleSpectateTarget(1);
      return;
    }
    if (e.button !== 0) return;
    if (mode === 'binoc') {
      snapTurretToView();
      setMode('third');
      return;
    }
    mouseDown = true;
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = false;
  };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  const onWheel = (e: WheelEvent) => {
    if (state !== 'play' || consoleOpen) return;
    const dir = Math.sign(e.deltaY);
    if (mode === 'third') camDist = clamp(camDist * (dir > 0 ? 1.1 : 0.9), 7, 32);
    else {
      const n = (mode === 'sniper' ? SNIPER_FOV : BINOC_FOV).length;
      zoomIdx = clamp(zoomIdx + (dir < 0 ? 1 : -1), 0, n - 1);
    }
  };

  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);
  addEventListener('mousemove', onMouseMove);
  addEventListener('mousedown', onMouseDown);
  addEventListener('mouseup', onMouseUp);
  addEventListener('contextmenu', onContextMenu);
  addEventListener('wheel', onWheel, { passive: true });

  function setMode(m: 'third' | 'sniper' | 'binoc') {
    if (m === mode) return;
    mode = m;
    zoomIdx = 0;
    binocFrozen = m === 'binoc';
  }
  function snapTurretToView() {
    binocFrozen = false;
    computeAim(true);
  }

  const _dir = new THREE.Vector3();
  const _rdir = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _g = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const camOrigin = new THREE.Vector3();

  function lookDir(out: THREE.Vector3, yaw: number, pitch: number) {
    const cp = Math.cos(pitch);
    return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
  }
  function dropAngle(range: number) {
    const t = range / (tank.stats.muzzleVelocity * 0.97);
    return Math.atan2(0.5 * G * t * t, range);
  }

  function computeAim(force: boolean) {
    if (binocFrozen && !force) return;
    const hit = world.raycast(camOrigin, _dir, 2500);
    const p = aim.point;
    if (hit) p.copy(hit.point);
    else p.copy(camOrigin).addScaledVector(_dir, 2500);
    tank.gunPivotWorld(_g);
    _t.subVectors(p, _g);
    const horiz = Math.hypot(_t.x, _t.z);
    const range = _t.length();
    aim.range = hit ? range : null;
    if (horiz > 3) {
      aim.yaw = Math.atan2(_t.x, _t.z);
      aim.elev = Math.atan2(_t.y, horiz) + (ballComp ? dropAngle(range) : 0);
    }
  }

  function updateCamera(dt: number) {
    const activeCamMode = spectating ? 'third' : mode;
    const fovTarget = activeCamMode === 'third' ? settings.fov : (activeCamMode === 'sniper' ? SNIPER_FOV : BINOC_FOV)[zoomIdx];
    fovCur += (fovTarget - fovCur) * Math.min(1, dt * 10);
    if (Math.abs(camera.fov - fovCur) > 1e-3) {
      camera.fov = fovCur;
      camera.updateProjectionMatrix();
    }

    const lo = activeCamMode === 'third' ? -0.4 : -0.5;
    const hi = activeCamMode === 'third' ? 1.2 : activeCamMode === 'sniper' ? 0.6 : 1.2;
    cam.pitch = clamp(cam.pitch, lo, hi);
    if (cam.yaw > Math.PI) cam.yaw -= Math.PI * 2;
    else if (cam.yaw < -Math.PI) cam.yaw += Math.PI * 2;
    lookDir(_dir, cam.yaw, cam.pitch);

    if (spectating && spectateTarget) {
      _pos.copy(spectateTarget.root.position);
      _pos.y += 2.8;
      camOrigin.copy(_pos).addScaledVector(_dir, -camDist);
      camOrigin.y += 1.4;
      const gy = world.heightAt(camOrigin.x, camOrigin.z) + 1.5;
      if (camOrigin.y < gy) camOrigin.y = gy;
      tank.root.visible = true;
    } else if (activeCamMode === 'third') {
      _pos.copy(tank.root.position);
      _pos.y += 2.8;
      camOrigin.copy(_pos).addScaledVector(_dir, -camDist);
      camOrigin.y += 1.4;
      const gy = world.heightAt(camOrigin.x, camOrigin.z) + 1.5;
      if (camOrigin.y < gy) camOrigin.y = gy;
      tank.root.visible = true;
    } else if (activeCamMode === 'sniper') {
      tank.sightWorld(camOrigin);
      tank.root.visible = false;
    } else {
      tank.binocWorld(camOrigin);
      camOrigin.y += 0.5;
      tank.root.visible = true;
    }

    if (!spectating) computeAim(false);

    lookDir(_rdir, cam.yaw, cam.pitch + kick);
    camera.position.copy(camOrigin);
    if (activeCamMode === 'third' && shake > 0.001) {
      camera.position.add(_t.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake));
    }
    camera.lookAt(camera.position.x + _rdir.x, camera.position.y + _rdir.y, camera.position.z + _rdir.z);
    kick *= Math.exp(-6 * dt);
    shake *= Math.exp(-8 * dt);
  }

  function menuCamera(dt: number) {
    menuAngle += dt * (hangarOpen ? 0.22 : 0.12);
    const p = tank.root.position;
    const dist = hangarOpen ? 12.2 : 17;
    const height = hangarOpen ? 3.8 : 5.5 + Math.sin(menuAngle * 0.7) * 1.2;
    const targetFov = hangarOpen ? 44 : 50;
    camera.fov += (targetFov - camera.fov) * 0.1;
    camera.updateProjectionMatrix();
    camera.position.set(p.x + Math.sin(menuAngle) * dist, p.y + height, p.z + Math.cos(menuAngle) * dist);
    camera.lookAt(p.x, p.y + (hangarOpen ? 1.65 : 2.2), p.z);
    tank.root.visible = true;
  }

  const scopeCv = $<HTMLCanvasElement>('scope');
  const sctx = scopeCv.getContext('2d')!;
  function resizeScope() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scopeCv.width = innerWidth * dpr;
    scopeCv.height = innerHeight * dpr;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeScope();

  function drawScope() {
    const W = innerWidth;
    const H = innerHeight;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.47;
    const g = sctx;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#000';
    g.beginPath();
    g.rect(0, 0, W, H);
    g.arc(cx, cy, R, 0, Math.PI * 2, true);
    g.fill('evenodd');
    const grad = g.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();

    const pxMil = H / (2 * Math.tan((fovCur * Math.PI) / 360)) / 1000;
    g.strokeStyle = 'rgba(0,0,0,0.92)';
    g.fillStyle = 'rgba(0,0,0,0.92)';
    g.lineWidth = 1.5;
    const line = (x1: number, y1: number, x2: number, y2: number) => {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    };
    const gap = 7;
    line(cx - R, cy, cx - gap, cy);
    line(cx + gap, cy, cx + R, cy);
    line(cx, cy - R, cx, cy - gap);
    line(cx, cy + gap, cx, cy + R);
    g.beginPath();
    g.arc(cx, cy, 1.6, 0, Math.PI * 2);
    g.fill();

    const step = pxMil >= 8 ? 1 : 5;
    const maxMil = Math.floor((R * 0.97) / pxMil);
    g.font = '11px Consolas, monospace';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (let m = step; m <= maxMil; m += step) {
      const major = m % 10 === 0;
      const len = major ? 9 : 5;
      const d = m * pxMil;
      for (const s of [-1, 1]) {
        line(cx + s * d, cy - len, cx + s * d, cy + len);
        line(cx - len, cy + s * d, cx + len, cy + s * d);
      }
      if (major) {
        g.fillText(String(m), cx + d + 3, cy - 12);
        g.fillText(String(m), cx + 14, cy + d);
      }
    }
    g.lineWidth = 2;
    line(cx - 14, cy + 5 * pxMil, cx + 14, cy + 5 * pxMil);
    g.lineWidth = 1.5;

    const rx = cx;
    const ry = cy + R * 0.88;
    const rr = 17;
    const frac = tank.reloadFraction;
    const broken = tank.gunDownT > 0;
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.arc(rx, ry, rr, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = broken ? '#ff4a3a' : tank.ready ? '#8fe36a' : '#ffb43c';
    g.beginPath();
    g.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (broken ? 1 : frac));
    g.stroke();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.fillText(broken ? Math.ceil(tank.gunDownT) + 'с' : tank.ready ? 'ГОТОВ' : tank.reloadTimer.toFixed(1), rx, ry);
    g.textAlign = 'left';
    g.fillStyle = '#ffd27a';
    g.font = '13px Consolas, monospace';
    g.fillText(mode === 'sniper' ? 'ПРИЦЕЛ НАВОДЧИКА' : 'БИНОКЛЬ', cx - R + 14, cy - R * 0.9 + 40);
  }

  const el = {
    speed: $('speed'),
    gear: $('gear'),
    hull: $('hullBrg'),
    tur: $('turBrg'),
    range: $('range'),
    zoom: $('zoom'),
    comp: $('comp'),
    mode: $('modeLabel'),
    ring: $('reloadRing'),
    rtxt: $('reloadTxt'),
    cross: $('crosshair'),
    gun: $('gunMark'),
    mv: $('mv'),
    hp: $('hpFill'),
    kills: $('kills'),
    alive: $('alive'),
    dmg: $('dmgStat'),
    fps: $('fps'),
    tankTag: $('tankTag'),
  };
  el.mv.textContent = String(tank.stats.muzzleVelocity);
  if (el.tankTag) el.tankTag.textContent = tank.spec.name;
  const bearing = (rad: number) => String(Math.round((((-rad / DEG) % 360) + 360) % 360)).padStart(3, '0');
  const _gm = new THREE.Vector3();
  const _gd = new THREE.Vector3();
  const _pr = new THREE.Vector3();
  let fpsAcc = 0;
  let fpsN = 0;

  const _ip = new THREE.Vector3();
  const _iv = new THREE.Vector3();
  const _ip2 = new THREE.Vector3();
  function predictImpact(): THREE.Vector3 {
    _ip.copy(_gm);
    _iv.copy(_gd).multiplyScalar(tank.stats.muzzleVelocity);
    const h = SUBSTEP;
    let dist = 0;
    const maxR = tank.stats.maxRange;
    for (let i = 0; i < 480; i++) {
      _ip2.copy(_ip);
      const sp = _iv.length();
      _iv.multiplyScalar(Math.max(0, 1 - DRAG_K * sp * h));
      _iv.y -= G * h;
      _ip.addScaledVector(_iv, h);
      dist += sp * h;
      const hit = world.segmentHit(_ip2, _ip);
      if (hit) return hit.point;
      if (dist >= maxR) return _ip;
      if (Math.abs(_ip.x) > 700 || Math.abs(_ip.z) > 700 || _ip.y < -60) break;
    }
    return _ip;
  }

  function updateHud(dt: number) {
    const v = Math.abs(tank.speed);
    const thr = (keys[settings.keys.forward] ? 1 : 0) - (keys[settings.keys.back] ? 1 : 0);
    el.speed.textContent = String(Math.round(v * 3.6));
    el.gear.textContent =
      tank.speed < -0.4 || (v < 0.4 && thr < 0) ? 'R' : v < 0.4 && thr === 0 ? 'N' : v < 3.5 ? '1' : v < 7 ? '2' : v < 10.5 ? '3' : '4';
    el.hull.textContent = bearing(tank.heading);
    el.tur.textContent = bearing(tank.turretWorldYaw);
    el.range.textContent = aim.range ? Math.round(aim.range) + ' м' : '---';
    el.zoom.textContent = 'x' + (mode === 'third' ? 1 : 60 / fovCur).toFixed(1);
    el.comp.textContent = ballComp ? 'ВКЛ' : 'ВЫКЛ';
    el.mode.textContent =
      mode === 'third'
        ? 'ОТ ТРЕТЬЕГО ЛИЦА'
        : mode === 'sniper'
          ? 'ПРИЦЕЛ НАВОДЧИКА'
          : binocFrozen
            ? 'БИНОКЛЬ - КЛИК: НАВЕСТИ БАШНЮ'
            : 'БИНОКЛЬ';
    const broken = tank.gunDownT > 0;
    el.ring.style.setProperty('--p', String(Math.round(tank.reloadFraction * 100)));
    el.ring.classList.toggle('loading', !tank.ready && !broken);
    el.ring.classList.toggle('broken', broken);
    el.rtxt.textContent = broken ? Math.ceil(tank.gunDownT) + 'с' : tank.ready ? 'ГОТОВ' : tank.reloadTimer.toFixed(1);

    const hpPct = Math.max(0, Math.min(100, (tank.hp / tank.maxHp) * 100));
    el.hp.style.width = hpPct + '%';
    el.hp.style.background = hpPct > 60 ? '#8fe36a' : hpPct > 30 ? '#ffb43c' : '#ff4a3a';
    if (el.tankTag) el.tankTag.textContent = `${tank.spec.name} · ${Math.max(0, Math.round(tank.hp))}/${tank.maxHp}`;

    const bossBar = $('bossBar');
    if (boss && !matchEnded) {
      bossBar.classList.remove('hidden');
      const pct = Math.max(0, Math.min(100, (boss.tank.hp / boss.tank.maxHp) * 100));
      $('bossFill').style.width = pct + '%';
      $('bossHpText').textContent = `${Math.max(0, Math.ceil(boss.tank.hp))} / ${boss.tank.maxHp}`;
    } else {
      bossBar.classList.add('hidden');
    }

    el.kills.textContent = String(kills);
    el.alive.textContent = tanksOf('A').filter((t) => t.alive).length + ' v ' + tanksOf('B').filter((t) => t.alive).length;
    let d = '';
    if (tank.immobT > 0) d += `ГУСЕНИЦА ПОВРЕЖДЕНА: ремонт ${Math.ceil(tank.immobT)} с<br>`;
    if (tank.gunDownT > 0) d += `СТВОЛ ПОВРЕЖДЁН: ремонт ${Math.ceil(tank.gunDownT)} с`;
    el.dmg.innerHTML = d;

    if (flags.fps) {
      fpsAcc += dt;
      fpsN++;
      if (fpsAcc > 0.5) {
        el.fps.textContent = Math.round(fpsN / fpsAcc) + ' FPS';
        fpsAcc = 0;
        fpsN = 0;
      }
    }

    el.cross.style.display = !spectating && mode === 'third' ? 'block' : 'none';
    const scoped = !spectating && mode !== 'third';
    scopeCv.style.display = scoped ? 'block' : 'none';
    if (scoped) drawScope();

    if (spectating) {
      el.gun.style.display = 'none';
      return;
    }

    tank.muzzleWorld(_gm);
    tank.gunDirection(_gd);
    const impact = predictImpact();
    _pr.copy(impact).project(camera);
    if (_pr.z > 1 || _pr.z < -1) el.gun.style.display = 'none';
    else {
      el.gun.style.display = 'block';
      const sz = mode === 'third' ? 18 : 14;
      el.gun.style.width = el.gun.style.height = sz + 'px';
      el.gun.style.marginLeft = el.gun.style.marginTop = -sz / 2 + 'px';
      el.gun.style.left = (_pr.x * 0.5 + 0.5) * innerWidth + 'px';
      el.gun.style.top = (-_pr.y * 0.5 + 0.5) * innerHeight + 'px';
    }
  }

  const feedEl = $('feed');
  const msgEl = $('msg');
  const deadEl = $('dead');
  function feed(text: string, cls: string) {
    const d = document.createElement('div');
    d.textContent = text;
    d.className = cls || '';
    feedEl.prepend(d);
    while (feedEl.children.length > 5) feedEl.lastChild?.remove();
    setTimeout(() => d.remove(), 9000);
  }
  function showMsg(text: string, color: string) {
    msgEl.textContent = text;
    msgEl.style.color = color || '#fff';
    msgEl.style.opacity = '1';
    msgT = 2.0;
  }

  const RESULT_TXT: Record<string, string> = {
    pen: 'ПОПАДАНИЕ',
    crit: 'КРИТИЧЕСКОЕ ПОПАДАНИЕ',
    nopen: 'НЕ ПРОБИЛ (БРОНЯ)',
    ricochet: 'РИКОШЕТ',
    track: 'ГУСЕНИЦА ПОВРЕЖДЕНА',
    barrel: 'СТВОЛ ПОВРЕЖДЁН',
    fuel: 'КРИТИЧЕСКОЕ ПОПАДАНИЕ: БЕНЗОБАК!',
  };
  const RESULT_COL: Record<string, string> = {
    pen: '#ffd27a',
    crit: '#ff6a4a',
    nopen: '#cfd6dd',
    ricochet: '#cfd6dd',
    track: '#ffd27a',
    barrel: '#ffd27a',
    fuel: '#ff4c2a',
  };

  const silverToastsEl = $('silverToasts');
  const scoreboardEl = $('scoreboard');

  function showSilverToast(amount: number, text: string, isBonus = false) {
    const item = document.createElement('div');
    item.className = 'silver-toast' + (isBonus ? ' bonus' : '');
    const amt = document.createElement('span');
    amt.className = 'st-amt';
    amt.textContent = `+${amount} СЕРЕБРА`;
    const msg = document.createElement('span');
    msg.className = 'st-msg';
    msg.textContent = text;
    item.append(amt, msg);
    silverToastsEl.prepend(item);
    while (silverToastsEl.children.length > 4) silverToastsEl.lastChild?.remove();
    setTimeout(() => item.remove(), 4200);
  }

  function renderScoreboard() {
    const activeMode = getModeDef(currentModeId);
    $('sbModeName').textContent = activeMode.name.toUpperCase();
    if (activeMode.roundsToWin > 0) {
      $('sbTeamScore').textContent = `РАУНД ${roundNum} · МЫ ${teamARounds} : ${teamBRounds} ВРАГИ (до ${activeMode.roundsToWin})`;
    } else if (activeMode.targetKills > 0) {
      $('sbTeamScore').textContent = `МЫ ${teamAKills} : ${teamBKills} ВРАГИ (цель: ${activeMode.targetKills})`;
    } else if (activeMode.boss) {
      $('sbTeamScore').textContent = boss ? `МАУС: ${Math.max(0, Math.round(boss.tank.hp))} / ${boss.tank.maxHp} ХП` : '';
    } else {
      $('sbTeamScore').textContent = `МЫ ${teamAKills} : ${teamBKills} ВРАГИ (тренировка)`;
    }

    const rows: ScoreboardRow[] = allTanks().map((t) => ({
      name: t.name,
      team: t.team,
      tankName: t.spec.name,
      kills: t.matchKills,
      deaths: t.matchDeaths,
      isPlayer: t.isPlayer,
      alive: t.alive,
    }));

    const fillTeam = (containerId: string, team: 'A' | 'B') => {
      const box = $(containerId);
      box.innerHTML = '';
      const sorted = sortScoreboardRows(rows.filter((r) => r.team === team));
      for (const r of sorted) {
        const row = document.createElement('div');
        row.className = 'sb-row' + (r.isPlayer ? ' me' : '') + (r.alive ? '' : ' dead');
        row.innerHTML = `
          <span class="sb-name">${r.name}</span>
          <span class="sb-tank">${r.tankName}</span>
          <span class="sb-kd">${r.kills} / ${r.deaths}</span>
        `;
        box.appendChild(row);
      }
    };
    fillTeam('sbTeamA', 'A');
    fillTeam('sbTeamB', 'B');
  }

  function setScoreboardOpen(open: boolean) {
    scoreboardOpen = open;
    scoreboardEl.classList.toggle('hidden', !open);
    if (open) renderScoreboard();
  }

  function finishMatch(winner: 'A' | 'B', victorySilver: number) {
    if (matchEnded) return;
    matchEnded = true;
    state = 'matchEnd';
    if (gcon.open) gcon.close();
    spectating = false;
    $('spectatorBar').classList.add('hidden');
    deadEl.style.display = 'none';
    showRoundBanner(null);
    setScoreboardOpen(false);
    mouseDown = false;
    locked = false;
    for (const k in keys) keys[k] = false;
    if (document.pointerLockElement) document.exitPointerLock();
    audio.engineSilence();
    if (victorySilver > 0) {
      addSilver(victorySilver);
      matchSilverEarned += victorySilver;
      ui.refreshSilver();
      audio.ui('victory');
    }
    const activeMode = getModeDef(currentModeId);
    const isRounds = activeMode.roundsToWin > 0;
    msgEl.style.opacity = '0';
    msgEl.textContent = '';
    el.kills.textContent = String(kills);
    document.body.dataset.state = 'matchEnd';
    ui.showMatchEnd({
      won: winner === 'A',
      modeName: activeMode.name,
      scoreLabel: isRounds ? 'Счёт раундов' : 'Счёт команд',
      teamAScore: isRounds ? teamARounds : teamAKills,
      teamBScore: isRounds ? teamBRounds : teamBKills,
      targetGoal: isRounds ? activeMode.roundsToWin : activeMode.targetKills,
      playerKills: kills,
      playerDeaths: tank.matchDeaths,
      matchSilverEarned,
      victorySilver,
      totalSilver: getSilver(),
    });
  }

  function finishJuggernaut() {
    if (matchEnded) return;
    matchEnded = true;
    const reward = getModeDef(currentModeId).victoryRewardSilver;
    addSilver(reward); // сохраняется в localStorage сразу
    matchSilverEarned += reward;
    ui.refreshSilver();
    audio.ui('victory');
    showSilverToast(reward, 'Маус уничтожен', true);
    mouseDown = false;
    setScoreboardOpen(false);
    spectating = false;
    $('spectatorBar').classList.add('hidden');
    deadEl.style.display = 'none';
    showRoundBanner(null);
    $('bossBar').classList.add('hidden');
    const vb = $('victoryBanner');
    vb.textContent = 'ПОБЕДА! ХОРОШАЯ РАБОТА!';
    vb.classList.remove('hidden');
    jugVictoryT = 1.8;
  }

  function handleTankDestroyed(target: Tank, owner: Tank | null, suffix = '') {
    if (target.isBoss) {
      target.matchDeaths++;
      if (owner === tank) {
        kills = ++tank.matchKills;
        el.kills.textContent = String(kills);
      }
      feed(`${owner ? owner.name : '?'}  >  ${target.name}`, 'ally');
      finishJuggernaut();
      return;
    }
    if (!matchEnded) {
      const activeMode = getModeDef(currentModeId);
      target.matchDeaths++;
      if (owner && owner !== target && owner.team !== target.team) {
        owner.matchKills++;
        if (owner.team === 'A') teamAKills++;
        else teamBKills++;
      }

      if (target === tank) {
        recordPlayerDeath();
      }

      if (owner === tank && target.team === 'B') {
        recordPlayerKill();
        kills = tank.matchKills;
        el.kills.textContent = String(kills);
        if (activeMode.silverRewards) {
          const reward = computeKillReward(kills);
          addSilver(reward.totalSilver);
          matchSilverEarned += reward.totalSilver;
          ui.refreshSilver();
          showSilverToast(reward.baseSilver, `Уничтожен ${target.name}`);
          if (reward.streakBonus > 0 && reward.bonusLabel) {
            showSilverToast(reward.streakBonus, reward.bonusLabel, true);
          }
          audio.ui('silver');
        }
      }

      if (activeMode.roundsToWin > 0 && roundPhase === 'active') {
        const aliveA = tanksOf('A').filter((t) => t.alive).length;
        const aliveB = tanksOf('B').filter((t) => t.alive).length;
        const rEval = evaluateRoundState(aliveA, aliveB, teamARounds, teamBRounds, activeMode.roundsToWin, activeMode.victoryRewardSilver);
        if (rEval.roundEnded && rEval.roundWinner) {
          teamARounds = rEval.teamARounds;
          teamBRounds = rEval.teamBRounds;
          roundPhase = 'intermission';
          roundEndT = rEval.matchFinished ? 2.0 : 2.5;
          spectating = false;
          $('spectatorBar').classList.add('hidden');
          $('dead').style.display = 'none';
          const winTxt = rEval.roundWinner === 'A' ? 'ПОБЕДА В РАУНДЕ!' : 'РАУНД ПРОИГРАН';
          showRoundBanner(`РАУНД ${roundNum}: ${winTxt} (${teamARounds} : ${teamBRounds})`, rEval.roundWinner === 'A' ? '#8fe36a' : '#ff6a4a');
          if (rEval.matchFinished && rEval.matchWinner) {
            pendingRoundMatchWinner = { winner: rEval.matchWinner, victorySilver: rEval.victorySilver };
          }
        }
      }

      updateModeScoreHud();
      if (scoreboardOpen) renderScoreboard();

      if (activeMode.targetKills > 0) {
        const evalRes = evaluateMatchState(activeMode, teamAKills, teamBKills);
        if (evalRes.finished && evalRes.winner) {
          finishMatch(evalRes.winner, evalRes.victorySilver);
        }
      }
    }
    feed(`${owner ? owner.name : '?'}  >  ${target.name}${suffix}`, target.team === 'A' ? 'ally' : 'enemy');
  }

  function resolveTankCollisions() {
    const list = allTanks().filter((t) => !t.isBoss);
    const byId = new Map<string, Tank>();
    for (const t of list) byId.set(getTankId(t), t);

    const moved = new Set<Tank>();
    const ramHitsToApply: Array<{ attacker: Tank; victim: Tank; damage: number }> = [];

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const res = resolveTankCollisionPair(
            {
              id: getTankId(a),
              x: a.root.position.x,
              z: a.root.position.z,
              heading: a.heading,
              speed: a.speed,
              alive: a.alive,
              team: a.team,
            },
            {
              id: getTankId(b),
              x: b.root.position.x,
              z: b.root.position.z,
              heading: b.heading,
              speed: b.speed,
              alive: b.alive,
              team: b.team,
            },
            simTime,
            ramCooldowns,
          );
          if (!res.separated) continue;
          if (res.dxA !== 0 || res.dzA !== 0) {
            a.root.position.x += res.dxA;
            a.root.position.z += res.dzA;
            a.speed *= res.speedFactorA;
            moved.add(a);
          }
          if (res.dxB !== 0 || res.dzB !== 0) {
            b.root.position.x += res.dxB;
            b.root.position.z += res.dzB;
            b.speed *= res.speedFactorB;
            moved.add(b);
          }
          for (const hit of res.ramHits) {
            const attacker = byId.get(hit.attackerId);
            const victim = byId.get(hit.victimId);
            if (attacker && victim) ramHitsToApply.push({ attacker, victim, damage: hit.damage });
          }
        }
      }
    }

    for (const t of moved) {
      t.syncAfterCollision();
    }

    for (const r of ramHitsToApply) {
      if (!r.victim.alive || r.victim.god) continue;
      r.victim.hp -= r.damage;
      const pt = r.victim.root.position;
      audio.play('nopen', pt, 1.0);
      for (let k = 0; k < 8; k++) {
        ballistics.fx.emit({
          additive: true,
          x: pt.x + (Math.random() - 0.5) * 1.5,
          y: pt.y + 1.1,
          z: pt.z + (Math.random() - 0.5) * 1.5,
          vx: (Math.random() - 0.5) * 10,
          vy: 2 + Math.random() * 6,
          vz: (Math.random() - 0.5) * 10,
          life: 0.4,
          s0: 0.35,
          s1: 0.1,
          r: 1,
          g: 0.8,
          b: 0.4,
          a: 1,
          grav: -15,
        });
      }
      if (r.attacker === tank) {
        showMsg(`ТАРАН! -${r.damage} ХП`, '#ffd27a');
        audio.ui('tick');
      }
      if (r.victim === tank) {
        shake = Math.max(shake, 0.7);
        showMsg(`ТАРАН ПО ВАМ: -${r.damage} ХП`, '#ff6a4a');
      }
      if (r.victim.hp <= 0 && r.victim.alive) {
        r.victim.destroy(false);
        audio.play('bigexplosion', pt);
        handleTankDestroyed(r.victim, r.attacker, ' [ТАРАН]');
      }
    }
  }

  function resolveBossRam() {
    if (!boss || !boss.alive || matchEnded) return;
    const bp = boss.tank.root.position;
    for (const v of allTanks()) {
      if (v.isBoss || !v.alive) continue;
      const d = Math.hypot(v.root.position.x - bp.x, v.root.position.z - bp.z);
      if (d > BOSS_RAM_DISTANCE) continue;
      // Смертельный таран: любой танк погибает мгновенно (Маус урона не получает) → штатный респавн
      v.hp = 0;
      v.destroy(true);
      const p = v.root.position;
      ballistics.fx.emit({ additive: true, x: p.x, y: p.y + 2, z: p.z, life: 0.8, s0: 10, s1: 30, r: 1, g: 0.6, b: 0.2, a: 1 });
      audio.play('bigexplosion', p);
      if (v === tank) {
        shake = Math.max(shake, 1.1);
        showMsg('МАУС РАЗДАВИЛ ВАС!', '#ff4c2a');
      }
      handleTankDestroyed(v, boss.tank, ' [ТАРАН]');
    }
  }

  ballistics.onTankHit((e) => {
    if (e.owner === tank) {
      if (e.target.team === 'B') {
        recordPlayerHit(e.result === 'pen' || e.result === 'crit' || e.result === 'fuel', e.damage);
      }
      if (e.result === 'fuel') {
        showMsg('ВЗРЫВ БЕНЗОБАКА — УНИЧТОЖЕН!', '#ff4c2a');
      } else if (e.destroyed) {
        showMsg('ЦЕЛЬ УНИЧТОЖЕНА', '#ff6a4a');
      } else {
        showMsg(RESULT_TXT[e.result] || 'ПОПАДАНИЕ', RESULT_COL[e.result] || '#ffd27a');
      }
      if (settings.hitcam) hitcam.show(e);
    }
    if (e.target === tank) {
      shake = Math.max(shake, e.result === 'fuel' ? 1.1 : 0.5);
      showMsg('ПО ВАМ ПОПАЛИ: ' + (RESULT_TXT[e.result] || ''), '#ff9a7a');
    }
    if (e.destroyed) {
      const suffix = e.result === 'fuel' ? ' [БЕНЗОБАК]' : '';
      handleTankDestroyed(e.target, e.owner, suffix);
    }
  });

  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    resizeScope();
    if (composer) composer.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  function render() {
    if (composer && settings.post && !isSoftwareGl) composer.render();
    else renderer.render(scene, camera);
  }

  applyMapLook();
  applyGraphics();

  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autostart') === '1') {
    startPlay(true);
  }

  let disposed = false;
  let frameId = 0;

  function afterDraw(cb: () => void) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (st === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function stepFrame() {
    if (disposed) return;
    const rawDt = clock.getDelta();
    let dt = Math.min(rawDt, 0.05);

    if (state === 'menu') {
      tank.update(dt, { throttle: 0, steer: 0, brake: true }, null);
      menuCamera(dt);
      world.update(camera.position, tank.root.position, dt);
      ballistics.fx.setViewScale(renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      render();
      scheduleNext();
      return;
    }
    if (state === 'pause' || state === 'matchEnd') {
      hitcam.draw(0);
      render();
      scheduleNext();
      return;
    }

    const activeMode = getModeDef(currentModeId);
    if ((!activeMode.allowCheats || !flags.svCheats) && (flags.svCheats || tank.god || !flags.ai || flags.timeScale !== 1)) {
      enforceCheatsOff();
    }
    dt *= flags.timeScale;
    simTime += dt;
    const K = settings.keys;
    const input = {
      throttle: (keys[K.forward] ? 1 : 0) - (keys[K.back] ? 1 : 0),
      steer: (keys[K.left] ? 1 : 0) - (keys[K.right] ? 1 : 0),
      brake: !!keys[K.brake],
    };
    tank.update(dt, input, ballistics.fx);
    tank.updateTurret(dt, aim.yaw, aim.elev);
    tank.root.updateMatrixWorld(true);

    const teams = { A: tanksOf('A'), B: tanksOf('B') };
    const foes = { A: teams.B, B: teams.A };
    for (const b of bots) {
      if (flags.ai) {
        b.update(dt, foes[b.team], ballistics.fx, {
          respawns: activeMode.respawns,
          allowBotAccuracy: activeMode.allowBotAccuracy,
          allies: teams[b.team],
        });
      } else {
        b.tank.update(dt, { throttle: 0, steer: 0, brake: true }, ballistics.fx);
      }
    }

    if (boss && flags.ai) boss.update(dt, teams.A, ballistics.fx);
    else if (boss) boss.tank.update(dt, { throttle: 0, steer: 0, brake: true }, ballistics.fx);

    resolveTankCollisions();
    resolveBossRam();

    if (jugVictoryT > 0) {
      jugVictoryT -= Math.min(rawDt, 0.5);
      if (jugVictoryT <= 0) {
        jugVictoryT = 0;
        toMenu();
        render();
        scheduleNext();
        return;
      }
    }

    if (activeMode.roundsToWin > 0 && roundPhase === 'intermission') {
      roundEndT -= Math.min(rawDt, 0.5);
      if (roundEndT <= 0) {
        if (pendingRoundMatchWinner) {
          finishMatch(pendingRoundMatchWinner.winner, pendingRoundMatchWinner.victorySilver);
          render();
          scheduleNext();
          return;
        }
        roundNum++;
        startRound(false);
      }
    }

    if (!tank.alive) {
      mouseDown = false;
      if (activeMode.respawns) {
        playerDeadT += dt;
        deadEl.style.display = 'flex';
        deadEl.textContent = 'ВАШ ТАНК УНИЧТОЖЕН - ВОЗРОЖДЕНИЕ ЧЕРЕЗ ' + Math.max(0, Math.ceil(6 - playerDeadT));
        if (playerDeadT > 6) {
          tank.reset(world.spawnPlayer.x + 70, world.spawnPlayer.z, 0, getSelectedTankId());
          aim.yaw = 0;
          aim.elev = 0;
          cam.yaw = 0;
          playerDeadT = 0;
          deadEl.style.display = 'none';
        }
      } else if (activeMode.spectatorOnDeath && roundPhase === 'active') {
        deadEl.style.display = 'none';
        const allies = getAliveAllies();
        if (allies.length > 0) {
          spectating = true;
          mode = 'third';
          if (!spectateTarget || !spectateTarget.alive || spectateTarget.team !== 'A') {
            spectateIdx = spectateIdx % allies.length;
            spectateTarget = allies[spectateIdx];
          }
          $('spectatorBar').classList.remove('hidden');
          $('specTargetName').textContent = spectateTarget.name;
          $('specTargetHp').textContent = `(${Math.max(0, Math.round(spectateTarget.hp))}/${spectateTarget.maxHp} ХП)`;
        } else {
          spectating = false;
          $('spectatorBar').classList.add('hidden');
        }
      } else {
        spectating = false;
        deadEl.style.display = 'none';
        $('spectatorBar').classList.add('hidden');
      }
    } else {
      spectating = false;
      $('spectatorBar').classList.add('hidden');
    }

    if (msgT > 0) {
      msgT -= dt;
      if (msgT < 0.4) msgEl.style.opacity = String(Math.max(0, msgT / 0.4));
    }

    if (!spectating && mouseDown && locked && mode !== 'binoc' && !consoleOpen) {
      const shot = tank.fire();
      if (shot) {
        recordPlayerShot();
        ballistics.fire({ ...shot, owner: tank });
        kick += mode === 'third' ? 0.018 : 0.0035;
        shake = mode === 'third' ? 0.18 : 0;
      }
    }

    ballistics.update(dt);
    updateCamera(dt);
    const focusPos = spectating && spectateTarget ? spectateTarget.root.position : tank.root.position;
    world.update(camera.position, focusPos, dt);
    ballistics.fx.setViewScale(renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
    audio.engineUpdate(Math.abs(tank.speed) / tank.stats.maxSpeed, input.throttle, tank.alive && !spectating);
    updateHud(dt);
    hitcam.draw(dt);
    render();
    scheduleNext();
  }

  function scheduleNext() {
    if (disposed) return;
    if (isSoftwareGl) afterDraw(stepFrame);
    else frameId = requestAnimationFrame(stepFrame);
  }

  scheduleNext();

  (window as unknown as Record<string, unknown>).IRONSKY = {
    bots,
    THREE,
    scene,
    camera,
    renderer,
    get world() {
      return world;
    },
    tank,
    ballistics,
    aim,
    game,
    settings,
  };

  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    clearTimeout(frameId);
    clearTimeout(lockTimer);
    unsubSettings();
    removeEventListener('pointerdown', unlockMenuMusic);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('pointerlockerror', onPointerLockError);
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onBlur);
    removeEventListener('mousemove', onMouseMove);
    removeEventListener('mousedown', onMouseDown);
    removeEventListener('mouseup', onMouseUp);
    removeEventListener('contextmenu', onContextMenu);
    removeEventListener('wheel', onWheel);
    removeEventListener('resize', onResize);
    audio.engineSilence();
    audio.music('off');
    world.dispose();
    renderer.dispose();
  };
}
