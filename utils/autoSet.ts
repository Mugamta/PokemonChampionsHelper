// utils/autoSet.ts — 상대 포켓몬 자동 배치 (선출 화면에서 포켓몬을 고르면 특성·도구·성격·능력 포인트·기술을 채운다)
//   도구: 메가진화가 있으면 메가스톤 (여러 개면 첫 번째), 없으면 도구 없음
//   분류: 결정력 지수 p = 풀보정 최고 결정력 ÷ 3만 (쓸 만한 공격기, 그 기술의 공격 능력치 32 + 상승 성격)
//         내구 지수 b = 풀보정 내구 ÷ 7만 (H32 + 방어(특방)32 + 상승 성격, 물리·특수 평균)
//         p ÷ b ≥ 1.05 → 딜러형, < 0.85 → 내구형, 그 사이 → 딜포터형.
//         내구형이어도 p > 1(결정력 3만 초과)이거나 공격·특공 종족값 130 이상이면 딜포터형.
//         딜포터·내구형 중 p < 1, b < 1 (둘 다 낮음)이고 스피드 종족값 100 이상이면 스피드형
//   특성: 풀보정 최고 결정력이 가장 높은 특성 (같으면 앞 순서). 메가진화는 메가 폼 특성이 정해져 있음
//   주력 공격 능력치: 공격·특공 종족값 중 높은 쪽 (천하장사·순수한힘은 공격 2배로 비교, 같으면 결정력 높은 분류)
//   성격: 내구형은 방어·특방 중 종족값이 높은 쪽 ↑, 나머지는 주력 ↑. 모두 주력이 아닌 공격 능력치 ↓
//   능력 포인트: 딜러형 주력32 + S32 + H2 (AS·CS) / 내구형 H32 + 높은 방어 32 + 다른 쪽 2 (HB·HD)
//               / 딜포터형 H32 + 주력32 + 높은 방어 2 (HA·HC) / 스피드형 H32 + S32 + 높은 방어 2 (HS, 스피드 ↑ 성격)
//   기술
//     내구형·스피드형: 스텔스록 → 앙코르 → 하품 → 도발 → 날려버리기/울부짖기 → 회복기 순으로 배우는 것 3개
//             (이 중 1개 이하만 배우면 빛의장막 → 리플렉터 → 전기자석파 → 희생기(추억의선물·철제광선 등)도)
//             + 한 턴 휴식 없는 최고 결정력 기술(명중 90 이상) + 교체기(유턴·볼트체인지 등)
//     딜러형: ① 한 턴 휴식 없는 최고 결정력 2개 (명중 90 이상, 타입이 서로 다르게, 하나는 자속기 —
//             명중 90 이상 자속기가 없으면 명중이 낮아도) ② 스피드 상승기 ③ 결정력 상승기
//             ④ 기술이 없는 자속 타입의 최고 기술 ⑤ 비자속 최고 ⑥ 선공기 ⑦ 전용기 ⑧ 자속 최고(한 턴 휴식 포함)
//     딜포터형: ① ③ + 회복기 + ④ ⑤ + 교체기 + ⑥ ⑦ ⑧ (스피드 상승기 대신 회복기, 선공기보다 교체기 우선)
//     회복기: 반피 회복기, 없으면 잠자기 + 잠꼬대 + 일격기 세트 (셋 다 배우고 공격기도 함께 들어갈 칸이 있을 때만.
//             딜포터형은 최고 결정력 기술 + 이 세트)
//     전용기: 이 포켓몬(같은 종의 폼 포함)만 배우는 공격기
//     남은 칸은 결정력 순, 그래도 남으면 (공격기가 없는 메타몽 등) 배우는 기술 id 순
//   결정력이 같으면 명중 100(필중 포함) · 명중 외 페널티 없음 · 부가효과 있음 중 많이 해당하는 기술 우선
//   ② 스피드 상승기 (공격기 포함, 메가진화 전·후 특성에 가속이 있으면 생략): 주력도 오르는 것 → 랭크 합 → 공격기 우선 (고속이동 < 니트로차지).
//      주력과 분류가 다른 공격기(특수형의 개척하기 등)는, 스피드 2랭크 이상 또는 주력도 오르는 변화기
//      (고속이동·용의춤 등)를 배우면 쓰지 않음
//   ③ 결정력 상승기: 주력 공격 능력치가 오르면서 랭크 합 2 이상(칼춤·용의춤·벌크업·똬리틀기 등)이거나 공격기.
//      랭크 합이 큰 것 → 스피드도 오르는 것 우선 (②가 이미 그런 기술이면 생략)
//   랭크 합: 공격·특공이 같이 오르면 하나로, 스피드는 몇 랭크든 1 로. 변화기가 공격 능력치를 올리면 주력 쪽만
//   빼는 기술 (①~⑤·⑦): 모으기(솔라빔 등), 자폭류, 철제광선, 조건부(속이다·기습 등), 상대 능력치로 위력이 정해지는 기술(속임수)
//   기선제압·페인트는 배워도 넣지 않음

import { effectiveMoveType, powerIndex } from './damage'
import { bulkIndex, hitsUsed, movePenalties } from './perfTable'
import { calcStat, calcStats } from './stats'
import type { BoostKey, Move, Nature, Pokemon, StatKey, StatTable, TypeId } from './types'

export const ATTACKER_THRESHOLD = 30000
export const BULK_THRESHOLD = 70000
export const BASE_ATTACK_THRESHOLD = 130 // 공격·특공 종족값이 이 이상이면 내구형이 아니라 딜포터형
// 결정력 지수 ÷ 내구 지수: [1] 이상이면 딜러형, [0] 미만이면 내구형
export const ROLE_RATIO: readonly [number, number] = [0.85, 1.05]
export const FAST_BASE = 100 // 스피드형: 스피드 종족값 이 이상
export type Role = 'attacker' | 'hybrid' | 'defender' | 'speedy'
export const MIN_ACCURACY = 90 // ① 최고 결정력 기술은 명중 이 이상만

export const HEAL_MOVES = [
  'recover',
  'softboiled',
  'roost',
  'slackoff',
  'milkdrink',
  'synthesis',
  'morningsun',
  'moonlight',
  'shoreup',
  'healorder',
]
// 내구형 기술 (앞에서부터 우선). 한 묶음에서 하나만
export const SUPPORT_GROUPS: readonly (readonly string[])[] = [
  ['stealthrock'],
  ['encore'],
  ['yawn'],
  ['taunt'],
  ['whirlwind', 'roar'],
  HEAL_MOVES,
]
// 위 지원기를 1개 이하로만 배우는 내구형이 추가로 고려하는 기술 (빛의장막 → 리플렉터 → 전기자석파 → 희생기)
export const EXTRA_SUPPORT_GROUPS: readonly (readonly string[])[] = [
  ['lightscreen'],
  ['reflect'],
  ['thunderwave'],
  // 희생기: 쓰러지거나 HP 절반을 깎는 기술
  [
    'memento',
    'healingwish',
    'steelbeam',
    'explosion',
    'mistyexplosion',
    'selfdestruct',
    'finalgambit',
  ],
]
// 일격기 (잠자기 세트용)
const OHKO_MOVES = ['fissure', 'sheercold', 'horndrill', 'guillotine']
// 교체기 (공격기는 자속 → 주력 분류 → 결정력 순, 변화기는 이 순서)
const PIVOT_MOVES = [
  'uturn',
  'voltswitch',
  'flipturn',
  'partingshot',
  'chillyreception',
  'teleport',
]

const OPP_STAT_POWER = new Set(['foulplay'])
const UNUSABLE = new Set(['charge', 'selfKo', 'selfDamage', 'condition'])
// 배워도 넣지 않는 기술 (기선제압: 상대 선공기에만 성공, 페인트: 위력 30)
const NEVER = new Set(['upperhand', 'feint'])

export interface AutoSetInput {
  base: Pokemon // 원종 (슬롯의 species)
  form: Pokemon // 배틀에서 쓰는 폼 (메가 폼 / 팔라피 마이티폼). 능력치 비교에 사용
  atkForm: Pokemon // 공격할 때 폼 (킬가르도 블레이드폼). 결정력 계산에 사용
  item: string // 지닐 도구 (메가스톤 또는 '')
  moves: Move[] // 배우는 기술
  natures: Record<string, Nature>
  ratio?: readonly [number, number] // 비교 검토용 (기본 ROLE_RATIO)
  exclusive?: ReadonlySet<string> // 전용기 (이 포켓몬만 배우는 기술 id). exclusiveMoves() 로 만든다
}

// 기술마다 배우는 종(폼은 원종으로 묶음) 수를 세어, 한 종만 배우는 기술 = 그 종의 전용기
export function exclusiveMoves(pokemon: Record<string, Pokemon>): Map<string, Set<string>> {
  const learners = new Map<string, Set<string>>()
  for (const p of Object.values(pokemon))
    for (const m of p.learnset ?? []) {
      const set = learners.get(m) ?? new Set<string>()
      set.add(p.base || p.id)
      learners.set(m, set)
    }
  const bySpecies = new Map<string, Set<string>>()
  for (const [m, set] of learners) {
    if (set.size !== 1) continue
    const sp = [...set][0]!
    const list = bySpecies.get(sp) ?? new Set<string>()
    list.add(m)
    bySpecies.set(sp, list)
  }
  return bySpecies
}

export interface AutoSet {
  role: Role
  ability: string // 슬롯에 저장할 특성 (메가진화면 원종 특성 — 실제 특성은 메가 폼 것)
  item: string
  nature: string
  sp: StatTable
  moves: [string, string, string, string]
  source?: 'usage' | 'rules' // usage = 사용률 통계, rules = 아래 규칙
}

const zero = (): StatTable => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
const isAttack = (m: Move) => m.category !== 'status' && !!m.power && !OPP_STAT_POWER.has(m.id)
const atkStatOf = (m: Move): BoostKey =>
  m.id === 'bodypress' ? 'def' : m.category === 'physical' ? 'atk' : 'spa'
const natureId = (natures: Record<string, Nature>, plus: StatKey, minus: StatKey) =>
  Object.values(natures).find((n) => n.plus === plus && n.minus === minus)?.id ?? 'serious'
// 확정으로 오르는 자기 능력 (부가효과 확률 100 포함)
const selfBoost = (m: Move, k: BoostKey) =>
  m.effects.reduce(
    (s, e) =>
      e.type === 'boost' && e.target === 'self' && (e.chance ?? 100) >= 100
        ? s + Math.max(0, e.stats[k] ?? 0)
        : s,
    0,
  )
// 확정으로 오르는 자기 랭크 합 (명중 포함). 공격·특공이 같이 오르면 하나만 오른 것으로 치고,
// 스피드는 몇 랭크든 1 로 침 (껍질깨기 = 공격2 + 스피드1 = 3, 고속이동 = 1)
const rankSum = (m: Move) => {
  const up: Partial<Record<string, number>> = {}
  for (const e of m.effects)
    if (e.type === 'boost' && e.target === 'self' && (e.chance ?? 100) >= 100)
      for (const [k, v] of Object.entries(e.stats)) up[k] = (up[k] ?? 0) + Math.max(0, v ?? 0)
  const { atk = 0, spa = 0, spe = 0, ...rest } = up
  return (
    Math.max(atk, spa) +
    Math.min(spe, 1) +
    Object.values(rest).reduce((a: number, v) => a + (v ?? 0), 0)
  )
}

export function autoSet(input: AutoSetInput): AutoSet {
  const { base, form, atkForm, item, natures } = input
  const moves = input.moves.filter((m) => !NEVER.has(m.id))
  const isMega = !!form.mega
  const abilities = isMega ? [form.abilities[0]!] : [...new Set(base.abilities)]
  const attacks = moves.filter(isAttack)

  // 결정력 (연속기는 타수 기댓값, 파티 화면과 같은 기준)
  const power = (m: Move, stats: StatTable, ability: string) => {
    const v = powerIndex(m, { species: atkForm, stats, ability, item })
    return v == null ? 0 : Math.floor(v * (hitsUsed(m, ability, item)?.expFactor ?? 1))
  }
  const pens = (m: Move, ability: string) => movePenalties(m, ability, item)
  const usable = (m: Move, ability: string) => !pens(m, ability).some((p) => UNUSABLE.has(p))
  const noRecharge = (m: Move, ability: string) =>
    usable(m, ability) && !pens(m, ability).includes('recharge')

  // 풀보정 결정력: 그 기술의 공격 능력치 32 + 상승 성격
  const fullPower = (m: Move, ability: string) => {
    const k = atkStatOf(m)
    const stats = calcStats(atkForm.stats, { [k]: 32 }, { id: '+', plus: k, minus: null })
    return power(m, stats, ability)
  }
  const bestFull = (ability: string) =>
    Math.max(0, ...attacks.filter((m) => noRecharge(m, ability)).map((m) => fullPower(m, ability)))

  // 특성: 풀보정 최고 결정력이 가장 높은 것
  let ability = abilities[0] ?? ''
  for (const a of abilities) if (bestFull(a) > bestFull(ability)) ability = a
  const slotAbility = isMega ? base.abilities[0] || '' : ability
  const fs = form.stats

  // 분류: 결정력 지수 ÷ 내구 지수
  const fullBulk = (k: 'def' | 'spd') =>
    bulkIndex(calcStat('hp', fs.hp, 32), calcStat(k, fs[k], 32, { id: '+', plus: k, minus: null }))
  const p = bestFull(ability) / ATTACKER_THRESHOLD
  const b = (fullBulk('def') + fullBulk('spd')) / 2 / BULK_THRESHOLD
  const [low, high] = input.ratio ?? ROLE_RATIO
  const r = p / b
  let role: Role = r >= high ? 'attacker' : r < low ? 'defender' : 'hybrid'
  if (role === 'defender' && (p > 1 || Math.max(fs.atk, fs.spa) >= BASE_ATTACK_THRESHOLD))
    role = 'hybrid'
  if (role !== 'attacker' && p < 1 && b < 1 && fs.spe >= FAST_BASE) role = 'speedy'

  // 주력 공격 능력치: 공격·특공 종족값 중 높은 쪽. 특성 반영 (천하장사·순수한힘 = 공격 2배).
  // 같으면 풀보정 결정력이 더 높은 분류
  const atkMul = ability === 'hugepower' || ability === 'purepower' ? 2 : 1
  const bestOf = (cat: Move['category']) =>
    Math.max(
      0,
      ...attacks
        .filter((m) => m.category === cat && m.id !== 'bodypress' && noRecharge(m, ability))
        .map((m) => fullPower(m, ability)),
    )
  const effAtk = fs.atk * atkMul
  const mainStat: 'atk' | 'spa' =
    effAtk !== fs.spa
      ? effAtk > fs.spa
        ? 'atk'
        : 'spa'
      : bestOf('special') > bestOf('physical')
        ? 'spa'
        : 'atk'
  const subStat = mainStat === 'atk' ? 'spa' : 'atk'
  const mainCat: Move['category'] = mainStat === 'atk' ? 'physical' : 'special'

  // 성격·능력 포인트
  const sp = zero()
  const hi = fs.def >= fs.spd ? 'def' : 'spd'
  const lo = hi === 'def' ? 'spd' : 'def'
  let nature: string
  if (role === 'defender') {
    sp.hp = 32
    sp[hi] = 32
    sp[lo] = 2
    nature = natureId(natures, hi, subStat)
  } else if (role === 'hybrid') {
    sp.hp = 32
    sp[mainStat] = 32
    sp[hi] = 2
    nature = natureId(natures, mainStat, subStat)
  } else if (role === 'speedy') {
    sp.hp = 32
    sp.spe = 32
    sp[hi] = 2
    nature = natureId(natures, 'spe', subStat)
  } else {
    sp[mainStat] = 32
    sp.spe = 32
    sp.hp = 2
    nature = natureId(natures, mainStat, subStat)
  }

  // 실제 배치 능력치로 결정력 순 정렬
  const stats = calcStats(atkForm.stats, sp, natures[nature] ?? null)
  const pw = new Map(attacks.map((m) => [m.id, power(m, stats, ability)]))
  const pwOf = (m: Move) => pw.get(m.id) ?? 0
  // 결정력이 같으면 좋은 조건(명중 100·필중 / 명중 외 페널티 없음 / 부가효과 있음)에 많이 해당하는 것
  const merit = (m: Move) =>
    Number((m.accuracy ?? 100) >= 100) +
    Number(!pens(m, ability).some((x) => x !== 'accuracy')) +
    Number(m.effects.some((e) => 'chance' in e && e.chance != null))
  const byPower = (list: Move[]) =>
    [...list].sort((x, y) => pwOf(y) - pwOf(x) || merit(y) - merit(x))
  const typeOf = (m: Move): TypeId => effectiveMoveType(m, ability, {}, atkForm)
  const stab = (m: Move) => atkForm.types.includes(typeOf(m))
  const byId = (id: string) => moves.find((x) => x.id === id)

  const picked: Move[] = []
  const has = (m: Move) => picked.some((x) => x.id === m.id)
  const add = (m: Move | undefined) => {
    if (m && picked.length < 4 && !has(m)) picked.push(m)
    return !!m
  }
  const free = (list: Move[]) => list.filter((m) => !has(m))
  const nr = attacks.filter((m) => noRecharge(m, ability))
  // ① 용: 기술 자체의 명중 90 이상 (필중 포함, 특성 보정 전. 없으면 전체)
  const accurate = (m: Move) => (m.accuracy ?? 100) >= MIN_ACCURACY
  const strongList = nr.some(accurate) ? nr.filter(accurate) : nr
  const ok = attacks.filter((m) => usable(m, ability))
  // 변화기가 공격 능력치를 올리면 주력 쪽이어야 함 (특수형의 용의춤 등은 쓰지 않음)
  const fitsMain = (m: Move) =>
    m.category !== 'status' || selfBoost(m, subStat) === 0 || selfBoost(m, mainStat) > 0

  // ① 한 턴 휴식 없는 최고 결정력 2개 (명중 90 이상, 두 번째는 첫 번째와 다른 타입)
  //    둘 중 하나는 자속기 (명중 90 이상 자속기가 없으면 명중이 낮아도)
  const topTwo = () => {
    const [top] = byPower(strongList)
    if (!top) return
    add(top)
    const other = (list: Move[]) => byPower(list).find((m) => typeOf(m) !== typeOf(top))
    if (stab(top)) add(other(strongList))
    else add(other(strongList.filter(stab)) ?? other(nr.filter(stab)) ?? other(strongList))
  }
  // 회복기: 반피 회복기, 없으면 잠자기 + 잠꼬대 + 일격기 (세트, 셋 다 배울 때만). reserve: 공격기용으로 남겨 둘 칸 수
  const half = HEAL_MOVES.map(byId).find(Boolean)
  const restSet = [byId('rest'), byId('sleeptalk'), OHKO_MOVES.map(byId).find(Boolean)]
  const canRestSet = !half && restSet.every(Boolean)
  const addHeal = (reserve: number) => {
    if (half) return add(half)
    if (!canRestSet || 4 - picked.length < restSet.length + reserve) return false
    for (const m of restSet) add(m)
    return true
  }
  // ⑦ 전용기
  const signature = () => add(byPower(free(attacks).filter((m) => input.exclusive?.has(m.id)))[0])
  // ② 스피드 상승기: 주력 공격 능력치도 오르는 것 → 랭크 합 → 공격기 → 결정력 순
  //    (스피드는 1 로 치므로 고속이동(1)과 니트로차지(1)면 공격기인 니트로차지)
  //    주력과 분류가 다른 공격기는 스피드 2랭크 이상·주력도 오르는 변화기를 배우면 제외
  const speedUp = () => {
    let list = free(moves.filter((m) => selfBoost(m, 'spe') > 0 && fitsMain(m)))
    const good = (m: Move) =>
      m.category === 'status' && (selfBoost(m, 'spe') >= 2 || selfBoost(m, mainStat) > 0)
    if (list.some(good)) list = list.filter((m) => !isAttack(m) || m.category === mainCat)
    const rank = (m: Move) =>
      (selfBoost(m, mainStat) > 0 ? 100 : 0) + rankSum(m) * 10 + (isAttack(m) ? 1 : 0)
    const m = list.sort((x, y) => rank(y) - rank(x) || pwOf(y) - pwOf(x))[0]
    add(m)
    return m
  }
  // ③ 결정력 상승기: 주력 공격 능력치가 오르면서 랭크 합이 2 이상이거나 공격기인 것.
  //    랭크 합이 큰 것 → 스피드도 오르는 것 → 주력 상승량 → 결정력 순
  const powerUp = (m: Move) => selfBoost(m, mainStat) > 0 && (rankSum(m) >= 2 || isAttack(m))
  const addPowerUp = () =>
    add(
      free(moves.filter(powerUp)).sort(
        (x, y) =>
          rankSum(y) - rankSum(x) ||
          Number(selfBoost(y, 'spe') > 0) - Number(selfBoost(x, 'spe') > 0) ||
          selfBoost(y, mainStat) - selfBoost(x, mainStat) ||
          pwOf(y) - pwOf(x),
      )[0],
    )
  // ④ 기술이 없는 자속 타입 ⑤ 비자속 최고
  const coverage = () => {
    for (const t of atkForm.types) {
      if (picked.some((m) => isAttack(m) && typeOf(m) === t)) continue
      add(byPower(free(nr).filter((m) => typeOf(m) === t))[0])
    }
    add(byPower(free(nr).filter((m) => !stab(m)))[0])
  }
  // 교체기: 공격기(자속 → 주력 분류 → 결정력) → 변화기
  const pivot = () => {
    const list = free(PIVOT_MOVES.map(byId).filter((m): m is Move => !!m))
    const atk = list
      .filter(isAttack)
      .sort(
        (x, y) =>
          Number(stab(y)) - Number(stab(x)) ||
          Number(y.category === mainCat) - Number(x.category === mainCat) ||
          pwOf(y) - pwOf(x),
      )
    add(atk[0] ?? list[0])
  }
  // ⑥ 선공기 (우선도 높은 것 → 자속 → 위력 순)
  const priority = () =>
    add(
      free(attacks)
        .filter((m) => m.priority > 0)
        .sort(
          (x, y) =>
            y.priority - x.priority ||
            Number(stab(y)) - Number(stab(x)) ||
            (y.power ?? 0) - (x.power ?? 0),
        )[0],
    )
  // ⑧ 자속 최고 (한 턴 휴식 포함)
  const bestStab = () => add(byPower(free(ok).filter(stab))[0])

  if (role === 'defender' || role === 'speedy') {
    // 지원기는 3칸까지 (잠자기·잠꼬대는 2칸, 공격기 한 칸을 남길 수 있을 때만).
    // 기본 지원기가 1개 이하면 빛의장막·리플렉터·전기자석파·희생기도
    const main = SUPPORT_GROUPS.filter((g) =>
      g === HEAL_MOVES ? !!half || canRestSet : g.some(byId),
    ).length
    const groups = main <= 1 ? [...SUPPORT_GROUPS, ...EXTRA_SUPPORT_GROUPS] : SUPPORT_GROUPS
    for (const group of groups) {
      if (picked.length >= 3) break
      if (group === HEAL_MOVES) addHeal(1)
      else add(group.map(byId).find(Boolean))
    }
    add(byPower(free(strongList))[0] ?? byPower(free(nr))[0])
    pivot()
  } else if (role === 'hybrid' && canRestSet) {
    // 잠자기 세트: 최고 결정력 기술(자속 우선) 하나 + 잠자기 + 잠꼬대 + 일격기
    add(byPower(strongList.filter(stab))[0] ?? byPower(strongList)[0])
    addHeal(0)
  } else if (role === 'hybrid') {
    topTwo()
    addPowerUp()
    addHeal(0)
    coverage()
    pivot()
    priority()
    signature()
    bestStab()
  } else {
    topTwo()
    // 메가진화 전·후 특성에 가속이 있으면 스피드 상승기는 쓰지 않음
    const speedBoost = [...base.abilities, ...form.abilities].includes('speedboost')
    const speed = speedBoost ? undefined : speedUp()
    // 스피드 상승기가 이미 결정력 상승기면 생략
    if (!speed || !powerUp(speed)) addPowerUp()
    coverage()
    priority()
    signature()
    bestStab()
  }
  // 남은 칸: 결정력 순 (빼는 기술·한 턴 휴식 기술은 뒤로)
  for (const m of [...byPower(free(nr)), ...byPower(free(ok)), ...byPower(free(attacks))]) add(m)
  // 그래도 남으면 (공격기가 없는 메타몽 등) 기술 id 순서대로
  for (const m of [...moves].sort((x, y) => x.id.localeCompare(y.id))) add(m)

  const ids = picked.map((m) => m.id)
  return {
    role,
    ability: slotAbility,
    item,
    nature,
    sp,
    moves: [ids[0] ?? '', ids[1] ?? '', ids[2] ?? '', ids[3] ?? ''],
  }
}

// ── 사용률 통계 우선 ─────────────
// public/data/usage.json (scripts/build-data.mjs 가 Smogon 월별 통계에서 생성). 레귤레이션별 싱글 포맷
export interface UsageSet {
  count: number // 사용 수
  usage?: number // 팀 채용률 (0~1, 레이팅 가중)
  moves: string[] // 많이 쓴 순 (최대 4개, 배우는 기술만)
  moveShare?: number[] // moves 와 같은 순서, 각 기술 채용률 (0~1)
  moveUsage?: Record<string, number> // 기술별 채용률 전체 (0.5% 이상, 0~1)
  nature?: string
  sp?: number[] // H A B C D S
  spreadShare?: number // 이 배분(성격 + 능력 포인트)의 비율 (0~1)
  ability: string
  items: string[] // 많이 쓴 순 (최대 3개)
  itemShare?: number[] // items 와 같은 순서, 각 도구 채용률 (0~1)
}
// 사용률 통계 종류: 싱글(배틀스타디움 싱글) / 더블(VGC)
export type UsageKind = 'single' | 'double'
export type UsageData = Record<UsageKind, Record<string, UsageTable>>
export interface UsageTable {
  format: string
  month: string
  battles: number
  pokemon: Record<string, UsageSet> // 폼 id (메가 폼은 메가 id)
}

// 통계가 있으면 그걸로 배치: 원종·메가 폼 중 사용 수가 많은 쪽, 많이 쓴 기술 4개·배분·특성·도구.
// 기술이 4개가 안 되면 규칙 배치(fallback)로 채운다. 통계가 없으면 null.
// taken: 같은 파티의 다른 포켓몬이 지닌 도구 (도구 중복 금지 → 다음으로 많이 쓴 도구)
export function usageSet(
  base: Pokemon,
  table: UsageTable | undefined,
  pokemon: Record<string, Pokemon>,
  fallback: AutoSet,
  taken: readonly string[] = [],
): AutoSet | null {
  if (!table) return null
  const formId = [base.id, ...(base.megas ?? [])]
    .filter((id) => table.pokemon[id])
    .sort((a, b) => table.pokemon[b]!.count - table.pokemon[a]!.count)[0]
  if (!formId) return null
  const u = table.pokemon[formId]!
  const mega = pokemon[formId]?.mega
  const item = mega ? mega.item : (u.items.find((i) => !taken.includes(i)) ?? '')
  // 메가진화면 슬롯에는 원종 특성 (원종 통계의 특성 → 첫 특성)
  const baseAbility = table.pokemon[base.id]?.ability
  const ability = mega
    ? baseAbility && base.abilities.includes(baseAbility)
      ? baseAbility
      : base.abilities[0] || ''
    : base.abilities.includes(u.ability)
      ? u.ability
      : fallback.ability
  const sp: StatTable =
    u.sp?.length === 6
      ? { hp: u.sp[0]!, atk: u.sp[1]!, def: u.sp[2]!, spa: u.sp[3]!, spd: u.sp[4]!, spe: u.sp[5]! }
      : fallback.sp
  const ids = [...new Set([...u.moves, ...fallback.moves].filter(Boolean))].slice(0, 4)
  return {
    role: fallback.role,
    ability,
    item,
    nature: u.nature && u.sp ? u.nature : fallback.nature,
    sp,
    moves: [ids[0] ?? '', ids[1] ?? '', ids[2] ?? '', ids[3] ?? ''],
    source: 'usage',
  }
}

// ── 사용률 상위 (첫 화면) ─────────────
// 보여 줄 통계 표: 지정한 레귤레이션(현재)의 표, 없으면 자료 월이 가장 최근인 표 (같으면 뒤에 있는 레귤레이션)
export function pickUsageTable(
  tables: Record<string, UsageTable> | undefined,
  regId?: string | null,
): { reg: string; table: UsageTable } | null {
  const entries = Object.entries(tables ?? {})
  const own = regId ? entries.find(([id]) => id === regId) : undefined
  const pick =
    own ??
    entries.reduce<(typeof entries)[number] | undefined>(
      (best, e) => (!best || e[1].month >= best[1].month ? e : best),
      undefined,
    )
  return pick ? { reg: pick[0], table: pick[1] } : null
}

// 채용률 높은 순 n개 (폼별 — 메가 폼은 원종과 따로). 채용률이 없는 예전 자료는 사용 수 순
export function topUsage(table: UsageTable, n: number): (UsageSet & { id: string })[] {
  return Object.entries(table.pokemon)
    .sort((a, b) => (b[1].usage ?? 0) - (a[1].usage ?? 0) || b[1].count - a[1].count)
    .slice(0, n)
    .map(([id, u]) => ({ id, ...u }))
}
