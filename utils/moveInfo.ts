// utils/moveInfo.ts — 기술 도감(pages/dex.vue 기술 탭) 표시용
//   부가효과: moves.json 의 effects 를 화면 문구로 (번역 함수를 받아서 — 키는 i18n dex.mv.fx.*)
//   배우는 포켓몬: 출전 가능 포켓몬 목록에서 이 기술을 배우는 원종·리전폼 (메가는 원종과 습득 기술이 같아서 뺌)

import type { Move, MoveEffect } from './types'

export type Translate = (key: string, params?: Record<string, unknown>) => string

// ── 대상 / 성질 ─────────────
// 명중 칸이 의미 없는 대상 (자신·필드에 거는 기술)
const NO_ACC_TARGETS = new Set([
  'self',
  'allySide',
  'foeSide',
  'all',
  'allies',
  'allyTeam',
  'adjacentAllyOrSelf',
])
export const hasAccuracyCol = (m: Move) => m.accuracy != null || !NO_ACC_TARGETS.has(m.target)

// 표시하지 않는 내부 플래그
const HIDDEN_FLAGS = new Set(['noparentalbond'])
export const shownFlags = (m: Move) => m.flags.filter((f) => !HIDDEN_FLAGS.has(f))

// 성질마다 반응하는 특성·도구 (툴팁에 이름을 붙임 — 현재 데이터에 있는 것만 표시)
export const FLAG_RELATED: Record<string, { kind: 'abilities' | 'items' | 'moves'; id: string }[]> =
  {
    contact: [
      { kind: 'abilities', id: 'roughskin' },
      { kind: 'abilities', id: 'ironbarbs' },
      { kind: 'abilities', id: 'toughclaws' },
      { kind: 'abilities', id: 'unseenfist' },
      { kind: 'items', id: 'rockyhelmet' },
      { kind: 'items', id: 'protectivepads' },
    ],
    bullet: [{ kind: 'abilities', id: 'bulletproof' }],
    slicing: [{ kind: 'abilities', id: 'sharpness' }],
    wind: [
      { kind: 'abilities', id: 'windrider' },
      { kind: 'abilities', id: 'windpower' },
    ],
    sound: [
      { kind: 'abilities', id: 'soundproof' },
      { kind: 'abilities', id: 'punkrock' },
      { kind: 'abilities', id: 'liquidvoice' },
    ],
    reflectable: [
      { kind: 'abilities', id: 'magicbounce' },
      { kind: 'moves', id: 'magiccoat' },
    ],
    pulse: [{ kind: 'abilities', id: 'megalauncher' }],
    bite: [{ kind: 'abilities', id: 'strongjaw' }],
    punch: [
      { kind: 'abilities', id: 'ironfist' },
      { kind: 'items', id: 'punchingglove' },
    ],
    powder: [
      { kind: 'abilities', id: 'overcoat' },
      { kind: 'items', id: 'safetygoggles' },
    ],
    charge: [{ kind: 'items', id: 'powerherb' }],
  }

// ── 부가효과 문구 ─────────────
const pct = (r: number) => Math.round(r * 100)

export function effectLabel(e: MoveEffect, t: Translate, moveName: (id: string) => string): string {
  const withChance = (text: string, chance?: number) =>
    chance != null && chance < 100 ? t('dex.mv.fx.chance', { text, p: chance }) : text
  switch (e.type) {
    case 'boost': {
      const stats = Object.entries(e.stats)
        .map(([k, v]) => `${t('stat.' + k)} ${v! > 0 ? '+' : '−'}${Math.abs(v!)}`)
        .join(' ')
      return withChance(t('dex.mv.fx.' + e.target, { text: stats }), e.chance)
    }
    case 'status':
      return withChance(t('dex.mv.fx.' + e.target, { text: t('status.' + e.status) }), e.chance)
    case 'volatile': {
      const name = e.status === 'flinch' ? t('battle.chance.flinch') : t('volatile.' + e.status)
      return withChance(t('dex.mv.fx.target', { text: name }), e.chance)
    }
    case 'multihit':
      return e.min === e.max
        ? t('dex.mv.fx.hits', { n: e.min })
        : t('dex.mv.fx.hitsRange', { min: e.min, max: e.max })
    case 'recoil':
    case 'drain':
    case 'heal':
      return t('dex.mv.fx.' + e.type, { p: pct(e.ratio) })
    case 'crit':
      return t('dex.mv.fx.crit', { n: e.stage })
    case 'recharge':
      return t('dex.mv.fx.recharge')
    case 'weather':
      return t('dex.mv.fx.weather', { name: t('weather.' + e.key) })
    case 'terrain':
      return t('terrain.' + e.key)
    case 'room':
      // 페어리록은 공간 이름이 따로 없어서 기술 이름으로
      return e.key === 'fairylock' ? moveName(e.key) : t('room.' + e.key)
    case 'side': {
      const text = t('dex.mv.fx.side.' + e.side, { name: t('side.' + e.key) })
      return e.maxStack ? t('dex.mv.fx.maxStack', { text, n: e.maxStack }) : text
    }
  }
}

export const effectLabels = (m: Move, t: Translate, moveName: (id: string) => string) =>
  m.effects.map((e) => effectLabel(e, t, moveName))

// ── 배우는 포켓몬 ─────────────
export interface LearnerSource {
  id: string
  learnset: string[]
  mega?: boolean
}
// 기술 id → 배우는 포켓몬 id (목록 순서 유지)
export function learnerMap(mons: LearnerSource[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const m of mons) {
    if (m.mega) continue
    for (const mv of m.learnset) {
      const list = out.get(mv)
      if (list) list.push(m.id)
      else out.set(mv, [m.id])
    }
  }
  return out
}
