import * as THREE from 'three';
import { BARREL_HITBOX_BOUNDS, resolveHit, resolveMgHit, type HitPart, type HitResolution } from './damage';
import { computeKstamSplashDamage } from './abilities';
import { canInterceptProjectile, triggerApsIntercept } from './aps';
import { audio } from './audio';
import { BOSS_BASE_DAMAGE } from './tanks';
import type { Tank } from './tank';
import type { GameWorld, ObstacleBox } from './world';

export const G = 9.81;
export const DRAG_K = 6e-5;
export const SUBSTEP = 1 / 120;
const MAX_AGE = 12;
const DEFAULT_MAX_RANGE = 400; // meters
const TRAIL_N = 22;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const VERT = `
attribute float aSize; attribute vec4 aColor;
uniform float uScale; varying vec4 vColor;
void main(){
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  if (aSize <= 0.0001 || aColor.a <= 0.001 || mv.z > -0.05) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 512.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
precision mediump float; varying vec4 vColor; uniform float uBoost;
void main(){
  if (vColor.a <= 0.002) discard;
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.12, d);
  if (a <= 0.002) discard;
  vec3 rgb = min(vColor.rgb * uBoost, vec3(6.0));
  gl_FragColor = vec4(rgb, vColor.a * a);
}`;

interface ParticleEmitOptions {
  additive?: boolean;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life?: number;
  s0?: number;
  s1?: number;
  r?: number;
  g?: number;
  b?: number;
  a?: number;
  drag?: number;
  grav?: number;
}

class Pool {
  max: number;
  next = 0;
  alive = 0;
  pos: Float32Array;
  size: Float32Array;
  col: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  s0: Float32Array;
  s1: Float32Array;
  a0: Float32Array;
  drag: Float32Array;
  grav: Float32Array;
  geo: THREE.BufferGeometry;
  points: THREE.Points;

  constructor(scene: THREE.Scene, max: number, additive: boolean, uniforms: { uScale: { value: number } }) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.col = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: uniforms.uScale, uBoost: { value: additive ? 2.6 : 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  add(o: ParticleEmitOptions): void {
    const i = this.next;
    this.next = (i + 1) % this.max;
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0;
    this.vel[i * 3 + 1] = o.vy || 0;
    this.vel[i * 3 + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.s0[i] = o.s0 ?? 1;
    this.s1[i] = o.s1 ?? 1;
    this.size[i] = this.s0[i];
    this.col[i * 4] = o.r ?? 1;
    this.col[i * 4 + 1] = o.g ?? 1;
    this.col[i * 4 + 2] = o.b ?? 1;
    this.col[i * 4 + 3] = 0;
    this.a0[i] = o.a ?? 1;
    this.drag[i] = o.drag || 0;
    this.grav[i] = o.grav || 0;
    this.alive++;
  }

  update(dt: number): void {
    if (this.alive <= 0) return;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      alive++;
      const t = 1 - this.life[i] / this.maxLife[i];
      const k = 1 / (1 + this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t) * (1 - t) * Math.min(1, t * 12 + 0.15);
    }
    this.alive = alive;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
  clear(): void {
    this.life.fill(0);
    this.size.fill(0);
    this.col.fill(0);
    this.alive = 0;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

export class Particles {
  uniforms = { uScale: { value: 800 } };
  density = 1;
  glow: Pool;
  smoke: Pool;

  constructor(scene: THREE.Scene) {
    this.glow = new Pool(scene, 750, true, this.uniforms);
    this.smoke = new Pool(scene, 950, false, this.uniforms);
  }
  setDensity(d: number): void {
    this.density = Number.isFinite(d) ? Math.max(0.25, Math.min(1.5, d)) : 1;
  }
  emit(o: ParticleEmitOptions): void {
    if (this.density < 0.999) {
      const keepChance = o.additive ? Math.max(0.45, this.density) : this.density;
      if (Math.random() > keepChance) return;
    }
    const pool = o.additive ? this.glow : this.smoke;
    if (this.density > 1.05) {
      const boost = 1 + (this.density - 1) * 0.22;
      pool.add({
        ...o,
        s0: (o.s0 ?? 1) * boost,
        s1: (o.s1 ?? 1) * boost,
      });
      if (!o.additive && Math.random() < (this.density - 1) * 0.55) {
        pool.add({
          ...o,
          x: o.x + rnd(-0.35, 0.35),
          y: o.y + rnd(0, 0.35),
          z: o.z + rnd(-0.35, 0.35),
          vx: (o.vx || 0) * 0.8 + rnd(-1.2, 1.2),
          vy: (o.vy || 0) * 0.85 + rnd(0.2, 1.4),
          vz: (o.vz || 0) * 0.8 + rnd(-1.2, 1.2),
          life: (o.life || 1) * 0.85,
          a: (o.a ?? 1) * 0.72,
        });
      }
      return;
    }
    pool.add(o);
  }
  setViewScale(px: number): void {
    this.uniforms.uScale.value = px;
  }
  update(dt: number): void {
    this.glow.update(dt);
    this.smoke.update(dt);
  }
  clear(): void {
    this.glow.clear();
    this.smoke.clear();
  }
}

interface HitBox {
  part: HitPart;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

// Hull-space hitboxes (+Z front, -Z rear, +X left, -X right)
const HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.45, 0.05, -3.28), max: new THREE.Vector3(1.45, 1.72, 3.48) },
  { part: 'trackL', min: new THREE.Vector3(1.47, 0.03, -3.48), max: new THREE.Vector3(2.08, 1.06, 3.48) },
  { part: 'trackR', min: new THREE.Vector3(-2.08, 0.03, -3.48), max: new THREE.Vector3(-1.47, 1.06, 3.48) },
  // Explicit T-55 fuel tank weakspots on rear-side fenders & rear external fuel drums
  { part: 'fuel', min: new THREE.Vector3(0.95, 0.96, -3.22), max: new THREE.Vector3(1.66, 1.62, -1.15) },
  { part: 'fuel', min: new THREE.Vector3(-1.66, 0.96, -3.22), max: new THREE.Vector3(-0.95, 1.62, -1.15) },
  { part: 'fuel', min: new THREE.Vector3(-1.28, 0.98, -3.56), max: new THREE.Vector3(1.28, 1.6, -2.8) },
];
const M60_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.59, 0.05, -3.46), max: new THREE.Vector3(1.59, 1.94, 3.65) },
  { part: 'trackL', min: new THREE.Vector3(1.61, 0.03, -3.6), max: new THREE.Vector3(2.22, 1.12, 3.6) },
  { part: 'trackR', min: new THREE.Vector3(-2.22, 0.03, -3.6), max: new THREE.Vector3(-1.61, 1.12, 3.6) },
  // M60A3 Patton rear hull fuel cells & rear manifold weakspots
  { part: 'fuel', min: new THREE.Vector3(1.05, 1.04, -3.42), max: new THREE.Vector3(1.78, 1.78, -1.25) },
  { part: 'fuel', min: new THREE.Vector3(-1.78, 1.04, -3.42), max: new THREE.Vector3(-1.05, 1.78, -1.25) },
  { part: 'fuel', min: new THREE.Vector3(-1.35, 1.08, -3.62), max: new THREE.Vector3(1.35, 1.78, -2.85) },
];
const T62M_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.48, 0.05, -3.62), max: new THREE.Vector3(1.48, 1.72, 3.78) },
  { part: 'trackL', min: new THREE.Vector3(1.48, 0.03, -3.72), max: new THREE.Vector3(2.12, 1.08, 3.75) },
  { part: 'trackR', min: new THREE.Vector3(-2.12, 0.03, -3.72), max: new THREE.Vector3(-1.48, 1.08, 3.75) },
  // T-62M rear-side fender fuel tanks & rear external fuel drums (vulnerable oneshot zone)
  { part: 'fuel', min: new THREE.Vector3(0.95, 0.96, -3.55), max: new THREE.Vector3(1.68, 1.62, -1.35) },
  { part: 'fuel', min: new THREE.Vector3(-1.68, 0.96, -3.55), max: new THREE.Vector3(-0.95, 1.62, -1.35) },
  { part: 'fuel', min: new THREE.Vector3(-1.32, 0.98, -3.94), max: new THREE.Vector3(1.32, 1.62, -3.1) },
];
const T72B3_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.53, 0.05, -3.48), max: new THREE.Vector3(1.53, 1.72, 3.66) },
  { part: 'trackL', min: new THREE.Vector3(1.53, 0.03, -3.6), max: new THREE.Vector3(2.18, 1.1, 3.65) },
  { part: 'trackR', min: new THREE.Vector3(-2.18, 0.03, -3.6), max: new THREE.Vector3(-1.53, 1.1, 3.65) },
  // T-72B3 rear-side fender fuel cells & rear external fuel drums (vulnerable oneshot zone)
  { part: 'fuel', min: new THREE.Vector3(0.98, 0.96, -3.4), max: new THREE.Vector3(1.72, 1.62, -1.3) },
  { part: 'fuel', min: new THREE.Vector3(-1.72, 0.96, -3.4), max: new THREE.Vector3(-0.98, 1.62, -1.3) },
  { part: 'fuel', min: new THREE.Vector3(-1.32, 0.98, -3.82), max: new THREE.Vector3(1.32, 1.62, -3.0) },
];
const LEOPARD2A4_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.56, 0.05, -3.72), max: new THREE.Vector3(1.56, 1.7, 3.74) },
  { part: 'trackL', min: new THREE.Vector3(1.56, 0.03, -3.76), max: new THREE.Vector3(2.2, 1.1, 3.76) },
  { part: 'trackR', min: new THREE.Vector3(-2.2, 0.03, -3.76), max: new THREE.Vector3(-1.56, 1.1, 3.76) },
  // Leopard 2A4 rear hull fuel tank bays (vulnerable oneshot weakspot)
  { part: 'fuel', min: new THREE.Vector3(0.95, 0.92, -3.74), max: new THREE.Vector3(1.72, 1.64, -1.45) },
  { part: 'fuel', min: new THREE.Vector3(-1.72, 0.92, -3.74), max: new THREE.Vector3(-0.95, 1.64, -1.45) },
  { part: 'fuel', min: new THREE.Vector3(-1.35, 0.92, -3.78), max: new THREE.Vector3(1.35, 1.64, -2.95) },
];
const M1A1_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.6, 0.05, -3.7), max: new THREE.Vector3(1.6, 1.74, 3.76) },
  { part: 'trackL', min: new THREE.Vector3(1.61, 0.03, -3.78), max: new THREE.Vector3(2.24, 1.12, 3.78) },
  { part: 'trackR', min: new THREE.Vector3(-2.24, 0.03, -3.78), max: new THREE.Vector3(-1.61, 1.12, 3.78) },
  // M1A1 rear sponson fuel cells & rear fuel panel (vulnerable oneshot weakspot)
  { part: 'fuel', min: new THREE.Vector3(0.96, 0.94, -3.72), max: new THREE.Vector3(1.74, 1.66, -1.45) },
  { part: 'fuel', min: new THREE.Vector3(-1.74, 0.94, -3.72), max: new THREE.Vector3(-0.96, 1.66, -1.45) },
  { part: 'fuel', min: new THREE.Vector3(-1.4, 0.94, -3.8), max: new THREE.Vector3(1.4, 1.66, -3.05) },
];
const ZTZ96A_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.52, 0.05, -3.55), max: new THREE.Vector3(1.52, 1.7, 3.64) },
  { part: 'trackL', min: new THREE.Vector3(1.53, 0.03, -3.62), max: new THREE.Vector3(2.16, 1.08, 3.64) },
  { part: 'trackR', min: new THREE.Vector3(-2.16, 0.03, -3.62), max: new THREE.Vector3(-1.53, 1.08, 3.64) },
  // ZTZ-96A rear fender fuel cells & rear fuel panel (vulnerable oneshot weakspot)
  { part: 'fuel', min: new THREE.Vector3(0.94, 0.94, -3.5), max: new THREE.Vector3(1.7, 1.6, -1.35) },
  { part: 'fuel', min: new THREE.Vector3(-1.7, 0.94, -3.5), max: new THREE.Vector3(-0.94, 1.6, -1.35) },
  { part: 'fuel', min: new THREE.Vector3(-1.3, 0.94, -3.58), max: new THREE.Vector3(1.3, 1.6, -2.9) },
];
const T90M_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.54, 0.05, -3.5), max: new THREE.Vector3(1.54, 1.72, 3.68) },
  { part: 'trackL', min: new THREE.Vector3(1.55, 0.03, -3.58), max: new THREE.Vector3(2.18, 1.1, 3.66) },
  { part: 'trackR', min: new THREE.Vector3(-2.18, 0.03, -3.58), max: new THREE.Vector3(-1.55, 1.1, 3.66) },
  // T-90M rear fender fuel cells & external fuel drums (vulnerable oneshot weakspot)
  { part: 'fuel', min: new THREE.Vector3(0.96, 0.94, -3.46), max: new THREE.Vector3(1.72, 1.6, -1.34) },
  { part: 'fuel', min: new THREE.Vector3(-1.72, 0.94, -3.46), max: new THREE.Vector3(-0.96, 1.6, -1.34) },
  { part: 'fuel', min: new THREE.Vector3(-1.32, 0.96, -3.62), max: new THREE.Vector3(1.32, 1.62, -2.9) },
];
const MERKAVA4_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.55, 0.05, -3.72), max: new THREE.Vector3(1.55, 1.74, 3.94) },
  { part: 'trackL', min: new THREE.Vector3(1.56, 0.03, -3.76), max: new THREE.Vector3(2.2, 1.12, 3.76) },
  { part: 'trackR', min: new THREE.Vector3(-2.2, 0.03, -3.76), max: new THREE.Vector3(-1.56, 1.12, 3.76) },
  // Merkava Mk.4 rear fender & rear hatch fuel cells (vulnerable oneshot weakspot)
  { part: 'fuel', min: new THREE.Vector3(0.96, 0.96, -3.72), max: new THREE.Vector3(1.86, 1.64, -1.65) },
  { part: 'fuel', min: new THREE.Vector3(-1.86, 0.96, -3.72), max: new THREE.Vector3(-0.96, 1.64, -1.65) },
  { part: 'fuel', min: new THREE.Vector3(-1.35, 1.0, -3.84), max: new THREE.Vector3(1.35, 1.68, -3.1) },
];
const CHALLENGER2_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.56, 0.05, -3.86), max: new THREE.Vector3(1.56, 1.74, 3.88) },
  { part: 'trackL', min: new THREE.Vector3(1.57, 0.03, -3.82), max: new THREE.Vector3(2.22, 1.12, 3.82) },
  { part: 'trackR', min: new THREE.Vector3(-2.22, 0.03, -3.82), max: new THREE.Vector3(-1.57, 1.12, 3.82) },
  // Challenger 2 rear fender fuel cells & twin rear external fuel drums (vulnerable oneshot weakspot)
  { part: 'fuel', min: new THREE.Vector3(0.96, 0.96, -3.65), max: new THREE.Vector3(1.86, 1.64, -1.48) },
  { part: 'fuel', min: new THREE.Vector3(-1.86, 0.96, -3.65), max: new THREE.Vector3(-0.96, 1.64, -1.48) },
  { part: 'fuel', min: new THREE.Vector3(-1.38, 0.96, -4.24), max: new THREE.Vector3(1.38, 1.66, -3.2) },
];
const LECLERC_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.5, 0.05, -3.48), max: new THREE.Vector3(1.5, 1.58, 3.65) },
  { part: 'trackL', min: new THREE.Vector3(1.51, 0.03, -3.55), max: new THREE.Vector3(2.15, 1.08, 3.58) },
  { part: 'trackR', min: new THREE.Vector3(-2.15, 0.03, -3.55), max: new THREE.Vector3(-1.51, 1.08, 3.58) },
  // AMX-56 Leclerc rear fender & rear fuel cells (vulnerable oneshot weakspot)
  { part: 'fuel', min: new THREE.Vector3(0.95, 0.92, -3.48), max: new THREE.Vector3(1.74, 1.52, -1.45) },
  { part: 'fuel', min: new THREE.Vector3(-1.74, 0.92, -3.48), max: new THREE.Vector3(-0.95, 1.52, -1.45) },
  { part: 'fuel', min: new THREE.Vector3(-1.3, 0.96, -3.65), max: new THREE.Vector3(1.3, 1.56, -2.9) },
];
const LEOPARD2A7V_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.54, 0.05, -3.86), max: new THREE.Vector3(1.54, 1.7, 4.02) },
  { part: 'trackL', min: new THREE.Vector3(1.55, 0.03, -3.8), max: new THREE.Vector3(2.22, 1.12, 3.82) },
  { part: 'trackR', min: new THREE.Vector3(-2.22, 0.03, -3.8), max: new THREE.Vector3(-1.55, 1.12, 3.82) },
  // Leopard 2A7V rear fender & rear fuel cells (vulnerable oneshot weakspot)
  { part: 'fuel', min: new THREE.Vector3(0.96, 0.94, -3.72), max: new THREE.Vector3(1.84, 1.64, -1.55) },
  { part: 'fuel', min: new THREE.Vector3(-1.84, 0.94, -3.72), max: new THREE.Vector3(-0.96, 1.64, -1.55) },
  { part: 'fuel', min: new THREE.Vector3(-1.35, 0.96, -3.96), max: new THREE.Vector3(1.35, 1.64, -3.15) },
];
const K2_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.48, 0.05, -3.52), max: new THREE.Vector3(1.48, 1.56, 3.66) },
  { part: 'trackL', min: new THREE.Vector3(1.52, 0.03, -3.54), max: new THREE.Vector3(2.12, 1.08, 3.58) },
  { part: 'trackR', min: new THREE.Vector3(-2.12, 0.03, -3.54), max: new THREE.Vector3(-1.52, 1.08, 3.58) },
  { part: 'fuel', min: new THREE.Vector3(0.92, 0.92, -3.48), max: new THREE.Vector3(1.7, 1.5, -1.45) },
  { part: 'fuel', min: new THREE.Vector3(-1.7, 0.92, -3.48), max: new THREE.Vector3(-0.92, 1.5, -1.45) },
  { part: 'fuel', min: new THREE.Vector3(-1.3, 0.94, -3.6), max: new THREE.Vector3(1.3, 1.52, -2.92) },
];
const M1A2SEP_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.56, 0.05, -3.76), max: new THREE.Vector3(1.56, 1.7, 3.82) },
  { part: 'trackL', min: new THREE.Vector3(1.58, 0.03, -3.82), max: new THREE.Vector3(2.24, 1.12, 3.84) },
  { part: 'trackR', min: new THREE.Vector3(-2.24, 0.03, -3.82), max: new THREE.Vector3(-1.58, 1.12, 3.84) },
  { part: 'fuel', min: new THREE.Vector3(0.96, 0.94, -3.76), max: new THREE.Vector3(1.78, 1.62, -1.52) },
  { part: 'fuel', min: new THREE.Vector3(-1.78, 0.94, -3.76), max: new THREE.Vector3(-0.96, 1.62, -1.52) },
  { part: 'fuel', min: new THREE.Vector3(-1.38, 0.94, -3.84), max: new THREE.Vector3(1.38, 1.62, -3.08) },
];
const MAUS_HULL_BOXES: HitBox[] = [
  { part: 'hull', min: new THREE.Vector3(-1.88, 0.05, -4.62), max: new THREE.Vector3(1.88, 2.26, 4.58) },
  { part: 'trackL', min: new THREE.Vector3(1.18, 0.03, -4.35), max: new THREE.Vector3(1.88, 0.92, 4.15) },
  { part: 'trackR', min: new THREE.Vector3(-1.88, 0.03, -4.35), max: new THREE.Vector3(-1.18, 0.92, 4.15) },
];
// Turret-space hitbox (rotates with turretGroup!)
const TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.35, 0.0, -1.85), max: new THREE.Vector3(1.35, 1.15, 1.6) };
const M60_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.42, 0.0, -2.25), max: new THREE.Vector3(1.42, 1.32, 1.85) };
const T62M_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.48, 0.0, -1.98), max: new THREE.Vector3(1.48, 1.04, 1.82) };
const T72B3_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.52, 0.0, -1.92), max: new THREE.Vector3(1.52, 1.08, 1.85) };
const LEOPARD2A4_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.48, 0.0, -2.65), max: new THREE.Vector3(1.48, 1.05, 1.52) };
const M1A1_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.56, 0.0, -2.7), max: new THREE.Vector3(1.56, 1.18, 1.78) };
const ZTZ96A_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.5, 0.0, -2.35), max: new THREE.Vector3(1.5, 1.1, 1.76) };
const T90M_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.53, 0.0, -2.6), max: new THREE.Vector3(1.53, 1.12, 1.8) };
const MERKAVA4_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.78, 0.0, -2.58), max: new THREE.Vector3(1.78, 0.96, 1.82) };
const CHALLENGER2_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.68, 0.0, -2.75), max: new THREE.Vector3(1.68, 1.18, 1.85) };
const LECLERC_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.58, 0.0, -2.72), max: new THREE.Vector3(1.58, 0.98, 1.72) };
const LEOPARD2A7V_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.66, 0.0, -2.9), max: new THREE.Vector3(1.66, 1.1, 2.38) };
const K2_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.58, 0.0, -2.85), max: new THREE.Vector3(1.58, 0.98, 1.82) };
const M1A2SEP_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.64, 0.0, -2.92), max: new THREE.Vector3(1.64, 1.14, 1.94) };
const MAUS_TURRET_BOX: HitBox = { part: 'turret', min: new THREE.Vector3(-1.58, 0.0, -2.72), max: new THREE.Vector3(1.58, 1.44, 1.98) };

function getHullBoxesForTank(id: string): HitBox[] {
  switch (id) {
    case 'maus':
      return MAUS_HULL_BOXES;
    case 'm60a3':
      return M60_HULL_BOXES;
    case 'leopard2a4':
      return LEOPARD2A4_HULL_BOXES;
    case 't72b3':
      return T72B3_HULL_BOXES;
    case 't62m':
      return T62M_HULL_BOXES;
    case 'm1a1':
      return M1A1_HULL_BOXES;
    case 'ztz96a':
      return ZTZ96A_HULL_BOXES;
    case 't90m':
      return T90M_HULL_BOXES;
    case 'merkava4':
      return MERKAVA4_HULL_BOXES;
    case 'challenger2':
      return CHALLENGER2_HULL_BOXES;
    case 'leclerc':
      return LECLERC_HULL_BOXES;
    case 'leopard2a7v':
      return LEOPARD2A7V_HULL_BOXES;
    case 'k2':
      return K2_HULL_BOXES;
    case 'm1a2sep':
      return M1A2SEP_HULL_BOXES;
    default:
      return HULL_BOXES;
  }
}

function getTurretBoxForTank(id: string): HitBox {
  switch (id) {
    case 'maus':
      return MAUS_TURRET_BOX;
    case 'm60a3':
      return M60_TURRET_BOX;
    case 'leopard2a4':
      return LEOPARD2A4_TURRET_BOX;
    case 't72b3':
      return T72B3_TURRET_BOX;
    case 't62m':
      return T62M_TURRET_BOX;
    case 'm1a1':
      return M1A1_TURRET_BOX;
    case 'ztz96a':
      return ZTZ96A_TURRET_BOX;
    case 't90m':
      return T90M_TURRET_BOX;
    case 'merkava4':
      return MERKAVA4_TURRET_BOX;
    case 'challenger2':
      return CHALLENGER2_TURRET_BOX;
    case 'leclerc':
      return LECLERC_TURRET_BOX;
    case 'leopard2a7v':
      return LEOPARD2A7V_TURRET_BOX;
    case 'k2':
      return K2_TURRET_BOX;
    case 'm1a2sep':
      return M1A2SEP_TURRET_BOX;
    default:
      return TURRET_BOX;
  }
}

export function getFuelBoxesForTank(id: string): Array<{ min: THREE.Vector3; max: THREE.Vector3 }> {
  return getHullBoxesForTank(id)
    .filter((b) => b.part === 'fuel')
    .map((b) => ({ min: b.min, max: b.max }));
}
// Gun-pivot-space hitbox (elevates & rotates with barrel! Expanded around barrel & muzzle)
const BARREL_BOX: HitBox = {
  part: 'barrel',
  min: new THREE.Vector3(BARREL_HITBOX_BOUNDS.min.x, BARREL_HITBOX_BOUNDS.min.y, BARREL_HITBOX_BOUNDS.min.z),
  max: new THREE.Vector3(BARREL_HITBOX_BOUNDS.max.x, BARREL_HITBOX_BOUNDS.max.y, BARREL_HITBOX_BOUNDS.max.z),
};

const _slabN = new THREE.Vector3();
const _la = new THREE.Vector3();
const _lb = new THREE.Vector3();
const _ld = new THREE.Vector3();
const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _td = new THREE.Vector3();
const _ga = new THREE.Vector3();
const _gb = new THREE.Vector3();
const _gd = new THREE.Vector3();
const _bestN = new THREE.Vector3();
const _bestLd = new THREE.Vector3();

function slab(o: THREE.Vector3, d: THREE.Vector3, len: number, box: HitBox, outN: THREE.Vector3): number | null {
  let tmin = 0;
  let tmax = len;
  let ax = -1;
  let sg = 0;
  for (let i = 0; i < 3; i++) {
    const oi = i === 0 ? o.x : i === 1 ? o.y : o.z;
    const di = i === 0 ? d.x : i === 1 ? d.y : d.z;
    const mni = i === 0 ? box.min.x : i === 1 ? box.min.y : box.min.z;
    const mxi = i === 0 ? box.max.x : i === 1 ? box.max.y : box.max.z;
    if (Math.abs(di) < 1e-9) {
      if (oi < mni || oi > mxi) return null;
      continue;
    }
    let t1 = (mni - oi) / di;
    let t2 = (mxi - oi) / di;
    let s = -1;
    if (t1 > t2) {
      const x = t1;
      t1 = t2;
      t2 = x;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      ax = i;
      sg = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  outN.set(0, ax < 0 ? 1 : 0, 0);
  if (ax >= 0) outN.setComponent(ax, sg);
  return tmin;
}

export interface TankHitEvent {
  target: Tank;
  owner: Tank | null;
  result: string;
  damage: number;
  destroyed: boolean;
  isMg?: boolean;
  point: THREE.Vector3;
  zone: string;
  part: HitPart;
  side: 'L' | 'R';
  lp: THREE.Vector3;
  ld: THREE.Vector3;
  detail: HitResolution;
}

export interface ApsInterceptEvent {
  target: Tank;
  owner: Tank | null;
  point: THREE.Vector3;
  cooldown: number;
}

export interface ImpactEvent {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  kind: 'ground' | 'obstacle';
  obstacle: ObstacleBox | null;
  velocity: THREE.Vector3;
  speed: number;
  distance: number;
  shell: {
    type: string;
    caliber: number;
    muzzleVelocity: number;
    penetrationMm: number;
    maxRange: number;
    gunDamage?: number;
    mgDamage?: number;
    ignoreArmor?: boolean;
    fixedDamage?: number;
    ignoreAps?: boolean;
  };
}

export interface MissEvent {
  owner: Tank | null;
  point: THREE.Vector3;
  kind: 'ground' | 'obstacle' | 'range' | 'kstam';
  isMg: boolean;
  hadTankImpact: boolean;
  suppressMissVoice: boolean;
}

interface Projectile {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  dist: number;
  acc: number;
  snapped?: boolean;
  hadTankImpact?: boolean;
  suppressMissVoice?: boolean;
  group: THREE.Group;
  trail: THREE.Line;
  trailPos: Float32Array;
  shell: {
    type: string;
    caliber: number;
    muzzleVelocity: number;
    penetrationMm: number;
    maxRange: number;
    gunDamage?: number;
    mgDamage?: number;
    ignoreArmor?: boolean;
    fixedDamage?: number;
    ignoreAps?: boolean;
  };
  owner: Tank | null;
  kstam?: {
    target: Tank | null;
    startPos: THREE.Vector3;
    targetPoint: THREE.Vector3;
    elapsed: number;
    duration: number;
    apexHeight: number;
    splashRadius: number;
    maxSplashDmg: number;
  };
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
}

export class BallisticsSystem {
  scene: THREE.Scene;
  world: GameWorld;
  fx: Particles;
  projectiles: Projectile[] = [];
  listeners: Array<(e: ImpactEvent) => void> = [];
  tankListeners: Array<(e: TankHitEvent) => void> = [];
  apsListeners: Array<(e: ApsInterceptEvent) => void> = [];
  missListeners: Array<(e: MissEvent) => void> = [];
  targets: Tank[] = [];

  private _inv = new Map<Tank, THREE.Matrix4>();
  private _invTurret = new Map<Tank, THREE.Matrix4>();
  private _invGun = new Map<Tank, THREE.Matrix4>();
  private _q2 = new THREE.Quaternion();
  private _v = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _up = new THREE.Vector3(0, 0, 1);

  streakGeo: THREE.BoxGeometry;
  coreGeo: THREE.SphereGeometry;
  streakMat: THREE.MeshBasicMaterial;
  coreMat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  lightT = 0;

  decals: THREE.Mesh[] = [];
  decalNext = 0;
  decalGeo: THREE.CircleGeometry;
  decalMat: THREE.MeshBasicMaterial;

  shockwaves: ShockwaveRing[] = [];
  ringGeo: THREE.RingGeometry;

  constructor(scene: THREE.Scene, world: GameWorld) {
    this.scene = scene;
    this.world = world;
    this.fx = new Particles(scene);

    this.streakGeo = new THREE.BoxGeometry(0.16, 0.16, 1);
    this.streakGeo.translate(0, 0, -0.5);
    this.coreGeo = new THREE.SphereGeometry(0.28, 8, 6);
    this.streakMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(3.2, 1.7, 0.5),
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.4), fog: false });

    this.light = new THREE.PointLight(0xffa855, 0, 90, 2);
    scene.add(this.light);

    this.decalGeo = new THREE.CircleGeometry(1, 18);
    this.decalMat = new THREE.MeshBasicMaterial({
      color: 0x090806,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.ringGeo = new THREE.RingGeometry(0.65, 1.0, 28);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  onImpact(fn: (e: ImpactEvent) => void): void {
    this.listeners.push(fn);
  }
  onTankHit(fn: (e: TankHitEvent) => void): void {
    this.tankListeners.push(fn);
  }
  onApsIntercept(fn: (e: ApsInterceptEvent) => void): void {
    this.apsListeners.push(fn);
  }
  onMiss(fn: (e: MissEvent) => void): void {
    this.missListeners.push(fn);
  }
  addTarget(tank: Tank): void {
    this.targets.push(tank);
  }

  private _emitApsInterceptFx(pt: THREE.Vector3): void {
    const fx = this.fx;
    // Bright Trophy APS air-burst core flash
    fx.emit({ additive: true, x: pt.x, y: pt.y, z: pt.z, life: 0.22, s0: 4.5, s1: 11, r: 0.72, g: 0.96, b: 1, a: 1 });
    fx.emit({ additive: true, x: pt.x, y: pt.y, z: pt.z, life: 0.14, s0: 2.8, s1: 6.5, r: 1, g: 0.88, b: 0.48, a: 1 });
    for (let i = 0; i < 16; i++) {
      const cyan = i % 2 === 0;
      fx.emit({
        additive: true,
        x: pt.x,
        y: pt.y,
        z: pt.z,
        vx: rnd(-16, 16),
        vy: rnd(-4, 16),
        vz: rnd(-16, 16),
        life: rnd(0.28, 0.62),
        s0: 0.42,
        s1: 0.12,
        r: cyan ? 0.6 : 1,
        g: cyan ? 0.92 : 0.75,
        b: cyan ? 1 : 0.3,
        a: 1,
        grav: -16,
      });
    }
    for (let i = 0; i < 6; i++) {
      fx.emit({
        x: pt.x,
        y: pt.y,
        z: pt.z,
        vx: rnd(-4, 4),
        vy: rnd(1, 5),
        vz: rnd(-4, 4),
        life: rnd(0.6, 1.2),
        s0: 0.9,
        s1: 3.0,
        r: 0.75,
        g: 0.78,
        b: 0.82,
        a: 0.45,
        drag: 1.5,
      });
    }
    this.light.position.copy(pt);
    this.lightT = 0.85;
  }

  private _spawnShockwave(pt: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.6, 1.1, 0.25),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(pt.x, pt.y + 0.35, pt.z);
    mesh.scale.set(1, 1, 1);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, age: 0, maxAge: 0.55 });
  }

  private _targetHit(p: Projectile, a: THREE.Vector3, b: THREE.Vector3) {
    const dir = this._v2;
    dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-7) return null;
    dir.multiplyScalar(1 / len);

    let bestT = Infinity;
    let bestPart: HitPart = 'hull';
    let bestTank: Tank | null = null;
    let bestFrame: 'root' | 'turret' | 'gun' = 'root';

    for (const t of this.targets) {
      if (!t.alive || t === p.owner || (p.owner && t.team === p.owner.team)) continue;
      // Грубый отсев: если сегмент полёта далеко от танка, 3 матричных преобразования и slab-тесты не нужны.
      const rp = t.root.position;
      const mx = (a.x + b.x) * 0.5 - rp.x;
      const my = (a.y + b.y) * 0.5 - rp.y;
      const mz = (a.z + b.z) * 0.5 - rp.z;
      const reach = len * 0.5 + 12;
      if (mx * mx + my * my + mz * mz > reach * reach) continue;
      const inv = this._inv.get(t);
      const it = this._invTurret.get(t);
      const ig = this._invGun.get(t);
      if (!inv || !it || !ig) continue;

      const hullBoxes = getHullBoxesForTank(t.spec.id);
      const turretBox = getTurretBoxForTank(t.spec.id);

      _la.copy(a).applyMatrix4(inv);
      _lb.copy(b).applyMatrix4(inv);
      _ld.subVectors(_lb, _la);
      const ll = _ld.length();
      if (ll > 1e-7) {
        _ld.multiplyScalar(1 / ll);
        for (const box of hullBoxes) {
          const rt = slab(_la, _ld, ll, box, _slabN);
          if (rt !== null && (!bestTank || rt < bestT - 0.02 || (Math.abs(rt - bestT) <= 0.02 && box.part === 'fuel'))) {
            bestT = rt;
            _bestN.copy(_slabN);
            bestPart = box.part;
            bestTank = t;
            _bestLd.copy(_ld);
            bestFrame = 'root';
          }
        }
      }

      _ta.copy(a).applyMatrix4(it);
      _tb.copy(b).applyMatrix4(it);
      _td.subVectors(_tb, _ta);
      const tl = _td.length();
      if (tl > 1e-7) {
        _td.multiplyScalar(1 / tl);
        const rt = slab(_ta, _td, tl, turretBox, _slabN);
        if (rt !== null && (!bestTank || rt < bestT)) {
          bestT = rt;
          _bestN.copy(_slabN);
          bestPart = 'turret';
          bestTank = t;
          _bestLd.copy(_td);
          bestFrame = 'turret';
        }
      }

      _ga.copy(a).applyMatrix4(ig);
      _gb.copy(b).applyMatrix4(ig);
      _gd.subVectors(_gb, _ga);
      const gl = _gd.length();
      if (gl > 1e-7) {
        _gd.multiplyScalar(1 / gl);
        const rt = slab(_ga, _gd, gl, BARREL_BOX, _slabN);
        if (rt !== null && (!bestTank || rt < bestT + (bestPart === 'turret' ? 0.12 : 0))) {
          bestT = rt;
          _bestN.copy(_slabN);
          bestPart = 'barrel';
          bestTank = t;
          _bestLd.copy(_gd);
          bestFrame = 'gun';
        }
      }
    }

    if (!bestTank) return null;
    const t = bestTank;
    const q =
      bestFrame === 'gun'
        ? t.gunPivot.getWorldQuaternion(this._q2)
        : bestFrame === 'turret'
          ? t.turretGroup.getWorldQuaternion(this._q2)
          : t.root.getWorldQuaternion(this._q2);
    const wn = _bestN.clone().applyQuaternion(q);
    const point = new THREE.Vector3().copy(a).addScaledVector(dir, bestT);
    const inv = this._inv.get(t)!;
    const lp = point.clone().applyMatrix4(inv);
    const ldRoot = dir.clone().transformDirection(inv);

    let zone: string = bestPart;
    // Also detect internal rear-side fuel cell penetration inside hull rear corners (not on Maus)
    if (bestPart === 'fuel' || (!t.isBoss && bestPart === 'hull' && lp.z < -1.35 && Math.abs(lp.x) > 0.85 && lp.y > 0.85)) {
      zone = 'fuel';
    }
    return { kind: 'tank' as const, t: bestT, point, normal: wn, ln: _bestN.clone(), ld: _bestLd.clone(), part: bestPart, zone, lp, ldRoot, tank: t };
  }

  private _tankImpact(p: Projectile, hit: NonNullable<ReturnType<BallisticsSystem['_targetHit']>>) {
    p.hadTankImpact = true;
    const isMg = p.shell.type === 'MG';
    const speed = p.vel.length();
    const t = hit.tank;
    const fx = this.fx;
    const pt = hit.point;
    let r: HitResolution;

    if (isMg) {
      // Пулемётные пули обходят правило босса (50 ХП) и не детонируют бензобак с одного попадания: < 1 ХП.
      r = resolveMgHit(hit.part, p.shell.mgDamage ?? p.owner?.spec.mg.damage ?? 0.35);
    } else {
      r = resolveHit(hit.part, hit.ln, hit.ld, p.shell, speed, hit.zone, hit.tank.spec);
      if (p.owner && p.owner.isBoss) {
        // Смертельная пушка Мауса: любое попадание — мгновенный взрыв, броня игнорируется.
        r = { ...r, result: 'crit', damage: 999999 };
      } else if (t.isBoss && !p.shell.ignoreArmor) {
        // Босс: 50 ХП за выстрел × коэффициент орудия атакующего, броня Мауса не учитывается.
        if (r.result !== 'ricochet') {
          const coef = p.owner ? p.owner.spec.bossDamageCoef : 1;
          r = { ...r, result: 'pen', damage: BOSS_BASE_DAMAGE * coef };
        }
      }
    }
    if (t.god && r.result !== 'ricochet' && r.result !== 'nopen') {
      r = { ...r, result: 'nopen', damage: 0 };
    }
    let destroyed = false;

    const sparks = (n: number, spd: number) => {
      for (let i = 0; i < n; i++) {
        fx.emit({
          additive: true,
          x: pt.x,
          y: pt.y,
          z: pt.z,
          vx: hit.normal.x * rnd(5, spd) + rnd(-9, 9),
          vy: hit.normal.y * rnd(5, spd) + rnd(0, 9),
          vz: hit.normal.z * rnd(5, spd) + rnd(-9, 9),
          life: rnd(0.3, 0.7),
          s0: 0.3,
          s1: 0.1,
          r: 1,
          g: 0.85,
          b: 0.5,
          a: 1,
          grav: -18,
        });
      }
    };
    const flash = (sz: number) => fx.emit({ additive: true, x: pt.x, y: pt.y, z: pt.z, life: 0.14, s0: sz, s1: sz * 0.3, r: 1, g: 0.8, b: 0.45, a: 1 });
    const smoke = (n: number) => {
      for (let i = 0; i < n; i++) {
        fx.emit({
          x: pt.x,
          y: pt.y,
          z: pt.z,
          vx: rnd(-3, 3),
          vy: rnd(1, 4),
          vz: rnd(-3, 3),
          life: rnd(0.8, 1.4),
          s0: 0.7,
          s1: 2.4,
          r: 0.4,
          g: 0.38,
          b: 0.35,
          a: 0.5,
          drag: 1.2,
        });
      }
    };

    if (isMg) {
      flash(0.75);
      sparks(4, 11);
      if (r.result !== 'nopen') {
        t.hp -= r.damage;
      }
      audio.play('mgHit', pt, 0.75);
      if (t.hp <= 0 && t.alive) {
        destroyed = true;
        t.destroy(false);
        fx.emit({
          additive: true,
          x: pt.x,
          y: pt.y + 1,
          z: pt.z,
          life: 0.55,
          s0: 6,
          s1: 19,
          r: 1,
          g: 0.6,
          b: 0.2,
          a: 1,
        });
        audio.play('bigexplosion', pt);
        this.lightT = 1.4;
      }
    } else {
      switch (r.result) {
        case 'ricochet':
          flash(1.6);
          sparks(10, 20);
          audio.play('ricochet', pt);
          break;
        case 'nopen':
          flash(2.2);
          smoke(6);
          audio.play('nopen', pt);
          break;
        case 'track':
          flash(2);
          sparks(14, 18);
          smoke(5);
          t.hp -= r.damage;
          t.immobilize(10);
          audio.play('track', pt);
          break;
        case 'barrel':
          flash(2);
          sparks(12, 22);
          t.hp -= r.damage;
          t.disableGun(10);
          audio.play('barrel', pt);
          break;
        default: {
          this._impact(p, { point: pt, normal: hit.normal, kind: 'tank', obstacle: null }, true);
          t.hp -= r.damage;
          const isFuel = r.result === 'fuel';
          if (isFuel) {
            audio.play('fuelExplosion', pt, 1.25);
          } else {
            audio.play('hitpen', pt);
          }

          if (t.hp <= 0 && t.alive) {
            destroyed = true;
            t.destroy(isFuel || r.result === 'crit');
            const big = isFuel ? 2.4 : 1;
            fx.emit({
              additive: true,
              x: pt.x,
              y: pt.y + 1,
              z: pt.z,
              life: 0.55 * big,
              s0: 6 * big,
              s1: 19 * big,
              r: 1,
              g: isFuel ? 0.48 : 0.6,
              b: isFuel ? 0.1 : 0.2,
              a: 1,
            });
            if (isFuel) {
              this._spawnShockwave(t.root.position);
              for (let i = 0; i < 36; i++) {
                fx.emit({
                  additive: true,
                  x: pt.x,
                  y: pt.y + 1.4,
                  z: pt.z,
                  vx: rnd(-22, 22),
                  vy: rnd(6, 28),
                  vz: rnd(-22, 22),
                  life: rnd(0.7, 1.6),
                  s0: 3.8,
                  s1: 1.0,
                  r: 1,
                  g: rnd(0.32, 0.62),
                  b: 0.08,
                  a: 1,
                  drag: 0.9,
                  grav: -12,
                });
              }
              for (let i = 0; i < 18; i++) {
                fx.emit({
                  x: pt.x + rnd(-1.5, 1.5),
                  y: pt.y + 1.8,
                  z: pt.z + rnd(-1.5, 1.5),
                  vx: rnd(-5, 5),
                  vy: rnd(5, 14),
                  vz: rnd(-5, 5),
                  life: rnd(2.4, 4.2),
                  s0: 2.8,
                  s1: 9.5,
                  r: 0.14,
                  g: 0.11,
                  b: 0.09,
                  a: 0.85,
                  drag: 0.7,
                  grav: 1.1,
                });
              }
            } else {
              audio.play('bigexplosion', pt);
            }
            this.lightT = 1.6 * big;
          }
        }
      }
    }

    if (p.owner && p.owner.isPlayer && (!isMg || destroyed)) {
      audio.ui(r.result === 'fuel' ? 'fuelCrit' : 'tick');
    }
    for (const fn of this.tankListeners) {
      fn({
        target: t,
        owner: p.owner,
        result: r.result,
        damage: r.damage,
        destroyed,
        isMg,
        point: pt.clone(),
        zone: hit.zone,
        part: hit.part,
        side: r.side || (hit.part === 'trackL' || hit.lp.x >= 0 ? 'L' : 'R'),
        lp: hit.lp.clone(),
        ld: hit.ldRoot.clone(),
        detail: r,
      });
    }
    return r.result;
  }

  fire({
    pos,
    dir,
    speed,
    caliber = 0.1,
    penetrationMm = 240,
    maxRange = DEFAULT_MAX_RANGE,
    type = 'AP',
    gunDamage,
    mgDamage,
    ignoreArmor,
    fixedDamage,
    ignoreAps,
    suppressMissVoice = false,
    owner = null,
  }: {
    pos: THREE.Vector3;
    dir: THREE.Vector3;
    speed: number;
    caliber?: number;
    penetrationMm?: number;
    maxRange?: number;
    type?: string;
    gunDamage?: number;
    mgDamage?: number;
    ignoreArmor?: boolean;
    fixedDamage?: number;
    ignoreAps?: boolean;
    suppressMissVoice?: boolean;
    owner?: Tank | null;
  }): void {
    const isMg = type === 'MG';
    const isDm63 = type === 'DM63';
    const d = this._v.copy(dir);
    if (!isMg && !owner?.spec.stabilized) {
      d.x += rnd(-1, 1) * 0.00015;
      d.y += rnd(-1, 1) * 0.00015;
      d.z += rnd(-1, 1) * 0.00015;
      d.normalize();
    }
    const group = new THREE.Group();
    const streak = new THREE.Mesh(this.streakGeo, this.streakMat);
    if (isMg) {
      streak.scale.set(0.55, 0.55, 4.2);
      const core = new THREE.Mesh(this.coreGeo, this.coreMat);
      core.scale.setScalar(0.38);
      group.add(streak, core);
    } else if (isDm63) {
      streak.scale.set(1.35, 1.35, 14.5);
      const core = new THREE.Mesh(this.coreGeo, this.coreMat);
      core.scale.setScalar(1.25);
      group.add(streak, core);
    } else {
      streak.scale.z = 9;
      group.add(streak, new THREE.Mesh(this.coreGeo, this.coreMat));
    }
    const tp = new Float32Array(TRAIL_N * 3);
    const tc = new Float32Array(TRAIL_N * 3);
    for (let i = 0; i < TRAIL_N; i++) {
      const f = Math.pow(1 - i / (TRAIL_N - 1), 1.6) * (isMg ? 0.55 : isDm63 ? 1.45 : 1);
      tc[i * 3] = isDm63 ? f * 0.65 : f;
      tc[i * 3 + 1] = f * (isMg ? 0.72 : isDm63 ? 0.96 : 0.55);
      tc[i * 3 + 2] = f * (isMg ? 0.28 : isDm63 ? 1.0 : 0.18);
      tp[i * 3] = pos.x;
      tp[i * 3 + 1] = pos.y;
      tp[i * 3 + 2] = pos.z;
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    const trail = new THREE.Line(
      tg,
      new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
    );
    trail.frustumCulled = false;
    group.position.copy(pos);
    this.scene.add(group, trail);
    this.projectiles.push({
      pos: pos.clone(),
      prev: pos.clone(),
      vel: d.clone().multiplyScalar(speed),
      age: 0,
      dist: 0,
      acc: 0,
      suppressMissVoice,
      group,
      trail,
      trailPos: tp,
      shell: {
        type,
        caliber,
        muzzleVelocity: speed,
        penetrationMm,
        maxRange,
        gunDamage: gunDamage ?? owner?.spec.gunDamage,
        mgDamage,
        ignoreArmor,
        fixedDamage,
        ignoreAps,
      },
      owner,
    });
    if (isMg) {
      this._mgMuzzleFlash(pos, d);
      audio.play('mg', pos, 0.55, !!(owner && owner.isPlayer));
    } else {
      this._muzzleFlash(pos, d);
      audio.play('cannon', pos, 1, !!(owner && owner.isPlayer));
      if (isDm63) {
        audio.play('dm63', pos, 0.9, !!(owner && owner.isPlayer));
      }
    }
  }

  fireKstam({
    pos,
    dir,
    target,
    targetPoint,
    splashRadius = 10,
    damage = 500,
    owner = null,
  }: {
    pos: THREE.Vector3;
    dir: THREE.Vector3;
    target: Tank | null;
    targetPoint: THREE.Vector3;
    splashRadius?: number;
    damage?: number;
    owner?: Tank | null;
  }): void {
    const dest = target && target.alive
      ? new THREE.Vector3(target.root.position.x, target.root.position.y + 1.15, target.root.position.z)
      : targetPoint.clone();
    const dist = Math.max(18, pos.distanceTo(dest));
    const duration = Math.max(1.25, Math.min(3.1, dist / 95));
    const apexHeight = Math.max(26, Math.min(54, 20 + dist * 0.16));

    const group = new THREE.Group();
    const streak = new THREE.Mesh(this.streakGeo, this.streakMat);
    streak.scale.set(1.25, 1.25, 11.5);
    const core = new THREE.Mesh(this.coreGeo, this.coreMat);
    core.scale.setScalar(1.3);
    group.add(streak, core);

    const tp = new Float32Array(TRAIL_N * 3);
    const tc = new Float32Array(TRAIL_N * 3);
    for (let i = 0; i < TRAIL_N; i++) {
      const f = Math.pow(1 - i / (TRAIL_N - 1), 1.4) * 1.4;
      tc[i * 3] = f * 0.45;
      tc[i * 3 + 1] = f * 1.0;
      tc[i * 3 + 2] = f * 0.55;
      tp[i * 3] = pos.x;
      tp[i * 3 + 1] = pos.y;
      tp[i * 3 + 2] = pos.z;
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    const trail = new THREE.Line(
      tg,
      new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }),
    );
    trail.frustumCulled = false;
    group.position.copy(pos);
    this.scene.add(group, trail);

    const launchDir = this._v.copy(dir).normalize();
    launchDir.y = Math.max(0.55, launchDir.y + 0.55);
    launchDir.normalize();

    this.projectiles.push({
      pos: pos.clone(),
      prev: pos.clone(),
      vel: launchDir.clone().multiplyScalar(110),
      age: 0,
      dist: 0,
      acc: 0,
      group,
      trail,
      trailPos: tp,
      shell: {
        type: 'KSTAM',
        caliber: 0.12,
        muzzleVelocity: 120,
        penetrationMm: 9999,
        maxRange: 2500,
        gunDamage: damage,
        ignoreArmor: true,
        fixedDamage: damage,
        ignoreAps: true,
      },
      owner,
      kstam: {
        target,
        startPos: pos.clone(),
        targetPoint: dest,
        elapsed: 0,
        duration,
        apexHeight,
        splashRadius,
        maxSplashDmg: Math.round(damage * 0.56),
      },
    });

    this._muzzleFlash(pos, launchDir);
    audio.play('cannon', pos, 0.85, !!(owner && owner.isPlayer));
    audio.play('kstamLaunch', pos, 1.0, !!(owner && owner.isPlayer));
  }

  private _detonateKstam(p: Projectile, pt: THREE.Vector3, directHitTank: Tank | null): void {
    const fx = this.fx;
    const owner = p.owner;
    const k = p.kstam!;
    this._spawnShockwave(pt);
    fx.emit({ additive: true, x: pt.x, y: pt.y + 0.6, z: pt.z, life: 0.55, s0: 6.5, s1: 22, r: 1, g: 0.72, b: 0.25, a: 1 });
    for (let i = 0; i < 24; i++) {
      fx.emit({
        additive: true,
        x: pt.x,
        y: pt.y + 0.5,
        z: pt.z,
        vx: rnd(-18, 18),
        vy: rnd(3, 22),
        vz: rnd(-18, 18),
        life: rnd(0.45, 1.05),
        s0: 2.2,
        s1: 0.6,
        r: 1,
        g: rnd(0.45, 0.85),
        b: 0.15,
        a: 1,
        drag: 1.4,
        grav: -14,
      });
    }
    for (let i = 0; i < 12; i++) {
      fx.emit({
        x: pt.x + rnd(-1.5, 1.5),
        y: pt.y + 0.8,
        z: pt.z + rnd(-1.5, 1.5),
        vx: rnd(-6, 6),
        vy: rnd(2, 9),
        vz: rnd(-6, 6),
        life: rnd(1.8, 3.2),
        s0: 3.0,
        s1: 9.0,
        r: 0.28,
        g: 0.26,
        b: 0.23,
        a: 0.75,
        drag: 1.1,
        grav: 0.5,
      });
    }
    audio.play('kstamHit', pt, 1.15, !!(owner && owner.isPlayer));
    this.light.position.set(pt.x, pt.y + 2.5, pt.z);
    this.lightT = 1.8;

    let hitAnyTank = !!directHitTank;
    // Enemy-only AoE splash (allied tanks strictly receive 0 damage)
    for (const t of this.targets) {
      if (!t.alive || t === directHitTank) continue;
      const isAllyOrSelf = t === owner || !!(owner && t.team === owner.team);
      if (isAllyOrSelf) continue;
      const dist = t.root.position.distanceTo(pt);
      if (dist > k.splashRadius) continue;
      // If detonation landed right next to target without hitbox collision, give top-attack damage when <= 2.4m, else splash
      const dmg =
        dist <= 2.4 && !directHitTank
          ? (p.shell.fixedDamage ?? 500)
          : computeKstamSplashDamage(dist, k.splashRadius, k.maxSplashDmg, isAllyOrSelf);
      if (dmg <= 0 || t.god) continue;
      hitAnyTank = true;
      t.hp -= dmg;
      let destroyed = false;
      if (t.hp <= 0 && t.alive) {
        destroyed = true;
        t.destroy(true);
        audio.play('bigexplosion', t.root.position);
      }
      if (owner && owner.isPlayer) audio.ui('tick');
      const lp = new THREE.Vector3(0, 1.5, 0);
      const ld = new THREE.Vector3(0, -1, 0);
      for (const fn of this.tankListeners) {
        fn({
          target: t,
          owner,
          result: 'crit',
          damage: dmg,
          destroyed,
          isMg: false,
          point: pt.clone(),
          zone: 'turret',
          part: 'turret',
          side: 'L',
          lp,
          ld,
          detail: {
            result: 'crit',
            damage: dmg,
            base: 25,
            effective: 25,
            pen: 9999,
            angleDeg: 0,
            side: 'L',
            zone: 'turret',
          },
        });
      }
    }
    if (!hitAnyTank) {
      const missEv: MissEvent = {
        owner,
        point: pt.clone(),
        kind: 'kstam',
        isMg: false,
        hadTankImpact: !!p.hadTankImpact,
        suppressMissVoice: !!p.suppressMissVoice,
      };
      for (const fn of this.missListeners) fn(missEv);
    }
  }

  private _mgMuzzleFlash(p: THREE.Vector3, d: THREE.Vector3): void {
    const fx = this.fx;
    fx.emit({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.045, s0: 1.05, s1: 0.35, r: 1, g: 0.9, b: 0.55, a: 0.95 });
    for (let i = 0; i < 2; i++) {
      const s = rnd(14, 34);
      fx.emit({
        additive: true,
        x: p.x + d.x * 0.3,
        y: p.y + d.y * 0.3,
        z: p.z + d.z * 0.3,
        vx: d.x * s + rnd(-3, 3),
        vy: d.y * s + rnd(-3, 3),
        vz: d.z * s + rnd(-3, 3),
        life: rnd(0.04, 0.08),
        s0: 0.45,
        s1: 0.12,
        r: 1,
        g: 0.78,
        b: 0.35,
        a: 0.85,
        drag: 5,
      });
    }
  }

  private _muzzleFlash(p: THREE.Vector3, d: THREE.Vector3): void {
    const fx = this.fx;
    fx.emit({ additive: true, x: p.x, y: p.y, z: p.z, life: 0.09, s0: 3.4, s1: 1.4, r: 1, g: 0.92, b: 0.7, a: 1 });
    for (let i = 0; i < 7; i++) {
      const s = rnd(25, 70);
      fx.emit({
        additive: true,
        x: p.x + d.x,
        y: p.y + d.y,
        z: p.z + d.z,
        vx: d.x * s + rnd(-6, 6),
        vy: d.y * s + rnd(-6, 6),
        vz: d.z * s + rnd(-6, 6),
        life: rnd(0.07, 0.16),
        s0: 1.3,
        s1: 0.3,
        r: 1,
        g: 0.7,
        b: 0.3,
        a: 0.95,
        drag: 4,
      });
    }
    for (let i = 0; i < 12; i++) {
      const s = rnd(4, 15);
      fx.emit({
        x: p.x + d.x * 0.5,
        y: p.y + d.y * 0.5,
        z: p.z + d.z * 0.5,
        vx: d.x * s + rnd(-2, 2),
        vy: d.y * s + rnd(-1, 3),
        vz: d.z * s + rnd(-2, 2),
        life: rnd(1.4, 2.8),
        s0: 0.9,
        s1: rnd(3, 5.5),
        r: 0.72,
        g: 0.7,
        b: 0.66,
        a: 0.42,
        drag: 1.4,
        grav: 0.4,
      });
    }
    this.light.position.copy(p).addScaledVector(d, 2.5);
    this.lightT = 1;
  }

  private _impact(p: Projectile, hit: { point: THREE.Vector3; normal: THREE.Vector3; kind: 'ground' | 'obstacle' | 'tank'; obstacle: ObstacleBox | null }, silent = false): void {
    const fx = this.fx;
    const pt = hit.point;
    const n = hit.normal;
    const ground = hit.kind === 'ground';
    if (p.shell.type === 'MG') {
      const dirt = ground ? [0.45, 0.38, 0.28] : [0.65, 0.63, 0.58];
      fx.emit({ additive: true, x: pt.x, y: pt.y + 0.1, z: pt.z, life: 0.08, s0: 0.6, s1: 0.2, r: 1, g: 0.85, b: 0.45, a: 0.85 });
      for (let i = 0; i < 3; i++) {
        fx.emit({
          x: pt.x,
          y: pt.y + 0.1,
          z: pt.z,
          vx: n.x * rnd(2, 6) + rnd(-3, 3),
          vy: n.y * rnd(2, 6) + rnd(1, 4),
          vz: n.z * rnd(2, 6) + rnd(-3, 3),
          life: rnd(0.25, 0.5),
          s0: 0.35,
          s1: 0.9,
          r: dirt[0],
          g: dirt[1],
          b: dirt[2],
          a: 0.5,
          drag: 1.4,
          grav: -8,
        });
      }
      return;
    }
    const dust = ground ? [0.46, 0.4, 0.3] : [0.62, 0.61, 0.58];
    const dirt = ground ? [0.3, 0.23, 0.15] : [0.5, 0.48, 0.44];
    const sc = Math.max(1, p.shell.caliber / 0.075);

    fx.emit({ additive: true, x: pt.x, y: pt.y + 0.3, z: pt.z, life: 0.22, s0: 3 * sc, s1: 9 * sc, r: 1, g: 0.72, b: 0.35, a: 1 });
    for (let i = 0; i < 8; i++) {
      fx.emit({
        additive: true,
        x: pt.x + n.x,
        y: pt.y + n.y,
        z: pt.z + n.z,
        vx: n.x * rnd(4, 11) + rnd(-6, 6),
        vy: n.y * rnd(4, 11) + rnd(0, 5),
        vz: n.z * rnd(4, 11) + rnd(-6, 6),
        life: rnd(0.25, 0.5),
        s0: 2.2 * sc,
        s1: 0.5,
        r: 1,
        g: 0.5,
        b: 0.15,
        a: 0.9,
        drag: 3,
      });
    }
    for (let i = 0; i < 12; i++) {
      fx.emit({
        additive: true,
        x: pt.x,
        y: pt.y + 0.2,
        z: pt.z,
        vx: n.x * rnd(8, 22) + rnd(-12, 12),
        vy: n.y * rnd(8, 22) + rnd(2, 14),
        vz: n.z * rnd(8, 22) + rnd(-12, 12),
        life: rnd(0.4, 0.9),
        s0: 0.35,
        s1: 0.1,
        r: 1,
        g: 0.85,
        b: 0.45,
        a: 1,
        grav: -20,
      });
    }
    for (let i = 0; i < 16; i++) {
      fx.emit({
        x: pt.x,
        y: pt.y + 0.3,
        z: pt.z,
        vx: n.x * rnd(6, 16) + rnd(-7, 7),
        vy: n.y * rnd(6, 16) + rnd(3, 13),
        vz: n.z * rnd(6, 16) + rnd(-7, 7),
        life: rnd(0.9, 1.7),
        s0: 0.9,
        s1: 0.5,
        r: dirt[0],
        g: dirt[1],
        b: dirt[2],
        a: 0.95,
        drag: 0.4,
        grav: -17,
      });
    }
    for (let i = 0; i < 11; i++) {
      fx.emit({
        x: pt.x + rnd(-1, 1),
        y: pt.y + 0.6,
        z: pt.z + rnd(-1, 1),
        vx: n.x * rnd(1, 4) + rnd(-3, 3),
        vy: n.y * rnd(1, 4) + rnd(0.5, 3),
        vz: n.z * rnd(1, 4) + rnd(-3, 3),
        life: rnd(2, 3.8),
        s0: 3 * sc,
        s1: rnd(9, 13) * sc,
        r: dust[0],
        g: dust[1],
        b: dust[2],
        a: 0.55,
        drag: 1.1,
        grav: 0.35,
      });
    }

    if (ground) this._decal(pt, n, 2.2 * sc);
    if (!silent) audio.play('explosion', pt, 0.8);
    this.light.position.copy(pt).addScaledVector(n, 2.5);
    this.lightT = 1;

    if (!silent && (hit.kind === 'ground' || hit.kind === 'obstacle')) {
      const info: ImpactEvent = {
        point: pt.clone(),
        normal: n.clone(),
        kind: hit.kind,
        obstacle: hit.obstacle,
        velocity: p.vel.clone(),
        speed: p.vel.length(),
        distance: p.dist,
        shell: p.shell,
      };
      for (const fn of this.listeners) fn(info);
    }
  }

  private _decal(pt: THREE.Vector3, n: THREE.Vector3, r: number): void {
    let m = this.decals[this.decalNext];
    if (!m) {
      m = new THREE.Mesh(this.decalGeo, this.decalMat);
      this.scene.add(m);
      this.decals[this.decalNext] = m;
    }
    this.decalNext = (this.decalNext + 1) % 28;
    m.position.copy(pt).addScaledVector(n, 0.12);
    m.quaternion.setFromUnitVectors(this._up, n);
    m.scale.set(r, r, r);
  }

  setWorld(w: GameWorld): void {
    this.world = w;
    this.clear();
    for (const m of this.decals) if (m) this.scene.remove(m);
    this.decals = [];
    this.decalNext = 0;
  }

  clear(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) this._remove(i);
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      this.scene.remove(sw.mesh);
      (sw.mesh.material as THREE.Material).dispose();
      this.shockwaves.splice(i, 1);
    }
    this.fx.clear();
  }

  private _remove(i: number): void {
    const p = this.projectiles[i];
    this.scene.remove(p.group, p.trail);
    p.trail.geometry.dispose();
    this.projectiles.splice(i, 1);
  }

  update(dt: number): void {
    this.fx.update(dt);
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      if (sw.age >= sw.maxAge) {
        this.scene.remove(sw.mesh);
        (sw.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const f = sw.age / sw.maxAge;
      const sc = 1.5 + f * 22;
      sw.mesh.scale.set(sc, sc, sc);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - f) * 0.9;
    }

    if (this.lightT > 0) {
      this.lightT = Math.max(0, this.lightT - dt * 7);
      this.light.intensity = 160 * this.lightT * this.lightT;
    }
    const lim = this.world.size * 0.6;
    if (this.projectiles.length > 0) {
      for (const t of this.targets) {
        if (!t.alive) continue;
        t.root.updateMatrixWorld(true);
        let mInv = this._inv.get(t);
        if (!mInv) this._inv.set(t, (mInv = new THREE.Matrix4()));
        mInv.copy(t.root.matrixWorld).invert();

        let mTur = this._invTurret.get(t);
        if (!mTur) this._invTurret.set(t, (mTur = new THREE.Matrix4()));
        mTur.copy(t.turretGroup.matrixWorld).invert();

        let mGun = this._invGun.get(t);
        if (!mGun) this._invGun.set(t, (mGun = new THREE.Matrix4()));
        mGun.copy(t.gunPivot.matrixWorld).invert();
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.kstam) {
        const k = p.kstam;
        p.prev.copy(p.pos);
        k.elapsed += dt;
        p.age += dt;
        if (k.target && k.target.alive) {
          k.targetPoint.set(
            k.target.root.position.x,
            k.target.root.position.y + 1.15,
            k.target.root.position.z,
          );
        }
        const u = Math.min(1, k.elapsed / k.duration);
        const nx = k.startPos.x + (k.targetPoint.x - k.startPos.x) * u;
        const nz = k.startPos.z + (k.targetPoint.z - k.startPos.z) * u;
        const baseY = k.startPos.y + (k.targetPoint.y - k.startPos.y) * (u * u);
        const ny = baseY + Math.sin(Math.pow(u, 0.72) * Math.PI) * k.apexHeight;
        p.pos.set(nx, ny, nz);
        p.vel.subVectors(p.pos, p.prev).multiplyScalar(1 / Math.max(1e-4, dt));

        // Emit subtle loft exhaust smoke trail
        this.fx.emit({
          x: p.pos.x,
          y: p.pos.y,
          z: p.pos.z,
          life: 0.45,
          s0: 0.45,
          s1: 1.5,
          r: 0.85,
          g: 0.92,
          b: 0.82,
          a: 0.35,
          drag: 1.8,
        });

        const th = this._targetHit(p, p.prev, p.pos);
        if (th && th.kind === 'tank') {
          this._tankImpact(p, th);
          this._detonateKstam(p, th.point, th.tank);
          this._remove(i);
          continue;
        }
        if (u > 0.55) {
          const wh = this.world.segmentHit(p.prev, p.pos);
          if (wh) {
            this._detonateKstam(p, wh.point, null);
            this._remove(i);
            continue;
          }
        }
        if (u >= 1) {
          this._detonateKstam(p, k.targetPoint, null);
          this._remove(i);
          continue;
        }
        p.group.position.copy(p.pos);
        p.group.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
        p.group.children[0].scale.z = 11.5;
        const tp = p.trailPos;
        tp.copyWithin(3, 0, (TRAIL_N - 1) * 3);
        tp[0] = p.pos.x;
        tp[1] = p.pos.y;
        tp[2] = p.pos.z;
        p.trail.geometry.attributes.position.needsUpdate = true;
        continue;
      }

      let hit: ReturnType<BallisticsSystem['_targetHit']> | ReturnType<GameWorld['segmentHit']> | null = null;
      let expiredByRange = false;
      let apsIntercepted = false;
      const maxRange = p.shell.maxRange || DEFAULT_MAX_RANGE;

      p.acc = (p.acc || 0) + dt;
      while (p.acc >= SUBSTEP && !hit && !expiredByRange && !apsIntercepted) {
        const h = SUBSTEP;
        p.acc -= h;
        p.prev.copy(p.pos);
        const sp = p.vel.length();
        p.vel.multiplyScalar(Math.max(0, 1 - DRAG_K * sp * h));
        p.vel.y -= G * h;
        p.pos.addScaledVector(p.vel, h);
        p.age += h;
        p.dist += sp * h;

        const worldHit = this.world.segmentHit(p.prev, p.pos);
        const worldDistSq = worldHit ? p.prev.distanceToSquared(worldHit.point) : Infinity;

        if (p.shell.type !== 'MG' && !p.shell.ignoreAps) {
          for (const t of this.targets) {
            if (!t.spec.aps || !t.apsState) continue;
            const res = canInterceptProjectile({
              alive: t.alive,
              apsConfig: t.spec.aps,
              apsState: t.apsState,
              projectileType: p.shell.type,
              isFriendlyOrSelf: t === p.owner || !!(p.owner && t.team === p.owner.team),
              ax: p.prev.x,
              ay: p.prev.y,
              az: p.prev.z,
              bx: p.pos.x,
              by: p.pos.y,
              bz: p.pos.z,
              vx: p.vel.x,
              vy: p.vel.y,
              vz: p.vel.z,
              tx: t.root.position.x,
              ty: t.root.position.y + 1.8,
              tz: t.root.position.z,
            });
            if (res.intercept) {
              const dx = res.ix - p.prev.x;
              const dy = res.iy - p.prev.y;
              const dz = res.iz - p.prev.z;
              if (dx * dx + dy * dy + dz * dz <= worldDistSq + 1e-4) {
                const cooldown = triggerApsIntercept(t.apsState, t.spec.aps);
                const ipt = new THREE.Vector3(res.ix, res.iy, res.iz);
                this._emitApsInterceptFx(ipt);
                audio.play('trophy', ipt, 1.0, t.isPlayer);
                for (const fn of this.apsListeners) {
                  fn({ target: t, owner: p.owner, point: ipt, cooldown });
                }
                apsIntercepted = true;
                break;
              }
            }
          }
          if (apsIntercepted) break;
        }

        hit = worldHit;
        const th = this._targetHit(p, p.prev, p.pos);
        if (th && (!hit || th.t < hit.t)) hit = th;

        if (!hit && p.dist >= maxRange) {
          expiredByRange = true;
        }
      }

      if (apsIntercepted) {
        this._remove(i);
        continue;
      }

      if (hit && hit.kind === 'tank') {
        const res = this._tankImpact(p, hit);
        if (res === 'ricochet') {
          const n = hit.normal;
          const d = p.vel.dot(n);
          p.vel.addScaledVector(n, -2 * d).multiplyScalar(0.5);
          p.vel.x += rnd(-8, 8);
          p.vel.z += rnd(-8, 8);
          p.pos.copy(hit.point).addScaledVector(n, 0.3);
          p.prev.copy(p.pos);
          hit = null;
        } else {
          this._remove(i);
          continue;
        }
      }
      if (hit) {
        this._impact(p, hit);
        if (p.shell.type !== 'MG' && (hit.kind === 'ground' || hit.kind === 'obstacle')) {
          const missEv: MissEvent = {
            owner: p.owner,
            point: hit.point.clone(),
            kind: hit.kind,
            isMg: false,
            hadTankImpact: !!p.hadTankImpact,
            suppressMissVoice: !!p.suppressMissVoice,
          };
          for (const fn of this.missListeners) fn(missEv);
        }
        this._remove(i);
        continue;
      }
      if (expiredByRange) {
        if (p.shell.type !== 'MG') {
          // Shell reaches max range and disappears with a faint mid-air puff
          this.fx.emit({
            x: p.pos.x,
            y: p.pos.y,
            z: p.pos.z,
            life: 0.55,
            s0: 0.7,
            s1: 2.0,
            r: 0.6,
            g: 0.58,
            b: 0.54,
            a: 0.35,
            drag: 1.5,
          });
          const missEv: MissEvent = {
            owner: p.owner,
            point: p.pos.clone(),
            kind: 'range',
            isMg: false,
            hadTankImpact: !!p.hadTankImpact,
            suppressMissVoice: !!p.suppressMissVoice,
          };
          for (const fn of this.missListeners) fn(missEv);
        }
        this._remove(i);
        continue;
      }
      if (p.age > MAX_AGE || Math.abs(p.pos.x) > lim || Math.abs(p.pos.z) > lim || p.pos.y < -80) {
        if (p.shell.type !== 'MG') {
          const missEv: MissEvent = {
            owner: p.owner,
            point: p.pos.clone(),
            kind: 'range',
            isMg: false,
            hadTankImpact: !!p.hadTankImpact,
            suppressMissVoice: !!p.suppressMissVoice,
          };
          for (const fn of this.missListeners) fn(missEv);
        }
        this._remove(i);
        continue;
      }

      if (!p.snapped && p.shell.type !== 'MG' && audio.cam && p.owner && !p.owner.isPlayer && p.pos.distanceToSquared(audio.cam.position) < 400) {
        p.snapped = true;
        audio.play('snap', p.pos, 1);
      }
      p.group.position.copy(p.pos);
      p.group.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
      p.group.children[0].scale.z = p.shell.type === 'MG' ? 4.2 : Math.min(14, 4 + p.vel.length() * 0.012);
      const tp = p.trailPos;
      tp.copyWithin(3, 0, (TRAIL_N - 1) * 3);
      tp[0] = p.pos.x;
      tp[1] = p.pos.y;
      tp[2] = p.pos.z;
      p.trail.geometry.attributes.position.needsUpdate = true;
    }
  }
}
