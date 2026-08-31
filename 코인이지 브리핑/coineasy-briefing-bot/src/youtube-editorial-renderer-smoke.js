// Explicit local-only end-to-end render. Contains no uploader, Redis or credentials.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { generateEditorialShort, loadBrandAssets, renderFrame } from './youtube-editorial-generator.js';
import { SCENE_STARTS } from './youtube-editorial-copy.js';
import { rendererSmokeFixture } from './youtube-editorial-renderer-fixture.js';

const outputDir = process.argv[2];
if (!outputDir) throw new Error('Pass a local output directory for the private smoke render.');
if (process.argv.includes('--storyboard-only')) {
  fs.mkdirSync(outputDir, { recursive: true });
  const fixture = rendererSmokeFixture();
  fixture.assets = await loadBrandAssets();
  const contact = createCanvas(1080, 1280);
  const ctx = contact.getContext('2d');
  for (let index = 0; index < 6; index += 1) {
    const frame = renderFrame(fixture, SCENE_STARTS[index] + 1);
    fs.writeFileSync(path.join(outputDir, `scene-${index + 1}.png`), await frame.encode('png'));
    ctx.drawImage(frame, index % 3 * 360, Math.floor(index / 3) * 640, 360, 640);
  }
  fs.writeFileSync(path.join(outputDir, 'storyboard.png'), await contact.encode('png'));
  console.log(JSON.stringify({ kind: 'private_renderer_storyboard_only', publishable: false, outputDir }));
} else {
  const video = await generateEditorialShort(rendererSmokeFixture(), {
  privatePreview: true,
  outputDir,
  ffmpegPath: process.env.RENDER_SMOKE_FFMPEG || 'ffmpeg',
  ttsExecutable: process.env.RENDER_SMOKE_TTS || 'edge-tts',
  });
  console.log(JSON.stringify({ kind: 'private_renderer_smoke_only', publishable: false, video }));
}
