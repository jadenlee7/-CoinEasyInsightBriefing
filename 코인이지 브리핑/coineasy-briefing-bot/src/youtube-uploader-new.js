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
// Required:
//   YT_PRIVACY_STATUS  - explicit 'public' | 'unlisted' | 'private' (no default)

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

function assertYouTubeCredentials(env = process.env) {
    const missing = ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN']
        .filter((name) => !String(env[name] || '').trim());
    if (missing.length) throw new Error(`Missing YouTube credentials: ${missing.join(', ')}`);
    const privacy = String(env.YT_PRIVACY_STATUS || '').trim().toLowerCase();
    if (!['public', 'unlisted', 'private'].includes(privacy)) {
        throw new Error('YT_PRIVACY_STATUS를 public, unlisted, private 중 하나로 명시해야 합니다.');
    }
    return true;
}

// --- Metadata builders (all Korean) ---
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function buildVideoMetadata(payload, now = new Date()) {
    const t = payload.texts;
  const editorial = payload.editorial || {};
  const article = payload.article || {};

  // KST date
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const month = kst.getUTCMonth() + 1;
    const day = kst.getUTCDate();
    const weekday = WEEKDAY_KO[kst.getUTCDay()];

  // Session label
  const kstHour = kst.getUTCHours();
    const sessionLabel = kstHour < 12 ? '오전' : '저녁';

  // Topic first: discovery should reflect the day's verified editorial issue,
  // not publish another interchangeable price-only card.
  const topic = editorial.headline || `비트코인 ${t.btc_price}`;
  const title = `${topic} | ${month}월 ${day}일 코인이지 #Shorts`.slice(0, 100);

  // Description: all Korean
  const hashtags = '#이지브리핑 #코인이지 #비트코인 #BTC #암호화폐 #크립토 #코인시황 #데일리브리핑 #유튜브쇼츠';
    const description = [
          `🍊 ${month}월 ${day}일 ${weekday}요일 ${sessionLabel} 코인이지 데일리 인사이트`,
          '',
          editorial.factTitle ? `핵심: ${editorial.factTitle}` : '',
          editorial.fact ? `확인: ${editorial.fact}` : '',
          editorial.verdict ? `해석: ${editorial.verdict}` : '',
          editorial.action ? `오늘 확인할 것: ${editorial.action}` : '',
          article.canonicalNaverUrl ? `Naver: ${article.canonicalNaverUrl}` : '',
          ...(Array.isArray(editorial.sourceUrls)
            ? editorial.sourceUrls.map((url, index) => `출처 ${index + 1}: ${url}`)
            : []),
          '',
          `₿ BTC: ${t.btc_price} (${t.btc_change})`,
          `😨 공포탐욕지수: ${t.fear_value} (${{'Extreme Fear':'극단적 공포','Fear':'공포','Neutral':'중립','Greed':'탐욕','Extreme Greed':'극단적 탐욕'}[t.fear_label]||t.fear_label})`,
          `🥬 김치 프리미엄: ${t.kimchi_premium}`,
          '',
          '─────────────────────────',
          '📱 실시간 김프·상장 알림: https://t.me/coiniseasy',
          '※ 교육용 정보이며 투자·법률·세무 자문이 아닙니다.',
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

// The request is deliberately attempted exactly once. A transport error can
// occur after YouTube has accepted the upload, so the caller persists an
// external_state_uncertain fence and requires operator reconciliation.
async function uploadOnce(youtube, videoPath, metadata) {
    const fileSize = fs.statSync(videoPath).size;
    if (fileSize <= 0) throw new Error('YouTube 업로드 파일이 비어 있습니다.');
    console.log(`  [uploader] 파일 크기: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
    console.log('  [uploader] 업로드 시도 1/1...');
    const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: metadata,
        media: {
            mimeType: 'video/mp4',
            body: fs.createReadStream(videoPath),
        },
    });
    const videoId = String(response?.data?.id || '').trim();
    if (!/^[A-Za-z0-9_-]+$/.test(videoId)) throw new Error('YouTube 응답에 video ID가 없습니다.');
    const videoUrl = `https://www.youtube.com/shorts/${videoId}`;
    console.log(`  [uploader] 업로드 성공: ${videoUrl}`);
    return { videoId, videoUrl };
}

// --- Public API ---
async function uploadToYouTube(videoPath, payload, now = new Date()) {
    assertYouTubeCredentials();
    const auth = buildOAuth2Client();
    const youtube = google.youtube({ version: 'v3', auth });
    const meta = buildVideoMetadata(payload, now);
    return uploadOnce(youtube, videoPath, meta);
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

export {
    assertYouTubeCredentials,
    buildVideoMetadata,
    cleanupVideo,
    uploadOnce,
    uploadToYouTube,
};
