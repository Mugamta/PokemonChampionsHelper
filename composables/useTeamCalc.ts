// composables/useTeamCalc.ts
// 파티 슬롯(TeamSlot) → 실제 계산에 쓰는 형태(메가 반영 폼, 실능치, 특성)로 변환하고
// 데미지 표의 한 칸(Cell)을 만드는 공용 함수 모음. 파티/선출/배틀 화면이 모두 이걸 쓴다.

import type { Combatant, DamageOptions, FieldState } from '~/utils/damage'
import { calcDamage, hitInfo, perHitDamage, powerIndex } from '~/utils/damage'
import { calcStats } from '~/utils/stats'
import { koChance, koHitIndex, type KoInfo } from '~/utils/ko'
import type { Nature, Pokemon, StatTable, Status, TeamSlot, TypeId } from '~/utils/types'

export interface ResolvedSlot {
  slot: TeamSlot
  base: Pokemon // 원종
  species: Pokemon // 실제 폼 (메가 적용 시 메가 폼)
  megaId: string | null // 이 도구로 가능한 메가 폼 (적용 여부와 무관)
  isMega: boolean
  nature: Nature | null
  stats: StatTable
  ability: string
}

export interface Cell {
  min: number
  max: number
  pctMin: number
  pctMax: number
  lethal: boolean // 최대 데미지가 상대 HP 이상
  ko: KoInfo | null
  hits: { min: number; max: number } | null // 연속기
  koHit: { best: number; worst: number | null } | null // 연속기 몇 타째 KO
  effectiveness: number
  type: TypeId
  immune: boolean
}

export function useTeamCalc() {
  const gd = useGameData()

  const resolve = (slot: TeamSlot | undefined, megaOn = true): ResolvedSlot | null => {
    if (!slot?.species) return null
    const base = gd.pokemon(slot.species)
    if (!base || !gd.data.value) return null
    const megaId = gd.megaFor(slot.species, slot.item)
    const mega = megaOn && megaId ? gd.pokemon(megaId) : null
    const species = mega || base
    const nature = gd.data.value.natures[slot.nature] || null
    const ability = mega ? mega.abilities[0]! : slot.ability || base.abilities[0] || ''
    return { slot, base, species, megaId, isMega: !!mega, nature, stats: calcStats(species.stats, slot.sp, nature), ability }
  }

  // 시나리오 계산용: 같은 폼으로 SP/성격만 바꾼 실능치
  const statsWith = (r: ResolvedSlot, sp: Partial<StatTable>, natureId: string) =>
    calcStats(r.species.stats, sp, gd.data.value?.natures[natureId] || null)

  const combatant = (
    r: ResolvedSlot,
    extra: { status?: Status; boosts?: Combatant['boosts']; hp?: number; stats?: StatTable } = {},
  ): Combatant => ({
    species: r.species,
    stats: extra.stats || r.stats,
    ability: r.ability,
    item: r.slot.item,
    itemLocked: !!gd.data.value?.items[r.slot.item]?.megaStone,
    status: extra.status,
    boosts: extra.boosts,
    hp: extra.hp,
  })

  // 데미지 표 한 칸. 상태기/빈 기술이면 null
  const cell = (moveId: string, atk: Combatant, def: Combatant, field: FieldState = {}, opts: DamageOptions = {}, spreadMult = 1): Cell | null => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status' || !gd.data.value) return null
    const chart = gd.data.value.types.chart
    const defHp = def.hp ?? def.stats.hp
    const maxHp = def.stats.hp
    const one = calcDamage(move, atk, def, chart, field, { ...opts, spread: opts.spread || spreadMult < 1 })
    const info = hitInfo(move, atk)
    const multi = info.max > 1
    let min = one.min
    let max = one.max
    let koHit: Cell['koHit'] = null
    let ko: KoInfo | null = null
    if (multi) {
      const per = perHitDamage(move, atk, def, chart, field, { ...opts, spread: opts.spread || spreadMult < 1 }, info)
      min = per.min.slice(0, info.min).reduce((s, v) => s + v, 0)
      max = per.max.reduce((s, v) => s + v, 0)
      const best = koHitIndex(per.max, defHp)
      koHit = best ? { best, worst: koHitIndex(per.min, defHp) } : null
    } else {
      ko = koChance(one.rolls, defHp)
    }
    return {
      min,
      max,
      pctMin: maxHp ? (min / maxHp) * 100 : 0,
      pctMax: maxHp ? (max / maxHp) * 100 : 0,
      lethal: max >= defHp,
      ko,
      hits: multi ? { min: info.min, max: info.max } : null,
      koHit,
      effectiveness: one.effectiveness,
      type: one.type,
      immune: one.effectiveness === 0,
    }
  }

  const power = (r: ResolvedSlot | null, moveId: string, field: FieldState = {}, status?: Status) => {
    const move = gd.move(moveId)
    if (!r || !move) return null
    return powerIndex(move, combatant(r, { status }), field)
  }

  return { resolve, statsWith, combatant, cell, power }
}

// 표시용 포맷
export const pct = (n: number) => n.toFixed(1)
