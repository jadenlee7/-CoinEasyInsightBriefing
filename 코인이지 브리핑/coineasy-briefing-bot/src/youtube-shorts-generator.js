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

const { createCanvas, loadImage, registerFont } = require('canvas');
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
  ctx.textBaseline = 'top';
  ctx.fillText(String(text), x, y);
}

function roundRect(ctx, x, y, w, h, r, fill, stroke, strokeW) {
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
  if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW || 2; ctx.stroke(); }
}

function gradientH(ctx, x, y, w, h, c1, c2) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function gradientV(ctx, x, y, w, h, c1, c2) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

// ─── Frame renderers ─────────────────────────────────────

/**
 * Render a single PNG frame.
 * @param {object} payload  - market payload from figmaDataBuilder
 * @param {number} frameIdx - 0-based frame index
 * @param {number} totalFrames
 * @returns {Buffer} PNG buffer
 */
async function renderFrame(payload, frameIdx, totalFrames) {
  const W = CFG.VIDEO_WIDTH;
  const H = CFG.VIDEO_HEIGHT;
  const t = payload.texts;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── 1. Background gradient ──────────────────────────────
  gradientV(ctx, 0, 0, W, H, '#0d0700', '#1f1000');

  // Subtle noise texture
  let seed = 7;
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 2000; i++) {
    const nx = Math.floor(rng() * W);
    const ny = Math.floor(rng() * H);
    const s  = Math.floor(rng() * 20) - 10;
    ctx.fillStyle = `rgba(${63 + s},${41 + s},${18 + s},0.4)`;
    ctx.fillRect(nx, ny, 1, 1);
  }

  // ── 2. Top accent bar ───────────────────────────────────
  gradientH(ctx, 0, 0, W, 8, CFG.COLORS.bullGreen, CFG.COLORS.yellow);

  // ── 3. Fade-in / fade-out overlay ──────────────────────
  const progress = frameIdx / (totalFrames - 1);
  const fps      = CFG.FRAME_RATE;
  const fadeInF  = Math.round(CFG.ANIM.fadeInDuration * fps);
  const fadeOutF = Math.round(CFG.ANIM.fadeOutDuration * fps);
  const fadeOutStart = totalFrames - fadeOutF;

  let alpha = 1;
  if (frameIdx < fadeInF)              alpha = frameIdx / fadeInF;
  else if (frameIdx >= fadeOutStart)   alpha = 1 - (frameIdx - fadeOutStart) / fadeOutF;

  // ── 4. Logo / brand header ──────────────────────────────
  const headerY = 60;
  roundRect(ctx, 60, headerY, W - 120, 80, 40,
    'rgba(0,176,9,0.15)', CFG.COLORS.bullGreen, 2);
  fillText(ctx, 'CoinEasy Daily', W / 2, headerY + 22,
    CFG.COLORS.white, 'Black', 38, 'center');

  // Date sub-label
  fillText(ctx, t.date_label, W / 2, headerY + 68,
    CFG.COLORS.cream, 'Medium', 26, 'center');

  // ── 5. BTC hero card ────────────────────────────────────
  const btcY = 200;
  roundRect(ctx, 40, btcY, W - 80, 200, 24,
    CFG.COLORS.bgCard, CFG.COLORS.bullGreen, 3);

  fillText(ctx, 'BTC', 80, btcY + 20, CFG.COLORS.cream, 'Medium', 32);
  fillText(ctx, t.btc_price, 80, btcY + 60, CFG.COLORS.white, 'Black', 80);

  const chgColor = (payload.colors && payload.colors.btc_change) || CFG.COLORS.bullGreen;
  fillText(ctx, t.btc_change, 80, btcY + 150, chgColor, 'Black', 52);
  fillText(ctx, t.market_change, W - 60, btcY + 20,
    CFG.COLORS.cream, 'Medium', 26, 'right');

  // ── 6. Alt-coin row (ETH / SOL / XRP) ───────────────────
  const altY  = 440;
  const altW  = Math.floor((W - 80 - 2 * 20) / 3);
  const alts  = [
    { sym: 'ETH', pk: 'eth_price', ck: 'eth_change' },
    { sym: 'SOL', pk: 'sol_price', ck: 'sol_change' },
    { sym: 'XRP', pk: 'xrp_price', ck: 'xrp_change' },
  ];

  for (let i = 0; i < alts.length; i++) {
    const ax = 40 + i * (altW + 20);
    const a  = alts[i];
    const ac = (payload.colors && payload.colors[a.ck]) || CFG.COLORS.bullGreen;
    roundRect(ctx, ax, altY, altW, 160, 18, CFG.COLORS.bgCard, ac, 2);
    fillText(ctx, a.sym, ax + 16, altY + 14, ac, 'Black', 28);
    fillText(ctx, t[a.pk], ax + 16, altY + 52, CFG.COLORS.white, 'Bold', 30);
    fillText(ctx, t[a.ck], ax + 16, altY + 100, ac, 'Black', 32);
  }

  // ── 7. Fear & Greed gauge ───────────────────────────────
  const fgY = 650;
  roundRect(ctx, 40, fgY, W - 80, 180, 20,
    CFG.COLORS.bgCard, CFG.COLORS.orange, 2);

  fillText(ctx, '공포/탐욕 지수', 80, fgY + 18, CFG.COLORS.cream, 'Black', 32);
  fillText(ctx, t.fear_value, 80, fgY + 65, CFG.COLORS.orange, 'Black', 72);
  fillText(ctx, t.fear_label, 80 + 90, fgY + 90, CFG.COLORS.white, 'Bold', 32);

  // Gauge bar
  const gx = 80, gy = fgY + 145, gw = W - 160, gh = 20;
  roundRect(ctx, gx, gy, gw, gh, 10, '#333333');
  const fillW = Math.max(20, Math.round(gw * (payload.gauge ? payload.gauge.fill_pct : 0.5)));
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(gx, gy, fillW, gh, 10);
  ctx.clip();
  gradientH(ctx, gx, gy, fillW, gh, CFG.COLORS.bearRed, CFG.COLORS.yellow);
  ctx.restore();

  // ── 8. Kimchi premium ───────────────────────────────────
  const kpY = 880;
  roundRect(ctx, 40, kpY, W - 80, 140, 20,
    CFG.COLORS.bgCard, CFG.COLORS.yellow, 2);

  fillText(ctx, '🥬 김치 프리미엄', 80, kpY + 18, CFG.COLORS.yellow, 'Black', 30);
  fillText(ctx, t.kimchi_rate, 80, kpY + 62, CFG.COLORS.white, 'Medium', 28);
  const premColor = t.kimchi_premium.startsWith('-') ? CFG.COLORS.bearRed : CFG.COLORS.bullGreen;
  fillText(ctx, `프리미엄: ${t.kimchi_premium}`, 80, kpY + 100, premColor, 'Bold', 28);

  // ── 9. Trending TOP 3 ────────────────────────────────────
  const trY = 1070;
  roundRect(ctx, 40, trY, W - 80, 280, 20,
    CFG.COLORS.bgCard, CFG.COLORS.yellow, 2);

  fillText(ctx, '🚀 트렌딩 TOP 3', 80, trY + 18, CFG.COLORS.yellow, 'Black', 32);

  const trendAccents = [CFG.COLORS.bearRed, '#FF9100', '#00BCD4'];
  for (let i = 0; i < 3; i++) {
    const iy  = trY + 80 + i * 66;
    const ac  = trendAccents[i];
    const ck  = `trend_${i + 1}_change`;
    const chg = t[ck] || '';
    const chgC = chg.startsWith('-') ? CFG.COLORS.bearRed : CFG.COLORS.bullGreen;

    // Rank badge
    ctx.beginPath();
    ctx.arc(80, iy + 20, 22, 0, Math.PI * 2);
    ctx.fillStyle = ac;
    ctx.fill();
    setFont(ctx, 'Black', 24);
    ctx.fillStyle = CFG.COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), 80, iy + 21);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    fillText(ctx, t[`trend_${i + 1}_name`] || '—', 116, iy + 4,
      CFG.COLORS.white, 'Bold', 28);
    fillText(ctx, chg, W - 60, iy + 4, chgC, 'Black', 28, 'right');
  }

  // ── 10. Quote card ───────────────────────────────────────
  const qY = 1400;
  roundRect(ctx, 40, qY, W - 80, 160, 20,
    'rgba(0,176,9,0.12)', CFG.COLORS.bullGreen, 2);

  fillText(ctx, '\u201c', 60, qY + 5, CFG.COLORS.bullGreen, 'Black', 70);
  fillText(ctx, t.quote_line1, 110, qY + 30, CFG.COLORS.white, 'Bold', 32);
  fillText(ctx, t.quote_line2, 110, qY + 80, CFG.COLORS.gray, 'Medium', 28);
  fillText(ctx, '\u201d', W - 80, qY + 90, CFG.COLORS.bullGreen, 'Black', 70, 'right');

  // ── 11. Footer ───────────────────────────────────────────
  const footY = 1620;
  fillText(ctx, '@coiniseasy', W / 2, footY,
    CFG.COLORS.yellow, 'Bold', 34, 'center');
  fillText(ctx, 'Korea\'s #1 Web3 GTM Agency', W / 2, footY + 46,
    CFG.COLORS.cream, 'Medium', 24, 'center');
  fillText(ctx, '#CoinEasy #Crypto #Shorts', W / 2, footY + 86,
    CFG.COLORS.gray, 'Medium', 22, 'center');

  // ── 12. Bottom accent bar ────────────────────────────────
  gradientH(ctx, 0, H - 8, W, 8, CFG.COLORS.bullGreen, CFG.COLORS.yellow);

  // ── 13. Apply fade alpha ─────────────────────────────────
  if (alpha < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - alpha})`;
    ctx.fillRect(0, 0, W, H);
  }

  return canvas.toBuffer('image/png');
}

// ─── TTS narration ────────────────────────────────────────

/**
 * Generate Korean TTS audio using edge-tts CLI.
 * Returns path to the generated MP3 file.
 */
async function generateTTS(payload, outputDir) {
  const t = payload.texts;

  const script = [
    `안녕하세요, 코인이지 데일리 브리핑입니다.`,
    `${t.date_label} 시장 현황을 전해드립니다.`,
    `비트코인은 현재 ${t.btc_price}이며, 24시간 변동률은 ${t.btc_change}입니다.`,
    `이더리움 ${t.eth_price}, 솔라나 ${t.sol_price}, 리플 ${t.xrp_price}.`,
    `공포 탐욕 지수는 ${t.fear_value}로 ${t.fear_label} 구간입니다.`,
    `김치 프리미엄은 ${t.kimchi_premium}입니다.`,
    `오늘의 한 줄: ${t.quote_line1}. ${t.quote_line2}.`,
    `코인이지와 함께 오늘도 이지하게!`,
  ].join(' ');

  const audioPath = path.join(outputDir, 'narration.mp3');

  await new Promise((resolve, reject) => {
    const proc = spawn('edge-tts', [
      '--voice',  CFG.TTS_VOICE,
      '--rate',   CFG.TTS_RATE,
      '--volume', CFG.TTS_VOLUME,
      '--text',   script,
      '--write-media', audioPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`edge-tts exited ${code}: ${stderr}`));
    });
    proc.on('error', reject);
  });

  return audioPath;
}

// ─── Frame sequence → video ───────────────────────────────

/**
 * Write all frames to disk and compose them into an MP4 with ffmpeg.
 */
async function framesToVideo(framesDir, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();

    // Input: image sequence at 30 fps
    cmd.input(path.join(framesDir, 'frame_%05d.png'))
       .inputOptions([`-framerate ${CFG.FRAME_RATE}`]);

    // Input: TTS audio
    if (audioPath && fs.existsSync(audioPath)) {
      cmd.input(audioPath);
    }

    cmd
      .videoCodec(CFG.VIDEO_CODEC)
      .audioCodec(CFG.AUDIO_CODEC)
      .outputOptions([
        `-pix_fmt ${CFG.PIXEL_FORMAT}`,
        `-preset ${CFG.PRESET}`,
        `-crf ${CFG.CRF}`,
        `-b:v ${CFG.VIDEO_BITRATE}`,
        `-b:a ${CFG.AUDIO_BITRATE}`,
        `-r ${CFG.FRAME_RATE}`,
        // Trim to exact duration (audio may be shorter/longer than frames)
        `-t ${CFG.DURATION_SECONDS}`,
        // Shortest flag: end when shortest stream ends
        '-shortest',
        // Metadata tag that signals YouTube Shorts
        '-metadata', 'comment=YouTube Shorts',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('start', (cmd) => console.log(`  [ffmpeg] ${cmd}`))
      .on('error', reject)
      .on('end',   resolve)
      .run();
  });
}

// ─── Public API ───────────────────────────────────────────

/**
 * Generate a YouTube Shorts MP4 from the daily market payload.
 *
 * @param {object} payload  - result of figmaDataBuilder.buildPayload()
 * @returns {string}        - absolute path to the generated MP4 file
 */
async function generateYouTubeShort(payload) {
  ensureFonts();

  // Create a unique working directory for this run
  const runId  = Date.now();
  const runDir = path.join(CFG.OUTPUT_DIR, String(runId));
  fs.mkdirSync(runDir, { recursive: true });

  const framesDir = path.join(runDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  const totalFrames = CFG.DURATION_SECONDS * CFG.FRAME_RATE;

  console.log(`  [shorts] Rendering ${totalFrames} frames (${CFG.DURATION_SECONDS}s @ ${CFG.FRAME_RATE}fps)…`);

  // Render frames in batches to avoid memory pressure
  const BATCH = 30;
  for (let i = 0; i < totalFrames; i++) {
    const buf  = await renderFrame(payload, i, totalFrames);
    const name = `frame_${String(i).padStart(5, '0')}.png`;
    fs.writeFileSync(path.join(framesDir, name), buf);

    if ((i + 1) % BATCH === 0 || i === totalFrames - 1) {
      console.log(`  [shorts] Frames: ${i + 1}/${totalFrames}`);
    }
  }

  // Generate TTS narration
  let audioPath = null;
  try {
    console.log('  [shorts] Generating TTS narration…');
    audioPath = await generateTTS(payload, runDir);
    console.log(`  [shorts] TTS done: ${audioPath}`);
  } catch (e) {
    console.warn(`  [shorts] TTS failed (continuing without audio): ${e.message}`);
  }

  // Compose video
  const outputPath = path.join(runDir, `coineasy_short_${runId}.mp4`);
  console.log('  [shorts] Composing MP4…');
  await framesToVideo(framesDir, audioPath, outputPath);
  console.log(`  [shorts] MP4 ready: ${outputPath}`);

  // Clean up frame PNGs to save disk space (keep audio + mp4)
  for (let i = 0; i < totalFrames; i++) {
    const name = path.join(framesDir, `frame_${String(i).padStart(5, '0')}.png`);
    try { fs.unlinkSync(name); } catch (_) {}
  }
  try { fs.rmdirSync(framesDir); } catch (_) {}

  return outputPath;
}

module.exports = { generateYouTubeShort };

// ─── CLI test ─────────────────────────────────────────────
if (require.main === module) {
  const samplePayload = {
    texts: {
      date_label:     '5월 1일 목요일 아침',
      btc_price:      '$95,200',
      btc_change:     '+2.34%',
      market_change:  'MARKET +1.87%',
      eth_price:      '$3,450',
      eth_change:     '+1.12%',
      sol_price:      '$148.5',
      sol_change:     '+3.21%',
      xrp_price:      '$2.18',
      xrp_change:     '-0.45%',
      fear_value:     '62',
      fear_label:     'Greed',
      fear_note:      '탐욕 우세 — 리스크 관리',
      kimchi_rate:    '환율: ₩1,380/USDT',
      kimchi_premium: '+1.23%',
      kimchi_note:    '한국 매수세 강함',
      trend_1_name:   'BTC (Bitcoin)',
      trend_1_change: '+2.34%',
      trend_2_name:   'ETH (Ethereum)',
      trend_2_change: '+1.12%',
      trend_3_name:   'SOL (Solana)',
      trend_3_change: '+3.21%',
      quote_line1:    '조용한 상승이 가장 건강한 신호',
      quote_line2:    '차분히 데이터를 보고 판단하자',
    },
    gauge:  { fill_pct: 0.62 },
    colors: {
      btc_change: '#00b009',
      eth_change: '#00b009',
      sol_change: '#00b009',
      xrp_change: '#ff1f1f',
    },
  };

  generateYouTubeShort(samplePayload)
    .then((p) => console.log('Generated:', p))
    .catch((e) => { console.error(e); process.exit(1); });
}
