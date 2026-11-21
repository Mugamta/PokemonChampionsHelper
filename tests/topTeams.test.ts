// 상위 유저 파티: 리플레이 로그 읽기 · 같은 파티 합치기 · 고르기 (utils/topTeams.ts)
import { describe, expect, it } from 'vitest'
import {
  filterTeams,
  knownAbility,
  mergeTeams,
  parseReplayLog,
  ratingSteps,
  sortTeams,
  type ReplaySide,
  withRevealed,
  type TopTeam,
} from '~/utils/topTeams'
import { emptySlot } from '~/utils/types'

const PREVIEW = (side: string, mons: string[]) => mons.map((m) => `|poke|${side}|${m}|`)

const LOG = [
  '|gametype|doubles',
  '|player|p1|Alice|265|1936',
  '|player|p2|Bob|169|1960',
  '|rated|',
  ...PREVIEW('p1', [
    'Charizard, L50, F',
    'Garchomp, L50, F',
    'Politoed, L50, F',
    'Archaludon, L50, F',
    'Raichu, L50, M',
    'Gardevoir, L50, F',
  ]),
  ...PREVIEW('p2', [
    'Froslass, L50, F',
    'Garchomp, L50, M',
    'Kingambit, L50, F',
    'Rillaboom, L50, F',
    'Sneasler, L50, M',
    'Urshifu-*, L50, M',
  ]),
  '|switch|p1a: Pika|Raichu, L50, M|100/100',
  '|switch|p1b: Gardevoir|Gardevoir, L50, F|100/100',
  '|switch|p2a: Froslass|Froslass, L50, F|100/100',
  '|switch|p2b: Garchomp|Garchomp, L50, M|100/100',
  '|-ability|p1b: Gardevoir|Rough Skin|[from] ability: Trace|[of] p2b: Garchomp',
  '|-item|p2a: Froslass|Focus Sash|[from] ability: Frisk|[of] p1a: Pika',
  '|detailschange|p1a: Pika|Raichu-Mega-X, L50, M',
  '|-mega|p1a: Pika|Raichu|Raichunite X',
  '|move|p1a: Pika|Fake Out|p2b: Garchomp',
  '|-damage|p1a: Pika|87/100|[from] ability: Rough Skin|[of] p2b: Garchomp',
  '|move|p2a: Froslass|Aurora Veil|p2a: Froslass',
  '|move|p1b: Gardevoir|Moonblast|p2b: Garchomp',
  '|move|p2b: Garchomp|Stomping Tantrum|p1a: Pika',
  '|-heal|p1b: Gardevoir|90/100|[from] item: Leftovers',
  '|move|p2b: Garchomp|Protect|p2b: Garchomp|[from]lockedmove',
  '|switch|p2b: Fist|Urshifu-Rapid-Strike, L50, M|100/100',
  '|-item|p1b: Gardevoir|Choice Scarf|[from] move: Trick',
  '|switch|p1a: Pika|Raichu-Mega-X, L50, M|50/100',
  '|move|p1a: Pika|Thunderbolt|p2b: Fist',
  '|win|Alice',
].join('\n')

describe('parseReplayLog', () => {
  const g = parseReplayLog(LOG)!
  const [alice, bob] = g.sides as [ReplaySide, ReplaySide]
  const mon = (s: ReplaySide, id: string) => s.mons.find((m) => m.species === id)!

  it('플레이어·레이팅·승패·더블', () => {
    expect(g.doubles).toBe(true)
    expect([alice.name, alice.rating, alice.won]).toEqual(['Alice', 1936, true])
    expect([bob.name, bob.rating, bob.won]).toEqual(['Bob', 1960, false])
    expect(alice.mons.map((m) => m.species)).toEqual([
      'charizard',
      'garchomp',
      'politoed',
      'archaludon',
      'raichu',
      'gardevoir',
    ])
  })
  it('메가진화 · 메가스톤 · 기술 (다시 나와도 같은 포켓몬)', () => {
    const r = mon(alice, 'raichu')
    expect(r.mega).toBe('raichumegax')
    expect(r.item).toBe('raichunitex')
    expect(r.moves).toEqual(['fakeout', 'thunderbolt'])
    expect(r.brought).toBe(true)
    expect(r.gender).toBe('M')
  })
  it('트레이스·통찰·까칠한피부는 원래 주인에게, 트릭으로 바뀐 도구는 무시', () => {
    expect(mon(alice, 'gardevoir').ability).toBe('trace')
    expect(mon(alice, 'gardevoir').item).toBe('leftovers')
    expect(mon(bob, 'garchomp').ability).toBe('roughskin')
    expect(mon(alice, 'raichu').ability).toBe('frisk')
    expect(mon(bob, 'froslass').item).toBe('focussash')
  })
  it('다른 효과로 나간 기술 제외, 가려진 폼(Urshifu-*)은 나온 폼으로', () => {
    expect(mon(bob, 'garchomp').moves).toEqual(['stompingtantrum'])
    expect(mon(bob, 'urshifurapidstrike').brought).toBe(true)
    expect(mon(alice, 'charizard').brought).toBe(false)
  })
  it('6마리가 아니면 null', () => {
    expect(parseReplayLog('|player|p1|A|1|1500\n|player|p2|B|1|1500')).toBeNull()
  })
})

describe('mergeTeams', () => {
  const side = (name: string, rating: number | null, won: boolean, moves: string[]) =>
    ({
      name,
      rating,
      won,
      mons: ['a', 'b', 'c', 'd', 'e', 'f'].map((species, i) => ({
        species,
        gender: '' as const,
        moves: i === 0 ? moves : [],
        brought: i < 3,
        ...(i === 0 ? { item: 'leftovers' } : {}),
      })),
    }) satisfies ReplaySide

  it('같은 플레이어 + 같은 6마리 = 한 파티, 레이팅은 최고, 기술은 많이 쓴 순', () => {
    const teams = mergeTeams(
      [
        { id: 'r1', time: 1, side: side('Alice', 1700, true, ['x', 'y']) },
        { id: 'r2', time: 3, side: side('alice', 1750, false, ['y', 'z']) },
        { id: 'r2', time: 3, side: side('alice', 1750, false, ['y', 'z']) }, // 같은 리플레이
        { id: 'r3', time: 2, side: side('Bob', 1800, true, []) },
        { id: 'r4', time: 2, side: side('Carol', null, true, []) }, // 레이팅 없음 → 제외
      ],
      new Map([['bob', 3]]),
    )
    expect(teams.map((t) => t.player)).toEqual(['Bob', 'alice'])
    const a = teams[1]!
    expect([a.rating, a.games, a.wins, a.last]).toEqual([1750, 2, 1, 3])
    expect(a.replays).toEqual(['r2', 'r1'])
    expect(a.mons[0]).toMatchObject({
      id: 'a',
      item: 'leftovers',
      moves: ['y', 'x', 'z'],
      brought: 2,
    })
    expect(a.rank).toBeUndefined()
    expect(teams[0]!.rank).toBe(3)
  })
})

describe('고르기', () => {
  const team = (rating: number, rank?: number, ids = ['a']): TopTeam => ({
    player: String(rating),
    rating,
    ...(rank ? { rank } : {}),
    games: 1,
    wins: 1,
    last: 0,
    replays: [],
    mons: ids.map((id) => ({
      id,
      moves: [],
      brought: 0,
      ...(id === 'm' ? { mega: 'mmega' } : {}),
    })),
  })
  const teams = [team(1910, 40), team(1850, 5, ['m', 'b']), team(1720), team(1690, 120)]

  it('레이팅 기준 후보 = 100 단위', () => {
    expect(ratingSteps(teams)).toEqual([1700, 1800, 1900])
    expect(ratingSteps([])).toEqual([])
  })
  it('레이팅 이상 / 순위 이내 / 포켓몬 포함', () => {
    expect(filterTeams(teams, { by: 'rating', min: 1800 }).map((t) => t.rating)).toEqual([
      1910, 1850,
    ])
    expect(filterTeams(teams, { by: 'rank', top: 50 }).map((t) => t.rating)).toEqual([1910, 1850])
    expect(filterTeams(teams, { by: 'rating', min: 0 }, ['mmega']).map((t) => t.rating)).toEqual([
      1850,
    ])
    expect(filterTeams(teams, { by: 'rating', min: 0 }, ['m', 'b']).length).toBe(1)
  })
  it('순위 기준이면 순위 순', () => {
    const f = { by: 'rank', top: 500 } as const
    expect(sortTeams(filterTeams(teams, f), f).map((t) => t.rank)).toEqual([5, 40, 120])
  })
})

describe('withRevealed', () => {
  it('드러난 도구·성별·기술을 덮어쓰고, 원래 폼에 없는 특성(메가 특성)은 무시', () => {
    const slot = {
      ...emptySlot(),
      species: 'froslass',
      ability: 'cursedbody',
      item: 'leftovers',
      moves: ['blizzard', 'protect', 'icywind', 'willowisp'] as [string, string, string, string],
    }
    const mon = {
      id: 'froslass',
      gender: 'F' as const,
      mega: 'froslassmega',
      item: 'froslassite',
      ability: 'snowwarning',
      moves: ['auroraveil', 'blizzard'],
      brought: 3,
    }
    const out = withRevealed(slot, mon, ['snowcloak', 'cursedbody'])
    expect(out.item).toBe('froslassite')
    expect(out.gender).toBe('F')
    expect(out.ability).toBe('cursedbody')
    expect(out.moves).toEqual(['auroraveil', 'blizzard', 'protect', 'icywind'])
    expect(withRevealed(slot, { ...mon, ability: 'snowcloak' }, ['snowcloak']).ability).toBe(
      'snowcloak',
    )
  })
})

describe('knownAbility', () => {
  const abilities: Record<string, string[]> = {
    garchomp: ['sandveil', 'roughskin'],
    garchompmegaz: ['levitate'],
    gengar: ['cursedbody'],
  }
  const of = (id: string) => abilities[id]
  it('드러난 특성이 먼저', () => {
    expect(knownAbility({ id: 'gengar', ability: 'levitate', moves: [], brought: 1 }, of)).toBe(
      'levitate',
    )
  })
  it('특성이 하나뿐이면 그 특성, 메가진화했으면 메가 폼 기준', () => {
    expect(knownAbility({ id: 'gengar', moves: [], brought: 1 }, of)).toBe('cursedbody')
    expect(knownAbility({ id: 'garchomp', mega: 'garchompmegaz', moves: [], brought: 1 }, of)).toBe(
      'levitate',
    )
  })
  it('특성이 여러 개면 모름', () => {
    expect(knownAbility({ id: 'garchomp', moves: [], brought: 1 }, of)).toBeUndefined()
    expect(knownAbility({ id: 'unknown', moves: [], brought: 1 }, of)).toBeUndefined()
  })
})
