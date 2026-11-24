import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMenuOrbitDrag,
  applyMenuOrbitZoom,
  createMenuOrbitState,
  DEFAULT_MENU_ORBIT_CONFIG,
  resolveMenuCameraPose,
  segmentAabbHitFraction,
  stepMenuOrbitState,
  type OrbitBoxCollider,
} from './menuOrbit';

test('Vertical pitch is strictly clamped above ground/horizon and below zenith cap', () => {
  const st = createMenuOrbitState(0, 0.25, 11);

  // Dragging cursor violently upward/downward must stay within [minPitch, maxPitch]
  applyMenuOrbitDrag(st, 0, -5000);
  stepMenuOrbitState(st, 0.016, false);
  assert.equal(st.pitch, DEFAULT_MENU_ORBIT_CONFIG.minPitch);
  assert.ok(st.pitch > 0, 'minPitch must stay strictly positive above ground plane');

  applyMenuOrbitDrag(st, 0, 5000);
  stepMenuOrbitState(st, 0.016, false);
  assert.equal(st.pitch, DEFAULT_MENU_ORBIT_CONFIG.maxPitch);
});

test('Zoom distance stays within safe [minDist, maxDist] limits', () => {
  const st = createMenuOrbitState(0.5, 0.25, 12);

  for (let i = 0; i < 30; i++) applyMenuOrbitZoom(st, -120);
  stepMenuOrbitState(st, 0.016, false);
  assert.equal(st.dist, DEFAULT_MENU_ORBIT_CONFIG.minDist);

  for (let i = 0; i < 30; i++) applyMenuOrbitZoom(st, 120);
  stepMenuOrbitState(st, 0.016, false);
  assert.equal(st.dist, DEFAULT_MENU_ORBIT_CONFIG.maxDist);
});

test('Camera never sinks below rising terrain ridges or flat ground', () => {
  const st = createMenuOrbitState(0, DEFAULT_MENU_ORBIT_CONFIG.minPitch, 16);
  // Steep hill rising along +Z starting beyond radius 7
  const hillTerrain = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    return r > 7 ? (r - 7) * 1.15 : 0;
  };

  const pose = resolveMenuCameraPose(st, hillTerrain, []);
  const groundAtCam = hillTerrain(pose.x, pose.z);
  assert.ok(
    pose.y >= groundAtCam + DEFAULT_MENU_ORBIT_CONFIG.groundClearance - 1e-4,
    `Camera y (${pose.y}) must stay above terrain (${groundAtCam}) + clearance`,
  );
  assert.equal(pose.clampedByGround, true);
  assert.ok(pose.effectiveDist < 16, 'Camera must pull inward rather than clipping through rising slope');
});

test('Camera pulls inward before clipping into boulder or camp structure colliders', () => {
  // Orbit straight along +Z toward a rock collider spanning z=[8, 12]
  const st = createMenuOrbitState(0, 0.14, 15);
  const boulder: OrbitBoxCollider = {
    minX: -2.2,
    minY: 0,
    minZ: 8.5,
    maxX: 2.2,
    maxY: 4.5,
    maxZ: 12.0,
  };

  const hitFrac = segmentAabbHitFraction(
    0,
    1.75,
    0,
    0,
    1.75 + Math.sin(0.14) * 15,
    Math.cos(0.14) * 15,
    boulder,
    DEFAULT_MENU_ORBIT_CONFIG.obstaclePadding,
  );
  assert.ok(hitFrac !== null && hitFrac < 0.7);

  const pose = resolveMenuCameraPose(st, () => 0, [boulder]);
  assert.equal(pose.clampedByObstacle, true);
  assert.ok(
    pose.z <= boulder.minZ - DEFAULT_MENU_ORBIT_CONFIG.obstaclePadding + 1e-4,
    `Camera z (${pose.z}) must stop in front of boulder padded face (${boulder.minZ - DEFAULT_MENU_ORBIT_CONFIG.obstaclePadding})`,
  );
});

test('Exponential damping smoothly converges yaw/pitch/dist toward target', () => {
  const st = createMenuOrbitState(0, 0.25, 11);
  applyMenuOrbitDrag(st, 150, 40);
  const beforeYaw = st.yaw;
  stepMenuOrbitState(st, 0.05, true);
  assert.ok(st.yaw < beforeYaw && st.yaw > st.targetYaw, 'Damped yaw should step smoothly without snapping');

  for (let i = 0; i < 60; i++) stepMenuOrbitState(st, 0.05, true);
  assert.ok(Math.abs(st.yaw - st.targetYaw) < 1e-3);
  assert.ok(Math.abs(st.pitch - st.targetPitch) < 1e-3);
});
