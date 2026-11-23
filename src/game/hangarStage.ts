import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GameWorld, WorldHit } from './world';

export interface HangarShowcase {
  scene: THREE.Scene;
  world: GameWorld;
  dispose: () => void;
}

const HANGAR_HALF_W = 15.0;
const HANGAR_HALF_L = 19.0;
const WALL_H = 9.0;
const RIDGE_H = 14.6;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finalizeTex(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAniso: number,
  isColor = true,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAniso));
  return tex;
}

function createDetailedFloorTexture(maxAniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 1024);

  // Base industrial cured concrete
  ctx.fillStyle = '#53585b';
  ctx.fillRect(0, 0, 1024, 1024);

  // Multi-scale concrete speckle & aggregate
  for (let i = 0; i < 16000; i++) {
    const x = (Math.imul(i * 73856093, 19349663) >>> 0) % 1024;
    const y = (Math.imul(i * 83492791, 2971215073) >>> 0) % 1024;
    const v = 68 + (i % 34);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
    ctx.fillRect(x, y, 2 + (i % 2), 2 + (i % 3));
  }

  // Subtle weathered dark oil & maintenance smudges
  for (let i = 0; i < 18; i++) {
    const sx = ((i * 211 + 87) % 860) + 82;
    const sy = ((i * 389 + 143) % 860) + 82;
    const r = 24 + (i % 5) * 14;
    const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, r);
    g.addColorStop(0, 'rgba(20, 22, 24, 0.28)');
    g.addColorStop(0.6, 'rgba(26, 28, 30, 0.12)');
    g.addColorStop(1, 'rgba(26, 28, 30, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Expansion slab grid joints
  ctx.strokeStyle = 'rgba(22, 25, 28, 0.72)';
  ctx.lineWidth = 4;
  for (let k = 0; k <= 1024; k += 128) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, k);
    ctx.lineTo(1024, k);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(130, 138, 142, 0.18)';
  ctx.lineWidth = 2;
  for (let k = 4; k < 1024; k += 128) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k, 1024);
    ctx.stroke();
  }

  // Central tank track wear corridors
  ctx.fillStyle = 'rgba(30, 32, 34, 0.22)';
  ctx.fillRect(365, 0, 56, 1024);
  ctx.fillRect(603, 0, 56, 1024);

  // Subtle bay border lane stripes
  ctx.fillStyle = 'rgba(214, 162, 38, 0.72)';
  ctx.fillRect(245, 0, 12, 1024);
  ctx.fillRect(767, 0, 12, 1024);

  return finalizeTex(c, 1, 1.25, maxAniso, true);
}

function createTurntableTexture(maxAniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#40464b';
  ctx.fillRect(0, 0, 512, 512);

  // Diamond / radial steel deck ribs
  ctx.strokeStyle = 'rgba(84, 92, 98, 0.45)';
  ctx.lineWidth = 2;
  for (let i = -512; i < 1024; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 512, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 512, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
  }

  // Concentric inspection seam rings
  ctx.strokeStyle = '#222629';
  ctx.lineWidth = 5;
  for (const r of [140, 215, 244]) {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial panel joints
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(ang) * 70, 256 + Math.sin(ang) * 70);
    ctx.lineTo(256 + Math.cos(ang) * 246, 256 + Math.sin(ang) * 246);
    ctx.stroke();
  }

  // Stencil mark
  ctx.fillStyle = 'rgba(232, 178, 46, 0.68)';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('BAY 04', 256, 444);

  return finalizeTex(c, 1, 1, maxAniso, true);
}

function createCorrugatedWallTexture(maxAniso: number, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#474f54';
  ctx.fillRect(0, 0, 512, 512);

  // Vertical corrugated sheet ribs
  for (let x = 0; x < 512; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, '#30363a');
    g.addColorStop(0.3, '#576066');
    g.addColorStop(0.55, '#636c73');
    g.addColorStop(0.85, '#3b4146');
    g.addColorStop(1, '#2b3034');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, 512);
  }

  // Horizontal panel seams & rivets
  ctx.fillStyle = 'rgba(20, 24, 26, 0.55)';
  for (let y = 0; y < 512; y += 128) {
    ctx.fillRect(0, y, 512, 4);
    for (let x = 8; x < 512; x += 32) {
      ctx.fillStyle = '#7b848b';
      ctx.fillRect(x, y + 6, 3, 3);
    }
    ctx.fillStyle = 'rgba(20, 24, 26, 0.55)';
  }

  // Subtle grime & lower splash wear
  const grime = ctx.createLinearGradient(0, 360, 0, 512);
  grime.addColorStop(0, 'rgba(22, 24, 25, 0)');
  grime.addColorStop(1, 'rgba(22, 24, 25, 0.42)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 360, 512, 152);

  return finalizeTex(c, repeatX, repeatY, maxAniso, true);
}

function createStructuralSteelTexture(maxAniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#2d353c';
  ctx.fillRect(0, 0, 256, 256);

  // Brushed steel grain + rivet plates
  for (let i = 0; i < 1600; i++) {
    const x = (Math.imul(i * 49979687, 32452843) >>> 0) % 256;
    const y = (Math.imul(i * 15485863, 67867967) >>> 0) % 256;
    const v = 38 + (i % 24);
    ctx.fillStyle = `rgb(${v},${v + 6},${v + 12})`;
    ctx.fillRect(x, y, 8, 1);
  }
  ctx.strokeStyle = 'rgba(15, 18, 22, 0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 248);
  ctx.fillStyle = '#535d66';
  for (const [rx, ry] of [
    [16, 16],
    [240, 16],
    [16, 240],
    [240, 240],
    [16, 128],
    [240, 128],
  ]) {
    ctx.beginPath();
    ctx.arc(rx, ry, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return finalizeTex(c, 1, 3, maxAniso, true);
}

function createHazardStripeTexture(maxAniso: number, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#d99b1e';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#1b1d1f';
  for (let i = -256; i < 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 32, 0);
    ctx.lineTo(i - 224, 256);
    ctx.lineTo(i - 256, 256);
    ctx.closePath();
    ctx.fill();
  }
  return finalizeTex(c, repeatX, repeatY, maxAniso, true);
}

function createGrateTexture(maxAniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#14171a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#4c545b';
  for (let y = 0; y < 256; y += 16) {
    ctx.fillRect(0, y, 256, 6);
  }
  for (let x = 0; x < 256; x += 48) {
    ctx.fillRect(x, 0, 7, 256);
  }
  return finalizeTex(c, 2, 10, maxAniso, true);
}

function createWoodCrateTexture(maxAniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#5f6743';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#383e26';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 240, 240);
  for (let y = 52; y < 230; y += 44) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(248, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#d6d0aa';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('120MM APFSDS', 28, 128);
  return finalizeTex(c, 1, 1, maxAniso, true);
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHangarShowcase(renderer: THREE.WebGLRenderer, isSoftwareGl: boolean): HangarShowcase {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b2126);
  scene.fog = new THREE.Fog(0x1b2126, 26, 78);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.65;

  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // Interior Hangar 3-point + bay overhead lighting (inside envelope so pitched roof does not block shadows)
  const sun = new THREE.DirectionalLight(0xffe9c7, 2.25);
  sun.position.set(6.5, 8.2, 7.5);
  if (!isSoftwareGl) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 36;
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 13;
    sun.shadow.camera.bottom = -13;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.025;
  }
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xd2e3f5, 0x3b3f43, 1.15);
  scene.add(hemi);

  const rim = new THREE.DirectionalLight(0xa3c4ec, 0.72);
  rim.position.set(-9, 6.8, -11);
  scene.add(rim);

  const bayLightA = new THREE.PointLight(0xffedd2, 26, 30, 1.35);
  bayLightA.position.set(0, 8.2, -6);
  const bayLightB = new THREE.PointLight(0xd8e8ff, 22, 30, 1.35);
  bayLightB.position.set(0, 8.2, 6.5);
  scene.add(bayLightA, bayLightB);

  // Shared materials & textures
  const floorTex = createDetailedFloorTexture(maxAniso);
  const turntableTex = createTurntableTexture(maxAniso);
  const wallTex = createCorrugatedWallTexture(maxAniso, 6, 2);
  const roofTex = createCorrugatedWallTexture(maxAniso, 6, 3);
  const steelTex = createStructuralSteelTexture(maxAniso);
  const hazardTex = createHazardStripeTexture(maxAniso, 2, 1);
  const hazardLongTex = createHazardStripeTexture(maxAniso, 8, 1);
  const grateTex = createGrateTexture(maxAniso);
  const crateTex = createWoodCrateTexture(maxAniso);

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness: 0.86,
    metalness: 0.06,
  });
  const turntableMat = new THREE.MeshStandardMaterial({
    map: turntableTex,
    roughness: 0.56,
    metalness: 0.42,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.68,
    metalness: 0.34,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: roofTex,
    color: 0x3e464d,
    roughness: 0.62,
    metalness: 0.42,
    side: THREE.DoubleSide,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    map: steelTex,
    roughness: 0.52,
    metalness: 0.58,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x242a30,
    roughness: 0.58,
    metalness: 0.52,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughness: 0.55,
    metalness: 0.18,
  });
  const hazardLongMat = new THREE.MeshStandardMaterial({
    map: hazardLongTex,
    roughness: 0.55,
    metalness: 0.18,
  });
  const concretePlinthMat = new THREE.MeshStandardMaterial({
    color: 0x676b6d,
    roughness: 0.92,
    metalness: 0.04,
  });
  const grateMat = new THREE.MeshStandardMaterial({
    map: grateTex,
    roughness: 0.48,
    metalness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const skylightMat = new THREE.MeshStandardMaterial({
    color: 0xaad0ef,
    emissive: 0x74a3ca,
    emissiveIntensity: 0.9,
    roughness: 0.25,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const lampGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfff8ea,
    emissive: 0xffe4b8,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const craneYellowMat = new THREE.MeshStandardMaterial({
    color: 0xd49b24,
    roughness: 0.48,
    metalness: 0.35,
  });

  // ── 1. Detailed Floor (main slab, turntable pad, drainage grates, shadow) ──
  const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(HANGAR_HALF_W * 2, 0.2, HANGAR_HALF_L * 2), floorMat);
  floorMesh.position.y = -0.1; // top flush at y = 0
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const turntableMesh = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.45, 0.032, 48), turntableMat);
  turntableMesh.position.y = 0.008; // top slightly raised above slab without floating
  turntableMesh.receiveShadow = true;
  scene.add(turntableMesh);

  const hazardRing = new THREE.Mesh(new THREE.RingGeometry(5.22, 5.62, 64), hazardLongMat);
  hazardRing.rotation.x = -Math.PI / 2;
  hazardRing.position.y = 0.012;
  hazardRing.receiveShadow = true;
  scene.add(hazardRing);

  // Twin recessed floor inspection grates flanking tank bay
  const grateGeo = new THREE.BoxGeometry(1.15, 0.024, 16.0);
  for (const gx of [-6.35, 6.35]) {
    const grate = new THREE.Mesh(grateGeo, grateMat);
    grate.position.set(gx, 0.004, 0);
    grate.receiveShadow = true;
    scene.add(grate);
  }

  // Contact shadow directly under showcase tank
  const shadowTex = createContactShadowTexture();
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 10.2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.56 }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.026;
  scene.add(shadowPlane);

  // ── 2. Corrugated Side Walls, Gable Triangular Ends & Giant Hangar Doors ──
  const sideWallGeo = new THREE.BoxGeometry(0.32, WALL_H, HANGAR_HALF_L * 2);
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(sideWallGeo, wallMat);
    wall.position.set(sx * HANGAR_HALF_W, WALL_H * 0.5, 0);
    wall.receiveShadow = true;
    scene.add(wall);

    // Lower concrete kick wall plinth along side walls
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.65, HANGAR_HALF_L * 2), concretePlinthMat);
    curb.position.set(sx * (HANGAR_HALF_W - 0.15), 0.325, 0);
    curb.receiveShadow = true;
    scene.add(curb);
  }

  // End walls & triangular pitched gable peaks at z = ±19
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-HANGAR_HALF_W - 0.2, WALL_H - 0.05);
  gableShape.lineTo(0, RIDGE_H + 0.05);
  gableShape.lineTo(HANGAR_HALF_W + 0.2, WALL_H - 0.05);
  gableShape.closePath();
  const gableGeo = new THREE.ShapeGeometry(gableShape);
  // Normalize UVs on triangular gable wall
  const gPos = gableGeo.attributes.position;
  const gUv = gableGeo.attributes.uv;
  for (let i = 0; i < gPos.count; i++) {
    gUv.setXY(i, (gPos.getX(i) + HANGAR_HALF_W) / 10, (gPos.getY(i) - WALL_H) / 5);
  }

  const endSideWallGeo = new THREE.BoxGeometry(7.5, WALL_H, 0.35);
  const doorHeaderGeo = new THREE.BoxGeometry(15.2, 2.2, 0.45);
  const doorPanelGeo = new THREE.BoxGeometry(7.45, 6.8, 0.3);
  const doorMat = new THREE.MeshStandardMaterial({
    map: createCorrugatedWallTexture(maxAniso, 2, 2),
    color: 0x3b4248,
    roughness: 0.65,
    metalness: 0.45,
  });

  for (const sz of [-1, 1]) {
    const endZ = sz * HANGAR_HALF_L;

    // Triangular roof gable peak closing off roof triangle
    const gable = new THREE.Mesh(gableGeo, wallMat.clone());
    gable.material.side = THREE.DoubleSide;
    gable.position.set(0, 0, endZ - sz * 0.08);
    scene.add(gable);

    // Flanking lower wall piers around the huge armored hangar doors
    for (const sx of [-1, 1]) {
      const pier = new THREE.Mesh(endSideWallGeo, wallMat);
      pier.position.set(sx * 11.25, WALL_H * 0.5, endZ);
      pier.receiveShadow = true;
      scene.add(pier);
    }

    // Overhead door lintel beam & giant sliding armored doors
    const lintel = new THREE.Mesh(doorHeaderGeo, steelMat);
    lintel.position.set(0, WALL_H - 1.1, endZ);
    scene.add(lintel);

    const doorCautionBar = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.38, 0.52), hazardLongMat);
    doorCautionBar.position.set(0, 6.82, endZ - sz * 0.04);
    scene.add(doorCautionBar);

    for (const dx of [-3.78, 3.78]) {
      const doorLeaf = new THREE.Mesh(doorPanelGeo, doorMat);
      doorLeaf.position.set(dx, 3.4, endZ - sz * 0.05);
      doorLeaf.receiveShadow = true;
      scene.add(doorLeaf);

      // Vertical reinforcement locking bars on doors
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6.6, 0.14), darkSteelMat);
      vBar.position.set(dx + (dx < 0 ? 3.55 : -3.55), 3.35, endZ - sz * 0.22);
      scene.add(vBar);
    }
  }

  // ── 3. Triangular Pitched Roof (треугольная крыша) & Skylights ──
  const roofRise = RIDGE_H - WALL_H;
  const roofHalfSpan = HANGAR_HALF_W + 0.35;
  const roofSlopeLen = Math.hypot(roofHalfSpan, roofRise);
  const roofAngle = Math.atan2(roofRise, roofHalfSpan);
  const roofPanelGeo = new THREE.PlaneGeometry(roofSlopeLen, HANGAR_HALF_L * 2);

  for (const sx of [-1, 1]) {
    const roofPanel = new THREE.Mesh(roofPanelGeo, roofMat);
    roofPanel.position.set(sx * (roofHalfSpan * 0.5), WALL_H + roofRise * 0.5, 0);
    roofPanel.rotation.x = Math.PI / 2;
    roofPanel.rotation.y = sx * roofAngle;
    scene.add(roofPanel);

    // Translucent roof skylight strips illuminating the trusses
    for (const sz of [-9, 0, 9]) {
      const skylight = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 4.4), skylightMat);
      const frac = 0.42;
      skylight.position.set(sx * (roofHalfSpan * frac), WALL_H + roofRise * (1 - frac) - 0.04, sz);
      skylight.rotation.z = -sx * roofAngle;
      scene.add(skylight);
    }
  }

  // ── 4. Structural Steel Columns, Beams & Triangular Roof Trusses (балки и фермы) ──
  const bayZs = [-15, -9, -3, 3, 9, 15];
  const colFootGeo = new THREE.BoxGeometry(0.95, 0.45, 0.95);
  const colHazardGeo = new THREE.BoxGeometry(0.72, 0.55, 0.72);
  const colShaftGeo = new THREE.BoxGeometry(0.56, WALL_H - 0.4, 0.56);
  const lowerChordGeo = new THREE.BoxGeometry(HANGAR_HALF_W * 2 - 0.8, 0.36, 0.38);
  const trussChordSpan = HANGAR_HALF_W - 0.5;
  const trussSlopeLen = Math.hypot(trussChordSpan, RIDGE_H - 0.3 - WALL_H);
  const trussSlopeAng = Math.atan2(RIDGE_H - 0.3 - WALL_H, trussChordSpan);
  const rafterGeo = new THREE.BoxGeometry(trussSlopeLen, 0.32, 0.34);

  const helperA = new THREE.Vector3();
  const helperB = new THREE.Vector3();
  const helperDir = new THREE.Vector3();
  const yUp = new THREE.Vector3(0, 1, 0);

  function addSteelStrut(ax: number, ay: number, az: number, bx: number, by: number, bz: number, thickness: number, mat = steelMat) {
    helperA.set(ax, ay, az);
    helperB.set(bx, by, bz);
    helperDir.subVectors(helperB, helperA);
    const len = helperDir.length();
    if (len < 0.05) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, len, thickness), mat);
    mesh.position.copy(helperA).addScaledVector(helperDir, 0.5);
    mesh.quaternion.setFromUnitVectors(yUp, helperDir.normalize());
    scene.add(mesh);
  }

  for (const bz of bayZs) {
    for (const sx of [-1, 1]) {
      const cx = sx * 14.25;
      const footing = new THREE.Mesh(colFootGeo, concretePlinthMat);
      footing.position.set(cx, 0.225, bz);
      footing.receiveShadow = true;
      scene.add(footing);

      const band = new THREE.Mesh(colHazardGeo, hazardMat);
      band.position.set(cx, 0.725, bz);
      scene.add(band);

      const col = new THREE.Mesh(colShaftGeo, steelMat);
      col.position.set(cx, WALL_H * 0.5 + 0.2, bz);
      col.castShadow = !isSoftwareGl;
      col.receiveShadow = true;
      scene.add(col);

      // Diagonal corner knee-brace between wall column and truss chord
      addSteelStrut(cx - sx * 0.2, 6.9, bz, cx - sx * 2.1, 8.65, bz, 0.22);

      // Upper pitched roof truss rafters meeting at ridge
      const rafter = new THREE.Mesh(rafterGeo, steelMat);
      rafter.position.set(sx * (trussChordSpan * 0.5), WALL_H - 0.1 + (RIDGE_H - 0.3 - WALL_H) * 0.5, bz);
      rafter.rotation.z = -sx * trussSlopeAng;
      scene.add(rafter);

      // Queen posts & diagonal roof truss web struts
      addSteelStrut(sx * 7.2, 8.65, bz, sx * 7.2, 11.45, bz, 0.18);
      addSteelStrut(sx * 3.6, 8.65, bz, sx * 3.6, 12.85, bz, 0.16);
      addSteelStrut(sx * 7.2, 8.65, bz, 0, 14.1, bz, 0.16);
      addSteelStrut(sx * 11.0, 8.65, bz, sx * 7.2, 11.45, bz, 0.16);
    }

    // Horizontal lower truss chord beam spanning entire bay width
    const chord = new THREE.Mesh(lowerChordGeo, steelMat);
    chord.position.set(0, 8.65, bz);
    scene.add(chord);

    // Center king post rising from truss chord to roof peak
    addSteelStrut(0, 8.65, bz, 0, RIDGE_H - 0.35, bz, 0.24);
  }

  // Longitudinal crane runway beams, eaves beams, roof purlins, and ridge spine beam
  const longBeamGeo = new THREE.BoxGeometry(0.36, 0.44, HANGAR_HALF_L * 2 - 0.4);
  const purlinGeo = new THREE.BoxGeometry(0.18, 0.22, HANGAR_HALF_L * 2 - 0.4);
  const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, HANGAR_HALF_L * 2 - 0.4), steelMat);
  ridgeBeam.position.set(0, RIDGE_H - 0.42, 0);
  scene.add(ridgeBeam);

  for (const sx of [-1, 1]) {
    const runway = new THREE.Mesh(longBeamGeo, craneYellowMat);
    runway.position.set(sx * 13.45, 7.25, 0);
    scene.add(runway);

    const eaveBeam = new THREE.Mesh(longBeamGeo, steelMat);
    eaveBeam.position.set(sx * 14.2, WALL_H - 0.15, 0);
    scene.add(eaveBeam);

    for (const px of [4.8, 9.6]) {
      const frac = px / roofHalfSpan;
      const purlin = new THREE.Mesh(purlinGeo, darkSteelMat);
      purlin.position.set(sx * px, WALL_H + roofRise * (1 - frac) - 0.18, 0);
      purlin.rotation.z = -sx * roofAngle;
      scene.add(purlin);
    }
  }

  // Overhead Industrial Bridge Crane (yellow girders + trolley + chain & hook)
  const craneZ = -5.2;
  for (const offset of [-0.55, 0.55]) {
    const girder = new THREE.Mesh(new THREE.BoxGeometry(27.0, 0.62, 0.36), craneYellowMat);
    girder.position.set(0, 7.82, craneZ + offset);
    scene.add(girder);
  }
  for (const sx of [-1, 1]) {
    const truck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.52, 2.2), hazardMat);
    truck.position.set(sx * 13.45, 7.62, craneZ);
    scene.add(truck);
  }
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.64, 1.55), darkSteelMat);
  trolley.position.set(2.2, 8.05, craneZ);
  scene.add(trolley);
  addSteelStrut(2.2, 7.75, craneZ, 2.2, 5.4, craneZ, 0.08, darkSteelMat);
  const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.32), hazardMat);
  hookBlock.position.set(2.2, 5.25, craneZ);
  scene.add(hookBlock);

  // ── 5. Safety Barrier Poles (палки-ограждения), Tripod Worklights & Pipes ──
  const poleGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.08, 10);
  const poleCapGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.24, 10);
  const poleBaseGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.05, 10);
  const barGeo = new THREE.CylinderGeometry(0.032, 0.032, 4.0, 8);
  barGeo.rotateX(Math.PI / 2);

  for (const sx of [-1, 1]) {
    const px = sx * 7.6;
    const poleZs = [-6.0, -2.0, 2.0, 6.0];
    for (let i = 0; i < poleZs.length; i++) {
      const pz = poleZs[i];
      const base = new THREE.Mesh(poleBaseGeo, darkSteelMat);
      base.position.set(px, 0.025, pz);
      scene.add(base);

      const post = new THREE.Mesh(poleGeo, craneYellowMat);
      post.position.set(px, 0.54, pz);
      post.castShadow = !isSoftwareGl;
      scene.add(post);

      const cap = new THREE.Mesh(poleCapGeo, darkSteelMat);
      cap.position.set(px, 0.92, pz);
      scene.add(cap);

      if (i < poleZs.length - 1) {
        const midZ = (pz + poleZs[i + 1]) * 0.5;
        for (const railY of [0.56, 0.98]) {
          const rail = new THREE.Mesh(barGeo, railY > 0.7 ? hazardLongMat : craneYellowMat);
          rail.position.set(px, railY, midZ);
          rail.castShadow = !isSoftwareGl;
          scene.add(rail);
        }
      }
    }
  }

  // Vertical industrial utility pipes along side walls & hanging lamp drop poles
  const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, WALL_H - 0.6, 8);
  for (const sx of [-1, 1]) {
    for (const pz of [-12, 0, 12]) {
      const pipe = new THREE.Mesh(pipeGeo, darkSteelMat);
      pipe.position.set(sx * 14.62, WALL_H * 0.5 - 0.1, pz);
      scene.add(pipe);
    }
  }

  // Hanging high-bay lamps suspended on vertical steel poles/rods
  const dropRodGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6);
  const lampHoodGeo = new THREE.BoxGeometry(1.5, 0.18, 0.62);
  const lampDiffGeo = new THREE.BoxGeometry(1.36, 0.06, 0.5);
  for (const lx of [-5.4, 5.4]) {
    for (const lz of [-11, -3.5, 3.5, 11]) {
      const rod = new THREE.Mesh(dropRodGeo, darkSteelMat);
      rod.position.set(lx, 8.05, lz);
      scene.add(rod);

      const hood = new THREE.Mesh(lampHoodGeo, darkSteelMat);
      hood.position.set(lx, 7.36, lz);
      scene.add(hood);

      const diff = new THREE.Mesh(lampDiffGeo, lampGlowMat);
      diff.position.set(lx, 7.26, lz);
      scene.add(diff);
    }
  }

  // Portable tripod floodlight poles (палки-штативы) near maintenance zones
  for (const [tx, tz, rotY] of [
    [-11.2, 8.2, -0.75],
    [11.2, -8.2, 2.38],
  ] as const) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.5, 8), craneYellowMat);
    mast.position.set(tx, 1.25, tz);
    mast.castShadow = !isSoftwareGl;
    scene.add(mast);

    for (let leg = 0; leg < 3; leg++) {
      const a = (leg / 3) * Math.PI * 2;
      addSteelStrut(tx, 0.72, tz, tx + Math.cos(a) * 0.52, 0, tz + Math.sin(a) * 0.52, 0.045, darkSteelMat);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.34, 0.22), darkSteelMat);
    head.position.set(tx, 2.55, tz);
    head.rotation.y = rotY;
    scene.add(head);

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.24, 0.04), lampGlowMat);
    lens.position.set(tx + Math.sin(rotY) * 0.11, 2.55, tz + Math.cos(rotY) * 0.11);
    lens.rotation.y = rotY;
    scene.add(lens);
  }

  // ── 6. Perimeter Hangar Equipment (crates, workbenches, wheel racks, gas cylinders) ──
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85, metalness: 0.05 });
  const redToolMat = new THREE.MeshStandardMaterial({ color: 0x9b2c25, roughness: 0.45, metalness: 0.45 });
  const cylBlueMat = new THREE.MeshStandardMaterial({ color: 0x245d9c, roughness: 0.4, metalness: 0.4 });
  const cylMaroonMat = new THREE.MeshStandardMaterial({ color: 0x7b2525, roughness: 0.4, metalness: 0.4 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x1d1f21, roughness: 0.9, metalness: 0.05 });

  // Ammo crates stacked along left bay
  const cratePositions: Array<[number, number, number, number, number, number]> = [
    [-12.2, 0.45, -12.0, 1.4, 0.9, 1.0],
    [-12.1, 0.45, -10.7, 1.3, 0.9, 1.0],
    [-12.15, 1.35, -11.4, 1.2, 0.9, 0.95],
    [12.3, 0.45, 11.8, 1.4, 0.9, 1.05],
    [12.3, 0.45, 10.4, 1.35, 0.9, 1.0],
  ];
  for (const [cx, cy, cz, cw, ch, cd] of cratePositions) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), crateMat);
    crate.position.set(cx, cy, cz);
    crate.receiveShadow = true;
    crate.castShadow = !isSoftwareGl;
    scene.add(crate);
  }

  // Mechanic workbenches + red tool cabinets along right wall
  for (const wz of [-4.2, 4.2]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 3.2), darkSteelMat);
    bench.position.set(13.2, 0.475, wz);
    bench.receiveShadow = true;
    scene.add(bench);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.25, 1.35), redToolMat);
    chest.position.set(13.3, 0.625, wz + 2.5);
    chest.castShadow = !isSoftwareGl;
    scene.add(chest);
  }

  // Spare tank road-wheel rack on left side
  const rackFrame = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.35, 3.4), steelMat);
  rackFrame.position.set(-13.35, 0.675, 2.5);
  scene.add(rackFrame);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.24, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  for (let w = 0; w < 4; w++) {
    const wheel = new THREE.Mesh(wheelGeo, rubberMat);
    wheel.position.set(-12.78, 0.42, 1.2 + w * 0.86);
    wheel.rotation.z = 0.2;
    scene.add(wheel);
  }

  // Welding gas cylinders near front-left pillar
  const cylGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.45, 12);
  for (const [cx, cz, mat] of [
    [-12.8, -5.8, cylBlueMat],
    [-12.4, -5.8, cylMaroonMat],
    [12.7, -9.8, cylBlueMat],
  ] as const) {
    const cyl = new THREE.Mesh(cylGeo, mat);
    cyl.position.set(cx, 0.725, cz);
    cyl.castShadow = !isSoftwareGl;
    scene.add(cyl);
  }

  // Flat-world adapter so Tank sits strictly level at y = 0
  const world: GameWorld = {
    id: 'hangar_pad',
    name: 'Hangar',
    size: 400,
    limit: 190,
    heightAt: () => 0,
    normalAt: (_x: number, _z: number, out = new THREE.Vector3()) => out.set(0, 1, 0),
    obstacles: [],
    segmentHit: () => null as WorldHit | null,
    raycast: () => null as WorldHit | null,
    nearby: () => [],
    update: () => {},
    sun,
    terrain: floorMesh,
    createEnvironment: () => {},
    dispose: () => {},
    setGrass: () => {},
    fogColor: 0x1b2126,
    fogNear: 26,
    fogFar: 78,
    background: 0x1b2126,
    exposure: 1.12,
    grade: { sat: 1.02, tint: [1, 1, 1] },
    spawnPlayer: { x: 0, z: 0, heading: 0 },
    spawnA: () => ({ x: 0, z: 0, heading: 0 }),
    spawnB: () => ({ x: 0, z: 0, heading: 0 }),
    objectives: [],
    objJitter: 0,
  };

  function dispose(): void {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m) {
          const sm = m as THREE.MeshStandardMaterial;
          sm.map?.dispose();
          m.dispose();
        }
      }
    });
    if (sun.shadow.map) sun.shadow.map.dispose();
    envTex.dispose();
  }

  return { scene, world, dispose };
}
