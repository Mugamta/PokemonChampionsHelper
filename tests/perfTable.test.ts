// tests/perfTable.test.ts — 포켓몬 성능표 (utils/perfTable.ts)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bulkRow,
  hitsUsed,
  moveEntries,
  movePenalties,
  PENALTIES,
  powerCandidates,
  powerRows,
  speedRows,
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
  it('무투자 / H32 / H32+B(D)32 / + 성격, 지수 = H × B ÷ 0.411 (파티 화면과 같은 식)', () => {
    // 한카리아스: HP 183 / 215, 방어 115 / 147 / 161, 특방 105 / 137 / 150
    const idx = (h: number, d: number) => Math.floor((h * d) / 0.411)
    const r = bulkRow(mon('garchomp'))
    expect(r.phys).toEqual([idx(183, 115), idx(215, 115), idx(215, 147), idx(215, 161)])
    expect(r.spec).toEqual([idx(183, 105), idx(215, 105), idx(215, 137), idx(215, 150)])
  })
  it('방어·특방 랭크', () => {
    const r = bulkRow(mon('garchomp'), 1)
    expect(r.phys[2]).toBe(Math.floor((215 * Math.floor(147 * 1.5)) / 0.411))
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
    expect(movePenalties(mv('highjumpkick'))).toEqual(['crash', 'accuracy'])
    expect(movePenalties(mv('steelbeam'))).toEqual(['selfDamage', 'accuracy'])
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
  it('페널티를 빼면 그 페널티가 있는 기술은 고르지 않음 (다음 턴 행동 불가 빼기)', () => {
    const p = mon('altariamega')
    const cands = powerCandidates(p, learn('altariamega'))
    const all = new Set(PENALTIES)
    all.delete('recharge')
    const fairy = powerRows(p, cands, undefined, all).find((r) => r.type === 'fairy')!
    expect(fairy.best.move).not.toBe('gigaimpact')
    expect(fairy.best.penalties).not.toContain('recharge')
    // 전부 빼면 페널티 없는 기술만
    const none = powerRows(p, cands, undefined, new Set())
    expect(none.every((r) => r.best.penalties.length === 0 && r.alt == null)).toBe(true)
  })
  it('공격 랭크 +2 = 결정력 2배', () => {
    const e0 = moveEntries(mon('garchomp'), [mv('earthquake')])[0]!
    const e2 = moveEntries(mon('garchomp'), [mv('earthquake')], undefined, 2)[0]!
    expect(e2.values).toEqual(e0.values.map((v) => v * 2))
  })
  it('바디프레스는 방어에 SP·성격을 준다', () => {
    const e = moveEntries(mon('corviknight'), [mv('bodypress')])[0]!
    expect(e.stat).toBe('def')
    // 방어 105: 125 / 157 / 172 × 80 (자속 아님)
    expect(e.values).toEqual([125 * 80, 157 * 80, 172 * 80])
  })
})

describe('스피드', () => {
  it('S0 / S32 / S32+ / 스카프 S32 / 스카프 S32+', () => {
    const [plain] = speedRows(mon('garchomp'))
    expect(plain).toEqual({ ability: '', values: [122, 154, 169, 231, 253] })
  })
  it('스피드 랭크', () => {
    expect(speedRows(mon('garchomp'), true, 1)[0]!.values[2]).toBe(Math.floor(169 * 1.5))
    expect(speedRows(mon('garchomp'), true, -1)[0]!.values[2]).toBe(Math.floor((169 * 2) / 3))
  })
  it('메가진화는 스카프 칸 없음, 특성 줄은 따로 (곡예는 스카프와 같이 안 씀)', () => {
    expect(speedRows(mon('garchompmega'))[0]!.values.slice(3)).toEqual([null, null])
    const ex = speedRows(mon('excadrill'))
    expect(ex.map((r) => r.ability)).toEqual(['', 'sandrush'])
    expect(ex[1]!.values[1]).toBe((88 + 52) * 2)
    const sce = speedRows(mon('sceptile')).find((r) => r.ability === 'unburden')!
    expect(sce.values.slice(3)).toEqual([null, null])
  })
})
