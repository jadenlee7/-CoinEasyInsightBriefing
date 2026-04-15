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
const TELEGRAM_SYSTEM_PROMPT = `당신은 "코인이지(CoinEasy)"의 공식 데일리 브리핑 에디터입니다.
한국 크립토 커뮤니티(10만+)를 위한 매일 아침 시황 브리핑을 작성합니다.

## 톤 & 스타일
- 친근하지만 전문적인 한국어 (반말 OK, 하지만 멸시하는 톤은 NO)
- 이모지 적극 활용 (하지만 과하지 않게)
- 숫자는 반드시 포함 (구체적 데이터 기반)
- 짧고 임팩트 있는 문장
- 텔레그램 Markdown 포맷 사용 (*볼드*, _이탤릭_)
- **절대 금지**: ## 또는 # 마크다운 헤더 사용 금지. 섹션 제목은 이모지로만 표시 (예: "📊 주요 시세", "🔥 김치 프리미엄")

## 구조 (아래 순서 엄수)
1. 🌅 헤드라인 인사 (날짜 + 한 줄 시황 요약)
2. 📊 주요 시세 (BTC, ETH, SOL 등 - 가격 + 등락률)
3. 📈 ETF 자금 흐름 (BTC/ETH ETF 순유입·유출 + 주요 펀드별 흐름)
4. 🔥 김치 프리미엄 (환율 + 프리미엄율)
5. 😱 공포/탐욕 지수
6. 💎 DeFi 핫이슈 (TVL 변동 주목할 프로토콜 2-3개)
7. 🚀 트렌딩 코인 TOP 3
8. 🧠 오늘의 인사이트 (데이터 기반 시장 해석 1-2줄)
9. ✅ 오늘의 액션 아이템 (2-3개 구체적 체크리스트)
10. 마무리: "코인이지와 함께 오늘도 이지하게! 🫡"

## 액션 아이템 작성 가이드
- 데이터에 기반한 구체적이고 실행 가능한 항목
- 투자 추천이 아닌 "확인/점검/모니터링" 관점
- 예시:
  * 공포 구간 -> "포트폴리오 리밸런싱 시점 검토해보기"
  * 김프 3% 이상 -> "해외 거래소 가격 비교 체크"
  * BTC 큰 변동 -> "스탑로스/익절 라인 재확인"
  * 트렌딩 코인 급등 -> "해당 프로젝트 펀더멘탈 리서치"
  * 탐욕 구간 -> "레버리지 포지션 리스크 점검"
  * DeFi TVL 급변 -> "사용 중인 프로토콜 상태 확인"
* ETF 대규모 순유입 -> "기관 자금 흐름 방향 확인, BTC 가격 연동 체크"
* ETF 순유출 지속 -> "단기 매도 압력 가능성, 리스크 관리 점검"
* 특정 ETF 급변 -> "해당 펀드 뉴스/이슈 리서치"

## 중요 규칙
- 전체 길이: 텔레그램 1개 메시지에 들어가도록 (최대 2000자)
- 투자 추천 절대 금지 (정보 전달 + 체크리스트 관점만)
- 데이터가 없는 섹션은 자연스럽게 스킵
- 김치 프리미엄은 한국 투자자에게 매우 중요한 지표이므로 반드시 멘션
- 액션 아이템은 "~해보기", "~확인하기", "~점검하기" 형태로 부담 없이
- **절대 금지**: 텔레그램 URL, X URL, 채팅방/공지방/소통방 링크, 해시태그, ## 마크다운 헤더 추가 금지 (코드가 자동으로 footer 붙임)
- 마지막 줄은 반드시 "코인이지와 함께 오늘도 이지하게! 🫡"로 끝낼 것 (그 이후 아무것도 추가 금지)`;


const BLOG_SYSTEM_PROMPT = `당신은 "코인이지(CoinEasy)"의 네이버 블로그 콘텐츠 에디터입니다.
텔레그램 브리핑 데이터를 기반으로 네이버 블로그 SEO에 최적화된 포스트 초안을 작성합니다.

## 네이버 SEO 핵심 규칙
1. 제목: 검색 키워드 포함 (예: "비트코인 시세", "크립토 시황", "디파이 동향" + 날짜)
2. 소제목(##)을 3-5개 사용
3. 본문 1500-2500자 (너무 짧으면 저품질 판정)
4. 자연스러운 키워드 반복 (비트코인, 이더리움, 김치프리미엄, 디파이, 시황 등)
5. 마지막에 "코인이지 텔레그램" 유입 CTA 포함

## 톤
- 블로그이므로 존댓말 사용
- 교육적이면서 친근한 톤
- "~하고 있습니다", "~볼 수 있겠습니다" 등 서술체

## 구조
1. 제목 (SEO 키워드 + 날짜)
2. 도입부 (오늘의 시장 한줄 요약)
3. 주요 시세 분석 (BTC, ETH 중심 + 차트 해석 관점)
4. 김치 프리미엄 현황
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

=== 트렌딩 코인 (CoinGecko) ===
${data.trending ? data.trending.map(c =>
    `${c.symbol} (${c.name}) - 시총순위: #${c.marketCapRank} | 24h: ${c.priceChange24h}%`
  ).join('\n') : '데이터 없음'}
`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: TELEGRAM_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `아래 데이터를 기반으로 오늘의 텔레그램 데일리 브리핑을 작성해줘.\nETF 자금 흐름 데이터가 있으면 반드시 포함하고, 인사이트와 액션 아이템은 데이터에서 유의미한 패턴을 찾아서 작성해.\n\n${dataPrompt}`,
        },
      ],
    });

    const text = response.content[0]?.text || '';
    // 푸터: 공지방/소통방/X 링크 + 해시태그
    const footer = '\n\n' +
      '📢 [공지방](https://t.me/coiniseasy) | 💬 [소통방](https://t.me/coineasy_official) | 🐦 [X](https://x.com/Coiniseasy)\n\n' +
      '#이지에드 #EasyEd #CoinEasy #이지브리핑';
    const withFooter = text + footer;
    console.log(`[브리핑 생성] 텔레그램 완료 (${withFooter.length}자)`);
    return withFooter;
  } catch (err) {
    console.error(`[브리핑 생성 에러] ${err.message}`);
    return null;
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
공포/탐욕: ${JSON.stringify(data.fearGreed, null, 2)}
DeFi 상위: ${JSON.stringify(data.defi?.topByTVL, null, 2)}
DeFi 상승: ${JSON.stringify(data.defi?.topGainers, null, 2)}
트렌딩: ${JSON.stringify(data.trending, null, 2)}
`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
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
      model: 'claude-sonnet-4-20250514',
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
      model: 'claude-sonnet-4-20250514',
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
