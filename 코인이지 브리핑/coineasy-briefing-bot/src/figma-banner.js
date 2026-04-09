/**
 * 코인이지 Figma 배너 모듈 (Option C: Figma Export + node-canvas 오버레이)
 *
 * 1. Figma Images API로 현재 배너를 PNG Export
 * 2. node-canvas로 이미지 로드 → 동적 텍스트 영역을 배경색으로 덮고 실시간 데이터 그리기
 *
 * 환경변수:
 *   FIGMA_TOKEN  – Figma Personal Access Token
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
import { renderCanvasBanner, getTimeLabel } from './canvas-banner.js';

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
           return `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`;
}

// ============================================================
// 헬퍼: DeFi 카드용 — topByTVL 1개 + topGainers 1개 + topLosers 1개
// ============================================================
function getDefiItems(data) {
           const defi = data?.defi;
           if (!defi) return [null, null, null];
           const item1 = defi.topByTVL?.[0] || null;
           const item2 = defi.topGainers?.[0] || null;
           const item3 = defi.topLosers?.[0] || null;
           return [item1, item2, item3];
}

// ============================================================
// 텍스트 오버레이 매핑 — Figma Inspector에서 추출한 정확한 좌표 (1x 기준)
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
                      x: 70, y: 240, w: 225, h: 67, bg: '#1C3A2A',
                      font: 'black 56px', color: '#FFFFFF', align: 'left',
         },
           // ── BTC 라벨 + 변동률 ──
         {
                      key: 'btcChange',
                      format: (_, data) => {
                                     const btc = findCoin(data, 'BTC');
                                     return btc ? `BTC  ${fmtChange(btc.change24h)}` : 'BTC';
                      },
                      x: 70, y: 213, w: 200, h: 26, bg: '#1C3A2A',
                      font: 'medium 22px', color: '#FFFFFF', align: 'left',
         },
           // ── MARKET 전체 변동률 ──
         {
                      key: 'marketChange',
                      format: (_, data) => {
                                     const c = parseFloat(data?.global?.marketCapChange24h || 0);
                                     return `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`;
                      },
                      x: 788, y: 240, w: 182, h: 58, bg: '#1C3A2A',
                      font: 'black 52px', color: '#22C55E', align: 'left',
         },
           // ── MARKET 라벨 ──
         {
                      key: 'marketLabel',
                      format: (_, data) => {
                                     const c = parseFloat(data?.global?.marketCapChange24h || 0);
                                     return `MARKET ${c >= 0 ? '+' : ''}${c.toFixed(1)}%`;
                      },
                      x: 841, y: 213, w: 129, h: 22, bg: '#1C3A2A',
                      font: 'bold 14px', color: '#AAAAAA', align: 'right',
         },
           // ── 날짜 텍스트 ──
         {
                      key: 'dateText',
                      format: () => {
                                     const now = new Date();
                                     const days = ['일', '월', '화', '수', '목', '금', '토'];
                                     const seoulDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
                                     const m = seoulDate.getMonth() + 1;
                                     const d = seoulDate.getDate();
                                     const weekday = days[seoulDate.getDay()];
                                     return `${m}월 ${d}일 ${weekday}요일 ${getTimeLabel()}`;
                      },
                      x: 449, y: 135, w: 183, h: 26, bg: '#3F2912',
                      font: 'bold 22px', color: '#FFFFFF', align: 'center',
         },
           // ── ETH 가격 ──
         {
                      key: 'ethPrice',
                      format: (_, data) => { const eth = findCoin(data, 'ETH'); return eth ? fmtPrice(eth.price) : '$--'; },
                      x: 70, y: 398, w: 160, h: 34, bg: '#FFFFFF',
                      font: 'black 28px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'ethChange',
                      format: (_, data) => { const eth = findCoin(data, 'ETH'); if (!eth) return ''; return fmtChange(eth.change24h); },
                      x: 70, y: 438, w: 160, h: 24, bg: '#FFFFFF',
                      font: 'bold 20px', color: '#22C55E', align: 'left',
         },
           // ── SOL ──
         {
                      key: 'solPrice',
                      format: (_, data) => { const sol = findCoin(data, 'SOL'); return sol ? fmtPrice(sol.price) : '$--'; },
                      x: 318, y: 398, w: 160, h: 34, bg: '#FFFFFF',
                      font: 'black 28px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'solChange',
                      format: (_, data) => { const sol = findCoin(data, 'SOL'); if (!sol) return ''; return fmtChange(sol.change24h); },
                      x: 318, y: 438, w: 160, h: 24, bg: '#FFFFFF',
                      font: 'bold 20px', color: '#22C55E', align: 'left',
         },
           // ── SUI ──
         {
                      key: 'suiPrice',
                      format: (_, data) => { const sui = findCoin(data, 'SUI'); return sui ? fmtPrice(sui.price) : '$--'; },
                      x: 566, y: 398, w: 160, h: 34, bg: '#FFFFFF',
                      font: 'black 28px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'suiChange',
                      format: (_, data) => { const sui = findCoin(data, 'SUI'); if (!sui) return ''; return fmtChange(sui.change24h); },
                      x: 566, y: 438, w: 160, h: 24, bg: '#FFFFFF',
                      font: 'bold 20px', color: '#22C55E', align: 'left',
         },
           // ── XRP ──
         {
                      key: 'xrpPrice',
                      format: (_, data) => { const xrp = findCoin(data, 'XRP'); return xrp ? fmtPrice(xrp.price) : '$--'; },
                      x: 814, y: 398, w: 160, h: 34, bg: '#FFFFFF',
                      font: 'black 28px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'xrpChange',
                      format: (_, data) => { const xrp = findCoin(data, 'XRP'); if (!xrp) return ''; return fmtChange(xrp.change24h); },
                      x: 814, y: 438, w: 160, h: 24, bg: '#FFFFFF',
                      font: 'bold 20px', color: '#22C55E', align: 'left',
         },
           // ── 김프 환율 ──
         {
                      key: 'kimchiRate',
                      format: (_, data) => {
                                     const rate = data?.kimchi?.krwRate;
                                     return rate ? `환율: ₩${rate}/USDT` : '';
                      },
                      x: 64, y: 575, w: 350, h: 26, bg: '#FFFFFF',
                      font: 'medium 20px', color: '#333333', align: 'left',
         },
           // ── 김프 프리미엄 ──
         {
                      key: 'kimchiPremium',
                      format: (_, data) => {
                                     const p = data?.kimchi?.premium;
                                     return p != null ? `프리미엄: ${p}%` : '';
                      },
                      x: 64, y: 610, w: 350, h: 29, bg: '#FFFFFF',
                      font: 'bold 22px', color: '#FF6B17', align: 'left',
         },
           // ── 공포/탐욕 지수 숫자 ──
         {
                      key: 'fearGreedValue',
                      format: (_, data) => String(data?.fearGreed?.value ?? '--'),
                      x: 582, y: 605, w: 55, h: 46, bg: '#FFFFFF',
                      font: 'black 38px', color: '#333333', align: 'left',
         },
           // ── 공포/탐욕 라벨 ──
         {
                      key: 'fearGreedLabel',
                      format: (_, data) => data?.fearGreed?.label || '--',
                      x: 641, y: 620, w: 100, h: 24, bg: '#FFFFFF',
                      font: 'bold 20px', color: '#666666', align: 'left',
         },

           // ══════════════════════════════════════════════════════
           // DeFi 핫이슈 — 각 항목: 이름+설명 한 줄 + 변동률
           // bg: '#F7F4EE'
           // ══════════════════════════════════════════════════════
           // ── DeFi #1 행 (이름 + 설명 통합) ──
         {
                      key: 'defi1Row',
                      format: (_, data) => {
                                     const items = getDefiItems(data);
                                     if (!items[0]) return '';
                                     return `${items[0].name}  ${items[0].tvl}  ${items[0].category}`;
                      },
                      x: 86, y: 778, w: 550, h: 28, bg: '#F7F4EE',
                      font: 'bold 20px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'defi1Change',
                      format: (_, data) => {
                                     const items = getDefiItems(data);
                                     if (!items[0]) return '';
                                     return fmtChange(items[0].change1d);
                      },
                      x: 900, y: 779, w: 100, h: 28, bg: '#F7F4EE',
                      font: 'black 22px', color: '#22C55E', align: 'right',
         },
           // ── DeFi #2 행 ──
         {
                      key: 'defi2Row',
                      format: (_, data) => {
                                     const items = getDefiItems(data);
                                     if (!items[1]) return '';
                                     return `${items[1].name}  ${items[1].tvl}  ${items[1].category}`;
                      },
                      x: 86, y: 822, w: 550, h: 28, bg: '#F7F4EE',
                      font: 'bold 20px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'defi2Change',
                      format: (_, data) => {
                                     const items = getDefiItems(data);
                                     if (!items[1]) return '';
                                     return fmtChange(items[1].change1d);
                      },
                      x: 900, y: 823, w: 100, h: 28, bg: '#F7F4EE',
                      font: 'black 22px', color: '#22C55E', align: 'right',
         },
           // ── DeFi #3 행 ──
         {
                      key: 'defi3Row',
                      format: (_, data) => {
                                     const items = getDefiItems(data);
                                     if (!items[2]) return '';
                                     return `${items[2].name}  ${items[2].tvl}  ${items[2].category}`;
                      },
                      x: 86, y: 862, w: 550, h: 28, bg: '#F7F4EE',
                      font: 'bold 20px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'defi3Change',
                      format: (_, data) => {
                                     const items = getDefiItems(data);
                                     if (!items[2]) return '';
                                     return fmtChange(items[2].change1d);
                      },
                      x: 900, y: 863, w: 100, h: 28, bg: '#F7F4EE',
                      font: 'black 22px', color: '#EF4444', align: 'right',
         },

           // ══════════════════════════════════════════════════════
           // 트렌딩 TOP 3 — 동적 오버레이
           // bg: '#F7F4EE'
           // ══════════════════════════════════════════════════════
         {
                      key: 'trend1Name',
                      format: (_, data) => {
                                     const t = data?.trending;
                                     if (!t?.[0]) return '';
                                     return `${t[0].symbol} (${t[0].name})`;
                      },
                      x: 110, y: 1005, w: 500, h: 31, bg: '#F7F4EE',
                      font: 'black 24px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'trend1Change',
                      format: (_, data) => {
                                     const t = data?.trending;
                                     if (!t?.[0]) return '';
                                     return fmtChange(t[0].priceChange24h);
                      },
                      x: 870, y: 1003, w: 130, h: 33, bg: '#F7F4EE',
                      font: 'black 26px', color: '#22C55E', align: 'right',
         },
         {
                      key: 'trend2Name',
                      format: (_, data) => {
                                     const t = data?.trending;
                                     if (!t?.[1]) return '';
                                     return `${t[1].symbol} (${t[1].name})`;
                      },
                      x: 110, y: 1053, w: 500, h: 31, bg: '#F7F4EE',
                      font: 'black 24px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'trend2Change',
                      format: (_, data) => {
                                     const t = data?.trending;
                                     if (!t?.[1]) return '';
                                     return fmtChange(t[1].priceChange24h);
                      },
                      x: 870, y: 1051, w: 130, h: 33, bg: '#F7F4EE',
                      font: 'black 26px', color: '#22C55E', align: 'right',
         },
         {
                      key: 'trend3Name',
                      format: (_, data) => {
                                     const t = data?.trending;
                                     if (!t?.[2]) return '';
                                     return `${t[2].symbol} (${t[2].name})`;
                      },
                      x: 110, y: 1101, w: 500, h: 31, bg: '#F7F4EE',
                      font: 'black 24px', color: '#1a1a1a', align: 'left',
         },
         {
                      key: 'trend3Change',
                      format: (_, data) => {
                                     const t = data?.trending;
                                     if (!t?.[2]) return '';
                                     return fmtChange(t[2].priceChange24h);
                      },
                      x: 870, y: 1099, w: 130, h: 33, bg: '#F7F4EE',
                      font: 'black 26px', color: '#22C55E', align: 'right',
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

  for (const ov of TEXT_OVERLAYS) {
               try {
                              const value = ov.format(null, data);
                              if (!value) {
                                               console.log(`  ⏭️ ${ov.key}: 빈 값 — 스킵`);
                                               continue;
                              }

                 const sx = ov.x * scale;
                              const sy = ov.y * scale;
                              const sw = ov.w * scale;
                              const sh = ov.h * scale;

                 // 1) 배경색으로 기존 텍스트 영역 덮기
                 ctx.fillStyle = ov.bg;
                              ctx.fillRect(sx, sy, sw, sh);

                 // 2) 폰트 설정
                 const sizeMatch = ov.font.match(/(\d+)px/);
                              const fontSize = parseInt(sizeMatch?.[1] || '16') * scale;
                              let weight = '400';
                              if (ov.font.includes('black')) weight = '900';
                              else if (ov.font.includes('bold')) weight = '700';
                              else if (ov.font.includes('medium')) weight = '500';

                 ctx.font = `${weight} ${fontSize}px "Noto Sans KR", sans-serif`;

                 // 3) 텍스트 색상 (변동률 음수면 빨간색)
                 let textColor = ov.color;
                              if ((ov.key.includes('Change') || ov.key.includes('change')) && value.startsWith('-')) {
                                               textColor = '#EF4444';
                              }
                              ctx.fillStyle = textColor;

                 // 4) 텍스트 baseline=top으로 그리기
                 ctx.textBaseline = 'top';
                              const padding = 2 * scale;

                 if (ov.align === 'right') {
                                  ctx.textAlign = 'right';
                                  ctx.fillText(value, sx + sw, sy + padding);
                 } else if (ov.align === 'center') {
                                  ctx.textAlign = 'center';
                                  ctx.fillText(value, sx + sw / 2, sy + padding);
                 } else {
                                  ctx.textAlign = 'left';
                                  ctx.fillText(value, sx, sy + padding);
                 }

                 console.log(`  ✅ ${ov.key}: "${value}" @ (${ov.x},${ov.y})`);
               } catch (e) {
                              console.error(`  ⚠️ 오버레이 에러 (${ov.key}): ${e.message}`);
               }
  }
}

// ============================================================
// 메인 Export 함수
// ============================================================
export async function exportFigmaBanner(data) {
           const pngBuffer = await fetchFigmaPNG();
           if (!pngBuffer) {
                        // Figma API 실패 → canvas fallback 배너 생성
                        console.log('  🔄 Figma API 실패 — canvas fallback 배너 생성 중...');
                        try {
                                       const fallbackBuffer = await renderCanvasBanner(data);
                                       console.log(`  ✅ Canvas fallback 배너 생성 완료 (${(fallbackBuffer.length / 1024).toFixed(1)}KB)`);
                                       const bannersDir = './banners';
                                       if (!existsSync(bannersDir)) await mkdir(bannersDir, { recursive: true });
                                       const dateStr = new Date().toISOString().split('T')[0];
                                       const filename = `${bannersDir}/banner_${dateStr}_fallback.png`;
                                       await writeFile(filename, fallbackBuffer);
                                       return { buffer: fallbackBuffer, filename, size: fallbackBuffer.length };
                        } catch (fbErr) {
                                       console.error(`  ❌ Canvas fallback 에러: ${fbErr.message}`);
                                       return null;
                        }
           }

  try {
               const img = await loadImage(pngBuffer);
               const canvas = createCanvas(img.width, img.height);
               const ctx = canvas.getContext('2d');
               ctx.drawImage(img, 0, 0);

             if (data) {
                            const scale = FIGMA_CONFIG.scale;
                            console.log('  🖊️ 실시간 데이터 오버레이 적용 중...');
                            console.log(`  📐 이미지 크기: ${img.width}x${img.height}, scale: ${scale}`);
                            if (data.market && Array.isArray(data.market)) {
                                             data.market.forEach(c => console.log(`    - ${c.symbol}: $${c.price} (${c.change24h}%)`));
                            }
                            if (data.trending && Array.isArray(data.trending)) {
                                             data.trending.slice(0, 3).forEach((t, i) => console.log(`    - 트렌딩 ${i+1}: ${t.symbol} (${t.name}) ${t.priceChange24h}%`));
                            }
                            overlayTexts(canvas, ctx, data, scale);
                            console.log('  ✅ 오버레이 완료');
             }

             const resultBuffer = canvas.toBuffer('image/png');
               const bannersDir = './banners';
               if (!existsSync(bannersDir)) await mkdir(bannersDir, { recursive: true });
               const dateStr = new Date().toISOString().split('T')[0];
               const filename = `${bannersDir}/banner_${dateStr}.png`;
               await writeFile(filename, resultBuffer);
               console.log(`  ✅ 배너 저장: ${filename} (${(resultBuffer.length / 1024).toFixed(1)}KB)`);
               return { buffer: resultBuffer, filename, size: resultBuffer.length };
  } catch (err) {
               console.error(`  ❌ node-canvas 오버레이 에러: ${err.message}`);
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
                                       const trimmedCaption = caption.length > 1020 ? caption.substring(0, 1020) + '...' : caption;
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
