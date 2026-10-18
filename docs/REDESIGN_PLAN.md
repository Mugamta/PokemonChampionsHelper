# 재설계 계획 (2026-10 시작, 브랜치 `redesign`)

사용자 결정 사항 (2026-10-18):
- 디자인: **게임 UI 스타일** — 포챔스 화면 느낌, 타입 색상, 카드형 포켓몬 슬롯, 진한 배경 + 강조색
- 언어: **한/영/일 지원**, 데이터 키는 전부 **영어**로 통일
- 이미지: **포챔스 공식 메뉴 스프라이트** (Bulbagarden Archives `Category:Champions menu sprites`, 아이템은 `Champions Bag sprites`)
- 진행: **단계별 + 단계마다 커밋** (main에 push하면 배포되므로 `redesign` 브랜치에서 작업, push는 사용자 요청 시에만)
- 정리 범위: 레거시 삭제, 더블배틀 화면 신규, 도움말/소개 페이지 채우기, 중복 코드 공통화

## 단계

| # | 내용 | 상태 |
|---|---|---|
| 1 | 레귤레이션 M-C 반영 (기존 구조) | 완료 `5ca171c` |
| 2 | 데이터 파이프라인: Showdown + PokeAPI → 영어 키 데이터 + 3개 언어 이름 (`npm run build:data`) | 완료 |
| 3 | i18n 기반 (UI 문자열 ko/en/ja) + 게임 데이터 로더 composable | |
| 4 | 계산 로직(utils) 영어 키로 이식 + 단위 테스트, 타입 상성/자속 실제 반영 | |
| 5 | 공통 컴포넌트 + 게임 UI 디자인으로 페이지 재작성 (파티/선출/배틀 싱글·더블, 메인/도움말/소개) | |
| 6 | 레거시 삭제, 문서 갱신 | |

## 데이터 소스 (2단계)

| 소스 | 쓰는 것 |
|---|---|
| Showdown `data/mods/champions/*` + `data/*` (smogon/pokemon-showdown) | 출전 가능 포켓몬/폼/메가, 타입, 종족값, 특성, **습득 기술**, 기술 위력/명중/타입/분류/대상/플래그, 도구 |
| PokeAPI CSV (PokeAPI/pokeapi `data/v2/csv`) | 포켓몬/폼/기술/특성/도구/타입/성격의 **ko·ja·en 이름** |
| 기존 `data/moves.ts` (op.gg 기반) | 챔피언스 **PP**, 한국어 효과 텍스트, 구조화된 `effects` |
| 기존 `data/abilities.ts` | 한국어 특성 설명 |
| Bulbagarden Archives | 메뉴 스프라이트 `Menu Champs {도감4자리}[-{폼}].png`, 아이템 `Bag {영문명} Champs Sprite.png` |

op.gg는 자동 수집(헤드리스 브라우저)을 CloudFront 403으로 차단함 → 기존 op.gg 스크래퍼는 더 이상 쓰지 않는다.

## 키 규칙

- 포켓몬/기술/특성/도구/성격 id = Showdown id (소문자 영숫자: `garchompmegaz`, `thunderbolt`, `choicescarf`, `adamant`)
- 타입 `fire`, 분류 `physical|special|status`, 스탯 `hp atk def spa spd spe`
- 상태이상 `brn par psn tox slp frz`, 날씨 `sun rain sand snow harshsun heavyrain strongwinds`,
  필드 `electric grassy misty psychic`
- 화면 표시 이름은 항상 `names.{locale}.json`에서 id로 조회
