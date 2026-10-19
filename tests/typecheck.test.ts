// tests/typecheck.test.ts — 파티 타입 상성 체크 (utils/typeCheck.ts)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Combatant } from '../utils/damage'
import { calcStats } from '../utils/stats'
import {
  attackProfile,
  consistentTypes,
  defenseCell,
  defenseProfile,
  multLabel,
  teamTypeCheck,
} from '../utils/typeCheck'
import type { GameData, TypeId } from '../utils/types'

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
const data = { pokemon: load('pokemon'), types: load('types') } as Pick<
  GameData,
  'pokemon' | 'types'
>
const chart = data.types.chart
const mon = (species: string, ability?: string, item = ''): Combatant => {
  const p = data.pokemon[species]!
  return { species: p, stats: calcStats(p.stats, {}), ability: ability ?? p.abilities[0]!, item }
}

describe('받는 배율', () => {
  it('타입 상성 (복합 타입)', () => {
    const chomp = mon('garchomp')
    expect(defenseCell('ice', chomp, chart).mult).toBe(4)
    expect(defenseCell('electric', chomp, chart)).toEqual({ mult: 0 })
    expect(defenseCell('water', chomp, chart).mult).toBe(1)
    expect(defenseCell('rock', chomp, chart).mult).toBe(0.5)
  })
  it('천정부지(메가저리더프)는 땅에 있지 않음', () => {
    expect(defenseCell('ground', mon('eelektrossmega', 'eelevate'), chart)).toEqual({
      mult: 0,
      source: 'eelevate',
    })
  })
  it('특성·도구로 무효', () => {
    expect(defenseCell('ground', mon('rotomwash', 'levitate'), chart)).toEqual({
      mult: 0,
      source: 'levitate',
    })
    expect(defenseCell('ground', mon('metagross', 'clearbody', 'airballoon'), chart)).toEqual({
      mult: 0,
      source: 'airballoon',
    })
    expect(defenseCell('fire', mon('arcanine', 'flashfire'), chart)).toEqual({
      mult: 0,
      source: 'flashfire',
    })
  })
  it('받는 데미지를 바꾸는 특성', () => {
    expect(defenseCell('fire', mon('snorlax', 'thickfat'), chart)).toEqual({
      mult: 0.5,
      source: 'thickfat',
    })
    expect(defenseCell('fire', mon('toxicroak', 'dryskin'), chart).mult).toBe(1.25)
    expect(defenseCell('ground', mon('aggron', 'sturdy'), chart).mult).toBe(4)
    expect(defenseCell('fighting', mon('aggron', 'sturdy'), chart).mult).toBe(4)
  })
})

describe('파티 일관성', () => {
  const rows = teamTypeCheck([mon('garchomp'), mon('dragonite', 'multiscale')], chart)
  it('타입별 최소 배율', () => {
    const row = (t: TypeId) => rows.find((r) => r.type === t)!
    expect(row('ice').min).toBe(4)
    expect(row('electric').min).toBe(0) // 한카리아스 무효
    expect(row('normal').min).toBe(1)
  })
  it('전원에게 4배 / 2배 / 1배 이상 들어가는 타입', () => {
    const c = consistentTypes(rows)
    expect(c.x4).toEqual(['ice'])
    expect(c.x2).toEqual(['dragon', 'fairy'])
    expect(c.x1).toContain('normal')
    expect(c.x1).not.toContain('electric')
    expect(c.x1).not.toContain('fire') // 둘 다 반감
  })
  it('빈 파티는 없음', () => {
    expect(consistentTypes(teamTypeCheck([], chart))).toEqual({ x4: [], x2: [], x1: [] })
  })
})

describe('툴팁용 상성 묶음', () => {
  it('방어: 단일 / 복합 타입', () => {
    expect(defenseProfile(['fire'], chart)).toEqual({
      x4: [],
      x2: ['water', 'ground', 'rock'],
      x05: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'],
      x025: [],
      x0: [],
    })
    const chomp = defenseProfile(['dragon', 'ground'], chart)
    expect(chomp.x4).toEqual(['ice'])
    expect(chomp.x0).toEqual(['electric'])
    expect(chomp.x2).toEqual(['dragon', 'fairy'])
  })
  it('공격', () => {
    expect(attackProfile('ground', chart)).toEqual({
      x2: ['fire', 'electric', 'poison', 'rock', 'steel'],
      x05: ['grass', 'bug'],
      x0: ['flying'],
    })
  })
  it('표시 문자열', () => {
    expect([0, 0.25, 0.5, 1, 2, 4, 1.5].map(multLabel)).toEqual([
      '0',
      '¼',
      '½',
      '',
      '2',
      '4',
      '1.5',
    ])
  })
})
