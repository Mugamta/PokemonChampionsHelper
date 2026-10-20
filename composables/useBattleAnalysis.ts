// composables/useBattleAnalysis.ts
// 배틀 화면의 분석 정보 (기존 singleBattle.vue 기능 이식). 분석 대상 = 각 진영의 focus 칸 포켓몬.
//   - 상대 스피드 구간(무보정/보정/스카프 ×2) + 선후공 관찰로 좁힌 범위 (useBattle speedRangesOf)
//   - 예상 데미지 표: 내 공격 vs 상대 4가지 배분 시나리오 / 상대 기술 vs 내 포켓몬
//   - ① 입력값 기준 흐름 ② 실전 배분 시나리오 흐름 (주고받은 데미지 누적 추정은 useOppEstimate)
//   - 이번 턴 예상은 실제 행동 순서(useBattle turnOrder) 기준: 애널라이즈·보복 등, 먼저 공격한 킬가르도는 블레이드폼으로 맞음
//   - 연속기 + 접촉 반격(까칠한피부/철가시/울퉁불퉁멧) 자멸 위험, 턴 종료 상태이상 데미지 예고
// 문구는 { key, params } 로 반환하고 화면에서 t() 로 번역한다.

import type { useBattle, BattleSide } from '~/composables/useBattle'
import { useTeamCalc, type Cell } from '~/composables/useTeamCalc'
import { hitInfo, isSpreadMove, perHitDamage, type DamageOptions } from '~/utils/damage'
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
  const megaThisTurn = (side: BattleSide, idx: number) => {
    const a = action(side)
    return a?.kind === 'move' && a.useMega && !S().sides[side].mons[idx]!.megaUsed
      ? true
      : undefined
  }

  // ── 이번 턴 상황 ─────────────
  // 공격 대상 칸 → 맞는 포켓몬. 그 칸이 이번 턴 교체하면 들어오는 포켓몬 (교체는 기술보다 먼저)
  const targetOf = (foe: BattleSide, slot: number): { idx: number | null; switchedIn: boolean } => {
    const fa = S().actions[foe][slot]
    if (fa?.kind === 'switch' && fa.switchTo != null) return { idx: fa.switchTo, switchedIn: true }
    return { idx: S().sides[foe].active[slot] ?? null, switchedIn: false }
  }
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
  ): StatTable | null => {
    const r = b.resolveAt('opp', oi)
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
  const mineVsScenario = (
    mi: number,
    moveId: string,
    oi: number,
    sc: (typeof DEF_SCENARIOS)[number],
    crit = false,
  ): Cell | null => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    const atk = b.combatantOf('mine', mi, undefined, true)
    const defStatsKey =
      move.category === 'physical' || ['psyshock', 'psystrike'].includes(moveId) ? 'def' : 'spd'
    const stats = scenarioDefStats(oi, sc, defStatsKey)
    const r = b.resolveAt('opp', oi)
    if (!atk || !stats || !r) return null
    const oppActive = S().sides.opp.active.includes(oi)
    const def = calc.combatant(r, {
      stats,
      boosts: oppActive ? S().sides.opp.mons[oi]!.boosts : undefined,
      status: S().sides.opp.mons[oi]!.status,
    })
    return calc.cell(moveId, atk, def, b.fieldFor('opp', oi), {
      crit,
      spread: spreadFor('mine', mi, move, 'opp'),
      ...optsFor('mine', mi, moveId),
    })
  }

  // 상대 포켓몬 oi → 내 포켓몬 mi (상대 입력값 기준). megaPreview: 내 쪽 메가 상태를 강제
  // turn: 이번 턴 입력 기준 (행동 순서 보정 + 먼저 공격한 킬가르도는 블레이드폼으로 맞음)
  const oppVsMine = (
    oi: number,
    moveId: string,
    mi: number,
    crit = false,
    megaPreview?: boolean,
    turn = false,
  ): Cell | null => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    const atk = b.combatantOf('opp', oi, megaThisTurn('opp', oi), true)
    const alt = turn ? b.formAtHit('mine', mi, 'opp', oi, order.value) : undefined
    const def = b.combatantOf('mine', mi, megaPreview, false, alt)
    if (!atk || !def) return null
    return calc.cell(moveId, atk, def, b.fieldFor('mine', mi), {
      crit,
      spread: spreadFor('opp', oi, move, 'mine'),
      ...optsFor('opp', oi, moveId, turn),
    })
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

  // 상대 HP % 를 실수치 범위로 (표시가 반올림된 % 라서 ±0.5% 오차)
  const oppHpRange = (oi: number) => {
    const max = b.maxHp('opp', oi)
    const p = S().sides.opp.mons[oi]!.hp
    const lo = Math.max(0, Math.ceil(((p - 0.5) / 100) * max))
    const hi = Math.min(max, Math.floor(((p + 0.5) / 100) * max))
    return { min: lo, max: Math.max(lo, hi) }
  }
  const assessKo = (c: Cell | null, hpMin: number, hpMax: number) => {
    if (!c) return 'none'
    if (hpMax <= 0 || c.min >= hpMax) return 'sure'
    if (c.max < hpMin) return 'none'
    return 'maybe'
  }

  // ① 입력값 기준 흐름
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
    // 선후공을 관찰해 입력했으면 그대로, 아니면 우선도·스피드로 예상 (이번 턴 메가진화 반영)
    const first =
      S().observedOrder !== 'unknown'
        ? S().observedOrder === 'mine'
        : mineFirst(
            ma.move,
            oa.move,
            speedOf('opp', oi, megaThisTurn('opp', oi)),
            speedOf('mine', mi, megaThisTurn('mine', mi)),
          )
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
    // 행동 불가가 있는 턴: 행동하지 못하는 쪽은 이유만, 나머지는 공격 줄
    if (ma.kind === 'cant' || oa.kind === 'cant') {
      const lines: Line[] = []
      for (const [a, label, cell] of [
        [ma, mineLabel, mineCell],
        [oa, oppLabel, oppCell],
      ] as const) {
        if (a.kind === 'cant')
          lines.push({
            key: 'battle.flow.cant',
            params: { name: L(label), reason: `@battle.cantReason.${a.cantReason}` },
          })
        else if (a.move) lines.push(attackLine(label, a.move, cell))
      }
      return lines
    }
    if (first === null)
      return [{ key: 'battle.flow.speedTie', params: { a: L(mineLabel), b: L(oppLabel) } }]
    const [fL, sL] = first ? [mineLabel, oppLabel] : [oppLabel, mineLabel]
    const [fMove, sMove] = first ? [ma.move, oa.move] : [oa.move, ma.move]
    const [fCell, sCell] = first ? [mineCell, oppCell] : [oppCell, mineCell]
    const lines: Line[] = [{ key: 'battle.flow.first', params: { name: L(fL) } }]
    // 기술을 아직 안 정한 쪽은 공격 줄을 생략
    if (fMove) lines.push(attackLine(fL, fMove, fCell))
    const hp = first
      ? oppHpRange(oi)
      : { min: S().sides.mine.mons[mi]!.hp, max: S().sides.mine.mons[mi]!.hp }
    const ko = assessKo(fCell, hp.min, hp.max)
    if (fMove && ko === 'sure') lines.push({ key: 'battle.flow.koSure', params: { name: L(sL) } })
    else {
      if (fMove)
        lines.push({
          key: ko === 'maybe' ? 'battle.flow.koMaybe' : 'battle.flow.koNo',
          params: { name: L(sL) },
        })
      if (sMove) lines.push(attackLine(sL, sMove, sCell))
    }
    return lines
  })

  // 실제 입력값 기준 (메가 사용 체크 시 메가 상태로 미리보기)
  const mineVsActual = (
    mi: number,
    moveId: string,
    oi: number,
    useMega = false,
    switchedIn = false,
  ) => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    const m = S().sides.mine.mons[mi]!
    const atk = b.combatantOf('mine', mi, useMega && !m.megaUsed ? true : undefined, true)
    // 상대 킬가르도가 이번 턴 먼저 공격하면 블레이드폼으로 맞는다 (교체로 들어오는 상대는 해당 없음)
    const alt = switchedIn ? undefined : b.formAtHit('opp', oi, 'mine', mi, order.value)
    const def = b.combatantOf('opp', oi, megaThisTurn('opp', oi), false, alt)
    if (!atk || !def) return null
    return calc.cell(moveId, atk, def, b.fieldFor('opp', oi), {
      spread: spreadFor('mine', mi, move, 'opp'),
      ...optsFor('mine', mi, moveId, true),
    })
  }
  const mineActionPreview = computed(() => {
    const mi = activeIdx('mine')
    const ma = action('mine')
    if (mi == null || !ma || ma.kind !== 'move' || !ma.move) return null
    const t = targetOf('opp', ma.target)
    return t.idx == null ? null : mineVsActual(mi, ma.move, t.idx, ma.useMega, t.switchedIn)
  })

  // ── 더블: 아군도 맞히는 광역기 ─────────────
  // side 의 slot 이 쓰는 기술이 아군도 맞히면 아군이 받는 데미지 (텔레파시는 무효)
  const allyCell = (side: BattleSide, slot: number): Cell | null => {
    const a = S().actions[side][slot]
    const ui = S().sides[side].active[slot]
    const ai = b.allyOf(side, slot)
    if (!a || a.kind !== 'move' || !a.move || ui == null || ai == null || !b.hitsAlly(a.move))
      return null
    const atk = b.combatantOf(
      side,
      ui,
      a.useMega && !S().sides[side].mons[ui]!.megaUsed ? true : undefined,
      true,
    )
    const def = b.combatantOf(side, ai)
    if (!atk || !def) return null
    const c = calc.cell(a.move, atk, def, b.fieldFor(side, ai), {
      spread: true,
      ...b.attackOpts(side, ui, a.move),
    })
    if (!c || def.ability !== 'telepathy') return c
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
      const first = mineFirst(ma.move, '', oppSpeed)
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
      const def = calc.combatant(r, { stats, boosts: m.boosts })
      const atk = b.combatantOf('mine', mi, ma.useMega ? true : undefined, true)!
      const c = calc.cell(ma.move, atk, def, b.fieldFor('opp', oi), {
        spread: spreadFor('mine', mi, move, 'opp'),
        ...optsFor('mine', mi, ma.move),
      })
      const params = {
        move: gd.name('moves', ma.move),
        pmin: pct(c?.pctMin || 0),
        pmax: pct(c?.pctMax || 0),
      }
      if (c && c.min >= stats.hp) lines.push({ key: 'battle.flow.scenarioKoSure', params })
      else if (c && c.max >= stats.hp) lines.push({ key: 'battle.flow.scenarioKoMaybe', params })
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
    const t = targetOf(defSide, a.target)
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
        : ['leechseed', 'aquaring', 'ingrain'].includes(key)
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
        const r = b.resolveAt(side, idx)
        const item = r?.slot.item ?? ''
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
              : `${nextTox}/16`
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
    allyCell,
    riskLines,
    statusForecast,
    chanceLines,
    pendingLines,
    statKeyOf,
  }
}

const pct = (n: number) => n.toFixed(1)
