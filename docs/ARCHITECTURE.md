# 아키텍처

## 디렉터리

```
pages/                 라우트 (아래 표)
layouts/default.vue    AppHeader + 데이터 로딩 대기 + 푸터
components/
  AppHeader.vue        로고, 메뉴, 레귤레이션 선택, 시계, 언어 전환. onMounted 에서 데이터 로드 + 예전 파티 이전
  ui/                  PokeSprite, ItemIcon, TypeBadge, CategoryBadge, HpBar, DamageCell, RankControl
  team/                SlotEditor(슬롯 편집), SlotCard(읽기 전용 카드), SpeciesPicker / ItemPicker / MovePicker
  battle/              EntryView(선출), BattleView(배틀) 와 그 하위 패널들
composables/           상태 + 계산 연결 (아래 표)
utils/                 순수 계산: types.ts, stats.ts, damage.ts, ko.ts  (tests/ 에서 테스트)
plugins/locale.client.ts  언어 선택 (localStorage 'pch_lang' → 브라우저 언어 → ko)
i18n/locales/          화면 문구 ko/en/ja (.json) + Vuetify 문구 병합(.ts)
public/data/           게임 데이터 (scripts/build-data.mjs 생성물)
public/sprites/        포켓몬/도구 스프라이트 (생성물)
scripts/               build-data.mjs + sources/ (PP, 한국어 도구명 보강, 레귤레이션 목록)
tests/                 vitest
```

Nuxt 컴포넌트 이름은 폴더 접두사가 붙는다: `components/team/SlotEditor.vue` → `<TeamSlotEditor>`,
`components/battle/BattleView.vue` → `<BattleView>` (파일명이 폴더명으로 시작하면 중복 제거).

## 화면 흐름

```
/  ──▶ /party ──┬──▶ /single ──▶ /single/battle   (선출 3마리, 1:1)
                └──▶ /double ──▶ /double/battle   (선출 4마리, 2:2, 광역기 0.75배)
/help  /about  /contact
```

| 라우트 | 컴포넌트 | 내용 |
|---|---|---|
| `/` | pages/index.vue | 모드 카드, 현재 레귤레이션, 파티 진행도 |
| `/party` | pages/party.vue → TeamSlotEditor ×6 | 포켓몬/특성/도구/성격/능력P/기술, 실능치·HP 배수·내구·결정력, 결정력 미리보기 조건 |
| `/single`, `/double` | BattleEntryView(mode) | 왼쪽 내 파티(눌러서 선출), 가운데 데미지 표(방향 탭), 오른쪽 상대 6마리 입력(compact SlotEditor) |
| `/single/battle`, `/double/battle` | BattleView(mode) | 필드 포켓몬 패널, 필드 상태, 행동 입력·턴 적용, 예상 흐름, 스피드, 데미지 표 2종 |

## composables

| 이름 | 역할 |
|---|---|
| `useGameData()` | `public/data` 로드(1회), 현재 언어 이름/설명 로드, `name/text/pokemon/move/learnset/megaFor/pokemonSprite/itemSprite/options` |
| `useRegulation()` | 레귤레이션 목록, 현재 시각 자동 선택/수동 선택, `isAllowed(id)`, `selectableSpecies` |
| `useTeam(side)` | `'mine' | 'opp'` 6슬롯 (`TeamSlot`), 메가 미리보기 토글. localStorage `pch-team-mine-v2` / `pch-team-opp-v2` 자동 저장. `migrateLegacyTeam()` 은 예전 한글 저장분 이전 |
| `useEntry(mode)` | 선출 순서(내 파티 인덱스 배열), 싱글 3 / 더블 4 |
| `useTeamCalc()` | 슬롯 → `ResolvedSlot`(메가 폼·실능치·특성), `combatant()`, 데미지 표 칸 `cell()`, 결정력 `power()` |
| `useBattle(mode)` | 배틀 상태 머신. `useState('battle-{mode}')` 에 저장(화면 이동해도 유지, 선출/상대 구성이 바뀌면 자동 초기화) |
| `useBattleAnalysis(b)` | 스피드 비교·역산, 시나리오 데미지, ①②③ 흐름, 배분 추정, 연속기 자멸 위험, 상태이상 예고. 문구는 `{key, params}` |
| `useLine()` | 위 문구를 현재 언어로 렌더링 (`@키` / `@키|이름` 파라미터 번역) |

## 배틀 상태 (useBattle)

- 로스터: 내 쪽 = 선출 순서, 상대 = 상대 파티 6마리. 필드 칸 `active[N]` 이 로스터 인덱스를 가리킨다.
- 포켓몬별 `MonState`: `hp`(내 쪽 실수치 / 상대 %), `megaOn`, `megaUsed`, `status`, `toxicTurn`, `volatiles{키:경과턴}`, `boosts`
- 진영별: 해저드(`hazards`), 벽/순풍 등(`screens`), 확인된 상대(`revealed`)
- 전역: 날씨(원시 날씨는 `permanent` + 원인 포켓몬), 필드, 공간(트릭룸 등), 페어리록, 턴, 관찰한 선후공, 분석 대상 칸(`focus`)
- `executeTurn()`: 교체 → 기술(메가진화, 효과 자동 반영, 입력한 데미지) → 원시 날씨 원인 기절 체크 → 이번 턴 상태이상
  → 턴 종료 상태이상 데미지·특수상태 경과 → 날씨/필드/공간/벽 경과 → 입력 초기화. 실행 전 스냅샷(최대 30) 저장.

## 스타일

- 디자인 토큰과 공통 클래스는 `assets/css/main.css` (`.panel`, `.btn`, `.chip`, `.type-badge`, `--t-{type}` 타입 색, `--mine`/`--opp`)
- 다크 게임 UI 단일 테마 (Vuetify 테마 `champions`), 폰트 Rubik(숫자/제목) + Noto Sans KR/JP
