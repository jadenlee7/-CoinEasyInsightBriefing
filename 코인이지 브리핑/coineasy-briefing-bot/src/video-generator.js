/**
 * 코인이지 YouTube Shorts 영상 생성 모듈 v3
 * 인포그래픽 카드 슬라이드쇼 + Edge TTS + FFmpeg
 * 9:16 세로 포맷, 30~45초 쇼츠 생성
 *
 * v3 개선사항:
 * - 업비트 원화 가격 한국식 표기 (1억 530만원)
 * - 자막 카드별 분리 + 하단 고정
 * - 비주얼 강화: 게이지바, 그라데이션, 아이콘 텍스트
 * - $ 기호 제거 (shell 호환)
 */
import { exec } from 'child_process';
import { writeFile, unlink, mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================
// 색상 & 디자인 상수
// ============================================================
const COLORS = {
     bg: '0x0D1117',
     card: '0x161B22',
     cardLight: '0x1C2333',
     gold: '0xFFD700',
     green: '0x3FB950',
     red: '0xF85149',
     white: '0xFFFFFF',
     gray: '0x8B949E',
     accent: '0x1F6FEB',
     orange: '0xFF6B35',
     purple: '0xA855F7',
     subtitleBg: '0x000000',
};

// ============================================================
// 한국식 원화 포맷 (105391000 → "1억 539만")
// ============================================================
function formatKrw(numStr) {
     const n = typeof numStr === 'string' ? parseInt(numStr.replace(/,/g, '')) : numStr;
     if (isNaN(n)) return '0원';
     const eok = Math.floor(n / 100000000);
     const man = Math.floor((n % 100000000) / 10000);
     if (eok > 0 && man > 0) return `${eok}억 ${man}만원`;
     if (eok > 0) return `${eok}억원`;
     if (man > 0) return `${man}만원`;
     return `${n.toLocaleString()}원`;
}

// ============================================================
// Edge TTS로 한국어 음성 생성
// ============================================================
async function generateTTS(text, outputPath) {
     console.log('[TTS] Edge TTS 음성 생성 중...');
     const safeText = text
       .replace(/"/g, '\\"')
       .replace(/\$/g, '\\$')
       .replace(/`/g, '\\`');
     const cmd = `edge-tts --voice "ko-KR-SunHiNeural" --rate="+5%" --text "${safeText}" --write-media "${outputPath}"`;
     try {
            await execAsync(cmd, { timeout: 30000 });
            console.log(`[TTS] 음성 파일 생성 완료: ${outputPath}`);
            return true;
     } catch (err) {
            console.error(`[TTS 에러] ${err.message}`);
            return false;
     }
}

// ============================================================
// 음성 길이 측정
// ============================================================
async function getAudioDuration(audioPath) {
     try {
            const { stdout } = await execAsync(
                     `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`
                   );
            return parseFloat(stdout.trim());
     } catch {
            return 30;
     }
}

// ============================================================
// 카드별 FFmpeg drawtext 필터 생성 (v3 - 비주얼 강화)
// ============================================================
function buildCardFilters(cards, totalDuration) {
     const cardDuration = totalDuration / cards.length;
     let filters = [];

  // 배경
  filters.push(`drawbox=x=0:y=0:w=1080:h=1920:color=${COLORS.bg}@1:t=fill`);

  cards.forEach((card, i) => {
         const startT = i * cardDuration;
         const endT = (i + 1) * cardDuration;
         const enable = `between(t,${startT.toFixed(2)},${endT.toFixed(2)})`;
         const fontNoto = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
         const fontDeja = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

                    switch (card.type) {
                       case 'intro':
                                  // 상단 골드 바
             filters.push(`drawbox=x=0:y=0:w=1080:h=8:color=${COLORS.gold}@1:t=fill:enable='${enable}'`);
                                  // 하단 골드 바
             filters.push(`drawbox=x=0:y=1912:w=1080:h=8:color=${COLORS.gold}@1:t=fill:enable='${enable}'`);
                                  // 로고
             filters.push(`drawtext=text='COINEASY':fontsize=80:fontcolor=${COLORS.gold}:x=(w-text_w)/2:y=350:fontfile=${fontDeja}:enable='${enable}'`);
                                  // 서브타이틀
             filters.push(`drawtext=text='${escFFmpeg('Daily Crypto Briefing')}':fontsize=30:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=450:fontfile=${fontDeja}:enable='${enable}'`);
                                  // 구분선
             filters.push(`drawbox=x=300:y=520:w=480:h=3:color=${COLORS.gold}@0.8:t=fill:enable='${enable}'`);
                                  // 날짜
             filters.push(`drawtext=text='${escFFmpeg(card.date || '')}':fontsize=48:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=580:fontfile=${fontNoto}:enable='${enable}'`);
                                  // 헤드라인
             if (card.headline) {
                          const headLines = wrapText(card.headline, 14);
                          headLines.forEach((line, li) => {
                                         filters.push(`drawtext=text='${escFFmpeg(line)}':fontsize=54:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=${720 + li * 72}:fontfile=${fontNoto}:enable='${enable}'`);
                          });
             }
                                  // 하단 채널
             filters.push(`drawtext=text='@CoinEasy':fontsize=28:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=1750:fontfile=${fontDeja}:enable='${enable}'`);
                                  break;

                       case 'btc':
                                  // ---- BTC 카드 ----
             // 카드 배경
             filters.push(`drawbox=x=40:y=140:w=1000:h=520:color=${COLORS.card}@0.95:t=fill:enable='${enable}'`);
                                  // 카드 상단 골드 라인
             filters.push(`drawbox=x=40:y=140:w=1000:h=5:color=${COLORS.gold}@1:t=fill:enable='${enable}'`);
                                  // BTC 아이콘 원
             filters.push(`drawbox=x=80:y=180:w=70:h=70:color=${COLORS.gold}@0.2:t=fill:enable='${enable}'`);
                                  filters.push(`drawtext=text='B':fontsize=44:fontcolor=${COLORS.gold}:x=98:y=190:fontfile=${fontDeja}:enable='${enable}'`);
                                  // BTC 이름
             filters.push(`drawtext=text='Bitcoin':fontsize=36:fontcolor=${COLORS.white}:x=170:y=190:fontfile=${fontDeja}:enable='${enable}'`);
                                  filters.push(`drawtext=text='BTC':fontsize=24:fontcolor=${COLORS.gray}:x=170:y=235:fontfile=${fontDeja}:enable='${enable}'`);
                                  // 등락률 (우측 상단)
             const btcColor = (card.changeNum || 0) >= 0 ? COLORS.green : COLORS.red;
                                  const btcArrow = (card.changeNum || 0) >= 0 ? '+' : '';
                                  filters.push(`drawbox=x=750:y=185:w=260:h=55:color=${btcColor}@0.15:t=fill:enable='${enable}'`);
                                  filters.push(`drawtext=text='${btcArrow}${card.change || '0%'}':fontsize=36:fontcolor=${btcColor}:x=770:y=193:fontfile=${fontDeja}:enable='${enable}'`);
                                  // 가격 (큰 글씨 중앙)
             filters.push(`drawtext=text='${escFFmpeg(card.price || '')}':fontsize=80:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=340:fontfile=${fontDeja}:enable='${enable}'`);
                                  // USD 라벨
             filters.push(`drawtext=text='USD':fontsize=28:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=440:fontfile=${fontDeja}:enable='${enable}'`);
                                  // 원화 가격
             if (card.krwPrice) {
                          filters.push(`drawtext=text='${escFFmpeg(card.krwPrice)}':fontsize=32:fontcolor=${COLORS.gold}:x=(w-text_w)/2:y=500:fontfile=${fontNoto}:enable='${enable}'`);
             }
                                  // 24h 라벨
             filters.push(`drawtext=text='24h':fontsize=22:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=545:fontfile=${fontDeja}:enable='${enable}'`);

             // ---- ETH 카드 (하단) ----
             if (card.ethPrice) {
                          filters.push(`drawbox=x=40:y=720:w=1000:h=280:color=${COLORS.card}@0.95:t=fill:enable='${enable}'`);
                          filters.push(`drawbox=x=40:y=720:w=1000:h=4:color=${COLORS.accent}@1:t=fill:enable='${enable}'`);
                          // ETH 아이콘
                                    filters.push(`drawbox=x=80:y=755:w=55:h=55:color=${COLORS.accent}@0.2:t=fill:enable='${enable}'`);
                          filters.push(`drawtext=text='E':fontsize=34:fontcolor=${COLORS.accent}:x=94:y=763:fontfile=${fontDeja}:enable='${enable}'`);
                          // ETH 이름
                                    filters.push(`drawtext=text='Ethereum':fontsize=30:fontcolor=${COLORS.white}:x=155:y=760:fontfile=${fontDeja}:enable='${enable}'`);
                          filters.push(`drawtext=text='ETH':fontsize=20:fontcolor=${COLORS.gray}:x=155:y=798:fontfile=${fontDeja}:enable='${enable}'`);
                          // ETH 가격
                                    filters.push(`drawtext=text='${escFFmpeg(card.ethPrice)}':fontsize=52:fontcolor=${COLORS.white}:x=100:y=850:fontfile=${fontDeja}:enable='${enable}'`);
                          filters.push(`drawtext=text='USD':fontsize=22:fontcolor=${COLORS.gray}:x=100:y=915:fontfile=${fontDeja}:enable='${enable}'`);
                          // ETH 등락률
                                    const ethColor = (card.ethChangeNum || 0) >= 0 ? COLORS.green : COLORS.red;
                          const ethArrow = (card.ethChangeNum || 0) >= 0 ? '+' : '';
                          filters.push(`drawbox=x=750:y=855:w=240:h=48:color=${ethColor}@0.15:t=fill:enable='${enable}'`);
                          filters.push(`drawtext=text='${ethArrow}${card.ethChange || ''}':fontsize=34:fontcolor=${ethColor}:x=770:y=860:fontfile=${fontDeja}:enable='${enable}'`);
             }
                                  break;

                       case 'indicators':
                                  // ---- 공포/탐욕 카드 ----
             filters.push(`drawbox=x=40:y=140:w=1000:h=540:color=${COLORS.card}@0.95:t=fill:enable='${enable}'`);
                                  filters.push(`drawbox=x=40:y=140:w=1000:h=5:color=${card.fgColor || COLORS.gold}@1:t=fill:enable='${enable}'`);
                                  // 타이틀
             filters.push(`drawtext=text='${escFFmpeg('공포 탐욕 지수')}':fontsize=32:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=180:fontfile=${fontNoto}:enable='${enable}'`);
                                  // 큰 숫자
             filters.push(`drawtext=text='${card.fearGreedValue || '??'}':fontsize=130:fontcolor=${card.fgColor || COLORS.white}:x=(w-text_w)/2:y=250:fontfile=${fontDeja}:enable='${enable}'`);
                                  // 라벨
             filters.push(`drawtext=text='${escFFmpeg(card.fearGreedLabel || '')}':fontsize=44:fontcolor=${card.fgColor || COLORS.white}:x=(w-text_w)/2:y=410:fontfile=${fontNoto}:enable='${enable}'`);
                                  // 게이지 바 배경
             filters.push(`drawbox=x=100:y=500:w=880:h=20:color=${COLORS.gray}@0.3:t=fill:enable='${enable}'`);
                                  // 게이지 바 채우기 (0~100 범위)
             const fgVal = parseInt(card.fearGreedValue) || 50;
                                  const gaugeW = Math.max(10, Math.min(880, Math.round(880 * fgVal / 100)));
                                  filters.push(`drawbox=x=100:y=500:w=${gaugeW}:h=20:color=${card.fgColor || COLORS.gold}@0.9:t=fill:enable='${enable}'`);
                                  // 게이지 라벨
             filters.push(`drawtext=text='0':fontsize=18:fontcolor=${COLORS.gray}:x=100:y=530:fontfile=${fontDeja}:enable='${enable}'`);
                                  filters.push(`drawtext=text='100':fontsize=18:fontcolor=${COLORS.gray}:x=950:y=530:fontfile=${fontDeja}:enable='${enable}'`);
                                  // 극단 라벨
             filters.push(`drawtext=text='${escFFmpeg('극도의 공포')}':fontsize=16:fontcolor=${COLORS.red}:x=100:y=555:fontfile=${fontNoto}:enable='${enable}'`);
                                  filters.push(`drawtext=text='${escFFmpeg('극도의 탐욕')}':fontsize=16:fontcolor=${COLORS.green}:x=890:y=555:fontfile=${fontNoto}:enable='${enable}'`);

             // ---- 김치 프리미엄 카드 ----
             filters.push(`drawbox=x=40:y=740:w=1000:h=380:color=${COLORS.card}@0.95:t=fill:enable='${enable}'`);
                                  filters.push(`drawbox=x=40:y=740:w=1000:h=4:color=${COLORS.accent}@1:t=fill:enable='${enable}'`);
                                  filters.push(`drawtext=text='${escFFmpeg('김치 프리미엄')}':fontsize=32:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=775:fontfile=${fontNoto}:enable='${enable}'`);
                                  // 프리미엄 수치
             const kpVal = parseFloat(card.kimchiPremium || '0');
                                  const kpColor = kpVal >= 0 ? COLORS.green : COLORS.red;
                                  const kpSign = kpVal >= 0 ? '+' : '';
                                  filters.push(`drawtext=text='${kpSign}${card.kimchiPremium || '0'}%%':fontsize=88:fontcolor=${kpColor}:x=(w-text_w)/2:y=840:fontfile=${fontDeja}:enable='${enable}'`);
                                  // 업비트 가격 (한국식)
             if (card.kimchiDetail) {
                          filters.push(`drawtext=text='${escFFmpeg(card.kimchiDetail)}':fontsize=28:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=960:fontfile=${fontNoto}:enable='${enable}'`);
             }
                                  // 환율 정보
             if (card.krwRate) {
                          filters.push(`drawtext=text='${escFFmpeg(card.krwRate)}':fontsize=24:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=1000:fontfile=${fontNoto}:enable='${enable}'`);
             }
                                  break;

                       case 'trending':
                                  filters.push(`drawtext=text='${escFFmpeg('트렌딩 코인')}':fontsize=44:fontcolor=${COLORS.gold}:x=(w-text_w)/2:y=140:fontfile=${fontNoto}:enable='${enable}'`);
                                  filters.push(`drawbox=x=250:y=205:w=580:h=3:color=${COLORS.gold}@0.5:t=fill:enable='${enable}'`);
                                  // 트렌딩 코인 리스트
             const coins = card.coins || [];
                                  coins.slice(0, 4).forEach((coin, ci) => {
                                               const yBase = 260 + ci * 220;
                                               // 카드 배경
                                                                      filters.push(`drawbox=x=60:y=${yBase}:w=960:h=190:color=${COLORS.card}@0.95:t=fill:enable='${enable}'`);
                                               // 좌측 색상 바
                                                                      const coinBarColor = (coin.changeNum || 0) >= 0 ? COLORS.green : COLORS.red;
                                               filters.push(`drawbox=x=60:y=${yBase}:w=6:h=190:color=${coinBarColor}@1:t=fill:enable='${enable}'`);
                                               // 순위 배지
                                                                      filters.push(`drawbox=x=90:y=${yBase + 20}:w=50:h=50:color=${COLORS.gold}@0.15:t=fill:enable='${enable}'`);
                                               filters.push(`drawtext=text='${ci + 1}':fontsize=32:fontcolor=${COLORS.gold}:x=103:y=${yBase + 26}:fontfile=${fontDeja}:enable='${enable}'`);
                                               // 심볼
                                                                      filters.push(`drawtext=text='${escFFmpeg(coin.symbol || '')}':fontsize=40:fontcolor=${COLORS.white}:x=170:y=${yBase + 25}:fontfile=${fontDeja}:enable='${enable}'`);
                                               // 이름
                                                                      filters.push(`drawtext=text='${escFFmpeg(coin.name || '')}':fontsize=24:fontcolor=${COLORS.gray}:x=170:y=${yBase + 80}:fontfile=${fontNoto}:enable='${enable}'`);
                                               // 등락률 박스
                                                                      const coinColor = (coin.changeNum || 0) >= 0 ? COLORS.green : COLORS.red;
                                               const coinArrow = (coin.changeNum || 0) >= 0 ? '+' : '';
                                               filters.push(`drawbox=x=720:y=${yBase + 25}:w=270:h=55:color=${coinColor}@0.15:t=fill:enable='${enable}'`);
                                               filters.push(`drawtext=text='${coinArrow}${coin.change || ''}':fontsize=36:fontcolor=${coinColor}:x=740:y=${yBase + 32}:fontfile=${fontDeja}:enable='${enable}'`);
                                  });
                                  break;

                       case 'outro':
                                  // COINEASY 브랜딩
             filters.push(`drawtext=text='COINEASY':fontsize=72:fontcolor=${COLORS.gold}:x=(w-text_w)/2:y=350:fontfile=${fontDeja}:enable='${enable}'`);
                                  filters.push(`drawbox=x=250:y=450:w=580:h=3:color=${COLORS.gold}@0.6:t=fill:enable='${enable}'`);
                                  // CTA
             filters.push(`drawtext=text='${escFFmpeg('매일 아침 브리핑 받아보세요')}':fontsize=40:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=540:fontfile=${fontNoto}:enable='${enable}'`);
                                  // 텔레그램 버튼
             filters.push(`drawbox=x=220:y=680:w=640:h=100:color=${COLORS.accent}@0.9:t=fill:enable='${enable}'`);
                                  filters.push(`drawtext=text='${escFFmpeg('텔레그램 @coiniseasy')}':fontsize=38:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=710:fontfile=${fontNoto}:enable='${enable}'`);
                                  // 유튜브
             filters.push(`drawtext=text='${escFFmpeg('구독과 좋아요 부탁드려요')}':fontsize=32:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=860:fontfile=${fontNoto}:enable='${enable}'`);
                                  // 하단
             filters.push(`drawtext=text='@CoinEasy':fontsize=28:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=1750:fontfile=${fontDeja}:enable='${enable}'`);
                                  break;
                    }

                    // ---- 자막 (모든 카드 공통 하단 영역) ----
                    if (card.subtitle) {
                             // 자막 배경 반투명 박스
           filters.push(`drawbox=x=0:y=1350:w=1080:h=200:color=${COLORS.subtitleBg}@0.7:t=fill:enable='${enable}'`);
                             const subLines = wrapText(card.subtitle, 18);
                             subLines.forEach((line, li) => {
                                        filters.push(`drawtext=text='${escFFmpeg(line)}':fontsize=38:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=${1380 + li * 52}:fontfile=${fontNoto}:enable='${enable}'`);
                             });
                    }
  });

  return filters.join(',\\\n');
}

// ============================================================
// FFmpeg 텍스트 이스케이프
// ============================================================
function escFFmpeg(text) {
     if (!text) return '';
     return text
       .replace(/\\/g, '\\\\\\\\')
       .replace(/'/g, "'\\\\\\''")
       .replace(/:/g, '\\\\:')
       .replace(/%/g, '%%')
       .replace(/\[/g, '\\\\[')
       .replace(/\]/g, '\\\\]');
}

// ============================================================
// 텍스트 줄바꿈
// ============================================================
function wrapText(text, maxChars) {
     if (!text || text.length <= maxChars) return [text || ''];
     const lines = [];
     let remaining = text;
     while (remaining.length > maxChars) {
            let breakPoint = remaining.lastIndexOf(' ', maxChars);
            if (breakPoint <= 0) breakPoint = maxChars;
            lines.push(remaining.substring(0, breakPoint).trim());
            remaining = remaining.substring(breakPoint).trim();
     }
     if (remaining) lines.push(remaining);
     return lines;
}

// ============================================================
// FFmpeg로 영상 생성
// ============================================================
async function generateVideo(audioPath, outputPath, duration, cards) {
     console.log('[FFmpeg] 인포그래픽 카드 영상 합성 중...');

  const filterComplex = buildCardFilters(cards, duration);

  const cmd = `ffmpeg -y \
         -f lavfi -i "color=c=${COLORS.bg}:s=1080x1920:d=${duration},format=yuv420p" \
         -i "${audioPath}" \
         -vf "${filterComplex}" \
         -c:v libx264 -preset fast -crf 23 \
         -c:a aac -b:a 128k \
         -shortest \
         -movflags +faststart \
         "${outputPath}"`;

  try {
         await execAsync(cmd, { timeout: 180000 });
         console.log(`[FFmpeg] 영상 생성 완료: ${outputPath}`);
         return true;
  } catch (err) {
         console.error(`[FFmpeg 에러] ${err.message}`);
         if (err.stderr) {
                  const lastLines = err.stderr.split('\n').slice(-10).join('\n');
                  console.error(`[FFmpeg stderr 마지막 10줄]\n${lastLines}`);
         }
         return false;
  }
}

// ============================================================
// 공포/탐욕 지수 색상
// ============================================================
function getFearGreedColor(value) {
     const v = parseInt(value);
     if (v <= 25) return COLORS.red;
     if (v <= 40) return COLORS.orange;
     if (v <= 60) return COLORS.gold;
     if (v <= 75) return '0x7CFC00';
     return COLORS.green;
}

// ============================================================
// 메인: 쇼츠 영상 생성 파이프라인
// ============================================================
export async function createShortsVideo(script, marketData) {
     console.log('[쇼츠 생성] YouTube Shorts 인포그래픽 영상 생성 시작');

  const tmpDir = '/tmp/shorts';
     if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });

  const dateStr = new Date().toISOString().split('T')[0];
     const audioPath = `${tmpDir}/tts_${dateStr}.mp3`;
     const outputPath = `${tmpDir}/shorts_${dateStr}.mp4`;

  try {
         // 1. TTS 음성 생성
       const ttsOk = await generateTTS(script.narration, audioPath);
         if (!ttsOk) {
                  console.error('[쇼츠 생성] TTS 실패');
                  return null;
         }

       // 2. 음성 길이 측정
       const duration = await getAudioDuration(audioPath);
         console.log(`[쇼츠 생성] 음성 길이: ${duration.toFixed(1)}초`);

       // 3. 카드 데이터 구성
       const cards = buildCardsFromData(script, marketData, dateStr);
         console.log(`[쇼츠 생성] 카드 ${cards.length}장 구성 완료`);

       // 4. FFmpeg로 영상 합성
       const videoOk = await generateVideo(audioPath, outputPath, duration, cards);
         if (!videoOk) {
                  console.error('[쇼츠 생성] 영상 합성 실패');
                  return null;
         }

       console.log(`[쇼츠 생성] 완료: ${outputPath}`);
         return outputPath;
  } catch (err) {
         console.error(`[쇼츠 생성 에러] ${err.message}`);
         return null;
  }
}

// ============================================================
// 마켓 데이터 -> 카드 배열 변환 (v3)
// ============================================================
function buildCardsFromData(script, data, dateStr) {
     const cards = [];
     const subtitles = script.subtitleLines || [];
     const subsPerCard = Math.ceil(subtitles.length / 5);

  // 카드 1: 인트로
  cards.push({
         type: 'intro',
         date: dateStr.replace(/-/g, '.'),
         subtitle: subtitles.slice(0, subsPerCard).join(' '),
         headline: script.headline || subtitles[0] || '',
  });

  // 카드 2: BTC 시세
  const btc = data?.market?.[0];
     const eth = data?.market?.[1];
     const kimchi = data?.kimchi;
     cards.push({
            type: 'btc',
            price: btc ? `${Number(btc.price).toLocaleString()}` : '--,---',
            change: btc ? `${btc.change24h}%` : '0%',
            changeNum: btc ? parseFloat(btc.change24h) : 0,
            krwPrice: kimchi ? formatKrw(kimchi.upbitBtcKrw) : '',
            ethPrice: eth ? `${Number(eth.price).toLocaleString()}` : '',
            ethChange: eth ? `${eth.change24h}%` : '',
            ethChangeNum: eth ? parseFloat(eth.change24h) : 0,
            subtitle: subtitles.slice(subsPerCard, subsPerCard * 2).join(' '),
     });

  // 카드 3: 공포/탐욕 + 김프
  const fg = data?.fearGreed;
     cards.push({
            type: 'indicators',
            fearGreedValue: fg?.value || '??',
            fearGreedLabel: fg?.label || '',
            fgColor: fg ? getFearGreedColor(fg.value) : COLORS.gray,
            kimchiPremium: kimchi?.premium || '0',
            kimchiDetail: kimchi ? `업비트 BTC ${formatKrw(kimchi.upbitBtcKrw)}` : '',
            krwRate: kimchi ? `환율 ${kimchi.krwRate}원/USDT` : '',
            subtitle: subtitles.slice(subsPerCard * 2, subsPerCard * 3).join(' '),
     });

  // 카드 4: 트렌딩
  const trending = data?.trending || [];
     cards.push({
            type: 'trending',
            coins: trending.slice(0, 4).map(c => ({
                     symbol: c.symbol || '',
                     name: c.name || '',
                     change: c.priceChange24h ? `${c.priceChange24h}%` : '',
                     changeNum: parseFloat(c.priceChange24h || 0),
            })),
            subtitle: subtitles.slice(subsPerCard * 3, subsPerCard * 4).join(' '),
     });

  // 카드 5: 아웃트로
  cards.push({
         type: 'outro',
         subtitle: subtitles.slice(subsPerCard * 4).join(' '),
  });

  return cards;
}

// 임시 파일 정리
export async function cleanupTempFiles() {
     const tmpDir = '/tmp/shorts';
     try {
            const dateStr = new Date().toISOString().split('T')[0];
            const files = [
                     `${tmpDir}/tts_${dateStr}.mp3`,
                     `${tmpDir}/shorts_${dateStr}.mp4`,
                   ];
            for (const f of files) {
                     if (existsSync(f)) await unlink(f);
            }
            console.log('[정리] 임시 파일 삭제 완료');
     } catch (err) {
            console.error(`[정리 에러] ${err.message}`);
     }
}
