// utils/usageStats.ts
// 시즌별·월별 사용률 정리 (통계 화면). 데이터: public/data/stats/ (scripts/build-data.mjs "6.6")
// 시즌 = 레귤레이션 (그 포맷의 모든 달을 배틀 수 가중으로 합산), 월 = Smogon 월별 통계 한 달 치.

import type { UsageKind } from './autoSet'

// ── 형식 ─────────────
export interface StatsMeta {
  reg: string
  /** 'season' 또는 'YYYY-MM' */
  period: string
  battles: number
  /** 이 기간에 들어간 달 */
  months: string[]
}
export type StatsIndex = Record<UsageKind, StatsMeta[]>
/** [id, 비율 0~1] */
export type Share = [string, number]
export interface StatsMon {
  id: string
  count: number
  /** 팀 채용률 0~1 */
  usage: number
  moves: Share[]
  items: Share[]
  abilities: Share[]
  /** ['성격 id:H/A/B/C/D/S', 비율] */
  spreads: Share[]
  teammates: Share[]
}
export interface StatsTable extends StatsMeta {
  /** 채용률 높은 순 (순위 = 인덱스 + 1) */
  pokemon: StatsMon[]
}
/** 포켓몬마다 index 목록 순서대로 [순위, 채용률] (그 기간 순위표에 없으면 0) */
export type StatsTrend = Record<string, ([number, number] | 0)[]>

export type StatsMode = 'season' | 'month'

export const isSeason = (m: StatsMeta) => m.period === 'season'
export const statsKey = (m: Pick<StatsMeta, 'reg' | 'period'>) => `${m.reg}-${m.period}`
export const statsFile = (kind: UsageKind, m: Pick<StatsMeta, 'reg' | 'period'>) =>
  `stats/${kind}-${statsKey(m)}.json`

/** 모드별 기간 목록 (index 순서 = 시간 순) */
export const periodsOf = (list: StatsMeta[], mode: StatsMode) =>
  list.filter((m) => isSeason(m) === (mode === 'season'))

// ── 비교 대상 ─────────────
// 시즌: 직전 시즌. 월: 같은 레귤레이션의 직전 달, 그 레귤레이션의 첫 달이면 직전 시즌 (레귤레이션이 바뀐 직후라
// 다른 레귤레이션의 같은 달끼리 비교하는 것보다 "지난 시즌 대비"가 의미가 있음)
export function previousPeriod(list: StatsMeta[], cur: StatsMeta): StatsMeta | undefined {
  const seasons = periodsOf(list, 'season')
  const prevSeason = () => {
    const i = seasons.findIndex((s) => s.reg === cur.reg)
    return i > 0 ? seasons[i - 1] : undefined
  }
  if (isSeason(cur)) return prevSeason()
  const same = periodsOf(list, 'month').filter((m) => m.reg === cur.reg)
  const i = same.findIndex((m) => m.period === cur.period)
  return i > 0 ? same[i - 1] : prevSeason()
}

// ── 순위 변동 ─────────────
/** 순위 변동: 양수 = 올라감, 'new' = 비교 기간 순위표에 없음, null = 비교 기간이 없음 */
export type RankChange = number | 'new' | null
export function rankChange(
  trend: StatsTrend | undefined,
  list: StatsMeta[],
  prev: StatsMeta | undefined,
  id: string,
  rank: number,
): RankChange {
  if (!prev || !trend) return null
  const i = list.findIndex((m) => statsKey(m) === statsKey(prev))
  const p = trend[id]?.[i]
  return p ? p[0] - rank : 'new'
}

/** 한 포켓몬의 월별 추이 (달이 있는 기간만, 시간 순). 순위표에 없던 달은 rank 0 */
export function monthTrend(trend: StatsTrend | undefined, list: StatsMeta[], id: string) {
  const row = trend?.[id]
  return list
    .map((m, i) => ({ meta: m, at: row?.[i] || null }))
    .filter((x) => !isSeason(x.meta))
    .map((x) => ({
      reg: x.meta.reg,
      period: x.meta.period,
      rank: x.at ? x.at[0] : 0,
      usage: x.at ? x.at[1] : 0,
    }))
}

/** 배분 문자열 'adamant:2/32/0/0/0/32' → 성격, 능력 포인트 */
export function parseSpread(s: string): { nature: string; sp: number[] } {
  const [nature = '', sp = ''] = s.split(':')
  return { nature, sp: sp.split('/').map(Number) }
}

// ── 대면 ─────────────
// stats/{kind}-{reg}-{period}-vs.json (scripts/build-data.mjs addVs/finishVs, Smogon "Checks and Counters")
/** [상대 id, 맞대결 수, 물러남 비율, 쓰러짐 비율?, 교체 비율?] — 물러남 = 쓰러짐 + 교체 (나눔은 싱글 주요 상대만) */
export type VsRow = [string, number, number, number?, number?]
/** 포켓몬 id → 맞대결 많은 순 */
export type StatsVs = Record<string, VsRow[]>
export const statsVsFile = (kind: UsageKind, m: Pick<StatsMeta, 'reg' | 'period'>) =>
  `stats/${kind}-${statsKey(m)}-vs.json`

export interface Matchup {
  /** 상대 id */
  id: string
  /** 맞대결 수 */
  n: number
  /** 이 포켓몬이 물러난(쓰러짐 + 교체) 비율 */
  out: number
  ko?: number
  sw?: number
}
export const toMatchup = ([id, n, out, ko, sw]: VsRow): Matchup => ({ id, n, out, ko, sw })

/** a 가 b 를 만났을 때 (a 쪽 기록, 없으면 null) */
export function matchupOf(vs: StatsVs | null | undefined, a: string, b: string): Matchup | null {
  const row = vs?.[a]?.find((r) => r[0] === b)
  return row ? toMatchup(row) : null
}

/** 순위에 넣을 최소 맞대결 수: 20 과 가장 많이 만난 상대의 10% 중 큰 쪽 (적게 만난 쌍은 비율이 들쭉날쭉) */
export const VS_RANK_MIN = 20
export function rankedMatchups(
  rows: readonly VsRow[] | undefined,
  dir: 'hard' | 'easy',
  limit = 10,
): Matchup[] {
  if (!rows?.length) return []
  const minN = Math.max(VS_RANK_MIN, Math.max(...rows.map((r) => r[1])) * 0.1)
  return rows
    .filter((r) => r[1] >= minN)
    .map(toMatchup)
    .sort((x, y) => (dir === 'hard' ? y.out - x.out : x.out - y.out) || y.n - x.n)
    .slice(0, limit)
}
