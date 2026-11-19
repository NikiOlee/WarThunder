import * as THREE from 'three';
import { Tank } from './tank';
import { BallisticsSystem, G } from './ballistics';
import { settings } from './settings';
import { DEFAULT_TANK_ID } from './tanks';
import type { GameWorld } from './world';

const wrapPi = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const TEAM_TINT: Record<'A' | 'B', [number, number, number]> = {
  A: [0.85, 1.05, 1.2],
  B: [1.55, 1.2, 0.8],
};

function markerTexture(hex: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = hex;
  g.strokeStyle = '#000';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(8, 12);
  g.lineTo(56, 12);
  g.lineTo(32, 56);
  g.closePath();
  g.stroke();
  g.fill();
  return new THREE.CanvasTexture(c);
}
const markers: Record<string, THREE.CanvasTexture> = {};

let MAP: GameWorld | null = null;
export function setMap(w: GameWorld): void {
  MAP = w;
}
export function spawnPoint(team: 'A' | 'B', index: number) {
  index = index % 6;
  return team === 'A' ? MAP!.spawnA(index) : MAP!.spawnB(index);
}

export function getEffectiveBotSkill(configuredSkill: number, allowBotAccuracy: boolean): number {
  return allowBotAccuracy ? configuredSkill : 1.0;
}

export class Bot {
  world: GameWorld;
  ballistics: BallisticsSystem;
  team: 'A' | 'B';
  index: number;
  tank: Tank;
  marker: THREE.Sprite;
  target: Tank | null = null;
  thinkT: number;
  reactT = 0;
  deadT = 0;
  obj: { x: number; z: number };
  avoid = 1;
  reverseT = 0;
  stuckT = 0;
  lastPos: THREE.Vector3;
  stuckCheck = 0;
  noiseYaw = 0;
  noiseElev = 0;
  noiseT = 0;
  baseSkill: number;
  skill: number;
  private _a = new THREE.Vector3();
  private _b = new THREE.Vector3();
  private _d = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: GameWorld, ballistics: BallisticsSystem, team: 'A' | 'B', index: number) {
    this.world = world;
    this.ballistics = ballistics;
    this.team = team;
    this.index = index;
    const sp = spawnPoint(team, index);
    // All enemy and allied bots spawn in the base T-55 tank
    this.tank = new Tank(scene, world, {
      x: sp.x,
      z: sp.z,
      heading: sp.heading,
      team,
      name: `Т-55 ${team}${index + 1}`,
      tint: TEAM_TINT[team],
      specId: DEFAULT_TANK_ID,
    });
    this.tank.isBot = true;
    ballistics.addTarget(this.tank);

    const hex = team === 'A' ? '#58e06a' : '#ff4a3a';
    markers[hex] = markers[hex] || markerTexture(hex);
    this.marker = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: markers[hex], depthTest: false, transparent: true, sizeAttenuation: false, fog: false }),
    );
    this.marker.scale.set(0.022, 0.022, 1);
    this.marker.position.y = 4.6;
    this.marker.renderOrder = 999;
    this.tank.root.add(this.marker);

    this.thinkT = Math.random() * 0.5;
    this.obj = this._newObjective();
    this.lastPos = this.tank.root.position.clone();
    this.baseSkill = rnd(0.7, 1.15);
    this.skill = this.baseSkill;
  }

  private _newObjective() {
    const O = this.world.objectives;
    const j = this.world.objJitter;
    const o = O[Math.floor(Math.random() * O.length)];
    return { x: o.x + rnd(-j, j), z: o.z + rnd(-j, j) };
  }

  respawn(): void {
    const sp = spawnPoint(this.team, this.index);
    this.tank.reset(sp.x + rnd(-8, 8), sp.z + rnd(-6, 6), sp.heading, DEFAULT_TANK_ID);
    this.target = null;
    this.deadT = 0;
    this.obj = this._newObjective();
    this.reverseT = 0;
  }

  private _blocked(angle: number, dist: number): boolean {
    const t = this.tank;
    const h = t.heading + angle;
    this._a.set(t.root.position.x, t.root.position.y + 1.3, t.root.position.z);
    this._b.set(this._a.x + Math.sin(h) * dist, this._a.y, this._a.z + Math.cos(h) * dist);
    const hit = this.world.segmentHit(this._a, this._b, 2);
    return !!hit && (hit.kind === 'obstacle' || hit.normal.y < 0.72);
  }

  private _pickTarget(enemies: Tank[]): void {
    const t = this.tank;
    let best: Tank | null = null;
    let bd = 650 * 650;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.root.position.x - t.root.position.x;
      const dz = e.root.position.z - t.root.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > bd) continue;
      this._a.set(t.root.position.x, t.root.position.y + 2.6, t.root.position.z);
      this._b.set(e.root.position.x, e.root.position.y + 1.6, e.root.position.z);
      this._d.subVectors(this._b, this._a);
      const dist = this._d.length();
      this._d.multiplyScalar(1 / dist);
      if (this.world.raycast(this._a, this._d, dist - 3)) continue;
      bd = d2;
      best = e;
    }
    if (best !== this.target) this.reactT = rnd(0.9, 1.8) / this.skill;
    this.target = best;
  }

  update(
    dt: number,
    enemies: Tank[],
    fx: Parameters<Tank['update']>[2],
    options: { respawns?: boolean; allowBotAccuracy?: boolean } = {},
  ): void {
    const t = this.tank;
    this.skill = this.baseSkill * getEffectiveBotSkill(settings.botSkill, !!options.allowBotAccuracy);
    this.marker.visible = t.alive;
    if (!t.alive) {
      t.update(dt, null, fx);
      t.updateTurret(dt, t.turretWorldYaw, t.gunElev);
      this.deadT += dt;
      if (options.respawns !== false && this.deadT > 14) this.respawn();
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = rnd(0.35, 0.6);
      this._pickTarget(enemies);
    }
    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 1.2;
      this.noiseYaw = rnd(-1, 1);
      this.noiseElev = rnd(-1, 1);
    }
    if (this.reactT > 0) this.reactT -= dt;

    const pos = t.root.position;
    const tg = this.target;
    const maxEffectiveRange = t.stats.maxRange - 15; // stay within 400m shell range

    let aimYaw: number;
    let aimElev = 0;
    let canShoot = false;
    if (tg && tg.alive) {
      const mv = t.stats.muzzleVelocity;
      const dx0 = tg.root.position.x - pos.x;
      const dz0 = tg.root.position.z - pos.z;
      const range = Math.hypot(dx0, dz0);
      const flight = range / (mv * 0.95);
      const tvx = Math.sin(tg.heading) * tg.speed;
      const tvz = Math.cos(tg.heading) * tg.speed;
      const ax = tg.root.position.x + tvx * flight;
      const az = tg.root.position.z + tvz * flight;
      const ay = tg.root.position.y + 1.5;
      const gp = t.gunPivotWorld(this._a);
      const dx = ax - gp.x;
      const dz = az - gp.z;
      const horiz = Math.hypot(dx, dz);
      const dy = ay - gp.y;
      const noise = (0.0045 / this.skill) * (1 + range / 250);
      aimYaw = Math.atan2(dx, dz) + this.noiseYaw * noise;
      aimElev = Math.atan2(dy, horiz) + Math.atan2(0.5 * G * flight * flight * 1.06, horiz) + this.noiseElev * noise * 0.7;
      const yawErr = Math.abs(wrapPi(aimYaw - t.turretWorldYaw));
      t._gd = t._gd || new THREE.Vector3();
      t.gunDirection(t._gd);
      const elevErr = Math.abs(Math.asin(clamp(t._gd.y, -1, 1)) - aimElev);
      canShoot = this.reactT <= 0 && yawErr < 0.014 && elevErr < 0.012 && range <= maxEffectiveRange;
    } else {
      aimYaw = t.heading + Math.sin(performance.now() * 0.0004 + this.index) * 0.9;
    }
    t.updateTurret(dt, aimYaw, aimElev);

    let throttle = 1;
    let steer = 0;
    let brake = false;
    let desired: number;
    const engaging = tg && tg.alive;
    if (engaging) {
      const dx = tg.root.position.x - pos.x;
      const dz = tg.root.position.z - pos.z;
      const range = Math.hypot(dx, dz);
      desired = Math.atan2(dx, dz) + (this.index % 2 ? 0.45 : -0.45);
      if (range < 120) throttle = -0.6;
      else if (range <= 360 && (t.reloadTimer < 1.5 || range < 320)) {
        throttle = 0;
        brake = true;
      } else {
        throttle = 0.85;
      }
    } else {
      const dx = this.obj.x - pos.x;
      const dz = this.obj.z - pos.z;
      if (dx * dx + dz * dz < 35 * 35) this.obj = this._newObjective();
      desired = Math.atan2(dx, dz);
    }
    const err = wrapPi(desired - t.heading);
    steer = clamp(err * 2.2, -1, 1);
    if (Math.abs(err) > 1.0 && throttle > 0) throttle = 0.25;

    if (throttle > 0 && this._blocked(0, 24)) {
      const l = this._blocked(0.6, 22);
      const r = this._blocked(-0.6, 22);
      this.avoid = l && !r ? -1 : !l && r ? 1 : this.avoid;
      steer = this.avoid;
      throttle = 0.35;
    }
    this.stuckCheck += dt;
    if (this.stuckCheck > 2) {
      const moved = pos.distanceTo(this.lastPos);
      if (throttle > 0.2 && moved < 2.5) {
        this.reverseT = 1.8;
        this.avoid = Math.random() < 0.5 ? 1 : -1;
      }
      this.lastPos.copy(pos);
      this.stuckCheck = 0;
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      throttle = -1;
      steer = this.avoid;
      brake = false;
    }

    t.update(dt, { throttle, steer, brake }, fx);

    if (canShoot) {
      t.root.updateMatrixWorld(true);
      const shot = t.fire();
      if (shot) this.ballistics.fire({ ...shot, owner: t });
    }
  }
}
