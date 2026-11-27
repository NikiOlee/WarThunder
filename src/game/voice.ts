export type VoiceCueId = 'pen' | 'nopen' | 'ricochet' | 'destroy' | 'skyEaster';

export const VOICE_ASSET_FILES: Record<VoiceCueId, string> = {
  pen: 'assets/aistudio/_______________7aea75d7.mp3',
  nopen: 'assets/aistudio/_____________ce0cc293.mp3',
  ricochet: 'assets/aistudio/________5c0da93c.mp3',
  destroy: 'assets/aistudio/________________02a2ec0a.mp3',
  skyEaster: 'assets/aistudio/__________________________________8d242bda.mp3',
};

export const ALL_VOICE_CUES: ReadonlyArray<VoiceCueId> = ['pen', 'nopen', 'ricochet', 'destroy', 'skyEaster'];

export function resolveAssetUrl(relativePath: string, baseUrl?: string): string {
  const envBase = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL;
  const rawBase = baseUrl !== undefined ? baseUrl : envBase || '/';
  const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const cleanRel = relativePath.replace(/^\/+/, '');
  return `${normalizedBase}${cleanRel}`;
}

export function resolveVoiceAssetUrl(cue: VoiceCueId, baseUrl?: string): string {
  return resolveAssetUrl(VOICE_ASSET_FILES[cue], baseUrl);
}

export interface VoiceHitContext {
  isPlayerOwner: boolean;
  isSelfTarget: boolean;
  isMg: boolean;
  result: string;
  destroyed: boolean;
  isBenchmark?: boolean;
}

/**
 * Selects which crew voiceover line (if any) should play for a tank hit event.
 * Prioritizes target destruction over penetration, excludes self/non-player hits,
 * benchmark simulations, and non-fatal machine-gun plinks.
 */
export function resolveVoiceCueForHit(ctx: VoiceHitContext): VoiceCueId | null {
  if (ctx.isBenchmark || !ctx.isPlayerOwner || ctx.isSelfTarget) return null;
  if (ctx.destroyed) return 'destroy';
  if (ctx.isMg) return null;
  switch (ctx.result) {
    case 'ricochet':
      return 'ricochet';
    case 'nopen':
      return 'nopen';
    case 'pen':
    case 'crit':
    case 'track':
    case 'barrel':
    case 'fuel':
      return 'pen';
    default:
      return null;
  }
}
