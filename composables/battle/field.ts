// composables/battle/field.ts
// 날씨 / 필드 / 공간 / 벽·설치기 바꾸기 (기술·특성 효과와 화면 토글이 같이 쓴다)

import type { Terrain, Weather } from '~/utils/types'
import {
  BASE_TURNS,
  EXTENDED_TURNS,
  HAZARD_MAX,
  SCREEN_TURNS,
  SCREENS,
  WEATHER_ROCK,
  type BattleSide,
  type Counter,
} from '~/utils/battleState'
import type { BattleCore } from '~/composables/battle/core'

export function createField(b: BattleCore) {
  const { state } = b

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

  return {
    setWeather,
    clearWeather,
    setTerrain,
    toggleWeather,
    toggleTerrain,
    toggleRoom,
    adjustCounter,
    toggleSideCondition,
  }
}

export type BattleField = ReturnType<typeof createField>
