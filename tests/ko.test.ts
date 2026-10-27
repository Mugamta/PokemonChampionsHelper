// tests/ko.test.ts — 연속기·탈 실전 KO 확률 (utils/ko.ts attackDistribution / koProbUses)

import { describe, expect, it } from 'vitest'
import { attackDistribution, koProbUses, koProbWithin, subBreakProb } from '../utils/ko'

const flat = (v: number) => Array(16).fill(v) as number[]
const hit = (v: number, crit = v) => ({ normal: flat(v), crit: flat(crit) })

describe('attackDistribution / koProbUses', () => {
  it('단타는 기존 koProbWithin 과 같다 (명중·급소·여러 번)', () => {
    const normal = Array.from({ length: 16 }, (_, i) => 40 + i)
    const crit = normal.map((v) => Math.floor(v * 1.5))
    const acc = 0.9
    const pc = 1 / 24
    const d = attackDistribution([{ normal, crit }], [{ hits: 1, p: 1 }], acc, pc, 100)
    const outcomes = [
      { dmg: 0, p: 1 - acc },
      ...normal.map((v) => ({ dmg: v, p: (acc * (1 - pc)) / 16 })),
      ...crit.map((v) => ({ dmg: v, p: (acc * pc) / 16 })),
    ]
    for (const n of [1, 2, 3])
      expect(koProbUses(d, d, 100, n)).toBeCloseTo(koProbWithin(outcomes, 100, n), 9)
  })

  it('2~5회: 4회 이상 맞아야 쓰러지면 30%', () => {
    const counts = [2, 3, 4, 5].map((n) => ({ hits: n, p: n <= 3 ? 0.35 : 0.15 }))
    const d = attackDistribution(Array(5).fill(hit(10)), counts, 1, 0, 35)
    expect(koProbUses(d, d, 35, 1)).toBeCloseTo(30, 9)
    // 두 번 쓰면 합 4타 이상은 항상
    expect(koProbUses(d, d, 35, 2)).toBeCloseTo(100, 9)
  })

  it('히트마다 급소를 따로 본다', () => {
    // 2회 고정, 보통 10 / 급소 15, hp 25 → 둘 다 급소여야 아니라 하나만 급소여도 25
    const d = attackDistribution([hit(10, 15), hit(10, 15)], [{ hits: 2, p: 1 }], 1, 0.5, 25)
    expect(koProbUses(d, d, 25, 1)).toBeCloseTo(75, 9)
  })

  it('기합의띠: 첫 히트 뒤 1 남고 다음 히트에 쓰러짐 / 단타면 버팀', () => {
    const multi = attackDistribution([hit(200), hit(200)], [{ hits: 2, p: 1 }], 1, 0, 100, {
      holdOn: true,
    })
    expect(koProbUses(multi, multi, 100, 1)).toBe(100)
    const single = attackDistribution([hit(200)], [{ hits: 1, p: 1 }], 1, 0, 100, { holdOn: true })
    const later = attackDistribution([hit(200)], [{ hits: 1, p: 1 }], 1, 0, 100)
    expect(koProbUses(single, later, 100, 1)).toBe(0)
    expect(koProbUses(single, later, 100, 2)).toBe(100)
  })

  it('탈: 첫 히트는 고정 데미지, 다음 히트부터 보통', () => {
    const first = attackDistribution([hit(60), hit(60)], [{ hits: 2, p: 1 }], 1, 0, 70, {
      fixed: 8,
    })
    const later = attackDistribution([hit(60), hit(60)], [{ hits: 2, p: 1 }], 1, 0, 70)
    expect(koProbUses(first, later, 70, 1)).toBe(0) // 8 + 60 = 68
    expect(koProbUses(first, later, 70, 2)).toBe(100)
  })

  it('대타: 깨질 때 넘긴 데미지는 버려지고 다음 히트부터 본체', () => {
    // 대타 25, 히트 20 × 3회 → 대타(20+20, 넘친 15 버림) → 본체 20
    const d = attackDistribution(Array(3).fill(hit(20)), [{ hits: 3, p: 1 }], 1, 0, 30, { sub: 25 })
    expect(subBreakProb(d)).toBe(100)
    expect(koProbUses(d, d, 30, 1)).toBe(0)
    expect(koProbUses(d, d, 20, 1)).toBe(100)
    // 2회면 대타만 깨짐
    const two = attackDistribution(Array(2).fill(hit(10)), [{ hits: 2, p: 1 }], 1, 0, 30, {
      sub: 25,
    })
    expect(subBreakProb(two)).toBe(0)
  })

  it('빗나가면 그 사용은 0', () => {
    const d = attackDistribution([hit(100)], [{ hits: 1, p: 1 }], 0.8, 0, 100)
    expect(koProbUses(d, d, 100, 1)).toBeCloseTo(80, 9)
    expect(koProbUses(d, d, 100, 2)).toBeCloseTo(96, 9)
  })
})
