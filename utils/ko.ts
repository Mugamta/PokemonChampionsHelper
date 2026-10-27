// utils/ko.ts — 확정/난수 N타, 연속기 KO 시점, 상태이상 잔여 데미지

import type { Combatant } from './damage'

export interface KoInfo {
  hits: number
  guaranteed: boolean
  percent: number // KO 확률 (%)
}

// 기합의띠 / 옹골참(틀깨기면 무시): HP 가 가득 찬 상태에서는 한 번에 쓰러지지 않고 1 남는다
export const holdsOnAtFull = (attacker: Combatant, defender: Combatant) =>
  (defender.hp ?? defender.stats.hp) >= defender.stats.hp &&
  (defender.item === 'focussash' ||
    (defender.ability === 'sturdy' && attacker.ability !== 'moldbreaker'))

// 16개 난수의 N회 합 분포를 컨볼루션해서 처음으로 KO 확률 > 0 이 되는 N 을 찾는다
// holdOn: 첫 타는 최대 hp−1 (기합의띠/옹골참)
export function koChance(rolls: number[], hp: number, maxHits = 4, holdOn = false): KoInfo | null {
  if (!hp || hp <= 0 || !rolls.length || rolls[rolls.length - 1]! <= 0) return null
  const n = rolls.length
  let dist = new Map<number, number>([[0, 1]])
  for (let hit = 1; hit <= maxHits; hit++) {
    const next = new Map<number, number>()
    for (const [sum, cnt] of dist) {
      for (const roll of rolls) {
        const r = holdOn && hit === 1 ? Math.min(roll, hp - 1) : roll
        next.set(sum + r, (next.get(sum + r) || 0) + cnt)
      }
    }
    dist = next
    const total = n ** hit
    let ko = 0
    for (const [sum, cnt] of dist) if (sum >= hp) ko += cnt
    if (ko > 0) return { hits: hit, guaranteed: ko === total, percent: (ko / total) * 100 }
  }
  return null
}

// 히트별 데미지를 누적해서 몇 번째 히트에 hp 이상이 되는지 (1부터). 끝까지 못 넘기면 null
export function koHitIndex(damages: number[], hp: number): number | null {
  if (hp <= 0) return 1
  let sum = 0
  for (let i = 0; i < damages.length; i++) {
    sum += damages[i]!
    if (sum >= hp) return i + 1
  }
  return null
}

// 대타 뒤의 연속기: 대타가 먼저 받고(대타 HP 를 넘긴 데미지는 버려짐) 대타가 사라진 다음 타부터 본체가 받는다
export function koHitIndexWithSub(damages: number[], sub: number, hp: number): number | null {
  let left = sub
  let sum = 0
  for (let i = 0; i < damages.length; i++) {
    if (left > 0) {
      left -= damages[i]!
      continue
    }
    sum += damages[i]!
    if (sum >= hp) return i + 1
  }
  return null
}

// 접촉 반격(까칠한피부/철가시 1/8, 울퉁불퉁멧 1/6)을 받으며 연속기를 진행할 때 누가 먼저 쓰러지는지
export type TrajectoryOutcome = { outcome: 'defender' | 'attacker' | 'survives'; atHit: number }
export function simulateMultiHit(
  perHit: number[],
  defHp: number,
  atkHp: number,
  atkMaxHp: number,
  punishFraction: number,
): TrajectoryOutcome {
  let def = defHp
  let atk = atkHp
  for (let i = 0; i < perHit.length; i++) {
    def -= perHit[i]!
    if (def <= 0) return { outcome: 'defender', atHit: i + 1 }
    if (punishFraction > 0) {
      atk -= Math.floor(atkMaxHp * punishFraction)
      if (atk <= 0) return { outcome: 'attacker', atHit: i + 1 }
    }
  }
  return { outcome: 'survives', atHit: perHit.length }
}

export const CONTACT_PUNISH: Record<string, number> = {
  roughskin: 1 / 8,
  ironbarbs: 1 / 8,
  rockyhelmet: 1 / 6,
}

// 턴 종료 시 상태이상 데미지 (독 1/8, 화상 1/16(내열 1/32), 맹독 n/16). 매직가드/포이즌힐은 0
export function statusDamage(maxHp: number, status: string, ability = '', toxicTurn = 1): number {
  if (!maxHp || ability === 'magicguard') return 0
  if ((status === 'psn' || status === 'tox') && ability === 'poisonheal') return 0
  if (status === 'psn') return Math.max(1, Math.floor(maxHp / 8))
  if (status === 'brn') return Math.max(1, Math.floor(maxHp / (ability === 'heatproof' ? 32 : 16)))
  // 맹독: 1/16 씩 늘어나 최대 15/16
  if (status === 'tox')
    return Math.max(1, Math.floor((maxHp * Math.min(15, Math.max(1, toxicTurn))) / 16))
  return 0
}

// HP 실능치 배수 조정 판정 (위에서부터 우선). 소수점 아래는 버림이라 n 배수에서 효율이 바뀐다
//   재생력 3n (1/3 회복) → 포이즌힐 8n (1/8 회복) → 대타출동 + 먹다남은음식/검은진흙 16n+1 (대타 4번 + 회복 최대)
//   → 먹다남은음식/검은진흙 16n (1/16 회복) → 자뭉열매 4n (1/4 회복) → 대타출동 4n+1 (1/4 씩 4번 쓰고 1 남김)
//   → 생명의구슬 10n-1 (반동 1/10 최소) → 기본 16n-1 (모래바람·화상 등 1/16 데미지 최소)
export function hpRemainderHint(
  hp: number,
  ability: string,
  item: string,
  moves: string[],
): { label: string; ok: boolean } | null {
  if (!hp) return null
  const sub = moves.includes('substitute')
  const lefties = item === 'leftovers' || item === 'blacksludge'
  if (ability === 'regenerator') return { label: '3n', ok: hp % 3 === 0 }
  if (ability === 'poisonheal') return { label: '8n', ok: hp % 8 === 0 }
  if (sub && lefties) return { label: '16n+1', ok: hp % 16 === 1 }
  if (lefties) return { label: '16n', ok: hp % 16 === 0 }
  if (item === 'sitrusberry') return { label: '4n', ok: hp % 4 === 0 }
  if (sub) return { label: '4n+1', ok: hp % 4 === 1 }
  if (item === 'lifeorb') return { label: '10n-1', ok: (hp + 1) % 10 === 0 }
  return { label: '16n-1', ok: (hp + 1) % 16 === 0 }
}

// ── 실전 KO 확률 (명중·급소·무작위 위력 포함) ─────────────
// 연속기·탈: 한 번 쓸 때의 누적 데미지 분포를 만들고 (attackDistribution) 여러 번 쓴 합으로 KO 확률 (koProbUses)

// 히트 하나의 보통 / 급소 난수 16개
export interface HitRolls {
  normal: number[]
  crit: number[]
}

// 한 번 쓸 때의 누적 데미지 분포 (데미지 → 확률, 합 1). 첫 명중 판정에서 빗나가면 0.
//   counts: 첫 타가 맞았을 때의 타수 분포 (perfTable.hitsUsed), 히트마다 급소·난수는 따로
//   first.holdOn: 만피에서 본체가 처음 맞는 히트는 최대 hp−1 까지 (기합의띠·옹골참) / first.fixed: 첫 히트는 고정 데미지 (탈)
//   first.sub: 대타 HP — 대타가 먼저 받고(넘긴 데미지는 버려짐) 깨진 다음 히트부터 본체. 대타가 남은 상태는 음수 키(−남은 대타 HP)
//   hp 이상은 hp 로 묶는다 (쓰러지면 남은 히트는 의미 없음)
export function attackDistribution(
  hitRolls: HitRolls[],
  counts: { hits: number; p: number }[],
  acc: number,
  critP: number,
  hp: number,
  first: { holdOn?: boolean; fixed?: number; sub?: number } = {},
): Map<number, number> {
  const out = new Map<number, number>()
  const put = (m: Map<number, number>, k: number, p: number) => m.set(k, (m.get(k) || 0) + p)
  const start = first.sub && first.sub > 0 ? -first.sub : 0
  if (acc < 1) put(out, start, 1 - acc)
  let dist = new Map<number, number>([[start, acc]])
  const maxHits = Math.min(hitRolls.length, Math.max(...counts.map((c) => c.hits)))
  let left = counts.reduce((s, c) => s + c.p, 0) // 타수 ≥ h+1 일 확률
  for (let h = 0; h < maxHits && dist.size; h++) {
    const r = hitRolls[h]!
    const outcomes =
      h === 0 && first.fixed != null
        ? [{ dmg: first.fixed, p: 1 }]
        : [
            ...r.normal.map((d) => ({ dmg: d, p: (1 - critP) / r.normal.length })),
            ...r.crit.map((d) => ({ dmg: d, p: critP / r.crit.length })),
          ].filter((o) => o.p > 0)
    const next = new Map<number, number>()
    for (const [sum, p] of dist)
      for (const o of outcomes) {
        if (sum < 0) {
          put(next, Math.min(0, sum + o.dmg), p * o.p) // 대타가 받음 (깨지면 0)
          continue
        }
        let v = Math.min(hp, sum + o.dmg)
        if (sum === 0 && first.holdOn && v >= hp) v = hp - 1
        put(next, v, p * o.p)
      }
    // 여기서 끝나는 몫 (타수 = h+1)
    const end = counts.filter((c) => c.hits === h + 1).reduce((s, c) => s + c.p, 0)
    const frac = left > 0 ? Math.min(1, end / left) : 1
    left -= end
    dist = new Map()
    for (const [v, p] of next) {
      if (v >= hp || h === maxHits - 1 || frac >= 1) put(out, v, p)
      else {
        if (frac > 0) put(out, v, p * frac)
        put(dist, v, p * (1 - frac))
      }
    }
  }
  return out
}

// attackDistribution(first.sub) 결과에서 대타가 깨질 확률(%)
export const subBreakProb = (d: Map<number, number>) => {
  let p = 0
  for (const [v, q] of d) if (v >= 0) p += q
  return Math.min(100, p * 100)
}

// first(첫 사용) 뒤로 later 를 더해 uses 번 안에 hp 이상이 될 확률(%) (대타 뒤 분포는 uses = 1 만)
export function koProbUses(
  first: Map<number, number>,
  later: Map<number, number>,
  hp: number,
  uses: number,
): number {
  if (!hp || hp <= 0) return 100
  let ko = 0
  let dist = new Map<number, number>()
  for (const [v, p] of first) {
    if (v >= hp) ko += p
    else dist.set(v, (dist.get(v) || 0) + p)
  }
  for (let u = 1; u < uses; u++) {
    const next = new Map<number, number>()
    for (const [sum, p] of dist)
      for (const [d, q] of later) {
        const v = sum + d
        if (v >= hp) ko += p * q
        else next.set(v, (next.get(v) || 0) + p * q)
      }
    dist = next
  }
  return Math.min(100, ko * 100)
}
// outcomes: 한 번 공격의 데미지와 확률 (빗나감 = 0, 급소 난수, 보통 난수 …, 합 1). hits 번 안에 쓰러질 확률(%)
// holdOn: 만피에서 첫 타는 1 남김 (기합의띠·옹골참)
export function koProbWithin(
  outcomes: { dmg: number; p: number }[],
  hp: number,
  hits: number,
  holdOn = false,
): number {
  if (!hp || hp <= 0) return 100
  let dist = new Map<number, number>([[0, 1]])
  let ko = 0
  for (let h = 0; h < hits; h++) {
    const next = new Map<number, number>()
    for (const [sum, p] of dist) {
      for (const o of outcomes) {
        let v = sum + o.dmg
        if (holdOn && h === 0 && v >= hp) v = hp - 1
        const q = p * o.p
        if (v >= hp) ko += q
        else next.set(v, (next.get(v) || 0) + q)
      }
    }
    dist = next
  }
  return Math.min(100, ko * 100)
}
