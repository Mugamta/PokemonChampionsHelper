# 배틀 계산 규칙

포켓몬 챔피언스 기준. **레벨 50 고정, 개체값 31 고정**, 노력치 대신 **능력 포인트**(스탯당 최대 32, 합계 66).
partySelect는 합계 66 초과 또는 한 스탯 32 초과 시 입력칸을 빨갛게 표시한다(`getInputClass`).

## 실능치 — `utils/stat.ts` `calculateStat`

```
H = 종족값 + 75 + 능력포인트            (종족값 1 = 껍질몬 → 1)
그 외 = floor((종족값 + 20 + 능력포인트) × 성격보정)   성격보정 1.1 / 0.9 / 1.0
```
이후 도구/상태 배율 (각각 floor):
- 구애머리띠 A×1.5, 구애안경 C×1.5, 돌격조끼 D×1.5, 구애스카프 S×1.5
- 마비 S×0.5

메가진화 중이면 종족값을 `MegaEvolutionMap`의 `stats`로 바꿔 계산한다.

## 결정력 — `utils/move.ts` `calculateBaseDamage`

```
결정력 = 공격실능치(물리 A / 특수 C) × 위력 × 자속(1.5) × 보정들
```
- 특성: 천하장사 ×1.5, 근성(화상/마비) ×1.5
- 날씨 (날씨부정/에어록이면 무시): 쾌청·큰가뭄+불꽃 ×1.5, 쾌청+물 ×0.5, 큰가뭄+물 0,
  비·폭우+물 ×1.5, 비+불꽃 ×0.5, 폭우+불꽃 0
- 도구: 타입 강화 도구(실크스카프, 목탄, 신비의물방울 … 요정의깃털) 해당 타입 ×1.2
- 필드: 그래스/일렉트릭/사이코필드 해당 타입 ×1.3 (부유 제외), 미스트필드+드래곤 ×0.5
- 화상 + 물리 ×0.5 (근성이면 제외)

partySelect의 "결정력" 표시는 변화기를 제외하고 이 값을 그대로 보여준다.

## 데미지 — `calculateDamage` / `calculateDamageRolls`

```
core = floor(floor(2×50/5 + 2) × 결정력 / 방어실능치 / 50) + 2     (물리 B / 특수 D)
일반: floor(core × 0.85) ~ core
급소: core' = floor(core × 1.5) 에 같은 난수 적용
난수 16개: floor(core × (85..100) / 100)
```
- 더블 광역기 보정: `doubleEntrySelect.vue`에서 결과에 ×0.75 후 floor (`SPREAD_DAMAGE_RATIO`)
- 화면 표시 %는 `데미지 / 방어측 HP 실능치 × 100` (소수 1자리)

## 확정/난수 N타 — `calculateKoInfo` / `formatKoLabel`

16개 난수의 N회 합 분포를 컨볼루션으로 정확히 계산, 처음으로 KO 확률 > 0 인 N을 반환 (기본 최대 4타).
라벨: `"확정 2타"` 또는 `"난수 2타 (43.2%)"`.
연속기는 singleBattle의 `getMoveHitInfo` / `MULTI_HIT_OVERRIDES` / `computeMultiHitKoHit`가 별도로 처리.

## 기타

- 상태이상 턴 종료 데미지 `calculateStatusDamage`: 독 1/8, 화상 1/16 (내열 1/32), 맹독 n/16
- 랭크 배율 (singleBattle `rankMultiplier`): +n → (2+n)/2, −n → 2/(2+n)
- 날씨/필드 기본 5턴. 턴 조절 버튼으로 현재 턴이 총 턴에 도달한 상태에서 늘리면 8턴으로 연장
  (`changeExtendableTurn`, `WEATHER_BASE_TOTAL`, `WEATHER_EXTENDED_TOTAL`) — 도구 자동 판정 아님
- 내구 지수 (partySelect `calcDurability`): `floor(H × B(or D) / 0.411)`
- HP 배수 판정 (partySelect `checkHpCondition`, 우선순위 순):
  재생력 3n → 포이즌힐 8n+1 → 먹다남은음식/검은진흙 16n → 대타출동 16n+1 → 씨뿌리기 8n−1 → 기본 16n−1

## 반영 안 된 것 (계산 결과를 해석할 때 주의)

- **자속 보정은 항상 적용**(`stab = true`)되고, **타입 상성은 전혀 계산하지 않는다** — 포켓몬 데이터에 타입이 없음
- 생명의구슬, 달인의띠 등 일부 도구, 대부분의 특성(적응력, 테크니션 등), 랭크의 데미지 반영 여부는
  화면마다 다르므로 수정 전 해당 페이지 코드를 확인할 것
- 필드 보정의 "땅에 있는지" 판정은 부유 특성만 보고, 비행 타입은 판정 불가
