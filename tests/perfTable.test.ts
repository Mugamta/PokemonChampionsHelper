// tests/perfTable.test.ts — 포켓몬 성능표 (utils/perfTable.ts)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bulkRow,
  hitsUsed,
  moveEntries,
  movePenalties,
  powerCandidates,
  powerRows,
  speedEntries,
  speedGroups,
} from '../utils/perfTable'
import type { Move, Pokemon } from '../utils/types'

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
const pokemon = load('pokemon') as Record<string, Pokemon>
const moves = load('moves') as Record<string, Move>
const mon = (id: string) => pokemon[id]!
const mv = (id: string) => moves[id]!
// 메가진화·배틀 폼은 원종의 습득 기술
const learn = (id: string) => {
  const p = mon(id)
  const ls = p.learnset ?? pokemon[p.mega?.from ?? p.battleForm?.from ?? '']?.learnset ?? []
  return ls.map((m) => moves[m]).filter((m): m is Move => !!m)
}

describe('내구', () => {
  it('H32 / B32 / D32 실능치와 내구 지수', () => {
    const r = bulkRow(mon('garchomp'))
    expect(r).toEqual({ hp: 215, def: 147, spd: 137, phys: 215 * 147, spec: 215 * 137 })
    const plus = bulkRow(mon('garchomp'), true)
    expect(plus.def).toBe(161) // floor(147 × 1.1)
    expect(plus.spd).toBe(150)
  })
})

describe('기술 페널티', () => {
  it('데이터 + 목록으로 판정', () => {
    expect(movePenalties(mv('earthquake'))).toEqual([])
    expect(movePenalties(mv('flareblitz'))).toEqual(['recoil'])
    expect(movePenalties(mv('closecombat'))).toEqual(['selfDrop'])
    expect(movePenalties(mv('hyperbeam'))).toEqual(['recharge', 'accuracy'])
    expect(movePenalties(mv('outrage'))).toEqual(['lock'])
    expect(movePenalties(mv('solarbeam'))).toEqual(['charge'])
    expect(movePenalties(mv('explosion'))).toEqual(['selfKo'])
    expect(movePenalties(mv('stoneedge'))).toEqual(['accuracy'])
    expect(movePenalties(mv('fakeout'))).toEqual(['condition'])
    expect(movePenalties(mv('bulletseed'))).toEqual(['randomHits'])
  })
  it('특성으로 달라짐: 돌머리(반동 없음) / 스킬링크 / 의욕(물리 명중 0.8) / 복안', () => {
    expect(movePenalties(mv('headsmash'), 'rockhead')).toEqual(['accuracy'])
    expect(movePenalties(mv('bulletseed'), 'skilllink')).toEqual([])
    expect(movePenalties(mv('earthquake'), 'hustle')).toEqual(['accuracy'])
    expect(movePenalties(mv('stoneedge'), 'compoundeyes')).toEqual([]) // 80 × 1.3
  })
})

describe('결정력', () => {
  const rowsOf = (id: string) => powerRows(mon(id), powerCandidates(mon(id), learn(id)))
  it('한카리아스: 땅 = 지진 (SP 0 / 32 / 32+), 드래곤 = 역린(고정) + 차선 드래곤클로', () => {
    const rows = rowsOf('garchomp')
    const ground = rows.find((r) => r.type === 'ground')!
    expect(ground.best.move).toBe('earthquake')
    // 공격 150 / 182 / 200 × 위력 100 × 자속 1.5
    expect(ground.best.values).toEqual([22500, 27300, 30000])
    expect(ground.alt).toBeNull()
    const dragon = rows.find((r) => r.type === 'dragon')!
    expect(dragon.best.move).toBe('outrage')
    expect(dragon.best.penalties).toEqual(['lock'])
    expect(dragon.alt?.move).toBe('dragonclaw')
    expect(dragon.alt?.penalties).toEqual([])
    // 결정력 순 정렬
    expect(rows[0]!.best.values[2]).toBeGreaterThanOrEqual(rows[1]!.best.values[2])
  })
  it('분류를 정하면 그 안에서 다시 고른다 (한카리아스 특수 드래곤 = 용성군 + 차선 용의파동)', () => {
    const p = mon('garchomp')
    const dragon = powerRows(p, powerCandidates(p, learn('garchomp')), 'special').find(
      (r) => r.type === 'dragon',
    )!
    expect(dragon.best.move).toBe('dracometeor')
    expect(dragon.best.penalties).toEqual(['selfDrop', 'accuracy'])
    expect(dragon.alt?.move).toBe('dragonpulse')
  })
  it('특성: 천하장사는 특성 표시, 스킨류(특성 하나뿐)는 바뀐 타입으로만', () => {
    const azu = rowsOf('azumarill').find((r) => r.type === 'water')!
    expect(azu.best.ability).toBe('hugepower')
    const alt = rowsOf('altariamega')
    // 노말 기술은 전부 페어리로 (웨더볼만 스킨 영향 없음)
    expect(alt.find((r) => r.type === 'normal')?.best.move).toBe('weatherball')
    const fairy = alt.find((r) => r.type === 'fairy')!
    expect(fairy.best.ability).toBe('pixilate')
    expect(fairy.best.move).toBe('gigaimpact')
    expect(fairy.alt?.move).toBe('hypervoice')
  })
  it('연속기: 고정 횟수는 곱하고, 부자유친은 1.25배', () => {
    const wing = moveEntries(mon('salamence'), [mv('dualwingbeat')])[0]!
    expect(wing.hits?.outcomes).toEqual([{ hits: 2, factor: 2, p: 1 }])
    expect(wing.ranges).toBeNull()
    const one = moveEntries(mon('kangaskhan'), [mv('doubleedge')])
    const mega = moveEntries(mon('kangaskhanmega'), [mv('doubleedge')])[0]!
    expect(mega.hits?.expFactor).toBe(1.25)
    expect(mega.hits?.parentalBond).toBe(true)
    expect(mega.ability).toBe('parentalbond')
    expect(one.every((e) => !e.hits)).toBe(true)
  })
  it('타수 분포: 2~5회 / 스킬링크 / 속임수주사위', () => {
    const plain = hitsUsed(mv('bulletseed'))!
    expect(plain.outcomes.map((o) => [o.hits, o.p])).toEqual([
      [2, 0.35],
      [3, 0.35],
      [4, 0.15],
      [5, 0.15],
    ])
    expect(plain.expHits).toBeCloseTo(3.1)
    expect(hitsUsed(mv('bulletseed'), 'skilllink')!.outcomes).toEqual([
      { hits: 5, factor: 5, p: 1 },
    ])
    const dice = hitsUsed(mv('bulletseed'), '', 'loadeddice')!
    expect([dice.min, dice.max, dice.expHits]).toEqual([4, 5, 4.5])
    expect(movePenalties(mv('bulletseed'), '', 'loadeddice')).toEqual(['randomHits'])
  })
  it('타수 분포: 찍찍베기·트리플악셀은 두 번째부터 매 타 명중 판정 (기술이 맞았다는 전제)', () => {
    const bomb = hitsUsed(mv('populationbomb'))!
    expect([bomb.min, bomb.max]).toEqual([1, 10])
    expect(bomb.expHits).toBeCloseTo((1 - 0.9 ** 10) / 0.1) // 6.51
    expect(hitsUsed(mv('populationbomb'), 'skilllink')!.outcomes).toHaveLength(1)
    expect(hitsUsed(mv('populationbomb'), '', 'loadeddice')!.expHits).toBeCloseTo(7) // 4~10 균등
    const axel = hitsUsed(mv('tripleaxel'))!
    // 1타(위력 20) 10%, 2타(20+40) 9%, 3타(20+40+60) 81%
    expect(axel.expHits).toBeCloseTo(2.71)
    expect(axel.expFactor).toBeCloseTo(0.1 * 1 + 0.09 * 3 + 0.81 * 6)
    expect(hitsUsed(mv('tripleaxel'), '', 'loadeddice')!.outcomes).toEqual([
      { hits: 3, factor: 6, p: 1 },
    ])
  })
  it('표시 값: 타수가 랜덤이면 기댓값 + [최소, 최대], 스킬링크는 따로 (투칸)', () => {
    const es = moveEntries(mon('toucannon'), [mv('bulletseed')])
    const plain = es.find((e) => !e.ability)!
    const link = es.find((e) => e.ability === 'skilllink')!
    expect(plain.ranges).not.toBeNull()
    expect(link.ranges).toBeNull()
    for (const k of [0, 1, 2] as const) {
      const [lo, hi] = plain.ranges![k]
      expect(lo).toBeLessThan(plain.values[k])
      expect(plain.values[k]).toBeLessThan(hi)
      expect(link.values[k]).toBe(hi) // 스킬링크 = 5회 = 최대
    }
  })
  it('도구: 메가진화는 메가스톤을 지녀서 애크러뱃 2배 없음, 속임수주사위도 못 지님', () => {
    const acro = [mv('acrobatics')]
    const free = moveEntries(mon('charizard'), acro)[0]!.values[2]
    const held = moveEntries(mon('charizard'), acro, 'loadeddice')[0]!.values[2]
    expect(Math.abs(free - held * 2)).toBeLessThanOrEqual(1)
    const mega = moveEntries(mon('charizardmegay'), acro, 'loadeddice')
    expect(mega.every((e) => e.hits == null)).toBe(true)
    const pin = moveEntries(mon('heracrossmega'), [mv('pinmissile')], 'loadeddice')[0]!
    expect(pin.hits?.outcomes).toEqual([{ hits: 5, factor: 5, p: 1 }]) // 스킬링크
  })
  it('바디프레스는 방어에 SP·성격을 준다', () => {
    const e = moveEntries(mon('corviknight'), [mv('bodypress')])[0]!
    expect(e.stat).toBe('def')
    // 방어 105: 125 / 157 / 172 × 80 (자속 아님)
    expect(e.values).toEqual([125 * 80, 157 * 80, 172 * 80])
  })
})

describe('스피드', () => {
  it('5가지 투자 × 필드 3가지', () => {
    const es = speedEntries(mon('garchomp')).filter((e) => !e.ability)
    const at = (sp: string, scarf: boolean, field: string) =>
      es.find((e) => e.sp === sp && e.scarf === scarf && e.field === field)!.speed
    expect(at('s0', false, 'none')).toBe(122)
    expect(at('s32', false, 'none')).toBe(154)
    expect(at('s32plus', false, 'none')).toBe(169)
    expect(at('s32', true, 'none')).toBe(231)
    expect(at('s32plus', true, 'none')).toBe(253)
    expect(at('s32plus', false, 'tailwind')).toBe(338)
    expect(at('s32plus', false, 'web')).toBe(112) // -1 랭크
    expect(es).toHaveLength(15)
  })
  it('메가진화는 스카프 없음, 곡예는 스카프와 같이 안 씀, 특성 배율', () => {
    expect(speedEntries(mon('garchompmega')).some((e) => e.scarf)).toBe(false)
    const sce = speedEntries(mon('sceptile'))
    expect(sce.some((e) => e.ability === 'unburden' && e.scarf)).toBe(false)
    const ex = speedEntries(mon('excadrill')).find(
      (e) => e.ability === 'sandrush' && e.sp === 's32' && !e.scarf && e.field === 'none',
    )!
    expect(ex.mult).toBe(2)
    expect(ex.speed).toBe((88 + 52) * 2)
  })
  it('배율이 같으면 같은 줄 (스카프 / 속보)', () => {
    const groups = speedGroups([
      ...speedEntries(mon('jolteon')),
      ...speedEntries(mon('aerodactyl')), // 둘 다 130
    ])
    const g = groups.find(
      (x) => x.base === 130 && x.sp === 's32' && x.mult === 1.5 && x.field === 'none',
    )!
    expect(g.entries.some((e) => e.scarf && e.id === 'aerodactyl')).toBe(true)
    expect(g.entries.some((e) => e.ability === 'quickfeet' && !e.scarf)).toBe(true)
    // 빠른 순
    expect(groups[0]!.speed).toBeGreaterThanOrEqual(groups[1]!.speed)
  })
})
