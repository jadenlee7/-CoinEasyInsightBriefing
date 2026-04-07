# feat: add automated CoinEasy Daily figma banner pipeline

## Summary
매일 아침 시장 데이터를 자동으로 수집해서 EASYWORLD 디자인 톤의 배너 PNG를 생성하고, 코인이지 텔레그램 공지방에 자동 발행하는 모듈을 추가합니다.

## What's added

### 1. New module: `figma-daily/`
| File | Purpose |
|---|---|
| `figmaNodes.js` | EASYWORLD frame 28334:14 텍스트 노드 ID 매핑 |
| `figmaDataBuilder.js` | CoinGecko/Fear&Greed/DefiLlama/Trending API 호출 + Claude로 인용문 생성 + 페이로드 빌드 |
| `bannerRenderer.js` | node-canvas 기반 PNG 렌더링 (1080×1380, EASYWORLD 디자인 1:1) |
| `telegramPublisher.js` | 코인이지 공지방에 sendPhoto + 본문 텍스트 |
| `runDailyFigma.js` | 메인 오케스트레이터 (cron 진입점) |

### 2. Assets: `assets/`
- `bull.png` — Figma 정품 캐릭터 (335×277, 투명 배경)
- `bear.png` — Figma 정품 캐릭터 (335×277, 투명 배경)
- `coineasy-logo.png` — Figma 픽셀 로고 (그린 #00b009)

### 3. Dockerfile updates
node-canvas의 native 빌드를 위해 cairo, pango 등 라이브러리 추가:
```diff
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    fonts-noto-cjk \
    fonts-dejavu-core \
+   libcairo2-dev \
+   libpango1.0-dev \
+   libjpeg-dev \
+   libgif-dev \
+   librsvg2-dev \
+   pkg-config \
+   build-essential \
    && rm -rf /var/lib/apt/lists/*
```

### 4. package.json
```diff
{
  "dependencies": {
+   "canvas": "^2.11.2"
  }
}
```

### 5. Entry file (index.js or main.js)
```diff
+ const { runDailyFigma } = require('./figma-daily/runDailyFigma');
+
+ // 매일 KST 08:00 (UTC 23:00)
+ cron.schedule('0 23 * * *', runDailyFigma);
```

## Environment variables (Railway)
세 개 추가 필요:
- `COINEASY_BOT_TOKEN` — 텔레그램 봇 토큰 (기존 `TELEGRAM_BOT_TOKEN` 재사용 가능)
- `COINEASY_ANNOUNCEMENT_CHAT` — 공지방 chat_id (-1001...)
- `ANTHROPIC_API_KEY` — Claude 인용문 생성용 (없으면 fallback)

## How it works

```
[07:55 KST] cron 트리거
   ↓ figmaDataBuilder.buildPayload()
     - CoinGecko: BTC/ETH/SOL/SUI/XRP 가격 + 24h 변동률
     - alternative.me: Fear & Greed Index
     - 업비트 + ER-API: 김치 프리미엄
     - DefiLlama: TVL 변화 (Lido/Aave/Maker)
     - CoinGecko Trending: TOP 3
     - Claude API: 오늘의 인용문 (2줄, 한국어)
   ↓ bannerRenderer.renderBanner(payload)
     - node-canvas 1080×1380 캔버스
     - assets/bull.png, bear.png, coineasy-logo.png 로드
     - EASYWORLD 디자인 1:1 재현
     - PNG buffer 반환 (~150KB)
   ↓ telegramPublisher.publishToTelegram(buffer, payload)
     - sendPhoto multipart upload
     - caption: 배너 본문 (한국어, Markdown)
     - caption > 1024 chars면 reply로 분할

총 소요 시간: ~3-5초 (대부분 API 호출, 렌더링은 0.5초)
```

## Testing

```bash
# 데이터 빌드만 (안전)
node figma-daily/figmaDataBuilder.js

# 배너 렌더링 (test_banner.png 생성, 발행 X)
node figma-daily/bannerRenderer.js

# 전체 파이프라인 (실제 발행)
node figma-daily/runDailyFigma.js
```

## Risk / Rollback

- **Low risk**: 새 모듈은 기존 봇과 완전 분리. cron 추가 한 줄만 빼면 영향 0.
- **Rollback**: cron 라인 주석처리 → 기존 봇 정상 작동
- **Asset 누락 시**: `bannerRenderer.js`가 명확한 에러 메시지로 실패. 텔레그램 발행 안 함.
- **API 실패 시**: 각 fetcher에 fallback 값. 부분 데이터로도 발행 가능.

## Future enhancements

이 PR 후에 추가할 수 있는 것들:
- [ ] Typefully API 통합 → X/LinkedIn/Threads 멀티 플랫폼 자동 발행
- [ ] 한국어 텍스트 자동 분할 (Threads 500자 한도 대응)
- [ ] 발행 결과 DB 로깅
- [ ] A/B 디자인 테스트
- [ ] Easy Ed, EasyAlpha 등 다른 시리즈로 확장

---

🎨 디자인 출처: EASYWORLD frame 28334:14 (CoinEasy Daily template)
