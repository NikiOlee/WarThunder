import * as THREE from 'three';
import { getTankSpec, type TankSpec } from './tanks';
import { createMgState, startMgReload, stepMgState, tryFireMg, type MachineGunState } from './machineGun';
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

const _qTmp = new THREE.Quaternion();

function camoTexture(variant: 'soviet' | 'american' = 'soviet'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = variant === 'american' ? '#585c3a' : '#4e5b34';
  g.fillRect(0, 0, 128, 128);
  const cols =
    variant === 'american'
      ? ['#44472c', '#747249', '#383a24', '#636642']
      : ['#384324', '#6b6f3f', '#2d371c', '#5e653a'];
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

function dunkelgrauTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#484c52';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 280; i++) {
    const shade = 64 + Math.floor(Math.random() * 18);
    g.fillStyle = `rgba(${shade}, ${shade + 3}, ${shade + 7}, 0.28)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 1 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.5, 0.5);
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
  get isBoss(): boolean {
    return this.spec.id === 'maus';
  }
  matchKills = 0;
  matchDeaths = 0;

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
  mgState: MachineGunState;

  root: THREE.Group;
  hullMat!: THREE.MeshStandardMaterial;
  hullGroup!: THREE.Group;
  turretGroup!: THREE.Group;
  gunPivot!: THREE.Group;
  barrelGroup!: THREE.Group;
  muzzle!: THREE.Object3D;
  mgMuzzle!: THREE.Object3D;
  flameMuzzle: THREE.Object3D | null = null;
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
    this.mgState = createMgState(this.spec.mg);
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

  private _disposeHull(): void {
    if (!this.hullGroup) return;
    this.hullGroup.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m && 'map' in m && (m as THREE.MeshStandardMaterial).map) {
            (m as THREE.MeshStandardMaterial).map?.dispose();
          }
          m?.dispose();
        }
      }
    });
    this.root.remove(this.hullGroup);
  }

  private _build(): void {
    const isMaus = this.spec.id === 'maus';
    const isM60 = this.spec.id === 'm60a3';
    const hullTex = isMaus ? dunkelgrauTexture() : camoTexture(isM60 ? 'american' : 'soviet');
    const hullMat = new THREE.MeshStandardMaterial({
      map: hullTex,
      roughness: isMaus ? 0.62 : isM60 ? 0.82 : 0.78,
      metalness: isMaus ? 0.38 : 0.2,
      flatShading: true,
    });
    hullMat.color.setRGB(this.tint[0], this.tint[1], this.tint[2]);
    this.hullMat = hullMat;

    const darkMat = new THREE.MeshStandardMaterial({
      color: isMaus ? 0x222529 : 0x262820,
      roughness: 0.9,
      metalness: isMaus ? 0.34 : 0.25,
      flatShading: true,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: isMaus ? 0x373a40 : 0x3b3e37,
      roughness: isMaus ? 0.42 : 0.42,
      metalness: isMaus ? 0.76 : 0.72,
    });
    const fuelMat = new THREE.MeshStandardMaterial({ color: isM60 ? 0x4d4b31 : 0x45522d, roughness: 0.52, metalness: 0.38 });
    fuelMat.color.setRGB(fuelMat.color.r * this.tint[0], fuelMat.color.g * this.tint[1], fuelMat.color.b * this.tint[2]);

    this.hullGroup = new THREE.Group();
    this.root.add(this.hullGroup);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.hullGroup) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    this.tracks = [];
    this.wheels = [];
    this.flameMuzzle = null;

    if (isMaus) {
      // Panzerkampfwagen VIII "Maus": massive slab-sided Dunkelgrau hull with full side skirts, sloped glacis & rear boxy/curved turret
      const hull = new THREE.Mesh(
        prism(
          [
            [-4.55, 0.58],
            [4.05, 0.58],
            [4.62, 1.24],
            [3.05, 2.22],
            [-4.35, 2.22],
            [-4.68, 1.72],
          ],
          2.46,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // Full-length thick armored side skirts covering upper road wheels (distinctive Maus profile)
      const skirtGeo = prism(
        [
          [-4.45, 0.64],
          [4.12, 0.64],
          [4.56, 1.24],
          [3.05, 2.22],
          [-4.35, 2.22],
          [-4.65, 1.56],
        ],
        0.64,
      );
      for (const sx of [-1, 1]) {
        const skirt = new THREE.Mesh(skirtGeo, hullMat);
        skirt.position.set(sx * 1.52, 0, 0);
        this.hullGroup.add(skirt);
        // Subtle hull access plates & mudguard side flange
        add(new THREE.BoxGeometry(0.06, 0.32, 0.32), darkMat, sx * 1.85, 1.78, -3.55);
      }

      // Raised wedge driver visor hood ahead of turret + Notek blackout lamp on front glacis edge
      const visorGeo = prism(
        [
          [1.68, 2.22],
          [2.78, 2.22],
          [2.16, 2.52],
          [1.76, 2.48],
        ],
        1.1,
      );
      this.hullGroup.add(new THREE.Mesh(visorGeo, hullMat));
      add(new THREE.BoxGeometry(0.14, 0.22, 0.16), darkMat, 0.92, 2.31, 3.32); // Notek front blackout lamp

      // Engine deck cooling grilles & rear armored exhaust/towing lugs
      add(new THREE.BoxGeometry(1.9, 0.08, 1.45), darkMat, 0, 2.24, 1.15);
      add(new THREE.BoxGeometry(2.1, 0.08, 1.55), darkMat, 0, 2.24, -3.15);
      add(new THREE.BoxGeometry(2.25, 0.62, 0.22), darkMat, 0, 1.45, -4.64);
      add(new THREE.BoxGeometry(0.28, 0.26, 0.35), metalMat, -0.78, 1.12, -4.68);
      add(new THREE.BoxGeometry(0.28, 0.26, 0.35), metalMat, 0.78, 1.12, -4.68);

      // Wide Maus tracks + 12 small road wheels per side tucked cleanly under the side skirts
      const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.66, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      const hubGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.7, 8);
      hubGeo.rotateZ(Math.PI / 2);

      for (const sx of [1, -1]) {
        const tex = treadTexture();
        const sideMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
        const mats = [sideMat, sideMat, darkMat, darkMat, darkMat, darkMat];
        // Main lower track run + sloped front & rear track runs
        const trackLower = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.68, 7.85), mats);
        trackLower.position.set(sx * 1.5, 0.38, -0.15);
        this.hullGroup.add(trackLower);
        this.tracks.push({ tex, sign: sx });

        const frontClimb = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.3, 1.25), darkMat);
        frontClimb.position.set(sx * 1.5, 0.66, 3.92);
        frontClimb.rotation.x = -0.58;
        this.hullGroup.add(frontClimb);

        const rearClimb = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.3, 1.15), darkMat);
        rearClimb.position.set(sx * 1.5, 0.62, -4.22);
        rearClimb.rotation.x = 0.56;
        this.hullGroup.add(rearClimb);

        // 12 small overlapping-style road wheels along the lower track run
        for (let wi = 0; wi < 12; wi++) {
          const wz = -3.65 + wi * 0.65;
          const w = new THREE.Mesh(wheelGeo, hullMat);
          w.position.set(sx * 1.5, 0.4, wz);
          w.add(new THREE.Mesh(hubGeo, darkMat));
          this.hullGroup.add(w);
          this.wheels.push({ mesh: w, side: sx });
        }
      }

      // Massive rear-mounted Maus turret: curved cylindrical front + long tall boxy side/rear armor
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 2.18, -0.52);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;

      // Turret ring collar
      add(new THREE.CylinderGeometry(1.48, 1.54, 0.14, 20), darkMat, 0, 0.04, -0.2, tg);

      // Main boxy turret body (slightly sloped sides & angled rear plate matching photo)
      const mausTurretBody = new THREE.Mesh(
        prism(
          [
            [-2.58, 0.08],
            [0.95, 0.08],
            [1.08, 1.38],
            [-2.35, 1.36],
            [-2.68, 0.62],
          ],
          3.04,
        ),
        hullMat,
      );
      tg.add(mausTurretBody);

      // Characteristic curved rounded frontal Maus turret plate
      const curvedFrontGeo = new THREE.CylinderGeometry(0.66, 0.66, 3.04, 18);
      curvedFrontGeo.rotateZ(Math.PI / 2);
      const curvedFront = new THREE.Mesh(curvedFrontGeo, hullMat);
      curvedFront.scale.set(1, 0.98, 1.38);
      curvedFront.position.set(0, 0.72, 0.98);
      tg.add(curvedFront);

      // Rear turret circular hatch & armor plug + roof periscope cupolas
      const rearHatch = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.18, 14), hullMat);
      rearHatch.rotation.x = Math.PI / 2;
      rearHatch.position.set(0, 0.76, -2.62);
      tg.add(rearHatch);

      add(new THREE.CylinderGeometry(0.24, 0.32, 0.28, 10), hullMat, 0.42, 1.48, 0.12, tg); // forward periscope housing
      add(new THREE.CylinderGeometry(0.38, 0.42, 0.18, 12), hullMat, -0.48, 1.44, -0.62, tg); // commander cupola
      add(new THREE.CylinderGeometry(0.24, 0.28, 0.12, 10), darkMat, 0.45, 1.41, -1.25, tg); // ventilator cap

      // Heavy tapered armored gun mantlet collar
      const mantletGeo = new THREE.CylinderGeometry(0.4, 0.56, 0.85, 16);
      mantletGeo.rotateX(Math.PI / 2);
      const mantlet = new THREE.Mesh(mantletGeo, metalMat);
      mantlet.scale.set(1.38, 0.95, 1);
      mantlet.position.set(0, 0.68, 1.88);
      tg.add(mantlet);
      add(new THREE.BoxGeometry(1.18, 0.62, 0.52), hullMat, 0, 0.68, 1.68, tg);

      // 128mm KwK 44 main barrel + adjacent secondary flamethrower barrel/nozzle
      this.gunPivot = new THREE.Group();
      this.gunPivot.position.set(0, 0.68, 1.95);
      tg.add(this.gunPivot);
      this.barrelGroup = new THREE.Group();
      this.gunPivot.add(this.barrelGroup);

      const mainBarrel = new THREE.CylinderGeometry(0.115, 0.145, 5.5, 14);
      mainBarrel.rotateX(Math.PI / 2);
      add(mainBarrel, hullMat, 0, 0, 2.85, this.barrelGroup);

      const mainSleeve = new THREE.CylinderGeometry(0.2, 0.22, 1.15, 12);
      mainSleeve.rotateX(Math.PI / 2);
      add(mainSleeve, metalMat, 0, 0, 0.62, this.barrelGroup);

      const muzzleCollar = new THREE.CylinderGeometry(0.14, 0.125, 0.26, 12);
      muzzleCollar.rotateX(Math.PI / 2);
      add(muzzleCollar, metalMat, 0, 0, 5.52, this.barrelGroup);

      // Small secondary coaxial flamethrower barrel & igniter nozzle right beside the main gun
      const flamePipe = new THREE.CylinderGeometry(0.052, 0.062, 1.38, 10);
      flamePipe.rotateX(Math.PI / 2);
      add(flamePipe, metalMat, -0.44, -0.02, 0.78, this.gunPivot);

      const flameNozzleTip = new THREE.CylinderGeometry(0.072, 0.064, 0.24, 10);
      flameNozzleTip.rotateX(Math.PI / 2);
      add(flameNozzleTip, darkMat, -0.44, -0.02, 1.46, this.gunPivot);

      this.flameMuzzle = new THREE.Object3D();
      this.flameMuzzle.position.set(-0.44, -0.02, 1.62);
      this.gunPivot.add(this.flameMuzzle);

      // Coaxial MG 34 barrel opposite the flamethrower nozzle
      const mausMgPipe = new THREE.CylinderGeometry(0.028, 0.034, 1.12, 8);
      mausMgPipe.rotateX(Math.PI / 2);
      add(mausMgPipe, metalMat, 0.44, -0.02, 0.62, this.gunPivot);

      this.mgMuzzle = new THREE.Object3D();
      this.mgMuzzle.position.set(0.44, -0.02, 1.24);
      this.gunPivot.add(this.mgMuzzle);

      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 5.72);
      this.barrelGroup.add(this.muzzle);

      this.sightObj = new THREE.Object3D();
      this.sightObj.position.set(0, 1.56, 0.9);
      tg.add(this.sightObj);
      this.binocObj = new THREE.Object3D();
      this.binocObj.position.set(0, 2.55, -0.45);
      tg.add(this.binocObj);
    } else if (isM60) {
      // M60A3 Patton: bulkier, taller American MBT hull with broad sloped front & raised engine deck
      const hull = new THREE.Mesh(
        prism(
          [
            [-3.42, 0.54],
            [3.25, 0.54],
            [3.65, 1.15],
            [2.15, 1.88],
            [-2.55, 1.9],
            [-3.42, 1.72],
          ],
          3.18,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // Raised rear engine deck & louver doors (American Patton boxy tail silhouette)
      add(new THREE.BoxGeometry(2.55, 0.14, 1.9), darkMat, 0, 1.92, -2.15);
      add(new THREE.BoxGeometry(2.8, 0.55, 0.22), darkMat, 0, 1.38, -3.44);
      // Driver central periscope housing & raised glacis headlights
      add(new THREE.BoxGeometry(0.75, 0.16, 0.65), hullMat, 0, 1.9, 2.02);
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.28, 0.22, 0.24), metalMat, sx * 1.3, 1.54, 3.05);
        // Broad M60 fenders + stowage boxes
        add(new THREE.BoxGeometry(0.6, 0.1, 6.95), hullMat, sx * 1.84, 1.24, 0.02);
        add(new THREE.BoxGeometry(0.32, 0.34, 2.2), hullMat, sx * 1.84, 1.46, 0.45);
        // Rear internal/sponson fuel tank bays (M60A3 vulnerable fuel weakspot)
        add(new THREE.BoxGeometry(0.42, 0.46, 1.95), fuelMat, sx * 1.56, 1.5, -2.28);
      }
      // Rear fuel cell manifold / external auxiliary tanks
      add(new THREE.BoxGeometry(2.15, 0.48, 0.34), fuelMat, 0, 1.5, -3.38);

      // Tracks + 6 medium road wheels & 3 return rollers per side
      const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.72, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      const rollerGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.62, 8);
      rollerGeo.rotateZ(Math.PI / 2);
      const barGeo = new THREE.BoxGeometry(0.76, 0.08, 0.4);
      const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.78, 8);
      hubGeo.rotateZ(Math.PI / 2);

      for (const sx of [1, -1]) {
        const tex = treadTexture();
        const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
        const mats = [side, side, darkMat, darkMat, darkMat, darkMat];
        const track = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.06, 7.1), mats);
        track.position.set(sx * 1.88, 0.55, 0.02);
        this.hullGroup.add(track);
        this.tracks.push({ tex, sign: sx });

        const wz = [-2.75, -1.72, -0.7, 0.32, 1.35, 2.38];
        for (const z of wz) {
          const w = new THREE.Mesh(wheelGeo, metalMat);
          w.position.set(sx * 1.88, 0.46, z);
          w.add(new THREE.Mesh(barGeo, darkMat));
          w.add(new THREE.Mesh(hubGeo, darkMat));
          this.hullGroup.add(w);
          this.wheels.push({ mesh: w, side: sx });
        }
        for (const rz of [-1.45, 0.05, 1.55]) {
          add(rollerGeo, darkMat, sx * 1.88, 0.98, rz);
        }
      }

      // Characteristic M60A3 Patton "clam-shell / needle-nose" American turret + long bustle + M19 cupola
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 1.86, 0.12);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;

      const pattonTurret = new THREE.Mesh(
        prism(
          [
            [-2.15, 0.25],
            [-1.55, 0.02],
            [1.45, 0.02],
            [1.72, 0.56],
            [1.15, 1.04],
            [-1.85, 1.02],
            [-2.25, 0.68],
          ],
          2.48,
        ),
        hullMat,
      );
      tg.add(pattonTurret);

      // Sloped turret cheeks & boxy rear bustle storage basket
      add(new THREE.CylinderGeometry(1.22, 1.32, 0.14, 16), hullMat, 0, 0.05, 0.0, tg);
      add(new THREE.BoxGeometry(2.1, 0.58, 0.72), darkMat, 0, 0.66, -2.28, tg); // rear bustle rack
      // Large American M19 commander cupola with M85 MG
      add(new THREE.CylinderGeometry(0.42, 0.45, 0.42, 14), hullMat, -0.45, 1.22, -0.42, tg);
      add(new THREE.BoxGeometry(0.08, 0.08, 0.78), metalMat, -0.45, 1.48, -0.1, tg);
      add(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 12), hullMat, 0.52, 1.1, -0.25, tg); // loader hatch
      // Dual smoke grenade discharger clusters on turret sides
      for (const sx of [-1, 1]) {
        const sg = add(new THREE.BoxGeometry(0.24, 0.22, 0.34), darkMat, sx * 1.34, 0.62, 0.78, tg);
        sg.rotation.y = sx * 0.35;
      }
      // Tall whip antenna & rangefinder blisters on turret sides
      add(new THREE.CylinderGeometry(0.025, 0.025, 3.1, 4), metalMat, -1.05, 2.1, -1.75, tg);
      add(new THREE.BoxGeometry(2.68, 0.28, 0.34), hullMat, 0, 0.76, 0.58, tg); // coincidence rangefinder blisters
      // Heavy rectangular armored gun mantlet with dust cover boot
      add(new THREE.BoxGeometry(1.06, 0.74, 0.58), hullMat, 0, 0.56, 1.62, tg);
      add(new THREE.BoxGeometry(0.86, 0.54, 0.24), darkMat, 0, 0.56, 1.88, tg);
      // Rectangular IR/white searchlight above mantlet (iconic M60 box light)
      add(new THREE.BoxGeometry(0.46, 0.34, 0.32), darkMat, 0, 1.12, 1.48, tg);

      // 105mm M68 gun barrel with thermal shroud + mid-barrel bore evacuator + MRS tip
      this.gunPivot = new THREE.Group();
      this.gunPivot.position.set(0, 0.56, 1.75);
      tg.add(this.gunPivot);
      this.barrelGroup = new THREE.Group();
      this.gunPivot.add(this.barrelGroup);

      const barrelGeo = new THREE.CylinderGeometry(0.095, 0.115, 4.65, 12);
      barrelGeo.rotateX(Math.PI / 2);
      add(barrelGeo, hullMat, 0, 0, 2.38, this.barrelGroup);

      const sleeve = new THREE.CylinderGeometry(0.16, 0.16, 0.85, 12);
      sleeve.rotateX(Math.PI / 2);
      add(sleeve, darkMat, 0, 0, 0.42, this.barrelGroup);

      // Mid-barrel concentric bore evacuator (distinct from T-55's muzzle-tip evacuator)
      const evac = new THREE.CylinderGeometry(0.16, 0.16, 0.78, 12);
      evac.rotateX(Math.PI / 2);
      add(evac, metalMat, 0, 0, 2.25, this.barrelGroup);

      // Muzzle tip collar + Muzzle Reference Sensor mast
      const mtip = new THREE.CylinderGeometry(0.125, 0.115, 0.25, 12);
      mtip.rotateX(Math.PI / 2);
      add(mtip, metalMat, 0, 0, 4.62, this.barrelGroup);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), metalMat, 0, 0.17, 4.6, this.barrelGroup);

      // Coaxial machine gun barrel beside 105mm mantlet
      const m60MgPipe = new THREE.CylinderGeometry(0.032, 0.038, 0.96, 8);
      m60MgPipe.rotateX(Math.PI / 2);
      add(m60MgPipe, metalMat, 0.36, 0.02, 0.65, this.gunPivot);

      this.mgMuzzle = new THREE.Object3D();
      this.mgMuzzle.position.set(0.36, 0.02, 1.2);
      this.gunPivot.add(this.mgMuzzle);

      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 4.82);
      this.barrelGroup.add(this.muzzle);

      this.sightObj = new THREE.Object3D();
      this.sightObj.position.set(0, 1.24, 1.05);
      tg.add(this.sightObj);
      this.binocObj = new THREE.Object3D();
      this.binocObj.position.set(0, 2.15, -0.4);
      tg.add(this.binocObj);
    } else {
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
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(1.42, 0.0),
        new THREE.Vector2(1.48, 0.2),
        new THREE.Vector2(1.36, 0.56),
        new THREE.Vector2(1.05, 0.84),
        new THREE.Vector2(0.55, 0.95),
        new THREE.Vector2(0.0, 0.96),
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

      // Coaxial PKT machine gun barrel beside D-10T2S mantlet
      const t55MgPipe = new THREE.CylinderGeometry(0.026, 0.032, 0.88, 8);
      t55MgPipe.rotateX(Math.PI / 2);
      add(t55MgPipe, metalMat, 0.33, 0.02, 0.58, this.gunPivot);

      this.mgMuzzle = new THREE.Object3D();
      this.mgMuzzle.position.set(0.33, 0.02, 1.08);
      this.gunPivot.add(this.mgMuzzle);

      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 4.55);
      this.barrelGroup.add(this.muzzle);

      this.sightObj = new THREE.Object3D();
      this.sightObj.position.set(0, 1.12, 0.95);
      tg.add(this.sightObj);
      this.binocObj = new THREE.Object3D();
      this.binocObj.position.set(0, 1.95, -0.35);
      tg.add(this.binocObj);
    }

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
    const isMaus = this.spec.id === 'maus';
    const L = isMaus ? 4.4 : 3.2;
    const W = isMaus ? 1.95 : 1.8;
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
    const baseTurretY = this.spec.id === 'maus' ? 2.18 : this.spec.id === 'm60a3' ? 1.86 : 1.64;
    this.root.rotation.set(-this._pitchUp, this.heading, this._rollLeftUp);
    this.hullGroup.rotation.x = this._springX;
    this.turretGroup.rotation.y = this.turretYaw;
    this.turretGroup.position.y = baseTurretY + this._turretLift;
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

    const isMaus = this.spec.id === 'maus';
    const R = isMaus ? 4.1 : 3.3;
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
    if (this.alive) stepMgState(this.mgState, st.mg, dt);
    this.recoil = Math.max(0, this.recoil - dt * 2.2);

    const hw = isMaus ? 1.9 : 1.75;
    const vl = this.speed - this.yawRate * hw;
    const vr = this.speed + this.yawRate * hw;
    const trackLen = isMaus ? 7.85 : 6.9;
    const wheelR = isMaus ? 0.34 : 0.47;
    for (const t of this.tracks) {
      const vt = t.sign > 0 ? vl : vr;
      t.tex.offset.x += (t.sign * vt * dt * t.tex.repeat.x) / trackLen;
    }
    for (const w of this.wheels) w.mesh.rotation.x += ((w.side > 0 ? vl : vr) * dt) / wheelR;

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

  syncAfterCollision(): void {
    const lim = this.world.limit;
    this.root.position.x = clamp(this.root.position.x, -lim, lim);
    this.root.position.z = clamp(this.root.position.z, -lim, lim);
    this._sampleGround(0, true);
    this._applyPose();
    this.root.updateMatrixWorld(true);
  }

  reset(x: number, z: number, heading: number, specId?: string): void {
    const prevId = this.spec.id;
    if (specId) {
      this.spec = getTankSpec(specId);
      this.stats = this.spec;
      this.maxHp = this.spec.maxHp;
    }
    if (this.spec.id !== prevId) {
      this._disposeHull();
      this._build();
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
    this.recoil = 0;
    this.mgState = createMgState(this.stats.mg);
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

  fireMg() {
    if (!this.alive) return null;
    const mg = this.stats.mg;
    if (!tryFireMg(this.mgState, mg)) return null;
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.mgMuzzleWorld(pos);
    this.gunDirection(dir);
    const sp = mg.spread;
    if (sp > 0) {
      dir.x += (Math.random() * 2 - 1) * sp;
      dir.y += (Math.random() * 2 - 1) * sp;
      dir.z += (Math.random() * 2 - 1) * sp;
      dir.normalize();
    }
    return {
      pos,
      dir,
      speed: mg.muzzleVelocity,
      caliber: 0.012,
      penetrationMm: 18,
      maxRange: mg.maxRange,
      type: 'MG' as const,
      mgDamage: mg.damage,
    };
  }

  reloadMg(): boolean {
    if (!this.alive) return false;
    return startMgReload(this.mgState, this.stats.mg);
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    this.muzzle.updateWorldMatrix(true, false);
    return this.muzzle.getWorldPosition(out);
  }
  mgMuzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const obj = this.mgMuzzle || this.muzzle;
    obj.updateWorldMatrix(true, false);
    return obj.getWorldPosition(out);
  }
  flameMuzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const obj = this.flameMuzzle || this.muzzle;
    obj.updateWorldMatrix(true, false);
    return obj.getWorldPosition(out);
  }
  gunDirection(out: THREE.Vector3): THREE.Vector3 {
    this.muzzle.updateWorldMatrix(true, false);
    this.muzzle.getWorldQuaternion(_qTmp);
    return out.set(0, 0, 1).applyQuaternion(_qTmp).normalize();
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
