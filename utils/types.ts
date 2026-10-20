// utils/types.ts — public/data/*.json 형식과 계산 로직에서 공유하는 타입

import type { UsageTable } from './autoSet'

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
export type BoostKey = Exclude<StatKey, 'hp'>
export type StatTable = Record<StatKey, number>
// 명중·회피 랭크 (실능치 없이 랭크만 있는 것). 랭크 표는 BoostKey + 이것
export type AccKey = 'accuracy' | 'evasion'
export type RankKey = BoostKey | AccKey
export type BoostTable = Record<BoostKey, number> & Partial<Record<AccKey, number>>

export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
export const BOOST_KEYS: BoostKey[] = ['atk', 'def', 'spa', 'spd', 'spe']
export const RANK_KEYS: RankKey[] = [...BOOST_KEYS, 'accuracy', 'evasion']

export type TypeId =
  | 'normal'
  | 'fire'
  | 'water'
  | 'electric'
  | 'grass'
  | 'ice'
  | 'fighting'
  | 'poison'
  | 'ground'
  | 'flying'
  | 'psychic'
  | 'bug'
  | 'rock'
  | 'ghost'
  | 'dragon'
  | 'dark'
  | 'steel'
  | 'fairy'

export type Category = 'physical' | 'special' | 'status'
export type Status = '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz'
export type Weather =
  | ''
  | 'sun'
  | 'rain'
  | 'sand'
  | 'snow'
  | 'harshsun'
  | 'heavyrain'
  | 'strongwinds'
export type Terrain = '' | 'electric' | 'grassy' | 'misty' | 'psychic'

export interface Pokemon {
  id: string
  num: number
  base: string
  forme: string
  types: TypeId[]
  stats: StatTable
  abilities: string[]
  weight: number
  learnset?: string[]
  megas?: string[]
  mega?: { from: string; item: string }
  battleForm?: { from?: string; to?: string } // 배틀 중에만 바뀌는 폼 (팔라피 마이티폼, 킬가르도 블레이드폼)
}

export type MoveEffect =
  | {
      type: 'boost'
      target: 'self' | 'target'
      stats: Partial<Record<BoostKey | 'accuracy' | 'evasion', number>>
      chance?: number
    }
  | { type: 'status'; target: 'self' | 'target'; status: Exclude<Status, ''>; chance?: number }
  | { type: 'volatile'; target: 'target'; status: 'flinch' | 'confusion'; chance?: number }
  | { type: 'multihit'; min: number; max: number }
  | { type: 'recoil' | 'drain' | 'heal'; ratio: number }
  | { type: 'crit'; stage: number }
  | { type: 'recharge' }
  | { type: 'weather'; key: Weather }
  | { type: 'terrain'; key: Terrain }
  | { type: 'room'; key: string }
  | { type: 'side'; side: 'self' | 'foe'; key: string; maxStack?: number }

export interface Move {
  id: string
  num: number
  type: TypeId
  category: Category
  power: number
  accuracy: number | null
  pp: number
  ppEstimated?: boolean
  priority: number
  target: string
  flags: string[]
  effects: MoveEffect[]
}

export interface Item {
  id: string
  num: number
  megaStone?: Record<string, string>
  berry?: boolean
}

export interface Nature {
  id: string
  plus: BoostKey | null
  minus: BoostKey | null
}

export interface Regulation {
  id: string
  start: string
  end: string
  rules: string
  pokemon: string[]
}

export interface GameData {
  pokemon: Record<string, Pokemon>
  moves: Record<string, Move>
  abilities: Record<string, { id: string; num: number }>
  items: Record<string, Item>
  natures: Record<string, Nature>
  types: { types: TypeId[]; chart: Record<TypeId, Record<TypeId, number>> }
  regulations: Regulation[]
  // 사용률 통계 (레귤레이션 id → 표). 파일이 없으면 빈 객체
  usage?: Record<string, UsageTable>
}

export interface NameTable {
  pokemon: Record<string, string>
  moves: Record<string, string>
  abilities: Record<string, string>
  items: Record<string, string>
  natures: Record<string, string>
  types: Record<string, string>
}

export interface TextTable {
  moves: Record<string, string>
  abilities: Record<string, string>
  items: Record<string, string>
}

// 파티 슬롯 1칸 (내 파티 / 상대 파티 공통). species는 항상 원종 id, 메가 여부는 item(메가스톤)으로 판단
export interface TeamSlot {
  species: string
  ability: string
  nature: string
  item: string
  moves: [string, string, string, string]
  sp: StatTable // 능력 포인트 (스탯당 0~32, 합계 66)
}

export const emptySlot = (): TeamSlot => ({
  species: '',
  ability: '',
  nature: 'serious',
  item: '',
  moves: ['', '', '', ''],
  sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
})
