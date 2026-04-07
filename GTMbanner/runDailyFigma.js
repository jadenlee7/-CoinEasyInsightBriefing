// figma-daily/runDailyFigma.js
// =============================
// 매일 아침 실행되는 메인 진입점.
// 기존 봇의 스케줄러(node-cron 등)에서 호출하거나
// CLI로 직접 실행 가능: `node figma-daily/runDailyFigma.js`

const { buildPayload } = require("./figmaDataBuilder");
const { sendPayload } = require("./telegramDispatcher");

async function runDailyFigma() {
  const startTs = new Date();
  console.log(`[${startTs.toISOString()}] 🎨 CoinEasy Daily Figma payload 시작`);

  try {
    const payload = await buildPayload(startTs);
    const nodeCount = Object.keys(payload.texts).length;
    console.log(`  ✓ payload 빌드 완료 (${nodeCount}개 노드)`);

    const result = await sendPayload(payload);
    console.log(`  ✓ 텔레그램 전송 완료:`, result);

    const endTs = new Date();
    const elapsedMs = endTs - startTs;
    console.log(`[${endTs.toISOString()}] ✅ 완료 (${elapsedMs}ms)`);

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
