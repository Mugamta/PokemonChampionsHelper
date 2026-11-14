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
| `scripts/sources/regulation/*.json` | 레귤레이션 기간과 출전 가능 도감코드 목록, 새 메가스톤(`new_mega_stones`) (`index.json` 에 파일명 등록) |
| Bulbagarden Archives | 스프라이트: `Category:Champions menu sprites`, `Category:Champions Bag sprites` |

op.gg 는 자동 수집을 차단(CloudFront 403)하므로 쓰지 않는다.

## 생성물 형식 (`public/data/`)

| 파일 | 형식 |
|---|---|
| `pokemon.json` | `{ id: { id, num, base, forme, types, stats{hp..spe}, abilities[], weight, gender?, learnset[] \| mega{from,item}, megas[]?, battleForm? } }` — `gender` 는 성별이 정해진 종만 (`M` 수컷만 / `F` 암컷만 / `N` 무성, Showdown `gender`), 없으면 둘 다 가능. 메가는 learnset 없음(원종 것 사용). 배틀 폼(`palafinhero`, `aegislashblade`)은 `battleForm{from}`, 원래 폼은 `battleForm{to}`. 레귤레이션 목록에 없어서 슬롯에서는 못 고르고 스프라이트는 원래 폼 것을 쓴다 |
| `moves.json` | `{ id: { id, num, type, category, power, accuracy\|null, pp, ppEstimated?, priority, target, flags[], effects[] } }` — effects 는 `utils/types.ts MoveEffect`. flags 는 계산에 쓰는 것만 (접촉/펀치/소리 등 + 부자유친 제외용 charge/futuremove/noparentalbond + 매직미러 반사용 reflectable + 대타 무시 bypasssub) |
| `items.json` | `{ id: { id, num, megaStone?{원종id: 메가id}, berry? } }` |
| `abilities.json`, `natures.json`, `types.json` | 특성 목록 / `{ plus, minus }` / `{ types[], chart[공격][방어] }` |
| `regulations.json` | `[{ id, start, end, rules, pokemon[id], newMegaStones[item id], version?, showdown?, patch? }]` — `version` = 함께 나온 게임 버전(Ver.1.1.0 등), `showdown` = 지난 레귤레이션 데이터를 만든 Showdown 커밋, `patch` = 그 레귤레이션 데이터가 기본(최신)과 다른 부분 `{ moves{id: 기술 전체}, items{id: 도구 전체}, itemsOff[], pokemon{id: {types?, stats?, abilities?, weight?, learnset?}}, megasOff[] }`. 앱이 고른 레귤레이션의 patch 를 덮어써서 씀(`utils/regulationData.ts`). 지난 레귤레이션에만 있던 기술·도구도 `moves.json`/`items.json` 에 들어 있음(최신에서는 itemsOff) |
| `stats/` | 통계 화면(`/usage`) 전용 시즌별·월별 사용률 정리. `index.json` = `{ single | double: [{ reg, period: 'season' | 'YYYY-MM', battles, months[] }] }` (시즌 → 달 순, 각각 시간 순), `{kind}-{레귤레이션}-{period}.json` = `{ reg, period, battles, months, pokemon: [{ id, count, usage, moves, items, abilities, spreads, teammates }] }` (채용률 높은 순 = 순위, 목록은 `[[id, 비율], …]` 상위 기술 10·도구 6·특성 3·배분 3(`'성격:H/A/B/C/D/S'`)·동료 8, 사용 수 50 미만 제외), `trend-{kind}.json` = `{ [폼 id]: (index 순서대로 [순위, 채용률] \| 0) }` (순위 변동·월별 추이). 레귤레이션 포맷(`usage/` 와 같은 싱글/더블 포맷)의 **모든 달** chaos JSON 을 받아 달마다 + 시즌 합산(채용률은 배틀 수 가중, 비율은 수치 합 ÷ 특성 수치 합). `scripts/build-data.mjs` "6.6", 받기 실패면 기존 폴더 유지. 파일당 gzip 약 50KB, 고른 기간만 받음 |
| `usage/` | `index.json` = `{ single | double: { [레귤레이션 id]: { format, month, battles } } }` (출처 정보만, 시작할 때 받음), `{single|double}-{레귤레이션 id}.json` = 표 `{ format, month, battles, pokemon: { [폼 id]: { count, usage, moves[4], moveShare[4], moveUsage{기술: 비율}, nature, sp[H,A,B,C,D,S], spreadShare, ability, abilityUsage{특성: 비율}, items[3], itemShare[3], itemUsage{도구: 비율}, teammates{폼 id: 비율}, switchVs?{폼 id: 배수} } } }` — 표는 필요할 때 받음(`useGameData().usageTable(kind, reg)` / `loadUsage`, 현재 레귤레이션 싱글·더블은 첫 화면 뒤 미리 받음) (`usage` = 팀 채용률 0~1·전체 합 6, `*Share` = 그 포켓몬 안에서의 비율 0~1, 분모는 특성 수치 합) — Smogon 월별 사용률 통계(싱글 `gen9championsbssreg<id>`, 더블 VGC 1판 `gen9championsvgc<연도>reg<id>` — bo3 제외, 레이팅 가중 1500, 가장 최근 달). 사용 수 200 미만 제외. 선출 화면 상대 자동 배치(그 화면의 배틀 모드), 첫 화면 TOP 6·도감·파티 통계 추천(사용자가 고른 종류, `useUsageKind`)에 사용. `teammates` = 같은 파티에 함께 쓴 비율 상위 20개(통계를 쓰는 포켓몬만) → 파티 화면 "통계로 채우기"(`utils/teamSuggest.ts`, Smogon 에 완성 파티 통계가 없어 함께 쓴 비율 ÷ √채용률로 한 마리씩 고름). 받기 실패하면 기존 파일 유지, 새 달 반영은 `--refresh` (Showdown·PokeAPI 소스까지 다시 받음. 통계만 갱신하려면 `scripts/.cache/smogon/index.html` 을 지우고 `npm run build:data`). `switchVs`(싱글만) = 이 포켓몬이 그 상대를 만났을 때 교체로 물러나는 정도 ÷ 자기 평균 (0.5~2, 1±0.1 이내는 생략) — chaos JSON `Checks and Counters` 의 맞대결 수 n·(쓰러짐+교체) 비율 p 에 moveset txt(`/stats/<월>/moveset/<포맷>-1500.txt`)의 쓰러짐/교체 비율을 곱해 추정 (moveset 에 없는 쌍은 그 포켓몬의 평균 교체 몫), 맞대결 50회만큼 평균을 섞음 → 추천 플레이 상대 교체 사전 비중. 헤더에 현재 레귤레이션 통계의 수집 기간(그 달 전체) 표시. 화면에는 출처(포맷·자료 월·배틀 수)를 선출 화면·상대 슬롯·소개 페이지에 표시 (게임 내 랭크배틀 통계가 아니므로) |
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
   새로 쓸 수 있게 된 메가스톤이 있으면 `new_mega_stones` (도구 id 배열, 예 `"absolitez"`) — 성능표 "신규" 표시용,
   함께 나온 게임 버전은 `version` (`"Ver.1.2.0"`)
   **직전 레귤레이션 파일에 `showdown_commit` 을 적는다**: 새 레귤레이션이 Showdown 에 반영되기 직전 커밋의 전체 sha
   (`data/mods/champions` 기록에서 "Add Champions Regulation M-X" 커밋의 부모). 안 적으면 지난 레귤레이션도 최신 데이터로 계산됨.
   커밋 고정 소스는 `scripts/.cache/showdown@<sha>/` 에 받고 `--refresh` 에도 다시 받지 않음
2. `node scripts/build-data.mjs --refresh --sprites`
3. 경고(이름 없음/스프라이트 없음/PP 추정)를 확인하고 `scripts/sources/*.json` 보강 → 다시 빌드
4. `npm test`, 화면 확인

도감코드 폼 번호는 Showdown `otherFormes` 순서(1부터)로 해석한다. 공식 번호가 다른 경우는
`build-data.mjs` 의 `CODE_OVERRIDES` 에 추가 (현재 비비용/영원의 꽃 플라엣테/냐오닉스♀).

**PP 예외**: 규칙과 다른 기술이 생기면 `scripts/sources/champions-pp.json` 에 `{ "id": pp }` 로 추가하고 재빌드.

**이름 보강**: PokeAPI 에 없는 이름은 `build-data.mjs` 의 `FORM_NAME_OVERRIDES`(폼 이름. 예: 히스이 폼 "(히스이의 모습)", 성별 폼 수컷 "(수컷의 모습)" — 기본 폼에도 적용됨)와
`ABILITY_OVERRIDES`(특성 이름) / `ABILITY_TEXT_OVERRIDES`(특성 설명) 에 언어별로 추가.
챔피언스 신규 특성·폼처럼 PokeAPI 에 없는 이름은 한국어 = 포켓몬코리아 공식 도감(pokemonkorea.co.kr/pokedex), 일본어 = 일본 공식 도감·공략 사이트에서 확인. 도구는 `scripts/sources/item-names-ko.json`. 재빌드는 `scripts/.cache` 가 있으면 오프라인으로 된다.
