// utils/dex.ts — 포켓몬 도감(pages/dex.vue) 계산
//   명중: utils/accuracy.ts hitChance 를 맞는 쪽 보정 없이 (공격 측 특성·도구·명중 랭크만)
//   내구: H × 방어(특방) ÷ 0.411 (성능표와 같은 지수, 방어·특방 랭크 반영)
//   타입별 실질 내구: 내구 ÷ 받는 배율 (특성 무효·배율 포함 — typeCheck.ts defenseCell),
//                    반감열매를 지녔으면 그 타입(효과가 굉장할 때, 노말은 항상)에 2배

import { hitChance } from './accuracy'
import { RESIST_BERRIES, type Combatant, type TypeChart } from './damage'
import { bulkIndex } from './perfTable'
import { applyBoost } from './stats'
import { defenseCell, TYPE_ORDER } from './typeCheck'
import type { Move, StatTable, TypeId } from './types'

// 표시 명중률 (%, 소수 첫째 자리). 필중이면 null
export function shownAccuracy(move: Move, atk: Combatant): number | null {
  if (move.accuracy == null || atk.ability === 'noguard') return null
  const neutral: Combatant = { species: atk.species, stats: atk.stats, ability: '', item: '' }
  return Math.round(hitChance(move, atk, neutral) * 1000) / 10
}

export interface DexBulk {
  phys: number
  spec: number
}
export function dexBulk(stats: StatTable, boosts: { def?: number; spd?: number } = {}): DexBulk {
  return {
    phys: bulkIndex(stats.hp, applyBoost(stats.def, boosts.def ?? 0)),
    spec: bulkIndex(stats.hp, applyBoost(stats.spd, boosts.spd ?? 0)),
  }
}

export interface TypeBulkRow {
  type: TypeId
  mult: number // 받는 배율 (특성 반영)
  source?: string // 배율을 바꾼 특성
  berry: boolean // 반감열매가 이 타입에 발동
  phys: number | null // 실질 물리내구 (무효면 null)
  spec: number | null
}
export function typeBulk(def: Combatant, chart: TypeChart, bulk: DexBulk): TypeBulkRow[] {
  const berryType = RESIST_BERRIES[def.item]
  return TYPE_ORDER.map((type) => {
    const c = defenseCell(type, def, chart)
    const berry = berryType === type && (c.mult > 1 || type === 'normal')
    const k = c.mult === 0 ? 0 : (berry ? 2 : 1) / c.mult
    return {
      type,
      mult: c.mult,
      source: c.source,
      berry,
      phys: c.mult === 0 ? null : Math.floor(bulk.phys * k),
      spec: c.mult === 0 ? null : Math.floor(bulk.spec * k),
    }
  })
}
