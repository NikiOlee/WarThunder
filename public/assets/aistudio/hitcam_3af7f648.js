/* War Thunder style X-ray hit camera: top + side wireframe of the target tank, shell path and flashing damaged modules.
   All coordinates are tank-local metres: +X = left, +Y = up, +Z = forward. */

const M = (name, x0, x1, y0, y1, z0, z1, kind = 'module') => ({ name, x0, x1, y0, y1, z0, z1, kind });
const MODULES = [
  M('hull', -1.45, 1.45, 0.55, 1.8, -3.2, 3.3, 'outline'),
  M('turret', -1.15, 1.15, 1.8, 2.9, -2.05, 1.4, 'outline'),
  M('trackL', 1.47, 2.1, 0.03, 1.08, -3.5, 3.5, 'track'),
  M('trackR', -2.1, -1.47, 0.03, 1.08, -3.5, 3.5, 'track'),
  M('barrel', -0.1, 0.1, 2.36, 2.48, 1.6, 6.3, 'barrel'),
  M('engine', -0.45, 0.45, 0.6, 1.4, -3.0, -1.8),
  M('fuelL', 0.55, 1.3, 0.6, 1.3, -3.0, -1.8, 'fuel'),
  M('fuelR', -1.3, -0.55, 0.6, 1.3, -3.0, -1.8, 'fuel'),
  M('ammo', -0.5, 0.5, 1.9, 2.4, -1.9, -1.1),
  M('driver', 0.45, 0.8, 1.0, 1.5, 2.1, 2.5, 'crew'),
  M('gunner', -0.7, -0.35, 2.0, 2.5, 0.0, 0.4, 'crew'),
  M('loader', 0.35, 0.7, 2.0, 2.5, -0.2, 0.2, 'crew'),
  M('commander', -0.2, 0.15, 2.1, 2.6, -0.9, -0.5, 'crew'),
];
const byName = Object.fromEntries(MODULES.map((m) => [m.name, m]));

const RESULT = {
  pen: ['Попадание', '#ffd27a'], crit: ['Критическое попадание', '#ff6a4a'], nopen: ['Не пробил', '#cfd6dd'],
  ricochet: ['Рикошет', '#cfd6dd'], track: ['Гусеница повреждена', '#ffd27a'], barrel: ['Ствол повреждён', '#ffd27a'],
  fuel: ['Бензобак - взрыв', '#ff6a4a'],
};

function distPointSeg(c, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / (abx * abx + aby * aby + abz * abz || 1)));
  return Math.hypot(a.x + abx * t - c.x, a.y + aby * t - c.y, a.z + abz * t - c.z);
}

export class HitCam {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.W = 300; this.H = 190;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = this.W * dpr; canvas.height = this.H * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.t = 0; this.info = null; this.damaged = new Set(); this.life = 0;
    canvas.style.display = 'none';
  }

  hide() { this.t = 0; this.c.style.display = 'none'; }

  /** info: tank hit event from BallisticsSystem.onTankHit */
  show(info) {
    this.info = info; this.t = this.life = 5.5; this.age = 0;
    const d = new Set(), r = info.result;
    if (r === 'track') d.add(info.side === 'L' ? 'trackL' : 'trackR');
    else if (r === 'barrel') d.add('barrel');
    else if (r === 'fuel') { d.add('fuelL'); d.add('fuelR'); d.add('engine'); }
    else if (r === 'pen' || r === 'crit') {
      const a = info.lp, dir = info.ld, b = { x: a.x + dir.x * 4, y: a.y + dir.y * 4, z: a.z + dir.z * 4 };
      for (const m of MODULES) {
        if (m.kind === 'outline' || m.kind === 'track' || m.kind === 'barrel') continue;
        const c = { x: (m.x0 + m.x1) / 2, y: (m.y0 + m.y1) / 2, z: (m.z0 + m.z1) / 2 };
        if (distPointSeg(c, a, b) < 0.75) d.add(m.name);
      }
      if (r === 'crit') d.add('ammo');
    }
    if (info.destroyed) for (const m of MODULES) if (m.kind !== 'outline') d.add(m.name);
    this.damaged = d;
  }

  draw(dt) {
    if (this.t <= 0 || !this.info) { if (this.c.style.display !== 'none') this.c.style.display = 'none'; return; }
    this.t -= dt; this.age += dt;
    this.c.style.display = 'block';
    const g = this.g, W = this.W, H = this.H, info = this.info;
    const s = 17, tcx = 62, tcy = 112, scx = 214, sbase = 150;
    const alpha = Math.min(1, this.t / 0.6);
    const blink = 0.55 + 0.45 * Math.sin(this.age * 14);
    g.clearRect(0, 0, W, H);
    g.globalAlpha = alpha;
    g.fillStyle = 'rgba(8,14,10,0.86)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(160,190,150,0.7)'; g.lineWidth = 1.5; g.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);

    const [label, color] = info.destroyed ? ['Цель уничтожена', '#ff6a4a'] : (RESULT[info.result] || ['', '#fff']);
    g.font = 'bold 13px Consolas, monospace'; g.textBaseline = 'middle';
    g.fillStyle = '#9fb59a'; g.textAlign = 'left'; g.fillText(info.target.name, 10, 14);
    g.fillStyle = color; g.textAlign = 'right'; g.fillText(label, W - 10, 14);
    g.strokeStyle = 'rgba(160,190,150,0.3)'; g.beginPath(); g.moveTo(8, 27); g.lineTo(W - 8, 27); g.stroke();

    const top = (x, z) => [tcx - x * s, tcy - z * s];
    const side = (z, y) => [scx + z * s, sbase - y * s];
    const hot = (m) => this.damaged.has(m.name);
    const style = (m) => {
      if (hot(m)) {
        const c = m.kind === 'track' || m.kind === 'barrel' ? '255,210,70' : '255,60,40';
        g.fillStyle = `rgba(${c},${0.35 + 0.5 * blink})`; g.strokeStyle = `rgb(${c})`;
      } else if (m.kind === 'outline') { g.fillStyle = 'rgba(0,0,0,0)'; g.strokeStyle = 'rgba(150,170,150,0.85)'; }
      else if (m.kind === 'track') { g.fillStyle = 'rgba(70,90,70,0.3)'; g.strokeStyle = 'rgba(130,160,130,0.8)'; }
      else if (m.kind === 'crew') { g.fillStyle = 'rgba(90,190,120,0.55)'; g.strokeStyle = 'rgba(120,220,150,0.9)'; }
      else if (m.kind === 'fuel') { g.fillStyle = 'rgba(190,130,40,0.35)'; g.strokeStyle = 'rgba(220,160,60,0.9)'; }
      else { g.fillStyle = 'rgba(70,120,130,0.4)'; g.strokeStyle = 'rgba(110,170,180,0.9)'; }
    };
    g.lineWidth = 1.2;
    for (const m of MODULES) {
      style(m);
      const [x0, y0] = top(m.x1, m.z1), [x1, y1] = top(m.x0, m.z0);
      g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      const [sx0, sy0] = side(m.z0, m.y1), [sx1, sy1] = side(m.z1, m.y0);
      g.fillRect(sx0, sy0, sx1 - sx0, sy1 - sy0); g.strokeRect(sx0, sy0, sx1 - sx0, sy1 - sy0);
    }
    // ground line
    g.strokeStyle = 'rgba(160,190,150,0.35)'; g.beginPath(); g.moveTo(scx - 75, sbase); g.lineTo(scx + 80, sbase); g.stroke();

    // shell path
    const a = info.lp, d = info.ld, p0 = { x: a.x - d.x * 1.8, y: a.y - d.y * 1.8, z: a.z - d.z * 1.8 };
    const reach = info.result === 'pen' || info.result === 'crit' || info.result === 'fuel' ? 3.8 : 0;
    const p1 = { x: a.x + d.x * reach, y: a.y + d.y * reach, z: a.z + d.z * reach };
    g.strokeStyle = '#ffd24a'; g.lineWidth = 2; g.setLineDash([5, 3]);
    let [ax, ay] = top(p0.x, p0.z), [bx, by] = top(p1.x, p1.z);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    [ax, ay] = side(p0.z, p0.y); [bx, by] = side(p1.z, p1.y);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1;
    for (const [px, py] of [top(a.x, a.z), side(a.z, a.y)]) { g.beginPath(); g.arc(px, py, 3.6, 0, Math.PI * 2); g.fill(); g.stroke(); }

    g.font = '10px Consolas, monospace'; g.fillStyle = 'rgba(160,190,150,0.7)'; g.textAlign = 'center';
    g.fillText('СВЕРХУ', tcx, 182); g.fillText('СБОКУ', scx, 182);
    g.globalAlpha = 1;
  }
}
