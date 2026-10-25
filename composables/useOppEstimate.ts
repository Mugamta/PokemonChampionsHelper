// composables/useOppEstimate.ts
// 상대 배분 추정: 배틀에서 저장한 관측(주고받은 데미지, 선후공)으로 상대의 내구 / 공격 / 스피드 범위를 좁힌다.
//   관측마다 맞은 시점의 상태로 데미지를 다시 계산해 "그 데미지가 나올 수 있는 조합"만 남긴다
//   - 내구: HP SP × 방어(특방) SP × 성격 효과 (utils/statInference.ts bulkSummary)
//   - 공격: 공격(특공) SP × 성격 효과 × 도구 후보 (attackSummary)
//   - 스피드: 선후공 관찰로 좁힌 구간 (useBattle speedRangesOf, utils/speedInference.ts)
//   - HP: 턴 끝 HP(모래바람·먹다남은음식 등)를 게임 화면 값으로 고친 관측 (utils/hpDisplay.ts hpStepsMatch)
//   능력 포인트 합계(66) 제한: 스피드·공격에 확실히 쓴 만큼 내구 쪽 상한이 줄어든다
// 상대 특성은 입력값 기준. 상대 도구를 입력해 두었으면 그 도구 하나로만 계산한다.
// 배틀 계산(useBattle)도 이 결과로만 상대 실능치 범위를 정한다 (선출 화면의 성격·능력 포인트는 쓰지 않음): bounds

import { toRaw, type Ref } from 'vue'
import type { BattleSide, BattleState, MonState, StatObservation } from '~/utils/battleState'
import { useTeamCalc, type ResolvedSlot } from '~/composables/useTeamCalc'
import { calcDamage, effectiveMoveType } from '~/utils/damage'
import { hpCorrection, hpStepsMatch } from '~/utils/hpDisplay'
import { calcStat } from '~/utils/stats'
import { minSpeedSp, SPEED_BANDS, speedVerdict, type SpeedRanges } from '~/utils/speedInference'
import {
  attackCell,
  attackCells,
  attackSummary,
  bulkBounds,
  bulkCell,
  BULK_CELLS,
  bulkSummary,
  dealtMatches,
  drainMatches,
  fullStatRange,
  NAT_EFFECTS,
  natureFor,
  SP_COUNT,
  takenMatches,
  type AttackSummary,
  type BulkBounds,
  type BulkSummary,
  type Range,
} from '~/utils/statInference'
import type { StatTable, TeamSlot, TypeId } from '~/utils/types'

// 추정에 필요한 배틀 상태 (useBattle 이 자기 것을 넘긴다).
//   resolveSnapshot 의 상대 실능치는 기준값(SP 0·무보정)이라 추정 결과에 기대지 않는다 (서로 부르지 않게)
export interface EstimateSource {
  state: Ref<BattleState | null>
  resolveSnapshot: (
    side: BattleSide,
    idx: number,
    snap: { megaOn: boolean; alt: boolean; transform?: MonState['transform'] },
  ) => ResolvedSlot | null
  oppSlots: { readonly value: TeamSlot[] } // 선출 화면의 상대 파티 (다시 계산할지 판단용)
  oppItemOf: (idx: number) => string
  speedRangesOf: (oi: number, withPending?: boolean) => SpeedRanges
}

// 데미지에 영향을 주는 도구 후보 (챔피언스에 있는 것만 씀). '' = 데미지와 무관한 도구(스카프·먹다남은음식 등)
const DAMAGE_ITEMS = ['lifeorb', 'expertbelt', 'muscleband', 'wiseglasses']
const TYPE_ITEMS: Record<TypeId, string> = {
  normal: 'silkscarf',
  fire: 'charcoal',
  water: 'mysticwater',
  electric: 'magnet',
  grass: 'miracleseed',
  ice: 'nevermeltice',
  fighting: 'blackbelt',
  poison: 'poisonbarb',
  ground: 'softsand',
  flying: 'sharpbeak',
  psychic: 'twistedspoon',
  bug: 'silverpowder',
  rock: 'hardstone',
  ghost: 'spelltag',
  dragon: 'dragonfang',
  dark: 'blackglasses',
  steel: 'metalcoat',
  fairy: 'fairyfeather',
}
// 표시용 대략적 배율 (실효 공격 = 실능치 × 배율)
const ITEM_MULT: Record<string, number> = {
  lifeorb: 1.3,
  expertbelt: 1.2,
  muscleband: 1.1,
  wiseglasses: 1.1,
}

export interface OppEstimate {
  dealt: number // 내구 추정에 쓴 관측 수 (준 데미지)
  hpChecks: number // 턴 끝 HP 관측 수
  taken: number // 공격 추정에 쓴 관측 수
  bulk: BulkSummary
  atk: AttackSummary | null // 물리 공격 (관측이 있을 때)
  spa: AttackSummary | null
  items: string[] // 공격 관측과 맞는 도구 후보 ('' = 데미지 도구 없음)
  itemsFixed: boolean // 상대 도구를 입력해 둬서 그 도구로만 계산
  scarfRuledOut: boolean // 공격 추정으로 데미지 도구가 확정 → 스카프 아님
}

// 배틀 계산에 쓰는 상대 실능치 범위 (지금 폼 기준). 관측이 없거나 맞는 배분이 없는 능력치는 전체 범위
export interface OppBounds extends BulkBounds {
  atk: Range
  spa: Range
  spe: Range
}

export function useOppEstimate(b: EstimateSource) {
  const gd = useGameData()
  const calc = useTeamCalc()
  const chart = () => gd.data.value!.types.chart

  // 관측 시점 상태로 내 포켓몬 / 상대 포켓몬(미지수 제외) 다시 만들기
  const mineAt = (o: StatObservation, attacking: boolean) => {
    const r = b.resolveSnapshot('mine', o.mine.idx, o.mine)
    if (!r) return null
    return calc.combatant(attacking ? calc.attackForm(r) : r, {
      status: o.mine.status,
      boosts: o.mine.boosts,
      hp: o.mine.hp,
      item: o.mine.itemGone ? '' : undefined,
    })
  }
  const oppAt = (oi: number, o: StatObservation, attacking: boolean) => {
    const r = b.resolveSnapshot('opp', oi, o.opp)
    return r ? (attacking ? calc.attackForm(r) : r) : null
  }
  // 지금 상태의 상대 oi (실능치는 기준값 — 종족값·특성·폼만 씀)
  const current = (oi: number) => {
    const m = b.state.value?.sides.opp.mons[oi]
    return m ? b.resolveSnapshot('opp', oi, m) : null
  }

  // 공격 관측과 맞춰 볼 도구 후보
  const itemCandidates = (oi: number, obs: StatObservation[], r: ResolvedSlot) => {
    // 확정한 도구만 고정 (선출 화면의 도구는 추측이라 후보로 계산)
    const m = b.state.value?.sides.opp.mons[oi]
    if (m?.itemKnown) return { list: [b.oppItemOf(oi)], fixed: true }
    const have = gd.data.value?.items || {}
    const types = new Set<TypeId>()
    const cats = new Set<string>()
    for (const o of obs) {
      if (o.kind !== 'taken') continue
      const mv = gd.move(o.move)
      if (!mv) continue
      types.add(effectiveMoveType(mv, r.ability, o.field, r.species))
      cats.add(mv.category)
    }
    // 힘의머리띠 / 박식안경은 해당 분류 공격을 봤을 때만 (아니면 "데미지 도구 없음"과 구분이 안 됨)
    const relevant = (i: string) =>
      (i !== 'muscleband' || cats.has('physical')) && (i !== 'wiseglasses' || cats.has('special'))
    const list = [
      '',
      ...DAMAGE_ITEMS.filter((i) => have[i] && relevant(i)),
      ...[...types].map((t) => TYPE_ITEMS[t]).filter((i) => i && have[i]),
    ]
    return { list, fixed: false }
  }

  // ── 내구 격자: 내가 준 데미지(%) ─────────────
  function bulkGrids(oi: number, obs: StatObservation[]) {
    const grids: { def: Uint8Array | null; spd: Uint8Array | null } = { def: null, spd: null }
    let used = 0
    for (const o of obs) {
      if (o.kind !== 'dealt') continue
      const move = gd.move(o.move)
      const atk = mineAt(o, true)
      const base = oppAt(oi, o, false)
      if (!move || !atk || !base) continue
      // 맞는 능력치: 물리(사이코쇼크 포함) = 방어, 특수 = 특방. 원더룸이면 서로 바뀜
      let stat: 'def' | 'spd' =
        move.category === 'physical' || o.move === 'psyshock' ? 'def' : 'spd'
      if (o.field.wonderRoom) stat = stat === 'def' ? 'spd' : 'def'
      const grid = (grids[stat] ??= new Uint8Array(BULK_CELLS).fill(1))
      // 데미지 난수는 최대 HP 와 무관 → (방어 SP, 성격) 마다 한 번 계산하고 HP SP 별로 % 를 비교
      const hpRef = calcStat('hp', base.species.stats.hp, 32)
      for (const n of NAT_EFFECTS) {
        for (let d = 0; d < SP_COUNT; d++) {
          const stats = {
            ...base.stats,
            hp: hpRef,
            [stat]: calcStat(stat, base.species.stats[stat], d, natureFor(stat, n)),
          }
          const def = calc.combatant(base, {
            stats,
            status: o.opp.status,
            boosts: o.opp.boosts,
            hp: Math.round((hpRef * o.opp.hpPct) / 100),
            item: o.opp.itemGone ? '' : undefined,
          })
          const res = calcDamage(move, atk, def, chart(), o.field, { ...o.opts, crit: o.crit })
          for (let h = 0; h < SP_COUNT; h++) {
            const maxHp = calcStat('hp', base.species.stats.hp, h)
            if (
              !dealtMatches(res.rolls, maxHp, o.opp.hpPct, o.amount, o.ko) ||
              (o.drainLost && !drainMatches(res.rolls, maxHp, o.opp.hpPct, o.drainLost, o.ko))
            )
              grid[bulkCell(h, d, n)] = 0
          }
        }
      }
      used++
    }
    return { grids, used }
  }

  // ── 공격 격자: 내가 받은 데미지(HP) ─────────────
  function attackGrids(oi: number, obs: StatObservation[], items: string[]) {
    const grids: { atk: Uint8Array | null; spa: Uint8Array | null } = { atk: null, spa: null }
    let used = 0
    for (const o of obs) {
      if (o.kind !== 'taken') continue
      const move = gd.move(o.move)
      const def = mineAt(o, false)
      const base = oppAt(oi, o, true)
      if (!move || !def || !base) continue
      const stat: 'atk' | 'spa' = move.category === 'physical' ? 'atk' : 'spa'
      const grid = (grids[stat] ??= new Uint8Array(attackCells(items.length)).fill(1))
      items.forEach((item, ii) => {
        for (const n of NAT_EFFECTS) {
          for (let a = 0; a < SP_COUNT; a++) {
            const stats = {
              ...base.stats,
              [stat]: calcStat(stat, base.species.stats[stat], a, natureFor(stat, n)),
            }
            const atk = calc.combatant(base, {
              stats,
              status: o.opp.status,
              boosts: o.opp.boosts,
              hp: Math.round((base.stats.hp * o.opp.hpPct) / 100),
              item: o.opp.itemGone ? '' : item,
            })
            const res = calcDamage(move, atk, def, chart(), o.field, { ...o.opts, crit: o.crit })
            if (!takenMatches(res.rolls, o.amount, o.ko)) grid[attackCell(ii, a, n)] = 0
          }
        }
      })
      used++
    }
    return { grids, used }
  }

  // ── HP: 턴 끝 HP 관측 ─────────────
  // 이미 저장한 관측 + 이번 턴에 고친 값 (턴 적용 전이라도 바로 반영). HP SP 별 가능 여부 (관측이 없으면 null)
  const hpObsOf = (oi: number) => {
    const s = b.state.value
    const m = s?.sides.opp.mons[oi]
    if (!s || !m) return []
    const live = hpCorrection(m.hpCheck, m.hp, s.turn)
    return live ? [...(m.hpObs ?? []), live] : (m.hpObs ?? [])
  }
  function hpMask(oi: number, r: ResolvedSlot) {
    const list = hpObsOf(oi)
    if (!list.length) return { mask: null, used: 0 }
    const mask = new Uint8Array(SP_COUNT).fill(1)
    for (let h = 0; h < SP_COUNT; h++) {
      const max = calcStat('hp', r.species.stats.hp, h)
      if (!list.every((o) => hpStepsMatch(max, o))) mask[h] = 0
    }
    return { mask, used: list.length }
  }

  // ── 관측 → 격자 (SP·성격 공간이라 폼과 무관) ─────────────
  // 관측·도구/특성 확정·스피드 관찰이 그대로면 다시 계산하지 않는다 (배틀 계산이 자주 부름)
  function analyzeNow(oi: number, r: ResolvedSlot) {
    const m = b.state.value!.sides.opp.mons[oi]!
    const obs = m.obs ?? []
    const { list: items, fixed } = itemCandidates(oi, obs, r)
    const bulkG = bulkGrids(oi, obs)
    const hpG = hpMask(oi, r)
    const atkG = attackGrids(oi, obs, items)
    const speed = b.speedRangesOf(oi, false)
    // 스피드가 스카프로 확정이면 데미지 도구는 없다
    const sv = speedVerdict(speed)
    const allowedBySpeed = (i: number) => fixed || sv.scarf !== true || items[i] === ''
    // 물리·특수 관측 모두와 맞는 도구만
    const itemOk = (i: number) => {
      const has = (g: Uint8Array | null) => {
        if (!g) return true
        for (const n of NAT_EFFECTS)
          for (let a = 0; a < SP_COUNT; a++) if (g[attackCell(i, a, n)]) return true
        return false
      }
      return allowedBySpeed(i) && has(atkG.grids.atk) && has(atkG.grids.spa)
    }
    return { observed: !!m.speedSp, items, fixed, bulkG, hpG, atkG, speed, itemOk }
  }
  type Analysis = ReturnType<typeof analyzeNow>
  const ids = new WeakMap<object, number>()
  let nextId = 0
  const idOf = (o: object | undefined) => {
    if (!o) return 0
    const raw = toRaw(o)
    let id = ids.get(raw)
    if (id == null) ids.set(raw, (id = ++nextId))
    return id
  }
  const cache = new Map<number, { key: string; value: Analysis }>()
  function analyze(oi: number): Analysis | null {
    const m = b.state.value?.sides.opp.mons[oi]
    const slot = b.oppSlots.value[oi]
    if (!m || !slot || !gd.data.value) return null
    // 관측 목록은 쌓을 때마다 새 배열 → 배열 자체로 비교 (자주 불리므로 내용을 문자열로 만들지 않음).
    // 폼(메가·배틀 폼)은 기술 타입(스킨류 등)에 영향
    const key = [
      idOf(m.obs),
      idOf(m.hpObs),
      JSON.stringify(hpCorrection(m.hpCheck, m.hp, b.state.value!.turn)), // 이번 턴에 고친 HP
      m.itemKnown,
      m.item,
      m.abilityKnown,
      m.ability,
      m.megaOn,
      m.alt,
      JSON.stringify(m.speedSp ?? null),
      JSON.stringify(m.transform ?? null),
      slot.species,
      slot.ability,
      slot.item,
    ].join('|')
    const hit = cache.get(oi)
    if (hit?.key === key) return hit.value
    const r = current(oi)
    if (!r) return null
    const value = analyzeNow(oi, r)
    cache.set(oi, { key, value })
    return value
  }

  // 지금 폼의 종족값으로 공격·특공 요약
  const attackOf = (a: Analysis, base: StatTable) => {
    const mult = (cat: 'atk' | 'spa') => (i: number) => {
      const it = a.items[i]!
      if ((it === 'muscleband' && cat === 'spa') || (it === 'wiseglasses' && cat === 'atk'))
        return 1
      return ITEM_MULT[it] ?? (Object.values(TYPE_ITEMS).includes(it) ? 1.2 : 1)
    }
    const sum = (cat: 'atk' | 'spa') => {
      const g = a.atkG.grids[cat]
      return g ? attackSummary(g, a.items.length, cat, base[cat], mult(cat), a.itemOk) : null
    }
    return { atk: sum('atk'), spa: sum('spa') }
  }
  // 66 중 스피드·공격·특공에 확실히 쓴 SP 를 빼고 남은 만큼만 HP·방어·특방에
  const bulkBudget = (a: Analysis, atk: AttackSummary | null, spa: AttackSummary | null) =>
    Math.max(0, 66 - (minSpeedSp(a.speed) + (atk?.minSp ?? 0) + (spa?.minSp ?? 0)))

  // 상대 oi 의 추정 결과
  function estimate(oi: number): OppEstimate | null {
    const a = analyze(oi)
    const r = current(oi)
    if (!a || !r) return null
    const base = r.species.stats
    const { atk, spa } = attackOf(a, base)
    const feasibleItems = a.items.filter((_, i) => a.itemOk(i))
    return {
      dealt: a.bulkG.used,
      hpChecks: a.hpG.used,
      taken: a.atkG.used,
      bulk: bulkSummary(
        a.bulkG.grids.def,
        a.bulkG.grids.spd,
        base,
        bulkBudget(a, atk, spa),
        a.hpG.mask,
      ),
      atk,
      spa,
      items: feasibleItems,
      itemsFixed: a.fixed,
      scarfRuledOut:
        !a.fixed && a.atkG.used > 0 && feasibleItems.length > 0 && !feasibleItems.includes(''),
    }
  }

  // 배틀 계산용 상대 실능치 범위. base = 지금 폼의 종족값
  const boundsCache = new WeakMap<Analysis, Map<string, OppBounds>>()
  function bounds(oi: number, base: StatTable): OppBounds | null {
    const a = analyze(oi)
    if (!a) return null
    const key = `${base.hp},${base.atk},${base.def},${base.spa},${base.spd},${base.spe}`
    let byBase = boundsCache.get(a)
    if (!byBase) boundsCache.set(a, (byBase = new Map()))
    const hit = byBase.get(key)
    if (hit) return hit
    const out = boundsNow(a, base)
    byBase.set(key, out)
    return out
  }
  function boundsNow(a: Analysis, base: StatTable): OppBounds {
    const { atk, spa } = attackOf(a, base)
    const attackRange = (cat: 'atk' | 'spa', s: AttackSummary | null) =>
      s?.feasible && s.stat ? s.stat : fullStatRange(cat, base[cat])
    const bulk =
      bulkBounds(a.bulkG.grids.def, a.bulkG.grids.spd, base, bulkBudget(a, atk, spa), a.hpG.mask) ??
      bulkBounds(null, null, base, 66)!
    return {
      ...bulk,
      atk: attackRange('atk', atk),
      spa: attackRange('spa', spa),
      spe: speedStatRange(a.speed, base.spe, a.observed),
    }
  }

  // 분석 대상 칸의 상대
  const focusOpp = (side: BattleSide = 'opp') => {
    const s = b.state.value
    return s ? (s.sides[side].active[s.focus[side]] ?? null) : null
  }

  return { estimate, bounds, focusOpp }
}

// 스피드 실능치 범위: 남은 구간의 SP 범위 (보정 구간은 보정 성격).
// 관찰이 한 번도 없으면 하락 성격 S0 도 (선후공 판정과 같은 기준). 모든 구간이 지워졌으면 전체 범위
function speedStatRange(ranges: SpeedRanges, base: number, observed: boolean): Range {
  const vals: number[] = []
  for (const band of SPEED_BANDS) {
    const sp = ranges[band.key]
    if (!sp) continue
    const nat = natureFor('spe', band.plus ? 1 : 0)
    vals.push(calcStat('spe', base, sp[0], nat), calcStat('spe', base, sp[1], nat))
  }
  if (!vals.length) return fullStatRange('spe', base)
  if (!observed) vals.push(calcStat('spe', base, 0, natureFor('spe', -1)))
  return { min: Math.min(...vals), max: Math.max(...vals) }
}
