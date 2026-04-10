/**
 * 코인이지 데일리 브리핑 - 텔레그램 발송 모듈
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

export async function sendTelegramMessage(text, chatId, botToken) {
  if (!botToken || !chatId) {
    console.error('[텔레그램] BOT_TOKEN 또는 CHAT_ID 미설정');
    return false;
  }

  const url = `${TELEGRAM_API}${botToken}/sendMessage`;

  // 텔레그램 메시지 길이 제한 (4096자)
  const messages = splitMessage(text, 4000);

  for (let i = 0; i < messages.length; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: messages[i],
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      const result = await res.json();

      if (!result.ok) {
                      // HTML 파싱 실패시 일반 텍스트로 재시도
        const htmlRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: messages[i],
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });
        const htmlResult = await htmlRes.json();
        
        if (!htmlResult.ok) {
          // 최후 수단: 파싱 없이 일반 텍스트로 전송
          console.warn(`[텔레그램] HTML도 실패, 일반 텍스트로 전송`);
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: stripFormatting(messages[i]),
              disable_web_page_preview: true,
            }),
          });
        }
      }

      console.log(`[텔레그램] 메시지 ${i + 1}/${messages.length} 발송 완료 → ${chatId}`);

      // 여러 메시지일 경우 rate limit 방지
      if (messages.length > 1 && i < messages.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      console.error(`[텔레그램 에러] ${err.message}`);
      return false;
    }
  }

  return true;
}

// 긴 메시지 분할
function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];

  const parts = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }

    // 줄바꿈 기준으로 자르기
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt === -1 || splitAt < maxLength * 0.5) {
      splitAt = maxLength;
    }

    parts.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }

  return parts;
}

// 포맷팅 제거 (최후 수단용)
function stripFormatting(text) {
  return text
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

// 여러 채널에 동시 발송
export async function broadcastBriefing(text, botToken, channelIds) {
  const results = [];
  
  for (const chatId of channelIds) {
    if (!chatId) continue;
    const success = await sendTelegramMessage(text, chatId, botToken);
    results.push({ chatId, success });
    await new Promise(r => setTimeout(r, 500)); // rate limit
  }

  return results;
}
