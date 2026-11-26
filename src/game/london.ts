import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  fbm,
  hash2,
  makeCanvas,
  makeQueries,
  mulberry32,
  smooth,
  type GameWorld,
  type ObstacleBox,
} from './world';
import { resolveBuildingLod, sectorIndexFor, type VisibilityController } from './visibility';
import { AIR_RAID_CONFIG, type BombStrike, type RaidAircraft } from './bombardment';

const SIZE = 1000;
const LIMIT = 480;
const MAIN_ROAD_HALF = 11.5;
const SIDE_ROAD_HALF = 7.5;
const SQRT2_INV = 1 / Math.SQRT2;

export interface LondonWorld extends GameWorld {
  setBlitzAtmosphere: (crimson: number) => void;
  updateCutsceneBombers: (progress: number, dt: number, active: boolean) => void;
  syncRaidAircraft: (
    aircraft: ReadonlyArray<RaidAircraft>,
    simTime: number,
    dt: number,
    active: boolean,
    retreating: boolean,
  ) => void;
  syncBombVisuals: (
    strikes: ReadonlyArray<BombStrike>,
    simTime: number,
    aircraft?: ReadonlyArray<RaidAircraft>,
  ) => void;
  isSpotOpenForBomb: (x: number, z: number) => boolean;
}

function roadInfo(x: number, z: number): { dist: number; isMain: boolean } {
  // Main cross-boulevards (Whitehall / Strand)
  const dxMain = Math.abs(x);
  const dzMain = Math.abs(z);
  // Secondary streets at +-120, +-240, +-360, +-480
  const gx = Math.abs(x / 120 - Math.round(x / 120)) * 120;
  const gz = Math.abs(z / 120 - Math.round(z / 120)) * 120;
  // Diagonal Embankment Avenue from (-380,-380) to (380,380) outside roundabout
  const dDiag = Math.abs(x - z) * SQRT2_INV;
  // Central Trafalgar roundabout ring (r = 22..40m)
  const r = Math.hypot(x, z);
  const dRing = Math.abs(r - 31);

  const mainDist = Math.min(dxMain, dzMain, dRing);
  const sideDist = Math.min(gx, gz, dDiag);
  if (mainDist <= MAIN_ROAD_HALF) return { dist: mainDist, isMain: true };
  if (sideDist <= SIDE_ROAD_HALF) return { dist: sideDist, isMain: false };
  return { dist: Math.min(mainDist, sideDist), isMain: mainDist < sideDist };
}

function londonAsphaltTexture(): THREE.CanvasTexture {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d')!;
  g.fillStyle = '#3b3d44';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 7000; i++) {
    const v = 46 + Math.floor(Math.random() * 58);
    g.fillStyle = `rgba(${v},${v},${v + 3},0.42)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // Granite street cobble joints
  g.strokeStyle = 'rgba(18,19,22,0.28)';
  g.lineWidth = 1;
  for (let y = 0; y < 512; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
    const off = ((y / 16) % 2) * 12;
    for (let x = off; x < 512; x += 24) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + 16);
      g.stroke();
    }
  }
  // Blast soot & scorch rings
  for (let i = 0; i < 24; i++) {
    g.fillStyle = `rgba(18,13,11,${0.09 + Math.random() * 0.16})`;
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 512, 18 + Math.random() * 50, 12 + Math.random() * 34, Math.random() * 3, 0, 6.283);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function londonBrickTexture(): THREE.CanvasTexture {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d')!;
  g.fillStyle = '#7c4334';
  g.fillRect(0, 0, 512, 512);

  // Layered Victorian brick courses
  for (let row = 0; row < 48; row++) {
    const y = row * 11;
    const off = (row % 2) * 14;
    for (let x = -14; x < 512; x += 28) {
      const s = 0.78 + Math.random() * 0.36;
      g.fillStyle = `rgb(${Math.round(122 * s)},${Math.round(64 * s)},${Math.round(49 * s)})`;
      g.fillRect(x + off + 1, y + 1, 26, 9);
    }
  }

  // Portland stone cornice bands
  g.fillStyle = '#aba18f';
  g.fillRect(0, 0, 512, 16);
  g.fillRect(0, 246, 512, 16);

  // Soot & fire charring streaks
  for (let i = 0; i < 55; i++) {
    g.fillStyle = `rgba(16,13,12,${0.12 + Math.random() * 0.24})`;
    g.fillRect(Math.random() * 512, Math.random() * 300, 8 + Math.random() * 22, 48 + Math.random() * 210);
  }

  // Georgian/Victorian recessed windows (some shattered dark, some boarded with cross timber)
  const cols = [42, 164, 286, 408];
  const rows = [46, 294];
  for (const ry of rows) {
    for (const rx of cols) {
      // Limestone pediment & sill
      g.fillStyle = '#b9af9b';
      g.fillRect(rx - 7, ry - 14, 78, 13);
      g.fillRect(rx - 5, ry + 132, 74, 8);
      // Window frame & dark void
      g.fillStyle = '#121317';
      g.fillRect(rx, ry, 64, 132);
      // Mullion bars or diagonal boarding
      if ((rx + ry) % 3 === 0) {
        g.strokeStyle = '#6c543c';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(rx + 4, ry + 12);
        g.lineTo(rx + 60, ry + 118);
        g.moveTo(rx + 60, ry + 18);
        g.lineTo(rx + 4, ry + 116);
        g.stroke();
      } else {
        g.strokeStyle = '#7f786c';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(rx + 32, ry);
        g.lineTo(rx + 32, ry + 132);
        g.moveTo(rx, ry + 44);
        g.lineTo(rx + 64, ry + 44);
        g.moveTo(rx, ry + 88);
        g.lineTo(rx + 64, ry + 88);
        g.stroke();
      }
      // Blast soot plume above window
      g.fillStyle = 'rgba(14,12,11,0.34)';
      g.fillRect(rx + 4, ry - 32, 56, 20);
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function clockFaceTexture(): THREE.CanvasTexture {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#3f382e';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#f6df9b';
  g.beginPath();
  g.arc(128, 128, 102, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#231e18';
  g.lineWidth = 10;
  g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(128 + Math.sin(a) * 74, 128 - Math.cos(a) * 74);
    g.lineTo(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92);
    g.stroke();
  }
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(128, 128);
  g.lineTo(128, 62);
  g.moveTo(128, 128);
  g.lineTo(182, 146);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function phoneBoxWindowTexture(): THREE.CanvasTexture {
  const c = makeCanvas(64, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = '#b81414';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#f0ede4';
  g.fillRect(10, 6, 44, 6);
  g.fillStyle = '#202226';
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 5; row++) {
      g.fillRect(11 + col * 15, 17 + row * 17, 12, 13);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function balkenkreuzTexture(): THREE.CanvasTexture {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#f2f2ee';
  g.fillRect(46, 12, 36, 104);
  g.fillRect(12, 46, 104, 36);
  g.fillStyle = '#141618';
  g.fillRect(54, 12, 20, 104);
  g.fillRect(12, 54, 104, 20);
  g.fillStyle = '#0c0d0e';
  g.fillRect(56, 20, 16, 88);
  g.fillRect(20, 56, 88, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softSprite(r: number, g: number, b: number): THREE.CanvasTexture {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.92)`);
  gr.addColorStop(0.5, `rgba(${r},${g},${b},0.46)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function boxGeo(w: number, h: number, d: number, cx: number, cy: number, cz: number, shade: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const T = 9;
  for (let f = 0; f < 6; f++) {
    const fw = f < 2 ? d : w;
    const fh = f < 2 ? h : f < 4 ? d : h;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * fw) / T, (uv.getY(k) * fh) / T);
    }
  }
  g.translate(cx, cy, cz);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = shade;
    col[i * 3 + 1] = shade * 0.96;
    col[i * 3 + 2] = shade * 0.93;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function rotBoxGeo(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  shade: number,
): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(cx, cy, cz);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = shade;
    col[i * 3 + 1] = shade * 0.97;
    col[i * 3 + 2] = shade * 0.95;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function createLuftwaffeBomberMesh(
  variant: 'he111' | 'ju88',
  crossMat: THREE.Material,
  camoTopMat: THREE.Material,
  bellyMat: THREE.Material,
  glassMat: THREE.Material,
  propMat: THREE.Material,
): { group: THREE.Group; props: THREE.Mesh[] } {
  const grp = new THREE.Group();
  const props: THREE.Mesh[] = [];
  const isHe111 = variant === 'he111';

  const fuseLen = isHe111 ? 16.4 : 14.4;
  const fuseGeo = new THREE.CylinderGeometry(isHe111 ? 0.95 : 0.82, isHe111 ? 0.42 : 0.36, fuseLen, 8);
  fuseGeo.rotateX(Math.PI / 2);
  grp.add(new THREE.Mesh(fuseGeo, camoTopMat));

  const noseGeo = isHe111 ? new THREE.SphereGeometry(0.95, 8, 6) : new THREE.ConeGeometry(0.84, 3.2, 6);
  if (!isHe111) noseGeo.rotateX(Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, glassMat);
  nose.scale.set(1, 0.9, isHe111 ? 1.85 : 1);
  nose.position.set(0, isHe111 ? 0.05 : 0.08, fuseLen * 0.5 + (isHe111 ? 0.6 : 1.1));
  grp.add(nose);

  if (!isHe111) {
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.55, 2.5), glassMat);
    canopy.position.set(0, 0.68, fuseLen * 0.25);
    grp.add(canopy);
  }

  const span = isHe111 ? 22.6 : 20.1;
  const wingChord = isHe111 ? 3.8 : 3.2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(span, 0.26, wingChord), camoTopMat);
  wing.position.set(0, 0.1, 1.3);
  grp.add(wing);

  const underWing = new THREE.Mesh(new THREE.BoxGeometry(span * 0.96, 0.14, wingChord * 0.92), bellyMat);
  underWing.position.set(0, -0.08, 1.3);
  grp.add(underWing);

  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, wingChord * 0.65), camoTopMat);
    tip.position.set(side * (span * 0.5 + 1.0), 0.15, 0.85);
    tip.rotation.z = side * 0.06;
    grp.add(tip);
  }

  const nacGeo = new THREE.CylinderGeometry(0.55, 0.45, 3.8, 7);
  nacGeo.rotateX(Math.PI / 2);
  const propGeo = new THREE.CircleGeometry(1.55, 12);
  for (const side of [-1, 1]) {
    const nx = side * (isHe111 ? 3.55 : 3.25);
    const nac = new THREE.Mesh(nacGeo, camoTopMat);
    nac.position.set(nx, -0.1, 2.55);
    grp.add(nac);

    const prop = new THREE.Mesh(propGeo, propMat);
    prop.position.set(nx, -0.1, 4.55);
    grp.add(prop);
    props.push(prop);
  }

  const hStab = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.18, 1.85), camoTopMat);
  hStab.position.set(0, 0.22, -fuseLen * 0.47);
  grp.add(hStab);

  const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.22, isHe111 ? 2.55 : 2.35, 2.2), camoTopMat);
  vTail.position.set(0, 1.25, -fuseLen * 0.46);
  grp.add(vTail);

  const wingCrossGeo = new THREE.PlaneGeometry(2.6, 2.6);
  wingCrossGeo.rotateX(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const cx = side * (span * 0.34);
    const topCross = new THREE.Mesh(wingCrossGeo, crossMat);
    topCross.position.set(cx, 0.26, 1.3);
    grp.add(topCross);

    const botCross = new THREE.Mesh(wingCrossGeo, crossMat);
    botCross.rotation.x = Math.PI;
    botCross.position.set(cx, -0.18, 1.3);
    grp.add(botCross);
  }

  const sideCrossGeo = new THREE.PlaneGeometry(1.45, 1.45);
  sideCrossGeo.rotateY(Math.PI / 2);
  for (const side of [-1, 1]) {
    const fc = new THREE.Mesh(sideCrossGeo, crossMat);
    fc.rotation.y = side * (Math.PI / 2);
    fc.position.set(side * 0.85, 0.12, -fuseLen * 0.18);
    grp.add(fc);
  }

  return { group: grp, props };
}

export function createLondonWorld(scene: THREE.Scene): LondonWorld {
  const root = new THREE.Group();
  scene.add(root);
  const rand = mulberry32(1940);
  const obstacles: ObstacleBox[] = [];

  // Subtle shell craters outside paved main streets
  const craters: Array<{ x: number; z: number; r: number; d: number }> = [];
  for (let i = 0; i < 28; i++) {
    const cx = (rand() - 0.5) * 820;
    const cz = (rand() - 0.5) * 820;
    if (Math.hypot(cx, cz + 240) < 38 || Math.hypot(cx, cz) < 52) continue;
    craters.push({ x: cx, z: cz, r: 4.5 + rand() * 6.0, d: 0.4 + rand() * 0.7 });
  }

  function heightAt(x: number, z: number): number {
    let h = (fbm(x * 0.009 + 4, z * 0.009 + 11, 2) - 0.5) * 0.45;
    for (const c of craters) {
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = c.r * 1.35;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const t = Math.sqrt(d2) / c.r;
      if (t < 1) h -= c.d * (1 - t * t);
      else h += c.d * 0.2 * (1 - (t - 1) / 0.35);
    }
    // Slight raised Trafalgar Plaza island at (0,0)
    const rCenter = Math.hypot(x, z);
    if (rCenter < 22) {
      h += (1 - smooth(17, 22, rCenter)) * 0.55;
    }
    h += smooth(468, 545, Math.max(Math.abs(x), Math.abs(z))) * (14 + fbm(x * 0.03, z * 0.03, 2) * 10);
    return h;
  }

  function normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 1.5;
    out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e));
    return out.normalize();
  }

  const sunDir = new THREE.Vector3(0.45, 0.54, 0.42).normalize();
  const sun = new THREE.DirectionalLight(0xffead2, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -115;
  sc.right = 115;
  sc.top = 115;
  sc.bottom = -115;
  sc.near = 10;
  sc.far = 450;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  root.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xaac8e8, 0x483c36, 1.05);
  root.add(hemi);

  const skyUniforms = {
    sunDir: { value: sunDir },
    uCrimson: { value: 1.0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir; uniform float uCrimson;
      void main(){
        vec3 d = normalize(vP); float h = max(d.y, 0.0);
        vec3 calmHoriz = vec3(0.76, 0.84, 0.92);
        vec3 calmMid   = vec3(0.42, 0.64, 0.88);
        vec3 calmTop   = vec3(0.18, 0.39, 0.72);
        vec3 calmCol   = mix(calmHoriz, calmMid, smoothstep(0.0, 0.28, h));
        calmCol        = mix(calmCol, calmTop, smoothstep(0.24, 0.9, h));

        vec3 redHoriz = vec3(0.78, 0.22, 0.09);
        vec3 redMid   = vec3(0.48, 0.09, 0.06);
        vec3 redTop   = vec3(0.15, 0.03, 0.04);
        vec3 redCol   = mix(redHoriz, redMid, smoothstep(0.0, 0.34, h));
        redCol        = mix(redCol, redTop, smoothstep(0.28, 0.92, h));

        vec3 col = mix(calmCol, redCol, uCrimson);
        float s = max(dot(d, normalize(sunDir)), 1e-4);
        vec3 sunGlowCalm = vec3(1.0, 0.88, 0.65) * (pow(s, 7.0) * 0.25 + pow(s, 64.0) * 0.45);
        vec3 sunGlowRed  = vec3(1.0, 0.34, 0.14) * pow(s, 5.0) * 0.38;
        col += mix(sunGlowCalm, sunGlowRed, uCrimson);
        vec3 groundFade = mix(vec3(0.48, 0.52, 0.56), vec3(0.35, 0.11, 0.07), uCrimson);
        col = mix(col, groundFade, smoothstep(0.0, -0.14, d.y) * 0.92);
        col = clamp(col, vec3(0.0), vec3(6.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Group();
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), skyMat));
  root.add(sky);

  const cloudMat = new THREE.SpriteMaterial({
    map: softSprite(210, 214, 220),
    transparent: true,
    depthWrite: false,
    fog: false,
    opacity: 0.72,
    color: new THREE.Color(0xdadfe6),
  });
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 24; i++) {
    const grp = new THREE.Group();
    const n = 5 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const sp = new THREE.Sprite(cloudMat);
      const sz = 180 + rand() * 210;
      sp.scale.set(sz * 1.5, sz * 0.62, 1);
      sp.position.set((k - n / 2) * 95 + rand() * 45, rand() * 28, rand() * 90);
      grp.add(sp);
    }
    grp.position.set((rand() - 0.5) * 3000, 310 + rand() * 140, (rand() - 0.5) * 3000);
    root.add(grp);
    clouds.push(grp);
  }

  let currentCrimson = 1.0;
  const _cCalmBg = new THREE.Color(0x9fb8d4);
  const _cRedBg = new THREE.Color(0x631b13);
  const _cCalmSun = new THREE.Color(0xfff0d4);
  const _cRedSun = new THREE.Color(0xff8e60);
  const _cCalmHemiSky = new THREE.Color(0xaecce8);
  const _cRedHemiSky = new THREE.Color(0xc24932);
  const _cCalmCloud = new THREE.Color(0xe6ecf2);
  const _cRedCloud = new THREE.Color(0x3a1412);

  function setBlitzAtmosphere(crimson: number): void {
    const k = Math.min(1, Math.max(0, crimson));
    currentCrimson = k;
    skyUniforms.uCrimson.value = k;
    sun.color.copy(_cCalmSun).lerp(_cRedSun, k);
    sun.intensity = 2.25 - k * 0.25;
    hemi.color.copy(_cCalmHemiSky).lerp(_cRedHemiSky, k);
    hemi.intensity = 1.1 - k * 0.05;
    cloudMat.color.copy(_cCalmCloud).lerp(_cRedCloud, k);
    cloudMat.opacity = 0.68 + k * 0.18;
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(_cCalmBg).lerp(_cRedBg, k);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(_cCalmBg).lerp(_cRedBg, k);
    }
  }

  function createEnvironment(renderer: THREE.WebGLRenderer) {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.02).texture;
    scene.environmentIntensity = 0.45;
    pm.dispose();
  }

  // Terrain mesh (high-resolution road/sidewalk/plaza distinction)
  const SEG = 156;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  {
    const pos = tGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const asphalt = new THREE.Color(0x41444c);
    const pave = new THREE.Color(0x8c8478);
    const plaza = new THREE.Color(0x9a9183);
    const brickYard = new THREE.Color(0x695a4e);
    const soot = new THREE.Color(0x2a2422);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const ri = roadInfo(x, z);
      const rCenter = Math.hypot(x, z);
      const half = ri.isMain ? MAIN_ROAD_HALF : SIDE_ROAD_HALF;
      const n = fbm(x * 0.05, z * 0.05, 3);
      if (rCenter < 20.5) c.copy(plaza);
      else if (ri.dist < half) c.copy(asphalt);
      else if (ri.dist < half + 3.6) c.copy(pave);
      else c.copy(brickYard);
      c.lerp(soot, n * 0.35 + smooth(-0.2, -1.0, h) * 0.6);
      const j = 0.89 + hash2(i, 40) * 0.22;
      col[i * 3] = c.r * j;
      col[i * 3 + 1] = c.g * j;
      col[i * 3 + 2] = c.b * j;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = tGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 28, uv.getY(i) * 28);
    tGeo.computeVertexNormals();
  }
  const roadTex = londonAsphaltTexture();
  const terrain = new THREE.Mesh(
    tGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: roadTex,
      bumpMap: roadTex,
      bumpScale: 1.1,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.04,
    }),
  );
  terrain.receiveShadow = true;
  root.add(terrain);

  const SECTOR_GRID = 4;
  const SECTOR_COUNT = SECTOR_GRID * SECTOR_GRID;
  const SECTOR_SPAN = SIZE / SECTOR_GRID;
  const sectorBoxes: THREE.Box3[] = [];
  for (let gz = 0; gz < SECTOR_GRID; gz++) {
    for (let gx = 0; gx < SECTOR_GRID; gx++) {
      const x0 = -SIZE / 2 + gx * SECTOR_SPAN;
      const z0 = -SIZE / 2 + gz * SECTOR_SPAN;
      sectorBoxes.push(new THREE.Box3(new THREE.Vector3(x0, -15, z0), new THREE.Vector3(x0 + SECTOR_SPAN, 75, z0 + SECTOR_SPAN)));
    }
  }

  interface InstancedSectorChunk {
    mesh: THREE.InstancedMesh;
    box: THREE.Box3;
  }

  // Road markings (dashed lines, crosswalks), granite curbs, and twin steel tram rails along boulevards
  const roadMarkSectors: InstancedSectorChunk[] = [];
  const curbSectors: InstancedSectorChunk[] = [];
  const railSectors: InstancedSectorChunk[] = [];
  {
    const unitGeo = new THREE.BoxGeometry(1, 1, 1);
    const markMat = new THREE.MeshStandardMaterial({ color: 0xe6dec8, roughness: 0.85, metalness: 0 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x8f887d, roughness: 0.92, metalness: 0.02 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 0.42, metalness: 0.78 });

    const markBuckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const curbBuckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const railBuckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const pushItem = (
      buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>>,
      x: number,
      y: number,
      z: number,
      yaw: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      if (Math.abs(x) >= SIZE / 2 - 4 || Math.abs(z) >= SIZE / 2 - 4) return;
      q.setFromAxisAngle(up, yaw);
      m.compose(p.set(x, y, z), q, s.set(sx, sy, sz));
      const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x, y, z });
    };

    const streetCoords = [-360, -240, -120, 0, 120, 240, 360];
    for (const coord of streetCoords) {
      const isMain = coord === 0;
      const half = isMain ? MAIN_ROAD_HALF : SIDE_ROAD_HALF;
      for (const horiz of [false, true]) {
        // Dashed lane lines
        for (let t = -460; t <= 460; t += 10) {
          const x = horiz ? t : coord;
          const z = horiz ? coord : t;
          if (Math.hypot(x, z) < 42) continue;
          const nearCross = streetCoords.some((c) => Math.abs(t - c) < 13);
          if (nearCross) continue;
          const y = heightAt(x, z) + 0.04;
          pushItem(markBuckets, x, y, z, horiz ? Math.PI / 2 : 0, 0.32, 0.05, 4.2);
          if (isMain) {
            // Double dashed lines flanking tram tracks
            for (const off of [-5.2, 5.2]) {
              const lx = horiz ? t : coord + off;
              const lz = horiz ? coord + off : t;
              pushItem(markBuckets, lx, heightAt(lx, lz) + 0.04, lz, horiz ? Math.PI / 2 : 0, 0.24, 0.05, 3.8);
            }
          }
        }

        // Crosswalks at intersections on main avenues
        for (const cross of streetCoords) {
          if (cross === 0 && coord === 0) continue;
          for (const dir of [-1, 1]) {
            const ct = cross + dir * 13.5;
            if (Math.hypot(horiz ? ct : coord, horiz ? coord : ct) < 40) continue;
            for (let stripe = -half + 1.5; stripe <= half - 1.5; stripe += 2.2) {
              const x = horiz ? ct : coord + stripe;
              const z = horiz ? coord + stripe : ct;
              pushItem(markBuckets, x, heightAt(x, z) + 0.045, z, horiz ? Math.PI / 2 : 0, 0.72, 0.05, 2.8);
            }
          }
        }

        // Granite curbs flanking roads
        for (let t = -456; t <= 456; t += 16) {
          const x0 = horiz ? t : coord;
          const z0 = horiz ? coord : t;
          if (Math.hypot(x0, z0) < 42) continue;
          const nearCross = streetCoords.some((c) => Math.abs(t - c) < (c === 0 ? 15 : 11));
          if (nearCross) continue;
          for (const side of [-1, 1]) {
            const cx = horiz ? t : coord + side * (half + 0.35);
            const cz = horiz ? coord + side * (half + 0.35) : t;
            pushItem(curbBuckets, cx, heightAt(cx, cz) + 0.14, cz, horiz ? Math.PI / 2 : 0, 0.55, 0.34, 14.5);
          }
        }

        // Twin steel tram rails down main boulevards
        if (isMain) {
          for (let t = -456; t <= 456; t += 18) {
            const x0 = horiz ? t : 0;
            const z0 = horiz ? 0 : t;
            if (Math.hypot(x0, z0) < 40) continue;
            for (const railOff of [-1.2, 1.2]) {
              const rx = horiz ? t : railOff;
              const rz = horiz ? railOff : t;
              pushItem(railBuckets, rx, heightAt(rx, rz) + 0.06, rz, horiz ? Math.PI / 2 : 0, 0.18, 0.08, 17.8);
            }
          }
        }
      }
    }

    // Trafalgar Roundabout circular stone curb
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const cx = Math.cos(a) * 21.8;
      const cz = Math.sin(a) * 21.8;
      pushItem(curbBuckets, cx, heightAt(cx, cz) + 0.18, cz, -a, 0.7, 0.42, 4.9);
    }

    const flushSectors = (
      buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>>,
      mat: THREE.Material,
      target: InstancedSectorChunk[],
      pad: number,
    ) => {
      for (let sec = 0; sec < SECTOR_COUNT; sec++) {
        const b = buckets[sec];
        if (b.length === 0) continue;
        const mesh = new THREE.InstancedMesh(unitGeo, mat, b.length);
        mesh.receiveShadow = true;
        const box = new THREE.Box3();
        for (let i = 0; i < b.length; i++) {
          mesh.setMatrixAt(i, b[i].m);
          box.expandByPoint(p.set(b[i].x - pad, b[i].y - 0.5, b[i].z - pad));
          box.expandByPoint(p.set(b[i].x + pad, b[i].y + 1.0, b[i].z + pad));
        }
        mesh.count = b.length;
        mesh.computeBoundingSphere();
        root.add(mesh);
        target.push({ mesh, box });
      }
    };

    flushSectors(markBuckets, markMat, roadMarkSectors, 3);
    flushSectors(curbBuckets, curbMat, curbSectors, 8);
    flushSectors(railBuckets, railMat, railSectors, 9);
  }

  // Multi-material War-Ruined London Architecture (brick upper walls + Portland stone plinths/columns + slate roofs)
  const wallMat = new THREE.MeshStandardMaterial({
    map: londonBrickTexture(),
    vertexColors: true,
    roughness: 0.92,
    flatShading: true,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xb6ac99,
    vertexColors: true,
    roughness: 0.9,
    flatShading: true,
  });
  const slateMat = new THREE.MeshStandardMaterial({
    color: 0x353b42,
    vertexColors: true,
    roughness: 0.85,
    flatShading: true,
  });
  const lowProxyMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  interface BuildingSectorChunk {
    meshes: THREE.Mesh[];
    low: THREE.Mesh | null;
    box: THREE.Box3;
  }
  const buildingSectors: BuildingSectorChunk[] = [];
  const smokePts: Array<[number, number, number]> = [];
  const buildingFootprints: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];

  {
    const brickBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const stoneBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const slateBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const lowBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const sBoxes = Array.from({ length: SECTOR_COUNT }, () => new THREE.Box3());
    const tmpP = new THREE.Vector3();

    const addRuinedTownhouse = (cx: number, cz: number, w: number, d: number, floors: number) => {
      const sec = sectorIndexFor(cx, cz, SIZE / 2, SECTOR_GRID);
      const bBrick = brickBuckets[sec];
      const bStone = stoneBuckets[sec];
      const bSlate = slateBuckets[sec];
      const bLow = lowBuckets[sec];
      const sBox = sBoxes[sec];

      const base = Math.min(heightAt(cx - w / 2, cz - d / 2), heightAt(cx + w / 2, cz + d / 2)) - 0.6;
      const floorH = 4.3;
      const hgt = floors * floorH;
      const shade = 0.78 + rand() * 0.22;
      const t = 1.15;

      // Ground-floor Portland stone shopfront plinth & corner pilasters (surviving base)
      const plinthH = 3.8;
      const breachSide = Math.floor(rand() * 4); // 0:-Z, 1:+Z, 2:-X, 3:+X
      // Roof survives only over the intact end (0 = -Z half, 1 = +Z half), never over the breached wall!
      const roofSide = breachSide < 2 ? 1 - breachSide : rand() < 0.5 ? 0 : 1;

      const walls = [
        { alongX: true, fx: cx, fz: cz - d / 2, span: w, sideIdx: 0 },
        { alongX: true, fx: cx, fz: cz + d / 2, span: w, sideIdx: 1 },
        { alongX: false, fx: cx - w / 2, fz: cz, span: d, sideIdx: 2 },
        { alongX: false, fx: cx + w / 2, fz: cz, span: d, sideIdx: 3 },
      ];

      for (const wall of walls) {
        const isRoofBackWall = wall.sideIdx === roofSide;
        const isBreached = !isRoofBackWall && (wall.sideIdx === breachSide || rand() < 0.35);
        const segments = 3;
        const segLen = wall.span / segments;
        for (let si = 0; si < segments; si++) {
          const offset = (si - 1) * segLen;
          const sx = wall.alongX ? wall.fx + offset : wall.fx;
          const sz = wall.alongX ? wall.fz : wall.fz + offset;
          const sw = wall.alongX ? segLen + 0.15 : t;
          const sd = wall.alongX ? t : segLen + 0.15;

          // Side wall segments adjacent to the roofed end must always reach full hgt so the roof rests solidly on them
          const supportsRoof =
            isRoofBackWall ||
            (!wall.alongX && ((roofSide === 0 && si <= 1) || (roofSide === 1 && si >= 1)));

          let wallH = hgt;
          if (!supportsRoof) {
            if (isBreached) {
              if (si === 1) wallH = 1.6 + rand() * 2.2;
              else wallH = hgt * (0.45 + rand() * 0.4);
            } else if (si === 1 && rand() < 0.32) {
              wallH = hgt * (0.65 + rand() * 0.25);
            }
          }

          // Limestone base plinth
          const pH = Math.min(wallH, plinthH);
          if (pH > 0.4) {
            bStone.push(boxGeo(sw + 0.15, pH, sd + 0.15, sx, base + pH * 0.5, sz, shade * 1.05));
          }
          // Brick upper stories + stepped ruins
          if (wallH > plinthH + 0.4) {
            const uH = wallH - plinthH;
            bBrick.push(boxGeo(sw, uH, sd, sx, base + plinthH + uH * 0.5, sz, shade));
          }
        }
      }

      // Corner stone pilasters framing the London facade (full height at roofed corners!)
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const atRoofEnd = (roofSide === 0 && sz < 0) || (roofSide === 1 && sz > 0);
        const ch = atRoofEnd ? hgt : rand() < 0.55 ? hgt * (0.58 + rand() * 0.32) : plinthH + 1.4;
        bStone.push(boxGeo(1.4, ch, 1.4, cx + (sx * w) / 2, base + ch * 0.5, cz + (sz * d) / 2, shade * 0.95));
      }

      // Exposed interior concrete/timber floor slabs anchored strictly inside the roofed/standing end
      for (let fl = 1; fl < floors; fl++) {
        const fy = base + fl * floorH;
        const sw = w * 0.88;
        const sd = d * 0.44;
        const fz = cz + (roofSide === 0 ? -d * 0.24 : d * 0.24);
        bStone.push(boxGeo(sw, 0.42, sd, cx, fy, fz, 0.56));
        for (let b = -1; b <= 1; b++) {
          bSlate.push(boxGeo(sw * 0.92, 0.28, 0.36, cx, fy + 0.3, fz + b * (sd * 0.28), 0.34));
        }
      }

      // Interior brick partition wall + gable supports under the intact roof half so the roof never overhangs sky
      const roofDir = roofSide === 0 ? -1 : 1;
      bBrick.push(boxGeo(w - t * 0.6, hgt, 0.95, cx, base + hgt * 0.5, cz, shade * 0.9));
      for (const sideX of [-1, 1]) {
        bBrick.push(boxGeo(t, 1.85, d * 0.44, cx + sideX * (w / 2), base + hgt + 0.8, cz + roofDir * d * 0.24, shade * 0.92));
      }

      // Half-collapsed pitched slate roof seated squarely atop the solid roofSide walls + brick chimney stack
      const rw = w + 0.35;
      const rd = d * 0.5;
      const rz = cz + roofDir * d * 0.25;
      bSlate.push(rotBoxGeo(rw, 0.72, rd, cx, base + hgt + 0.75, rz, roofSide === 0 ? -0.22 : 0.22, 0, 0, shade * 0.85));

      const chX = cx + (rand() < 0.5 ? -w * 0.36 : w * 0.36);
      const chZ = cz + (roofSide === 0 ? -d * 0.44 : d * 0.44);
      bBrick.push(boxGeo(1.7, 4.2, 1.5, chX, base + hgt + 1.5, chZ, shade * 0.88));
      bStone.push(boxGeo(2.0, 0.4, 1.8, chX, base + hgt + 3.6, chZ, 0.8));

      // Low LOD silhouette
      bLow.push(boxGeo(w, hgt * 0.82, d, cx, base + hgt * 0.41, cz, 0.58 * shade));

      const minX = cx - w / 2 - t / 2;
      const maxX = cx + w / 2 + t / 2;
      const minZ = cz - d / 2 - t / 2;
      const maxZ = cz + d / 2 + t / 2;
      obstacles.push({
        min: new THREE.Vector3(minX, base, minZ),
        max: new THREE.Vector3(maxX, base + hgt, maxZ),
        kind: 'structure',
      });
      buildingFootprints.push({ minX: minX - 2.6, maxX: maxX + 2.6, minZ: minZ - 2.6, maxZ: maxZ + 2.6 });
      sBox.expandByPoint(tmpP.set(minX, base, minZ));
      sBox.expandByPoint(tmpP.set(maxX, base + hgt + 4.5, maxZ));

      if (rand() < 0.34) smokePts.push([cx, cz, base + hgt * 0.45]);
    };

    // Place London city blocks on grid quadrants, keeping streets, diagonal avenue, Trafalgar plaza & spawn clear
    const blockCenters = [-420, -300, -180, -60, 60, 180, 300, 420];
    for (const bx of blockCenters) {
      for (const bz of blockCenters) {
        // Keep Trafalgar plaza & Big Ben / Cathedral hero lots free
        if (Math.hypot(bx, bz) < 88) continue;
        if (Math.abs(bx - -158) < 42 && Math.abs(bz - 72) < 42) continue;

        const count = rand() < 0.65 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const cx = bx + (count === 2 ? (k === 0 ? -19 : 19) : (rand() - 0.5) * 18);
          const cz = bz + (rand() - 0.5) * 20;
          const w = 18 + rand() * 11;
          const d = 17 + rand() * 11;
          const ri = roadInfo(cx, cz);
          const safeMargin = (ri.isMain ? MAIN_ROAD_HALF : SIDE_ROAD_HALF) + Math.max(w, d) * 0.55 + 4;
          if (ri.dist < safeMargin) continue;
          if (Math.hypot(cx, cz + 240) < 34) continue;
          addRuinedTownhouse(cx, cz, w, d, 2 + Math.floor(rand() * 3));
        }
      }
    }

    // Landmark 1: Elizabeth Tower (Big Ben) + Damaged Palace Wing at (48, 58)
    {
      const tx = 48;
      const tz = 58;
      const sec = sectorIndexFor(tx, tz, SIZE / 2, SECTOR_GRID);
      const base = heightAt(tx, tz) - 0.5;
      stoneBuckets[sec].push(boxGeo(12.5, 36, 12.5, tx, base + 18, tz, 0.72));
      // Gothic vertical stone corner buttresses & face ribs along tower shaft
      for (const [cxOff, czOff] of [
        [-6.4, -6.4],
        [6.4, -6.4],
        [-6.4, 6.4],
        [6.4, 6.4],
        [-2.8, -6.4],
        [2.8, -6.4],
        [-2.8, 6.4],
        [2.8, 6.4],
        [-6.4, -2.8],
        [-6.4, 2.8],
        [6.4, -2.8],
        [6.4, 2.8],
      ]) {
        slateBuckets[sec].push(boxGeo(1.05, 36, 1.05, tx + cxOff, base + 18, tz + czOff, 0.68));
      }
      stoneBuckets[sec].push(boxGeo(14.2, 11, 14.2, tx, base + 40.5, tz, 0.78));
      stoneBuckets[sec].push(boxGeo(15.2, 1.4, 15.2, tx, base + 35.0, tz, 0.58));
      stoneBuckets[sec].push(boxGeo(15.4, 1.4, 15.4, tx, base + 46.2, tz, 0.58));
      // Gothic belfry + pointed 4-sided Gothic pyramid spire (slightly blast-tilted)
      stoneBuckets[sec].push(boxGeo(10.8, 4.8, 10.8, tx, base + 49.0, tz, 0.72));
      const spire = new THREE.Mesh(new THREE.ConeGeometry(6.9, 17.5, 4), slateMat);
      spire.position.set(tx + 0.35, base + 59.5, tz - 0.25);
      spire.rotation.set(0.05, Math.PI / 4, -0.06);
      spire.castShadow = true;
      root.add(spire);
      // Adjacent damaged Parliament wing
      brickBuckets[sec].push(boxGeo(26, 13, 14, tx + 19, base + 6.5, tz + 3, 0.85));
      stoneBuckets[sec].push(boxGeo(26.5, 2.2, 14.5, tx + 19, base + 13.5, tz + 3, 0.92));
      lowBuckets[sec].push(boxGeo(13, 58, 13, tx, base + 29, tz, 0.88));
      obstacles.push({
        min: new THREE.Vector3(tx - 7, base, tz - 7),
        max: new THREE.Vector3(tx + 32, base + 60, tz + 10),
        kind: 'structure',
      });
      buildingFootprints.push({ minX: tx - 9, maxX: tx + 34, minZ: tz - 9, maxZ: tz + 12 });
      sBoxes[sec].expandByPoint(tmpP.set(tx - 8, base, tz - 8));
      sBoxes[sec].expandByPoint(tmpP.set(tx + 33, base + 65, tz + 11));
      smokePts.unshift([tx + 20, tz - 18, base + 8]);

      // 4 Glowing Clock Dials on Elizabeth Tower
      const clockTex = clockFaceTexture();
      const clockMat = new THREE.MeshBasicMaterial({ map: clockTex, toneMapped: false });
      const dialGeo = new THREE.PlaneGeometry(7.8, 7.8);
      for (const [dx, dz, ry] of [
        [0, -7.06, Math.PI],
        [0, 7.06, 0],
        [-7.06, 0, -Math.PI / 2],
        [7.06, 0, Math.PI / 2],
      ] as const) {
        const dial = new THREE.Mesh(dialGeo, clockMat);
        dial.position.set(tx + dx, base + 40.5, tz + dz);
        dial.rotation.y = ry;
        root.add(dial);
      }
    }

    // Landmark 2: Nelson's Column (Trafalgar Plaza center, column upper third snapped off!)
    {
      const base = heightAt(0, 0) - 0.3;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.5, 3.2, 9.5), stoneMat);
      plinth.position.set(0, base + 1.6, 0);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(4.6, 5.2, 4.6), stoneMat);
      ped.position.set(0, base + 5.8, 0);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 13.5, 10), stoneMat);
      col.position.set(0, base + 15.0, 0);
      col.rotation.z = 0.04;
      plinth.castShadow = ped.castShadow = col.castShadow = true;
      root.add(plinth, ped, col);
      obstacles.push({ min: new THREE.Vector3(-5, base, -5), max: new THREE.Vector3(5, base + 22, 5), kind: 'structure' });
      buildingFootprints.push({ minX: -7.5, maxX: 7.5, minZ: -7.5, maxZ: 7.5 });
    }

    // Landmark 3: Bombed St. Paul's-Style Cathedral Dome at (-158, 72)
    {
      const cx = -158;
      const cz = 72;
      const base = heightAt(cx, cz) - 0.5;
      const nave = new THREE.Mesh(new THREE.BoxGeometry(28, 13, 38), stoneMat);
      nave.position.set(cx, base + 6.5, cz);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.8, 10, 14), stoneMat);
      drum.position.set(cx, base + 17.5, cz);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(9.4, 14, 10, 0, Math.PI * 1.65, 0, Math.PI * 0.52),
        new THREE.MeshStandardMaterial({ color: 0x456358, roughness: 0.72, metalness: 0.25, side: THREE.DoubleSide }),
      );
      dome.position.set(cx, base + 22.0, cz);
      nave.castShadow = drum.castShadow = dome.castShadow = true;
      root.add(nave, drum, dome);
      obstacles.push({
        min: new THREE.Vector3(cx - 14.5, base, cz - 19.5),
        max: new THREE.Vector3(cx + 14.5, base + 32, cz + 19.5),
        kind: 'structure',
      });
      buildingFootprints.push({ minX: cx - 17, maxX: cx + 17, minZ: cz - 22, maxZ: cz + 22 });
    }

    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const meshes: THREE.Mesh[] = [];
      for (const [buckets, mat] of [
        [brickBuckets, wallMat],
        [stoneBuckets, stoneMat],
        [slateBuckets, slateMat],
      ] as const) {
        if (buckets[sec].length === 0) continue;
        const m = new THREE.Mesh(mergeGeometries(buckets[sec]), mat);
        m.castShadow = true;
        m.receiveShadow = true;
        root.add(m);
        meshes.push(m);
        buckets[sec].forEach((g) => g.dispose());
      }
      if (meshes.length === 0) continue;
      let low: THREE.Mesh | null = null;
      if (lowBuckets[sec].length > 0) {
        low = new THREE.Mesh(mergeGeometries(lowBuckets[sec]), lowProxyMat);
        low.visible = false;
        root.add(low);
        lowBuckets[sec].forEach((g) => g.dispose());
      }
      buildingSectors.push({ meshes, low, box: sBoxes[sec] });
    }
  }

  // Hero Street Prop 1: Wrecked Red Double-Decker London Buses (composite 6-part vehicles!)
  const busSectors: Array<{ group: THREE.Group; box: THREE.Box3 }> = [];
  {
    const busRedMat = new THREE.MeshStandardMaterial({ color: 0xb41d1a, roughness: 0.58, metalness: 0.22 });
    const busCreamMat = new THREE.MeshStandardMaterial({ color: 0xded6c0, roughness: 0.7, metalness: 0.08 });
    const busGlassMat = new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.35, metalness: 0.4 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.92, metalness: 0.05 });

    const bodyGeo = new THREE.BoxGeometry(2.55, 2.0, 8.2);
    const upperGeo = new THREE.BoxGeometry(2.5, 1.85, 7.6);
    const stripeGeo = new THREE.BoxGeometry(2.6, 0.34, 7.65);
    const hoodGeo = new THREE.BoxGeometry(1.9, 1.35, 1.4);
    const winGeo = new THREE.BoxGeometry(2.58, 0.72, 6.6);
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.36, 10);
    wheelGeo.rotateZ(Math.PI / 2);

    const busPlacements: Array<[number, number, number, number]> = [
      // One right along spawn avenue edge so it frames the ruined London street!
      [-6.8, -196, 0.28, 0.06],
      [6.4, -128, -0.45, -0.05],
      [-5.5, -52, 0.65, 0],
      [28, -22, 1.15, 0.07],
      [-30, 16, -0.82, 0],
      [7.2, 138, 0.2, -0.06],
      [-118, -6.5, 1.52, 0],
      [126, 5.8, -1.35, 0.05],
    ];

    for (const [bx, bz, yaw, tilt] of busPlacements) {
      const by = heightAt(bx, bz);
      const grp = new THREE.Group();
      const lower = new THREE.Mesh(bodyGeo, busRedMat);
      lower.position.y = 1.45;
      const upper = new THREE.Mesh(upperGeo, busRedMat);
      upper.position.set(0, 3.35, -0.25);
      const stripe = new THREE.Mesh(stripeGeo, busCreamMat);
      stripe.position.set(0, 2.48, -0.25);
      const winL = new THREE.Mesh(winGeo, busGlassMat);
      winL.position.set(0, 3.48, -0.25);
      const winU = new THREE.Mesh(winGeo, busGlassMat);
      winU.position.set(0, 1.78, -0.2);
      const hood = new THREE.Mesh(hoodGeo, busRedMat);
      hood.position.set(0, 1.15, 4.45);
      grp.add(lower, upper, stripe, winL, winU, hood);
      for (const [wx, wz] of [
        [-1.18, 2.7],
        [1.18, 2.7],
        [-1.18, -2.5],
        [1.18, -2.5],
      ]) {
        const w = new THREE.Mesh(wheelGeo, tireMat);
        w.position.set(wx, 0.55, wz);
        grp.add(w);
      }
      grp.position.set(bx, by, bz);
      grp.rotation.set(0, yaw, tilt);
      grp.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      root.add(grp);
      const r = 4.6;
      const box = new THREE.Box3(new THREE.Vector3(bx - r, by, bz - r), new THREE.Vector3(bx + r, by + 4.4, bz + r));
      busSectors.push({ group: grp, box });
      obstacles.push({ min: new THREE.Vector3(bx - 3.6, by, bz - 3.6), max: new THREE.Vector3(bx + 3.6, by + 4.3, bz + 3.6), kind: 'structure' });
    }
  }

  // Hero Street Prop 2: Ornate Cast-Iron London Streetlamps along sidewalks
  const lampSectors: Array<{ post: THREE.InstancedMesh; lantern: THREE.InstancedMesh; box: THREE.Box3 }> = [];
  {
    const pBase = new THREE.CylinderGeometry(0.18, 0.28, 1.1, 8).translate(0, 0.55, 0);
    const pShaft = new THREE.CylinderGeometry(0.08, 0.14, 4.6, 7).translate(0, 3.3, 0);
    const pCross = new THREE.BoxGeometry(0.9, 0.1, 0.1).translate(0, 5.1, 0);
    const postGeo = mergeGeometries([pBase, pShaft, pCross]);
    const lanternGeo = new THREE.CylinderGeometry(0.32, 0.18, 0.65, 6).translate(0, 5.95, 0);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222629, roughness: 0.65, metalness: 0.6 });
    const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffd27d, toneMapped: false });

    const buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);

    const lampLines = [-240, -120, 0, 120, 240];
    for (const coord of lampLines) {
      const half = coord === 0 ? MAIN_ROAD_HALF + 0.9 : SIDE_ROAD_HALF + 0.9;
      for (const horiz of [false, true]) {
        for (let t = -360; t <= 360; t += 38) {
          const x0 = horiz ? t : coord;
          const z0 = horiz ? coord : t;
          if (Math.hypot(x0, z0) < 42) continue;
          const nearCross = lampLines.some((c) => Math.abs(t - c) < 16);
          if (nearCross) continue;
          for (const side of [-1, 1]) {
            if (rand() < 0.25) continue;
            const lx = horiz ? t : coord + side * half;
            const lz = horiz ? coord + side * half : t;
            const ly = heightAt(lx, lz);
            const bent = rand() < 0.22;
            q.setFromEuler(new THREE.Euler(bent ? (rand() - 0.5) * 0.45 : 0, rand() * 6.28, bent ? (rand() - 0.5) * 0.45 : 0));
            m.compose(p.set(lx, ly, lz), q, s);
            const sec = sectorIndexFor(lx, lz, SIZE / 2, SECTOR_GRID);
            buckets[sec].push({ m: m.clone(), x: lx, y: ly, z: lz });
          }
        }
      }
    }

    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = buckets[sec];
      if (b.length === 0) continue;
      const post = new THREE.InstancedMesh(postGeo, postMat, b.length);
      const lantern = new THREE.InstancedMesh(lanternGeo, lanternMat, b.length);
      post.castShadow = true;
      const box = new THREE.Box3();
      for (let i = 0; i < b.length; i++) {
        post.setMatrixAt(i, b[i].m);
        lantern.setMatrixAt(i, b[i].m);
        box.expandByPoint(p.set(b[i].x - 1.5, b[i].y, b[i].z - 1.5));
        box.expandByPoint(p.set(b[i].x + 1.5, b[i].y + 6.5, b[i].z + 1.5));
      }
      post.count = lantern.count = b.length;
      post.computeBoundingSphere();
      lantern.computeBoundingSphere();
      root.add(post, lantern);
      lampSectors.push({ post, lantern, box });
    }
  }

  // Iconic Red British K6 Telephone Boxes & Royal Mail Pillar Postboxes
  const phoneBoxGeo = new THREE.BoxGeometry(1.15, 2.55, 1.15).translate(0, 1.275, 0);
  const phoneBoxMat = new THREE.MeshStandardMaterial({ map: phoneBoxWindowTexture(), roughness: 0.45, metalness: 0.25 });
  const phoneDomeGeo = new THREE.CylinderGeometry(0.45, 0.62, 0.34, 8).translate(0, 2.7, 0);
  const phoneDomeMat = new THREE.MeshStandardMaterial({ color: 0xb81414, roughness: 0.5, metalness: 0.2 });

  const phoneSectors: Array<{ body: THREE.InstancedMesh; dome: THREE.InstancedMesh; box: THREE.Box3 }> = [];
  {
    const buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);

    for (let ix = -3; ix <= 3; ix++) {
      for (let iz = -3; iz <= 3; iz++) {
        if (rand() < 0.42) continue;
        const x = ix * 120 + (rand() < 0.5 ? -9.5 : 9.5);
        const z = iz * 120 + (rand() < 0.5 ? -15 : 15);
        if (Math.hypot(x, z) < 38) continue;
        const y = heightAt(x, z);
        q.setFromAxisAngle(up, Math.floor(rand() * 4) * (Math.PI / 2));
        m.compose(p.set(x, y, z), q, s);
        const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
        buckets[sec].push({ m: m.clone(), x, y, z });
      }
    }
    for (const [px, pz, ang] of [
      [-13.0, -214, Math.PI * 0.5],
      [13.0, -196, -Math.PI * 0.5],
      [-13.0, -150, Math.PI * 0.5],
    ] as const) {
      const py = heightAt(px, pz);
      q.setFromAxisAngle(up, ang);
      m.compose(p.set(px, py, pz), q, s);
      const sec = sectorIndexFor(px, pz, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x: px, y: py, z: pz });
    }
    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = buckets[sec];
      if (b.length === 0) continue;
      const body = new THREE.InstancedMesh(phoneBoxGeo, phoneBoxMat, b.length);
      const dome = new THREE.InstancedMesh(phoneDomeGeo, phoneDomeMat, b.length);
      const box = new THREE.Box3();
      for (let i = 0; i < b.length; i++) {
        body.setMatrixAt(i, b[i].m);
        dome.setMatrixAt(i, b[i].m);
        box.expandByPoint(p.set(b[i].x - 1.5, b[i].y, b[i].z - 1.5));
        box.expandByPoint(p.set(b[i].x + 1.5, b[i].y + 3.2, b[i].z + 1.5));
      }
      body.count = dome.count = b.length;
      body.computeBoundingSphere();
      dome.computeBoundingSphere();
      root.add(body, dome);
      phoneSectors.push({ body, dome, box });
    }
  }

  // Anti-tank Czech Hedgehogs along defensive street points
  const hedgehogSectors: InstancedSectorChunk[] = [];
  {
    const beam1 = new THREE.BoxGeometry(0.18, 2.2, 0.18);
    beam1.rotateZ(0.75);
    beam1.rotateY(0.4);
    const beam2 = new THREE.BoxGeometry(0.18, 2.2, 0.18);
    beam2.rotateZ(-0.75);
    beam2.rotateY(0.4);
    const beam3 = new THREE.BoxGeometry(0.18, 2.2, 0.18);
    beam3.rotateX(0.75);
    beam3.rotateY(-0.3);
    const hedgeGeo = mergeGeometries([beam1, beam2, beam3]);
    hedgeGeo.translate(0, 0.78, 0);
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3b3d3e, roughness: 0.72, metalness: 0.68 });

    const buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < 72; i++) {
      const line = Math.floor((rand() - 0.5) * 6) * 120;
      const along = (rand() - 0.5) * 760;
      const horiz = rand() < 0.5;
      const half = line === 0 ? MAIN_ROAD_HALF : SIDE_ROAD_HALF;
      const side = (rand() < 0.5 ? -1 : 1) * (half + 0.5);
      const x = horiz ? along : line + side;
      const z = horiz ? line + side : along;
      if (Math.hypot(x, z + 240) < 22 || Math.hypot(x, z) < 35) continue;
      const y = heightAt(x, z);
      q.setFromAxisAngle(up, rand() * 6.28);
      m.compose(p.set(x, y, z), q, s);
      const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x, y, z });
    }
    for (const [hx, hz] of [
      [-11.8, -206],
      [11.8, -212],
      [-11.8, -172],
    ] as const) {
      const hy = heightAt(hx, hz);
      q.setFromAxisAngle(up, rand() * 6.28);
      m.compose(p.set(hx, hy, hz), q, s);
      const sec = sectorIndexFor(hx, hz, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x: hx, y: hy, z: hz });
    }
    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = buckets[sec];
      if (b.length === 0) continue;
      const mesh = new THREE.InstancedMesh(hedgeGeo, hedgeMat, b.length);
      const box = new THREE.Box3();
      for (let i = 0; i < b.length; i++) {
        mesh.setMatrixAt(i, b[i].m);
        box.expandByPoint(p.set(b[i].x - 1.5, b[i].y, b[i].z - 1.5));
        box.expandByPoint(p.set(b[i].x + 1.5, b[i].y + 2.0, b[i].z + 1.5));
      }
      mesh.count = b.length;
      mesh.computeBoundingSphere();
      root.add(mesh);
      hedgehogSectors.push({ mesh, box });
    }
  }

  // Stacked Sandbag Barricades + Wooden Benches/Postboxes
  const sandbagSectors: InstancedSectorChunk[] = [];
  {
    const bags: THREE.BufferGeometry[] = [];
    for (let r = 0; r < 3; r++) {
      const count = 4 - r;
      const y = 0.22 + r * 0.36;
      for (let c = 0; c < count; c++) {
        const bg = new THREE.BoxGeometry(0.92, 0.36, 0.62);
        bg.translate((c - (count - 1) * 0.5) * 0.94, y, (r % 2) * 0.06);
        bags.push(bg);
      }
    }
    const sandbagGeo = mergeGeometries(bags);
    const sandbagMat = new THREE.MeshStandardMaterial({ color: 0xa38c64, roughness: 0.95, metalness: 0 });
    const buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < 66; i++) {
      const line = Math.floor((rand() - 0.5) * 6) * 120;
      const along = (rand() - 0.5) * 740;
      const horiz = rand() < 0.5;
      const half = line === 0 ? MAIN_ROAD_HALF : SIDE_ROAD_HALF;
      const side = (rand() < 0.5 ? -1 : 1) * (half + 1.8);
      const x = horiz ? along : line + side;
      const z = horiz ? line + side : along;
      if (Math.hypot(x, z + 240) < 20) continue;
      const y = heightAt(x, z);
      q.setFromAxisAngle(up, horiz ? 0 : Math.PI / 2);
      m.compose(p.set(x, y, z), q, s);
      const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x, y, z });
    }
    for (const [sx, sz, ang] of [
      [-12.6, -210, Math.PI * 0.44],
      [12.6, -203, -Math.PI * 0.44],
      [12.6, -168, -Math.PI * 0.44],
    ] as const) {
      const sy = heightAt(sx, sz);
      q.setFromAxisAngle(up, ang);
      m.compose(p.set(sx, sy, sz), q, s);
      const sec = sectorIndexFor(sx, sz, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x: sx, y: sy, z: sz });
    }
    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = buckets[sec];
      if (b.length === 0) continue;
      const mesh = new THREE.InstancedMesh(sandbagGeo, sandbagMat, b.length);
      const box = new THREE.Box3();
      for (let i = 0; i < b.length; i++) {
        mesh.setMatrixAt(i, b[i].m);
        box.expandByPoint(p.set(b[i].x - 2.2, b[i].y, b[i].z - 1.5));
        box.expandByPoint(p.set(b[i].x + 2.2, b[i].y + 1.5, b[i].z + 1.5));
      }
      mesh.count = b.length;
      mesh.computeBoundingSphere();
      root.add(mesh);
      sandbagSectors.push({ mesh, box });
    }
  }

  // Bombed Brick & Masonry Rubble Piles near ruins & curbs
  const rubbleSectors: InstancedSectorChunk[] = [];
  {
    const chunks: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const rg = new THREE.DodecahedronGeometry(0.65 + (k % 3) * 0.28, 0);
      rg.scale(1.4, 0.62, 1.15);
      rg.rotateY(k * 0.9);
      rg.translate(Math.cos(k * 1.1) * 1.35, 0.25 + (k % 2) * 0.22, Math.sin(k * 1.3) * 1.1);
      chunks.push(rg);
    }
    const rubbleGeo = mergeGeometries(chunks);
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x764d3e, roughness: 0.95, flatShading: true });
    const buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < 84; i++) {
      const line = Math.floor((rand() - 0.5) * 6) * 120;
      const along = (rand() - 0.5) * 760;
      const horiz = rand() < 0.5;
      const half = line === 0 ? MAIN_ROAD_HALF : SIDE_ROAD_HALF;
      const side = (rand() < 0.5 ? -1 : 1) * (half + 3.2 + rand() * 3.5);
      const x = horiz ? along : line + side;
      const z = horiz ? line + side : along;
      if (Math.hypot(x, z + 240) < 20 || Math.hypot(x, z) < 35) continue;
      const y = heightAt(x, z);
      const sc = 0.85 + rand() * 0.7;
      q.setFromAxisAngle(up, rand() * 6.28);
      m.compose(p.set(x, y, z), q, s.set(sc, sc * 0.85, sc));
      const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x, y, z });
    }
    for (const [rx, rz] of [
      [-14.5, -186],
      [14.5, -182],
      [-14.5, -158],
    ] as const) {
      const ry = heightAt(rx, rz);
      q.setFromAxisAngle(up, rand() * 6.28);
      m.compose(p.set(rx, ry, rz), q, s.set(1.15, 0.95, 1.15));
      const sec = sectorIndexFor(rx, rz, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x: rx, y: ry, z: rz });
    }
    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = buckets[sec];
      if (b.length === 0) continue;
      const mesh = new THREE.InstancedMesh(rubbleGeo, rubbleMat, b.length);
      const box = new THREE.Box3();
      for (let i = 0; i < b.length; i++) {
        mesh.setMatrixAt(i, b[i].m);
        box.expandByPoint(p.set(b[i].x - 3.2, b[i].y, b[i].z - 3.2));
        box.expandByPoint(p.set(b[i].x + 3.2, b[i].y + 2.0, b[i].z + 3.2));
      }
      mesh.count = b.length;
      mesh.computeBoundingSphere();
      root.add(mesh);
      rubbleSectors.push({ mesh, box });
    }
  }

  // Blitz smoke plumes + glowing fires
  const plumes: Array<{ sp: THREE.Sprite; x: number; z: number; h: number; phase: number; speed: number; drift: number }> = [];
  const fireSprites: Array<{ sp: THREE.Sprite; x: number; y: number; z: number; baseScale: number; phase: number }> = [];
  {
    const smokeTex = softSprite(34, 30, 30);
    const fireTex = softSprite(255, 118, 34);
    for (const [x, z, h] of smokePts.slice(0, 9)) {
      for (let k = 0; k < 7; k++) {
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.55, fog: true }),
        );
        root.add(sp);
        plumes.push({ sp, x, z, h, phase: k / 7, speed: 0.055 + rand() * 0.025, drift: rand() * 6.28 });
      }
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: fireTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.78,
        }),
      );
      const gy = heightAt(x, z) + 3.2;
      glow.position.set(x, gy, z);
      root.add(glow);
      fireSprites.push({ sp: glow, x, y: gy, z, baseScale: 16 + rand() * 8, phase: rand() * 6.28 });
    }
  }

  // WWII Luftwaffe Bombers (Cutscene Squadron + Combat Raid Squadron)
  const crossTex = balkenkreuzTexture();
  const crossMat = new THREE.MeshBasicMaterial({ map: crossTex, transparent: true, side: THREE.DoubleSide });
  const camoTopMat = new THREE.MeshStandardMaterial({ color: 0x353c30, roughness: 0.68, metalness: 0.25 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0x627380, roughness: 0.72, metalness: 0.15 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x20303a, roughness: 0.25, metalness: 0.6 });
  const propMat = new THREE.MeshBasicMaterial({
    color: 0xd0d4d8,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  interface BomberActor {
    group: THREE.Group;
    props: THREE.Mesh[];
    offsetX: number;
    offsetY: number;
    offsetZ: number;
    orbitRadius: number;
    orbitSpeed: number;
    orbitPhase: number;
    altitude: number;
  }

  const cutsceneBombers: BomberActor[] = [];
  interface RaidActor {
    group: THREE.Group;
    props: THREE.Mesh[];
    fireGlow: THREE.Sprite;
    smokeTrail: THREE.Sprite[];
  }
  const raidBombers: RaidActor[] = [];

  for (let i = 0; i < 6; i++) {
    const variant = i % 2 === 0 ? 'he111' : 'ju88';
    const built = createLuftwaffeBomberMesh(variant, crossMat, camoTopMat, bellyMat, glassMat, propMat);
    built.group.scale.setScalar(1.35);
    built.group.visible = false;
    root.add(built.group);
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    cutsceneBombers.push({
      group: built.group,
      props: built.props,
      offsetX: -row * 26,
      offsetY: (i % 3) * 4,
      offsetZ: i === 0 ? 0 : side * (16 + row * 14),
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitPhase: 0,
      altitude: 108 + (i % 2) * 8,
    });
  }

  const crashFireTex = softSprite(255, 118, 28);
  const crashSmokeTex = softSprite(28, 24, 24);
  for (let i = 0; i < AIR_RAID_CONFIG.totalAircraft; i++) {
    const variant = i % 2 === 0 ? 'he111' : 'ju88';
    const built = createLuftwaffeBomberMesh(variant, crossMat, camoTopMat, bellyMat, glassMat, propMat);
    built.group.scale.setScalar(i < 2 ? 1.25 : 1.15);
    built.group.visible = false;
    built.group.rotation.order = 'YXZ';
    root.add(built.group);

    const fireGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: crashFireTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.9,
      }),
    );
    fireGlow.scale.set(16, 16, 1);
    fireGlow.visible = false;
    built.group.add(fireGlow);

    const smokeTrail: THREE.Sprite[] = [];
    for (let k = 0; k < 4; k++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: crashSmokeTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.72,
        }),
      );
      sp.visible = false;
      root.add(sp);
      smokeTrail.push(sp);
    }

    raidBombers.push({
      group: built.group,
      props: built.props,
      fireGlow,
      smokeTrail,
    });
  }

  // Ground AA Batteries (ПВО): 6 sandbagged gun emplacements + pooled tracer streaks + sky flak bursts
  const aaDynamicGroup = new THREE.Group();
  root.add(aaDynamicGroup);
  interface AaBattery {
    x: number;
    y: number;
    z: number;
    turret: THREE.Group;
  }
  const aaBatteries: AaBattery[] = [];
  {
    const sandMat = new THREE.MeshStandardMaterial({ color: 0x9b855c, roughness: 0.95 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x2d3236, roughness: 0.55, metalness: 0.6 });
    const pitGeo = new THREE.CylinderGeometry(3.2, 3.6, 1.05, 10, 1, true);
    const pedGeo = new THREE.CylinderGeometry(0.5, 0.75, 1.1, 8);
    const barrelGeo = new THREE.CylinderGeometry(0.08, 0.12, 3.2, 6).translate(0, 1.6, 0);

    for (const [ax, az] of [
      [-72, -145],
      [72, -145],
      [-92, 24],
      [92, 24],
      [-74, 145],
      [74, 145],
    ] as const) {
      const ay = heightAt(ax, az);
      const pit = new THREE.Mesh(pitGeo, sandMat);
      pit.position.set(ax, ay + 0.5, az);
      const ped = new THREE.Mesh(pedGeo, steelMat);
      ped.position.set(ax, ay + 0.55, az);
      root.add(pit, ped);

      const turret = new THREE.Group();
      turret.position.set(ax, ay + 1.1, az);
      const b1 = new THREE.Mesh(barrelGeo, steelMat);
      b1.position.x = -0.18;
      const b2 = new THREE.Mesh(barrelGeo, steelMat);
      b2.position.x = 0.18;
      turret.add(b1, b2);
      aaDynamicGroup.add(turret);
      aaBatteries.push({ x: ax, y: ay + 1.4, z: az, turret });
    }
  }

  interface AaTracer {
    mesh: THREE.Mesh;
    age: number;
    life: number;
    sx: number;
    sy: number;
    sz: number;
    vx: number;
    vy: number;
    vz: number;
  }
  const aaTracers: AaTracer[] = [];
  {
    const tracerGeo = new THREE.BoxGeometry(0.24, 0.24, 5.5);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffc64a, toneMapped: false });
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(tracerGeo, tracerMat);
      mesh.visible = false;
      aaDynamicGroup.add(mesh);
      aaTracers.push({ mesh, age: 99, life: 0.8, sx: 0, sy: 0, sz: 0, vx: 0, vy: 0, vz: 0 });
    }
  }

  interface AaFlakBurst {
    smoke: THREE.Sprite;
    flash: THREE.Sprite;
    age: number;
    life: number;
    x: number;
    y: number;
    z: number;
  }
  const aaFlakBursts: AaFlakBurst[] = [];
  {
    const flakSmokeTex = softSprite(36, 32, 34);
    const flakFlashTex = softSprite(255, 165, 58);
    for (let i = 0; i < 10; i++) {
      const smoke = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: flakSmokeTex, transparent: true, depthWrite: false, opacity: 0.78 }),
      );
      const flash = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: flakFlashTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.9,
        }),
      );
      smoke.visible = flash.visible = false;
      aaDynamicGroup.add(smoke, flash);
      aaFlakBursts.push({ smoke, flash, age: 99, life: 1.4, x: 0, y: 0, z: 0 });
    }
  }
  let aaFireAcc = 0;
  let aaFlakAcc = 0;
  let aaTracerCursor = 0;
  let aaFlakCursor = 0;

  function updateCutsceneBombers(progress: number, dt: number, active: boolean): void {
    const visible = active && progress > 0 && progress < 1.05;
    const leadX = -210 + progress * 440;
    const leadZ = -125 - progress * 45;
    for (let i = 0; i < cutsceneBombers.length; i++) {
      const b = cutsceneBombers[i];
      b.group.visible = visible;
      if (!visible) continue;
      b.group.position.set(leadX + b.offsetX, b.altitude + b.offsetY, leadZ + b.offsetZ);
      b.group.rotation.set(-0.04, Math.PI * 0.54, Math.sin(progress * 6 + i) * 0.04 - 0.12);
      for (let p = 0; p < b.props.length; p++) {
        b.props[p].rotation.z += dt * 32;
      }
    }
  }

  let retreatOffset = 0;
  const _aaAimTarget = new THREE.Vector3();
  function syncRaidAircraft(
    aircraft: ReadonlyArray<RaidAircraft>,
    simTime: number,
    dt: number,
    active: boolean,
    retreating: boolean,
  ): void {
    if (retreating) {
      retreatOffset += dt * 80;
    } else {
      retreatOffset = 0;
    }

    const flyingTargets: RaidAircraft[] = [];
    let focusTarget: RaidAircraft | null = null;
    for (let i = 0; i < aircraft.length; i++) {
      const a = aircraft[i];
      if (a.state === 'approaching' || a.state === 'egress') {
        flyingTargets.push(a);
        if (a.aaUnderFire) focusTarget = a;
      }
    }

    for (let i = 0; i < raidBombers.length; i++) {
      const actor = raidBombers[i];
      if (!active || i >= aircraft.length) {
        actor.group.visible = false;
        actor.fireGlow.visible = false;
        for (let k = 0; k < actor.smokeTrail.length; k++) actor.smokeTrail[k].visible = false;
        continue;
      }
      const p = aircraft[i];
      if (p.state === 'crashed') {
        actor.group.visible = false;
        actor.fireGlow.visible = false;
        for (let k = 0; k < actor.smokeTrail.length; k++) actor.smokeTrail[k].visible = false;
        continue;
      }

      actor.group.visible = true;
      const retY = retreating ? retreatOffset * 0.4 : 0;
      const retX = retreating ? Math.sin(p.heading) * retreatOffset : 0;
      const retZ = retreating ? Math.cos(p.heading) * retreatOffset : 0;
      actor.group.position.set(p.x + retX, p.y + retY, p.z + retZ);
      actor.group.rotation.set(retreating ? -0.15 : p.pitch, p.heading, p.roll);

      for (let k = 0; k < actor.props.length; k++) {
        actor.props[k].rotation.z += dt * (p.state === 'crashing' ? 14 : 34);
      }

      const isCrashing = p.state === 'crashing';
      actor.fireGlow.visible = isCrashing;
      if (isCrashing) {
        const flick = 14 + Math.sin(simTime * 22 + i) * 3.5;
        actor.fireGlow.scale.set(flick, flick, 1);
        for (let k = 0; k < actor.smokeTrail.length; k++) {
          const sp = actor.smokeTrail[k];
          sp.visible = true;
          const lag = (k + 1) * 0.22;
          sp.position.set(
            p.x - p.crashVx * lag + Math.sin(simTime * 5 + k) * 1.8,
            p.y - p.crashVy * lag + k * 1.4,
            p.z - p.crashVz * lag + Math.cos(simTime * 5 + k) * 1.8,
          );
          const sz = 10 + k * 4.5;
          sp.scale.set(sz, sz, 1);
        }
      } else {
        for (let k = 0; k < actor.smokeTrail.length; k++) actor.smokeTrail[k].visible = false;
      }
    }

    // Aim AA batteries & spawn tracers + sky flak bursts when raid aircraft are in the sky
    const primaryAim = focusTarget ?? flyingTargets[0] ?? null;
    for (let i = 0; i < aaBatteries.length; i++) {
      const bat = aaBatteries[i];
      if (primaryAim) {
        const targetForBat = focusTarget ?? flyingTargets[i % flyingTargets.length];
        _aaAimTarget.set(targetForBat.x, targetForBat.y, targetForBat.z);
        bat.turret.lookAt(_aaAimTarget);
        bat.turret.rotateX(Math.PI / 2);
      }
    }

    if (active && !retreating && flyingTargets.length > 0) {
      const fireRate = focusTarget ? 0.08 : 0.22;
      aaFireAcc += dt;
      if (aaFireAcc >= fireRate) {
        aaFireAcc = 0;
        const target = focusTarget ?? flyingTargets[aaTracerCursor % flyingTargets.length];
        const bat = aaBatteries[aaTracerCursor % aaBatteries.length];
        const tr = aaTracers[aaTracerCursor % aaTracers.length];
        aaTracerCursor++;

        const spread = focusTarget ? 7 : 18;
        const tx = target.x + (Math.random() - 0.5) * spread;
        const ty = target.y + (Math.random() - 0.5) * spread * 0.6;
        const tz = target.z + (Math.random() - 0.5) * spread;
        const dx = tx - bat.x;
        const dy = ty - bat.y;
        const dz = tz - bat.z;
        const dist = Math.max(10, Math.hypot(dx, dy, dz));
        const spd = 290;

        tr.age = 0;
        tr.life = dist / spd;
        tr.sx = bat.x;
        tr.sy = bat.y;
        tr.sz = bat.z;
        tr.vx = (dx / dist) * spd;
        tr.vy = (dy / dist) * spd;
        tr.vz = (dz / dist) * spd;
        tr.mesh.position.set(bat.x, bat.y, bat.z);
        tr.mesh.lookAt(tx, ty, tz);
        tr.mesh.visible = true;
      }

      const flakRate = focusTarget ? 0.14 : 0.36;
      aaFlakAcc += dt;
      if (aaFlakAcc >= flakRate) {
        aaFlakAcc = 0;
        const target = focusTarget ?? flyingTargets[aaFlakCursor % flyingTargets.length];
        const fl = aaFlakBursts[aaFlakCursor % aaFlakBursts.length];
        aaFlakCursor++;

        const spread = focusTarget ? 11 : 28;
        fl.age = 0;
        fl.life = 1.35;
        fl.x = target.x + (Math.random() - 0.5) * spread;
        fl.y = target.y + (Math.random() - 0.5) * 14;
        fl.z = target.z + (Math.random() - 0.5) * spread;
        fl.smoke.position.set(fl.x, fl.y, fl.z);
        fl.flash.position.set(fl.x, fl.y, fl.z);
        fl.smoke.visible = true;
        fl.flash.visible = true;
      }
    }

    for (let i = 0; i < aaTracers.length; i++) {
      const tr = aaTracers[i];
      if (!tr.mesh.visible) continue;
      tr.age += dt;
      if (tr.age >= tr.life) {
        tr.mesh.visible = false;
        continue;
      }
      tr.mesh.position.set(tr.sx + tr.vx * tr.age, tr.sy + tr.vy * tr.age, tr.sz + tr.vz * tr.age);
    }

    for (let i = 0; i < aaFlakBursts.length; i++) {
      const fl = aaFlakBursts[i];
      if (!fl.smoke.visible) continue;
      fl.age += dt;
      if (fl.age >= fl.life) {
        fl.smoke.visible = false;
        fl.flash.visible = false;
        continue;
      }
      const t = fl.age / fl.life;
      const sSz = 7 + t * 14;
      fl.smoke.scale.set(sSz, sSz, 1);
      (fl.smoke.material as THREE.SpriteMaterial).opacity = 0.78 * (1 - t);
      if (t < 0.22) {
        const fSz = 9 + t * 24;
        fl.flash.visible = true;
        fl.flash.scale.set(fSz, fSz, 1);
        (fl.flash.material as THREE.SpriteMaterial).opacity = 1 - t / 0.22;
      } else {
        fl.flash.visible = false;
      }
    }
  }

  // Pooled Bomb / Rocket / Crash Zone + Yellow/Red-Orange Ground Warning Circle Visuals (zero runtime allocations)
  const MAX_VISUAL_BOMBS = 14;
  interface BombVisualSlot {
    ringOuter: THREE.Mesh;
    fillDisc: THREE.Mesh;
    fuseRing: THREE.Mesh;
    projGroup: THREE.Group;
    bombMesh: THREE.Mesh;
    rocketMesh: THREE.Mesh;
  }

  const outerRingGeo = new THREE.RingGeometry(0.82, 1.0, 40);
  outerRingGeo.rotateX(-Math.PI / 2);
  const fillDiscGeo = new THREE.CircleGeometry(1.0, 36);
  fillDiscGeo.rotateX(-Math.PI / 2);
  const fuseRingGeo = new THREE.RingGeometry(0.05, 1.0, 36);
  fuseRingGeo.rotateX(-Math.PI / 2);

  const bombBodyGeo = new THREE.CylinderGeometry(0.32, 0.24, 2.6, 8);
  const bombFinsGeo = new THREE.BoxGeometry(1.15, 0.55, 0.14);
  const bombBodyMerged = mergeGeometries([bombBodyGeo, bombFinsGeo.clone().translate(0, 1.05, 0), bombFinsGeo.clone().rotateY(Math.PI / 2).translate(0, 1.05, 0)]);
  const rocketBodyMerged = mergeGeometries([
    new THREE.CylinderGeometry(0.16, 0.16, 2.3, 8),
    new THREE.ConeGeometry(0.22, 0.55, 8).translate(0, -1.35, 0),
  ]);

  const bombMat = new THREE.MeshStandardMaterial({ color: 0x26292c, roughness: 0.55, metalness: 0.45 });
  const rocketMat = new THREE.MeshStandardMaterial({
    color: 0xc9b48a,
    emissive: new THREE.Color(0xff5a18),
    emissiveIntensity: 0.55,
    roughness: 0.5,
  });

  const visualSlots: BombVisualSlot[] = [];
  for (let i = 0; i < MAX_VISUAL_BOMBS; i++) {
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xffea1a,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const fuseMat = new THREE.MeshBasicMaterial({
      color: 0xff6200,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    const ringOuter = new THREE.Mesh(outerRingGeo, outerMat);
    const fillDisc = new THREE.Mesh(fillDiscGeo, fillMat);
    const fuseRing = new THREE.Mesh(fuseRingGeo, fuseMat);
    ringOuter.visible = fillDisc.visible = fuseRing.visible = false;
    root.add(ringOuter, fillDisc, fuseRing);

    const projGroup = new THREE.Group();
    const bombMesh = new THREE.Mesh(bombBodyMerged, bombMat);
    const rocketMesh = new THREE.Mesh(rocketBodyMerged, rocketMat);
    projGroup.add(bombMesh, rocketMesh);
    projGroup.visible = false;
    root.add(projGroup);

    visualSlots.push({ ringOuter, fillDisc, fuseRing, projGroup, bombMesh, rocketMesh });
  }

  function syncBombVisuals(
    strikes: ReadonlyArray<BombStrike>,
    simTime: number,
    aircraft?: ReadonlyArray<RaidAircraft>,
  ): void {
    const pulse = 0.8 + 0.2 * Math.sin(simTime * 11);
    let slotIdx = 0;

    for (let i = 0; i < strikes.length && slotIdx < MAX_VISUAL_BOMBS; i++, slotIdx++) {
      const slot = visualSlots[slotIdx];
      const s = strikes[i];
      const frac = Math.min(1, Math.max(0, 1 - s.fuseRemaining / Math.max(0.05, s.fuseTotal)));
      const yRing = s.groundY + 0.16;

      slot.ringOuter.visible = true;
      slot.ringOuter.position.set(s.x, yRing + 0.03, s.z);
      slot.ringOuter.scale.setScalar(s.radius);
      const outerMat = slot.ringOuter.material as THREE.MeshBasicMaterial;
      outerMat.color.setHex(0xffea1a);
      outerMat.opacity = 0.85 * pulse;

      slot.fillDisc.visible = true;
      slot.fillDisc.position.set(s.x, yRing, s.z);
      slot.fillDisc.scale.setScalar(s.radius);
      const fillMat = slot.fillDisc.material as THREE.MeshBasicMaterial;
      fillMat.color.setHex(0xffcc00);
      fillMat.opacity = 0.2 + frac * 0.18;

      slot.fuseRing.visible = true;
      slot.fuseRing.position.set(s.x, yRing + 0.02, s.z);
      slot.fuseRing.scale.setScalar(Math.max(0.3, s.radius * frac));

      const alt = s.startHeight * (1 - frac);
      slot.projGroup.visible = true;
      slot.projGroup.position.set(s.x, s.groundY + alt, s.z);
      slot.bombMesh.visible = s.kind === 'bomb';
      slot.rocketMesh.visible = s.kind === 'rocket';
      if (s.kind === 'bomb') {
        slot.bombMesh.rotation.y += 0.08;
      }
    }

    if (aircraft) {
      for (let i = 0; i < aircraft.length && slotIdx < MAX_VISUAL_BOMBS; i++) {
        const p = aircraft[i];
        if (p.state !== 'crashing') continue;
        const slot = visualSlots[slotIdx++];
        const yRing = p.crashTargetGroundY + 0.18;
        const crashFrac = Math.min(1, Math.max(0, 1 - (p.y - p.crashTargetGroundY) / Math.max(20, p.altitude)));

        slot.ringOuter.visible = true;
        slot.ringOuter.position.set(p.crashTargetX, yRing + 0.04, p.crashTargetZ);
        slot.ringOuter.scale.setScalar(AIR_RAID_CONFIG.crashBombRadiusM);
        const outerMat = slot.ringOuter.material as THREE.MeshBasicMaterial;
        outerMat.color.setHex(0xff4a1a);
        outerMat.opacity = 0.92 * pulse;

        slot.fillDisc.visible = true;
        slot.fillDisc.position.set(p.crashTargetX, yRing, p.crashTargetZ);
        slot.fillDisc.scale.setScalar(AIR_RAID_CONFIG.crashBombRadiusM);
        const fillMat = slot.fillDisc.material as THREE.MeshBasicMaterial;
        fillMat.color.setHex(0xff5a1f);
        fillMat.opacity = 0.2 + crashFrac * 0.22;

        slot.fuseRing.visible = true;
        slot.fuseRing.position.set(p.crashTargetX, yRing + 0.02, p.crashTargetZ);
        slot.fuseRing.scale.setScalar(Math.max(1.0, AIR_RAID_CONFIG.crashBombRadiusM * crashFrac));

        slot.projGroup.visible = false;
      }
    }

    for (; slotIdx < MAX_VISUAL_BOMBS; slotIdx++) {
      const slot = visualSlots[slotIdx];
      slot.ringOuter.visible = false;
      slot.fillDisc.visible = false;
      slot.fuseRing.visible = false;
      slot.projGroup.visible = false;
    }
  }

  function isSpotOpenForBomb(x: number, z: number): boolean {
    for (let i = 0; i < buildingFootprints.length; i++) {
      const b = buildingFootprints[i];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return false;
    }
    return true;
  }

  let time = 0;
  const staticExempt = new Set<THREE.Object3D>([
    sky,
    sun,
    sun.target,
    aaDynamicGroup,
    ...clouds,
    ...plumes.map((p) => p.sp),
    ...fireSprites.map((f) => f.sp),
    ...cutsceneBombers.map((b) => b.group),
    ...raidBombers.flatMap((b) => [b.group, ...b.smokeTrail]),
    ...visualSlots.flatMap((v) => [v.ringOuter, v.fillDisc, v.fuseRing, v.projGroup]),
  ]);
  for (const child of root.children) {
    if (!staticExempt.has(child)) {
      child.matrixAutoUpdate = false;
      child.updateMatrix();
    }
  }

  function update(camPos: THREE.Vector3, focus: THREE.Vector3, dt = 0.016, vis?: VisibilityController) {
    sky.position.copy(camPos);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDir, 220);
    sun.target.updateMatrixWorld();
    time += dt;

    for (const c of clouds) {
      c.position.x += 2.2 * dt;
      if (c.position.x > 1600) c.position.x = -1600;
      c.visible = vis ? vis.isSphereVisible(c.position.x, c.position.y, c.position.z, 320) : true;
    }

    if (vis) {
      for (let s = 0; s < SECTOR_COUNT; s++) {
        const sb = sectorBoxes[s];
        if (vis.isBoxVisible(sb) && vis.boxEffectiveDistance(sb) < 920) {
          vis.stats.visibleSectors++;
        } else {
          vis.stats.culledSectors++;
        }
      }

      for (let i = 0; i < roadMarkSectors.length; i++) {
        const ms = roadMarkSectors[i];
        ms.mesh.visible = vis.isBoxVisible(ms.box) && vis.boxEffectiveDistance(ms.box) <= 220;
      }

      for (let i = 0; i < curbSectors.length; i++) {
        const cs = curbSectors[i];
        cs.mesh.visible = vis.isBoxVisible(cs.box) && vis.boxEffectiveDistance(cs.box) <= 240;
      }

      for (let i = 0; i < railSectors.length; i++) {
        const rs = railSectors[i];
        rs.mesh.visible = vis.isBoxVisible(rs.box) && vis.boxEffectiveDistance(rs.box) <= 220;
      }

      for (let i = 0; i < buildingSectors.length; i++) {
        const bs = buildingSectors[i];
        const inFrustum = vis.isBoxVisible(bs.box);
        const effDist = vis.boxEffectiveDistance(bs.box);
        const tier = resolveBuildingLod(inFrustum, effDist);
        if (tier === 'high') {
          for (const m of bs.meshes) {
            m.visible = true;
            m.castShadow = effDist < 135;
          }
          if (bs.low) bs.low.visible = false;
        } else if (tier === 'low') {
          for (const m of bs.meshes) m.visible = false;
          if (bs.low) bs.low.visible = true;
        } else {
          for (const m of bs.meshes) m.visible = false;
          if (bs.low) bs.low.visible = false;
        }
      }

      for (let i = 0; i < busSectors.length; i++) {
        const bs = busSectors[i];
        bs.group.visible = vis.isBoxVisible(bs.box) && vis.boxEffectiveDistance(bs.box) <= 340;
      }

      for (let i = 0; i < lampSectors.length; i++) {
        const ls = lampSectors[i];
        const show = vis.isBoxVisible(ls.box) && vis.boxEffectiveDistance(ls.box) <= 240;
        ls.post.visible = show;
        ls.lantern.visible = show;
      }

      for (let i = 0; i < phoneSectors.length; i++) {
        const ps = phoneSectors[i];
        const show = vis.isBoxVisible(ps.box) && vis.boxEffectiveDistance(ps.box) <= 240;
        ps.body.visible = show;
        ps.dome.visible = show;
      }

      for (let i = 0; i < hedgehogSectors.length; i++) {
        const hs = hedgehogSectors[i];
        hs.mesh.visible = vis.isBoxVisible(hs.box) && vis.boxEffectiveDistance(hs.box) <= 200;
      }

      for (let i = 0; i < sandbagSectors.length; i++) {
        const ss = sandbagSectors[i];
        ss.mesh.visible = vis.isBoxVisible(ss.box) && vis.boxEffectiveDistance(ss.box) <= 220;
      }

      for (let i = 0; i < rubbleSectors.length; i++) {
        const rs = rubbleSectors[i];
        rs.mesh.visible = vis.isBoxVisible(rs.box) && vis.boxEffectiveDistance(rs.box) <= 240;
      }
    }

    const fireScaleBoost = 0.35 + currentCrimson * 0.65;
    for (let i = 0; i < fireSprites.length; i++) {
      const f = fireSprites[i];
      if (vis && (!vis.isSphereVisible(f.x, f.y, f.z, 24) || vis.effectiveDistanceTo(f.x, f.y, f.z) > 650)) {
        f.sp.visible = false;
        continue;
      }
      f.sp.visible = currentCrimson > 0.15;
      const flick = f.baseScale * fireScaleBoost * (0.85 + 0.22 * Math.sin(time * 9.5 + f.phase));
      f.sp.scale.set(flick, flick * 0.85, 1);
      f.sp.material.opacity = 0.65 * currentCrimson;
    }

    for (const p of plumes) {
      if (currentCrimson < 0.08) {
        p.sp.visible = false;
        continue;
      }
      if (vis) {
        const visible = vis.isSphereVisible(p.x, p.h + 75, p.z, 110) && vis.effectiveDistanceTo(p.x, p.h + 45, p.z) < 680;
        p.sp.visible = visible;
        if (!visible) continue;
      } else {
        p.sp.visible = true;
      }
      const t = (time * p.speed + p.phase) % 1;
      p.sp.position.set(p.x + Math.cos(p.drift) * t * 55, p.h + 3 + t * 155, p.z + Math.sin(p.drift) * t * 55);
      const sz = 14 + t * 72;
      p.sp.scale.set(sz, sz, 1);
      p.sp.material.opacity = 0.55 * currentCrimson * Math.sin(Math.min(1, t) * Math.PI);
    }
  }

  function dispose() {
    scene.remove(root);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const sm = m as THREE.MeshStandardMaterial;
          if (sm.map) sm.map.dispose();
          m.dispose();
        }
      }
    });
    if (sun.shadow.map) sun.shadow.map.dispose();
  }

  const q = makeQueries(obstacles, heightAt, normalAt);
  setBlitzAtmosphere(1.0);

  return {
    id: 'london',
    name: 'Лондон',
    size: SIZE,
    limit: LIMIT,
    heightAt,
    normalAt,
    obstacles,
    segmentHit: q.segmentHit,
    raycast: q.raycast,
    nearby: q.nearby,
    update,
    sun,
    terrain,
    createEnvironment,
    dispose,
    setGrass() {},
    fogColor: 0x631b13,
    fogNear: 120,
    fogFar: 940,
    background: 0x631b13,
    exposure: 1.08,
    grade: { sat: 1.05, tint: [1.06, 0.96, 0.92] },
    spawnPlayer: { x: 0, z: -240, heading: 0 },
    spawnA: () => ({ x: 0, z: -240, heading: 0 }),
    spawnB: () => ({ x: 0, z: 240, heading: Math.PI }),
    objectives: [
      { x: 0, z: -120 },
      { x: 0, z: 0 },
      { x: 120, z: 0 },
      { x: -120, z: 0 },
    ],
    objJitter: 8,
    setBlitzAtmosphere,
    updateCutsceneBombers,
    syncRaidAircraft,
    syncBombVisuals,
    isSpotOpenForBomb,
  };
}
