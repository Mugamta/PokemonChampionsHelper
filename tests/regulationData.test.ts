// 레귤레이션별 데이터 (regulations.json 의 patch 덮어쓰기) + 패치 내역 비교
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { GameData } from '../utils/types'
import { applyRegulation, availableMegas, diffRegulations } from '../utils/regulationData'

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
