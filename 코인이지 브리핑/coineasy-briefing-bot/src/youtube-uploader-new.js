// src/youtube-uploader.js
// =======================
// Uploads a local MP4 file to YouTube as a Short using the
// YouTube Data API v3 with OAuth2 credentials stored in env vars.
//
// Required environment variables:
//   YT_CLIENT_ID      - OAuth2 client ID
//   YT_CLIENT_SECRET   - OAuth2 client secret
//   YT_REFRESH_TOKEN   - long-lived refresh token
//   YT_REDIRECT_URI    - OAuth2 redirect URI (e.g. http://localhost)
//
// Optional:
//   YT_PRIVACY_STATUS  - 'public' | 'unlisted' | 'private' (default: 'public')

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import * as CFG from './youtube-shorts-config.js';

// --- OAuth2 client ---
function buildOAuth2Client() {
    const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REDIRECT_URI, YT_REFRESH_TOKEN } = process.env;
    if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
          throw new Error(
                  'Missing YouTube credentials. Set YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN.'
                );
    }
    const oauth2 = new google.auth.OAuth2(
          YT_CLIENT_ID,
          YT_CLIENT_SECRET,
          YT_REDIRECT_URI || 'http://localhost'
        );
    oauth2.setCredentials({ refresh_token: YT_REFRESH_TOKEN });
    return oauth2;
}

// --- Metadata builders (all Korean) ---
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function buildVideoMetadata(payload, now = new Date()) {
    const t = payload.texts;

  // KST date
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const month = kst.getUTCMonth() + 1;
    const day = kst.getUTCDate();
    const weekday = WEEKDAY_KO[kst.getUTCDay()];

  // Session label
  const kstHour = kst.getUTCHours();
    const sessionLabel = kstHour < 12 ? '오전' : '저녁';

  // Title: fully Korean
  const title = `${t.btc_price} (${t.btc_change}) | 코인이지 데일리 — ${month}월 ${day}일`.slice(0, 100);

  // Description: all Korean
  const hashtags = '#이지브리핑 #코인이지 #비트코인 #BTC #암호화폐 #크립토 #코인시황 #데일리브리핑 #유튜브쇼츠';
    const description = [
          `📊 ${month}월 ${day}일 ${weekday}요일 ${sessionLabel} 코인이지 데일리 마켓 브리핑`,
          '',
          `₿ BTC: ${t.btc_price} (${t.btc_change})`,
          `Ξ ETH: ${t.eth_price} (${t.eth_change})`,
          `◎ SOL: ${t.sol_price} (${t.sol_change})`,
          '',
          `😨 공포탐욕지수: ${t.fear_value} (${{'Extreme Fear':'극단적 공포','Fear':'공포','Neutral':'중립','Greed':'탐욕','Extreme Greed':'극단적 탐욕'}[t.fear_label]||t.fear_label})`,
          `🥬 김치 프리미엄: ${t.kimchi_premium}`,
          '',
          `💬 "${t.quote_line1}"`,
          `   ${t.quote_line2}`,
          '',
          '─────────────────────────',
          '📱 코인이지 채널 구독하고 매일 아침 시장 브리핑 받아보세요!',
          '',
          hashtags,
        ].join('\n').slice(0, 5000);

  return {
        snippet: {
                title,
                description,
                tags: CFG.YT_DEFAULT_TAGS,
                categoryId: CFG.YT_CATEGORY_ID,
                defaultLanguage: CFG.YT_LANGUAGE,
                defaultAudioLanguage: CFG.YT_LANGUAGE,
        },
        status: {
                privacyStatus: CFG.YT_PRIVACY,
                selfDeclaredMadeForKids: false,
        },
  };
}

// --- Upload with retry ---
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadWithRetry(youtube, videoPath, metadata) {
    const fileSize = fs.statSync(videoPath).size;
    console.log(`  [uploader] 파일 크기: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
                console.log(`  [uploader] 업로드 시도 ${attempt}/${MAX_RETRIES}...`);

          const response = await youtube.videos.insert({
                    part: ['snippet', 'status'],
                    requestBody: metadata,
                    media: {
                                mimeType: 'video/mp4',
                                body: fs.createReadStream(videoPath),
                    },
          });

          const videoId = response.data.id;
                const videoUrl = `https://www.youtube.com/shorts/${videoId}`;
                console.log(`  [uploader] 업로드 성공: ${videoUrl}`);
                return videoUrl;
        } catch (err) {
                const isTransient = (
                          err.code === 'ECONNRESET' ||
                          err.code === 'ETIMEDOUT' ||
                          (err.response && err.response.status >= 500)
                        );

          if (attempt < MAX_RETRIES && isTransient) {
                    console.warn(`  [uploader] 일시적 오류 (${err.message}), ${RETRY_DELAY_MS / 1000}초 후 재시도...`);
                    await sleep(RETRY_DELAY_MS);
          } else {
                    throw new Error(`YouTube 업로드 실패 (${attempt}회 시도): ${err.message}`);
          }
        }
  }
}

// --- Public API ---
async function uploadToYouTube(videoPath, payload, now = new Date()) {
    const auth = buildOAuth2Client();
    const youtube = google.youtube({ version: 'v3', auth });
    const meta = buildVideoMetadata(payload, now);
    return uploadWithRetry(youtube, videoPath, meta);
}

function cleanupVideo(videoPath) {
    if (!videoPath) return;
    try {
          const workDir = path.dirname(videoPath);
          fs.rmSync(workDir, { recursive: true, force: true });
          console.log(`  [uploader] 임시 파일 삭제 완료: ${workDir}`);
    } catch (err) {
          console.warn(`  [uploader] 임시 파일 삭제 실패 (무시): ${err.message}`);
    }
}

export { uploadToYouTube, cleanupVideo };
