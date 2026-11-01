// tests/recommend.test.ts — 추천 플레이 (utils/recommend.ts 계산 + composables/useRecommend.ts 배틀 상태 연결)

import { resetNuxtState, slot } from './nuxt-env'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBattle } from '../composables/useBattle'
import { PICK_COUNT, useEntry } from '../composables/useEntry'
import { useTeam } from '../composables/useTeam'
import {
  useRecOppPrefs,
  useRecWeights,
  useRecommend,
  type MineOption,
} from '../composables/useRecommend'
import {
  DEFAULT_WEIGHTS,
  advanceSkip,
  cappedDamage,
  duelValue,
  evaluate,
  firstChance,
  hitsToKo,
  normalizeWeights,
  outlook,
  rankOptions,
  safest,
  skipDist,
  responseWeights,
  playWeights,
  comboHit,
  blendOutcome,
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

  it('맞대결: 기합의띠·옹골참이면 HP 가 가득일 때 한 번 더 맞아야 쓰러짐', () => {
    const d = { mine: 1.2, opp: 0.6, pFirst: 1 }
    expect(duelValue(d, 1, 1)).toBeGreaterThan(0) // 한 방
    // 상대가 버티면 2타 → 그 사이 상대도 2타를 침 (내가 먼저라 이기긴 하지만 HP 가 깎임)
    expect(duelValue({ ...d, holdOpp: true }, 1, 1)).toBeCloseTo(0.5 + 0.5 * 0.4)
    // 가득이 아니면 효과 없음
    expect(duelValue({ ...d, holdOpp: true }, 1, 0.9)).toBeCloseTo(duelValue(d, 1, 0.9))
  })

  it('맞대결: 멸망의노래로 둘 다 먼저 쓰러지면 0, 내 카운트가 먼저 끝나면 짐', () => {
    const lose = { mine: 0.2, opp: 0.2, pFirst: 0 }
    expect(duelValue(lose, 1, 1)).toBeLessThan(0)
    expect(duelValue({ ...lose, perishMine: 2, perishOpp: 2 }, 1, 1)).toBe(0)
    expect(duelValue({ ...lose, perishMine: 1, perishOpp: 3 }, 1, 1)).toBeLessThan(-0.5)
    // 쓰러뜨리는 게 먼저면 그대로
    const win = { mine: 1, opp: 0.2, pFirst: 1 }
    expect(duelValue({ ...win, perishMine: 2, perishOpp: 2 }, 1, 1)).toBeCloseTo(
      duelValue(win, 1, 1),
    )
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

  it('상대 교체기: 상대가 먼저 쓰면 내 공격은 들어온 포켓몬이 받고, 맞대결도 그 포켓몬 기준', () => {
    const good = { mine: 0.6, opp: 0.1, pFirst: 1 }
    const bad = { mine: 0.1, opp: 0.6, pFirst: 0 }
    const x = ex({
      pFirst: 0,
      mine: hit(0.5, 0.5),
      opp: hit(0.2, 0.2),
      oppPivot: { oppHp: 1, entryChip: 0.125, mine: hit(0.1, 0.1) },
      after: [{ p: 1, duel: good }],
      afterOppPivot: [{ p: 1, duel: bad }],
    })
    const o = evaluate(x)
    // 상대 쪽: 설치기 0.125 + 들어온 포켓몬이 받은 0.1
    expect(o.oppLoss).toBeCloseTo(0.225)
    expect(o.duel).toBeLessThan(0)
    expect(o.ends).toEqual([
      {
        pivoted: false,
        oppPivoted: true,
        myAte: false,
        oppAte: false,
        p: 1,
        myHp: 0.8,
        oppHp: expect.closeTo(0.775),
      },
    ])
    // 내가 먼저면 원래 포켓몬이 맞고 나서 물러남
    const first = evaluate({ ...x, pFirst: 1 })
    expect(first.oppLoss).toBeCloseTo(0.625)
    // 먼저 쓰러뜨리면 물러나지 못함
    const ko = evaluate({ ...x, pFirst: 1, mine: hit(1, 1, 1) })
    expect(ko.oppKo).toBeCloseTo(1)
    expect(ko.ends).toEqual([])
  })

  it('교체기로 들어오는 포켓몬: 상대가 먼저 설치기를 깔았을 때만 그 데미지', () => {
    const x = ex({
      mine: null,
      opp: null,
      pivot: { myHp: 1, entryChip: 0, lateChip: 0.25, opp: null },
    })
    expect(evaluate({ ...x, pFirst: 1 }).myLoss).toBeCloseTo(0)
    expect(evaluate({ ...x, pFirst: 0 }).myLoss).toBeCloseTo(0.25)
  })

  it('되돌려 주는 기술: 나중에 움직여 받은 데미지 × 배율, 먼저면 실패', () => {
    const x = ex({ pFirst: 0, opp: hit(0.4, 0.4), mineRevenge: 2 })
    const o = evaluate(x)
    expect(o.myLoss).toBeCloseTo(0.4)
    expect(o.oppLoss).toBeCloseTo(0.8)
    // 받은 데미지 × 2 가 상대 HP 이상이면 쓰러뜨림
    expect(evaluate({ ...x, oppHp: 0.7 }).oppKo).toBeCloseTo(1)
    // 먼저 움직이면 받은 게 없어서 실패
    expect(evaluate({ ...x, pFirst: 1 }).oppLoss).toBe(0)
    // 상대가 공격하지 않으면 실패
    expect(evaluate({ ...x, opp: null }).oppLoss).toBe(0)
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

  it('상대 비중을 내 예상 선택과 주고받아 다듬음: 내가 고르지 않을 선택지에 끌려가지 않음', () => {
    const o = (score: number) => ({ ...evaluate(ex({})), score })
    // 내 0 번은 상대 0 에 강하고 1 에 약함. 1~4 번(쓸모없는 선택지)은 상대 0 에 크게 짐
    const junk = () => [o(-1), o(0.2)]
    const table = [[o(0.5), o(-0.5)], junk(), junk(), junk(), junk()]
    const naive = responseWeights([1, 1], table)
    const play = playWeights([1, 1], table)
    expect(naive[0]).toBeGreaterThan(naive[1]!)
    expect(play[1]).toBeGreaterThan(naive[1]!)
    expect(play[0]! + play[1]!).toBeCloseTo(1)
    // smart 0 이면 사전 비중 그대로
    expect(playWeights([1, 3], table, { ...DEFAULT_WEIGHTS, smart: 0 })[0]).toBeCloseTo(0.25)
  })

  it('협공: 둘이 합쳐 쓰러뜨리는 확률 · 남은 HP 로 자른 데미지', () => {
    const h = { min: 0.3, max: 0.4, acc: 1, ko: 0 }
    expect(comboHit(h, h, 0.6).ko).toBeCloseTo(1)
    expect(comboHit(h, h, 0.6).dealt).toBeCloseTo(0.6)
    expect(comboHit(h, h, 1).ko).toBe(0)
    expect(comboHit(h, h, 1).dealt).toBeCloseTo(0.7)
    // 하나가 빗나갈 수 있으면 그만큼
    expect(comboHit(h, { ...h, acc: 0.5 }, 0.6).ko).toBeCloseTo(0.5)
    const a = { ...evaluate(ex({})), score: 1 }
    const z = { ...evaluate(ex({})), score: -1 }
    expect(blendOutcome(a, z, 0.25).score).toBeCloseTo(-0.5)
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
// 바로 계산 (화면은 1턴을 먼저 보여 주고 깊은 계산은 이어서 하지만, 테스트는 기다리지 않고)
const open = (b: ReturnType<typeof setup>) => useRecommend(b).run()!
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

  it('스텔스록: 먼저 교체하면 들어간 포켓몬은 밟지 않고, 설치기 손해도 그 포켓몬을 뺀 앞으로 들어올 포켓몬 기준', () => {
    const b = setup(
      [
        slot('garchomp', { moves: moves('earthquake', 'dragonclaw') }),
        slot('charizard', { moves: moves('flamethrower') }),
        slot('rotomwash', { moves: moves('hydropump') }),
      ],
      [slot('glimmora', { moves: moves('stealthrock') })],
    )
    const r = open(b)
    const row = (to: number) =>
      r.ranked.find((x) => {
        const o = r.options[x.index]!
        return o.kind === 'switch' && o.to === to
      })!.outcomes[0]!
    // 리자몽(바위 4배)으로 교체: 리자몽은 이미 들어갔으므로 한카리아스(1/16)·워시로토무(1/8) 몫만
    expect(row(1).myLoss).toBe(0)
    expect(row(1).utility).toBeCloseTo(-0.7 * (1 / 16 + 1 / 8))
    // 워시로토무로 교체: 물러난 한카리아스와 리자몽이 앞으로 밟음
    expect(row(2).utility).toBeCloseTo(-0.7 * (1 / 16 + 1 / 2))
  })

  it('두 턴 앞: 이번 턴 깐 설치기는 계산 안에서만 반영하고 배틀 상태는 그대로', () => {
    const b = setup(
      [
        slot('garchomp', { moves: moves('dragonclaw') }),
        slot('charizard', { moves: moves('flamethrower') }),
      ],
      [slot('glimmora', { moves: moves('stealthrock', 'sludgebomb') })],
    )
    useRecWeights().setDepth(2)
    const r = open(b)
    expect(r.ranked.length).toBeGreaterThan(0)
    // 실제 상태는 바뀌지 않음
    expect(b.state.value!.sides.mine.hazards.stealthrock || 0).toBe(0)
  })

  it('역린: 두 턴 앞에서 다음 턴은 역린 고정·교체 불가', () => {
    const b = setup(
      [
        slot('garchomp', { moves: moves('outrage', 'earthquake') }),
        slot('incineroar', { moves: moves('flareblitz') }),
      ],
      [slot('gholdengo', { moves: moves('shadowball') })],
    )
    useRecWeights().setDepth(2)
    const r = open(b)
    const row = r.ranked.find((x) => isMove(r.options[x.index]!, 'outrage'))!
    const next = row.summary.next!
    // 강철에 반감인 역린이지만 고정 (안 고정되면 지진·교체를 고름)
    expect(next.option).toMatchObject({ kind: 'move', move: 'outrage' })
    const eq = r.ranked.find((x) => isMove(r.options[x.index]!, 'earthquake'))!
    expect(eq.summary.next!.option).not.toMatchObject({ move: 'outrage' })
  })

  it('배턴터치: 들어가는 포켓몬이 랭크를 넘겨받아 맞대결이 나아짐', () => {
    const duelAfter = (atk: number) => {
      resetNuxtState()
      const b = setup(
        [
          slot('garchomp', { moves: moves('batonpass', 'earthquake') }),
          slot('gholdengo', { moves: moves('makeitrain', 'shadowball') }),
        ],
        [slot('snorlax', { moves: moves('crunch') })],
      )
      b.state.value!.sides.mine.mons[0]!.boosts.spa = atk
      const r = open(b)
      const bp = r.ranked.find((x) => isMove(r.options[x.index]!, 'batonpass'))!
      return bp.outcomes[0]!.duel
    }
    expect(duelAfter(2)).toBeGreaterThan(duelAfter(0))
  })

  it('카운터: 물리 공격을 받으면 되돌려 주고, 특수 공격이면 실패', () => {
    const dealt = (oppMove: string) => {
      resetNuxtState()
      const b = setup(
        [slot('snorlax', { moves: moves('counter', 'bodyslam') })],
        [slot('garchomp', { moves: moves(oppMove) })],
      )
      const r = open(b)
      return r.ranked.find((x) => isMove(r.options[x.index]!, 'counter'))!.summary.oppLoss
    }
    expect(dealt('earthquake')).toBeGreaterThan(0.3)
    expect(dealt('dracometeor')).toBe(0)
  })

  it('이번 턴 끝나는 트릭룸은 턴 뒤 맞대결에서 빼고 봄', () => {
    const duel = (left: number) => {
      resetNuxtState()
      const b = setup(
        [slot('snorlax', { moves: moves('bodyslam') })],
        [slot('garchomp', { moves: moves('dragonclaw') })],
      )
      b.state.value!.rooms.trickroom = { cur: 5 - left, total: 5 }
      const r = open(b)
      return r.ranked.find((x) => isMove(r.options[x.index]!, 'bodyslam'))!.summary.duel
    }
    // 트릭룸이 남으면 느린 잠만보가 먼저 → 끝나면 한카리아스가 먼저라 전망이 나빠짐
    expect(duel(1)).toBeLessThan(duel(3))
  })

  it('멸망의노래: 카운트 1 이면 기술을 쓰면 쓰러지고 교체하면 살아남음', () => {
    const b = setup(
      [
        slot('garchomp', { moves: moves('dragonclaw') }),
        slot('gholdengo', { moves: moves('makeitrain') }),
      ],
      [slot('snorlax', { moves: moves('bodyslam') })],
    )
    b.state.value!.sides.mine.mons[0]!.volatiles.perishsong = 1
    const r = open(b)
    const dc = r.ranked.find((x) => isMove(r.options[x.index]!, 'dragonclaw'))!
    expect(dc.summary.myKo).toBeCloseTo(1)
    const sw = r.ranked.find((x) => r.options[x.index]!.kind === 'switch')!
    expect(sw.summary.myKo).toBe(0)
    expect(r.best).toBe(sw.index)
  })

  it('멸망의노래: 지는 맞대결이면 무승부로 끌고 감', () => {
    const b = setup(
      [slot('gengar', { moves: moves('perishsong', 'shadowball') })],
      [slot('tyranitar', { moves: moves('icebeam') })],
    )
    // 서로 오래 걸리는 맞대결 (내 쪽이 조금 느리게 짐)
    b.state.value!.sides.mine.mons[0]!.boosts.spa = -6
    b.state.value!.sides.opp.mons[0]!.boosts.spa = -2
    const r = open(b)
    const duel = (m: string) =>
      r.ranked.find((x) => isMove(r.options[x.index]!, m))!.outcomes[0]!.duel
    expect(duel('perishsong')).toBeGreaterThan(duel('shadowball'))
  })

  it('회생의기도: 쓰러진 포켓몬이 있을 때만 HP 1/2 + 쓰러짐 하나만큼 가치', () => {
    const b = setup(
      [
        slot('pawmot', { moves: moves('revivalblessing', 'nuzzle') }),
        slot('garchomp', { moves: moves('earthquake') }),
        slot('gholdengo', { moves: moves('makeitrain') }),
      ],
      [slot('snorlax', { moves: moves('bodyslam') })],
    )
    const rb = () => {
      const r = open(b)
      return r.ranked.find((x) => isMove(r.options[x.index]!, 'revivalblessing'))!.outcomes[0]!
    }
    expect(rb().revive).toBe(0)
    b.state.value!.sides.mine.mons[1]!.hp = 0
    const o = rb()
    expect(o.revive).toBeGreaterThan(0.5)
    // 두 턴 앞에서도 계산됨 (되살린 포켓몬이 다음 턴 교체 후보)
    useRecWeights().setDepth(2)
    expect(open(b).ranked.length).toBeGreaterThan(0)
  })

  it('아직 안 나온 상대 파티: 남은 선출 수만큼 나눈 비중으로 교체 후보, 교체기는 들어올 포켓몬마다', () => {
    const b = setup(
      [slot('garchomp', { moves: moves('earthquake', 'dragonclaw') })],
      [
        slot('incineroar', { moves: moves('flareblitz', 'uturn') }),
        slot('corviknight', { moves: moves('bravebird') }),
        slot('gholdengo', { moves: moves('makeitrain') }),
        slot('rotomwash', { moves: moves('hydropump') }),
      ],
    )
    const r = open(b)
    // 선두만 공개 → 남은 선출 2 / 후보 3
    const sw = r.opp
      .filter((o) => o.kind === 'switch')
      .map((o) => (o.kind === 'switch' ? o.to : -1))
    expect(sw).toEqual([1, 2, 3])
    const uturn = r.opp.filter((o) => o.kind === 'move' && o.move === 'uturn')
    expect(uturn.map((o) => (o.kind === 'move' ? o.pivotTo : -1))).toEqual([1, 2, 3])
    expect(r.opp.reduce((s, o) => s + o.weight, 0)).toBeCloseTo(1)
    // 선출 3 마리가 다 공개되면 나머지는 후보가 아님
    b.sendOut('opp', 0, 1)
    b.sendOut('opp', 0, 2)
    b.sendOut('opp', 0, 0)
    const r2 = open(b)
    expect(
      r2.opp.filter((o) => o.kind === 'switch').map((o) => (o.kind === 'switch' ? o.to : -1)),
    ).toEqual([1, 2])
    // 두 턴 앞도 계산됨
    useRecWeights().setDepth(2)
    expect(open(b).ranked.length).toBeGreaterThan(0)
  })

  it('상대 교체기로 들어오는 포켓몬이 위협이면 턴 뒤 맞대결이 더 나쁨', () => {
    const duelAgainst = (ability: string) => {
      resetNuxtState()
      const b = setup(
        [slot('garchomp', { moves: moves('earthquake', 'dragonclaw') })],
        [
          slot('corviknight', { moves: moves('uturn', 'bodypress') }),
          slot('snorlax', { ability, moves: moves('bodyslam') }),
        ],
      )
      const r = open(b)
      const j = r.opp.findIndex((o) => o.kind === 'move' && o.move === 'uturn' && o.pivotTo === 1)
      const dc = r.ranked.find((x) => isMove(r.options[x.index]!, 'earthquake'))!
      expect(dc.outcomes[j]!.ends.some((e) => e.oppPivoted)).toBe(true)
      return dc.outcomes[j]!.duel
    }
    expect(duelAgainst('intimidate')).toBeLessThan(duelAgainst('thickfat'))
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
    expect(o.ends).toEqual([
      {
        pivoted: false,
        oppPivoted: false,
        myAte: false,
        oppAte: false,
        p: 1,
        myHp: 0.8,
        oppHp: expect.closeTo(0.7),
      },
    ])
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

describe('utils/recommend — 맞대결 보정 · 점수 구성 · 승산', () => {
  it('쓰러뜨리는 타수: 열매·기합의띠·첫 공격 배율(탈)·가득일 때 배율(멀티스케일)', () => {
    expect(hitsToKo(1, 0.4)).toBe(3)
    // 0.6 에서 1/2 이하가 아니라 0.2 에서 먹음 → 0.45 → 2타 더
    expect(hitsToKo(1, 0.4, { berry: 0.25 })).toBe(4)
    expect(hitsToKo(1, 1.2, { hold: true })).toBe(2)
    expect(hitsToKo(0.9, 1.2, { hold: true })).toBe(1)
    expect(hitsToKo(1, 0.5, { first: 0.1 })).toBe(3)
    expect(hitsToKo(1, 0.6, { full: 0.5 })).toBe(3)
    expect(hitsToKo(0.9, 0.6, { full: 0.5 })).toBe(2)
    expect(hitsToKo(1, 0.0001)).toBe(Infinity)
  })

  it('턴 뒤 전망: 대기 포켓몬이 더 잘 받으면 그 차이를 bench 가중치만큼', () => {
    const field = { p: 1, duel: { mine: 0.3, opp: 0.6, pFirst: 0 } }
    const base = outlook(field, 1, 1)
    expect(base).toBeLessThan(0)
    const withBench = outlook(
      { ...field, benchMine: [{ duel: { mine: 0.6, opp: 0.2, pFirst: 1 }, hp: 1 }] },
      1,
      1,
    )
    expect(withBench).toBeGreaterThan(base)
    expect(
      outlook(
        { ...field, benchMine: [{ duel: { mine: 0.6, opp: 0.2, pFirst: 1 }, hp: 1 }] },
        1,
        1,
        { ...DEFAULT_WEIGHTS, bench: 0 },
      ),
    ).toBeCloseTo(base)
  })

  it('점수 구성의 합 = 점수, 재생력 교체는 받는 손해를 줄임, 열매는 1/2 이하에서 회복', () => {
    const x = ex({ mine: hit(0.3, 0.3), opp: hit(0.2, 0.2) })
    const o = evaluate(x)
    const sum = o.parts.damage + o.parts.ko + o.parts.hazard + o.parts.future
    expect(sum).toBeCloseTo(o.score)
    const sw = ex({ switchIn: true, opp: hit(0.2, 0.2) })
    expect(evaluate({ ...sw, myRegen: { hp: 0.5, heal: 1 / 3 } }).myLoss).toBeCloseTo(
      evaluate(sw).myLoss - 1 / 3,
    )
    const big = ex({ opp: hit(0.6, 0.6) })
    expect(evaluate({ ...big, myBerry: 0.25 }).myLoss).toBeCloseTo(0.35)
    expect(evaluate({ ...big, myBerry: 0.25 }).ends[0]!.myAte).toBe(true)
  })

  it('승산: 마지막 포켓몬을 쓰러뜨리면 1, 쓰러지면 0', () => {
    expect(evaluate(ex({ mine: hit(1, 1, 1), oppLeft: 0 })).win).toBe(1)
    expect(evaluate(ex({ pFirst: 0, opp: hit(1, 1, 1), myLeft: 0 })).win).toBe(0)
    // 남은 포켓몬이 있으면 결판은 아님
    expect(evaluate(ex({ mine: hit(1, 1, 1), oppLeft: 2 })).win).toBeLessThan(1)
  })
})

describe('useRecommend — 도구 · 특성', () => {
  const jolly = { nature: 'jolly', sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } }
  const pick = (r: ReturnType<typeof open>, f: (o: MineOption) => boolean) =>
    r.ranked.find((x) => f(r.options[x.index]!))!

  it('울퉁불퉁멧: 접촉 공격을 쓰면 내가 잃는 HP 가 늘어남', () => {
    const loss = (item: string) => {
      resetNuxtState()
      const b = setup(
        [slot('garchomp', { ...jolly, moves: moves('dragonclaw') })],
        [slot('corviknight', { item, moves: moves('roost') })],
      )
      return pick(open(b), (o) => isMove(o, 'dragonclaw')).summary.myLoss
    }
    expect(loss('rockyhelmet') - loss('leftovers')).toBeGreaterThan(0.1)
  })

  it('매직미러: 스텔스록은 내 쪽에 깔림 (설치기 가치가 음수)', () => {
    const util = (ability: string) => {
      resetNuxtState()
      const b = setup(
        [
          slot('garchomp', { ...jolly, moves: moves('stealthrock', 'dragonclaw') }),
          slot('gholdengo', { moves: moves('makeitrain') }),
          slot('charizard', { moves: moves('flamethrower') }),
        ],
        [slot('hatterene', { ability, moves: moves('psychic') })],
      )
      return pick(open(b), (o) => isMove(o, 'stealthrock')).summary.utility
    }
    expect(util('healer')).toBeGreaterThan(0)
    expect(util('magicbounce')).toBeLessThan(0)
  })

  it('황금몸: 상대에게 거는 변화기는 실패', () => {
    const b = setup(
      [slot('rotomwash', { moves: moves('willowisp', 'hydropump') })],
      [slot('gholdengo', { moves: moves('makeitrain') })],
    )
    const r = open(b)
    const wisp = pick(r, (o) => isMove(o, 'willowisp'))
    // 화상이 걸리지 않으므로 이후 맞대결이 나아지지 않음 — 받는 데미지만
    expect(wisp.summary.oppLoss).toBe(0)
    expect(wisp.summary.duel).toBeLessThanOrEqual(
      pick(r, (o) => isMove(o, 'hydropump')).summary.duel,
    )
  })

  it('재생력: 물러나는 포켓몬이 회복하는 만큼 교체 손해가 줄어듦', () => {
    const loss = (ability: string) => {
      resetNuxtState()
      const b = setup(
        [slot('slowbro', { ability, moves: moves('scald') }), slot('garchomp')],
        [slot('incineroar', { moves: moves('flareblitz') })],
      )
      const m = b.state.value!.sides.mine.mons[0]!
      m.hp = Math.round(b.maxHp('mine', 0) * 0.5)
      return pick(open(b), (o) => o.kind === 'switch').summary.myLoss
    }
    expect(loss('oblivious') - loss('regenerator')).toBeCloseTo(1 / 3, 2)
  })

  it('잠꼬대: 잠들어 있을 때만 선택지, 다른 기술로 데미지', () => {
    const b = setup(
      [slot('snorlax', { moves: moves('sleeptalk', 'bodyslam', 'rest') })],
      [slot('garchomp', { moves: moves('earthquake') })],
    )
    expect(open(b).options.some((o) => isMove(o, 'sleeptalk'))).toBe(false)
    const m = b.state.value!.sides.mine.mons[0]!
    m.status = 'slp'
    m.toxicTurn = 0
    const r = open(b)
    expect(pick(r, (o) => isMove(o, 'sleeptalk')).summary.oppLoss).toBeGreaterThan(0)
  })

  it('트집: 지난 턴 기술은 선택지에서 빠짐', () => {
    const b = setup(
      [slot('garchomp', { moves: moves('earthquake', 'dragonclaw') })],
      [slot('charizard', { moves: moves('flamethrower') })],
    )
    const m = b.state.value!.sides.mine.mons[0]!
    m.lastMove = 'dragonclaw'
    m.volatiles.torment = 1
    expect(open(b).options.some((o) => isMove(o, 'dragonclaw'))).toBe(false)
  })
})

describe('useRecommend — 메가진화 시점 · 상대 비중 · 깊이', () => {
  it('메가진화할 수 있으면 이번 턴 메가 / 미룸 둘 다 선택지', () => {
    const b = setup(
      [slot('garchomp', { item: 'garchompite', moves: moves('earthquake', 'dragonclaw') })],
      [slot('charizard', { moves: moves('flamethrower') })],
    )
    const eq = open(b).options.filter((o) => isMove(o, 'earthquake'))
    expect(eq.map((o) => o.kind === 'move' && o.mega).sort()).toEqual([false, true])
  })

  it('상대도 메가진화할 수 있으면 같은 기술을 "메가 미룸"으로도 (비중은 메가보다 작음)', () => {
    const b = setup(
      [slot('gholdengo', { moves: moves('shadowball') })],
      [slot('garchomp', { item: 'garchompite', moves: moves('earthquake') })],
    )
    const r = open(b)
    const eq = r.opp.filter((o) => o.kind === 'move' && o.move === 'earthquake')
    expect(eq).toHaveLength(2)
    const delayed = eq.find((o) => o.kind === 'move' && o.noMega)!
    const mega = eq.find((o) => o.kind === 'move' && !o.noMega)!
    expect(delayed.weight).toBeLessThan(mega.weight)
    // 메가 전 폼의 지진은 메가 폼보다 약함 → 받는 데미지가 작음
    const row = r.ranked[0]!.outcomes
    expect(row[r.opp.indexOf(delayed)]!.myLoss).toBeLessThan(row[r.opp.indexOf(mega)]!.myLoss)
  })

  it('상대 선택지를 "안 씀"으로 바꾸면 비중 0, "자주 씀"이면 커짐', () => {
    const b = setup(
      [slot('garchomp', { moves: moves('earthquake', 'dragonclaw') })],
      [slot('charizard', { moves: moves('flamethrower', 'airslash') })],
    )
    const sig = b.state.value!.signature
    const weightOf = (move: string) =>
      open(b).opp.find((o) => o.kind === 'move' && o.move === move)!.weight
    const before = weightOf('airslash')
    const prefs = useRecOppPrefs()
    prefs.cycle(sig, 0, { kind: 'move', move: 'airslash' })
    expect(weightOf('airslash')).toBeGreaterThan(before)
    prefs.cycle(sig, 0, { kind: 'move', move: 'airslash' })
    expect(weightOf('airslash')).toBe(0)
    prefs.cycle(sig, 0, { kind: 'move', move: 'airslash' })
    expect(weightOf('airslash')).toBeCloseTo(before)
  })

  it('상대가 교체를 자주 했으면 교체 비중이 커짐', () => {
    const b = setup(
      [slot('garchomp', { moves: moves('earthquake') })],
      [slot('charizard', { moves: moves('flamethrower') }), slot('gholdengo')],
    )
    b.sendOut('opp', 0, 1)
    b.sendOut('opp', 0, 0)
    const sw = () =>
      open(b)
        .opp.filter((o) => o.kind === 'switch')
        .reduce((a, o) => a + o.weight, 0)
    const before = sw()
    const act = (kind: 'move' | 'switch') => ({
      idx: 0,
      kind,
      move: kind === 'move' ? 'flamethrower' : '',
      switchTo: kind === 'switch' ? 1 : null,
      selfSwitch: null,
      mega: false,
    })
    b.state.value!.log = [1, 2, 3, 4].map((turn) => ({
      turn,
      mine: [act('move')],
      opp: [act('switch')],
    }))
    expect(sw()).toBeGreaterThan(before)
  })

  it('3턴 앞: 계산되고 다음 턴 추천이 붙음', () => {
    useRecWeights().setDepth(3)
    const b = setup(
      [
        slot('garchomp', { moves: moves('earthquake', 'swordsdance') }),
        slot('gholdengo', { moves: moves('makeitrain') }),
        slot('rotomwash', { moves: moves('hydropump') }),
      ],
      [slot('incineroar', { moves: moves('flareblitz', 'knockoff') })],
    )
    const r = open(b)
    expect(r.depth).toBe(3)
    expect(r.ranked.some((x) => x.summary.next)).toBe(true)
  })

  it('끝판: 남은 포켓몬이 적으면 세 턴(1:1 이면 네 턴) 앞까지 + 승산', () => {
    const b = setup(
      [slot('garchomp', { moves: moves('earthquake', 'dragonclaw') })],
      [slot('incineroar', { moves: moves('flareblitz') }), slot('gholdengo')],
    )
    // 상대 선출 3 중 둘이 쓰러졌다고 (공개 후 HP 0)
    const opp = b.state.value!.sides.opp
    opp.revealed.push(1, 2)
    opp.mons[1]!.hp = 0
    opp.mons[2]!.hp = 0
    const r = open(b)
    expect(r.endgame).toBe(true)
    // 1:1 이면 네 턴 앞까지
    expect(r.depth).toBe(4)
    for (const x of r.ranked) expect(x.summary.win).toBeGreaterThanOrEqual(0)
  })

  it('턴 적용 때 행동과 그 턴 추천 결과를 기록', () => {
    const b = setup(
      [slot('garchomp', { moves: moves('earthquake', 'dragonclaw') })],
      [slot('charizard', { moves: moves('flamethrower') })],
    )
    const s = b.state.value!
    s.recNote = {
      turn: s.turn,
      depth: 1,
      slots: [
        {
          slot: 0,
          best: 0,
          safe: 0,
          options: [{ pick: { kind: 'move', move: 'dragonclaw', mega: false }, expected: 0.3 }],
        },
      ],
    }
    Object.assign(s.actions.mine[0]!, { kind: 'move', move: 'dragonclaw' })
    Object.assign(s.actions.opp[0]!, { kind: 'move', move: 'flamethrower' })
    b.executeTurn()
    const log = b.state.value!.log!
    expect(log).toHaveLength(1)
    expect(log[0]!.mine[0]!.move).toBe('dragonclaw')
    expect(log[0]!.rec?.slots[0]!.best).toBe(0)
    expect(b.state.value!.recNote).toBeNull()
  })
})

describe('useRecommend: 더블', () => {
  const setup2 = (mine: TeamSlot[], opp: TeamSlot[]) => {
    useTeam('mine').slots.value = pad6(mine)
    useTeam('opp').slots.value = pad6(opp)
    useEntry('double').picks.value = mine.map((_, i) => i).slice(0, PICK_COUNT.double)
    const b = useBattle('double')
    b.ensure()
    b.sendOut('opp', 0, 0)
    b.sendOut('opp', 1, 1)
    return b
  }

  it('내 필드 칸마다 순위, 한 대상 기술은 상대 칸마다, 광역기·교체는 한 줄', () => {
    const b = setup2(
      [
        slot('garchomp', { moves: moves('earthquake', 'dragonclaw', 'protect') }),
        slot('incineroar', { moves: moves('flareblitz', 'fakeout') }),
        slot('gholdengo', { moves: moves('makeitrain') }),
      ],
      [
        slot('charizard', { moves: moves('flamethrower', 'airslash') }),
        slot('kingambit', { moves: moves('kowtowcleave', 'suckerpunch') }),
      ],
    )
    const r = useRecommend(b).runDoubles()!
    expect(r.slots.map((x) => x.slot)).toEqual([0, 1])
    const chomp = r.slots[0]!
    expect(r.foes).toHaveLength(2)
    const of = (move: string) => chomp.plans.filter((p) => isMove(p.option, move))
    expect(
      of('dragonclaw')
        .map((p) => p.target)
        .sort(),
    ).toEqual([0, 1])
    expect(of('earthquake').map((p) => p.target)).toEqual([null])
    expect(of('protect')).toHaveLength(1)
    // 교체 대상은 필드에 없는 포켓몬만 (사로벨 → 2)
    const sw = chomp.plans.filter((p) => p.option.kind === 'switch')
    expect(sw.map((p) => (p.option.kind === 'switch' ? p.option.to : -1))).toEqual([2])
    // 리자몽 쪽 드래곤클로가 지진(리자몽에 무효)보다 위
    const rank = (p: (typeof chomp.plans)[number]) => chomp.plans.indexOf(p)
    const clawZard = of('dragonclaw').find((p) => p.target === 0)!
    expect(rank(clawZard)).toBeLessThan(rank(of('earthquake')[0]!))
    expect(chomp.safe).toBeGreaterThanOrEqual(0)
  })

  it('두 칸 조합: 같은 포켓몬으로 교체하는 조합은 없음, 상대 비중은 상대 포켓몬마다 합 1', () => {
    const b = setup2(
      [
        slot('garchomp', { moves: moves('earthquake', 'dragonclaw', 'protect') }),
        slot('incineroar', { moves: moves('flareblitz', 'fakeout') }),
        slot('gholdengo', { moves: moves('makeitrain') }),
      ],
      [
        slot('charizard', { moves: moves('flamethrower', 'airslash') }),
        slot('kingambit', { moves: moves('kowtowcleave', 'suckerpunch') }),
      ],
    )
    const r = useRecommend(b).runDoubles()!
    expect(r.combos.length).toBeGreaterThan(0)
    for (const f of r.foes) expect(f.opp.reduce((a, o) => a + o.weight, 0)).toBeCloseTo(1)
    const into = (slot: number, k: number) => {
      const o = r.slots.find((x) => x.slot === slot)!.plans[k]!.option
      return o.kind === 'switch' ? o.to : (o.pivotTo ?? null)
    }
    for (const c of r.combos) {
      const [a, z] = c.picks.map((p) => into(p.slot, p.plan))
      if (a != null) expect(a).not.toBe(z)
    }
    // 기대값 순
    for (let k = 1; k < r.combos.length; k++)
      expect(r.combos[k - 1]!.expected).toBeGreaterThanOrEqual(r.combos[k]!.expected)
  })

  it('쓰러진 칸은 들어갈 포켓몬 추천 (필드에 있는 아군은 후보 아님)', () => {
    const b = setup2(
      [
        slot('garchomp', { moves: moves('earthquake') }),
        slot('incineroar', { moves: moves('flareblitz') }),
        slot('gholdengo', { moves: moves('makeitrain') }),
        slot('venusaur', { moves: moves('gigadrain') }),
      ],
      [
        slot('charizard', { moves: moves('flamethrower') }),
        slot('kingambit', { moves: moves('kowtowcleave') }),
      ],
    )
    b.state.value!.sides.mine.mons[0]!.hp = 0
    const r = useRecommend(b).runDoubles()!
    const rep = r.slots.find((x) => x.slot === 0)!
    expect(rep.mode).toBe('replace')
    const to = rep.plans.map((p) => (p.option.kind === 'switch' ? p.option.to : -1)).sort()
    expect(to).toEqual([2, 3])
    expect(r.slots.find((x) => x.slot === 1)!.mode).toBe('turn')
  })

  it('싱글 계산은 하지 않음', () => {
    const b = setup2(
      [slot('garchomp', { moves: moves('earthquake') }), slot('incineroar')],
      [slot('charizard'), slot('kingambit')],
    )
    const rec = useRecommend(b)
    rec.enabled.value = true
    expect(rec.result.value).toBeNull()
  })
})

describe('useRecommend: 하양허브', () => {
  it('자기 랭크가 떨어지는 기술의 턴 뒤 전망이 하양허브면 덜 나빠짐', () => {
    const score = (item: string) => {
      resetNuxtState()
      const b = setup(
        [slot('garchomp', { item, moves: moves('dracometeor', 'earthquake') })],
        [slot('dragonite', { moves: moves('extremespeed') })],
      )
      const r = open(b)
      const x = r.ranked.find((y) => isMove(r.options[y.index]!, 'dracometeor'))!
      return x.summary.duel
    }
    expect(score('whiteherb')).toBeGreaterThan(score('leftovers'))
  })
})
