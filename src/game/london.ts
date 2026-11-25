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
import type { BombStrike } from './bombardment';

const SIZE = 1000;
const LIMIT = 480;
const ROAD_HALF = 8.5;

export interface LondonWorld extends GameWorld {
  setBlitzAtmosphere: (crimson: number) => void;
  updateCutsceneBombers: (progress: number, dt: number, active: boolean) => void;
  updateRaidBombers: (focus: THREE.Vector3, time: number, dt: number, active: boolean, retreating: boolean) => void;
  syncBombVisuals: (strikes: ReadonlyArray<BombStrike>, simTime: number) => void;
  isSpotOpenForBomb: (x: number, z: number) => boolean;
}

function roadDist(x: number, z: number): number {
  const gx = Math.abs(x / 100 - Math.round(x / 100));
  const gz = Math.abs(z / 100 - Math.round(z / 100));
  return Math.min(gx, gz) * 100;
}

function londonAsphaltTexture(): THREE.CanvasTexture {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d')!;
  g.fillStyle = '#38383c';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6500; i++) {
    const v = 42 + Math.floor(Math.random() * 54);
    g.fillStyle = `rgba(${v},${v},${v + 2},0.42)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // Subtle London cobble grid + scorch marks
  g.strokeStyle = 'rgba(20,20,22,0.22)';
  g.lineWidth = 1;
  for (let y = 0; y < 512; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  for (let i = 0; i < 20; i++) {
    g.fillStyle = `rgba(18,14,12,${0.08 + Math.random() * 0.14})`;
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 512, 18 + Math.random() * 52, 12 + Math.random() * 36, Math.random() * 3, 0, 6.283);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function londonBrickTexture(): THREE.CanvasTexture {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#733f32';
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 32; row++) {
    const y = row * 8;
    const off = (row % 2) * 8;
    for (let x = -8; x < 256; x += 16) {
      const shade = 0.8 + Math.random() * 0.35;
      g.fillStyle = `rgb(${Math.round(115 * shade)},${Math.round(62 * shade)},${Math.round(49 * shade)})`;
      g.fillRect(x + off + 1, y + 1, 14, 6);
    }
  }
  // Soot & Blitz fire weathering
  for (let i = 0; i < 34; i++) {
    g.fillStyle = `rgba(18,15,14,${0.12 + Math.random() * 0.22})`;
    g.fillRect(Math.random() * 256, Math.random() * 140, 6 + Math.random() * 16, 40 + Math.random() * 180);
  }
  // Georgian/Victorian recessed windows with cream stone lintels
  for (const [x, y] of [
    [28, 28],
    [148, 28],
    [28, 152],
    [148, 152],
  ]) {
    g.fillStyle = '#a39784';
    g.fillRect(x - 6, y - 10, 90, 12);
    g.fillRect(x - 4, y + 86, 86, 6);
    g.fillStyle = '#121316';
    g.fillRect(x, y, 78, 86);
    g.strokeStyle = '#6f6b64';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + 39, y);
    g.lineTo(x + 39, y + 86);
    g.moveTo(x, y + 43);
    g.lineTo(x + 78, y + 43);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function phoneBoxWindowTexture(): THREE.CanvasTexture {
  const c = makeCanvas(64, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = '#b91919';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#e7dec8';
  g.fillRect(8, 14, 48, 88);
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
  // Outer white arms
  g.fillStyle = '#f2f2ee';
  g.fillRect(46, 12, 36, 104);
  g.fillRect(12, 46, 104, 36);
  // Inner dark fill cutout
  g.fillStyle = '#141618';
  g.fillRect(54, 12, 20, 104);
  g.fillRect(12, 54, 104, 20);
  // Central crisp black cross
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
  const T = 6;
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

  // Fuselage along +Z (forward)
  const fuseLen = isHe111 ? 16.4 : 14.4;
  const fuseGeo = new THREE.CylinderGeometry(isHe111 ? 0.95 : 0.82, isHe111 ? 0.42 : 0.36, fuseLen, 8);
  fuseGeo.rotateX(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuseGeo, camoTopMat);
  grp.add(fuselage);

  // Characteristic WWII glazed nose (He 111 rounded stepless greenhouse vs Ju 88 pointed faceted canopy)
  const noseGeo = isHe111
    ? new THREE.SphereGeometry(0.95, 8, 6)
    : new THREE.ConeGeometry(0.84, 3.2, 6);
  if (!isHe111) noseGeo.rotateX(Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, glassMat);
  nose.scale.set(1, 0.9, isHe111 ? 1.85 : 1);
  nose.position.set(0, isHe111 ? 0.05 : 0.08, fuseLen * 0.5 + (isHe111 ? 0.6 : 1.1));
  grp.add(nose);

  if (!isHe111) {
    // Ju 88 dorsal canopy blister
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.55, 2.5), glassMat);
    canopy.position.set(0, 0.68, fuseLen * 0.25);
    grp.add(canopy);
  }

  // Main wings (wide twin-engine span ~22.6m for He 111, ~20m for Ju 88)
  const span = isHe111 ? 22.6 : 20.1;
  const wingChord = isHe111 ? 3.8 : 3.2;
  const wingGeo = new THREE.BoxGeometry(span, 0.26, wingChord);
  const wing = new THREE.Mesh(wingGeo, camoTopMat);
  wing.position.set(0, 0.1, 1.3);
  grp.add(wing);

  // Underwing lighter blue-gray Luftwaffe RLM 65 belly plate
  const underWing = new THREE.Mesh(new THREE.BoxGeometry(span * 0.96, 0.14, wingChord * 0.92), bellyMat);
  underWing.position.set(0, -0.08, 1.3);
  grp.add(underWing);

  // Tapered outer wingtips
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, wingChord * 0.65), camoTopMat);
    tip.position.set(side * (span * 0.5 + 1.0), 0.15, 0.85);
    tip.rotation.z = side * 0.06;
    grp.add(tip);
  }

  // Twin engine nacelles + spinning prop discs
  const nacGeo = new THREE.CylinderGeometry(0.55, 0.45, 3.8, 7);
  nacGeo.rotateX(Math.PI / 2);
  const propGeo = new THREE.CircleGeometry(1.55, 12);
  for (const side of [-1, 1]) {
    const nx = side * (isHe111 ? 3.4 : 3.0);
    const nac = new THREE.Mesh(nacGeo, camoTopMat);
    nac.position.set(nx, -0.08, 2.35);
    grp.add(nac);

    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 6), camoTopMat);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.set(nx, -0.08, 4.55);
    grp.add(spinner);

    const pDisc = new THREE.Mesh(propGeo, propMat);
    pDisc.position.set(nx, -0.08, 4.35);
    grp.add(pDisc);
    props.push(pDisc);
  }

  // Tailplane & vertical fin
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(isHe111 ? 7.6 : 6.6, 0.18, 1.85), camoTopMat);
  hStab.position.set(0, 0.28, -fuseLen * 0.45);
  grp.add(hStab);

  const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.22, isHe111 ? 2.55 : 2.3, 2.2), camoTopMat);
  vFin.position.set(0, 1.35, -fuseLen * 0.44);
  grp.add(vFin);

  // Luftwaffe Balkenkreuz decals (top wings, under wings so clearly visible from below, and fuselage sides)
  const wingCrossGeo = new THREE.PlaneGeometry(2.35, 2.35);
  for (const side of [-1, 1]) {
    const cx = side * (span * 0.34);
    const topDecal = new THREE.Mesh(wingCrossGeo, crossMat);
    topDecal.rotation.x = -Math.PI / 2;
    topDecal.position.set(cx, 0.25, 1.3);
    grp.add(topDecal);

    const botDecal = new THREE.Mesh(wingCrossGeo, crossMat);
    botDecal.rotation.x = Math.PI / 2;
    botDecal.position.set(cx, -0.17, 1.3);
    grp.add(botDecal);
  }
  const fuseCrossGeo = new THREE.PlaneGeometry(1.35, 1.35);
  for (const side of [-1, 1]) {
    const sideDecal = new THREE.Mesh(fuseCrossGeo, crossMat);
    sideDecal.rotation.y = side * (Math.PI / 2);
    sideDecal.position.set(side * (isHe111 ? 0.88 : 0.76), 0.08, -1.9);
    grp.add(sideDecal);
  }

  return { group: grp, props };
}

export function createLondonWorld(scene: THREE.Scene): LondonWorld {
  const root = new THREE.Group();
  scene.add(root);
  const rand = mulberry32(1940);
  const obstacles: ObstacleBox[] = [];

  // Keep roads cleanly drivable with modest historic Blitz craters off main spawn lane
  const craters: Array<{ x: number; z: number; r: number; d: number }> = [];
  for (let i = 0; i < 24; i++) {
    const cx = (rand() - 0.5) * 820;
    const cz = (rand() - 0.5) * 820;
    if (Math.hypot(cx, cz + 240) < 42) continue;
    craters.push({ x: cx, z: cz, r: 4.5 + rand() * 6.5, d: 0.45 + rand() * 0.75 });
  }

  function heightAt(x: number, z: number): number {
    let h = (fbm(x * 0.01 + 4, z * 0.01 + 11, 2) - 0.5) * 0.55;
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
    h += smooth(468, 545, Math.max(Math.abs(x), Math.abs(z))) * (14 + fbm(x * 0.03, z * 0.03, 2) * 10);
    return h;
  }

  function normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 1.5;
    out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e));
    return out.normalize();
  }

  const sunDir = new THREE.Vector3(0.42, 0.56, 0.44).normalize();
  const sun = new THREE.DirectionalLight(0xffead2, 1.85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -110;
  sc.right = 110;
  sc.top = 110;
  sc.bottom = -110;
  sc.near = 10;
  sc.far = 450;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  root.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0x9cbbe0, 0x3b3532, 0.95);
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
        // Calm daytime/evening London sky
        vec3 calmHoriz = vec3(0.76, 0.84, 0.92);
        vec3 calmMid   = vec3(0.42, 0.64, 0.88);
        vec3 calmTop   = vec3(0.18, 0.39, 0.72);
        vec3 calmCol   = mix(calmHoriz, calmMid, smoothstep(0.0, 0.28, h));
        calmCol        = mix(calmCol, calmTop, smoothstep(0.24, 0.9, h));

        // Ominous crimson Blitz fire-lit sky
        vec3 redHoriz = vec3(0.76, 0.21, 0.09);
        vec3 redMid   = vec3(0.46, 0.08, 0.06);
        vec3 redTop   = vec3(0.14, 0.03, 0.04);
        vec3 redCol   = mix(redHoriz, redMid, smoothstep(0.0, 0.34, h));
        redCol        = mix(redCol, redTop, smoothstep(0.28, 0.92, h));

        vec3 col = mix(calmCol, redCol, uCrimson);
        float s = max(dot(d, normalize(sunDir)), 1e-4);
        vec3 sunGlowCalm = vec3(1.0, 0.88, 0.65) * (pow(s, 7.0) * 0.25 + pow(s, 64.0) * 0.45);
        vec3 sunGlowRed  = vec3(1.0, 0.32, 0.12) * pow(s, 5.0) * 0.35;
        col += mix(sunGlowCalm, sunGlowRed, uCrimson);
        vec3 groundFade = mix(vec3(0.48, 0.52, 0.56), vec3(0.32, 0.09, 0.06), uCrimson);
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
  const _cRedSun = new THREE.Color(0xff8458);
  const _cCalmHemiSky = new THREE.Color(0xaecce8);
  const _cRedHemiSky = new THREE.Color(0xb8402c);
  const _cCalmCloud = new THREE.Color(0xe6ecf2);
  const _cRedCloud = new THREE.Color(0x3a1412);

  function setBlitzAtmosphere(crimson: number): void {
    const k = Math.min(1, Math.max(0, crimson));
    currentCrimson = k;
    skyUniforms.uCrimson.value = k;
    sun.color.copy(_cCalmSun).lerp(_cRedSun, k);
    sun.intensity = 2.2 - k * 0.25;
    hemi.color.copy(_cCalmHemiSky).lerp(_cRedHemiSky, k);
    hemi.intensity = 1.05 - k * 0.05;
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

  // Terrain mesh
  const SEG = 140;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  {
    const pos = tGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const asphalt = new THREE.Color(0x45474f);
    const pave = new THREE.Color(0x888175);
    const brickYard = new THREE.Color(0x6c5e53);
    const soot = new THREE.Color(0x2f2927);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const rd = roadDist(x, z);
      const n = fbm(x * 0.05, z * 0.05, 3);
      if (rd < ROAD_HALF) c.copy(asphalt);
      else if (rd < ROAD_HALF + 3.2) c.copy(pave);
      else c.copy(brickYard);
      c.lerp(soot, n * 0.45 + smooth(-0.2, -1.0, h) * 0.65);
      const j = 0.88 + hash2(i, 40) * 0.24;
      col[i * 3] = c.r * j;
      col[i * 3 + 1] = c.g * j;
      col[i * 3 + 2] = c.b * j;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = tGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 24, uv.getY(i) * 24);
    tGeo.computeVertexNormals();
  }
  const roadTex = londonAsphaltTexture();
  const terrain = new THREE.Mesh(
    tGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: roadTex,
      bumpMap: roadTex,
      bumpScale: 1.2,
      flatShading: true,
      roughness: 0.96,
      metalness: 0,
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
      sectorBoxes.push(new THREE.Box3(new THREE.Vector3(x0, -15, z0), new THREE.Vector3(x0 + SECTOR_SPAN, 70, z0 + SECTOR_SPAN)));
    }
  }

  // London Brick Buildings & Landmarks
  const wallMat = new THREE.MeshStandardMaterial({
    map: londonBrickTexture(),
    vertexColors: true,
    roughness: 0.95,
    flatShading: true,
  });
  const lowProxyMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  interface BuildingSectorChunk {
    high: THREE.Mesh;
    low: THREE.Mesh | null;
    box: THREE.Box3;
  }
  const buildingSectors: BuildingSectorChunk[] = [];
  const smokePts: Array<[number, number, number]> = [];
  const buildingFootprints: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];

  {
    const highBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const lowBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const sBoxes = Array.from({ length: SECTOR_COUNT }, () => new THREE.Box3());
    const tmpP = new THREE.Vector3();

    for (let bx = -4; bx <= 3; bx++) {
      for (let bz = -4; bz <= 3; bz++) {
        // Leave central avenue square around spawn extra open for clear opening camera
        if ((bx === -1 || bx === 0) && bz === -3 && rand() < 0.5) continue;
        if (rand() < 0.14) continue;
        const blockCx = bx * 100 + 50;
        const blockCz = bz * 100 + 50;
        const sec = sectorIndexFor(blockCx, blockCz, SIZE / 2, SECTOR_GRID);
        const hList = highBuckets[sec];
        const lList = lowBuckets[sec];
        const sBox = sBoxes[sec];

        // 1 to 2 ruined London rowhouse blocks per block
        const numStructures = rand() < 0.55 ? 2 : 1;
        for (let sIdx = 0; sIdx < numStructures; sIdx++) {
          const offX = numStructures === 2 ? (sIdx === 0 ? -17 : 17) : (rand() - 0.5) * 16;
          const offZ = (rand() - 0.5) * 20;
          const cx = blockCx + offX;
          const cz = blockCz + offZ;
          const w = 18 + rand() * 14;
          const d = 18 + rand() * 14;
          const base = Math.min(heightAt(cx - w / 2, cz - d / 2), heightAt(cx + w / 2, cz + d / 2)) - 0.6;
          const hgt = 11 + rand() * 15;
          const shade = 0.72 + rand() * 0.25;
          const t = 1.3;
          const intact = rand() < 0.45 ? 4 : 2 + Math.floor(rand() * 2);

          // Main exterior walls (uniform height when intact roofed building; varied ruined walls anchored to ground otherwise)
          const hasRoof = intact === 4 && rand() < 0.7;
          const h1 = hasRoof ? hgt : hgt * (0.65 + rand() * 0.35);
          const h2 = hasRoof ? hgt : hgt * (0.6 + rand() * 0.4);
          const h3 = hasRoof ? hgt : hgt * (0.58 + rand() * 0.4);
          const h4 = hasRoof ? hgt : hgt * (0.65 + rand() * 0.35);
          if (intact >= 1) hList.push(boxGeo(w, h1, t, cx, base + h1 * 0.5, cz - d / 2, shade));
          if (intact >= 2) hList.push(boxGeo(t, h2, d, cx - w / 2, base + h2 * 0.5, cz, shade * 0.94));
          if (intact >= 3) hList.push(boxGeo(w, h3, t, cx, base + h3 * 0.5, cz + d / 2, shade * 0.92));
          if (intact >= 4) hList.push(boxGeo(t, h4, d, cx + w / 2, base + h4 * 0.5, cz, shade * 0.96));

          // Slate pitched roof cap seated flush atop intact exterior walls
          if (hasRoof) {
            hList.push(boxGeo(w + 0.6, 1.6, d + 0.6, cx, base + hgt + 0.7, cz, shade * 0.52));
          }

          // Low LOD proxy
          lList.push(boxGeo(w, hgt * 0.85, d, cx, base + hgt * 0.425, cz, shade * 0.85));

          const minX = cx - w / 2 - t / 2;
          const maxX = cx + w / 2 + t / 2;
          const minZ = cz - d / 2 - t / 2;
          const maxZ = cz + d / 2 + t / 2;
          obstacles.push({
            min: new THREE.Vector3(minX, base, minZ),
            max: new THREE.Vector3(maxX, base + hgt, maxZ),
            kind: 'structure',
          });
          buildingFootprints.push({ minX: minX - 2.5, maxX: maxX + 2.5, minZ: minZ - 2.5, maxZ: maxZ + 2.5 });
          sBox.expandByPoint(tmpP.set(minX, base, minZ));
          sBox.expandByPoint(tmpP.set(maxX, base + hgt + 2, maxZ));

          if (rand() < 0.32) {
            smokePts.push([cx, cz, base + hgt * 0.45]);
          }
        }
      }
    }

    // Westminster / Big-Ben-inspired London clock tower landmark near (38, 52) so it stands along skyline!
    {
      const tx = 44;
      const tz = 62;
      const sec = sectorIndexFor(tx, tz, SIZE / 2, SECTOR_GRID);
      const base = heightAt(tx, tz) - 0.5;
      highBuckets[sec].push(boxGeo(11, 46, 11, tx, base + 23, tz, 0.92));
      highBuckets[sec].push(boxGeo(12.6, 5.5, 12.6, tx, base + 44, tz, 1.05));
      highBuckets[sec].push(boxGeo(7.5, 11, 7.5, tx, base + 52, tz, 0.62));
      highBuckets[sec].push(boxGeo(3.2, 9, 3.2, tx, base + 61, tz, 0.48));
      lowBuckets[sec].push(boxGeo(11.5, 58, 11.5, tx, base + 29, tz, 0.86));
      obstacles.push({
        min: new THREE.Vector3(tx - 6, base, tz - 6),
        max: new THREE.Vector3(tx + 6, base + 58, tz + 6),
        kind: 'structure',
      });
      buildingFootprints.push({ minX: tx - 8, maxX: tx + 8, minZ: tz - 8, maxZ: tz + 8 });
      sBoxes[sec].expandByPoint(tmpP.set(tx - 6.5, base, tz - 6.5));
      sBoxes[sec].expandByPoint(tmpP.set(tx + 6.5, base + 66, tz + 6.5));
      smokePts.unshift([tx + 18, tz - 22, base + 6]);
    }

    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      if (highBuckets[sec].length === 0) continue;
      const highGeo = mergeGeometries(highBuckets[sec]);
      const high = new THREE.Mesh(highGeo, wallMat);
      high.castShadow = true;
      high.receiveShadow = true;
      root.add(high);

      let low: THREE.Mesh | null = null;
      if (lowBuckets[sec].length > 0) {
        const lowGeo = mergeGeometries(lowBuckets[sec]);
        low = new THREE.Mesh(lowGeo, lowProxyMat);
        low.visible = false;
        root.add(low);
      }
      buildingSectors.push({ high, low, box: sBoxes[sec] });
    }
  }

  // Iconic Red British K6 Telephone Boxes along sidewalks
  const phoneBoxGeo = new THREE.BoxGeometry(1.15, 2.55, 1.15);
  phoneBoxGeo.translate(0, 1.275, 0);
  const phoneBoxMat = new THREE.MeshStandardMaterial({
    map: phoneBoxWindowTexture(),
    roughness: 0.45,
    metalness: 0.25,
  });
  const phoneDomeGeo = new THREE.CylinderGeometry(0.45, 0.62, 0.34, 8);
  phoneDomeGeo.translate(0, 2.7, 0);
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
        if (rand() < 0.45) continue;
        const x = ix * 100 + (rand() < 0.5 ? -10.8 : 10.8);
        const z = iz * 100 + (rand() < 0.5 ? -14 : 14);
        const y = heightAt(x, z);
        q.setFromAxisAngle(up, Math.floor(rand() * 4) * (Math.PI / 2));
        m.compose(p.set(x, y, z), q, s);
        const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
        buckets[sec].push({ m: m.clone(), x, y, z });
      }
    }
    // Guaranteed avenue phone boxes near opening player view
    for (const [px, pz, ang] of [
      [-10.6, -216, Math.PI * 0.5],
      [10.6, -196, -Math.PI * 0.5],
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

  // Anti-tank Czech Hedgehogs along road edges (leaving center streets passable)
  const hedgehogSectors: Array<{ mesh: THREE.InstancedMesh; box: THREE.Box3 }> = [];
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
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3b3d3e, roughness: 0.75, metalness: 0.65 });

    const buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < 64; i++) {
      const line = Math.floor((rand() - 0.5) * 7) * 100;
      const along = (rand() - 0.5) * 760;
      const horiz = rand() < 0.5;
      const side = (rand() < 0.5 ? -1 : 1) * (ROAD_HALF + 0.6);
      const x = horiz ? along : line + side;
      const z = horiz ? line + side : along;
      if (Math.hypot(x, z + 240) < 25) continue;
      const y = heightAt(x, z);
      q.setFromAxisAngle(up, rand() * 6.28);
      m.compose(p.set(x, y, z), q, s);
      const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x, y, z });
    }
    for (const [hx, hz] of [
      [-9.4, -206],
      [9.4, -214],
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

  // Stacked Sandbag Barricades along street defenses
  const sandbagSectors: Array<{ mesh: THREE.InstancedMesh; box: THREE.Box3 }> = [];
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
    const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x9c8660, roughness: 0.95, metalness: 0 });
    const buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < 58; i++) {
      const line = Math.floor((rand() - 0.5) * 7) * 100;
      const along = (rand() - 0.5) * 740;
      const horiz = rand() < 0.5;
      const side = (rand() < 0.5 ? -1 : 1) * (ROAD_HALF + 2.1);
      const x = horiz ? along : line + side;
      const z = horiz ? line + side : along;
      if (Math.hypot(x, z + 240) < 22) continue;
      const y = heightAt(x, z);
      q.setFromAxisAngle(up, horiz ? 0 : Math.PI / 2);
      m.compose(p.set(x, y, z), q, s);
      const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x, y, z });
    }
    for (const [sx, sz, ang] of [
      [-10.4, -210, Math.PI * 0.42],
      [10.4, -203, -Math.PI * 0.42],
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

  // Fallen Brick & Masonry Rubble Piles near bombed buildings and curbs
  const rubbleSectors: Array<{ mesh: THREE.InstancedMesh; box: THREE.Box3 }> = [];
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
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x6b473a, roughness: 0.96, flatShading: true });
    const buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < 60; i++) {
      const line = Math.floor((rand() - 0.5) * 7) * 100;
      const along = (rand() - 0.5) * 760;
      const horiz = rand() < 0.5;
      const side = (rand() < 0.5 ? -1 : 1) * (ROAD_HALF + 3.8 + rand() * 3);
      const x = horiz ? along : line + side;
      const z = horiz ? line + side : along;
      if (Math.hypot(x, z + 240) < 22) continue;
      const y = heightAt(x, z);
      const sc = 0.8 + rand() * 0.65;
      q.setFromAxisAngle(up, rand() * 6.28);
      m.compose(p.set(x, y, z), q, s.set(sc, sc * 0.85, sc));
      const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x, y, z });
    }
    for (const [rx, rz] of [
      [-13.5, -190],
      [13.5, -184],
    ] as const) {
      const ry = heightAt(rx, rz);
      q.setFromAxisAngle(up, rand() * 6.28);
      m.compose(p.set(rx, ry, rz), q, s.set(1.1, 0.95, 1.1));
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

  // Blitz smoke plumes + glowing embers
  const plumes: Array<{ sp: THREE.Sprite; x: number; z: number; h: number; phase: number; speed: number; drift: number }> = [];
  const fireSprites: Array<{ sp: THREE.Sprite; x: number; y: number; z: number; baseScale: number; phase: number }> = [];
  {
    const smokeTex = softSprite(34, 30, 30);
    const fireTex = softSprite(255, 118, 34);
    for (const [x, z, h] of smokePts.slice(0, 8)) {
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
          opacity: 0.75,
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
  const raidBombers: BomberActor[] = [];

  for (let i = 0; i < 6; i++) {
    const variant = i % 2 === 0 ? 'he111' : 'ju88';
    const built = createLuftwaffeBomberMesh(variant, crossMat, camoTopMat, bellyMat, glassMat, propMat);
    built.group.scale.setScalar(1.45);
    built.group.visible = false;
    root.add(built.group);
    const row = Math.floor((i + 1) / 2);
    const side = i === 0 ? 0 : i % 2 === 1 ? -1 : 1;
    cutsceneBombers.push({
      group: built.group,
      props: built.props,
      offsetX: -row * 22,
      offsetY: row * 5.2,
      offsetZ: side * row * 22 + (i % 2) * 3,
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitPhase: 0,
      altitude: 86 + row * 5,
    });
  }

  for (let i = 0; i < 6; i++) {
    const variant = i % 2 === 0 ? 'he111' : 'ju88';
    const built = createLuftwaffeBomberMesh(variant, crossMat, camoTopMat, bellyMat, glassMat, propMat);
    built.group.scale.setScalar(1.45);
    built.group.visible = false;
    root.add(built.group);
    raidBombers.push({
      group: built.group,
      props: built.props,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      orbitRadius: 95 + (i % 3) * 42,
      orbitSpeed: 0.16 + (i % 2) * 0.04,
      orbitPhase: (i / 6) * Math.PI * 2,
      altitude: 128 + (i % 3) * 18,
    });
  }

  function updateCutsceneBombers(progress: number, dt: number, active: boolean): void {
    const visible = active && progress > 0 && progress < 1.05;
    // Squadron sweeps diagonally across the sky directly in front of the player camera (spawn z=-240 looking +Z)
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
  function updateRaidBombers(focus: THREE.Vector3, simTime: number, dt: number, active: boolean, retreating: boolean): void {
    if (retreating) {
      retreatOffset += dt * 75;
    } else {
      retreatOffset = 0;
    }
    for (let i = 0; i < raidBombers.length; i++) {
      const b = raidBombers[i];
      b.group.visible = active;
      if (!active) continue;
      const ang = b.orbitPhase + simTime * b.orbitSpeed;
      const rad = b.orbitRadius + retreatOffset;
      const bx = focus.x + Math.cos(ang) * rad;
      const bz = focus.z + Math.sin(ang) * rad;
      const vx = -Math.sin(ang);
      const vz = Math.cos(ang);
      b.group.position.set(bx, b.altitude + retreatOffset * 0.35 + Math.sin(simTime * 0.8 + i) * 3, bz);
      b.group.rotation.set(retreating ? -0.14 : 0, Math.atan2(vx, vz), retreating ? 0.1 : -0.16);
      for (let p = 0; p < b.props.length; p++) {
        b.props[p].rotation.z += dt * 34;
      }
    }
  }

  // Pooled Bomb / Rocket + Yellow Ground Warning Circle Visuals (zero runtime allocations)
  const MAX_VISUAL_BOMBS = 10;
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

  function syncBombVisuals(strikes: ReadonlyArray<BombStrike>, simTime: number): void {
    const pulse = 0.8 + 0.2 * Math.sin(simTime * 11);
    for (let i = 0; i < MAX_VISUAL_BOMBS; i++) {
      const slot = visualSlots[i];
      if (i >= strikes.length) {
        slot.ringOuter.visible = false;
        slot.fillDisc.visible = false;
        slot.fuseRing.visible = false;
        slot.projGroup.visible = false;
        continue;
      }
      const s = strikes[i];
      const frac = Math.min(1, Math.max(0, 1 - s.fuseRemaining / Math.max(0.05, s.fuseTotal)));
      const yRing = s.groundY + 0.16;

      slot.ringOuter.visible = true;
      slot.ringOuter.position.set(s.x, yRing + 0.03, s.z);
      slot.ringOuter.scale.setScalar(s.radius);
      (slot.ringOuter.material as THREE.MeshBasicMaterial).opacity = 0.85 * pulse;

      slot.fillDisc.visible = true;
      slot.fillDisc.position.set(s.x, yRing, s.z);
      slot.fillDisc.scale.setScalar(s.radius);
      (slot.fillDisc.material as THREE.MeshBasicMaterial).opacity = 0.18 + frac * 0.16;

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
    ...clouds,
    ...plumes.map((p) => p.sp),
    ...fireSprites.map((f) => f.sp),
    ...cutsceneBombers.map((b) => b.group),
    ...raidBombers.map((b) => b.group),
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

      for (let i = 0; i < buildingSectors.length; i++) {
        const bs = buildingSectors[i];
        const inFrustum = vis.isBoxVisible(bs.box);
        const effDist = vis.boxEffectiveDistance(bs.box);
        const tier = resolveBuildingLod(inFrustum, effDist);
        if (tier === 'high') {
          bs.high.visible = true;
          bs.high.castShadow = effDist < 135;
          if (bs.low) bs.low.visible = false;
        } else if (tier === 'low') {
          bs.high.visible = false;
          if (bs.low) bs.low.visible = true;
        } else {
          bs.high.visible = false;
          if (bs.low) bs.low.visible = false;
        }
      }

      for (let i = 0; i < phoneSectors.length; i++) {
        const ps = phoneSectors[i];
        const show = vis.isBoxVisible(ps.box) && vis.boxEffectiveDistance(ps.box) <= 230;
        ps.body.visible = show;
        ps.dome.visible = show;
      }

      for (let i = 0; i < hedgehogSectors.length; i++) {
        const hs = hedgehogSectors[i];
        hs.mesh.visible = vis.isBoxVisible(hs.box) && vis.boxEffectiveDistance(hs.box) <= 190;
      }

      for (let i = 0; i < sandbagSectors.length; i++) {
        const ss = sandbagSectors[i];
        ss.mesh.visible = vis.isBoxVisible(ss.box) && vis.boxEffectiveDistance(ss.box) <= 210;
      }

      for (let i = 0; i < rubbleSectors.length; i++) {
        const rs = rubbleSectors[i];
        rs.mesh.visible = vis.isBoxVisible(rs.box) && vis.boxEffectiveDistance(rs.box) <= 230;
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
    fogNear: 115,
    fogFar: 920,
    background: 0x631b13,
    exposure: 1.08,
    grade: { sat: 1.04, tint: [1.06, 0.96, 0.92] },
    spawnPlayer: { x: 0, z: -240, heading: 0 },
    spawnA: () => ({ x: 0, z: -240, heading: 0 }),
    spawnB: () => ({ x: 0, z: 240, heading: Math.PI }),
    objectives: [
      { x: 0, z: -100 },
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: -100, z: 0 },
    ],
    objJitter: 8,
    setBlitzAtmosphere,
    updateCutsceneBombers,
    updateRaidBombers,
    syncBombVisuals,
    isSpotOpenForBomb,
  };
}
