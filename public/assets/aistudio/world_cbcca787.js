import * as THREE from 'three';

export const WORLD_SIZE = 1000;
export const WORLD_LIMIT = 480;            // hard drive limit (m from origin on each axis)
export const SPAWN = { x: 0, z: -420 };

const SPAWN_H = 3;
const TOWN = { x: 90, z: 300 };
const FLAT = [
  { x: SPAWN.x, z: SPAWN.z, r0: 45, r1: 110, h: SPAWN_H },
  { x: TOWN.x, z: TOWN.z, r0: 80, r1: 150, h: 6 },
];

/* ---------- deterministic noise ---------- */
export function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = fade(fx), v = fade(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- height field ---------- */
export function heightAt(x, z) {
  let h = (fbm(x * 0.0032 + 11.3, z * 0.0032 + 7.7, 5) - 0.5) * 2 * 34;
  const r = 1 - Math.abs(fbm(x * 0.0055 + 3.1, z * 0.0055 + 19.4, 3) * 2 - 1);
  h += r * r * 20 - 6;
  h += (fbm(x * 0.045, z * 0.045, 2) - 0.5) * 2.2;
  h += smooth(380, 500, Math.max(Math.abs(x), Math.abs(z))) * 70;      // boundary ridge
  for (const f of FLAT) {
    const m = smooth(f.r0, f.r1, Math.hypot(x - f.x, z - f.z));
    h = f.h + (h - f.h) * m;
  }
  return h;
}

export function normalAt(x, z, out = new THREE.Vector3()) {
  const e = 1.5;
  out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e));
  return out.normalize();
}

/* ---------- ray / segment vs axis-aligned box ---------- */
const AXES = ['x', 'y', 'z'];
function rayBox(o, d, len, box) {
  let tmin = 0, tmax = len, nAxis = null, nSign = 0;
  for (let i = 0; i < 3; i++) {
    const k = AXES[i];
    const oo = o[k], dd = d[k];
    if (Math.abs(dd) < 1e-9) {
      if (oo < box.min[k] || oo > box.max[k]) return null;
      continue;
    }
    let t1 = (box.min[k] - oo) / dd, t2 = (box.max[k] - oo) / dd, sign = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = k; nSign = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  const n = new THREE.Vector3(0, 1, 0);
  if (nAxis) { n.set(0, 0, 0); n[nAxis] = nSign; }
  return { t: tmin, normal: n };
}

/* ---------- canvas helpers ---------- */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function grainTexture() {
  const c = makeCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
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
function boardTexture(label) {
  const c = makeCanvas(256, 128), g = c.getContext('2d');
  g.fillStyle = '#f2f0e6'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#c4261d';
  for (let i = 0; i < 8; i++) if (i % 2 === 0) g.fillRect(i * 32, 0, 32, 18);
  for (let i = 0; i < 8; i++) if (i % 2 === 1) g.fillRect(i * 32, 110, 32, 18);
  g.fillStyle = '#1a1a1a'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- collision queries shared by every map (uniform grid over obstacles) ---------- */
export function makeQueries(obstacles, heightAt, normalAt) {
  const _dir = new THREE.Vector3(), _p = new THREE.Vector3();
  const CELL = 24, grid = new Map(), out = [];
  let builtCount = -1, stamp = 0;
  const key = (cx, cz) => (cx + 512) * 1024 + (cz + 512);

  function build() {
    grid.clear();
    for (const o of obstacles) {
      o._s = 0;
      const x0 = Math.floor(o.min.x / CELL), x1 = Math.floor(o.max.x / CELL), z0 = Math.floor(o.min.z / CELL), z1 = Math.floor(o.max.z / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(o);
      }
    }
    builtCount = obstacles.length;
  }
  /** Obstacles whose cells overlap the world rectangle. The returned array is reused: consume it immediately. */
  function near(x0, z0, x1, z1) {
    if (builtCount !== obstacles.length) build();
    stamp++; out.length = 0;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const a = grid.get(key(cx, cz)); if (!a) continue;
      for (const o of a) if (o._s !== stamp) { o._s = stamp; out.push(o); }
    }
    return out;
  }

  function segmentTerrain(a, dir, len, step) {
    if (a.y > 140 && a.y + dir.y * len > 140) return null;
    if (a.y <= heightAt(a.x, a.z)) return 0;
    let prevT = 0;
    for (let t = step; ; t += step) {
      const tt = Math.min(t, len);
      const x = a.x + dir.x * tt, y = a.y + dir.y * tt, z = a.z + dir.z * tt;
      if (y <= heightAt(x, z)) {
        let lo = prevT, hi = tt;
        for (let i = 0; i < 9; i++) {
          const mid = (lo + hi) * 0.5;
          if (a.y + dir.y * mid <= heightAt(a.x + dir.x * mid, a.z + dir.z * mid)) hi = mid; else lo = mid;
        }
        return hi;
      }
      prevT = tt;
      if (tt >= len) return null;
    }
  }

  /** First hit along segment a->b: {point, normal, kind:'ground'|'obstacle', obstacle, t} or null. */
  function segmentHit(a, b, step = 1.2) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-7) return null;
    _dir.multiplyScalar(1 / len);
    let best = null;
    const cand = near(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z));
    for (const o of cand) {
      const r = rayBox(a, _dir, len, o);
      if (r && (!best || r.t < best.t)) best = { t: r.t, normal: r.normal, kind: 'obstacle', obstacle: o };
    }
    const tt = segmentTerrain(a, _dir, best ? best.t : len, step);
    if (tt !== null) {
      _p.copy(a).addScaledVector(_dir, tt);
      best = { t: tt, normal: normalAt(_p.x, _p.z), kind: 'ground', obstacle: null };
    }
    if (!best) return null;
    best.point = new THREE.Vector3().copy(a).addScaledVector(_dir, best.t);
    return best;
  }

  /** Long ray (aim ray). Returns hit with .dist or null. */
  function raycast(origin, dir, maxDist = 2500) {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let t0 = 0; t0 < maxDist; t0 += 64) {
      a.copy(origin).addScaledVector(dir, t0);
      b.copy(origin).addScaledVector(dir, Math.min(t0 + 64, maxDist));
      const h = segmentHit(a, b, t0 < 300 ? 2 : 5);
      if (h) { h.dist = t0 + h.t; return h; }
    }
    return null;
  }

  return { segmentHit, raycast, nearby: (x, z, r) => near(x - r, z - r, x + r, z + r) };
}

/* =====================================================================
   createWorld
   ===================================================================== */
export function createWorld(scene) {
  const root = new THREE.Group(); scene.add(root);
  const obstacles = [];          // {min:Vector3, max:Vector3, mesh}
  const rand = mulberry32(1337);

  /* ----- lights & sky ----- */
  const sunDir = new THREE.Vector3(0.55, 0.62, 0.38).normalize();
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 450;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  root.add(sun, sun.target);
  root.add(new THREE.HemisphereLight(0xb7d3f0, 0x55603a, 0.85));

  const skyUniforms = { sunDir: { value: sunDir } };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir;
      void main(){
        vec3 d = normalize(vP); float h = max(d.y, 0.0);
        vec3 horizon = vec3(0.80, 0.86, 0.91), mid = vec3(0.42, 0.62, 0.86), top = vec3(0.16, 0.38, 0.74);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
        col = mix(col, top, smoothstep(0.2, 0.9, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.82, 0.55) * (pow(s, 6.0) * 0.28 + pow(s, 64.0) * 0.5);
        col += vec3(1.0, 0.95, 0.8) * pow(s, 1800.0) * 14.0;
        col = mix(col, vec3(0.62, 0.66, 0.6), smoothstep(0.0, -0.15, d.y) * 0.9);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Group();
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), skyMat);
  sky.add(skyMesh);
  root.add(sky);

  /* image-based lighting from the sky shader */
  function createEnvironment(renderer) {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0.02).texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  /* ----- clouds ----- */
  const clouds = [];
  {
    const c = makeCanvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(240,244,250,0.5)'); gr.addColorStop(1, 'rgba(235,240,248,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
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
      root.add(grp); clouds.push(grp);
    }
  }

  /* ----- terrain ----- */
  const SEG = 200;
  const tGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  {
    const pos = tGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const grassLow = new THREE.Color(0x45652a), grassHigh = new THREE.Color(0x788a3a);
    const dry = new THREE.Color(0x9b8c4e), rock = new THREE.Color(0x77736a), dirt = new THREE.Color(0x7c6849);
    const c = new THREE.Color(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      normalAt(x, z, n);
      const slope = 1 - n.y;
      c.copy(grassLow).lerp(grassHigh, smooth(0, 30, h));
      c.lerp(dry, fbm(x * 0.02 + 40, z * 0.02 + 9, 3) * 0.7);
      c.lerp(rock, Math.max(smooth(0.16, 0.38, slope), smooth(48, 75, h)));
      const dT = Math.hypot(x - TOWN.x, z - TOWN.z), dS = Math.hypot(x - SPAWN.x, z - SPAWN.z);
      c.lerp(dirt, Math.max(0, 1 - dT / 70) * 0.75 + Math.max(0, 1 - dS / 55) * 0.55);
      const j = 0.9 + hash2(i, 77) * 0.2;
      col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = tGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 140, uv.getY(i) * 140);
    tGeo.computeVertexNormals();
  }
  const grain = grainTexture();
  const terrain = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, map: grain, bumpMap: grain, bumpScale: 2.2, flatShading: true, roughness: 1, metalness: 0,
  }));
  terrain.receiveShadow = true;
  root.add(terrain);

  /* ----- obstacle helper ----- */
  function addBox(minX, minY, minZ, maxX, maxY, maxZ, material, shadows = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ), material);
    mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    root.add(mesh);
    const o = { min: new THREE.Vector3(minX, minY, minZ), max: new THREE.Vector3(maxX, maxY, maxZ), mesh };
    obstacles.push(o);
    return o;
  }

  /* ----- town ----- */
  const wallColors = [0xcdbd96, 0xb8b4a6, 0xd9d2bd, 0xa89a7c, 0xc2a88a];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a3b2a, roughness: 0.9, flatShading: true });
  const roofGeo = new THREE.ConeGeometry(1, 1, 4); roofGeo.rotateY(Math.PI / 4);
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      if (gx === 0 || rand() < 0.28) continue;
      const cx = TOWN.x + gx * 30 + (rand() - 0.5) * 6, cz = TOWN.z + gz * 30 + (rand() - 0.5) * 6;
      const w = 10 + rand() * 8, d = 10 + rand() * 6, hgt = 6 + rand() * 5;
      let lo = 1e9, hi = -1e9;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
        const hh = heightAt(cx + sx * w / 2, cz + sz * d / 2);
        lo = Math.min(lo, hh); hi = Math.max(hi, hh);
      }
      const mat = new THREE.MeshStandardMaterial({ color: wallColors[Math.floor(rand() * wallColors.length)], roughness: 0.95, flatShading: true });
      const top = hi + hgt;
      addBox(cx - w / 2, lo - 1.5, cz - d / 2, cx + w / 2, top, cz + d / 2, mat);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.scale.set(w * 0.78, 3.2, d * 0.78);
      roof.position.set(cx, top + 1.6, cz);
      roof.castShadow = true;
      root.add(roof);
    }
  }

  /* ----- cover blocks (concrete barriers) ----- */
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8d8c86, roughness: 1, flatShading: true });
  let placed = 0, tries = 0;
  while (placed < 16 && tries++ < 400) {
    const x = (rand() - 0.5) * 520, z = -330 + rand() * 520;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 90 || Math.abs(x) < 14) continue;
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < 95) continue;
    const long = rand() < 0.5, w = long ? 8 : 3, d = long ? 3 : 8, hgt = 2.6;
    const hh = Math.max(heightAt(x - w / 2, z - d / 2), heightAt(x + w / 2, z + d / 2), heightAt(x - w / 2, z + d / 2), heightAt(x + w / 2, z - d / 2));
    addBox(x - w / 2, hh - 2, z - d / 2, x + w / 2, hh + hgt, z + d / 2, concrete);
    placed++;
  }

  /* ----- range boards (calibration targets on the spawn corridor) ----- */
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  for (const dist of [150, 300, 500, 700]) {
    const z = SPAWN.z + dist, x = 0;
    const hh = Math.max(heightAt(x - 3, z), heightAt(x + 3, z)) + 0.2;
    const faceMat = new THREE.MeshStandardMaterial({ map: boardTexture(dist + ' m'), roughness: 0.9 });
    const plain = new THREE.MeshStandardMaterial({ color: 0xdedbcd, roughness: 0.9 });
    const mats = [plain, plain, plain, plain, faceMat, faceMat];      // +z and -z faces carry the label
    const o = addBox(x - 3, hh + 1.2, z - 0.2, x + 3, hh + 4.4, z + 0.2, mats);
    for (const px of [-2.2, 2.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), postMat);
      post.position.set(px, hh + 1.2, z); post.castShadow = true;
      post.position.y = hh + 0.8;
      root.add(post);
    }
    o.mesh.userData.range = dist;
  }

  /* ----- trees (instanced) ----- */
  {
    const crownGeo = new THREE.ConeGeometry(2.1, 7.5, 7); crownGeo.translate(0, 5.2, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.2, 5); trunkGeo.translate(0, 1.1, 0);
    const N = 520;
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), N);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4f3a26, roughness: 1 }), N);
    crowns.castShadow = trunks.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color(), n = new THREE.Vector3();
    let count = 0, att = 0;
    while (count < N && att++ < 6000) {
      const x = (rand() - 0.5) * 900, z = (rand() - 0.5) * 900;
      if (Math.abs(x) < 22 && z < 300) continue;                      // keep firing corridor clear
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 70 || Math.hypot(x - TOWN.x, z - TOWN.z) < 105) continue;
      const h = heightAt(x, z);
      if (h > 42) continue;
      normalAt(x, z, n);
      if (n.y < 0.9) continue;
      if (fbm(x * 0.012 + 5, z * 0.012 + 2, 3) < 0.42) continue;       // clustered forests
      const sc2 = 0.8 + rand() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      m.compose(p.set(x, h - 0.2, z), q, s.set(sc2, sc2 * (0.9 + rand() * 0.4), sc2));
      crowns.setMatrixAt(count, m); trunks.setMatrixAt(count, m);
      col.setHSL(0.27 + rand() * 0.05, 0.45, 0.2 + rand() * 0.08);
      crowns.setColorAt(count, col);
      count++;
    }
    crowns.count = trunks.count = count;
    root.add(crowns, trunks);
  }

  /* ----- grass tufts (wind-swayed, instanced) + rocks ----- */
  const timeU = { value: 0 };
  let grassRef = null, grassTotal = 0;
  {
    const blade = new THREE.BufferGeometry();
    const P = [], C = [];
    const quad = (ang) => {
      const cx = Math.cos(ang) * 0.32, cz = Math.sin(ang) * 0.32;
      const v = [[-cx, 0, -cz], [cx, 0, cz], [cx * 0.25, 1, cz * 0.25], [-cx * 0.25, 1, -cz * 0.25]];
      for (const i of [0, 1, 2, 0, 2, 3]) { P.push(...v[i]); const k = v[i][1]; C.push(0.5 + 0.5 * k, 0.65 + 0.35 * k, 0.45 + 0.1 * k); }
    };
    quad(0); quad(Math.PI / 3); quad(-Math.PI / 3);
    blade.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    blade.computeVertexNormals();
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
    gm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
          vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.);
          transformed.x += sin(uTime*1.7 + ip.x*0.35 + ip.z*0.21) * 0.22 * position.y;
          transformed.z += cos(uTime*1.3 + ip.z*0.31) * 0.14 * position.y;`);
    };
    const N = 26000;
    const grassMesh = new THREE.InstancedMesh(blade, gm, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color(), n = new THREE.Vector3();
    let count = 0, att = 0;
    while (count < N && att++ < 90000) {
      const x = (rand() - 0.5) * 920, z = (rand() - 0.5) * 920;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 40) continue;
      const h = heightAt(x, z);
      if (h > 40) continue;
      normalAt(x, z, n);
      if (n.y < 0.86) continue;
      const hs = 0.7 + rand() * 0.9;
      q.setFromAxisAngle(up, rand() * 6.28);
      m.compose(p.set(x, h - 0.05, z), q, sc3.set(hs * 1.3, hs, hs * 1.3));
      grassMesh.setMatrixAt(count, m);
      col.setHSL(0.22 + rand() * 0.07, 0.5, 0.42 + rand() * 0.18);
      grassMesh.setColorAt(count, col);
      count++;
    }
    grassMesh.count = count; grassRef = grassMesh; grassTotal = count;
    root.add(grassMesh);

    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const R = 140;
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 1, flatShading: true }), R);
    rocks.castShadow = true; rocks.receiveShadow = true;
    let rc = 0; att = 0;
    while (rc < R && att++ < 5000) {
      const x = (rand() - 0.5) * 900, z = (rand() - 0.5) * 900;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 60 || Math.abs(x) < 8 || Math.hypot(x - TOWN.x, z - TOWN.z) < 90) continue;
      const s0 = 0.8 + rand() * rand() * 4.5;
      q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 6, rand() * 3));
      m.compose(p.set(x, heightAt(x, z) + s0 * 0.25, z), q, sc3.set(s0 * 1.3, s0 * 0.8, s0));
      rocks.setMatrixAt(rc, m);
      rocks.setColorAt(rc, col.setHSL(0.1, 0.06, 0.38 + rand() * 0.18));
      rc++;
    }
    rocks.count = rc;
    root.add(rocks);
  }

  const q = makeQueries(obstacles, heightAt, normalAt);

  function update(camPos, focus, dt = 0.016) {
    sky.position.copy(camPos);
    timeU.value += dt;
    for (const c of clouds) { c.position.x += 3 * dt; if (c.position.x > 1700) c.position.x = -1700; }
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDir, 220);
    sun.target.updateMatrixWorld();
  }

  function setGrass(density) { if (!grassRef) return; grassRef.visible = density > 0; grassRef.count = Math.floor(grassTotal * density); }
  function dispose() {
    scene.remove(root);
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    if (sun.shadow.map) sun.shadow.map.dispose();
  }

  return {
    id: 'hills', name: 'Холмы', setGrass, size: WORLD_SIZE, limit: WORLD_LIMIT, heightAt, normalAt, obstacles,
    segmentHit: q.segmentHit, raycast: q.raycast, nearby: q.nearby, update, sun, terrain, createEnvironment, dispose,
    fogColor: 0xcbd8e2, fogNear: 450, fogFar: 2600, background: 0xd2dde6, exposure: 1, grade: { sat: 1.08, tint: [1, 1, 1] },
    spawnPlayer: { x: SPAWN.x, z: SPAWN.z, heading: 0 },
    spawnA: (i) => ({ x: -70 + i * 45, z: -432, heading: 0 }),
    spawnB: (i) => ({ x: -170 + i * 38, z: 330, heading: Math.PI }),
    objectives: [{ x: -140, z: -90 }, { x: -10, z: 20 }, { x: 120, z: 150 }], objJitter: 30,
  };
}
