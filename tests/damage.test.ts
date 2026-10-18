// tests/damage.test.ts — utils/damage.ts 를 @smogon/calc(9세대) 결과와 비교 검증
// 챔피언스 능력 포인트(SP)는 노력치로 환산하면 첫 1포인트 4, 이후 8씩 → EV = 8·SP − 4 (SP>0)
// 이렇게 하면 레벨 50 실능치가 챔피언스 공식(종족값+SP+20)과 정확히 일치한다.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calculate, Field, Generations, Move as SMove, Pokemon as SPokemon } from '@smogon/calc'
import { calcDamage, type Combatant, type FieldState } from '../utils/damage'
import { calcStats } from '../utils/stats'
import type { GameData, StatTable, Status } from '../utils/types'

const load = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
const data = {
  pokemon: load('pokemon'),
  moves: load('moves'),
  natures: load('natures'),
  types: load('types'),
} as Pick<GameData, 'pokemon' | 'moves' | 'natures' | 'types'>
const gen = Generations.get(9)

type Side = {
  species: string
  sp?: Partial<StatTable>
  nature?: string
  ability?: string
  item?: string
  status?: Status
  boosts?: Partial<Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>
  hpPercent?: number
}
type Case = { name: string; atk: Side; def: Side; move: string; field?: FieldState; crit?: boolean; spread?: boolean }

const STAT_NAME = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' } as const
const toEvs = (sp: Partial<StatTable> = {}) =>
  Object.fromEntries(Object.entries(sp).map(([k, v]) => [STAT_NAME[k as keyof StatTable], v ? 8 * v - 4 : 0]))
const SD_STATUS: Record<string, string> = { brn: 'brn', par: 'par', psn: 'psn', tox: 'tox', slp: 'slp', frz: 'frz' }

function ours(c: Case) {
  const mk = (s: Side): Combatant => {
    const species = data.pokemon[s.species]
    if (!species) throw new Error('no species ' + s.species)
    const stats = calcStats(species.stats, s.sp || {}, data.natures[s.nature || 'serious'])
    return {
      species,
      stats,
      ability: s.ability || species.abilities[0],
      item: s.item || '',
      status: s.status || '',
      boosts: s.boosts,
      hp: s.hpPercent ? Math.floor((stats.hp * s.hpPercent) / 100) : undefined,
    }
  }
  const move = data.moves[c.move]
  if (!move) throw new Error('no move ' + c.move)
  return { r: calcDamage(move, mk(c.atk), mk(c.def), data.types.chart, c.field || {}, { crit: c.crit, spread: c.spread }), move }
}

function smogon(c: Case, power: number) {
  const mk = (s: Side) => {
    const species = data.pokemon[s.species]
    const p = new SPokemon(gen, s.species, {
      level: 50,
      nature: (s.nature || 'serious').replace(/^./, (x) => x.toUpperCase()),
      evs: toEvs(s.sp),
      // @smogon/calc 은 id 가 아니라 표시 이름("Huge Power", "Life Orb")을 받는다
      ability: gen.abilities.get((s.ability || species.abilities[0]) as never)?.name as never,
      item: (s.item ? gen.items.get(s.item as never)?.name : undefined) as never,
      status: (SD_STATUS[s.status || ''] || '') as never,
      boosts: s.boosts,
    })
    if (s.hpPercent) p.originalCurHP = Math.floor((p.maxHP() * s.hpPercent) / 100)
    return p
  }
  const f = c.field || {}
  const weather = { sun: 'Sun', rain: 'Rain', sand: 'Sand', snow: 'Snow', harshsun: 'Harsh Sunshine', heavyrain: 'Heavy Rain' }[f.weather || ''] as never
  const terrain = { electric: 'Electric', grassy: 'Grassy', misty: 'Misty', psychic: 'Psychic' }[f.terrain || ''] as never
  const field = new Field({
    gameType: c.spread || f.doubles ? 'Doubles' : 'Singles',
    weather,
    terrain,
    defenderSide: { isReflect: !!f.reflect, isLightScreen: !!f.lightScreen, isAuroraVeil: !!f.auroraVeil },
  })
  const move = new SMove(gen, c.move, { isCrit: !!c.crit, overrides: { basePower: power } })
  const res = calculate(gen, mk(c.atk), mk(c.def), move, field)
  const d = res.damage
  return Array.isArray(d) ? (d as number[]) : Array(16).fill(d as number)
}

const MAX = 32
const cases: Case[] = [
  { name: '자속 효과굉장', atk: { species: 'garchomp', sp: { atk: MAX }, nature: 'jolly' }, def: { species: 'tyranitar', sp: { hp: MAX } }, move: 'earthquake' },
  { name: '멀티스케일 만피', atk: { species: 'weavile', sp: { atk: MAX }, nature: 'jolly' }, def: { species: 'dragonite', sp: { hp: MAX }, ability: 'multiscale' }, move: 'iceshard' },
  { name: '쾌청 불꽃 4배', atk: { species: 'charizard', sp: { spa: MAX }, nature: 'modest' }, def: { species: 'scizor' }, move: 'fireblast', field: { weather: 'sun' } },
  { name: '천하장사', atk: { species: 'azumarill', sp: { atk: MAX }, nature: 'adamant', ability: 'hugepower' }, def: { species: 'garchomp', sp: { hp: MAX, def: 10 } }, move: 'aquajet' },
  { name: '급소', atk: { species: 'kingambit', sp: { atk: MAX }, nature: 'adamant' }, def: { species: 'gholdengo', sp: { hp: MAX } }, move: 'kowtowcleave', crit: true },
  { name: '근성 화상 객기', atk: { species: 'conkeldurr', sp: { atk: MAX }, ability: 'guts', status: 'brn' }, def: { species: 'gyarados' }, move: 'facade' },
  { name: '화상 물리 반감', atk: { species: 'garchomp', sp: { atk: MAX }, status: 'brn' }, def: { species: 'gholdengo' }, move: 'earthquake' },
  { name: '생명의구슬', atk: { species: 'gengar', sp: { spa: MAX }, nature: 'timid', item: 'lifeorb' }, def: { species: 'alakazam', sp: { hp: 20 } }, move: 'shadowball' },
  { name: '달인의띠', atk: { species: 'hydreigon', sp: { spa: MAX }, item: 'expertbelt' }, def: { species: 'gardevoir' }, move: 'flashcannon' },
  { name: '반감열매', atk: { species: 'volcarona', sp: { spa: MAX } }, def: { species: 'scizor', item: 'occaberry' }, move: 'heatwave' },
  { name: '리플렉터', atk: { species: 'garchomp', sp: { atk: MAX } }, def: { species: 'metagross', sp: { hp: MAX } }, move: 'earthquake', field: { reflect: true } },
  { name: '랭크 +2 / -1', atk: { species: 'dragonite', sp: { atk: MAX }, boosts: { atk: 2 } }, def: { species: 'corviknight', boosts: { def: -1 } }, move: 'extremespeed' },
  { name: '테크니션', atk: { species: 'scizor', sp: { atk: MAX }, ability: 'technician' }, def: { species: 'tyranitar' }, move: 'bulletpunch' },
  { name: '두꺼운지방', atk: { species: 'weavile', sp: { atk: MAX } }, def: { species: 'snorlax', ability: 'thickfat' }, move: 'iciclecrash' },
  { name: '부유 무효', atk: { species: 'garchomp', sp: { atk: MAX } }, def: { species: 'rotomwash', ability: 'levitate' }, move: 'earthquake' },
  { name: '일렉트릭필드', atk: { species: 'raichu', sp: { spa: MAX } }, def: { species: 'gyarados' }, move: 'thunderbolt', field: { terrain: 'electric' } },
  { name: '미스트필드 드래곤', atk: { species: 'dragapult', sp: { spa: MAX } }, def: { species: 'garchomp' }, move: 'dracometeor', field: { terrain: 'misty' } },
  { name: '비 물', atk: { species: 'pelipper', sp: { spa: MAX } }, def: { species: 'incineroar' }, move: 'hurricane', field: { weather: 'rain' } },
  { name: '쾌청 물 반감', atk: { species: 'primarina', sp: { spa: MAX } }, def: { species: 'incineroar' }, move: 'hydropump', field: { weather: 'sun' } },
  { name: '설경 얼음 방어', atk: { species: 'garchomp', sp: { atk: MAX } }, def: { species: 'baxcalibur' }, move: 'earthquake', field: { weather: 'snow' } },
  { name: '모래 바위 특방', atk: { species: 'primarina', sp: { spa: MAX } }, def: { species: 'tyranitar' }, move: 'moonblast', field: { weather: 'sand' } },
  { name: '광역 0.75', atk: { species: 'garchomp', sp: { atk: MAX } }, def: { species: 'incineroar', sp: { hp: MAX } }, move: 'earthquake', spread: true },
  { name: '단단한발톱 접촉', atk: { species: 'barbaracle', sp: { atk: MAX }, ability: 'toughclaws' }, def: { species: 'garchomp' }, move: 'crosschop' },
  { name: '예리함 베기', atk: { species: 'gallade', sp: { atk: MAX }, ability: 'sharpness' }, def: { species: 'kingambit' }, move: 'sacredsword' },
  { name: '사이코쇼크 방어 참조', atk: { species: 'alakazam', sp: { spa: MAX } }, def: { species: 'conkeldurr', sp: { def: MAX } }, move: 'psyshock' },
  { name: '바디프레스', atk: { species: 'corviknight', sp: { def: MAX } }, def: { species: 'tyranitar' }, move: 'bodypress' },
  { name: '속임수', atk: { species: 'sableye' }, def: { species: 'garchomp', sp: { atk: MAX }, boosts: { atk: 1 } }, move: 'foulplay' },
  { name: '탁쳐서떨구기 도구', atk: { species: 'kingambit', sp: { atk: MAX } }, def: { species: 'gardevoir', item: 'leftovers' }, move: 'knockoff' },
  { name: '털가죽', atk: { species: 'garchomp', sp: { atk: MAX } }, def: { species: 'persianalola', ability: 'furcoat' }, move: 'earthquake' },
  { name: '필터 효과굉장', atk: { species: 'garchomp', sp: { atk: MAX } }, def: { species: 'aggron', ability: 'filter' }, move: 'earthquake' },
  { name: '색안경', atk: { species: 'volcarona', sp: { spa: MAX }, ability: 'tintedlens' }, def: { species: 'tyranitar' }, move: 'bugbuzz' },
  { name: '헤비봄버', atk: { species: 'aggron', sp: { atk: MAX } }, def: { species: 'gardevoir' }, move: 'heavyslam' },
  { name: '분화 체력 50%', atk: { species: 'typhlosion', sp: { spa: MAX }, hpPercent: 50 }, def: { species: 'garchomp' }, move: 'eruption' },
  { name: '복슬복슬 접촉', atk: { species: 'garchomp', sp: { atk: MAX } }, def: { species: 'bewear', ability: 'fluffy' }, move: 'outrage' },
  { name: '페어리스킨', atk: { species: 'sylveon', sp: { spa: MAX }, ability: 'pixilate' }, def: { species: 'garchomp' }, move: 'hypervoice' },
  { name: '적응력', atk: { species: 'lucario', sp: { spa: MAX }, ability: 'adaptability' }, def: { species: 'tyranitar' }, move: 'aurasphere' },
  { name: '스나이퍼 급소', atk: { species: 'inteleon', sp: { spa: MAX }, ability: 'sniper' }, def: { species: 'garchomp' }, move: 'hydropump', crit: true },
  { name: '빛의장막 더블', atk: { species: 'gengar', sp: { spa: MAX } }, def: { species: 'gardevoir' }, move: 'shadowball', field: { lightScreen: true, doubles: true } },
]

describe('calcDamage vs @smogon/calc (Gen 9, Lv50)', () => {
  for (const c of cases.filter((x) => data.pokemon[x.atk.species] && data.pokemon[x.def.species])) {
    it(c.name, () => {
      const { r, move } = ours(c)
      const expected = smogon(c, move.power)
      expect(r.rolls).toEqual(expected)
    })
  }
})
