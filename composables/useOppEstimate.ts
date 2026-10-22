// composables/useOppEstimate.ts
// 상대 배분 추정: 배틀에서 저장한 관측(주고받은 데미지, 선후공)으로 상대의 내구 / 공격 / 스피드 범위를 좁힌다.
//   관측마다 맞은 시점의 상태로 데미지를 다시 계산해 "그 데미지가 나올 수 있는 조합"만 남긴다
//   - 내구: HP SP × 방어(특방) SP × 성격 효과 (utils/statInference.ts bulkSummary)
//   - 공격: 공격(특공) SP × 성격 효과 × 도구 후보 (attackSummary)
//   - 스피드: 선후공 관찰로 좁힌 구간 (useBattle speedRangesOf, utils/speedInference.ts)
//   능력 포인트 합계(66) 제한: 스피드·공격에 확실히 쓴 만큼 내구 쪽 상한이 줄어든다
// 상대 특성은 입력값 기준. 상대 도구를 입력해 두었으면 그 도구 하나로만 계산한다.

import type { BattleSide, StatObservation, useBattle } from '~/composables/useBattle'
import { useTeamCalc, type ResolvedSlot } from '~/composables/useTeamCalc'
import { calcDamage, effectiveMoveType } from '~/utils/damage'
import { calcStat } from '~/utils/stats'
import { minSpeedSp, speedVerdict } from '~/utils/speedInference'
import {
  attackCell,
  attackCells,
  attackSummary,
  bulkCell,
  BULK_CELLS,
  bulkSummary,
  dealtMatches,
  NAT_EFFECTS,
  natureFor,
  SP_COUNT,
  takenMatches,
  type AttackSummary,
  type BulkSummary,
} from '~/utils/statInference'
import type { TypeId } from '~/utils/types'

type Battle = ReturnType<typeof useBattle>

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
  dealt: number // 내구 추정에 쓴 관측 수
  taken: number // 공격 추정에 쓴 관측 수
  bulk: BulkSummary
  atk: AttackSummary | null // 물리 공격 (관측이 있을 때)
  spa: AttackSummary | null
  items: string[] // 공격 관측과 맞는 도구 후보 ('' = 데미지 도구 없음)
  itemsFixed: boolean // 상대 도구를 입력해 둬서 그 도구로만 계산
  scarfRuledOut: boolean // 공격 추정으로 데미지 도구가 확정 → 스카프 아님
}

export function useOppEstimate(b: Battle) {
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
            if (!dealtMatches(res.rolls, maxHp, o.amount, o.ko)) grid[bulkCell(h, d, n)] = 0
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

  // 상대 oi 의 추정 결과
  function estimate(oi: number): OppEstimate | null {
    const m = b.state.value?.sides.opp.mons[oi]
    const r = b.resolveAt('opp', oi)
    if (!m || !r || !gd.data.value) return null
    const obs = m.obs ?? []
    const { list: items, fixed } = itemCandidates(oi, obs, r)
    const bulkG = bulkGrids(oi, obs)
    const atkG = attackGrids(oi, obs, items)

    // 스피드가 스카프로 확정이면 데미지 도구는 없다
    const sv = speedVerdict(b.speedRangesOf(oi, false))
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
    const mult = (cat: 'atk' | 'spa') => (i: number) => {
      const it = items[i]!
      if ((it === 'muscleband' && cat === 'spa') || (it === 'wiseglasses' && cat === 'atk'))
        return 1
      return ITEM_MULT[it] ?? (Object.values(TYPE_ITEMS).includes(it) ? 1.2 : 1)
    }
    const base = r.species.stats
    const atk = atkG.grids.atk
      ? attackSummary(atkG.grids.atk, items.length, 'atk', base.atk, mult('atk'), itemOk)
      : null
    const spa = atkG.grids.spa
      ? attackSummary(atkG.grids.spa, items.length, 'spa', base.spa, mult('spa'), itemOk)
      : null
    const feasibleItems = items.filter((_, i) => itemOk(i))
    // 66 중 스피드·공격·특공에 확실히 쓴 SP 를 빼고 남은 만큼만 HP·방어·특방에
    const reserved = minSpeedSp(b.speedRangesOf(oi, false)) + (atk?.minSp ?? 0) + (spa?.minSp ?? 0)
    const bulk = bulkSummary(bulkG.grids.def, bulkG.grids.spd, base, Math.max(0, 66 - reserved))
    return {
      dealt: bulkG.used,
      taken: atkG.used,
      bulk,
      atk,
      spa,
      items: feasibleItems,
      itemsFixed: fixed,
      scarfRuledOut:
        !fixed && atkG.used > 0 && feasibleItems.length > 0 && !feasibleItems.includes(''),
    }
  }

  // 분석 대상 칸의 상대
  const focusOpp = (side: BattleSide = 'opp') => {
    const s = b.state.value
    return s ? (s.sides[side].active[s.focus[side]] ?? null) : null
  }

  return { estimate, focusOpp }
}
