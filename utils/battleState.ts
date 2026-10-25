// utils/battleState.ts
// 배틀 상태의 타입과 상수 (useBattle 과 composables/battle/* 가 공유, 컴포넌트·테스트도 여기서 import).
// 상태 자체와 진행 로직은 composables/useBattle.ts 가 조립한다.

import type { DamageOptions, FieldState } from '~/utils/damage'
import type { HpCheck, HpObservation } from '~/utils/hpDisplay'
import type { SpeedEnv, SpeedRanges } from '~/utils/speedInference'
import type { BoostTable, RankKey, StatTable, Status, Terrain, Weather } from '~/utils/types'

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
export const SCREENS = new Set([
  'reflect',
  'lightscreen',
  'auroraveil',
  'safeguard',
  'mist',
  'tailwind',
  'luckychant',
])
export const SCREEN_TURNS: Record<string, number> = { tailwind: 4 }
export const HAZARD_MAX: Record<string, number> = {
  spikes: 3,
  toxicspikes: 2,
  stealthrock: 1,
  stickyweb: 1,
}

export const WEATHER_ABILITY: Record<string, Weather> = {
  drought: 'sun',
  drizzle: 'rain',
  sandstream: 'sand',
  snowwarning: 'snow',
}
export const PRIMAL_ABILITY: Record<string, Weather> = {
  deltastream: 'strongwinds',
  desolateland: 'harshsun',
  primordialsea: 'heavyrain',
}
export const TERRAIN_ABILITY: Record<string, Terrain> = {
  electricsurge: 'electric',
  grassysurge: 'grassy',
  mistysurge: 'misty',
  psychicsurge: 'psychic',
}
// 등장할 때 문구가 나오는 특성 (양쪽 다 나오면 문구 순서 = 발동 순서 = 스피드 순)
export const ENTRY_MESSAGE = new Set([
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
export const WEATHER_ROCK: Partial<Record<Weather, string>> = {
  sun: 'heatrock',
  rain: 'damprock',
  sand: 'smoothrock',
  snow: 'icyrock',
}
// 위협이 통하지 않는 특성 (클리어바디류·괴력집게는 statChange 에서 막음)
export const INTIMIDATE_IMMUNE = new Set(['innerfocus', 'oblivious', 'owntempo', 'scrappy'])
// 상대가 내리는 랭크 하락 무효: 전체 / 특정 능력치
export const BLOCK_FOE_DROPS = new Set(['clearbody', 'whitesmoke', 'fullmetalbody'])
// 상대가 내리는 그 능력만 막음 (괴력집게 공격, 부풀린가슴 방어, 날카로운눈 명중)
export const BLOCK_STAT_DROP: Record<string, RankKey> = {
  hypercutter: 'atk',
  bigpecks: 'def',
  keeneye: 'accuracy',
  mindseye: 'accuracy',
}
// 아군도 맞히는 광역기 (지진/파도타기/방전/대폭발 등)
export const HITS_ALLY_TARGET = 'allAdjacent'
export const BASE_TURNS = 5
export const EXTENDED_TURNS = 8
export const MAX_HISTORY = 30

export const zeroBoosts = (): BoostTable => ({
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
  accuracy: 0,
  evasion: 0,
})
export const newMon = (hp: number): MonState => ({
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
export const newAction = (): ActionState => ({
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
export const FOE_TARGETS = new Set([
  'normal',
  'any',
  'randomNormal',
  'allAdjacentFoes',
  'allAdjacent',
  'foeSide',
])
export const BATON_VOLATILES = new Set([
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
export const RANDOM_STATUS_MOVES: Record<string, Exclude<Status, ''>[]> = {
  triattack: ['brn', 'par', 'frz'],
  direclaw: ['psn', 'par', 'slp'],
}
// 접촉한 상대에게 상태를 거는 특성 (맞는 쪽)
export const CONTACT_STATUS_ABILITY: Record<string, string[]> = {
  static: ['par'],
  flamebody: ['brn'],
  poisonpoint: ['psn'],
  effectspore: ['psn', 'par', 'slp'],
  cutecharm: ['attract'],
}
// 쓴 다음 턴 행동 불가인 특수 상태: 반동(파괴광선류) / 게으름(특성). 1 = 이번 턴에 씀, 2 = 이번 턴 행동 불가
export const LOAF_VOLATILES = ['mustrecharge', 'truant']
// 교체를 막는 특수 상태 (고스트 타입은 뿌리박기 말고는 무시)
export const TRAP_VOLATILES = ['octolock', 'jawlock', 'partiallytrapped']
// 잠든 채로 쓰는 기술 (써도 깨지 않음)
export const SLEEP_MOVES = new Set(['sleeptalk', 'snore'])
// 다른 기술을 불러내는 기술 (행동 칸에서 나간 기술을 따로 고름)
export const CALLER_MOVES = new Set(['sleeptalk', 'copycat'])
export const TRANSFORM_PP = 5 // 변신으로 복사한 기술의 PP
// 맞은 얼음 상태 포켓몬을 녹이는 기술: 불꽃 타입 공격기 + 열탕·스팀버스트·열사의대지
export const THAW_MOVES = new Set(['scald', 'steameruption', 'scorchingsands', 'matchagotcha'])
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
export const CRASH_MOVES = new Set(['highjumpkick', 'axekick', 'supercellslam'])

// 상대 배분은 모른다 → 배틀 슬롯은 기준값(SP 0·무보정)으로 두고 실능치는 추정 범위로 정한다 (useBattle "상대 배분")
export const NO_SP: StatTable = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
export const NO_TRANSFORM = { megaOn: false, alt: false }

// 상태이상을 걸 수 있는지: 이미 상태이상 / 타입(전기 마비, 불꽃 화상, 독·강철 독, 얼음 얼음) / 특성 / 신비의부적 / 미스트필드
export const STATUS_TYPE_IMMUNE: Record<string, string[]> = {
  par: ['electric'],
  brn: ['fire'],
  psn: ['poison', 'steel'],
  tox: ['poison', 'steel'],
  frz: ['ice'],
}
export const STATUS_ABILITY_IMMUNE: Record<string, string[]> = {
  par: ['limber'],
  brn: ['waterveil', 'waterbubble', 'thermalexchange'],
  psn: ['immunity'],
  tox: ['immunity'],
  slp: ['insomnia', 'vitalspirit'],
  frz: ['magmaarmor'],
}
