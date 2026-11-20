import * as THREE from 'three';
import { Tank } from './tank';
import { BallisticsSystem, G } from './ballistics';
import { computeShotGate } from './botTactics';
import { BOSS_TANK_ID } from './tanks';
import {
  FLAME_RANGE_M,
  createFlamethrowerHeatState,
  createTargetFireState,
  isPointInFlameStream,
  stepFlamethrowerHeat,
  stepTargetFireExposure,
  type FlamethrowerHeatState,
  type TargetFireState,
} from './flamethrower';
import { audio } from './audio';
import type { GameWorld } from './world';

const wrapPi = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Дистанция между центрами, при которой Маус таранит танк (м). */
export const BOSS_RAM_DISTANCE = 6.0;
export const BOSS_NAME = 'МАУС';

export interface PlayerFireTelemetry {
  inFlame: boolean;
  directDps: number;
  burnDps: number;
  burnRemaining: number;
}

/**
 * ИИ-босс режима «Джагернаут» (Pz.Kpfw. VIII «Маус»):
 * ведёт огонь из 128-мм орудия, применяет огнемёт на 20 м с механикой перегрева
 * и эффектом горения, а также таранит всё на своём пути.
 */
export class JuggernautBoss {
  tank: Tank;
  world: GameWorld;
  ballistics: BallisticsSystem;
  target: Tank | null = null;
  heatState: FlamethrowerHeatState = createFlamethrowerHeatState();
  playerFire: PlayerFireTelemetry = { inFlame: false, directDps: 0, burnDps: 0, burnRemaining: 0 };

  private fireStates = new Map<Tank, TargetFireState>();
  private flameGroup: THREE.Group;
  private flameOuterMesh: THREE.Mesh;
  private flameCoreMesh: THREE.Mesh;
  private flameAnimT = 0;
  private flameParticleAcc = 0;
  private flameSoundT = 0;
  private burnFxAcc = 0;

  private thinkT = 0;
  private avoid = 1;
  private reverseT = 0;
  private stuckT = 0;
  private lastPos = new THREE.Vector3();
  private _a = new THREE.Vector3();
  private _b = new THREE.Vector3();
  private _gd = new THREE.Vector3();
  private _nozzle = new THREE.Vector3();
  private _rayEnd = new THREE.Vector3();
  private _targetCenter = new THREE.Vector3();
  private _fwdZ = new THREE.Vector3(0, 0, 1);
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
      tint: [1, 1, 1],
      specId: BOSS_TANK_ID,
    });
    this.tank.isBot = true;
    ballistics.addTarget(this.tank);
    this.lastPos.copy(this.tank.root.position);

    // Аккуратная прямая струя огня (20 м): конусообразное полупрозрачное пламя + яркое ядро
    this.flameGroup = new THREE.Group();
    this.flameGroup.visible = false;

    const outerGeo = new THREE.CylinderGeometry(0.13, 0.56, 1, 12, 1, true);
    outerGeo.rotateX(Math.PI / 2);
    outerGeo.translate(0, 0, 0.5);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff5a18,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.flameOuterMesh = new THREE.Mesh(outerGeo, outerMat);

    const coreGeo = new THREE.CylinderGeometry(0.06, 0.24, 1, 10, 1, true);
    coreGeo.rotateX(Math.PI / 2);
    coreGeo.translate(0, 0, 0.5);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffd266,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.flameCoreMesh = new THREE.Mesh(coreGeo, coreMat);

    this.flameGroup.add(this.flameOuterMesh, this.flameCoreMesh);
    scene.add(this.flameGroup);
  }

  /** Возрождение босса строго в центре карты. */
  respawn(): void {
    this.tank.reset(0, 0, 0, BOSS_TANK_ID);
    this.target = null;
    this.reverseT = 0;
    this.stuckT = 0;
    this.lastPos.copy(this.tank.root.position);
    this.heatState = createFlamethrowerHeatState();
    this.fireStates.clear();
    this.flameGroup.visible = false;
    this.flameParticleAcc = 0;
    this.flameSoundT = 0;
    this.playerFire = { inFlame: false, directDps: 0, burnDps: 0, burnRemaining: 0 };
  }

  dispose(): void {
    const parent = this.flameGroup.parent;
    if (parent) parent.remove(this.flameGroup);
    this.flameOuterMesh.geometry.dispose();
    (this.flameOuterMesh.material as THREE.Material).dispose();
    this.flameCoreMesh.geometry.dispose();
    (this.flameCoreMesh.material as THREE.Material).dispose();
    this.fireStates.clear();
  }

  get alive(): boolean {
    return this.tank.alive;
  }

  private _blocked(angle: number, dist: number): boolean {
    const t = this.tank;
    const h = t.heading + angle;
    this._a.set(t.root.position.x, t.root.position.y + 1.5, t.root.position.z);
    this._b.set(this._a.x + Math.sin(h) * dist, this._a.y, this._a.z + Math.cos(h) * dist);
    const hit = this.world.segmentHit(this._a, this._b, 2);
    return !!hit && (hit.kind === 'obstacle' || hit.normal.y < 0.68);
  }

  private _los(e: Tank): boolean {
    const t = this.tank;
    this._a.set(t.root.position.x, t.root.position.y + 3.1, t.root.position.z);
    this._b.set(e.root.position.x, e.root.position.y + 1.65, e.root.position.z);
    this._rayEnd.subVectors(this._b, this._a);
    const dist = this._rayEnd.length();
    if (dist < 1e-3) return true;
    this._rayEnd.multiplyScalar(1 / dist);
    return !this.world.raycast(this._a, this._rayEnd, Math.max(0.5, dist - 3.5));
  }

  update(
    dt: number,
    hunters: Tank[],
    fx: Parameters<Tank['update']>[2],
    onFlameKill?: (victim: Tank) => void,
  ): void {
    const t = this.tank;
    if (!t.alive) {
      this.heatState = createFlamethrowerHeatState();
      this.flameGroup.visible = false;
      this.fireStates.clear();
      this.playerFire = { inFlame: false, directDps: 0, burnDps: 0, burnRemaining: 0 };
      t.update(dt, null, fx);
      t.updateTurret(dt, t.turretWorldYaw, t.gunElev);
      return;
    }
    const pos = t.root.position;

    // Поиск ближайшего живого охотника
    this.thinkT -= dt;
    if (this.thinkT <= 0 || !this.target || !this.target.alive) {
      this.thinkT = 0.25;
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

    let wantFlame = false;

    // Орудие + огнемёт: огонь по цели (охотник)
    if (tg) {
      const mv = t.stats.muzzleVelocity;
      const dx0 = tg.root.position.x - pos.x;
      const dz0 = tg.root.position.z - pos.z;
      const range = Math.hypot(dx0, dz0);
      const flight = range / (mv * 0.96);
      const ax = tg.root.position.x + Math.sin(tg.heading) * tg.speed * flight;
      const az = tg.root.position.z + Math.cos(tg.heading) * tg.speed * flight;
      const ay = tg.root.position.y + 1.35;
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

      const hasLos = this._los(tg);
      const canShoot = computeShotGate({
        range,
        maxEffectiveRange: t.stats.maxRange - 12,
        reactT: 0,
        yawErr,
        elevErr,
        hasLineOfSight: hasLos,
      });
      if (canShoot) {
        const shot = t.fire();
        if (shot) this.ballistics.fire({ ...shot, owner: t });
      }

      // Огнемёт включается без фиксированного КД на дистанции до 20 м (с учётом выноса ствола ~2 м)
      t.flameMuzzleWorld(this._nozzle);
      const nozzleDist = Math.hypot(tg.root.position.x - this._nozzle.x, tg.root.position.z - this._nozzle.z);
      if (nozzleDist <= FLAME_RANGE_M + 1.2 && yawErr <= 0.65 && hasLos) {
        wantFlame = true;
      }
    } else {
      t.updateTurret(dt, t.heading, 0);
      t.root.updateMatrixWorld(true);
      t.flameMuzzleWorld(this._nozzle);
      t.gunDirection(this._gd);
    }

    // Обновление перегрева и струи огнемёта
    stepFlamethrowerHeat(this.heatState, wantFlame, dt);
    this.flameAnimT += dt;
    this.flameSoundT = Math.max(0, this.flameSoundT - dt);

    let effectiveRange = FLAME_RANGE_M;
    if (this.heatState.active) {
      this._rayEnd.copy(this._nozzle).addScaledVector(this._gd, FLAME_RANGE_M);
      const occ = this.world.segmentHit(this._nozzle, this._rayEnd, 1.5);
      if (occ) effectiveRange = Math.max(1.5, occ.t);

      this.flameGroup.visible = true;
      this.flameGroup.position.copy(this._nozzle);
      this.flameGroup.quaternion.setFromUnitVectors(this._fwdZ, this._gd);
      const flicker = 1 + 0.1 * Math.sin(this.flameAnimT * 44);
      const wScale = 0.85 + 0.15 * flicker;
      this.flameOuterMesh.scale.set(wScale, wScale, effectiveRange);
      this.flameCoreMesh.scale.set(0.95 * flicker, 0.95 * flicker, effectiveRange * 0.94);

      if (this.flameSoundT <= 0) {
        this.flameSoundT = 0.28;
        audio.play('flame', this._nozzle, 0.72);
      }

      if (fx) {
        this.flameParticleAcc += dt * 26;
        while (this.flameParticleAcc >= 1) {
          this.flameParticleAcc -= 1;
          const spd = Math.min(30, effectiveRange * 1.45 + 6);
          const life = Math.min(0.66, effectiveRange / spd);
          fx.emit({
            additive: true,
            x: this._nozzle.x + (Math.random() - 0.5) * 0.18,
            y: this._nozzle.y + (Math.random() - 0.5) * 0.18,
            z: this._nozzle.z + (Math.random() - 0.5) * 0.18,
            vx: this._gd.x * spd + (Math.random() - 0.5) * 1.6,
            vy: this._gd.y * spd + 0.5 + (Math.random() - 0.5) * 1.2,
            vz: this._gd.z * spd + (Math.random() - 0.5) * 1.6,
            life,
            s0: 0.45,
            s1: 1.1,
            r: 1,
            g: 0.52 + Math.random() * 0.28,
            b: 0.12,
            a: 0.58,
            drag: 0.2,
            grav: 1.2,
          });
        }
      }
    } else {
      this.flameGroup.visible = false;
      this.flameParticleAcc = 0;
    }

    // Урон от прямого огня (-20/-40/-60 ХП/с) и остаточное горение (-10 ХП/с в течение 4с)
    this.burnFxAcc += dt;
    const emitBurnWisp = this.burnFxAcc >= 0.11;
    if (emitBurnWisp) this.burnFxAcc = 0;

    let playerUpdated = false;
    for (const h of hunters) {
      if (!h.alive) {
        this.fireStates.delete(h);
        continue;
      }

      let fire = this.fireStates.get(h);
      if (!fire) {
        fire = createTargetFireState();
        this.fireStates.set(h, fire);
      }

      let inFlame = false;
      if (this.heatState.active) {
        this._targetCenter.set(h.root.position.x, h.root.position.y + 1.25, h.root.position.z);
        inFlame = isPointInFlameStream(this._nozzle, this._gd, effectiveRange, this._targetCenter, 1.9);
      }

      const res = stepTargetFireExposure(fire, inFlame, dt, h.god);
      if (res.damage > 0) {
        h.hp -= res.damage;
        if (h.hp <= 0 && h.alive) {
          h.hp = 0;
          h.destroy(false);
          audio.play('bigexplosion', h.root.position);
          fire.exposureSec = 0;
          fire.burnSec = 0;
          this.fireStates.delete(h);
          onFlameKill?.(h);
        }
      }

      if (h.alive && res.burning && emitBurnWisp && fx) {
        fx.emit({
          additive: true,
          x: h.root.position.x + (Math.random() - 0.5) * 1.4,
          y: h.root.position.y + 1.45,
          z: h.root.position.z + (Math.random() - 0.5) * 1.4,
          vx: (Math.random() - 0.5) * 1.0,
          vy: 2.4 + Math.random() * 1.4,
          vz: (Math.random() - 0.5) * 1.0,
          life: 0.36,
          s0: 0.7,
          s1: 0.25,
          r: 1,
          g: 0.48,
          b: 0.1,
          a: 0.65,
          drag: 1.0,
        });
      }

      if (h.isPlayer) {
        playerUpdated = true;
        this.playerFire.inFlame = res.inFlame && h.alive;
        this.playerFire.directDps = h.alive ? res.directDps : 0;
        this.playerFire.burnDps = h.alive ? res.burnDps : 0;
        this.playerFire.burnRemaining = h.alive ? res.burnRemaining : 0;
      }
    }

    if (!playerUpdated) {
      this.playerFire.inFlame = false;
      this.playerFire.directDps = 0;
      this.playerFire.burnDps = 0;
      this.playerFire.burnRemaining = 0;
    }
  }
}
