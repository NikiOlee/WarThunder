import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_VOICE_CUES,
  VOICE_ASSET_FILES,
  resolveAssetUrl,
  resolveVoiceAssetUrl,
  resolveVoiceCueForHit,
  resolveVoiceCueForMiss,
} from './voice.ts';

describe('voice asset URL resolution', () => {
  it('resolves all 11 attached mp3 files under root and subpath Vite bases', () => {
    assert.equal(ALL_VOICE_CUES.length, 11);
    const seenFiles = new Set<string>();
    for (const cue of ALL_VOICE_CUES) {
      const file = VOICE_ASSET_FILES[cue];
      assert.ok(file.startsWith('assets/aistudio/'));
      assert.ok(file.endsWith('.mp3'));
      assert.ok(!seenFiles.has(file), `duplicate asset file ${file}`);
      seenFiles.add(file);
      assert.equal(resolveVoiceAssetUrl(cue, '/'), `/${file}`);
      assert.equal(resolveVoiceAssetUrl(cue, '/WarThunder/'), `/WarThunder/${file}`);
      assert.equal(resolveVoiceAssetUrl(cue, '/WarThunder'), `/WarThunder/${file}`);
    }
    assert.equal(resolveAssetUrl('/assets/aistudio/test.mp3', '/sub/'), '/sub/assets/aistudio/test.mp3');
  });
});

describe('resolveVoiceCueForHit', () => {
  it('plays fuelExplosion on player fuel weakspot hit and destroy on other player kills', () => {
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isPlayerTarget: false,
        isMg: false,
        result: 'fuel',
        destroyed: true,
      }),
      'fuelExplosion',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isPlayerTarget: false,
        isMg: true,
        result: 'pen',
        destroyed: true,
      }),
      'destroy',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isPlayerTarget: false,
        isMg: false,
        result: 'pen',
        destroyed: true,
      }),
      'destroy',
    );
  });

  it('maps non-fatal player cannon hits to pen, nopen, ricochet, trackDamaged, and barrelDamaged', () => {
    for (const res of ['pen', 'crit']) {
      assert.equal(
        resolveVoiceCueForHit({
          isPlayerOwner: true,
          isPlayerTarget: false,
          isMg: false,
          result: res,
          destroyed: false,
        }),
        'pen',
      );
    }
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isPlayerTarget: false,
        isMg: false,
        result: 'nopen',
        destroyed: false,
      }),
      'nopen',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isPlayerTarget: false,
        isMg: false,
        result: 'ricochet',
        destroyed: false,
      }),
      'ricochet',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isPlayerTarget: false,
        isMg: false,
        result: 'track',
        destroyed: false,
      }),
      'trackDamaged',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isPlayerTarget: false,
        isMg: false,
        result: 'barrel',
        destroyed: false,
      }),
      'barrelDamaged',
    );
  });

  it('omits playerDeath on player destruction while mapping incoming enemy hits to weWereHit, module damage, nopen, and ricochet', () => {
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'pen',
        destroyed: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'fuel',
        destroyed: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: true,
        result: 'pen',
        destroyed: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'pen',
        destroyed: false,
      }),
      'weWereHit',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'crit',
        destroyed: false,
      }),
      'weWereHit',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'nopen',
        destroyed: false,
      }),
      'nopen',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'ricochet',
        destroyed: false,
      }),
      'ricochet',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'track',
        destroyed: false,
      }),
      'trackDamaged',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'barrel',
        destroyed: false,
      }),
      'barrelDamaged',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'fuel',
        destroyed: false,
      }),
      'fuelExplosion',
    );
  });

  it('ignores non-fatal MG shots, bot-vs-bot hits, self hits, and benchmark mode', () => {
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isPlayerTarget: false,
        isMg: true,
        result: 'pen',
        destroyed: false,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: true,
        result: 'pen',
        destroyed: false,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: false,
        isMg: false,
        result: 'pen',
        destroyed: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isPlayerTarget: true,
        isMg: false,
        result: 'crit',
        destroyed: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isPlayerTarget: true,
        isMg: false,
        result: 'pen',
        destroyed: true,
        isBenchmark: true,
      }),
      null,
    );
  });
});

describe('resolveVoiceCueForMiss', () => {
  it('returns miss for live player cannon misses and ignores suppressed, post-ricochet, MG, bot, dead, or benchmark events', () => {
    assert.equal(
      resolveVoiceCueForMiss({
        isPlayerOwner: true,
        isPlayerAlive: true,
      }),
      'miss',
    );
    assert.equal(
      resolveVoiceCueForMiss({
        isPlayerOwner: true,
        isPlayerAlive: true,
        hadTankImpact: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForMiss({
        isPlayerOwner: true,
        isPlayerAlive: true,
        suppressMissVoice: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForMiss({
        isPlayerOwner: true,
        isPlayerAlive: true,
        isMg: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForMiss({
        isPlayerOwner: true,
        isPlayerAlive: false,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForMiss({
        isPlayerOwner: false,
        isPlayerAlive: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForMiss({
        isPlayerOwner: true,
        isPlayerAlive: true,
        isBenchmark: true,
      }),
      null,
    );
  });
});
