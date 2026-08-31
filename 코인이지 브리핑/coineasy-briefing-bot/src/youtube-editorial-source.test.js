import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APPROVED_QUEUE_POLICY,
  ARTICLE_SLOT_KST,
  CLAIM_PREFIX,
  HANDOFF_PREFIX,
  RECEIPT_PREFIX,
  buildEditorialFromHandoff,
  calculateHandoffSignature,
  canonicalJson,
  isApprovedQueuePolicy,
  isArticleUploadWindow,
  isExplicitYouTubeOwner,
  kstDate,
  loadApprovedArticleHandoff,
  openDailyUploadGuard,
  validateApprovedArticleHandoff,
  verifyHandoffSignature,
} from './youtube-editorial-source.js';

const INDEX_SOURCE = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const SECRET = 'test-only-handoff-secret';
const DATE = '2026-08-31';
const NOW = new Date('2026-08-31T09:05:00Z');
const VOICE_SEGMENTS = ['스테이블코인에서 볼 것은요.', '발행자와 보호 요건입니다.', '조건은 아직 확정이 아닙니다.', '시장 수치도 기준 시각을 보세요.', '오늘은 법안 원문을 확인하세요.', ''];
const VERIFIED_VIDEO = {
  videoId: 'Video_Id-12', videoUrl: 'https://www.youtube.com/shorts/Video_Id-12',
  verification: { channelId: `UC${'a'.repeat(22)}`, privacyStatus: 'public',
    uploadStatus: 'processed', processingStatus: 'succeeded', readbackVerified: true,
    publicStateVerified: true, method: 'youtube.videos.list', verifiedAt: '2026-08-31T09:07:00Z' },
};

function signedHandoff(overrides = {}) {
  const base = {
    schema_version: 1,
    state: 'approved_published',
    date_kst: DATE,
    publish_time_kst: '18:05',
    repository: 'jadenlee7/easyfarm',
    source_sha: 'a'.repeat(40),
    pack_path: `research/packs/${DATE}-stablecoin-checklist.json`,
    slug: `${DATE}-stablecoin-checklist`,
    pack_sha256: 'b'.repeat(64),
    approval_mode: 'telegram',
    canonical_naver_url: 'https://blog.naver.com/coineasy/223999999999',
    issued_at: '2026-08-31T08:00:00.000Z',
    youtube: {
      enabled: true,
      duration_seconds: 32,
      scenes: [
        { kind: 'headline', text: '원화 스테이블코인, 지금 확인할 것' },
        { kind: 'verified_fact', text: '발행자 요건과 이용자 보호가 핵심입니다.' },
        { kind: 'why_it_matters', text: '세부 요건은 아직 확정되지 않았습니다.' },
        { kind: 'market_context', text: 'BTC·김치프리미엄·공포탐욕을 함께 봅니다.' },
        { kind: 'action', text: '법안 원문과 시행일을 확인하세요.' },
        { kind: 'source_cta', text: '공식 출처와 CoinEasy Telegram에서 확인하세요.' },
      ],
      voiceover_ko: VOICE_SEGMENTS.filter(Boolean).join(' '),
      voiceover_segments_ko: [...VOICE_SEGMENTS],
      source_urls: [
        'https://www.fsc.go.kr/example',
        'https://api.exchange.example/btc',
        'https://api.exchange.example/kimp',
        'https://api.index.example/fear',
      ],
      metrics: [
        { label: 'BTC', value: '$63,500', as_of: '2026-08-31T08:00:00Z', source_url: 'https://api.exchange.example/btc' },
        { label: '김치프리미엄', value: '-0.3%', as_of: '2026-08-31T08:00:00Z', source_url: 'https://api.exchange.example/kimp' },
        { label: '공포탐욕', value: '28', as_of: '2026-08-31T08:00:00Z', source_url: 'https://api.index.example/fear' },
      ],
    },
    ...overrides,
  };
  base.signature = calculateHandoffSignature(base, SECRET);
  return base;
}

class FakeRedis {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
    this.setCalls = [];
    this.getCalls = [];
  }

  async get(key) {
    this.getCalls.push(key);
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async set(key, value, ...args) {
    this.setCalls.push([key, value, ...args]);
    if (args.includes('NX') && this.values.has(key)) return null;
    this.values.set(key, value);
    return 'OK';
  }

  async quit() {}
  disconnect() {}
}

test('kstDate uses Korea time across UTC midnight', () => {
  assert.equal(kstDate(new Date('2026-08-30T16:30:00Z')), DATE);
});

test('canonical JSON and HMAC are stable regardless of object key insertion order', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
  const handoff = signedHandoff();
  assert.equal(verifyHandoffSignature(handoff, SECRET), true);
  assert.equal(verifyHandoffSignature({ ...handoff, slug: `${DATE}-tampered` }, SECRET), false);
});

test('HMAC uses the exact raw UTF-8 secret without trimming whitespace', () => {
  const secret = '  exact shared secret  ';
  const handoff = signedHandoff();
  handoff.signature = calculateHandoffSignature(handoff, secret);
  assert.equal(verifyHandoffSignature(handoff, secret), true);
  assert.equal(verifyHandoffSignature(handoff, secret.trim()), false);
});

test('cross-language HMAC vector matches the EasyFarm producer', () => {
  assert.equal(
    calculateHandoffSignature({ z: 1, a: '한글' }, '  spaced shared secret  '),
    'bbade49097566e63db749105a4d6a8a299879eec6eae3025c3565ce027488e72',
  );
});

test('strict handoff validation and mapping use only exact approved scenes and metrics', () => {
  const handoff = signedHandoff();
  assert.equal(validateApprovedArticleHandoff(handoff, DATE, SECRET, NOW), handoff);
  const payload = buildEditorialFromHandoff(handoff);
  assert.equal(payload.editorial.headline, handoff.youtube.scenes[0].text);
  assert.equal(payload.editorial.fact, handoff.youtube.scenes[1].text);
  assert.equal(payload.editorial.voiceoverKo, handoff.youtube.voiceover_ko);
  assert.deepEqual(payload.editorial.voiceoverSegmentsKo, handoff.youtube.voiceover_segments_ko);
  assert.equal(payload.texts.btc_price, '$63,500');
  assert.equal(payload.texts.kimchi_premium, '-0.3%');
  assert.equal(payload.texts.fear_value, '28');
  assert.equal(payload.texts.fear_as_of, handoff.youtube.metrics[2].as_of);
  assert.equal(payload.texts.fear_label, undefined);
  assert.equal(payload.texts.btc_change, undefined);
  assert.equal(payload.article.canonicalNaverUrl, handoff.canonical_naver_url);
});

test('handoff rejects reordered scenes, incomplete metrics, wrong date and non-Naver canonical URL', () => {
  const base = signedHandoff();
  for (const mutate of [
    (value) => { [value.youtube.scenes[0], value.youtube.scenes[1]] = [value.youtube.scenes[1], value.youtube.scenes[0]]; },
    (value) => { value.youtube.metrics.pop(); },
    (value) => { value.youtube.enabled = false; },
    (value) => { value.date_kst = '2026-08-30'; },
    (value) => { value.canonical_naver_url = 'https://example.com/post'; },
    (value) => { value.youtube.scenes[0].unreviewed_extra = 'drift'; },
    (value) => { value.youtube.metrics[0].unreviewed_extra = 'drift'; },
    (value) => { value.youtube.unreviewed_extra = 'drift'; },
    (value) => { value.unreviewed_extra = 'drift'; },
  ]) {
    const value = structuredClone(base);
    mutate(value);
    value.signature = calculateHandoffSignature(value, SECRET);
    assert.throws(() => validateApprovedArticleHandoff(value, DATE, SECRET, NOW));
  }
});

test('placeholder, out-of-range and ambiguous market values fail closed', () => {
  for (const [index, values] of [
    [0, ['미확보', '$0', '$-1', '100,000달러', '$1,23', '$01', '$1.234', 'NaN', 63500]],
    [1, ['미확보', '-100%', '-101%', '1.2', '01%', 'Infinity%', null]],
    [2, ['확인 중', '-1', '101', '50.5', '중립 50', '01', 50]],
  ]) {
    for (const invalid of values) {
      const value = signedHandoff();
      value.youtube.metrics[index].value = invalid;
      value.signature = calculateHandoffSignature(value, SECRET);
      assert.throws(() => validateApprovedArticleHandoff(value, DATE, SECRET, NOW));
    }
  }
});

test('metric timestamps need valid calendar, exact day, no future and bounded age', () => {
  for (const invalid of ['2026-08-31', '2026-08-31T08:00:00', '2026-08-31T08:00Z',
    '2026-02-30T08:00:00Z', '2026-08-31T24:00:00Z', '2026-08-31T08:00:00+24:00',
    '2026-08-31T08:00:01Z', '2026-08-31T03:04:59Z', '2026-08-30T00:00:00Z']) {
    const value = signedHandoff();
    value.youtube.metrics[0].as_of = invalid;
    value.signature = calculateHandoffSignature(value, SECRET);
    assert.throws(() => validateApprovedArticleHandoff(value, DATE, SECRET, NOW), invalid);
  }
  const boundary = signedHandoff();
  boundary.youtube.metrics[0].as_of = '2026-08-31T03:05:00Z';
  boundary.signature = calculateHandoffSignature(boundary, SECRET);
  assert.equal(validateApprovedArticleHandoff(boundary, DATE, SECRET, NOW), boundary);
  assert.throws(() => validateApprovedArticleHandoff(boundary, DATE, SECRET, new Date('2026-08-31T09:05:00.001Z')));
  assert.throws(() => validateApprovedArticleHandoff(signedHandoff(), DATE, SECRET, new Date('2026-08-31T07:59:59Z')));
  assert.throws(() => validateApprovedArticleHandoff(signedHandoff(), DATE, SECRET, new Date('2026-09-01T09:05:00Z')));
});

test('per-scene approved narration cannot be missing, rewritten, overflowing or speak over CTA', () => {
  for (const mutate of [
    (value) => { delete value.youtube.voiceover_segments_ko; },
    (value) => { value.youtube.voiceover_segments_ko.pop(); },
    (value) => { value.youtube.voiceover_segments_ko[0] = ''; },
    (value) => { value.youtube.voiceover_segments_ko[1] = '새 승인 없는 다른 내용'; },
    (value) => { value.youtube.voiceover_segments_ko[0] = '가'.repeat(33); },
    (value) => { value.youtube.voiceover_segments_ko[5] = '구독하세요'; },
  ]) {
    const value = signedHandoff();
    mutate(value);
    value.signature = calculateHandoffSignature(value, SECRET);
    assert.throws(() => validateApprovedArticleHandoff(value, DATE, SECRET, NOW));
  }
});

test('loader reads only the exact signed date key and does not invent a fallback', async () => {
  const handoff = signedHandoff();
  const redis = new FakeRedis({ [`${HANDOFF_PREFIX}${DATE}`]: JSON.stringify(handoff) });
  const loaded = await loadApprovedArticleHandoff(new Date('2026-08-31T09:05:00Z'), {
    redisFactory: () => redis,
    secret: SECRET,
  });
  assert.deepEqual(redis.getCalls, [`${HANDOFF_PREFIX}${DATE}`]);
  assert.equal(loaded.handoff.slug, handoff.slug);
  assert.equal(loaded.payload.article.packSha256, handoff.pack_sha256);

  const empty = new FakeRedis();
  const missing = await loadApprovedArticleHandoff(new Date('2026-08-31T09:05:00Z'), {
    redisFactory: () => empty,
    secret: SECRET,
  });
  assert.equal(missing.handoff, null);
  assert.equal(missing.payload, null);
});

test('owner and separated-slot queue policy require explicit exact environment values', () => {
  assert.equal(isExplicitYouTubeOwner({}), false);
  assert.equal(isExplicitYouTubeOwner({ COINEASY_YT_OWNER: 'insight-briefing' }), true);
  assert.equal(isExplicitYouTubeOwner({ COINEASY_YT_OWNER: 'meme-engine' }), false);
  assert.equal(isApprovedQueuePolicy({}), false);
  assert.equal(isApprovedQueuePolicy({ COINEASY_YT_LEGACY_QUEUE_CLEARED: '1' }), false);
  assert.equal(isApprovedQueuePolicy({ COINEASY_YT_QUEUE_POLICY: APPROVED_QUEUE_POLICY }), true);
  assert.equal(isApprovedQueuePolicy({ COINEASY_YT_QUEUE_POLICY: 'coexist' }), false);
});

test('article upload window is only KST 18:05:00 through 18:14:59', () => {
  assert.equal(ARTICLE_SLOT_KST, '18:05');
  assert.equal(isArticleUploadWindow(new Date('2026-08-31T09:04:59Z')), false);
  assert.equal(isArticleUploadWindow(new Date('2026-08-31T09:05:00Z')), true);
  assert.equal(isArticleUploadWindow(new Date('2026-08-31T09:14:59Z')), true);
  assert.equal(isArticleUploadWindow(new Date('2026-08-31T09:15:00Z')), false);
  assert.equal(isArticleUploadWindow(new Date('invalid')), false);
});

test('time and queue gates precede handoff loading and never mutate legacy reservations', () => {
  assert.ok(INDEX_SOURCE.indexOf('isApprovedQueuePolicy()') < INDEX_SOURCE.indexOf('loadApprovedArticleHandoff(startTs)'));
  assert.ok(INDEX_SOURCE.indexOf('isArticleUploadWindow(startTs)') < INDEX_SOURCE.indexOf('loadApprovedArticleHandoff(startTs)'));
  assert.match(INDEX_SOURCE, /cron\.schedule\('5 9 \* \* \*'/);
  assert.ok(INDEX_SOURCE.indexOf('await preflightYouTubeUpload()') < INDEX_SOURCE.indexOf('await openDailyUploadGuard(handoff)'));
  assert.ok(INDEX_SOURCE.indexOf('isArticleUploadWindow(uploadTs)') < INDEX_SOURCE.indexOf('await guard.markUploadStarted()'));
  assert.doesNotMatch(INDEX_SOURCE, /videos\.(?:delete|update)|COINEASY_YT_LEGACY_QUEUE_CLEARED/);
});

test('claim and receipt are persistent, include article hashes and verified video identity', async () => {
  const handoff = signedHandoff();
  const redis = new FakeRedis();
  const guard = await openDailyUploadGuard(handoff, {
    redisFactory: () => redis,
    token: 'fixed-token',
    now: new Date('2026-08-31T09:05:00Z'),
  });
  assert.equal(guard.acquired, true);
  const initialSet = redis.setCalls[0];
  assert.deepEqual(initialSet.slice(2), ['NX']);
  assert.equal(initialSet.includes('EX'), false);
  const claim = JSON.parse(redis.values.get(`${CLAIM_PREFIX}${DATE}`));
  assert.equal(claim.slug, handoff.slug);
  assert.equal(claim.pack_sha256, handoff.pack_sha256);
  assert.match(claim.handoff_sha256, /^[a-f0-9]{64}$/);
  assert.equal(claim.slot_kst, ARTICLE_SLOT_KST);
  assert.equal(claim.queue_policy, APPROVED_QUEUE_POLICY);
  assert.equal(claim.video_url, null);

  await guard.markUploadStarted();
  await guard.markDone(VERIFIED_VIDEO);
  const receipt = JSON.parse(redis.values.get(`${RECEIPT_PREFIX}${DATE}`));
  assert.equal(receipt.slug, handoff.slug);
  assert.equal(receipt.pack_sha256, handoff.pack_sha256);
  assert.equal(receipt.video_id, VERIFIED_VIDEO.videoId);
  assert.equal(receipt.video_url, VERIFIED_VIDEO.videoUrl);
  assert.deepEqual(receipt.verification, VERIFIED_VIDEO.verification);
  assert.equal(receipt.slot_kst, ARTICLE_SLOT_KST);
  assert.equal(receipt.queue_policy, APPROVED_QUEUE_POLICY);
  const receiptSet = redis.setCalls.find((call) => call[0] === `${RECEIPT_PREFIX}${DATE}`);
  assert.deepEqual(receiptSet.slice(2), ['NX']);
});

test('insert ID alone cannot create a success receipt and uncertain state retains known ID', async () => {
  const redis = new FakeRedis();
  const guard = await openDailyUploadGuard(signedHandoff(), { redisFactory: () => redis, token: 'known-id' });
  await guard.markUploadStarted();
  await assert.rejects(guard.markDone({ videoId: VERIFIED_VIDEO.videoId, videoUrl: VERIFIED_VIDEO.videoUrl }), /readback/);
  assert.equal(redis.values.has(`${RECEIPT_PREFIX}${DATE}`), false);
  const error = Object.assign(new Error('processing readback unavailable'), { videoId: VERIFIED_VIDEO.videoId });
  await guard.markUncertain(error);
  const claim = JSON.parse(redis.values.get(`${CLAIM_PREFIX}${DATE}`));
  assert.equal(claim.state, 'external_state_uncertain');
  assert.equal(claim.video_id, VERIFIED_VIDEO.videoId);
  assert.equal(claim.video_url, VERIFIED_VIDEO.videoUrl);
  const next = await openDailyUploadGuard(signedHandoff(), { redisFactory: () => redis, token: 'never-retry' });
  assert.equal(next.acquired, false);
});

test('any upload error creates a persistent uncertain fence and a second run cannot retry', async () => {
  const handoff = signedHandoff();
  const redis = new FakeRedis();
  const guard = await openDailyUploadGuard(handoff, { redisFactory: () => redis, token: 'first' });
  await guard.markUploadStarted();
  await guard.markUncertain(new Error('socket reset after request body'));
  const claim = JSON.parse(redis.values.get(`${CLAIM_PREFIX}${DATE}`));
  assert.equal(claim.state, 'external_state_uncertain');
  assert.match(claim.error, /socket reset/);

  const second = await openDailyUploadGuard(handoff, { redisFactory: () => redis, token: 'second' });
  assert.equal(second.acquired, false);
  assert.equal(second.reason, 'persistent-claim-exists');
});
