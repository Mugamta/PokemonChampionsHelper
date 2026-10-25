// composables/useBattle.ts
// 배틀 진행 상태 (싱글: 필드에 1마리씩 / 더블: 2마리씩). 기존 singleBattle.vue 의 로직을 영어 키로 옮기고
// 필드 마릿수(N)를 일반화했다. 상태 전체를 useState 에 두어서 다른 화면을 다녀와도 유지된다.
//
//  - 내 포켓몬 HP 는 실제 수치, 상대 HP 는 % (상대 실능치는 추정이므로)
//  - 상태이상/랭크/특수 상태는 포켓몬별로 관리 (교체 시 랭크·특수상태 초기화, 상태이상 유지)
//  - "이번 턴 적용" = 교체 → 메가진화 → 기술(실제 행동 순서대로: 우선도 → 스피드, 트릭룸이면 반대, 관찰한 선후공 우선.
//    효과 자동 반영 + 입력한 데미지) → 상태이상 발생 → 턴 종료 데미지 → 턴 경과
//  - 상대 추정: 선후공 관찰 → 스피드 구간(speedSp), 주고받은 데미지 → 맞은 시점 상태를 관측(obs)으로 저장
//    (계산은 composables/useOppEstimate.ts, utils/speedInference.ts, utils/statInference.ts)
//  - 직전 30턴까지 스냅샷으로 되돌리기
//  - 자동 반영: 위협(등장 시), 반감열매·풍선 소모(입력한 데미지가 있을 때), 기합의띠 소모(내 쪽 HP 1),
//    랭크 변화 반응(심술꾸러기/오기/승기/미러아머/하양허브), 맞았을 때 특성(지구력/깨어진갑옷/정의의마음 등), 자기과신, 가속
//  - 더블: 아군도 맞히는 광역기(지진 등)는 아군 피해를 따로 입력

import { useEntry, type BattleMode } from '~/composables/useEntry'
import { useTeamCalc, type ResolvedSlot } from '~/composables/useTeamCalc'
import { useOppEstimate, type OppBounds } from '~/composables/useOppEstimate'
import {
  confusionDamage,
  hasSecondary,
  hitInfo,
  isGrounded,
  isSpreadMove,
  RESIST_BERRIES,
  SCREEN_BREAKERS,
  type Combatant,
  type DamageOptions,
  type FieldState,
} from '~/utils/damage'
import {
  hpCorrection,
  hpOfPct,
  type HpCheck,
  type HpObservation,
  type HpStep,
} from '~/utils/hpDisplay'
import { critChance } from '~/utils/accuracy'
import { holdsOnAtFull, statusDamage } from '~/utils/ko'
import { applyBoost, clampBoost, effectiveSpeed, highestStat } from '~/utils/stats'
import {
  compareSpeed,
  fullRanges,
  narrowRanges,
  oppSpeedSpan,
  SPEED_BANDS,
  type SpeedEnv,
  type SpeedRanges,
} from '~/utils/speedInference'
import { drainLostRange, type Range } from '~/utils/statInference'
import type {
  BoostTable,
  MoveEffect,
  RankKey,
  StatTable,
  Status,
  Terrain,
  Weather,
} from '~/utils/types'

export type BattleSide = 'mine' | 'opp'

// 랭크 변화 효과의 체크 키 (행동 칸 "이번 턴 확률 효과"): 'boost:{target|self}:{능력}={변화},...' 예) 'boost:target:spd=-1'
export const boostKey = (target: 'target' | 'self', stats: Partial<Record<RankKey, number>>) =>
  `boost:${target}:` +
  Object.entries(stats)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
export const parseBoostKey = (key: string) => {
  const m = /^boost:(target|self):(.+)$/.exec(key)
  if (!m) return null
  const stats = m[2]!.split(',').map((p) => {
    const [k, v] = p.split('=')
    return [k as RankKey, Number(v)] as const
  })
  return { target: m[1] as 'target' | 'self', stats }
}

export interface MonState {
  hp: number // mine: 실제 HP / opp: %
  megaOn: boolean // 메가진화 상태로 계산 (사용 전 미리보기 포함)
  megaUsed: boolean // 실제로 메가진화함 → 되돌릴 수 없음
  alt: boolean // 배틀 폼 (팔라피 마이티폼 / 킬가르도 블레이드폼)
  itemGone: boolean // 도구를 잃음 (소모 / 탁쳐서떨구기 등) → 계산에서 도구 없음
  // (상대만) 도구 확정: 턴 끝 회복 메시지 등으로 본 도구 (item). 배틀 상태에만 저장하고 선출 화면 파티는 바꾸지 않는다.
  // 배틀 계산은 확정한 도구만 쓰고, 선출 화면의 도구는 추측(guessedItem)으로 범위 안내에만 쓴다
  itemKnown?: boolean
  item?: string
  // (상대만) 특성 확정: 등장 문구·특성 발동으로 본 특성. 확정 전에는 선출 화면의 특성(추측)으로 계산
  abilityKnown?: boolean
  ability?: string
  seedFrom?: number | null // 씨뿌리기를 심은 상대의 칸 (턴 끝 흡수를 받는 쪽)
  status: Status
  toxicTurn: number // 맹독 경과 턴 / 잠듦·얼음이면 행동하지 못한 턴 수
  restSleep?: boolean // 잠자기로 잠듦 (정확히 2턴 자고 3번째 턴에 깸)
  volatiles: Record<string, number> // 특수 상태 → 경과 턴 (1부터)
  boosts: BoostTable
  lastMove: string // 마지막으로 쓴 기술 (메트로놈 도구 연속 횟수용)
  moveStreak: number // lastMove 를 연속으로 쓴 횟수 − 1
  ppUsed?: Record<string, number> // 기술별 쓴 PP (쓴 순서대로, 교체해도 유지). 상대는 여기 있는 기술이 확정
  tfPpUsed?: Record<string, number> // 변신 중 복사한 기술의 쓴 PP (기술마다 최대 5, 변신이 풀리면 지움)
  movesSeen?: string[] // PP 를 쓰지 않고 드러난 기술 (상대가 잠꼬대로 낸 기술) — 확정
  enteredTurn: number // 필드에 나온 턴 (선두 = 0) — 가속은 나온 턴에는 발동 안 함
  // 변신(메타몽): 복사한 대상과 그때의 폼. 물러나면 풀린다
  transform: { side: BattleSide; idx: number; megaOn: boolean; alt: boolean } | null
  timesHit: number // 공격을 맞은 횟수 (분노의주먹). 교체해도 유지
  lastFailed: boolean // 지난 기술이 빗나감·실패 (분함의발구르기·열불내기)
  // 이번 턴 기록 (턴 시작 때 초기화): 맞음(승부굳히기) / 능력 하락(분풀이) / 받은 데미지 HP(카운터·미러코트·메탈버스트)
  turnDamaged: boolean
  turnLowered: boolean
  turnTaken: { physical: number; special: number; last: number }
  // (상대만) 추정용 기록
  obs: StatObservation[] // 주고받은 데미지 관측
  speedSp: SpeedRanges | null // 선후공으로 좁힌 스피드 구간별 SP 범위 (null = 관찰 없음)
  hpObs?: HpObservation[] // 턴 끝 HP 를 게임 화면 값으로 고친 관측 → HP 실능치
  hpCheck?: HpCheck | null // 지난 턴 끝 HP 계산 (이번 턴에 고치면 관측)
}

// 상대 배분 추정용 관측 (주고받은 데미지 1번). 맞은 시점의 상태를 담아 두고 추정할 때 다시 계산한다
export interface StatObservation {
  kind: 'dealt' | 'taken' // dealt: 내가 상대에게 → 상대 내구 / taken: 상대가 나에게 → 상대 공격
  move: string
  amount: number // dealt: % / taken: HP
  ko: boolean // 쓰러뜨림(쓰러짐) → "그만큼 이상"만 확인
  crit: boolean
  mine: {
    idx: number
    megaOn: boolean
    alt: boolean
    transform: MonState['transform']
    boosts: BoostTable
    status: Status
    hp: number
    itemGone: boolean
  }
  opp: {
    megaOn: boolean
    alt: boolean
    boosts: BoostTable
    status: Status
    hpPct: number
    itemGone: boolean
  }
  field: FieldState // 맞는 쪽 기준 필드
  opts: DamageOptions // 광역 / 도우미 / 행동 순서 등 그때의 공격 보정
  // 내 흡수기로 회복한 양에서 거꾸로 구한, 상대가 실제로 잃은 HP(실수치) 범위 (쓰러뜨렸으면 = 맞기 전 남은 HP)
  drainLost?: [number, number]
}

// 이번 턴 기술을 쓰는 순서 (turnOrder)
export interface TurnEntry {
  side: BattleSide
  slot: number
  idx: number
  move: string
}

export interface Counter {
  cur: number
  total: number
}

export interface SideState {
  mons: MonState[] // 로스터 순서 (mine: 선출 순서, opp: 상대 파티 6마리)
  active: (number | null)[] // 필드 칸 → 로스터 인덱스
  revealed: number[] // (opp) 등장이 확인된 포켓몬
  hazards: Record<string, number>
  screens: Record<string, Counter> // 리플렉터/빛의장막/오로라베일/순풍/신비의부적 등
  wishes?: Record<number, { turn: number; hp: number }> // 희망사항: 필드 칸 → 쓴 턴, 회복량(쓴 포켓몬 최대 HP 1/2, 실수치)
  healingWish?: number[] // 치유소원: 다음에 이 칸으로 나오는 포켓몬이 HP·상태이상 모두 회복
}

// 행동 불가 이유: 잠듦 / 얼음 / 마비(몸이 저림) / 풀죽음 / 혼란 자해 / 기타(반동 등)
export type CantReason = 'slp' | 'frz' | 'par' | 'flinch' | 'confusion' | 'other'
export const CANT_REASONS: CantReason[] = ['slp', 'frz', 'par', 'flinch', 'confusion', 'other']
// 행동 불가인데 HP 가 깎일 수 있는 이유 (혼란 자해 / 기타) → amount 에 잃은 HP 입력 (mine: 실수치, opp: %)
export const CANT_DAMAGE_REASONS = new Set<CantReason>(['confusion', 'other'])

export interface ActionState {
  // move: 기술 사용 / switch: 교체 / cant: 행동 불가 (잠듦·얼음 등으로 기술이 나가지 않음)
  kind: 'move' | 'switch' | 'cant'
  cantReason: CantReason
  move: string // 기술 id
  target: number // 상대 필드 칸
  switchTo: number | null
  useMega: boolean
  amount: number | null // mine: 입힌 데미지(%), opp: 받은 데미지(실수치). 행동 불가(혼란 자해·기타)면 자기가 잃은 HP (mine: 실수치, opp: %)
  allyAmount: number | null // 더블에서 아군도 맞히는 광역기의 아군 피해 (mine: 실수치, opp: %)
  crit: boolean // 입력한 데미지가 급소였음 (추정에 반영)
  missed: boolean // 빗나감·실패 (데미지 없음, 무릎차기류 반동, 다음 턴 분함의발구르기·열불내기 2배)
  amount2: number | null // 더블: 광역기가 맞힌 다른 상대 칸의 피해 (mine: %, opp: 실수치)
  selfSwitch: number | null // 공격 후 자기가 교체 (유턴·볼트체인지 등 / 상대 레드카드) → 나오는 로스터 인덱스
  foeSwitch: number | null // 공격 후 상대가 교체 (드래곤테일·울부짖기 등 / 탈출버튼·위기회피) → 나오는 로스터 인덱스
  // 이번 턴 확률로 생긴 효과 (체크, possibleInflicts 중에서): 맞은 상대(대상 / 광역기의 다른 칸)에게 상태이상·풀죽음·혼란
  inflicts?: string[]
  inflicts2?: string[]
  // 접촉해서 맞은 쪽 특성으로 공격한 쪽에게 생긴 효과 (정전기·불꽃몸·독가시·포자·헤롱헤롱바디, possibleContactInflicts 중에서)
  contactInflicts?: string[]
  // 내 흡수기: 흡수로 회복한 직후의 내 HP (실수치, 생명의구슬 등은 그 뒤). 입력하면 계산 대신 이 값 → 상대가 잃은 실수치 HP 를 알 수 있음
  drainAfter?: number | null
  via?: string // 잠꼬대·흉내내기로 기술을 불렀으면 부른 기술 (move = 실제로 나간 기술, PP 는 via 에서 줄어듦)
}

// 동시 등장(선두 / 쓰러진 뒤 교체 / 같은 턴 교체)에서 내 쪽 × 상대 쪽 짝: 둘 다 등장 문구가 나오는 특성일 때.
// 등장 직전 상태의 스피드로 발동 순서를 판정해 두고, 사용자가 본 순서를 입력하면 상대 스피드 구간을 좁힌다
export interface EntryPair {
  mi: number
  oi: number
  auto: 'mine' | 'opp' | 'tie' | null // 스피드로 정해진 먼저 발동하는 쪽 (null = 모름)
  tiePossible?: boolean // auto 가 정해졌어도 동속일 수 있음 (그러면 무작위)
  base: number // 상대 스피드 종족값 (그때의 폼)
  env: SpeedEnv // 그때의 상대 스피드 조건
  mySpeed: number
}
// 선두·쓰러진 뒤 교체로 함께 등장한 묶음. 다음 턴 적용 전까지 발동 순서를 고칠 수 있게 남겨 둔다
export interface EntryBatch {
  entrants: [BattleSide, number][]
  before: { weather: BattleState['weather']; terrain: BattleState['terrain'] } // 등장 직전 날씨·필드
  oppBefore: Record<number, SpeedRanges | null> // 등장 직전 상대 스피드 구간 (관찰을 바꾸면 여기서 다시 좁힘)
  tr: boolean // 트릭룸 (느린 쪽이 먼저 발동)
  pairs: EntryPair[]
}

export interface BattleState {
  signature: string
  turn: number
  weather: {
    key: Weather
    cur: number
    total: number
    permanent: boolean
    source: [BattleSide, number] | null
    by?: [BattleSide, number] | null // 깐 포켓몬 (모르면 null — 직접 켬·이전 저장분)
  }
  terrain: { key: Terrain; cur: number; total: number; by?: [BattleSide, number] | null }
  rooms: Record<string, Counter>
  fairyLock: number
  sides: Record<BattleSide, SideState>
  actions: Record<BattleSide, ActionState[]>
  observedOrder: 'unknown' | 'mine' | 'opp'
  lastUsedMove?: string // 이번 배틀에서 마지막으로 나간 기술 (흉내내기)
  entry?: EntryBatch | null // 고칠 수 있는 동시 등장 (선두 / 쓰러진 뒤 교체)
  entryObs?: Record<string, 'mine' | 'opp'> // 관찰한 등장 특성 발동 순서 (`${mi}:${oi}` → 먼저 발동한 쪽)
  focus: { mine: number; opp: number } // 분석 대상 필드 칸
  preview: number | null // 예상 데미지 표의 공격자 (내 로스터 인덱스)
  history: string[]
}

// 특수 상태 (지속 턴: null = 무한)
export const VOLATILE_GROUPS: { label: string; items: string[] }[] = [
  {
    label: 'groupMental',
    items: ['confusion', 'taunt', 'disable', 'encore', 'torment', 'attract', 'healblock'],
  },
  {
    label: 'groupOther',
    items: [
      'mustrecharge',
      'saltcure',
      'leechseed',
      'destinybond',
      'nightmare',
      'curse',
      'charge',
      'focusenergy',
      'stockpile',
      'yawn',
      'aquaring',
      'substitute',
      'perishsong',
      'magnetrise',
      'uproar',
    ],
  },
  { label: 'groupTrap', items: ['octolock', 'jawlock', 'ingrain', 'partiallytrapped'] },
]
export const VOLATILE_DURATION: Record<string, number | null> = {
  confusion: 4,
  mustrecharge: null, // 반동: 1 = 이번 턴에 씀, 2 = 다음 턴 행동 불가 (턴 끝 처리에서 따로 진행)
  truant: null, // 게으름: 반동과 같은 방식 (기술을 쓴 다음 턴 행동 불가)
  taunt: 3,
  disable: 4,
  encore: 3,
  torment: null,
  attract: null,
  healblock: 5,
  saltcure: null,
  destinybond: null, // 길동무: 다음에 기술을 쓸 때까지
  leechseed: null,
  nightmare: null,
  curse: null,
  charge: null,
  focusenergy: null, // 기충전: 물러날 때까지
  stockpile: null, // 비축: 값 = 횟수 (1~3)
  aquaring: null,
  yawn: null, // 하품(졸음): 1 = 이번 턴에 걸림, 2 = 이번 턴 끝에 잠듦 (턴 끝 처리에서 따로 진행, 교체하면 풀림)
  substitute: null, // 대타: 값 = 대타 HP (mine: 실수치, opp: 그 포켓몬 최대 HP 의 %)
  perishsong: null, // 멸망의노래: 값 = 남은 카운트 (턴 끝마다 1 줄고 0 이면 쓰러짐)
  magnetrise: 5,
  uproar: 3,
  octolock: null,
  jawlock: null,
  ingrain: null,
  partiallytrapped: 5,
}
export const STATUSES: Exclude<Status, ''>[] = ['psn', 'tox', 'brn', 'par', 'slp', 'frz']
export const ROOMS = ['trickroom', 'magicroom', 'wonderroom', 'gravity']
const SCREENS = new Set([
  'reflect',
  'lightscreen',
  'auroraveil',
  'safeguard',
  'mist',
  'tailwind',
  'luckychant',
])
const SCREEN_TURNS: Record<string, number> = { tailwind: 4 }
const HAZARD_MAX: Record<string, number> = {
  spikes: 3,
  toxicspikes: 2,
  stealthrock: 1,
  stickyweb: 1,
}

const WEATHER_ABILITY: Record<string, Weather> = {
  drought: 'sun',
  drizzle: 'rain',
  sandstream: 'sand',
  snowwarning: 'snow',
}
const PRIMAL_ABILITY: Record<string, Weather> = {
  deltastream: 'strongwinds',
  desolateland: 'harshsun',
  primordialsea: 'heavyrain',
}
const TERRAIN_ABILITY: Record<string, Terrain> = {
  electricsurge: 'electric',
  grassysurge: 'grassy',
  mistysurge: 'misty',
  psychicsurge: 'psychic',
}
// 등장할 때 문구가 나오는 특성 (양쪽 다 나오면 문구 순서 = 발동 순서 = 스피드 순)
const ENTRY_MESSAGE = new Set([
  ...['drought', 'drizzle', 'sandstream', 'snowwarning'],
  ...['deltastream', 'desolateland', 'primordialsea'],
  ...['electricsurge', 'grassysurge', 'mistysurge', 'psychicsurge'],
  'intimidate',
  'pressure',
  'moldbreaker',
  'teravolt',
  'turboblaze',
  'unnerve',
  'frisk',
  'download',
  'trace',
  'anticipation',
  'forewarn',
  'airlock',
  'cloudnine',
  'screencleaner',
  'supremeoverlord',
  'comatose',
  'neutralizinggas',
  'hospitality',
  'curiousmedicine',
  'dauntlessshield',
  'intrepidsword',
])
const WEATHER_ROCK: Partial<Record<Weather, string>> = {
  sun: 'heatrock',
  rain: 'damprock',
  sand: 'smoothrock',
  snow: 'icyrock',
}
// 위협이 통하지 않는 특성 (클리어바디류·괴력집게는 statChange 에서 막음)
const INTIMIDATE_IMMUNE = new Set(['innerfocus', 'oblivious', 'owntempo', 'scrappy'])
// 상대가 내리는 랭크 하락 무효: 전체 / 특정 능력치
const BLOCK_FOE_DROPS = new Set(['clearbody', 'whitesmoke', 'fullmetalbody'])
// 상대가 내리는 그 능력만 막음 (괴력집게 공격, 부풀린가슴 방어, 날카로운눈 명중)
const BLOCK_STAT_DROP: Record<string, RankKey> = {
  hypercutter: 'atk',
  bigpecks: 'def',
  keeneye: 'accuracy',
  mindseye: 'accuracy',
}
// 아군도 맞히는 광역기 (지진/파도타기/방전/대폭발 등)
const HITS_ALLY_TARGET = 'allAdjacent'
const BASE_TURNS = 5
const EXTENDED_TURNS = 8
const MAX_HISTORY = 30

const zeroBoosts = (): BoostTable => ({
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
  accuracy: 0,
  evasion: 0,
})
const newMon = (hp: number): MonState => ({
  hp,
  megaOn: false,
  megaUsed: false,
  alt: false,
  itemGone: false,
  status: '',
  toxicTurn: 0,
  volatiles: {},
  boosts: zeroBoosts(),
  lastMove: '',
  moveStreak: 0,
  enteredTurn: 0,
  transform: null,
  timesHit: 0,
  lastFailed: false,
  turnDamaged: false,
  turnLowered: false,
  turnTaken: { physical: 0, special: 0, last: 0 },
  obs: [],
  speedSp: null,
})
const newAction = (): ActionState => ({
  kind: 'move',
  cantReason: 'slp',
  move: '',
  target: 0,
  switchTo: null,
  useMega: false,
  amount: null,
  allyAmount: null,
  crit: false,
  missed: false,
  amount2: null,
  selfSwitch: null,
  via: '',
  foeSwitch: null,
  inflicts: [],
  inflicts2: [],
  contactInflicts: [],
})
// 바톤터치로 넘어가는 특수 상태
// 상대를 노리는 기술 대상 (프레셔 PP 판정). foeSide(설치기)는 필드의 상대 모두
const FOE_TARGETS = new Set([
  'normal',
  'any',
  'randomNormal',
  'allAdjacentFoes',
  'allAdjacent',
  'foeSide',
])
const BATON_VOLATILES = new Set([
  'confusion',
  'focusenergy',
  'leechseed',
  'curse',
  'ingrain',
  'aquaring',
  'healblock',
  'substitute',
  'perishsong',
  'magnetrise',
])
// 잠듦·얼음: 행동하려 할 때 풀릴 확률 (n 번째 시도, 챔피언스 규칙). 잠듦 0% → 33% → 반드시, 얼음 25% → 25% → 반드시
export const WAKE_CHANCE: Record<'slp' | 'frz' | 'rest', number[]> = {
  slp: [0, 33, 100],
  frz: [25, 25, 100],
  rest: [0, 0, 100], // 잠자기
}
// 맞히면 무작위 상태이상 하나를 거는 기술 (데이터에 확률 효과로 들어 있지 않음)
const RANDOM_STATUS_MOVES: Record<string, Exclude<Status, ''>[]> = {
  triattack: ['brn', 'par', 'frz'],
  direclaw: ['psn', 'par', 'slp'],
}
// 접촉한 상대에게 상태를 거는 특성 (맞는 쪽)
const CONTACT_STATUS_ABILITY: Record<string, string[]> = {
  static: ['par'],
  flamebody: ['brn'],
  poisonpoint: ['psn'],
  effectspore: ['psn', 'par', 'slp'],
  cutecharm: ['attract'],
}
// 쓴 다음 턴 행동 불가인 특수 상태: 반동(파괴광선류) / 게으름(특성). 1 = 이번 턴에 씀, 2 = 이번 턴 행동 불가
const LOAF_VOLATILES = ['mustrecharge', 'truant']
// 교체를 막는 특수 상태 (고스트 타입은 뿌리박기 말고는 무시)
const TRAP_VOLATILES = ['octolock', 'jawlock', 'partiallytrapped']
// 잠든 채로 쓰는 기술 (써도 깨지 않음)
const SLEEP_MOVES = new Set(['sleeptalk', 'snore'])
// 다른 기술을 불러내는 기술 (행동 칸에서 나간 기술을 따로 고름)
export const CALLER_MOVES = new Set(['sleeptalk', 'copycat'])
const TRANSFORM_PP = 5 // 변신으로 복사한 기술의 PP
// 맞은 얼음 상태 포켓몬을 녹이는 기술: 불꽃 타입 공격기 + 열탕·스팀버스트·열사의대지
const THAW_MOVES = new Set(['scald', 'steameruption', 'scorchingsands', 'matchagotcha'])
// 쓰고 나서 자기가 교체되는 기술 / 상대를 교체시키는 기술 / 빗나가면 최대 HP 1/2 반동인 기술
export const PIVOT_MOVES = new Set([
  'uturn',
  'voltswitch',
  'flipturn',
  'partingshot',
  'batonpass',
  'chillyreception',
  'shedtail',
  'teleport',
])
export const FORCE_MOVES = new Set(['dragontail', 'circlethrow', 'roar', 'whirlwind'])
const CRASH_MOVES = new Set(['highjumpkick', 'axekick', 'supercellslam'])

// 상대 배분은 모른다 → 배틀 슬롯은 기준값(SP 0·무보정)으로 두고 실능치는 추정 범위로 정한다 (useBattle "상대 배분")
const NO_SP: StatTable = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
const NO_TRANSFORM = { megaOn: false, alt: false }

export function useBattle(mode: BattleMode) {
  const N = mode === 'single' ? 1 : 2
  const gd = useGameData()
  const calc = useTeamCalc()
  const mineTeam = useTeam('mine')
  const oppTeam = useTeam('opp')
  const entry = useEntry(mode)
  const state = useState<BattleState | null>(`battle-${mode}`, () => null)

  // 로스터 → 파티 슬롯
  const mineSlots = computed(() => entry.picks.value.map((i) => mineTeam.slots.value[i]!))
  const oppSlots = computed(() => oppTeam.slots.value)
  const signature = computed(() =>
    JSON.stringify([
      entry.picks.value,
      mineSlots.value.map((s) => s.species + s.item),
      oppSlots.value.map((s) => s.species),
    ]),
  )

  const slotsOf = (side: BattleSide) => (side === 'mine' ? mineSlots.value : oppSlots.value)

  // ── 상대 도구 ─────────────
  // 배틀 계산에 쓰는 상대 도구는 "상대 도구 확정"으로 확정한 것만 (메가스톤은 메가진화 판정에 필요하므로 그대로).
  // 선출 화면의 도구(자동 배치·통계·직접 입력)는 추측 → guessedItem 으로 범위 안내(데미지 칸 "추측 도구면", 선후공)에만 쓰고
  // 소모·턴 끝 회복·날씨 연장 같은 확정 처리에는 쓰지 않는다
  const isMegaStone = (id: string) => !!id && !!gd.data.value?.items[id]?.megaStone
  const oppItemOf = (idx: number) => {
    const m = state.value?.sides.opp.mons[idx]
    const entered = oppSlots.value[idx]?.item || ''
    if (m?.itemKnown) return m.item ?? entered // 예전 저장분은 파티에 확정 도구가 들어가 있음
    return isMegaStone(entered) ? entered : ''
  }
  // 확정 전 상대 도구의 추측 (없거나 확정했거나 메가스톤이면 '')
  const guessedItem = (idx: number) => {
    const m = state.value?.sides.opp.mons[idx]
    const entered = oppSlots.value[idx]?.item || ''
    return !m || m.itemKnown || isMegaStone(entered) ? '' : entered
  }
  // 확정한 상대 특성 (없으면 '' → 선출 화면의 특성을 추측으로 씀)
  const oppAbilityOf = (idx: number) => {
    const m = state.value?.sides.opp.mons[idx]
    return m?.abilityKnown ? m.ability || '' : ''
  }
  // 배틀 계산에 쓰는 슬롯 (상대는 도구·특성을 위 규칙으로 바꾸고, 성격·능력 포인트는 기준값으로 비운 사본)
  const battleSlot = (side: BattleSide, idx: number) => {
    const slot = slotsOf(side)[idx]
    if (side === 'mine' || !slot) return slot
    const item = oppItemOf(idx)
    const ability = oppAbilityOf(idx) || slot.ability
    return { ...slot, item, ability, nature: '', sp: { ...NO_SP } }
  }

  // ── 상대 배분 ─────────────
  // 상대의 성격·능력 포인트는 모른다. 선출 화면의 값(자동 배치·통계·직접 입력)은 추측이라 배틀에는 쓰지 않고,
  // 주고받은 데미지·선후공 관찰로 좁힌 범위(useOppEstimate bounds)만 쓴다. 관측이 없으면 SP 0 하락 성격 ~ SP 32 보정 성격
  //   - 데미지 표·예상 흐름: 범위의 양 끝으로 계산한 데미지 범위 (combatantRange)
  //   - 값 하나가 필요한 곳 (HP % ↔ 실수치, 바디프레스·속임수, 실능치 비교 특성 등): 범위의 가운데 (resolveAt)
  //   - 선후공: 스피드 범위로 정해지지 않으면 모름 (화면에서 본 순서를 입력받는다)
  const estimator = useOppEstimate({
    state,
    resolveSnapshot: (side, idx, snap) => resolveSnapshot(side, idx, snap),
    oppSlots,
    oppItemOf: (idx) => oppItemOf(idx),
    speedRangesOf: (oi, withPending) => speedRangesOf(oi, withPending),
  })
  // 범위를 계산하는 중인 상대 (그 계산 안에서는 기준값 실능치를 쓴다 — 변신 등으로 자기 자신을 다시 부르지 않게)
  const boundsBusy = new Set<number>()
  // 상대 oi 의 실능치 범위 (base = 그때 폼의 종족값)
  const oppBounds = (oi: number, base: StatTable): OppBounds | null => {
    if (boundsBusy.has(oi)) return null
    boundsBusy.add(oi)
    try {
      return estimator.bounds(oi, base)
    } finally {
      boundsBusy.delete(oi)
    }
  }
  // 지금 폼의 상대 실능치 범위 (변신 중이면 복사한 실능치라 null)
  const oppBoundsNow = (oi: number) => {
    const r = resolveAt('opp', oi)
    return r && !r.transformedFrom ? oppBounds(oi, r.species.stats) : null
  }
  const mid = (x: Range) => Math.round((x.min + x.max) / 2)
  // 상대의 실능치를 범위의 가운데로 (변신 중이면 복사한 실능치 그대로, HP 만 자기 것)
  const withOppStats = (oi: number, r: ResolvedSlot | null): ResolvedSlot | null => {
    if (!r) return r
    const self = r.transformedFrom ? resolveSnapshot('opp', oi, NO_TRANSFORM) : r
    const bd = self && oppBounds(oi, self.species.stats)
    if (!bd) return r
    const hp = mid(bd.hp)
    if (r.transformedFrom) return { ...r, stats: { ...r.stats, hp } }
    const stats = { hp, atk: mid(bd.atk), def: mid(bd.def), spa: mid(bd.spa), spd: mid(bd.spd) }
    return { ...r, stats: { ...stats, spe: mid(bd.spe) } }
  }

  // altOverride: 배틀 폼을 지정 (예: 이번 턴 먼저 공격해 블레이드폼이 된 킬가르도가 맞는 경우)
  const resolveAt = (
    side: BattleSide,
    idx: number | null,
    megaOverride?: boolean,
    altOverride?: boolean,
  ): ResolvedSlot | null => {
    if (idx == null || !state.value) return null
    const mon = state.value.sides[side].mons[idx]
    if (!mon) return null
    const snap = {
      megaOn: megaOverride ?? mon.megaOn,
      alt: altOverride ?? mon.alt,
      transform:
        mon.transform && altOverride != null
          ? { ...mon.transform, alt: altOverride }
          : mon.transform,
    }
    const r = resolveSnapshot(side, idx, snap)
    if (side === 'opp') return withOppStats(idx, r)
    // 내 메타몽이 상대로 변신: 복사하는 실능치도 상대 범위의 가운데
    const tf = snap.transform
    if (r && tf?.side === 'opp') {
      const target = withOppStats(
        tf.idx,
        resolveSnapshot('opp', tf.idx, { megaOn: tf.megaOn, alt: tf.alt }),
      )
      if (target) return { ...r, stats: { ...target.stats, hp: r.stats.hp } }
    }
    return r
  }
  // 저장해 둔 상태(관측 시점 등)로 풀기. 변신 중이면 복사 대상(그때의 메가/폼) 기준, HP·도구는 자기 것.
  // 상대 실능치는 기준값(SP 0·무보정) 그대로 — 배분 추정이 이걸 쓰고, 배틀 계산은 resolveAt 이 범위로 바꾼다
  const resolveSnapshot = (
    side: BattleSide,
    idx: number,
    snap: { megaOn: boolean; alt: boolean; transform?: MonState['transform'] },
  ): ResolvedSlot | null => {
    const tf = snap.transform
    if (tf) {
      const self = calc.resolve(battleSlot(side, idx), false, false)
      const target = calc.resolve(battleSlot(tf.side, tf.idx), tf.megaOn, tf.alt)
      if (self && target) return calc.transformed(self, target)
    }
    return calc.resolve(battleSlot(side, idx), snap.megaOn, snap.alt)
  }
  // 메타몽 자신의 특성 (변신 전 원래 특성: 괴짜 판정용)
  const ownAbility = (side: BattleSide, idx: number) =>
    calc.resolve(battleSlot(side, idx), false, false)?.ability || ''
  const maxHp = (side: BattleSide, idx: number) => resolveAt(side, idx)?.stats.hp || 0

  // ── 초기화 ─────────────
  const reset = () => {
    const mons = (side: BattleSide) =>
      slotsOf(side).map((s) =>
        newMon(side === 'mine' ? calc.resolve(s, false, false)?.stats.hp || 0 : 100),
      )
    state.value = {
      signature: signature.value,
      turn: 1,
      weather: { key: '', cur: 0, total: BASE_TURNS, permanent: false, source: null, by: null },
      terrain: { key: '', cur: 0, total: BASE_TURNS, by: null },
      rooms: {},
      fairyLock: 0,
      sides: {
        mine: {
          mons: mons('mine'),
          active: Array(N).fill(null),
          revealed: [],
          hazards: {},
          screens: {},
        },
        opp: {
          mons: mons('opp'),
          active: Array(N).fill(null),
          revealed: [],
          hazards: {},
          screens: {},
        },
      },
      actions: {
        mine: Array.from({ length: N }, newAction),
        opp: Array.from({ length: N }, newAction),
      },
      observedOrder: 'unknown',
      entry: null,
      entryObs: {},
      focus: { mine: 0, opp: 0 },
      preview: null,
      history: [],
    }
    // 내 선출 순서대로 필드에 내보냄
    for (let k = 0; k < N && k < mineSlots.value.length; k++) sendOut('mine', k, k)
  }
  // 진행 중인 배틀의 구성(선출 / 내 포켓몬·도구 / 상대 포켓몬)이 바뀌면 이어갈 수 없다.
  // 아직 시작 전(첫 턴 적용 전)이면 조용히 새로 만들고, 진행 중이면 화면이 이유를 보여 주고 확인을 받은 뒤 초기화
  const staleReason = computed<'' | 'picks' | 'mine' | 'opp'>(() => {
    const s = state.value
    if (!s || s.signature === signature.value) return ''
    try {
      const [oldPicks, oldMine, oldOpp] = JSON.parse(s.signature)
      const [picks, mineS, oppS] = JSON.parse(signature.value)
      if (JSON.stringify(oldPicks) !== JSON.stringify(picks)) return 'picks'
      if (JSON.stringify(oldMine) !== JSON.stringify(mineS)) return 'mine'
      if (JSON.stringify(oldOpp) !== JSON.stringify(oppS)) return 'opp'
    } catch {
      // 예전 형식
    }
    return 'picks'
  })
  const inProgress = () => !!state.value && (state.value.turn > 1 || state.value.history.length > 0)
  const ensure = () => {
    if (!state.value || (state.value.signature !== signature.value && !inProgress())) reset()
  }

  // ── 등장 / 교체 ─────────────
  const isFainted = (side: BattleSide, idx: number) =>
    (state.value?.sides[side].mons[idx]?.hp ?? 1) <= 0

  // 첫 턴 실행 전 (선두 포켓몬을 고르는 단계)
  const isLeadPhase = () => state.value!.turn === 1 && !state.value!.history.length
  const foeOf = (side: BattleSide): BattleSide => (side === 'mine' ? 'opp' : 'mine')

  // how: 'switch' = 실제 교체 (물러남·등장 효과, 설치기), 'correct' = 정정 (필드에 있는 포켓몬만 바꾸고 효과 없음)
  // defer: 등장 특성을 바로 발동하지 않음 (함께 등장하는 포켓몬과 스피드 순으로 따로 발동)
  function sendOut(
    side: BattleSide,
    slot: number,
    idx: number,
    how: 'switch' | 'correct' = 'switch',
    defer = false,
  ) {
    const s = state.value!
    const sd = s.sides[side]
    if (isFainted(side, idx) || sd.active.includes(idx)) return
    const prev = sd.active[slot]
    const lead = isLeadPhase()
    if (how === 'correct' && !lead) {
      sd.active[slot] = idx
      if (side === 'opp' && !sd.revealed.includes(idx)) sd.revealed.push(idx)
      return
    }
    // 선두를 고르는 중에 바꾸면, 앞서 고른 포켓몬의 위협으로 바뀐 상대 랭크와 그 포켓몬으로의 변신을 되돌린다
    if (lead && prev != null)
      for (const fi of s.sides[foeOf(side)].active) {
        if (fi == null) continue
        const fm = mon(foeOf(side), fi)
        fm.boosts = zeroBoosts()
        if (fm.transform?.side === side && fm.transform.idx === prev) fm.transform = null
      }
    if (prev != null) {
      const out = sd.mons[prev]!
      out.boosts = zeroBoosts() // 교체 시 랭크·특수 상태 초기화
      out.volatiles = {}
      out.lastMove = ''
      out.moveStreak = 0
      out.transform = null // 변신은 물러나면 풀린다
      out.tfPpUsed = {}
      // 배틀 폼: 팔라피는 한 번 물러나면 마이티폼으로 고정, 킬가르도는 물러나면 실드폼, 모르페코는 배부른모양
      const outAbility = resolveAt(side, prev)?.ability
      if (outAbility === 'zerotohero') out.alt = true
      // 재생력: 물러나면 최대 HP 1/3 회복 (선두 고르기 제외)
      if (outAbility === 'regenerator' && !lead && out.hp > 0)
        healHp(side, prev, Math.floor(maxHp(side, prev) / 3))
      if (outAbility === 'stancechange' || outAbility === 'hungerswitch') out.alt = false
      if (s.weather.source && s.weather.source[0] === side && s.weather.source[1] === prev)
        clearWeather()
      s.observedOrder = 'unknown'
    }
    sd.active[slot] = idx
    sd.mons[idx]!.enteredTurn = lead ? 0 : s.turn
    // 치유소원: 이 칸에 나온 포켓몬이 HP·상태이상 모두 회복
    const hw = sd.healingWish?.indexOf(slot) ?? -1
    if (hw >= 0 && !lead) {
      sd.healingWish!.splice(hw, 1)
      Object.assign(sd.mons[idx]!, {
        hp: side === 'mine' ? maxHp(side, idx) : 100,
        status: '',
        toxicTurn: 0,
      })
    }
    // 설치기: 실제로 교체해 들어올 때 (선두 고르기·정정은 제외)
    if (!lead) entryHazards(side, idx)
    if (side === 'opp' && !sd.revealed.includes(idx)) sd.revealed.push(idx)
    // 선두는 양쪽이 동시에 등장 → 필드의 모든 포켓몬을 스피드 순으로 다시 발동
    if (lead) leadEntry(side, idx)
    else if (!defer) onEnter(side, idx, true)
    // 괴짜: 맞은편 상대로 변신
    if (ownAbility(side, idx) === 'imposter') imposter(side, slot)
    // 선두는 동시에 등장 → 이미 나와 있는 상대의 위협도 이 포켓몬에게 적용,
    // 상대 쪽 괴짜 메타몽이 이 칸을 맞은편으로 두고 아직 변신 전이면 지금 변신
    if (lead) {
      const foe = foeOf(side)
      s.sides[foe].active.forEach((fi, fSlot) => {
        if (fi == null) return
        if (resolveAt(foe, fi)?.ability === 'intimidate') intimidate(foe, fi, idx)
        if (
          !mon(foe, fi).transform &&
          ownAbility(foe, fi) === 'imposter' &&
          acrossSlot(fSlot) === slot
        )
          transformInto(foe, fi, side, idx)
      })
    }
  }

  // ── 설치기 (교체로 들어올 때) ─────────────
  // 스텔스록 = 최대 HP × 1/8 × 바위 상성, 압정뿌리기 = 1/8·1/6·1/4 (겹수), 독압정 = 독 / 2겹 맹독
  // (땅에 있는 독 타입이 밟으면 사라짐, 강철·이미 상태이상·신비의부적·미스트필드는 무효), 끈적끈적네트 = 스피드 −1.
  // 압정·독압정·네트는 땅에 있는 포켓몬만 (비행·부유·풍선 등 제외). 매직가드는 데미지 없음
  function entryHazards(side: BattleSide, idx: number) {
    const s = state.value!
    const sd = s.sides[side]
    const hz = sd.hazards
    if (!Object.keys(hz).length) return
    const c = combatantOf(side, idx)
    if (!c || !gd.data.value) return
    const m = mon(side, idx)
    const max = c.stats.hp
    const field = fieldFor(side, idx)
    const grounded = isGrounded(c, field)
    const magicGuard = c.ability === 'magicguard'
    let dmg = 0
    if (hz.stealthrock && !magicGuard) {
      const rock = gd.data.value.types.chart.rock || {}
      const eff = c.species.types.reduce((e, t) => e * (rock[t] ?? 1), 1)
      dmg += Math.floor((max * eff) / 8)
    }
    if (hz.spikes && grounded && !magicGuard)
      dmg += Math.floor(max / [8, 8, 6, 4][Math.min(3, hz.spikes)]!)
    if (dmg)
      m.hp =
        side === 'mine' ? Math.max(0, m.hp - dmg) : Math.max(0, m.hp - (dmg / (max || 1)) * 100)
    if (hz.toxicspikes && grounded && m.hp > 0) {
      if (c.species.types.includes('poison')) delete hz.toxicspikes
      else if (
        !c.species.types.includes('steel') &&
        !m.status &&
        !sd.screens.safeguard &&
        field.terrain !== 'misty'
      ) {
        m.status = hz.toxicspikes >= 2 ? 'tox' : 'psn'
        m.toxicTurn = 0
      }
    }
    if (hz.stickyweb && grounded && m.hp > 0) {
      const foe = foeOf(side)
      const fi = s.sides[foe].active.find((x) => x != null)
      statChange(side, idx, 'spe', -1, fi != null ? [foe, fi] : undefined)
    }
  }

  // ── 변신 (메타몽) ─────────────
  // 괴짜는 맞은편(더블에서는 대각선) 상대로 변신 — Showdown imposter: foe.active[N - 1 - 자기 칸]
  const acrossSlot = (slot: number) => N - 1 - slot
  function imposter(side: BattleSide, slot: number) {
    const s = state.value!
    const idx = s.sides[side].active[slot]
    const foe = foeOf(side)
    const tIdx = s.sides[foe].active[acrossSlot(slot)]
    if (idx != null && tIdx != null) transformInto(side, idx, foe, tIdx)
  }
  // 상대의 종·타입·특성·기술·실능치(HP 제외)·랭크를 복사 (도구·HP 는 자기 것). 이미 변신한 쪽끼리는 실패
  function transformInto(side: BattleSide, idx: number, tSide: BattleSide, tIdx: number) {
    const m = mon(side, idx)
    const t = mon(tSide, tIdx)
    if (m.transform || t.transform || isFainted(tSide, tIdx)) return false
    m.transform = { side: tSide, idx: tIdx, megaOn: t.megaOn, alt: t.alt }
    m.tfPpUsed = {}
    m.boosts = { ...t.boosts }
    onEnter(side, idx, true) // 복사한 특성 발동 (위협·날씨 등)
    return true
  }
  // 변신할 수 있는 포켓몬 (괴짜 메타몽 / 변신 기술을 가진 포켓몬)
  const canTransform = (side: BattleSide, idx: number) =>
    ownAbility(side, idx) === 'imposter' || !!slotsOf(side)[idx]?.moves.includes('transform')
  // 화면에서 직접: 맞은편 상대로 변신 / 변신 해제
  const toggleTransform = (side: BattleSide, idx: number) => {
    const m = mon(side, idx)
    if (m.transform) {
      m.transform = null
      m.tfPpUsed = {}
      return
    }
    const slot = state.value!.sides[side].active.indexOf(idx)
    if (slot >= 0) imposter(side, slot)
  }

  // 위협: 상대 필드 전체(onlyTarget 지정 시 그 포켓몬만) 공격 −1. 특성/도구에 따른 반응 포함
  function intimidate(side: BattleSide, idx: number, onlyTarget?: number) {
    const foe = foeOf(side)
    for (const fi of state.value!.sides[foe].active) {
      if (fi == null || isFainted(foe, fi) || (onlyTarget != null && fi !== onlyTarget)) continue
      const ab = resolveAt(foe, fi)?.ability || ''
      if (ab === 'guarddog') {
        statChange(foe, fi, 'atk', 1)
        continue
      }
      if (INTIMIDATE_IMMUNE.has(ab) || mon(foe, fi).volatiles.substitute) continue
      statChange(foe, fi, 'atk', -1, [side, idx])
      if (ab === 'rattled') statChange(foe, fi, 'spe', 1)
    }
  }

  // 배틀 중 자동으로 생기는 랭크 변화 (수동 조절 changeBoost 와 구분)
  //   심술꾸러기: 반대로 / source(상대가 내린 경우): 클리어바디류·괴력집게·부풀린가슴 무효, 미러아머 반사,
  //   실제로 내려가면 오기(공격 +2)·승기(특공 +2), 하양허브는 내려간 능력치를 되돌리고 소모
  //   batch: 기술 하나의 여러 능력치 변화를 한꺼번에 처리할 때 (하양허브는 끝난 뒤 whiteHerb 로 한 번만)
  function statChange(
    side: BattleSide,
    idx: number,
    key: RankKey,
    delta: number,
    source?: [BattleSide, number],
    batch = false,
  ) {
    const r = resolveAt(side, idx)
    const m = mon(side, idx)
    const ab = r?.ability || ''
    if (ab === 'contrary') delta = -delta
    if (delta < 0 && source) {
      if (BLOCK_FOE_DROPS.has(ab) || BLOCK_STAT_DROP[ab] === key) return
      if (ab === 'mirrorarmor') return statChange(source[0], source[1], key, delta)
    }
    const before = m.boosts[key] ?? 0
    m.boosts[key] = clampBoost(before + delta)
    if (m.boosts[key]! >= before) return
    m.turnLowered = true
    if (source && ab === 'defiant') statChange(side, idx, 'atk', 2)
    if (source && ab === 'competitive') statChange(side, idx, 'spa', 2)
    if (!batch) whiteHerb(side, idx)
  }
  function whiteHerb(side: BattleSide, idx: number) {
    const m = mon(side, idx)
    if (m.itemGone || resolveAt(side, idx)?.slot.item !== 'whiteherb') return
    const lowered = (Object.keys(m.boosts) as RankKey[]).filter((k) => (m.boosts[k] ?? 0) < 0)
    if (!lowered.length) return
    for (const k of lowered) m.boosts[k] = 0
    m.itemGone = true
  }

  // 등장 시 특성 발동 (날씨/필드/위협). 원시 날씨는 다른 날씨로 덮이지 않는다.
  // entering = 실제 등장/메가진화 (메가 미리보기 토글에서는 위협을 발동하지 않음)
  function onEnter(side: BattleSide, idx: number, entering = false) {
    onEnterField(side, idx)
    const ab = resolveAt(side, idx)?.ability
    if (entering && ab === 'intimidate') intimidate(side, idx)
    // 대접: 등장하면 아군 최대 HP 1/4 회복
    if (entering && ab === 'hospitality') {
      const slot = state.value!.sides[side].active.indexOf(idx)
      const ally = slot >= 0 ? allyOf(side, slot) : null
      if (ally != null && !isFainted(side, ally) && !mon(side, ally).volatiles.healblock)
        healHp(side, ally, Math.floor(maxHp(side, ally) / 4))
    }
  }
  // 날씨·필드 특성 (동시 등장 순서를 고치면 이 부분만 다시 발동)
  function onEnterField(side: BattleSide, idx: number) {
    const s = state.value!
    const r = resolveAt(side, idx)
    if (!r) return
    const ab = r.ability
    if (PRIMAL_ABILITY[ab])
      setWeather(PRIMAL_ABILITY[ab]!, { permanent: true, source: [side, idx] })
    else if (WEATHER_ABILITY[ab] && !s.weather.permanent)
      setWeather(WEATHER_ABILITY[ab]!, { item: r.slot.item, by: [side, idx] })
    if (TERRAIN_ABILITY[ab]) setTerrain(TERRAIN_ABILITY[ab]!, r.slot.item, [side, idx])
  }

  // ── 동시 등장 ─────────────
  // 함께 등장한 포켓몬의 특성은 스피드 순으로 발동 (트릭룸이면 느린 쪽부터) → 나중에 발동한 날씨·필드가 남는다.
  // 내 쪽 × 상대 쪽은 관찰한 순서(entryObs) → speedOrder(상대 스피드 구간)로 정해지면 그 순서 → 상대 스피드 범위의 가운데 (임시, 본 순서를 고르면 다시)
  const entryKey = (mi: number, oi: number) => `${mi}:${oi}`
  const announces = (side: BattleSide, idx: number) => {
    const r = resolveAt(side, idx)
    if (!r) return false
    if (side === 'mine' || r.isMega || r.transformedFrom || mon(side, idx).abilityKnown)
      return ENTRY_MESSAGE.has(r.ability)
    return r.base.abilities.some((a) => ENTRY_MESSAGE.has(a))
  }
  // 등장 직전 상태 기준 (날씨·필드가 아직 안 바뀐 때 부른다)
  const entryPairs = (entrants: readonly [BattleSide, number][]): EntryPair[] => {
    const pairs: EntryPair[] = []
    for (const [ms, mi] of entrants)
      for (const [os, oi] of entrants) {
        if (ms !== 'mine' || os !== 'opp' || !announces('mine', mi) || !announces('opp', oi))
          continue
        const se = speedEnvOf(oi)
        if (!se) continue
        const so = speedOrder(mi, oi)
        pairs.push({
          mi,
          oi,
          auto: so?.first ?? null,
          tiePossible: !!so?.tiePossible,
          base: se.base,
          env: se.env,
          mySpeed: speedOf('mine', mi),
        })
      }
    return pairs
  }
  // 짝의 먼저 발동한 쪽: 관찰 → 스피드 판정 (동속·모름이면 null)
  const entryFirst = (p: EntryPair): BattleSide | null => {
    const o = state.value!.entryObs?.[entryKey(p.mi, p.oi)]
    return o ?? (p.auto === 'mine' || p.auto === 'opp' ? p.auto : null)
  }
  const orderEntrants = (entrants: readonly [BattleSide, number][], pairs: EntryPair[]) => {
    const tr = !!state.value!.rooms.trickroom
    return [...entrants].sort((x, y) => {
      if (x[0] !== y[0]) {
        const [m, o] = x[0] === 'mine' ? [x, y] : [y, x]
        const p = pairs.find((q) => q.mi === m[1] && q.oi === o[1])
        const f = p && entryFirst(p)
        if (f) return f === x[0] ? -1 : 1
      }
      const d = speedOf(x[0], x[1]) - speedOf(y[0], y[1])
      return (tr ? d : -d) || (x[0] === 'mine' ? -1 : 1)
    })
  }
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
  const copyField = () => ({
    weather: clone(state.value!.weather),
    terrain: clone(state.value!.terrain),
  })
  // 등장 직전 날씨·필드로 되돌리고 순서대로 발동. fresh: 처음 발동하는 포켓몬 (위협 포함), 나머지는 날씨·필드만 다시
  function runEntry(batch: EntryBatch, fresh: (side: BattleSide, idx: number) => boolean) {
    const s = state.value!
    s.weather = clone(batch.before.weather)
    s.terrain = clone(batch.before.terrain)
    for (const [side, idx] of orderEntrants(batch.entrants, batch.pairs))
      if (fresh(side, idx)) onEnter(side, idx, true)
      else onEnterField(side, idx)
  }
  // 관찰한 발동 순서로 상대 스피드 구간 좁히기 (등장 직전 구간에서 다시 계산 → 관찰을 바꿔도 됨)
  function applyEntryNarrowing(batch: EntryBatch) {
    const obs = state.value!.entryObs ?? {}
    for (const oi of new Set(batch.pairs.map((p) => p.oi))) {
      let r = batch.oppBefore[oi] ?? null
      for (const p of batch.pairs) {
        const o = obs[entryKey(p.mi, p.oi)]
        if (p.oi !== oi || !o || p.env.fixedStat != null) continue
        r = narrowRanges(r ?? fullRanges(), p.base, p.env, p.mySpeed, (o === 'opp') !== batch.tr)
      }
      mon('opp', oi).speedSp = r
    }
  }
  const newBatch = (entrants: [BattleSide, number][], before: EntryBatch['before']): EntryBatch => {
    const pairs = entryPairs(entrants)
    const oppBefore: Record<number, SpeedRanges | null> = {}
    for (const p of pairs) oppBefore[p.oi] = mon('opp', p.oi).speedSp
    return { entrants, before, oppBefore, tr: !!state.value!.rooms.trickroom, pairs }
  }
  // 고칠 수 있는 묶음을 버림. 관찰로 좁혔던 상대 스피드 구간은 되돌림 (선두를 다시 고를 때)
  const dropEntry = () => {
    const s = state.value!
    if (s.entry)
      for (const [oi, r] of Object.entries(s.entry.oppBefore)) mon('opp', +oi).speedSp = r
    s.entry = null
    s.entryObs = {}
  }
  // 선두: 지금 필드에 있는 양쪽 포켓몬 전부가 동시에 등장 (날씨·필드 없음에서 시작). 방금 나온 포켓몬만 위협 발동
  function leadEntry(side: BattleSide, idx: number) {
    const s = state.value!
    dropEntry()
    const before: EntryBatch['before'] = {
      weather: { key: '', cur: 0, total: BASE_TURNS, permanent: false, source: null, by: null },
      terrain: { key: '', cur: 0, total: BASE_TURNS, by: null },
    }
    s.weather = clone(before.weather)
    s.terrain = clone(before.terrain)
    const entrants: [BattleSide, number][] = []
    for (const sd of ['mine', 'opp'] as const)
      for (const i of s.sides[sd].active) if (i != null) entrants.push([sd, i])
    const batch = newBatch(entrants, before)
    runEntry(batch, (sd, i) => sd === side && i === idx)
    s.entry = batch.pairs.length ? batch : null
  }
  // 쓰러진 뒤 교체: 고른 포켓몬을 한 번에 내보냄 (양쪽이면 스피드 순 발동, 순서는 다음 턴 적용 전까지 고칠 수 있음)
  function replaceFainted(choices: { side: BattleSide; slot: number; idx: number }[]) {
    const s = state.value!
    if (!choices.length) return
    s.history.push(snapshot())
    if (s.history.length > MAX_HISTORY) s.history.shift()
    dropEntry()
    const entrants: [BattleSide, number][] = []
    for (const c of choices) {
      if (isFainted(c.side, c.idx) || s.sides[c.side].active.includes(c.idx)) continue
      sendOut(c.side, c.slot, c.idx, 'switch', true)
      entrants.push([c.side, c.idx])
    }
    const batch = newBatch(entrants, copyField())
    runEntry(batch, () => true)
    s.entry = batch.pairs.length ? batch : null
  }
  // 등장 특성 발동 순서 관찰 입력 (unknown = 지움). 고칠 수 있는 묶음이면 날씨·필드를 다시 발동하고 구간을 다시 좁힘.
  // 이번 턴 교체(예정)끼리는 저장만 해 두고 턴 적용 때 반영
  function setEntryOrder(mi: number, oi: number, v: 'mine' | 'opp' | 'unknown') {
    const s = state.value!
    const obs = (s.entryObs ??= {})
    if (v === 'unknown') delete obs[entryKey(mi, oi)]
    else obs[entryKey(mi, oi)] = v
    const batch = s.entry
    if (batch?.pairs.some((p) => p.mi === mi && p.oi === oi)) {
      runEntry(batch, () => false)
      applyEntryNarrowing(batch)
    }
  }
  // 지금 보여 줄 짝: 고칠 수 있는 묶음, 없으면 이번 턴 교체 예정끼리 (기술을 쓰기 전 양쪽 다 교체)
  const entryPairsNow = computed(() => {
    const s = state.value
    if (!s) return []
    if (s.entry?.pairs.length) return s.entry.pairs
    const planned: [BattleSide, number][] = []
    for (const side of ['mine', 'opp'] as const)
      s.actions[side].forEach((a) => {
        if (a.kind === 'switch' && a.switchTo != null) planned.push([side, a.switchTo])
      })
    return planned.some((e) => e[0] === 'mine') && planned.some((e) => e[0] === 'opp')
      ? entryPairs(planned)
      : []
  })
  // 고칠 수 있는 묶음에 상대 oi 가 있으면 등장 직전 상태로 되돌려 짝(스피드 판정)을 다시 만들고 다시 발동.
  // 등장 뒤 드러난 특성·도구(스카프 아님 확정 등)로 발동 순서가 정해질 수 있어서. 묶음에 없으면 false
  function refreshEntry(oi: number, fresh: (side: BattleSide, idx: number) => boolean) {
    const s = state.value!
    const batch = s.entry
    if (!batch?.entrants.some(([sd, i]) => sd === 'opp' && i === oi)) return false
    for (const [o, r] of Object.entries(batch.oppBefore)) mon('opp', +o).speedSp = r
    s.weather = clone(batch.before.weather)
    s.terrain = clone(batch.before.terrain)
    batch.pairs = entryPairs(batch.entrants)
    for (const p of batch.pairs)
      if (!(p.oi in batch.oppBefore)) batch.oppBefore[p.oi] = mon('opp', p.oi).speedSp
    runEntry(batch, fresh)
    applyEntryNarrowing(batch)
    return true
  }
  const entryObsOf = (mi: number, oi: number) =>
    state.value?.entryObs?.[entryKey(mi, oi)] ?? 'unknown'

  // ── 쓰러진 뒤 교체 ─────────────
  // 교체할 수 있는 포켓몬: 내 쪽 = 남은 선출, 상대 = 공개된 포켓몬 + (공개 수가 선출 수보다 적으면) 아직 안 나온 파티
  const replaceOptions = (side: BattleSide) => {
    const s = state.value!
    if (side === 'mine') return benchOf('mine')
    const sd = s.sides.opp
    const pick = N === 1 ? 3 : 4
    return benchOf('opp').filter((i) => sd.revealed.includes(i) || sd.revealed.length < pick)
  }
  // 쓰러진 칸 (교체할 포켓몬이 있고, 예전 방식대로 교체 행동을 넣지 않은 칸)
  const pendingReplace = computed(() => {
    const s = state.value
    if (!s) return []
    const out: { side: BattleSide; slot: number }[] = []
    for (const side of ['mine', 'opp'] as const) {
      const opts = replaceOptions(side)
      s.sides[side].active.forEach((i, slot) => {
        const a = s.actions[side][slot]
        if (i == null || !isFainted(side, i) || !opts.length) return
        if (a?.kind === 'switch' && a.switchTo != null) return
        out.push({ side, slot })
      })
    }
    return out
  })

  // ── 배틀 결과 ─────────────
  // 한쪽 필드가 전부 쓰러졌고(비었고) 내보낼 포켓몬도 없으면 그쪽이 짐. 둘 다면 무승부. 진행 중이면 null
  // (상대는 공개 수가 선출 수보다 적으면 아직 안 나온 포켓몬이 있다고 봄 → replaceOptions)
  const battleResult = computed<'win' | 'lose' | 'draw' | null>(() => {
    const s = state.value
    if (!s) return null
    const out = (side: BattleSide) =>
      s.sides[side].active.every((i) => i == null || isFainted(side, i)) &&
      s.sides[side].active.some((i) => i != null) &&
      !replaceOptions(side).length
    const mine = out('mine')
    const opp = out('opp')
    return mine && opp ? 'draw' : mine ? 'lose' : opp ? 'win' : null
  })

  // ── 날씨 / 필드 / 공간 ─────────────
  function setWeather(
    key: Weather,
    opts: {
      permanent?: boolean
      source?: [BattleSide, number]
      item?: string
      by?: [BattleSide, number]
    } = {},
  ) {
    const w = state.value!.weather
    w.key = key
    w.cur = 0
    w.total = opts.item && WEATHER_ROCK[key] === opts.item ? EXTENDED_TURNS : BASE_TURNS
    w.permanent = !!opts.permanent
    w.source = opts.source || null
    w.by = opts.by ?? opts.source ?? null
  }
  function clearWeather() {
    Object.assign(state.value!.weather, {
      key: '',
      cur: 0,
      total: BASE_TURNS,
      permanent: false,
      source: null,
      by: null,
    })
  }
  function setTerrain(key: Terrain, item?: string, by?: [BattleSide, number]) {
    Object.assign(state.value!.terrain, {
      key,
      cur: 0,
      total: item === 'terrainextender' ? EXTENDED_TURNS : BASE_TURNS,
      by: by ?? null,
    })
  }
  const toggleWeather = (key: Weather) =>
    state.value!.weather.key === key ? clearWeather() : setWeather(key)
  const toggleTerrain = (key: Terrain) =>
    state.value!.terrain.key === key
      ? Object.assign(state.value!.terrain, { key: '', cur: 0 })
      : setTerrain(key)
  const toggleRoom = (key: string) => {
    const rooms = state.value!.rooms
    if (rooms[key]) delete rooms[key]
    else rooms[key] = { cur: 0, total: BASE_TURNS }
  }
  // 경과 턴 수동 조절. 최대치에서 더 올리면 연장(8턴)으로 전환 (지속 연장 도구를 나중에 알게 된 경우)
  const adjustCounter = (c: Counter, delta: number) => {
    if (delta > 0 && c.cur >= c.total && c.total < EXTENDED_TURNS) c.total = EXTENDED_TURNS
    c.cur = Math.max(0, Math.min(c.total, c.cur + delta))
  }
  const toggleSideCondition = (side: BattleSide, key: string) => {
    const sd = state.value!.sides[side]
    if (SCREENS.has(key)) {
      if (sd.screens[key]) delete sd.screens[key]
      else sd.screens[key] = { cur: 0, total: SCREEN_TURNS[key] ?? BASE_TURNS }
    } else {
      const max = HAZARD_MAX[key] ?? 1
      const n = (sd.hazards[key] || 0) + 1
      if (n > max) delete sd.hazards[key]
      else sd.hazards[key] = n
    }
  }

  // ── 상태이상 / 특수상태 / 랭크 ─────────────
  const mon = (side: BattleSide, idx: number) => state.value!.sides[side].mons[idx]!
  const setStatus = (side: BattleSide, idx: number, st: Status) => {
    const m = mon(side, idx)
    m.status = m.status === st ? '' : st
    m.toxicTurn = 0
  }
  // 대타 HP = 최대 HP 1/4 (mine: 실수치, opp: %)
  const quarterHp = (side: BattleSide, idx: number) =>
    side === 'mine' ? Math.floor(maxHp(side, idx) / 4) : 25
  // 특수 상태를 새로 붙일 때의 값. betweenTurns = 턴 사이에 직접 켬
  //   (하품·반동은 "이번 턴 끝에 잠듦" / "이번 턴 행동 불가" 단계, 멸망의노래는 이미 턴 끝을 한 번 지난 카운트 3)
  const volatileStart = (side: BattleSide, idx: number, key: string, betweenTurns: boolean) => {
    if (key === 'substitute') return quarterHp(side, idx)
    if (key === 'perishsong') return betweenTurns ? 3 : 4
    if (key === 'yawn' || LOAF_VOLATILES.includes(key)) return betweenTurns ? 2 : 1
    return 1
  }
  const toggleVolatile = (side: BattleSide, idx: number, key: string) => {
    const m = mon(side, idx)
    // 비축은 누를 때마다 1 → 2 → 3 → 없음
    if (key === 'stockpile' && (m.volatiles[key] || 0) < 3)
      m.volatiles[key] = (m.volatiles[key] || 0) + 1
    else if (m.volatiles[key]) delete m.volatiles[key]
    else m.volatiles[key] = volatileStart(side, idx, key, true)
  }
  // 대타에 막히는가: 대상에게 대타가 있고, 자기 자신이 아니고, 대타를 무시하는 기술(소리 기술 등)·틈새포착이 아님
  const behindSub = (
    side: BattleSide,
    userIdx: number,
    tSide: BattleSide,
    tIdx: number,
    moveId: string,
  ) =>
    !!mon(tSide, tIdx).volatiles.substitute &&
    !(tSide === side && tIdx === userIdx) &&
    !gd.move(moveId)?.flags.includes('bypasssub') &&
    resolveAt(side, userIdx)?.ability !== 'infiltrator'
  // 필드에 소란 중인 포켓몬이 있는가 (그동안 잠들지 않음)
  const uproarOn = () =>
    (['mine', 'opp'] as const).some((sd) =>
      state.value!.sides[sd].active.some(
        (i) => i != null && !isFainted(sd, i) && !!mon(sd, i).volatiles.uproar,
      ),
    )
  const changeBoost = (side: BattleSide, idx: number, key: RankKey, delta: number) => {
    const m = mon(side, idx)
    m.boosts[key] = clampBoost((m.boosts[key] ?? 0) + delta)
  }
  const toggleItemGone = (side: BattleSide, idx: number) => {
    const m = mon(side, idx)
    m.itemGone = !m.itemGone
  }
  const setAlt = (side: BattleSide, idx: number, on: boolean) => {
    mon(side, idx).alt = on
  }
  // 메가진화는 배틀에 한 번 (진영당): 한 마리가 메가진화하면 다른 포켓몬은 메가진화할 수 없다
  const sideMegaUsed = (side: BattleSide) => state.value!.sides[side].mons.some((m) => m.megaUsed)
  const canMegaEvolve = (side: BattleSide, idx: number) =>
    !mon(side, idx).megaUsed && !sideMegaUsed(side) && !!resolveAt(side, idx, true)?.isMega
  const setMega = (side: BattleSide, idx: number, on: boolean) => {
    const m = mon(side, idx)
    if (m.megaUsed || (on && sideMegaUsed(side))) return
    m.megaOn = on
    if (on && state.value!.sides[side].active.includes(idx)) onEnter(side, idx) // 메가진화로 특성이 바뀌면 날씨 등 재발동
  }

  // 기술 효과 자동 반영 (랭크 / 날씨 / 필드 / 공간 / 설치형)
  // 상태이상을 걸 수 있는지: 이미 상태이상 / 타입(전기 마비, 불꽃 화상, 독·강철 독, 얼음 얼음) / 특성 / 신비의부적 / 미스트필드
  const STATUS_TYPE_IMMUNE: Record<string, string[]> = {
    par: ['electric'],
    brn: ['fire'],
    psn: ['poison', 'steel'],
    tox: ['poison', 'steel'],
    frz: ['ice'],
  }
  const STATUS_ABILITY_IMMUNE: Record<string, string[]> = {
    par: ['limber'],
    brn: ['waterveil', 'waterbubble', 'thermalexchange'],
    psn: ['immunity'],
    tox: ['immunity'],
    slp: ['insomnia', 'vitalspirit'],
    frz: ['magmaarmor'],
  }
  // ── 턴 끝 회복·데미지 ─────────────
  // 상태이상 데미지(독·화상)는 따로. frac: 최대 HP 대비 (+ 회복 / − 데미지).
  //   날씨 특성: 젖은접시(비 +1/16) 아이스바디(설경 +1/16) 건조피부(비 +1/8, 쾌청 −1/8) / 포이즌힐(독 +1/8)
  //   그래스필드(땅에 있음 +1/16) / 도구: 먹다남은음식 +1/16, 검은진흙(독 타입 +1/16, 아니면 −1/8)
  //     — 상대는 도구가 확인됐을 때만 (itemKnown), 도구를 잃었거나 매직룸·서투름이면 없음
  //   아쿠아링·뿌리박기 +1/16 / 씨뿌리기 −1/8 (심은 상대가 그만큼 회복, 해감액이면 그쪽이 데미지)
  //   저주 −1/4 / 악몽(잠듦) −1/4 / 소금절이 −1/16 (물·강철 −1/8)
  //   모래바람 −1/16 (바위·땅·강철, 모래 특성·방진, 방진고글 제외) / 날씨부정·에어록이 필드에 있으면 날씨 효과 없음
  //   회복봉인이면 회복 없음, 매직가드면 데미지 없음
  type Residual = { key: string; frac: number }
  function residualPlan(side: BattleSide, idx: number): Residual[] {
    const s = state.value!
    const m = mon(side, idx)
    const r = resolveAt(side, idx)
    if (!r || m.hp <= 0) return []
    const out: Residual[] = []
    const ab = r.ability
    // 날씨부정·에어록이 필드에 있으면 날씨 효과 없음
    const noWeather = (['mine', 'opp'] as const).some((sd) =>
      s.sides[sd].active.some(
        (i) =>
          i != null &&
          !isFainted(sd, i) &&
          ['cloudnine', 'airlock'].includes(resolveAt(sd, i)?.ability ?? ''),
      ),
    )
    // 이번 턴 끝에 끝나는 날씨는 효과 없이 가라앉는다 (모래바람이 그친 턴은 데미지 없음)
    const ending = !s.weather.permanent && s.weather.cur + 1 >= s.weather.total
    const w = noWeather || ending ? '' : s.weather.key
    const rain = w === 'rain' || w === 'heavyrain'
    const sun = w === 'sun' || w === 'harshsun'
    if (ab === 'raindish' && rain) out.push({ key: 'raindish', frac: 1 / 16 })
    if (ab === 'icebody' && w === 'snow') out.push({ key: 'icebody', frac: 1 / 16 })
    if (ab === 'dryskin' && rain) out.push({ key: 'dryskin', frac: 1 / 8 })
    if (ab === 'dryskin' && sun) out.push({ key: 'dryskin', frac: -1 / 8 })
    // 모래바람: 바위·땅·강철 타입과 모래숨기·모래헤치기·모래의힘·방진·매직가드, 방진고글이면 없음
    if (
      w === 'sand' &&
      !r.species.types.some((t) => t === 'rock' || t === 'ground' || t === 'steel') &&
      !['sandveil', 'sandrush', 'sandforce', 'overcoat'].includes(ab) &&
      !(r.slot.item === 'safetygoggles' && !m.itemGone)
    )
      out.push({ key: 'sand', frac: -1 / 16 })
    if (ab === 'poisonheal' && (m.status === 'psn' || m.status === 'tox'))
      out.push({ key: 'poisonheal', frac: 1 / 8 })
    const c = combatantOf(side, idx)
    if (s.terrain.key === 'grassy' && c && isGrounded(c, fieldFor(side, idx)))
      out.push({ key: 'grassy', frac: 1 / 16 })
    const item = r.slot.item
    const itemOn =
      !m.itemGone && !s.rooms.magicroom && ab !== 'klutz' && (side === 'mine' || !!m.itemKnown)
    if (itemOn && item === 'leftovers') out.push({ key: 'leftovers', frac: 1 / 16 })
    if (itemOn && item === 'blacksludge')
      out.push({
        key: 'blacksludge',
        frac: r.species.types.includes('poison') ? 1 / 16 : -1 / 8,
      })
    if (m.volatiles.aquaring) out.push({ key: 'aquaring', frac: 1 / 16 })
    if (m.volatiles.ingrain) out.push({ key: 'ingrain', frac: 1 / 16 })
    if (m.volatiles.leechseed) out.push({ key: 'leechseed', frac: -1 / 8 })
    // 조이기류(김밥말이·회오리불꽃 등) 1/8
    if (m.volatiles.partiallytrapped) out.push({ key: 'partiallytrapped', frac: -1 / 8 })
    // 저주(고스트) 1/4, 악몽(잠듦) 1/4, 소금절이 1/16 (물·강철 1/8) — 챔피언스 수치
    if (m.volatiles.curse) out.push({ key: 'curse', frac: -1 / 4 })
    if (m.volatiles.nightmare && m.status === 'slp') out.push({ key: 'nightmare', frac: -1 / 4 })
    if (m.volatiles.saltcure)
      out.push({
        key: 'saltcure',
        frac: r.species.types.some((t) => t === 'water' || t === 'steel') ? -1 / 8 : -1 / 16,
      })
    return out.filter(
      (x) => (x.frac > 0 ? !m.volatiles.healblock : ab !== 'magicguard') && x.frac !== 0,
    )
  }
  // HP 를 최대 HP 의 frac 만큼 바꾸고 바뀐 실제 HP 를 돌려줌 (mine: 실수치, opp: %)
  function changeHpFrac(side: BattleSide, idx: number, frac: number): number {
    const m = mon(side, idx)
    const max = maxHp(side, idx)
    if (!max) return 0
    const amount = Math.max(1, Math.floor(max * Math.abs(frac)))
    const before = m.hp
    if (side === 'mine') m.hp = Math.max(0, Math.min(max, m.hp + Math.sign(frac) * amount))
    else m.hp = Math.max(0, Math.min(100, m.hp + (Math.sign(frac) * amount * 100) / max))
    const diff = Math.abs(m.hp - before)
    return side === 'mine' ? diff : (diff / 100) * max
  }
  // 실제 HP(hp) 만큼 회복 (씨뿌리기 흡수)
  function healHp(side: BattleSide, idx: number, hp: number) {
    const m = mon(side, idx)
    const max = maxHp(side, idx)
    if (!max || m.hp <= 0 || hp <= 0) return
    if (side === 'mine') m.hp = Math.min(max, m.hp + Math.round(hp))
    else m.hp = Math.min(100, m.hp + (hp / max) * 100)
  }
  // 실제 HP(hp) 만큼 잃음 (반동·접촉 데미지·HP 소모 등). 상대는 추정 최대 HP 기준 %. 절반 이하가 되면 회복 열매
  function loseHp(side: BattleSide, idx: number, hp: number) {
    const m = mon(side, idx)
    const max = maxHp(side, idx)
    if (!max || m.hp <= 0 || hp <= 0) return
    if (side === 'mine') m.hp = Math.max(0, m.hp - Math.round(hp))
    else m.hp = Math.max(0, m.hp - (hp / max) * 100)
    checkBerry(side, idx)
  }
  // 실제 HP 로 (상대는 % → 추정 최대 HP 기준)
  const realHp = (side: BattleSide, idx: number, units: number) =>
    side === 'mine' ? units : Math.round((units / 100) * maxHp(side, idx))
  // 효과를 내는 지닌 도구 (도구 잃음·매직룸·서투름이면 없음, 상대는 확정 도구만 — battleSlot)
  const heldItem = (side: BattleSide, idx: number) => {
    const r = resolveAt(side, idx)
    if (!r || mon(side, idx).itemGone || state.value!.rooms.magicroom || r.ability === 'klutz')
      return ''
    return r.slot.item
  }
  // 회복 열매: HP 가 절반 이하가 되면 자뭉열매 최대 HP 1/4, 오랭열매 10 (숙성 2배, 볼주머니 +1/3).
  // 상대 필드에 긴장감이 있거나 회복봉인이면 먹지 않음
  const UNNERVE = new Set(['unnerve', 'asoneglastrier', 'asonespectrier'])
  function checkBerry(side: BattleSide, idx: number) {
    const m = mon(side, idx)
    const r = resolveAt(side, idx)
    const max = maxHp(side, idx)
    if (!r || m.hp <= 0 || !max || m.volatiles.healblock) return
    const item = heldItem(side, idx)
    if (item !== 'sitrusberry' && item !== 'oranberry') return
    if (side === 'mine' ? m.hp * 2 > max : m.hp > 50) return
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const unnerved = state.value!.sides[foe].active.some(
      (i) => i != null && !isFainted(foe, i) && UNNERVE.has(resolveAt(foe, i)?.ability || ''),
    )
    if (unnerved) return
    let amt = item === 'sitrusberry' ? Math.floor(max / 4) : 10
    if (r.ability === 'ripen') amt *= 2
    m.itemGone = true
    healHp(side, idx, amt)
    if (r.ability === 'cheekpouch') healHp(side, idx, Math.floor(max / 3))
  }
  // 빼앗아 회복 (흡수기·힘흡수): 큰뿌리 1.3배, 회복봉인이면 없음, 대상이 해감액이면 그만큼 데미지(매직가드면 없음)
  function absorbHeal(
    side: BattleSide,
    userIdx: number,
    foe: BattleSide,
    tIdx: number,
    hp: number,
  ) {
    const u = mon(side, userIdx)
    if (hp <= 0 || u.hp <= 0) return
    const ur = resolveAt(side, userIdx)
    if (resolveAt(foe, tIdx)?.ability === 'liquidooze') {
      if (ur?.ability !== 'magicguard') loseHp(side, userIdx, hp)
      return
    }
    if (u.volatiles.healblock) return
    const amt = heldItem(side, userIdx) === 'bigroot' ? Math.floor((hp * 5324 + 2047) / 4096) : hp
    healHp(side, userIdx, amt)
  }
  // log: 이 포켓몬 HP 를 바꾼 비율 (턴 끝 HP 관측용)
  function applyResidual(side: BattleSide, idx: number, log?: HpStep[]) {
    const s = state.value!
    for (const x of residualPlan(side, idx)) {
      if (mon(side, idx).hp <= 0) break
      log?.push({ frac: x.frac })
      const lost = changeHpFrac(side, idx, x.frac)
      if (x.key !== 'leechseed') continue
      // 씨뿌리기: 심은 쪽 칸의 포켓몬이 뺏은 만큼 회복 (해감액이면 데미지)
      const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
      const act = s.sides[foe].active
      const to = act[mon(side, idx).seedFrom ?? 0] ?? act.find((i) => i != null)
      if (to == null || isFainted(foe, to)) continue
      if (resolveAt(side, idx)?.ability === 'liquidooze') {
        const max = maxHp(foe, to)
        if (max) changeHpFrac(foe, to, -lost / max)
      } else if (!mon(foe, to).volatiles.healblock) healHp(foe, to, lost)
    }
  }
  // 상대 도구 확정 (이번 턴 행동 입력 중 도구가 드러났을 때: 먹다남은음식 회복·하양허브·그라운드코트 등).
  // 배틀 상태에만 저장 (선출 화면 파티의 도구는 그대로) → 이번 턴 처리부터 반영 (턴 끝 회복 등). item = '' 이면 확정 취소
  // (그라운드코트·바위는 그 포켓몬이 깐 필드·날씨만 연장. 깐 포켓몬을 모르면(직접 켬) 연장한다고 본다)
  const confirmItem = (side: BattleSide, idx: number, item: string) => {
    const m = mon(side, idx)
    if (!slotsOf(side)[idx]) return
    if (!item) {
      m.itemKnown = false
      delete m.item
      if (side === 'opp') refreshEntry(idx, () => false)
      return
    }
    m.item = item
    m.itemGone = false
    m.itemKnown = true
    // 스카프 여부가 정해져 동시 등장 특성 발동 순서가 확정될 수 있음 (연장 바위·그라운드코트 처리보다 먼저)
    if (side === 'opp') refreshEntry(idx, () => false)
    // 그라운드코트·날씨 연장 바위: 이 포켓몬이 깐 필드·날씨가 5턴이면 8턴으로 (안 끝나는 걸 보고 확정하는 경우)
    const st = state.value!
    const mine = (by?: [BattleSide, number] | null) => !by || (by[0] === side && by[1] === idx)
    const tr = st.terrain
    if (item === 'terrainextender' && tr.key && tr.total === BASE_TURNS && mine(tr.by))
      tr.total = EXTENDED_TURNS
    const w = st.weather
    if (
      w.key &&
      !w.permanent &&
      WEATHER_ROCK[w.key] === item &&
      w.total === BASE_TURNS &&
      mine(w.by)
    )
      w.total = EXTENDED_TURNS
  }

  // 기술 자체의 HP 효과 (회복기·HP 소모·자기 기절·아픔나누기·힘흡수·희망사항 등). hitTargets: 맞은 상대 칸,
  // hit: 기술이 나갔는지 (빗나감·실패면 false), blocked: 대타에 막힌 상대
  const WEATHER_HEAL = new Set(['synthesis', 'morningsun', 'moonlight'])
  function hpMoveEffects(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    hitTargets: number[],
    hit: boolean,
    blocked: (tIdx: number) => boolean,
  ) {
    const s = state.value!
    const move = gd.move(moveId)
    const r = resolveAt(side, userIdx)
    if (!move || !r) return
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const um = mon(side, userIdx)
    const max = maxHp(side, userIdx)
    const cur = realHp(side, userIdx, um.hp)
    const slot = s.sides[side].active.indexOf(userIdx)
    const faint = () => (um.hp = 0)
    // 쓰기만 하면 (빗나가도): 철제광선 최대 HP 1/2(반올림, 매직가드 제외), 대폭발·자폭은 쓰러짐
    if (moveId === 'steelbeam' && r.ability !== 'magicguard')
      loseHp(side, userIdx, Math.round(max / 2))
    // 습기가 필드에 있으면 대폭발·자폭은 실패 (틀깨기면 무시)
    const damp = (['mine', 'opp'] as const).some((sd) =>
      s.sides[sd].active.some(
        (i) => i != null && !isFainted(sd, i) && resolveAt(sd, i)?.ability === 'damp',
      ),
    )
    if (
      (moveId === 'explosion' || moveId === 'selfdestruct') &&
      (!damp || r.ability === 'moldbreaker')
    )
      faint()
    if (!hit) return
    // 회복기: HP회복·날개쉬기 등 1/2, 생명의물방울 1/4 (아군도), 광합성·아침햇살·달의불빛은 날씨에 따라,
    // 꿀꺽은 비축 수에 따라 (1 → 1/4, 2 → 1/2, 3 → 전부). 회복봉인이면 없음
    const healEff = move.effects.find((e) => e.type === 'heal')
    let ratio = healEff?.type === 'heal' ? healEff.ratio : 0
    if (WEATHER_HEAL.has(moveId)) {
      const w = fieldFor(side, userIdx).weather ?? ''
      ratio = w === 'sun' || w === 'harshsun' ? 2 / 3 : w ? 1 / 4 : 1 / 2
    }
    if (moveId === 'swallow') ratio = [0, 1 / 4, 1 / 2, 1][um.volatiles.stockpile || 0] ?? 0
    if (ratio) {
      const ally = moveId === 'lifedew' ? allyOf(side, slot) : null
      for (const i of [userIdx, ally]) {
        if (i == null || isFainted(side, i) || mon(side, i).volatiles.healblock) continue
        healHp(side, i, Math.round(maxHp(side, i) * ratio))
      }
    }
    // 치유파동: 대상 1/2 (메가런처 3/4)
    if (moveId === 'healpulse')
      for (const tIdx of hitTargets)
        if (!mon(foe, tIdx).volatiles.healblock)
          healHp(
            foe,
            tIdx,
            Math.round(maxHp(foe, tIdx) * (r.ability === 'megalauncher' ? 0.75 : 0.5)),
          )
    // HP 소모: 배수의진 1/2 → 공격 최대 (HP 가 1/2 이하이거나 이미 최대면 실패), 스케일노이즈 1/3 (1/3 이하면 실패),
    // 저주(고스트 타입) 1/2 → 대상 저주. 고스트가 아니면 공격·방어 +1, 스피드 −1
    if (moveId === 'bellydrum') {
      const cost = Math.floor(max / 2)
      if (cur > cost && um.boosts.atk < 6) {
        loseHp(side, userIdx, cost)
        statChange(side, userIdx, 'atk', 12)
      }
    }
    if (moveId === 'clangoroussoul' && cur > Math.floor(max / 3))
      loseHp(side, userIdx, Math.floor(max / 3))
    if (moveId === 'curse') {
      if (r.species.types.includes('ghost')) {
        const tIdx = hitTargets[0]
        if (tIdx != null && !mon(foe, tIdx).volatiles.curse) {
          loseHp(side, userIdx, Math.floor(max / 2))
          mon(foe, tIdx).volatiles.curse = 1
        }
      } else {
        statChange(side, userIdx, 'atk', 1, undefined, true)
        statChange(side, userIdx, 'def', 1, undefined, true)
        statChange(side, userIdx, 'spe', -1)
      }
    }
    // 아픔나누기: 둘의 HP 합의 절반으로 (대타면 실패). 상대 HP 는 추정 최대 HP 기준
    if (moveId === 'painsplit')
      for (const tIdx of hitTargets) {
        if (blocked(tIdx)) continue
        const t = mon(foe, tIdx)
        const avg = Math.floor((cur + realHp(foe, tIdx, t.hp)) / 2)
        const set = (sd: BattleSide, i: number) => {
          const mx = maxHp(sd, i)
          mon(sd, i).hp = sd === 'mine' ? Math.min(mx, avg) : Math.min(100, (avg / (mx || 1)) * 100)
        }
        set(side, userIdx)
        set(foe, tIdx)
        checkBerry(side, userIdx)
        checkBerry(foe, tIdx)
      }
    // 힘흡수: 대상의 공격 실능치(랭크 반영)만큼 회복하고 대상 공격 −1 (이미 −6 이거나 대타면 실패)
    if (moveId === 'strengthsap')
      for (const tIdx of hitTargets) {
        const t = mon(foe, tIdx)
        if (blocked(tIdx) || (t.boosts.atk ?? 0) <= -6) continue
        const atk = applyBoost(resolveAt(foe, tIdx)?.stats.atk ?? 0, t.boosts.atk ?? 0)
        statChange(foe, tIdx, 'atk', -1, [side, userIdx])
        absorbHeal(side, userIdx, foe, tIdx, atk)
      }
    // 희망사항: 다음 턴 끝에 이 칸의 포켓몬이 쓴 포켓몬 최대 HP 1/2 회복 (이미 걸려 있으면 실패)
    if (moveId === 'wish' && slot >= 0) {
      const w = (s.sides[side].wishes ??= {})
      if (!w[slot]) w[slot] = { turn: s.turn, hp: Math.floor(max / 2) }
    }
    // 자기 기절: 추억의선물·목숨던지기 (맞혔을 때), 치유소원 (교체할 포켓몬이 있을 때 → 다음에 나오는 포켓몬 전부 회복)
    if ((moveId === 'memento' || moveId === 'finalgambit') && hitTargets.length) faint()
    if (moveId === 'healingwish' && replaceOptions(side).length && slot >= 0) {
      faint()
      const hw = (s.sides[side].healingWish ??= [])
      if (!hw.includes(slot)) hw.push(slot)
    }
  }

  // 상대 특성 확정 ('' = 확정 취소). 특성이 바뀌면: 이 포켓몬의 예전 특성이 깐 날씨·필드는 지우고,
  // 방금 나온 포켓몬(이번 턴 또는 지난 턴에 등장)이면 새 특성의 등장 효과(날씨·필드·위협)를 지금 적용.
  // 동시 등장 묶음에 들어 있으면 짝·발동 순서도 다시 계산. 잘못 추측해 이미 적용된 위협은 되돌리지 않음 (랭크를 직접 고침)
  const confirmAbility = (idx: number, ability: string) => {
    const s = state.value!
    const m = mon('opp', idx)
    if (!slotsOf('opp')[idx]) return
    const before = resolveAt('opp', idx)?.ability ?? ''
    if (ability) Object.assign(m, { ability, abilityKnown: true })
    else {
      m.abilityKnown = false
      delete m.ability
    }
    const after = resolveAt('opp', idx)?.ability ?? ''
    if (after === before) return
    const own = (by?: [BattleSide, number] | null) => !!by && by[0] === 'opp' && by[1] === idx
    if (WEATHER_ABILITY[before] === s.weather.key && own(s.weather.by) && !s.weather.permanent)
      clearWeather()
    if (TERRAIN_ABILITY[before] === s.terrain.key && own(s.terrain.by))
      Object.assign(s.terrain, { key: '', cur: 0, total: BASE_TURNS, by: null })
    const active = s.sides.opp.active.includes(idx) && !isFainted('opp', idx)
    if (!active || m.enteredTurn < s.turn - 1) return
    if (!refreshEntry(idx, (sd, i) => sd === 'opp' && i === idx)) onEnter('opp', idx, true)
  }

  // 흡수기 (기가드레인·드레인펀치·드레인키스 등): 대상이 실제로 잃은 HP(쓰러뜨리면 남은 HP까지, 대타면 대타가 받은 만큼)의
  // ratio 만큼 회복 (반올림, 최소 1). 큰뿌리 1.3배, 회복봉인이면 없음, 대상이 해감액이면 그만큼 데미지(매직가드면 없음).
  // lost: 대상 단위 (상대 = %, 내 쪽 = 실수치). 상대 HP 실수치는 추정 최대 HP 기준
  function drainHeal(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    foe: BattleSide,
    tIdx: number,
    lost: number,
  ) {
    const eff = gd.move(moveId)?.effects.find((e) => e.type === 'drain')
    const ratio = eff?.type === 'drain' ? eff.ratio : 0
    if (!ratio || lost <= 0) return
    const dealt = realHp(foe, tIdx, lost)
    if (dealt > 0) absorbHeal(side, userIdx, foe, tIdx, Math.max(1, Math.round(dealt * ratio)))
  }

  // 내 흡수기의 회복량을 보고 입력할 수 있는지: 흡수기 + HP 가 덜 참 + 회복봉인·해감액 아님
  const drainSeen = (ui: number, ti: number, moveId: string) => {
    const m = mon('mine', ui)
    return (
      !!gd.move(moveId)?.effects.some((e) => e.type === 'drain') &&
      m.hp > 0 &&
      m.hp < maxHp('mine', ui) &&
      !m.volatiles.healblock &&
      resolveAt('opp', ti)?.ability !== 'liquidooze'
    )
  }
  // 행동 칸에 흡수 후 HP 입력을 보여 줄지 (맞는 상대 = 교체로 들어오는 포켓몬 포함)
  const drainObservable = (slot: number) => {
    const s = state.value!
    const a = s.actions.mine[slot]
    const ui = s.sides.mine.active[slot]
    if (a?.kind !== 'move' || ui == null || a.missed) return false
    const ti = hitTarget('mine', slot, turnOrder()).idx
    return ti != null && drainSeen(ui, ti, a.move)
  }
  // 실행 중 (맞기 직전 상태): 입력한 흡수 후 HP, 쓸 수 없으면 null
  const drainAfterOf = (side: BattleSide, ui: number, ti: number, a: ActionState) =>
    side === 'mine' && typeof a.drainAfter === 'number' && drainSeen(ui, ti, a.move)
      ? a.drainAfter
      : null

  // ── 공격한 쪽 HP 변화 ─────────────
  // 기술을 쓴 뒤 (맞힌 데미지 합 dealt, 실수치): 반동(돌머리·매직가드 제외, 반올림 최소 1) → 생명의구슬(최대 HP 1/10,
  // 매직가드·우격다짐으로 부가효과가 없어진 기술 제외) → 조개껍질방울(1/8 회복, 회복봉인 제외)
  function afterAttack(moveId: string, side: BattleSide, userIdx: number, dealt: number) {
    const move = gd.move(moveId)
    const r = resolveAt(side, userIdx)
    if (!move || !r || dealt <= 0 || isFainted(side, userIdx)) return
    const ab = r.ability
    const recoil = move.effects.find((e) => e.type === 'recoil')
    if (recoil?.type === 'recoil' && ab !== 'rockhead' && ab !== 'magicguard')
      loseHp(side, userIdx, Math.max(1, Math.round(dealt * recoil.ratio)))
    const item = heldItem(side, userIdx)
    const max = maxHp(side, userIdx)
    if (
      item === 'lifeorb' &&
      ab !== 'magicguard' &&
      !(ab === 'sheerforce' && hasSecondary(move)) &&
      !isFainted(side, userIdx)
    )
      loseHp(side, userIdx, Math.max(1, Math.floor(max / 10)))
    if (item === 'shellbell' && !mon(side, userIdx).volatiles.healblock)
      healHp(side, userIdx, Math.max(1, Math.floor(dealt / 8)))
  }
  // 맞은 쪽 때문에 공격한 쪽이 잃는 HP: 접촉이면 까칠한피부 1/8·울퉁불퉁멧 1/6 (타수만큼, 가변 타수는 1타로),
  // 쓰러뜨리면 유폭(접촉) 1/4·내용물분출(맞기 전 HP 만큼). 매직가드면 없음
  function hitPunish(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    foe: BattleSide,
    tIdx: number,
    hpBefore: number,
  ) {
    const move = gd.move(moveId)
    const ur = resolveAt(side, userIdx)
    const tr = resolveAt(foe, tIdx)
    if (!move || !ur || !tr || isFainted(side, userIdx) || ur.ability === 'magicguard') return
    const max = maxHp(side, userIdx)
    const fainted = hpBefore > 0 && mon(foe, tIdx).hp <= 0
    let lose = 0
    if (move.flags.includes('contact')) {
      const atkC = combatantOf(side, userIdx, undefined, true)
      const info = atkC ? hitInfo(move, atkC, false) : null
      const hits = info && info.min === info.max ? info.max : 1
      if (tr.ability === 'roughskin' || tr.ability === 'ironbarbs')
        lose += Math.floor(max / 8) * hits
      if (heldItem(foe, tIdx) === 'rockyhelmet') lose += Math.floor(max / 6) * hits
      if (tr.ability === 'aftermath' && fainted) lose += Math.floor(max / 4)
    }
    if (tr.ability === 'innardsout' && fainted) lose += realHp(foe, tIdx, hpBefore)
    loseHp(side, userIdx, lose)
  }
  // 흡수 특성: 저수·건조피부(물), 축전(전기), 흙먹기(땅) 타입 기술을 맞으면 데미지 대신 최대 HP 1/4 회복
  const ABSORB_TYPE: Record<string, string> = {
    waterabsorb: 'water',
    dryskin: 'water',
    voltabsorb: 'electric',
    eartheater: 'ground',
  }
  function absorbAbility(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    foe: BattleSide,
    tIdx: number,
  ) {
    const tr = resolveAt(foe, tIdx)
    const want = tr ? ABSORB_TYPE[tr.ability] : undefined
    if (!want || isFainted(foe, tIdx) || mon(foe, tIdx).volatiles.healblock) return
    const atkC = combatantOf(side, userIdx, undefined, true)
    const defC = combatantOf(foe, tIdx)
    const c = atkC && defC ? calc.cell(moveId, atkC, defC, fieldFor(foe, tIdx)) : null
    if (c?.immune && c.type === want) healHp(foe, tIdx, Math.floor(maxHp(foe, tIdx) / 4))
  }

  const THAWS_TARGET = (moveId: string) => {
    const mv = gd.move(moveId)
    return !!mv && mv.category !== 'status' && (mv.type === 'fire' || THAW_MOVES.has(moveId))
  }

  // 상태이상에 걸릴 수 없는가 (이미 상태이상 / 타입·특성 면역 / 신비의부적 / 미스트필드, 잠듦은 일렉트릭필드도 — 땅에 있을 때)
  function statusBlocked(side: BattleSide, idx: number, st: Exclude<Status, ''>) {
    const m = mon(side, idx)
    const r = resolveAt(side, idx)
    if (!r || m.status || m.hp <= 0) return true
    if (STATUS_TYPE_IMMUNE[st]?.some((t) => r.species.types.includes(t as never))) return true
    if ([...(STATUS_ABILITY_IMMUNE[st] ?? []), 'comatose', 'purifyingsalt'].includes(r.ability))
      return true
    const wk = state.value!.weather.key
    if (r.ability === 'leafguard' && (wk === 'sun' || wk === 'harshsun')) return true
    // 자신·아군의 특성: 스위트베일(잠듦) / 플라워베일(풀 타입)
    const teamAbilities = state
      .value!.sides[side].active.filter((i): i is number => i != null && !isFainted(side, i))
      .map((i) => resolveAt(side, i)?.ability)
    if (st === 'slp' && teamAbilities.includes('sweetveil')) return true
    if (st === 'slp' && r.ability !== 'soundproof' && uproarOn()) return true
    if (r.species.types.includes('grass' as never) && teamAbilities.includes('flowerveil'))
      return true
    if (state.value!.sides[side].screens.safeguard) return true
    const c = combatantOf(side, idx)
    const terrain = state.value!.terrain.key
    const grounded = !!c && isGrounded(c, fieldFor(side, idx))
    if (grounded && (terrain === 'misty' || (terrain === 'electric' && st === 'slp'))) return true
    return false
  }
  function inflictStatus(side: BattleSide, idx: number, st: Exclude<Status, ''>) {
    if (statusBlocked(side, idx, st)) return
    const m = mon(side, idx)
    m.status = st
    m.toxicTurn = 0
    m.restSleep = false
  }
  // 잠듦·얼음: 다음에 행동하려 할 때 풀릴 확률 (%). 잠듦·얼음이 아니면 null
  const wakeChance = (side: BattleSide, idx: number): number | null => {
    const m = mon(side, idx)
    if (m.status !== 'slp' && m.status !== 'frz') return null
    const table = m.status === 'slp' && m.restSleep ? WAKE_CHANCE.rest : WAKE_CHANCE[m.status]
    return table[m.toxicTurn] ?? 100
  }
  // 앙코르 중이면 쓸 수 있는 기술 (마지막으로 쓴 기술을 모르면 고정하지 않음 → '')
  const encoreMove = (side: BattleSide, idx: number) => {
    const m = mon(side, idx)
    return m.volatiles.encore && m.lastMove ? m.lastMove : ''
  }
  // 앙코르가 남은 턴 (이번 턴 포함)
  const encoreTurnsLeft = (side: BattleSide, idx: number) => {
    const v = mon(side, idx).volatiles.encore
    return v ? Math.max(1, VOLATILE_DURATION.encore! - v + 1) : 0
  }
  // ── PP ─────────────
  // 기술의 최대 PP (변신 중이면 복사한 기술이라 5) / 쓴 PP 기록 (변신 중이면 따로)
  const maxPp = (side: BattleSide, idx: number, moveId: string) =>
    mon(side, idx).transform ? TRANSFORM_PP : (gd.move(moveId)?.pp ?? 0)
  const ppUsedOf = (side: BattleSide, idx: number) => {
    const m = mon(side, idx)
    return (m.transform ? m.tfPpUsed : m.ppUsed) ?? {}
  }
  // n 만큼 PP 를 씀 (0 아래로는 안 내려감). 과사열매: PP 가 0 이 되면 10 회복하고 소모
  function spendPp(side: BattleSide, idx: number, moveId: string, n: number) {
    const m = mon(side, idx)
    const max = maxPp(side, idx, moveId)
    const used = { ...ppUsedOf(side, idx) }
    used[moveId] = Math.min(max || Infinity, (used[moveId] ?? 0) + n)
    if (max && used[moveId]! >= max && heldItem(side, idx) === 'leppaberry') {
      used[moveId] = max - Math.min(max, 10)
      m.itemGone = true
    }
    if (m.transform) m.tfPpUsed = used
    else m.ppUsed = used
  }
  // 잠듦인데 이번 시도에 풀릴 확률이 0% (잠든 뒤 첫 시도, 잠자기는 2번째까지) → 잠꼬대·코골기 외 기술은 나가지 않는다
  const sleepsThrough = (side: BattleSide, idx: number, moveId: string) =>
    !!moveId &&
    mon(side, idx).status === 'slp' &&
    !SLEEP_MOVES.has(moveId) &&
    wakeChance(side, idx) === 0
  // 하품: 졸음 상태로 (이미 졸음이거나 잠들 수 없으면 실패). 다음 턴 끝에 잠듦
  function inflictYawn(side: BattleSide, idx: number) {
    const m = mon(side, idx)
    if (m.volatiles.yawn || statusBlocked(side, idx, 'slp')) return
    m.volatiles.yawn = 1
  }

  // 기술의 효과 자동 반영. targets: 맞은 상대 칸들 (광역기면 여럿), hit: 기술이 맞았는지 (빗나감·실패·데미지 0 이면 false)
  //   랭크 변화·상태이상·혼란: 확정 효과와 확률 100% 부가효과만 (나머지 확률 효과는 "이번 턴 확률 효과"로 보여 주고 직접 입력)
  //   공격기의 효과는 맞혔을 때만, 상성상 무효인 상대에게는 없음. 부가효과는 우격다짐이면 없음, 맞는 쪽 인분이면 막음
  //   변화기는 황금몸이 막음. 반사 가능한 변화기는 매직미러가 쓴 쪽에게 되돌림 (틀깨기면 되돌리지 않음)
  function applyMoveEffects(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    targetIdx: number | null,
    targets: number[] = targetIdx == null ? [] : [targetIdx],
    hit = true,
  ) {
    const move = gd.move(moveId)
    if (!move) return
    const s = state.value!
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const user = resolveAt(side, userIdx)
    const damaging = move.category !== 'status'
    // 맞은 상대 (공격기는 상성 무효 제외, 변화기는 황금몸 제외)
    const hitTargets = !hit
      ? []
      : targets.filter((tIdx) => {
          const tr = resolveAt(foe, tIdx)
          if (!damaging) return tr?.ability !== 'goodasgold' || move.target === 'self'
          const atkC = combatantOf(side, userIdx, undefined, true)
          const defC = combatantOf(foe, tIdx)
          const c = atkC && defC ? calc.cell(moveId, atkC, defC, fieldFor(foe, tIdx)) : null
          return !c?.immune
        })
    // 매직미러: 이 상대 칸이 되돌리는지 / 상대 필드에 거는 기술(스텔스록 등)을 되돌리는지
    const reflectable =
      !damaging && move.flags.includes('reflectable') && user?.ability !== 'moldbreaker'
    const bounces = (tIdx: number) => reflectable && resolveAt(foe, tIdx)?.ability === 'magicbounce'
    const sideBounced = s.sides[foe].active.some(
      (i) => i != null && !isFainted(foe, i) && bounces(i),
    )
    // 대타: 상대에게 거는 효과(랭크 하락·상태이상·혼란·씨뿌리기·하품, 공격기 부가효과)를 막음 (매직미러로 되돌린 건 제외)
    const blocked = (tIdx: number) => !bounces(tIdx) && behindSub(side, userIdx, foe, tIdx, moveId)
    for (const e of move.effects as MoveEffect[]) {
      if (e.type === 'boost' || e.type === 'status' || e.type === 'volatile') {
        const chance = 'chance' in e ? e.chance : undefined
        if (chance && chance < 100) continue
        if (chance && user?.ability === 'sheerforce') continue
        const onSelf = e.target === 'self'
        // 공격기: 자기 효과(니트로차지 등)는 하나라도 맞혔을 때, 상대 효과는 맞은 상대에게
        if (damaging && !hitTargets.length) continue
        if (!damaging && !hit) continue
        // [받는 쪽, 칸, 건 쪽(상대가 내린 랭크면)] — 매직미러면 쓴 쪽이 받고 건 쪽은 매직미러 포켓몬
        const list: [BattleSide, number, [BattleSide, number] | undefined][] = onSelf
          ? [[side, userIdx, undefined]]
          : hitTargets
              .filter((tIdx) => !blocked(tIdx))
              .map((tIdx) =>
                bounces(tIdx) ? [side, userIdx, [foe, tIdx]] : [foe, tIdx, [side, userIdx]],
              )
        for (const [tSide, tIdx, src] of list) {
          if (!onSelf && chance && resolveAt(foe, tIdx)?.ability === 'shielddust') continue
          if (e.type === 'boost') {
            for (const [k, v] of Object.entries(e.stats)) {
              if (k in zeroBoosts()) statChange(tSide, tIdx, k as RankKey, v || 0, src, true)
            }
            whiteHerb(tSide, tIdx)
          } else if (e.type === 'status') inflictStatus(tSide, tIdx, e.status)
          else if (e.type === 'volatile' && e.status !== 'flinch') {
            // 혼란·도발·앙코르·트집·사슬묶기·헤롱헤롱·회복봉인·조이기류·문어굳히기·소금절이 (이미 걸렸으면 그대로)
            // 마이페이스는 혼란, 둔감은 도발·헤롱헤롱 무효
            const tm = mon(tSide, tIdx)
            const ab = resolveAt(tSide, tIdx)?.ability
            // 헤롱헤롱은 서로 다른 성별일 때만 (성별을 모르면 자동으로 걸지 않고 행동 아래 체크로)
            const other = src ?? [side, userIdx]
            const immune =
              (e.status === 'confusion' && ab === 'owntempo') ||
              ((e.status === 'taunt' || e.status === 'attract') && ab === 'oblivious') ||
              (e.status === 'attract' && attractable(other[0], other[1], tSide, tIdx) !== 'yes')
            if (!tm.volatiles[e.status] && !immune) tm.volatiles[e.status] = 1
          }
        }
      } else if (e.type === 'weather' && !s.weather.permanent)
        setWeather(e.key, { item: user?.slot.item, by: [side, userIdx] })
      else if (e.type === 'terrain') setTerrain(e.key, user?.slot.item, [side, userIdx])
      else if (e.type === 'room') s.rooms[e.key] = { cur: 0, total: BASE_TURNS }
      else if (e.type === 'side') {
        const sd = s.sides[e.side === 'self' || (e.side === 'foe' && sideBounced) ? side : foe]
        if (SCREENS.has(e.key)) {
          const ext =
            (e.key === 'reflect' || e.key === 'lightscreen' || e.key === 'auroraveil') &&
            user?.slot.item === 'lightclay'
          sd.screens[e.key] = {
            cur: 0,
            total: ext ? EXTENDED_TURNS : (SCREEN_TURNS[e.key] ?? BASE_TURNS),
          }
        } else
          sd.hazards[e.key] = Math.min(
            e.maxStack ?? HAZARD_MAX[e.key] ?? 1,
            (sd.hazards[e.key] || 0) + 1,
          )
      } else if (e.type === 'recharge' && hitTargets.length) {
        // 빗나가거나 무효면 반동 없음
        mon(side, userIdx).volatiles.mustrecharge = 1
      }
    }
    if (moveId === 'haze')
      for (const sd of Object.values(s.sides))
        for (const i of sd.active) if (i != null) sd.mons[i]!.boosts = zeroBoosts()
    if (moveId === 'fairylock') s.fairyLock = 2
    // 씨뿌리기: 맞은 상대에게 (풀 타입·이미 심어짐이면 실패, 매직미러면 쓴 쪽에게). 턴 끝에 1/8 흡수
    if (moveId === 'leechseed')
      for (const tIdx of hitTargets) {
        if (blocked(tIdx)) continue
        const bounce = bounces(tIdx)
        const [tSide, tI, fromSide] = bounce ? [side, userIdx, foe] : [foe, tIdx, side]
        const tm = mon(tSide, tI)
        if (tm.volatiles.leechseed || resolveAt(tSide, tI)?.species.types.includes('grass'))
          continue
        tm.volatiles.leechseed = 1
        const fromIdx = bounce ? tIdx : userIdx
        tm.seedFrom = Math.max(0, s.sides[fromSide].active.indexOf(fromIdx))
      }
    if (moveId === 'ingrain' || moveId === 'aquaring') mon(side, userIdx).volatiles[moveId] = 1
    // 하품: 맞은 상대를 졸음으로 (매직미러면 쓴 쪽에게 되돌아감)
    if (moveId === 'yawn')
      for (const tIdx of hitTargets) {
        if (blocked(tIdx)) continue
        if (bounces(tIdx)) inflictYawn(side, userIdx)
        else inflictYawn(foe, tIdx)
      }
    if (moveId === 'chillyreception')
      setWeather('snow', { item: user?.slot.item, by: [side, userIdx] })

    const um = mon(side, userIdx)
    hpMoveEffects(moveId, side, userIdx, hitTargets, hit, blocked)
    // 잠자기: HP 를 모두 회복하고 2턴 잠듦 (다른 상태이상은 풀림). HP 가 가득이거나 이미 잠듦·잠들 수 없으면 실패
    if (moveId === 'rest' && hit && um.status !== 'slp') {
      const max = side === 'mine' ? maxHp(side, userIdx) : 100
      const prev = um.status
      um.status = ''
      const blockedSleep = statusBlocked(side, userIdx, 'slp')
      um.status = prev
      if (um.hp < max && !blockedSleep)
        Object.assign(um, { hp: max, status: 'slp', toxicTurn: 0, restSleep: true })
    }
    // 대타출동: 최대 HP 1/4 를 깎아 대타 (HP 가 1/4 이하이거나 이미 대타면 실패)
    if (moveId === 'substitute' && hit && !um.volatiles.substitute) {
      const q = quarterHp(side, userIdx)
      if (um.hp > q) {
        um.hp -= q
        um.volatiles.substitute = q
      }
    }
    // 꼬리자르기: 최대 HP 1/2(올림)를 깎아 대타를 만듦 → 교체로 나오는 포켓몬이 대타를 받음 (교체 처리에서)
    if (moveId === 'shedtail' && hit && !um.volatiles.substitute) {
      const cost = side === 'mine' ? Math.ceil(maxHp(side, userIdx) / 2) : 50
      if (um.hp > cost) {
        um.hp -= cost
        um.volatiles.substitute = quarterHp(side, userIdx)
      }
    }
    // 멸망의노래: 필드의 모든 포켓몬이 카운트 3 (턴 끝마다 줄고 0 이면 쓰러짐). 방음은 쓴 포켓몬이 아니면 무효
    if (moveId === 'perishsong' && hit)
      for (const sd of ['mine', 'opp'] as const)
        for (const i of s.sides[sd].active) {
          if (i == null || isFainted(sd, i) || mon(sd, i).volatiles.perishsong) continue
          if (!(sd === side && i === userIdx) && resolveAt(sd, i)?.ability === 'soundproof')
            continue
          mon(sd, i).volatiles.perishsong = 4
        }
    // 전자부유: 5턴 동안 땅에 있지 않음 (뿌리박기·중력이면 실패)
    if (
      moveId === 'magnetrise' &&
      hit &&
      !um.volatiles.magnetrise &&
      !um.volatiles.ingrain &&
      !s.rooms.gravity
    )
      um.volatiles.magnetrise = 1
    // 소란: 3턴. 그동안 아무도 잠들지 않고 잠든 포켓몬은 깨어남 (방음 제외)
    if (moveId === 'uproar' && hitTargets.length && !um.volatiles.uproar) {
      um.volatiles.uproar = 1
      for (const sd of ['mine', 'opp'] as const)
        for (const i of s.sides[sd].active) {
          if (i == null || mon(sd, i).status !== 'slp') continue
          if (resolveAt(sd, i)?.ability !== 'soundproof')
            Object.assign(mon(sd, i), { status: '', toxicTurn: 0 })
        }
    }
  }

  // 데미지를 받은 직후 (입력한 데미지가 있을 때만). hpBefore 는 받기 전 HP (mine: 실수치, opp: %)
  //   도구: 반감열매(해당 타입 효과굉장, 노말은 그냥) / 풍선 / 기합의띠(만피에서 HP 1. 상대는 100% → 1% 이하로 남으면,
  //     도구를 확정하지 않았어도 추측 도구가 기합의띠면 확정하고 소모)
  //   맞은 쪽 특성: 분노의경혈(급소에 맞고 버티면 공격 +6) 지구력(방어+1) 깨어진갑옷(물리: 방어−1 스피드+2) 정의의마음(악: 공격+1) 열교환(불꽃: 공격+1)
  //     발끈(HP 절반 이하로: 특공+1) 모래뿜기(모래바람) 넘치는씨(그래스필드) 전기로바꾸기(충전) 독치장(물리: 공격 측에 독압정)
  //   공격한 쪽: 자기과신(쓰러뜨리면 공격+1)
  function onHit(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    tSide: BattleSide,
    targetIdx: number,
    hpBefore: number,
    crit = false, // 입력에서 급소 체크 (반드시 급소인 경우는 아래에서 판정)
  ) {
    const t = mon(tSide, targetIdx)
    const r = resolveAt(tSide, targetIdx)
    const move = gd.move(moveId)
    const atk = combatantOf(side, userIdx, undefined, true)
    const def = combatantOf(tSide, targetIdx)
    const c = atk && def && move ? calc.cell(moveId, atk, def, fieldFor(tSide, targetIdx)) : null
    if (!r || !move || !c || c.immune) return
    const full = tSide === 'mine' ? maxHp(tSide, targetIdx) : 100
    const alive = t.hp > 0
    const item = t.itemGone ? '' : r.slot.item
    if (item && RESIST_BERRIES[item] === c.type && (c.effectiveness > 1 || c.type === 'normal'))
      t.itemGone = true
    else if (item === 'airballoon') t.itemGone = true
    else if (item === 'focussash' && tSide === 'mine' && hpBefore >= full && t.hp === 1)
      t.itemGone = true
    else if (tSide === 'opp' && hpBefore >= full && t.hp > 0 && t.hp <= 1) {
      const sash = item === 'focussash' || (!item && guessedItem(targetIdx) === 'focussash')
      if (sash && !t.itemGone) {
        if (!t.itemKnown) Object.assign(t, { item: 'focussash', itemKnown: true })
        t.itemGone = true
      }
    }

    const ab = r.ability
    const physical = move.category === 'physical'
    // 둔갑(따라큐): 공격을 한 번 받으면 풀린 모습으로 (틀깨기 공격이면 둔갑은 그대로)
    if (ab === 'disguise' && !t.alt && atk?.ability !== 'moldbreaker') t.alt = true
    if (alive) {
      if (
        ab === 'angerpoint' &&
        (crit ||
          (!!atk && !!def && critChance(move, atk, def, attackOpts(side, userIdx, moveId)) >= 1))
      )
        t.boosts.atk = 6
      if (ab === 'stamina') statChange(tSide, targetIdx, 'def', 1)
      if (ab === 'weakarmor' && physical) {
        statChange(tSide, targetIdx, 'def', -1)
        statChange(tSide, targetIdx, 'spe', 2)
      }
      if (ab === 'justified' && c.type === 'dark') statChange(tSide, targetIdx, 'atk', 1)
      if (ab === 'thermalexchange' && c.type === 'fire') statChange(tSide, targetIdx, 'atk', 1)
      if (ab === 'berserk' && hpBefore * 2 > full && t.hp * 2 <= full)
        statChange(tSide, targetIdx, 'spa', 1)
      if (ab === 'electromorphosis') t.volatiles.charge = 1
    }
    if (ab === 'sandspit' && !state.value!.weather.permanent)
      setWeather('sand', { item, by: [tSide, targetIdx] })
    if (ab === 'seedsower') setTerrain('grassy', item, [tSide, targetIdx])
    if (ab === 'toxicdebris' && physical && side !== tSide) {
      const hz = state.value!.sides[side].hazards
      hz.toxicspikes = Math.min(2, (hz.toxicspikes || 0) + 1)
    }
    if (!alive && side !== tSide) {
      const u = resolveAt(side, userIdx)
      if (u?.ability === 'moxie') statChange(side, userIdx, 'atk', 1)
      // 천정부지(메가저리더프): 가장 높은 능력 +1
      if (u?.ability === 'eelevate') statChange(side, userIdx, highestStat(u.stats), 1)
    }
  }

  // 변화기 (데미지 입력이 없는 기술)
  const isStatusMove = (moveId: string) => gd.move(moveId)?.category === 'status'

  // ── 입력 검증 ─────────────
  const validationError = computed(() => {
    const s = state.value
    if (!s) return ''
    let err = ''
    if (battleResult.value) return 'battleOver'
    if (pendingReplace.value.length) return 'errReplace'
    // 깨어나지 못하는 시도는 입력이 쓰이지 않으므로 검사하지 않음
    const skipped = (side: BattleSide, slot: number) => {
      const ui = s.sides[side].active[slot]
      const act = s.actions[side][slot]!
      return ui != null && sleepsThrough(side, ui, act.via || act.move)
    }
    for (const [slot, a] of s.actions.mine.entries()) {
      if (a.kind !== 'move' || isStatusMove(a.move) || skipped('mine', slot)) continue
      for (const v of [a.amount, a.amount2]) if (v != null && (v < 0 || v > 100)) return 'errDealt'
    }
    const order = turnOrder()
    for (const [slot, a] of s.actions.opp.entries()) {
      if (a.kind !== 'move' || isStatusMove(a.move) || skipped('opp', slot)) continue
      const check = (v: number | null, k: number) => {
        if (v == null) return false
        // 맞는 포켓몬 (먼저 교체기로 물러난 칸이면 들어오는 포켓몬)
        const target = hitTarget('opp', slot, order, k).idx
        const max = target != null ? maxHp('mine', target) : 0
        return v < 0 || (!!max && v > max)
      }
      if (check(a.amount, a.target) || check(a.amount2, 1 - a.target)) return 'errTaken'
    }
    // 행동 불가(혼란 자해·기타)로 잃은 HP: mine 실수치 ≤ 최대 HP, opp % ≤ 100
    for (const side of ['mine', 'opp'] as const)
      s.actions[side].forEach((a, slot) => {
        const ui = s.sides[side].active[slot]
        if (a.kind !== 'cant' || a.amount == null || ui == null) return
        if (!CANT_DAMAGE_REASONS.has(a.cantReason)) return
        const max = side === 'mine' ? maxHp('mine', ui) : 100
        if (a.amount < 0 || (!!max && a.amount > max)) err ||= 'errSelf'
      })
    for (const side of ['mine', 'opp'] as const) {
      s.actions[side].forEach((a, slot) => {
        if (a.kind !== 'move' || a.allyAmount == null) return
        const ally = allyOf(side, slot)
        const max = side === 'mine' && ally != null ? maxHp('mine', ally) : 100
        if (a.allyAmount < 0 || a.allyAmount > max) err ||= 'errAlly'
      })
    }
    return err
  })

  // ── 턴 진행 ─────────────
  const snapshot = () => {
    const { history, ...rest } = state.value!
    return JSON.stringify(rest)
  }
  const canUndo = computed(() => (state.value?.history.length || 0) > 0)
  const undo = () => {
    const s = state.value
    const snap = s?.history.pop()
    if (!s || !snap) return
    state.value = { ...JSON.parse(snap), history: s.history }
  }

  function executeTurn() {
    const s = state.value
    if (!s || validationError.value) return
    s.history.push(snapshot())
    if (s.history.length > MAX_HISTORY) s.history.shift()
    // 지난 턴 끝 HP 를 게임 화면 값으로 고쳤으면 관측으로 저장 (HP 실능치 추정)
    for (const m of s.sides.opp.mons) {
      const o = hpCorrection(m.hpCheck, m.hp, s.turn)
      if (o) m.hpObs = [...(m.hpObs ?? []), o]
      m.hpCheck = null
    }
    // 턴 시작에 HP 가 가득 찬 상대 (화면 % 를 입력하기 전까지 HP 를 정확히 앎 → 턴 끝에 버림)
    const fullOpp = new Set<number>()
    s.sides.opp.mons.forEach((m, i) => {
      if (m.hp >= 100) fullOpp.add(i)
    })
    // 앙코르: 마지막으로 쓴 기술만 나간다 (화면에서도 고정, 여기서 한 번 더 맞춤)
    for (const side of ['mine', 'opp'] as const)
      s.actions[side].forEach((a, slot) => {
        const ui = s.sides[side].active[slot]
        const em = ui == null ? '' : encoreMove(side, ui)
        if (a.kind === 'move' && em && (a.via || a.move) !== em)
          Object.assign(a, { move: em, via: '' })
      })
    // 변화기는 데미지가 없음: 남아 있는 데미지 입력은 비움 (화면에서는 입력칸을 숨김)
    for (const side of ['mine', 'opp'] as const)
      for (const a of s.actions[side])
        if (a.kind === 'move' && isStatusMove(a.move))
          Object.assign(a, { amount: null, amount2: null, allyAmount: null, crit: false })
    const sides: BattleSide[] = ['mine', 'opp']
    // 선후공 관찰은 교체 전 필드 포켓몬 기준 (둘 다 교체하면 나가는 포켓몬끼리의 교체 순서)
    const speedObs = pendingSpeedObservation()

    // 1. 교체
    // 0. 이번 턴 기록 초기화
    for (const side of sides)
      for (const m of s.sides[side].mons)
        Object.assign(m, {
          turnDamaged: false,
          turnLowered: false,
          turnTaken: { physical: 0, special: 0, last: 0 },
        })
    // 고칠 수 있던 동시 등장(선두·쓰러진 뒤 교체)은 이제 확정
    s.entry = null
    // 양쪽이 같이 교체하면 들어온 포켓몬의 특성은 스피드 순 (관찰한 순서가 있으면 그대로 + 상대 스피드 구간 좁힘)
    const switching: [BattleSide, number][] = []
    for (const side of sides) {
      s.actions[side].forEach((a, slot) => {
        if (a.kind === 'switch' && a.switchTo != null && !s.fairyLock) {
          sendOut(side, slot, a.switchTo, 'switch', true)
          switching.push([side, a.switchTo])
        }
      })
    }
    if (switching.length) {
      const batch = newBatch(switching, copyField())
      runEntry(batch, () => true)
      applyEntryNarrowing(batch)
    }

    // 기술 단계 시작 때 필드에 있던 포켓몬 (도중에 유턴·드래곤테일 등으로 바뀐 칸은 행동 입력을 비움)
    const activeAtMoves = { mine: [...s.sides.mine.active], opp: [...s.sides.opp.active] }

    // 행동 불가: 이유가 잠듦·얼음·마비인데 상태이상이 없으면 그 상태이상으로 (관찰한 사실).
    // 기술이 안 나간 것은 "실패"가 아니므로 분함의발구르기·열불내기 2배 조건은 풀린다
    for (const side of sides)
      s.actions[side].forEach((a, slot) => {
        const ui = s.sides[side].active[slot]
        if (a.kind !== 'cant' || ui == null || isFainted(side, ui)) return
        const m = mon(side, ui)
        // 잠듦·얼음: 행동하지 못한 턴 수를 셈 (상태이상이 없었으면 이번 턴부터)
        if (a.cantReason === 'slp' || a.cantReason === 'frz') {
          if (m.status === a.cantReason) m.toxicTurn += 1
          else if (!m.status) Object.assign(m, { status: a.cantReason, toxicTurn: 1 })
        } else if (!m.status && a.cantReason === 'par')
          Object.assign(m, { status: 'par', toxicTurn: 0 })
        // 혼란 자해: 혼란이 안 붙어 있었으면 붙임 (관찰한 사실)
        if (a.cantReason === 'confusion' && !m.volatiles.confusion) m.volatiles.confusion = 1
        // 혼란 자해·기타로 잃은 HP
        if (CANT_DAMAGE_REASONS.has(a.cantReason) && a.amount && a.amount > 0) {
          m.hp = Math.max(0, m.hp - a.amount)
          if (side === 'opp') fullOpp.delete(ui)
        }
        m.lastFailed = false
      })

    // 2a. 메가진화 (기술보다 먼저 — 이번 턴 스피드에도 반영)
    for (const side of sides) {
      s.actions[side].forEach((a, slot) => {
        const userIdx = s.sides[side].active[slot]
        if (a.kind !== 'move' || !a.useMega || userIdx == null) return
        const m = mon(side, userIdx)
        // 더블에서 두 칸 모두 체크했으면 앞 칸만 (화면은 한 칸만 체크할 수 있게 막는다)
        if (canMegaEvolve(side, userIdx)) {
          m.megaOn = true
          m.megaUsed = true
          // 다른 포켓몬의 메가 미리보기는 끔 (더는 메가진화할 수 없음)
          s.sides[side].mons.forEach((x, i) => {
            if (i !== userIdx && !x.megaUsed) x.megaOn = false
          })
          onEnter(side, userIdx, true)
        }
      })
    }

    // 2b. 행동 순서 + 선후공 관찰로 상대 스피드 구간 좁히기 (변신한 상대는 복사한 스피드라 저장 안 함)
    const order = turnOrder()
    if (speedObs && speedObs.env.fixedStat == null) {
      const om = mon('opp', speedObs.oi)
      om.speedSp = narrowRanges(
        om.speedSp ?? fullRanges(),
        speedObs.base,
        speedObs.env,
        speedObs.mySpeed,
        speedObs.oppAtLeast,
      )
    }

    // 2c. 기술 (순서대로: 관측 기록 → 효과 → 입력한 데미지)
    order.forEach(({ side, slot, idx }) => {
      const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
      const a = s.actions[side][slot]!
      const userIdx = s.sides[side].active[slot]
      // 이번 턴 도중에 교체되어 들어온 포켓몬은 행동하지 않음
      if (a.kind !== 'move' || userIdx == null || userIdx !== idx || isFainted(side, userIdx))
        return
      // 잠듦인데 이번 시도에 풀릴 확률이 0% (잠든 뒤 첫 시도 — 이번 턴 먼저 잠든 경우 포함, 잠자기 2번째까지)면
      // 기술은 나가지 않는다 (잠꼬대·코골기 제외). 행동 불가(잠듦)로 셈
      const sleeper = mon(side, userIdx)
      // 잠꼬대·흉내내기로 부른 기술이면 caller = 부른 기술 (잠듦 판정·PP·앙코르는 caller 기준)
      const caller = a.via || a.move
      if (sleepsThrough(side, userIdx, caller)) {
        sleeper.toxicTurn += 1
        sleeper.lastFailed = false
        return
      }
      {
        const targetIdx = s.sides[foe].active[a.target] ?? null
        const user = mon(side, userIdx)
        // 이번 턴 데미지에 영향을 주는 그때의 보정 (행동 순서 포함) → 관측 기록
        if (
          a.move &&
          targetIdx != null &&
          a.amount &&
          a.amount > 0 &&
          !a.missed &&
          !behindSub(side, userIdx, foe, targetIdx, a.move)
        )
          recordObservation(
            side,
            a,
            userIdx,
            foe,
            targetIdx,
            actionOpts(side, slot, userIdx, a.move, order),
          )
        // 벽 깨기 (깨뜨리다·사이코팽·레이징불): 맞기 전에 대상 쪽 벽이 사라진다 (무효인 상대면 그대로)
        if (a.move && targetIdx != null && SCREEN_BREAKERS.has(a.move)) {
          const atkC = combatantOf(side, userIdx, undefined, true)
          const defC = combatantOf(foe, targetIdx)
          const c = atkC && defC ? calc.cell(a.move, atkC, defC, fieldFor(foe, targetIdx)) : null
          if (c && !c.immune)
            for (const k of ['reflect', 'lightscreen', 'auroraveil']) delete s.sides[foe].screens[k]
        }
        // 잠듦·얼음인데 기술을 썼으면 깨어남·녹음 (잠꼬대·코골기는 잠든 채로 씀 → 잠든 턴 수 +1)
        if (caller && user.status === 'slp' && SLEEP_MOVES.has(caller)) user.toxicTurn += 1
        if (
          caller &&
          (user.status === 'frz' || (user.status === 'slp' && !SLEEP_MOVES.has(caller)))
        )
          user.status = ''
        // 길동무: 다음에 기술을 쓰면 풀림 (이번에 또 쓰면 다시 붙음)
        if (a.move) delete user.volatiles.destinybond
        if (a.move === 'destinybond' && !a.missed) user.volatiles.destinybond = 1
        // 게으름: 기술을 쓰면(빗나가도) 다음 턴은 게으름을 피워 행동 불가
        if (a.move && resolveAt(side, userIdx)?.ability === 'truant') user.volatiles.truant = 1
        if (a.move) {
          // 메트로놈(도구) 연속 횟수
          if (user.lastMove === caller) user.moveStreak += 1
          else Object.assign(user, { lastMove: caller, moveStreak: 0 })
          const mv = gd.move(a.move)
          // PP: 빗나가도 1 (부른 기술이면 부른 기술에서). 상대를 노리는 기술이면 노린 상대(광역기는 필드의 상대 모두) 중 프레셔마다 1 더
          const foeTargets =
            !mv || !FOE_TARGETS.has(mv.target)
              ? []
              : mv.target === 'foeSide' || isSpreadMove(mv)
                ? s.sides[foe].active
                : [targetIdx]
          const pressure = foeTargets.filter(
            (i) => i != null && !isFainted(foe, i) && resolveAt(foe, i)?.ability === 'pressure',
          ).length
          spendPp(side, userIdx, caller, 1 + pressure)
          // 상대가 잠꼬대로 낸 기술은 그 상대의 기술 (흉내내기는 다른 포켓몬의 기술이라 아님)
          if (a.via === 'sleeptalk' && !user.transform && !(user.movesSeen ?? []).includes(a.move))
            user.movesSeen = [...(user.movesSeen ?? []), a.move]
          s.lastUsedMove = a.move
          // 충전은 전기 공격기를 쓰면 풀린다
          if (user.volatiles.charge && mv?.type === 'electric' && mv.category !== 'status')
            delete user.volatiles.charge
          // 맞은 상대: 대상 + (더블 광역기) 다른 상대 칸. 빗나감·데미지 0 이면 맞지 않음
          const other = N > 1 ? (s.sides[foe].active[1 - a.target] ?? null) : null
          const targets: number[] = []
          if (targetIdx != null && a.amount !== 0) targets.push(targetIdx)
          if (other != null && isSpreadMove(mv) && a.amount2 !== 0 && !isFainted(foe, other))
            targets.push(other)
          applyMoveEffects(a.move, side, userIdx, targetIdx, targets, !a.missed)
          // 원한: 대상이 마지막으로 쓴 기술 PP −4 / 으스스주문: 맞히면 −3
          const ppCut = a.move === 'spite' ? 4 : a.move === 'eeriespell' ? 3 : 0
          if (
            ppCut &&
            targetIdx != null &&
            !a.missed &&
            (a.move === 'spite' || targets.includes(targetIdx))
          ) {
            const tm = mon(foe, targetIdx)
            if (tm.lastMove && !isFainted(foe, targetIdx))
              spendPp(foe, targetIdx, tm.lastMove, ppCut)
          }
        }
        // 변신 기술: 대상 칸의 상대로 변신
        // 비축 / 토해내기·꿀꺽 / 기충전
        if (a.move === 'stockpile')
          user.volatiles.stockpile = Math.min(3, (user.volatiles.stockpile || 0) + 1)
        if (a.move === 'focusenergy') user.volatiles.focusenergy = 1
        // 빗나감·실패: 다음 턴 분함의발구르기·열불내기 2배, 무릎차기류는 최대 HP 1/2 반동
        user.lastFailed = !!a.missed
        if (
          a.missed &&
          CRASH_MOVES.has(a.move) &&
          resolveAt(side, userIdx)?.ability !== 'magicguard'
        ) {
          const max = maxHp(side, userIdx)
          user.hp =
            side === 'mine'
              ? Math.max(0, user.hp - Math.floor(max / 2))
              : Math.max(0, user.hp - (Math.floor(max / 2) / (max || 1)) * 100)
        }
        if (a.move === 'transform' && targetIdx != null)
          transformInto(side, userIdx, foe, targetIdx)
        // 배틀스위치: 공격기 → 블레이드폼, 킹실드 → 실드폼
        if (a.move && resolveAt(side, userIdx)?.ability === 'stancechange') {
          const mv = gd.move(a.move)
          const um = mon(side, userIdx)
          const holder = um.transform ?? um // 변신 중이면 복사한 폼 상태
          if (a.move === 'kingsshield') holder.alt = false
          else if (mv && mv.category !== 'status') holder.alt = true
        }
        // 입력한 데미지 (광역기면 다른 상대 칸도). dealt: 맞힌 데미지 합 (실수치, 반동·조개껍질방울)
        let dealt = 0
        const hitTarget = (tIdx: number, amount: number) => {
          const t = mon(foe, tIdx)
          // 대타가 받음: 대타 HP 만 줄고(0 이하면 사라짐) 본체 HP·맞았을 때 효과는 없음
          if (amount > 0 && behindSub(side, userIdx, foe, tIdx, a.move)) {
            const subHp = t.volatiles.substitute!
            const left = subHp - amount
            if (left > 0) t.volatiles.substitute = left
            else delete t.volatiles.substitute
            drainHeal(a.move, side, userIdx, foe, tIdx, Math.min(amount, subHp))
            dealt += realHp(foe, tIdx, Math.min(amount, subHp))
            return
          }
          // 흡수 후 HP 를 직접 입력했으면 그 값 (계산은 상대 최대 HP 추정이라 오차가 있음)
          const after = drainAfterOf(side, userIdx, tIdx, a)
          const hpBefore = t.hp
          if (side === 'mine') t.hp = Math.max(0, t.hp - Math.max(0, Math.min(100, amount)))
          else t.hp = Math.max(0, t.hp - Math.max(0, amount))
          if (foe === 'opp' && amount > 0) fullOpp.delete(tIdx)
          if (after != null && hpBefore > t.hp)
            user.hp = Math.max(user.hp, Math.min(maxHp(side, userIdx), after))
          else drainHeal(a.move, side, userIdx, foe, tIdx, hpBefore - t.hp)
          dealt += realHp(foe, tIdx, hpBefore - t.hp)
          // 얼음 상태에서 불꽃 기술(열탕·열사의대지 등 포함)에 맞으면 녹음
          if (amount > 0 && t.status === 'frz' && THAWS_TARGET(a.move)) t.status = ''
          if (amount > 0) {
            t.timesHit = (t.timesHit || 0) + 1
            t.turnDamaged = true
            const mv = gd.move(a.move)
            const hp = side === 'mine' ? Math.round((amount / 100) * maxHp(foe, tIdx)) : amount
            const taken = (t.turnTaken ??= { physical: 0, special: 0, last: 0 })
            if (mv?.category === 'physical') taken.physical += hp
            if (mv?.category === 'special') taken.special += hp
            taken.last = hp
          }
          if (a.move)
            onHit(a.move, side, userIdx, foe, tIdx, hpBefore, a.crit && tIdx === targetIdx)
          if (a.move && amount > 0) hitPunish(a.move, side, userIdx, foe, tIdx, hpBefore)
          checkBerry(foe, tIdx)
          // 길동무: 공격을 받아 쓰러지면 공격한 포켓몬도 쓰러짐
          if (hpBefore > 0 && t.hp <= 0 && t.volatiles.destinybond) {
            delete t.volatiles.destinybond
            user.hp = 0
          }
        }
        // 이번 턴 확률 효과 (체크한 것 중 지금 가능한 것만, 맞기 전 기준 — 대타가 맞으면 없음).
        // 속이다처럼 확정 풀죽음(100%)은 체크 없이 (우격다짐·인분·대타·정신력·이미 행동한 상대면 없음)
        const otherIdx = N > 1 ? (s.sides[foe].active[1 - a.target] ?? null) : null
        const spread = isSpreadMove(gd.move(a.move))
        const sureFlinch = (tIdx: number) => {
          const mv = gd.move(a.move)
          const ur = resolveAt(side, userIdx)
          const tr = resolveAt(foe, tIdx)
          return (
            !!mv?.effects.some(
              (e) => e.type === 'volatile' && e.status === 'flinch' && e.chance === 100,
            ) &&
            ur?.ability !== 'sheerforce' &&
            tr?.ability !== 'shielddust' &&
            tr?.ability !== 'innerfocus' &&
            !behindSub(side, userIdx, foe, tIdx, a.move) &&
            actsBefore(side, slot, foe, tIdx)
          )
        }
        const chosen = (tIdx: number | null, list: string[] | undefined) => {
          if (tIdx == null) return []
          const ok = possibleInflicts(side, slot, tIdx)
          const out = (list ?? []).filter((k) => ok.includes(k))
          if (sureFlinch(tIdx) && !out.includes('flinch')) out.push('flinch')
          return out
        }
        const inflictMain = targetIdx != null && a.amount !== 0 ? chosen(targetIdx, a.inflicts) : []
        const inflictOther =
          otherIdx != null && spread && a.amount2 !== 0 ? chosen(otherIdx, a.inflicts2) : []
        const contactOk = possibleContactInflicts(side, slot, targetIdx)
        const contactFx = (a.contactInflicts ?? []).filter((k) => contactOk.includes(k))
        if (targetIdx != null && a.amount && !a.missed) hitTarget(targetIdx, a.amount)
        if (otherIdx != null && a.amount2 && !a.missed && isSpreadMove(gd.move(a.move))) {
          if (!behindSub(side, userIdx, foe, otherIdx, a.move))
            recordObservation(
              side,
              { ...a, amount: a.amount2 },
              userIdx,
              foe,
              otherIdx,
              actionOpts(side, slot, userIdx, a.move, order),
            )
          hitTarget(otherIdx, a.amount2)
        }
        if (a.move && !a.missed) {
          afterAttack(a.move, side, userIdx, dealt)
          for (const tIdx of [targetIdx, spread ? otherIdx : null])
            if (tIdx != null) absorbAbility(a.move, side, userIdx, foe, tIdx)
        }
        // 확률 효과 적용 (빗나가면 없음, 쓰러진 상대는 제외). 풀죽음은 그 상대의 이번 턴 행동을 "행동 불가(풀죽음)"로
        const applyInflicts = (tSlot: number, tIdx: number | null, list: string[]) => {
          if (tIdx == null || a.missed) return
          // 랭크 변화: 자기 쪽은 상대가 쓰러져도, 상대 쪽은 살아 있으면 (하양허브는 한 번에)
          for (const k of list) {
            const bk = parseBoostKey(k)
            if (!bk) continue
            const [tSd, tI] = bk.target === 'self' ? [side, userIdx] : [foe, tIdx]
            if (isFainted(tSd, tI)) continue
            const src: [BattleSide, number] | undefined =
              bk.target === 'self' ? undefined : [side, userIdx]
            for (const [st, v] of bk.stats) statChange(tSd, tI, st, v, src, true)
            whiteHerb(tSd, tI)
          }
          for (const k of list) {
            if (isFainted(foe, tIdx)) return
            if (k.startsWith('boost:')) continue
            const tm = mon(foe, tIdx)
            if (k === 'flinch') {
              const ta = s.actions[foe][tSlot]
              if (ta?.kind === 'move' && s.sides[foe].active[tSlot] === tIdx)
                Object.assign(ta, { kind: 'cant', cantReason: 'flinch' })
            } else if (k === 'confusion' || k === 'attract') tm.volatiles[k] ??= 1
            else inflictStatus(foe, tIdx, k as Exclude<Status, ''>)
          }
        }
        applyInflicts(a.target, targetIdx, inflictMain)
        applyInflicts(1 - a.target, otherIdx, inflictOther)
        // 접촉 특성으로 공격한 쪽에게 (빗나가면 없음)
        if (!a.missed && a.amount !== 0 && !isFainted(side, userIdx))
          for (const k of contactFx) {
            if (k === 'attract') user.volatiles.attract ??= 1
            else inflictStatus(side, userIdx, k as Exclude<Status, ''>)
          }
        // 아군 피해 (mine: 내 아군 실수치, opp: 상대 아군 %)
        const allyIdx = allyOf(side, slot)
        if (allyIdx != null && a.allyAmount && a.move && hitsAlly(a.move)) {
          const ally = mon(side, allyIdx)
          const hpBefore = ally.hp
          ally.hp = Math.max(0, ally.hp - Math.max(0, a.allyAmount))
          if (side === 'opp') fullOpp.delete(allyIdx)
          if (a.allyAmount > 0) ally.timesHit = (ally.timesHit || 0) + 1
          onHit(a.move, side, userIdx, side, allyIdx, hpBefore)
          checkBerry(side, allyIdx)
        }
        // 공격 후 교체: 상대(드래곤테일·울부짖기 / 탈출버튼·위기회피) → 자기(유턴 등 / 상대 레드카드)
        if (targetIdx != null && a.foeSwitch != null && !a.missed && !isFainted(foe, targetIdx)) {
          const t = mon(foe, targetIdx)
          if (resolveAt(foe, targetIdx)?.slot.item === 'ejectbutton' && !t.itemGone)
            t.itemGone = true
          sendOut(foe, a.target, a.foeSwitch)
        }
        if (a.selfSwitch != null && !isFainted(side, userIdx)) {
          if (targetIdx != null) {
            const t = mon(foe, targetIdx)
            if (resolveAt(foe, targetIdx)?.slot.item === 'redcard' && !t.itemGone) t.itemGone = true
          }
          // 바톤터치: 랭크 변화와 일부 특수 상태(대타·멸망의노래 카운트 등)를 나오는 포켓몬에게 넘김
          // (교체로 초기화되기 전에 복사). 꼬리자르기: 대타만 넘김
          const passed =
            a.move === 'batonpass'
              ? {
                  boosts: { ...user.boosts },
                  vols: Object.fromEntries(
                    Object.entries(user.volatiles).filter(([k]) => BATON_VOLATILES.has(k)),
                  ),
                  seedFrom: user.seedFrom,
                }
              : a.move === 'shedtail' && user.volatiles.substitute
                ? {
                    boosts: zeroBoosts(),
                    vols: { substitute: user.volatiles.substitute },
                    seedFrom: null,
                  }
                : null
          sendOut(side, slot, a.selfSwitch)
          if (passed) {
            const inc = mon(side, a.selfSwitch)
            for (const [k, v] of Object.entries(passed.boosts))
              inc.boosts[k as RankKey] = clampBoost((inc.boosts[k as RankKey] ?? 0) + (v ?? 0))
            Object.assign(inc.volatiles, passed.vols)
            if (passed.vols.leechseed) inc.seedFrom = passed.seedFrom
            // 상대 대타 HP 는 % 라서 나오는 포켓몬의 최대 HP 기준으로 바꿈
            const from = maxHp(side, userIdx)
            const to = maxHp(side, a.selfSwitch)
            if (side === 'opp' && passed.vols.substitute && from && to)
              inc.volatiles.substitute = Math.round((passed.vols.substitute * from * 10) / to) / 10
          }
        }
        if (a.move === 'spitup' || a.move === 'swallow') delete user.volatiles.stockpile
      }
    })

    // 3. 원시 날씨의 원인이 쓰러지면 날씨 해제
    if (s.weather.source && isFainted(s.weather.source[0], s.weather.source[1])) clearWeather()

    // 4. (예전의 "상태이상 발생" 선택 칸은 없앰 — 확정 효과는 기술 효과로 자동, 확률 효과는 행동 아래 체크)

    // 5. 턴 종료: 상태이상 데미지, 특수상태 경과
    // 턴 끝 HP 관측 준비 (상대): 실제 HP 범위를 아는 상태(가득 / 화면 % 그대로)에서 시작한 포켓몬만.
    // 최대 HP 비율로 바뀐 것(hpSteps)만 기록하고, 다른 HP 변화(열매·씨뿌리기 흡수 등)가 섞였으면 턴 끝에 버림
    const hpStart = new Map<number, number>()
    const hpSteps = new Map<number, HpStep[]>()
    for (const i of s.sides.opp.active) {
      if (i == null || isFainted('opp', i)) continue
      const v = mon('opp', i).hp
      if (fullOpp.has(i) ? v >= 100 : Math.abs(v - Math.round(v)) < 1e-9) {
        hpStart.set(i, Math.round(v))
        hpSteps.set(i, [])
      }
    }
    for (const side of sides) {
      for (const idx of s.sides[side].active) {
        if (idx == null || isFainted(side, idx)) continue
        const m = mon(side, idx)
        if (m.status === 'tox') m.toxicTurn += 1
        const r = resolveAt(side, idx)
        const max = r?.stats.hp || 0
        const dmg = statusDamage(max, m.status, r?.ability, m.toxicTurn)
        const log = side === 'opp' ? hpSteps.get(idx) : undefined
        if (dmg) {
          log?.push({ status: m.status, ability: r?.ability || '', toxicTurn: m.toxicTurn })
          m.hp =
            side === 'mine' ? Math.max(0, m.hp - dmg) : Math.max(0, m.hp - (dmg / (max || 1)) * 100)
        }
        // 가속: 이번 턴에 나온 포켓몬은 제외
        if (r?.ability === 'speedboost' && m.hp > 0 && m.enteredTurn < s.turn)
          statChange(side, idx, 'spe', 1)
        // 꼬르륵스위치(모르페코): 턴이 끝날 때마다 배부른모양 ↔ 배고픈모양 (변신 중이면 그대로)
        if (r?.ability === 'hungerswitch' && m.hp > 0 && !m.transform) m.alt = !m.alt
        // 턴 끝 회복·데미지 (먹다남은음식·그래스필드·씨뿌리기 등)
        if (m.hp > 0) applyResidual(side, idx, log)
        checkBerry(side, idx)
        // 하품: 걸린 다음 턴이 끝날 때까지 필드에 있으면 잠듦 (교체하면 졸음이 풀림)
        if (m.volatiles.yawn) {
          if (m.volatiles.yawn >= 2) {
            delete m.volatiles.yawn
            if (m.hp > 0) inflictStatus(side, idx, 'slp')
          } else m.volatiles.yawn = 2
        }
        // 멸망의노래: 카운트가 1 줄고 0 이 되면 쓰러짐
        if (m.volatiles.perishsong) {
          const left = m.volatiles.perishsong - 1
          if (left > 0) m.volatiles.perishsong = left
          else {
            delete m.volatiles.perishsong
            m.hp = 0
          }
        }
        // 반동·게으름: 쓴 턴 끝에 2 (다음 턴 행동 불가), 그 턴이 끝나면 풀림
        for (const k of LOAF_VOLATILES) {
          if (!m.volatiles[k]) continue
          if (m.volatiles[k] >= 2) delete m.volatiles[k]
          else m.volatiles[k] = 2
        }
        for (const [k, turn] of Object.entries(m.volatiles)) {
          const total = VOLATILE_DURATION[k]
          if (total == null) continue
          if (turn + 1 > total) delete m.volatiles[k]
          else m.volatiles[k] = turn + 1
        }
      }
    }

    // 5b. 희망사항: 쓴 다음 턴 끝에 그 칸의 포켓몬 회복 (회복봉인이면 없음)
    for (const side of sides) {
      const w = s.sides[side].wishes
      if (!w) continue
      for (const [k, v] of Object.entries(w)) {
        if (v.turn >= s.turn) continue
        delete w[+k]
        const i = s.sides[side].active[+k]
        if (i != null && !isFainted(side, i) && !mon(side, i).volatiles.healblock)
          healHp(side, i, v.hp)
      }
    }

    // 6. 날씨 / 필드 / 공간 / 벽 경과
    const tick = (c: Counter, end: () => void) => {
      c.cur += 1
      if (c.cur >= c.total) end()
    }
    if (s.weather.key && !s.weather.permanent) tick(s.weather, clearWeather)
    if (s.terrain.key) tick(s.terrain, () => Object.assign(s.terrain, { key: '', cur: 0 }))
    for (const [k, c] of Object.entries(s.rooms)) tick(c, () => delete s.rooms[k])
    for (const side of sides)
      for (const [k, c] of Object.entries(s.sides[side].screens))
        tick(c, () => delete s.sides[side].screens[k])
    if (s.fairyLock > 0) s.fairyLock -= 1

    // 7. 입력값 초기화
    for (const side of sides) {
      s.actions[side].forEach((a, slot) => {
        if (a.kind === 'switch' || s.sides[side].active[slot] !== activeAtMoves[side][slot])
          Object.assign(a, newAction(), { target: a.target })
        a.amount = null
        a.allyAmount = null
        a.amount2 = null
        a.crit = false
        a.missed = false
        a.drainAfter = null
        a.selfSwitch = null
        a.foeSwitch = null
        a.inflicts = []
        a.inflicts2 = []
        a.contactInflicts = []
        a.useMega = false
        // 잠듦·얼음이면 다음 턴 기본값은 행동 불가 (깨어나서 기술을 쓰면 직접 "기술 사용"으로), 반동·게으름이면 행동 불가(기타)
        const ui = s.sides[side].active[slot]
        const st = ui != null ? mon(side, ui).status : ''
        // 잠듦·얼음: 다음 시도에 반드시 풀리면(잠듦·얼음 3번째 턴) 기본값은 기술 사용
        const sure = ui != null && (wakeChance(side, ui) ?? 0) >= 100
        if (a.kind !== 'switch' && (st === 'slp' || st === 'frz') && !sure)
          Object.assign(a, { kind: 'cant', cantReason: st })
        else if (
          a.kind !== 'switch' &&
          ui != null &&
          LOAF_VOLATILES.some((k) => mon(side, ui).volatiles[k])
        )
          Object.assign(a, { kind: 'cant', cantReason: 'other' })
        else if (a.kind === 'cant') a.kind = 'move'
      })
    }
    // 상대 HP 는 게임 화면처럼 정수 % 로 맞춘다 (게임은 버림 표시 — utils/hpDisplay). 턴 끝 회복·반동 등은
    // 최대 HP(추정 범위의 가운데) 기준으로 실수치를 거쳐 계산해서 소수가 남는다(59% + 먹다남은음식 → 64.8%).
    //   화면 p% 는 실제 [p, p+1)% 라 계산은 p 에서 시작했어도 실제는 평균 p+0.5 → 반올림(= p+0.5 를 버림)
    //   단, 턴 시작에 가득 차 있었고 화면 % 를 입력한 적이 없으면 실제 값 그대로 → 버림 (100% − 5.96% → 94%)
    // 남아 있으면 최소 1%
    // 턴 끝 HP 변화가 기록한 비율만으로 설명되는지 (추정 최대 HP 로 다시 계산해 지금 값과 같으면)
    const explained = (i: number) => {
      const steps = hpSteps.get(i)
      const max = maxHp('opp', i)
      if (!steps?.length || !max) return false
      let v = hpStart.get(i)!
      for (const st of steps) {
        if (v <= 0) break
        const d =
          'frac' in st
            ? Math.sign(st.frac) * Math.max(1, Math.floor(max * Math.abs(st.frac)))
            : -statusDamage(max, st.status, st.ability, st.toxicTurn)
        v = Math.max(0, Math.min(100, v + (d * 100) / max))
      }
      return Math.abs(v - mon('opp', i).hp) < 1e-6
    }
    const checks = new Map<number, Omit<HpCheck, 'turn' | 'predicted'>>()
    for (const i of hpStart.keys())
      if (explained(i)) checks.set(i, { start: hpStart.get(i)!, steps: hpSteps.get(i)! })
    s.sides.opp.mons.forEach((m, i) => {
      if (m.hp <= 0) return
      const shown = fullOpp.has(i) ? Math.floor(m.hp + 1e-9) : Math.round(m.hp)
      m.hp = Math.min(100, Math.max(1, shown))
    })
    s.observedOrder = 'unknown' // 선후공 관찰은 턴마다 새로
    s.entryObs = {}
    s.turn += 1
    s.sides.opp.mons.forEach((m, i) => {
      const c = checks.get(i)
      m.hpCheck = c ? { ...c, turn: s.turn, predicted: m.hp } : null
    })
  }

  // ── 행동 순서 ─────────────
  // 실전 스피드 (랭크 / 특성 / 스카프(매직룸·도구 잃음이면 무효) / 순풍 / 마비). megaOverride: 이번 턴 메가진화 반영
  // itemOverride: 이 도구를 지녔다면 (상대 추측 도구로 선후공이 바뀌는지 볼 때)
  const speedOf = (
    side: BattleSide,
    idx: number,
    megaOverride?: boolean,
    itemOverride?: string,
  ) => {
    const s = state.value!
    const r = resolveAt(side, idx, megaOverride)
    const m = mon(side, idx)
    if (!r) return 0
    return effectiveSpeed(r.stats.spe, {
      boost: m.boosts.spe,
      item: m.itemGone || s.rooms.magicroom ? '' : (itemOverride ?? r.slot.item),
      itemLost: m.itemGone,
      status: m.status,
      ability: r.ability,
      weather: s.weather.key,
      terrain: s.terrain.key,
      tailwind: !!s.sides[side].screens.tailwind,
    })
  }
  // 우선도 (장난꾸러기: 변화기 +1 / 질풍날개: HP 가득일 때 비행 기술 +1 / 힐링시프트: 회복 기술 +3)
  const movePriority = (side: BattleSide, idx: number, moveId: string) => {
    const mv = gd.move(moveId)
    if (!mv) return 0
    const ab = resolveAt(side, idx)?.ability
    let p = mv.priority
    if (ab === 'prankster' && mv.category === 'status') p += 1
    if (
      ab === 'galewings' &&
      mv.type === 'flying' &&
      mon(side, idx).hp >= (side === 'mine' ? maxHp(side, idx) : 100)
    )
      p += 1
    if (ab === 'triage' && mv.effects.some((e) => e.type === 'heal' || e.type === 'drain')) p += 3
    return p
  }
  // 이번 턴 메가진화하는 포켓몬은 메가 폼 기준
  const turnMega = (side: BattleSide, slot: number, idx: number) => {
    const a = state.value!.actions[side][slot]
    return a?.kind === 'move' && a.useMega && canMegaEvolve(side, idx) ? true : undefined
  }
  // 이번 턴 기술을 쓰는 순서: 우선도 → 스피드(트릭룸이면 느린 쪽부터, 내 쪽 vs 상대는 speedOrder 로 확정되면 그대로).
  // 분석 대상 칸끼리는 관찰한 선후공이 있으면 그대로 (우선도가 같을 때). 교체하는 칸은 기술을 안 씀
  const turnOrder = (): TurnEntry[] => {
    const s = state.value!
    const list: (TurnEntry & { pri: number; spe: number; mega?: true })[] = []
    for (const side of ['mine', 'opp'] as const) {
      s.actions[side].forEach((a, slot) => {
        const idx = s.sides[side].active[slot]
        if (a.kind !== 'move' || idx == null || isFainted(side, idx)) return
        const mega = turnMega(side, slot, idx)
        list.push({
          side,
          slot,
          idx,
          move: a.move,
          mega,
          pri: movePriority(side, idx, a.via || a.move),
          spe: speedOf(side, idx, mega),
        })
      })
    }
    const tr = !!s.rooms.trickroom
    // 내 쪽 vs 상대: 스피드 범위로 선후공이 정해지면 그대로, 아니면 상대 스피드 범위의 가운데로 (화면은 이때 본 순서를 입력받는다)
    const bySpeed = (x: (typeof list)[number], y: (typeof list)[number]) => {
      if (x.side !== y.side) {
        const [m, o] = x.side === 'mine' ? [x, y] : [y, x]
        const v = speedOrder(m.idx, o.idx, m.mega, o.mega)?.first
        if (v === 'mine' || v === 'opp') return v === x.side ? -1 : 1
      }
      return tr ? x.spe - y.spe : y.spe - x.spe
    }
    list.sort((x, y) => y.pri - x.pri || bySpeed(x, y) || (x.side === 'mine' ? -1 : 1))
    if (s.observedOrder !== 'unknown') {
      const a = list.findIndex((e) => e.side === 'mine' && e.slot === s.focus.mine)
      const b = list.findIndex((e) => e.side === 'opp' && e.slot === s.focus.opp)
      if (a >= 0 && b >= 0 && list[a]!.pri === list[b]!.pri) {
        const wantFirst = s.observedOrder === 'mine' ? a : b
        const other = wantFirst === a ? b : a
        if (wantFirst > other) [list[a], list[b]] = [list[b]!, list[a]!]
      }
    }
    return list.map(({ side, slot, idx, move }) => ({ side, slot, idx, move }))
  }
  // 순서에서 이 기술의 그때 보정: 대상이 먼저 행동 / 이번 턴 교체로 등장 / 대상에게 먼저 맞음
  // side 의 slot 행동이 맞히는 포켓몬: 대상 칸이 이번 턴 교체하면 들어오는 포켓몬 (교체는 기술보다 먼저),
  // 대상이 이 행동보다 먼저 교체기(유턴·볼트체인지·배턴터치 등)를 쓰고 물러나면 그때 나오는 포켓몬.
  // k: 맞는 상대 칸 (생략하면 행동의 대상 칸, 더블 광역기의 다른 칸은 직접 지정)
  const hitTarget = (
    side: BattleSide,
    slot: number,
    order: TurnEntry[] = turnOrder(),
    k = state.value!.actions[side][slot]?.target ?? 0,
  ): { idx: number | null; switchedIn: boolean } => {
    const s = state.value!
    const foe = foeOf(side)
    const fa = s.actions[foe][k]
    if (fa?.kind === 'switch' && fa.switchTo != null) return { idx: fa.switchTo, switchedIn: true }
    const cur = s.sides[foe].active[k] ?? null
    if (cur != null && fa?.kind === 'move' && fa.selfSwitch != null) {
      const me = order.findIndex((e) => e.side === side && e.slot === slot)
      const them = order.findIndex((e) => e.side === foe && e.slot === k)
      if (me >= 0 && them >= 0 && them < me) return { idx: fa.selfSwitch, switchedIn: true }
    }
    return { idx: cur, switchedIn: false }
  }
  const actionOpts = (
    side: BattleSide,
    slot: number,
    userIdx: number,
    moveId: string,
    order: TurnEntry[],
  ): DamageOptions => {
    const s = state.value!
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const a = s.actions[side][slot]!
    const hit = hitTarget(side, slot, order)
    const targetIdx = hit.idx
    const pos = order.findIndex((e) => e.side === side && e.idx === userIdx)
    const tPos =
      targetIdx == null ? -1 : order.findIndex((e) => e.side === foe && e.idx === targetIdx)
    const targetSwitchedIn = hit.switchedIn
    const targetFirst = tPos >= 0 && pos >= 0 && tPos < pos
    const ta = targetFirst ? s.actions[foe][order[tPos]!.slot] : undefined
    const tMove = ta?.kind === 'move' ? gd.move(ta.move) : null
    const userSlotOf = s.sides[side].active.indexOf(userIdx)
    const damagedByTarget =
      !!tMove &&
      tMove.category !== 'status' &&
      (ta!.target === userSlotOf || isSpreadMove(tMove)) &&
      (ta!.amount == null || ta!.amount > 0)
    const move = gd.move(moveId)
    const atkC = combatantOf(side, userIdx, turnMega(side, slot, userIdx), true)
    const field = targetIdx == null ? fieldFor(foe) : fieldFor(foe, targetIdx)
    // 이 행동보다 먼저 행동하는 것들 (순서대로)
    const earlier = pos >= 0 ? order.slice(0, pos) : []
    const actOf = (e: TurnEntry) => s.actions[e.side][e.slot]
    // e 가 (defSide, defSlot) 칸을 공격기로 맞히는지
    const hitsSlot = (e: TurnEntry, defSide: BattleSide, defSlot: number) => {
      const ea = actOf(e)
      if (!ea || ea.kind !== 'move' || ea.missed) return false
      const mv = gd.move(ea.move)
      if (!mv || mv.category === 'status') return false
      if (e.side === defSide) return hitsAlly(ea.move) && e.slot !== defSlot
      return ea.target === defSlot || isSpreadMove(mv)
    }
    const user = mon(side, userIdx)
    // 승부굳히기: 대상이 이번 턴 이미 맞음
    const targetDamagedThisTurn =
      targetIdx != null &&
      (!!mon(foe, targetIdx).turnDamaged || earlier.some((e) => hitsSlot(e, foe, a.target)))
    // 분풀이: 이번 턴 능력이 떨어짐 (먼저 맞은 기술의 확정 능력 하락, 이번 턴 교체로 나온 상대의 위협)
    const lowersUser = (e: TurnEntry) => {
      const ea = actOf(e)
      if (e.side === side || !ea || ea.kind !== 'move' || ea.missed) return false
      const mv = gd.move(ea.move)
      return (
        !!mv &&
        (ea.target === userSlotOf || isSpreadMove(mv)) &&
        mv.effects.some(
          (ef) =>
            ef.type === 'boost' &&
            ef.target === 'target' &&
            (!ef.chance || ef.chance >= 100) &&
            Object.values(ef.stats).some((v) => (v ?? 0) < 0),
        )
      )
    }
    const intimidatedNow = s.actions[foe].some(
      (fa) =>
        fa.kind === 'switch' &&
        fa.switchTo != null &&
        resolveAt(foe, fa.switchTo)?.ability === 'intimidate',
    )
    const statsLoweredThisTurn = !!user.turnLowered || earlier.some(lowersUser) || intimidatedNow
    // 돌림노래: 같은 편이 이번 턴 먼저 돌림노래를 씀
    const roundBoost = earlier.some(
      (e) => e.side === side && e.idx !== userIdx && actOf(e)?.move === 'round',
    )
    // 카운터·미러코트·메탈버스트·앙갚음: 이번 턴 먼저 받은 데미지 (HP)
    const taken = { ...(user.turnTaken ?? { physical: 0, special: 0, last: 0 }) }
    for (const e of earlier) {
      if (e.side === side || !hitsSlot(e, side, userSlotOf)) continue
      const ea = actOf(e)!
      const mv = gd.move(ea.move)!
      const amt = ea.target === userSlotOf ? ea.amount : ea.amount2
      if (!amt) continue
      const hp = e.side === 'mine' ? Math.round((amt / 100) * maxHp(side, userIdx)) : amt
      if (mv.category === 'physical') taken.physical += hp
      else taken.special += hp
      taken.last = hp
    }
    return {
      ...attackOpts(side, userIdx, moveId),
      spread: spreadActive(foe) && isSpreadMove(move, { attacker: atkC, field }),
      movesLast: targetSwitchedIn || targetFirst,
      targetSwitchedIn,
      damagedByTarget,
      targetDamagedThisTurn,
      statsLoweredThisTurn,
      roundBoost,
      damageTaken: taken,
    }
  }
  // 맞는 시점의 배틀 폼 (킬가르도): 같은 턴에 먼저 공격기를 쓰면 블레이드폼, 킹실드면 실드폼. 해당 없으면 undefined
  const formAtHit = (
    defSide: BattleSide,
    defIdx: number,
    attackerSide: BattleSide,
    attackerIdx: number,
    order: TurnEntry[],
  ): boolean | undefined => {
    if (resolveAt(defSide, defIdx)?.ability !== 'stancechange') return undefined
    const aPos = order.findIndex((e) => e.side === attackerSide && e.idx === attackerIdx)
    const dPos = order.findIndex((e) => e.side === defSide && e.idx === defIdx)
    if (aPos < 0 || dPos < 0 || dPos > aPos) return undefined
    const dm = order[dPos]!.move
    if (dm === 'kingsshield') return false
    const mv = gd.move(dm)
    return mv && mv.category !== 'status' ? true : undefined
  }

  // ── 이번 턴 앞선 행동의 확정 효과 (예상 계산용) ─────────────
  // 이번 턴 (atkSide, atkIdx) 가 행동하기 직전의 랭크·상태이상·벽·날씨·필드. 실제 턴 적용(executeTurn)은 순서대로 상태를 바꾸므로
  // 이건 예상(이번 턴 예상 흐름·행동 칸 예상 데미지·입력 경고)용이다. 반영하는 것:
  //   - 교체로 나오는 포켓몬의 위협 (기술보다 먼저)
  //   - 먼저 행동하는 기술의 확정 효과·확률 100% 부가효과 (applyMoveEffects 와 같은 조건: 빗나감·데미지 0·상성 무효·대타·
  //     인분·우격다짐·황금몸이면 없음): 랭크(심술꾸러기·클리어바디류·오기·승기), 상태이상, 벽(리플렉터·빛의장막·오로라베일), 날씨, 필드, 흑안개
  //   - 행동 칸에서 체크한 "이번 턴 확률 효과"의 상태이상
  interface TurnSnapshot {
    boosts: Map<string, Partial<BoostTable>>
    status: Map<string, Status>
    screens: Record<BattleSide, Set<string>>
    weather?: Weather
    terrain?: Terrain
  }
  const turnStateBefore = (
    atkSide: BattleSide,
    atkIdx: number,
    order: TurnEntry[] = turnOrder(),
  ): TurnSnapshot => {
    const s = state.value!
    const snap: TurnSnapshot = {
      boosts: new Map(),
      status: new Map(),
      screens: { mine: new Set(), opp: new Set() },
    }
    const key = (sd: BattleSide, i: number) => `${sd}:${i}`
    const boostsOf = (sd: BattleSide, i: number) => {
      const k = key(sd, i)
      if (!snap.boosts.has(k)) snap.boosts.set(k, { ...mon(sd, i).boosts })
      return snap.boosts.get(k)!
    }
    const statusOf = (sd: BattleSide, i: number) => snap.status.get(key(sd, i)) ?? mon(sd, i).status
    const setStatus = (sd: BattleSide, i: number, st: Exclude<Status, ''>) => {
      if (!statusOf(sd, i) && !statusBlocked(sd, i, st)) snap.status.set(key(sd, i), st)
    }
    // statChange 와 같은 규칙 (상태를 바꾸지 않는 사본)
    const change = (sd: BattleSide, i: number, k: RankKey, delta: number, byFoe: boolean) => {
      const ab = resolveAt(sd, i)?.ability || ''
      if (ab === 'contrary') delta = -delta
      if (delta < 0 && byFoe && (BLOCK_FOE_DROPS.has(ab) || BLOCK_STAT_DROP[ab] === k)) return
      if (delta < 0 && byFoe && ab === 'mirrorarmor') return
      const b = boostsOf(sd, i)
      const before = b[k] ?? 0
      b[k] = clampBoost(before + delta)
      if (b[k]! >= before || !byFoe) return
      if (ab === 'defiant') change(sd, i, 'atk', 2, false)
      if (ab === 'competitive') change(sd, i, 'spa', 2, false)
    }
    // 교체로 나오는 위협
    for (const sd of ['mine', 'opp'] as const) {
      const foe = foeOf(sd)
      for (const a of s.actions[sd]) {
        if (a?.kind !== 'switch' || a.switchTo == null) continue
        if (resolveAt(sd, a.switchTo)?.ability !== 'intimidate') continue
        s.sides[foe].active.forEach((fi, fSlot) => {
          if (fi == null || isFainted(foe, fi) || s.actions[foe][fSlot]?.kind === 'switch') return
          const ab = resolveAt(foe, fi)?.ability || ''
          if (ab === 'guarddog') return change(foe, fi, 'atk', 1, false)
          if (INTIMIDATE_IMMUNE.has(ab) || mon(foe, fi).volatiles.substitute) return
          change(foe, fi, 'atk', -1, true)
          if (ab === 'rattled') change(foe, fi, 'spe', 1, false)
        })
      }
    }
    for (const e of order) {
      if (e.side === atkSide && e.idx === atkIdx) break
      const a = s.actions[e.side][e.slot]
      const move = gd.move(e.move)
      if (!a || a.kind !== 'move' || a.missed || !move || isFainted(e.side, e.idx)) continue
      const foe = foeOf(e.side)
      const user = resolveAt(e.side, e.idx)
      const damaging = move.category !== 'status'
      // 맞은 상대 칸 (입력한 데미지가 0 이면 안 맞음, 공격기는 상성 무효 제외)
      const hits: number[] = []
      const tryHit = (k: number, amount: number | null | undefined) => {
        const t = hitTarget(e.side, e.slot, order, k).idx
        if (t == null || isFainted(foe, t) || hits.includes(t)) return
        if (damaging && amount === 0) return
        if (damaging) {
          const atkC = combatantOf(e.side, e.idx, undefined, true)
          const defC = combatantOf(foe, t)
          if (atkC && defC && calc.cell(e.move, atkC, defC, fieldFor(foe, t))?.immune) return
        } else if (resolveAt(foe, t)?.ability === 'goodasgold') return
        hits.push(t)
      }
      if (move.target !== 'self') {
        tryHit(a.target, a.amount)
        if (N > 1 && isSpreadMove(move)) tryHit(1 - a.target, a.amount2)
      }
      const blocked = (t: number) => behindSub(e.side, e.idx, foe, t, e.move)
      for (const ef of move.effects as MoveEffect[]) {
        if (ef.type === 'boost' || ef.type === 'status') {
          const chance = 'chance' in ef ? ef.chance : undefined
          if (chance && (chance < 100 || user?.ability === 'sheerforce')) continue
          if (damaging && !hits.length) continue
          if (ef.target === 'self') {
            if (ef.type === 'boost')
              for (const [k, v] of Object.entries(ef.stats))
                if (k in zeroBoosts()) change(e.side, e.idx, k as RankKey, v || 0, false)
            continue
          }
          for (const t of hits) {
            if (blocked(t) || (chance && resolveAt(foe, t)?.ability === 'shielddust')) continue
            if (ef.type === 'boost') {
              for (const [k, v] of Object.entries(ef.stats))
                if (k in zeroBoosts()) change(foe, t, k as RankKey, v || 0, true)
            } else setStatus(foe, t, ef.status)
          }
        } else if (ef.type === 'side' && ['reflect', 'lightscreen', 'auroraveil'].includes(ef.key))
          snap.screens[ef.side === 'self' ? e.side : foe].add(ef.key)
        else if (ef.type === 'weather' && !s.weather.permanent) snap.weather = ef.key
        else if (ef.type === 'terrain') snap.terrain = ef.key
      }
      if (e.move === 'haze')
        for (const sd of ['mine', 'opp'] as const)
          for (const i of s.sides[sd].active)
            if (i != null) snap.boosts.set(key(sd, i), zeroBoosts())
      // 행동 칸에서 체크한 이번 턴 상태이상 (맞은 상대에게, 대타 뒤면 없음)
      const checked: [number | null, string[] | undefined][] = [
        [hitTarget(e.side, e.slot, order, a.target).idx, a.inflicts],
        [N > 1 ? hitTarget(e.side, e.slot, order, 1 - a.target).idx : null, a.inflicts2],
      ]
      for (const [t, list] of checked) {
        if (t == null || !hits.includes(t)) continue
        for (const k of list ?? []) {
          const bk = parseBoostKey(k)
          if (bk?.target === 'self')
            for (const [st, v] of bk.stats) change(e.side, e.idx, st, v, false)
          if (blocked(t)) continue
          if (bk?.target === 'target') for (const [st, v] of bk.stats) change(foe, t, st, v, true)
          else if (['brn', 'par', 'psn', 'tox', 'slp', 'frz'].includes(k))
            setStatus(foe, t, k as Exclude<Status, ''>)
        }
      }
    }
    return snap
  }
  // turnStateBefore 결과를 계산용 포켓몬에 덮어씀 (랭크는 필드에 나와 있는 포켓몬만)
  const withTurnState = <C extends Combatant>(
    snap: TurnSnapshot,
    side: BattleSide,
    idx: number,
    c: C,
  ): C => {
    const b = snap.boosts.get(`${side}:${idx}`)
    const st = snap.status.get(`${side}:${idx}`)
    if (!b && !st) return c
    const active = state.value!.sides[side].active.includes(idx)
    return { ...c, ...(b && active ? { boosts: b } : {}), ...(st ? { status: st } : {}) }
  }
  const fieldWithTurnState = (
    snap: TurnSnapshot,
    defSide: BattleSide,
    f: FieldState,
  ): FieldState => ({
    ...f,
    ...(snap.weather ? { weather: snap.weather } : {}),
    ...(snap.terrain ? { terrain: snap.terrain } : {}),
    reflect: f.reflect || snap.screens[defSide].has('reflect'),
    lightScreen: f.lightScreen || snap.screens[defSide].has('lightscreen'),
    auroraVeil: f.auroraVeil || snap.screens[defSide].has('auroraveil'),
  })

  // ── 상대 스피드 추정 ─────────────
  // 상대의 그때 스피드 계산 조건 (종족값 + 랭크/특성/순풍/마비/도구 상태). 변신 중이면 스피드 실능치가 정해짐
  const speedEnvOf = (
    oi: number,
    megaOverride?: boolean,
  ): { base: number; env: SpeedEnv } | null => {
    const s = state.value!
    const r = resolveAt('opp', oi, megaOverride)
    const m = mon('opp', oi)
    if (!r) return null
    return {
      base: r.species.stats.spe,
      env: {
        boost: m.boosts.spe,
        status: m.status,
        ability: r.ability,
        weather: s.weather.key,
        terrain: s.terrain.key,
        tailwind: !!s.sides.opp.screens.tailwind,
        itemLost: m.itemGone,
        magicRoom: !!s.rooms.magicroom,
        fixedStat: r.transformedFrom ? r.stats.spe : undefined,
      },
    }
  }
  // 이번 턴 관찰한 선후공 (분석 대상 칸끼리, 둘 다 기술 + 우선도가 같거나 둘 다 교체일 때만 스피드 비교가 됨)
  // 둘 다 교체하면 교체 순서도 스피드 순 → 나가는 포켓몬끼리 비교 (메가진화 안 함). 한쪽만 교체면 교체가 항상 먼저라 정보 없음
  const pendingSpeedObservation = () => {
    const s = state.value!
    if (s.observedOrder === 'unknown') return null
    const ms = s.focus.mine
    const os = s.focus.opp
    const ma = s.actions.mine[ms]
    const oa = s.actions.opp[os]
    const mi = s.sides.mine.active[ms]
    const oi = s.sides.opp.active[os]
    if (mi == null || oi == null || isFainted('mine', mi) || isFainted('opp', oi)) return null
    const bothSwitch = ma?.kind === 'switch' && oa?.kind === 'switch'
    if (!bothSwitch) {
      if (ma?.kind !== 'move' || oa?.kind !== 'move') return null
      if (
        movePriority('mine', mi, ma.via || ma.move) !== movePriority('opp', oi, oa.via || oa.move)
      )
        return null
    }
    const se = speedEnvOf(oi, bothSwitch ? undefined : turnMega('opp', os, oi))
    if (!se) return null
    return {
      oi,
      ...se,
      mySpeed: speedOf('mine', mi, bothSwitch ? undefined : turnMega('mine', ms, mi)),
      // 트릭룸에서는 느린 쪽이 먼저
      oppAtLeast: (s.observedOrder === 'opp') !== !!s.rooms.trickroom,
    }
  }
  // 상대 oi 의 스피드 구간: 저장된 관찰 + 이번 턴 관찰(미리보기). 변신 중이면 이번 턴 관찰만
  // 도구를 확정했으면 구애스카프 여부도 확정 → 스카프로 확정이면 스카프 구간만, 다른 도구면 스카프 없는 구간만
  const speedRangesOf = (oi: number, withPending = true): SpeedRanges => {
    const m = mon('opp', oi)
    const transformed = !!m.transform
    const base = transformed ? fullRanges() : (m.speedSp ?? fullRanges())
    const p = withPending ? pendingSpeedObservation() : null
    const ranges =
      p && p.oi === oi ? narrowRanges(base, p.base, p.env, p.mySpeed, p.oppAtLeast) : base
    if (!m.itemKnown) return ranges
    const scarf = oppItemOf(oi) === 'choicescarf'
    const out = { ...ranges }
    for (const band of SPEED_BANDS) if (band.scarf !== scarf) out[band.key] = null
    return out
  }

  // ── 선후공 판정 (스피드) ─────────────
  // 내 mi 와 상대 oi 가 같은 우선도로 기술을 쓸 때, 상대 스피드 범위(선후공 관찰·확정 도구로 좁힌 것)를 지금 조건
  // (랭크·마비·순풍·날씨·필드·이번 턴 메가진화)으로 환산해 내 스피드와 비교. 트릭룸이면 느린 쪽이 먼저.
  //   first: 'mine' | 'opp' = 먼저 행동 확정, 'tie' = 반드시 동속(무작위), null = 범위가 겹쳐 모름 (화면은 본 순서를 입력받고, 적용은 범위 가운데 스피드로)
  //   tiePossible: 동속일 수도 있음 (그러면 무작위)
  //   random: 선제공격손톱(상대 도구 미확정이면 가능)·퀵드로로 순서가 바뀔 수 있음
  //   선공하수(sableye 등)는 다루지 않음 → null
  const speedOrder = (mi: number, oi: number, megaMine?: boolean, megaOpp?: boolean) => {
    const s = state.value!
    const se = speedEnvOf(oi, megaOpp)
    const r = resolveAt('opp', oi, megaOpp)
    const mr = resolveAt('mine', mi, megaMine)
    if (!se || !r || !mr) return null
    const om = mon('opp', oi)
    const abilities =
      r.isMega || r.transformedFrom || om.abilityKnown
        ? [r.ability]
        : [...new Set(r.base.abilities)]
    if (abilities.includes('stall') || mr.ability === 'stall') return null
    // 관찰이 한 번도 없으면 스피드 하락 성격도 가능하다고 본다
    const span = oppSpeedSpan(
      se.base,
      speedRangesOf(oi, false),
      se.env,
      abilities,
      !om.speedSp && se.env.fixedStat == null,
    )
    if (!span) return null
    const my = speedOf('mine', mi, megaMine)
    const c = compareSpeed(my, span)
    const tr = !!s.rooms.trickroom
    const first =
      c.faster === 'mine' || c.faster === 'opp'
        ? (c.faster === 'mine') !== tr
          ? ('mine' as const)
          : ('opp' as const)
        : c.faster
    const itemsOn = !s.rooms.magicroom
    const mm = mon('mine', mi)
    // 선제공격손톱·퀵드로는 가진 쪽을 먼저 움직이게만 함 → 순서가 정해졌으면 나중에 움직일 쪽만 본다
    const oppCan =
      (itemsOn &&
        ((!om.itemKnown && !om.itemGone) || (oppItemOf(oi) === 'quickclaw' && !om.itemGone))) ||
      abilities.includes('quickdraw')
    const mineCan =
      (itemsOn && slotsOf('mine')[mi]?.item === 'quickclaw' && !mm.itemGone) ||
      mr.ability === 'quickdraw'
    const random = first === 'mine' ? oppCan : first === 'opp' ? mineCan : oppCan || mineCan
    return { first, tiePossible: c.tiePossible, random, mySpeed: my, span }
  }

  // ── 상대 배분 추정용 관측 ─────────────
  // 상대 실능치만으로 설명할 수 없는 기술은 제외 (상대 공격·방어를 쓰는 기술, 고정 데미지, 스피드 의존, 조건부 위력)
  const UNESTIMABLE = new Set([
    'foulplay',
    'bodypress',
    'shellsidearm',
    'gyroball',
    'electroball',
    'seismictoss',
    'nightshade',
    'superfang',
    'ruination',
    'finalgambit',
    'endeavor',
    'counter',
    'mirrorcoat',
    'metalburst',
    'comeuppance',
    'beatup',
    'spitup',
    'ficklebeam',
    'assurance',
    'stompingtantrum',
    'temperflare',
    'lashout',
    'round',
  ])
  function recordObservation(
    side: BattleSide,
    a: ActionState,
    userIdx: number,
    foe: BattleSide,
    targetIdx: number,
    opts: DamageOptions,
  ) {
    const move = gd.move(a.move)
    if (!move || move.category === 'status' || UNESTIMABLE.has(a.move) || !a.amount) return
    const oppIdx = side === 'mine' ? targetIdx : userIdx
    const mineIdx = side === 'mine' ? userIdx : targetIdx
    if (side === 'mine' && foe !== 'opp') return
    const om = mon('opp', oppIdx)
    const mm = mon('mine', mineIdx)
    if (om.transform) return // 변신한 상대의 실능치는 내 포켓몬에서 복사한 값
    // 연속기는 맞은 횟수를 알 수 없어 제외
    const atkC = combatantOf(side, userIdx, undefined, true)
    if (!atkC || hitInfo(move, atkC, !!opts.spread).max > 1) return
    // 쓰러뜨렸으면 알 수 있는 건 "남은 HP 이상" 뿐 → 입력값이 남은 HP 보다 커도 남은 HP 로 기록
    const left = side === 'mine' ? om.hp : mm.hp
    // 내 포켓몬이 HP 가득에서 기합의띠·옹골참으로 1 남았으면 이것도 "그 이상" 만 안다
    const defC = side === 'opp' ? combatantOf('mine', mineIdx) : null
    const heldOn = !!defC && holdsOnAtFull(atkC, defC) && a.amount === left - 1
    const ko = a.amount >= left || heldOn
    const obs: StatObservation = {
      kind: side === 'mine' ? 'dealt' : 'taken',
      move: a.move,
      amount: ko && !heldOn ? left : a.amount,
      ko,
      crit: !!a.crit,
      mine: {
        idx: mineIdx,
        megaOn: mm.megaOn,
        alt: mm.alt,
        transform: mm.transform ? { ...mm.transform } : null,
        boosts: { ...mm.boosts },
        status: mm.status,
        hp: mm.hp,
        itemGone: mm.itemGone,
      },
      opp: {
        megaOn: om.megaOn,
        alt: om.alt,
        boosts: { ...om.boosts },
        status: om.status,
        hpPct: om.hp,
        itemGone: om.itemGone,
      },
      field: fieldFor(foe, targetIdx),
      opts,
    }
    // 내 흡수기: 입력한 흡수 후 HP − 지금 HP = 회복량 → 상대가 잃은 실수치 HP 범위 (가득 찼으면 회복량이 잘려서 모름)
    const after = drainAfterOf(side, userIdx, targetIdx, a)
    const eff = move.effects.find((e) => e.type === 'drain')
    if (after != null && eff?.type === 'drain' && after < maxHp('mine', mineIdx)) {
      const bigRoot = heldItem('mine', mineIdx) === 'bigroot'
      const range = drainLostRange(after - mm.hp, eff.ratio, bigRoot)
      if (range) obs.drainLost = range
    }
    om.obs = [...(om.obs ?? []), obs]
  }
  // 추정 기록 지우기 (입력을 잘못했을 때)
  const resetEstimate = (oi: number) => {
    const m = mon('opp', oi)
    m.obs = []
    m.speedSp = null
    m.hpObs = []
    m.hpCheck = null
  }

  // ── 계산용 헬퍼 ─────────────
  // defIdx: 맞는 포켓몬 (더블에서 그 아군의 프렌드가드 판정용)
  const fieldFor = (defSide: BattleSide, defIdx?: number | null): FieldState => {
    const s = state.value!
    const scr = s.sides[defSide].screens
    const friendGuard =
      N > 1 &&
      defIdx != null &&
      s.sides[defSide].active.some(
        (i) =>
          i != null &&
          i !== defIdx &&
          !isFainted(defSide, i) &&
          resolveAt(defSide, i)?.ability === 'friendguard',
      )
    return {
      friendGuard,
      weather: s.weather.key,
      terrain: s.terrain.key,
      doubles: N > 1,
      gravity: !!s.rooms.gravity,
      wonderRoom: !!s.rooms.wonderroom,
      magicRoom: !!s.rooms.magicroom,
      reflect: !!scr.reflect,
      lightScreen: !!scr.lightscreen,
      auroraVeil: !!scr.auroraveil,
    }
  }
  // 같은 편 다른 칸의 포켓몬 (더블). 없거나 쓰러졌으면 null
  const allyOf = (side: BattleSide, slot: number): number | null => {
    if (N < 2) return null
    const i = state.value!.sides[side].active[1 - slot]
    return i != null && !isFainted(side, i) ? i : null
  }
  const hitsAlly = (moveId: string) => {
    const mv = gd.move(moveId)
    return !!mv && mv.category !== 'status' && mv.target === HITS_ALLY_TARGET
  }
  // 상대(쓰러진 것은 확인된 포켓몬만) 포함 같은 편에서 쓰러진 수 — 총대장
  const faintedCount = (side: BattleSide) =>
    state.value!.sides[side].mons.filter(
      (m, i) => m.hp <= 0 && (side === 'mine' || state.value!.sides.opp.revealed.includes(i)),
    ).length
  // 이 포켓몬이 moveId 를 쓸 때 배틀 상태에서 정해지는 보정 (도우미 / 총대장 / 메트로놈 / 충전)
  const attackOpts = (side: BattleSide, idx: number, moveId: string): DamageOptions => {
    const m = mon(side, idx)
    return {
      helpingHand: helpingHandFor(side, idx),
      faintedAllies: faintedCount(side),
      metronomeCount: m.lastMove === moveId ? m.moveStreak + 1 : 0,
      charged: !!m.volatiles.charge,
      timesHit: m.timesHit || 0,
      lastMoveFailed: !!m.lastFailed,
      stockpile: m.volatiles.stockpile || 0,
      focusEnergy: !!m.volatiles.focusenergy,
      // 집단구타: 같은 편 중 쓰러지지 않고 상태이상이 없는 포켓몬(자신 포함)의 공격 종족값
      beatUp: state.value!.sides[side].mons.flatMap((x, i) =>
        x.hp > 0 && (!x.status || i === idx) ? [resolveAt(side, i)?.species.stats.atk ?? 0] : [],
      ),
    }
  }
  // 같은 편 다른 칸이 이번 턴 도우미를 쓰면 (도우미는 우선도 +5 라서 항상 먼저) 위력 1.5배
  const helpingHandFor = (side: BattleSide, idx: number) => {
    if (N < 2) return false
    const sd = state.value!.sides[side]
    return state.value!.actions[side].some((a, slot) => {
      const user = sd.active[slot]
      return (
        user != null &&
        user !== idx &&
        !isFainted(side, user) &&
        a.kind === 'move' &&
        a.move === 'helpinghand'
      )
    })
  }
  // 필드에 살아있는 상대가 2마리 이상이면 광역기 0.75배
  const spreadActive = (defSide: BattleSide) =>
    N > 1 &&
    state.value!.sides[defSide].active.filter((i) => i != null && !isFainted(defSide, i)).length > 1

  // attacking: 공격하는 쪽으로 계산 (킬가르도는 공격 순간 블레이드폼)
  // altOverride: 맞는 시점의 배틀 폼 (formAtHit)
  const combatantOf = (
    side: BattleSide,
    idx: number,
    megaOverride?: boolean,
    attacking = false,
    altOverride?: boolean,
  ) => {
    const resolved = resolveAt(side, idx, megaOverride, altOverride)
    if (!resolved) return null
    // 공격할 때 폼이 바뀌면(킬가르도 블레이드폼) 그 폼의 상대 실능치도 범위로 다시
    const formed = attacking ? calc.attackForm(resolved) : resolved
    const r = side === 'opp' && formed !== resolved ? withOppStats(idx, formed)! : formed
    const m = mon(side, idx)
    const active = state.value!.sides[side].active.includes(idx)
    const hp = side === 'mine' ? m.hp : hpOfPct(m.hp, r.stats.hp)
    return {
      ...calc.combatant(r, {
        status: m.status,
        boosts: active ? m.boosts : undefined,
        hp,
        item: m.itemGone ? '' : undefined,
      }),
      floating: active && !!m.volatiles.magnetrise,
      // 대타 HP (실수치): 상대는 % 를 그 포켓몬 최대 HP 기준으로
      sub:
        active && m.volatiles.substitute
          ? side === 'mine'
            ? m.volatiles.substitute
            : Math.floor((r.stats.hp * m.volatiles.substitute) / 100)
          : undefined,
    }
  }
  // 상대 배분 범위의 양 끝으로 바꾼 전투 정보 [약한 쪽, 강한 쪽] (내 쪽·변신한 상대·범위가 없으면 하나).
  //   defStat 지정(맞는 쪽): 관측과 맞는 조합 중 내구 H×B(D) 가 가장 작은 / 큰 것
  //   아니면(공격하는 쪽): 공격·특공·방어(바디프레스) 가장 낮은 / 높은 값
  const combatantRange = (
    side: BattleSide,
    idx: number,
    megaOverride?: boolean,
    attacking = false,
    altOverride?: boolean,
    defStat?: 'def' | 'spd',
  ): Combatant[] => {
    const one = combatantOf(side, idx, megaOverride, attacking, altOverride)
    if (!one) return []
    const m = mon(side, idx)
    if (side === 'mine' || m.transform) return [one]
    const bd = oppBounds(idx, one.species.stats)
    if (!bd) return [one]
    const make = (stats: StatTable) => ({
      ...one,
      stats,
      hp: hpOfPct(m.hp, stats.hp),
      sub: one.sub != null ? Math.floor((stats.hp * m.volatiles.substitute!) / 100) : undefined,
    })
    if (defStat) {
      const at = (p: { hp: number; stat: number }) =>
        make({ ...one.stats, hp: p.hp, [defStat]: p.stat })
      return [at(bd.frail[defStat]), at(bd.tank[defStat])]
    }
    return [
      make({ ...one.stats, atk: bd.atk.min, spa: bd.spa.min, def: bd.def.min }),
      make({ ...one.stats, atk: bd.atk.max, spa: bd.spa.max, def: bd.def.max }),
    ]
  }
  // 더블: 이번 턴 이 행동보다 먼저 같은 상대 칸(k)을 때리는 같은 편 행동의 데미지 합 (대타가 받은 건 제외)
  const earlierDamage = (side: BattleSide, slot: number, k: number) => {
    const order = turnOrder()
    const me = order.findIndex((e) => e.side === side && e.slot === slot)
    const foe = foeOf(side)
    const ti = state.value!.sides[foe].active[k]
    if (me < 0 || ti == null) return 0
    let sum = 0
    for (const e of order.slice(0, me)) {
      if (e.side !== side) continue
      const a = state.value!.actions[side][e.slot]!
      if (a.kind !== 'move' || a.missed) continue
      if (behindSub(side, e.idx, foe, ti, a.move)) continue
      if (a.target === k) sum += a.amount || 0
      else if (isSpreadMove(gd.move(a.move))) sum += a.amount2 || 0
    }
    return sum
  }
  // ── 성별 (헤롱헤롱) ─────────────
  // 'M' | 'F' | 'N'(무성) | ''(모름). 성별이 정해진 종은 데이터, 아니면 슬롯에서 고른 값
  const genderOf = (side: BattleSide, idx: number) => {
    const slot = slotsOf(side)[idx]
    return gd.pokemon(slot?.species)?.gender ?? slot?.gender ?? ''
  }
  // 헤롱헤롱이 걸리는가: 'yes' 서로 다른 성별 / 'no' 같은 성별·무성 / 'maybe' 한쪽이라도 모름
  const attractable = (aSide: BattleSide, aIdx: number, tSide: BattleSide, tIdx: number) => {
    const a = genderOf(aSide, aIdx)
    const t = genderOf(tSide, tIdx)
    if (a === 'N' || t === 'N') return 'no'
    if (!a || !t) return 'maybe'
    return a !== t ? 'yes' : 'no'
  }

  // ── 이번 턴 확률 효과 (체크 입력) ─────────────
  // side 의 slot 행동이 이번 턴 기술 순서상 foe 의 tIdx 보다 먼저인가 (풀죽음은 아직 행동하지 않은 상대에게만)
  const actsBefore = (side: BattleSide, slot: number, foe: BattleSide, tIdx: number) => {
    const order = turnOrder()
    const me = order.findIndex((e) => e.side === side && e.slot === slot)
    const them = order.findIndex((e) => e.side === foe && e.idx === tIdx)
    return me >= 0 && them > me
  }
  // side 의 slot 기술로 상대 tIdx 에게 확률로 생길 수 있는 효과 (걸릴 수 있는 것만):
  //   기술 부가효과(확률 < 100) / 트라이어택·비몽사몽 / 왕의징표석·악취(풀죽음 10%, 풀죽음 확률이 있는 기술과는 중첩 안 됨)
  //   / 독수(접촉 30% 독) / 사슬독(30% 맹독). 인분·대타면 없음, 우격다짐이면 기술 부가효과 없음
  //   / 이미 걸렸거나 면역인 상태이상·혼란은 제외, 풀죽음은 상대가 이번 턴 아직 행동하지 않았을 때만 (정신력 제외)
  const possibleInflicts = (side: BattleSide, slot: number, tIdx: number | null): string[] => {
    const s = state.value!
    const a = s.actions[side][slot]
    const ui = s.sides[side].active[slot]
    const foe = foeOf(side)
    if (!a || a.kind !== 'move' || !a.move || ui == null || tIdx == null) return []
    const move = gd.move(a.move)
    const user = resolveAt(side, ui)
    const target = resolveAt(foe, tIdx)
    if (!move || !user || !target || isFainted(foe, tIdx)) return []
    // 헤롱헤롱(기술): 성별을 몰라 자동으로 걸지 못할 때만 체크로 (같은 성별·무성·둔감·이미 걸림이면 없음)
    if (move.category === 'status')
      return a.move === 'attract' &&
        target.ability !== 'oblivious' &&
        !mon(foe, tIdx).volatiles.attract &&
        attractable(side, ui, foe, tIdx) === 'maybe'
        ? ['attract']
        : []
    const sheer = user.ability === 'sheerforce'
    // 랭크 변화 확률 효과 (100% 미만, 우격다짐이면 없음): 자기 쪽(원석의힘·코멧펀치 등)은 주 대상 칸에만,
    // 상대 쪽(섀도볼 특방 −1 등)은 인분·대타면 없음
    const chanceBoosts = sheer
      ? []
      : (move.effects as MoveEffect[]).filter(
          (e): e is Extract<MoveEffect, { type: 'boost' }> =>
            e.type === 'boost' && !!e.chance && e.chance < 100,
        )
    const main = hitTarget(side, slot, turnOrder(), a.target).idx === tIdx
    const selfKeys = main
      ? chanceBoosts.filter((e) => e.target === 'self').map((e) => boostKey('self', e.stats))
      : []
    if (target.ability === 'shielddust' || behindSub(side, ui, foe, tIdx, a.move)) return selfKeys
    const targetKeys = chanceBoosts
      .filter((e) => e.target !== 'self')
      .map((e) => boostKey('target', e.stats))
    const out = new Set<string>()
    const chance = (move.effects as MoveEffect[]).filter(
      (e) =>
        (e.type === 'status' || e.type === 'volatile') &&
        e.target === 'target' &&
        !!e.chance &&
        e.chance < 100,
    )
    const random = RANDOM_STATUS_MOVES[a.move] ?? []
    if (!sheer) {
      for (const e of chance) if (e.type === 'status' || e.type === 'volatile') out.add(e.status)
      for (const st of random) out.add(st)
    }
    const hasFlinch = (move.effects as MoveEffect[]).some(
      (e) => e.type === 'volatile' && e.status === 'flinch',
    )
    const um = mon(side, ui)
    // 상대는 확정 전이면 추측 도구도 가능성에 넣음 (체크는 실제로 본 것)
    const held = user.slot.item || (side === 'opp' ? guessedItem(ui) : '')
    const item = um.itemGone || s.rooms.magicroom || user.ability === 'klutz' ? '' : held
    const boosted = sheer && (chance.length > 0 || random.length > 0)
    if (!hasFlinch && !boosted && (item === 'kingsrock' || user.ability === 'stench'))
      out.add('flinch')
    if (user.ability === 'poisontouch' && move.flags.includes('contact')) out.add('psn')
    if (user.ability === 'toxicchain') out.add('tox')
    const tm = mon(foe, tIdx)
    const statuses = [...STATUSES, 'flinch', 'confusion'].filter((k) => {
      if (!out.has(k)) return false
      if (k === 'flinch')
        return target.ability !== 'innerfocus' && actsBefore(side, slot, foe, tIdx)
      if (k === 'confusion') return !tm.volatiles.confusion && target.ability !== 'owntempo'
      return !statusBlocked(foe, tIdx, k as Exclude<Status, ''>)
    })
    return [...statuses, ...targetKeys, ...selfKeys]
  }
  // side 의 slot 공격기가 맞으면 반드시 생기는 효과 (확정 효과·확률 100% 부가효과 — 턴 적용 때 자동 반영, 화면은 체크 고정으로 표시).
  // 랭크 변화(자기 쪽은 주 대상 칸에만)와 상태이상. 인분·대타면 상대 쪽은 없음, 걸 수 없는 상태이상은 제외
  const sureInflicts = (side: BattleSide, slot: number, tIdx: number | null): string[] => {
    const s = state.value!
    const a = s.actions[side][slot]
    const ui = s.sides[side].active[slot]
    const foe = foeOf(side)
    if (!a || a.kind !== 'move' || !a.move || ui == null || tIdx == null) return []
    const move = gd.move(a.move)
    const user = resolveAt(side, ui)
    const target = resolveAt(foe, tIdx)
    if (!move || move.category === 'status' || !user || !target || isFainted(foe, tIdx)) return []
    const sheer = user.ability === 'sheerforce'
    const main = hitTarget(side, slot, turnOrder(), a.target).idx === tIdx
    const covered = target.ability === 'shielddust' || behindSub(side, ui, foe, tIdx, a.move)
    const out: string[] = []
    for (const e of move.effects as MoveEffect[]) {
      if (e.type !== 'boost' && e.type !== 'status') continue
      const chance = 'chance' in e ? e.chance : undefined
      if (chance && (chance < 100 || sheer)) continue
      if (e.type === 'boost') {
        if (e.target === 'self') {
          if (main) out.push(boostKey('self', e.stats))
        } else if (!covered && !(chance && target.ability === 'shielddust'))
          out.push(boostKey('target', e.stats))
      } else if (!covered && !statusBlocked(foe, tIdx, e.status)) out.push(e.status)
    }
    return out
  }
  // side 의 slot 기술이 접촉해서, 맞는 상대 tIdx 의 특성으로 공격한 쪽에게 생길 수 있는 효과
  //   (원격(긴 팔)이면 없음, 포자는 풀 타입·방진·방진고글 무효, 대타가 맞으면 없음)
  const possibleContactInflicts = (side: BattleSide, slot: number, tIdx: number | null) => {
    const s = state.value!
    const a = s.actions[side][slot]
    const ui = s.sides[side].active[slot]
    const foe = foeOf(side)
    if (!a || a.kind !== 'move' || !a.move || ui == null || tIdx == null) return []
    const move = gd.move(a.move)
    const user = resolveAt(side, ui)
    const target = resolveAt(foe, tIdx)
    if (!move || !move.flags.includes('contact') || !user || !target) return []
    if (user.ability === 'longreach' || behindSub(side, ui, foe, tIdx, a.move)) return []
    const list = CONTACT_STATUS_ABILITY[target.ability] ?? []
    const um = mon(side, ui)
    if (
      target.ability === 'effectspore' &&
      (user.species.types.includes('grass') ||
        user.ability === 'overcoat' ||
        (user.slot.item === 'safetygoggles' && !um.itemGone))
    )
      return []
    return list.filter((k) =>
      k === 'attract'
        ? !um.volatiles.attract &&
          user.ability !== 'oblivious' &&
          attractable(foe, tIdx, side, ui) !== 'no'
        : !statusBlocked(side, ui, k as Exclude<Status, ''>),
    )
  }

  // 혼란 자해 예상 데미지 [최소, 최대] (mine: 실수치, opp: 최대 HP 의 %)
  const confusionRange = (side: BattleSide, idx: number): [number, number] | null => {
    const c = combatantOf(side, idx)
    if (!c) return null
    const rolls = confusionDamage(c, fieldFor(side, idx))
    const conv = (v: number) =>
      side === 'mine' ? v : Math.round((v / Math.max(1, c.stats.hp)) * 1000) / 10
    return [conv(rolls[0]!), conv(rolls[15]!)]
  }

  // 교체할 수 없는가 (행동의 "교체"만. 유턴·볼트체인지 등 교체기는 됨)
  //   요정의자물쇠 / 문어굳히기·물고버티기·조이기류(고스트 타입은 무시) / 뿌리박기 / 상대 그림자밟기(고스트·그림자밟기 제외).
  //   도구 아름다운허물이면 모두 무시
  const switchBlocked = (side: BattleSide, slot: number) => {
    const s = state.value!
    if (s.fairyLock > 0) return true
    const idx = s.sides[side].active[slot]
    if (idx == null || isFainted(side, idx)) return false
    const m = mon(side, idx)
    const r = resolveAt(side, idx)
    if (!r || (r.slot.item === 'shedshell' && !m.itemGone)) return false
    if (m.volatiles.ingrain) return true
    if (r.species.types.includes('ghost')) return false
    if (TRAP_VOLATILES.some((k) => m.volatiles[k])) return true
    const foe = foeOf(side)
    return (
      r.ability !== 'shadowtag' &&
      s.sides[foe].active.some(
        (i) => i != null && !isFainted(foe, i) && resolveAt(foe, i)?.ability === 'shadowtag',
      )
    )
  }

  // 행동 패널: 공격 후 교체 입력이 필요한 경우
  const canSelfSwitch = (side: BattleSide, slot: number) => {
    const s = state.value!
    const a = s.actions[side][slot]
    if (!a || a.kind !== 'move' || !a.move) return false
    if (PIVOT_MOVES.has(a.move)) return true
    const foe = foeOf(side)
    const t = s.sides[foe].active[a.target]
    const mv = gd.move(a.move)
    return (
      t != null &&
      !!mv &&
      mv.category !== 'status' &&
      resolveAt(foe, t)?.slot.item === 'redcard' &&
      !mon(foe, t).itemGone
    )
  }
  const canForceSwitch = (side: BattleSide, slot: number) => {
    const s = state.value!
    const a = s.actions[side][slot]
    if (!a || a.kind !== 'move' || !a.move) return false
    if (FORCE_MOVES.has(a.move)) return true
    const foe = foeOf(side)
    const t = s.sides[foe].active[a.target]
    const mv = gd.move(a.move)
    if (t == null || !mv || mv.category === 'status') return false
    const r = resolveAt(foe, t)
    return (
      (r?.slot.item === 'ejectbutton' && !mon(foe, t).itemGone) ||
      r?.ability === 'emergencyexit' ||
      r?.ability === 'wimpout'
    )
  }
  // 교체로 나올 수 있는 포켓몬 (필드에 없고 쓰러지지 않은). 상대는 아직 안 나온 파티 포함
  const benchOf = (side: BattleSide) => {
    const s = state.value!
    return s.sides[side].mons
      .map((_, i) => i)
      .filter(
        (i) =>
          !s.sides[side].active.includes(i) &&
          !isFainted(side, i) &&
          (side === 'mine' || !!oppSlots.value[i]?.species),
      )
  }
  // 정정 모드: 필드 포켓몬 바꾸기가 교체 효과 없이 적용됨
  const editMode = useState(`battle-${mode}-edit`, () => false)

  return {
    N,
    canSelfSwitch,
    canForceSwitch,
    benchOf,
    editMode,
    staleReason,
    state,
    mineSlots,
    oppSlots,
    ensure,
    reset,
    resolveAt,
    maxHp,
    isFainted,
    sendOut,
    setWeather,
    toggleWeather,
    toggleTerrain,
    toggleRoom,
    adjustCounter,
    toggleSideCondition,
    setStatus,
    toggleVolatile,
    confirmItem,
    confirmAbility,
    oppAbilityOf,
    residualPlan,
    changeBoost,
    setMega,
    sideMegaUsed,
    canMegaEvolve,
    setAlt,
    toggleItemGone,
    toggleTransform,
    canTransform,
    resolveSnapshot,
    speedOf,
    movePriority,
    turnMega,
    turnOrder,
    actionOpts,
    hitTarget,
    formAtHit,
    turnStateBefore,
    withTurnState,
    fieldWithTurnState,
    speedEnvOf,
    pendingSpeedObservation,
    speedRangesOf,
    speedOrder,
    entryPairsNow,
    entryObsOf,
    setEntryOrder,
    pendingReplace,
    battleResult,
    replaceOptions,
    replaceFainted,
    resetEstimate,
    helpingHandFor,
    allyOf,
    hitsAlly,
    attackOpts,
    validationError,
    canUndo,
    undo,
    executeTurn,
    fieldFor,
    spreadActive,
    combatantOf,
    combatantRange,
    oppBoundsNow,
    oppEstimate: estimator.estimate,
    isStatusMove,
    confusionRange,
    behindSub,
    drainObservable,
    possibleInflicts,
    sureInflicts,
    possibleContactInflicts,
    genderOf,
    wakeChance,
    sleepsThrough,
    encoreMove,
    encoreTurnsLeft,
    maxPp,
    ppUsedOf,
    oppItemOf,
    guessedItem,
    switchBlocked,
    earlierDamage,
  }
}
