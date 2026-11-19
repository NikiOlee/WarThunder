import * as THREE from 'three';
import { resolveHit } from './damage.js';
import { audio } from './audio.js';

export const G = 9.81;
export const DRAG_K = 6e-5;
export const SUBSTEP = 1 / 120;      // fixed physics step: the aim-marker prediction in main.js uses the same one           // quadratic drag coefficient (1/m): ~15 m/s^2 decel at 500 m/s
const MAX_AGE = 12;            // s
const TRAIL_N = 22;
const rnd = (a, b) => a + Math.random() * (b - a);

/* ======================= particles ======================= */
const VERT = `
attribute float aSize; attribute vec4 aColor;
uniform float uScale; varying vec4 vColor;
void main(){
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.001, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
precision mediump float; varying vec4 vColor; uniform float uBoost;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d);
  gl_FragColor = vec4(vColor.rgb * uBoost, vColor.a * a);
}`;

class Pool {
  constructor(scene, max, additive, uniforms) {
    this.max = max; this.next = 0; this.alive = 0;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.col = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: uniforms.uScale, uBoost: { value: additive ? 2.6 : 1 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  add(o) {
    const i = this.next; this.next = (i + 1) % this.max;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.s0[i] = o.s0 ?? 1; this.s1[i] = o.s1 ?? 1; this.size[i] = this.s0[i];
    this.col[i * 4] = o.r ?? 1; this.col[i * 4 + 1] = o.g ?? 1; this.col[i * 4 + 2] = o.b ?? 1; this.col[i * 4 + 3] = 0;
    this.a0[i] = o.a ?? 1; this.drag[i] = o.drag || 0; this.grav[i] = o.grav || 0;
    this.alive++;
  }
  update(dt) {
    if (this.alive <= 0) return;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      alive++;
      const t = 1 - this.life[i] / this.maxLife[i];
      const k = 1 / (1 + this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t) * (1 - t) * Math.min(1, t * 12 + 0.15);
    }
    this.alive = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    this.uniforms = { uScale: { value: 800 } };
    this.glow = new Pool(scene, 700, true, this.uniforms);
    this.smoke = new Pool(scene, 900, false, this.uniforms);
  }
  /** o: {additive,x,y,z,vx,vy,vz,life,s0,s1,r,g,b,a,drag,grav} */
  emit(o) { (o.additive ? this.glow : this.smoke).add(o); }
  setViewScale(px) { this.uniforms.uScale.value = px; }
  update(dt) { this.glow.update(dt); this.smoke.update(dt); }
}

/* ======================= tank hit boxes (tank-local) ======================= */
const BOXES = [
  { part: 'hull', min: new THREE.Vector3(-1.45, 0.05, -3.4), max: new THREE.Vector3(1.45, 1.85, 3.45) },
  { part: 'trackL', min: new THREE.Vector3(1.47, 0.03, -3.5), max: new THREE.Vector3(2.1, 1.08, 3.5) },
  { part: 'trackR', min: new THREE.Vector3(-2.1, 0.03, -3.5), max: new THREE.Vector3(-1.47, 1.08, 3.5) },
  { part: 'turret', min: new THREE.Vector3(-1.2, 1.85, -2.0), max: new THREE.Vector3(1.2, 2.95, 1.55) },
];
const BARREL = { part: 'barrel', min: new THREE.Vector3(-0.17, -0.17, 0.2), max: new THREE.Vector3(0.17, 0.17, 4.85) };   // gun-pivot space
function slab(o, d, len, box) {
  let tmin = 0, tmax = len, ax = -1, sg = 0;
  const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z], mn = [box.min.x, box.min.y, box.min.z], mx = [box.max.x, box.max.y, box.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < mn[i] || oo[i] > mx[i]) return null; continue; }
    let t1 = (mn[i] - oo[i]) / dd[i], t2 = (mx[i] - oo[i]) / dd[i], s = -1;
    if (t1 > t2) { const x = t1; t1 = t2; t2 = x; s = 1; }
    if (t1 > tmin) { tmin = t1; ax = i; sg = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  const n = new THREE.Vector3(0, 1, 0);
  if (ax >= 0) { n.set(0, 0, 0); n.setComponent(ax, sg); }
  return { t: tmin, n };
}

/* ======================= ballistics ======================= */
export class BallisticsSystem {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.fx = new Particles(scene);
    this.projectiles = [];
    this.listeners = [];
    this.tankListeners = [];
    this.targets = [];                 // Tank instances that can be hit
    this._inv = new Map(); this._invGun = new Map();
    this._m = new THREE.Matrix4(); this._q2 = new THREE.Quaternion();

    this.streakGeo = new THREE.BoxGeometry(0.16, 0.16, 1); this.streakGeo.translate(0, 0, -0.5);
    this.coreGeo = new THREE.SphereGeometry(0.28, 8, 6);
    this.streakMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.7, 0.5), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.4), fog: false });

    this.light = new THREE.PointLight(0xffa855, 0, 90, 2);
    scene.add(this.light);
    this.lightT = 0;

    this.decals = []; this.decalNext = 0;
    this.decalGeo = new THREE.CircleGeometry(1, 18);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x090806, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 0, 1);
  }

  /** Subscribe to impacts: fn({point, normal, kind:'ground'|'obstacle', obstacle, velocity, speed, distance, shell}) */
  onImpact(fn) { this.listeners.push(fn); }
  /** Subscribe to tank hits: fn({target, owner, result:'pen'|'crit'|'nopen'|'ricochet', damage, destroyed, point}) */
  onTankHit(fn) { this.tankListeners.push(fn); }
  addTarget(tank) { this.targets.push(tank); }

  _targetHit(p, a, b) {
    const dir = this._v2 || (this._v2 = new THREE.Vector3());
    dir.subVectors(b, a); const len = dir.length(); if (len < 1e-7) return null; dir.multiplyScalar(1 / len);
    let best = null;
    for (const t of this.targets) {
      if (!t.alive || t === p.owner || (p.owner && t.team === p.owner.team)) continue;
      const inv = this._inv.get(t), ig = this._invGun.get(t); if (!inv) continue;
      const la = a.clone().applyMatrix4(inv), lb = b.clone().applyMatrix4(inv);
      const ld = lb.clone().sub(la); const ll = ld.length(); if (ll < 1e-7) continue; ld.multiplyScalar(1 / ll);
      for (const box of BOXES) {
        const r = slab(la, ld, ll, box);
        if (r && (!best || r.t < best.t)) best = { t: r.t, n: r.n, part: box.part, tank: t, ld: ld.clone(), frame: 'root' };
      }
      const ga = a.clone().applyMatrix4(ig), gb = b.clone().applyMatrix4(ig);
      const gd = gb.clone().sub(ga); const gl = gd.length();
      if (gl > 1e-7) {
        gd.multiplyScalar(1 / gl);
        const r = slab(ga, gd, gl, BARREL);
        if (r && (!best || r.t < best.t)) best = { t: r.t, n: r.n, part: 'barrel', tank: t, ld: gd.clone(), frame: 'gun' };
      }
    }
    if (!best) return null;
    const t = best.tank;
    const q = best.frame === 'gun' ? t.gunPivot.getWorldQuaternion(this._q2) : t.root.getWorldQuaternion(this._q2);
    const wn = best.n.clone().applyQuaternion(q);
    const point = new THREE.Vector3().copy(a).addScaledVector(dir, best.t);
    const inv = this._inv.get(t);
    const lp = point.clone().applyMatrix4(inv), ldRoot = dir.clone().transformDirection(inv);
    let zone = best.part;
    if (best.part === 'hull' && lp.z < -1.8) zone = 'fuel';                    // engine bay / fuel tanks at the rear
    return { kind: 'tank', t: best.t, point, normal: wn, ln: best.n, ld: best.ld, part: best.part, zone, lp, ldRoot, tank: t };
  }

  _tankImpact(p, hit) {
    const speed = p.vel.length();
    let r = resolveHit(hit.part, hit.ln, hit.ld, p.shell, speed, hit.zone);
    const t = hit.tank, fx = this.fx, pt = hit.point;
    if (t.god && r.result !== 'ricochet' && r.result !== 'nopen') r = { ...r, result: 'nopen', damage: 0 };
    let destroyed = false;
    const sparks = (n, spd) => {
      for (let i = 0; i < n; i++) fx.emit({ additive: true, x: pt.x, y: pt.y, z: pt.z,
        vx: hit.normal.x * rnd(5, spd) + rnd(-9, 9), vy: hit.normal.y * rnd(5, spd) + rnd(0, 9), vz: hit.normal.z * rnd(5, spd) + rnd(-9, 9),
        life: rnd(0.3, 0.7), s0: 0.3, s1: 0.1, r: 1, g: 0.85, b: 0.5, a: 1, grav: -18 });
    };
    const flash = (sz) => fx.emit({ additive: true, x: pt.x, y: pt.y, z: pt.z, life: 0.14, s0: sz, s1: sz * 0.3, r: 1, g: 0.8, b: 0.45, a: 1 });
    const smoke = (n) => {
      for (let i = 0; i < n; i++) fx.emit({ x: pt.x, y: pt.y, z: pt.z, vx: rnd(-3, 3), vy: rnd(1, 4), vz: rnd(-3, 3),
        life: rnd(0.8, 1.4), s0: 0.7, s1: 2.4, r: 0.4, g: 0.38, b: 0.35, a: 0.5, drag: 1.2 });
    };
    switch (r.result) {
      case 'ricochet': flash(1.6); sparks(10, 20); audio.play('ricochet', pt); break;
      case 'nopen': flash(2.2); smoke(6); audio.play('nopen', pt); break;
      case 'track':
        flash(2); sparks(14, 18); smoke(5); t.hp -= r.damage; t.immobilize(10); audio.play('track', pt); break;
      case 'barrel':
        flash(2); sparks(12, 22); t.hp -= r.damage; t.disableGun(10); audio.play('barrel', pt); break;
      default: {                                                    // pen | crit | fuel
        this._impact(p, { point: pt, normal: hit.normal, kind: 'tank', obstacle: null }, true);
        t.hp -= r.damage;
        audio.play(r.result === 'fuel' ? 'bigexplosion' : 'hitpen', pt);
        if (t.hp <= 0 && t.alive) {
          destroyed = true; t.destroy(r.result === 'crit' || r.result === 'fuel');
          const big = r.result === 'fuel' ? 2 : 1;
          fx.emit({ additive: true, x: pt.x, y: pt.y + 1, z: pt.z, life: 0.5 * big, s0: 6 * big, s1: 18 * big, r: 1, g: 0.6, b: 0.2, a: 1 });
          if (big > 1) for (let i = 0; i < 26; i++) fx.emit({ additive: true, x: pt.x, y: pt.y + 1.5, z: pt.z,
            vx: rnd(-18, 18), vy: rnd(5, 24), vz: rnd(-18, 18), life: rnd(0.6, 1.4), s0: 3.5, s1: 1, r: 1, g: 0.5, b: 0.12, a: 1, drag: 1, grav: -12 });
          if (r.result !== 'fuel') audio.play('bigexplosion', pt);
          this.lightT = 1.6 * big;
        }
      }
    }
    if (p.owner && p.owner.isPlayer) audio.ui('tick');
    for (const fn of this.tankListeners) fn({ target: t, owner: p.owner, result: r.result, damage: r.damage, destroyed, point: pt.clone(),
      zone: hit.zone, part: hit.part, side: r.side || (hit.part === 'trackL' ? 'L' : 'R'), lp: hit.lp.clone(), ld: hit.ldRoot.clone(), detail: r });
    return r.result;
  }

  fire({ pos, dir, speed, caliber = 0.075, type = 'AP', owner = null }) {
    const d = this._v.copy(dir);
    d.x += rnd(-1, 1) * 0.00015; d.y += rnd(-1, 1) * 0.00015; d.z += rnd(-1, 1) * 0.00015; d.normalize();
    const group = new THREE.Group();
    const streak = new THREE.Mesh(this.streakGeo, this.streakMat); streak.scale.z = 9;
    group.add(streak, new THREE.Mesh(this.coreGeo, this.coreMat));
    const tp = new Float32Array(TRAIL_N * 3), tc = new Float32Array(TRAIL_N * 3);
    for (let i = 0; i < TRAIL_N; i++) {
      const f = Math.pow(1 - i / (TRAIL_N - 1), 1.6);
      tc[i * 3] = f; tc[i * 3 + 1] = f * 0.55; tc[i * 3 + 2] = f * 0.18;
      tp[i * 3] = pos.x; tp[i * 3 + 1] = pos.y; tp[i * 3 + 2] = pos.z;
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    trail.frustumCulled = false;
    group.position.copy(pos);
    this.scene.add(group, trail);
    this.projectiles.push({
      pos: pos.clone(), prev: pos.clone(), vel: d.clone().multiplyScalar(speed),
      age: 0, dist: 0, group, trail, trailPos: tp, shell: { type, caliber, muzzleVelocity: speed }, owner,
    });
    this._muzzleFlash(pos, d);
    audio.play('cannon', pos, 1, !!(owner && owner.isPlayer));
  }

  _muzzleFlash(p, d) {
    const fx = this.fx;
    fx.emit({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.09, s0: 3.4, s1: 1.4, r: 1, g: 0.92, b: 0.7, a: 1 });
    for (let i = 0; i < 7; i++) {
      const s = rnd(25, 70);
      fx.emit({ additive: true, x: p.x + d.x, y: p.y + d.y, z: p.z + d.z,
        vx: d.x * s + rnd(-6, 6), vy: d.y * s + rnd(-6, 6), vz: d.z * s + rnd(-6, 6),
        life: rnd(0.07, 0.16), s0: 1.3, s1: 0.3, r: 1, g: 0.7, b: 0.3, a: 0.95, drag: 4 });
    }
    for (let i = 0; i < 12; i++) {
      const s = rnd(4, 15);
      fx.emit({ x: p.x + d.x * 0.5, y: p.y + d.y * 0.5, z: p.z + d.z * 0.5,
        vx: d.x * s + rnd(-2, 2), vy: d.y * s + rnd(-1, 3), vz: d.z * s + rnd(-2, 2),
        life: rnd(1.4, 2.8), s0: 0.9, s1: rnd(3, 5.5), r: 0.72, g: 0.7, b: 0.66, a: 0.42, drag: 1.4, grav: 0.4 });
    }
    this.light.position.copy(p).addScaledVector(d, 2.5);
    this.lightT = 1;
  }

  _impact(p, hit, silent) {
    const fx = this.fx, pt = hit.point, n = hit.normal;
    const ground = hit.kind === 'ground';
    const dust = ground ? [0.46, 0.4, 0.3] : [0.62, 0.61, 0.58];
    const dirt = ground ? [0.3, 0.23, 0.15] : [0.5, 0.48, 0.44];
    const sc = Math.max(1, p.shell.caliber / 0.075);

    fx.emit({ additive: true, x: pt.x, y: pt.y + 0.3, z: pt.z, life: 0.22, s0: 3 * sc, s1: 9 * sc, r: 1, g: 0.72, b: 0.35, a: 1 });
    for (let i = 0; i < 8; i++) {
      fx.emit({ additive: true, x: pt.x + n.x, y: pt.y + n.y, z: pt.z + n.z,
        vx: n.x * rnd(4, 11) + rnd(-6, 6), vy: n.y * rnd(4, 11) + rnd(0, 5), vz: n.z * rnd(4, 11) + rnd(-6, 6),
        life: rnd(0.25, 0.5), s0: 2.2 * sc, s1: 0.5, r: 1, g: 0.5, b: 0.15, a: 0.9, drag: 3 });
    }
    for (let i = 0; i < 12; i++) {
      fx.emit({ additive: true, x: pt.x, y: pt.y + 0.2, z: pt.z,
        vx: n.x * rnd(8, 22) + rnd(-12, 12), vy: n.y * rnd(8, 22) + rnd(2, 14), vz: n.z * rnd(8, 22) + rnd(-12, 12),
        life: rnd(0.4, 0.9), s0: 0.35, s1: 0.1, r: 1, g: 0.85, b: 0.45, a: 1, grav: -20 });
    }
    for (let i = 0; i < 16; i++) {
      fx.emit({ x: pt.x, y: pt.y + 0.3, z: pt.z,
        vx: n.x * rnd(6, 16) + rnd(-7, 7), vy: n.y * rnd(6, 16) + rnd(3, 13), vz: n.z * rnd(6, 16) + rnd(-7, 7),
        life: rnd(0.9, 1.7), s0: 0.9, s1: 0.5, r: dirt[0], g: dirt[1], b: dirt[2], a: 0.95, drag: 0.4, grav: -17 });
    }
    for (let i = 0; i < 11; i++) {
      fx.emit({ x: pt.x + rnd(-1, 1), y: pt.y + 0.6, z: pt.z + rnd(-1, 1),
        vx: n.x * rnd(1, 4) + rnd(-3, 3), vy: n.y * rnd(1, 4) + rnd(0.5, 3), vz: n.z * rnd(1, 4) + rnd(-3, 3),
        life: rnd(2, 3.8), s0: 3 * sc, s1: rnd(9, 13) * sc, r: dust[0], g: dust[1], b: dust[2], a: 0.55, drag: 1.1, grav: 0.35 });
    }

    if (ground) this._decal(pt, n, 2.2 * sc);
    if (!silent) audio.play('explosion', pt, 0.8);
    this.light.position.copy(pt).addScaledVector(n, 2.5);
    this.lightT = 1;

    const info = { point: pt.clone(), normal: n.clone(), kind: hit.kind, obstacle: hit.obstacle,
      velocity: p.vel.clone(), speed: p.vel.length(), distance: p.dist, shell: p.shell };
    if (!silent) for (const fn of this.listeners) fn(info);
  }

  _decal(pt, n, r) {
    let m = this.decals[this.decalNext];
    if (!m) { m = new THREE.Mesh(this.decalGeo, this.decalMat); this.scene.add(m); this.decals[this.decalNext] = m; }
    this.decalNext = (this.decalNext + 1) % 28;
    m.position.copy(pt).addScaledVector(n, 0.12);
    m.quaternion.setFromUnitVectors(this._up, n);
    m.scale.set(r, r, r);
  }

  setWorld(w) {
    this.world = w; this.clear();
    for (const m of this.decals) if (m) this.scene.remove(m);
    this.decals = []; this.decalNext = 0;
  }

  clear() { for (let i = this.projectiles.length - 1; i >= 0; i--) this._remove(i); }

  _remove(i) {
    const p = this.projectiles[i];
    this.scene.remove(p.group, p.trail);
    p.trail.geometry.dispose();
    this.projectiles.splice(i, 1);
  }

  update(dt) {
    this.fx.update(dt);
    if (this.lightT > 0) { this.lightT = Math.max(0, this.lightT - dt * 7); this.light.intensity = 160 * this.lightT * this.lightT; }
    const lim = this.world.size * 0.6;
    for (const t of this.targets) { t.root.updateMatrixWorld(true); this._inv.set(t, new THREE.Matrix4().copy(t.root.matrixWorld).invert()); this._invGun.set(t, new THREE.Matrix4().copy(t.gunPivot.matrixWorld).invert()); }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      let hit = null;
      p.acc = (p.acc || 0) + dt;
      while (p.acc >= SUBSTEP && !hit) {
        const h = SUBSTEP; p.acc -= h;
        p.prev.copy(p.pos);
        const sp = p.vel.length();
        p.vel.multiplyScalar(Math.max(0, 1 - DRAG_K * sp * h));
        p.vel.y -= G * h;
        p.pos.addScaledVector(p.vel, h);
        p.age += h; p.dist += sp * h;
        hit = this.world.segmentHit(p.prev, p.pos);
        const th = this._targetHit(p, p.prev, p.pos);
        if (th && (!hit || th.t < hit.t)) hit = th;
      }
      if (hit && hit.kind === 'tank') {
        const res = this._tankImpact(p, hit);
        if (res === 'ricochet') {                                   // bounce and keep flying
          const n = hit.normal, d = p.vel.dot(n);
          p.vel.addScaledVector(n, -2 * d).multiplyScalar(0.5);
          p.vel.x += rnd(-8, 8); p.vel.z += rnd(-8, 8);
          p.pos.copy(hit.point).addScaledVector(n, 0.3); p.prev.copy(p.pos);
          hit = null;
        } else { this._remove(i); continue; }
      }
      if (hit) { this._impact(p, hit); this._remove(i); continue; }
      if (p.age > MAX_AGE || Math.abs(p.pos.x) > lim || Math.abs(p.pos.z) > lim || p.pos.y < -80) { this._remove(i); continue; }

      if (!p.snapped && audio.cam && p.owner && !p.owner.isPlayer && p.pos.distanceToSquared(audio.cam.position) < 400) { p.snapped = true; audio.play('snap', p.pos, 1); }
      p.group.position.copy(p.pos);
      p.group.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
      p.group.children[0].scale.z = Math.min(14, 4 + p.vel.length() * 0.012);
      const tp = p.trailPos;
      tp.copyWithin(3, 0, (TRAIL_N - 1) * 3);
      tp[0] = p.pos.x; tp[1] = p.pos.y; tp[2] = p.pos.z;
      p.trail.geometry.attributes.position.needsUpdate = true;
    }
  }
}
