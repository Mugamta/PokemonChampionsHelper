// utils/statInference.ts — 주고받은 데미지로 상대 배분(내구 / 공격) 범위 좁히기
//
// 미지수
//   내구: HP SP(0~32) × 방어(또는 특방) SP(0~32) × 그 능력치의 성격 효과(하락/무보정/보정)
//   공격: 공격(또는 특공) SP(0~32) × 성격 효과 × 도구 후보(없음/구애/생명의구슬/달인의띠/타입 강화 도구)
// 관측 하나(내가 준 % / 내가 받은 HP)마다 "그 데미지가 나올 수 있는 조합"만 남긴다 (격자 = Uint8Array).
// 관측이 쌓일수록 범위가 좁아지고, 모든 조합이 지워지면 "입력과 맞는 배분 없음"(도구·특성·급소 확인).
//
// 격자를 만드는 쪽(데미지 계산)은 composables/useOppEstimate.ts, 여기는 판정·요약만 (순수 함수).

import { calcStat } from './stats'
import type { BoostKey, Nature, StatTable } from './types'

export const SP_COUNT = 33 // SP 0~32
export type NatEffect = -1 | 0 | 1
export const NAT_EFFECTS: NatEffect[] = [-1, 0, 1]
// 내가 준 데미지 % 는 화면의 HP % 두 개(전/후)의 차이라 반올림 오차가 있다 → ±1%p 허용
export const DEALT_TOLERANCE = 1
// 받은 데미지 허용 오차(HP). 내 HP 는 정확히 보이지만 계산식이 게임과 1 어긋나는 경우까지 "불가능"이 되지 않게
export const TAKEN_TOLERANCE = 1

// 능력치 하나에 대한 성격 효과를 나타내는 대표 성격 (실능치 계산용)
export function natureFor(stat: BoostKey, n: NatEffect): Nature | null {
  if (n === 0) return null
  const other: BoostKey = stat === 'atk' ? 'spa' : 'atk'
  return n === 1 ? { id: '+', plus: stat, minus: other } : { id: '-', plus: other, minus: stat }
}

// ── 관측 판정 ─────────────
// 내가 준 데미지(%): 난수 중 하나가 ±허용오차 안이면 가능. 쓰러뜨렸으면 "그만큼 이상"만 확인
export function dealtMatches(rolls: number[], maxHp: number, amountPct: number, ko: boolean) {
  if (!maxHp) return false
  const pct = (r: number) => (r / maxHp) * 100
  if (ko) return pct(rolls[rolls.length - 1]!) >= amountPct - DEALT_TOLERANCE
  return rolls.some((r) => Math.abs(pct(r) - amountPct) <= DEALT_TOLERANCE)
}
// 내가 받은 데미지(HP): 난수 중 하나가 ±허용오차 안이면 가능. 쓰러졌으면 "그만큼 이상"만 확인
export function takenMatches(rolls: number[], amount: number, ko: boolean) {
  if (ko) return rolls[rolls.length - 1]! >= amount - TAKEN_TOLERANCE
  return rolls.some((r) => Math.abs(r - amount) <= TAKEN_TOLERANCE)
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

// def / spd: 각 격자 (null = 관측 없음 → 모든 조합 가능). budget: HP+방어+특방 SP 합의 상한 (66 − 다른 능력치에 확실히 쓴 SP)
export function bulkSummary(
  def: Uint8Array | null,
  spd: Uint8Array | null,
  base: StatTable,
  budget: number,
): BulkSummary {
  const out: BulkSummary = {
    feasible: false,
    hp: null,
    def: null,
    spd: null,
    physIndex: null,
    specIndex: null,
  }
  const ok = (g: Uint8Array | null, h: number, x: number, n: NatEffect) =>
    !g || !!g[bulkCell(h, x, n)]
  // 방어·특방이 둘 다 보정(또는 둘 다 하락)인 성격은 없다
  const compat = (a: NatEffect, b: NatEffect) => !(a !== 0 && a === b)
  for (let h = 0; h < SP_COUNT; h++) {
    // 이 HP 에서 성격 효과별 가장 작은 SP (상대 쪽 격자)
    const minSp = (g: Uint8Array | null, n: NatEffect) => {
      for (let x = 0; x < SP_COUNT; x++) if (ok(g, h, x, n)) return x
      return Infinity
    }
    const minDef = NAT_EFFECTS.map((n) => minSp(def, n))
    const minSpd = NAT_EFFECTS.map((n) => minSp(spd, n))
    const hpStat = calcStat('hp', base.hp, h)
    let hpOk = false
    for (const nd of NAT_EFFECTS) {
      for (let d = 0; d < SP_COUNT; d++) {
        if (!ok(def, h, d, nd)) continue
        // 같은 HP 에서 특방 쪽에 맞는 조합이 있어야 함
        const pair = NAT_EFFECTS.some((ns) => compat(nd, ns) && h + d + minSpd[ns + 1]! <= budget)
        if (!pair) continue
        hpOk = true
        if (def) {
          const v = calcStat('def', base.def, d, natureFor('def', nd))
          out.def = widen(out.def, v)
          out.physIndex = widen(out.physIndex, bulkIndex(hpStat, v))
        }
      }
    }
    for (const ns of NAT_EFFECTS) {
      for (let s = 0; s < SP_COUNT; s++) {
        if (!ok(spd, h, s, ns)) continue
        const pair = NAT_EFFECTS.some((nd) => compat(nd, ns) && h + s + minDef[nd + 1]! <= budget)
        if (!pair) continue
        if (spd) {
          const v = calcStat('spd', base.spd, s, natureFor('spd', ns))
          out.spd = widen(out.spd, v)
          out.specIndex = widen(out.specIndex, bulkIndex(hpStat, v))
        }
      }
    }
    if (hpOk) {
      out.feasible = true
      out.hp = widen(out.hp, hpStat)
    }
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
