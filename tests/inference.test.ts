// tests/inference.test.ts — 스피드 구간 추정 (utils/speedInference.ts) / 데미지 관측 판정·요약 (utils/statInference.ts)

import { describe, expect, it } from 'vitest'
import {
  bandSpeedRange,
  fullRanges,
  minSpeedSp,
  narrowRanges,
  SPEED_BANDS,
  speedVerdict,
} from '../utils/speedInference'
import {
  attackCell,
  attackCells,
  attackSummary,
  bulkBounds,
  bulkCell,
  BULK_CELLS,
  bulkSummary,
  dealtMatches,
  drainAmount,
  drainLostRange,
  drainMatches,
  NAT_EFFECTS,
  SP_COUNT,
  spRangeOf,
  takenMatches,
} from '../utils/statInference'
import { calcStat } from '../utils/stats'

const band = (k: string) => SPEED_BANDS.find((b) => b.key === k)!

describe('스피드 구간', () => {
  it('구간별 실전 스피드 범위 (종족값 100: 무보정 120~152, 보정 132~167, 스카프 ×1.5)', () => {
    expect(bandSpeedRange(100, band('neutral'), [0, 32], {})).toEqual([120, 152])
    expect(bandSpeedRange(100, band('plus'), [0, 32], {})).toEqual([132, 167])
    expect(bandSpeedRange(100, band('neutralScarf'), [0, 32], {})).toEqual([180, 228])
    expect(bandSpeedRange(100, band('plusScarf'), [0, 32], {})).toEqual([198, 250])
  })
  it('랭크·순풍·매직룸 반영', () => {
    expect(bandSpeedRange(100, band('neutral'), [0, 0], { boost: 1 })).toEqual([180, 180])
    expect(bandSpeedRange(100, band('neutral'), [0, 0], { tailwind: true })).toEqual([240, 240])
    expect(bandSpeedRange(100, band('neutralScarf'), [0, 0], { magicRoom: true })).toEqual([
      120, 120,
    ])
  })
  it('내가 먼저 움직였다 (내 스피드 170) → 스카프 구간 제외, 보정 구간은 그대로', () => {
    const r = narrowRanges(fullRanges(), 100, {}, 170, false)
    expect(r.neutralScarf).toBeNull()
    expect(r.plusScarf).toBeNull()
    expect(r.neutral).toEqual([0, 32])
    expect(speedVerdict(r)).toEqual({ none: false, scarf: false, plus: null })
  })
  it('상대가 먼저 (내 스피드 160) → 무보정 제외, 보정은 SP 26 이상, 스카프 가능', () => {
    const r = narrowRanges(fullRanges(), 100, {}, 160, true)
    expect(r.neutral).toBeNull()
    // 보정: floor((100+sp+20)×1.1) ≥ 160 → sp ≥ 26 (146×1.1=160.6)
    expect(r.plus).toEqual([26, 32])
    expect(r.neutralScarf).toEqual([0, 32])
    expect(minSpeedSp(r)).toBe(0)
  })
  it('관찰이 쌓이면 교집합 — 두 번째 관찰로 스카프 확정', () => {
    const r1 = narrowRanges(fullRanges(), 100, {}, 170, true) // 상대가 170 이상 → 비스카프는 보정도 167 이 최대라 제외
    expect(speedVerdict(r1).scarf).toBe(true)
    const r2 = narrowRanges(r1, 100, {}, 200, false) // 상대가 200 이하
    expect(r2.neutralScarf).toEqual([0, 13]) // floor((120+sp)×1.5) ≤ 200 → sp ≤ 13
    expect(r2.plusScarf).toEqual([0, 1]) // floor(floor((120+sp)×1.1)×1.5) ≤ 200 → sp ≤ 1
  })
  it('트릭룸은 호출하는 쪽에서 방향을 바꿔 넘긴다 / 모든 구간 제외면 범위 밖', () => {
    const r = narrowRanges(fullRanges(), 100, {}, 300, true)
    expect(speedVerdict(r).none).toBe(true)
  })
})

describe('데미지 관측 판정', () => {
  const rolls = Array.from({ length: 16 }, (_, i) => 85 + i) // 85..100
  it('준 데미지(%): 화면 % 는 버림 표시 → 전/후 % 로 가능한 실제 데미지 범위, 쓰러뜨렸으면 그 이상만', () => {
    // 최대 HP 200: 100% → 55% (실제 110~111) = 89~90
    expect(dealtMatches(rolls, 200, 100, 45, false)).toBe(true)
    // 100% → 51% (102~103) = 97~98 / 100% → 49% (98~99) = 101~102 → 최대 난수 100 이라 불가
    expect(dealtMatches(rolls, 200, 100, 49, false)).toBe(true)
    expect(dealtMatches(rolls, 200, 100, 51, false)).toBe(false)
    // 80% (160~161) → 35% (70~71) = 89~91
    expect(dealtMatches(rolls, 200, 80, 45, false)).toBe(true)
    // 소수 입력: 100% → 54.5% 는 54%·55% 둘 다 (108~111) = 89~92
    expect(dealtMatches(rolls, 200, 100, 45.5, false)).toBe(true)
    // 쓰러뜨림: 맞기 전 40% = 80~81 → 최대 난수 100 이면 가능, 60% = 120~ 이면 불가
    expect(dealtMatches(rolls, 200, 60, 60, true)).toBe(false)
    expect(dealtMatches(rolls, 200, 40, 40, true)).toBe(true)
  })
  it('흡수기 회복량 → 잃은 HP 범위 (기가드레인 36 회복 = 71~72, 큰뿌리 반영)', () => {
    expect(drainLostRange(36, 0.5, false)).toEqual([71, 72])
    expect(drainAmount(71, 0.5, true)).toBe(47) // 36 × 5324/4096 = 46.8 → 47
    expect(drainLostRange(47, 0.5, true)).toEqual([71, 72])
    expect(drainLostRange(1, 0.5, false)).toEqual([1, 2])
  })
  it('흡수 관측: 쓰러뜨렸으면 잃은 HP = 맞기 전 HP → 화면 % 와 맞는 최대 HP 만', () => {
    // 42% 에서 쓰러뜨리고 71~72 잃음 → 최대 HP 170 이면 41~43% 라 가능, 200 이면 불가
    expect(drainMatches(rolls, 170, 42, [71, 72], true)).toBe(true)
    expect(drainMatches(rolls, 200, 42, [71, 72], true)).toBe(false)
    // 쓰러뜨리지 않았으면 난수 중 하나가 그 범위 안
    expect(drainMatches(rolls, 200, 80, [90, 91], false)).toBe(true)
    expect(drainMatches(rolls, 200, 80, [110, 111], false)).toBe(false)
  })
  it('받은 데미지(HP): ±1 HP 허용, 쓰러졌으면 그 이상만', () => {
    const sparse = [100, 102, 104, 107]
    expect(takenMatches(rolls, 93, false)).toBe(true)
    expect(takenMatches(rolls, 101, false)).toBe(true) // 최대 100 과 1 차이
    expect(takenMatches(rolls, 102, false)).toBe(false)
    expect(takenMatches(sparse, 105, false)).toBe(true)
    expect(takenMatches(sparse, 110, false)).toBe(false)
    expect(takenMatches(rolls, 80, true)).toBe(true)
    expect(takenMatches(rolls, 120, true)).toBe(false)
  })
})

describe('내구 요약', () => {
  const base = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }
  const grid = (f: (h: number, x: number, n: number) => boolean) => {
    const g = new Uint8Array(BULK_CELLS)
    for (let h = 0; h < SP_COUNT; h++)
      for (let x = 0; x < SP_COUNT; x++)
        for (const n of NAT_EFFECTS) g[bulkCell(h, x, n)] = f(h, x, n) ? 1 : 0
    return g
  }
  it('관측이 없으면 실능치 범위가 전체', () => {
    const s = bulkSummary(null, null, base, 66)
    expect(s.feasible).toBe(true)
    expect(s.hp).toEqual({ min: 175, max: 207 })
    expect(s.def).toBeNull()
  })
  it('물리 관측: HP 32 + 방어 32 보정만 남으면 그 실능치', () => {
    const s = bulkSummary(
      grid((h, x, n) => h === 32 && x === 32 && n === 1),
      null,
      base,
      66,
    )
    expect(s.hp).toEqual({ min: 207, max: 207 })
    expect(s.def).toEqual({
      min: calcStat('def', 100, 32, { id: '+', plus: 'def', minus: 'atk' }),
      max: 167,
    })
  })
  it('SP 합 상한: HP 32 + 방어 32 + 특방 32 는 불가 (66 초과)', () => {
    const phys = grid((h, x) => h === 32 && x === 32)
    const spec = grid((h, x) => h === 32 && x === 32)
    expect(bulkSummary(phys, spec, base, 66).feasible).toBe(false)
    expect(
      bulkSummary(
        phys,
        grid((h, x) => h === 32 && x === 2),
        base,
        66,
      ).feasible,
    ).toBe(true)
  })
  it('방어·특방 둘 다 보정인 성격은 없다', () => {
    const phys = grid((h, x, n) => h === 0 && x === 0 && n === 1)
    const spec = grid((h, x, n) => h === 0 && x === 0 && n === 1)
    expect(bulkSummary(phys, spec, base, 66).feasible).toBe(false)
  })
})

describe('공격 요약', () => {
  it('도구 후보별로 남은 조합 → 실능치 / 실효 공격 / 후보', () => {
    const items = 3 // 0 없음, 1 구애머리띠, 2 생명의구슬
    const g = new Uint8Array(attackCells(items))
    g[attackCell(0, 32, 1)] = 1 // 도구 없음 + 공격 32 보정
    g[attackCell(1, 0, 0)] = 1 // 구애머리띠 + 공격 0 무보정
    const s = attackSummary(g, items, 'atk', 100, (i) => [1, 1.5, 1.3][i]!)
    expect(s.items).toEqual([0, 1])
    expect(s.stat).toEqual({ min: 120, max: 167 })
    expect(s.effective).toEqual({ min: 167, max: 180 })
    expect(s.minSp).toBe(0)
    expect(
      attackSummary(
        g,
        items,
        'atk',
        100,
        () => 1,
        (i) => i !== 1,
      ).items,
    ).toEqual([0])
  })
})

describe('배틀 계산용 내구 범위', () => {
  const base = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }
  it('관측이 없으면 SP 0 하락 성격 ~ SP 32 보정 성격', () => {
    const b = bulkBounds(null, null, base, 66)!
    expect(b.hp).toEqual({ min: 175, max: 207 })
    expect(b.def).toEqual({ min: 108, max: 167 })
    expect(b.frail.def).toEqual({ hp: 175, stat: 108 })
    expect(b.tank.def).toEqual({ hp: 207, stat: 167 })
  })
  it('관측과 맞는 조합 중 H×B 가 가장 작은 / 큰 조합', () => {
    // H 와 B 가 반비례하는 띠: h + d = 32 (무보정)만 남김
    const g = new Uint8Array(BULK_CELLS)
    for (let h = 0; h < SP_COUNT; h++) g[bulkCell(h, 32 - h, 0)] = 1
    const b = bulkBounds(g, null, base, 66)!
    expect(b.hp).toEqual({ min: 175, max: 207 })
    expect(b.def).toEqual({ min: 120, max: 152 })
    // H×B: HP 32·B 0 = 207 × 120 = 24840 (가장 작음), HP 0·B 32 = 175 × 152 = 26600 (가장 큼)
    expect(b.frail.def).toEqual({ hp: 207, stat: 120 })
    expect(b.tank.def).toEqual({ hp: 175, stat: 152 })
  })
  it('맞는 조합이 없으면 null', () => {
    expect(bulkBounds(new Uint8Array(BULK_CELLS), null, base, 66)).toBeNull()
  })
})

describe('실능치 범위 → 능력 포인트 범위', () => {
  it('HP 는 성격 무관, 나머지는 하락~보정 모두', () => {
    // HP 종족값 60: SP 0 = 135, SP 32 = 167
    expect(spRangeOf('hp', 60, { min: 135, max: 167 })).toEqual({ min: 0, max: 32 })
    expect(spRangeOf('hp', 60, { min: 141, max: 143 })).toEqual({ min: 6, max: 8 })
    const one = calcStat('def', 100, 10)
    const r = spRangeOf('def', 100, { min: one, max: one })!
    expect(r.min).toBeLessThanOrEqual(10)
    expect(r.max).toBeGreaterThanOrEqual(10)
    expect(spRangeOf('def', 100, { min: 9999, max: 9999 })).toBeNull()
  })
})
