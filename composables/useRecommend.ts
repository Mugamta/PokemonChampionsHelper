// composables/useRecommend.ts
// 추천 플레이 (싱글): 지금 배틀 상태로 내 선택지(기술·교체기 × 들어갈 포켓몬·교체) × 상대 선택지(기술·교체) 이득표를 만들어
// utils/recommend.ts 로 순위를 매긴다.
//   - 상대 기술 후보: 쓴 기술(확정) + 선출 화면 기술. 사전 비중 = 확정 1 / 사용률 통계의 채용률 (없으면 0.5)
//   - 상대 교체 후보: 공개된 대기 포켓몬 (사전 비중 oppSwitch) + 선출 수가 다 공개되지 않았으면 아직 안 나온 파티 (남은 선출 수로 나눠서)
//   - 상대 교체기(유턴 등)는 들어올 포켓몬마다 따로 (기술의 사전 비중을 교체 후보 비중대로 나눔)
//   - 상대 선택지 비중 = 사전 비중 × exp(smart × 상대에게 유리한 정도) (responseWeights, 1턴 결과표 기준)
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

import type { useBattle } from '~/composables/useBattle'
import { useTeamCalc, type Cell } from '~/composables/useTeamCalc'
import { useRegulation } from '~/composables/useRegulation'
import {
  calcDamage,
  hasSecondary,
  hitInfo,
  isGrounded,
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
  duelValue,
  evaluate,
  firstChance,
  normalizeWeights,
  rankOutcomes,
  responseWeights,
  safest,
  skipDist,
  type AfterCases,
  type Duel,
  type Exchange,
  type Hit,
  type Outcome,
  type Ranked,
  type RecWeights,
  type SelfEffect,
  type Skip,
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
  // 몇 턴 앞까지 (1 / 2)
  const depth = useState<1 | 2>('rec-depth', () => {
    try {
      return localStorage.getItem(DEPTH_KEY) === '2' ? 2 : 1
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
  const reset = () => {
    weights.value = { ...DEFAULT_WEIGHTS }
    store(WEIGHTS_KEY, JSON.stringify(weights.value))
  }
  const setDepth = (d: 1 | 2) => {
    depth.value = d
    store(DEPTH_KEY, String(d))
  }
  return { weights, set, reset, depth, setDepth }
}

export type MineOption =
  | { kind: 'move'; move: string; mega: boolean; pivotTo?: number }
  | { kind: 'switch'; to: number }
export type OppOption =
  | { kind: 'move'; move: string; pivotTo?: number }
  | { kind: 'switch'; to: number }

export interface OptionSummary {
  oppLoss: number
  myLoss: number
  oppKo: number
  myKo: number
  duel: number
  utility: number
  pFirst: number | null // 교체면 null
  // 두 턴 앞: 가장 흔한 경우의 다음 턴 추천 (그때 필드에 있는 내 포켓몬)
  next?: { option: MineOption; mi: number } | null
}

export interface Recommendation {
  mode: 'turn' | 'replace'
  depth: 1 | 2
  options: MineOption[]
  opp: (OppOption & { weight: number })[]
  ranked: (Ranked & { summary: OptionSummary })[]
  best: number // 기대값 추천 (options 번호)
  safe: number // 안전 추천
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
  duel?: boolean // 맞대결 계산용: 지금 깔린 대타는 absorb 로 따로 셈
}
// 날씨·필드·트릭룸
interface Env {
  weather: Weather
  terrain: Terrain
  trickRoom: boolean
  gone?: string[] // 턴이 끝나 사라진 진영 효과 ('mine:reflect', 'opp:tailwind' 등)
}
// 한 턴을 계산하는 시점의 상태. root = 실제 배틀 상태 (PP·앙코르·특수 상태 등은 배틀 상태에서 직접 본다)
interface Ctx {
  root: boolean
  age: number // 실제 배틀 상태로부터 몇 턴 뒤인가 (남은 턴 수 계산용)
  mi: number
  oi: number
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
  next: (pivoted: boolean, oppPivoted: boolean, c: NextCase, myHp: number, oppHp: number) => Ctx
}
type PivotKey = '00' | '10' | '01' | '11'
const pivotKey = (pivoted: boolean, oppPivoted: boolean): PivotKey =>
  `${pivoted ? 1 : 0}${oppPivoted ? 1 : 0}` as PivotKey

export function useRecommend(b: Battle) {
  const gd = useGameData()
  const calc = useTeamCalc()
  const reg = useRegulation()
  const { weights, depth } = useRecWeights()
  const S = () => b.state.value!
  const mon = (side: BattleSide, idx: number) => S().sides[side].mons[idx]!
  const abilityOf = (side: BattleSide, idx: number) => resolveAt(side, idx)?.ability || ''
  // 배틀 상태 조회는 한 번 계산하는 동안 바뀌지 않아서 기억해 둔다 (같은 인자로 수백 번 불림)
  const callCache = new Map<string, unknown>()
  const cached =
    <A extends unknown[], R>(name: string, fn: (...a: A) => R) =>
    (...a: A): R => {
      const key = name + JSON.stringify(a)
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
  const guessedItem = cached('guessedItem', b.guessedItem)
  const oppItemOf = cached('oppItemOf', b.oppItemOf)

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
  const envNow = (): Env => ({
    weather: S().weather.key,
    terrain: S().terrain.key,
    trickRoom: !!S().rooms.trickroom,
  })
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
    }
    return out
  }

  // ── 전투 정보 ─────────────
  const withView = (c: Combatant, v: View): Combatant => ({
    ...c,
    boosts: v.boosts,
    status: v.status,
    ...(v.itemGone ? { item: '' } : {}),
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
    const out: FieldState = { ...f, weather: env.weather, terrain: env.terrain }
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
        attackOpts('mine', mv.idx, moveId),
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
        attackOpts('opp', ov.idx, moveId),
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
  const mineAvg = (moveId: string, mv: View, ov: View, env: Env) =>
    avgMemo(JSON.stringify(['m', moveId, mv, ov, env]), () => {
      const move = gd.move(moveId)
      const atk = mineC(mv, true)
      if (!move || !atk) return 0
      const field = fieldWith(fieldFor('opp', ov.idx), env, ov.screens, 'opp')
      return avgDamage(
        moveId,
        [atk],
        oppCs(ov, false, defStatOf(move, field)),
        field,
        attackOpts('mine', mv.idx, moveId),
      )
    })
  const oppAvg = (moveId: string, ov: View, mv: View, env: Env) =>
    avgMemo(JSON.stringify(['o', moveId, ov, mv, env]), () => {
      const def = mineC(mv, false)
      if (!def) return 0
      return avgDamage(
        moveId,
        oppCs(ov, true),
        [def],
        fieldWith(fieldFor('mine', mv.idx), env, mv.screens, 'mine'),
        attackOpts('opp', ov.idx, moveId),
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
        !(c.mv.taunted && isStatus(m)),
    )
  }
  // 상대 기술 후보 (확정 + 선출 화면). c 가 없으면 맞대결용 (고정·첫 턴·도발 판정 없이)
  const oppMoves = (oi: number, c?: Ctx) => {
    if (c?.ov.locked) return { moves: [c.ov.locked], known: new Set([c.ov.locked]) }
    const m = mon('opp', oi)
    const known = new Set([...Object.keys(b.ppUsedOf('opp', oi)), ...(m.movesSeen ?? [])])
    const moves = [...new Set([...known, ...movesOf('opp', oi)])].filter(
      (mv) => !c || ((!FIRST_TURN_MOVES.has(mv) || c.oppFresh) && !(c.ov.taunted && isStatus(mv))),
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
      if (atk.ability === 'sheerforce' || def.ability === 'shielddust') return NO_EFFECT
      const c = Math.min(100, (e.chance ?? 100) * (atk.ability === 'serenegrace' ? 2 : 1))
      p *= c / 100
    }
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
    return NO_EFFECT
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
  const selfOf = (
    moveId: string,
    atk: Combatant | null | undefined,
    atkMax: number,
    defMax: number,
  ): SelfEffect | undefined => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status' || !atk || atkMax <= 0) return undefined
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
    return perDealt || onHit ? { perDealt, onHit } : undefined
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
    return f
  }

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
    const mine = rage(mv) * Math.max(0, ...myMoves.map((x) => mineAvg(x, m, o, env)))
    const opp = rage(ov) * Math.max(0, ...opMoves.map((x) => oppAvg(x, o, m, env)))
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
      opp: Math.max(0, opp + residMine),
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
    duelCache.set(key, d)
    return d
  }
  // 맞는 쪽 효과가 생기는 경우와 아닌 경우
  const casesOf = (mv: View, ov: View, onOpp: Effect, onMine: Effect): NextCase[] => {
    const out: NextCase[] = []
    for (const oHit of [true, false])
      for (const mHit of [true, false]) {
        const p = (oHit ? onOpp.p : 1 - onOpp.p) * (mHit ? onMine.p : 1 - onMine.p)
        if (p <= 1e-9) continue
        out.push({
          p,
          mv: mHit ? { ...mv, ...onMine.patch } : mv,
          ov: oHit ? { ...ov, ...onOpp.patch } : ov,
        })
      }
    return out
  }
  const afterOf = (cases: NextCase[], mi0: number, env: Env): AfterCases =>
    cases.map((c) => ({
      p: c.p,
      duel: duelOf(c.mv, c.ov, c.mi ?? mi0, env),
      ...(c.myHp != null ? { myHp: c.myHp } : {}),
      ...(c.oppHp != null ? { oppHp: c.oppHp } : {}),
    }))

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
      const locked = lockedMove(side, idx)
      if (locked) v.locked = locked
    }
    if (m.itemGone) v.itemGone = true
    return v
  }
  const rootCtx = (mi: number, oi: number): Ctx => {
    const s = S()
    const hp = { mine: {} as Record<number, number>, opp: {} as Record<number, number> }
    s.sides.mine.mons.forEach((_, i) => (hp.mine[i] = hpFrac('mine', i)))
    s.sides.opp.mons.forEach((_, i) => (hp.opp[i] = hpFrac('opp', i)))
    return {
      root: true,
      age: 0,
      mi,
      oi,
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
          hpIn(c, side, i) > 0 &&
          (side === 'mine' || (s.sides.opp.revealed.includes(i) && !!b.oppSlots.value[i]?.species)),
      )
  }
  const canMega = (c: Ctx, side: BattleSide, idx: number) =>
    (side === 'mine' ? c.megaMine : c.megaOpp) && canMegaEvolve(side, idx)
  const benchView = (c: Ctx, side: BattleSide, k: number) =>
    viewOf(side, k, canMega(c, side, k), false)

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

  // ── 한 턴 ─────────────
  // 상대 선택지와 사전 비중: 기술 = 확정 1 / 채용률 (없으면 0.5), 교체 = oppSwitch × 들어올 포켓몬 몫.
  // 실제 비중은 결과표를 만든 뒤 상대에게 유리한 정도로 정한다 (responseWeights)
  // 상대가 들어올 수 있는 포켓몬과 그 몫: 공개된 대기 포켓몬 1, 아직 안 나온 파티는 남은 선출 수 / 후보 수
  // (안 나온 파티는 이번 턴만 — 다음 턴 계산까지 넣으면 계산이 너무 커짐)
  const oppSwitchTargets = (c: Ctx) => {
    const sd = S().sides.opp
    const out = benchIn(c, 'opp').map((to) => ({ to, share: 1 }))
    const left = OPP_PICK - sd.revealed.length
    if (left > 0 && c.root) {
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
  const oppOptionsOf = (c: Ctx, w: RecWeights) => {
    const { moves, known } = oppMoves(c.oi, c)
    const table = gd.usageTable('single', reg.active.value?.id)
    const r = resolveAt('opp', c.oi, c.ov.mega || undefined)
    const usage =
      table?.pokemon[r?.species.id ?? '']?.moveUsage ?? table?.pokemon[r?.base.id ?? '']?.moveUsage
    const targets = oppSwitchTargets(c)
    const total = targets.reduce((a, x) => a + x.share, 0)
    // 교체기(유턴 등)는 교체를 막는 상태에서도 쓸 수 있다
    const bench = (c.root && b.switchBlocked('opp', 0)) || c.ov.rampage ? [] : targets
    return [
      ...moves.flatMap((move) => {
        const prior = known.has(move) ? 1 : (usage?.[move] ?? 0.5)
        return PIVOT_MOVES.has(move) && targets.length
          ? targets.map((x) => ({
              kind: 'move' as const,
              move,
              pivotTo: x.to,
              prior: (prior * x.share) / total,
            }))
          : [{ kind: 'move' as const, move, prior }]
      }),
      ...(w.oppSwitch > 0
        ? bench.map((x) => ({ kind: 'switch' as const, to: x.to, prior: w.oppSwitch * x.share }))
        : []),
    ]
  }
  const mineOptionsOf = (c: Ctx): MineOption[] => {
    const bench = benchIn(c, 'mine')
    // 이번 턴 메가진화: 메가 폼으로 계산 중이고 진영이 아직 메가진화하지 않음
    const mega = c.mv.mega && c.megaMine
    return [
      ...mineMoves(c).flatMap((move): MineOption[] =>
        PIVOT_MOVES.has(move) && bench.length
          ? bench.map((pivotTo) => ({ kind: 'move', move, mega, pivotTo }))
          : [{ kind: 'move', move, mega }],
      ),
      ...((c.root && b.switchBlocked('mine', 0)) || c.mv.rampage
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
      oppHeal: fo.heal,
      oppUtility: om ? hazardValue(c, om, 'mine', myField) : 0,
    }
    // 상대 기술이 나간 뒤의 상대 (랭크·벽·순풍·구애 고정·반동)
    const oppAfter = (env: Env, base: View): View =>
      oppIn
        ? base
        : endOfTurn({
            ...base,
            boosts: addBoosts(base.boosts, fo.self),
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
    ): Ctx => {
      // HP 는 2% 단위로 묶는다 (다음 턴 계산을 경우끼리 나눠 쓰려고)
      const q = (x: number) => Math.max(0.02, Math.round(x * 50) / 50)
      const nm = nextTurnView(p.mv)
      const no = nextTurnView(p.ov)
      // 강제 교체로 바뀐 쪽: 원래 포켓몬은 이번 턴이 끝난 HP 로 대기
      const oiEnd = p.oi ?? ovIdx
      const mi2 = cs?.mi ?? p.mi
      const oi2 = cs?.oi ?? oiEnd
      const mineHp = { ...c.hp.mine, [p.mi]: q(p.myHp) }
      const oppHp = { ...c.hp.opp, [oiEnd]: q(p.oppHp) }
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
      onMine: Effect
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
      onIn: (v: View) => Effect,
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
        return { cases, after: afterOf(cases, m.mi, expire(c, env)), env }
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
      cell.next = (pivoted, oppPivoted, cs, mh, oh) => {
        if (!oppPivoted) return plain(pivoted, oppPivoted, cs, mh, oh)
        const m = pivoted && myPivot ? myPivot : my
        const env = pivoted && both ? both.env : a.env
        return nextCtx(
          { mi: m.mi, oi: k, mv: cs.mv, ov: cs.ov, myHp: mh, oppHp: oh, env },
          m.last,
          m.fresh,
          m.mega,
          cs,
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
      const onMineIn = om
        ? (so.target ?? effectOn(om, oppAtk, mineC(mvIn, false), 'mine', mvIn, false, ''))
        : NO_EFFECT
      const cases = casesOf(mvNext, ovNext, NO_EFFECT, onMineIn)
      const oppHitIn = om ? oppHit(om, ovT, mvIn, envIn, dh(inHp)) : null
      const cell: Cell2 = {
        ex: {
          ...oppCommon,
          oppHeal: fo.heal + so.heal,
          oppRevive: so.revive != null ? 0.5 : 0,
          oppUtility: oppCommon.oppUtility + so.utility,
          pFirst: 1,
          myHp: inHp,
          mine: null,
          opp: so.dealt ? { min: so.dealt, max: so.dealt, acc: 1, ko: 0 } : oppHitIn,
          oppSelf: costed(
            om ? selfOf(om, oppAtk, maxHp('opp', oi), maxHp('mine', opt.to)) : undefined,
            so.cost,
          ),
          switchIn: true,
          entryChip: hazardChip('mine', opt.to, hzChip.mine),
          after: afterOf(cases, opt.to, expire(c, env)),
          oppPerish: ovNext.perish === 0,
        },
        cases: { '00': cases },
        next: (_, __, cs, mh, oh) =>
          nextCtx(
            { mi: opt.to, mv: cs.mv, ov: cs.ov, myHp: mh, oppHp: oh, env },
            '',
            true,
            false,
            cs,
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
            boosts: addBoosts(mvT.boosts, fm.self, fo.target),
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
              boosts: addBoosts(ovT.boosts, fo.self, fm.target),
              ...(ovT.absorb && !isStatus(move) && !fails ? { absorb: 0 } : {}),
            },
        oppIn || so.fails ? { ...so, self: {}, selfPatch: {} } : so,
        reset,
      ),
    )
    // 맞는 쪽 효과: 앙코르는 맞을 때 마지막 기술 (먼저 움직이면 지난 턴 기술, 나중이면 이번 턴 기술)
    const onOpp = failsAll
      ? NO_EFFECT
      : (sm.target ??
        effectOn(move, myAtk, defT, 'opp', ovT, mineFirst, oppIn ? '' : mineFirst ? c.oppLast : om))
    let onMine = om
      ? (so.target ??
        effectOn(om, oppAtk, myDef, 'mine', mvT, !mineFirst, mineFirst ? move : c.myLast))
      : NO_EFFECT
    // 대타를 먼저 깔면 상대 변화기는 막힘
    if (sub) onMine = { ...onMine, p: onMine.p * (1 - pFirst) }
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
      mine: failsAll
        ? null
        : sm.dealt
          ? { min: sm.dealt, max: sm.dealt, acc: 1, ko: 0 }
          : mineHit(
              move,
              !mineFirst && so.resetBoosts ? { ...mvT, boosts: zeroBoosts() } : mvT,
              ovT,
              envIn,
              dh(tHp),
            ),
      opp: so.dealt
        ? { min: so.dealt, max: so.dealt, acc: 1, ko: 0 }
        : om
          ? oppHit(
              om,
              // 흑안개를 먼저 쓰면 이번 턴 상대 공격도 랭크 없이
              mineFirst && sm.resetBoosts ? { ...c.ov, boosts: zeroBoosts() } : c.ov,
              mvT,
              envIn,
              dh(myHp),
            )
          : null,
      myActs: c.myActs,
      mineStops: fails ? 0 : stopsOf(move, myAtk, defT, 'opp', ovT),
      oppStops: om ? stopsOf(om, oppAtk, myDef, 'mine', mvT) : 0,
      myProtect: PROTECT_MOVES.has(move) && !PROTECT_MOVES.has(c.myLast),
      myShieldFirst: sub,
      myDestinyBond: sm.destinyBond,
      oppDestinyBond: so.destinyBond,
      myHeal: failsAll ? 0 : fm.heal + sm.heal,
      myRevive: !failsAll && sm.revive != null ? 0.5 : 0,
      oppRevive: !so.fails && so.revive != null ? 0.5 : 0,
      oppHeal: so.fails ? fo.heal : fo.heal + so.heal,
      mySelf: sub
        ? { perDealt: 0, onHit: 0.25 }
        : failsAll
          ? undefined
          : costed(selfOf(move, myAtk, maxHp('mine', mi), maxHp('opp', ovIdx)), sm.cost),
      oppSelf: costed(
        om ? selfOf(om, oppAtk, maxHp('opp', oi), maxHp('mine', mi)) : undefined,
        so.fails ? 0 : so.cost,
      ),
      myUtility: failsAll ? 0 : hazardValue(c, move, 'opp', oppField) + sm.utility,
      oppUtility: oppCommon.oppUtility + so.utility,
      after: afterOf(phazed, mi, expire(c, env)),
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
      next: (_, __, cs, mh, oh) =>
        nextCtx({ mi, mv: cs.mv, ov: cs.ov, myHp: mh, oppHp: oh, env }, move, false, opt.mega, cs),
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
      const onVj = om ? effectOn(om, oppAtk, mineC(vj, false), 'mine', vj, false, '') : NO_EFFECT
      const casesPivot = casesOf(vjNext, ovPivot, onOpp, onVj)
      ex.pivot = {
        myHp: hpIn(c, 'mine', j),
        entryChip: hazardChip('mine', j, hzChip.mine),
        // 상대 기술이 먼저 나갔으면 상대가 깔거나 치운 설치기를 밟음
        lateChip: hazardChip('mine', j, hazardsAfter(hzChip, om, 'opp').mine),
        // 넘긴 대타가 있으면 이번 턴 상대 공격은 대타가 받음
        opp: om && !vj.absorb ? oppHit(om, c.ov, vj, envIn, dh(hpIn(c, 'mine', j))) : null,
      }
      ex.afterPivot = afterOf(casesPivot, j, expire(c, envJ))
      cell.cases['10'] = casesPivot
      const plain = cell.next
      cell.next = (pivoted, oppPivoted, cs, mh, oh) =>
        pivoted
          ? nextCtx(
              { mi: j, mv: cs.mv, ov: cs.ov, myHp: mh, oppHp: oh, env: envJ },
              '',
              true,
              opt.mega,
              cs,
            )
          : plain(pivoted, oppPivoted, cs, mh, oh)
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
        if (failsAll) return NO_EFFECT
        const e = effectOn(move, myAtk, oppCs(vk, false)[0], 'opp', vk, false, '')
        return { ...e, p: e.p * (1 - pFirst) }
      },
      failsAll ? '' : move,
      ovAfter,
    )
  }

  // 한 턴 계산: 선택지 × 상대 선택지 결과. depth 2 면 둘 다 살아 있는 경우마다 다음 턴 최선값을 맞대결 전망 대신 더한다
  interface Solved {
    options: MineOption[]
    opp: (OppOption & { weight: number })[]
    table: Outcome[][]
    next: ({ option: MineOption; mi: number } | null)[] // 선택지별 가장 흔한 경우의 다음 턴 추천
  }
  const valueCache = new Map<string, { value: number; best: MineOption | null }>()
  const solve = (c: Ctx, w: RecWeights, d: number): Solved | null => {
    const oppAll = oppOptionsOf(c, w)
    const options = mineOptionsOf(c)
    if (!oppAll.length || !options.length) return null
    const cells = options.map((opt) => oppAll.map((oo) => cellOf(c, opt, oo)))
    const table = cells.map((row) => row.map((cell) => evaluate(cell.ex, w)))
    const weights = responseWeights(
      oppAll.map((o) => o.prior),
      table,
      w,
    )
    const opp = oppAll.map(({ prior: _p, ...o }, j) => ({ ...o, weight: weights[j]! }))
    const next: Solved['next'] = options.map(() => null)
    if (d >= 2) {
      const nextP = options.map(() => 0)
      table.forEach((row, i) =>
        row.forEach((o, j) => {
          const oo = opp[j]!
          if (oo.weight < DEPTH_MIN_P) return
          const cell = cells[i]![j]!
          // 다음 턴: 둘 다 살아 있는 경우(교체기로 바뀌었는지별) × 맞는 쪽 효과 경우. 드문 경우는 맞대결 전망으로
          let cont = 0
          for (const e of o.ends) {
            const cs =
              cell.cases[pivotKey(e.pivoted, e.oppPivoted)] ??
              cell.cases[pivotKey(e.pivoted, false)] ??
              cell.cases['00']!
            const after = afterFor(cell.ex, e.pivoted, e.oppPivoted)
            cs.forEach((k, ci) => {
              const p = e.p * k.p
              if (p < DEPTH_MIN_P) {
                cont += p * w.duel * duelValue(after[ci]!.duel, e.myHp, e.oppHp)
                return
              }
              const nc = cell.next(e.pivoted, e.oppPivoted, k, e.myHp, e.oppHp)
              const v = valueOf(nc, w)
              cont += p * v.value
              if (v.best && p * oo.weight > nextP[i]!) {
                nextP[i] = p * oo.weight
                next[i] = { option: v.best, mi: nc.mi }
              }
            })
          }
          row[j] = { ...o, score: o.immediate + cont }
        }),
      )
    }
    return { options, opp, table, next }
  }
  // 다음 턴의 최선 기대값 (내 최선 선택지) — HP 를 조금 묶어서 기억
  const valueOf = (c: Ctx, w: RecWeights) => {
    const r2 = (x: number) => Math.round(x * 50) / 50
    const key = JSON.stringify([
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
    ])
    const hit = valueCache.get(key)
    if (hit) return hit
    const sv = solve(c, w, 1)
    let out = { value: 0, best: null as MineOption | null }
    if (sv) {
      const weights = sv.opp.map((o) => o.weight)
      const ranked = rankOutcomes(sv.table, weights, w)
      if (ranked[0]) out = { value: ranked[0].expected, best: sv.options[ranked[0].index]! }
    }
    valueCache.set(key, out)
    return out
  }

  function compute(w: RecWeights, d: 1 | 2): Recommendation | null {
    const s = b.state.value
    if (!s || b.N !== 1 || b.battleResult.value) return null
    const mi = s.sides.mine.active[0]
    const oi = s.sides.opp.active[0]
    if (mi == null || oi == null || b.isFainted('opp', oi)) return null
    duelCache.clear()
    hitCache.clear()
    avgCache.clear()
    callCache.clear()
    valueCache.clear()
    const c0 = rootCtx(mi, oi)

    // 쓰러져 교체할 차례: 대기 포켓몬마다 설치기 데미지 + (depth 1) 맞대결 전망 / (depth 2) 들어간 뒤 다음 턴 최선값.
    // 상대는 이번에 공격하지 않음. 등장 특성(위협·날씨) 반영
    if (b.isFainted('mine', mi)) {
      const bench = benchIn(c0, 'mine')
      if (!bench.length) return null
      const options: MineOption[] = bench.map((to) => ({ kind: 'switch', to }))
      const next: ({ option: MineOption; mi: number } | null)[] = bench.map(() => null)
      const table = bench.map((j, i) => {
        const ab = abilityOf('mine', j)
        const mv = viewOf('mine', j, canMega(c0, 'mine', j), false)
        const ov =
          ab === 'intimidate'
            ? { ...c0.ov, boosts: addBoosts(c0.ov.boosts, intimidateDelta(abilityOf('opp', oi))) }
            : c0.ov
        const env = envWith(c0.env, ab)
        const chip = Math.min(hpIn(c0, 'mine', j), hazardChip('mine', j, hazardsOf(c0).mine))
        const o = evaluate(
          {
            pFirst: 1,
            myHp: hpIn(c0, 'mine', j),
            oppHp: hpIn(c0, 'opp', oi),
            mine: null,
            opp: null,
            switchIn: true,
            entryChip: chip,
            oppActs: 0,
            after: [{ p: 1, duel: duelOf(mv, ov, j, env) }],
          },
          w,
        )
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
        const v = valueOf(nc, w)
        next[i] = v.best ? { option: v.best, mi: j } : null
        return [{ ...o, score: o.immediate + v.value }]
      })
      return finish('replace', d, options, [{ kind: 'move', move: '', weight: 1 }], table, next, w)
    }

    const sv = solve(c0, w, d)
    if (!sv) return null
    return finish('turn', d, sv.options, sv.opp, sv.table, sv.next, w)
  }

  function finish(
    mode: Recommendation['mode'],
    d: 1 | 2,
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
          next: d === 2 ? next[r.index] : undefined,
        },
      }
    })
    return {
      mode,
      depth: d,
      options,
      opp,
      ranked,
      best: ranked[0]?.index ?? -1,
      safe: safest(ranked)?.index ?? -1,
    }
  }

  // 화면에서 열었을 때만 계산
  const enabled = ref(false)
  const result = computed(() => (enabled.value ? compute(weights.value, depth.value) : null))
  return { enabled, result }
}
