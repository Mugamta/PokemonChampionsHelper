// composables/battle/queries.ts
// 화면·턴 처리가 묻는 것 (상태를 바꾸지 않음): 교체할 수 있는 포켓몬·쓰러진 뒤 교체·배틀 결과, 흡수 후 HP 입력,
// 잠듦·앙코르·PP, 입력 검증, 이번 턴 확률 효과 선택지, 혼란 자해 범위, 교체 가능 여부.

import { confusionDamage } from '~/utils/damage'
import type { MoveEffect, Status } from '~/utils/types'
import {
  boostKey,
  CANT_DAMAGE_REASONS,
  CONTACT_STATUS_ABILITY,
  FORCE_MOVES,
  PIVOT_MOVES,
  RANDOM_STATUS_MOVES,
  SLEEP_MOVES,
  STATUSES,
  TRANSFORM_PP,
  TRAP_VOLATILES,
  VOLATILE_DURATION,
  WAKE_CHANCE,
  type ActionState,
  type BattleSide,
} from '~/utils/battleState'
import type { BattleCore } from '~/composables/battle/core'
import type { BattleOrder } from '~/composables/battle/order'

export function createQueries(b: BattleCore & BattleOrder) {
  const {
    N,
    gd,
    state,
    oppSlots,
    mon,
    resolveAt,
    maxHp,
    isFainted,
    foeOf,
    guessedItem,
    isStatusMove,
    allyOf,
    behindSub,
    statusBlocked,
    combatantOf,
    fieldFor,
    attractable,
    turnOrder,
    hitTarget,
    actsBefore,
  } = b

  // 교체로 나올 수 있는 포켓몬 (필드에 없고 쓰러지지 않은). 상대는 아직 안 나온 파티 포함
  const benchOf = (side: BattleSide) => {
    const s = state.value!
    return s.sides[side].mons
      .map((_, i) => i)
      .filter(
        (i) =>
          !s.sides[side].active.includes(i) &&
          !isFainted(side, i) &&
          (side === 'mine' || !!oppSlots.value[i]?.species),
      )
  }

  // ── 쓰러진 뒤 교체 ─────────────
  // 교체할 수 있는 포켓몬: 내 쪽 = 남은 선출, 상대 = 공개된 포켓몬 + (공개 수가 선출 수보다 적으면) 아직 안 나온 파티
  const replaceOptions = (side: BattleSide) => {
    const s = state.value!
    if (side === 'mine') return benchOf('mine')
    const sd = s.sides.opp
    const pick = N === 1 ? 3 : 4
    return benchOf('opp').filter((i) => sd.revealed.includes(i) || sd.revealed.length < pick)
  }
  // 쓰러진 칸 (교체할 포켓몬이 있고, 예전 방식대로 교체 행동을 넣지 않은 칸)
  const pendingReplace = computed(() => {
    const s = state.value
    if (!s) return []
    const out: { side: BattleSide; slot: number }[] = []
    for (const side of ['mine', 'opp'] as const) {
      const opts = replaceOptions(side)
      s.sides[side].active.forEach((i, slot) => {
        const a = s.actions[side][slot]
        if (i == null || !isFainted(side, i) || !opts.length) return
        if (a?.kind === 'switch' && a.switchTo != null) return
        out.push({ side, slot })
      })
    }
    return out
  })

  // ── 배틀 결과 ─────────────
  // 한쪽 필드가 전부 쓰러졌고(비었고) 내보낼 포켓몬도 없으면 그쪽이 짐. 둘 다면 무승부. 진행 중이면 null
  // (상대는 공개 수가 선출 수보다 적으면 아직 안 나온 포켓몬이 있다고 봄 → replaceOptions)
  const battleResult = computed<'win' | 'lose' | 'draw' | null>(() => {
    const s = state.value
    if (!s) return null
    const out = (side: BattleSide) =>
      s.sides[side].active.every((i) => i == null || isFainted(side, i)) &&
      s.sides[side].active.some((i) => i != null) &&
      !replaceOptions(side).length
    const mine = out('mine')
    const opp = out('opp')
    return mine && opp ? 'draw' : mine ? 'lose' : opp ? 'win' : null
  })

  // 내 흡수기의 회복량을 보고 입력할 수 있는지: 흡수기 + HP 가 덜 참 + 회복봉인·해감액 아님
  const drainSeen = (ui: number, ti: number, moveId: string) => {
    const m = mon('mine', ui)
    return (
      !!gd.move(moveId)?.effects.some((e) => e.type === 'drain') &&
      m.hp > 0 &&
      m.hp < maxHp('mine', ui) &&
      !m.volatiles.healblock &&
      resolveAt('opp', ti)?.ability !== 'liquidooze'
    )
  }
  // 행동 칸에 흡수 후 HP 입력을 보여 줄지 (맞는 상대 = 교체로 들어오는 포켓몬 포함)
  const drainObservable = (slot: number) => {
    const s = state.value!
    const a = s.actions.mine[slot]
    const ui = s.sides.mine.active[slot]
    if (a?.kind !== 'move' || ui == null || a.missed) return false
    const ti = hitTarget('mine', slot, turnOrder()).idx
    return ti != null && drainSeen(ui, ti, a.move)
  }
  // 실행 중 (맞기 직전 상태): 입력한 흡수 후 HP, 쓸 수 없으면 null
  const drainAfterOf = (side: BattleSide, ui: number, ti: number, a: ActionState) =>
    side === 'mine' && typeof a.drainAfter === 'number' && drainSeen(ui, ti, a.move)
      ? a.drainAfter
      : null

  // 잠듦·얼음: 다음에 행동하려 할 때 풀릴 확률 (%). 잠듦·얼음이 아니면 null
  const wakeChance = (side: BattleSide, idx: number): number | null => {
    const m = mon(side, idx)
    if (m.status !== 'slp' && m.status !== 'frz') return null
    const table = m.status === 'slp' && m.restSleep ? WAKE_CHANCE.rest : WAKE_CHANCE[m.status]
    return table[m.toxicTurn] ?? 100
  }
  // 앙코르 중이면 쓸 수 있는 기술 (마지막으로 쓴 기술을 모르면 고정하지 않음 → '')
  const encoreMove = (side: BattleSide, idx: number) => {
    const m = mon(side, idx)
    return m.volatiles.encore && m.lastMove ? m.lastMove : ''
  }
  // 앙코르가 남은 턴 (이번 턴 포함)
  const encoreTurnsLeft = (side: BattleSide, idx: number) => {
    const v = mon(side, idx).volatiles.encore
    return v ? Math.max(1, VOLATILE_DURATION.encore! - v + 1) : 0
  }
  // ── PP ─────────────
  // 기술의 최대 PP (변신 중이면 복사한 기술이라 5) / 쓴 PP 기록 (변신 중이면 따로)
  const maxPp = (side: BattleSide, idx: number, moveId: string) =>
    mon(side, idx).transform ? TRANSFORM_PP : (gd.move(moveId)?.pp ?? 0)
  const ppUsedOf = (side: BattleSide, idx: number) => {
    const m = mon(side, idx)
    return (m.transform ? m.tfPpUsed : m.ppUsed) ?? {}
  }
  // 잠듦인데 이번 시도에 풀릴 확률이 0% (잠든 뒤 첫 시도, 잠자기는 2번째까지) → 잠꼬대·코골기 외 기술은 나가지 않는다
  const sleepsThrough = (side: BattleSide, idx: number, moveId: string) =>
    !!moveId &&
    mon(side, idx).status === 'slp' &&
    !SLEEP_MOVES.has(moveId) &&
    wakeChance(side, idx) === 0

  // ── 입력 검증 ─────────────
  const validationError = computed(() => {
    const s = state.value
    if (!s) return ''
    let err = ''
    if (battleResult.value) return 'battleOver'
    if (pendingReplace.value.length) return 'errReplace'
    // 깨어나지 못하는 시도는 입력이 쓰이지 않으므로 검사하지 않음
    const skipped = (side: BattleSide, slot: number) => {
      const ui = s.sides[side].active[slot]
      const act = s.actions[side][slot]!
      return ui != null && sleepsThrough(side, ui, act.via || act.move)
    }
    for (const [slot, a] of s.actions.mine.entries()) {
      if (a.kind !== 'move' || isStatusMove(a.move) || skipped('mine', slot)) continue
      for (const v of [a.amount, a.amount2]) if (v != null && (v < 0 || v > 100)) return 'errDealt'
    }
    const order = turnOrder()
    for (const [slot, a] of s.actions.opp.entries()) {
      if (a.kind !== 'move' || isStatusMove(a.move) || skipped('opp', slot)) continue
      const check = (v: number | null, k: number) => {
        if (v == null) return false
        // 맞는 포켓몬 (먼저 교체기로 물러난 칸이면 들어오는 포켓몬)
        const target = hitTarget('opp', slot, order, k).idx
        const max = target != null ? maxHp('mine', target) : 0
        return v < 0 || (!!max && v > max)
      }
      if (check(a.amount, a.target) || check(a.amount2, 1 - a.target)) return 'errTaken'
    }
    // 행동 불가(혼란 자해·기타)로 잃은 HP: mine 실수치 ≤ 최대 HP, opp % ≤ 100
    for (const side of ['mine', 'opp'] as const)
      s.actions[side].forEach((a, slot) => {
        const ui = s.sides[side].active[slot]
        if (a.kind !== 'cant' || a.amount == null || ui == null) return
        if (!CANT_DAMAGE_REASONS.has(a.cantReason)) return
        const max = side === 'mine' ? maxHp('mine', ui) : 100
        if (a.amount < 0 || (!!max && a.amount > max)) err ||= 'errSelf'
      })
    for (const side of ['mine', 'opp'] as const) {
      s.actions[side].forEach((a, slot) => {
        if (a.kind !== 'move' || a.allyAmount == null) return
        const ally = allyOf(side, slot)
        const max = side === 'mine' && ally != null ? maxHp('mine', ally) : 100
        if (a.allyAmount < 0 || a.allyAmount > max) err ||= 'errAlly'
      })
    }
    return err
  })

  // side 의 slot 기술로 상대 tIdx 에게 확률로 생길 수 있는 효과 (걸릴 수 있는 것만):
  //   기술 부가효과(확률 < 100) / 트라이어택·비몽사몽 / 왕의징표석·악취(풀죽음 10%, 풀죽음 확률이 있는 기술과는 중첩 안 됨)
  //   / 독수(접촉 30% 독) / 사슬독(30% 맹독). 인분·대타면 없음, 우격다짐이면 기술 부가효과 없음
  //   / 이미 걸렸거나 면역인 상태이상·혼란은 제외, 풀죽음은 상대가 이번 턴 아직 행동하지 않았을 때만 (정신력 제외)
  const possibleInflicts = (side: BattleSide, slot: number, tIdx: number | null): string[] => {
    const s = state.value!
    const a = s.actions[side][slot]
    const ui = s.sides[side].active[slot]
    const foe = foeOf(side)
    if (!a || a.kind !== 'move' || !a.move || ui == null || tIdx == null) return []
    const move = gd.move(a.move)
    const user = resolveAt(side, ui)
    const target = resolveAt(foe, tIdx)
    if (!move || !user || !target || isFainted(foe, tIdx)) return []
    // 헤롱헤롱(기술): 성별을 몰라 자동으로 걸지 못할 때만 체크로 (같은 성별·무성·둔감·이미 걸림이면 없음)
    if (move.category === 'status')
      return a.move === 'attract' &&
        target.ability !== 'oblivious' &&
        !mon(foe, tIdx).volatiles.attract &&
        attractable(side, ui, foe, tIdx) === 'maybe'
        ? ['attract']
        : []
    const sheer = user.ability === 'sheerforce'
    // 랭크 변화 확률 효과 (100% 미만, 우격다짐이면 없음): 자기 쪽(원석의힘·코멧펀치 등)은 주 대상 칸에만,
    // 상대 쪽(섀도볼 특방 −1 등)은 인분·대타면 없음
    const chanceBoosts = sheer
      ? []
      : (move.effects as MoveEffect[]).filter(
          (e): e is Extract<MoveEffect, { type: 'boost' }> =>
            e.type === 'boost' && !!e.chance && e.chance < 100,
        )
    const main = hitTarget(side, slot, turnOrder(), a.target).idx === tIdx
    const selfKeys = main
      ? chanceBoosts.filter((e) => e.target === 'self').map((e) => boostKey('self', e.stats))
      : []
    if (target.ability === 'shielddust' || behindSub(side, ui, foe, tIdx, a.move)) return selfKeys
    const targetKeys = chanceBoosts
      .filter((e) => e.target !== 'self')
      .map((e) => boostKey('target', e.stats))
    const out = new Set<string>()
    const chance = (move.effects as MoveEffect[]).filter(
      (e) =>
        (e.type === 'status' || e.type === 'volatile') &&
        e.target === 'target' &&
        !!e.chance &&
        e.chance < 100,
    )
    const random = RANDOM_STATUS_MOVES[a.move] ?? []
    if (!sheer) {
      for (const e of chance) if (e.type === 'status' || e.type === 'volatile') out.add(e.status)
      for (const st of random) out.add(st)
    }
    const hasFlinch = (move.effects as MoveEffect[]).some(
      (e) => e.type === 'volatile' && e.status === 'flinch',
    )
    const um = mon(side, ui)
    // 상대는 확정 전이면 추측 도구도 가능성에 넣음 (체크는 실제로 본 것)
    const held = user.slot.item || (side === 'opp' ? guessedItem(ui) : '')
    const item = um.itemGone || s.rooms.magicroom || user.ability === 'klutz' ? '' : held
    const boosted = sheer && (chance.length > 0 || random.length > 0)
    if (!hasFlinch && !boosted && (item === 'kingsrock' || user.ability === 'stench'))
      out.add('flinch')
    if (user.ability === 'poisontouch' && move.flags.includes('contact')) out.add('psn')
    if (user.ability === 'toxicchain') out.add('tox')
    const tm = mon(foe, tIdx)
    const statuses = [...STATUSES, 'flinch', 'confusion'].filter((k) => {
      if (!out.has(k)) return false
      if (k === 'flinch')
        return target.ability !== 'innerfocus' && actsBefore(side, slot, foe, tIdx)
      if (k === 'confusion') return !tm.volatiles.confusion && target.ability !== 'owntempo'
      return !statusBlocked(foe, tIdx, k as Exclude<Status, ''>)
    })
    return [...statuses, ...targetKeys, ...selfKeys]
  }
  // side 의 slot 공격기가 맞으면 반드시 생기는 효과 (확정 효과·확률 100% 부가효과 — 턴 적용 때 자동 반영, 화면은 체크 고정으로 표시).
  // 랭크 변화(자기 쪽은 주 대상 칸에만)와 상태이상. 인분·대타면 상대 쪽은 없음, 걸 수 없는 상태이상은 제외
  const sureInflicts = (side: BattleSide, slot: number, tIdx: number | null): string[] => {
    const s = state.value!
    const a = s.actions[side][slot]
    const ui = s.sides[side].active[slot]
    const foe = foeOf(side)
    if (!a || a.kind !== 'move' || !a.move || ui == null || tIdx == null) return []
    const move = gd.move(a.move)
    const user = resolveAt(side, ui)
    const target = resolveAt(foe, tIdx)
    if (!move || move.category === 'status' || !user || !target || isFainted(foe, tIdx)) return []
    const sheer = user.ability === 'sheerforce'
    const main = hitTarget(side, slot, turnOrder(), a.target).idx === tIdx
    const covered = target.ability === 'shielddust' || behindSub(side, ui, foe, tIdx, a.move)
    const out: string[] = []
    for (const e of move.effects as MoveEffect[]) {
      if (e.type !== 'boost' && e.type !== 'status') continue
      const chance = 'chance' in e ? e.chance : undefined
      if (chance && (chance < 100 || sheer)) continue
      if (e.type === 'boost') {
        if (e.target === 'self') {
          if (main) out.push(boostKey('self', e.stats))
        } else if (!covered && !(chance && target.ability === 'shielddust'))
          out.push(boostKey('target', e.stats))
      } else if (!covered && !statusBlocked(foe, tIdx, e.status)) out.push(e.status)
    }
    return out
  }
  // side 의 slot 기술이 접촉해서, 맞는 상대 tIdx 의 특성으로 공격한 쪽에게 생길 수 있는 효과
  //   (원격(긴 팔)이면 없음, 포자는 풀 타입·방진·방진고글 무효, 대타가 맞으면 없음)
  const possibleContactInflicts = (side: BattleSide, slot: number, tIdx: number | null) => {
    const s = state.value!
    const a = s.actions[side][slot]
    const ui = s.sides[side].active[slot]
    const foe = foeOf(side)
    if (!a || a.kind !== 'move' || !a.move || ui == null || tIdx == null) return []
    const move = gd.move(a.move)
    const user = resolveAt(side, ui)
    const target = resolveAt(foe, tIdx)
    if (!move || !move.flags.includes('contact') || !user || !target) return []
    if (user.ability === 'longreach' || behindSub(side, ui, foe, tIdx, a.move)) return []
    const list = CONTACT_STATUS_ABILITY[target.ability] ?? []
    const um = mon(side, ui)
    if (
      target.ability === 'effectspore' &&
      (user.species.types.includes('grass') ||
        user.ability === 'overcoat' ||
        (user.slot.item === 'safetygoggles' && !um.itemGone))
    )
      return []
    return list.filter((k) =>
      k === 'attract'
        ? !um.volatiles.attract &&
          user.ability !== 'oblivious' &&
          attractable(foe, tIdx, side, ui) !== 'no'
        : !statusBlocked(side, ui, k as Exclude<Status, ''>),
    )
  }

  // 혼란 자해 예상 데미지 [최소, 최대] (mine: 실수치, opp: 최대 HP 의 %)
  const confusionRange = (side: BattleSide, idx: number): [number, number] | null => {
    const c = combatantOf(side, idx)
    if (!c) return null
    const rolls = confusionDamage(c, fieldFor(side, idx))
    const conv = (v: number) =>
      side === 'mine' ? v : Math.round((v / Math.max(1, c.stats.hp)) * 1000) / 10
    return [conv(rolls[0]!), conv(rolls[15]!)]
  }

  // 교체할 수 없는가 (행동의 "교체"만. 유턴·볼트체인지 등 교체기는 됨)
  //   요정의자물쇠 / 문어굳히기·물고버티기·조이기류(고스트 타입은 무시) / 뿌리박기 / 상대 그림자밟기(고스트·그림자밟기 제외).
  //   도구 아름다운허물이면 모두 무시
  const switchBlocked = (side: BattleSide, slot: number) => {
    const s = state.value!
    if (s.fairyLock > 0) return true
    const idx = s.sides[side].active[slot]
    if (idx == null || isFainted(side, idx)) return false
    const m = mon(side, idx)
    const r = resolveAt(side, idx)
    if (!r || (r.slot.item === 'shedshell' && !m.itemGone)) return false
    if (m.volatiles.ingrain) return true
    if (r.species.types.includes('ghost')) return false
    if (TRAP_VOLATILES.some((k) => m.volatiles[k])) return true
    const foe = foeOf(side)
    return (
      r.ability !== 'shadowtag' &&
      s.sides[foe].active.some(
        (i) => i != null && !isFainted(foe, i) && resolveAt(foe, i)?.ability === 'shadowtag',
      )
    )
  }

  // 행동 패널: 공격 후 교체 입력이 필요한 경우
  const canSelfSwitch = (side: BattleSide, slot: number) => {
    const s = state.value!
    const a = s.actions[side][slot]
    if (!a || a.kind !== 'move' || !a.move) return false
    if (PIVOT_MOVES.has(a.move)) return true
    const foe = foeOf(side)
    const t = s.sides[foe].active[a.target]
    const mv = gd.move(a.move)
    return (
      t != null &&
      !!mv &&
      mv.category !== 'status' &&
      resolveAt(foe, t)?.slot.item === 'redcard' &&
      !mon(foe, t).itemGone
    )
  }
  const canForceSwitch = (side: BattleSide, slot: number) => {
    const s = state.value!
    const a = s.actions[side][slot]
    if (!a || a.kind !== 'move' || !a.move) return false
    if (FORCE_MOVES.has(a.move)) return true
    const foe = foeOf(side)
    const t = s.sides[foe].active[a.target]
    const mv = gd.move(a.move)
    if (t == null || !mv || mv.category === 'status') return false
    const r = resolveAt(foe, t)
    return (
      (r?.slot.item === 'ejectbutton' && !mon(foe, t).itemGone) ||
      r?.ability === 'emergencyexit' ||
      r?.ability === 'wimpout'
    )
  }

  return {
    benchOf,
    replaceOptions,
    pendingReplace,
    battleResult,
    drainSeen,
    drainObservable,
    drainAfterOf,
    wakeChance,
    encoreMove,
    encoreTurnsLeft,
    maxPp,
    ppUsedOf,
    sleepsThrough,
    validationError,
    possibleInflicts,
    sureInflicts,
    possibleContactInflicts,
    confusionRange,
    switchBlocked,
    canSelfSwitch,
    canForceSwitch,
  }
}

export type BattleQueries = ReturnType<typeof createQueries>
