/**
 * Figma 데일리 카드 — 오케스트레이터
 * 본 브리핑 5분 전에 실행되어 매니저 채팅방에 미리보기 + JSON 전송
 */
import { fetchFigmaData } from './fetchData.js';
import { generateDailyQuote } from './generateQuote.js';
import { buildFigmaJSON } from './buildFigmaJSON.js';
import { sendTelegramMessage } from '../telegram.js';

// 환경변수 (기존 봇과 별도 or 공유 가능)
const FIGMA_BOT_TOKEN =
  process.env.COINEASY_FIGMA_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN; // fallback: 기존 봇 토큰 재사용
const MANAGER_CHAT_ID =
  process.env.COINEASY_MANAGER_CHAT_ID || process.env.TELEGRAM_CHAT_ID; // fallback: 기존 채팅방

export async function runDailyFigma() {
    console.log('\n' + '='.repeat(50));
    console.log('🖼️  Figma 데일리 카드 생성 시작');
    console.log('='.repeat(50));

    try {
          // 1. 데이터 수집
          console.log('[1/4] 시세 데이터 수집...');
          const data = await fetchFigmaData();
          if (!data.btcPrice) {
                  console.error('❌ BTC 가격 수집 실패. 중단.');
                  return;
                }
          console.log(`  BTC: $${data.btcPrice} (${data.btcChange24h}%)`);

          // 2. 인용문 생성
          console.log('[2/4] 오늘의 인용문 생성...');
          const quote = await generateDailyQuote(data);
          console.log(`  "${quote.text}" — ${quote.author}`);

          // 3. Figma JSON 빌드
          console.log('[3/4] Figma JSON 빌드...');
          const figmaJSON = buildFigmaJSON(data, quote);

          // 4. 텔레그램 전송 (미리보기 + JSON)
          console.log('[4/4] 텔레그램 전송...');

          if (!FIGMA_BOT_TOKEN || !MANAGER_CHAT_ID) {
                  console.log('  ⚠️ 텔레그램 미설정 — JSON만 콘솔 출력');
                  console.log(JSON.stringify(figmaJSON, null, 2));
                  return;
                }

          // 메시지 1: 사람이 읽는 미리보기
          const preview = [
                  `🖼️ *Figma 데일리 카드 미리보기*`,
                  `📅 ${data.dateKST}`,
                  ``,
                  `💰 BTC: $${data.btcPrice} (${data.btcChange24h}%)`,
                  `😱 공포/탐욕: ${data.fearGreedValue} (${data.fearGreedLabel})`,
                  `🔥 김프: ${data.kimchiPremium}%`,
                  ``,
                  `💬 "${quote.text}"`,
                  `  — ${quote.author}`,
                  ``,
                  `⬇️ 아래 JSON을 Figma 플러그인에 붙여넣기`,
                ].join('\n');

          await sendTelegramMessage(preview, MANAGER_CHAT_ID, FIGMA_BOT_TOKEN);

          // 메시지 2: Figma 플러그인용 JSON (코드 블록)
          const jsonMsg =
            '```json\n' + JSON.stringify(figmaJSON, null, 2) + '\n```';
          await sendTelegramMessage(jsonMsg, MANAGER_CHAT_ID, FIGMA_BOT_TOKEN);

          console.log('✅ Figma 데일리 카드 전송 완료!\n');
        } catch (err) {
          console.error(`❌ Figma 데일리 에러: ${err.message}`);
          console.error(err.stack);
        }
  }
