// figma-daily/figmaNodes.js
// =========================
// EASYWORLD frame 28334:14 텍스트 노드 ID 매핑.
// bannerRenderer는 이 ID를 직접 쓰진 않지만,
// payload.texts의 키 이름이 이 매핑과 1:1 대응됨.
//
// 향후 Figma REST API export 방식으로 전환할 때 이 매핑이 필요함.

const FIGMA_FILE_KEY = "SRPoM0lDRtn61Q91sFWg1D";
const TEMPLATE_FRAME_ID = "28334:14";

const DYNAMIC_NODES = {
  date_label:     "28341:16",
  btc_price:      "28342:17",
  btc_change:     "28342:18",
  market_change:  "28342:19",
  eth_price:      "28345:17",
  eth_change:     "28345:18",
  sol_price:      "28345:22",
  sol_change:     "28345:23",
  sui_price:      "28345:27",
  sui_change:     "28345:28",
  xrp_price:      "28345:32",
  xrp_change:     "28345:33",
  kimchi_rate:    "28346:18",
  kimchi_premium: "28346:20",
  kimchi_note:    "28346:21",
  fear_value:     "28347:20",
  fear_label:     "28347:21",
  fear_note:      "28347:22",
  defi_1_name:    "28348:19",
  defi_1_note:    "28348:20",
  defi_1_change:  "28348:22",
  defi_2_name:    "28348:24",
  defi_2_note:    "28348:25",
  defi_2_change:  "28348:27",
  defi_3_name:    "28348:29",
  defi_3_note:    "28348:30",
  defi_3_change:  "28348:32",
  trend_1_name:   "28349:20",
  trend_1_change: "28349:21",
  trend_2_name:   "28349:24",
  trend_2_change: "28349:25",
  trend_3_name:   "28349:28",
  trend_3_change: "28349:29",
  quote_line1:    "28352:17",
  quote_line2:    "28352:18",
};

module.exports = {
  FIGMA_FILE_KEY,
  TEMPLATE_FRAME_ID,
  DYNAMIC_NODES,
};
