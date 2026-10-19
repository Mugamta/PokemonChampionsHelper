// utils/typeCheck.ts — 타입 상성 도우미
//
// 1) 파티 일관성: 어떤 타입의 공격이 내 파티 "전원"에게 1배 이상 들어가는지 (타입별 최소 배율)
//    받는 배율 = 타입 상성 (특성·도구 무효 포함: 부유/풍선/흡수 특성/불가사의부적 — damage.ts typeEffectiveness)
//              × 받는 데미지를 바꾸는 방어 특성 (두꺼운지방·내열·수포·정화의소금 0.5, 건조피부 불꽃 1.25,
//                복슬복슬 불꽃 2, 필터·하드록·프리즘아머 효과굉장 0.75)
//    공격 측 특성(틀깨기 등)이나 기술별 예외(프리즈드라이 등)는 보지 않는다.
// 2) 툴팁용 상성 묶음: 방어(단일/복합 타입) / 공격(기술 타입). 타입 상성표만 사용 (특성 무시)

import { typeEffectiveness, type Combatant, type TypeChart } from './damage'
import type { Move, Pokemon, TypeId } from './types'

// 게임(도감) 타입 순서
export const TYPE_ORDER: TypeId[] = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
]

// ── 파티 일관성 ─────────────
// 받는 배율로 환산한 방어 특성 (공격·위력 보정이지만 결과적으로 받는 데미지 배율)
const ABILITY_MOD: Record<string, Partial<Record<TypeId, number>>> = {
  thickfat: { fire: 0.5, ice: 0.5 },
  heatproof: { fire: 0.5 },
  waterbubble: { fire: 0.5 },
  purifyingsalt: { ghost: 0.5 },
  dryskin: { fire: 1.25 },
  fluffy: { fire: 2 },
}
const SUPER_EFFECTIVE_REDUCE = new Set(['filter', 'solidrock', 'prismarmor'])

export interface TypeCell {
  mult: number
  source?: string // 배율을 바꾼 특성/도구 id (타입만으로 정해지면 없음)
}

// 특정 타입 "기술"로 때렸을 때를 보기 위한 가짜 기술/공격자 (플래그·특성 없음)
const probeMove = (type: TypeId): Move => ({
  id: '',
  num: 0,
  type,
  category: 'physical',
  power: 1,
  accuracy: null,
  pp: 1,
  priority: 0,
  target: 'normal',
  flags: [],
  effects: [],
})
const NOBODY: Pokemon = {
  id: '',
  num: 0,
  base: '',
  forme: '',
  types: [],
  stats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  abilities: [],
  weight: 1,
}
const PROBE_ATTACKER: Combatant = { species: NOBODY, stats: NOBODY.stats, ability: '', item: '' }

export function defenseCell(type: TypeId, defender: Combatant, chart: TypeChart): TypeCell {
  const eff = typeEffectiveness(type, probeMove(type), PROBE_ATTACKER, defender, chart, {})
  if (eff.mult === 0) return { mult: 0, source: eff.reason === 'type' ? undefined : eff.reason }
  let mult = eff.mult
  let source: string | undefined
  const mod = ABILITY_MOD[defender.ability]?.[type]
  if (mod) {
    mult *= mod
    source = defender.ability
  }
  if (SUPER_EFFECTIVE_REDUCE.has(defender.ability) && eff.mult > 1) {
    mult *= 0.75
    source = defender.ability
  }
  return { mult, source }
}

export interface TypeCheckRow {
  type: TypeId
  cells: TypeCell[] // 파티 순서
  min: number // 파티에서 가장 적게 받는 배율
}
export function teamTypeCheck(
  team: Combatant[],
  chart: TypeChart,
  types = TYPE_ORDER,
): TypeCheckRow[] {
  return types.map((type) => {
    const cells = team.map((d) => defenseCell(type, d, chart))
    return { type, cells, min: cells.length ? Math.min(...cells.map((c) => c.mult)) : 0 }
  })
}

// 파티 전원에게 1배 이상 들어가는 공격 타입: 최소 배율로 4배 이상 / 2배 이상 / 1배 이상 (겹치지 않게)
export interface Consistency {
  x4: TypeId[]
  x2: TypeId[]
  x1: TypeId[]
}
export function consistentTypes(rows: TypeCheckRow[]): Consistency {
  const out: Consistency = { x4: [], x2: [], x1: [] }
  for (const r of rows) {
    if (!r.cells.length) continue
    if (r.min >= 4) out.x4.push(r.type)
    else if (r.min >= 2) out.x2.push(r.type)
    else if (r.min >= 1) out.x1.push(r.type)
  }
  return out
}

// ── 툴팁용 상성 묶음 (타입 상성표만) ─────────────
export type DefenseBucket = 'x4' | 'x2' | 'x05' | 'x025' | 'x0'
export type AttackBucket = 'x2' | 'x05' | 'x0'

// 방어: 이 타입(들)이 각 공격 타입에 받는 배율로 묶음. 1배는 제외
export function defenseProfile(types: TypeId[], chart: TypeChart): Record<DefenseBucket, TypeId[]> {
  const out: Record<DefenseBucket, TypeId[]> = { x4: [], x2: [], x05: [], x025: [], x0: [] }
  for (const atk of TYPE_ORDER) {
    const m = types.reduce((p, d) => p * (chart[atk]?.[d] ?? 1), 1)
    if (m === 0) out.x0.push(atk)
    else if (m >= 4) out.x4.push(atk)
    else if (m >= 2) out.x2.push(atk)
    else if (m <= 0.25) out.x025.push(atk)
    else if (m < 1) out.x05.push(atk)
  }
  return out
}

// 공격: 이 타입 기술이 각 (단일) 타입에 주는 배율로 묶음. 1배는 제외
export function attackProfile(type: TypeId, chart: TypeChart): Record<AttackBucket, TypeId[]> {
  const out: Record<AttackBucket, TypeId[]> = { x2: [], x05: [], x0: [] }
  for (const def of TYPE_ORDER) {
    const m = chart[type]?.[def] ?? 1
    if (m === 0) out.x0.push(def)
    else if (m > 1) out.x2.push(def)
    else if (m < 1) out.x05.push(def)
  }
  return out
}

// 표시용 배율 문자열: 1배는 빈칸
export function multLabel(mult: number): string {
  if (mult === 1) return ''
  const named: Record<string, string> = { '0': '0', '0.25': '¼', '0.5': '½', '2': '2', '4': '4' }
  return named[String(mult)] ?? String(Math.round(mult * 100) / 100)
}
