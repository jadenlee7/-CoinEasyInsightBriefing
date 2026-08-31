import crypto from 'crypto';
import Redis from 'ioredis';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HANDOFF_PREFIX = 'coineasy:youtube:article-handoff:';
const CLAIM_PREFIX = 'coineasy:youtube:article-claim:';
const RECEIPT_PREFIX = 'coineasy:youtube:article-receipt:';
const EXPECTED_OWNER = 'insight-briefing';
const ARTICLE_SLOT_KST = '18:05';
const APPROVED_QUEUE_POLICY = 'coexist-article-1805-legacy-2030';
const ARTICLE_WINDOW_START_MINUTE = (18 * 60) + 5;
const ARTICLE_WINDOW_END_MINUTE = (18 * 60) + 14;
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
const YOUTUBE_KEYS = Object.freeze(['duration_seconds', 'enabled', 'metrics', 'scenes', 'source_urls', 'voiceover_ko', 'voiceover_segments_ko']);
const SCENE_KEYS = Object.freeze(['kind', 'text']);
const METRIC_KEYS = Object.freeze(['as_of', 'label', 'source_url', 'value']);
const VOICE_SEGMENT_LIMITS = Object.freeze([32, 50, 50, 50, 50, 0]);
const METRIC_MAX_AGE_MS = Object.freeze([6, 6, 30].map((hours) => hours * 60 * 60 * 1000));
const REDIS_READY_TIMEOUT_MS = 5000;

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
  if (typeof value !== 'string') throw new Error(`${label}은(는) 문자열이어야 합니다.`);
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

function strictTimestamp(value, label) {
  const text = assertString(value, label);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(text);
  if (!match) throw new Error(`${label}은(는) 초와 타임존이 있는 ISO 8601 시각이어야 합니다.`);
  const day = new Date(`${match[1]}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]
      || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59
      || Number(match[7] || 0) > 23 || Number(match[8] || 0) > 59) {
    throw new Error(`${label}에 유효하지 않은 날짜 또는 시각이 있습니다.`);
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} 시각을 파싱할 수 없습니다.`);
  return parsed;
}

function assertMetricValue(value, index) {
  const text = assertBoundedString(value, `youtube.metrics[${index}].value`, 1, 32);
  const patterns = [
    /^\$(?:(?:0|[1-9][0-9]*)|(?:[1-9][0-9]{0,2}(?:,[0-9]{3})+))(?:\.[0-9]{1,2})?$/,
    /^[+-]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?%$/,
    /^(?:0|[1-9]\d?|100)$/,
  ];
  if (!patterns[index].test(text)) throw new Error(`youtube.metrics[${index}].value가 검증 가능한 숫자 형식이 아닙니다.`);
  const numeric = Number(text.replace(/[$,%]/g, ''));
  if (!Number.isFinite(numeric) || (index === 0 && numeric <= 0) || (index === 1 && numeric <= -100)) {
    throw new Error(`youtube.metrics[${index}].value가 허용 범위를 벗어났습니다.`);
  }
}

function validateApprovedArticleHandoff(handoff, expectedDate, secret, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime()) || kstDate(now) !== expectedDate) {
    throw new Error('현재 KST 날짜와 handoff 검증 날짜가 일치해야 합니다.');
  }
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
  const issuedDate = strictTimestamp(handoff.issued_at, 'issued_at');
  if (kstDate(issuedDate) !== expectedDate) throw new Error('issued_at의 KST 날짜가 date_kst와 다릅니다.');
  if (issuedDate > now) throw new Error('issued_at이 현재보다 미래입니다.');

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
  if (!Array.isArray(youtube.voiceover_segments_ko) || youtube.voiceover_segments_ko.length !== 6) {
    throw new Error('youtube.voiceover_segments_ko는 정확히 6개여야 합니다.');
  }
  const segments = youtube.voiceover_segments_ko.map((segment, index) => {
    if (typeof segment !== 'string') throw new Error(`음성 장면 ${index + 1}은 문자열이어야 합니다.`);
    const text = compact(segment);
    if (index === 5) {
      if (text !== '') throw new Error('마지막 CTA 장면은 무음이어야 합니다.');
    } else if (!/[가-힣]/.test(text) || text.length > VOICE_SEGMENT_LIMITS[index]) {
      throw new Error(`음성 장면 ${index + 1}이 한국어 또는 길이 계약과 다릅니다.`);
    }
    return text;
  });
  if (segments.filter(Boolean).join(' ') !== voiceover) throw new Error('장면별 음성과 승인된 전체 원고가 다릅니다.');

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
    assertMetricValue(metric.value, index);
    const parsedAsOf = strictTimestamp(metric.as_of, `youtube.metrics[${index}].as_of`);
    if (kstDate(parsedAsOf) !== expectedDate) throw new Error(`youtube.metrics[${index}].as_of는 팩의 KST 날짜여야 합니다.`);
    if (parsedAsOf > issuedDate || parsedAsOf > now) throw new Error(`youtube.metrics[${index}].as_of가 handoff 발행 또는 현재보다 미래입니다.`);
    if (now - parsedAsOf > METRIC_MAX_AGE_MS[index]) throw new Error(`youtube.metrics[${index}] 기준 시각이 오래되어 게시할 수 없습니다.`);
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
      voiceoverSegmentsKo: handoff.youtube.voiceover_segments_ko.map(compact),
    },
    texts: {
      btc_price: compact(metrics.BTC.value),
      btc_as_of: compact(metrics.BTC.as_of),
      kimchi_premium: compact(metrics['김치프리미엄'].value),
      kimchi_as_of: compact(metrics['김치프리미엄'].as_of),
      fear_value: compact(metrics['공포탐욕'].value),
      fear_as_of: compact(metrics['공포탐욕'].as_of),
    },
    youtube: handoff.youtube,
  };
}

function createRedis() {
  const redisUrl = compact(process.env.COINEASY_YOUTUBE_HANDOFF_REDIS_URL || process.env.REDIS_URL);
  if (!redisUrl) throw new Error('COINEASY_YOUTUBE_HANDOFF_REDIS_URL/REDIS_URL이 없어 YouTube Shorts를 fail-closed 처리합니다.');
  return new Redis(redisUrl, {
    connectTimeout: REDIS_READY_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
}

// With offline queuing disabled, issuing GET while ioredis is still connecting
// fails immediately. Wait for its completed handshake, without queuing commands
// or leaving a failed connection/reconnect loop alive after the bounded gate.
function waitForRedisReady(redis, timeoutMs = REDIS_READY_TIMEOUT_MS) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > REDIS_READY_TIMEOUT_MS) {
    return Promise.reject(new Error('Redis 준비 대기 제한이 유효하지 않습니다.'));
  }
  if (redis.status === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      redis.removeListener('ready', onReady);
      redis.removeListener('error', onError);
      redis.removeListener('end', onEnd);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    // Do not include Redis URL, credentials, or raw transport messages in logs.
    const onError = () => finish(new Error('Redis 연결 준비에 실패했습니다.'));
    const onEnd = () => finish(new Error('Redis 연결이 준비 전에 종료되었습니다.'));
    const timer = setTimeout(() => finish(new Error('Redis 연결 준비 시간이 초과되었습니다.')), timeoutMs);
    redis.once('ready', onReady);
    redis.once('error', onError);
    redis.once('end', onEnd);
    if (redis.status === 'ready') onReady();
    else if (redis.status === 'wait') {
      try { Promise.resolve(redis.connect()).catch(onError); }
      catch (_) { onError(); }
    } else if (!['connecting', 'connect', 'reconnecting'].includes(redis.status)) onEnd();
  });
}

async function closeRedis(redis) {
  if (!redis) return;
  if (redis.status !== 'ready') { redis.disconnect(); return; }
  try { await redis.quit(); } catch (_) { redis.disconnect(); }
}

function isExplicitYouTubeOwner(env = process.env) {
  return compact(env.COINEASY_YT_OWNER).toLowerCase() === EXPECTED_OWNER;
}

function isApprovedQueuePolicy(env = process.env) {
  return compact(env.COINEASY_YT_QUEUE_POLICY) === APPROVED_QUEUE_POLICY;
}

function isArticleUploadWindow(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return false;
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const minuteOfDay = (kst.getUTCHours() * 60) + kst.getUTCMinutes();
  return minuteOfDay >= ARTICLE_WINDOW_START_MINUTE
    && minuteOfDay <= ARTICLE_WINDOW_END_MINUTE;
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
    await waitForRedisReady(redis, options.redisReadyTimeoutMs);
    const raw = await redis.get(`${HANDOFF_PREFIX}${date}`);
    if (!raw) return { date, handoff: null, payload: null };
    let handoff;
    try { handoff = JSON.parse(raw); } catch (_) { throw new Error('아티클 handoff JSON을 파싱할 수 없습니다.'); }
    validateApprovedArticleHandoff(handoff, date, secret, now);
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
    slot_kst: ARTICLE_SLOT_KST,
    queue_policy: APPROVED_QUEUE_POLICY,
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
    await waitForRedisReady(redis, options.redisReadyTimeoutMs);
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
      const verification = video?.verification;
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || videoUrl !== `https://www.youtube.com/shorts/${videoId}`
          || verification?.readbackVerified !== true || verification?.method !== 'youtube.videos.list'
          || !/^UC[A-Za-z0-9_-]{22}$/.test(verification?.channelId || '')
          || !['public', 'unlisted', 'private'].includes(verification?.privacyStatus)
          || verification?.uploadStatus !== 'processed' || verification?.processingStatus !== 'succeeded'
          || verification?.publicStateVerified !== (verification?.privacyStatus === 'public')) {
        throw new Error('실제 채널·처리 완료·공개 상태 readback 없이 완료 영수증을 기록할 수 없습니다.');
      }
      strictTimestamp(verification.verifiedAt, 'verification.verifiedAt');
      const completedAt = new Date().toISOString();
      const receipt = {
        ...persistentRecordBase(handoff, token),
        state: 'uploaded',
        video_id: videoId,
        video_url: videoUrl,
        verification,
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
      const knownId = typeof error?.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(error.videoId) ? error.videoId : null;
      await updateClaim('external_state_uncertain', {
        error: message,
        ...(knownId ? { video_id: knownId, video_url: `https://www.youtube.com/shorts/${knownId}` } : {}),
        uncertain_at: new Date().toISOString(),
      });
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
  APPROVED_QUEUE_POLICY,
  ARTICLE_SLOT_KST,
  CLAIM_PREFIX,
  HANDOFF_PREFIX,
  METRIC_LABELS,
  RECEIPT_PREFIX,
  SCENE_KINDS,
  buildEditorialFromHandoff,
  calculateHandoffSignature,
  canonicalJson,
  handoffDigest,
  isApprovedQueuePolicy,
  isArticleUploadWindow,
  isExplicitYouTubeOwner,
  kstDate,
  loadApprovedArticleHandoff,
  openDailyUploadGuard,
  validateApprovedArticleHandoff,
  verifyHandoffSignature,
};
