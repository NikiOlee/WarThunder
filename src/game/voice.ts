export type VoiceCueId =
  | 'pen'
  | 'nopen'
  | 'ricochet'
  | 'destroy'
  | 'skyEaster'
  | 'fuelExplosion'
  | 'trackDamaged'
  | 'miss'
  | 'weWereHit'
  | 'playerDeath'
  | 'barrelDamaged';

export const VOICE_ASSET_FILES: Record<VoiceCueId, string> = {
  pen: 'assets/aistudio/_______________7aea75d7.mp3',
  nopen: 'assets/aistudio/_____________ce0cc293.mp3',
  ricochet: 'assets/aistudio/________5c0da93c.mp3',
  destroy: 'assets/aistudio/________________02a2ec0a.mp3',
  skyEaster: 'assets/aistudio/__________________________________8d242bda.mp3',
  fuelExplosion: 'assets/aistudio/_________________d392ba4d.mp3',
  trackDamaged: 'assets/aistudio/____________________2c1a54d0.mp3',
  miss: 'assets/aistudio/_____46d25dca.mp3',
  weWereHit: 'assets/aistudio/_____________dff064b6.mp3',
  playerDeath: 'assets/aistudio/___c8173ae0.mp3',
  barrelDamaged: 'assets/aistudio/________________c0c5ae89.mp3',
};

export const ALL_VOICE_CUES: ReadonlyArray<VoiceCueId> = [
  'pen',
  'nopen',
  'ricochet',
  'destroy',
  'skyEaster',
  'fuelExplosion',
  'trackDamaged',
  'miss',
  'weWereHit',
  'playerDeath',
  'barrelDamaged',
];

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
  isPlayerTarget: boolean;
  isMg: boolean;
  result: string;
  destroyed: boolean;
  isBenchmark?: boolean;
}

export interface VoiceMissContext {
  isPlayerOwner: boolean;
  isPlayerAlive: boolean;
  isMg?: boolean;
  hadTankImpact?: boolean;
  suppressMissVoice?: boolean;
  isBenchmark?: boolean;
}

/**
 * Selects which crew voiceover line (if any) should play for a tank hit event.
 * Handles both player attacks on enemies and incoming enemy hits on the player,
 * while ignoring benchmark mode, self-hits, bot-vs-bot chatter, and non-fatal MG plinks.
 */
export function resolveVoiceCueForHit(ctx: VoiceHitContext): VoiceCueId | null {
  if (ctx.isBenchmark) return null;
  if (ctx.isPlayerOwner && ctx.isPlayerTarget) return null;

  if (ctx.isPlayerTarget) {
    if (ctx.destroyed) return null;
    if (ctx.isMg) return null;
    switch (ctx.result) {
      case 'ricochet':
        return 'ricochet';
      case 'nopen':
        return 'nopen';
      case 'track':
        return 'trackDamaged';
      case 'barrel':
        return 'barrelDamaged';
      case 'fuel':
        return 'fuelExplosion';
      case 'pen':
      case 'crit':
        return 'weWereHit';
      default:
        return null;
    }
  }

  if (ctx.isPlayerOwner) {
    if (ctx.result === 'fuel') return 'fuelExplosion';
    if (ctx.destroyed) return 'destroy';
    if (ctx.isMg) return null;
    switch (ctx.result) {
      case 'ricochet':
        return 'ricochet';
      case 'nopen':
        return 'nopen';
      case 'track':
        return 'trackDamaged';
      case 'barrel':
        return 'barrelDamaged';
      case 'pen':
      case 'crit':
        return 'pen';
      default:
        return null;
    }
  }

  return null;
}

/**
 * Selects the miss voiceover when a player's cannon shell hits terrain/obstacles
 * or expires without striking any tank (excluding sky easter-egg shots and post-ricochet bounces).
 */
export function resolveVoiceCueForMiss(ctx: VoiceMissContext): VoiceCueId | null {
  if (
    ctx.isBenchmark ||
    !ctx.isPlayerOwner ||
    !ctx.isPlayerAlive ||
    ctx.isMg ||
    ctx.hadTankImpact ||
    ctx.suppressMissVoice
  ) {
    return null;
  }
  return 'miss';
}
