/**
 * 코인이지 데일리 브리핑 - 데이터 수집 모듈
 *
 * 소스:
 * - CoinGecko: BTC/ETH 시세, 시총, 거래량, 트렌딩
 * - DeFiLlama: TVL 변동 상위 프로토콜
 * - CoinMarketCap: Fear & Greed Index (실시간)
 * - Upbit/Binance: 김치 프리미엄 계산
 */

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const DEFILLAMA_BASE = 'https://api.llama.fi';
const CMC_API_KEY = process.env.CMC_API_KEY || '';

// ============================================================
// 유틸리티
// ============================================================

async function fetchJSON(url, label = '', headers = {}) {
    try {
          const res = await fetch(url, {
                  headers: { 'Accept': 'application/json', ...headers },
                  signal: AbortSignal.timeout(15000),
          });
          if (res.status === 429) { console.warn(`[FETCH] ${label} 429 rate limit, 5초 후 재시도...`); await new Promise(r => setTimeout(r, 5000)); const retry = await fetch(url, { headers: { 'Accept': 'application/json', ...headers }, signal: AbortSignal.timeout(15000) }); if (!retry.ok) throw new Error(`HTTP ${retry.status} (재시도)`); return await retry.json(); }
          return await res.json();
    } catch (err) {
          console.error(`[FETCH ERROR] ${label || url}: ${err.message}`);
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
    // 1차: CoinMarketCap Fear & Greed Index (실시간)
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

  // 2차 폴백: Alternative.me
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
                  'https://api.upbit.com/v1/ticker?markets=KRW-BTC',
                  'Upbit BTC'
                );
          const binanceRes = await fetchJSON(
                  'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
                  'Binance BTC'
                );
          const upbitUsdt = await fetchJSON(
                  'https://api.upbit.com/v1/ticker?markets=KRW-USDT',
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
// 전체 데이터 수집
// ============================================================

export async function collectAllData() {
    console.log('[데이터 수집 시작]', new Date().toISOString());

  const [
        market, global, trending, defi, chains, fearGreed, kimchi,
      ] = await Promise.all([
        fetchMarketOverview(),
        fetchGlobalData(),
        fetchTrending(),
        fetchDefiTVL(),
        fetchChainTVL(),
        fetchFearGreed(),
        fetchKimchiPremium(),
      ]);

  const result = {
        timestamp: new Date().toISOString(),
        dateKST: new Date().toLocaleDateString('ko-KR', {
                timeZone: 'Asia/Seoul',
                year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
        }),
        market, global, trending, defi, chains, fearGreed, kimchi,
  };

  const sources = { market, global, trending, defi, chains, fearGreed, kimchi };
    const succeeded = Object.entries(sources).filter(([, v]) => v !== null).map(([k]) => k);
    const failed = Object.entries(sources).filter(([, v]) => v === null).map(([k]) => k);

  console.log(`[수집 완료] 성공: ${succeeded.join(', ')} | 실패: ${failed.join(', ') || '없음'}`);
    if (fearGreed) console.log(`[Fear & Greed] ${fearGreed.value} (${fearGreed.label}) - 출처: ${fearGreed.source}`);

  return result;
}
