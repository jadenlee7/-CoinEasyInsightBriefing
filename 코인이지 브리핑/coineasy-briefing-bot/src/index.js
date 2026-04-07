/**
 * 코인이지 데일리 브리핑 봇 - 메인 오케스트레이터
 *
 * 사용법:
 *   npm start      → cron 모드 (매일 아침 자동 실행)
 *   npm run briefing → 즉시 1회 실행
 *   node src/index.js --run-now → 즉시 1회 실행
 *
 * Railway 배포:
 *   환경변수 설정 후 npm start로 실행
 */

import cron from 'node-cron';
import { collectAllData } from './fetcher.js';
import { generateTelegramBriefing, generateBlogDraft, generateXPost, generateShortsScript } from './generator.js';
    import { sendTelegramMessage, broadcastBriefing } from './telegram.js';
import { postToX } from './x-poster.js';
import { createShortsVideo, cleanupTempFiles } from './video-generator.js';
import { uploadToYouTube } from './youtube-uploader.js';
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
        enableXPost: process.env.ENABLE_X_POST !== 'false',
        enableYouTube: process.env.ENABLE_YOUTUBE !== 'false',
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
          console.log('\n📡 Step 1/6: 데이터 수집 중...');
            const data = await collectAllData();
            if (!data.market && !data.fearGreed && !data.kimchi) {
                        console.error('❌ 핵심 데이터 수집 실패. 파이프라인 중단.');
                        return;
            }

          // Step 2: 텔레그램 브리핑 생성
          console.log('\n✍️ Step 2/6: 텔레그램 브리핑 생성 중...');
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

                  // Step 3: 텔레그램 발송 (개인톡만)
                  console.log('\n📤 Step 3/6: 텔레그램 발송 중 (개인톡)...');
                  if (CONFIG.chatId && CONFIG.botToken) {
                                      const success = await sendTelegramMessage(
                                                              telegramBriefing,
                                                              CONFIG.chatId,
                                                              CONFIG.botToken
                                                          );
                                      console.log(`  ${success ? '✅' : '❌'} 개인톡 발송: ${CONFIG.chatId}`);
                  } else {
                                      console.log('  ⚠️ TELEGRAM_CHAT_ID 미설정 - 개인톡 발송 스킵');
                  }

          // Step 4: 네이버 블로그 초안 저장 (파일만)
          if (CONFIG.saveBlogDraft) {
                      console.log('\n📝 Step 4/6: 네이버 블로그 초안 생성 중...');
                      const blogDraft = await generateBlogDraft(data, telegramBriefing);
                      if (blogDraft) {
                                    const draftsDir = './drafts';
                                    if (!existsSync(draftsDir)) await mkdir(draftsDir, { recursive: true });
                                    const dateStr = new Date().toISOString().split('T')[0];
                                    const filename = `${draftsDir}/blog_${dateStr}.md`;
                                    await writeFile(filename, blogDraft, 'utf-8');
                                    console.log(`  ✅ 블로그 초안 저장: ${filename}`);

                                                  // 블로그 초안을 개인톡으로 전송
                                                  if (CONFIG.chatId && CONFIG.botToken) {
                                                                                  const blogHeader = `📝 *네이버 블로그 초안* (${dateStr})\n${'─'.repeat(30)}\n\n`;
                                                                                  const blogMessage = blogHeader + blogDraft;
                                                                                  const blogSent = await sendTelegramMessage(
                                                                                                                      blogMessage,
                                                                                                                      CONFIG.chatId,
                                                                                                                      CONFIG.botToken
                                                                                                                  );
                                                                                  console.log(`  ${blogSent ? '✅' : '❌'} 블로그 초안 개인톡 전송`);
                                                  }
                      } else {
                                    console.log('  ⚠️ 블로그 초안 생성 실패');
                      }
          } else {
                      console.log('\n⏭️ Step 4/6: 블로그 초안 스킵 (비활성화)');
          }

          // Step 5: X (Twitter) 자동 포스팅
          if (CONFIG.enableXPost) {
                      console.log('\n🐦 Step 5/6: X 포스팅 중...');
                      try {
                                    const xPostText = await generateXPost(data, telegramBriefing);
                                    if (xPostText) {
                                                    console.log(`  📝 생성된 트윗 (${xPostText.length}자):`);
                                                    console.log(`  "${xPostText.substring(0, 100)}..."`);
                                                    const tweetResult = await postToX(xPostText);
                                                    if (tweetResult.success) {
                                                                      console.log(`  ✅ X 포스팅 완료! ID: ${tweetResult.tweetId}`);
                                                    } else {
                                                                      console.log(`  ❌ X 포스팅 실패: ${tweetResult.error}`);
                                                    }
                                    } else {
                                                    console.log('  ⚠️ X 포스트 생성 실패');
                                    }
                      } catch (xErr) {
                                    console.error(`  ❌ X 포스팅 에러: ${xErr.message}`);
                      }
          } else {
                      console.log('\n⏭️ Step 5/6: X 포스팅 스킵 (비활성화)');
          }

          // Step 6: YouTube Shorts 자동 생성 + 업로드
          if (CONFIG.enableYouTube) {
                      console.log('\n🎬 Step 6/6: YouTube Shorts 생성 중...');
                      try {
                                    // 6-1: 쇼츠 스크립트 생성
                        const shortsScript = await generateShortsScript(data, telegramBriefing);
                                    if (shortsScript) {
                                                    console.log(`  📝 나레이션: ${shortsScript.narration?.substring(0, 50)}...`);

                                      // 6-2: 영상 생성 (TTS + FFmpeg)
                                      const videoPath = await createShortsVideo(shortsScript, data);
                                                    if (videoPath) {
                                                                      // 6-3: YouTube 업로드 (비공개)
                                                      const uploadResult = await uploadToYouTube(videoPath, {
                                                                          title: shortsScript.title,
                                                      });
                                                                      if (uploadResult.success) {
                                                                                          console.log(`  ✅ YouTube 업로드 완료! ${uploadResult.videoUrl}`);
                                                                                          console.log(`  🔒 비공개 상태 (수동 공개 필요)`);
                                                                      } else {
                                                                                          console.log(`  ❌ YouTube 업로드 실패: ${uploadResult.error}`);
                                                                      }

                                                      // 임시 파일 정리
                                                      await cleanupTempFiles();
                                                    } else {
                                                                      console.log('  ⚠️ 영상 생성 실패');
                                                    }
                                    } else {
                                                    console.log('  ⚠️ 쇼츠 스크립트 생성 실패');
                                    }
                      } catch (ytErr) {
                                    console.error(`  ❌ YouTube Shorts 에러: ${ytErr.message}`);
                      }
          } else {
                      console.log('\n⏭️ Step 6/6: YouTube Shorts 스킵 (비활성화)');
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
        console.log(`🐦 X 포스팅: ${CONFIG.enableXPost ? '활성화' : '비활성화'}`);
        console.log(`🎬 YouTube Shorts: ${CONFIG.enableYouTube ? '활성화' : '비활성화'}`);
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
