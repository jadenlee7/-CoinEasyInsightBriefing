# ROUND2 — 채널 언어 정책 + ops 라우팅 + 브랜드 v2

확정 정책 (2026-07-04, Jaden):
- **TG 공지방(t.me/coiniseasy) = 전부 한국어.** 카드(배너)와 캡션 모두 KR. 해시태그 3개 유지, CTA는 하이퍼링크 3종.
- **Typefully(@Coiniseasy) = 전부 영어.** 카드와 카피 모두 EN, "외국인에게 한국 시장 인사이트를 주는 CoinEasy" 톤. 해시태그·링크·팔로우 CTA 금지(X 알고리즘 페널티).
- 이 정책은 coineasydaily 전 슬롯에 적용.

PR 분할: **2a(우선)** = korea_insights 언어 분리 + ops 라우팅. **2b(다음)** = 기존 슬롯 카드 v2 이관(REBRAND.md). 기존 슬롯의 Typefully 카피 EN화는 2b 이후 슬롯별 단계 진행.

## A. korea_insights 언어 분리 (PR-2a)

### A1. 카드 이중 렌더
kimchi / listing 잡은 카드 2장 렌더: KR 카드 → TG, EN 카드 → Typefully. 템플릿·레이아웃 무수정, 컨텍스트 문자열만 분리. daily 잡은 Typefully 전용이므로 EN 단일 유지.

KR 컨텍스트 (kimchi, 검증된 목업 renders_rebrand/kr_kimchi_card.png 기준):

| 필드 | EN | KR |
|---|---|---|
| series | KOREA INSIGHTS | 김프 체크 |
| kicker | KIMCHI CHECK · BTC | 코인이지 김프 체크 · BTC |
| date_label | Jul 4, 2026 | 7월 4일 (토) |
| hero_tag | DISCOUNT / PREMIUM / NEUTRAL | 역프 / 김프 / 중립 |
| insight | (compose EN) | "업비트 BTC가 글로벌보다 <b>{x}% 싸게(비싸게)</b> 거래 중입니다. …갭이 뒤집히는 순간을 주목하세요." 톤 |
| stats 라벨 | UPBIT BTC/KRW · GLOBAL (SRC) · USD/KRW | 업비트 BTC · 글로벌 (바이낸스/코인베이스) · 환율 USD/KRW |
| mascot_tag | KIMCHI CHECK | 김프 체크 |

listing KR: series "상장 레이더", kicker "업비트 신규 상장", headline "한국 거래소 신규 상장", extag "업비트 · KRW", mascot_tag "상장 레이더".

### A2. TG KR 캡션 (데이터 기반 템플릿, LLM 불필요)

```
🇰🇷 코인이지 김프 체크
{YYYY년 M월 D일 · 요일}

<b>BTC {abs}% {역프리미엄|프리미엄}</b> (업비트 vs 글로벌)
{관찰 한 줄: 역프면 "한국이 아직 글로벌보다 싸게 거래 중입니다. 갭이 플러스로 뒤집히면 주목." / 김프면 "한국이 글로벌보다 비싸게 삽니다. 국내 수급이 붙었습니다."}

• 업비트 BTC: ₩{x}M ({chg}% 24h)
• 글로벌({Binance|Coinbase}): ${y}
• 환율 USD/KRW: {fx}
• 업비트 24h 거래대금: ₩{vol}T

#비트코인 #김치프리미엄 #업비트

⚠️ 투자 조언 아님 · DYOR
📢 <a href="https://t.me/coiniseasy">공지방</a> · 💬 <a href="https://t.me/coineasy_official">소통방</a> · ✖️ <a href="https://x.com/coiniseasy">X</a>
```

listing 캡션 해시태그: #{TICKER} #업비트상장 #신규상장. parse_mode="HTML" 유지(기존 헬퍼 그대로).

### A3. Typefully EN 카피 룰 (compose.py)
- SYSTEM 하드 룰 추가: "Never include hashtags, external links, or follow CTAs."
- fallback 마지막 포스트에서 "Follow @Coiniseasy for the flow you cannot see from outside." 문장 삭제. 아이덴티티 문장("This is Korea Insights by CoinEasy. Daily Korea market signal in English, straight from Seoul.")은 유지.
- 기존 하드 룰(280자·em dash 금지·예측 금지·최대 3포스트) 무수정.

## B. ops 라우팅 수정 (PR-2a)

7/4 dry-run에서 `[ops]` 메시지 2건이 **공지방에 공개 발행**됨. `_build_korea_deps`의 `send_telegram_alert`가 물린 대상 chat을 확인할 것.
- 공지방과 동일하면: `OPS_CHAT_ID` env(신규)로 분리. 미설정 시 ops 발송 스킵 + 로그만.
- 기존 nansen/santiment의 ops 대상과 동일한 곳을 쓰도록 정렬(별도 채널이 이미 있으면 그걸 재사용).

## C. 기존 슬롯 (PR-2b) — REBRAND.md 참조

카드만 v2로 이관(캡션·발행시각·언어 무변경). Typefully 카피 EN화는 2b 머지·안정화 후 슬롯별로:
브리핑 → KCSI → 난센 → 산티먼트 → ETF 순서 제안. 각 슬롯 EN화 시 TG에는 KR 버전 유지/신설.

## 킥오프 프롬프트 (PR-2a용, Claude Code에 붙여넣기)

```
2차-a PR: 채널 언어 정책 + ops 라우팅. korea_insights/ROUND2.md의 A·B 섹션이 스펙. 플랜 모드 시작.

1. kimchi/listing: TG 공지방용 카드를 KR 컨텍스트로 별도 렌더(ROUND2.md A1 표),
   Typefully용 EN 카드는 기존 유지. daily는 EN 단일 유지
2. TG 캡션을 ROUND2.md A2 템플릿으로 교체: 해시태그 3개 + CTA 하이퍼링크 3종(HTML).
   데이터 기반 템플릿이며 LLM 호출 불필요
3. compose.py: SYSTEM에 "Never include hashtags, external links, or follow CTAs." 추가,
   fallback 마지막 포스트의 Follow 문장 삭제(아이덴티티 문장은 유지). 나머지 하드 룰 무수정
4. ops 라우팅: dry-run에서 [ops]가 공지방에 발행됨. send_telegram_alert 대상 확인,
   공지방이면 OPS_CHAT_ID env로 분리(미설정 시 스킵+로그)
5. 검증: KR/EN 카드 픽스처 각 1장 사용자 전송, 캡션 HTML 앵커 3종 assert,
   compose 룰 pytest 추가, PR 생성

금지: 템플릿 디자인 수정, 기존 슬롯(nansen/santiment/kcsi/briefing) 코드 접근(2차-b 범위),
cron 시각 변경, 에셋 재생성.
```
