# Figma Daily 통합 가이드 — Node.js 봇

`-CoinEasyInsightBriefing` 레포에 매일 아침 Figma 데일리 배너 자동화를 추가하는 가이드.

---

## 📂 파일 위치

```
-CoinEasyInsightBriefing/
├── Dockerfile                                  ← 변경 X
└── 코인이지 브리핑/
    └── coineasy-briefing-bot/
        ├── package.json                        ← 의존성 추가 X (native fetch 사용)
        ├── (기존 entry: index.js / main.js / bot.js)   ← 1줄 추가
        ├── figma-daily/                        ← 🆕 신규 폴더
        │   ├── figmaNodes.js
        │   ├── figmaDataBuilder.js
        │   ├── telegramDispatcher.js
        │   └── runDailyFigma.js
        └── figma-plugin/                       ← 🆕 (로컬 설치용, 서버 X)
            ├── manifest.json
            ├── code.js
            ├── ui.html
            └── README.md
```

> **Dockerfile은 그대로** — `coineasy-briefing-bot` 폴더 전체가 `/app`으로 복사되므로 새 폴더가 자동 포함됨.

---

## 🔧 1단계: 파일 복사

`figma-daily/` 폴더의 4개 .js 파일을 GitHub에 업로드:

```
figma-daily/
├── figmaNodes.js
├── figmaDataBuilder.js
├── telegramDispatcher.js
└── runDailyFigma.js
```

GitHub 웹에서 직접 업로드:
1. 레포 → `코인이지 브리핑/coineasy-briefing-bot/` 진입
2. **Add file → Create new file**
3. 파일명 입력란에 `figma-daily/figmaNodes.js` 입력 (슬래시가 폴더 생성)
4. 내용 붙여넣기 → Commit
5. 4개 파일 반복

`figma-plugin/` 폴더도 같은 방식으로 (서버에서는 안 돌아가지만 운영팀 공유용).

---

## 🔌 2단계: 기존 entry 파일에 통합

기존 봇의 메인 파일 (보통 `index.js`, `main.js`, 또는 `bot.js`)에 **2줄만 추가**.

### 옵션 A: 봇에 이미 `node-cron` 있다면

```js
// 기존 코드 위쪽 어딘가 (require 섹션)
const cron = require('node-cron');  // 이미 있을 가능성 높음
const { runDailyFigma } = require('./figma-daily/runDailyFigma');

// 기존 cron job들 옆에 추가
// '55 22 * * *' = UTC 22:55 = KST 07:55 (한국 아침)
cron.schedule('55 22 * * *', async () => {
  await runDailyFigma();
});
```

### 옵션 B: `node-cron` 없다면 — 첫 설치

```bash
npm install node-cron --save
```

그 후 옵션 A의 코드 추가.

> **timezone 주의**: Railway 컨테이너는 UTC가 기본. KST 07:55에 실행하려면 cron 표현식을 UTC 22:55로 작성하거나, `node-cron`의 옵션으로 `{ timezone: 'Asia/Seoul' }` 추가:
> ```js
> cron.schedule('55 7 * * *', async () => {
>   await runDailyFigma();
> }, { timezone: 'Asia/Seoul' });
> ```

### 옵션 C: setInterval로 직접 (cron 없이)

가장 간단하지만 정확도 낮음. 권장 X.

---

## 🔐 3단계: 환경변수 추가 (Railway)

Railway 대시보드 → 프로젝트 → Variables → 추가:

```
COINEASY_FIGMA_BOT_TOKEN=<텔레그램 봇 토큰>
COINEASY_MANAGER_CHAT_ID=<제이든 user_id 또는 운영팀 그룹 chat_id>
ANTHROPIC_API_KEY=<이미 있을 가능성 높음 — 없으면 추가>
```

**chat_id 확인법:**
- 개인 DM: 텔레그램에서 `@userinfobot` 한테 `/start` → user_id 받기
- 그룹: 그룹에 `@RawDataBot` 추가 → 봇이 chat_id 출력

**텔레그램 봇 토큰**은 기존 `coineasydaily` 봇 토큰을 재사용해도 되고, 새 봇을 BotFather에서 만들어도 됩니다 (`CoinEasyFigmaUpdaterBot` 같은 이름).

---

## 🧪 4단계: 로컬 테스트 (선택)

배포 전에 로컬에서 한 번 돌려보기:

```bash
cd "코인이지 브리핑/coineasy-briefing-bot"
export COINEASY_FIGMA_BOT_TOKEN="..."
export COINEASY_MANAGER_CHAT_ID="..."
export ANTHROPIC_API_KEY="..."

# 데이터 빌드만 테스트 (텔레그램 전송 X)
node figma-daily/figmaDataBuilder.js

# 전체 파이프라인 (텔레그램 전송까지)
node figma-daily/runDailyFigma.js
```

성공하면:
1. 콘솔에 `✅ 완료 (3000ms)` 같은 메시지
2. 매니저 텔레그램 채팅에 미리보기 + JSON 코드블록 두 메시지 도착

---

## 🎨 5단계: Figma 플러그인 설치 (제이든 로컬 컴퓨터)

플러그인은 Railway 서버가 아니라 **제이든의 Figma 데스크탑 앱**에 설치해야 합니다.

1. `figma-plugin/` 폴더를 로컬로 다운로드 (예: `~/Documents/Figma Plugins/coineasy-figma-updater/`)
2. **Figma 데스크탑** 열기 (웹 X)
3. EASYWORLD 파일 열기
4. 메뉴 → **Plugins → Development → Import plugin from manifest...**
5. 다운로드한 `manifest.json` 선택
6. 등록 완료

이제 매일 아침 이 플로우:
1. 텔레그램 알림 도착 (07:55 KST)
2. JSON 코드블록 길게 눌러 복사
3. Figma 데스크탑 → Plugins → CoinEasy Daily Updater
4. **📋 클립보드 붙여넣기 → ✨ Apply → 📤 Export PNG**
5. 다운로드된 PNG를 코인이지 공지방에 업로드

총 작업 시간: 30초

---

## 🐛 트러블슈팅

### "fetch is not defined" 에러

Node 18 미만 버전 사용 중. Dockerfile에서 `node:20-slim`이라 문제 없을 텐데, 만약 로컬에서 발생하면:
```bash
node --version  # v18 이상이어야 함
```

또는 `node-fetch` 설치:
```bash
npm install node-fetch
```
그리고 각 .js 파일 상단에 추가:
```js
const fetch = require('node-fetch');
```

### CoinGecko rate limit

무료 API라 분당 ~30 요청 제한. 매일 1번 실행이므로 문제 없지만, 만약 429 에러 뜨면 CoinMarketCap pro API로 교체 권장.

### 텔레그램 메시지가 너무 김

JSON이 4096자 넘으면 잘림. 현재 코드는 자동 압축 fallback 있음. 그래도 안 되면 `sendDocument`로 .json 첨부 방식으로 전환.

### Figma 노드 ID 변경

피그마에서 노드를 새로 만들거나 삭제하면 ID가 바뀜. 그 경우:
1. 클로드에게 "Figma 노드 ID 다시 추출해줘" 요청
2. `figmaNodes.js`와 `figma-plugin/code.js`의 NODE_MAP 양쪽 다 업데이트

### Promise.all 한 번에 너무 많은 API 호출

CoinGecko + Upbit + ER-API + DefiLlama가 동시에 호출됨. 만약 rate limit 걸리면 `figmaDataBuilder.js`의 `Promise.all`을 `await` 시퀀스로 풀어주세요:

```js
// Before
const [prices, fearGreed, kimchi, defi, trending] = await Promise.all([...]);

// After
const prices = await fetchPricesCoingecko();
const fearGreed = await fetchFearGreed();
// ...
```

---

## 📊 발전 방향

이 시스템 안정화 후:

1. **자동 발행 통합** — Figma 플러그인이 export한 PNG를 webhook으로 봇에 POST → 봇이 코인이지 공지방 자동 발행 (제이든 클릭 1번 → 0번)

2. **다른 시리즈 확장** — Easy Ed, EasyAlpha, Squid/Yellow 클라이언트 리포트도 같은 패턴 (`figma-daily/`, `figma-easyed/`, `figma-easyalpha/`)

3. **Pillow 백업** — A안 (Pillow로 동일 디자인 재현)을 같이 두면 Figma 다운타임 시 fallback 가능

---

## ⚠️ 가정한 부분 (확인 필요)

이 가이드는 다음을 가정했어요. 다르면 알려주세요:

- ✅ Node.js 봇이 `npm start`으로 상시 실행 (Dockerfile 기준 확인됨)
- ❓ 봇 entry는 `package.json`의 `main` 또는 `scripts.start`가 가리키는 파일
- ❓ 봇 안에 자체 스케줄링 (`node-cron` 등)이 이미 있음 — 없으면 1줄 install
- ❓ ANTHROPIC_API_KEY는 이미 환경변수에 있음 (TTS 봇이라 Claude 안 쓸 수도 있음)
- ❓ CommonJS (`require`/`module.exports`) — ESM이면 import 문법으로 변환 필요
