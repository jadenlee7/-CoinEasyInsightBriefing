/**
 * 코인이지 데일리 브리핑 - AI 브리핑 생성 모듈 v2
 * Claude API를 사용해서 텔레그램용 브리핑 + 네이버 블로그 초안 + X 포스트 + 쇼츠 스크립트 생성
 *
 * v2: 인사이트 + 액션 아이템 강화
 */
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

// ============================================================
// 텔레그램 브리핑 생성
// ============================================================
const TELEGRAM_SYSTEM_PROMPT = `당신은 "코인이지(CoinEasy)"의 데일리 브리핑 에디터입니다.
한국 크립토 커뮤니티를 위한 짧고 핵심적인 시황 브리핑을 작성합니다.
이 브리핑은 배너 사진의 캡션으로 들어가므로 반드시 짧아야 합니다.

## 최우선 규칙 — 길이
- **전체 700자 이내 (공백 포함). 절대 800자 넘기지 말 것.**
- 유저가 스크롤 없이 한눈에 스캔할 수 있는 분량

## 톤 & 스타일
- 간결한 한국어. 군더더기 없이 핵심만
- **이모지 사용 절대 금지** (제목·본문 어디에도 이모지 넣지 말 것). 섹션 제목은 *볼드* 텍스트로만 구분
- 텔레그램 Markdown (*볼드*)만 사용
- ## 또는 # 마크다운 헤더 금지

## 구조 (간결하게, 각 섹션 1-3줄, 이모지 없이)
[날짜] + 한 줄 시황 요약
*시세*: BTC/ETH/SOL/XRP/SUI — 가격 + 24h 등락률만 (한 줄에 2개씩 압축, 7일·시총·거래량 생략)
*심리*: 공포탐욕 [값(라벨)] · 김프 [%] (한 줄)
*트렌딩*: TOP3 심볼 + 24h 등락률 (한 줄)
*인사이트*: 데이터 기반 한 줄 해석

## 중요 규칙
- 700자 이내 엄수 (이게 가장 중요)
- 투자 추천 절대 금지 (정보 전달만)
- 데이터 없는 섹션은 스킵
- 트렌딩은 주어진 TOP3만 순서대로
- ETF/한국시장 TOP3/액션아이템 섹션은 길어지므로 생략 (인사이트 한 줄에 핵심만 녹일 것)
- **절대 금지**: URL, 채팅방/공지방/소통방 링크, 해시태그, ## 헤더 추가 금지 (코드가 footer 붙임)
- 마지막 줄은 "코인이지와 함께 오늘도 이지하게!"로 끝낼 것 (이모지 없이, 그 이후 아무것도 추가 금지)`;


const BLOG_SYSTEM_PROMPT = `당신은 "코인이지(CoinEasy)"의 네이버 블로그 콘텐츠 에디터입니다.
텔레그램 브리핑 데이터를 기반으로 네이버 블로그 SEO에 최적화된 포스트 초안을 작성합니다.

## 네이버 SEO 핵심 규칙
1. 제목: 검색 키워드 포함 (예: "비트코인 시세", "크립토 시황", "디파이 동향" + 날짜)
2. 소제목(##)을 3-5개 사용
3. 본문 1500-2500자 (너무 짧으면 저품질 판정)
4. 자연스러운 키워드 반복 (비트코인, 이더리움, 김치프리미엄, 업비트, 리플, 디파이, 시황, 국내 코인 시장 등)
5. 마지막에 "코인이지 텔레그램" 유입 CTA 포함

## 톤
- 블로그이므로 존댓말 사용
- 교육적이면서 친근한 톤
- "~하고 있습니다", "~볼 수 있겠습니다" 등 서술체

## 구조
1. 제목 (SEO 키워드 + 날짜)
2. 도입부 (오늘의 시장 한줄 요약)
3. 주요 시세 분석 (BTC, ETH 중심 + 차트 해석 관점)
4. 한국 시장 동향 (업비트 거래대금 TOP 코인 + 김치 프리미엄 + 김프 이상치 분석)
5. DeFi / 온체인 동향
6. 트렌딩 코인 분석
7. 오늘의 인사이트 & 체크리스트 (데이터 기반 액션 아이템 3-5개)
8. 마무리 + CTA (텔레그램 유입)

## HTML 태그
네이버 블로그에서 사용 가능한 기본 HTML 태그로 작성:
<h2>, <h3>, <p>, <strong>, <br> 등`;


const X_POST_SYSTEM_PROMPT = `당신은 "코인이지(CoinEasy)"의 X(Twitter) 공식 계정 매니저입니다.
매일 아침 크립토 시황을 280자 이내의 임팩트 있는 한국어 트윗으로 작성합니다.

## 핵심 규칙
- 반드시 280자 이내 (한글 기준)
- 핵심 데이터 1-2개만 선별 (BTC 가격, 공포/탐욕, 김프 중 가장 임팩트 있는 것)
- 이모지 2-3개 사용 (과하지 않게)
- 해시태그 사용 금지 (# 태그 절대 넣지 말 것)
- 데이터 기반 한 줄 액션 힌트 포함 (예: "공포 구간, 포폴 점검 타이밍?")
- 투자 추천 절대 금지
- 텔레그램 유입 CTA: "자세한 브리핑은 텔레그램에서 👉 @coiniseasy"

## 트윗 예시 스타일
"🔥 BTC 8만4천불 (+3.2%) | 공포탐욕 38 (공포)
김프 2.1%로 역프 직전...
📋 체크: 해외 거래소 가격 비교 해볼 타이밍
자세한 브리핑은 텔레그램에서 👉 @coiniseasy"`;


// 공통 footer (공지방/소통방/X 링크 + 해시태그) — 이모지 없이
const BRIEFING_FOOTER = '\n\n' +
  '[공지방](https://t.me/coiniseasy) | [소통방](https://t.me/coineasy_official) | [X](https://twitter.com/Coiniseasy)\n\n' +
  '#이지에드 #EasyEd #CoinEasy #이지브리핑';

// ============================================================
// 데이터 기반 fallback 브리핑 (AI 호출 실패 시)
// 배너와 동일하게 data만으로 만들어서 텍스트가 항상 발송되도록 보장
// ============================================================
function fmtPctFallback(v) {
  if (v == null || v === '') return 'N/A';
  const n = parseFloat(v);
  if (isNaN(n)) return 'N/A';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function buildFallbackTelegramBriefing(data) {
  // 컴팩트 버전 (배너 캡션용, 700자 이내, 이모지 없이)
  const lines = [];
  const dateStr = data.dateKST || new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  lines.push(`*${dateStr} 코인이지 브리핑*`);
  lines.push('');

  // 시세 (한 줄에 2개씩 압축, 24h만)
  if (data.market && data.market.length) {
    lines.push('*시세*');
    const cells = data.market.map(c => {
      const price = typeof c.price === 'number' ? `$${c.price.toLocaleString()}` : `$${c.price}`;
      return `${c.symbol} ${price} ${fmtPctFallback(c.change24h)}`;
    });
    for (let i = 0; i < cells.length; i += 2) {
      lines.push(cells.slice(i, i + 2).join(' | '));
    }
    lines.push('');
  }

  // 심리 (공포탐욕 + 김프 한 줄)
  const sentiment = [];
  if (data.fearGreed) sentiment.push(`공포탐욕 ${data.fearGreed.value} (${data.fearGreed.label})`);
  if (data.kimchi) sentiment.push(`김프 ${fmtPctFallback(data.kimchi.premium)}`);
  if (sentiment.length) {
    lines.push('*심리* ' + sentiment.join(' · '));
    lines.push('');
  }

  // 트렌딩 TOP 3 (한 줄)
  if (data.trending?.length) {
    lines.push('*트렌딩* ' + data.trending.slice(0, 3).map(c => `${c.symbol} ${fmtPctFallback(c.priceChange24h)}`).join(' · '));
    lines.push('');
  }

  lines.push('코인이지와 함께 오늘도 이지하게!');
  return lines.join('\n');
}


export async function generateTelegramBriefing(data) {
  console.log('[브리핑 생성] 텔레그램 브리핑 작성 중...');

  const dataPrompt = `
오늘 날짜: ${data.dateKST}
수집 시각: ${data.timestamp}

=== 주요 코인 시세 ===
${data.market ? data.market.map(c =>
    `${c.symbol}: $${c.price?.toLocaleString()} (24h: ${c.change24h}%, 7d: ${c.change7d}%) | 시총: ${c.marketCap} | 거래량: ${c.volume24h}`
  ).join('\n') : '데이터 없음'}

=== ETF 자금 흐름 ===
${data.etf ? `
[BTC ETF]
날짜: ${data.etf.btc?.date || 'N/A'}
총 순유입: ${data.etf.btc?.totalFlow || 'N/A'}백만달러
전일 총 순유입: ${data.etf.btc?.previousDayTotal || 'N/A'}백만달러
흐름 방향: ${data.etf.btc?.flowDirection || 'N/A'}
주요 유입: ${data.etf.btc?.topInflows?.map(f => `${f.name}: +${f.value}M`).join(', ') || '없음'}
주요 유출: ${data.etf.btc?.topOutflows?.map(f => `${f.name}: ${f.value}M`).join(', ') || '없음'}

[ETH ETF]
날짜: ${data.etf.eth?.date || 'N/A'}
총 순유입: ${data.etf.eth?.totalFlow || 'N/A'}백만달러
전일 총 순유입: ${data.etf.eth?.previousDayTotal || 'N/A'}백만달러
흐름 방향: ${data.etf.eth?.flowDirection || 'N/A'}
주요 유입: ${data.etf.eth?.topInflows?.map(f => `${f.name}: +${f.value}M`).join(', ') || '없음'}
주요 유출: ${data.etf.eth?.topOutflows?.map(f => `${f.name}: ${f.value}M`).join(', ') || '없음'}
` : 'ETF 데이터 없음'}

=== 글로벌 시장 ===
${data.global ? `총 시가총액: ${data.global.totalMarketCap} (24h 변동: ${data.global.marketCapChange24h}%)
총 거래량: ${data.global.totalVolume24h}
BTC 도미넌스: ${data.global.btcDominance}% | ETH 도미넌스: ${data.global.ethDominance}%` : '데이터 없음'}

=== 김치 프리미엄 ===
${data.kimchi ? `업비트 BTC: ₩${data.kimchi.upbitBtcKrw}
바이낸스 BTC: $${data.kimchi.binanceBtcUsd}
환율(USDT/KRW): ₩${data.kimchi.krwRate}
프리미엄: ${data.kimchi.premium}%` : '데이터 없음'}

=== 한국 시장 (업비트 KRW 마켓) ===
${data.korea ? `총 거래대금: ${data.korea.totalVolumeKrw || 'N/A'}
마켓 수: ${data.korea.marketCount || 'N/A'}개

[거래대금 TOP 3 — 반드시 이 3개만 이 순서 그대로 사용할 것]
${data.korea.volumeTop10?.slice(0, 3).map((c, i) => `${i + 1}. ${c.koreanName || c.symbol} (${c.symbol}): ₩${c.price?.toLocaleString?.() || c.price} | 24h: ${c.change24h}% | 거래대금: ${c.volumeKrw}`).join('\n') || '없음'}

[상승률 TOP 3]
${data.korea.gainers?.slice(0, 3).map(c => `${c.koreanName || c.symbol} (${c.symbol}): +${c.change24h}%`).join(', ') || '없음'}

[하락률 TOP 3]
${data.korea.losers?.slice(0, 3).map(c => `${c.koreanName || c.symbol} (${c.symbol}): ${c.change24h}%`).join(', ') || '없음'}

[김프 이상치 (절대값 5% 이상)]
${data.korea.kimchiOutliers?.length > 0 ? data.korea.kimchiOutliers.slice(0, 3).map(c => `${c.koreanName || c.symbol} (${c.symbol}): ${c.premium}% (업비트 ₩${c.upbitPrice} vs 해외 $${c.globalPrice})`).join('\n') : '없음 (모두 정상 범위)'}` : '한국 시장 데이터 없음'}

=== 공포/탐욕 지수 ===
${data.fearGreed ? `현재: ${data.fearGreed.value} (${data.fearGreed.label})
전일: ${data.fearGreed.previousValue} (${data.fearGreed.previousLabel})` : '데이터 없음'}

=== DeFi TVL 현황 ===
${data.defi ? `
[TVL 상위]
${data.defi.topByTVL?.map(p => `${p.name} (${p.chain}): ${p.tvl} | 1d: ${p.change1d}%`).join('\n') || '없음'}

[24h 상승 TOP]
${data.defi.topGainers?.map(p => `${p.name}: ${p.tvl} | +${p.change1d}%`).join('\n') || '없음'}

[24h 하락 TOP]
${data.defi.topLosers?.map(p => `${p.name}: ${p.tvl} | ${p.change1d}%`).join('\n') || '없음'}
` : '데이터 없음'}

=== 체인별 TVL ===
${data.chains ? data.chains.map(c => `${c.name}: ${c.tvl}`).join('\n') : '데이터 없음'}

=== 트렌딩 코인 TOP 3 (CoinGecko) — 반드시 이 3개만 이 순서 그대로 사용할 것 ===
${data.trending ? data.trending.slice(0, 3).map((c, i) =>
    `${i + 1}. ${c.symbol} (${c.name}) - 시총순위: #${c.marketCapRank} | 24h: ${c.priceChange24h}%`
  ).join('\n') : '데이터 없음'}
`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 800,
      system: TELEGRAM_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `아래 데이터를 기반으로 컴팩트한 텔레그램 데일리 브리핑을 작성해줘.\n반드시 700자 이내로, 시세/심리/트렌딩/인사이트만 짧게. 유저가 한눈에 보기 좋게.\n\n${dataPrompt}`,
        },
      ],
    });

    const text = response.content[0]?.text || '';
    if (!text.trim()) {
      // AI가 빈 응답 → fallback
      console.warn('[브리핑 생성] AI 빈 응답 — fallback 브리핑 사용');
      return buildFallbackTelegramBriefing(data) + BRIEFING_FOOTER;
    }
    const withFooter = text + BRIEFING_FOOTER;
    console.log(`[브리핑 생성] 텔레그램 완료 (${withFooter.length}자)`);
    return withFooter;
  } catch (err) {
    console.error(`[브리핑 생성 에러] ${err.message} — fallback 브리핑 사용`);
    // AI 실패 시 데이터 기반 fallback 브리핑 발송 (텍스트 누락 방지)
    return buildFallbackTelegramBriefing(data) + BRIEFING_FOOTER;
  }
}


// ============================================================
// 네이버 블로그 초안 생성
// ============================================================
export async function generateBlogDraft(data, telegramBriefing) {
  console.log('[블로그 초안] 네이버 블로그 초안 작성 중...');

  const dataPrompt = `
오늘 날짜: ${data.dateKST}

=== 텔레그램 브리핑 (참고용) ===
${telegramBriefing}

=== 원본 데이터 (블로그에 더 상세하게 풀어쓰기) ===
주요 시세: ${JSON.stringify(data.market, null, 2)}
글로벌: ${JSON.stringify(data.global, null, 2)}
김치 프리미엄: ${JSON.stringify(data.kimchi, null, 2)}
한국 시장 (업비트): ${JSON.stringify(data.korea ? { totalVolumeKrw: data.korea.totalVolumeKrw, marketCount: data.korea.marketCount, volumeTop10: data.korea.volumeTop10?.slice(0, 5), gainers: data.korea.gainers?.slice(0, 3), losers: data.korea.losers?.slice(0, 3), kimchiOutliers: data.korea.kimchiOutliers?.slice(0, 5) } : null, null, 2)}
공포/탐욕: ${JSON.stringify(data.fearGreed, null, 2)}
DeFi 상위: ${JSON.stringify(data.defi?.topByTVL, null, 2)}
DeFi 상승: ${JSON.stringify(data.defi?.topGainers, null, 2)}
트렌딩: ${JSON.stringify(data.trending, null, 2)}
`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      system: BLOG_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `아래 데이터를 기반으로 네이버 블로그 포스트 초안을 작성해줘. 텔레그램 브리핑보다 더 상세하고 교육적인 톤으로.\n인사이트와 실행 가능한 체크리스트도 포함해줘.\n\n${dataPrompt}`,
        },
      ],
    });

    const text = response.content[0]?.text || '';
    console.log(`[블로그 초안] 완료 (${text.length}자)`);
    return text;
  } catch (err) {
    console.error(`[블로그 초안 에러] ${err.message}`);
    return null;
  }
}


// ============================================================
// X (Twitter) 포스트 생성
// ============================================================
export async function generateXPost(data, telegramBriefing) {
  console.log('[X 포스트] 트윗 생성 중...');

  const dataPrompt = `
오늘 날짜: ${data.dateKST}

=== 핵심 데이터 요약 ===
BTC: ${data.market?.[0] ? `$${data.market[0].price?.toLocaleString()} (24h: ${data.market[0].change24h}%)` : '없음'}
ETH: ${data.market?.[1] ? `$${data.market[1].price?.toLocaleString()} (24h: ${data.market[1].change24h}%)` : '없음'}
공포/탐욕: ${data.fearGreed ? `${data.fearGreed.value} (${data.fearGreed.label})` : '없음'}
김치프리미엄: ${data.kimchi ? `${data.kimchi.premium}%` : '없음'}

ETF: ${data.etf ? `BTC ETF ${data.etf.btc?.totalFlow || 'N/A'}M (${data.etf.btc?.flowDirection || ''}), ETH ETF ${data.etf.eth?.totalFlow || 'N/A'}M (${data.etf.eth?.flowDirection || ''})` : '없음'}

=== 텔레그램 브리핑 (참고 - 핵심만 추출) ===
${telegramBriefing}
`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 500,
      system: X_POST_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `아래 데이터를 기반으로 X(Twitter) 포스트를 작성해줘. 반드시 280자 이내로! 데이터에서 가장 주목할 포인트 + 한 줄 액션 힌트 포함.\n\n${dataPrompt}`,
        },
      ],
    });

    let text = response.content[0]?.text || '';
    // 해시태그 강제 제거 (#으로 시작하는 단어 모두 제거)
    text = text.replace(/#[\w가-힣]+/g, '').replace(/\n{2,}/g, '\n').trim();
    const trimmed = text.length > 280 ? text.substring(0, 277) + '...' : text;
    console.log(`[X 포스트] 완료 (${trimmed.length}자)`);
    return trimmed;
  } catch (err) {
    console.error(`[X 포스트 에러] ${err.message}`);
    return null;
  }
}


// ============================================================
// YouTube Shorts 스크립트 생성 (v3 - 인사이트 + 액션 강화)
// ============================================================
const SHORTS_SYSTEM_PROMPT = `당신은 "코인이지(CoinEasy)"의 YouTube Shorts 스크립트 라이터입니다.
30초 내외의 짧은 한국어 나레이션 스크립트를 작성합니다.

## 핵심 규칙
- 나레이션 전체 길이: 한국어 기준 180-250자 (읽으면 약 30-40초)
- TTS로 읽힐 텍스트이므로 자연스러운 구어체
- 특수문자, 이모지 사용 금지 (TTS가 읽을 수 없음)
- 달러 기호 대신 "달러", 퍼센트 기호 대신 "퍼센트"로 표기
- 숫자는 읽기 쉽게 (예: 84200달러 -> "8만 4천 2백 달러")

## 구조 (6개 카드에 맞춤)
1. 인트로 (3초): 오늘의 핵심 한 줄 - 주목을 끄는 강렬한 헤드라인
2. BTC 카드 (7초): 비트코인과 이더리움 가격 변동 설명
3. ETF 카드 (7초): BTC/ETH ETF 자금 흐름 요약 - 기관 자금이 들어오는지 빠지는지, 얼마나 유입/유출됐는지
4. 지표 카드 (6초): 공포탐욕 지수와 김치 프리미엄 해석
5. 트렌딩 카드 (5초): 오늘 주목할 코인 1-2개
6. 아웃트로 (5초): 오늘의 핵심 액션 아이템 한 줄 + "코인이지 텔레그램에서 매일 아침 브리핑 받아보세요"

## 액션 아이템 힌트 (아웃트로에서 자연스럽게)
- 데이터에 기반한 오늘 체크할 것 1가지를 자연스럽게 멘션
- 예: "오늘은 김프가 높으니 해외 거래소 가격 비교 꼭 해보시고요"
- 예: "공포 구간이니 적립식 매수 타이밍 검토해보시고요"
- 예: "ETF로 기관 자금이 대거 유입 중이니 시장 방향 잘 지켜보시고요"
- 예: "ETF 자금 유출이 이어지고 있으니 리스크 관리 점검해보시고요"
- 투자 추천이 아닌 점검/확인 관점으로

## 자막 분할
나레이션을 10-14개의 짧은 자막 라인으로 분할해서 제공
각 라인은 10-20자 이내

## 출력 형식 (반드시 이 JSON 형식으로)
{
  "headline": "인트로 카드에 표시할 헤드라인 (15자 이내, 한국어)",
  "narration": "전체 나레이션 텍스트",
  "subtitleLines": ["자막1", "자막2", "자막3", ...],
  "title": "YouTube 쇼츠 제목 (50자 이내, #Shorts 포함)"
}`;


export async function generateShortsScript(data, telegramBriefing) {
  console.log('[쇼츠 스크립트] YouTube Shorts 스크립트 생성 중...');

  const dataPrompt = `
오늘 날짜: ${data.dateKST}

=== 핵심 데이터 ===
BTC: ${data.market?.[0] ? `${data.market[0].price?.toLocaleString()}달러 (24시간: ${data.market[0].change24h}%)` : '없음'}
ETH: ${data.market?.[1] ? `${data.market[1].price?.toLocaleString()}달러 (24시간: ${data.market[1].change24h}%)` : '없음'}
공포/탐욕: ${data.fearGreed ? `${data.fearGreed.value} (${data.fearGreed.label})` : '없음'}
김치프리미엄: ${data.kimchi ? `${data.kimchi.premium}%` : '없음'}

=== ETF 자금 흐름 ===
${data.etf ? `BTC ETF 순유입: ${data.etf.btc?.totalFlow || 'N/A'}백만달러 (${data.etf.btc?.flowDirection || ''})
ETH ETF 순유입: ${data.etf.eth?.totalFlow || 'N/A'}백만달러 (${data.etf.eth?.flowDirection || ''})
BTC ETF 주요: ${data.etf.btc?.topInflows?.map(f => f.name + ' +' + f.value + 'M').join(', ') || '없음'} / 유출: ${data.etf.btc?.topOutflows?.map(f => f.name + ' ' + f.value + 'M').join(', ') || '없음'}` : 'ETF 데이터 없음'}

=== 트렌딩 코인 ===
${data.trending ? data.trending.slice(0, 3).map(c =>
    `${c.symbol} (${c.name}): 24h ${c.priceChange24h}%`
  ).join('\n') : '없음'}

=== 텔레그램 브리핑 (참고) ===
${telegramBriefing}
`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1000,
      system: SHORTS_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `아래 데이터를 기반으로 YouTube Shorts 나레이션 스크립트를 JSON 형식으로 작성해줘.\n데이터에서 가장 의미있는 포인트를 짚고, ETF 자금 흐름도 반드시 포함하고, 아웃트로에서 자연스럽게 오늘의 액션 아이템 한 줄을 넣어줘.\n\n${dataPrompt}`,
        },
      ],
    });

    const text = response.content[0]?.text || '';

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[쇼츠 스크립트] JSON 파싱 실패');
      return null;
    }

    const script = JSON.parse(jsonMatch[0]);
    console.log(`[쇼츠 스크립트] 완료 (나레이션: ${script.narration?.length}자, 자막: ${script.subtitleLines?.length}개, 헤드라인: ${script.headline || 'N/A'})`);
    return script;
  } catch (err) {
    console.error(`[쇼츠 스크립트 에러] ${err.message}`);
    return null;
  }
}
