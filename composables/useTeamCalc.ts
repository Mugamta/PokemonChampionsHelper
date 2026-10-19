// composables/useTeamCalc.ts
// 파티 슬롯(TeamSlot) → 실제 계산에 쓰는 형태(메가 반영 폼, 실능치, 특성)로 변환하고
// 데미지 표의 한 칸(Cell)을 만드는 공용 함수 모음. 파티/선출/배틀 화면이 모두 이걸 쓴다.

import type { Combatant, DamageOptions, FieldState } from '~/utils/damage'
import { calcDamage, hitInfo, perHitDamage, powerIndex, withoutItems } from '~/utils/damage'
import { calcStats } from '~/utils/stats'
import { holdsOnAtFull, koChance, koHitIndex, type KoInfo } from '~/utils/ko'
import type { Nature, Pokemon, StatTable, Status, TeamSlot, TypeId } from '~/utils/types'

export interface ResolvedSlot {
  slot: TeamSlot
  base: Pokemon // 원종
  species: Pokemon // 실제 폼 (메가 적용 시 메가 폼)
  megaId: string | null // 이 도구로 가능한 메가 폼 (적용 여부와 무관)
  isMega: boolean
  formId: string | null // 배틀 중에만 바뀌는 폼 (팔라피 마이티폼 / 킬가르도 블레이드폼). 메가 적용 중이면 null
  isAlt: boolean // 그 폼으로 계산 중
  nature: Nature | null
  stats: StatTable
  ability: string
  transformedFrom?: string // 변신 중인 원래 포켓몬 (메타몽) — 이때 실능치는 복사한 값이라 배분 추정 대상이 아님
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
  holdOn: boolean // 기합의띠/옹골참으로 한 번에는 쓰러지지 않음 (KO 판정에 반영)
}

// 배틀 밖(파티/선출 표)에서 쓰는 배틀 폼 기본값. 팔라피는 실전에서 거의 항상 마이티폼으로 싸운다.
// 킬가르도는 실드폼 (공격할 때만 attackForm 으로 블레이드폼)
const DEFAULT_ALT: Record<string, boolean> = { palafin: true }

export function useTeamCalc() {
  const gd = useGameData()

  // alt: 배틀 폼 적용 여부. 생략하면 배틀 밖 기본값 (DEFAULT_ALT)
  const resolve = (
    slot: TeamSlot | undefined,
    megaOn = true,
    alt?: boolean,
  ): ResolvedSlot | null => {
    if (!slot?.species) return null
    const base = gd.pokemon(slot.species)
    if (!base || !gd.data.value) return null
    const megaId = gd.megaFor(slot.species, slot.item)
    const mega = megaOn && megaId ? gd.pokemon(megaId) : null
    const formId = mega ? null : (base.battleForm?.to ?? null)
    const form = formId && (alt ?? DEFAULT_ALT[base.id] ?? false) ? gd.pokemon(formId) : null
    const species = mega || form || base
    const nature = gd.data.value.natures[slot.nature] || null
    const ability = mega ? mega.abilities[0]! : slot.ability || base.abilities[0] || ''
    return {
      slot,
      base,
      species,
      megaId,
      isMega: !!mega,
      formId,
      isAlt: !!form,
      nature,
      stats: calcStats(species.stats, slot.sp, nature),
      ability,
    }
  }

  // 공격할 때의 폼: 배틀스위치(킬가르도)는 공격기를 쓰는 순간 블레이드폼이 된다
  const attackForm = (r: ResolvedSlot): ResolvedSlot => {
    if (r.ability !== 'stancechange' || !r.formId || r.isAlt) return r
    const blade = resolve(r.slot, r.isMega, true)
    if (!blade) return r
    // 킬가르도로 변신한 메타몽: HP 는 메타몽 것 유지
    return r.transformedFrom
      ? { ...blade, stats: { ...blade.stats, hp: r.stats.hp }, transformedFrom: r.transformedFrom }
      : blade
  }

  // 변신(메타몽 괴짜/변신): 상대의 종(메가·폼 포함)·타입·특성·기술·실능치(HP 제외)를 복사.
  // 도구·HP 는 자기 것 → 상대의 구애 도구 효과는 복사되지 않고(실능치가 아니라 도구 보정), 메타몽의 스카프는 복사한 스피드에 적용
  const transformed = (self: ResolvedSlot, target: ResolvedSlot): ResolvedSlot => ({
    ...target,
    slot: { ...target.slot, item: self.slot.item },
    megaId: null,
    stats: { ...target.stats, hp: self.stats.hp },
    transformedFrom: self.species.id,
  })

  // 시나리오 계산용: 같은 폼으로 SP/성격만 바꾼 실능치
  const statsWith = (r: ResolvedSlot, sp: Partial<StatTable>, natureId: string) =>
    calcStats(r.species.stats, sp, gd.data.value?.natures[natureId] || null)

  const combatant = (
    r: ResolvedSlot,
    // item: 배틀 중 도구를 잃은 경우 '' (소모/탁쳐서떨구기 등)
    extra: {
      status?: Status
      boosts?: Combatant['boosts']
      hp?: number
      stats?: StatTable
      item?: string
    } = {},
  ): Combatant => ({
    species: r.species,
    stats: extra.stats || r.stats,
    ability: r.ability,
    item: extra.item ?? r.slot.item,
    itemLocked: !!gd.data.value?.items[r.slot.item]?.megaStone,
    status: extra.status,
    boosts: extra.boosts,
    hp: extra.hp,
  })

  // 데미지 표 한 칸. 상태기/빈 기술이면 null
  const cell = (
    moveId: string,
    rawAtk: Combatant,
    rawDef: Combatant,
    field: FieldState = {},
    opts: DamageOptions = {},
    spreadMult = 1,
  ): Cell | null => {
    // 매직룸이면 연속기 판정(스킬링크 제외 도구)·기합의띠도 도구 없음
    const [atk, def] = withoutItems(field, rawAtk, rawDef) as [Combatant, Combatant]
    const move = gd.move(moveId)
    if (!move || move.category === 'status' || !gd.data.value) return null
    const chart = gd.data.value.types.chart
    const defHp = def.hp ?? def.stats.hp
    const maxHp = def.stats.hp
    const spread = !!opts.spread || spreadMult < 1
    const one = calcDamage(move, atk, def, chart, field, { ...opts, spread })
    const info = hitInfo(move, atk, spread)
    const multi = info.max > 1
    const holdOn = holdsOnAtFull(atk, def)
    const capFirst = (d: number[]) => (holdOn ? [Math.min(d[0]!, defHp - 1), ...d.slice(1)] : d)
    let min = one.min
    let max = one.max
    let koHit: Cell['koHit'] = null
    let ko: KoInfo | null = null
    if (multi) {
      const per = perHitDamage(move, atk, def, chart, field, { ...opts, spread }, info)
      min = per.min.slice(0, info.min).reduce((s, v) => s + v, 0)
      max = per.max.reduce((s, v) => s + v, 0)
      const best = koHitIndex(capFirst(per.max), defHp)
      koHit = best ? { best, worst: koHitIndex(capFirst(per.min), defHp) } : null
    } else {
      ko = koChance(one.rolls, defHp, 4, holdOn)
    }
    return {
      min,
      max,
      pctMin: maxHp ? (min / maxHp) * 100 : 0,
      pctMax: maxHp ? (max / maxHp) * 100 : 0,
      lethal: max >= defHp && !(holdOn && !multi),
      ko,
      hits: multi ? { min: info.min, max: info.max } : null,
      koHit,
      effectiveness: one.effectiveness,
      type: one.type,
      immune: one.effectiveness === 0,
      holdOn,
    }
  }

  const power = (
    r: ResolvedSlot | null,
    moveId: string,
    field: FieldState = {},
    status?: Status,
  ) => {
    const move = gd.move(moveId)
    if (!r || !move) return null
    return powerIndex(move, combatant(attackForm(r), { status }), field)
  }

  return { resolve, attackForm, transformed, statsWith, combatant, cell, power }
}

// 표시용 포맷
export const pct = (n: number) => n.toFixed(1)
