// src/brand-card.js
// ==================
// CoinEasy 브랜드 v2 카드 렌더러
// 벤더링된 coineasy_brand/templates/korea_card.html.j2 (card_type='digest')를
// nunjucks로 렌더 → headless chromium(puppeteer-core)으로 PNG 캡처.
// 기존 figma-banner/canvas-banner 렌더러는 무수정 보존 — 이 모듈 실패 시 호출부가 폴백.

import { existsSync } from 'fs';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import nunjucks from 'nunjucks';
import { generateDailyQuote } from './figma-daily/generateQuote.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 경로 해석 ─────────────────────────────────────────
// 프로덕션(/app)에서는 Dockerfile이 coineasy_brand를 /app/coineasy_brand로 복사.
// 개발 환경에서는 레포 루트의 coineasy_brand를 상대 경로로 탐색.
export function resolveBrandDir() {
  const candidates = [
    process.env.COINEASY_BRAND_DIR,
    path.resolve(__dirname, '../coineasy_brand'),
    path.resolve(__dirname, '../../../coineasy_brand'),
    '/app/coineasy_brand',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(path.join(c, 'templates', 'korea_card.html.j2'))) return c;
  }
  return null;
}

// 시스템 chromium 경로 (로컬 개발 폴백). 프로덕션은 아래 @sparticuz/chromium 사용.
function resolveChromium() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/pw-browsers/chromium',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// 시스템 chromium 폴백용 인자 세트 (로컬 개발). 프로덕션은 sparticuz.args를 사용.
const LOCAL_CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
];

// launch 설정 해석. 우선순위:
//  1) COINEASY_CHROMIUM_PATH (명시적 오버라이드, 로컬/수동)
//  2) @sparticuz/chromium (제약 컨테이너용 번들 바이너리 + 튜닝된 인자 — 프로덕션)
//  3) 시스템 chromium (로컬 개발)
async function resolveLaunch() {
  const override = process.env.COINEASY_CHROMIUM_PATH;
  if (override && existsSync(override)) {
    return { executablePath: override, args: LOCAL_CHROMIUM_ARGS, headless: true, source: `override:${override}` };
  }
  try {
    const { default: sparticuz } = await import('@sparticuz/chromium');
    const exePath = await sparticuz.executablePath();
    if (exePath && existsSync(exePath)) {
      return {
        executablePath: exePath,
        args: sparticuz.args,
        headless: sparticuz.headless ?? 'shell',
        source: 'sparticuz',
      };
    }
  } catch (e) {
    console.warn(`[brand-card] @sparticuz/chromium 사용 불가, 시스템 chromium 폴백: ${e.message}`);
  }
  const sys = resolveChromium();
  if (sys) return { executablePath: sys, args: LOCAL_CHROMIUM_ARGS, headless: true, source: `system:${sys}` };
  return null;
}

// ─── 포맷 헬퍼 ─────────────────────────────────────────
function fmtPrice(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '$--';
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function fmtPct(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '+0.00%';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function pctState(v) {
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

// F&G 게이지 바늘 좌표 (R2C.md 계약: ang=radians(180-value*1.8))
export function fngNeedle(value) {
  const v = Math.max(0, Math.min(100, parseFloat(value) || 0));
  const ang = (Math.PI / 180) * (180 - v * 1.8);
  return {
    x2: +(75 + 50 * Math.cos(ang)).toFixed(1),
    y2: +(80 - 50 * Math.sin(ang)).toFixed(1),
  };
}

const FNG_LABEL_KO = {
  'extreme fear': '극단적 공포',
  'fear': '공포',
  'neutral': '중립',
  'greed': '탐욕',
  'extreme greed': '극단적 탐욕',
};

function fngLabelKo(label) {
  return FNG_LABEL_KO[String(label || '').toLowerCase()] || label || '--';
}

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

export function digestDateLabel(lang, session) {
  const kst = kstNow();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  const w = kst.getUTCDay();
  const isMorning = session?.type !== 'evening';
  if (lang === 'en') {
    return `${MONTH_EN[m]} ${d} (${WEEKDAY_EN[w]}) ${isMorning ? 'AM' : 'PM'}`;
  }
  return `${m + 1}월 ${d}일 (${WEEKDAY_KO[w]}) ${isMorning ? '아침' : '저녁'}`;
}

function findCoin(data, symbol) {
  if (!data?.market || !Array.isArray(data.market)) return null;
  return data.market.find(c => c.symbol === symbol) || null;
}

function getDefiItems(data) {
  const defi = data?.defi || {};
  const items = [defi.topByTVL?.[0], defi.topGainers?.[0], defi.topLosers?.[0]].filter(Boolean);
  return items.slice(0, 3);
}

// 데이터 기반 인용구/인사이트 폴백 (LLM 불가/EN 카드용 — LLM 로직 무수정 원칙)
export function buildDataInsight(data, lang) {
  const fg = parseInt(data?.fearGreed?.value ?? 50, 10);
  const btc = findCoin(data, 'BTC');
  const chg = parseFloat(btc?.change24h ?? 0);
  if (lang === 'en') {
    if (fg < 45 && chg > 0) return { text: 'Price climbing while the crowd stays fearful. Extremes rarely last.', author: 'CoinEasy' };
    if (fg > 55 && chg < 0) return { text: 'Greed on the dial, red on the tape. Time to check risk, not chase.', author: 'CoinEasy' };
    return { text: 'Signals over noise. Let the data set the tone for the day.', author: 'CoinEasy' };
  }
  if (fg < 45 && chg > 0) return { text: '공포 구간에서 오르는 시장, 군중과 반대편을 살펴볼 때', author: '코인이지' };
  if (fg > 55 && chg < 0) return { text: '탐욕 구간의 조정은 리스크 점검 신호', author: '코인이지' };
  return { text: '시장은 공포 속에서 기회를 만든다', author: '코인이지' };
}

// ─── digest 컨텍스트 빌더 ──────────────────────────────
export function buildDigestCtx(data, session, lang, quote) {
  const kr = lang !== 'en';
  const btc = findCoin(data, 'BTC');
  const kimchi = data?.kimchi;
  const fg = data?.fearGreed;
  const premium = parseFloat(kimchi?.premium ?? 0);
  const needle = fngNeedle(fg?.value ?? 50);

  const altStats = ['ETH', 'SOL', 'SUI', 'XRP'].map(sym => {
    const c = findCoin(data, sym);
    return {
      label: sym,
      value: c ? fmtPrice(c.price) : '$--',
      delta: c ? fmtPct(c.change24h) : '',
      state: c ? pctState(c.change24h) : 'flat',
    };
  });

  const defiRows = getDefiItems(data).map(p => ({
    name: p.name || '--',
    sub: p.tvl ? `TVL ${p.tvl}` : '',
    chg: fmtPct(p.change1d),
    state: pctState(p.change1d),
  }));
  while (defiRows.length < 3) defiRows.push({ name: '--', sub: '', chg: '', state: 'flat' });

  const trendRows = (data?.trending || []).slice(0, 3).map(t => ({
    name: t.symbol || '--',
    sub: t.name || '',
    chg: fmtPct(t.priceChange24h),
    state: pctState(t.priceChange24h),
  }));
  while (trendRows.length < 3) trendRows.push({ name: '--', sub: '', chg: '', state: 'flat' });

  let kimchiTag;
  if (premium > 0.5) kimchiTag = kr ? '김프' : 'PREMIUM';
  else if (premium < -0.5) kimchiTag = kr ? '역프' : 'DISCOUNT';
  else kimchiTag = kr ? '중립' : 'NEUTRAL';

  const sessionWord = session?.type === 'evening'
    ? (kr ? '저녁' : 'EVENING')
    : (kr ? '아침' : 'MORNING');

  const q = quote || buildDataInsight(data, lang);

  return {
    card_type: 'digest',
    card_w: 1200,
    card_h: 1500,
    badge_flag: false,
    watermark: '₿',
    series: kr ? '데일리 브리핑' : 'DAILY BRIEFING',
    date_label: digestDateLabel(lang, session),
    kicker: kr ? `코인이지 데일리 · ${sessionWord} 브리핑` : `COINEASY DAILY · ${sessionWord} BRIEF`,
    hero_value: btc ? fmtPrice(btc.price) : '$--',
    hero_tag: btc ? fmtPct(btc.change24h) : '+0.00%',
    hero_state: btc ? pctState(btc.change24h) : 'flat',
    hero_sub: kr ? '비트코인 BTC · 24시간 변동' : 'Bitcoin BTC · 24h change',
    stats: altStats,
    kimchi_label: kr ? '김치 프리미엄' : 'KIMCHI PREMIUM',
    kimchi_value: fmtPct(premium),
    kimchi_tag: kimchiTag,
    kimchi_sub: kimchi?.krwRate
      ? (kr ? `환율 ₩${kimchi.krwRate}/USDT` : `FX ₩${kimchi.krwRate}/USDT`)
      : '',
    fng_title: kr ? '공포탐욕 지수' : 'FEAR & GREED',
    fng_value: String(fg?.value ?? '--'),
    fng_label: kr ? fngLabelKo(fg?.label) : (fg?.label || '--'),
    fng_x2: needle.x2,
    fng_y2: needle.y2,
    defi_label: kr ? '디파이 TVL 핫이슈' : 'DEFI TVL MOVERS',
    defi_rows: defiRows,
    trend_label: kr ? '트렌딩 TOP 3' : 'TRENDING TOP 3',
    trend_rows: trendRows,
    quote_label: kr ? '오늘의 인용구' : 'COINEASY INSIGHT',
    quote_text: q.text,
    quote_author: q.author,
  };
}

// ─── 템플릿 렌더 → PNG ────────────────────────────────
export async function renderKoreaCard(ctx) {
  const brandDir = resolveBrandDir();
  if (!brandDir) throw new Error('coineasy_brand 디렉토리를 찾을 수 없음 (COINEASY_BRAND_DIR 확인)');

  const launchCfg = await resolveLaunch();
  if (!launchCfg) throw new Error('chromium 실행 파일을 찾을 수 없음 (@sparticuz/chromium 또는 COINEASY_CHROMIUM_PATH 확인)');

  const tplPath = path.join(brandDir, 'templates', 'korea_card.html.j2');
  const tpl = await readFile(tplPath, 'utf8');
  const env = new nunjucks.Environment(null, { autoescape: true });
  const html = env.renderString(tpl, {
    assets: pathToFileURL(path.join(brandDir, 'assets')).href,
    ...ctx,
  });

  // file:// 서브리소스(폰트/이미지) 로딩을 위해 임시 파일로 저장 후 goto
  const tmpDir = await (async () => {
    const d = path.join(os.tmpdir(), `coineasy-card-${process.pid}-${Date.now()}`);
    await mkdir(d, { recursive: true });
    return d;
  })();
  const tmpHtml = path.join(tmpDir, 'card.html');
  await writeFile(tmpHtml, html, 'utf8');

  const { default: puppeteer } = await import('puppeteer-core');
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: launchCfg.executablePath,
      headless: launchCfg.headless,
      dumpio: true, // chromium stderr를 서비스 로그로 직행 (침묵 크래시 진단)
      args: launchCfg.args,
    });
  } catch (err) {
    console.error(`[brand-card] chromium 기동 실패 (source=${launchCfg.source}, executablePath=${launchCfg.executablePath}): ${err.message}`);
    console.error(err.stack);
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: ctx.card_w || 1600,
      height: ctx.card_h || 900,
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluateHandle('document.fonts.ready');
    const buf = await page.screenshot({ type: 'png' });
    return Buffer.from(buf);
  } finally {
    await browser.close().catch(() => {});
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── 다이제스트 카드 (KR/EN) ──────────────────────────
// KR 카드는 기존 generateDailyQuote(LLM, 무수정 재사용)를 시도하고 실패 시 데이터 기반 폴백.
// EN 카드는 데이터 기반 인사이트만 사용 (LLM 로직 추가 없음).
export async function renderDigestCard(data, session, lang = 'kr') {
  if (!session) {
    const kstHour = (new Date().getUTCHours() + 9) % 24;
    session = kstHour < 12 ? { type: 'morning' } : { type: 'evening' };
  }
  let quote = null;
  if (lang !== 'en') {
    try {
      const btc = findCoin(data, 'BTC');
      quote = await generateDailyQuote({
        btcPrice: btc?.price ?? '--',
        btcChange24h: btc?.change24h ?? '0',
        fearGreedValue: data?.fearGreed?.value ?? '--',
        fearGreedLabel: data?.fearGreed?.label ?? '--',
        kimchiPremium: data?.kimchi?.premium ?? '0',
      });
    } catch (e) {
      console.warn(`  ⚠️ 인용구 생성 실패 (데이터 폴백 사용): ${e.message}`);
    }
  }
  const ctx = buildDigestCtx(data, session, lang, quote);
  return renderKoreaCard(ctx);
}
