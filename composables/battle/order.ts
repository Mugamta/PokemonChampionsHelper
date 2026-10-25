// composables/battle/order.ts
// 스피드와 행동 순서: 실전 스피드·우선도 → 이번 턴 기술 순서(turnOrder), 맞는 포켓몬(hitTarget), 그때의 공격 보정(actionOpts),
// 이번 턴 앞선 행동의 확정 효과(turnStateBefore, 예상용), 상대 스피드 구간·선후공 판정(speedOrder). 상태를 바꾸지 않는다.

import { isSpreadMove, type Combatant, type DamageOptions, type FieldState } from '~/utils/damage'
import { clampBoost, effectiveSpeed } from '~/utils/stats'
import {
  compareSpeed,
  fullRanges,
  narrowRanges,
  oppSpeedSpan,
  SPEED_BANDS,
  type SpeedEnv,
  type SpeedRanges,
} from '~/utils/speedInference'
import type { BoostTable, MoveEffect, RankKey, Status, Terrain, Weather } from '~/utils/types'
import {
  BLOCK_FOE_DROPS,
  BLOCK_STAT_DROP,
  INTIMIDATE_IMMUNE,
  parseBoostKey,
  zeroBoosts,
  type BattleSide,
  type TurnEntry,
} from '~/utils/battleState'
import type { BattleCore } from '~/composables/battle/core'

export function createOrder(b: BattleCore) {
  const {
    N,
    gd,
    calc,
    state,
    mon,
    resolveAt,
    maxHp,
    isFainted,
    foeOf,
    slotsOf,
    oppItemOf,
    canMegaEvolve,
    combatantOf,
    fieldFor,
    attackOpts,
    spreadActive,
    hitsAlly,
    statusBlocked,
    behindSub,
  } = b

  // ── 행동 순서 ─────────────
  // 실전 스피드 (랭크 / 특성 / 스카프(매직룸·도구 잃음이면 무효) / 순풍 / 마비). megaOverride: 이번 턴 메가진화 반영
  // itemOverride: 이 도구를 지녔다면 (상대 추측 도구로 선후공이 바뀌는지 볼 때)
  const speedOf = (
    side: BattleSide,
    idx: number,
    megaOverride?: boolean,
    itemOverride?: string,
  ) => {
    const s = state.value!
    const r = resolveAt(side, idx, megaOverride)
    const m = mon(side, idx)
    if (!r) return 0
    return effectiveSpeed(r.stats.spe, {
      boost: m.boosts.spe,
      item: m.itemGone || s.rooms.magicroom ? '' : (itemOverride ?? r.slot.item),
      itemLost: m.itemGone,
      status: m.status,
      ability: r.ability,
      weather: s.weather.key,
      terrain: s.terrain.key,
      tailwind: !!s.sides[side].screens.tailwind,
    })
  }
  // 우선도 (장난꾸러기: 변화기 +1 / 질풍날개: HP 가득일 때 비행 기술 +1 / 힐링시프트: 회복 기술 +3)
  const movePriority = (side: BattleSide, idx: number, moveId: string) => {
    const mv = gd.move(moveId)
    if (!mv) return 0
    const ab = resolveAt(side, idx)?.ability
    let p = mv.priority
    if (ab === 'prankster' && mv.category === 'status') p += 1
    if (
      ab === 'galewings' &&
      mv.type === 'flying' &&
      mon(side, idx).hp >= (side === 'mine' ? maxHp(side, idx) : 100)
    )
      p += 1
    if (ab === 'triage' && mv.effects.some((e) => e.type === 'heal' || e.type === 'drain')) p += 3
    return p
  }
  // 이번 턴 메가진화하는 포켓몬은 메가 폼 기준
  const turnMega = (side: BattleSide, slot: number, idx: number) => {
    const a = state.value!.actions[side][slot]
    return a?.kind === 'move' && a.useMega && canMegaEvolve(side, idx) ? true : undefined
  }
  // 이번 턴 기술을 쓰는 순서: 우선도 → 스피드(트릭룸이면 느린 쪽부터, 내 쪽 vs 상대는 speedOrder 로 확정되면 그대로).
  // 분석 대상 칸끼리는 관찰한 선후공이 있으면 그대로 (우선도가 같을 때). 교체하는 칸은 기술을 안 씀
  const turnOrder = (): TurnEntry[] => {
    const s = state.value!
    const list: (TurnEntry & { pri: number; spe: number; mega?: true })[] = []
    for (const side of ['mine', 'opp'] as const) {
      s.actions[side].forEach((a, slot) => {
        const idx = s.sides[side].active[slot]
        if (a.kind !== 'move' || idx == null || isFainted(side, idx)) return
        const mega = turnMega(side, slot, idx)
        list.push({
          side,
          slot,
          idx,
          move: a.move,
          mega,
          pri: movePriority(side, idx, a.via || a.move),
          spe: speedOf(side, idx, mega),
        })
      })
    }
    const tr = !!s.rooms.trickroom
    // 내 쪽 vs 상대: 스피드 범위로 선후공이 정해지면 그대로, 아니면 상대 스피드 범위의 가운데로 (화면은 이때 본 순서를 입력받는다)
    const bySpeed = (x: (typeof list)[number], y: (typeof list)[number]) => {
      if (x.side !== y.side) {
        const [m, o] = x.side === 'mine' ? [x, y] : [y, x]
        const v = speedOrder(m.idx, o.idx, m.mega, o.mega)?.first
        if (v === 'mine' || v === 'opp') return v === x.side ? -1 : 1
      }
      return tr ? x.spe - y.spe : y.spe - x.spe
    }
    list.sort((x, y) => y.pri - x.pri || bySpeed(x, y) || (x.side === 'mine' ? -1 : 1))
    if (s.observedOrder !== 'unknown') {
      const a = list.findIndex((e) => e.side === 'mine' && e.slot === s.focus.mine)
      const b = list.findIndex((e) => e.side === 'opp' && e.slot === s.focus.opp)
      if (a >= 0 && b >= 0 && list[a]!.pri === list[b]!.pri) {
        const wantFirst = s.observedOrder === 'mine' ? a : b
        const other = wantFirst === a ? b : a
        if (wantFirst > other) [list[a], list[b]] = [list[b]!, list[a]!]
      }
    }
    return list.map(({ side, slot, idx, move }) => ({ side, slot, idx, move }))
  }
  // 순서에서 이 기술의 그때 보정: 대상이 먼저 행동 / 이번 턴 교체로 등장 / 대상에게 먼저 맞음
  // side 의 slot 행동이 맞히는 포켓몬: 대상 칸이 이번 턴 교체하면 들어오는 포켓몬 (교체는 기술보다 먼저),
  // 대상이 이 행동보다 먼저 교체기(유턴·볼트체인지·배턴터치 등)를 쓰고 물러나면 그때 나오는 포켓몬.
  // k: 맞는 상대 칸 (생략하면 행동의 대상 칸, 더블 광역기의 다른 칸은 직접 지정)
  const hitTarget = (
    side: BattleSide,
    slot: number,
    order: TurnEntry[] = turnOrder(),
    k = state.value!.actions[side][slot]?.target ?? 0,
  ): { idx: number | null; switchedIn: boolean } => {
    const s = state.value!
    const foe = foeOf(side)
    const fa = s.actions[foe][k]
    if (fa?.kind === 'switch' && fa.switchTo != null) return { idx: fa.switchTo, switchedIn: true }
    const cur = s.sides[foe].active[k] ?? null
    if (cur != null && fa?.kind === 'move' && fa.selfSwitch != null) {
      const me = order.findIndex((e) => e.side === side && e.slot === slot)
      const them = order.findIndex((e) => e.side === foe && e.slot === k)
      if (me >= 0 && them >= 0 && them < me) return { idx: fa.selfSwitch, switchedIn: true }
    }
    return { idx: cur, switchedIn: false }
  }
  const actionOpts = (
    side: BattleSide,
    slot: number,
    userIdx: number,
    moveId: string,
    order: TurnEntry[],
  ): DamageOptions => {
    const s = state.value!
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const a = s.actions[side][slot]!
    const hit = hitTarget(side, slot, order)
    const targetIdx = hit.idx
    const pos = order.findIndex((e) => e.side === side && e.idx === userIdx)
    const tPos =
      targetIdx == null ? -1 : order.findIndex((e) => e.side === foe && e.idx === targetIdx)
    const targetSwitchedIn = hit.switchedIn
    const targetFirst = tPos >= 0 && pos >= 0 && tPos < pos
    const ta = targetFirst ? s.actions[foe][order[tPos]!.slot] : undefined
    const tMove = ta?.kind === 'move' ? gd.move(ta.move) : null
    const userSlotOf = s.sides[side].active.indexOf(userIdx)
    const damagedByTarget =
      !!tMove &&
      tMove.category !== 'status' &&
      (ta!.target === userSlotOf || isSpreadMove(tMove)) &&
      (ta!.amount == null || ta!.amount > 0)
    const move = gd.move(moveId)
    const atkC = combatantOf(side, userIdx, turnMega(side, slot, userIdx), true)
    const field = targetIdx == null ? fieldFor(foe) : fieldFor(foe, targetIdx)
    // 이 행동보다 먼저 행동하는 것들 (순서대로)
    const earlier = pos >= 0 ? order.slice(0, pos) : []
    const actOf = (e: TurnEntry) => s.actions[e.side][e.slot]
    // e 가 (defSide, defSlot) 칸을 공격기로 맞히는지
    const hitsSlot = (e: TurnEntry, defSide: BattleSide, defSlot: number) => {
      const ea = actOf(e)
      if (!ea || ea.kind !== 'move' || ea.missed) return false
      const mv = gd.move(ea.move)
      if (!mv || mv.category === 'status') return false
      if (e.side === defSide) return hitsAlly(ea.move) && e.slot !== defSlot
      return ea.target === defSlot || isSpreadMove(mv)
    }
    const user = mon(side, userIdx)
    // 승부굳히기: 대상이 이번 턴 이미 맞음
    const targetDamagedThisTurn =
      targetIdx != null &&
      (!!mon(foe, targetIdx).turnDamaged || earlier.some((e) => hitsSlot(e, foe, a.target)))
    // 분풀이: 이번 턴 능력이 떨어짐 (먼저 맞은 기술의 확정 능력 하락, 이번 턴 교체로 나온 상대의 위협)
    const lowersUser = (e: TurnEntry) => {
      const ea = actOf(e)
      if (e.side === side || !ea || ea.kind !== 'move' || ea.missed) return false
      const mv = gd.move(ea.move)
      return (
        !!mv &&
        (ea.target === userSlotOf || isSpreadMove(mv)) &&
        mv.effects.some(
          (ef) =>
            ef.type === 'boost' &&
            ef.target === 'target' &&
            (!ef.chance || ef.chance >= 100) &&
            Object.values(ef.stats).some((v) => (v ?? 0) < 0),
        )
      )
    }
    const intimidatedNow = s.actions[foe].some(
      (fa) =>
        fa.kind === 'switch' &&
        fa.switchTo != null &&
        resolveAt(foe, fa.switchTo)?.ability === 'intimidate',
    )
    const statsLoweredThisTurn = !!user.turnLowered || earlier.some(lowersUser) || intimidatedNow
    // 돌림노래: 같은 편이 이번 턴 먼저 돌림노래를 씀
    const roundBoost = earlier.some(
      (e) => e.side === side && e.idx !== userIdx && actOf(e)?.move === 'round',
    )
    // 카운터·미러코트·메탈버스트·앙갚음: 이번 턴 먼저 받은 데미지 (HP)
    const taken = { ...(user.turnTaken ?? { physical: 0, special: 0, last: 0 }) }
    for (const e of earlier) {
      if (e.side === side || !hitsSlot(e, side, userSlotOf)) continue
      const ea = actOf(e)!
      const mv = gd.move(ea.move)!
      const amt = ea.target === userSlotOf ? ea.amount : ea.amount2
      if (!amt) continue
      const hp = e.side === 'mine' ? Math.round((amt / 100) * maxHp(side, userIdx)) : amt
      if (mv.category === 'physical') taken.physical += hp
      else taken.special += hp
      taken.last = hp
    }
    return {
      ...attackOpts(side, userIdx, moveId),
      spread: spreadActive(foe) && isSpreadMove(move, { attacker: atkC, field }),
      movesLast: targetSwitchedIn || targetFirst,
      targetSwitchedIn,
      damagedByTarget,
      targetDamagedThisTurn,
      statsLoweredThisTurn,
      roundBoost,
      damageTaken: taken,
    }
  }
  // 맞는 시점의 배틀 폼 (킬가르도): 같은 턴에 먼저 공격기를 쓰면 블레이드폼, 킹실드면 실드폼. 해당 없으면 undefined
  const formAtHit = (
    defSide: BattleSide,
    defIdx: number,
    attackerSide: BattleSide,
    attackerIdx: number,
    order: TurnEntry[],
  ): boolean | undefined => {
    if (resolveAt(defSide, defIdx)?.ability !== 'stancechange') return undefined
    const aPos = order.findIndex((e) => e.side === attackerSide && e.idx === attackerIdx)
    const dPos = order.findIndex((e) => e.side === defSide && e.idx === defIdx)
    if (aPos < 0 || dPos < 0 || dPos > aPos) return undefined
    const dm = order[dPos]!.move
    if (dm === 'kingsshield') return false
    const mv = gd.move(dm)
    return mv && mv.category !== 'status' ? true : undefined
  }

  // ── 이번 턴 앞선 행동의 확정 효과 (예상 계산용) ─────────────
  // 이번 턴 (atkSide, atkIdx) 가 행동하기 직전의 랭크·상태이상·벽·날씨·필드. 실제 턴 적용(executeTurn)은 순서대로 상태를 바꾸므로
  // 이건 예상(이번 턴 예상 흐름·행동 칸 예상 데미지·입력 경고)용이다. 반영하는 것:
  //   - 교체로 나오는 포켓몬의 위협 (기술보다 먼저)
  //   - 먼저 행동하는 기술의 확정 효과·확률 100% 부가효과 (applyMoveEffects 와 같은 조건: 빗나감·데미지 0·상성 무효·대타·
  //     인분·우격다짐·황금몸이면 없음): 랭크(심술꾸러기·클리어바디류·오기·승기), 상태이상, 벽(리플렉터·빛의장막·오로라베일), 날씨, 필드, 흑안개
  //   - 행동 칸에서 체크한 "이번 턴 확률 효과"의 상태이상
  interface TurnSnapshot {
    boosts: Map<string, Partial<BoostTable>>
    status: Map<string, Status>
    screens: Record<BattleSide, Set<string>>
    weather?: Weather
    terrain?: Terrain
  }
  const turnStateBefore = (
    atkSide: BattleSide,
    atkIdx: number,
    order: TurnEntry[] = turnOrder(),
  ): TurnSnapshot => {
    const s = state.value!
    const snap: TurnSnapshot = {
      boosts: new Map(),
      status: new Map(),
      screens: { mine: new Set(), opp: new Set() },
    }
    const key = (sd: BattleSide, i: number) => `${sd}:${i}`
    const boostsOf = (sd: BattleSide, i: number) => {
      const k = key(sd, i)
      if (!snap.boosts.has(k)) snap.boosts.set(k, { ...mon(sd, i).boosts })
      return snap.boosts.get(k)!
    }
    const statusOf = (sd: BattleSide, i: number) => snap.status.get(key(sd, i)) ?? mon(sd, i).status
    const setStatus = (sd: BattleSide, i: number, st: Exclude<Status, ''>) => {
      if (!statusOf(sd, i) && !statusBlocked(sd, i, st)) snap.status.set(key(sd, i), st)
    }
    // statChange 와 같은 규칙 (상태를 바꾸지 않는 사본)
    const change = (sd: BattleSide, i: number, k: RankKey, delta: number, byFoe: boolean) => {
      const ab = resolveAt(sd, i)?.ability || ''
      if (ab === 'contrary') delta = -delta
      if (delta < 0 && byFoe && (BLOCK_FOE_DROPS.has(ab) || BLOCK_STAT_DROP[ab] === k)) return
      if (delta < 0 && byFoe && ab === 'mirrorarmor') return
      const b = boostsOf(sd, i)
      const before = b[k] ?? 0
      b[k] = clampBoost(before + delta)
      if (b[k]! >= before || !byFoe) return
      if (ab === 'defiant') change(sd, i, 'atk', 2, false)
      if (ab === 'competitive') change(sd, i, 'spa', 2, false)
    }
    // 교체로 나오는 위협
    for (const sd of ['mine', 'opp'] as const) {
      const foe = foeOf(sd)
      for (const a of s.actions[sd]) {
        if (a?.kind !== 'switch' || a.switchTo == null) continue
        if (resolveAt(sd, a.switchTo)?.ability !== 'intimidate') continue
        s.sides[foe].active.forEach((fi, fSlot) => {
          if (fi == null || isFainted(foe, fi) || s.actions[foe][fSlot]?.kind === 'switch') return
          const ab = resolveAt(foe, fi)?.ability || ''
          if (ab === 'guarddog') return change(foe, fi, 'atk', 1, false)
          if (INTIMIDATE_IMMUNE.has(ab) || mon(foe, fi).volatiles.substitute) return
          change(foe, fi, 'atk', -1, true)
          if (ab === 'rattled') change(foe, fi, 'spe', 1, false)
        })
      }
    }
    for (const e of order) {
      if (e.side === atkSide && e.idx === atkIdx) break
      const a = s.actions[e.side][e.slot]
      const move = gd.move(e.move)
      if (!a || a.kind !== 'move' || a.missed || !move || isFainted(e.side, e.idx)) continue
      const foe = foeOf(e.side)
      const user = resolveAt(e.side, e.idx)
      const damaging = move.category !== 'status'
      // 맞은 상대 칸 (입력한 데미지가 0 이면 안 맞음, 공격기는 상성 무효 제외)
      const hits: number[] = []
      const tryHit = (k: number, amount: number | null | undefined) => {
        const t = hitTarget(e.side, e.slot, order, k).idx
        if (t == null || isFainted(foe, t) || hits.includes(t)) return
        if (damaging && amount === 0) return
        if (damaging) {
          const atkC = combatantOf(e.side, e.idx, undefined, true)
          const defC = combatantOf(foe, t)
          if (atkC && defC && calc.cell(e.move, atkC, defC, fieldFor(foe, t))?.immune) return
        } else if (resolveAt(foe, t)?.ability === 'goodasgold') return
        hits.push(t)
      }
      if (move.target !== 'self') {
        tryHit(a.target, a.amount)
        if (N > 1 && isSpreadMove(move)) tryHit(1 - a.target, a.amount2)
      }
      const blocked = (t: number) => behindSub(e.side, e.idx, foe, t, e.move)
      for (const ef of move.effects as MoveEffect[]) {
        if (ef.type === 'boost' || ef.type === 'status') {
          const chance = 'chance' in ef ? ef.chance : undefined
          if (chance && (chance < 100 || user?.ability === 'sheerforce')) continue
          if (damaging && !hits.length) continue
          if (ef.target === 'self') {
            if (ef.type === 'boost')
              for (const [k, v] of Object.entries(ef.stats))
                if (k in zeroBoosts()) change(e.side, e.idx, k as RankKey, v || 0, false)
            continue
          }
          for (const t of hits) {
            if (blocked(t) || (chance && resolveAt(foe, t)?.ability === 'shielddust')) continue
            if (ef.type === 'boost') {
              for (const [k, v] of Object.entries(ef.stats))
                if (k in zeroBoosts()) change(foe, t, k as RankKey, v || 0, true)
            } else setStatus(foe, t, ef.status)
          }
        } else if (ef.type === 'side' && ['reflect', 'lightscreen', 'auroraveil'].includes(ef.key))
          snap.screens[ef.side === 'self' ? e.side : foe].add(ef.key)
        else if (ef.type === 'weather' && !s.weather.permanent) snap.weather = ef.key
        else if (ef.type === 'terrain') snap.terrain = ef.key
      }
      if (e.move === 'haze')
        for (const sd of ['mine', 'opp'] as const)
          for (const i of s.sides[sd].active)
            if (i != null) snap.boosts.set(key(sd, i), zeroBoosts())
      // 행동 칸에서 체크한 이번 턴 상태이상 (맞은 상대에게, 대타 뒤면 없음)
      const checked: [number | null, string[] | undefined][] = [
        [hitTarget(e.side, e.slot, order, a.target).idx, a.inflicts],
        [N > 1 ? hitTarget(e.side, e.slot, order, 1 - a.target).idx : null, a.inflicts2],
      ]
      for (const [t, list] of checked) {
        if (t == null || !hits.includes(t)) continue
        for (const k of list ?? []) {
          const bk = parseBoostKey(k)
          if (bk?.target === 'self')
            for (const [st, v] of bk.stats) change(e.side, e.idx, st, v, false)
          if (blocked(t)) continue
          if (bk?.target === 'target') for (const [st, v] of bk.stats) change(foe, t, st, v, true)
          else if (['brn', 'par', 'psn', 'tox', 'slp', 'frz'].includes(k))
            setStatus(foe, t, k as Exclude<Status, ''>)
        }
      }
    }
    return snap
  }
  // turnStateBefore 결과를 계산용 포켓몬에 덮어씀 (랭크는 필드에 나와 있는 포켓몬만)
  const withTurnState = <C extends Combatant>(
    snap: TurnSnapshot,
    side: BattleSide,
    idx: number,
    c: C,
  ): C => {
    const b = snap.boosts.get(`${side}:${idx}`)
    const st = snap.status.get(`${side}:${idx}`)
    if (!b && !st) return c
    const active = state.value!.sides[side].active.includes(idx)
    return { ...c, ...(b && active ? { boosts: b } : {}), ...(st ? { status: st } : {}) }
  }
  const fieldWithTurnState = (
    snap: TurnSnapshot,
    defSide: BattleSide,
    f: FieldState,
  ): FieldState => ({
    ...f,
    ...(snap.weather ? { weather: snap.weather } : {}),
    ...(snap.terrain ? { terrain: snap.terrain } : {}),
    reflect: f.reflect || snap.screens[defSide].has('reflect'),
    lightScreen: f.lightScreen || snap.screens[defSide].has('lightscreen'),
    auroraVeil: f.auroraVeil || snap.screens[defSide].has('auroraveil'),
  })

  // ── 상대 스피드 추정 ─────────────
  // 상대의 그때 스피드 계산 조건 (종족값 + 랭크/특성/순풍/마비/도구 상태). 변신 중이면 스피드 실능치가 정해짐
  const speedEnvOf = (
    oi: number,
    megaOverride?: boolean,
  ): { base: number; env: SpeedEnv } | null => {
    const s = state.value!
    const r = resolveAt('opp', oi, megaOverride)
    const m = mon('opp', oi)
    if (!r) return null
    return {
      base: r.species.stats.spe,
      env: {
        boost: m.boosts.spe,
        status: m.status,
        ability: r.ability,
        weather: s.weather.key,
        terrain: s.terrain.key,
        tailwind: !!s.sides.opp.screens.tailwind,
        itemLost: m.itemGone,
        magicRoom: !!s.rooms.magicroom,
        fixedStat: r.transformedFrom ? r.stats.spe : undefined,
      },
    }
  }
  // 이번 턴 관찰한 선후공 (분석 대상 칸끼리, 둘 다 기술 + 우선도가 같거나 둘 다 교체일 때만 스피드 비교가 됨)
  // 둘 다 교체하면 교체 순서도 스피드 순 → 나가는 포켓몬끼리 비교 (메가진화 안 함). 한쪽만 교체면 교체가 항상 먼저라 정보 없음
  const pendingSpeedObservation = () => {
    const s = state.value!
    if (s.observedOrder === 'unknown') return null
    const ms = s.focus.mine
    const os = s.focus.opp
    const ma = s.actions.mine[ms]
    const oa = s.actions.opp[os]
    const mi = s.sides.mine.active[ms]
    const oi = s.sides.opp.active[os]
    if (mi == null || oi == null || isFainted('mine', mi) || isFainted('opp', oi)) return null
    const bothSwitch = ma?.kind === 'switch' && oa?.kind === 'switch'
    if (!bothSwitch) {
      if (ma?.kind !== 'move' || oa?.kind !== 'move') return null
      if (
        movePriority('mine', mi, ma.via || ma.move) !== movePriority('opp', oi, oa.via || oa.move)
      )
        return null
    }
    const se = speedEnvOf(oi, bothSwitch ? undefined : turnMega('opp', os, oi))
    if (!se) return null
    return {
      oi,
      ...se,
      mySpeed: speedOf('mine', mi, bothSwitch ? undefined : turnMega('mine', ms, mi)),
      // 트릭룸에서는 느린 쪽이 먼저
      oppAtLeast: (s.observedOrder === 'opp') !== !!s.rooms.trickroom,
    }
  }
  // 상대 oi 의 스피드 구간: 저장된 관찰 + 이번 턴 관찰(미리보기). 변신 중이면 이번 턴 관찰만
  // 도구를 확정했으면 구애스카프 여부도 확정 → 스카프로 확정이면 스카프 구간만, 다른 도구면 스카프 없는 구간만
  const speedRangesOf = (oi: number, withPending = true): SpeedRanges => {
    const m = mon('opp', oi)
    const transformed = !!m.transform
    const base = transformed ? fullRanges() : (m.speedSp ?? fullRanges())
    const p = withPending ? pendingSpeedObservation() : null
    const ranges =
      p && p.oi === oi ? narrowRanges(base, p.base, p.env, p.mySpeed, p.oppAtLeast) : base
    if (!m.itemKnown) return ranges
    const scarf = oppItemOf(oi) === 'choicescarf'
    const out = { ...ranges }
    for (const band of SPEED_BANDS) if (band.scarf !== scarf) out[band.key] = null
    return out
  }

  // ── 선후공 판정 (스피드) ─────────────
  // 내 mi 와 상대 oi 가 같은 우선도로 기술을 쓸 때, 상대 스피드 범위(선후공 관찰·확정 도구로 좁힌 것)를 지금 조건
  // (랭크·마비·순풍·날씨·필드·이번 턴 메가진화)으로 환산해 내 스피드와 비교. 트릭룸이면 느린 쪽이 먼저.
  //   first: 'mine' | 'opp' = 먼저 행동 확정, 'tie' = 반드시 동속(무작위), null = 범위가 겹쳐 모름 (화면은 본 순서를 입력받고, 적용은 범위 가운데 스피드로)
  //   tiePossible: 동속일 수도 있음 (그러면 무작위)
  //   random: 선제공격손톱(상대 도구 미확정이면 가능)·퀵드로로 순서가 바뀔 수 있음
  //   선공하수(sableye 등)는 다루지 않음 → null
  const speedOrder = (mi: number, oi: number, megaMine?: boolean, megaOpp?: boolean) => {
    const s = state.value!
    const se = speedEnvOf(oi, megaOpp)
    const r = resolveAt('opp', oi, megaOpp)
    const mr = resolveAt('mine', mi, megaMine)
    if (!se || !r || !mr) return null
    const om = mon('opp', oi)
    const abilities =
      r.isMega || r.transformedFrom || om.abilityKnown
        ? [r.ability]
        : [...new Set(r.base.abilities)]
    if (abilities.includes('stall') || mr.ability === 'stall') return null
    // 관찰이 한 번도 없으면 스피드 하락 성격도 가능하다고 본다
    const span = oppSpeedSpan(
      se.base,
      speedRangesOf(oi, false),
      se.env,
      abilities,
      !om.speedSp && se.env.fixedStat == null,
    )
    if (!span) return null
    const my = speedOf('mine', mi, megaMine)
    const c = compareSpeed(my, span)
    const tr = !!s.rooms.trickroom
    const first =
      c.faster === 'mine' || c.faster === 'opp'
        ? (c.faster === 'mine') !== tr
          ? ('mine' as const)
          : ('opp' as const)
        : c.faster
    const itemsOn = !s.rooms.magicroom
    const mm = mon('mine', mi)
    // 선제공격손톱·퀵드로는 가진 쪽을 먼저 움직이게만 함 → 순서가 정해졌으면 나중에 움직일 쪽만 본다
    const oppCan =
      (itemsOn &&
        ((!om.itemKnown && !om.itemGone) || (oppItemOf(oi) === 'quickclaw' && !om.itemGone))) ||
      abilities.includes('quickdraw')
    const mineCan =
      (itemsOn && slotsOf('mine')[mi]?.item === 'quickclaw' && !mm.itemGone) ||
      mr.ability === 'quickdraw'
    const random = first === 'mine' ? oppCan : first === 'opp' ? mineCan : oppCan || mineCan
    return { first, tiePossible: c.tiePossible, random, mySpeed: my, span }
  }

  // 더블: 이번 턴 이 행동보다 먼저 같은 상대 칸(k)을 때리는 같은 편 행동의 데미지 합 (대타가 받은 건 제외)
  const earlierDamage = (side: BattleSide, slot: number, k: number) => {
    const order = turnOrder()
    const me = order.findIndex((e) => e.side === side && e.slot === slot)
    const foe = foeOf(side)
    const ti = state.value!.sides[foe].active[k]
    if (me < 0 || ti == null) return 0
    let sum = 0
    for (const e of order.slice(0, me)) {
      if (e.side !== side) continue
      const a = state.value!.actions[side][e.slot]!
      if (a.kind !== 'move' || a.missed) continue
      if (behindSub(side, e.idx, foe, ti, a.move)) continue
      if (a.target === k) sum += a.amount || 0
      else if (isSpreadMove(gd.move(a.move))) sum += a.amount2 || 0
    }
    return sum
  }

  // side 의 slot 행동이 이번 턴 기술 순서상 foe 의 tIdx 보다 먼저인가 (풀죽음은 아직 행동하지 않은 상대에게만)
  const actsBefore = (side: BattleSide, slot: number, foe: BattleSide, tIdx: number) => {
    const order = turnOrder()
    const me = order.findIndex((e) => e.side === side && e.slot === slot)
    const them = order.findIndex((e) => e.side === foe && e.idx === tIdx)
    return me >= 0 && them > me
  }

  return {
    speedOf,
    movePriority,
    turnMega,
    turnOrder,
    hitTarget,
    actionOpts,
    formAtHit,
    turnStateBefore,
    withTurnState,
    fieldWithTurnState,
    speedEnvOf,
    pendingSpeedObservation,
    speedRangesOf,
    speedOrder,
    earlierDamage,
    actsBefore,
  }
}

export type BattleOrder = ReturnType<typeof createOrder>
