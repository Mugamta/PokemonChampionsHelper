// tests/usageStats.test.ts — 시즌별·월별 사용률 정리 (utils/usageStats.ts, public/data/stats/)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  monthTrend,
  parseSpread,
  periodsOf,
  previousPeriod,
  rankChange,
  statsFile,
  type StatsIndex,
  type StatsMeta,
  type StatsTable,
  type StatsTrend,
} from '../utils/usageStats'

const load = <T>(f: string): T =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'))

const m = (reg: string, period: string): StatsMeta => ({
  reg,
  period,
  battles: 1,
  months: period === 'season' ? [] : [period],
})
const LIST = [
  m('M-A', 'season'),
  m('M-B', 'season'),
  m('M-A', '2026-05'),
  m('M-A', '2026-06'),
  m('M-B', '2026-06'),
  m('M-B', '2026-07'),
]

describe('비교 기간', () => {
  it('시즌은 직전 시즌, 첫 시즌은 없음', () => {
    expect(previousPeriod(LIST, LIST[1]!)).toEqual(LIST[0])
    expect(previousPeriod(LIST, LIST[0]!)).toBeUndefined()
  })
  it('달은 같은 레귤레이션의 직전 달, 첫 달이면 직전 시즌', () => {
    expect(previousPeriod(LIST, LIST[3]!)).toEqual(LIST[2])
    expect(previousPeriod(LIST, LIST[5]!)).toEqual(LIST[4])
    expect(previousPeriod(LIST, LIST[4]!)).toEqual(LIST[0])
    expect(previousPeriod(LIST, LIST[2]!)).toBeUndefined()
  })
})

describe('순위 변동 / 추이', () => {
  const trend: StatsTrend = { a: [[3, 0.2], [1, 0.4], 0, [2, 0.3], 0, 0] }
  it('비교 기간 순위 - 지금 순위, 없으면 new, 비교 기간이 없으면 null', () => {
    expect(rankChange(trend, LIST, LIST[0], 'a', 1)).toBe(2)
    expect(rankChange(trend, LIST, LIST[3], 'a', 5)).toBe(-3)
    expect(rankChange(trend, LIST, LIST[2], 'a', 1)).toBe('new')
    expect(rankChange(trend, LIST, undefined, 'a', 1)).toBeNull()
  })
  it('월별 추이는 달만, 없던 달은 0', () => {
    expect(monthTrend(trend, LIST, 'a').map((x) => [x.period, x.rank])).toEqual([
      ['2026-05', 0],
      ['2026-06', 2],
      ['2026-06', 0],
      ['2026-07', 0],
    ])
  })
  it('배분 문자열', () => {
    expect(parseSpread('adamant:2/32/0/0/0/32')).toEqual({
      nature: 'adamant',
      sp: [2, 32, 0, 0, 0, 32],
    })
  })
})

describe('생성된 데이터 (public/data/stats)', () => {
  const index = load<StatsIndex>('stats/index.json')
  it('종류마다 시즌과 달이 있고 파일이 있음', () => {
    for (const kind of ['single', 'double'] as const) {
      expect(periodsOf(index[kind], 'season').length).toBeGreaterThan(0)
      expect(periodsOf(index[kind], 'month').length).toBeGreaterThan(0)
      for (const meta of index[kind]) {
        const t = load<StatsTable>(statsFile(kind, meta))
        expect(t.reg).toBe(meta.reg)
        expect(t.battles).toBe(meta.battles)
        // 채용률 높은 순, 비율은 0~1
        for (let i = 1; i < t.pokemon.length; i++)
          expect(t.pokemon[i - 1]!.usage).toBeGreaterThanOrEqual(t.pokemon[i]!.usage)
        for (const p of t.pokemon.slice(0, 20))
          for (const [, v] of [...p.moves, ...p.items, ...p.abilities])
            expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })
  it('시즌 배틀 수 = 그 시즌 달들의 합', () => {
    for (const kind of ['single', 'double'] as const)
      for (const s of periodsOf(index[kind], 'season')) {
        const sum = periodsOf(index[kind], 'month')
          .filter((x) => x.reg === s.reg)
          .reduce((a, x) => a + x.battles, 0)
        expect(s.battles).toBe(sum)
      }
  })
  it('추이 길이 = 기간 수, 순위표 1위와 일치', () => {
    for (const kind of ['single', 'double'] as const) {
      const trend = load<StatsTrend>(`stats/trend-${kind}.json`)
      const first = index[kind][0]!
      const top = load<StatsTable>(statsFile(kind, first)).pokemon[0]!
      expect(trend[top.id]![0]).toEqual([1, top.usage])
      for (const row of Object.values(trend)) expect(row.length).toBe(index[kind].length)
    }
  })
})
