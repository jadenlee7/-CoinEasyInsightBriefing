// CoinEasy Daily Updater — Figma Plugin
// =====================================
// 텔레그램에서 받은 JSON 페이로드를 붙여넣으면
// EASYWORLD 'CoinEasy Daily' 템플릿의 모든 텍스트 노드를 자동 업데이트한다.

// ─── 노드 ID 매핑 ───────────────────────────────────────
// (figma_nodes.py와 동기화 — 변경 시 양쪽 다 수정)

const NODE_MAP = {
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

const GAUGE_FILL_NODE = "28347:19";
const GAUGE_MAX_WIDTH = 434;
const GAUGE_X = 582;
const GAUGE_Y = 575;

const GREEN = { r: 0, g: 0xb0/255, b: 9/255 };
const RED   = { r: 1, g: 0x1f/255, b: 0x1f/255 };

// ─── UI ─────────────────────────────────────────────────
figma.showUI(__html__, { width: 380, height: 480 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "apply") {
    try {
      const result = await applyPayload(msg.payload);
      figma.ui.postMessage({ type: "result", success: true, data: result });
      figma.notify(`✅ 업데이트 완료: ${result.updated}개 노드`);
    } catch (e) {
      figma.ui.postMessage({ type: "result", success: false, error: String(e) });
      figma.notify(`❌ 에러: ${e.message || e}`, { error: true });
    }
  } else if (msg.type === "select-frame") {
    // Jump to the template frame
    try {
      const node = await figma.getNodeByIdAsync("28334:14");
      if (node) {
        await figma.setCurrentPageAsync(node.parent);
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
        figma.notify("🎯 템플릿 프레임 선택됨");
      } else {
        figma.notify("❌ 프레임 28334:14 못 찾음", { error: true });
      }
    } catch (e) {
      figma.notify(`❌ ${e.message}`, { error: true });
    }
  } else if (msg.type === "export") {
    try {
      const node = await figma.getNodeByIdAsync("28334:14");
      const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
      figma.ui.postMessage({ type: "exported", bytes });
      figma.notify("✅ Export 완료");
    } catch (e) {
      figma.notify(`❌ Export 에러: ${e.message}`, { error: true });
    }
  } else if (msg.type === "close") {
    figma.closePlugin();
  }
};

// ─── Core: payload 적용 ────────────────────────────────
async function applyPayload(payload) {
  if (!payload || !payload.texts) {
    throw new Error("payload.texts 없음");
  }

  // 1) 폰트 미리 로드 (Noto Sans KR)
  await figma.loadFontAsync({ family: "Noto Sans KR", style: "Black" });
  await figma.loadFontAsync({ family: "Noto Sans KR", style: "Bold" });
  await figma.loadFontAsync({ family: "Noto Sans KR", style: "Medium" });
  await figma.loadFontAsync({ family: "Noto Sans KR", style: "Regular" });

  let updated = 0;
  const errors = [];

  // 2) 텍스트 노드 업데이트
  for (const [key, newText] of Object.entries(payload.texts)) {
    const nodeId = NODE_MAP[key];
    if (!nodeId) {
      errors.push(`unknown key: ${key}`);
      continue;
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      errors.push(`node not found: ${nodeId} (${key})`);
      continue;
    }
    if (node.type !== "TEXT") {
      errors.push(`not a text node: ${nodeId}`);
      continue;
    }

    // Load the node's actual font (in case it differs)
    if (node.fontName !== figma.mixed) {
      await figma.loadFontAsync(node.fontName);
    }

    node.characters = String(newText);
    updated++;
  }

  // 3) 색상 업데이트 (변동률 노드만 — 양수 초록, 음수 빨강)
  if (payload.colors) {
    for (const [key, hex] of Object.entries(payload.colors)) {
      const nodeId = NODE_MAP[key];
      if (!nodeId) continue;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || node.type !== "TEXT") continue;
      const rgb = hexToRgb(hex);
      node.fills = [{ type: "SOLID", color: rgb }];
    }
  }

  // 4) Gauge bar width 조정 (Fear & Greed)
  if (payload.gauge && typeof payload.gauge.fill_pct === "number") {
    const gauge = await figma.getNodeByIdAsync(GAUGE_FILL_NODE);
    if (gauge && "resize" in gauge) {
      const newW = Math.max(20, Math.round(GAUGE_MAX_WIDTH * payload.gauge.fill_pct));
      gauge.resize(newW, gauge.height);
    }
  }

  return { updated, errors };
}

function hexToRgb(hex) {
  const m = hex.replace("#", "");
  return {
    r: parseInt(m.slice(0, 2), 16) / 255,
    g: parseInt(m.slice(2, 4), 16) / 255,
    b: parseInt(m.slice(4, 6), 16) / 255,
  };
}
