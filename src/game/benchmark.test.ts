import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BENCHMARK_STRESS_GRAPHICS,
  BenchmarkCollector,
  buildGraphicsProfile,
  recommendProfileForMetrics,
  sampleBenchmarkCameraPose,
} from './benchmark';

test('BenchmarkCollector computes avg FPS, min/max FPS, 1% low, and live stats accurately', () => {
  const col = new BenchmarkCollector();
  col.reset();

  // 98 frames at 10 ms (100 FPS), 2 spike frames at 40 ms (25 FPS)
  for (let i = 0; i < 98; i++) col.recordFrame(0.01);
  col.recordFrame(0.04);
  col.recordFrame(0.04);

  const live = col.getLiveStats();
  assert.equal(live.frameCount, 100);
  assert.ok(live.avgFps >= 90 && live.avgFps <= 96);
  assert.equal(live.minFps, 25);

  const summary = col.finalize(16);
  assert.equal(summary.frameCount, 100);
  assert.equal(summary.minFps, 25);
  assert.equal(summary.maxFps, 100);
  assert.equal(summary.onePercentLowFps, 25);
  assert.ok(summary.avgFrameTimeMs > 10 && summary.avgFrameTimeMs < 11.5);
});

test('recommendProfileForMetrics picks max_gfx, fps_60, or max_fps cleanly', () => {
  assert.equal(recommendProfileForMetrics(75, 55), 'max_gfx');
  assert.equal(recommendProfileForMetrics(62, 32), 'fps_60');
  assert.equal(recommendProfileForMetrics(45, 30), 'fps_60');
  assert.equal(recommendProfileForMetrics(28, 18), 'max_fps');
});

test('buildGraphicsProfile configures Max FPS, Max Graphics, and calibrated 60 FPS modes correctly', () => {
  const maxFps = buildGraphicsProfile('max_fps');
  assert.equal(maxFps.fpsLimit, 0);
  assert.equal(maxFps.shadows, 'off');
  assert.equal(maxFps.post, false);
  assert.equal(maxFps.grass, 0);
  assert.equal(maxFps.envReflections, false);

  const maxGfx = buildGraphicsProfile('max_gfx');
  assert.equal(maxGfx.fpsLimit, 0);
  assert.equal(maxGfx.shadows, 'ultra');
  assert.equal(maxGfx.shadowType, 'soft');
  assert.equal(maxGfx.post, true);
  assert.equal(maxGfx.grass, 1);
  assert.equal(maxGfx.drawDist, 'ultra');
  assert.equal(maxGfx.dprCap, 2);
  assert.deepEqual(maxGfx, BENCHMARK_STRESS_GRAPHICS);

  const fps60Fast = buildGraphicsProfile('fps_60', 72);
  assert.equal(fps60Fast.fpsLimit, 60);
  assert.equal(fps60Fast.shadows, 'high');
  assert.equal(fps60Fast.post, true);

  const fps60Mid = buildGraphicsProfile('fps_60', 44);
  assert.equal(fps60Mid.fpsLimit, 60);
  assert.equal(fps60Mid.shadows, 'medium');
  assert.equal(fps60Mid.dprCap, 1);

  const fps60Low = buildGraphicsProfile('fps_60', 26);
  assert.equal(fps60Low.fpsLimit, 60);
  assert.equal(fps60Low.shadows, 'low');
  assert.equal(fps60Low.post, false);
});

test('sampleBenchmarkCameraPose stays safely above arbitrary elevated terrain across full orbit', () => {
  const ridgeHeight = (x: number, z: number) => 12 + Math.sin(x * 0.04) * 5 + Math.cos(z * 0.04) * 5;
  for (let i = 0; i <= 20; i++) {
    const pose = sampleBenchmarkCameraPose(i / 20, ridgeHeight);
    const groundY = ridgeHeight(pose.x, pose.z);
    assert.ok(pose.y >= groundY + 6.4, `Camera height ${pose.y} must clear terrain ${groundY}`);
    assert.ok(Number.isFinite(pose.lookX) && Number.isFinite(pose.lookY) && Number.isFinite(pose.lookZ));
  }
});
