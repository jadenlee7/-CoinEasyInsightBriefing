/**
 * Claude로 오늘의 크립토 인용문 생성
 * 기존 generator.js와 동일한 패턴 (@anthropic-ai/sdk 사용)
 */
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const QUOTE_PROMPT = `당신은 크립토/금융 분야의 인용문 큐레이터입니다.
오늘의 시장 데이터를 보고, 어울리는 명언이나 인사이트를 한국어로 생성하세요.

규칙:
- 반드시 JSON으로 출력: {"text": "인용문 텍스트", "author": "출처/인물"}
- 인용문은 한국어 20-40자
- 실존 인물의 실제 발언이거나, 시장 상황에 맞는 격언
- 투자 추천 금지, 중립적 인사이트만`;

export async function generateDailyQuote(data) {
    try {
          const userMsg = `오늘 시장: BTC $${data.btcPrice} (${data.btcChange24h}%), 공포탐욕 ${data.fearGreedValue} (${data.fearGreedLabel}), 김프 ${data.kimchiPremium}%`;

      const response = await client.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 200,
              system: QUOTE_PROMPT,
              messages: [{ role: 'user', content: userMsg }],
      });

      const text = response.content[0]?.text || '';
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
                  return JSON.parse(match[0]);
          }
    } catch (err) {
          console.error(`[figma-daily QUOTE] ${err.message}`);
    }

  // fallback
  return {
        text: '시장은 공포 속에서 기회를 만든다',
        author: '코인이지',
  };
}
