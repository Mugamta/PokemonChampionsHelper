// utils/teamRecommend.ts — 추천 파티 만들기 (파티 화면 다이얼로그, components/team/Recommend*.vue)
//
// 자동 추천 (recommendTeam) — 두 단계로 6마리를 채운다:
//   1) 핵심: 시작 멤버(첫 포켓몬 / 직접 고른 포켓몬) + 함께 가장 자주 쓰인 포켓몬을 핵심 수(settings.coreMates)까지
//      (한 마리씩, 지금 멤버들과 같은 파티에 함께 쓴 비율의 평균이 가장 높은 포켓몬)
//   2) 대비: 핵심 멤버들에게 두루 강한 상대(위협)를 물러나게 하는 포켓몬으로 나머지를 채운다
//      예) 킬라플로르·스트린더가 핵심이면 둘 다 잡는 한카리아스가 위협 → 한카리아스를 물러나게 하는 누리레느
// 직접 고르기 — suggestNext (지금 멤버 기준 다음 후보: 함께 쓰인 순 / 위협 대비 순), memberInfo (포켓몬 하나의
//   같이 쓰인 포켓몬 · 불리한 상대 · 그 상대에게 강한 포켓몬)
//
// 우위 adv(A, B) = A 가 B 를 만났을 때 물러난 비율 − A 의 평균 물러남 비율 (원래 잘 빠지는 포켓몬이 튀지 않게)
// 위협 점수(T) = Σ 멤버 M 의 max(0, adv(M, T)) × 그런 멤버 수 (여러 멤버에게 강할수록 높게) → 상위 settings.threats
// 대비 점수(C) = Σ 위협 점수(T) × max(0, adv(T, C) − 이미 파티에 있는 멤버의 최고 adv(T))
//   → 이미 누가 맡은 위협은 점수가 줄어 다른 위협을 맡을 포켓몬을 고른다
//   대비 단계 점수 = 대비 점수와 함께 쓴 비율을 그 차례 후보 중 최댓값으로 나눠 0~1 로 맞춘 뒤
//   settings.counter : (1 − settings.counter) 로 가중합
// 같은 종(전국도감 번호)은 한 마리, 메가 폼은 settings.maxMega 마리까지. 점수가 같으면 채용률 높은 순
// 대면 자료: stats/*-vs.json (Smogon "Checks and Counters", utils/usageStats.ts). 없으면 함께 쓴 비율만으로 고른다.

import type { UsageTable } from './autoSet'
import { slotSpecies } from './teamSuggest'
import type { Pokemon } from './types'
import { VS_RANK_MIN, type StatsVs, type VsRow } from './usageStats'

// ── 설정 ─────────────
export interface RecSettings {
  /** 핵심으로 넣을 "함께 자주 쓰인 포켓몬" 수 (시작 멤버 제외) */
  coreMates: number
  /** 위협으로 볼 상대 수 (최대) */
  threats: number
  /** 대비 단계에서 위협 대비의 비중 0~1 (나머지는 함께 쓴 비율) */
  counter: number
  /** 메가 폼 최대 수 */
  maxMega: number
}
export const REC_DEFAULTS: RecSettings = { coreMates: 2, threats: 6, counter: 0.7, maxMega: 2 }
/** 설정마다 [최소, 최대, 단계] */
export const REC_LIMITS: Record<keyof RecSettings, [number, number, number]> = {
  coreMates: [0, 5, 1],
  threats: [1, 12, 1],
  counter: [0, 1, 0.1],
  maxMega: [0, 6, 1],
}
export const REC_SETTING_KEYS = Object.keys(REC_DEFAULTS) as (keyof RecSettings)[]
/** 저장된 값 등 → 범위 안의 설정 (잘못된 값은 기본값) */
export function normalizeRecSettings(raw: unknown): RecSettings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...REC_DEFAULTS }
  for (const k of REC_SETTING_KEYS) {
    const v = Number(src[k])
    if (src[k] == null || src[k] === '' || !Number.isFinite(v)) continue
    const [min, max, step] = REC_LIMITS[k]
    const snapped = Math.round(v / step) * step
    out[k] = Math.min(max, Math.max(min, Number(snapped.toFixed(2))))
  }
  return out
}

/** 이유로 보여줄 함께 쓴 비율의 최소값 */
const MATE_MIN = 0.05

// ── 형식 ─────────────
export interface RecBase {
  table: UsageTable
  vs: StatsVs | null
  pokemon: Record<string, Pokemon>
  /** 슬롯에 넣을 id(메가 폼은 원종)로 출전 가능 여부 */
  allowed: (species: string) => boolean
  /** 고르지 않을 폼 id */
  exclude?: readonly string[]
  settings?: RecSettings
}

export interface RecThreat {
  id: string
  /** 이 상대를 만나면 물러난 멤버 [멤버, 물러난 비율] (높은 순) */
  beats: [string, number][]
  /** 이 위협을 가장 잘 물러나게 하는 멤버 (없으면 null) */
  by: string | null
  /** by 를 만났을 때 이 위협이 물러난 비율 */
  byOut: number
}

export interface RecPick {
  id: string
  /** lead = 첫 포켓몬, picked = 직접 고른 포켓몬, core = 함께 자주 쓰인 포켓몬, counter = 위협 대비 */
  role: 'lead' | 'picked' | 'core' | 'counter'
  /** 함께 쓴 비율이 높은 앞 멤버 [멤버, 비율] (많은 순 최대 2) */
  mates: [string, number][]
  /** 이 포켓몬이 물러나게 하는 위협 [위협, 위협의 물러남 비율] (높은 순 최대 2, 대비 멤버만) */
  counters: [string, number][]
}

export interface RecommendResult {
  picks: RecPick[]
  threats: RecThreat[]
}

// ── 대면 도우미 ─────────────
/** 비율을 믿을 만한 줄만 (맞대결 수가 VS_RANK_MIN 과 최다 상대의 10% 이상, rankedMatchups 와 같은 기준) */
const reliable = (rows: readonly VsRow[] | undefined): VsRow[] => {
  if (!rows?.length) return []
  const minN = Math.max(VS_RANK_MIN, Math.max(...rows.map((r) => r[1])) * 0.1)
  return rows.filter((r) => r[1] >= minN)
}
/** 한 포켓몬의 대면 기록: 평균 물러남 비율 + 상대별 물러남 비율 (맞대결 많은 순) */
interface VsOf {
  mean: number
  out: Map<string, number>
}
const vsOf = (vs: StatsVs | null, id: string): VsOf => {
  const rows = reliable(vs?.[id])
  const n = rows.reduce((a, r) => a + r[1], 0)
  return {
    mean: n ? rows.reduce((a, r) => a + r[1] * r[2], 0) / n : 0,
    out: new Map(rows.map((r) => [r[0], r[2]])),
  }
}

interface Threat {
  id: string
  beats: [string, number][]
  score: number
}

// 공용 계산 (한 번의 추천 동안 대면 기록을 캐시)
function context(base: RecBase) {
  const { table, vs, pokemon, allowed } = base
  const settings = base.settings ?? REC_DEFAULTS
  const exclude = new Set(base.exclude ?? [])
  const usage = (id: string) => table.pokemon[id]?.usage ?? 0
  const mate = (m: string, c: string) => table.pokemon[m]?.teammates?.[c] ?? 0
  const cache = new Map<string, VsOf>()
  const rec = (id: string) => {
    let v = cache.get(id)
    if (!v) cache.set(id, (v = vsOf(vs, id)))
    return v
  }
  /** a 가 b 를 만났을 때의 우위 (기록이 없으면 0) */
  const adv = (a: string, b: string) => {
    const r = rec(a)
    const o = r.out.get(b)
    return o == null ? 0 : o - r.mean
  }
  const isMega = (id: string) => !!pokemon[id]?.mega
  /** 파티에 더 넣을 수 있는 통계 표의 포켓몬 */
  const candidates = (team: readonly string[]) => {
    const nums = new Set(team.map((id) => pokemon[id]?.num))
    const megas = team.filter(isMega).length
    return Object.keys(table.pokemon).filter((id) => {
      const p = pokemon[id]
      if (!p || nums.has(p.num) || exclude.has(id) || !allowed(slotSpecies(pokemon, id)))
        return false
      return !(megas >= settings.maxMega && isMega(id))
    })
  }
  const avgMate = (team: readonly string[], id: string) =>
    team.length ? team.reduce((a, m) => a + mate(m, id), 0) / team.length : 0
  /** 멤버들에게 두루 강한 상대 (점수 높은 순, settings.threats 개) */
  const threatsOf = (members: readonly string[]): Threat[] => {
    const opponents = new Set(members.flatMap((m) => [...rec(m).out.keys()]))
    return [...opponents]
      .filter((t) => !members.includes(t))
      .map((t) => {
        const beats = members
          .filter((m) => adv(m, t) > 0)
          .map((m): [string, number] => [m, rec(m).out.get(t)!])
          .sort((a, b) => b[1] - a[1])
        const sum = members.reduce((a, m) => a + Math.max(0, adv(m, t)), 0)
        return { id: t, beats, score: sum * beats.length }
      })
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score || usage(b.id) - usage(a.id))
      .slice(0, settings.threats)
  }
  /** 위협마다 팀에서 가장 큰 우위 (0 이상) */
  const coverOf = (threats: readonly Threat[], team: readonly string[]) =>
    threats.map((t) => Math.max(0, ...team.map((m) => adv(t.id, m))))
  const gainOf = (threats: readonly Threat[], cover: readonly number[], id: string) =>
    threats.reduce((a, t, i) => a + t.score * Math.max(0, adv(t.id, id) - cover[i]!), 0)
  /** 후보가 물러나게 하는 위협 [위협, 위협의 물러남 비율] (높은 순 최대 2) */
  const countersOf = (threats: readonly Threat[], id: string) =>
    threats
      .filter((t) => adv(t.id, id) > 0)
      .map((t): [string, number] => [t.id, rec(t.id).out.get(id)!])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
  /** 화면용 위협 (가장 잘 맡는 멤버 포함) */
  const describe = (threats: readonly Threat[], team: readonly string[]): RecThreat[] =>
    threats.map((t) => {
      let by: string | null = null
      let byAdv = 0
      for (const m of team) {
        const a = adv(t.id, m)
        if (a > byAdv) {
          by = m
          byAdv = a
        }
      }
      return { id: t.id, beats: t.beats, by, byOut: by ? rec(t.id).out.get(by)! : 0 }
    })
  /** 점수가 가장 높은 후보 (같으면 채용률 높은 순) */
  const best = (ids: readonly string[], score: (id: string) => number) => {
    let b: string | undefined
    let bs = -Infinity
    for (const id of ids) {
      const s = score(id)
      if (s > bs || (s === bs && b && usage(id) > usage(b))) {
        b = id
        bs = s
      }
    }
    return b
  }
  return {
    settings,
    usage,
    mate,
    rec,
    adv,
    candidates,
    avgMate,
    threatsOf,
    coverOf,
    gainOf,
    countersOf,
    describe,
    best,
  }
}

// ── 자동 추천 ─────────────
export interface RecommendInput extends RecBase {
  /** 시작 멤버 (폼 id — 메가 폼이면 메가 폼). 하나면 첫 포켓몬, 여럿이면 직접 고른 포켓몬 */
  members: readonly string[]
  size?: number
}

export function recommendTeam(input: RecommendInput): RecommendResult {
  const c = context(input)
  const size = input.size ?? 6
  const team = input.members.slice(0, size)
  const roles: RecPick['role'][] = team.map((_, i) =>
    input.members.length === 1 && i === 0 ? 'lead' : 'picked',
  )
  const add = (id: string, role: RecPick['role']) => {
    team.push(id)
    roles.push(role)
  }

  // 1) 핵심: 함께 가장 자주 쓰인 포켓몬
  const coreSize = Math.min(size, team.length + c.settings.coreMates)
  while (team.length < coreSize) {
    const b = c.best(c.candidates(team), (id) => c.avgMate(team, id))
    if (!b) break
    add(b, 'core')
  }

  // 2) 위협: 핵심 멤버들에게 두루 강한 상대 / 3) 대비: 위협을 물러나게 하는 포켓몬
  const threats = c.threatsOf(team)
  const cover = c.coverOf(threats, team)
  while (team.length < size) {
    const ids = c.candidates(team)
    if (!ids.length) break
    const gain = new Map(ids.map((id) => [id, c.gainOf(threats, cover, id)]))
    const syn = new Map(ids.map((id) => [id, c.avgMate(team, id)]))
    const maxGain = Math.max(...gain.values())
    const maxSyn = Math.max(...syn.values())
    const w = c.settings.counter
    const b = c.best(
      ids,
      (id) =>
        w * (maxGain > 0 ? gain.get(id)! / maxGain : 0) +
        (1 - w) * (maxSyn > 0 ? syn.get(id)! / maxSyn : 0),
    )!
    add(b, 'counter')
    threats.forEach((t, i) => (cover[i] = Math.max(cover[i]!, c.adv(t.id, b))))
  }

  const picks: RecPick[] = team.map((id, k) => ({
    id,
    role: roles[k]!,
    mates: team
      .filter((_, j) => j < k)
      .map((m): [string, number] => [m, c.mate(m, id)])
      .filter(([, v]) => v >= MATE_MIN)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2),
    counters: roles[k] === 'counter' ? c.countersOf(threats, id) : [],
  }))
  return { picks, threats: c.describe(threats, team) }
}

// ── 직접 고르기: 다음 후보 ─────────────
export interface NextMate {
  id: string
  /** 지금 멤버들과 함께 쓴 비율의 평균 */
  share: number
}
export interface NextCounter {
  id: string
  /** 물러나게 하는 위협 [위협, 위협의 물러남 비율] */
  counters: [string, number][]
}
export interface NextSuggestions {
  /** 함께 쓰인 순 */
  mates: NextMate[]
  /** 위협 대비 순 (대비 점수 0 은 뺌) */
  counters: NextCounter[]
  /** 지금 멤버들에게 두루 강한 상대 */
  threats: RecThreat[]
}

export function suggestNext(
  input: RecBase & { members: readonly string[]; limit?: number },
): NextSuggestions {
  const c = context(input)
  const team = input.members
  const limit = input.limit ?? 8
  if (!team.length) return { mates: [], counters: [], threats: [] }
  const ids = team.length >= 6 ? [] : c.candidates(team)
  const mates = ids
    .map((id) => ({ id, share: c.avgMate(team, id) }))
    .filter((m) => m.share > 0)
    .sort((a, b) => b.share - a.share || c.usage(b.id) - c.usage(a.id))
    .slice(0, limit)
  const threats = c.threatsOf(team)
  const cover = c.coverOf(threats, team)
  const counters = ids
    .map((id) => ({ id, gain: c.gainOf(threats, cover, id) }))
    .filter((x) => x.gain > 0)
    .sort((a, b) => b.gain - a.gain || c.usage(b.id) - c.usage(a.id))
    .slice(0, limit)
    .map(({ id }) => ({ id, counters: c.countersOf(threats, id) }))
  return { mates, counters, threats: c.describe(threats, team) }
}

// ── 직접 고르기: 포켓몬 하나의 정보 ─────────────
export interface MemberThreat {
  id: string
  /** 이 포켓몬이 이 상대를 만났을 때 물러난 비율 */
  out: number
  /** 이 상대에게 강한 포켓몬 [포켓몬, 이 상대가 물러난 비율] (높은 순) */
  answers: [string, number][]
}
export interface MemberInfo {
  /** 같이 쓰인 포켓몬 [포켓몬, 비율] (많은 순) */
  mates: [string, number][]
  /** 불리한 상대 (평균보다 자주 물러난 상대, 물러남 비율 높은 순) */
  threats: MemberThreat[]
}

export function memberInfo(
  input: Pick<RecBase, 'table' | 'vs'> & { id: string; limit?: number; answers?: number },
): MemberInfo {
  const { table, vs, id } = input
  const limit = input.limit ?? 6
  const mates = Object.entries(table.pokemon[id]?.teammates ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
  const own = reliable(vs?.[id])
  const mean = vsOf(vs, id).mean
  const threats = own
    .filter((r) => r[2] > mean)
    .sort((a, b) => b[2] - a[2] || b[1] - a[1])
    .slice(0, limit)
    .map(([t, , out]) => ({
      id: t,
      out,
      answers: reliable(vs?.[t])
        .filter((r) => r[0] !== id)
        .sort((a, b) => b[2] - a[2] || b[1] - a[1])
        .slice(0, input.answers ?? 3)
        .map((r): [string, number] => [r[0], r[2]]),
    }))
  return { mates, threats }
}
