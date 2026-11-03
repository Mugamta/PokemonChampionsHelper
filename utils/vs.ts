// utils/vs.ts — VS 화면(1:1 계산기)의 상태 형식과 순수 계산 (필드 변환, 행동 순서)

import type { FieldState } from './damage'
import {
  emptySlot,
  type BoostKey,
  type Move,
  type Status,
  type TeamSlot,
  type Terrain,
  type Weather,
} from './types'

export type VsSide = 'left' | 'right'

// 한쪽 포켓몬. 기술은 slot.moves[0] 하나만 쓴다 (파티 슬롯과 같은 계산 함수를 쓰려고 TeamSlot 그대로)
export interface VsMon {
  slot: TeamSlot
  megaOn: boolean
  altOn: boolean | null // 배틀 폼 (null = 기본값, useTeamCalc)
  status: Status
  boosts: Record<BoostKey, number>
  hpPct: number // 현재 HP (%)
  crit: boolean // 이 포켓몬의 공격을 급소로 계산
  // 이 포켓몬 쪽 진영 상태
  reflect: boolean
  lightScreen: boolean
  auroraVeil: boolean
  tailwind: boolean
  // 더블 전용
  helpingHand: boolean // 아군의 도우미를 받고 공격
  friendGuard: boolean // 아군이 프렌드가드
}

// 양쪽 공용 상태
export interface VsField {
  weather: Weather
  terrain: Terrain
  rooms: { trickroom: boolean; magicroom: boolean; wonderroom: boolean; gravity: boolean }
  doubles: boolean
}

export interface VsState {
  left: VsMon
  right: VsMon
  field: VsField
}

export const emptyVsMon = (): VsMon => ({
  slot: emptySlot(),
  megaOn: true,
  altOn: null,
  status: '',
  boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  hpPct: 100,
  crit: false,
  reflect: false,
  lightScreen: false,
  auroraVeil: false,
  tailwind: false,
  helpingHand: false,
  friendGuard: false,
})

export const emptyVsField = (): VsField => ({
  weather: '',
  terrain: '',
  rooms: { trickroom: false, magicroom: false, wonderroom: false, gravity: false },
  doubles: false,
})

export const emptyVs = (): VsState => ({
  left: emptyVsMon(),
  right: emptyVsMon(),
  field: emptyVsField(),
})

// 공용 상태 + 맞는 쪽 진영 상태 → 데미지 계산용 필드
export const vsFieldState = (f: VsField, defender?: VsMon): FieldState => ({
  weather: f.weather,
  terrain: f.terrain,
  doubles: f.doubles,
  gravity: f.rooms.gravity,
  wonderRoom: f.rooms.wonderroom,
  magicRoom: f.rooms.magicroom,
  reflect: !!defender?.reflect,
  lightScreen: !!defender?.lightScreen,
  auroraVeil: !!defender?.auroraVeil,
  friendGuard: f.doubles && !!defender?.friendGuard,
})

// 현재 HP 실수치 (최소 1)
export const hpFromPct = (maxHp: number, pct: number) =>
  Math.max(1, Math.min(maxHp, Math.floor((maxHp * pct) / 100)))

// 우선도 (질풍날개: HP 가득일 때 비행 기술 +1 / 힐링시프트: 회복 기술 +3). 공격 기술만 고르므로 장난꾸러기는 없음
export const vsPriority = (move: Move | null, ability: string, fullHp: boolean) => {
  if (!move) return 0
  let p = move.priority
  if (ability === 'galewings' && move.type === 'flying' && fullHp) p += 1
  if (ability === 'triage' && move.effects.some((e) => e.type === 'heal' || e.type === 'drain'))
    p += 3
  return p
}

export interface VsOrder {
  first: VsSide | null // null = 같은 속도 (무작위)
  reason: 'priority' | 'speed' | 'trickroom' | 'tie'
}

// 행동 순서: 우선도 → 스피드 (트릭룸이면 느린 쪽부터)
export function vsOrder(
  left: { speed: number; priority: number },
  right: { speed: number; priority: number },
  trickRoom: boolean,
): VsOrder {
  if (left.priority !== right.priority)
    return { first: left.priority > right.priority ? 'left' : 'right', reason: 'priority' }
  if (left.speed === right.speed) return { first: null, reason: 'tie' }
  const leftFaster = left.speed > right.speed
  return {
    first: leftFaster !== trickRoom ? 'left' : 'right',
    reason: trickRoom ? 'trickroom' : 'speed',
  }
}
