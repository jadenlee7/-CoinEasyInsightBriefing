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
| `BRIEFING_HOUR_KST` | ❌ | 발송 시각 (KST, 기본: 8) |
| `BRIEFING_MINUTE_KST` | ❌ | 발송 분 (기본: 0) |
| `SAVE_BLOG_DRAFT` | ❌ | 블로그 초안 저장 (기본: true) |
| `DEBUG` | ❌ | 디버그 모드 (기본: false) |

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
