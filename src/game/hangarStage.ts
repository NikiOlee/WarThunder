import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GameWorld, WorldHit } from './world';

export interface HangarShowcase {
  scene: THREE.Scene;
  world: GameWorld;
  dispose: () => void;
}

function createConcretePadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#6c706b';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle concrete aggregate noise
  for (let i = 0; i < 3600; i++) {
    const x = (Math.imul(i * 73856093, 19349663) >>> 0) % 512;
    const y = (Math.imul(i * 83492791, 2971215073) >>> 0) % 512;
    const v = 96 + (i % 34);
    ctx.fillStyle = `rgb(${v},${v + 2},${v - 1})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Concrete slab expansion seams
  ctx.strokeStyle = 'rgba(42, 46, 44, 0.45)';
  ctx.lineWidth = 3;
  for (let k = 0; k <= 512; k += 128) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, k);
    ctx.lineTo(512, k);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 12, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHangarShowcase(renderer: THREE.WebGLRenderer, isSoftwareGl: boolean): HangarShowcase {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc5d5e3);
  scene.fog = new THREE.Fog(0xc5d5e3, 85, 320);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;

  // Sky dome with smooth horizon gradient
  const skyGeo = new THREE.SphereGeometry(380, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'varying vec3 vP; void main(){ float h = clamp(normalize(vP).y, 0.0, 1.0); vec3 col = mix(vec3(0.77, 0.84, 0.89), vec3(0.36, 0.57, 0.84), pow(max(h, 0.0001), 0.58)); gl_FragColor = vec4(col, 1.0); }',
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  // Balanced 3-point outdoor studio lighting
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.35);
  sun.position.set(16, 22, 14);
  if (!isSoftwareGl) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 75;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
  }
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xd9ecff, 0x5c624d, 0.92);
  scene.add(hemi);

  const rim = new THREE.DirectionalLight(0xbcd6ff, 0.55);
  rim.position.set(-14, 9, -16);
  scene.add(rim);

  // Flat surrounding field ground (level y = -0.045)
  const fieldMat = new THREE.MeshStandardMaterial({
    color: 0x5c6445,
    roughness: 0.96,
    metalness: 0.0,
  });
  const fieldMesh = new THREE.Mesh(new THREE.CircleGeometry(280, 48), fieldMat);
  fieldMesh.rotation.x = -Math.PI / 2;
  fieldMesh.position.y = -0.045;
  fieldMesh.receiveShadow = true;
  scene.add(fieldMesh);

  // Prepared flat concrete turntable pad flush at y = 0
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const padTex = createConcretePadTexture(maxAniso);
  const padMat = new THREE.MeshStandardMaterial({
    map: padTex,
    roughness: 0.88,
    metalness: 0.04,
  });
  const padMesh = new THREE.Mesh(new THREE.CylinderGeometry(10.6, 11.1, 0.09, 48), padMat);
  padMesh.position.y = -0.045; // top face sits cleanly at y = 0
  padMesh.receiveShadow = true;
  scene.add(padMesh);

  // Subtle tactical safety ring around the proving pad
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xc2983e,
    roughness: 0.72,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(9.65, 9.95, 64), ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.004;
  ringMesh.receiveShadow = true;
  scene.add(ringMesh);

  // Soft contact shadow directly under center showcase tank
  const shadowTex = createContactShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.42,
  });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 10.6), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.007;
  scene.add(shadowPlane);

  // Perimeter low-profile concrete bollards framing the proving pad
  const bollardGeo = new THREE.BoxGeometry(1.4, 0.42, 0.48);
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0x525654, roughness: 0.9, metalness: 0.05 });
  const bollardInst = new THREE.InstancedMesh(bollardGeo, bollardMat, 6);
  const mtx = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    pos.set(Math.sin(a) * 12.6, 0.165, Math.cos(a) * 12.6);
    quat.setFromAxisAngle(up, a);
    mtx.compose(pos, quat, scl);
    bollardInst.setMatrixAt(i, mtx);
  }
  bollardInst.castShadow = !isSoftwareGl;
  bollardInst.receiveShadow = true;
  bollardInst.computeBoundingSphere();
  scene.add(bollardInst);

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
    terrain: fieldMesh,
    createEnvironment: () => {},
    dispose: () => {},
    setGrass: () => {},
    fogColor: 0xc5d5e3,
    fogNear: 85,
    fogFar: 320,
    background: 0xc5d5e3,
    exposure: 1.05,
    grade: { sat: 1.04, tint: [1, 1, 1] },
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
