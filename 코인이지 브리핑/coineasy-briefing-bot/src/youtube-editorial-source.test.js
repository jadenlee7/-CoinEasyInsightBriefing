import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditorialBrief, kstDate, trimAtWord } from './youtube-editorial-source.js';

test('kstDate uses Korea time across UTC midnight', () => {
  assert.equal(kstDate(new Date('2026-08-04T16:30:00Z')), '2026-08-05');
});

test('buildEditorialBrief keeps one claim, evidence, action and source', () => {
  const editorial = buildEditorialBrief({
    headline: '원화 스테이블코인 논의가 구체화됩니다',
    items: [{
      title: '금융위가 원화 스테이블코인 제도 방향을 공개',
      bullets: ['발행자 요건과 이용자 보호 책임이 핵심으로 제시됐습니다', '시행 전까지 세부 기준은 바뀌 수 있습니다'],
      source_link: 'https://www.fsc.go.kr/example',
    }],
    watch: ['실제 법안 문구와 시행일을 확인하세요'],
    verdict: '제도화는 확실해졌지만 세부 요건은 아직 확정이 아닙니다',
  });
  assert.equal(editorial.sourceLabel, 'fsc.go.kr');
  assert.match(editorial.action, /법안/);
  assert.ok(editorial.headline.length <= 34);
  assert.ok(editorial.fact.length <= 54);
});

test('trimAtWord caps copy without leaving trailing punctuation', () => {
  const text = trimAtWord('한국 사용자가 오늘 반드시 확인해야 할 아주 긴 설명 문장입니다', 22);
  assert.ok(text.length <= 22);
  assert.ok(text.endsWith('…'));
});
