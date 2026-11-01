// composables/usePickRecommend.ts
// 선출 화면의 선출·선두 추천: 내 파티 6 × 상대 파티 6 의 1:1 맞대결 값을 만들어 utils/pickRecommend.ts 로 조합 순위.
//   맞대결 = 서로 가장 센 기술의 한 번 기대 데미지(명중 포함)를 주고받을 때 누가 먼저 쓰러뜨리는가 (duelValue, HP 가득에서),
//   스피드는 실능치(구애스카프 1.5배)만 비교 (우선도·랭크·날씨 특성은 안 봄), 기합의띠·옹골참 반영.
//   상대가 나올 정도 = 싱글/더블 사용률 통계의 사용률 (메가 폼 포함 큰 쪽), 통계가 없으면 같게
// 계산이 가벼운 편이지만 화면에서 버튼을 눌렀을 때만 한다.

import { useTeamCalc, type ResolvedSlot } from '~/composables/useTeamCalc'
import { useRegulation } from '~/composables/useRegulation'
import { PICK_COUNT, type BattleMode } from '~/composables/useEntry'
import { duelValue } from '~/utils/recommend'
import { recommendPicks, type PickPlan } from '~/utils/pickRecommend'
import type { FieldState } from '~/utils/damage'

// 선두 수 (싱글 1, 더블 2)
const LEAD_COUNT: Record<BattleMode, number> = { single: 1, double: 2 }
// 통계가 없는 상대 포켓몬의 비중 (통계에 있는 포켓몬의 사용률과 같은 단위)
const NO_USAGE = 0.05

export interface PickRecommendation {
  mine: number[] // value 행 → 내 파티 슬롯 번호
  opp: number[] // value 열 → 상대 파티 슬롯 번호
  value: number[][]
  oppWeight: number[]
  plans: (PickPlan & { slots: number[] })[] // slots: 선출 순서 (내 파티 슬롯 번호)
}

export function usePickRecommend(mode: BattleMode) {
  const gd = useGameData()
  const calc = useTeamCalc()
  const reg = useRegulation()
  const mine = useTeam('mine')
  const opp = useTeam('opp')

  // 가장 센 기술 한 번의 기대 데미지 (맞는 쪽 최대 HP 비율, 명중 포함)
  const bestHit = (a: ResolvedSlot, d: ResolvedSlot, field: FieldState) => {
    const atk = calc.combatant(calc.attackForm(a))
    const def = calc.combatant(d)
    let best = 0
    for (const m of a.slot.moves) {
      if (!m || gd.move(m)?.category === 'status') continue
      const c = calc.cell(m, atk, def, field, { spread: mode === 'double' })
      if (!c || c.immune) continue
      best = Math.max(best, (((c.pctMin + c.pctMax) / 2) * c.hitChance) / 100)
    }
    return best
  }
  const speedOf = (r: ResolvedSlot) => r.stats.spe * (r.slot.item === 'choicescarf' ? 1.5 : 1)
  const holds = (r: ResolvedSlot) => r.slot.item === 'focussash' || r.ability === 'sturdy'

  function compute(field: FieldState): PickRecommendation | null {
    const mineIdx = mine.slots.value.map((_, i) => i).filter((i) => mine.slots.value[i]!.species)
    const oppIdx = opp.slots.value.map((_, i) => i).filter((i) => opp.slots.value[i]!.species)
    if (mineIdx.length < PICK_COUNT[mode] || !oppIdx.length) return null
    const R = (side: 'mine' | 'opp', i: number) => {
      const t = side === 'mine' ? mine : opp
      return calc.resolve(t.slots.value[i], t.megaOn.value[i], t.altOn.value[i] ?? undefined)
    }
    const myR = mineIdx.map((i) => R('mine', i))
    const opR = oppIdx.map((i) => R('opp', i))
    const value = myR.map((a) =>
      opR.map((o) => {
        if (!a || !o) return 0
        const sa = speedOf(a)
        const so = speedOf(o)
        return duelValue(
          {
            mine: bestHit(a, o, field),
            opp: bestHit(o, a, field),
            pFirst: sa > so ? 1 : sa === so ? 0.5 : 0,
            holdMine: holds(a),
            holdOpp: holds(o),
          },
          1,
          1,
        )
      }),
    )
    // 상대가 나올 정도: 사용률 (메가 폼은 따로 세므로 원종·메가 중 큰 쪽)
    const table = gd.usageTable(mode, reg.active.value?.id)
    const oppWeight = opR.map((o) => {
      if (!o) return 0
      if (!table) return 1
      const ids = [o.base.id, o.species.id, o.megaId].filter(Boolean) as string[]
      const u = Math.max(0, ...ids.map((id) => table.pokemon[id]?.usage ?? 0))
      return u || NO_USAGE
    })
    const plans = recommendPicks(value, oppWeight, PICK_COUNT[mode], LEAD_COUNT[mode]).map((p) => ({
      ...p,
      slots: p.picks.map((k) => mineIdx[k]!),
    }))
    return { mine: mineIdx, opp: oppIdx, value, oppWeight, plans }
  }
  return { compute }
}
