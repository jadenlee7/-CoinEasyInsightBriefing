/**
 * 코인이지 데일리 브리핑 봇 - 메인 오케스트레이터
 *
 * 하루 4회 실행: 08:00, 12:00, 18:00, 21:00 KST
 * - 텔레그램 공지 채널 + 개인톡 발송
 * - X (Twitter) 포스팅
 * - YouTube Shorts: 아침 8시에만 1회 생성
 *
 * 사용법:
 *   npm start        → cron 모드 (하루 4회 자동 실행)
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
import { exportFigmaBanner, sendTelegramPhoto, uploadMediaToX } from './figma-banner.js';
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
            botToken:     process.env.TELEGRAM_BOT_TOKEN,
            channelId:    process.env.TELEGRAM_CHANNEL_ID,
            chatId:       process.env.TELEGRAM_CHAT_ID || '',
            saveBlogDraft:      process.env.SAVE_BLOG_DRAFT !== 'false',
            enableXPost:        process.env.ENABLE_X_POST !== 'false',
            enableYouTube:      process.env.ENABLE_YOUTUBE !== 'false',
            enableFigmaBanner:  true,  // canvas fallback when Figma API unavailable
            debug:              process.env.DEBUG === 'true',
};

// 하루 4회 스케줄 (KST 시간)
const SCHEDULE_HOURS_KST = [8, 12, 18, 21];

// ============================================================
// 메인 브리핑 파이프라인
// isFirstRun: 아침 8시 실행인지 여부 (YouTube Shorts는 아침에만)
// ============================================================
async function runBriefingPipeline(isFirstRun = false) {
            const startTime = Date.now();
            const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
            const kstHour = kstNow.getUTCHours();
            const kstTimeStr = `${kstHour}:${String(kstNow.getUTCMinutes()).padStart(2, '0')} KST`;

  console.log('\n' + '='.repeat(60));
            console.log(`🌅 코인이지 브리핑 파이프라인 시작 (${kstTimeStr})`);
            console.log('='.repeat(60));

  try {
                // Step 1: 데이터 수집
              console.log('\n📡 Step 1/7: 데이터 수집 중...');
                const data = await collectAllData();
                if (!data.market && !data.fearGreed && !data.kimchi) {
                                console.error('❌ 핵심 데이터 수집 실패. 파이프라인 중단.');
                                return;
                }

              // Step 2: 텔레그램 브리핑 생성
              console.log('\n✍️ Step 2/7: 텔레그램 브리핑 생성 중...');
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

              // Step 3: Figma 배너 Export
              let bannerData = null;
                if (CONFIG.enableFigmaBanner) {
                                console.log('\n🎨 Step 3/7: Figma 배너 Export 중...');
                                bannerData = await exportFigmaBanner(data);
                                if (bannerData) {
                                                  console.log(` ✅ 배너 Export 완료 (${(bannerData.size / 1024).toFixed(1)}KB)`);
                                } else {
                                                  console.log(' ⚠️ 배너 Export 실패 — 텍스트만 발송');
                                }
                } else {
                                console.log('\n⏭️ Step 3/7: Figma 배너 스킵 (FIGMA_TOKEN 미설정)');
                }

              // Step 4a: 텔레그램 발송 — 공지 채널 (@coiniseasy)
              console.log('\n📤 Step 4/7: 텔레그램 발송 중...');
                if (CONFIG.channelId && CONFIG.botToken) {
                                console.log(` 📢 공지 채널 발송: ${CONFIG.channelId}`);
                                if (bannerData && bannerData.buffer) {
                                                  const channelPhotoOk = await sendTelegramPhoto(
                                                                      bannerData.buffer,
                                                                      telegramBriefing,
                                                                      CONFIG.channelId,
                                                                      CONFIG.botToken
                                                                    );
                                                  console.log(`   ${channelPhotoOk ? '✅' : '❌'} 채널 배너+브리핑: ${CONFIG.channelId}`);
                                                  if (telegramBriefing.length > 1020) {
                                                                      await sendTelegramMessage(telegramBriefing, CONFIG.channelId, CONFIG.botToken);
                                                                      console.log(`   ✅ 채널 전체 브리핑 텍스트 추가 발송`);
                                                  }
                                } else {
                                                  const chOk = await sendTelegramMessage(telegramBriefing, CONFIG.channelId, CONFIG.botToken);
                                                  console.log(`   ${chOk ? '✅' : '❌'} 채널 텍스트 발송: ${CONFIG.channelId}`);
                                }
                } else {
                                console.log(' ⚠️ TELEGRAM_CHANNEL_ID 미설정 - 채널 발송 스킵');
                }

              // Step 4b: 텔레그램 발송 — 개인톡
              if (CONFIG.chatId && CONFIG.botToken) {
                              console.log(` 💬 개인톡 발송: ${CONFIG.chatId}`);
                              if (bannerData && bannerData.buffer) {
                                                const photoSuccess = await sendTelegramPhoto(
                                                                    bannerData.buffer,
                                                                    telegramBriefing,
                                                                    CONFIG.chatId,
                                                                    CONFIG.botToken
                                                                  );
                                                console.log(`   ${photoSuccess ? '✅' : '❌'} 개인톡 배너+브리핑: ${CONFIG.chatId}`);
                                                if (telegramBriefing.length > 1020) {
                                                                    await sendTelegramMessage(telegramBriefing, CONFIG.chatId, CONFIG.botToken);
                                                                    console.log(`   ✅ 전체 브리핑 텍스트 추가 발송`);
                                                }
                              } else {
                                                const success = await sendTelegramMessage(telegramBriefing, CONFIG.chatId, CONFIG.botToken);
                                                console.log(`   ${success ? '✅' : '❌'} 개인톡 텍스트 발송: ${CONFIG.chatId}`);
                              }
              } else {
                              console.log(' ⚠️ TELEGRAM_CHAT_ID 미설정 - 개인톡 발송 스킵');
              }

              // Step 5: 네이버 블로그 초안 저장 (아침 8시만)
              if (CONFIG.saveBlogDraft && isFirstRun) {
                              console.log('\n📝 Step 5/7: 네이버 블로그 초안 생성 중...');
                              const blogDraft = await generateBlogDraft(data, telegramBriefing);
                              if (blogDraft) {
                                                const draftsDir = './drafts';
                                                if (!existsSync(draftsDir)) await mkdir(draftsDir, { recursive: true });
                                                const dateStr = new Date().toISOString().split('T')[0];
                                                const filename = `${draftsDir}/blog_${dateStr}.md`;
                                                await writeFile(filename, blogDraft, 'utf-8');
                                                console.log(` ✅ 블로그 초안 저장: ${filename}`);

                                if (CONFIG.chatId && CONFIG.botToken) {
                                                    const blogHeader = `📝 *네이버 블로그 초안* (${dateStr})\n${'─'.repeat(30)}\n\n`;
                                                    const blogMessage = blogHeader + blogDraft;
                                                    const blogSent = await sendTelegramMessage(blogMessage, CONFIG.chatId, CONFIG.botToken);
                                                    console.log(` ${blogSent ? '✅' : '❌'} 블로그 초안 개인톡 전송`);
                                }
                              } else {
                                                console.log(' ⚠️ 블로그 초안 생성 실패');
                              }
              } else if (!isFirstRun) {
                              console.log('\n⏭️ Step 5/7: 블로그 초안 스킵 (아침 실행 아님)');
              } else {
                              console.log('\n⏭️ Step 5/7: 블로그 초안 스킵 (비활성화)');
              }

              // Step 6: X (Twitter) 자동 포스팅 (매 실행마다)
              if (CONFIG.enableXPost) {
                              console.log('\n🐦 Step 6/7: X 포스팅 중...');
                              try {
                                                const xPostText = await generateXPost(data, telegramBriefing);
                                                if (xPostText) {
                                                                    console.log(` 📝 생성된 트윗 (${xPostText.length}자):`);
                                                                    console.log(` "${xPostText.substring(0, 100)}..."`);

                                                  let mediaId = null;
                                                                    if (bannerData && bannerData.buffer) {
                                                                                          mediaId = await uploadMediaToX(bannerData.buffer);
                                                                    }

                                                  const tweetResult = await postToX(xPostText, mediaId);
                                                                    if (tweetResult.success) {
                                                                                          console.log(` ✅ X 포스팅 완료! ID: ${tweetResult.tweetId}${mediaId ? ' (배너 첨부)' : ''}`);
                                                                    } else {
                                                                                          console.log(` ❌ X 포스팅 실패: ${tweetResult.error}`);
                                                                    }
                                                } else {
                                                                    console.log(' ⚠️ X 포스트 생성 실패');
                                                }
                              } catch (xErr) {
                                                console.error(` ❌ X 포스팅 에러: ${xErr.message}`);
                              }
              } else {
                              console.log('\n⏭️ Step 6/7: X 포스팅 스킵 (비활성화)');
              }

              // Step 7: YouTube Shorts (아침 8시만)
              if (CONFIG.enableYouTube && isFirstRun) {
                              console.log('\n🎬 Step 7/7: YouTube Shorts 생성 중...');
                              try {
                                                const shortsScript = await generateShortsScript(data, telegramBriefing);
                                                if (shortsScript) {
                                                                    console.log(` 📝 나레이션: ${shortsScript.narration?.substring(0, 50)}...`);
                                                                    const videoPath = await createShortsVideo(shortsScript, data);
                                                                    if (videoPath) {
                                                                                          const uploadResult = await uploadToYouTube(videoPath, { title: shortsScript.title });
                                                                                          if (uploadResult.success) {
                                                                                                                  console.log(` ✅ YouTube 업로드 완료! ${uploadResult.videoUrl}`);
                                                                                                                  console.log(` 🔒 비공개 상태 (수동 공개 필요)`);
                                                                                                    } else {
                                                                                                                  console.log(` ❌ YouTube 업로드 실패: ${uploadResult.error}`);
                                                                                                    }
                                                                                          await cleanupTempFiles();
                                                                    } else {
                                                                                          console.log(' ⚠️ 영상 생성 실패');
                                                                    }
                                                } else {
                                                                    console.log(' ⚠️ 쇼츠 스크립트 생성 실패');
                                                }
                              } catch (ytErr) {
                                                console.error(` ❌ YouTube Shorts 에러: ${ytErr.message}`);
                              }
              } else if (!isFirstRun) {
                              console.log('\n⏭️ Step 7/7: YouTube Shorts 스킵 (아침 실행 아님)');
              } else {
                              console.log('\n⏭️ Step 7/7: YouTube Shorts 스킵 (비활성화)');
              }

              // 완료
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log('\n' + '='.repeat(60));
                console.log(`✅ 파이프라인 완료! (${elapsed}초) [${kstTimeStr}]`);
                console.log('='.repeat(60) + '\n');

              if (CONFIG.debug) {
                              const logsDir = './logs';
                              if (!existsSync(logsDir)) await mkdir(logsDir, { recursive: true });
                              const dateStr = new Date().toISOString().split('T')[0];
                              await writeFile(`${logsDir}/data_${dateStr}.json`, JSON.stringify(data, null, 2), 'utf-8');
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
            console.log('🚀 즉시 실행 모드');
            runBriefingPipeline(true).then(() => {
                          console.log('프로세스 종료');
                          process.exit(0);
            });
} else {
            // 하루 4회 스케줄 등록: 8:00, 12:00, 18:00, 21:00 KST
  const scheduleInfo = SCHEDULE_HOURS_KST.map(kstH => {
                const utcH = (kstH - 9 + 24) % 24;
                const cronExpr = `0 ${utcH} * * *`;
                const isFirst = (kstH === 8);
                cron.schedule(cronExpr, () => {
                                console.log(`\n⏰ Cron 트리거 ${kstH}:00 KST (${new Date().toISOString()})`);
                                runBriefingPipeline(isFirst);
                });
                return `${kstH}:00 KST → cron: ${cronExpr} UTC${isFirst ? ' (풀 파이프라인)' : ''}`;
  });

  console.log('🤖 코인이지 데일리 브리핑 봇 가동!');
            console.log('');
            console.log('⏰ 스케줄 (하루 4회):');
            scheduleInfo.forEach(s => console.log(`   ${s}`));
            console.log('');
            console.log(`📢 채널: ${CONFIG.channelId || '미설정'}`);
            console.log(`💬 채팅방: ${CONFIG.chatId || '미설정'}`);
            console.log(`📝 블로그 초안: ${CONFIG.saveBlogDraft ? '활성화' : '비활성화'}`);
            console.log(`🐦 X 포스팅: ${CONFIG.enableXPost ? '활성화' : '비활성화'}`);
            console.log(`🎬 YouTube Shorts: ${CONFIG.enableYouTube ? '활성화' : '비활성화'}`);
            console.log(`🎨 Figma 배너: ${CONFIG.enableFigmaBanner ? '활성화' : '비활성화'}`);
            console.log('');

  console.log('💤 다음 실행 대기 중... (Ctrl+C로 종료)\n');

  // 시작 시 1회 테스트 실행 (풀 파이프라인)
  runBriefingPipeline(true);
}
