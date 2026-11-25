import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createTreeAnimator,
  fbm,
  hash2,
  makeCanvas,
  makeQueries,
  mulberry32,
  smooth,
  type GameWorld,
  type ObstacleBox,
} from './world';
import type { TreeInstanceState } from './envCollision';
import { resolveBuildingLod, resolveTreeLod, sectorIndexFor, type VisibilityController } from './visibility';

const SIZE = 1000;
const LIMIT = 480;
const RING_R = 215;
const RING_HALF = 10.5;
const EXPWY_HALF = 13.5;
const AVE_HALF = 9.5;

function cityRoadInfo(x: number, z: number): { dist: number; isHighway: boolean; isPark: boolean } {
  const r = Math.hypot(x, z);
  const dRing = Math.abs(r - RING_R);
  const dExp = Math.abs(x); // North-South Split Expressway
  const dProsp = Math.abs(z); // East-West Prospect
  const dCrossZ = Math.min(Math.abs(z - 320), Math.abs(z + 320));
  const dCrossX = Math.min(Math.abs(x - 280), Math.abs(x + 280));

  if (r < 54) {
    return { dist: Math.min(dExp, dProsp), isHighway: false, isPark: true };
  }
  const dHw = Math.min(dExp, dRing);
  const dAve = Math.min(dProsp, dCrossZ, dCrossX);
  if (dHw <= RING_HALF + (dExp < dRing ? 3 : 0)) {
    return { dist: dHw, isHighway: true, isPark: false };
  }
  return { dist: Math.min(dHw, dAve), isHighway: dHw < dAve, isPark: false };
}

function modernAsphaltTexture(): THREE.CanvasTexture {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d')!;
  // Neutral bright base so Three.js vertexColors render true green lawns, pale sidewalks, and charcoal asphalt
  g.fillStyle = '#eceae4';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6500; i++) {
    const v = 205 + Math.floor(Math.random() * 45);
    g.fillStyle = `rgba(${v},${v},${v},0.45)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
  // Subtle concrete expansion seams
  g.strokeStyle = 'rgba(130,132,136,0.18)';
  g.lineWidth = 1;
  for (let p = 64; p < 512; p += 64) {
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(512, p);
    g.moveTo(p, 0);
    g.lineTo(p, 512);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function panelApartmentTexture(): THREE.CanvasTexture {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d')!;
  g.fillStyle = '#d7d1c3';
  g.fillRect(0, 0, 512, 512);

  // Concrete panel grid seams
  g.strokeStyle = '#9e9789';
  g.lineWidth = 3;
  for (let x = 0; x <= 512; x += 128) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 512);
    g.stroke();
  }
  for (let y = 0; y <= 512; y += 128) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }

  // Painted turquoise / warm ochre accent strip per floor
  g.fillStyle = '#538088';
  for (let y = 0; y < 512; y += 128) {
    g.fillRect(0, y + 98, 512, 26);
  }

  // Apartment windows + balcony railings
  for (let row = 0; row < 4; row++) {
    const ry = row * 128 + 18;
    for (let col = 0; col < 4; col++) {
      const rx = col * 128 + 20;
      g.fillStyle = '#e7e2d6';
      g.fillRect(rx - 4, ry - 4, 96, 74);
      g.fillStyle = '#273a4a';
      g.fillRect(rx, ry, 88, 66);
      // Reflective sky glint + frame mullions
      g.fillStyle = 'rgba(130,185,220,0.28)';
      g.fillRect(rx + 4, ry + 4, 34, 58);
      g.strokeStyle = '#c5c0b4';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(rx + 44, ry);
      g.lineTo(rx + 44, ry + 66);
      g.stroke();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glassOfficeTexture(): THREE.CanvasTexture {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d')!;
  g.fillStyle = '#244b66';
  g.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      const glint = (x + y) % 128 === 0 ? 0.24 : 0.08;
      g.fillStyle = `rgba(155,212,245,${glint})`;
      g.fillRect(x + 4, y + 4, 56, 56);
    }
  }
  g.strokeStyle = '#758c9b';
  g.lineWidth = 4;
  for (let p = 0; p <= 512; p += 64) {
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(512, p);
    g.moveTo(p, 0);
    g.lineTo(p, 512);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function highwaySignTexture(): THREE.CanvasTexture {
  const c = makeCanvas(256, 64);
  const g = c.getContext('2d')!;
  g.fillStyle = '#18663d';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#f2f4f0';
  g.lineWidth = 4;
  g.strokeRect(4, 4, 248, 56);
  g.fillStyle = '#ffffff';
  g.font = 'bold 20px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('ЦЕНТР  ↑  ПРОМЗОНА  ←', 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softSprite(r: number, g: number, b: number): THREE.CanvasTexture {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d')!;
  const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.88)`);
  gr.addColorStop(0.5, `rgba(${r},${g},${b},0.4)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function boxGeo(w: number, h: number, d: number, cx: number, cy: number, cz: number, shade: number, tile = 11): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const fw = f < 2 ? d : w;
    const fh = f < 2 ? h : f < 4 ? d : h;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * fw) / tile, (uv.getY(k) * fh) / tile);
    }
  }
  g.translate(cx, cy, cz);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = shade;
    col[i * 3 + 1] = shade;
    col[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function createCityWorld(scene: THREE.Scene): GameWorld {
  const root = new THREE.Group();
  scene.add(root);
  const rand = mulberry32(8421);
  const obstacles: ObstacleBox[] = [];

  function heightAt(x: number, z: number): number {
    let h = (fbm(x * 0.008 + 7, z * 0.008 + 2, 2) - 0.5) * 0.55;
    // Gentle elevated highway terrace near southern & northern outer bounds
    h += smooth(468, 545, Math.max(Math.abs(x), Math.abs(z))) * (15 + fbm(x * 0.03, z * 0.03, 2) * 10);
    return h;
  }

  function normalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    const e = 1.5;
    out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e));
    return out.normalize();
  }

  // Bright Sunny Afternoon Atmosphere (completely distinct from 1940 Crimson Blitz London!)
  const sunDir = new THREE.Vector3(0.56, 0.68, 0.42).normalize();
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -120;
  sc.right = 120;
  sc.top = 120;
  sc.bottom = -120;
  sc.near = 10;
  sc.far = 450;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  root.add(sun, sun.target);
  root.add(new THREE.HemisphereLight(0x9ac6ef, 0x5d6157, 1.02));

  const skyMat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: sunDir } },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir;
      void main(){
        vec3 d = normalize(vP); float h = max(d.y, 0.0);
        vec3 horizon = vec3(0.76, 0.85, 0.93), mid = vec3(0.42, 0.66, 0.90), top = vec3(0.20, 0.44, 0.78);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.30, h));
        col = mix(col, top, smoothstep(0.26, 0.92, h));
        float s = max(dot(d, normalize(sunDir)), 1e-4);
        col += vec3(1.0, 0.92, 0.72) * (pow(s, 8.0) * 0.22 + pow(s, 72.0) * 0.55);
        col = mix(col, vec3(0.56, 0.62, 0.68), smoothstep(0.0, -0.12, d.y));
        col = clamp(col, vec3(0.0), vec3(6.0));
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
    scene.environmentIntensity = 0.5;
    pm.dispose();
  }

  const clouds: THREE.Group[] = [];
  {
    const mat = new THREE.SpriteMaterial({
      map: softSprite(248, 250, 255),
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.72,
    });
    for (let i = 0; i < 24; i++) {
      const grp = new THREE.Group();
      const n = 5 + Math.floor(rand() * 5);
      for (let k = 0; k < n; k++) {
        const sp = new THREE.Sprite(mat);
        const sz = 190 + rand() * 210;
        sp.scale.set(sz * 1.5, sz * 0.6, 1);
        sp.position.set((k - n / 2) * 100 + rand() * 45, rand() * 26, rand() * 90);
        grp.add(sp);
      }
      grp.position.set((rand() - 0.5) * 3200, 330 + rand() * 140, (rand() - 0.5) * 3200);
      root.add(grp);
      clouds.push(grp);
    }
  }

  // Terrain vertex coloring: green Central Park lawn, clean asphalt highways, pale concrete sidewalks, industrial gravel West vs urban grass/plazas East
  const SEG = 170;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  {
    const pos = tGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const asphalt = new THREE.Color(0x363a42);
    const sidewalk = new THREE.Color(0xb8b4aa);
    const parkGrass = new THREE.Color(0x4f903f);
    const parkPath = new THREE.Color(0xc5bdb0);
    const indYard = new THREE.Color(0x827e75);
    const resLawn = new THREE.Color(0x5e8e48);
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const ri = cityRoadInfo(x, z);
      const r = Math.hypot(x, z);
      const half = ri.isHighway ? (Math.abs(x) < 16 ? EXPWY_HALF : RING_HALF) : AVE_HALF;
      const n = fbm(x * 0.04, z * 0.04, 3);

      if (ri.isPark) {
        const onCross = Math.abs(x) < 4.5 || Math.abs(z) < 4.5 || r < 16;
        c.copy(onCross ? parkPath : parkGrass);
        if (!onCross) c.offsetHSL((n - 0.5) * 0.03, 0, (n - 0.5) * 0.08);
      } else if (ri.dist < half) {
        c.copy(asphalt);
      } else if (ri.dist < half + 3.8) {
        c.copy(sidewalk);
      } else if (x < -20) {
        c.copy(indYard);
        c.offsetHSL(0, 0, (n - 0.5) * 0.1);
      } else {
        c.copy(resLawn).lerp(sidewalk, smooth(0.45, 0.72, n) * 0.65);
      }
      const j = 0.91 + hash2(i, 73) * 0.18;
      col[i * 3] = c.r * j;
      col[i * 3 + 1] = c.g * j;
      col[i * 3 + 2] = c.b * j;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = tGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 26, uv.getY(i) * 26);
    tGeo.computeVertexNormals();
  }

  const roadTex = modernAsphaltTexture();
  const terrain = new THREE.Mesh(
    tGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: roadTex,
      bumpMap: roadTex,
      bumpScale: 0.7,
      flatShading: true,
      roughness: 0.92,
      metalness: 0.02,
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
      sectorBoxes.push(new THREE.Box3(new THREE.Vector3(x0, -15, z0), new THREE.Vector3(x0 + SECTOR_SPAN, 85, z0 + SECTOR_SPAN)));
    }
  }

  interface InstancedSectorChunk {
    mesh: THREE.InstancedMesh;
    box: THREE.Box3;
  }

  // Modern Highway Markings (white dashes, yellow centerlines, crosswalks) & Concrete Jersey Medians
  const whiteMarkSectors: InstancedSectorChunk[] = [];
  const yellowMarkSectors: InstancedSectorChunk[] = [];
  const medianSectors: InstancedSectorChunk[] = [];
  {
    const unitGeo = new THREE.BoxGeometry(1, 1, 1);
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf0eee6, roughness: 0.75 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xeeb934, roughness: 0.75 });
    const jerseyMat = new THREE.MeshStandardMaterial({ color: 0x9da0a4, roughness: 0.92 });

    const wBuckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const yBuckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const jBuckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const addBox = (
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

    // Expressway lane dashes + Jersey median dividers (leaving spawn zones |z| > 360 & park/intersections open!)
    for (let z = -450; z <= 450; z += 11) {
      if (Math.abs(z) < 62) continue;
      if (Math.abs(Math.abs(z) - RING_R) < 16 || Math.abs(Math.abs(z) - 320) < 16) continue;
      const y = heightAt(0, z);
      for (const lx of [-6.5, 6.5]) {
        addBox(wBuckets, lx, y + 0.04, z, 0, 0.28, 0.05, 4.8);
      }
      addBox(yBuckets, -0.35, y + 0.04, z, 0, 0.22, 0.05, 9.5);
      addBox(yBuckets, 0.35, y + 0.04, z, 0, 0.22, 0.05, 9.5);

      // Raised pale concrete curbstones lining both edges of the expressway
      for (const edgeX of [-EXPWY_HALF - 0.35, EXPWY_HALF + 0.35]) {
        addBox(jBuckets, edgeX, y + 0.14, z, 0, 0.55, 0.28, 10.6);
      }

      // Concrete Jersey barriers along expressway spine (breaks at z=+-215, +-320, spawn zones, and park center)
      if (Math.abs(z) > 74 && Math.abs(z) < 392 && Math.abs(Math.abs(z) - RING_R) > 22 && Math.abs(Math.abs(z) - 320) > 22) {
        addBox(jBuckets, 0, y + 0.55, z, 0, 0.85, 1.1, 8.2);
        obstacles.push({
          min: new THREE.Vector3(-0.55, y, z - 4.1),
          max: new THREE.Vector3(0.55, y + 1.15, z + 4.1),
          kind: 'structure',
        });
      }
    }

    // Ring road dashed markings
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const rx = Math.cos(a) * RING_R;
      const rz = Math.sin(a) * RING_R;
      if (Math.abs(rx) < 16 || Math.abs(rz) < 16) continue;
      const y = heightAt(rx, rz);
      addBox(yBuckets, rx, y + 0.04, rz, -a, 0.28, 0.05, 6.5);
    }

    // East-West Prospect & Cross Avenues dashes
    for (const cz of [0, -320, 320]) {
      for (let x = -450; x <= 450; x += 11) {
        if (Math.abs(x) < 60 && cz === 0) continue;
        if (Math.abs(x) < 18 || Math.abs(Math.abs(x) - 280) < 14) continue;
        const y = heightAt(x, cz);
        addBox(wBuckets, x, y + 0.04, cz, Math.PI / 2, 0.26, 0.05, 4.5);
      }
    }
    for (const cx of [-280, 280]) {
      for (let z = -450; z <= 450; z += 11) {
        if (Math.abs(z) < 16 || Math.abs(Math.abs(z) - 320) < 16) continue;
        const y = heightAt(cx, z);
        addBox(wBuckets, cx, y + 0.04, z, 0, 0.26, 0.05, 4.5);
      }
    }

    // Crosswalks around Central Park approaches
    for (const [cx, cz, horiz] of [
      [0, -60, true],
      [0, 60, true],
      [-60, 0, false],
      [60, 0, false],
    ] as const) {
      for (let sOff = -9; sOff <= 9; sOff += 2.4) {
        const px = horiz ? cx + sOff : cx;
        const pz = horiz ? cz : cz + sOff;
        addBox(wBuckets, px, heightAt(px, pz) + 0.045, pz, horiz ? 0 : Math.PI / 2, 0.85, 0.05, 3.2);
      }
    }

    const flush = (
      buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>>,
      mat: THREE.Material,
      target: InstancedSectorChunk[],
      castShadow: boolean,
    ) => {
      for (let sec = 0; sec < SECTOR_COUNT; sec++) {
        const b = buckets[sec];
        if (b.length === 0) continue;
        const mesh = new THREE.InstancedMesh(unitGeo, mat, b.length);
        mesh.receiveShadow = true;
        mesh.castShadow = castShadow;
        const box = new THREE.Box3();
        for (let i = 0; i < b.length; i++) {
          mesh.setMatrixAt(i, b[i].m);
          box.expandByPoint(p.set(b[i].x - 5, b[i].y - 0.5, b[i].z - 5));
          box.expandByPoint(p.set(b[i].x + 5, b[i].y + 1.5, b[i].z + 5));
        }
        mesh.count = b.length;
        mesh.computeBoundingSphere();
        root.add(mesh);
        target.push({ mesh, box });
      }
    };

    flush(wBuckets, whiteMat, whiteMarkSectors, false);
    flush(yBuckets, yellowMat, yellowMarkSectors, false);
    flush(jBuckets, jerseyMat, medianSectors, true);
  }

  // Overhead Green Highway Sign Gantries across the Expressway
  {
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x676f77, roughness: 0.55, metalness: 0.65 });
    const signMat = new THREE.MeshBasicMaterial({ map: highwaySignTexture(), side: THREE.DoubleSide });
    for (const gz of [-360, -245, -135, 135, 245, 360]) {
      const gy = heightAt(0, gz);
      const grp = new THREE.Group();
      for (const sx of [-15.2, 15.2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 8.8, 8), steelMat);
        post.position.set(sx, gy + 4.4, gz);
        post.castShadow = true;
        grp.add(post);
      }
      const truss = new THREE.Mesh(new THREE.BoxGeometry(31.2, 0.55, 0.55), steelMat);
      truss.position.set(0, gy + 8.6, gz);
      const board = new THREE.Mesh(new THREE.BoxGeometry(11.5, 2.7, 0.25), signMat);
      board.position.set(0, gy + 8.6, gz);
      grp.add(truss, board);
      root.add(grp);
    }
  }

  // Central Park Fountain Monument at (0, 0)
  {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xbcb6aa, roughness: 0.85, flatShading: true });
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3b869b, roughness: 0.18, metalness: 0.2 });
    const gy = heightAt(0, 0);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(11.2, 11.8, 1.1, 18), stoneMat);
    rim.position.set(0, gy + 0.55, 0);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(9.8, 9.8, 0.85, 18), waterMat);
    pool.position.set(0, gy + 0.5, 0);
    const obBase = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.4, 3.8), stoneMat);
    obBase.position.set(0, gy + 1.2, 0);
    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.4, 15.5, 4), stoneMat);
    obelisk.position.set(0, gy + 9.5, 0);
    obelisk.rotation.y = Math.PI / 4;
    rim.castShadow = obBase.castShadow = obelisk.castShadow = true;
    root.add(rim, pool, obBase, obelisk);
    obstacles.push({
      min: new THREE.Vector3(-4.5, gy, -4.5),
      max: new THREE.Vector3(4.5, gy + 16, 4.5),
      kind: 'structure',
    });
  }

  // Multi-district City Buildings: East = Panel High-Rises + Glass Towers | West = Industrial Plant + Silos + Cooling Towers
  const panelMat = new THREE.MeshStandardMaterial({ map: panelApartmentTexture(), vertexColors: true, roughness: 0.88, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ map: glassOfficeTexture(), vertexColors: true, roughness: 0.35, metalness: 0.45, flatShading: true });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8e8d87, vertexColors: true, roughness: 0.92, flatShading: true });
  const lowProxyMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  interface BuildingSectorChunk {
    meshes: THREE.Mesh[];
    low: THREE.Mesh | null;
    box: THREE.Box3;
  }
  const buildingSectors: BuildingSectorChunk[] = [];
  const footprints: Array<{ x0: number; x1: number; z0: number; z1: number }> = [];
  const tmpP = new THREE.Vector3();

  {
    const panelBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const glassBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const concBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const lowBuckets: THREE.BufferGeometry[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    const sBoxes = Array.from({ length: SECTOR_COUNT }, () => new THREE.Box3());

    const canPlace = (cx: number, cz: number, w: number, d: number): boolean => {
      const r = Math.hypot(cx, cz);
      if (r < 68) return false;
      // Keep roads, ring avenue, and team spawns completely clear
      const ri = cityRoadInfo(cx, cz);
      const half = ri.isHighway ? 16 : AVE_HALF + 3;
      if (ri.dist < half + Math.max(w, d) * 0.56) return false;
      if (Math.abs(cz + 425) < 28 && Math.abs(cx) < 36) return false;
      if (Math.abs(cz - 445) < 28 && Math.abs(cx) < 36) return false;
      const x0 = cx - w / 2 - 4;
      const x1 = cx + w / 2 + 4;
      const z0 = cz - d / 2 - 4;
      const z1 = cz + d / 2 + 4;
      if (footprints.some((f) => x0 < f.x1 && x1 > f.x0 && z0 < f.z1 && z1 > f.z0)) return false;
      return true;
    };

    const addApartmentOrGlass = (cx: number, cz: number, w: number, d: number, floors: number, isGlass: boolean) => {
      const sec = sectorIndexFor(cx, cz, SIZE / 2, SECTOR_GRID);
      const base = heightAt(cx, cz) - 0.5;
      const hgt = floors * 3.8;
      const shade = 0.88 + rand() * 0.14;
      const target = isGlass ? glassBuckets[sec] : panelBuckets[sec];

      // Main tower mass
      target.push(boxGeo(w, hgt, d, cx, base + hgt * 0.5, cz, shade, 14));
      // Ground lobby podium / concrete roof parapet
      concBuckets[sec].push(boxGeo(w + 1.2, 3.2, d + 1.2, cx, base + 1.6, cz, 0.85, 10));
      concBuckets[sec].push(boxGeo(w + 0.5, 0.7, d + 0.5, cx, base + hgt + 0.35, cz, 0.82, 10));
      // Rooftop elevator penthouse & HVAC units
      concBuckets[sec].push(boxGeo(w * 0.36, 3.4, d * 0.36, cx + w * 0.12, base + hgt + 1.9, cz - d * 0.1, 0.78, 8));
      if (!isGlass) {
        // Vertical concrete stairwell bay protruding from front facade
        concBuckets[sec].push(boxGeo(3.6, hgt - 1.5, 1.4, cx, base + (hgt - 1.5) * 0.5, cz + d * 0.5 + 0.55, 0.92, 10));
      }

      lowBuckets[sec].push(boxGeo(w, hgt, d, cx, base + hgt * 0.5, cz, isGlass ? 0.5 : 0.75, 14));
      obstacles.push({
        min: new THREE.Vector3(cx - w / 2 - 0.5, base, cz - d / 2 - 0.5),
        max: new THREE.Vector3(cx + w / 2 + 0.5, base + hgt, cz + d / 2 + 0.5),
        kind: 'structure',
      });
      footprints.push({ x0: cx - w / 2 - 5, x1: cx + w / 2 + 5, z0: cz - d / 2 - 5, z1: cz + d / 2 + 5 });
      sBoxes[sec].expandByPoint(tmpP.set(cx - w / 2 - 1, base, cz - d / 2 - 1));
      sBoxes[sec].expandByPoint(tmpP.set(cx + w / 2 + 1, base + hgt + 4, cz + d / 2 + 1));
    };

    const addIndustrialPlant = (cx: number, cz: number, w: number, d: number, hgt: number) => {
      const sec = sectorIndexFor(cx, cz, SIZE / 2, SECTOR_GRID);
      const base = heightAt(cx, cz) - 0.5;
      concBuckets[sec].push(boxGeo(w, hgt, d, cx, base + hgt * 0.5, cz, 0.82, 12));
      // Clerestory sawtooth rooftop monitors
      for (let m = -1; m <= 1; m += 2) {
        glassBuckets[sec].push(boxGeo(w * 0.78, 2.4, d * 0.22, cx, base + hgt + 1.2, cz + m * d * 0.22, 0.9, 10));
      }
      // Tall industrial smokestack beside warehouse
      concBuckets[sec].push(boxGeo(2.8, hgt + 16, 2.8, cx + w * 0.42, base + (hgt + 16) * 0.5, cz - d * 0.35, 0.72, 10));

      lowBuckets[sec].push(boxGeo(w, hgt, d, cx, base + hgt * 0.5, cz, 0.65, 12));
      obstacles.push({
        min: new THREE.Vector3(cx - w / 2, base, cz - d / 2),
        max: new THREE.Vector3(cx + w / 2, base + hgt, cz + d / 2),
        kind: 'structure',
      });
      footprints.push({ x0: cx - w / 2 - 5, x1: cx + w / 2 + 5, z0: cz - d / 2 - 5, z1: cz + d / 2 + 5 });
      sBoxes[sec].expandByPoint(tmpP.set(cx - w / 2, base, cz - d / 2));
      sBoxes[sec].expandByPoint(tmpP.set(cx + w / 2 + 2, base + hgt + 17, cz + d / 2));
    };

    // Populate East District (Residential Panel Blocks + Glass Office Towers) & West District (Industrial Halls)
    for (let gx = -410; gx <= 410; gx += 68) {
      for (let gz = -390; gz <= 390; gz += 68) {
        if (rand() < 0.24) continue;
        const cx = gx + (rand() - 0.5) * 18;
        const cz = gz + (rand() - 0.5) * 18;
        if (cx < -20) {
          const w = 22 + rand() * 14;
          const d = 18 + rand() * 12;
          if (!canPlace(cx, cz, w, d)) continue;
          addIndustrialPlant(cx, cz, w, d, 9 + rand() * 7);
        } else {
          const isGlass = Math.hypot(cx, cz) < 190 && rand() < 0.55;
          const w = isGlass ? 18 + rand() * 8 : 22 + rand() * 12;
          const d = isGlass ? 18 + rand() * 8 : 14 + rand() * 6;
          if (!canPlace(cx, cz, w, d)) continue;
          const floors = isGlass ? 7 + Math.floor(rand() * 5) : 5 + Math.floor(rand() * 4);
          addApartmentOrGlass(cx, cz, w, d, floors, isGlass);
        }
      }
    }

    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const meshes: THREE.Mesh[] = [];
      for (const [buckets, mat] of [
        [panelBuckets, panelMat],
        [glassBuckets, glassMat],
        [concBuckets, concreteMat],
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

  // Hero West-Side Landmarks: Twin Hyperboloid Cooling Towers + Steel Fuel/Grain Silos
  {
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xb0aea6, roughness: 0.9, flatShading: true });
    const siloMat = new THREE.MeshStandardMaterial({ color: 0x9aa2a9, roughness: 0.45, metalness: 0.65 });
    for (const [tx, tz] of [
      [-140, -110],
      [-140, -152],
    ] as const) {
      const ty = heightAt(tx, tz) - 0.5;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 12.5, 22, 14), towerMat);
      lower.position.set(tx, ty + 11, tz);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(10.2, 8.5, 16, 14), towerMat);
      upper.position.set(tx, ty + 30, tz);
      lower.castShadow = upper.castShadow = true;
      root.add(lower, upper);
      obstacles.push({ min: new THREE.Vector3(tx - 12, ty, tz - 12), max: new THREE.Vector3(tx + 12, ty + 38, tz + 12), kind: 'structure' });
    }
    for (const [sx, sz] of [
      [-135, 115],
      [-152, 115],
      [-135, 134],
      [-152, 134],
    ] as const) {
      const sy = heightAt(sx, sz) - 0.5;
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 20, 12), siloMat);
      silo.position.set(sx, sy + 10, sz);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(5.8, 3.2, 12), siloMat);
      cap.position.set(sx, sy + 21.6, sz);
      silo.castShadow = cap.castShadow = true;
      root.add(silo, cap);
      obstacles.push({ min: new THREE.Vector3(sx - 5.6, sy, sz - 5.6), max: new THREE.Vector3(sx + 5.6, sy + 22, sz + 5.6), kind: 'structure' });
    }
  }

  // Colorful Shipping Containers in West Industrial District (tactical tank cover!)
  const containerSectors: InstancedSectorChunk[] = [];
  {
    const contGeo = new THREE.BoxGeometry(2.5, 2.7, 6.2).translate(0, 1.35, 0);
    const contMat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.35, flatShading: true });
    const palette = [new THREE.Color(0xa6332a), new THREE.Color(0x285686), new THREE.Color(0xc78428), new THREE.Color(0x2b6e6a)];
    const buckets: Array<Array<{ m: THREE.Matrix4; c: THREE.Color; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < 48; i++) {
      const x = -80 - rand() * 300;
      const z = (rand() - 0.5) * 620;
      const ri = cityRoadInfo(x, z);
      if (ri.dist < 18) continue;
      if (Math.hypot(x, z) < 75 || Math.abs(z + 425) < 40 || Math.abs(z - 445) < 40) continue;
      if (footprints.some((f) => x > f.x0 - 4 && x < f.x1 + 4 && z > f.z0 - 4 && z < f.z1 + 4)) continue;
      const y = heightAt(x, z);
      const yaw = rand() < 0.5 ? 0 : Math.PI / 2;
      q.setFromAxisAngle(up, yaw);
      m.compose(p.set(x, y, z), q, s);
      const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), c: palette[i % palette.length], x, y, z });
      const hw = yaw === 0 ? 1.3 : 3.15;
      const hd = yaw === 0 ? 3.15 : 1.3;
      obstacles.push({ min: new THREE.Vector3(x - hw, y, z - hd), max: new THREE.Vector3(x + hw, y + 2.75, z + hd), kind: 'structure' });
    }
    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = buckets[sec];
      if (b.length === 0) continue;
      const mesh = new THREE.InstancedMesh(contGeo, contMat, b.length);
      mesh.castShadow = mesh.receiveShadow = true;
      const box = new THREE.Box3();
      for (let i = 0; i < b.length; i++) {
        mesh.setMatrixAt(i, b[i].m);
        mesh.setColorAt(i, b[i].c);
        box.expandByPoint(p.set(b[i].x - 3.5, b[i].y, b[i].z - 3.5));
        box.expandByPoint(p.set(b[i].x + 3.5, b[i].y + 3.0, b[i].z + 3.5));
      }
      mesh.count = b.length;
      mesh.computeBoundingSphere();
      root.add(mesh);
      containerSectors.push({ mesh, box });
    }
  }

  // Modern Cobra-Head Highway Streetlights (Pole + Curved Arm + Lamp Housing)
  const lampSectors: Array<{ pole: THREE.InstancedMesh; bulb: THREE.InstancedMesh; box: THREE.Box3 }> = [];
  {
    const pShaft = new THREE.CylinderGeometry(0.11, 0.2, 8.6, 7).translate(0, 4.3, 0);
    const pArm = new THREE.BoxGeometry(2.6, 0.14, 0.16).translate(1.2, 8.5, 0);
    const poleGeo = mergeGeometries([pShaft, pArm]);
    const bulbGeo = new THREE.BoxGeometry(0.95, 0.18, 0.42).translate(2.35, 8.38, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x5c646d, roughness: 0.48, metalness: 0.7 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3d4, toneMapped: false });

    const buckets: Array<Array<{ m: THREE.Matrix4; x: number; y: number; z: number }>> = Array.from({ length: SECTOR_COUNT }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);

    for (let z = -390; z <= 390; z += 44) {
      if (Math.abs(z) < 62) continue;
      for (const side of [-1, 1]) {
        const lx = side * (EXPWY_HALF + 1.0);
        const ly = heightAt(lx, z);
        q.setFromAxisAngle(up, side > 0 ? Math.PI : 0);
        m.compose(p.set(lx, ly, z), q, s);
        const sec = sectorIndexFor(lx, z, SIZE / 2, SECTOR_GRID);
        buckets[sec].push({ m: m.clone(), x: lx, y: ly, z });
      }
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const lx = Math.cos(a) * (RING_R + RING_HALF + 1.0);
      const lz = Math.sin(a) * (RING_R + RING_HALF + 1.0);
      const ly = heightAt(lx, lz);
      q.setFromAxisAngle(up, -a + Math.PI);
      m.compose(p.set(lx, ly, lz), q, s);
      const sec = sectorIndexFor(lx, lz, SIZE / 2, SECTOR_GRID);
      buckets[sec].push({ m: m.clone(), x: lx, y: ly, z: lz });
    }
    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = buckets[sec];
      if (b.length === 0) continue;
      const pole = new THREE.InstancedMesh(poleGeo, poleMat, b.length);
      const bulb = new THREE.InstancedMesh(bulbGeo, bulbMat, b.length);
      pole.castShadow = true;
      const box = new THREE.Box3();
      for (let i = 0; i < b.length; i++) {
        pole.setMatrixAt(i, b[i].m);
        bulb.setMatrixAt(i, b[i].m);
        box.expandByPoint(p.set(b[i].x - 3, b[i].y, b[i].z - 3));
        box.expandByPoint(p.set(b[i].x + 3, b[i].y + 9.2, b[i].z + 3));
      }
      pole.count = bulb.count = b.length;
      pole.computeBoundingSphere();
      bulb.computeBoundingSphere();
      root.add(pole, bulb);
      lampSectors.push({ pole, bulb, box });
    }
  }

  // Multi-part Parked/Abandoned Modern Civilian Cars (chassis + cabin + windshield + wheels)
  const carItems: Array<{ group: THREE.Group; box: THREE.Box3 }> = [];
  {
    const paintMats = [0xb33b32, 0x3b6088, 0xd4cebe, 0x454c54, 0x3f6e52].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.48, metalness: 0.35 }),
    );
    const glassCarMat = new THREE.MeshStandardMaterial({ color: 0x1e2b36, roughness: 0.25, metalness: 0.55 });
    const tireCarMat = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.92 });
    const bodyGeo = new THREE.BoxGeometry(1.95, 0.72, 4.4);
    const cabGeo = new THREE.BoxGeometry(1.75, 0.58, 2.2);
    const winGeo = new THREE.BoxGeometry(1.78, 0.42, 1.9);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 8).rotateZ(Math.PI / 2);

    for (let i = 0; i < 28; i++) {
      const onExpwy = i < 18;
      const x = onExpwy ? (i % 2 === 0 ? -10.0 : 10.0) : (rand() < 0.5 ? -280 : 280) + (rand() < 0.5 ? -5.8 : 5.8);
      const z = onExpwy ? -385 + i * 44 : (rand() - 0.5) * 680;
      if (Math.hypot(x, z) < 62 || (Math.abs(z + 425) < 28 && Math.abs(x) < 14) || (Math.abs(z - 445) < 28 && Math.abs(x) < 14)) continue;
      const h = heightAt(x, z);
      const grp = new THREE.Group();
      const mat = paintMats[i % paintMats.length];
      const b = new THREE.Mesh(bodyGeo, mat);
      b.position.y = 0.68;
      const cab = new THREE.Mesh(cabGeo, mat);
      cab.position.set(0, 1.28, -0.15);
      const win = new THREE.Mesh(winGeo, glassCarMat);
      win.position.set(0, 1.28, -0.15);
      grp.add(b, cab, win);
      for (const [wx, wz] of [
        [-0.92, 1.35],
        [0.92, 1.35],
        [-0.92, -1.35],
        [0.92, -1.35],
      ]) {
        const w = new THREE.Mesh(wheelGeo, tireCarMat);
        w.position.set(wx, 0.36, wz);
        grp.add(w);
      }
      grp.position.set(x, h, z);
      grp.rotation.y = (rand() - 0.5) * 0.35;
      grp.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      root.add(grp);
      carItems.push({ group: grp, box: new THREE.Box3(new THREE.Vector3(x - 2.5, h, z - 2.5), new THREE.Vector3(x + 2.5, h + 1.8, z + 2.5)) });
      obstacles.push({ min: new THREE.Vector3(x - 1.6, h, z - 2.2), max: new THREE.Vector3(x + 1.6, h + 1.65, z + 2.2), kind: 'structure' });
    }
  }

  // Lush Green Multi-Part Deciduous Park & Boulevard Trees (knockable via createTreeAnimator!)
  const treeSectors: Array<{ trunk: THREE.InstancedMesh; crown: THREE.InstancedMesh; box: THREE.Box3 }> = [];
  const treeStates: TreeInstanceState[] = [];
  let treeAnimator: ReturnType<typeof createTreeAnimator> | null = null;
  {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.34, 3.2, 6).translate(0, 1.6, 0);
    const crownParts = [
      new THREE.IcosahedronGeometry(1.9, 1).translate(0, 4.4, 0),
      new THREE.IcosahedronGeometry(1.45, 1).translate(1.05, 3.9, 0.5),
      new THREE.IcosahedronGeometry(1.4, 1).translate(-0.95, 4.0, -0.45),
    ];
    const crownGeo = mergeGeometries(crownParts);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4430, roughness: 0.95 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x3b6e2e, roughness: 0.85, flatShading: true });

    const treeData: Array<{ m: THREE.Matrix4; sec: number }> = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // Park trees + boulevard trees
    const candidates: Array<[number, number]> = [];
    for (let i = 0; i < 38; i++) {
      const a = (i / 38) * Math.PI * 2 + rand() * 0.25;
      const r = 18 + rand() * 33;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < 6 || Math.abs(z) < 6) continue;
      candidates.push([x, z]);
    }
    for (let z = -390; z <= 390; z += 44) {
      if (Math.abs(z) < 64) continue;
      candidates.push([-17.8, z], [17.8, z]);
    }
    for (let i = 0; i < 40; i++) {
      const x = 60 + rand() * 340;
      const z = (rand() - 0.5) * 720;
      const ri = cityRoadInfo(x, z);
      if (ri.dist < 16) continue;
      if (footprints.some((f) => x > f.x0 - 3 && x < f.x1 + 3 && z > f.z0 - 3 && z < f.z1 + 3)) continue;
      candidates.push([x, z]);
    }

    let tn = 0;
    for (const [x, z] of candidates) {
      if (Math.abs(x) > LIMIT - 12 || Math.abs(z) > LIMIT - 12) continue;
      const ty = heightAt(x, z) - 0.08;
      const sy = 0.85 + rand() * 0.55;
      const yaw = rand() * 6.28;
      q.setFromAxisAngle(up, yaw);
      m.compose(p.set(x, ty, z), q, s.set(sy, sy, sy));
      const sec = sectorIndexFor(x, z, SIZE / 2, SECTOR_GRID);
      treeData.push({ m: m.clone(), sec });
      treeStates.push({
        index: tn,
        x,
        y: ty,
        z,
        baseYaw: yaw,
        sx: sy,
        sy,
        sz: sy,
        trunkRadius: 0.45,
        state: 'standing',
        fallProgress: 0,
        fallDirX: 0,
        fallDirZ: 1,
        tiltAngle: 0,
        targetTilt: 1.46,
      });
      tn++;
    }

    const tBuckets: number[][] = Array.from({ length: SECTOR_COUNT }, () => []);
    for (let i = 0; i < tn; i++) tBuckets[treeData[i].sec].push(i);
    const sectorOfTree = new Uint8Array(tn);
    const localIdxOfTree = new Uint16Array(tn);
    const sectorMeshes: THREE.InstancedMesh[][] = [];

    for (let sec = 0; sec < SECTOR_COUNT; sec++) {
      const b = tBuckets[sec];
      const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, Math.max(1, b.length));
      const crown = new THREE.InstancedMesh(crownGeo, crownMat, Math.max(1, b.length));
      trunk.castShadow = crown.castShadow = true;
      trunk.count = crown.count = b.length;
      const box = new THREE.Box3();
      if (b.length > 0) {
        for (let li = 0; li < b.length; li++) {
          const gi = b[li];
          const tr = treeStates[gi];
          sectorOfTree[gi] = sec;
          localIdxOfTree[gi] = li;
          trunk.setMatrixAt(li, treeData[gi].m);
          crown.setMatrixAt(li, treeData[gi].m);
          box.expandByPoint(p.set(tr.x - 4, tr.y - 1, tr.z - 4));
          box.expandByPoint(p.set(tr.x + 4, tr.y + 7 * tr.sy, tr.z + 4));
        }
        trunk.computeBoundingSphere();
        crown.computeBoundingSphere();
        root.add(trunk, crown);
        treeSectors.push({ trunk, crown, box });
      } else {
        trunk.visible = crown.visible = false;
      }
      sectorMeshes.push([trunk, crown]);
    }

    treeAnimator = createTreeAnimator(treeStates, [], heightAt, {
      sectorOfTree,
      localIdxOfTree,
      sectorMeshes,
    });
  }

  let time = 0;
  const cloudSet = new Set<THREE.Object3D>(clouds);
  for (const child of root.children) {
    if (child !== sky && child !== sun && child !== sun.target && !cloudSet.has(child)) {
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
    treeAnimator?.step(dt);

    for (const c of clouds) {
      c.position.x += 2.2 * dt;
      if (c.position.x > 1700) c.position.x = -1700;
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

      for (const ms of whiteMarkSectors) {
        ms.mesh.visible = vis.isBoxVisible(ms.box) && vis.boxEffectiveDistance(ms.box) <= 220;
      }
      for (const ms of yellowMarkSectors) {
        ms.mesh.visible = vis.isBoxVisible(ms.box) && vis.boxEffectiveDistance(ms.box) <= 220;
      }
      for (const js of medianSectors) {
        js.mesh.visible = vis.isBoxVisible(js.box) && vis.boxEffectiveDistance(js.box) <= 280;
      }

      for (const bs of buildingSectors) {
        const inFrustum = vis.isBoxVisible(bs.box);
        const effDist = vis.boxEffectiveDistance(bs.box);
        const tier = resolveBuildingLod(inFrustum, effDist);
        if (tier === 'high') {
          for (const m of bs.meshes) {
            m.visible = true;
            m.castShadow = effDist < 145;
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

      for (const cs of containerSectors) {
        cs.mesh.visible = vis.isBoxVisible(cs.box) && vis.boxEffectiveDistance(cs.box) <= 320;
      }

      for (const c of carItems) {
        c.group.visible = vis.isBoxVisible(c.box) && vis.boxEffectiveDistance(c.box) <= 320;
      }

      for (const ls of lampSectors) {
        const show = vis.isBoxVisible(ls.box) && vis.boxEffectiveDistance(ls.box) <= 240;
        ls.pole.visible = show;
        ls.bulb.visible = show;
      }

      for (const ts of treeSectors) {
        const inFrustum = vis.isBoxVisible(ts.box);
        const effDist = vis.boxEffectiveDistance(ts.box);
        const tier = resolveTreeLod(inFrustum, effDist);
        const show = tier !== 'culled';
        ts.trunk.visible = show;
        ts.crown.visible = show;
        if (show) {
          ts.trunk.castShadow = effDist < 130;
          ts.crown.castShadow = effDist < 130;
        }
      }
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
    fogColor: 0xb4c6d8,
    fogNear: 175,
    fogFar: 940,
    background: 0xb4c6d8,
    exposure: 1.05,
    grade: { sat: 1.04, tint: [1.01, 1.01, 1.0] },
    spawnPlayer: { x: 0, z: -425, heading: 0 },
    spawnA: (i: number) => ({ x: -72 + i * 48, z: -435, heading: 0 }),
    spawnB: (i: number) => ({ x: -165 + i * 40, z: 445, heading: Math.PI }),
    objectives: [
      { x: -120, z: 0 },
      { x: 0, z: -90 },
      { x: 120, z: 0 },
      { x: 0, z: 90 },
    ],
    objJitter: 10,
  };
}
