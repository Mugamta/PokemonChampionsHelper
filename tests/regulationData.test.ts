// 레귤레이션별 데이터 (regulations.json 의 patch 덮어쓰기) + 패치 내역 비교
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { GameData } from '../utils/types'
import {
  applyRegulation,
  availableMegas,
  diffRegulations,
  generationOf,
  groupByGeneration,
  itemHistory,
  monHistory,
  moveHistory,
  openingDiff,
  type RegDiffEntry,
} from '../utils/regulationData'

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
const base = Object.fromEntries(
  ['pokemon', 'moves', 'abilities', 'items', 'natures', 'types', 'regulations'].map((f) => [
    f,
    load(f),
  ]),
) as unknown as GameData
const reg = (id: string) => base.regulations.find((r) => r.id === id)!

describe('applyRegulation', () => {
  it('최신 레귤레이션·레귤레이션 없음은 기본 데이터 그대로', () => {
    expect(applyRegulation(base, null)).toBe(base)
    const latest = base.regulations.at(-1)!
    expect(latest.showdown).toBeUndefined()
    expect(applyRegulation(base, latest).pokemon).toBe(base.pokemon)
  })

  it('같은 레귤레이션이면 같은 객체 (다시 만들지 않음)', () => {
    expect(applyRegulation(base, reg('M-B'))).toBe(applyRegulation(base, reg('M-B')))
  })

  it('Ver.1.2.0 전(M-B): 브리두라스 미러코트·메탈버스트, 왕구리 막치기, 희망사항 PP 12', () => {
    const d = applyRegulation(base, reg('M-B'))
    expect(d.pokemon.archaludon!.learnset).toContain('mirrorcoat')
    expect(d.pokemon.archaludon!.learnset).toContain('metalburst')
    expect(d.pokemon.politoed!.learnset).toContain('pound')
    expect(d.moves.wish!.pp).toBe(12)
    // 최신은 바뀐 값
    expect(base.pokemon.archaludon!.learnset).not.toContain('mirrorcoat')
    expect(base.moves.wish!.pp).toBe(8)
  })

  it('M-B 에는 M-C 신규 도구·메가스톤이 없다', () => {
    const d = applyRegulation(base, reg('M-B'))
    expect(d.items.rockyhelmet).toBeUndefined()
    expect(d.items.garchompitez).toBeUndefined()
    expect(d.items.lifeorb).toBeDefined()
    expect(d.pokemon.garchomp!.megas ?? []).not.toContain('garchompmegaz')
    expect(base.pokemon.garchomp!.megas).toContain('garchompmegaz')
    // 메가 폼 데이터 자체는 남김 (저장된 슬롯 표시용)
    expect(d.pokemon.garchompmegaz).toBeDefined()
  })

  it('Ver.1.1.0 전(M-A): 생명의구슬·빛의점토 없음', () => {
    const d = applyRegulation(base, reg('M-A'))
    expect(d.items.lifeorb).toBeUndefined()
    expect(d.items.lightclay).toBeUndefined()
  })

  it('로토무 폼은 원종 기술도 배운다 (M-A 데이터는 폼에 전용기만 적혀 있음)', () => {
    const d = applyRegulation(base, reg('M-A'))
    const heat = d.pokemon.rotomheat!.learnset!
    expect(heat).toContain('overheat')
    expect(heat).toContain('voltswitch')
  })
})

describe('diffRegulations', () => {
  const diff = (a: string, b: string) =>
    diffRegulations(applyRegulation(base, reg(a)), reg(a), applyRegulation(base, reg(b)), reg(b))

  it('M-B → M-C: 습득 기술·PP·도구·메가 변경', () => {
    const d = diff('M-B', 'M-C')
    const archa = d.learnsetChanges.find((c) => c.id === 'archaludon')!
    expect(archa.removed).toEqual(['metalburst', 'mirrorcoat'])
    expect(d.learnsetChanges.find((c) => c.id === 'politoed')!.removed).toEqual(['pound'])
    const wish = d.moveChanges.find((c) => c.id === 'wish')!
    expect(wish.changes).toEqual([{ key: 'pp', from: 12, to: 8 }])
    expect(d.itemsAdded).toContain('rockyhelmet')
    expect(d.itemsAdded).not.toContain('garchompitez') // 메가스톤은 메가 쪽으로
    expect(d.megasAdded).toContain('garchompmegaz')
    expect(d.pokemonAdded.length).toBe(
      reg('M-C').pokemon.filter((id) => !reg('M-B').pokemon.includes(id)).length,
    )
  })

  it('M-A → M-B: 로토무 폼 습득 기술은 바뀌지 않음', () => {
    const d = diff('M-A', 'M-B')
    expect(d.learnsetChanges.some((c) => c.id.startsWith('rotom'))).toBe(false)
    expect(d.itemsAdded).toContain('lifeorb')
  })

  it('쓸 수 있는 메가는 원종이 출전 가능한 것만', () => {
    const d = applyRegulation(base, reg('M-A'))
    for (const m of availableMegas(d, reg('M-A')))
      expect(reg('M-A').pokemon).toContain(d.pokemon[m]!.mega!.from)
  })
})

describe('openingDiff · 세대', () => {
  it('첫 레귤레이션은 출전 포켓몬·메가·기술이 전부 추가, 변경 없음', () => {
    const r = base.regulations[0]!
    const d = applyRegulation(base, r)
    const diff = openingDiff(d, r)
    expect(diff.pokemonAdded.length).toBe(r.pokemon.length)
    expect(diff.megasAdded).toEqual(availableMegas(d, r))
    expect(diff.movesAdded.length).toBeGreaterThan(100)
    expect(diff.itemsAdded.length).toBeGreaterThan(0)
    expect(diff.pokemonRemoved).toEqual([])
    expect(diff.moveChanges).toEqual([])
    expect(diff.learnsetChanges).toEqual([])
  })

  it('세대 경계', () => {
    expect([1, 151, 152, 386, 387, 649, 650, 809, 810, 905, 906, 1025].map(generationOf)).toEqual([
      1, 1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 9,
    ])
  })

  it('번호 순으로 세대별 묶음', () => {
    const num: Record<string, number> = { a: 445, b: 3, c: 6, d: 1000 }
    expect(groupByGeneration(['a', 'd', 'c', 'b'], (id) => num[id]!)).toEqual([
      { gen: 1, ids: ['b', 'c'] },
      { gen: 4, ids: ['a'] },
      { gen: 9, ids: ['d'] },
    ])
  })
})

describe('도감 패치 이력', () => {
  // 패치 내역 화면과 같은 순서 (오래된 레귤레이션부터)
  const entries: RegDiffEntry[] = base.regulations.map((r, i, list) => {
    const cd = applyRegulation(base, r)
    const prev = list[i - 1]
    return {
      reg: r.id,
      first: !prev,
      diff: prev ? diffRegulations(applyRegulation(base, prev), prev, cd, r) : openingDiff(cd, r),
      data: cd,
    }
  })

  it('포켓몬: 개막 참가 + 습득 기술 제외', () => {
    const h = monHistory(entries, 'archaludon')
    expect(h[0]).toMatchObject({ reg: 'M-A', first: true, joined: true })
    const mc = h.find((x) => x.reg === 'M-C')!
    expect(mc.learnRemoved).toEqual(['metalburst', 'mirrorcoat'])
    expect(mc.joined).toBe(false)
  })

  it('포켓몬: 배우는 기술의 수치 변경 (희망사항 PP)', () => {
    const learner = reg('M-C').pokemon.find((id) =>
      applyRegulation(base, reg('M-C')).pokemon[id]?.learnset?.includes('wish'),
    )!
    const mc = monHistory(entries, learner).find((x) => x.reg === 'M-C')!
    expect(mc.moveChanges.find((c) => c.id === 'wish')!.changes).toEqual([
      { key: 'pp', from: 12, to: 8 },
    ])
  })

  it('메가 폼: 메가진화 추가 레귤레이션', () => {
    const h = monHistory(entries, 'garchompmegaz')
    expect(h.find((x) => x.reg === 'M-C')?.joined).toBe(true)
  })

  it('기술: 수치 변경 + 배우지 못하게 된 포켓몬', () => {
    const wish = moveHistory(entries, 'wish').find((x) => x.reg === 'M-C')!
    expect(wish.changes).toEqual([{ key: 'pp', from: 12, to: 8 }])
    const mb = moveHistory(entries, 'metalburst').find((x) => x.reg === 'M-C')!
    expect(mb.learnRemoved).toContain('archaludon')
  })

  it('도구: 추가 레귤레이션, 메가스톤은 그 메가 기준', () => {
    expect(itemHistory(entries, 'lifeorb').find((x) => x.reg === 'M-B')?.joined).toBe(true)
    expect(itemHistory(entries, 'rockyhelmet').find((x) => x.reg === 'M-C')?.joined).toBe(true)
    expect(itemHistory(entries, 'garchompitez')).toEqual([
      { reg: 'M-C', first: false, joined: true, left: false },
    ])
  })
})
