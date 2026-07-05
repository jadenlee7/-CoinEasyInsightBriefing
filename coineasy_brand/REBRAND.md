# REBRAND — 기존 슬롯을 CoinEasy 2026 카드 시스템으로 이관

목표: nansen / santiment / kcsi / briefing / etf 카드가 korea_insights와 동일한 브랜드
(크림 #FFF8F0 + 오렌지 + Gmarket Sans + EASYBOY)로 나가게 한다.
**캡션·포스트 텍스트·발행 시각은 무변경. 이미지 렌더만 교체.**

## 원칙

- 디자인 원본은 `korea_insights/templates/korea_card.html.j2` 하나. 슬롯별 새 템플릿 만들지 말 것.
- 이번 팩의 템플릿에는 `badge_flag` 파라미터가 추가돼 있음(기본 true). 기존 korea_insights 렌더와 하위호환.
- 새 레이아웃 불필요: kimchi(히어로 숫자형)와 daily(리스트형) 두 개로 전 슬롯 커버.
- 각 모듈의 렌더 함수만 korea_card 경유로 전환. 수집·카피·발행 로직 무수정.

## 슬롯별 컨텍스트 매핑

| 슬롯 | card_type | series(badge) | flag | mascot | 매핑 |
|---|---|---|---|---|---|
| kcsi | kimchi | `KCSI` | ✅ | easyboy_plain | hero=지수, unit=/100, pill=구간(중립/공포/탐욕), stats=서브스코어 4종(소셜·김프·변동성·매크로), insight=전일 대비 한 줄 |
| briefing | daily | `DAILY BRIEFING` | ❌ | easyboy_gent | headline=그날 헤드라인, rows=트렌딩 top3, stats=BTC·ETH·공포탐욕 |
| nansen 1/2 | daily | `ONCHAIN DIGEST` | ❌ | easyboy_diver | rows=포지셔닝(BTC/ETH/SOL 롱비중), stats=합계 지표 |
| nansen 2/2 | daily | `ONCHAIN DIGEST` | ❌ | easyboy_diver | rows=밈코인 순유입 top4(ticker/체인·시총/유입액), stats=합계·체인·HL포지셔닝 |
| santiment | kimchi | `EVENING WRAP` | ❌ | easyboy_btc | hero=대표 지표(예: 소셜볼륨 or 센티밸런스), stats=보조 3종 |
| etf | kimchi | `ETF FLOWS` | ❌ | easyboy_btc | hero=BTC 순유입(hero_size 140~150), pill=INFLOW/OUTFLOW, stats=BTC·ETH·누적 |

숫자 색 규약: 글로벌 컨벤션(상승 녹색/하락 적색) 유지 — korea_insights와 동일.
pill 상태: up(녹)/down(적)/flat(회). 히어로가 긴 문자열(+$263.9M 등)이면 `hero_size` 140~160으로 축소.

## 목업 (2026-07-03 실발행 데이터, renders_rebrand/)

- rebrand_kcsi.png — 44/100 중립 ▲6, 서브스코어 4종
- rebrand_briefing.png — "알트 반등 주도" + 트렌딩 NEX/ANSEM/PENGU + BTC·ETH·공포탐욕
- rebrand_nansen.png — 밈코인 순유입 top4 + 합계/체인/HL 포지셔닝

## Claude Code 킥오프 프롬프트 (오늘 go-live 안정 확인 후 실행)

```
리브랜딩 PR을 만들어줘. korea_insights/REBRAND.md가 스펙이야. 플랜 모드로 시작.

작업 범위:
1. 동봉된 korea_card.html.j2(badge_flag 추가본)로 korea_insights/templates/ 갱신,
   easyboy_diver.png / easyboy_gent.png를 korea_insights/assets/brand/에 추가
2. nansen_digest / santiment_digest / kcsi / briefing 각 모듈의 이미지 렌더 함수를
   korea_card.html.j2 경유로 전환. REBRAND.md 매핑 표의 card_type·series·badge_flag·
   mascot·컨텍스트 구조를 그대로 따를 것
3. 캡션 텍스트, 발행 시각, Typefully 페이로드, 수집 로직은 한 줄도 수정 금지
4. 기존 다크 템플릿 파일은 삭제하지 말고 남겨둘 것(롤백용)
5. 검증: 슬롯별 픽스처 렌더 PNG를 사용자에게 전송해 육안 확인 → pytest → PR.
   슬롯 전환은 env 플래그 없이 일괄 적용(이미지만 바뀌므로 리스크 낮음)

금지: korea_insights 파이프라인 코드 수정, 폰트·브랜드 에셋 재생성, 모듈 리팩토링.
```

## 타이밍

오늘(7/4)은 korea_insights 첫 실발행 안정화에 집중. 리브랜딩 PR은 **내일 이후** 진행 권장.
한 번에 변수 하나씩. 두 PR이 겹치면 문제 발생 시 원인 분리가 안 됨.
