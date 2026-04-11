// src/youtube-shorts-generator.js
// ================================
// Generates a vertical (9:16, 1080×1920) MP4 YouTube Short from the
// daily market payload produced by figma-daily/figmaDataBuilder.js.
//
// Pipeline:
//   1. Render each frame as a PNG via node-canvas
//   2. Generate Korean TTS narration with edge-tts
//   3. Compose frames + audio into an MP4 with fluent-ffmpeg
//
// Dependencies (all available in the Docker image or package.json):
//   canvas, fluent-ffmpeg, edge-tts (Python CLI)
//
// Environment variables: none required (uses YT_* only in uploader)

'use strict';

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const { createCanvas, registerFont } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');

const CFG = require('./youtube-shorts-config');

// ─── Font setup ──────────────────────────────────────────
const FONT_FAMILY = 'Noto Sans CJK KR';
let _fontsRegistered = false;

function ensureFonts() {
  if (_fontsRegistered) return;
  const variants = [
    ['/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc',   'Black'],
    ['/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',    'Bold'],
    ['/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc',  'Medium'],
    ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'Regular'],
  ];
  for (const [fp, weight] of variants) {
    try { registerFont(fp, { family: FONT_FAMILY, weight }); }
    catch (_) { /* non-fatal — fontconfig may already know the font */ }
  }
  _fontsRegistered = true;
}

// ─── Canvas helpers ───────────────────────────────────────
function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px "${FONT_FAMILY}"`;
}

function fillText(ctx, text, x, y, color, weight, size, align = 'left') {
  setFont(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}

// ─── Frame renderer ───────────────────────────────────────

/**
 * Render a single frame at time `t` (seconds) into a canvas.
 * Returns the canvas.
 */
function renderFrame(payload, t) {
  ensureFonts();

  const W = CFG.VIDEO_WIDTH;
  const H = CFG.VIDEO_HEIGHT;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const texts = payload.texts;
  const colors = payload.colors;

  // ── Background ──
  ctx.fillStyle = CFG.COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Fade-in / fade-out alpha ──
  let alpha = 1;
  if (t < CFG.ANIM.fadeInDuration) {
    alpha = t / CFG.ANIM.fadeInDuration;
  } else if (t > CFG.ANIM.fadeOutStart) {
    alpha = 1 - (t - CFG.ANIM.fadeOutStart) / CFG.ANIM.fadeOutDuration;
  }
  alpha = Math.max(0, Math.min(1, alpha));
  ctx.globalAlpha = alpha;

  // ── Header ──
  const headerY = 120;
  fillText(ctx, 'CoinEasy', W / 2, headerY, CFG.COLORS.yellow, 'Black', 72, 'center');
  fillText(ctx, '데일리 마켓 브리핑', W / 2, headerY + 80, CFG.COLORS.cream, 'Bold', 44, 'center');
  fillText(ctx, texts.date_label, W / 2, headerY + 140, CFG.COLORS.gray, 'Regular', 36, 'center');

  // ── Divider ──
  ctx.strokeStyle = CFG.COLORS.orange;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, headerY + 170);
  ctx.lineTo(W - 60, headerY + 170);
  ctx.stroke();

  // ── BTC card ──
  const btcY = headerY + 210;
  roundRect(ctx, 40, btcY, W - 80, 200, 20, CFG.COLORS.bgCard);
  fillText(ctx, '₿ BTC', 80, btcY + 60, CFG.COLORS.yellow, 'Bold', 48);
  fillText(ctx, texts.btc_price, 80, btcY + 130, CFG.COLORS.white, 'Black', 64);
  const btcColor = colors.btc_change || CFG.COLORS.gray;
  fillText(ctx, texts.btc_change, W - 80, btcY + 130, btcColor, 'Bold', 52, 'right');

  // ── Alt coins ──
  const altCoins = [
    { label: 'ETH', price: texts.eth_price, change: texts.eth_change, color: colors.eth_change },
    { label: 'SOL', price: texts.sol_price, change: texts.sol_change, color: colors.sol_change },
    { label: 'XRP', price: texts.xrp_price, change: texts.xrp_change, color: colors.xrp_change },
  ];
  const altY = btcY + 240;
  const colW = (W - 80) / 3;
  altCoins.forEach((coin, i) => {
    const cx = 40 + i * colW;
    roundRect(ctx, cx + 5, altY, colW - 10, 150, 16, CFG.COLORS.bgCard);
    fillText(ctx, coin.label, cx + colW / 2, altY + 50, CFG.COLORS.cream, 'Bold', 36, 'center');
    fillText(ctx, coin.price, cx + colW / 2, altY + 100, CFG.COLORS.white, 'Bold', 30, 'center');
    fillText(ctx, coin.change, cx + colW / 2, altY + 140, coin.color || CFG.COLORS.gray, 'Regular', 28, 'center');
  });

  // ── Fear & Greed + Kimchi ──
  const fgY = altY + 190;
  roundRect(ctx, 40, fgY, W - 80, 160, 20, CFG.COLORS.bgCard);
  fillText(ctx, '😨 공포탐욕지수', 80, fgY + 55, CFG.COLORS.cream, 'Bold', 36);
  fillText(ctx, `${texts.fear_value} (${texts.fear_label})`, 80, fgY + 115, CFG.COLORS.white, 'Black', 48);
  fillText(ctx, `🥬 김프 ${texts.kimchi_premium}`, W - 80, fgY + 85, CFG.COLORS.yellow, 'Bold', 36, 'right');

  // ── Trending ──
  const trendY = fgY + 200;
  fillText(ctx, '🚀 트렌딩', 80, trendY, CFG.COLORS.orange, 'Bold', 40);
  const trends = [
    { name: texts.trend_1_name, change: texts.trend_1_change, color: colors.trend_1_change },
    { name: texts.trend_2_name, change: texts.trend_2_change, color: colors.trend_2_change },
    { name: texts.trend_3_name, change: texts.trend_3_change, color: colors.trend_3_change },
  ];
  trends.forEach((tr, i) => {
    const ty = trendY + 55 + i * 70;
    roundRect(ctx, 40, ty, W - 80, 60, 12, CFG.COLORS.bgCard);
    fillText(ctx, tr.name, 80, ty + 40, CFG.COLORS.white, 'Regular', 30);
    fillText(ctx, tr.change, W - 80, ty + 40, tr.color || CFG.COLORS.gray, 'Bold', 30, 'right');
  });

  // ── Quote ──
  const quoteY = trendY + 290;
  roundRect(ctx, 40, quoteY, W - 80, 200, 20, CFG.COLORS.bgCard);
  fillText(ctx, `"${texts.quote_line1}"`, W / 2, quoteY + 75, CFG.COLORS.cream, 'Medium', 34, 'center');
  fillText(ctx, texts.quote_line2, W / 2, quoteY + 135, CFG.COLORS.gray, 'Regular', 30, 'center');

  // ── Footer ──
  fillText(ctx, 'CoinEasy • 매일 아침 8시', W / 2, H - 60, CFG.COLORS.gray, 'Regular', 30, 'center');

  ctx.globalAlpha = 1;
  return canvas;
}

// ─── TTS generation ───────────────────────────────────────

/**
 * Generate Korean TTS audio using edge-tts CLI.
 * Returns path to the generated MP3 file.
 */
async function generateTTS(payload, outDir) {
  const t = payload.texts;
  const script = [
    `코인이지 데일리 마켓 브리핑입니다.`,
    `${t.date_label}.`,
    `비트코인은 현재 ${t.btc_price}, ${t.btc_change}입니다.`,
    `이더리움 ${t.eth_price} ${t.eth_change},`,
    `솔라나 ${t.sol_price} ${t.sol_change}.`,
    `공포탐욕지수는 ${t.fear_value}, ${t.fear_label} 구간입니다.`,
    `김치 프리미엄은 ${t.kimchi_premium}.`,
    `오늘의 인사이트: ${t.quote_line1}. ${t.quote_line2}.`,
    `코인이지와 함께 오늘도 현명한 투자 하세요.`,
  ].join(' ');

  const audioPath = path.join(outDir, 'narration.mp3');

  await new Promise((resolve, reject) => {
    const proc = spawn('edge-tts', [
      '--voice', CFG.TTS_VOICE,
      '--rate', CFG.TTS_RATE,
      '--volume', CFG.TTS_VOLUME,
      '--text', script,
      '--write-media', audioPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(audioPath);
      } else {
        reject(new Error(`edge-tts exited ${code}: ${stderr}`));
      }
    });
    proc.on('error', reject);
  });

  return audioPath;
}

// ─── Frame sequence → video ───────────────────────────────

/**
 * Render all frames to PNG files in outDir.
 * Returns the glob pattern for ffmpeg input.
 */
async function renderFrames(payload, outDir) {
  const totalFrames = CFG.DURATION_SECONDS * CFG.FRAME_RATE;
  const framesDir = path.join(outDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  for (let i = 0; i < totalFrames; i++) {
    const t = i / CFG.FRAME_RATE;
    const canvas = renderFrame(payload, t);
    const framePath = path.join(framesDir, `frame_${String(i).padStart(6, '0')}.png`);
    const buf = canvas.toBuffer('image/png');
    fs.writeFileSync(framePath, buf);
  }

  return path.join(framesDir, 'frame_%06d.png');
}

/**
 * Compose frames + audio into an MP4 using fluent-ffmpeg.
 * Returns path to the output MP4.
 */
async function composeVideo(framePattern, audioPath, outDir) {
  const outputPath = path.join(outDir, `coineasy_short_${Date.now()}.mp4`);

  await new Promise((resolve, reject) => {
    let cmd = ffmpeg()
      .input(framePattern)
      .inputOptions([
        `-framerate ${CFG.FRAME_RATE}`,
        '-f image2',
      ]);

    if (audioPath && fs.existsSync(audioPath)) {
      cmd = cmd.input(audioPath);
    }

    cmd
      .outputOptions([
        `-c:v ${CFG.VIDEO_CODEC}`,
        `-preset ${CFG.PRESET}`,
        `-crf ${CFG.CRF}`,
        `-b:v ${CFG.VIDEO_BITRATE}`,
        `-pix_fmt ${CFG.PIXEL_FORMAT}`,
        `-c:a ${CFG.AUDIO_CODEC}`,
        `-b:a ${CFG.AUDIO_BITRATE}`,
        '-shortest',
        '-movflags +faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`ffmpeg error: ${err.message}`)))
      .run();
  });

  return outputPath;
}

// ─── Public API ───────────────────────────────────────────

/**
 * Generate a YouTube Short MP4 from the given market payload.
 *
 * @param {object} payload  - market payload from figmaDataBuilder.buildPayload()
 * @returns {Promise<string>} path to the generated MP4 file
 */
async function generateYouTubeShort(payload) {
  // Ensure output directory exists
  fs.mkdirSync(CFG.OUTPUT_DIR, { recursive: true });

  const workDir = fs.mkdtempSync(path.join(CFG.OUTPUT_DIR, 'job-'));
  console.log(`  [generator] 작업 디렉토리: ${workDir}`);

  try {
    // 1) Render frames
    console.log(`  [generator] 프레임 렌더링 중 (${CFG.DURATION_SECONDS * CFG.FRAME_RATE}장)…`);
    const framePattern = await renderFrames(payload, workDir);
    console.log('  [generator] 프레임 렌더링 완료');

    // 2) Generate TTS narration
    let audioPath = null;
    try {
      console.log('  [generator] TTS 나레이션 생성 중…');
      audioPath = await generateTTS(payload, workDir);
      console.log(`  [generator] TTS 완료: ${audioPath}`);
    } catch (ttsErr) {
      console.warn(`  [generator] TTS 실패 (무음으로 진행): ${ttsErr.message}`);
    }

    // 3) Compose video
    console.log('  [generator] 영상 합성 중…');
    const videoPath = await composeVideo(framePattern, audioPath, workDir);
    console.log(`  [generator] 영상 합성 완료: ${videoPath}`);

    return videoPath;

  } catch (err) {
    // Clean up work directory on failure
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
    throw err;
  }
}

module.exports = { generateYouTubeShort };

// CLI test
if (require.main === module) {
  const { buildPayload } = require('./figma-daily/figmaDataBuilder');
  buildPayload()
    .then((payload) => generateYouTubeShort(payload))
    .then((p) => {
      console.log(`\n✅ 영상 생성 완료: ${p}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
