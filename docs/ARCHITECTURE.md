# 아키텍처

## 디렉터리

```
pages/                 라우트 (아래 표)
layouts/default.vue    AppHeader + 데이터 로딩 대기 + 푸터
components/
  AppHeader.vue        로고, 메뉴, 레귤레이션 선택, 시계, 언어 전환. onMounted 에서 데이터 로드 + 예전 파티 이전
  ui/                  PokeSprite, ItemIcon, TypeBadge, CategoryBadge, HpBar, DamageCell, RankControl, LazyField, LazyTooltip,
                       TypeGroup(포켓몬 타입 + 방어 상성 툴팁), TypeTip(상성 툴팁 내용)
  team/                SlotEditor(슬롯 편집), SlotCard(읽기 전용 카드), SpeciesPicker / ItemPicker / MovePicker / NaturePicker,
                       FormToggle(배틀 폼 토글 / 캐스퐁 날씨 버튼), PreviewConditions(결정력 미리보기 조건: 날씨·필드·상태이상·랭크),
                       TypeConsistency(파티 전원에게 1배 이상 들어가는 공격 타입 한 줄)
  battle/              EntryView(선출), BattleView(배틀) 와 그 하위 패널들 (DamageInput = 데미지 / 체력 전후 입력칸,
                       ActionPanel = 이번 턴 행동 → 칸마다 ActionSlot + 상대 확정 OppConfirm)
                       (SpeedPanel = 상대 스피드 구간 막대, EstimatePanel = 상대 배분 추정, SlotMini = 선출 화면의 접은 슬롯 한 줄,
                       RecommendPanel = 추천 플레이 — 싱글만, 행동 패널 제목 줄의 "추천 플레이" 버튼으로 여는 다이얼로그, 열려 있는 동안만 계산)
  perf/                포켓몬 성능표: BulkTable / PowerTable / SpeedTable, MonCell(포켓몬 칸)
composables/           상태 + 계산 연결 (아래 표)
  battle/              useBattle 의 층별 구현 (index.ts 가 없어 자동 import 대상 아님, 아래 "배틀 상태")
utils/                 순수 계산 (tests/ 에서 테스트): types.ts, stats.ts, damage.ts, ko.ts, typeCheck.ts(타입 상성 도우미),
                       speedInference.ts(선후공 → 상대 스피드 구간), statInference.ts(데미지 → 상대 배분 격자),
                       perfTable.ts(성능표 내구·결정력·스피드), autoSet.ts(상대 포켓몬 자동 배치), accuracy.ts(명중·급소),
                       recommend.ts(추천 플레이 이득표·점수)
plugins/locale.client.ts  언어 선택 (localStorage 'pch_lang' → 브라우저 언어 → en)
plugins/theme.client.ts   화면 테마 낮/밤/시스템 (localStorage 'pch_theme', 없으면 시스템) → <html data-theme> + Vuetify 테마
plugins/page-loading.client.ts  페이지 이동 시 로딩 오버레이(UiPageLoading) 를 먼저 그린 뒤 이동, page:finish 에서 끔
i18n/locales/          화면 문구 ko/en/ja (.json) + Vuetify 문구 병합(.ts)
public/data/           게임 데이터 (scripts/build-data.mjs 생성물)
public/sprites/        포켓몬/도구 스프라이트 (생성물)
scripts/               build-data.mjs + sources/ (PP, 한국어 도구명 보강, 레귤레이션 목록)
tests/                 vitest. nuxt-env.ts = Nuxt 자동 import 를 흉내 내서 composables(useBattle 등)를 테스트
```

Nuxt 컴포넌트 이름은 폴더 접두사가 붙는다: `components/team/SlotEditor.vue` → `<TeamSlotEditor>`,
`components/battle/BattleView.vue` → `<BattleView>` (파일명이 폴더명으로 시작하면 중복 제거).

## 화면 흐름

```
/  ──▶ /party ──┬──▶ /single ──▶ /single/battle   (선출 3마리, 1:1)
                └──▶ /double ──▶ /double/battle   (선출 4마리, 2:2, 광역기 0.75배)
/stats                                           (포켓몬 성능표)
/dex                                             (포켓몬 도감)
/help  /about  /contact
```

| 라우트 | 컴포넌트 | 내용 |
|---|---|---|
| `/` | pages/index.vue | 모드 카드, 현재 레귤레이션, 파티 진행도 |
| `/party` | pages/party.vue → TeamSlotEditor ×6 | 포켓몬/성별(TeamGenderToggle, 둘 다 가능한 종만 ♂/♀)/특성/도구/성격/능력P/기술, 실능치·HP 배수·내구·결정력, 결정력 미리보기 조건, "통계 추천" 버튼(사용률 통계가 있는 포켓몬) |
| `/single`, `/double` | BattleEntryView(mode) | 왼쪽 내 파티(눌러서 선출), 가운데 데미지 표(방향 탭), 오른쪽 상대 6마리 입력(compact SlotEditor, 포켓몬을 고르면 자동 배치 + "자동 배치" 버튼) |
| `/single/battle`, `/double/battle` | BattleView(mode) | 필드 포켓몬 패널, 필드 상태, 행동 입력·턴 적용, 예상 흐름, 스피드 구간, 배분 추정, 데미지 표 2종 |
| `/stats` | pages/stats.vue → PerfBulkTable / PerfPowerTable / PerfSpeedTable | 포켓몬 성능표. 검색, 탭은 `?tab=bulk|power|speed` |
| `/dex` | pages/dex.vue → DexDetail / DexMoves | 포켓몬 도감. 목록은 성능표와 같음(usePerfList), `?id=`. 종족값·실능치(배분·성격·랭크)·스피드(도구)·내구·타입별 실질 내구(반감열매·특성), 배우는 기술 전부의 위력·명중·PP·우선도·결정력·사용률. 처음엔 통계 배분. 계산 utils/dex.ts |

## composables

| 이름 | 역할 |
|---|---|
| `useGameData()` | `public/data` 로드(1회), 현재 언어 이름/설명 로드, `name/text/pokemon/move/learnset/megaFor/pokemonSprite/itemSprite/options`. 사용률 통계는 출처 목록 `usageMeta(kind)` + 표 `usageTable(kind, reg)`(없으면 받기 시작, 받으면 다시 계산) / `loadUsage` |
| `useRegulation()` | 레귤레이션 목록, 현재 시각 자동 선택/수동 선택, `isAllowed(id)`, `selectableSpecies` |
| `useTeam(side)` | `'mine' | 'opp'` 6슬롯 (`TeamSlot`), 완성 여부 `isComplete`(6마리·기술 1개 이상·내 파티는 성별까지, 성별 미선택 슬롯 `missingGender`), 메가 미리보기 토글(`megaOn`), 배틀 폼 토글(`altOn`, null = 기본값). localStorage `pch-team-mine-v2` / `pch-team-opp-v2` 자동 저장. `migrateLegacyTeam()` 은 예전 한글 저장분 이전 |
| `useEntry(mode)` | 선출 순서(내 파티 인덱스 배열), 싱글 3 / 더블 4 |
| `useTeamCalc()` | 슬롯 → `ResolvedSlot`(메가 폼·실능치·특성), `combatant()`, 데미지 표 칸 `cell()`, 결정력 `power()`, 연속기 타수 `hits()` |
| `useUsageKind()` | 사용률 통계 종류(싱글/더블) 선택, localStorage `pch_usage_kind`. 첫 화면·도감·파티 화면이 공유 (`TeamUsageKindToggle`) |
| `useAutoSet(kind?)` | 상대 포켓몬 자동 배치: 현재 레귤레이션의 싱글/더블 사용률 통계(`public/data/usage/`, `usageSet`, kind 생략 시 `useUsageKind`)가 있으면 우선, 없으면 `utils/autoSet.ts` 규칙. 슬롯에 적용(`apply`, 같은 파티 도구 중복 피함). 표는 따로 받으므로 자동 배치 전에 `ready()` 를 기다린다 |
| `useBattle(mode)` | 배틀 상태 머신. `useState('battle-{mode}')` 에 저장(화면 이동해도 유지, 선출/상대 구성이 바뀌면 자동 초기화). 구현은 `composables/battle/*` 를 조립, 타입·상수는 `utils/battleState.ts` |
| `useBattleAnalysis(b)` | 행동 순서, 스피드 구간(`speedBands`), 시나리오 데미지, ①②③ 흐름, 연속기 자멸 위험, 상태이상 예고. 문구는 `{key, params}` |
| `useRecommend(b)` | 추천 플레이 (싱글): 배틀 상태로 내 선택지(기술·교체) × 상대 기술 이득표 재료를 만들어 `utils/recommend.ts` 로 순위. `enabled` 가 켜졌을 때만 계산. 쓰러져 교체할 차례면 대기 포켓몬 비교. 가중치는 `useRecWeights()` (`useState` + localStorage `pch_rec_weights`) |
| `useOppEstimate(b)` | 상대 배분 추정: 저장된 관측(주고받은 데미지)마다 그 시점 상태로 다시 계산해 내구·공격·도구 후보 범위를 좁힌다 |
| `usePerfList()` | 성능표 대상 (레귤레이션 출전 가능 + 메가, 계산 폼, "신규"), 이름 검색. 계산용 데이터는 `toRaw` 로 넘김(반응형 추적 비용) |
| `useIncremental(list)` | 긴 목록을 조금씩 그리기 (끝 요소가 화면 근처에 오면 더) |
| `useLazyField()` | 입력칸을 처음엔 `UiLazyField`(겉모습만 같은 정적 마크업)로 그리고, 누르거나 포커스하면 진짜 v-autocomplete/v-select 로 바꿔 포커스·목록 열기. 종/도구/성격/기술 피커가 사용 |
| `useLine()` | 위 문구를 현재 언어로 렌더링 (`@키` / `@키|이름` 파라미터 번역) |
| `useThemeMode()` | 테마 선택값 `'light' | 'dark' | 'system'` (적용·저장은 plugins/theme.client.ts) |
| `useFitLayout()` | 넓은 화면 한 화면 배치 여부 (`(min-width: 1400px) and (min-height: 700px)`). 배틀 화면의 패널 재배치·표 탭, 파티 6장 한 줄에 사용 |

## 배틀 상태 (useBattle)

파일 구성 — 아래 층은 위 층을 부르지 않는다 (각 `createX(b)` 가 아래 층 결과를 받아 필요한 함수를 꺼내 쓴다):

| 파일 | 내용 |
|---|---|
| `utils/battleState.ts` | 타입(`MonState`·`ActionState`·`BattleState` 등)과 상수(특수 상태 지속 턴, 교체기 목록 등). 컴포넌트·테스트도 여기서 import |
| `battle/core.ts` | 읽기: 로스터 → 슬롯, 상대 도구·특성·배분 규칙, 실능치(`resolveAt`), `fieldFor`·`combatantOf`, 상태이상 면역, 대타, 되돌리기 스냅샷 |
| `battle/order.ts` | 스피드·우선도·행동 순서(`turnOrder`)·맞는 포켓몬(`hitTarget`)·공격 보정(`actionOpts`)·이번 턴 앞선 효과(`turnStateBefore`)·상대 스피드 구간·선후공 판정 |
| `battle/queries.ts` | 교체 후보·쓰러진 뒤 교체·배틀 결과, 흡수 후 HP 입력, 잠듦·앙코르·PP, 입력 검증, 확률 효과 선택지, 교체 가능 여부 |
| `battle/field.ts` | 날씨·필드·공간·벽·설치기 바꾸기 |
| `battle/hp.ts` | 랭크 변화(반응 특성·하양허브), HP 증감·회복 열매, 턴 끝 회복·데미지, 흡수, 상태이상·졸음, PP 소모 |
| `battle/entry.ts` | 내보내기·설치기·변신·위협·등장 특성, 동시 등장 묶음, 상대 도구·특성 확정 |
| `battle/moves.ts` | 기술 효과 자동 반영, 기술의 HP 효과, 맞은 직후(도구·특성), 공격한 쪽 HP 변화, 배분 추정 관측 기록 |
| `battle/turn.ts` | `executeTurn`·되돌리기 |
| `useBattle.ts` | 조립 + 초기화·화면에서 직접 고치는 setter + 반환 API |

- 로스터: 내 쪽 = 선출 순서, 상대 = 상대 파티 6마리. 필드 칸 `active[N]` 이 로스터 인덱스를 가리킨다.
- 포켓몬별 `MonState`: `hp`(내 쪽 실수치 / 상대 %), `megaOn`, `megaUsed`, `status`, `toxicTurn`, `volatiles{키:경과턴}`, `boosts`,
  `transform`(변신 대상), `timesHit`(분노의주먹), 상대만 `obs`(배분 추정 관측) · `speedSp`(선후공으로 좁힌 스피드 SP 구간)
- 진영별: 해저드(`hazards`), 벽/순풍 등(`screens`), 확인된 상대(`revealed`)
- 전역: 날씨(원시 날씨는 `permanent` + 원인 포켓몬), 필드, 공간(트릭룸 등), 페어리록, 턴, 관찰한 선후공, 분석 대상 칸(`focus`)
- 동시 등장 묶음 `entry`(선두·쓰러진 뒤 교체, 다음 턴 적용 전까지 발동 순서 수정 가능) + `entryObs`(관찰한 등장 특성 순서),
  쓰러진 뒤 교체 `pendingReplace` / `replaceFainted` (components/battle/ReplacePanel.vue, EntryOrder.vue)
- `executeTurn()`: 교체(양쪽이면 등장 특성 스피드 순) → 메가진화(모두) → 행동 순서(`turnOrder`: 우선도 → 관찰한 선후공 / 스피드)대로 기술
  (관측 기록 → 벽 깨기 → 효과 자동 반영 → 변신 → 입력한 데미지) → 원시 날씨 원인 기절 체크 → 이번 턴 상태이상
  → 턴 종료 상태이상 데미지·특수상태 경과 → 날씨/필드/공간/벽 경과 → 입력 초기화. 실행 전 스냅샷(최대 30) 저장.

## 스타일

- 디자인 토큰과 공통 클래스는 `assets/css/main.css` (`.panel`, `.btn`, `.chip`, `.tab-btn`, `.type-badge`, `--t-{type}` 타입 색, `--mine`/`--opp`)
- 테마: `:root` = 밤, `:root[data-theme='light']` = 낮. **컴포넌트에서 색을 직접 쓰지 말고 토큰을 쓴다**
  (`--well` 오목한 칸, `--field-bg`/`--field-border` 입력칸, `--hover`, `--faint`, `--line-soft`, `--accent-text` 강조 글자, `--mega` 등).
  타입·상태이상 배지처럼 테마와 무관한 색만 예외. Vuetify 테마는 `champions`(밤) / `championsLight`(낮)
- **색 사용 원칙**: 색은 의미가 있을 때만. 타입 배지, 성격 ↑(빨강)/↓(파랑), 내 쪽(청록)/상대(주황), 상태이상, 치명 데미지·확정 1타(빨강),
  선택·활성(청록), 주요 버튼(노랑). 그 외(카드 테두리, 종족값 막대, 물리/특수 배지, 결정력·우선도 수치, 턴 표시, 메가 스위치)는 중립색.
  같은 정보를 색으로 두 번 표시하지 않는다 (예: 기술 칸의 타입 점 + 타입 배지)
- PC 한 화면 배치: 폭 1400px 이상이면 `html { zoom: var(--ui-zoom) }`(0.9). 높이 700px 이상 + 페이지 `definePageMeta({ fit: true })`
  (파티·선출·배틀)이면 페이지를 화면 높이에 고정하고 `.fit-scroll` 열이 각자 스크롤. zoom 안에서 높이는 `100vh / --ui-zoom`
- Vuetify 4 의 v-autocomplete `#item` 슬롯은 `item` 이 원본 객체다 (`item.raw` 없음)
- **화면 전환 속도**: Vuetify 컴포넌트는 하나가 컴포넌트 수십 개라서 목록·카드마다 반복하면 전환이 수백 ms 느려진다.
  입력칸은 `useLazyField` + `UiLazyField`, 툴팁은 `UiLazyTooltip`(처음 마우스를 올릴 때 생성, 툴팁 띄울 요소의 자식으로 둔다)을 쓴다.
  v-tooltip 을 직접 쓰면 Vuetify 4.1 은 열지 않아도 마운트 직후 내용을 만들어 두므로 내용은 `#default="{ isActive }"` + `v-if="isActive.value"` 로.
  페이지 이동 중에는 `UiPageLoading` 오버레이가 80ms 뒤 나타난다 (`plugins/page-loading.client.ts` 가 그려질 때까지 이동을 미룸.
  새 페이지를 만드는 동안 메인 스레드가 막히므로 오버레이 애니메이션은 opacity·transform 만 — 컴포지터에서 돌아감).
  게임 데이터(`useGameData().data`, 이름표)는 `markRaw` — 바뀌지 않는 큰 JSON 을 깊은 반응형으로 만들지 않는다
- 폰트 Rubik(숫자/제목) + Noto Sans KR/JP
- 아이콘: Vuetify `mdi-svg` (아이콘 폰트·CDN 없음). 직접 쓸 때는 `@mdi/js` 에서 경로를 import (`:prepend-inner-icon="mdiMagnify"`), 문자열 `mdi-xxx` 는 안 됨
