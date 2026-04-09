/**
 * canvas-banner.js
 * ================
 * Pure node-canvas 기반 배너 렌더러 — Figma API 없이 동작하는 fallback.
 * CoinEasy GTM NEW files/bannerRenderer.js에서 포팅.
 *
 * 사용:
 *   import { renderCanvasBanner } from './canvas-banner.js';
 *   const buf = await renderCanvasBanner(data);
 */

import { createCanvas, loadImage, registerFont } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Design tokens ─────────────────────────────────────
const W = 1080;
const H = 1380;

const COLORS = {
  bg: '#3f2912',
  bgDark: '#2a1a0a',
  bullGreen: '#00b009',
  bearRed: '#ff1f1f',
  white: '#ffffff',
  black: '#000000',
  cream: '#fff8e7',
  yellow: '#ffd600',
  orange: '#ff6d00',
  orangeLight: '#ffb74d',
  purple: '#7c4dff',
  gray: '#666666',
  grayLight: '#e0e0e0',
  brown: '#3f2912',
};

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const FONT_FAMILY = 'Noto Sans CJK KR';

// ─── Font registration ─────────────────────────────────
let _fontsRegistered = false;
function ensureFontsRegistered() {
  if (_fontsRegistered) return;
  const fontPaths = [
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ];
  const styles = ['Black', 'Bold', 'Medium', 'Regular'];
  for (let i = 0; i < fontPaths.length; i++) {
    try { registerFont(fontPaths[i], { family: FONT_FAMILY, weight: styles[i] }); }
    catch (_) { /* font path missing — non-fatal */ }
  }
  _fontsRegistered = true;
}

// ─── Helpers ────────────────────────────────────────────
function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px "${FONT_FAMILY}"`;
}

function fillText(ctx, text, x, y, color, weight, size, align = 'left') {
  setFont(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

function measureText(ctx, text, weight, size) {
  setFont(ctx, weight, size);
  return ctx.measureText(text).width;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke, strokeWidth) {
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
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth || 1; ctx.stroke(); }
}

function circle(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function gradientH(ctx, x, y, w, h, c1, c2) {
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

function fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ─── Background texture ────────────────────────────────
function drawTexturedBg(ctx) {
  fillRect(ctx, 0, 0, W, H, COLORS.bg);
  let seed = 42;
  function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  for (let i = 0; i < 3500; i++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * H);
    const shade = Math.floor(rand() * 30) - 15;
    const r = Math.max(0, Math.min(255, 0x3f + shade));
    const g = Math.max(0, Math.min(255, 0x29 + shade));
    const b = Math.max(0, Math.min(255, 0x12 + shade));
    ctx.fillStyle = `rgba(${r},${g},${b},0.6)`;
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawMountains(ctx) {
  ctx.fillStyle = 'rgb(45,28,12)';
  ctx.beginPath();
  ctx.moveTo(0, 1160);
  [[140,1070],[300,1130],[480,1000],[640,1080],[820,1010],[980,1090],[1080,1040]].forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(1080, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

  ctx.fillStyle = 'rgb(55,65,28)';
  ctx.beginPath();
  ctx.moveTo(0, 1240);
  [[200,1160],[380,1220],[540,1140]].forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(540, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

  ctx.fillStyle = 'rgb(75,35,25)';
  ctx.beginPath();
  ctx.moveTo(540, 1140);
  [[720,1200],[900,1150],[1080,1210]].forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(1080, H); ctx.lineTo(540, H); ctx.closePath(); ctx.fill();
}

// ─── Data → Payload adapter ────────────────────────────
function fmtPrice(p) {
  if (p == null) return '$--';
  if (p >= 1000) return `$${Math.round(p).toLocaleString('en-US')}`;
  if (p >= 10) return `$${p.toFixed(1)}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(3)}`;
}

function fmtPct(v) {
  const n = parseFloat(v || 0);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function getTimeLabel() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const h = kst.getUTCHours();
  if (h >= 5 && h < 12) return '오전';
  if (h >= 12 && h < 17) return '오후';
  if (h >= 17 && h < 21) return '저녁';
  return '저녁 이후';
}

function fmtDateKr() {
  const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const day = WEEKDAY_KO[kst.getUTCDay()];
  return `${m}월 ${d}일 ${day}요일 ${getTimeLabel()}`;
}

function findCoin(data, symbol) {
  if (!data?.market || !Array.isArray(data.market)) return null;
  return data.market.find(c => c.symbol === symbol) || null;
}

function buildPayloadFromData(data) {
  const btc = findCoin(data, 'BTC');
  const eth = findCoin(data, 'ETH');
  const sol = findCoin(data, 'SOL');
  const sui = findCoin(data, 'SUI');
  const xrp = findCoin(data, 'XRP');

  const avgChange = data.market
    ? data.market.reduce((s, c) => s + parseFloat(c.change24h || 0), 0) / data.market.length
    : 0;

  const fg = data.fearGreed;
  const kimchi = data.kimchi;
  const trending = data.trending || [];
  const defi = data.defi || {};
  const defiItems = [
    defi.topByTVL?.[0],
    defi.topGainers?.[0],
    defi.topLosers?.[0],
  ].filter(Boolean);
  while (defiItems.length < 3) defiItems.push({ name: '—', tvl: '$0', change1d: '0' });

  const trendItems = trending.slice(0, 3);
  while (trendItems.length < 3) trendItems.push({ symbol: '—', name: '—', priceChange24h: '0' });

  const fearValue = parseInt(fg?.value || 50);
  function fearNote(fgv, mc) {
    if (fgv < 25 && mc > 0) return '두려움인데 가격은 상승? 역설적 신호!';
    if (fgv < 25) return '극단적 공포 — 분할 매수 검토 구간';
    if (fgv > 75 && mc < 0) return '탐욕인데 조정? 과열 경계';
    if (fgv > 75) return '탐욕 구간 — 차익 실현 검토';
    if (fgv < 45) return '여전히 공포 구간이지만 시장은 꿋꿋';
    if (fgv > 55) return '탐욕 우세 — 리스크 관리';
    return '중립 — 추세 확인 필요';
  }

  function kimchiNote(pct) {
    if (Math.abs(pct) < 0.5) return '거의 동조화 — 정상 범위';
    if (pct > 2) return '한국 매수세 강함 — 차익 기회 주의';
    if (pct < -1) return '역김프 — 글로벌 강세 신호';
    return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% — 정상 범위`;
  }

  const premiumPct = parseFloat(kimchi?.premium || 0);

  const texts = {
    date_label: fmtDateKr(),
    btc_price: btc ? fmtPrice(btc.price) : '$--',
    btc_change: btc ? fmtPct(btc.change24h) : '+0.00%',
    market_change: `MARKET ${fmtPct(avgChange)}`,
    eth_price: eth ? fmtPrice(eth.price) : '$--',
    eth_change: eth ? fmtPct(eth.change24h) : '+0.00%',
    sol_price: sol ? fmtPrice(sol.price) : '$--',
    sol_change: sol ? fmtPct(sol.change24h) : '+0.00%',
    sui_price: sui ? fmtPrice(sui.price) : '$--',
    sui_change: sui ? fmtPct(sui.change24h) : '+0.00%',
    xrp_price: xrp ? fmtPrice(xrp.price) : '$--',
    xrp_change: xrp ? fmtPct(xrp.change24h) : '+0.00%',
    kimchi_rate: kimchi ? `환율: ₩${kimchi.krwRate}/USDT` : '환율: --',
    kimchi_premium: kimchi ? `${premiumPct.toFixed(2)}%` : '0.00%',
    kimchi_note: kimchiNote(premiumPct),
    fear_value: String(fg?.value ?? '--'),
    fear_label: fg?.label || '--',
    fear_note: fearNote(fearValue, avgChange),
    defi_1_name: defiItems[0].name,
    defi_1_note: defiItems[0].tvl ? `TVL ${defiItems[0].tvl}` : '',
    defi_1_change: fmtPct(defiItems[0].change1d),
    defi_2_name: defiItems[1].name,
    defi_2_note: defiItems[1].tvl ? `TVL ${defiItems[1].tvl}` : '',
    defi_2_change: fmtPct(defiItems[1].change1d),
    defi_3_name: defiItems[2].name,
    defi_3_note: defiItems[2].tvl ? `TVL ${defiItems[2].tvl}` : '',
    defi_3_change: fmtPct(defiItems[2].change1d),
    trend_1_name: `${trendItems[0].symbol} (${trendItems[0].name})`,
    trend_1_change: fmtPct(trendItems[0].priceChange24h),
    trend_2_name: `${trendItems[1].symbol} (${trendItems[1].name})`,
    trend_2_change: fmtPct(trendItems[1].priceChange24h),
    trend_3_name: `${trendItems[2].symbol} (${trendItems[2].name})`,
    trend_3_change: fmtPct(trendItems[2].priceChange24h),
    quote_line1: '코인이지와 함께 오늘도 이지하게',
    quote_line2: '시장을 읽고, 기회를 잡자',
  };

  const changeKeys = [
    'btc_change', 'eth_change', 'sol_change', 'sui_change', 'xrp_change',
    'defi_1_change', 'defi_2_change', 'defi_3_change',
    'trend_1_change', 'trend_2_change', 'trend_3_change',
  ];
  const colors = {};
  for (const k of changeKeys) {
    const v = parseFloat(texts[k].replace('%', '').replace('+', ''));
    colors[k] = v >= 0 ? '#00b009' : '#ff1f1f';
  }

  return {
    texts,
    gauge: { fill_pct: fearValue / 100 },
    colors,
  };
}

// ─── Main render function ───────────────────────────────
async function renderBanner(payload) {
  ensureFontsRegistered();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 1) Background
  drawTexturedBg(ctx);
  drawMountains(ctx);

  // 2) Top accent line
  gradientH(ctx, 0, 0, W, 6, COLORS.bullGreen, COLORS.yellow);

  // 3) Bull/Bear characters
  try {
    const bull = await loadImage(path.join(ASSETS_DIR, 'bull.png'));
    const bear = await loadImage(path.join(ASSETS_DIR, 'bear.png'));
    ctx.drawImage(bull, 130, 0, 200, 200);
    ctx.drawImage(bear, W - 200 - 130, 0, 200, 200);
  } catch (_) { /* assets missing — skip */ }

  // 4) Header pill badge
  const badgeW = 380, badgeH = 60;
  const bx = (W - badgeW) / 2, by = 70;
  roundRect(ctx, bx, by, badgeW, badgeH, 30, null, COLORS.white, 4);
  setFont(ctx, 'Black', 28);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CoinEasy Daily', W / 2, by + badgeH / 2 + 2);

  // Date label
  ctx.textBaseline = 'top';
  fillText(ctx, payload.texts.date_label, W / 2, by + badgeH + 12, COLORS.cream, 'Medium', 22, 'center');

  // 5) BTC headline card
  const hlY = 230;
  roundRect(ctx, 40, hlY + 8, W - 80, 115, 20, COLORS.bullGreen);
  roundRect(ctx, 40, hlY, W - 80, 115, 20, COLORS.bgDark, COLORS.bullGreen, 3);
  fillText(ctx, 'BTC', 70, hlY + 18, COLORS.cream, 'Medium', 24);
  fillText(ctx, payload.texts.btc_price, 70, hlY + 45, COLORS.white, 'Black', 52);
  const btcChgW = measureText(ctx, payload.texts.btc_change, 'Black', 44);
  fillText(ctx, payload.texts.btc_change, W - 70 - btcChgW, hlY + 45,
    payload.colors.btc_change || COLORS.bullGreen, 'Black', 44);
  const marketW = measureText(ctx, payload.texts.market_change, 'Medium', 18);
  fillText(ctx, payload.texts.market_change, W - 70 - marketW, hlY + 18, COLORS.cream, 'Medium', 18);

  // 6) Alt coin cards
  const altY = 390;
  const cwAlt = 232, chAlt = 115, gap = 16;
  const totalW = 4 * cwAlt + 3 * gap;
  const startX = (W - totalW) / 2;
  const alts = [
    { sym: 'ETH', priceKey: 'eth_price', chgKey: 'eth_change' },
    { sym: 'SOL', priceKey: 'sol_price', chgKey: 'sol_change' },
    { sym: 'SUI', priceKey: 'sui_price', chgKey: 'sui_change' },
    { sym: 'XRP', priceKey: 'xrp_price', chgKey: 'xrp_change' },
  ];
  for (let i = 0; i < alts.length; i++) {
    const cx = startX + i * (cwAlt + gap);
    const a = alts[i];
    const color = payload.colors[a.chgKey] || COLORS.bullGreen;
    roundRect(ctx, cx, altY + 6, cwAlt, chAlt, 16, color);
    roundRect(ctx, cx, altY, cwAlt, chAlt, 16, COLORS.white, color, 3);
    fillText(ctx, a.sym, cx + 18, altY + 12, color, 'Black', 22);
    fillText(ctx, payload.texts[a.priceKey], cx + 18, altY + 40, COLORS.black, 'Black', 28);
    fillText(ctx, payload.texts[a.chgKey], cx + 18, altY + 78, color, 'Bold', 20);
  }

  // 7) Kimchi premium card
  const midY = 540;
  const mcW = 482, mcH = 175;
  roundRect(ctx, 40, midY + 6, mcW, mcH, 18, COLORS.yellow);
  roundRect(ctx, 40, midY, mcW, mcH, 18, COLORS.white, COLORS.yellow, 3);
  circle(ctx, 78, midY + 36, 14, COLORS.orange);
  fillText(ctx, '김치 프리미엄', 104, midY + 18, COLORS.brown, 'Black', 26);
  fillText(ctx, payload.texts.kimchi_rate, 64, midY + 65, COLORS.black, 'Bold', 22);
  fillText(ctx, '프리미엄: ', 64, midY + 100, COLORS.black, 'Medium', 22);
  const pwLen = measureText(ctx, '프리미엄: ', 'Medium', 22);
  const premiumColor = payload.texts.kimchi_premium.startsWith('-') ? COLORS.bearRed : COLORS.bullGreen;
  fillText(ctx, payload.texts.kimchi_premium, 64 + pwLen, midY + 99, premiumColor, 'Black', 24);
  fillText(ctx, payload.texts.kimchi_note, 64, midY + 138, COLORS.gray, 'Medium', 17);

  // 8) Fear & Greed card
  const fx = 40 + mcW + 36;
  roundRect(ctx, fx, midY + 6, mcW, mcH, 18, COLORS.orangeLight);
  roundRect(ctx, fx, midY, mcW, mcH, 18, COLORS.white, COLORS.orangeLight, 3);
  circle(ctx, fx + 38, midY + 36, 14, COLORS.orangeLight);
  fillText(ctx, '공포/탐욕 지수', fx + 64, midY + 18, COLORS.brown, 'Black', 26);

  // Gauge bar
  const gx = fx + 24, gy = midY + 65, gw = mcW - 48;
  roundRect(ctx, gx, gy, gw, 22, 11, COLORS.grayLight);
  const fillW = Math.round(gw * (payload.gauge.fill_pct || 0));
  if (fillW > 0) {
    ctx.save();
    ctx.beginPath();
    const rr = 11;
    ctx.moveTo(gx + rr, gy);
    ctx.lineTo(gx + gw - rr, gy);
    ctx.quadraticCurveTo(gx + gw, gy, gx + gw, gy + rr);
    ctx.lineTo(gx + gw, gy + 22 - rr);
    ctx.quadraticCurveTo(gx + gw, gy + 22, gx + gw - rr, gy + 22);
    ctx.lineTo(gx + rr, gy + 22);
    ctx.quadraticCurveTo(gx, gy + 22, gx, gy + 22 - rr);
    ctx.lineTo(gx, gy + rr);
    ctx.quadraticCurveTo(gx, gy, gx + rr, gy);
    ctx.closePath();
    ctx.clip();
    gradientH(ctx, gx, gy, fillW, 22, COLORS.bearRed, COLORS.yellow);
    ctx.restore();
  }
  fillText(ctx, payload.texts.fear_value, fx + 24, midY + 95, COLORS.orange, 'Black', 38);
  const fvW = measureText(ctx, payload.texts.fear_value, 'Black', 38);
  fillText(ctx, payload.texts.fear_label, fx + 24 + fvW + 12, midY + 108, COLORS.black, 'Bold', 22);
  fillText(ctx, payload.texts.fear_note, fx + 24, midY + 145, COLORS.gray, 'Medium', 16);

  // 9) DeFi hot issues card
  const dy = 745;
  roundRect(ctx, 40, dy + 6, W - 80, 200, 20, COLORS.purple);
  roundRect(ctx, 40, dy, W - 80, 200, 20, COLORS.white, COLORS.purple, 3);
  circle(ctx, 74, dy + 36, 14, COLORS.purple);
  fillText(ctx, 'DeFi 핫이슈', 100, dy + 18, COLORS.brown, 'Black', 28);
  for (let i = 0; i < 3; i++) {
    const iy = dy + 70 + i * 42;
    const chgKey = `defi_${i + 1}_change`;
    const isUp = !payload.texts[chgKey].startsWith('-');
    const color = isUp ? COLORS.bullGreen : COLORS.bearRed;
    circle(ctx, 69, iy + 17, 9, color);
    fillText(ctx, payload.texts[`defi_${i + 1}_name`], 88, iy, COLORS.black, 'Black', 22);
    const nameW = measureText(ctx, payload.texts[`defi_${i + 1}_name`], 'Black', 22);
    if (payload.texts[`defi_${i + 1}_note`]) {
      fillText(ctx, payload.texts[`defi_${i + 1}_note`], 88 + nameW + 12, iy + 4, COLORS.gray, 'Medium', 18);
    }
    const bx2 = W - 200;
    const bgColor = isUp ? '#e8f5e8' : '#ffebed';
    roundRect(ctx, bx2, iy - 2, 130, 32, 14, bgColor, color, 2);
    setFont(ctx, 'Black', 22);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(payload.texts[chgKey], bx2 + 65, iy + 1);
    ctx.textAlign = 'left';
  }

  // 10) Trending TOP 3 card
  const ty = 975;
  roundRect(ctx, 40, ty + 6, W - 80, 220, 20, COLORS.yellow);
  roundRect(ctx, 40, ty, W - 80, 220, 20, COLORS.white, COLORS.yellow, 3);
  circle(ctx, 74, ty + 36, 14, COLORS.yellow);
  fillText(ctx, '트렌딩 TOP 3', 100, ty + 18, COLORS.brown, 'Black', 28);
  const trendColors = [COLORS.bearRed, '#FF9100', '#00BCD4'];
  for (let i = 0; i < 3; i++) {
    const iy = ty + 78 + i * 48;
    const accent = trendColors[i];
    circle(ctx, 78, iy + 18, 18, accent);
    setFont(ctx, 'Black', 24);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), 78, iy + 19);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    fillText(ctx, payload.texts[`trend_${i + 1}_name`], 110, iy + 4, COLORS.black, 'Black', 24);
    const chgKey = `trend_${i + 1}_change`;
    const chgW = measureText(ctx, payload.texts[chgKey], 'Black', 26);
    fillText(ctx, payload.texts[chgKey], W - 80 - chgW, iy + 2, COLORS.bullGreen, 'Black', 26);
  }

  // 11) Quote card
  const qy = 1215;
  roundRect(ctx, 40, qy + 6, W - 80, 95, 18, COLORS.bullGreen);
  roundRect(ctx, 40, qy, W - 80, 95, 18, COLORS.white, COLORS.bullGreen, 3);
  fillText(ctx, '\u201c', 60, qy + 5, COLORS.bullGreen, 'Black', 50);
  fillText(ctx, payload.texts.quote_line1, 105, qy + 15, COLORS.black, 'Bold', 22);
  fillText(ctx, payload.texts.quote_line2, 105, qy + 48, COLORS.gray, 'Medium', 19);
  fillText(ctx, '\u201d', 1010, qy + 45, COLORS.bullGreen, 'Black', 50);

  // 12) Footer
  const fy = 1310;
  try {
    const logo = await loadImage(path.join(ASSETS_DIR, 'coineasy-logo.png'));
    const logoH = 32;
    const logoW = (logo.width / logo.height) * logoH;
    ctx.drawImage(logo, 40, fy + 4, logoW, logoH);
  } catch (_) { /* logo missing */ }
  fillText(ctx, "Korea's #1 Web3 GTM Agency", 40, fy + 36 + 6, COLORS.cream, 'Medium', 14);
  const handle = '@coiniseasy';
  const hw = measureText(ctx, handle, 'Bold', 22);
  fillText(ctx, handle, W - 40 - hw, fy + 2, COLORS.yellow, 'Bold', 22);
  const cta = '코인이지와 함께 이지하게!';
  const ctw = measureText(ctx, cta, 'Medium', 14);
  fillText(ctx, cta, W - 40 - ctw, fy + 34, COLORS.cream, 'Medium', 14);

  // 13) Bottom accent
  gradientH(ctx, 0, H - 6, W, 6, COLORS.bullGreen, COLORS.yellow);

  return canvas.toBuffer('image/png');
}

// ─── Public API ─────────────────────────────────────────
export async function renderCanvasBanner(data) {
  const payload = buildPayloadFromData(data);
  return await renderBanner(payload);
}

export { getTimeLabel, fmtDateKr };
