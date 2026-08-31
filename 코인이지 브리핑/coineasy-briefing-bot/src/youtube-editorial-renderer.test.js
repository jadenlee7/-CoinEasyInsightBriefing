import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import {
  buildNarrationSegments, assertSceneTtsDurations, SCENE_DURATIONS, SCENE_STARTS,
} from './youtube-editorial-copy.js';
import {
  fitText, wrapText, loadBrandAssets, renderFrame, metricTimestamp, generateEditorialShort,
} from './youtube-editorial-generator.js';
import { rendererSmokeFixture } from './youtube-editorial-renderer-fixture.js';

test('synthetic private fixtures cannot enter the production render mode', async () => {
  await assert.rejects(() => generateEditorialShort(rendererSmokeFixture()), /privatePreview/);
});

test('five exact approved voice segments and a silent final CTA are mandatory', () => {
  const payload = rendererSmokeFixture();
  assert.equal(buildNarrationSegments(payload).length, 6);
  assert.equal(buildNarrationSegments(payload).at(-1), '');
  assert.deepEqual(SCENE_DURATIONS, [4, 6, 6, 6, 6, 4]);
  assert.deepEqual(SCENE_STARTS, [0, 4, 10, 16, 22, 28]);
  payload.editorial.voiceoverSegmentsKo[5] = '승인되지 않은 CTA';
  assert.throws(() => buildNarrationSegments(payload), /무음/);
  payload.editorial.voiceoverSegmentsKo[5] = '';
  payload.editorial.voiceoverKo += ' 추가 원고';
  assert.throws(() => buildNarrationSegments(payload), /승인된/);
  delete payload.editorial.voiceoverSegmentsKo;
  assert.throws(() => buildNarrationSegments(payload), /6개/);
});

test('voice duration must fit each scene, not only the 30-second total', () => {
  assert.equal(assertSceneTtsDurations([3.75, 5.75, 5.75, 5.75, 5.75]).at(-1).start_seconds, 22);
  assert.throws(() => assertSceneTtsDurations([3.76, 1, 1, 1, 1]), /장면 1/);
  assert.throws(() => assertSceneTtsDurations([1, 5.76, 1, 1, 1]), /장면 2/);
  assert.throws(() => assertSceneTtsDurations([1, 1, 1, 1, 0]), /확인할 수/);
});

test('market timestamps are compact KST labels, never appended to numeric values', () => {
  assert.equal(metricTimestamp('2026-09-01T09:05:00Z'), '09.01 18:05 KST');
  assert.throws(() => metricTimestamp('미확보'), /기준 시각/);
});

test('wrapping retains every approved character and refuses oversized copy', () => {
  const ctx = createCanvas(1080, 1920).getContext('2d');
  ctx.font = '40px sans-serif';
  const source = '원문 출처와 기준 날짜를 먼저 확인하고 위험과 불확실성을 구분하세요.';
  assert.equal(wrapText(ctx, source, 100).join('').replace(/\s/g, ''), source.replace(/\s/g, ''));
  assert.throws(() => fitText(ctx, '확인'.repeat(300), { maxLines: 1 }), /장면을 넘습니다/);
});

test('reviewed official assets are pinned rather than legacy misnamed mascots', async () => {
  for (const [name, digest] of [
    ['figma-main-orange-logo.svg', '69a1aace1a426cfe25398806a41a9e3f600b22f1001b126043255d99f5183394'],
    ['figma-detective-easyboy.png', 'bf562515395086465976c82cb0b2dede9825aedcd71363946d8f82b9cb473f23'],
  ]) {
    const brandDir = process.env.COINEASY_BRAND_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../coineasy_brand');
    const bytes = await readFile(path.join(brandDir, 'assets', 'brand', name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest);
  }
});

test('native renderer draws six full-size private scenes with bundled fonts', async () => {
  const fixture = rendererSmokeFixture();
  fixture.assets = await loadBrandAssets();
  for (const start of SCENE_STARTS) {
    const canvas = renderFrame(fixture, start + 1);
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1920);
    assert.ok((await canvas.encode('png')).length > 20000);
  }
});
