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
import { generateTelegramBriefing, generateBlogDraft, generateXPost } from './generator.js';
import { sendTelegramMessage, broadcastBriefing } from './telegram.js';
import { exportFigmaBanner, sendTelegramPhoto, uploadMediaToX } from './figma-banner.js';
import { postToX } from './x-poster.js';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { generateYouTubeShort } from './youtube-shorts-generator.js';
import { uploadToYouTube as uploadYTShort, cleanupVideo } from './youtube-uploader-new.js';

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

// Step 8: YouTube Shorts (아침 8시만)
              if (isFirstRun) {
                              await runYouTubeShortsIfEnabled(data);
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
// YouTube Shorts 파이프라인
// ============================================================
async function runYouTubeShortsIfEnabled(data) {
            const ytEnabled = process.env.YT_CLIENT_ID && process.env.YT_REFRESH_TOKEN;
            if (!ytEnabled) {
                          console.log('\n⏭️ YouTube Shorts 스킵 (YT 환경변수 미설정)');
                          return;
            }
            console.log('\n🎬 YouTube Shorts 생성 중...');
            let videoPath = null;
            try {
                          // buildPayload from figmaDataBuilder (uses same data)
                          const { buildPayload } = await import('./figma-daily/runDailyFigma.js')
                                        .then(() => import('./canvas-banner.js'))
                                        .catch(() => ({}));

                          // Use the canvas-banner's payload builder as fallback
                          const payload = {
                                        texts: {
                                                      date_label: data.dateKST || new Date().toLocaleDateString('ko-KR'),
                                                      btc_price: data.market?.[0] ? `$${Math.round(data.market[0].price).toLocaleString('en-US')}` : '$--',
                                                      btc_change: data.market?.[0] ? `${parseFloat(data.market[0].change24h) >= 0 ? '+' : ''}${parseFloat(data.market[0].change24h).toFixed(2)}%` : '--',
                                                      eth_price: data.market?.[1] ? `$${Math.round(data.market[1].price).toLocaleString('en-US')}` : '$--',
                                                      eth_change: data.market?.[1] ? `${parseFloat(data.market[1].change24h) >= 0 ? '+' : ''}${parseFloat(data.market[1].change24h).toFixed(2)}%` : '--',
                                                      sol_price: data.market?.[2] ? `$${data.market[2].price.toFixed(1)}` : '$--',
                                                      sol_change: data.market?.[2] ? `${parseFloat(data.market[2].change24h) >= 0 ? '+' : ''}${parseFloat(data.market[2].change24h).toFixed(2)}%` : '--',
                                                      sui_price: data.market?.[3] ? `$${data.market[3].price.toFixed(3)}` : '$--',
                                                      sui_change: data.market?.[3] ? `${parseFloat(data.market[3].change24h) >= 0 ? '+' : ''}${parseFloat(data.market[3].change24h).toFixed(2)}%` : '--',
                                                      xrp_price: data.market?.[4] ? `$${data.market[4].price.toFixed(2)}` : '$--',
                                                      xrp_change: data.market?.[4] ? `${parseFloat(data.market[4].change24h) >= 0 ? '+' : ''}${parseFloat(data.market[4].change24h).toFixed(2)}%` : '--',
                                                      market_change: `MARKET ${data.global?.marketCapChange24h || '0'}%`,
                                                      kimchi_rate: data.kimchi ? `환율: ₩${data.kimchi.krwRate}/USDT` : '--',
                                                      kimchi_premium: data.kimchi?.premium ? `${data.kimchi.premium}%` : '0%',
                                                      kimchi_note: '정상 범위',
                                                      fear_value: String(data.fearGreed?.value || '--'),
                                                      fear_label: data.fearGreed?.label || '--',
                                                      fear_note: '시장 심리 확인 중',
                                                      defi_1_name: data.defi?.topByTVL?.[0]?.name || '--',
                                                      defi_1_change: `${parseFloat(data.defi?.topByTVL?.[0]?.change1d || 0).toFixed(2)}%`,
                                                      defi_2_name: data.defi?.topGainers?.[0]?.name || '--',
                                                      defi_2_change: `${parseFloat(data.defi?.topGainers?.[0]?.change1d || 0).toFixed(2)}%`,
                                                      defi_3_name: data.defi?.topLosers?.[0]?.name || '--',
                                                      defi_3_change: `${parseFloat(data.defi?.topLosers?.[0]?.change1d || 0).toFixed(2)}%`,
                                                      trend_1_name: data.trending?.[0] ? `${data.trending[0].symbol} (${data.trending[0].name})` : '--',
                                                      trend_1_change: `${parseFloat(data.trending?.[0]?.priceChange24h || 0).toFixed(2)}%`,
                                                      trend_2_name: data.trending?.[1] ? `${data.trending[1].symbol} (${data.trending[1].name})` : '--',
                                                      trend_2_change: `${parseFloat(data.trending?.[1]?.priceChange24h || 0).toFixed(2)}%`,
                                                      trend_3_name: data.trending?.[2] ? `${data.trending[2].symbol} (${data.trending[2].name})` : '--',
                                                      trend_3_change: `${parseFloat(data.trending?.[2]?.priceChange24h || 0).toFixed(2)}%`,
                                                      quote_line1: '코인이지와 함께 오늘도 이지하게',
                                                      quote_line2: '시장을 읽고, 기회를 잡자',
                                        },
                                        gauge: { fill_pct: parseInt(data.fearGreed?.value || 50) / 100 },
                                        colors: {},
                                        session: { type: 'morning', label: '아침', footer: '매일 아침 8시', cta: '오늘 하루도 현명한 투자 하세요' },
                          };

                          videoPath = await generateYouTubeShort(payload);
                          console.log(`  ✅ YouTube Short 영상 생성 완료: ${videoPath}`);

                          const videoUrl = await uploadYTShort(videoPath, payload, new Date());
                          console.log(`  ✅ YouTube 업로드 완료: ${videoUrl}`);

                          cleanupVideo(videoPath);
            } catch (ytErr) {
                          console.error(`  ❌ YouTube Shorts 에러: ${ytErr.message}`);
                          if (videoPath) { try { cleanupVideo(videoPath); } catch (_) {} }
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

// ============================================================
// Crash protection
// ============================================================
process.on('unhandledRejection', (reason, promise) => {
            console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
            console.error('⚠️ Uncaught Exception:', err.message);
            console.error(err.stack);
});
