/**
 * 코인이지 데일리 브리핑 봇 - 메인 오케스트레이터
 *
 * 하루 4회 실행: 08:00, 12:00, 18:00, 21:00 KST
 * - 텔레그램 공지 채널 + 개인톡 발송
 * - Typefully 포스팅 (X + LinkedIn + Threads)
 * - YouTube Shorts: 아침 8시에만 1회 생성
 */

import cron from 'node-cron';
import { collectAllData } from './fetcher.js';
import { generateTelegramBriefing, generateBlogDraft, generateXPost, generateShortsScript } from './generator.js';
import { sendTelegramMessage, broadcastBriefing } from './telegram.js';
import { exportFigmaBanner, sendTelegramPhoto } from './figma-banner.js';
import { createShortsVideo, cleanupTempFiles } from './video-generator.js';
import { uploadToYouTube } from './youtube-uploader.js';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { runDailyFigma } from './figma-daily/runDailyFigma.js';

// Typefully API v2
const TYPEFULLY_API_KEY = process.env.TYPEFULLY_API_KEY || '';
const TYPEFULLY_SOCIAL_SET_ID = '235004';
const TYPEFULLY_API_BASE = 'https://api.typefully.com';

const CONFIG = {
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    channelId: process.env.TELEGRAM_CHANNEL_ID,
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    saveBlogDraft: process.env.SAVE_BLOG_DRAFT !== 'false',
    enableTypefully: !!TYPEFULLY_API_KEY,
    enableYouTube: process.env.ENABLE_YOUTUBE !== 'false',
    enableFigmaBanner: process.env.FIGMA_TOKEN ? true : false,
    debug: process.env.DEBUG === 'true',
};

const SCHEDULE_HOURS_KST = [8, 12, 18, 21];

// Typefully API v2: Bearer auth + presigned S3 upload + nested platform body
async function postToTypefully(text, bannerBuffer = null) {
    const authHeaders = { 'Authorization': `Bearer ${TYPEFULLY_API_KEY}`, 'Content-Type': 'application/json' };
    try {
          let mediaId = null;
          if (bannerBuffer) {
                  console.log('    📤 Typefully 미디어 업로드 중...');
                  const uploadReqRes = await fetch(`${TYPEFULLY_API_BASE}/v2/social-sets/${TYPEFULLY_SOCIAL_SET_ID}/media/upload`, {
                            method: 'POST', headers: authHeaders, body: JSON.stringify({ file_name: 'banner.png' }),
                  });
                  if (uploadReqRes.ok) {
                            const { media_id, upload_url } = await uploadReqRes.json();
                            console.log(`    ✅ 업로드 URL 발급 (media_id: ${media_id})`);
                            const putRes = await fetch(upload_url, { method: 'PUT', body: bannerBuffer });
                            if (putRes.ok || putRes.status === 204) {
                                        console.log('    ✅ S3 업로드 완료');
                                        mediaId = media_id;
                                        let ready = false;
                                        for (let i = 0; i < 15; i++) {
                                                      await new Promise(r => setTimeout(r, 2000));
                                                      const statusRes = await fetch(`${TYPEFULLY_API_BASE}/v2/social-sets/${TYPEFULLY_SOCIAL_SET_ID}/media/${media_id}`, {
                                                                      headers: { 'Authorization': `Bearer ${TYPEFULLY_API_KEY}` },
                                                      });
                                                      if (statusRes.ok) {
                                                                      const sd = await statusRes.json();
                                                                      if (sd.status === 'ready') { ready = true; console.log('    ✅ 미디어 처리 완료'); break; }
                                                                      console.log(`    ⏳ 미디어 처리 중... (${sd.status})`);
                                                      }
                                        }
                                        if (!ready) { console.log('    ⚠️ 미디어 처리 타임아웃'); mediaId = null; }
                            } else { console.log(`    ⚠️ S3 업로드 실패: ${putRes.status}`); }
                  } else { const e = await uploadReqRes.text(); console.log(`    ⚠️ 업로드 URL 실패: ${uploadReqRes.status} ${e}`); }
          }
          const postObj = mediaId ? { text, media_ids: [mediaId] } : { text };
          const draftBody = {
                  platforms: { x: { enabled: true, posts: [postObj] }, linkedin: { enabled: true, posts: [postObj] }, threads: { enabled: true, posts: [postObj] } },
                  share: false,
          };
          console.log('    📝 Typefully 드래프트 생성 중...');
          const draftRes = await fetch(`${TYPEFULLY_API_BASE}/v2/social-sets/${TYPEFULLY_SOCIAL_SET_ID}/drafts`, {
                  method: 'POST', headers: authHeaders, body: JSON.stringify(draftBody),
          });
          if (draftRes.ok) {
                  const d = await draftRes.json();
                  return { success: true, draftId: d.id, status: d.status, platforms: ['x', 'linkedin', 'threads'], hasMedia: !!mediaId };
          } else {
                  const e = await draftRes.text();
                  return { success: false, error: `${draftRes.status} ${e}` };
          }
    } catch (err) { return { success: false, error: err.message }; }
}

async function runBriefingPipeline(isFirstRun = false) {
    const startTime = Date.now();
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstHour = kstNow.getUTCHours();
    const kstTimeStr = `${kstHour}:${String(kstNow.getUTCMinutes()).padStart(2, '0')} KST`;
    console.log('\n' + '='.repeat(60));
    console.log(`🌅 코인이지 브리핑 파이프라인 시작 (${kstTimeStr})`);
    console.log('='.repeat(60));
    try {
          console.log('\n📡 Step 1/7: 데이터 수집 중...');
          const data = await collectAllData();
          if (!data.market && !data.fearGreed && !data.kimchi) { console.error('❌ 핵심 데이터 수집 실패.'); return; }

      console.log('\n✍️  Step 2/7: 텔레그램 브리핑 생성 중...');
          const telegramBriefing = await generateTelegramBriefing(data);
          if (!telegramBriefing) { console.error('❌ 브리핑 생성 실패.'); return; }

        // 텔레그램 푸터 (공지방, 채팅방, X)
        const briefingWithFooter = telegramBriefing + '\n\n📢 <a href="https://t.me/coiniseasy">공지방</a> · 💬 <a href="https://t.me/coineasy_official">채팅방</a> · ✖️ <a href="https://x.com/Coiniseasy">X</a>\n\n#EasyEd #이지에드 #이지브리프 #CoinEasy';


      let bannerData = null;
          if (CONFIG.enableFigmaBanner) {
                  console.log('\n🎨 Step 3/7: Figma 배너 Export 중...');
                  bannerData = await exportFigmaBanner(data);
                  if (bannerData) { console.log(`  ✅ 배너 Export 완료 (${(bannerData.size / 1024).toFixed(1)}KB)`); }
                  else { console.log('  ⚠️ 배너 Export 실패'); }
          } else { console.log('\n⏭️  Step 3/7: Figma 배너 스킵'); }

      console.log('\n📤 Step 4/7: 텔레그램 발송 중...');
          if (CONFIG.channelId && CONFIG.botToken) {
                  console.log(`  📢 공지 채널 발송: ${CONFIG.channelId}`);
                  if (bannerData && bannerData.buffer) {
                            const channelPhotoOk = await sendTelegramPhoto(bannerData.buffer, briefingWithFooter, CONFIG.channelId, CONFIG.botToken);
                            console.log(`  ${channelPhotoOk ? '✅' : '❌'} 채널 배너+브리핑: ${CONFIG.channelId}`);
                            if (briefingWithFooter.length > 1020) { await sendTelegramMessage(briefingWithFooter, CONFIG.channelId, CONFIG.botToken); }
                  } else {
                            const chOk = await sendTelegramMessage(briefingWithFooter, CONFIG.channelId, CONFIG.botToken);
                            console.log(`  ${chOk ? '✅' : '❌'} 채널 텍스트 발송: ${CONFIG.channelId}`);
                  }
          }
          if (CONFIG.chatId && CONFIG.botToken) {
                  console.log(`  💬 개인톡 발송: ${CONFIG.chatId}`);
                  if (bannerData && bannerData.buffer) {
                            const photoSuccess = await sendTelegramPhoto(bannerData.buffer, briefingWithFooter, CONFIG.chatId, CONFIG.botToken);
                            console.log(`  ${photoSuccess ? '✅' : '❌'} 개인톡 배너+브리핑: ${CONFIG.chatId}`);
                            if (briefingWithFooter.length > 1020) { await sendTelegramMessage(briefingWithFooter, CONFIG.chatId, CONFIG.botToken); }
                  } else {
                            const success = await sendTelegramMessage(briefingWithFooter, CONFIG.chatId, CONFIG.botToken);
                            console.log(`  ${success ? '✅' : '❌'} 개인톡 텍스트 발송: ${CONFIG.chatId}`);
                  }
          }

      if (CONFIG.saveBlogDraft && isFirstRun) {
              console.log('\n📝 Step 5/7: 네이버 블로그 초안 생성 중...');
              const blogDraft = await generateBlogDraft(data, telegramBriefing);
              if (blogDraft) {
                        const draftsDir = './drafts';
                        if (!existsSync(draftsDir)) await mkdir(draftsDir, { recursive: true });
                        const dateStr = new Date().toISOString().split('T')[0];
                        const filename = `${draftsDir}/blog_${dateStr}.md`;
                        await writeFile(filename, blogDraft, 'utf-8');
                        console.log(`  ✅ 블로그 초안 저장: ${filename}`);
                        if (CONFIG.chatId && CONFIG.botToken) {
                                    const blogMsg = `📝 *네이버 블로그 초안* (${dateStr})\n${'─'.repeat(30)}\n\n` + blogDraft;
                                    await sendTelegramMessage(blogMsg, CONFIG.chatId, CONFIG.botToken);
                        }
              }
      } else { console.log(`\n⏭️  Step 5/7: 블로그 초안 스킵`); }

      if (CONFIG.enableTypefully) {
              console.log('\n📢 Step 6/7: Typefully 포스팅 중 (X + LinkedIn + Threads)...');
              try {
                        const postText = await generateXPost(data, telegramBriefing);
                        if (postText) {
                                    console.log(`  📝 생성된 포스트 (${postText.length}자): "${postText.substring(0, 100)}..."`);
                                    const result = await postToTypefully(postText, bannerData && bannerData.buffer ? bannerData.buffer : null);
                                    if (result.success) {
                                                  console.log(`  ✅ Typefully 완료! Draft ID: ${result.draftId} (${result.status})`);
                                                  console.log(`  📌 플랫폼: ${result.platforms.join(', ')}${result.hasMedia ? ' (배너 첨부)' : ''}`);
                                    } else { console.log(`  ❌ Typefully 실패: ${result.error}`); }
                        } else { console.log('  ⚠️ 포스트 생성 실패'); }
              } catch (tfErr) { console.error(`  ❌ Typefully 에러: ${tfErr.message}`); }
      } else { console.log('\n⏭️  Step 6/7: Typefully 스킵'); }

      if (CONFIG.enableYouTube && isFirstRun) {
              console.log('\n🎬 Step 7/7: YouTube Shorts 생성 중...');
              try {
                        const shortsScript = await generateShortsScript(data, telegramBriefing);
                        if (shortsScript) {
                                    const videoPath = await createShortsVideo(shortsScript, data);
                                    if (videoPath) {
                                                  const uploadResult = await uploadToYouTube(videoPath, { title: shortsScript.title });
                                                  if (uploadResult.success) { console.log(`  ✅ YouTube 업로드 완료! ${uploadResult.videoUrl}`); }
                                                  else { console.log(`  ❌ YouTube 업로드 실패: ${uploadResult.error}`); }
                                                  await cleanupTempFiles();
                                    }
                        }
              } catch (ytErr) { console.error(`  ❌ YouTube Shorts 에러: ${ytErr.message}`); }
      } else { console.log('\n⏭️  Step 7/7: YouTube Shorts 스킵'); }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log('\n' + '='.repeat(60));
          console.log(`✅ 파이프라인 완료! (${elapsed}초) [${kstTimeStr}]`);
          console.log('='.repeat(60) + '\n');
    } catch (err) { console.error(`\n❌ 파이프라인 에러: ${err.message}`); console.error(err.stack); }
}

const runNow = process.argv.includes('--run-now');
if (runNow) {
    console.log('🚀 즉시 실행 모드');
    runBriefingPipeline(true).then(() => { console.log('프로세스 종료'); process.exit(0); });
} else {
    const scheduleInfo = SCHEDULE_HOURS_KST.map(kstH => {
          const utcH = (kstH - 9 + 24) % 24;
          const cronExpr = `0 ${utcH} * * *`;
          const isFirst = (kstH === 8);
          cron.schedule(cronExpr, () => { console.log(`\n⏰ Cron 트리거 ${kstH}:00 KST`); runBriefingPipeline(isFirst); });
          return `${kstH}:00 KST → cron: ${cronExpr} UTC${isFirst ? ' (풀 파이프라인)' : ''}`;
    });
    console.log('🤖 코인이지 데일리 브리핑 봇 가동!');
    console.log('');
    console.log('⏰ 스케줄 (하루 4회):');
    scheduleInfo.forEach(s => console.log(`  ${s}`));
    console.log('');
    console.log(`📢 채널: ${CONFIG.channelId || '미설정'}`);
    console.log(`💬 채팅방: ${CONFIG.chatId || '미설정'}`);
    console.log(`📝 블로그 초안: ${CONFIG.saveBlogDraft ? '활성화' : '비활성화'}`);
    console.log(`📢 Typefully: ${CONFIG.enableTypefully ? '활성화 (X + LinkedIn + Threads)' : '비활성화'}`);
    console.log(`🎬 YouTube Shorts: ${CONFIG.enableYouTube ? '활성화' : '비활성화'}`);
    console.log(`🎨 Figma 배너: ${CONFIG.enableFigmaBanner ? '활성화' : '비활성화'}`);
    console.log('');
    const figmaUtcHour = (8 - 9 + 24) % 24;
    const figmaCron = `55 ${figmaUtcHour === 0 ? 23 : figmaUtcHour - 1} * * *`;
    console.log(`🖼️  Figma 카드: 매일 7:55 KST (cron: ${figmaCron} UTC)`);
    cron.schedule(figmaCron, () => { console.log(`\n🖼️  Figma 데일리 트리거`); runDailyFigma(); });
    console.log('💤 다음 실행 대기 중...\n');
    runBriefingPipeline(true);
}
