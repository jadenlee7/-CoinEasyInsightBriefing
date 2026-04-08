/**
 * 코인이지 Figma 배너 모듈 (Option C: Figma Export + node-canvas 오버레이)
 *
 * 1. Figma Images API로 현재 배너를 PNG Export
 * 2. node-canvas로 이미지 로드 → 동적 텍스트 영역을 배경색으로 덮고 실시간 데이터 그리기
 *
 * 환경변수:
 *   FIGMA_TOKEN    – Figma Personal Access Token
 *   FIGMA_FILE_KEY – Figma 파일 키 (기본: SRPoM0lDRtn61Q91sFWg1D)
 *   FIGMA_FRAME_ID – Export할 프레임 노드 ID (기본: 28334:14)
 *
 * collectAllData() 리턴 구조:
 *   data.market = [{symbol, name, price, change24h, change7d, marketCap, volume24h}, ...]
 *   data.global = {totalMarketCap, totalVolume24h, btcDominance, ethDominance, marketCapChange24h}
 *   data.kimchi = {upbitBtcKrw, binanceBtcUsd, krwRate, premium}
 *   data.fearGreed = {value, label, previousValue, previousLabel, source}
 *   data.trending = [{symbol, name, marketCapRank, priceChange24h}, ...]
 *   data.defi = {topByTVL, topGainers, topLosers}
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { createCanvas, loadImage, registerFont } from 'canvas';

// ============================================================
// 설정
// ============================================================
const FIGMA_CONFIG = {
     token: process.env.FIGMA_TOKEN || '',
     fileKey: process.env.FIGMA_FILE_KEY || 'SRPoM0lDRtn61Q91sFWg1D',
     frameId: process.env.FIGMA_FRAME_ID || '28334:14',
     scale: 2, // 2x 고해상도
};

const FIGMA_API = 'https://api.figma.com/v1';

// ============================================================
// 헬퍼: data에서 코인 찾기
// ============================================================
function findCoin(data, symbol) {
     if (!data?.market || !Array.isArray(data.market)) return null;
     return data.market.find(c => c.symbol === symbol) || null;
}

function fmtPrice(price) {
     if (price == null) return '$--';
     if (price >= 1000) return `$${Math.round(price).toLocaleString('en-US')}`;
     if (price >= 10) return `$${price.toFixed(1)}`;
     if (price >= 1) return `$${price.toFixed(2)}`;
     return `$${price.toFixed(3)}`;
}

function fmtChange(change) {
     const c = parseFloat(change || 0);
     return `${c >= 0 ? '+' : ''}${c}%`;
}

// ============================================================
// 텍스트 오버레이 매핑 (Figma 프레임 내 좌표, 1x 기준)
// 프레임 크기: 1082 x 1343
// ============================================================
const TEXT_OVERLAYS = [
     // ── BTC 메인 가격 ──
   {
          key: 'btcPrice',
          format: (_, data) => {
                   const btc = findCoin(data, 'BTC');
                   return btc ? `$${Math.round(btc.price).toLocaleString('en-US')}` : '$--';
          },
          x: 68, y: 207, w: 400, h: 70,
          bg: '#1C3A2A',
          font: 'bold 56px "Noto Sans KR"',
          color: '#FFFFFF',
          align: 'left',
   },

     // ── BTC 변동률 (BTC 라벨 옆) ──
   {
          key: 'btcChange',
          format: (_, data) => {
                   const btc = findCoin(data, 'BTC');
                   return btc ? fmtChange(btc.change24h) : '';
          },
          x: 115, y: 165, w: 150, h: 24,
          bg: '#1C3A2A',
          font: 'bold 16px "Noto Sans KR"',
          color: '#FFFFFF',
          align: 'left',
   },

     // ── MARKET 전체 변동률 (우측 큰 글씨) ──
   {
          key: 'marketChange',
          format: (_, data) => {
                   const c = parseFloat(data?.global?.marketCapChange24h || 0);
                   return `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`;
          },
          x: 540, y: 210, w: 470, h: 65,
          bg: '#1C3A2A',
          font: 'bold 52px "Noto Sans KR"',
          color: '#22C55E',
          align: 'right',
   },

     // ── MARKET 라벨 ──
   {
          key: 'marketLabel',
          format: (_, data) => {
                   const c = parseFloat(data?.global?.marketCapChange24h || 0);
                   return `MARKET ${c >= 0 ? '+' : ''}${c.toFixed(1)}%`;
          },
          x: 540, y: 163, w: 470, h: 22,
          bg: '#1C3A2A',
          font: 'bold 14px "Noto Sans KR"',
          color: '#AAAAAA',
          align: 'right',
   },

     // ── 날짜 텍스트 ──
   {
          key: 'dateText',
          format: () => {
                   const now = new Date();
                   const days = ['일', '월', '화', '수', '목', '금', '토'];
                   const seoulStr = now.toLocaleDateString('ko-KR', {
                              timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric'
                   });
                   const parts = seoulStr.split('.');
                   const m = parseInt(parts[0]) || (now.getMonth() + 1);
                   const d = parseInt(parts[1]) || now.getDate();
                   const seoulDay = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
                   const weekday = days[seoulDay.getDay()];
                   return `${m}월 ${d}일 ${weekday}요일 아침`;
          },
          x: 370, y: 128, w: 340, h: 28,
          bg: '#3F2912',
          font: 'bold 22px "Noto Sans KR"',
          color: '#FFFFFF',
          align: 'center',
   },

     // ── ETH 가격 ──
   {
          key: 'ethPrice',
          format: (_, data) => {
                   const eth = findCoin(data, 'ETH');
                   return eth ? fmtPrice(eth.price) : '$--';
          },
          x: 73, y: 315, w: 140, h: 30,
          bg: '#FFFFFF',
          font: 'bold 24px "Noto Sans KR"',
          color: '#1a1a1a',
          align: 'left',
   },

     // ── ETH 변동률 ──
   {
          key: 'ethChange',
          format: (_, data) => {
                   const eth = findCoin(data, 'ETH');
                   return eth ? fmtChange(eth.change24h) : '';
          },
          x: 73, y: 340, w: 140, h: 20,
          bg: '#FFFFFF',
          font: '14px "Noto Sans KR"',
          color: '#22C55E',
          align: 'left',
   },

     // ── SOL 가격 ──
   {
          key: 'solPrice',
          format: (_, data) => {
                   const sol = findCoin(data, 'SOL');
                   return sol ? fmtPrice(sol.price) : '$--';
          },
          x: 290, y: 315, w: 140, h: 30,
          bg: '#FFFFFF',
          font: 'bold 24px "Noto Sans KR"',
          color: '#1a1a1a',
          align: 'left',
   },

     // ── SOL 변동률 ──
   {
          key: 'solChange',
          format: (_, data) => {
                   const sol = findCoin(data, 'SOL');
                   return sol ? fmtChange(sol.change24h) : '';
          },
          x: 290, y: 340, w: 140, h: 20,
          bg: '#FFFFFF',
          font: '14px "Noto Sans KR"',
          color: '#22C55E',
          align: 'left',
   },

     // ── SUI 가격 ──
   {
          key: 'suiPrice',
          format: (_, data) => {
                   const sui = findCoin(data, 'SUI');
                   return sui ? fmtPrice(sui.price) : '$--';
          },
          x: 507, y: 315, w: 140, h: 30,
          bg: '#FFFFFF',
          font: 'bold 24px "Noto Sans KR"',
          color: '#1a1a1a',
          align: 'left',
   },

     // ── SUI 변동률 ──
   {
          key: 'suiChange',
          format: (_, data) => {
                   const sui = findCoin(data, 'SUI');
                   return sui ? fmtChange(sui.change24h) : '';
          },
          x: 507, y: 340, w: 140, h: 20,
          bg: '#FFFFFF',
          font: '14px "Noto Sans KR"',
          color: '#22C55E',
          align: 'left',
   },

     // ── XRP 가격 ──
   {
          key: 'xrpPrice',
          format: (_, data) => {
                   const xrp = findCoin(data, 'XRP');
                   return xrp ? fmtPrice(xrp.price) : '$--';
          },
          x: 724, y: 315, w: 140, h: 30,
          bg: '#FFFFFF',
          font: 'bold 24px "Noto Sans KR"',
          color: '#1a1a1a',
          align: 'left',
   },

     // ── XRP 변동률 ──
   {
          key: 'xrpChange',
          format: (_, data) => {
                   const xrp = findCoin(data, 'XRP');
                   return xrp ? fmtChange(xrp.change24h) : '';
          },
          x: 724, y: 340, w: 140, h: 20,
          bg: '#FFFFFF',
          font: '14px "Noto Sans KR"',
          color: '#22C55E',
          align: 'left',
   },

     // ── 김프 환율 ──
   {
          key: 'kimchiRate',
          format: (_, data) => {
                   const rate = data?.kimchi?.krwRate;
                   return rate ? `환율: ₩${rate}/USDT` : '';
          },
          x: 78, y: 423, w: 300, h: 20,
          bg: '#FFFFFF',
          font: '15px "Noto Sans KR"',
          color: '#333333',
          align: 'left',
   },

     // ── 김프 프리미엄 ──
   {
          key: 'kimchiPremium',
          format: (_, data) => {
                   const p = data?.kimchi?.premium;
                   return p != null ? `프리미엄: ${p}%` : '';
          },
          x: 78, y: 443, w: 300, h: 20,
          bg: '#FFFFFF',
          font: 'bold 15px "Noto Sans KR"',
          color: '#FF6B17',
          align: 'left',
   },

     // ── 공포/탐욕 지수 숫자 ──
   {
          key: 'fearGreedValue',
          format: (_, data) => String(data?.fearGreed?.value ?? '--'),
          x: 477, y: 430, w: 70, h: 42,
          bg: '#FFFFFF',
          font: 'bold 34px "Noto Sans KR"',
          color: '#333333',
          align: 'left',
   },

     // ── 공포/탐욕 라벨 ──
   {
          key: 'fearGreedLabel',
          format: (_, data) => data?.fearGreed?.label || '--',
          x: 550, y: 435, w: 130, h: 28,
          bg: '#FFFFFF',
          font: 'bold 20px "Noto Sans KR"',
          color: '#666666',
          align: 'left',
   },
   ];

// ============================================================
// Figma REST API: 프레임을 PNG로 Export
// ============================================================
async function fetchFigmaPNG() {
     if (!FIGMA_CONFIG.token) {
            console.log('  ⚠️ FIGMA_TOKEN 미설정 — 배너 Export 스킵');
            return null;
     }

  try {
         console.log('  🎨 Figma API: 배너 이미지 요청 중...');

       const nodeId = FIGMA_CONFIG.frameId;
         const imageUrl = `${FIGMA_API}/images/${FIGMA_CONFIG.fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${FIGMA_CONFIG.scale}`;

       const imageRes = await fetch(imageUrl, {
                headers: { 'X-Figma-Token': FIGMA_CONFIG.token },
       });

       if (!imageRes.ok) {
                const errText = await imageRes.text();
                throw new Error(`Figma API ${imageRes.status}: ${errText}`);
       }

       const imageData = await imageRes.json();
         if (imageData.err) throw new Error(`Figma API error: ${imageData.err}`);

       const images = imageData.images || {};
         const pngUrl = images[nodeId];
         if (!pngUrl) throw new Error('Figma에서 이미지 URL을 받지 못함');

       console.log('  📥 PNG 다운로드 중...');
         const pngRes = await fetch(pngUrl);
         if (!pngRes.ok) throw new Error(`PNG 다운로드 실패: ${pngRes.status}`);

       return Buffer.from(await pngRes.arrayBuffer());
  } catch (err) {
         console.error(`  ❌ Figma PNG 다운로드 에러: ${err.message}`);
         return null;
  }
}

// ============================================================
// node-canvas: 실시간 데이터 오버레이
// ============================================================
function overlayTexts(canvas, ctx, data, scale) {
     console.log('  📋 오버레이 항목 수:', TEXT_OVERLAYS.length);

  for (const overlay of TEXT_OVERLAYS) {
         try {
                  const value = overlay.format(null, data);
                  if (!value) {
                             console.log(`    ⏭️ ${overlay.key}: 빈 값 — 스킵`);
                             continue;
                  }

           const sx = overlay.x * scale;
                  const sy = overlay.y * scale;
                  const sw = overlay.w * scale;
                  const sh = overlay.h * scale;

           // 1) 배경색으로 기존 텍스트 덮기
           ctx.fillStyle = overlay.bg;
                  ctx.fillRect(sx, sy - sh + (4 * scale), sw, sh);

           // 2) 새 텍스트 그리기
           const fontSize = parseInt(overlay.font.match(/(\d+)px/)?.[1] || '16') * scale;
                  const fontWeight = overlay.font.includes('bold') ? 'bold ' : '';
                  ctx.font = `${fontWeight}${fontSize}px "Noto Sans KR", sans-serif`;
                  ctx.fillStyle = overlay.color;
                  ctx.textBaseline = 'bottom';

           if (overlay.align === 'right') {
                      ctx.textAlign = 'right';
                      ctx.fillText(value, sx + sw, sy + (4 * scale));
           } else if (overlay.align === 'center') {
                      ctx.textAlign = 'center';
                      ctx.fillText(value, sx + sw / 2, sy + (4 * scale));
           } else {
                      ctx.textAlign = 'left';
                      ctx.fillText(value, sx, sy + (4 * scale));
           }

           console.log(`    ✅ ${overlay.key}: "${value}"`);
         } catch (e) {
                  console.error(`    ⚠️ 오버레이 에러 (${overlay.key}): ${e.message}`);
         }
  }
}

// ============================================================
// 메인 Export 함수 — data를 받아 실시간 오버레이 적용
// ============================================================
export async function exportFigmaBanner(data) {
     // 1. Figma에서 원본 배너 PNG 다운로드
  const pngBuffer = await fetchFigmaPNG();
     if (!pngBuffer) return null;

  try {
         // 2. node-canvas로 이미지 로드
       const img = await loadImage(pngBuffer);
         const canvas = createCanvas(img.width, img.height);
         const ctx = canvas.getContext('2d');

       // 원본 이미지 그리기
       ctx.drawImage(img, 0, 0);

       // 3. data가 있으면 실시간 텍스트 오버레이
       if (data) {
                const scale = FIGMA_CONFIG.scale;
                console.log('  🖊️ 실시간 데이터 오버레이 적용 중...');
                console.log('  📊 data.market 타입:', Array.isArray(data.market) ? 'array' : typeof data.market);
                console.log('  📊 data.market 코인 수:', data.market?.length || 0);
                if (data.market && Array.isArray(data.market)) {
                           data.market.forEach(c => console.log(`    - ${c.symbol}: $${c.price} (${c.change24h}%)`));
                }
                overlayTexts(canvas, ctx, data, scale);
                console.log('  ✅ 오버레이 완료');
       }

       // 4. PNG Buffer로 변환
       const resultBuffer = canvas.toBuffer('image/png');

       // 5. 로컬 저장
       const bannersDir = './banners';
         if (!existsSync(bannersDir)) await mkdir(bannersDir, { recursive: true });
         const dateStr = new Date().toISOString().split('T')[0];
         const filename = `${bannersDir}/banner_${dateStr}.png`;
         await writeFile(filename, resultBuffer);
         console.log(`  ✅ 배너 저장: ${filename} (${(resultBuffer.length / 1024).toFixed(1)}KB)`);

       return {
                buffer: resultBuffer,
                filename,
                size: resultBuffer.length,
       };
  } catch (err) {
         console.error(`  ❌ node-canvas 오버레이 에러: ${err.message}`);
         // 폴백: 오버레이 실패 시 원본 Figma 이미지 그대로 사용
       console.log('  ↩️ 원본 Figma 이미지로 폴백');
         const bannersDir = './banners';
         if (!existsSync(bannersDir)) await mkdir(bannersDir, { recursive: true });
         const dateStr = new Date().toISOString().split('T')[0];
         const filename = `${bannersDir}/banner_${dateStr}.png`;
         await writeFile(filename, pngBuffer);
         return { buffer: pngBuffer, filename, size: pngBuffer.length };
  }
}

// ============================================================
// 텔레그램: 이미지 + 캡션 발송
// ============================================================
export async function sendTelegramPhoto(imageBuffer, caption, chatId, botToken) {
     if (!botToken || !chatId || !imageBuffer) {
            console.error('[텔레그램] 필수 파라미터 누락 (botToken/chatId/imageBuffer)');
            return false;
     }

  try {
         const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
         const formData = new FormData();
         const blob = new Blob([imageBuffer], { type: 'image/png' });

       formData.append('chat_id', chatId);
         formData.append('photo', blob, 'coineasy_daily_banner.png');

       if (caption) {
                const trimmedCaption = caption.length > 1020
                  ? caption.substring(0, 1020) + '...'
                           : caption;
                formData.append('caption', trimmedCaption);
                formData.append('parse_mode', 'Markdown');
       }

       const res = await fetch(url, { method: 'POST', body: formData });
         const result = await res.json();

       if (!result.ok) {
                console.warn('[텔레그램] Markdown 캡션 실패, 일반 텍스트로 재시도');
                const formData2 = new FormData();
                const blob2 = new Blob([imageBuffer], { type: 'image/png' });
                formData2.append('chat_id', chatId);
                formData2.append('photo', blob2, 'coineasy_daily_banner.png');
                if (caption) {
                           formData2.append('caption', caption.replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1'));
                }
                const res2 = await fetch(url, { method: 'POST', body: formData2 });
                const result2 = await res2.json();
                if (!result2.ok) {
                           console.error(`[텔레그램] 사진 발송 실패: ${result2.description}`);
                           return false;
                }
       }

       console.log(`[텔레그램] 📸 배너 이미지 발송 완료 → ${chatId}`);
         return true;
  } catch (err) {
         console.error(`[텔레그램 사진 에러] ${err.message}`);
         return false;
  }
}

// ============================================================
// X (Twitter): 이미지 첨부 포스팅용 미디어 업로드
// ============================================================
export async function uploadMediaToX(imageBuffer) {
     const apiKey = process.env.X_API_KEY;
     const apiSecret = process.env.X_API_SECRET;
     const accessToken = process.env.X_ACCESS_TOKEN;
     const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !accessToken) {
         console.log('  ⚠️ X API 키 미설정 — 미디어 업로드 스킵');
         return null;
  }

  try {
         const { TwitterApi } = await import('twitter-api-v2');
         const client = new TwitterApi({
                  appKey: apiKey,
                  appSecret: apiSecret,
                  accessToken: accessToken,
                  accessSecret: accessSecret,
         });

       const mediaId = await client.v1.uploadMedia(imageBuffer, {
                mimeType: 'image/png',
       });

       console.log(`  ✅ X 미디어 업로드 완료: ${mediaId}`);
         return mediaId;
  } catch (err) {
         console.error(`  ❌ X 미디어 업로드 에러: ${err.message}`);
         return null;
  }
}
