// src/index.js
// ============
// CoinEasyInsightBriefing — main entry point.
//
// Runs four independent daily cron jobs:
//   1. Figma banner → Telegram (KST 08:00 = UTC 23:00)
//   2. YouTube Shorts AM      (KST 08:05 = UTC 23:05)
//   3. Figma banner → Telegram (KST 18:00 = UTC 09:00)
//   4. YouTube Shorts PM      (KST 18:05 = UTC 09:05)
//
// Session types: 'morning' and 'evening'
// All jobs are isolated; a failure in one does not abort the other.

'use strict';

const cron = require('node-cron');

const { runDailyFigma }       = require('./figma-daily/runDailyFigma');
const { buildPayload }        = require('./figma-daily/figmaDataBuilder');
const { generateYouTubeShort } = require('./youtube-shorts-generator');
const { uploadToYouTube, cleanupVideo } = require('./youtube-uploader');

// ─── Session helper ──────────────────────────────────────

function getSession(now) {
  const kstHour = (now.getUTCHours() + 9) % 24;
  if (kstHour < 12) {
    return {
      type: 'morning',
      label: '아침',
      greeting: '좋은 아침입니다',
      footer: '매일 아침 8시 · 저녁 6시',
      cta: '오늘 하루도 현명한 투자 하세요',
    };
  }
  return {
    type: 'evening',
    label: '저녁',
    greeting: '저녁 시황 업데이트입니다',
    footer: '매일 아침 8시 · 저녁 6시',
    cta: '내일도 코인이지와 함께 하세요',
  };
}

// ─── YouTube Shorts pipeline ─────────────────────────────

async function runYouTubeShorts(session) {
  const startTs = new Date();
  console.log(`[${startTs.toISOString()}] 🎬 YouTube Shorts (${session.label}) 파이프라인 시작`);

  let videoPath = null;

  try {
    console.log('  📊 시장 데이터 수집 중…');
    const payload = await buildPayload(startTs, session);
    console.log('  ✓ 페이로드 빌드 완료');

    console.log('  🎥 YouTube Short 영상 생성 중…');
    videoPath = await generateYouTubeShort(payload);
    console.log(`  ✓ 영상 생성 완료: ${videoPath}`);

    console.log('  📤 YouTube 업로드 중…');
    const videoUrl = await uploadToYouTube(videoPath, payload, startTs);
    console.log(`  ✓ YouTube 업로드 완료: ${videoUrl}`);

    cleanupVideo(videoPath);

    const elapsedMs = Date.now() - startTs.getTime();
    console.log(`[${new Date().toISOString()}] ✅ YouTube Shorts (${session.label}) 완료 (${elapsedMs}ms)`);

    return { success: true, videoUrl, elapsedMs };

  } catch (e) {
    console.error(`[${new Date().toISOString()}] ✗ YouTube Shorts (${session.label}) 에러: ${e.message}`);
    console.error(e.stack);

    if (videoPath) {
      try { cleanupVideo(videoPath); } catch (_) { /* ignore */ }
    }

    return { success: false, error: e.message };
  }
}

// ─── Cron schedule ───────────────────────────────────────

// MORNING (KST 08:00 = UTC 23:00)

cron.schedule('0 23 * * *', async () => {
  const session = getSession(new Date());
  console.log('\n' + '='.repeat(60));
  console.log(`[${new Date().toISOString()}] ⏰ Job 1: Figma/Telegram (${session.label}) 시작`);
  console.log('='.repeat(60));

  try {
    const result = await runDailyFigma();
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✅ Job 1 완료`);
    } else {
      console.error(`[${new Date().toISOString()}] ⚠️ Job 1 실패: ${result.error}`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ✗ Job 1 예외: ${e.message}`);
    console.error(e.stack);
  }
}, { timezone: 'UTC' });

cron.schedule('5 23 * * *', async () => {
  const session = getSession(new Date());
  console.log('\n' + '='.repeat(60));
  console.log(`[${new Date().toISOString()}] ⏰ Job 2: YouTube Shorts (${session.label}) 시작`);
  console.log('='.repeat(60));

  try {
    const result = await runYouTubeShorts(session);
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✅ Job 2 완료: ${result.videoUrl}`);
    } else {
      console.error(`[${new Date().toISOString()}] ⚠️ Job 2 실패: ${result.error}`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ✗ Job 2 예외: ${e.message}`);
    console.error(e.stack);
  }
}, { timezone: 'UTC' });

// EVENING (KST 18:00 = UTC 09:00)

cron.schedule('0 9 * * *', async () => {
  const session = getSession(new Date());
  console.log('\n' + '='.repeat(60));
  console.log(`[${new Date().toISOString()}] ⏰ Job 3: Figma/Telegram (${session.label}) 시작`);
  console.log('='.repeat(60));

  try {
    const result = await runDailyFigma();
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✅ Job 3 완료`);
    } else {
      console.error(`[${new Date().toISOString()}] ⚠️ Job 3 실패: ${result.error}`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ✗ Job 3 예외: ${e.message}`);
    console.error(e.stack);
  }
}, { timezone: 'UTC' });

cron.schedule('5 9 * * *', async () => {
  const session = getSession(new Date());
  console.log('\n' + '='.repeat(60));
  console.log(`[${new Date().toISOString()}] ⏰ Job 4: YouTube Shorts (${session.label}) 시작`);
  console.log('='.repeat(60));

  try {
    const result = await runYouTubeShorts(session);
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✅ Job 4 완료: ${result.videoUrl}`);
    } else {
      console.error(`[${new Date().toISOString()}] ⚠️ Job 4 실패: ${result.error}`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ✗ Job 4 예외: ${e.message}`);
    console.error(e.stack);
  }
}, { timezone: 'UTC' });

// ─── Startup ─────────────────────────────────────────────

console.log('');
console.log('CoinEasyInsightBriefing - scheduler started');
console.log('Job 1 (Figma AM)  : daily UTC 23:00 (KST 08:00)');
console.log('Job 2 (Shorts AM) : daily UTC 23:05 (KST 08:05)');
console.log('Job 3 (Figma PM)  : daily UTC 09:00 (KST 18:00)');
console.log('Job 4 (Shorts PM) : daily UTC 09:05 (KST 18:05)');
console.log('');

// === ONE-TIME TEST: run immediately on deploy ===
(async () => {
  console.log('[TEST] 🚀 즉시 실행 테스트 시작...');
  try {
    const session = getSession(new Date());
    console.log('[TEST] Session:', session.label);
    const result = await runDailyFigma();
    console.log('[TEST] runDailyFigma result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('[TEST] 에러:', e.message);
    console.error(e.stack);
  }
})();
