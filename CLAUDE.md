# CLAUDE.md

포켓몬 챔피언스(Pokémon Champions) 랭크배틀 보조 도구. 내 파티/상대 파티를 입력하면 실능치·결정력·데미지 표·
확정/난수 N타·스피드 비교·턴 진행 시뮬레이션(싱글/더블)을 보여준다. **화면은 한/영/일 3개 언어**, 데이터 키는 **전부 영어 id**.

**이어서 작업할 때는 [docs/STATUS.md](docs/STATUS.md) 부터 읽을 것** — 한 것 / 남은 것 / 판단이 필요한 것, 현재 브랜치 상태.

상세 문서 (작업 전에 관련 문서를 먼저 읽을 것):
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 화면/라우트, composable, 컴포넌트 구조, 상태 저장
- [docs/DATA.md](docs/DATA.md) — `public/data/*.json` 형식, `scripts/build-data.mjs` 파이프라인, 스프라이트, 레귤레이션 추가 방법
- [docs/BATTLE_MECHANICS.md](docs/BATTLE_MECHANICS.md) — 실능치/데미지 공식, 반영된 특성·도구 목록, 테스트 방법
- [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) — 확인 필요한 데이터, 미반영 효과, 환경 주의사항

## 스택 / 명령어

- Nuxt 4 + Vue 3 + Vuetify 4 + @nuxtjs/i18n, **`ssr: false` (SPA)**, TypeScript(새 코드)
- `srcDir` = 레포 루트 (`app/` 폴더를 만들지 말 것). `~/` = 루트.
- `npm run dev` (localhost:3000) / `npm test` (vitest, 데미지 계산을 @smogon/calc 와 대조) / `npm run build:data`
- 배포: `main` push → GitHub Actions(`npm install` → `npm test` → `nuxt build --preset github_pages`, base `/PokemonChampionsHelper/`)
- Windows Git Bash 에서 base URL 로 빌드할 때는 `MSYS_NO_PATHCONV=1` 필수 (안 하면 경로가 변환돼 모든 HTML 이 "Redirecting..." 이 됨)

## 반드시 지킬 규칙

1. **키는 영어 id** (Showdown id: `garchompmegaz`, `thunderbolt`, `choicescarf`, `adamant`, 타입 `fire`, 스탯 `hp atk def spa spd spe`).
   화면 표시 이름은 `useGameData().name(kind, id)`, 설명은 `.text(kind, id)`. 한글 문자열 비교로 로직을 짜지 말 것.
2. **화면 문구는 i18n**: `i18n/locales/{ko,en,ja}.json` 세 파일에 **같은 키를 모두** 추가. 컴포넌트에서 하드코딩 금지.
3. **public 경로**: `usePublicAsset().asset(path)` 또는 `useGameData()` 의 sprite 헬퍼로 baseURL 을 붙인다 (서브경로 배포).
4. **게임 데이터는 직접 고치지 말고** `scripts/sources/` 를 고친 뒤 `npm run build:data` 로 재생성 (`public/data/*.json` 은 생성물).
5. **계산 로직은 `utils/`(순수 TS)** 에 두고 `tests/` 에 테스트 추가. 데미지 공식을 바꾸면 `npm test` 로 @smogon/calc 대조가 통과해야 한다.
6. **composable 자동 import 함정**: 같은 모듈에서 `import type { X }` 만 하면 그 모듈의 함수 자동 import 가 빠질 수 있다.
   타입을 import 하는 파일에서는 함수도 명시적으로 import (`import { useEntry, type BattleMode } from '~/composables/useEntry'`).
7. 메가진화: 슬롯의 `species` 는 항상 원종 id. 메가 폼은 `useGameData().megaFor(species, item)` (도구가 메가스톤일 때)로 결정.
8. 코드 스타일: Prettier (2칸, 세미콜론 없음, 작은따옴표, printWidth 100), 한국어 주석, `// ── 섹션 ─────` 구분선.
9. 커밋은 사용자가 요청할 때만. 메시지는 한국어. `main` push = 배포이므로 push 도 요청 시에만.
