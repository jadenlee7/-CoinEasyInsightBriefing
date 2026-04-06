/**
 * 테스트 스크립트 - 데이터 수집만 테스트 (API 키 불필요)
 */

import { collectAllData } from './fetcher.js';

console.log('🧪 코인이지 브리핑봇 - 데이터 수집 테스트\n');

const data = await collectAllData();

console.log('\n=== 수집 결과 요약 ===\n');

if (data.market) {
  console.log('📊 주요 시세:');
  data.market.forEach(c => {
    const arrow = parseFloat(c.change24h) >= 0 ? '🟢' : '🔴';
    console.log(`  ${arrow} ${c.symbol}: $${c.price?.toLocaleString()} (${c.change24h}%)`);
  });
} else {
  console.log('❌ 시세 데이터 없음');
}

console.log('');

if (data.kimchi) {
  const p = parseFloat(data.kimchi.premium);
  console.log(`🇰🇷 김치 프리미엄: ${data.kimchi.premium}% ${p > 3 ? '⚠️ 높음!' : p < 0 ? '⚠️ 역프!' : '✅ 정상'}`);
  console.log(`   업비트: ₩${data.kimchi.upbitBtcKrw} | 바이낸스: $${data.kimchi.binanceBtcUsd}`);
  console.log(`   환율: ₩${data.kimchi.krwRate}/USDT`);
} else {
  console.log('❌ 김치 프리미엄 데이터 없음');
}

console.log('');

if (data.fearGreed) {
  const emoji = data.fearGreed.value > 75 ? '🤑' : data.fearGreed.value > 50 ? '😊' : data.fearGreed.value > 25 ? '😰' : '😱';
  console.log(`${emoji} 공포/탐욕: ${data.fearGreed.value} (${data.fearGreed.label})`);
} else {
  console.log('❌ 공포/탐욕 데이터 없음');
}

console.log('');

if (data.trending) {
  console.log('🔥 트렌딩:');
  data.trending.slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.symbol} (${c.name}) - 24h: ${c.priceChange24h}%`);
  });
} else {
  console.log('❌ 트렌딩 데이터 없음');
}

console.log('');

if (data.defi?.topGainers) {
  console.log('💎 DeFi TVL 급상승:');
  data.defi.topGainers.slice(0, 3).forEach(p => {
    console.log(`  📈 ${p.name}: ${p.tvl} (+${p.change1d}%)`);
  });
} else {
  console.log('❌ DeFi 데이터 없음');
}

console.log('\n✅ 데이터 수집 테스트 완료!\n');
console.log('다음 단계: .env 파일에 ANTHROPIC_API_KEY와 TELEGRAM_BOT_TOKEN 설정 후');
console.log('npm run briefing 으로 전체 파이프라인 실행\n');
