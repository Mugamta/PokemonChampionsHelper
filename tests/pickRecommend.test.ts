// tests/pickRecommend.test.ts — 선출·선두 추천 (utils/pickRecommend.ts + composables/usePickRecommend.ts)

import { resetNuxtState, slot } from './nuxt-env'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTeam } from '../composables/useTeam'
import { usePickRecommend } from '../composables/usePickRecommend'
import { combinations, recommendPicks } from '../utils/pickRecommend'
import { emptySlot, type TeamSlot } from '../utils/types'

describe('utils/pickRecommend', () => {
  it('조합 수', () => {
    expect(combinations(6, 3)).toHaveLength(20)
    expect(combinations(6, 4)).toHaveLength(15)
    expect(combinations(2, 3)).toEqual([])
  })

  it('상대마다 받아 낼 포켓몬이 있는 조합이 위, 선두는 많이 나오는 상대에게 강한 쪽', () => {
    // 내 0 은 상대 0 에 강함, 1 은 상대 1 에 강함, 2·3 은 모두에게 약간 불리
    const value = [
      [0.8, -0.6],
      [-0.6, 0.8],
      [-0.1, -0.1],
      [-0.2, -0.2],
    ]
    const [top] = recommendPicks(value, [3, 1], 2, 1)
    expect([...top!.picks].sort()).toEqual([0, 1])
    // 상대 0 이 더 자주 나옴 → 선두는 0
    expect(top!.leads).toEqual([0])
    expect(top!.picks[0]).toBe(0)
    expect(top!.answers.map((a) => a.by)).toEqual([0, 1])
  })
})

const pad6 = (s: TeamSlot[]) => [...s, ...Array.from({ length: 6 - s.length }, emptySlot)]
const moves = (...m: string[]) => [...m, '', '', '', ''].slice(0, 4) as TeamSlot['moves']

beforeEach(() => resetNuxtState())

describe('usePickRecommend', () => {
  it('내 파티 6 × 상대 파티로 선출 3마리 + 선두', () => {
    useTeam('mine').slots.value = pad6([
      slot('garchomp', { moves: moves('earthquake', 'dragonclaw') }),
      slot('gholdengo', { moves: moves('makeitrain', 'shadowball') }),
      slot('rotomwash', { moves: moves('hydropump', 'voltswitch') }),
      slot('incineroar', { moves: moves('flareblitz', 'knockoff') }),
      slot('charizard', { moves: moves('flamethrower', 'airslash') }),
      slot('snorlax', { moves: moves('bodyslam') }),
    ])
    useTeam('opp').slots.value = pad6([
      slot('venusaur', { moves: moves('gigadrain', 'sludgebomb') }),
      slot('scizor', { moves: moves('bulletpunch', 'uturn') }),
      slot('skarmory', { moves: moves('bravebird') }),
    ])
    const r = usePickRecommend('single').compute({})!
    expect(r.plans).toHaveLength(3)
    expect(r.plans[0]!.slots).toHaveLength(3)
    expect(r.plans[0]!.leads).toHaveLength(1)
    // 풀·강철·비행 상대에는 불꽃이 들어가는 조합이 1위
    const fire = new Set([3, 4])
    expect(r.plans[0]!.slots.some((i) => fire.has(i))).toBe(true)
  })

  it('내 파티가 선출 수보다 적으면 없음', () => {
    useTeam('mine').slots.value = pad6([slot('garchomp', { moves: moves('earthquake') })])
    useTeam('opp').slots.value = pad6([slot('venusaur', { moves: moves('gigadrain') })])
    expect(usePickRecommend('single').compute({})).toBeNull()
  })
})
