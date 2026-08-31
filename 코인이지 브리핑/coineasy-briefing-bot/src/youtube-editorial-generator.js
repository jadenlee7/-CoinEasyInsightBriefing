import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createCanvas, loadImage, registerFont } from 'canvas';
import ffmpeg from 'fluent-ffmpeg';
import * as CFG from './youtube-shorts-config.js';
import { assertTtsDuration, buildNarration, sceneForTime } from './youtube-editorial-copy.js';

const BRAND_DIR = process.env.COINEASY_BRAND_DIR
  || path.resolve(process.cwd(), '../../coineasy_brand');
const BRAND_ASSET_DIR = path.join(BRAND_DIR, 'assets', 'brand');
const BRAND_FONT_DIR = path.join(BRAND_DIR, 'assets', 'fonts');
const FONT_FAMILY = 'Gmarket Sans';
let fontsRegistered = false;

function ensureFonts() {
  if (fontsRegistered) return;
  for (const [name, weight] of [
    ['GmarketSansTTFBold.ttf', 'Bold'],
    ['GmarketSansTTFMedium.ttf', 'Medium'],
    ['GmarketSansTTFLight.ttf', 'Light'],
  ]) {
    try { registerFont(path.join(BRAND_FONT_DIR, name), { family: FONT_FAMILY, weight }); } catch (_) {}
  }
  fontsRegistered = true;
}

async function loadBrandAssets() {
  // Official CoinEasy 2026 Main Orange Logo (Figma node 28747:92), with transparency.
  const [wordmark, easyboy] = await Promise.all([
    loadImage(path.join(BRAND_ASSET_DIR, 'logo_main_orange_transparent.png')),
    loadImage(path.join(BRAND_ASSET_DIR, 'easyboy_analyst.png')),
  ]);
  return { wordmark, easyboy };
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px "${FONT_FAMILY}"`;
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke = null, lineWidth = 0) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke && lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawText(ctx, text, x, y, {
  size = 52, weight = 'Medium', color = CFG.COLORS.ink, align = 'left',
} = {}) {
  setFont(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(compact(text), x, y);
}

function wrapLines(ctx, text, maxWidth, maxLines = 3) {
  const source = compact(text);
  const words = source.split(' ');
  const lines = [];
  let line = '';
  let consumed = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
      consumed += word.length;
    } else {
      lines.push(line);
      line = word;
      consumed += word.length;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (consumed < source.replace(/\s/g, '').length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[….]+$/, '')}…`;
  }
  return lines;
}

function drawWrapped(ctx, text, x, y, {
  maxWidth = 880, maxLines = 3, lineHeight = 1.26,
  size = 74, weight = 'Bold', color = CFG.COLORS.ink, align = 'left',
} = {}) {
  setFont(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const lines = wrapLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * size * lineHeight));
  return lines.length;
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#FFF3FC');
  gradient.addColorStop(0.58, '#FFE1D5');
  gradient.addColorStop(1, '#FFF8F0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = CFG.COLORS.orange;
  ctx.beginPath();
  ctx.arc(width + 40, 220, 310, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-80, height - 180, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawHeader(ctx, assets, date, sceneIndex) {
  const logoHeight = 64;
  const ratio = assets.wordmark.width / assets.wordmark.height;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(assets.wordmark, 70, 76, logoHeight * ratio, logoHeight);
  drawText(ctx, date.replaceAll('-', '.'), 1010, 118, {
    size: 30, weight: 'Medium', color: CFG.COLORS.muted, align: 'right',
  });
  const labels = ['오늘의 핵심', '확인된 사실', '왜 중요한가', '시장 체크', '오늘의 행동', '더 빠른 업데이트'];
  roundRect(ctx, 70, 178, 330, 66, 33, '#FFF8F0', CFG.COLORS.orange, 3);
  drawText(ctx, labels[sceneIndex], 235, 224, {
    size: 30, weight: 'Bold', color: CFG.COLORS.orange, align: 'center',
  });
}

function drawProgress(ctx, seconds) {
  const progress = Math.max(0, Math.min(1, seconds / CFG.DURATION_SECONDS));
  ctx.fillStyle = '#F4D8CB';
  ctx.fillRect(0, 0, CFG.VIDEO_WIDTH, 14);
  ctx.fillStyle = CFG.COLORS.orange;
  ctx.fillRect(0, 0, CFG.VIDEO_WIDTH * progress, 14);
}

function drawGround(ctx, assets) {
  const y = 1650;
  ctx.fillStyle = CFG.COLORS.orange;
  for (let x = 0; x < CFG.VIDEO_WIDTH; x += 36) {
    ctx.fillRect(x, y + ((x / 36) % 2) * 14, 24, 14);
  }
  ctx.imageSmoothingEnabled = false;
  const mascotHeight = 250;
  const mascotWidth = mascotHeight * (assets.easyboy.width / assets.easyboy.height);
  ctx.drawImage(assets.easyboy, CFG.VIDEO_WIDTH - mascotWidth - 82, y - mascotHeight + 42, mascotWidth, mascotHeight);
}

function drawScene(ctx, payload, sceneIndex) {
  const e = payload.editorial;
  const t = payload.texts;
  const left = 72;
  if (sceneIndex === 0) {
    drawWrapped(ctx, e.headline, left, 500, { size: 100, maxWidth: 920, maxLines: 3, lineHeight: 1.18 });
    drawWrapped(ctx, '숫자보다 맥락, 속보보다 확인', left, 930, {
      size: 42, weight: 'Medium', color: CFG.COLORS.muted, maxWidth: 860, maxLines: 2,
    });
  } else if (sceneIndex === 1) {
    drawWrapped(ctx, e.factTitle, left, 420, { size: 72, maxWidth: 900, maxLines: 2 });
    roundRect(ctx, 70, 720, 940, 500, 42, '#FFFBF6');
    drawText(ctx, 'FACT 01', 120, 800, { size: 30, weight: 'Bold', color: CFG.COLORS.orange });
    drawWrapped(ctx, e.fact, 120, 900, { size: 55, maxWidth: 840, maxLines: 3, lineHeight: 1.38 });
    drawText(ctx, e.sourceLabel, 120, 1160, { size: 28, color: CFG.COLORS.muted });
  } else if (sceneIndex === 2) {
    drawWrapped(ctx, e.verdict || e.context, left, 470, { size: 66, maxWidth: 900, maxLines: 4, lineHeight: 1.3 });
    roundRect(ctx, 70, 1030, 700, 92, 46, CFG.COLORS.orange);
    drawText(ctx, '해석과 확정된 사실을 구분하세요', 420, 1090, {
      size: 31, weight: 'Bold', color: '#FFFFFF', align: 'center',
    });
  } else if (sceneIndex === 3) {
    drawWrapped(ctx, e.marketContext, left, 390, { size: 58, maxWidth: 900, maxLines: 3, lineHeight: 1.2 });
    const cards = [
      ['BTC', t.btc_price, t.btc_change],
      ['김치프리미엄', t.kimchi_premium, '국내·글로벌 가격차'],
      ['공포탐욕', `${t.fear_value} · ${t.fear_label}`, '심리 지표'],
    ];
    cards.forEach((card, index) => {
      const y = 610 + index * 255;
      roundRect(ctx, 70, y, 940, 205, 38, '#FFFBF6');
      drawText(ctx, card[0], 120, y + 62, { size: 31, weight: 'Bold', color: CFG.COLORS.orange });
      drawText(ctx, card[1], 120, y + 145, { size: 60, weight: 'Bold' });
      drawText(ctx, card[2], 960, y + 142, { size: 27, color: CFG.COLORS.muted, align: 'right' });
    });
  } else if (sceneIndex === 4) {
    drawWrapped(ctx, e.action, left, 460, { size: 68, maxWidth: 900, maxLines: 4, lineHeight: 1.28 });
    roundRect(ctx, 70, 980, 760, 108, 54, '#FFFBF6', CFG.COLORS.orange, 3);
    drawText(ctx, '✓ 원문 · 날짜 · 적용 대상 순으로 확인', 450, 1048, {
      size: 31, weight: 'Bold', align: 'center',
    });
    drawText(ctx, '※ 교육용 정보이며 투자·법률·세무 자문이 아닙니다.', left, 1210, {
      size: 27, color: CFG.COLORS.muted,
    });
  } else {
    drawWrapped(ctx, e.sourceCta, left, 480, { size: 78, maxWidth: 880, maxLines: 4, lineHeight: 1.22 });
    roundRect(ctx, 70, 980, 690, 116, 58, CFG.COLORS.orange);
    drawText(ctx, '텔레그램  @coiniseasy', 415, 1053, {
      size: 37, weight: 'Bold', color: '#FFFFFF', align: 'center',
    });
    drawText(ctx, e.sourceLabel, left, 1210, { size: 28, color: CFG.COLORS.muted });
  }
  if (sceneIndex !== 3) drawGround(ctx, payload.assets);
  drawText(ctx, 'COINEASY DAILY INSIGHT', 70, 1810, { size: 25, color: CFG.COLORS.muted });
}

function renderFrame(payload, seconds) {
  ensureFonts();
  const canvas = createCanvas(CFG.VIDEO_WIDTH, CFG.VIDEO_HEIGHT);
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, CFG.VIDEO_WIDTH, CFG.VIDEO_HEIGHT);
  const sceneIndex = sceneForTime(seconds);
  drawHeader(ctx, payload.assets, payload.editorialDate, sceneIndex);
  drawScene(ctx, payload, sceneIndex);
  drawProgress(ctx, seconds);
  return canvas;
}

async function generateTTS(payload, outDir) {
  const audioPath = path.join(outDir, 'narration.mp3');
  await new Promise((resolve, reject) => {
    const proc = spawn('edge-tts', [
      '--voice', CFG.TTS_VOICE, '--rate', CFG.TTS_RATE, '--volume', CFG.TTS_VOLUME,
      '--text', buildNarration(payload), '--write-media', audioPath,
    ]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`edge-tts exited ${code}: ${stderr}`)));
    proc.on('error', reject);
  });
  return audioPath;
}

async function probeAudioDuration(audioPath) {
  const duration = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (error, metadata) => {
      if (error) reject(new Error(`ffprobe error: ${error.message}`));
      else resolve(metadata?.format?.duration);
    });
  });
  return assertTtsDuration(duration);
}

async function renderFrames(payload, outDir) {
  const totalFrames = CFG.DURATION_SECONDS * CFG.FRAME_RATE;
  const framesDir = path.join(outDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  for (let index = 0; index < totalFrames; index += 1) {
    const canvas = renderFrame(payload, index / CFG.FRAME_RATE);
    fs.writeFileSync(
      path.join(framesDir, `frame_${String(index).padStart(6, '0')}.png`),
      canvas.toBuffer('image/png'),
    );
  }
  return path.join(framesDir, 'frame_%06d.png');
}

async function composeVideo(framePattern, audioPath, outDir) {
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error('TTS 음성 없이 영상을 조합할 수 없습니다.');
  const outputPath = path.join(outDir, `coineasy_editorial_${Date.now()}.mp4`);
  await new Promise((resolve, reject) => {
    const command = ffmpeg()
      .input(framePattern)
      .inputOptions([`-framerate ${CFG.FRAME_RATE}`, '-f image2'])
      .input(audioPath);
    command.outputOptions([
      `-t ${CFG.DURATION_SECONDS}`, `-c:v ${CFG.VIDEO_CODEC}`, `-preset ${CFG.PRESET}`,
      `-crf ${CFG.CRF}`, `-b:v ${CFG.VIDEO_BITRATE}`, `-pix_fmt ${CFG.PIXEL_FORMAT}`,
      `-c:a ${CFG.AUDIO_CODEC}`, `-b:a ${CFG.AUDIO_BITRATE}`, '-af apad', '-movflags +faststart',
    ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', (error) => reject(new Error(`ffmpeg error: ${error.message}`)))
      .run();
  });
  return outputPath;
}

async function generateEditorialShort(payload) {
  if (!payload?.editorial) throw new Error('기사형 쇼츠 editorial 데이터가 없습니다.');
  if (payload?.youtube?.duration_seconds !== CFG.DURATION_SECONDS) {
    throw new Error(`승인된 영상 길이가 ${CFG.DURATION_SECONDS}초와 다릅니다.`);
  }
  fs.mkdirSync(CFG.OUTPUT_DIR, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(CFG.OUTPUT_DIR, 'editorial-'));
  try {
    payload.assets = await loadBrandAssets();
    const audioPath = await generateTTS(payload, workDir);
    const audioDuration = await probeAudioDuration(audioPath);
    console.log(`  [editorial] 필수 TTS 검증 완료 (${audioDuration.toFixed(2)}초)`);
    console.log(`  [editorial] ${CFG.DURATION_SECONDS}초 기사형 프레임 렌더링...`);
    const framePattern = await renderFrames(payload, workDir);
    return await composeVideo(framePattern, audioPath, workDir);
  } catch (error) {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_) {}
    throw error;
  }
}

export { generateEditorialShort, probeAudioDuration, renderFrame };
