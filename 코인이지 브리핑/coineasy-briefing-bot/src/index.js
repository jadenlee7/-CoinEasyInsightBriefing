/**
 * 코인이지 데일리 브리핑 봇 - 메인 오케스트레이터
 *
 * 사용법:
 *   npm start    → cron 모드 (매일 아침 자동 실행)
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
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      channelId: process.env.TELEGRAM_CHANNEL_ID,
      chatId: process.env.TELEGRAM_CHAT_ID || '',
      briefingHour: parseInt(process.env.BRIEFING_HOUR_KST || '8'),
      briefingMinute: parseInt(process.env.BRIEFING_MINUTE_KST || '0'),
      saveBlogDraft: process.env.SAVE_BLOG_DRAFT !== 'false',
      enableXPost: process.env.ENABLE_X_POST !== 'false',
      enableYouTube: process.env.ENABLE_YOUTUBE !== 'false',
      enableFigmaBanner: process.env.FIGMA_TOKEN ? true : false,
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
                    bannerData = await exportFigmaBanner();
                    if (bannerData) {
                                console.log(`  ✅ 배너 Export 완료 (${(bannerData.size / 1024).toFixed(1)}KB)`);
                    } else {
                                console.log('  ⚠️ 배너 Export 실패 — 텍스트만 발송');
                    }
          } else {
                    console.log('\n⏭️ Step 3/7: Figma 배너 스킵 (FIGMA_TOKEN 미설정)');
          }

        // Step 4: 텔레그램 발송 (코인이지 공지방)
        console.log('\n📤 Step 4/7: 텔레그램 발송 중 (공지방)...');
          if (CONFIG.channelId && CONFIG.botToken) {
                    // 배너 이미지가 있으면 사진+캡션으로 발송
            if (bannerData && bannerData.buffer) {
                        const photoSuccess = await sendTelegramPhoto(
                                      bannerData.buffer,
                                      telegramBriefing,
                                      CONFIG.channelId,
                                      CONFIG.botToken
                                    );
                        console.log(`  ${photoSuccess ? '✅' : '❌'} 공지방 배너+브리핑 발송: ${CONFIG.channelId}`);

                      // 캡션이 1024자 넘으면 나머지는 텍스트로 추가 발송
                      if (telegramBriefing.length > 1020) {
                                    await sendTelegramMessage(
                                                    telegramBriefing,
                                                    CONFIG.channelId,
                                                    CONFIG.botToken
                                                  );
                                    console.log(`  ✅ 전체 브리핑 텍스트 추가 발송`);
                      }
            } else {
                        // 배너 없으면 텍스트만 발송
                      const success = await sendTelegramMessage(
                                    telegramBriefing,
                                    CONFIG.channelId,
                                    CONFIG.botToken
                                  );
                        console.log(`  ${success ? '✅' : '❌'} 공지방 텍스트 발송: ${CONFIG.channelId}`);
            }
          } else {
                    console.log('  ⚠️ TELEGRAM_CHANNEL_ID 미설정 - 공지방 발송 스킵');
          }

        // Step 5: 네이버 블로그 초안 저장 + 개인톡 전송
        if (CONFIG.saveBlogDraft) {
                  console.log('\n📝 Step 5/7: 네이버 블로그 초안 생성 중...');
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
                  console.log('\n⏭️ Step 5/7: 블로그 초안 스킵 (비활성화)');
        }

        // Step 6: X (Twitter) 자동 포스팅 (배너 이미지 첨부)
        if (CONFIG.enableXPost) {
                  console.log('\n🐦 Step 6/7: X 포스팅 중...');
                  try {
                              const xPostText = await generateXPost(data, telegramBriefing);
                              if (xPostText) {
                                            console.log(`  📝 생성된 트윗 (${xPostText.length}자):`);
                                            console.log(`  "${xPostText.substring(0, 100)}..."`);

                                // 배너 이미지가 있으면 미디어 첨부
                                let mediaId = null;
                                            if (bannerData && bannerData.buffer) {
                                                            mediaId = await uploadMediaToX(bannerData.buffer);
                                            }

                                const tweetResult = await postToX(xPostText, mediaId);
                                            if (tweetResult.success) {
                                                            console.log(`  ✅ X 포스팅 완료! ID: ${tweetResult.tweetId}${mediaId ? ' (배너 첨부)' : ''}`);
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
                  console.log('\n⏭️ Step 6/7: X 포스팅 스킵 (비활성화)');
        }

        // Step 7: YouTube Shorts 자동 생성 + 업로드
        if (CONFIG.enableYouTube) {
                  console.log('\n🎬 Step 7/7: YouTube Shorts 생성 중...');
                  try {
                              const shortsScript = await generateShortsScript(data, telegramBriefing);
                              if (shortsScript) {
                                            console.log(`  📝 나레이션: ${shortsScript.narration?.substring(0, 50)}...`);
                                            const videoPath = await createShortsVideo(shortsScript, data);
                                            if (videoPath) {
                                                            const uploadResult = await uploadToYouTube(videoPath, {
                                                                              title: shortsScript.title,
                                                            });
                                                            if (uploadResult.success) {
                                                                              console.log(`  ✅ YouTube 업로드 완료! ${uploadResult.videoUrl}`);
                                                                              console.log(`  🔒 비공개 상태 (수동 공개 필요)`);
                                                            } else {
                                                                              console.log(`  ❌ YouTube 업로드 실패: ${uploadResult.error}`);
                                                            }
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
                  console.log('\n⏭️ Step 7/7: YouTube Shorts 스킵 (비활성화)');
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
      // Cron 모드 - 아침 / 점심 / 저녁 (KST) — node-cron timezone 옵션 사용
  const schedules = [
    { label: '아침', cron: '0 8 * * *' },   // 08:00 KST
    { label: '점심', cron: '0 12 * * *' },  // 12:00 KST
    { label: '저녁', cron: '0 18 * * *' },  // 18:00 KST
  ];

  console.log('🤖 코인이지 데일리 브리핑 봇 가동!');
      console.log(`⏰ 스케줄: ${schedules.map(s => `${s.label}(${s.cron} KST)`).join(', ')}`);
      console.log(`📢 공지방 (브리핑): ${CONFIG.channelId || '미설정'}`);
      console.log(`💬 개인 DM (블로그 초안): ${CONFIG.chatId || '미설정'}`);
      console.log(`📝 블로그 초안: ${CONFIG.saveBlogDraft ? '활성화' : '비활성화'}`);
      console.log(`🐦 X 포스팅: ${CONFIG.enableXPost ? '활성화' : '비활성화'}`);
      console.log(`🎬 YouTube Shorts: ${CONFIG.enableYouTube ? '활성화' : '비활성화'}`);
      console.log(`🎨 Figma 배너: ${CONFIG.enableFigmaBanner ? '활성화' : '비활성화'}`);
      console.log('');

  for (const s of schedules) {
    cron.schedule(s.cron, () => {
            console.log(`\n⏰ Cron 트리거 [${s.label}] (${new Date().toISOString()})`);
            runBriefingPipeline();
    }, { timezone: 'Asia/Seoul' });
  }

  // Railway에서 프로세스 유지
  console.log('💤 다음 실행 대기 중... (Ctrl+C로 종료)\n');

  // 시작 시 자동 실행은 기본 비활성화 (Railway 재시작 루프로 인한 중복 발송 방지).
  // 환경변수 RUN_ON_START=true 일 때만 시작 시 1회 실행 (테스트/즉시 발송용).
  // 사용법: Railway 대시보드 → Variables → RUN_ON_START=true 추가 → 재배포 →
  //         공지방에 1회 발송 확인 후 변수 삭제(또는 false 로 변경).
  if (process.env.RUN_ON_START === 'true') {
    console.log('🚀 RUN_ON_START=true → 시작 시 1회 실행');
    runBriefingPipeline();
  }
}
