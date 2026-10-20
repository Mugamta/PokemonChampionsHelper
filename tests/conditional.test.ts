// tests/conditional.test.ts — 조건부 기술 / 명중·급소 / 실전 KO 확률 (utils/damage.ts, utils/accuracy.ts, utils/ko.ts)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { critChance, hitChance } from '../utils/accuracy'
import { calcDamage, hitInfo, type Combatant } from '../utils/damage'
import { koProbWithin } from '../utils/ko'
import { calcStats } from '../utils/stats'
import type { GameData } from '../utils/types'

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
const data = { pokemon: load('pokemon'), moves: load('moves'), types: load('types') } as Pick<
  GameData,
  'pokemon' | 'moves' | 'types'
>
const chart = data.types.chart
const mon = (species: string, ability = '', item = ''): Combatant => {
  const p = data.pokemon[species]!
  return { species: p, stats: calcStats(p.stats, { atk: 32, spa: 32 }), ability, item }
}
const mv = (id: string) => data.moves[id]!
const atk = mon('kingambit', 'defiant')
const def = mon('garchomp', 'roughskin')
const max = (id: string, opts = {}, a = atk, d = def) =>
  calcDamage(mv(id), a, d, chart, {}, opts).max

describe('조건부 기술', () => {
  it('승부굳히기·분함의발구르기·분풀이·돌림노래·변덕레이저: 조건이면 위력 2배', () => {
    for (const [id, key] of [
      ['assurance', 'targetDamagedThisTurn'],
      ['lashout', 'statsLoweredThisTurn'],
      ['stompingtantrum', 'lastMoveFailed'],
    ] as const) {
      const one = max(id)
      const two = max(id, { [key]: true })
      expect(two / one).toBeGreaterThan(1.9)
    }
    const ty = mon('typhlosion')
    expect(max('round', { roundBoost: true }, ty) / max('round', {}, ty)).toBeGreaterThan(1.9)
    const dur = mon('archaludon')
    expect(
      max('ficklebeam', { fickleDouble: true }, dur) / max('ficklebeam', {}, dur),
    ).toBeGreaterThan(1.9)
  })
  it('토해내기 = 비축 × 100 (비축 없으면 0)', () => {
    const sw = mon('swalot')
    expect(max('spitup', {}, sw)).toBe(0)
    expect(max('spitup', { stockpile: 2 }, sw)).toBeGreaterThan(max('spitup', { stockpile: 1 }, sw))
  })
  it('집단구타: 같은 편 한 마리당 1타, 위력 5 + 공격 종족값/10', () => {
    const info = hitInfo(mv('beatup'), atk, false, { beatUp: [135, 130, 50] })
    expect(info).toEqual({ min: 3, max: 3, hitPowers: [18, 18, 10] })
  })
  it('카운터·미러코트·메탈버스트: 받은 데미지 × 2 / × 2 / × 1.5', () => {
    const taken = { physical: 60, special: 40, last: 40 }
    const ag = mon('aggron')
    expect(max('counter', { damageTaken: taken }, ag)).toBe(120)
    expect(max('mirrorcoat', { damageTaken: taken }, ag)).toBe(80)
    expect(max('metalburst', { damageTaken: taken }, ag)).toBe(60)
    expect(max('counter', {}, ag)).toBe(0)
  })
})

describe('명중·급소', () => {
  const stoneedge = mv('stoneedge')
  it('명중: 기술 × 특성 × 도구 × 날씨', () => {
    expect(hitChance(stoneedge, atk, def)).toBeCloseTo(0.8)
    expect(hitChance(stoneedge, mon('kingambit', 'noguard'), def)).toBe(1)
    expect(hitChance(stoneedge, { ...atk, item: 'widelens' }, def)).toBeCloseTo(0.88)
    expect(
      hitChance(stoneedge, atk, { ...def, ability: 'sandveil' }, { weather: 'sand' }),
    ).toBeCloseTo(0.64)
    expect(hitChance(mv('thunder'), atk, def, { weather: 'rain' })).toBe(1)
    expect(hitChance(mv('thunder'), atk, def, { weather: 'sun' })).toBeCloseTo(0.5)
    expect(hitChance(mv('earthquake'), atk, def)).toBe(1)
  })
  it('명중·회피 랭크: (3+n)/3, 천진·날카로운눈', () => {
    expect(hitChance(stoneedge, { ...atk, boosts: { accuracy: 1 } as never }, def)).toBe(1) // 1.07 → 최대 100%
    expect(hitChance(stoneedge, atk, { ...def, boosts: { evasion: 2 } as never })).toBeCloseTo(
      0.8 * (3 / 5),
    )
    expect(
      hitChance(
        stoneedge,
        { ...atk, ability: 'keeneye' },
        { ...def, boosts: { evasion: 2 } as never },
      ),
    ).toBeCloseTo(0.8)
    expect(
      hitChance(
        stoneedge,
        { ...atk, boosts: { accuracy: 2 } as never },
        { ...def, ability: 'unaware' },
      ),
    ).toBeCloseTo(0.8)
    // 필중 기술(제비반환)은 랭크와 무관. 명중 100 기술(지진)은 회피 랭크 영향을 받음
    expect(hitChance(mv('aerialace'), atk, { ...def, boosts: { evasion: 6 } as never })).toBe(1)
  })
  it('급소: 단계 0 = 1/24, 급소율 높은 기술 1/8, 기충전 +2 → 확정', () => {
    expect(critChance(mv('earthquake'), atk, def)).toBeCloseTo(1 / 24)
    expect(critChance(stoneedge, atk, def)).toBeCloseTo(1 / 8)
    expect(critChance(stoneedge, atk, def, { focusEnergy: true })).toBe(1)
    expect(critChance(stoneedge, { ...atk, item: 'scopelens' }, def)).toBeCloseTo(1 / 2)
    expect(critChance(stoneedge, atk, { ...def, ability: 'shellarmor' })).toBe(0)
    expect(critChance(mv('frostbreath'), atk, def)).toBe(1)
  })
  it('실전 KO 확률: 빗나감을 섞으면 확정 1타도 명중률만큼', () => {
    const outcomes = [
      { dmg: 0, p: 0.2 },
      { dmg: 200, p: 0.8 },
    ]
    expect(koProbWithin(outcomes, 150, 1)).toBeCloseTo(80)
    expect(koProbWithin(outcomes, 150, 2)).toBeCloseTo(96)
    expect(koProbWithin([{ dmg: 200, p: 1 }], 150, 1, true)).toBe(0) // 기합의띠
  })
})
