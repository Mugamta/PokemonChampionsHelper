// composables/useBattleAnalysis.ts
// 배틀 화면의 분석 정보 (기존 singleBattle.vue 기능 이식). 분석 대상 = 각 진영의 focus 칸 포켓몬.
//   - 스피드 비교(상대 무보정/준속/최속/스카프) + 관찰한 선후공으로 상대 스피드 범위 역산
//   - 예상 데미지 표: 내 공격 vs 상대 4가지 배분 시나리오 / 상대 기술 vs 내 포켓몬
//   - ① 입력값 기준 흐름 ② 실전 배분 시나리오 흐름 ③ 입힌·받은 데미지로 상대 배분 추정
//   - 연속기 + 접촉 반격(까칠한피부/철가시/울퉁불퉁멧) 자멸 위험, 턴 종료 상태이상 데미지 예고
// 문구는 { key, params } 로 반환하고 화면에서 t() 로 번역한다.

import type { useBattle, BattleSide } from '~/composables/useBattle'
import { useTeamCalc, type Cell } from '~/composables/useTeamCalc'
import { hitInfo, perHitDamage } from '~/utils/damage'
import { CONTACT_PUNISH, simulateMultiHit, statusDamage, type TrajectoryOutcome } from '~/utils/ko'
import { applyBoost, boostMultiplier, BOOSTING_NATURE, calcStat, effectiveSpeed } from '~/utils/stats'
import type { StatKey, StatTable } from '~/utils/types'

export interface Line { key: string; params?: Record<string, string | number> }
type Battle = ReturnType<typeof useBattle>

export const DEF_SCENARIOS = ['neutral', 'h32', 'full', 'fullNature'] as const
export const ATK_SCENARIOS = ['neutral', 'ev32', 'ev32Nature', 'itemBoost'] as const

export function useBattleAnalysis(b: Battle) {
  const gd = useGameData()
  const calc = useTeamCalc()
  const S = () => b.state.value!

  const activeIdx = (side: BattleSide) => S().sides[side].active[S().focus[side]] ?? null
  const action = (side: BattleSide) => S().actions[side][S().focus[side]]
  const nameOf = (side: BattleSide, idx: number | null) => (idx == null ? '' : gd.name('pokemon', b.resolveAt(side, idx)?.species.id))

  // ── 스피드 ─────────────
  const speedOf = (side: BattleSide, idx: number) => {
    const r = b.resolveAt(side, idx)
    const m = S().sides[side].mons[idx]!
    if (!r) return 0
    return effectiveSpeed(r.stats.spe, {
      boost: m.boosts.spe, item: r.slot.item, status: m.status, ability: r.ability,
      weather: S().weather.key, terrain: S().terrain.key, tailwind: !!S().sides[side].screens.tailwind,
    })
  }
  const trickRoom = computed(() => !!S().rooms.trickroom)

  // 상대 스피드 시나리오 (랭크/순풍/마비만 반영. raw = 랭크 등을 빼고 도구까지 반영한 기준값)
  const oppSpeedRows = computed(() => {
    const oi = activeIdx('opp')
    const mi = activeIdx('mine')
    if (oi == null || mi == null) return []
    const r = b.resolveAt('opp', oi)!
    const m = S().sides.opp.mons[oi]!
    const base = r.species.stats.spe
    const natures = gd.data.value!.natures
    const semi = calcStat('spe', base, 32, null)
    const max = calcStat('spe', base, 32, natures[BOOSTING_NATURE.spe])
    const raws = [
      { key: 'speedNeutral', raw: calcStat('spe', base, 0, null) },
      { key: 'speedSemi', raw: semi },
      { key: 'speedMax', raw: max },
      { key: 'speedSemiScarf', raw: Math.floor(semi * 1.5) },
      { key: 'speedMaxScarf', raw: Math.floor(max * 1.5) },
    ]
    const mult = (v: number) => {
      let s = applyBoost(v, m.boosts.spe)
      if (S().sides.opp.screens.tailwind) s *= 2
      if (m.status === 'par') s = Math.floor(s * 0.5)
      return s
    }
    return raws.map((x) => ({ ...x, value: mult(x.raw) }))
  })

  // 관찰한 선후공 → 상대 기준 스피드(랭크 제외) 하한/상한. 트릭룸이면 반대로 해석
  const inferredOppSpeed = computed(() => {
    const obs = S().observedOrder
    const oi = activeIdx('opp')
    const mi = activeIdx('mine')
    if (obs === 'unknown' || oi == null || mi == null) return null
    const m = S().sides.opp.mons[oi]!
    let mult = boostMultiplier(m.boosts.spe)
    if (S().sides.opp.screens.tailwind) mult *= 2
    if (m.status === 'par') mult *= 0.5
    const boundary = speedOf('mine', mi) / mult
    const oppFaster = (obs === 'opp') !== trickRoom.value
    return oppFaster ? { type: 'min' as const, value: Math.ceil(boundary) } : { type: 'max' as const, value: Math.floor(boundary) }
  })
  const speedExcluded = (raw: number) => {
    const inf = inferredOppSpeed.value
    if (!inf) return false
    return inf.type === 'min' ? raw < inf.value : raw > inf.value
  }

  // ── 시나리오 실능치 ─────────────
  const scenarioDefStats = (oi: number, sc: (typeof DEF_SCENARIOS)[number], defKey: 'def' | 'spd'): StatTable | null => {
    const r = b.resolveAt('opp', oi)
    if (!r) return null
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
  const scenarioAtkStats = (oi: number, sc: (typeof ATK_SCENARIOS)[number], atkKey: 'atk' | 'spa'): StatTable | null => {
    const r = b.resolveAt('opp', oi)
    if (!r) return null
    const natures = gd.data.value!.natures
    const stats = { ...r.stats }
    const sp = sc === 'neutral' ? 0 : 32
    const nat = sc === 'ev32Nature' || sc === 'itemBoost' ? natures[BOOSTING_NATURE[atkKey]] : null
    stats[atkKey] = calcStat(atkKey, r.species.stats[atkKey], sp, nat)
    return stats
  }

  // 내 포켓몬(attacker 로스터 idx) → 상대 oi, 시나리오별 데미지 칸
  const mineVsScenario = (mi: number, moveId: string, oi: number, sc: (typeof DEF_SCENARIOS)[number], crit = false): Cell | null => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    const atk = b.combatantOf('mine', mi)
    const defStatsKey = move.category === 'physical' || ['psyshock', 'psystrike'].includes(moveId) ? 'def' : 'spd'
    const stats = scenarioDefStats(oi, sc, defStatsKey)
    const r = b.resolveAt('opp', oi)
    if (!atk || !stats || !r) return null
    const oppActive = S().sides.opp.active.includes(oi)
    const def = calc.combatant(r, { stats, boosts: oppActive ? S().sides.opp.mons[oi]!.boosts : undefined, status: S().sides.opp.mons[oi]!.status })
    return calc.cell(moveId, atk, def, b.fieldFor('opp'), { crit, spread: b.spreadActive('opp') && isSpreadMove(move) })
  }

  // 상대 포켓몬 oi → 내 포켓몬 mi (상대 입력값 기준). megaPreview: 내 쪽 메가 상태를 강제
  const oppVsMine = (oi: number, moveId: string, mi: number, crit = false, megaPreview?: boolean): Cell | null => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    const atk = b.combatantOf('opp', oi)
    const def = b.combatantOf('mine', mi, megaPreview)
    if (!atk || !def) return null
    return calc.cell(moveId, atk, def, b.fieldFor('mine'), { crit, spread: b.spreadActive('mine') && isSpreadMove(move) })
  }

  const oppVsMineScenario = (oi: number, moveId: string, mi: number, sc: (typeof ATK_SCENARIOS)[number]): Cell | null => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    const atkKey = move.category === 'physical' ? 'atk' : 'spa'
    const stats = scenarioAtkStats(oi, sc, atkKey)
    const r = b.resolveAt('opp', oi)
    const def = b.combatantOf('mine', mi)
    if (!stats || !r || !def) return null
    const m = S().sides.opp.mons[oi]!
    const atk = calc.combatant(r, { stats, boosts: m.boosts, status: m.status })
    const c = calc.cell(moveId, atk, def, b.fieldFor('mine'), { spread: b.spreadActive('mine') && isSpreadMove(move) })
    if (!c || sc !== 'itemBoost') return c
    // 데미지 상승 도구(약 1.2배) 가정
    const maxHp = def.stats.hp
    const min = Math.floor(c.min * 1.2)
    const max = Math.floor(c.max * 1.2)
    return { ...c, min, max, pctMin: (min / maxHp) * 100, pctMax: (max / maxHp) * 100, lethal: max >= (def.hp ?? maxHp) }
  }

  // ── 행동 순서 판단 ─────────────
  // 우선도 → 스피드 순 (트릭룸이면 스피드 역순). 같으면 null
  const mineFirst = (mineMove: string, oppMove: string, oppSpeed: number) => {
    const mi = activeIdx('mine')!
    const pm = gd.move(mineMove)?.priority || 0
    const po = gd.move(oppMove)?.priority || 0
    if (pm !== po) return pm > po
    const ms = speedOf('mine', mi)
    if (ms === oppSpeed) return null
    return (ms > oppSpeed) !== trickRoom.value
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
    if (ma.kind !== 'move' || oa.kind !== 'move') return [{ key: 'battle.flow.switchTurn' }]
    const mineLabel = { key: 'battle.flow.mineLabel', name: nameOf('mine', mi) }
    const oppLabel = { key: 'battle.flow.oppLabel', name: nameOf('opp', oi) }
    const mineCell = ma.move ? mineVsActual(mi, ma.move, oi, ma.useMega) : null
    const oppCell = oa.move ? oppVsMine(oi, oa.move, mi) : null
    const first = mineFirst(ma.move, oa.move, speedOf('opp', oi))
    const L = (l: { key: string; name: string }) => `@${l.key}|${l.name}`
    if (first === null) return [{ key: 'battle.flow.speedTie', params: { a: L(mineLabel), b: L(oppLabel) } }]
    const attackLine = (label: typeof mineLabel, move: string, c: Cell | null): Line =>
      c
        ? { key: 'battle.flow.attack', params: { name: L(label), move: gd.name('moves', move), min: c.min, max: c.max, pmin: pct(c.pctMin), pmax: pct(c.pctMax) } }
        : { key: 'battle.flow.attackNoDmg', params: { name: L(label), move: move ? gd.name('moves', move) : '—' } }
    const [fL, sL] = first ? [mineLabel, oppLabel] : [oppLabel, mineLabel]
    const [fMove, sMove] = first ? [ma.move, oa.move] : [oa.move, ma.move]
    const [fCell, sCell] = first ? [mineCell, oppCell] : [oppCell, mineCell]
    const lines: Line[] = [{ key: 'battle.flow.first', params: { name: L(fL) } }]
    // 기술을 아직 안 정한 쪽은 공격 줄을 생략
    if (fMove) lines.push(attackLine(fL, fMove, fCell))
    const hp = first ? oppHpRange(oi) : { min: S().sides.mine.mons[mi]!.hp, max: S().sides.mine.mons[mi]!.hp }
    const ko = assessKo(fCell, hp.min, hp.max)
    if (fMove && ko === 'sure') lines.push({ key: 'battle.flow.koSure', params: { name: L(sL) } })
    else {
      if (fMove) lines.push({ key: ko === 'maybe' ? 'battle.flow.koMaybe' : 'battle.flow.koNo', params: { name: L(sL) } })
      if (sMove) lines.push(attackLine(sL, sMove, sCell))
    }
    return lines
  })

  // 실제 입력값 기준 (메가 사용 체크 시 메가 상태로 미리보기)
  const mineVsActual = (mi: number, moveId: string, oi: number, useMega = false) => {
    const move = gd.move(moveId)
    if (!move || move.category === 'status') return null
    const m = S().sides.mine.mons[mi]!
    const atk = b.combatantOf('mine', mi, useMega && !m.megaUsed ? true : undefined)
    const def = b.combatantOf('opp', oi)
    if (!atk || !def) return null
    return calc.cell(moveId, atk, def, b.fieldFor('opp'), { spread: b.spreadActive('opp') && isSpreadMove(move) })
  }
  const mineActionPreview = computed(() => {
    const mi = activeIdx('mine')
    const ma = action('mine')
    if (mi == null || !ma || ma.kind !== 'move' || !ma.move) return null
    const oi = S().sides.opp.active[ma.target] ?? activeIdx('opp')
    return oi == null ? null : mineVsActual(mi, ma.move, oi, ma.useMega)
  })

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
      const speRaw = kind === 'speedy' ? calcStat('spe', r.species.stats.spe, 32, natures[BOOSTING_NATURE.spe]) : calcStat('spe', r.species.stats.spe, 0, null)
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
        lines.push({ key: 'battle.flow.scenarioStatus', params: { move: ma.move ? gd.name('moves', ma.move) : '—' } })
        return { title: `battle.flow.${kind}`, lines }
      }
      const stats = { ...r.stats }
      stats.hp = calcStat('hp', r.species.stats.hp, 32, null)
      stats[defKey] = kind === 'bulky' ? calcStat(defKey, r.species.stats[defKey], 32, natures[BOOSTING_NATURE[defKey]]) : calcStat(defKey, r.species.stats[defKey], 0, null)
      const def = calc.combatant(r, { stats, boosts: m.boosts })
      const atk = b.combatantOf('mine', mi, ma.useMega ? true : undefined)!
      const c = calc.cell(ma.move, atk, def, b.fieldFor('opp'), { spread: b.spreadActive('opp') && isSpreadMove(move) })
      const params = { move: gd.name('moves', ma.move), pmin: pct(c?.pctMin || 0), pmax: pct(c?.pctMax || 0) }
      if (c && c.min >= stats.hp) lines.push({ key: 'battle.flow.scenarioKoSure', params })
      else if (c && c.max >= stats.hp) lines.push({ key: 'battle.flow.scenarioKoMaybe', params })
      else lines.push({ key: 'battle.flow.scenarioKoNo', params })
      return { title: `battle.flow.${kind}`, lines }
    })
  })

  // ③ 배분 추정: 여러 시나리오가 겹치면 "약한 쪽 최대 난수 ~ 강한 쪽 최저 난수" 구간
  const estimate = (matches: string[], labelPrefix: string): Line | null => {
    if (!matches.length) return null
    if (matches.length === 1) return { key: 'battle.estimateOne', params: { label: `@${labelPrefix}.${matches[0]}` } }
    return { key: 'battle.estimateRange', params: { weak: `@${labelPrefix}.${matches[0]}`, strong: `@${labelPrefix}.${matches[matches.length - 1]}` } }
  }
  const bulkEstimate = computed<Line | null | 'none'>(() => {
    const mi = activeIdx('mine')
    const ma = action('mine')
    if (S().hitItemUsed || mi == null || !ma || ma.kind !== 'move' || !ma.amount || !ma.move) return null
    const oi = S().sides.opp.active[ma.target] ?? activeIdx('opp')
    if (oi == null) return null
    const matches = DEF_SCENARIOS.filter((sc) => {
      const c = mineVsScenario(mi, ma.move, oi, sc)
      return c && ma.amount! >= Math.floor(c.pctMin * 10) / 10 && ma.amount! <= Math.ceil(c.pctMax * 10) / 10
    })
    return estimate([...matches], 'battle.scenario') ?? 'none'
  })
  const attackEstimate = computed<Line | null | 'none'>(() => {
    const oa = action('opp')
    const oi = activeIdx('opp')
    if (!oa || oa.kind !== 'move' || !oa.amount || !oa.move || oi == null) return null
    const mi = S().sides.mine.active[oa.target] ?? activeIdx('mine')
    if (mi == null) return null
    const matches = ATK_SCENARIOS.filter((sc) => {
      const c = oppVsMineScenario(oi, oa.move, mi, sc)
      return c && oa.amount! >= c.min && oa.amount! <= c.max
    })
    return estimate([...matches], 'battle.atkScenario') ?? 'none'
  })

  // ── 연속기 자멸 위험 ─────────────
  const multiHitRisk = (attackerSide: BattleSide) => {
    const defSide: BattleSide = attackerSide === 'mine' ? 'opp' : 'mine'
    const ai = activeIdx(attackerSide)
    const a = action(attackerSide)
    if (ai == null || !a || a.kind !== 'move' || !a.move) return null
    const di = S().sides[defSide].active[a.target] ?? activeIdx(defSide)
    const move = gd.move(a.move)
    if (di == null || !move || !move.flags.includes('contact')) return null
    const atk = b.combatantOf(attackerSide, ai)
    const def = b.combatantOf(defSide, di)
    if (!atk || !def) return null
    const info = hitInfo(move, atk)
    if (info.max <= 1) return null
    const source = CONTACT_PUNISH[def.ability] ? def.ability : CONTACT_PUNISH[def.item] ? def.item : null
    if (!source) return null
    const per = perHitDamage(move, atk, def, gd.data.value!.types.chart, b.fieldFor(defSide), {}, info)
    const best = simulateMultiHit(per.max, def.hp ?? def.stats.hp, atk.hp ?? atk.stats.hp, atk.stats.hp, CONTACT_PUNISH[source]!)
    const worst = simulateMultiHit(per.min, def.hp ?? def.stats.hp, atk.hp ?? atk.stats.hp, atk.stats.hp, CONTACT_PUNISH[source]!)
    const kind = CONTACT_PUNISH[def.ability] ? 'abilities' : 'items'
    return { source: gd.name(kind, source), best, worst, maxHits: info.max }
  }
  const riskLines = (side: BattleSide): Line[] => {
    const r = multiHitRisk(side)
    if (!r) return []
    const d = (res: TrajectoryOutcome, label: string): Line =>
      res.outcome === 'defender'
        ? { key: 'battle.multiHit.defenderFaints', params: { label: `@battle.multiHit.${label}`, n: res.atHit } }
        : res.outcome === 'attacker'
          ? { key: 'battle.multiHit.attackerFaints', params: { label: `@battle.multiHit.${label}`, n: res.atHit } }
          : { key: 'battle.multiHit.survives', params: { label: `@battle.multiHit.${label}`, n: r.maxHits } }
    return [
      { key: side === 'mine' ? 'battle.multiHit.riskMine' : 'battle.multiHit.riskOpp', params: { source: r.source } },
      d(r.best, 'best'),
      d(r.worst, 'worst'),
    ]
  }

  // ── 턴 종료 상태이상 데미지 예고 ─────────────
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
        const frac = m.status === 'psn' ? '1/8' : m.status === 'brn' ? (r?.ability === 'heatproof' ? '1/32' : '1/16') : `${nextTox}/16`
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
    oppSpeedRows,
    inferredOppSpeed,
    speedExcluded,
    trickRoom,
    mineVsScenario,
    oppVsMine,
    oppHpRange,
    forecast,
    scenarioFlows,
    mineActionPreview,
    bulkEstimate,
    attackEstimate,
    riskLines,
    statusForecast,
    statKeyOf,
  }
}

const pct = (n: number) => n.toFixed(1)
