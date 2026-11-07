// 기술 도감 표시용 헬퍼 (utils/moveInfo.ts)
import { describe, expect, it } from 'vitest'
import { effectLabels, hasAccuracyCol, learnerMap, shownFlags } from '../utils/moveInfo'
import type { Move } from '../utils/types'

// 키와 인자를 그대로 보여 주는 번역 함수
const t = (key: string, params?: Record<string, unknown>) =>
  params
    ? `${key}(${Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')})`
    : key

const mv = (p: Partial<Move>): Move => ({
  id: 'x',
  num: 0,
  type: 'normal',
  category: 'physical',
  power: 80,
  accuracy: 100,
  pp: 16,
  priority: 0,
  target: 'normal',
  flags: [],
  effects: [],
  ...p,
})

describe('effectLabels', () => {
  it('확률 효과는 100% 미만일 때만 확률을 붙인다', () => {
    const m = mv({
      effects: [
        { type: 'status', target: 'target', status: 'par', chance: 10 },
        { type: 'boost', target: 'target', stats: { spd: -2 }, chance: 100 },
      ],
    })
    expect(effectLabels(m, t, (id) => id)).toEqual([
      'dex.mv.fx.chance(text=dex.mv.fx.target(text=status.par),p=10)',
      'dex.mv.fx.target(text=stat.spd −2)',
    ])
  })
  it('반동·연속기·설치기', () => {
    const m = mv({
      effects: [
        { type: 'recoil', ratio: 0.33 },
        { type: 'multihit', min: 2, max: 5 },
        { type: 'side', side: 'foe', key: 'spikes', maxStack: 3 },
        { type: 'room', key: 'fairylock' },
      ],
    })
    expect(effectLabels(m, t, (id) => 'name:' + id)).toEqual([
      'dex.mv.fx.recoil(p=33)',
      'dex.mv.fx.hitsRange(min=2,max=5)',
      'dex.mv.fx.maxStack(text=dex.mv.fx.side.foe(name=side.spikes),n=3)',
      'name:fairylock',
    ])
  })
})

describe('기타', () => {
  it('자신·필드 대상 변화기는 명중 칸이 없다', () => {
    expect(hasAccuracyCol(mv({ accuracy: null, target: 'self' }))).toBe(false)
    expect(hasAccuracyCol(mv({ accuracy: null, target: 'normal' }))).toBe(true)
  })
  it('내부 플래그는 숨긴다', () => {
    expect(shownFlags(mv({ flags: ['contact', 'noparentalbond'] }))).toEqual(['contact'])
  })
  it('배우는 포켓몬에서 메가는 뺀다', () => {
    const map = learnerMap([
      { id: 'a', learnset: ['tackle', 'ember'] },
      { id: 'amega', learnset: ['tackle'], mega: true },
      { id: 'b', learnset: ['tackle'] },
    ])
    expect(map.get('tackle')).toEqual(['a', 'b'])
    expect(map.get('ember')).toEqual(['a'])
  })
})
