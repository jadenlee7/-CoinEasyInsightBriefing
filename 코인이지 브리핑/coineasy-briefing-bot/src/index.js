// src/index.js
// ============
// CoinEasyInsightBriefing — main entry point.
//
// Runs two independent daily cron jobs (KST 08:00 = UTC 23:00):
//   1. Figma banner → Telegram announcement channel  (UTC 23:00)
//   2. YouTube Shorts generation + upload            (UTC 23:05)
//
// All jobs are isolated; a failure in one does not abort the other.

'use strict';

const cron = require('node-cron');

const { runDailyFigma }        = require('./figma-daily/runDailyFigma');
const { buildPayload }         = require('./figma-daily/figmaDataBuilder');
const { generateYouTubeShort } = require('./youtube-shorts-generator');
const { uploadToYouTube, cleanupVideo } = require('./youtube-uploader');

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
      try { cleanupVideo(videoPath); } catch (_) { /* ignore */ }
    }

    return { success: false, error: e.message };
  }
}

// ─── Cron schedule ───────────────────────────────────────

// Job 1: Figma banner → Telegram  (UTC 23:00 = KST 08:00)
cron.schedule('0 23 * * *', async () => {
  console.log('\n' + '='.repeat(60));
  console.log(`[${new Date().toISOString()}] ⏰ Job 1: Figma/Telegram 시작`);
  console.log('='.repeat(60));

  try {
    const result = await runDailyFigma();
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✅ Job 1 완료`);
    } else {
      console.error(`[${new Date().toISOString()}] ⚠️  Job 1 실패: ${result.error}`);
    }
  } catch (e) {
    // Catch any unexpected error so it never propagates to the cron runner
    console.error(`[${new Date().toISOString()}] ✗ Job 1 예외: ${e.message}`);
    console.error(e.stack);
  }
}, { timezone: 'UTC' });

// Job 2: YouTube Shorts  (UTC 23:05 = KST 08:05, 5 min after Figma)
cron.schedule('5 23 * * *', async () => {
  console.log('\n' + '='.repeat(60));
  console.log(`[${new Date().toISOString()}] ⏰ Job 2: YouTube Shorts 시작`);
  console.log('='.repeat(60));

  try {
    const result = await runYouTubeShorts();
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✅ Job 2 완료: ${result.videoUrl}`);
    } else {
      console.error(`[${new Date().toISOString()}] ⚠️  Job 2 실패: ${result.error}`);
    }
  } catch (e) {
    // Catch any unexpected error so it never propagates to the cron runner
    console.error(`[${new Date().toISOString()}] ✗ Job 2 예외: ${e.message}`);
    console.error(e.stack);
  }
}, { timezone: 'UTC' });

// ─── Startup ─────────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║       CoinEasyInsightBriefing — 스케줄러 시작            ║');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log('║  Job 1 (Figma/Telegram) : 매일 UTC 23:00 (KST 08:00)   ║');
console.log('║  Job 2 (YouTube Shorts) : 매일 UTC 23:05 (KST 08:05)   ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('');

// ─── ONE-TIME TEST: run YouTube Shorts immediately on deploy ────
// TODO: Remove this block after testing
(async () => {
    console.log('\n🧪 [TEST] YouTube Shorts 즉시 테스트 실행...\n');
    try {
          const result = await runYouTubeShorts();
          if (result.success) {
                  console.log(`\n🧪 [TEST] ✅ 성공! URL: ${result.videoUrl} (${result.elapsedMs}ms)\n`);
          } else {
                  console.error(`\n🧪 [TEST] ❌ 실패: ${result.error}\n`);
          }
    } catch (e) {
          console.error(`\n🧪 [TEST] 💥 예외: ${e.message}\n`);
          console.error(e.stack);
    }
})();
