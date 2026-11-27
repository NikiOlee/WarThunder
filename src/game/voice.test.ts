import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_VOICE_CUES,
  VOICE_ASSET_FILES,
  resolveAssetUrl,
  resolveVoiceAssetUrl,
  resolveVoiceCueForHit,
} from './voice.ts';

describe('voice asset URL resolution', () => {
  it('resolves all 5 attached mp3 files under root and subpath Vite bases', () => {
    assert.equal(ALL_VOICE_CUES.length, 5);
    for (const cue of ALL_VOICE_CUES) {
      assert.ok(VOICE_ASSET_FILES[cue].startsWith('assets/aistudio/'));
      assert.ok(VOICE_ASSET_FILES[cue].endsWith('.mp3'));
      assert.equal(resolveVoiceAssetUrl(cue, '/'), `/${VOICE_ASSET_FILES[cue]}`);
      assert.equal(resolveVoiceAssetUrl(cue, '/WarThunder/'), `/WarThunder/${VOICE_ASSET_FILES[cue]}`);
      assert.equal(resolveVoiceAssetUrl(cue, '/WarThunder'), `/WarThunder/${VOICE_ASSET_FILES[cue]}`);
    }
    assert.equal(resolveAssetUrl('/assets/aistudio/test.mp3', '/sub/'), '/sub/assets/aistudio/test.mp3');
  });
});

describe('resolveVoiceCueForHit', () => {
  it('returns destroy when enemy target is destroyed by player cannon or MG', () => {
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isSelfTarget: false,
        isMg: false,
        result: 'fuel',
        destroyed: true,
      }),
      'destroy',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isSelfTarget: false,
        isMg: true,
        result: 'pen',
        destroyed: true,
      }),
      'destroy',
    );
  });

  it('maps non-fatal player cannon hit results to pen, nopen, or ricochet', () => {
    for (const res of ['pen', 'crit', 'track', 'barrel', 'fuel']) {
      assert.equal(
        resolveVoiceCueForHit({
          isPlayerOwner: true,
          isSelfTarget: false,
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
        isSelfTarget: false,
        isMg: false,
        result: 'nopen',
        destroyed: false,
      }),
      'nopen',
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isSelfTarget: false,
        isMg: false,
        result: 'ricochet',
        destroyed: false,
      }),
      'ricochet',
    );
  });

  it('ignores non-fatal MG shots, AI shots, self hits, and benchmark mode', () => {
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isSelfTarget: false,
        isMg: true,
        result: 'pen',
        destroyed: false,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: false,
        isSelfTarget: false,
        isMg: false,
        result: 'pen',
        destroyed: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isSelfTarget: true,
        isMg: false,
        result: 'crit',
        destroyed: true,
      }),
      null,
    );
    assert.equal(
      resolveVoiceCueForHit({
        isPlayerOwner: true,
        isSelfTarget: false,
        isMg: false,
        result: 'pen',
        destroyed: false,
        isBenchmark: true,
      }),
      null,
    );
  });
});
