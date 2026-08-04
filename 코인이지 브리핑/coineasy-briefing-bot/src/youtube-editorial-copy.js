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
    '코인이지 오늘의 핵심.', `${voiceCut(e.headline, 30)}.`,
    `확인된 사실, ${voiceCut(e.fact, 44)}.`,
    `해석하면, ${voiceCut(e.verdict || e.context, 36)}.`,
    `지금 비트코인 ${t.btc_price}, 김프 ${t.kimchi_premium}, 공포탐욕 ${t.fear_value}.`,
    `오늘은 ${voiceCut(e.action, 32)}.`, `출처 ${e.sourceLabel}.`,
  ].join(' ');
}

export { buildNarration, sceneForTime, voiceCut };
