// utils/accuracy.ts — 명중률 / 급소율 (9세대, Showdown 기준)
//   명중: 기술 명중 × 특성(복안 1.3, 의욕 물리 0.8, 노가드 필중) × 도구(광각렌즈 1.1, 줌렌즈 나중 행동 1.2)
//         × 방어 측(모래숨기·눈숨기 날씨 0.8, 반짝가루 0.9) × 날씨(번개·폭풍 비 필중·쾌청 50, 눈보라 설경 필중) × 중력 5/3
//         × 명중·회피 랭크 (공격 측 명중 − 맞는 쪽 회피, ±6, +n → (3+n)/3, −n → 3/(3+n)).
//           천진은 상대의 명중·회피 랭크를 무시, 날카로운눈·심안은 상대 회피 랭크를 무시
//   급소: 단계 0 = 1/24, 1 = 1/8, 2 = 1/2, 3 이상 = 확정
//         단계 = 기술(급소율 높은 기술) + 대운 + 초점렌즈 + 대파(파오리·창파나이트) + 기충전 2

import type { Combatant, DamageOptions, FieldState } from './damage'
import type { Move } from './types'

const ALWAYS_CRIT = new Set([
  'surgingstrikes',
  'wickedblow',
  'flowertrick',
  'frostbreath',
  'stormthrow',
])
const CRIT_IMMUNE = new Set(['battlearmor', 'shellarmor'])
const RAIN = new Set(['rain', 'heavyrain'])
const SUN = new Set(['sun', 'harshsun'])

// 명중 확률 (0~1). 필중이면 1
export function hitChance(
  move: Move,
  atk: Combatant,
  def: Combatant,
  field: FieldState = {},
  opts: DamageOptions = {},
): number {
  if (move.category === 'status' && move.accuracy == null) return 1
  if (atk.ability === 'noguard' || def.ability === 'noguard') return 1
  const w = field.weather || ''
  let acc = move.accuracy
  if ((move.id === 'thunder' || move.id === 'hurricane') && RAIN.has(w)) return 1
  if (move.id === 'blizzard' && w === 'snow') return 1
  if ((move.id === 'thunder' || move.id === 'hurricane') && SUN.has(w)) acc = 50
  if (acc == null) return 1
  let a = acc
  const accStage = def.ability === 'unaware' ? 0 : (atk.boosts?.accuracy ?? 0)
  const evaStage = ['unaware', 'keeneye', 'mindseye'].includes(atk.ability)
    ? 0
    : (def.boosts?.evasion ?? 0)
  const st = Math.max(-6, Math.min(6, accStage - evaStage))
  a *= st >= 0 ? (3 + st) / 3 : 3 / (3 - st)
  if (atk.ability === 'compoundeyes') a *= 1.3
  if (atk.ability === 'hustle' && move.category === 'physical') a *= 0.8
  if (def.ability === 'sandveil' && w === 'sand') a *= 0.8
  if (def.ability === 'snowcloak' && w === 'snow') a *= 0.8
  if (def.item === 'brightpowder') a *= 0.9
  if (atk.item === 'widelens') a *= 1.1
  if (atk.item === 'zoomlens' && opts.movesLast) a *= 1.2
  if (field.gravity) a *= 5 / 3
  return Math.max(0, Math.min(1, a / 100))
}

// 급소 단계
export function critStage(move: Move, atk: Combatant, opts: DamageOptions = {}): number {
  let st = 0
  for (const e of move.effects) if (e.type === 'crit') st += e.stage
  if (atk.ability === 'superluck') st += 1
  if (atk.item === 'scopelens') st += 1
  if (
    atk.item === 'leek' &&
    ['farfetchd', 'sirfetchd'].includes(atk.species.base || atk.species.id)
  )
    st += 2
  if (opts.focusEnergy) st += 2
  return st
}

// 급소 확률 (0~1)
export function critChance(
  move: Move,
  atk: Combatant,
  def: Combatant,
  opts: DamageOptions = {},
): number {
  if (CRIT_IMMUNE.has(def.ability) && atk.ability !== 'moldbreaker') return 0
  if (ALWAYS_CRIT.has(move.id) || opts.crit) return 1
  if (atk.ability === 'merciless' && (def.status === 'psn' || def.status === 'tox')) return 1
  const st = critStage(move, atk, opts)
  return st >= 3 ? 1 : st === 2 ? 1 / 2 : st === 1 ? 1 / 8 : 1 / 24
}
