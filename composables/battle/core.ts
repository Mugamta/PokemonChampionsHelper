// composables/battle/core.ts
// 배틀 상태 읽기 (useBattle 의 맨 아래 층): 로스터 → 슬롯, 상대 도구·특성·배분 규칙, 실능치(resolveAt), 필드·전투 정보,
// 상태이상 면역, 대타·소란 등 다른 층이 공통으로 쓰는 조회. 상태를 바꾸는 함수는 두지 않는다 (pushHistory 제외).

import { useEntry, type BattleMode } from '~/composables/useEntry'
import { useTeamCalc, type ResolvedSlot } from '~/composables/useTeamCalc'
import { useOppEstimate, type OppBounds } from '~/composables/useOppEstimate'
import { isGrounded, type Combatant, type DamageOptions, type FieldState } from '~/utils/damage'
import { hpOfPct } from '~/utils/hpDisplay'
import type { SpeedRanges } from '~/utils/speedInference'
import type { Range } from '~/utils/statInference'
import type { StatTable, Status } from '~/utils/types'
import {
  HITS_ALLY_TARGET,
  MAX_HISTORY,
  NO_SP,
  NO_TRANSFORM,
  STATUS_ABILITY_IMMUNE,
  STATUS_TYPE_IMMUNE,
  type BattleSide,
  type BattleState,
  type MonState,
} from '~/utils/battleState'

// 위 층(order)에 있는 함수 — useBattle 이 조립한 뒤 채운다 (배분 추정이 상대 스피드 구간을 씀)
export interface CoreHooks {
  speedRangesOf: (oi: number, withPending?: boolean) => SpeedRanges
}

export function createCore(mode: BattleMode, hooks: CoreHooks) {
  const N = mode === 'single' ? 1 : 2
  const gd = useGameData()
  const calc = useTeamCalc()
  const mineTeam = useTeam('mine')
  const oppTeam = useTeam('opp')
  const entry = useEntry(mode)
  const state = useState<BattleState | null>(`battle-${mode}`, () => null)

  // 로스터 → 파티 슬롯
  const mineSlots = computed(() => entry.picks.value.map((i) => mineTeam.slots.value[i]!))
  const oppSlots = computed(() => oppTeam.slots.value)
  const signature = computed(() =>
    JSON.stringify([
      entry.picks.value,
      mineSlots.value.map((s) => s.species + s.item),
      oppSlots.value.map((s) => s.species),
    ]),
  )

  const slotsOf = (side: BattleSide) => (side === 'mine' ? mineSlots.value : oppSlots.value)

  // ── 상대 도구 ─────────────
  // 배틀 계산에 쓰는 상대 도구는 "상대 도구 확정"으로 확정한 것만 (메가스톤은 메가진화 판정에 필요하므로 그대로).
  // 선출 화면의 도구(자동 배치·통계·직접 입력)는 추측 → guessedItem 으로 범위 안내(데미지 칸 "추측 도구면", 선후공)에만 쓰고
  // 소모·턴 끝 회복·날씨 연장 같은 확정 처리에는 쓰지 않는다
  const isMegaStone = (id: string) => !!id && !!gd.data.value?.items[id]?.megaStone
  const oppItemOf = (idx: number) => {
    const m = state.value?.sides.opp.mons[idx]
    const entered = oppSlots.value[idx]?.item || ''
    if (m?.itemKnown) return m.item ?? entered // 예전 저장분은 파티에 확정 도구가 들어가 있음
    return isMegaStone(entered) ? entered : ''
  }
  // 확정 전 상대 도구의 추측 (없거나 확정했거나 메가스톤이면 '')
  const guessedItem = (idx: number) => {
    const m = state.value?.sides.opp.mons[idx]
    const entered = oppSlots.value[idx]?.item || ''
    return !m || m.itemKnown || isMegaStone(entered) ? '' : entered
  }
  // 확정한 상대 특성 (없으면 '' → 선출 화면의 특성을 추측으로 씀)
  const oppAbilityOf = (idx: number) => {
    const m = state.value?.sides.opp.mons[idx]
    return m?.abilityKnown ? m.ability || '' : ''
  }
  // 배틀 계산에 쓰는 슬롯 (상대는 도구·특성을 위 규칙으로 바꾸고, 성격·능력 포인트는 기준값으로 비운 사본)
  const battleSlot = (side: BattleSide, idx: number) => {
    const slot = slotsOf(side)[idx]
    if (side === 'mine' || !slot) return slot
    const item = oppItemOf(idx)
    const ability = oppAbilityOf(idx) || slot.ability
    return { ...slot, item, ability, nature: '', sp: { ...NO_SP } }
  }

  // ── 상대 배분 ─────────────
  // 상대의 성격·능력 포인트는 모른다. 선출 화면의 값(자동 배치·통계·직접 입력)은 추측이라 배틀에는 쓰지 않고,
  // 주고받은 데미지·선후공 관찰로 좁힌 범위(useOppEstimate bounds)만 쓴다. 관측이 없으면 SP 0 하락 성격 ~ SP 32 보정 성격
  //   - 데미지 표·예상 흐름: 범위의 양 끝으로 계산한 데미지 범위 (combatantRange)
  //   - 값 하나가 필요한 곳 (HP % ↔ 실수치, 바디프레스·속임수, 실능치 비교 특성 등): 범위의 가운데 (resolveAt)
  //   - 선후공: 스피드 범위로 정해지지 않으면 모름 (화면에서 본 순서를 입력받는다)
  const estimator = useOppEstimate({
    state,
    resolveSnapshot: (side, idx, snap) => resolveSnapshot(side, idx, snap),
    oppSlots,
    oppItemOf: (idx) => oppItemOf(idx),
    speedRangesOf: (oi, withPending) => hooks.speedRangesOf(oi, withPending),
  })
  // 범위를 계산하는 중인 상대 (그 계산 안에서는 기준값 실능치를 쓴다 — 변신 등으로 자기 자신을 다시 부르지 않게)
  const boundsBusy = new Set<number>()
  // 상대 oi 의 실능치 범위 (base = 그때 폼의 종족값)
  const oppBounds = (oi: number, base: StatTable): OppBounds | null => {
    if (boundsBusy.has(oi)) return null
    boundsBusy.add(oi)
    try {
      return estimator.bounds(oi, base)
    } finally {
      boundsBusy.delete(oi)
    }
  }
  // 지금 폼의 상대 실능치 범위 (변신 중이면 복사한 실능치라 null)
  const oppBoundsNow = (oi: number) => {
    const r = resolveAt('opp', oi)
    return r && !r.transformedFrom ? oppBounds(oi, r.species.stats) : null
  }
  const mid = (x: Range) => Math.round((x.min + x.max) / 2)
  // 상대의 실능치를 범위의 가운데로 (변신 중이면 복사한 실능치 그대로, HP 만 자기 것)
  const withOppStats = (oi: number, r: ResolvedSlot | null): ResolvedSlot | null => {
    if (!r) return r
    const self = r.transformedFrom ? resolveSnapshot('opp', oi, NO_TRANSFORM) : r
    const bd = self && oppBounds(oi, self.species.stats)
    if (!bd) return r
    const hp = mid(bd.hp)
    if (r.transformedFrom) return { ...r, stats: { ...r.stats, hp } }
    const stats = { hp, atk: mid(bd.atk), def: mid(bd.def), spa: mid(bd.spa), spd: mid(bd.spd) }
    return { ...r, stats: { ...stats, spe: mid(bd.spe) } }
  }

  // altOverride: 배틀 폼을 지정 (예: 이번 턴 먼저 공격해 블레이드폼이 된 킬가르도가 맞는 경우)
  const resolveAt = (
    side: BattleSide,
    idx: number | null,
    megaOverride?: boolean,
    altOverride?: boolean,
  ): ResolvedSlot | null => {
    if (idx == null || !state.value) return null
    const mon = state.value.sides[side].mons[idx]
    if (!mon) return null
    const snap = {
      megaOn: megaOverride ?? mon.megaOn,
      alt: altOverride ?? mon.alt,
      transform:
        mon.transform && altOverride != null
          ? { ...mon.transform, alt: altOverride }
          : mon.transform,
    }
    const r = resolveSnapshot(side, idx, snap)
    if (side === 'opp') return withOppStats(idx, r)
    // 내 메타몽이 상대로 변신: 복사하는 실능치도 상대 범위의 가운데
    const tf = snap.transform
    if (r && tf?.side === 'opp') {
      const target = withOppStats(
        tf.idx,
        resolveSnapshot('opp', tf.idx, { megaOn: tf.megaOn, alt: tf.alt }),
      )
      if (target) return { ...r, stats: { ...target.stats, hp: r.stats.hp } }
    }
    return r
  }
  // 저장해 둔 상태(관측 시점 등)로 풀기. 변신 중이면 복사 대상(그때의 메가/폼) 기준, HP·도구는 자기 것.
  // 상대 실능치는 기준값(SP 0·무보정) 그대로 — 배분 추정이 이걸 쓰고, 배틀 계산은 resolveAt 이 범위로 바꾼다
  const resolveSnapshot = (
    side: BattleSide,
    idx: number,
    snap: { megaOn: boolean; alt: boolean; transform?: MonState['transform'] },
  ): ResolvedSlot | null => {
    const tf = snap.transform
    if (tf) {
      const self = calc.resolve(battleSlot(side, idx), false, false)
      const target = calc.resolve(battleSlot(tf.side, tf.idx), tf.megaOn, tf.alt)
      if (self && target) return calc.transformed(self, target)
    }
    return calc.resolve(battleSlot(side, idx), snap.megaOn, snap.alt)
  }
  // 메타몽 자신의 특성 (변신 전 원래 특성: 괴짜 판정용)
  const ownAbility = (side: BattleSide, idx: number) =>
    calc.resolve(battleSlot(side, idx), false, false)?.ability || ''
  const maxHp = (side: BattleSide, idx: number) => resolveAt(side, idx)?.stats.hp || 0

  const isFainted = (side: BattleSide, idx: number) =>
    (state.value?.sides[side].mons[idx]?.hp ?? 1) <= 0

  // 첫 턴 실행 전 (선두 포켓몬을 고르는 단계)
  const isLeadPhase = () => state.value!.turn === 1 && !state.value!.history.length
  const foeOf = (side: BattleSide): BattleSide => (side === 'mine' ? 'opp' : 'mine')

  const mon = (side: BattleSide, idx: number) => state.value!.sides[side].mons[idx]!
  // 대타 HP = 최대 HP 1/4 (mine: 실수치, opp: %)
  const quarterHp = (side: BattleSide, idx: number) =>
    side === 'mine' ? Math.floor(maxHp(side, idx) / 4) : 25
  // 대타에 막히는가: 대상에게 대타가 있고, 자기 자신이 아니고, 대타를 무시하는 기술(소리 기술 등)·틈새포착이 아님
  const behindSub = (
    side: BattleSide,
    userIdx: number,
    tSide: BattleSide,
    tIdx: number,
    moveId: string,
  ) =>
    !!mon(tSide, tIdx).volatiles.substitute &&
    !(tSide === side && tIdx === userIdx) &&
    !gd.move(moveId)?.flags.includes('bypasssub') &&
    resolveAt(side, userIdx)?.ability !== 'infiltrator'
  // 필드에 소란 중인 포켓몬이 있는가 (그동안 잠들지 않음)
  const uproarOn = () =>
    (['mine', 'opp'] as const).some((sd) =>
      state.value!.sides[sd].active.some(
        (i) => i != null && !isFainted(sd, i) && !!mon(sd, i).volatiles.uproar,
      ),
    )
  // 메가진화는 배틀에 한 번 (진영당): 한 마리가 메가진화하면 다른 포켓몬은 메가진화할 수 없다
  const sideMegaUsed = (side: BattleSide) => state.value!.sides[side].mons.some((m) => m.megaUsed)
  const canMegaEvolve = (side: BattleSide, idx: number) =>
    !mon(side, idx).megaUsed && !sideMegaUsed(side) && !!resolveAt(side, idx, true)?.isMega

  // 실제 HP 로 (상대는 % → 추정 최대 HP 기준)
  const realHp = (side: BattleSide, idx: number, units: number) =>
    side === 'mine' ? units : Math.round((units / 100) * maxHp(side, idx))
  // 효과를 내는 지닌 도구 (도구 잃음·매직룸·서투름이면 없음, 상대는 확정 도구만 — battleSlot)
  const heldItem = (side: BattleSide, idx: number) => {
    const r = resolveAt(side, idx)
    if (!r || mon(side, idx).itemGone || state.value!.rooms.magicroom || r.ability === 'klutz')
      return ''
    return r.slot.item
  }

  // 상태이상에 걸릴 수 없는가 (이미 상태이상 / 타입·특성 면역 / 신비의부적 / 미스트필드, 잠듦은 일렉트릭필드도 — 땅에 있을 때)
  function statusBlocked(side: BattleSide, idx: number, st: Exclude<Status, ''>) {
    const m = mon(side, idx)
    const r = resolveAt(side, idx)
    if (!r || m.status || m.hp <= 0) return true
    if (STATUS_TYPE_IMMUNE[st]?.some((t) => r.species.types.includes(t as never))) return true
    if ([...(STATUS_ABILITY_IMMUNE[st] ?? []), 'comatose', 'purifyingsalt'].includes(r.ability))
      return true
    const wk = state.value!.weather.key
    if (r.ability === 'leafguard' && (wk === 'sun' || wk === 'harshsun')) return true
    // 자신·아군의 특성: 스위트베일(잠듦) / 플라워베일(풀 타입)
    const teamAbilities = state
      .value!.sides[side].active.filter((i): i is number => i != null && !isFainted(side, i))
      .map((i) => resolveAt(side, i)?.ability)
    if (st === 'slp' && teamAbilities.includes('sweetveil')) return true
    if (st === 'slp' && r.ability !== 'soundproof' && uproarOn()) return true
    if (r.species.types.includes('grass' as never) && teamAbilities.includes('flowerveil'))
      return true
    if (state.value!.sides[side].screens.safeguard) return true
    const c = combatantOf(side, idx)
    const terrain = state.value!.terrain.key
    const grounded = !!c && isGrounded(c, fieldFor(side, idx))
    if (grounded && (terrain === 'misty' || (terrain === 'electric' && st === 'slp'))) return true
    return false
  }

  // 변화기 (데미지 입력이 없는 기술)
  const isStatusMove = (moveId: string) => gd.move(moveId)?.category === 'status'

  // 되돌리기용 스냅샷 (history 제외). 턴 적용·쓰러진 뒤 교체 직전에 쌓는다
  const snapshot = () => {
    const { history, ...rest } = state.value!
    return JSON.stringify(rest)
  }
  const pushHistory = () => {
    const s = state.value!
    s.history.push(snapshot())
    if (s.history.length > MAX_HISTORY) s.history.shift()
  }

  // ── 계산용 헬퍼 ─────────────
  // defIdx: 맞는 포켓몬 (더블에서 그 아군의 프렌드가드 판정용)
  const fieldFor = (defSide: BattleSide, defIdx?: number | null): FieldState => {
    const s = state.value!
    const scr = s.sides[defSide].screens
    const friendGuard =
      N > 1 &&
      defIdx != null &&
      s.sides[defSide].active.some(
        (i) =>
          i != null &&
          i !== defIdx &&
          !isFainted(defSide, i) &&
          resolveAt(defSide, i)?.ability === 'friendguard',
      )
    return {
      friendGuard,
      weather: s.weather.key,
      terrain: s.terrain.key,
      doubles: N > 1,
      gravity: !!s.rooms.gravity,
      wonderRoom: !!s.rooms.wonderroom,
      magicRoom: !!s.rooms.magicroom,
      reflect: !!scr.reflect,
      lightScreen: !!scr.lightscreen,
      auroraVeil: !!scr.auroraveil,
    }
  }
  // 같은 편 다른 칸의 포켓몬 (더블). 없거나 쓰러졌으면 null
  const allyOf = (side: BattleSide, slot: number): number | null => {
    if (N < 2) return null
    const i = state.value!.sides[side].active[1 - slot]
    return i != null && !isFainted(side, i) ? i : null
  }
  const hitsAlly = (moveId: string) => {
    const mv = gd.move(moveId)
    return !!mv && mv.category !== 'status' && mv.target === HITS_ALLY_TARGET
  }
  // 상대(쓰러진 것은 확인된 포켓몬만) 포함 같은 편에서 쓰러진 수 — 총대장
  const faintedCount = (side: BattleSide) =>
    state.value!.sides[side].mons.filter(
      (m, i) => m.hp <= 0 && (side === 'mine' || state.value!.sides.opp.revealed.includes(i)),
    ).length
  // 이 포켓몬이 moveId 를 쓸 때 배틀 상태에서 정해지는 보정 (도우미 / 총대장 / 메트로놈 / 충전)
  const attackOpts = (side: BattleSide, idx: number, moveId: string): DamageOptions => {
    const m = mon(side, idx)
    return {
      helpingHand: helpingHandFor(side, idx),
      faintedAllies: faintedCount(side),
      metronomeCount: m.lastMove === moveId ? m.moveStreak + 1 : 0,
      charged: !!m.volatiles.charge,
      timesHit: m.timesHit || 0,
      lastMoveFailed: !!m.lastFailed,
      stockpile: m.volatiles.stockpile || 0,
      focusEnergy: !!m.volatiles.focusenergy,
      // 집단구타: 같은 편 중 쓰러지지 않고 상태이상이 없는 포켓몬(자신 포함)의 공격 종족값
      beatUp: state.value!.sides[side].mons.flatMap((x, i) =>
        x.hp > 0 && (!x.status || i === idx) ? [resolveAt(side, i)?.species.stats.atk ?? 0] : [],
      ),
    }
  }
  // 같은 편 다른 칸이 이번 턴 도우미를 쓰면 (도우미는 우선도 +5 라서 항상 먼저) 위력 1.5배
  const helpingHandFor = (side: BattleSide, idx: number) => {
    if (N < 2) return false
    const sd = state.value!.sides[side]
    return state.value!.actions[side].some((a, slot) => {
      const user = sd.active[slot]
      return (
        user != null &&
        user !== idx &&
        !isFainted(side, user) &&
        a.kind === 'move' &&
        a.move === 'helpinghand'
      )
    })
  }
  // 필드에 살아있는 상대가 2마리 이상이면 광역기 0.75배
  const spreadActive = (defSide: BattleSide) =>
    N > 1 &&
    state.value!.sides[defSide].active.filter((i) => i != null && !isFainted(defSide, i)).length > 1

  // attacking: 공격하는 쪽으로 계산 (킬가르도는 공격 순간 블레이드폼)
  // altOverride: 맞는 시점의 배틀 폼 (formAtHit)
  const combatantOf = (
    side: BattleSide,
    idx: number,
    megaOverride?: boolean,
    attacking = false,
    altOverride?: boolean,
  ) => {
    const resolved = resolveAt(side, idx, megaOverride, altOverride)
    if (!resolved) return null
    // 공격할 때 폼이 바뀌면(킬가르도 블레이드폼) 그 폼의 상대 실능치도 범위로 다시
    const formed = attacking ? calc.attackForm(resolved) : resolved
    const r = side === 'opp' && formed !== resolved ? withOppStats(idx, formed)! : formed
    const m = mon(side, idx)
    const active = state.value!.sides[side].active.includes(idx)
    const hp = side === 'mine' ? m.hp : hpOfPct(m.hp, r.stats.hp)
    return {
      ...calc.combatant(r, {
        status: m.status,
        boosts: active ? m.boosts : undefined,
        hp,
        item: m.itemGone ? '' : undefined,
      }),
      floating: active && !!m.volatiles.magnetrise,
      // 대타 HP (실수치): 상대는 % 를 그 포켓몬 최대 HP 기준으로
      sub:
        active && m.volatiles.substitute
          ? side === 'mine'
            ? m.volatiles.substitute
            : Math.floor((r.stats.hp * m.volatiles.substitute) / 100)
          : undefined,
    }
  }
  // 상대 배분 범위의 양 끝으로 바꾼 전투 정보 [약한 쪽, 강한 쪽] (내 쪽·변신한 상대·범위가 없으면 하나).
  //   defStat 지정(맞는 쪽): 관측과 맞는 조합 중 내구 H×B(D) 가 가장 작은 / 큰 것
  //   아니면(공격하는 쪽): 공격·특공·방어(바디프레스) 가장 낮은 / 높은 값
  const combatantRange = (
    side: BattleSide,
    idx: number,
    megaOverride?: boolean,
    attacking = false,
    altOverride?: boolean,
    defStat?: 'def' | 'spd',
  ): Combatant[] => {
    const one = combatantOf(side, idx, megaOverride, attacking, altOverride)
    if (!one) return []
    const m = mon(side, idx)
    if (side === 'mine' || m.transform) return [one]
    const bd = oppBounds(idx, one.species.stats)
    if (!bd) return [one]
    const make = (stats: StatTable) => ({
      ...one,
      stats,
      hp: hpOfPct(m.hp, stats.hp),
      sub: one.sub != null ? Math.floor((stats.hp * m.volatiles.substitute!) / 100) : undefined,
    })
    if (defStat) {
      const at = (p: { hp: number; stat: number }) =>
        make({ ...one.stats, hp: p.hp, [defStat]: p.stat })
      return [at(bd.frail[defStat]), at(bd.tank[defStat])]
    }
    return [
      make({ ...one.stats, atk: bd.atk.min, spa: bd.spa.min, def: bd.def.min }),
      make({ ...one.stats, atk: bd.atk.max, spa: bd.spa.max, def: bd.def.max }),
    ]
  }

  // ── 성별 (헤롱헤롱) ─────────────
  // 'M' | 'F' | 'N'(무성) | ''(모름). 성별이 정해진 종은 데이터, 아니면 슬롯에서 고른 값
  const genderOf = (side: BattleSide, idx: number) => {
    const slot = slotsOf(side)[idx]
    return gd.pokemon(slot?.species)?.gender ?? slot?.gender ?? ''
  }
  // 헤롱헤롱이 걸리는가: 'yes' 서로 다른 성별 / 'no' 같은 성별·무성 / 'maybe' 한쪽이라도 모름
  const attractable = (aSide: BattleSide, aIdx: number, tSide: BattleSide, tIdx: number) => {
    const a = genderOf(aSide, aIdx)
    const t = genderOf(tSide, tIdx)
    if (a === 'N' || t === 'N') return 'no'
    if (!a || !t) return 'maybe'
    return a !== t ? 'yes' : 'no'
  }

  return {
    N,
    gd,
    calc,
    state,
    mineSlots,
    oppSlots,
    signature,
    slotsOf,
    isMegaStone,
    oppItemOf,
    guessedItem,
    oppAbilityOf,
    battleSlot,
    estimator,
    oppBounds,
    oppBoundsNow,
    withOppStats,
    resolveAt,
    resolveSnapshot,
    ownAbility,
    maxHp,
    isFainted,
    isLeadPhase,
    foeOf,
    mon,
    quarterHp,
    behindSub,
    uproarOn,
    sideMegaUsed,
    canMegaEvolve,
    realHp,
    heldItem,
    statusBlocked,
    isStatusMove,
    snapshot,
    pushHistory,
    fieldFor,
    allyOf,
    hitsAlly,
    faintedCount,
    attackOpts,
    helpingHandFor,
    spreadActive,
    combatantOf,
    combatantRange,
    genderOf,
    attractable,
  }
}

export type BattleCore = ReturnType<typeof createCore>
