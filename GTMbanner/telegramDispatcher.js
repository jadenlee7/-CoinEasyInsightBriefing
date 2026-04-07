// figma-daily/telegramDispatcher.js
// =================================
// buildPayload() 결과를 매니저 텔레그램 채팅으로 전송한다.
// - 1번째 메시지: 미리보기 (Markdown)
// - 2번째 메시지: JSON 코드블록 (Figma 플러그인 붙여넣기용)

const TELEGRAM_BOT_TOKEN = process.env.COINEASY_FIGMA_BOT_TOKEN;
const MANAGER_CHAT_ID = process.env.COINEASY_MANAGER_CHAT_ID;

function formatPreview(payload) {
  const t = payload.texts;
  return (
    `📊 *CoinEasy Daily — ${t.date_label}*\n\n` +
    `*BTC* ${t.btc_price} (${t.btc_change})  |  ${t.market_change}\n` +
    `ETH ${t.eth_price} ${t.eth_change}\n` +
    `SOL ${t.sol_price} ${t.sol_change}\n` +
    `SUI ${t.sui_price} ${t.sui_change}\n` +
    `XRP ${t.xrp_price} ${t.xrp_change}\n\n` +
    `🥬 김프: ${t.kimchi_premium}  |  😨 F&G: ${t.fear_value} (${t.fear_label})\n\n` +
    `💎 DeFi: ${t.defi_1_name} ${t.defi_1_change}, ` +
    `${t.defi_2_name} ${t.defi_2_change}, ${t.defi_3_name} ${t.defi_3_change}\n` +
    `🚀 Trending: ${t.trend_1_name} ${t.trend_1_change}\n\n` +
    `_${t.quote_line1}_\n_${t.quote_line2}_\n\n` +
    `⬇️ 아래 JSON을 길게 눌러 복사 → Figma 플러그인에 붙여넣기`
  );
}

async function tgSendMessage(chatId, text, parseMode) {
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode || undefined,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Telegram API ${r.status}: ${body}`);
  }
  return r.json();
}

async function sendPayload(payload) {
  if (!TELEGRAM_BOT_TOKEN || !MANAGER_CHAT_ID) {
    throw new Error("COINEASY_FIGMA_BOT_TOKEN 또는 COINEASY_MANAGER_CHAT_ID 환경변수 필요");
  }

  // 1) Preview
  const preview = formatPreview(payload);
  const r1 = await tgSendMessage(MANAGER_CHAT_ID, preview, "Markdown");

  // 2) JSON code block
  let jsonStr = JSON.stringify(payload);
  let msg = "```json\n" + jsonStr + "\n```";

  // Telegram 4096 char limit — fall back to compact
  if (msg.length > 4000) {
    // already minimized, but worth retrying with no spaces (already none)
    // If still too big, split into multiple messages
    msg = "```\n" + jsonStr.slice(0, 3900) + "\n```";
    console.warn("[telegram] payload truncated — consider sending as document");
  }

  const r2 = await tgSendMessage(MANAGER_CHAT_ID, msg, "Markdown");

  return {
    preview_message_id: r1.result.message_id,
    json_message_id: r2.result.message_id,
  };
}

module.exports = { sendPayload, formatPreview };
