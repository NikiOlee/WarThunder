import * as THREE from 'three';

export type TankLodTier = 'high' | 'medium' | 'low' | 'culled';
export type TreeLodTier = 'high' | 'low' | 'culled';
export type BuildingLodTier = 'high' | 'low' | 'culled';

export interface VisibilityStats {
  visibleTanks: number;
  culledTanks: number;
  lowLodTanks: number;
  medLodTanks: number;
  visibleSectors: number;
  culledSectors: number;
}

const _projScreenMatrix = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
const _camPos = new THREE.Vector3();

/**
 * Pure zoom-compensated effective distance for LOD transitions.
 * Narrower FOV (sniper/binoculars) proportionally pulls distant objects into higher detail tiers.
 */
export function computeFovScale(fovDeg: number): number {
  return Math.max(0.06, Math.min(1.25, fovDeg / 55));
}

export function resolveTankLod(inFrustum: boolean, effectiveDist: number, maxRenderDist = 1150): TankLodTier {
  if (!inFrustum || effectiveDist > maxRenderDist) return 'culled';
  if (effectiveDist < 95) return 'high';
  if (effectiveDist < 190) return 'medium';
  return 'low';
}

export function resolveTreeLod(inFrustum: boolean, effectiveDist: number): TreeLodTier {
  if (!inFrustum || effectiveDist > 540) return 'culled';
  if (effectiveDist < 185) return 'high';
  return 'low';
}

export function resolveBuildingLod(inFrustum: boolean, effectiveDist: number): BuildingLodTier {
  if (!inFrustum || effectiveDist > 920) return 'culled';
  if (effectiveDist < 255) return 'high';
  return 'low';
}

export function sectorIndexFor(x: number, z: number, worldHalf: number, gridSize: number): number {
  const span = worldHalf * 2;
  const gx = Math.min(gridSize - 1, Math.max(0, Math.floor(((x + worldHalf) / span) * gridSize)));
  const gz = Math.min(gridSize - 1, Math.max(0, Math.floor(((z + worldHalf) / span) * gridSize)));
  return gz * gridSize + gx;
}

export class VisibilityController {
  fovScale = 1;
  lodScale = 1;
  readonly camPos = new THREE.Vector3();
  readonly stats: VisibilityStats = {
    visibleTanks: 0,
    culledTanks: 0,
    lowLodTanks: 0,
    medLodTanks: 0,
    visibleSectors: 0,
    culledSectors: 0,
  };

  setLodScale(scale: number): void {
    this.lodScale = Number.isFinite(scale) ? Math.max(0.4, Math.min(1.8, scale)) : 1;
  }

  updateFromCamera(camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);
    this.camPos.copy(camera.position);
    _camPos.copy(camera.position);
    this.fovScale = computeFovScale(camera.fov);
    this.stats.visibleTanks = 0;
    this.stats.culledTanks = 0;
    this.stats.lowLodTanks = 0;
    this.stats.medLodTanks = 0;
    this.stats.visibleSectors = 0;
    this.stats.culledSectors = 0;
  }

  isSphereVisible(x: number, y: number, z: number, radius: number): boolean {
    _sphere.center.set(x, y, z);
    _sphere.radius = radius;
    return _frustum.intersectsSphere(_sphere);
  }

  isBoxVisible(box: THREE.Box3): boolean {
    return _frustum.intersectsBox(box);
  }

  distanceTo(x: number, y: number, z: number): number {
    const dx = x - _camPos.x;
    const dy = y - _camPos.y;
    const dz = z - _camPos.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  effectiveDistanceTo(x: number, y: number, z: number): number {
    return (this.distanceTo(x, y, z) * this.fovScale) / this.lodScale;
  }

  boxEffectiveDistance(box: THREE.Box3): number {
    const cx = (box.min.x + box.max.x) * 0.5;
    const cy = (box.min.y + box.max.y) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;
    const dx = Math.max(0, Math.abs(_camPos.x - cx) - (box.max.x - box.min.x) * 0.5);
    const dy = Math.max(0, Math.abs(_camPos.y - cy) - (box.max.y - box.min.y) * 0.5);
    const dz = Math.max(0, Math.abs(_camPos.z - cz) - (box.max.z - box.min.z) * 0.5);
    return (Math.sqrt(dx * dx + dy * dy + dz * dz) * this.fovScale) / this.lodScale;
  }
}
