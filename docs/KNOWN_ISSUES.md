# 알려진 이슈 / 정리 대상

2026-10 기준 코드 분석 결과. 고치면 이 문서에서 지울 것.

## 존재하지 않는 대상을 가리키는 참조

| 위치 | 내용 |
|---|---|
| `components/TitleBar.vue` `goToDoubleBattle` | `/doubleBattle` 페이지가 없음 (계획만 됨 — `useMineOrderSelection.js` 주석에도 `doubleBattle.vue` 언급) |
| `pages/index.vue` 등 `goMulti` | `/multi` 페이지 없음 |
| `package.json` `fix:move-sets` | `scripts/fix-movesets.mjs` 파일 없음 |
| `pages/index.vue` `goSingle` | "싱글배틀" 버튼이 파티 관리와 같은 `/partySelect`로 이동 |

## 레거시 / 미사용 파일

- `pages/entrySelect.vue` — `singleEntrySelect.vue`의 옛 사본. 라우트로 접근은 가능
- `pages/single.vue` — 초기 프로토타입 (Options API, baseURL 없이 fetch)
- `pages/about.vue`, `help.vue`, `contact.vue` — 메뉴 버튼만 있는 플레이스홀더. 셋 다 배경 이미지를 `/pokemon.webp` 절대경로로 써서 배포본에서 안 보임
- `main.js` — Vite 기본 진입점 잔재 (`App.vue` 없음, Nuxt가 사용 안 함)
- `src/data/items.ts` — `data/item.ts` 중복본, import 없음
- `test.js` — 1회성 데이터 정리 스크립트
- `assets/css/` — 빈 폴더
- `README.md` — Nuxt 스타터 기본 문구 그대로

## 계산 한계

- `pokemon_list/*.json`에 **타입이 없어서** 자속 보정이 무조건 1.5배(`stab = true`, "자속보정 수정필" 주석), 타입 상성 미반영
- 레귤레이션의 폼 코드(`0026-001`)를 무시하고 도감번호만 매칭 → 리전폼/폼 구분 불가
- 메가진화는 도구가 해당 메가스톤일 때만 인식. 스톤 slug가 없는 신규 메가는 기본 이미지로 대체
- singleBattle은 `ABILITY_DESCRIPTIONS`라는 자체 특성 설명 맵을 쓰고, 다른 페이지는 `data/abilities.ts`를 씀

## 데이터 확인 필요 (M-C 반영 시 발생)

- `data/moves.ts`에 `// PP 추정` 주석이 붙은 12개 기술(베어가르기, 스타어설트 등)은 챔피언스 PP를 확인하지 못해
  추정값을 넣었다. 기존 기술 기준 경향: 구세대 기술은 본가 PP 10→12, 15→16, 5→8로 오르고 8·9세대 기술은 그대로
- Showdown `champions` 모드와 기존 op.gg 기반 `moves.ts`의 위력이 다른 기술 12개 (moves.ts 쪽 값을 유지 중):
  그림자꿰매기 80/90, 나이트버스트 85/90, 만나자마자 90/100, 백귀야행 60/65, 본러시 25/30, 부리캐논 100/120,
  불꽃채찍 80/90, 빙산바람 100/120, 사과산 80/90, 트로피컬킥 70/85, G의힘 80/90 (moves.ts/Showdown)
- 신규 23종의 습득 기술은 Showdown `data/mods/champions/learnsets.ts` 기준 (op.gg가 자동 수집을 차단해서 대체)
- M-C의 Vivillon/Floette/Meowstic♀ 폼 코드는 M-B 값을 그대로 유지. 신규 폼 코드(페르시온 알로라 0053-001 등)는
  Showdown `otherFormes` 순서로 부여한 것이라 공식 코드와 다를 수 있음 (앱은 도감번호만 사용하므로 동작 영향 없음)

## 코드 중복

- `singleEntrySelect.vue` ↔ `doubleEntrySelect.vue` ↔ `entrySelect.vue`: 1400줄대 거의 동일
- 메가 판정/실능치 재계산/스프라이트 경로 함수가 partySelect, 두 EntrySelect, singleBattle에 각각 구현돼 있음
- partySelect에 `natureLabel`/`natureOptions`가 `utils/nature-label.js`와 별도로 정의돼 있음
- `useParty`와 `useOpponentParty`의 상태 구조가 같은데 따로 정의됨

## 환경

- Windows 작업 환경: git이 LF→CRLF 경고를 낸다. 파일 줄바꿈이 섞여 있으니 편집 시 기존 형식을 유지
- 커밋 메시지가 `수정N` 형태라 히스토리로 변경 의도를 알기 어렵다 — 맥락은 코드 주석에서 찾을 것
