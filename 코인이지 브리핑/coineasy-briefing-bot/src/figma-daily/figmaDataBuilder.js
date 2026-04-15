// figma-daily/figmaDataBuilder.js
// ===============================
// 매일 아침 시장 데이터를 수집해서 Figma 플러그인 및 YouTube Shorts가
// 소비할 JSON 페이로드를 빌드.
//
// 데이터 소스:
//   - CoinGecko (BTC/ETH/SOL/SUI/XRP 가격 + 24h 변동률)
//   - alternative.me Fear & Greed Index
//   - 업비트 + ER-API (김치 프리미엄)
//   - DefiLlama (DeFi TVL)
//   - CoinMarketCap Trending (TOP 3)
//   - Anthropic Claude API (오늘의 인용문)
//
// 외부 의존성: none (Node 18+ native fetch 사용)

// ESM mode

const COIN_IDS = {
        BTC: 'bitcoin',
        ETH: 'ethereum',
        SOL: 'solana',
        SUI: 'sui',
        XRP: 'ripple',
};

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

// ─── HTTP helpers ───────────────────────────────────────

function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), options.timeout || 15000);
        try {
                    const r = await fetch(url, { ...options, signal: ctrl.signal });
                    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
                    return await r.json();
        } finally {
                    clearTimeout(t);
        }
}

async function fetchJsonWithRetry(url, options = {}, retries = 3, delayMs = 2000) {
        for (let i = 0; i < retries; i++) {
                    try {
                                    return await fetchJson(url, options);
                    } catch (e) {
                                    const isRateLimit = e.message.includes('429');
                                    if (isRateLimit && i < retries - 1) {
                                                        const wait = delayMs * (i + 1);
                                                        console.warn(`[retry] ${url} → 429, retrying in ${wait}ms (${i + 1}/${retries})`);
                                                        await sleep(wait);
                                                        continue;
                                    }
                                    throw e;
                    }
        }
}

// ─── Data fetchers ──────────────────────────────────────

async function fetchPricesCoingecko() {
        const ids = Object.values(COIN_IDS).join(',');
        const url =
                    `https://api.coingecko.com/api/v3/simple/price` +
                    `?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

    const data = await fetchJsonWithRetry(url, {}, 3, 3000);

    const out = {};
        for (const [sym, gid] of Object.entries(COIN_IDS)) {
                    const d = data[gid] || {};
                    out[sym] = {
                                    price: d.usd || 0,
                                    change_24h: d.usd_24h_change || 0,
                    };
        }
        return out;
}

async function fetchFearGreed() {
        const data = await fetchJsonWithRetry('https://api.alternative.me/fng/?limit=1');
        const d = data.data[0];
        return {
                    value: parseInt(d.value, 10),
                    classification: d.value_classification,
        };
}

async function fetchKimchiPremium() {
        try {
                    const upbit = await fetchJson('https://api.upbit.com/v1/ticker?markets=KRW-BTC');
                    await sleep(1500);
                    const cg = await fetchJsonWithRetry(
                                    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
                        {},
                                    3,
                                    3000
                                );
                    const fx = await fetchJson('https://open.er-api.com/v6/latest/USD');

            const krw_btc = upbit[0].trade_price;
                    const usd_btc = cg.bitcoin.usd;
                    const usd_krw = fx.rates.KRW;
                    const synthetic = krw_btc / usd_krw;
                    const premium_pct = ((synthetic - usd_btc) / usd_btc) * 100;

            return {
                            rate_krw_per_usdt: Math.round(usd_krw),
                            premium_pct: Math.round(premium_pct * 100) / 100,
            };
        } catch (e) {
                    console.warn('[kimchi] error:', e.message);
                    return { rate_krw_per_usdt: 1500, premium_pct: 0 };
        }
}

async function fetchDefiHot() {
        try {
                    const protos = await fetchJson('https://api.llama.fi/protocols', {
                                    timeout: 25000,
                    });
                    const watch = ['Lido', 'Aave', 'Maker', 'Uniswap', 'Curve'];
                    const result = [];
                    for (const name of watch) {
                                    const p = protos.find((x) => x.name === name);
                                    if (!p) continue;
                                    result.push({
                                                        name,
                                                        tvl_usd: p.tvl || 0,
                                                        change_24h: Math.round((p.change_1d || 0) * 100) / 100,
                                    });
                                    if (result.length === 3) break;
                    }
                    return result;
        } catch (e) {
                    console.warn('[defi] error:', e.message);
                    return [];
        }
}

async function fetchTrending() {
        const cmcKey = process.env.CMC_API_KEY;
        if (!cmcKey) {
                    console.warn('[trending] CMC_API_KEY not set, skipping');
                    return [];
        }

    try {
                // CMC: /v1/cryptocurrency/listings/latest (free tier compatible)
            const data = await fetchJson(
                            'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=10&sort=percent_change_24h&sort_dir=desc',
                {
                                    headers: {
                                                            'X-CMC_PRO_API_KEY': cmcKey,
                                                            Accept: 'application/json',
                                    },
                }
                        );

            const coins = (data.data || []).slice(0, 3);
                return coins.map((c) => {
                                const quote = c.quote && c.quote.USD ? c.quote.USD : {};
                                return {
                                                    symbol: (c.symbol || '').toUpperCase(),
                                                    name: c.name || '',
                                                    change_24h:
                                                                            Math.round((quote.percent_change_24h || 0) * 100) / 100,
                                };
                });
    } catch (e) {
                console.warn('[trending] CMC error:', e.message);

            // Fallback: CoinGecko trending
            try {
                            await sleep(2000);
                            const data = await fetchJsonWithRetry(
                                                'https://api.coingecko.com/api/v3/search/trending',
                                {},
                                                2,
                                                3000
                                            );
                            const coins = (data.coins || []).slice(0, 3);
                            if (!coins.length) return [];

                    const ids = coins.map((c) => c.item.id).join(',');
                            await sleep(2000);
                            const prices = await fetchJsonWithRetry(
                                                `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
                                {},
                                                2,
                                                3000
                                            );

                    return coins.map((c) => {
                                        const item = c.item;
                                        const chg =
                                                                (prices[item.id] && prices[item.id].usd_24h_change) || 0;
                                        return {
                                                                symbol: item.symbol.toUpperCase(),
                                                                name: item.name,
                                                                change_24h: Math.round(chg * 100) / 100,
                                        };
                    });
            } catch (e2) {
                            console.warn('[trending] fallback also failed:', e2.message);
                            return [];
            }
    }
}

async function generateQuote(marketSummary) {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
                    return {
                                    line1: '오늘의 시장은 변화의 연속',
                                    line2: '차분하게, 그러나 기민하게 대응하자',
                    };
        }

    const prompt = `너는 코인이지(CoinEasy)의 데일리 마켓 큐레이터야. 오늘의 시장 상황을 한 문장의 짧은 통찰로 표현해줘.\n\n오늘의 시장 요약:\n${marketSummary}\n\n요구사항:\n- 2줄로 작성 (line1, line2)\n- line1: 시장의 현재 상태나 모순점 포착 (한국어, 25자 이내)\n- line2: 그에 대한 짧은 조언이나 관점 (한국어, 30자 이내)\n- 톤: 차분하고 약간 위트있는, 베테랑 트레이더 친구처럼\n- 따옴표나 부호는 빼고 텍스트만\n- JSON 형식으로 출력: {"line1": "...", "line2": "..."}`;

    try {
                const r = await fetch('https://api.anthropic.com/v1/messages', {
                                method: 'POST',
                                headers: {
                                                    'x-api-key': apiKey,
                                                    'anthropic-version': '2023-06-01',
                                                    'content-type': 'application/json',
                                },
                                body: JSON.stringify({
                                                    model: 'claude-sonnet-4-6',
                                                    max_tokens: 300,
                                                    messages: [{ role: 'user', content: prompt }],
                                }),
                });
                if (!r.ok) throw new Error(`Anthropic API ${r.status}`);
                const data = await r.json();
                let text = data.content[0].text.trim();
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(text);
                return { line1: parsed.line1, line2: parsed.line2 };
    } catch (e) {
                console.warn('[quote] error:', e.message);
                return {
                                line1: '변동성 속에서도 본질은 변하지 않는다',
                                line2: '차분히 데이터를 보고 판단하자',
                };
    }
}

// ─── Formatters ─────────────────────────────────────────

function fmtPrice(p) {
        if (p >= 1000) return `$${Math.round(p).toLocaleString('en-US')}`;
        if (p >= 10) return `$${p.toFixed(1)}`;
        if (p >= 1) return `$${p.toFixed(2)}`;
        return `$${p.toFixed(3)}`;
}

function fmtPct(v) {
        const sign = v >= 0 ? '+' : '';
        return `${sign}${v.toFixed(2)}%`;
}

function fmtDateKr(d, session = null) {
        return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY_KO[d.getDay()]}요일 ${session ? session.label : '아침'}`;
}

function fmtTvl(v) {
        if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
        if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
        return `$${Math.round(v).toLocaleString('en-US')}`;
}

function kimchiNote(pct) {
        if (Math.abs(pct) < 0.5) return '거의 동조화 — 정상 범위';
        if (pct > 2) return '한국 매수세 강함 — 차익 기회 주의';
        if (pct < -1) return '역김프 — 글로벌 강세 신호';
        return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% — 정상 범위`;
}

function fearNote(fg, marketChange) {
        if (fg < 25 && marketChange > 0)
                    return '두려움인데 가격은 상승? 역설적 신호!';
        if (fg < 25) return '극단적 공포 — 분할 매수 검토 구간';
        if (fg > 75 && marketChange < 0) return '탐욕인데 조정? 과열 경계';
        if (fg > 75) return '탐욕 구간 — 차익 실현 검토';
        if (fg < 45) return '여전히 공포 구간이지만 시장은 꿋꿋';
        if (fg > 55) return '탐욕 우세 — 리스크 관리';
        return '중립 — 추세 확인 필요';
}

// ─── Main payload builder ─────────────────────────────────

async function buildPayload(now = new Date(), session = null) {
        // Fetch sequentially to avoid CoinGecko rate limits
    // (free tier: ~10-30 req/min)
    const fearGreed = await fetchFearGreed();
        const defi = await fetchDefiHot();

    // Space out CoinGecko calls
    await sleep(1500);
        const prices = await fetchPricesCoingecko();

    await sleep(1500);
        const kimchi = await fetchKimchiPremium();

    // CMC trending (non-CoinGecko, safe to call)
    const trending = await fetchTrending();

    while (defi.length < 3)
                defi.push({ name: '—', tvl_usd: 0, change_24h: 0 });
        while (trending.length < 3)
                    trending.push({ symbol: '—', name: '—', change_24h: 0 });

    const symbols = Object.keys(COIN_IDS);
        const avgChange =
                    symbols.reduce((s, sym) => s + prices[sym].change_24h, 0) /
                    symbols.length;

    const summary =
                `BTC ${fmtPrice(prices.BTC.price)} (${fmtPct(prices.BTC.change_24h)}), ` +
                `Fear&Greed ${fearGreed.value} (${fearGreed.classification}), ` +
                `DeFi: ${defi
                                     .slice(0, 3)
                                     .map((d) => `${d.name} ${fmtPct(d.change_24h)}`)
                                     .join(', ')}`;

    const quote = await generateQuote(summary);

    const texts = {
                date_label: fmtDateKr(now, session),
                btc_price: fmtPrice(prices.BTC.price),
                btc_change: fmtPct(prices.BTC.change_24h),
                market_change: `MARKET ${fmtPct(avgChange)}`,
                eth_price: fmtPrice(prices.ETH.price),
                eth_change: fmtPct(prices.ETH.change_24h),
                sol_price: fmtPrice(prices.SOL.price),
                sol_change: fmtPct(prices.SOL.change_24h),
                sui_price: fmtPrice(prices.SUI.price),
                sui_change: fmtPct(prices.SUI.change_24h),
                xrp_price: fmtPrice(prices.XRP.price),
                xrp_change: fmtPct(prices.XRP.change_24h),
                kimchi_rate: `환율: ₩${kimchi.rate_krw_per_usdt.toLocaleString('ko-KR')}/USDT`,
                kimchi_premium: `${kimchi.premium_pct.toFixed(2)}%`,
                kimchi_note: kimchiNote(kimchi.premium_pct),
                fear_value: String(fearGreed.value),
                fear_label: fearGreed.classification,
                fear_note: fearNote(fearGreed.value, avgChange),
                defi_1_name: defi[0].name,
                defi_1_note: defi[0].tvl_usd ? `TVL ${fmtTvl(defi[0].tvl_usd)}` : '',
                defi_1_change: fmtPct(defi[0].change_24h),
                defi_2_name: defi[1].name,
                defi_2_note: defi[1].tvl_usd ? `TVL ${fmtTvl(defi[1].tvl_usd)}` : '',
                defi_2_change: fmtPct(defi[1].change_24h),
                defi_3_name: defi[2].name,
                defi_3_note: defi[2].tvl_usd ? `TVL ${fmtTvl(defi[2].tvl_usd)}` : '',
                defi_3_change: fmtPct(defi[2].change_24h),
                trend_1_name: `${trending[0].symbol} (${trending[0].name})`,
                trend_1_change: fmtPct(trending[0].change_24h),
                trend_2_name: `${trending[1].symbol} (${trending[1].name})`,
                trend_2_change: fmtPct(trending[1].change_24h),
                trend_3_name: `${trending[2].symbol} (${trending[2].name})`,
                trend_3_change: fmtPct(trending[2].change_24h),
                quote_line1: quote.line1,
                quote_line2: quote.line2,
    };

    // Color map (green/red based on sign)
    const changeKeys = [
                'btc_change',
                'eth_change',
                'sol_change',
                'sui_change',
                'xrp_change',
                'defi_1_change',
                'defi_2_change',
                'defi_3_change',
                'trend_1_change',
                'trend_2_change',
                'trend_3_change',
            ];

    const colors = {};
        for (const k of changeKeys) {
                    const v = parseFloat(texts[k].replace('%', '').replace('+', ''));
                    colors[k] = v >= 0 ? '#00b009' : '#ff1f1f';
        }

    return {
                frame_id: '28334:14', session: session || { type: 'morning', label: '아침', footer: '매일 아침 8시', cta: '오늘 하루도 현명한 투자 하세요' },
                generated_at: now.toISOString(),
                texts,
                gauge: { fill_pct: fearGreed.value / 100 },
                colors,
    };
}

export {
        buildPayload,
        // exported for testing/reuse
        fetchPricesCoingecko,
        fetchFearGreed,
        fetchKimchiPremium,
        fetchDefiHot,
        fetchTrending,
        generateQuote,
};
