// figma-daily/figmaNodes.js
// =========================
// EASYWORLD 'CoinEasy Daily — Apr 7 2026' 템플릿 (frame 28334:14) 노드 매핑.
// figma-plugin/code.js와 항상 동기화되어야 함.

const FIGMA_FILE_KEY = "SRPoM0lDRtn61Q91sFWg1D";
const TEMPLATE_FRAME_ID = "28334:14";

// 매일 업데이트되는 동적 텍스트 노드
// key = JSON payload field, value = Figma node ID
const DYNAMIC_NODES = {
  // 헤더
  date_label:     "28341:16",   // "4월 7일 화요일 아침"

  // BTC 헤드라인
  btc_price:      "28342:17",
  btc_change:     "28342:18",
  market_change:  "28342:19",

  // 알트 카드
  eth_price:      "28345:17",
  eth_change:     "28345:18",
  sol_price:      "28345:22",
  sol_change:     "28345:23",
  sui_price:      "28345:27",
  sui_change:     "28345:28",
  xrp_price:      "28345:32",
  xrp_change:     "28345:33",

  // 김치 프리미엄
  kimchi_rate:    "28346:18",
  kimchi_premium: "28346:20",
  kimchi_note:    "28346:21",

  // 공포/탐욕
  fear_value:     "28347:20",
  fear_label:     "28347:21",
  fear_note:      "28347:22",

  // DeFi 핫이슈 3종
  defi_1_name:    "28348:19",
  defi_1_note:    "28348:20",
  defi_1_change:  "28348:22",
  defi_2_name:    "28348:24",
  defi_2_note:    "28348:25",
  defi_2_change:  "28348:27",
  defi_3_name:    "28348:29",
  defi_3_note:    "28348:30",
  defi_3_change:  "28348:32",

  // 트렌딩 TOP 3
  trend_1_name:   "28349:20",
  trend_1_change: "28349:21",
  trend_2_name:   "28349:24",
  trend_2_change: "28349:25",
  trend_3_name:   "28349:28",
  trend_3_change: "28349:29",

  // 인용문
  quote_line1:    "28352:17",
  quote_line2:    "28352:18",
};

// 게이지 fill rectangle
const GAUGE_FILL_NODE = "28347:19";
const GAUGE_MAX_WIDTH = 434;

module.exports = {
  FIGMA_FILE_KEY,
  TEMPLATE_FRAME_ID,
  DYNAMIC_NODES,
  GAUGE_FILL_NODE,
  GAUGE_MAX_WIDTH,
};
