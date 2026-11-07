// utils/regulationData.ts — 레귤레이션별 게임 데이터
// public/data 의 pokemon/moves/items 는 최신(진행 중인) 레귤레이션 기준이다. 지난 레귤레이션은 regulations.json 의
// patch(기본과 다른 부분)만 갖고 있어서, 고른 레귤레이션의 patch 를 덮어쓴 데이터를 만들어 앱 전체가 그것을 쓴다.
// 패치 내역 화면은 이웃한 두 레귤레이션의 데이터를 비교해서 만든다 (diffRegulations).

import type { GameData, Item, Move, Pokemon, Regulation } from './types'

// ── 데이터 덮어쓰기 ─────────────
// 같은 기본 데이터·레귤레이션이면 같은 객체를 돌려준다 (화면마다 다시 만들지 않게)
const cache = new WeakMap<GameData, Map<string, GameData>>()

export function applyRegulation(base: GameData, reg: Regulation | null | undefined): GameData {
  const p = reg?.patch
  if (!reg || !p) return base
  let byReg = cache.get(base)
  if (!byReg) cache.set(base, (byReg = new Map()))
  const hit = byReg.get(reg.id)
  if (hit) return hit

  const items: Record<string, Item> = { ...base.items }
  for (const id of p.itemsOff ?? []) delete items[id]
  Object.assign(items, p.items)

  const moves: Record<string, Move> = p.moves ? { ...base.moves, ...p.moves } : base.moves

  const pokemon: Record<string, Pokemon> = { ...base.pokemon }
  for (const [id, d] of Object.entries(p.pokemon ?? {}))
    if (pokemon[id]) pokemon[id] = { ...pokemon[id], ...d }
  // 못 쓰는 메가는 원종의 메가 목록에서 뺀다 (메가 폼 데이터 자체는 남김 — 저장된 슬롯 표시용)
  const off = new Set(p.megasOff ?? [])
  if (off.size)
    for (const [id, mon] of Object.entries(pokemon)) {
      if (!mon.megas?.some((m) => off.has(m))) continue
      const megas = mon.megas.filter((m) => !off.has(m))
      const { megas: _, ...rest } = mon
      pokemon[id] = megas.length ? { ...rest, megas } : rest
    }

  const out: GameData = { ...base, pokemon, moves, items }
  byReg.set(reg.id, out)
  return out
}

// 이 데이터·레귤레이션에서 쓸 수 있는 메가 (원종이 출전 가능 + 원종의 메가 목록에 있음)
export function availableMegas(d: GameData, reg: Regulation): string[] {
  const out: string[] = []
  for (const id of reg.pokemon) for (const m of d.pokemon[id]?.megas ?? []) out.push(m)
  return [...new Set(out)].sort()
}

// 출전 가능 포켓몬이 배울 수 있는 기술 전체
export function learnableMoves(d: GameData, reg: Regulation): Set<string> {
  const out = new Set<string>()
  for (const id of reg.pokemon) for (const m of d.pokemon[id]?.learnset ?? []) out.add(m)
  return out
}

// ── 패치 내역 (두 레귤레이션 비교) ─────────────
export interface FieldChange {
  key: string // 기술: power accuracy pp type category priority target effects / 포켓몬: types abilities hp..spe weight
  from: unknown
  to: unknown
}
export interface RegulationDiff {
  pokemonAdded: string[]
  pokemonRemoved: string[]
  megasAdded: string[]
  megasRemoved: string[]
  itemsAdded: string[] // 메가스톤 제외 (메가는 megasAdded 로)
  itemsRemoved: string[]
  movesAdded: string[] // 출전 가능 포켓몬 중 누군가 배울 수 있게 된 기술
  movesRemoved: string[]
  moveChanges: { id: string; changes: FieldChange[] }[]
  learnsetChanges: { id: string; added: string[]; removed: string[] }[]
  pokemonChanges: { id: string; changes: FieldChange[] }[]
}

const MOVE_FIELDS = ['type', 'category', 'power', 'accuracy', 'pp', 'priority', 'target'] as const
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const minus = <T>(a: Iterable<T>, b: Set<T>) => [...a].filter((x) => !b.has(x))

function moveFieldChanges(a: Move, b: Move): FieldChange[] {
  const out: FieldChange[] = MOVE_FIELDS.filter((k) => a[k] !== b[k]).map((k) => ({
    key: k,
    from: a[k],
    to: b[k],
  }))
  // 부가효과·분류(접촉 등)는 수치로 보여 주기 어려워서 바뀌었다는 것만
  if (!same(a.effects, b.effects) || !same(a.flags, b.flags))
    out.push({ key: 'effects', from: null, to: null })
  return out
}

function pokemonFieldChanges(a: Pokemon, b: Pokemon): FieldChange[] {
  const out: FieldChange[] = []
  if (!same(a.types, b.types)) out.push({ key: 'types', from: a.types, to: b.types })
  if (!same(a.abilities, b.abilities))
    out.push({ key: 'abilities', from: a.abilities, to: b.abilities })
  for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const)
    if (a.stats[k] !== b.stats[k]) out.push({ key: k, from: a.stats[k], to: b.stats[k] })
  if (a.weight !== b.weight) out.push({ key: 'weight', from: a.weight, to: b.weight })
  return out
}

// prev → cur 에서 바뀐 것. pd / cd = 각 레귤레이션을 덮어쓴 데이터 (applyRegulation)
export function diffRegulations(
  pd: GameData,
  prev: Regulation,
  cd: GameData,
  cur: Regulation,
): RegulationDiff {
  const pPoke = new Set(prev.pokemon)
  const cPoke = new Set(cur.pokemon)
  const pMega = new Set(availableMegas(pd, prev))
  const cMega = new Set(availableMegas(cd, cur))
  const isStone = (id: string) => !!(cd.items[id] ?? pd.items[id])?.megaStone
  const pItems = new Set(Object.keys(pd.items).filter((id) => !isStone(id)))
  const cItems = new Set(Object.keys(cd.items).filter((id) => !isStone(id)))
  const pMoves = learnableMoves(pd, prev)
  const cMoves = learnableMoves(cd, cur)

  const moveChanges: RegulationDiff['moveChanges'] = []
  for (const id of [...cMoves].sort()) {
    const a = pd.moves[id]
    const b = cd.moves[id]
    if (!a || !b || !pMoves.has(id)) continue
    const changes = moveFieldChanges(a, b)
    if (changes.length) moveChanges.push({ id, changes })
  }

  const learnsetChanges: RegulationDiff['learnsetChanges'] = []
  const pokemonChanges: RegulationDiff['pokemonChanges'] = []
  for (const id of cur.pokemon) {
    if (!pPoke.has(id)) continue
    const a = pd.pokemon[id]
    const b = cd.pokemon[id]
    if (!a || !b) continue
    const la = new Set(a.learnset ?? [])
    const lb = new Set(b.learnset ?? [])
    const added = minus(lb, la).sort()
    const removed = minus(la, lb).sort()
    if (added.length || removed.length) learnsetChanges.push({ id, added, removed })
  }
  // 종족값 등: 양쪽에서 쓸 수 있는 포켓몬과 메가
  for (const id of [
    ...cur.pokemon.filter((x) => pPoke.has(x)),
    ...[...cMega].filter((x) => pMega.has(x)),
  ]) {
    const a = pd.pokemon[id]
    const b = cd.pokemon[id]
    if (!a || !b) continue
    const changes = pokemonFieldChanges(a, b)
    if (changes.length) pokemonChanges.push({ id, changes })
  }

  return {
    pokemonAdded: minus(cPoke, pPoke),
    pokemonRemoved: minus(pPoke, cPoke),
    megasAdded: minus(cMega, pMega),
    megasRemoved: minus(pMega, cMega),
    itemsAdded: minus(cItems, pItems).sort(),
    itemsRemoved: minus(pItems, cItems).sort(),
    movesAdded: minus(cMoves, pMoves).sort(),
    movesRemoved: minus(pMoves, cMoves).sort(),
    moveChanges,
    learnsetChanges,
    pokemonChanges,
  }
}

// 내역이 하나도 없는지
export const isEmptyDiff = (d: RegulationDiff) =>
  Object.values(d).every((v) => (v as unknown[]).length === 0)
