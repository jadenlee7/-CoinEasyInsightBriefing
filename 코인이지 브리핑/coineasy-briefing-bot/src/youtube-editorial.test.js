import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildNarration, sceneForTime, voiceCut } from './youtube-editorial-copy.js';
import { buildVideoMetadata } from './youtube-uploader-new.js';

const payload = {
  editorial: {
    headline: '원화 스테이블코인 제도화',
    factTitle: '금융위가 제도 방향을 공개',
    fact: '발행자 요건과 이용자 보호가 핵심입니다',
    verdict: '방향은 나왔지만 세부 조건은 미확정입니다',
    action: '원문과 시행일을 확인하세요',
    sourceLabel: 'fsc.go.kr',
    sourceUrl: 'https://fsc.go.kr/example',
  },
  texts: {
    btc_price: '$63,500', btc_change: '+0.2%',
    fear_value: '28', fear_label: 'Fear', kimchi_premium: '-0.3%',
  },
};

test('scene timeline covers six editorial beats', () => {
  assert.deepEqual([0, 4, 10, 16, 22, 28].map(sceneForTime), [0, 1, 2, 3, 4, 5]);
});

test('editorial header uses the official transparent Main Orange wordmark', async () => {
  const generator = await readFile(
    new URL('./youtube-editorial-generator.js', import.meta.url),
    'utf8',
  );
  const logo = await readFile(
    new URL('../../../coineasy_brand/assets/brand/logo_main_orange_transparent.png', import.meta.url),
  );

  assert.match(generator, /loadImage\(path\.join\(BRAND_ASSET_DIR, 'logo_main_orange_transparent\.png'\)\)/);
  assert.doesNotMatch(generator, /loadImage\(path\.join\(BRAND_ASSET_DIR, 'logo_ink\.png'\)\)/);
  assert.equal(
    createHash('sha256').update(logo).digest('hex'),
    '23e9d2f922660d1c7309791e0eefabd5d78a74ccabe50435c9b9e3d63cfd8aed',
  );
});

test('narration includes evidence, action and source', () => {
  const narration = buildNarration(payload);
  assert.match(narration, /발행자 요건/);
  assert.match(narration, /시행일/);
  assert.match(narration, /fsc\.go\.kr/);
  assert.ok(narration.length <= 210);
});

test('voiceCut keeps spoken copy inside its beat', () => {
  assert.equal(voiceCut('아주 긴 설명을 내레이션에서는 짧게 정리합니다', 16).length, 16);
});

test('YouTube metadata leads with the topic and includes source', () => {
  const meta = buildVideoMetadata(payload, new Date('2026-08-04T09:05:00Z'));
  assert.match(meta.snippet.title, /^원화 스테이블코인/);
  assert.match(meta.snippet.description, /https:\/\/fsc\.go\.kr\/example/);
  assert.match(meta.snippet.description, /투자·법률·세무 자문이 아닙니다/);
});
