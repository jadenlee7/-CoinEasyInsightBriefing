# R2C — 인사이트 카드 3종(스마트머니·데일리 뉴스·프로젝트 업데이트) 브랜드 v2 이관

7/5 확인된 다크 인사이트 카드 패밀리(13:30/14:00/15:00 KST 슬롯 등)를 브랜드 v2로 이관한다.
이 시리즈들은 kimchi/daily 레이아웃으로 못 담는 밀도(게이지·흐름·지표·인사이트·액션플랜·배너)라
**신규 `analysis` 카드 타입(세로 1200×1500)**을 사용한다. 템플릿에 이미 추가·검증됨
(목업: analysis_smartmoney.png, HYPER 실데이터).

## 원칙 (2b와 동일)

- 이미지 렌더만 교체. **캡션·LLM 카피 생성 로직·발행 시각·수집 무수정.**
- 인사이트/액션플랜/배너 텍스트는 해당 모듈이 이미 생성 중인 문자열을 그대로 ctx에 매핑.
- 구형 다크 템플릿은 롤백용 보존, 카드 실패 시 기존 경로 폴백.
- 모듈 식별부터: 13:30·14:00·15:00 KST 슬롯을 만드는 모듈을 탐색해 확정 후 플랜에 명시
  (2b 감사에서 확인된 forecast/TT 포함 가능성).

## analysis ctx 계약 (korea_card.html.j2)

```
card_type="analysis", card_w=1200, card_h=1500, badge_flag=False
series · date_label("M월 D일 (요일) HH:MM")
headline_l1(잉크) · headline_l2(오렌지)
fng_value · fng_label · fng_x2 · fng_y2   # 바늘 좌표: ang=radians(180-value*1.8),
                                           # x2=75+50*cos(ang), y2=80-50*sin(ang)
flow_range · flow_label · flow_bars[10]    # px 높이 리스트, 시장 흐름 미니바
metric_source · metric_title · metric_sub  # 지표 카드 (없으면 키 생략 → 블록 미렌더)
donut_value · donut_sub · donut_dash       # dash: 원둘레 295 기준 "채움 나머지" (예 "213 90")
insight(HTML b 허용) · plan[3](HTML b 허용) · banner
mascot · mascot_h=150 · mascot_tag=""      # 마스코트가 배너 위 스티커로 얹힘
watermark
```

## 시리즈 매핑

| 시리즈 | series | mascot | metric | 비고 |
|---|---|---|---|---|
| 스마트머니 데일리 | 스마트머니 | easyboy_diver | Nansen SM 도넛($순유입) | donut 녹색=유입, 유출이면 stroke #E0442E로 |
| 데일리 뉴스 | 데일리 뉴스 | easyboy_gent | 생략 가능 | F&G+흐름+인사이트+플랜+배너 구성 |
| 프로젝트 업데이트 | 프로젝트 업데이트 | easyboy_plain | 프로젝트 지표(도넛 중앙 텍스트 자유: "3단계" 등) | 클라이언트 시리즈 |

공통: F&G·시장흐름 duo는 세 시리즈 모두 유지(현행 카드와 동일 정보). donut_dash 계산과
바늘 좌표는 렌더 직전 파이썬에서 산출해 ctx로 주입(스마트머니 목업 코드 참조).

## 킥오프 프롬프트 (PR-2c, #95 머지 후 실행)

```
PR-2c: 인사이트 카드 3종 브랜드 v2 이관. korea_insights/R2C.md가 스펙. 플랜 모드 시작.

1. 13:30/14:00/15:00 KST 슬롯(스마트머니·데일리 뉴스·프로젝트 업데이트)을 만드는 모듈을
   탐색·식별해 플랜에 명시. 2b 감사의 forecast/TT 포함 여부 확인
2. 각 모듈의 이미지 렌더 함수 내부만 korea_insights render_card(card_type="analysis") 경유로
   교체. R2C.md의 ctx 계약·시리즈 매핑 그대로. 바늘 좌표/donut_dash 헬퍼는 모듈 내 구현
3. 인사이트·액션플랜·배너 등 텍스트 생성(LLM) 로직 무수정, 기존 문자열을 ctx에 매핑만.
   구형 다크 템플릿 보존 + 실패 시 기존 경로 폴백
4. 검증: 시리즈별 픽스처 렌더 3장 사용자 전송(목업 analysis_smartmoney.png와 구조 대조)
   → pytest → draft PR

금지: korea_card.html.j2 수정(이미 배포본), korea_insights 파이프라인·기타 슬롯 접근,
캡션·발행시각 변경.
```

## 순서

오늘 17:00 korea_insights 첫 실발행 확인 → #95(5슬롯 리브랜딩) 머지 → 그 후 PR-2c.
