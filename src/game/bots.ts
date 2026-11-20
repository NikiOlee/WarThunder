import * as THREE from 'three';
import { Tank } from './tank';
import { BallisticsSystem, G } from './ballistics';
import { settings } from './settings';
import { DEFAULT_TANK_ID } from './tanks';
import { getPlayerSkillRating, resolveBotSkillMultiplier } from './playerSkill';
import {
  computeEngagementDrive,
  computeShotGate,
  computeWeakspotAimOffset,
  createAntiStuckState,
  pickBestTarget,
  pickCombatSectorWaypoint,
  stepAntiStuck,
  type AntiStuckState,
  type SectorAlly,
  type SectorEnemy,
  type TargetCandidate,
} from './botTactics';
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

export function getEffectiveBotSkill(
  configuredSkill: number,
  allowBotAccuracy: boolean,
  playerSkillRating = getPlayerSkillRating(),
  targetIsPlayer = true,
): number {
  return resolveBotSkillMultiplier({
    configuredSkill,
    allowBotAccuracy,
    playerSkillRating,
    targetIsPlayer,
  });
}

export interface BotUpdateOptions {
  respawns?: boolean;
  allowBotAccuracy?: boolean;
  allies?: Tank[];
  rushBoss?: boolean;
}

export class Bot {
  world: GameWorld;
  ballistics: BallisticsSystem;
  team: 'A' | 'B';
  index: number;
  tank: Tank;
  marker: THREE.Sprite;
  target: Tank | null = null;
  targetVisible = false;
  memoryT = 0;
  lastSeenPos = new THREE.Vector3();
  thinkT: number;
  reactT = 0;
  deadT = 0;
  obj: { x: number; z: number };
  sectorT = 0;
  flankSign: number;
  flankFlipT: number;
  avoid = 1;
  antiStuck: AntiStuckState;
  noiseYaw = 0;
  noiseElev = 0;
  noiseT = 0;
  baseSkill: number;
  skill: number;
  private _a = new THREE.Vector3();
  private _b = new THREE.Vector3();
  private _d = new THREE.Vector3();
  private _candidates: Array<TargetCandidate & { tank: Tank }> = [];
  private _aliveEnemies: SectorEnemy[] = [];
  private _sectorAllies: SectorAlly[] = [];

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

    this.flankSign = index % 2 === 0 ? 1 : -1;
    this.flankFlipT = rnd(6, 12);
    this.thinkT = Math.random() * 0.35;
    this.obj = this._newObjective();
    this.antiStuck = createAntiStuckState(this.tank.root.position.x, this.tank.root.position.z, this.tank.heading, index % 2 === 0 ? 1 : -1);
    this.baseSkill = rnd(0.88, 1.18);
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
    this.targetVisible = false;
    this.memoryT = 0;
    this.reactT = 0;
    this.deadT = 0;
    this.obj = this._newObjective();
    this.sectorT = 0;
    this.antiStuck = createAntiStuckState(this.tank.root.position.x, this.tank.root.position.z, this.tank.heading, this.avoid);
  }

  private _blocked(angle: number, dist: number): boolean {
    const t = this.tank;
    const h = t.heading + angle;
    this._a.set(t.root.position.x, t.root.position.y + 1.3, t.root.position.z);
    this._b.set(this._a.x + Math.sin(h) * dist, this._a.y, this._a.z + Math.cos(h) * dist);
    const hit = this.world.segmentHit(this._a, this._b, 2);
    return !!hit && (hit.kind === 'obstacle' || hit.normal.y < 0.68);
  }

  private _hasLineOfSight(e: Tank): boolean {
    const t = this.tank;
    this._a.set(t.root.position.x, t.root.position.y + 2.5, t.root.position.z);
    this._b.set(e.root.position.x, e.root.position.y + 1.65, e.root.position.z);
    this._d.subVectors(this._b, this._a);
    const dist = this._d.length();
    if (dist < 1e-3) return true;
    this._d.multiplyScalar(1 / dist);
    return !this.world.raycast(this._a, this._d, Math.max(0.5, dist - 3.5));
  }

  private _pickTarget(enemies: Tank[], allies: Tank[], rushBoss: boolean): void {
    const t = this.tank;
    const pos = t.root.position;
    const candidates = this._candidates;
    candidates.length = 0;
    const maxSight = rushBoss ? 1200 : 720;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive) continue;
      const dx = e.root.position.x - pos.x;
      const dz = e.root.position.z - pos.z;
      const range = Math.hypot(dx, dz);
      if (range > maxSight) continue;
      const los = this._hasLineOfSight(e);
      candidates.push({
        id: e.name,
        x: e.root.position.x,
        z: e.root.position.z,
        heading: e.heading,
        hp: e.hp,
        maxHp: e.maxHp,
        range,
        hasLineOfSight: los,
        isPlayer: e.isPlayer,
        tank: e,
      });
    }

    const chosen = pickBestTarget(
      { x: pos.x, z: pos.z },
      candidates,
      this.target && this.target.alive ? this.target.name : null,
    );

    if (chosen) {
      if (chosen.tank !== this.target) {
        this.reactT = rnd(0.18, 0.42) / Math.max(0.65, this.skill);
      }
      this.target = chosen.tank;
      this.targetVisible = true;
      this.memoryT = rushBoss ? 6.0 : 3.2;
      this.lastSeenPos.copy(chosen.tank.root.position);
      return;
    }

    // Hold target in tactical memory briefly when terrain dips out of LOS
    if (this.target && this.target.alive && this.memoryT > 0) {
      this.targetVisible = false;
      this.lastSeenPos.copy(this.target.root.position);
      return;
    }

    this.target = null;
    this.targetVisible = false;

    // Refresh combat-sector waypoint toward active fights, Maus, or wounded enemies
    this.sectorT -= 0.45;
    if (this.sectorT <= 0) {
      this.sectorT = rushBoss ? 0.85 : rnd(1.3, 2.4);
      const aliveEnemies = this._aliveEnemies;
      aliveEnemies.length = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.alive) aliveEnemies.push({ x: e.root.position.x, z: e.root.position.z, hp: e.hp, maxHp: e.maxHp });
      }
      const sectorAllies = this._sectorAllies;
      sectorAllies.length = 0;
      for (let i = 0; i < allies.length; i++) {
        const a = allies[i];
        if (!a.alive || a === t) continue;
        let nearEnemy = false;
        for (let j = 0; j < aliveEnemies.length; j++) {
          const ae = aliveEnemies[j];
          if (Math.hypot(ae.x - a.root.position.x, ae.z - a.root.position.z) < 230) {
            nearEnemy = true;
            break;
          }
        }
        sectorAllies.push({ x: a.root.position.x, z: a.root.position.z, inCombat: nearEnemy });
      }
      this.obj = pickCombatSectorWaypoint({
        botX: pos.x,
        botZ: pos.z,
        flankSign: this.flankSign,
        enemies: aliveEnemies,
        allies: sectorAllies,
        fallback: this._newObjective(),
      });
    }
  }

  update(dt: number, enemies: Tank[], fx: Parameters<Tank['update']>[2], options: BotUpdateOptions = {}): void {
    const t = this.tank;
    const playerRating = getPlayerSkillRating();
    const targetIsPlayer = !!(this.target && this.target.isPlayer);
    this.skill =
      this.baseSkill *
      getEffectiveBotSkill(settings.botSkill, !!options.allowBotAccuracy, playerRating, targetIsPlayer);

    this.marker.visible = t.alive;
    if (!t.alive) {
      t.update(dt, null, fx);
      t.updateTurret(dt, t.turretWorldYaw, t.gunElev);
      this.deadT += dt;
      if (options.respawns !== false && this.deadT > 14) this.respawn();
      return;
    }

    if (this.memoryT > 0) this.memoryT = Math.max(0, this.memoryT - dt);
    this.flankFlipT -= dt;
    if (this.flankFlipT <= 0) {
      this.flankFlipT = rnd(7, 13);
      if (Math.random() < 0.45) this.flankSign = -this.flankSign;
    }

    const allies = options.allies || [];
    const rushBoss = !!options.rushBoss;
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = rushBoss ? 0.25 : rnd(0.28, 0.48);
      this._pickTarget(enemies, allies, rushBoss);
    }

    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 0.85;
      this.noiseYaw = rnd(-1, 1);
      this.noiseElev = rnd(-1, 1);
    }
    if (this.reactT > 0) this.reactT = Math.max(0, this.reactT - dt);

    const pos = t.root.position;
    const tg = this.target && this.target.alive ? this.target : null;
    const maxEffectiveRange = t.stats.maxRange - 12;

    // 1. Drive hull relentlessly without braking to shoot
    let throttle = 1;
    let steer = 0;
    let brake = false;
    let desired: number;
    const curYawErr = tg
      ? Math.abs(wrapPi(Math.atan2((this.targetVisible ? tg.root.position.x : this.lastSeenPos.x) - pos.x, (this.targetVisible ? tg.root.position.z : this.lastSeenPos.z) - pos.z) - t.turretWorldYaw))
      : Math.PI;

    if (tg) {
      const tgtPos = this.targetVisible ? tg.root.position : this.lastSeenPos;
      const drive = computeEngagementDrive({
        dx: tgtPos.x - pos.x,
        dz: tgtPos.z - pos.z,
        targetHeading: tg.heading,
        flankSign: this.flankSign,
        reloadTimer: t.reloadTimer,
        yawErr: curYawErr,
        canSeeTarget: this.targetVisible,
        rushBoss,
        botIndex: this.index,
      });
      desired = drive.desiredHeading;
      throttle = drive.throttle;
      brake = drive.brake;
    } else {
      const dx = this.obj.x - pos.x;
      const dz = this.obj.z - pos.z;
      if (dx * dx + dz * dz < 35 * 35) this.obj = this._newObjective();
      desired = Math.atan2(dx, dz);
    }

    // Gentle separation from nearby allies so packs don't snag each other while rushing
    let sepX = 0;
    let sepZ = 0;
    for (let i = 0; i < allies.length; i++) {
      const a = allies[i];
      if (a === t || !a.alive) continue;
      const rx = pos.x - a.root.position.x;
      const rz = pos.z - a.root.position.z;
      const d = Math.hypot(rx, rz);
      if (d > 0.1 && d < 10.5) {
        const w = (10.5 - d) / 10.5;
        sepX += (rx / d) * w;
        sepZ += (rz / d) * w;
      }
    }
    if (sepX !== 0 || sepZ !== 0) {
      const repYaw = Math.atan2(sepX, sepZ);
      const repDiff = wrapPi(repYaw - desired);
      desired = wrapPi(desired + clamp(repDiff * 0.4, -0.65, 0.65));
    }

    const err = wrapPi(desired - t.heading);
    steer = clamp(err * 2.6, -1, 1);
    if (Math.abs(err) > 1.35 && throttle > 0) throttle = 0.65;

    // Multi-ray forward obstacle avoidance
    if (throttle > 0 && (this._blocked(0, 22) || this._blocked(0.24, 17) || this._blocked(-0.24, 17))) {
      const l = this._blocked(0.65, 22);
      const r = this._blocked(-0.65, 22);
      this.avoid = l && !r ? -1 : !l && r ? 1 : this.avoid;
      steer = this.avoid;
      throttle = 0.72;
    }

    const stuckRes = stepAntiStuck(this.antiStuck, pos.x, pos.z, t.heading, dt);
    if (stuckRes.overrideThrottle !== null) {
      throttle = stuckRes.overrideThrottle;
      steer = stuckRes.overrideSteer ?? steer;
      brake = false;
      if (stuckRes.reversing) {
        this.avoid = this.antiStuck.avoidSign;
        this.flankSign = this.antiStuck.avoidSign;
      }
    }

    t.update(dt, { throttle, steer, brake }, fx);

    // 2. Aim turret after hull movement & rotation, then check exact alignment for firing
    let aimYaw: number;
    let aimElev = 0;
    let canShoot = false;

    if (tg) {
      const mv = t.stats.muzzleVelocity;
      const tgtPos = this.targetVisible ? tg.root.position : this.lastSeenPos;
      const dx0 = tgtPos.x - pos.x;
      const dz0 = tgtPos.z - pos.z;
      const range = Math.hypot(dx0, dz0);
      const flight = range / (mv * 0.96);

      const weak = computeWeakspotAimOffset({
        botX: pos.x,
        botZ: pos.z,
        targetX: tgtPos.x,
        targetZ: tgtPos.z,
        targetHeading: tg.heading,
        skill: this.skill,
      });

      const leadFactor = this.targetVisible ? 1 : 0.4;
      const tvx = Math.sin(tg.heading) * tg.speed * leadFactor;
      const tvz = Math.cos(tg.heading) * tg.speed * leadFactor;
      const ax = tgtPos.x + weak.ox + tvx * flight;
      const az = tgtPos.z + weak.oz + tvz * flight;
      const ay = tgtPos.y + weak.oy;

      const gp = t.gunPivotWorld(this._a);
      const dx = ax - gp.x;
      const dz = az - gp.z;
      const horiz = Math.hypot(dx, dz);
      const dy = ay - gp.y;
      const noise = (0.0028 / Math.max(0.55, this.skill)) * (1 + range / 300);

      aimYaw = Math.atan2(dx, dz) + this.noiseYaw * noise;
      aimElev = Math.atan2(dy, horiz) + Math.atan2(0.5 * G * flight * flight * 1.05, Math.max(1, horiz)) + this.noiseElev * noise * 0.7;

      t.updateTurret(dt, aimYaw, aimElev);
      t.root.updateMatrixWorld(true);

      const yawErr = Math.abs(wrapPi(aimYaw - t.turretWorldYaw));
      t._gd = t._gd || new THREE.Vector3();
      t.gunDirection(t._gd);
      const elevErr = Math.abs(Math.asin(clamp(t._gd.y, -1, 1)) - aimElev);

      canShoot = computeShotGate({
        range,
        maxEffectiveRange,
        reactT: this.reactT,
        yawErr,
        elevErr,
        hasLineOfSight: this.targetVisible && this._hasLineOfSight(tg),
      });
    } else {
      const dx = this.obj.x - pos.x;
      const dz = this.obj.z - pos.z;
      const sectorYaw = Math.hypot(dx, dz) > 10 ? Math.atan2(dx, dz) : t.heading;
      aimYaw = sectorYaw + Math.sin(performance.now() * 0.0007 + this.index) * 0.45;
      t.updateTurret(dt, aimYaw, aimElev);
      t.root.updateMatrixWorld(true);
    }

    if (canShoot) {
      const shot = t.fire();
      if (shot) this.ballistics.fire({ ...shot, owner: t });
    }
  }
}
