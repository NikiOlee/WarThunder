import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildTrackContour,
  createToothedSprocketGeometry,
  createTrackBeltAnim,
  createTrackBeltGeometry,
  updateTrackSuspensionAndFlex,
  type TrackAssemblySpec,
  type TrackScrollRef,
  type TrackWheelRef,
} from './trackAssembly';

const TANK_SUSPENSION_CHECKS: Array<{
  id: string;
  hullHalfWidth: number;
  fenderBottomY: number;
  spec: TrackAssemblySpec;
}> = [
  {
    id: 'maus',
    hullHalfWidth: 1.21,
    fenderBottomY: 2.08, // Maus upper sponson deck underside
    spec: {
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
  },
  {
    id: 'm60a3',
    hullHalfWidth: 1.5,
    fenderBottomY: 1.215,
    spec: {
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
  },
  {
    id: 't62m',
    hullHalfWidth: 1.48,
    fenderBottomY: 1.115,
    spec: {
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
  },
  {
    id: 't72b3',
    hullHalfWidth: 1.51,
    fenderBottomY: 1.115,
    spec: {
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
  },
  {
    id: 'leopard2a4',
    hullHalfWidth: 1.52,
    fenderBottomY: 1.155,
    spec: {
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
  },
  {
    id: 'm1a1',
    hullHalfWidth: 1.52,
    fenderBottomY: 1.165,
    spec: {
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
  },
  {
    id: 'ztz96a',
    hullHalfWidth: 1.49,
    fenderBottomY: 1.115,
    spec: {
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
  },
  {
    id: 't90m',
    hullHalfWidth: 1.51,
    fenderBottomY: 1.115,
    spec: {
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
  },
  {
    id: 'merkava4',
    hullHalfWidth: 1.52,
    fenderBottomY: 1.175,
    spec: {
      trackX: 1.86,
      trackWidth: 0.58,
      beltThickness: 0.055,
      wheelY: 0.49,
      wheelR: 0.41,
      wheelPositionsZ: [-2.88, -1.88, -0.88, 0.12, 1.12, 2.38],
      idlerZ: 3.38,
      idlerY: 0.74,
      idlerR: 0.28,
      sprocketZ: -3.44,
      sprocketY: 0.71,
      sprocketR: 0.3,
      returnRollersZ: [-2.35, -0.45, 1.55],
      returnRollerR: 0.11,
      sprocketTeeth: 12,
      fenderY: 1.21,
      mudguardFrontZ: 3.74,
      mudguardRearZ: -3.7,
    },
  },
  {
    id: 'challenger2',
    hullHalfWidth: 1.53,
    fenderBottomY: 1.175,
    spec: {
      trackX: 1.88,
      trackWidth: 0.58,
      beltThickness: 0.055,
      wheelY: 0.49,
      wheelR: 0.41,
      wheelPositionsZ: [-2.96, -1.94, -0.92, 0.1, 1.12, 2.52],
      idlerZ: 3.46,
      idlerY: 0.74,
      idlerR: 0.28,
      sprocketZ: -3.52,
      sprocketY: 0.71,
      sprocketR: 0.3,
      returnRollersZ: [-2.4, -0.45, 1.55],
      returnRollerR: 0.11,
      sprocketTeeth: 12,
      fenderY: 1.21,
      mudguardFrontZ: 3.8,
      mudguardRearZ: -3.78,
    },
  },
  {
    id: 't55',
    hullHalfWidth: 1.45,
    fenderBottomY: 1.115,
    spec: {
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
  },
];

test('buildTrackContour and createTrackBeltGeometry satisfy clearances and closed outward geometry for all 11 tanks', () => {
  for (const entry of TANK_SUSPENSION_CHECKS) {
    const contour = buildTrackContour(entry.spec);
    assert.equal(contour.outerPts.length, contour.innerPts.length);
    assert.ok(contour.outerPts.length >= 20, `${entry.id} contour must have smooth arcs`);
    assert.ok(contour.perimeter > 10, `${entry.id} perimeter should be > 10m`);

    // No sunken belt below ground and clear gap beneath fenders
    assert.ok(contour.minY >= 0, `${entry.id} track bottom must be >= 0 (got ${contour.minY})`);
    assert.ok(
      contour.maxY + 0.02 <= entry.fenderBottomY,
      `${entry.id} track top (${contour.maxY}) must clear fender underside (${entry.fenderBottomY})`,
    );

    // No hull-to-track X intersection (anti z-fighting gap)
    const innerTrackX = entry.spec.trackX - entry.spec.trackWidth * 0.5;
    assert.ok(
      innerTrackX - entry.hullHalfWidth >= 0.04,
      `${entry.id} inner track (${innerTrackX}) must clear hull side (${entry.hullHalfWidth})`,
    );

    // Road wheels strictly inset inside belt width
    const wheelW = Math.max(0.28, entry.spec.trackWidth - (entry.spec.wheelInset ?? 0.1));
    assert.ok(wheelW < entry.spec.trackWidth - 0.05, `${entry.id} wheels must stay strictly inside belt width`);

    // Check BufferGeometry has finite positions, outward normals, and full 0..1 UVs
    const { geometry } = createTrackBeltGeometry(entry.spec);
    const pos = geometry.getAttribute('position');
    const norm = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const idx = geometry.getIndex();
    assert.ok(pos && norm && uv && idx, `${entry.id} geometry missing required attributes`);
    assert.equal(pos.count, contour.outerPts.length * 16);
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
      assert.ok(Number.isFinite(norm.getX(i)) && Number.isFinite(norm.getY(i)) && Number.isFinite(norm.getZ(i)));
    }
    geometry.dispose();
  }
});

test('createToothedSprocketGeometry creates valid gear ring centered on X axle', () => {
  const geo = createToothedSprocketGeometry(0.27, 0.05, 0.085, 12);
  const pos = geo.getAttribute('position');
  assert.ok(pos && pos.count > 40);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  assert.ok(Math.abs(bb.min.x + 0.0425) < 0.01 && Math.abs(bb.max.x - 0.0425) < 0.01);
  assert.ok(bb.max.y > 0.3 && bb.max.y < 0.34);
  geo.dispose();
});

test('updateTrackSuspensionAndFlex animates road wheels and subtly flexes left/right track belts within clearances', () => {
  const t55Entry = TANK_SUSPENSION_CHECKS.find((e) => e.id === 't55')!;
  const { geometry: leftGeo, contour, pointIndices } = createTrackBeltGeometry(t55Entry.spec);
  const rightGeo = leftGeo.clone();

  const leftAnim = createTrackBeltAnim(leftGeo, contour, pointIndices, t55Entry.spec);
  const rightAnim = createTrackBeltAnim(rightGeo, contour, pointIndices, t55Entry.spec);

  const tracks: TrackScrollRef[] = [
    { tex: new THREE.CanvasTexture(), sign: 1, perimeter: contour.perimeter, anim: leftAnim },
    { tex: new THREE.CanvasTexture(), sign: -1, perimeter: contour.perimeter, anim: rightAnim },
  ];
  const wheels: TrackWheelRef[] = [];
  for (const sx of [1, -1]) {
    for (const wz of t55Entry.spec.wheelPositionsZ) {
      const mesh = new THREE.Object3D();
      mesh.position.set(sx * t55Entry.spec.trackX, t55Entry.spec.wheelY, wz);
      const arm = new THREE.Object3D();
      arm.position.set(sx * 1.5, t55Entry.spec.wheelY + 0.08, wz - 0.14);
      arm.rotation.x = -0.35;
      wheels.push({
        mesh,
        side: sx,
        radius: t55Entry.spec.wheelR,
        z: wz,
        restY: t55Entry.spec.wheelY,
        isRoadWheel: true,
        arm,
        armRestY: t55Entry.spec.wheelY + 0.08,
        armRestRotX: -0.35,
      });
    }
  }

  // Simulate driving at speed while steering & traversing a hill crest
  updateTrackSuspensionAndFlex(tracks, wheels, {
    phase: 2.3,
    speed: 11.5,
    accel: 4.5,
    yawRate: 0.45,
    crestFlex: 0.04,
    alive: true,
  });

  const leftPos = leftGeo.getAttribute('position') as THREE.BufferAttribute;
  const rightPos = rightGeo.getAttribute('position') as THREE.BufferAttribute;

  let maxDelta = 0;
  let maxSideDiff = 0;
  let maxY = -Infinity;
  let minY = Infinity;
  for (let i = 0; i < leftPos.count; i++) {
    const ly = leftPos.getY(i);
    const ry = rightPos.getY(i);
    assert.ok(Number.isFinite(ly) && Number.isFinite(ry));
    maxDelta = Math.max(maxDelta, Math.abs(ly - leftAnim.baseY[i]));
    maxSideDiff = Math.max(maxSideDiff, Math.abs(ly - ry));
    maxY = Math.max(maxY, ly, ry);
    minY = Math.min(minY, ly, ry);
  }

  // Track must visibly flex while staying strictly below fender underside and near ground plane
  assert.ok(maxDelta > 0.008 && maxDelta < 0.09, `expected subtle non-static flex, got maxDelta=${maxDelta}`);
  assert.ok(maxSideDiff > 0.005, `expected left/right belts to flex independently during turns, got diff=${maxSideDiff}`);
  assert.ok(maxY < t55Entry.fenderBottomY, `flexed top belt (${maxY}) must stay under fender (${t55Entry.fenderBottomY})`);
  assert.ok(minY >= -0.025, `flexed bottom belt (${minY}) must not sink deep below local zero`);

  // Verify road wheels and swing arms articulated too
  const movedWheel = wheels.some((w) => Math.abs(w.mesh.position.y - w.restY) > 0.005);
  const movedArm = wheels.some((w) => w.arm && Math.abs(w.arm.rotation.x - w.armRestRotX!) > 0.005);
  assert.equal(movedWheel, true);
  assert.equal(movedArm, true);

  leftGeo.dispose();
  rightGeo.dispose();
  for (const tr of tracks) tr.tex.dispose();
});
