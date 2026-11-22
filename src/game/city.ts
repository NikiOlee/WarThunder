import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createTreeAnimator,
  makeQueries,
  hash2,
  fbm,
  smooth,
  mulberry32,
  makeCanvas,
  type GameWorld,
  type ObstacleBox,
} from './world';
import type { TreeInstanceState } from './envCollision';

const SIZE = 1000;
const LIMIT = 480;
const ROAD_HALF = 8;

function crackTexture(): THREE.CanvasTexture {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9c9c7';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 7000; i++) {
    const v = 140 + Math.floor(Math.random() * 100);
    g.fillStyle = `rgba(${v},${v},${v - 4},0.5)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(40,38,34,${0.05 + Math.random() * 0.1})`;
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 60, 12 + Math.random() * 40, Math.random() * 3, 0, 6.283);
    g.fill();
  }
  const crack = (x: number, y: number, ang: number, n: number, w: number) => {
    g.lineWidth = w;
    g.strokeStyle = 'rgba(15,15,14,0.85)';
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < n; i++) {
      ang += (Math.random() - 0.5) * 0.9;
      const l = 14 + Math.random() * 34;
      x += Math.cos(ang) * l;
      y += Math.sin(ang) * l;
      g.lineTo(x, y);
      if (Math.random() < 0.18 && w > 0.8) {
        const sx = x;
        const sy = y;
        g.stroke();
        crack(sx, sy, ang + (Math.random() - 0.5) * 2.2, Math.floor(n / 2), w * 0.6);
        g.beginPath();
        g.moveTo(sx, sy);
      }
    }
    g.stroke();
  };
  for (let i = 0; i < 16; i++) crack(Math.random() * 512, Math.random() * 512, Math.random() * 6.283, 8 + Math.floor(Math.random() * 12), 1 + Math.random() * 1.8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function wallTexture(): THREE.CanvasTexture {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#b4b2ac';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const v = 120 + Math.floor(Math.random() * 100);
    g.fillStyle = `rgba(${v},${v},${v},0.4)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(20,20,18,${0.06 + Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, Math.random() * 120, 3 + Math.random() * 10, 40 + Math.random() * 200);
  }
  for (const [x, y] of [
    [26, 30],
    [150, 30],
    [26, 156],
    [150, 156],
  ]) {
    g.fillStyle = '#6e6c66';
    g.fillRect(x - 4, y - 4, 86, 94);
    g.fillStyle = '#161615';
    g.fillRect(x, y, 78, 86);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x + 10, y + 86, 60, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function softSprite(r: number, g: number, b: number): THREE.CanvasTexture {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  gr.addColorStop(0.5, `rgba(${r},${g},${b},0.45)`);
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
    col[i * 3 + 1] = shade * 0.98;
    col[i * 3 + 2] = shade * 0.95;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function createCityWorld(scene: THREE.Scene): GameWorld {
  const root = new THREE.Group();
  scene.add(root);
  const rand = mulberry32(4242);
  const obstacles: ObstacleBox[] = [];

  const craters: Array<{ x: number; z: number; r: number; d: number }> = [];
  for (let i = 0; i < 34; i++) craters.push({ x: (rand() - 0.5) * 860, z: (rand() - 0.5) * 860, r: 5 + rand() * 10, d: 1 + rand() * 2.2 });
  function heightAt(x: number, z: number): number {
    let h = (fbm(x * 0.012 + 3, z * 0.012 + 9, 3) - 0.5) * 1.4 + (fbm(x * 0.09, z * 0.09, 2) - 0.5) * 0.35;
    for (const c of craters) {
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = c.r * 1.4;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const t = Math.sqrt(d2) / c.r;
      if (t < 1) h -= c.d * (1 - t * t);
      else h += c.d * 0.22 * (1 - (t - 1) / 0.4);
    }
    h += smooth(466, 545, Math.max(Math.abs(x), Math.abs(z))) * (16 + fbm(x * 0.03, z * 0.03, 2) * 12);
    return h;
  }
  function normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 1.5;
    out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e));
    return out.normalize();
  }
  const roadDist = (x: number, z: number) =>
    Math.min(Math.abs((x - 50) / 100 - Math.round((x - 50) / 100)), Math.abs((z - 50) / 100 - Math.round((z - 50) / 100))) * 100;

  const sunDir = new THREE.Vector3(0.35, 0.5, 0.45).normalize();
  const sun = new THREE.DirectionalLight(0xd9d4c8, 1.3);
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
  root.add(new THREE.HemisphereLight(0x9ea3a6, 0x4a4944, 0.95));

  const skyMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir } },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir;
      void main(){
        vec3 d = normalize(vP); float h = max(d.y, 0.0);
        vec3 horizon = vec3(0.47, 0.48, 0.47), top = vec3(0.30, 0.32, 0.35);
        vec3 col = mix(horizon, top, smoothstep(0.0, 0.7, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(0.9, 0.85, 0.75) * pow(s, 8.0) * 0.16;
        col = mix(col, vec3(0.34, 0.35, 0.34), smoothstep(0.0, -0.12, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Group();
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), skyMat));
  root.add(sky);

  function createEnvironment(renderer: THREE.WebGLRenderer) {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.02).texture;
    scene.environmentIntensity = 0.4;
    pm.dispose();
  }

  const clouds: THREE.Group[] = [];
  {
    const mat = new THREE.SpriteMaterial({ map: softSprite(120, 122, 124), transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
    for (let i = 0; i < 30; i++) {
      const grp = new THREE.Group();
      const n = 6 + Math.floor(rand() * 6);
      for (let k = 0; k < n; k++) {
        const sp = new THREE.Sprite(mat);
        const sz = 220 + rand() * 260;
        sp.scale.set(sz * 1.5, sz * 0.6, 1);
        sp.position.set((k - n / 2) * 110 + rand() * 50, rand() * 30, rand() * 100);
        grp.add(sp);
      }
      grp.position.set((rand() - 0.5) * 3200, 300 + rand() * 120, (rand() - 0.5) * 3200);
      root.add(grp);
      clouds.push(grp);
    }
  }

  const SEG = 250;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  {
    const pos = tGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const asphalt = new THREE.Color(0x303032);
    const pave = new THREE.Color(0x6c6b68);
    const rubble = new THREE.Color(0x5a5750);
    const dirt = new THREE.Color(0x4b453c);
    const crat = new THREE.Color(0x2e2b27);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const rd = roadDist(x, z);
      const n = fbm(x * 0.05, z * 0.05, 3);
      if (rd < ROAD_HALF) c.copy(asphalt);
      else if (rd < ROAD_HALF + 3) c.copy(pave);
      else c.copy(rubble);
      c.lerp(dirt, n * 0.55);
      c.lerp(crat, smooth(-0.3, -1.8, h) * 0.9);
      if (Math.max(Math.abs(x), Math.abs(z)) > 400) c.lerp(rubble, 0.6);
      const j = 0.85 + hash2(i, 91) * 0.3;
      col[i * 3] = c.r * j;
      col[i * 3 + 1] = c.g * j;
      col[i * 3 + 2] = c.b * j;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = tGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 22, uv.getY(i) * 22);
    tGeo.computeVertexNormals();
  }
  const cracks = crackTexture();
  const terrain = new THREE.Mesh(
    tGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, map: cracks, bumpMap: cracks, bumpScale: 1.6, flatShading: true, roughness: 1, metalness: 0 }),
  );
  terrain.receiveShadow = true;
  root.add(terrain);

  {
    const geo = new THREE.BoxGeometry(1, 0.04, 1);
    const N = 2600;
    const dashes = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8d8b80, roughness: 1 }), N);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let n = 0;
    for (let k = -5; k <= 4 && n < N; k++) {
      const line = 50 + k * 100;
      for (let t = -470; t < 470 && n < N; t += 9) {
        if (Math.abs((((t - 50) % 100) + 100) % 100 - 50) < 11) continue;
        for (const horizontal of [false, true]) {
          if (rand() < 0.4) continue;
          const x = horizontal ? t : line;
          const z = horizontal ? line : t;
          const h = heightAt(x, z);
          if (h < -0.35 || h > 0.9 || n >= N) continue;
          m.compose(p.set(x, h + 0.05, z), q, s.set(horizontal ? 3.4 : 0.4, 1, horizontal ? 0.4 : 3.4));
          dashes.setMatrixAt(n++, m);
        }
      }
    }
    dashes.count = n;
    dashes.receiveShadow = true;
    dashes.computeBoundingSphere();
    root.add(dashes);
  }

  const geos: THREE.BufferGeometry[] = [];
  const rubblePts: Array<[number, number]> = [];
  const smokePts: Array<[number, number, number]> = [];
  const footprints: Array<{ x0: number; x1: number; z0: number; z1: number }> = [];

  function piece(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, shade: number) {
    if (maxY - minY < 0.2) return;
    geos.push(boxGeo(maxX - minX, maxY - minY, maxZ - minZ, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, shade));
    obstacles.push({ min: new THREE.Vector3(minX, minY, minZ), max: new THREE.Vector3(maxX, maxY, maxZ) });
  }

  function ruin(cx: number, cz: number, w: number, d: number, floors: number, wreck: number) {
    const H = floors * 3.5;
    const t = 0.9;
    const breachSide = Math.floor(rand() * 4);
    const breachAt = 3 + rand() * Math.max(1, (breachSide < 2 ? w : d) - 14);
    const sides = [
      { alongX: true, fixed: cz - d / 2, from: cx - w / 2, to: cx + w / 2 },
      { alongX: true, fixed: cz + d / 2, from: cx - w / 2, to: cx + w / 2 },
      { alongX: false, fixed: cx - w / 2, from: cz - d / 2, to: cz + d / 2 },
      { alongX: false, fixed: cx + w / 2, from: cz - d / 2, to: cz + d / 2 },
    ];
    sides.forEach((s, si) => {
      let pos = s.from;
      while (pos < s.to - 0.5) {
        const pw = Math.min(s.to - pos, 3.5 + rand() * 2.5);
        const breach = si === breachSide && pos - s.from > breachAt && pos - s.from < breachAt + 9;
        const mid = pos + pw / 2;
        const gx = s.alongX ? mid : s.fixed;
        const gz = s.alongX ? s.fixed : mid;
        const gh = heightAt(gx, gz);
        let h = rand() < 0.55 - wreck * 0.35 ? H * (0.7 + rand() * 0.3) : H * (0.1 + rand() * 0.55);
        if (rand() < 0.15) h = 0.6 + rand() * 1.2;
        if (breach) h = rand() < 0.5 ? 0 : 0.5 + rand() * 0.6;
        const shade = 0.42 + rand() * 0.2;
        if (s.alongX) piece(pos, gh - 1, s.fixed - t / 2, pos + pw, gh + h, s.fixed + t / 2, shade);
        else piece(s.fixed - t / 2, gh - 1, pos, s.fixed + t / 2, gh + h, pos + pw, shade);
        if (rand() < 0.3) rubblePts.push([gx + (rand() - 0.5) * 5, gz + (rand() - 0.5) * 5]);
        pos += pw;
      }
    });
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const x = cx + (sx * w) / 2;
      const z = cz + (sz * d) / 2;
      const gh = heightAt(x, z);
      const h = H * (0.5 + rand() * 0.5) * (1 - wreck * 0.4);
      piece(x - 0.8, gh - 1, z - 0.8, x + 0.8, gh + h, z + 0.8, 0.38);
    }
    if (floors >= 2) {
      const n = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const sw = w * (0.3 + rand() * 0.25);
        const sd = d * (0.3 + rand() * 0.25);
        const sx = cx + (rand() - 0.5) * (w - sw - 4);
        const sz = cz + (rand() - 0.5) * (d - sd - 4);
        const gh = heightAt(sx, sz);
        const y = gh + 3.5 * (1 + Math.floor(rand() * (floors - 1)));
        piece(sx - sw / 2, y, sz - sd / 2, sx + sw / 2, y + 0.45, sz + sd / 2, 0.5);
        for (const [px, pz] of [
          [sx - sw / 2 + 0.6, sz - sd / 2 + 0.6],
          [sx + sw / 2 - 0.6, sz + sd / 2 - 0.6],
        ])
          piece(px - 0.35, gh - 1, pz - 0.35, px + 0.35, y, pz + 0.35, 0.36);
      }
    }
    const nb = 2 + Math.floor(rand() * 3);
    for (let k = 0; k < nb; k++) {
      const bx = cx + (rand() - 0.5) * (w + 6);
      const bz = cz + (rand() - 0.5) * (d + 6);
      const bw = 1.5 + rand() * 2;
      const bd = 1.5 + rand() * 2;
      const bh = 0.8 + rand() * 0.8;
      const gh = heightAt(bx, bz);
      piece(bx - bw / 2, gh - 0.5, bz - bd / 2, bx + bw / 2, gh + bh, bz + bd / 2, 0.3 + rand() * 0.1);
    }
    for (let k = 0; k < 14; k++) rubblePts.push([cx + (rand() - 0.5) * (w + 10), cz + (rand() - 0.5) * (d + 10)]);
    if (rand() < 0.4) smokePts.push([cx + (rand() - 0.5) * w * 0.5, cz + (rand() - 0.5) * d * 0.5, heightAt(cx, cz)]);
    footprints.push({ x0: cx - w / 2 - 5, x1: cx + w / 2 + 5, z0: cz - d / 2 - 5, z1: cz + d / 2 + 5 });
  }

  for (let kx = -4; kx <= 4; kx++) {
    for (let kz = -4; kz <= 4; kz++) {
      const bx = kx * 100;
      const bz = kz * 100;
      if (Math.abs(kz) === 4) {
        for (let i = 0; i < 3; i++) {
          const x = bx + (rand() - 0.5) * 70;
          const z = bz + (rand() - 0.5) * 60;
          if (Math.abs(z) > 0 && Math.abs(Math.abs(z) - 440) < 14 && Math.abs(x) < 190) continue;
          const gh = heightAt(x, z);
          const w = 6 + rand() * 6;
          const d = 2 + rand() * 2;
          piece(x - w / 2, gh - 0.5, z - d / 2, x + w / 2, gh + 2 + rand() * 1.5, z + d / 2, 0.4);
        }
        continue;
      }
      if (kx === 0 && kz === 0) {
        ruin(0, 0, 28, 26, 4, 0.4);
        continue;
      }
      if (rand() < 0.18) {
        for (let i = 0; i < 5; i++) {
          const x = bx + (rand() - 0.5) * 60;
          const z = bz + (rand() - 0.5) * 60;
          rubblePts.push([x, z]);
        }
        continue;
      }
      const n = rand() < 0.45 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const w = 17 + rand() * 15;
          const d = 15 + rand() * 13;
          const x = bx + (rand() - 0.5) * (72 - w);
          const z = bz + (rand() - 0.5) * (72 - d);
          const r = { x0: x - w / 2 - 5, x1: x + w / 2 + 5, z0: z - d / 2 - 5, z1: z + d / 2 + 5 };
          if (footprints.some((f) => r.x0 < f.x1 && r.x1 > f.x0 && r.z0 < f.z1 && r.z1 > f.z0)) continue;
          ruin(x, z, w, d, 2 + Math.floor(rand() * 4), rand());
          break;
        }
      }
    }
  }
  {
    const merged = mergeGeometries(geos, false);
    const wallTex = wallTexture();
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, map: wallTex, roughness: 1, metalness: 0, flatShading: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    geos.forEach((g) => g.dispose());
  }

  for (let i = 0; i < 260; i++) rubblePts.push([(rand() - 0.5) * 900, (rand() - 0.5) * 900]);
  {
    const N = Math.min(rubblePts.length, 900);
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), N);
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    let placedRocks = 0;
    for (let i = 0; i < N; i++) {
      const [x, z] = rubblePts[i];
      const nearSpawn =
        (Math.abs(z + 442) < 26 && Math.abs(x) < 120) ||
        (Math.abs(z - 446) < 26 && Math.abs(x) < 200) ||
        (Math.abs(x) < 8 && z < -360);
      const sz = i >= rubblePts.length - 45 && !nearSpawn ? 1.05 + rand() * 1.15 : 0.35 + rand() * rand() * 1.5;
      const ry = heightAt(x, z) + sz * 0.2;
      q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 6, rand() * 3));
      m.compose(p.set(x, ry, z), q, s.set(sz * 1.4, sz * 0.7, sz));
      rocks.setMatrixAt(placedRocks, m);
      rocks.setColorAt(placedRocks, col.setHSL(0.09, 0.04, 0.22 + rand() * 0.2));
      if (sz >= 0.75 && !nearSpawn) {
        const rockR = Math.max(0.85, sz * 1.04);
        obstacles.push({
          min: new THREE.Vector3(x - rockR, ry - sz * 0.7, z - rockR),
          max: new THREE.Vector3(x + rockR, ry + sz * 0.7, z + rockR),
          kind: 'rock',
          rockX: x,
          rockZ: z,
          rockRadius: rockR,
        });
      }
      placedRocks++;
    }
    rocks.count = placedRocks;
    rocks.computeBoundingSphere();
    root.add(rocks);
  }
  {
    const carMat = [0x3a3835, 0x4d3a30, 0x2f3236, 0x45423a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.3, flatShading: true }));
    for (let i = 0; i < 24; i++) {
      const alongX = rand() < 0.5;
      const line = 50 + Math.floor((rand() - 0.5) * 9) * 100;
      const t = (rand() - 0.5) * 880;
      const off = (rand() < 0.5 ? -1 : 1) * (4.5 + rand() * 2);
      const x = alongX ? t : line + off;
      const z = alongX ? line + off : t;
      const h = heightAt(x, z);
      if (h < -0.4 || Math.abs(Math.abs(z) - 440) < 14) continue;
      const w = alongX ? 4.6 : 2.0;
      const d = alongX ? 2.0 : 4.6;
      const mat = carMat[i % carMat.length];
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), mat);
      body.position.set(x, h + 0.7, z);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 2.2 : 1.8, 0.7, alongX ? 1.8 : 2.2), mat);
      cab.position.set(x, h + 1.5, z);
      body.castShadow = cab.castShadow = true;
      root.add(body, cab);
      obstacles.push({ min: new THREE.Vector3(x - w / 2, h, z - d / 2), max: new THREE.Vector3(x + w / 2, h + 1.7, z + d / 2) });
    }
  }
  const treeStates: TreeInstanceState[] = [];
  let treeAnimator: ReturnType<typeof createTreeAnimator> | null = null;
  {
    const N = 90;
    const lamp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 8, 6).translate(0, 4, 0), new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.8, metalness: 0.4 }), N);
    const tree = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.45, 6, 5).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: 0x24211d, roughness: 1 }), 40);
    lamp.castShadow = tree.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    let ln = 0;
    for (let i = 0; i < N * 3 && ln < N; i++) {
      const alongX = rand() < 0.5;
      const line = 50 + Math.floor((rand() - 0.5) * 9) * 100;
      const t = (rand() - 0.5) * 880;
      const off = (rand() < 0.5 ? -1 : 1) * (ROAD_HALF + 1.2);
      const x = alongX ? t : line + off;
      const z = alongX ? line + off : t;
      if (Math.abs(Math.abs(z) - 440) < 14) continue;
      q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.6, rand() * 6, (rand() - 0.5) * 0.6));
      m.compose(p.set(x, heightAt(x, z) - 0.1, z), q, s);
      lamp.setMatrixAt(ln++, m);
    }
    lamp.count = ln;
    lamp.computeBoundingSphere();
    let tn = 0;
    for (let i = 0; i < 400 && tn < 40; i++) {
      const x = (rand() - 0.5) * 880;
      const z = (rand() - 0.5) * 880;
      if (roadDist(x, z) < ROAD_HALF + 4 || Math.abs(Math.abs(z) - 440) < 14) continue;
      const ty = heightAt(x, z) - 0.1;
      const sy = 0.7 + rand() * 0.8;
      const yaw = rand() * 6.28;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      m.compose(p.set(x, ty, z), q, s.set(1, sy, 1));
      tree.setMatrixAt(tn, m);
      treeStates.push({
        index: tn,
        x,
        y: ty,
        z,
        baseYaw: yaw,
        sx: 1,
        sy,
        sz: 1,
        trunkRadius: 0.5,
        state: 'standing',
        fallProgress: 0,
        fallDirX: 0,
        fallDirZ: 1,
        tiltAngle: 0,
        targetTilt: 1.46,
      });
      tn++;
    }
    tree.count = tn;
    tree.computeBoundingSphere();
    root.add(lamp, tree);
    treeAnimator = createTreeAnimator(treeStates, [tree], heightAt);
  }

  const plumes: Array<{ sp: THREE.Sprite; x: number; z: number; h: number; phase: number; speed: number; drift: number }> = [];
  {
    const tex = softSprite(48, 48, 48);
    for (const [x, z, h] of smokePts.slice(0, 9)) {
      for (let k = 0; k < 11; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5, fog: true }));
        root.add(sp);
        plumes.push({ sp, x, z, h, phase: k / 11, speed: 0.05 + rand() * 0.02, drift: rand() * 6.28 });
      }
    }
  }
  let time = 0;

  const cloudSet = new Set<THREE.Object3D>(clouds);
  const plumeSet = new Set<THREE.Object3D>(plumes.map((p) => p.sp));
  for (const child of root.children) {
    if (child !== sky && child !== sun && child !== sun.target && !cloudSet.has(child) && !plumeSet.has(child)) {
      child.matrixAutoUpdate = false;
      child.updateMatrix();
    }
  }

  function update(camPos: THREE.Vector3, focus: THREE.Vector3, dt = 0.016) {
    sky.position.copy(camPos);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDir, 220);
    sun.target.updateMatrixWorld();
    time += dt;
    treeAnimator?.step(dt);
    for (const c of clouds) {
      c.position.x += 2.5 * dt;
      if (c.position.x > 1700) c.position.x = -1700;
    }
    for (const p of plumes) {
      const t = (time * p.speed + p.phase) % 1;
      p.sp.position.set(p.x + Math.cos(p.drift) * t * 60, p.h + 4 + t * 170, p.z + Math.sin(p.drift) * t * 60);
      const sz = 14 + t * 80;
      p.sp.scale.set(sz, sz, 1);
      p.sp.material.opacity = 0.55 * Math.sin(Math.min(1, t) * Math.PI);
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
  return {
    id: 'city',
    name: 'Город',
    size: SIZE,
    limit: LIMIT,
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
    setGrass() {},
    fogColor: 0x77797a,
    fogNear: 25,
    fogFar: 760,
    background: 0x77797a,
    exposure: 0.85,
    grade: { sat: 0.42, tint: [1.02, 1.0, 0.95] },
    spawnPlayer: { x: 0, z: -440, heading: 0 },
    spawnA: (i: number) => ({ x: -70 + i * 45, z: -446, heading: 0 }),
    spawnB: (i: number) => ({ x: -170 + i * 38, z: 446, heading: Math.PI }),
    objectives: [
      { x: -150, z: -50 },
      { x: 50, z: 50 },
      { x: -50, z: 150 },
      { x: 150, z: -50 },
    ],
    objJitter: 10,
  };
}
