import crypto from 'crypto';
import Redis from 'ioredis';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HANDOFF_PREFIX = 'coineasy:youtube:article-handoff:';
const CLAIM_PREFIX = 'coineasy:youtube:article-claim:';
const RECEIPT_PREFIX = 'coineasy:youtube:article-receipt:';
const EXPECTED_OWNER = 'insight-briefing';
const SCENE_KINDS = Object.freeze([
  'headline',
  'verified_fact',
  'why_it_matters',
  'market_context',
  'action',
  'source_cta',
]);
const METRIC_LABELS = Object.freeze(['BTC', '김치프리미엄', '공포탐욕']);
const HANDOFF_KEYS = Object.freeze([
  'approval_mode', 'canonical_naver_url', 'date_kst', 'issued_at', 'pack_path',
  'pack_sha256', 'publish_time_kst', 'repository', 'schema_version', 'signature',
  'slug', 'source_sha', 'state', 'youtube',
]);
const YOUTUBE_KEYS = Object.freeze(['duration_seconds', 'enabled', 'metrics', 'scenes', 'source_urls', 'voiceover_ko']);
const SCENE_KEYS = Object.freeze(['kind', 'text']);
const METRIC_KEYS = Object.freeze(['as_of', 'label', 'source_url', 'value']);

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function kstDate(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function unsignedHandoff(handoff) {
  if (!isPlainObject(handoff)) return handoff;
  const { signature: _signature, ...unsigned } = handoff;
  return unsigned;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function calculateHandoffSignature(handoff, secret) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('COINEASY_YOUTUBE_HANDOFF_SECRET가 필요합니다.');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalJson(unsignedHandoff(handoff)), 'utf8')
    .digest('hex');
}

function verifyHandoffSignature(handoff, secret) {
  const supplied = compact(handoff?.signature).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  const expected = calculateHandoffSignature(handoff, secret);
  return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
}

function assertHttpsUrl(value, label) {
  const text = compact(value);
  let parsed;
  try { parsed = new URL(text); } catch (_) { throw new Error(`${label}이(가) 올바른 URL이 아닙니다.`); }
  if (parsed.protocol !== 'https:') throw new Error(`${label}은(는) HTTPS여야 합니다.`);
  return text;
}

function assertString(value, label) {
  const text = compact(value);
  if (!text) throw new Error(`${label}이(가) 필요합니다.`);
  return text;
}

function assertBoundedString(value, label, minLength, maxLength) {
  const text = assertString(value, label);
  if (text.length < minLength || text.length > maxLength) {
    throw new Error(`${label}은(는) ${minLength}-${maxLength}자여야 합니다.`);
  }
  return text;
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} 허용 필드가 서명 계약과 다릅니다.`);
  }
}

function validateApprovedArticleHandoff(handoff, expectedDate, secret) {
  if (!isPlainObject(handoff)) throw new Error('아티클 handoff는 JSON 객체여야 합니다.');
  if (!verifyHandoffSignature(handoff, secret)) throw new Error('아티클 handoff 서명이 일치하지 않습니다.');
  assertExactKeys(handoff, HANDOFF_KEYS, 'handoff');
  if (handoff.schema_version !== 1) throw new Error('지원하지 않는 handoff schema_version입니다.');
  if (handoff.state !== 'approved_published') throw new Error('handoff state는 approved_published여야 합니다.');
  if (handoff.date_kst !== expectedDate) throw new Error('handoff date_kst가 Redis key 날짜와 다릅니다.');
  if (handoff.publish_time_kst !== '18:05') throw new Error('publish_time_kst는 18:05여야 합니다.');
  if (handoff.approval_mode !== 'telegram') throw new Error('approval_mode는 telegram여야 합니다.');

  const repository = assertString(handoff.repository, 'repository');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('repository는 owner/repo 형식이어야 합니다.');
  if (repository !== 'jadenlee7/easyfarm') throw new Error('repository는 jadenlee7/easyfarm이어야 합니다.');
  if (!/^[a-f0-9]{40}$/i.test(compact(handoff.source_sha))) throw new Error('source_sha는 40자 Git SHA여야 합니다.');
  if (!/^[a-f0-9]{64}$/i.test(compact(handoff.pack_sha256))) throw new Error('pack_sha256는 SHA-256 hex여야 합니다.');

  const slug = assertString(handoff.slug, 'slug');
  if (!slug.startsWith(`${expectedDate}-`) || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('slug는 YYYY-MM-DD-로 시작하는 소문자 kebab-case여야 합니다.');
  }
  const packPath = assertString(handoff.pack_path, 'pack_path');
  if (packPath !== `research/packs/${slug}.json`) throw new Error('pack_path가 slug와 일치하지 않습니다.');

  const naverUrl = assertHttpsUrl(handoff.canonical_naver_url, 'canonical_naver_url');
  const parsedNaverUrl = new URL(naverUrl);
  if (
    parsedNaverUrl.hostname.toLowerCase() !== 'blog.naver.com'
    || !/^\/coineasy\/\d+$/.test(parsedNaverUrl.pathname)
    || parsedNaverUrl.username
    || parsedNaverUrl.password
    || parsedNaverUrl.port
    || parsedNaverUrl.search
    || parsedNaverUrl.hash
  ) {
    throw new Error('canonical_naver_url은 https://blog.naver.com/coineasy/<logNo> 형식이어야 합니다.');
  }
  const issuedAt = assertString(handoff.issued_at, 'issued_at');
  const issuedDate = new Date(issuedAt);
  if (Number.isNaN(issuedDate.getTime())) throw new Error('issued_at은 ISO 시간이어야 합니다.');
  if (kstDate(issuedDate) !== expectedDate) throw new Error('issued_at의 KST 날짜가 date_kst와 다릅니다.');

  const youtube = handoff.youtube;
  if (!isPlainObject(youtube)) throw new Error('youtube 검토 계약이 필요합니다.');
  assertExactKeys(youtube, YOUTUBE_KEYS, 'youtube');
  if (youtube.enabled !== true) throw new Error('youtube.enabled는 true여야 합니다.');
  if (youtube.duration_seconds !== 32) throw new Error('youtube.duration_seconds는 32여야 합니다.');
  if (!Array.isArray(youtube.scenes) || youtube.scenes.length !== SCENE_KINDS.length) {
    throw new Error('youtube.scenes는 정확히 6개여야 합니다.');
  }
  youtube.scenes.forEach((scene, index) => {
    if (!isPlainObject(scene) || scene.kind !== SCENE_KINDS[index]) {
      throw new Error(`youtube.scenes[${index}].kind가 고정 순서와 다릅니다.`);
    }
    assertExactKeys(scene, SCENE_KEYS, `youtube.scenes[${index}]`);
    assertBoundedString(scene.text, `youtube.scenes[${index}].text`, 5, 300);
  });
  const voiceover = assertBoundedString(youtube.voiceover_ko, 'youtube.voiceover_ko', 20, 240);
  if (!/[가-힣]/.test(voiceover)) throw new Error('youtube.voiceover_ko는 한국어 음성 원고여야 합니다.');

  if (!Array.isArray(youtube.source_urls) || youtube.source_urls.length === 0 || youtube.source_urls.length > 20) {
    throw new Error('youtube.source_urls는 1-20개여야 합니다.');
  }
  const sourceUrls = youtube.source_urls.map((url, index) => assertHttpsUrl(url, `youtube.source_urls[${index}]`));
  if (new Set(sourceUrls).size !== sourceUrls.length) throw new Error('youtube.source_urls에 중복이 있습니다.');

  if (!Array.isArray(youtube.metrics) || youtube.metrics.length !== METRIC_LABELS.length) {
    throw new Error('youtube.metrics는 BTC·김치프리미엄·공포탐욕 3개여야 합니다.');
  }
  youtube.metrics.forEach((metric, index) => {
    if (!isPlainObject(metric) || metric.label !== METRIC_LABELS[index]) {
      throw new Error(`youtube.metrics[${index}].label이 고정 순서와 다릅니다.`);
    }
    assertExactKeys(metric, METRIC_KEYS, `youtube.metrics[${index}]`);
    assertBoundedString(metric.value, `youtube.metrics[${index}].value`, 1, 120);
    const asOf = assertString(metric.as_of, `youtube.metrics[${index}].as_of`);
    const parsedAsOf = new Date(asOf);
    if (Number.isNaN(parsedAsOf.getTime()) || (/T/.test(asOf) && !/(?:Z|[+-]\d{2}:\d{2})$/.test(asOf))) {
      throw new Error(`youtube.metrics[${index}].as_of는 타임존이 포함된 ISO 8601 날짜여야 합니다.`);
    }
    const metricSource = assertHttpsUrl(metric.source_url, `youtube.metrics[${index}].source_url`);
    if (!sourceUrls.includes(metricSource)) {
      throw new Error(`youtube.metrics[${index}].source_url이 source_urls에 없습니다.`);
    }
  });

  return handoff;
}

function sourceLabel(link) {
  try { return new URL(link).hostname.replace(/^www\./, ''); }
  catch (_) { return '공식 출처'; }
}

function buildEditorialFromHandoff(handoff) {
  const sceneText = Object.fromEntries(handoff.youtube.scenes.map((scene) => [scene.kind, compact(scene.text)]));
  const metrics = Object.fromEntries(handoff.youtube.metrics.map((metric) => [metric.label, metric]));
  const sourceUrl = handoff.youtube.source_urls[0];
  return {
    article: {
      repository: handoff.repository,
      sourceSha: handoff.source_sha,
      packPath: handoff.pack_path,
      packSha256: handoff.pack_sha256,
      slug: handoff.slug,
      canonicalNaverUrl: handoff.canonical_naver_url,
      issuedAt: handoff.issued_at,
    },
    editorial: {
      headline: sceneText.headline,
      factTitle: '확인된 사실',
      fact: sceneText.verified_fact,
      context: sceneText.why_it_matters,
      verdict: sceneText.why_it_matters,
      marketContext: sceneText.market_context,
      action: sceneText.action,
      sourceCta: sceneText.source_cta,
      sourceUrl,
      sourceUrls: [...handoff.youtube.source_urls],
      sourceLabel: sourceLabel(sourceUrl),
      voiceoverKo: compact(handoff.youtube.voiceover_ko),
    },
    texts: {
      btc_price: compact(metrics.BTC.value),
      btc_change: compact(metrics.BTC.as_of),
      kimchi_premium: compact(metrics['김치프리미엄'].value),
      kimchi_as_of: compact(metrics['김치프리미엄'].as_of),
      fear_value: compact(metrics['공포탐욕'].value),
      fear_label: compact(metrics['공포탐욕'].as_of),
    },
    youtube: handoff.youtube,
  };
}

function createRedis() {
  const redisUrl = compact(process.env.COINEASY_YOUTUBE_HANDOFF_REDIS_URL || process.env.REDIS_URL);
  if (!redisUrl) throw new Error('COINEASY_YOUTUBE_HANDOFF_REDIS_URL/REDIS_URL이 없어 YouTube Shorts를 fail-closed 처리합니다.');
  return new Redis(redisUrl, { connectTimeout: 5000, maxRetriesPerRequest: 1, enableOfflineQueue: false });
}

async function closeRedis(redis) {
  if (!redis) return;
  try { await redis.quit(); } catch (_) { redis.disconnect(); }
}

function isExplicitYouTubeOwner(env = process.env) {
  return compact(env.COINEASY_YT_OWNER).toLowerCase() === EXPECTED_OWNER;
}

function isLegacyQueueCleared(env = process.env) {
  return compact(env.COINEASY_YT_LEGACY_QUEUE_CLEARED) === '1';
}

async function loadApprovedArticleHandoff(now = new Date(), options = {}) {
  const date = kstDate(now);
  const redis = (options.redisFactory || createRedis)();
  const secret = options.secret ?? process.env.COINEASY_YOUTUBE_HANDOFF_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) {
    await closeRedis(redis);
    throw new Error('COINEASY_YOUTUBE_HANDOFF_SECRET가 없어 handoff를 검증할 수 없습니다.');
  }
  try {
    const raw = await redis.get(`${HANDOFF_PREFIX}${date}`);
    if (!raw) return { date, handoff: null, payload: null };
    let handoff;
    try { handoff = JSON.parse(raw); } catch (_) { throw new Error('아티클 handoff JSON을 파싱할 수 없습니다.'); }
    validateApprovedArticleHandoff(handoff, date, secret);
    return { date, handoff, payload: buildEditorialFromHandoff(handoff) };
  } catch (error) {
    throw new Error(`승인된 아티클 handoff 로드 실패: ${error.message}`);
  } finally {
    await closeRedis(redis);
  }
}

function handoffDigest(handoff) {
  return crypto.createHash('sha256').update(canonicalJson(handoff), 'utf8').digest('hex');
}

function persistentRecordBase(handoff, token, now = new Date()) {
  return {
    schema_version: 1,
    date_kst: handoff.date_kst,
    slug: handoff.slug,
    pack_sha256: handoff.pack_sha256,
    handoff_sha256: handoffDigest(handoff),
    source_sha: handoff.source_sha,
    token,
    video_id: null,
    video_url: null,
    updated_at: now.toISOString(),
  };
}

async function openDailyUploadGuard(handoff, options = {}) {
  const redis = (options.redisFactory || createRedis)();
  const date = handoff.date_kst;
  const claimKey = `${CLAIM_PREFIX}${date}`;
  const receiptKey = `${RECEIPT_PREFIX}${date}`;
  const token = options.token || crypto.randomUUID();
  try {
    if (await redis.get(receiptKey)) {
      await closeRedis(redis);
      return { acquired: false, reason: 'already-uploaded' };
    }
    const claim = { ...persistentRecordBase(handoff, token, options.now), state: 'claimed' };
    const result = await redis.set(claimKey, JSON.stringify(claim), 'NX');
    if (result !== 'OK') {
      await closeRedis(redis);
      return { acquired: false, reason: 'persistent-claim-exists' };
    }
  } catch (error) {
    await closeRedis(redis);
    throw new Error(`YouTube 영구 claim 확인 실패: ${error.message}`);
  }

  let closed = false;
  let uploadStarted = false;
  async function finish() {
    if (closed) return;
    closed = true;
    await closeRedis(redis);
  }
  async function updateClaim(state, extra = {}) {
    if (closed) throw new Error('이미 종료된 YouTube claim입니다.');
    const raw = await redis.get(claimKey);
    if (!raw) throw new Error('YouTube claim이 사라졌습니다.');
    const current = JSON.parse(raw);
    if (current.token !== token) throw new Error('YouTube claim token이 바뀌었습니다.');
    const updated = { ...current, ...extra, state, updated_at: new Date().toISOString() };
    await redis.set(claimKey, JSON.stringify(updated));
    return updated;
  }

  return {
    acquired: true,
    reason: 'claimed',
    get uploadStarted() { return uploadStarted; },
    async markUploadStarted() {
      if (uploadStarted) throw new Error('YouTube 업로드 시도는 한 번만 허용됩니다.');
      uploadStarted = true;
      await updateClaim('uploading', { upload_started_at: new Date().toISOString() });
    },
    async markDone(video) {
      if (!uploadStarted) throw new Error('업로드 시작 기록 없이 완료할 수 없습니다.');
      const videoId = assertString(video?.videoId, 'videoId');
      const videoUrl = assertHttpsUrl(video?.videoUrl, 'videoUrl');
      const completedAt = new Date().toISOString();
      const receipt = {
        ...persistentRecordBase(handoff, token),
        state: 'uploaded',
        video_id: videoId,
        video_url: videoUrl,
        completed_at: completedAt,
        updated_at: completedAt,
      };
      const inserted = await redis.set(receiptKey, JSON.stringify(receipt), 'NX');
      if (inserted !== 'OK') throw new Error('YouTube 영구 receipt가 이미 존재합니다.');
      await updateClaim('uploaded', { video_id: videoId, video_url: videoUrl, completed_at: completedAt });
      await finish();
      return receipt;
    },
    async markUncertain(error) {
      const message = compact(error?.message || error).slice(0, 500);
      await updateClaim('external_state_uncertain', { error: message, uncertain_at: new Date().toISOString() });
      await finish();
    },
    async markFailedBeforeUpload(error) {
      if (uploadStarted) throw new Error('업로드 시작 후에는 pre-upload 실패로 마킹할 수 없습니다.');
      const message = compact(error?.message || error).slice(0, 500);
      await updateClaim('failed_before_upload', { error: message, failed_at: new Date().toISOString() });
      await finish();
    },
  };
}

export {
  CLAIM_PREFIX,
  HANDOFF_PREFIX,
  METRIC_LABELS,
  RECEIPT_PREFIX,
  SCENE_KINDS,
  buildEditorialFromHandoff,
  calculateHandoffSignature,
  canonicalJson,
  handoffDigest,
  isExplicitYouTubeOwner,
  isLegacyQueueCleared,
  kstDate,
  loadApprovedArticleHandoff,
  openDailyUploadGuard,
  validateApprovedArticleHandoff,
  verifyHandoffSignature,
};
