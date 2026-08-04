import crypto from 'crypto';
import Redis from 'ioredis';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SNAPSHOT_PREFIX = 'coineasydaily:daily_brief:briefing:';
const UPLOAD_PREFIX = 'coineasy:youtube:editorial:';

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimAtWord(value, limit) {
  const text = compact(value);
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace >= Math.floor(limit * 0.58) ? cut.slice(0, lastSpace) : cut;
  return `${safe.replace(/[\s,.·–—-]+$/g, '')}…`;
}

function kstDate(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function sourceLabel(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch (_) {
    return '공식 출처';
  }
}

function buildEditorialBrief(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const item = items.find((candidate) => (
    compact(candidate?.title) && Array.isArray(candidate?.bullets) && compact(candidate.bullets[0])
  ));
  if (!item) return null;

  const sourceUrl = compact(item.source_link);
  const watch = Array.isArray(snapshot.watch)
    ? snapshot.watch.find((value) => compact(value))
    : '';

  const editorial = {
    headline: trimAtWord(snapshot.headline || item.title, 34),
    factTitle: trimAtWord(item.title, 34),
    fact: trimAtWord(item.bullets[0], 54),
    context: trimAtWord(item.bullets[1] || snapshot.verdict, 54),
    verdict: trimAtWord(snapshot.verdict, 58),
    action: trimAtWord(watch || snapshot.verdict, 48),
    sourceUrl,
    sourceLabel: sourceLabel(sourceUrl),
  };

  return Object.values(editorial).some(Boolean) ? editorial : null;
}

function createRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  return new Redis(redisUrl, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
  });
}

async function closeRedis(redis) {
  if (!redis) return;
  try { await redis.quit(); } catch (_) { redis.disconnect(); }
}

async function loadDailyEditorial(now = new Date()) {
  const date = kstDate(now);
  const redis = createRedis();
  if (!redis) {
    console.warn('  [editorial] REDIS_URL 미설정 — 기사형 쇼츠를 생성하지 않습니다.');
    return { date, editorial: null };
  }
  try {
    const raw = await redis.get(`${SNAPSHOT_PREFIX}${date}`);
    if (!raw) return { date, editorial: null };
    return { date, editorial: buildEditorialBrief(JSON.parse(raw)) };
  } catch (error) {
    console.warn(`  [editorial] 일일 브리프 로드 실패: ${error.message}`);
    return { date, editorial: null };
  } finally {
    await closeRedis(redis);
  }
}

async function openDailyUploadGuard(date) {
  const redis = createRedis();
  if (!redis) {
    return {
      acquired: true,
      reason: 'redis-disabled',
      markDone: async () => {},
      release: async () => {},
    };
  }

  const doneKey = `${UPLOAD_PREFIX}done:${date}`;
  const lockKey = `${UPLOAD_PREFIX}lock:${date}`;
  const token = crypto.randomUUID();
  try {
    if (await redis.get(doneKey)) {
      await closeRedis(redis);
      return { acquired: false, reason: 'already-uploaded' };
    }
    const claimed = await redis.set(lockKey, token, 'EX', 2 * 60 * 60, 'NX');
    if (claimed !== 'OK') {
      await closeRedis(redis);
      return { acquired: false, reason: 'upload-in-progress' };
    }
  } catch (error) {
    await closeRedis(redis);
    throw new Error(`YouTube 일일 락 확인 실패: ${error.message}`);
  }

  let closed = false;
  async function finish() {
    if (closed) return;
    closed = true;
    await closeRedis(redis);
  }

  return {
    acquired: true,
    reason: 'claimed',
    async markDone(videoUrl) {
      await redis.set(doneKey, compact(videoUrl) || 'uploaded', 'EX', 7 * 24 * 60 * 60);
      const current = await redis.get(lockKey);
      if (current === token) await redis.del(lockKey);
      await finish();
    },
    async release() {
      try {
        const current = await redis.get(lockKey);
        if (current === token) await redis.del(lockKey);
      } finally {
        await finish();
      }
    },
  };
}

export {
  buildEditorialBrief,
  kstDate,
  loadDailyEditorial,
  openDailyUploadGuard,
  trimAtWord,
};
