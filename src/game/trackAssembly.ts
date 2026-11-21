import * as THREE from 'three';

export interface TrackAssemblySpec {
  trackX: number;
  trackWidth: number;
  beltThickness: number;
  wheelY: number;
  wheelR: number;
  wheelPositionsZ: number[];
  idlerZ: number;
  idlerY: number;
  idlerR: number;
  sprocketZ: number;
  sprocketY: number;
  sprocketR: number;
  returnRollersZ?: number[];
  returnRollerR?: number;
  sprocketTeeth?: number;
  fenderY: number;
  mudguardFrontZ: number;
  mudguardRearZ: number;
  /** Optional gap clearance between wheel faces and track width */
  wheelInset?: number;
}

export interface TrackContourResult {
  outerPts: Array<[number, number]>;
  innerPts: Array<[number, number]>;
  pointKind: Array<'bottom' | 'idler' | 'top' | 'sprocket'>;
  perimeter: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

export interface TrackBeltAnim {
  geometry: THREE.BufferGeometry;
  baseY: Float32Array;
  pointIndices: Uint16Array;
  contourZ: Float32Array;
  contourIsBottom: Float32Array;
  contourIsTop: Float32Array;
  contourDy: Float32Array;
  minWheelZ: number;
  maxWheelZ: number;
  maxTopDy: number;
  maxBottomDrop: number;
}

export interface TrackScrollRef {
  tex: THREE.CanvasTexture;
  sign: number;
  perimeter: number;
  anim?: TrackBeltAnim;
}

export interface TrackWheelRef {
  mesh: THREE.Object3D;
  side: number;
  radius: number;
  z: number;
  restY: number;
  isRoadWheel: boolean;
  arm?: THREE.Object3D;
  armRestY?: number;
  armRestRotX?: number;
}

export interface TrackFlexInputs {
  phase: number;
  speed: number;
  accel: number;
  yawRate: number;
  crestFlex: number;
  alive: boolean;
}

export function createTreadTexture(repeatCount = 18): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;

  // Dark link trough base
  g.fillStyle = '#181915';
  g.fillRect(0, 0, 128, 64);

  // Two interlocking track shoes per tile so repeating looks crisp and industrial
  for (let tile = 0; tile < 2; tile++) {
    const x0 = tile * 64;
    // Steel track plate body
    g.fillStyle = '#31332c';
    g.fillRect(x0 + 4, 2, 54, 60);

    // Dual rubber/steel track pads flanking the center guide track
    g.fillStyle = '#484a40';
    g.fillRect(x0 + 10, 6, 36, 20);
    g.fillRect(x0 + 10, 38, 36, 20);

    // Metallic worn grouser bar edge
    g.fillStyle = '#606256';
    g.fillRect(x0 + 42, 4, 8, 56);

    // Center guide horn channel
    g.fillStyle = '#121310';
    g.fillRect(x0 + 2, 28, 58, 8);

    // End connector pins
    g.fillStyle = '#535449';
    g.fillRect(x0 + 18, 0, 14, 4);
    g.fillRect(x0 + 18, 60, 14, 4);
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatCount, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Computes a closed CCW 2D contour (z, y) wrapping smoothly under the road wheels,
 * up around the front idler, back over the top run / return rollers, and down around
 * the rear drive sprocket, plus an inset inner contour separated by `beltThickness`.
 * Subdivides both bottom and top spans so track belts can subtly flex in motion.
 */
export function buildTrackContour(spec: TrackAssemblySpec): TrackContourResult {
  const padClear = 0.018;
  const t = spec.beltThickness;
  const sortedWheels = [...spec.wheelPositionsZ].sort((a, b) => a - b);
  const minWheelZ = sortedWheels[0];
  const maxWheelZ = sortedWheels[sortedWheels.length - 1];

  const bottomInnerY = spec.wheelY - spec.wheelR - padClear;
  const rIdlerIn = spec.idlerR + padClear;
  const rSprocketIn = spec.sprocketR + padClear;

  // Inner top run height clears both the wheels/rollers and connects smoothly between idler & sprocket tops
  const idlerTopIn = spec.idlerY + rIdlerIn;
  const sprocketTopIn = spec.sprocketY + rSprocketIn;
  const rollerTopIn =
    spec.returnRollersZ && spec.returnRollersZ.length > 0
      ? spec.wheelY + spec.wheelR + (spec.returnRollerR ?? 0.12) * 1.45 + 0.02
      : spec.wheelY + spec.wheelR + 0.04;
  const midTopIn = Math.max(rollerTopIn, Math.min(idlerTopIn, sprocketTopIn));

  const innerPts: Array<[number, number]> = [];
  const pointKind: Array<'bottom' | 'idler' | 'top' | 'sprocket'> = [];
  const pushUnique = (z: number, y: number, kind: 'bottom' | 'idler' | 'top' | 'sprocket') => {
    const prev = innerPts[innerPts.length - 1];
    if (prev && Math.hypot(z - prev[0], y - prev[1]) < 1e-4) return;
    innerPts.push([z, y]);
    pointKind.push(kind);
  };

  // 1. Rear wheel bottom -> front wheel bottom (subdivided at every road wheel + mid-span sag point)
  for (let i = 0; i < sortedWheels.length; i++) {
    const wz = sortedWheels[i];
    pushUnique(wz, bottomInnerY, 'bottom');
    if (i < sortedWheels.length - 1) {
      const midZ = (wz + sortedWheels[i + 1]) * 0.5;
      pushUnique(midZ, bottomInnerY, 'bottom');
    }
  }

  // 2. Front idler arc (CCW in (z, y): from bottom-rear approach around front +z tip to top)
  const idlerSegs = 9;
  const idlerStart = -Math.PI * 0.62;
  const idlerEnd = Math.PI * 0.5;
  for (let i = 0; i <= idlerSegs; i++) {
    const a = idlerStart + ((idlerEnd - idlerStart) * i) / idlerSegs;
    pushUnique(spec.idlerZ + Math.cos(a) * rIdlerIn, spec.idlerY + Math.sin(a) * rIdlerIn, 'idler');
  }

  // 3. Top run with subtle catenary over return rollers / road wheels (subdivided for dynamic whip/sag)
  const frontTopZ = spec.idlerZ - rIdlerIn * 0.3;
  const rearTopZ = spec.sprocketZ + rSprocketIn * 0.3;
  if (spec.returnRollersZ && spec.returnRollersZ.length > 0) {
    const sorted = [...spec.returnRollersZ].sort((a, b) => b - a);
    const anchors: Array<[number, number]> = [
      [frontTopZ, idlerTopIn],
      ...sorted.map((rz): [number, number] => [rz, midTopIn]),
      [rearTopZ, sprocketTopIn],
    ];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [z0, y0] = anchors[i];
      const [z1, y1] = anchors[i + 1];
      if (i > 0) pushUnique(z0, y0, 'top');
      const midZ = (z0 + z1) * 0.5;
      const midY = (y0 + y1) * 0.5 - 0.012;
      pushUnique(midZ, midY, 'top');
    }
  } else {
    const topSteps = 6;
    for (let s = 1; s < topSteps; s++) {
      const f = s / topSteps;
      const z = frontTopZ + (rearTopZ - frontTopZ) * f;
      const sag = Math.sin(f * Math.PI) * 0.016;
      const y = idlerTopIn + (sprocketTopIn - idlerTopIn) * f - sag;
      pushUnique(z, Math.max(midTopIn - 0.016, y), 'top');
    }
  }

  // 4. Rear drive sprocket arc (CCW in (z, y): from top around rear -z tip to bottom-front)
  const spSegs = 9;
  const spStart = Math.PI * 0.5;
  const spEnd = Math.PI * 1.62;
  for (let i = 0; i <= spSegs; i++) {
    const a = spStart + ((spEnd - spStart) * i) / spSegs;
    pushUnique(spec.sprocketZ + Math.cos(a) * rSprocketIn, spec.sprocketY + Math.sin(a) * rSprocketIn, 'sprocket');
  }

  // Ensure last point doesn't duplicate first
  if (innerPts.length > 2) {
    const first = innerPts[0];
    const last = innerPts[innerPts.length - 1];
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) < 1e-4) {
      innerPts.pop();
      pointKind.pop();
    }
  }

  // Compute mitered outward normals for outer loop (CCW in (z, y) => right-hand outward normal is (dz -> dy, -dz))
  const n = innerPts.length;
  const outerPts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const pPrev = innerPts[(i - 1 + n) % n];
    const pCurr = innerPts[i];
    const pNext = innerPts[(i + 1) % n];

    const dz1 = pCurr[0] - pPrev[0];
    const dy1 = pCurr[1] - pPrev[1];
    const l1 = Math.max(1e-6, Math.hypot(dz1, dy1));
    const nz1 = dy1 / l1;
    const ny1 = -dz1 / l1;

    const dz2 = pNext[0] - pCurr[0];
    const dy2 = pNext[1] - pCurr[1];
    const l2 = Math.max(1e-6, Math.hypot(dz2, dy2));
    const nz2 = dy2 / l2;
    const ny2 = -dz2 / l2;

    let mz = nz1 + nz2;
    let my = ny1 + ny2;
    const ml = Math.hypot(mz, my);
    if (ml < 1e-4) {
      mz = nz2;
      my = ny2;
    } else {
      mz /= ml;
      my /= ml;
    }
    const dot = Math.max(0.45, mz * nz2 + my * ny2);
    const offset = t / dot;
    outerPts.push([pCurr[0] + mz * offset, pCurr[1] + my * offset]);
  }

  let perimeter = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = outerPts[i];
    const b = outerPts[(i + 1) % n];
    perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (a[0] < minZ) minZ = a[0];
    if (a[0] > maxZ) maxZ = a[0];
    if (a[1] < minY) minY = a[1];
    if (a[1] > maxY) maxY = a[1];
  }

  return { outerPts, innerPts, pointKind, perimeter, minZ, maxZ, minY, maxY };
}

/**
 * Builds a hollow closed track-belt BufferGeometry with crisp split normals,
 * perimeter-mapped UVs, and per-vertex contour animation metadata.
 */
export function createTrackBeltGeometry(spec: TrackAssemblySpec): {
  geometry: THREE.BufferGeometry;
  contour: TrackContourResult;
  pointIndices: Uint16Array;
} {
  const contour = buildTrackContour(spec);
  const { outerPts, innerPts, perimeter } = contour;
  const n = outerPts.length;
  const hw = spec.trackWidth * 0.5;

  // Cumulative arc length along outer contour (normalized 0..1)
  const arcU: number[] = [0];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = outerPts[i];
    const b = outerPts[(i + 1) % n];
    acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
    arcU.push(acc / Math.max(1e-4, perimeter));
  }

  // 4 quads per segment (outer, inner, +X edge, -X edge) * 4 verts per quad
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertPointIndices: number[] = [];

  const pushQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
    uv3: [number, number],
    pi0: number,
    pi1: number,
    pi2: number,
    pi3: number,
  ) => {
    const base = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    uvs.push(...uv0, ...uv1, ...uv2, ...uv3);
    vertPointIndices.push(pi0, pi1, pi2, pi3);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const u0 = arcU[i];
    const u1 = arcU[i + 1];

    const oz0 = outerPts[i][0];
    const oy0 = outerPts[i][1];
    const oz1 = outerPts[j][0];
    const oy1 = outerPts[j][1];

    const iz0 = innerPts[i][0];
    const iy0 = innerPts[i][1];
    const iz1 = innerPts[j][0];
    const iy1 = innerPts[j][1];

    // 1. Outer tread face (outward normal)
    pushQuad(
      [hw, oy0, oz0],
      [hw, oy1, oz1],
      [-hw, oy1, oz1],
      [-hw, oy0, oz0],
      [u0, 0],
      [u1, 0],
      [u1, 1],
      [u0, 1],
      i,
      j,
      j,
      i,
    );

    // 2. Inner track face (facing inside the loop toward wheels)
    pushQuad(
      [hw, iy0, iz0],
      [-hw, iy0, iz0],
      [-hw, iy1, iz1],
      [hw, iy1, iz1],
      [u0, 0],
      [u0, 1],
      [u1, 1],
      [u1, 0],
      i,
      i,
      j,
      j,
    );

    // 3. +X rim face (outer edge of track)
    pushQuad(
      [hw, oy0, oz0],
      [hw, iy0, iz0],
      [hw, iy1, iz1],
      [hw, oy1, oz1],
      [u0, 0.02],
      [u0, 0.14],
      [u1, 0.14],
      [u1, 0.02],
      i,
      i,
      j,
      j,
    );

    // 4. -X rim face (inner edge of track)
    pushQuad(
      [-hw, oy0, oz0],
      [-hw, oy1, oz1],
      [-hw, iy1, iz1],
      [-hw, iy0, iz0],
      [u0, 0.86],
      [u1, 0.86],
      [u1, 0.98],
      [u0, 0.98],
      i,
      j,
      j,
      i,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) {
    geometry.boundingSphere.radius += 0.2;
  }

  return { geometry, contour, pointIndices: new Uint16Array(vertPointIndices) };
}

export function createTrackBeltAnim(
  geometry: THREE.BufferGeometry,
  contour: TrackContourResult,
  pointIndices: Uint16Array,
  spec: TrackAssemblySpec,
): TrackBeltAnim {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const baseY = new Float32Array(posAttr.count);
  for (let v = 0; v < posAttr.count; v++) {
    baseY[v] = posAttr.getY(v);
  }

  const n = contour.outerPts.length;
  const contourZ = new Float32Array(n);
  const contourIsBottom = new Float32Array(n);
  const contourIsTop = new Float32Array(n);
  const minWheelZ = Math.min(...spec.wheelPositionsZ);
  const maxWheelZ = Math.max(...spec.wheelPositionsZ);

  for (let i = 0; i < n; i++) {
    contourZ[i] = contour.outerPts[i][0];
    const kind = contour.pointKind[i];
    if (kind === 'bottom') {
      // Taper cleanly at end road wheels so idler/sprocket wraps seamlessly without kinks
      const z = contourZ[i];
      const edgeFade =
        Math.abs(z - minWheelZ) < 0.05 || Math.abs(z - maxWheelZ) < 0.05 ? 0.55 : 1.0;
      contourIsBottom[i] = edgeFade;
    } else if (kind === 'top') {
      contourIsTop[i] = 1.0;
    }
  }

  // Keep upward belt flex strictly below fender underside
  const fenderClear = Math.max(0.015, spec.fenderY - 0.045 - contour.maxY);

  return {
    geometry,
    baseY,
    pointIndices,
    contourZ,
    contourIsBottom,
    contourIsTop,
    contourDy: new Float32Array(n),
    minWheelZ,
    maxWheelZ,
    maxTopDy: Math.min(0.024, fenderClear),
    maxBottomDrop: 0.014,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Animates torsion-bar road wheel travel and subtly flexes both the bottom
 * ground-hugging run and upper catenary run of each track belt without allocations.
 */
export function updateTrackSuspensionAndFlex(
  tracks: TrackScrollRef[],
  wheels: TrackWheelRef[],
  inputs: TrackFlexInputs,
): void {
  const speedAbs = Math.abs(inputs.speed);
  const speedFactor = inputs.alive ? Math.min(1, speedAbs / 3.5) : 0;
  const accelClamped = inputs.alive ? clamp(inputs.accel, -9, 9) : 0;
  const yawClamped = inputs.alive ? clamp(inputs.yawRate, -1, 1) : 0;
  const crestFlex = clamp(inputs.crestFlex, -0.02, 0.06);

  // Determine longitudinal bounds across all road wheels for normalized weight transfer
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < wheels.length; i++) {
    if (!wheels[i].isRoadWheel) continue;
    const wz = wheels[i].z;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }
  const halfSpan = Math.max(0.5, (maxZ - minZ) * 0.5);
  const midZ = (maxZ + minZ) * 0.5;

  const evalBottomDy = (z: number, side: number): number => {
    const zn = clamp((z - midZ) / halfSpan, -1, 1);
    const weightShift = -accelClamped * 0.0028 * zn;
    const turnRoll = side * yawClamped * 0.014;
    const ripple =
      speedFactor > 0.01
        ? Math.sin(inputs.phase * 1.15 - z * 1.45 + side * 0.65) * 0.022 * speedFactor
        : 0;
    const crestLift = (1 - zn * zn) * crestFlex;
    return clamp(weightShift + turnRoll + ripple + crestLift, -0.018, 0.065);
  };

  // 1. Articulate road wheels and torsion swing arms
  for (let i = 0; i < wheels.length; i++) {
    const w = wheels[i];
    if (!w.isRoadWheel) continue;
    const dy = evalBottomDy(w.z, w.side);
    w.mesh.position.y = w.restY + dy;
    if (w.arm && w.armRestY !== undefined && w.armRestRotX !== undefined) {
      w.arm.position.y = w.armRestY + dy * 0.5;
      w.arm.rotation.x = w.armRestRotX + dy * 1.25;
    }
  }

  // 2. Flex left and right track belt BufferGeometries independently
  for (let ti = 0; ti < tracks.length; ti++) {
    const tr = tracks[ti];
    const anim = tr.anim;
    if (!anim) continue;

    const n = anim.contourZ.length;
    const dyArr = anim.contourDy;
    const trackSpeedFactor = inputs.alive
      ? Math.min(1, Math.abs(inputs.speed - tr.sign * inputs.yawRate * 1.75) / 3.5)
      : 0;

    for (let i = 0; i < n; i++) {
      const z = anim.contourZ[i];
      const wBot = anim.contourIsBottom[i];
      const wTop = anim.contourIsTop[i];
      let dy = 0;

      if (wBot > 0) {
        const botDy = evalBottomDy(z, tr.sign);
        // Micro-sag ripple between bogies when belt links travel under tension
        const interWheelWave =
          trackSpeedFactor > 0.01
            ? Math.sin(inputs.phase * 2.4 - z * 2.2 + tr.sign) * 0.006 * trackSpeedFactor
            : 0;
        dy = clamp(botDy + interWheelWave, -anim.maxBottomDrop, 0.065) * wBot;
      } else if (wTop > 0) {
        // Upper catenary slack wave / whip while driving + slight acceleration slack
        const whip =
          trackSpeedFactor > 0.01
            ? Math.sin(inputs.phase * 2.1 - z * 1.15 + tr.sign * 0.5) * 0.018 * trackSpeedFactor
            : 0;
        const torqueSag = -Math.abs(accelClamped) * 0.0016;
        dy = clamp(whip + torqueSag, -0.026, anim.maxTopDy) * wTop;
      }
      dyArr[i] = dy;
    }

    const posAttr = anim.geometry.getAttribute('position') as THREE.BufferAttribute;
    const count = posAttr.count;
    const baseY = anim.baseY;
    const ptIdx = anim.pointIndices;
    for (let v = 0; v < count; v++) {
      posAttr.setY(v, baseY[v] + dyArr[ptIdx[v]]);
    }
    posAttr.needsUpdate = true;
  }
}

/**
 * Builds a toothed drive sprocket ring geometry aligned on the X axle.
 */
export function createToothedSprocketGeometry(
  baseRadius: number,
  toothHeight: number,
  ringWidth: number,
  teethCount = 12,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const steps = teethCount * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const mod = i % 4;
    const r = mod === 1 || mod === 2 ? baseRadius + toothHeight : baseRadius * 0.96;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: ringWidth, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2);
  geo.translate(ringWidth * 0.5, 0, 0);
  return geo;
}

export function buildTankTracks(
  hullGroup: THREE.Group,
  spec: TrackAssemblySpec,
  mats: {
    hullMat: THREE.Material;
    darkMat: THREE.Material;
    metalMat: THREE.Material;
  },
): {
  tracks: TrackScrollRef[];
  wheels: TrackWheelRef[];
  wheelWidth: number;
  contour: TrackContourResult;
} {
  const { geometry: baseBeltGeo, contour, pointIndices } = createTrackBeltGeometry(spec);
  const wheelInset = spec.wheelInset ?? 0.1;
  const wheelW = Math.max(0.28, spec.trackWidth - wheelInset);
  const rubberMat = mats.darkMat;
  const rimMat = mats.metalMat;
  const hubMat = mats.hullMat;

  // Dual-rim road wheel assembly (rubber tire + painted inner disc + hub + spokes, strictly inside trackWidth)
  const tireGeo = new THREE.CylinderGeometry(spec.wheelR, spec.wheelR, wheelW, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const discGeo = new THREE.CylinderGeometry(spec.wheelR * 0.78, spec.wheelR * 0.78, wheelW + 0.016, 16);
  discGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(spec.wheelR * 0.3, spec.wheelR * 0.32, wheelW + 0.044, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(wheelW + 0.026, spec.wheelR * 1.38, spec.wheelR * 0.14);

  // Torsion swing arm attached statically to hull, pivoted cleanly with suspension travel
  const armGeo = new THREE.BoxGeometry(0.11, 0.1, 0.36);

  // Front idler tension wheel
  const idlerW = Math.max(0.24, wheelW - 0.04);
  const idlerTireGeo = new THREE.CylinderGeometry(spec.idlerR, spec.idlerR, idlerW, 16);
  idlerTireGeo.rotateZ(Math.PI / 2);
  const idlerDiscGeo = new THREE.CylinderGeometry(spec.idlerR * 0.72, spec.idlerR * 0.72, idlerW + 0.02, 12);
  idlerDiscGeo.rotateZ(Math.PI / 2);
  const idlerHubGeo = new THREE.CylinderGeometry(spec.idlerR * 0.32, spec.idlerR * 0.34, idlerW + 0.045, 8);
  idlerHubGeo.rotateZ(Math.PI / 2);

  // Rear toothed drive sprocket (drum + twin outer/inner gear tooth rings)
  const spRingW = 0.085;
  const spTeeth = spec.sprocketTeeth ?? 12;
  const spRingGeo = createToothedSprocketGeometry(spec.sprocketR * 0.88, spec.sprocketR * 0.16, spRingW, spTeeth);
  const spDrumGeo = new THREE.CylinderGeometry(spec.sprocketR * 0.74, spec.sprocketR * 0.74, wheelW, 14);
  spDrumGeo.rotateZ(Math.PI / 2);
  const spHubGeo = new THREE.CylinderGeometry(spec.sprocketR * 0.34, spec.sprocketR * 0.38, wheelW + 0.048, 10);
  spHubGeo.rotateZ(Math.PI / 2);

  // Return rollers (when tank uses them)
  const rollerR = spec.returnRollerR ?? 0.12;
  const rollerW = Math.max(0.2, wheelW - 0.08);
  const rollerGeo = new THREE.CylinderGeometry(rollerR, rollerR, rollerW, 10);
  rollerGeo.rotateZ(Math.PI / 2);

  // Mudguards (подкрылки) angled downward around front idler & rear sprocket
  const guardW = spec.trackWidth + 0.06;
  const frontGuardGeo = new THREE.BoxGeometry(guardW, 0.055, 0.44);
  const rearGuardGeo = new THREE.BoxGeometry(guardW, 0.055, 0.42);
  const midTopY = contour.innerPts.reduce((best, p) => {
    if (p[0] > spec.sprocketZ + spec.sprocketR && p[0] < spec.idlerZ - spec.idlerR) {
      return Math.max(best, p[1]);
    }
    return best;
  }, spec.wheelY + spec.wheelR + rollerR * 1.45 + 0.02);
  const topReturnY = midTopY - rollerR - 0.004;

  const tracks: TrackScrollRef[] = [];
  const wheels: TrackWheelRef[] = [];
  const repeatCount = Math.max(12, Math.round(contour.perimeter * 2.15));

  for (const sx of [1, -1]) {
    const tx = sx * spec.trackX;
    const tex = createTreadTexture(repeatCount);
    const beltMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.9,
      metalness: 0.28,
      flatShading: true,
    });
    // Independent geometry per side so left & right belts flex independently
    const sideBeltGeo = sx === 1 ? baseBeltGeo : baseBeltGeo.clone();
    const belt = new THREE.Mesh(sideBeltGeo, beltMat);
    belt.position.set(tx, 0, 0);
    hullGroup.add(belt);
    const anim = createTrackBeltAnim(sideBeltGeo, contour, pointIndices, spec);
    tracks.push({ tex, sign: sx, perimeter: contour.perimeter, anim });

    // Road wheels + articulated hull torsion arms
    for (const wz of spec.wheelPositionsZ) {
      const arm = new THREE.Mesh(armGeo, rubberMat);
      const armRestY = spec.wheelY + 0.08;
      const armRestRotX = -0.35;
      arm.position.set(sx * (spec.trackX - wheelW * 0.42 - 0.08), armRestY, wz - 0.14);
      arm.rotation.x = armRestRotX;
      hullGroup.add(arm);

      const wg = new THREE.Group();
      wg.position.set(tx, spec.wheelY, wz);
      wg.add(new THREE.Mesh(tireGeo, rubberMat));
      wg.add(new THREE.Mesh(discGeo, rimMat));
      wg.add(new THREE.Mesh(hubGeo, hubMat));
      const sp1 = new THREE.Mesh(spokeGeo, rubberMat);
      const sp2 = new THREE.Mesh(spokeGeo, rubberMat);
      sp2.rotation.x = Math.PI * 0.5;
      wg.add(sp1, sp2);
      hullGroup.add(wg);
      wheels.push({
        mesh: wg,
        side: sx,
        radius: spec.wheelR,
        z: wz,
        restY: spec.wheelY,
        isRoadWheel: true,
        arm,
        armRestY,
        armRestRotX,
      });
    }

    // Front idler tension wheel
    const idlerGroup = new THREE.Group();
    idlerGroup.position.set(tx, spec.idlerY, spec.idlerZ);
    idlerGroup.add(new THREE.Mesh(idlerTireGeo, rubberMat));
    idlerGroup.add(new THREE.Mesh(idlerDiscGeo, rimMat));
    idlerGroup.add(new THREE.Mesh(idlerHubGeo, hubMat));
    hullGroup.add(idlerGroup);
    wheels.push({
      mesh: idlerGroup,
      side: sx,
      radius: spec.idlerR,
      z: spec.idlerZ,
      restY: spec.idlerY,
      isRoadWheel: false,
    });

    // Rear toothed drive sprocket
    const spGroup = new THREE.Group();
    spGroup.position.set(tx, spec.sprocketY, spec.sprocketZ);
    spGroup.add(new THREE.Mesh(spDrumGeo, rimMat));
    spGroup.add(new THREE.Mesh(spHubGeo, hubMat));
    const ringOffset = Math.max(0.1, wheelW * 0.5 - spRingW * 0.52);
    const outerRing = new THREE.Mesh(spRingGeo, rimMat);
    outerRing.position.set(ringOffset, 0, 0);
    const innerRing = new THREE.Mesh(spRingGeo, rimMat);
    innerRing.position.set(-ringOffset, 0, 0);
    spGroup.add(outerRing, innerRing);
    hullGroup.add(spGroup);
    wheels.push({
      mesh: spGroup,
      side: sx,
      radius: spec.sprocketR,
      z: spec.sprocketZ,
      restY: spec.sprocketY,
      isRoadWheel: false,
    });

    // Return rollers
    if (spec.returnRollersZ) {
      for (const rz of spec.returnRollersZ) {
        const roller = new THREE.Mesh(rollerGeo, rubberMat);
        roller.position.set(tx, topReturnY, rz);
        hullGroup.add(roller);
        wheels.push({
          mesh: roller,
          side: sx,
          radius: rollerR,
          z: rz,
          restY: topReturnY,
          isRoadWheel: false,
        });
      }
    }

    // Front and rear mudguards (подкрылки) angled cleanly outside the belt contour
    const fGuard = new THREE.Mesh(frontGuardGeo, mats.hullMat);
    fGuard.position.set(tx, spec.fenderY - 0.12, spec.mudguardFrontZ);
    fGuard.rotation.x = 0.52;
    hullGroup.add(fGuard);

    const rGuard = new THREE.Mesh(rearGuardGeo, rubberMat);
    rGuard.position.set(tx, spec.fenderY - 0.12, spec.mudguardRearZ);
    rGuard.rotation.x = -0.48;
    hullGroup.add(rGuard);
  }

  return { tracks, wheels, wheelWidth: wheelW, contour };
}
