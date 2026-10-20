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
| (규칙) | **챔피언스 PP** = Showdown 챔피언스 기본 PP 를 5→8, 10→12, 15→16, 20 이상→20 으로 변환 (PP 는 8/12/16/20 네 단계, 1 은 그대로). Serebii 512개 기술과 전부 일치 확인 |
| `scripts/sources/champions-pp.json` | PP 예외 덮어쓰기 (보통 `{}`). `{ id: pp }` 또는 `{ id: { pp, estimated: true } }` |
| `scripts/sources/item-names-ko.json` | PokeAPI 에 한국어 이름이 없는 도구 (챔피언스 신규 메가스톤 등) |
| `scripts/sources/regulation/*.json` | 레귤레이션 기간과 출전 가능 도감코드 목록 (`index.json` 에 파일명 등록) |
| Bulbagarden Archives | 스프라이트: `Category:Champions menu sprites`, `Category:Champions Bag sprites` |

op.gg 는 자동 수집을 차단(CloudFront 403)하므로 쓰지 않는다.

## 생성물 형식 (`public/data/`)

| 파일 | 형식 |
|---|---|
| `pokemon.json` | `{ id: { id, num, base, forme, types, stats{hp..spe}, abilities[], weight, learnset[] \| mega{from,item}, megas[]?, battleForm? } }` — 메가는 learnset 없음(원종 것 사용). 배틀 폼(`palafinhero`, `aegislashblade`)은 `battleForm{from}`, 원래 폼은 `battleForm{to}`. 레귤레이션 목록에 없어서 슬롯에서는 못 고르고 스프라이트는 원래 폼 것을 쓴다 |
| `moves.json` | `{ id: { id, num, type, category, power, accuracy\|null, pp, ppEstimated?, priority, target, flags[], effects[] } }` — effects 는 `utils/types.ts MoveEffect`. flags 는 계산에 쓰는 것만 (접촉/펀치/소리 등 + 부자유친 제외용 charge/futuremove/noparentalbond) |
| `items.json` | `{ id: { id, num, megaStone?{원종id: 메가id}, berry? } }` |
| `abilities.json`, `natures.json`, `types.json` | 특성 목록 / `{ plus, minus }` / `{ types[], chart[공격][방어] }` |
| `regulations.json` | `[{ id, start, end, rules, pokemon[id] }]` |
| `usage.json` | `{ [레귤레이션 id]: { format, month, battles, pokemon: { [폼 id]: { count, moves[4], nature, sp[H,A,B,C,D,S], ability, items[3] } } } }` — Smogon 월별 사용률 통계(싱글 `gen9championsbssreg<id>`, 레이팅 가중 1500, 가장 최근 달). 사용 수 200 미만 제외. 선출 화면 상대 자동 배치에 사용. 받기 실패하면 기존 파일 유지, 새 달 반영은 `--refresh` |
| `names.{ko,en,ja}.json` | `{ pokemon, moves, abilities, items, natures, types }` 각각 `{ id: 이름 }` |
| `texts.{ko,en,ja}.json` | `{ moves, abilities, items }` 설명문 |

스프라이트: `public/sprites/pokemon/{id}.png` (128×128), `public/sprites/items/{id}.png`.

## 검증

```bash
node scripts/verify-data.mjs         # 기술 수치·도구·로스터·타입·메가 특성을 Serebii 와 대조
node scripts/verify-data.mjs --dex   # + 포켓몬별 종족값·습득 기술·한국어 이름 (약 230페이지, 처음엔 몇 분)
```
공식 사이트/패치노트는 전체 로스터나 기술 수치를 공개하지 않는다(게임 내 확인만 안내). 그래서
① 공식 공지(pokemon.com 뉴스, 닌텐도 고객지원 패치노트)로 신규 포켓몬 수·메가·밸런스 변경·기간을 확인하고
② 게임 데이터를 옮긴 Serebii 로 전체 수치를 대조한다. Serebii 오류로 판단한 항목은 스크립트의 `KNOWN` 에 근거와 함께 기록.

레귤레이션 기간은 공식 공지의 한국/일본 표준시(UTC+9)로 적는다 (예: M-C `2026/09/09 11:00 ~ 2026/12/02 10:59`).
앱은 이 값을 UTC+9 로 해석하고 화면에는 보는 사람의 현지 시각으로 표시한다.

## 자주 하는 작업

**새 레귤레이션**: Showdown 이 반영되면
1. `scripts/sources/regulation/M-X.json` 추가 (`period`, `rules`, `pokemon_list` 도감코드 `"0026-001"`) + `index.json` 에 등록
2. `node scripts/build-data.mjs --refresh --sprites`
3. 경고(이름 없음/스프라이트 없음/PP 추정)를 확인하고 `scripts/sources/*.json` 보강 → 다시 빌드
4. `npm test`, 화면 확인

도감코드 폼 번호는 Showdown `otherFormes` 순서(1부터)로 해석한다. 공식 번호가 다른 경우는
`build-data.mjs` 의 `CODE_OVERRIDES` 에 추가 (현재 비비용/영원의 꽃 플라엣테/냐오닉스♀).

**PP 예외**: 규칙과 다른 기술이 생기면 `scripts/sources/champions-pp.json` 에 `{ "id": pp }` 로 추가하고 재빌드.

**이름 보강**: PokeAPI 에 없는 이름은 `build-data.mjs` 의 `FORM_NAME_OVERRIDES`(폼 이름. 예: 히스이 폼 "(히스이의 모습)", 성별 폼 수컷 "(수컷의 모습)" — 기본 폼에도 적용됨)와
`ABILITY_OVERRIDES`(특성 이름) / `ABILITY_TEXT_OVERRIDES`(특성 설명) 에 언어별로 추가.
챔피언스 신규 특성·폼처럼 PokeAPI 에 없는 이름은 한국어 = 포켓몬코리아 공식 도감(pokemonkorea.co.kr/pokedex), 일본어 = 일본 공식 도감·공략 사이트에서 확인. 도구는 `scripts/sources/item-names-ko.json`. 재빌드는 `scripts/.cache` 가 있으면 오프라인으로 된다.
