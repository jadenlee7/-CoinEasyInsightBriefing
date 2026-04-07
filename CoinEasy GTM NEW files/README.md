# CoinEasy Daily — Figma 자동 배너 시스템

매일 아침 시장 데이터를 자동으로 수집해서 EASYWORLD 디자인 톤의 배너 PNG를 생성하고, 코인이지 텔레그램 공지방에 자동 발행합니다.

## ✨ 무엇을 하나요

```
[07:55 KST] Railway 봇 자동 실행
   ↓ CoinGecko/Fear&Greed/DefiLlama/Trending API 호출
   ↓ Claude API로 오늘의 인용문 생성
   ↓ node-canvas로 EASYWORLD 디자인 톤 배너 PNG 렌더링 (0.5초)
   ↓ 텔레그램 공지방에 사진 + 본문 자동 발행
[완전 자동, 수동 작업 0초]
```

**결과물 예시:** 1080×1380 PNG, EASYWORLD frame 28334:14 디자인 1:1 재현
- 정품 픽셀아트 Bull/Bear 캐릭터
- 실시간 BTC + 알트 시세 (자동 색상: 양수 그린, 음수 레드)
- 김치 프리미엄 + 공포/탐욕 게이지 (자동 너비 조정)
- DeFi 핫이슈 / 트렌딩 TOP 3
- Claude가 매일 새로 생성하는 인용문
- COINEASY 픽셀 로고 푸터

## 📁 파일 구조

```
coineasy-briefing-bot/
├── (기존 entry, e.g. index.js)            ← 1줄만 추가
├── package.json                           ← canvas 의존성 1줄 추가
├── figma-daily/                           ← 🆕 신규 모듈
│   ├── figmaNodes.js                      Figma 노드 ID 매핑 (참고용)
│   ├── figmaDataBuilder.js                데이터 fetch + 페이로드 빌드
│   ├── bannerRenderer.js                  node-canvas 배너 렌더링
│   ├── telegramPublisher.js               텔레그램 sendPhoto 발행
│   └── runDailyFigma.js                   메인 오케스트레이터
└── assets/                                ← 🆕 캐릭터/로고 PNG
    ├── bull.png                           Figma 정품 (335x277, 투명 배경)
    ├── bear.png                           Figma 정품 (335x277, 투명 배경)
    └── coineasy-logo.png                  Figma 픽셀 로고 (그린 컬러)
```

## 🚀 설치 가이드

### 1단계: 파일 업로드 (GitHub)

레포의 `코인이지 브리핑/coineasy-briefing-bot/` 경로 아래에 위 구조 그대로 업로드.

특히 `assets/` 폴더는 봇이 매일 읽기 때문에 **반드시 같이 commit** 해야 합니다.

### 2단계: package.json 수정

```json
{
  "dependencies": {
    "...기존": "유지",
    "canvas": "^2.11.2"
  }
}
```

또는 명령어로:
```bash
cd "코인이지 브리핑/coineasy-briefing-bot"
npm install canvas --save
```

### 3단계: Dockerfile 수정

기존 Dockerfile에 한 줄만 추가하면 끝. node-canvas는 cairo 라이브러리가 필요해요.

```dockerfile
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    fonts-noto-cjk \
    fonts-dejavu-core \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 나머지는 그대로
```

추가된 라이브러리:
- `libcairo2-dev` — 2D 그래픽 라이브러리 (필수)
- `libpango1.0-dev` — 텍스트 렌더링 (필수)
- `libjpeg-dev`, `libgif-dev`, `librsvg2-dev` — 이미지 포맷 지원
- `pkg-config`, `build-essential` — node-gyp 빌드 도구

> `fonts-noto-cjk`는 이미 있어서 한국어 폰트 OK.

### 4단계: 환경변수 추가 (Railway)

Railway 대시보드 → Variables:

```
COINEASY_BOT_TOKEN=<텔레그램 봇 토큰>
COINEASY_ANNOUNCEMENT_CHAT=<공지방 chat_id, 예: -1001234567890>
ANTHROPIC_API_KEY=<Claude API 키 — 인용문 생성용>
```

> **기존 봇이 이미 텔레그램 토큰을 다른 변수명으로 갖고 있다면** (예: `TELEGRAM_BOT_TOKEN`), `telegramPublisher.js`의 `BOT_TOKEN` fallback이 자동 처리하거나, 코드에서 변수명만 바꿔주세요.

> **chat_id 확인법**: 공지방에 `@RawDataBot` 잠깐 추가하면 chat_id 출력해줌. 보통 `-1001...` 으로 시작.

### 5단계: 기존 entry 파일에 cron 추가

기존 `index.js` (또는 메인 파일)에 2줄만 추가:

```js
// 상단 require 섹션
const cron = require('node-cron');  // 이미 있을 가능성 높음
const { runDailyFigma } = require('./figma-daily/runDailyFigma');

// 기존 cron job 옆에 추가
// '0 23 * * *' = UTC 23:00 = KST 08:00
cron.schedule('0 23 * * *', runDailyFigma, {
  timezone: 'UTC'
});
```

`node-cron`이 없으면:
```bash
npm install node-cron --save
```

ESM (`"type": "module"`) 사용 중이면 `require` → `import`:
```js
import cron from 'node-cron';
import { runDailyFigma } from './figma-daily/runDailyFigma.js';
```

### 6단계: 로컬 테스트

```bash
cd "코인이지 브리핑/coineasy-briefing-bot"
export COINEASY_BOT_TOKEN="..."
export COINEASY_ANNOUNCEMENT_CHAT="..."
export ANTHROPIC_API_KEY="..."

# 데이터 빌드만 (텔레그램 발행 안 함)
node figma-daily/figmaDataBuilder.js

# 배너 렌더링 테스트 (test_banner.png 생성)
node figma-daily/bannerRenderer.js

# 전체 파이프라인 (실제 텔레그램 발행)
node figma-daily/runDailyFigma.js
```

성공하면:
1. 콘솔에 진행 로그 (데이터 → 렌더링 → 발행)
2. 코인이지 공지방에 배너 + 본문 도착

## 🐛 트러블슈팅

### `Cannot find module 'canvas'`
```bash
npm install canvas --save
```

### `Error: Cannot find module '../assets/bull.png'`
`assets/` 폴더가 git에 commit 되었는지 확인. PNG 파일도 같이.

### `Error: libcairo.so.2: cannot open shared object file`
Dockerfile에 `libcairo2-dev`가 빠짐. 3단계 다시 확인.

### 한국어가 □□□ 로 표시됨
`fonts-noto-cjk`가 빠짐. Dockerfile에 `fonts-noto-cjk` 있는지 확인.
로컬 macOS에서 테스트할 땐 시스템에 Noto Sans CJK가 설치돼있어야 함:
```bash
brew install --cask font-noto-sans-cjk-kr
```

### 텔레그램 발행 실패: `chat not found`
- chat_id가 정확한지 (`-100` prefix 포함)
- 봇이 공지방의 admin인지
- 봇 토큰이 유효한지

### CoinGecko rate limit (429)
무료 API라 분당 ~30 요청. 매일 1번이면 무관하지만, 만약 발생하면 CoinMarketCap pro로 교체.

### Claude API 인용문 생성 실패
`ANTHROPIC_API_KEY`가 없으면 fallback 인용문 사용. 정상 작동.

## 📊 다음 단계

이 시스템 안정화 후 추가할 수 있는 것:

1. **Typefully 통합** — X / LinkedIn / Threads 멀티 플랫폼 자동 발행
2. **다른 시리즈 확장** — Easy Ed, EasyAlpha 등 동일 패턴
3. **A/B 디자인 테스트** — 여러 템플릿 중 랜덤 선택
4. **분석 로깅** — 발행 결과/도달률 DB 저장

## 🎨 디자인 변경 시

배너 디자인을 바꾸고 싶을 때:
- **색상/사이즈/위치**: `bannerRenderer.js`의 `COLORS`, 좌표 상수 수정
- **캐릭터 변경**: 새 PNG를 `assets/bull.png` 또는 `bear.png`로 교체
- **로고 변경**: `assets/coineasy-logo.png` 교체
- **전체 디자인 변경**: Figma에서 새 디자인 → 좌표 측정 → renderer 코드 재작성

> 주의: Figma의 EASYWORLD 디자인이 master이지만, 봇은 그 디자인을 코드로 재현한 것이므로 양쪽 동기화는 수동입니다. 디자인 큰 변경 시 양쪽 다 수정 필요.

## ⚙️ 추론 기반 가정사항

이 가이드는 다음을 가정했어요. 다르면 알려주세요:

- ✅ Node 20 (Dockerfile 기준)
- ✅ `fonts-noto-cjk` 설치됨 (Dockerfile 기준)
- ❓ CommonJS (`require`) — ESM이면 import 문법으로 변환 필요
- ❓ `node-cron` 사용 가능 — 없으면 npm install
- ❓ `ANTHROPIC_API_KEY` 환경변수 존재 — 없으면 fallback 인용문 사용
- ❓ 텔레그램 봇이 공지방 admin — 아니면 발행 실패
