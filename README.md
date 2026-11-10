# Pokémon Champions Helper

포켓몬 챔피언스 랭크배틀을 위한 비공식 팬 도구 — 데미지 계산 · 선출 · 턴 관리 · 추천 플레이 (한국어 / English / 日本語)

**사이트: https://mugamta.github.io/PokemonChampionsHelper/**

설치 없이 브라우저에서 바로 쓸 수 있고, 파티와 진행 중인 배틀은 브라우저(localStorage)에 저장됩니다.

## 기능

| 화면 | 내용 |
|---|---|
| **파티 관리** | 6마리의 특성·성격·도구·능력 포인트·기술 입력, 실능치·HP 배수·내구·결정력 미리보기, 사용률 통계로 빈 슬롯 채우기 |
| **싱글 / 더블 선출** | 상대 6마리 입력, 양방향 데미지 표(확정/난수 N타, 더블 광역기 0.75배), 선출·조합 추천 |
| **싱글 / 더블 배틀** | HP·랭크·상태이상·날씨·필드·설치기 관리, 우선도·트릭룸을 반영한 행동 순서 예측, 선후공으로 상대 스피드 구간(스카프·성격) 좁히기, 주고받은 데미지로 상대 내구·공격 배분 추정, PP 추적, 되돌리기 |
| **추천 플레이** | 내 기술·교체 × 상대 기술·교체 이득표로 기대값 / 안전 추천, 선출 추천·끝판 계산·추천 기록 |
| **VS 계산기** | 두 포켓몬을 양쪽에 두고 비교하는 1:1 데미지 계산기 |
| **포켓몬 성능표** | 출전 가능한 모든 포켓몬의 내구, 타입별 결정력, 스피드 순위(스카프·순풍·특성 포함) |
| **포켓몬 도감** | 포켓몬·기술 정보, 싱글/더블 사용률 통계(기술·도구·특성·함께 쓴 포켓몬) |
| **도움말** | 사용 방법, 인게임 규칙(능력치·타입 상성표·상태이상·날씨·필드·급소·랭크·행동 순서·데미지 공식) |
| **패치 내역** | 레귤레이션별 추가·변경된 포켓몬·기술·도구 |

- 데미지 계산은 9세대 공식(4096 반올림)을 따르며 `@smogon/calc` 결과와 대조하는 테스트로 검증합니다.
- 특성·도구·메가진화·배틀 폼(킬가르도·팔라피 등)·날씨/필드 자동 적용 등 반영 범위는 [docs/BATTLE_MECHANICS.md](docs/BATTLE_MECHANICS.md) 참고.
- 낮 / 밤 / 시스템 테마, 휴대폰 화면과 FHD 한 화면 배치를 지원합니다.

## 개발

Nuxt 4 + Vue 3 + Vuetify 4 + @nuxtjs/i18n, SPA(`ssr: false`), TypeScript.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 계산 엔진(@smogon/calc 대조) + 배틀 진행 테스트
npm run lint         # ESLint (TS / Vue)
npm run format       # Prettier 로 서식 정리
npm run typecheck    # vue-tsc
npm run build:data   # 게임 데이터 재생성 (Showdown + PokeAPI)
```

`main` 브랜치에 push 하면 GitHub Actions 가 테스트 후 GitHub Pages 로 배포합니다.

| 문서 | 내용 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 작업 규칙 요약 (영어 id 키, i18n, 코드 스타일) |
| [docs/STATUS.md](docs/STATUS.md) | 작업 현황 / 남은 것 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 화면·컴포저블·컴포넌트 구조, 상태 저장 |
| [docs/DATA.md](docs/DATA.md) | 게임 데이터 형식과 생성 파이프라인, 레귤레이션 추가 방법 |
| [docs/BATTLE_MECHANICS.md](docs/BATTLE_MECHANICS.md) | 실능치·데미지 공식, 반영된 특성·도구 |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | 확인 필요한 데이터, 미반영 효과 |

## 출처

- 데이터: Pokémon Showdown (Champions mod), PokeAPI
- 이미지: Pokémon Champions 인게임 스프라이트 (Bulbagarden Archives)

Pokémon 및 포켓몬 캐릭터 이름은 Nintendo · Creatures · GAME FREAK · The Pokémon Company 의 상표입니다.
이 사이트는 비공식 팬 도구이며 위 회사들과 관련이 없습니다.
