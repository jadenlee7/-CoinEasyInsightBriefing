/**
 * 코인이지 데일리 브리핑 봇 - 메인 오케스트레이터
 *
 * 사용법:
 *   npm start             → cron 모드 (매일 아침 자동 실행)
 *   npm run briefing      → 즉시 1회 실행
 *   node src/index.js --run-now  → 즉시 1회 실행
 *
 * Railway 배포:
 *   환경변수 설정 후 npm start로 실행
 */

import cron from 'node-cron';
import { collectAllData } from './fetcher.js';
import { generateTelegramBriefing, generateBlogDraft } from './generator.js';
import { broadcastBriefing } from './telegram.js';
import { publishFigmaContent } from './figma-content.js';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// ============================================================
// 환경변수 로드
// ============================================================
const CONFIG = {
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    channelId: process.env.TELEGRAM_CHANNEL_ID,
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    briefingHour: parseInt(process.env.BRIEFING_HOUR_KST || '8'),
    briefingMinute: parseInt(process.env.BRIEFING_MINUTE_KST || '0'),
    saveBlogDraft: process.env.SAVE_BLOG_DRAFT !== 'false',
    debug: process.env.DEBUG === 'true',
};

// ============================================================
// 메인 브리핑 파이프라인
// ============================================================
async function runBriefingPipeline() {
    const startTime = Date.now();
    console.log('\n' + '='.repeat(60));
    console.log('🌅 코인이지 데일리 브리핑 파이프라인 시작');
    console.log('='.repeat(60));

  try {
        // Step 1: 데이터 수집
      console.log('\n📡 Step 1/5: 데이터 수집 중...');
        const data = await collectAllData();
        if (!data.market && !data.fearGreed && !data.kimchi) {
                console.error('❌ 핵심 데이터 수집 실패. 파이프라인 중단.');
                return;
        }

      // Step 2: 텔레그램 브리핑 생성
      console.log('\n✍️  Step 2/5: 텔레그램 브리핑 생성 중...');
        const telegramBriefing = await generateTelegramBriefing(data);
        if (!telegramBriefing) {
                console.error('❌ 브리핑 생성 실패. 파이프라인 중단.');
                return;
        }

      if (CONFIG.debug) {
              console.log('\n--- 텔레그램 브리핑 미리보기 ---');
              console.log(telegramBriefing);
              console.log('--- 미리보기 끝 ---\n');
      }

      // Step 3: 텔레그램 발송
      console.log('\n📤 Step 3/5: 텔레그램 발송 중...');
        const channels = [CONFIG.channelId, CONFIG.chatId].filter(Boolean);
        if (channels.length > 0 && CONFIG.botToken) {
                const results = await broadcastBriefing(
                          telegramBriefing,
                          CONFIG.botToken,
                          channels
                        );
                results.forEach(r => {
                          console.log(`  ${r.success ? '✅' : '❌'} ${r.chatId}`);
                });
        } else {
                console.log('  ⚠️ 텔레그램 미설정 - 발송 스킵');
        }

      // Step 4: 네이버 블로그 초안 저장
      if (CONFIG.saveBlogDraft) {
              console.log('\n📝 Step 4/5: 네이버 블로그 초안 생성 중...');
              const blogDraft = await generateBlogDraft(data, telegramBriefing);
              if (blogDraft) {
                        const draftsDir = './drafts';
                        if (!existsSync(draftsDir)) await mkdir(draftsDir, { recursive: true });
                        const dateStr = new Date().toISOString().split('T')[0];
                        const filename = `${draftsDir}/blog_${dateStr}.md`;
                        await writeFile(filename, blogDraft, 'utf-8');
                        console.log(`  ✅ 블로그 초안 저장: ${filename}`);
              } else {
                        console.log('  ⚠️ 블로그 초안 생성 실패');
              }
      } else {
              console.log('\n⏭️  Step 4/5: 블로그 초안 스킵 (비활성화)');
      }

      // Step 5: Figma 콘텐츠 카드 게시 (텔레그램 + 인스타그램)
      if (process.env.FIGMA_TOKEN) {
              console.log('\n🖼️  Step 5/5: Figma 콘텐츠 카드 게시...');
              try {
                        // Fear & Greed 지수가 있으면 해당 카드 자동 게시
                if (data.fearGreed) {
                            const fgValue = data.fearGreed.value || '';
                            const fgClass = data.fearGreed.classification || '';
                            const fgCaption = `📊 Fear & Greed Index: ${fgValue}\n상태: ${fgClass}\n\n#코인이지 #FearAndGreed`;
                            await publishFigmaContent('fear-greed', fgCaption);
                }
                        // 비트코인 공급 분석 카드도 함께 게시
                // await publishFigmaContent('btc-supply-crunch');
              } catch (figmaErr) {
                        console.error(`  ⚠️ Figma 콘텐츠 게시 오류: ${figmaErr.message}`);
              }
      } else {
              console.log('\n⏭️  Step 5/5: Figma 콘텐츠 스킵 (FIGMA_TOKEN 미설정)');
      }

      // 완료
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('\n' + '='.repeat(60));
        console.log(`✅ 파이프라인 완료! (${elapsed}초)`);
        console.log('='.repeat(60) + '\n');

      // 원본 데이터 로그 저장 (디버그용)
      if (CONFIG.debug) {
              const logsDir = './logs';
              if (!existsSync(logsDir)) await mkdir(logsDir, { recursive: true });
              const dateStr = new Date().toISOString().split('T')[0];
              await writeFile(
                        `${logsDir}/data_${dateStr}.json`,
                        JSON.stringify(data, null, 2),
                        'utf-8'
                      );
      }
  } catch (err) {
        console.error(`\n❌ 파이프라인 에러: ${err.message}`);
        console.error(err.stack);
  }
}

// ============================================================
// 시작
// ============================================================
const runNow = process.argv.includes('--run-now');

if (runNow) {
    // 즉시 실행 모드
  console.log('🚀 즉시 실행 모드');
    runBriefingPipeline().then(() => {
          console.log('프로세스 종료');
          process.exit(0);
    });
} else {
    // Cron 모드 - KST를 UTC로 변환
  const utcHour = (CONFIG.briefingHour - 9 + 24) % 24; // KST → UTC
  const cronExpression = `${CONFIG.briefingMinute} ${utcHour} * * *`;

  console.log('🤖 코인이지 데일리 브리핑 봇 가동!');
    console.log(`⏰ 스케줄: 매일 ${CONFIG.briefingHour}:${String(CONFIG.briefingMinute).padStart(2, '0')} KST (cron: ${cronExpression} UTC)`);
    console.log(`📢 채널: ${CONFIG.channelId || '미설정'}`);
    console.log(`💬 채팅방: ${CONFIG.chatId || '미설정'}`);
    console.log(`📝 블로그 초안: ${CONFIG.saveBlogDraft ? '활성화' : '비활성화'}`);
    console.log(`🖼️  Figma 콘텐츠: ${process.env.FIGMA_TOKEN ? '활성화' : '미설정'}`);
    console.log('');

  cron.schedule(cronExpression, () => {
        console.log(`\n⏰ Cron 트리거 (${new Date().toISOString()})`);
        runBriefingPipeline();
  });

  // Railway에서 프로세스 유지
  console.log('💤 다음 실행 대기 중... (Ctrl+C로 종료)\n');

  // 시작 시 1회 테스트 실행 (선택사항 - 주석 해제하면 시작시 바로 실행)
  // runBriefingPipeline();
}
