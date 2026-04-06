/**
 * 코인이지 데일리 브리핑 봇 - 메인 오케스트레이터
 * 
 * 사용법:
 * npm start       → cron 모드 (매일 아침 자동 실행)
 * npm run briefing → 즉시 1회 실행
 * node src/index.js --run-now → 즉시 1회 실행
 * 
 * Railway 배포:
 *  환경변수 설정 후 npm start로 실행
 */

import cron from 'node-cron';
import { collectAllData } from './fetcher.js';
import { generateTelegramBriefing, generateBlogDraft } from './generator.js';
import { broadcastBriefing, sendTelegramMessage } from './telegram.js';
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
      console.log('\n📡 Step 1/4: 데이터 수집 중...');
        const data = await collectAllData();

      if (!data.market && !data.fearGreed && !data.kimchi) {
              console.error('❌ 핵심 데이터 수집 실패. 파이프라인 중단.');
              return;
      }

      // Step 2: 텔레그램 브리핑 생성
      console.log('\n✍️ Step 2/4: 텔레그램 브리핑 생성 중...');
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
      console.log('\n📤 Step 3/4: 텔레그램 발송 중...');
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

      // Step 4: 네이버 블로그 초안 생성 + 텔레그램 발송
      if (CONFIG.saveBlogDraft) {
              console.log('\n📝 Step 4/4: 네이버 블로그 초안 생성 중...');
              const blogDraft = await generateBlogDraft(data, telegramBriefing);

          if (blogDraft) {
                    // 4-a: 파일 저장 (로컬/컨테이너)
                const draftsDir = './drafts';
                    if (!existsSync(draftsDir)) await mkdir(draftsDir, { recursive: true });

                const dateStr = new Date().toISOString().split('T')[0];
                    const filename = `${draftsDir}/blog_${dateStr}.md`;
                    await writeFile(filename, blogDraft, 'utf-8');
                    console.log(`  ✅ 블로그 초안 저장: ${filename}`);

                // 4-b: 블로그 초안도 텔레그램으로 발송
                if (CONFIG.botToken && CONFIG.channelId) {
                            console.log('  📤 블로그 초안 텔레그램 발송 중...');
                            const header = `📝 *네이버 블로그 초안* (${dateStr})\n${'─'.repeat(30)}\n\n`;
                            const draftMessage = header + blogDraft;

                      const draftSent = await sendTelegramMessage(
                                    draftMessage,
                                    CONFIG.channelId,
                                    CONFIG.botToken
                                  );
                            console.log(`  ${draftSent ? '✅' : '❌'} 블로그 초안 텔레그램 발송 ${draftSent ? '완료' : '실패'}`);
                }
          } else {
                    console.log('  ⚠️ 블로그 초안 생성 실패');
          }
      } else {
              console.log('\n⏭️ Step 4/4: 블로그 초안 스킵 (비활성화)');
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
