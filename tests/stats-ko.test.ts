import { describe, expect, it } from 'vitest'
import { applyBoost, calcStat, effectiveSpeed, isSpValid } from '../utils/stats'
import {
  holdsOnAtFull,
  hpRemainderHint,
  koChance,
  koHitIndex,
  simulateMultiHit,
  statusDamage,
} from '../utils/ko'
import type { Combatant } from '../utils/damage'

const adamant = { id: 'adamant', plus: 'atk', minus: 'spa' } as const

describe('실능치 (챔피언스 공식)', () => {
  it('HP = 종족값 + SP + 75, 껍질몬은 1', () => {
    expect(calcStat('hp', 108, 32)).toBe(215)
    expect(calcStat('hp', 1, 32)).toBe(1)
  })
  it('그 외 = floor((종족값 + SP + 20) × 성격)', () => {
    expect(calcStat('atk', 130, 32, adamant)).toBe(Math.floor((130 + 32 + 20) * 1.1)) // 200
    expect(calcStat('spa', 80, 0, adamant)).toBe(Math.floor(100 * 0.9)) // 90
    expect(calcStat('spe', 102, 0)).toBe(122)
  })
  it('능력 포인트 제한 (스탯당 32, 합계 66)', () => {
    expect(isSpValid({ atk: 32, spe: 32, hp: 2 })).toBe(true)
    expect(isSpValid({ atk: 32, spe: 32, hp: 3 })).toBe(false)
    expect(isSpValid({ atk: 33 })).toBe(false)
  })
  it('랭크 / 실전 스피드', () => {
    expect(applyBoost(100, 2)).toBe(200)
    expect(applyBoost(100, -1)).toBe(66)
    expect(effectiveSpeed(150, { item: 'choicescarf' })).toBe(225)
    expect(effectiveSpeed(150, { status: 'par' })).toBe(75)
    expect(effectiveSpeed(150, { tailwind: true, boost: 1 })).toBe(450)
  })
})

describe('KO 계산', () => {
  const rolls = Array.from({ length: 16 }, (_, i) => 85 + i) // 85..100
  it('확정 1타 / 난수 1타 / 2타', () => {
    expect(koChance(rolls, 85)).toEqual({ hits: 1, guaranteed: true, percent: 100 })
    const c = koChance(rolls, 93)!
    expect(c.hits).toBe(1)
    expect(c.guaranteed).toBe(false)
    expect(c.percent).toBeCloseTo(50)
    expect(koChance(rolls, 150)).toEqual({ hits: 2, guaranteed: true, percent: 100 })
  })
  it('기합의띠/옹골참: 만피에서 1타 KO 불가 → 2타', () => {
    expect(koChance(rolls, 85, 4, true)).toEqual({ hits: 2, guaranteed: true, percent: 100 })
    const mon = (extra: Partial<Combatant>): Combatant => ({
      species: {} as Combatant['species'],
      stats: { hp: 100, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
      ability: '',
      item: '',
      ...extra,
    })
    expect(holdsOnAtFull(mon({}), mon({ item: 'focussash' }))).toBe(true)
    expect(holdsOnAtFull(mon({}), mon({ item: 'focussash', hp: 99 }))).toBe(false)
    expect(holdsOnAtFull(mon({}), mon({ ability: 'sturdy' }))).toBe(true)
    expect(holdsOnAtFull(mon({ ability: 'moldbreaker' }), mon({ ability: 'sturdy' }))).toBe(false)
    expect(holdsOnAtFull(mon({ ability: 'moldbreaker' }), mon({ item: 'focussash' }))).toBe(true)
  })
  it('연속기 KO 시점과 접촉 반격', () => {
    expect(koHitIndex([30, 30, 30, 30], 100)).toBe(4)
    expect(koHitIndex([30, 30], 100)).toBeNull()
    // 공격 측 HP 20, 최대 80, 울퉁불퉁멧(1/6 → 13) → 2타째에 공격 측이 먼저 쓰러짐
    expect(simulateMultiHit([10, 10, 10], 100, 20, 80, 1 / 6)).toEqual({
      outcome: 'attacker',
      atHit: 2,
    })
  })
  it('상태이상 잔여 데미지', () => {
    expect(statusDamage(160, 'psn')).toBe(20)
    expect(statusDamage(160, 'brn')).toBe(10)
    expect(statusDamage(160, 'brn', 'heatproof')).toBe(5)
    expect(statusDamage(160, 'tox', '', 3)).toBe(30)
    expect(statusDamage(160, 'psn', 'magicguard')).toBe(0)
  })
  it('HP 배수 판정은 기존 규칙 유지', () => {
    expect(hpRemainderHint(201, 'regenerator', '', [])).toEqual({ label: '3n', ok: true })
    expect(hpRemainderHint(176, '', 'leftovers', [])).toEqual({ label: '16n', ok: true })
    expect(hpRemainderHint(175, '', '', [])).toEqual({ label: '16n-1', ok: true })
  })
})
