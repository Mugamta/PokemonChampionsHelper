// tests/recommend.test.ts — 추천 플레이 (utils/recommend.ts 계산 + composables/useRecommend.ts 배틀 상태 연결)

import { resetNuxtState, slot } from './nuxt-env'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBattle } from '../composables/useBattle'
import { PICK_COUNT, useEntry } from '../composables/useEntry'
import { useTeam } from '../composables/useTeam'
import { useRecWeights, useRecommend, type MineOption } from '../composables/useRecommend'
import {
  DEFAULT_WEIGHTS,
  advanceSkip,
  cappedDamage,
  duelValue,
  evaluate,
  firstChance,
  normalizeWeights,
  rankOptions,
  safest,
  skipDist,
  responseWeights,
  type Exchange,
  type Hit,
} from '../utils/recommend'
import { emptySlot, type TeamSlot } from '../utils/types'

const hit = (min: number, max: number, ko = 0, acc = 1): Hit => ({ min, max, acc, ko })
const ex = (x: Partial<Exchange>): Exchange => ({
  pFirst: 1,
  myHp: 1,
  oppHp: 1,
  mine: null,
  opp: null,
  after: [],
  ...x,
})

describe('utils/recommend', () => {
  it('남은 HP 로 자른 기대 데미지', () => {
    expect(cappedDamage(hit(0.4, 0.6), 1)).toBeCloseTo(0.5)
    expect(cappedDamage(hit(0.4, 0.6), 0.3)).toBeCloseTo(0.3)
    expect(cappedDamage(hit(0.4, 0.6, 0, 0.5), 1)).toBeCloseTo(0.25)
    // hp 가 범위 안: 아래 절반은 평균 0.45, 위 절반은 0.5 → 0.475
    expect(cappedDamage(hit(0.4, 0.6), 0.5)).toBeCloseTo(0.475)
  })

  it('맞대결: 같은 2타면 빠른 쪽이 이김, 남은 HP 가 많을수록 큼', () => {
    const fast = duelValue({ mine: 0.6, opp: 0.6, pFirst: 1 }, 1, 1)
    const slow = duelValue({ mine: 0.6, opp: 0.6, pFirst: 0 }, 1, 1)
    expect(fast).toBeCloseTo(0.5 + 0.5 * 0.4) // 한 번 맞고 이김
    expect(slow).toBeCloseTo(-(0.5 + 0.5 * 0.4))
    expect(duelValue({ mine: 0, opp: 0, pFirst: 0.5 }, 1, 1)).toBe(0)
  })

  it('맞대결: 상대가 잠들어 있으면 느려도 이김', () => {
    const d = { mine: 0.6, opp: 0.6, pFirst: 0 }
    expect(duelValue({ ...d, skipOpp: [{ turns: 2, p: 1 }] }, 1, 1)).toBeCloseTo(1)
    // 반동으로 한 턴 쉬면 빨라도 짐
    expect(duelValue({ ...d, pFirst: 1, skipMine: [{ turns: 1, p: 1 }] }, 1, 1)).toBeLessThan(0)
  })

  it('잠듦 턴 분포 (챔피언스: 0 → 33 → 100%)', () => {
    const fresh = skipDist([0, 33, 100], 0)
    expect(fresh.map((s) => s.turns)).toEqual([1, 2])
    expect(fresh[0]!.p).toBeCloseTo(0.33)
    expect(fresh[1]!.p).toBeCloseTo(0.67)
    expect(skipDist([0, 33, 100], 2)).toEqual([{ turns: 0, p: 1 }])
  })

  it('선공 확정 1타: 상대 공격을 받지 않음', () => {
    const o = evaluate(ex({ mine: hit(1, 1.2, 1), opp: hit(0.5, 0.6) }))
    expect(o.oppKo).toBe(1)
    expect(o.myKo).toBe(0)
    expect(o.myLoss).toBe(0)
  })

  it('후공이면 상대 1타에 쓰러질 몫만큼 내 공격이 줄어듦', () => {
    const o = evaluate(ex({ pFirst: 0, mine: hit(0.5, 0.5), opp: hit(1, 1, 0.5, 0.5) }))
    expect(o.myKo).toBeCloseTo(0.5)
    expect(o.oppLoss).toBeCloseTo(0.25)
  })

  it('교체: 설치기 + 상대 공격을 들어오는 포켓몬이 받고, 내 공격은 없음', () => {
    const o = evaluate(
      ex({ switchIn: true, entryChip: 0.125, mine: hit(1, 1, 1), opp: hit(0.2, 0.2) }),
    )
    expect(o.oppLoss).toBe(0)
    expect(o.myLoss).toBeCloseTo(0.325)
  })

  it('상대 교체: 상대 공격 없음, 내 공격은 들어오는 포켓몬이 받음', () => {
    const o = evaluate(
      ex({
        pFirst: 0,
        oppSwitchIn: true,
        oppHp: 0.5,
        oppEntryChip: 0.25,
        mine: hit(0.2, 0.2),
        opp: hit(1, 1, 1),
      }),
    )
    expect(o.myLoss).toBe(0)
    expect(o.oppLoss).toBeCloseTo(0.45)
  })

  it('방어: 상대 공격을 막음 / 회복: 잃은 만큼까지만', () => {
    expect(evaluate(ex({ myProtect: true, opp: hit(0.5, 0.5, 0.2) })).myLoss).toBe(0)
    const healed = evaluate(ex({ myHp: 0.8, myHeal: 0.5, opp: hit(0.1, 0.1) }))
    expect(healed.myLoss).toBeCloseTo(-0.2)
  })

  it('풀죽음: 먼저 맞히면 상대 행동을 막음, 나중이면 효과 없음', () => {
    const base = { mine: hit(0.1, 0.1), opp: hit(0.5, 0.5), mineStops: 1 }
    expect(evaluate(ex(base)).myLoss).toBe(0)
    expect(evaluate(ex({ ...base, pFirst: 0 })).myLoss).toBeCloseTo(0.5)
  })

  it('행동 불가 확률: 잠든 상대는 공격하지 않음', () => {
    expect(evaluate(ex({ pFirst: 0, oppActs: 0, opp: hit(0.5, 0.5) })).myLoss).toBe(0)
    expect(evaluate(ex({ pFirst: 0, oppActs: 0.5, opp: hit(0.5, 0.5) })).myLoss).toBeCloseTo(0.25)
  })

  it('반동·흡수: 준 데미지 비율만큼', () => {
    const recoil = evaluate(ex({ mine: hit(0.6, 0.6), mySelf: { perDealt: 0.33, onHit: 0 } }))
    expect(recoil.myLoss).toBeCloseTo(0.198)
    const drain = evaluate(
      ex({ myHp: 0.5, mine: hit(0.4, 0.4), mySelf: { perDealt: -0.5, onHit: 0 } }),
    )
    expect(drain.myLoss).toBeCloseTo(-0.2)
  })

  it('교체기: 먼저 쓰면 상대 공격은 들어온 포켓몬이 받고, 맞대결도 들어온 포켓몬 기준', () => {
    const pivot = { myHp: 1, entryChip: 0, opp: hit(0.1, 0.1) }
    const good = { mine: 0.6, opp: 0.1, pFirst: 1 }
    const bad = { mine: 0.1, opp: 0.6, pFirst: 0 }
    const x = ex({
      mine: hit(0.2, 0.2),
      opp: hit(0.5, 0.5),
      pivot,
      after: [{ p: 1, duel: bad }],
      afterPivot: [{ p: 1, duel: good }],
    })
    const first = evaluate(x)
    expect(first.myLoss).toBeCloseTo(0.1)
    expect(first.duel).toBeGreaterThan(0)
    const second = evaluate({ ...x, pFirst: 0 })
    expect(second.myLoss).toBeCloseTo(0.5)
    expect(second.duel).toBeGreaterThan(0) // 맞고 나서 교체해도 들어온 포켓몬 기준
  })

  it('설치기 가치: 기술이 나갔을 때만, 가중치를 곱함', () => {
    const x = ex({ myUtility: 0.3 })
    expect(evaluate(x).score).toBeCloseTo(0.3)
    expect(evaluate(x, { ...DEFAULT_WEIGHTS, hazard: 0 }).score).toBe(0)
    expect(evaluate({ ...x, myActs: 0 }).utility).toBe(0)
  })

  it('가중치: ko 가 0 이면 KO 확률은 점수에 안 들어감', () => {
    const x = ex({ mine: hit(1, 1, 1), oppHp: 0.1 })
    const w0 = { ...DEFAULT_WEIGHTS, ko: 0 }
    expect(evaluate(x, w0).score).toBeCloseTo(0.1)
    expect(evaluate(x).score).toBeCloseTo(0.1 + DEFAULT_WEIGHTS.ko)
  })

  it('가중치 정리: 숫자가 아니면 기본값, 음수 0, 안전 기준은 1 이하', () => {
    expect(normalizeWeights(null)).toEqual(DEFAULT_WEIGHTS)
    const w = normalizeWeights({ ko: '1.5', duel: -1, plausible: 3, smart: 'x' })
    expect(w.ko).toBe(1.5)
    expect(w.duel).toBe(0)
    expect(w.plausible).toBe(1)
    expect(w.smart).toBe(DEFAULT_WEIGHTS.smart)
  })

  it('순위: 기대값 높은 순, 안전 추천은 최악의 경우가 가장 나은 것', () => {
    // 선택지 0: 상대가 0번 기술이면 크게 이득, 1번이면 크게 손해 / 선택지 1: 언제나 약간 이득
    const matrix = [
      [ex({ mine: hit(1, 1, 1) }), ex({ pFirst: 0, opp: hit(1, 1, 1) })],
      [ex({ mine: hit(0.2, 0.2) }), ex({ mine: hit(0.2, 0.2) })],
    ]
    const ranked = rankOptions(matrix, [0.8, 0.2])
    expect(ranked[0]!.index).toBe(0)
    expect(safest(ranked)!.index).toBe(1)
    expect(ranked[0]!.worstAgainst).toBe(1)
    // 안전 기준을 높이면 1번 상대 기술은 안 봄 → 안전 추천도 0번
    expect(
      safest(rankOptions(matrix, [0.8, 0.2], { ...DEFAULT_WEIGHTS, plausible: 0.5 }))!.index,
    ).toBe(0)
  })

  it('상대 선택지 비중: 상대에게 유리할수록 큼, smart 0 이면 사전 비중만', () => {
    // 상대 선택지 0 은 내 점수를 낮추고(상대에게 유리), 1 은 내 점수를 높임
    const o = (score: number) => ({ ...evaluate(ex({})), score })
    const table = [
      [o(-0.5), o(0.5)],
      [o(-0.3), o(0.7)],
    ]
    const w = responseWeights([1, 1], table)
    expect(w[0]! + w[1]!).toBeCloseTo(1)
    expect(w[0]).toBeGreaterThan(w[1]!)
    expect(w[1]! / w[0]!).toBeCloseTo(Math.exp(-DEFAULT_WEIGHTS.smart * 1))
    expect(responseWeights([1, 3], table, { ...DEFAULT_WEIGHTS, smart: 0 })[0]).toBeCloseTo(0.25)
    expect(responseWeights([0, 0], table)).toEqual([0.5, 0.5])
  })

  it('선후공 확률: 범위 밖이면 확정, 안이면 비율 + 추측, 트릭룸 반대', () => {
    expect(firstChance(150, [100, 140], null)).toBe(1)
    expect(firstChance(90, [100, 140], null)).toBe(0)
    expect(firstChance(120, [100, 140], null)).toBeCloseTo(0.5)
    expect(firstChance(120, [100, 140], 110)).toBeCloseTo(0.75)
    expect(firstChance(150, [100, 140], null, true)).toBe(0)
    expect(firstChance(100, [100, 100], null)).toBe(0.5)
  })
})

// ── 배틀 상태 연결 ─────────────
const pad6 = (s: TeamSlot[]) => [...s, ...Array.from({ length: 6 - s.length }, emptySlot)]
const moves = (...m: string[]) => [...m, '', '', '', ''].slice(0, 4) as TeamSlot['moves']
function setup(mine: TeamSlot[], opp: TeamSlot[]) {
  useTeam('mine').slots.value = pad6(mine)
  useTeam('opp').slots.value = pad6(opp)
  useEntry('single').picks.value = mine.map((_, i) => i).slice(0, PICK_COUNT.single)
  const b = useBattle('single')
  b.ensure()
  b.sendOut('opp', 0, 0)
  return b
}
const open = (b: ReturnType<typeof setup>) => {
  const rec = useRecommend(b)
  rec.enabled.value = true
  return rec.result.value!
}
const isMove = (o: MineOption, move: string) => o.kind === 'move' && o.move === move

beforeEach(() => resetNuxtState())

describe('useRecommend', () => {
  it('닫혀 있으면 계산하지 않음, 열면 기술 + 교체 선택지', () => {
    const b = setup(
      [
        slot('garchomp', { moves: moves('earthquake', 'dragonclaw', 'swordsdance', 'protect') }),
        slot('gholdengo', { moves: moves('makeitrain', 'shadowball') }),
        slot('incineroar', { moves: moves('flareblitz') }),
      ],
      [slot('charizard', { moves: moves('flamethrower', 'airslash') })],
    )
    const rec = useRecommend(b)
    expect(rec.result.value).toBeNull()
    rec.enabled.value = true
    const r = rec.result.value!
    expect(r.mode).toBe('turn')
    expect(r.options).toHaveLength(6) // 기술 4 + 교체 2
    // 공개된 대기 포켓몬이 없으면 상대 교체는 없음
    expect(r.opp.map((o) => (o.kind === 'move' ? o.move : ''))).toEqual([
      'flamethrower',
      'airslash',
    ])
    // 비행 타입에 지진은 무효 → 드래곤클로보다 아래
    const rank = (move: string) => r.ranked.findIndex((x) => isMove(r.options[x.index]!, move))
    expect(rank('dragonclaw')).toBeLessThan(rank('earthquake'))
    expect(r.ranked[rank('earthquake')]!.summary.oppLoss).toBe(0)
  })

  it('앙코르로 묶이면 그 기술 + 교체만', () => {
    const b = setup(
      [slot('garchomp', { moves: moves('earthquake', 'dragonclaw') }), slot('gholdengo')],
      [slot('charizard', { moves: moves('flamethrower') })],
    )
    const m = b.state.value!.sides.mine.mons[0]!
    m.lastMove = 'dragonclaw'
    m.volatiles.encore = 1
    expect(open(b).options.filter((o) => o.kind === 'move')).toEqual([
      { kind: 'move', move: 'dragonclaw', mega: false },
    ])
  })

  it('속이기: 나온 첫 턴만 선택지, 첫 턴에는 풀죽음으로 상대 공격을 막음', () => {
    const b = setup(
      [slot('incineroar', { moves: moves('fakeout', 'flareblitz') })],
      [slot('garchomp', { moves: moves('earthquake') })],
    )
    const r = open(b)
    const fo = r.ranked.find((x) => isMove(r.options[x.index]!, 'fakeout'))!
    expect(fo.summary.pFirst).toBe(1)
    expect(fo.summary.myLoss).toBe(0)
    // 다음 턴에는 실패하므로 선택지에서 빠짐
    b.state.value!.turn = 3
    expect(open(b).options.some((o) => isMove(o, 'fakeout'))).toBe(false)
  })

  it('교체기는 들어갈 포켓몬마다 선택지', () => {
    const b = setup(
      [
        slot('rotomwash', { moves: moves('voltswitch', 'hydropump') }),
        slot('garchomp', { moves: moves('earthquake') }),
        slot('gholdengo', { moves: moves('makeitrain') }),
      ],
      [slot('charizard', { moves: moves('flamethrower') })],
    )
    const pivots = open(b).options.filter((o) => isMove(o, 'voltswitch'))
    expect(pivots.map((o) => (o.kind === 'move' ? o.pivotTo : -1))).toEqual([1, 2])
  })

  it('공개된 상대 대기 포켓몬: 불리하면 교체도 상대 선택지', () => {
    const b = setup(
      [slot('garchomp', { moves: moves('earthquake', 'dragonclaw') })],
      [
        slot('incineroar', { moves: moves('flareblitz') }),
        slot('corviknight', { moves: moves('bravebird') }),
      ],
    )
    // 상대 어흥염을 한 번 내보냈다가 다시 어흥염 (아머까오도 공개)
    b.sendOut('opp', 0, 1)
    b.sendOut('opp', 0, 0)
    const r = open(b)
    const sw = r.opp.find((o) => o.kind === 'switch')
    expect(sw?.weight).toBeGreaterThan(0)
    expect(r.opp.reduce((s, o) => s + o.weight, 0)).toBeCloseTo(1)
    // 상대 교체를 0 으로 하면 사라짐
    useRecWeights().set('oppSwitch', 0)
    expect(open(b).opp.some((o) => o.kind === 'switch')).toBe(false)
  })

  it('내 포켓몬이 쓰러지면 내보낼 포켓몬 추천', () => {
    const b = setup(
      [
        slot('garchomp', { moves: moves('earthquake') }),
        slot('gholdengo', { moves: moves('makeitrain') }),
        slot('venusaur', { moves: moves('gigadrain') }),
      ],
      [slot('charizard', { moves: moves('flamethrower') })],
    )
    b.state.value!.sides.mine.mons[0]!.hp = 0
    const r = open(b)
    expect(r.mode).toBe('replace')
    expect(r.options.map((o) => (o.kind === 'switch' ? o.to : -1)).sort()).toEqual([1, 2])
    // 불꽃에 약한 이상해꽃보다 골디가 나음
    expect(r.options[r.best]).toEqual({ kind: 'switch', to: 1 })
  })
})

describe('useRecommend — 날씨·특성·특수 상태', () => {
  const jolly = { nature: 'jolly', sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } }
  const summaryOf = (r: ReturnType<typeof open>, pick: (o: MineOption) => boolean) =>
    r.ranked.find((x) => pick(r.options[x.index]!))!.summary

  it('대타: 먼저 깔면 대타 비용만 내고 상대 공격은 막힘', () => {
    const b = setup(
      [slot('garchomp', { ...jolly, moves: moves('substitute', 'dragonclaw') })],
      [slot('snorlax', { moves: moves('bodyslam') })],
    )
    const s = summaryOf(open(b), (o) => isMove(o, 'substitute'))
    expect(s.pFirst).toBe(1)
    expect(s.myLoss).toBeCloseTo(0.25)
  })

  it('위협으로 들어가면 이번 턴 받는 물리 데미지가 줄어듦', () => {
    const taken = (ability: string) => {
      resetNuxtState()
      const b = setup(
        [slot('garchomp', { moves: moves('earthquake') }), slot('incineroar', { ability })],
        [slot('snorlax', { moves: moves('bodyslam') })],
      )
      return summaryOf(open(b), (o) => o.kind === 'switch' && o.to === 1).myLoss
    }
    expect(taken('intimidate')).toBeLessThan(taken('blaze'))
  })

  it('잔비로 들어가면 이번 턴 받는 불꽃 데미지가 줄어듦', () => {
    const taken = (ability: string) => {
      resetNuxtState()
      const b = setup(
        [slot('garchomp', { moves: moves('earthquake') }), slot('pelipper', { ability })],
        [slot('charizard', { moves: moves('flamethrower') })],
      )
      return summaryOf(open(b), (o) => o.kind === 'switch' && o.to === 1).myLoss
    }
    expect(taken('drizzle')).toBeLessThan(taken('keeneye'))
  })

  it('앙코르: 상대가 변화기를 쓴 뒤면 이후 맞대결이 좋아짐', () => {
    const duel = (last: string) => {
      resetNuxtState()
      const b = setup(
        [slot('garchomp', { ...jolly, moves: moves('encore', 'dragonclaw') })],
        [slot('snorlax', { moves: moves('bodyslam', 'curse') })],
      )
      b.state.value!.sides.opp.mons[0]!.lastMove = last
      return summaryOf(open(b), (o) => isMove(o, 'encore')).duel
    }
    expect(duel('curse')).toBeGreaterThan(duel(''))
  })
})

describe('utils/recommend — 대타', () => {
  it('맞대결: 대타가 막는 만큼 상대가 한 번 더 공격해야 함', () => {
    const d = { mine: 0.6, opp: 0.6, pFirst: 0 }
    expect(duelValue(d, 1, 1)).toBeLessThan(0)
    expect(duelValue({ ...d, absorbMine: 1 }, 1, 1)).toBeGreaterThan(0)
  })

  it('먼저 깔았을 때만 이번 턴 공격을 막고, 비용은 맞힘과 상관없이', () => {
    const x = ex({ opp: hit(0.4, 0.4), myShieldFirst: true, mySelf: { perDealt: 0, onHit: 0.25 } })
    expect(evaluate(x).myLoss).toBeCloseTo(0.25)
    expect(evaluate({ ...x, pFirst: 0 }).myLoss).toBeCloseTo(0.65)
  })
})

describe('utils/recommend — 다음 턴', () => {
  it('쉬는 턴을 하나씩 줄임', () => {
    expect(advanceSkip(undefined)).toEqual({ acts: 1, rest: undefined })
    const a = advanceSkip([
      { turns: 1, p: 0.33 },
      { turns: 2, p: 0.67 },
    ])
    expect(a.acts).toBe(0)
    expect(a.rest).toEqual([
      { turns: 0, p: 0.33 },
      { turns: 1, p: 0.67 },
    ])
    expect(advanceSkip([{ turns: 1, p: 1 }])).toEqual({ acts: 0, rest: undefined })
  })

  it('결과에 둘 다 살아 있는 경우의 HP 와 이번 턴 몫', () => {
    const o = evaluate(ex({ mine: hit(0.3, 0.3), opp: hit(0.2, 0.2) }))
    expect(o.ends).toEqual([{ pivoted: false, p: 1, myHp: 0.8, oppHp: expect.closeTo(0.7) }])
    expect(o.immediate).toBeCloseTo(0.1)
  })
})

describe('useRecommend — 두 턴 앞 · 하품 · 도발', () => {
  const jolly = { nature: 'jolly', sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } }
  const summaryOf = (r: ReturnType<typeof open>, pick: (o: MineOption) => boolean) =>
    r.ranked.find((x) => pick(r.options[x.index]!))!.summary

  it('2턴: 선택지마다 다음 턴 추천이 붙고, 1턴과 같은 선택지', () => {
    const team = () => {
      const b = setup(
        [
          slot('garchomp', { ...jolly, moves: moves('earthquake', 'dragonclaw', 'swordsdance') }),
          slot('rotomwash', { moves: moves('hydropump', 'voltswitch') }),
        ],
        [slot('incineroar', { moves: moves('flareblitz', 'knockoff') })],
      )
      return b
    }
    const one = open(team())
    resetNuxtState()
    useRecWeights().setDepth(2)
    const two = open(team())
    expect(two.depth).toBe(2)
    expect(two.options).toEqual(one.options)
    expect(two.ranked.some((x) => x.summary.next)).toBe(true)
    const next = summaryOf(two, (o) => isMove(o, 'swordsdance')).next!
    expect(next.mi).toBe(0)
  })

  it('하품: 불면이면 효과 없음', () => {
    const duel = (ability: string) => {
      resetNuxtState()
      const b = setup(
        [slot('garchomp', { ...jolly, moves: moves('yawn', 'dragonclaw') })],
        [slot('snorlax', { ability, moves: moves('bodyslam') })],
      )
      return summaryOf(open(b), (o) => isMove(o, 'yawn')).duel
    }
    expect(duel('thickfat')).toBeGreaterThan(duel('insomnia'))
  })

  it('도발: 먼저 맞히면 HP 가 적은 상대의 이번 턴 회복을 막음 (둔감이면 못 막음)', () => {
    const score = (ability: string) => {
      resetNuxtState()
      const b = setup(
        [slot('garchomp', { ...jolly, moves: moves('taunt', 'dragonclaw') })],
        [slot('slowbro', { ability, moves: moves('recover', 'scald') })],
      )
      b.state.value!.sides.opp.mons[0]!.hp = 30
      const r = open(b)
      const x = r.ranked.find((x) => isMove(r.options[x.index]!, 'taunt'))!
      const j = r.opp.findIndex((o) => o.kind === 'move' && o.move === 'recover')
      return x.outcomes[j]!.score
    }
    expect(score('regenerator')).toBeGreaterThan(score('oblivious'))
  })
})

describe('utils/recommend — 길동무', () => {
  it('먼저 쓰고 쓰러지면 상대도 쓰러짐, 나중이면 효과 없음', () => {
    const x = ex({ opp: hit(1, 1, 1), myDestinyBond: true })
    expect(evaluate(x).oppKo).toBe(1)
    expect(evaluate({ ...x, pFirst: 0 }).oppKo).toBe(0)
  })
})

describe('useRecommend — 데이터에 효과가 없는 기술', () => {
  const jolly = { nature: 'jolly', sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } }
  const pick = (r: ReturnType<typeof open>, move: string) =>
    r.ranked.find((x) => isMove(r.options[x.index]!, move))!

  it('잠자기: HP 가 적으면 크게 회복, 가득이면 실패', () => {
    const loss = (hp: number) => {
      resetNuxtState()
      const b = setup(
        [slot('snorlax', { moves: moves('rest', 'bodyslam') })],
        [slot('slowbro', { moves: moves('scald') })],
      )
      const m = b.state.value!.sides.mine.mons[0]!
      m.hp = Math.round(b.maxHp('mine', 0) * hp)
      return pick(open(b), 'rest').summary.myLoss
    }
    expect(loss(0.3)).toBeLessThan(0)
    expect(loss(1)).toBeGreaterThan(0)
  })

  it('아픔나누기: 내 HP 가 적으면 상대 HP 를 깎고 나는 회복', () => {
    const b = setup(
      [slot('gengar', { moves: moves('painsplit', 'shadowball') })],
      [slot('snorlax', { moves: moves('bodyslam') })],
    )
    const m = b.state.value!.sides.mine.mons[0]!
    m.hp = Math.round(b.maxHp('mine', 0) * 0.2)
    const s = pick(open(b), 'painsplit').summary
    expect(s.oppLoss).toBeGreaterThan(0.2)
  })

  it('울부짖기: 랭크를 올린 상대를 공개된 대기 포켓몬으로 바꾸면 이후 맞대결이 좋아짐', () => {
    const duel = (withBench: boolean) => {
      resetNuxtState()
      const b = setup(
        [slot('garchomp', { ...jolly, moves: moves('roar', 'earthquake') })],
        [
          slot('snorlax', { moves: moves('bodyslam') }),
          ...(withBench ? [slot('incineroar', { moves: moves('flareblitz') })] : []),
        ],
      )
      if (withBench) {
        b.sendOut('opp', 0, 1)
        b.sendOut('opp', 0, 0)
      }
      b.state.value!.sides.opp.mons[0]!.boosts.atk = 4
      useRecWeights().set('oppSwitch', 0)
      return pick(open(b), 'roar').summary.duel
    }
    expect(duel(true)).toBeGreaterThan(duel(false))
  })

  it('흑안개: 먼저 쓰면 이번 턴 상대 공격도 랭크 없이 → 점수가 더 높음', () => {
    const duel = (move: string) => {
      resetNuxtState()
      const b = setup(
        [slot('gengar', { ...jolly, moves: moves(move, 'sludgebomb') })],
        [slot('snorlax', { moves: moves('crunch') })],
      )
      b.state.value!.sides.opp.mons[0]!.boosts.atk = 2
      return pick(open(b), move).expected
    }
    expect(duel('haze')).toBeGreaterThan(duel('calmmind'))
  })
})
