// composables/useTeamCalc.ts
// 파티 슬롯(TeamSlot) → 실제 계산에 쓰는 형태(메가 반영 폼, 실능치, 특성)로 변환하고
// 데미지 표의 한 칸(Cell)을 만드는 공용 함수 모음. 파티/선출/배틀 화면이 모두 이걸 쓴다.

import type { Combatant, DamageOptions, FieldState } from '~/utils/damage'
import { calcDamage, hitInfo, perHitDamage, powerIndex, withoutItems } from '~/utils/damage'
import { calcStats } from '~/utils/stats'
import {
  holdsOnAtFull,
  koChance,
  koHitIndex,
  koHitIndexWithSub,
  koProbWithin,
  type KoInfo,
} from '~/utils/ko'
import { critChance, hitChance } from '~/utils/accuracy'
import { hitsUsed } from '~/utils/perfTable'
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
  disguise: boolean // 둔갑(따라큐): 첫 공격은 막고 최대 HP 1/8 만 (KO 판정에 반영)
  hitChance: number // 명중 확률 (0~1, 특성·도구·날씨·중력 반영)
  critChance: number // 급소 확률 (0~1)
  // 실전 KO 확률(%): ko.hits 번 안에 쓰러뜨릴 확률 — 명중·급소·변덕레이저(30% 위력 2배) 포함. 단타 기술만 (아니면 null)
  koReal: number | null
  fickle: boolean // 변덕레이저: max 는 위력 2배일 때
  // 대타 뒤 (대타를 무시하는 기술·틈새포착이 아닐 때): 이번 공격은 대타가 받음 → KO 타수는 대타를 깨는 타수 + 본체 타수.
  // breaks: 이번 한 번으로 대타가 깨지는가
  sub?: { hp: number; breaks: 'sure' | 'maybe' | 'none' } | null
  // 확정 전 상대 도구의 추측(선출 화면 도구)을 지녔다면의 결과. 본 결과는 확정한 사실만으로 계산한 것
  guess?: CellGuess | null
  maxHp: number // 맞는 쪽 최대 HP (실수치)
  // 배틀: 상대 배분 범위의 양 끝으로 계산한 두 결과 (공격에 가장 유리한 / 불리한 배분). 위의 수치는 둘을 합친 범위,
  // KO 판정(ko·koHit·koReal)은 불리한 쪽 (spanCells)
  bounds?: { best: Cell; worst: Cell } | null
}
export interface CellGuess {
  item: string
  min: number
  max: number
  pctMin: number
  pctMax: number
  lethal: boolean
  ko: KoInfo | null
  koHit: Cell['koHit']
  maxHp: number
  bounds?: Cell['bounds']
}

// 상대 배분 범위의 양 끝 결과를 하나로: 데미지는 둘을 합친 범위, KO 판정은 불리한 쪽 + bounds 에 둘 다
export function spanCells(best: Cell | null, worst: Cell | null): Cell | null {
  if (!best || !worst) return best ?? worst
  return {
    ...worst,
    min: Math.min(best.min, worst.min),
    max: Math.max(best.max, worst.max),
    pctMin: Math.min(best.pctMin, worst.pctMin),
    pctMax: Math.max(best.pctMax, worst.pctMax),
    lethal: best.lethal || worst.lethal,
    bounds: { best, worst },
  }
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
    const info = hitInfo(move, atk, spread, opts)
    const multi = info.max > 1
    const holdOn = holdsOnAtFull(atk, def)
    // 대타: 대타를 무시하는 기술(소리 기술 등)·틈새포착이 아니면 대타가 먼저 받는다
    const subHp =
      def.sub &&
      one.effectiveness > 0 &&
      !move.flags.includes('bypasssub') &&
      atk.ability !== 'infiltrator'
        ? def.sub
        : 0
    // 둔갑(따라큐, 둔갑이 풀리기 전): 첫 공격은 막고 최대 HP 1/8 데미지. 틀깨기면 무시 (대타가 있으면 대타가 먼저)
    const disguise =
      !subHp &&
      def.ability === 'disguise' &&
      def.species.id === 'mimikyu' &&
      atk.ability !== 'moldbreaker' &&
      one.effectiveness > 0
    const chip = Math.floor(maxHp / 8)
    const capFirst = (d: number[]) =>
      disguise ? [chip, ...d.slice(1)] : holdOn ? [Math.min(d[0]!, defHp - 1), ...d.slice(1)] : d
    let min = one.min
    let max = one.max
    let koHit: Cell['koHit'] = null
    let ko: KoInfo | null = null
    if (multi) {
      const per = perHitDamage(move, atk, def, chart, field, { ...opts, spread }, info)
      if (disguise) per.min[0] = per.max[0] = chip
      min = per.min.slice(0, info.min).reduce((s, v) => s + v, 0)
      max = per.max.reduce((s, v) => s + v, 0)
      const idx = (d: number[]) =>
        subHp ? koHitIndexWithSub(d, subHp, defHp) : koHitIndex(capFirst(d), defHp)
      const best = idx(per.max)
      koHit = best ? { best, worst: idx(per.min) } : null
    } else if (subHp) {
      // 대타를 깨는 타수 + 그 뒤 본체를 쓰러뜨리는 타수 (대타를 넘긴 데미지는 버려짐)
      const brk = koChance(one.rolls, subHp, 4)
      const rest = koChance(one.rolls, defHp, 3, holdOn)
      ko =
        brk && rest
          ? {
              hits: brk.hits + rest.hits,
              guaranteed: brk.guaranteed && rest.guaranteed,
              percent: brk.guaranteed ? rest.percent : (brk.percent * rest.percent) / 100,
            }
          : null
    } else if (disguise) {
      // 첫 타는 1/8 고정, 그 뒤로 보통 데미지 → N타 = 1 + 남은 HP 를 깎는 타수
      min = max = chip
      const rest = koChance(one.rolls, defHp - chip, 3)
      ko =
        defHp - chip <= 0
          ? { hits: 1, guaranteed: true, percent: 100 }
          : rest && { ...rest, hits: rest.hits + 1 }
    } else {
      ko = koChance(one.rolls, defHp, 4, holdOn)
    }
    // 명중·급소·무작위 위력 (변덕레이저)
    const acc = hitChance(move, atk, def, field, opts)
    const pc = one.power === 0 && !one.rolls.some(Boolean) ? 0 : critChance(move, atk, def, opts)
    const fickle = move.id === 'ficklebeam' && !opts.fickleDouble
    const dbl = fickle
      ? calcDamage(move, atk, def, chart, field, { ...opts, spread, fickleDouble: true })
      : null
    if (dbl && !multi && !disguise) max = dbl.max
    let koReal: number | null = null
    if (!multi && !disguise && !subHp && one.effectiveness > 0) {
      const fixed = one.rolls.every((v) => v === one.rolls[0])
      const critRolls =
        fixed || pc === 0 || opts.crit
          ? one.rolls
          : calcDamage(move, atk, def, chart, field, { ...opts, spread, crit: true }).rolls
      const branches: { rolls: number[]; p: number }[] = []
      const add = (rolls: number[], p: number) => p > 0 && branches.push({ rolls, p })
      const nonCrit = opts.crit ? 0 : 1 - pc
      const critP = opts.crit ? 1 : pc
      if (dbl) {
        const dblCrit = calcDamage(move, atk, def, chart, field, {
          ...opts,
          spread,
          fickleDouble: true,
          crit: true,
        }).rolls
        add(one.rolls, 0.7 * nonCrit)
        add(critRolls, 0.7 * critP)
        add(dbl.rolls, 0.3 * nonCrit)
        add(dblCrit, 0.3 * critP)
      } else {
        add(one.rolls, nonCrit)
        add(critRolls, critP)
      }
      const outcomes = [{ dmg: 0, p: 1 - acc }]
      for (const b of branches)
        for (const d of b.rolls) outcomes.push({ dmg: d, p: (acc * b.p) / b.rolls.length })
      koReal = koProbWithin(outcomes, defHp, ko?.hits ?? 1, holdOn)
    }
    return {
      min,
      max,
      pctMin: maxHp ? (min / maxHp) * 100 : 0,
      pctMax: maxHp ? (max / maxHp) * 100 : 0,
      lethal: subHp ? multi && !!koHit : max >= defHp && !(holdOn && !multi),
      ko,
      hits: multi ? { min: info.min, max: info.max } : null,
      koHit,
      effectiveness: one.effectiveness,
      type: one.type,
      immune: one.effectiveness === 0,
      holdOn,
      disguise,
      hitChance: acc,
      critChance: pc,
      koReal,
      fickle,
      maxHp,
      sub: subHp
        ? { hp: subHp, breaks: min >= subHp ? 'sure' : max >= subHp ? 'maybe' : 'none' }
        : null,
    }
  }

  // 연속기 타수 (특성·도구 반영: 스킬링크·속임수주사위·부자유친). 연속기가 아니면 null
  const hits = (r: ResolvedSlot | null, moveId: string) => {
    const move = gd.move(moveId)
    if (!r || !move || move.category === 'status') return null
    return hitsUsed(move, attackForm(r).ability, r.slot.item)
  }

  // boosts: 공격·특공 랭크 (파티 화면 결정력 미리보기 조건)
  // 연속기는 전체 타수 합 (타수가 무작위면 기댓값, 성능표와 같은 기준)
  const power = (
    r: ResolvedSlot | null,
    moveId: string,
    field: FieldState = {},
    status?: Status,
    boosts?: Combatant['boosts'],
  ) => {
    const move = gd.move(moveId)
    if (!r || !move) return null
    const v = powerIndex(move, combatant(attackForm(r), { status, boosts }), field)
    return v == null ? null : Math.floor(v * (hits(r, moveId)?.expFactor ?? 1))
  }

  return { resolve, attackForm, transformed, statsWith, combatant, cell, power, hits }
}

// 표시용 포맷
export const pct = (n: number) => n.toFixed(1)
