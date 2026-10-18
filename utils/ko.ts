// utils/ko.ts — 확정/난수 N타, 연속기 KO 시점, 상태이상 잔여 데미지

export interface KoInfo {
  hits: number
  guaranteed: boolean
  percent: number // KO 확률 (%)
}

// 16개 난수의 N회 합 분포를 컨볼루션해서 처음으로 KO 확률 > 0 이 되는 N 을 찾는다
export function koChance(rolls: number[], hp: number, maxHits = 4): KoInfo | null {
  if (!hp || hp <= 0 || !rolls.length || rolls[rolls.length - 1]! <= 0) return null
  const n = rolls.length
  let dist = new Map<number, number>([[0, 1]])
  for (let hit = 1; hit <= maxHits; hit++) {
    const next = new Map<number, number>()
    for (const [sum, cnt] of dist) {
      for (const r of rolls) next.set(sum + r, (next.get(sum + r) || 0) + cnt)
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

// 접촉 반격(까칠한피부/철가시 1/8, 울퉁불퉁멧 1/6)을 받으며 연속기를 진행할 때 누가 먼저 쓰러지는지
export type TrajectoryOutcome = { outcome: 'defender' | 'attacker' | 'survives'; atHit: number }
export function simulateMultiHit(
  perHit: number[], defHp: number, atkHp: number, atkMaxHp: number, punishFraction: number,
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

export const CONTACT_PUNISH: Record<string, number> = { roughskin: 1 / 8, ironbarbs: 1 / 8, rockyhelmet: 1 / 6 }

// 턴 종료 시 상태이상 데미지 (독 1/8, 화상 1/16(내열 1/32), 맹독 n/16). 매직가드/포이즌힐은 0
export function statusDamage(maxHp: number, status: string, ability = '', toxicTurn = 1): number {
  if (!maxHp || ability === 'magicguard') return 0
  if ((status === 'psn' || status === 'tox') && ability === 'poisonheal') return 0
  if (status === 'psn') return Math.max(1, Math.floor(maxHp / 8))
  if (status === 'brn') return Math.max(1, Math.floor(maxHp / (ability === 'heatproof' ? 32 : 16)))
  if (status === 'tox') return Math.max(1, Math.floor((maxHp * Math.max(1, toxicTurn)) / 16))
  return 0
}

// HP 실능치 배수 조정 판정 (기존 partySelect checkHpCondition 규칙 그대로, 위에서부터 우선)
//   재생력 3n → 포이즌힐 8n+1 → 먹다남은음식/검은진흙 16n → 대타출동 16n+1 → 씨뿌리기 8n-1 → 기본 16n-1
export function hpRemainderHint(hp: number, ability: string, item: string, moves: string[]): { label: string; ok: boolean } | null {
  if (!hp) return null
  if (ability === 'regenerator') return { label: '3n', ok: hp % 3 === 0 }
  if (ability === 'poisonheal') return { label: '8n+1', ok: hp % 8 === 1 }
  if (item === 'leftovers' || item === 'blacksludge') return { label: '16n', ok: hp % 16 === 0 }
  if (moves.includes('substitute')) return { label: '16n+1', ok: hp % 16 === 1 }
  if (moves.includes('leechseed')) return { label: '8n-1', ok: (hp + 1) % 8 === 0 }
  return { label: '16n-1', ok: (hp + 1) % 16 === 0 }
}
