// utils/stats.ts — 포켓몬 챔피언스 실능치 계산 (레벨 50, 개체값 31 고정)
//   HP     = 종족값 + 능력포인트 + 75        (종족값 1 = 껍질몬 → 1)
//   그 외  = floor((종족값 + 능력포인트 + 20) × 성격보정)   성격보정 110/100, 90/100
// 능력포인트(SP)는 스탯당 0~32, 합계 66.
// 참고: Showdown data/mods/champions/scripts.ts statModify

import type { BoostKey, Nature, StatKey, StatTable } from './types'
import { STAT_KEYS } from './types'

export const SP_PER_STAT_MAX = 32
export const SP_TOTAL_MAX = 66

export function calcStat(stat: StatKey, base: number, sp: number, nature?: Nature | null): number {
  if (stat === 'hp') return base === 1 ? 1 : base + sp + 75
  const v = base + sp + 20
  if (nature?.plus === stat) return Math.floor((v * 110) / 100)
  if (nature?.minus === stat) return Math.floor((v * 90) / 100)
  return v
}

export function calcStats(base: StatTable, sp: Partial<StatTable>, nature?: Nature | null): StatTable {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, calcStat(k, base[k] || 0, sp[k] || 0, nature)])) as StatTable
}

export const natureMultiplier = (nature: Nature | null | undefined, stat: StatKey) =>
  nature?.plus === stat ? 1.1 : nature?.minus === stat ? 0.9 : 1

// 랭크 배율: +n → (2+n)/2, -n → 2/(2+n)
export const boostMultiplier = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage))
export const applyBoost = (value: number, stage: number) => Math.floor(value * boostMultiplier(stage))
export const clampBoost = (stage: number) => Math.max(-6, Math.min(6, stage))

export const spTotal = (sp: Partial<StatTable>) => STAT_KEYS.reduce((s, k) => s + (sp[k] || 0), 0)
export const isSpValid = (sp: Partial<StatTable>) =>
  spTotal(sp) <= SP_TOTAL_MAX && STAT_KEYS.every((k) => (sp[k] || 0) >= 0 && (sp[k] || 0) <= SP_PER_STAT_MAX)

// 실전 스피드: 랭크 + 도구/상태/특성/순풍 반영
export interface SpeedContext {
  boost?: number
  item?: string
  status?: string
  ability?: string
  weather?: string
  terrain?: string
  tailwind?: boolean
}
export function effectiveSpeed(spe: number, ctx: SpeedContext = {}): number {
  let s = applyBoost(spe, ctx.boost || 0)
  const a = ctx.ability
  if (
    (a === 'swiftswim' && (ctx.weather === 'rain' || ctx.weather === 'heavyrain')) ||
    (a === 'chlorophyll' && (ctx.weather === 'sun' || ctx.weather === 'harshsun')) ||
    (a === 'sandrush' && ctx.weather === 'sand') ||
    (a === 'slushrush' && ctx.weather === 'snow') ||
    (a === 'surgesurfer' && ctx.terrain === 'electric')
  ) s *= 2
  if (a === 'quickfeet' && ctx.status) s = Math.floor(s * 1.5)
  if (ctx.item === 'choicescarf') s = Math.floor(s * 1.5)
  if (ctx.item === 'ironball') s = Math.floor(s * 0.5)
  if (ctx.tailwind) s *= 2
  if (ctx.status === 'par' && a !== 'quickfeet') s = Math.floor(s * 0.5)
  return s
}

// 성격으로 특정 스탯을 올리는 대표 성격 (시나리오 계산용)
export const BOOSTING_NATURE: Record<BoostKey, string> = {
  atk: 'adamant',
  def: 'bold',
  spa: 'modest',
  spd: 'calm',
  spe: 'timid',
}
