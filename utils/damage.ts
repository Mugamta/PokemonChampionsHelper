// utils/damage.ts — 데미지 계산 (포켓몬 챔피언스 = 9세대 공식, 레벨 50)
//
// 계산 순서와 반올림은 Pokemon Showdown(sim/battle-actions.ts modifyDamage)과 @smogon/calc 를 따른다.
//   1. 위력 보정 (특성/도구/필드/기술 조건)            → 4096 체인 후 반올림
//   2. 공격·방어 실능치 (랭크 → 특성/도구 보정)
//   3. 기본 데미지 = floor(floor(floor(2L/5+2) × 위력 × A / D) / 50) + 2
//   4. 광역 0.75 → 날씨 → 급소 1.5 → 난수(85~100%) → 자속 → 타입상성 → 화상 → 최종 보정(벽/도구/특성)
// tests/damage.test.ts 에서 @smogon/calc 결과와 비교 검증한다.

import type { BoostTable, Move, Pokemon, StatTable, Status, Terrain, TypeId, Weather } from './types'
import { applyBoost } from './stats'

export type TypeChart = Record<TypeId, Record<TypeId, number>>

export interface Combatant {
  species: Pokemon // 실제 폼 (메가진화 중이면 메가 폼)
  stats: StatTable // 랭크/도구 보정 전 실능치
  ability: string
  item: string
  itemLocked?: boolean // 떨어뜨릴 수 없는 도구 (메가스톤) — 탁쳐서떨구기 위력 보정 제외
  status?: Status
  boosts?: Partial<BoostTable>
  hp?: number // 현재 HP (없으면 최대)
}

export interface FieldState {
  weather?: Weather
  terrain?: Terrain
  doubles?: boolean
  gravity?: boolean
  // 방어 측 필드
  reflect?: boolean
  lightScreen?: boolean
  auroraVeil?: boolean
}

export interface DamageOptions {
  crit?: boolean
  spread?: boolean // 더블에서 광역기가 2마리 이상을 맞히는 경우 (0.75배)
  level?: number
}

export interface DamageResult {
  rolls: number[] // 16단계 난수 (85%~100%)
  min: number
  max: number
  effectiveness: number // 타입 상성 배율 (0 = 무효)
  type: TypeId // 최종 기술 타입 (스킨 특성/웨더볼 반영)
  power: number // 최종 위력 (보정 전 기본 위력 변화만 반영)
  immuneReason?: string // 'type' | 특성 id | 도구 id
}

// ── 반올림 유틸 (Showdown 과 동일) ─────────────
const tr = (n: number) => Math.trunc(n)
// value × (mod/4096), 0.5 는 내림 (pokeRound)
export const applyMod = (value: number, mod4096: number) => tr((tr(value * mod4096) + 2048 - 1) / 4096)
const chain = (a: number, b: number) => (a * b + 2048) >> 12
const M = { x2: 8192, x1_5: 6144, x1_3: 5325, x1_2: 4915, x1_1: 4505, x0_75: 3072, x0_5: 2048 } as const

const TYPE_BOOST_ITEMS: Record<string, TypeId> = {
  silkscarf: 'normal', charcoal: 'fire', mysticwater: 'water', magnet: 'electric', miracleseed: 'grass',
  nevermeltice: 'ice', blackbelt: 'fighting', poisonbarb: 'poison', softsand: 'ground', sharpbeak: 'flying',
  twistedspoon: 'psychic', silverpowder: 'bug', hardstone: 'rock', spelltag: 'ghost', dragonfang: 'dragon',
  blackglasses: 'dark', metalcoat: 'steel', fairyfeather: 'fairy',
}
const RESIST_BERRIES: Record<string, TypeId> = {
  occaberry: 'fire', passhoberry: 'water', wacanberry: 'electric', rindoberry: 'grass', yacheberry: 'ice',
  chopleberry: 'fighting', kebiaberry: 'poison', shucaberry: 'ground', cobaberry: 'flying', payapaberry: 'psychic',
  tangaberry: 'bug', chartiberry: 'rock', kasibberry: 'ghost', habanberry: 'dragon', colburberry: 'dark',
  babiriberry: 'steel', roseliberry: 'fairy', chilanberry: 'normal',
}
const SKIN_ABILITIES: Record<string, TypeId> = {
  aerilate: 'flying', pixilate: 'fairy', refrigerate: 'ice', galvanize: 'electric', dragonize: 'dragon',
}
const PINCH_ABILITIES: Record<string, TypeId> = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' }
// 위력 보정이 아닌 고정 데미지 기술
const FIXED_LEVEL_MOVES = new Set(['seismictoss', 'nightshade'])
const HALF_HP_MOVES = new Set(['superfang', 'ruination'])
// 셰이크포스 대상: 부가효과가 있는 기술
const hasSecondary = (move: Move) => move.effects.some((e) => 'chance' in e && e.chance !== undefined)

export const isGrounded = (c: Combatant, field: FieldState) =>
  field.gravity || c.item === 'ironball' ||
  (!c.species.types.includes('flying') && c.ability !== 'levitate' && c.item !== 'airballoon')

const IGNORES_WEATHER = new Set(['cloudnine', 'airlock'])
export const effectiveWeather = (field: FieldState, a: Combatant, d: Combatant): Weather =>
  IGNORES_WEATHER.has(a.ability) || IGNORES_WEATHER.has(d.ability) ? '' : (field.weather || '')

// 타입 상성 (특성/도구에 의한 무효 포함)
export function typeEffectiveness(
  moveType: TypeId, move: Move, attacker: Combatant, defender: Combatant, chart: TypeChart, field: FieldState,
): { mult: number; reason?: string } {
  const scrappy = attacker.ability === 'scrappy' || attacker.ability === 'mindseye'
  let mult = 1
  for (const t of defender.species.types) {
    let m = chart[moveType]?.[t] ?? 1
    if (m === 0 && t === 'ghost' && scrappy && (moveType === 'normal' || moveType === 'fighting')) m = 1
    if (m === 0 && t === 'flying' && moveType === 'ground' && (field.gravity || defender.item === 'ironball')) m = 1
    if (move.id === 'freezedry' && t === 'water') m = 2
    mult *= m
  }
  if (mult === 0) return { mult: 0, reason: 'type' }

  const ab = defender.ability
  const absorb: Record<string, TypeId[]> = {
    flashfire: ['fire'], wellbakedbody: ['fire'], waterabsorb: ['water'], stormdrain: ['water'], dryskin: ['water'],
    voltabsorb: ['electric'], lightningrod: ['electric'], motordrive: ['electric'], sapsipper: ['grass'], eartheater: ['ground'],
  }
  if (absorb[ab]?.includes(moveType)) return { mult: 0, reason: ab }
  if (moveType === 'ground' && !isGrounded(defender, field) && move.id !== 'thousandarrows') {
    return { mult: 0, reason: defender.item === 'airballoon' ? 'airballoon' : ab === 'levitate' ? 'levitate' : 'type' }
  }
  if (ab === 'bulletproof' && move.flags.includes('bullet')) return { mult: 0, reason: ab }
  if (ab === 'soundproof' && move.flags.includes('sound')) return { mult: 0, reason: ab }
  if (ab === 'windrider' && move.flags.includes('wind')) return { mult: 0, reason: ab }
  if (ab === 'wonderguard' && mult <= 1) return { mult: 0, reason: ab }
  return { mult }
}

// 최종 기술 타입 (스킨 특성 / 웨더볼 / 대지의파동 / 노말스킨 등)
function resolveMoveType(move: Move, a: Combatant, weather: Weather, terrain: Terrain): { type: TypeId; skinBoost: boolean } {
  if (move.id === 'weatherball') {
    const t = ({ sun: 'fire', harshsun: 'fire', rain: 'water', heavyrain: 'water', sand: 'rock', snow: 'ice' } as const)[weather as 'sun']
    return { type: t || 'normal', skinBoost: false }
  }
  if (move.id === 'terrainpulse' && terrain) {
    return { type: ({ electric: 'electric', grassy: 'grass', misty: 'fairy', psychic: 'psychic' } as const)[terrain], skinBoost: false }
  }
  if (a.ability === 'normalize') return { type: 'normal', skinBoost: true }
  if (a.ability === 'liquidvoice' && move.flags.includes('sound')) return { type: 'water', skinBoost: false }
  const skin = SKIN_ABILITIES[a.ability]
  if (skin && move.type === 'normal') return { type: skin, skinBoost: true }
  return { type: move.type, skinBoost: false }
}

// 상태/체력/무게 등에 따라 기본 위력이 바뀌는 기술
function resolveBasePower(move: Move, a: Combatant, d: Combatant, weather: Weather, terrain: Terrain): number {
  const aHp = a.hp ?? a.stats.hp
  const dHp = d.hp ?? d.stats.hp
  const positiveBoosts = Object.values(a.boosts || {}).reduce((s, v) => s + Math.max(0, v || 0), 0)
  switch (move.id) {
    case 'weatherball': return weather ? 100 : 50
    case 'terrainpulse': return terrain ? 100 : 50
    case 'facade': return a.status && a.status !== 'slp' && a.status !== 'frz' ? 140 : 70
    case 'hex': return d.status ? 130 : 65
    case 'venoshock': return d.status === 'psn' || d.status === 'tox' ? 130 : 65
    case 'brine': return dHp * 2 <= d.stats.hp ? 130 : 65
    case 'acrobatics': return a.item ? 55 : 110
    case 'storedpower': case 'powertrip': return 20 + 20 * positiveBoosts
    case 'eruption': case 'waterspout': case 'dragonenergy': return Math.max(1, Math.floor((150 * aHp) / a.stats.hp))
    case 'flail': case 'reversal': {
      const p = Math.floor((48 * aHp) / a.stats.hp)
      return p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20
    }
    case 'lowkick': case 'grassknot': {
      const w = d.species.weight
      return w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20
    }
    case 'heavyslam': case 'heatcrash': {
      const r = a.species.weight / d.species.weight
      return r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40
    }
    case 'gyroball': {
      const v = Math.floor((25 * applyBoost(d.stats.spe, d.boosts?.spe || 0)) / Math.max(1, applyBoost(a.stats.spe, a.boosts?.spe || 0))) + 1
      return Math.min(150, v)
    }
    case 'electroball': {
      const r = applyBoost(a.stats.spe, a.boosts?.spe || 0) / Math.max(1, applyBoost(d.stats.spe, d.boosts?.spe || 0))
      return r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40
    }
    default: return move.power
  }
}

export function calcDamage(
  move: Move, attacker: Combatant, defender: Combatant, chart: TypeChart, field: FieldState = {}, opts: DamageOptions = {},
): DamageResult {
  const level = opts.level ?? 50
  const crit = !!opts.crit || move.id === 'surgingstrikes' || move.id === 'wickedblow' || move.id === 'flowertrick'
  const weather = effectiveWeather(field, attacker, defender)
  const terrain = field.terrain || ''
  const { type, skinBoost } = resolveMoveType(move, attacker, weather, terrain)
  const zero = (reason?: string): DamageResult => ({ rolls: Array(16).fill(0), min: 0, max: 0, effectiveness: 0, type, power: 0, immuneReason: reason })

  if (move.category === 'status') return { ...zero(), effectiveness: 1 }
  const eff = typeEffectiveness(type, move, attacker, defender, chart, field)
  if (eff.mult === 0) return zero(eff.reason)
  if ((weather === 'harshsun' && type === 'water') || (weather === 'heavyrain' && type === 'fire')) return zero('weather')

  // 고정 데미지 기술
  if (FIXED_LEVEL_MOVES.has(move.id)) return { rolls: Array(16).fill(level), min: level, max: level, effectiveness: 1, type, power: 0 }
  if (HALF_HP_MOVES.has(move.id)) {
    const v = Math.max(1, Math.floor((defender.hp ?? defender.stats.hp) / 2))
    return { rolls: Array(16).fill(v), min: v, max: v, effectiveness: 1, type, power: 0 }
  }

  const physical = move.category === 'physical'
  const contact = move.flags.includes('contact')
  const aGrounded = isGrounded(attacker, field)
  const dGrounded = isGrounded(defender, field)
  const aHp = attacker.hp ?? attacker.stats.hp
  const dHp = defender.hp ?? defender.stats.hp

  // ── 1. 위력 ─────────────
  const basePower = resolveBasePower(move, attacker, defender, weather, terrain)
  let bpMod = 4096
  const ab = attacker.ability
  if (ab === 'technician' && basePower <= 60) bpMod = chain(bpMod, M.x1_5)
  if (ab === 'sharpness' && move.flags.includes('slicing')) bpMod = chain(bpMod, M.x1_5)
  if (ab === 'toughclaws' && contact) bpMod = chain(bpMod, M.x1_3)
  if (ab === 'ironfist' && move.flags.includes('punch')) bpMod = chain(bpMod, M.x1_2)
  if (ab === 'strongjaw' && move.flags.includes('bite')) bpMod = chain(bpMod, M.x1_5)
  if (ab === 'megalauncher' && move.flags.includes('pulse')) bpMod = chain(bpMod, M.x1_5)
  if (ab === 'punkrock' && move.flags.includes('sound')) bpMod = chain(bpMod, M.x1_3)
  if (ab === 'reckless' && move.effects.some((e) => e.type === 'recoil')) bpMod = chain(bpMod, M.x1_2)
  if (ab === 'sheerforce' && hasSecondary(move)) bpMod = chain(bpMod, M.x1_3)
  if (ab === 'sandforce' && weather === 'sand' && ['rock', 'ground', 'steel'].includes(type)) bpMod = chain(bpMod, M.x1_3)
  if (skinBoost && ab !== 'normalize') bpMod = chain(bpMod, M.x1_2)
  if (ab === 'normalize') bpMod = chain(bpMod, M.x1_2)
  if (TYPE_BOOST_ITEMS[attacker.item] === type) bpMod = chain(bpMod, M.x1_2)
  if (attacker.item === 'muscleband' && physical) bpMod = chain(bpMod, M.x1_1)
  if (attacker.item === 'wiseglasses' && !physical) bpMod = chain(bpMod, M.x1_1)
  if (attacker.item === 'normalgem' && type === 'normal') bpMod = chain(bpMod, M.x1_3)
  if (move.id === 'knockoff' && defender.item && !defender.itemLocked) bpMod = chain(bpMod, M.x1_5)
  if (aGrounded) {
    if ((terrain === 'electric' && type === 'electric') || (terrain === 'grassy' && type === 'grass') || (terrain === 'psychic' && type === 'psychic')) bpMod = chain(bpMod, M.x1_3)
  }
  if (dGrounded) {
    if (terrain === 'misty' && type === 'dragon') bpMod = chain(bpMod, M.x0_5)
    if (terrain === 'grassy' && (move.id === 'earthquake' || move.id === 'bulldoze')) bpMod = chain(bpMod, M.x0_5)
  }
  const power = Math.max(1, applyMod(basePower, bpMod))

  // ── 2. 공격 / 방어 ─────────────
  // 바디프레스: 자신의 방어 / 속임수: 상대의 공격 / 사이코쇼크류: 상대의 방어
  const atkSource = move.id === 'foulplay' ? defender : attacker
  const atkStat = move.id === 'bodypress' ? 'def' : physical ? 'atk' : 'spa'
  const defStat = physical || ['psyshock', 'psystrike', 'secretsword'].includes(move.id) ? 'def' : 'spd'

  let atkBoost = atkSource.boosts?.[atkStat] || 0
  if (defender.ability === 'unaware') atkBoost = 0
  if (crit && atkBoost < 0) atkBoost = 0
  let attack = applyBoost(atkSource.stats[atkStat], atkBoost)

  let atkMod = 4096
  if (physical && (ab === 'hugepower' || ab === 'purepower')) atkMod = chain(atkMod, M.x2)
  if (physical && ab === 'guts' && attacker.status) atkMod = chain(atkMod, M.x1_5)
  if (physical && (ab === 'hustle' || ab === 'gorillatactics')) atkMod = chain(atkMod, M.x1_5)
  if (!physical && ab === 'solarpower' && (weather === 'sun' || weather === 'harshsun')) atkMod = chain(atkMod, M.x1_5)
  if (PINCH_ABILITIES[ab] === type && aHp * 3 <= attacker.stats.hp) atkMod = chain(atkMod, M.x1_5)
  if (ab === 'transistor' && type === 'electric') atkMod = chain(atkMod, M.x1_3)
  if ((ab === 'dragonsmaw' && type === 'dragon') || (ab === 'steelworker' && type === 'steel') || (ab === 'rockypayload' && type === 'rock')) atkMod = chain(atkMod, M.x1_5)
  if (ab === 'firemane' && type === 'fire') atkMod = chain(atkMod, M.x1_5)
  if (ab === 'waterbubble' && type === 'water') atkMod = chain(atkMod, M.x2)
  if (ab === 'defeatist' && aHp * 2 <= attacker.stats.hp) atkMod = chain(atkMod, M.x0_5)
  if (attacker.item === 'choiceband' && physical) atkMod = chain(atkMod, M.x1_5)
  if (attacker.item === 'choicespecs' && !physical) atkMod = chain(atkMod, M.x1_5)
  if (attacker.item === 'lightball' && attacker.species.base === 'pikachu') atkMod = chain(atkMod, M.x2)
  const dAb = defender.ability
  if (dAb === 'thickfat' && (type === 'fire' || type === 'ice')) atkMod = chain(atkMod, M.x0_5)
  if (dAb === 'heatproof' && type === 'fire') atkMod = chain(atkMod, M.x0_5)
  if (dAb === 'waterbubble' && type === 'fire') atkMod = chain(atkMod, M.x0_5)
  if (dAb === 'purifyingsalt' && type === 'ghost') atkMod = chain(atkMod, M.x0_5)
  attack = Math.max(1, applyMod(attack, atkMod))

  let defBoost = defender.boosts?.[defStat] || 0
  if (ab === 'unaware') defBoost = 0
  if (crit && defBoost > 0) defBoost = 0
  let defense = applyBoost(defender.stats[defStat], defBoost)
  if (weather === 'sand' && defStat === 'spd' && defender.species.types.includes('rock')) defense = applyMod(defense, M.x1_5)
  if (weather === 'snow' && defStat === 'def' && defender.species.types.includes('ice')) defense = applyMod(defense, M.x1_5)
  let defMod = 4096
  if (defStat === 'def' && dAb === 'furcoat') defMod = chain(defMod, M.x2)
  if (defStat === 'def' && dAb === 'marvelscale' && defender.status) defMod = chain(defMod, M.x1_5)
  if (defStat === 'def' && dAb === 'grasspelt' && terrain === 'grassy') defMod = chain(defMod, M.x1_5)
  if (defStat === 'spd' && defender.item === 'assaultvest') defMod = chain(defMod, M.x1_5)
  if (defender.item === 'eviolite') defMod = chain(defMod, M.x1_5)
  defense = Math.max(1, applyMod(defense, defMod))

  // ── 3. 기본 데미지 ─────────────
  let base = tr(tr(tr((2 * level) / 5 + 2) * power * attack / defense) / 50) + 2

  // ── 4. 보정 ─────────────
  if (opts.spread) base = applyMod(base, M.x0_75)
  if (weather === 'sun' || weather === 'harshsun') {
    if (type === 'fire') base = applyMod(base, M.x1_5)
    else if (type === 'water') base = applyMod(base, M.x0_5)
  } else if (weather === 'rain' || weather === 'heavyrain') {
    if (type === 'water') base = applyMod(base, M.x1_5)
    else if (type === 'fire') base = applyMod(base, M.x0_5)
  }
  if (ab === 'megasol' && type === 'fire') base = applyMod(base, M.x1_5) // 자신에게만 쾌청 판정 (메가소울)
  if (crit) base = tr(base * 1.5)

  const stab = ab === 'protean' || ab === 'libero' || attacker.species.types.includes(type)
  const stabMod = stab ? (ab === 'adaptability' ? M.x2 : M.x1_5) : 4096
  const burned = attacker.status === 'brn' && physical && ab !== 'guts' && move.id !== 'facade'

  // 최종 보정 체인
  let finalMod = 4096
  const screenUp = !crit && ab !== 'infiltrator' &&
    (field.auroraVeil || (physical && field.reflect) || (!physical && field.lightScreen))
  if (screenUp) finalMod = chain(finalMod, field.doubles ? 2732 : M.x0_5)
  if ((dAb === 'multiscale' || dAb === 'shadowshield') && dHp >= defender.stats.hp) finalMod = chain(finalMod, M.x0_5)
  if (dAb === 'fluffy' && contact) finalMod = chain(finalMod, M.x0_5)
  if (dAb === 'fluffy' && type === 'fire') finalMod = chain(finalMod, M.x2)
  if (dAb === 'punkrock' && move.flags.includes('sound')) finalMod = chain(finalMod, M.x0_5)
  if (dAb === 'icescales' && !physical) finalMod = chain(finalMod, M.x0_5)
  if (dAb === 'auraguard' && contact) finalMod = chain(finalMod, M.x0_5)
  if ((dAb === 'filter' || dAb === 'solidrock' || dAb === 'prismarmor') && eff.mult > 1) finalMod = chain(finalMod, M.x0_75)
  if (ab === 'tintedlens' && eff.mult < 1) finalMod = chain(finalMod, M.x2)
  if (ab === 'sniper' && crit) finalMod = chain(finalMod, M.x1_5)
  if (attacker.item === 'expertbelt' && eff.mult > 1) finalMod = chain(finalMod, M.x1_2)
  if (attacker.item === 'lifeorb') finalMod = chain(finalMod, 5324)
  const berry = RESIST_BERRIES[defender.item]
  if (berry === type && (eff.mult > 1 || berry === 'normal')) finalMod = chain(finalMod, M.x0_5)

  const rolls: number[] = []
  for (let r = 85; r <= 100; r++) {
    let d = tr((base * r) / 100)
    d = applyMod(d, stabMod)
    d = tr(d * eff.mult)
    if (burned) d = applyMod(d, M.x0_5)
    d = applyMod(d, finalMod)
    rolls.push(Math.max(1, d))
  }
  return { rolls, min: rolls[0], max: rolls[15], effectiveness: eff.mult, type, power }
}

// ── 연속기 ─────────────
// 히트마다 위력이 달라지는 기술(트리플악셀/트리플킥)은 hitPowers 로 표현
export interface HitInfo {
  min: number
  max: number
  hitPowers?: number[]
}
export function hitInfo(move: Move, attacker?: Combatant): HitInfo {
  if (move.id === 'tripleaxel') return { min: 3, max: 3, hitPowers: [20, 40, 60] }
  if (move.id === 'triplekick') return { min: 3, max: 3, hitPowers: [10, 20, 30] }
  if (move.id === 'populationbomb') return { min: 1, max: 10 }
  const mh = move.effects.find((e) => e.type === 'multihit') as { min: number; max: number } | undefined
  if (!mh) return { min: 1, max: 1 }
  if (attacker?.ability === 'skilllink') return { min: mh.max, max: mh.max }
  if (attacker?.item === 'loadeddice' && mh.max === 5) return { min: 4, max: 5 }
  return { min: mh.min, max: mh.max }
}

// 히트별 [최소, 최대] 데미지 배열 (maxHits 길이)
export function perHitDamage(
  move: Move, attacker: Combatant, defender: Combatant, chart: TypeChart, field: FieldState, opts: DamageOptions, info: HitInfo,
): { min: number[]; max: number[] } {
  if (info.hitPowers) {
    const r = info.hitPowers.map((p) => calcDamage({ ...move, power: p }, attacker, defender, chart, field, opts))
    return { min: r.map((x) => x.min), max: r.map((x) => x.max) }
  }
  const one = calcDamage(move, attacker, defender, chart, field, opts)
  return { min: Array(info.max).fill(one.min), max: Array(info.max).fill(one.max) }
}
