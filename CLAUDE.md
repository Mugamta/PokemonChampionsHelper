# CLAUDE.md

포켓몬 챔피언스(Pokémon Champions) 랭크배틀 보조 도구. 내 파티/상대 파티를 입력하면
실능치·결정력·데미지 매트릭스·확정/난수 N타·스피드 비교·턴 진행 시뮬레이션을 보여준다.
UI·데이터·주석은 전부 **한국어**이며, 포켓몬/기술/특성/도구는 **한글 이름을 키**로 쓴다.

상세 문서 (작업 전에 관련 문서를 먼저 읽을 것):
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 화면 흐름, 페이지별 역할, 전역 상태(composables), 데이터 로딩
- [docs/DATA.md](docs/DATA.md) — `public/` JSON, `data/*.ts` 형식, 스프라이트, 수집/다운로드 스크립트
- [docs/BATTLE_MECHANICS.md](docs/BATTLE_MECHANICS.md) — 실능치/결정력/데미지/N타 공식과 보정 규칙
- [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) — 없는 라우트, 레거시 파일, 미구현(자속·타입상성 등) 목록

## 스택 / 명령어

- Nuxt 4 + Vue 3 + Vuetify 4 (`vuetify-nuxt-module`, 기본 다크 테마), **`ssr: false` (SPA)**
- `srcDir` = 레포 루트 (`app/` 폴더 없음 — 만들면 Nuxt 4가 srcDir을 바꿔버리니 만들지 말 것). `@/` = 루트.
- `npm run dev` (localhost:3000), `npm run generate` / `npm run build`
- 린트: `npx eslint .` (스크립트 없음). 포맷: Prettier — 2칸, 세미콜론 없음, 작은따옴표, printWidth 100
- **테스트 없음.** 변경 확인은 dev 서버에서 화면으로 한다.
- 배포: `main` push → GitHub Actions(`.github/workflows/deploy.yml`) → GitHub Pages
  (`NUXT_APP_BASE_URL=/PokemonChampionsHelper/`)

## 반드시 지킬 규칙

1. **baseURL**: GitHub Pages 서브경로 배포라서 `public/` 파일을 `fetch`/`<img src>` 할 때
   절대경로(`/pokemon_list/...`)를 쓰면 배포본에서 깨진다. `usePublicAsset().asset(path)` 또는
   `useRuntimeConfig().app.baseURL` 접두사를 붙일 것.
2. **전역 상태는 `useState` 기반 composable**을 통해서만 공유한다 (`useParty`, `useOpponentParty`,
   `useMineOrderSelection(mode)`, `usePokemonList`, `useRegulations`). Pinia 없음.
   새 상태 키를 만들 때 기존 키와 겹치지 않게 접두사를 붙인다 (`party-`, `opponent-`, `pkmn-`, `reg-`).
3. **싱글/더블 분리**: 선출 상태는 `useMineOrderSelection('single')`(3마리) /
   `useMineOrderSelection('double')`(4마리)로 키가 분리돼 있다. 더블 화면에서 인자를 빠뜨리면
   기본값 `'single'`이 되어 싱글 상태를 오염시킨다.
4. **6슬롯 병렬 배열 구조**: 파티 데이터는 `selectedPokemon[i]`, `selectedTool[i]`, `selectedMoves[i][k]`,
   `inputStats[i]`, `calcStats[i]` … 처럼 인덱스로 맞물린 배열이다. 한 슬롯을 바꾸면 같은 인덱스의
   다른 배열도 함께 초기화/갱신해야 한다 (partySelect의 `selectedPokemon` watch 참고).
5. **메가진화**: `selectedPokemon`에는 항상 원래 종족명을 저장하고, 메가 여부는 도구가
   `MegaEvolutionMap[이름][].stoneName`과 일치하는지 + 토글로 판단한다. 메가 이름/종족값/특성은
   `data/mega-evolutions.ts`에서 가져온다.
6. **코드 스타일**: 기존 파일의 관용구를 따른다 — 한국어 주석, `// ── 섹션명 ─────` 구분선,
   Nuxt auto-import(`useState`, `computed`, `navigateTo` 등) 사용. 대형 페이지(`singleBattle.vue` ~3400줄,
   `*EntrySelect.vue` ~1400줄)는 통째로 읽지 말고 Grep으로 함수 위치를 찾아 부분만 읽는다.
7. **중복 코드 주의**: `singleEntrySelect.vue`와 `doubleEntrySelect.vue`는 거의 같은 코드(더블은 광역기
   75% 행만 추가)다. 공통 로직을 고칠 때는 양쪽 모두(필요하면 `partySelect.vue`, `singleBattle.vue`도) 반영한다.
8. 데이터 파일(`data/abilities.ts`, `data/item.ts`, `public/pokemon_list/*.json`)은 스크래퍼가 생성한 것이다.
   손으로 고쳐도 되지만 스크래퍼 재실행 시 덮어써진다는 점을 염두에 둔다.
9. 커밋은 사용자가 요청할 때만. 커밋 메시지는 한국어 짧은 문장이 관례 (예: `싱글더블수정`).
