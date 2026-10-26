// utils/recommend.ts — 추천 플레이 (싱글, 한 턴 앞 이득표)
// 내 선택지(기술·교체) × 상대 선택지(기술·교체) 마다 이번 턴 결과를 점수로 매기고,
//   기대값 추천 = 상대 선택지 가중 평균이 가장 높은 것, 안전 추천 = 유력한 상대 선택지 중 최악의 경우가 가장 나은 것.
// 데미지·순서 같은 계산 재료는 composables/useRecommend.ts 가 배틀 상태에서 만들어 넘긴다 (여기는 순수 계산).
// 모든 HP·데미지는 그 포켓몬 최대 HP 대비 비율(0~1).
//
// 점수 = (상대가 잃은 HP − 내가 잃은 HP) + ko × (쓰러뜨릴 확률 − 쓰러질 확률) + duel × 턴 뒤 맞대결 전망 + 설치기 가치
//   한 칸은 선후공 → 먼저 움직이는 쪽 행동(행동 불가·KO·풀죽음·교체기) → 나중 쪽 행동 → 턴 끝 회복 을 경우마다 나눠 계산한다
//   맞대결 전망(duelValue): 턴 뒤 남은 HP 로 서로 가장 센 공격을 주고받으면 누가 이기는가 (−1 ~ 1)
//   → 랭크업·상태이상·벽·교체의 가치는 이 항으로 드러난다

// ── 가중치 (화면에서 바꿀 수 있음) ─────────────
export interface RecWeights {
  ko: number // 쓰러뜨림/쓰러짐 확률
  duel: number // 턴 뒤 맞대결 전망
  hazard: number // 설치기 가치 (앞으로 들어올 포켓몬이 받을 데미지 합)
  smart: number // 상대가 자기에게 유리한 선택을 고르는 정도 (0 = 채용률만)
  oppSwitch: number // 상대 교체의 사전 비중 (기술 채용률과 같은 단위, 0 = 교체 안 함)
  plausible: number // 안전 추천에서 볼 상대 선택지의 최소 비중 (0~1)
}
export const DEFAULT_WEIGHTS: RecWeights = {
  ko: 0.6,
  duel: 0.5,
  hazard: 1,
  smart: 3,
  oppSwitch: 0.3,
  plausible: 0.1,
}
export const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof RecWeights)[]
// 저장값·입력값 정리: 숫자가 아니면 기본값, 음수는 0, plausible 은 1 이하
export function normalizeWeights(raw: unknown): RecWeights {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_WEIGHTS }
  for (const k of WEIGHT_KEYS) {
    const v = Number(src[k])
    if (src[k] != null && src[k] !== '' && Number.isFinite(v)) out[k] = Math.max(0, v)
  }
  out.plausible = Math.min(1, out.plausible)
  return out
}

// 한 번 공격 (맞는 쪽 최대 HP 대비). 명중률은 포함하지 않은 데미지 범위 + 명중률 + 지금 HP 에서 이번 한 번에 쓰러뜨릴 확률
export interface Hit {
  min: number
  max: number
  acc: number // 0~1
  ko: number // 0~1 (명중·급소 포함)
}

// 행동하지 못하는 턴 수의 분포 (잠듦·반동). 합 1
export type Skip = { turns: number; p: number }[]

// 턴 뒤 맞대결 재료: 서로 가장 센 공격의 한 번 기대 데미지(명중 포함, 턴 끝 상태이상 데미지 포함) + 내가 먼저 움직일 확률
export interface Duel {
  mine: number // 내 공격 → 상대 (상대 최대 HP 대비)
  opp: number // 상대 공격 → 나
  pFirst: number
  skipMine?: Skip // 처음 몇 턴 행동 불가
  skipOpp?: Skip
  absorbMine?: number // 내 대타가 막아 주는 상대 공격 횟수
  absorbOpp?: number
}
// myHp / oppHp: 강제 교체(울부짖기 등)로 바뀐 포켓몬의 HP — 없으면 이번 턴이 끝난 HP
export type AfterCases = { p: number; duel: Duel; myHp?: number; oppHp?: number }[]

// 공격한 쪽 HP 변화: 준 데미지(맞는 쪽 최대 HP 비율) × perDealt + 맞히면 onHit (자기 최대 HP 비율). 음수 = 회복
export interface SelfEffect {
  perDealt: number
  onHit: number
}

// 내 선택지 하나 × 상대 선택지 하나
export interface Exchange {
  pFirst: number // 이번 턴 내가 먼저 움직일 확률 (교체는 항상 먼저)
  myHp: number // 맞는 내 포켓몬의 지금 HP (교체면 들어오는 포켓몬, 설치기 반영 전)
  oppHp: number // 상대 교체면 들어오는 포켓몬
  mine: Hit | null // 내 공격 (변화기·교체면 null)
  opp: Hit | null // 상대 공격 → 맞는 내 포켓몬
  myActs?: number // 이번 턴 행동할 확률 (잠듦·반동·마비·혼란 등, 기본 1)
  oppActs?: number
  mineStops?: number // 내가 먼저 행동하면 상대가 이번 턴 행동하지 못할 확률 (풀죽음·잠듦, 명중 포함)
  oppStops?: number
  switchIn?: boolean // 내가 교체 → 내 공격 없음, 들어오는 포켓몬이 상대 공격을 받음
  entryChip?: number // 교체로 들어올 때 설치기 데미지
  oppSwitchIn?: boolean // 상대가 교체 → 상대 공격 없음, 내 공격은 들어오는 포켓몬이 받음
  oppEntryChip?: number
  myProtect?: boolean // 방어류: 상대 공격을 막음
  oppProtect?: boolean
  myShieldFirst?: boolean // 대타: 내가 먼저 깔았으면 이번 턴 상대 공격을 막음
  oppShieldFirst?: boolean
  myDestinyBond?: boolean // 길동무: 먼저 썼는데 이번 턴 상대 공격에 쓰러지면 상대도 쓰러짐
  oppDestinyBond?: boolean
  myHeal?: number // 턴 끝에 회복하는 비율 (회복기, 살아 있으면)
  oppHeal?: number
  mySelf?: SelfEffect // 반동·흡수·생명의구슬
  oppSelf?: SelfEffect
  myUtility?: number // 내 기술이 나가면 얻는 가치 (설치기, HP 비율 단위 — 가중치는 composable 에서 곱함)
  oppUtility?: number // 상대 기술이 나가면 내가 잃는 가치
  // 교체기(유턴 등): 내가 행동한 뒤 들어오는 포켓몬. 내가 먼저였으면 상대 공격은 이 포켓몬이 받는다
  pivot?: { myHp: number; entryChip: number; opp: Hit | null }
  // 턴 뒤 맞대결 (랭크·상태이상·벽 변화 반영). 변화기가 걸리는지에 따라 갈리면 경우마다 확률과 함께 (합 1)
  after: AfterCases
  afterPivot?: AfterCases // 교체기로 바뀐 뒤
}

export interface Outcome {
  myLoss: number
  oppLoss: number
  myKo: number
  oppKo: number
  duel: number // 턴 뒤 맞대결 전망 기대값 (둘 다 살아 있을 때만, 아니면 0)
  utility: number
  pFirst: number // 내가 먼저 움직일 확률 (교체는 1)
  immediate: number // 이번 턴 몫 (score 에서 맞대결 전망을 뺀 것) — 두 턴 앞을 볼 때 맞대결 전망 대신 다음 턴 값을 더한다
  score: number
  // 둘 다 살아서 턴이 끝나는 경우 (교체기로 바뀌었는지별): 확률, 그때의 기대 HP
  ends: TurnEnd[]
}
export interface TurnEnd {
  pivoted: boolean
  p: number
  myHp: number
  oppHp: number
}

// ── 한 번 공격 ─────────────
// 남은 HP 로 자른 기대 데미지 (데미지는 min~max 균등이라고 보고, 명중 포함)
export function cappedDamage(h: Hit, hp: number): number {
  if (hp <= 0) return 0
  const { min, max } = h
  if (max <= min) return h.acc * Math.min(min, hp)
  if (hp >= max) return (h.acc * (min + max)) / 2
  if (hp <= min) return h.acc * hp
  // hp 아래 구간은 평균, 위 구간은 hp
  const below = (hp - min) / (max - min)
  return h.acc * (below * ((min + hp) / 2) + (1 - below) * hp)
}
// 쓰러뜨리지 못했을 때의 기대 데미지
//   (KO 확률과 데미지 범위가 어긋나 남은 HP 를 다 깎는 값이 나오면 조금 남긴다)
const damageIfSurvives = (h: Hit, hp: number) =>
  h.ko >= 1 ? 0 : Math.max(0, Math.min(hp * 0.99, (cappedDamage(h, hp) - h.ko * hp) / (1 - h.ko)))

// ── 잠듦 ─────────────
// 행동하려 할 때마다 풀릴 확률(%) 표 (챔피언스: 잠듦 0 → 33 → 100), 이미 시도한 횟수 → 앞으로 행동하지 못하는 턴 수 분포.
// 풀린 턴에는 행동한다
export function skipDist(table: number[], tried: number): Skip {
  const out: Skip = []
  let left = 1
  for (let k = tried; left > 1e-9; k++) {
    const c = (table[k] ?? 100) / 100
    if (c > 0) out.push({ turns: k - tried, p: left * c })
    left *= 1 - c
  }
  return out
}

// 한 턴 지난 뒤: 이번 턴 행동할 확률(쉬는 턴이 0 인 몫)과 남은 분포 (쉬던 턴은 하나씩 줄어듦)
export function advanceSkip(skip: Skip | undefined): { acts: number; rest: Skip | undefined } {
  if (!skip?.length) return { acts: 1, rest: undefined }
  const acts = skip.filter((s) => s.turns <= 0).reduce((a, s) => a + s.p, 0)
  const map = new Map<number, number>()
  for (const s of skip)
    map.set(Math.max(0, s.turns - 1), (map.get(Math.max(0, s.turns - 1)) || 0) + s.p)
  const rest = [...map].map(([turns, p]) => ({ turns, p }))
  return { acts, rest: rest.some((s) => s.turns > 0) ? rest : undefined }
}

// ── 턴 뒤 맞대결 ─────────────
// 서로 가장 센 공격을 계속 주고받을 때 누가 먼저 쓰러뜨리는가. 이기면 0.5 + 0.5 × 남은 HP, 지면 그 반대 (−1 ~ 1)
// 처음 skip 턴은 행동하지 못함 (그동안 맞기만 한다)
export function duelValue(d: Duel, myHp: number, oppHp: number): number {
  if (myHp <= 0 || oppHp <= 0) return 0
  const turns = (hp: number, dmg: number) => (dmg > 0.001 ? Math.ceil(hp / dmg - 1e-9) : Infinity)
  // 내가 쓰러뜨리는 데 필요한 공격 횟수 (대타가 막는 만큼 더)
  const nMine = turns(oppHp, d.mine) + (d.absorbOpp || 0)
  const nOpp = turns(myHp, d.opp) + (d.absorbMine || 0)
  if (nMine === Infinity && nOpp === Infinity) return 0
  const one = (first: boolean, sm: number, so: number) => {
    // 쓰러뜨리는 턴 (행동하지 못하는 턴 뒤로 밀림)
    const tMine = sm + nMine
    const tOpp = so + nOpp
    const win = first ? tMine <= tOpp : tMine < tOpp
    if (win) {
      // 내가 쓰러뜨리는 턴까지 상대가 행동한 횟수 (그 턴에 상대가 먼저면 포함)
      const taken = Math.max(0, tMine - so - (first ? 1 : 0)) * d.opp
      return 0.5 + 0.5 * Math.max(0, myHp - taken)
    }
    const taken = Math.max(0, tOpp - sm - (first ? 0 : 1)) * d.mine
    return -(0.5 + 0.5 * Math.max(0, oppHp - taken))
  }
  const sms = d.skipMine?.length ? d.skipMine : [{ turns: 0, p: 1 }]
  const sos = d.skipOpp?.length ? d.skipOpp : [{ turns: 0, p: 1 }]
  let v = 0
  for (const a of sms)
    for (const b of sos)
      v +=
        a.p *
        b.p *
        (d.pFirst * one(true, a.turns, b.turns) + (1 - d.pFirst) * one(false, a.turns, b.turns))
  return v
}

// ── 선후공 ─────────────
// 같은 우선도에서 내가 먼저 움직일 확률. span: 상대 실전 스피드 범위(관찰·확정 도구로 좁힌 것),
// guess: 선출 화면 배분으로 본 상대 스피드 (범위 안에서 어느 쪽인지 기울이는 데만 씀). 동속은 반반
export function firstChance(
  my: number,
  span: [number, number],
  guess: number | null,
  trickRoom = false,
): number {
  const [lo, hi] = span
  const faster = (o: number) => (my > o ? 1 : my === o ? 0.5 : 0)
  let p: number
  if (my > hi || my < lo || hi === lo) p = my > hi ? 1 : my < lo ? 0 : faster(lo)
  else {
    const spread = (my - lo) / (hi - lo)
    p = guess == null ? spread : (spread + faster(Math.max(lo, Math.min(hi, guess)))) / 2
  }
  return trickRoom ? 1 - p : p
}

// ── 한 칸 결과 ─────────────
// 경우(leaf)마다: 확률, 내 쪽 맞는 포켓몬 HP(교체기면 들어온 포켓몬), 상대 HP, 누적 손실
interface Leaf {
  p: number
  myHp: number
  oppHp: number
  myLoss: number
  oppLoss: number
  myKo: number // 쓰러진 내 포켓몬 수 (교체기면 둘 다 가능)
  pivoted: boolean
  mineActed: boolean
  oppActed: boolean
  oppStopped: boolean
  myStopped: boolean
}

export function evaluate(x: Exchange, w: RecWeights = DEFAULT_WEIGHTS): Outcome {
  const chip = x.switchIn ? Math.min(x.myHp, x.entryChip || 0) : 0
  const oppChip = x.oppSwitchIn ? Math.min(x.oppHp, x.oppEntryChip || 0) : 0
  let leaves: Leaf[] = [
    {
      p: 1,
      myHp: x.myHp - chip,
      oppHp: x.oppHp - oppChip,
      myLoss: chip,
      oppLoss: oppChip,
      myKo: x.myHp > 0 && x.myHp - chip <= 0 ? 1 : 0,
      pivoted: false,
      mineActed: false,
      oppActed: false,
      oppStopped: false,
      myStopped: false,
    },
  ]
  const split = (fn: (l: Leaf) => { p: number; l: Partial<Leaf> }[]) => {
    const next: Leaf[] = []
    for (const l of leaves)
      for (const o of fn(l)) if (o.p > 1e-9) next.push({ ...l, ...o.l, p: l.p * o.p })
    leaves = next
  }
  // 공격한 쪽 HP 변화 (반동·흡수·생명의구슬·대타). 회복은 잃은 만큼까지. acc: 맞힐 확률 (변화기는 1)
  const selfDelta = (e: SelfEffect | undefined, dealt: number, acc: number, hp: number) => {
    if (!e) return 0
    const d = e.perDealt * dealt + e.onHit * acc
    return d >= 0 ? Math.min(hp, d) : Math.max(d, -(1 - hp))
  }

  // 내 행동
  const mineStep = () =>
    split((l) => {
      if (x.switchIn || l.myHp <= 0 || l.myStopped) return [{ p: 1, l: {} }]
      const acts = x.myActs ?? 1
      const out: { p: number; l: Partial<Leaf> }[] = [{ p: 1 - acts, l: {} }]
      const hit = x.oppProtect || (x.oppShieldFirst && l.oppActed) ? null : x.mine
      const stops = x.oppProtect || l.oppActed || x.oppSwitchIn ? 0 : x.mineStops || 0
      const after = (oppHp: number, oppLoss: number, dealt: number): Partial<Leaf>[] => {
        // 막힌 공격은 생명의구슬도 없음
        const sd = selfDelta(x.mySelf, dealt, hit ? hit.acc : x.mine ? 0 : 1, l.myHp)
        const myHp = l.myHp - sd
        const base = { oppHp, oppLoss, myHp, myLoss: l.myLoss + sd, mineActed: true }
        // 교체기: 살아 있으면 들어오는 포켓몬으로
        if (x.pivot && myHp > 0) {
          const pc = Math.min(x.pivot.myHp, x.pivot.entryChip)
          return [
            {
              ...base,
              myHp: x.pivot.myHp - pc,
              myLoss: base.myLoss + pc,
              myKo: l.myKo + (x.pivot.myHp - pc <= 0 ? 1 : 0),
              pivoted: true,
            },
          ]
        }
        return [{ ...base, myKo: l.myKo + (myHp <= 0 ? 1 : 0) }]
      }
      // 상대가 먼저 길동무를 썼으면 쓰러뜨린 내 포켓몬도 쓰러짐 (교체기로 물러나지 못함)
      const bond = (parts: Partial<Leaf>[]): Partial<Leaf>[] =>
        x.oppDestinyBond && l.oppActed
          ? parts.map((part) => ({
              ...part,
              pivoted: false,
              myHp: 0,
              myLoss: l.myLoss + l.myHp,
              myKo: l.myKo + 1,
            }))
          : parts
      const withStop = (p: number, parts: Partial<Leaf>[]) =>
        parts.flatMap((part) =>
          stops > 0 && (part.oppHp ?? l.oppHp) > 0
            ? [
                { p: p * stops, l: { ...part, oppStopped: true } },
                { p: p * (1 - stops), l: part },
              ]
            : [{ p, l: part }],
        )
      if (!hit) out.push(...withStop(acts, after(l.oppHp, l.oppLoss, 0)))
      else {
        const surv = damageIfSurvives(hit, l.oppHp)
        out.push(
          ...withStop(acts * hit.ko, bond(after(0, l.oppLoss + l.oppHp, l.oppHp))),
          ...withStop(acts * (1 - hit.ko), after(l.oppHp - surv, l.oppLoss + surv, surv)),
        )
      }
      return out
    })

  // 상대 행동
  const oppStep = () =>
    split((l) => {
      if (x.oppSwitchIn || l.oppHp <= 0 || l.oppStopped) return [{ p: 1, l: {} }]
      const acts = x.oppActs ?? 1
      const out: { p: number; l: Partial<Leaf> }[] = [{ p: 1 - acts, l: {} }]
      const hit = l.pivoted
        ? (x.pivot?.opp ?? null)
        : x.myProtect || (x.myShieldFirst && l.mineActed)
          ? null
          : x.opp
      const stops = x.myProtect || l.mineActed || x.switchIn ? 0 : x.oppStops || 0
      const after = (myHp: number, myLoss: number, dealt: number, ko: boolean): Partial<Leaf> => {
        const sd = selfDelta(x.oppSelf, dealt, hit ? hit.acc : x.opp ? 0 : 1, l.oppHp)
        return {
          myHp,
          myLoss,
          myKo: l.myKo + (ko ? 1 : 0),
          oppHp: l.oppHp - sd,
          oppLoss: l.oppLoss + sd,
          oppActed: true,
        }
      }
      const withStop = (p: number, part: Partial<Leaf>) =>
        stops > 0 && (part.myHp ?? l.myHp) > 0
          ? [
              { p: p * stops, l: { ...part, myStopped: true } },
              { p: p * (1 - stops), l: part },
            ]
          : [{ p, l: part }]
      if (!hit || l.myHp <= 0) out.push(...withStop(acts, after(l.myHp, l.myLoss, 0, false)))
      else {
        const surv = damageIfSurvives(hit, l.myHp)
        out.push(
          ...withStop(acts * hit.ko, {
            ...after(0, l.myLoss + l.myHp, l.myHp, true),
            // 내가 먼저 길동무를 썼으면 상대도 쓰러짐
            ...(x.myDestinyBond && l.mineActed ? { oppHp: 0, oppLoss: l.oppLoss + l.oppHp } : {}),
          }),
          ...withStop(acts * (1 - hit.ko), after(l.myHp - surv, l.myLoss + surv, surv, false)),
        )
      }
      return out
    })

  const f = x.switchIn || x.oppSwitchIn ? 1 : x.pFirst
  const start = leaves
  const result: Leaf[] = []
  for (const [p, mineFirst] of [
    [f, true],
    [1 - f, false],
  ] as const) {
    if (p <= 0) continue
    leaves = start.map((l) => ({ ...l, p: l.p * p }))
    if (mineFirst) {
      mineStep()
      oppStep()
    } else {
      oppStep()
      mineStep()
    }
    result.push(...leaves)
  }

  // 턴 끝 회복 → 맞대결 전망
  const out: Outcome = {
    myLoss: 0,
    oppLoss: 0,
    myKo: 0,
    oppKo: 0,
    duel: 0,
    utility: 0,
    pFirst: 0,
    immediate: 0,
    score: 0,
    ends: [],
  }
  const ends = new Map<boolean, TurnEnd>()
  for (const l of result) {
    let { myHp, oppHp, myLoss, oppLoss } = l
    if (x.myHeal && myHp > 0 && l.mineActed && !l.pivoted) {
      const h = Math.min(x.myHeal, 1 - myHp)
      myHp += h
      myLoss -= h
    }
    if (x.oppHeal && oppHp > 0 && l.oppActed) {
      const h = Math.min(x.oppHeal, 1 - oppHp)
      oppHp += h
      oppLoss -= h
    }
    const cases = l.pivoted ? (x.afterPivot ?? x.after) : x.after
    const duel =
      myHp > 0 && oppHp > 0
        ? cases.reduce((s, a) => s + a.p * duelValue(a.duel, a.myHp ?? myHp, a.oppHp ?? oppHp), 0)
        : 0
    out.myLoss += l.p * myLoss
    out.oppLoss += l.p * oppLoss
    out.myKo += l.p * Math.min(1, l.myKo)
    out.oppKo += l.p * (x.oppHp > 0 && oppHp <= 0 ? 1 : 0)
    out.duel += l.p * duel
    if (myHp > 0 && oppHp > 0) {
      const e = ends.get(l.pivoted) ?? { pivoted: l.pivoted, p: 0, myHp: 0, oppHp: 0 }
      e.p += l.p
      e.myHp += l.p * myHp
      e.oppHp += l.p * oppHp
      ends.set(l.pivoted, e)
    }
    out.utility +=
      l.p * ((l.mineActed ? x.myUtility || 0 : 0) - (l.oppActed ? x.oppUtility || 0 : 0))
  }
  out.pFirst = f
  out.immediate = out.oppLoss - out.myLoss + w.ko * (out.oppKo - out.myKo) + w.hazard * out.utility
  out.score = out.immediate + w.duel * out.duel
  out.ends = [...ends.values()].map((e) => ({ ...e, myHp: e.myHp / e.p, oppHp: e.oppHp / e.p }))
  return out
}

// ── 상대 선택지 가중치 ─────────────
// prior: 사전 비중 (기술 = 확정 1 / 채용률, 교체 = oppSwitch), table[i][j] = 내 선택지 i × 상대 선택지 j 결과.
// 상대에게 그 선택지의 가치 = 내 선택지 전체에 대한 내 점수 평균의 반대. 가치가 높을수록 exp(smart × 차이)로 더 고른다. 합 1
export function responseWeights(
  prior: number[],
  table: Outcome[][],
  w: RecWeights = DEFAULT_WEIGHTS,
): number[] {
  const value = prior.map(
    (_, j) => -table.reduce((s, row) => s + (row[j]?.score ?? 0), 0) / Math.max(1, table.length),
  )
  const top = Math.max(...value)
  const raw = prior.map((p, j) => Math.max(0, p) * Math.exp(w.smart * (value[j]! - top)))
  const sum = raw.reduce((s, v) => s + v, 0)
  return sum > 0 ? raw.map((v) => v / sum) : prior.map(() => 1 / Math.max(1, prior.length))
}

// ── 순위 ─────────────
export interface Ranked {
  index: number // 내 선택지 번호
  expected: number // 상대 선택지 가중 평균 점수
  worst: number // 유력한 상대 선택지 중 최악의 점수
  worstAgainst: number // 그 상대 선택지 번호
  outcomes: Outcome[] // 상대 선택지별 결과
}

// matrix[i][j] = 내 선택지 i × 상대 선택지 j. 기대값 높은 순
export const rankOptions = (
  matrix: Exchange[][],
  weights: number[],
  w: RecWeights = DEFAULT_WEIGHTS,
): Ranked[] =>
  rankOutcomes(
    matrix.map((row) => row.map((x) => evaluate(x, w))),
    weights,
    w,
  )

// 결과표(점수를 고친 것 포함)로 순위
export function rankOutcomes(
  table: Outcome[][],
  weights: number[],
  w: RecWeights = DEFAULT_WEIGHTS,
): Ranked[] {
  const plausible = weights.map((v) => v >= w.plausible)
  if (!plausible.some(Boolean)) plausible.fill(true)
  return table
    .map((outcomes, index) => {
      const expected = outcomes.reduce((s, o, j) => s + o.score * (weights[j] ?? 0), 0)
      let worst = Infinity
      let worstAgainst = -1
      outcomes.forEach((o, j) => {
        if (plausible[j] && o.score < worst) {
          worst = o.score
          worstAgainst = j
        }
      })
      if (worstAgainst < 0) worst = expected
      return { index, expected, worst, worstAgainst, outcomes }
    })
    .sort((a, b) => b.expected - a.expected)
}

// 안전 추천: 최악의 경우가 가장 나은 선택지 (같으면 기대값)
export const safest = (ranked: Ranked[]): Ranked | null =>
  ranked.reduce<Ranked | null>(
    (best, r) =>
      !best ||
      r.worst > best.worst + 1e-9 ||
      (Math.abs(r.worst - best.worst) <= 1e-9 && r.expected > best.expected)
        ? r
        : best,
    null,
  )
