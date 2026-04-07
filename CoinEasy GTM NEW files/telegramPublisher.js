// figma-daily/telegramPublisher.js
// =================================
// 렌더링된 PNG 배너 + 본문 텍스트를 코인이지 텔레그램 공지방에 발행한다.
//
// 환경변수:
//   COINEASY_BOT_TOKEN          - 텔레그램 봇 토큰
//   COINEASY_ANNOUNCEMENT_CHAT  - 공지방 chat_id (예: -1001234567890)
//
// (기존 봇이 이미 텔레그램 토큰을 갖고 있을 가능성이 높음.
//  다른 변수명을 쓰고 있으면 .env 에서 alias하거나 여기 변수명 변경.)

const fs = require("fs");

const BOT_TOKEN = process.env.COINEASY_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.COINEASY_ANNOUNCEMENT_CHAT || process.env.TELEGRAM_CHAT_ID;

// ─── Body text formatter (텔레그램 본문) ────────────────
function formatBodyText(payload) {
  const t = payload.texts;
  return (
    `🌅 *${t.date_label}*\n` +
    `${t.quote_line1}\n\n` +
    `📊 *주요 시세*\n` +
    `• BTC: ${t.btc_price} (${t.btc_change})\n` +
    `• ETH: ${t.eth_price} (${t.eth_change})\n` +
    `• SOL: ${t.sol_price} (${t.sol_change})\n` +
    `• SUI: ${t.sui_price} (${t.sui_change})\n` +
    `• XRP: ${t.xrp_price} (${t.xrp_change})\n` +
    `${t.market_change}\n\n` +
    `🔥 *김치 프리미엄*\n` +
    `${t.kimchi_rate}\n` +
    `프리미엄: ${t.kimchi_premium}\n` +
    `${t.kimchi_note}\n\n` +
    `😨 *공포/탐욕 지수*: ${t.fear_value} (${t.fear_label})\n` +
    `${t.fear_note}\n\n` +
    `💎 *DeFi 핫이슈*\n` +
    `• ${t.defi_1_name}: ${t.defi_1_change} ${t.defi_1_note}\n` +
    `• ${t.defi_2_name}: ${t.defi_2_change} ${t.defi_2_note}\n` +
    `• ${t.defi_3_name}: ${t.defi_3_change} ${t.defi_3_note}\n\n` +
    `🚀 *트렌딩 TOP 3*\n` +
    `1. ${t.trend_1_name}: ${t.trend_1_change}\n` +
    `2. ${t.trend_2_name}: ${t.trend_2_change}\n` +
    `3. ${t.trend_3_name}: ${t.trend_3_change}\n\n` +
    `💡 *오늘의 한 줄*\n` +
    `${t.quote_line2}\n\n` +
    `코인이지와 함께 오늘도 이지하게! 🤙`
  );
}

// ─── Send photo with caption (multipart upload) ─────────
async function sendPhoto(pngBuffer, caption) {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error(
      "텔레그램 환경변수 필요: COINEASY_BOT_TOKEN, COINEASY_ANNOUNCEMENT_CHAT"
    );
  }

  // Telegram caption max = 1024 chars. 본문이 그보다 길면 split.
  const captionMax = 1000;
  let firstCaption = caption;
  let extraText = null;
  if (caption.length > captionMax) {
    // 적절한 위치에서 자르기 (줄 단위)
    const lines = caption.split("\n");
    const first = [];
    let total = 0;
    let i = 0;
    for (; i < lines.length; i++) {
      if (total + lines[i].length + 1 > captionMax) break;
      first.push(lines[i]);
      total += lines[i].length + 1;
    }
    firstCaption = first.join("\n");
    extraText = lines.slice(i).join("\n");
  }

  // FormData 사용 (Node 18+ native)
  const formData = new FormData();
  formData.append("chat_id", String(CHAT_ID));
  formData.append("caption", firstCaption);
  formData.append("parse_mode", "Markdown");
  // PNG buffer → Blob
  const blob = new Blob([pngBuffer], { type: "image/png" });
  formData.append("photo", blob, "coineasy_daily.png");

  const r = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
    { method: "POST", body: formData }
  );
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Telegram sendPhoto ${r.status}: ${body}`);
  }
  const result = await r.json();

  // 본문이 잘렸으면 reply로 나머지 발행
  if (extraText) {
    const r2 = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: extraText,
          parse_mode: "Markdown",
          reply_to_message_id: result.result.message_id,
        }),
      }
    );
    if (!r2.ok) {
      console.warn("[telegram] extra text send failed:", await r2.text());
    }
  }

  return {
    message_id: result.result.message_id,
    chat_id: result.result.chat.id,
  };
}

async function publishToTelegram(pngBuffer, payload) {
  const body = formatBodyText(payload);
  return await sendPhoto(pngBuffer, body);
}

module.exports = { publishToTelegram, formatBodyText };
