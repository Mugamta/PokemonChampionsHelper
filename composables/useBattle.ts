// composables/useBattle.ts
// 배틀 진행 상태 (싱글: 필드에 1마리씩 / 더블: 2마리씩). 기존 singleBattle.vue 의 로직을 영어 키로 옮기고
// 필드 마릿수(N)를 일반화했다. 상태 전체를 useState 에 두어서 다른 화면을 다녀와도 유지된다.
//
//  - 내 포켓몬 HP 는 실제 수치, 상대 HP 는 % (상대 실능치는 추정이므로)
//  - 상태이상/랭크/특수 상태는 포켓몬별로 관리 (교체 시 랭크·특수상태 초기화, 상태이상 유지)
//  - "이번 턴 적용" = 교체 → 기술(효과 자동 반영 + 입력한 데미지) → 상태이상 발생 → 턴 종료 데미지 → 턴 경과
//  - 직전 30턴까지 스냅샷으로 되돌리기

import { useEntry, type BattleMode } from '~/composables/useEntry'
import { useTeamCalc, type ResolvedSlot } from '~/composables/useTeamCalc'
import type { FieldState } from '~/utils/damage'
import { statusDamage } from '~/utils/ko'
import { clampBoost } from '~/utils/stats'
import type { BoostKey, BoostTable, MoveEffect, Status, Terrain, Weather } from '~/utils/types'

export type BattleSide = 'mine' | 'opp'

export interface MonState {
  hp: number // mine: 실제 HP / opp: %
  megaOn: boolean // 메가진화 상태로 계산 (사용 전 미리보기 포함)
  megaUsed: boolean // 실제로 메가진화함 → 되돌릴 수 없음
  status: Status
  toxicTurn: number
  volatiles: Record<string, number> // 특수 상태 → 경과 턴 (1부터)
  boosts: BoostTable
}

export interface Counter { cur: number; total: number }

export interface SideState {
  mons: MonState[] // 로스터 순서 (mine: 선출 순서, opp: 상대 파티 6마리)
  active: (number | null)[] // 필드 칸 → 로스터 인덱스
  revealed: number[] // (opp) 등장이 확인된 포켓몬
  hazards: Record<string, number>
  screens: Record<string, Counter> // 리플렉터/빛의장막/오로라베일/순풍/신비의부적 등
}

export interface ActionState {
  kind: 'move' | 'switch'
  move: string // 기술 id
  target: number // 상대 필드 칸
  switchTo: number | null
  useMega: boolean
  amount: number | null // mine: 입힌 데미지(%), opp: 받은 데미지(실수치)
}

export interface BattleState {
  signature: string
  turn: number
  weather: { key: Weather; cur: number; total: number; permanent: boolean; source: [BattleSide, number] | null }
  terrain: { key: Terrain; cur: number; total: number }
  rooms: Record<string, Counter>
  fairyLock: number
  sides: Record<BattleSide, SideState>
  actions: Record<BattleSide, ActionState[]>
  inflict: Record<BattleSide, string> // 이번 턴 새로 생긴 상태이상/특수상태
  observedOrder: 'unknown' | 'mine' | 'opp'
  hitItemUsed: boolean
  hitItemNote: string
  focus: { mine: number; opp: number } // 분석 대상 필드 칸
  preview: number | null // 예상 데미지 표의 공격자 (내 로스터 인덱스)
  history: string[]
}

// 특수 상태 (지속 턴: null = 무한)
export const VOLATILE_GROUPS: { label: string; items: string[] }[] = [
  { label: 'groupMental', items: ['confusion', 'taunt', 'disable', 'encore', 'torment', 'attract', 'healblock'] },
  { label: 'groupOther', items: ['mustrecharge', 'saltcure', 'leechseed', 'nightmare', 'curse'] },
  { label: 'groupTrap', items: ['octolock', 'jawlock', 'ingrain', 'partiallytrapped'] },
]
export const VOLATILE_DURATION: Record<string, number | null> = {
  confusion: 4, mustrecharge: 1, taunt: 3, disable: 4, encore: 3, torment: null, attract: null, healblock: 5,
  saltcure: null, leechseed: null, nightmare: null, curse: null, octolock: null, jawlock: null, ingrain: null, partiallytrapped: 5,
}
export const STATUSES: Exclude<Status, ''>[] = ['psn', 'tox', 'brn', 'par', 'slp', 'frz']
export const ROOMS = ['trickroom', 'magicroom', 'wonderroom', 'gravity']
const SCREENS = new Set(['reflect', 'lightscreen', 'auroraveil', 'safeguard', 'mist', 'tailwind', 'luckychant'])
const SCREEN_TURNS: Record<string, number> = { tailwind: 4 }
const HAZARD_MAX: Record<string, number> = { spikes: 3, toxicspikes: 2, stealthrock: 1, stickyweb: 1 }

const WEATHER_ABILITY: Record<string, Weather> = { drought: 'sun', drizzle: 'rain', sandstream: 'sand', snowwarning: 'snow' }
const PRIMAL_ABILITY: Record<string, Weather> = { deltastream: 'strongwinds', desolateland: 'harshsun', primordialsea: 'heavyrain' }
const TERRAIN_ABILITY: Record<string, Terrain> = { electricsurge: 'electric', grassysurge: 'grassy', mistysurge: 'misty', psychicsurge: 'psychic' }
const WEATHER_ROCK: Partial<Record<Weather, string>> = { sun: 'heatrock', rain: 'damprock', sand: 'smoothrock', snow: 'icyrock' }
const BASE_TURNS = 5
const EXTENDED_TURNS = 8
const MAX_HISTORY = 30

const zeroBoosts = (): BoostTable => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
const newMon = (hp: number): MonState => ({ hp, megaOn: false, megaUsed: false, status: '', toxicTurn: 0, volatiles: {}, boosts: zeroBoosts() })
const newAction = (): ActionState => ({ kind: 'move', move: '', target: 0, switchTo: null, useMega: false, amount: null })

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
  const signature = computed(() => JSON.stringify([entry.picks.value, mineSlots.value.map((s) => s.species + s.item), oppSlots.value.map((s) => s.species)]))

  const slotsOf = (side: BattleSide) => (side === 'mine' ? mineSlots.value : oppSlots.value)
  const resolveAt = (side: BattleSide, idx: number | null, megaOverride?: boolean): ResolvedSlot | null => {
    if (idx == null || !state.value) return null
    const mon = state.value.sides[side].mons[idx]
    return calc.resolve(slotsOf(side)[idx], megaOverride ?? mon?.megaOn ?? false)
  }
  const maxHp = (side: BattleSide, idx: number) => resolveAt(side, idx)?.stats.hp || 0

  // ── 초기화 ─────────────
  const reset = () => {
    const mons = (side: BattleSide) =>
      slotsOf(side).map((s) => newMon(side === 'mine' ? calc.resolve(s, false)?.stats.hp || 0 : 100))
    state.value = {
      signature: signature.value,
      turn: 1,
      weather: { key: '', cur: 0, total: BASE_TURNS, permanent: false, source: null },
      terrain: { key: '', cur: 0, total: BASE_TURNS },
      rooms: {},
      fairyLock: 0,
      sides: {
        mine: { mons: mons('mine'), active: Array(N).fill(null), revealed: [], hazards: {}, screens: {} },
        opp: { mons: mons('opp'), active: Array(N).fill(null), revealed: [], hazards: {}, screens: {} },
      },
      actions: { mine: Array.from({ length: N }, newAction), opp: Array.from({ length: N }, newAction) },
      inflict: { mine: '', opp: '' },
      observedOrder: 'unknown',
      hitItemUsed: false,
      hitItemNote: '',
      focus: { mine: 0, opp: 0 },
      preview: null,
      history: [],
    }
    // 내 선출 순서대로 필드에 내보냄
    for (let k = 0; k < N && k < mineSlots.value.length; k++) sendOut('mine', k, k)
  }
  const ensure = () => {
    if (!state.value || state.value.signature !== signature.value) reset()
  }

  // ── 등장 / 교체 ─────────────
  const isFainted = (side: BattleSide, idx: number) => (state.value?.sides[side].mons[idx]?.hp ?? 1) <= 0

  function sendOut(side: BattleSide, slot: number, idx: number) {
    const s = state.value!
    const sd = s.sides[side]
    if (isFainted(side, idx) || sd.active.includes(idx)) return
    const prev = sd.active[slot]
    if (prev != null) {
      const out = sd.mons[prev]!
      out.boosts = zeroBoosts() // 교체 시 랭크·특수 상태 초기화
      out.volatiles = {}
      if (s.weather.source && s.weather.source[0] === side && s.weather.source[1] === prev) clearWeather()
      s.observedOrder = 'unknown'
    }
    sd.active[slot] = idx
    if (side === 'opp' && !sd.revealed.includes(idx)) sd.revealed.push(idx)
    onEnter(side, idx)
  }

  // 등장 시 특성 발동 (날씨/필드). 원시 날씨는 다른 날씨로 덮이지 않는다.
  function onEnter(side: BattleSide, idx: number) {
    const s = state.value!
    const r = resolveAt(side, idx)
    if (!r) return
    const ab = r.ability
    if (PRIMAL_ABILITY[ab]) setWeather(PRIMAL_ABILITY[ab]!, { permanent: true, source: [side, idx] })
    else if (WEATHER_ABILITY[ab] && !s.weather.permanent) setWeather(WEATHER_ABILITY[ab]!, { item: r.slot.item })
    if (TERRAIN_ABILITY[ab]) setTerrain(TERRAIN_ABILITY[ab]!, r.slot.item)
  }

  // ── 날씨 / 필드 / 공간 ─────────────
  function setWeather(key: Weather, opts: { permanent?: boolean; source?: [BattleSide, number]; item?: string } = {}) {
    const w = state.value!.weather
    w.key = key
    w.cur = 0
    w.total = opts.item && WEATHER_ROCK[key] === opts.item ? EXTENDED_TURNS : BASE_TURNS
    w.permanent = !!opts.permanent
    w.source = opts.source || null
  }
  function clearWeather() {
    Object.assign(state.value!.weather, { key: '', cur: 0, total: BASE_TURNS, permanent: false, source: null })
  }
  function setTerrain(key: Terrain, item?: string) {
    Object.assign(state.value!.terrain, { key, cur: 0, total: item === 'terrainextender' ? EXTENDED_TURNS : BASE_TURNS })
  }
  const toggleWeather = (key: Weather) => (state.value!.weather.key === key ? clearWeather() : setWeather(key))
  const toggleTerrain = (key: Terrain) =>
    state.value!.terrain.key === key ? Object.assign(state.value!.terrain, { key: '', cur: 0 }) : setTerrain(key)
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
    if (m.volatiles[key]) delete m.volatiles[key]
    else m.volatiles[key] = 1
  }
  const changeBoost = (side: BattleSide, idx: number, key: BoostKey, delta: number) => {
    const m = mon(side, idx)
    m.boosts[key] = clampBoost(m.boosts[key] + delta)
  }
  const setMega = (side: BattleSide, idx: number, on: boolean) => {
    const m = mon(side, idx)
    if (m.megaUsed) return
    m.megaOn = on
    if (on && state.value!.sides[side].active.includes(idx)) onEnter(side, idx) // 메가진화로 특성이 바뀌면 날씨 등 재발동
  }

  // 기술 효과 자동 반영 (랭크 / 날씨 / 필드 / 공간 / 설치형)
  function applyMoveEffects(moveId: string, side: BattleSide, userIdx: number, targetIdx: number | null) {
    const move = gd.move(moveId)
    if (!move) return
    const s = state.value!
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const user = resolveAt(side, userIdx)
    for (const e of move.effects as MoveEffect[]) {
      if (e.type === 'boost' && !e.chance) {
        const tSide = e.target === 'self' ? side : foe
        const tIdx = e.target === 'self' ? userIdx : targetIdx
        if (tIdx == null) continue
        for (const [k, v] of Object.entries(e.stats)) {
          if (k in zeroBoosts()) changeBoost(tSide, tIdx, k as BoostKey, v || 0)
        }
      } else if (e.type === 'weather' && !s.weather.permanent) setWeather(e.key, { item: user?.slot.item })
      else if (e.type === 'terrain') setTerrain(e.key, user?.slot.item)
      else if (e.type === 'room') s.rooms[e.key] = { cur: 0, total: BASE_TURNS }
      else if (e.type === 'side') {
        const sd = s.sides[e.side === 'self' ? side : foe]
        if (SCREENS.has(e.key)) {
          const ext = (e.key === 'reflect' || e.key === 'lightscreen' || e.key === 'auroraveil') && user?.slot.item === 'lightclay'
          sd.screens[e.key] = { cur: 0, total: ext ? EXTENDED_TURNS : SCREEN_TURNS[e.key] ?? BASE_TURNS }
        } else sd.hazards[e.key] = Math.min(e.maxStack ?? HAZARD_MAX[e.key] ?? 1, (sd.hazards[e.key] || 0) + 1)
      } else if (e.type === 'recharge') {
        mon(side, userIdx).volatiles.mustrecharge = 1
      }
    }
    if (moveId === 'haze') for (const sd of Object.values(s.sides)) for (const i of sd.active) if (i != null) sd.mons[i]!.boosts = zeroBoosts()
    if (moveId === 'fairylock') s.fairyLock = 2
    if (moveId === 'chillyreception') setWeather('snow', { item: user?.slot.item })
  }

  // ── 입력 검증 ─────────────
  const validationError = computed(() => {
    const s = state.value
    if (!s) return ''
    for (const a of s.actions.mine) {
      if (a.kind === 'move' && a.amount != null && (a.amount < 0 || a.amount > 100)) return 'errDealt'
    }
    for (const a of s.actions.opp) {
      if (a.kind !== 'move' || a.amount == null) continue
      const target = s.sides.mine.active[a.target]
      const max = target != null ? maxHp('mine', target) : 0
      if (a.amount < 0 || (max && a.amount > max)) return 'errTaken'
    }
    return ''
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
    for (const side of sides) {
      s.actions[side].forEach((a, slot) => {
        if (a.kind === 'switch' && a.switchTo != null && !s.fairyLock) sendOut(side, slot, a.switchTo)
      })
    }

    // 2. 기술 (메가진화 → 효과 → 입력한 데미지)
    for (const side of sides) {
      const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
      s.actions[side].forEach((a, slot) => {
        const userIdx = s.sides[side].active[slot]
        if (a.kind !== 'move' || userIdx == null) return
        if (a.useMega) {
          const m = mon(side, userIdx)
          if (!m.megaUsed && resolveAt(side, userIdx, true)?.isMega) {
            m.megaOn = true
            m.megaUsed = true
            onEnter(side, userIdx)
          }
        }
        const targetIdx = s.sides[foe].active[a.target] ?? null
        if (a.move) applyMoveEffects(a.move, side, userIdx, targetIdx)
        if (targetIdx != null && a.amount) {
          const t = mon(foe, targetIdx)
          if (side === 'mine') t.hp = Math.max(0, t.hp - Math.max(0, Math.min(100, a.amount)))
          else t.hp = Math.max(0, t.hp - Math.max(0, a.amount))
        }
      })
    }

    // 3. 원시 날씨의 원인이 쓰러지면 날씨 해제
    if (s.weather.source && isFainted(s.weather.source[0], s.weather.source[1])) clearWeather()

    // 4. 이번 턴 생긴 상태이상 / 특수상태 (분석 대상 칸에 적용)
    for (const side of sides) {
      const v = s.inflict[side]
      const idx = s.sides[side].active[s.focus[side]]
      if (v && idx != null) {
        if ((STATUSES as string[]).includes(v)) Object.assign(mon(side, idx), { status: v, toxicTurn: 0 })
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
        if (dmg) m.hp = side === 'mine' ? Math.max(0, m.hp - dmg) : Math.max(0, m.hp - (dmg / (max || 1)) * 100)
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
    for (const side of sides) for (const [k, c] of Object.entries(s.sides[side].screens)) tick(c, () => delete s.sides[side].screens[k])
    if (s.fairyLock > 0) s.fairyLock -= 1

    // 7. 입력값 초기화
    for (const side of sides) {
      s.actions[side].forEach((a) => {
        if (a.kind === 'switch') Object.assign(a, newAction(), { target: a.target })
        a.amount = null
        a.useMega = false
      })
    }
    s.hitItemUsed = false
    s.hitItemNote = ''
    s.turn += 1
  }

  // ── 계산용 헬퍼 ─────────────
  const fieldFor = (defSide: BattleSide): FieldState => {
    const s = state.value!
    const scr = s.sides[defSide].screens
    return {
      weather: s.weather.key,
      terrain: s.terrain.key,
      doubles: N > 1,
      gravity: !!s.rooms.gravity,
      reflect: !!scr.reflect,
      lightScreen: !!scr.lightscreen,
      auroraVeil: !!scr.auroraveil,
    }
  }
  // 필드에 살아있는 상대가 2마리 이상이면 광역기 0.75배
  const spreadActive = (defSide: BattleSide) =>
    N > 1 && state.value!.sides[defSide].active.filter((i) => i != null && !isFainted(defSide, i)).length > 1

  const combatantOf = (side: BattleSide, idx: number, megaOverride?: boolean) => {
    const r = resolveAt(side, idx, megaOverride)
    if (!r) return null
    const m = mon(side, idx)
    const active = state.value!.sides[side].active.includes(idx)
    const hp = side === 'mine' ? m.hp : Math.round((r.stats.hp * m.hp) / 100)
    return calc.combatant(r, { status: m.status, boosts: active ? m.boosts : undefined, hp })
  }

  return {
    N,
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
    changeBoost,
    setMega,
    validationError,
    canUndo,
    undo,
    executeTurn,
    fieldFor,
    spreadActive,
    combatantOf,
  }
}
