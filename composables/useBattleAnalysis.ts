// composables/useBattleAnalysis.ts
// 배틀 화면의 분석 정보 (기존 singleBattle.vue 기능 이식). 분석 대상 = 각 진영의 focus 칸 포켓몬.
//   - 상대 스피드 구간(무보정/보정/스카프 ×2) + 선후공 관찰로 좁힌 범위 (useBattle speedRangesOf)
//   - 예상 데미지 표: 내 공격 vs 상대 4가지 배분 시나리오 / 상대 기술 vs 내 포켓몬
//   - ① 이번 턴 입력 기준 흐름 ② 실전 배분 시나리오 흐름
//   - 상대 배분은 선출 화면 값을 쓰지 않고 추정 범위(useBattle combatantRange)의 양 끝으로 계산한 범위 (spanCells)
//   - 이번 턴 예상은 실제 행동 순서(useBattle turnOrder) 기준: 애널라이즈·보복 등, 먼저 공격한 킬가르도는 블레이드폼으로 맞음
//   - 연속기 + 접촉 반격(까칠한피부/철가시/울퉁불퉁멧) 자멸 위험, 턴 종료 상태이상 데미지 예고
// 문구는 { key, params } 로 반환하고 화면에서 t() 로 번역한다.

import type { useBattle } from '~/composables/useBattle'
import type { BattleSide } from '~/utils/battleState'
import { spanCells, useTeamCalc, type Cell, type CellGuess } from '~/composables/useTeamCalc'
import {
  hitInfo,
  isSpreadMove,
  perHitDamage,
  type Combatant,
  type DamageOptions,
  type FieldState,
} from '~/utils/damage'
import { hpRangeOfPct } from '~/utils/hpDisplay'
import { CONTACT_PUNISH, simulateMultiHit, statusDamage, type TrajectoryOutcome } from '~/utils/ko'
import { applyBoost, BOOSTING_NATURE, calcStat } from '~/utils/stats'
import { bandSpeedRange, SP_MAX, SPEED_BANDS, speedVerdict } from '~/utils/speedInference'
import type { Move, StatKey, StatTable } from '~/utils/types'

export interface Line {
  key: string
  params?: Record<string, string | number>
}
type Battle = ReturnType<typeof useBattle>

export const DEF_SCENARIOS = ['neutral', 'h32', 'full', 'fullNature'] as const

export function useBattleAnalysis(b: Battle) {
  const gd = useGameData()
  const calc = useTeamCalc()
  const S = () => b.state.value!

  const activeIdx = (side: BattleSide) => S().sides[side].active[S().focus[side]] ?? null
  const action = (side: BattleSide) => S().actions[side][S().focus[side]]
  const nameOf = (side: BattleSide, idx: number | null) =>
    idx == null ? '' : gd.name('pokemon', b.resolveAt(side, idx)?.species.id)

  // ── 스피드 / 행동 순서 (useBattle 기준) ─────────────
  const speedOf = (side: BattleSide, idx: number, megaOverride?: boolean) =>
    b.speedOf(side, idx, megaOverride)
  const trickRoom = computed(() => !!S().rooms.trickroom)
  // 이번 턴 기술 순서 (우선도 → 스피드, 트릭룸, 관찰한 선후공)
  const order = computed(() => b.turnOrder())
  // 이번 턴 메가진화하면 메가 폼 기준
  // (행동하는 분석 대상 포켓몬만 — 교체기로 들어오는 포켓몬은 이번 턴 메가진화하지 않음)
  // 예상 데미지 표에 메가 폼도 넣을 포켓몬: 그 진영이 아직 메가진화하지 않았고(배틀에 한 번), 메가스톤으로 메가진화 가능
  const megaPreviewable = (side: BattleSide, idx: number) => {
    const m = S().sides[side].mons[idx]
    return !!m && !m.megaOn && m.hp > 0 && b.canMegaEvolve(side, idx)
  }
  const megaThisTurn = (side: BattleSide, idx: number) => {
    const a = action(side)
    return a?.kind === 'move' && a.useMega && activeIdx(side) === idx && b.canMegaEvolve(side, idx)
      ? true
      : undefined
  }

  // ── 이번 턴 상황 ─────────────
  // 분석 대상 칸의 공격이 맞히는 포켓몬. 대상이 이번 턴 교체하거나, 먼저 교체기(유턴·배턴터치 등)로 물러나면
  // 들어오는 포켓몬 (useBattle hitTarget)
  const targetOf = (side: BattleSide) => b.hitTarget(side, S().focus[side], order.value)
  // 공격 보정: 배틀 상태(도우미/총대장/메트로놈/충전/맞은 횟수)
  //   turn 이면 이번 턴 입력까지 (행동 순서 → 애널라이즈·보복·눈사태, 교체 등장 → 잠복, 광역 여부)
  const optsFor = (side: BattleSide, idx: number, moveId: string, turn = false): DamageOptions => {
    const slot = S().sides[side].active.indexOf(idx)
    return turn && slot >= 0
      ? b.actionOpts(side, slot, idx, moveId, order.value)
      : b.attackOpts(side, idx, moveId)
  }
  // 광역(0.75배) 여부: 맞는 쪽에 살아있는 포켓몬이 2마리 이상 + 광역기 (사이코필드 와이드포스 포함)
  const spreadFor = (side: BattleSide, idx: number, move: Move, defSide: BattleSide) =>
    b.spreadActive(defSide) &&
    isSpreadMove(move, {
      attacker: b.combatantOf(side, idx, undefined, true),
      field: b.fieldFor(defSide),
    })

  // ── 추측 도구 ─────────────
  // 확정 전 상대 도구의 추측 (잃었으면 없음). 계산은 확정한 사실만으로 하고, 추측 도구면의 결과는 cell.guess 로 따로
  const guessOf = (oi: number) => (S().sides.opp.mons[oi]?.itemGone ? '' : b.guessedItem(oi))
  const withGuess = (base: Cell | null, item: string, alt: () => Cell | null): Cell | null => {
    if (!base || !item) return base
    const g = alt()
    if (!g || (g.min === base.min && g.max === base.max && g.ko?.hits === base.ko?.hits))
      return base
    const guess: CellGuess = {
      item,
      min: g.min,
      max: g.max,
      pctMin: g.pctMin,
      pctMax: g.pctMax,
      lethal: g.lethal,
      ko: g.ko,
      koHit: g.koHit,
      maxHp: g.maxHp,
      bounds: g.bounds,
    }
    return { ...base, guess }
  }

  // ── 상대 배분 범위 ─────────────
  // 맞는 능력치: 물리(사이코쇼크·사이코브레이크 포함) = 방어, 특수 = 특방. 원더룸이면 서로 바뀜
  const defStatOf = (move: Move, field: FieldState): 'def' | 'spd' => {
    const phys = move.category === 'physical' || ['psyshock', 'psystrike'].includes(move.id)
    return phys !== !!field.wonderRoom ? 'def' : 'spd'
  }
  // atks / defs: [약한 쪽, 강한 쪽] (b.combatantRange). 공격에 가장 유리한 조합(강한 공격 × 약한 내구)과
  // 가장 불리한 조합으로 계산해 합친다
  const rangedCell = (
    moveId: string,
    atks: Combatant[],
    defs: Combatant[],
    field: FieldState,
    opts: DamageOptions,
  ): Cell | null => {
    if (!atks.length || !defs.length) return null
    const best = calc.cell(moveId, atks[atks.length - 1]!, defs[0]!, field, opts)
    if (atks.length < 2 && defs.length < 2) return best
    return spanCells(best, calc.cell(moveId, atks[0]!, defs[defs.length - 1]!, field, opts))
  }
  const withItem = (cs: Combatant[], item: string) => cs.map((c) => ({ ...c, item }))

  // ── 상대 스피드 구간 ─────────────
  // 4개 구간(무보정 / 보정 / 무보정+스카프 / 보정+스카프)의 실전 스피드 범위 (지금 랭크·순풍·마비·특성 기준)
  //   possible: 선후공 관찰(저장 + 이번 턴 미리보기)로 남은 범위, null 이면 제외된 구간
  //   변신(메타몽)은 스피드 실능치가 복사한 값이라 "그대로 / 스카프" 2개만
  const speedBands = computed(() => {
    const oi = activeIdx('opp')
    const mi = activeIdx('mine')
    if (oi == null || mi == null) return null
    const se = b.speedEnvOf(oi)
    if (!se) return null
    const transformed = se.env.fixedStat != null
    const committed = b.speedRangesOf(oi, false)
    const preview = b.speedRangesOf(oi, true)
    const pending = b.pendingSpeedObservation()
    const bands = SPEED_BANDS.filter((band) => !transformed || !band.plus).map((band) => ({
      key: band.key,
      plus: band.plus,
      scarf: band.scarf,
      full: bandSpeedRange(se.base, band, [0, SP_MAX], se.env)!,
      possible: bandSpeedRange(se.base, band, preview[band.key], se.env),
      sp: preview[band.key],
      // 이번 턴 관찰(아직 적용 전)로 새로 제외되는 구간
      newlyExcluded: !!committed[band.key] && !preview[band.key],
    }))
    const v = speedVerdict(preview)
    return {
      bands,
      mySpeed: pending?.oi === oi ? pending.mySpeed : speedOf('mine', mi, megaThisTurn('mine', mi)),
      verdict: transformed ? { ...v, plus: null } : v,
      transformed,
      pending: pending?.oi === oi,
      observed: !!S().sides.opp.mons[oi]!.speedSp,
    }
  })

  // ── 시나리오 실능치 ─────────────
  const scenarioDefStats = (
    oi: number,
    sc: (typeof DEF_SCENARIOS)[number],
    defKey: 'def' | 'spd',
    oppMega?: boolean,
  ): StatTable | null => {
    const r = b.resolveAt('opp', oi, oppMega)
    if (!r) return null
    // 변신(메타몽): 실능치는 복사한 값이라 배분 시나리오가 없다
    if (r.transformedFrom) return { ...r.stats }
    const natures = gd.data.value!.natures
    const hpSp = sc === 'neutral' ? 0 : 32
    const defSp = sc === 'full' || sc === 'fullNature' ? 32 : 0
    const nat = sc === 'fullNature' ? natures[BOOSTING_NATURE[defKey]] : null
    const base = r.species.stats
    const stats = { ...r.stats }
    stats.hp = calcStat('hp', base.hp, hpSp, null)
    stats[defKey] = calcStat(defKey, base[defKey], defSp, nat)
    return stats
  }
  // 내 포켓몬(attacker 로스터 idx) → 상대 oi, 시나리오별 데미지 칸
  // mineMega / oppMega: 아직 메가진화하지 않은 쪽을 메가 폼으로 (megaPreviewable)
  const mineVsScenario = (
    mi: number,
    moveId: string,
    oi: number,
    sc: (typeof DEF_SCENARIOS)[number],
    crit = false,
    mineMega?: boolean,
    oppMega?: boolean,
  ): Cell | null => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    const atk = b.combatantOf('mine', mi, mineMega || undefined, true)
    const defStatsKey =
      move.category === 'physical' || ['psyshock', 'psystrike'].includes(moveId) ? 'def' : 'spd'
    const stats = scenarioDefStats(oi, sc, defStatsKey, oppMega || undefined)
    const r = b.resolveAt('opp', oi, oppMega || undefined)
    if (!atk || !stats || !r) return null
    const oppActive = S().sides.opp.active.includes(oi)
    const def = calc.combatant(r, {
      stats,
      boosts: oppActive ? S().sides.opp.mons[oi]!.boosts : undefined,
      status: S().sides.opp.mons[oi]!.status,
      item: S().sides.opp.mons[oi]!.itemGone ? '' : undefined,
    })
    const opts = {
      crit,
      spread: spreadFor('mine', mi, move, 'opp'),
      ...optsFor('mine', mi, moveId),
    }
    const field = b.fieldFor('opp', oi)
    const g = guessOf(oi)
    return withGuess(calc.cell(moveId, atk, def, field, opts), g, () =>
      calc.cell(moveId, atk, { ...def, item: g }, field, opts),
    )
  }

  // 상대 포켓몬 oi → 내 포켓몬 mi (상대 공격·특공은 추정 범위). megaPreview: 내 쪽 메가 상태를 강제
  // turn: 이번 턴 입력 기준 (행동 순서 보정 + 먼저 공격한 킬가르도는 블레이드폼으로 맞음)
  const oppVsMine = (
    oi: number,
    moveId: string,
    mi: number,
    crit = false,
    megaPreview?: boolean,
    turn = false,
    oppMega?: boolean, // 상대를 메가 폼으로 (megaPreviewable)
  ): Cell | null => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    // turn: 이번 턴 먼저 행동하는 기술의 확정 효과(랭크·상태이상·벽 등)를 반영한 시점 (turnStateBefore)
    const snap = turn ? b.turnStateBefore('opp', oi, order.value) : null
    const atks = b
      .combatantRange('opp', oi, oppMega || megaThisTurn('opp', oi), true)
      .map((c) => (snap ? b.withTurnState(snap, 'opp', oi, c) : c))
    const alt = turn ? b.formAtHit('mine', mi, 'opp', oi, order.value) : undefined
    const rawDef = b.combatantOf('mine', mi, megaPreview, false, alt)
    const def = rawDef && snap ? b.withTurnState(snap, 'mine', mi, rawDef) : rawDef
    if (!atks.length || !def) return null
    const opts = {
      crit,
      spread: spreadFor('opp', oi, move, 'mine'),
      ...optsFor('opp', oi, moveId, turn),
    }
    const field = snap
      ? b.fieldWithTurnState(snap, 'mine', b.fieldFor('mine', mi))
      : b.fieldFor('mine', mi)
    const g = guessOf(oi)
    return withGuess(rangedCell(moveId, atks, [def], field, opts), g, () =>
      rangedCell(moveId, withItem(atks, g), [def], field, opts),
    )
  }

  // ── 행동 순서 판단 ─────────────
  // 우선도(장난꾸러기 등 포함) → 스피드 순 (트릭룸이면 스피드 역순). 같으면 null
  const mineFirst = (mineMove: string, oppMove: string, oppSpeed: number, mySpeed?: number) => {
    const mi = activeIdx('mine')!
    const oi = activeIdx('opp')
    const pm = b.movePriority('mine', mi, mineMove)
    const po = oi == null ? gd.move(oppMove)?.priority || 0 : b.movePriority('opp', oi, oppMove)
    if (pm !== po) return pm > po
    const ms = mySpeed ?? speedOf('mine', mi)
    if (ms === oppSpeed) return null
    return ms > oppSpeed !== trickRoom.value
  }

  // 상대 HP % 를 실수치 범위로. 게임은 버림 표시라 p% = 실제 [p%, (p+1)%) (utils/hpDisplay)
  //   max: 최대 HP (생략하면 추정 범위의 가운데)
  const oppHpRange = (oi: number, max = b.maxHp('opp', oi)) =>
    hpRangeOfPct(S().sides.opp.mons[oi]!.hp, max)
  // 추측 도구면 판정이 달라지면 확정하지 않고 '난수'(maybe)
  // hpOf: 맞는 쪽 최대 HP → 지금 HP 범위 (상대는 배분 범위의 양 끝마다 최대 HP 가 다르다)
  type HpOf = (maxHp: number) => { min: number; max: number }
  const assessKo = (c: Cell | null, hpOf: HpOf) => {
    const k = assessSpan(c, hpOf)
    if (!c?.guess) return k
    return assessSpan({ ...c, ...c.guess }, hpOf) === k ? k : 'maybe'
  }
  // 배분 범위: 불리한 쪽도 쓰러뜨리면 확정, 유리한 쪽도 못 쓰러뜨리면 없음
  const assessSpan = (c: Cell | null, hpOf: HpOf) => {
    if (!c?.bounds) return assessOne(c, hpOf)
    if (assessOne(c.bounds.worst, hpOf) === 'sure') return 'sure'
    return assessOne(c.bounds.best, hpOf) === 'none' ? 'none' : 'maybe'
  }
  const assessOne = (c: Cell | null, hpOf: HpOf) => {
    if (!c) return 'none'
    const { min: hpMin, max: hpMax } = hpOf(c.maxHp)
    // 대타 뒤: 단타는 본체가 다치지 않음, 연속기는 대타를 깬 뒤 남은 타수로 쓰러질 수 있음
    if (c.sub) return c.lethal ? 'maybe' : 'none'
    // 기합의띠·옹골참(HP 가득): 단타는 1 남고, 연속기는 첫 타가 1 남긴 뒤 다음 타로 쓰러질 수 있음
    if (c.holdOn) return c.hits && c.lethal ? 'maybe' : 'none'
    if (hpMax <= 0 || c.min >= hpMax) return 'sure'
    if (c.max < hpMin) return 'none'
    return 'maybe'
  }

  // 맞는 쪽의 지금 HP 범위 (내 쪽은 실수치 그대로, 상대는 % → 그 최대 HP 기준 범위)
  const hpOfTarget =
    (side: BattleSide, idx: number): HpOf =>
    (max) =>
      side === 'mine'
        ? { min: S().sides.mine.mons[idx]!.hp, max: S().sides.mine.mons[idx]!.hp }
        : oppHpRange(idx, max)

  // 이번 턴 분석 대상끼리의 선후공. 선후공을 관찰해 입력했으면 그대로. 아니면 우선도 → 같으면 상대 스피드 범위
  // (관찰·확정 도구로 좁힌 것)로 판정 (이번 턴 메가진화 반영). 범위가 내 스피드에 걸치면 모름 — 상대 배분을 추측하지 않고
  // 본 순서를 입력받는다. first: true = 내가 먼저, false = 상대가 먼저, null = 반드시 동속(무작위), 'unknown' = 모름
  const orderOf = (mi: number, oi: number, mineMove: string, oppMove: string) => {
    const observed = S().observedOrder !== 'unknown'
    const samePri = b.movePriority('mine', mi, mineMove) === b.movePriority('opp', oi, oppMove)
    const so =
      !observed && samePri
        ? b.speedOrder(mi, oi, megaThisTurn('mine', mi), megaThisTurn('opp', oi))
        : null
    const sure = so?.first === 'mine' || so?.first === 'opp'
    const first: boolean | null | 'unknown' = observed
      ? S().observedOrder === 'mine'
      : !samePri
        ? !!mineFirst(mineMove, oppMove, 0)
        : sure
          ? so!.first === 'mine'
          : so?.first === 'tie'
            ? null
            : 'unknown'
    return { observed, samePri, so, sure, first }
  }

  // 먼저 움직이는 쪽의 공격으로 반드시 쓰러져 이번 턴 행동하지 못하는 쪽 (분석 대상끼리, 둘 다 기술일 때). 없으면 null
  // (기술을 아직 안 고른 쪽은 우선도 0 으로 판정 → 선공기를 고르면 다시 판정)
  const faintsFirst = computed<BattleSide | null>(() => {
    const mi = activeIdx('mine')
    const oi = activeIdx('opp')
    const ma = action('mine')
    const oa = action('opp')
    if (mi == null || oi == null || ma?.kind !== 'move' || oa?.kind !== 'move') return null
    if (
      b.sleepsThrough('mine', mi, ma.via || ma.move) ||
      b.sleepsThrough('opp', oi, oa.via || oa.move)
    )
      return null
    const { first } = orderOf(mi, oi, ma.via || ma.move, oa.via || oa.move)
    if (typeof first !== 'boolean') return null
    const fa = first ? ma : oa
    if (!fa.move || fa.missed) return null
    const cell = first
      ? mineVsActual(mi, ma.move, oi, ma.useMega)
      : oppVsMine(oi, oa.move, mi, false, undefined, true)
    const ko = assessKo(cell, first ? hpOfTarget('opp', oi) : hpOfTarget('mine', mi))
    return ko === 'sure' ? (first ? 'opp' : 'mine') : null
  })

  // 결과가 하나로 정해지는 데미지 (싱글, 분석 대상의 기술): 반드시 쓰러뜨림 → 남은 HP 전부,
  // 내 포켓몬이 기합의띠·옹골참(HP 가득)으로 반드시 버팀 → HP 1 남김. 정해지지 않으면 null
  const fixedAmount = (side: BattleSide): number | null => {
    if (b.N > 1 || faintsFirst.value === side) return null
    const a = action(side)
    const ui = activeIdx(side)
    if (a?.kind !== 'move' || !a.move || a.missed || ui == null) return null
    if (b.sleepsThrough(side, ui, a.via || a.move)) return null
    const cell = side === 'mine' ? mineActionPreview.value : oppActionPreview.value
    const t = targetOf(side)
    if (!cell || cell.immune || cell.sub || t.idx == null) return null
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const hp = S().sides[foe].mons[t.idx]!.hp
    if (hp <= 0) return null
    if (foe === 'mine' && cell.holdOn && !cell.hits) {
      const min = Math.min(cell.min, cell.guess?.min ?? Infinity)
      return min >= hp - 1 ? hp - 1 : null
    }
    return assessKo(cell, hpOfTarget(foe, t.idx)) === 'sure' ? hp : null
  }

  // ① 이번 턴 입력 기준 흐름
  const forecast = computed<Line[]>(() => {
    const mi = activeIdx('mine')
    const oi = activeIdx('opp')
    const ma = action('mine')
    const oa = action('opp')
    if (mi == null || oi == null || !ma || !oa) return []
    if (ma.kind === 'switch' || oa.kind === 'switch') return [{ key: 'battle.flow.switchTurn' }]
    const mineLabel = { key: 'battle.flow.mineLabel', name: nameOf('mine', mi) }
    const oppLabel = { key: 'battle.flow.oppLabel', name: nameOf('opp', oi) }
    const mineCell = ma.move ? mineVsActual(mi, ma.move, oi, ma.useMega) : null
    const oppCell = oa.move ? oppVsMine(oi, oa.move, mi, false, undefined, true) : null
    const { observed, samePri, so, sure, first } = orderOf(
      mi,
      oi,
      ma.via || ma.move,
      oa.via || oa.move,
    )
    // 선후공 근거 한 줄: 스피드 범위로 확정 / 동속 가능 / 모름. 선제공격손톱·퀵드로 가능성
    // (반드시 동속이면 동속 줄만)
    const orderBasis: Line[] =
      observed || !samePri || so?.first === 'tie'
        ? []
        : !so
          ? [{ key: 'battle.flow.orderUnknownPlain' }]
          : [
              {
                key: sure
                  ? so.tiePossible
                    ? 'battle.flow.orderSureTie'
                    : 'battle.flow.orderSure'
                  : 'battle.flow.orderUnknown',
                params: { span: `${so.span[0]}–${so.span[1]}`, my: so.mySpeed },
              },
              ...(so.random && sure ? [{ key: 'battle.flow.orderRandom' }] : []),
            ]
    const L = (l: { key: string; name: string }) => `@${l.key}|${l.name}`
    const attackLine = (label: typeof mineLabel, move: string, c: Cell | null): Line =>
      c
        ? {
            key: 'battle.flow.attack',
            params: {
              name: L(label),
              move: gd.name('moves', move),
              min: c.min,
              max: c.max,
              pmin: pct(c.pctMin),
              pmax: pct(c.pctMax),
            },
          }
        : {
            key: 'battle.flow.attackNoDmg',
            params: { name: L(label), move: move ? gd.name('moves', move) : '—' },
          }
    // 대타 뒤면 대타가 받는 결과 (사라짐 / 난수(깨질 확률) / 남음). 연속기는 깨진 뒤 남은 타수를 본체가 받음
    const subLine = (target: typeof mineLabel, c: Cell | null): Line[] => {
      if (!c?.sub) return []
      const { breaks, breakP, hp } = c.sub
      const p = breakP == null ? null : breakP >= 99.95 ? '100' : breakP.toFixed(1)
      const params = { name: L(target), hp, p: p ?? '?' }
      if (c.hits && breaks !== 'none') return [{ key: 'battle.flow.subMulti', params }]
      const key = breaks === 'sure' ? 'Sure' : breaks === 'maybe' ? (p ? 'MaybeP' : 'Maybe') : 'No'
      return [{ key: `battle.flow.sub${key}`, params }]
    }
    // 행동 불가가 있는 턴: 행동하지 못하는 쪽은 이유만, 나머지는 공격 줄
    // (잠든 뒤 첫 시도처럼 깨어나지 못하면 기술을 골라도 행동 불가)
    const asleepM = ma.kind === 'move' && b.sleepsThrough('mine', mi, ma.via || ma.move)
    const asleepO = oa.kind === 'move' && b.sleepsThrough('opp', oi, oa.via || oa.move)
    if (ma.kind === 'cant' || oa.kind === 'cant' || asleepM || asleepO) {
      const lines: Line[] = []
      for (const [a, label, cell, target, asleep] of [
        [ma, mineLabel, mineCell, oppLabel, asleepM],
        [oa, oppLabel, oppCell, mineLabel, asleepO],
      ] as const) {
        if (a.kind === 'cant' || asleep)
          lines.push({
            key: 'battle.flow.cant',
            params: {
              name: L(label),
              reason: `@battle.cantReason.${asleep ? 'slp' : a.cantReason}`,
            },
          })
        else if (a.move) lines.push(attackLine(label, a.move, cell), ...subLine(target, cell))
      }
      return lines
    }
    if (first === null)
      return [
        { key: 'battle.flow.speedTie', params: { a: L(mineLabel), b: L(oppLabel) } },
        ...orderBasis,
      ]
    // 순서를 모르면 각자 먼저 맞힌다면의 결과만
    if (first === 'unknown') {
      const lines: Line[] = [...orderBasis]
      for (const [move, label, cell, target, tSide, tIdx] of [
        [ma.move, mineLabel, mineCell, oppLabel, 'opp', oi],
        [oa.move, oppLabel, oppCell, mineLabel, 'mine', mi],
      ] as const) {
        if (!move) continue
        lines.push(attackLine(label, move, cell), ...subLine(target, cell))
        const ko = assessKo(cell, hpOfTarget(tSide, tIdx))
        lines.push({
          key: `battle.flow.${ko === 'sure' ? 'koSureIf' : ko === 'maybe' ? 'koMaybeIf' : 'koNo'}`,
          params: { name: L(target) },
        })
      }
      return lines
    }
    const [fL, sL] = first ? [mineLabel, oppLabel] : [oppLabel, mineLabel]
    const [fMove, sMove] = first ? [ma.move, oa.move] : [oa.move, ma.move]
    const [fCell, sCell] = first ? [mineCell, oppCell] : [oppCell, mineCell]
    const lines: Line[] = [{ key: 'battle.flow.first', params: { name: L(fL) } }, ...orderBasis]
    // 기술을 아직 안 정한 쪽은 공격 줄을 생략
    if (fMove) lines.push(attackLine(fL, fMove, fCell), ...subLine(sL, fCell))
    const ko = assessKo(fCell, first ? hpOfTarget('opp', oi) : hpOfTarget('mine', mi))
    if (fMove && ko === 'sure') lines.push({ key: 'battle.flow.koSure', params: { name: L(sL) } })
    else {
      if (fMove)
        lines.push({
          key: ko === 'maybe' ? 'battle.flow.koMaybe' : 'battle.flow.koNo',
          params: { name: L(sL) },
        })
      // 먼저 행동한 쪽이 교체기(유턴·배턴터치 등)로 물러나면 나중 공격은 들어오는 포켓몬이 맞는다
      const fa = first ? ma : oa
      const pivotIn = fMove && fa.kind === 'move' && fa.selfSwitch != null ? fa.selfSwitch : null
      if (pivotIn != null) {
        const inL = first
          ? { key: mineLabel.key, name: nameOf('mine', pivotIn) }
          : { key: oppLabel.key, name: nameOf('opp', pivotIn) }
        lines.push({ key: 'battle.flow.pivot', params: { name: L(fL), to: L(inL) } })
        if (sMove) {
          const c = first
            ? oppVsMine(oi, sMove, pivotIn, false, undefined, true)
            : mineVsActual(mi, sMove, pivotIn, ma.useMega, true)
          lines.push(attackLine(sL, sMove, c), ...subLine(inL, c))
        }
      } else if (sMove) lines.push(attackLine(sL, sMove, sCell), ...subLine(fL, sCell))
    }
    return lines
  })

  // 이번 턴 입력 기준, 상대 내구는 추정 범위 (메가 사용 체크 시 메가 상태로 미리보기)
  const mineVsActual = (
    mi: number,
    moveId: string,
    oi: number,
    useMega = false,
    switchedIn = false,
    crit = false,
  ) => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    const m = S().sides.mine.mons[mi]!
    // 이번 턴 먼저 행동하는 기술의 확정 효과(랭크·상태이상·벽 등)를 반영한 시점 (turnStateBefore)
    const snap = b.turnStateBefore('mine', mi, order.value)
    const rawAtk = b.combatantOf('mine', mi, useMega && !m.megaUsed ? true : undefined, true)
    const atk = rawAtk && b.withTurnState(snap, 'mine', mi, rawAtk)
    // 상대 킬가르도가 이번 턴 먼저 공격하면 블레이드폼으로 맞는다 (교체로 들어오는 상대는 해당 없음)
    const alt = switchedIn ? undefined : b.formAtHit('opp', oi, 'mine', mi, order.value)
    const field = b.fieldWithTurnState(snap, 'opp', b.fieldFor('opp', oi))
    const defs = b
      .combatantRange('opp', oi, megaThisTurn('opp', oi), false, alt, defStatOf(move, field))
      .map((c) => b.withTurnState(snap, 'opp', oi, c))
    if (!atk || !defs.length) return null
    const opts = {
      crit,
      spread: spreadFor('mine', mi, move, 'opp'),
      ...optsFor('mine', mi, moveId, true),
    }
    const g = guessOf(oi)
    return withGuess(rangedCell(moveId, [atk], defs, field, opts), g, () =>
      rangedCell(moveId, [atk], withItem(defs, g), field, opts),
    )
  }
  const mineActionPreview = computed(() => {
    const mi = activeIdx('mine')
    const ma = action('mine')
    if (mi == null || !ma || ma.kind !== 'move' || !ma.move) return null
    const t = targetOf('mine')
    return t.idx == null ? null : mineVsActual(mi, ma.move, t.idx, ma.useMega, t.switchedIn)
  })
  // 상대 기술 → 맞는 내 포켓몬 (교체로 들어오는 포켓몬 포함)
  const oppActionPreview = computed(() => {
    const oi = activeIdx('opp')
    const oa = action('opp')
    if (oi == null || !oa || oa.kind !== 'move' || !oa.move) return null
    const t = targetOf('opp')
    return t.idx == null ? null : oppVsMine(oi, oa.move, t.idx, false, undefined, !t.switchedIn)
  })

  // ── 데미지 입력 검토 ─────────────
  // side 의 slot 이 k칸에 입력한 데미지(mine → 상대 %, opp → 내 HP)가 계산 범위 밖이면 그 범위를 돌려준다 (안이면 null).
  // 막지 않고 경고만: 도구·특성·급소·랭크를 잘못 알고 있을 수 있고, 입력값이 상대 배분 추정의 근거라서.
  //   범위 = 상대 배분 추정 범위 + 추측 도구(선출 화면)의 경우, 급소 체크면 급소 기준
  //   오차 = 상대 % 는 버림 표시라 ±1%p, 내 HP 는 ±1. 쓰러뜨렸으면(current 이상) 최대 데미지가 남은 HP 이상인지만 본다
  //   대타가 받는 경우·고정 데미지(값이 정해져 잠김)는 검토하지 않음
  const amountWarning = (
    side: BattleSide,
    slot: number,
    k: number,
    amount: number | null,
    current: number,
  ): { min: number; max: number } | null => {
    const a = S().actions[side][slot]
    const ui = S().sides[side].active[slot]
    if (amount == null || !a || a.kind !== 'move' || !a.move || a.missed || ui == null) return null
    if (slot === S().focus[side] && fixedAmount(side) != null) return null
    const t = b.hitTarget(side, slot, order.value, k)
    if (t.idx == null) return null
    const c =
      side === 'mine'
        ? mineVsActual(ui, a.move, t.idx, a.useMega, t.switchedIn, a.crit)
        : oppVsMine(ui, a.move, t.idx, a.crit, undefined, !t.switchedIn)
    if (!c || c.sub) return null
    const pct = side === 'mine'
    const lo = c.immune
      ? 0
      : Math.min(pct ? c.pctMin : c.min, ...(c.guess ? [pct ? c.guess.pctMin : c.guess.min] : []))
    const hi = c.immune
      ? 0
      : Math.max(pct ? c.pctMax : c.max, ...(c.guess ? [pct ? c.guess.pctMax : c.guess.max] : []))
    const tol = 1
    if (amount >= current - (pct ? tol : 0) && hi >= current - tol) return null // 쓰러뜨림
    if (amount >= lo - tol && amount <= hi + tol) return null
    const r = (v: number) => (pct ? Math.round(v * 10) / 10 : Math.round(v))
    return { min: r(lo), max: r(hi) }
  }

  // ── 더블: 아군도 맞히는 광역기 ─────────────
  // side 의 slot 이 쓰는 기술이 아군도 맞히면 아군이 받는 데미지 (텔레파시는 무효)
  const allyCell = (side: BattleSide, slot: number): Cell | null => {
    const a = S().actions[side][slot]
    const ui = S().sides[side].active[slot]
    const ai = b.allyOf(side, slot)
    if (!a || a.kind !== 'move' || !a.move || ui == null || ai == null || !b.hitsAlly(a.move))
      return null
    const move = gd.move(a.move)
    const field = b.fieldFor(side, ai)
    const atks = b.combatantRange(
      side,
      ui,
      a.useMega && !S().sides[side].mons[ui]!.megaUsed ? true : undefined,
      true,
    )
    const defs = move
      ? b.combatantRange(side, ai, undefined, false, undefined, defStatOf(move, field))
      : []
    if (!atks.length || !defs.length) return null
    const c = rangedCell(a.move, atks, defs, field, {
      spread: true,
      ...b.attackOpts(side, ui, a.move),
    })
    if (!c || defs[0]!.ability !== 'telepathy') return c
    return {
      ...c,
      min: 0,
      max: 0,
      pctMin: 0,
      pctMax: 0,
      lethal: false,
      ko: null,
      koHit: null,
      effectiveness: 0,
      immune: true,
      bounds: null,
    }
  }

  // ② 실전 배분 시나리오 (스피드형 H32·S32 보정 / 내구형 H32·B/D32 보정)
  const scenarioFlows = computed(() => {
    const mi = activeIdx('mine')
    const oi = activeIdx('opp')
    const ma = action('mine')
    if (mi == null || oi == null || !ma || ma.kind !== 'move') return []
    const move = gd.move(ma.move)
    const r = b.resolveAt('opp', oi)!
    const natures = gd.data.value!.natures
    const m = S().sides.opp.mons[oi]!
    const defKey = move && move.category === 'physical' ? 'def' : 'spd'
    return (['speedy', 'bulky'] as const).map((kind) => {
      const lines: Line[] = []
      const speRaw =
        kind === 'speedy'
          ? calcStat('spe', r.species.stats.spe, 32, natures[BOOSTING_NATURE.spe])
          : calcStat('spe', r.species.stats.spe, 0, null)
      const oppSpeed = applyBoost(speRaw, m.boosts.spe)
      const first = mineFirst(ma.via || ma.move, '', oppSpeed)
      const mineL = `@battle.flow.mineLabel|${nameOf('mine', mi)}`
      const oppL = `@battle.flow.oppLabel|${nameOf('opp', oi)}`
      if (first === null) {
        lines.push({ key: 'battle.flow.speedTie', params: { a: mineL, b: oppL } })
        return { title: `battle.flow.${kind}`, lines }
      }
      lines.push({ key: 'battle.flow.first', params: { name: first ? mineL : oppL } })
      lines.push({ key: 'battle.flow.oppSpeed', params: { n: oppSpeed } })
      if (!first) {
        lines.push({ key: 'battle.flow.scenarioFirstOpp' })
        return { title: `battle.flow.${kind}`, lines }
      }
      if (!move || move.category === 'status') {
        lines.push({
          key: 'battle.flow.scenarioStatus',
          params: { move: ma.move ? gd.name('moves', ma.move) : '—' },
        })
        return { title: `battle.flow.${kind}`, lines }
      }
      const stats = { ...r.stats }
      stats.hp = calcStat('hp', r.species.stats.hp, 32, null)
      stats[defKey] =
        kind === 'bulky'
          ? calcStat(defKey, r.species.stats[defKey], 32, natures[BOOSTING_NATURE[defKey]])
          : calcStat(defKey, r.species.stats[defKey], 0, null)
      const def = calc.combatant(r, {
        stats,
        boosts: m.boosts,
        item: m.itemGone ? '' : undefined,
      })
      const atk = b.combatantOf('mine', mi, ma.useMega ? true : undefined, true)!
      const opts = { spread: spreadFor('mine', mi, move, 'opp'), ...optsFor('mine', mi, ma.move) }
      const field = b.fieldFor('opp', oi)
      const g = guessOf(oi)
      const c = withGuess(calc.cell(ma.move, atk, def, field, opts), g, () =>
        calc.cell(ma.move, atk, { ...def, item: g }, field, opts),
      )
      const params = {
        move: gd.name('moves', ma.move),
        pmin: pct(Math.min(c?.pctMin || 0, c?.guess?.pctMin ?? Infinity)),
        pmax: pct(Math.max(c?.pctMax || 0, c?.guess?.pctMax ?? 0)),
      }
      // 추측 도구면 결과가 다르면 확정하지 않음
      const lo = Math.min(c?.min ?? 0, c?.guess?.min ?? Infinity)
      const hi = Math.max(c?.max ?? 0, c?.guess?.max ?? 0)
      if (c && lo >= stats.hp) lines.push({ key: 'battle.flow.scenarioKoSure', params })
      else if (c && hi >= stats.hp) lines.push({ key: 'battle.flow.scenarioKoMaybe', params })
      else lines.push({ key: 'battle.flow.scenarioKoNo', params })
      return { title: `battle.flow.${kind}`, lines }
    })
  })

  // ── 연속기 자멸 위험 ─────────────
  const multiHitRisk = (attackerSide: BattleSide) => {
    const defSide: BattleSide = attackerSide === 'mine' ? 'opp' : 'mine'
    const ai = activeIdx(attackerSide)
    const a = action(attackerSide)
    if (ai == null || !a || a.kind !== 'move' || !a.move) return null
    const t = targetOf(attackerSide)
    const di = t.idx
    const move = gd.move(a.move)
    if (di == null || !move || !move.flags.includes('contact')) return null
    const atk = b.combatantOf(attackerSide, ai, undefined, true)
    const def = b.combatantOf(defSide, di)
    if (!atk || !def) return null
    const info = hitInfo(move, atk, spreadFor(attackerSide, ai, move, defSide))
    if (info.max <= 1) return null
    const source = CONTACT_PUNISH[def.ability]
      ? def.ability
      : CONTACT_PUNISH[def.item]
        ? def.item
        : null
    if (!source) return null
    const per = perHitDamage(
      move,
      atk,
      def,
      gd.data.value!.types.chart,
      b.fieldFor(defSide, di),
      optsFor(attackerSide, ai, a.move, true),
      info,
    )
    const best = simulateMultiHit(
      per.max,
      def.hp ?? def.stats.hp,
      atk.hp ?? atk.stats.hp,
      atk.stats.hp,
      CONTACT_PUNISH[source]!,
    )
    const worst = simulateMultiHit(
      per.min,
      def.hp ?? def.stats.hp,
      atk.hp ?? atk.stats.hp,
      atk.stats.hp,
      CONTACT_PUNISH[source]!,
    )
    const kind = CONTACT_PUNISH[def.ability] ? 'abilities' : 'items'
    return { source: gd.name(kind, source), best, worst, maxHits: info.max }
  }
  const riskLines = (side: BattleSide): Line[] => {
    const r = multiHitRisk(side)
    if (!r) return []
    const d = (res: TrajectoryOutcome, label: string): Line =>
      res.outcome === 'defender'
        ? {
            key: 'battle.multiHit.defenderFaints',
            params: { label: `@battle.multiHit.${label}`, n: res.atHit },
          }
        : res.outcome === 'attacker'
          ? {
              key: 'battle.multiHit.attackerFaints',
              params: { label: `@battle.multiHit.${label}`, n: res.atHit },
            }
          : {
              key: 'battle.multiHit.survives',
              params: { label: `@battle.multiHit.${label}`, n: r.maxHits },
            }
    return [
      {
        key: side === 'mine' ? 'battle.multiHit.riskMine' : 'battle.multiHit.riskOpp',
        params: { source: r.source },
      },
      d(r.best, 'best'),
      d(r.worst, 'worst'),
    ]
  }

  // ── 턴 종료 상태이상 데미지 예고 ─────────────
  // ── 이번 턴 확률 효과 (무작위) ─────────────
  // 입력한 기술의 부가효과 확률: 하늘의은총 2배(최대 100), 우격다짐은 없음, 맞는 쪽 인분이면 막음,
  // 이미 상태이상이거나 타입상 걸리지 않으면 생략. 변덕레이저 30% 위력 2배. 변덕쟁이는 턴 끝 무작위 랭크 변화
  const STATUS_IMMUNE: Record<string, string[]> = {
    brn: ['fire'],
    par: ['electric'],
    psn: ['poison', 'steel'],
    tox: ['poison', 'steel'],
    frz: ['ice'],
  }
  // 턴 끝 회복·데미지의 원인 이름 (도구·특성은 이름, 필드·특수 상태는 문구 키)
  const residualSource = (key: string) =>
    key === 'grassy'
      ? '@terrain.grassy'
      : key === 'sand'
        ? '@weather.sand'
        : [
              'leechseed',
              'aquaring',
              'ingrain',
              'curse',
              'nightmare',
              'saltcure',
              'partiallytrapped',
            ].includes(key)
          ? `@volatile.${key}`
          : key === 'leftovers' || key === 'blacksludge'
            ? gd.name('items', key)
            : gd.name('abilities', key)

  // 턴 끝 예정: 하품 (졸음이면 이번 턴 끝에 잠듦, 이번 턴에 하품을 쓰면 다음 턴 끝에 잠듦 — 교체하면 풀림)
  //   / 턴 끝 회복·데미지 / 확인 전 상대 도구
  const pendingLines = computed<Line[]>(() => {
    const out: Line[] = []
    const label = (side: 'mine' | 'opp', i: number) =>
      `@battle.flow.${side === 'mine' ? 'mineLabel' : 'oppLabel'}|${nameOf(side, i)}`
    for (const side of ['mine', 'opp'] as const) {
      const foe = side === 'mine' ? 'opp' : 'mine'
      for (const idx of S().sides[side].active) {
        if (idx == null) continue
        const m = S().sides[side].mons[idx]!
        if (m.volatiles.yawn && !m.status && m.hp > 0)
          out.push({ key: 'battle.pending.yawn', params: { name: label(side, idx) } })
        // 멸망의노래: 이번 턴 끝 카운트 (0 이면 쓰러짐)
        const perish = m.volatiles.perishsong
        if (perish && m.hp > 0)
          out.push(
            perish <= 1
              ? { key: 'battle.pending.perishFaint', params: { name: label(side, idx) } }
              : { key: 'battle.pending.perish', params: { name: label(side, idx), n: perish - 1 } },
          )
        // 턴 끝 회복·데미지 (먹다남은음식·그래스필드·씨뿌리기 등)
        for (const x of b.residualPlan(side, idx))
          out.push({
            key: 'battle.pending.residual',
            params: {
              name: label(side, idx),
              src: residualSource(x.key),
              delta: `${x.frac > 0 ? '+' : '−'}${(Math.abs(x.frac) * 100).toFixed(1)}%`,
            },
          })
        // 상대 도구가 확인 전이면 가능성만
        const item = side === 'opp' ? b.guessedItem(idx) : ''
        if (
          side === 'opp' &&
          m.hp > 0 &&
          !m.itemKnown &&
          !m.itemGone &&
          (item === 'leftovers' || item === 'blacksludge')
        )
          out.push({
            key: 'battle.pending.itemUnknown',
            params: { name: label(side, idx), item: gd.name('items', item) },
          })
      }
      S().actions[side].forEach((a, slot) => {
        const ui = S().sides[side].active[slot]
        const ti = S().sides[foe].active[a.target] ?? null
        if (a.kind !== 'move' || a.move !== 'yawn' || ui == null || ti == null) return
        const tm = S().sides[foe].mons[ti]!
        if (tm.status || tm.volatiles.yawn) return
        out.push({
          key: 'battle.pending.yawnUsed',
          params: { name: label(side, ui), target: label(foe, ti) },
        })
      })
    }
    return out
  })

  const chanceLines = computed<Line[]>(() => {
    const out: Line[] = []
    for (const side of ['mine', 'opp'] as const) {
      const foe = side === 'mine' ? 'opp' : 'mine'
      // 행동 전 확률 (챔피언스): 잠듦·얼음 풀림 / 마비 몸저림 12.5% / 혼란 자해 33% / 헤롱헤롱 50%
      S().actions[side].forEach((a, slot) => {
        const ui = S().sides[side].active[slot]
        if (a.kind === 'switch' || ui == null) return
        const m = S().sides[side].mons[ui]!
        if (m.hp <= 0) return
        const name = `@battle.flow.${side === 'mine' ? 'mineLabel' : 'oppLabel'}|${nameOf(side, ui)}`
        if (m.status === 'slp' || m.status === 'frz')
          out.push({
            key: 'battle.chance.wake',
            params: {
              name,
              status: `@status.${m.status}`,
              n: m.toxicTurn + 1,
              p: b.wakeChance(side, ui) ?? 100,
            },
          })
        if (a.kind !== 'move') return
        if (m.status === 'par') out.push({ key: 'battle.chance.fullPara', params: { name } })
        if (m.volatiles.confusion) out.push({ key: 'battle.chance.confusion', params: { name } })
        if (m.volatiles.attract) out.push({ key: 'battle.chance.attract', params: { name } })
      })
      S().actions[side].forEach((a, slot) => {
        const ui = S().sides[side].active[slot]
        if (a.kind !== 'move' || !a.move || ui == null) return
        const mv = gd.move(a.move)
        if (!mv || mv.category === 'status') return
        const user = b.resolveAt(side, ui)
        const ti = S().sides[foe].active[a.target] ?? null
        const target = b.resolveAt(foe, ti)
        const who = `@battle.flow.${side === 'mine' ? 'mineLabel' : 'oppLabel'}|${nameOf(side, ui)}`
        if (a.move === 'ficklebeam')
          out.push({
            key: 'battle.chance.fickle',
            params: { name: who, move: gd.name('moves', a.move) },
          })
        if (!user || user.ability === 'sheerforce') return
        const mult = user.ability === 'serenegrace' ? 2 : 1
        for (const e of mv.effects) {
          if (!('chance' in e) || !e.chance) continue
          const p = Math.min(100, e.chance * mult)
          const onTarget = e.target === 'target'
          if (onTarget && (!target || target.ability === 'shielddust')) continue
          const base = {
            name: who,
            move: gd.name('moves', a.move),
            target: onTarget ? nameOf(foe, ti) : nameOf(side, ui),
            p,
          }
          if (e.type === 'status') {
            const tm = ti == null ? null : S().sides[foe].mons[ti]
            const immune = STATUS_IMMUNE[e.status]?.some((ty) =>
              target?.species.types.includes(ty as never),
            )
            if (!tm?.status && !immune)
              out.push({
                key: 'battle.chance.effect',
                params: { ...base, effect: `@status.${e.status}` },
              })
          } else if (e.type === 'volatile') {
            const key = e.status === 'flinch' ? '@battle.chance.flinch' : `@volatile.${e.status}`
            out.push({ key: 'battle.chance.effect', params: { ...base, effect: key } })
          } else if (e.type === 'boost') {
            for (const [k, v] of Object.entries(e.stats)) {
              if (!v) continue
              out.push({
                key: 'battle.chance.boost',
                params: { ...base, stat: `@stat.${k}`, delta: v > 0 ? `+${v}` : String(v) },
              })
            }
          }
        }
      })
      for (const idx of S().sides[side].active) {
        if (idx != null && b.resolveAt(side, idx)?.ability === 'moody')
          out.push({
            key: 'battle.chance.moody',
            params: {
              name: `@battle.flow.${side === 'mine' ? 'mineLabel' : 'oppLabel'}|${nameOf(side, idx)}`,
            },
          })
      }
    }
    return out
  })

  const statusForecast = computed<Line[]>(() => {
    const out: Line[] = []
    for (const side of ['mine', 'opp'] as const) {
      for (const idx of S().sides[side].active) {
        if (idx == null) continue
        const m = S().sides[side].mons[idx]!
        if (!['psn', 'tox', 'brn'].includes(m.status)) continue
        const r = b.resolveAt(side, idx)
        const max = r?.stats.hp || 0
        const nextTox = m.status === 'tox' ? m.toxicTurn + 1 : m.toxicTurn
        const dmg = statusDamage(max, m.status, r?.ability, nextTox)
        const frac =
          m.status === 'psn'
            ? '1/8'
            : m.status === 'brn'
              ? r?.ability === 'heatproof'
                ? '1/32'
                : '1/16'
              : `${Math.min(15, nextTox)}/16`
        out.push({
          key: 'battle.statusForecast',
          params: {
            name: `@battle.flow.${side === 'mine' ? 'mineLabel' : 'oppLabel'}|${nameOf(side, idx)}`,
            status: `@status.${m.status}`,
            dmg: side === 'mine' ? dmg : `${pct((dmg / (max || 1)) * 100)}%`,
            frac,
          },
        })
      }
    }
    return out
  })

  const statKeyOf = (moveId: string): StatKey | null => {
    const m = gd.move(moveId)
    return !m || m.category === 'status' ? null : m.category === 'physical' ? 'atk' : 'spa'
  }

  return {
    amountWarning,
    megaPreviewable,
    activeIdx,
    speedOf,
    speedBands,
    order,
    trickRoom,
    mineVsScenario,
    oppVsMine,
    oppHpRange,
    forecast,
    scenarioFlows,
    mineActionPreview,
    oppActionPreview,
    faintsFirst,
    fixedAmount,
    allyCell,
    riskLines,
    statusForecast,
    chanceLines,
    pendingLines,
    statKeyOf,
  }
}

const pct = (n: number) => n.toFixed(1)
