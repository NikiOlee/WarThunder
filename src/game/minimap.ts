import type { GameWorld } from './world';
import type { Tank } from './tank';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Projects world (wx, wz) into minimap pixel coordinates aligned with the game's
 * forward (+Z = top) and right (-X = right) camera conventions.
 */
export function worldToMinimap(wx: number, wz: number, limit: number, sizePx: number): { x: number; y: number } {
  const safeLimit = Math.max(1, limit);
  const nx = 0.5 - wx / (2 * safeLimit);
  const ny = 0.5 - wz / (2 * safeLimit);
  return {
    x: clamp(nx * sizePx, 2, sizePx - 2),
    y: clamp(ny * sizePx, 2, sizePx - 2),
  };
}

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bgCanvas: HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D;
  private size = 156;
  private limit = 480;
  private acc = 0.1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.size = canvas.width || 156;
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = this.size;
    this.bgCanvas.height = this.size;
    this.bgCtx = this.bgCanvas.getContext('2d')!;
  }

  setWorld(world: GameWorld): void {
    this.limit = world.limit || 480;
    const S = this.size;
    const g = this.bgCtx;

    // Terrain backdrop
    g.fillStyle = world.id === 'city' ? '#17191a' : '#161f14';
    g.fillRect(0, 0, S, S);

    // Subtle elevation shading baked once per map load
    const step = 6;
    for (let py = 0; py < S; py += step) {
      for (let px = 0; px < S; px += step) {
        const wx = (0.5 - (px + step * 0.5) / S) * 2 * this.limit;
        const wz = (0.5 - (py + step * 0.5) / S) * 2 * this.limit;
        const h = world.heightAt(wx, wz);
        const shade = clamp((h + 18) / 56, 0, 1);
        g.fillStyle =
          world.id === 'city'
            ? `rgba(120, 126, 130, ${(0.04 + shade * 0.08).toFixed(3)})`
            : `rgba(110, 155, 86, ${(0.04 + shade * 0.16).toFixed(3)})`;
        g.fillRect(px, py, step, step);
      }
    }

    // Tactical grid lines (4x4 sectors)
    g.strokeStyle = 'rgba(180, 195, 155, 0.14)';
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = Math.round((S * i) / 4) + 0.5;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, S);
      g.moveTo(0, p);
      g.lineTo(S, p);
      g.stroke();
    }

    // Static obstacles / buildings / rocks
    g.fillStyle = world.id === 'city' ? 'rgba(145, 148, 152, 0.65)' : 'rgba(130, 126, 108, 0.65)';
    for (let i = 0; i < world.obstacles.length; i++) {
      const ob = world.obstacles[i];
      // worldToMinimap flips both X and Z relative to +X/+Z, so min->max reverses
      const pMax = worldToMinimap(ob.min.x, ob.min.z, this.limit, S);
      const pMin = worldToMinimap(ob.max.x, ob.max.z, this.limit, S);
      const rx = Math.min(pMin.x, pMax.x);
      const ry = Math.min(pMin.y, pMax.y);
      const rw = Math.max(2, Math.abs(pMax.x - pMin.x));
      const rh = Math.max(2, Math.abs(pMax.y - pMin.y));
      g.fillRect(rx, ry, rw, rh);
    }

    // Crisp outer frame
    g.strokeStyle = 'rgba(138, 140, 90, 0.85)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, S - 2, S - 2);
    this.acc = 0.1;
  }

  update(tanks: Tank[], player: Tank, camYaw: number, spectateTarget: Tank | null, dt: number, force = false): void {
    this.acc += dt;
    if (!force && this.acc < 0.066) return;
    this.acc = 0;

    const S = this.size;
    const g = this.ctx;
    g.drawImage(this.bgCanvas, 0, 0);

    const focus = !player.alive && spectateTarget ? spectateTarget : player;

    // Camera view cone around player or active spectate target
    if (focus.alive) {
      const fp = worldToMinimap(focus.root.position.x, focus.root.position.z, this.limit, S);
      const dirX = -Math.sin(camYaw);
      const dirY = -Math.cos(camYaw);
      const coneAngle = Math.atan2(dirY, dirX);
      g.fillStyle = 'rgba(255, 220, 120, 0.16)';
      g.beginPath();
      g.moveTo(fp.x, fp.y);
      g.arc(fp.x, fp.y, 28, coneAngle - 0.42, coneAngle + 0.42);
      g.closePath();
      g.fill();
    }

    // Draw other tanks first, then player & boss on top
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t.alive || t.isPlayer || t.isBoss) continue;
      const p = worldToMinimap(t.root.position.x, t.root.position.z, this.limit, S);
      g.fillStyle = t.team === 'A' ? '#8fe36a' : '#ff6a4a';
      g.strokeStyle = '#0b0e09';
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

    // Boss Maus marker: prominent crimson/amber diamond + label
    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t.alive || !t.isBoss) continue;
      const p = worldToMinimap(t.root.position.x, t.root.position.z, this.limit, S);
      g.save();
      g.translate(p.x, p.y);
      g.fillStyle = '#ff3b2f';
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(0, -6.5);
      g.lineTo(6.5, 0);
      g.lineTo(0, 6.5);
      g.lineTo(-6.5, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.font = 'bold 9px Consolas, monospace';
      g.textAlign = 'center';
      g.fillStyle = '#ffd27a';
      g.fillText('МАУС', 0, -9);
      g.restore();
    }

    // Player chevron
    if (player.alive) {
      const p = worldToMinimap(player.root.position.x, player.root.position.z, this.limit, S);
      const dirX = -Math.sin(player.heading);
      const dirY = -Math.cos(player.heading);
      const ang = Math.atan2(dirY, dirX);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(ang);
      g.fillStyle = '#ffd27a';
      g.strokeStyle = '#090c08';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(6.5, 0);
      g.lineTo(-4.5, -4.2);
      g.lineTo(-2.5, 0);
      g.lineTo(-4.5, 4.2);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }
}
