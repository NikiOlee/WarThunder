import * as THREE from 'three';
import { getTankSpec, type TankSpec } from './tanks';
import type { GameWorld } from './world';
import type { Particles } from './ballistics';

const DEG = Math.PI / 180;
const wrapPi = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function prism(points: Array<[number, number]>, width: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

function camoTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4e5b34';
  g.fillRect(0, 0, 128, 128);
  const cols = ['#384324', '#6b6f3f', '#2d371c', '#5e653a'];
  for (let i = 0; i < 28; i++) {
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

function treadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#26261f';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#44443a';
  g.fillRect(0, 0, 40, 32);
  g.fillStyle = '#15150f';
  g.fillRect(40, 0, 3, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface TankInput {
  throttle: number;
  steer: number;
  brake: boolean;
}

export interface TankOptions {
  x?: number;
  z?: number;
  heading?: number;
  team?: 'A' | 'B';
  name?: string;
  tint?: [number, number, number];
  specId?: string;
}

export class Tank {
  world: GameWorld;
  team: 'A' | 'B';
  name: string;
  tint: [number, number, number];
  spec: TankSpec;
  alive = true;
  hp: number;
  maxHp: number;
  immobT = 0;
  gunDownT = 0;
  god = false;
  isPlayer = false;
  isBot = false;

  private _burn = 0;
  private _turretLift = 0;
  private _turretVel = 0;
  private _wreckTilt = 0;
  private _smokeAcc = 0;

  stats: TankSpec;
  heading: number;
  speed = 0;
  yawRate = 0;
  accel = 0;
  slope = 0;
  private _pitchUp = 0;
  private _rollLeftUp = 0;
  private _springX = 0;
  private _springV = 0;
  private _dust = 0;

  turretYaw = 0;
  gunElev = 0;
  reloadTimer = 0;
  recoil = 0;

  root: THREE.Group;
  hullMat!: THREE.MeshStandardMaterial;
  hullGroup!: THREE.Group;
  turretGroup!: THREE.Group;
  gunPivot!: THREE.Group;
  barrelGroup!: THREE.Group;
  muzzle!: THREE.Object3D;
  sightObj!: THREE.Object3D;
  binocObj!: THREE.Object3D;
  tracks: Array<{ tex: THREE.CanvasTexture; sign: number }> = [];
  wheels: Array<{ mesh: THREE.Mesh; side: number }> = [];
  _gd?: THREE.Vector3;

  constructor(scene: THREE.Scene, world: GameWorld, opts: TankOptions = {}) {
    this.world = world;
    this.team = opts.team || 'A';
    this.spec = getTankSpec(opts.specId || 't55');
    this.stats = this.spec;
    this.name = opts.name || this.spec.name;
    this.tint = opts.tint || [1, 1, 1];
    this.hp = this.spec.maxHp;
    this.maxHp = this.spec.maxHp;
    this.heading = opts.heading || 0;

    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);
    this._build();

    this.root.position.set(opts.x || 0, 0, opts.z || 0);
    this._sampleGround(0, true);
    this._applyPose();
    this.root.updateMatrixWorld(true);
  }

  private _build(): void {
    const camo = camoTexture();
    const hullMat = new THREE.MeshStandardMaterial({
      map: camo,
      roughness: 0.78,
      metalness: 0.22,
      flatShading: true,
    });
    hullMat.color.setRGB(this.tint[0], this.tint[1], this.tint[2]);
    this.hullMat = hullMat;

    const darkMat = new THREE.MeshStandardMaterial({ color: 0x262820, roughness: 0.92, metalness: 0.25, flatShading: true });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x3b3e37, roughness: 0.42, metalness: 0.72 });
    const fuelMat = new THREE.MeshStandardMaterial({ color: 0x45522d, roughness: 0.52, metalness: 0.38 });
    fuelMat.color.setRGB(fuelMat.color.r * this.tint[0], fuelMat.color.g * this.tint[1], fuelMat.color.b * this.tint[2]);

    this.hullGroup = new THREE.Group();
    this.root.add(this.hullGroup);

    // Classic T-55 low-profile hull with sharply sloped frontal glacis
    const hull = new THREE.Mesh(
      prism(
        [
          [-3.25, 0.52],
          [3.15, 0.52],
          [3.52, 0.98],
          [2.15, 1.66],
          [-2.65, 1.68],
          [-3.25, 1.38],
        ],
        2.9,
      ),
      hullMat,
    );
    this.hullGroup.add(hull);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.hullGroup) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    // Engine deck louver, driver hatch, splash guard on glacis, headlights
    add(new THREE.BoxGeometry(2.15, 0.08, 1.65), darkMat, 0, 1.7, -1.95);
    add(new THREE.BoxGeometry(0.7, 0.1, 0.55), darkMat, 0.65, 1.72, 1.9);
    const waveBreaker = add(new THREE.BoxGeometry(2.4, 0.08, 0.14), darkMat, 0, 1.36, 2.75);
    waveBreaker.rotation.x = 0.45;
    add(new THREE.BoxGeometry(0.24, 0.18, 0.18), metalMat, 1.05, 1.44, 2.95);
    add(new THREE.BoxGeometry(0.24, 0.18, 0.18), metalMat, -1.05, 1.44, 2.95);

    // Side fenders
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.56, 0.08, 6.75), hullMat, sx * 1.72, 1.12, 0.0);
      add(new THREE.BoxGeometry(0.08, 0.42, 5.6), hullMat, sx * 2.02, 0.96, -0.15);
    }

    // External side-rear fender fuel tanks (iconic T-55 feature, vulnerable weakspot)
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.34, 0.44, 1.95), fuelMat, sx * 1.46, 1.34, -2.18);
    }
    // Dual rear cylindrical external fuel drums (vulnerable weakspot)
    const drumGeo = new THREE.CylinderGeometry(0.27, 0.27, 1.18, 12);
    drumGeo.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) {
      add(drumGeo, fuelMat, sx * 0.72, 1.32, -3.32);
    }
    // Unditching log on rear deck
    const logGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.55, 8);
    logGeo.rotateZ(Math.PI / 2);
    add(logGeo, new THREE.MeshStandardMaterial({ color: 0x5c4730, roughness: 0.95 }), 0, 1.0, -3.32);

    // Tracks + 5 large road wheels per side (classic T-54/T-55 layout with front gap)
    this.tracks = [];
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.76, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const barGeo = new THREE.BoxGeometry(0.8, 0.08, 0.45);
    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.82, 8);
    hubGeo.rotateZ(Math.PI / 2);

    for (const sx of [1, -1]) {
      const tex = treadTexture();
      const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
      const mats = [side, side, darkMat, darkMat, darkMat, darkMat];
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 6.9), mats);
      track.position.set(sx * 1.75, 0.52, 0);
      this.hullGroup.add(track);
      this.tracks.push({ tex, sign: sx });

      // T-55 5 road wheels with distinct gap after the 1st wheel
      const wz = [-2.55, -1.45, -0.35, 0.75, 2.35];
      for (const z of wz) {
        const w = new THREE.Mesh(wheelGeo, metalMat);
        w.position.set(sx * 1.75, 0.48, z);
        w.add(new THREE.Mesh(barGeo, darkMat));
        w.add(new THREE.Mesh(hubGeo, darkMat));
        this.hullGroup.add(w);
        this.wheels.push({ mesh: w, side: sx });
      }
    }

    // Cast hemispherical T-55 turret ("frying pan" dome silhouette)
    this.turretGroup = new THREE.Group();
    this.turretGroup.position.set(0, 1.64, 0.05);
    this.hullGroup.add(this.turretGroup);
    const tg = this.turretGroup;

    const domePts = [
      new THREE.Vector2(0.0, 0.96),
      new THREE.Vector2(0.55, 0.95),
      new THREE.Vector2(1.05, 0.84),
      new THREE.Vector2(1.36, 0.56),
      new THREE.Vector2(1.48, 0.2),
      new THREE.Vector2(1.42, 0.0),
      new THREE.Vector2(0.0, 0.0),
    ];
    const domeGeo = new THREE.LatheGeometry(domePts, 18);
    domeGeo.scale(0.95, 1.0, 1.18);
    const dome = new THREE.Mesh(domeGeo, hullMat);
    dome.position.set(0, 0.0, -0.08);
    tg.add(dome);

    add(new THREE.CylinderGeometry(1.3, 1.34, 0.12, 18), hullMat, 0, 0.02, -0.05, tg);
    add(new THREE.CylinderGeometry(0.36, 0.4, 0.26, 12), hullMat, 0.48, 1.02, -0.35, tg); // commander cupola
    add(new THREE.CylinderGeometry(0.28, 0.32, 0.18, 12), hullMat, -0.48, 0.98, -0.32, tg); // loader hatch
    add(new THREE.BoxGeometry(0.06, 0.06, 0.72), metalMat, -0.48, 1.18, -0.08, tg); // DShK MG
    add(new THREE.CylinderGeometry(0.025, 0.025, 3.0, 4), metalMat, 0.9, 2.0, -1.35, tg); // whip antenna
    add(new THREE.BoxGeometry(0.88, 0.62, 0.45), hullMat, 0, 0.48, 1.48, tg); // mantlet
    // Luna IR searchlight next to gun mantlet
    const irLight = new THREE.CylinderGeometry(0.18, 0.18, 0.26, 10);
    irLight.rotateX(Math.PI / 2);
    add(irLight, darkMat, -0.68, 0.58, 1.48, tg);

    // 100mm D-10T2S gun barrel with bore evacuator (эжектор)
    this.gunPivot = new THREE.Group();
    this.gunPivot.position.set(0, 0.5, 1.58);
    tg.add(this.gunPivot);
    this.barrelGroup = new THREE.Group();
    this.gunPivot.add(this.barrelGroup);

    const barrelGeo = new THREE.CylinderGeometry(0.088, 0.105, 4.35, 12);
    barrelGeo.rotateX(Math.PI / 2);
    add(barrelGeo, metalMat, 0, 0, 2.25, this.barrelGroup);

    const sleeve = new THREE.CylinderGeometry(0.15, 0.15, 0.75, 12);
    sleeve.rotateX(Math.PI / 2);
    add(sleeve, darkMat, 0, 0, 0.38, this.barrelGroup);

    // Bore evacuator near muzzle (signature T-55 barrel detail)
    const evac = new THREE.CylinderGeometry(0.145, 0.145, 0.72, 12);
    evac.rotateX(Math.PI / 2);
    add(evac, hullMat, 0, 0, 3.65, this.barrelGroup);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0, 4.55);
    this.barrelGroup.add(this.muzzle);

    this.sightObj = new THREE.Object3D();
    this.sightObj.position.set(0, 1.12, 0.95);
    tg.add(this.sightObj);
    this.binocObj = new THREE.Object3D();
    this.binocObj.position.set(0, 1.95, -0.35);
    tg.add(this.binocObj);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  private _sampleGround(dt: number, snap: boolean): void {
    const h = this.heading;
    const s = Math.sin(h);
    const c = Math.cos(h);
    const x = this.root.position.x;
    const z = this.root.position.z;
    const H = this.world.heightAt;
    const L = 3.2;
    const W = 1.8;
    const hf = H(x + s * L, z + c * L);
    const hb = H(x - s * L, z - c * L);
    const hl = H(x + c * W, z - s * W);
    const hr = H(x - c * W, z + s * W);
    this.slope = (hf - hb) / (2 * L);
    const tp = Math.atan2(hf - hb, 2 * L);
    const tr = Math.atan2(hl - hr, 2 * W);
    const ty = (hf + hb + hl + hr) / 4 + 0.05;
    if (snap) {
      this._pitchUp = tp;
      this._rollLeftUp = tr;
      this.root.position.y = ty;
    } else {
      const k = Math.min(1, dt * 8);
      this._pitchUp += (tp - this._pitchUp) * k;
      this._rollLeftUp += (tr - this._rollLeftUp) * k;
      this.root.position.y += (ty - this.root.position.y) * Math.min(1, dt * 12);
    }
  }

  private _applyPose(): void {
    this.root.rotation.set(-this._pitchUp, this.heading, this._rollLeftUp);
    this.hullGroup.rotation.x = this._springX;
    this.turretGroup.rotation.y = this.turretYaw;
    this.turretGroup.position.y = 1.64 + this._turretLift;
    this.turretGroup.rotation.z = this._wreckTilt;
    this.gunPivot.rotation.x = -this.gunElev;
    this.barrelGroup.position.z = -0.55 * this.recoil * this.recoil;
  }

  update(dt: number, input: TankInput | null, fx: Particles | null): void {
    const st = this.stats;
    let ctrl: TankInput = input || { throttle: 0, steer: 0, brake: true };
    if (!this.alive) {
      ctrl = { throttle: 0, steer: 0, brake: true };
      this._wreckFx(dt, fx);
    }
    if (this.immobT > 0) {
      this.immobT = Math.max(0, this.immobT - dt);
      ctrl = { throttle: 0, steer: 0, brake: true };
    }
    if (this.gunDownT > 0) this.gunDownT = Math.max(0, this.gunDownT - dt);

    const v = this.speed;
    const thr = ctrl.throttle;
    let a = 0;
    let fric = false;

    // Tuned so 50 km/h (13.89 m/s) feels crisp and reaches full 50 km/h on flat terrain
    if (thr > 0) {
      if (v < -0.5) {
        a = 10;
        fric = true;
      } else {
        a = 4.6 * Math.max(0, 1 - Math.pow(Math.max(v, 0) / (st.maxSpeed * 1.06), 2));
      }
    } else if (thr < 0) {
      if (v > 0.5) {
        a = -10;
        fric = true;
      } else {
        a = -2.8 * Math.max(0, 1 - Math.pow(Math.max(-v, 0) / (st.maxReverse * 1.05), 2));
      }
    } else {
      a = -Math.sign(v) * 1.8;
      fric = true;
    }
    if (ctrl.brake) {
      a = -Math.sign(v) * 14;
      fric = true;
    }
    a -= 0.0028 * v * Math.abs(v);
    const gSlope = (9.81 * this.slope) / Math.sqrt(1 + this.slope * this.slope) * 0.75;
    a -= gSlope;

    let nv = v + a * dt;
    if (fric && Math.sign(nv) !== Math.sign(v) && (ctrl.brake || Math.abs(this.slope) < 0.2)) nv = 0;
    nv = clamp(nv, -st.maxReverse, st.maxSpeed);
    this.accel = (nv - v) / Math.max(dt, 1e-4);
    this.speed = nv;

    const sAbs = Math.abs(this.speed);
    const maxRate = (38 - 16 * Math.min(1, sAbs / st.maxSpeed)) * DEG;
    const dirSign = sAbs < 1 ? 1 : Math.sign(this.speed);
    const target = ctrl.steer * maxRate * dirSign * (ctrl.brake ? 0.5 : 1);
    this.yawRate += (target - this.yawRate) * Math.min(1, dt * 3.8);
    this.heading += this.yawRate * dt;
    this.speed *= 1 - Math.min(0.35, Math.abs(ctrl.steer) * 0.12) * dt;

    const fx_ = Math.sin(this.heading);
    const fz_ = Math.cos(this.heading);
    const p = this.root.position;
    p.x += fx_ * this.speed * dt;
    p.z += fz_ * this.speed * dt;
    const lim = this.world.limit;
    if (Math.abs(p.x) > lim) {
      p.x = clamp(p.x, -lim, lim);
      this.speed *= 0.5;
    }
    if (Math.abs(p.z) > lim) {
      p.z = clamp(p.z, -lim, lim);
      this.speed *= 0.5;
    }

    const R = 3.3;
    const near = this.world.nearby ? this.world.nearby(p.x, p.z, R + 1) : this.world.obstacles;
    for (const o of near) {
      if (o.max.y < p.y + 0.4 || o.min.y > p.y + 3.3) continue;
      if (p.x < o.min.x - R || p.x > o.max.x + R || p.z < o.min.z - R || p.z > o.max.z + R) continue;
      const cx = clamp(p.x, o.min.x, o.max.x);
      const cz = clamp(p.z, o.min.z, o.max.z);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < R * R) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = R - d;
          p.x += (dx / d) * push;
          p.z += (dz / d) * push;
        } else {
          const l = p.x - o.min.x;
          const r = o.max.x - p.x;
          const b = p.z - o.min.z;
          const t = o.max.z - p.z;
          const m = Math.min(l, r, b, t);
          if (m === l) p.x = o.min.x - R;
          else if (m === r) p.x = o.max.x + R;
          else if (m === b) p.z = o.min.z - R;
          else p.z = o.max.z + R;
        }
        this.speed *= Math.max(0, 1 - 4 * dt);
      }
    }

    this._sampleGround(dt, false);

    const sTarget = -clamp(this.accel, -9, 9) * 0.004;
    const acc = -70 * (this._springX - sTarget) - 9 * this._springV;
    this._springV += acc * dt;
    this._springX += this._springV * dt;

    if (this.reloadTimer > 0) this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    this.recoil = Math.max(0, this.recoil - dt * 2.2);

    const hw = 1.75;
    const vl = this.speed - this.yawRate * hw;
    const vr = this.speed + this.yawRate * hw;
    for (const t of this.tracks) {
      const vt = t.sign > 0 ? vl : vr;
      t.tex.offset.x += (t.sign * vt * dt * t.tex.repeat.x) / 6.9;
    }
    for (const w of this.wheels) w.mesh.rotation.x += ((w.side > 0 ? vl : vr) * dt) / 0.47;

    if (fx) {
      this._dust += Math.min(1, (sAbs + Math.abs(this.yawRate) * 8) / 10) * 16 * dt;
      while (this._dust >= 1) {
        this._dust -= 1;
        const back = this.speed >= 0 ? -3.0 : 3.0;
        const side = Math.random() < 0.5 ? 1.75 : -1.75;
        const cs = Math.cos(this.heading);
        const sn = Math.sin(this.heading);
        fx.emit({
          x: p.x + fx_ * back + cs * side,
          y: p.y + 0.3,
          z: p.z + fz_ * back - sn * side,
          vx: (Math.random() - 0.5) * 1.5,
          vy: 0.6 + Math.random() * 1.2,
          vz: (Math.random() - 0.5) * 1.5,
          life: 1.1 + Math.random() * 0.8,
          s0: 0.8,
          s1: 3.2,
          r: 0.5,
          g: 0.45,
          b: 0.34,
          a: 0.32,
          drag: 1.0,
          grav: 0.3,
        });
      }
    }
    this._applyPose();
  }

  updateTurret(dt: number, aimYaw: number, aimElev: number): void {
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

  immobilize(sec: number): void {
    this.immobT = Math.max(this.immobT, sec);
  }
  disableGun(sec: number): void {
    this.gunDownT = Math.max(this.gunDownT, sec);
  }

  destroy(crit: boolean): void {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this._burn = 26;
    this.hullMat.color.setRGB(0.12, 0.11, 0.1);
    this._turretVel = crit ? 15.5 : 4;
    this._wreckTilt = crit ? 0.42 : 0.08;
  }

  reset(x: number, z: number, heading: number, specId?: string): void {
    if (specId) {
      this.spec = getTankSpec(specId);
      this.stats = this.spec;
      this.maxHp = this.spec.maxHp;
    }
    this.alive = true;
    this.hp = this.maxHp;
    this._burn = 0;
    this.immobT = 0;
    this.gunDownT = 0;
    this._turretLift = 0;
    this._turretVel = 0;
    this._wreckTilt = 0;
    this.hullMat.color.setRGB(this.tint[0], this.tint[1], this.tint[2]);
    this.heading = heading;
    this.speed = 0;
    this.yawRate = 0;
    this.turretYaw = 0;
    this.gunElev = 0;
    this.reloadTimer = 0;
    this.root.position.set(x, 0, z);
    this._sampleGround(0, true);
    this._applyPose();
    this.root.updateMatrixWorld(true);
  }

  private _wreckFx(dt: number, fx: Particles | null): void {
    if (this._turretVel !== 0 || this._turretLift > 0) {
      this._turretLift += this._turretVel * dt;
      this._turretVel -= 22 * dt;
      if (this._turretLift <= 0) {
        this._turretLift = 0;
        this._turretVel = 0;
      }
    }
    if (!fx) return;
    this._burn = Math.max(0, this._burn - dt);
    this._smokeAcc += dt * (this._burn > 0 ? 22 : 6);
    const p = this.root.position;
    while (this._smokeAcc >= 1) {
      this._smokeAcc -= 1;
      const ox = (Math.random() - 0.5) * 1.6;
      const oz = (Math.random() - 0.5) * 2.4 - 1;
      const cs = Math.cos(this.heading);
      const sn = Math.sin(this.heading);
      const x = p.x + cs * ox + sn * oz;
      const z = p.z - sn * ox + cs * oz;
      const y = p.y + 2.2 + this._turretLift;
      fx.emit({
        x,
        y,
        z,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 3 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 1.2,
        life: 2.5 + Math.random() * 2,
        s0: 1.4,
        s1: 6 + Math.random() * 3,
        r: 0.1,
        g: 0.1,
        b: 0.1,
        a: 0.6,
        drag: 0.4,
        grav: 0.8,
      });
      if (this._burn > 0 && Math.random() < 0.7) {
        fx.emit({
          additive: true,
          x,
          y: y - 0.3,
          z,
          vx: Math.random() - 0.5,
          vy: 2 + Math.random() * 2,
          vz: Math.random() - 0.5,
          life: 0.5 + Math.random() * 0.3,
          s0: 1.8,
          s1: 0.5,
          r: 1,
          g: 0.45,
          b: 0.1,
          a: 0.9,
          drag: 1,
        });
      }
    }
  }

  get ready(): boolean {
    return this.reloadTimer <= 0;
  }
  get reloadFraction(): number {
    return 1 - this.reloadTimer / this.stats.reload;
  }

  fire() {
    if (!this.alive || this.gunDownT > 0 || this.reloadTimer > 0) return null;
    this.reloadTimer = this.stats.reload;
    this.recoil = 1;
    this._springV -= 0.35;
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.muzzleWorld(pos);
    this.gunDirection(dir);
    return {
      pos,
      dir,
      speed: this.stats.muzzleVelocity,
      caliber: this.stats.caliber,
      penetrationMm: this.stats.penetrationMm,
      maxRange: this.stats.maxRange,
    };
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.muzzle.updateWorldMatrix(true, false);
    return this.muzzle.getWorldPosition(out);
  }
  gunDirection(out: THREE.Vector3): THREE.Vector3 {
    this.muzzle.updateWorldMatrix(true, false);
    const q = this.muzzle.getWorldQuaternion(new THREE.Quaternion());
    return out.set(0, 0, 1).applyQuaternion(q).normalize();
  }
  gunPivotWorld(out: THREE.Vector3): THREE.Vector3 {
    this.gunPivot.updateWorldMatrix(true, false);
    return this.gunPivot.getWorldPosition(out);
  }
  sightWorld(out: THREE.Vector3): THREE.Vector3 {
    this.sightObj.updateWorldMatrix(true, false);
    return this.sightObj.getWorldPosition(out);
  }
  binocWorld(out: THREE.Vector3): THREE.Vector3 {
    this.binocObj.updateWorldMatrix(true, false);
    return this.binocObj.getWorldPosition(out);
  }
  get turretWorldYaw(): number {
    return this.heading + this.turretYaw;
  }
}
