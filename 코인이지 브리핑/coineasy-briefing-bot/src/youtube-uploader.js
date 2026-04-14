// src/youtube-uploader.js
// =======================
// Uploads a local MP4 file to YouTube as a Short using the
// YouTube Data API v3 with OAuth2 credentials stored in env vars.
//
// Required environment variables:
//   YT_CLIENT_ID      - OAuth2 client ID
//   YT_CLIENT_SECRET  - OAuth2 client secret
//   YT_REFRESH_TOKEN  - long-lived refresh token
//   YT_REDIRECT_URI   - OAuth2 redirect URI (e.g. http://localhost)
//
// Optional:
//   YT_PRIVACY_STATUS - 'public' | 'unlisted' | 'private' (default: 'public')

'use strict';

const fs   = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CFG = require('./youtube-shorts-config');

// ─── OAuth2 client ────────────────────────────────────────

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

// ─── Metadata builders ────────────────────────────────────

/**
 * Build the YouTube video resource metadata.
 *
 * @param {object} payload  - market payload from figmaDataBuilder
 * @param {Date}   now
 * @returns {object}        - YouTube resource body
 */
function buildVideoMetadata(payload, now = new Date()) {
  const t = payload.texts;

  // Title: "BTC $95,200 (+2.34%) | 코인이지 데일리 — 5월 1일"
  const dateStr = `${now.getMonth() + 1}월 ${now.getDate()}일`;
  const title   = `${t.btc_price} (${t.btc_change}) | 코인이지 데일리 — ${dateStr}`.slice(0, 100);

  // Description with market data + hashtags
  const hashtags = CFG.YT_DEFAULT_TAGS.map((tag) => `#${tag}`).join(' ');
  const description = [
    `📊 ${t.date_label} 코인이지 데일리 마켓 브리핑`,
    '',
    `₿ BTC: ${t.btc_price} (${t.btc_change})`,
    `Ξ ETH: ${t.eth_price} (${t.eth_change})`,
    `◎ SOL: ${t.sol_price} (${t.sol_change})`,
    '',
    `😨 공포탐욕지수: ${t.fear_value} (${t.fear_label})`,
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

// ─── Upload with retry ────────────────────────────────────

const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload the video file to YouTube with up to MAX_RETRIES attempts.
 *
 * @param {object} youtube    - googleapis YouTube client
 * @param {string} videoPath  - local path to the MP4 file
 * @param {object} metadata   - YouTube resource body
 * @returns {Promise<string>} - YouTube video URL
 */
async function uploadWithRetry(youtube, videoPath, metadata) {
  const fileSize = fs.statSync(videoPath).size;
  console.log(`  [uploader] 파일 크기: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`  [uploader] 업로드 시도 ${attempt}/${MAX_RETRIES}…`);

      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: metadata,
        media: {
          mimeType: 'video/mp4',
          body: fs.createReadStream(videoPath),
        },
      });

      const videoId  = response.data.id;
      const videoUrl = `https://www.youtube.com/shorts/${videoId}`;
      console.log(`  [uploader] 업로드 성공: ${videoUrl}`);
      return videoUrl;

    } catch (err) {
      const isTransient = (
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT'  ||
        (err.response && err.response.status >= 500)
      );

      if (attempt < MAX_RETRIES && isTransient) {
        console.warn(`  [uploader] 일시적 오류 (${err.message}), ${RETRY_DELAY_MS / 1000}초 후 재시도…`);
        await sleep(RETRY_DELAY_MS);
      } else {
        throw new Error(`YouTube 업로드 실패 (${attempt}회 시도): ${err.message}`);
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────

/**
 * Upload a local MP4 to YouTube as a Short.
 *
 * @param {string} videoPath  - path to the MP4 file
 * @param {object} payload    - market payload from figmaDataBuilder
 * @param {Date}   [now]      - timestamp for metadata (defaults to now)
 * @returns {Promise<string>} - YouTube video URL
 */
async function uploadToYouTube(videoPath, payload, now = new Date()) {
  const auth    = buildOAuth2Client();
  const youtube = google.youtube({ version: 'v3', auth });
  const meta    = buildVideoMetadata(payload, now);

  return uploadWithRetry(youtube, videoPath, meta);
}

/**
 * Delete the local video file after upload.
 * Errors are swallowed — cleanup is best-effort.
 *
 * @param {string} videoPath
 */
function cleanupVideo(videoPath) {
  if (!videoPath) return;
  try {
    // Remove the file and its parent work directory
    const workDir = path.dirname(videoPath);
    fs.rmSync(workDir, { recursive: true, force: true });
    console.log(`  [uploader] 임시 파일 삭제 완료: ${workDir}`);
  } catch (err) {
    console.warn(`  [uploader] 임시 파일 삭제 실패 (무시): ${err.message}`);
  }
}

module.exports = { uploadToYouTube, cleanupVideo };

// CLI test
if (require.main === module) {
  const testVideoPath = process.argv[2];
  if (!testVideoPath) {
    console.error('Usage: node youtube-uploader.js <path-to-video.mp4>');
    process.exit(1);
  }

  const { buildPayload } = require('./figma-daily/figmaDataBuilder');
  buildPayload()
    .then((payload) => uploadToYouTube(testVideoPath, payload))
    .then((url) => {
      console.log(`\n✅ 업로드 완료: ${url}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
