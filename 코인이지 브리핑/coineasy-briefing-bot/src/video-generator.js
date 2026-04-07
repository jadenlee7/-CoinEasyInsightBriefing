/**
 * 코인이지 YouTube Shorts 영상 생성 모듈 v2
 * 인포그래픽 카드 슬라이드쇼 + Edge TTS + FFmpeg
 * 9:16 세로 포맷, 30~45초 쇼츠 생성
 *
 * 카드 구조:
 *  1) 인트로 카드 (COINEASY 브랜딩 + 날짜 + 헤드라인)
 *  2) BTC 시세 카드 (가격 + 등락률 + 큰 숫자)
 *  3) 시장 지표 카드 (공포/탐욕 + 김치프리미엄)
 *  4) 트렌딩/DeFi 카드
 *  5) 아웃트로 카드 (CTA - 텔레그램 유입)
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
   bg: '0x0D1117',        // GitHub dark bg
   card: '0x161B22',      // 카드 배경
   gold: '0xFFD700',      // COINEASY 브랜드
   green: '0x3FB950',     // 상승
   red: '0xF85149',       // 하락
   white: '0xFFFFFF',
   gray: '0x8B949E',
   accent: '0x1F6FEB',    // 파란 포인트
   darkAccent: '0x0D1117',
};

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
// 카드별 FFmpeg drawtext 필터 생성
// ============================================================
function buildCardFilters(cards, totalDuration) {
   const cardDuration = totalDuration / cards.length;
   let filters = [];

  // 배경 그라데이션 (다크 테마)
  filters.push(`drawbox=x=0:y=0:w=1080:h=1920:color=${COLORS.bg}@1:t=fill`);

  cards.forEach((card, i) => {
       const startT = i * cardDuration;
       const endT = (i + 1) * cardDuration;
       const fadeIn = startT + 0.3;
       const enable = `between(t,${startT.toFixed(2)},${endT.toFixed(2)})`;
       const enableFade = `between(t,${startT.toFixed(2)},${fadeIn.toFixed(2)})`;
       const fontNoto = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
       const fontDeja = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

                    switch (card.type) {
                     case 'intro':
                              // 상단 골드 라인
           filters.push(`drawbox=x=0:y=0:w=1080:h=6:color=${COLORS.gold}@1:t=fill:enable='${enable}'`);
                              // COINEASY 로고 텍스트
           filters.push(`drawtext=text='COINEASY':fontsize=80:fontcolor=${COLORS.gold}:x=(w-text_w)/2:y=300:fontfile=${fontDeja}:enable='${enable}'`);
                              // 서브타이틀
           filters.push(`drawtext=text='${escFFmpeg(card.subtitle || '데일리 크립토 브리핑')}':fontsize=36:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=400:fontfile=${fontNoto}:enable='${enable}'`);
                              // 구분선
           filters.push(`drawbox=x=200:y=480:w=680:h=3:color=${COLORS.gold}@0.6:t=fill:enable='${enable}'`);
                              // 날짜
           filters.push(`drawtext=text='${escFFmpeg(card.date || '')}':fontsize=44:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=540:fontfile=${fontNoto}:enable='${enable}'`);
                              // 헤드라인
           if (card.headline) {
                      const headLines = wrapText(card.headline, 14);
                      headLines.forEach((line, li) => {
                                   filters.push(`drawtext=text='${escFFmpeg(line)}':fontsize=52:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=${680 + li * 70}:fontfile=${fontNoto}:enable='${enable}'`);
                      });
           }
                              // 하단 채널명
           filters.push(`drawtext=text='@CoinEasy':fontsize=30:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=1750:fontfile=${fontDeja}:enable='${enable}'`);
                              break;

                     case 'btc':
                              // 카드 배경 박스
           filters.push(`drawbox=x=40:y=200:w=1000:h=700:color=${COLORS.card}@0.9:t=fill:enable='${enable}'`);
                              // 카드 상단 악센트
           filters.push(`drawbox=x=40:y=200:w=1000:h=6:color=${COLORS.gold}@1:t=fill:enable='${enable}'`);
                              // BTC 아이콘 텍스트
           filters.push(`drawtext=text='BTC':fontsize=44:fontcolor=${COLORS.gold}:x=100:y=250:fontfile=${fontDeja}:enable='${enable}'`);
                              filters.push(`drawtext=text='Bitcoin':fontsize=32:fontcolor=${COLORS.gray}:x=220:y=260:fontfile=${fontDeja}:enable='${enable}'`);
                              // 가격 (큰 글씨)
           filters.push(`drawtext=text='${escFFmpeg(card.price || '')}':fontsize=88:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=380:fontfile=${fontDeja}:enable='${enable}'`);
                              // 등락률
           const btcColor = (card.changeNum || 0) >= 0 ? COLORS.green : COLORS.red;
                              const btcArrow = (card.changeNum || 0) >= 0 ? '+' : '';
                              filters.push(`drawtext=text='${btcArrow}${card.change || '0%'}':fontsize=56:fontcolor=${btcColor}:x=(w-text_w)/2:y=500:fontfile=${fontDeja}:enable='${enable}'`);
                              // 24h 라벨
           filters.push(`drawtext=text='24h':fontsize=28:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=570:fontfile=${fontDeja}:enable='${enable}'`);
                              // ETH 정보 (하단)
           if (card.ethPrice) {
                      filters.push(`drawbox=x=40:y=960:w=1000:h=300:color=${COLORS.card}@0.9:t=fill:enable='${enable}'`);
                      filters.push(`drawbox=x=40:y=960:w=1000:h=4:color=${COLORS.accent}@1:t=fill:enable='${enable}'`);
                      filters.push(`drawtext=text='ETH':fontsize=36:fontcolor=${COLORS.accent}:x=100:y=1000:fontfile=${fontDeja}:enable='${enable}'`);
                      filters.push(`drawtext=text='${escFFmpeg(card.ethPrice)}':fontsize=56:fontcolor=${COLORS.white}:x=100:y=1060:fontfile=${fontDeja}:enable='${enable}'`);
                      const ethColor = (card.ethChangeNum || 0) >= 0 ? COLORS.green : COLORS.red;
                      const ethArrow = (card.ethChangeNum || 0) >= 0 ? '+' : '';
                      filters.push(`drawtext=text='${ethArrow}${card.ethChange || ''}':fontsize=40:fontcolor=${ethColor}:x=700:y=1070:fontfile=${fontDeja}:enable='${enable}'`);
           }
                              // 자막
           if (card.subtitle) {
                      const subLines = wrapText(card.subtitle, 18);
                      subLines.forEach((line, li) => {
                                   filters.push(`drawtext=text='${escFFmpeg(line)}':fontsize=40:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=${1500 + li * 55}:fontfile=${fontNoto}:enable='${enable}':borderw=3:bordercolor=black`);
                      });
           }
                              break;

                     case 'indicators':
                              // 공포/탐욕 카드
           filters.push(`drawbox=x=40:y=150:w=1000:h=500:color=${COLORS.card}@0.9:t=fill:enable='${enable}'`);
                              filters.push(`drawbox=x=40:y=150:w=1000:h=6:color=${card.fgColor || COLORS.gold}@1:t=fill:enable='${enable}'`);
                              filters.push(`drawtext=text='${escFFmpeg('공포 탐욕 지수')}':fontsize=36:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=200:fontfile=${fontNoto}:enable='${enable}'`);
                              filters.push(`drawtext=text='${card.fearGreedValue || '??'}':fontsize=120:fontcolor=${card.fgColor || COLORS.white}:x=(w-text_w)/2:y=290:fontfile=${fontDeja}:enable='${enable}'`);
                              filters.push(`drawtext=text='${escFFmpeg(card.fearGreedLabel || '')}':fontsize=44:fontcolor=${card.fgColor || COLORS.white}:x=(w-text_w)/2:y=440:fontfile=${fontNoto}:enable='${enable}'`);

           // 김치프리미엄 카드
           filters.push(`drawbox=x=40:y=720:w=1000:h=400:color=${COLORS.card}@0.9:t=fill:enable='${enable}'`);
                              filters.push(`drawbox=x=40:y=720:w=1000:h=6:color=${COLORS.accent}@1:t=fill:enable='${enable}'`);
                              filters.push(`drawtext=text='${escFFmpeg('김치 프리미엄')}':fontsize=36:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=770:fontfile=${fontNoto}:enable='${enable}'`);
                              const kpColor = parseFloat(card.kimchiPremium || '0') >= 0 ? COLORS.green : COLORS.red;
                              filters.push(`drawtext=text='${escFFmpeg(card.kimchiPremium || '0')}%':fontsize=96:fontcolor=${kpColor}:x=(w-text_w)/2:y=860:fontfile=${fontDeja}:enable='${enable}'`);
                              if (card.kimchiDetail) {
                                         filters.push(`drawtext=text='${escFFmpeg(card.kimchiDetail)}':fontsize=28:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=990:fontfile=${fontNoto}:enable='${enable}'`);
                              }

           // 자막
           if (card.subtitle) {
                      const subLines = wrapText(card.subtitle, 18);
                      subLines.forEach((line, li) => {
                                   filters.push(`drawtext=text='${escFFmpeg(line)}':fontsize=40:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=${1500 + li * 55}:fontfile=${fontNoto}:enable='${enable}':borderw=3:bordercolor=black`);
                      });
           }
                              break;

                     case 'trending':
                              filters.push(`drawtext=text='${escFFmpeg('오늘의 트렌딩')}':fontsize=48:fontcolor=${COLORS.gold}:x=(w-text_w)/2:y=150:fontfile=${fontNoto}:enable='${enable}'`);
                              filters.push(`drawbox=x=200:y=220:w=680:h=3:color=${COLORS.gold}@0.5:t=fill:enable='${enable}'`);

           // 트렌딩 코인 리스트 (최대 4개)
           const coins = card.coins || [];
                              coins.slice(0, 4).forEach((coin, ci) => {
                                         const yBase = 300 + ci * 240;
                                         filters.push(`drawbox=x=60:y=${yBase}:w=960:h=200:color=${COLORS.card}@0.9:t=fill:enable='${enable}'`);
                                         // 순위
                                                                  filters.push(`drawtext=text='${ci + 1}':fontsize=48:fontcolor=${COLORS.gold}:x=100:y=${yBase + 30}:fontfile=${fontDeja}:enable='${enable}'`);
                                         // 심볼
                                                                  filters.push(`drawtext=text='${escFFmpeg(coin.symbol || '')}':fontsize=44:fontcolor=${COLORS.white}:x=180:y=${yBase + 30}:fontfile=${fontDeja}:enable='${enable}'`);
                                         // 이름
                                                                  filters.push(`drawtext=text='${escFFmpeg(coin.name || '')}':fontsize=28:fontcolor=${COLORS.gray}:x=180:y=${yBase + 90}:fontfile=${fontNoto}:enable='${enable}'`);
                                         // 등락률
                                                                  const coinColor = (coin.changeNum || 0) >= 0 ? COLORS.green : COLORS.red;
                                         const coinArrow = (coin.changeNum || 0) >= 0 ? '+' : '';
                                         filters.push(`drawtext=text='${coinArrow}${coin.change || ''}':fontsize=40:fontcolor=${coinColor}:x=750:y=${yBase + 50}:fontfile=${fontDeja}:enable='${enable}'`);
                              });

           // 자막
           if (card.subtitle) {
                      const subLines = wrapText(card.subtitle, 18);
                      subLines.forEach((line, li) => {
                                   filters.push(`drawtext=text='${escFFmpeg(line)}':fontsize=40:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=${1500 + li * 55}:fontfile=${fontNoto}:enable='${enable}':borderw=3:bordercolor=black`);
                      });
           }
                              break;

                     case 'outro':
                              // COINEASY 브랜딩
           filters.push(`drawtext=text='COINEASY':fontsize=72:fontcolor=${COLORS.gold}:x=(w-text_w)/2:y=400:fontfile=${fontDeja}:enable='${enable}'`);
                              filters.push(`drawbox=x=200:y=500:w=680:h=3:color=${COLORS.gold}@0.6:t=fill:enable='${enable}'`);
                              // CTA 텍스트
           filters.push(`drawtext=text='${escFFmpeg('매일 아침 브리핑 받아보세요')}':fontsize=44:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=600:fontfile=${fontNoto}:enable='${enable}'`);
                              // 텔레그램 CTA
           filters.push(`drawbox=x=200:y=750:w=680:h=120:color=${COLORS.accent}@0.8:t=fill:enable='${enable}'`);
                              filters.push(`drawtext=text='${escFFmpeg('텔레그램 @coiniseasy')}':fontsize=40:fontcolor=${COLORS.white}:x=(w-text_w)/2:y=785:fontfile=${fontNoto}:enable='${enable}'`);
                              // 유튜브 구독
           filters.push(`drawtext=text='${escFFmpeg('구독과 좋아요 부탁드려요')}':fontsize=36:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=950:fontfile=${fontNoto}:enable='${enable}'`);
                              // 하단
           filters.push(`drawtext=text='@CoinEasy':fontsize=30:fontcolor=${COLORS.gray}:x=(w-text_w)/2:y=1750:fontfile=${fontDeja}:enable='${enable}'`);
                              break;
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
// 텍스트 줄바꿈 (한글 기준)
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
       // 에러 상세 출력
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
   if (v <= 25) return COLORS.red;       // 극도의 공포
  if (v <= 40) return '0xFF6B35';       // 공포 (오렌지)
  if (v <= 60) return COLORS.gold;      // 중립
  if (v <= 75) return '0x7CFC00';       // 탐욕 (연두)
  return COLORS.green;                   // 극도의 탐욕
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
// 마켓 데이터 → 카드 배열 변환
// ============================================================
function buildCardsFromData(script, data, dateStr) {
   const cards = [];
   const subtitles = script.subtitleLines || [];
   const subsPerCard = Math.ceil(subtitles.length / 5);

  // 카드 1: 인트로
  cards.push({
       type: 'intro',
       date: dateStr.replace(/-/g, '.'),
       subtitle: '데일리 크립토 브리핑',
       headline: script.headline || subtitles[0] || '',
  });

  // 카드 2: BTC 시세
  const btc = data?.market?.[0];
   const eth = data?.market?.[1];
   cards.push({
        type: 'btc',
        price: btc ? `$${Number(btc.price).toLocaleString()}` : '$--,---',
        change: btc ? `${btc.change24h}%` : '0%',
        changeNum: btc ? parseFloat(btc.change24h) : 0,
        ethPrice: eth ? `$${Number(eth.price).toLocaleString()}` : '',
        ethChange: eth ? `${eth.change24h}%` : '',
        ethChangeNum: eth ? parseFloat(eth.change24h) : 0,
        subtitle: subtitles.slice(subsPerCard, subsPerCard * 2).join(' '),
   });

  // 카드 3: 공포/탐욕 + 김프
  const fg = data?.fearGreed;
   const kimchi = data?.kimchi;
   cards.push({
        type: 'indicators',
        fearGreedValue: fg?.value || '??',
        fearGreedLabel: fg?.label || '',
        fgColor: fg ? getFearGreedColor(fg.value) : COLORS.gray,
        kimchiPremium: kimchi?.premium || '0',
        kimchiDetail: kimchi ? `업비트 ${Number(kimchi.upbitBtcKrw).toLocaleString()}원` : '',
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
