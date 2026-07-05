// 브랜드 v2 카드/캡션 정책 테스트 (node --test)
// 렌더(chromium) 없이 검증 가능한 것만: footer 규약, EN 컴포저 규칙, ctx 매핑, 템플릿 렌더 문자열.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'fs/promises';
import path from 'path';
import nunjucks from 'nunjucks';

// generator.js / generateQuote.js는 모듈 로드 시 Anthropic 클라이언트를 만들므로 더미 키 주입
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-dummy-key';

const { BRIEFING_FOOTER_HTML } = await import('./generator.js');
const { composeEnglishDigest, MAX_LINE_LEN, MAX_TOTAL_LEN } = await import('./social-composer.js');
const { buildDigestCtx, fngNeedle, resolveBrandDir } = await import('./brand-card.js');

const EM_DASH = '—';

const fixture = {
  market: [
    { symbol: 'BTC', name: 'Bitcoin', price: 108423, change24h: '2.14' },
    { symbol: 'ETH', name: 'Ethereum', price: 3412.55, change24h: '1.22' },
    { symbol: 'SOL', name: 'Solana', price: 188.34, change24h: '-0.82' },
    { symbol: 'XRP', name: 'XRP', price: 2.31, change24h: '0.44' },
    { symbol: 'SUI', name: 'Sui', price: 4.02, change24h: '3.61' },
  ],
  fearGreed: { value: '38', label: 'Fear' },
  kimchi: { premium: '-0.82', krwRate: '1,383' },
  trending: [
    { symbol: 'NEX', name: 'Nexpace', priceChange24h: '41.2' },
    { symbol: 'ANSEM', name: 'Ansem Coin', priceChange24h: '-12.4' },
    { symbol: 'PENGU', name: 'Pudgy Penguins', priceChange24h: '8.7' },
  ],
  defi: {
    topByTVL: [{ name: 'Lido', tvl: '$31.2B', change1d: '1.4' }],
    topGainers: [{ name: 'Hyperliquid', tvl: '$3.8B', change1d: '12.9' }],
    topLosers: [{ name: 'Pendle', tvl: '$4.6B', change1d: '-6.2' }],
  },
};
const session = { type: 'morning' };

// ─── TG footer 규약 ───────────────────────────────────
test('TG footer: 해시태그 정확히 3개', () => {
  const hashtags = BRIEFING_FOOTER_HTML.match(/#[^\s#<]+/g) || [];
  assert.equal(hashtags.length, 3);
});

test('TG footer: CTA 하이퍼링크 3종 (공지방/소통방/X)', () => {
  assert.match(BRIEFING_FOOTER_HTML, /<a href="https:\/\/t\.me\/coiniseasy">공지방<\/a>/);
  assert.match(BRIEFING_FOOTER_HTML, /<a href="https:\/\/t\.me\/coineasy_official">소통방<\/a>/);
  assert.match(BRIEFING_FOOTER_HTML, /<a href="https:\/\/x\.com\/coiniseasy">X<\/a>/);
  assert.equal((BRIEFING_FOOTER_HTML.match(/<a href=/g) || []).length, 3);
});

test('TG footer: em dash 및 금지 슬로건 없음', () => {
  assert.ok(!BRIEFING_FOOTER_HTML.includes(EM_DASH));
  assert.ok(!/GTM Agency/i.test(BRIEFING_FOOTER_HTML));
});

// ─── Typefully EN 컴포저 규칙 ─────────────────────────
test('EN 컴포저: 해시태그/링크/팔로우 CTA/em dash 금지', () => {
  const text = composeEnglishDigest(fixture, session);
  assert.ok(!text.includes('#'), 'no hashtags');
  assert.ok(!/https?:\/\//.test(text), 'no links');
  assert.ok(!/t\.me|@\w/.test(text), 'no handles/telegram links');
  assert.ok(!/follow/i.test(text), 'no follow CTA');
  assert.ok(!text.includes(EM_DASH), 'no em dash');
});

test('EN 컴포저: X 네이티브 리듬 (빈 줄 간격, 줄당 60자 이내, 전체 272자 이내)', () => {
  const text = composeEnglishDigest(fixture, session);
  const lines = text.split('\n\n');
  assert.ok(lines.length >= 3);
  for (const line of lines) {
    assert.ok(!line.includes('\n'), `single-thought line: ${line}`);
    assert.ok(line.length <= MAX_LINE_LEN, `line too long (${line.length}): ${line}`);
  }
  assert.ok(text.length <= MAX_TOTAL_LEN, `total too long: ${text.length}`);
});

test('EN 컴포저: 전부 영어 (한글 없음) + 핵심 데이터 포함', () => {
  const text = composeEnglishDigest(fixture, session);
  assert.ok(!/[가-힣]/.test(text), 'no Korean characters');
  assert.match(text, /BTC \$108,423/);
  assert.match(text, /Kimchi premium/);
  assert.match(text, /Fear and Greed at 38/);
});

test('EN 컴포저: 데이터 없어도 안전', () => {
  const text = composeEnglishDigest({}, { type: 'evening' });
  assert.ok(text.length > 0);
  assert.match(text, /Korea evening check/);
});

// ─── digest ctx 매핑 ─────────────────────────────────
test('digest ctx: KR 매핑', () => {
  const ctx = buildDigestCtx(fixture, session, 'kr', { text: '테스트 인용구', author: '코인이지' });
  assert.equal(ctx.card_type, 'digest');
  assert.equal(ctx.card_w, 1200);
  assert.equal(ctx.card_h, 1500);
  assert.equal(ctx.badge_flag, false);
  assert.equal(ctx.series, '데일리 브리핑');
  assert.equal(ctx.hero_value, '$108,423');
  assert.equal(ctx.hero_state, 'up');
  assert.equal(ctx.stats.length, 4);
  assert.equal(ctx.kimchi_tag, '역프');
  assert.equal(ctx.fng_label, '공포');
  assert.equal(ctx.defi_rows.length, 3);
  assert.equal(ctx.trend_rows.length, 3);
});

test('digest ctx: EN 매핑', () => {
  const ctx = buildDigestCtx(fixture, session, 'en', null);
  assert.equal(ctx.series, 'DAILY BRIEFING');
  assert.equal(ctx.kimchi_tag, 'DISCOUNT');
  assert.equal(ctx.fng_label, 'Fear');
  assert.ok(!/[가-힣]/.test(JSON.stringify(ctx)), 'EN ctx has no Korean');
});

test('digest ctx: 빈 데이터 안전 (placeholder)', () => {
  const ctx = buildDigestCtx({}, session, 'kr', null);
  assert.equal(ctx.hero_value, '$--');
  assert.equal(ctx.stats.length, 4);
  assert.equal(ctx.defi_rows.length, 3);
  assert.equal(ctx.trend_rows.length, 3);
});

// ─── F&G 게이지 바늘 좌표 (R2C.md 계약) ──────────────
test('fngNeedle: 0/50/100 좌표', () => {
  assert.deepEqual(fngNeedle(0), { x2: 25, y2: 80 });
  assert.deepEqual(fngNeedle(50), { x2: 75, y2: 30 });
  assert.deepEqual(fngNeedle(100), { x2: 125, y2: 80 });
});

// ─── 템플릿: digest 브랜치 렌더 + 기존 브랜치 하위호환 ─
test('템플릿: digest 브랜치 렌더 결과 규약 준수', async () => {
  const brandDir = resolveBrandDir();
  assert.ok(brandDir, 'coineasy_brand 디렉토리 존재');
  const tpl = await readFile(path.join(brandDir, 'templates', 'korea_card.html.j2'), 'utf8');
  const env = new nunjucks.Environment(null, { autoescape: true });
  const ctx = buildDigestCtx(fixture, session, 'kr', { text: '테스트 인용구', author: '코인이지' });
  const html = env.renderString(tpl, { assets: 'file:///assets', ...ctx });
  assert.match(html, /easyboy_bull\.png/);
  assert.match(html, /easyboy_bear\.png/);
  assert.match(html, /\$108,423/);
  assert.match(html, /@Coiniseasy/);
  assert.match(html, /#FFF8F0/);
  assert.match(html, /GmarketSansTTFBold\.ttf/);
  assert.ok(!/GTM Agency/i.test(html), 'no banned slogan');
  assert.ok(!html.includes('flag_kr.png'), 'badge_flag=false: no flag');
});

test('템플릿: 기존 kimchi 브랜치 하위호환 (무수정 확인)', async () => {
  const brandDir = resolveBrandDir();
  const tpl = await readFile(path.join(brandDir, 'templates', 'korea_card.html.j2'), 'utf8');
  const env = new nunjucks.Environment(null, { autoescape: true });
  const html = env.renderString(tpl, {
    assets: 'file:///assets',
    card_type: 'kimchi',
    series: 'KOREA INSIGHTS',
    date_label: 'Jul 5, 2026',
    kicker: 'KIMCHI CHECK · BTC',
    hero_value: '-0.8',
    hero_unit: '%',
    hero_state: 'down',
    hero_tag: 'DISCOUNT',
    insight: 'test insight',
    stats: [{ label: 'UPBIT BTC/KRW', value: '₩150M' }],
    mascot: 'easyboy_plain',
    mascot_tag: 'KIMCHI CHECK',
  });
  assert.match(html, /KOREA INSIGHTS/);
  assert.match(html, /flag_kr\.png/);          // badge_flag 기본값 true 유지
  assert.match(html, /easyboy_plain\.png/);    // mascot 렌더 유지
  assert.match(html, /KIMCHI CHECK · BTC/);
});
