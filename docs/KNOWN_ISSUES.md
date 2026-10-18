# 알려진 이슈 / 확인 필요

2026-10-18 재설계 시점 기준. 해결하면 이 문서에서 지울 것.

## 데이터 검증 현황 (2026-10-18, `node scripts/verify-data.mjs --dex`)

- 공식 공지와 일치: M-C 신규 24종·메가 6종, Ver.1.2.0 밸런스 변경(왕구리 막치기·브리두라스 미러코트/메탈버스트 삭제,
  베어가르기 추가, 희망사항·힘흡수 PP 12→8), Ver.1.2.2 는 버그 수정만, 레귤레이션 기간(KST 11:00 시작 / 10:59 종료)
- Serebii 와 전부 일치: 로스터 346폼, 타입, 종족값, 습득 기술(폼·성별별), 공식 한국어 이름, 기술 512개 타입·분류·위력·PP·명중,
  도구 166개, 메가 특성
- 예외 1건: 전광쌍격 명중 — Serebii 는 필중 표기, 게임위드·Showdown 은 100 → 100 유지
- 검증 과정에서 고친 것: 기술 PP 208건(예전 op.gg 값이 본가 수치 그대로였음), 메가냐오닉스 누락, 레귤레이션 시작 시각/시간대
- 레귤레이션 폼 코드: 공식 폼 번호와 Showdown `otherFormes` 순서가 다른 경우 `CODE_OVERRIDES` 로 고정 (비비용/플라엣테/냐오닉스♀).
  M-C 신규 폼(페르시온 알로라 0053-001 등)은 이 규칙으로 부여한 것이라 공식 코드와 다를 수 있음 (앱 동작에는 영향 없음)

## 계산에 반영 안 된 것

- 배틀 중에만 바뀌는 폼은 데이터에 없다: 팔라피 마이티폼(교체 후 공격 160), 킬가르도 블레이드폼 등.
  특히 팔라피는 실전에서 거의 마이티폼으로 싸우므로 현재 계산은 노멀폼 기준이라는 점에 주의
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
