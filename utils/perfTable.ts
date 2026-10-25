// utils/perfTable.ts
// 포켓몬 성능표 (pages/stats.vue) 계산. 레벨 50, 도구 없음(스피드의 구애스카프 제외), 날씨·필드 없음 기준.
//   - 내구: 물리/특수 내구 지수(H × B(D) / 0.411, 파티 화면과 같은 식)를 H0 / H32 / H32+B(D)32 / 같은 투자 + 성격 보정으로
//   - 결정력: 타입별로 결정력이 가장 높은 기술. 그 기술에 페널티(반동·능력 하락·명중 100 미만 등)가 있으면
//     페널티 없고 명중 100 인 차선 기술도 함께. 공격(특공) SP 0 / 32 / 32+성격.
//     타수가 랜덤인 연속기는 타수 확률에 따른 기댓값 + [최소, 최대]
//   - 스피드: S0 / S32 / S32+성격 / 스카프 S32 / 스카프 S32+성격. 스피드 특성이 있으면 특성 보정 줄을 따로
//   - 랭크: 내구는 방어·특방, 결정력은 공격·특공(바디프레스는 방어), 스피드는 스피드 랭크

import { effectiveMoveType, hitInfo, powerIndex, type Combatant } from './damage'
import { applyBoost, calcStat, effectiveSpeed, type SpeedContext } from './stats'
import type { BoostKey, Move, Nature, Pokemon, StatTable, TypeId } from './types'

// 한 능력치만 올리는 성격 (실능치 계산용)
const plusNature = (stat: BoostKey): Nature => ({
  id: '+',
  plus: stat,
  minus: stat === 'atk' ? 'spa' : 'atk',
})

// ── 내구 ─────────────
// 투자 단계: 무투자 / H32 / H32+B(D)32 / H32+B(D)32 성격 보정
export const BULK_CFGS = ['h0', 'h32', 'hb32', 'hb32plus'] as const
export type BulkCfg = (typeof BULK_CFGS)[number]
export interface BulkRow {
  phys: [number, number, number, number] // BULK_CFGS 순서
  spec: [number, number, number, number]
}
// 내구 지수 = HP × 방어(특방) / 0.411 (파티 화면과 같은 식)
export const bulkIndex = (hp: number, d: number) => Math.floor((hp * d) / 0.411)
// rank: 방어·특방 랭크
export function bulkRow(p: Pokemon, rank = 0): BulkRow {
  const h0 = calcStat('hp', p.stats.hp, 0)
  const h32 = calcStat('hp', p.stats.hp, 32)
  const side = (k: 'def' | 'spd') => {
    const d = (sp: number, plus: boolean) =>
      applyBoost(calcStat(k, p.stats[k], sp, plus ? plusNature(k) : null), rank)
    return [
      bulkIndex(h0, d(0, false)),
      bulkIndex(h32, d(0, false)),
      bulkIndex(h32, d(32, false)),
      bulkIndex(h32, d(32, true)),
    ] as BulkRow['phys']
  }
  return { phys: side('def'), spec: side('spd') }
}

// ── 투자 ─────────────
export type SpCfg = 's0' | 's32' | 's32plus'
export const SP_CFGS: readonly SpCfg[] = ['s0', 's32', 's32plus']

export type Penalty =
  | 'recoil' // 반동 데미지
  | 'selfDrop' // 자기 능력 하락
  | 'recharge' // 다음 턴 움직일 수 없음
  | 'charge' // 모으기 (한 턴 뒤 공격)
  | 'lock' // 몇 턴 고정
  | 'selfKo' // 사용하면 기절
  | 'selfDamage' // 맞혀도 HP 소모 (철제광선)
  | 'crash' // 빗나가면 HP 소모 (무릎차기류)
  | 'condition' // 조건이 맞아야 제대로 씀 (첫 턴, 상대가 공격할 때, 도구 없을 때 등)
  | 'accuracy' // 명중 100 미만
  | 'randomHits' // 연속기 횟수가 랜덤

const LOCK = new Set(['outrage', 'petaldance', 'thrash', 'ragingfury', 'uproar'])
const SELF_KO = new Set(['explosion', 'selfdestruct', 'mistyexplosion'])
const SELF_DAMAGE = new Set(['steelbeam'])
const CRASH = new Set(['highjumpkick', 'axekick', 'supercellslam'])
// 표시·필터 순서
export const PENALTIES: readonly Penalty[] = [
  'accuracy',
  'randomHits',
  'recharge',
  'recoil',
  'crash',
  'selfDamage',
  'selfDrop',
  'charge',
  'lock',
  'selfKo',
  'condition',
]
const CONDITIONAL = new Set([
  'fakeout',
  'firstimpression',
  'suckerpunch',
  'upperhand',
  'focuspunch',
  'belch',
  'lastresort',
  'poltergeist',
  'burnup',
  'doubleshock',
  'steelroller',
  'futuresight',
  'acrobatics', // 도구가 없을 때만 2배 (표는 도구 없음 기준이라 2배로 계산됨)
])
// 결정력 표에서 빼는 기술: 상대 능력치로 위력이 정해짐
const EXCLUDED = new Set(['foulplay'])
// 항상 급소 (결정력 × 1.5)
const ALWAYS_CRIT = new Set([
  'surgingstrikes',
  'wickedblow',
  'flowertrick',
  'frostbreath',
  'stormthrow',
])

// 특성을 반영한 명중률 (null = 반드시 맞음)
export function effectiveAccuracy(move: Move, ability: string): number | null {
  if (move.accuracy == null || ability === 'noguard') return null
  let acc = move.accuracy
  if (ability === 'compoundeyes') acc *= 1.3
  if (ability === 'hustle' && move.category === 'physical') acc *= 0.8
  return acc
}

// ── 타수 분포 ─────────────
// 기술이 맞았다는 전제의 타수별 확률 (첫 명중은 '명중' 페널티로 따로 표시). 근거: Showdown sim/battle-actions.ts
//   2~5회: 2·3회 35%, 4·5회 15% (기댓값 3.1) / 스킬링크 5회 / 속임수주사위 4·5회 50%씩
//   트리플악셀·트리플킥: 두 번째부터 매 타 명중 판정 (스킬링크·속임수주사위면 판정 없이 3회), 위력 20→40→60
//   찍찍베기: 두 번째부터 매 타 명중 판정, 빗나가면 거기서 끝 (스킬링크 10회 / 속임수주사위 4~10회 균등)
//   부자유친: 2타째 0.25배 → 1.25배 고정
export interface HitOutcome {
  hits: number
  factor: number // 1타 결정력에 곱하는 값 (트리플악셀은 위력 누적 / 첫 타 위력)
  p: number
}
export interface HitsUsed {
  outcomes: HitOutcome[]
  min: number // 타수
  max: number
  expHits: number // 타수 기댓값
  expFactor: number // 결정력 배율 기댓값
  parentalBond: boolean
}

// hitAcc: 두 번째부터의 명중률 (0~1). 생략하면 기술 명중 × 특성 (배틀 계산은 날씨·랭크 등을 반영한 값을 넘긴다)
function hitOutcomes(
  move: Move,
  ability: string,
  item: string,
  hitAcc?: number,
): HitOutcome[] | null {
  const skillLink = ability === 'skilllink'
  const dice = item === 'loadeddice'
  const acc = effectiveAccuracy(move, ability)
  const a = hitAcc ?? (acc == null ? 1 : Math.min(1, acc / 100)) // 두 번째부터의 명중
  if (move.id === 'tripleaxel' || move.id === 'triplekick') {
    const pw = move.id === 'tripleaxel' ? [20, 40, 60] : [10, 20, 30]
    const f = [1, (pw[0]! + pw[1]!) / pw[0]!, (pw[0]! + pw[1]! + pw[2]!) / pw[0]!]
    if (skillLink || dice) return [{ hits: 3, factor: f[2]!, p: 1 }]
    return [
      { hits: 1, factor: f[0]!, p: 1 - a },
      { hits: 2, factor: f[1]!, p: a * (1 - a) },
      { hits: 3, factor: f[2]!, p: a * a },
    ]
  }
  if (move.id === 'populationbomb') {
    if (skillLink) return [{ hits: 10, factor: 10, p: 1 }]
    if (dice) return [4, 5, 6, 7, 8, 9, 10].map((n) => ({ hits: n, factor: n, p: 1 / 7 }))
    return Array.from({ length: 10 }, (_, i) => ({
      hits: i + 1,
      factor: i + 1,
      p: i < 9 ? a ** i * (1 - a) : a ** 9,
    }))
  }
  const stub = { ability, item, stats: {}, species: { types: [] } } as unknown as Combatant
  if (hitInfo(move, stub).parentalBond) return [{ hits: 2, factor: 1.25, p: 1 }]
  const mh = move.effects.find((e) => e.type === 'multihit') as
    | { min: number; max: number }
    | undefined
  if (!mh) return null
  if (mh.min === mh.max || skillLink) return [{ hits: mh.max, factor: mh.max, p: 1 }]
  if (mh.min === 2 && mh.max === 5) {
    if (dice)
      return [
        { hits: 4, factor: 4, p: 0.5 },
        { hits: 5, factor: 5, p: 0.5 },
      ]
    return [2, 3, 4, 5].map((n) => ({ hits: n, factor: n, p: n <= 3 ? 0.35 : 0.15 }))
  }
  const n = mh.max - mh.min + 1
  return Array.from({ length: n }, (_, i) => ({ hits: mh.min + i, factor: mh.min + i, p: 1 / n }))
}

export function hitsUsed(move: Move, ability = '', item = '', hitAcc?: number): HitsUsed | null {
  const outcomes = hitOutcomes(move, ability, item, hitAcc)?.filter((o) => o.p > 0)
  if (!outcomes?.length) return null
  return {
    outcomes,
    min: Math.min(...outcomes.map((o) => o.hits)),
    max: Math.max(...outcomes.map((o) => o.hits)),
    expHits: outcomes.reduce((s, o) => s + o.hits * o.p, 0),
    expFactor: outcomes.reduce((s, o) => s + o.factor * o.p, 0),
    parentalBond: outcomes.length === 1 && outcomes[0]!.factor === 1.25,
  }
}

export function movePenalties(move: Move, ability = '', item = ''): Penalty[] {
  const out: Penalty[] = []
  const noRecoil = ability === 'rockhead' || ability === 'magicguard'
  if (!noRecoil && move.effects.some((e) => e.type === 'recoil')) out.push('recoil')
  if (
    move.effects.some(
      (e) =>
        e.type === 'boost' &&
        e.target === 'self' &&
        !e.chance &&
        Object.values(e.stats).some((v) => (v ?? 0) < 0),
    )
  )
    out.push('selfDrop')
  if (move.effects.some((e) => e.type === 'recharge')) out.push('recharge')
  if (move.flags.includes('charge')) out.push('charge')
  if (LOCK.has(move.id)) out.push('lock')
  if (SELF_KO.has(move.id)) out.push('selfKo')
  if (SELF_DAMAGE.has(move.id) && ability !== 'magicguard') out.push('selfDamage')
  if (CRASH.has(move.id) && ability !== 'magicguard') out.push('crash')
  if (CONDITIONAL.has(move.id)) out.push('condition')
  const acc = effectiveAccuracy(move, ability)
  if (acc != null && acc < 100) out.push('accuracy')
  if ((hitsUsed(move, ability, item)?.outcomes.length ?? 1) > 1) out.push('randomHits')
  return out
}

// ── 결정력 ─────────────
export interface PowerEntry {
  move: string
  ability: string // 결정력·페널티에 영향을 준 특성 ('' = 영향 없음)
  type: TypeId // 특성(스킨류 등) 반영 타입
  category: 'physical' | 'special'
  stat: 'atk' | 'spa' | 'def' // SP·성격을 준 능력치 (바디프레스 = 방어)
  hits: HitsUsed | null
  alwaysCrit: boolean
  accuracy: number | null
  penalties: Penalty[]
  values: [number, number, number] // SP 0 / 32 / 32+성격. 타수가 랜덤이면 기댓값
  ranges: [[number, number], [number, number], [number, number]] | null // 타수가 랜덤일 때 [최소, 최대]
}
// 후보: 고르는 데는 S32+성격 결정력(top, 기댓값)만 쓰고, 고른 기술만 세 가지 값을 다 계산한다 (성능표 전체가 수백 마리)
export type PowerCandidate = Omit<PowerEntry, 'values' | 'ranges'> & {
  top: number
  mv: Move
  item: string
  rank: number // 공격·특공(바디프레스는 방어) 랭크
}

const statForMove = (move: Move): PowerEntry['stat'] =>
  move.id === 'bodypress' ? 'def' : move.category === 'physical' ? 'atk' : 'spa'

// 1타 결정력 (급소 확정 1.5 포함). 타수 배율은 부르는 쪽에서
function perHit(p: Pokemon, c: Omit<PowerCandidate, 'top'>, cfg: SpCfg): number | null {
  const boosts = c.rank ? { [c.stat]: c.rank } : undefined
  const stats: StatTable = {
    hp: calcStat('hp', p.stats.hp, 0),
    atk: calcStat('atk', p.stats.atk, 0),
    def: calcStat('def', p.stats.def, 0),
    spa: calcStat('spa', p.stats.spa, 0),
    spd: calcStat('spd', p.stats.spd, 0),
    spe: calcStat('spe', p.stats.spe, 0),
    [c.stat]: calcStat(
      c.stat,
      p.stats[c.stat],
      cfg === 's0' ? 0 : 32,
      cfg === 's32plus' ? plusNature(c.stat) : null,
    ),
  }
  const v = powerIndex(c.mv, { species: p, stats, ability: c.ability, item: c.item, boosts })
  return v == null ? null : v * (c.alwaysCrit ? 1.5 : 1)
}
const scaled = (v: number, f: number) => Math.floor(v * f)

function candidate(
  p: Pokemon,
  move: Move,
  ability: string,
  item: string,
  rank: number,
): PowerCandidate | null {
  if (move.category === 'status' || !move.power || EXCLUDED.has(move.id)) return null
  const base = {
    mv: move,
    item,
    rank,
    move: move.id,
    ability,
    type: effectiveMoveType(move, ability, {}, p),
    category: move.category as PowerEntry['category'],
    stat: statForMove(move),
    hits: hitsUsed(move, ability, item),
    alwaysCrit: ALWAYS_CRIT.has(move.id),
    accuracy: effectiveAccuracy(move, ability),
    penalties: movePenalties(move, ability, item),
  }
  const v = perHit(p, base, 's32plus')
  return v == null ? null : { ...base, top: scaled(v, base.hits?.expFactor ?? 1) }
}

// 같은 기술이면 특성이 결정력·타입·페널티·타수를 바꿀 때만 특성별로 따로 둔다
const sameEffect = (a: PowerCandidate, b: PowerCandidate) =>
  a.type === b.type &&
  a.top === b.top &&
  a.penalties.join() === b.penalties.join() &&
  a.hits?.expHits === b.hits?.expHits

// item: 지닌 도구 (기본 = 도구 없음, 메가진화는 메가스톤).
// 결정력에는 속임수주사위(타수)와 애크러뱃(도구가 없을 때만 2배)에만 영향
// rank: 공격·특공 랭크 (바디프레스는 방어 랭크)
export function powerCandidates(
  p: Pokemon,
  moves: Move[],
  item?: string,
  rank = 0,
): PowerCandidate[] {
  const held = p.mega ? p.mega.item : (item ?? '')
  const out: PowerCandidate[] = []
  const abilities = [...new Set(p.abilities)]
  for (const move of moves) {
    const neutral = candidate(p, move, '', held, rank)
    if (!neutral) continue
    const variants: PowerCandidate[] = []
    let unchanged = abilities.length === 0
    for (const ab of abilities) {
      const c = candidate(p, move, ab, held, rank)
      if (!c || sameEffect(c, neutral)) unchanged = true
      else if (!variants.some((v) => sameEffect(v, c))) variants.push(c)
    }
    // 모든 특성이 영향을 주면(스킨류 등) "특성 영향 없음" 경우는 실제로 없음
    if (unchanged) out.push(neutral)
    out.push(...variants)
  }
  return out
}

const toEntry = (p: Pokemon, c: PowerCandidate): PowerEntry => {
  const { mv: _mv, top: _top, item: _item, rank: _rank, ...rest } = c
  const h = c.hits
  const per = SP_CFGS.map((cfg) => perHit(p, c, cfg) ?? 0)
  const minF = h ? Math.min(...h.outcomes.map((o) => o.factor)) : 1
  const maxF = h ? Math.max(...h.outcomes.map((o) => o.factor)) : 1
  return {
    ...rest,
    values: per.map((v) => scaled(v, h?.expFactor ?? 1)) as PowerEntry['values'],
    ranges:
      h && h.outcomes.length > 1
        ? (per.map((v) => [scaled(v, minF), scaled(v, maxF)]) as NonNullable<PowerEntry['ranges']>)
        : null,
  }
}
export const moveEntries = (p: Pokemon, moves: Move[], item?: string, rank = 0) =>
  powerCandidates(p, moves, item, rank).map((c) => toEntry(p, c))

export interface PowerRow {
  type: TypeId
  best: PowerEntry
  alt: PowerEntry | null // best 에 페널티가 있을 때 페널티 없는 차선
}

// 결정력 비교: S32+성격(기댓값) → 페널티 적은 쪽 → 특성 없이 되는 쪽
const better = (a: PowerCandidate, b: PowerCandidate) =>
  a.top !== b.top
    ? a.top > b.top
    : a.penalties.length !== b.penalties.length
      ? a.penalties.length < b.penalties.length
      : !a.ability && !!b.ability

// category: 물리 / 특수만 볼 때 (그 분류 안에서 다시 고름)
// allowed: 이 페널티가 있는 기술만 고를 수 있음 (생략 = 전부 허용). 빠진 페널티가 있는 기술은 고르지 않는다
export function powerRows(
  p: Pokemon,
  cands: PowerCandidate[],
  category?: PowerEntry['category'],
  allowed?: ReadonlySet<Penalty>,
): PowerRow[] {
  const byType = new Map<TypeId, PowerCandidate[]>()
  for (const c of cands) {
    if (category && c.category !== category) continue
    if (allowed && !c.penalties.every((x) => allowed.has(x))) continue
    const list = byType.get(c.type) ?? []
    list.push(c)
    byType.set(c.type, list)
  }
  const rows: PowerRow[] = []
  for (const [type, list] of byType) {
    const best = list.reduce((a, b) => (better(b, a) ? b : a))
    let alt: PowerCandidate | null = null
    if (best.penalties.length) {
      for (const c of list) if (!c.penalties.length && (!alt || better(c, alt))) alt = c
    }
    rows.push({ type, best: toEntry(p, best), alt: alt && toEntry(p, alt) })
  }
  return rows.sort((a, b) => b.best.values[2] - a.best.values[2])
}

// ── 스피드 ─────────────
export type SpeedCfg = 's0' | 's32' | 's32plus' | 'scarf' | 'scarfPlus'
export const SPEED_CFGS: readonly SpeedCfg[] = ['s0', 's32', 's32plus', 'scarf', 'scarfPlus']

// 스피드를 바꾸는 특성 → 조건을 만족한 상태 (날씨·필드, 도구 소모, 상태이상, 1턴 뒤 가속)
export const SPEED_ABILITIES: Record<string, SpeedContext> = {
  swiftswim: { weather: 'rain' },
  chlorophyll: { weather: 'sun' },
  sandrush: { weather: 'sand' },
  slushrush: { weather: 'snow' },
  surgesurfer: { terrain: 'electric' },
  unburden: { itemLost: true },
  quickfeet: { status: 'brn' },
  speedboost: { boost: 1 },
}

export interface SpeedRow {
  ability: string // 보정을 준 특성 ('' = 특성 보정 없음)
  values: (number | null)[] // SPEED_CFGS 순서. 스카프를 못 쓰면(메가진화 / 곡예) null
}
// 포켓몬 하나의 스피드 줄들: 특성 보정 없음 + 스피드 특성마다 한 줄. rank: 스피드 랭크
// canScarf: 메가진화는 메가스톤을 지니므로 스카프 불가
export function speedRows(p: Pokemon, canScarf = !p.mega, rank = 0): SpeedRow[] {
  const abilities = ['', ...new Set(p.abilities.filter((a) => SPEED_ABILITIES[a]))]
  return abilities.map((ability) => {
    const ctx = ability ? SPEED_ABILITIES[ability]! : {}
    const values = SPEED_CFGS.map((cfg) => {
      const scarf = cfg === 'scarf' || cfg === 'scarfPlus'
      if (scarf && (!canScarf || ability === 'unburden')) return null // 스카프는 소모되지 않음
      const plus = cfg === 's32plus' || cfg === 'scarfPlus'
      const stat = calcStat(
        'spe',
        p.stats.spe,
        cfg === 's0' ? 0 : 32,
        plus ? plusNature('spe') : null,
      )
      return effectiveSpeed(stat, {
        ...ctx,
        ability,
        item: scarf ? 'choicescarf' : '',
        boost: Math.max(-6, Math.min(6, (ctx.boost ?? 0) + rank)),
      })
    })
    return { ability, values }
  })
}
