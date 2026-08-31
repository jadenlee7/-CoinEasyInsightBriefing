// src/index.js
// ============
// CoinEasyInsightBriefing — 원래 파이프라인 복원 (ESM)
//
// 매일 2회 (KST 08:00 + 18:00) 실행:
// 1. 데이터 수집 → 배너 이미지 생성 → 텔레그램 공지방 포스팅
// 2. AI 텍스트 브리핑 생성 → 텔레그램 공지방 포스팅
// 3. YouTube Shorts 생성 → 업로드

import cron from 'node-cron';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { collectAllData } from './fetcher.js';
import { generateTelegramBriefing, BRIEFING_FOOTER_HTML } from './generator.js';
import { sendTelegramMessage } from './telegram.js';
import { exportFigmaBanner, sendTelegramPhoto } from './figma-banner.js';
import { postBriefingToSocial } from './typefully-poster.js';
import { renderDigestCard } from './brand-card.js';
import { composeEnglishDigest } from './social-composer.js';

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

// DIGEST_V2_DRYRUN=1(on/true/yes)이면 발행 대신 렌더 결과를 파일/로그로만 남긴다.
// 배포 직후 v2 카드를 검수하기 위한 게이트 — 미설정(기본)이면 정상 발행.
const DIGEST_V2_DRYRUN = /^(1|true|on|yes)$/i.test(process.env.DIGEST_V2_DRYRUN || '');

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
    let briefingText = '';   // LLM 본문 (Markdown, footer 없음)
    let tgCaption = '';      // TG 캡션 (HTML 변환 + 해시태그/CTA footer)
    const telegramBriefing = await generateTelegramBriefing(data);
    if (telegramBriefing) {
      // ## 헤더 제거 (혹시 AI가 생성했을 경우 안전장치)
      briefingText = telegramBriefing.replace(/^##\s*/gm, '');
      tgCaption = markdownToHtml(briefingText) + BRIEFING_FOOTER_HTML;
      console.log(`  ✅ 브리핑 생성 완료 (${briefingText.length}자)`);
    } else {
      console.error('  ❌ 브리핑 생성 실패');
    }

    // Step 3: 배너 이미지 + 컴팩트 브리핑을 하나의 포스트로 발송
    // 브리핑이 700자 이내로 컴팩트해서 캡션(1024자 제한)에 들어감 → 한 포스트로 합침.
    console.log('\n🎨 Step 3: 배너 이미지 생성 + 포스팅...');
    const targetChatId = CONFIG.channelId || CONFIG.chatId;
    let savedBannerBuffer = null;  // Step 4 Typefully에서도 사용
    let posted = false;
    try {
      const bannerResult = await exportFigmaBanner(data);
      if (bannerResult && bannerResult.buffer) {
        console.log(`  ✅ 배너 생성 완료 (${(bannerResult.size / 1024).toFixed(1)}KB)`);
        savedBannerBuffer = bannerResult.buffer;
        if (DIGEST_V2_DRYRUN) {
          console.log(`  🧪 DIGEST_V2_DRYRUN — 텔레그램 발송 스킵 (렌더 파일: ${bannerResult.filename})`);
          posted = true; // 텍스트 fallback 발송도 막는다
        } else if (targetChatId && CONFIG.botToken) {
          // 배너 사진 + 브리핑을 캡션으로 합쳐서 한 포스트로 발송 (parse_mode HTML)
          const photoSent = await sendTelegramPhoto(
            bannerResult.buffer,
            tgCaption || null,
            targetChatId,
            CONFIG.botToken
          );
          console.log(`  ${photoSent ? '✅' : '❌'} 배너+브리핑 한 포스트로 공지방 발송`);
          posted = photoSent;
        }
      } else {
        console.log('  ⚠️ 배너 생성 실패 — 텍스트만 발송');
      }
    } catch (bannerErr) {
      console.error(`  ⚠️ 배너 에러: ${bannerErr.message}`);
    }

    // 배너 발송이 안 됐으면(배너 실패 등) 텍스트만이라도 발송 (누락 방지)
    if (!posted && !DIGEST_V2_DRYRUN && tgCaption && targetChatId && CONFIG.botToken) {
      const textSent = await sendTelegramMessage(tgCaption, targetChatId, CONFIG.botToken);
      console.log(`  ${textSent ? '✅' : '❌'} 브리핑 텍스트만 공지방 발송 (배너 fallback)`);
    }

    // Step 4: Typefully 소셜 포스팅 (X + LinkedIn + Threads)
    // 채널 정책: 전부 영어, 해시태그/링크/팔로우 CTA 금지 (데이터 기반 EN 컴포저 사용)
    if (DIGEST_V2_DRYRUN) {
      console.log('\n🧪 Step 4: DIGEST_V2_DRYRUN — Typefully 발행 스킵, 렌더/캡션만 저장');
      try {
        const bannersDir = './banners';
        if (!existsSync(bannersDir)) await mkdir(bannersDir, { recursive: true });
        const dateStr = new Date().toISOString().split('T')[0];
        try {
          const enBuffer = await renderDigestCard(data, session, 'en');
          const enPath = `${bannersDir}/dryrun_digest_en_${dateStr}.png`;
          await writeFile(enPath, enBuffer);
          console.log(`  🧪 EN 카드 저장: ${enPath}`);
        } catch (enErr) {
          console.warn(`  ⚠️ EN 카드 렌더 실패: ${enErr.message}`);
        }
        const captionPath = `${bannersDir}/dryrun_captions_${dateStr}.txt`;
        const captionDump = [
          '=== TG caption (parse_mode HTML) ===',
          tgCaption || '(없음)',
          '',
          '=== Typefully EN ===',
          composeEnglishDigest(data, session),
          '',
        ].join('\n');
        await writeFile(captionPath, captionDump, 'utf8');
        console.log(`  🧪 캡션 저장: ${captionPath}`);
      } catch (dryErr) {
        console.warn(`  ⚠️ dry-run 저장 에러: ${dryErr.message}`);
      }
    } else if (briefingText && process.env.TYPEFULLY_API_KEY && process.env.TYPEFULLY_SOCIAL_SET_ID) {
      console.log('\n📱 Step 4: Typefully 소셜 포스팅 중...');
      try {
        const socialText = composeEnglishDigest(data, session);

        // EN 브랜드 카드 렌더 (실패 시 Step 3의 KR 배너로 대체)
        let socialImage = savedBannerBuffer;
        try {
          socialImage = await renderDigestCard(data, session, 'en');
          console.log(`  🖼️ EN 브랜드 카드 렌더 완료 (${Math.round(socialImage.length / 1024)}KB)`);
        } catch (enErr) {
          console.warn(`  ⚠️ EN 카드 렌더 실패 — KR 배너로 대체: ${enErr.message}`);
        }
        if (!socialImage) {
          console.log('  ⚠️ 배너 없음 — 텍스트만 포스팅');
        }

        console.log(`  📝 소셜 텍스트: ${socialText.length}자`);
        const socialResult = await postBriefingToSocial(socialText, socialImage);
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
  let videoPath = null;
  let guard = null;
  try {
    const startTs = new Date();
    const { generateEditorialShort } = await import('./youtube-editorial-generator.js');
    const { assertYouTubeCredentials, uploadToYouTube } = await import('./youtube-uploader-new.js');
    const {
      isExplicitYouTubeOwner,
      isApprovedQueuePolicy,
      isArticleUploadWindow,
      loadApprovedArticleHandoff,
      openDailyUploadGuard,
    } = await import('./youtube-editorial-source.js');

    if (!isExplicitYouTubeOwner()) {
      console.log('⏭️ YouTube Shorts 스킵: COINEASY_YT_OWNER=insight-briefing을 명시적으로 설정해야 합니다.');
      return { success: true, skipped: true, reason: 'owner-not-explicit' };
    }
    if (!isApprovedQueuePolicy()) {
      console.log('⏭️ YouTube Shorts 스킵: 18:05 기사형·20:30 기존 예약 공존 정책을 명시해야 합니다.');
      return { success: true, skipped: true, reason: 'queue-policy-not-explicit' };
    }
    if (!isArticleUploadWindow(startTs)) {
      console.log('⏭️ YouTube Shorts 스킵: 기사형 업로드는 KST 18:05–18:14에만 시작합니다.');
      return { success: true, skipped: true, reason: 'outside-article-upload-window' };
    }

    console.log(`[${startTs.toISOString()}] 🎬 YouTube 기사형 데일리 쇼츠 파이프라인 시작`);

    const { date, handoff, payload } = await loadApprovedArticleHandoff(startTs);
    if (!handoff || !payload) {
      console.warn(`⏭️ ${date} Naver 게시·Telegram 승인·서명이 완료된 아티클 handoff가 없어 무게시합니다.`);
      return { success: true, skipped: true, reason: 'approved-article-handoff-missing' };
    }

    // Missing OAuth is a known pre-request failure and must not consume a
    // persistent daily claim.
    assertYouTubeCredentials();

    guard = await openDailyUploadGuard(handoff);
    if (!guard.acquired) {
      console.log(`⏭️ ${date} YouTube Shorts 스킵: ${guard.reason}`);
      return { success: true, skipped: true, reason: guard.reason };
    }

    payload.editorialDate = date;
    videoPath = await generateEditorialShort(payload);
    console.log(`  ✓ 영상 생성 완료: ${videoPath}`);

    await guard.markUploadStarted();
    const video = await uploadToYouTube(videoPath, payload, startTs);
    console.log(`  ✓ YouTube 업로드 완료: ${video.videoUrl}`);
    await guard.markDone(video);
    guard = null;

    const elapsedMs = Date.now() - startTs.getTime();
    console.log(`✅ YouTube 기사형 데일리 쇼츠 완료 (${elapsedMs}ms)`);
    return { success: true, videoUrl: video.videoUrl, videoId: video.videoId, elapsedMs };
  } catch (e) {
    if (guard?.acquired) {
      try {
        if (guard.uploadStarted) await guard.markUncertain(e);
        else await guard.markFailedBeforeUpload(e);
      } catch (fenceError) {
        console.error(`✗ YouTube 영구 펜스 기록 실패: ${fenceError.message}`);
      }
      guard = null;
    }
    console.error(`✗ YouTube Shorts 에러: ${e.message}`);
    return { success: false, error: e.message };
  } finally {
    if (videoPath) {
      const { cleanupVideo } = await import('./youtube-uploader-new.js');
      cleanupVideo(videoPath);
    }
  }
}

// ─── Cron schedule ────────────────────────────────────
// MORNING (KST 08:00 = UTC 23:00)
cron.schedule('0 23 * * *', async () => {
  console.log(`\n⏰ Job 1: 브리핑 파이프라인 (아침) 시작`);
  await runBriefingPipeline();
}, { timezone: 'UTC' });

// EVENING (KST 18:00 = UTC 09:00)
cron.schedule('0 9 * * *', async () => {
  console.log(`\n⏰ Job 2: 브리핑 파이프라인 (저녁) 시작`);
  await runBriefingPipeline();
}, { timezone: 'UTC' });

// One editorial Short per day, after the 18:00 briefing has refreshed.
cron.schedule('5 9 * * *', async () => {
  const session = getSession(new Date());
  console.log(`\n⏰ Job 3: YouTube 기사형 데일리 쇼츠 (${session.label}) 시작`);
  await runYouTubeShorts(session);
}, { timezone: 'UTC' });

// ─── Startup ──────────────────────────────────────────
console.log('');
console.log('CoinEasyInsightBriefing - scheduler started');
console.log('Job 1 (Briefing AM) : daily UTC 23:00 (KST 08:00)');
console.log('Job 2 (Briefing PM) : daily UTC 09:00 (KST 18:00)');
console.log('Job 3 (Shorts PM)   : daily UTC 09:05 (KST 18:05, editorial only)');
console.log('');

// Manual recovery only. Deploy/restart must not create duplicate public posts.
if (/^(1|true|on|yes)$/i.test(process.env.RUN_BRIEFING_ON_START || '')) {
  (async () => {
    console.log('RUN_BRIEFING_ON_START: Running briefing pipeline once...');
    await runBriefingPipeline();
    console.log('RUN_BRIEFING_ON_START: Complete!');
  })();
}
