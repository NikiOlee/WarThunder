import * as THREE from 'three';
import {
  computeFallTargetTilt,
  resetTreeStates,
  stepFallingTrees,
  triggerTreeKnockdown,
  type TreeInstanceState,
} from './envCollision';
import {
  resolveBuildingLod,
  resolveTreeLod,
  sectorIndexFor,
  type VisibilityController,
} from './visibility';

export const WORLD_SIZE = 1000;
export const WORLD_LIMIT = 480;
export const SPAWN = { x: 0, z: -420 };
export const SPAWN_B = { x: 0, z: 420 };

const SPAWN_H = 3;
const TOWN = { x: 210, z: 0 };
const SPAWN_X_OFFSETS = [0, -45, 45, -90, 90, -135];

export function hillsSpawnA(i: number): { x: number; z: number; heading: number } {
  const idx = ((i % SPAWN_X_OFFSETS.length) + SPAWN_X_OFFSETS.length) % SPAWN_X_OFFSETS.length;
  return { x: SPAWN_X_OFFSETS[idx], z: idx === 0 ? -420 : -432, heading: 0 };
}

export function hillsSpawnB(i: number): { x: number; z: number; heading: number } {
  const idx = ((i % SPAWN_X_OFFSETS.length) + SPAWN_X_OFFSETS.length) % SPAWN_X_OFFSETS.length;
  return { x: SPAWN_X_OFFSETS[idx], z: idx === 0 ? 420 : 432, heading: Math.PI };
}

export const HILLS_OBJECTIVES: Array<{ x: number; z: number }> = [
  { x: -160, z: 0 },
  { x: 0, z: 0 },
  { x: 210, z: 0 },
  { x: 0, z: -140 },
  { x: 0, z: 140 },
];

export interface ObstacleBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
  mesh?: THREE.Mesh;
  kind?: 'structure' | 'rock';
  rockX?: number;
  rockZ?: number;
  rockRadius?: number;
  _s?: number;
}

export interface WorldHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  kind: 'ground' | 'obstacle';
  obstacle: ObstacleBox | null;
  t: number;
  dist?: number;
}

export interface KnockedTreeEvent {
  x: number;
  y: number;
  z: number;
  sy: number;
}

export interface GameWorld {
  id: string;
  name: string;
  size: number;
  limit: number;
  heightAt: (x: number, z: number) => number;
  normalAt: (x: number, z: number, out?: THREE.Vector3) => THREE.Vector3;
  obstacles: ObstacleBox[];
  segmentHit: (a: THREE.Vector3, b: THREE.Vector3, step?: number) => WorldHit | null;
  raycast: (origin: THREE.Vector3, dir: THREE.Vector3, maxDist?: number) => WorldHit | null;
  nearby: (x: number, z: number, r: number) => ObstacleBox[];
  knockTreesAt?: (x: number, z: number, radius: number, vx: number, vz: number, speed: number) => KnockedTreeEvent[];
  resetTrees?: () => void;
  getTreeStates?: () => ReadonlyArray<TreeInstanceState>;
  update: (camPos: THREE.Vector3, focus: THREE.Vector3, dt?: number, vis?: VisibilityController) => void;
  sun: THREE.DirectionalLight;
  terrain: THREE.Mesh;
  createEnvironment: (renderer: THREE.WebGLRenderer) => void;
  dispose: () => void;
  setGrass: (density: number) => void;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  background: number;
  exposure: number;
  grade: { sat: number; tint: [number, number, number] };
  spawnPlayer: { x: number; z: number; heading: number };
  spawnA: (i: number) => { x: number; z: number; heading: number };
  spawnB: (i: number) => { x: number; z: number; heading: number };
  objectives: Array<{ x: number; z: number }>;
  objJitter: number;
}

export function hash2(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function vnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  const u = fade(fx);
  const v = fade(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number, oct: number): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rawReliefAt(x: number, z: number): number {
  let h = (fbm(x * 0.0032 + 11.3, z * 0.0032 + 7.7, 5) - 0.5) * 2 * 40;
  const r = 1 - Math.abs(fbm(x * 0.0055 + 3.1, z * 0.0055 + 19.4, 3) * 2 - 1);
  h += r * r * 24 - 7;
  h += (fbm(x * 0.045, z * 0.045, 2) - 0.5) * 2.5;
  return h;
}

export function heightAt(x: number, z: number): number {
  // Smooth mirror symmetry across z = 0 so both teams have identical terrain, cover, and sightlines
  let h = 0.5 * (rawReliefAt(x, z) + rawReliefAt(x, -z));
  h += smooth(380, 500, Math.max(Math.abs(x), Math.abs(z))) * 70;

  const spawnDist = Math.min(Math.hypot(x - SPAWN.x, z - SPAWN.z), Math.hypot(x - SPAWN_B.x, z - SPAWN_B.z));
  const mSpawn = smooth(95, 155, spawnDist);
  h = SPAWN_H + (h - SPAWN_H) * mSpawn;

  const mTown = smooth(76, 142, Math.hypot(x - TOWN.x, z - TOWN.z));
  h = 6 + (h - 6) * mTown;

  return h;
}

export function normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = 1.5;
  out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e));
  return out.normalize();
}

const AXES = ['x', 'y', 'z'] as const;
function rayBox(o: THREE.Vector3, d: THREE.Vector3, len: number, box: ObstacleBox, outNormal: THREE.Vector3): number | null {
  let tmin = 0;
  let tmax = len;
  let nAxis: 'x' | 'y' | 'z' | null = null;
  let nSign = 0;
  for (let i = 0; i < 3; i++) {
    const k = AXES[i];
    const oo = o[k];
    const dd = d[k];
    if (Math.abs(dd) < 1e-9) {
      if (oo < box.min[k] || oo > box.max[k]) return null;
      continue;
    }
    let t1 = (box.min[k] - oo) / dd;
    let t2 = (box.max[k] - oo) / dd;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nAxis = k;
      nSign = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  outNormal.set(0, nAxis ? 0 : 1, 0);
  if (nAxis) outNormal[nAxis] = nSign;
  return tmin;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function grainTexture(): THREE.CanvasTexture {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = 150 + Math.floor(Math.random() * 105);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function boardTexture(label: string): THREE.CanvasTexture {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f0e6';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#c4261d';
  for (let i = 0; i < 8; i++) if (i % 2 === 0) g.fillRect(i * 32, 0, 32, 18);
  for (let i = 0; i < 8; i++) if (i % 2 === 1) g.fillRect(i * 32, 110, 32, 18);
  g.fillStyle = '#1a1a1a';
  g.font = 'bold 54px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface TreeSectorRouting {
  sectorOfTree: Uint8Array;
  localIdxOfTree: Uint16Array;
  sectorMeshes: THREE.InstancedMesh[][];
}

export function createTreeAnimator(
  trees: TreeInstanceState[],
  meshes: THREE.InstancedMesh[],
  hFn: (x: number, z: number) => number,
  sectorRouting?: TreeSectorRouting,
) {
  const CELL = 24;
  const grid = new Map<number, number[]>();
  const key = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);
  for (let i = 0; i < trees.length; i++) {
    const tr = trees[i];
    const k = key(Math.floor(tr.x / CELL), Math.floor(tr.z / CELL));
    let bucket = grid.get(k);
    if (!bucket) grid.set(k, (bucket = []));
    bucket.push(i);
  }

  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _qYaw = new THREE.Quaternion();
  const _qFall = new THREE.Quaternion();
  const _q = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);
  const _axis = new THREE.Vector3();
  const _changed: number[] = [];

  function writeMatrix(idx: number): void {
    const tr = trees[idx];
    _p.set(tr.x, tr.y, tr.z);
    _s.set(tr.sx, tr.sy, tr.sz);
    _qYaw.setFromAxisAngle(_up, tr.baseYaw);
    if (tr.tiltAngle > 1e-4) {
      _axis.set(tr.fallDirZ, 0, -tr.fallDirX).normalize();
      _qFall.setFromAxisAngle(_axis, tr.tiltAngle);
      _q.multiplyQuaternions(_qFall, _qYaw);
    } else {
      _q.copy(_qYaw);
    }
    _m.compose(_p, _q, _s);
    if (sectorRouting) {
      const s = sectorRouting.sectorOfTree[idx];
      const localIdx = sectorRouting.localIdxOfTree[idx];
      const targets = sectorRouting.sectorMeshes[s];
      for (let j = 0; j < targets.length; j++) {
        targets[j].setMatrixAt(localIdx, _m);
        targets[j].instanceMatrix.needsUpdate = true;
      }
    } else {
      for (let j = 0; j < meshes.length; j++) {
        meshes[j].setMatrixAt(idx, _m);
      }
    }
  }

  function knockTreesAt(
    x: number,
    z: number,
    radius: number,
    vx: number,
    vz: number,
    speed: number,
  ): KnockedTreeEvent[] {
    const knocked: KnockedTreeEvent[] = [];
    if (Math.abs(speed) < 0.2 && Math.hypot(vx, vz) < 0.2) return knocked;
    const rScan = radius + 2.0;
    const cx0 = Math.floor((x - rScan) / CELL);
    const cx1 = Math.floor((x + rScan) / CELL);
    const cz0 = Math.floor((z - rScan) / CELL);
    const cz1 = Math.floor((z + rScan) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = grid.get(key(cx, cz));
        if (!bucket) continue;
        for (let b = 0; b < bucket.length; b++) {
          const idx = bucket[b];
          const tr = trees[idx];
          if (tr.state !== 'standing') continue;
          const reach = radius + tr.trunkRadius;
          const dx = tr.x - x;
          const dz = tr.z - z;
          if (dx * dx + dz * dz > reach * reach) continue;
          if (triggerTreeKnockdown(tr, x, z, vx, vz)) {
            const aheadY = hFn(tr.x + tr.fallDirX * 5.0, tr.z + tr.fallDirZ * 5.0);
            tr.targetTilt = computeFallTargetTilt(tr.y, aheadY, 5.0);
            knocked.push({ x: tr.x, y: tr.y, z: tr.z, sy: tr.sy });
          }
        }
      }
    }
    return knocked;
  }

  function step(dt: number): void {
    stepFallingTrees(trees, dt, _changed);
    if (_changed.length === 0) return;
    for (let i = 0; i < _changed.length; i++) {
      writeMatrix(_changed[i]);
    }
    if (!sectorRouting) {
      for (let j = 0; j < meshes.length; j++) {
        meshes[j].instanceMatrix.needsUpdate = true;
      }
    }
  }

  function reset(): void {
    resetTreeStates(trees);
    for (let i = 0; i < trees.length; i++) {
      writeMatrix(i);
    }
    if (!sectorRouting) {
      for (let j = 0; j < meshes.length; j++) {
        meshes[j].instanceMatrix.needsUpdate = true;
      }
    }
  }

  return { knockTreesAt, step, reset, trees };
}

export function makeQueries(
  obstacles: ObstacleBox[],
  hFn: (x: number, z: number) => number,
  nFn: (x: number, z: number, out?: THREE.Vector3) => THREE.Vector3,
) {
  const _dir = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _ra = new THREE.Vector3();
  const _rb = new THREE.Vector3();
  const _tmpN = new THREE.Vector3();
  const _bestN = new THREE.Vector3();
  const CELL = 24;
  const grid = new Map<number, ObstacleBox[]>();
  const out: ObstacleBox[] = [];
  let builtCount = -1;
  let stamp = 0;
  const key = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);

  function build() {
    grid.clear();
    for (const o of obstacles) {
      o._s = 0;
      const x0 = Math.floor(o.min.x / CELL);
      const x1 = Math.floor(o.max.x / CELL);
      const z0 = Math.floor(o.min.z / CELL);
      const z1 = Math.floor(o.max.z / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const k = key(cx, cz);
          let a = grid.get(k);
          if (!a) grid.set(k, (a = []));
          a.push(o);
        }
      }
    }
    builtCount = obstacles.length;
  }

  function near(x0: number, z0: number, x1: number, z1: number): ObstacleBox[] {
    if (builtCount !== obstacles.length) build();
    stamp++;
    out.length = 0;
    const cx0 = Math.floor(x0 / CELL);
    const cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL);
    const cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const a = grid.get(key(cx, cz));
        if (!a) continue;
        for (const o of a) {
          if (o._s !== stamp) {
            o._s = stamp;
            out.push(o);
          }
        }
      }
    }
    return out;
  }

  function segmentTerrain(a: THREE.Vector3, dir: THREE.Vector3, len: number, step: number): number | null {
    if (a.y > 140 && a.y + dir.y * len > 140) return null;
    if (a.y <= hFn(a.x, a.z)) return 0;
    let prevT = 0;
    for (let t = step; ; t += step) {
      const tt = Math.min(t, len);
      const x = a.x + dir.x * tt;
      const y = a.y + dir.y * tt;
      const z = a.z + dir.z * tt;
      if (y <= hFn(x, z)) {
        let lo = prevT;
        let hi = tt;
        for (let i = 0; i < 9; i++) {
          const mid = (lo + hi) * 0.5;
          if (a.y + dir.y * mid <= hFn(a.x + dir.x * mid, a.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prevT = tt;
      if (tt >= len) return null;
    }
  }

  function segmentHit(a: THREE.Vector3, b: THREE.Vector3, step = 1.2): WorldHit | null {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-7) return null;
    _dir.multiplyScalar(1 / len);
    let bestT = Infinity;
    let bestKind: 'ground' | 'obstacle' = 'ground';
    let bestObstacle: ObstacleBox | null = null;
    let hasBest = false;
    const cand = near(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z));
    for (const o of cand) {
      const rt = rayBox(a, _dir, len, o, _tmpN);
      if (rt !== null && (!hasBest || rt < bestT)) {
        bestT = rt;
        _bestN.copy(_tmpN);
        bestKind = 'obstacle';
        bestObstacle = o;
        hasBest = true;
      }
    }
    const tt = segmentTerrain(a, _dir, hasBest ? bestT : len, step);
    if (tt !== null) {
      _p.copy(a).addScaledVector(_dir, tt);
      bestT = tt;
      nFn(_p.x, _p.z, _bestN);
      bestKind = 'ground';
      bestObstacle = null;
      hasBest = true;
    }
    if (!hasBest) return null;
    return {
      t: bestT,
      normal: _bestN.clone(),
      kind: bestKind,
      obstacle: bestObstacle,
      point: new THREE.Vector3().copy(a).addScaledVector(_dir, bestT),
    };
  }

  function raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 2500): WorldHit | null {
    for (let t0 = 0; t0 < maxDist; t0 += 64) {
      _ra.copy(origin).addScaledVector(dir, t0);
      _rb.copy(origin).addScaledVector(dir, Math.min(t0 + 64, maxDist));
      const h = segmentHit(_ra, _rb, t0 < 300 ? 2 : 5);
      if (h) {
        h.dist = t0 + h.t;
        return h;
      }
    }
    return null;
  }

  return { segmentHit, raycast, nearby: (x: number, z: number, r: number) => near(x - r, z - r, x + r, z + r) };
}

export function createWorld(scene: THREE.Scene): GameWorld {
  const root = new THREE.Group();
  scene.add(root);
  const obstacles: ObstacleBox[] = [];
  const rand = mulberry32(1337);

  const sunDir = new THREE.Vector3(0.66, 0.68, 0.08).normalize();
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
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
  root.add(new THREE.HemisphereLight(0xb7d3f0, 0x55603a, 0.85));

  const skyUniforms = { sunDir: { value: sunDir } };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir;
      void main(){
        vec3 d = normalize(vP); float h = max(d.y, 0.0);
        vec3 horizon = vec3(0.80, 0.86, 0.91), mid = vec3(0.42, 0.62, 0.86), top = vec3(0.16, 0.38, 0.74);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
        col = mix(col, top, smoothstep(0.2, 0.9, h));
        float s = max(dot(d, normalize(sunDir)), 1e-4);
        col += vec3(1.0, 0.82, 0.55) * (pow(s, 6.0) * 0.28 + pow(s, 64.0) * 0.5);
        col += vec3(1.0, 0.95, 0.8) * pow(s, 1800.0) * 14.0;
        col = mix(col, vec3(0.62, 0.66, 0.6), smoothstep(0.0, -0.15, d.y) * 0.9);
        col = clamp(col, vec3(0.0), vec3(6.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Group();
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), skyMat));

  // Hidden sky easter-egg photo on "Холмы" at high zenith, visible only when raising the camera
  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    const cw = 512;
    const ch = 680;
    const emblemCanvas = makeCanvas(cw, ch);
    const emblemTex = new THREE.CanvasTexture(emblemCanvas);
    emblemTex.colorSpace = THREE.SRGBColorSpace;
    const emblemMat = new THREE.MeshBasicMaterial({
      map: emblemTex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const emblemMesh = new THREE.Mesh(new THREE.PlaneGeometry(320, 425), emblemMat);
    const skyPos = new THREE.Vector3(0.14, 0.78, 0.61).normalize().multiplyScalar(1950);
    emblemMesh.position.copy(skyPos);
    emblemMesh.lookAt(0, 0, 0);
    emblemMesh.visible = false;
    sky.add(emblemMesh);

    const baseUrl =
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = emblemCanvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cw, ch);
      ctx.save();
      const targetAspect = cw / ch;
      const srcAspect = img.width / Math.max(1, img.height);
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;
      if (srcAspect > targetAspect) {
        sw = img.height * targetAspect;
        sx = (img.width - sw) * 0.5;
      } else {
        sh = img.width / targetAspect;
        sy = (img.height - sh) * 0.5;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.translate(cw * 0.5, ch * 0.5);
      ctx.scale(1, ch / cw);
      const grad = ctx.createRadialGradient(0, 0, cw * 0.3, 0, 0, cw * 0.49);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-cw * 0.5, -cw * 0.5, cw, cw);
      ctx.restore();
      emblemTex.needsUpdate = true;
      emblemMesh.visible = true;
    };
    img.src = `${baseUrl.replace(/\/$/, '')}/assets/aistudio/____________viber_2026-11-15_14-29-37-531_e2036c18.jpg`;
  }

  root.add(sky);

  function createEnvironment(renderer: THREE.WebGLRenderer) {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.02).texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  const clouds: THREE.Group[] = [];
  {
    const c = makeCanvas(128, 128);
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.5, 'rgba(240,244,250,0.5)');
    gr.addColorStop(1, 'rgba(235,240,248,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.8 });
    for (let i = 0; i < 26; i++) {
      const grp = new THREE.Group();
      const n = 6 + Math.floor(rand() * 6);
      for (let k = 0; k < n; k++) {
        const sp = new THREE.Sprite(mat);
        const sz = 140 + rand() * 170;
        sp.scale.set(sz * 1.5, sz * 0.7, 1);
        sp.position.set((k - n / 2) * 90 + rand() * 40, rand() * 30, rand() * 80);
        grp.add(sp);
      }
      grp.position.set((rand() - 0.5) * 3200, 420 + rand() * 220, (rand() - 0.5) * 3200);
      root.add(grp);
      clouds.push(grp);
    }
  }

  const SEG = 200;
  const tGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  {
    const pos = tGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const grassLow = new THREE.Color(0x45652a);
    const grassHigh = new THREE.Color(0x788a3a);
    const dry = new THREE.Color(0x9b8c4e);
    const rock = new THREE.Color(0x77736a);
    const dirt = new THREE.Color(0x7c6849);
    const c = new THREE.Color();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      normalAt(x, z, n);
      const slope = 1 - n.y;
      c.copy(grassLow).lerp(grassHigh, smooth(0, 30, h));
      const dryMix = 0.5 * (fbm(x * 0.02 + 40, z * 0.02 + 9, 3) + fbm(x * 0.02 + 40, -z * 0.02 + 9, 3));
      c.lerp(dry, dryMix * 0.7);
      c.lerp(rock, Math.max(smooth(0.16, 0.38, slope), smooth(48, 75, h)));
      const dT = Math.hypot(x - TOWN.x, z - TOWN.z);
      const dS = Math.min(Math.hypot(x - SPAWN.x, z - SPAWN.z), Math.hypot(x - SPAWN_B.x, z - SPAWN_B.z));
      c.lerp(dirt, Math.max(0, 1 - dT / 70) * 0.75 + Math.max(0, 1 - dS / 55) * 0.55);
      const j = 0.9 + hash2(i, 77) * 0.2;
      col[i * 3] = c.r * j;
      col[i * 3 + 1] = c.g * j;
      col[i * 3 + 2] = c.b * j;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = tGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 140, uv.getY(i) * 140);
    tGeo.computeVertexNormals();
  }
  const grain = grainTexture();
  const terrain = new THREE.Mesh(
    tGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: grain,
      bumpMap: grain,
      bumpScale: 2.2,
      flatShading: true,
      roughness: 1,
      metalness: 0,
    }),
  );
  terrain.receiveShadow = true;
  root.add(terrain);

  function addBox(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    material: THREE.Material | THREE.Material[],
    shadows = true,
  ): ObstacleBox {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ), material);
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    root.add(mesh);
    const o: ObstacleBox = { min: new THREE.Vector3(minX, minY, minZ), max: new THREE.Vector3(maxX, maxY, maxZ), mesh };
    obstacles.push(o);
    return o;
  }

  interface HouseLodItem {
    wall: THREE.Mesh;
    roof: THREE.Mesh;
    lowProxy: THREE.Mesh;
    box: THREE.Box3;
  }
  const houseItems: HouseLodItem[] = [];
  const lowProxyGeo = new THREE.BoxGeometry(1, 1, 1);

  const wallColors = [0xcdbd96, 0xb8b4a6, 0xd9d2bd, 0xa89a7c, 0xc2a88a];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a3b2a, roughness: 0.9, flatShading: true });
  const roofGeo = new THREE.ConeGeometry(1, 1, 4);
  roofGeo.rotateY(Math.PI / 4);
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = 1; gz <= 3; gz++) {
      if (gx === 0 || rand() < 0.28) continue;
      const cx = TOWN.x + gx * 30 + (rand() - 0.5) * 6;
      const dz = gz * 30 + (rand() - 0.5) * 6;
      const w = 10 + rand() * 8;
      const d = 10 + rand() * 6;
      const hgt = 6 + rand() * 5;
      const wallColHex = wallColors[Math.floor(rand() * wallColors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color: wallColHex,
        roughness: 0.95,
        flatShading: true,
      });
      const lowColor = new THREE.Color(wallColHex).lerp(new THREE.Color(0x8a3b2a), 0.22);
      const lowMat = new THREE.MeshLambertMaterial({ color: lowColor });

      for (const zSign of [1, -1]) {
        const cz = TOWN.z + zSign * dz;
        let lo = 1e9;
        let hi = -1e9;
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
          [0, 0],
        ]) {
          const hh = heightAt(cx + (sx * w) / 2, cz + (sz * d) / 2);
          lo = Math.min(lo, hh);
          hi = Math.max(hi, hh);
        }
        const top = hi + hgt;
        const wallBox = addBox(cx - w / 2, lo - 1.5, cz - d / 2, cx + w / 2, top, cz + d / 2, mat);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.scale.set(w * 0.78, 3.2, d * 0.78);
        roof.position.set(cx, top + 1.6, cz);
        roof.castShadow = true;
        root.add(roof);

        const lowProxy = new THREE.Mesh(lowProxyGeo, lowMat);
        const totalH = top + 2.4 - (lo - 1.5);
        lowProxy.scale.set(w, totalH, d);
        lowProxy.position.set(cx, (lo - 1.5 + top + 2.4) * 0.5, cz);
        lowProxy.visible = false;
        root.add(lowProxy);
        if (wallBox.mesh) {
          houseItems.push({
            wall: wallBox.mesh,
            roof,
            lowProxy,
            box: new THREE.Box3(
              new THREE.Vector3(cx - w / 2, lo - 1.5, cz - d / 2),
              new THREE.Vector3(cx + w / 2, top + 3.2, cz + d / 2),
            ),
          });
        }
      }
    }
  }

  const barrierItems: Array<{ mesh: THREE.Mesh; box: THREE.Box3 }> = [];
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8d8c86, roughness: 1, flatShading: true });
  let placed = 0;
  let tries = 0;
  while (placed < 8 && tries++ < 400) {
    const x = (rand() - 0.5) * 520;
    const zPos = 45 + rand() * 285;
    if (Math.hypot(x - SPAWN_B.x, zPos - SPAWN_B.z) < 110 || Math.abs(x) < 16) continue;
    if (Math.hypot(x - TOWN.x, zPos - TOWN.z) < 105) continue;
    const long = rand() < 0.5;
    const w = long ? 8 : 3;
    const d = long ? 3 : 8;
    const hgt = 2.6;
    for (const zSign of [-1, 1]) {
      const z = zSign * zPos;
      const hh = Math.max(
        heightAt(x - w / 2, z - d / 2),
        heightAt(x + w / 2, z + d / 2),
        heightAt(x - w / 2, z + d / 2),
        heightAt(x + w / 2, z - d / 2),
      );
      const b = addBox(x - w / 2, hh - 2, z - d / 2, x + w / 2, hh + hgt, z + d / 2, concrete);
      if (b.mesh) {
        barrierItems.push({
          mesh: b.mesh,
          box: new THREE.Box3(b.min.clone(), b.max.clone()),
        });
      }
    }
    placed++;
  }

  const rangeBoardItems: Array<{ board: THREE.Mesh; posts: THREE.Mesh[]; box: THREE.Box3 }> = [];
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 5, 6);
  for (const dist of [150, 300]) {
    const faceMat = new THREE.MeshStandardMaterial({ map: boardTexture(dist + ' m'), roughness: 0.9 });
    const plain = new THREE.MeshStandardMaterial({ color: 0xdedbcd, roughness: 0.9 });
    const mats = [plain, plain, plain, plain, faceMat, faceMat];
    for (const zSign of [-1, 1]) {
      const z = zSign * (420 - dist);
      const x = 0;
      const hh = Math.max(heightAt(x - 3, z), heightAt(x + 3, z)) + 0.2;
      const o = addBox(x - 3, hh + 1.2, z - 0.2, x + 3, hh + 4.4, z + 0.2, mats);
      const posts: THREE.Mesh[] = [];
      for (const px of [-2.2, 2.2]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(px, hh + 0.8, z);
        post.castShadow = true;
        root.add(post);
        posts.push(post);
      }
      if (o.mesh) {
        o.mesh.userData.range = dist;
        rangeBoardItems.push({
          board: o.mesh,
          posts,
          box: new THREE.Box3(new THREE.Vector3(x - 3.2, hh - 2, z - 0.8), new THREE.Vector3(x + 3.2, hh + 4.6, z + 0.8)),
        });
      }
    }
  }

  const SECTOR_GRID = 4;
  const SECTOR_COUNT = SECTOR_GRID * SECTOR_GRID;
  const SECTOR_SPAN = WORLD_SIZE / SECTOR_GRID;
  const sectorBoxes: THREE.Box3[] = [];
  for (let gz = 0; gz < SECTOR_GRID; gz++) {
    for (let gx = 0; gx < SECTOR_GRID; gx++) {
      const x0 = -WORLD_SIZE / 2 + gx * SECTOR_SPAN;
      const z0 = -WORLD_SIZE / 2 + gz * SECTOR_SPAN;
      sectorBoxes.push(new THREE.Box3(new THREE.Vector3(x0, -25, z0), new THREE.Vector3(x0 + SECTOR_SPAN, 95, z0 + SECTOR_SPAN)));
    }
  }

  interface TreeSectorChunk {
    crowns: THREE.InstancedMesh;
    trunks: THREE.InstancedMesh;
    lowCrowns: THREE.InstancedMesh;
    box: THREE.Box3;
    count: number;
  }
  const treeStates: TreeInstanceState[] = [];
  const treeSectors: TreeSectorChunk[] = [];
  let treeAnimator: ReturnType<typeof createTreeAnimator> | null = null;
  {
    const crownGeo = new THREE.ConeGeometry(2.1, 7.5, 7);
    crownGeo.translate(0, 5.2, 0);
    const lowCrownGeo = new THREE.ConeGeometry(2.1, 7.5, 4);
    lowCrownGeo.translate(0, 5.2, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.2, 5);
    trunkGeo.translate(0, 1.1, 0);
    const crownMat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    const lowCrownMat = new THREE.MeshLambertMaterial({ flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4f3a26, roughness: 1 });

    const PAIRS = 260;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const n = new THREE.Vector3();

    const treeData: Array<{ matrix: THREE.Matrix4; color: THREE.Color; sector: number }> = [];
    let pairs = 0;
    let count = 0;
    let att = 0;
    while (pairs < PAIRS && att++ < 6000) {
      const x = (rand() - 0.5) * 900;
      const zPos = 10 + rand() * 440;
      if (Math.abs(x) < 22) continue;
      if (Math.hypot(x - SPAWN_B.x, zPos - SPAWN_B.z) < 75 || Math.hypot(x - TOWN.x, zPos - TOWN.z) < 105) continue;
      const h = heightAt(x, zPos);
      if (h > 42) continue;
      normalAt(x, zPos, n);
      if (n.y < 0.9) continue;
      const grove = 0.5 * (fbm(x * 0.012 + 5, zPos * 0.012 + 2, 3) + fbm(x * 0.012 + 5, -zPos * 0.012 + 2, 3));
      if (grove < 0.42) continue;
      const sc2 = 0.8 + rand() * 0.9;
      const sy = sc2 * (0.9 + rand() * 0.4);
      const yaw = rand() * 6.28;
      const ty = h - 0.2;
      col.setHSL(0.27 + rand() * 0.05, 0.45, 0.2 + rand() * 0.08);
      for (const zSign of [1, -1]) {
        const z = zSign * zPos;
        const mYaw = zSign === 1 ? yaw : Math.PI - yaw;
        q.setFromAxisAngle(up, mYaw);
        m.compose(p.set(x, ty, z), q, s.set(sc2, sy, sc2));
        const sector = sectorIndexFor(x, z, WORLD_SIZE / 2, SECTOR_GRID);
        treeData.push({ matrix: m.clone(), color: col.clone(), sector });
        treeStates.push({
          index: count,
          x,
          y: ty,
          z,
          baseYaw: mYaw,
          sx: sc2,
          sy,
          sz: sc2,
          trunkRadius: 0.55 * sc2,
          state: 'standing',
          fallProgress: 0,
          fallDirX: 0,
          fallDirZ: 1,
          tiltAngle: 0,
          targetTilt: 1.46,
        });
        count++;
      }
      pairs++;
    }

    const sectorBuckets: number[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    for (let i = 0; i < count; i++) sectorBuckets[treeData[i].sector].push(i);
    const sectorOfTree = new Uint8Array(count);
    const localIdxOfTree = new Uint16Array(count);
    const sectorMeshes: THREE.InstancedMesh[][] = [];

    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const bucket = sectorBuckets[sec];
      const scCount = bucket.length;
      const box = new THREE.Box3();
      const crowns = new THREE.InstancedMesh(crownGeo, crownMat, Math.max(1, scCount));
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, scCount));
      const lowCrowns = new THREE.InstancedMesh(lowCrownGeo, lowCrownMat, Math.max(1, scCount));
      crowns.castShadow = trunks.castShadow = true;
      crowns.count = trunks.count = lowCrowns.count = scCount;
      lowCrowns.visible = false;

      if (scCount > 0) {
        for (let li = 0; li < scCount; li++) {
          const gi = bucket[li];
          const tr = treeStates[gi];
          const td = treeData[gi];
          sectorOfTree[gi] = sec;
          localIdxOfTree[gi] = li;
          crowns.setMatrixAt(li, td.matrix);
          trunks.setMatrixAt(li, td.matrix);
          lowCrowns.setMatrixAt(li, td.matrix);
          crowns.setColorAt(li, td.color);
          lowCrowns.setColorAt(li, td.color);
          box.expandByPoint(p.set(tr.x - 5.5, tr.y - 1, tr.z - 5.5));
          box.expandByPoint(p.set(tr.x + 5.5, tr.y + 10.5 * tr.sy, tr.z + 5.5));
        }
        crowns.computeBoundingSphere();
        trunks.computeBoundingSphere();
        lowCrowns.computeBoundingSphere();
        root.add(crowns, trunks, lowCrowns);
      } else {
        crowns.visible = trunks.visible = lowCrowns.visible = false;
      }
      sectorMeshes.push([crowns, trunks, lowCrowns]);
      treeSectors.push({ crowns, trunks, lowCrowns, box, count: scCount });
    }
    treeAnimator = createTreeAnimator(treeStates, [], heightAt, {
      sectorOfTree,
      localIdxOfTree,
      sectorMeshes,
    });
  }

  const timeU = { value: 0 };
  interface GrassSectorChunk {
    mesh: THREE.InstancedMesh;
    baseCount: number;
    box: THREE.Box3;
  }
  const grassSectors: GrassSectorChunk[] = [];
  let grassDensity = 1;
  interface RockSectorChunk {
    mesh: THREE.InstancedMesh;
    box: THREE.Box3;
    count: number;
  }
  const rockSectors: RockSectorChunk[] = [];
  {
    const blade = new THREE.BufferGeometry();
    const P: number[] = [];
    const C: number[] = [];
    const quad = (ang: number) => {
      const cx = Math.cos(ang) * 0.32;
      const cz = Math.sin(ang) * 0.32;
      const v = [
        [-cx, 0, -cz],
        [cx, 0, cz],
        [cx * 0.25, 1, cz * 0.25],
        [-cx * 0.25, 1, -cz * 0.25],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        P.push(...v[i]);
        const k = v[i][1];
        C.push(0.5 + 0.5 * k, 0.65 + 0.35 * k, 0.45 + 0.1 * k);
      }
    };
    quad(0);
    quad(Math.PI / 3);
    quad(-Math.PI / 3);
    blade.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    blade.computeVertexNormals();
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0, envMapIntensity: 0 });
    gm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.);
          transformed.x += sin(uTime*1.7 + ip.x*0.35 + ip.z*0.21) * 0.22 * position.y;
          transformed.z += cos(uTime*1.3 + ip.z*0.31) * 0.14 * position.y;`,
        );
    };
    const GRASS_PAIRS = 13000;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc3 = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const n = new THREE.Vector3();

    const grassBuckets: Array<Array<{ m: THREE.Matrix4; c: THREE.Color; x: number; y: number; z: number }>> = Array.from(
      { length: SECTOR_COUNT },
      () => [],
    );
    let grassPairs = 0;
    let att = 0;
    while (grassPairs < GRASS_PAIRS && att++ < 90000) {
      const x = (rand() - 0.5) * 920;
      const zPos = 1 + rand() * 459;
      if (Math.hypot(x - SPAWN_B.x, zPos - SPAWN_B.z) < 42) continue;
      const h = heightAt(x, zPos);
      if (h > 40) continue;
      normalAt(x, zPos, n);
      if (n.y < 0.86) continue;
      const hs = 0.7 + rand() * 0.9;
      const yaw = rand() * 6.28;
      col.setHSL(0.22 + rand() * 0.07, 0.5, 0.42 + rand() * 0.18);
      for (const zSign of [1, -1]) {
        const z = zSign * zPos;
        q.setFromAxisAngle(up, zSign === 1 ? yaw : Math.PI - yaw);
        m.compose(p.set(x, h - 0.05, z), q, sc3.set(hs * 1.3, hs, hs * 1.3));
        const sec = sectorIndexFor(x, z, WORLD_SIZE / 2, SECTOR_GRID);
        grassBuckets[sec].push({ m: m.clone(), c: col.clone(), x, y: h, z });
      }
      grassPairs++;
    }
    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = grassBuckets[sec];
      if (b.length === 0) continue;
      const mesh = new THREE.InstancedMesh(blade, gm, b.length);
      const box = new THREE.Box3();
      for (let i = 0; i < b.length; i++) {
        mesh.setMatrixAt(i, b[i].m);
        mesh.setColorAt(i, b[i].c);
        box.expandByPoint(p.set(b[i].x, b[i].y - 0.2, b[i].z));
        box.expandByPoint(p.set(b[i].x, b[i].y + 1.8, b[i].z));
      }
      mesh.count = b.length;
      mesh.computeBoundingSphere();
      root.add(mesh);
      grassSectors.push({ mesh, baseCount: b.length, box });
    }

    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 1, flatShading: true });
    const ROCK_PAIRS = 70;
    const rockBuckets: Array<Array<{ m: THREE.Matrix4; c: THREE.Color; x: number; y: number; z: number; r: number }>> = Array.from(
      { length: SECTOR_COUNT },
      () => [],
    );
    let rc = 0;
    att = 0;
    while (rc < ROCK_PAIRS && att++ < 5000) {
      const x = (rand() - 0.5) * 900;
      const zPos = 14 + rand() * 436;
      if (Math.hypot(x - SPAWN_B.x, zPos - SPAWN_B.z) < 65 || Math.abs(x) < 12 || Math.hypot(x - TOWN.x, zPos - TOWN.z) < 95) continue;
      if (Math.abs(zPos - 432) < 22 && Math.abs(x) < 150) continue;
      const s0 = 0.8 + rand() * rand() * 4.5;
      const ry = heightAt(x, zPos) + s0 * 0.25;
      const rxEuler = rand() * 3;
      const ryEuler = rand() * 6;
      const rzEuler = rand() * 3;
      col.setHSL(0.1, 0.06, 0.38 + rand() * 0.18);
      const rockR = Math.max(0.9, s0 * 1.02);
      for (const zSign of [1, -1]) {
        const z = zSign * zPos;
        q.setFromEuler(new THREE.Euler(zSign * rxEuler, ryEuler, zSign * rzEuler));
        m.compose(p.set(x, ry, z), q, sc3.set(s0 * 1.3, s0 * 0.8, s0));
        obstacles.push({
          min: new THREE.Vector3(x - rockR, ry - s0 * 0.8, z - rockR),
          max: new THREE.Vector3(x + rockR, ry + s0 * 0.8, z + rockR),
          kind: 'rock',
          rockX: x,
          rockZ: z,
          rockRadius: rockR,
        });
        const sec = sectorIndexFor(x, z, WORLD_SIZE / 2, SECTOR_GRID);
        rockBuckets[sec].push({ m: m.clone(), c: col.clone(), x, y: ry, z, r: rockR });
      }
      rc++;
    }
    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = rockBuckets[sec];
      if (b.length === 0) continue;
      const mesh = new THREE.InstancedMesh(rockGeo, rockMat, b.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const box = new THREE.Box3();
      for (let i = 0; i < b.length; i++) {
        mesh.setMatrixAt(i, b[i].m);
        mesh.setColorAt(i, b[i].c);
        box.expandByPoint(p.set(b[i].x - b[i].r, b[i].y - b[i].r, b[i].z - b[i].r));
        box.expandByPoint(p.set(b[i].x + b[i].r, b[i].y + b[i].r, b[i].z + b[i].r));
      }
      mesh.count = b.length;
      mesh.computeBoundingSphere();
      root.add(mesh);
      rockSectors.push({ mesh, box, count: b.length });
    }
  }

  // Freeze static terrain, buildings, trees, grass, and rocks matrices so Three.js skips recomputing them each frame
  terrain.matrixAutoUpdate = false;
  terrain.updateMatrix();
  for (const child of root.children) {
    if (child !== sky && child !== sun && child !== sun.target && !clouds.includes(child as THREE.Group)) {
      child.matrixAutoUpdate = false;
      child.updateMatrix();
    }
  }

  const q = makeQueries(obstacles, heightAt, normalAt);

  function update(camPos: THREE.Vector3, focus: THREE.Vector3, dt = 0.016, vis?: VisibilityController) {
    sky.position.copy(camPos);
    timeU.value += dt;
    treeAnimator?.step(dt);
    for (const c of clouds) {
      c.position.x += 3 * dt;
      if (c.position.x > 1700) c.position.x = -1700;
      c.visible = vis ? vis.isSphereVisible(c.position.x, c.position.y, c.position.z, 260) : true;
    }
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDir, 220);
    sun.target.updateMatrixWorld();

    if (!vis) return;

    for (let s = 0; s < SECTOR_COUNT; s++) {
      const secBox = sectorBoxes[s];
      if (vis.isBoxVisible(secBox) && vis.boxEffectiveDistance(secBox) < 980) {
        vis.stats.visibleSectors++;
      } else {
        vis.stats.culledSectors++;
      }
    }

    for (let i = 0; i < grassSectors.length; i++) {
      const gs = grassSectors[i];
      if (grassDensity <= 0 || gs.mesh.count <= 0) {
        gs.mesh.visible = false;
        continue;
      }
      const visible = vis.isBoxVisible(gs.box) && vis.boxEffectiveDistance(gs.box) <= 165;
      gs.mesh.visible = visible;
    }

    for (let i = 0; i < treeSectors.length; i++) {
      const ts = treeSectors[i];
      if (ts.count <= 0) continue;
      const inFrustum = vis.isBoxVisible(ts.box);
      const effDist = vis.boxEffectiveDistance(ts.box);
      const tier = resolveTreeLod(inFrustum, effDist);
      if (tier === 'high') {
        ts.crowns.visible = true;
        ts.trunks.visible = true;
        ts.lowCrowns.visible = false;
        const sh = effDist < 130;
        ts.crowns.castShadow = sh;
        ts.trunks.castShadow = sh;
      } else if (tier === 'low') {
        ts.crowns.visible = false;
        ts.trunks.visible = false;
        ts.lowCrowns.visible = true;
      } else {
        ts.crowns.visible = false;
        ts.trunks.visible = false;
        ts.lowCrowns.visible = false;
      }
    }

    for (let i = 0; i < rockSectors.length; i++) {
      const rs = rockSectors[i];
      const inFrustum = vis.isBoxVisible(rs.box);
      const effDist = vis.boxEffectiveDistance(rs.box);
      rs.mesh.visible = inFrustum && effDist <= 560;
      if (rs.mesh.visible) rs.mesh.castShadow = effDist < 120;
    }

    for (let i = 0; i < houseItems.length; i++) {
      const h = houseItems[i];
      const inFrustum = vis.isBoxVisible(h.box);
      const effDist = vis.boxEffectiveDistance(h.box);
      const tier = resolveBuildingLod(inFrustum, effDist);
      if (tier === 'high') {
        h.wall.visible = true;
        h.roof.visible = true;
        h.lowProxy.visible = false;
        const sh = effDist < 125;
        h.wall.castShadow = sh;
        h.roof.castShadow = sh;
      } else if (tier === 'low') {
        h.wall.visible = false;
        h.roof.visible = false;
        h.lowProxy.visible = true;
      } else {
        h.wall.visible = false;
        h.roof.visible = false;
        h.lowProxy.visible = false;
      }
    }

    for (let i = 0; i < barrierItems.length; i++) {
      const b = barrierItems[i];
      const inFrustum = vis.isBoxVisible(b.box);
      const effDist = vis.boxEffectiveDistance(b.box);
      b.mesh.visible = inFrustum && effDist <= 520;
      if (b.mesh.visible) b.mesh.castShadow = effDist < 120;
    }

    for (let i = 0; i < rangeBoardItems.length; i++) {
      const rb = rangeBoardItems[i];
      const inFrustum = vis.isBoxVisible(rb.box);
      const effDist = vis.boxEffectiveDistance(rb.box);
      const showBoard = inFrustum && effDist <= 650;
      rb.board.visible = showBoard;
      if (showBoard) rb.board.castShadow = effDist < 120;
      const showPosts = showBoard && effDist <= 180;
      for (let pIdx = 0; pIdx < rb.posts.length; pIdx++) {
        rb.posts[pIdx].visible = showPosts;
        if (showPosts) rb.posts[pIdx].castShadow = effDist < 100;
      }
    }
  }

  function setGrass(density: number) {
    grassDensity = density;
    for (let i = 0; i < grassSectors.length; i++) {
      const gs = grassSectors[i];
      gs.mesh.count = Math.floor(gs.baseCount * density);
      gs.mesh.visible = density > 0 && gs.mesh.count > 0;
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

  return {
    id: 'hills',
    name: 'Холмы',
    setGrass,
    size: WORLD_SIZE,
    limit: WORLD_LIMIT,
    heightAt,
    normalAt,
    obstacles,
    segmentHit: q.segmentHit,
    raycast: q.raycast,
    nearby: q.nearby,
    knockTreesAt: treeAnimator?.knockTreesAt,
    resetTrees: treeAnimator?.reset,
    getTreeStates: () => treeStates,
    update,
    sun,
    terrain,
    createEnvironment,
    dispose,
    fogColor: 0xcbd8e2,
    fogNear: 450,
    fogFar: 2600,
    background: 0xd2dde6,
    exposure: 1,
    grade: { sat: 1.08, tint: [1, 1, 1] },
    spawnPlayer: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
    spawnA: hillsSpawnA,
    spawnB: hillsSpawnB,
    objectives: HILLS_OBJECTIVES,
    objJitter: 30,
  };
}
