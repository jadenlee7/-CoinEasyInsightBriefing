// src/index.js
// ============
// CoinEasyInsightBriefing — main entry point.
//
// Runs a set of daily cron jobs (KST 08:00 = UTC 23:00):
//   1. Figma banner → Telegram announcement channel
//   2. YouTube Shorts generation + upload
//
// All jobs are independent; a failure in one does not abort the others.

'use strict';

const cron = require('node-cron');

const { runDailyFigma }        = require('./figma-daily/runDailyFigma');
const { generateYouTubeShort } = require('./youtube-shorts-generator');
const { uploadToYouTube, cleanupVideo } = require('./youtube-uploader');
const { buildPayload }         = require('./figma-daily/figmaDataBuilder');

// ─── YouTube Shorts pipeline ─────────────────────────────

async function runYouTubeShorts() {
  const startTs = new Date();
  console.log(`[${startTs.toISOString()}] 🎬 YouTube Shorts 파이프라인 시작`);

  let videoPath = null;

  try {
    // 1) Fetch market data (reuse the same payload builder as the banner)
    console.log('  📊 시장 데이터 수집 중…');
    const payload = await buildPayload(startTs);
    console.log('  ✓ 페이로드 빌드 완료');

    // 2) Generate the Short video
    console.log('  🎥 YouTube Short 영상 생성 중…');
    videoPath = await generateYouTubeShort(payload);
    console.log(`  ✓ 영상 생성 완료: ${videoPath}`);

    // 3) Upload to YouTube
    console.log('  📤 YouTube 업로드 중…');
    const videoUrl = await uploadToYouTube(videoPath, payload, startTs);
    console.log(`  ✓ YouTube 업로드 완료: ${videoUrl}`);

    // 4) Clean up local file
    cleanupVideo(videoPath);

    const elapsedMs = Date.now() - startTs.getTime();
    console.log(`[${new Date().toISOString()}] ✅ YouTube Shorts 완료 (${elapsedMs}ms)`);

    return { success: true, videoUrl, elapsedMs };

  } catch (e) {
    console.error(`[${new Date().toISOString()}] ✗ YouTube Shorts 에러: ${e.message}`);
    console.error(e.stack);

    // Best-effort cleanup on failure
    if (videoPath) {
      try { cleanupVideo(videoPath); } catch (_) {}
    }

    return { success: false, error: e.message };
  }
}

// ─── Cron schedules ──────────────────────────────────────

// KST 08:00 = UTC 23:00 (previous day)
// Figma banner + Telegram
cron.schedule('0 23 * * *', async () => {
  console.log(`[${new Date().toISOString()}] ⏰ Cron: runDailyFigma`);
  try {
    await runDailyFigma();
  } catch (e) {
    console.error('runDailyFigma uncaught:', e.message);
  }
}, { timezone: 'UTC' });

// KST 08:05 = UTC 23:05 — slight offset so Figma job finishes first
cron.schedule('5 23 * * *', async () => {
  console.log(`[${new Date().toISOString()}] ⏰ Cron: runYouTubeShorts`);
  await runYouTubeShorts();
}, { timezone: 'UTC' });

// ─── Startup ─────────────────────────────────────────────

console.log(`[${new Date().toISOString()}] 🚀 CoinEasyInsightBriefing 봇 시작`);
console.log('  Cron jobs:');
console.log('    UTC 23:00 — Figma banner + Telegram');
console.log('    UTC 23:05 — YouTube Shorts');
console.log('  대기 중…');
