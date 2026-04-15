// src/index.js
// ============
// CoinEasyInsightBriefing — 원래 파이프라인 복원 (ESM)
//
// 매일 2회 (KST 08:00 + 18:00) 실행:
// 1. 데이터 수집 → 배너 이미지 생성 → 텔레그램 공지방 포스팅
// 2. AI 텍스트 브리핑 생성 → 텔레그램 공지방 포스팅
// 3. YouTube Shorts 생성 → 업로드

import cron from 'node-cron';
import { collectAllData } from './fetcher.js';
import { generateTelegramBriefing } from './generator.js';
import { sendTelegramMessage } from './telegram.js';
import { exportFigmaBanner, sendTelegramPhoto } from './figma-banner.js';

// ─── 환경변수 ──────────────────────────────────────────
const CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  channelId: process.env.TELEGRAM_CHANNEL_ID,
  chatId: process.env.TELEGRAM_CHAT_ID || '',
};

// ─── Session helper ────────────────────────────────────
function getSession(now) {
  const kstHour = (now.getUTCHours() + 9) % 24;
  if (kstHour < 12) {
    return { type: 'morning', label: '아침', greeting: '좋은 아침입니다' };
  }
  return { type: 'evening', label: '저녁', greeting: '저녁 시황 업데이트입니다' };
}

// ─── Markdown → HTML 변환 ──────────────────────────────
function markdownToHtml(text) {
  return text
    .replace(/\*([^*]+)\*/g, '<b>$1</b>')
    .replace(/_([^_]+)_/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function buildFooter() {
  // footer는 generator.js에서 처리 (링크 + 해시태그)
  return '';
}
// ─── 메인 브리핑 파이프라인 ────────────────────────────
async function runBriefingPipeline() {
  const startTime = Date.now();
  const session = getSession(new Date());
  console.log('\n' + '='.repeat(60));
  console.log(`🌅 코인이지 데일리 브리핑 파이프라인 시작 (${session.label})`);
  console.log('='.repeat(60));

  try {
    // Step 1: 데이터 수집
    console.log('\n📡 Step 1: 데이터 수집 중...');
    const data = await collectAllData();
    if (!data.market && !data.fearGreed && !data.kimchi) {
      console.error('❌ 핵심 데이터 수집 실패. 파이프라인 중단.');
      return;
    }

    // Step 2: AI 텍스트 브리핑 생성
    console.log('\n✍️ Step 2: AI 텍스트 브리핑 생성 중...');
    let briefingText = '';
    const telegramBriefing = await generateTelegramBriefing(data);
    if (telegramBriefing) {
      // ## 헤더 제거 (혹시 AI가 생성했을 경우 안전장치)
      briefingText = telegramBriefing.replace(/^##\s*/gm, '') + buildFooter();
      console.log(`  ✅ 브리핑 생성 완료 (${briefingText.length}자)`);
    } else {
      console.error('  ❌ 브리핑 생성 실패');
    }

    // Step 3: 배너 이미지 생성 + 브리핑 캡션으로 합쳐서 한 포스트로 전송
    console.log('\n🎨 Step 3: 배너 이미지 생성 + 포스팅...');
    const targetChatId = CONFIG.channelId || CONFIG.chatId;
    try {
      const bannerResult = await exportFigmaBanner(data);
      if (bannerResult && bannerResult.buffer) {
        console.log(`  ✅ 배너 생성 완료 (${(bannerResult.size / 1024).toFixed(1)}KB)`);
        if (targetChatId && CONFIG.botToken) {
          // 배너 이미지 + 텍스트 브리핑을 캡션으로 합쳐서 하나의 포스트로 전송
          const caption = briefingText || null;
          const photoSent = await sendTelegramPhoto(
            bannerResult.buffer,
            caption,
            targetChatId,
            CONFIG.botToken
          );
          console.log(`  ${photoSent ? '✅' : '❌'} 배너+브리핑 합쳐서 공지방 발송`);
        }
      } else {
        console.log('  ⚠️ 배너 생성 실패 — 텍스트만 발송');
        if (briefingText && targetChatId && CONFIG.botToken) {
          const htmlBriefing = markdownToHtml(briefingText);
          await sendTelegramMessage(htmlBriefing, targetChatId, CONFIG.botToken);
          console.log('  ✅ 텍스트 브리핑만 공지방 발송');
        }
      }
    } catch (bannerErr) {
      console.error(`  ⚠️ 배너 에러: ${bannerErr.message}`);
      // 배너 실패 시 텍스트만 발송
      if (briefingText && targetChatId && CONFIG.botToken) {
        const htmlBriefing = markdownToHtml(briefingText);
        await sendTelegramMessage(htmlBriefing, targetChatId, CONFIG.botToken);
        console.log('  ✅ 텍스트 브리핑만 공지방 발송 (배너 fallback)');
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log(`✅ 파이프라인 완료! (${elapsed}초)`);
    console.log('='.repeat(60) + '\n');

  } catch (err) {
    console.error(`\n❌ 파이프라인 에러: ${err.message}`);
    console.error(err.stack);
  }
}

// ─── YouTube Shorts pipeline ──────────────────────────
async function runYouTubeShorts(session) {
  try {
    const { generateYouTubeShort } = await import('./youtube-shorts-generator.js');
    const { uploadToYouTube, cleanupVideo } = await import('./youtube-uploader-new.js');
    const { buildPayload } = await import('./figma-daily/figmaDataBuilder.js');

    const startTs = new Date();
    console.log(`[${startTs.toISOString()}] 🎬 YouTube Shorts (${session.label}) 파이프라인 시작`);

    let videoPath = null;
    const payload = await buildPayload(startTs, session);
    videoPath = await generateYouTubeShort(payload);
    console.log(`  ✓ 영상 생성 완료: ${videoPath}`);

    const videoUrl = await uploadToYouTube(videoPath, payload, startTs);
    console.log(`  ✓ YouTube 업로드 완료: ${videoUrl}`);
    cleanupVideo(videoPath);

    const elapsedMs = Date.now() - startTs.getTime();
    console.log(`✅ YouTube Shorts (${session.label}) 완료 (${elapsedMs}ms)`);
    return { success: true, videoUrl, elapsedMs };
  } catch (e) {
    console.error(`✗ YouTube Shorts 에러: ${e.message}`);
    return { success: false, error: e.message };
  }
}

// ─── Cron schedule ────────────────────────────────────
// MORNING (KST 08:00 = UTC 23:00)
cron.schedule('0 23 * * *', async () => {
  console.log(`\n⏰ Job 1: 브리핑 파이프라인 (아침) 시작`);
  await runBriefingPipeline();
}, { timezone: 'UTC' });

cron.schedule('5 23 * * *', async () => {
  const session = getSession(new Date());
  console.log(`\n⏰ Job 2: YouTube Shorts (${session.label}) 시작`);
  await runYouTubeShorts(session);
}, { timezone: 'UTC' });

// EVENING (KST 18:00 = UTC 09:00)
cron.schedule('0 9 * * *', async () => {
  console.log(`\n⏰ Job 3: 브리핑 파이프라인 (저녁) 시작`);
  await runBriefingPipeline();
}, { timezone: 'UTC' });

// [DISABLED - YouTube Shorts only at KST 08:00]
// cron.schedule('5 9 * * *', async () => {
  // const session = getSession(new Date());
  // console.log(`\n⏰ Job 4: YouTube Shorts (${session.label}) 시작`);
  // await runYouTubeShorts(session);
// }, { timezone: 'UTC' });

// ─── Startup ──────────────────────────────────────────
console.log('');
console.log('CoinEasyInsightBriefing - scheduler started');
console.log('Job 1 (Briefing AM) : daily UTC 23:00 (KST 08:00)');
console.log('Job 2 (Shorts AM)   : daily UTC 23:05 (KST 08:05)');
console.log('Job 3 (Briefing PM) : daily UTC 09:00 (KST 18:00)');
console.log('Job 4 (Shorts PM)   : daily UTC 09:05 (KST 18:05)');
console.log('');

