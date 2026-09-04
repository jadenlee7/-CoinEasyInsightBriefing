# 🌅 코인이지 데일리 브리핑 봇

매일 아침 자동으로 크립토 시황을 수집하고, AI가 한국어 브리핑을 생성해서 텔레그램에 발송합니다.
네이버 블로그 SEO 최적화 초안도 자동 생성됩니다.

## 🏗️ 아키텍처

```
CoinGecko API ──┐
DeFiLlama API ──┤
Upbit API ──────┤──→ Data Collector ──→ Claude API ──→ 텔레그램 공지방
Binance API ────┤                          │            텔레그램 채팅방
Fear&Greed API ─┘                          └──→ 네이버 블로그 초안 (.md)
```

## 🔑 데이터 소스
| 소스 | 데이터 | API 키 |
|------|--------|--------|
| CoinGecko | 시세, 트렌딩, 글로벌 시장 | 불필요 (무료) |
| DeFiLlama | DeFi TVL, 체인별 TVL | 불필요 (무료) |
| Upbit | 업비트 BTC/KRW | 불필요 (공개) |
| Binance | 바이낸스 BTC/USDT | 불필요 (공개) |
| Alternative.me | 공포/탐욕 지수 | 불필요 (무료) |
| **Claude API** | **브리핑 생성** | **필요** |
| **Telegram Bot** | **메시지 발송** | **필요** |

## 🚀 빠른 시작

### 1. 로컬 테스트 (데이터 수집만)

```bash
git clone <repo>
cd coineasy-briefing-bot
npm install
npm test  # API 키 없이 데이터 수집 테스트
```

### 2. 전체 실행

```bash
cp .env.example .env
# .env 파일에 API 키 입력
npm run briefing  # 1회 즉시 실행
```

### 3. Railway 배포

```bash
# Railway CLI
railway login
railway init
railway up

# 환경변수 설정 (Railway 대시보드에서)
ANTHROPIC_API_KEY=sk-ant-xxxxx
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHANNEL_ID=-1001234567890
```

## ⚙️ 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 |
| `TELEGRAM_BOT_TOKEN` | ✅ | 텔레그램 봇 토큰 |
| `TELEGRAM_CHANNEL_ID` | ✅ | 공지 채널 Chat ID |
| `TELEGRAM_CHAT_ID` | ❌ | 채팅방 Chat ID (추가 발송) |
| `TYPEFULLY_API_KEY` | ✅* | Typefully 소셜 예약 발행 API 키 |
| `TYPEFULLY_SOCIAL_SET_ID` | ✅* | CoinEasy Typefully Social Set ID |
| `TELEGRAM_GROWTH_X_BRIEFING_AM_URL` | ❌ | exact `briefing_am` X → Telegram deep link. 없거나 틀리면 아침 CTA만 fail-closed |
| `TELEGRAM_GROWTH_X_BRIEFING_PM_URL` | ❌ | exact `briefing_pm` X → Telegram deep link. 없거나 틀리면 저녁 CTA만 fail-closed |
| `BRIEFING_HOUR_KST` | ❌ | 발송 시각 (KST, 기본: 8) |
| `BRIEFING_MINUTE_KST` | ❌ | 발송 분 (기본: 0) |
| `SAVE_BLOG_DRAFT` | ❌ | 블로그 초안 저장 (기본: true) |
| `DEBUG` | ❌ | 디버그 모드 (기본: false) |

`*` Typefully 소셜 발행을 사용할 때만 필수입니다.

### X → Telegram 소통방 다리

X 브리핑은 링크 없는 기본 본문과 Telegram 소통방으로 이어지는 마지막
답글로 구성됩니다. LinkedIn과 Threads는 기존처럼 동일한 기본 본문 1건만
전송됩니다.

CTA를 활성하려면 Telegram 봇이 아래 두 creative를 정식
allowlist에 반영한 뒤 Railway에 exact URL 두 개를 설정합니다.

```env
TELEGRAM_GROWTH_X_BRIEFING_AM_URL=https://t.me/coineasy_insight_bot?start=join_x_briefing_am
TELEGRAM_GROWTH_X_BRIEFING_PM_URL=https://t.me/coineasy_insight_bot?start=join_x_briefing_pm
```

파이프라인은 현재 session type(`morning`/`evening`)을 명시적으로 넘겨
`briefing_am`/`briefing_pm`을 선택합니다. 다른 봇·redirect·payload,
교차 설정된 AM/PM URL, 알 수 없는 session type은 허용하지 않습니다.
해당 session의 값이 없거나 exact URL과 다르면 X CTA만 생략하고 기존
X·LinkedIn·Threads 본문은 계속 예약합니다. URL이 하나라도 포함된
Typefully draft는 API 요청 시점으로부터 최소 15분 뒤로 `publish_at`을
보정합니다.

## 📋 텔레그램 봇 세팅

1. @BotFather에서 봇 생성 → 토큰 받기
2. 봇을 채널에 관리자로 추가
3. Chat ID 확인: `https://api.telegram.org/bot<TOKEN>/getUpdates`

## 📝 네이버 블로그 워크플로우

봇이 생성한 초안은 `./drafts/blog_YYYY-MM-DD.md`에 저장됩니다.
팀원(Yechan/Seungmin)이 하루 30분 편집 후 수동 포스팅하는 반자동 워크플로우 권장.

## 💰 예상 비용

- Claude API: ~$0.3-0.5/일 (Sonnet, 입출력 합산)
- Railway: $5/월 (Starter plan)
- **월 총 ~$20 이하**

## 🔧 커스터마이징

### 브리핑 시간 변경
```env
BRIEFING_HOUR_KST=9      # 오전 9시로 변경
BRIEFING_MINUTE_KST=30    # 9시 30분
```

### 브리핑 톤/구조 변경
`src/generator.js`에서 `TELEGRAM_SYSTEM_PROMPT` 수정

### 데이터 소스 추가
`src/fetcher.js`에 새 fetcher 함수 추가 후 `collectAllData()`에 통합

## 📁 프로젝트 구조

```
coineasy-briefing-bot/
├── src/
│   ├── index.js        # 메인 오케스트레이터 + cron
│   ├── fetcher.js      # 데이터 수집 (6개 소스)
│   ├── generator.js    # Claude API 브리핑 생성
│   └── telegram.js     # 텔레그램 발송
├── src/test.js         # 데이터 수집 테스트
├── drafts/             # 블로그 초안 저장 (자동 생성)
├── logs/               # 디버그 로그 (DEBUG=true)
├── .env.example        # 환경변수 템플릿
├── railway.json        # Railway 배포 설정
├── package.json
└── README.md
```
