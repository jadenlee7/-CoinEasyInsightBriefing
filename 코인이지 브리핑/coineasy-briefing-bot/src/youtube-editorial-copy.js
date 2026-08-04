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
    '코인이지 오늘의 핵심입니다.', `${e.headline}.`,
    `${e.factTitle}. ${e.fact}.`, `핵심 해석은 ${e.verdict || e.context}.`,
    `현재 비트코인 ${t.btc_price}, 김치 프리미엄 ${t.kimchi_premium}, 공포탐욕지수 ${t.fear_value}입니다.`,
    `오늘은 ${e.action}.`, `출처는 ${e.sourceLabel}. 수치와 제도는 바뀌 수 있습니다.`,
  ].join(' ');
}

export { buildNarration, sceneForTime };
