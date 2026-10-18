# 알려진 이슈 / 확인 필요

2026-10-18 재설계 시점 기준. 해결하면 이 문서에서 지울 것.

## 데이터 확인 필요

- **PP 추정 12개**: 베어가르기, 노려맞히기, 스타어설트, 드럼어택, 코트체인지, 화염볼, 오버드라이브, 기어체인지, 문어굳히기,
  찌리리따끔따끔, 물고버티기, 대검돌격 — 챔피언스 PP 를 확인하지 못해 `scripts/sources/champions-pp.json` 에 `estimated` 로 표시.
  화면에는 PP 옆 `*`. 기존 기술 경향: 구세대 기술은 본가 PP 10→12, 15→16, 5→8 로 상향, 8·9세대 기술은 그대로.
- **위력이 예전(op.gg) 데이터와 다른 기술 12개** — 지금은 Showdown 챔피언스 모드 값을 쓴다:
  그림자꿰매기 90(예전 80), 나이트버스트 90(85), 만나자마자 100(90), 백귀야행 65(60), 본러시 30(25), 부리캐논 120(100),
  불꽃채찍 90(80), 빙산바람 120(100), 사과산 90(80), 트로피컬킥 85(70), G의힘 90(80)
- 레귤레이션 폼 코드: 공식 폼 번호와 Showdown `otherFormes` 순서가 다른 경우 `CODE_OVERRIDES` 로 고정 (비비용/플라엣테/냐오닉스♀).
  M-C 신규 폼(페르시온 알로라 0053-001 등)은 이 규칙으로 부여한 것이라 공식 코드와 다를 수 있음.

## 계산에 반영 안 된 것

- 특성/도구 중 위 BATTLE_MECHANICS 에 없는 것 (예: 하드록 외 일부 방어 특성, 약점보험 발동 후 랭크, 기합의띠 등 생존 효과)
- 더블: 도우미·프렌드가드·아군 특성, 위협 자동 적용 없음 (랭크는 직접 조절). ①②③ 분석은 선택한 1:1 조합(focus) 기준
- 배틀 화면의 "이번 턴 생긴 상태이상"은 각 진영의 분석 대상(focus) 포켓몬에게 적용

## 환경

- ESLint 설정(`eslint.config.js`)이 TS/`<script lang="ts">` 를 파싱하지 못한다 (typescript-eslint 미설정). 새 코드는 lint 미검사.
- `nuxt build` 시 Vuetify 4 CSS `@layer` 관련 esbuild 경고 3건 — Vuetify 쪽 문제, 동작 영향 없음.
- npm 10.9 에서 vitest 설치 시 peer 해석 버그(`edgesOut`)가 있어 `--legacy-peer-deps` 로 설치했다. 일반 `npm install`/`npm ci` 는 정상.
- Windows Git Bash 에서 `NUXT_APP_BASE_URL=/PokemonChampionsHelper/` 로 빌드할 때 `MSYS_NO_PATHCONV=1` 필요.
- 예전 URL(`/partySelect`, `/singleEntrySelect`, `/doubleEntrySelect`, `/singleBattle`)은 없어졌다 → `/party`, `/single`, `/double`, `/single/battle`.
- 예전 버전에서 저장한 내 파티(localStorage `pokemon-champions-my-party`)는 첫 로드 시 새 형식으로 이전되고 예전 키는 삭제된다.
