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

  // Title: "BTC $95,200 (+2.34%) | CoinEasy Daily — 5월 1일"
  const dateStr = `${now.getMonth() + 1}월 ${now.getDate()}일`;
  const title   = `${t.btc_price} (${t.btc_change}) | CoinEasy Daily — ${dateStr}`.slice(0, 100);

  // Description with market data + hashtags
  const hashtags = CFG.YT_DEFAULTS.hashtags.join(' ');
  const description = [
    `📊 CoinEasy 데일리 마켓 브리핑 — ${t.date_label}`,
    '',
    `🟡 BTC: ${t.btc_price} (${t.btc_change})`,
    `🔵 ETH: ${t.eth_price} (${t.eth_change})`,
    `🟣 SOL: ${t.sol_price} (${t.sol_change})`,
    `🔴 XRP: ${t.xrp_price} (${t.xrp_change})`,
    '',
    `😨 공포/탐욕: ${t.fear_value} (${t.fear_label})`,
    `🥬 김치 프리미엄: ${t.kimchi_premium}`,
    '',
    `🚀 트렌딩: ${t.trend_1_name} ${t.trend_1_change}`,
    '',
    `💡 ${t.quote_line1}`,
    `   ${t.quote_line2}`,
    '',
    '─────────────────────────',
    '코인이지와 함께 오늘도 이지하게! 🤙',
    'https://coineasy.xyz',
    '',
    hashtags,
  ].join('\n');

  const tags = [
    'CoinEasy', '코인이지', 'Crypto', 'Bitcoin', 'BTC', 'Ethereum', 'ETH',
    'Solana', 'SOL', 'XRP', 'Ripple', 'DeFi', 'Web3', 'Shorts',
    '비트코인', '이더리움', '암호화폐', '코인', '가상화폐', '크립토',
    '데일리브리핑', '시장분석', '코인시세',
  ];

  return {
    snippet: {
      title,
      description,
      tags,
      categoryId:      CFG.YT_DEFAULTS.categoryId,
      defaultLanguage: CFG.YT_DEFAULTS.defaultLanguage,
    },
    status: {
      privacyStatus:  CFG.YT_DEFAULTS.privacyStatus,
      madeForKids:    CFG.YT_DEFAULTS.madeForKids,
      selfDeclaredMadeForKids: CFG.YT_DEFAULTS.madeForKids,
    },
  };
}

// ─── Upload with retry ────────────────────────────────────

const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 5000;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Upload a video file to YouTube using resumable upload.
 *
 * @param {string} videoPath  - absolute path to the MP4 file
 * @param {object} payload    - market payload (for metadata)
 * @param {Date}   now
 * @returns {string}          - YouTube video URL
 */
async function uploadToYouTube(videoPath, payload, now = new Date()) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const auth     = buildOAuth2Client();
  const youtube  = google.youtube({ version: 'v3', auth });
  const metadata = buildVideoMetadata(payload, now);
  const fileSize = fs.statSync(videoPath).size;

  console.log(`  [youtube] Uploading ${path.basename(videoPath)} (${(fileSize / 1e6).toFixed(1)} MB)…`);
  console.log(`  [youtube] Title: ${metadata.snippet.title}`);
  console.log(`  [youtube] Privacy: ${metadata.status.privacyStatus}`);

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: metadata,
        media: {
          mimeType: 'video/mp4',
          body:     fs.createReadStream(videoPath),
        },
      });

      const videoId  = response.data.id;
      const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

      console.log(`  [youtube] ✓ Upload complete: ${videoUrl}`);
      return videoUrl;

    } catch (err) {
      lastError = err;
      const isRetryable = isRetryableError(err);
      console.warn(
        `  [youtube] Upload attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}` +
        (isRetryable ? ' — retrying…' : ' — not retryable')
      );

      if (!isRetryable || attempt === MAX_RETRIES) break;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error(`YouTube upload failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Determine whether an API error is worth retrying.
 */
function isRetryableError(err) {
  if (!err) return false;
  const code = err.code || (err.response && err.response.status);
  // 429 Too Many Requests, 500/502/503/504 server errors
  return [429, 500, 502, 503, 504].includes(Number(code));
}

// ─── Cleanup helper ───────────────────────────────────────

/**
 * Delete the local video file after a successful upload.
 */
function cleanupVideo(videoPath) {
  try {
    fs.unlinkSync(videoPath);
    // Also try to remove the parent run directory if empty
    const dir = path.dirname(videoPath);
    fs.rmdirSync(dir);
    console.log(`  [youtube] Cleaned up local file: ${videoPath}`);
  } catch (e) {
    console.warn(`  [youtube] Cleanup warning: ${e.message}`);
  }
}

module.exports = { uploadToYouTube, buildVideoMetadata, cleanupVideo };
