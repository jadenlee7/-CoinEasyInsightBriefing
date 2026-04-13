/**
 * Figma 데일리 카드용 경량 데이터 수집
  * 기존 fetcher.js의 collectAllData()를 쓰지 않고
   * 필요한 3개 API만 호출 (더 빠름)
    */

    async function fetchJSON(url, label = '') {
      try {
          const res = await fetch(url, {
                headers: { Accept: 'application/json' },
                      signal: AbortSignal.timeout(10000),
                          });
                              if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                  return await res.json();
                                    } catch (err) {
                                        console.error(`[figma-daily FETCH] ${label}: ${err.message}`);
                                            return null;
                                              }
                                              }

                                              export async function fetchFigmaData() {
                                                const [btcData, fgData, upbitRes, binanceRes, usdtRes] = await Promise.all([
                                                    fetchJSON(
                                                          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
                                                                'CoinGecko BTC'
                                                                    ),
                                                                        fetchJSON('https://api.alternative.me/fng/?limit=1', 'Fear&Greed'),
                                                                            fetchJSON('https://api.upbit.com/v1/ticker?markets=KRW-BTC', 'Upbit BTC'),
                                                                                fetchJSON('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', 'Binance BTC'),
                                                                                    fetchJSON('https://api.upbit.com/v1/ticker?markets=KRW-USDT', 'Upbit USDT'),
                                                                                      ]);

                                                                                        // BTC 가격
                                                                                          const btcPrice = btcData?.bitcoin?.usd ?? null;
                                                                                            const btcChange24h = btcData?.bitcoin?.usd_24h_change ?? null;

                                                                                              // Fear & Greed
                                                                                                const fg = fgData?.data?.[0] ?? null;

                                                                                                  // 김치 프리미엄
                                                                                                    let kimchiPremium = null;
                                                                                                      if (upbitRes?.[0] && binanceRes && usdtRes?.[0]) {
                                                                                                          const krwRate = usdtRes[0].trade_price;
                                                                                                              const upbitKrw = upbitRes[0].trade_price;
                                                                                                                  const binanceKrw = parseFloat(binanceRes.price) * krwRate;
                                                                                                                      kimchiPremium = ((upbitKrw - binanceKrw) / binanceKrw * 100).toFixed(2);
                                                                                                                        }
                                                                                                                        
                                                                                                                          return {
                                                                                                                              btcPrice: btcPrice ? Math.round(btcPrice).toLocaleString('en-US') : null,
                                                                                                                                  btcChange24h: btcChange24h ? btcChange24h.toFixed(2) : null,
                                                                                                                                      fearGreedValue: fg?.value ?? null,
                                                                                                                                          fearGreedLabel: fg?.value_classification ?? null,
                                                                                                                                              kimchiPremium,
                                                                                                                                                  dateKST: new Date().toLocaleDateString('ko-KR', {
                                                                                                                                                        timeZone: 'Asia/Seoul',
                                                                                                                                                              year: 'numeric',
                                                                                                                                                                    month: 'long',
                                                                                                                                                                          day: 'numeric',
                                                                                                                                                                              }),
                                                                                                                                                                                };
                                                                                                                                                                                }
