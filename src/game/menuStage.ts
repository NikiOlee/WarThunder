import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { OrbitBoxCollider } from './menuOrbit';
import { fbm, hash2, mulberry32, smooth, type GameWorld, type WorldHit } from './world';

export interface MenuShowcase {
  scene: THREE.Scene;
  world: GameWorld;
  cameraColliders: OrbitBoxCollider[];
  heightAt: (x: number, z: number) => number;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

const MENU_TERRAIN_SIZE = 260;

/**
 * Deterministic heightfield for the sunset forest clearing & hillside field camp.
 * Central clearing pad (r <= 8.5m) is flat at y=0 so the showcase tank sits cleanly level,
 * transitioning smoothly into rolling hills and framing ridges beyond radius 14m.
 */
export function menuHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const clearBlend = smooth(7.5, 19.5, r);

  // Rolling hills + scenic ridge amphitheater behind/flanking the clearing
  let h = (fbm(x * 0.022 + 4.1, z * 0.022 + 9.3, 4) - 0.44) * 9.5;
  h += (fbm(x * 0.06 + 1.7, z * 0.06 + 5.2, 2) - 0.5) * 1.6;

  // Higher scenic ridge backdrop on -Z / flanks so skyline has natural silhouettes
  const backRidge = smooth(24, 95, r) * (6.5 + 3.2 * Math.max(0, -z / Math.max(1, r)));
  h += backRidge;

  // Flatten the dirt approach road heading along +Z / slight curve toward (0,0)
  const roadX = Math.sin(z * 0.045) * 3.5;
  const onRoad = z > 4 ? 1 - smooth(2.6, 7.2, Math.abs(x - roadX)) : 0;
  h *= 1 - onRoad * 0.58;

  return h * clearBlend;
}

export function menuNormalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = 0.75;
  out.set(menuHeightAt(x - e, z) - menuHeightAt(x + e, z), 2 * e, menuHeightAt(x, z - e) - menuHeightAt(x, z + e));
  return out.normalize();
}

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

function createGroundDetailTexture(maxAniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#c8c6bd';
  ctx.fillRect(0, 0, 512, 512);
  const rand = mulberry32(4109);
  for (let i = 0; i < 14000; i++) {
    const v = 152 + Math.floor(rand() * 88);
    ctx.fillStyle = `rgba(${v},${v - 2},${v - 8},0.46)`;
    ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 3, 1 + rand() * 3);
  }
  for (let i = 0; i < 65; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const rad = 6 + rand() * 14;
    const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
    g.addColorStop(0, 'rgba(96, 88, 72, 0.24)');
    g.addColorStop(1, 'rgba(96, 88, 72, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return finalizeTex(c, 42, 42, maxAniso, true);
}

function createCrateTexture(maxAniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#5a603e';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#333822';
  ctx.lineWidth = 7;
  ctx.strokeRect(8, 8, 240, 240);
  for (let y = 52; y < 230; y += 44) {
    ctx.beginPath();
    ctx.moveTo(8, y);
    ctx.lineTo(248, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#ded5ad';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('120MM APFSDS', 28, 128);
  return finalizeTex(c, 1, 1, maxAniso, true);
}

function createCamoCanvasTexture(maxAniso: number): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#485239';
  ctx.fillRect(0, 0, 256, 256);
  const rand = mulberry32(8291);
  const patches = ['#363e2a', '#5b6142', '#6b5b43', '#2d3324'];
  for (let i = 0; i < 42; i++) {
    ctx.fillStyle = patches[i % patches.length];
    ctx.beginPath();
    ctx.ellipse(rand() * 256, rand() * 256, 18 + rand() * 34, 10 + rand() * 20, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(20, 24, 16, 0.25)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  return finalizeTex(c, 2, 2, maxAniso, true);
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const grad = ctx.createRadialGradient(64, 64, 16, 64, 64, 62);
  grad.addColorStop(0, 'rgba(8, 6, 4, 0.72)');
  grad.addColorStop(0.65, 'rgba(8, 6, 4, 0.34)');
  grad.addColorStop(1, 'rgba(8, 6, 4, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSunsetSkyDome(sunDir: THREE.Vector3): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
  const skyGeo = new THREE.SphereGeometry(210, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 d = normalize(vWorldPos);
        float h = clamp(d.y, -0.15, 1.0);
        vec3 groundGlow = vec3(0.24, 0.16, 0.14);
        vec3 horizon = vec3(0.86, 0.45, 0.24);
        vec3 midSky = vec3(0.45, 0.29, 0.38);
        vec3 zenith = vec3(0.10, 0.14, 0.26);

        vec3 col = mix(groundGlow, horizon, smoothstep(-0.12, 0.04, h));
        col = mix(col, midSky, smoothstep(0.03, 0.30, h));
        col = mix(col, zenith, smoothstep(0.26, 0.85, h));

        float sunDot = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.56, 0.22) * pow(sunDot, 6.0) * 0.44;
        col += vec3(1.0, 0.78, 0.46) * pow(sunDot, 48.0) * 0.35;
        col += vec3(1.0, 0.90, 0.68) * smoothstep(0.9972, 0.9996, sunDot) * 0.68;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(skyGeo, mat);
  return { mesh, mat };
}

export function createMenuShowcase(renderer: THREE.WebGLRenderer, isSoftwareGl: boolean): MenuShowcase {
  const scene = new THREE.Scene();
  const fogHex = 0x775142;
  scene.background = new THREE.Color(fogHex);
  scene.fog = new THREE.Fog(fogHex, 42, 165);

  const sunDir = new THREE.Vector3(-0.66, 0.23, -0.71).normalize();

  // Golden-hour PMREM environment for crisp metallic tank reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.62;

  const { mesh: skyDome } = createSunsetSkyDome(sunDir);
  scene.add(skyDome);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // Warm sunset key light + cool twilight hemisphere fill + gentle rim backlight
  const sun = new THREE.DirectionalLight(0xffb46e, 2.55);
  sun.position.copy(sunDir).multiplyScalar(58);
  if (!isSoftwareGl) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 6;
    sun.shadow.camera.far = 115;
    sun.shadow.camera.left = -26;
    sun.shadow.camera.right = 26;
    sun.shadow.camera.top = 26;
    sun.shadow.camera.bottom = -26;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.025;
  }
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0x7c96c8, 0x342419, 0.72);
  scene.add(hemi);

  const rim = new THREE.DirectionalLight(0x98b5e2, 0.62);
  rim.position.set(22, 12, 24);
  scene.add(rim);

  // Warm campfire point light + canopy worklamp point light (<= 2 total PointLights)
  const fireLight = new THREE.PointLight(0xff8c38, 12, 15, 1.5);
  const campLight = new THREE.PointLight(0xffd796, 8, 14, 1.5);
  scene.add(fireLight, campLight);

  const cameraColliders: OrbitBoxCollider[] = [];
  const registerBoxCollider = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) => {
    cameraColliders.push({ minX, minY, minZ, maxX, maxY, maxZ });
  };

  // ── 1. Sculpted Sunset Hillside Clearing Terrain ──
  const groundTex = createGroundDetailTexture(maxAniso);
  const SEG = 112;
  const tGeo = new THREE.PlaneGeometry(MENU_TERRAIN_SIZE, MENU_TERRAIN_SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  {
    const pos = tGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const grassDeep = new THREE.Color(0x3a5226);
    const grassWarm = new THREE.Color(0x5e6e30);
    const dryMeadow = new THREE.Color(0x7c6e42);
    const dirtPad = new THREE.Color(0x6d573d);
    const gravelPad = new THREE.Color(0x5b554b);
    const stoneCol = new THREE.Color(0x666059);
    const c = new THREE.Color();
    const n = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = menuHeightAt(x, z);
      pos.setY(i, h);
      menuNormalAt(x, z, n);
      const slope = 1 - n.y;
      const dist = Math.hypot(x, z);

      c.copy(grassDeep).lerp(grassWarm, smooth(0, 8, h));
      c.lerp(dryMeadow, fbm(x * 0.05 + 17, z * 0.05 + 11, 3) * 0.58);
      c.lerp(stoneCol, smooth(0.18, 0.42, slope));

      // Compacted dirt & gravel tank pad around clearing center + winding track
      const padMask = 1 - smooth(4.5, 11.2, dist);
      c.lerp(dirtPad, padMask * 0.78);
      c.lerp(gravelPad, (1 - smooth(3.4, 6.4, dist)) * 0.52);

      if (z > 4) {
        const roadX = Math.sin(z * 0.045) * 3.5;
        const onRoad = 1 - smooth(1.9, 4.4, Math.abs(x - roadX));
        c.lerp(dirtPad, onRoad * 0.72);
      }

      const jitter = 0.92 + hash2(i, 31) * 0.16;
      col[i * 3] = c.r * jitter;
      col[i * 3 + 1] = c.g * jitter;
      col[i * 3 + 2] = c.b * jitter;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    tGeo.computeVertexNormals();
  }
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: groundTex,
    roughness: 0.94,
    metalness: 0.02,
  });
  const terrain = new THREE.Mesh(tGeo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Subtle recessed wheel/pad curb stones framing the central clearing (no Z-fighting)
  const contactShadowTex = createContactShadowTexture();
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 10.2),
    new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, depthWrite: false, opacity: 0.55 }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.025;
  scene.add(contactShadow);

  // Shared prop materials
  const rand = mulberry32(90421);
  const crateMat = new THREE.MeshStandardMaterial({ map: createCrateTexture(maxAniso), roughness: 0.86, metalness: 0.04 });
  const camoMat = new THREE.MeshStandardMaterial({
    map: createCamoCanvasTexture(maxAniso),
    roughness: 0.88,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c422c, roughness: 0.9, metalness: 0.02 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3b2b1d, roughness: 0.92, metalness: 0.02 });
  const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8f7e5b, roughness: 0.95, metalness: 0.02 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3b443e, roughness: 0.48, metalness: 0.62 });
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x45523a, roughness: 0.52, metalness: 0.42 });
  const drumRedMat = new THREE.MeshStandardMaterial({ color: 0x803025, roughness: 0.5, metalness: 0.38 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b655d, roughness: 0.93, flatShading: true });
  const mossRockMat = new THREE.MeshStandardMaterial({ color: 0x565b48, roughness: 0.92, flatShading: true });

  // ── 2. Composite Command Canopy Tent (left rear edge of clearing) ──
  {
    const tx = -9.6;
    const tz = -7.6;
    const ty = menuHeightAt(tx, tz);
    const tentGroup = new THREE.Group();
    tentGroup.position.set(tx, ty, tz);
    tentGroup.rotation.y = 0.42;

    const poleGeo = new THREE.CylinderGeometry(0.055, 0.065, 2.9, 8);
    for (const [px, pz] of [
      [-2.1, -1.6],
      [2.1, -1.6],
      [-2.1, 1.6],
      [2.1, 1.6],
    ] as const) {
      const pole = new THREE.Mesh(poleGeo, metalMat);
      pole.position.set(px, 1.4, pz);
      pole.castShadow = !isSoftwareGl;
      tentGroup.add(pole);
    }
    // Ridge pole + pitched canvas tarp slopes
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.6, 8), metalMat);
    ridge.rotation.z = Math.PI / 2;
    ridge.position.set(0, 3.35, 0);
    tentGroup.add(ridge);

    const tarpSlopeGeo = new THREE.BoxGeometry(4.6, 0.07, 2.05);
    for (const side of [-1, 1] as const) {
      const slope = new THREE.Mesh(tarpSlopeGeo, camoMat);
      slope.position.set(0, 2.98, side * 0.9);
      slope.rotation.x = side * 0.39;
      slope.castShadow = !isSoftwareGl;
      slope.receiveShadow = true;
      tentGroup.add(slope);
    }

    // Back canvas curtain + wooden floor pallet + table crate + lantern
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.5, 0.06), camoMat);
    backWall.position.set(0, 1.35, -1.6);
    tentGroup.add(backWall);

    const pallet = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 2.7), darkWoodMat);
    pallet.position.set(0, 0.08, 0);
    pallet.receiveShadow = true;
    tentGroup.add(pallet);

    const tableCrate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.95), crateMat);
    tableCrate.position.set(0.5, 0.61, -0.35);
    tableCrate.castShadow = !isSoftwareGl;
    tentGroup.add(tableCrate);

    const lanternBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.3, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe4a0, emissive: 0xffaa44, emissiveIntensity: 1.6, roughness: 0.25 }),
    );
    lanternBody.position.set(0.5, 1.22, -0.35);
    tentGroup.add(lanternBody);

    scene.add(tentGroup);
    campLight.position.set(tx + 0.4, ty + 2.2, tz + 0.3);

    registerBoxCollider(tx - 2.6, ty - 0.5, tz - 2.4, tx + 2.6, ty + 3.7, tz + 2.4);
  }

  // ── 3. Sandbag Revetment, Crates & Fuel Drums (right rear edge of clearing) ──
  {
    const bx = 9.4;
    const bz = -6.6;
    const by = menuHeightAt(bx, bz);
    const bunkerGroup = new THREE.Group();
    bunkerGroup.position.set(bx, by, bz);
    bunkerGroup.rotation.y = -0.58;

    const bagGeo = new THREE.BoxGeometry(0.92, 0.34, 0.48);
    for (let row = 0; row < 3; row++) {
      const count = 4 - (row % 2);
      for (let col = 0; col < count; col++) {
        const bag = new THREE.Mesh(bagGeo, sandbagMat);
        bag.position.set((col - (count - 1) * 0.5) * 0.95, 0.17 + row * 0.33, 0.95);
        bag.rotation.y = (rand() - 0.5) * 0.08;
        bag.castShadow = !isSoftwareGl;
        bag.receiveShadow = true;
        bunkerGroup.add(bag);
      }
    }

    // Ammo crates behind sandbags
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.95), crateMat);
    c1.position.set(-0.75, 0.425, -0.35);
    c1.castShadow = !isSoftwareGl;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.8, 0.9), crateMat);
    c2.position.set(0.65, 0.4, -0.45);
    c2.castShadow = !isSoftwareGl;
    const c3 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.72, 0.82), crateMat);
    c3.position.set(-0.1, 1.2, -0.4);
    c3.rotation.y = 0.22;
    c3.castShadow = !isSoftwareGl;
    bunkerGroup.add(c1, c2, c3);

    // Fuel drums with raised hoops
    const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.15, 14);
    const hoopGeo = new THREE.TorusGeometry(0.43, 0.03, 6, 16);
    hoopGeo.rotateX(Math.PI / 2);
    for (const [dx, dz, mat] of [
      [1.75, 0.15, drumRedMat],
      [1.95, -0.82, drumMat],
    ] as const) {
      const drum = new THREE.Mesh(drumGeo, mat);
      drum.position.set(dx, 0.575, dz);
      drum.castShadow = !isSoftwareGl;
      for (const hy of [-0.28, 0.28]) {
        const hoop = new THREE.Mesh(hoopGeo, metalMat);
        hoop.position.y = hy;
        drum.add(hoop);
      }
      bunkerGroup.add(drum);
    }

    scene.add(bunkerGroup);
    registerBoxCollider(bx - 2.6, by - 0.5, bz - 2.1, bx + 2.6, by + 2.2, bz + 2.1);
  }

  // ── 4. Campfire Ring & Field Timber Bench (front-left edge) ──
  const emberParticles: Array<{ mesh: THREE.Mesh; phase: number; baseX: number; baseZ: number }> = [];
  let fireBaseY = 0;
  {
    const fx = -7.6;
    const fz = 6.8;
    const fy = menuHeightAt(fx, fz);
    fireBaseY = fy;
    const fireGroup = new THREE.Group();
    fireGroup.position.set(fx, fy, fz);

    // Stone fire pit ring
    const stoneGeo = new THREE.DodecahedronGeometry(0.24, 0);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const stone = new THREE.Mesh(stoneGeo, rockMat);
      stone.position.set(Math.cos(a) * 0.72, 0.08, Math.sin(a) * 0.72);
      stone.scale.set(1.1, 0.68, 0.95);
      stone.rotation.y = a;
      fireGroup.add(stone);
    }

    // Crossed charred firewood logs
    const logGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.0, 7);
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(logGeo, darkWoodMat);
      log.position.set(0, 0.14, 0);
      log.rotation.z = Math.PI / 2 - 0.24;
      log.rotation.y = (i / 3) * Math.PI * 2;
      fireGroup.add(log);
    }

    // Glowing ember bed + flame core
    const emberDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.52, 0.08, 12),
      new THREE.MeshStandardMaterial({ color: 0x3b1506, emissive: 0xff5a12, emissiveIntensity: 2.0, roughness: 0.9 }),
    );
    emberDisc.position.y = 0.04;
    fireGroup.add(emberDisc);

    // Timber log bench nearby
    const benchLog = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 2.3, 10), woodMat);
    benchLog.rotation.z = Math.PI / 2;
    benchLog.rotation.y = 0.6;
    benchLog.position.set(-1.35, 0.24, 1.35);
    benchLog.castShadow = !isSoftwareGl;
    fireGroup.add(benchLog);

    // Rising glowing ember sparks
    const sparkGeo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffb24c });
    for (let i = 0; i < 8; i++) {
      const sp = new THREE.Mesh(sparkGeo, sparkMat);
      const ang = (i / 8) * Math.PI * 2;
      sp.position.set(fx + Math.cos(ang) * 0.22, fy + 0.35 + i * 0.18, fz + Math.sin(ang) * 0.22);
      scene.add(sp);
      emberParticles.push({ mesh: sp, phase: i * 0.75, baseX: sp.position.x, baseZ: sp.position.z });
    }

    scene.add(fireGroup);
    fireLight.position.set(fx, fy + 0.85, fz);
    registerBoxCollider(fx - 1.8, fy - 0.4, fz - 1.6, fx + 1.4, fy + 1.2, fz + 2.0);
  }

  // ── 5. Field Perimeter Wooden Fence & Direction Post (front-right road shoulder) ──
  {
    const sx = 9.2;
    const sz = 7.4;
    const sy = menuHeightAt(sx, sz);
    const postGroup = new THREE.Group();
    postGroup.position.set(sx, sy, sz);
    postGroup.rotation.y = -0.45;

    for (const fx of [-1.7, 0, 1.7]) {
      const fPost = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 1.35, 7), woodMat);
      fPost.position.set(fx, 0.65, 0);
      fPost.castShadow = !isSoftwareGl;
      postGroup.add(fPost);
    }
    for (const ry of [0.48, 0.96]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.09, 0.07), woodMat);
      rail.position.set(0, ry, 0);
      rail.castShadow = !isSoftwareGl;
      postGroup.add(rail);
    }
    scene.add(postGroup);
    registerBoxCollider(sx - 2.0, sy - 0.5, sz - 0.8, sx + 2.0, sy + 1.5, sz + 0.8);
  }

  // ── 6. Natural Granite & Moss Boulders Framing the Clearing ──
  {
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rPos = rockGeo.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const vx = rPos.getX(i);
      const vy = rPos.getY(i);
      const vz = rPos.getZ(i);
      const n = 0.78 + 0.36 * hash2(Math.round((vx + 5) * 19), Math.round((vz + 5) * 23));
      rPos.setXYZ(i, vx * n, vy * (vy > 0 ? n * 0.86 : 0.72), vz * n);
    }
    rockGeo.computeVertexNormals();

    const boulderSpots: Array<[number, number, number, number]> = [
      [-11.8, -0.5, 1.9, 1.25],
      [-12.6, 1.5, 1.15, 0.95],
      [11.8, 1.2, 2.05, 1.35],
      [13.4, -1.0, 1.2, 0.9],
      [3.8, -12.6, 1.8, 1.2],
      [-4.2, -13.4, 1.45, 1.05],
      [-17.0, -14.5, 2.8, 1.9],
      [18.2, -12.8, 2.6, 1.7],
      [15.4, 14.5, 2.4, 1.6],
      [-15.2, 13.8, 2.2, 1.5],
    ];

    for (const [rx, rz, rRad, rH] of boulderSpots) {
      const ry = menuHeightAt(rx, rz);
      const rock = new THREE.Mesh(rockGeo, rand() > 0.45 ? mossRockMat : rockMat);
      rock.position.set(rx, ry + rH * 0.25, rz);
      rock.scale.set(rRad, rH, rRad * (0.82 + rand() * 0.32));
      rock.rotation.y = rand() * Math.PI * 2;
      rock.castShadow = !isSoftwareGl;
      rock.receiveShadow = true;
      scene.add(rock);

      // Register camera collision box for all boulders within orbit range
      if (Math.hypot(rx, rz) < 23) {
        registerBoxCollider(rx - rRad * 1.05, ry - 1.0, rz - rRad * 1.05, rx + rRad * 1.05, ry + rH * 1.15, rz + rRad * 1.05);
      }
    }
  }

  // ── 7. Multi-Tiered Evergreen Pines (InstancedMesh > 20 trees + foreground trunk colliders) ──
  {
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 2.8, 7);
    trunkGeo.translate(0, 1.4, 0);
    const tier1Geo = new THREE.ConeGeometry(2.15, 4.2, 8);
    tier1Geo.translate(0, 4.2, 0);
    const tier2Geo = new THREE.ConeGeometry(1.62, 3.5, 8);
    tier2Geo.translate(0, 6.2, 0);
    const tier3Geo = new THREE.ConeGeometry(1.05, 2.8, 8);
    tier3Geo.translate(0, 8.0, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3523, roughness: 0.94 });
    const foliageMat = new THREE.MeshStandardMaterial({ roughness: 0.88, flatShading: true });

    const treePositions: Array<{ x: number; z: number; sc: number; sy: number; yaw: number; tint: THREE.Color }> = [];
    const maxTrees = 110;
    let attempts = 0;
    while (treePositions.length < maxTrees && attempts++ < 1500) {
      const ang = rand() * Math.PI * 2;
      const dist = 14.5 + Math.pow(rand(), 0.72) * 82;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist;
      // Keep dirt approach road & camp pads unobstructed
      if (tz > 4 && Math.abs(tx - Math.sin(tz * 0.045) * 3.5) < 5.2) continue;
      if (Math.hypot(tx - -9.6, tz - -7.6) < 4.5) continue;
      if (Math.hypot(tx - 9.4, tz - -6.6) < 4.2) continue;
      if (Math.hypot(tx - -7.6, tz - 6.8) < 3.6) continue;

      const sc = 0.78 + rand() * 0.65;
      const sy = sc * (0.9 + rand() * 0.35);
      const col = new THREE.Color().setHSL(0.29 + rand() * 0.055, 0.46, 0.085 + rand() * 0.055);
      treePositions.push({ x: tx, z: tz, sc, sy, yaw: rand() * Math.PI * 2, tint: col });
    }

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const tier1 = new THREE.InstancedMesh(tier1Geo, foliageMat, treePositions.length);
    const tier2 = new THREE.InstancedMesh(tier2Geo, foliageMat, treePositions.length);
    const tier3 = new THREE.InstancedMesh(tier3Geo, foliageMat, treePositions.length);

    trunks.castShadow = !isSoftwareGl;
    tier1.castShadow = !isSoftwareGl;
    tier2.castShadow = !isSoftwareGl;
    tier1.receiveShadow = true;

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < treePositions.length; i++) {
      const tp = treePositions[i];
      const ty = menuHeightAt(tp.x, tp.z) - 0.18;
      q.setFromAxisAngle(up, tp.yaw);
      m.compose(p.set(tp.x, ty, tp.z), q, s.set(tp.sc, tp.sy, tp.sc));
      trunks.setMatrixAt(i, m);
      tier1.setMatrixAt(i, m);
      tier2.setMatrixAt(i, m);
      tier3.setMatrixAt(i, m);
      tier1.setColorAt(i, tp.tint);
      tier2.setColorAt(i, tp.tint);
      tier3.setColorAt(i, tp.tint);

      if (Math.hypot(tp.x, tp.z) < 23.5) {
        const trunkPad = 0.75 * tp.sc;
        registerBoxCollider(tp.x - trunkPad, ty, tp.z - trunkPad, tp.x + trunkPad, ty + 6.5 * tp.sy, tp.z + trunkPad);
      }
    }

    trunks.computeBoundingSphere();
    tier1.computeBoundingSphere();
    tier2.computeBoundingSphere();
    tier3.computeBoundingSphere();
    scene.add(trunks, tier1, tier2, tier3);
  }

  // ── 8. Low Earthy Grass Tufts & Scattered Pebbles Outside Central Pad ──
  {
    const bladeGeo = new THREE.ConeGeometry(0.11, 0.28, 4);
    bladeGeo.translate(0, 0.13, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ roughness: 0.94, flatShading: true });
    const grassCount = 240;
    const grassMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, grassCount);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const eul = new THREE.Euler();
    const gCol = new THREE.Color();

    let placed = 0;
    let tries = 0;
    while (placed < grassCount - 3 && tries++ < 1100) {
      const a = rand() * Math.PI * 2;
      const dist = 10.2 + rand() * 26;
      const cx = Math.cos(a) * dist;
      const cz = Math.sin(a) * dist;
      if (cz > 4 && Math.abs(cx - Math.sin(cz * 0.045) * 3.5) < 3.4) continue;
      if (Math.hypot(cx - -9.6, cz - -7.6) < 3.6) continue;
      if (Math.hypot(cx - 9.4, cz - -6.6) < 3.4) continue;
      if (Math.hypot(cx - -7.6, cz - 6.8) < 2.8) continue;

      const bladesInClump = 3;
      const tintHue = 0.21 + rand() * 0.07;
      const tintLight = 0.11 + rand() * 0.07;
      for (let b = 0; b < bladesInClump; b++) {
        const gx = cx + (rand() - 0.5) * 0.42;
        const gz = cz + (rand() - 0.5) * 0.42;
        const gy = menuHeightAt(gx, gz) - 0.03;
        const sc = 0.65 + rand() * 0.6;
        eul.set((rand() - 0.5) * 0.35, rand() * Math.PI * 2, (rand() - 0.5) * 0.35);
        q.setFromEuler(eul);
        m.compose(p.set(gx, gy, gz), q, s.set(sc, sc * (0.75 + rand() * 0.45), sc));
        grassMesh.setMatrixAt(placed, m);
        gCol.setHSL(tintHue, 0.36, tintLight + rand() * 0.03);
        grassMesh.setColorAt(placed, gCol);
        placed++;
      }
    }
    grassMesh.count = placed;
    grassMesh.computeBoundingSphere();
    scene.add(grassMesh);
  }

  // World adapter so showcase Tank sits grounded and illuminated properly
  const world: GameWorld = {
    id: 'menu_camp',
    name: 'Sunset Field Camp',
    size: MENU_TERRAIN_SIZE,
    limit: 115,
    heightAt: menuHeightAt,
    normalAt: menuNormalAt,
    obstacles: [],
    segmentHit: () => null as WorldHit | null,
    raycast: () => null as WorldHit | null,
    nearby: () => [],
    update: () => {},
    sun,
    terrain,
    createEnvironment: () => {},
    dispose: () => {},
    setGrass: () => {},
    fogColor: fogHex,
    fogNear: 42,
    fogFar: 165,
    background: fogHex,
    exposure: 1.08,
    grade: { sat: 1.08, tint: [1.03, 0.99, 0.96] },
    spawnPlayer: { x: 0, z: 0, heading: 0.22 },
    spawnA: () => ({ x: 0, z: 0, heading: 0.22 }),
    spawnB: () => ({ x: 0, z: 0, heading: 0.22 }),
    objectives: [],
    objJitter: 0,
  };

  function update(_dt: number, elapsed: number): void {
    // Gentle warm campfire flicker + drifting sparks (zero per-frame allocations)
    fireLight.intensity = 10.5 + Math.sin(elapsed * 7.5) * 1.4 + Math.sin(elapsed * 13.2) * 0.8;
    for (let i = 0; i < emberParticles.length; i++) {
      const ep = emberParticles[i];
      const life = ((elapsed * 0.55 + ep.phase) % 1 + 1) % 1;
      ep.mesh.position.set(
        ep.baseX + Math.sin(elapsed * 2.1 + ep.phase) * 0.14,
        fireBaseY + 0.22 + life * 1.55,
        ep.baseZ + Math.cos(elapsed * 1.8 + ep.phase) * 0.14,
      );
      const sc = Math.max(0.15, 1 - life);
      ep.mesh.scale.setScalar(sc);
    }
  }

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

  return {
    scene,
    world,
    cameraColliders,
    heightAt: menuHeightAt,
    update,
    dispose,
  };
}
