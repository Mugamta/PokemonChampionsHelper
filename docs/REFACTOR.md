# 구조·성능 개선 작업 (2026-10-25 전체 검토)

전체 검토(성능 측정 + 코드 구조)에서 나온 작업 목록. 하나씩 하고 끝나면 [x] + 결과를 적는다.
기능(화면 결과)은 바꾸지 않는 작업만 모았다. 기능 쪽 미구현은 [BUGS.md](BUGS.md) / [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## 측정 기준 (2026-10-25, main ef90897)

Playwright + Chromium, 1920×950, 사용률 상위 12마리로 파티 구성. "4배" = CPU 4배 감속(휴대폰 근사).

| 동작 | PC | 4배 | 원인 |
|---|---|---|---|
| 배틀 화면 클릭 (랭크·상태이상·필드) | 20~50ms | 약 200ms | 문제 없음 |
| 파티 화면 진입 | 약 650ms (재방문 250ms) | 긴 작업 1.3초 | 레이아웃 190~390ms (노드 1900개). `measurePreview` 강제 측정 시점에 몰림 |
| 성능표 결정력 탭 | 약 500ms | 1.6초 | 첫 방문에 346마리 결정력 계산 220ms (모듈 캐시라 재방문은 그리기만 약 60ms) |
| 선출·배틀·도감 진입 | 230~350ms | 1~1.4초 | 보통 |
| 유휴 | 0 | — | 반복 작업 없음 |

첫 접속 전송량 (gzip): 약 1.37MB — `usage.json` 335KB(전 레귤레이션·싱글/더블 전부, 로딩 화면을 막음),
Google Fonts CSS 162KB + Noto Sans KR 조각 약 250KB, MDI 아이콘 CSS 43KB(jsdelivr, 렌더 차단 — 직접 쓰는 아이콘은 3개),
JS 약 250KB, 나머지 게임 데이터 약 150KB.

## 작업 목록 (순서대로)

### 구조

- [x] **S1. `composables/useBattle.ts` 분할** (3935줄 한 함수 → 조립 266줄 + 층별 8개 파일, 결과는 아래 "한 것")
  - 타입·상수 → `utils/battleState.ts` (순수, 컴포넌트·테스트도 여기서 import)
  - 함수 본문을 의존 방향이 한쪽으로만 흐르는 층으로: `composables/battle/` 아래
    core(읽기: 슬롯·실능치·필드·전투 정보) → order(스피드·행동 순서·이번 턴 예상 상태) → queries(가능한 효과·교체·PP·입력 검증)
    → field(날씨·필드·벽) → hp(HP·랭크·상태이상 변화) → entry(등장·교체·변신·확정) → moves(기술 효과·맞았을 때) → turn(턴 적용·되돌리기).
    `useBattle` 은 조립 + 화면용 작은 setter + 반환 API (API 는 그대로)
  - `composables/battle/` 는 index.ts 가 없어서 Nuxt 자동 import 대상이 아님 (내부 모듈)
- [x] **S2. `components/battle/ActionPanel.vue` 분할** (1196줄 → 311 + ActionSlot 800 + OppConfirm 136)
- [x] ~~S3. 성능표 계산 캐시를 모듈 단위로~~ — 확인해 보니 `PowerTable.vue` 의 `rowCache`/`candCache` 는 이미 모듈 단위(`<script>` 블록)였음
  (검토 때 잘못 봄). 재방문 측정: 첫 방문 긴 작업 226ms → 다시 열면 61ms(그리기만). 할 일 없음

### 로딩

- [x] **L1. `usage.json` 을 레귤레이션 × 싱글/더블로 나누고 필요할 때 로드**, 사용률을 기다리지 않고 화면 표시 (결과는 아래)
- [x] **L2. 아이콘을 SVG(`@mdi/js`)로** — jsdelivr MDI CSS·폰트 제거 (결과는 아래)

### 보류 (사용자 판단)

- 폰트: 현재 언어 폰트만 / 한·일은 시스템 폰트 (화면 인상이 바뀜)
- 파티 화면 레이아웃 비용: 원인 확인부터 (그리드 `max-content` 행 + 카드 높이 통일 추정)
- 스프라이트 WebP 변환 (성능표·도감 전체 스크롤 시 약 5MB)

## 한 것

### S1 useBattle 분할 (2026-10-25)

- `utils/battleState.ts` 476줄 (타입·상수), `composables/battle/` core 478 / order 609 / queries 437 / field 99 / hp 292 /
  entry 521 / moves 629 / turn 706, `useBattle.ts` 266줄. 구성은 [ARCHITECTURE.md](ARCHITECTURE.md) "배틀 상태"
- 함수 본문은 그대로 옮김 (원본과 줄 단위 대조: 바뀐 건 배분 추정 → 스피드 구간 연결(`CoreHooks`), 스냅샷 저장 2곳 → `pushHistory()`,
  반환 API 매핑뿐). 각 층은 `const { ... } = b` 로 아래 층 함수를 꺼내 쓰므로 본문 코드가 원래와 같다
- 반환 API 는 같음 (화면 코드 변경은 타입·상수 import 경로만: ActionPanel·EntryOrder·FieldPanel·MonPanel·ReplacePanel·
  useBattleAnalysis·useOppEstimate → `~/utils/battleState`)
- 확인: `npm test` 400개, lint 0, typecheck 0, 빌드 후 싱글·더블 배틀 화면 턴 진행·토글에서 콘솔 오류 0

### S2 ActionPanel 분할 (2026-10-25)

- `BattleActionSlot` (`components/battle/ActionSlot.vue`): 필드 칸 하나의 행동 입력 — 기술/교체/행동 불가, 데미지·급소·빗나감,
  흡수 후 HP, 부가효과·접촉 효과 체크, 광역기 다른 칸, 공격 후 교체, 아군 피해, 예상 데미지·자멸 위험. 기술 선택지(moveGroups·calledGroups)·앙코르 고정 포함
- `BattleOppConfirm` (`components/battle/OppConfirm.vue`): 상대 도구·특성 확정 칸
- `ActionPanel`: 진영 배치, 선후공 관찰(orderFixed·orderNeeded), 등장 순서, 상태이상 예고, 입력 오류, 적용·되돌리기.
  사용률 표(`usageTable`)를 한 번 구해 두 자식에 넘기고, 데미지 입력 방식의 브라우저 저장도 여기서 한 번만
- 감시자 두 개를 칸별로 바꿈: 앙코르 기술 고정, "결과가 정해진 데미지" 자동 채우기. 분석 대상 칸이 바뀌면 이전 칸에 자동으로 채운 값은
  그 칸이 지운다 (예전엔 진영 단위로 기억해서 새 분석 대상 칸에서 지우려 했음 — 더블에서만 차이)
- 확인: 분할 전(HEAD) 빌드와 같은 스모크(상대 선두 → 양쪽 기술·데미지 입력 → 2턴 적용, 싱글·더블 3턴·토글)를 돌려
  출력(턴별 HP·행동 상태·콘솔 오류)이 완전히 같음. 테스트 400개·lint 0·typecheck 0

### L1 사용률 통계 나누기 (2026-10-25)

- `public/data/usage/`: `index.json`(종류·레귤레이션별 포맷·자료 월·배틀 수, 490B) + `{single|double}-{레귤레이션}.json`(표).
  `scripts/build-data.mjs` 가 이 형식으로 쓰고(받기 실패면 기존 폴더 유지), 지금 있던 `usage.json` 은 같은 형식으로 변환만 함(새 달 통계는 받지 않음)
- `useGameData`: 시작할 때는 `usage/index.json` 만 받음. `usageMeta(kind)` = 출처 목록, `usageTable(kind, reg)` = 표(없으면 받기 시작하고
  undefined → 받으면 다시 계산), `loadUsage(kind, reg)` = 받을 때까지 기다리는 Promise (같은 파일 중복 요청 없음).
  `AppHeader` 가 화면을 보여 준 뒤 현재 레귤레이션 싱글·더블 표를 미리 받음. `GameData.usage` 는 없앰
- 자동 배치가 표를 받기 전에 돌면 규칙 배치가 들어가므로 `useAutoSet().ready()` 를 기다린 뒤 배치 (선출 화면 "자동 배치" 버튼,
  상대 포켓몬을 고를 때 — 그사이 다른 포켓몬으로 바꿨으면 하지 않음). `pickUsageTable` 은 출처 목록으로도 고를 수 있게 제네릭
- 확인: 분할 전(HEAD) 빌드와 비교해 첫 화면 TOP 6·선출 화면 자동 배치 6마리·도감 기술 사용률·소개 페이지 출처·출처 표시 문구가 같음.
  표 응답을 1.5초 늦춘 상태에서 상대 포켓몬을 고르면 표가 온 뒤 HEAD 와 같은 통계 배치가 들어감.
  **로딩 화면이 끝날 때까지 받는 양 609KB → 310KB (gzip, 로컬 서버 기준 JS·CSS·데이터)**. 테스트 400개·lint 0·typecheck 0

### L2 아이콘 SVG (2026-10-25)

- `nuxt.config` `vuetifyOptions.icons.defaultSet = 'mdi-svg'` — Vuetify 내부 아이콘(드롭다운·지우기·체크박스 등)은 `vuetify/iconsets/mdi-svg` 의 경로,
  앱이 직접 쓰는 아이콘은 `@mdi/js` 에서 import (`mdiMagnify`). `@mdi/js` 는 vuetify-nuxt-module 이 mdi-svg 를 켤 때 설치돼 있어야 함 (쓰는 경로만 번들)
- `UiLazyField`(입력칸 자리표시)는 Vuetify SVG 아이콘(VSvgIcon)과 같은 마크업 `<i class="v-icon …"><svg class="v-icon__svg">`, `prependIcon` 은 SVG 경로
- 확인: 자리표시·진짜 입력칸의 아이콘 마크업이 같은 구조, 전후 스크린샷 차이는 안티앨리어싱 수준(입력칸 1.5~3% 픽셀, 화면 전체 0.09%),
  외부 요청에서 `cdn.jsdelivr.net/npm/@mdi/font` CSS·폰트 2건이 없어짐. 테스트 400개·lint 0·typecheck 0

## 정리 (2026-10-25)

| 항목 | 전 | 후 |
|---|---|---|
| 로딩 화면이 끝날 때까지 받는 양 (gzip, 로컬) | 609KB | 310KB |
| 첫 접속 2초 동안 전체 (폰트·미리 받는 통계 포함) | 1366KB | 1017KB |
| 첫 화면을 막는 외부 CSS | Google Fonts + jsdelivr MDI | Google Fonts |
| `useBattle.ts` | 3935줄 | 266줄 + `composables/battle/` 8개 + `utils/battleState.ts` |
| `ActionPanel.vue` | 1196줄 | 311줄 + ActionSlot 800 + OppConfirm 136 |

남은 것은 위 "보류 (사용자 판단)" — 폰트, 파티 화면 레이아웃 비용, 스프라이트 WebP.
