import * as THREE from 'three';
import { createWorld } from './world.js';
import { createCityWorld } from './city.js';
import { Tank } from './tank.js';
import { BallisticsSystem, G, DRAG_K, SUBSTEP } from './ballistics.js';
import { Bot, spawnPoint, setMap } from './bots.js';
import { settings, onSettings, setSetting } from './settings.js';
import { audio } from './audio.js';
import { HitCam } from './hitcam.js';
import { GameConsole } from './console.js';
import { createUI } from './ui.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---------------- renderer / scene ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd2dde6);
scene.fog = new THREE.Fog(0xcbd8e2, 450, 2600);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 4500);
audio.setListener(camera);

const MAPS = [
  { id: 'hills', name: 'Холмы', desc: 'Открытая местность: холмы, рощи, лощины и небольшой городок. Дальние дистанции, укрытия за рельефом.', build: createWorld },
  { id: 'city', name: 'Город', desc: 'Разрушенный войной город: руины, обломки стен, воронки и трещины в асфальте. Серая мгла, тесные улицы, ближний бой.', build: createCityWorld },
];
let selectedMap = 'hills', currentMap = 'hills';
let world = createWorld(scene);
setMap(world);
const tank = new Tank(scene, world, { x: world.spawnPlayer.x, z: world.spawnPlayer.z, heading: 0, team: 'A', name: 'ВЫ' });
tank.isPlayer = true;
const ballistics = new BallisticsSystem(scene, world);
ballistics.addTarget(tank);

const bots = [];
for (let i = 0; i < 3; i++) bots.push(new Bot(scene, world, ballistics, 'A', i + 1));
for (let i = 0; i < 4; i++) bots.push(new Bot(scene, world, ballistics, 'B', i));
const allTanks = () => [tank, ...bots.map((b) => b.tank)];
const tanksOf = (team) => allTanks().filter((t) => t.team === team);

/* post-processing */
let composer = null, bloomPass = null, gradePass = null;
try {
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.55, 1.0);
  composer.addPass(bloomPass);
  gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, sat: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float sat; uniform vec3 tint; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(mix(vec3(l), c.rgb, sat) * tint, c.a); }',
  });
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
} catch (err) { composer = null; }

/* ---------------- state ---------------- */
const SNIPER_FOV = [14, 7, 3.5];
const BINOC_FOV = [18, 9, 4.5];
const flags = { ai: true, timeScale: 1, fps: false };
let state = 'menu';                                  // 'menu' | 'play' | 'pause'
let battleStarted = false;
let mode = 'third';                                  // 'third' | 'sniper' | 'binoc'
let zoomIdx = 0, fovCur = 60, camDist = 14, ballComp = false;
let kick = 0, shake = 0;
let locked = false, fallback = false, mouseDown = false;
let kills = 0, playerDeadT = 0, msgT = 0, menuAngle = 0, consoleOpen = false;
const keys = Object.create(null);
const cam = { yaw: 0, pitch: 0.2 };
const aim = { yaw: 0, elev: 0, point: new THREE.Vector3(), range: null };
let binocFrozen = false;

const hitcam = new HitCam($('hitcam'));

/* ---------------- graphics settings ---------------- */
function applyGraphics() {
  const sun = world.sun;
  const pr = Math.min(window.devicePixelRatio || 1, 2) * settings.resolution;
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
  sun.castShadow = settings.shadows !== 'off';
  const ms = settings.shadows === 'high' ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  if (bloomPass) bloomPass.strength = settings.bloom;
  world.setGrass(settings.grass);
  const f = { low: 0.4, medium: 0.7, high: 1 }[settings.drawDist] || 1;
  scene.fog.far = world.fogFar * f; scene.fog.near = world.fogNear * Math.min(1, f);
  $('vignette').style.display = settings.vignette ? 'block' : 'none';
  $('help').style.display = settings.hints ? 'block' : 'none';
  $('hitcam').dataset.on = settings.hitcam ? '1' : '0';
  if (!settings.hitcam) hitcam.hide();
  updateHelp();
  if (state !== 'menu') resizeScope();
}
function updateHelp() {
  const K = settings.keys, n = (c) => (c || '').replace('Key', '').replace('Space', 'ПРОБЕЛ').replace('ShiftLeft', 'SHIFT').replace('Backquote', '~');
  $('help').innerHTML = `<b>${n(K.forward)}/${n(K.back)}</b> газ/реверс &nbsp; <b>${n(K.left)}/${n(K.right)}</b> поворот &nbsp; <b>${n(K.brake)}</b> тормоз<br>` +
    `<b>МЫШЬ</b> прицел &nbsp; <b>ЛКМ</b> огонь &nbsp; <b>${n(K.sniper)}</b> снайперский прицел &nbsp; <b>${n(K.binoc)}</b> бинокль<br>` +
    `<b>КОЛЕСО</b> зум &nbsp; <b>${n(K.comp)}</b> баллист. комп. &nbsp; <b>${n(K.console)}</b> консоль &nbsp; <b>ESC</b> пауза`;
}
const GFX_KEYS = new Set(['shadows', 'post', 'bloom', 'grass', 'drawDist', 'resolution', 'vignette', 'hitcam', 'hints', 'keys', '*']);
onSettings((k) => { if (GFX_KEYS.has(k)) applyGraphics(); });

/* ---------------- maps ---------------- */
function applyMapLook() {
  world.createEnvironment(renderer);
  scene.background.setHex(world.background); scene.fog.color.setHex(world.fogColor);
  renderer.toneMappingExposure = world.exposure;
  if (gradePass) { gradePass.uniforms.sat.value = world.grade.sat; gradePass.uniforms.tint.value.set(...world.grade.tint); }
}
function loadMap(id) {
  const def = MAPS.find((x) => x.id === id);
  if (!def || id === currentMap) { selectedMap = id; return; }
  const old = world;
  world = def.build(scene); currentMap = selectedMap = id;
  setMap(world); ballistics.setWorld(world); tank.world = world;
  for (const b of bots) { b.world = world; b.tank.world = world; }
  old.dispose();
  applyMapLook(); applyGraphics();
  tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0);
  for (const b of bots) b.respawn();
  battleStarted = false;
}

/* ---------------- battle control ---------------- */
function newBattle() {
  ballistics.clear();
  tank.reset(world.spawnPlayer.x, world.spawnPlayer.z, 0);
  for (const b of bots) b.respawn();
  kills = 0; playerDeadT = 0; $('dead').style.display = 'none';
  aim.yaw = 0; aim.elev = 0; cam.yaw = 0; cam.pitch = 0.2; mode = 'third'; binocFrozen = false;
  hitcam.hide(); $('feed').innerHTML = '';
  battleStarted = true;
}

function spawnBot(team) {
  const idx = bots.filter((b) => b.team === team).length + (team === 'A' ? 1 : 0);
  const b = new Bot(scene, world, ballistics, team, idx);
  const fwd = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
  const base = team === 'A' ? tank.root.position.clone().addScaledVector(fwd, -12) : (aim.range ? aim.point.clone() : tank.root.position.clone().addScaledVector(fwd, 80));
  b.tank.reset(clamp(base.x + (Math.random() - 0.5) * 30, -450, 450), clamp(base.z + (Math.random() - 0.5) * 30, -450, 450), team === 'A' ? cam.yaw : cam.yaw + Math.PI);
  bots.push(b);
}
function removeBots(team) {
  let n = 0;
  for (let i = bots.length - 1; i >= 0; i--) {
    if (team && bots[i].team !== team) continue;
    scene.remove(bots[i].tank.root);
    ballistics.targets = ballistics.targets.filter((t) => t !== bots[i].tank);
    bots.splice(i, 1); n++;
  }
  return n;
}
function hitTank(t, type) {
  if (type === 'tracks') t.immobilize(10);
  else if (type === 'gun') t.disableGun(10);
  else if (type === 'fuel' || type === 'crit') {
    t.destroy(true); const p = t.root.position;
    ballistics.fx.emit({ additive: true, x: p.x, y: p.y + 2, z: p.z, life: 0.8, s0: 10, s1: 30, r: 1, g: 0.6, b: 0.2, a: 1 });
    audio.play('bigexplosion', p);
  }
}

/* ---------------- console ---------------- */
const game = {
  get tank() { return tank; }, get bots() { return bots; }, get world() { return world; }, ballistics, flags, audio, settings,
  allTanks, spawnBot, removeBots, hitTank, newBattle,
  killTeam: () => 0, consoleKey: () => settings.keys.console,
  set: (k, v) => setSetting(k, v),
  showFps: (on) => { $('fps').style.display = on ? 'block' : 'none'; },
  onConsole: (open) => {
    consoleOpen = open;
    if (open) { for (const k in keys) keys[k] = false; mouseDown = false; if (document.pointerLockElement) document.exitPointerLock(); }
    else if (state === 'play') { tryLock(); setTimeout(() => { if (state === 'play' && !locked && !consoleOpen) tryLock(); }, 120); }
  },
};
const gcon = new GameConsole($('console'), game);

/* ---------------- menu / pointer lock ---------------- */
let lockTries = 0, everLocked = false, lockTimer = 0;
function tryLock() {
  if (fallback) { locked = true; return; }
  const el = renderer.domElement;
  if (!el.requestPointerLock) { enableFallback(); return; }
  clearTimeout(lockTimer);
  try { const r = el.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* retried below */ }
}
function enableFallback() { fallback = true; locked = true; }
function startPlay(fresh) {
  audio.init(); audio.resume();
  if (fresh || !battleStarted) newBattle();
  state = 'play'; document.body.className = 'play';
  ui.show(null); audio.music('off');                 // no music during the battle
  resizeScope(); applyGraphics(); tryLock();
}
function openPause() {
  if (state !== 'play') return;
  state = 'pause'; mouseDown = false; locked = false;
  for (const k in keys) keys[k] = false;
  audio.engineSilence();
  ui.show('pause');
}
function resumeGame() { state = 'play'; ui.show(null); tryLock(); }
function toMenu() {
  state = 'menu'; document.body.className = 'menu'; mouseDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
  fallback = false; locked = false; audio.engineSilence(); audio.music('menu');
  tank.root.visible = true; ui.show('main');
}

const ui = createUI({
  play: startPlay, resume: resumeGame, toMenu, started: () => battleStarted,
  maps: MAPS, getMap: () => selectedMap, setMap: (id) => loadMap(id),
});
ui.show('main');
// first click anywhere on the menu unlocks audio (browser autoplay policy) and starts the menu music
addEventListener('pointerdown', () => { if (audio.init() && state === 'menu') audio.music('menu'); }, { once: true });

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (locked) { everLocked = true; lockTries = 0; clearTimeout(lockTimer); }
  if (!locked && state === 'play' && !consoleOpen && !fallback) openPause();
});
document.addEventListener('pointerlockerror', () => {
  if (state !== 'play' || consoleOpen) return;
  // browsers refuse re-lock for ~1 s after Esc: keep retrying instead of giving up
  if (++lockTries > 8 && !everLocked) { enableFallback(); return; }
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => { if (state === 'play' && !locked && !consoleOpen) tryLock(); }, 350);
});

/* ---------------- input ---------------- */
addEventListener('keydown', (e) => {
  if (ui.rebinding) return;
  const K = settings.keys;
  if (e.code === K.console && state !== 'menu') { e.preventDefault(); gcon.toggle(); return; }
  if (consoleOpen) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape') { if (state === 'play' && fallback) openPause(); else if (state === 'pause') resumeGame(); return; }
  if (state !== 'play') return;
  if (!locked && !fallback) tryLock();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === K.sniper || (K.sniper === 'ShiftLeft' && e.code === 'ShiftRight')) setMode(mode === 'sniper' ? 'third' : 'sniper');
  else if (e.code === K.binoc) setMode(mode === 'binoc' ? 'third' : 'binoc');
  else if (e.code === K.comp) ballComp = !ballComp;
  else if (e.code === K.post) setSetting('post', !settings.post);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

addEventListener('mousemove', (e) => {
  if (!locked || state !== 'play') return;
  const s = 0.0022 * clamp(fovCur / 60, 0.06, 1) * settings.sens * (mode === 'third' ? 1 : settings.sensSniper);
  cam.yaw -= e.movementX * s;
  cam.pitch -= e.movementY * s * (settings.invertY ? -1 : 1);
});
addEventListener('mousedown', (e) => {
  if (state !== 'play' || consoleOpen) return;
  if (!locked) { tryLock(); return; }
  if (e.button !== 0) return;
  if (mode === 'binoc') { snapTurretToView(); setMode('third'); return; }
  mouseDown = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (state !== 'play' || consoleOpen) return;
  const dir = Math.sign(e.deltaY);
  if (mode === 'third') camDist = clamp(camDist * (dir > 0 ? 1.1 : 0.9), 7, 32);
  else {
    const n = (mode === 'sniper' ? SNIPER_FOV : BINOC_FOV).length;
    zoomIdx = clamp(zoomIdx + (dir < 0 ? 1 : -1), 0, n - 1);
  }
}, { passive: true });

function setMode(m) {
  if (m === mode) return;
  mode = m; zoomIdx = 0; binocFrozen = m === 'binoc';
}
function snapTurretToView() { binocFrozen = false; computeAim(true); }

/* ---------------- camera & aim ---------------- */
const _dir = new THREE.Vector3(), _rdir = new THREE.Vector3(), _pos = new THREE.Vector3(), _g = new THREE.Vector3(), _t = new THREE.Vector3();
const camOrigin = new THREE.Vector3();

function lookDir(out, yaw, pitch) { const cp = Math.cos(pitch); return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp); }
function dropAngle(range) { const t = range / (tank.stats.muzzleVelocity * 0.97); return Math.atan2(0.5 * G * t * t, range); }

function computeAim(force) {
  if (binocFrozen && !force) return;
  const hit = world.raycast(camOrigin, _dir, 2500);
  const p = aim.point;
  if (hit) p.copy(hit.point); else p.copy(camOrigin).addScaledVector(_dir, 2500);
  tank.gunPivotWorld(_g);
  _t.subVectors(p, _g);
  const horiz = Math.hypot(_t.x, _t.z), range = _t.length();
  aim.range = hit ? range : null;
  if (horiz > 3) {
    aim.yaw = Math.atan2(_t.x, _t.z);
    aim.elev = Math.atan2(_t.y, horiz) + (ballComp ? dropAngle(range) : 0);
  }
}

function updateCamera(dt) {
  const fovTarget = mode === 'third' ? settings.fov : (mode === 'sniper' ? SNIPER_FOV : BINOC_FOV)[zoomIdx];
  fovCur += (fovTarget - fovCur) * Math.min(1, dt * 10);
  if (Math.abs(camera.fov - fovCur) > 1e-3) { camera.fov = fovCur; camera.updateProjectionMatrix(); }

  const lo = mode === 'third' ? -0.4 : -0.5, hi = mode === 'third' ? 1.2 : (mode === 'sniper' ? 0.6 : 1.2);
  cam.pitch = clamp(cam.pitch, lo, hi);
  if (cam.yaw > Math.PI) cam.yaw -= Math.PI * 2; else if (cam.yaw < -Math.PI) cam.yaw += Math.PI * 2;
  lookDir(_dir, cam.yaw, cam.pitch);

  if (mode === 'third') {
    _pos.copy(tank.root.position); _pos.y += 2.8;
    camOrigin.copy(_pos).addScaledVector(_dir, -camDist); camOrigin.y += 1.4;
    const gy = world.heightAt(camOrigin.x, camOrigin.z) + 1.5;
    if (camOrigin.y < gy) camOrigin.y = gy;
  } else if (mode === 'sniper') tank.sightWorld(camOrigin);
  else { tank.binocWorld(camOrigin); camOrigin.y += 0.5; }

  tank.root.visible = mode !== 'sniper';
  computeAim(false);

  lookDir(_rdir, cam.yaw, cam.pitch + kick);
  camera.position.copy(camOrigin);
  if (mode === 'third' && shake > 0.001) camera.position.add(_t.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake));
  camera.lookAt(camera.position.x + _rdir.x, camera.position.y + _rdir.y, camera.position.z + _rdir.z);
  kick *= Math.exp(-6 * dt); shake *= Math.exp(-8 * dt);
}

/** Slow orbit around the player's tank behind the main menu. */
function menuCamera(dt) {
  menuAngle += dt * 0.12;
  const p = tank.root.position;
  camera.fov += (50 - camera.fov) * 0.1; camera.updateProjectionMatrix();
  camera.position.set(p.x + Math.sin(menuAngle) * 17, p.y + 5.5 + Math.sin(menuAngle * 0.7) * 1.2, p.z + Math.cos(menuAngle) * 17);
  camera.lookAt(p.x, p.y + 2.2, p.z);
  tank.root.visible = true;
}

/* ---------------- scope overlay ---------------- */
const scopeCv = $('scope'), sctx = scopeCv.getContext('2d');
function resizeScope() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  scopeCv.width = innerWidth * dpr; scopeCv.height = innerHeight * dpr;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeScope();

function drawScope() {
  const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.47, g = sctx;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#000';
  g.beginPath(); g.rect(0, 0, W, H); g.arc(cx, cy, R, 0, Math.PI * 2, true); g.fill('evenodd');
  const grad = g.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();

  const pxMil = (H / (2 * Math.tan(fovCur * Math.PI / 360))) / 1000;
  g.strokeStyle = 'rgba(0,0,0,0.92)'; g.fillStyle = 'rgba(0,0,0,0.92)'; g.lineWidth = 1.5;
  const line = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  const gap = 7;
  line(cx - R, cy, cx - gap, cy); line(cx + gap, cy, cx + R, cy);
  line(cx, cy - R, cx, cy - gap); line(cx, cy + gap, cx, cy + R);
  g.beginPath(); g.arc(cx, cy, 1.6, 0, Math.PI * 2); g.fill();

  const step = pxMil >= 8 ? 1 : 5, maxMil = Math.floor((R * 0.97) / pxMil);
  g.font = '11px Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
  for (let m = step; m <= maxMil; m += step) {
    const major = m % 10 === 0, len = major ? 9 : 5, d = m * pxMil;
    for (const s of [-1, 1]) { line(cx + s * d, cy - len, cx + s * d, cy + len); line(cx - len, cy + s * d, cx + len, cy + s * d); }
    if (major) { g.fillText(String(m), cx + d + 3, cy - 12); g.fillText(String(m), cx + 14, cy + d); }
  }
  g.lineWidth = 2; line(cx - 14, cy + 5 * pxMil, cx + 14, cy + 5 * pxMil); g.lineWidth = 1.5;

  const rx = cx, ry = cy + R * 0.88, rr = 17, frac = tank.reloadFraction, broken = tank.gunDownT > 0;
  g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(rx, ry, rr, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = broken ? '#ff4a3a' : (tank.ready ? '#8fe36a' : '#ffb43c');
  g.beginPath(); g.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (broken ? 1 : frac)); g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.fillText(broken ? Math.ceil(tank.gunDownT) + 'с' : (tank.ready ? 'ГОТОВ' : tank.reloadTimer.toFixed(1)), rx, ry);
  g.textAlign = 'left'; g.fillStyle = '#ffd27a'; g.font = '13px Consolas, monospace';
  g.fillText(mode === 'sniper' ? 'ПРИЦЕЛ НАВОДЧИКА' : 'БИНОКЛЬ', cx - R + 14, cy - R * 0.9 + 40);
}

/* ---------------- HUD ---------------- */
const el = {
  speed: $('speed'), gear: $('gear'), hull: $('hullBrg'), tur: $('turBrg'), range: $('range'), zoom: $('zoom'), comp: $('comp'),
  mode: $('modeLabel'), ring: $('reloadRing'), rtxt: $('reloadTxt'), cross: $('crosshair'), gun: $('gunMark'), mv: $('mv'),
  hp: $('hpFill'), kills: $('kills'), alive: $('alive'), dmg: $('dmgStat'), fps: $('fps'),
};
el.mv.textContent = tank.stats.muzzleVelocity;
const bearing = (rad) => String(Math.round((((-rad / DEG) % 360) + 360) % 360)).padStart(3, '0');
const _gm = new THREE.Vector3(), _gd = new THREE.Vector3(), _pr = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0;

function updateHud(dt) {
  const v = Math.abs(tank.speed), thr = (keys[settings.keys.forward] ? 1 : 0) - (keys[settings.keys.back] ? 1 : 0);
  el.speed.textContent = Math.round(v * 3.6);
  el.gear.textContent = tank.speed < -0.4 || (v < 0.4 && thr < 0) ? 'R' : (v < 0.4 && thr === 0 ? 'N' : (v < 3.5 ? '1' : v < 7 ? '2' : v < 11 ? '3' : '4'));
  el.hull.textContent = bearing(tank.heading);
  el.tur.textContent = bearing(tank.turretWorldYaw);
  el.range.textContent = aim.range ? Math.round(aim.range) + ' м' : '---';
  el.zoom.textContent = 'x' + (mode === 'third' ? 1 : 60 / fovCur).toFixed(1);
  el.comp.textContent = ballComp ? 'ВКЛ' : 'ВЫКЛ';
  el.mode.textContent = mode === 'third' ? 'ОТ ТРЕТЬЕГО ЛИЦА' : mode === 'sniper' ? 'ПРИЦЕЛ НАВОДЧИКА' : (binocFrozen ? 'БИНОКЛЬ - КЛИК: НАВЕСТИ БАШНЮ' : 'БИНОКЛЬ');
  const broken = tank.gunDownT > 0;
  el.ring.style.setProperty('--p', Math.round(tank.reloadFraction * 100));
  el.ring.classList.toggle('loading', !tank.ready && !broken);
  el.ring.classList.toggle('broken', broken);
  el.rtxt.textContent = broken ? Math.ceil(tank.gunDownT) + 'с' : (tank.ready ? 'ГОТОВ' : tank.reloadTimer.toFixed(1));
  el.hp.style.width = Math.max(0, tank.hp) + '%';
  el.hp.style.background = tank.hp > 60 ? '#8fe36a' : tank.hp > 30 ? '#ffb43c' : '#ff4a3a';
  el.kills.textContent = kills;
  el.alive.textContent = tanksOf('A').filter((t) => t.alive).length + ' v ' + tanksOf('B').filter((t) => t.alive).length;
  let d = '';
  if (tank.immobT > 0) d += `ГУСЕНИЦА ПОВРЕЖДЕНА: ремонт ${Math.ceil(tank.immobT)} с<br>`;
  if (tank.gunDownT > 0) d += `СТВОЛ ПОВРЕЖДЁН: ремонт ${Math.ceil(tank.gunDownT)} с`;
  el.dmg.innerHTML = d;

  if (flags.fps) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { el.fps.textContent = Math.round(fpsN / fpsAcc) + ' FPS'; fpsAcc = 0; fpsN = 0; } }

  el.cross.style.display = mode === 'third' ? 'block' : 'none';
  const scoped = mode !== 'third';
  scopeCv.style.display = scoped ? 'block' : 'none';
  if (scoped) drawScope();

  // predicted impact point: simulate the shell with the same gravity + drag as real shots
  tank.muzzleWorld(_gm); tank.gunDirection(_gd);
  const impact = predictImpact();
  _pr.copy(impact).project(camera);
  if (_pr.z > 1 || _pr.z < -1) el.gun.style.display = 'none';
  else {
    el.gun.style.display = 'block';
    const sz = mode === 'third' ? 18 : 14;
    el.gun.style.width = el.gun.style.height = sz + 'px'; el.gun.style.marginLeft = el.gun.style.marginTop = (-sz / 2) + 'px';
    el.gun.style.left = ((_pr.x * 0.5 + 0.5) * innerWidth) + 'px';
    el.gun.style.top = ((-_pr.y * 0.5 + 0.5) * innerHeight) + 'px';
  }
}

const _ip = new THREE.Vector3(), _iv = new THREE.Vector3(), _ip2 = new THREE.Vector3();
function predictImpact() {
  // identical integration to BallisticsSystem.update (same step, drag, gravity, collision sampling)
  _ip.copy(_gm); _iv.copy(_gd).multiplyScalar(tank.stats.muzzleVelocity);
  const h = SUBSTEP;
  for (let i = 0; i < 480; i++) {                         // up to 4 s of flight
    _ip2.copy(_ip);
    const sp = _iv.length();
    _iv.multiplyScalar(Math.max(0, 1 - DRAG_K * sp * h)); _iv.y -= G * h;
    _ip.addScaledVector(_iv, h);
    const hit = world.segmentHit(_ip2, _ip);
    if (hit) return hit.point;
    if (Math.abs(_ip.x) > 700 || Math.abs(_ip.z) > 700 || _ip.y < -60) break;
  }
  return _ip;
}

/* ---------------- hits / feed / messages ---------------- */
const feedEl = $('feed'), msgEl = $('msg'), deadEl = $('dead');
function feed(text, cls) {
  const d = document.createElement('div'); d.textContent = text; d.className = cls || '';
  feedEl.prepend(d); while (feedEl.children.length > 5) feedEl.lastChild.remove();
  setTimeout(() => d.remove(), 9000);
}
function showMsg(text, color) { msgEl.textContent = text; msgEl.style.color = color || '#fff'; msgEl.style.opacity = 1; msgT = 1.8; }
const RESULT_TXT = { pen: 'ПОПАДАНИЕ', crit: 'КРИТИЧЕСКОЕ ПОПАДАНИЕ', nopen: 'НЕ ПРОБИЛ', ricochet: 'РИКОШЕТ', track: 'ГУСЕНИЦА ПОВРЕЖДЕНА', barrel: 'СТВОЛ ПОВРЕЖДЁН', fuel: 'БЕНЗОБАК - ВЗРЫВ!' };
const RESULT_COL = { pen: '#ffd27a', crit: '#ff6a4a', nopen: '#cfd6dd', ricochet: '#cfd6dd', track: '#ffd27a', barrel: '#ffd27a', fuel: '#ff6a4a' };
ballistics.onTankHit((e) => {
  if (e.owner === tank) {
    if (e.destroyed) { kills++; showMsg('ЦЕЛЬ УНИЧТОЖЕНА', '#ff6a4a'); }
    else showMsg(RESULT_TXT[e.result], RESULT_COL[e.result]);
    if (settings.hitcam) hitcam.show(e);
  }
  if (e.target === tank) { shake = Math.max(shake, 0.5); showMsg('ПО ВАМ ПОПАЛИ: ' + RESULT_TXT[e.result], '#ff9a7a'); }
  if (e.destroyed) feed(`${e.owner ? e.owner.name : '?'}  >  ${e.target.name}`, e.target.team === 'A' ? 'ally' : 'enemy');
});

/* ---------------- window ---------------- */
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  resizeScope();
  if (composer) composer.setSize(innerWidth, innerHeight);
});

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
function render() { if (composer && settings.post) composer.render(); else renderer.render(scene, camera); }
applyMapLook();
applyGraphics();

renderer.setAnimationLoop(() => {
  let dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'menu') {
    tank.update(dt, { throttle: 0, steer: 0, brake: true }, null);
    menuCamera(dt);
    world.update(camera.position, tank.root.position, dt);
    ballistics.fx.setViewScale(renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360)));
    render();
    return;
  }
  if (state === 'pause') { hitcam.draw(0); render(); return; }

  dt *= flags.timeScale;
  const K = settings.keys;
  const input = {
    throttle: (keys[K.forward] ? 1 : 0) - (keys[K.back] ? 1 : 0),
    steer: (keys[K.left] ? 1 : 0) - (keys[K.right] ? 1 : 0),
    brake: !!keys[K.brake],
  };
  tank.update(dt, input, ballistics.fx);
  tank.updateTurret(dt, aim.yaw, aim.elev);
  tank.root.updateMatrixWorld(true);

  const foes = { A: tanksOf('B'), B: tanksOf('A') };
  for (const b of bots) {
    if (flags.ai) b.update(dt, foes[b.team], ballistics.fx);
    else b.tank.update(dt, { throttle: 0, steer: 0, brake: true }, ballistics.fx);
  }

  if (!tank.alive) {
    playerDeadT += dt; mouseDown = false;
    deadEl.style.display = 'flex'; deadEl.textContent = 'ВАШ ТАНК УНИЧТОЖЕН - ВОЗРОЖДЕНИЕ ЧЕРЕЗ ' + Math.max(0, Math.ceil(6 - playerDeadT));
    if (playerDeadT > 6) { tank.reset(world.spawnPlayer.x + 70, world.spawnPlayer.z, 0); aim.yaw = 0; aim.elev = 0; cam.yaw = 0; playerDeadT = 0; deadEl.style.display = 'none'; }
  }
  if (msgT > 0) { msgT -= dt; if (msgT < 0.4) msgEl.style.opacity = Math.max(0, msgT / 0.4); }

  if (mouseDown && locked && mode !== 'binoc' && !consoleOpen) {
    const shot = tank.fire();
    if (shot) {
      ballistics.fire({ ...shot, owner: tank });
      kick += mode === 'third' ? 0.018 : 0.0035;
      shake = mode === 'third' ? 0.18 : 0;
    }
  }

  ballistics.update(dt);
  updateCamera(dt);
  world.update(camera.position, tank.root.position, dt);
  ballistics.fx.setViewScale(renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360)));
  audio.engineUpdate(Math.abs(tank.speed) / tank.stats.maxSpeed, input.throttle, tank.alive);
  updateHud(dt);
  hitcam.draw(dt);
  render();
});

// debug / next-phase hooks
window.IRONSKY = { bots, THREE, scene, camera, renderer, get world() { return world; }, tank, ballistics, aim, game, settings };
