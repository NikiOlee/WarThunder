import * as THREE from 'three';
import { Tank } from './tank';
import { BallisticsSystem, G } from './ballistics';
import { computeShotGate } from './botTactics';
import { BOSS_TANK_ID } from './tanks';
import type { GameWorld } from './world';

const wrapPi = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Дистанция между центрами, при которой Маус таранит танк (м). */
export const BOSS_RAM_DISTANCE = 5.2;
export const BOSS_NAME = 'МАУС';

/**
 * ИИ-босс режима «Джагернаут»: постоянно охотится на ближайший танк охотников,
 * стреляет без промаха-по-броне (урон считается в ballistics) и таранит всё на своём пути.
 */
export class JuggernautBoss {
  tank: Tank;
  world: GameWorld;
  ballistics: BallisticsSystem;
  target: Tank | null = null;
  private thinkT = 0;
  private avoid = 1;
  private reverseT = 0;
  private stuckT = 0;
  private lastPos = new THREE.Vector3();
  private _a = new THREE.Vector3();
  private _b = new THREE.Vector3();
  private _gd = new THREE.Vector3();
  private noiseYaw = 0;
  private noiseElev = 0;
  private noiseT = 0;

  constructor(scene: THREE.Scene, world: GameWorld, ballistics: BallisticsSystem) {
    this.world = world;
    this.ballistics = ballistics;
    this.tank = new Tank(scene, world, {
      x: 0,
      z: 0,
      heading: 0,
      team: 'B',
      name: BOSS_NAME,
      tint: [0.42, 0.44, 0.5],
      specId: BOSS_TANK_ID,
    });
    this.tank.isBot = true;
    ballistics.addTarget(this.tank);
    this.lastPos.copy(this.tank.root.position);
  }

  /** Возрождение босса строго в центре карты. */
  respawn(): void {
    this.tank.reset(0, 0, 0, BOSS_TANK_ID);
    this.target = null;
    this.reverseT = 0;
    this.stuckT = 0;
    this.lastPos.copy(this.tank.root.position);
  }

  get alive(): boolean {
    return this.tank.alive;
  }

  private _blocked(angle: number, dist: number): boolean {
    const t = this.tank;
    const h = t.heading + angle;
    this._a.set(t.root.position.x, t.root.position.y + 1.3, t.root.position.z);
    this._b.set(this._a.x + Math.sin(h) * dist, this._a.y, this._a.z + Math.cos(h) * dist);
    const hit = this.world.segmentHit(this._a, this._b, 2);
    return !!hit && (hit.kind === 'obstacle' || hit.normal.y < 0.68);
  }

  private _los(e: Tank): boolean {
    const t = this.tank;
    this._a.set(t.root.position.x, t.root.position.y + 3, t.root.position.z);
    this._b.set(e.root.position.x, e.root.position.y + 1.65, e.root.position.z);
    const d = this._b.clone().sub(this._a);
    const dist = d.length();
    if (dist < 1e-3) return true;
    d.multiplyScalar(1 / dist);
    return !this.world.raycast(this._a, d, Math.max(0.5, dist - 3.5));
  }

  update(dt: number, hunters: Tank[], fx: Parameters<Tank['update']>[2]): void {
    const t = this.tank;
    if (!t.alive) {
      t.update(dt, null, fx);
      t.updateTurret(dt, t.turretWorldYaw, t.gunElev);
      return;
    }
    const pos = t.root.position;

    // Смертельный таран: охота на ближайшего живого охотника
    this.thinkT -= dt;
    if (this.thinkT <= 0 || !this.target || !this.target.alive) {
      this.thinkT = 0.3;
      let best: Tank | null = null;
      let bd = Infinity;
      for (const h of hunters) {
        if (!h.alive) continue;
        const d = Math.hypot(h.root.position.x - pos.x, h.root.position.z - pos.z);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      this.target = best;
    }
    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 0.9;
      this.noiseYaw = Math.random() * 2 - 1;
      this.noiseElev = Math.random() * 2 - 1;
    }

    const tg = this.target;
    let throttle = 1;
    let steer = 0;
    if (tg) {
      const dx = tg.root.position.x - pos.x;
      const dz = tg.root.position.z - pos.z;
      const desired = Math.atan2(dx, dz);
      const err = wrapPi(desired - t.heading);
      steer = clamp(err * 2.4, -1, 1);
      if (Math.abs(err) > 1.2) throttle = 0.3;
    } else {
      throttle = 0;
    }

    if (throttle > 0 && (this._blocked(0, 22) || this._blocked(0.3, 16) || this._blocked(-0.3, 16))) {
      const l = this._blocked(0.7, 20);
      const r = this._blocked(-0.7, 20);
      this.avoid = l && !r ? -1 : !l && r ? 1 : this.avoid;
      steer = this.avoid;
      throttle = 0.4;
    }

    this.stuckT += dt;
    if (this.stuckT > 1.6) {
      if (throttle > 0.25 && pos.distanceTo(this.lastPos) < 1.2) {
        this.reverseT = 1.5;
        this.avoid = -this.avoid;
      }
      this.lastPos.copy(pos);
      this.stuckT = 0;
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      throttle = -1;
      steer = this.avoid;
    }

    t.update(dt, { throttle, steer, brake: false }, fx);

    // Орудие: огонь по цели (охотник), любое попадание смертельно
    if (tg) {
      const mv = t.stats.muzzleVelocity;
      const dx0 = tg.root.position.x - pos.x;
      const dz0 = tg.root.position.z - pos.z;
      const range = Math.hypot(dx0, dz0);
      const flight = range / (mv * 0.96);
      const ax = tg.root.position.x + Math.sin(tg.heading) * tg.speed * flight;
      const az = tg.root.position.z + Math.cos(tg.heading) * tg.speed * flight;
      const ay = tg.root.position.y + 1.4;
      const gp = t.gunPivotWorld(this._a);
      const dx = ax - gp.x;
      const dz = az - gp.z;
      const horiz = Math.hypot(dx, dz);
      const noise = 0.0025 * (1 + range / 300);
      const aimYaw = Math.atan2(dx, dz) + this.noiseYaw * noise;
      const aimElev =
        Math.atan2(ay - gp.y, horiz) + Math.atan2(0.5 * G * flight * flight * 1.05, Math.max(1, horiz)) + this.noiseElev * noise * 0.7;
      t.updateTurret(dt, aimYaw, aimElev);
      t.root.updateMatrixWorld(true);
      const yawErr = Math.abs(wrapPi(aimYaw - t.turretWorldYaw));
      t.gunDirection(this._gd);
      const elevErr = Math.abs(Math.asin(clamp(this._gd.y, -1, 1)) - aimElev);
      const canShoot = computeShotGate({
        range,
        maxEffectiveRange: t.stats.maxRange - 12,
        reactT: 0,
        yawErr,
        elevErr,
        hasLineOfSight: this._los(tg),
      });
      if (canShoot) {
        const shot = t.fire();
        if (shot) this.ballistics.fire({ ...shot, owner: t });
      }
    } else {
      t.updateTurret(dt, t.heading, 0);
      t.root.updateMatrixWorld(true);
    }
  }
}
