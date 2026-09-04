// src/social-composer.js
// =======================
// Typefully(X/LinkedIn/Threads) 기본 본문용 영어 카피 컴포저. 데이터 기반 — LLM 호출 없음.
// 기본 본문 정책: 전부 영어, 해시태그/외부 링크/팔로우 CTA 금지, em dash 금지.
// 승인된 Telegram 링크는 typefully-poster.js가 X의 마지막 답글에만 붙인다.
// X 네이티브 리듬 (한 줄 한 생각, 줄 사이 빈 줄, 한 줄 60자 이내, 전체 272자 이내).

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MAX_LINE_LEN = 60;
export const MAX_TOTAL_LEN = 272;

function findCoin(data, symbol) {
  if (!data?.market || !Array.isArray(data.market)) return null;
  return data.market.find(c => c.symbol === symbol) || null;
}

function fmtUsd(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  return `$${n.toFixed(2)}`;
}

export function composeEnglishDigest(data, session) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dateEn = `${MONTH_EN[kst.getUTCMonth()]} ${kst.getUTCDate()}`;
  const sessionWord = session?.type === 'evening' ? 'evening' : 'morning';

  // 서사 순서 유지: optional 라인은 자리에 그대로 두고, 길이 초과 시 뒤에서부터 뺀다
  const lines = [];
  const push = (text, optional = false) => lines.push({ text, optional });

  push(`Korea ${sessionWord} check, ${dateEn}.`);

  const btc = findCoin(data, 'BTC');
  if (btc) {
    const chg = parseFloat(btc.change24h);
    const dir = isNaN(chg) ? null : chg >= 0 ? 'up' : 'down';
    const price = fmtUsd(btc.price);
    if (price && dir) {
      push(`BTC ${price}, ${dir} ${Math.abs(chg).toFixed(1)}% in 24h.`);
    }
  }

  const premium = parseFloat(data?.kimchi?.premium);
  if (!isNaN(premium)) {
    push(`Kimchi premium at ${premium >= 0 ? '+' : ''}${premium.toFixed(1)}%.`);
    if (premium < -0.5) {
      push('Korea still trades below global.', true);
    } else if (premium > 2) {
      push('Local demand is running hot.', true);
    }
  }

  const fg = data?.fearGreed;
  if (fg?.value != null) {
    const label = String(fg.label || '').toLowerCase() || 'neutral';
    push(`Fear and Greed at ${fg.value}, ${label} zone.`);
  }

  const trending = (data?.trending || []).slice(0, 3).map(t => t.symbol).filter(Boolean);
  if (trending.length) {
    push(`Trending in Korea: ${trending.join(', ')}.`, true);
  }

  push('Daily Korea signal by CoinEasy.');

  // 한 줄 60자 초과분은 버린다 (자르면 문장이 깨지므로)
  let kept = lines.filter(l => l.text.length <= MAX_LINE_LEN);

  // 전체 272자 이내가 될 때까지 optional 라인을 뒤에서부터 제거
  const assemble = () => kept.map(l => l.text).join('\n\n');
  let text = assemble();
  while (text.length > MAX_TOTAL_LEN && kept.some(l => l.optional)) {
    const lastOpt = kept.map(l => l.optional).lastIndexOf(true);
    kept = kept.filter((_, i) => i !== lastOpt);
    text = assemble();
  }
  return text;
}
