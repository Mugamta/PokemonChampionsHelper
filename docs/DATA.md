# 데이터

모든 게임 데이터의 키는 **한글 이름**이다 (포켓몬명, 기술명, 특성명, 도구명). 띄어쓰기 없는 표기 (`10만볼트`, `구애스카프`).

## public/ (런타임 fetch, baseURL 접두사 필수)

### `public/pokemon_list/{도감번호}.json` (1~1023, 1023개)

```json
{ "id": 1, "name": "이상해씨",
  "stats": { "H": 45, "A": 49, "B": 49, "C": 65, "D": 65, "S": 45 },
  "abilities": ["심록", "엽록소"],
  "moves": ["칼바람", "칼춤", ...] }
```
- **타입(type) 필드가 없다.** 그래서 자속 보정·타입 상성 계산이 불가능한 상태 (KNOWN_ISSUES 참고)
- 폼(리전폼 등)은 구분되지 않음 — 도감번호당 파일 1개
- `moves`는 `scripts/scrape-op-gg-moves.mjs`가 op.gg 기준으로 덮어씀
- 스탯 키: H(HP) A(공격) B(방어) C(특공) D(특방) S(스피드) — 프로젝트 전역 공통

### `public/regulation/`

- `index.json`: 파일명 배열 (`["M-A.json", "M-B.json"]`). 정적 호스팅이라 폴더 목록을 못 읽으므로 **새 레귤레이션을 추가하면 여기에도 등록**해야 한다
- `M-A.json` 등:
  ```json
  { "period": "2026/04/08 00:00 ~ 2026/06/17 10:59",
    "rules": "Mega Evolution",
    "pokemon_list": ["0003-000", "0006-000", "0026-001", ...] }
  ```
  `"도감번호4자리-폼3자리"` 형식이지만 앱은 **도감번호만** 사용한다 (`parseInt(code.split('-')[0])`).
  `period`는 로컬 시간으로 파싱된다.

### 이미지

| 경로 | 파일명 | 출처 스크립트 |
|---|---|---|
| `public/pokemon_sprites/{id}.png` | 도감번호. 메가는 PokeAPI id(10033 등) | `download:sprites`, `download:mega-sprites` |
| `public/item_sprites/{한글도구명}.png` | 한글 파일명 → 참조 시 `encodeURIComponent` | `download:item-sprites` (매핑: `data/item-sprites.ts`) |
| `public/mega_stone_sprites/{slug}.png` | 영문 slug (`charizardite-x`) | `download:mega-stones` |
| `public/pokemon.webp` | 기본/대체 이미지, 메인 배경 | — |

스프라이트가 없으면 `pokemon.webp`로 대체하는 패턴이 쓰인다.

## data/ (TS 모듈, 번들 포함)

| 파일 | export | 형식 / 비고 |
|---|---|---|
| `moves.ts` | `moves`, `MoveEffect`, `StatKey` 등 | `{ [기술명]: { Type, Category('물리'/'특수'/'변화'), Power?, Accuracy?, PP, Priority?, Target, Effect?, effects? } }`. `effects`는 구조화된 부가효과 (`rank`/`status`/`multiHit`/`recoil`/`heal`/`drain`/`field`/`special`/`unmatched`) — singleBattle이 랭크·필드 자동 적용에 사용 |
| `abilities.ts` | `abilities` | `{ [특성명]: 설명 }`. op.gg 스크래핑 결과 |
| `item.ts` | `items` | 도구명 배열 (지닌 아이템 + 열매). op.gg 스크래핑 결과. 메가스톤은 여기 없고 `mega-evolutions.ts`의 `stoneName`이 도구 목록에 동적으로 추가됨 |
| `item-sprites.ts` | `ItemSpriteSlug` | 한글 도구명 → PokeAPI 영문 slug. `scripts/download-item-sprites.js` 안에 **같은 매핑이 복사돼 있으므로 둘 다 수정** |
| `mega-evolutions.ts` | `MegaEvolutionMap`, `MegaEvolutionData` | `{ [원래 종족명]: [{ megaName, id, ability, stoneName, stone, stats }] }`. 키는 pokemon_list의 `name`과 정확히 일치해야 함. 폼이 둘이면 배열에 여러 개 (리자몽 X/Y) |
| `nature.ts` | `Nature`, `NatureMap`, `NatureName` | 25개 성격, `{ up, down }` 스탯 키. 무보정 성격은 `{}` |

`src/data/items.ts`는 `data/item.ts`의 사본(줄바꿈만 다름)이고 아무 데서도 import하지 않는다.

## utils/

| 파일 | 내용 |
|---|---|
| `stat.ts` | `calculateStat(statKey, base, statPoints, nature, item, status)` — 실능치 |
| `move.ts` | `calculateBaseDamage`(결정력), `calculateDamage`(min/max/crit), `calculateDamageRolls`(16난수), `calculateKoInfo`/`formatKoLabel`(N타 확률), `calculateStatusDamage` |
| `move-info.js` | `getMoveData(name)`, `formatMoveInfo(name)` → `"위력 80/100%/불꽃/물리/PP 15"` |
| `nature-label.js` | `natureOptions`(무보정 + 보정 성격 20개), `natureLabel(name)` 전각 공백 정렬 라벨 |

공식은 [BATTLE_MECHANICS.md](BATTLE_MECHANICS.md) 참고.

## scripts/ (수동 실행, 빌드와 무관)

| 스크립트 | npm 명령 | 하는 일 |
|---|---|---|
| `download-sprites.js` | `download:sprites` | PokeAPI 포켓몬 스프라이트 → `public/pokemon_sprites/` (있는 파일은 건너뜀) |
| `download-mega-sprites.mjs` | `download:mega-sprites` | `mega-evolutions.ts`의 id를 정규식으로 추출해 다운로드 |
| `download-mega-stones.mjs` | `download:mega-stones` | `mega-evolutions.ts`의 stone slug → `public/mega_stone_sprites/` |
| `download-item-sprites.js` | `download:item-sprites` | 내부에 복사된 slug 매핑으로 `public/item_sprites/{한글}.png` |
| `scrape-op-gg-moves.mjs` | — | Playwright로 op.gg 기술별 습득 포켓몬 크롤링 → `pokemon_list/*.json`의 `moves` 덮어씀 |
| `scrape-op-gg-items.mjs` | — | op.gg → `data/item.ts` 재생성 |
| `scrape-op-gg-abilities.mjs` | — | op.gg → `data/abilities.ts` 재생성 |
| `download_pokemon.js`, `find_japanese.js`, `map_japanese.js` | — | 초기 데이터 구축용 (일본어 이름 정리 등). 루트 `test.js`도 같은 계열 |

스크래퍼는 실패 시 `scripts/.debug/`에 스크린샷/HTML을 덤프한다. `package.json`의 `fix:move-sets`는
존재하지 않는 `scripts/fix-movesets.mjs`를 가리킨다.

## 새 데이터 추가 체크리스트

- **새 레귤레이션**: `public/regulation/X.json` 추가 + `index.json`에 파일명 등록
- **새 메가진화**: `mega-evolutions.ts`에 항목 추가 → `npm run download:mega-sprites` / `download:mega-stones` → 이미지 커밋
- **새 도구 스프라이트**: `data/item-sprites.ts`와 `scripts/download-item-sprites.js` 양쪽 매핑 추가 → 스크립트 실행
- **도구 효과를 계산에 반영**: `utils/stat.ts`(능력치 배율) 또는 `utils/move.ts`(위력 배율)에 분기 추가
