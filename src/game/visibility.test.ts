import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  VisibilityController,
  computeFovScale,
  resolveBuildingLod,
  resolveTankLod,
  resolveTreeLod,
  sectorIndexFor,
} from './visibility';

test('VisibilityController culls spheres/boxes behind or outside camera frustum and keeps visible ones', () => {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 1500);
  cam.position.set(0, 5, 0);
  cam.lookAt(0, 5, 100); // looking along +Z

  const vis = new VisibilityController();
  vis.updateFromCamera(cam);

  // Directly in front at z=60 -> visible
  assert.equal(vis.isSphereVisible(0, 5, 60, 4), true);
  // Behind camera at z=-40 -> culled
  assert.equal(vis.isSphereVisible(0, 5, -40, 4), false);
  // Far off to the side at x=180, z=40 -> outside 60 deg frustum
  assert.equal(vis.isSphereVisible(180, 5, 40, 4), false);

  const frontBox = new THREE.Box3(new THREE.Vector3(-4, 0, 50), new THREE.Vector3(4, 10, 60));
  const rearBox = new THREE.Box3(new THREE.Vector3(-4, 0, -60), new THREE.Vector3(4, 10, -50));
  assert.equal(vis.isBoxVisible(frontBox), true);
  assert.equal(vis.isBoxVisible(rearBox), false);
});

test('LOD tier resolvers degrade detail with effective distance and cull out-of-frustum objects', () => {
  assert.equal(resolveTankLod(false, 20), 'culled');
  assert.equal(resolveTankLod(true, 40), 'high');
  assert.equal(resolveTankLod(true, 120), 'medium');
  assert.equal(resolveTankLod(true, 260), 'low');
  assert.equal(resolveTankLod(true, 1200), 'culled');

  assert.equal(resolveTreeLod(false, 50), 'culled');
  assert.equal(resolveTreeLod(true, 80), 'high');
  assert.equal(resolveTreeLod(true, 240), 'low');
  assert.equal(resolveTreeLod(true, 600), 'culled');

  assert.equal(resolveBuildingLod(false, 50), 'culled');
  assert.equal(resolveBuildingLod(true, 100), 'high');
  assert.equal(resolveBuildingLod(true, 350), 'low');
  assert.equal(resolveBuildingLod(true, 960), 'culled');
});

test('Zoom-compensated FOV scale keeps zoomed sniper/binoc targets in higher detail', () => {
  const normalScale = computeFovScale(55);
  const sniperZoomScale = computeFovScale(7);
  assert.ok(Math.abs(normalScale - 1) < 1e-6);
  assert.ok(sniperZoomScale < 0.2);

  // At 300m real distance: normal FOV gets low LOD, sniper zoom (~38m effective) gets high LOD
  assert.equal(resolveTankLod(true, 300 * normalScale), 'low');
  assert.equal(resolveTankLod(true, 300 * sniperZoomScale), 'high');
});

test('sectorIndexFor cleanly partitions coordinates inside [-worldHalf, worldHalf]', () => {
  const sw = sectorIndexFor(-400, -400, 500, 4);
  const ne = sectorIndexFor(400, 400, 500, 4);
  assert.equal(sw, 0);
  assert.equal(ne, 15);
  // Out-of-bounds values clamp safely into [0, 15]
  assert.equal(sectorIndexFor(-9999, -9999, 500, 4), 0);
  assert.equal(sectorIndexFor(9999, 9999, 500, 4), 15);
});
