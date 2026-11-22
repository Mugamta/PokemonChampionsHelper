// utils/topTeams.ts
// 상위 유저 파티 (Pokémon Showdown 리플레이 + 래더 순위).
//   - 빌드(scripts/build-data.mjs "6.7"): 리플레이 로그 → 플레이어별 파티(parseReplayLog) → 같은 플레이어의 같은 파티를 합침(mergeTeams)
//   - 화면(pages/teams.vue): 레이팅 이상 / 래더 순위 이내로 고르기(filterTeams), 고를 수 있는 기준(ratingSteps)
// 빌드 스크립트가 esbuild 로 변환해서 불러오므로 이 파일은 다른 모듈을 (값으로) import 하지 않는다 (타입만).

import type { TeamSlot } from '~/utils/types'

// ── 형식 ─────────────
// 배틀 하나에서 본 한 플레이어의 포켓몬. 기술·도구·특성은 배틀 중 드러난 것만
export interface ReplayMon {
  species: string // 팀 미리보기의 종 (Showdown 이름 → id, 폼 포함. 메가 전 모습)
  gender: '' | 'M' | 'F'
  mega?: string // 메가진화한 폼 id
  item?: string
  ability?: string
  moves: string[]
  brought: boolean // 선출해서 나왔는지
}
export interface ReplaySide {
  name: string
  rating: number | null // 배틀 전 레이팅 (Elo, 레이팅 배틀이 아니면 null)
  won: boolean
  mons: ReplayMon[]
}
export interface ReplayGame {
  doubles: boolean
  sides: ReplaySide[]
}

// public/data/teams/{출처}/{kind}-{reg}.json 의 파티 하나
export interface TopTeamMon {
  id: string // 종 (원종·폼 id, 슬롯의 species 와 같은 기준)
  gender?: 'M' | 'F'
  mega?: string
  item?: string
  ability?: string
  moves: string[] // 드러난 기술 (많이 쓴 순, 최대 4)
  brought: number // 선출한 배틀 수
}
export interface TopTeam {
  player: string
  rating: number // 이 파티로 한 배틀 중 가장 높았던 배틀 전 레이팅
  rank?: number // 플레이어의 래더 순위 (받은 시점, TOP 500 안일 때만)
  games: number
  wins: number
  last: number // 마지막 배틀 시각 (unix 초)
  replays: string[] // 리플레이 id (최근 순, 최대 REPLAYS_MAX)
  mons: TopTeamMon[]
}
export interface TopTeamsFile {
  format: string
  fetched: string // 받은 날 (YYYY-MM-DD) = 래더 순위 기준일
  replays: number // 읽은 리플레이 수
  teams: TopTeam[] // 레이팅 높은 순
}
// ── 출처 ─────────────
// 화면 맨 위에서 고르는 자료 출처. 파일은 public/data/teams/{출처}/{kind}-{reg}.json, 자료가 없는 출처는 "준비 중"
//   showdown  = Pokémon Showdown 공개 리플레이 + 래더 (build-data "6.7")
//   champions = 포켓몬 챔피언스 게임 내 랭크배틀 (아직 자료 없음)
export const TEAM_SOURCES = ['showdown', 'champions'] as const
export type TeamSource = (typeof TEAM_SOURCES)[number]
// 출처별 링크 (홈 = 부제 옆 링크, replay = 카드의 리플레이 링크. 없으면 표시 안 함)
export const TEAM_SOURCE_LINKS: Record<
  TeamSource,
  { home?: string; replay?: (id: string) => string }
> = {
  showdown: {
    home: 'https://replay.pokemonshowdown.com/',
    replay: (id) => `https://replay.pokemonshowdown.com/${id}`,
  },
  champions: {},
}

// index.json = { [출처]: { single | double: { [레귤레이션]: { format, fetched, replays, teams(수) } } } }
export type TopTeamsIndex = Partial<
  Record<
    TeamSource,
    Partial<
      Record<
        'single' | 'double',
        Record<string, { format: string; fetched: string; replays: number; teams: number }>
      >
    >
  >
>

const toID = (s: string | undefined) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// ── 리플레이 로그 → 플레이어별 파티 ─────────────
// "p1a: 닉네임" → ['p1', '닉네임']
const who = (ref: string | undefined): [string, string] | null => {
  const m = ref?.match(/^(p\d)[a-d]?: ?(.*)$/)
  return m ? [m[1]!, m[2]!] : null
}
// "Charizard, L50, F" → { species, gender }. 미리보기에서 폼이 가려진 종("Urshifu-*")은 id 뒤에 * 를 남김
const details = (d: string | undefined) => {
  const parts = String(d ?? '').split(', ')
  const gender = parts.includes('F') ? 'F' : parts.includes('M') ? 'M' : ''
  const species = toID(parts[0]) + (parts[0]?.endsWith('-*') ? '*' : '')
  return { species, gender: gender as ReplayMon['gender'] }
}

export function parseReplayLog(log: string): ReplayGame | null {
  const sides = new Map<string, ReplaySide>()
  // 닉네임 → 그 포켓몬 (진영마다)
  const byNick = new Map<string, ReplayMon>()
  let doubles = false
  let winner = ''
  const side = (id: string) => {
    let s = sides.get(id)
    if (!s) sides.set(id, (s = { name: '', rating: null, won: false, mons: [] }))
    return s
  }
  const monOf = (ref: string | undefined) => {
    const w = who(ref)
    return w ? byNick.get(w.join('|')) : undefined
  }
  // 미리보기 종과 맞춰 봄 (Urshifu-* 처럼 폼이 가려진 경우는 앞부분으로)
  const findMon = (s: ReplaySide, species: string) =>
    s.mons.find((m) => m.species === species) ??
    s.mons.find((m) => m.species.endsWith('*') && species.startsWith(m.species.slice(0, -1))) ??
    s.mons.find((m) => species.startsWith(m.species) || m.species.startsWith(species))
  // "[from] item: X|[of] p1a: Y" → 도구·특성의 주인 (of 가 있으면 of, 없으면 줄의 주체)
  const fromTag = (parts: string[], subject: ReplayMon | undefined) => {
    const from = parts.find((p) => p.startsWith('[from] '))
    if (!from) return
    const m = from.match(/^\[from\] (item|ability): (.+)$/)
    if (!m) return
    const of = parts.find((p) => p.startsWith('[of] '))
    const owner = of ? monOf(of.slice(5)) : subject
    if (!owner) return
    if (m[1] === 'item') owner.item ??= toID(m[2])
    else owner.ability ??= toID(m[2])
  }

  for (const line of log.split('\n')) {
    if (!line.startsWith('|')) continue
    const parts = line.slice(1).split('|')
    const cmd = parts[0]
    switch (cmd) {
      case 'gametype':
        doubles = parts[1] === 'doubles'
        break
      case 'player': {
        if (!parts[2]) break // 나간 플레이어 줄 ("|player|p2|")
        const s = side(parts[1]!)
        s.name = parts[2]
        const r = Number(parts[4])
        if (parts[4] && Number.isFinite(r)) s.rating = r
        break
      }
      case 'poke': {
        const d = details(parts[2])
        side(parts[1]!).mons.push({ ...d, moves: [], brought: false })
        break
      }
      case 'switch':
      case 'drag':
      case 'replace': {
        const w = who(parts[1])
        if (!w) break
        const key = w.join('|')
        if (cmd !== 'replace' && byNick.has(key)) break
        const d = details(parts[2])
        const s = side(w[0])
        let mon = findMon(s, d.species)
        if (!mon) s.mons.push((mon = { ...d, moves: [], brought: false }))
        // 메가진화한 채로 다시 나오면 폼이 메가 → 미리보기 종은 그대로
        if (mon.species.endsWith('*')) mon.species = d.species
        mon.brought = true
        byNick.set(key, mon)
        break
      }
      case 'detailschange': {
        const mon = monOf(parts[1])
        const d = details(parts[2])
        if (mon && /mega/.test(d.species) && d.species !== mon.species) mon.mega = d.species
        break
      }
      case '-mega': {
        const mon = monOf(parts[1])
        if (mon && parts[3]) mon.item = toID(parts[3])
        break
      }
      case 'move': {
        // 다른 효과로 나간 기술(매직미러 반사·댄서·연속 기술 등)은 제외
        if (parts.slice(3).some((p) => p.startsWith('[from]'))) break
        const mon = monOf(parts[1])
        const move = toID(parts[2])
        if (mon && move && move !== 'struggle' && !mon.moves.includes(move)) mon.moves.push(move)
        break
      }
      case '-item': {
        // 트릭·도둑질 등으로 바뀐 도구는 원래 도구가 아님
        if (parts.some((p) => p.startsWith('[from] move:'))) break
        const mon = monOf(parts[1])
        if (mon && parts[2]) mon.item ??= toID(parts[2])
        // 통찰: "|-item|상대|도구|[from] ability: Frisk|[of] 통찰 주인"
        fromTag(parts, mon)
        break
      }
      case '-enditem': {
        // 소모·떨어뜨리기로 없어진 도구 = 원래 도구 (빼앗아 먹은 경우 [of] 가 먹은 쪽이라 주체 기준이면 맞음)
        const mon = monOf(parts[1])
        if (mon && parts[2] && !parts.some((p) => p.startsWith('[from] move: Fling')))
          mon.item ??= toID(parts[2])
        break
      }
      case '-ability': {
        const mon = monOf(parts[1])
        const from = parts.slice(3).find((p) => p.startsWith('[from]'))
        if (!from) {
          if (mon && parts[2]) mon.ability ??= toID(parts[2])
          break
        }
        // 트레이스: "|-ability|트레이스 주인|복사한 특성|[from] ability: Trace|[of] 원래 주인"
        const m = from.match(/^\[from\] ability: (.+)$/)
        if (m) {
          if (mon) mon.ability ??= toID(m[1])
          const of = parts.find((p) => p.startsWith('[of] '))
          const owner = of ? monOf(of.slice(5)) : undefined
          if (owner && parts[2]) owner.ability ??= toID(parts[2])
        }
        // 스킬스왑 등 기술로 바뀐 특성은 원래 특성이 아님
        break
      }
      case 'win':
        winner = parts[1] ?? ''
        break
      default:
        if (cmd?.startsWith('-')) fromTag(parts, monOf(parts[1]))
    }
  }
  const list = [...sides.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, s]) => ({ ...s, won: !!winner && s.name === winner }))
  if (list.length !== 2 || list.some((s) => !s.name || s.mons.length < 6)) return null
  for (const s of list) {
    s.mons = s.mons.slice(0, 6)
    // 끝까지 안 나와서 폼을 모르는 종은 기본 폼으로
    for (const m of s.mons) m.species = m.species.replace(/\*$/, '')
  }
  return { doubles, sides: list }
}

// ── 같은 플레이어의 같은 파티 합치기 ─────────────
export const REPLAYS_MAX = 5
export interface TeamGame {
  id: string // 리플레이 id
  time: number
  side: ReplaySide // species·mega 는 앱 데이터 id 로 맞춘 뒤
}

const count = (m: Map<string, number>, k: string | undefined) => {
  if (k) m.set(k, (m.get(k) ?? 0) + 1)
}
const best = (m: Map<string, number>) =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]

// 플레이어 id + 6마리 종(순서 무관)이 같으면 같은 파티. rank: 플레이어 id → 래더 순위
export function mergeTeams(games: TeamGame[], rank: Map<string, number> = new Map()): TopTeam[] {
  interface Acc {
    player: string
    rating: number
    games: number
    wins: number
    last: number
    replays: { id: string; time: number }[]
    order: string[]
    mons: Map<
      string,
      {
        gender?: 'M' | 'F'
        mega: Map<string, number>
        item: Map<string, number>
        ability: Map<string, number>
        moves: Map<string, number>
        brought: number
      }
    >
  }
  const teams = new Map<string, Acc>()
  for (const g of games) {
    const s = g.side
    if (s.rating === null || s.mons.length !== 6) continue
    const key =
      toID(s.name) +
      '|' +
      s.mons
        .map((m) => m.species)
        .sort()
        .join(',')
    let t = teams.get(key)
    if (!t) {
      t = {
        player: s.name,
        rating: s.rating,
        games: 0,
        wins: 0,
        last: 0,
        replays: [],
        order: s.mons.map((m) => m.species),
        mons: new Map(),
      }
      teams.set(key, t)
    }
    if (t.replays.some((r) => r.id === g.id)) continue
    t.games++
    if (s.won) t.wins++
    t.rating = Math.max(t.rating, s.rating)
    t.replays.push({ id: g.id, time: g.time })
    // 이름·순서는 가장 최근 배틀 기준
    if (g.time >= t.last) {
      t.last = g.time
      t.player = s.name
      t.order = s.mons.map((m) => m.species)
    }
    for (const m of s.mons) {
      let a = t.mons.get(m.species)
      if (!a) {
        a = {
          mega: new Map(),
          item: new Map(),
          ability: new Map(),
          moves: new Map(),
          brought: 0,
        }
        t.mons.set(m.species, a)
      }
      if (m.gender) a.gender = m.gender
      count(a.mega, m.mega)
      count(a.item, m.item)
      count(a.ability, m.ability)
      for (const mv of m.moves) count(a.moves, mv)
      if (m.brought) a.brought++
    }
  }
  return [...teams.values()]
    .map((t) => {
      const r = rank.get(toID(t.player))
      const team: TopTeam = {
        player: t.player,
        rating: Math.round(t.rating),
        ...(r ? { rank: r } : {}),
        games: t.games,
        wins: t.wins,
        last: t.last,
        replays: t.replays
          .sort((a, b) => b.time - a.time)
          .slice(0, REPLAYS_MAX)
          .map((x) => x.id),
        mons: t.order.map((id) => {
          const a = t.mons.get(id)!
          const mon: TopTeamMon = {
            id,
            moves: [...a.moves.entries()]
              .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
              .slice(0, 4)
              .map(([k]) => k),
            brought: a.brought,
          }
          if (a.gender) mon.gender = a.gender
          const mega = best(a.mega)
          const item = best(a.item)
          const ability = best(a.ability)
          if (mega) mon.mega = mega
          if (item) mon.item = item
          if (ability) mon.ability = ability
          return mon
        }),
      }
      return team
    })
    .sort((a, b) => b.rating - a.rating || b.games - a.games || b.last - a.last)
}

// ── 화면: 고르기 ─────────────
export type TeamFilter = { by: 'rating'; min: number } | { by: 'rank'; top: number }
export const RANK_STEPS = [10, 30, 50, 100, 500] as const

// 레이팅 기준 후보: 100 단위, 가장 낮은 파티 ~ 가장 높은 파티 (최소 기준 = 0 → 전체)
export function ratingSteps(teams: readonly TopTeam[]): number[] {
  if (!teams.length) return []
  const hi = Math.max(...teams.map((t) => t.rating))
  const lo = Math.min(...teams.map((t) => t.rating))
  const out: number[] = []
  for (let r = Math.floor(hi / 100) * 100; r > lo; r -= 100) out.push(r)
  return out.reverse()
}

// 기준에 맞는 파티 (레이팅 = 그 이상, 순위 = 래더 TOP N 플레이어). species: 이 포켓몬(종 또는 메가 폼)을 쓴 파티만
export function filterTeams(
  teams: readonly TopTeam[],
  filter: TeamFilter,
  species: readonly string[] = [],
): TopTeam[] {
  return teams.filter(
    (t) =>
      (filter.by === 'rating' ? t.rating >= filter.min : !!t.rank && t.rank <= filter.top) &&
      species.every((s) => t.mons.some((m) => m.id === s || m.mega === s)),
  )
}

// ── 화면: 특성 ─────────────
// 드러난 특성, 없으면 특성이 하나뿐인 폼의 그 특성 (메가진화했으면 메가 폼 기준). abilitiesOf: 폼 id → 특성 목록
export function knownAbility(
  mon: TopTeamMon,
  abilitiesOf: (id: string) => readonly string[] | undefined,
): string | undefined {
  if (mon.ability) return mon.ability
  const list = abilitiesOf(mon.mega ?? mon.id)
  return list?.length === 1 ? list[0] : undefined
}

// ── 화면: 내 파티로 가져오기 ─────────────
// 통계 배치로 만든 슬롯에 배틀에서 드러난 것을 덮어씀: 도구·성별, 특성(원래 폼의 특성일 때만 — 메가진화 후 드러난
// 메가 특성은 슬롯에 넣을 수 없음), 기술(드러난 기술 먼저, 나머지는 통계 기술 중 겹치지 않는 것)
export function withRevealed(
  slot: TeamSlot,
  mon: TopTeamMon,
  abilities: readonly string[],
): TeamSlot {
  const moves = [...mon.moves, ...slot.moves.filter((m) => m && !mon.moves.includes(m))]
  return {
    ...slot,
    gender: mon.gender ?? slot.gender,
    item: mon.item ?? slot.item,
    ability: mon.ability && abilities.includes(mon.ability) ? mon.ability : slot.ability,
    moves: [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? ''],
  }
}

// 순위 기준이면 순위 순, 레이팅 기준이면 레이팅 순 (같으면 배틀 수 많은 순)
export function sortTeams(teams: readonly TopTeam[], filter: TeamFilter): TopTeam[] {
  const list = [...teams]
  if (filter.by === 'rank')
    list.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.rating - a.rating)
  return list
}
