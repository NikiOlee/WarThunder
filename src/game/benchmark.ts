import type { GameSettings } from './settings';

export type BenchmarkProfileId = 'max_fps' | 'max_gfx' | 'fps_60';

export const BENCHMARK_DURATION_SEC = 16;

export interface BenchmarkLiveStats {
  liveFps: number;
  frameTimeMs: number;
  avgFps: number;
  minFps: number;
  onePercentLowFps: number;
  frameCount: number;
}

export interface BenchmarkSummary {
  avgFps: number;
  minFps: number;
  maxFps: number;
  onePercentLowFps: number;
  avgFrameTimeMs: number;
  frameCount: number;
  durationSec: number;
  recommendedProfile: BenchmarkProfileId;
}

export const BENCHMARK_STRESS_GRAPHICS: Partial<GameSettings> = {
  fpsLimit: 0,
  shadows: 'ultra',
  shadowType: 'soft',
  post: true,
  bloom: 0.55,
  grass: 1,
  drawDist: 'ultra',
  resolution: 1,
  dprCap: 2,
  lodScale: 1.35,
  particles: 1.5,
  vignette: true,
  envReflections: true,
  colorSaturation: 1.06,
  exposureBias: 1.04,
};

export function recommendProfileForMetrics(avgFps: number, onePercentLowFps: number): BenchmarkProfileId {
  if (avgFps >= 58 && onePercentLowFps >= 42) return 'max_gfx';
  if (avgFps >= 36) return 'fps_60';
  return 'max_fps';
}

export function buildGraphicsProfile(
  profileId: BenchmarkProfileId,
  measuredAvgFps?: number,
): Partial<GameSettings> {
  if (profileId === 'max_fps') {
    return {
      fpsLimit: 0,
      shadows: 'off',
      shadowType: 'basic',
      post: false,
      bloom: 0,
      grass: 0,
      drawDist: 'low',
      resolution: 0.6,
      dprCap: 1,
      lodScale: 0.6,
      particles: 0.35,
      vignette: false,
      envReflections: false,
      colorSaturation: 1,
      exposureBias: 1,
    };
  }
  if (profileId === 'max_gfx') {
    return { ...BENCHMARK_STRESS_GRAPHICS };
  }

  // 'fps_60': lock frame cap at 60 FPS and calibrate visual settings to match hardware capability
  if (measuredAvgFps === undefined || measuredAvgFps >= 58) {
    return {
      fpsLimit: 60,
      shadows: 'high',
      shadowType: 'soft',
      post: true,
      bloom: 0.45,
      grass: 1,
      drawDist: 'high',
      resolution: 1,
      dprCap: 1.5,
      lodScale: 1.1,
      particles: 1,
      vignette: true,
      envReflections: true,
      colorSaturation: 1.02,
      exposureBias: 1,
    };
  }
  if (measuredAvgFps >= 38) {
    return {
      fpsLimit: 60,
      shadows: 'medium',
      shadowType: 'pcf',
      post: true,
      bloom: 0.3,
      grass: 0.6,
      drawDist: 'medium',
      resolution: 0.85,
      dprCap: 1,
      lodScale: 0.85,
      particles: 0.75,
      vignette: true,
      envReflections: true,
      colorSaturation: 1,
      exposureBias: 1,
    };
  }
  return {
    fpsLimit: 60,
    shadows: 'low',
    shadowType: 'basic',
    post: false,
    bloom: 0,
    grass: 0.25,
    drawDist: 'medium',
    resolution: 0.75,
    dprCap: 1,
    lodScale: 0.75,
    particles: 0.5,
    vignette: false,
    envReflections: false,
    colorSaturation: 1,
    exposureBias: 1,
  };
}

export class BenchmarkCollector {
  private frameTimesMs: number[] = [];
  private recentMs: number[] = [];
  private totalMs = 0;
  private maxFrameMs = 0;
  private minFrameMs = Infinity;

  reset(): void {
    this.frameTimesMs.length = 0;
    this.recentMs.length = 0;
    this.totalMs = 0;
    this.maxFrameMs = 0;
    this.minFrameMs = Infinity;
  }

  recordFrame(rawDtSec: number): void {
    if (!Number.isFinite(rawDtSec) || rawDtSec <= 0) return;
    const ms = Math.min(250, Math.max(0.5, rawDtSec * 1000));
    this.frameTimesMs.push(ms);
    this.recentMs.push(ms);
    if (this.recentMs.length > 20) this.recentMs.shift();
    this.totalMs += ms;
    if (ms > this.maxFrameMs) this.maxFrameMs = ms;
    if (ms < this.minFrameMs) this.minFrameMs = ms;
  }

  private computeOnePercentLow(): number {
    const n = this.frameTimesMs.length;
    if (n === 0) return 0;
    const sorted = this.frameTimesMs.slice().sort((a, b) => b - a);
    const tailCount = Math.max(1, Math.ceil(n * 0.01));
    let tailSum = 0;
    for (let i = 0; i < tailCount; i++) tailSum += sorted[i];
    const tailMean = tailSum / tailCount;
    return tailMean > 0 ? Math.round(1000 / tailMean) : 0;
  }

  getLiveStats(): BenchmarkLiveStats {
    const n = this.frameTimesMs.length;
    if (n === 0) {
      return {
        liveFps: 0,
        frameTimeMs: 0,
        avgFps: 0,
        minFps: 0,
        onePercentLowFps: 0,
        frameCount: 0,
      };
    }
    let recentSum = 0;
    for (let i = 0; i < this.recentMs.length; i++) recentSum += this.recentMs[i];
    const recentMean = recentSum / Math.max(1, this.recentMs.length);
    const overallMean = this.totalMs / n;
    return {
      liveFps: Math.round(1000 / recentMean),
      frameTimeMs: Number(recentMean.toFixed(1)),
      avgFps: Math.round(1000 / overallMean),
      minFps: this.maxFrameMs > 0 ? Math.round(1000 / this.maxFrameMs) : 0,
      onePercentLowFps: this.computeOnePercentLow(),
      frameCount: n,
    };
  }

  finalize(durationSec: number): BenchmarkSummary {
    const n = this.frameTimesMs.length;
    if (n === 0) {
      return {
        avgFps: 0,
        minFps: 0,
        maxFps: 0,
        onePercentLowFps: 0,
        avgFrameTimeMs: 0,
        frameCount: 0,
        durationSec,
        recommendedProfile: 'fps_60',
      };
    }
    const meanMs = this.totalMs / n;
    const avgFps = Math.round(1000 / meanMs);
    const minFps = Math.round(1000 / this.maxFrameMs);
    const maxFps = Math.round(1000 / this.minFrameMs);
    const onePercentLowFps = this.computeOnePercentLow();
    return {
      avgFps,
      minFps,
      maxFps,
      onePercentLowFps,
      avgFrameTimeMs: Number(meanMs.toFixed(1)),
      frameCount: n,
      durationSec,
      recommendedProfile: recommendProfileForMetrics(avgFps, onePercentLowFps),
    };
  }
}

export interface BenchmarkCameraPose {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

/**
 * Generates a smooth, collision-safe cinematic flyby orbit sweeping across the
 * tank combat arena, hills, foliage, and central skirmish zone.
 */
export function sampleBenchmarkCameraPose(
  progress01: number,
  heightAt: (x: number, z: number) => number,
): BenchmarkCameraPose {
  const t = Math.min(1, Math.max(0, progress01));
  const angle = t * Math.PI * 2 + 0.35;
  const rx = 74 + Math.sin(t * Math.PI * 2 * 2) * 26;
  const rz = 92 + Math.cos(t * Math.PI * 2) * 22;
  const x = Math.sin(angle) * rx;
  const z = Math.cos(angle) * rz;

  const groundCam = heightAt(x, z);
  const waveHeight = 14 + Math.sin(t * Math.PI * 2 * 1.5 + 0.4) * 7.5;
  const y = Math.max(groundCam + 6.5, groundCam + waveHeight);

  const lookX = Math.sin(angle + 1.25) * 22;
  const lookZ = Math.cos(angle + 0.9) * 26;
  const lookGround = heightAt(lookX, lookZ);
  const lookY = lookGround + 3.2;

  return { x, y, z, lookX, lookY, lookZ };
}
