# Pokémon Champions Helper

포켓몬 챔피언스 랭크배틀을 위한 비공식 팬 도구 — 데미지 계산 · 선출 · 턴 관리 (한국어 / English / 日本語)

- **파티 관리**: 6마리의 특성·성격·도구·능력 포인트·기술, 실능치·HP 배수·내구·결정력
- **싱글/더블 선출**: 상대 6마리 입력, 양방향 데미지 표 (확정/난수 N타, 더블 광역기 0.75배)
- **배틀**: HP·랭크·상태이상·날씨·필드·설치기 관리, 스피드 비교와 역산, 행동 순서 예측, 배분 추정, 되돌리기

## 개발

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 계산 엔진 테스트 (@smogon/calc 대조)
npm run build:data   # 게임 데이터 재생성 (Showdown + PokeAPI)
```

구조와 데이터는 [CLAUDE.md](CLAUDE.md) 와 [docs/](docs/) 참고.

데이터: Pokémon Showdown (Champions mod), PokeAPI · 이미지: Pokémon Champions 인게임 스프라이트 (Bulbagarden Archives).
Pokémon 및 포켓몬 캐릭터 이름은 Nintendo · Creatures · GAME FREAK · The Pokémon Company 의 상표입니다.
