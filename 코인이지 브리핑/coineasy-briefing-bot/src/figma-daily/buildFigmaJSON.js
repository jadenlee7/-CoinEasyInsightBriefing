/**
 * Figma 플러그인이 소비할 JSON 구조 생성
  * 플러그인에서 이 JSON을 붙여넣으면 텍스트 노드가 자동 업데이트됨
   */
   export function buildFigmaJSON(data, quote) {
     const now = new Date();
       const dateStr = now.toLocaleDateString('ko-KR', {
           timeZone: 'Asia/Seoul',
               year: 'numeric',
                   month: 'long',
                       day: 'numeric',
                           weekday: 'long',
                             });

                               // Fear & Greed 게이지 각도 (0~180도)
                                 const fgValue = parseInt(data.fearGreedValue) || 50;
                                   const gaugeAngle = Math.round((fgValue / 100) * 180);

                                     // BTC 등락 화살표
                                       const change = parseFloat(data.btcChange24h) || 0;
                                         const arrow = change >= 0 ? '▲' : '▼';
                                           const changeStr = `${arrow} ${Math.abs(change)}%`;

                                             return {
                                                 // 텍스트 노드 매핑 (Figma 레이어 이름 → 값)
                                                     textNodes: {
                                                           'date-text': dateStr,
                                                                 'btc-price': `$${data.btcPrice || 'N/A'}`,
                                                                       'btc-change': changeStr,
                                                                             'fg-value': String(data.fearGreedValue || 'N/A'),
                                                                                   'fg-label': data.fearGreedLabel || 'N/A',
                                                                                         'kimchi-premium': `${data.kimchiPremium || 'N/A'}%`,
                                                                                               'quote-text': quote.text,
                                                                                                     'quote-author': `— ${quote.author}`,
                                                                                                         },
                                                                                                         
                                                                                                             // 스타일 힌트 (플러그인에서 색상 변경용)
                                                                                                                 styles: {
                                                                                                                       'btc-change-color': change >= 0 ? '#22C55E' : '#EF4444',
                                                                                                                             'fg-gauge-angle': gaugeAngle,
                                                                                                                                   'fg-zone':
                                                                                                                                           fgValue <= 25
                                                                                                                                                     ? 'extreme-fear'
                                                                                                                                                               : fgValue <= 45
                                                                                                                                                                           ? 'fear'
                                                                                                                                                                                       : fgValue <= 55
                                                                                                                                                                                                     ? 'neutral'
                                                                                                                                                                                                                   : fgValue <= 75
                                                                                                                                                                                                                                   ? 'greed'
                                                                                                                                                                                                                                                   : 'extreme-greed',
                                                                                                                                                                                                                                                       },
                                                                                                                                                                                                                                                       
                                                                                                                                                                                                                                                           meta: {
                                                                                                                                                                                                                                                                 generatedAt: now.toISOString(),
                                                                                                                                                                                                                                                                       version: '1.0.0',
                                                                                                                                                                                                                                                                           },
                                                                                                                                                                                                                                                                             };
                                                                                                                                                                                                                                                                             }
