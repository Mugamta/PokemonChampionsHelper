// tests/damage.test.ts — utils/damage.ts 를 @smogon/calc(9세대) 결과와 비교 검증
// 챔피언스 능력 포인트(SP)는 노력치로 환산하면 첫 1포인트 4, 이후 8씩 → EV = 8·SP − 4 (SP>0)
// 이렇게 하면 레벨 50 실능치가 챔피언스 공식(종족값+SP+20)과 정확히 일치한다.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calculate, Field, Generations, Move as SMove, Pokemon as SPokemon } from '@smogon/calc'
import {
  calcDamage,
  effectiveMoveType,
  hitInfo,
  perHitDamage,
  powerIndex,
  typesInWeather,
  type Combatant,
  type FieldState,
} from '../utils/damage'
import { calcStats } from '../utils/stats'
import type { GameData, StatTable, Status } from '../utils/types'

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
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
  abilityOn?: boolean // 애널라이즈(나중 행동) / 잠복(대상 교체 등장)
  alliesFainted?: number
  gender?: 'M' | 'F' | 'N'
}
type Case = {
  name: string
  atk: Side
  def: Side
  move: string
  field?: FieldState
  crit?: boolean
  spread?: boolean
  helpingHand?: boolean
  metronome?: number
}

const STAT_NAME = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' } as const
const toEvs = (sp: Partial<StatTable> = {}) =>
  Object.fromEntries(
    Object.entries(sp).map(([k, v]) => [STAT_NAME[k as keyof StatTable], v ? 8 * v - 4 : 0]),
  )
const SD_STATUS: Record<string, string> = {
  brn: 'brn',
  par: 'par',
  psn: 'psn',
  tox: 'tox',
  slp: 'slp',
  frz: 'frz',
}

const mkOurs = (s: Side): Combatant => {
  const species = data.pokemon[s.species]
  if (!species) throw new Error('no species ' + s.species)
  const stats = calcStats(species.stats, s.sp || {}, data.natures[s.nature || 'serious'])
  return {
    species,
    stats,
    ability: s.ability || species.abilities[0] || '',
    item: s.item || '',
    status: s.status || '',
    boosts: s.boosts,
    hp: s.hpPercent ? Math.floor((stats.hp * s.hpPercent) / 100) : undefined,
    gender: s.gender,
  }
}
function ours(c: Case) {
  const move = data.moves[c.move]
  if (!move) throw new Error('no move ' + c.move)
  const opts = {
    crit: c.crit,
    spread: c.spread,
    helpingHand: c.helpingHand,
    movesLast: c.atk.abilityOn,
    targetSwitchedIn: c.atk.abilityOn,
    faintedAllies: c.atk.alliesFainted,
    metronomeCount: c.metronome,
  }
  return {
    r: calcDamage(move, mkOurs(c.atk), mkOurs(c.def), data.types.chart, c.field || {}, opts),
    move,
  }
}

function smogonResult(c: Case, power: number) {
  const mk = (s: Side) => {
    const species = data.pokemon[s.species]
    // id 가 아니라 정식 이름(Tauros-Paldea-Combat 등)을 넘겨야 폼 판정이 맞다
    const p = new SPokemon(gen, gen.species.get(s.species as never)?.name ?? s.species, {
      level: 50,
      nature: (s.nature || 'serious').replace(/^./, (x) => x.toUpperCase()),
      evs: toEvs(s.sp),
      // @smogon/calc 은 id 가 아니라 표시 이름("Huge Power", "Life Orb")을 받는다
      ability: gen.abilities.get((s.ability || species?.abilities[0]) as never)?.name as never,
      item: (s.item ? gen.items.get(s.item as never)?.name : undefined) as never,
      status: (SD_STATUS[s.status || ''] || '') as never,
      boosts: s.boosts,
      abilityOn: s.abilityOn,
      alliesFainted: s.alliesFainted,
      gender: s.gender,
    })
    if (s.hpPercent) p.originalCurHP = Math.floor((p.maxHP() * s.hpPercent) / 100)
    return p
  }
  const f = c.field || {}
  const weather = (
    {
      sun: 'Sun',
      rain: 'Rain',
      sand: 'Sand',
      snow: 'Snow',
      harshsun: 'Harsh Sunshine',
      heavyrain: 'Heavy Rain',
      strongwinds: 'Strong Winds',
    } as Record<string, string>
  )[f.weather || ''] as never
  const terrain = (
    { electric: 'Electric', grassy: 'Grassy', misty: 'Misty', psychic: 'Psychic' } as Record<
      string,
      string
    >
  )[f.terrain || ''] as never
  const field = new Field({
    gameType: c.spread || f.doubles ? 'Doubles' : 'Singles',
    weather,
    terrain,
    isWonderRoom: !!f.wonderRoom,
    isGravity: !!f.gravity,
    isMagicRoom: !!f.magicRoom,
    attackerSide: { isHelpingHand: !!c.helpingHand },
    defenderSide: {
      isReflect: !!f.reflect,
      isLightScreen: !!f.lightScreen,
      isAuroraVeil: !!f.auroraVeil,
      isFriendGuard: !!f.friendGuard,
    },
  })
  const move = new SMove(gen, c.move, {
    isCrit: !!c.crit,
    timesUsedWithMetronome: c.metronome,
    overrides: { basePower: power },
  })
  return calculate(gen, mk(c.atk), mk(c.def), move, field)
}
function smogon(c: Case, power: number) {
  const d = smogonResult(c, power).damage
  return Array.isArray(d) ? (d as number[]) : Array(16).fill(d as number)
}

const MAX = 32
const cases: Case[] = [
  {
    name: '자속 효과굉장',
    atk: { species: 'garchomp', sp: { atk: MAX }, nature: 'jolly' },
    def: { species: 'tyranitar', sp: { hp: MAX } },
    move: 'earthquake',
  },
  {
    name: '멀티스케일 만피',
    atk: { species: 'weavile', sp: { atk: MAX }, nature: 'jolly' },
    def: { species: 'dragonite', sp: { hp: MAX }, ability: 'multiscale' },
    move: 'iceshard',
  },
  {
    name: '쾌청 불꽃 4배',
    atk: { species: 'charizard', sp: { spa: MAX }, nature: 'modest' },
    def: { species: 'scizor' },
    move: 'fireblast',
    field: { weather: 'sun' },
  },
  {
    name: '천하장사',
    atk: { species: 'azumarill', sp: { atk: MAX }, nature: 'adamant', ability: 'hugepower' },
    def: { species: 'garchomp', sp: { hp: MAX, def: 10 } },
    move: 'aquajet',
  },
  {
    name: '급소',
    atk: { species: 'kingambit', sp: { atk: MAX }, nature: 'adamant' },
    def: { species: 'gholdengo', sp: { hp: MAX } },
    move: 'kowtowcleave',
    crit: true,
  },
  {
    name: '근성 화상 객기',
    atk: { species: 'conkeldurr', sp: { atk: MAX }, ability: 'guts', status: 'brn' },
    def: { species: 'gyarados' },
    move: 'facade',
  },
  {
    name: '화상 물리 반감',
    atk: { species: 'garchomp', sp: { atk: MAX }, status: 'brn' },
    def: { species: 'gholdengo' },
    move: 'earthquake',
  },
  {
    name: '생명의구슬',
    atk: { species: 'gengar', sp: { spa: MAX }, nature: 'timid', item: 'lifeorb' },
    def: { species: 'alakazam', sp: { hp: 20 } },
    move: 'shadowball',
  },
  {
    name: '달인의띠',
    atk: { species: 'hydreigon', sp: { spa: MAX }, item: 'expertbelt' },
    def: { species: 'gardevoir' },
    move: 'flashcannon',
  },
  {
    name: '반감열매',
    atk: { species: 'volcarona', sp: { spa: MAX } },
    def: { species: 'scizor', item: 'occaberry' },
    move: 'heatwave',
  },
  {
    name: '리플렉터',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'metagross', sp: { hp: MAX } },
    move: 'earthquake',
    field: { reflect: true },
  },
  {
    name: '랭크 +2 / -1',
    atk: { species: 'dragonite', sp: { atk: MAX }, boosts: { atk: 2 } },
    def: { species: 'corviknight', boosts: { def: -1 } },
    move: 'extremespeed',
  },
  {
    name: '테크니션',
    atk: { species: 'scizor', sp: { atk: MAX }, ability: 'technician' },
    def: { species: 'tyranitar' },
    move: 'bulletpunch',
  },
  {
    name: '두꺼운지방',
    atk: { species: 'weavile', sp: { atk: MAX } },
    def: { species: 'snorlax', ability: 'thickfat' },
    move: 'iciclecrash',
  },
  {
    name: '부유 무효',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'rotomwash', ability: 'levitate' },
    move: 'earthquake',
  },
  {
    name: '일렉트릭필드',
    atk: { species: 'raichu', sp: { spa: MAX } },
    def: { species: 'gyarados' },
    move: 'thunderbolt',
    field: { terrain: 'electric' },
  },
  {
    name: '미스트필드 드래곤',
    atk: { species: 'dragapult', sp: { spa: MAX } },
    def: { species: 'garchomp' },
    move: 'dracometeor',
    field: { terrain: 'misty' },
  },
  {
    name: '비 물',
    atk: { species: 'pelipper', sp: { spa: MAX } },
    def: { species: 'incineroar' },
    move: 'hurricane',
    field: { weather: 'rain' },
  },
  {
    name: '쾌청 물 반감',
    atk: { species: 'primarina', sp: { spa: MAX } },
    def: { species: 'incineroar' },
    move: 'hydropump',
    field: { weather: 'sun' },
  },
  {
    name: '설경 얼음 방어',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'baxcalibur' },
    move: 'earthquake',
    field: { weather: 'snow' },
  },
  {
    name: '모래 바위 특방',
    atk: { species: 'primarina', sp: { spa: MAX } },
    def: { species: 'tyranitar' },
    move: 'moonblast',
    field: { weather: 'sand' },
  },
  {
    name: '광역 0.75',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'incineroar', sp: { hp: MAX } },
    move: 'earthquake',
    spread: true,
  },
  {
    name: '단단한발톱 접촉',
    atk: { species: 'barbaracle', sp: { atk: MAX }, ability: 'toughclaws' },
    def: { species: 'garchomp' },
    move: 'crosschop',
  },
  {
    name: '예리함 베기',
    atk: { species: 'gallade', sp: { atk: MAX }, ability: 'sharpness' },
    def: { species: 'kingambit' },
    move: 'sacredsword',
  },
  // ── 위력·공격 보정 특성 (실제 보유 포켓몬으로) ─────
  {
    name: '단단한발톱: 비접촉기는 그대로',
    atk: { species: 'barbaracle', sp: { atk: MAX }, ability: 'toughclaws' },
    def: { species: 'garchomp' },
    move: 'stoneedge',
  },
  {
    name: '예리함: 베기 아닌 기술은 그대로',
    atk: { species: 'gallade', sp: { atk: MAX }, ability: 'sharpness' },
    def: { species: 'kingambit' },
    move: 'closecombat',
  },
  {
    name: '철주먹 펀치',
    atk: { species: 'conkeldurr', sp: { atk: MAX }, ability: 'ironfist' },
    def: { species: 'kingambit' },
    move: 'machpunch',
  },
  {
    name: '옹골찬턱 물기',
    atk: { species: 'tyrantrum', sp: { atk: MAX }, ability: 'strongjaw' },
    def: { species: 'gholdengo' },
    move: 'crunch',
  },
  {
    name: '메가런처 파동',
    atk: { species: 'clawitzer', sp: { spa: MAX }, ability: 'megalauncher' },
    def: { species: 'gholdengo' },
    move: 'darkpulse',
  },
  {
    name: '펑크록 소리 (공격)',
    atk: { species: 'toxtricity', sp: { spa: MAX }, ability: 'punkrock' },
    def: { species: 'garchomp' },
    move: 'boomburst',
  },
  {
    name: '펑크록 소리 (방어 0.5)',
    atk: { species: 'garchomp', sp: { spa: MAX } },
    def: { species: 'toxtricity', ability: 'punkrock' },
    move: 'hypervoice',
  },
  {
    name: '이판사판 반동기',
    atk: { species: 'staraptor', sp: { atk: MAX }, ability: 'reckless' },
    def: { species: 'scizor' },
    move: 'bravebird',
  },
  {
    name: '우격다짐 부가효과 기술',
    atk: { species: 'feraligatr', sp: { atk: MAX }, ability: 'sheerforce' },
    def: { species: 'garchomp' },
    move: 'icepunch',
  },
  {
    name: '의욕 물리 1.5',
    atk: { species: 'flapple', sp: { atk: MAX }, ability: 'hustle' },
    def: { species: 'garchomp' },
    move: 'dragonclaw',
  },
  {
    name: '순수한힘 2배',
    atk: { species: 'medicham', sp: { atk: MAX }, ability: 'purepower' },
    def: { species: 'garchomp' },
    move: 'zenheadbutt',
  },
  {
    name: '모래의힘 (모래바람 땅 1.3)',
    atk: { species: 'excadrill', sp: { atk: MAX }, ability: 'sandforce' },
    def: { species: 'gholdengo' },
    move: 'earthquake',
    field: { weather: 'sand' },
  },
  {
    name: '선파워 (쾌청 특공 1.5)',
    atk: { species: 'charizard', sp: { spa: MAX }, ability: 'solarpower' },
    def: { species: 'garchomp' },
    move: 'flamethrower',
    field: { weather: 'sun' },
  },
  {
    name: '수포 물 2배',
    atk: { species: 'araquanid', sp: { atk: MAX }, ability: 'waterbubble' },
    def: { species: 'garchomp' },
    move: 'liquidation',
  },
  {
    name: '맹화 (HP 1/3 이하)',
    atk: { species: 'charizard', sp: { spa: MAX }, ability: 'blaze', hpPercent: 30 },
    def: { species: 'scizor' },
    move: 'flamethrower',
  },
  {
    name: '심록 (HP 1/3 이하)',
    atk: { species: 'venusaur', sp: { spa: MAX }, ability: 'overgrow', hpPercent: 30 },
    def: { species: 'garchomp' },
    move: 'gigadrain',
  },
  {
    name: '급류 (HP 1/3 이하)',
    atk: { species: 'blastoise', sp: { spa: MAX }, ability: 'torrent', hpPercent: 30 },
    def: { species: 'garchomp' },
    move: 'surf',
  },
  {
    name: '벌레의알림 (HP 1/3 이하)',
    atk: { species: 'beedrill', sp: { atk: MAX }, ability: 'swarm', hpPercent: 30 },
    def: { species: 'gholdengo' },
    move: 'xscissor',
  },
  {
    name: '맹화 (HP 1/3 초과면 그대로)',
    atk: { species: 'charizard', sp: { spa: MAX }, ability: 'blaze', hpPercent: 50 },
    def: { species: 'scizor' },
    move: 'flamethrower',
  },
  {
    name: '사이코쇼크 방어 참조',
    atk: { species: 'alakazam', sp: { spa: MAX } },
    def: { species: 'conkeldurr', sp: { def: MAX } },
    move: 'psyshock',
  },
  {
    name: '바디프레스',
    atk: { species: 'corviknight', sp: { def: MAX } },
    def: { species: 'tyranitar' },
    move: 'bodypress',
  },
  {
    name: '속임수',
    atk: { species: 'sableye' },
    def: { species: 'garchomp', sp: { atk: MAX }, boosts: { atk: 1 } },
    move: 'foulplay',
  },
  {
    name: '탁쳐서떨구기 도구',
    atk: { species: 'kingambit', sp: { atk: MAX } },
    def: { species: 'gardevoir', item: 'leftovers' },
    move: 'knockoff',
  },
  {
    name: '털가죽',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'persianalola', ability: 'furcoat' },
    move: 'earthquake',
  },
  {
    name: '필터 효과굉장',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'aggron', ability: 'filter' },
    move: 'earthquake',
  },
  {
    name: '색안경',
    atk: { species: 'volcarona', sp: { spa: MAX }, ability: 'tintedlens' },
    def: { species: 'tyranitar' },
    move: 'bugbuzz',
  },
  {
    name: '헤비봄버',
    atk: { species: 'aggron', sp: { atk: MAX } },
    def: { species: 'gardevoir' },
    move: 'heavyslam',
  },
  {
    name: '분화 체력 50%',
    atk: { species: 'typhlosion', sp: { spa: MAX }, hpPercent: 50 },
    def: { species: 'garchomp' },
    move: 'eruption',
  },
  {
    name: '복슬복슬 접촉',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'bewear', ability: 'fluffy' },
    move: 'outrage',
  },
  {
    name: '페어리스킨',
    atk: { species: 'sylveon', sp: { spa: MAX }, ability: 'pixilate' },
    def: { species: 'garchomp' },
    move: 'hypervoice',
  },
  {
    name: '적응력',
    atk: { species: 'lucario', sp: { spa: MAX }, ability: 'adaptability' },
    def: { species: 'tyranitar' },
    move: 'aurasphere',
  },
  {
    name: '스나이퍼 급소',
    atk: { species: 'inteleon', sp: { spa: MAX }, ability: 'sniper' },
    def: { species: 'garchomp' },
    move: 'hydropump',
    crit: true,
  },
  {
    name: '빛의장막 더블',
    atk: { species: 'gengar', sp: { spa: MAX } },
    def: { species: 'gardevoir' },
    move: 'shadowball',
    field: { lightScreen: true, doubles: true },
  },
  {
    name: '틀깨기 멀티스케일 무시',
    atk: { species: 'excadrill', sp: { atk: MAX }, ability: 'moldbreaker' },
    def: { species: 'dragonite', ability: 'multiscale' },
    move: 'rockslide',
  },
  {
    name: '틀깨기 부유 무시',
    atk: { species: 'excadrill', sp: { atk: MAX }, ability: 'moldbreaker' },
    def: { species: 'rotomwash', ability: 'levitate' },
    move: 'earthquake',
  },
  {
    name: '헤비메탈 헤비봄버',
    atk: { species: 'aggron', sp: { atk: MAX }, ability: 'heavymetal' },
    def: { species: 'gardevoir' },
    move: 'heavyslam',
  },
  {
    name: '라이트메탈 대상 로킥',
    atk: { species: 'conkeldurr', sp: { atk: MAX } },
    def: { species: 'scizor', ability: 'lightmetal' },
    move: 'lowkick',
  },
  {
    name: '강철정신',
    atk: { species: 'perrserker', sp: { atk: MAX }, ability: 'steelyspirit' },
    def: { species: 'gardevoir' },
    move: 'ironhead',
  },
  {
    name: '페어리오라',
    atk: { species: 'sylveon', sp: { spa: MAX }, ability: 'fairyaura' },
    def: { species: 'garchomp' },
    move: 'moonblast',
  },
  {
    name: '건조피부 불꽃',
    atk: { species: 'gengar', sp: { spa: MAX } },
    def: { species: 'toxicroak', ability: 'dryskin' },
    move: 'fireblast',
  },
  {
    name: '전투무장 급소 무효',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'perrserker', ability: 'battlearmor' },
    move: 'earthquake',
    crit: true,
  },
  {
    name: '도우미',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'metagross' },
    move: 'dragonclaw',
    helpingHand: true,
    field: { doubles: true },
  },
  {
    name: '애널라이즈 나중 행동',
    atk: { species: 'rotomwash', sp: { spa: MAX }, ability: 'analytic', abilityOn: true },
    def: { species: 'gyarados' },
    move: 'thunderbolt',
  },
  {
    name: '총대장 2마리',
    atk: { species: 'kingambit', sp: { atk: MAX }, ability: 'supremeoverlord', alliesFainted: 2 },
    def: { species: 'gardevoir' },
    move: 'kowtowcleave',
  },
  {
    name: '잠복 교체 등장',
    atk: { species: 'garchomp', sp: { atk: MAX }, ability: 'stakeout', abilityOn: true },
    def: { species: 'gardevoir' },
    move: 'dragonclaw',
  },
  {
    name: '무도한행동 독 상대 급소',
    atk: { species: 'toxapex', ability: 'merciless' },
    def: { species: 'garchomp', status: 'psn' },
    move: 'liquidation',
  },
  {
    name: '메트로놈 3번째',
    atk: { species: 'garchomp', sp: { atk: MAX }, item: 'metronome' },
    def: { species: 'metagross' },
    move: 'outrage',
    metronome: 2,
  },
  {
    name: '프렌드가드',
    atk: { species: 'gengar', sp: { spa: MAX } },
    def: { species: 'gardevoir' },
    move: 'shadowball',
    field: { friendGuard: true, doubles: true },
  },
  {
    name: '메가가디안 페어리스킨 하이퍼보이스',
    atk: { species: 'gardevoirmega', sp: { spa: MAX }, nature: 'modest' },
    def: { species: 'garchomp', sp: { hp: MAX } },
    move: 'hypervoice',
  },
  {
    name: '메가보만다 스카이스킨 이판사판태클',
    atk: { species: 'salamencemega', sp: { atk: MAX } },
    def: { species: 'conkeldurr' },
    move: 'doubleedge',
  },
  {
    name: '원더룸 물리 (특방 실능치로 받음)',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'snorlax', sp: { hp: MAX } },
    move: 'earthquake',
    field: { wonderRoom: true },
  },
  {
    name: '매직룸 구애머리띠 무효',
    atk: { species: 'garchomp', sp: { atk: MAX }, item: 'choiceband' },
    def: { species: 'metagross' },
    move: 'earthquake',
    field: { magicRoom: true },
  },
  {
    name: '셸암즈 물리 선택 (상대 방어가 낮음)',
    atk: { species: 'slowbrogalar', sp: { atk: MAX, spa: MAX } },
    def: { species: 'snorlax' },
    move: 'shellsidearm',
  },
  {
    name: 'DD래리어트: 대상 방어 랭크 무시',
    atk: { species: 'incineroar', sp: { atk: MAX } },
    def: { species: 'gardevoir', boosts: { def: 2 } },
    move: 'darkestlariat',
  },
  {
    name: '성스러운칼: 대상 방어 랭크 무시',
    atk: { species: 'gallade', sp: { atk: MAX } },
    def: { species: 'kingambit', boosts: { def: 2 } },
    move: 'sacredsword',
  },
  {
    name: '플라잉프레스: 격투+비행 (풀 상대 2배)',
    atk: { species: 'hawlucha', sp: { atk: MAX } },
    def: { species: 'venusaur' },
    move: 'flyingpress',
  },
  {
    name: '플라잉프레스: 격투+비행 (바위 상대 1배)',
    atk: { species: 'hawlucha', sp: { atk: MAX } },
    def: { species: 'tyranitar' },
    move: 'flyingpress',
  },
  {
    name: '얼음숨결: 항상 급소',
    atk: { species: 'glalie', sp: { spa: MAX } },
    def: { species: 'garchomp' },
    move: 'frostbreath',
  },
  {
    name: '업어후리기: 항상 급소',
    atk: { species: 'conkeldurr', sp: { atk: MAX } },
    def: { species: 'tyranitar' },
    move: 'stormthrow',
  },
  {
    name: '하드프레스: 대상 HP 50%',
    atk: { species: 'archaludon', sp: { atk: MAX } },
    def: { species: 'gardevoir', hpPercent: 50 },
    move: 'hardpress',
  },
  {
    name: '와이드포스: 사이코필드',
    atk: { species: 'gardevoir', sp: { spa: MAX } },
    def: { species: 'conkeldurr' },
    move: 'expandingforce',
    field: { terrain: 'psychic' },
  },
  {
    name: '미스트버스트: 미스트필드',
    atk: { species: 'gardevoir', sp: { spa: MAX } },
    def: { species: 'garchomp' },
    move: 'mistyexplosion',
    field: { terrain: 'misty' },
  },
  {
    name: '라이징볼트: 일렉트릭필드 + 땅에 있는 대상',
    atk: { species: 'raichu', sp: { spa: MAX } },
    def: { species: 'gyarados' },
    move: 'risingvoltage',
    field: { terrain: 'electric' },
  },
  {
    name: 'G의힘: 중력',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'gyarados' },
    move: 'gravapple',
    field: { gravity: true },
  },
  {
    name: '솔라빔: 비에서 절반',
    atk: { species: 'venusaur', sp: { spa: MAX } },
    def: { species: 'gyarados' },
    move: 'solarbeam',
    field: { weather: 'rain' },
  },
  {
    name: '독침천발: 독 상대 2배',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'gardevoir', status: 'psn' },
    move: 'barbbarrage',
  },
  {
    name: '백귀야행: 상태이상 상대 2배',
    atk: { species: 'gengar', sp: { spa: MAX } },
    def: { species: 'gardevoir', status: 'brn' },
    move: 'infernalparade',
  },
  {
    name: '목숨걸기: 내 남은 HP',
    atk: { species: 'garchomp', hpPercent: 60 },
    def: { species: 'gardevoir' },
    move: 'finalgambit',
  },
  {
    name: '깨뜨리다: 리플렉터 무시',
    atk: { species: 'conkeldurr', sp: { atk: MAX } },
    def: { species: 'tyranitar' },
    move: 'brickbreak',
    field: { reflect: true },
  },
  {
    name: '사이코팽: 리플렉터 무시',
    atk: { species: 'garchomp', sp: { atk: MAX } },
    def: { species: 'conkeldurr' },
    move: 'psychicfangs',
    field: { reflect: true },
  },
  {
    name: '레이징불: 켄타로스 컴뱃종 격투 + 리플렉터 무시',
    atk: { species: 'taurospaldeacombat', sp: { atk: MAX } },
    def: { species: 'tyranitar' },
    move: 'ragingbull',
    field: { reflect: true },
  },
  {
    name: '셸암즈 특수 선택 (상대 방어가 높음)',
    atk: { species: 'slowbrogalar', sp: { atk: MAX, spa: MAX } },
    def: { species: 'aggron' },
    move: 'shellsidearm',
  },
]

// 라이벌의식: 같은 성별 1.25배 / 다른 성별 0.75배 / 무성이면 그대로
for (const [name, a, d] of [
  ['같은 성별', 'M', 'M'],
  ['다른 성별', 'M', 'F'],
  ['상대 무성', 'F', 'N'],
] as const)
  cases.push({
    name: `라이벌의식 ${name}`,
    atk: { species: 'luxray', sp: { atk: MAX }, nature: 'adamant', ability: 'rivalry', gender: a },
    def: { species: 'garchomp', sp: { hp: MAX }, gender: d },
    move: 'crunch',
  })

describe('calcDamage vs @smogon/calc (Gen 9, Lv50)', () => {
  for (const c of cases.filter((x) => data.pokemon[x.atk.species] && data.pokemon[x.def.species])) {
    it(c.name, () => {
      const { r, move } = ours(c)
      const expected = smogon(c, move.power)
      expect(r.rolls).toEqual(expected)
    })
  }
})

describe('부자유친 (메가캥카) vs @smogon/calc', () => {
  const c: Case = {
    name: 'pb',
    atk: { species: 'kangaskhanmega', sp: { atk: MAX }, nature: 'adamant' },
    def: { species: 'garchomp', sp: { hp: MAX } },
    move: 'doubleedge',
  }
  it('1타 + 2타(0.25배)', () => {
    const move = data.moves[c.move]!
    const atk = mkOurs(c.atk)
    const info = hitInfo(move, atk)
    expect(info).toMatchObject({ min: 2, max: 2, parentalBond: true })
    const per = perHitDamage(move, atk, mkOurs(c.def), data.types.chart, {}, {}, info)
    const d = smogonResult(c, move.power).damage as unknown as number[][]
    expect([per.min[0], per.max[0]]).toEqual([d[0]![0], d[0]![15]])
    expect([per.min[1], per.max[1]]).toEqual([d[1]![0], d[1]![15]])
  })
  it('광역으로 여러 대상을 맞히면 1타', () => {
    expect(hitInfo(data.moves.earthquake!, mkOurs(c.atk), true).max).toBe(1)
  })
})

describe('기술 타입 변경 (스킨류 / 노말스킨 / 촉촉보이스 / 웨더볼)', () => {
  const mv = (id: string) => data.moves[id]!
  it('스킨류는 노말 기술만 바꾼다', () => {
    expect(effectiveMoveType(mv('hypervoice'), 'pixilate')).toBe('fairy')
    expect(effectiveMoveType(mv('doubleedge'), 'aerilate')).toBe('flying')
    expect(effectiveMoveType(mv('bodyslam'), 'refrigerate')).toBe('ice')
    expect(effectiveMoveType(mv('bodyslam'), 'dragonize')).toBe('dragon')
    expect(effectiveMoveType(mv('moonblast'), 'pixilate')).toBe('fairy')
    expect(effectiveMoveType(mv('earthquake'), 'aerilate')).toBe('ground')
    expect(effectiveMoveType(mv('hypervoice'), '')).toBe('normal')
  })
  it('노말스킨·촉촉보이스·웨더볼', () => {
    expect(effectiveMoveType(mv('earthquake'), 'normalize')).toBe('normal')
    expect(effectiveMoveType(mv('hypervoice'), 'liquidvoice')).toBe('water')
    // 레이징불: 켄타로스 팔데아 폼별 타입 (폼을 안 넘기면 원래 타입)
    expect(effectiveMoveType(mv('ragingbull'), '')).toBe('normal')
    expect(effectiveMoveType(mv('ragingbull'), '', {}, data.pokemon.taurospaldeablaze)).toBe('fire')
    expect(effectiveMoveType(mv('weatherball'), '', { weather: 'sun' })).toBe('fire')
    expect(effectiveMoveType(mv('weatherball'), 'cloudnine', { weather: 'sun' })).toBe('normal')
  })
  it('챔피언스 드래곤스킨(메가장크로다일): 드래곤 타입 + 1.2배 + 자속', () => {
    const atk = mkOurs({ species: 'feraligatrmega', sp: { atk: MAX } })
    const def = mkOurs({ species: 'gardevoir' })
    const plain = calcDamage(
      mv('doubleedge'),
      { ...atk, ability: '' },
      mkOurs({ species: 'snorlax' }),
      data.types.chart,
    )
    const skin = calcDamage(mv('doubleedge'), atk, mkOurs({ species: 'snorlax' }), data.types.chart)
    expect(atk.ability).toBe('dragonize')
    expect(skin.type).toBe('dragon')
    expect(skin.max).toBeGreaterThan(plain.max)
    expect(calcDamage(mv('doubleedge'), atk, def, data.types.chart).effectiveness).toBe(0) // 페어리에 드래곤 무효
  })
})

// @smogon/calc 는 원더룸 바디프레스에서 실능치를 두 번 바꿔 결과적으로 원래 방어를 쓰지만,
// Showdown 시뮬레이터(Pokemon.calculateStat)는 'def' 를 읽을 때 한 번만 바꿔 원래 특방 실능치 + 방어 랭크를 쓴다 → 시뮬레이터 기준
describe('원더룸 바디프레스 (Showdown 시뮬레이터 기준)', () => {
  it('특방 실능치와 방어 랭크로 공격', () => {
    const move = data.moves.bodypress!
    const atk = {
      ...mkOurs({ species: 'corviknight', sp: { def: MAX } }),
      boosts: { def: 1, spd: -1 },
    }
    const def = mkOurs({ species: 'tyranitar' })
    const inRoom = calcDamage(move, atk, def, data.types.chart, { wonderRoom: true })
    // 원더룸 없이 양쪽의 방어 자리에 특방 실능치를 넣은 것과 같아야 함 (랭크는 방어 +1 그대로).
    // 맞는 쪽도 물리기를 특방 실능치로 받는다
    const swap = (c: Combatant) => ({
      ...c,
      stats: { ...c.stats, def: c.stats.spd, spd: c.stats.def },
    })
    expect(inRoom.rolls).toEqual(calcDamage(move, swap(atk), swap(def), data.types.chart).rolls)
  })
})

describe('배틀 상황에 따라 위력이 바뀌는 기술 (Showdown 계산식)', () => {
  const move = (id: string) => data.moves[id]!
  const atk = () => mkOurs({ species: 'kingambit', sp: { atk: MAX } })
  const def = () => mkOurs({ species: 'gardevoir' })
  const power = (id: string, opts = {}) =>
    calcDamage(move(id), atk(), def(), data.types.chart, {}, opts).power
  it('성묘: 50 + 50×쓰러진 같은 편', () => {
    expect(power('lastrespects', { faintedAllies: 0 })).toBe(50)
    expect(power('lastrespects', { faintedAllies: 3 })).toBe(200)
  })
  it('분노의주먹: 50 + 50×맞은 횟수, 최대 350', () => {
    expect(power('ragefist', { timesHit: 2 })).toBe(150)
    expect(power('ragefist', { timesHit: 9 })).toBe(350)
  })
  it('보복: 대상이 먼저 행동했으면 2배 (교체로 나온 대상은 제외)', () => {
    expect(power('payback')).toBe(50)
    expect(power('payback', { movesLast: true })).toBe(100)
    expect(power('payback', { movesLast: true, targetSwitchedIn: true })).toBe(50)
  })
  it('눈사태: 이번 턴 대상에게 먼저 맞았으면 2배', () => {
    expect(power('avalanche')).toBe(60)
    expect(power('avalanche', { damagedByTarget: true })).toBe(120)
  })
  it('죽기살기: 대상 HP − 내 HP', () => {
    const a = { ...atk(), hp: 50 }
    const d = { ...def(), hp: 120 }
    expect(calcDamage(move('endeavor'), a, d, data.types.chart).max).toBe(70)
    expect(calcDamage(move('endeavor'), { ...a, hp: 200 }, d, data.types.chart).max).toBe(0)
  })
})

describe('배틀 폼: 캐스퐁(날씨예보) / 모르페코(오라휠)', () => {
  const mon = (species: string, ability: string): Combatant => {
    const p = data.pokemon[species]!
    return { species: p, stats: calcStats(p.stats, {}), ability, item: '' }
  }
  const chart = data.types.chart
  it('캐스퐁은 날씨에 따라 타입이 바뀐다 (쾌청 불꽃 / 비 물 / 설경 얼음)', () => {
    const cast = mon('castform', 'forecast')
    const atk = mon('garchomp', 'roughskin')
    const surf = data.moves.surf!
    expect(calcDamage(surf, atk, cast, chart, {}).effectiveness).toBe(1)
    expect(calcDamage(surf, atk, cast, chart, { weather: 'sun' }).effectiveness).toBe(2)
    expect(calcDamage(surf, atk, cast, chart, { weather: 'rain' }).effectiveness).toBe(0.5)
    // 구름제거/에어록이면 날씨가 없는 것과 같음 → 노말
    expect(
      calcDamage(surf, { ...atk, ability: 'airlock' }, cast, chart, { weather: 'sun' })
        .effectiveness,
    ).toBe(1)
    // 쾌청 웨더볼: 불꽃 + 자속
    const wb = data.moves.weatherball!
    const sunny = calcDamage(wb, cast, atk, chart, { weather: 'sun' })
    expect(sunny.type).toBe('fire')
    expect(powerIndex(wb, cast, { weather: 'sun' })).toBeGreaterThan(
      powerIndex(wb, { ...cast, ability: '' }, { weather: 'sun' })!,
    )
    expect(typesInWeather(cast.species, 'forecast', 'snow')).toEqual(['ice'])
  })
  it('오라휠: 배부른모양 전기 / 배고픈모양 악', () => {
    const aura = data.moves.aurawheel!
    expect(effectiveMoveType(aura, 'hungerswitch', {}, data.pokemon.morpeko)).toBe('electric')
    expect(effectiveMoveType(aura, 'hungerswitch', {}, data.pokemon.morpekohangry)).toBe('dark')
  })
})

describe('챔피언스 신규 특성 (@smogon/calc 에 없음 → 같은 효과의 검증된 계산과 비교)', () => {
  const mon = (species: string, ability: string, hpPct = 100): Combatant => {
    const p = data.pokemon[species]!
    const stats = calcStats(p.stats, { spa: 32 })
    return { species: p, stats, ability, item: '', hp: Math.floor((stats.hp * hpPct) / 100) }
  }
  const chart = data.types.chart
  const def = mon('garchomp', 'roughskin')
  it('불꽃의갈기 = 불꽃 기술 공격 1.5배 (맹화 발동과 같은 보정), 다른 타입은 그대로', () => {
    const fire = data.moves.flamethrower!
    const mane = calcDamage(fire, mon('pyroarmega', 'firemane'), def, chart)
    const blaze = calcDamage(fire, mon('pyroarmega', 'blaze', 30), def, chart)
    expect(mane.rolls).toEqual(blaze.rolls)
    const hv = data.moves.hypervoice!
    expect(calcDamage(hv, mon('pyroarmega', 'firemane'), def, chart).rolls).toEqual(
      calcDamage(hv, mon('pyroarmega', ''), def, chart).rolls,
    )
  })
  it('메가솔라 = 자신만 쾌청 판정 (불꽃 1.5배, 물은 약해지지 않음)', () => {
    const fire = data.moves.flamethrower!
    const sol = calcDamage(fire, mon('meganiummega', 'megasol'), def, chart)
    const sun = calcDamage(fire, mon('meganiummega', ''), def, chart, { weather: 'sun' })
    expect(sol.rolls).toEqual(sun.rolls)
    const surf = data.moves.surf!
    expect(calcDamage(surf, mon('meganiummega', 'megasol'), def, chart).rolls).toEqual(
      calcDamage(surf, mon('meganiummega', ''), def, chart).rolls,
    )
  })
})

describe('결정력 (powerIndex) 랭크', () => {
  it('공격 +2 = 2배, −1 = 2/3배 (랭크 → 실능치 보정 순)', () => {
    const p = data.pokemon.garchomp!
    const base: Combatant = {
      species: p,
      stats: calcStats(p.stats, { atk: 32 }),
      ability: '',
      item: '',
    }
    const eq = data.moves.earthquake!
    const v0 = powerIndex(eq, base)!
    expect(powerIndex(eq, { ...base, boosts: { atk: 2 } })).toBe(v0 * 2)
    expect(Math.abs(powerIndex(eq, { ...base, boosts: { atk: -1 } })! - (v0 * 2) / 3)).toBeLessThan(
      150,
    )
    // 특수기는 공격 랭크와 무관
    const dp = data.moves.dragonpulse!
    expect(powerIndex(dp, { ...base, boosts: { atk: 6 } })).toBe(powerIndex(dp, base))
  })
})
