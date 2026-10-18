# 데이터

`public/data/` 와 `public/sprites/` 는 **생성물**이다. 직접 고치지 말고 `scripts/sources/` 를 고친 뒤 재생성한다.

```bash
npm run build:data            # 데이터만 (소스는 scripts/.cache 에 캐시)
npm run build:data:sprites    # + 스프라이트 다운로드 (이미 있는 파일은 건너뜀)
node scripts/build-data.mjs --refresh   # 캐시 무시하고 소스 다시 받기 (Showdown/PokeAPI 업데이트 반영)
```

## 소스

| 소스 | 쓰는 것 |
|---|---|
| Pokémon Showdown `data/mods/champions/*` + `data/*` | 출전 가능 폼/메가, 타입, 종족값, 특성, **습득 기술**, 기술 위력·명중·분류·대상·플래그·부가효과, 합법 도구, 성격, 타입 상성 |
| PokeAPI CSV (`data/v2/csv`) | 포켓몬/폼/기술/특성/도구/타입/성격의 ko·ja·en 이름, 기술/특성/도구 설명 |
| `scripts/sources/champions-pp.json` | **챔피언스 PP** (Showdown 은 반영 안 함). `{ id: pp }` 또는 `{ id: { pp, estimated: true } }` |
| `scripts/sources/item-names-ko.json` | PokeAPI 에 한국어 이름이 없는 도구 (챔피언스 신규 메가스톤 등) |
| `scripts/sources/regulation/*.json` | 레귤레이션 기간과 출전 가능 도감코드 목록 (`index.json` 에 파일명 등록) |
| Bulbagarden Archives | 스프라이트: `Category:Champions menu sprites`, `Category:Champions Bag sprites` |

op.gg 는 자동 수집을 차단(CloudFront 403)하므로 쓰지 않는다.

## 생성물 형식 (`public/data/`)

| 파일 | 형식 |
|---|---|
| `pokemon.json` | `{ id: { id, num, base, forme, types, stats{hp..spe}, abilities[], weight, learnset[] \| mega{from,item}, megas[]? } }` — 메가는 learnset 없음(원종 것 사용) |
| `moves.json` | `{ id: { id, num, type, category, power, accuracy\|null, pp, ppEstimated?, priority, target, flags[], effects[] } }` — effects 는 `utils/types.ts MoveEffect` |
| `items.json` | `{ id: { id, num, megaStone?{원종id: 메가id}, berry? } }` |
| `abilities.json`, `natures.json`, `types.json` | 특성 목록 / `{ plus, minus }` / `{ types[], chart[공격][방어] }` |
| `regulations.json` | `[{ id, start, end, rules, pokemon[id] }]` |
| `names.{ko,en,ja}.json` | `{ pokemon, moves, abilities, items, natures, types }` 각각 `{ id: 이름 }` |
| `texts.{ko,en,ja}.json` | `{ moves, abilities, items }` 설명문 |

스프라이트: `public/sprites/pokemon/{id}.png` (128×128), `public/sprites/items/{id}.png`.

## 자주 하는 작업

**새 레귤레이션**: Showdown 이 반영되면
1. `scripts/sources/regulation/M-X.json` 추가 (`period`, `rules`, `pokemon_list` 도감코드 `"0026-001"`) + `index.json` 에 등록
2. `node scripts/build-data.mjs --refresh --sprites`
3. 경고(이름 없음/스프라이트 없음/PP 추정)를 확인하고 `scripts/sources/*.json` 보강 → 다시 빌드
4. `npm test`, 화면 확인

도감코드 폼 번호는 Showdown `otherFormes` 순서(1부터)로 해석한다. 공식 번호가 다른 경우는
`build-data.mjs` 의 `CODE_OVERRIDES` 에 추가 (현재 비비용/영원의 꽃 플라엣테/냐오닉스♀).

**PP 수정**: `scripts/sources/champions-pp.json` 의 값을 숫자로 바꾸고(추정 표시 제거) 재빌드.
