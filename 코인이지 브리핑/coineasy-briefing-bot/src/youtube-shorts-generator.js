// src/youtube-shorts-generator.js
// ================================
// Generates a vertical (9:16, 1080x1920) MP4 YouTube Short from the
// daily market payload produced by figma-daily/figmaDataBuilder.js.
//
// Pipeline:
//   1. Render each frame as a PNG via node-canvas
//   2. Generate Korean TTS narration with edge-tts
//   3. Compose frames + audio into an MP4 with fluent-ffmpeg
//
// Fixes:
//   - Banner layout spacing fixed (no overlapping elements)
//   - Korean subtitles rendered at bottom of video
//   - All text in Korean

// ESM mode

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
const execFileAsync       = promisify(execFile);
import { createCanvas, registerFont } from 'canvas';
import ffmpeg from 'fluent-ffmpeg';
import * as CFG from './youtube-shorts-config.js';

// --- Font setup ---
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
          try { registerFont(fp, { family: FONT_FAMILY, weight }); } catch (_) {}
    }
    _fontsRegistered = true;
}

// --- Canvas helpers ---
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

// --- Subtitle text for each time segment ---
function getSubtitleForTime(payload, t) {
    const txt = payload.texts;
    // Each subtitle shown for a portion of the video duration
  const segments = [
      { start: 0, end: 3, text: `${txt.date_label} 코인이지 마켓 브리핑` },
    `비티씨 이티에프 자금 흐름은 ${t.btc_etf_total || '데이터 없음'} ${t.btc_etf_direction || ''}, 이더리움 이티에프는 ${t.eth_etf_total || '데이터 없음'} ${t.eth_etf_direction || ''}입니다.`,
      { start: 3, end: 7, text: `비트코인 ${txt.btc_price} (${txt.btc_change})` },
      { start: 7, end: 10, text: `이더리움 ${txt.eth_price} (${txt.eth_change})` },
      { start: 10, end: 13, text: `솔라나 ${txt.sol_price} (${txt.sol_change})` },
      { start: 13, end: 17, text: `BTC ETF ${txt.btc_etf_total || 'N/A'} | ETH ETF ${txt.eth_etf_total || 'N/A'}` },
      { start: 17, end: 20, text: `공포탐욕지수 ${txt.fear_value} (${txt.fear_label})` },
      { start: 20, end: 23, text: `김치 프리미엄 ${txt.kimchi_premium}` },
      { start: 23, end: 28, text: `"${txt.quote_line1}"` },
      { start: 28, end: 32, text: txt.quote_line2 },
      { start: 32, end: 38, text: '코인이지 텔레그램 구독하세요!' },
    ]
    for (const seg of segments) {
          if (t >= seg.start && t < seg.end) return seg.text;
    }
    return '';
}

// --- Frame renderer ---
function renderFrame(payload, t) {
    ensureFonts();
    const W = CFG.VIDEO_WIDTH;   // 1080
  const H = CFG.VIDEO_HEIGHT;  // 1920
  const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const texts = payload.texts;
    const colors = payload.colors;

  // Background
  ctx.fillStyle = CFG.COLORS.bg;
    ctx.fillRect(0, 0, W, H);

  // Fade-in / fade-out
  let alpha = 1;
    if (t < CFG.ANIM.fadeInDuration) {
          alpha = t / CFG.ANIM.fadeInDuration;
    } else if (t > CFG.ANIM.fadeOutStart) {
          alpha = 1 - (t - CFG.ANIM.fadeOutStart) / CFG.ANIM.fadeOutDuration;
    }
    alpha = Math.max(0, Math.min(1, alpha));
    ctx.globalAlpha = alpha;

  // === Header (Y: 80~260) ===
  const headerY = 80;
    fillText(ctx, 'CoinEasy', W / 2, headerY, CFG.COLORS.yellow, 'Black', 68, 'center');
    fillText(ctx, '\uB370\uC77C\uB9AC \uB9C8\uCF13 \uBE0C\uB9AC\uD551', W / 2, headerY + 70, CFG.COLORS.cream, 'Bold', 40, 'center');
    fillText(ctx, texts.date_label, W / 2, headerY + 125, CFG.COLORS.gray, 'Regular', 32, 'center');

  // Divider
  ctx.strokeStyle = CFG.COLORS.orange;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(60, headerY + 155);
    ctx.lineTo(W - 60, headerY + 155);
    ctx.stroke();

  // === BTC card (Y: 260~440) ===
  const btcY = 260;
    roundRect(ctx, 40, btcY, W - 80, 170, 20, CFG.COLORS.bgCard);
    fillText(ctx, '\u20BF BTC', 80, btcY + 50, CFG.COLORS.yellow, 'Bold', 44);
    fillText(ctx, texts.btc_price, 80, btcY + 115, CFG.COLORS.white, 'Black', 58);
    const btcColor = colors.btc_change || CFG.COLORS.gray;
    fillText(ctx, texts.btc_change, W - 80, btcY + 115, btcColor, 'Bold', 48, 'right');

  // === Alt coins (Y: 450~580) ===
  const altCoins = [
    { label: 'ETH', price: texts.eth_price, change: texts.eth_change, color: colors.eth_change },
    { label: 'SOL', price: texts.sol_price, change: texts.sol_change, color: colors.sol_change },
    { label: 'XRP', price: texts.xrp_price, change: texts.xrp_change, color: colors.xrp_change },
      ];
    const altY = 450;
    const colW = (W - 100) / 3;
    altCoins.forEach((coin, i) => {
          const cx = 50 + i * (colW + 5);
          roundRect(ctx, cx, altY, colW - 5, 130, 16, CFG.COLORS.bgCard);
          fillText(ctx, coin.label, cx + (colW - 5) / 2, altY + 40, CFG.COLORS.cream, 'Bold', 32, 'center');
          fillText(ctx, coin.price, cx + (colW - 5) / 2, altY + 80, CFG.COLORS.white, 'Bold', 26, 'center');
          fillText(ctx, coin.change, cx + (colW - 5) / 2, altY + 112, coin.color || CFG.COLORS.gray, 'Regular', 24, 'center');
    });

  // === ETF Flow Card (Y: 600~730) ===
  const etfY = 600;
  roundRect(ctx, 40, etfY, W - 80, 130, 20, CFG.COLORS.bgCard);
  fillText(ctx, '📈 ETF 자금 흐름', 80, etfY + 40, CFG.COLORS.orange, 'Bold', 32);
  
  const btcEtfColor = colors.btc_etf_total || CFG.COLORS.gray;
  const ethEtfColor = colors.eth_etf_total || CFG.COLORS.gray;
  fillText(ctx, `BTC ETF: ${texts.btc_etf_total || 'N/A'}`, 80, etfY + 85, btcEtfColor, 'Bold', 30);
  fillText(ctx, `(${texts.btc_etf_direction || ''})`, 380, etfY + 85, btcEtfColor, 'Regular', 24);
  fillText(ctx, `ETH ETF: ${texts.eth_etf_total || 'N/A'}`, 560, etfY + 85, ethEtfColor, 'Bold', 30);
  fillText(ctx, `(${texts.eth_etf_direction || ''})`, 830, etfY + 85, ethEtfColor, 'Regular', 24);
  
  // ETF note
  if (texts.etf_note) {
    fillText(ctx, texts.etf_note, W / 2, etfY + 118, CFG.COLORS.gray, 'Regular', 22, 'center');
  }

  // === Fear & Greed + Kimchi (Y: 600~740) ===
  const fgY = 750;
    roundRect(ctx, 40, fgY, W - 80, 140, 20, CFG.COLORS.bgCard);
    fillText(ctx, '\uD83D\uDE28 \uACF5\uD3EC\uD0D0\uC695\uC9C0\uC218', 80, fgY + 45, CFG.COLORS.cream, 'Bold', 32);
    fillText(ctx, `${texts.fear_value} (${texts.fear_label})`, 80, fgY + 100, CFG.COLORS.white, 'Black', 42);
    fillText(ctx, `\uD83E\uDD6C \uAE40\uD504 ${texts.kimchi_premium}`, W - 80, fgY + 72, CFG.COLORS.yellow, 'Bold', 32, 'right');

  // === Trending (Y: 760~1020) ===
  const trendY = 910;
    fillText(ctx, '\uD83D\uDE80 \uD2B8\uB80C\uB529', 80, trendY, CFG.COLORS.orange, 'Bold', 36);
    const trends = [
      { name: texts.trend_1_name, change: texts.trend_1_change, color: colors.trend_1_change },
      { name: texts.trend_2_name, change: texts.trend_2_change, color: colors.trend_2_change },
      { name: texts.trend_3_name, change: texts.trend_3_change, color: colors.trend_3_change },
        ];
    trends.forEach((tr, i) => {
          const ty = trendY + 50 + i * 65;
          roundRect(ctx, 40, ty, W - 80, 55, 12, CFG.COLORS.bgCard);
          fillText(ctx, tr.name, 80, ty + 38, CFG.COLORS.white, 'Regular', 28);
          fillText(ctx, tr.change, W - 80, ty + 38, tr.color || CFG.COLORS.gray, 'Bold', 28, 'right');
    });

  // === Quote (Y: 1040~1200) ===
  const quoteY = 1150;
    roundRect(ctx, 40, quoteY, W - 80, 160, 20, CFG.COLORS.bgCard);
    fillText(ctx, `\u201C${texts.quote_line1}\u201D`, W / 2, quoteY + 60, CFG.COLORS.cream, 'Medium', 30, 'center');
    fillText(ctx, texts.quote_line2, W / 2, quoteY + 115, CFG.COLORS.gray, 'Regular', 26, 'center');

  // === CTA (Y: 1230~1320) ===
  roundRect(ctx, 40, 1340, W - 80, 90, 16, CFG.COLORS.orange);
    fillText(ctx, '\uD83D\uDCE2 \uD154\uB808\uADF8\uB7A8\uC5D0\uC11C \uC2E4\uC2DC\uAC04 \uBE0C\uB9AC\uD551 \uBC1B\uAE30', W / 2, 1375, CFG.COLORS.white, 'Bold', 32, 'center');
    fillText(ctx, '@coiniseasy \uAD6C\uB3C5\uD558\uAE30', W / 2, 1410, CFG.COLORS.yellow, 'Bold', 28, 'center');

  // === Footer text (Y: 1340) ===
  const footerText = payload.session ? payload.session.footer : '\uB9E4\uC77C \uC544\uCE68 8\uC2DC';
    fillText(ctx, `CoinEasy \u2022 ${footerText}`, W / 2, 1460, CFG.COLORS.gray, 'Regular', 26, 'center');

  // === Korean Subtitle at bottom (Y: 1720~1820) ===
  const subtitle = getSubtitleForTime(payload, t);
    if (subtitle) {
          // Semi-transparent black background for subtitle
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(20, 1700, W - 40, 100);

      // Subtitle text - white, centered, large and readable
      setFont(ctx, 'Bold', 36);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';

      // Word wrap if needed
      const maxWidth = W - 80;
          const measured = ctx.measureText(subtitle).width;
          if (measured > maxWidth) {
                  // Split into two lines
            const mid = Math.ceil(subtitle.length / 2);
                  let splitIdx = subtitle.lastIndexOf(' ', mid);
                  if (splitIdx < 0) splitIdx = mid;
                  const line1 = subtitle.slice(0, splitIdx).trim();
                  const line2 = subtitle.slice(splitIdx).trim();
                  ctx.fillText(line1, W / 2, 1738);
                  ctx.fillText(line2, W / 2, 1778);
          } else {
                  ctx.fillText(subtitle, W / 2, 1760);
          }
    }

  ctx.globalAlpha = 1;
    return canvas;
}

// --- TTS generation ---
async function generateTTS(payload, outDir) {
    const t = payload.texts;
    const script = [
          `\uCF54\uC778\uC774\uC9C0 ${payload.session ? payload.session.greeting : '\uB370\uC77C\uB9AC \uB9C8\uCF13 \uBE0C\uB9AC\uD551\uC785\uB2C8\uB2E4'}.`,
          `${t.date_label}.`,
          `\uBE44\uD2B8\uCF54\uC778\uC740 \uD604\uC7AC ${t.btc_price}, ${t.btc_change}\uC785\uB2C8\uB2E4.`,
          `\uC774\uB354\uB9AC\uC6C0 ${t.eth_price} ${t.eth_change},`,
          `\uC194\uB77C\uB098 ${t.sol_price} ${t.sol_change}.`,
          `\uACF5\uD3EC\uD0D0\uC695\uC9C0\uC218\uB294 ${t.fear_value}, ${t.fear_label} \uAD6C\uAC04\uC785\uB2C8\uB2E4.`,
          `\uAE40\uCE58 \uD504\uB9AC\uBBF8\uC5C4\uC740 ${t.kimchi_premium}.`,
          `\uC624\uB298\uC758 \uC778\uC0AC\uC774\uD2B8: ${t.quote_line1}. ${t.quote_line2}.`,
          `${payload.session ? payload.session.cta : '\uCF54\uC778\uC774\uC9C0\uC640 \uD568\uAED8 \uC624\uB298\uB3C4 \uD604\uBA85\uD55C \uD22C\uC790 \uD558\uC138\uC694'}.`,
          `\uCF54\uC778\uC774\uC9C0 \uD154\uB808\uADF8\uB7A8 \uCC44\uB110\uC5D0\uC11C \uB9E4\uC77C \uC544\uCE68 \uC800\uB155 \uC2E4\uC2DC\uAC04 \uBE0C\uB9AC\uD551\uC744 \uBC1B\uC544\uBCF4\uC138\uC694. @coiniseasy\uB97C \uAC80\uC0C9\uD558\uACE0 \uAD6C\uB3C5\uD574\uC8FC\uC138\uC694.`,
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
                  if (code === 0) resolve(audioPath);
                  else reject(new Error(`edge-tts exited ${code}: ${stderr}`));
          });
          proc.on('error', reject);
    });
    return audioPath;
}

// --- Frame sequence to video ---
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

// --- Public API ---
async function generateYouTubeShort(payload) {
    fs.mkdirSync(CFG.OUTPUT_DIR, { recursive: true });
    const workDir = fs.mkdtempSync(path.join(CFG.OUTPUT_DIR, 'job-'));
    console.log(`  [generator] 작업 디렉토리: ${workDir}`);

  try {
        console.log(`  [generator] 프레임 렌더링 중 (${CFG.DURATION_SECONDS * CFG.FRAME_RATE}장)...`);
        const framePattern = await renderFrames(payload, workDir);
        console.log('  [generator] 프레임 렌더링 완료');

      let audioPath = null;
        try {
                console.log('  [generator] TTS 나레이션 생성 중...');
                audioPath = await generateTTS(payload, workDir);
                console.log(`  [generator] TTS 완료: ${audioPath}`);
        } catch (ttsErr) {
                console.warn(`  [generator] TTS 실패 (무음으로 진행): ${ttsErr.message}`);
        }

      console.log('  [generator] 영상 합성 중...');
        const videoPath = await composeVideo(framePattern, audioPath, workDir);
        console.log(`  [generator] 영상 합성 완료: ${videoPath}`);

      return videoPath;
  } catch (err) {
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
        throw err;
  }
}

export { generateYouTubeShort };
