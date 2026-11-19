import * as THREE from 'three';

const DEG = Math.PI / 180;
const wrapPi = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Extrude a side profile [[z,y],...] across the X axis, centred on x=0. */
function prism(points, width) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

function camoTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#56633a'; g.fillRect(0, 0, 128, 128);
  const cols = ['#3b4727', '#7a7a4c', '#2f3a20', '#6b6f3f'];
  for (let i = 0; i < 26; i++) {
    g.fillStyle = cols[i % cols.length];
    g.beginPath();
    g.ellipse(Math.random() * 128, Math.random() * 128, 8 + Math.random() * 20, 5 + Math.random() * 12, Math.random() * 3, 0, 6.283);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.35, 0.35);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function treadTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#26261f'; g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#44443a'; g.fillRect(0, 0, 40, 32);      // lighter link plate
  g.fillStyle = '#15150f'; g.fillRect(40, 0, 3, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Tank {
  constructor(scene, world, opts = {}) {
    this.world = world;
    this.team = opts.team || 'A';
    this.name = opts.name || 'Tank';
    this.tint = opts.tint || [1, 1, 1];
    this.alive = true; this.hp = 100; this.maxHp = 100;
    this.immobT = 0; this.gunDownT = 0; this.god = false;
    this._burn = 0; this._turretLift = 0; this._turretVel = 0; this._wreckTilt = 0; this._smokeAcc = 0;
    this.stats = {
      maxSpeed: 15.5,            // m/s forward (~56 km/h)
      maxReverse: 5.5,
      traverseRate: 24 * DEG,    // turret rad/s
      elevRate: 14 * DEG,        // gun rad/s
      elevMin: -8 * DEG,
      elevMax: 20 * DEG,
      reload: 4.5,               // s
      muzzleVelocity: 500,       // m/s
      caliber: 0.075,
    };

    // drive state
    this.heading = opts.heading || 0;          // rad, +Y rotation (turns toward +X = left)
    this.speed = 0;                            // signed m/s along hull forward
    this.yawRate = 0;                          // rad/s (+ = left)
    this.accel = 0;
    this.slope = 0;
    this._pitchUp = 0;                         // smoothed hull nose-up angle
    this._rollLeftUp = 0;                      // smoothed hull left-side-up angle
    this._springX = 0; this._springV = 0;
    this._dust = 0;

    // turret / gun state (local to hull)
    this.turretYaw = 0;
    this.gunElev = 0;
    this.reloadTimer = 0;
    this.recoil = 0;

    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);
    this._build();

    this.root.position.set(opts.x || 0, 0, opts.z || 0);
    this._sampleGround(0, true);
    this._applyPose();
    this.root.updateMatrixWorld(true);
  }

  /* ------------------------------------------------------------------ */
  _build() {
    const camo = camoTexture();
    const hullMat = new THREE.MeshStandardMaterial({ map: camo, roughness: 0.8, metalness: 0.2, flatShading: true });
    hullMat.color.setRGB(this.tint[0], this.tint[1], this.tint[2]);
    this.hullMat = hullMat;
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2d24, roughness: 0.9, metalness: 0.3, flatShading: true });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3c36, roughness: 0.5, metalness: 0.7 });

    this.hullGroup = new THREE.Group();
    this.root.add(this.hullGroup);

    // hull body
    const hull = new THREE.Mesh(prism([[-3.2, 0.55], [3.1, 0.55], [3.5, 1.1], [2.3, 1.8], [-2.6, 1.8], [-3.2, 1.4]], 2.9), hullMat);
    this.hullGroup.add(hull);

    // engine deck, hatches, lights, exhaust
    const add = (geo, mat, x, y, z, parent = this.hullGroup) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    add(new THREE.BoxGeometry(2.1, 0.1, 1.5), darkMat, 0, 1.83, -1.9);
    add(new THREE.BoxGeometry(0.7, 0.12, 0.55), darkMat, -0.65, 1.86, 2.0);
    add(new THREE.BoxGeometry(0.25, 0.2, 0.2), metalMat, 1.1, 1.55, 3.0);
    add(new THREE.BoxGeometry(0.25, 0.2, 0.2), metalMat, -1.1, 1.55, 3.0);
    for (const sx of [-1, 1]) {
      const ex = add(new THREE.CylinderGeometry(0.1, 0.12, 0.9, 8), metalMat, sx * 1.0, 1.3, -3.2);
      ex.rotation.x = Math.PI / 2;
    }
    // side skirts
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.55, 5.8), hullMat, sx * 2.2, 1.12, -0.2);

    // tracks + wheels
    this.tracks = [];
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.8, 10); wheelGeo.rotateZ(Math.PI / 2);
    const barGeo = new THREE.BoxGeometry(0.84, 0.1, 0.5);
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.86, 8); hubGeo.rotateZ(Math.PI / 2);
    for (const sx of [1, -1]) {                    // +X is the tank's left side
      const tex = treadTexture();
      const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
      const mats = [side, side, darkMat, darkMat, darkMat, darkMat];
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.04, 7.0), mats);
      track.position.set(sx * 1.78, 0.54, 0);
      this.hullGroup.add(track);
      this.tracks.push({ tex, sign: sx, wheels: [] });
      const wz = [-3.0, -1.85, -0.75, 0.35, 1.45, 2.55];
      for (const z of wz) {
        const w = new THREE.Mesh(wheelGeo, metalMat); w.position.set(sx * 1.78, 0.48, z);
        const bar = new THREE.Mesh(barGeo, darkMat); w.add(bar);
        w.add(new THREE.Mesh(hubGeo, darkMat));
        this.hullGroup.add(w);
        this.wheels.push({ mesh: w, side: sx });
      }
    }

    // turret
    this.turretGroup = new THREE.Group();
    this.turretGroup.position.set(0, 1.8, -0.15);
    this.hullGroup.add(this.turretGroup);
    const tg = this.turretGroup;
    tg.add(new THREE.Mesh(prism([[-1.7, 0], [1.0, 0], [1.45, 0.35], [1.45, 0.85], [0.8, 1.1], [-1.2, 1.1], [-1.95, 0.65], [-1.95, 0.3]], 2.3), hullMat));
    add(new THREE.CylinderGeometry(1.15, 1.15, 0.12, 14), darkMat, 0, 0.02, 0, tg);
    add(new THREE.CylinderGeometry(0.36, 0.4, 0.34, 10), hullMat, -0.55, 1.25, -0.55, tg);       // cupola
    add(new THREE.BoxGeometry(0.06, 0.06, 0.6), metalMat, -0.55, 1.48, -0.2, tg);                // MG
    add(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 4), metalMat, 0.85, 2.3, -1.6, tg);           // antenna
    add(new THREE.BoxGeometry(1.2, 0.78, 0.5), hullMat, 0, 0.62, 1.62, tg);                        // mantlet

    // gun
    this.gunPivot = new THREE.Group();
    this.gunPivot.position.set(0, 0.62, 1.75);
    tg.add(this.gunPivot);
    this.barrelGroup = new THREE.Group();
    this.gunPivot.add(this.barrelGroup);
    const barrelGeo = new THREE.CylinderGeometry(0.095, 0.105, 4.0, 12); barrelGeo.rotateX(Math.PI / 2);
    add(barrelGeo, metalMat, 0, 0, 2.3, this.barrelGroup);
    const sleeve = new THREE.CylinderGeometry(0.17, 0.17, 0.9, 12); sleeve.rotateX(Math.PI / 2);
    add(sleeve, darkMat, 0, 0, 0.45, this.barrelGroup);
    add(new THREE.BoxGeometry(0.26, 0.26, 0.5), darkMat, 0, 0, 4.35, this.barrelGroup);           // muzzle brake
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0, 4.7);
    this.barrelGroup.add(this.muzzle);

    this.sightObj = new THREE.Object3D(); this.sightObj.position.set(0, 1.25, 1.0); tg.add(this.sightObj);
    this.binocObj = new THREE.Object3D(); this.binocObj.position.set(0, 2.1, -0.4); tg.add(this.binocObj);

    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  /* ------------------------------------------------------------------ */
  _sampleGround(dt, snap) {
    const h = this.heading, s = Math.sin(h), c = Math.cos(h);
    const x = this.root.position.x, z = this.root.position.z, H = this.world.heightAt;
    const L = 3.2, W = 1.8;
    const hf = H(x + s * L, z + c * L), hb = H(x - s * L, z - c * L);
    const hl = H(x + c * W, z - s * W), hr = H(x - c * W, z + s * W);
    this.slope = (hf - hb) / (2 * L);
    const tp = Math.atan2(hf - hb, 2 * L), tr = Math.atan2(hl - hr, 2 * W);
    const ty = (hf + hb + hl + hr) / 4 + 0.05;
    if (snap) {
      this._pitchUp = tp; this._rollLeftUp = tr; this.root.position.y = ty;
    } else {
      const k = Math.min(1, dt * 8);
      this._pitchUp += (tp - this._pitchUp) * k;
      this._rollLeftUp += (tr - this._rollLeftUp) * k;
      this.root.position.y += (ty - this.root.position.y) * Math.min(1, dt * 12);
    }
  }

  _applyPose() {
    this.root.rotation.set(-this._pitchUp, this.heading, this._rollLeftUp);
    this.hullGroup.rotation.x = this._springX;
    this.turretGroup.rotation.y = this.turretYaw;
    this.turretGroup.position.y = 1.8 + this._turretLift;
    this.turretGroup.rotation.z = this._wreckTilt;
    this.gunPivot.rotation.x = -this.gunElev;
    this.barrelGroup.position.z = -0.55 * this.recoil * this.recoil;
  }

  /* ------------------------------------------------------------------ */
  update(dt, input, fx) {
    const st = this.stats;
    if (!this.alive) { input = { throttle: 0, steer: 0, brake: true }; this._wreckFx(dt, fx); }
    if (this.immobT > 0) { this.immobT = Math.max(0, this.immobT - dt); input = { throttle: 0, steer: 0, brake: true }; }
    if (this.gunDownT > 0) this.gunDownT = Math.max(0, this.gunDownT - dt);
    const v = this.speed, thr = input.throttle;
    let a = 0, fric = false;

    if (thr > 0) {
      if (v < -0.5) { a = 9; fric = true; }
      else a = 3.8 * Math.max(0, 1 - Math.pow(Math.max(v, 0) / st.maxSpeed, 2));
    } else if (thr < 0) {
      if (v > 0.5) { a = -9; fric = true; }
      else a = -2.4 * Math.max(0, 1 - Math.pow(Math.max(-v, 0) / st.maxReverse, 2));
    } else {
      a = -Math.sign(v) * 1.8; fric = true;
    }
    if (input.brake) { a = -Math.sign(v) * 14; fric = true; }
    a -= 0.0035 * v * Math.abs(v);                                          // aero / track drag
    const gSlope = 9.81 * this.slope / Math.sqrt(1 + this.slope * this.slope) * 0.75;
    a -= gSlope;

    let nv = v + a * dt;
    if (fric && Math.sign(nv) !== Math.sign(v) && (input.brake || Math.abs(this.slope) < 0.2)) nv = 0;
    this.accel = (nv - v) / Math.max(dt, 1e-4);
    this.speed = nv;

    // steering (neutral / differential)
    const sAbs = Math.abs(this.speed);
    const maxRate = (36 - 17 * Math.min(1, sAbs / st.maxSpeed)) * DEG;
    const dirSign = sAbs < 1 ? 1 : Math.sign(this.speed);
    const target = input.steer * maxRate * dirSign * (input.brake ? 0.5 : 1);
    this.yawRate += (target - this.yawRate) * Math.min(1, dt * 3.5);
    this.heading += this.yawRate * dt;
    this.speed *= 1 - Math.min(0.4, Math.abs(input.steer) * 0.14) * dt;      // turning bleeds speed

    // translate
    const fx_ = Math.sin(this.heading), fz_ = Math.cos(this.heading);
    const p = this.root.position;
    p.x += fx_ * this.speed * dt;
    p.z += fz_ * this.speed * dt;
    const lim = this.world.limit;
    if (Math.abs(p.x) > lim) { p.x = clamp(p.x, -lim, lim); this.speed *= 0.5; }
    if (Math.abs(p.z) > lim) { p.z = clamp(p.z, -lim, lim); this.speed *= 0.5; }

    // obstacle collision (circle vs AABB)
    const R = 3.3;
    const near = this.world.nearby ? this.world.nearby(p.x, p.z, R + 1) : this.world.obstacles;
    for (const o of near) {
      if (o.max.y < p.y + 0.4 || o.min.y > p.y + 3.3) continue;
      if (p.x < o.min.x - R || p.x > o.max.x + R || p.z < o.min.z - R || p.z > o.max.z + R) continue;
      const cx = clamp(p.x, o.min.x, o.max.x), cz = clamp(p.z, o.min.z, o.max.z);
      let dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < R * R) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2), push = R - d;
          p.x += (dx / d) * push; p.z += (dz / d) * push;
        } else {
          const l = p.x - o.min.x, r = o.max.x - p.x, b = p.z - o.min.z, t = o.max.z - p.z, m = Math.min(l, r, b, t);
          if (m === l) p.x = o.min.x - R; else if (m === r) p.x = o.max.x + R; else if (m === b) p.z = o.min.z - R; else p.z = o.max.z + R;
        }
        this.speed *= Math.max(0, 1 - 4 * dt);
      }
    }

    this._sampleGround(dt, false);

    // suspension spring (pitch kick from acceleration & recoil)
    const sTarget = -clamp(this.accel, -9, 9) * 0.004;
    const acc = -70 * (this._springX - sTarget) - 9 * this._springV;
    this._springV += acc * dt; this._springX += this._springV * dt;

    // timers
    if (this.reloadTimer > 0) this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    this.recoil = Math.max(0, this.recoil - dt * 2.2);

    // track animation
    const hw = 1.78;
    const vl = this.speed - this.yawRate * hw, vr = this.speed + this.yawRate * hw;
    for (const t of this.tracks) {
      const vt = t.sign > 0 ? vl : vr;
      t.tex.offset.x += t.sign * vt * dt * t.tex.repeat.x / 7.0;
    }
    for (const w of this.wheels) w.mesh.rotation.x += (w.side > 0 ? vl : vr) * dt / 0.46;

    // dust
    if (fx) {
      this._dust += Math.min(1, (sAbs + Math.abs(this.yawRate) * 8) / 10) * 16 * dt;
      while (this._dust >= 1) {
        this._dust -= 1;
        const back = this.speed >= 0 ? -3.0 : 3.0, side = Math.random() < 0.5 ? 1.78 : -1.78;
        const cs = Math.cos(this.heading), sn = Math.sin(this.heading);
        fx.emit({
          x: p.x + fx_ * back + cs * side, y: p.y + 0.3, z: p.z + fz_ * back - sn * side,
          vx: (Math.random() - 0.5) * 1.5, vy: 0.6 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 1.5,
          life: 1.1 + Math.random() * 0.8, s0: 0.8, s1: 3.2, r: 0.5, g: 0.45, b: 0.34, a: 0.32, drag: 1.0, grav: 0.3,
        });
      }
    }
    this._applyPose();
  }

  /** aimYaw: world azimuth (rad, same convention as heading). aimElev: world elevation above horizon (rad). */
  updateTurret(dt, aimYaw, aimElev) {
    const st = this.stats;
    const wantYaw = wrapPi(aimYaw - this.heading);
    const err = wrapPi(wantYaw - this.turretYaw);
    const rate = clamp(err * 4, -st.traverseRate, st.traverseRate);
    this.turretYaw = Math.abs(err) < 1e-4 ? wantYaw : wrapPi(this.turretYaw + rate * dt);

    const tilt = this._pitchUp * Math.cos(this.turretYaw) + this._rollLeftUp * Math.sin(this.turretYaw);
    const wantElev = clamp(aimElev - tilt, st.elevMin, st.elevMax);
    const e = wantElev - this.gunElev;
    this.gunElev += clamp(e * 5, -st.elevRate, st.elevRate) * dt;
    this._applyPose();
  }

  immobilize(sec) { this.immobT = Math.max(this.immobT, sec); }
  disableGun(sec) { this.gunDownT = Math.max(this.gunDownT, sec); }

  /** Knock the tank out: dark hull, burning, turret blown up. */
  destroy(crit) {
    if (!this.alive) return;
    this.alive = false; this.hp = 0; this._burn = 26;
    this.hullMat.color.setRGB(0.12, 0.11, 0.1);
    this._turretVel = crit ? 13 : 4; this._wreckTilt = crit ? 0.35 : 0.08;
  }

  reset(x, z, heading) {
    this.alive = true; this.hp = this.maxHp; this._burn = 0; this.immobT = 0; this.gunDownT = 0;
    this._turretLift = 0; this._turretVel = 0; this._wreckTilt = 0;
    this.hullMat.color.setRGB(this.tint[0], this.tint[1], this.tint[2]);
    this.heading = heading; this.speed = 0; this.yawRate = 0; this.turretYaw = 0; this.gunElev = 0;
    this.reloadTimer = 3;
    this.root.position.set(x, 0, z);
    this._sampleGround(0, true); this._applyPose(); this.root.updateMatrixWorld(true);
  }

  _wreckFx(dt, fx) {
    if (this._turretVel !== 0 || this._turretLift > 0) {
      this._turretLift += this._turretVel * dt; this._turretVel -= 22 * dt;
      if (this._turretLift <= 0) { this._turretLift = 0; this._turretVel = 0; }
    }
    if (!fx) return;
    this._burn = Math.max(0, this._burn - dt);
    this._smokeAcc += dt * (this._burn > 0 ? 22 : 6);
    const p = this.root.position;
    while (this._smokeAcc >= 1) {
      this._smokeAcc -= 1;
      const ox = (Math.random() - 0.5) * 1.6, oz = (Math.random() - 0.5) * 2.4 - 1;
      const cs = Math.cos(this.heading), sn = Math.sin(this.heading);
      const x = p.x + cs * ox + sn * oz, z = p.z - sn * ox + cs * oz, y = p.y + 2.2 + this._turretLift;
      fx.emit({ x, y, z, vx: (Math.random() - 0.5) * 1.2, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 1.2,
        life: 2.5 + Math.random() * 2, s0: 1.4, s1: 6 + Math.random() * 3, r: 0.1, g: 0.1, b: 0.1, a: 0.6, drag: 0.4, grav: 0.8 });
      if (this._burn > 0 && Math.random() < 0.7) {
        fx.emit({ additive: true, x, y: y - 0.3, z, vx: (Math.random() - 0.5), vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5),
          life: 0.5 + Math.random() * 0.3, s0: 1.8, s1: 0.5, r: 1, g: 0.45, b: 0.1, a: 0.9, drag: 1 });
      }
    }
  }

  get ready() { return this.reloadTimer <= 0; }
  get reloadFraction() { return 1 - this.reloadTimer / this.stats.reload; }

  /** Fire if loaded. Returns {pos, dir, speed, caliber} or null. Call after root.updateMatrixWorld(). */
  fire() {
    if (!this.alive || this.gunDownT > 0 || this.reloadTimer > 0) return null;
    this.reloadTimer = this.stats.reload;
    this.recoil = 1;
    this._springV -= 0.35;
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();
    this.muzzleWorld(pos); this.gunDirection(dir);
    return { pos, dir, speed: this.stats.muzzleVelocity, caliber: this.stats.caliber };
  }

  muzzleWorld(out) { this.muzzle.updateWorldMatrix(true, false); return this.muzzle.getWorldPosition(out); }
  gunDirection(out) {
    this.muzzle.updateWorldMatrix(true, false);
    const q = this.muzzle.getWorldQuaternion(new THREE.Quaternion());
    return out.set(0, 0, 1).applyQuaternion(q).normalize();
  }
  gunPivotWorld(out) { this.gunPivot.updateWorldMatrix(true, false); return this.gunPivot.getWorldPosition(out); }
  sightWorld(out) { this.sightObj.updateWorldMatrix(true, false); return this.sightObj.getWorldPosition(out); }
  binocWorld(out) { this.binocObj.updateWorldMatrix(true, false); return this.binocObj.getWorldPosition(out); }
  get turretWorldYaw() { return this.heading + this.turretYaw; }
}
