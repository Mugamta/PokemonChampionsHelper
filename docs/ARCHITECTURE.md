# 아키텍처

## 디렉터리

```
pages/                 라우트 (아래 표)
layouts/default.vue    AppHeader + 데이터 로딩 대기 + 푸터
components/
  AppHeader.vue        로고, 메뉴, 레귤레이션 선택, 시계, 언어 전환. onMounted 에서 데이터 로드 + 예전 파티 이전
  ui/                  PokeSprite, ItemIcon, TypeBadge, CategoryBadge, HpBar, DamageCell, RankControl,
                       TypeGroup(포켓몬 타입 + 방어 상성 툴팁), TypeTip(상성 툴팁 내용)
  team/                SlotEditor(슬롯 편집), SlotCard(읽기 전용 카드), SpeciesPicker / ItemPicker / MovePicker / NaturePicker,
                       FormToggle(배틀 폼 토글 / 캐스퐁 날씨 버튼), PreviewConditions(결정력 미리보기 조건: 날씨·필드·상태이상·랭크),
                       TypeConsistency(파티 전원에게 1배 이상 들어가는 공격 타입 한 줄)
  battle/              EntryView(선출), BattleView(배틀) 와 그 하위 패널들 (DamageInput = 데미지 / 체력 전후 입력칸)
                       (SpeedPanel = 상대 스피드 구간 막대, EstimatePanel = 상대 배분 추정)
  perf/                포켓몬 성능표: BulkTable / PowerTable / SpeedTable, MonCell(포켓몬 칸)
composables/           상태 + 계산 연결 (아래 표)
utils/                 순수 계산 (tests/ 에서 테스트): types.ts, stats.ts, damage.ts, ko.ts, typeCheck.ts(타입 상성 도우미),
                       speedInference.ts(선후공 → 상대 스피드 구간), statInference.ts(데미지 → 상대 배분 격자),
                       perfTable.ts(성능표 내구·결정력·스피드), autoSet.ts(상대 포켓몬 자동 배치), accuracy.ts(명중·급소)
plugins/locale.client.ts  언어 선택 (localStorage 'pch_lang' → 브라우저 언어 → ko)
plugins/theme.client.ts   화면 테마 낮/밤/시스템 (localStorage 'pch_theme', 없으면 시스템) → <html data-theme> + Vuetify 테마
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
/help  /about  /contact
```

| 라우트 | 컴포넌트 | 내용 |
|---|---|---|
| `/` | pages/index.vue | 모드 카드, 현재 레귤레이션, 파티 진행도 |
| `/party` | pages/party.vue → TeamSlotEditor ×6 | 포켓몬/특성/도구/성격/능력P/기술, 실능치·HP 배수·내구·결정력, 결정력 미리보기 조건, "통계 추천" 버튼(사용률 통계가 있는 포켓몬) |
| `/single`, `/double` | BattleEntryView(mode) | 왼쪽 내 파티(눌러서 선출), 가운데 데미지 표(방향 탭), 오른쪽 상대 6마리 입력(compact SlotEditor, 포켓몬을 고르면 자동 배치 + "자동 배치" 버튼) |
| `/single/battle`, `/double/battle` | BattleView(mode) | 필드 포켓몬 패널, 필드 상태, 행동 입력·턴 적용, 예상 흐름, 스피드 구간, 배분 추정, 데미지 표 2종 |
| `/stats` | pages/stats.vue → PerfBulkTable / PerfPowerTable / PerfSpeedTable | 포켓몬 성능표. 검색, 탭은 `?tab=bulk|power|speed` |

## composables

| 이름 | 역할 |
|---|---|
| `useGameData()` | `public/data` 로드(1회), 현재 언어 이름/설명 로드, `name/text/pokemon/move/learnset/megaFor/pokemonSprite/itemSprite/options` |
| `useRegulation()` | 레귤레이션 목록, 현재 시각 자동 선택/수동 선택, `isAllowed(id)`, `selectableSpecies` |
| `useTeam(side)` | `'mine' | 'opp'` 6슬롯 (`TeamSlot`), 메가 미리보기 토글(`megaOn`), 배틀 폼 토글(`altOn`, null = 기본값). localStorage `pch-team-mine-v2` / `pch-team-opp-v2` 자동 저장. `migrateLegacyTeam()` 은 예전 한글 저장분 이전 |
| `useEntry(mode)` | 선출 순서(내 파티 인덱스 배열), 싱글 3 / 더블 4 |
| `useTeamCalc()` | 슬롯 → `ResolvedSlot`(메가 폼·실능치·특성), `combatant()`, 데미지 표 칸 `cell()`, 결정력 `power()`, 연속기 타수 `hits()` |
| `useAutoSet()` | 상대 포켓몬 자동 배치: 현재 레귤레이션의 사용률 통계(`usage.json`, `usageSet`)가 있으면 우선, 없으면 `utils/autoSet.ts` 규칙. 슬롯에 적용(`apply`, 같은 파티 도구 중복 피함) |
| `useBattle(mode)` | 배틀 상태 머신. `useState('battle-{mode}')` 에 저장(화면 이동해도 유지, 선출/상대 구성이 바뀌면 자동 초기화) |
| `useBattleAnalysis(b)` | 행동 순서, 스피드 구간(`speedBands`), 시나리오 데미지, ①②③ 흐름, 연속기 자멸 위험, 상태이상 예고. 문구는 `{key, params}` |
| `useOppEstimate(b)` | 상대 배분 추정: 저장된 관측(주고받은 데미지)마다 그 시점 상태로 다시 계산해 내구·공격·도구 후보 범위를 좁힌다 |
| `usePerfList()` | 성능표 대상 (레귤레이션 출전 가능 + 메가, 계산 폼, "신규"), 이름 검색. 계산용 데이터는 `toRaw` 로 넘김(반응형 추적 비용) |
| `useIncremental(list)` | 긴 목록을 조금씩 그리기 (끝 요소가 화면 근처에 오면 더) |
| `useLine()` | 위 문구를 현재 언어로 렌더링 (`@키` / `@키|이름` 파라미터 번역) |
| `useThemeMode()` | 테마 선택값 `'light' | 'dark' | 'system'` (적용·저장은 plugins/theme.client.ts) |
| `useFitLayout()` | 넓은 화면 한 화면 배치 여부 (`(min-width: 1400px) and (min-height: 700px)`). 배틀 화면의 패널 재배치·표 탭, 파티 6장 한 줄에 사용 |

## 배틀 상태 (useBattle)

- 로스터: 내 쪽 = 선출 순서, 상대 = 상대 파티 6마리. 필드 칸 `active[N]` 이 로스터 인덱스를 가리킨다.
- 포켓몬별 `MonState`: `hp`(내 쪽 실수치 / 상대 %), `megaOn`, `megaUsed`, `status`, `toxicTurn`, `volatiles{키:경과턴}`, `boosts`,
  `transform`(변신 대상), `timesHit`(분노의주먹), 상대만 `obs`(배분 추정 관측) · `speedSp`(선후공으로 좁힌 스피드 SP 구간)
- 진영별: 해저드(`hazards`), 벽/순풍 등(`screens`), 확인된 상대(`revealed`)
- 전역: 날씨(원시 날씨는 `permanent` + 원인 포켓몬), 필드, 공간(트릭룸 등), 페어리록, 턴, 관찰한 선후공, 분석 대상 칸(`focus`)
- `executeTurn()`: 교체 → 메가진화(모두) → 행동 순서(`turnOrder`: 우선도 → 관찰한 선후공 / 스피드)대로 기술
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
- 폰트 Rubik(숫자/제목) + Noto Sans KR/JP
