// tests/hpDisplay.test.ts — 상대 HP % 표시 규칙 (버림) (utils/hpDisplay.ts)

import { describe, expect, it } from 'vitest'
import {
  dealtHpRange,
  hpCorrection,
  hpOfPct,
  hpRangeOfPct,
  hpStepsMatch,
  shownPct,
} from '../utils/hpDisplay'

describe('상대 HP % (버림 표시)', () => {
  it('실제 HP → 화면 % 는 버림', () => {
    expect(shownPct(57, 151)).toBe(37) // 37.7%
    expect(shownPct(58, 151)).toBe(38) // 38.4%
    expect(shownPct(150, 151)).toBe(99)
    expect(shownPct(151, 151)).toBe(100)
  })
  it('화면 % → 실제 HP 범위 [p%, (p+1)%)', () => {
    expect(hpRangeOfPct(38, 151)).toEqual({ min: 58, max: 58 })
    expect(hpRangeOfPct(38, 200)).toEqual({ min: 76, max: 77 })
    expect(hpRangeOfPct(99, 200)).toEqual({ min: 198, max: 199 })
    expect(hpRangeOfPct(100, 200)).toEqual({ min: 200, max: 200 })
    expect(hpRangeOfPct(0, 200)).toEqual({ min: 0, max: 0 })
    expect(hpRangeOfPct(38.7, 200)).toEqual({ min: 76, max: 77 }) // 소수는 버린 값 기준
    // 범위 안 모든 HP 가 그 % 로 보이고, 바로 바깥은 아님
    for (const M of [135, 151, 167]) {
      for (let p = 1; p < 100; p++) {
        const r = hpRangeOfPct(p, M)
        expect(shownPct(r.min, M)).toBe(p)
        expect(shownPct(r.max, M)).toBe(p)
        expect(shownPct(r.min - 1, M)).toBe(p - 1)
        expect(shownPct(r.max + 1, M)).toBe(p + 1)
      }
    }
  })
  it('대푯값 / 전후 % 로 본 데미지 범위', () => {
    expect(hpOfPct(100, 151)).toBe(151)
    expect(hpOfPct(38, 200)).toBe(77) // 76~77 의 가운데 (반올림)
    expect(dealtHpRange(94, 38, 151)).toEqual({ min: 142 - 58, max: 143 - 58 })
    expect(dealtHpRange(40, 0, 200)).toEqual({ min: 80, max: 81 }) // 쓰러뜨림 = 맞기 전 남은 HP
  })
})

describe('턴 끝 HP 관측', () => {
  const sand = { frac: -1 / 16 }
  it('38% → 모래바람 → 33%: 최대 HP 151 은 불가, 142 는 가능 (55 → 47)', () => {
    const o = { start: 38, steps: [sand], shown: 33 }
    expect(hpStepsMatch(151, o)).toBe(false)
    expect(hpStepsMatch(142, o)).toBe(true)
    expect(hpStepsMatch(141, o)).toBe(false) // 54 → 46 = 32.6%
    expect(hpStepsMatch(151, { ...o, shown: 32 })).toBe(true)
  })
  it('가득 찬 데서 시작하면 실제 HP = 최대 HP, 상태이상·회복도 같은 계산', () => {
    expect(hpStepsMatch(151, { start: 100, steps: [sand], shown: 94 })).toBe(true) // 142/151
    expect(hpStepsMatch(144, { start: 100, steps: [sand], shown: 94 })).toBe(false) // 135/144 = 93.75
    const brn = { status: 'brn', ability: '', toxicTurn: 0 }
    // 50% (75~76/150) → 화상 9 → 먹다남은음식 +9 → 그대로 50%
    expect(hpStepsMatch(150, { start: 50, steps: [brn, { frac: 1 / 16 }], shown: 50 })).toBe(true)
  })
  it('예상과 다르게 고친 정수 % 만 관측 (같은 턴, 2%p 이내)', () => {
    const c = { turn: 5, start: 38, steps: [sand], predicted: 32 }
    expect(hpCorrection(c, 33, 5)).toEqual({ start: 38, steps: [sand], shown: 33 })
    expect(hpCorrection(c, 32, 5)).toBeNull()
    expect(hpCorrection(c, 33, 6)).toBeNull()
    expect(hpCorrection(c, 40, 5)).toBeNull()
    expect(hpCorrection(c, 32.5, 5)).toBeNull()
    expect(hpCorrection(null, 33, 5)).toBeNull()
  })
})
