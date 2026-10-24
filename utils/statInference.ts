// utils/statInference.ts — 주고받은 데미지로 상대 배분(내구 / 공격) 범위 좁히기
//
// 미지수
//   내구: HP SP(0~32) × 방어(또는 특방) SP(0~32) × 그 능력치의 성격 효과(하락/무보정/보정)
//   공격: 공격(또는 특공) SP(0~32) × 성격 효과 × 도구 후보(없음/구애/생명의구슬/달인의띠/타입 강화 도구)
// 관측 하나(내가 준 % / 내가 받은 HP)마다 "그 데미지가 나올 수 있는 조합"만 남긴다 (격자 = Uint8Array).
// 관측이 쌓일수록 범위가 좁아지고, 모든 조합이 지워지면 "입력과 맞는 배분 없음"(도구·특성·급소 확인).
//
// 격자를 만드는 쪽(데미지 계산)은 composables/useOppEstimate.ts, 여기는 판정·요약만 (순수 함수).

import { dealtHpRange, hpRangeOfPct } from './hpDisplay'
import { calcStat } from './stats'
import type { BoostKey, Nature, StatTable } from './types'

export const SP_COUNT = 33 // SP 0~32
export type NatEffect = -1 | 0 | 1
export const NAT_EFFECTS: NatEffect[] = [-1, 0, 1]
// 받은 데미지 허용 오차(HP). 내 HP 는 정확히 보이지만 계산식이 게임과 1 어긋나는 경우까지 "불가능"이 되지 않게
export const TAKEN_TOLERANCE = 1

// 능력치 하나에 대한 성격 효과를 나타내는 대표 성격 (실능치 계산용)
export function natureFor(stat: BoostKey, n: NatEffect): Nature | null {
  if (n === 0) return null
  const other: BoostKey = stat === 'atk' ? 'spa' : 'atk'
  return n === 1 ? { id: '+', plus: stat, minus: other } : { id: '-', plus: other, minus: stat }
}

// ── 관측 판정 ─────────────
// 내가 준 데미지(%): 맞기 전 화면 % (beforePct) 에서 amountPct 만큼 깎였다 (화면 % 는 버림 표시 → utils/hpDisplay).
// 그 두 화면 % 로 가능한 실제 데미지 범위 안에 난수가 하나라도 있으면 가능. 쓰러뜨렸으면 최대 난수가 남은 HP 이상
export function dealtMatches(
  rolls: number[],
  maxHp: number,
  beforePct: number,
  amountPct: number,
  ko: boolean,
) {
  if (!maxHp) return false
  if (ko) return rolls[rolls.length - 1]! >= hpRangeOfPct(beforePct, maxHp).min
  const r = dealtHpRange(beforePct, beforePct - amountPct, maxHp)
  return rolls.some((v) => v >= r.min && v <= r.max)
}
// 내가 받은 데미지(HP): 난수 중 하나가 ±허용오차 안이면 가능. 쓰러졌으면 "그만큼 이상"만 확인
export function takenMatches(rolls: number[], amount: number, ko: boolean) {
  if (ko) return rolls[rolls.length - 1]! >= amount - TAKEN_TOLERANCE
  return rolls.some((r) => Math.abs(r - amount) <= TAKEN_TOLERANCE)
}

// ── 흡수기 회복량 ─────────────
// 흡수기 회복량: 잃은 HP × ratio (반올림, 최소 1), 큰뿌리 1.3배 (5324/4096)
export const drainAmount = (lost: number, ratio: number, bigRoot: boolean) => {
  const h = Math.max(1, Math.round(lost * ratio))
  return bigRoot ? Math.floor((h * 5324 + 2047) / 4096) : h
}
// 회복량 heal 이 나오는 잃은 HP 범위 (회복량은 잃은 HP 에 대해 단조 증가 → 연속 구간). 없으면 null
export function drainLostRange(
  heal: number,
  ratio: number,
  bigRoot: boolean,
  limit = 2000,
): [number, number] | null {
  let lo = 0
  let hi = 0
  for (let l = 1; l <= limit; l++) {
    const h = drainAmount(l, ratio, bigRoot)
    if (h === heal) {
      if (!lo) lo = l
      hi = l
    } else if (h > heal) break
  }
  return lo ? [lo, hi] : null
}
// 흡수 관측: 상대가 잃은 실수치 HP 가 lost 범위 안일 수 있는지 (최대 HP maxHp 인 배분 기준)
//   쓰러뜨림: 잃은 HP = 맞기 전 남은 HP → 화면 % (hpPct) 와 맞고, 최대 난수로 쓰러뜨릴 수 있어야 함
//   아니면: 난수 중 하나가 그 범위 안 (± TAKEN_TOLERANCE)
export function drainMatches(
  rolls: number[],
  maxHp: number,
  hpPct: number,
  lost: [number, number],
  ko: boolean,
) {
  if (!maxHp) return false
  if (!ko)
    return rolls.some((r) => r >= lost[0] - TAKEN_TOLERANCE && r <= lost[1] + TAKEN_TOLERANCE)
  // 화면 p% = 실제 [p%, (p+1)%) (버림 표시)
  const shown = hpRangeOfPct(hpPct, maxHp)
  const lo = Math.max(lost[0], shown.min, 1)
  const hi = Math.min(lost[1], shown.max)
  return lo <= hi && rolls[rolls.length - 1]! >= lo - TAKEN_TOLERANCE
}

// ── 내구 ─────────────
// 격자 인덱스: (HP SP, 방어 SP, 성격 효과)
export const bulkCell = (hp: number, d: number, n: NatEffect) => (hp * SP_COUNT + d) * 3 + (n + 1)
export const BULK_CELLS = SP_COUNT * SP_COUNT * 3

export interface Range {
  min: number
  max: number
}
const widen = (r: Range | null, v: number): Range =>
  r ? { min: Math.min(r.min, v), max: Math.max(r.max, v) } : { min: v, max: v }

export interface BulkSummary {
  feasible: boolean // 관측과 맞는 배분이 하나라도 있는지
  hp: Range | null // HP 실능치
  def: Range | null // 방어 실능치 (물리 관측이 있을 때)
  spd: Range | null // 특방 실능치 (특수 관측이 있을 때)
  physIndex: Range | null // 물리 내구 지수 H×B/0.411
  specIndex: Range | null // 특수 내구 지수 H×D/0.411
}
const bulkIndex = (h: number, d: number) => Math.floor((h * d) / 0.411)

// 관측·SP 합 상한과 맞는 내구 조합을 하나씩 (which = 그 조합이 정한 능력치, x = 그 능력치 SP, n = 성격 효과).
// 방어 쪽 조합은 같은 HP 에서 특방 쪽에 맞는 조합이 있어야 하고 그 반대도 마찬가지.
// hpMask: HP SP 별 가능 여부 (턴 끝 HP 관측 — useOppEstimate.hpMask, null = 모두 가능)
function eachBulk(
  def: Uint8Array | null,
  spd: Uint8Array | null,
  budget: number,
  hpMask: Uint8Array | null,
  visit: (which: 'def' | 'spd', h: number, x: number, n: NatEffect) => void,
) {
  const ok = (g: Uint8Array | null, h: number, x: number, n: NatEffect) =>
    !g || !!g[bulkCell(h, x, n)]
  // 방어·특방이 둘 다 보정(또는 둘 다 하락)인 성격은 없다
  const compat = (a: NatEffect, b: NatEffect) => !(a !== 0 && a === b)
  for (let h = 0; h < SP_COUNT; h++) {
    if (hpMask && !hpMask[h]) continue
    // 이 HP 에서 성격 효과별 가장 작은 SP (상대 쪽 격자)
    const minSp = (g: Uint8Array | null, n: NatEffect) => {
      for (let x = 0; x < SP_COUNT; x++) if (ok(g, h, x, n)) return x
      return Infinity
    }
    const minDef = NAT_EFFECTS.map((n) => minSp(def, n))
    const minSpd = NAT_EFFECTS.map((n) => minSp(spd, n))
    for (const nd of NAT_EFFECTS)
      for (let d = 0; d < SP_COUNT; d++)
        if (
          ok(def, h, d, nd) &&
          NAT_EFFECTS.some((ns) => compat(nd, ns) && h + d + minSpd[ns + 1]! <= budget)
        )
          visit('def', h, d, nd)
    for (const ns of NAT_EFFECTS)
      for (let x = 0; x < SP_COUNT; x++)
        if (
          ok(spd, h, x, ns) &&
          NAT_EFFECTS.some((nd) => compat(nd, ns) && h + x + minDef[nd + 1]! <= budget)
        )
          visit('spd', h, x, ns)
  }
}

// def / spd: 각 격자 (null = 관측 없음 → 모든 조합 가능). budget: HP+방어+특방 SP 합의 상한 (66 − 다른 능력치에 확실히 쓴 SP)
// hpMask: HP SP 별 가능 여부 (null = 모두)
export function bulkSummary(
  def: Uint8Array | null,
  spd: Uint8Array | null,
  base: StatTable,
  budget: number,
  hpMask: Uint8Array | null = null,
): BulkSummary {
  const out: BulkSummary = {
    feasible: false,
    hp: null,
    def: null,
    spd: null,
    physIndex: null,
    specIndex: null,
  }
  eachBulk(def, spd, budget, hpMask, (which, h, x, n) => {
    const hpStat = calcStat('hp', base.hp, h)
    if (which === 'def') {
      out.feasible = true
      out.hp = widen(out.hp, hpStat)
    }
    if (!(which === 'def' ? def : spd)) return
    const v = calcStat(which, base[which], x, natureFor(which, n))
    out[which] = widen(out[which], v)
    const idx = which === 'def' ? 'physIndex' : 'specIndex'
    out[idx] = widen(out[idx], bulkIndex(hpStat, v))
  })
  return out
}

// ── 배틀 계산용 내구 범위 ─────────────
// 상대 배분은 관측으로만 좁힌다 → 데미지는 남은 조합의 양 끝(가장 약한 / 가장 단단한 내구)으로 계산해 범위로 보여 준다.
// 실능치는 base(지금 폼의 종족값) 기준. 격자가 없으면(관측 없음) SP 0 하락 성격 ~ SP 32 보정 성격 전부
export interface BulkPoint {
  hp: number
  stat: number
}
export interface BulkBounds {
  hp: Range
  def: Range
  spd: Range
  // H×B(D) 가 가장 작은 / 큰 조합
  frail: Record<'def' | 'spd', BulkPoint>
  tank: Record<'def' | 'spd', BulkPoint>
}
export function bulkBounds(
  def: Uint8Array | null,
  spd: Uint8Array | null,
  base: StatTable,
  budget: number,
  hpMask: Uint8Array | null = null,
): BulkBounds | null {
  let hp: Range | null = null
  const range: Record<'def' | 'spd', Range | null> = { def: null, spd: null }
  const frail: Partial<Record<'def' | 'spd', BulkPoint & { p: number }>> = {}
  const tank: Partial<Record<'def' | 'spd', BulkPoint & { p: number }>> = {}
  eachBulk(def, spd, budget, hpMask, (which, h, x, n) => {
    const hpStat = calcStat('hp', base.hp, h)
    const v = calcStat(which, base[which], x, natureFor(which, n))
    if (which === 'def') hp = widen(hp, hpStat)
    range[which] = widen(range[which], v)
    const p = hpStat * v
    const f = frail[which]
    if (!f || p < f.p) frail[which] = { hp: hpStat, stat: v, p }
    const k = tank[which]
    if (!k || p > k.p) tank[which] = { hp: hpStat, stat: v, p }
  })
  if (!hp || !range.def || !range.spd || !frail.def || !frail.spd || !tank.def || !tank.spd)
    return null
  const pt = (x: BulkPoint & { p: number }): BulkPoint => ({ hp: x.hp, stat: x.stat })
  return {
    hp,
    def: range.def,
    spd: range.spd,
    frail: { def: pt(frail.def), spd: pt(frail.spd) },
    tank: { def: pt(tank.def), spd: pt(tank.spd) },
  }
}
// 능력치 하나의 전체 범위 (관측 없음): SP 0 하락 성격 ~ SP 32 보정 성격
export const fullStatRange = (stat: BoostKey, base: number): Range => ({
  min: calcStat(stat, base, 0, natureFor(stat, -1)),
  max: calcStat(stat, base, SP_COUNT - 1, natureFor(stat, 1)),
})

// 실능치 범위 → 그 안에 들어가는 능력 포인트(SP) 범위 (성격 효과는 모르므로 하락/무보정/보정 모두. HP 는 성격 무관)
export function spRangeOf(stat: 'hp' | BoostKey, base: number, r: Range): Range | null {
  let out: Range | null = null
  for (const n of stat === 'hp' ? [0 as NatEffect] : NAT_EFFECTS)
    for (let sp = 0; sp < SP_COUNT; sp++) {
      const v =
        stat === 'hp' ? calcStat('hp', base, sp) : calcStat(stat, base, sp, natureFor(stat, n))
      if (v >= r.min && v <= r.max) out = widen(out, sp)
    }
  return out
}

// ── 공격 ─────────────
// 격자 인덱스: (도구 후보, 공격 SP, 성격 효과)
export const attackCell = (item: number, a: number, n: NatEffect) =>
  (item * SP_COUNT + a) * 3 + (n + 1)
export const attackCells = (items: number) => items * SP_COUNT * 3

export interface AttackSummary {
  feasible: boolean
  stat: Range | null // 공격(특공) 실능치
  effective: Range | null // 도구 배율까지 곱한 실효 공격 (대략)
  items: number[] // 남은 도구 후보 (인덱스)
  minSp: number // 확실히 쓴 SP (다른 능력치 배분 상한 계산용)
}
// itemMult: 도구 후보별 이 분류(물리/특수) 기술에 대한 대략적 배율 (표시용)
export function attackSummary(
  grid: Uint8Array,
  itemCount: number,
  stat: 'atk' | 'spa',
  baseStat: number,
  itemMult: (item: number) => number,
  allowedItems?: (item: number) => boolean,
): AttackSummary {
  const out: AttackSummary = {
    feasible: false,
    stat: null,
    effective: null,
    items: [],
    minSp: SP_COUNT,
  }
  for (let i = 0; i < itemCount; i++) {
    if (allowedItems && !allowedItems(i)) continue
    let any = false
    for (const n of NAT_EFFECTS) {
      for (let a = 0; a < SP_COUNT; a++) {
        if (!grid[attackCell(i, a, n)]) continue
        any = true
        const v = calcStat(stat, baseStat, a, natureFor(stat, n))
        out.stat = widen(out.stat, v)
        out.effective = widen(out.effective, Math.floor(v * itemMult(i)))
        out.minSp = Math.min(out.minSp, a)
      }
    }
    if (any) out.items.push(i)
  }
  out.feasible = out.items.length > 0
  if (!out.feasible) out.minSp = 0
  return out
}
