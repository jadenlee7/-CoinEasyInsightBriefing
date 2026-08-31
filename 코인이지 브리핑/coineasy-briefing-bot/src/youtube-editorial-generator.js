import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import * as CFG from './youtube-shorts-config.js';
import {
  assertTtsDuration, assertSceneTtsDurations, buildNarrationSegments,
  sceneForTime, SCENE_DURATIONS, SCENE_STARTS,
} from './youtube-editorial-copy.js';

// Resolve from the module, not the shell cwd. Docker sets the explicit brand root.
const BRAND_DIR = process.env.COINEASY_BRAND_DIR
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../coineasy_brand');
const BRAND_ASSET_DIR = path.join(BRAND_DIR, 'assets', 'brand');
const BRAND_FONT_DIR = path.join(BRAND_DIR, 'assets', 'fonts');
const LABELS = ['오늘의 질문', '확인된 사실', '사실과 해석', '시장 맥락', '오늘의 행동', '출처 · 더 알아보기'];
const WEIGHTS = ['Regular', 'Medium', 'Bold', 'ExtraBold'];
let fontsRegistered = false;

function ensureFonts() {
  if (fontsRegistered) return;
  for (const weight of WEIGHTS) {
    const fontPath = path.join(BRAND_FONT_DIR, `Pretendard-${weight}.otf`);
    if (!fs.existsSync(fontPath) || !GlobalFonts.registerFromPath(fontPath, `Pretendard ${weight}`)) {
      throw new Error(`필수 Pretendard 폰트를 등록할 수 없습니다: ${weight}`);
    }
  }
  fontsRegistered = true;
}

async function loadBrandAssets() {
  const [wordmark, easyboy] = await Promise.all([
    loadImage(path.join(BRAND_ASSET_DIR, 'figma-main-orange-logo.svg')),
    loadImage(path.join(BRAND_ASSET_DIR, 'figma-detective-easyboy.png')),
  ]);
  return { wordmark, easyboy };
}

function compact(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function font(ctx, size, weight) { ctx.font = `${size}px "Pretendard ${weight}"`; }
function line(ctx, x, y, width, color = '#DFCFC5', height = 2) {
  ctx.fillStyle = color; ctx.fillRect(x, y, width, height);
}

function drawText(ctx, value, x, y, size = 42, weight = 'Bold', color = CFG.COLORS.ink, maxWidth = 1010 - x) {
  const text = compact(value);
  font(ctx, size, weight);
  if (ctx.measureText(text).width > maxWidth) throw new Error(`쇼츠 텍스트가 안전 영역을 넘습니다: ${text}`);
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

// Full text is retained. Never silently truncate an approved fact or disclaimer.
function wrapText(ctx, value, maxWidth) {
  const source = compact(value);
  const lines = [];
  let current = '';
  for (const word of source.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) { current = candidate; continue; }
    if (current) { lines.push(current); current = ''; }
    for (const character of word) {
      if (ctx.measureText(current + character).width > maxWidth) {
        if (!current) throw new Error('글자 하나가 쇼츠 안전 영역보다 큽니다.');
        lines.push(current); current = '';
      }
      current += character;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitText(ctx, value, { size = 94, minSize = 46, maxWidth = 936, maxLines = 5 } = {}) {
  for (let currentSize = size; currentSize >= minSize; currentSize -= 2) {
    font(ctx, currentSize, 'ExtraBold');
    const lines = wrapText(ctx, value, maxWidth);
    if (lines.length <= maxLines) return { lines, size: currentSize };
  }
  throw new Error(`승인 원고를 줄여야 합니다. 텍스트가 장면을 넘습니다: ${compact(value)}`);
}

function drawBlock(ctx, value, x, y, options = {}) {
  const fitted = fitText(ctx, value, options);
  fitted.lines.forEach((text, index) => drawText(
    ctx, text, x, y + index * fitted.size * 1.26, fitted.size, 'ExtraBold', options.color || CFG.COLORS.ink,
  ));
  return y + fitted.lines.length * fitted.size * 1.26;
}

function drawMascot(ctx, assets, x, y, width) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(assets.easyboy, x, y, width, width * assets.easyboy.height / assets.easyboy.width);
}

function metricTimestamp(asOf) {
  const date = new Date(asOf);
  if (!Number.isFinite(date.getTime())) throw new Error('시장 지표의 기준 시각이 없습니다.');
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString();
  return `${kst.slice(5, 10).replace('-', '.')} ${kst.slice(11, 16)} KST`;
}

function drawScene(ctx, payload, sceneIndex) {
  const e = payload.editorial;
  if (sceneIndex === 0) {
    drawBlock(ctx, e.headline, 72, 460, { size: 116, minSize: 66, maxLines: 3 });
    drawText(ctx, '숫자보다 맥락, 속보보다 확인', 76, 976, 42, 'Medium', CFG.COLORS.muted);
    drawMascot(ctx, payload.assets, 526, 1070, 452);
    line(ctx, 76, 1190, 260, CFG.COLORS.orange, 14);
    line(ctx, 322, 1190, 14, CFG.COLORS.orange, 108);
    line(ctx, 322, 1284, 170, CFG.COLORS.orange, 14);
    drawText(ctx, e.sourceLabel, 76, 1540, 32, 'Bold');
  } else if (sceneIndex === 1) {
    drawText(ctx, '확인된 사실', 76, 405, 53, 'Bold', CFG.COLORS.orange);
    drawBlock(ctx, e.fact, 72, 588, { size: 84, minSize: 44, maxLines: 7 });
    line(ctx, 76, 1390, 928);
    drawText(ctx, e.sourceLabel, 76, 1500, 31, 'Medium', CFG.COLORS.muted);
    drawText(ctx, '원문 발표·집계 기준을 구분해서 읽으세요.', 76, 1560, 33, 'Medium');
  } else if (sceneIndex === 2) {
    drawText(ctx, '왜 중요한가', 76, 405, 53, 'Bold', CFG.COLORS.orange);
    drawBlock(ctx, e.verdict || e.context, 72, 590, { size: 82, minSize: 44, maxLines: 7 });
    line(ctx, 76, 1415, 928, CFG.COLORS.orange, 8);
    drawText(ctx, '해석과 확인된 사실을 구분하세요.', 76, 1530, 41, 'Bold');
  } else if (sceneIndex === 3) {
    drawBlock(ctx, e.marketContext, 72, 410, { size: 68, minSize: 40, maxLines: 4 });
    const metrics = payload.youtube?.metrics;
    if (!Array.isArray(metrics) || metrics.length !== 3) throw new Error('검증된 시장 지표 3개가 필요합니다.');
    metrics.forEach((metric, index) => {
      const y = 895 + index * 218;
      drawText(ctx, metric.label, 76, y, 43, 'Bold');
      const value = compact(metric.value);
      font(ctx, 54, 'Bold');
      const x = Math.max(466, 1004 - ctx.measureText(value).width);
      drawText(ctx, value, x, y, 54, 'Bold', CFG.COLORS.orange, 1004 - x);
      drawText(ctx, `기준 ${metricTimestamp(metric.as_of)}`, 76, y + 64, 28, 'Medium', CFG.COLORS.muted);
      line(ctx, 76, y + 98, 928);
    });
    drawText(ctx, '지표는 참고 자료이며 안전을 보장하지 않습니다.', 76, 1580, 31, 'Medium');
  } else if (sceneIndex === 4) {
    drawText(ctx, '오늘의 행동 한 가지', 76, 405, 53, 'Bold', CFG.COLORS.orange);
    drawBlock(ctx, e.action, 72, 590, { size: 82, minSize: 44, maxLines: 7 });
    line(ctx, 76, 1390, 928);
    drawText(ctx, '원문 → 날짜 → 적용 대상', 76, 1496, 47, 'Bold');
    drawText(ctx, '확인하기 전에는 행동을 서두르지 마세요.', 76, 1570, 35, 'Medium', CFG.COLORS.muted);
  } else {
    drawBlock(ctx, e.sourceCta, 72, 440, { size: 90, minSize: 42, maxLines: 6 });
    line(ctx, 76, 1120, 928);
    drawText(ctx, e.sourceLabel, 76, 1200, 34, 'Bold');
    drawText(ctx, 'Telegram', 76, 1370, 38, 'Bold', CFG.COLORS.orange);
    drawText(ctx, '@coineasy_official', 76, 1440, 48, 'Bold');
    drawMascot(ctx, payload.assets, 735, 1270, 260);
    drawText(ctx, '교육용 · 투자·법률·세무 자문 아님', 76, 1600, 30, 'Medium', CFG.COLORS.muted);
  }
}

function renderFrame(payload, seconds) {
  ensureFonts();
  const canvas = createCanvas(CFG.VIDEO_WIDTH, CFG.VIDEO_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = CFG.COLORS.bg; ctx.fillRect(0, 0, 1080, 1920);
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1680);
  gradient.addColorStop(0, '#FFEDF2'); gradient.addColorStop(1, '#FFF2E9');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1690);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(payload.assets.wordmark, 72, 80, 330, 330 * payload.assets.wordmark.height / payload.assets.wordmark.width);
  drawText(ctx, String(payload.editorialDate).replaceAll('-', '.'), 812, 119, 30, 'Medium', CFG.COLORS.muted);
  line(ctx, 72, 177, 936);
  const sceneIndex = sceneForTime(seconds);
  const sceneSeconds = seconds - SCENE_STARTS[sceneIndex];
  drawText(ctx, `${String(sceneIndex + 1).padStart(2, '0')}  /  ${LABELS[sceneIndex]}`, 72, 240, 30, 'Bold', CFG.COLORS.orange);
  if (payload.privatePreview) drawText(ctx, '검토용 미리보기', 750, 240, 27, 'Medium', CFG.COLORS.muted);
  const fade = Math.min(1, Math.max(0, sceneSeconds / 0.3));
  ctx.save(); ctx.globalAlpha = fade; ctx.translate(0, (1 - fade) * 24);
  drawScene(ctx, payload, sceneIndex); ctx.restore();
  line(ctx, 0, 1690, 1080, CFG.COLORS.orange, 8);
  drawText(ctx, 'COINEASY  /  DAILY INSIGHT', 72, 1775, 28, 'Bold', CFG.COLORS.muted);
  drawText(ctx, payload.privatePreview ? '비공개 렌더 검증용 · 가상 지표 · 공개 게시 금지' : '공식 출처·기준일은 설명란에서 확인하세요.', 72, 1835, 27, 'Medium', CFG.COLORS.muted);
  for (let index = 0; index < 6; index += 1) {
    line(ctx, 72 + index * 158, 1877, 138, '#E6D7CE', 6);
    if (index < sceneIndex) line(ctx, 72 + index * 158, 1877, 138, CFG.COLORS.orange, 6);
    else if (index === sceneIndex) line(ctx, 72 + index * 158, 1877, 138 * Math.min(1, sceneSeconds / SCENE_DURATIONS[index]), CFG.COLORS.orange, 6);
  }
  return canvas;
}

function run(executable, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { proc.kill('SIGTERM'); reject(new Error(`${path.basename(executable)} timeout`)); }, timeout);
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8000); });
    proc.on('error', (error) => { clearTimeout(timer); reject(error); });
    proc.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${path.basename(executable)} exited ${code}: ${stderr}`)); });
  });
}

function probeDuration(file, ffmpegPath = 'ffmpeg') {
  let metadata = '';
  try { execFileSync(ffmpegPath, ['-hide_banner', '-i', file], { stdio: 'pipe', timeout: 15000 }); }
  catch (error) { metadata = String(error.stderr || ''); }
  const match = metadata.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  if (!match) throw new Error(`미디어 길이를 검증할 수 없습니다: ${path.basename(file)}`);
  return { duration: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]), metadata };
}

async function probeAudioDuration(audioPath, ffmpegPath = 'ffmpeg') {
  return assertTtsDuration(probeDuration(audioPath, ffmpegPath).duration);
}

async function generateTTS(payload, workDir, { ttsExecutable = 'edge-tts', ffmpegPath = 'ffmpeg' }) {
  const segments = buildNarrationSegments(payload);
  const audioFiles = []; const durations = [];
  for (let index = 0; index < 5; index += 1) {
    const audioPath = path.join(workDir, `speech-${index + 1}.mp3`);
    await run(ttsExecutable, ['--voice', CFG.TTS_VOICE, '--rate', CFG.TTS_RATE, '--volume', CFG.TTS_VOLUME, '--text', segments[index], '--write-media', audioPath]);
    audioFiles.push(audioPath); durations.push(await probeAudioDuration(audioPath, ffmpegPath));
  }
  const speech = assertSceneTtsDurations(durations);
  const audioPath = path.join(workDir, 'narration-timed.wav');
  const args = ['-y', '-hide_banner'];
  audioFiles.forEach((file) => args.push('-i', file));
  args.push('-filter_complex', speech.map((_, index) => `[${index}:a]aresample=48000,apad,atrim=duration=${SCENE_DURATIONS[index]},asetpts=PTS-STARTPTS[a${index}]`).join(';') + ';[a0][a1][a2][a3][a4]concat=n=5:v=0:a=1[a]', '-map', '[a]', '-c:a', 'pcm_s16le', audioPath);
  await run(ffmpegPath, args);
  return { audioPath, speech };
}

async function composeVideo(payload, audioPath, workDir, ffmpegPath) {
  const outputPath = path.join(workDir, 'coineasy-editorial.mp4');
  const proc = spawn(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(CFG.FRAME_RATE), '-i', 'pipe:0', '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-t', String(CFG.DURATION_SECONDS), '-c:v', CFG.VIDEO_CODEC, '-preset', CFG.PRESET, '-crf', String(CFG.CRF), '-pix_fmt', CFG.PIXEL_FORMAT, '-c:a', CFG.AUDIO_CODEC, '-b:a', CFG.AUDIO_BITRATE, '-af', 'apad', '-movflags', '+faststart', outputPath], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = ''; let processError;
  proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8000); });
  const timer = setTimeout(() => { proc.kill('SIGTERM'); }, 180000);
  const finished = new Promise((resolve, reject) => {
    proc.on('error', (error) => { processError = error; reject(error); });
    proc.on('close', (code) => code === 0 ? resolve() : reject(processError || new Error(`ffmpeg exited ${code}: ${stderr}`)));
  });
  // Attach immediately so an early ffmpeg failure never becomes an unhandled rejection.
  finished.catch(() => {});
  proc.stdin.on('error', (error) => { processError = error; });
  try {
    for (let index = 0; index < CFG.DURATION_SECONDS * CFG.FRAME_RATE; index += 1) {
      if (processError || proc.exitCode !== null) throw processError || new Error('ffmpeg closed before all frames');
      const png = await renderFrame(payload, index / CFG.FRAME_RATE).encode('png');
      if (!proc.stdin.write(png)) await once(proc.stdin, 'drain');
    }
    proc.stdin.end(); await finished;
  } catch (error) { proc.kill('SIGTERM'); await finished.catch(() => {}); throw error; }
  finally { clearTimeout(timer); }
  const probed = probeDuration(outputPath, ffmpegPath);
  if (Math.abs(probed.duration - CFG.DURATION_SECONDS) > 0.05 || !/1080x1920/.test(probed.metadata)) {
    throw new Error('최종 영상의 1080×1920 / 32초 계약이 일치하지 않습니다.');
  }
  await run(ffmpegPath, ['-v', 'error', '-xerror', '-err_detect', 'explode', '-i', outputPath, '-f', 'null', '-'], 60000);
  return outputPath;
}

async function generateEditorialShort(payload, options = {}) {
  if (payload?.publishable === false && options.privatePreview !== true) {
    throw new Error('비공개 검토용 입력은 명시적인 privatePreview 렌더만 허용됩니다.');
  }
  if (!payload?.editorial) throw new Error('기사형 쇼츠 editorial 데이터가 없습니다.');
  if (payload?.youtube?.duration_seconds !== CFG.DURATION_SECONDS) throw new Error(`승인된 영상 길이가 ${CFG.DURATION_SECONDS}초와 다릅니다.`);
  buildNarrationSegments(payload);
  const outputDir = options.outputDir || CFG.OUTPUT_DIR;
  const ffmpegPath = options.ffmpegPath || 'ffmpeg';
  fs.mkdirSync(outputDir, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(outputDir, 'editorial-'));
  fs.writeFileSync(path.join(workDir, '.coineasy-editorial-temp.json'), JSON.stringify({
    schema_version: 1, owner: 'coineasy-editorial-renderer',
  }) + '\n');
  try {
    const renderPayload = { ...payload, assets: await loadBrandAssets(), privatePreview: options.privatePreview === true };
    // Check all six layouts before making TTS requests.
    for (let index = 0; index < 6; index += 1) {
      fs.writeFileSync(path.join(workDir, `scene-${index + 1}.png`), await renderFrame(renderPayload, SCENE_STARTS[index] + 1).encode('png'));
    }
    const { audioPath, speech } = await generateTTS(renderPayload, workDir, { ...options, ffmpegPath });
    const outputPath = await composeVideo(renderPayload, audioPath, workDir, ffmpegPath);
    fs.writeFileSync(path.join(workDir, 'render-manifest.json'), JSON.stringify({
      kind: options.privatePreview ? 'private_renderer_smoke_only' : 'article_render',
      publication_receipt: false, publishable: options.privatePreview ? false : undefined,
      video_path: outputPath, video_sha256: createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex'),
      dimensions: [1080, 1920], duration_seconds: 32, fps: CFG.FRAME_RATE,
      scene_durations_seconds: SCENE_DURATIONS, speech,
      last_spoken_second: SCENE_STARTS[4] + speech[4].duration_seconds,
      silent_cta_seconds: 4, font: 'Pretendard 1.3.9',
      logo_figma_node: '28747:92', easyboy_figma_node: '30401:1957',
      source_urls: payload.editorial.sourceUrls,
    }, null, 2) + '\n');
    return outputPath;
  } catch (error) {
    fs.rmSync(workDir, { recursive: true, force: true }); throw error;
  }
}

export { generateEditorialShort, probeAudioDuration, renderFrame, loadBrandAssets, fitText, wrapText, metricTimestamp };
