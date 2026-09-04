import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CANONICAL_TELEGRAM_GROWTH_URLS,
  TELEGRAM_GROWTH_URL_ENVS,
  buildTypefullyDraftPayload,
  canonicalTelegramGrowthReplyText,
  postBriefingToSocial,
  postToSocial,
  resolveTelegramGrowthXReply,
} from './typefully-poster.js';
import { composeEnglishDigest } from './social-composer.js';

const originalFetch = globalThis.fetch;
const originalEnv = {
  TYPEFULLY_API_KEY: process.env.TYPEFULLY_API_KEY,
  TYPEFULLY_SOCIAL_SET_ID: process.env.TYPEFULLY_SOCIAL_SET_ID,
  TELEGRAM_GROWTH_X_BRIEFING_AM_URL:
    process.env.TELEGRAM_GROWTH_X_BRIEFING_AM_URL,
  TELEGRAM_GROWTH_X_BRIEFING_PM_URL:
    process.env.TELEGRAM_GROWTH_X_BRIEFING_PM_URL,
};

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalEnv)) {
    restoreEnv(name, value);
  }
});

test('Telegram growth config accepts exact URLs for the matching AM/PM type only', () => {
  assert.deepEqual(resolveTelegramGrowthXReply('morning', {}), {
    enabled: false,
    reason: 'missing_canonical_url',
    text: null,
  });
  assert.deepEqual(resolveTelegramGrowthXReply('morning', {
    TELEGRAM_GROWTH_X_BRIEFING_AM_URL:
      CANONICAL_TELEGRAM_GROWTH_URLS.evening,
  }), {
    enabled: false,
    reason: 'invalid_canonical_url',
    text: null,
  });
  assert.deepEqual(resolveTelegramGrowthXReply('unknown', {
    TELEGRAM_GROWTH_X_BRIEFING_AM_URL:
      CANONICAL_TELEGRAM_GROWTH_URLS.morning,
  }), {
    enabled: false,
    reason: 'invalid_briefing_type',
    text: null,
  });

  for (const [type, creative] of [
    ['morning', 'briefing_am'],
    ['evening', 'briefing_pm'],
  ]) {
    const resolved = resolveTelegramGrowthXReply(type, {
      [TELEGRAM_GROWTH_URL_ENVS[type]]:
        CANONICAL_TELEGRAM_GROWTH_URLS[type],
    });
    assert.equal(resolved.enabled, true);
    assert.equal(resolved.creative, creative);
    assert.match(resolved.text, new RegExp(`join_x_${creative}$`));
  }
});

test('payload adds the canonical CTA only as the final X reply', () => {
  const rootText = 'Korea morning check.\n\nDaily Korea signal by CoinEasy.';
  const replyText = canonicalTelegramGrowthReplyText('morning');
  const nowMs = Date.parse('2026-09-04T00:00:00.000Z');
  const body = buildTypefullyDraftPayload(rootText, {
    mediaIds: ['media-1'],
    xReplyText: replyText,
    nowMs,
  });

  assert.deepEqual(body.platforms.x.posts, [
    { text: rootText, media_ids: ['media-1'] },
    { text: replyText },
  ]);
  assert.deepEqual(body.platforms.linkedin.posts, [
    { text: rootText, media_ids: ['media-1'] },
  ]);
  assert.deepEqual(body.platforms.threads.posts, [
    { text: rootText, media_ids: ['media-1'] },
  ]);
  assert.equal(body.publish_at, '2026-09-04T00:15:00.000Z');
});

test('both AM and PM briefing copy stay link-free before the one final X CTA', () => {
  const nowMs = Date.parse('2026-09-04T00:00:00.000Z');
  for (const type of ['morning', 'evening']) {
    const rootText = composeEnglishDigest({}, { type });
    const replyText = canonicalTelegramGrowthReplyText(type);
    const body = buildTypefullyDraftPayload(rootText, {
      xReplyText: replyText,
      nowMs,
    });

    assert.doesNotMatch(rootText, /https?:\/\//i);
    assert.equal(body.platforms.x.posts.length, 2);
    assert.equal(body.platforms.x.posts[0].text, rootText);
    assert.equal(body.platforms.x.posts[1].text, replyText);
    assert.deepEqual(body.platforms.linkedin.posts, [{ text: rootText }]);
    assert.deepEqual(body.platforms.threads.posts, [{ text: rootText }]);
  }
});

test('invalid CTA fails closed and preserves the original one-post payload', () => {
  const rootText = 'Original root';
  const body = buildTypefullyDraftPayload(rootText, {
    xReplyText: 'Join an unapproved room: https://t.me/another_bot',
    nowMs: Date.parse('2026-09-04T00:00:00.000Z'),
  });

  assert.deepEqual(body.platforms.x.posts, [{ text: rootText }]);
  assert.deepEqual(body.platforms.linkedin.posts, [{ text: rootText }]);
  assert.deepEqual(body.platforms.threads.posts, [{ text: rootText }]);
  assert.equal(body.publish_at, '2026-09-04T00:01:00.000Z');
});

test('URL-bearing drafts clamp an early explicit publish_at to fifteen minutes', () => {
  const body = buildTypefullyDraftPayload('Primary post', {
    xReplyText: canonicalTelegramGrowthReplyText('evening'),
    publishAt: '2026-09-04T00:05:00.000Z',
    nowMs: Date.parse('2026-09-04T00:00:00.000Z'),
  });
  assert.equal(body.publish_at, '2026-09-04T00:15:00.000Z');
});

test('briefing publisher sends the CTA only to X and leaves other platform posts unchanged', async () => {
  process.env.TYPEFULLY_API_KEY = 'test-key';
  process.env.TYPEFULLY_SOCIAL_SET_ID = 'test-social-set';
  process.env.TELEGRAM_GROWTH_X_BRIEFING_AM_URL =
    CANONICAL_TELEGRAM_GROWTH_URLS.morning;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 201,
      json: async () => ({ id: 'draft-1', status: 'scheduled' }),
      text: async () => '',
    };
  };

  const result = await postBriefingToSocial(
    'Unchanged primary text',
    null,
    null,
    'morning'
  );

  assert.equal(result.success, true);
  assert.equal(result.xTelegramCtaIncluded, true);
  assert.equal(result.xTelegramCreative, 'briefing_am');
  assert.equal(requestBody.platforms.x.posts.length, 2);
  assert.match(requestBody.platforms.x.posts[1].text, /join_x_briefing_am$/);
  assert.deepEqual(requestBody.platforms.linkedin.posts, [
    { text: 'Unchanged primary text' },
  ]);
  assert.deepEqual(requestBody.platforms.threads.posts, [
    { text: 'Unchanged primary text' },
  ]);
});

test('briefing publisher omits the CTA when growth URL config is missing or invalid', async (t) => {
  for (const scenario of [
    { name: 'missing', value: undefined, reason: 'missing_canonical_url' },
    { name: 'invalid', value: CANONICAL_TELEGRAM_GROWTH_URLS.morning, reason: 'invalid_canonical_url' },
  ]) {
    await t.test(scenario.name, async () => {
      process.env.TYPEFULLY_API_KEY = 'test-key';
      process.env.TYPEFULLY_SOCIAL_SET_ID = 'test-social-set';
      restoreEnv('TELEGRAM_GROWTH_X_BRIEFING_PM_URL', scenario.value);
      let requestBody = null;
      globalThis.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: `draft-${scenario.name}`, status: 'scheduled' }),
          text: async () => '',
        };
      };

      const result = await postBriefingToSocial(
        'Unchanged primary text',
        null,
        null,
        'evening'
      );

      assert.equal(result.success, true);
      assert.equal(result.xTelegramCtaIncluded, false);
      assert.equal(result.xTelegramCtaReason, scenario.reason);
      assert.equal(result.xTelegramCreative, null);
      assert.deepEqual(requestBody.platforms.x.posts, [
        { text: 'Unchanged primary text' },
      ]);
      assert.deepEqual(requestBody.platforms.linkedin.posts, [
        { text: 'Unchanged primary text' },
      ]);
      assert.deepEqual(requestBody.platforms.threads.posts, [
        { text: 'Unchanged primary text' },
      ]);
    });
  }
});

test('Typefully API failure is returned after one POST without retry', async () => {
  process.env.TYPEFULLY_API_KEY = 'test-key';
  process.env.TYPEFULLY_SOCIAL_SET_ID = 'test-social-set';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 403,
      text: async () => 'blocked',
    };
  };

  const result = await postToSocial('Primary post', {
    xReplyText: canonicalTelegramGrowthReplyText('morning'),
  });

  assert.equal(calls, 1);
  assert.equal(result.success, false);
  assert.equal(result.status, 403);
});

test('legacy root Figma publisher is hard-disabled before any network access', async () => {
  const source = await readFile(new URL('../../figma-content.js', import.meta.url), 'utf8');
  const functionStart = source.indexOf('export async function postToTypefully');
  const firstFetch = source.indexOf('fetch(', functionStart);
  const hardStop = source.indexOf('return false;', functionStart);

  assert.ok(functionStart >= 0, 'legacy publisher must remain explicitly guarded');
  assert.ok(hardStop > functionStart, 'legacy publisher must return false');
  assert.ok(firstFetch === -1 || hardStop < firstFetch,
    'legacy publisher must stop before the first network request');
  assert.match(source, /legacy_typefully_path_disabled_use_coineasy_briefing_bot/);
});

test('production entry passes session type and Docker selects only the active bot', async () => {
  const [indexSource, dockerSource] = await Promise.all([
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../Dockerfile', import.meta.url), 'utf8'),
  ]);

  assert.match(
    indexSource,
    /postBriefingToSocial\(\s*socialText,\s*socialImage,\s*null,\s*session\.type\s*\)/
  );
  assert.match(dockerSource, /typefully-poster\.js.*coineasy-briefing-bot\/src/);
  assert.match(dockerSource, /cp -r "\$BOT_DIR"\/\. \/app\//);
  assert.match(dockerSource, /CMD \["npm", "start"\]/);
});
