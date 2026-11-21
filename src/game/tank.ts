import * as THREE from 'three';
import { getTankSpec, type TankSpec } from './tanks';
import { createMgState, startMgReload, stepMgState, tryFireMg, type MachineGunState } from './machineGun';
import { buildTankTracks, type TrackScrollRef, type TrackWheelRef } from './trackAssembly';
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

function camoTexture(
  variant:
    | 'soviet'
    | 'american'
    | 'sovietModern'
    | 'russianModern'
    | 'natoGerman'
    | 'usModern'
    | 'chineseModern' = 'soviet',
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle =
    variant === 'american'
      ? '#585c3a'
      : variant === 'natoGerman'
        ? '#435032'
        : variant === 'sovietModern'
          ? '#414f2c'
          : variant === 'russianModern'
            ? '#3b4a2b'
            : variant === 'usModern'
              ? '#4b4e33'
              : variant === 'chineseModern'
                ? '#48522e'
                : '#4e5b34';
  g.fillRect(0, 0, 128, 128);
  const cols =
    variant === 'american'
      ? ['#44472c', '#747249', '#383a24', '#636642']
      : variant === 'natoGerman'
        ? ['#4f3d28', '#222520', '#56633e', '#364128']
        : variant === 'sovietModern'
          ? ['#2d381d', '#586234', '#232c16', '#4a572f']
          : variant === 'russianModern'
            ? ['#242c1a', '#525e37', '#1c2216', '#45512e']
            : variant === 'usModern'
              ? ['#34381f', '#616344', '#272a17', '#565a3a']
              : variant === 'chineseModern'
                ? ['#2b3419', '#5c6836', '#202714', '#4b5730']
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
  tracks: TrackScrollRef[] = [];
  wheels: TrackWheelRef[] = [];
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
    const isT62M = this.spec.id === 't62m';
    const isT72B3 = this.spec.id === 't72b3';
    const isLeopard2A4 = this.spec.id === 'leopard2a4';
    const isM1A1 = this.spec.id === 'm1a1';
    const isZtz96a = this.spec.id === 'ztz96a';
    const isT90M = this.spec.id === 't90m';
    const hullTex = isMaus
      ? dunkelgrauTexture()
      : camoTexture(
          isM60
            ? 'american'
            : isLeopard2A4
              ? 'natoGerman'
              : isT72B3 || isT90M
                ? 'russianModern'
                : isT62M
                  ? 'sovietModern'
                  : isM1A1
                    ? 'usModern'
                    : isZtz96a
                      ? 'chineseModern'
                      : 'soviet',
        );
    const hullMat = new THREE.MeshStandardMaterial({
      map: hullTex,
      roughness: isMaus
        ? 0.62
        : isM60
          ? 0.82
          : isLeopard2A4
            ? 0.66
            : isT72B3 || isT90M
              ? 0.68
              : isT62M
                ? 0.74
                : isM1A1 || isZtz96a
                  ? 0.7
                  : 0.78,
      metalness: isMaus
        ? 0.38
        : isLeopard2A4
          ? 0.3
          : isT72B3 || isT90M
            ? 0.28
            : isT62M
              ? 0.24
              : isM1A1 || isZtz96a
                ? 0.26
                : 0.2,
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
          2.42,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // Continuous wide Maus tracks, toothed rear sprockets, idlers, return rollers & 11 bogie road wheels per side
      const mausTracks = buildTankTracks(
        this.hullGroup,
        {
          trackX: 1.56,
          trackWidth: 0.58,
          beltThickness: 0.065,
          wheelY: 0.43,
          wheelR: 0.34,
          wheelPositionsZ: [-3.35, -2.69, -2.03, -1.37, -0.71, -0.05, 0.61, 1.27, 1.93, 2.59, 3.25],
          idlerZ: 4.02,
          idlerY: 0.78,
          idlerR: 0.32,
          sprocketZ: -4.08,
          sprocketY: 0.76,
          sprocketR: 0.33,
          returnRollersZ: [-2.6, -1.3, 0.0, 1.3, 2.6],
          returnRollerR: 0.11,
          sprocketTeeth: 14,
          fenderY: 1.32,
          mudguardFrontZ: 4.44,
          mudguardRearZ: -4.48,
        },
        { hullMat, darkMat, metalMat },
      );
      this.tracks.push(...mausTracks.tracks);
      this.wheels.push(...mausTracks.wheels);

      // Full-length thick outer armored side skirts + upper sponson deck (strictly outside tracks & stepped 0.02m below main deck)
      const outerSkirtGeo = prism(
        [
          [-4.45, 0.64],
          [4.12, 0.64],
          [4.56, 1.24],
          [3.05, 2.2],
          [-4.35, 2.2],
          [-4.65, 1.56],
        ],
        0.13,
      );
      const sponsonDeckGeo = prism(
        [
          [-4.35, 2.08],
          [3.05, 2.08],
          [3.12, 2.2],
          [-4.35, 2.2],
        ],
        0.78,
      );
      for (const sx of [-1, 1]) {
        const skirt = new THREE.Mesh(outerSkirtGeo, hullMat);
        skirt.position.set(sx * 1.94, 0, 0);
        this.hullGroup.add(skirt);
        const sponson = new THREE.Mesh(sponsonDeckGeo, hullMat);
        sponson.position.set(sx * 1.61, 0, 0);
        this.hullGroup.add(sponson);
        // Side hull access hatch plate strictly outside outer skirt surface
        add(new THREE.BoxGeometry(0.05, 0.32, 0.32), darkMat, sx * 2.02, 1.78, -3.55);
      }

      // Raised wedge driver visor hood ahead of turret (sunk 0.04m into deck to prevent coplanar floor overlap) + Notek blackout lamp
      const visorGeo = prism(
        [
          [1.68, 2.18],
          [2.78, 2.18],
          [2.16, 2.52],
          [1.76, 2.48],
        ],
        1.1,
      );
      this.hullGroup.add(new THREE.Mesh(visorGeo, hullMat));
      add(new THREE.BoxGeometry(0.14, 0.22, 0.16), darkMat, 0.92, 2.33, 3.32);

      // Engine deck cooling grilles & rear armored exhaust/towing lugs
      add(new THREE.BoxGeometry(1.9, 0.08, 1.45), darkMat, 0, 2.24, 1.15);
      add(new THREE.BoxGeometry(2.1, 0.08, 1.55), darkMat, 0, 2.24, -3.15);
      add(new THREE.BoxGeometry(2.25, 0.62, 0.22), darkMat, 0, 1.45, -4.64);
      add(new THREE.BoxGeometry(0.28, 0.26, 0.35), metalMat, -0.78, 1.12, -4.68);
      add(new THREE.BoxGeometry(0.28, 0.26, 0.35), metalMat, 0.78, 1.12, -4.68);

      // Massive rear-mounted Maus turret: curved cylindrical front + long tall boxy side/rear armor
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 2.23, -0.52);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;

      // Turret ring collar
      add(new THREE.CylinderGeometry(1.48, 1.54, 0.08, 20), darkMat, 0, 0.04, -0.2, tg);

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

      // Characteristic curved rounded frontal Maus turret plate (slightly inset in width so sides never z-fight body)
      const curvedFrontGeo = new THREE.CylinderGeometry(0.66, 0.66, 3.0, 18);
      curvedFrontGeo.rotateZ(Math.PI / 2);
      const curvedFront = new THREE.Mesh(curvedFrontGeo, hullMat);
      curvedFront.scale.set(1, 0.98, 1.38);
      curvedFront.position.set(0, 0.72, 0.98);
      tg.add(curvedFront);

      // Rear turret circular hatch & armor plug + roof periscope cupolas
      const rearHatch = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.18, 14), hullMat);
      rearHatch.rotation.x = Math.PI / 2;
      rearHatch.position.set(0, 0.76, -2.64);
      tg.add(rearHatch);

      add(new THREE.CylinderGeometry(0.24, 0.32, 0.28, 10), hullMat, 0.42, 1.48, 0.12, tg); // forward periscope housing
      add(new THREE.CylinderGeometry(0.38, 0.42, 0.18, 12), hullMat, -0.48, 1.44, -0.62, tg); // commander cupola
      add(new THREE.CylinderGeometry(0.24, 0.28, 0.12, 10), darkMat, 0.45, 1.42, -1.25, tg); // ventilator cap

      // Heavy tapered armored gun mantlet collar
      const mantletGeo = new THREE.CylinderGeometry(0.4, 0.56, 0.85, 16);
      mantletGeo.rotateX(Math.PI / 2);
      const mantlet = new THREE.Mesh(mantletGeo, metalMat);
      mantlet.scale.set(1.38, 0.95, 1);
      mantlet.position.set(0, 0.68, 1.94);
      tg.add(mantlet);
      add(new THREE.BoxGeometry(1.22, 0.64, 0.52), hullMat, 0, 0.68, 1.64, tg);

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
          3.0,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // Raised rear engine deck & louver doors (American Patton boxy tail silhouette)
      add(new THREE.BoxGeometry(2.55, 0.14, 1.9), darkMat, 0, 1.94, -2.15);
      add(new THREE.BoxGeometry(2.76, 0.55, 0.2), darkMat, 0, 1.38, -3.44);
      // Driver central periscope housing & raised glacis headlights
      add(new THREE.BoxGeometry(0.75, 0.16, 0.65), hullMat, 0, 1.92, 2.02);
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.28, 0.22, 0.24), metalMat, sx * 1.26, 1.54, 3.05);
        // Broad M60 fenders + stowage boxes (non-coplanar, clear above track maxY)
        add(new THREE.BoxGeometry(0.6, 0.07, 6.65), hullMat, sx * 1.86, 1.25, 0.02);
        add(new THREE.BoxGeometry(0.32, 0.34, 2.15), hullMat, sx * 1.86, 1.46, 0.45);
        // Rear internal/sponson fuel tank bays (M60A3 vulnerable fuel weakspot)
        add(new THREE.BoxGeometry(0.36, 0.44, 1.92), fuelMat, sx * 1.7, 1.52, -2.28);
      }
      // Rear fuel cell manifold / external auxiliary tanks
      add(new THREE.BoxGeometry(2.15, 0.46, 0.3), fuelMat, 0, 1.5, -3.38);

      // Continuous M60 tracks + 6 road wheels + 3 return rollers + toothed rear sprocket + mudguards
      const m60Tracks = buildTankTracks(
        this.hullGroup,
        {
          trackX: 1.86,
          trackWidth: 0.58,
          beltThickness: 0.06,
          wheelY: 0.49,
          wheelR: 0.41,
          wheelPositionsZ: [-2.7, -1.68, -0.66, 0.36, 1.38, 2.4],
          idlerZ: 3.24,
          idlerY: 0.77,
          idlerR: 0.3,
          sprocketZ: -3.28,
          sprocketY: 0.73,
          sprocketR: 0.31,
          returnRollersZ: [-1.5, 0.0, 1.5],
          returnRollerR: 0.11,
          sprocketTeeth: 12,
          fenderY: 1.25,
          mudguardFrontZ: 3.55,
          mudguardRearZ: -3.5,
        },
        { hullMat, darkMat, metalMat },
      );
      this.tracks.push(...m60Tracks.tracks);
      this.wheels.push(...m60Tracks.wheels);

      // Characteristic M60A3 Patton "clam-shell / needle-nose" American turret + long bustle + M19 cupola
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 1.91, 0.12);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;

      add(new THREE.CylinderGeometry(1.22, 1.32, 0.08, 16), darkMat, 0, 0.04, 0.0, tg);

      const pattonTurret = new THREE.Mesh(
        prism(
          [
            [-2.15, 0.25],
            [-1.55, 0.08],
            [1.45, 0.08],
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

      // Bustle storage basket
      add(new THREE.BoxGeometry(2.1, 0.58, 0.72), darkMat, 0, 0.66, -2.3, tg);
      // Large American M19 commander cupola with M85 MG
      add(new THREE.CylinderGeometry(0.42, 0.45, 0.42, 14), hullMat, -0.45, 1.24, -0.42, tg);
      add(new THREE.BoxGeometry(0.08, 0.08, 0.78), metalMat, -0.45, 1.5, -0.1, tg);
      add(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 12), hullMat, 0.52, 1.1, -0.25, tg); // loader hatch
      // Dual smoke grenade discharger clusters on turret sides
      for (const sx of [-1, 1]) {
        const sg = add(new THREE.BoxGeometry(0.24, 0.22, 0.34), darkMat, sx * 1.36, 0.62, 0.78, tg);
        sg.rotation.y = sx * 0.35;
      }
      // Tall whip antenna & rangefinder blisters on turret sides
      add(new THREE.CylinderGeometry(0.025, 0.025, 3.1, 4), metalMat, -1.05, 2.1, -1.75, tg);
      add(new THREE.BoxGeometry(2.7, 0.28, 0.34), hullMat, 0, 0.76, 0.58, tg); // coincidence rangefinder blisters
      // Heavy rectangular armored gun mantlet with dust cover boot
      add(new THREE.BoxGeometry(1.06, 0.74, 0.5), hullMat, 0, 0.56, 1.64, tg);
      add(new THREE.BoxGeometry(0.84, 0.52, 0.18), darkMat, 0, 0.56, 1.92, tg);
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
    } else if (isT62M) {
      // T-62M: elongated low Soviet hull with BDD glacis appliqué, rubber side skirts, low flattened turret with "eyebrow" cheek armor, and long 115mm smoothbore barrel
      const hull = new THREE.Mesh(
        prism(
          [
            [-3.62, 0.52],
            [3.38, 0.52],
            [3.78, 0.96],
            [2.32, 1.64],
            [-2.95, 1.66],
            [-3.62, 1.36],
          ],
          2.96,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // BDD upper glacis composite appliqué armor block (characteristic T-62M front hull step)
      const glacisBdd = new THREE.Mesh(
        prism(
          [
            [2.32, 1.64],
            [3.68, 1.02],
            [3.78, 1.15],
            [2.45, 1.78],
          ],
          2.55,
        ),
        hullMat,
      );
      this.hullGroup.add(glacisBdd);

      // Engine deck louver, driver hatch, headlights & lower splash guard
      add(new THREE.BoxGeometry(2.22, 0.08, 1.85), darkMat, 0, 1.68, -2.18);
      add(new THREE.BoxGeometry(0.72, 0.1, 0.56), darkMat, 0.68, 1.72, 2.02);
      add(new THREE.BoxGeometry(0.24, 0.18, 0.18), metalMat, 1.08, 1.48, 3.16);
      add(new THREE.BoxGeometry(0.24, 0.18, 0.18), metalMat, -1.08, 1.48, 3.16);

      // Side fenders + full-length rubberized/armored side skirts (бортовые экраны)
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.58, 0.07, 6.82), hullMat, sx * 1.82, 1.15, 0.03);
        add(new THREE.BoxGeometry(0.06, 0.6, 6.7), darkMat, sx * 2.15, 0.8, -0.02);
        // External rear-side fender fuel cells (vulnerable weakspot)
        add(new THREE.BoxGeometry(0.34, 0.4, 2.0), fuelMat, sx * 1.66, 1.39, -2.38);
      }
      // Dual rear cylindrical external fuel drums (vulnerable weakspot)
      const drumGeo = new THREE.CylinderGeometry(0.27, 0.27, 1.22, 12);
      drumGeo.rotateZ(Math.PI / 2);
      for (const sx of [-1, 1]) {
        add(drumGeo, fuelMat, sx * 0.72, 1.32, -3.66);
      }
      // Unditching log on rear hull
      const logGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8);
      logGeo.rotateZ(Math.PI / 2);
      add(logGeo, new THREE.MeshStandardMaterial({ color: 0x5c4730, roughness: 0.95 }), 0, 1.0, -3.66);

      // Continuous T-62M tracks + 5 rear-biased large road wheels + idlers + toothed sprockets + mudguards
      const t62Tracks = buildTankTracks(
        this.hullGroup,
        {
          trackX: 1.82,
          trackWidth: 0.56,
          beltThickness: 0.055,
          wheelY: 0.49,
          wheelR: 0.41,
          wheelPositionsZ: [-2.78, -1.52, -0.26, 0.96, 2.34],
          idlerZ: 3.24,
          idlerY: 0.72,
          idlerR: 0.28,
          sprocketZ: -3.32,
          sprocketY: 0.69,
          sprocketR: 0.3,
          sprocketTeeth: 12,
          fenderY: 1.15,
          mudguardFrontZ: 3.6,
          mudguardRearZ: -3.56,
        },
        { hullMat, darkMat, metalMat },
      );
      this.tracks.push(...t62Tracks.tracks);
      this.wheels.push(...t62Tracks.wheels);

      // Low, wide flattened cast T-62M turret + signature BDD "eyebrow" («брови») cheek appliqué blocks
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 1.67, 0.08);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;

      add(new THREE.CylinderGeometry(1.42, 1.46, 0.07, 20), darkMat, 0, 0.035, -0.04, tg);

      const domePts = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(1.48, 0.0),
        new THREE.Vector2(1.54, 0.18),
        new THREE.Vector2(1.4, 0.48),
        new THREE.Vector2(1.06, 0.74),
        new THREE.Vector2(0.52, 0.86),
        new THREE.Vector2(0.0, 0.88),
      ];
      const domeGeo = new THREE.LatheGeometry(domePts, 20);
      domeGeo.scale(1.04, 1.0, 1.24);
      const dome = new THREE.Mesh(domeGeo, hullMat);
      dome.position.set(0, 0.07, -0.06);
      tg.add(dome);

      // Iconic BDD horseshoe "eyebrow" («брови») appliqué armor blocks left & right of mantlet
      const browGeo = prism(
        [
          [-0.45, 0.06],
          [0.65, 0.14],
          [0.48, 0.66],
          [-0.38, 0.72],
        ],
        0.88,
      );
      for (const sx of [-1, 1]) {
        const brow = new THREE.Mesh(browGeo, hullMat);
        brow.position.set(sx * 0.98, 0.08, 1.22);
        brow.rotation.y = -sx * 0.34;
        tg.add(brow);
        // Recessed backing collar tucked strictly behind brow so edges never fight
        const browBacking = add(new THREE.BoxGeometry(0.76, 0.44, 0.12), darkMat, sx * 0.96, 0.42, 1.06, tg);
        browBacking.rotation.y = -sx * 0.34;
        // "Tucha" 4-tube smoke grenade discharger cluster behind the eyebrow blocks
        const smokeRack = add(new THREE.BoxGeometry(0.18, 0.24, 0.38), darkMat, sx * 1.48, 0.46, 0.28, tg);
        smokeRack.rotation.y = sx * 0.25;
      }

      // Low cupolas, AA 12.7mm DShKM MG, laser rangefinder box above mantlet, Luna IR searchlight & snorkel
      add(new THREE.CylinderGeometry(0.36, 0.4, 0.2, 12), hullMat, 0.52, 0.92, -0.32, tg); // commander cupola
      add(new THREE.CylinderGeometry(0.28, 0.32, 0.14, 12), hullMat, -0.52, 0.88, -0.28, tg); // loader hatch
      add(new THREE.BoxGeometry(0.08, 0.08, 0.95), metalMat, -0.52, 1.06, 0.04, tg); // 12.7mm DShKM
      add(new THREE.CylinderGeometry(0.025, 0.025, 3.0, 4), metalMat, 0.95, 1.9, -1.5, tg); // whip antenna
      add(new THREE.BoxGeometry(0.86, 0.56, 0.48), hullMat, 0, 0.44, 1.62, tg); // mantlet
      add(new THREE.BoxGeometry(0.34, 0.16, 0.32), darkMat, 0, 0.8, 1.56, tg); // KTD-2 laser rangefinder above gun
      const irLight = new THREE.CylinderGeometry(0.17, 0.17, 0.24, 10);
      irLight.rotateX(Math.PI / 2);
      add(irLight, darkMat, -0.66, 0.52, 1.72, tg); // Luna IR light
      // Rear turret stowage bin & wading snorkel tube
      add(new THREE.BoxGeometry(1.55, 0.38, 0.42), darkMat, 0, 0.46, -2.02, tg);

      // Long 115mm U-5TS smoothbore cannon with thermal shroud & mid-barrel bore evacuator
      this.gunPivot = new THREE.Group();
      this.gunPivot.position.set(0, 0.44, 1.72);
      tg.add(this.gunPivot);
      this.barrelGroup = new THREE.Group();
      this.gunPivot.add(this.barrelGroup);

      const barrelGeo = new THREE.CylinderGeometry(0.095, 0.115, 5.15, 12);
      barrelGeo.rotateX(Math.PI / 2);
      add(barrelGeo, hullMat, 0, 0, 2.65, this.barrelGroup);

      // Thermal shroud segments + mantlet dust sleeve
      const sleeve = new THREE.CylinderGeometry(0.165, 0.165, 0.95, 12);
      sleeve.rotateX(Math.PI / 2);
      add(sleeve, darkMat, 0, 0, 0.46, this.barrelGroup);

      // Mid-barrel concentric bore evacuator (~2/3 down the 115mm U-5TS barrel)
      const evac = new THREE.CylinderGeometry(0.16, 0.16, 0.82, 12);
      evac.rotateX(Math.PI / 2);
      add(evac, metalMat, 0, 0, 2.95, this.barrelGroup);

      const mtip = new THREE.CylinderGeometry(0.12, 0.105, 0.22, 12);
      mtip.rotateX(Math.PI / 2);
      add(mtip, metalMat, 0, 0, 5.16, this.barrelGroup);

      // Coaxial MG beside mantlet
      const t62MgPipe = new THREE.CylinderGeometry(0.028, 0.034, 0.95, 8);
      t62MgPipe.rotateX(Math.PI / 2);
      add(t62MgPipe, metalMat, 0.34, 0.02, 0.62, this.gunPivot);

      this.mgMuzzle = new THREE.Object3D();
      this.mgMuzzle.position.set(0.34, 0.02, 1.15);
      this.gunPivot.add(this.mgMuzzle);

      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 5.38);
      this.barrelGroup.add(this.muzzle);

      this.sightObj = new THREE.Object3D();
      this.sightObj.position.set(0, 1.02, 1.02);
      tg.add(this.sightObj);
      this.binocObj = new THREE.Object3D();
      this.binocObj.position.set(0, 1.85, -0.35);
      tg.add(this.binocObj);
    } else if (isT72B3) {
      // T-72B3: modern Russian MBT with Relikt ERA boxes on upper glacis & side skirts, wedge ERA modules on turret cheeks, Sosna-U sight, and thermal-shrouded 125mm gun
      const hull = new THREE.Mesh(
        prism(
          [
            [-3.48, 0.52],
            [3.22, 0.52],
            [3.66, 0.98],
            [2.18, 1.64],
            [-2.82, 1.66],
            [-3.48, 1.36],
          ],
          3.02,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // Relikt ERA rectangular tiles arrayed cleanly in local tilted groups across upper glacis
      const eraBlockGeo = new THREE.BoxGeometry(0.42, 0.14, 0.38);
      const eraSeamGeo = new THREE.BoxGeometry(0.4, 0.04, 0.36);
      for (const row of [
        { y: 1.49, z: 2.52 },
        { y: 1.25, z: 3.06 },
      ]) {
        for (const ex of [-1.06, -0.53, 0, 0.53, 1.06]) {
          const eg = new THREE.Group();
          eg.position.set(ex, row.y, row.z);
          eg.rotation.x = 0.42;
          add(eraBlockGeo, hullMat, 0, 0.02, 0, eg);
          add(eraSeamGeo, darkMat, 0, -0.07, 0, eg);
          this.hullGroup.add(eg);
        }
      }
      // Driver center periscope hood & recessed glacis headlights
      add(new THREE.BoxGeometry(0.56, 0.12, 0.48), darkMat, 0, 1.69, 2.02);
      add(new THREE.BoxGeometry(0.22, 0.16, 0.18), metalMat, 1.14, 1.38, 3.32);
      add(new THREE.BoxGeometry(0.22, 0.16, 0.18), metalMat, -1.14, 1.38, 3.32);

      // Engine deck radiator grilles & rear armored louvers
      add(new THREE.BoxGeometry(2.3, 0.08, 1.8), darkMat, 0, 1.68, -2.12);

      // Heavy Relikt side skirts with 6 modular ERA boxes per side + rear fender fuel tanks
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.58, 0.07, 6.7), hullMat, sx * 1.84, 1.15, 0.03);
        add(new THREE.BoxGeometry(0.06, 0.58, 6.6), darkMat, sx * 2.17, 0.8, -0.02);
        for (let bi = 0; bi < 6; bi++) {
          const bz = 2.45 - bi * 0.84;
          add(new THREE.BoxGeometry(0.12, 0.44, 0.76), hullMat, sx * 2.27, 0.86, bz);
        }
        // Rear-side fender fuel cells (vulnerable weakspot)
        add(new THREE.BoxGeometry(0.34, 0.42, 1.94), fuelMat, sx * 1.66, 1.4, -2.35);
      }
      // Dual rear cylindrical external fuel drums (vulnerable weakspot)
      const drumGeo = new THREE.CylinderGeometry(0.27, 0.27, 1.2, 12);
      drumGeo.rotateZ(Math.PI / 2);
      for (const sx of [-1, 1]) {
        add(drumGeo, fuelMat, sx * 0.72, 1.32, -3.54);
      }
      // Unditching log on rear deck
      const logGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8);
      logGeo.rotateZ(Math.PI / 2);
      add(logGeo, new THREE.MeshStandardMaterial({ color: 0x5c4730, roughness: 0.95 }), 0, 1.0, -3.54);

      // Continuous T-72B3 tracks + 6 road wheels + idlers + toothed rear sprockets + mudguards
      const t72Tracks = buildTankTracks(
        this.hullGroup,
        {
          trackX: 1.84,
          trackWidth: 0.56,
          beltThickness: 0.055,
          wheelY: 0.49,
          wheelR: 0.41,
          wheelPositionsZ: [-2.68, -1.64, -0.6, 0.44, 1.48, 2.52],
          idlerZ: 3.24,
          idlerY: 0.72,
          idlerR: 0.28,
          sprocketZ: -3.28,
          sprocketY: 0.69,
          sprocketR: 0.3,
          sprocketTeeth: 12,
          fenderY: 1.15,
          mudguardFrontZ: 3.55,
          mudguardRearZ: -3.5,
        },
        { hullMat, darkMat, metalMat },
      );
      this.tracks.push(...t72Tracks.tracks);
      this.wheels.push(...t72Tracks.wheels);

      // Low modern T-72B3 turret with wedge-shaped Relikt ERA cheek pods & roof ERA bricks
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 1.67, 0.06);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;

      add(new THREE.CylinderGeometry(1.42, 1.46, 0.07, 20), darkMat, 0, 0.035, -0.06, tg);

      const domePts = [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(1.44, 0.0),
        new THREE.Vector2(1.5, 0.2),
        new THREE.Vector2(1.38, 0.52),
        new THREE.Vector2(1.06, 0.78),
        new THREE.Vector2(0.55, 0.88),
        new THREE.Vector2(0.0, 0.9),
      ];
      const domeGeo = new THREE.LatheGeometry(domePts, 20);
      domeGeo.scale(1.06, 1.0, 1.18);
      const dome = new THREE.Mesh(domeGeo, hullMat);
      dome.position.set(0, 0.07, -0.08);
      tg.add(dome);

      // Wedge-shaped Relikt ERA pods («клиновидные блоки») across frontal turret cheeks
      const wedgeGeo = prism(
        [
          [-0.52, 0.06],
          [0.78, 0.34],
          [-0.42, 0.68],
        ],
        0.84,
      );
      for (const sx of [-1, 1]) {
        const outerWedge = new THREE.Mesh(wedgeGeo, hullMat);
        outerWedge.position.set(sx * 0.95, 0.1, 1.2);
        outerWedge.rotation.y = -sx * 0.36;
        tg.add(outerWedge);
        // Inner cheek ERA wedge adjacent to gun mantlet
        const innerEra = add(new THREE.BoxGeometry(0.46, 0.44, 0.44), hullMat, sx * 0.58, 0.44, 1.54, tg);
        innerEra.rotation.y = -sx * 0.22;
        innerEra.rotation.x = 0.18;
        // Side turret Relikt ERA skirts + 4-tube Tucha smoke grenade launchers
        add(new THREE.BoxGeometry(0.14, 0.42, 1.25), hullMat, sx * 1.58, 0.42, 0.05, tg);
        const smokeRack = add(new THREE.BoxGeometry(0.2, 0.24, 0.42), darkMat, sx * 1.62, 0.5, -0.72, tg);
        smokeRack.rotation.y = sx * 0.25;
      }

      // Roof Relikt ERA tile array cleanly perched on turret top
      for (const rx of [-0.52, 0, 0.52]) {
        add(new THREE.BoxGeometry(0.42, 0.09, 0.4), hullMat, rx, 0.95, 0.55, tg);
      }

      // Sosna-U multi-channel thermal sight box + commander cupola with 12.7mm Kord AA MG + rear stowage rack
      add(new THREE.BoxGeometry(0.38, 0.32, 0.46), darkMat, 0.58, 0.94, 0.88, tg); // Sosna-U gunner thermal sight
      add(new THREE.CylinderGeometry(0.36, 0.4, 0.22, 12), hullMat, -0.52, 0.95, -0.34, tg); // commander cupola
      add(new THREE.CylinderGeometry(0.28, 0.32, 0.14, 12), hullMat, 0.52, 0.9, -0.3, tg); // gunner hatch
      add(new THREE.BoxGeometry(0.08, 0.08, 0.98), metalMat, -0.52, 1.12, 0.02, tg); // 12.7mm Kord AA MG
      add(new THREE.CylinderGeometry(0.025, 0.025, 3.0, 4), metalMat, 0.95, 1.9, -1.5, tg); // whip antenna
      add(new THREE.BoxGeometry(0.84, 0.56, 0.48), hullMat, 0, 0.44, 1.62, tg); // gun mantlet
      add(new THREE.BoxGeometry(1.75, 0.4, 0.46), darkMat, 0, 0.48, -1.98, tg); // rear stowage basket + snorkel

      // Long 125mm 2A46M-5 smoothbore barrel with segmented thermal shroud & mid-barrel evacuator
      this.gunPivot = new THREE.Group();
      this.gunPivot.position.set(0, 0.44, 1.72);
      tg.add(this.gunPivot);
      this.barrelGroup = new THREE.Group();
      this.gunPivot.add(this.barrelGroup);

      const barrelGeo = new THREE.CylinderGeometry(0.098, 0.118, 5.28, 12);
      barrelGeo.rotateX(Math.PI / 2);
      add(barrelGeo, hullMat, 0, 0, 2.7, this.barrelGroup);

      // Segmented thermal shroud jacket sleeves along barrel
      const sleeve = new THREE.CylinderGeometry(0.165, 0.165, 1.1, 12);
      sleeve.rotateX(Math.PI / 2);
      add(sleeve, darkMat, 0, 0, 0.54, this.barrelGroup);

      const shroud2 = new THREE.CylinderGeometry(0.148, 0.148, 1.35, 12);
      shroud2.rotateX(Math.PI / 2);
      add(shroud2, darkMat, 0, 0, 1.9, this.barrelGroup);

      const evac = new THREE.CylinderGeometry(0.168, 0.168, 0.85, 12);
      evac.rotateX(Math.PI / 2);
      add(evac, metalMat, 0, 0, 2.95, this.barrelGroup);

      const shroud3 = new THREE.CylinderGeometry(0.136, 0.136, 1.55, 12);
      shroud3.rotateX(Math.PI / 2);
      add(shroud3, darkMat, 0, 0, 4.25, this.barrelGroup);

      // Muzzle collar + MRS laser alignment tip
      const mtip = new THREE.CylinderGeometry(0.122, 0.11, 0.24, 12);
      mtip.rotateX(Math.PI / 2);
      add(mtip, metalMat, 0, 0, 5.26, this.barrelGroup);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), metalMat, 0, 0.15, 5.26, this.barrelGroup);

      // Coaxial 7.62mm PKTM beside mantlet
      const t72MgPipe = new THREE.CylinderGeometry(0.028, 0.034, 0.96, 8);
      t72MgPipe.rotateX(Math.PI / 2);
      add(t72MgPipe, metalMat, 0.34, 0.02, 0.64, this.gunPivot);

      this.mgMuzzle = new THREE.Object3D();
      this.mgMuzzle.position.set(0.34, 0.02, 1.18);
      this.gunPivot.add(this.mgMuzzle);

      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 5.48);
      this.barrelGroup.add(this.muzzle);

      this.sightObj = new THREE.Object3D();
      this.sightObj.position.set(0, 1.04, 1.02);
      tg.add(this.sightObj);
      this.binocObj = new THREE.Object3D();
      this.binocObj.position.set(0, 1.88, -0.35);
      tg.add(this.binocObj);
    } else if (isLeopard2A4) {
      // Leopard 2A4: long German MBT hull, armored NATO side skirts, 7 road wheels, and characteristic square vertical-face composite turret
      const hull = new THREE.Mesh(
        prism(
          [
            [-3.72, 0.52],
            [3.42, 0.52],
            [3.74, 0.98],
            [2.05, 1.66],
            [-3.68, 1.66],
            [-3.74, 1.24],
          ],
          3.04,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // Driver periscope hatch (offset right), twin front headlights, tow shackles & front mudguard steps
      add(new THREE.BoxGeometry(0.58, 0.1, 0.52), darkMat, -0.54, 1.68, 2.02);
      add(new THREE.BoxGeometry(0.24, 0.18, 0.2), metalMat, 1.2, 1.4, 3.38);
      add(new THREE.BoxGeometry(0.24, 0.18, 0.2), metalMat, -1.2, 1.4, 3.38);
      add(new THREE.BoxGeometry(0.22, 0.16, 0.24), metalMat, 0.88, 0.88, 3.68);
      add(new THREE.BoxGeometry(0.22, 0.16, 0.24), metalMat, -0.88, 0.88, 3.68);

      // Large rear engine deck radiator grilles & boxy rear exhaust louver panel
      add(new THREE.BoxGeometry(2.5, 0.08, 2.05), darkMat, 0, 1.68, -2.35);
      add(new THREE.BoxGeometry(2.72, 0.48, 0.18), darkMat, 0, 1.32, -3.72);

      // Heavy NATO segmented side skirts (zero rear/front overlap) + rear hull fuel bays
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.6, 0.07, 7.05), hullMat, sx * 1.88, 1.19, 0.01);
        // Rear light ballistic skirt (-3.61 .. -0.31)
        add(new THREE.BoxGeometry(0.09, 0.6, 3.3), hullMat, sx * 2.22, 0.82, -1.96);
        // Segmented heavy ballistic front skirt panels (4 spaced blocks forward of -0.28)
        for (let bi = 0; bi < 4; bi++) {
          const bz = 2.9 - bi * 0.92;
          add(new THREE.BoxGeometry(0.12, 0.66, 0.84), darkMat, sx * 2.24, 0.81, bz);
        }
        // Rear hull fuel cells (Leopard 2A4 vulnerable fuel tank weakspot)
        add(new THREE.BoxGeometry(0.36, 0.42, 2.05), fuelMat, sx * 1.68, 1.44, -2.55);
      }
      add(new THREE.BoxGeometry(2.3, 0.44, 0.34), fuelMat, 0, 1.36, -3.6);

      // Continuous Leopard 2A4 tracks + 7 road wheels + 3 return rollers + toothed sprocket + mudguards
      const leoTracks = buildTankTracks(
        this.hullGroup,
        {
          trackX: 1.88,
          trackWidth: 0.58,
          beltThickness: 0.055,
          wheelY: 0.49,
          wheelR: 0.41,
          wheelPositionsZ: [-2.86, -1.94, -1.02, -0.1, 0.82, 1.74, 2.66],
          idlerZ: 3.38,
          idlerY: 0.74,
          idlerR: 0.28,
          sprocketZ: -3.44,
          sprocketY: 0.71,
          sprocketR: 0.3,
          returnRollersZ: [-2.35, -0.55, 1.25],
          returnRollerR: 0.11,
          sprocketTeeth: 12,
          fenderY: 1.19,
          mudguardFrontZ: 3.72,
          mudguardRearZ: -3.72,
        },
        { hullMat, darkMat, metalMat },
      );
      this.tracks.push(...leoTracks.tracks);
      this.wheels.push(...leoTracks.wheels);

      // Characteristic angular "square" Leopard 2A4 turret with vertical composite front face & long bustle
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 1.67, 0.14);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;

      // Turret ring collar
      add(new THREE.CylinderGeometry(1.36, 1.42, 0.07, 20), darkMat, 0, 0.035, 0.0, tg);

      // Square main turret hull (front stops at z=1.16 so front composite cheeks sit cleanly proud without z-fighting)
      const leoTurretBody = new THREE.Mesh(
        prism(
          [
            [-2.58, 0.14],
            [-1.12, 0.07],
            [1.16, 0.07],
            [1.16, 0.98],
            [-2.52, 0.95],
          ],
          2.9,
        ),
        hullMat,
      );
      tg.add(leoTurretBody);

      // Left vertical frontal composite cheek (proud z = 1.17..1.53)
      add(new THREE.BoxGeometry(1.04, 0.9, 0.36), hullMat, 0.94, 0.53, 1.35, tg);
      // Right vertical frontal composite cheek split around the recessed EMES-15 gunner sight housing
      add(new THREE.BoxGeometry(0.46, 0.9, 0.36), hullMat, -1.23, 0.53, 1.35, tg);
      add(new THREE.BoxGeometry(0.56, 0.36, 0.36), hullMat, -0.72, 0.26, 1.35, tg);
      // Recessed EMES-15 primary thermal sight aperture & armored doors on turret front-right
      add(new THREE.BoxGeometry(0.52, 0.48, 0.22), darkMat, -0.72, 0.71, 1.28, tg);
      add(new THREE.BoxGeometry(0.32, 0.28, 0.06), metalMat, -0.72, 0.72, 1.43, tg);

      // Central boxy vertical gun mantlet between frontal cheeks
      add(new THREE.BoxGeometry(0.64, 0.68, 0.42), hullMat, 0, 0.48, 1.42, tg);
      add(new THREE.BoxGeometry(0.48, 0.5, 0.12), darkMat, 0, 0.48, 1.66, tg);

      // Blow-off ammunition panels cleanly proud of rear bustle roof & rear stowage basket
      add(new THREE.BoxGeometry(2.15, 0.06, 1.15), darkMat, 0, 1.01, -1.68, tg);
      add(new THREE.BoxGeometry(2.38, 0.48, 0.36), darkMat, 0, 0.62, -2.72, tg);

      // Commander PERI R17 panoramic periscope, loader hatch, roof MG3 & twin smoke discharger racks
      add(new THREE.CylinderGeometry(0.24, 0.28, 0.28, 12), darkMat, -0.75, 1.12, 0.25, tg); // PERI R17
      add(new THREE.CylinderGeometry(0.34, 0.36, 0.12, 12), hullMat, -0.68, 1.03, -0.38, tg); // commander hatch
      add(new THREE.CylinderGeometry(0.32, 0.34, 0.12, 12), hullMat, 0.56, 1.03, -0.25, tg); // loader hatch
      add(new THREE.BoxGeometry(0.08, 0.08, 0.88), metalMat, 0.56, 1.17, 0.08, tg); // roof MG3
      for (const sx of [-1, 1]) {
        // Side turret applique armor ribs & 4-tube smoke grenade launcher clusters
        add(new THREE.BoxGeometry(0.1, 0.72, 2.55), hullMat, sx * 1.5, 0.54, -0.35, tg);
        const smokeRack = add(new THREE.BoxGeometry(0.2, 0.26, 0.48), darkMat, sx * 1.62, 0.52, 0.52, tg);
        smokeRack.rotation.y = -sx * 0.22;
        add(new THREE.CylinderGeometry(0.022, 0.022, 2.9, 4), metalMat, sx * 1.28, 1.92, -2.28, tg);
      }

      // 120mm Rh-120 L/44 smoothbore cannon with thermal shroud, mid-barrel bore evacuator & coaxial MG3
      this.gunPivot = new THREE.Group();
      this.gunPivot.position.set(0, 0.48, 1.48);
      tg.add(this.gunPivot);
      this.barrelGroup = new THREE.Group();
      this.gunPivot.add(this.barrelGroup);

      const barrelGeo = new THREE.CylinderGeometry(0.095, 0.115, 5.15, 12);
      barrelGeo.rotateX(Math.PI / 2);
      add(barrelGeo, hullMat, 0, 0, 2.65, this.barrelGroup);

      const sleeve = new THREE.CylinderGeometry(0.16, 0.16, 1.05, 12);
      sleeve.rotateX(Math.PI / 2);
      add(sleeve, darkMat, 0, 0, 0.52, this.barrelGroup);

      const evac = new THREE.CylinderGeometry(0.175, 0.175, 0.85, 12);
      evac.rotateX(Math.PI / 2);
      add(evac, metalMat, 0, 0, 2.48, this.barrelGroup);

      const mtip = new THREE.CylinderGeometry(0.12, 0.105, 0.24, 12);
      mtip.rotateX(Math.PI / 2);
      add(mtip, metalMat, 0, 0, 5.2, this.barrelGroup);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), metalMat, 0, 0.15, 5.2, this.barrelGroup);

      // Coaxial 7.62mm MG3 beside mantlet
      const leoMgPipe = new THREE.CylinderGeometry(0.028, 0.034, 0.94, 8);
      leoMgPipe.rotateX(Math.PI / 2);
      add(leoMgPipe, metalMat, 0.34, 0.02, 0.62, this.gunPivot);

      this.mgMuzzle = new THREE.Object3D();
      this.mgMuzzle.position.set(0.34, 0.02, 1.16);
      this.gunPivot.add(this.mgMuzzle);

      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 5.45);
      this.barrelGroup.add(this.muzzle);

      this.sightObj = new THREE.Object3D();
      this.sightObj.position.set(0, 1.08, 1.05);
      tg.add(this.sightObj);
      this.binocObj = new THREE.Object3D();
      this.binocObj.position.set(0, 1.92, -0.35);
      tg.add(this.binocObj);
    } else if (isM1A1) {
      // M1A1 Abrams: wide low American hull with broad flat glacis, massive angular turret with swept cheeks and long 120mm M256
      const hull = new THREE.Mesh(
        prism(
          [
            [-3.62, 0.52],
            [3.38, 0.52],
            [3.74, 0.9],
            [2.42, 1.5],
            [0.75, 1.7],
            [-2.95, 1.7],
            [-3.62, 1.4],
          ],
          3.04,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // Driver's hatch, periscopes and recessed headlights
      add(new THREE.BoxGeometry(0.72, 0.1, 0.66), darkMat, 0, 1.66, 2.18);
      add(new THREE.BoxGeometry(0.34, 0.1, 0.24), darkMat, 0, 1.69, 2.5);
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.26, 0.2, 0.22), metalMat, sx * 1.24, 1.3, 3.44);
        add(new THREE.BoxGeometry(0.2, 0.14, 0.2), darkMat, sx * 0.82, 1.5, 3.26);
        // External rear sponson fuel cells (vulnerable weakspot)
        add(new THREE.BoxGeometry(0.36, 0.44, 2.02), fuelMat, sx * 1.68, 1.46, -2.6);
      }
      // Rear engine deck grilles, exhaust louver panel & tow pintle
      add(new THREE.BoxGeometry(2.62, 0.1, 2.0), darkMat, 0, 1.72, -2.25);
      add(new THREE.BoxGeometry(2.86, 0.5, 0.2), darkMat, 0, 1.36, -3.7);
      add(new THREE.BoxGeometry(0.9, 0.32, 0.18), darkMat, 0, 1.78, -3.0);

      // Wide Abrams fenders and segmented side skirts (no rear/front coplanar overlap)
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.6, 0.07, 7.12), hullMat, sx * 1.88, 1.2, 0.02);
        // Rear side skirt (-3.58 .. +0.02)
        add(new THREE.BoxGeometry(0.09, 0.62, 3.6), hullMat, sx * 2.22, 0.83, -1.78);
        // 3 front heavy ballistic skirt panels (0.34 .. 3.10)
        for (let bi = 0; bi < 3; bi++) {
          add(new THREE.BoxGeometry(0.12, 0.66, 0.88), darkMat, sx * 2.24, 0.81, 2.66 - bi * 0.94);
        }
      }

      // Continuous Abrams tracks + 7 road wheels + 3 return rollers + toothed sprocket + mudguards
      const abramsTracks = buildTankTracks(
        this.hullGroup,
        {
          trackX: 1.88,
          trackWidth: 0.6,
          beltThickness: 0.055,
          wheelY: 0.49,
          wheelR: 0.41,
          wheelPositionsZ: [-2.92, -1.98, -1.04, -0.1, 0.84, 1.78, 2.72],
          idlerZ: 3.44,
          idlerY: 0.74,
          idlerR: 0.28,
          sprocketZ: -3.48,
          sprocketY: 0.71,
          sprocketR: 0.3,
          returnRollersZ: [-2.4, -0.5, 1.4],
          returnRollerR: 0.11,
          sprocketTeeth: 12,
          fenderY: 1.2,
          mudguardFrontZ: 3.78,
          mudguardRearZ: -3.74,
        },
        { hullMat, darkMat, metalMat },
      );
      this.tracks.push(...abramsTracks.tracks);
      this.wheels.push(...abramsTracks.wheels);

      // Massive angular Abrams turret with long rear bustle
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 1.71, 0.1);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;
      add(new THREE.CylinderGeometry(1.4, 1.46, 0.07, 20), darkMat, 0, 0.035, 0, tg);

      const abramsTurret = new THREE.Mesh(
        prism(
          [
            [-2.62, 0.12],
            [-1.1, 0.07],
            [1.12, 0.07],
            [1.58, 0.52],
            [1.18, 0.98],
            [-2.35, 1.02],
            [-2.72, 0.66],
          ],
          3.0,
        ),
        hullMat,
      );
      tg.add(abramsTurret);

      // Big swept-back frontal cheek armor blocks
      for (const sx of [-1, 1]) {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.82, 0.5), hullMat);
        cheek.position.set(sx * 0.92, 0.55, 1.24);
        cheek.rotation.y = -sx * 0.3;
        tg.add(cheek);
        const cheekWed = add(new THREE.BoxGeometry(0.92, 0.28, 0.34), darkMat, sx * 0.92, 0.18, 1.34, tg);
        cheekWed.rotation.y = -sx * 0.3;
        // Side turret armor ribs & smoke discharger clusters
        add(new THREE.BoxGeometry(0.1, 0.6, 2.2), hullMat, sx * 1.55, 0.5, -0.3, tg);
        const smoke = add(new THREE.BoxGeometry(0.22, 0.24, 0.44), darkMat, sx * 1.58, 0.62, 0.7, tg);
        smoke.rotation.y = -sx * 0.2;
      }

      // Central gun mantlet & armored trunnion block
      add(new THREE.BoxGeometry(0.86, 0.72, 0.54), hullMat, 0, 0.5, 1.52, tg);
      add(new THREE.BoxGeometry(0.64, 0.5, 0.14), darkMat, 0, 0.5, 1.82, tg);

      // Rear bustle with blow-off panels cleanly proud of roof & stowage rack
      add(new THREE.BoxGeometry(2.56, 0.08, 1.32), darkMat, 0, 1.06, -2.05, tg);
      add(new THREE.BoxGeometry(2.7, 0.44, 0.34), darkMat, 0, 0.66, -2.78, tg);

      // Commander cupola with M2HB, loader hatch, CITV sight & antenna
      add(new THREE.CylinderGeometry(0.38, 0.42, 0.26, 12), hullMat, 0.5, 1.14, -0.62, tg);
      add(new THREE.BoxGeometry(0.08, 0.08, 0.92), metalMat, 0.5, 1.3, -0.2, tg);
      add(new THREE.CylinderGeometry(0.3, 0.34, 0.14, 12), hullMat, -0.52, 1.08, -0.5, tg);
      add(new THREE.BoxGeometry(0.42, 0.34, 0.46), darkMat, 1.06, 1.08, 0.22, tg);
      add(new THREE.CylinderGeometry(0.022, 0.022, 2.7, 4), metalMat, -1.2, 2.0, -2.1, tg);
      add(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 10), darkMat, -0.15, 1.06, 0.25, tg);

      // 120mm M256 smoothbore with thermal shroud, bore evacuator & MRS tip
      this.gunPivot = new THREE.Group();
      this.gunPivot.position.set(0, 0.5, 1.56);
      tg.add(this.gunPivot);
      this.barrelGroup = new THREE.Group();
      this.gunPivot.add(this.barrelGroup);

      const barrelGeo = new THREE.CylinderGeometry(0.098, 0.118, 5.15, 12);
      barrelGeo.rotateX(Math.PI / 2);
      add(barrelGeo, hullMat, 0, 0, 2.65, this.barrelGroup);

      const sleeve = new THREE.CylinderGeometry(0.165, 0.165, 1.0, 12);
      sleeve.rotateX(Math.PI / 2);
      add(sleeve, darkMat, 0, 0, 0.55, this.barrelGroup);

      const evac = new THREE.CylinderGeometry(0.175, 0.175, 0.85, 12);
      evac.rotateX(Math.PI / 2);
      add(evac, metalMat, 0, 0, 2.55, this.barrelGroup);

      const mtip = new THREE.CylinderGeometry(0.122, 0.106, 0.24, 12);
      mtip.rotateX(Math.PI / 2);
      add(mtip, metalMat, 0, 0, 5.18, this.barrelGroup);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), metalMat, 0, 0.15, 5.18, this.barrelGroup);

      // Coaxial 7.62mm M240 beside the mantlet
      const mgPipe = new THREE.CylinderGeometry(0.028, 0.034, 0.94, 8);
      mgPipe.rotateX(Math.PI / 2);
      add(mgPipe, metalMat, 0.36, 0.02, 0.62, this.gunPivot);

      this.mgMuzzle = new THREE.Object3D();
      this.mgMuzzle.position.set(0.36, 0.02, 1.16);
      this.gunPivot.add(this.mgMuzzle);

      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 5.42);
      this.barrelGroup.add(this.muzzle);

      this.sightObj = new THREE.Object3D();
      this.sightObj.position.set(0, 1.14, 1.05);
      tg.add(this.sightObj);
      this.binocObj = new THREE.Object3D();
      this.binocObj.position.set(0, 1.98, -0.4);
      tg.add(this.binocObj);
    } else if (isZtz96a) {
      // ZTZ-96A: low Chinese hull, wedge-shaped turret densely covered with ERA blocks, long 125mm smoothbore
      const hull = new THREE.Mesh(
        prism(
          [
            [-3.5, 0.5],
            [3.28, 0.5],
            [3.66, 0.92],
            [2.3, 1.56],
            [-2.9, 1.58],
            [-3.5, 1.32],
          ],
          2.98,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // Glacis ERA tile array in local tilted groups
      const glacisEra = new THREE.BoxGeometry(0.4, 0.14, 0.36);
      const glacisSeam = new THREE.BoxGeometry(0.38, 0.04, 0.34);
      for (const row of [
        { y: 1.4, z: 2.48 },
        { y: 1.18, z: 2.98 },
      ]) {
        for (const ex of [-0.98, -0.49, 0, 0.49, 0.98]) {
          const eg = new THREE.Group();
          eg.position.set(ex, row.y, row.z);
          eg.rotation.x = 0.4;
          add(glacisEra, hullMat, 0, 0.02, 0, eg);
          add(glacisSeam, darkMat, 0, -0.07, 0, eg);
          this.hullGroup.add(eg);
        }
      }
      // Driver hatch, periscopes & headlights
      add(new THREE.BoxGeometry(0.62, 0.1, 0.5), darkMat, 0.28, 1.62, 1.9);
      add(new THREE.BoxGeometry(0.22, 0.16, 0.18), metalMat, 1.12, 1.36, 3.24);
      add(new THREE.BoxGeometry(0.22, 0.16, 0.18), metalMat, -1.12, 1.36, 3.24);

      // Engine deck grilles & rear exhaust louver
      add(new THREE.BoxGeometry(2.24, 0.08, 1.78), darkMat, 0, 1.62, -2.05);
      add(new THREE.BoxGeometry(2.5, 0.44, 0.18), darkMat, 0, 1.3, -3.48);

      // Side skirts with 5 ERA modules per side (non-overlapping) + rear fender fuel cells
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.58, 0.07, 6.74), hullMat, sx * 1.82, 1.15, 0.02);
        add(new THREE.BoxGeometry(0.06, 0.58, 6.6), darkMat, sx * 2.15, 0.8, -0.02);
        for (let bi = 0; bi < 5; bi++) {
          add(new THREE.BoxGeometry(0.12, 0.44, 0.78), hullMat, sx * 2.25, 0.86, 2.4 - bi * 0.88);
        }
        // Rear-side fuel cells (vulnerable weakspot)
        add(new THREE.BoxGeometry(0.34, 0.4, 1.9), fuelMat, sx * 1.64, 1.39, -2.32);
      }
      add(new THREE.BoxGeometry(2.0, 0.42, 0.3), fuelMat, 0, 1.3, -3.5);

      // Continuous ZTZ-96A tracks + 6 road wheels + idlers + toothed sprocket + mudguards
      const ztzTracks = buildTankTracks(
        this.hullGroup,
        {
          trackX: 1.82,
          trackWidth: 0.56,
          beltThickness: 0.055,
          wheelY: 0.49,
          wheelR: 0.41,
          wheelPositionsZ: [-2.74, -1.66, -0.58, 0.5, 1.58, 2.58],
          idlerZ: 3.28,
          idlerY: 0.72,
          idlerR: 0.28,
          sprocketZ: -3.32,
          sprocketY: 0.69,
          sprocketR: 0.3,
          sprocketTeeth: 12,
          fenderY: 1.15,
          mudguardFrontZ: 3.58,
          mudguardRearZ: -3.52,
        },
        { hullMat, darkMat, metalMat },
      );
      this.tracks.push(...ztzTracks.tracks);
      this.wheels.push(...ztzTracks.wheels);

      // Low wedge-shaped turret covered in ERA blocks
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 1.6, 0.06);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;
      add(new THREE.CylinderGeometry(1.38, 1.44, 0.07, 20), darkMat, 0, 0.035, -0.02, tg);

      const ztzTurret = new THREE.Mesh(
        prism(
          [
            [-2.28, 0.12],
            [-1.02, 0.07],
            [1.04, 0.07],
            [1.46, 0.5],
            [1.06, 0.96],
            [-1.96, 1.0],
            [-2.46, 0.62],
          ],
          2.9,
        ),
        hullMat,
      );
      tg.add(ztzTurret);

      // Signature wedge-shaped ERA cheek pods
      const wedgeGeo = prism(
        [
          [-0.5, 0.06],
          [0.8, 0.32],
          [-0.42, 0.68],
        ],
        0.82,
      );
      for (const sx of [-1, 1]) {
        const cheek = new THREE.Mesh(wedgeGeo, hullMat);
        cheek.position.set(sx * 0.92, 0.1, 1.2);
        cheek.rotation.y = -sx * 0.34;
        tg.add(cheek);
        // Inner ERA brick beside the mantlet
        const inner = add(new THREE.BoxGeometry(0.44, 0.42, 0.42), hullMat, sx * 0.56, 0.42, 1.5, tg);
        inner.rotation.y = -sx * 0.2;
        // Side turret ERA row strictly outside ±1.45 turret sides
        for (let i = 0; i < 3; i++) {
          add(new THREE.BoxGeometry(0.12, 0.4, 0.52), hullMat, sx * 1.52, 0.42, 0.38 - i * 0.56, tg);
        }
        // Smoke discharger cluster
        const smoke = add(new THREE.BoxGeometry(0.2, 0.24, 0.4), darkMat, sx * 1.56, 0.56, 0.82, tg);
        smoke.rotation.y = -sx * 0.2;
      }

      // Roof ERA bricks cleanly perched atop turret roof
      for (const rx of [-0.52, 0, 0.52]) {
        add(new THREE.BoxGeometry(0.42, 0.08, 0.4), hullMat, rx, 1.01, 0.5, tg);
      }

      // Gun mantlet, commander cupola with QJC-88, laser sight & rear stowage basket
      add(new THREE.BoxGeometry(0.82, 0.56, 0.5), hullMat, 0, 0.44, 1.6, tg);
      add(new THREE.BoxGeometry(0.34, 0.16, 0.32), darkMat, 0, 0.78, 1.54, tg);
      add(new THREE.CylinderGeometry(0.36, 0.4, 0.22, 12), hullMat, 0.5, 0.98, -0.36, tg);
      add(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 12), hullMat, -0.5, 0.94, -0.32, tg);
      add(new THREE.BoxGeometry(0.08, 0.08, 0.96), metalMat, 0.5, 1.15, 0.0, tg);
      add(new THREE.CylinderGeometry(0.025, 0.025, 2.9, 4), metalMat, -0.98, 1.9, -1.55, tg);
      add(new THREE.BoxGeometry(1.7, 0.4, 0.44), darkMat, 0, 0.48, -1.98, tg);

      // 125mm ZPT-98 smoothbore with thermal shroud & bore evacuator
      this.gunPivot = new THREE.Group();
      this.gunPivot.position.set(0, 0.44, 1.7);
      tg.add(this.gunPivot);
      this.barrelGroup = new THREE.Group();
      this.gunPivot.add(this.barrelGroup);

      const barrelGeo = new THREE.CylinderGeometry(0.098, 0.118, 5.22, 12);
      barrelGeo.rotateX(Math.PI / 2);
      add(barrelGeo, hullMat, 0, 0, 2.68, this.barrelGroup);

      const sleeve = new THREE.CylinderGeometry(0.166, 0.166, 1.05, 12);
      sleeve.rotateX(Math.PI / 2);
      add(sleeve, darkMat, 0, 0, 0.52, this.barrelGroup);

      const evac = new THREE.CylinderGeometry(0.168, 0.168, 0.84, 12);
      evac.rotateX(Math.PI / 2);
      add(evac, metalMat, 0, 0, 2.72, this.barrelGroup);

      const mtip = new THREE.CylinderGeometry(0.122, 0.108, 0.24, 12);
      mtip.rotateX(Math.PI / 2);
      add(mtip, metalMat, 0, 0, 5.2, this.barrelGroup);

      // Coaxial machine gun
      const mgPipe = new THREE.CylinderGeometry(0.028, 0.034, 0.94, 8);
      mgPipe.rotateX(Math.PI / 2);
      add(mgPipe, metalMat, 0.34, 0.02, 0.62, this.gunPivot);

      this.mgMuzzle = new THREE.Object3D();
      this.mgMuzzle.position.set(0.34, 0.02, 1.16);
      this.gunPivot.add(this.mgMuzzle);

      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 5.44);
      this.barrelGroup.add(this.muzzle);

      this.sightObj = new THREE.Object3D();
      this.sightObj.position.set(0, 1.06, 1.0);
      tg.add(this.sightObj);
      this.binocObj = new THREE.Object3D();
      this.binocObj.position.set(0, 1.88, -0.38);
      tg.add(this.binocObj);
    } else if (isT90M) {
      // T-90M: welded angular turret with Relikt ERA all over, characteristic rear turret stowage box and thermal-shrouded 125mm
      const hull = new THREE.Mesh(
        prism(
          [
            [-3.45, 0.5],
            [3.25, 0.5],
            [3.68, 0.96],
            [2.2, 1.62],
            [-2.88, 1.64],
            [-3.45, 1.34],
          ],
          3.02,
        ),
        hullMat,
      );
      this.hullGroup.add(hull);

      // Relikt ERA tiles across upper glacis (0.37m wide at 0.42m pitch -> crisp 5cm gaps, zero neighbor z-fighting)
      const eraBlockGeo = new THREE.BoxGeometry(0.37, 0.14, 0.36);
      const eraSeamGeo = new THREE.BoxGeometry(0.35, 0.04, 0.34);
      for (const row of [
        { y: 1.47, z: 2.5 },
        { y: 1.23, z: 3.02 },
      ]) {
        for (const ex of [-1.05, -0.63, -0.21, 0.21, 0.63, 1.05]) {
          const eg = new THREE.Group();
          eg.position.set(ex, row.y, row.z);
          eg.rotation.x = 0.42;
          add(eraBlockGeo, hullMat, 0, 0.02, 0, eg);
          add(eraSeamGeo, darkMat, 0, -0.07, 0, eg);
          this.hullGroup.add(eg);
        }
      }
      // Driver periscope hood & recessed headlights
      add(new THREE.BoxGeometry(0.56, 0.12, 0.48), darkMat, 0, 1.66, 2.0);
      add(new THREE.BoxGeometry(0.22, 0.16, 0.18), metalMat, 1.14, 1.36, 3.3);
      add(new THREE.BoxGeometry(0.22, 0.16, 0.18), metalMat, -1.14, 1.36, 3.3);

      // Engine deck grilles & rear armored louvers
      add(new THREE.BoxGeometry(2.3, 0.08, 1.8), darkMat, 0, 1.66, -2.1);
      add(new THREE.BoxGeometry(2.55, 0.46, 0.18), darkMat, 0, 1.3, -3.46);

      // Relikt side skirts with modular ERA boxes + rear fender fuel cells
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.58, 0.07, 6.7), hullMat, sx * 1.84, 1.15, 0.03);
        add(new THREE.BoxGeometry(0.06, 0.58, 6.6), darkMat, sx * 2.17, 0.8, -0.02);
        for (let bi = 0; bi < 6; bi++) {
          add(new THREE.BoxGeometry(0.12, 0.44, 0.76), hullMat, sx * 2.27, 0.86, 2.45 - bi * 0.84);
        }
        // Rear-side fuel cells (vulnerable weakspot)
        add(new THREE.BoxGeometry(0.34, 0.4, 1.92), fuelMat, sx * 1.66, 1.39, -2.34);
      }
      // Dual rear external fuel drums & unditching log (vulnerable weakspot)
      const drumGeo = new THREE.CylinderGeometry(0.27, 0.27, 1.2, 12);
      drumGeo.rotateZ(Math.PI / 2);
      for (const sx of [-1, 1]) {
        add(drumGeo, fuelMat, sx * 0.72, 1.3, -3.52);
      }
      const logGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8);
      logGeo.rotateZ(Math.PI / 2);
      add(logGeo, new THREE.MeshStandardMaterial({ color: 0x5c4730, roughness: 0.95 }), 0, 0.98, -3.52);

      // Continuous T-90M tracks + 6 road wheels + idlers + toothed sprockets + mudguards
      const t90Tracks = buildTankTracks(
        this.hullGroup,
        {
          trackX: 1.84,
          trackWidth: 0.56,
          beltThickness: 0.055,
          wheelY: 0.49,
          wheelR: 0.41,
          wheelPositionsZ: [-2.7, -1.64, -0.58, 0.48, 1.54, 2.58],
          idlerZ: 3.26,
          idlerY: 0.72,
          idlerR: 0.28,
          sprocketZ: -3.3,
          sprocketY: 0.69,
          sprocketR: 0.3,
          sprocketTeeth: 12,
          fenderY: 1.15,
          mudguardFrontZ: 3.56,
          mudguardRearZ: -3.5,
        },
        { hullMat, darkMat, metalMat },
      );
      this.tracks.push(...t90Tracks.tracks);
      this.wheels.push(...t90Tracks.wheels);

      // Welded angular T-90M turret
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 1.66, 0.08);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;
      add(new THREE.CylinderGeometry(1.4, 1.45, 0.07, 20), darkMat, 0, 0.035, -0.04, tg);

      const t90Turret = new THREE.Mesh(
        prism(
          [
            [-2.5, 0.12],
            [-1.15, 0.07],
            [1.06, 0.07],
            [1.44, 0.52],
            [1.02, 0.98],
            [-2.05, 1.02],
            [-2.62, 0.62],
          ],
          2.95,
        ),
        hullMat,
      );
      tg.add(t90Turret);

      // Relikt wedge pods on turret cheeks + side ERA panels strictly clear of ±1.475 body
      const wedgeGeo = prism(
        [
          [-0.52, 0.06],
          [0.8, 0.34],
          [-0.42, 0.68],
        ],
        0.84,
      );
      for (const sx of [-1, 1]) {
        const outer = new THREE.Mesh(wedgeGeo, hullMat);
        outer.position.set(sx * 0.95, 0.1, 1.18);
        outer.rotation.y = -sx * 0.36;
        tg.add(outer);
        const inner = add(new THREE.BoxGeometry(0.46, 0.44, 0.44), hullMat, sx * 0.58, 0.44, 1.5, tg);
        inner.rotation.y = -sx * 0.22;
        // Side turret Relikt row & smoke launchers
        add(new THREE.BoxGeometry(0.14, 0.42, 1.2), hullMat, sx * 1.55, 0.4, 0.02, tg);
        const smoke = add(new THREE.BoxGeometry(0.2, 0.24, 0.42), darkMat, sx * 1.6, 0.48, -0.74, tg);
        smoke.rotation.y = sx * 0.25;
      }

      // Roof Relikt tiles cleanly atop sloped roof
      for (const rx of [-0.52, 0, 0.52]) {
        add(new THREE.BoxGeometry(0.42, 0.08, 0.4), hullMat, rx, 1.03, 0.5, tg);
      }

      // Sosna-U sight, commander cupola with Kord, hatches & antenna
      add(new THREE.BoxGeometry(0.38, 0.32, 0.46), darkMat, 0.56, 0.98, 0.86, tg);
      add(new THREE.CylinderGeometry(0.36, 0.4, 0.22, 12), hullMat, -0.52, 0.98, -0.36, tg);
      add(new THREE.CylinderGeometry(0.28, 0.32, 0.14, 12), hullMat, 0.5, 0.94, -0.32, tg);
      add(new THREE.BoxGeometry(0.08, 0.08, 0.98), metalMat, -0.52, 1.16, 0.02, tg);
      add(new THREE.CylinderGeometry(0.025, 0.025, 3.0, 4), metalMat, 0.95, 1.9, -1.5, tg);
      // Gun mantlet & characteristic rear turret stowage box with separated hinged lid
      add(new THREE.BoxGeometry(0.84, 0.56, 0.5), hullMat, 0, 0.44, 1.58, tg);
      add(new THREE.BoxGeometry(2.0, 0.52, 0.6), darkMat, 0, 0.44, -2.3, tg);
      add(new THREE.BoxGeometry(2.08, 0.06, 0.64), hullMat, 0, 0.74, -2.3, tg);

      // Long 125mm 2A46M-5 smoothbore with segmented thermal shroud & evacuator
      this.gunPivot = new THREE.Group();
      this.gunPivot.position.set(0, 0.44, 1.7);
      tg.add(this.gunPivot);
      this.barrelGroup = new THREE.Group();
      this.gunPivot.add(this.barrelGroup);

      const barrelGeo = new THREE.CylinderGeometry(0.098, 0.118, 5.3, 12);
      barrelGeo.rotateX(Math.PI / 2);
      add(barrelGeo, hullMat, 0, 0, 2.7, this.barrelGroup);

      const sleeve = new THREE.CylinderGeometry(0.165, 0.165, 1.1, 12);
      sleeve.rotateX(Math.PI / 2);
      add(sleeve, darkMat, 0, 0, 0.54, this.barrelGroup);

      const shroud2 = new THREE.CylinderGeometry(0.148, 0.148, 1.35, 12);
      shroud2.rotateX(Math.PI / 2);
      add(shroud2, darkMat, 0, 0, 1.92, this.barrelGroup);

      const evac = new THREE.CylinderGeometry(0.168, 0.168, 0.85, 12);
      evac.rotateX(Math.PI / 2);
      add(evac, metalMat, 0, 0, 2.98, this.barrelGroup);

      const shroud3 = new THREE.CylinderGeometry(0.136, 0.136, 1.5, 12);
      shroud3.rotateX(Math.PI / 2);
      add(shroud3, darkMat, 0, 0, 4.24, this.barrelGroup);

      const mtip = new THREE.CylinderGeometry(0.122, 0.108, 0.24, 12);
      mtip.rotateX(Math.PI / 2);
      add(mtip, metalMat, 0, 0, 5.28, this.barrelGroup);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), metalMat, 0, 0.15, 5.28, this.barrelGroup);

      // Coaxial 7.62mm PKTM
      const mgPipe = new THREE.CylinderGeometry(0.028, 0.034, 0.96, 8);
      mgPipe.rotateX(Math.PI / 2);
      add(mgPipe, metalMat, 0.34, 0.02, 0.64, this.gunPivot);

      this.mgMuzzle = new THREE.Object3D();
      this.mgMuzzle.position.set(0.34, 0.02, 1.18);
      this.gunPivot.add(this.mgMuzzle);

      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0, 5.5);
      this.barrelGroup.add(this.muzzle);

      this.sightObj = new THREE.Object3D();
      this.sightObj.position.set(0, 1.06, 1.0);
      tg.add(this.sightObj);
      this.binocObj = new THREE.Object3D();
      this.binocObj.position.set(0, 1.88, -0.38);
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

      // Side fenders + side trim rails strictly clear of track edge & below fender
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.56, 0.07, 6.5), hullMat, sx * 1.78, 1.15, 0.02);
        add(new THREE.BoxGeometry(0.06, 0.32, 5.5), hullMat, sx * 2.09, 0.94, -0.15);
      }

      // External side-rear fender fuel tanks (iconic T-55 feature, vulnerable weakspot)
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.32, 0.4, 1.9), fuelMat, sx * 1.62, 1.39, -2.18);
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

      // Continuous T-55 tracks + 5 road wheels (front gap) + idlers + toothed sprocket + mudguards
      const t55Tracks = buildTankTracks(
        this.hullGroup,
        {
          trackX: 1.78,
          trackWidth: 0.56,
          beltThickness: 0.055,
          wheelY: 0.49,
          wheelR: 0.41,
          wheelPositionsZ: [-2.52, -1.42, -0.32, 0.78, 2.32],
          idlerZ: 3.16,
          idlerY: 0.72,
          idlerR: 0.28,
          sprocketZ: -3.2,
          sprocketY: 0.69,
          sprocketR: 0.3,
          sprocketTeeth: 12,
          fenderY: 1.15,
          mudguardFrontZ: 3.48,
          mudguardRearZ: -3.4,
        },
        { hullMat, darkMat, metalMat },
      );
      this.tracks.push(...t55Tracks.tracks);
      this.wheels.push(...t55Tracks.wheels);

      // Cast hemispherical T-55 turret ("frying pan" dome silhouette)
      this.turretGroup = new THREE.Group();
      this.turretGroup.position.set(0, 1.69, 0.05);
      this.hullGroup.add(this.turretGroup);
      const tg = this.turretGroup;

      add(new THREE.CylinderGeometry(1.3, 1.34, 0.07, 18), darkMat, 0, 0.035, -0.05, tg);

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
      dome.position.set(0, 0.07, -0.08);
      tg.add(dome);
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
    const isT62M = this.spec.id === 't62m';
    const isT72B3 = this.spec.id === 't72b3';
    const isLeopard2A4 = this.spec.id === 'leopard2a4';
    const isM1A1 = this.spec.id === 'm1a1';
    const isZtz96a = this.spec.id === 'ztz96a';
    const isT90M = this.spec.id === 't90m';
    const L = isMaus
      ? 4.4
      : isLeopard2A4
        ? 3.55
        : isT62M
          ? 3.5
          : isT72B3
            ? 3.4
            : isM1A1
              ? 3.6
              : isZtz96a
                ? 3.5
                : isT90M
                  ? 3.45
                  : 3.2;
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
    const baseTurretY =
      this.spec.id === 'maus'
        ? 2.23
        : this.spec.id === 'm60a3'
          ? 1.91
          : this.spec.id === 'leopard2a4'
            ? 1.67
            : this.spec.id === 't72b3'
              ? 1.67
              : this.spec.id === 't62m'
                ? 1.67
                : this.spec.id === 'm1a1'
                  ? 1.71
                  : this.spec.id === 'ztz96a'
                    ? 1.6
                    : this.spec.id === 't90m'
                      ? 1.66
                      : 1.69;
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

    // Scale engine thrust proportionally for higher-top-speed tanks (e.g. T-72B3 at 60 km/h)
    const speedScale = Math.max(1, st.maxSpeed / (50 / 3.6));
    if (thr > 0) {
      if (v < -0.5) {
        a = 10;
        fric = true;
      } else {
        a = 4.6 * speedScale * speedScale * Math.max(0, 1 - Math.pow(Math.max(v, 0) / (st.maxSpeed * 1.07), 2));
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
    for (const t of this.tracks) {
      const vt = t.sign > 0 ? vl : vr;
      t.tex.offset.x += (vt * dt * t.tex.repeat.x) / t.perimeter;
    }
    for (const w of this.wheels) {
      w.mesh.rotation.x += ((w.side > 0 ? vl : vr) * dt) / w.radius;
    }

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
      gunDamage: this.stats.gunDamage,
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
