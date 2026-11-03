// tests/vs.test.ts — VS 화면 (utils/vs.ts 필드 변환·행동 순서, composables/useVs.ts 양방향 계산)

import { gameData, resetNuxtState } from './nuxt-env'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { calculate, Field, Generations, Move, Pokemon, Side } from '@smogon/calc'
import { emptyVsField, emptyVsMon, hpFromPct, vsFieldState, vsOrder, vsPriority } from '../utils/vs'
import type { Move as MoveData } from '../utils/types'
import { useVs } from '../composables/useVs'

const moves = JSON.parse(
  readFileSync(new URL('../public/data/moves.json', import.meta.url), 'utf8'),
) as Record<string, MoveData>

describe('vsFieldState', () => {
  it('벽은 맞는 쪽 것만, 프렌드가드는 더블에서만', () => {
    const def = { ...emptyVsMon(), reflect: true, friendGuard: true }
    expect(vsFieldState(emptyVsField(), def)).toMatchObject({
      reflect: true,
      lightScreen: false,
      friendGuard: false,
    })
    expect(vsFieldState({ ...emptyVsField(), doubles: true }, def).friendGuard).toBe(true)
  })

  it('공용 상태를 그대로 넘긴다', () => {
    const f = emptyVsField()
    f.weather = 'rain'
    f.terrain = 'psychic'
    f.rooms.gravity = true
    f.rooms.wonderroom = true
    f.rooms.magicroom = true
    expect(vsFieldState(f)).toMatchObject({
      weather: 'rain',
      terrain: 'psychic',
      gravity: true,
      wonderRoom: true,
      magicRoom: true,
    })
  })
})

describe('hpFromPct', () => {
  it('내림, 최소 1', () => {
    expect(hpFromPct(201, 50)).toBe(100)
    expect(hpFromPct(201, 100)).toBe(201)
    expect(hpFromPct(50, 1)).toBe(1)
  })
})

describe('vsOrder', () => {
  const m = (speed: number, priority = 0) => ({ speed, priority })
  it('빠른 쪽 먼저', () => {
    expect(vsOrder(m(100), m(90), false)).toEqual({ first: 'left', reason: 'speed' })
    expect(vsOrder(m(90), m(100), false)).toEqual({ first: 'right', reason: 'speed' })
  })
  it('트릭룸이면 느린 쪽 먼저', () => {
    expect(vsOrder(m(100), m(90), true)).toEqual({ first: 'right', reason: 'trickroom' })
  })
  it('우선도가 스피드·트릭룸보다 먼저', () => {
    expect(vsOrder(m(50, 1), m(100), false)).toEqual({ first: 'left', reason: 'priority' })
    expect(vsOrder(m(100, 1), m(50), true)).toEqual({ first: 'left', reason: 'priority' })
  })
  it('같은 속도', () => {
    expect(vsOrder(m(100), m(100), true)).toEqual({ first: null, reason: 'tie' })
  })
})

describe('vsPriority', () => {
  it('기술 우선도 + 질풍날개(HP 가득일 때만)', () => {
    expect(vsPriority(moves.quickattack!, '', true)).toBe(1)
    expect(vsPriority(moves.bravebird!, 'galewings', true)).toBe(1)
    expect(vsPriority(moves.bravebird!, 'galewings', false)).toBe(0)
    expect(vsPriority(null, 'galewings', true)).toBe(0)
  })
})

describe('useVs', () => {
  beforeEach(() => resetNuxtState())

  const set = (vs: ReturnType<typeof useVs>) => {
    vs.setSpecies('left', 'garchomp')
    vs.setSpecies('right', 'gyarados')
    const l = vs.state.value.left
    l.slot.nature = 'adamant'
    l.slot.sp.atk = 32
    l.slot.moves[0] = 'earthquake'
    const r = vs.state.value.right
    r.slot.sp.hp = 32
    r.slot.moves[0] = 'waterfall'
  }

  // 능력 포인트 32 = 노력치 252 (tests/damage.test.ts 와 같은 환산)
  const smogon = (opts: { field?: Partial<Field>; defSide?: Partial<Side>; boosts?: number }) =>
    calculate(
      Generations.get(9),
      new Pokemon(Generations.get(9), 'Garchomp', {
        level: 50,
        nature: 'Adamant',
        ability: 'Sand Veil',
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        evs: { atk: 252 },
        boosts: { atk: opts.boosts ?? 0 },
      }),
      new Pokemon(Generations.get(9), 'Tyranitar', {
        level: 50,
        nature: 'Serious',
        ability: 'Sand Stream',
        evs: { hp: 252 },
      }),
      new Move(Generations.get(9), 'Earthquake'),
      new Field({ defenderSide: new Side(opts.defSide ?? {}), ...opts.field }),
    )

  it('양쪽 포켓몬·기술이 있으면 양방향 결과와 난수 16개', () => {
    const vs = useVs()
    expect(vs.leftToRight.value).toBeNull()
    set(vs)
    const a = vs.leftToRight.value!
    const b = vs.rightToLeft.value!
    expect(a.moveId).toBe('earthquake')
    expect(a.cell.immune).toBe(true) // 갸라도스는 비행 타입
    expect(b.rolls).toHaveLength(16)
    expect(b.cell.min).toBe(b.rolls[0])
    expect(b.cell.max).toBe(b.rolls[15])
  })

  it('기술이 없는 쪽 결과만 비어 있다', () => {
    const vs = useVs()
    set(vs)
    vs.state.value.right.slot.moves[0] = ''
    expect(vs.leftToRight.value).not.toBeNull()
    expect(vs.rightToLeft.value).toBeNull()
  })

  it('벽·랭크·날씨가 결과에 반영되고 @smogon/calc 와 같다', () => {
    const vs = useVs()
    set(vs)
    vs.setSpecies('right', 'tyranitar')
    vs.state.value.right.slot.sp.hp = 32
    expect(vs.leftToRight.value!.rolls).toEqual(smogon({}).damage)
    vs.state.value.right.reflect = true
    expect(vs.leftToRight.value!.rolls).toEqual(smogon({ defSide: { isReflect: true } }).damage)
    vs.state.value.left.reflect = true // 공격하는 쪽 벽은 상관없음
    expect(vs.leftToRight.value!.rolls).toEqual(smogon({ defSide: { isReflect: true } }).damage)
    vs.state.value.right.reflect = false
    vs.state.value.left.boosts.atk = 2
    expect(vs.leftToRight.value!.rolls).toEqual(smogon({ boosts: 2 }).damage)
  })

  it('더블이면 광역기 0.75배, 도우미 1.5배', () => {
    const vs = useVs()
    set(vs)
    vs.setSpecies('right', 'tyranitar')
    const single = vs.leftToRight.value!.cell.max
    vs.state.value.field.doubles = true
    const spread = vs.leftToRight.value!.cell.max
    expect(spread).toBeLessThan(single)
    expect(spread).toBeCloseTo(single * 0.75, -1)
    vs.state.value.left.helpingHand = true
    expect(vs.leftToRight.value!.cell.max).toBeGreaterThan(spread)
  })

  it('포켓몬을 바꾸면 특성은 그 포켓몬 첫 특성, 기술·도구·랭크는 초기화', () => {
    const vs = useVs()
    set(vs)
    const l = vs.state.value.left
    l.slot.item = 'choiceband'
    l.boosts.atk = 2
    vs.setSpecies('left', 'tyranitar')
    expect(l.slot.ability).toBe(gameData.pokemon.tyranitar!.abilities[0])
    expect(l.slot.item).toBe('')
    expect(l.slot.moves[0]).toBe('')
    expect(l.boosts.atk).toBe(0)
    expect(l.slot.sp.atk).toBe(32) // 능력 포인트는 유지
    vs.setSpecies('left', null)
    expect(l.slot.species).toBe('')
    expect(l.slot.sp.atk).toBe(0)
  })

  it('좌우 교체: 결과가 맞바뀐다', () => {
    const vs = useVs()
    set(vs)
    const before = vs.rightToLeft.value!.cell.max
    vs.swap()
    expect(vs.state.value.left.slot.species).toBe('gyarados')
    expect(vs.leftToRight.value!.cell.max).toBe(before)
  })

  it('스피드: 순풍·스카프·트릭룸', () => {
    const vs = useVs()
    set(vs)
    const base = vs.speed.value!
    expect(base.first).toBe('left') // 한카리아스 102 > 갸라도스 81
    vs.state.value.right.tailwind = true
    expect(vs.speed.value!.right).toBe(base.right * 2)
    expect(vs.speed.value!.first).toBe('right')
    vs.state.value.field.rooms.trickroom = true
    expect(vs.speed.value!.first).toBe('left')
    expect(vs.speed.value!.reason).toBe('trickroom')
  })
})
