// figma-daily/bannerRenderer.js
// =============================
// node-canvas로 CoinEasy Daily 배너 PNG를 렌더링한다.
// 디자인은 EASYWORLD frame 28334:14를 1:1로 재현.
//
// 의존성: canvas (node-canvas)
// 에셋: ../assets/bull.png, bear.png, coineasy-logo.png
//
// 사용 예:
//   const buf = await renderBanner(payload);
//   await fs.writeFile('out.png', buf);

const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

// ─── Design tokens (Figma exact) ────────────────────────
const W = 1080;
const H = 1380;

const COLORS = {
  bg: "#3f2912",
  bgDark: "#2a1a0a",
  bullGreen: "#00b009",
  bearRed: "#ff1f1f",
  white: "#ffffff",
  black: "#000000",
  cream: "#fff8e7",
  yellow: "#ffd600",
  orange: "#ff6d00",
  orangeLight: "#ffb74d",
  purple: "#7c4dff",
  gray: "#666666",
  grayLight: "#e0e0e0",
  brown: "#3f2912",
};

const ASSETS_DIR = path.join(__dirname, "..", "assets");
const FONT_FAMILY = "Noto Sans CJK KR";  // Docker에 이미 설치됨 (fonts-noto-cjk)

// ─── Font registration (call once at module load) ──────
let _fontsRegistered = false;
function ensureFontsRegistered() {
  if (_fontsRegistered) return;

  // Docker fonts-noto-cjk 패키지가 깔려있으면 fontconfig가 자동 발견
  // 명시적으로 등록하려면 .ttc/.otf 경로 사용
  const fontPaths = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  ];
  const styles = ["Black", "Bold", "Medium", "Regular"];

  for (let i = 0; i < fontPaths.length; i++) {
    try {
      registerFont(fontPaths[i], { family: FONT_FAMILY, weight: styles[i] });
    } catch (e) {
      // Font already registered or path missing — non-fatal
      console.warn(`[banner] font register skipped: ${fontPaths[i]}`);
    }
  }
  _fontsRegistered = true;
}

// ─── Helpers ────────────────────────────────────────────
function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px "${FONT_FAMILY}"`;
}

function fillText(ctx, text, x, y, color, weight, size, align = "left") {
  setFont(ctx, weight, size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
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
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth || 1;
    ctx.stroke();
  }
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

// ─── Brown noise texture ────────────────────────────────
function drawTexturedBg(ctx) {
  // Base brown
  fillRect(ctx, 0, 0, W, H, COLORS.bg);

  // Noise overlay (deterministic seed for reproducibility)
  let seed = 42;
  function rand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
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

// ─── Mountain silhouettes ───────────────────────────────
function drawMountains(ctx) {
  // Back layer (darkest brown)
  ctx.fillStyle = "rgb(45,28,12)";
  ctx.beginPath();
  ctx.moveTo(0, 1160);
  const back = [[140,1070],[300,1130],[480,1000],[640,1080],[820,1010],[980,1090],[1080,1040]];
  back.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(1080, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // Front-left (greenish)
  ctx.fillStyle = "rgb(55,65,28)";
  ctx.beginPath();
  ctx.moveTo(0, 1240);
  [[200,1160],[380,1220],[540,1140]].forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(540, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // Front-right (reddish)
  ctx.fillStyle = "rgb(75,35,25)";
  ctx.beginPath();
  ctx.moveTo(540, 1140);
  [[720,1200],[900,1150],[1080,1210]].forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.lineTo(1080, H);
  ctx.lineTo(540, H);
  ctx.closePath();
  ctx.fill();
}

// ─── Main render function ───────────────────────────────
async function renderBanner(payload) {
  ensureFontsRegistered();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // 1) Background
  drawTexturedBg(ctx);
  drawMountains(ctx);

  // 2) Top accent line (gradient)
  gradientH(ctx, 0, 0, W, 6, COLORS.bullGreen, COLORS.yellow);

  // 3) Bull/Bear characters (Figma assets)
  const bull = await loadImage(path.join(ASSETS_DIR, "bull.png"));
  const bear = await loadImage(path.join(ASSETS_DIR, "bear.png"));
  const charSize = 200;
  ctx.drawImage(bull, 130, 0, charSize, charSize);
  ctx.drawImage(bear, W - charSize - 130, 0, charSize, charSize);

  // 4) Header pill badge
  const badgeW = 380, badgeH = 60;
  const bx = (W - badgeW) / 2;
  const by = 70;
  roundRect(ctx, bx, by, badgeW, badgeH, 30, null, COLORS.white, 4);
  setFont(ctx, "Black", 28);
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CoinEasy Daily", W / 2, by + badgeH / 2 + 2);

  // Date label below badge
  ctx.textBaseline = "top";
  fillText(ctx, payload.texts.date_label, W / 2, by + badgeH + 12,
    COLORS.cream, "Medium", 22, "center");

  // 5) BTC headline card
  const hlY = 230;
  roundRect(ctx, 40, hlY + 8, W - 80, 115, 20, COLORS.bullGreen);  // shadow
  roundRect(ctx, 40, hlY, W - 80, 115, 20, COLORS.bgDark, COLORS.bullGreen, 3);

  fillText(ctx, "BTC", 70, hlY + 18, COLORS.cream, "Medium", 24);
  fillText(ctx, payload.texts.btc_price, 70, hlY + 45, COLORS.white, "Black", 52);

  // BTC change (right-aligned)
  const btcChgW = measureText(ctx, payload.texts.btc_change, "Black", 44);
  fillText(ctx, payload.texts.btc_change, W - 70 - btcChgW, hlY + 45,
    payload.colors.btc_change || COLORS.bullGreen, "Black", 44);

  const marketW = measureText(ctx, payload.texts.market_change, "Medium", 18);
  fillText(ctx, payload.texts.market_change, W - 70 - marketW, hlY + 18,
    COLORS.cream, "Medium", 18);

  // 6) Alt coin cards (4)
  const altY = 390;
  const cwAlt = 232;
  const chAlt = 115;
  const gap = 16;
  const totalW = 4 * cwAlt + 3 * gap;
  const startX = (W - totalW) / 2;

  const alts = [
    { sym: "ETH", priceKey: "eth_price", chgKey: "eth_change" },
    { sym: "SOL", priceKey: "sol_price", chgKey: "sol_change" },
    { sym: "SUI", priceKey: "sui_price", chgKey: "sui_change" },
    { sym: "XRP", priceKey: "xrp_price", chgKey: "xrp_change" },
  ];

  for (let i = 0; i < alts.length; i++) {
    const cx = startX + i * (cwAlt + gap);
    const a = alts[i];
    const color = payload.colors[a.chgKey] || COLORS.bullGreen;

    roundRect(ctx, cx, altY + 6, cwAlt, chAlt, 16, color);  // shadow
    roundRect(ctx, cx, altY, cwAlt, chAlt, 16, COLORS.white, color, 3);

    fillText(ctx, a.sym, cx + 18, altY + 12, color, "Black", 22);
    fillText(ctx, payload.texts[a.priceKey], cx + 18, altY + 40, COLORS.black, "Black", 28);
    fillText(ctx, payload.texts[a.chgKey], cx + 18, altY + 78, color, "Bold", 20);
  }

  // 7) Kimchi premium card (left)
  const midY = 540;
  const mcW = 482;
  const mcH = 175;

  roundRect(ctx, 40, midY + 6, mcW, mcH, 18, COLORS.yellow);
  roundRect(ctx, 40, midY, mcW, mcH, 18, COLORS.white, COLORS.yellow, 3);

  circle(ctx, 78, midY + 36, 14, COLORS.orange);
  fillText(ctx, "김치 프리미엄", 104, midY + 18, COLORS.brown, "Black", 26);
  fillText(ctx, payload.texts.kimchi_rate, 64, midY + 65, COLORS.black, "Bold", 22);
  fillText(ctx, "프리미엄: ", 64, midY + 100, COLORS.black, "Medium", 22);
  const pwLen = measureText(ctx, "프리미엄: ", "Medium", 22);
  // Premium value color: red if negative, green otherwise
  const premiumColor = payload.texts.kimchi_premium.startsWith("-")
    ? COLORS.bearRed
    : COLORS.bullGreen;
  fillText(ctx, payload.texts.kimchi_premium, 64 + pwLen, midY + 99,
    premiumColor, "Black", 24);
  fillText(ctx, payload.texts.kimchi_note, 64, midY + 138, COLORS.gray, "Medium", 17);

  // 8) Fear & Greed card (right)
  const fx = 40 + mcW + 36;
  roundRect(ctx, fx, midY + 6, mcW, mcH, 18, COLORS.orangeLight);
  roundRect(ctx, fx, midY, mcW, mcH, 18, COLORS.white, COLORS.orangeLight, 3);

  circle(ctx, fx + 38, midY + 36, 14, COLORS.orangeLight);
  fillText(ctx, "공포/탐욕 지수", fx + 64, midY + 18, COLORS.brown, "Black", 26);

  // Gauge bar
  const gx = fx + 24;
  const gy = midY + 65;
  const gw = mcW - 48;
  roundRect(ctx, gx, gy, gw, 22, 11, COLORS.grayLight);
  // Gauge fill (gradient based on payload.gauge.fill_pct)
  const fillW = Math.round(gw * (payload.gauge.fill_pct || 0));
  if (fillW > 0) {
    // Clip to rounded rect, then gradient fill
    ctx.save();
    ctx.beginPath();
    const r = 11;
    ctx.moveTo(gx + r, gy);
    ctx.lineTo(gx + gw - r, gy);
    ctx.quadraticCurveTo(gx + gw, gy, gx + gw, gy + r);
    ctx.lineTo(gx + gw, gy + 22 - r);
    ctx.quadraticCurveTo(gx + gw, gy + 22, gx + gw - r, gy + 22);
    ctx.lineTo(gx + r, gy + 22);
    ctx.quadraticCurveTo(gx, gy + 22, gx, gy + 22 - r);
    ctx.lineTo(gx, gy + r);
    ctx.quadraticCurveTo(gx, gy, gx + r, gy);
    ctx.closePath();
    ctx.clip();
    gradientH(ctx, gx, gy, fillW, 22, COLORS.bearRed, COLORS.yellow);
    ctx.restore();
  }

  fillText(ctx, payload.texts.fear_value, fx + 24, midY + 95, COLORS.orange, "Black", 38);
  const fvW = measureText(ctx, payload.texts.fear_value, "Black", 38);
  fillText(ctx, payload.texts.fear_label, fx + 24 + fvW + 12, midY + 108,
    COLORS.black, "Bold", 22);
  fillText(ctx, payload.texts.fear_note, fx + 24, midY + 145, COLORS.gray, "Medium", 16);

  // 9) DeFi hot issues card
  const dy = 745;
  roundRect(ctx, 40, dy + 6, W - 80, 200, 20, COLORS.purple);
  roundRect(ctx, 40, dy, W - 80, 200, 20, COLORS.white, COLORS.purple, 3);

  circle(ctx, 74, dy + 36, 14, COLORS.purple);
  fillText(ctx, "DeFi 핫이슈", 100, dy + 18, COLORS.brown, "Black", 28);

  for (let i = 0; i < 3; i++) {
    const iy = dy + 70 + i * 42;
    const nameKey = `defi_${i + 1}_name`;
    const noteKey = `defi_${i + 1}_note`;
    const chgKey = `defi_${i + 1}_change`;
    const isUp = !payload.texts[chgKey].startsWith("-");
    const color = isUp ? COLORS.bullGreen : COLORS.bearRed;

    circle(ctx, 69, iy + 17, 9, color);
    fillText(ctx, payload.texts[nameKey], 88, iy, COLORS.black, "Black", 22);
    const nameW = measureText(ctx, payload.texts[nameKey], "Black", 22);
    if (payload.texts[noteKey]) {
      fillText(ctx, payload.texts[noteKey], 88 + nameW + 12, iy + 4,
        COLORS.gray, "Medium", 18);
    }

    // Badge
    const bx2 = W - 200;
    const bgColor = isUp ? "#e8f5e8" : "#ffebed";
    roundRect(ctx, bx2, iy - 2, 130, 32, 14, bgColor, color, 2);
    setFont(ctx, "Black", 22);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(payload.texts[chgKey], bx2 + 65, iy + 1);
    ctx.textAlign = "left";
  }

  // 10) Trending TOP 3 card
  const ty = 975;
  roundRect(ctx, 40, ty + 6, W - 80, 220, 20, COLORS.yellow);
  roundRect(ctx, 40, ty, W - 80, 220, 20, COLORS.white, COLORS.yellow, 3);

  circle(ctx, 74, ty + 36, 14, COLORS.yellow);
  fillText(ctx, "트렌딩 TOP 3", 100, ty + 18, COLORS.brown, "Black", 28);

  const trendColors = [COLORS.bearRed, "#FF9100", "#00BCD4"];
  for (let i = 0; i < 3; i++) {
    const iy = ty + 78 + i * 48;
    const accent = trendColors[i];
    circle(ctx, 78, iy + 18, 18, accent);

    setFont(ctx, "Black", 24);
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), 78, iy + 19);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    fillText(ctx, payload.texts[`trend_${i + 1}_name`], 110, iy + 4,
      COLORS.black, "Black", 24);

    const chgKey = `trend_${i + 1}_change`;
    const chgW = measureText(ctx, payload.texts[chgKey], "Black", 26);
    fillText(ctx, payload.texts[chgKey], W - 80 - chgW, iy + 2,
      COLORS.bullGreen, "Black", 26);
  }

  // 11) Quote card
  const qy = 1215;
  roundRect(ctx, 40, qy + 6, W - 80, 95, 18, COLORS.bullGreen);
  roundRect(ctx, 40, qy, W - 80, 95, 18, COLORS.white, COLORS.bullGreen, 3);

  fillText(ctx, "\u201c", 60, qy + 5, COLORS.bullGreen, "Black", 50);
  fillText(ctx, payload.texts.quote_line1, 105, qy + 15, COLORS.black, "Bold", 22);
  fillText(ctx, payload.texts.quote_line2, 105, qy + 48, COLORS.gray, "Medium", 19);
  fillText(ctx, "\u201d", 1010, qy + 45, COLORS.bullGreen, "Black", 50);

  // 12) Footer with COINEASY pixel logo
  const fy = 1310;
  const logo = await loadImage(path.join(ASSETS_DIR, "coineasy-logo.png"));
  const logoH = 32;
  const logoW = (logo.width / logo.height) * logoH;
  ctx.drawImage(logo, 40, fy + 4, logoW, logoH);

  fillText(ctx, "Korea's #1 Web3 GTM Agency", 40, fy + logoH + 6,
    COLORS.cream, "Medium", 14);

  const handle = "@coiniseasy";
  const hw = measureText(ctx, handle, "Bold", 22);
  fillText(ctx, handle, W - 40 - hw, fy + 2, COLORS.yellow, "Bold", 22);

  const cta = "코인이지와 함께 이지하게!";
  const ctw = measureText(ctx, cta, "Medium", 14);
  fillText(ctx, cta, W - 40 - ctw, fy + 34, COLORS.cream, "Medium", 14);

  // 13) Bottom accent
  gradientH(ctx, 0, H - 6, W, 6, COLORS.bullGreen, COLORS.yellow);

  return canvas.toBuffer("image/png");
}

module.exports = { renderBanner };

// CLI test
if (require.main === module) {
  (async () => {
    const fs = require("fs").promises;
    // 샘플 payload (실제로는 figmaDataBuilder.buildPayload()에서 옴)
    const samplePayload = {
      texts: {
        date_label: "4월 8일 수요일 아침",
        btc_price: "$70,068", btc_change: "+0.79%", market_change: "MARKET +0.52%",
        eth_price: "$2,151", eth_change: "+0.66%",
        sol_price: "$83.06", sol_change: "+1.95%",
        sui_price: "$0.914", sui_change: "+2.59%",
        xrp_price: "$1.34", xrp_change: "-0.11%",
        kimchi_rate: "환율: ₩1,501/USDT", kimchi_premium: "-0.09%",
        kimchi_note: "거의 동조화 — 정상 범위",
        fear_value: "39", fear_label: "Fear",
        fear_note: "여전히 공포 구간이지만 시장은 꿋꿋",
        defi_1_name: "Echo Bridge", defi_1_note: "브릿징 수요 증가", defi_1_change: "+20.42%",
        defi_2_name: "Maple", defi_2_note: "회복 상승세", defi_2_change: "+16.12%",
        defi_3_name: "Mellow Core", defi_3_note: "급락 주의", defi_3_change: "-46%",
        trend_1_name: "BRISE", trend_1_change: "+229%",
        trend_2_name: "ZEC (Zcash)", trend_2_change: "+22.91%",
        trend_3_name: "HYPE (Hyperliquid)", trend_3_change: "+1.83%",
        quote_line1: "조용한 상승이 가장 건강한 신호",
        quote_line2: "F&G 공포에도 시장이 꿋꿋한 이유",
      },
      gauge: { fill_pct: 0.39 },
      colors: {
        btc_change: "#00b009", eth_change: "#00b009", sol_change: "#00b009",
        sui_change: "#00b009", xrp_change: "#ff1f1f",
      },
    };
    const buf = await renderBanner(samplePayload);
    await fs.writeFile("test_banner.png", buf);
    console.log("Saved test_banner.png", buf.length, "bytes");
  })().catch((e) => { console.error(e); process.exit(1); });
}
