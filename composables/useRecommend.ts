// composables/useRecommend.ts
// 추천 플레이 (싱글): 지금 배틀 상태로 내 선택지(기술·교체기 × 들어갈 포켓몬·교체) × 상대 선택지(기술·교체) 이득표를 만들어
// utils/recommend.ts 로 순위를 매긴다.
//   - 상대 기술 후보: 쓴 기술(확정) + 선출 화면 기술. 사전 비중 = 확정 1 / 사용률 통계의 채용률 (없으면 0.5)
//   - 상대 교체 후보: 공개된 대기 포켓몬 (사전 비중 oppSwitch) + 선출 수가 다 공개되지 않았으면 아직 안 나온 파티 (남은 선출 수로 나눠서)
//   - 상대 교체기(유턴 등)는 들어올 포켓몬마다 따로 (기술의 사전 비중을 교체 후보 비중대로 나눔)
//   - 상대 선택지 비중 = 사전 비중 × exp(smart × 상대에게 유리한 정도) (playWeights: 내 예상 선택과 주고받아 다듬음, 1턴 결과표 기준)
//   - 상대 배분은 추정 범위의 양 끝, 도구는 확정 전이면 선출 화면 도구(추측)로 계산
//   - 메가진화할 수 있으면 메가진화한다고 보고 계산 (상대도 마찬가지)
//   - 반영: 행동 불가(잠듦·얼음·반동·마비·혼란·헤롱헤롱), 풀죽음(속이기는 나온 첫 턴만), 잠듦·화상·마비·독(변화기 + 부가효과 확률),
//     반동·흡수·생명의구슬, 방어, 회복기, 벽, 설치기, 교체기, 구애 도구 고정, 기습(상대가 변화기·교체면 실패),
//     날씨·필드·트릭룸·순풍(기술·등장 특성), 앙코르, 도발, 하품, 대타, 씨뿌리기, 탁쳐서떨구기, 등장 시 위협, 턴 끝 회복·데미지
//   - 두 턴 앞 (depth 2): 이번 턴이 끝난 상태(Ctx)에서 다음 턴을 한 번 더 같은 방식으로 계산해, 맞대결 전망 대신 그 최선값을 더한다
//   - 데이터에 효과가 없는 기술(잠자기·저주·아픔나누기·울부짖기 등)은 specialOf 에서 직접
//   - 보지 않는 것: 나머지 특수 상태, 세 턴 이상 앞의 수읽기
//   - 내 포켓몬이 쓰러져 교체할 차례면 대기 포켓몬을 비교
// 계산이 무거워서 화면에서 열었을 때만 계산한다 (enabled). 가중치·깊이는 화면에서 바꾸고 localStorage 에 저장 (useRecWeights).

import { shallowRef, toRaw } from 'vue'
import type { useBattle } from '~/composables/useBattle'
import { useTeamCalc, type Cell } from '~/composables/useTeamCalc'
import { useRegulation } from '~/composables/useRegulation'
import {
  calcDamage,
  hasSecondary,
  hitInfo,
  isGrounded,
  isSpreadMove,
  perHitDamage,
  REVENGE_MOVES,
  type Combatant,
  type DamageOptions,
  type FieldState,
} from '~/utils/damage'
import { hitChance } from '~/utils/accuracy'
import { boostMultiplier, clampBoost } from '~/utils/stats'
import {
  INTIMIDATE_IMMUNE,
  LOAF_VOLATILES,
  PIVOT_MOVES,
  STATUS_ABILITY_IMMUNE,
  STATUS_TYPE_IMMUNE,
  TERRAIN_ABILITY,
  WAKE_CHANCE,
  WEATHER_ABILITY,
  type BattleSide,
} from '~/utils/battleState'
import {
  DEFAULT_WEIGHTS,
  advanceSkip,
  afterFor,
  blendOutcome,
  cappedDamage,
  comboHit,
  evaluate,
  firstChance,
  normalizeWeights,
  outlook,
  winFromOutlook,
  rankOutcomes,
  playWeights,
  safest,
  skipDist,
  softPick,
  type AfterCases,
  type BenchDuel,
  type Duel,
  type Exchange,
  type Hit,
  type Outcome,
  type Ranked,
  type RecWeights,
  type ScoreParts,
  type SelfEffect,
  type Skip,
  type WeightPreset,
  WEIGHT_PRESETS,
} from '~/utils/recommend'
import {
  BOOST_KEYS,
  type BoostKey,
  type BoostTable,
  type Move,
  type Status,
  type Terrain,
  type Weather,
} from '~/utils/types'

type Battle = ReturnType<typeof useBattle>

const PROTECT_MOVES = new Set([
  'protect',
  'detect',
  'kingsshield',
  'spikyshield',
  'banefulbunker',
  'silktrap',
  'burningbulwark',
  'obstruct',
])
const CHOICE_ITEMS = new Set(['choiceband', 'choicespecs', 'choicescarf'])
// 2~3턴 같은 기술로 고정되고 교체도 못 하는 기술 (역린류)
const RAMPAGE_MOVES = new Set(['outrage', 'petaldance', 'thrash', 'ragingfury'])
// 역린류 고정 중인 쪽의 맞대결 공격 효율: 고정이 끝나면 혼란(2~5턴, 자해 1/3)이라 평균으로 어림
const RAMPAGE_DUEL = 0.85
// 나온 첫 턴에만 성공하는 기술
const FIRST_TURN_MOVES = new Set(['fakeout', 'firstimpression'])
// 상대가 공격기를 쓸 때만 성공하는 기술
const SUCKER_MOVES = new Set(['suckerpunch', 'thunderclap'])
const SCREEN_FIELD = {
  reflect: 'reflect',
  lightscreen: 'lightScreen',
  auroraveil: 'auroraVeil',
} as const
type ScreenKey = keyof typeof SCREEN_FIELD
// 날씨·필드에서 스피드 2배인 특성
const WEATHER_SPEED: Record<string, string> = {
  swiftswim: 'rain',
  chlorophyll: 'sun',
  sandrush: 'sand',
  slushrush: 'snow',
}
const TERRAIN_SPEED: Record<string, string> = { surgesurfer: 'electric' }
// 모래바람 데미지를 받지 않는 특성
const SAND_IMMUNE = new Set(['sandveil', 'sandrush', 'sandforce', 'overcoat', 'magicguard'])
// 위협을 받지 않는 특성 (INTIMIDATE_IMMUNE 외 능력 하락 자체를 막는 특성)
const NO_DROP = new Set(['clearbody', 'whitesmoke', 'fullmetalbody', 'hypercutter'])
// 상대 특성을 무시하는 특성
const MOLD_BREAKER = new Set(['moldbreaker', 'teravolt', 'turboblaze'])
// 도발이 안 걸리는 특성
const TAUNT_IMMUNE = new Set(['oblivious', 'aromaveil'])
// 설치기를 밟는 포켓몬이 실제로 들어오는 정도 (전원이 한 번씩은 들어온다고 보되, 배틀이 먼저 끝날 수 있어서 조금 깎음)
const HAZARD_ENTRY = 0.7
// 앙코르로 변화기에 묶이면 공격하지 못하는 턴 (3턴 중 이번 턴 뒤로)
const ENCORE_SKIP = 2
// 하품: 맞대결 전망에서는 잠드는 것으로 보되 교체로 피할 수 있어서 이 비율만
const YAWN_SLEEP = 0.7
// 두 턴 앞: 비중이 이보다 작은 상대 선택지·경우는 다음 턴을 계산하지 않고 맞대결 전망으로
const DEPTH_MIN_P = 0.05
// 상대 선출 수 (싱글)
const OPP_PICK = 3
// 상대 교체 비율 기준값 (행동 경향 보정)
const SWITCH_BASE = 0.2
// 날씨에 따라 회복량이 바뀌는 회복기 (쾌청 2/3, 비·모래바람·설경 1/4, 그 외 1/2). 모래모으기는 모래바람 2/3
const SUN_HEAL = new Set(['moonlight', 'synthesis', 'morningsun'])
const WEAK_HEAL_WEATHER = new Set(['rain', 'heavyrain', 'sand', 'snow'])
// 맞는 쪽을 강제로 교체시키는 기술
const PHAZE_MOVES = new Set(['roar', 'whirlwind', 'dragontail', 'circlethrow'])
// 설치기를 치우는 기술 (안개제거는 양쪽, 나머지는 자기 쪽)
const HAZARD_CLEAR = new Set(['defog', 'rapidspin', 'mortalspin', 'tidyup'])
// 설치기 최대 겹수
const HAZARD_MAX: Record<string, number> = {
  stealthrock: 1,
  spikes: 3,
  toxicspikes: 2,
  stickyweb: 1,
}
// HP 1/2 이하에서 회복하는 열매 (오랭열매는 10 고정)
const HEAL_BERRY: Record<string, number> = { sitrusberry: 1 / 4 }
// 상태이상을 바로 고치는 열매
const CURE_BERRY: Record<string, Status | 'any'> = { lumberry: 'any', chestoberry: 'slp' }
// 접촉 공격을 한 쪽이 잃는 HP (울퉁불퉁멧 1/6, 까칠한피부·철가시 1/8)
const CONTACT_PUNISH_ITEM: Record<string, number> = { rockyhelmet: 1 / 6 }
const CONTACT_PUNISH_ABILITY: Record<string, number> = { roughskin: 1 / 8, ironbarbs: 1 / 8 }
// 가득일 때 받는 데미지 절반
const FULL_HP_GUARD = new Set(['multiscale', 'shadowshield'])
// 재생력: 물러나면 1/3 회복
const REGEN = 1 / 3
// 잠꼬대로 부를 수 없는 기술 (모으기·부르는 기술)
const NO_SLEEPTALK = new Set([
  'sleeptalk',
  'copycat',
  'bide',
  'focuspunch',
  'solarbeam',
  'skyattack',
  'meteorbeam',
  'electroshot',
])
// 깊이별로 다음 턴을 계산할 최소 비중 (깊을수록 드문 경우는 맞대결 전망으로)
//   (d = 그 아래로 몇 턴 더 보는가: 1 이면 바로 다음 턴만)
const depthMinP = (d: number) => (d >= 2 ? 0.15 : DEPTH_MIN_P)
// 화면에서 깊은 계산을 나눠 할 때 한 번에 계산하는 시간 (ms)
const SLICE_MS = 40
// 실제 턴 아래 턴에서 다음 턴까지 더 볼 내 선택지 수
const DEEP_TOP = 3
// 상대가 메가진화를 미룰 사전 비중 (메가진화하는 같은 기술 대비)
const OPP_DELAY_MEGA = 0.25
// 끝판: 양쪽 남은 포켓몬이 합쳐 이 수 이하면 세 턴 앞까지
const ENDGAME_LEFT = 3
// 1:1 끝판(양쪽 하나씩): 교체가 없어 선택지가 적으므로 더 깊게 (ENDGAME_DEEP 턴 앞까지, 1:1 에서 0.3~1.5초)
const ENDGAME_DEEP_LEFT = 2
const ENDGAME_DEEP = 4

const WEIGHTS_KEY = 'pch_rec_weights'
const DEPTH_KEY = 'pch_rec_depth'

// ── 가중치 · 깊이 (화면 입력, localStorage 저장) ─────────────
export function useRecWeights() {
  const weights = useState<RecWeights>('rec-weights', () => {
    try {
      const raw = localStorage.getItem(WEIGHTS_KEY)
      return normalizeWeights(raw ? JSON.parse(raw) : null)
    } catch {
      return { ...DEFAULT_WEIGHTS }
    }
  })
  // 몇 턴 앞까지 (1 / 2 / 3)
  const depth = useState<Depth>('rec-depth', () => {
    try {
      const v = Number(localStorage.getItem(DEPTH_KEY))
      return v === 2 || v === 3 ? v : 1
    } catch {
      return 1
    }
  })
  const store = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // 저장할 수 없는 환경 (사생활 보호 모드 등) — 이번 화면에서만 유지
    }
  }
  const set = (k: keyof RecWeights, v: unknown) => {
    weights.value = normalizeWeights({ ...weights.value, [k]: v })
    store(WEIGHTS_KEY, JSON.stringify(weights.value))
  }
  const reset = () => applyPreset('balanced')
  const applyPreset = (k: WeightPreset) => {
    weights.value = { ...WEIGHT_PRESETS[k] }
    store(WEIGHTS_KEY, JSON.stringify(weights.value))
  }
  const setDepth = (d: Depth) => {
    depth.value = d
    store(DEPTH_KEY, String(d))
  }
  return { weights, set, reset, applyPreset, depth, setDepth }
}

export type Depth = 1 | 2 | 3

// ── 상대 선택지 비중 직접 조정 (이번 배틀 동안만) ─────────────
// 키 = `${상대 로스터 번호}|${선택지 키}` → 'up'(자주 씀, 사전 비중 3배) / 'off'(안 씀)
export type OppPref = 'up' | 'off'
export const OPP_PREF_UP = 3
export const oppOptionKey = (o: OppOption) =>
  o.kind === 'switch'
    ? `switch:${o.to}`
    : `move:${o.move}${o.pivotTo != null ? `>${o.pivotTo}` : ''}${o.noMega ? '!' : ''}`
export function useRecOppPrefs() {
  const store = useState<{ sig: string; map: Record<string, OppPref> }>('rec-opp-prefs', () => ({
    sig: '',
    map: {},
  }))
  // 배틀이 바뀌면 (구성 signature) 없는 것으로 (다음에 바꿀 때 비움)
  const prefsFor = (sig: string): Record<string, OppPref> =>
    store.value.sig === sig ? store.value.map : {}
  // 보통 → 자주 씀 → 안 씀 → 보통
  const cycle = (sig: string, oi: number, o: OppOption) => {
    const map = { ...prefsFor(sig) }
    const k = `${oi}|${oppOptionKey(o)}`
    const cur = map[k]
    if (!cur) map[k] = 'up'
    else if (cur === 'up') map[k] = 'off'
    else delete map[k]
    store.value = { sig, map }
  }
  const prefOf = (sig: string, oi: number, o: OppOption): OppPref | undefined =>
    prefsFor(sig)[`${oi}|${oppOptionKey(o)}`]
  const clear = (sig: string) => (store.value = { sig, map: {} })
  return { store, prefsFor, cycle, prefOf, clear }
}

export type MineOption =
  | { kind: 'move'; move: string; mega: boolean; pivotTo?: number }
  | { kind: 'switch'; to: number }
export type OppOption =
  | { kind: 'move'; move: string; pivotTo?: number; noMega?: boolean } // noMega: 메가진화할 수 있는데 이번 턴 미룸
  | { kind: 'switch'; to: number }

export interface OptionSummary {
  oppLoss: number
  myLoss: number
  oppKo: number
  myKo: number
  duel: number
  utility: number
  pFirst: number | null // 교체면 null
  win: number // 승산 어림 (끝판에서 표시)
  parts: ScoreParts // 점수 구성 (상대 선택지 비중으로 평균)
  // 두 턴 앞: 가장 흔한 경우의 다음 턴 추천 (그때 필드에 있는 내 포켓몬)
  next?: { option: MineOption; mi: number } | null
}

export interface Recommendation {
  mode: 'turn' | 'replace'
  depth: number // 실제로 본 깊이 (끝판이면 선택보다 깊음)
  endgame: boolean // 남은 포켓몬이 적어서 세 턴 앞까지 봄
  oi: number // 상대 필드 포켓몬 (선택지 비중 조정 키)
  options: MineOption[]
  opp: (OppOption & { weight: number })[]
  ranked: (Ranked & { summary: OptionSummary })[]
  best: number // 기대값 추천 (options 번호)
  safe: number // 안전 추천
}

// 더블 추천: 내 필드 칸마다 선택지 순위 (1턴 앞, 상대 필드 포켓몬과 짝지어 계산해 합침) + 두 칸 조합
export interface DoublesSummary {
  oppLoss: number // 상대들이 잃은 HP 비율 합
  myLoss: number
  oppKo: number // 쓰러뜨릴 상대 수 기대값
  myKo: number
  pFirst: number | null // 교체면 null
  parts: ScoreParts
}
export interface DoublesPlan {
  option: MineOption
  target: number | null // 한 대상 기술의 상대 필드 칸 (광역기·자신·교체는 null)
  expected: number
  worst: number
  allyLoss: number // 자신 외 전체 광역기가 아군에게 주는 손해 (expected 에서 뺀 값)
  summary: DoublesSummary
}
export interface DoublesFoe {
  slot: number // 상대 필드 칸
  oi: number
  opp: (OppOption & { weight: number })[] // 이 포켓몬의 선택지 비중 (내 두 포켓몬 합쳐서)
}
export interface DoublesSlot {
  slot: number // 내 필드 칸
  mi: number
  mode: 'turn' | 'replace' // replace = 쓰러진 칸에 들어갈 포켓몬
  plans: DoublesPlan[] // 기대값 높은 순
  safe: number // 최악의 경우가 가장 나은 plans 번호
}
export interface DoublesCombo {
  picks: { slot: number; plan: number }[] // 칸마다 plans 번호
  expected: number
  focus: number // 협공 보정 (같은 상대를 같이 칠 때 합친 데미지로 다시 본 차이)
}
export interface DoublesRecommendation {
  slots: DoublesSlot[]
  foes: DoublesFoe[]
  combos: DoublesCombo[] // 기대값 높은 순 (두 칸 모두 있을 때)
}

// 맞대결·다음 턴 계산 시점의 포켓몬 상태 (교체로 들어오면 랭크 없음)
interface View {
  idx: number
  mega: boolean
  boosts: BoostTable
  status: Status
  screens?: ScreenKey[] // 이번 턴 새로 친 벽 (그 진영이 맞을 때)
  locked?: string // 구애 도구·앙코르·역린류로 고정된 기술
  rampage?: boolean // 역린류로 고정: 교체도 못 함
  perish?: number // 멸망의노래 카운트 (배틀 상태와 같은 값: 턴 끝마다 1 줄고 0 이면 쓰러짐)
  skip?: Skip // 처음 몇 턴 행동 불가 (잠듦·반동·앙코르로 변화기 고정)
  tailwind?: boolean // 새로 분 순풍
  itemGone?: boolean // 도구를 잃음
  seeded?: boolean // 씨뿌리기 (턴 끝 1/8 을 상대가 흡수)
  cursed?: boolean // 저주(고스트): 턴 끝 1/4
  absorb?: number // 대타가 막아 줄 공격 횟수 (맞대결)
  taunted?: boolean // 도발: 변화기를 못 씀
  drowsy?: boolean // 하품: 다음 턴 끝에 잠듦
  busted?: boolean // 탈이 풀림 (따라큐)
  healBlock?: boolean // 회복봉인
  torment?: boolean // 트집: 같은 기술 연속 불가
  duel?: boolean // 맞대결 계산용: 지금 깔린 대타는 absorb 로 따로 셈
}
// 날씨·필드·트릭룸
interface Env {
  weather: Weather
  terrain: Terrain
  trickRoom: boolean
  magicRoom?: boolean
  wonderRoom?: boolean
  gravity?: boolean
  gone?: string[] // 턴이 끝나 사라진 진영 효과 ('mine:reflect', 'opp:tailwind' 등)
}
// 한 턴을 계산하는 시점의 상태. root = 실제 배틀 상태 (PP·앙코르·특수 상태 등은 배틀 상태에서 직접 본다)
interface Ctx {
  root: boolean
  age: number // 실제 배틀 상태로부터 몇 턴 뒤인가 (남은 턴 수 계산용)
  mi: number
  oi: number
  mySlot?: number // 필드 칸 (더블, 없으면 0)
  oppSlot?: number
  mv: View
  ov: View
  hp: { mine: Record<number, number>; opp: Record<number, number> } // HP 비율 (없으면 배틀 상태)
  env: Env
  myLast: string // 마지막으로 쓴 기술 (방어 연속·앙코르)
  oppLast: string
  myFresh: boolean // 나온 첫 턴 (속이기)
  oppFresh: boolean
  myActs: number // 이번 턴 행동할 확률
  oppActs: number
  megaMine: boolean // 그 진영이 아직 메가진화할 수 있음
  megaOpp: boolean
  hz?: Hazards // 진영별 설치기 (없으면 배틀 상태) — 두 턴 앞에서 이번 턴에 깔거나 치운 것
}
type Hazards = Record<BattleSide, Record<string, number>>

// 기술의 확정 효과 (확률 효과는 제외)
interface MoveFx {
  self: Partial<Record<BoostKey, number>>
  target: Partial<Record<BoostKey, number>>
  heal: number
  screens: ScreenKey[]
  tailwind: boolean
  recharge: boolean
}
// 맞는 쪽에 생기는 효과 (상태이상·씨뿌리기·앙코르·도발·하품·도구 잃음) — p = 생길 확률, patch = 바뀌는 상태
interface Effect {
  p: number
  patch: Partial<View>
  delta?: Partial<Record<BoostKey, number>> // 랭크 변화 (다른 효과와 겹칠 수 있게 더함)
}
const NO_EFFECT: Effect = { p: 0, patch: {} }
// 턴 뒤 경우 하나 (맞는 쪽 효과가 생겼는지별)
interface NextCase {
  p: number
  mv: View
  ov: View
  // 강제 교체(울부짖기 등)로 바뀐 필드 포켓몬과 그 HP (없으면 그대로)
  mi?: number
  myHp?: number
  oi?: number
  oppHp?: number
}
// 데이터에 효과가 없는 변화기 등을 직접 반영한 것 (specialOf)
interface Special {
  heal: number // 턴 끝 회복 (자기 최대 HP 비율)
  cost: number // 쓰면 잃는 HP (배북·저주)
  self: Partial<Record<BoostKey, number>>
  selfPatch: Partial<View> // 자기 상태 (잠자기 → 잠듦, 트릭 → 도구 바뀜)
  target: Effect | null // 맞는 쪽 효과 (저주·트릭)
  dealt: number // 고정으로 깎는 맞는 쪽 HP 비율 (아픔나누기)
  resetBoosts: boolean // 흑안개
  destinyBond: boolean
  phaze: number // 맞는 쪽을 강제로 교체시킬 확률 (울부짖기·드래곤테일)
  utility: number // 설치기를 치운 가치 (안개제거·고속스핀)
  fails: boolean
  revive: number | null // 회생의기도으로 되살릴 쓰러진 포켓몬 (HP 1/2)
}
// 한 칸 + 다음 턴을 만들 재료. cases: 교체기로 바뀌었는지(내 쪽·상대 쪽)별 턴 뒤 경우 (pivotKey)
interface Cell2 {
  ex: Exchange
  cases: Partial<Record<PivotKey, NextCase[]>>
  next: (
    pivoted: boolean,
    oppPivoted: boolean,
    c: NextCase,
    myHp: number,
    oppHp: number,
    ate?: Ate,
  ) => Ctx
}
// 이번 턴 열매를 먹었는지 (다음 턴 도구 없음)
type Ate = { mine: boolean; opp: boolean }
type PivotKey = '00' | '10' | '01' | '11'
const pivotKey = (pivoted: boolean, oppPivoted: boolean): PivotKey =>
  `${pivoted ? 1 : 0}${oppPivoted ? 1 : 0}` as PivotKey

export function useRecommend(b: Battle) {
  const gd = useGameData()
  const calc = useTeamCalc()
  const reg = useRegulation()
  const { weights, depth } = useRecWeights()
  const prefStore = useRecOppPrefs()
  // 계산 중에는 배틀 상태를 반응형 프록시 없이 읽는다 (수십만 번 읽어서 프록시 비용이 큼).
  //   바뀜 감지는 화면 쪽 computed 가 상태 전체를 한 번 읽어서 (trackState)
  const S = () => toRaw(b.state.value!)
  const mon = (side: BattleSide, idx: number) => S().sides[side].mons[idx]!
  const abilityOf = (side: BattleSide, idx: number) => resolveAt(side, idx)?.ability || ''
  // 배틀 상태 조회는 한 번 계산하는 동안 바뀌지 않아서 기억해 둔다 (같은 인자로 수백 번 불림)
  const callCache = new Map<string, unknown>()
  const cached =
    <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    (...a: A): R => {
      const key = name + a.join('|')
      if (!callCache.has(key)) callCache.set(key, fn(...a))
      return callCache.get(key) as R
    }
  const combatantOf = cached('cOf', b.combatantOf)
  const combatantRange = cached('cRange', b.combatantRange)
  const attackOpts = cached('opts', b.attackOpts)
  const fieldFor = cached('field', b.fieldFor)
  const resolveAt = cached('resolveAt', b.resolveAt)
  const maxHp = cached('maxHp', b.maxHp)
  const speedOf = cached('speedOf', b.speedOf)
  const speedOrder = cached('speedOrder', b.speedOrder)
  const movePriority = cached('movePriority', b.movePriority)
  const canMegaEvolve = cached('canMegaEvolve', b.canMegaEvolve)
  const spreadActive = cached('spreadActive', b.spreadActive)
  const guessedItem = cached('guessedItem', b.guessedItem)
  const oppItemOf = cached('oppItemOf', b.oppItemOf)

  // 공격 보정: 배틀 상태의 보정 + 더블에서 맞는 포켓몬이 둘 이상이면 광역기 0.75배
  //   (상대 필드에 둘 이상, 또는 자신 외 전체 광역기인데 아군이 필드에 있음 — 아군 + 상대 하나)
  const optsFor = (side: BattleSide, idx: number, moveId: string): DamageOptions => {
    const o = attackOpts(side, idx, moveId)
    const move = gd.move(moveId)
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const many = spreadActive(foe) || (move?.target === 'allAdjacent' && spreadActive(side))
    return b.N > 1 && move && isSpreadMove(move) && many ? { ...o, spread: true } : o
  }

  // ── 기술 효과 ─────────────
  const fxOf = (moveId: string): MoveFx => {
    const fx: MoveFx = {
      self: {},
      target: {},
      heal: 0,
      screens: [],
      tailwind: false,
      recharge: false,
    }
    const move = gd.move(moveId)
    if (!move) return fx
    for (const e of move.effects) {
      if ('chance' in e && e.chance != null && e.chance < 100) continue
      if (e.type === 'boost')
        for (const k of BOOST_KEYS) {
          const v = e.stats[k]
          if (v) fx[e.target === 'self' ? 'self' : 'target'][k] = v
        }
      else if (e.type === 'heal' && move.category === 'status') fx.heal = e.ratio
      else if (e.type === 'recharge') fx.recharge = true
      else if (e.type === 'side' && e.side === 'self' && e.key in SCREEN_FIELD)
        fx.screens.push(e.key as ScreenKey)
      else if (e.type === 'side' && e.side === 'self' && e.key === 'tailwind') fx.tailwind = true
    }
    // 막말내뱉기: 데이터에 랭크 효과가 없어서 직접 (공격·특공 −1)
    if (moveId === 'partingshot') fx.target = { atk: -1, spa: -1 }
    return fx
  }
  const addBoosts = (base: BoostTable, ...deltas: Partial<Record<BoostKey, number>>[]) => {
    const out = { ...base }
    for (const d of deltas)
      for (const k of BOOST_KEYS) if (d[k]) out[k] = clampBoost((out[k] || 0) + d[k]!)
    return out
  }
  const zeroBoosts = (): BoostTable => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
  const isStatus = (moveId: string) => gd.move(moveId)?.category === 'status'
  // 새로 친 벽 (이미 있으면 빼고, 오로라베일은 설경에서만)
  const newScreens = (side: BattleSide, fx: MoveFx, env: Env) =>
    fx.screens.filter(
      (k) => !S().sides[side].screens[k] && (k !== 'auroraveil' || env.weather === 'snow'),
    )
  const newTailwind = (side: BattleSide, fx: MoveFx) =>
    fx.tailwind && !S().sides[side].screens.tailwind ? { tailwind: true } : {}

  // 위협을 받는 쪽의 랭크 변화 (오기·승기·주눅·파수견 반응 포함)
  const intimidateDelta = (ability: string): Partial<Record<BoostKey, number>> => {
    if (ability === 'guarddog') return { atk: 1 }
    if (INTIMIDATE_IMMUNE.has(ability) || NO_DROP.has(ability)) return {}
    if (ability === 'defiant') return { atk: 1 }
    if (ability === 'competitive') return { atk: -1, spa: 2 }
    if (ability === 'rattled') return { atk: -1, spe: 1 }
    return { atk: -1 }
  }

  // ── 날씨 · 필드 · 트릭룸 ─────────────
  const envNow = (): Env => {
    const r = S().rooms
    return {
      weather: S().weather.key,
      terrain: S().terrain.key,
      trickRoom: !!r.trickroom,
      ...(r.magicroom ? { magicRoom: true } : {}),
      ...(r.wonderroom ? { wonderRoom: true } : {}),
      ...(r.gravity ? { gravity: true } : {}),
    }
  }
  // 기술로 켜고 끄는 룸 (트릭룸 외)
  const ROOM_ENV = { magicroom: 'magicRoom', wonderroom: 'wonderRoom', gravity: 'gravity' } as const
  // 등장 특성(ability) 또는 기술(moveId) 뒤의 환경. 원시 날씨는 바뀌지 않음
  const envWith = (env: Env, ability = '', moveId = ''): Env => {
    const out = { ...env }
    const perm = S().weather.permanent
    if (!perm && WEATHER_ABILITY[ability]) out.weather = WEATHER_ABILITY[ability]!
    if (TERRAIN_ABILITY[ability]) out.terrain = TERRAIN_ABILITY[ability]!
    for (const e of gd.move(moveId)?.effects ?? []) {
      if (e.type === 'weather' && !perm) out.weather = e.key
      else if (e.type === 'terrain') out.terrain = e.key
      else if (e.type === 'room' && e.key === 'trickroom') out.trickRoom = !out.trickRoom
      else if (e.type === 'room' && e.key in ROOM_ENV) {
        const k = ROOM_ENV[e.key as keyof typeof ROOM_ENV]
        // 중력은 이미 있으면 실패, 원더룸·매직룸은 다시 쓰면 끝남
        if (out[k] && k !== 'gravity') delete out[k]
        else out[k] = true
      }
    }
    return out
  }

  // ── 전투 정보 ─────────────
  const withView = (c: Combatant, v: View): Combatant => ({
    ...c,
    boosts: v.boosts,
    status: v.status,
    ...(v.itemGone ? { item: '' } : {}),
    // 탈이 풀리면 탈 효과 없음
    ...(v.busted ? { ability: '' } : {}),
    ...(v.duel ? { sub: undefined } : {}),
  })
  // hp: HP 비율 (다음 턴 계산에서 배틀 상태와 다를 때)
  const withHp = (c: Combatant, hp: number | undefined) =>
    hp == null ? c : { ...c, hp: Math.max(1, Math.round(hp * c.stats.hp)) }
  const mineC = (v: View, attacking: boolean, hp?: number) => {
    const c = combatantOf('mine', v.idx, v.mega || undefined, attacking)
    return c ? withHp(withView(c, v), hp) : null
  }
  // 상대: 추정 범위 [약한 쪽, 강한 쪽], 확정 전 도구는 선출 화면 도구
  const oppCs = (v: View, attacking: boolean, defStat?: 'def' | 'spd', hp?: number) => {
    const g = mon('opp', v.idx).itemGone ? '' : guessedItem(v.idx)
    return combatantRange('opp', v.idx, v.mega || undefined, attacking, undefined, defStat).map(
      (c) => withHp(withView(g ? { ...c, item: g } : c, v), hp),
    )
  }
  const oneC = (side: BattleSide, v: View, attacking = false) =>
    side === 'mine' ? mineC(v, attacking) : (oppCs(v, attacking)[0] ?? null)
  const itemOf = (side: BattleSide, v: View) =>
    v.itemGone || S().rooms.magicroom
      ? ''
      : side === 'mine'
        ? resolveAt('mine', v.idx)?.slot.item || ''
        : oppItemOf(v.idx) || guessedItem(v.idx)
  // 하양허브: 떨어진 랭크를 0 으로 되돌리고 사라짐 (이번 턴 랭크 변화가 끝난 뒤 — 다음 턴·턴 뒤 전망)
  const whiteHerb = (side: BattleSide, v: View): View =>
    itemOf(side, v) === 'whiteherb' && BOOST_KEYS.some((k) => (v.boosts[k] || 0) < 0)
      ? {
          ...v,
          itemGone: true,
          boosts: Object.fromEntries(
            BOOST_KEYS.map((k) => [k, Math.max(0, v.boosts[k] || 0)]),
          ) as BoostTable,
        }
      : v
  const defStatOf = (move: Move, field: FieldState): 'def' | 'spd' => {
    const phys = move.category === 'physical' || ['psyshock', 'psystrike'].includes(move.id)
    return phys !== !!field.wonderRoom ? 'def' : 'spd'
  }
  // 맞는 쪽(side) 필드 + 그 시점 날씨·필드 + 새로 친 벽 (끝난 벽은 뺌)
  const fieldWith = (
    f: FieldState,
    env: Env,
    screens: ScreenKey[] | undefined,
    side: BattleSide,
  ): FieldState => {
    const out: FieldState = {
      ...f,
      weather: env.weather,
      terrain: env.terrain,
      magicRoom: !!env.magicRoom,
      wonderRoom: !!env.wonderRoom,
      gravity: !!env.gravity,
    }
    for (const g of env.gone ?? []) {
      const [sd, k] = g.split(':')
      if (sd === side && k! in SCREEN_FIELD) out[SCREEN_FIELD[k as ScreenKey]] = false
    }
    for (const k of screens ?? []) out[SCREEN_FIELD[k]] = true
    return out
  }
  // 이번 턴이 끝날 때 남은 턴이 다 된 날씨·필드·트릭룸·벽·순풍 (이번 턴에 새로 바뀐 것은 그대로)
  const expire = (c: Ctx, e: Env): Env => {
    const s = S()
    const ends = (x: { cur: number; total: number } | undefined) =>
      !!x && x.cur + c.age + 1 >= x.total
    const out: Env = { ...e }
    if (!s.weather.permanent && e.weather && e.weather === s.weather.key && ends(s.weather))
      out.weather = ''
    if (e.terrain && e.terrain === s.terrain.key && ends(s.terrain)) out.terrain = ''
    if (e.trickRoom && ends(s.rooms.trickroom)) out.trickRoom = false
    for (const [room, k] of Object.entries(ROOM_ENV)) if (e[k] && ends(s.rooms[room])) delete out[k]
    const gone = new Set(e.gone)
    for (const side of ['mine', 'opp'] as const)
      for (const [k, x] of Object.entries(s.sides[side].screens))
        if (ends(x)) gone.add(`${side}:${k}`)
    if (gone.size) out.gone = [...gone].sort()
    return out
  }

  // 이번 한 번의 공격 (배분 범위 양 끝 → 데미지는 합친 범위, KO 확률은 평균)
  const koP = (c: Cell) =>
    c.immune ? 0 : c.koRealUses === 1 && c.koReal != null ? c.koReal / 100 : 0
  const hitOf = (
    moveId: string,
    atks: Combatant[],
    defs: Combatant[],
    field: FieldState,
    opts: DamageOptions,
  ): Hit | null => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status' || !atks.length || !defs.length) return null
    const best = calc.cell(moveId, atks[atks.length - 1]!, defs[0]!, field, opts)
    const worst =
      atks.length > 1 || defs.length > 1
        ? calc.cell(moveId, atks[0]!, defs[defs.length - 1]!, field, opts)
        : best
    if (!best || !worst) return null
    // 대타가 받는 단타는 본체 데미지 없음
    const body = (c: Cell) => (c.sub && !c.hits ? 0 : 1)
    return {
      min: Math.min(best.pctMin * body(best), worst.pctMin * body(worst)) / 100,
      max: Math.max(best.pctMax * body(best), worst.pctMax * body(worst)) / 100,
      acc: best.hitChance,
      ko: (koP(best) + koP(worst)) / 2,
    }
  }

  // 같은 계산이 여러 칸에서 반복돼서 한 번 계산할 동안 기억해 둔다
  const hitCache = new Map<string, Hit | null>()
  const memo = (key: string, fn: () => Hit | null) => {
    if (!hitCache.has(key)) hitCache.set(key, fn())
    return hitCache.get(key)!
  }
  // 내 공격 → 상대 ov (defHp: 맞는 쪽 HP 비율, KO 확률용)
  const mineHit = (moveId: string, mv: View, ov: View, env: Env, defHp?: number) =>
    memo(JSON.stringify(['m', moveId, mv, ov, env, defHp]), () => {
      const move = gd.move(moveId)
      const atk = mineC(mv, true)
      if (!move || !atk) return null
      const field = fieldWith(fieldFor('opp', ov.idx), env, ov.screens, 'opp')
      return hitOf(
        moveId,
        [atk],
        oppCs(ov, false, defStatOf(move, field), defHp),
        field,
        optsFor('mine', mv.idx, moveId),
      )
    })
  // 상대 ov 공격 → 내 mv
  const oppHit = (moveId: string, ov: View, mv: View, env: Env, defHp?: number) =>
    memo(JSON.stringify(['o', moveId, ov, mv, env, defHp]), () => {
      const def = mineC(mv, false, defHp)
      if (!def) return null
      return hitOf(
        moveId,
        oppCs(ov, true),
        [def],
        fieldWith(fieldFor('mine', mv.idx), env, mv.screens, 'mine'),
        optsFor('opp', ov.idx, moveId),
      )
    })

  // 맞대결용 한 번 기대 데미지 (최대 HP 대비, 명중 포함). KO 확률이 필요 없어서 데미지 범위만 (배분 범위 양 끝의 평균)
  const avgCache = new Map<string, number>()
  const avgDamage = (
    moveId: string,
    atks: Combatant[],
    defs: Combatant[],
    field: FieldState,
    opts: DamageOptions,
  ) => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status' || !atks.length || !defs.length || !gd.data.value)
      return 0
    const chart = gd.data.value.types.chart
    const one = (atk: Combatant, def: Combatant) => {
      const info = hitInfo(move, atk, false, opts)
      let lo: number
      let hi: number
      if (info.max > 1) {
        const per = perHitDamage(move, atk, def, chart, field, opts, info)
        lo = per.min.slice(0, info.min).reduce((a, v) => a + v, 0)
        hi = per.max.reduce((a, v) => a + v, 0)
      } else {
        const d = calcDamage(move, atk, def, chart, field, opts)
        lo = d.min
        hi = d.max
      }
      return (hitChance(move, atk, def, field, opts) * (lo + hi)) / 2 / Math.max(1, def.stats.hp)
    }
    return (one(atks[atks.length - 1]!, defs[0]!) + one(atks[0]!, defs[defs.length - 1]!)) / 2
  }
  const avgMemo = (key: string, fn: () => number) => {
    if (!avgCache.has(key)) avgCache.set(key, fn())
    return avgCache.get(key)!
  }
  // hp: 맞는 쪽 HP 비율 (멀티스케일 비교용, 없으면 배틀 상태)
  const mineAvg = (moveId: string, mv: View, ov: View, env: Env, hp?: number) =>
    avgMemo(JSON.stringify(['m', moveId, mv, ov, env, hp]), () => {
      const move = gd.move(moveId)
      const atk = mineC(mv, true)
      if (!move || !atk) return 0
      const field = fieldWith(fieldFor('opp', ov.idx), env, ov.screens, 'opp')
      return avgDamage(
        moveId,
        [atk],
        oppCs(ov, false, defStatOf(move, field), hp),
        field,
        optsFor('mine', mv.idx, moveId),
      )
    })
  const oppAvg = (moveId: string, ov: View, mv: View, env: Env, hp?: number) =>
    avgMemo(JSON.stringify(['o', moveId, ov, mv, env, hp]), () => {
      const def = mineC(mv, false, hp)
      if (!def) return 0
      return avgDamage(
        moveId,
        oppCs(ov, true),
        [def],
        fieldWith(fieldFor('mine', mv.idx), env, mv.screens, 'mine'),
        optsFor('opp', ov.idx, moveId),
      )
    })

  // ── 기술 목록 ─────────────
  const movesOf = (side: BattleSide, idx: number) =>
    (resolveAt(side, idx)?.slot.moves ?? []).filter((m): m is string => !!m)
  // 앙코르·구애 도구로 묶인 기술 (실제 배틀 상태, 없으면 '')
  const lockedMove = (side: BattleSide, idx: number) => {
    const enc = b.encoreMove(side, idx)
    if (enc) return enc
    const m = mon(side, idx)
    const item =
      side === 'mine' ? (m.itemGone ? '' : resolveAt('mine', idx)?.slot.item) : oppItemOf(idx)
    return item && CHOICE_ITEMS.has(item) && !S().rooms.magicroom ? m.lastMove || '' : ''
  }
  // 나온 첫 턴인가 (속이기·만나자마자)
  const firstTurnOut = (side: BattleSide, idx: number) => mon(side, idx).enteredTurn >= S().turn - 1
  // 이번 턴 쓸 수 있는 기술 (고정 → 그 기술, 첫 턴 기술은 나온 첫 턴만, 도발이면 변화기 빼고, 실제 상태면 PP 도)
  const mineMoves = (c: Ctx) => {
    if (c.mv.locked) return [c.mv.locked]
    const used = c.root ? b.ppUsedOf('mine', c.mi) : {}
    return movesOf('mine', c.mi).filter(
      (m) =>
        (!c.root || (used[m] || 0) < b.maxPp('mine', c.mi, m)) &&
        (!FIRST_TURN_MOVES.has(m) || c.myFresh) &&
        !(c.mv.taunted && isStatus(m)) &&
        !(c.mv.torment && m === c.myLast) &&
        (m !== 'sleeptalk' || c.mv.status === 'slp'),
    )
  }
  // 상대 기술 후보 (확정 + 선출 화면). c 가 없으면 맞대결용 (고정·첫 턴·도발 판정 없이)
  const oppMoves = (oi: number, c?: Ctx) => {
    if (c?.ov.locked) return { moves: [c.ov.locked], known: new Set([c.ov.locked]) }
    const m = mon('opp', oi)
    const known = new Set([...Object.keys(b.ppUsedOf('opp', oi)), ...(m.movesSeen ?? [])])
    const moves = [...new Set([...known, ...movesOf('opp', oi)])].filter(
      (mv) =>
        !c ||
        ((!FIRST_TURN_MOVES.has(mv) || c.oppFresh) &&
          !(c.ov.taunted && isStatus(mv)) &&
          !(c.ov.torment && mv === c.oppLast) &&
          (mv !== 'sleeptalk' || c.ov.status === 'slp')),
    )
    return { moves, known }
  }

  // ── 행동 가능 ─────────────
  // 이번 턴 행동할 확률 (실제 상태): 반동·게으름 0, 잠듦·얼음은 이번 시도에 풀릴 확률, 마비 몸저림 12.5%, 혼란 자해 33%, 헤롱헤롱 50%
  const actsOf = (side: BattleSide, idx: number) => {
    const m = mon(side, idx)
    if (LOAF_VOLATILES.some((k) => m.volatiles[k])) return 0
    let p = (b.wakeChance(side, idx) ?? 100) / 100
    if (m.status === 'par') p *= 0.875
    if (m.volatiles.confusion) p *= 0.67
    if (m.volatiles.attract) p *= 0.5
    return p
  }
  // 이번 턴이 지난 뒤 처음 몇 턴 행동하지 못하는가 (잠듦·얼음 중이면 이번 턴에 못 풀린 경우만)
  const skipOf = (side: BattleSide, idx: number): Skip | undefined => {
    const m = mon(side, idx)
    if (m.status !== 'slp' && m.status !== 'frz') return undefined
    const table = m.status === 'slp' && m.restSleep ? WAKE_CHANCE.rest : WAKE_CHANCE[m.status]
    const now = (table[m.toxicTurn] ?? 100) / 100
    return [
      { turns: 0, p: now },
      ...skipDist(table, m.toxicTurn + 1).map((s) => ({ ...s, p: s.p * (1 - now) })),
    ]
  }
  // 다음 턴: 쉬는 턴을 하나 줄이고 그 턴 행동할 확률 (마비 몸저림 포함)
  const nextTurnView = (v: View) => {
    const { acts, rest } = advanceSkip(v.skip)
    const out: View = { ...v }
    if (rest) out.skip = rest
    else delete out.skip
    return { view: out, acts: acts * (v.status === 'par' ? 0.875 : 1) }
  }

  // ── 맞는 쪽에 생기는 효과 ─────────────
  const statusBlocked = (status: Status, def: Combatant, move: Move, defSide: BattleSide) => {
    if (STATUS_TYPE_IMMUNE[status]?.some((t) => def.species.types.includes(t as never))) return true
    if (STATUS_ABILITY_IMMUNE[status]?.includes(def.ability)) return true
    if (
      move.flags.includes('powder') &&
      (def.species.types.includes('grass') || def.ability === 'overcoat')
    )
      return true
    if (move.id === 'thunderwave' && def.species.types.includes('ground')) return true
    const field = fieldFor(defSide)
    return (
      isGrounded(def, field) &&
      (field.terrain === 'misty' || (status === 'slp' && field.terrain === 'electric'))
    )
  }
  // 상태이상이 걸릴 확률: 변화기는 명중률, 공격기는 명중 × 부가효과 확률(하늘의은총 2배, 우격다짐·인분이면 없음)
  // tried: 잠들게 했을 때 이번 턴에 이미 행동하려 한 것으로 치는가 (먼저 맞혀서 이번 턴 행동을 막은 경우)
  const statusEffect = (
    move: Move,
    atk: Combatant,
    def: Combatant,
    defSide: BattleSide,
    dv: View,
    tried: boolean,
  ): Effect => {
    if (dv.status) return NO_EFFECT
    const e = move.effects.find((x) => x.type === 'status' && x.target === 'target')
    if (!e || e.type !== 'status' || e.status === 'frz') return NO_EFFECT
    if (statusBlocked(e.status, def, move, defSide)) return NO_EFFECT
    let p = hitChance(move, atk, def, fieldFor(defSide))
    if (move.category !== 'status') {
      if (
        atk.ability === 'sheerforce' ||
        def.ability === 'shielddust' ||
        (def.item === 'covertcloak' && !dv.itemGone)
      )
        return NO_EFFECT
      const c = Math.min(100, (e.chance ?? 100) * (atk.ability === 'serenegrace' ? 2 : 1))
      p *= c / 100
    }
    // 시든열매·잠깸열매: 바로 고치고 열매를 잃음
    const cure = dv.itemGone ? undefined : CURE_BERRY[def.item || '']
    if (cure === 'any' || cure === e.status) return { p, patch: { itemGone: true } }
    const patch: Partial<View> = { status: e.status }
    if (e.status === 'slp') patch.skip = skipDist(WAKE_CHANCE.slp, tried ? 1 : 0)
    return { p, patch }
  }
  // 상태이상 > 씨뿌리기 > 앙코르 > 도발 > 하품 > 탁쳐서떨구기 순으로 하나
  //   lastMove: 맞는 쪽이 이 기술을 맞을 때 마지막으로 쓴 기술 (앙코르)
  const effectOn = (
    moveId: string,
    atk: Combatant | null | undefined,
    def: Combatant | null | undefined,
    defSide: BattleSide,
    dv: View,
    tried: boolean,
    lastMove: string,
  ): Effect => {
    const move = gd.move(moveId)
    if (!move || !atk || !def) return NO_EFFECT
    const st = statusEffect(move, atk, def, defSide, dv, tried)
    if (st.p > 0) return st
    const acc = () => hitChance(move, atk, def, fieldFor(defSide))
    if (moveId === 'leechseed' && !dv.seeded && !def.species.types.includes('grass'))
      return { p: acc(), patch: { seeded: true } }
    if (moveId === 'encore' && lastMove && !dv.locked && def.ability !== 'aromaveil')
      return {
        p: acc(),
        patch: isStatus(lastMove) ? { skip: [{ turns: ENCORE_SKIP, p: 1 }] } : { locked: lastMove },
      }
    if (moveId === 'taunt' && !dv.taunted && !TAUNT_IMMUNE.has(def.ability))
      return { p: acc(), patch: { taunted: true } }
    if (
      moveId === 'yawn' &&
      !dv.status &&
      !dv.drowsy &&
      !STATUS_ABILITY_IMMUNE.slp?.includes(def.ability)
    )
      return { p: acc(), patch: { drowsy: true } }
    if (
      moveId === 'knockoff' &&
      def.item &&
      !dv.itemGone &&
      def.ability !== 'stickyhold' &&
      !gd.data.value?.items[def.item]?.megaStone
    )
      return { p: acc(), patch: { itemGone: true } }
    // 트집·회복봉인 (사이코노이즈 등 공격기의 확정 부가효과 포함)
    for (const e of move.effects)
      if (
        e.type === 'volatile' &&
        (e.chance == null || e.chance >= 100) &&
        (e.status === 'torment' || e.status === 'healblock')
      ) {
        const key = e.status === 'torment' ? 'torment' : 'healBlock'
        if (!dv[key] && !(move.category === 'status' && def.ability === 'aromaveil'))
          return { p: acc(), patch: { [key]: true } }
      }
    return NO_EFFECT
  }

  // 공격을 맞고 살아남은 쪽에 생기는 효과: 지구력(방어 +1), 깨어진갑옷(물리: 방어 −1 스피드 +2),
  //   약점보험(효과가 굉장한 공격: 공격·특공 +2, 도구 잃음), 탈(풀림), 풍선(터짐)
  const typeMult = (move: Move, def: Combatant) => {
    const chart = gd.data.value?.types.chart
    const row = chart?.[move.type] as Record<string, number> | undefined
    return def.species.types.reduce((m, t) => m * (row?.[t] ?? 1), 1)
  }
  const hitFx = (
    moveId: string,
    atk: Combatant | null | undefined,
    def: Combatant | null | undefined,
    dv: View,
    hit: Hit | null,
  ): Effect[] => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status' || !atk || !def || !hit || hit.max <= 0) return []
    const p = hit.acc
    const ab = MOLD_BREAKER.has(atk.ability) ? '' : def.ability
    const out: Effect[] = []
    if (ab === 'stamina') out.push({ p, patch: {}, delta: { def: 1 } })
    if (ab === 'weakarmor' && move.category === 'physical')
      out.push({ p, patch: {}, delta: { def: -1, spe: 2 } })
    if (def.ability === 'disguise' && !dv.busted && def.species.id === 'mimikyu' && ab)
      out.push({ p, patch: { busted: true } })
    const item = dv.itemGone ? '' : def.item || ''
    if (item === 'airballoon') out.push({ p, patch: { itemGone: true } })
    if (item === 'weaknesspolicy' && typeMult(move, def) > 1)
      out.push({ p, patch: { itemGone: true }, delta: { atk: 2, spa: 2 } })
    return out
  }
  // 약점보험이 이번 턴 발동할 확률 (맞고 살아남음) — 나중에 움직이는 쪽의 이번 턴 공격에 반영
  const policyChance = (
    moveId: string,
    atk: Combatant | null | undefined,
    def: Combatant | null | undefined,
    dv: View,
    hit: Hit | null,
  ) => {
    const move = gd.move(moveId)
    if (!move || !atk || !def || !hit || dv.itemGone || def.item !== 'weaknesspolicy') return 0
    return typeMult(move, def) > 1 ? hit.acc * (1 - hit.ko) : 0
  }
  // 여러 공격을 비중대로 섞은 한 번 (잠꼬대·약점보험 발동 여부). null = 데미지 없음
  const mixHits = (hs: { w: number; h: Hit | null }[]): Hit | null => {
    const total = hs.reduce((a, x) => a + x.w, 0)
    if (total <= 0 || hs.every((x) => !x.h)) return null
    const out = { min: 0, max: 0, acc: 0, ko: 0 }
    for (const { w, h } of hs) {
      const f = w / total
      out.min += f * (h?.min ?? 0)
      out.max += f * (h?.max ?? 0)
      out.acc += f * (h?.acc ?? 1)
      out.ko += f * (h?.ko ?? 0)
    }
    return out
  }

  // 상대에게 쓰는 변화기가 막히는가: 매직미러(반사 — 설치기는 쓴 쪽에 깔림) / 황금몸 / 심술꾸러기 변화기 → 악 타입
  const FOE_TARGETS = new Set(['normal', 'any', 'allAdjacentFoes', 'allAdjacent', 'randomNormal'])
  const blockOf = (
    moveId: string,
    user: Combatant | null | undefined,
    target: Combatant | null | undefined,
  ): '' | 'bounce' | 'block' => {
    const move = gd.move(moveId)
    if (!move || move.category !== 'status' || !user || !target) return ''
    const foeSide = move.target === 'foeSide'
    if (!foeSide && !FOE_TARGETS.has(move.target)) return ''
    const ab = MOLD_BREAKER.has(user.ability) ? '' : target.ability
    if (ab === 'magicbounce' && move.flags.includes('reflectable')) return 'bounce'
    if (foeSide) return ''
    if (ab === 'goodasgold') return 'block'
    if (user.ability === 'prankster' && target.species.types.includes('dark')) return 'block'
    return ''
  }
  // 먼저 맞히면 상대가 이번 턴 행동하지 못할 확률 (풀죽음, 잠들게 하는 변화기)
  const stopsOf = (
    moveId: string,
    atk: Combatant | null | undefined,
    def: Combatant | null | undefined,
    defSide: BattleSide,
    dv: View,
  ) => {
    const move = gd.move(moveId)
    if (!move || !atk || !def) return 0
    let keep = 1
    const fl = move.effects.find((x) => x.type === 'volatile' && x.status === 'flinch')
    if (
      fl &&
      fl.type === 'volatile' &&
      atk.ability !== 'sheerforce' &&
      !['innerfocus', 'shielddust'].includes(def.ability)
    ) {
      const c = Math.min(100, (fl.chance ?? 100) * (atk.ability === 'serenegrace' ? 2 : 1))
      keep *= 1 - (hitChance(move, atk, def, fieldFor(defSide)) * c) / 100
    }
    const sl = statusEffect(move, atk, def, defSide, dv, true)
    if (sl.patch.status === 'slp') keep *= 1 - sl.p
    return 1 - keep
  }
  // 턴 끝: 하품으로 졸던 포켓몬이 필드에 남아 있으면 잠듦 (이번 턴에 새로 하품을 맞은 것은 다음 턴)
  const endOfTurn = (v: View): View => {
    if (!v.drowsy) return v
    const out: View = { ...v }
    delete out.drowsy
    if (!v.status) {
      out.status = 'slp'
      out.skip = skipDist(WAKE_CHANCE.slp, 0)
    }
    return out
  }

  // 턴 끝: 멸망의노래 카운트가 1 줄어듦 (0 = 이번 턴 끝에 쓰러짐)
  const tickPerish = (v: View): View => (v.perish ? { ...v, perish: v.perish - 1 } : v)

  // ── 반동 · 흡수 · 생명의구슬 ─────────────
  // def: 맞는 쪽 (울퉁불퉁멧·까칠한피부·철가시 — 접촉 공격이면 맞힐 때 공격한 쪽이 잃음)
  const selfOf = (
    moveId: string,
    atk: Combatant | null | undefined,
    atkMax: number,
    defMax: number,
    def?: Combatant | null,
  ): SelfEffect | undefined => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status' || !atk || atkMax <= 0) return undefined
    const punish = contactPunish(move, atk, def)
    const ratio = defMax / atkMax
    let perDealt = 0
    let onHit = 0
    for (const e of move.effects) {
      if (e.type === 'recoil' && atk.ability !== 'rockhead' && atk.ability !== 'magicguard')
        perDealt += e.ratio * ratio
      if (e.type === 'drain') perDealt -= e.ratio * ratio * (atk.item === 'bigroot' ? 1.3 : 1)
    }
    if (
      atk.item === 'lifeorb' &&
      atk.ability !== 'magicguard' &&
      !(atk.ability === 'sheerforce' && hasSecondary(move))
    )
      onHit += 0.1
    onHit += punish
    return perDealt || onHit ? { perDealt, onHit } : undefined
  }
  // 접촉 공격을 맞힌 쪽이 잃는 HP (공격한 쪽 최대 HP 비율). 매직가드·방진장갑(protectivepads)·원격(longreach)이면 없음
  function contactPunish(move: Move, atk: Combatant, def: Combatant | null | undefined) {
    if (!def || !move.flags.includes('contact') || atk.ability === 'magicguard') return 0
    if (atk.ability === 'longreach' || atk.item === 'protectivepads') return 0
    if (atk.item === 'punchingglove' && move.flags.includes('punch')) return 0
    return (CONTACT_PUNISH_ITEM[def.item || ''] ?? 0) + (CONTACT_PUNISH_ABILITY[def.ability] ?? 0)
  }

  // ── 턴 끝 회복 · 데미지 ─────────────
  // 한 턴에 잃는 HP 비율 (음수 = 회복): 독·맹독(초반 평균 1/8)·화상·모래바람·씨뿌리기 / 먹다남은음식·검은진흙·그래스필드·씨뿌리기 흡수
  const residOf = (side: BattleSide, v: View, foe: View, env: Env) => {
    const c = oneC(side, v)
    if (!c) return 0
    const ab = c.ability
    const types: readonly string[] = c.species.types
    const guard = ab === 'magicguard'
    let f = 0
    if (v.status === 'psn' || v.status === 'tox')
      f += ab === 'poisonheal' ? -1 / 8 : guard ? 0 : 1 / 8
    if (v.status === 'brn' && !guard) f += ab === 'heatproof' ? 1 / 32 : 1 / 16
    if (
      env.weather === 'sand' &&
      !types.some((t) => t === 'rock' || t === 'ground' || t === 'steel') &&
      !SAND_IMMUNE.has(ab) &&
      c.item !== 'safetygoggles'
    )
      f += 1 / 16
    if (v.seeded && !guard) f += 1 / 8
    if (v.cursed && !guard) f += 1 / 4
    if (c.item === 'leftovers') f -= 1 / 16
    if (c.item === 'blacksludge') f += types.includes('poison') ? -1 / 16 : guard ? 0 : 1 / 8
    if (env.terrain === 'grassy' && isGrounded(c, fieldFor(side))) f -= 1 / 16
    // 상대에게 심은 씨앗으로 흡수 (상대 최대 HP 1/8 → 내 HP 비율)
    if (foe.seeded) {
      const fs: BattleSide = side === 'mine' ? 'opp' : 'mine'
      f -= ((1 / 8) * maxHp(fs, foe.idx)) / Math.max(1, maxHp(side, v.idx))
    }
    // 회복봉인: 회복하는 쪽은 없음 (데미지만)
    if (v.healBlock && f < 0) return 0
    return f
  }

  // 더블: 지금 필드에 있는 포켓몬 (계산하는 짝이 아닌 다른 칸도 대기가 아님). 싱글은 없음
  const onFieldPartner = (side: BattleSide, i: number) =>
    b.N > 1 && S().sides[side].active.includes(i)

  // ── 설치기 ─────────────
  const hazardsOf = (c: Ctx): Hazards =>
    c.hz ?? { mine: S().sides.mine.hazards, opp: S().sides.opp.hazards }
  // 기술로 설치기를 깔거나 치운 뒤 (user = 기술을 쓴 진영). 안개제거는 양쪽, 고속스핀류는 자기 쪽을 치움
  const hazardsAfter = (hz: Hazards, moveId: string, user: BattleSide): Hazards => {
    if (!moveId) return hz
    const foe: BattleSide = user === 'mine' ? 'opp' : 'mine'
    if (HAZARD_CLEAR.has(moveId))
      return moveId === 'defog' ? { mine: {}, opp: {} } : { ...hz, [user]: {} }
    const e = gd.move(moveId)?.effects.find((x) => x.type === 'side' && x.side === 'foe')
    if (!e || e.type !== 'side' || !(e.key in HAZARD_MAX)) return hz
    const n = hz[foe][e.key] || 0
    if (n >= HAZARD_MAX[e.key]!) return hz
    return { ...hz, [foe]: { ...hz[foe], [e.key]: n + 1 } }
  }
  // side 의 idx 가 들어올 때 받는 데미지 (hz: 그때 깔려 있는 것)
  const hazardChip = (side: BattleSide, idx: number, hz: Record<string, number>) => {
    const c = combatantOf(side, idx)
    if (!c || !gd.data.value || c.ability === 'magicguard' || c.item === 'heavydutyboots') return 0
    let f = 0
    if (hz.stealthrock) {
      const rock = gd.data.value.types.chart.rock || {}
      f += c.species.types.reduce((e, t) => e * (rock[t] ?? 1), 1) / 8
    }
    if (hz.spikes && isGrounded(c, fieldFor(side, idx)))
      f += 1 / [8, 8, 6, 4][Math.min(3, hz.spikes)]!
    return f
  }
  // 앞으로 foe 진영에 들어올 포켓몬: 턴이 끝났을 때 필드에 있을 포켓몬(onField)을 뺀 살아 있는 포켓몬
  //   (이번 턴 교체로 들어간 포켓몬은 이미 들어갔으므로 빼고, 물러난 포켓몬은 다시 들어올 수 있으므로 넣는다).
  //   상대는 공개된 포켓몬 + 아직 안 나온 선출 수
  const futureEntries = (c: Ctx, foe: BattleSide, onField: number) => {
    const sd = S().sides[foe]
    const bench = sd.mons
      .map((_, i) => i)
      .filter(
        (i) =>
          i !== onField &&
          !onFieldPartner(foe, i) &&
          hpIn(c, foe, i) > 0 &&
          (foe === 'mine' || (sd.revealed.includes(i) && !!b.oppSlots.value[i]?.species)),
      )
    const seen = foe === 'opp' ? new Set([...sd.revealed, onField]).size : 0
    return { bench, unknown: foe === 'opp' ? Math.max(0, OPP_PICK - seen) : 0 }
  }
  // 설치기를 foe 진영에 깔면 앞으로 들어올 포켓몬이 받을 데미지 합 (HP 비율 단위). onField: 턴 뒤 foe 필드의 포켓몬
  const SPIKES = [0, 1 / 8, 1 / 6, 1 / 4]
  const hazardValue = (c: Ctx, moveId: string, foe: BattleSide, onField: number) => {
    const move = gd.move(moveId)
    const e = move?.effects.find((x) => x.type === 'side' && x.side === 'foe')
    if (!e || e.type !== 'side' || !gd.data.value) return 0
    const layers = hazardsOf(c)[foe][e.key] || 0
    if (layers >= (HAZARD_MAX[e.key] ?? 1)) return 0
    // 상대는 아직 안 나온 선출도 들어온다 (종을 모르면 바위 등배·땅에 있음으로)
    const { bench, unknown } = futureEntries(c, foe, onField)
    const rock = gd.data.value.types.chart.rock || {}
    const per = (c: Combatant | null) => {
      if (c && (c.ability === 'magicguard' || c.item === 'heavydutyboots')) return 0
      const grounded = !c || isGrounded(c, fieldFor(foe))
      const types: readonly string[] = c?.species.types ?? []
      switch (e.key) {
        case 'stealthrock':
          return types.reduce((m, t) => m * (rock[t as keyof typeof rock] ?? 1), 1) / 8
        case 'spikes':
          return grounded ? SPIKES[layers + 1]! - SPIKES[layers]! : 0
        case 'toxicspikes':
          return grounded && !types.some((t) => t === 'poison' || t === 'steel')
            ? layers
              ? 0.05
              : 0.1
            : 0
        case 'stickyweb':
          return grounded ? 0.05 : 0
        default:
          return 0
      }
    }
    const known = bench.reduce((s, i) => s + per(combatantOf(foe, i)), 0)
    return HAZARD_ENTRY * (known + unknown * per(null))
  }

  // ── 스피드 ─────────────
  const hpFrac = (side: BattleSide, idx: number) =>
    side === 'mine'
      ? mon('mine', idx).hp / Math.max(1, maxHp('mine', idx))
      : mon('opp', idx).hp / 100
  const hpIn = (c: Ctx, side: BattleSide, idx: number) => c.hp[side][idx] ?? hpFrac(side, idx)
  // 지금 상태(speedOf 기준) 대비 그 시점 스피드 배율: 랭크·새 마비·새 순풍·바뀐 날씨/필드의 스피드 특성
  const speedScale = (side: BattleSide, v: View, env: Env) => {
    const m = mon(side, v.idx)
    const ab = abilityOf(side, v.idx)
    const now = envNow()
    const wx = (e: Env) =>
      (WEATHER_SPEED[ab] && WEATHER_SPEED[ab] === e.weather) ||
      (TERRAIN_SPEED[ab] && TERRAIN_SPEED[ab] === e.terrain)
        ? 2
        : 1
    const active = S().sides[side].active.includes(v.idx)
    return (
      (boostMultiplier(v.boosts.spe) / boostMultiplier(active ? m.boosts.spe : 0)) *
      (v.status === 'par' && m.status !== 'par' ? 0.5 : 1) *
      (v.tailwind ? 2 : 1) *
      // 곡예: 이번에 도구를 잃음
      (ab === 'unburden' && v.itemGone && !m.itemGone ? 2 : 1) *
      // 지금 부는 순풍이 끝남
      (!v.tailwind && S().sides[side].screens.tailwind && env.gone?.includes(`${side}:tailwind`)
        ? 0.5
        : 1) *
      (wx(env) / wx(now))
    )
  }
  // 같은 우선도에서 내가 먼저 움직일 확률 (v: 그 시점 상태). mi0: 스피드 범위를 계산할 내 포켓몬 (범위 자체는 상대만의 것)
  const firstOf = (mv: View, ov: View, mi0: number, env: Env) => {
    const my = speedOf('mine', mv.idx, mv.mega || undefined) * speedScale('mine', mv, env)
    const guessRaw = speedOf('opp', ov.idx, ov.mega || undefined)
    const so = speedOrder(mi0, ov.idx, undefined, ov.mega || undefined)
    const k = speedScale('opp', ov, env)
    const span: [number, number] = so
      ? [so.span[0] * k, so.span[1] * k]
      : [guessRaw * k, guessRaw * k]
    return firstChance(my, span, guessRaw * k, env.trickRoom)
  }

  // ── 턴 뒤 맞대결 ─────────────
  // 기합의띠·옹골참 (공격하는 쪽이 틀깨기류면 옹골참 무시)
  const holdsOn = (side: BattleSide, v: View, foe: BattleSide, fv: View) => {
    if (itemOf(side, v) === 'focussash') return true
    if (oneC(side, v)?.ability !== 'sturdy') return false
    return !MOLD_BREAKER.has(oneC(foe, fv, true)?.ability || '')
  }
  const duelCache = new Map<string, Duel>()
  const duelOf = (mv: View, ov: View, mi0: number, env: Env): Duel => {
    const key = JSON.stringify([mv, ov, env])
    const hit = duelCache.get(key)
    if (hit) return hit
    // 지금 깔린 대타는 absorb 로 따로 세고 데미지는 본체 기준
    const m = { ...mv, duel: true }
    const o = { ...ov, duel: true }
    const myMoves = mv.locked ? [mv.locked] : movesOf('mine', mv.idx)
    const opMoves = ov.locked ? [ov.locked] : oppMoves(ov.idx).moves
    // 역린류로 고정이면 끝난 뒤 혼란으로 자해하는 턴이 있어서 조금 깎는다
    const rage = (v: View) => (v.rampage ? RAMPAGE_DUEL : 1)
    const myC = mineC(m, true)
    const opC = oppCs(o, true)[0] ?? null
    const myDefC = mineC(m, false)
    const opDefC = oppCs(o, false)[0] ?? null
    // 가장 센 기술 (hp: 맞는 쪽 HP — 멀티스케일 비교용)
    const best = (list: string[], fn: (x: string) => number) =>
      list.reduce(
        (a, x) => {
          const v = fn(x)
          return v > a.dmg ? { move: x, dmg: v } : a
        },
        { move: '', dmg: 0 },
      )
    // 멀티스케일·섀도실드: 기본은 가득이 아닐 때, 가득일 때 첫 공격은 그 배율
    const guardFull = (def: Combatant | null, atk: Combatant | null) =>
      !!def && FULL_HP_GUARD.has(def.ability) && !MOLD_BREAKER.has(atk?.ability || '')
    const optFull = guardFull(opDefC, myC)
    const myFull = guardFull(myDefC, opC)
    let mb = best(myMoves, (x) => mineAvg(x, m, o, env, optFull ? 0.99 : undefined))
    let ob = best(opMoves, (x) => oppAvg(x, o, m, env, myFull ? 0.99 : undefined))
    const fullOpp = optFull
      ? best(myMoves, (x) => mineAvg(x, m, o, env, 1)).dmg / Math.max(1e-6, mb.dmg)
      : undefined
    const fullMine = myFull
      ? best(opMoves, (x) => oppAvg(x, o, m, env, 1)).dmg / Math.max(1e-6, ob.dmg)
      : undefined
    // 풍선: 터진 뒤가 더 세면 그쪽으로 (첫 공격은 풍선이 있는 상태의 데미지)
    let firstOpp: number | undefined
    let firstMine: number | undefined
    if (itemOf('opp', ov) === 'airballoon') {
      const popped = best(myMoves, (x) => mineAvg(x, m, { ...o, itemGone: true }, env))
      if (popped.dmg > mb.dmg * 1.01) {
        firstOpp = mb.dmg / popped.dmg
        mb = popped
      }
    }
    if (itemOf('mine', mv) === 'airballoon') {
      const popped = best(opMoves, (x) => oppAvg(x, o, { ...m, itemGone: true }, env))
      if (popped.dmg > ob.dmg * 1.01) {
        firstMine = ob.dmg / popped.dmg
        ob = popped
      }
    }
    // 탈 (풀리기 전): 첫 공격은 1/8 만
    const disguised = (def: Combatant | null, v: View, atk: Combatant | null) =>
      !!def &&
      def.ability === 'disguise' &&
      def.species.id === 'mimikyu' &&
      !v.busted &&
      !MOLD_BREAKER.has(atk?.ability || '')
    if (disguised(opDefC, ov, myC) && mb.dmg > 0) firstOpp = Math.min(1, 1 / 8 / mb.dmg)
    if (disguised(myDefC, mv, opC) && ob.dmg > 0) firstMine = Math.min(1, 1 / 8 / ob.dmg)
    const mine = rage(mv) * mb.dmg
    const opp = rage(ov) * ob.dmg
    // 공격할 때마다 자기가 잃는 HP (반동·생명의구슬·울퉁불퉁멧·까칠한피부 / 흡수는 회복)
    const selfLoss = (
      move: string,
      atk: Combatant | null,
      def: Combatant | null,
      side: BattleSide,
      v: View,
      fv: View,
      dmg: number,
    ) => {
      if (!move || !atk) return 0
      const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
      const e = blockDrain(selfOf(move, atk, maxHp(side, v.idx), maxHp(foe, fv.idx), def), v)
      return e ? e.perDealt * dmg + e.onHit : 0
    }
    const myRecoil = selfLoss(mb.move, myC, opDefC, 'mine', mv, ov, mine)
    const oppRecoil = selfLoss(ob.move, opC, myDefC, 'opp', ov, mv, opp)
    // 열매 (회복봉인이면 없음) — HP 1/2 이하가 될 때 한 번
    const berryIn = (side: BattleSide, v: View) => (v.healBlock ? 0 : berryOf(side, v, 1))
    // 하품으로 졸고 있으면 곧 잠드는 것으로 (교체로 피할 수 있어서 일부만)
    const drowsySkip = (v: View): Skip | undefined =>
      v.drowsy && !v.status
        ? [
            { turns: 0, p: 1 - YAWN_SLEEP },
            ...skipDist(WAKE_CHANCE.slp, 0).map((s) => ({ ...s, p: s.p * YAWN_SLEEP })),
          ]
        : v.skip
    const residOpp = residOf('opp', ov, mv, env)
    const residMine = residOf('mine', mv, ov, env)
    const d: Duel = {
      mine: Math.max(0, mine + residOpp),
      opp: Math.max(0, opp + residMine + myRecoil),
      pFirst: firstOf(mv, ov, mi0, env),
      skipMine: drowsySkip(mv),
      skipOpp: drowsySkip(ov),
      absorbMine: mv.absorb,
      absorbOpp: ov.absorb,
      // 턴 끝 데미지를 받으면 가득 찬 HP 를 지키지 못해서 빼고 본다
      perishMine: mv.perish,
      perishOpp: ov.perish,
      holdMine: residMine <= 0 && holdsOn('mine', mv, 'opp', ov),
      holdOpp: residOpp <= 0 && holdsOn('opp', ov, 'mine', mv),
    }
    // 상대가 공격할 때 잃는 HP 는 내 공격과 같이 상대를 깎는다
    if (oppRecoil) d.mine = Math.max(0, d.mine + oppRecoil)
    const bm = berryIn('mine', mv)
    const bo = berryIn('opp', ov)
    if (bm) d.berryMine = bm
    if (bo) d.berryOpp = bo
    if (firstMine != null) d.firstMine = firstMine
    if (firstOpp != null) d.firstOpp = firstOpp
    if (fullMine != null && fullMine < 0.999) d.fullMine = fullMine
    if (fullOpp != null && fullOpp < 0.999) d.fullOpp = fullOpp
    duelCache.set(key, d)
    return d
  }
  // 맞는 쪽 효과가 생기는 경우와 아닌 경우 (효과 여러 개는 서로 따로 — 생기는지마다 나눔)
  const applyFx = (v: View, e: Effect): View => {
    const out = { ...v, ...e.patch }
    return e.delta ? { ...out, boosts: addBoosts(out.boosts, e.delta) } : out
  }
  const splitFx = (v: View, fx: Effect | Effect[]): { p: number; v: View }[] => {
    let out = [{ p: 1, v }]
    for (const e of Array.isArray(fx) ? fx : [fx]) {
      if (e.p <= 1e-9) continue
      out = out.flatMap((x) =>
        e.p >= 1 - 1e-9
          ? [{ p: x.p, v: applyFx(x.v, e) }]
          : [
              { p: x.p * e.p, v: applyFx(x.v, e) },
              { p: x.p * (1 - e.p), v: x.v },
            ],
      )
    }
    return out
  }
  const casesOf = (
    mv: View,
    ov: View,
    onOpp: Effect | Effect[],
    onMine: Effect | Effect[],
  ): NextCase[] => {
    const out: NextCase[] = []
    for (const o of splitFx(ov, onOpp))
      for (const m of splitFx(mv, onMine)) {
        const p = o.p * m.p
        if (p <= 1e-9) continue
        out.push({ p, mv: m.v, ov: o.v })
      }
    return out
  }
  // 턴 뒤 맞대결 재료 + 대기 포켓몬이 들어와 맞대결하는 재료 (bench 가중치가 있을 때, 상대는 공개된 포켓몬만)
  //   ctx: 지금 계산 중인 턴 (대기 포켓몬 HP). 턴 뒤 필드 포켓몬을 뺀 살아 있는 포켓몬 (물러난 포켓몬 포함)
  const aliveBench = (ctx: Ctx, side: BattleSide, onField: number) =>
    S()
      .sides[side].mons.map((_, i) => i)
      .filter(
        (i) =>
          i !== onField &&
          !onFieldPartner(side, i) &&
          hpIn(ctx, side, i) > 0 &&
          (side === 'mine' ||
            (S().sides.opp.revealed.includes(i) && !!b.oppSlots.value[i]?.species)),
      )
  const afterOf = (cases: NextCase[], mi0: number, env: Env, ctx?: Ctx): AfterCases =>
    cases.map((k) => {
      const mi1 = k.mi ?? mi0
      const oi1 = k.ov.idx
      const out: AfterCases[number] = {
        p: k.p,
        duel: duelOf(whiteHerb('mine', k.mv), whiteHerb('opp', k.ov), mi1, env),
        ...(k.myHp != null ? { myHp: k.myHp } : {}),
        ...(k.oppHp != null ? { oppHp: k.oppHp } : {}),
      }
      if (ctx && weights.value.bench > 0) {
        const benchMine: BenchDuel[] = []
        for (const j of aliveBench(ctx, 'mine', mi1)) {
          const v = benchView(ctx, 'mine', j)
          const hp = hpIn(ctx, 'mine', j) - hazardChip('mine', j, hazardsOf(ctx).mine)
          benchMine.push({ duel: duelOf(v, k.ov, j, env), hp })
        }
        const benchOpp: BenchDuel[] = []
        for (const j of aliveBench(ctx, 'opp', oi1)) {
          const v = benchView(ctx, 'opp', j)
          const hp = hpIn(ctx, 'opp', j) - hazardChip('opp', j, hazardsOf(ctx).opp)
          benchOpp.push({ duel: duelOf(k.mv, v, mi1, env), hp })
        }
        if (benchMine.length) out.benchMine = benchMine
        if (benchOpp.length) out.benchOpp = benchOpp
      }
      return out
    })

  // ── 상태 ─────────────
  const viewOf = (side: BattleSide, idx: number, mega: boolean, active: boolean): View => {
    const m = mon(side, idx)
    const v: View = {
      idx,
      mega,
      boosts: active ? { ...m.boosts } : zeroBoosts(),
      status: m.status,
    }
    if (active) {
      const skip = skipOf(side, idx)
      if (skip) v.skip = skip
      if (m.volatiles.substitute) v.absorb = 1
      if (m.volatiles.leechseed) v.seeded = true
      if (m.volatiles.taunt) v.taunted = true
      if (m.volatiles.yawn) v.drowsy = true
      if (m.volatiles.perishsong) v.perish = m.volatiles.perishsong
      if (m.volatiles.torment) v.torment = true
      if (m.volatiles.healblock) v.healBlock = true
      const locked = lockedMove(side, idx)
      if (locked) v.locked = locked
    }
    if (m.itemGone) v.itemGone = true
    if (m.alt && abilityOf(side, idx) === 'disguise') v.busted = true
    return v
  }
  const rootCtx = (mi: number, oi: number, mySlot = 0, oppSlot = 0): Ctx => {
    const s = S()
    const hp = { mine: {} as Record<number, number>, opp: {} as Record<number, number> }
    s.sides.mine.mons.forEach((_, i) => (hp.mine[i] = hpFrac('mine', i)))
    s.sides.opp.mons.forEach((_, i) => (hp.opp[i] = hpFrac('opp', i)))
    return {
      root: true,
      age: 0,
      mi,
      oi,
      mySlot,
      oppSlot,
      mv: viewOf('mine', mi, canMegaEvolve('mine', mi), true),
      ov: viewOf('opp', oi, canMegaEvolve('opp', oi), true),
      hp,
      env: envNow(),
      myLast: mon('mine', mi).lastMove,
      oppLast: mon('opp', oi).lastMove,
      myFresh: firstTurnOut('mine', mi),
      oppFresh: firstTurnOut('opp', oi),
      myActs: actsOf('mine', mi),
      oppActs: actsOf('opp', oi),
      megaMine: !b.sideMegaUsed('mine'),
      megaOpp: !b.sideMegaUsed('opp'),
    }
  }
  // 대기 포켓몬 (살아 있는). 상대는 공개된 포켓몬만
  const benchIn = (c: Ctx, side: BattleSide) => {
    const s = S()
    const active = side === 'mine' ? c.mi : c.oi
    return s.sides[side].mons
      .map((_, i) => i)
      .filter(
        (i) =>
          i !== active &&
          !onFieldPartner(side, i) &&
          hpIn(c, side, i) > 0 &&
          (side === 'mine' || (s.sides.opp.revealed.includes(i) && !!b.oppSlots.value[i]?.species)),
      )
  }
  const canMega = (c: Ctx, side: BattleSide, idx: number) =>
    (side === 'mine' ? c.megaMine : c.megaOpp) && canMegaEvolve(side, idx)
  const benchCache = new Map<string, View>()
  const benchView = (c: Ctx, side: BattleSide, k: number) => {
    const mega = canMega(c, side, k)
    const key = `${side}${k}${mega}`
    let v = benchCache.get(key)
    if (!v) benchCache.set(key, (v = viewOf(side, k, mega, false)))
    return v
  }

  // ── 데이터에 효과가 없는 기술 ─────────────
  // 설치기 부담: side 에 깔린 설치기를 앞으로 들어올 포켓몬이 밟는 데미지 합 (상대는 아직 안 나온 선출 포함)
  const burden = (c: Ctx, side: BattleSide) => {
    const hz = hazardsOf(c)[side]
    if (!hz.stealthrock && !hz.spikes) return 0
    const { bench, unknown } = futureEntries(c, side, side === 'mine' ? c.mi : c.oi)
    const generic =
      (hz.stealthrock ? 1 / 8 : 0) + (hz.spikes ? 1 / [8, 8, 6, 4][Math.min(3, hz.spikes)]! : 0)
    return (
      HAZARD_ENTRY * (bench.reduce((a, i) => a + hazardChip(side, i, hz), 0) + unknown * generic)
    )
  }
  // side 의 uv 가 moveId 를 tv 에게 쓸 때. targetMove: 맞는 쪽이 이번 턴 쓰는 기술 (트릭으로 고정)
  const specialOf = (
    c: Ctx,
    side: BattleSide,
    moveId: string,
    uv: View,
    uHp: number,
    tv: View,
    tHp: number,
    env: Env,
    last: string,
    targetMove: string,
  ): Special => {
    const sp: Special = {
      heal: 0,
      cost: 0,
      self: {},
      selfPatch: {},
      target: null,
      dealt: 0,
      resetBoosts: false,
      destinyBond: false,
      phaze: 0,
      utility: 0,
      fails: false,
      revive: null,
    }
    if (!moveId) return sp
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const uMax = maxHp(side, uv.idx)
    const tMax = maxHp(foe, tv.idx)
    const user = resolveAt(side, uv.idx, uv.mega || undefined)
    const ab = user?.ability || ''
    if (SUN_HEAL.has(moveId))
      sp.heal =
        env.weather === 'sun' || env.weather === 'harshsun'
          ? 2 / 3
          : WEAK_HEAL_WEATHER.has(env.weather)
            ? 1 / 4
            : 1 / 2
    else if (moveId === 'shoreup') sp.heal = env.weather === 'sand' ? 2 / 3 : 1 / 2
    // 희망사항: 다음 턴 끝 1/2 — 늦게 들어오는 만큼 깎아서 이번 턴 회복으로
    else if (moveId === 'wish') sp.heal = 0.4
    else if (moveId === 'rest') {
      if (uHp >= 0.999 || uv.status === 'slp' || STATUS_ABILITY_IMMUNE.slp?.includes(ab))
        sp.fails = true
      else {
        sp.heal = 1
        sp.selfPatch = { status: 'slp', skip: skipDist(WAKE_CHANCE.rest, 0) }
      }
    } else if (moveId === 'curse') {
      if (user?.species.types.includes('ghost')) {
        sp.cost = 0.5
        if (!tv.cursed) sp.target = { p: 1, patch: { cursed: true } }
      } else sp.self = { atk: 1, def: 1, spe: -1 }
    } else if (moveId === 'bellydrum') {
      if (uHp > 0.5) {
        sp.cost = 0.5
        sp.self = { atk: 12 }
      } else sp.fails = true
    } else if (moveId === 'painsplit') {
      const avg = (uHp * uMax + tHp * tMax) / 2
      sp.dealt = Math.max(0, (tHp * tMax - avg) / Math.max(1, tMax))
      sp.heal = Math.max(0, (avg - uHp * uMax) / Math.max(1, uMax))
      if (!sp.dealt) sp.fails = true
    } else if (moveId === 'strengthsap') {
      const t = side === 'mine' ? oppCs(tv, false)[1] : mineC(tv, false)
      if (!t || tv.boosts.atk <= -6) sp.fails = true
      else {
        sp.heal = Math.min(1, (t.stats.atk * boostMultiplier(tv.boosts.atk)) / Math.max(1, uMax))
        sp.target = { p: 1, patch: { boosts: addBoosts(tv.boosts, { atk: -1 }) } }
      }
    } else if (moveId === 'revivalblessing') {
      // 쓰러진 포켓몬 하나를 HP 1/2 로 (상대는 공개된 포켓몬 중). 고르는 것은 남은 HP 가 가장 큰 쪽 대신 첫 번째로 어림
      const sd = S().sides[side]
      const k = sd.mons.findIndex(
        (_, i) => hpIn(c, side, i) <= 0 && (side === 'mine' || sd.revealed.includes(i)),
      )
      if (k < 0) sp.fails = true
      else sp.revive = k
    } else if (moveId === 'perishsong') {
      // 필드의 양쪽 다 (방음은 맞는 쪽만 무효). 이미 카운트가 있으면 그대로. 맞는 쪽은 턴 끝 뒤 값(3)으로 붙음
      if (!uv.perish) sp.selfPatch = { perish: 4 }
      if (!tv.perish && oneC(foe, tv)?.ability !== 'soundproof')
        sp.target = { p: 1, patch: { perish: 3 } }
      if (uv.perish && (tv.perish || oneC(foe, tv)?.ability === 'soundproof')) sp.fails = true
    } else if (moveId === 'haze') sp.resetBoosts = true
    else if (moveId === 'destinybond') sp.destinyBond = last !== 'destinybond'
    else if (PHAZE_MOVES.has(moveId)) {
      const move = gd.move(moveId)
      const atk = oneC(side, uv, true)
      const def = oneC(foe, tv)
      sp.phaze =
        benchIn(c, foe).filter((k) => k !== tv.idx).length && move && atk && def
          ? hitChance(move, atk, def, fieldFor(foe))
          : 0
    } else if (HAZARD_CLEAR.has(moveId))
      sp.utility = burden(c, side) - (moveId === 'defog' ? burden(c, foe) : 0)
    else if (moveId === 'trick' || moveId === 'switcheroo') {
      // 구애 도구를 넘기면 맞는 쪽은 이번 턴 기술로 고정되고 원래 도구를 잃음 (변화기면 공격 못 함)
      const mine = itemOf(side, uv)
      const theirs = itemOf(foe, tv)
      const t = oneC(foe, tv)
      if (
        CHOICE_ITEMS.has(mine) &&
        t?.ability !== 'stickyhold' &&
        !gd.data.value?.items[theirs]?.megaStone
      ) {
        sp.target = {
          p: 1,
          patch: {
            itemGone: true,
            ...(targetMove && !isStatus(targetMove)
              ? { locked: targetMove }
              : { skip: [{ turns: ENCORE_SKIP, p: 1 }] }),
          },
        }
        sp.selfPatch = { itemGone: true }
      }
    }
    return sp
  }
  // 강제 교체: 맞는 쪽이 공개된 대기 포켓몬 중 하나로 (설치기 데미지 포함). foe = 맞는 쪽
  const phazeCases = (c: Ctx, cases: NextCase[], foe: BattleSide, current: number, p: number) => {
    if (p <= 0) return cases
    const bench = benchIn(c, foe).filter((k) => k !== current)
    if (!bench.length) return cases
    const out: NextCase[] = cases.map((k) => ({ ...k, p: k.p * (1 - p) }))
    for (const k of cases)
      for (const j of bench) {
        const v = benchView(c, foe, j)
        const hp = Math.max(0.01, hpIn(c, foe, j) - hazardChip(foe, j, S().sides[foe].hazards))
        out.push(
          foe === 'opp'
            ? { ...k, p: (k.p * p) / bench.length, ov: v, oi: j, oppHp: hp }
            : { ...k, p: (k.p * p) / bench.length, mv: v, mi: j, myHp: hp },
        )
      }
    return out
  }

  // 열매 회복량: HP 1/2 초과에서 시작할 때만 (이하면 이미 먹었을 것), 회복봉인이면 없음
  const berryOf = (side: BattleSide, v: View, hp: number) => {
    if (v.healBlock || hp <= 0.5) return 0
    const item = itemOf(side, v)
    if (HEAL_BERRY[item]) return HEAL_BERRY[item]!
    if (item === 'oranberry') return 10 / Math.max(1, maxHp(side, v.idx))
    return 0
  }
  // 재생력: 물러나는 포켓몬
  const regenOf = (c: Ctx, side: BattleSide, idx: number) =>
    abilityOf(side, idx) === 'regenerator' ? { hp: hpIn(c, side, idx), heal: REGEN } : undefined
  // 가속: 턴 끝 스피드 +1 (나온 턴에는 안 됨 — 실제 상태면 나온 턴으로, 계산 안에서는 이번 턴에 들어온 포켓몬이면)
  const speedBoostOf = (c: Ctx, side: BattleSide, idx: number) =>
    abilityOf(side, idx) === 'speedboost' && (!c.root || mon(side, idx).enteredTurn < S().turn)
      ? { spe: 1 }
      : {}
  // 독치장: 물리 공격을 맞으면 공격한 쪽 진영에 독압정 (atkSide = 공격한 쪽, onField = 턴 뒤 그쪽 필드 포켓몬)
  const debrisOf = (
    c: Ctx,
    moveId: string,
    def: Combatant | null | undefined,
    hit: Hit | null,
    atkSide: BattleSide,
    onField: number,
  ) =>
    hit && def?.ability === 'toxicdebris' && gd.move(moveId)?.category === 'physical'
      ? hit.acc * hazardValue(c, 'toxicspikes', atkSide, onField)
      : 0
  // 회복봉인: 흡수 회복 없음
  const blockDrain = (e: SelfEffect | undefined, v: View): SelfEffect | undefined =>
    e && v.healBlock && e.perDealt < 0 ? { ...e, perDealt: 0 } : e

  // ── 한 턴 ─────────────
  // 상대 선택지와 사전 비중: 기술 = 확정 1 / 채용률 (없으면 0.5), 교체 = oppSwitch × 들어올 포켓몬 몫.
  // 실제 비중은 결과표를 만든 뒤 상대에게 유리한 정도로 정한다 (playWeights)
  // 상대가 들어올 수 있는 포켓몬과 그 몫: 공개된 대기 포켓몬 1, 아직 안 나온 파티는 남은 선출 수 / 후보 수
  // (안 나온 파티는 이번 턴만 — 다음 턴 계산까지 넣으면 계산이 너무 커짐)
  const oppSwitchTargets = (c: Ctx) => {
    const sd = S().sides.opp
    const out = benchIn(c, 'opp').map((to) => ({ to, share: 1 }))
    // 다음 턴 계산에서는 이번 턴 들어온 미공개 포켓몬도 나온 것으로 셈
    const left = OPP_PICK - new Set([...sd.revealed, c.oi]).size
    if (left > 0) {
      const unseen = b.oppSlots.value
        .map((_, i) => i)
        .filter(
          (i) =>
            i !== c.oi &&
            !sd.revealed.includes(i) &&
            !!b.oppSlots.value[i]?.species &&
            hpIn(c, 'opp', i) > 0,
        )
      const share = Math.min(1, left / Math.max(1, unseen.length))
      out.push(...unseen.map((to) => ({ to, share })))
    }
    return out
  }
  // 상대 행동 경향 (이번 배틀 기록): 교체 비율이 높으면 교체 사전 비중을 올림 (관측이 적으면 거의 그대로).
  //   기준 교체 비율 SWITCH_BASE 를 사전값 2턴 몫으로 섞은 비율 / 기준, 0.3 ~ 3배
  const switchHabit = () => {
    const log = S().log ?? []
    let n = 0
    let sw = 0
    for (const t of log) {
      const a = t.opp[0]
      if (!a || a.kind === 'cant') continue
      n++
      if (a.kind === 'switch' || a.selfSwitch != null) sw++
    }
    const rate = (sw + 2 * SWITCH_BASE) / (n + 2)
    return Math.max(0.3, Math.min(3, rate / SWITCH_BASE))
  }
  // 이번 배틀에서 여러 번 쓴 기술은 또 쓸 가능성이 높다 (한 번 더 쓸 때마다 +0.3, 최대 2배)
  const repeatHabit = (oi: number, move: string) =>
    Math.min(2, 1 + 0.3 * Math.max(0, (b.ppUsedOf('opp', oi)[move] || 0) - 1))
  const oppOptionsOf = (c: Ctx, w: RecWeights) => {
    const all = oppOptionsRaw(c, w)
    // 사용자가 정한 비중 (자주 씀 3배 / 안 씀 0). 전부 안 씀이면 무시
    const prefs = prefStore.prefsFor(S().signature)
    const tuned = all.map((o) => {
      const pref = prefs[`${c.oi}|${oppOptionKey(o)}`]
      return { ...o, prior: o.prior * (pref === 'up' ? OPP_PREF_UP : pref === 'off' ? 0 : 1) }
    })
    return tuned.some((o) => o.prior > 0) ? tuned : all
  }
  const oppOptionsRaw = (c: Ctx, w: RecWeights) => {
    const { moves, known } = oppMoves(c.oi, c)
    const table = gd.usageTable(b.N > 1 ? 'double' : 'single', reg.active.value?.id)
    const r = resolveAt('opp', c.oi, c.ov.mega || undefined)
    const usage =
      table?.pokemon[r?.species.id ?? '']?.moveUsage ?? table?.pokemon[r?.base.id ?? '']?.moveUsage
    const targets = oppSwitchTargets(c)
    const total = targets.reduce((a, x) => a + x.share, 0)
    const habit = switchHabit()
    // 교체기(유턴 등)는 교체를 막는 상태에서도 쓸 수 있다
    const bench = (c.root && b.switchBlocked('opp', c.oppSlot ?? 0)) || c.ov.rampage ? [] : targets
    // 실제 턴에 메가진화할 수 있으면 같은 기술을 "메가 미룸"으로도 (사전 비중 OPP_DELAY_MEGA 배)
    const delay = c.root && c.ov.mega && c.megaOpp
    type MoveOpt = { kind: 'move'; move: string; pivotTo?: number; noMega?: boolean; prior: number }
    const withDelay = (xs: MoveOpt[]): MoveOpt[] =>
      delay
        ? [...xs, ...xs.map((x) => ({ ...x, noMega: true, prior: x.prior * OPP_DELAY_MEGA }))]
        : xs
    return [
      ...moves.flatMap((move) => {
        const prior = known.has(move) ? repeatHabit(c.oi, move) : (usage?.[move] ?? 0.5)
        return withDelay(
          PIVOT_MOVES.has(move) && targets.length
            ? targets.map((x) => ({
                kind: 'move' as const,
                move,
                pivotTo: x.to,
                prior: (prior * x.share) / total,
              }))
            : [{ kind: 'move' as const, move, prior }],
        )
      }),
      ...(w.oppSwitch > 0
        ? bench.map((x) => ({
            kind: 'switch' as const,
            to: x.to,
            prior: w.oppSwitch * habit * x.share,
          }))
        : []),
    ]
  }
  const mineOptionsOf = (c: Ctx): MineOption[] => {
    const bench = benchIn(c, 'mine')
    // 이번 턴 메가진화: 메가 폼으로 계산 중이고 진영이 아직 메가진화하지 않음.
    //   실제 턴(root)에서는 "이번 턴 메가 / 미룸" 둘 다 (다음 턴부터는 할 수 있으면 하는 것으로)
    const mega = c.mv.mega && c.megaMine
    const megas = mega && c.root ? [true, false] : [mega]
    return [
      ...mineMoves(c).flatMap((move): MineOption[] =>
        megas.flatMap((m): MineOption[] =>
          PIVOT_MOVES.has(move) && bench.length
            ? bench.map((pivotTo) => ({ kind: 'move', move, mega: m, pivotTo }))
            : [{ kind: 'move', move, mega: m }],
        ),
      ),
      ...((c.root && b.switchBlocked('mine', c.mySlot ?? 0)) || c.mv.rampage
        ? []
        : bench.map((to) => ({ kind: 'switch' as const, to }))),
    ]
  }

  // 되돌려 주는 기술의 배율 (받은 데미지 → 맞는 쪽 최대 HP 대비). 상대 기술 분류가 안 맞거나 타입 무효면 0, 아니면 undefined
  //   카운터 = 물리 × 2 (고스트 무효), 미러코트 = 특수 × 2 (악 무효), 메탈버스트·앙갚음 = 공격기 × 1.5
  const revengeOf = (
    moveId: string,
    foeMove: string,
    foe: BattleSide,
    fv: View,
    userIdx: number,
    foeIdx: number,
  ) => {
    if (!REVENGE_MOVES.has(moveId)) return undefined
    const cat = gd.move(foeMove)?.category
    const types: readonly string[] = oneC(foe, fv)?.species.types ?? []
    const mult =
      moveId === 'counter'
        ? cat === 'physical' && !types.includes('ghost')
          ? 2
          : 0
        : moveId === 'mirrorcoat'
          ? cat === 'special' && !types.includes('dark')
            ? 2
            : 0
          : cat && cat !== 'status'
            ? 1.5
            : 0
    const user: BattleSide = foe === 'mine' ? 'opp' : 'mine'
    return (mult * maxHp(user, userIdx)) / Math.max(1, maxHp(foe, foeIdx))
  }
  // 배턴터치로 넘어가는 상태
  const passedOf = (v: View): Partial<View> => ({
    boosts: v.boosts,
    ...(v.absorb ? { absorb: v.absorb } : {}),
    ...(v.seeded ? { seeded: true } : {}),
    ...(v.cursed ? { cursed: true } : {}),
    ...(v.perish ? { perish: v.perish } : {}),
  })

  // 내 선택지 × 상대 선택지 한 칸 + 다음 턴 재료
  const cellOf = (c: Ctx, opt: MineOption, oo: OppOption): Cell2 => {
    // 이번 턴 메가진화하지 않는 선택지: 메가 전 폼으로 계산 (다음 턴에 할 수 있음)
    if (opt.kind === 'move' && !opt.mega && c.mv.mega && c.megaMine)
      return cellOf({ ...c, mv: { ...c.mv, mega: false } }, opt, oo)
    // 상대가 메가진화를 미룸: 메가 전 폼으로 (다음 턴에 할 수 있음)
    if (oo.kind === 'move' && oo.noMega) {
      const rest = { kind: 'move' as const, move: oo.move, pivotTo: oo.pivotTo }
      return c.ov.mega && c.megaOpp
        ? cellOf({ ...c, ov: { ...c.ov, mega: false } }, opt, rest)
        : cellOf(c, opt, rest)
    }
    // 막히는 변화기 (매직미러·황금몸·심술꾸러기 → 악): 아무것도 안 한 것으로, 반사된 설치기는 쓴 쪽에
    const tgtOpp = oo.kind === 'switch' ? benchView(c, 'opp', oo.to) : c.ov
    if (opt.kind === 'move' && opt.move) {
      const bl = blockOf(opt.move, mineC(c.mv, true), oppCs(tgtOpp, false)[0])
      if (bl) {
        const cell = cellOf(c, { kind: 'move', move: '', mega: opt.mega }, oo)
        if (bl === 'bounce')
          cell.ex.myUtility = (cell.ex.myUtility || 0) - hazardValue(c, opt.move, 'mine', c.mi)
        return cell
      }
    }
    if (oo.kind === 'move' && oo.move) {
      const tgt = opt.kind === 'switch' ? benchView(c, 'mine', opt.to) : c.mv
      const bl = blockOf(oo.move, oppCs(c.ov, true)[0], mineC(tgt, false))
      if (bl) {
        const cell = cellOf(c, opt, { kind: 'move', move: '' })
        if (bl === 'bounce')
          cell.ex.oppUtility = (cell.ex.oppUtility || 0) - hazardValue(c, oo.move, 'opp', c.oi)
        return cell
      }
    }
    // 도발을 먼저 맞히면 상대의 이번 턴 변화기는 실패 → 아무것도 안 한 것으로 계산
    if (
      opt.kind === 'move' &&
      opt.move === 'taunt' &&
      oo.kind === 'move' &&
      oo.move &&
      isStatus(oo.move) &&
      !c.ov.taunted &&
      !TAUNT_IMMUNE.has(abilityOf('opp', c.oi))
    ) {
      const pm = movePriority('mine', c.mi, 'taunt')
      const po = movePriority('opp', c.oi, oo.move)
      if (pm !== po ? pm > po : firstOf(c.mv, c.ov, c.mi, c.env) >= 0.5)
        return cellOf(c, opt, { kind: 'move', move: '' })
    }
    const mi = c.mi
    const oi = c.oi
    const myHp = hpIn(c, 'mine', mi)
    // 맞는 쪽 HP (KO 확률용): 실제 상태는 배틀 상태 그대로, 다음 턴은 그 시점 HP
    const dh = (x: number) => (c.root ? undefined : x)
    // ── 교체로 들어오는 쪽 (교체가 먼저: 등장 특성 → 이번 턴 공격에도 반영) ──
    const oppIn = oo.kind === 'switch'
    const myIn = opt.kind === 'switch' ? opt.to : null
    const inAb = myIn != null ? abilityOf('mine', myIn) : ''
    const oppInAb = oppIn ? abilityOf('opp', oo.to) : ''
    const oppAbility = abilityOf('opp', oi)
    const envIn = envWith(envWith(c.env, inAb), oppInAb)
    // 상대 쪽: 교체면 들어오는 포켓몬이 내 공격을 받는다
    let ovT = oppIn ? benchView(c, 'opp', oo.to) : c.ov
    if (inAb === 'intimidate')
      ovT = {
        ...ovT,
        boosts: addBoosts(ovT.boosts, intimidateDelta(oppIn ? oppInAb : oppAbility)),
      }
    const ovIdx = ovT.idx
    // 상대가 위협으로 들어오면 내 쪽 랭크가 내려간 채로 이번 턴 공격
    const mvBase = (v: View, ab: string) =>
      oppInAb === 'intimidate' ? { ...v, boosts: addBoosts(v.boosts, intimidateDelta(ab)) } : v
    const om = oo.kind === 'move' ? oo.move : ''
    const fo = fxOf(om)
    // 설치기: 지금 깔린 것, 턴이 끝났을 때 양쪽 필드에 있을 포켓몬 (설치기 가치는 그 포켓몬을 빼고 앞으로 들어올 포켓몬 기준)
    const hz0 = hazardsOf(c)
    // 들어올 때 밟는 데미지는 실제 배틀 상태의 설치기 기준 — 계산 안에서 새로 깐 설치기는 깐 턴의 설치기 가치로 이미 셌다
    //   (앞으로 들어올 포켓몬 몫이라 다음 턴 교체에서 또 세면 두 번이 됨). 이번 턴 안의 변화(lateChip)는 그 위에
    const hzChip: Hazards = { mine: S().sides.mine.hazards, opp: S().sides.opp.hazards }
    const myField = opt.kind === 'switch' ? opt.to : (opt.pivotTo ?? mi)
    const oppField = oppIn ? oo.to : oo.kind === 'move' ? (oo.pivotTo ?? oi) : oi
    // 다음 턴의 설치기 (이번 턴에 깔거나 치운 것) — 분기마다 정함
    let hzEnd = hz0
    // 회생의기도으로 되살린 포켓몬 (다음 턴 HP 1/2) — 분기마다 정함
    let revMine: number | null = null
    let revOpp: number | null = null
    const oppAtk = oppCs(c.ov, true)[0]
    const oppChoice = CHOICE_ITEMS.has(itemOf('opp', c.ov))
    const oppCommon = {
      oppHp: hpIn(c, 'opp', ovIdx),
      oppSwitchIn: oppIn,
      oppEntryChip: oppIn ? hazardChip('opp', oo.to, hzChip.opp) : 0,
      oppActs: c.oppActs,
      oppProtect: !oppIn && PROTECT_MOVES.has(om) && !PROTECT_MOVES.has(c.oppLast),
      oppHeal: c.ov.healBlock ? 0 : fo.heal,
      oppUtility: om ? hazardValue(c, om, 'mine', myField) : 0,
      oppBerry: berryOf('opp', ovT, hpIn(c, 'opp', ovIdx)),
      myLeft: futureEntries(c, 'mine', mi).bench.length,
      oppLeft: (() => {
        const f = futureEntries(c, 'opp', oi)
        return f.bench.length + f.unknown
      })(),
      oppRegen:
        oppIn || (oo.kind === 'move' && oo.pivotTo != null) ? regenOf(c, 'opp', oi) : undefined,
    }
    // 상대 기술이 나간 뒤의 상대 (랭크·벽·순풍·구애 고정·반동)
    const oppAfter = (env: Env, base: View): View =>
      oppIn
        ? base
        : endOfTurn({
            ...base,
            boosts: addBoosts(base.boosts, fo.self, speedBoostOf(c, 'opp', base.idx)),
            screens: newScreens('opp', fo, env),
            ...newTailwind('opp', fo),
            ...(oppChoice && om ? { locked: om } : {}),
            ...(RAMPAGE_MOVES.has(om) ? { locked: om, rampage: true } : {}),
            ...(fo.recharge ? { skip: [{ turns: 1, p: 1 }] } : {}),
          })
    // 특수 기술의 자기 쪽 변화 (랭크·잠자기·트릭). reset: 흑안개로 랭크 0
    const withSpecial = (v: View, sp: Special, reset: boolean): View => ({
      ...v,
      boosts: reset || sp.resetBoosts ? zeroBoosts() : addBoosts(v.boosts, sp.self),
      ...sp.selfPatch,
    })
    // HP 비용 (배북·저주): 공격한 쪽 HP 변화에 더함
    const costed = (e: SelfEffect | undefined, cost: number): SelfEffect | undefined =>
      cost ? { perDealt: e?.perDealt ?? 0, onHit: (e?.onHit ?? 0) + cost } : e
    // 다음 턴 상태
    // p.oi: 상대 교체기로 들어온 포켓몬 (없으면 이번 턴 맞은 포켓몬)
    const nextCtx = (
      p: { mi: number; oi?: number; mv: View; ov: View; myHp: number; oppHp: number; env: Env },
      myLast: string,
      myFresh: boolean,
      megaUsed: boolean,
      cs?: NextCase,
      ate?: Ate,
    ): Ctx => {
      // HP 는 2% 단위로 묶는다 (다음 턴 계산을 경우끼리 나눠 쓰려고)
      const q = (x: number) => Math.max(0.02, Math.round(x * 50) / 50)
      const nm = nextTurnView(whiteHerb('mine', ate?.mine ? { ...p.mv, itemGone: true } : p.mv))
      const no = nextTurnView(whiteHerb('opp', ate?.opp ? { ...p.ov, itemGone: true } : p.ov))
      // 이번 턴 메가진화하지 않았으면 다음 턴에 할 수 있음
      if (!megaUsed && c.megaMine && !nm.view.mega && canMegaEvolve('mine', p.mi))
        nm.view = { ...nm.view, mega: true }
      // 상대도 같음 (메가 미룸)
      if (c.megaOpp && !c.ov.mega && !no.view.mega && canMegaEvolve('opp', no.view.idx))
        no.view = { ...no.view, mega: true }
      // 강제 교체로 바뀐 쪽: 원래 포켓몬은 이번 턴이 끝난 HP 로 대기
      const oiEnd = p.oi ?? ovIdx
      const mi2 = cs?.mi ?? p.mi
      const oi2 = cs?.oi ?? oiEnd
      const mineHp = { ...c.hp.mine, [p.mi]: q(p.myHp) }
      const oppHp = { ...c.hp.opp, [oiEnd]: q(p.oppHp) }
      // 재생력: 물러난 포켓몬 (이번 턴 데미지는 따로 모르므로 지금 HP 기준)
      if (p.mi !== mi && abilityOf('mine', mi) === 'regenerator' && hpIn(c, 'mine', mi) > 0)
        mineHp[mi] = q(Math.min(1, hpIn(c, 'mine', mi) + REGEN))
      if (oiEnd !== oi && abilityOf('opp', oi) === 'regenerator' && hpIn(c, 'opp', oi) > 0)
        oppHp[oi] = q(Math.min(1, hpIn(c, 'opp', oi) + REGEN))
      if (revMine != null) mineHp[revMine] = 0.5
      if (revOpp != null) oppHp[revOpp] = 0.5
      if (cs?.mi != null) mineHp[cs.mi] = q(cs.myHp ?? hpIn(c, 'mine', cs.mi))
      if (cs?.oi != null) oppHp[cs.oi] = q(cs.oppHp ?? hpIn(c, 'opp', cs.oi))
      return {
        root: false,
        age: c.age + 1,
        mi: mi2,
        oi: oi2,
        mv: nm.view,
        ov: no.view,
        hp: { mine: mineHp, opp: oppHp },
        env: expire(c, p.env),
        myLast: cs?.mi != null ? '' : myLast,
        oppLast: oppIn || p.oi != null || cs?.oi != null ? '' : om,
        myFresh: myFresh || cs?.mi != null,
        oppFresh: oppIn || p.oi != null || cs?.oi != null,
        myActs: nm.acts,
        oppActs: no.acts,
        megaMine: c.megaMine && !megaUsed,
        megaOpp: c.megaOpp && !c.ov.mega,
        hz: hzEnd,
      }
    }

    // 상대 교체기: 상대가 행동한 뒤 들어오는 포켓몬 (이번 턴 메가진화했으면 메가진화 못 함). 등장 특성(위협·날씨) 반영
    //   my / myPivot: 턴 뒤 내 쪽 (내 교체기로 바뀌지 않은 경우 / 바뀐 경우)
    //   hitIn: 상대가 먼저 물러났을 때 내 기술이 들어온 포켓몬에게 주는 데미지, onIn: 그때 생기는 효과
    interface MySide {
      mi: number
      mv: View
      onMine: Effect | Effect[]
      env: Env
      last: string
      fresh: boolean
      mega: boolean
    }
    const withOppPivot = (
      cell: Cell2,
      my: MySide,
      myPivot: MySide | null,
      hitIn: (v: View) => Hit | null,
      onIn: (v: View) => Effect | Effect[],
      myMove: string,
      oppEnd: View, // 턴 뒤 원래 상대 (배턴터치로 넘기는 상태)
    ): Cell2 => {
      if (oo.kind !== 'move' || oo.pivotTo == null) return cell
      const k = oo.pivotTo
      const kAb = abilityOf('opp', k)
      const vk: View = {
        ...viewOf('opp', k, false, false),
        ...(om === 'batonpass' ? passedOf(oppEnd) : {}),
      }
      const vkNext: View = {
        ...vk,
        mega: !c.ov.mega && canMega(c, 'opp', k),
        ...newTailwind('opp', fo),
      }
      const onK = onIn(vk)
      const branch = (m: MySide) => {
        const mv =
          kAb === 'intimidate'
            ? {
                ...m.mv,
                boosts: addBoosts(m.mv.boosts, intimidateDelta(abilityOf('mine', m.mi))),
              }
            : m.mv
        const env = envWith(m.env, kAb)
        const cases = casesOf(mv, vkNext, onK, m.onMine)
        return { cases, after: afterOf(cases, m.mi, expire(c, env), c), env }
      }
      cell.ex.oppPivot = {
        oppHp: hpIn(c, 'opp', k),
        entryChip: hazardChip('opp', k, hzChip.opp),
        // 내 기술이 먼저 나갔으면 내가 깔거나 치운 설치기를 밟음
        lateChip: hazardChip('opp', k, hazardsAfter(hzChip, myMove, 'mine').opp),
        mine: hitIn(vk),
      }
      const a = branch(my)
      cell.ex.afterOppPivot = a.after
      cell.cases['01'] = a.cases
      const both = myPivot ? branch(myPivot) : null
      if (both) {
        cell.ex.afterBothPivot = both.after
        cell.cases['11'] = both.cases
      }
      const plain = cell.next
      cell.next = (pivoted, oppPivoted, cs, mh, oh, ate) => {
        if (!oppPivoted) return plain(pivoted, oppPivoted, cs, mh, oh, ate)
        const m = pivoted && myPivot ? myPivot : my
        const env = pivoted && both ? both.env : a.env
        return nextCtx(
          { mi: m.mi, oi: k, mv: cs.mv, ov: cs.ov, myHp: mh, oppHp: oh, env },
          m.last,
          m.fresh,
          m.mega,
          cs,
          ate,
        )
      }
      return cell
    }

    if (opt.kind === 'switch') {
      const inHp = hpIn(c, 'mine', opt.to)
      const mvIn = mvBase(viewOf('mine', opt.to, false, false), inAb)
      const env = envWith(envIn, '', om)
      hzEnd = hazardsAfter(hz0, om, 'opp')
      const so = specialOf(c, 'opp', om, c.ov, oppCommon.oppHp, mvIn, inHp, env, c.oppLast, '')
      const ovNext = tickPerish(withSpecial(oppAfter(env, ovT), so, false))
      revOpp = so.revive
      const mvNext: View = {
        ...mvIn,
        mega: canMega(c, 'mine', opt.to),
        boosts: addBoosts(mvIn.boosts, fo.target),
        ...(so.resetBoosts ? { boosts: zeroBoosts() } : {}),
      }
      const oppHitIn = om ? oppHit(om, ovT, mvIn, envIn, dh(inHp)) : null
      const defIn = mineC(mvIn, false)
      const onMineIn = om
        ? [
            so.target ?? effectOn(om, oppAtk, defIn, 'mine', mvIn, false, ''),
            ...hitFx(om, oppAtk, defIn, mvIn, oppHitIn),
          ]
        : NO_EFFECT
      const cases = casesOf(mvNext, ovNext, NO_EFFECT, onMineIn)
      const cell: Cell2 = {
        ex: {
          ...oppCommon,
          oppHeal: c.ov.healBlock ? 0 : fo.heal + so.heal,
          oppRevive: so.revive != null ? 0.5 : 0,
          oppUtility:
            oppCommon.oppUtility + so.utility - debrisOf(c, om, defIn, oppHitIn, 'opp', oppField),
          pFirst: 1,
          myHp: inHp,
          myBerry: berryOf('mine', mvIn, inHp),
          myRegen: regenOf(c, 'mine', mi),
          mine: null,
          opp: so.dealt ? { min: so.dealt, max: so.dealt, acc: 1, ko: 0 } : oppHitIn,
          oppSelf: blockDrain(
            costed(
              om ? selfOf(om, oppAtk, maxHp('opp', oi), maxHp('mine', opt.to), defIn) : undefined,
              so.cost,
            ),
            c.ov,
          ),
          switchIn: true,
          entryChip: hazardChip('mine', opt.to, hzChip.mine),
          after: afterOf(cases, opt.to, expire(c, env), c),
          oppPerish: ovNext.perish === 0,
        },
        cases: { '00': cases },
        next: (_, __, cs, mh, oh, ate) =>
          nextCtx(
            { mi: opt.to, mv: cs.mv, ov: cs.ov, myHp: mh, oppHp: oh, env },
            '',
            true,
            false,
            cs,
            ate,
          ),
      }
      return withOppPivot(
        cell,
        { mi: opt.to, mv: mvNext, onMine: onMineIn, env, last: '', fresh: true, mega: false },
        null,
        () => null,
        () => NO_EFFECT,
        '',
        ovNext,
      )
    }

    const move = opt.move
    const fm = fxOf(move)
    const mvT = mvBase(c.mv, abilityOf('mine', mi))
    const pm = movePriority('mine', mi, move)
    const po = om ? movePriority('opp', oi, om) : 0
    const pFirst = oppIn ? 1 : pm !== po ? (pm > po ? 1 : 0) : firstOf(mvT, c.ov, mi, envIn)
    const mineFirst = pFirst >= 0.5
    // 나중에 움직이는 쪽의 날씨·필드·트릭룸이 남는다
    const env = mineFirst
      ? envWith(envWith(envIn, '', move), '', om)
      : envWith(envWith(envIn, '', om), '', move)
    // 기습: 상대가 변화기·교체면 실패. 대타: 이미 있거나 HP 1/4 이하면 실패
    // 상대 도발을 먼저 맞으면 변화기는 실패
    const fails =
      // 잠꼬대는 잠들어 있을 때만 (선택지에서 이미 거름)
      (move === 'sleeptalk' && c.mv.status !== 'slp') ||
      (SUCKER_MOVES.has(move) && (oppIn || isStatus(om))) ||
      (move === 'substitute' && (!!c.mv.absorb || myHp <= 0.25)) ||
      (!mineFirst &&
        om === 'taunt' &&
        isStatus(move) &&
        !c.mv.taunted &&
        !TAUNT_IMMUNE.has(abilityOf('mine', mi)))
    const sub = move === 'substitute' && !fails
    const myAtk = mineC(mvT, true)
    const myDef = mineC(mvT, false)
    const defT = oppCs(ovT, false)[0]
    const myChoice = CHOICE_ITEMS.has(itemOf('mine', c.mv))
    const tHp = oppCommon.oppHp
    const sm = specialOf(c, 'mine', move, mvT, myHp, ovT, tHp, env, c.myLast, oppIn ? '' : om)
    const so = specialOf(c, 'opp', om, c.ov, hpIn(c, 'opp', oi), mvT, myHp, env, c.oppLast, move)
    const failsAll = fails || sm.fails
    // 나중에 움직인 쪽의 설치기 변화가 마지막 (깐 뒤 치움 / 치운 뒤 깖)
    hzEnd = mineFirst
      ? hazardsAfter(hazardsAfter(hz0, failsAll ? '' : move, 'mine'), om, 'opp')
      : hazardsAfter(hazardsAfter(hz0, om, 'opp'), failsAll ? '' : move, 'mine')
    const reset = sm.resetBoosts || so.resetBoosts
    revMine = failsAll ? null : sm.revive
    revOpp = so.fails ? null : so.revive
    // 내 기술이 나간 뒤의 나 (랭크·벽·순풍·구애 고정·반동). 지금 대타는 상대가 공격하면 깨진다고 봄
    const mvAfter: View = tickPerish(
      endOfTurn(
        withSpecial(
          {
            ...mvT,
            boosts: addBoosts(mvT.boosts, fm.self, fo.target, speedBoostOf(c, 'mine', mi)),
            screens: newScreens('mine', fm, env),
            ...newTailwind('mine', fm),
            ...(myChoice ? { locked: move } : {}),
            ...(RAMPAGE_MOVES.has(move) && !failsAll ? { locked: move, rampage: true } : {}),
            ...(fm.recharge ? { skip: [{ turns: 1, p: 1 }] } : {}),
            ...(mvT.absorb && om && !isStatus(om) ? { absorb: 0 } : {}),
          },
          failsAll ? { ...sm, self: {}, selfPatch: {} } : sm,
          reset,
        ),
      ),
    )
    const ovAfter: View = tickPerish(
      withSpecial(
        oppIn
          ? { ...ovT, boosts: addBoosts(ovT.boosts, fm.target) }
          : {
              ...oppAfter(env, ovT),
              boosts: addBoosts(ovT.boosts, fo.self, fm.target, speedBoostOf(c, 'opp', ovIdx)),
              ...(ovT.absorb && !isStatus(move) && !fails ? { absorb: 0 } : {}),
            },
        oppIn || so.fails ? { ...so, self: {}, selfPatch: {} } : so,
        reset,
      ),
    )
    // 이번 턴 한 번의 공격
    //   잠꼬대: 잠든 동안 다른 기술 중 하나 (고르는 확률 같음, 행동 확률 = 이번 턴에 안 깰 확률)
    const talkHit = (list: string[], hitFn: (m: string) => Hit | null) =>
      mixHits(list.filter((m) => !NO_SLEEPTALK.has(m)).map((m) => ({ w: 1, h: hitFn(m) })))
    // 흑안개를 먼저 쓰면 이번 턴 상대 공격도 랭크 없이
    const myAtkView = !mineFirst && so.resetBoosts ? { ...mvT, boosts: zeroBoosts() } : mvT
    const oppAtkView = mineFirst && sm.resetBoosts ? { ...c.ov, boosts: zeroBoosts() } : c.ov
    let myHitNow: Hit | null = failsAll
      ? null
      : sm.dealt
        ? { min: sm.dealt, max: sm.dealt, acc: 1, ko: 0 }
        : move === 'sleeptalk'
          ? talkHit(movesOf('mine', mi), (m) => mineHit(m, myAtkView, ovT, envIn, dh(tHp)))
          : mineHit(move, myAtkView, ovT, envIn, dh(tHp))
    let oppHitNow: Hit | null = so.dealt
      ? { min: so.dealt, max: so.dealt, acc: 1, ko: 0 }
      : om === 'sleeptalk'
        ? c.ov.status === 'slp'
          ? talkHit(oppMoves(oi).moves, (m) => oppHit(m, oppAtkView, mvT, envIn, dh(myHp)))
          : null
        : om
          ? oppHit(om, oppAtkView, mvT, envIn, dh(myHp))
          : null
    // 약점보험: 먼저 맞고 살아남으면 나중에 움직이는 이번 턴 공격도 공격·특공 +2
    const boosted = (v: View): View => ({ ...v, boosts: addBoosts(v.boosts, { atk: 2, spa: 2 }) })
    if (mineFirst && om && !oppIn) {
      const q = policyChance(move, myAtk, defT, ovT, myHitNow)
      if (q > 0)
        oppHitNow = mixHits([
          { w: 1 - q, h: oppHitNow },
          { w: q, h: oppHit(om, boosted(oppAtkView), mvT, envIn, dh(myHp)) },
        ])
    } else if (!mineFirst && om && !failsAll && !sm.dealt) {
      const q = policyChance(om, oppAtk, myDef, mvT, oppHitNow)
      if (q > 0)
        myHitNow = mixHits([
          { w: 1 - q, h: myHitNow },
          { w: q, h: mineHit(move, boosted(myAtkView), ovT, envIn, dh(tHp)) },
        ])
    }
    // 맞는 쪽 효과: 앙코르는 맞을 때 마지막 기술 (먼저 움직이면 지난 턴 기술, 나중이면 이번 턴 기술)
    const onOpp: Effect[] = failsAll
      ? []
      : [
          sm.target ??
            effectOn(
              move,
              myAtk,
              defT,
              'opp',
              ovT,
              mineFirst,
              oppIn ? '' : mineFirst ? c.oppLast : om,
            ),
          ...hitFx(move, myAtk, defT, ovT, myHitNow),
        ]
    let onMine: Effect[] = om
      ? [
          so.target ??
            effectOn(om, oppAtk, myDef, 'mine', mvT, !mineFirst, mineFirst ? move : c.myLast),
          ...hitFx(om, oppAtk, myDef, mvT, oppHitNow),
        ]
      : []
    // 대타를 먼저 깔면 상대 변화기는 막힘
    if (sub) onMine = onMine.map((e) => ({ ...e, p: e.p * (1 - pFirst) }))
    // 대타: 먼저 깔았으면 이번 턴 공격을 막고(맞대결에서는 깨진 것으로), 나중에 깔았으면 맞대결에서 한 번 막아 줌
    const cases = sub
      ? [
          ...casesOf(mvAfter, ovAfter, onOpp, onMine).map((a) => ({ ...a, p: a.p * pFirst })),
          ...casesOf({ ...mvAfter, absorb: 1 }, ovAfter, onOpp, onMine).map((a) => ({
            ...a,
            p: a.p * (1 - pFirst),
          })),
        ].filter((a) => a.p > 1e-9)
      : casesOf(mvAfter, ovAfter, onOpp, onMine)
    // 강제 교체 (울부짖기·드래곤테일): 맞는 쪽이 대기 포켓몬으로
    const phazed = phazeCases(
      c,
      phazeCases(c, cases, 'opp', ovIdx, failsAll ? 0 : sm.phaze),
      'mine',
      mi,
      oppIn ? 0 : so.phaze,
    )
    const ex: Exchange = {
      ...oppCommon,
      pFirst,
      myHp,
      mine: myHitNow,
      opp: oppHitNow,
      // 잠꼬대: 잠든 채로 행동 (이번 턴에 깨면 실패)
      myActs: move === 'sleeptalk' ? Math.max(0, 1 - c.myActs) : c.myActs,
      ...(om === 'sleeptalk' && c.ov.status === 'slp'
        ? { oppActs: Math.max(0, 1 - c.oppActs) }
        : {}),
      myBerry: berryOf('mine', mvT, myHp),
      myRegen: opt.pivotTo != null ? regenOf(c, 'mine', mi) : undefined,
      mineStops: fails ? 0 : stopsOf(move, myAtk, defT, 'opp', ovT),
      oppStops: om ? stopsOf(om, oppAtk, myDef, 'mine', mvT) : 0,
      myProtect: PROTECT_MOVES.has(move) && !PROTECT_MOVES.has(c.myLast),
      myShieldFirst: sub,
      myDestinyBond: sm.destinyBond,
      oppDestinyBond: so.destinyBond,
      myHeal: failsAll || mvT.healBlock ? 0 : fm.heal + sm.heal,
      myRevive: !failsAll && sm.revive != null ? 0.5 : 0,
      oppRevive: !so.fails && so.revive != null ? 0.5 : 0,
      oppHeal: c.ov.healBlock ? 0 : so.fails ? fo.heal : fo.heal + so.heal,
      mySelf: sub
        ? { perDealt: 0, onHit: 0.25 }
        : failsAll
          ? undefined
          : blockDrain(
              costed(selfOf(move, myAtk, maxHp('mine', mi), maxHp('opp', ovIdx), defT), sm.cost),
              mvT,
            ),
      oppSelf: blockDrain(
        costed(
          om ? selfOf(om, oppAtk, maxHp('opp', oi), maxHp('mine', mi), myDef) : undefined,
          so.fails ? 0 : so.cost,
        ),
        c.ov,
      ),
      myUtility: failsAll
        ? 0
        : hazardValue(c, move, 'opp', oppField) +
          sm.utility -
          debrisOf(c, move, defT, myHitNow, 'mine', myField),
      oppUtility:
        oppCommon.oppUtility + so.utility - debrisOf(c, om, myDef, oppHitNow, 'opp', oppField),
      after: afterOf(phazed, mi, expire(c, env), c),
    }
    // 멸망의노래 카운트가 이번 턴 끝에 0
    ex.myPerish = mvAfter.perish === 0
    ex.oppPerish = ovAfter.perish === 0
    // 카운터·미러코트·메탈버스트: 데미지는 이번 턴 받은 만큼으로 (evaluate 에서 경우마다)
    const myRev = failsAll ? undefined : revengeOf(move, om, 'opp', ovT, mi, ovIdx)
    if (myRev != null) Object.assign(ex, { mine: null, mineRevenge: myRev, mySelf: undefined })
    const oppRev = om ? revengeOf(om, move, 'mine', mvT, oi, mi) : undefined
    if (oppRev != null) Object.assign(ex, { opp: null, oppRevenge: oppRev, oppSelf: undefined })
    const cell: Cell2 = {
      ex,
      cases: { '00': phazed },
      next: (_, __, cs, mh, oh, ate) =>
        nextCtx(
          { mi, mv: cs.mv, ov: cs.ov, myHp: mh, oppHp: oh, env },
          move,
          false,
          opt.mega,
          cs,
          ate,
        ),
    }
    const mySide: MySide = {
      mi,
      mv: mvAfter,
      onMine,
      env,
      last: move,
      fresh: false,
      mega: opt.mega,
    }
    let myPivotSide: MySide | null = null
    // 교체기: 행동한 뒤 들어오는 포켓몬 (메가진화는 진영당 한 번이라 이번 턴 메가진화했으면 못 함). 등장 특성 반영
    if (opt.pivotTo != null) {
      const j = opt.pivotTo
      const jAb = abilityOf('mine', j)
      // 배턴터치: 랭크·대타·씨뿌리기·저주를 넘김 (맞는 시점의 랭크로 맞음)
      const pass = move === 'batonpass'
      const vj: View = pass
        ? { ...viewOf('mine', j, false, false), ...passedOf(mvT) }
        : viewOf('mine', j, false, false)
      const vjNext: View = {
        ...vj,
        ...(pass ? passedOf(mvAfter) : {}),
        mega: !opt.mega && canMega(c, 'mine', j),
        boosts: pass ? mvAfter.boosts : addBoosts(vj.boosts, fo.target),
        ...newTailwind('mine', fm),
      }
      const ovPivot =
        jAb === 'intimidate'
          ? {
              ...ovAfter,
              boosts: addBoosts(ovAfter.boosts, intimidateDelta(oppIn ? oppInAb : oppAbility)),
            }
          : ovAfter
      const envJ = envWith(env, jAb)
      // 넘긴 대타가 있으면 이번 턴 상대 공격은 대타가 받음
      const pivotHit = om && !vj.absorb ? oppHit(om, c.ov, vj, envIn, dh(hpIn(c, 'mine', j))) : null
      const defJ = mineC(vj, false)
      const onVj = om
        ? [
            effectOn(om, oppAtk, defJ, 'mine', vj, false, ''),
            ...hitFx(om, oppAtk, defJ, vj, pivotHit),
          ]
        : NO_EFFECT
      const casesPivot = casesOf(vjNext, ovPivot, onOpp, onVj)
      ex.pivot = {
        myHp: hpIn(c, 'mine', j),
        entryChip: hazardChip('mine', j, hzChip.mine),
        // 상대 기술이 먼저 나갔으면 상대가 깔거나 치운 설치기를 밟음
        lateChip: hazardChip('mine', j, hazardsAfter(hzChip, om, 'opp').mine),
        opp: pivotHit,
      }
      ex.afterPivot = afterOf(casesPivot, j, expire(c, envJ), c)
      cell.cases['10'] = casesPivot
      const plain = cell.next
      cell.next = (pivoted, oppPivoted, cs, mh, oh, ate) =>
        pivoted
          ? nextCtx(
              { mi: j, mv: cs.mv, ov: cs.ov, myHp: mh, oppHp: oh, env: envJ },
              '',
              true,
              opt.mega,
              cs,
              ate,
            )
          : plain(pivoted, oppPivoted, cs, mh, oh, ate)
      myPivotSide = {
        mi: j,
        mv: vjNext,
        onMine: onVj,
        env: envJ,
        last: '',
        fresh: true,
        mega: opt.mega,
      }
    }
    // 상대가 먼저 물러났으면 내 기술은 들어온 포켓몬이 맞음 (효과도 그 포켓몬에게, 내가 나중일 때만)
    return withOppPivot(
      cell,
      mySide,
      myPivotSide,
      (vk) =>
        failsAll || sm.dealt ? null : mineHit(move, mvT, vk, envIn, dh(hpIn(c, 'opp', vk.idx))),
      (vk) => {
        if (failsAll || sm.dealt) return NO_EFFECT
        const def = oppCs(vk, false)[0]
        const h = mineHit(move, mvT, vk, envIn, dh(hpIn(c, 'opp', vk.idx)))
        return [
          effectOn(move, myAtk, def, 'opp', vk, false, ''),
          ...hitFx(move, myAtk, def, vk, h),
        ].map((e) => ({ ...e, p: e.p * (1 - pFirst) }))
      },
      failsAll ? '' : move,
      ovAfter,
    )
  }

  // 한 턴 계산: 선택지 × 상대 선택지 결과. d ≥ 2 면 둘 다 살아 있는 경우마다 다음 턴(d − 1 턴 앞까지) 최선값을
  // 맞대결 전망 대신 더한다. 승산도 같은 방식으로 다음 턴 값으로 바꿈
  interface Solved {
    options: MineOption[]
    opp: (OppOption & { weight: number })[]
    table: Outcome[][]
    next: ({ option: MineOption; mi: number } | null)[] // 선택지별 가장 흔한 경우의 다음 턴 추천
  }
  interface Value {
    value: number
    win: number
    best: MineOption | null
  }
  const valueCache = new Map<string, Value>()
  // 칸마다 다음 턴 확장. 실제 턴(root)에서는 칸 하나를 끝낼 때마다 yield (화면이 멈추지 않게 나눠 계산)
  function* solveGen(c: Ctx, w: RecWeights, d: number): Generator<void, Solved | null> {
    const oppAll = oppOptionsOf(c, w)
    const options = mineOptionsOf(c)
    if (!oppAll.length || !options.length) return null
    const cells = options.map((opt) => oppAll.map((oo) => cellOf(c, opt, oo)))
    const table = cells.map((row) => row.map((cell) => evaluate(cell.ex, w)))
    const weights = playWeights(
      oppAll.map((o) => o.prior),
      table,
      w,
    )
    const opp = oppAll.map(({ prior: _p, ...o }, j) => ({ ...o, weight: weights[j]! }))
    const next: Solved['next'] = options.map(() => null)
    if (d < 2) return { options, opp, table, next }
    // 실제 턴에서는 드문 경우까지, 그 아래 턴에서는 흔한 경우만 더 본다
    const minP = c.root ? DEPTH_MIN_P : depthMinP(d)
    const nextP = options.map(() => 0)
    // 실제 턴 아래에서는 내 선택지 중 1턴 기대값 상위 DEEP_TOP 개만 더 본다 (나머지는 1턴 값 그대로)
    const deepRows = new Set(
      c.root
        ? options.map((_, i) => i)
        : rankOutcomes(table, weights, w)
            .slice(0, DEEP_TOP)
            .map((r) => r.index),
    )
    for (let i = 0; i < table.length; i++)
      for (let j = 0; j < opp.length; j++) {
        const row = table[i]!
        const o = row[j]!
        const oo = opp[j]!
        if (oo.weight < minP || !deepRows.has(i)) continue
        const cell = cells[i]![j]!
        // 다음 턴: 둘 다 살아 있는 경우(교체기로 바뀌었는지별) × 맞는 쪽 효과 경우. 드문 경우는 턴 뒤 전망으로
        let cont = 0
        let win = o.win
        for (const e of o.ends) {
          const cs =
            cell.cases[pivotKey(e.pivoted, e.oppPivoted)] ??
            cell.cases[pivotKey(e.pivoted, false)] ??
            cell.cases['00']!
          const after = afterFor(cell.ex, e.pivoted, e.oppPivoted)
          cs.forEach((k, ci) => {
            const p = e.p * k.p
            const look = outlook(after[ci]!, e.myHp, e.oppHp, w)
            if (p < minP) {
              cont += p * w.duel * look
              return
            }
            const nc = cell.next(e.pivoted, e.oppPivoted, k, e.myHp, e.oppHp, {
              mine: e.myAte,
              opp: e.oppAte,
            })
            const v = valueOf(nc, w, d - 1)
            cont += p * v.value
            // 턴 뒤 전망으로 어림한 승산을 다음 턴 값으로 바꿈
            win += p * (v.win - winFromOutlook(look))
            if (v.best && p * oo.weight > nextP[i]!) {
              nextP[i] = p * oo.weight
              next[i] = { option: v.best, mi: nc.mi }
            }
          })
        }
        // 이후 몫 = 다음 턴 값 (맞대결 전망 대신)
        row[j] = {
          ...o,
          score: o.immediate + cont,
          parts: { ...o.parts, future: cont },
          win: Math.max(0, Math.min(1, win)),
        }
        if (c.root) yield
      }
    return { options, opp, table, next }
  }
  // 끝까지 한 번에
  const runGen = <T>(g: Generator<void, T>): T => {
    for (;;) {
      const r = g.next()
      if (r.done) return r.value
    }
  }
  const solve = (c: Ctx, w: RecWeights, d: number) => runGen(solveGen(c, w, d))
  // 그 턴의 최선 기대값 (내 최선 선택지) — HP 를 조금 묶어서 기억
  const valueOf = (c: Ctx, w: RecWeights, d: number): Value => {
    const r2 = (x: number) => Math.round(x * 50) / 50
    const key = JSON.stringify([
      d,
      c.mi,
      c.oi,
      c.mv,
      c.ov,
      c.env,
      r2(hpIn(c, 'mine', c.mi)),
      r2(hpIn(c, 'opp', c.oi)),
      c.myLast,
      c.oppLast,
      c.myFresh,
      c.oppFresh,
      c.hz,
      r2(c.myActs),
      r2(c.oppActs),
      c.megaMine,
    ])
    const hit = valueCache.get(key)
    if (hit) return hit
    const sv = solve(c, w, d)
    let out: Value = { value: 0, win: 0.5, best: null }
    if (sv) {
      const weights = sv.opp.map((o) => o.weight)
      const ranked = rankOutcomes(sv.table, weights, w)
      const top = ranked[0]
      if (top)
        out = {
          value: top.expected,
          win: top.outcomes.reduce((a, o, j) => a + (weights[j] ?? 0) * o.win, 0),
          best: sv.options[top.index]!,
        }
    }
    valueCache.set(key, out)
    return out
  }

  // 끝판: 양쪽 남은 포켓몬(상대는 공개된 + 아직 안 나온 선출 수)이 합쳐 ENDGAME_LEFT 이하
  const isEndgame = () => leftCount() <= ENDGAME_LEFT
  // 끝판에서 볼 깊이: 1:1 이면 ENDGAME_DEEP, 아니면 3
  const endgameDepth = () => (leftCount() <= ENDGAME_DEEP_LEFT ? ENDGAME_DEEP : 3)
  // 남은 포켓몬 수 (상대는 공개된 + 아직 안 나온 선출 수)
  const leftCount = () => {
    const s = S()
    const mineLeft = s.sides.mine.mons.filter((_, i) => hpFrac('mine', i) > 0).length
    const oppSeen = s.sides.opp.revealed.filter((i) => hpFrac('opp', i) > 0).length
    const unknown = Math.max(0, OPP_PICK - s.sides.opp.revealed.length)
    return mineLeft + oppSeen + unknown
  }
  // 계산할 수 있는 상태인가 (싱글, 배틀 중, 양쪽 필드에 포켓몬)
  const ready = () => {
    const s = b.state.value
    if (!s || b.N !== 1 || b.battleResult.value) return false
    const mi = s.sides.mine.active[0]
    const oi = s.sides.opp.active[0]
    return mi != null && oi != null && !b.isFainted('opp', oi)
  }

  // 쓰러진 자리에 대기 포켓몬 j 가 들어갈 때 (상대 c0.oi 는 이번에 공격하지 않음): 설치기 데미지 + 턴 뒤 전망.
  // 등장 특성(위협·날씨) 반영. 다음 턴 계산 재료(mv·ov·env·chip)도 돌려줌
  const replaceOf = (c0: Ctx, j: number, w: RecWeights) => {
    const ab = abilityOf('mine', j)
    const mv = viewOf('mine', j, canMega(c0, 'mine', j), false)
    const ov =
      ab === 'intimidate'
        ? { ...c0.ov, boosts: addBoosts(c0.ov.boosts, intimidateDelta(abilityOf('opp', c0.oi))) }
        : c0.ov
    const env = envWith(c0.env, ab)
    const chip = Math.min(hpIn(c0, 'mine', j), hazardChip('mine', j, hazardsOf(c0).mine))
    const o = evaluate(
      {
        pFirst: 1,
        myHp: hpIn(c0, 'mine', j),
        oppHp: hpIn(c0, 'opp', c0.oi),
        mine: null,
        opp: null,
        switchIn: true,
        entryChip: chip,
        oppActs: 0,
        after: afterOf([{ p: 1, mv, ov }], j, env, c0),
      },
      w,
    )
    return { o, mv, ov, env, chip }
  }

  // auto: 끝판이면 세 턴 앞까지 늘림
  // 나눠서 계산할 수 있게 generator (칸·대기 포켓몬마다 yield). compute = 한 번에
  function* computeGen(
    w: RecWeights,
    depthIn: Depth,
    auto = true,
  ): Generator<void, Recommendation | null> {
    if (!ready()) return null
    const s = S()
    const mi = s.sides.mine.active[0]!
    const oi = s.sides.opp.active[0]!
    const endgame = auto && isEndgame() && endgameDepth() > depthIn
    const d = endgame ? endgameDepth() : depthIn
    duelCache.clear()
    hitCache.clear()
    avgCache.clear()
    callCache.clear()
    valueCache.clear()
    benchCache.clear()
    const c0 = rootCtx(mi, oi)

    // 쓰러져 교체할 차례: 대기 포켓몬마다 설치기 데미지 + (1턴) 턴 뒤 전망 / (2턴 이상) 들어간 뒤 다음 턴 최선값.
    // 상대는 이번에 공격하지 않음. 등장 특성(위협·날씨) 반영
    if (b.isFainted('mine', mi)) {
      const bench = benchIn(c0, 'mine')
      if (!bench.length) return null
      const options: MineOption[] = bench.map((to) => ({ kind: 'switch', to }))
      const next: ({ option: MineOption; mi: number } | null)[] = bench.map(() => null)
      const table: Outcome[][] = []
      for (const [i, j] of bench.entries()) {
        table.push(replaceRow(j, i))
        yield
      }
      // 대기 포켓몬 j 가 들어갈 때 (i = 선택지 번호)
      function replaceRow(j: number, i: number): Outcome[] {
        const { o, mv, ov, env, chip } = replaceOf(c0, j, w)
        if (d < 2 || hpIn(c0, 'mine', j) - chip <= 0) return [o]
        const nc: Ctx = {
          ...c0,
          root: false,
          mi: j,
          mv,
          ov,
          env,
          hp: { ...c0.hp, mine: { ...c0.hp.mine, [j]: hpIn(c0, 'mine', j) - chip } },
          myLast: '',
          myFresh: true,
          myActs: 1,
        }
        const v = valueOf(nc, w, d - 1)
        next[i] = v.best ? { option: v.best, mi: j } : null
        return [
          {
            ...o,
            score: o.immediate + v.value,
            parts: { ...o.parts, future: v.value },
            win: v.win,
          },
        ]
      }
      return finish(
        'replace',
        d,
        endgame,
        oi,
        options,
        [{ kind: 'move', move: '', weight: 1 }],
        table,
        next,
        w,
      )
    }

    const sv = yield* solveGen(c0, w, d)
    if (!sv) return null
    return finish('turn', d, endgame, oi, sv.options, sv.opp, sv.table, sv.next, w)
  }
  const compute = (w: RecWeights, depthIn: Depth, auto = true) =>
    runGen(computeGen(w, depthIn, auto))

  // ── 더블 (1턴 앞 근사) ─────────────
  // 내 필드 칸마다, 상대 필드 포켓몬 하나하나와 싱글처럼 짝지어 이득표를 만들고(광역기 0.75배·교체 대상은 필드 밖만) 합친다.
  //   상대 한 대상 기술은 내 두 포켓몬 중 어느 쪽을 노리는지 나눈다: 상대에게 이득이 큰 쪽을 exp(smart × 차이)로 더 노림.
  //   노리지 않는 쪽 짝에서는 상대가 그 포켓몬에게 아무것도 안 한 결과. 상대 선택지 비중은 상대 포켓몬마다 한 번 (두 짝 합친 가치)
  //   내 한 대상 기술 → 맞히는 상대와의 점수 + 다른 상대와는 아무것도 안 한 점수 (대상마다 한 줄)
  //   광역기·방어·교체·자신에게 쓰는 기술 → 두 짝의 점수 합
  //   장(場)에 거는 변화기(설치기·날씨·트릭룸 등) → 한 짝의 점수 + 다른 상대와는 아무것도 안 한 점수 중 큰 쪽
  //   자신 외 전체 광역기(지진 등)는 아군이 맞는 기대 데미지(+쓰러질 때 ko 가중치)를 뺌 (조합에서 아군이 방어하면 돌려줌)
  //   아군에게만 쓰는 기술은 뺌. 두 칸 조합(상위 선택지끼리): 같은 상대를 같이 치면 합친 데미지로 KO 확률을 다시 (협공),
  //   같은 포켓몬으로 교체하는 조합은 뺌. 쓰러진 칸은 들어갈 포켓몬 추천
  const readyDoubles = () => {
    const s = b.state.value
    return !!s && b.N > 1 && !b.battleResult.value
  }
  const SINGLE_TARGET = new Set(['normal', 'any', 'adjacentFoe'])
  const FIELD_TARGET = new Set(['foeSide', 'allySide', 'all', 'allyTeam'])
  const ALLY_TARGET = new Set(['adjacentAlly', 'allies'])
  const NOOP: MineOption = { kind: 'move', move: '', mega: false }
  const OPP_NOOP: OppOption = { kind: 'move', move: '' }
  // 조합을 만들 때 칸마다 볼 상위 선택지 수, 보여 줄 조합 수
  const COMBO_TOP = 8
  const COMBO_SHOWN = 3
  const optKey = (o: MineOption) =>
    o.kind === 'switch' ? `s${o.to}` : `m${o.move}|${o.mega ? 1 : 0}|${o.pivotTo ?? ''}`
  // 한 대상 기술 (광역기 아님)
  const singleTarget = (moveId: string) => {
    const m = gd.move(moveId)
    return !!m && SINGLE_TARGET.has(m.target ?? '') && !isSpreadMove(m)
  }

  // 내 mi(칸 ms) × 상대 oi(칸 os) 한 짝의 1턴 결과표 (상대 비중은 나중에 두 짝을 합쳐 정함)
  interface Pair {
    me: { i: number; slot: number }
    foe: { i: number; slot: number }
    c: Ctx
    options: MineOption[]
    oppAll: (OppOption & { prior: number })[]
    table: Outcome[][] // 내 선택지 × 상대 선택지
    idle: Outcome[] // 내 선택지 × 상대가 나에게 아무것도 안 함
    noop: Outcome[] // 내가 아무것도 안 함 × 상대 선택지
    noopIdle: Outcome
  }
  function pairOf(
    me: { i: number; slot: number },
    foe: { i: number; slot: number },
    w: RecWeights,
  ): Pair | null {
    const c = rootCtx(me.i, foe.i, me.slot, foe.slot)
    const oppAll = oppOptionsOf(c, w)
    const options = mineOptionsOf(c)
    if (!oppAll.length || !options.length) return null
    const ev = (opt: MineOption, oo: OppOption) => evaluate(cellOf(c, opt, oo).ex, w)
    return {
      me,
      foe,
      c,
      options,
      oppAll,
      table: options.map((opt) => oppAll.map((oo) => ev(opt, oo))),
      idle: options.map((opt) => ev(opt, OPP_NOOP)),
      noop: oppAll.map((oo) => ev(NOOP, oo)),
      noopIdle: ev(NOOP, OPP_NOOP),
    }
  }

  // 상대 포켓몬 하나의 선택지 비중과, 짝마다 그 선택지가 나를 노리는 몫
  //   한 대상 기술: 짝 m 을 노릴 때 상대 가치 = 그 짝에서 내 평균 점수의 반대 + 다른 짝은 아무것도 안 할 때의 반대
  //   그 밖(광역기·자신·장·교체): 모든 짝에 그대로
  function foeModel(ps: Pair[], w: RecWeights) {
    const canon = ps[0]!.oppAll
    const index = ps.map((p) => new Map(p.oppAll.map((o, j) => [oppOptionKey(o), j])))
    const mean = (xs: Outcome[]) => xs.reduce((a, o) => a + o.score, 0) / Math.max(1, xs.length)
    const harm = (p: Pair, j: number) => -mean(p.table.map((row) => row[j]!))
    const idleHarm = ps.map((p) => -mean(p.idle))
    const idleAll = idleHarm.reduce((a, v) => a + v, 0)
    // share[k][m] = 상대 선택지 k(canon 번호)가 짝 m 을 노리는 몫
    const share: number[][] = []
    const value = canon.map((o) => {
      const key = oppOptionKey(o)
      const js = index.map((m) => m.get(key))
      if (o.kind === 'move' && o.move && singleTarget(o.move) && ps.length > 1) {
        const a = ps.map((p, m) =>
          js[m] == null ? -Infinity : harm(p, js[m]!) + idleAll - idleHarm[m]!,
        )
        const sh = softPick(
          a.map((v) => (v === -Infinity ? 0 : 1)),
          a.map((v) => (v === -Infinity ? 0 : v)),
          w.smart,
        )
        share.push(sh)
        return sh.reduce((s, x, m) => s + (x > 0 ? x * a[m]! : 0), 0)
      }
      share.push(ps.map((_, m) => (js[m] == null ? 0 : 1)))
      return ps.reduce((s, p, m) => s + (js[m] == null ? idleHarm[m]! : harm(p, js[m]!)), 0)
    })
    const weights = softPick(
      canon.map((o) => o.prior),
      value,
      w.smart,
    )
    return { canon, index, share, weights }
  }

  // 선택지별 요약 (상대 비중으로 평균)
  const summaryOf = (outcomes: Outcome[], weights: number[]): DoublesSummary => {
    const avg = (f: (o: Outcome) => number) =>
      outcomes.reduce((s, o, j) => s + (weights[j] ?? 0) * f(o), 0)
    return {
      oppLoss: avg((o) => o.oppLoss),
      myLoss: avg((o) => o.myLoss),
      oppKo: avg((o) => o.oppKo),
      myKo: avg((o) => o.myKo),
      pFirst: avg((o) => o.pFirst),
      parts: {
        damage: avg((o) => o.parts.damage),
        ko: avg((o) => o.parts.ko),
        hazard: avg((o) => o.parts.hazard),
        future: avg((o) => o.parts.future),
      },
    }
  }
  const addSummary = (a: DoublesSummary, b: DoublesSummary): DoublesSummary => ({
    oppLoss: a.oppLoss + b.oppLoss,
    myLoss: a.myLoss + b.myLoss,
    oppKo: a.oppKo + b.oppKo,
    myKo: Math.min(1, a.myKo + b.myKo),
    pFirst: a.pFirst,
    parts: {
      damage: a.parts.damage + b.parts.damage,
      ko: a.parts.ko + b.parts.ko,
      hazard: a.parts.hazard + b.parts.hazard,
      future: a.parts.future + b.parts.future,
    },
  })

  function* doublesGen(w: RecWeights): Generator<void, DoublesRecommendation | null> {
    if (!readyDoubles()) return null
    const s = S()
    duelCache.clear()
    hitCache.clear()
    avgCache.clear()
    callCache.clear()
    valueCache.clear()
    benchCache.clear()
    const onField = (side: BattleSide) =>
      s.sides[side].active
        .map((i, slot) => ({ i, slot }))
        .filter((x): x is { i: number; slot: number } => x.i != null)
    const foesAll = onField('opp').filter((x) => !b.isFainted('opp', x.i))
    const mineSlots = onField('mine')
    const mineAll = mineSlots.filter((x) => !b.isFainted('mine', x.i))
    if (!foesAll.length) return null

    // ── 짝마다 결과표 ──
    const pairs: Pair[] = []
    for (const me of mineAll)
      for (const foe of foesAll) {
        const pr = pairOf(me, foe, w)
        if (pr) pairs.push(pr)
        yield
      }

    // ── 상대 포켓몬마다 비중 · 노리는 몫 ──
    const foes: DoublesFoe[] = []
    const models = new Map<number, ReturnType<typeof foeModel> & { ps: Pair[] }>()
    for (const foe of foesAll) {
      const ps = pairs.filter((p) => p.foe.i === foe.i)
      if (!ps.length) continue
      const m = foeModel(ps, w)
      models.set(foe.i, { ...m, ps })
      foes.push({
        slot: foe.slot,
        oi: foe.i,
        opp: m.canon.map(({ prior: _p, ...o }, k) => ({ ...o, weight: m.weights[k]! })),
      })
    }
    // 짝의 결과를 상대 비중 순서(canon)로: 나를 노리는 몫만큼 그 칸, 나머지는 아무것도 안 함
    const rowsOf = (p: Pair) => {
      const md = models.get(p.foe.i)!
      const m = md.ps.indexOf(p)
      const at = (row: Outcome[], idle: Outcome) =>
        md.canon.map((o, k) => {
          const j = md.index[m]!.get(oppOptionKey(o))
          return j == null ? idle : blendOutcome(row[j]!, idle, md.share[k]![m]!)
        })
      return {
        weights: md.weights,
        table: p.table.map((row, i) => at(row, p.idle[i]!)),
        noop: at(p.noop, p.noopIdle),
      }
    }

    // 자신 외 전체 광역기가 아군에게 주는 손해
    const allyLoss = (mi: number, ally: number | undefined, moveId: string) => {
      if (ally == null) return 0
      const atk = mineC(viewOf('mine', mi, false, true), true)
      const def = mineC(viewOf('mine', ally, false, true), false)
      if (!atk || !def) return 0
      const dmg = avgDamage(
        moveId,
        [atk],
        [def],
        fieldWith(fieldFor('mine', ally), envNow(), undefined, 'mine'),
        optsFor('mine', mi, moveId),
      )
      const hp = hpFrac('mine', ally)
      return Math.min(hp, dmg) + (dmg >= hp ? w.ko : 0)
    }

    const slots: DoublesSlot[] = []
    // ── 쓰러진 칸: 들어갈 포켓몬 (설치기 데미지는 한 번, 턴 뒤 전망은 상대 필드 포켓몬마다 더함) ──
    for (const me of mineSlots) {
      if (!b.isFainted('mine', me.i)) continue
      const cs = foesAll.map((f) => rootCtx(me.i, f.i, me.slot, f.slot))
      const plans: DoublesPlan[] = benchIn(cs[0]!, 'mine').map((j) => {
        const os = cs.map((c) => replaceOf(c, j, w).o)
        const first = os[0]!
        const future = os.reduce((a, o) => a + o.parts.future, 0)
        const expected = first.immediate + future
        return {
          option: { kind: 'switch', to: j },
          target: null,
          expected,
          worst: expected,
          allyLoss: 0,
          summary: { ...summaryOf([first], [1]), parts: { ...first.parts, future } },
        }
      })
      yield
      if (!plans.length) continue
      plans.sort((a, b) => b.expected - a.expected)
      slots.push({ slot: me.slot, mi: me.i, mode: 'replace', plans, safe: 0 })
    }

    // ── 살아 있는 칸: 선택지 ──
    for (const me of mineAll) {
      const ally = mineAll.find((x) => x.i !== me.i)?.i
      const mine = pairs.filter((p) => p.me.i === me.i)
      if (!mine.length) continue
      // 짝마다 선택지별 기대값·최악·요약 (+ 아무것도 안 할 때)
      const per = mine.map((p) => {
        const r = rowsOf(p)
        const ranked = rankOutcomes([...r.table, r.noop], r.weights, w)
        const at = (i: number) => {
          const x = ranked.find((y) => y.index === i)!
          return {
            expected: x.expected,
            worst: x.worst,
            summary: summaryOf(i < r.table.length ? r.table[i]! : r.noop, r.weights),
          }
        }
        const rows = new Map(p.options.map((o, i) => [optKey(o), at(i)]))
        return { p, rows, idle: at(r.table.length) }
      })
      const plans: DoublesPlan[] = []
      for (const option of mine[0]!.options) {
        const key = optKey(option)
        const got = per.map((x) => x.rows.get(key))
        if (got.some((g) => !g)) continue
        const move = option.kind === 'move' ? gd.move(option.move) : null
        const tgt = move?.target ?? ''
        if (ALLY_TARGET.has(tgt)) continue
        const pFirst = option.kind === 'switch' ? null : got[0]!.summary.pFirst
        // k 번째 상대에게 쓰고 나머지와는 아무것도 안 함
        const onOne = (k: number) => {
          const xs = per.map((x, j) => (j === k ? got[j]! : x.idle))
          return {
            expected: xs.reduce((a, g) => a + g.expected, 0),
            worst: xs.reduce((a, g) => a + g.worst, 0),
            summary: { ...xs.map((g) => g.summary).reduce(addSummary), pFirst },
          }
        }
        const plan = (target: number | null, x: ReturnType<typeof onOne>, loss = 0) =>
          plans.push({
            option,
            target,
            expected: x.expected - loss,
            worst: x.worst - loss,
            allyLoss: loss,
            summary: x.summary,
          })
        if (move && SINGLE_TARGET.has(tgt) && !isSpreadMove(move) && per.length > 1)
          // 한 대상 기술 (공격기·도발·전기자석파 등): 대상마다
          per.forEach((x, k) => plan(x.p.foe.slot, onOne(k)))
        else if (move && FIELD_TARGET.has(tgt))
          plan(null, per.map((_, k) => onOne(k)).sort((a, b) => b.expected - a.expected)[0]!)
        else {
          const loss = tgt === 'allAdjacent' && move ? allyLoss(me.i, ally, move.id) : 0
          plan(
            SINGLE_TARGET.has(tgt) ? per[0]!.p.foe.slot : null,
            {
              expected: got.reduce((a, g) => a + g!.expected, 0),
              worst: got.reduce((a, g) => a + g!.worst, 0),
              summary: { ...got.map((g) => g!.summary).reduce(addSummary), pFirst },
            },
            loss,
          )
        }
      }
      plans.sort((a, b) => b.expected - a.expected)
      let safe = -1
      plans.forEach((p, k) => {
        if (safe < 0 || p.worst > plans[safe]!.worst + 1e-9) safe = k
      })
      slots.push({ slot: me.slot, mi: me.i, mode: 'turn', plans, safe })
      yield
    }
    slots.sort((a, b) => a.slot - b.slot)
    if (!slots.length) return null

    // ── 두 칸 조합 ──
    const combos: DoublesCombo[] = []
    if (slots.length === 2) {
      const [A, B] = slots as [DoublesSlot, DoublesSlot]
      const into = (o: MineOption) => (o.kind === 'switch' ? o.to : (o.pivotTo ?? null))
      const protects = (o: MineOption) => o.kind === 'move' && PROTECT_MOVES.has(o.move)
      // 이 선택지가 맞히는 상대 칸 (한 대상 공격기 → 그 칸, 광역 공격기 → 상대 필드 전부)
      const hitsOn = (sl: DoublesSlot, p: DoublesPlan) => {
        if (sl.mode !== 'turn' || p.option.kind !== 'move') return []
        const m = gd.move(p.option.move)
        if (!m || m.category === 'status') return []
        if (isSpreadMove(m)) return foesAll.map((f) => f.slot)
        return p.target != null ? [p.target] : []
      }
      // 짝 맥락에서 이 공격 한 번 (메가 안 함이면 메가 전 폼)
      const hitFor = (sl: DoublesSlot, p: DoublesPlan, foeSlot: number) => {
        const pr = pairs.find((x) => x.me.i === sl.mi && x.foe.slot === foeSlot)
        if (!pr || p.option.kind !== 'move') return null
        const c = pr.c
        const mv = !p.option.mega && c.mv.mega && c.megaMine ? { ...c.mv, mega: false } : c.mv
        return mineHit(p.option.move, mv, c.ov, c.env)
      }
      // 상대가 그 자리에서 맞는 몫 (교체·교체기·방어가 아닐 때)
      const stays = (oi: number) => {
        const md = models.get(oi)
        if (!md) return 0
        return md.canon.reduce(
          (a, o, k) =>
            a +
            (o.kind === 'move' && o.pivotTo == null && !PROTECT_MOVES.has(o.move)
              ? md.weights[k]!
              : 0),
          0,
        )
      }
      const topA = A.plans.slice(0, COMBO_TOP)
      const topB = B.plans.slice(0, COMBO_TOP)
      topA.forEach((pa, ia) =>
        topB.forEach((pb, ib) => {
          const ta = into(pa.option)
          if (ta != null && ta === into(pb.option)) return
          let focus = 0
          for (const fs of hitsOn(A, pa)) {
            if (!hitsOn(B, pb).includes(fs)) continue
            const ha = hitFor(A, pa, fs)
            const hb = hitFor(B, pb, fs)
            const f = foesAll.find((x) => x.slot === fs)
            if (!ha || !hb || !f) continue
            const hp = hpFrac('opp', f.i)
            const both = comboHit(ha, hb, hp)
            focus +=
              stays(f.i) *
              (both.dealt -
                cappedDamage(ha, hp) -
                cappedDamage(hb, hp) +
                w.ko * (both.ko - ha.ko - hb.ko))
          }
          // 아군이 방어하면 광역기가 아군에게 주는 손해는 없음
          const guard =
            (protects(pa.option) ? pb.allyLoss : 0) + (protects(pb.option) ? pa.allyLoss : 0)
          combos.push({
            picks: [
              { slot: A.slot, plan: ia },
              { slot: B.slot, plan: ib },
            ],
            expected: pa.expected + pb.expected + focus + guard,
            focus,
          })
        }),
      )
      combos.sort((a, b) => b.expected - a.expected)
      combos.splice(COMBO_SHOWN)
    }
    return { slots, foes, combos }
  }

  function finish(
    mode: Recommendation['mode'],
    d: number,
    endgame: boolean,
    oi: number,
    options: MineOption[],
    opp: Recommendation['opp'],
    table: Outcome[][],
    next: ({ option: MineOption; mi: number } | null)[],
    w: RecWeights,
  ): Recommendation {
    const weights = opp.map((o) => o.weight)
    const ranked = rankOutcomes(table, weights, w).map((r) => {
      const avg = (f: (o: Outcome) => number) =>
        r.outcomes.reduce((s, o, j) => s + (weights[j] ?? 0) * f(o), 0)
      const opt = options[r.index]!
      return {
        ...r,
        summary: {
          oppLoss: avg((o) => o.oppLoss),
          myLoss: avg((o) => o.myLoss),
          oppKo: avg((o) => o.oppKo),
          myKo: avg((o) => o.myKo),
          duel: avg((o) => o.duel),
          utility: avg((o) => o.utility),
          pFirst: opt.kind === 'switch' ? null : avg((o) => o.pFirst),
          parts: {
            damage: avg((o) => o.parts.damage),
            ko: avg((o) => o.parts.ko),
            hazard: avg((o) => o.parts.hazard),
            future: avg((o) => o.parts.future),
          },
          win: avg((o) => o.win),
          next: d >= 2 ? next[r.index] : undefined,
        },
      }
    })
    return {
      mode,
      depth: d,
      endgame,
      oi,
      options,
      opp,
      ranked,
      best: ranked[0]?.index ?? -1,
      safe: safest(ranked)?.index ?? -1,
    }
  }

  // ── 화면 ─────────────
  // 화면에서 열었을 때만 계산. 1턴 앞은 바로(가벼움), 더 깊은 계산(2·3턴, 끝판)은 화면이 먼저 그려진 뒤 이어서 —
  // 그동안은 1턴 결과를 보여 주고 pending 표시. 배틀 상태·가중치가 바뀌면 다시
  const enabled = ref(false)
  // 배틀 상태를 깊게 한 번 읽어 바뀜을 감지 (되돌리기 기록은 빼고)
  const trackState = () => {
    const s = b.state.value
    if (s)
      for (const k of Object.keys(s))
        if (k !== 'history' && k !== 'recNote') JSON.stringify(s[k as keyof typeof s])
  }
  const quick = computed(() => {
    if (!enabled.value || b.N > 1) return null
    trackState()
    return compute(weights.value, 1, false)
  })
  const deep = shallowRef<Recommendation | null>(null)
  const pending = ref(false)
  let token = 0
  watch(
    [quick, depth],
    () => {
      deep.value = null
      if (b.N > 1) return
      const my = ++token
      if (!quick.value || (depth.value === 1 && !isEndgame())) {
        pending.value = false
        return
      }
      pending.value = true
      // 한 번에 SLICE_MS 정도씩 계산하고 화면에 양보
      const g = computeGen(weights.value, depth.value)
      const step = () => {
        if (my !== token) return
        const t0 = performance.now()
        for (;;) {
          const r = g.next()
          if (r.done) {
            deep.value = r.value
            pending.value = false
            return
          }
          if (performance.now() - t0 > SLICE_MS) break
        }
        setTimeout(step, 0)
      }
      setTimeout(step, 20)
    },
    { immediate: true },
  )
  const result = computed(() => deep.value ?? quick.value)

  // 더블: 짝마다 1턴 이득표라 무거운 편 → 처음부터 나눠서 계산
  const doubles = shallowRef<DoublesRecommendation | null>(null)
  const doublesStamp = computed(() => {
    if (!enabled.value || b.N === 1) return null
    trackState()
    return { w: weights.value }
  })
  let dToken = 0
  watch(
    doublesStamp,
    (st) => {
      const my = ++dToken
      if (!st) {
        doubles.value = null
        pending.value = false
        return
      }
      pending.value = true
      const g = doublesGen(st.w)
      const step = () => {
        if (my !== dToken) return
        const t0 = performance.now()
        for (;;) {
          const r = g.next()
          if (r.done) {
            doubles.value = r.value
            pending.value = false
            return
          }
          if (performance.now() - t0 > SLICE_MS) break
        }
        setTimeout(step, 0)
      }
      setTimeout(step, 0)
    },
    { immediate: true },
  )

  // 바로 계산 (테스트 · 기다리지 않고 필요할 때)
  const run = () => compute(weights.value, depth.value)
  const runDoubles = () => runGen(doublesGen(weights.value))
  return { enabled, result, doubles, pending, run, runDoubles }
}
