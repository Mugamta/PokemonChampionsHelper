// composables/useBattle.ts
// 배틀 진행 상태 (싱글: 필드에 1마리씩 / 더블: 2마리씩). 상태 전체를 useState 에 두어서 다른 화면을 다녀와도 유지된다.
//
//  - 내 포켓몬 HP 는 실제 수치, 상대 HP 는 % (상대 실능치는 추정이므로)
//  - 상태이상/랭크/특수 상태는 포켓몬별로 관리 (교체 시 랭크·특수상태 초기화, 상태이상 유지)
//  - "이번 턴 적용" = 교체 → 메가진화 → 기술(실제 행동 순서대로: 우선도 → 스피드, 트릭룸이면 반대, 관찰한 선후공 우선.
//    효과 자동 반영 + 입력한 데미지) → 상태이상 발생 → 턴 종료 데미지 → 턴 경과
//  - 상대 추정: 선후공 관찰 → 스피드 구간(speedSp), 주고받은 데미지 → 맞은 시점 상태를 관측(obs)으로 저장
//    (계산은 composables/useOppEstimate.ts, utils/speedInference.ts, utils/statInference.ts)
//  - 직전 30턴까지 스냅샷으로 되돌리기
//
// 구현은 composables/battle/ 에 층별로 나뉘어 있고 (아래 층만 부른다), 여기서 조립해 화면용 API 를 만든다:
//   core(상태 읽기) → order(스피드·행동 순서) → queries(가능한 효과·교체·PP·입력 검증) → field(날씨·필드·벽)
//   → hp(HP·랭크·상태이상) → entry(등장·교체·변신·확정) → moves(기술 효과) → turn(턴 적용)
// 타입·상수는 utils/battleState.ts

import type { BattleMode } from '~/composables/useEntry'
import { createCore, type CoreHooks } from '~/composables/battle/core'
import { createOrder } from '~/composables/battle/order'
import { createQueries } from '~/composables/battle/queries'
import { createField } from '~/composables/battle/field'
import { createHp } from '~/composables/battle/hp'
import { createEntry } from '~/composables/battle/entry'
import { createMoves } from '~/composables/battle/moves'
import { createTurn } from '~/composables/battle/turn'
import { clampBoost } from '~/utils/stats'
import { fullRanges } from '~/utils/speedInference'
import type { RankKey, Status } from '~/utils/types'
import { BASE_TURNS, LOAF_VOLATILES, newAction, newMon, type BattleSide } from '~/utils/battleState'

export function useBattle(mode: BattleMode) {
  // order 가 만들어지기 전에 core 의 배분 추정이 부를 일은 없지만 기본값을 둔다
  const hooks: CoreHooks = { speedRangesOf: () => fullRanges() }
  const core = createCore(mode, hooks)
  const order = createOrder(core)
  hooks.speedRangesOf = order.speedRangesOf
  const queries = createQueries({ ...core, ...order })
  const field = createField(core)
  const hp = createHp({ ...core, ...queries })
  const entry = createEntry({ ...core, ...order, ...queries, ...field, ...hp })
  const moves = createMoves({ ...core, ...queries, ...field, ...hp })
  const turn = createTurn({ ...core, ...order, ...queries, ...field, ...hp, ...entry, ...moves })

  const { N, calc, state, mineSlots, signature, slotsOf, mon, maxHp, quarterHp, sideMegaUsed } =
    core
  const { sendOut, onEnter } = entry

  // ── 초기화 ─────────────
  const reset = () => {
    const mons = (side: BattleSide) =>
      slotsOf(side).map((s) =>
        newMon(side === 'mine' ? calc.resolve(s, false, false)?.stats.hp || 0 : 100),
      )
    state.value = {
      signature: signature.value,
      turn: 1,
      weather: { key: '', cur: 0, total: BASE_TURNS, permanent: false, source: null, by: null },
      terrain: { key: '', cur: 0, total: BASE_TURNS, by: null },
      rooms: {},
      fairyLock: 0,
      sides: {
        mine: {
          mons: mons('mine'),
          active: Array(N).fill(null),
          revealed: [],
          hazards: {},
          screens: {},
        },
        opp: {
          mons: mons('opp'),
          active: Array(N).fill(null),
          revealed: [],
          hazards: {},
          screens: {},
        },
      },
      actions: {
        mine: Array.from({ length: N }, newAction),
        opp: Array.from({ length: N }, newAction),
      },
      observedOrder: 'unknown',
      entry: null,
      entryObs: {},
      focus: { mine: 0, opp: 0 },
      preview: null,
      history: [],
    }
    // 내 선출 순서대로 필드에 내보냄
    for (let k = 0; k < N && k < mineSlots.value.length; k++) sendOut('mine', k, k)
  }
  // 진행 중인 배틀의 구성(선출 / 내 포켓몬·도구 / 상대 포켓몬)이 바뀌면 이어갈 수 없다.
  // 아직 시작 전(첫 턴 적용 전)이면 조용히 새로 만들고, 진행 중이면 화면이 이유를 보여 주고 확인을 받은 뒤 초기화
  const staleReason = computed<'' | 'picks' | 'mine' | 'opp'>(() => {
    const s = state.value
    if (!s || s.signature === signature.value) return ''
    try {
      const [oldPicks, oldMine, oldOpp] = JSON.parse(s.signature)
      const [picks, mineS, oppS] = JSON.parse(signature.value)
      if (JSON.stringify(oldPicks) !== JSON.stringify(picks)) return 'picks'
      if (JSON.stringify(oldMine) !== JSON.stringify(mineS)) return 'mine'
      if (JSON.stringify(oldOpp) !== JSON.stringify(oppS)) return 'opp'
    } catch {
      // 예전 형식
    }
    return 'picks'
  })
  const inProgress = () => !!state.value && (state.value.turn > 1 || state.value.history.length > 0)
  const ensure = () => {
    if (!state.value || (state.value.signature !== signature.value && !inProgress())) reset()
  }

  // ── 화면에서 직접 고치기 (상태이상 / 특수상태 / 랭크 / 도구 / 폼 / 메가) ─────────────
  const setStatus = (side: BattleSide, idx: number, st: Status) => {
    const m = mon(side, idx)
    m.status = m.status === st ? '' : st
    m.toxicTurn = 0
  }
  // 특수 상태를 새로 붙일 때의 값. betweenTurns = 턴 사이에 직접 켬
  //   (하품·반동은 "이번 턴 끝에 잠듦" / "이번 턴 행동 불가" 단계, 멸망의노래는 이미 턴 끝을 한 번 지난 카운트 3)
  const volatileStart = (side: BattleSide, idx: number, key: string, betweenTurns: boolean) => {
    if (key === 'substitute') return quarterHp(side, idx)
    if (key === 'perishsong') return betweenTurns ? 3 : 4
    if (key === 'yawn' || LOAF_VOLATILES.includes(key)) return betweenTurns ? 2 : 1
    return 1
  }
  const toggleVolatile = (side: BattleSide, idx: number, key: string) => {
    const m = mon(side, idx)
    // 비축은 누를 때마다 1 → 2 → 3 → 없음
    if (key === 'stockpile' && (m.volatiles[key] || 0) < 3)
      m.volatiles[key] = (m.volatiles[key] || 0) + 1
    else if (m.volatiles[key]) delete m.volatiles[key]
    else m.volatiles[key] = volatileStart(side, idx, key, true)
  }
  const changeBoost = (side: BattleSide, idx: number, key: RankKey, delta: number) => {
    const m = mon(side, idx)
    m.boosts[key] = clampBoost((m.boosts[key] ?? 0) + delta)
  }
  const toggleItemGone = (side: BattleSide, idx: number) => {
    const m = mon(side, idx)
    m.itemGone = !m.itemGone
  }
  const setAlt = (side: BattleSide, idx: number, on: boolean) => {
    mon(side, idx).alt = on
  }
  const setMega = (side: BattleSide, idx: number, on: boolean) => {
    const m = mon(side, idx)
    if (m.megaUsed || (on && sideMegaUsed(side))) return
    m.megaOn = on
    if (on && state.value!.sides[side].active.includes(idx)) onEnter(side, idx) // 메가진화로 특성이 바뀌면 날씨 등 재발동
  }
  // 추정 기록 지우기 (입력을 잘못했을 때)
  const resetEstimate = (oi: number) => {
    const m = mon('opp', oi)
    m.obs = []
    m.speedSp = null
    m.hpObs = []
    m.hpCheck = null
  }
  // 정정 모드: 필드 포켓몬 바꾸기가 교체 효과 없이 적용됨
  const editMode = useState(`battle-${mode}-edit`, () => false)

  return {
    N,
    canSelfSwitch: queries.canSelfSwitch,
    canForceSwitch: queries.canForceSwitch,
    benchOf: queries.benchOf,
    editMode,
    staleReason,
    state,
    mineSlots,
    oppSlots: core.oppSlots,
    ensure,
    reset,
    resolveAt: core.resolveAt,
    maxHp,
    isFainted: core.isFainted,
    sendOut,
    setWeather: field.setWeather,
    toggleWeather: field.toggleWeather,
    toggleTerrain: field.toggleTerrain,
    toggleRoom: field.toggleRoom,
    adjustCounter: field.adjustCounter,
    toggleSideCondition: field.toggleSideCondition,
    setStatus,
    toggleVolatile,
    confirmItem: entry.confirmItem,
    confirmAbility: entry.confirmAbility,
    oppAbilityOf: core.oppAbilityOf,
    residualPlan: hp.residualPlan,
    changeBoost,
    setMega,
    sideMegaUsed,
    canMegaEvolve: core.canMegaEvolve,
    setAlt,
    toggleItemGone,
    toggleTransform: entry.toggleTransform,
    canTransform: entry.canTransform,
    resolveSnapshot: core.resolveSnapshot,
    speedOf: order.speedOf,
    movePriority: order.movePriority,
    turnMega: order.turnMega,
    turnOrder: order.turnOrder,
    actionOpts: order.actionOpts,
    hitTarget: order.hitTarget,
    formAtHit: order.formAtHit,
    turnStateBefore: order.turnStateBefore,
    withTurnState: order.withTurnState,
    fieldWithTurnState: order.fieldWithTurnState,
    speedEnvOf: order.speedEnvOf,
    pendingSpeedObservation: order.pendingSpeedObservation,
    speedRangesOf: order.speedRangesOf,
    speedOrder: order.speedOrder,
    entryPairsNow: entry.entryPairsNow,
    entryObsOf: entry.entryObsOf,
    setEntryOrder: entry.setEntryOrder,
    pendingReplace: queries.pendingReplace,
    battleResult: queries.battleResult,
    replaceOptions: queries.replaceOptions,
    replaceFainted: entry.replaceFainted,
    resetEstimate,
    helpingHandFor: core.helpingHandFor,
    allyOf: core.allyOf,
    hitsAlly: core.hitsAlly,
    attackOpts: core.attackOpts,
    validationError: queries.validationError,
    canUndo: turn.canUndo,
    undo: turn.undo,
    executeTurn: turn.executeTurn,
    fieldFor: core.fieldFor,
    spreadActive: core.spreadActive,
    combatantOf: core.combatantOf,
    combatantRange: core.combatantRange,
    oppBoundsNow: core.oppBoundsNow,
    oppEstimate: core.estimator.estimate,
    isStatusMove: core.isStatusMove,
    confusionRange: queries.confusionRange,
    behindSub: core.behindSub,
    drainObservable: queries.drainObservable,
    possibleInflicts: queries.possibleInflicts,
    sureInflicts: queries.sureInflicts,
    possibleContactInflicts: queries.possibleContactInflicts,
    genderOf: core.genderOf,
    wakeChance: queries.wakeChance,
    sleepsThrough: queries.sleepsThrough,
    encoreMove: queries.encoreMove,
    encoreTurnsLeft: queries.encoreTurnsLeft,
    maxPp: queries.maxPp,
    ppUsedOf: queries.ppUsedOf,
    oppItemOf: core.oppItemOf,
    guessedItem: core.guessedItem,
    switchBlocked: queries.switchBlocked,
    earlierDamage: order.earlierDamage,
  }
}
