// tests/teamSuggest.test.ts — 사용률 통계로 파티 채우기 (utils/teamSuggest.ts)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { UsageSet, UsageTable } from '../utils/autoSet'
import { slotSpecies, suggestTeam } from '../utils/teamSuggest'
import type { Pokemon } from '../utils/types'

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
const pokemon = load('pokemon') as Record<string, Pokemon>

const set = (usage: number, teammates: Record<string, number> = {}): UsageSet => ({
  count: 1000,
  usage,
  moves: [],
  ability: '',
  items: [],
  teammates,
})
const table = (rows: Record<string, UsageSet>): UsageTable => ({
  format: 'test',
  month: '2026-01',
  battles: 1,
  pokemon: rows,
})
const all = () => true

describe('suggestTeam', () => {
  it('파티가 비어 있으면 채용률 1위부터, 다음은 함께 쓴 비율', () => {
    const t = table({
      garchomp: set(0.5, { pelipper: 0.6, gholdengo: 0.1 }),
      gholdengo: set(0.4),
      pelipper: set(0.2),
    })
    expect(suggestTeam({ table: t, pokemon, members: [], allowed: all, count: 3 })).toEqual([
      'garchomp',
      'pelipper',
      'gholdengo',
    ])
  })

  it('비율이 같으면 채용률이 낮은 쪽이 점수가 높다 (메타 포켓몬 쏠림 완화)', () => {
    const t = table({
      garchomp: set(0.3, { gholdengo: 0.3, pelipper: 0.3 }),
      gholdengo: set(0.5),
      pelipper: set(0.1),
    })
    expect(
      suggestTeam({ table: t, pokemon, members: ['garchomp'], allowed: all, count: 1 }),
    ).toEqual(['pelipper'])
  })

  it('같은 종(메가 폼 포함)은 한 마리만, 출전 불가는 제외, 메가 폼 → 슬롯은 원종', () => {
    const t = table({
      salamence: set(0.1, { garchomp: 0.5, salamencemega: 0.9, gholdengo: 0.2 }),
      salamencemega: set(0.3),
      garchomp: set(0.3),
      gholdengo: set(0.3),
    })
    const picked = suggestTeam({
      table: t,
      pokemon,
      members: ['salamence'],
      allowed: (id) => id !== 'garchomp',
      count: 3,
    })
    expect(picked).toEqual(['gholdengo'])
    expect(slotSpecies(pokemon, 'salamencemega')).toBe('salamence')
  })
})
