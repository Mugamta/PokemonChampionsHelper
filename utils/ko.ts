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
