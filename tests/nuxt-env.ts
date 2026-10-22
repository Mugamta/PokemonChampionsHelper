// tests/nuxt-env.ts — composables 를 Nuxt 없이 테스트하기 위한 최소 환경
// Nuxt 자동 import(useState, computed, useI18n, useGameData ...)를 전역에 올리고 public/data 를 미리 채운다.
// 이 파일을 다른 import 보다 먼저 import 할 것 (composables 가 호출 시점에 전역을 찾는다).

import { readFileSync } from 'node:fs'
import { computed, reactive, ref, watch, type Ref } from 'vue'
import { isSpreadMove } from '../utils/damage'
import type { GameData, NameTable, TeamSlot } from '../utils/types'
import { emptySlot } from '../utils/types'

const load = (f: string) =>
  JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url), 'utf8'))
const CORE = ['pokemon', 'moves', 'abilities', 'items', 'natures', 'types', 'regulations'] as const
export const gameData = Object.fromEntries(CORE.map((f) => [f, load(f)])) as unknown as GameData
const namesKo = load('names.ko') as NameTable

const store = new Map<string, Ref>()
const g = globalThis as Record<string, unknown>
Object.assign(g, {
  ref,
  computed,
  reactive,
  watch,
  isSpreadMove,
  useState: <T>(key: string, init?: () => T) => {
    if (!store.has(key)) store.set(key, ref(init ? init() : undefined))
    return store.get(key) as Ref<T>
  },
  useI18n: () => ({ locale: ref('ko'), t: (k: string) => k }),
  usePublicAsset: () => ({ asset: (p: string) => p }),
  useRuntimeConfig: () => ({ public: {}, app: { baseURL: '/' } }),
})

// 실제 composable 을 전역으로 (서로를 자동 import 로 부르므로)
const { useGameData } = await import('../composables/useGameData')
const { useTeam } = await import('../composables/useTeam')
Object.assign(g, { useGameData, useTeam })

// 상태 초기화 + 게임 데이터 채우기 (테스트마다 호출)
export function resetNuxtState() {
  store.clear()
  ;(g.useState as (k: string, i: () => unknown) => Ref)('gd-core', () => gameData)
  ;(g.useState as (k: string, i: () => unknown) => Ref)('gd-names', () => ({ ko: namesKo }))
}

// 슬롯 간단 생성
export const slot = (species: string, extra: Partial<TeamSlot> = {}): TeamSlot => ({
  ...emptySlot(),
  species,
  ability: extra.ability || gameData.pokemon[species]!.abilities[0]!,
  ...extra,
})
