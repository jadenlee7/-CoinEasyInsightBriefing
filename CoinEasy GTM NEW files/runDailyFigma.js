// figma-daily/runDailyFigma.js
// =============================
// 매일 아침 실행되는 메인 진입점.
// 기존 봇의 스케줄러(node-cron 등)에서 호출하거나 CLI로 실행:
//   node figma-daily/runDailyFigma.js
//
// 흐름:
//   1. buildPayload() — 시장 데이터 fetch + 페이로드 빌드
//   2. renderBanner() — node-canvas로 PNG 생성 (디스크 저장 X, 메모리 buffer)
//   3. publishToTelegram() — 텔레그램 공지방에 사진 + 본문 발행

const { buildPayload } = require("./figmaDataBuilder");
const { renderBanner } = require("./bannerRenderer");
const { publishToTelegram } = require("./telegramPublisher");

async function runDailyFigma() {
  const startTs = new Date();
  console.log(`[${startTs.toISOString()}] 🎨 CoinEasy Daily 시작`);

  try {
    // 1) Build payload
    console.log("  📊 데이터 수집 중...");
    const payload = await buildPayload(startTs);
    const nodeCount = Object.keys(payload.texts).length;
    console.log(`  ✓ 페이로드 빌드 완료 (${nodeCount}개 필드)`);

    // 2) Render banner
    console.log("  🖼  배너 렌더링 중...");
    const t0 = Date.now();
    const pngBuffer = await renderBanner(payload);
    console.log(`  ✓ 배너 생성 완료 (${pngBuffer.length.toLocaleString()} bytes, ${Date.now() - t0}ms)`);

    // 3) Publish to Telegram
    console.log("  📤 텔레그램 발행 중...");
    const result = await publishToTelegram(pngBuffer, payload);
    console.log(`  ✓ 발행 완료: message_id=${result.message_id}`);

    const elapsedMs = Date.now() - startTs.getTime();
    console.log(`[${new Date().toISOString()}] ✅ 완료 (${elapsedMs}ms)`);

    return { success: true, payload, telegram: result, elapsedMs };
  } catch (e) {
    console.error(`  ✗ 에러:`, e.message);
    console.error(e.stack);
    return { success: false, error: e.message };
  }
}

module.exports = { runDailyFigma };

// CLI execution
if (require.main === module) {
  runDailyFigma().then((r) => {
    process.exit(r.success ? 0 : 1);
  });
}
