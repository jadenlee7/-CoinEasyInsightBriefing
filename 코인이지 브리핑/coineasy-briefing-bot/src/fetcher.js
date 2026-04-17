/**
 * 코인이지 데일리 브리핑 - 데이터 수집 모듈
 *
 * 소스:
 * - CoinGecko: BTC/ETH 시세, 시총, 거래량, 트렌딩
 * - DeFiLlama: TVL 변동 상위 프로토콜
 * - CoinMarketCap: Fear & Greed Index (실시간)
 * - Upbit/Binance: 김치 프리미엄 계산
 * - Farside Investors: BTC/ETH Spot ETF 유입/유출 데이터
 * - Upbit: 한국 시장 거래량 TOP / 김프 이상치 / KRW 시장 전체 거래대금
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || '';
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const DEFILLAMA_BASE = 'https://api.llama.fi';
const CMC_API_KEY = process.env.CMC_API_KEY || '';
const UPBIT_BASE = 'https://api.upbit.com/v1';
const BINANCE_BASE = 'https://api.binance.com/api/v3';

// ============================================================
// 유틸리티
// ============================================================
async function fetchJSON(url, label = '', headers = {}) {
            try {
                            const res = await fetch(url, {
                                                headers: { 'Accept': 'application/json', ...headers },
                                                signal: AbortSignal.timeout(15000),
                            });
                            if (res.status === 429) {
                                                console.warn(`[FETCH] ${label} 429 rate limit, 5초 후 재시도...`);
                                                await new Promise(r => setTimeout(r, 5000));
                                                const retry = await fetch(url, { headers: { 'Accept': 'application/json', ...headers }, signal: AbortSignal.timeout(15000) });
                                                if (!retry.ok) throw new Error(`HTTP ${retry.status} (재시도)`);
                                                return await retry.json();
                            }
                            return await res.json();
            } catch (err) {
                            console.error(`[FETCH ERROR] ${label || url}: ${err.message}`);
                            return null;
            }
}

async function fetchHTML(url, label = '') {
            try {
                            const res = await fetch(url, {
                                                headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 CoinEasyBot/1.0' },
                                                signal: AbortSignal.timeout(20000),
                            });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            return await res.text();
            } catch (err) {
                            console.error(`[FETCH HTML ERROR] ${label || url}: ${err.message}`);
                            return null;
            }
}

function pctChange(current, previous) {
            if (!previous || previous === 0) return 0;
            return ((current - previous) / previous) * 100;
}

function formatNum(n, decimals = 2) {
            if (n >= 1e12) return `$${(n / 1e12).toFixed(decimals)}T`;
            if (n >= 1e9) return `$${(n / 1e9).toFixed(decimals)}B`;
            if (n >= 1e6) return `$${(n / 1e6).toFixed(decimals)}M`;
            if (n >= 1e3) return `$${(n / 1e3).toFixed(decimals)}K`;
            return `$${n.toFixed(decimals)}`;
}

function formatKRW(n, decimals = 1) {
            if (n >= 1e12) return `₩${(n / 1e12).toFixed(decimals)}조`;
            if (n >= 1e8) return `₩${(n / 1e8).toFixed(decimals)}억`;
            if (n >= 1e4) return `₩${(n / 1e4).toFixed(decimals)}만`;
            return `₩${Math.round(n).toLocaleString()}`;
}

// ============================================================
// 1. 주요 코인 시세 (CoinGecko)
// ============================================================
async function fetchMarketOverview() {
            const data = await fetchJSON(
                            `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,ripple,sui&order=market_cap_desc&sparkline=false&price_change_percentage=24h,7d`,
                            'CoinGecko Markets'
                        );
            if (!data) return null;
            return data.map(coin => ({
                            symbol: coin.symbol.toUpperCase(),
                            name: coin.name,
                            price: coin.current_price,
                            change24h: coin.price_change_percentage_24h?.toFixed(2) || '0',
                            change7d: coin.price_change_percentage_7d_in_currency?.toFixed(2) || '0',
                            marketCap: formatNum(coin.market_cap),
                            volume24h: formatNum(coin.total_volume),
            }));
}

// ============================================================
// 2. 글로벌 시장 데이터
// ============================================================
async function fetchGlobalData() {
            const data = await fetchJSON(`${COINGECKO_BASE}/global`, 'CoinGecko Global');
            if (!data?.data) return null;
            const g = data.data;
            return {
                            totalMarketCap: formatNum(g.total_market_cap?.usd || 0),
                            totalVolume24h: formatNum(g.total_volume?.usd || 0),
                            btcDominance: g.market_cap_percentage?.btc?.toFixed(1) || '0',
                            ethDominance: g.market_cap_percentage?.eth?.toFixed(1) || '0',
                            marketCapChange24h: g.market_cap_change_percentage_24h_usd?.toFixed(2) || '0',
            };
}

// ============================================================
// 3. 트렌딩 코인 (CoinGecko)
// ============================================================
async function fetchTrending() {
            const data = await fetchJSON(`${COINGECKO_BASE}/search/trending`, 'CoinGecko Trending');
            if (!data?.coins) return null;
            return data.coins.slice(0, 7).map(c => ({
                            symbol: c.item.symbol.toUpperCase(),
                            name: c.item.name,
                            marketCapRank: c.item.market_cap_rank || 'N/A',
                            priceChange24h: c.item.data?.price_change_percentage_24h?.usd?.toFixed(2) || '0',
            }));
}

// ============================================================
// 4. DeFi TVL 데이터 (DeFiLlama)
// ============================================================
async function fetchDefiTVL() {
            const data = await fetchJSON(`${DEFILLAMA_BASE}/protocols`, 'DeFiLlama Protocols');
            if (!data || !Array.isArray(data)) return null;

    const withChange = data
                .filter(p => p.tvl > 1e8 && p.change_1d !== undefined)
                .map(p => ({
                                    name: p.name,
                                    category: p.category || 'Unknown',
                                    chain: Array.isArray(p.chains) ? p.chains[0] : 'Multi',
                                    tvl: formatNum(p.tvl),
                                    tvlRaw: p.tvl,
                                    change1d: p.change_1d?.toFixed(2) || '0',
                                    change7d: p.change_7d?.toFixed(2) || '0',
                }));

    const topByTVL = [...withChange].sort((a, b) => b.tvlRaw - a.tvlRaw).slice(0, 5);
            const topGainers = [...withChange].sort((a, b) => parseFloat(b.change1d) - parseFloat(a.change1d)).slice(0, 5);
            const topLosers = [...withChange].sort((a, b) => parseFloat(a.change1d) - parseFloat(b.change1d)).slice(0, 5);

    return { topByTVL, topGainers, topLosers };
}

// ============================================================
// 5. 체인별 TVL
// ============================================================
async function fetchChainTVL() {
            const data = await fetchJSON(`${DEFILLAMA_BASE}/v2/chains`, 'DeFiLlama Chains');
            if (!data || !Array.isArray(data)) return null;
            return data
                .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
                .slice(0, 10)
                .map(c => ({
                                    name: c.name || c.gecko_id,
                                    tvl: formatNum(c.tvl || 0),
                }));
}

// ============================================================
// 6. Fear & Greed Index (CMC API - 실시간)
// ============================================================
async function fetchFearGreed() {
            if (CMC_API_KEY) {
                            try {
                                                const cmcData = await fetchJSON(
                                                                        'https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest',
                                                                        'CMC Fear & Greed',
                                                        { 'X-CMC_PRO_API_KEY': CMC_API_KEY }
                                                                    );
                                                if (cmcData?.data) {
                                                                        const current = cmcData.data;
                                                                        return {
                                                                                                    value: String(Math.round(current.value)),
                                                                                                    label: current.value_classification || getFearGreedLabel(current.value),
                                                                                                    previousValue: null,
                                                                                                    previousLabel: null,
                                                                                                    source: 'CoinMarketCap',
                                                                        };
                                                }
                            } catch (err) {
                                                console.error(`[CMC Fear & Greed 에러] ${err.message}`);
                            }
            }

    const altData = await fetchJSON('https://api.alternative.me/fng/?limit=2', 'Fear & Greed (Alternative.me)');
            if (!altData?.data?.[0]) return null;
            const today = altData.data[0];
            const yesterday = altData.data[1] || null;
            return {
                            value: today.value,
                            label: today.value_classification,
                            previousValue: yesterday?.value || null,
                            previousLabel: yesterday?.value_classification || null,
                            source: 'Alternative.me',
            };
}

function getFearGreedLabel(value) {
            if (value <= 20) return 'Extreme Fear';
            if (value <= 40) return 'Fear';
            if (value <= 60) return 'Neutral';
            if (value <= 80) return 'Greed';
            return 'Extreme Greed';
}

// ============================================================
// 7. 김치 프리미엄 (Upbit vs Binance 비교)
// ============================================================
async function fetchKimchiPremium() {
            try {
                            const upbitRes = await fetchJSON(
                                                `${UPBIT_BASE}/ticker?markets=KRW-BTC`,
                                                'Upbit BTC'
                                            );
                            const binanceRes = await fetchJSON(
                                                `${BINANCE_BASE}/ticker/price?symbol=BTCUSDT`,
                                                'Binance BTC'
                                            );
                            const upbitUsdt = await fetchJSON(
                                                `${UPBIT_BASE}/ticker?markets=KRW-USDT`,
                                                'Upbit USDT/KRW'
                                            );

                if (!upbitRes?.[0] || !binanceRes || !upbitUsdt?.[0]) return null;

                const krwRate = upbitUsdt[0].trade_price;
                            const upbitBtcKrw = upbitRes[0].trade_price;
                            const binanceBtcUsd = parseFloat(binanceRes.price);
                            const binanceBtcKrw = binanceBtcUsd * krwRate;
                            const premium = ((upbitBtcKrw - binanceBtcKrw) / binanceBtcKrw) * 100;

                return {
                                    upbitBtcKrw: Math.round(upbitBtcKrw).toLocaleString(),
                                    binanceBtcUsd: binanceBtcUsd.toFixed(2),
                                    krwRate: Math.round(krwRate).toLocaleString(),
                                    premium: premium.toFixed(2),
                };
            } catch (err) {
                            console.error(`[김치 프리미엄 에러] ${err.message}`);
                            return null;
            }
}

// ============================================================
// 8. ETF 유입/유출 데이터 (Redis 캐시 from coineasydaily)
// ============================================================
async function fetchETFData() {
            if (!REDIS_URL) {
                            console.warn('[ETF] REDIS_URL not set; skipping ETF data');
                            return null;
            }

    let redis;
            try {
                            redis = new Redis(REDIS_URL, {
                                                connectTimeout: 5000,
                                                maxRetriesPerRequest: 1,
                                                lazyConnect: true,
                            });
                            await redis.connect();

                const raw = await redis.get('etf:latest');
                            if (!raw) {
                                                console.warn('[ETF] No etf:latest key in Redis');
                                                return null;
                            }

                const data = JSON.parse(raw);
                            const btcData = data.btc;
                            const ethData = data.eth;

                function convertETF(coinData) {
                                    if (!coinData) return null;
                                    const totalM = coinData.total_net_inflow / 1_000_000;
                                    const etfFlows = (coinData.funds || []).map(f => ({
                                                            name: f.ticker,
                                                            flow: f.net_inflow / 1_000_000,
                                    }));
                                    const topInflows = etfFlows.filter(e => e.flow > 0).sort((a, b) => b.flow - a.flow).slice(0, 3);
                                    const topOutflows = etfFlows.filter(e => e.flow < 0).sort((a, b) => a.flow - b.flow).slice(0, 3);
                                    return {
                                                            date: coinData.date || '',
                                                            totalFlow: totalM,
                                                            previousDayTotal: null,
                                                            topInflows: topInflows.map(e => `${e.name}: +$${e.flow.toFixed(1)}M`),
                                                            topOutflows: topOutflows.map(e => `${e.name}: -$${Math.abs(e.flow).toFixed(1)}M`),
                                                            etfFlows,
                                                            flowDirection: totalM > 0 ? '순유입' : totalM < 0 ? '순유출' : '보합',
                                    };
                }

                const btcETF = convertETF(btcData);
                            const ethETF = convertETF(ethData);

                console.log(`[ETF Redis] Updated: ${data.updated_at} | BTC: $${btcETF?.totalFlow?.toFixed(1)}M | ETH: $${ethETF?.totalFlow?.toFixed(1)}M`);

                return {
                                    btc: btcETF,
                                    eth: ethETF,
                                    summary: {
                                                            btcTotal: btcETF ? `$${btcETF.totalFlow.toFixed(1)}M` : 'N/A',
                                                            ethTotal: ethETF ? `$${ethETF.totalFlow.toFixed(1)}M` : 'N/A',
                                                            btcDirection: btcETF?.flowDirection || 'N/A',
                                                            ethDirection: ethETF?.flowDirection || 'N/A',
                                    },
                };
            } catch (err) {
                            console.error(`[ETF Redis 에러] ${err.message}`);
                            return null;
            } finally {
                            if (redis) {
                                                try { await redis.quit(); } catch (e) { /* ignore */ }
                            }
            }
}

// ============================================================
// 9. 한국 시장 포커스 (업비트 KRW 마켓 + 바이낸스 대비 김프 이상치)
// ============================================================
async function fetchKoreaMarket() {
            try {
                            // (1) 업비트 KRW 마켓 전체 리스트
                const markets = await fetchJSON(
                                    `${UPBIT_BASE}/market/all?isDetails=false`,
                                    'Upbit Markets'
                                );
                            if (!markets || !Array.isArray(markets)) return null;

                const krwMarkets = markets
                                .filter(m => m.market.startsWith('KRW-'))
                                .map(m => ({ market: m.market, korean: m.korean_name, english: m.english_name }));

                // (2) 업비트 ticker는 최대 ~100개씩 조회 가능 - 청크로 나눠서 호출
                const chunkSize = 100;
                            const tickers = [];
                            for (let i = 0; i < krwMarkets.length; i += chunkSize) {
                                                const chunk = krwMarkets.slice(i, i + chunkSize).map(m => m.market).join(',');
                                                const res = await fetchJSON(
                                                                        `${UPBIT_BASE}/ticker?markets=${chunk}`,
                                                                        `Upbit Ticker chunk ${i}`
                                                                    );
                                                if (Array.isArray(res)) tickers.push(...res);
                            }
                            if (tickers.length === 0) return null;

                // 한국어 이름 매핑
                const nameMap = Object.fromEntries(krwMarkets.map(m => [m.market, m.korean]));

                // (3) 거래대금 TOP 10 (acc_trade_price_24h = 24h 누적 거래대금 KRW)
                const enriched = tickers.map(t => ({
                                    market: t.market,
                                    symbol: t.market.replace('KRW-', ''),
                                    korean: nameMap[t.market] || '',
                                    price: t.trade_price,
                                    change24h: (t.signed_change_rate * 100).toFixed(2),
                                    volume24hKrw: t.acc_trade_price_24h,
                }));

                const volumeTop10 = [...enriched]
                                .sort((a, b) => b.volume24hKrw - a.volume24hKrw)
                                .slice(0, 10)
                                .map(c => ({
                                                        symbol: c.symbol,
                                                        korean: c.korean,
                                                        price: Math.round(c.price).toLocaleString(),
                                                        change24h: c.change24h,
                                                        volume: formatKRW(c.volume24hKrw),
                                }));

                // (4) 가격 변동률 TOP / 하락 TOP (거래대금 10억 이상만, 유동성 필터)
                const liquid = enriched.filter(c => c.volume24hKrw >= 1e9);
                            const gainers = [...liquid]
                                .sort((a, b) => parseFloat(b.change24h) - parseFloat(a.change24h))
                                .slice(0, 5)
                                .map(c => ({ symbol: c.symbol, korean: c.korean, change24h: c.change24h, volume: formatKRW(c.volume24hKrw) }));
                            const losers = [...liquid]
                                .sort((a, b) => parseFloat(a.change24h) - parseFloat(b.change24h))
                                .slice(0, 5)
                                .map(c => ({ symbol: c.symbol, korean: c.korean, change24h: c.change24h, volume: formatKRW(c.volume24hKrw) }));

                // (5) KRW 마켓 전체 24h 거래대금
                const totalVolumeKrw = enriched.reduce((sum, c) => sum + (c.volume24hKrw || 0), 0);

                // (6) 김프 이상치 - 바이낸스 USDT 마켓과 공통 상장된 TOP 종목 비교
                const binance24h = await fetchJSON(
                                    `${BINANCE_BASE}/ticker/24hr`,
                                    'Binance 24hr'
                                );
                            const krwUsdtRate = tickers.find(t => t.market === 'KRW-USDT')?.trade_price;

                let kimchiOutliers = [];
                            if (Array.isArray(binance24h) && krwUsdtRate) {
                                                const binanceMap = {};
                                                for (const b of binance24h) {
                                                                        if (b.symbol.endsWith('USDT')) {
                                                                                                    const sym = b.symbol.replace('USDT', '');
                                                                                                    binanceMap[sym] = parseFloat(b.lastPrice);
                                                                        }
                                                }
                                                // 업비트 거래대금 상위 50개만 비교 (유동성 확보)
                                const topLiquid = [...enriched]
                                                    .sort((a, b) => b.volume24hKrw - a.volume24hKrw)
                                                    .slice(0, 50);

                                for (const c of topLiquid) {
                                                        const binancePriceUsd = binanceMap[c.symbol];
                                                        if (!binancePriceUsd) continue;
                                                        const binancePriceKrw = binancePriceUsd * krwUsdtRate;
                                                        const prem = ((c.price - binancePriceKrw) / binancePriceKrw) * 100;
                                                        if (Math.abs(prem) >= 5) {
                                                                                    kimchiOutliers.push({
                                                                                                                    symbol: c.symbol,
                                                                                                                    korean: c.korean,
                                                                                                                    premium: prem.toFixed(2),
                                                                                                                    volume: formatKRW(c.volume24hKrw),
                                                                                            });
                                                        }
                                }
                                                kimchiOutliers = kimchiOutliers
                                                    .sort((a, b) => Math.abs(parseFloat(b.premium)) - Math.abs(parseFloat(a.premium)))
                                                    .slice(0, 10);
                            }

                return {
                                    totalVolumeKrw: formatKRW(totalVolumeKrw),
                                    totalVolumeKrwRaw: totalVolumeKrw,
                                    marketCount: krwMarkets.length,
                                    volumeTop10,
                                    gainers,
                                    losers,
                                    kimchiOutliers,
                };
            } catch (err) {
                            console.error(`[한국 시장 데이터 에러] ${err.message}`);
                            return null;
            }
}

// ============================================================
// 전체 데이터 수집
// ============================================================
export async function collectAllData() {
            console.log('[데이터 수집 시작]', new Date().toISOString());

    const [
                    market,
                    global,
                    trending,
                    defi,
                    chains,
                    fearGreed,
                    kimchi,
                    etf,
                    korea,
                ] = await Promise.all([
                    fetchMarketOverview(),
                    fetchGlobalData(),
                    fetchTrending(),
                    fetchDefiTVL(),
                    fetchChainTVL(),
                    fetchFearGreed(),
                    fetchKimchiPremium(),
                    fetchETFData(),
                    fetchKoreaMarket(),
                ]);

    const result = {
                    timestamp: new Date().toISOString(),
                    dateKST: new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
                    market,
                    global,
                    trending,
                    defi,
                    chains,
                    fearGreed,
                    kimchi,
                    etf,
                    korea,
    };

    const sources = { market, global, trending, defi, chains, fearGreed, kimchi, etf, korea };
            const succeeded = Object.entries(sources).filter(([, v]) => v !== null).map(([k]) => k);
            const failed = Object.entries(sources).filter(([, v]) => v === null).map(([k]) => k);
            console.log(`[수집 완료] 성공: ${succeeded.join(', ')} | 실패: ${failed.join(', ') || '없음'}`);

    if (fearGreed) console.log(`[Fear & Greed] ${fearGreed.value} (${fearGreed.label}) - 출처: ${fearGreed.source}`);
            if (etf) console.log(`[ETF] BTC: ${etf.summary.btcTotal} (${etf.summary.btcDirection}) | ETH: ${etf.summary.ethTotal} (${etf.summary.ethDirection})`);
            if (korea) console.log(`[Korea] 마켓수: ${korea.marketCount} | 전체거래대금: ${korea.totalVolumeKrw} | TOP1: ${korea.volumeTop10?.[0]?.korean} (${korea.volumeTop10?.[0]?.volume}) | 김프이상치: ${korea.kimchiOutliers.length}개`);

    return result;
}
