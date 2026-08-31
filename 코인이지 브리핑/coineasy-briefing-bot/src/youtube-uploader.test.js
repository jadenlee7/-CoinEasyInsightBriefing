import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertYouTubeCredentials,
  buildVideoMetadata,
  cleanupVideo,
  preflightYouTubeUpload,
  uploadOnce,
  uploadToYouTube,
  verifyUploadedVideo,
  YouTubeUploadUncertainError,
} from './youtube-uploader-new.js';
import { OUTPUT_DIR } from './youtube-shorts-config.js';

const channelId = `UC${'a'.repeat(22)}`;
const otherChannelId = `UC${'b'.repeat(22)}`;
const videoId = 'TestShort01';
const env = {
  YT_CLIENT_ID: 'test-client',
  YT_CLIENT_SECRET: 'test-secret',
  YT_REFRESH_TOKEN: 'test-refresh',
  YT_PRIVACY_STATUS: 'public',
  COINEASY_YT_CHANNEL_ID: channelId,
};
const payload = {
  editorial: {
    headline: '검증된 아티클',
    fact: '공식 문서에서 확인한 사실입니다.',
    verdict: '한 가지 수치만으로 결론을 내릴 수 없습니다.',
    action: '원문과 기준일을 함께 확인하세요.',
    sourceUrls: ['https://example.com/source', 'https://example.com/btc', 'https://example.com/kimp', 'https://example.com/fear'],
  },
  article: { canonicalNaverUrl: 'https://blog.naver.com/coineasy/223999999999' },
  youtube: { metrics: [
    { label: 'BTC', value: '$63,500', as_of: '2026-08-31T08:55:00Z', source_url: 'https://example.com/btc' },
    { label: '김치프리미엄', value: '-0.3%', as_of: '2026-08-31T08:54:00Z', source_url: 'https://example.com/kimp' },
    { label: '공포탐욕', value: '28', as_of: '2026-08-31T00:00:00Z', source_url: 'https://example.com/fear' },
  ] },
  texts: { btc_price: 'NOT THE APPROVED METRIC', btc_as_of: '2026-08-31T08:55:00Z', fear_value: '28', fear_as_of: '2026-08-31T00:00:00Z', kimchi_premium: '-0.3%' },
};
const expected = { channelId, privacyStatus: 'public' };

function resource(overrides = {}) {
  return {
    id: videoId,
    snippet: { channelId },
    status: { uploadStatus: 'processed', privacyStatus: 'public' },
    processingDetails: { processingStatus: 'succeeded' },
    ...overrides,
  };
}

function response(video = resource()) {
  return { data: { items: [video] } };
}

function mockYouTube({ channels, results, insertError, insertedId = videoId } = {}) {
  const calls = { channels: [], inserts: [], lists: [] };
  const youtube = {
    channels: {
      async list(request, options) {
        calls.channels.push({ request, options });
        return channels || { data: { items: [{ id: channelId }] } };
      },
    },
    videos: {
      async insert(request, options) {
        calls.inserts.push({ request, options });
        if (insertError) throw insertError;
        return { data: { id: insertedId } };
      },
      async list(request, options) {
        calls.lists.push({ request, options });
        const result = results?.[Math.min(calls.lists.length - 1, results.length - 1)] || response();
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
  return { youtube, calls };
}

async function videoFile(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'coineasy-upload-readback-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'short.mp4');
  await writeFile(file, Buffer.from('fake media; never sent to YouTube'));
  return file;
}

function isUncertain(error, reason) {
  assert.ok(error instanceof YouTubeUploadUncertainError);
  assert.equal(error.code, 'YOUTUBE_EXTERNAL_STATE_UNCERTAIN');
  assert.equal(error.automaticRetryAllowed, false);
  assert.equal(error.externalStateUncertain, true);
  assert.equal(error.verificationReason, reason);
  return true;
}

test('credentials require an explicit exact channel ID, never a channel handle', () => {
  assert.equal(assertYouTubeCredentials(env), true);
  for (const invalid of ['', undefined, '@coineasy', 'https://youtube.com/@coineasy', 'UCshort']) {
    assert.throws(() => assertYouTubeCredentials({ ...env, COINEASY_YT_CHANNEL_ID: invalid }), /COINEASY_YT_CHANNEL_ID/);
  }
});

test('metadata uses each reviewed metric value, timestamp and source without undefined fields', () => {
  const metadata = buildVideoMetadata(payload, new Date('2026-08-31T09:05:00Z'));
  for (const metric of payload.youtube.metrics) {
    assert.ok(metadata.snippet.description.includes(`${metric.label}: ${metric.value}`));
    assert.ok(metadata.snippet.description.includes(`관측: ${metric.as_of}`));
    assert.ok(metadata.snippet.description.includes(`지표 출처: ${metric.source_url}`));
  }
  assert.doesNotMatch(metadata.snippet.description, /undefined|null|NOT THE APPROVED METRIC|coiniseasy/);
  assert.match(metadata.snippet.description, /https:\/\/t\.me\/coineasy_official/);
  assert.match(metadata.snippet.description, /교육용 정보이며 투자·법률·세무 자문이 아닙니다/);
});

test('editorial metadata is mandatory; no price headline or stale display-field fallback', async () => {
  const cases = [
    { ...payload, editorial: {} },
    { ...payload, editorial: { ...payload.editorial, headline: '' } },
    { ...payload, editorial: { ...payload.editorial, sourceUrls: [] } },
    { ...payload, youtube: {} },
    { ...payload, youtube: { metrics: payload.youtube.metrics.slice(1) } },
    { ...payload, youtube: { metrics: [{ ...payload.youtube.metrics[0], as_of: '' }, ...payload.youtube.metrics.slice(1)] } },
    { ...payload, youtube: { metrics: [{ ...payload.youtube.metrics[0], source_url: 'https://example.com/not-approved' }, ...payload.youtube.metrics.slice(1)] } },
  ];
  for (const invalid of cases) {
    const { youtube, calls } = mockYouTube();
    await assert.rejects(() => uploadToYouTube('/unused.mp4', invalid, new Date(), { env, youtube }), /메타데이터/);
    assert.equal(calls.channels.length, 0);
    assert.equal(calls.inserts.length, 0);
  }
});

test('overlength copy fails before preflight/insert rather than truncating evidence or disclaimer', async () => {
  const cases = [
    [{ ...payload, editorial: { ...payload.editorial, headline: '제'.repeat(101) } }, /100자/],
    [{ ...payload, editorial: { ...payload.editorial, fact: '확인'.repeat(2600) } }, /5,000자/],
    [{ ...payload, editorial: { ...payload.editorial, sourceUrls: [...payload.editorial.sourceUrls, `https://example.com/${'a'.repeat(5000)}`] } }, /5,000자/],
  ];
  for (const [invalid, error] of cases) {
    const { youtube, calls } = mockYouTube();
    await assert.rejects(() => uploadToYouTube('/unused.mp4', invalid, new Date(), { env, youtube }), error);
    assert.equal(calls.channels.length, 0);
    assert.equal(calls.inserts.length, 0);
  }
});

test('private or nonpublishable preview fixtures are rejected before metadata, credentials and network', async () => {
  for (const preview of [{ privatePreview: true }, { publishable: false }]) {
    const { youtube, calls } = mockYouTube();
    await assert.rejects(() => uploadToYouTube('/unused.mp4', preview, new Date(), { env: {}, youtube }), /비공개 디자인 미리보기/);
    assert.equal(calls.channels.length, 0);
    assert.equal(calls.inserts.length, 0);
  }
});

test('preflight uses only mine channel readback and requires one exact owner', async () => {
  const { youtube, calls } = mockYouTube();
  const preflight = await preflightYouTubeUpload({ env, youtube });
  assert.equal(preflight.youtube, youtube);
  assert.equal(preflight.channelId, channelId);
  assert.equal(preflight.privacyStatus, 'public');
  assert.ok(!Number.isNaN(Date.parse(preflight.verifiedAt)));
  assert.ok(Object.isFrozen(preflight));
  assert.deepEqual(calls.channels[0].request, { part: ['id'], mine: true, maxResults: 2 });
  assert.equal(calls.channels[0].options.retry, false);
  assert.equal(calls.channels[0].options.retryConfig.retry, 0);
  assert.equal(calls.inserts.length, 0);
  assert.equal(calls.lists.length, 0);
});

test('missing, wrong, ambiguous, and paginated OAuth channel results fail before insert', async () => {
  const channelResults = [
    {},
    { data: { items: [] } },
    { data: { items: [{ id: otherChannelId }] } },
    { data: { items: [{ id: channelId }, { id: otherChannelId }] } },
    { data: { items: [{ id: channelId }], nextPageToken: 'more' } },
  ];
  for (const channels of channelResults) {
    const { youtube, calls } = mockYouTube({ channels });
    await assert.rejects(() => uploadToYouTube('/unused.mp4', payload, new Date(), { env, youtube }), /정확히 일치/);
    assert.equal(calls.inserts.length, 0);
  }
});

test('preflight transport errors do not expose credentials or request details', async () => {
  const secret = 'DO_NOT_LOG_THIS_TOKEN';
  const youtube = { channels: { async list() { throw new Error(`https://auth.example/?token=${secret}`); } } };
  await assert.rejects(() => preflightYouTubeUpload({ env, youtube }), (error) => {
    assert.match(error.message, /transport_error/);
    assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});

test('injected unverified preflight or changed config cannot bypass owner check', async () => {
  const { youtube, calls } = mockYouTube();
  await assert.rejects(() => uploadToYouTube('/unused.mp4', payload, new Date(), {
    env, preflight: { youtube, channelId, privacyStatus: 'public' },
  }), /사전 확인/);
  const preflight = await preflightYouTubeUpload({ env, youtube });
  await assert.rejects(() => uploadToYouTube('/unused.mp4', payload, new Date(), {
    env: { ...env, COINEASY_YT_CHANNEL_ID: otherChannelId }, preflight,
  }), /사전 확인/);
  await assert.rejects(() => uploadToYouTube('/unused.mp4', payload, new Date(), {
    env: { ...env, YT_PRIVACY_STATUS: 'private' }, preflight,
  }), /사전 확인/);
  assert.equal(calls.inserts.length, 0);
});

test('insert is attempted once with SDK retries disabled, then exact video readback precedes receipt', async (t) => {
  const file = await videoFile(t);
  const { youtube, calls } = mockYouTube();
  const preflight = await preflightYouTubeUpload({ env, youtube });
  const result = await uploadToYouTube(file, payload, new Date('2026-08-31T09:05:00Z'), { env, preflight });
  assert.equal(calls.channels.length, 1);
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0].options.retry, false);
  assert.deepEqual(calls.inserts[0].options.retryConfig, { retry: 0, noResponseRetries: 0 });
  assert.equal(calls.inserts[0].request.requestBody.status.privacyStatus, 'public');
  assert.equal(calls.inserts[0].request.requestBody.status.publishAt, undefined);
  assert.deepEqual(calls.lists[0].request, { part: ['snippet', 'status', 'processingDetails'], id: [videoId] });
  assert.equal(calls.lists[0].options.retry, false);
  assert.equal(result.videoId, videoId);
  assert.equal(result.videoUrl, `https://www.youtube.com/shorts/${videoId}`);
  assert.deepEqual({ ...result.verification, verifiedAt: 'TIMESTAMP' }, {
    channelId,
    privacyStatus: 'public',
    uploadStatus: 'processed',
    processingStatus: 'succeeded',
    readbackVerified: true,
    publicStateVerified: true,
    method: 'youtube.videos.list',
    verifiedAt: 'TIMESTAMP',
    readbackAttempts: 1,
  });
  await assert.rejects(() => uploadToYouTube(file, payload, new Date(), { env, preflight }), /사전 확인/);
  assert.equal(calls.inserts.length, 1);
});

test('private and unlisted canaries are verified but are never called public', async () => {
  for (const privacyStatus of ['private', 'unlisted']) {
    const { youtube } = mockYouTube({ results: [response(resource({ status: { uploadStatus: 'processed', privacyStatus } }))] });
    const result = await verifyUploadedVideo(youtube, videoId, { channelId, privacyStatus });
    assert.equal(result.verification.readbackVerified, true);
    assert.equal(result.verification.publicStateVerified, false);
    assert.equal(result.verification.privacyStatus, privacyStatus);
  }
});

test('processing and visibility propagation permit bounded read-only checks', async () => {
  const { youtube, calls } = mockYouTube({ results: [
    { data: { items: [] } },
    response(resource({ status: { uploadStatus: 'uploaded', privacyStatus: 'private' }, processingDetails: { processingStatus: 'processing' } })),
    response(),
  ] });
  const waits = [];
  const result = await verifyUploadedVideo(youtube, videoId, expected, {
    maxAttempts: 3, intervalMs: 25, wait: async (ms) => waits.push(ms),
  });
  assert.equal(result.verification.readbackAttempts, 3);
  assert.equal(calls.inserts.length, 0);
  assert.equal(calls.lists.length, 3);
  assert.deepEqual(waits, [25, 25]);
});

test('empty readback times out without resending insert and retains known video identity', async (t) => {
  const file = await videoFile(t);
  const { youtube, calls } = mockYouTube({ results: [{ data: { items: [] } }] });
  await assert.rejects(() => uploadToYouTube(file, payload, new Date(), {
    env, youtube, readback: { maxAttempts: 2, intervalMs: 0 },
  }), (error) => {
    isUncertain(error, 'readback_missing_video');
    assert.equal(error.videoId, videoId);
    assert.equal(error.videoUrl, `https://www.youtube.com/shorts/${videoId}`);
    return true;
  });
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.lists.length, 2);
});

test('insert acceptance without an ID stays uncertain and does not read or upload again', async (t) => {
  const file = await videoFile(t);
  const { youtube, calls } = mockYouTube({ insertedId: '' });
  await assert.rejects(() => uploadToYouTube(file, payload, new Date(), { env, youtube }), (error) => {
    isUncertain(error, 'insert_missing_video_id');
    assert.equal(error.videoId, null);
    return true;
  });
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.lists.length, 0);
});

test('malformed or non-11-character video IDs cannot become receipts', async (t) => {
  const file = await videoFile(t);
  for (const insertedId of ['short', 'waytoolongid12', '../TestShort01', 'https://youtu.be/TestShort01']) {
    const { youtube, calls } = mockYouTube({ insertedId });
    await assert.rejects(() => uploadToYouTube(file, payload, new Date(), { env, youtube }),
      (error) => isUncertain(error, 'insert_missing_video_id'));
    assert.equal(calls.inserts.length, 1);
    assert.equal(calls.lists.length, 0);
  }
});

test('insert transport uncertainty is never retried or logged as a success', async (t) => {
  const file = await videoFile(t);
  const { youtube, calls } = mockYouTube({ insertError: new Error('ECONNRESET') });
  const preflight = await preflightYouTubeUpload({ env, youtube });
  await assert.rejects(() => uploadToYouTube(file, payload, new Date(), { env, preflight }), (error) => isUncertain(error, 'insert_ECONNRESET'));
  await assert.rejects(() => uploadToYouTube(file, payload, new Date(), { env, preflight }), /사전 확인/);
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.lists.length, 0);
});

test('readback transport error retains accepted ID with no insert retry', async (t) => {
  const file = await videoFile(t);
  const { youtube, calls } = mockYouTube({ results: [Object.assign(new Error('secret response'), { response: { status: 403 } })] });
  await assert.rejects(() => uploadToYouTube(file, payload, new Date(), { env, youtube }), (error) => {
    isUncertain(error, 'readback_HTTP_403');
    assert.equal(error.videoId, videoId);
    assert.doesNotMatch(error.message, /secret response/);
    return true;
  });
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.lists.length, 1);
});

test('wrong ID/channel, failed processing, forced privacy and unexpected schedules fail closed', async () => {
  const cases = [
    [resource({ id: 'OtherVideo1' }), 'readback_video_id_mismatch'],
    [resource({ snippet: { channelId: otherChannelId } }), 'readback_channel_mismatch'],
    [resource({ processingDetails: { processingStatus: 'failed' } }), 'readback_processing_failed'],
    [resource({ processingDetails: { processingStatus: 'terminated' } }), 'readback_processing_failed'],
    [resource({ status: { uploadStatus: 'rejected', privacyStatus: 'public' } }), 'readback_processing_failed'],
    [resource({ status: { uploadStatus: 'processed', privacyStatus: 'private' } }), 'readback_privacy_mismatch'],
    [resource({ status: { uploadStatus: 'processed', privacyStatus: 'public', publishAt: '2026-09-01T11:30:00Z' } }), 'readback_unexpected_schedule'],
  ];
  for (const [video, reason] of cases) {
    const { youtube, calls } = mockYouTube({ results: [response(video)] });
    await assert.rejects(() => verifyUploadedVideo(youtube, videoId, expected), (error) => isUncertain(error, reason));
    assert.equal(calls.lists.length, 1);
    assert.equal(calls.inserts.length, 0);
  }
});

test('all processing proof is required and readback bounds cannot be disabled', async () => {
  const { youtube, calls } = mockYouTube({ results: [response(resource({ processingDetails: {} }))] });
  await assert.rejects(() => verifyUploadedVideo(youtube, videoId, expected, { maxAttempts: 2, intervalMs: 0 }),
    (error) => isUncertain(error, 'readback_processing_not_complete'));
  assert.equal(calls.lists.length, 2);
  for (const options of [{ maxAttempts: 0 }, { maxAttempts: Infinity }, { maxAttempts: 25 }, { intervalMs: -1 }, { intervalMs: 60000 }]) {
    await assert.rejects(() => verifyUploadedVideo(youtube, videoId, expected, options),
      (error) => isUncertain(error, 'readback_invalid_poll_bound'));
  }
  assert.equal(calls.lists.length, 2);
});

test('empty local media fails before any insert request', async (t) => {
  const file = await videoFile(t);
  await writeFile(file, Buffer.alloc(0));
  const { youtube, calls } = mockYouTube();
  await assert.rejects(() => uploadOnce(youtube, file, {}), /비어 있습니다/);
  assert.equal(calls.inserts.length, 0);
});

async function rendererTemp(t, { marker = true, outside = false } = {}) {
  const root = outside ? os.tmpdir() : OUTPUT_DIR;
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(path.join(root, 'editorial-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'coineasy-editorial.mp4');
  await writeFile(file, 'fake generated video');
  if (marker) {
    await writeFile(path.join(dir, '.coineasy-editorial-temp.json'), JSON.stringify({ schema_version: 1, owner: 'coineasy-editorial-renderer' }));
  }
  return { dir, file };
}

test('cleanup removes only owned renderer temp directory and leaves siblings', async (t) => {
  const owned = await rendererTemp(t);
  const sibling = await rendererTemp(t);
  assert.equal(cleanupVideo(owned.file), true);
  await assert.rejects(() => access(owned.dir), /ENOENT/);
  assert.equal(await readFile(sibling.file, 'utf8'), 'fake generated video');
});

test('cleanup refuses outside root, missing/wrong marker, wrong filename and broad paths', async (t) => {
  const outside = await rendererTemp(t, { outside: true });
  const unmarked = await rendererTemp(t, { marker: false });
  const wrongOwner = await rendererTemp(t);
  const wrongFile = await rendererTemp(t);
  await writeFile(path.join(wrongOwner.dir, '.coineasy-editorial-temp.json'), JSON.stringify({ schema_version: 1, owner: 'someone-else' }));
  const unrelated = path.join(wrongFile.dir, 'unrelated.mp4');
  await writeFile(unrelated, 'preserve this');
  for (const file of [outside.file, unmarked.file, wrongOwner.file, unrelated, '/', OUTPUT_DIR, 'relative/coineasy-editorial.mp4']) {
    assert.equal(cleanupVideo(file), false);
  }
  for (const preserved of [outside.file, unmarked.file, wrongOwner.file, unrelated]) await access(preserved);
});

test('cleanup refuses symlink directory, file or ownership marker', async (t) => {
  const target = await rendererTemp(t);
  const linkOwner = await rendererTemp(t);
  const linkedDir = path.join(linkOwner.dir, 'editorial-abcdef');
  await symlink(target.dir, linkedDir, 'dir');
  assert.equal(cleanupVideo(path.join(linkedDir, 'coineasy-editorial.mp4')), false);

  const fileLink = await rendererTemp(t);
  await rm(fileLink.file);
  await symlink(target.file, fileLink.file);
  assert.equal(cleanupVideo(fileLink.file), false);

  const markerLink = await rendererTemp(t);
  const marker = path.join(markerLink.dir, '.coineasy-editorial-temp.json');
  await rm(marker);
  await symlink(path.join(target.dir, '.coineasy-editorial-temp.json'), marker);
  assert.equal(cleanupVideo(markerLink.file), false);
  for (const preserved of [target.file, fileLink.file, markerLink.file]) await access(preserved);
});
