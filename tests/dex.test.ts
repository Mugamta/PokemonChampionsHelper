// tests/dex.test.ts — 포켓몬 도감 계산 (utils/dex.ts)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Combatant, TypeChart } from '../utils/damage'
import { dexBulk, shownAccuracy, typeBulk } from '../utils/dex'
import { calcStats } from '../utils/stats'
import type { Move, Pokemon } from '../utils/types'

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
const pokemon = load('pokemon') as Record<string, Pokemon>
const moves = load('moves') as Record<string, Move>
const chart = (load('types') as { chart: TypeChart }).chart

const mon = (id: string, extra: Partial<Combatant> = {}): Combatant => {
  const species = pokemon[id]!
  return {
    species,
    stats: calcStats(species.stats, {}, null),
    ability: species.abilities[0] ?? '',
    item: '',
    ...extra,
  }
}

describe('도감: 명중', () => {
  it('명중 랭크·복안·의욕·광각렌즈, 필중은 null', () => {
    const se = moves.stoneedge!
    expect(shownAccuracy(se, mon('garchomp'))).toBe(80)
    expect(shownAccuracy(se, mon('garchomp', { boosts: { accuracy: 1 } }))).toBe(100)
    expect(shownAccuracy(se, mon('garchomp', { boosts: { accuracy: -1 } }))).toBe(60)
    expect(shownAccuracy(se, mon('garchomp', { ability: 'hustle' }))).toBe(64)
    expect(shownAccuracy(se, mon('garchomp', { item: 'widelens' }))).toBe(88)
    expect(shownAccuracy(moves.earthquake!, mon('garchomp', { ability: 'noguard' }))).toBeNull()
    expect(shownAccuracy(moves.protect!, mon('garchomp'))).toBeNull()
  })
})

describe('도감: 내구', () => {
  it('방어 랭크 반영', () => {
    const c = mon('garchomp')
    const b0 = dexBulk(c.stats)
    expect(b0.phys).toBe(Math.floor((c.stats.hp * c.stats.def) / 0.411))
    expect(dexBulk(c.stats, { def: 1 }).phys).toBe(
      Math.floor((c.stats.hp * Math.floor(c.stats.def * 1.5)) / 0.411),
    )
  })

  it('타입별 실질 내구: 4배는 1/4, 반감열매는 2배, 특성 무효는 null', () => {
    const c = mon('garchomp')
    const b = dexBulk(c.stats)
    const ice = typeBulk(c, chart, b).find((r) => r.type === 'ice')!
    expect(ice.mult).toBe(4)
    expect(ice.phys).toBe(Math.floor(b.phys / 4))
    const berry = typeBulk({ ...c, item: 'yacheberry' }, chart, b).find((r) => r.type === 'ice')!
    expect(berry.berry).toBe(true)
    expect(berry.phys).toBe(Math.floor(b.phys / 2))
    const elec = typeBulk(c, chart, b).find((r) => r.type === 'electric')!
    expect(elec.mult).toBe(0)
    expect(elec.phys).toBeNull()
    const lev = mon('gengar')
    const ground = typeBulk({ ...lev, ability: 'levitate' }, chart, dexBulk(lev.stats)).find(
      (r) => r.type === 'ground',
    )!
    expect(ground.mult).toBe(0)
  })
})
