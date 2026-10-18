# 아키텍처

## 디렉터리

```
components/TitleBar.vue      헤더: 시계, 레귤레이션 선택, 로딩 진행률, 화면 이동 버튼(진입 조건 검사)
layouts/default.vue          TitleBar + <slot> + 푸터(저작권 고지)
pages/                       파일 기반 라우팅 (아래 표)
composables/                 useState 기반 전역 상태 / 데이터 로더
utils/                       순수 계산 함수 (실능치, 데미지, N타, 기술 정보 포맷, 성격 라벨)
data/                        정적 게임 데이터 (TS 모듈로 번들에 포함)
public/                      런타임 fetch 데이터(JSON) + 스프라이트 이미지
scripts/                     데이터 수집/스프라이트 다운로드용 1회성 Node 스크립트 (빌드와 무관)
```

## 화면 흐름

```
index ──▶ partySelect ──┬──▶ singleEntrySelect ──▶ singleBattle
 (메인)   (내 파티 6마리)  │     (상대 6마리 입력 + 내 3마리 선출, 데미지 매트릭스)
                         └──▶ doubleEntrySelect ──▶ doubleBattle  ※ 페이지 미구현
                               (상대 6마리 입력 + 내 4마리 선출, 광역기 75% 행 추가)
```

화면 간 이동 버튼은 대부분 **TitleBar**에 있고, `route.path`로 노출 여부를 정한다.
- 선출 화면으로 가려면 `useParty().isPartyComplete` (6마리 모두 선택 + 각자 기술 1개 이상)
- 배틀 화면으로 가려면 상대 6마리 모두 입력 + 내 선출 3마리(싱글)/4마리(더블)

| 페이지 | 상태 | 역할 |
|---|---|---|
| `index.vue` | 사용 중 | 메인 메뉴. "멀티배틀" 버튼은 없는 `/multi`로 감 |
| `partySelect.vue` | 사용 중 | 내 파티 편집. 포켓몬/특성/성격/도구/기술/능력포인트 입력 → 실능치·결정력·내구·HP 배수 표시. 슬롯별 날씨/필드/상태이상 토글. **Options API 형태(`export default { setup() }`)** — 다른 페이지는 `<script setup>` |
| `singleEntrySelect.vue` | 사용 중 | 상대 파티 입력 + 내 3마리 선출 순서 지정 + 내→상대 / 상대→내 데미지 매트릭스, 날씨/필드/치명타 토글 |
| `doubleEntrySelect.vue` | 사용 중(작업 중) | 위와 동일 + 4마리 선출, 광역기(`Target`이 `'모든 상대'`/`'다른 모든 포켓몬'`)는 `(광역기)` 75% / `(1:1)` 100% 두 행 |
| `singleBattle.vue` | 사용 중 | 턴 단위 배틀 시뮬레이터 (아래 참고) |
| `entrySelect.vue` | 레거시 | `singleEntrySelect.vue`의 이전 사본 (주석/인자 1줄 차이) |
| `single.vue` | 레거시 | 초기 프로토타입. baseURL 미적용, 1025개 동시 fetch |
| `about.vue`, `help.vue`, `contact.vue` | 플레이스홀더 | index와 같은 메뉴 버튼만 있음 |

### singleBattle.vue 주요 기능 (Grep 키워드)

`<script setup>`은 1322행부터, 스타일은 3112행부터. 섹션 구분선 `// ── … ──` 로 찾으면 된다.
- 활성/벤치 포켓몬 선택: `selectMine`, `selectOpp`, `activeMineIndex`, `revealedOppIndices`
- HP: 내 쪽은 실제 수치 `mineCurrentHp`, 상대는 퍼센트 `oppHpPercent`
- 상태이상/특수상태 + 턴 카운트: `STATUS_CONDITIONS`, `SPECIAL_CONDITION_DURATIONS`, `applyEndOfTurnStatusDamage`
- 날씨 자동 발동(특성/기술/원시·메가레쿠쟈): `setWeather`, `WEATHER_ABILITY_MAP`, `WEATHER_MOVE_MAP`, `PRIMAL_WEATHER_MAP`
- 필드·룸·해저드·스크린: `battleField`, `activeRooms`, `mineHazards`, `mineScreens`
- 랭크: `mineRanks`, `rankMultiplier` (기술의 `effects`로 자동 적용 — `applyMoveEffectsForMove`)
- 스피드 비교 / 선후공 관찰로 상대 스피드 역산: `speedRows`, `inferredOppSpeedBound`
- 데미지 셀/연속기/접촉 반격 자멸 위험: `buildCell`, `getMoveHitInfo`, `mineMultiHitRisk`
- 턴 진행 / 되돌리기(최대 30턴 스냅샷): `executeTurn`, `captureBattleSnapshot`, `undoLastTurn`
- 행동 순서 예측 / 시나리오: `turnOrderForecast`, `turnOrderScenarioFlows`

배틀 화면 내부 상태(HP, 랭크, 날씨 등)는 페이지 로컬 `ref`/`reactive`라서 화면을 떠나면 사라진다.

## 전역 상태 (composables)

모두 Nuxt `useState`라서 어느 컴포넌트에서 호출해도 같은 인스턴스를 공유한다.

| composable | useState 키 | 내용 |
|---|---|---|
| `useParty()` | `party-*` | 내 파티 6슬롯: `selectedPokemon/Ability/Nature/Tool/Moves`, `inputStats`(능력 포인트), `calcStats`(실능치). **localStorage(`pokemon-champions-my-party`)에 자동 저장/복원** (모듈 전역 `hydrated` 플래그로 1회만). `isPartyComplete`, `resetParty()` |
| `useOpponentParty()` | `opponent-*` | 상대 파티 6슬롯, 구조는 useParty와 동일. 저장 안 됨 |
| `useMineOrderSelection(mode)` | `mineOrderSelectionSingle` / `…Double` | 선출한 내 파티 인덱스 배열(순서 = 선출 순서). 최대 3/4. `toggleMineSelect`, `getMineOrder` |
| `usePokemonList()` | `pkmn-*` | `public/pokemon_list/{id}.json` 로드 (동시성 20 제한, 1회만). `pokemons` 배열 + 이름→데이터 `pokemonMap` |
| `useRegulations()` | `reg-*` | `public/regulation/index.json` → 각 레귤레이션 로드. 현재 시각으로 자동 선택 또는 수동 선택. 1초 시계 `currentTime`. `allowedDexIds` = 모든 레귤레이션 도감번호 합집합 |
| `useEligiblePokemon()` | (조합) | 위 두 개를 합쳐 활성 레귤레이션에 속한 포켓몬만 `pokemonNames`로 제공 |
| `usePublicAsset()` | — | `asset(path)` → baseURL 붙인 public 경로 |

### 데이터 로딩 순서

`TitleBar`의 `onMounted`가 담당한다 (모든 페이지가 default 레이아웃을 쓰므로 앱 시작 시 1회):
1. `startClock()`
2. `loadRegulations()` — index.json → 각 파일
3. `loadPokemonList(allowedDexIds)` — 레귤레이션에 등장하는 도감번호만 fetch

레귤레이션이 바뀌어 `pokemonNames`가 달라지면 partySelect가 목록에 없는 선택을 해제한다.

## 페이지 공통 패턴

- 슬롯 함수는 인덱스를 받는다: `mineDisplayStats(i)`, `oppDisplayName(i)`, `getMineToOppCell(mIdx, oIdx, moveIdx, crit)` 등
- `mine*` = 내 파티, `opp*` = 상대 파티 접두사
- 성격 값에 `"고집(공격↑ …)"` 같은 라벨이 섞여 들어올 수 있어서 계산 전에 `.replace(/\([^)]*\)/g, '')`로 괄호를 제거한다
- 같은 파티 안에서 포켓몬/도구 중복 선택은 옵션 목록에서 걸러서 막는다 (`availablePokemonNames`, `toolOptions`)
- 스타일은 대부분 인라인 `style` + 페이지별 `<style scoped>`. 전역 CSS 파일 없음(`assets/css/` 비어 있음)
