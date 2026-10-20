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
import {
  hitInfo,
  isGrounded,
  isSpreadMove,
  RESIST_BERRIES,
  SCREEN_BREAKERS,
  type DamageOptions,
  type FieldState,
} from '~/utils/damage'
import { statusDamage } from '~/utils/ko'
import { clampBoost, effectiveSpeed, highestStat } from '~/utils/stats'
import { fullRanges, narrowRanges, type SpeedEnv, type SpeedRanges } from '~/utils/speedInference'
import type { BoostTable, MoveEffect, RankKey, Status, Terrain, Weather } from '~/utils/types'

export type BattleSide = 'mine' | 'opp'

export interface MonState {
  hp: number // mine: 실제 HP / opp: %
  megaOn: boolean // 메가진화 상태로 계산 (사용 전 미리보기 포함)
  megaUsed: boolean // 실제로 메가진화함 → 되돌릴 수 없음
  alt: boolean // 배틀 폼 (팔라피 마이티폼 / 킬가르도 블레이드폼)
  itemGone: boolean // 도구를 잃음 (소모 / 탁쳐서떨구기 등) → 계산에서 도구 없음
  // (상대만) 도구 확인됨: 턴 끝 회복 메시지 등으로 본 도구. 확인된 도구만 턴 끝 효과(먹다남은음식 등)를 자동 반영
  itemKnown?: boolean
  seedFrom?: number | null // 씨뿌리기를 심은 상대의 칸 (턴 끝 흡수를 받는 쪽)
  status: Status
  toxicTurn: number
  volatiles: Record<string, number> // 특수 상태 → 경과 턴 (1부터)
  boosts: BoostTable
  lastMove: string // 마지막으로 쓴 기술 (메트로놈 도구 연속 횟수용)
  moveStreak: number // lastMove 를 연속으로 쓴 횟수 − 1
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
}

// 행동 불가 이유: 잠듦 / 얼음 / 마비(몸이 저림) / 풀죽음 / 기타(혼란 자해·반동 등)
export type CantReason = 'slp' | 'frz' | 'par' | 'flinch' | 'other'
export const CANT_REASONS: CantReason[] = ['slp', 'frz', 'par', 'flinch', 'other']

export interface ActionState {
  // move: 기술 사용 / switch: 교체 / cant: 행동 불가 (잠듦·얼음 등으로 기술이 나가지 않음)
  kind: 'move' | 'switch' | 'cant'
  cantReason: CantReason
  move: string // 기술 id
  target: number // 상대 필드 칸
  switchTo: number | null
  useMega: boolean
  amount: number | null // mine: 입힌 데미지(%), opp: 받은 데미지(실수치)
  allyAmount: number | null // 더블에서 아군도 맞히는 광역기의 아군 피해 (mine: 실수치, opp: %)
  crit: boolean // 입력한 데미지가 급소였음 (추정에 반영)
  missed: boolean // 빗나감·실패 (데미지 없음, 무릎차기류 반동, 다음 턴 분함의발구르기·열불내기 2배)
  amount2: number | null // 더블: 광역기가 맞힌 다른 상대 칸의 피해 (mine: %, opp: 실수치)
  selfSwitch: number | null // 공격 후 자기가 교체 (유턴·볼트체인지 등 / 상대 레드카드) → 나오는 로스터 인덱스
  foeSwitch: number | null // 공격 후 상대가 교체 (드래곤테일·울부짖기 등 / 탈출버튼·위기회피) → 나오는 로스터 인덱스
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
  }
  terrain: { key: Terrain; cur: number; total: number }
  rooms: Record<string, Counter>
  fairyLock: number
  sides: Record<BattleSide, SideState>
  actions: Record<BattleSide, ActionState[]>
  inflict: Record<BattleSide, string> // 이번 턴 새로 생긴 상태이상/특수상태
  observedOrder: 'unknown' | 'mine' | 'opp'
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
      'nightmare',
      'curse',
      'charge',
      'focusenergy',
      'stockpile',
      'yawn',
      'aquaring',
    ],
  },
  { label: 'groupTrap', items: ['octolock', 'jawlock', 'ingrain', 'partiallytrapped'] },
]
export const VOLATILE_DURATION: Record<string, number | null> = {
  confusion: 4,
  mustrecharge: 1,
  taunt: 3,
  disable: 4,
  encore: 3,
  torment: null,
  attract: null,
  healblock: 5,
  saltcure: null,
  leechseed: null,
  nightmare: null,
  curse: null,
  charge: null,
  focusenergy: null, // 기충전: 물러날 때까지
  stockpile: null, // 비축: 값 = 횟수 (1~3)
  aquaring: null,
  yawn: null, // 하품(졸음): 1 = 이번 턴에 걸림, 2 = 이번 턴 끝에 잠듦 (턴 끝 처리에서 따로 진행, 교체하면 풀림)
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
  foeSwitch: null,
})
// 바톤터치로 넘어가는 특수 상태
const BATON_VOLATILES = new Set([
  'confusion',
  'focusenergy',
  'leechseed',
  'curse',
  'ingrain',
  'aquaring',
  'healblock',
])
// 잠든 채로 쓰는 기술 (써도 깨지 않음)
const SLEEP_MOVES = new Set(['sleeptalk', 'snore'])
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
    return resolveSnapshot(side, idx, {
      megaOn: megaOverride ?? mon.megaOn,
      alt: altOverride ?? mon.alt,
      transform:
        mon.transform && altOverride != null
          ? { ...mon.transform, alt: altOverride }
          : mon.transform,
    })
  }
  // 저장해 둔 상태(관측 시점 등)로 풀기. 변신 중이면 복사 대상(그때의 메가/폼) 기준, HP·도구는 자기 것
  const resolveSnapshot = (
    side: BattleSide,
    idx: number,
    snap: { megaOn: boolean; alt: boolean; transform?: MonState['transform'] },
  ): ResolvedSlot | null => {
    const tf = snap.transform
    if (tf) {
      const self = calc.resolve(slotsOf(side)[idx], false, false)
      const target = calc.resolve(slotsOf(tf.side)[tf.idx], tf.megaOn, tf.alt)
      if (self && target) return calc.transformed(self, target)
    }
    return calc.resolve(slotsOf(side)[idx], snap.megaOn, snap.alt)
  }
  // 메타몽 자신의 특성 (변신 전 원래 특성: 괴짜 판정용)
  const ownAbility = (side: BattleSide, idx: number) =>
    calc.resolve(slotsOf(side)[idx], false, false)?.ability || ''
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
      weather: { key: '', cur: 0, total: BASE_TURNS, permanent: false, source: null },
      terrain: { key: '', cur: 0, total: BASE_TURNS },
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
      inflict: { mine: '', opp: '' },
      observedOrder: 'unknown',
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
  function sendOut(
    side: BattleSide,
    slot: number,
    idx: number,
    how: 'switch' | 'correct' = 'switch',
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
      // 배틀 폼: 팔라피는 한 번 물러나면 마이티폼으로 고정, 킬가르도는 물러나면 실드폼, 모르페코는 배부른모양
      const outAbility = resolveAt(side, prev)?.ability
      if (outAbility === 'zerotohero') out.alt = true
      if (outAbility === 'stancechange' || outAbility === 'hungerswitch') out.alt = false
      if (s.weather.source && s.weather.source[0] === side && s.weather.source[1] === prev)
        clearWeather()
      s.observedOrder = 'unknown'
    }
    sd.active[slot] = idx
    sd.mons[idx]!.enteredTurn = lead ? 0 : s.turn
    // 설치기: 실제로 교체해 들어올 때 (선두 고르기·정정은 제외)
    if (!lead) entryHazards(side, idx)
    if (side === 'opp' && !sd.revealed.includes(idx)) sd.revealed.push(idx)
    onEnter(side, idx, true)
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
      if (INTIMIDATE_IMMUNE.has(ab)) continue
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
    const s = state.value!
    const r = resolveAt(side, idx)
    if (!r) return
    const ab = r.ability
    if (PRIMAL_ABILITY[ab])
      setWeather(PRIMAL_ABILITY[ab]!, { permanent: true, source: [side, idx] })
    else if (WEATHER_ABILITY[ab] && !s.weather.permanent)
      setWeather(WEATHER_ABILITY[ab]!, { item: r.slot.item })
    if (TERRAIN_ABILITY[ab]) setTerrain(TERRAIN_ABILITY[ab]!, r.slot.item)
    if (entering && ab === 'intimidate') intimidate(side, idx)
  }

  // ── 날씨 / 필드 / 공간 ─────────────
  function setWeather(
    key: Weather,
    opts: { permanent?: boolean; source?: [BattleSide, number]; item?: string } = {},
  ) {
    const w = state.value!.weather
    w.key = key
    w.cur = 0
    w.total = opts.item && WEATHER_ROCK[key] === opts.item ? EXTENDED_TURNS : BASE_TURNS
    w.permanent = !!opts.permanent
    w.source = opts.source || null
  }
  function clearWeather() {
    Object.assign(state.value!.weather, {
      key: '',
      cur: 0,
      total: BASE_TURNS,
      permanent: false,
      source: null,
    })
  }
  function setTerrain(key: Terrain, item?: string) {
    Object.assign(state.value!.terrain, {
      key,
      cur: 0,
      total: item === 'terrainextender' ? EXTENDED_TURNS : BASE_TURNS,
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
  const toggleVolatile = (side: BattleSide, idx: number, key: string) => {
    const m = mon(side, idx)
    // 비축은 누를 때마다 1 → 2 → 3 → 없음
    if (key === 'stockpile' && (m.volatiles[key] || 0) < 3)
      m.volatiles[key] = (m.volatiles[key] || 0) + 1
    else if (m.volatiles[key]) delete m.volatiles[key]
    // 하품은 턴 사이에 켜므로 "이번 턴 끝에 잠듦" 상태로
    else m.volatiles[key] = key === 'yawn' ? 2 : 1
  }
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
  const setMega = (side: BattleSide, idx: number, on: boolean) => {
    const m = mon(side, idx)
    if (m.megaUsed) return
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
    slp: ['insomnia', 'vitalspirit', 'sweetveil'],
    frz: ['magmaarmor'],
  }
  // ── 턴 끝 회복·데미지 ─────────────
  // 상태이상 데미지(독·화상)는 따로. frac: 최대 HP 대비 (+ 회복 / − 데미지).
  //   날씨 특성: 젖은접시(비 +1/16) 아이스바디(설경 +1/16) 건조피부(비 +1/8, 쾌청 −1/8) / 포이즌힐(독 +1/8)
  //   그래스필드(땅에 있음 +1/16) / 도구: 먹다남은음식 +1/16, 검은진흙(독 타입 +1/16, 아니면 −1/8)
  //     — 상대는 도구가 확인됐을 때만 (itemKnown), 도구를 잃었거나 매직룸·서투름이면 없음
  //   아쿠아링·뿌리박기 +1/16 / 씨뿌리기 −1/8 (심은 상대가 그만큼 회복, 해감액이면 그쪽이 데미지)
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
  function applyResidual(side: BattleSide, idx: number) {
    const s = state.value!
    for (const x of residualPlan(side, idx)) {
      if (mon(side, idx).hp <= 0) break
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
  // 파티의 도구를 그 도구로 바꾸고 확정 표시 → 이번 턴 처리부터 반영 (턴 끝 회복 등). item = '' 이면 확정 취소
  // (지금 필드·날씨를 누가 깔았는지는 따로 기록하지 않으므로 그라운드코트·바위는 지금 것을 연장한다고 본다)
  const confirmItem = (side: BattleSide, idx: number, item: string) => {
    const m = mon(side, idx)
    const slot = slotsOf(side)[idx]
    if (!slot) return
    if (!item) {
      m.itemKnown = false
      return
    }
    slot.item = item
    m.itemGone = false
    m.itemKnown = true
    // 그라운드코트·날씨 연장 바위: 지금 깔린 필드·날씨가 5턴이면 8턴으로 (안 끝나는 걸 보고 확정하는 경우)
    const st = state.value!
    if (item === 'terrainextender' && st.terrain.key && st.terrain.total === BASE_TURNS)
      st.terrain.total = EXTENDED_TURNS
    const w = st.weather
    if (w.key && !w.permanent && WEATHER_ROCK[w.key] === item && w.total === BASE_TURNS)
      w.total = EXTENDED_TURNS
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
  }
  // 하품: 졸음 상태로 (이미 졸음이거나 잠들 수 없으면 실패). 다음 턴 끝에 잠듦
  function inflictYawn(side: BattleSide, idx: number) {
    const m = mon(side, idx)
    if (m.volatiles.yawn || statusBlocked(side, idx, 'slp')) return
    m.volatiles.yawn = 1
  }

  // 기술의 효과 자동 반영. targets: 맞은 상대 칸들 (광역기면 여럿), hit: 기술이 맞았는지 (빗나감·실패·데미지 0 이면 false)
  //   랭크 변화·상태이상·혼란: 확정 효과와 확률 100% 부가효과만 (나머지 확률 효과는 "이번 턴 확률 효과"로 보여 주고 직접 입력)
  //   공격기의 효과는 맞혔을 때만, 상성상 무효인 상대에게는 없음. 부가효과는 우격다짐이면 없음, 맞는 쪽 인분이면 막음
  //   변화기는 황금몸이 막음
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
    for (const e of move.effects as MoveEffect[]) {
      if (e.type === 'boost' || e.type === 'status' || e.type === 'volatile') {
        const chance = 'chance' in e ? e.chance : undefined
        if (chance && chance < 100) continue
        if (chance && user?.ability === 'sheerforce') continue
        const onSelf = e.target === 'self'
        // 공격기: 자기 효과(니트로차지 등)는 하나라도 맞혔을 때, 상대 효과는 맞은 상대에게
        if (damaging && !hitTargets.length) continue
        if (!damaging && !hit) continue
        const list = onSelf ? [userIdx] : hitTargets
        const tSide = onSelf ? side : foe
        for (const tIdx of list) {
          if (!onSelf && chance && resolveAt(foe, tIdx)?.ability === 'shielddust') continue
          if (e.type === 'boost') {
            for (const [k, v] of Object.entries(e.stats)) {
              if (k in zeroBoosts())
                statChange(
                  tSide,
                  tIdx,
                  k as RankKey,
                  v || 0,
                  tSide === side ? undefined : [side, userIdx],
                  true,
                )
            }
            whiteHerb(tSide, tIdx)
          } else if (e.type === 'status') inflictStatus(tSide, tIdx, e.status)
          else if (e.type === 'volatile' && e.status === 'confusion') {
            const tm = mon(tSide, tIdx)
            if (!tm.volatiles.confusion && resolveAt(tSide, tIdx)?.ability !== 'owntempo')
              tm.volatiles.confusion = 1
          }
        }
      } else if (e.type === 'weather' && !s.weather.permanent)
        setWeather(e.key, { item: user?.slot.item })
      else if (e.type === 'terrain') setTerrain(e.key, user?.slot.item)
      else if (e.type === 'room') s.rooms[e.key] = { cur: 0, total: BASE_TURNS }
      else if (e.type === 'side') {
        const sd = s.sides[e.side === 'self' ? side : foe]
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
      } else if (e.type === 'recharge') {
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
        const bounce =
          resolveAt(foe, tIdx)?.ability === 'magicbounce' && user?.ability !== 'magicbounce'
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
        const bounce =
          resolveAt(foe, tIdx)?.ability === 'magicbounce' && user?.ability !== 'magicbounce'
        if (bounce) inflictYawn(side, userIdx)
        else inflictYawn(foe, tIdx)
      }
    if (moveId === 'chillyreception') setWeather('snow', { item: user?.slot.item })
  }

  // 데미지를 받은 직후 (입력한 데미지가 있을 때만). hpBefore 는 받기 전 HP (mine: 실수치, opp: %)
  //   도구: 반감열매(해당 타입 효과굉장, 노말은 그냥) / 풍선 / 기합의띠(만피에서 HP 1, 내 쪽만 — 상대 HP 는 % 라서 판단 불가)
  //   맞은 쪽 특성: 지구력(방어+1) 깨어진갑옷(물리: 방어−1 스피드+2) 정의의마음(악: 공격+1) 열교환(불꽃: 공격+1)
  //     발끈(HP 절반 이하로: 특공+1) 모래뿜기(모래바람) 넘치는씨(그래스필드) 전기로바꾸기(충전) 독치장(물리: 공격 측에 독압정)
  //   공격한 쪽: 자기과신(쓰러뜨리면 공격+1)
  function onHit(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    tSide: BattleSide,
    targetIdx: number,
    hpBefore: number,
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

    const ab = r.ability
    const physical = move.category === 'physical'
    // 둔갑(따라큐): 공격을 한 번 받으면 풀린 모습으로 (틀깨기 공격이면 둔갑은 그대로)
    if (ab === 'disguise' && !t.alt && atk?.ability !== 'moldbreaker') t.alt = true
    if (alive) {
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
    if (ab === 'sandspit' && !state.value!.weather.permanent) setWeather('sand', { item })
    if (ab === 'seedsower') setTerrain('grassy', item)
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

  // ── 입력 검증 ─────────────
  const validationError = computed(() => {
    const s = state.value
    if (!s) return ''
    let err = ''
    for (const a of s.actions.mine) {
      if (a.kind !== 'move') continue
      for (const v of [a.amount, a.amount2]) if (v != null && (v < 0 || v > 100)) return 'errDealt'
    }
    for (const a of s.actions.opp) {
      if (a.kind !== 'move') continue
      const check = (v: number | null, slot: number) => {
        if (v == null) return false
        const target = s.sides.mine.active[slot]
        const max = target != null ? maxHp('mine', target) : 0
        return v < 0 || (!!max && v > max)
      }
      if (check(a.amount, a.target) || check(a.amount2, 1 - a.target)) return 'errTaken'
    }
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
    const sides: BattleSide[] = ['mine', 'opp']

    // 1. 교체
    // 0. 이번 턴 기록 초기화
    for (const side of sides)
      for (const m of s.sides[side].mons)
        Object.assign(m, {
          turnDamaged: false,
          turnLowered: false,
          turnTaken: { physical: 0, special: 0, last: 0 },
        })
    for (const side of sides) {
      s.actions[side].forEach((a, slot) => {
        if (a.kind === 'switch' && a.switchTo != null && !s.fairyLock)
          sendOut(side, slot, a.switchTo)
      })
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
        if (
          !m.status &&
          (a.cantReason === 'slp' || a.cantReason === 'frz' || a.cantReason === 'par')
        )
          Object.assign(m, { status: a.cantReason, toxicTurn: 0 })
        m.lastFailed = false
      })

    // 2a. 메가진화 (기술보다 먼저 — 이번 턴 스피드에도 반영)
    for (const side of sides) {
      s.actions[side].forEach((a, slot) => {
        const userIdx = s.sides[side].active[slot]
        if (a.kind !== 'move' || !a.useMega || userIdx == null) return
        const m = mon(side, userIdx)
        if (!m.megaUsed && resolveAt(side, userIdx, true)?.isMega) {
          m.megaOn = true
          m.megaUsed = true
          onEnter(side, userIdx, true)
        }
      })
    }

    // 2b. 행동 순서 + 선후공 관찰로 상대 스피드 구간 좁히기 (변신한 상대는 복사한 스피드라 저장 안 함)
    const order = turnOrder()
    const sp = pendingSpeedObservation()
    if (sp && sp.env.fixedStat == null) {
      const om = mon('opp', sp.oi)
      om.speedSp = narrowRanges(
        om.speedSp ?? fullRanges(),
        sp.base,
        sp.env,
        sp.mySpeed,
        sp.oppAtLeast,
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
      {
        const targetIdx = s.sides[foe].active[a.target] ?? null
        const user = mon(side, userIdx)
        // 이번 턴 데미지에 영향을 주는 그때의 보정 (행동 순서 포함) → 관측 기록
        if (a.move && targetIdx != null && a.amount && a.amount > 0 && !a.missed)
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
        // 잠듦·얼음인데 기술을 썼으면 깨어남·녹음 (잠꼬대·코골기는 잠든 채로 씀)
        if (
          a.move &&
          (user.status === 'frz' || (user.status === 'slp' && !SLEEP_MOVES.has(a.move)))
        )
          user.status = ''
        if (a.move) {
          // 메트로놈(도구) 연속 횟수
          if (user.lastMove === a.move) user.moveStreak += 1
          else Object.assign(user, { lastMove: a.move, moveStreak: 0 })
          // 충전은 전기 공격기를 쓰면 풀린다
          const mv = gd.move(a.move)
          if (user.volatiles.charge && mv?.type === 'electric' && mv.category !== 'status')
            delete user.volatiles.charge
          // 맞은 상대: 대상 + (더블 광역기) 다른 상대 칸. 빗나감·데미지 0 이면 맞지 않음
          const other = N > 1 ? (s.sides[foe].active[1 - a.target] ?? null) : null
          const targets: number[] = []
          if (targetIdx != null && a.amount !== 0) targets.push(targetIdx)
          if (other != null && isSpreadMove(mv) && a.amount2 !== 0 && !isFainted(foe, other))
            targets.push(other)
          applyMoveEffects(a.move, side, userIdx, targetIdx, targets, !a.missed)
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
        // 입력한 데미지 (광역기면 다른 상대 칸도)
        const hitTarget = (tIdx: number, amount: number) => {
          const t = mon(foe, tIdx)
          const hpBefore = t.hp
          if (side === 'mine') t.hp = Math.max(0, t.hp - Math.max(0, Math.min(100, amount)))
          else t.hp = Math.max(0, t.hp - Math.max(0, amount))
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
          if (a.move) onHit(a.move, side, userIdx, foe, tIdx, hpBefore)
        }
        if (targetIdx != null && a.amount && !a.missed) hitTarget(targetIdx, a.amount)
        const otherIdx = N > 1 ? (s.sides[foe].active[1 - a.target] ?? null) : null
        if (otherIdx != null && a.amount2 && !a.missed && isSpreadMove(gd.move(a.move))) {
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
        // 아군 피해 (mine: 내 아군 실수치, opp: 상대 아군 %)
        const allyIdx = allyOf(side, slot)
        if (allyIdx != null && a.allyAmount && a.move && hitsAlly(a.move)) {
          const ally = mon(side, allyIdx)
          const hpBefore = ally.hp
          ally.hp = Math.max(0, ally.hp - Math.max(0, a.allyAmount))
          if (a.allyAmount > 0) ally.timesHit = (ally.timesHit || 0) + 1
          onHit(a.move, side, userIdx, side, allyIdx, hpBefore)
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
          // 바톤터치: 랭크 변화와 일부 특수 상태를 나오는 포켓몬에게 넘김 (교체로 초기화되기 전에 복사)
          const passed =
            a.move === 'batonpass'
              ? {
                  boosts: { ...user.boosts },
                  vols: Object.fromEntries(
                    Object.entries(user.volatiles).filter(([k]) => BATON_VOLATILES.has(k)),
                  ),
                  seedFrom: user.seedFrom,
                }
              : null
          sendOut(side, slot, a.selfSwitch)
          if (passed) {
            const inc = mon(side, a.selfSwitch)
            for (const [k, v] of Object.entries(passed.boosts))
              inc.boosts[k as RankKey] = clampBoost((inc.boosts[k as RankKey] ?? 0) + (v ?? 0))
            Object.assign(inc.volatiles, passed.vols)
            if (passed.vols.leechseed) inc.seedFrom = passed.seedFrom
          }
        }
        if (a.move === 'spitup' || a.move === 'swallow') delete user.volatiles.stockpile
      }
    })

    // 3. 원시 날씨의 원인이 쓰러지면 날씨 해제
    if (s.weather.source && isFainted(s.weather.source[0], s.weather.source[1])) clearWeather()

    // 4. 이번 턴 생긴 상태이상 / 특수상태 (분석 대상 칸에 적용)
    for (const side of sides) {
      const v = s.inflict[side]
      const idx = s.sides[side].active[s.focus[side]]
      if (v && idx != null) {
        if ((STATUSES as string[]).includes(v))
          Object.assign(mon(side, idx), { status: v, toxicTurn: 0 })
        else mon(side, idx).volatiles[v] = 1
      }
      s.inflict[side] = ''
    }

    // 5. 턴 종료: 상태이상 데미지, 특수상태 경과
    for (const side of sides) {
      for (const idx of s.sides[side].active) {
        if (idx == null || isFainted(side, idx)) continue
        const m = mon(side, idx)
        if (m.status === 'tox') m.toxicTurn += 1
        const r = resolveAt(side, idx)
        const max = r?.stats.hp || 0
        const dmg = statusDamage(max, m.status, r?.ability, m.toxicTurn)
        if (dmg)
          m.hp =
            side === 'mine' ? Math.max(0, m.hp - dmg) : Math.max(0, m.hp - (dmg / (max || 1)) * 100)
        // 가속: 이번 턴에 나온 포켓몬은 제외
        if (r?.ability === 'speedboost' && m.hp > 0 && m.enteredTurn < s.turn)
          statChange(side, idx, 'spe', 1)
        // 꼬르륵스위치(모르페코): 턴이 끝날 때마다 배부른모양 ↔ 배고픈모양 (변신 중이면 그대로)
        if (r?.ability === 'hungerswitch' && m.hp > 0 && !m.transform) m.alt = !m.alt
        // 턴 끝 회복·데미지 (먹다남은음식·그래스필드·씨뿌리기 등)
        if (m.hp > 0) applyResidual(side, idx)
        // 하품: 걸린 다음 턴이 끝날 때까지 필드에 있으면 잠듦 (교체하면 졸음이 풀림)
        if (m.volatiles.yawn) {
          if (m.volatiles.yawn >= 2) {
            delete m.volatiles.yawn
            if (m.hp > 0) inflictStatus(side, idx, 'slp')
          } else m.volatiles.yawn = 2
        }
        for (const [k, turn] of Object.entries(m.volatiles)) {
          const total = VOLATILE_DURATION[k]
          if (total == null) continue
          if (turn + 1 > total) delete m.volatiles[k]
          else m.volatiles[k] = turn + 1
        }
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
        a.selfSwitch = null
        a.foeSwitch = null
        a.useMega = false
        // 잠듦·얼음이면 다음 턴 기본값은 행동 불가 (깨어나서 기술을 쓰면 직접 "기술 사용"으로)
        const ui = s.sides[side].active[slot]
        const st = ui != null ? mon(side, ui).status : ''
        if (a.kind !== 'switch' && (st === 'slp' || st === 'frz'))
          Object.assign(a, { kind: 'cant', cantReason: st })
        else if (a.kind === 'cant') a.kind = 'move'
      })
    }
    s.observedOrder = 'unknown' // 선후공 관찰은 턴마다 새로
    s.turn += 1
  }

  // ── 행동 순서 ─────────────
  // 실전 스피드 (랭크 / 특성 / 스카프(매직룸·도구 잃음이면 무효) / 순풍 / 마비). megaOverride: 이번 턴 메가진화 반영
  const speedOf = (side: BattleSide, idx: number, megaOverride?: boolean) => {
    const s = state.value!
    const r = resolveAt(side, idx, megaOverride)
    const m = mon(side, idx)
    if (!r) return 0
    return effectiveSpeed(r.stats.spe, {
      boost: m.boosts.spe,
      item: m.itemGone || s.rooms.magicroom ? '' : r.slot.item,
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
    return a?.kind === 'move' &&
      a.useMega &&
      !mon(side, idx).megaUsed &&
      resolveAt(side, idx, true)?.isMega
      ? true
      : undefined
  }
  // 이번 턴 기술을 쓰는 순서: 우선도 → 스피드(트릭룸이면 느린 쪽부터).
  // 분석 대상 칸끼리는 관찰한 선후공이 있으면 그대로 (우선도가 같을 때). 교체하는 칸은 기술을 안 씀
  const turnOrder = (): TurnEntry[] => {
    const s = state.value!
    const list: (TurnEntry & { pri: number; spe: number })[] = []
    for (const side of ['mine', 'opp'] as const) {
      s.actions[side].forEach((a, slot) => {
        const idx = s.sides[side].active[slot]
        if (a.kind !== 'move' || idx == null || isFainted(side, idx)) return
        list.push({
          side,
          slot,
          idx,
          move: a.move,
          pri: movePriority(side, idx, a.move),
          spe: speedOf(side, idx, turnMega(side, slot, idx)),
        })
      })
    }
    const tr = !!s.rooms.trickroom
    list.sort(
      (x, y) =>
        y.pri - x.pri || (tr ? x.spe - y.spe : y.spe - x.spe) || (x.side === 'mine' ? -1 : 1),
    )
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
    const targetIdx = s.sides[foe].active[a.target] ?? null
    const pos = order.findIndex((e) => e.side === side && e.idx === userIdx)
    const tPos =
      targetIdx == null ? -1 : order.findIndex((e) => e.side === foe && e.idx === targetIdx)
    const targetSwitchedIn = s.actions[foe][a.target]?.kind === 'switch'
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
            !ef.chance &&
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
  // 이번 턴 관찰한 선후공 (분석 대상 칸끼리, 둘 다 기술 + 우선도가 같을 때만 스피드 비교가 됨)
  const pendingSpeedObservation = () => {
    const s = state.value!
    if (s.observedOrder === 'unknown') return null
    const ms = s.focus.mine
    const os = s.focus.opp
    const ma = s.actions.mine[ms]
    const oa = s.actions.opp[os]
    const mi = s.sides.mine.active[ms]
    const oi = s.sides.opp.active[os]
    if (ma?.kind !== 'move' || oa?.kind !== 'move' || mi == null || oi == null) return null
    if (movePriority('mine', mi, ma.move) !== movePriority('opp', oi, oa.move)) return null
    const se = speedEnvOf(oi, turnMega('opp', os, oi))
    if (!se) return null
    return {
      oi,
      ...se,
      mySpeed: speedOf('mine', mi, turnMega('mine', ms, mi)),
      // 트릭룸에서는 느린 쪽이 먼저
      oppAtLeast: (s.observedOrder === 'opp') !== !!s.rooms.trickroom,
    }
  }
  // 상대 oi 의 스피드 구간: 저장된 관찰 + 이번 턴 관찰(미리보기). 변신 중이면 이번 턴 관찰만
  const speedRangesOf = (oi: number, withPending = true): SpeedRanges => {
    const m = mon('opp', oi)
    const transformed = !!m.transform
    const base = transformed ? fullRanges() : (m.speedSp ?? fullRanges())
    const p = withPending ? pendingSpeedObservation() : null
    if (!p || p.oi !== oi) return base
    return narrowRanges(base, p.base, p.env, p.mySpeed, p.oppAtLeast)
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
    const s = state.value!
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
    const ko = a.amount >= left
    const obs: StatObservation = {
      kind: side === 'mine' ? 'dealt' : 'taken',
      move: a.move,
      amount: ko ? left : a.amount,
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
    om.obs = [...(om.obs ?? []), obs]
  }
  // 추정 기록 지우기 (입력을 잘못했을 때)
  const resetEstimate = (oi: number) => {
    const m = mon('opp', oi)
    m.obs = []
    m.speedSp = null
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
    const r = attacking ? calc.attackForm(resolved) : resolved
    const m = mon(side, idx)
    const active = state.value!.sides[side].active.includes(idx)
    const hp = side === 'mine' ? m.hp : Math.round((r.stats.hp * m.hp) / 100)
    return calc.combatant(r, {
      status: m.status,
      boosts: active ? m.boosts : undefined,
      hp,
      item: m.itemGone ? '' : undefined,
    })
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
    residualPlan,
    changeBoost,
    setMega,
    setAlt,
    toggleItemGone,
    toggleTransform,
    canTransform,
    resolveSnapshot,
    speedOf,
    movePriority,
    turnOrder,
    actionOpts,
    formAtHit,
    speedEnvOf,
    pendingSpeedObservation,
    speedRangesOf,
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
  }
}
