import * as THREE from 'three';
import { createWorld, type GameWorld } from './world';
import { createCityWorld } from './city';
import { createLondonWorld, type LondonWorld } from './london';
import {
  BOMBARDMENT_DURATION_SEC,
  createBombStrike,
  getBombardmentIntervalSec,
  getMaxConcurrentBombs,
  isBombardmentMode,
  isLondonMap,
  pickStrikeCandidate,
  resolveMapAndModeOnMapChange,
  resolveMapAndModeOnModeChange,
  stepBombStrikes,
  stepCutscene,
  type BombStrike,
} from './bombardment';
import { Tank } from './tank';
import { BallisticsSystem, G, DRAG_K, SUBSTEP } from './ballistics';
import { Bot, pickRandomBotTankId, setMap } from './bots';
import { JuggernautBoss, BOSS_RAM_DISTANCE } from './boss';
import { settings, onSettings, setSetting, keyName, type GameSettings } from './settings';
import { isMgExhausted } from './machineGun';
import { audio } from './audio';
import { HitCam } from './hitcam';
import { Minimap } from './minimap';
import { GameConsole, type ConsoleGameAPI } from './console';
import { createUI } from './ui';
import { attachTouchControls } from './touchControls';
import { getSelectedTankId, DEFAULT_TANK_ID } from './tanks';
import { addSilver, computeKillReward, getSilver } from './economy';
import {
  DEFAULT_MODE_ID,
  evaluateMatchState,
  evaluateRoundState,
  evaluateSurvivalState,
  formatCountdown,
  getModeDef,
  sortScoreboardRows,
  type GameModeDef,
  type ScoreboardRow,
} from './modes';
import { resolveTankCollisionPair } from './collision';
import { shouldApplyRockDamage } from './envCollision';
import { isShotIntoSky, SKY_EASTER_MSG } from './damage';
import {
  createSmokeRing,
  computeGalixArcPosition,
  isThermalActive,
  pruneSmokeClouds,
  stepKstamLock,
  type SmokeCloud,
} from './abilities';
import { createHangarShowcase } from './hangarStage';
import { createMenuShowcase } from './menuStage';
import {
  applyMenuOrbitDrag,
  applyMenuOrbitZoom,
  createMenuOrbitState,
  resolveMenuCameraPose,
  stepMenuOrbitState,
  type ResolvedOrbitCameraPose,
} from './menuOrbit';
import { recordPlayerDeath, recordPlayerHit, recordPlayerKill, recordPlayerShot } from './playerSkill';
import { recordMatchHistory } from './matchHistory';
import { applyDocumentLanguage, getLanguage, getMapText, getModeText, t } from './i18n';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VisibilityController, resolveTankLod } from './visibility';

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
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
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
    {
      id: 'london',
      name: 'Лондон',
      desc: 'Лондон времён Блица 1940 года: разрушенные кирпичные кварталы, телефонные будки, противотанковые ежи и ночные налёты Люфтваффе.',
      build: createLondonWorld,
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
    name: t('sbPlayerSelf', { name: 'Т-55' }),
    specId: getSelectedTankId(),
  });
  tank.isPlayer = true;

  const ballistics = new BallisticsSystem(scene, world);
  ballistics.addTarget(tank);

  const hangarShowcase = createHangarShowcase(renderer, isSoftwareGl);
  const previewTank = new Tank(hangarShowcase.scene, hangarShowcase.world, {
    x: 0,
    z: 0,
    heading: 0,
    specId: getSelectedTankId(),
  });
  previewTank.setDetailLevel('high', !isSoftwareGl);

  const menuShowcase = createMenuShowcase(renderer, isSoftwareGl);
  const menuTank = new Tank(menuShowcase.scene, menuShowcase.world, {
    x: 0,
    z: 0,
    heading: 0.22,
    specId: getSelectedTankId(),
  });
  menuTank.setDetailLevel('high', !isSoftwareGl);
  menuTank.turretYaw = 0.28;
  menuTank.root.updateMatrixWorld(true);

  const vis = new VisibilityController();

  function updateTankVisibilityAndLod() {
    vis.updateFromCamera(camera);
    if (hangarOpen) {
      previewTank.setDetailLevel('high', !isSoftwareGl);
      return;
    }
    if (state === 'menu') {
      menuTank.setDetailLevel('high', !isSoftwareGl);
      return;
    }
    const playerInSniper = state === 'play' && !spectating && mode === 'sniper';
    for (let i = 0; i < allTanksList.length; i++) {
      const tk = allTanksList[i];
      if (tk === tank && !spectating) {
        if (playerInSniper) {
          tk.setDetailLevel('culled', false);
          vis.stats.culledTanks++;
        } else {
          tk.setDetailLevel('high', true);
          vis.stats.visibleTanks++;
        }
        continue;
      }
      const p = tk.root.position;
      const rad = tk.isBoss ? 6.6 : 5.2;
      const inFrustum = vis.isSphereVisible(p.x, p.y + 1.5, p.z, rad);
      const effDist = vis.effectiveDistanceTo(p.x, p.y + 1.5, p.z);
      const tier = resolveTankLod(inFrustum, effDist, 1250);
      tk.setDetailLevel(tier, effDist < 115);
      if (tier === 'culled') {
        vis.stats.culledTanks++;
      } else {
        vis.stats.visibleTanks++;
        if (tier === 'low') vis.stats.lowLodTanks++;
        else if (tier === 'medium') vis.stats.medLodTanks++;
      }
    }
  }

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
      boss.dispose();
      scene.remove(boss.tank.root);
      ballistics.targets = ballistics.targets.filter((t) => t !== boss!.tank);
      boss = null;
      $('bossBar').classList.add('hidden');
    }
  }

  const allTanksList: Tank[] = [];
  const teamATanks: Tank[] = [];
  const teamBTanks: Tank[] = [];
  const nonBossTanks: Tank[] = [];
  const aliveAlliesCache: Tank[] = [];

  function rebuildTankLists() {
    allTanksList.length = 0;
    teamATanks.length = 0;
    teamBTanks.length = 0;
    nonBossTanks.length = 0;
    allTanksList.push(tank);
    teamATanks.push(tank);
    nonBossTanks.push(tank);
    for (let i = 0; i < bots.length; i++) {
      const bt = bots[i].tank;
      allTanksList.push(bt);
      nonBossTanks.push(bt);
      if (bt.team === 'A') teamATanks.push(bt);
      else teamBTanks.push(bt);
    }
    if (boss) {
      allTanksList.push(boss.tank);
      if (boss.tank.team === 'A') teamATanks.push(boss.tank);
      else teamBTanks.push(boss.tank);
    }
  }

  function countAlive(list: Tank[]): number {
    let n = 0;
    for (let i = 0; i < list.length; i++) if (list[i].alive) n++;
    return n;
  }

  function syncTeamRoster(modeDef: GameModeDef) {
    syncBoss(!!modeDef.boss);
    const wantAllies = Math.max(0, modeDef.teamSize - 1);
    const wantEnemies = modeDef.boss ? 0 : Math.max(0, modeDef.enemyCount ?? modeDef.teamSize);

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
      const specId = modeDef.randomEnemyTanks ? pickRandomBotTankId() : DEFAULT_TANK_ID;
      const b = new Bot(scene, world, ballistics, 'B', idx, specId);
      getTankId(b.tank);
      bots.push(b);
    }
    rebuildTankLists();
  }

  syncTeamRoster(getModeDef(DEFAULT_MODE_ID));
  const allTanks = () => allTanksList.slice();
  const tanksOf = (team: 'A' | 'B') => (team === 'A' ? teamATanks.slice() : teamBTanks.slice());

  let composer: EffectComposer | null = null;
  let renderPass: RenderPass | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let gradePass: ShaderPass | null = null;
  if (!isSoftwareGl) {
    try {
      const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType });
      composer = new EffectComposer(renderer, rt);
      renderPass = new RenderPass(scene, camera);
      composer.addPass(renderPass);
      bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.55, 1.0);
      composer.addPass(bloomPass);
      gradePass = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, sat: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform sampler2D tDiffuse; uniform float sat; uniform vec3 tint; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0); c.rgb = clamp(c.rgb, vec3(0.0), vec3(8.0)); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(mix(vec3(l), c.rgb, sat) * tint, c.a); }',
      });
      composer.addPass(gradePass);
      composer.addPass(new OutputPass());
    } catch {
      composer = null;
      renderPass = null;
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
  let idleFrames = 0;
  let hangarOpen = false;
  let battleStarted = false;
  let currentModeId = DEFAULT_MODE_ID;
  let matchEnded = false;
  let matchRecorded = false;
  let survivalRemaining = 0;
  let survivalElapsed = 0;
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
  let cutsceneActive = false;
  let cutsceneElapsed = 0;
  let cutsceneBomberSfxPlayed = false;
  const bombStrikes: BombStrike[] = [];
  let nextBombId = 1;
  let bombSpawnAcc = 0;
  let bombersRetreating = false;
  const smokeClouds: SmokeCloud[] = [];
  let smokeEmitAcc = 0;
  interface GalixGrenadeFlight {
    mesh: THREE.Mesh;
    sx: number;
    sy: number;
    sz: number;
    ex: number;
    ey: number;
    ez: number;
    age: number;
    duration: number;
    trailAcc: number;
  }
  const galixGrenades: GalixGrenadeFlight[] = [];
  const galixCanisterGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.34, 8);
  const galixCanisterMat = new THREE.MeshStandardMaterial({
    color: 0x3b4436,
    roughness: 0.55,
    metalness: 0.45,
    emissive: new THREE.Color(0x50d4ff),
    emissiveIntensity: 0.45,
  });
  function clearGalixGrenades() {
    for (let i = 0; i < galixGrenades.length; i++) {
      scene.remove(galixGrenades[i].mesh);
    }
    galixGrenades.length = 0;
  }
  const ramCooldowns = new Map<string, number>();
  const rockCooldowns = new Map<string, number>();
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
  let fireQueued = false;
  let kills = 0;
  let playerDeadT = 0;
  let msgT = 0;
  let lastSkyMsgTime = -10;
  let menuAngle = 0;
  let menuTime = 0;
  const menuOrbit = createMenuOrbitState(0.58, 0.22, 11.4);
  const menuCamPose: ResolvedOrbitCameraPose = resolveMenuCameraPose(
    menuOrbit,
    menuShowcase.heightAt,
    menuShowcase.cameraColliders,
  );
  let menuOrbitPointerId: number | null = null;
  let menuOrbitLastX = 0;
  let menuOrbitLastY = 0;
  let consoleOpen = false;
  const keys: Record<string, boolean> = Object.create(null);
  const cam = { yaw: 0, pitch: 0.2 };
  const aim = { yaw: 0, elev: 0, point: new THREE.Vector3(), range: null as number | null };
  let binocFrozen = false;
  let kstamHolding = false;
  let kstamLockProg = 0;
  let kstamLockTarget: Tank | null = null;
  let kstamLockedAnnounced = false;
  let kstamTickAcc = 0;
  let lastThermalOn = false;
  let touchCtl: ReturnType<typeof attachTouchControls> | null = null;

  const hitcam = new HitCam($<HTMLCanvasElement>('hitcam'));
  const minimap = new Minimap($<HTMLCanvasElement>('minimap'));
  minimap.setWorld(world);

  function applyGraphics() {
    idleFrames = 0;
    const sun = world.sun;
    const pr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5) * settings.resolution;
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight);
    if (composer) {
      composer.setPixelRatio(pr);
      composer.setSize(innerWidth, innerHeight);
    }
    sun.castShadow = !isSoftwareGl && settings.shadows !== 'off';
    menuShowcase.world.sun.castShadow = !isSoftwareGl && settings.shadows !== 'off';
    hangarShowcase.world.sun.castShadow = !isSoftwareGl && settings.shadows !== 'off';
    const ms = settings.shadows === 'high' ? 2048 : 1024;
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
    $('help').style.display = settings.hints && settings.controlMode !== 'touch' ? 'block' : 'none';
    $('hitcam').dataset.on = settings.hitcam ? '1' : '0';
    if (!settings.hitcam) hitcam.hide();
    updateHelp();
    if (state !== 'menu') resizeScope();
  }

  function updateHelp() {
    const K = settings.keys;
    const lang = getLanguage();
    const n = (c: string) => keyName(c, lang).toUpperCase();
    if (lang === 'sr') {
      $('help').innerHTML =
        `<b>${n(K.forward)}/${n(K.back)}</b> gas/rikverc &nbsp; <b>${n(K.left)}/${n(K.right)}</b> skretanje &nbsp; <b>${n(K.brake)}</b> kočnica<br>` +
        `<b>MIŠ</b> nišan &nbsp; <b>LKM</b> top &nbsp; <b>${n(K.mg)}</b> mitraljez &nbsp; <b>R</b> pojas &nbsp; <b>${n(K.ability)}</b> sposobnost<br>` +
        `<b>${n(K.sniper)}</b> nišan &nbsp; <b>${n(K.binoc)}</b> dvogled &nbsp; <b>${n(K.comp)}</b> računar &nbsp; <b>TAB</b> rezultat &nbsp; <b>ESC</b> pauza`;
    } else if (lang === 'en') {
      $('help').innerHTML =
        `<b>${n(K.forward)}/${n(K.back)}</b> throttle/reverse &nbsp; <b>${n(K.left)}/${n(K.right)}</b> steer &nbsp; <b>${n(K.brake)}</b> brake<br>` +
        `<b>MOUSE</b> aim &nbsp; <b>LMB</b> cannon &nbsp; <b>${n(K.mg)}</b> machine gun &nbsp; <b>R</b> reload MG &nbsp; <b>${n(K.ability)}</b> ability<br>` +
        `<b>${n(K.sniper)}</b> scope &nbsp; <b>${n(K.binoc)}</b> binoculars &nbsp; <b>${n(K.comp)}</b> ballistic comp &nbsp; <b>TAB</b> scoreboard &nbsp; <b>ESC</b> pause`;
    } else {
      $('help').innerHTML =
        `<b>${n(K.forward)}/${n(K.back)}</b> газ/реверс &nbsp; <b>${n(K.left)}/${n(K.right)}</b> поворот &nbsp; <b>${n(K.brake)}</b> тормоз<br>` +
        `<b>МЫШЬ</b> прицел &nbsp; <b>ЛКМ</b> орудие &nbsp; <b>${n(K.mg)}</b> пулемёт &nbsp; <b>R</b> лента &nbsp; <b>${n(K.ability)}</b> способность<br>` +
        `<b>${n(K.sniper)}</b> прицел &nbsp; <b>${n(K.binoc)}</b> бинокль &nbsp; <b>${n(K.comp)}</b> вычисл. &nbsp; <b>TAB</b> счёт &nbsp; <b>ESC</b> пауза`;
    }
  }

  const GFX_KEYS = new Set(['shadows', 'post', 'bloom', 'grass', 'drawDist', 'resolution', 'vignette', 'hitcam', 'hints', 'keys', 'controlMode', 'touchSens', 'language', '*']);
  const unsubSettings = onSettings((k) => {
    if (k === 'language') {
      applyDocumentLanguage();
      ui.updateAllStaticTexts();
      updateHelp();
      tank.name = t('sbPlayerSelf', { name: tank.spec.name });
      ui.show(ui.currentScreen);
    }
    if (k === 'controlMode' || k === '*') {
      document.body.dataset.control = settings.controlMode;
      touchCtl?.reset();
      if (settings.controlMode === 'touch') {
        if (document.pointerLockElement) document.exitPointerLock();
        if (state === 'play') locked = true;
      } else if (state === 'play') {
        locked = document.pointerLockElement === renderer.domElement || fallback || isSoftwareGl;
      }
    }
    if (GFX_KEYS.has(k)) applyGraphics();
  });

  function applyMenuShowcaseLook() {
    renderer.toneMappingExposure = menuShowcase.world.exposure;
    if (gradePass) {
      gradePass.uniforms.sat.value = menuShowcase.world.grade.sat;
      gradePass.uniforms.tint.value.set(...menuShowcase.world.grade.tint);
    }
  }

  function syncMenuTank(tankId: string) {
    menuTank.reset(0, 0, 0.22, tankId);
    menuTank.setDetailLevel('high', !isSoftwareGl);
    menuTank.turretYaw = 0.28 + Math.sin(menuTime * 0.42) * 0.14;
    menuTank.root.updateMatrixWorld(true);
  }

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
    if (state !== 'menu' || hangarOpen) applyMapLook();
    else applyMenuShowcaseLook();
    applyGraphics();
    smokeClouds.length = 0;
    clearGalixGrenades();
    tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, getSelectedTankId());
    for (const b of bots) b.respawn();
    if (boss) boss.respawn();
    minimap.setWorld(world);
    battleStarted = false;
  }

  function isLondonWorld(w: GameWorld): w is LondonWorld {
    return 'setBlitzAtmosphere' in w;
  }

  function hideCutsceneOverlay() {
    document.body.classList.remove('cutscene-active');
    const ov = $('cutsceneOverlay');
    if (ov) ov.classList.add('hidden');
    const top = $('cutsceneTopCaption');
    const cen = $('cutsceneCenterCaption');
    if (top) {
      top.textContent = '';
      top.style.opacity = '0';
    }
    if (cen) {
      cen.textContent = '';
      cen.style.opacity = '0';
    }
  }

  function syncCutsceneDom(cs: ReturnType<typeof stepCutscene>) {
    const ov = $('cutsceneOverlay');
    const top = $('cutsceneTopCaption');
    const cen = $('cutsceneCenterCaption');
    if (cs.phase === 'combat') {
      hideCutsceneOverlay();
      return;
    }
    document.body.classList.add('cutscene-active');
    if (ov) ov.classList.remove('hidden');
    if (top) {
      top.textContent = cs.topCaptionKey ? t(cs.topCaptionKey) : '';
      top.style.opacity = cs.topCaptionAlpha.toFixed(3);
    }
    if (cen) {
      cen.textContent = cs.centerCaptionKey ? t(cs.centerCaptionKey) : '';
      cen.style.opacity = cs.centerCaptionAlpha.toFixed(3);
    }
  }

  function emitAirBombExplosion(x: number, groundY: number, z: number, radius: number) {
    const scale = Math.max(0.8, radius / 8);
    ballistics.fx.emit({
      additive: true,
      x,
      y: groundY + 1.4,
      z,
      life: 0.55,
      s0: 6 * scale,
      s1: 22 * scale,
      r: 1,
      g: 0.62,
      b: 0.16,
      a: 1,
    });
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2 + Math.random() * 0.4;
      const spd = (4 + Math.random() * 10) * scale;
      ballistics.fx.emit({
        additive: k < 5,
        x: x + Math.cos(ang) * 1.6,
        y: groundY + 0.8 + Math.random() * 1.2,
        z: z + Math.sin(ang) * 1.6,
        vx: Math.cos(ang) * spd,
        vy: 5 + Math.random() * 12,
        vz: Math.sin(ang) * spd,
        life: k < 5 ? 0.55 + Math.random() * 0.25 : 1.45 + Math.random() * 0.8,
        s0: k < 5 ? 2.4 * scale : 3.2 * scale,
        s1: k < 5 ? 7.5 * scale : 13.5 * scale,
        r: k < 5 ? 1 : 0.18,
        g: k < 5 ? 0.48 : 0.14,
        b: k < 5 ? 0.12 : 0.13,
        a: k < 5 ? 0.95 : 0.82,
        grav: k < 5 ? -10 : 1.5,
      });
    }
  }

  function updateModeScoreHud() {
    const activeMode = getModeDef(currentModeId);
    const isBomb = isBombardmentMode(activeMode.id);
    const aliveStr = isBomb ? t('aliveSolo') : countAlive(teamATanks) + ' v ' + countAlive(teamBTanks);
    $('alive').textContent = aliveStr;
    hudCache.alive = aliveStr;
    const isSurvival = !!(activeMode.survivalSeconds && activeMode.survivalSeconds > 0);
    document.body.classList.toggle('bombardment-active', isBomb);
    $('modeScore').classList.toggle('bombardment-mode', isBomb);
    $('modeScoreTeams').classList.toggle('hidden', isSurvival);
    $('modeScoreSurvival').classList.toggle('hidden', !isSurvival);

    if (isSurvival) {
      $('modeTitleHud').textContent = getModeText(activeMode.id).name.toUpperCase();
      const timerTxt = formatCountdown(survivalRemaining);
      const urgent = survivalRemaining <= 30;
      $('survivalTimerHud').textContent = timerTxt;
      $('survivalTimerHud').classList.toggle('urgent', urgent);
      const fragsLabel = t('hudFragsVal', { n: kills });
      $('survivalKillsHud').textContent = fragsLabel;
      hudCache.survivalTimer = timerTxt;
      hudCache.survivalUrgent = urgent;
      hudCache.survivalKills = fragsLabel;
    } else if (activeMode.roundsToWin > 0) {
      $('modeTitleHud').textContent = t('hudRoundTitle', {
        mode: getModeText(activeMode.id).name.toUpperCase(),
        round: roundNum,
      });
      $('teamAKills').textContent = String(teamARounds);
      $('teamBKills').textContent = String(teamBRounds);
      $('modeGoalHud').textContent = `/ ${activeMode.roundsToWin}`;
    } else if (activeMode.boss) {
      $('modeTitleHud').textContent = getModeText(activeMode.id).name.toUpperCase();
      $('teamAKills').textContent = String(teamAKills);
      $('teamBKills').textContent = String(teamBKills);
      $('modeGoalHud').textContent = t('hudGoalDestroyMaus');
    } else if (activeMode.targetKills > 0) {
      $('modeTitleHud').textContent = getModeText(activeMode.id).name.toUpperCase();
      $('teamAKills').textContent = String(teamAKills);
      $('teamBKills').textContent = String(teamBKills);
      $('modeGoalHud').textContent = `/ ${activeMode.targetKills}`;
    } else {
      $('modeTitleHud').textContent = getModeText(activeMode.id).name.toUpperCase();
      $('teamAKills').textContent = String(teamAKills);
      $('teamBKills').textContent = String(teamBKills);
      $('modeGoalHud').textContent = t('hudGoalFreeBattle');
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
    const activeMode = getModeDef(currentModeId);
    const chosenTankId = getSelectedTankId();
    ballistics.clear();
    smokeClouds.length = 0;
    clearGalixGrenades();
    smokeEmitAcc = 0;
    ramCooldowns.clear();
    rockCooldowns.clear();
    if (isFirstRound) world.resetTrees?.();
    tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, chosenTankId);
    tank.name = t('sbPlayerSelf', { name: tank.spec.name });
    if (isFirstRound) {
      tank.matchKills = 0;
      tank.matchDeaths = 0;
      survivalRemaining = activeMode.survivalSeconds ?? 0;
      survivalElapsed = 0;
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
      b.respawn({
        randomTank: !!(activeMode.randomEnemyTanks && b.team === 'B'),
        avoidPos: activeMode.survivalSeconds && b.team === 'B' ? tank.root.position : undefined,
      });
      if (isFirstRound) {
        b.tank.matchKills = 0;
        b.tank.matchDeaths = 0;
      }
    }
    spectating = false;
    spectateTarget = null;
    spectateIdx = 0;
    $('spectatorBar').classList.add('hidden');
    hudCache.specVisible = false;
    $('bossBar').classList.add('hidden');
    hudCache.bossVisible = false;
    playerDeadT = 0;
    $('dead').style.display = 'none';
    aim.yaw = 0;
    aim.elev = 0;
    cam.yaw = 0;
    cam.pitch = 0.2;
    mode = 'third';
    fovCur = settings.fov;
    binocFrozen = false;
    kstamHolding = false;
    kstamLockProg = 0;
    kstamLockTarget = null;
    kstamLockedAnnounced = false;
    kstamTickAcc = 0;
    clearThermalVisuals();
    el.kstamReticle.classList.add('hidden');
    hitcam.hide();
    roundPhase = 'active';
    roundEndT = 0;
    pendingRoundMatchWinner = null;
    showRoundBanner(null);
    msgT = 0;
    lastSkyMsgTime = -10;
    $('msg').style.opacity = '0';
    $('msg').textContent = '';
    updateModeScoreHud();
    minimap.update(allTanksList, tank, cam.yaw, spectateTarget, 0, true);
    bombStrikes.length = 0;
    bombSpawnAcc = 0;
    bombersRetreating = false;
    if (isFirstRound && isLondonMap(currentMap) && isBombardmentMode(currentModeId)) {
      cutsceneActive = true;
      cutsceneElapsed = 0;
      cutsceneBomberSfxPlayed = false;
      if (isLondonWorld(world)) {
        world.setBlitzAtmosphere(0);
        world.updateCutsceneBombers(0, 0, false);
        world.syncBombVisuals([], simTime);
      }
    } else {
      cutsceneActive = false;
      cutsceneElapsed = 0;
      cutsceneBomberSfxPlayed = false;
      hideCutsceneOverlay();
      if (isLondonWorld(world)) {
        world.setBlitzAtmosphere(1);
        world.updateCutsceneBombers(1, 0, false);
        world.syncBombVisuals([], simTime);
      }
    }
    if (activeMode.roundsToWin > 0) {
      showMsg(t('msgRoundToast', { round: roundNum }), '#ffd27a');
    }
  }

  function syncBattleMusic() {
    const activeMode = getModeDef(currentModeId);
    if (state === 'play' && !matchEnded && activeMode.boss && boss && boss.alive) {
      audio.music('boss');
    } else if (state === 'play') {
      audio.music('off');
    }
  }

  function newBattle() {
    const activeMode = getModeDef(currentModeId);
    syncTeamRoster(activeMode);
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
    matchRecorded = false;
    setScoreboardOpen(false);
    $('silverToasts').innerHTML = '';
    $('feed').innerHTML = '';
    startRound(true);
    battleStarted = true;
    syncBattleMusic();
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
    rebuildTankLists();
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
    if (n > 0) rebuildTankLists();
    return n;
  }

  function hitTank(t: Tank, type: string) {
    if (type === 'tracks') t.immobilize(10);
    else if (type === 'gun') t.disableGun(10);
    else if (type === 'fuel' || type === 'crit') {
      if (!t.alive) return;
      t.destroy(true);
      const p = t.root.position;
      ballistics.fx.emit({ additive: true, x: p.x, y: p.y + 2, z: p.z, life: 0.8, s0: 10, s1: 30, r: 1, g: 0.6, b: 0.2, a: 1 });
      audio.play(type === 'fuel' ? 'fuelExplosion' : 'bigexplosion', p);
      handleTankDestroyed(t, null, type === 'fuel' ? ' [БЕНЗОБАК]' : '');
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
        fireQueued = false;
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
    if (settings.controlMode === 'touch' || isSoftwareGl || fallback) {
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
    menuOrbit.dragging = false;
    menuOrbitPointerId = null;
    document.body.style.cursor = '';
    if (fresh || !battleStarted || matchEnded) newBattle();
    state = 'play';
    hangarOpen = false;
    document.body.classList.remove('menu');
    document.body.classList.add('play');
    updateModeScoreHud();
    document.body.dataset.state = 'playing';
    ui.show(null);
    syncBattleMusic();
    resizeScope();
    applyMapLook();
    if (isLondonWorld(world)) {
      const csNow = cutsceneActive ? stepCutscene(cutsceneElapsed) : null;
      world.setBlitzAtmosphere(csNow ? csNow.skyCrimson : 1);
    }
    applyGraphics();
    minimap.update(allTanksList, tank, cam.yaw, spectateTarget, 0, true);
    if (cutsceneActive) {
      const csInit = stepCutscene(cutsceneElapsed);
      syncCutsceneDom(csInit);
      if (engineReady) {
        applyCutsceneCamera(csInit, 0);
        updateTankVisibilityAndLod();
        world.update(camera.position, tank.root.position, 0, vis);
        render();
      }
    } else {
      hideCutsceneOverlay();
      if (engineReady) {
        updateCamera(0);
        updateTankVisibilityAndLod();
        world.update(camera.position, tank.root.position, 0, vis);
        updateHud(0);
        render();
      }
    }
    tryLock();
  }

  function openPause() {
    if (state !== 'play') return;
    state = 'pause';
    hideCutsceneOverlay();
    setScoreboardOpen(false);
    mouseDown = false;
    fireQueued = false;
    kstamHolding = false;
    kstamLockProg = 0;
    kstamLockTarget = null;
    kstamLockedAnnounced = false;
    clearThermalVisuals();
    touchCtl?.reset();
    locked = false;
    for (const k in keys) keys[k] = false;
    audio.engineSilence();
    audio.music('off');
    document.body.dataset.state = 'paused';
    ui.show('pause');
  }

  function resumeGame() {
    if (matchEnded) return;
    state = 'play';
    document.body.dataset.state = 'playing';
    ui.show(null);
    if (cutsceneActive) {
      syncCutsceneDom(stepCutscene(cutsceneElapsed));
    }
    syncBattleMusic();
    tryLock();
  }

  function toMenu() {
    const wasMatchEnded = matchEnded;
    state = 'menu';
    hideCutsceneOverlay();
    if (gcon.open) gcon.close();
    setScoreboardOpen(false);
    if (wasMatchEnded) {
      matchEnded = false;
      battleStarted = false;
      cutsceneActive = false;
      cutsceneElapsed = 0;
      cutsceneBomberSfxPlayed = false;
      bombStrikes.length = 0;
      bombersRetreating = false;
      if (isLondonWorld(world)) world.syncBombVisuals([], simTime);
      roundPhase = 'active';
      roundEndT = 0;
      pendingRoundMatchWinner = null;
      showRoundBanner(null);
      jugVictoryT = 0;
      $('victoryBanner').classList.add('hidden');
      $('bossBar').classList.add('hidden');
      hudCache.bossVisible = false;
      spectating = false;
      spectateTarget = null;
      spectateIdx = 0;
      $('spectatorBar').classList.add('hidden');
      hudCache.specVisible = false;
      $('dead').style.display = 'none';
      $('msg').style.opacity = '0';
      $('msg').textContent = '';
      hitcam.hide();
      ballistics.clear();
      smokeClouds.length = 0;
      clearGalixGrenades();
      tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, getSelectedTankId());
      tank.name = t('sbPlayerSelf', { name: tank.spec.name });
      const activeMode = getModeDef(currentModeId);
      for (const b of bots) {
        b.respawn({ randomTank: !!(activeMode.randomEnemyTanks && b.team === 'B') });
      }
      if (boss) boss.respawn();
      mode = 'third';
      fovCur = settings.fov;
      menuAngle = 0;
      camera.fov = 48;
      camera.updateProjectionMatrix();
    }
    if (!getModeDef(currentModeId).allowCheats) enforceCheatsOff();
    $('bossBar').classList.add('hidden');
    hudCache.bossVisible = false;
    document.body.classList.remove('play', 'bombardment-active', 'thermal-active', 'cutscene-active');
    document.body.classList.add('menu');
    document.body.dataset.state = 'title';
    mouseDown = false;
    fireQueued = false;
    menuOrbit.dragging = false;
    menuOrbitPointerId = null;
    document.body.style.cursor = '';
    kstamHolding = false;
    kstamLockProg = 0;
    kstamLockTarget = null;
    kstamLockedAnnounced = false;
    clearThermalVisuals();
    touchCtl?.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    fallback = false;
    locked = false;
    audio.engineSilence();
    audio.music('menu');
    tank.root.visible = true;
    syncMenuTank(getSelectedTankId());
    applyMenuShowcaseLook();
    ui.show('main');
  }

  let engineReady = false;

  function applyModeSelection(id: string) {
    const def = getModeDef(id);
    currentModeId = def.id;
    if (!def.allowCheats) enforceCheatsOff();
    if (gcon.open) gcon.close();
    battleStarted = false;
    matchEnded = false;
    matchRecorded = false;
    cutsceneActive = false;
    cutsceneElapsed = 0;
    cutsceneBomberSfxPlayed = false;
    bombStrikes.length = 0;
    bombersRetreating = false;
    survivalRemaining = def.survivalSeconds ?? 0;
    survivalElapsed = 0;
    syncTeamRoster(def);
    for (const b of bots) {
      b.respawn({ randomTank: !!(def.randomEnemyTanks && b.team === 'B') });
    }
    updateHelp();
  }

  const ui = createUI({
    play: startPlay,
    resume: resumeGame,
    toMenu,
    started: () => battleStarted,
    maps: MAPS,
    getMap: () => selectedMap,
    setMap: (id: string) => {
      const resolved = resolveMapAndModeOnMapChange(id, currentModeId, DEFAULT_MODE_ID);
      loadMap(resolved.mapId);
      if (resolved.modeId !== currentModeId) {
        applyModeSelection(resolved.modeId);
      }
    },
    getModeId: () => currentModeId,
    setModeId: (id: string) => {
      const resolved = resolveMapAndModeOnModeChange(id, selectedMap);
      if (resolved.mapId !== selectedMap) {
        loadMap(resolved.mapId);
      }
      applyModeSelection(resolved.modeId);
    },
    onSelectTank: (tankId: string) => {
      previewTank.reset(0, 0, 0, tankId);
      previewTank.setDetailLevel('high', !isSoftwareGl);
      previewTank.turretYaw = Math.sin(menuAngle * 0.55) * 0.24;
      previewTank.root.updateMatrixWorld(true);
      syncMenuTank(tankId);
      if (!battleStarted) {
        tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, tankId);
        tank.name = t('sbPlayerSelf', { name: tank.spec.name });
      }
      if (engineReady && hangarOpen) {
        menuCamera(0);
        render();
      }
    },
    onPreviewTank: (tankId: string) => {
      previewTank.reset(0, 0, 0, tankId);
      previewTank.setDetailLevel('high', !isSoftwareGl);
      previewTank.turretYaw = Math.sin(menuAngle * 0.55) * 0.24;
      previewTank.root.updateMatrixWorld(true);
      if (engineReady && hangarOpen) {
        menuCamera(0);
        render();
      }
    },
    onHangarToggle: (open: boolean) => {
      hangarOpen = open;
      menuOrbit.dragging = false;
      menuOrbitPointerId = null;
      document.body.style.cursor = '';
      if (open) {
        menuAngle = 0.52;
        previewTank.reset(0, 0, 0, getSelectedTankId());
        previewTank.setDetailLevel('high', !isSoftwareGl);
        previewTank.turretYaw = Math.sin(menuAngle * 0.55) * 0.24;
        previewTank.root.updateMatrixWorld(true);
        renderer.toneMappingExposure = hangarShowcase.world.exposure;
        if (gradePass) {
          gradePass.uniforms.sat.value = hangarShowcase.world.grade.sat;
          gradePass.uniforms.tint.value.set(...hangarShowcase.world.grade.tint);
        }
        if (engineReady) {
          camera.fov = 52;
          menuCamera(0);
          render();
        }
      } else {
        syncMenuTank(getSelectedTankId());
        if (!battleStarted) {
          tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0, getSelectedTankId());
          tank.name = t('sbPlayerSelf', { name: tank.spec.name });
        }
        if (engineReady && state === 'menu') {
          applyMenuShowcaseLook();
          camera.fov = 48;
          menuCamera(0);
          render();
        } else {
          applyMapLook();
        }
      }
    },
  });

  applyDocumentLanguage();
  ui.updateAllStaticTexts();

  document.body.dataset.state = 'title';
  document.body.dataset.control = settings.controlMode;
  if (!settings.languageChosen) {
    ui.show('languageSelect');
  } else if (!settings.controlChosen) {
    ui.show('controlSelect');
  } else {
    ui.show('main');
  }

  const unlockMenuMusic = () => {
    if (audio.init() && state === 'menu') audio.music('menu');
  };
  addEventListener('pointerdown', unlockMenuMusic, { once: true });

  const onPointerLockChange = () => {
    if (settings.controlMode === 'touch') return;
    locked = document.pointerLockElement === renderer.domElement;
    if (locked) {
      everLocked = true;
      lockTries = 0;
      clearTimeout(lockTimer);
    }
    if (!locked && state === 'play' && !consoleOpen && !fallback && !isSoftwareGl) openPause();
  };
  const onPointerLockError = () => {
    if (settings.controlMode === 'touch' || state !== 'play' || consoleOpen) return;
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
    aliveAlliesCache.length = 0;
    for (let i = 0; i < teamATanks.length; i++) {
      const t = teamATanks[i];
      if (t.alive && t !== tank) aliveAlliesCache.push(t);
    }
    return aliveAlliesCache;
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
    $('specTargetHp').textContent = `(${Math.max(0, Math.round(spectateTarget.hp))}/${spectateTarget.maxHp} ${t('hudHpUnit')})`;
  }

  function triggerPlayerAbility() {
    if (state !== 'play' || !tank.alive || spectating || matchEnded || consoleOpen || scoreboardOpen) return;
    const res = tank.activateAbility();
    if (!res.activated) return;
    if (res.spawnSmoke) {
      const ab = tank.stats.ability;
      const ring = createSmokeRing(
        tank.root.position.x,
        tank.root.position.y,
        tank.root.position.z,
        tank.heading,
        simTime,
        ab?.smokeDuration ?? 8.5,
        ab?.smokeRadius ?? 9.5,
      );
      smokeClouds.push(...ring);
      audio.play('galix', tank.root.position, 0.9, true);
      showMsg(t('msgGalixActivated'), '#78f0ff');

      // Immediate central smoke burst + launcher flash
      const c0 = ring[0];
      for (let p = 0; p < 10; p++) {
        ballistics.fx.emit({
          x: c0.x + (Math.random() - 0.5) * 3.0,
          y: c0.y + Math.random() * 1.6,
          z: c0.z + (Math.random() - 0.5) * 3.0,
          vx: (Math.random() - 0.5) * 5.5,
          vy: 2.2 + Math.random() * 2.8,
          vz: (Math.random() - 0.5) * 5.5,
          life: 3.4 + Math.random() * 1.4,
          s0: 5.5,
          s1: 17.5,
          r: 0.86,
          g: 0.88,
          b: 0.91,
          a: 0.84,
          drag: 0.65,
        });
      }

      // Launch 6 animated 3D GALIX smoke canisters from turret pods along parabolic arcs
      const origins = tank.getGalixPodWorldOrigins();
      for (let i = 1; i < ring.length; i++) {
        const c = ring[i];
        const orig = origins[(i - 1) % origins.length];
        const mesh = new THREE.Mesh(galixCanisterGeo, galixCanisterMat);
        mesh.position.copy(orig);
        scene.add(mesh);
        galixGrenades.push({
          mesh,
          sx: orig.x,
          sy: orig.y,
          sz: orig.z,
          ex: c.x,
          ey: c.y + 0.4,
          ez: c.z,
          age: 0,
          duration: 0.38 + (i % 2) * 0.05,
          trailAcc: 0,
        });
        // Pod muzzle discharge flash
        ballistics.fx.emit({
          additive: true,
          x: orig.x,
          y: orig.y,
          z: orig.z,
          vx: (c.x - orig.x) * 1.6,
          vy: 3.5,
          vz: (c.z - orig.z) * 1.6,
          life: 0.24,
          s0: 1.35,
          s1: 0.25,
          r: 0.75,
          g: 0.94,
          b: 1.0,
          a: 0.95,
        });
      }
    } else if (res.type === 'thermal_sight') {
      audio.play('thermal', tank.root.position, 0.85, true);
      showMsg(t('msgThermalActivated'), '#66f4d4');
    } else if (res.type === 'kstam_missile' && res.primed) {
      audio.play('dm63', tank.root.position, 0.55, true);
      showMsg(t('msgKstamPrimed'), '#ffd27a');
    } else if (res.primed) {
      audio.play('dm63', tank.root.position, 0.65, true);
      showMsg(t('msgDm63Primed'), '#ffd27a');
    }
  }

  function triggerPlayerSecondaryAbility() {
    if (state !== 'play' || !tank.alive || spectating || matchEnded || consoleOpen || scoreboardOpen) return;
    if (!tank.spec.secondaryAbility) return;
    const res = tank.activateSecondaryAbility();
    if (!res.activated) return;
    if (res.type === 'ap_barrage') {
      audio.play('barrage', tank.root.position, 0.85, true);
      showMsg(t('msgBarrageActivated'), '#ff9c42');
    }
  }

  function releaseKstamLock() {
    if (!kstamHolding) return;
    const abSpec = tank.spec.ability;
    const lockDur = abSpec?.lockDuration ?? 1.5;
    const readyToLaunch =
      state === 'play' &&
      tank.alive &&
      !spectating &&
      !matchEnded &&
      abSpec?.type === 'kstam_missile' &&
      tank.abilityState?.primed &&
      kstamLockProg >= lockDur - 1e-4 &&
      kstamLockTarget &&
      kstamLockTarget.alive;

    if (readyToLaunch && kstamLockTarget) {
      const launched = tank.consumeKstam();
      if (launched.launched) {
        tank.muzzleWorld(_gm);
        tank.gunDirection(_gd);
        ballistics.fireKstam({
          pos: _gm,
          dir: _gd,
          target: kstamLockTarget,
          targetPoint: kstamLockTarget.root.position,
          splashRadius: launched.splashRadius,
          damage: launched.damage,
          owner: tank,
        });
        kick += mode === 'third' ? 0.015 : 0.003;
        shake = mode === 'third' ? 0.14 : 0;
        showMsg(t('msgKstamFired'), '#45ff7a');
      }
    } else if (kstamLockProg > 0.05) {
      showMsg(t('msgKstamCancelled'), '#ffb43c');
    }
    kstamHolding = false;
    kstamLockProg = 0;
    kstamLockTarget = null;
    kstamLockedAnnounced = false;
    kstamTickAcc = 0;
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
    if (
      state === 'menu' &&
      !hangarOpen &&
      ui.currentScreen === 'main' &&
      !e.repeat &&
      (e.code === 'Enter' || e.code === 'Space') &&
      !(document.activeElement instanceof HTMLButtonElement)
    ) {
      e.preventDefault();
      startPlay(false);
      return;
    }
    if (state !== 'play') return;
    if (!locked && !fallback) tryLock();
    if (cutsceneActive) return;
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
    else if (e.code === K.ability && mode !== 'binoc') triggerPlayerAbility();
    else if (e.code === 'KeyF' && mode !== 'binoc' && tank.spec.secondaryAbility) triggerPlayerSecondaryAbility();
    else if (e.code === 'KeyR' && mode !== 'binoc') tank.reloadMg();
    if (e.code === K.mg && mode !== 'binoc' && isMgExhausted(tank.mgState) && !tank.spec.secondaryAbility) {
      showMsg(t('msgMgOutToast'), '#ff6a4a');
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
    if (e.code === 'Tab') setScoreboardOpen(false);
  };
  const onBlur = () => {
    for (const k in keys) keys[k] = false;
    mouseDown = false;
    fireQueued = false;
    menuOrbit.dragging = false;
    menuOrbitPointerId = null;
    document.body.style.cursor = '';
    releaseKstamLock();
    setScoreboardOpen(false);
  };
  const onMouseMove = (e: MouseEvent) => {
    if (settings.controlMode === 'touch' || !locked || state !== 'play' || cutsceneActive) return;
    const s = 0.0022 * clamp(fovCur / 60, 0.06, 1) * settings.sens * (mode === 'third' || spectating ? 1 : settings.sensSniper);
    cam.yaw -= e.movementX * s;
    cam.pitch -= e.movementY * s * (settings.invertY ? -1 : 1);
  };
  const onMouseDown = (e: MouseEvent) => {
    if (settings.controlMode === 'touch' || state !== 'play' || consoleOpen) return;
    if (!locked) {
      tryLock();
      return;
    }
    if (cutsceneActive) return;
    if (spectating) {
      if (e.button === 0) cycleSpectateTarget(-1);
      else if (e.button === 2) cycleSpectateTarget(1);
      return;
    }
    if (
      e.button === 2 &&
      tank.alive &&
      mode !== 'binoc' &&
      !scoreboardOpen &&
      tank.spec.ability?.type === 'kstam_missile' &&
      tank.abilityState?.primed
    ) {
      kstamHolding = true;
      kstamLockProg = 0;
      kstamLockTarget = null;
      kstamLockedAnnounced = false;
      kstamTickAcc = 0;
      return;
    }
    if (e.button !== 0) return;
    if (mode === 'binoc') {
      snapTurretToView();
      setMode('third');
      return;
    }
    mouseDown = true;
    fireQueued = true;
  };
  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) mouseDown = false;
    else if (e.button === 2) releaseKstamLock();
  };
  const isMenuOrbitAllowed = () => state === 'menu' && !hangarOpen && ui.currentScreen === 'main' && !consoleOpen;
  const onMenuPointerDown = (e: PointerEvent) => {
    if (!isMenuOrbitAllowed()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button, input, select, a, .panel, #console')) return;
    menuOrbit.dragging = true;
    menuOrbitPointerId = e.pointerId;
    menuOrbitLastX = e.clientX;
    menuOrbitLastY = e.clientY;
    document.body.style.cursor = 'grabbing';
  };
  const onMenuPointerMove = (e: PointerEvent) => {
    if (!menuOrbit.dragging || e.pointerId !== menuOrbitPointerId) return;
    if (!isMenuOrbitAllowed()) {
      menuOrbit.dragging = false;
      menuOrbitPointerId = null;
      document.body.style.cursor = '';
      return;
    }
    const dx = e.clientX - menuOrbitLastX;
    const dy = e.clientY - menuOrbitLastY;
    menuOrbitLastX = e.clientX;
    menuOrbitLastY = e.clientY;
    applyMenuOrbitDrag(menuOrbit, dx, dy);
  };
  const onMenuPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== menuOrbitPointerId) return;
    menuOrbit.dragging = false;
    menuOrbitPointerId = null;
    document.body.style.cursor = '';
  };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();
  const onWheel = (e: WheelEvent) => {
    if (isMenuOrbitAllowed()) {
      applyMenuOrbitZoom(menuOrbit, e.deltaY);
      return;
    }
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
  addEventListener('pointerdown', onMenuPointerDown);
  addEventListener('pointermove', onMenuPointerMove);
  addEventListener('pointerup', onMenuPointerUp);
  addEventListener('pointercancel', onMenuPointerUp);
  addEventListener('contextmenu', onContextMenu);
  addEventListener('wheel', onWheel, { passive: true });

  touchCtl = attachTouchControls({
    isTouchGameplayActive: () => state === 'play' && settings.controlMode === 'touch' && !consoleOpen && !matchEnded,
    onLookDelta: (dx, dy) => {
      if (scoreboardOpen) return;
      const s = 0.0042 * clamp(fovCur / 60, 0.06, 1) * settings.touchSens * (mode === 'third' || spectating ? 1 : settings.sensSniper);
      cam.yaw -= dx * s;
      cam.pitch -= dy * s * (settings.invertY ? -1 : 1);
    },
    onBinocTap: () => {
      if (scoreboardOpen || spectating) return;
      if (mode === 'binoc') {
        snapTurretToView();
        setMode('third');
      }
    },
    onToggleSniper: () => {
      if (spectating || scoreboardOpen) return;
      setMode(mode === 'sniper' ? 'third' : 'sniper');
    },
    onToggleBinoc: () => {
      if (spectating || scoreboardOpen) return;
      setMode(mode === 'binoc' ? 'third' : 'binoc');
    },
    onCycleZoom: () => {
      if (spectating || scoreboardOpen || mode === 'third') return;
      const n = (mode === 'sniper' ? SNIPER_FOV : BINOC_FOV).length;
      zoomIdx = (zoomIdx + 1) % n;
    },
    onReloadMg: () => {
      if (spectating || scoreboardOpen || mode === 'binoc') return;
      tank.reloadMg();
    },
    onActivateAbility: () => {
      if (spectating || scoreboardOpen || mode === 'binoc') return;
      triggerPlayerAbility();
    },
    onActivateAbility2: () => {
      if (spectating || scoreboardOpen || mode === 'binoc') return;
      triggerPlayerSecondaryAbility();
    },
    onKstamHoldStart: () => {
      if (
        spectating ||
        scoreboardOpen ||
        mode === 'binoc' ||
        !tank.alive ||
        tank.spec.ability?.type !== 'kstam_missile' ||
        !tank.abilityState?.primed
      ) {
        return;
      }
      kstamHolding = true;
      kstamLockProg = 0;
      kstamLockTarget = null;
      kstamLockedAnnounced = false;
      kstamTickAcc = 0;
    },
    onKstamHoldEnd: () => {
      releaseKstamLock();
    },
    onPause: () => {
      openPause();
    },
    onToggleScoreboard: () => {
      if (state === 'play' && !matchEnded) {
        setScoreboardOpen(!scoreboardOpen);
      }
    },
  });

  const onSbClose = () => setScoreboardOpen(false);
  const onSpecPrev = () => {
    if (spectating) cycleSpectateTarget(-1);
  };
  const onSpecNext = () => {
    if (spectating) cycleSpectateTarget(1);
  };
  $('bSbClose').addEventListener('click', onSbClose);
  $('bSpecPrev').addEventListener('click', onSpecPrev);
  $('bSpecNext').addEventListener('click', onSpecNext);

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
  function activePlayerMuzzleVelocity(): number {
    if (tank.abilityState?.primed && tank.stats.ability?.type === 'dm63_apfsds') {
      return Math.max(tank.stats.muzzleVelocity, tank.stats.ability.velocityBoost ?? 1160);
    }
    return tank.stats.muzzleVelocity;
  }
  function dropAngle(range: number) {
    const t = range / (activePlayerMuzzleVelocity() * 0.97);
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

  function applyCutsceneCamera(cs: ReturnType<typeof stepCutscene>, _dt: number) {
    const drop = cs.camDropProgress;
    const skyFov = Math.max(settings.fov, 66);
    const nextFov = skyFov + (settings.fov - skyFov) * drop;
    if (Math.abs(camera.fov - nextFov) > 1e-3) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }

    const skyYaw = 0.06;
    const skyPitch = 0.54;
    const viewYaw = skyYaw + (cam.yaw - skyYaw) * drop;
    const viewPitch = skyPitch + (cam.pitch - skyPitch) * drop;
    lookDir(_dir, viewYaw, viewPitch);

    // Start low & slightly ahead of tank gazing skyward; lower cleanly behind tank during camera_drop
    const skyOriginX = tank.root.position.x + 2.5;
    const skyOriginY = tank.root.position.y + 4.0;
    const skyOriginZ = tank.root.position.z + 2.0;

    _pos.copy(tank.root.position);
    _pos.y += 2.8;
    lookDir(_rdir, cam.yaw, cam.pitch);
    const combatOriginX = _pos.x - _rdir.x * camDist;
    const combatOriginY = Math.max(_pos.y - _rdir.y * camDist + 1.4, world.heightAt(_pos.x - _rdir.x * camDist, _pos.z - _rdir.z * camDist) + 1.5);
    const combatOriginZ = _pos.z - _rdir.z * camDist;

    camera.position.set(
      skyOriginX + (combatOriginX - skyOriginX) * drop,
      skyOriginY + (combatOriginY - skyOriginY) * drop,
      skyOriginZ + (combatOriginZ - skyOriginZ) * drop,
    );
    camera.lookAt(camera.position.x + _dir.x * 50, camera.position.y + _dir.y * 50, camera.position.z + _dir.z * 50);
    tank.root.visible = true;
  }

  function menuCamera(dt: number) {
    if (hangarOpen) {
      menuAngle += dt * 0.24;
      const p = previewTank.root.position;
      const dist = 11.2;
      const height = 2.35 + Math.sin(menuAngle * 0.5) * 0.28;
      camera.fov += (52 - camera.fov) * 0.1;
      camera.updateProjectionMatrix();
      const cx = clamp(p.x + Math.sin(menuAngle) * dist, -13.4, 13.4);
      const cy = clamp(p.y + height, 1.5, 7.2);
      const cz = clamp(p.z + Math.cos(menuAngle) * dist, -17.0, 17.0);
      camera.position.set(cx, cy, cz);
      camera.lookAt(p.x, p.y + 2.0, p.z);
      previewTank.root.visible = true;
      return;
    }

    stepMenuOrbitState(menuOrbit, dt, !isSoftwareGl);
    resolveMenuCameraPose(menuOrbit, menuShowcase.heightAt, menuShowcase.cameraColliders, undefined, menuCamPose);
    const targetFov = camera.aspect < 0.85 ? 58 : 48;
    camera.fov += (targetFov - camera.fov) * (isSoftwareGl ? 1 : 0.12);
    camera.updateProjectionMatrix();
    camera.position.set(menuCamPose.x, menuCamPose.y, menuCamPose.z);
    camera.lookAt(menuCamPose.targetX, menuCamPose.targetY, menuCamPose.targetZ);
    menuTank.root.visible = true;
  }

  const scopeCv = $<HTMLCanvasElement>('scope');
  const sctx = scopeCv.getContext('2d')!;
  const scopeState = {
    key: '',
  };
  function resizeScope() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scopeCv.width = innerWidth * dpr;
    scopeCv.height = innerHeight * dpr;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scopeState.key = '';
  }
  resizeScope();

  function drawScope() {
    const W = innerWidth;
    const H = innerHeight;
    const scopeBroken = tank.gunDownT > 0;
    const scopeFracPct = Math.round(tank.reloadFraction * 100);
    const rLabel = scopeBroken ? Math.ceil(tank.gunDownT) + t('hudSecShort') : tank.ready ? t('hudGunReady') : tank.reloadTimer.toFixed(1);
    const fovRound = Math.round(fovCur * 20);
    const key = `${W}x${H}|${mode}|${fovRound}|${scopeBroken ? 1 : 0}|${scopeFracPct}|${rLabel}`;
    if (key === scopeState.key) return;
    scopeState.key = key;
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
    g.fillText(broken ? Math.ceil(tank.gunDownT) + t('hudSecShort') : tank.ready ? t('hudGunReady') : tank.reloadTimer.toFixed(1), rx, ry);
    g.textAlign = 'left';
    g.fillStyle = '#ffd27a';
    g.font = '13px Consolas, monospace';
    g.fillText(mode === 'sniper' ? t('hudSniper') : t('hudBinoc'), cx - R + 14, cy - R * 0.9 + 40);
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
    bossBar: $('bossBar'),
    bossFill: $('bossFill'),
    bossHpText: $('bossHpText'),
    bossFlameFill: $('bossFlameFill'),
    bossFlameText: $('bossFlameText'),
    specBar: $('spectatorBar'),
    specName: $('specTargetName'),
    specHp: $('specTargetHp'),
    mgHud: $('mgHud'),
    mgKeyLabel: $('mgKeyLabel'),
    mgAmmo: $('mgAmmo'),
    mgBarFill: $('mgBarFill'),
    mgStateTxt: $('mgStateTxt'),
    apsBadge: $('apsBadge'),
    apsBadgeLbl: $('apsBadgeLbl'),
    apsBadgeState: $('apsBadgeState'),
    abilityBadge: $('abilityBadge'),
    abilityBadgeLbl: $('abilityBadgeLbl'),
    abilityBadgeState: $('abilityBadgeState'),
    ability2Badge: $('ability2Badge'),
    ability2BadgeLbl: $('ability2BadgeLbl'),
    ability2BadgeState: $('ability2BadgeState'),
    weakspotHud: $('weakspotHud'),
    weakspotTarget: $('weakspotTarget'),
    weakspotRows: $('weakspotRows'),
    kstamReticle: $('kstamReticle'),
    kstamTxt: $('kstamTxt'),
    tBtnFire: $('tBtnFire'),
    tFireReloadTxt: $('tFireReloadTxt'),
    tBtnMg: $('tBtnMg'),
    tMgAmmoTxt: $('tMgAmmoTxt'),
    tBtnSniper: $('tBtnSniper'),
    tBtnBinoc: $('tBtnBinoc'),
    tBtnAbility: $('tBtnAbility'),
    tBtnAbility2: $('tBtnAbility2'),
    tBtnKstamLock: $('tBtnKstamLock'),
    tBtnZoom: $('tBtnZoom'),
  };
  el.mv.textContent = String(tank.stats.muzzleVelocity);
  if (el.tankTag) el.tankTag.textContent = tank.spec.name;
  const bearing = (rad: number) => String(Math.round((((-rad / DEG) % 360) + 360) % 360)).padStart(3, '0');
  const _gm = new THREE.Vector3();
  const _gd = new THREE.Vector3();
  const _pr = new THREE.Vector3();
  const _candV = new THREE.Vector3();

  function findSightEnemy(maxDist: number, minDot: number): { target: Tank; dist: number } | null {
    lookDir(_dir, cam.yaw, cam.pitch);
    let best: Tank | null = null;
    let bestScore = -Infinity;
    let bestDist = 0;
    for (let i = 0; i < allTanksList.length; i++) {
      const cand = allTanksList[i];
      if (!cand.alive || cand.team === tank.team) continue;
      _candV.set(cand.root.position.x - camOrigin.x, cand.root.position.y + 1.4 - camOrigin.y, cand.root.position.z - camOrigin.z);
      const dist = _candV.length();
      if (dist < 1 || dist > maxDist) continue;
      const dot = (_candV.x * _dir.x + _candV.y * _dir.y + _candV.z * _dir.z) / dist;
      if (dot < minDot) continue;
      const score = dot * 100 - dist * 0.005;
      if (score > bestScore) {
        bestScore = score;
        best = cand;
        bestDist = dist;
      }
    }
    return best ? { target: best, dist: bestDist } : null;
  }

  function clearThermalVisuals() {
    if (lastThermalOn) {
      lastThermalOn = false;
      document.body.classList.remove('thermal-active');
    }
    for (let i = 0; i < allTanksList.length; i++) {
      allTanksList[i].setThermalHighlight(false, false);
    }
    if (el.weakspotHud) el.weakspotHud.classList.add('hidden');
    if (hudCache) {
      hudCache.weakspotVisible = false;
      hudCache.kstamVisible = false;
      hudCache.kstamLocked = false;
    }
  }
  let fpsAcc = 0;
  let fpsN = 0;

  const hudCache = {
    speed: '',
    gear: '',
    hull: '',
    tur: '',
    range: '',
    zoom: '',
    comp: '',
    mode: '',
    ringP: '',
    ringLoading: false,
    ringBroken: false,
    rtxt: '',
    hpW: '',
    hpBg: '',
    tankTag: '',
    bossVisible: false,
    bossFillW: '',
    bossHpText: '',
    bossFlameW: '',
    bossFlameOverheat: false,
    bossFlameText: '',
    kills: '',
    alive: '',
    dmg: '',
    crossDisplay: '',
    scopeDisplay: '',
    gunDisplay: '',
    gunSize: '',
    gunMargin: '',
    gunLeft: '',
    gunTop: '',
    specVisible: false,
    specName: '',
    specHp: '',
    mgKey: '',
    mgAmmo: '',
    mgBarW: '',
    mgStateTxt: '',
    mgReloading: false,
    mgEmpty: false,
    apsVisible: false,
    apsReady: true,
    apsLbl: '',
    apsTxt: '',
    abilityVisible: false,
    abilityMode: '',
    abilityLbl: '',
    abilityTxt: '',
    ability2Visible: false,
    ability2Mode: '',
    ability2Lbl: '',
    ability2Txt: '',
    kstamVisible: false,
    kstamLocked: false,
    kstamTxt: '',
    weakspotVisible: false,
    weakspotTarget: '',
    mv: '',
    survivalTimer: '',
    survivalUrgent: false,
    survivalKills: '',
    tFireTxt: '',
    tFireLoading: false,
    tFireBroken: false,
    tMgTxt: '',
    tMgReloading: false,
    tMgEmpty: false,
    tSniperActive: false,
    tBinocActive: false,
    tAbilityVisible: false,
    tAbilityMode: '',
    tAbilityTxt: '',
    tAbility2Visible: false,
    tAbility2Mode: '',
    tAbility2Txt: '',
    tKstamHoldVisible: false,
    tZoomVisible: false,
    tZoomTxt: '',
  };

  const _ip = new THREE.Vector3();
  const _iv = new THREE.Vector3();
  const _ip2 = new THREE.Vector3();
  function predictImpact(): THREE.Vector3 {
    _ip.copy(_gm);
    _iv.copy(_gd).multiplyScalar(activePlayerMuzzleVelocity());
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
    const touchThr = settings.controlMode === 'touch' && touchCtl ? touchCtl.state.throttle : 0;
    const thr = clamp((keys[settings.keys.forward] ? 1 : 0) - (keys[settings.keys.back] ? 1 : 0) + touchThr, -1, 1);

    const speedTxt = String(Math.round(v * 3.6));
    if (speedTxt !== hudCache.speed) {
      hudCache.speed = speedTxt;
      el.speed.textContent = speedTxt;
    }

    const gearTxt =
      tank.speed < -0.4 || (v < 0.4 && thr < 0)
        ? 'R'
        : v < 0.4 && thr === 0
          ? 'N'
          : v < 3.5
            ? '1'
            : v < 7
              ? '2'
              : v < 11
                ? '3'
                : v < 17
                  ? '4'
                  : '5';
    if (gearTxt !== hudCache.gear) {
      hudCache.gear = gearTxt;
      el.gear.textContent = gearTxt;
    }

    const hullTxt = bearing(tank.heading);
    if (hullTxt !== hudCache.hull) {
      hudCache.hull = hullTxt;
      el.hull.textContent = hullTxt;
    }

    const turTxt = bearing(tank.turretWorldYaw);
    if (turTxt !== hudCache.tur) {
      hudCache.tur = turTxt;
      el.tur.textContent = turTxt;
    }

    const rangeTxt = aim.range ? Math.round(aim.range) + ' ' + t('hudMetersUnit') : '---';
    if (rangeTxt !== hudCache.range) {
      hudCache.range = rangeTxt;
      el.range.textContent = rangeTxt;
    }

    const zoomTxt = 'x' + (mode === 'third' ? 1 : 60 / fovCur).toFixed(1);
    if (zoomTxt !== hudCache.zoom) {
      hudCache.zoom = zoomTxt;
      el.zoom.textContent = zoomTxt;
    }

    const compTxt = ballComp ? t('hudCompOn') : t('hudCompOff');
    if (compTxt !== hudCache.comp) {
      hudCache.comp = compTxt;
      el.comp.textContent = compTxt;
    }

    const mvTxt = String(Math.round(activePlayerMuzzleVelocity()));
    if (mvTxt !== hudCache.mv) {
      hudCache.mv = mvTxt;
      el.mv.textContent = mvTxt;
    }

    const modeTxt =
      mode === 'third'
        ? t('hudThirdPerson')
        : mode === 'sniper'
          ? t('hudSniper')
          : binocFrozen
            ? t('hudBinocAim')
            : t('hudBinoc');
    if (modeTxt !== hudCache.mode) {
      hudCache.mode = modeTxt;
      el.mode.textContent = modeTxt;
    }

    const broken = tank.gunDownT > 0;
    const ringP = String(Math.round(tank.reloadFraction * 100));
    if (ringP !== hudCache.ringP) {
      hudCache.ringP = ringP;
      el.ring.style.setProperty('--p', ringP);
    }
    const ringLoading = !tank.ready && !broken;
    if (ringLoading !== hudCache.ringLoading) {
      hudCache.ringLoading = ringLoading;
      el.ring.classList.toggle('loading', ringLoading);
    }
    if (broken !== hudCache.ringBroken) {
      hudCache.ringBroken = broken;
      el.ring.classList.toggle('broken', broken);
    }
    const rtxt = broken ? Math.ceil(tank.gunDownT) + t('hudSecShort') : tank.ready ? t('hudGunReady') : tank.reloadTimer.toFixed(1);
    if (rtxt !== hudCache.rtxt) {
      hudCache.rtxt = rtxt;
      el.rtxt.textContent = rtxt;
    }

    const hpPct = Math.max(0, Math.min(100, (tank.hp / tank.maxHp) * 100));
    const hpW = hpPct.toFixed(1) + '%';
    if (hpW !== hudCache.hpW) {
      hudCache.hpW = hpW;
      el.hp.style.width = hpW;
    }
    const hpBg = hpPct > 60 ? '#8fe36a' : hpPct > 30 ? '#ffb43c' : '#ff4a3a';
    if (hpBg !== hudCache.hpBg) {
      hudCache.hpBg = hpBg;
      el.hp.style.background = hpBg;
    }
    const displayHp = tank.alive && tank.hp > 0 ? Math.ceil(tank.hp) : 0;
    const tagTxt = `${tank.spec.name} · ${displayHp}/${tank.maxHp}`;
    if (el.tankTag && tagTxt !== hudCache.tankTag) {
      hudCache.tankTag = tagTxt;
      el.tankTag.textContent = tagTxt;
    }

    const mgSpec = tank.stats.mg;
    const mgSt = tank.mgState;
    const mgKeyTxt = t('hudMgLabel', { key: keyName(settings.keys.mg).toUpperCase() });
    if (mgKeyTxt !== hudCache.mgKey) {
      hudCache.mgKey = mgKeyTxt;
      el.mgKeyLabel.textContent = mgKeyTxt;
    }
    const mgAmmoTxt = `${mgSt.magAmmo} / ${mgSt.reserveAmmo}`;
    if (mgAmmoTxt !== hudCache.mgAmmo) {
      hudCache.mgAmmo = mgAmmoTxt;
      el.mgAmmo.textContent = mgAmmoTxt;
    }
    const mgReloading = mgSt.reloadT > 0;
    const mgEmpty = !mgReloading && isMgExhausted(mgSt);
    if (mgReloading !== hudCache.mgReloading) {
      hudCache.mgReloading = mgReloading;
      el.mgHud.classList.toggle('reloading', mgReloading);
    }
    if (mgEmpty !== hudCache.mgEmpty) {
      hudCache.mgEmpty = mgEmpty;
      el.mgHud.classList.toggle('empty', mgEmpty);
    }
    const mgFrac = mgReloading ? 1 - mgSt.reloadT / Math.max(0.1, mgSpec.reloadTime) : mgSt.magAmmo / Math.max(1, mgSpec.magSize);
    const mgBarW = Math.round(clamp(mgFrac, 0, 1) * 100) + '%';
    if (mgBarW !== hudCache.mgBarW) {
      hudCache.mgBarW = mgBarW;
      el.mgBarFill.style.width = mgBarW;
    }
    const mgTxt = mgReloading
      ? t('hudMgReloading', { t: mgSt.reloadT.toFixed(1) })
      : mgEmpty
        ? t('hudMgOutOfAmmo')
        : mgSt.magAmmo < mgSpec.magSize && mgSt.reserveAmmo > 0
          ? t('hudMgReloadPrompt')
          : t('hudMgReady');
    if (mgTxt !== hudCache.mgStateTxt) {
      hudCache.mgStateTxt = mgTxt;
      el.mgStateTxt.textContent = mgTxt;
    }

    const apsVisible = !!(tank.spec.aps && tank.apsState && !spectating && tank.alive);
    if (apsVisible !== hudCache.apsVisible) {
      hudCache.apsVisible = apsVisible;
      el.apsBadge.classList.toggle('hidden', !apsVisible);
    }
    if (apsVisible && tank.apsState) {
      const apsLbl = t('hudApsName');
      if (apsLbl !== hudCache.apsLbl) {
        hudCache.apsLbl = apsLbl;
        el.apsBadgeLbl.textContent = apsLbl;
      }
      const apsReady = tank.apsState.cooldown <= 0;
      if (apsReady !== hudCache.apsReady) {
        hudCache.apsReady = apsReady;
        el.apsBadge.classList.toggle('ready', apsReady);
        el.apsBadge.classList.toggle('cooling', !apsReady);
      }
      const apsTxt = apsReady ? t('hudApsReady') : t('hudApsCooldown', { t: tank.apsState.cooldown.toFixed(1) });
      if (apsTxt !== hudCache.apsTxt) {
        hudCache.apsTxt = apsTxt;
        el.apsBadgeState.textContent = apsTxt;
      }
    }

    const abSpec = tank.spec.ability;
    const abSt = tank.abilityState;
    const abilityVisible = !!(abSpec && abSt && !spectating && tank.alive);
    if (abilityVisible !== hudCache.abilityVisible) {
      hudCache.abilityVisible = abilityVisible;
      el.abilityBadge.classList.toggle('hidden', !abilityVisible);
    }
    let abMode = 'ready';
    let abStateShort = t('hudAbilityReady');
    if (abSpec && abSt) {
      if (abSpec.type === 'galix_overdrive' && abSt.activeRemaining > 0.01) {
        abMode = 'active';
        abStateShort = t('hudAbilityActive', { t: abSt.activeRemaining.toFixed(1) });
      } else if (abSpec.type === 'thermal_sight' && abSt.activeRemaining > 0.01) {
        abMode = 'active';
        abStateShort = t('hudAbilityThermalActive', { t: abSt.activeRemaining.toFixed(1) });
      } else if ((abSpec.type === 'dm63_apfsds' || abSpec.type === 'kstam_missile') && abSt.primed) {
        abMode = 'primed';
        abStateShort = t('hudAbilityPrimed');
      } else if (abSt.cooldownRemaining > 0.01) {
        abMode = 'cooling';
        abStateShort = t('hudAbilityCooldown', { t: abSt.cooldownRemaining.toFixed(1) });
      }
    }
    if (abilityVisible && abSpec && abSt) {
      const abKeyStr = keyName(settings.keys.ability).toUpperCase();
      const abLbl =
        abSpec.type === 'galix_overdrive'
          ? t('hudAbilityGalix', { key: abKeyStr })
          : abSpec.type === 'thermal_sight'
            ? t('hudAbilityThermal', { key: abKeyStr })
            : abSpec.type === 'kstam_missile'
              ? t('hudAbilityKstam', { key: abKeyStr })
              : t('hudAbilityDm63', { key: abKeyStr });
      if (abLbl !== hudCache.abilityLbl) {
        hudCache.abilityLbl = abLbl;
        el.abilityBadgeLbl.textContent = abLbl;
      }
      if (abMode !== hudCache.abilityMode) {
        hudCache.abilityMode = abMode;
        el.abilityBadge.classList.toggle('ready', abMode === 'ready');
        el.abilityBadge.classList.toggle('active', abMode === 'active');
        el.abilityBadge.classList.toggle('primed', abMode === 'primed');
        el.abilityBadge.classList.toggle('cooling', abMode === 'cooling');
      }
      if (abStateShort !== hudCache.abilityTxt) {
        hudCache.abilityTxt = abStateShort;
        el.abilityBadgeState.textContent = abStateShort;
      }
    }

    const ab2Spec = tank.spec.secondaryAbility;
    const ab2St = tank.secondaryAbilityState;
    const ability2Visible = !!(ab2Spec && ab2St && !spectating && tank.alive);
    if (ability2Visible !== hudCache.ability2Visible) {
      hudCache.ability2Visible = ability2Visible;
      el.ability2Badge.classList.toggle('hidden', !ability2Visible);
    }
    let ab2Mode = 'ready';
    let ab2StateShort = t('hudAbilityReady');
    if (ab2Spec && ab2St) {
      if (ab2St.activeRemaining > 0.01) {
        ab2Mode = 'active';
        ab2StateShort = t('hudAbilityBarrageActive', { t: ab2St.activeRemaining.toFixed(1) });
      } else if (ab2St.cooldownRemaining > 0.01) {
        ab2Mode = 'cooling';
        ab2StateShort = t('hudAbilityCooldown', { t: ab2St.cooldownRemaining.toFixed(1) });
      }
    }
    if (ability2Visible && ab2Spec && ab2St) {
      const ab2Lbl = t('hudAbility2Barrage', { key: 'F' });
      if (ab2Lbl !== hudCache.ability2Lbl) {
        hudCache.ability2Lbl = ab2Lbl;
        el.ability2BadgeLbl.textContent = ab2Lbl;
      }
      if (ab2Mode !== hudCache.ability2Mode) {
        hudCache.ability2Mode = ab2Mode;
        el.ability2Badge.classList.toggle('ready', ab2Mode === 'ready');
        el.ability2Badge.classList.toggle('active', ab2Mode === 'active');
        el.ability2Badge.classList.toggle('cooling', ab2Mode === 'cooling');
      }
      if (ab2StateShort !== hudCache.ability2Txt) {
        hudCache.ability2Txt = ab2StateShort;
        el.ability2BadgeState.textContent = ab2StateShort;
      }
    }

    const bossVisible = !!(boss && !matchEnded);
    if (bossVisible !== hudCache.bossVisible) {
      hudCache.bossVisible = bossVisible;
      el.bossBar.classList.toggle('hidden', !bossVisible);
    }
    if (bossVisible && boss) {
      const pct = Math.max(0, Math.min(100, (boss.tank.hp / boss.tank.maxHp) * 100));
      const bossW = pct.toFixed(2) + '%';
      if (bossW !== hudCache.bossFillW) {
        hudCache.bossFillW = bossW;
        el.bossFill.style.width = bossW;
      }
      const bossHp = `${Math.max(0, Math.ceil(boss.tank.hp))} / ${boss.tank.maxHp}`;
      if (bossHp !== hudCache.bossHpText) {
        hudCache.bossHpText = bossHp;
        el.bossHpText.textContent = bossHp;
      }

      const heatPct = Math.round(boss.heatState.heat * 100);
      const flameW = heatPct + '%';
      if (flameW !== hudCache.bossFlameW) {
        hudCache.bossFlameW = flameW;
        el.bossFlameFill.style.width = flameW;
      }
      if (boss.heatState.overheated !== hudCache.bossFlameOverheat) {
        hudCache.bossFlameOverheat = boss.heatState.overheated;
        el.bossFlameFill.classList.toggle('overheat', boss.heatState.overheated);
      }
      const flameTxt = boss.heatState.overheated ? t('hudBossOverheat') : t('hudBossFlamePct', { pct: heatPct });
      if (flameTxt !== hudCache.bossFlameText) {
        hudCache.bossFlameText = flameTxt;
        el.bossFlameText.textContent = flameTxt;
      }
    }

    const killsTxt = String(kills);
    if (killsTxt !== hudCache.kills) {
      hudCache.kills = killsTxt;
      el.kills.textContent = killsTxt;
    }
    const aliveTxt = isBombardmentMode(currentModeId) ? t('aliveSolo') : countAlive(teamATanks) + ' v ' + countAlive(teamBTanks);
    if (aliveTxt !== hudCache.alive) {
      hudCache.alive = aliveTxt;
      el.alive.textContent = aliveTxt;
    }

    let d = '';
    if (tank.immobT > 0) d += t('hudTrackDamagedRepair', { t: Math.ceil(tank.immobT) });
    if (tank.gunDownT > 0) d += (d ? '<br>' : '') + t('hudBarrelDamagedRepair', { t: Math.ceil(tank.gunDownT) });
    if (boss && boss.playerFire.inFlame) {
      d += (d ? '<br>' : '') + t('hudOnFireDps', { dps: boss.playerFire.directDps });
    } else if (boss && boss.playerFire.burnRemaining > 0) {
      d += (d ? '<br>' : '') + t('hudBurningDps', { t: Math.ceil(boss.playerFire.burnRemaining) });
    }
    if (d !== hudCache.dmg) {
      hudCache.dmg = d;
      el.dmg.innerHTML = d;
    }

    if (flags.fps) {
      fpsAcc += dt;
      fpsN++;
      if (fpsAcc > 0.5) {
        el.fps.textContent = Math.round(fpsN / fpsAcc) + ' FPS';
        fpsAcc = 0;
        fpsN = 0;
      }
    }

    const crossDisp = !spectating && mode === 'third' ? 'block' : 'none';
    if (crossDisp !== hudCache.crossDisplay) {
      hudCache.crossDisplay = crossDisp;
      el.cross.style.display = crossDisp;
    }

    const scoped = !spectating && mode !== 'third';
    const scopeDisp = scoped ? 'block' : 'none';
    if (scopeDisp !== hudCache.scopeDisplay) {
      hudCache.scopeDisplay = scopeDisp;
      scopeCv.style.display = scopeDisp;
    }
    if (scoped) drawScope();

    if (settings.controlMode === 'touch') {
      if (rtxt !== hudCache.tFireTxt) {
        hudCache.tFireTxt = rtxt;
        el.tFireReloadTxt.textContent = rtxt;
      }
      if (ringLoading !== hudCache.tFireLoading) {
        hudCache.tFireLoading = ringLoading;
        el.tBtnFire.classList.toggle('loading', ringLoading);
      }
      if (broken !== hudCache.tFireBroken) {
        hudCache.tFireBroken = broken;
        el.tBtnFire.classList.toggle('broken', broken);
      }

      const tMgTxt = mgReloading ? `${mgSt.reloadT.toFixed(1)}${t('hudSecShort')}` : `${mgSt.magAmmo}/${mgSt.reserveAmmo}`;
      if (tMgTxt !== hudCache.tMgTxt) {
        hudCache.tMgTxt = tMgTxt;
        el.tMgAmmoTxt.textContent = tMgTxt;
      }
      if (mgReloading !== hudCache.tMgReloading) {
        hudCache.tMgReloading = mgReloading;
        el.tBtnMg.classList.toggle('reloading', mgReloading);
      }
      if (mgEmpty !== hudCache.tMgEmpty) {
        hudCache.tMgEmpty = mgEmpty;
        el.tBtnMg.classList.toggle('empty', mgEmpty);
      }

      const sniperActive = mode === 'sniper';
      if (sniperActive !== hudCache.tSniperActive) {
        hudCache.tSniperActive = sniperActive;
        el.tBtnSniper.classList.toggle('active', sniperActive);
      }
      const binocActive = mode === 'binoc';
      if (binocActive !== hudCache.tBinocActive) {
        hudCache.tBinocActive = binocActive;
        el.tBtnBinoc.classList.toggle('active', binocActive);
      }
      if (abilityVisible !== hudCache.tAbilityVisible) {
        hudCache.tAbilityVisible = abilityVisible;
        el.tBtnAbility.classList.toggle('hidden', !abilityVisible);
      }
      if (abilityVisible && abSpec) {
        if (abMode !== hudCache.tAbilityMode) {
          hudCache.tAbilityMode = abMode;
          el.tBtnAbility.classList.toggle('ready', abMode === 'ready');
          el.tBtnAbility.classList.toggle('active', abMode === 'active');
          el.tBtnAbility.classList.toggle('primed', abMode === 'primed');
          el.tBtnAbility.classList.toggle('cooling', abMode === 'cooling');
        }
        const tAbTxt =
          abSpec.type === 'galix_overdrive'
            ? t('tBtnAbilityGalix', { state: abStateShort })
            : abSpec.type === 'thermal_sight'
              ? t('tBtnAbilityThermal', { state: abStateShort })
              : abSpec.type === 'kstam_missile'
                ? t('tBtnAbilityKstam', { state: abStateShort })
                : t('tBtnAbilityDm63', { state: abStateShort });
        if (tAbTxt !== hudCache.tAbilityTxt) {
          hudCache.tAbilityTxt = tAbTxt;
          el.tBtnAbility.textContent = tAbTxt;
        }
      }
      if (ability2Visible !== hudCache.tAbility2Visible) {
        hudCache.tAbility2Visible = ability2Visible;
        el.tBtnAbility2.classList.toggle('hidden', !ability2Visible);
      }
      if (ability2Visible && ab2Spec) {
        if (ab2Mode !== hudCache.tAbility2Mode) {
          hudCache.tAbility2Mode = ab2Mode;
          el.tBtnAbility2.classList.toggle('ready', ab2Mode === 'ready');
          el.tBtnAbility2.classList.toggle('active', ab2Mode === 'active');
          el.tBtnAbility2.classList.toggle('cooling', ab2Mode === 'cooling');
        }
        const tAb2Txt = t('tBtnAbilityBarrage', { state: ab2StateShort });
        if (tAb2Txt !== hudCache.tAbility2Txt) {
          hudCache.tAbility2Txt = tAb2Txt;
          el.tBtnAbility2.textContent = tAb2Txt;
        }
      }
      const kstamHoldVis = !!(abilityVisible && abSpec?.type === 'kstam_missile' && abSt?.primed);
      if (kstamHoldVis !== hudCache.tKstamHoldVisible) {
        hudCache.tKstamHoldVisible = kstamHoldVis;
        el.tBtnKstamLock.classList.toggle('hidden', !kstamHoldVis);
        el.tBtnKstamLock.textContent = t('tBtnKstamHold');
      }
      const zoomVisible = !spectating && mode !== 'third';
      if (zoomVisible !== hudCache.tZoomVisible) {
        hudCache.tZoomVisible = zoomVisible;
        el.tBtnZoom.classList.toggle('hidden', !zoomVisible);
      }
      if (zoomVisible) {
        const tZoomTxt = t('tBtnZoomVal', { val: zoomTxt });
        if (tZoomTxt !== hudCache.tZoomTxt) {
          hudCache.tZoomTxt = tZoomTxt;
          el.tBtnZoom.textContent = tZoomTxt;
        }
      }
    }

    if (spectating) {
      if (hudCache.gunDisplay !== 'none') {
        hudCache.gunDisplay = 'none';
        el.gun.style.display = 'none';
      }
      return;
    }

    tank.muzzleWorld(_gm);
    tank.gunDirection(_gd);
    const impact = predictImpact();
    _pr.copy(impact).project(camera);
    if (_pr.z > 1 || _pr.z < -1) {
      if (hudCache.gunDisplay !== 'none') {
        hudCache.gunDisplay = 'none';
        el.gun.style.display = 'none';
      }
    } else {
      if (hudCache.gunDisplay !== 'block') {
        hudCache.gunDisplay = 'block';
        el.gun.style.display = 'block';
      }
      const sz = mode === 'third' ? 18 : 14;
      const szPx = sz + 'px';
      if (szPx !== hudCache.gunSize) {
        hudCache.gunSize = szPx;
        hudCache.gunMargin = -sz / 2 + 'px';
        el.gun.style.width = el.gun.style.height = szPx;
        el.gun.style.marginLeft = el.gun.style.marginTop = hudCache.gunMargin;
      }
      const leftPx = Math.round((_pr.x * 0.5 + 0.5) * innerWidth) + 'px';
      const topPx = Math.round((-_pr.y * 0.5 + 0.5) * innerHeight) + 'px';
      if (leftPx !== hudCache.gunLeft) {
        hudCache.gunLeft = leftPx;
        el.gun.style.left = leftPx;
      }
      if (topPx !== hudCache.gunTop) {
        hudCache.gunTop = topPx;
        el.gun.style.top = topPx;
      }
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

  function getCombatResultText(result: string): string {
    const map: Record<string, string> = {
      pen: t('msgPen'),
      crit: t('msgCrit'),
      nopen: t('msgNopen'),
      ricochet: t('msgRicochet'),
      track: t('msgTrack'),
      barrel: t('msgBarrel'),
      fuel: t('msgFuel'),
    };
    return map[result] || t('msgPen');
  }
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
    amt.textContent = t('hudSilverToast', { amt: amount });
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
    $('sbModeName').textContent = getModeText(activeMode.id).name.toUpperCase();
    if (isBombardmentMode(activeMode.id)) {
      $('sbTeamScore').textContent = t('sbSoloSurvival', { time: formatCountdown(survivalRemaining) });
    } else if (activeMode.survivalSeconds && activeMode.survivalSeconds > 0) {
      $('sbTeamScore').textContent = t('sbSurvivalScore', { time: formatCountdown(survivalRemaining), kills });
    } else if (activeMode.roundsToWin > 0) {
      $('sbTeamScore').textContent = t('sbRoundsScore', { round: roundNum, a: teamARounds, b: teamBRounds, win: activeMode.roundsToWin });
    } else if (activeMode.targetKills > 0) {
      $('sbTeamScore').textContent = t('sbWeVsEnemiesGoal', { a: teamAKills, b: teamBKills, goal: activeMode.targetKills });
    } else if (activeMode.boss) {
      $('sbTeamScore').textContent = boss ? t('sbBossScore', { hp: Math.max(0, Math.round(boss.tank.hp)), max: boss.tank.maxHp }) : '';
    } else {
      $('sbTeamScore').textContent = t('sbWeVsEnemiesTraining', { a: teamAKills, b: teamBKills });
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

  function recordCurrentMatch(won: boolean, scoreText: string) {
    if (matchRecorded) return;
    const activeMode = getModeDef(currentModeId);
    if (activeMode.recordHistory === false) return;
    matchRecorded = true;
    const activeMap = MAPS.find((m) => m.id === currentMap);
    recordMatchHistory({
      modeId: activeMode.id,
      modeName: activeMode.name,
      mapId: currentMap,
      mapName: activeMap?.name,
      won,
      tankId: tank.spec.id,
      tankName: tank.spec.name,
      scoreText,
      playerKills: kills,
      playerDeaths: tank.matchDeaths,
      silverEarned: matchSilverEarned,
    });
  }

  function finishMatch(winner: 'A' | 'B', victorySilver: number) {
    if (matchEnded) return;
    matchEnded = true;
    cutsceneActive = false;
    hideCutsceneOverlay();
    state = 'matchEnd';
    if (gcon.open) gcon.close();
    spectating = false;
    $('spectatorBar').classList.add('hidden');
    hudCache.specVisible = false;
    deadEl.style.display = 'none';
    showRoundBanner(null);
    setScoreboardOpen(false);
    mouseDown = false;
    fireQueued = false;
    kstamHolding = false;
    kstamLockProg = 0;
    kstamLockTarget = null;
    kstamLockedAnnounced = false;
    clearThermalVisuals();
    touchCtl?.reset();
    locked = false;
    for (const k in keys) keys[k] = false;
    if (document.pointerLockElement) document.exitPointerLock();
    audio.engineSilence();
    audio.musicFadeOut(0.45);
    if (victorySilver > 0) {
      addSilver(victorySilver);
      matchSilverEarned += victorySilver;
      ui.refreshSilver();
      audio.ui('victory');
    }
    const activeMode = getModeDef(currentModeId);
    const isRounds = activeMode.roundsToWin > 0;
    const isSurvival = !!(activeMode.survivalSeconds && activeMode.survivalSeconds > 0);
    const teamAScore = isRounds ? teamARounds : teamAKills;
    const teamBScore = isRounds ? teamBRounds : teamBKills;

    let scoreText: string | undefined;
    let subLabel: string | undefined;
    let scoreLabel = isRounds ? t('meScoreRounds') : t('meScoreTeams');
    let historyScore = `${teamAScore} : ${teamBScore}`;

    if (isSurvival && activeMode.survivalSeconds) {
      const totalStr = formatCountdown(activeMode.survivalSeconds);
      const survivedStr = winner === 'A' ? totalStr : formatCountdown(Math.min(activeMode.survivalSeconds, survivalElapsed));
      scoreLabel = t('meScoreSurvival');
      scoreText = winner === 'A' ? `${totalStr} / ${totalStr}` : `${survivedStr} / ${totalStr}`;
      subLabel = winner === 'A'
        ? t('meSubSurvivalSurvived', { mode: getModeText(activeMode.id).name.toUpperCase(), time: totalStr })
        : t('meSubSurvivalLived', { mode: getModeText(activeMode.id).name.toUpperCase(), time: survivedStr });
      historyScore = t('meScoreSurvivalHistory', { time: winner === 'A' ? totalStr : survivedStr, kills });
    }

    recordCurrentMatch(winner === 'A', historyScore);

    msgEl.style.opacity = '0';
    msgEl.textContent = '';
    el.kills.textContent = String(kills);
    hudCache.kills = String(kills);
    document.body.dataset.state = 'matchEnd';
    ui.showMatchEnd({
      won: winner === 'A',
      modeName: getModeText(activeMode.id).name,
      scoreLabel,
      scoreText,
      subLabel,
      teamAScore,
      teamBScore,
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
    audio.musicFadeOut(0.45);
    const reward = getModeDef(currentModeId).victoryRewardSilver;
    addSilver(reward); // сохраняется в localStorage сразу
    matchSilverEarned += reward;
    ui.refreshSilver();
    audio.ui('victory');
    showSilverToast(reward, t('meMausToast'), true);
    recordCurrentMatch(true, t('meMausHistory', { kills }));
    mouseDown = false;
    fireQueued = false;
    touchCtl?.reset();
    setScoreboardOpen(false);
    spectating = false;
    $('spectatorBar').classList.add('hidden');
    hudCache.specVisible = false;
    deadEl.style.display = 'none';
    showRoundBanner(null);
    $('bossBar').classList.add('hidden');
    hudCache.bossVisible = false;
    const vb = $('victoryBanner');
    vb.textContent = t('meBannerVictoryWork');
    vb.classList.remove('hidden');
    jugVictoryT = 1.8;
  }

  function handleTankDestroyed(target: Tank, owner: Tank | null, suffix = '') {
    if (target.isBoss) {
      target.matchDeaths++;
      if (owner === tank) {
        kills = ++tank.matchKills;
        el.kills.textContent = String(kills);
        hudCache.kills = String(kills);
      }
      feed(`${owner ? owner.name : '?'}  >  ${target.name}${suffix}`, 'ally');
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
        hudCache.kills = String(kills);
        if (activeMode.silverRewards) {
          const reward = computeKillReward(kills);
          addSilver(reward.totalSilver);
          matchSilverEarned += reward.totalSilver;
          ui.refreshSilver();
          showSilverToast(reward.baseSilver, t('meTargetDestroyedToast', { target: target.name }));
          if (reward.streakBonus > 0 && reward.bonusLabel) {
            showSilverToast(reward.streakBonus, reward.bonusLabel, true);
          }
          audio.ui('silver');
        }
      }

      if (activeMode.roundsToWin > 0 && roundPhase === 'active') {
        const aliveA = countAlive(teamATanks);
        const aliveB = countAlive(teamBTanks);
        const rEval = evaluateRoundState(aliveA, aliveB, teamARounds, teamBRounds, activeMode.roundsToWin, activeMode.victoryRewardSilver);
        if (rEval.roundEnded && rEval.roundWinner) {
          teamARounds = rEval.teamARounds;
          teamBRounds = rEval.teamBRounds;
          roundPhase = 'intermission';
          roundEndT = rEval.matchFinished ? 2.0 : 2.5;
          spectating = false;
          $('spectatorBar').classList.add('hidden');
          hudCache.specVisible = false;
          $('dead').style.display = 'none';
          const winTxt = rEval.roundWinner === 'A' ? t('msgRoundWinBanner') : t('msgRoundLossBanner');
          showRoundBanner(t('msgRoundFullBanner', { round: roundNum, res: winTxt, a: teamARounds, b: teamBRounds }), rEval.roundWinner === 'A' ? '#8fe36a' : '#ff6a4a');
          if (rEval.matchFinished && rEval.matchWinner) {
            pendingRoundMatchWinner = { winner: rEval.matchWinner, victorySilver: rEval.victorySilver };
          }
        }
      }

      updateModeScoreHud();
      if (scoreboardOpen) renderScoreboard();

      if (activeMode.survivalSeconds && activeMode.survivalSeconds > 0 && target === tank) {
        const line = owner ? `${owner.name}  >  ${target.name}${suffix}` : `${target.name}${suffix}`;
        feed(line, 'ally');
        finishMatch('B', 0);
        return;
      }

      if (activeMode.targetKills > 0) {
        const evalRes = evaluateMatchState(activeMode, teamAKills, teamBKills);
        if (evalRes.finished && evalRes.winner) {
          finishMatch(evalRes.winner, evalRes.victorySilver);
        }
      }
    }
    const line = owner ? `${owner.name}  >  ${target.name}${suffix}` : `${target.name}${suffix}`;
    feed(line, target.team === 'A' ? 'ally' : 'enemy');
  }

  const collisionById = new Map<string, Tank>();
  const movedSet = new Set<Tank>();
  const ramHitsToApply: Array<{ attacker: Tank; victim: Tank; damage: number }> = [];

  function resolveTankCollisions() {
    const list = nonBossTanks;
    collisionById.clear();
    for (let i = 0; i < list.length; i++) collisionById.set(getTankId(list[i]), list[i]);

    movedSet.clear();
    ramHitsToApply.length = 0;

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
            movedSet.add(a);
          }
          if (res.dxB !== 0 || res.dzB !== 0) {
            b.root.position.x += res.dxB;
            b.root.position.z += res.dzB;
            b.speed *= res.speedFactorB;
            movedSet.add(b);
          }
          for (const hit of res.ramHits) {
            const attacker = collisionById.get(hit.attackerId);
            const victim = collisionById.get(hit.victimId);
            if (attacker && victim) ramHitsToApply.push({ attacker, victim, damage: hit.damage });
          }
        }
      }
    }

    for (const t of movedSet) {
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
        showMsg(t('msgRamDealt', { dmg: r.damage }), '#ffd27a');
        audio.ui('tick');
      }
      if (r.victim === tank) {
        shake = Math.max(shake, 0.7);
        showMsg(t('msgRamTaken', { dmg: r.damage }), '#ff6a4a');
      }
      if (r.victim.hp <= 0 && r.victim.alive) {
        r.victim.destroy(false);
        audio.play('bigexplosion', pt);
        handleTankDestroyed(r.victim, r.attacker, t('suffixRam'));
      }
    }
  }

  function resolveBossRam() {
    if (!boss || !boss.alive || matchEnded) return;
    const bp = boss.tank.root.position;
    for (let i = 0; i < nonBossTanks.length; i++) {
      const v = nonBossTanks[i];
      if (!v.alive) continue;
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
        showMsg(t('msgMausCrushed'), '#ff4c2a');
      }
      handleTankDestroyed(v, boss.tank, t('suffixRam'));
    }
  }

  function resolveEnvironmentImpacts() {
    for (let i = 0; i < allTanksList.length; i++) {
      const tk = allTanksList[i];
      const treeHits = tk.consumeTreeHits();
      for (let tIdx = 0; tIdx < treeHits.length; tIdx++) {
        const tr = treeHits[tIdx];
        const pos = tk.root.position;
        audio.play('treefall', pos, 0.75, tk === tank);
        for (let k = 0; k < 7; k++) {
          ballistics.fx.emit({
            x: tr.x + (Math.random() - 0.5) * 1.4,
            y: tr.y + 1.2 + Math.random() * 2.2 * tr.sy,
            z: tr.z + (Math.random() - 0.5) * 1.4,
            vx: (Math.random() - 0.5) * 5.5,
            vy: 1.5 + Math.random() * 4.2,
            vz: (Math.random() - 0.5) * 5.5,
            life: 0.75 + Math.random() * 0.4,
            s0: 0.55,
            s1: 0.25,
            r: 0.24 + Math.random() * 0.1,
            g: 0.36 + Math.random() * 0.14,
            b: 0.16,
            a: 0.85,
            grav: -9,
          });
        }
      }

      const rockImp = tk.consumeRockImpact();
      if (!rockImp || !tk.alive) continue;
      const dmg = shouldApplyRockDamage(getTankId(tk), rockImp.closingSpeed, simTime, rockCooldowns);
      if (dmg <= 0) continue;

      if (!tk.god) {
        tk.hp -= dmg;
      }
      audio.play('rockhit', tk.root.position, 0.9, tk === tank);
      for (let k = 0; k < 9; k++) {
        ballistics.fx.emit({
          additive: k < 4,
          x: rockImp.x + (Math.random() - 0.5) * 0.8,
          y: rockImp.y + Math.random() * 0.6,
          z: rockImp.z + (Math.random() - 0.5) * 0.8,
          vx: (Math.random() - 0.5) * 8,
          vy: 2 + Math.random() * 5,
          vz: (Math.random() - 0.5) * 8,
          life: 0.45 + Math.random() * 0.25,
          s0: k < 4 ? 0.32 : 0.7,
          s1: k < 4 ? 0.08 : 1.9,
          r: k < 4 ? 1 : 0.55,
          g: k < 4 ? 0.76 : 0.52,
          b: k < 4 ? 0.38 : 0.46,
          a: k < 4 ? 1 : 0.6,
          grav: -12,
        });
      }
      if (tk === tank) {
        shake = Math.max(shake, 0.42);
        if (!tk.god) {
          showMsg(t('msgRockImpact', { dmg }), '#ffb86a');
        }
      }
      if (tk.hp <= 0 && tk.alive) {
        tk.destroy(false);
        audio.play('bigexplosion', tk.root.position);
        handleTankDestroyed(tk, null, t('suffixRock'));
      }
    }
  }

  ballistics.onTankHit((e) => {
    if (e.owner === tank) {
      if (!e.isMg && e.target.team === 'B') {
        recordPlayerHit(e.result === 'pen' || e.result === 'crit' || e.result === 'fuel', e.damage);
      }
      if (e.result === 'fuel') {
        showMsg(t('msgFuelDestroyed'), '#ff4c2a');
      } else if (e.destroyed) {
        showMsg(t('msgTargetDestroyed'), '#ff6a4a');
      } else if (!e.isMg && e.damage >= 450) {
        const heavyHitKey = tank.spec.ability?.type === 'kstam_missile' ? 'msgKstamHit' : 'msgDm63Hit';
        showMsg(t(heavyHitKey, { dmg: Math.round(e.damage) }), tank.spec.ability?.type === 'kstam_missile' ? '#45ff7a' : '#78f0ff');
      } else if (!e.isMg) {
        showMsg(getCombatResultText(e.result), RESULT_COL[e.result] || '#ffd27a');
      }
      if (settings.hitcam && !e.isMg) hitcam.show(e);
    }
    if (e.target === tank) {
      if (!e.isMg) {
        shake = Math.max(shake, e.result === 'fuel' ? 1.1 : 0.5);
        showMsg(t('msgYouWereHit', { res: getCombatResultText(e.result) }), '#ff9a7a');
      } else {
        shake = Math.max(shake, 0.06);
      }
    }
    if (e.destroyed) {
      const suffix = e.result === 'fuel' ? t('suffixFuel') : e.isMg ? t('suffixMg') : '';
      handleTankDestroyed(e.target, e.owner, suffix);
    }
  });

  ballistics.onApsIntercept((e) => {
    if (e.target === tank) {
      showMsg(t('msgTrophyIntercept'), '#78f0ff');
      shake = Math.max(shake, 0.14);
    } else if (e.owner === tank) {
      showMsg(t('msgTrophyEnemyBlocked'), '#ffd27a');
    }
  });

  const onResize = () => {
    idleFrames = 0;
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    resizeScope();
    if (composer) composer.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  function render() {
    const activeScene = hangarOpen ? hangarShowcase.scene : state === 'menu' ? menuShowcase.scene : scene;
    if (renderPass) renderPass.scene = activeScene;
    if (composer && settings.post && !isSoftwareGl) composer.render();
    else renderer.render(activeScene, camera);
  }

  applyGraphics();
  if (state === 'menu' && !hangarOpen) {
    applyMenuShowcaseLook();
    camera.fov = 48;
    menuCamera(0);
  } else {
    applyMapLook();
  }
  engineReady = true;

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

    if (state !== 'pause' && state !== 'matchEnd') idleFrames = 0;
    if (state === 'menu') {
      if (hangarOpen) {
        previewTank.update(dt, { throttle: 0, steer: 0, brake: true }, null);
        previewTank.turretYaw = Math.sin(menuAngle * 0.55) * 0.24;
        previewTank.root.updateMatrixWorld(true);
        menuCamera(dt);
        vis.updateFromCamera(camera);
      } else {
        menuTime += dt;
        menuTank.update(dt, { throttle: 0, steer: 0, brake: true }, null);
        menuTank.turretYaw = 0.28 + Math.sin(menuTime * 0.42) * 0.14;
        menuTank.root.updateMatrixWorld(true);
        menuShowcase.update(dt, menuTime);
        menuCamera(dt);
        vis.updateFromCamera(camera);
      }
      ballistics.fx.setViewScale(renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      render();
      scheduleNext();
      return;
    }
    if (state === 'pause' || state === 'matchEnd') {
      // Сцена заморожена: перерисовываем только несколько кадров после входа в паузу
      // и после смены настроек/размера окна, дальше кадр не меняется.
      if (idleFrames < 4) {
        idleFrames++;
        hitcam.draw(0);
        render();
      }
      scheduleNext();
      return;
    }

    const activeMode = getModeDef(currentModeId);
    if ((!activeMode.allowCheats || !flags.svCheats) && (flags.svCheats || tank.god || !flags.ai || flags.timeScale !== 1)) {
      enforceCheatsOff();
    }
    dt *= flags.timeScale;
    simTime += dt;

    if (cutsceneActive) {
      cutsceneElapsed += dt;
      const cs = stepCutscene(cutsceneElapsed);
      syncCutsceneDom(cs);

      if (isLondonWorld(world)) {
        world.setBlitzAtmosphere(cs.skyCrimson);
        world.updateCutsceneBombers(
          cs.bomberFlightProgress,
          dt,
          cs.phase === 'calm_sky' || cs.phase === 'bombers_passing' || cs.phase === 'final_prompt',
        );
        world.updateRaidBombers(tank.root.position, simTime, dt, false, false);
        world.syncBombVisuals([], simTime);
      }

      if (cutsceneElapsed >= 1.8 && !cutsceneBomberSfxPlayed) {
        cutsceneBomberSfxPlayed = true;
        audio.play('bomberFlyover', null, 0.92, true);
      }

      tank.update(dt, { throttle: 0, steer: 0, brake: true }, ballistics.fx);
      tank.root.updateMatrixWorld(true);

      if (cs.phase === 'combat') {
        cutsceneActive = false;
        bombSpawnAcc = 1.4;
        hideCutsceneOverlay();
        if (isLondonWorld(world)) {
          world.setBlitzAtmosphere(1);
          world.updateCutsceneBombers(1, 0, false);
        }
        updateCamera(dt);
      } else {
        applyCutsceneCamera(cs, dt);
        updateTankVisibilityAndLod();
        world.update(camera.position, tank.root.position, dt, vis);
        ballistics.fx.setViewScale(renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
        audio.engineUpdate(0, 0, false, tank.spec.engineAudio ?? 'diesel');
        render();
        scheduleNext();
        return;
      }
    }

    // Step animated 3D GALIX smoke canister launches along parabolic trajectories
    for (let i = galixGrenades.length - 1; i >= 0; i--) {
      const g = galixGrenades[i];
      g.age += dt;
      const prog = Math.min(1, g.age / g.duration);
      const pos = computeGalixArcPosition(g.sx, g.sy, g.sz, g.ex, g.ey, g.ez, prog, 3.6);
      g.mesh.position.set(pos.x, pos.y, pos.z);
      g.mesh.rotation.x += dt * 16;
      g.mesh.rotation.z += dt * 11;
      g.trailAcc += dt;
      while (g.trailAcc >= 0.025) {
        g.trailAcc -= 0.025;
        ballistics.fx.emit({
          x: pos.x + (Math.random() - 0.5) * 0.2,
          y: pos.y + (Math.random() - 0.5) * 0.2,
          z: pos.z + (Math.random() - 0.5) * 0.2,
          vx: (Math.random() - 0.5) * 1.1,
          vy: 0.7 + Math.random() * 0.9,
          vz: (Math.random() - 0.5) * 1.1,
          life: 0.95 + Math.random() * 0.4,
          s0: 0.75,
          s1: 3.4,
          r: 0.9,
          g: 0.93,
          b: 0.96,
          a: 0.65,
          drag: 1.1,
        });
      }
      if (prog >= 1) {
        // Airburst smoke detonation bloom
        for (let b = 0; b < 7; b++) {
          const ang = (b / 7) * Math.PI * 2 + Math.random() * 0.5;
          const spd = 2.4 + Math.random() * 4.2;
          ballistics.fx.emit({
            x: g.ex + (Math.random() - 0.5) * 1.8,
            y: g.ey + Math.random() * 1.4,
            z: g.ez + (Math.random() - 0.5) * 1.8,
            vx: Math.cos(ang) * spd,
            vy: 1.8 + Math.random() * 2.8,
            vz: Math.sin(ang) * spd,
            life: 3.6 + Math.random() * 1.4,
            s0: 5.4,
            s1: 18.0,
            r: 0.85,
            g: 0.88,
            b: 0.91,
            a: 0.84,
            drag: 0.65,
          });
        }
        ballistics.fx.emit({
          additive: true,
          x: g.ex,
          y: g.ey + 0.5,
          z: g.ez,
          vx: 0,
          vy: 1.2,
          vz: 0,
          life: 0.3,
          s0: 2.2,
          s1: 0.4,
          r: 0.82,
          g: 0.95,
          b: 1.0,
          a: 0.95,
        });
        scene.remove(g.mesh);
        galixGrenades.splice(i, 1);
      }
    }

    pruneSmokeClouds(smokeClouds, simTime);
    if (smokeClouds.length > 0) {
      smokeEmitAcc += dt;
      if (smokeEmitAcc >= 0.085) {
        smokeEmitAcc = 0;
        for (let i = 0; i < smokeClouds.length; i++) {
          const c = smokeClouds[i];
          const remain = Math.max(0, c.expiresAt - simTime);
          const fadeOut = Math.min(1, remain / 2.2);
          const swirlA = simTime * 1.35 + i * 1.1;
          const tint = 0.82 + (i % 3) * 0.04;
          ballistics.fx.emit({
            x: c.x + (Math.random() - 0.5) * 3.8,
            y: c.y + Math.random() * 2.2,
            z: c.z + (Math.random() - 0.5) * 3.8,
            vx: Math.cos(swirlA) * 2.1 + (Math.random() - 0.5) * 1.8,
            vy: 1.3 + Math.random() * 1.8,
            vz: Math.sin(swirlA) * 2.1 + (Math.random() - 0.5) * 1.8,
            life: 2.8 + Math.random() * 1.4,
            s0: 6.2,
            s1: 19.2,
            r: tint,
            g: tint + 0.02,
            b: tint + 0.04,
            a: 0.78 * fadeOut,
            drag: 0.55,
          });
        }
      }
    }
    const K = settings.keys;
    const touchActive = settings.controlMode === 'touch' && !!touchCtl;
    const input = {
      throttle: clamp((keys[K.forward] ? 1 : 0) - (keys[K.back] ? 1 : 0) + (touchActive ? touchCtl!.state.throttle : 0), -1, 1),
      steer: clamp((keys[K.left] ? 1 : 0) - (keys[K.right] ? 1 : 0) + (touchActive ? touchCtl!.state.steer : 0), -1, 1),
      brake: !!keys[K.brake],
    };
    tank.update(dt, input, ballistics.fx);
    if (tank.alive && !matchEnded) {
      tank.updateTurret(dt, aim.yaw, aim.elev);
    }
    tank.root.updateMatrixWorld(true);

    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (flags.ai) {
        b.update(dt, b.team === 'A' ? teamBTanks : teamATanks, ballistics.fx, {
          respawns: activeMode.respawns,
          botRespawns: activeMode.respawns || !!activeMode.botRespawnSeconds,
          respawnDelay: activeMode.botRespawnSeconds ?? 14,
          randomTankRespawn: !!activeMode.randomEnemyTanks && b.team === 'B',
          avoidPos: activeMode.survivalSeconds && b.team === 'B' ? tank.root.position : undefined,
          allowBotAccuracy: activeMode.allowBotAccuracy,
          allies: b.team === 'A' ? teamATanks : teamBTanks,
          rushBoss: !!activeMode.boss,
          huntPlayer: !!activeMode.huntPlayer && b.team === 'B',
          smokeClouds,
          simTime,
        });
      } else {
        b.tank.update(dt, { throttle: 0, steer: 0, brake: true }, ballistics.fx);
      }
    }

    if (boss && flags.ai) {
      boss.update(
        dt,
        teamATanks,
        ballistics.fx,
        (victim) => {
          if (victim === tank) {
            shake = Math.max(shake, 1.1);
            showMsg(t('msgMausBurned'), '#ff6a4a');
          }
          handleTankDestroyed(victim, boss!.tank, t('suffixFlame'));
        },
        smokeClouds,
        simTime,
      );
    } else if (boss) {
      boss.tank.update(dt, { throttle: 0, steer: 0, brake: true }, ballistics.fx);
    }

    resolveTankCollisions();
    resolveBossRam();
    resolveEnvironmentImpacts();

    if (isBombardmentMode(activeMode.id) && isLondonWorld(world)) {
      world.updateRaidBombers(tank.root.position, simTime, dt, !matchEnded || bombersRetreating, bombersRetreating);
      if (!matchEnded && tank.alive) {
        const totalSec = activeMode.survivalSeconds || BOMBARDMENT_DURATION_SEC;
        const interval = getBombardmentIntervalSec(survivalElapsed, totalSec);
        bombSpawnAcc += dt;
        if (bombSpawnAcc >= interval) {
          bombSpawnAcc = 0;
          const maxBombs = getMaxConcurrentBombs(survivalElapsed, totalSec);
          if (bombStrikes.length < maxBombs) {
            const cand = pickStrikeCandidate({
              elapsedSec: survivalElapsed,
              totalSec,
              playerX: tank.root.position.x,
              playerZ: tank.root.position.z,
              playerHeading: tank.heading,
              playerSpeed: tank.speed,
              worldLimit: world.limit,
              heightAt: world.heightAt,
              isSpotOpen: world.isSpotOpenForBomb,
              existingStrikes: bombStrikes,
            });
            if (cand) {
              bombStrikes.push(
                createBombStrike(nextBombId++, cand.x, world.heightAt(cand.x, cand.z), cand.z, cand.kind),
              );
            }
          }
        }

        for (let i = 0; i < bombStrikes.length; i++) {
          const s = bombStrikes[i];
          if (!s.whistlePlayed && s.fuseRemaining <= 1.25) {
            s.whistlePlayed = true;
            audio.play('bombWhistle', new THREE.Vector3(s.x, s.groundY + 12, s.z), 0.72);
          }
        }

        const detonations = stepBombStrikes(bombStrikes, dt, tank.root.position.x, tank.root.position.z, tank.alive);
        for (let i = 0; i < detonations.length; i++) {
          const ev = detonations[i];
          const s = ev.strike;
          emitAirBombExplosion(s.x, s.groundY, s.z, s.radius);
          audio.play('airBomb', new THREE.Vector3(s.x, s.groundY + 1, s.z), 0.95);
          const distToPlayer = Math.hypot(s.x - tank.root.position.x, s.z - tank.root.position.z);
          if (distToPlayer < 90) {
            shake = Math.max(shake, clamp(1 - distToPlayer / 90, 0.15, 0.85));
          }
          if (ev.hitPlayer && tank.alive) {
            tank.hp = 0;
            tank.destroy(true);
            shake = Math.max(shake, 1.35);
            showMsg(t('msgBombardmentHit'), '#ff4c2a');
            world.syncBombVisuals(bombStrikes, simTime);
            handleTankDestroyed(tank, null, t('suffixAirBomb'));
            render();
            scheduleNext();
            return;
          }
        }
      }
      world.syncBombVisuals(bombStrikes, simTime);
    }

    if (activeMode.survivalSeconds && activeMode.survivalSeconds > 0 && !matchEnded) {
      survivalRemaining = Math.max(0, survivalRemaining - dt);
      survivalElapsed += dt;
      const timerTxt = formatCountdown(survivalRemaining);
      const urgent = survivalRemaining <= 30;
      if (timerTxt !== hudCache.survivalTimer) {
        hudCache.survivalTimer = timerTxt;
        $('survivalTimerHud').textContent = timerTxt;
        if (scoreboardOpen) renderScoreboard();
      }
      if (urgent !== hudCache.survivalUrgent) {
        hudCache.survivalUrgent = urgent;
        $('survivalTimerHud').classList.toggle('urgent', urgent);
      }
      const survEval = evaluateSurvivalState(activeMode, survivalRemaining, tank.alive);
      if (survEval.finished && survEval.winner) {
        if (isBombardmentMode(activeMode.id) && survEval.winner === 'A') {
          bombersRetreating = true;
          bombStrikes.length = 0;
          if (isLondonWorld(world)) {
            world.syncBombVisuals([], simTime);
            world.updateRaidBombers(tank.root.position, simTime, dt, true, true);
          }
          showMsg(t('msgBombardmentSurvived'), '#8fe36a');
        }
        finishMatch(survEval.winner, survEval.victorySilver);
        render();
        scheduleNext();
        return;
      }
    }

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
      fireQueued = false;
      if (activeMode.respawns) {
        playerDeadT += dt;
        deadEl.style.display = 'flex';
        deadEl.textContent = t('hudDeadRespawn', { t: Math.max(0, Math.ceil(6 - playerDeadT)) });
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
          if (!hudCache.specVisible) {
            hudCache.specVisible = true;
            el.specBar.classList.remove('hidden');
          }
          if (spectateTarget.name !== hudCache.specName) {
            hudCache.specName = spectateTarget.name;
            el.specName.textContent = spectateTarget.name;
          }
          const specHpTxt = `(${Math.max(0, Math.round(spectateTarget.hp))}/${spectateTarget.maxHp} ${t('hudHpUnit')})`;
          if (specHpTxt !== hudCache.specHp) {
            hudCache.specHp = specHpTxt;
            el.specHp.textContent = specHpTxt;
          }
        } else {
          spectating = false;
          if (hudCache.specVisible) {
            hudCache.specVisible = false;
            el.specBar.classList.add('hidden');
          }
        }
      } else {
        spectating = false;
        deadEl.style.display = 'none';
        if (hudCache.specVisible) {
          hudCache.specVisible = false;
          el.specBar.classList.add('hidden');
        }
      }
    } else {
      spectating = false;
      if (hudCache.specVisible) {
        hudCache.specVisible = false;
        el.specBar.classList.add('hidden');
      }
    }

    if (msgT > 0) {
      msgT -= dt;
      if (msgT < 0.4) msgEl.style.opacity = String(Math.max(0, msgT / 0.4));
    }

    const firingPrimary = mouseDown || fireQueued || (touchActive && touchCtl!.state.fireHeld);
    fireQueued = false;
    if (!spectating && firingPrimary && (locked || touchActive) && mode !== 'binoc' && !consoleOpen && !scoreboardOpen) {
      const shot = tank.fire();
      if (shot) {
        recordPlayerShot();
        ballistics.fire({ ...shot, owner: tank });
        if (shot.type === 'DM63') {
          showMsg(t('msgDm63Fired'), '#78f0ff');
        }
        kick += mode === 'third' ? 0.018 : 0.0035;
        shake = mode === 'third' ? 0.18 : 0;
        if (shot.dir.y > 0.08 && isShotIntoSky(shot.dir.y, aim.range, !!world.raycast(shot.pos, shot.dir, 650))) {
          showMsg(t('skyEaster'), '#ffd27a');
          lastSkyMsgTime = simTime;
        }
      }
    }
    const firingMg = !!keys[K.mg] || (touchActive && touchCtl!.state.mgHeld);
    if (!spectating && !matchEnded && firingMg && mode !== 'binoc' && !consoleOpen && !scoreboardOpen) {
      const mgShot = tank.fireMg();
      if (mgShot) {
        ballistics.fire({ ...mgShot, owner: tank });
        if (
          mgShot.dir.y > 0.08 &&
          simTime - lastSkyMsgTime >= 2.5 &&
          isShotIntoSky(mgShot.dir.y, aim.range, !!world.raycast(mgShot.pos, mgShot.dir, 650))
        ) {
          showMsg(t('skyEaster'), '#ffd27a');
          lastSkyMsgTime = simTime;
        }
      }
    }

    ballistics.update(dt);
    updateCamera(dt);

    // Thermal Sight Gen-2 + Weakspot Scanner HUD
    const thermalOn =
      state === 'play' &&
      tank.alive &&
      !spectating &&
      !matchEnded &&
      !hangarOpen &&
      isThermalActive(tank.abilityState, tank.spec.ability);
    if (thermalOn !== lastThermalOn) {
      lastThermalOn = thermalOn;
      document.body.classList.toggle('thermal-active', thermalOn);
    }
    if (thermalOn) {
      for (let i = 0; i < allTanksList.length; i++) {
        allTanksList[i].setThermalHighlight(true, allTanksList[i].team !== tank.team);
      }
      const wsMatch = findSightEnemy(1600, 0.72);
      const wsVis = !!wsMatch;
      if (wsVis !== hudCache.weakspotVisible) {
        hudCache.weakspotVisible = wsVis;
        el.weakspotHud.classList.toggle('hidden', !wsVis);
        if (wsVis) {
          el.weakspotRows.innerHTML =
            `<div>${t('hudWeakspotFuel')}</div>` +
            `<div>${t('hudWeakspotRear')}</div>` +
            `<div>${t('hudWeakspotRoof')}</div>`;
        }
      }
      if (wsVis && wsMatch) {
        const wsTgtTxt = `${wsMatch.target.spec.name} · ${Math.round(wsMatch.dist)}${t('hudMetersUnit')}`;
        if (wsTgtTxt !== hudCache.weakspotTarget) {
          hudCache.weakspotTarget = wsTgtTxt;
          el.weakspotTarget.textContent = wsTgtTxt;
        }
      }
    } else {
      for (let i = 0; i < allTanksList.length; i++) {
        allTanksList[i].setThermalHighlight(false, false);
      }
      if (hudCache.weakspotVisible) {
        hudCache.weakspotVisible = false;
        el.weakspotHud.classList.add('hidden');
      }
    }

    // KSTAM Top-Attack hold-to-lock loop
    const kstamCanHold =
      state === 'play' &&
      tank.alive &&
      !spectating &&
      !matchEnded &&
      mode !== 'binoc' &&
      !scoreboardOpen &&
      tank.spec.ability?.type === 'kstam_missile' &&
      Boolean(tank.abilityState?.primed) &&
      kstamHolding;
    if (kstamCanHold) {
      const kHit = findSightEnemy(1200, 0.84);
      kstamLockTarget = kHit ? kHit.target : null;
      const lockDur = tank.spec.ability?.lockDuration ?? 1.5;
      const stepRes = stepKstamLock(kstamLockProg, !!kstamLockTarget, true, dt, lockDur);
      kstamLockProg = stepRes.progress;

      if (stepRes.locked) {
        if (!kstamLockedAnnounced) {
          kstamLockedAnnounced = true;
          audio.play('kstamLocked', tank.root.position, 0.85, true);
          showMsg(t('msgKstamLocked'), '#45ff7a');
        }
      } else {
        kstamLockedAnnounced = false;
        if (kstamLockTarget) {
          kstamTickAcc += dt;
          if (kstamTickAcc >= 0.34) {
            kstamTickAcc = 0;
            audio.play('kstamLockTick', tank.root.position, 0.6, true);
          }
        }
      }

      if (!hudCache.kstamVisible) {
        hudCache.kstamVisible = true;
        el.kstamReticle.classList.remove('hidden');
      }
      if (stepRes.locked !== hudCache.kstamLocked) {
        hudCache.kstamLocked = stepRes.locked;
        el.kstamReticle.classList.toggle('locked', stepRes.locked);
      }
      const kTxt = !kstamLockTarget
        ? t('hudKstamNoTarget')
        : stepRes.locked
          ? t('hudKstamLocked')
          : t('hudKstamLocking', { pct: Math.round((stepRes.progress / lockDur) * 100) });
      if (kTxt !== hudCache.kstamTxt) {
        hudCache.kstamTxt = kTxt;
        el.kstamTxt.textContent = kTxt;
      }
    } else {
      if (kstamHolding) {
        kstamHolding = false;
        kstamLockProg = 0;
        kstamLockTarget = null;
        kstamLockedAnnounced = false;
        kstamTickAcc = 0;
      }
      if (hudCache.kstamVisible) {
        hudCache.kstamVisible = false;
        hudCache.kstamLocked = false;
        el.kstamReticle.classList.add('hidden');
        el.kstamReticle.classList.remove('locked');
      }
    }

    const focusPos = spectating && spectateTarget ? spectateTarget.root.position : tank.root.position;
    updateTankVisibilityAndLod();
    world.update(camera.position, focusPos, dt, vis);
    ballistics.fx.setViewScale(renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
    audio.engineUpdate(
      Math.abs(tank.speed) / tank.stats.maxSpeed,
      input.throttle,
      tank.alive && !spectating,
      tank.spec.engineAudio ?? 'diesel',
    );
    updateHud(dt);
    minimap.update(allTanksList, tank, cam.yaw, spectateTarget, dt);
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
    menuScene: menuShowcase.scene,
    menuTank,
    menuOrbit,
    menuShowcase,
    camera,
    renderer,
    get world() {
      return world;
    },
    get boss() {
      return boss;
    },
    tank,
    ballistics,
    aim,
    game,
    settings,
    visibility: vis,
    get mapId() {
      return currentMap;
    },
    get modeId() {
      return currentModeId;
    },
    get state() {
      return state;
    },
    get cutscenePhase() {
      return cutsceneActive ? stepCutscene(cutsceneElapsed).phase : 'combat';
    },
    get cutsceneElapsed() {
      return cutsceneElapsed;
    },
    get activeBombs() {
      return bombStrikes;
    },
    get survivalRemaining() {
      return survivalRemaining;
    },
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
    removeEventListener('pointerdown', onMenuPointerDown);
    removeEventListener('pointermove', onMenuPointerMove);
    removeEventListener('pointerup', onMenuPointerUp);
    removeEventListener('pointercancel', onMenuPointerUp);
    removeEventListener('contextmenu', onContextMenu);
    removeEventListener('wheel', onWheel);
    removeEventListener('resize', onResize);
    $('bSbClose').removeEventListener('click', onSbClose);
    $('bSpecPrev').removeEventListener('click', onSpecPrev);
    $('bSpecNext').removeEventListener('click', onSpecNext);
    touchCtl?.dispose();
    clearThermalVisuals();
    audio.engineSilence();
    audio.music('off');
    clearGalixGrenades();
    galixCanisterGeo.dispose();
    galixCanisterMat.dispose();
    if (boss) boss.dispose();
    hangarShowcase.dispose();
    menuShowcase.dispose();
    world.dispose();
    renderer.dispose();
  };
}
