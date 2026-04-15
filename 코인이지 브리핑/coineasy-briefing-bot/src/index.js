// src/index.js
// =============
// CoinEasyInsightBriefing — main entry point.
//
// Runs five independent daily cron jobs:
//   1. Figma banner → Telegram + Social (KST 08:00 = UTC 23:00)
//   2. YouTube Shorts AM    (KST 08:05 = UTC 23:05)
//   3. Figma banner → Telegram + Social (KST 18:00 = UTC 09:00)
//   4. YouTube Shorts PM    (KST 18:05 = UTC 09:05)
//
// Session types: 'morning' and 'evening'
// All jobs are isolated; a failure in one does not abort the other.

'use strict';

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const { runDailyFigma }       = require('./figma-daily/runDailyFigma');
const { buildPayload }        = require('./figma-daily/figmaDataBuilder');
const { generateYouTubeShort } = require('./youtube-shorts-generator');
const { uploadToYouTube, cleanupVideo } = require('./youtube-uploader');
const { postBriefingToSocial } = require('./typefully-poster');

// —— Session helper ——————————————————————————

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

// —— YouTube Shorts pipeline ————————————————————

async function runYouTubeShorts(session) {
    const startTs = new Date();
    let videoPath = null;

  try {
        // 1) Figma → payload
      const payload = await buildPayload();

      // 2) Generate short video
      const genResult = await generateYouTubeShort(payload, session);
        videoPath = genResult.videoPath;

      // 3) Upload to YouTube
      const uploadResult = await uploadToYouTube(videoPath, payload, session);

      // 4) Clean up temp file
      cleanupVideo(videoPath);

      const elapsedMs = Date.now() - startTs.getTime();
        console.log(`[${new Date().toISOString()}] ✅ YouTube Shorts (${session.label}) 완료 (${elapsedMs}ms)`);

      return { success: true, videoUrl: uploadResult.videoUrl, elapsedMs };

  } catch (e) {
        console.error(`[${new Date().toISOString()}] ✖ YouTube Shorts (${session.label}) 에러: ${e.message}`);
        console.error(e.stack);

      if (videoPath) {
              try { cleanupVideo(videoPath); } catch (_) { /* ignore */ }
      }

      return { success: false, error: e.message };
  }
}

// —— Social media posting (Typefully) ———————————————

async function runSocialPosting(session) {
    try {
          // Typefully 환경변수 확인
      if (!process.env.TYPEFULLY_API_KEY || !process.env.TYPEFULLY_SOCIAL_SET_ID) {
              console.log(`[${new Date().toISOString()}] ⏭️ Typefully 환경변수 미설정 — 소셜 포스팅 건너뜀`);
              return { success: false, error: 'TYPEFULLY env vars not set' };
      }

      // 브리핑 텍스트 생성
      const payload = await buildPayload();
          const briefingText = buildSocialText(payload, session);

      console.log(`[${new Date().toISOString()}] 📱 소셜 포스팅 시작 (${session.label})...`);

      // 배너 이미지 로드 (Figma 배너가 이미 생성된 경우)
      let bannerBuffer = null;
      try {
          const bannersDir = path.join(__dirname, '..', 'banners');
          if (fs.existsSync(bannersDir)) {
              const files = fs.readdirSync(bannersDir)
                  .filter(f => f.endsWith('.png'))
                  .sort()
                  .reverse();
              if (files.length > 0) {
                  bannerBuffer = fs.readFileSync(path.join(bannersDir, files[0]));
                  console.log(`[${new Date().toISOString()}] 🖼️ 배너 로드 완료: ${files[0]} (${bannerBuffer.length} bytes)`);
              }
          }
      } catch (bannerErr) {
          console.warn(`[${new Date().toISOString()}] ⚠️ 배너 로드 실패 — 텍스트만 포스팅:`, bannerErr.message);
      }

      const result = await postBriefingToSocial(briefingText, bannerBuffer);

      if (result.success) {
              console.log(`[${new Date().toISOString()}] ✅ 소셜 포스팅 완료 (X, LinkedIn, Threads)`);
      } else {
              console.error(`[${new Date().toISOString()}] ⚠️ 소셜 포스팅 실패: ${result.error}`);
      }

      return result;

    } catch (e) {
          console.error(`[${new Date().toISOString()}] ✖ 소셜 포스팅 에러: ${e.message}`);
          return { success: false, error: e.message };
    }
}

// 소셜 미디어용 텍스트 포맷
function buildSocialText(payload, session) {
    const date = new Date();
    const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    const dateStr = `${kstDate.getMonth() + 1}/${kstDate.getDate()}`;

  const greeting = session.type === 'morning'
      ? `☀️ ${dateStr} 아침 코인 브리핑`
        : `🌙 ${dateStr} 저녁 코인 브리핑`;

  // payload에서 주요 데이터 추출
  const lines = [greeting, ''];

  if (payload.btcPrice) {
        lines.push(`📊 BTC: ${payload.btcPrice}`);
  }
    if (payload.ethPrice) {
          lines.push(`📊 ETH: ${payload.ethPrice}`);
    }
    if (payload.dominance) {
          lines.push(`📈 BTC 도미넌스: ${payload.dominance}`);
    }
    if (payload.fearGreed) {
          lines.push(`🎯 공포탐욕지수: ${payload.fearGreed}`);
    }

  lines.push('');

  if (payload.headline) {
        lines.push(`📰 ${payload.headline}`);
        lines.push('');
  }

  lines.push(`${session.cta}`);
    lines.push('');
    lines.push('#코인이지 #비트코인 #암호화폐 #코인시황');

  return lines.join('\n');
}

// —— Cron schedule ——————————————————————————

// MORNING (KST 08:00 = UTC 23:00)

cron.schedule('0 23 * * *', async () => {
    const session = getSession(new Date());
    console.log('\n' + '='.repeat(60));
    console.log(`[${new Date().toISOString()}] 🌅 Job 1: Figma/Telegram (${session.label}) 시작`);
    console.log('='.repeat(60));

                try {
                      const result = await runDailyFigma();
                      if (result.success) {
                              console.log(`[${new Date().toISOString()}] ✅ Job 1 완료`);
                      } else {
                              console.error(`[${new Date().toISOString()}] ⚠️ Job 1 실패: ${result.error}`);
                      }
                } catch (e) {
                      console.error(`[${new Date().toISOString()}] ✖ Job 1 에외: ${e.message}`);
                      console.error(e.stack);
                }

                // Job 1-B: 소셜 미디어 포스팅 (Typefully)
                try {
                      const socialResult = await runSocialPosting(session);
                      if (socialResult.success) {
                              console.log(`[${new Date().toISOString()}] ✅ Job 1-B 소셜 포스팅 완료`);
                      } else {
                              console.error(`[${new Date().toISOString()}] ⚠️ Job 1-B 소셜 포스팅 실패: ${socialResult.error}`);
                      }
                } catch (e) {
                      console.error(`[${new Date().toISOString()}] ✖ Job 1-B 소셜 에외: ${e.message}`);
                      console.error(e.stack);
                }
}, { timezone: 'UTC' });

// MORNING Shorts (KST 08:05 = UTC 23:05)

cron.schedule('5 23 * * *', async () => {
    const session = getSession(new Date());
    console.log('\n' + '='.repeat(60));
    console.log(`[${new Date().toISOString()}] 🎬 Job 2: YouTube Shorts (${session.label}) 시작`);
    console.log('='.repeat(60));

                try {
                      const result = await runYouTubeShorts(session);
                      if (result.success) {
                              console.log(`[${new Date().toISOString()}] ✅ Job 2 완료: ${result.videoUrl}`);
                      } else {
                              console.error(`[${new Date().toISOString()}] ⚠️ Job 2 실패: ${result.error}`);
                      }
                } catch (e) {
                      console.error(`[${new Date().toISOString()}] ✖ Job 2 에외: ${e.message}`);
                      console.error(e.stack);
                }
}, { timezone: 'UTC' });

// EVENING (KST 18:00 = UTC 09:00)

cron.schedule('0 9 * * *', async () => {
    const session = getSession(new Date());
    console.log('\n' + '='.repeat(60));
    console.log(`[${new Date().toISOString()}] 🌅 Job 3: Figma/Telegram (${session.label}) 시작`);
    console.log('='.repeat(60));

                try {
                      const result = await runDailyFigma();
                      if (result.success) {
                              console.log(`[${new Date().toISOString()}] ✅ Job 3 완료`);
                      } else {
                              console.error(`[${new Date().toISOString()}] ⚠️ Job 3 실패: ${result.error}`);
                      }
                } catch (e) {
                      console.error(`[${new Date().toISOString()}] ✖ Job 3 에외: ${e.message}`);
                      console.error(e.stack);
                }

                // Job 3-B: 소셜 미디어 포스팅 (Typefully)
                try {
                      const socialResult = await runSocialPosting(session);
                      if (socialResult.success) {
                              console.log(`[${new Date().toISOString()}] ✅ Job 3-B 소셜 포스팅 완료`);
                      } else {
                              console.error(`[${new Date().toISOString()}] ⚠️ Job 3-B 소셜 포스팅 실패: ${socialResult.error}`);
                      }
                } catch (e) {
                      console.error(`[${new Date().toISOString()}] ✖ Job 3-B 소셜 에외: ${e.message}`);
                      console.error(e.stack);
                }
}, { timezone: 'UTC' });

// EVENING Shorts (KST 18:05 = UTC 09:05)

cron.schedule('5 9 * * *', async () => {
    const session = getSession(new Date());
    console.log('\n' + '='.repeat(60));
    console.log(`[${new Date().toISOString()}] 🎬 Job 4: YouTube Shorts (${session.label}) 시작`);
    console.log('='.repeat(60));

                try {
                      const result = await runYouTubeShorts(session);
                      if (result.success) {
                              console.log(`[${new Date().toISOString()}] ✅ Job 4 완료: ${result.videoUrl}`);
                      } else {
                              console.error(`[${new Date().toISOString()}] ⚠️ Job 4 실패: ${result.error}`);
                      }
                } catch (e) {
                      console.error(`[${new Date().toISOString()}] ✖ Job 4 에외: ${e.message}`);
                      console.error(e.stack);
                }
}, { timezone: 'UTC' });

// —— Startup ————————————————————————————————

console.log('');
console.log('CoinEasyInsightBriefing — scheduler started');
console.log('Job 1 (Figma AM + Social) : daily UTC 23:00 (KST 08:00)');
console.log('Job 2 (Shorts AM)         : daily UTC 23:05 (KST 08:05)');
console.log('Job 3 (Figma PM + Social) : daily UTC 09:00 (KST 18:00)');
console.log('Job 4 (Shorts PM)         : daily UTC 09:05 (KST 18:05)');
console.log('');
