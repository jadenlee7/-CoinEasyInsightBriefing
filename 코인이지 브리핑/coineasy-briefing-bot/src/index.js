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
import { postBriefingToSocial } from './typefully-poster.js';

// ─── Crash protection ────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err.message);
  console.error(err.stack);
});

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
    // 1) HTML 특수문자 먼저 이스케이프 (예: "Fear & Greed" 파싱 깨짐 방지)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 2) Markdown → HTML 태그
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
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

    // Step 3: 배너 이미지 발송 + 브리핑 텍스트 발송 (별도 메시지)
    // 텔레그램 캡션은 1024자 제한 → 브리핑(~2000자)을 캡션에 넣으면 잘림.
    // 그래서 배너 사진(캡션 없이) + 전체 브리핑을 별도 메시지로 발송한다.
    console.log('\n🎨 Step 3: 배너 이미지 생성 + 포스팅...');
    const targetChatId = CONFIG.channelId || CONFIG.chatId;
    let savedBannerBuffer = null;  // Step 4 Typefully에서도 사용
    try {
      const bannerResult = await exportFigmaBanner(data);
      if (bannerResult && bannerResult.buffer) {
        console.log(`  ✅ 배너 생성 완료 (${(bannerResult.size / 1024).toFixed(1)}KB)`);
        savedBannerBuffer = bannerResult.buffer;
        if (targetChatId && CONFIG.botToken) {
          // 1) 배너 이미지 발송 (캡션 없이)
          const photoSent = await sendTelegramPhoto(
            bannerResult.buffer,
            null,
            targetChatId,
            CONFIG.botToken
          );
          console.log(`  ${photoSent ? '✅' : '❌'} 배너 이미지 공지방 발송`);
        }
      } else {
        console.log('  ⚠️ 배너 생성 실패 — 텍스트만 발송');
      }
    } catch (bannerErr) {
      console.error(`  ⚠️ 배너 에러: ${bannerErr.message}`);
    }

    // 2) 전체 브리핑 텍스트 발송 (배너 성공 여부와 무관하게 항상 발송)
    if (briefingText && targetChatId && CONFIG.botToken) {
      const htmlBriefing = markdownToHtml(briefingText);
      const textSent = await sendTelegramMessage(htmlBriefing, targetChatId, CONFIG.botToken);
      console.log(`  ${textSent ? '✅' : '❌'} 브리핑 텍스트 공지방 발송`);
    }

    // Step 4: Typefully 소셜 포스팅 (X + LinkedIn + Threads)
    if (briefingText && process.env.TYPEFULLY_API_KEY && process.env.TYPEFULLY_SOCIAL_SET_ID) {
      console.log('\n📱 Step 4: Typefully 소셜 포스팅 중...');
      try {
        // 소셜 미디어용 텍스트 (Markdown 제거 + 간결하게)
        const socialText = briefingText
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) → text
          .replace(/\*([^*]+)\*/g, '$1')               // *bold* → bold
          .replace(/_([^_]+)_/g, '$1')                   // _italic_ → italic
          .replace(/^.*#[^\s#]+(?:\s+#[^\s#]+)*\s*$/gm, '')  // 해시태그만 있는 줄 통째로 제거 (한국어/영어 모두)
          .replace(/\s+#[^\s#]+/g, '')                 // 인라인 해시태그도 제거
          .replace(/📢.*$/gm, '')                        // 공지방 링크 줄 제거
          .replace(/\n{3,}/g, '\n\n')                 // 빈 줄 정리
          .trim();

        // 배너 이미지 (Step 3에서 생성한 것 직접 사용)
        if (savedBannerBuffer) {
          console.log(`  🖼️ 배너 버퍼 사용 (${Math.round(savedBannerBuffer.length / 1024)}KB)`);
        } else {
          console.log('  ⚠️ 배너 없음 — 텍스트만 포스팅');
        }

        console.log(`  📝 소셜 텍스트: ${socialText.length}자`);
        const socialResult = await postBriefingToSocial(socialText, savedBannerBuffer);
        if (socialResult.success) {
          console.log(`  ✅ Typefully 포스팅 완료!`);
          if (socialResult.xUrl) console.log(`    → X: ${socialResult.xUrl}`);
        } else {
          console.error(`  ⚠️ Typefully 포스팅 실패: ${socialResult.error}`);
        }
      } catch (tfErr) {
        console.error(`  ❌ Typefully 에러: ${tfErr.message}`);
        console.error(tfErr.stack);
      }
    } else {
      const missing = [];
      if (!process.env.TYPEFULLY_API_KEY) missing.push('TYPEFULLY_API_KEY');
      if (!process.env.TYPEFULLY_SOCIAL_SET_ID) missing.push('TYPEFULLY_SOCIAL_SET_ID');
      console.log(`\n⏭️ Step 4: Typefully 스킵 (미설정: ${missing.join(', ') || 'briefingText 없음'})`);
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

// === ONE-TIME TEST TRIGGER ===
(async () => {
  console.log('ONE-TIME TEST: Running briefing pipeline...');
  await runBriefingPipeline();
  console.log('ONE-TIME TEST: Complete!');
})();

