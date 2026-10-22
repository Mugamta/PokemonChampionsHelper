// utils/speedInference.ts — 상대 스피드 추정 (선후공을 볼 때마다 범위를 좁힌다)
//
// 상대 스피드의 미지수 = 능력 포인트(SP 0~32) × 성격(무보정 / 스피드 보정) × 구애스카프(없음 / 있음)
// → 4개 "구간": 무보정 / 보정 / 무보정+스카프 / 보정+스카프
// 구간마다 가능한 SP 범위 [lo, hi] 를 들고 있다가, 선후공을 볼 때마다 그때의 내 스피드와 비교해 좁힌다.
//   상대가 먼저 → 상대 실전 스피드 ≥ 내 스피드 (동속은 무작위라 같을 수 있음), 내가 먼저 → ≤ (트릭룸이면 반대)
// 범위가 비면 그 구간은 제외 → "스카프 아님 확정", "성격 보정 확정" 같은 결론.
// 스피드 하락 성격은 다루지 않는다 → 모든 구간이 제외되면 "범위 밖"(하락 성격·다른 도구·특성 가능성)

import { calcStat, effectiveSpeed } from './stats'
import type { Nature } from './types'

export type SpeedBandKey = 'neutral' | 'plus' | 'neutralScarf' | 'plusScarf'
export type SpRange = [number, number] | null // null = 제외된 구간
export type SpeedRanges = Record<SpeedBandKey, SpRange>

export interface SpeedBand {
  key: SpeedBandKey
  plus: boolean // 스피드 보정 성격
  scarf: boolean // 구애스카프
}
export const SPEED_BANDS: SpeedBand[] = [
  { key: 'neutral', plus: false, scarf: false },
  { key: 'plus', plus: true, scarf: false },
  { key: 'neutralScarf', plus: false, scarf: true },
  { key: 'plusScarf', plus: true, scarf: true },
]
const PLUS_SPE: Nature = { id: 'timid', plus: 'spe', minus: 'atk' }
const MINUS_SPE: Nature = { id: 'brave', plus: 'atk', minus: 'spe' }
export const SP_MAX = 32

export const fullRanges = (): SpeedRanges => ({
  neutral: [0, SP_MAX],
  plus: [0, SP_MAX],
  neutralScarf: [0, SP_MAX],
  plusScarf: [0, SP_MAX],
})

// 실전 스피드 계산에 필요한 그때의 상태 (도구는 구간이 정함)
export interface SpeedEnv {
  boost?: number
  status?: string
  ability?: string
  weather?: string
  terrain?: string
  tailwind?: boolean
  itemLost?: boolean // 도구를 잃음 (곡예 판정, 스카프 무효)
  magicRoom?: boolean // 매직룸 (스카프 무효)
  fixedStat?: number // 변신(메타몽)처럼 스피드 실능치가 정해진 경우 (SP·성격 무시)
}

// 구간 band 에서 SP 가 sp 일 때의 실전 스피드
export function bandSpeed(base: number, band: SpeedBand, sp: number, env: SpeedEnv): number {
  const stat = env.fixedStat ?? calcStat('spe', base, sp, band.plus ? PLUS_SPE : null)
  return speedFromStat(stat, band.scarf, env)
}
function speedFromStat(stat: number, scarf: boolean, env: SpeedEnv): number {
  const scarfOn = scarf && !env.itemLost && !env.magicRoom
  return effectiveSpeed(stat, {
    boost: env.boost,
    status: env.status,
    ability: env.ability,
    weather: env.weather,
    terrain: env.terrain,
    tailwind: env.tailwind,
    itemLost: env.itemLost,
    item: scarfOn ? 'choicescarf' : '',
  })
}

// 가능한 SP 범위 → 실전 스피드 범위 (SP 가 클수록 빠르므로 양 끝만 보면 됨)
export function bandSpeedRange(
  base: number,
  band: SpeedBand,
  range: SpRange,
  env: SpeedEnv,
): [number, number] | null {
  if (!range) return null
  return [bandSpeed(base, band, range[0], env), bandSpeed(base, band, range[1], env)]
}

// 선후공 관찰 1번으로 좁히기. oppAtLeast: 상대 실전 스피드 ≥ 내 스피드 (false 면 ≤)
export function narrowRanges(
  ranges: SpeedRanges,
  base: number,
  env: SpeedEnv,
  mySpeed: number,
  oppAtLeast: boolean,
): SpeedRanges {
  const out = { ...ranges }
  for (const band of SPEED_BANDS) {
    const r = ranges[band.key]
    if (!r) continue
    const ok: number[] = []
    for (let sp = r[0]; sp <= r[1]; sp++) {
      const v = bandSpeed(base, band, sp, env)
      if (oppAtLeast ? v >= mySpeed : v <= mySpeed) ok.push(sp)
    }
    out[band.key] = ok.length ? [ok[0]!, ok[ok.length - 1]!] : null
  }
  return out
}

// 결론: 스카프 여부 / 성격 보정 여부 확정, 전부 제외
export interface SpeedVerdict {
  scarf: boolean | null // true = 스카프 확정, false = 스카프 아님 확정, null = 모름
  plus: boolean | null // true = 스피드 보정 성격 확정, false = 무보정 확정
  none: boolean // 모든 구간 제외 (가정 밖: 하락 성격·철구·다른 특성 등)
}
export function speedVerdict(ranges: SpeedRanges): SpeedVerdict {
  const alive = SPEED_BANDS.filter((b) => ranges[b.key])
  const none = alive.length === 0
  const all = (f: (b: SpeedBand) => boolean) => alive.length > 0 && alive.every(f)
  return {
    none,
    scarf: all((b) => b.scarf) ? true : all((b) => !b.scarf) ? false : null,
    plus: all((b) => b.plus) ? true : all((b) => !b.plus) ? false : null,
  }
}

// 남아 있는 구간에서 가능한 가장 작은 SP (다른 능력치 배분의 상한 계산용)
export const minSpeedSp = (ranges: SpeedRanges) => {
  const lows = SPEED_BANDS.map((b) => ranges[b.key]?.[0]).filter((v): v is number => v != null)
  return lows.length ? Math.min(...lows) : 0
}

// ── 선후공 판정 ─────────────
// 상대 실전 스피드가 될 수 있는 범위 [최소, 최대] (남은 구간 × 가능한 특성). 남은 구간이 없으면 null
//   abilities: 상대가 가질 수 있는 특성 (모르면 그 종의 특성 전부 — 쓱쓱·엽록소 등은 날씨에 따라 2배)
//   withMinus: 스피드 하락 성격 SP 0 도 최소값에 넣는다 (구간은 하락 성격을 다루지 않으므로, 관찰 전에는 넣어야 안전)
export function oppSpeedSpan(
  base: number,
  ranges: SpeedRanges,
  env: SpeedEnv,
  abilities: readonly string[],
  withMinus: boolean,
): [number, number] | null {
  let lo = Infinity
  let hi = -Infinity
  for (const ability of abilities.length ? abilities : [env.ability ?? '']) {
    const e = { ...env, ability }
    for (const band of SPEED_BANDS) {
      const r = bandSpeedRange(base, band, ranges[band.key], e)
      if (!r) continue
      lo = Math.min(lo, r[0])
      hi = Math.max(hi, r[1])
      if (withMinus && !band.plus && env.fixedStat == null)
        lo = Math.min(lo, speedFromStat(calcStat('spe', base, 0, MINUS_SPE), band.scarf, e))
    }
  }
  return lo === Infinity ? null : [lo, hi]
}

// 내 스피드와 상대 스피드 범위 비교: faster = 'mine' | 'opp' (확정, 같을 수도 있으면 tiePossible),
// 'tie' (반드시 동속), null (범위가 내 스피드를 사이에 둠 → 모름)
export function compareSpeed(
  mySpeed: number,
  span: [number, number],
): { faster: 'mine' | 'opp' | 'tie' | null; tiePossible: boolean } {
  const [lo, hi] = span
  if (lo === mySpeed && hi === mySpeed) return { faster: 'tie', tiePossible: true }
  if (hi <= mySpeed) return { faster: 'mine', tiePossible: hi === mySpeed }
  if (lo >= mySpeed) return { faster: 'opp', tiePossible: lo === mySpeed }
  return { faster: null, tiePossible: true }
}
