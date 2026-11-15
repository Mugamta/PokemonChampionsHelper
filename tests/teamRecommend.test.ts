// tests/teamRecommend.test.ts — 추천 파티 만들기 (utils/teamRecommend.ts)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { UsageSet, UsageTable } from '../utils/autoSet'
import {
  REC_DEFAULTS,
  memberInfo,
  normalizeRecSettings,
  recommendTeam,
  suggestNext,
} from '../utils/teamRecommend'
import type { Pokemon } from '../utils/types'
import type { StatsVs } from '../utils/usageStats'

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

describe('recommendTeam', () => {
  it('핵심은 첫 포켓몬과 함께 가장 자주 쓰인 포켓몬 (대면 자료가 없으면 끝까지 함께 쓴 비율)', () => {
    const t = table({
      garchomp: set(0.3, { pelipper: 0.5, gholdengo: 0.2, primarina: 0.1 }),
      gholdengo: set(0.3),
      pelipper: set(0.3, { primarina: 0.4 }),
      primarina: set(0.3),
    })
    const r = recommendTeam({
      table: t,
      vs: null,
      pokemon,
      members: ['garchomp'],
      allowed: all,
      size: 4,
    })
    expect(r.picks.map((p) => [p.id, p.role])).toEqual([
      ['garchomp', 'lead'],
      ['pelipper', 'core'],
      ['primarina', 'core'], // (0.1 + 0.4) / 2 > 0.2 / 2
      ['gholdengo', 'counter'],
    ])
    expect(r.threats).toEqual([])
    expect(r.picks[1]!.mates).toEqual([['garchomp', 0.5]])
  })

  it('핵심 멤버들에게 두루 강한 상대를 물러나게 하는 포켓몬을 넣는다', () => {
    // 킬라플로르 + 스트린더가 핵심 → 둘 다 잡는 한카리아스가 위협 → 한카리아스를 물러나게 하는 누리레느
    const t = table({
      glimmora: set(0.3, { toxtricity: 0.5, gholdengo: 0.2 }),
      toxtricity: set(0.3, { gholdengo: 0.2 }),
      gholdengo: set(0.3),
      primarina: set(0.3),
      garchomp: set(0.3),
      pelipper: set(0.3),
    })
    const vs: StatsVs = {
      glimmora: [
        ['garchomp', 500, 0.8],
        ['pelipper', 500, 0.6],
        ['primarina', 500, 0.3],
        ['gholdengo', 500, 0.3],
      ],
      toxtricity: [
        ['garchomp', 500, 0.8],
        ['primarina', 500, 0.3],
        ['gholdengo', 500, 0.3],
        ['pelipper', 500, 0.3],
      ],
      garchomp: [
        ['primarina', 500, 0.9],
        ['gholdengo', 500, 0.3],
        ['glimmora', 500, 0.3],
        ['toxtricity', 500, 0.3],
      ],
    }
    const r = recommendTeam({ table: t, vs, pokemon, members: ['glimmora'], allowed: all, size: 4 })
    expect(r.picks.map((p) => [p.id, p.role])).toEqual([
      ['glimmora', 'lead'],
      ['toxtricity', 'core'],
      ['gholdengo', 'core'],
      ['primarina', 'counter'],
    ])
    // 한카리아스(둘 다 잡음)가 펠리퍼(킬라플로르만)보다 위
    expect(r.threats.map((x) => x.id)).toEqual(['garchomp', 'pelipper'])
    expect(r.threats[0]).toMatchObject({
      beats: [
        ['glimmora', 0.8],
        ['toxtricity', 0.8],
      ],
      by: 'primarina',
      byOut: 0.9,
    })
    expect(r.picks[3]!.counters).toEqual([['garchomp', 0.9]])
  })

  it('같은 종·제외한 포켓몬·출전 불가는 고르지 않는다', () => {
    const t = table({
      garchomp: set(0.3, { garchompmegaz: 0.9, pelipper: 0.5, gholdengo: 0.2 }),
      garchompmegaz: set(0.3),
      pelipper: set(0.3),
      gholdengo: set(0.3),
      primarina: set(0.3),
    })
    const r = recommendTeam({
      table: t,
      vs: null,
      pokemon,
      members: ['garchomp'],
      allowed: (s) => s !== 'primarina',
      exclude: ['pelipper'],
    })
    expect(r.picks.map((p) => p.id)).toEqual(['garchomp', 'gholdengo'])
  })

  it('메가 폼은 2마리까지', () => {
    const t = table({
      charizardmegay: set(0.3, { garchompmegaz: 0.5, metagrossmega: 0.4, pelipper: 0.1 }),
      garchompmegaz: set(0.3),
      metagrossmega: set(0.3),
      pelipper: set(0.3),
    })
    const r = recommendTeam({
      table: t,
      vs: null,
      pokemon,
      members: ['charizardmegay'],
      allowed: all,
      size: 3,
    })
    expect(r.picks.map((p) => p.id)).toEqual(['charizardmegay', 'garchompmegaz', 'pelipper'])
  })

  it('실제 최신 통계로 6마리를 만든다', () => {
    const t = load('usage/single-M-C') as UsageTable
    const vs = load(`stats/single-M-C-${t.month}-vs`) as StatsVs
    const r = recommendTeam({ table: t, vs, pokemon, members: ['garchomp'], allowed: all })
    expect(r.picks).toHaveLength(6)
    expect(new Set(r.picks.map((p) => pokemon[p.id]!.num)).size).toBe(6)
    expect(r.threats.length).toBeGreaterThan(0)
  })
})

// 킬라플로르 + 스트린더 / 한카리아스 / 누리레느 예시 (아래 테스트 공용)
const exTable = () =>
  table({
    glimmora: set(0.3, { toxtricity: 0.5, gholdengo: 0.2 }),
    toxtricity: set(0.3, { gholdengo: 0.2 }),
    gholdengo: set(0.3),
    primarina: set(0.3),
    garchomp: set(0.3),
    pelipper: set(0.3),
  })
const exVs: StatsVs = {
  glimmora: [
    ['garchomp', 500, 0.8],
    ['pelipper', 500, 0.6],
    ['primarina', 500, 0.3],
    ['gholdengo', 500, 0.3],
  ],
  toxtricity: [
    ['garchomp', 500, 0.8],
    ['primarina', 500, 0.3],
    ['gholdengo', 500, 0.3],
    ['pelipper', 500, 0.3],
  ],
  garchomp: [
    ['primarina', 500, 0.9],
    ['gholdengo', 500, 0.3],
    ['glimmora', 500, 0.3],
    ['toxtricity', 500, 0.3],
  ],
}

describe('추천 설정', () => {
  it('범위 밖·잘못된 값은 범위 안으로 / 기본값', () => {
    expect(normalizeRecSettings(null)).toEqual(REC_DEFAULTS)
    expect(normalizeRecSettings({ coreMates: 9, threats: 0, counter: 0.66, maxMega: 'x' })).toEqual(
      {
        coreMates: 5,
        threats: 1,
        counter: 0.7,
        maxMega: REC_DEFAULTS.maxMega,
      },
    )
  })

  it('핵심 수 0 이면 첫 포켓몬 다음부터 바로 위협 대비', () => {
    const r = recommendTeam({
      table: exTable(),
      vs: exVs,
      pokemon,
      members: ['glimmora'],
      allowed: all,
      size: 2,
      settings: { ...REC_DEFAULTS, coreMates: 0 },
    })
    // 킬라플로르 혼자 기준 위협 1위는 한카리아스 → 누리레느
    expect(r.picks.map((p) => [p.id, p.role])).toEqual([
      ['glimmora', 'lead'],
      ['primarina', 'counter'],
    ])
  })

  it('여러 마리에서 시작하면 직접 고른 포켓몬으로 보고 핵심 수만큼 더한다', () => {
    const r = recommendTeam({
      table: exTable(),
      vs: exVs,
      pokemon,
      members: ['glimmora', 'toxtricity'],
      allowed: all,
      size: 4,
      settings: { ...REC_DEFAULTS, coreMates: 1 },
    })
    expect(r.picks.map((p) => [p.id, p.role])).toEqual([
      ['glimmora', 'picked'],
      ['toxtricity', 'picked'],
      ['gholdengo', 'core'],
      ['primarina', 'counter'],
    ])
  })
})

describe('suggestNext / memberInfo', () => {
  it('지금 멤버 기준 함께 쓰인 순 · 위협 대비 순', () => {
    const r = suggestNext({
      table: exTable(),
      vs: exVs,
      pokemon,
      members: ['glimmora', 'toxtricity'],
      allowed: all,
    })
    expect(r.mates[0]).toEqual({ id: 'gholdengo', share: 0.2 })
    expect(r.counters.map((x) => x.id)).toEqual(['primarina'])
    expect(r.counters[0]!.counters).toEqual([['garchomp', 0.9]])
    expect(r.threats[0]).toMatchObject({ id: 'garchomp', by: null })
  })

  it('멤버가 없으면 빈 결과', () => {
    const r = suggestNext({ table: exTable(), vs: exVs, pokemon, members: [], allowed: all })
    expect(r).toEqual({ mates: [], counters: [], threats: [] })
  })

  it('포켓몬 하나의 같이 쓰인 포켓몬 · 불리한 상대 · 그 상대에게 강한 포켓몬', () => {
    const r = memberInfo({ table: exTable(), vs: exVs, id: 'glimmora' })
    expect(r.mates).toEqual([
      ['toxtricity', 0.5],
      ['gholdengo', 0.2],
    ])
    // 킬라플로르 평균 0.5 → 한카리아스 0.8, 펠리퍼 0.6
    expect(r.threats.map((x) => [x.id, x.out])).toEqual([
      ['garchomp', 0.8],
      ['pelipper', 0.6],
    ])
    // 한카리아스에게 강한 포켓몬 (자기 자신은 뺌)
    expect(r.threats[0]!.answers[0]).toEqual(['primarina', 0.9])
    expect(r.threats[0]!.answers.map((a) => a[0])).not.toContain('glimmora')
  })
})
