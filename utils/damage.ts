// utils/damage.ts — 데미지 계산 (포켓몬 챔피언스 = 9세대 공식, 레벨 50)
//
// 계산 순서와 반올림은 Pokemon Showdown(sim/battle-actions.ts modifyDamage)과 @smogon/calc 를 따른다.
//   1. 위력 보정 (특성/도구/필드/기술 조건)            → 4096 체인 후 반올림
//   2. 공격·방어 실능치 (랭크 → 특성/도구 보정)
//   3. 기본 데미지 = floor(floor(floor(2L/5+2) × 위력 × A / D) / 50) + 2
//   4. 광역 0.75 → 날씨 → 급소 1.5 → 난수(85~100%) → 자속 → 타입상성 → 화상 → 최종 보정(벽/도구/특성)
// tests/damage.test.ts 에서 @smogon/calc 결과와 비교 검증한다.

import type {
  BoostKey,
  BoostTable,
  Move,
  Pokemon,
  StatTable,
  Status,
  Terrain,
  TypeId,
  Weather,
} from './types'
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
  floating?: boolean // 전자부유 중 (땅에 있지 않음)
  sub?: number // 대타 HP (실수치, 맞는 쪽일 때만 의미 있음)
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
  friendGuard?: boolean // 방어 측 아군의 프렌드가드 (더블, 0.75배)
  wonderRoom?: boolean // 원더룸: 방어·특방 실능치를 서로 바꿔 씀 (랭크·보정 종류는 원래 능력치 기준)
  magicRoom?: boolean // 매직룸: 도구 효과 없음
}

export interface DamageOptions {
  crit?: boolean
  spread?: boolean // 더블에서 광역기가 2마리 이상을 맞히는 경우 (0.75배)
  level?: number
  helpingHand?: boolean // 아군의 도우미 (위력 1.5배)
  bondHit?: boolean // 부자유친 2타째 (0.25배)
  // 배틀 상황에 따라 달라지는 보정
  movesLast?: boolean // 애널라이즈: 대상보다 나중에 행동 (위력 1.3배)
  faintedAllies?: number // 총대장: 쓰러진 같은 편 수 (위력 +10%씩, 최대 5)
  targetSwitchedIn?: boolean // 잠복: 대상이 이번 턴 교체로 등장 (공격 2배)
  metronomeCount?: number // 메트로놈(도구): 같은 기술을 연속으로 쓴 횟수 (이번이 n+1번째)
  charged?: boolean // 충전 상태 (전기로바꾸기 발동 후) — 전기 기술 위력 2배
  timesHit?: number // 분노의주먹: 지금까지 공격을 맞은 횟수 (위력 50 + 50×n, 최대 350)
  damagedByTarget?: boolean // 눈사태: 이번 턴 대상에게 먼저 맞음 (위력 2배)
  targetDamagedThisTurn?: boolean // 승부굳히기: 대상이 이번 턴 이미 데미지를 받음 (위력 2배)
  lastMoveFailed?: boolean // 분함의발구르기·열불내기: 지난 기술이 실패 (위력 2배)
  statsLoweredThisTurn?: boolean // 분풀이: 이번 턴 능력이 떨어짐 (위력 2배)
  roundBoost?: boolean // 돌림노래: 같은 턴에 먼저 돌림노래를 쓴 포켓몬이 있음 (위력 2배)
  fickleDouble?: boolean // 변덕레이저: 30% 로 위력 2배 (calc.cell 이 두 경우를 섞어서 계산)
  stockpile?: number // 토해내기: 비축 횟수 (위력 100 × n, 0 이면 실패)
  beatUp?: number[] // 집단구타: 때리는 같은 편(기절·상태이상 제외)의 공격 종족값 → 타마다 위력 5 + 종족값/10
  damageTaken?: { physical: number; special: number; last: number } // 카운터·미러코트·메탈버스트·앙갚음: 이번 턴 받은 데미지
  focusEnergy?: boolean // 기충전 (급소 단계 +2)
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
export const applyMod = (value: number, mod4096: number) =>
  tr((tr(value * mod4096) + 2048 - 1) / 4096)
const chain = (a: number, b: number) => (a * b + 2048) >> 12
const M = {
  x2: 8192,
  x1_5: 6144,
  x1_3: 5325,
  x1_2: 4915,
  x1_1: 4505,
  x0_75: 3072,
  x0_5: 2048,
} as const

const TYPE_BOOST_ITEMS: Record<string, TypeId> = {
  silkscarf: 'normal',
  charcoal: 'fire',
  mysticwater: 'water',
  magnet: 'electric',
  miracleseed: 'grass',
  nevermeltice: 'ice',
  blackbelt: 'fighting',
  poisonbarb: 'poison',
  softsand: 'ground',
  sharpbeak: 'flying',
  twistedspoon: 'psychic',
  silverpowder: 'bug',
  hardstone: 'rock',
  spelltag: 'ghost',
  dragonfang: 'dragon',
  blackglasses: 'dark',
  metalcoat: 'steel',
  fairyfeather: 'fairy',
}
export const RESIST_BERRIES: Record<string, TypeId> = {
  occaberry: 'fire',
  passhoberry: 'water',
  wacanberry: 'electric',
  rindoberry: 'grass',
  yacheberry: 'ice',
  chopleberry: 'fighting',
  kebiaberry: 'poison',
  shucaberry: 'ground',
  cobaberry: 'flying',
  payapaberry: 'psychic',
  tangaberry: 'bug',
  chartiberry: 'rock',
  kasibberry: 'ghost',
  habanberry: 'dragon',
  colburberry: 'dark',
  babiriberry: 'steel',
  roseliberry: 'fairy',
  chilanberry: 'normal',
}
const SKIN_ABILITIES: Record<string, TypeId> = {
  aerilate: 'flying',
  pixilate: 'fairy',
  refrigerate: 'ice',
  galvanize: 'electric',
  dragonize: 'dragon',
}
const PINCH_ABILITIES: Record<string, TypeId> = {
  overgrow: 'grass',
  blaze: 'fire',
  torrent: 'water',
  swarm: 'bug',
}
// 위력 보정이 아닌 고정 데미지 기술
const FIXED_LEVEL_MOVES = new Set(['seismictoss', 'nightshade'])
// 받은 데미지를 되돌려 주는 기술 (배틀 화면이 DamageOptions.damageTaken 을 채움)
export const REVENGE_MOVES = new Set(['counter', 'mirrorcoat', 'metalburst', 'comeuppance'])
// 항상 급소 (전투무장/조가비갑옷이면 아님)
const ALWAYS_CRIT = new Set([
  'surgingstrikes',
  'wickedblow',
  'flowertrick',
  'frostbreath',
  'stormthrow',
])
// 대상의 방어·특방 랭크 무시 (DD래리어트 / 성스러운칼)
const IGNORES_DEF_BOOSTS = new Set(['darkestlariat', 'sacredsword'])
// 맞히기 전에 대상 쪽 벽(리플렉터·빛의장막·오로라베일)을 깬다 → 벽 보정 없음
export const SCREEN_BREAKERS = new Set(['brickbreak', 'psychicfangs', 'ragingbull'])
// 솔라빔·솔라블레이드 위력 절반이 되는 날씨
const SOLAR_WEAK_WEATHER = new Set(['rain', 'heavyrain', 'sand', 'snow'])
const HALF_HP_MOVES = new Set(['superfang', 'ruination'])
// 틀깨기로 무시되지 않는 방어 측 특성 (Showdown flags.breakable 없음)
const UNBREAKABLE = new Set(['shadowshield', 'prismarmor', 'cloudnine', 'airlock', 'fairyaura'])
const CRIT_IMMUNE = new Set(['battlearmor', 'shellarmor'])
// 셰이크포스 대상: 부가효과가 있는 기술
export const hasSecondary = (move: Move) =>
  move.effects.some((e) => 'chance' in e && e.chance !== undefined)

// 부유 / 천정부지(메가저리더프, 챔피언스) = 땅에 있지 않음
const NOT_GROUNDED_ABILITIES = new Set(['levitate', 'eelevate'])
export const isGrounded = (c: Combatant, field: FieldState) =>
  field.gravity ||
  c.item === 'ironball' ||
  (!c.species.types.includes('flying') &&
    !NOT_GROUNDED_ABILITIES.has(c.ability) &&
    c.item !== 'airballoon' &&
    !c.floating)

// 헤비메탈 2배 / 라이트메탈 0.5배
const weightOf = (c: Combatant) =>
  c.ability === 'heavymetal'
    ? c.species.weight * 2
    : c.ability === 'lightmetal'
      ? Math.floor(c.species.weight * 5) / 10
      : c.species.weight

// 틀깨기: 공격하는 동안 방어 측 특성을 무시
export const withMoldBreaker = (attacker: Combatant, defender: Combatant): Combatant =>
  attacker.ability === 'moldbreaker' && defender.ability && !UNBREAKABLE.has(defender.ability)
    ? { ...defender, ability: '' }
    : defender

const IGNORES_WEATHER = new Set(['cloudnine', 'airlock'])
export const effectiveWeather = (field: FieldState, a: Combatant, d: Combatant): Weather =>
  IGNORES_WEATHER.has(a.ability) || IGNORES_WEATHER.has(d.ability) ? '' : field.weather || ''

// 날씨예보(캐스퐁): 날씨에 따라 폼이 바뀌어 타입이 달라진다 (종족값은 같음). 쾌청 → 불꽃, 비 → 물, 설경 → 얼음
const FORECAST_FORM: Partial<Record<Weather, { id: string; type: TypeId }>> = {
  sun: { id: 'castformsunny', type: 'fire' },
  harshsun: { id: 'castformsunny', type: 'fire' },
  rain: { id: 'castformrainy', type: 'water' },
  heavyrain: { id: 'castformrainy', type: 'water' },
  snow: { id: 'castformsnowy', type: 'ice' },
}
// 그 날씨에서의 캐스퐁 폼 id (날씨예보가 아니거나 해당 날씨가 아니면 null)
export const forecastForm = (ability: string, weather: Weather | '') =>
  ability === 'forecast' ? (FORECAST_FORM[weather as Weather]?.id ?? null) : null
// 화면 표시용: 그 날씨에서의 타입 (캐스퐁만 바뀜)
export const typesInWeather = (species: Pokemon, ability: string, weather: Weather | '') =>
  withForecast({ species, ability } as Combatant, weather).species.types
export const withForecast = (c: Combatant, weather: Weather | ''): Combatant => {
  const f = c.ability === 'forecast' ? FORECAST_FORM[weather as Weather] : undefined
  return f ? { ...c, species: { ...c.species, types: [f.type] } } : c
}

// 타입 상성 (특성/도구에 의한 무효 포함)
export function typeEffectiveness(
  moveType: TypeId,
  move: Move,
  attacker: Combatant,
  defender: Combatant,
  chart: TypeChart,
  field: FieldState,
): { mult: number; reason?: string } {
  const scrappy = attacker.ability === 'scrappy' || attacker.ability === 'mindseye'
  let mult = 1
  for (const t of defender.species.types) {
    let m = chart[moveType]?.[t] ?? 1
    if (m === 0 && t === 'ghost' && scrappy && (moveType === 'normal' || moveType === 'fighting'))
      m = 1
    if (
      m === 0 &&
      t === 'flying' &&
      moveType === 'ground' &&
      (field.gravity || defender.item === 'ironball')
    )
      m = 1
    if (move.id === 'freezedry' && t === 'water') m = 2
    if (move.id === 'flyingpress' && m !== 0) m *= chart.flying?.[t] ?? 1
    mult *= m
  }
  if (mult === 0) return { mult: 0, reason: 'type' }

  const ab = defender.ability
  const absorb: Record<string, TypeId[]> = {
    flashfire: ['fire'],
    wellbakedbody: ['fire'],
    waterabsorb: ['water'],
    stormdrain: ['water'],
    dryskin: ['water'],
    voltabsorb: ['electric'],
    lightningrod: ['electric'],
    motordrive: ['electric'],
    sapsipper: ['grass'],
    eartheater: ['ground'],
  }
  if (absorb[ab]?.includes(moveType)) return { mult: 0, reason: ab }
  if (moveType === 'ground' && !isGrounded(defender, field) && move.id !== 'thousandarrows') {
    return {
      mult: 0,
      reason:
        defender.item === 'airballoon'
          ? 'airballoon'
          : NOT_GROUNDED_ABILITIES.has(ab)
            ? ab
            : defender.floating
              ? 'magnetrise'
              : 'type',
    }
  }
  if (ab === 'bulletproof' && move.flags.includes('bullet')) return { mult: 0, reason: ab }
  if (ab === 'soundproof' && move.flags.includes('sound')) return { mult: 0, reason: ab }
  if (ab === 'windrider' && move.flags.includes('wind')) return { mult: 0, reason: ab }
  if (ab === 'wonderguard' && mult <= 1) return { mult: 0, reason: ab }
  return { mult }
}

// 화면 표시용 기술 타입: 특성(스킨류·노말스킨·촉촉보이스)과 날씨(웨더볼)·필드(대지의파동) 반영.
// 메가진화 후 특성이 바뀌는 경우(메가가디안 페어리스킨 등)는 호출하는 쪽이 메가 적용된 특성을 넘긴다.
// species: 폼에 따라 타입이 바뀌는 기술(레이징불)용. 없으면 기술 원래 타입
export const effectiveMoveType = (
  move: Move,
  ability: string,
  field: FieldState = {},
  species?: Pokemon | null,
): TypeId =>
  resolveMoveType(
    move,
    { ability, species } as Combatant,
    IGNORES_WEATHER.has(ability) ? '' : field.weather || '',
    field.terrain || '',
  ).type

// 최종 기술 타입 (스킨 특성 / 웨더볼 / 대지의파동 / 노말스킨 등)
function resolveMoveType(
  move: Move,
  a: Combatant,
  weather: Weather,
  terrain: Terrain,
): { type: TypeId; skinBoost: boolean } {
  if (move.id === 'weatherball') {
    const t = (
      {
        sun: 'fire',
        harshsun: 'fire',
        rain: 'water',
        heavyrain: 'water',
        sand: 'rock',
        snow: 'ice',
      } as const
    )[weather as 'sun']
    return { type: t || 'normal', skinBoost: false }
  }
  if (move.id === 'terrainpulse' && terrain) {
    return {
      type: (
        { electric: 'electric', grassy: 'grass', misty: 'fairy', psychic: 'psychic' } as const
      )[terrain],
      skinBoost: false,
    }
  }
  // 오라휠: 모르페코 배부른모양 전기 / 배고픈모양 악
  if (move.id === 'aurawheel')
    return { type: a.species?.id === 'morpekohangry' ? 'dark' : 'electric', skinBoost: false }
  if (move.id === 'ragingbull') {
    const t = (
      {
        taurospaldeacombat: 'fighting',
        taurospaldeablaze: 'fire',
        taurospaldeaaqua: 'water',
      } as Record<string, TypeId>
    )[a.species?.id ?? '']
    if (t) return { type: t, skinBoost: false }
  }
  if (a.ability === 'normalize') return { type: 'normal', skinBoost: true }
  if (a.ability === 'liquidvoice' && move.flags.includes('sound'))
    return { type: 'water', skinBoost: false }
  const skin = SKIN_ABILITIES[a.ability]
  if (skin && move.type === 'normal') return { type: skin, skinBoost: true }
  return { type: move.type, skinBoost: false }
}

// 상태/체력/무게 등에 따라 기본 위력이 바뀌는 기술
function resolveBasePower(
  move: Move,
  a: Combatant,
  d: Combatant,
  weather: Weather,
  terrain: Terrain,
  field: FieldState = {},
  opts: DamageOptions = {},
): number {
  const aHp = a.hp ?? a.stats.hp
  const dHp = d.hp ?? d.stats.hp
  const positiveBoosts = Object.values(a.boosts || {}).reduce((s, v) => s + Math.max(0, v || 0), 0)
  switch (move.id) {
    case 'weatherball':
      return weather ? 100 : 50
    case 'terrainpulse':
      return terrain ? 100 : 50
    case 'facade':
      return a.status && a.status !== 'slp' && a.status !== 'frz' ? 140 : 70
    case 'hex':
      return d.status ? 130 : 65
    case 'infernalparade':
      return d.status || d.ability === 'comatose' ? move.power * 2 : move.power
    case 'risingvoltage':
      return terrain === 'electric' && isGrounded(d, field) ? move.power * 2 : move.power
    case 'hardpress': {
      // Showdown: floor(floor((100 × 100 × floor(hp × 4096 / maxHP) + 2047) / 4096) / 100), 최소 1
      const r = Math.floor((dHp * 4096) / d.stats.hp)
      return Math.floor(Math.floor((100 * (100 * r) + 2048 - 1) / 4096) / 100) || 1
    }
    case 'lastrespects':
      return 50 + 50 * (opts.faintedAllies || 0)
    case 'ragefist':
      return Math.min(350, 50 + 50 * (opts.timesHit || 0))
    case 'payback':
      // 대상이 이미 행동했으면 2배 (이번 턴 교체로 나온 대상은 제외)
      return opts.movesLast && !opts.targetSwitchedIn ? move.power * 2 : move.power
    case 'avalanche':
      return opts.damagedByTarget ? move.power * 2 : move.power
    case 'assurance':
      return opts.targetDamagedThisTurn ? move.power * 2 : move.power
    case 'stompingtantrum':
    case 'temperflare':
      return opts.lastMoveFailed ? move.power * 2 : move.power
    case 'lashout':
      return opts.statsLoweredThisTurn ? move.power * 2 : move.power
    case 'round':
      return opts.roundBoost ? move.power * 2 : move.power
    case 'ficklebeam':
      return opts.fickleDouble ? move.power * 2 : move.power
    case 'spitup':
      return 100 * Math.min(3, opts.stockpile || 0)
    case 'beatup':
      // 연속기로 계산할 때는 타마다 위력이 들어옴(perHitDamage). 1타만이면 자신의 공격 종족값
      return move.power || 5 + Math.floor(a.species.stats.atk / 10)
    case 'venoshock':
      return d.status === 'psn' || d.status === 'tox' ? 130 : 65
    case 'brine':
      return dHp * 2 <= d.stats.hp ? 130 : 65
    case 'acrobatics':
      return a.item ? 55 : 110
    case 'storedpower':
    case 'powertrip':
      return 20 + 20 * positiveBoosts
    case 'eruption':
    case 'waterspout':
    case 'dragonenergy':
      return Math.max(1, Math.floor((150 * aHp) / a.stats.hp))
    case 'flail':
    case 'reversal': {
      const p = Math.floor((48 * aHp) / a.stats.hp)
      return p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20
    }
    case 'lowkick':
    case 'grassknot': {
      const w = weightOf(d)
      return w >= 200 ? 120 : w >= 100 ? 100 : w >= 50 ? 80 : w >= 25 ? 60 : w >= 10 ? 40 : 20
    }
    case 'heavyslam':
    case 'heatcrash': {
      const r = weightOf(a) / weightOf(d)
      return r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40
    }
    case 'gyroball': {
      const v =
        Math.floor(
          (25 * applyBoost(d.stats.spe, d.boosts?.spe || 0)) /
            Math.max(1, applyBoost(a.stats.spe, a.boosts?.spe || 0)),
        ) + 1
      return Math.min(150, v)
    }
    case 'electroball': {
      const r =
        applyBoost(a.stats.spe, a.boosts?.spe || 0) /
        Math.max(1, applyBoost(d.stats.spe, d.boosts?.spe || 0))
      return r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40
    }
    default:
      return move.power
  }
}

// 원더룸이면 방어↔특방 실능치를 바꿔 읽는다 (Showdown Pokemon.calculateStat)
export const rawStat = (c: Combatant, k: BoostKey, field: FieldState) =>
  field.wonderRoom && (k === 'def' || k === 'spd')
    ? c.stats[k === 'def' ? 'spd' : 'def']
    : c.stats[k]

// 매직룸: 양쪽 도구를 없는 것으로
export const withoutItems = (field: FieldState, ...cs: Combatant[]) =>
  field.magicRoom ? cs.map((c) => ({ ...c, item: '' })) : cs

// 셸암즈: 랭크만 반영한(도구·특성 제외) 물리/특수 기본 데미지를 비교해 큰 쪽 (같으면 무작위 → 특수로 둠)
// 혼란 자해 데미지 (Showdown getConfusionDamage): 위력 40, 타입 없음, 랭크만 반영한 자신의 공격·방어
// (도구·특성 보정·화상·급소 없음), 난수 85~100%, 최소 1
export function confusionDamage(c: Combatant, field: FieldState = {}, level = 50): number[] {
  const st = (k: BoostKey) => applyBoost(rawStat(c, k, field), c.boosts?.[k] || 0)
  const base =
    tr(tr(tr(tr((2 * level) / 5 + 2) * 40 * st('atk')) / Math.max(1, st('def'))) / 50) + 2
  return Array.from({ length: 16 }, (_, i) => Math.max(1, tr((base * (85 + i)) / 100)))
}

function shellSideArm(move: Move, a: Combatant, d: Combatant, field: FieldState): Move {
  const st = (c: Combatant, k: BoostKey) => applyBoost(rawStat(c, k, field), c.boosts?.[k] || 0)
  const base = (atk: number, def: number) =>
    tr(tr(tr(tr((2 * 50) / 5 + 2) * 90 * atk) / Math.max(1, def)) / 50)
  return base(st(a, 'atk'), st(d, 'def')) > base(st(a, 'spa'), st(d, 'spd'))
    ? { ...move, category: 'physical', flags: [...move.flags, 'contact'] }
    : move
}

export function calcDamage(
  rawMove: Move,
  rawAttacker: Combatant,
  rawDefender: Combatant,
  chart: TypeChart,
  field: FieldState = {},
  opts: DamageOptions = {},
): DamageResult {
  const level = opts.level ?? 50
  const [noItemAttacker, noItemDefender] = withoutItems(field, rawAttacker, rawDefender) as [
    Combatant,
    Combatant,
  ]
  // 캐스퐁은 날씨에 맞는 타입으로 (틀깨기와 무관하게 폼은 이미 바뀌어 있음)
  const forecastWeather = effectiveWeather(field, noItemAttacker, noItemDefender)
  const attacker = withForecast(noItemAttacker, forecastWeather)
  const defender = withMoldBreaker(attacker, withForecast(noItemDefender, forecastWeather))
  const move =
    rawMove.id === 'shellsidearm' ? shellSideArm(rawMove, attacker, defender, field) : rawMove
  const merciless =
    attacker.ability === 'merciless' && (defender.status === 'psn' || defender.status === 'tox')
  const crit =
    (!!opts.crit || merciless || ALWAYS_CRIT.has(move.id)) && !CRIT_IMMUNE.has(defender.ability)
  const weather = effectiveWeather(field, attacker, defender)
  const terrain = field.terrain || ''
  const { type, skinBoost } = resolveMoveType(move, attacker, weather, terrain)
  const zero = (reason?: string): DamageResult => ({
    rolls: Array(16).fill(0),
    min: 0,
    max: 0,
    effectiveness: 0,
    type,
    power: 0,
    immuneReason: reason,
  })

  if (move.category === 'status') return { ...zero(), effectiveness: 1 }
  // 토해내기: 비축이 없으면 실패
  if (move.id === 'spitup' && !(opts.stockpile && opts.stockpile > 0)) return zero('fail')
  const eff = typeEffectiveness(type, move, attacker, defender, chart, field)
  if (eff.mult === 0) return zero(eff.reason)
  if ((weather === 'harshsun' && type === 'water') || (weather === 'heavyrain' && type === 'fire'))
    return zero('weather')

  // 고정 데미지 기술
  if (FIXED_LEVEL_MOVES.has(move.id))
    return {
      rolls: Array(16).fill(level),
      min: level,
      max: level,
      effectiveness: 1,
      type,
      power: 0,
    }
  if (move.id === 'finalgambit' || move.id === 'endeavor') {
    // 목숨걸기: 내 남은 HP / 죽기살기: 대상 HP − 내 HP (0 이하면 실패)
    const aHpNow = attacker.hp ?? attacker.stats.hp
    const v =
      move.id === 'finalgambit' ? aHpNow : Math.max(0, (defender.hp ?? defender.stats.hp) - aHpNow)
    return { rolls: Array(16).fill(v), min: v, max: v, effectiveness: 1, type, power: 0 }
  }
  // 카운터(물리)·미러코트(특수) = 이번 턴 받은 데미지 × 2, 메탈버스트·앙갚음 = 마지막으로 받은 데미지 × 1.5
  if (REVENGE_MOVES.has(move.id)) {
    const t = opts.damageTaken
    const v = !t
      ? 0
      : move.id === 'counter'
        ? t.physical * 2
        : move.id === 'mirrorcoat'
          ? t.special * 2
          : Math.floor(t.last * 1.5)
    return { rolls: Array(16).fill(v), min: v, max: v, effectiveness: 1, type, power: 0 }
  }
  if (HALF_HP_MOVES.has(move.id)) {
    const v = Math.max(1, Math.floor((defender.hp ?? defender.stats.hp) / 2))
    return { rolls: Array(16).fill(v), min: v, max: v, effectiveness: 1, type, power: 0 }
  }

  const { power, attack } = offense(
    move,
    attacker,
    defender,
    field,
    crit,
    type,
    skinBoost,
    weather,
    opts,
  )
  const physical = move.category === 'physical'
  const contact = move.flags.includes('contact')
  const ab = attacker.ability
  const dAb = defender.ability
  const dHp = defender.hp ?? defender.stats.hp
  const terrainNow = terrain

  // 방어 실능치
  const defStat =
    physical || ['psyshock', 'psystrike', 'secretsword'].includes(move.id) ? 'def' : 'spd'
  let defBoost = defender.boosts?.[defStat] || 0
  if (ab === 'unaware' || IGNORES_DEF_BOOSTS.has(move.id)) defBoost = 0
  if (crit && defBoost > 0) defBoost = 0
  let defense = applyBoost(rawStat(defender, defStat, field), defBoost)
  if (weather === 'sand' && defStat === 'spd' && defender.species.types.includes('rock'))
    defense = applyMod(defense, M.x1_5)
  if (weather === 'snow' && defStat === 'def' && defender.species.types.includes('ice'))
    defense = applyMod(defense, M.x1_5)
  let defMod = 4096
  if (defStat === 'def' && dAb === 'furcoat') defMod = chain(defMod, M.x2)
  if (defStat === 'def' && dAb === 'marvelscale' && defender.status) defMod = chain(defMod, M.x1_5)
  if (defStat === 'def' && dAb === 'grasspelt' && terrainNow === 'grassy')
    defMod = chain(defMod, M.x1_5)
  if (defStat === 'spd' && defender.item === 'assaultvest') defMod = chain(defMod, M.x1_5)
  if (defender.item === 'eviolite') defMod = chain(defMod, M.x1_5)
  defense = Math.max(1, applyMod(defense, defMod))

  return finishDamage({
    move,
    attacker,
    defender,
    field,
    opts,
    crit,
    weather,
    type,
    eff: eff.mult,
    power,
    attack,
    defense,
    physical,
    contact,
    ab,
    dAb,
    dHp,
    level,
  })
}

// 위력 + 공격 실능치 (방어 측 특성 중 공격 보정에 관여하는 것 포함). 결정력 표시에도 쓴다.
function offense(
  move: Move,
  attacker: Combatant,
  defender: Combatant,
  field: FieldState,
  crit: boolean,
  type: TypeId,
  skinBoost: boolean,
  weather: Weather,
  opts: DamageOptions = {},
): { power: number; attack: number } {
  const terrain = field.terrain || ''
  const physical = move.category === 'physical'
  const contact = move.flags.includes('contact')
  const aGrounded = isGrounded(attacker, field)
  const dGrounded = isGrounded(defender, field)
  const aHp = attacker.hp ?? attacker.stats.hp

  // ── 1. 위력 ─────────────
  const basePower = resolveBasePower(move, attacker, defender, weather, terrain, field, opts)
  let bpMod = 4096
  const ab = attacker.ability
  if (ab === 'technician' && basePower <= 60) bpMod = chain(bpMod, M.x1_5)
  if (ab === 'sharpness' && move.flags.includes('slicing')) bpMod = chain(bpMod, M.x1_5)
  if (ab === 'toughclaws' && contact) bpMod = chain(bpMod, M.x1_3)
  if (ab === 'ironfist' && move.flags.includes('punch')) bpMod = chain(bpMod, M.x1_2)
  if (ab === 'strongjaw' && move.flags.includes('bite')) bpMod = chain(bpMod, M.x1_5)
  if (ab === 'megalauncher' && move.flags.includes('pulse')) bpMod = chain(bpMod, M.x1_5)
  if (ab === 'punkrock' && move.flags.includes('sound')) bpMod = chain(bpMod, M.x1_3)
  if (ab === 'reckless' && move.effects.some((e) => e.type === 'recoil'))
    bpMod = chain(bpMod, M.x1_2)
  if (ab === 'sheerforce' && hasSecondary(move)) bpMod = chain(bpMod, M.x1_3)
  if (ab === 'steelyspirit' && type === 'steel') bpMod = chain(bpMod, M.x1_5)
  if ((ab === 'fairyaura' || defender.ability === 'fairyaura') && type === 'fairy')
    bpMod = chain(bpMod, 5448)
  if (defender.ability === 'dryskin' && type === 'fire') bpMod = chain(bpMod, 5120)
  if (opts.helpingHand) bpMod = chain(bpMod, M.x1_5)
  if (opts.charged && type === 'electric') bpMod = chain(bpMod, M.x2)
  if (
    (move.id === 'expandingforce' && terrain === 'psychic' && aGrounded) ||
    (move.id === 'mistyexplosion' && terrain === 'misty' && aGrounded) ||
    (move.id === 'gravapple' && field.gravity)
  )
    bpMod = chain(bpMod, M.x1_5)
  if ((move.id === 'solarbeam' || move.id === 'solarblade') && SOLAR_WEAK_WEATHER.has(weather))
    bpMod = chain(bpMod, M.x0_5)
  if (move.id === 'barbbarrage' && (defender.status === 'psn' || defender.status === 'tox'))
    bpMod = chain(bpMod, M.x2)
  if (ab === 'analytic' && opts.movesLast) bpMod = chain(bpMod, M.x1_3)
  if (ab === 'supremeoverlord' && opts.faintedAllies)
    bpMod = chain(bpMod, [4096, 4506, 4915, 5325, 5734, 6144][Math.min(5, opts.faintedAllies)]!)
  if (ab === 'sandforce' && weather === 'sand' && ['rock', 'ground', 'steel'].includes(type))
    bpMod = chain(bpMod, M.x1_3)
  if (skinBoost && ab !== 'normalize') bpMod = chain(bpMod, M.x1_2)
  if (ab === 'normalize') bpMod = chain(bpMod, M.x1_2)
  if (TYPE_BOOST_ITEMS[attacker.item] === type) bpMod = chain(bpMod, M.x1_2)
  if (attacker.item === 'muscleband' && physical) bpMod = chain(bpMod, M.x1_1)
  if (attacker.item === 'wiseglasses' && !physical) bpMod = chain(bpMod, M.x1_1)
  if (attacker.item === 'normalgem' && type === 'normal') bpMod = chain(bpMod, M.x1_3)
  if (move.id === 'knockoff' && defender.item && !defender.itemLocked) bpMod = chain(bpMod, M.x1_5)
  if (aGrounded) {
    if (
      (terrain === 'electric' && type === 'electric') ||
      (terrain === 'grassy' && type === 'grass') ||
      (terrain === 'psychic' && type === 'psychic')
    )
      bpMod = chain(bpMod, M.x1_3)
  }
  if (dGrounded) {
    if (terrain === 'misty' && type === 'dragon') bpMod = chain(bpMod, M.x0_5)
    if (terrain === 'grassy' && (move.id === 'earthquake' || move.id === 'bulldoze'))
      bpMod = chain(bpMod, M.x0_5)
  }
  const power = Math.max(1, applyMod(basePower, bpMod))

  // ── 2. 공격 ─────────────
  // 바디프레스: 자신의 방어 / 속임수: 상대의 공격
  const atkSource = move.id === 'foulplay' ? defender : attacker
  const atkStat = move.id === 'bodypress' ? 'def' : physical ? 'atk' : 'spa'

  let atkBoost = atkSource.boosts?.[atkStat] || 0
  if (defender.ability === 'unaware') atkBoost = 0
  if (crit && atkBoost < 0) atkBoost = 0
  let attack = applyBoost(rawStat(atkSource, atkStat, field), atkBoost)

  let atkMod = 4096
  if (physical && (ab === 'hugepower' || ab === 'purepower')) atkMod = chain(atkMod, M.x2)
  if (ab === 'stakeout' && opts.targetSwitchedIn) atkMod = chain(atkMod, M.x2)
  if (physical && ab === 'guts' && attacker.status) atkMod = chain(atkMod, M.x1_5)
  if (physical && (ab === 'hustle' || ab === 'gorillatactics')) atkMod = chain(atkMod, M.x1_5)
  if (!physical && ab === 'solarpower' && (weather === 'sun' || weather === 'harshsun'))
    atkMod = chain(atkMod, M.x1_5)
  if (PINCH_ABILITIES[ab] === type && aHp * 3 <= attacker.stats.hp) atkMod = chain(atkMod, M.x1_5)
  if (ab === 'transistor' && type === 'electric') atkMod = chain(atkMod, M.x1_3)
  if (
    (ab === 'dragonsmaw' && type === 'dragon') ||
    (ab === 'steelworker' && type === 'steel') ||
    (ab === 'rockypayload' && type === 'rock')
  )
    atkMod = chain(atkMod, M.x1_5)
  if (ab === 'firemane' && type === 'fire') atkMod = chain(atkMod, M.x1_5)
  if (ab === 'waterbubble' && type === 'water') atkMod = chain(atkMod, M.x2)
  if (ab === 'defeatist' && aHp * 2 <= attacker.stats.hp) atkMod = chain(atkMod, M.x0_5)
  if (attacker.item === 'choiceband' && physical) atkMod = chain(atkMod, M.x1_5)
  if (attacker.item === 'choicespecs' && !physical) atkMod = chain(atkMod, M.x1_5)
  if (attacker.item === 'lightball' && attacker.species.base === 'pikachu')
    atkMod = chain(atkMod, M.x2)
  const dAb = defender.ability
  if (dAb === 'thickfat' && (type === 'fire' || type === 'ice')) atkMod = chain(atkMod, M.x0_5)
  if (dAb === 'heatproof' && type === 'fire') atkMod = chain(atkMod, M.x0_5)
  if (dAb === 'waterbubble' && type === 'fire') atkMod = chain(atkMod, M.x0_5)
  if (dAb === 'purifyingsalt' && type === 'ghost') atkMod = chain(atkMod, M.x0_5)
  attack = Math.max(1, applyMod(attack, atkMod))
  return { power, attack }
}

interface FinishArgs {
  move: Move
  attacker: Combatant
  defender: Combatant
  field: FieldState
  opts: DamageOptions
  crit: boolean
  weather: Weather
  type: TypeId
  eff: number
  power: number
  attack: number
  defense: number
  physical: boolean
  contact: boolean
  ab: string
  dAb: string
  dHp: number
  level: number
}

function finishDamage(x: FinishArgs): DamageResult {
  const {
    move,
    attacker,
    defender,
    field,
    opts,
    crit,
    weather,
    type,
    power,
    attack,
    defense,
    physical,
    contact,
    ab,
    dAb,
    dHp,
    level,
  } = x
  const eff = { mult: x.eff }
  // ── 3. 기본 데미지 ─────────────
  let base = tr(tr((tr((2 * level) / 5 + 2) * power * attack) / defense) / 50) + 2

  // ── 4. 보정 ─────────────
  if (opts.spread) base = applyMod(base, M.x0_75)
  if (opts.bondHit) base = applyMod(base, 1024)
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
  const screenUp =
    !crit &&
    ab !== 'infiltrator' &&
    !SCREEN_BREAKERS.has(move.id) &&
    (field.auroraVeil || (physical && field.reflect) || (!physical && field.lightScreen))
  if (screenUp) finalMod = chain(finalMod, field.doubles ? 2732 : M.x0_5)
  if ((dAb === 'multiscale' || dAb === 'shadowshield') && dHp >= defender.stats.hp)
    finalMod = chain(finalMod, M.x0_5)
  if (field.friendGuard) finalMod = chain(finalMod, M.x0_75)
  if (dAb === 'fluffy' && contact) finalMod = chain(finalMod, M.x0_5)
  if (dAb === 'fluffy' && type === 'fire') finalMod = chain(finalMod, M.x2)
  if (dAb === 'punkrock' && move.flags.includes('sound')) finalMod = chain(finalMod, M.x0_5)
  if (dAb === 'icescales' && !physical) finalMod = chain(finalMod, M.x0_5)
  if (dAb === 'auraguard' && contact) finalMod = chain(finalMod, M.x0_5)
  if ((dAb === 'filter' || dAb === 'solidrock' || dAb === 'prismarmor') && eff.mult > 1)
    finalMod = chain(finalMod, M.x0_75)
  if (ab === 'tintedlens' && eff.mult < 1) finalMod = chain(finalMod, M.x2)
  if (ab === 'sniper' && crit) finalMod = chain(finalMod, M.x1_5)
  if (attacker.item === 'expertbelt' && eff.mult > 1) finalMod = chain(finalMod, M.x1_2)
  if (attacker.item === 'lifeorb') finalMod = chain(finalMod, 5324)
  if (attacker.item === 'metronome' && opts.metronomeCount)
    finalMod = chain(finalMod, opts.metronomeCount >= 5 ? M.x2 : 4096 + 819 * opts.metronomeCount)
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
  return { rolls, min: rolls[0]!, max: rolls[15]!, effectiveness: eff.mult, type, power }
}

// 더블에서 여러 대상을 맞히는 광역기 (상대 전체 / 자신 외 전체). '무작위 상대'(역린 등)는 아님
export const SPREAD_TARGETS = ['allAdjacentFoes', 'allAdjacent']
// ctx: 와이드포스는 사이코필드에서 사용자가 땅에 있으면 상대 전체를 맞힌다
export const isSpreadMove = (
  move: Move | null | undefined,
  ctx?: { attacker?: Combatant | null; field?: FieldState },
) =>
  !!move &&
  move.category !== 'status' &&
  (SPREAD_TARGETS.includes(move.target) ||
    (move.id === 'expandingforce' &&
      ctx?.field?.terrain === 'psychic' &&
      !!ctx.attacker &&
      isGrounded(ctx.attacker, ctx.field)))

// ── 결정력 (공격 실능치 × 위력 × 자속 × 날씨 × 화상) ─────────────
// 방어 측과 무관한 화력 지표. 위력/공격 보정은 calcDamage 와 같은 offense() 를 그대로 쓴다.
export function powerIndex(
  move: Move,
  rawAttacker: Combatant,
  field: FieldState = {},
): number | null {
  if (move.category === 'status' || !move.power) return null
  const weather: Weather = IGNORES_WEATHER.has(rawAttacker.ability) ? '' : field.weather || ''
  const attacker = withForecast(rawAttacker, weather)
  const dummy: Combatant = {
    species: { ...attacker.species, types: [], abilities: [], weight: 1 },
    stats: attacker.stats,
    ability: '',
    item: '',
  }
  const { type, skinBoost } = resolveMoveType(move, attacker, weather, field.terrain || '')
  const { power, attack } = offense(move, attacker, dummy, field, false, type, skinBoost, weather)
  let v = power * attack
  const ab = attacker.ability
  if (ab === 'protean' || ab === 'libero' || attacker.species.types.includes(type))
    v *= ab === 'adaptability' ? 2 : 1.5
  if (weather === 'sun' || weather === 'harshsun' || ab === 'megasol')
    v *= type === 'fire' ? 1.5 : type === 'water' && ab !== 'megasol' ? 0.5 : 1
  else if (weather === 'rain' || weather === 'heavyrain')
    v *= type === 'water' ? 1.5 : type === 'fire' ? 0.5 : 1
  if (
    attacker.status === 'brn' &&
    move.category === 'physical' &&
    ab !== 'guts' &&
    move.id !== 'facade'
  )
    v *= 0.5
  if (attacker.item === 'lifeorb') v *= 1.3
  return Math.floor(v)
}

// ── 연속기 ─────────────
// 히트마다 위력이 달라지는 기술(트리플악셀/트리플킥)은 hitPowers 로 표현
export interface HitInfo {
  min: number
  max: number
  hitPowers?: number[]
  parentalBond?: boolean // 2타째는 0.25배
}
// spread: 더블에서 여러 대상을 맞히는 경우 (부자유친 미발동)
// 트리플악셀·트리플킥·찍찍베기는 두 번째부터 매 타 명중 판정 → 최소 1타. 스킬링크·속임수주사위면 그 판정이 없다
// (찍찍베기 + 속임수주사위는 4~10회)
export function hitInfo(
  move: Move,
  attacker?: Combatant,
  spread = false,
  opts: DamageOptions = {},
): HitInfo {
  // 집단구타: 같은 편(자신 포함, 기절·상태이상 제외) 한 마리당 1타, 위력 5 + 공격 종족값/10
  if (move.id === 'beatup') {
    const bases = opts.beatUp?.length ? opts.beatUp : [attacker?.species.stats.atk ?? 0]
    const hitPowers = bases.map((b) => 5 + Math.floor(b / 10))
    return { min: hitPowers.length, max: hitPowers.length, hitPowers }
  }
  const skillLink = attacker?.ability === 'skilllink'
  const dice = attacker?.item === 'loadeddice'
  const sure = skillLink || dice
  if (move.id === 'tripleaxel') return { min: sure ? 3 : 1, max: 3, hitPowers: [20, 40, 60] }
  if (move.id === 'triplekick') return { min: sure ? 3 : 1, max: 3, hitPowers: [10, 20, 30] }
  if (move.id === 'populationbomb')
    return skillLink ? { min: 10, max: 10 } : dice ? { min: 4, max: 10 } : { min: 1, max: 10 }
  const mh = move.effects.find((e) => e.type === 'multihit') as
    | { min: number; max: number }
    | undefined
  if (!mh) {
    const bond =
      attacker?.ability === 'parentalbond' &&
      move.category !== 'status' &&
      !spread &&
      !HALF_HP_MOVES.has(move.id) &&
      !move.flags.some((f) => f === 'charge' || f === 'futuremove' || f === 'noparentalbond')
    return bond ? { min: 2, max: 2, parentalBond: true } : { min: 1, max: 1 }
  }
  if (skillLink) return { min: mh.max, max: mh.max }
  if (dice && mh.max === 5) return { min: 4, max: 5 }
  return { min: mh.min, max: mh.max }
}

// 히트별 [최소, 최대] 데미지 배열 (maxHits 길이)
export function perHitDamage(
  move: Move,
  attacker: Combatant,
  defender: Combatant,
  chart: TypeChart,
  field: FieldState,
  opts: DamageOptions,
  info: HitInfo,
): { min: number[]; max: number[] } {
  if (info.parentalBond) {
    const first = calcDamage(move, attacker, defender, chart, field, opts)
    const second = calcDamage(move, attacker, defender, chart, field, { ...opts, bondHit: true })
    return { min: [first.min, second.min], max: [first.max, second.max] }
  }
  if (info.hitPowers) {
    const r = info.hitPowers.map((p) =>
      calcDamage({ ...move, power: p }, attacker, defender, chart, field, opts),
    )
    return { min: r.map((x) => x.min), max: r.map((x) => x.max) }
  }
  const one = calcDamage(move, attacker, defender, chart, field, opts)
  return { min: Array(info.max).fill(one.min), max: Array(info.max).fill(one.max) }
}
