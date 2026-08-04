function voiceCut(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).replace(/[\s,.·–—-]+$/g, '')}…`;
}

function sceneForTime(seconds) {
  if (seconds < 4) return 0;
  if (seconds < 10) return 1;
  if (seconds < 16) return 2;
  if (seconds < 22) return 3;
  if (seconds < 28) return 4;
  return 5;
}

function buildNarration(payload) {
  const e = payload.editorial;
  const t = payload.texts;
  return [
    `${voiceCut(e.headline, 28)}.`,
    `${voiceCut(e.fact, 44)}.`,
    `${voiceCut(e.verdict || e.context, 42)}.`,
    `비트코인 ${t.btc_price}, 김프 ${t.kimchi_premium}, 공포탐욕 ${t.fear_value}.`,
    `${voiceCut(e.action, 28)}.`,
    `출처 ${voiceCut(e.sourceLabel, 24)}.`,
  ].join(' ');
}

export { buildNarration, sceneForTime, voiceCut };
