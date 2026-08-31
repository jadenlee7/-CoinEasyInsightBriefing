import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertTtsDuration,
  buildNarration,
  sceneForTime,
  voiceCut,
} from './youtube-editorial-copy.js';
import {
  assertYouTubeCredentials,
  buildVideoMetadata,
  uploadOnce,
} from './youtube-uploader-new.js';

const payload = {
  editorial: {
    headline: '원화 스테이블코인 제도화',
    factTitle: '금융위가 제도 방향을 공개',
    fact: '발행자 요건과 이용자 보호가 핵심입니다',
    verdict: '방향은 나왔지만 세부 조건은 미확정입니다',
    action: '원문과 시행일을 확인하세요',
    sourceLabel: 'fsc.go.kr',
    sourceUrl: 'https://fsc.go.kr/example',
    sourceUrls: ['https://fsc.go.kr/example', 'https://example.com/btc', 'https://example.com/kimp', 'https://example.com/fear'],
    sourceCta: '공식 출처와 Telegram에서 확인하세요',
    marketContext: 'BTC·김프·공포탐욕을 함께 확인합니다',
    voiceoverKo: '발행자 요건과 이용자 보호가 핵심입니다. 원문과 시행일을 확인하세요. 출처는 fsc.go.kr입니다.',
  },
  article: {
    slug: '2026-08-04-stablecoin',
    packSha256: 'b'.repeat(64),
    canonicalNaverUrl: 'https://blog.naver.com/coineasy/223999999999',
  },
  youtube: {
    duration_seconds: 32,
    metrics: [
      { label: 'BTC', value: '$63,500', as_of: '2026-08-04T09:00:00Z', source_url: 'https://example.com/btc' },
      { label: '김치프리미엄', value: '-0.3%', as_of: '2026-08-04T09:00:00Z', source_url: 'https://example.com/kimp' },
      { label: '공포탐욕', value: '28', as_of: '2026-08-04T00:00:00Z', source_url: 'https://example.com/fear' },
    ],
  },
  texts: {
    btc_price: '$63,500', btc_change: '+0.2%',
    fear_value: '28', fear_label: 'Fear', kimchi_premium: '-0.3%',
  },
};

test('scene timeline covers six editorial beats', () => {
  assert.deepEqual([0, 4, 10, 16, 22, 28].map(sceneForTime), [0, 1, 2, 3, 4, 5]);
});

test('editorial header uses the official transparent Main Orange wordmark', async () => {
  const generator = await readFile(
    new URL('./youtube-editorial-generator.js', import.meta.url),
    'utf8',
  );
  const logo = await readFile(
    new URL('../../../coineasy_brand/assets/brand/figma-main-orange-logo.svg', import.meta.url),
  );

  assert.match(generator, /loadImage\(path\.join\(BRAND_ASSET_DIR, 'figma-main-orange-logo\.svg'\)\)/);
  assert.doesNotMatch(generator, /loadImage\(path\.join\(BRAND_ASSET_DIR, 'logo_ink\.png'\)\)/);
  assert.equal(
    createHash('sha256').update(logo).digest('hex'),
    '69a1aace1a426cfe25398806a41a9e3f600b22f1001b126043255d99f5183394',
  );
});

test('narration includes evidence, action and source', () => {
  const narration = buildNarration(payload);
  assert.equal(narration, payload.editorial.voiceoverKo);
  assert.match(narration, /발행자 요건/);
  assert.match(narration, /시행일/);
  assert.match(narration, /fsc\.go\.kr/);
  assert.ok(narration.length <= 210);
});

test('voiceCut keeps spoken copy inside its beat', () => {
  assert.equal(voiceCut('아주 긴 설명을 내레이션에서는 짧게 정리합니다', 16).length, 16);
});

test('YouTube metadata leads with the topic and includes source', () => {
  const meta = buildVideoMetadata(payload, new Date('2026-08-04T09:05:00Z'));
  assert.match(meta.snippet.title, /^원화 스테이블코인/);
  assert.match(meta.snippet.description, /https:\/\/fsc\.go\.kr\/example/);
  assert.match(meta.snippet.description, /https:\/\/blog\.naver\.com\/coineasy/);
  assert.match(meta.snippet.description, /투자·법률·세무 자문이 아닙니다/);
});

test('TTS is mandatory and must finish within 30 seconds', () => {
  assert.equal(assertTtsDuration(29.999), 29.999);
  assert.throws(() => assertTtsDuration(30.001), /30초를 초과/);
  assert.throws(() => assertTtsDuration(0), /확인할 수 없습니다/);
  assert.throws(() => buildNarration({ editorial: {} }), /voiceover_ko/);
});

test('YouTube credentials require all explicit OAuth values', () => {
  assert.throws(() => assertYouTubeCredentials({}), /YT_CLIENT_ID/);
  assert.equal(assertYouTubeCredentials({
    YT_CLIENT_ID: 'id', YT_CLIENT_SECRET: 'secret', YT_REFRESH_TOKEN: 'refresh',
    YT_PRIVACY_STATUS: 'unlisted',
    COINEASY_YT_CHANNEL_ID: 'UC' + 'a'.repeat(22),
  }), true);
  assert.throws(() => assertYouTubeCredentials({
    YT_CLIENT_ID: 'id', YT_CLIENT_SECRET: 'secret', YT_REFRESH_TOKEN: 'refresh',
  }), /YT_PRIVACY_STATUS/);
});

test('uploader calls videos.insert exactly once and returns video identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'coineasy-upload-once-'));
  const videoPath = path.join(dir, 'short.mp4');
  await writeFile(videoPath, Buffer.from('not-empty'));
  let calls = 0;
  const youtube = {
    videos: {
      async insert(request) {
        calls += 1;
        assert.deepEqual(request.part, ['snippet', 'status']);
        return { data: { id: 'Only_One-01' } };
      },
    },
  };
  try {
    const result = await uploadOnce(youtube, videoPath, buildVideoMetadata(payload));
    assert.equal(calls, 1);
    assert.deepEqual(result, {
      videoId: 'Only_One-01',
      videoUrl: 'https://www.youtube.com/shorts/Only_One-01',
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('uploader does not retry an uncertain external failure', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'coineasy-upload-error-'));
  const videoPath = path.join(dir, 'short.mp4');
  await writeFile(videoPath, Buffer.from('not-empty'));
  let calls = 0;
  const youtube = { videos: { async insert() { calls += 1; throw new Error('ECONNRESET'); } } };
  try {
    await assert.rejects(() => uploadOnce(youtube, videoPath, buildVideoMetadata(payload)), /ECONNRESET/);
    assert.equal(calls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
