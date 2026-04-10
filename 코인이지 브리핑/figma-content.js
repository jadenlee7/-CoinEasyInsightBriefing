/**
 * 코인이지 Figma 콘텐츠 자동 게시 모듈
 * - Figma EASYWORLD 프로젝트에서 콘텐츠 카드 Export
 * - 텔레그램 채널에 이미지 + 캡션 전송
 * - 인스타그램 자동 게시 (Instagram Graph API)
 * - Typefully 자동 게시 (X + LinkedIn + Threads)
 */

const FIGMA_API = 'https://api.figma.com/v1';
const TELEGRAM_API = 'https://api.telegram.org/bot';
const INSTAGRAM_API = 'https://graph.facebook.com/v19.0';
const TYPEFULLY_API = 'https://api.typefully.com';
const TYPEFULLY_SOCIAL_SET_ID = '235804';

// EASYWORLD 프로젝트 파일 키
const FILE_KEY = 'SRPoM0lDRtn61Q91sFWg1D';

// ═══════════════════════════════════════════════
// Figma 콘텐츠 프레임 레지스트리
// ═══════════════════════════════════════════════
export const FIGMA_FRAMES = {
   'fear-greed': {
        nodeId: '26390-526',
        name: 'Fear & Greed',
        description: '공포 & 탐욕 지수',
        defaultCaption: '📊 오늘의 Fear & Greed Index\n\n#코인이지 #FearAndGreed #암호화폐',
        instagramCaption: '📊 오늘의 Fear & Greed Index\n\n암호화폐 시장의 감정을 수치화한 지표입니다.\n\n#코인이지 #CoinEasy #FearAndGreed #암호화폐 #비트코인 #투자 #크립토',
   },
   'btc-vs-eth': {
        nodeId: '26793-982',
        name: 'BTC vs ETH',
        description: 'BTC vs ETH 비교 분석',
        defaultCaption: '⚡ BTC vs ETH 비교 분석\n\n#비트코인 #이더리움 #코인이지',
        instagramCaption: '⚡ BTC vs ETH 비교 분석\n\n비트코인과 이더리움의 핵심 차이를 알아봅시다.\n\n#코인이지 #BTC #ETH #비트코인 #이더리움 #암호화폐교육',
   },
   'btc-eth-etf': {
        nodeId: '26390-81',
        name: 'BTC/ETH ETF',
        description: 'BTC/ETH ETF 현황',
        defaultCaption: '📈 BTC/ETH ETF 최신 현황\n\n#ETF #비트코인ETF #코인이지',
        instagramCaption: '📈 BTC/ETH ETF 최신 현황\n\n기관 투자의 흐름을 읽어봅시다.\n\n#코인이지 #비트코인ETF #이더리움ETF #기관투자 #암호화폐',
   },
   'ethereum': {
        nodeId: '26649-17',
        name: '이더리움',
        description: '이더리움 심층 분석',
        defaultCaption: '💎 이더리움 심층 분석\n\n#이더리움 #ETH #코인이지',
        instagramCaption: '💎 이더리움 심층 분석\n\n이더리움 생태계의 최신 동향을 파악합니다.\n\n#코인이지 #이더리움 #ETH #스마트컨트랙트 #디파이 #암호화폐',
   },
   'btc-supply-crunch': {
        nodeId: '26309-16',
        name: '비트코인 공급 부족',
        description: 'Bitcoin 2025 Supply Crunch',
        defaultCaption: '🔥 BITCOIN 2025 SUPPLY CRUNCH\n비트코인 공급 압박 분석\n\n#비트코인 #공급부족 #코인이지',
        instagramCaption: '🔥 BITCOIN 2025 SUPPLY CRUNCH\n\n채굴량 vs 기관 매수량, 공급 압박의 실체를 분석합니다.\n\n#코인이지 #비트코인 #공급부족 #반감기 #암호화폐투자',
   },
   'fly-to-moon': {
        nodeId: '26276-744',
        name: 'fly me to the moon',
        description: 'Easyboy 로켓 일러스트',
        defaultCaption: '🚀 Fly Me to the Moon!\n\n#ToTheMoon #코인이지 #암호화폐',
        instagramCaption: '🚀 Fly Me to the Moon!\n\n코인이지 이지보이와 함께 달까지!\n\n#코인이지 #ToTheMoon #이지보이 #픽셀아트 #암호화폐 #NFT',
   },
};

// ═══════════════════════════════════════════════
// Figma API - 프레임 이미지 Export
// ═══════════════════════════════════════════════
export async function exportFigmaFrame(nodeId, scale = 2, format = 'png') {
   const figmaToken = process.env.FIGMA_TOKEN;
   if (!figmaToken) {
        console.error('[Figma] FIGMA_TOKEN 미설정');
        return null;
   }

  console.log(`  🎨 Figma Export: node ${nodeId} (${scale}x ${format})`);

  const url = `${FIGMA_API}/images/${FILE_KEY}?ids=${nodeId}&scale=${scale}&format=${format}`;
   const res = await fetch(url, {
        headers: { 'X-Figma-Token': figmaToken },
   });

  if (!res.ok) {
       console.error(`[Figma] API 오류: ${res.status}`);
       return null;
  }

  const data = await res.json();
   if (data.err) {
        console.error(`[Figma] 오류: ${data.err}`);
        return null;
   }

  // Figma API 응답 키 형식 처리 (하이픈 또는 콜론)
  const imageUrl =
       data.images[nodeId] ||
       data.images[nodeId.replace('-', ':')] ||
       Object.values(data.images)[0];

  if (!imageUrl) {
       console.error('[Figma] 이미지 URL 없음');
       return null;
  }

  console.log('  ✅ Figma Export 완료');
   return imageUrl;
}

// ═══════════════════════════════════════════════
// 텔레그램 이미지 전송
// ═══════════════════════════════════════════════
export async function sendTelegramPhoto(imageUrl, caption, chatId, botToken) {
   if (!botToken || !chatId) {
        console.error('[텔레그램] BOT_TOKEN 또는 CHAT_ID 미설정');
        return false;
   }

  console.log(`  📨 텔레그램 이미지 전송 → ${chatId}`);

  const url = `${TELEGRAM_API}${botToken}/sendPhoto`;
   const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
               chat_id: chatId,
               photo: imageUrl,
               caption: caption,
               parse_mode: 'HTML',
        }),
   });

  const result = await res.json();
   if (!result.ok) {
        console.error(`[텔레그램] 이미지 전송 실패: ${result.description}`);
        return false;
   }

  console.log(`  ✅ 텔레그램 전송 완료 (msg: ${result.result.message_id})`);
   return true;
}

// ═══════════════════════════════════════════════
// 인스타그램 자동 게시 (Instagram Graph API)
// ═══════════════════════════════════════════════
export async function postToInstagram(imageUrl, caption) {
   const accessToken = process.env.IG_ACCESS_TOKEN;
   const igUserId = process.env.IG_USER_ID;

  if (!accessToken || !igUserId) {
       console.log('  ⚠️ 인스타그램 미설정 (IG_ACCESS_TOKEN/IG_USER_ID) - 스킵');
       return false;
  }

  console.log('  📸 인스타그램 게시 중...');

  try {
       // Step 1: 미디어 컨테이너 생성
     const createRes = await fetch(
            `${INSTAGRAM_API}/${igUserId}/media`,
      {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                          image_url: imageUrl,
                          caption: caption,
                          access_token: accessToken,
               }),
      }
          );

     const createData = await createRes.json();
       if (createData.error) {
              console.error(`[인스타] 컨테이너 생성 실패: ${createData.error.message}`);
              return false;
       }

     const containerId = createData.id;
       console.log(`  📦 컨테이너 생성: ${containerId}`);

     // Step 2: 처리 대기 (최대 30초)
     let ready = false;
       for (let i = 0; i < 10; i++) {
              await new Promise(r => setTimeout(r, 3000));
              const statusRes = await fetch(
                       `${INSTAGRAM_API}/${containerId}?fields=status_code&access_token=${accessToken}`
                     );
              const statusData = await statusRes.json();
              if (statusData.status_code === 'FINISHED') {
                       ready = true;
                       break;
              }
              console.log(`  ⏳ 처리 중... (${statusData.status_code})`);
       }

     if (!ready) {
            console.error('[인스타] 타임아웃');
            return false;
     }

     // Step 3: 게시
     const publishRes = await fetch(
            `${INSTAGRAM_API}/${igUserId}/media_publish`,
      {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                          creation_id: containerId,
                          access_token: accessToken,
               }),
      }
          );

     const publishData = await publishRes.json();
       if (publishData.error) {
              console.error(`[인스타] 게시 실패: ${publishData.error.message}`);
              return false;
       }

     console.log(`  ✅ 인스타그램 게시 완료! (id: ${publishData.id})`);
       return true;
  } catch (err) {
       console.error(`[인스타 에러] ${err.message}`);
       return false;
  }
}

// ═══════════════════════════════════════════════
// Typefully 자동 게시 (X + LinkedIn + Threads)
// ═══════════════════════════════════════════════
export async function postToTypefully(imageUrl, caption) {
   const apiKey = process.env.TYPEFULLY_API_KEY;
   if (!apiKey) {
        console.log('  ⚠️ Typefully 미설정 (TYPEFULLY_API_KEY) - 스킵');
        return false;
   }

  console.log('  📝 Typefully 게시 중 (X + LinkedIn + Threads)...');

  try {
       // Step 1: 이미지 다운로드
     const imgRes = await fetch(imageUrl);
       if (!imgRes.ok) {
              console.error(`[Typefully] 이미지 다운로드 실패: ${imgRes.status}`);
              return false;
       }
       const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
       const imgBase64 = imgBuffer.toString('base64');

     // Step 2: Typefully 미디어 업로드
     const mediaRes = await fetch(`${TYPEFULLY_API}/v2/media`, {
            method: 'POST',
            headers: {
                     'X-API-KEY': apiKey,
                     'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                     file: imgBase64,
                     file_name: 'figma-content.png',
            }),
     });

     if (!mediaRes.ok) {
            console.error(`[Typefully] 미디어 업로드 실패: ${mediaRes.status}`);
            return false;
     }

     const mediaData = await mediaRes.json();
       const mediaId = mediaData.id;
       console.log(`  📤 미디어 업로드: ${mediaId}`);

     // Step 3: 미디어 처리 대기 (최대 30초)
     let mediaReady = false;
       for (let i = 0; i < 10; i++) {
              await new Promise(r => setTimeout(r, 3000));
              const statusRes = await fetch(`${TYPEFULLY_API}/v2/media/${mediaId}`, {
                       headers: { 'X-API-KEY': apiKey },
              });
              const statusData = await statusRes.json();
              if (statusData.status === 'ready') {
                       mediaReady = true;
                       break;
              }
              console.log(`  ⏳ 미디어 처리 중... (${statusData.status})`);
       }

     if (!mediaReady) {
            console.error('[Typefully] 미디어 처리 타임아웃');
            return false;
     }

     // Step 4: 드래프트 생성 및 게시
     const draftRes = await fetch(
            `${TYPEFULLY_API}/v2/social-sets/${TYPEFULLY_SOCIAL_SET_ID}/drafts`,
      {
               method: 'POST',
               headers: {
                          'X-API-KEY': apiKey,
                          'Content-Type': 'application/json',
               },
               body: JSON.stringify({
                          content: caption,
                          platforms: {
                                       x: { enabled: true },
                                       linkedin: { enabled: true },
                                       threads: { enabled: true },
                          },
                          media_ids: [mediaId],
                          publish_at: 'next-free-slot',
               }),
      }
          );

     if (!draftRes.ok) {
            const errText = await draftRes.text();
            console.error(`[Typefully] 드래프트 생성 실패: ${draftRes.status} ${errText}`);
            return false;
     }

     const draftData = await draftRes.json();
       console.log(`  ✅ Typefully 게시 완료! (draft: ${draftData.id})`);
       return true;
  } catch (err) {
       console.error(`[Typefully 에러] ${err.message}`);
       return false;
  }
}

// ═══════════════════════════════════════════════
// 통합 게시 파이프라인
// ═══════════════════════════════════════════════
export async function publishFigmaContent(frameKey, customCaption = null) {
   const frame = FIGMA_FRAMES[frameKey];
   if (!frame) {
        console.error(`[Figma] 프레임 키 "${frameKey}" 를 찾을 수 없습니다.`);
        console.log(`  사용 가능: ${Object.keys(FIGMA_FRAMES).join(', ')}`);
        return { telegram: false, instagram: false, typefully: false };
   }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
   const channelId = process.env.TELEGRAM_CHANNEL_ID;

  console.log(`\n🖼️ Figma 콘텐츠 게시: ${frame.name}`);
   console.log('─'.repeat(40));

  // Figma Export
  const imageUrl = await exportFigmaFrame(frame.nodeId);
   if (!imageUrl) return { telegram: false, instagram: false, typefully: false };

  // 텔레그램 전송
  const tgCaption = customCaption || frame.defaultCaption;
   const tgResult = await sendTelegramPhoto(imageUrl, tgCaption, channelId, botToken);

  // 인스타그램 전송
  const igCaption = frame.instagramCaption || tgCaption;
   const igResult = await postToInstagram(imageUrl, igCaption);

  // Typefully 전송 (X + LinkedIn + Threads)
  const tfCaption = customCaption || frame.defaultCaption;
   const tfResult = await postToTypefully(imageUrl, tfCaption);

  console.log(`  📊 결과: TG=${tgResult ? '✅' : '❌'} | IG=${igResult ? '✅' : '❌'} | TF=${tfResult ? '✅' : '❌'}`);

  return { telegram: tgResult, instagram: igResult, typefully: tfResult };
}
