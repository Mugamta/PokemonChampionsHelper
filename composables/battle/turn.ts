// composables/battle/turn.ts
// 턴 적용(executeTurn)과 되돌리기. 순서: 교체 → 행동 불가 → 메가진화 → 기술(행동 순서대로) → 원시 날씨 → 턴 끝 → 경과 → 입력 초기화

import { isSpreadMove, SCREEN_BREAKERS } from '~/utils/damage'
import type { HpCheck, HpStep } from '~/utils/hpDisplay'
import { hpCorrection } from '~/utils/hpDisplay'
import { statusDamage } from '~/utils/ko'
import { clampBoost } from '~/utils/stats'
import { fullRanges, narrowRanges } from '~/utils/speedInference'
import type { RankKey, Status } from '~/utils/types'
import {
  BATON_VOLATILES,
  CANT_DAMAGE_REASONS,
  CRASH_MOVES,
  FOE_TARGETS,
  LOAF_VOLATILES,
  newAction,
  parseBoostKey,
  SLEEP_MOVES,
  VOLATILE_DURATION,
  zeroBoosts,
  type BattleSide,
  type Counter,
} from '~/utils/battleState'
import type { BattleCore } from '~/composables/battle/core'
import type { BattleOrder } from '~/composables/battle/order'
import type { BattleQueries } from '~/composables/battle/queries'
import type { BattleField } from '~/composables/battle/field'
import type { BattleHp } from '~/composables/battle/hp'
import type { BattleEntry } from '~/composables/battle/entry'
import type { BattleMoves } from '~/composables/battle/moves'

export function createTurn(
  b: BattleCore & BattleOrder & BattleQueries & BattleField & BattleHp & BattleEntry & BattleMoves,
) {
  const {
    N,
    gd,
    calc,
    state,
    mon,
    resolveAt,
    maxHp,
    isFainted,
    realHp,
    behindSub,
    isStatusMove,
    combatantOf,
    fieldFor,
    allyOf,
    hitsAlly,
    pushHistory,
    turnOrder,
    actionOpts,
    actsBefore,
    pendingSpeedObservation,
    canMegaEvolve,
    validationError,
    possibleInflicts,
    possibleContactInflicts,
    encoreMove,
    wakeChance,
    sleepsThrough,
    drainAfterOf,
    clearWeather,
    statChange,
    whiteHerb,
    healHp,
    checkBerry,
    applyResidual,
    drainHeal,
    inflictStatus,
    spendPp,
    sendOut,
    transformInto,
    onEnter,
    newBatch,
    runEntry,
    applyEntryNarrowing,
    copyField,
    applyMoveEffects,
    onHit,
    afterAttack,
    hitPunish,
    absorbAbility,
    THAWS_TARGET,
    recordObservation,
  } = b

  const canUndo = computed(() => (state.value?.history.length || 0) > 0)
  const undo = () => {
    const s = state.value
    const snap = s?.history.pop()
    if (!s || !snap) return
    state.value = { ...JSON.parse(snap), history: s.history }
  }

  function executeTurn() {
    const s = state.value
    if (!s || validationError.value) return
    pushHistory()
    // 지난 턴 끝 HP 를 게임 화면 값으로 고쳤으면 관측으로 저장 (HP 실능치 추정)
    for (const m of s.sides.opp.mons) {
      const o = hpCorrection(m.hpCheck, m.hp, s.turn)
      if (o) m.hpObs = [...(m.hpObs ?? []), o]
      m.hpCheck = null
    }
    // 턴 시작에 HP 가 가득 찬 상대 (화면 % 를 입력하기 전까지 HP 를 정확히 앎 → 턴 끝에 버림)
    const fullOpp = new Set<number>()
    s.sides.opp.mons.forEach((m, i) => {
      if (m.hp >= 100) fullOpp.add(i)
    })
    // 앙코르: 마지막으로 쓴 기술만 나간다 (화면에서도 고정, 여기서 한 번 더 맞춤)
    for (const side of ['mine', 'opp'] as const)
      s.actions[side].forEach((a, slot) => {
        const ui = s.sides[side].active[slot]
        const em = ui == null ? '' : encoreMove(side, ui)
        if (a.kind === 'move' && em && (a.via || a.move) !== em)
          Object.assign(a, { move: em, via: '' })
      })
    // 변화기는 데미지가 없음: 남아 있는 데미지 입력은 비움 (화면에서는 입력칸을 숨김)
    for (const side of ['mine', 'opp'] as const)
      for (const a of s.actions[side])
        if (a.kind === 'move' && isStatusMove(a.move))
          Object.assign(a, { amount: null, amount2: null, allyAmount: null, crit: false })
    const sides: BattleSide[] = ['mine', 'opp']
    // 선후공 관찰은 교체 전 필드 포켓몬 기준 (둘 다 교체하면 나가는 포켓몬끼리의 교체 순서)
    const speedObs = pendingSpeedObservation()

    // 1. 교체
    // 0. 이번 턴 기록 초기화
    for (const side of sides)
      for (const m of s.sides[side].mons)
        Object.assign(m, {
          turnDamaged: false,
          turnLowered: false,
          turnTaken: { physical: 0, special: 0, last: 0 },
        })
    // 고칠 수 있던 동시 등장(선두·쓰러진 뒤 교체)은 이제 확정
    s.entry = null
    // 양쪽이 같이 교체하면 들어온 포켓몬의 특성은 스피드 순 (관찰한 순서가 있으면 그대로 + 상대 스피드 구간 좁힘)
    const switching: [BattleSide, number][] = []
    for (const side of sides) {
      s.actions[side].forEach((a, slot) => {
        if (a.kind === 'switch' && a.switchTo != null && !s.fairyLock) {
          sendOut(side, slot, a.switchTo, 'switch', true)
          switching.push([side, a.switchTo])
        }
      })
    }
    if (switching.length) {
      const batch = newBatch(switching, copyField())
      runEntry(batch, () => true)
      applyEntryNarrowing(batch)
    }

    // 기술 단계 시작 때 필드에 있던 포켓몬 (도중에 유턴·드래곤테일 등으로 바뀐 칸은 행동 입력을 비움)
    const activeAtMoves = { mine: [...s.sides.mine.active], opp: [...s.sides.opp.active] }

    // 행동 불가: 이유가 잠듦·얼음·마비인데 상태이상이 없으면 그 상태이상으로 (관찰한 사실).
    // 기술이 안 나간 것은 "실패"가 아니므로 분함의발구르기·열불내기 2배 조건은 풀린다
    for (const side of sides)
      s.actions[side].forEach((a, slot) => {
        const ui = s.sides[side].active[slot]
        if (a.kind !== 'cant' || ui == null || isFainted(side, ui)) return
        const m = mon(side, ui)
        // 잠듦·얼음: 행동하지 못한 턴 수를 셈 (상태이상이 없었으면 이번 턴부터)
        if (a.cantReason === 'slp' || a.cantReason === 'frz') {
          if (m.status === a.cantReason) m.toxicTurn += 1
          else if (!m.status) Object.assign(m, { status: a.cantReason, toxicTurn: 1 })
        } else if (!m.status && a.cantReason === 'par')
          Object.assign(m, { status: 'par', toxicTurn: 0 })
        // 혼란 자해: 혼란이 안 붙어 있었으면 붙임 (관찰한 사실)
        if (a.cantReason === 'confusion' && !m.volatiles.confusion) m.volatiles.confusion = 1
        // 혼란 자해·기타로 잃은 HP
        if (CANT_DAMAGE_REASONS.has(a.cantReason) && a.amount && a.amount > 0) {
          m.hp = Math.max(0, m.hp - a.amount)
          if (side === 'opp') fullOpp.delete(ui)
        }
        m.lastFailed = false
      })

    // 2a. 메가진화 (기술보다 먼저 — 이번 턴 스피드에도 반영)
    for (const side of sides) {
      s.actions[side].forEach((a, slot) => {
        const userIdx = s.sides[side].active[slot]
        if (a.kind !== 'move' || !a.useMega || userIdx == null) return
        const m = mon(side, userIdx)
        // 더블에서 두 칸 모두 체크했으면 앞 칸만 (화면은 한 칸만 체크할 수 있게 막는다)
        if (canMegaEvolve(side, userIdx)) {
          m.megaOn = true
          m.megaUsed = true
          // 다른 포켓몬의 메가 미리보기는 끔 (더는 메가진화할 수 없음)
          s.sides[side].mons.forEach((x, i) => {
            if (i !== userIdx && !x.megaUsed) x.megaOn = false
          })
          onEnter(side, userIdx, true)
        }
      })
    }

    // 2b. 행동 순서 + 선후공 관찰로 상대 스피드 구간 좁히기 (변신한 상대는 복사한 스피드라 저장 안 함)
    const order = turnOrder()
    if (speedObs && speedObs.env.fixedStat == null) {
      const om = mon('opp', speedObs.oi)
      om.speedSp = narrowRanges(
        om.speedSp ?? fullRanges(),
        speedObs.base,
        speedObs.env,
        speedObs.mySpeed,
        speedObs.oppAtLeast,
      )
    }

    // 2c. 기술 (순서대로: 관측 기록 → 효과 → 입력한 데미지)
    order.forEach(({ side, slot, idx }) => {
      const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
      const a = s.actions[side][slot]!
      const userIdx = s.sides[side].active[slot]
      // 이번 턴 도중에 교체되어 들어온 포켓몬은 행동하지 않음
      if (a.kind !== 'move' || userIdx == null || userIdx !== idx || isFainted(side, userIdx))
        return
      // 잠듦인데 이번 시도에 풀릴 확률이 0% (잠든 뒤 첫 시도 — 이번 턴 먼저 잠든 경우 포함, 잠자기 2번째까지)면
      // 기술은 나가지 않는다 (잠꼬대·코골기 제외). 행동 불가(잠듦)로 셈
      const sleeper = mon(side, userIdx)
      // 잠꼬대·흉내내기로 부른 기술이면 caller = 부른 기술 (잠듦 판정·PP·앙코르는 caller 기준)
      const caller = a.via || a.move
      if (sleepsThrough(side, userIdx, caller)) {
        sleeper.toxicTurn += 1
        sleeper.lastFailed = false
        return
      }
      {
        const targetIdx = s.sides[foe].active[a.target] ?? null
        const user = mon(side, userIdx)
        // 이번 턴 데미지에 영향을 주는 그때의 보정 (행동 순서 포함) → 관측 기록
        if (
          a.move &&
          targetIdx != null &&
          a.amount &&
          a.amount > 0 &&
          !a.missed &&
          !behindSub(side, userIdx, foe, targetIdx, a.move)
        )
          recordObservation(
            side,
            a,
            userIdx,
            foe,
            targetIdx,
            actionOpts(side, slot, userIdx, a.move, order),
          )
        // 벽 깨기 (깨뜨리다·사이코팽·레이징불): 맞기 전에 대상 쪽 벽이 사라진다 (무효인 상대면 그대로)
        if (a.move && targetIdx != null && SCREEN_BREAKERS.has(a.move)) {
          const atkC = combatantOf(side, userIdx, undefined, true)
          const defC = combatantOf(foe, targetIdx)
          const c = atkC && defC ? calc.cell(a.move, atkC, defC, fieldFor(foe, targetIdx)) : null
          if (c && !c.immune)
            for (const k of ['reflect', 'lightscreen', 'auroraveil']) delete s.sides[foe].screens[k]
        }
        // 잠듦·얼음인데 기술을 썼으면 깨어남·녹음 (잠꼬대·코골기는 잠든 채로 씀 → 잠든 턴 수 +1)
        if (caller && user.status === 'slp' && SLEEP_MOVES.has(caller)) user.toxicTurn += 1
        if (
          caller &&
          (user.status === 'frz' || (user.status === 'slp' && !SLEEP_MOVES.has(caller)))
        )
          user.status = ''
        // 길동무: 다음에 기술을 쓰면 풀림 (이번에 또 쓰면 다시 붙음)
        if (a.move) delete user.volatiles.destinybond
        if (a.move === 'destinybond' && !a.missed) user.volatiles.destinybond = 1
        // 게으름: 기술을 쓰면(빗나가도) 다음 턴은 게으름을 피워 행동 불가
        if (a.move && resolveAt(side, userIdx)?.ability === 'truant') user.volatiles.truant = 1
        if (a.move) {
          // 메트로놈(도구) 연속 횟수
          if (user.lastMove === caller) user.moveStreak += 1
          else Object.assign(user, { lastMove: caller, moveStreak: 0 })
          const mv = gd.move(a.move)
          // PP: 빗나가도 1 (부른 기술이면 부른 기술에서). 상대를 노리는 기술이면 노린 상대(광역기는 필드의 상대 모두) 중 프레셔마다 1 더
          const foeTargets =
            !mv || !FOE_TARGETS.has(mv.target)
              ? []
              : mv.target === 'foeSide' || isSpreadMove(mv)
                ? s.sides[foe].active
                : [targetIdx]
          const pressure = foeTargets.filter(
            (i) => i != null && !isFainted(foe, i) && resolveAt(foe, i)?.ability === 'pressure',
          ).length
          spendPp(side, userIdx, caller, 1 + pressure)
          // 상대가 잠꼬대로 낸 기술은 그 상대의 기술 (흉내내기는 다른 포켓몬의 기술이라 아님)
          if (a.via === 'sleeptalk' && !user.transform && !(user.movesSeen ?? []).includes(a.move))
            user.movesSeen = [...(user.movesSeen ?? []), a.move]
          s.lastUsedMove = a.move
          // 충전은 전기 공격기를 쓰면 풀린다
          if (user.volatiles.charge && mv?.type === 'electric' && mv.category !== 'status')
            delete user.volatiles.charge
          // 맞은 상대: 대상 + (더블 광역기) 다른 상대 칸. 빗나감·데미지 0 이면 맞지 않음
          const other = N > 1 ? (s.sides[foe].active[1 - a.target] ?? null) : null
          const targets: number[] = []
          if (targetIdx != null && a.amount !== 0) targets.push(targetIdx)
          if (other != null && isSpreadMove(mv) && a.amount2 !== 0 && !isFainted(foe, other))
            targets.push(other)
          applyMoveEffects(a.move, side, userIdx, targetIdx, targets, !a.missed)
          // 원한: 대상이 마지막으로 쓴 기술 PP −4 / 으스스주문: 맞히면 −3
          const ppCut = a.move === 'spite' ? 4 : a.move === 'eeriespell' ? 3 : 0
          if (
            ppCut &&
            targetIdx != null &&
            !a.missed &&
            (a.move === 'spite' || targets.includes(targetIdx))
          ) {
            const tm = mon(foe, targetIdx)
            if (tm.lastMove && !isFainted(foe, targetIdx))
              spendPp(foe, targetIdx, tm.lastMove, ppCut)
          }
        }
        // 변신 기술: 대상 칸의 상대로 변신
        // 비축 / 토해내기·꿀꺽 / 기충전
        if (a.move === 'stockpile')
          user.volatiles.stockpile = Math.min(3, (user.volatiles.stockpile || 0) + 1)
        if (a.move === 'focusenergy') user.volatiles.focusenergy = 1
        // 빗나감·실패: 다음 턴 분함의발구르기·열불내기 2배, 무릎차기류는 최대 HP 1/2 반동
        user.lastFailed = !!a.missed
        if (
          a.missed &&
          CRASH_MOVES.has(a.move) &&
          resolveAt(side, userIdx)?.ability !== 'magicguard'
        ) {
          const max = maxHp(side, userIdx)
          user.hp =
            side === 'mine'
              ? Math.max(0, user.hp - Math.floor(max / 2))
              : Math.max(0, user.hp - (Math.floor(max / 2) / (max || 1)) * 100)
        }
        if (a.move === 'transform' && targetIdx != null)
          transformInto(side, userIdx, foe, targetIdx)
        // 배틀스위치: 공격기 → 블레이드폼, 킹실드 → 실드폼
        if (a.move && resolveAt(side, userIdx)?.ability === 'stancechange') {
          const mv = gd.move(a.move)
          const um = mon(side, userIdx)
          const holder = um.transform ?? um // 변신 중이면 복사한 폼 상태
          if (a.move === 'kingsshield') holder.alt = false
          else if (mv && mv.category !== 'status') holder.alt = true
        }
        // 입력한 데미지 (광역기면 다른 상대 칸도). dealt: 맞힌 데미지 합 (실수치, 반동·조개껍질방울)
        let dealt = 0
        const hitTarget = (tIdx: number, amount: number) => {
          const t = mon(foe, tIdx)
          // 대타가 받음: 대타 HP 만 줄고(0 이하면 사라짐) 본체 HP·맞았을 때 효과는 없음
          if (amount > 0 && behindSub(side, userIdx, foe, tIdx, a.move)) {
            const subHp = t.volatiles.substitute!
            const left = subHp - amount
            if (left > 0) t.volatiles.substitute = left
            else delete t.volatiles.substitute
            drainHeal(a.move, side, userIdx, foe, tIdx, Math.min(amount, subHp))
            dealt += realHp(foe, tIdx, Math.min(amount, subHp))
            return
          }
          // 흡수 후 HP 를 직접 입력했으면 그 값 (계산은 상대 최대 HP 추정이라 오차가 있음)
          const after = drainAfterOf(side, userIdx, tIdx, a)
          const hpBefore = t.hp
          if (side === 'mine') t.hp = Math.max(0, t.hp - Math.max(0, Math.min(100, amount)))
          else t.hp = Math.max(0, t.hp - Math.max(0, amount))
          if (foe === 'opp' && amount > 0) fullOpp.delete(tIdx)
          if (after != null && hpBefore > t.hp)
            user.hp = Math.max(user.hp, Math.min(maxHp(side, userIdx), after))
          else drainHeal(a.move, side, userIdx, foe, tIdx, hpBefore - t.hp)
          dealt += realHp(foe, tIdx, hpBefore - t.hp)
          // 얼음 상태에서 불꽃 기술(열탕·열사의대지 등 포함)에 맞으면 녹음
          if (amount > 0 && t.status === 'frz' && THAWS_TARGET(a.move)) t.status = ''
          if (amount > 0) {
            t.timesHit = (t.timesHit || 0) + 1
            t.turnDamaged = true
            const mv = gd.move(a.move)
            const hp = side === 'mine' ? Math.round((amount / 100) * maxHp(foe, tIdx)) : amount
            const taken = (t.turnTaken ??= { physical: 0, special: 0, last: 0 })
            if (mv?.category === 'physical') taken.physical += hp
            if (mv?.category === 'special') taken.special += hp
            taken.last = hp
          }
          if (a.move)
            onHit(a.move, side, userIdx, foe, tIdx, hpBefore, a.crit && tIdx === targetIdx)
          if (a.move && amount > 0) hitPunish(a.move, side, userIdx, foe, tIdx, hpBefore)
          checkBerry(foe, tIdx)
          // 길동무: 공격을 받아 쓰러지면 공격한 포켓몬도 쓰러짐
          if (hpBefore > 0 && t.hp <= 0 && t.volatiles.destinybond) {
            delete t.volatiles.destinybond
            user.hp = 0
          }
        }
        // 이번 턴 확률 효과 (체크한 것 중 지금 가능한 것만, 맞기 전 기준 — 대타가 맞으면 없음).
        // 속이다처럼 확정 풀죽음(100%)은 체크 없이 (우격다짐·인분·대타·정신력·이미 행동한 상대면 없음)
        const otherIdx = N > 1 ? (s.sides[foe].active[1 - a.target] ?? null) : null
        const spread = isSpreadMove(gd.move(a.move))
        const sureFlinch = (tIdx: number) => {
          const mv = gd.move(a.move)
          const ur = resolveAt(side, userIdx)
          const tr = resolveAt(foe, tIdx)
          return (
            !!mv?.effects.some(
              (e) => e.type === 'volatile' && e.status === 'flinch' && e.chance === 100,
            ) &&
            ur?.ability !== 'sheerforce' &&
            tr?.ability !== 'shielddust' &&
            tr?.ability !== 'innerfocus' &&
            !behindSub(side, userIdx, foe, tIdx, a.move) &&
            actsBefore(side, slot, foe, tIdx)
          )
        }
        const chosen = (tIdx: number | null, list: string[] | undefined) => {
          if (tIdx == null) return []
          const ok = possibleInflicts(side, slot, tIdx)
          const out = (list ?? []).filter((k) => ok.includes(k))
          if (sureFlinch(tIdx) && !out.includes('flinch')) out.push('flinch')
          return out
        }
        const inflictMain = targetIdx != null && a.amount !== 0 ? chosen(targetIdx, a.inflicts) : []
        const inflictOther =
          otherIdx != null && spread && a.amount2 !== 0 ? chosen(otherIdx, a.inflicts2) : []
        const contactOk = possibleContactInflicts(side, slot, targetIdx)
        const contactFx = (a.contactInflicts ?? []).filter((k) => contactOk.includes(k))
        if (targetIdx != null && a.amount && !a.missed) hitTarget(targetIdx, a.amount)
        if (otherIdx != null && a.amount2 && !a.missed && isSpreadMove(gd.move(a.move))) {
          if (!behindSub(side, userIdx, foe, otherIdx, a.move))
            recordObservation(
              side,
              { ...a, amount: a.amount2 },
              userIdx,
              foe,
              otherIdx,
              actionOpts(side, slot, userIdx, a.move, order),
            )
          hitTarget(otherIdx, a.amount2)
        }
        if (a.move && !a.missed) {
          afterAttack(a.move, side, userIdx, dealt)
          for (const tIdx of [targetIdx, spread ? otherIdx : null])
            if (tIdx != null) absorbAbility(a.move, side, userIdx, foe, tIdx)
        }
        // 확률 효과 적용 (빗나가면 없음, 쓰러진 상대는 제외). 풀죽음은 그 상대의 이번 턴 행동을 "행동 불가(풀죽음)"로
        const applyInflicts = (tSlot: number, tIdx: number | null, list: string[]) => {
          if (tIdx == null || a.missed) return
          // 랭크 변화: 자기 쪽은 상대가 쓰러져도, 상대 쪽은 살아 있으면 (하양허브는 한 번에)
          for (const k of list) {
            const bk = parseBoostKey(k)
            if (!bk) continue
            const [tSd, tI] = bk.target === 'self' ? [side, userIdx] : [foe, tIdx]
            if (isFainted(tSd, tI)) continue
            const src: [BattleSide, number] | undefined =
              bk.target === 'self' ? undefined : [side, userIdx]
            for (const [st, v] of bk.stats) statChange(tSd, tI, st, v, src, true)
            whiteHerb(tSd, tI)
          }
          for (const k of list) {
            if (isFainted(foe, tIdx)) return
            if (k.startsWith('boost:')) continue
            const tm = mon(foe, tIdx)
            if (k === 'flinch') {
              const ta = s.actions[foe][tSlot]
              if (ta?.kind === 'move' && s.sides[foe].active[tSlot] === tIdx)
                Object.assign(ta, { kind: 'cant', cantReason: 'flinch' })
            } else if (k === 'confusion' || k === 'attract') tm.volatiles[k] ??= 1
            else inflictStatus(foe, tIdx, k as Exclude<Status, ''>)
          }
        }
        applyInflicts(a.target, targetIdx, inflictMain)
        applyInflicts(1 - a.target, otherIdx, inflictOther)
        // 접촉 특성으로 공격한 쪽에게 (빗나가면 없음)
        if (!a.missed && a.amount !== 0 && !isFainted(side, userIdx))
          for (const k of contactFx) {
            if (k === 'attract') user.volatiles.attract ??= 1
            else inflictStatus(side, userIdx, k as Exclude<Status, ''>)
          }
        // 아군 피해 (mine: 내 아군 실수치, opp: 상대 아군 %)
        const allyIdx = allyOf(side, slot)
        if (allyIdx != null && a.allyAmount && a.move && hitsAlly(a.move)) {
          const ally = mon(side, allyIdx)
          const hpBefore = ally.hp
          ally.hp = Math.max(0, ally.hp - Math.max(0, a.allyAmount))
          if (side === 'opp') fullOpp.delete(allyIdx)
          if (a.allyAmount > 0) ally.timesHit = (ally.timesHit || 0) + 1
          onHit(a.move, side, userIdx, side, allyIdx, hpBefore)
          checkBerry(side, allyIdx)
        }
        // 공격 후 교체: 상대(드래곤테일·울부짖기 / 탈출버튼·위기회피) → 자기(유턴 등 / 상대 레드카드)
        if (targetIdx != null && a.foeSwitch != null && !a.missed && !isFainted(foe, targetIdx)) {
          const t = mon(foe, targetIdx)
          if (resolveAt(foe, targetIdx)?.slot.item === 'ejectbutton' && !t.itemGone)
            t.itemGone = true
          sendOut(foe, a.target, a.foeSwitch)
        }
        if (a.selfSwitch != null && !isFainted(side, userIdx)) {
          if (targetIdx != null) {
            const t = mon(foe, targetIdx)
            if (resolveAt(foe, targetIdx)?.slot.item === 'redcard' && !t.itemGone) t.itemGone = true
          }
          // 바톤터치: 랭크 변화와 일부 특수 상태(대타·멸망의노래 카운트 등)를 나오는 포켓몬에게 넘김
          // (교체로 초기화되기 전에 복사). 꼬리자르기: 대타만 넘김
          const passed =
            a.move === 'batonpass'
              ? {
                  boosts: { ...user.boosts },
                  vols: Object.fromEntries(
                    Object.entries(user.volatiles).filter(([k]) => BATON_VOLATILES.has(k)),
                  ),
                  seedFrom: user.seedFrom,
                }
              : a.move === 'shedtail' && user.volatiles.substitute
                ? {
                    boosts: zeroBoosts(),
                    vols: { substitute: user.volatiles.substitute },
                    seedFrom: null,
                  }
                : null
          sendOut(side, slot, a.selfSwitch)
          if (passed) {
            const inc = mon(side, a.selfSwitch)
            for (const [k, v] of Object.entries(passed.boosts))
              inc.boosts[k as RankKey] = clampBoost((inc.boosts[k as RankKey] ?? 0) + (v ?? 0))
            Object.assign(inc.volatiles, passed.vols)
            if (passed.vols.leechseed) inc.seedFrom = passed.seedFrom
            // 상대 대타 HP 는 % 라서 나오는 포켓몬의 최대 HP 기준으로 바꿈
            const from = maxHp(side, userIdx)
            const to = maxHp(side, a.selfSwitch)
            if (side === 'opp' && passed.vols.substitute && from && to)
              inc.volatiles.substitute = Math.round((passed.vols.substitute * from * 10) / to) / 10
          }
        }
        if (a.move === 'spitup' || a.move === 'swallow') delete user.volatiles.stockpile
      }
    })

    // 3. 원시 날씨의 원인이 쓰러지면 날씨 해제
    if (s.weather.source && isFainted(s.weather.source[0], s.weather.source[1])) clearWeather()

    // 4. (예전의 "상태이상 발생" 선택 칸은 없앰 — 확정 효과는 기술 효과로 자동, 확률 효과는 행동 아래 체크)

    // 5. 턴 종료: 상태이상 데미지, 특수상태 경과
    // 턴 끝 HP 관측 준비 (상대): 실제 HP 범위를 아는 상태(가득 / 화면 % 그대로)에서 시작한 포켓몬만.
    // 최대 HP 비율로 바뀐 것(hpSteps)만 기록하고, 다른 HP 변화(열매·씨뿌리기 흡수 등)가 섞였으면 턴 끝에 버림
    const hpStart = new Map<number, number>()
    const hpSteps = new Map<number, HpStep[]>()
    for (const i of s.sides.opp.active) {
      if (i == null || isFainted('opp', i)) continue
      const v = mon('opp', i).hp
      if (fullOpp.has(i) ? v >= 100 : Math.abs(v - Math.round(v)) < 1e-9) {
        hpStart.set(i, Math.round(v))
        hpSteps.set(i, [])
      }
    }
    for (const side of sides) {
      for (const idx of s.sides[side].active) {
        if (idx == null || isFainted(side, idx)) continue
        const m = mon(side, idx)
        if (m.status === 'tox') m.toxicTurn += 1
        const r = resolveAt(side, idx)
        const max = r?.stats.hp || 0
        const dmg = statusDamage(max, m.status, r?.ability, m.toxicTurn)
        const log = side === 'opp' ? hpSteps.get(idx) : undefined
        if (dmg) {
          log?.push({ status: m.status, ability: r?.ability || '', toxicTurn: m.toxicTurn })
          m.hp =
            side === 'mine' ? Math.max(0, m.hp - dmg) : Math.max(0, m.hp - (dmg / (max || 1)) * 100)
        }
        // 가속: 이번 턴에 나온 포켓몬은 제외
        if (r?.ability === 'speedboost' && m.hp > 0 && m.enteredTurn < s.turn)
          statChange(side, idx, 'spe', 1)
        // 꼬르륵스위치(모르페코): 턴이 끝날 때마다 배부른모양 ↔ 배고픈모양 (변신 중이면 그대로)
        if (r?.ability === 'hungerswitch' && m.hp > 0 && !m.transform) m.alt = !m.alt
        // 턴 끝 회복·데미지 (먹다남은음식·그래스필드·씨뿌리기 등)
        if (m.hp > 0) applyResidual(side, idx, log)
        checkBerry(side, idx)
        // 하품: 걸린 다음 턴이 끝날 때까지 필드에 있으면 잠듦 (교체하면 졸음이 풀림)
        if (m.volatiles.yawn) {
          if (m.volatiles.yawn >= 2) {
            delete m.volatiles.yawn
            if (m.hp > 0) inflictStatus(side, idx, 'slp')
          } else m.volatiles.yawn = 2
        }
        // 멸망의노래: 카운트가 1 줄고 0 이 되면 쓰러짐
        if (m.volatiles.perishsong) {
          const left = m.volatiles.perishsong - 1
          if (left > 0) m.volatiles.perishsong = left
          else {
            delete m.volatiles.perishsong
            m.hp = 0
          }
        }
        // 반동·게으름: 쓴 턴 끝에 2 (다음 턴 행동 불가), 그 턴이 끝나면 풀림
        for (const k of LOAF_VOLATILES) {
          if (!m.volatiles[k]) continue
          if (m.volatiles[k] >= 2) delete m.volatiles[k]
          else m.volatiles[k] = 2
        }
        for (const [k, turn] of Object.entries(m.volatiles)) {
          const total = VOLATILE_DURATION[k]
          if (total == null) continue
          if (turn + 1 > total) delete m.volatiles[k]
          else m.volatiles[k] = turn + 1
        }
      }
    }

    // 5b. 희망사항: 쓴 다음 턴 끝에 그 칸의 포켓몬 회복 (회복봉인이면 없음)
    for (const side of sides) {
      const w = s.sides[side].wishes
      if (!w) continue
      for (const [k, v] of Object.entries(w)) {
        if (v.turn >= s.turn) continue
        delete w[+k]
        const i = s.sides[side].active[+k]
        if (i != null && !isFainted(side, i) && !mon(side, i).volatiles.healblock)
          healHp(side, i, v.hp)
      }
    }

    // 6. 날씨 / 필드 / 공간 / 벽 경과
    const tick = (c: Counter, end: () => void) => {
      c.cur += 1
      if (c.cur >= c.total) end()
    }
    if (s.weather.key && !s.weather.permanent) tick(s.weather, clearWeather)
    if (s.terrain.key) tick(s.terrain, () => Object.assign(s.terrain, { key: '', cur: 0 }))
    for (const [k, c] of Object.entries(s.rooms)) tick(c, () => delete s.rooms[k])
    for (const side of sides)
      for (const [k, c] of Object.entries(s.sides[side].screens))
        tick(c, () => delete s.sides[side].screens[k])
    if (s.fairyLock > 0) s.fairyLock -= 1

    // 7. 입력값 초기화
    for (const side of sides) {
      s.actions[side].forEach((a, slot) => {
        if (a.kind === 'switch' || s.sides[side].active[slot] !== activeAtMoves[side][slot])
          Object.assign(a, newAction(), { target: a.target })
        a.amount = null
        a.allyAmount = null
        a.amount2 = null
        a.crit = false
        a.missed = false
        a.drainAfter = null
        a.selfSwitch = null
        a.foeSwitch = null
        a.inflicts = []
        a.inflicts2 = []
        a.contactInflicts = []
        a.useMega = false
        // 잠듦·얼음이면 다음 턴 기본값은 행동 불가 (깨어나서 기술을 쓰면 직접 "기술 사용"으로), 반동·게으름이면 행동 불가(기타)
        const ui = s.sides[side].active[slot]
        const st = ui != null ? mon(side, ui).status : ''
        // 잠듦·얼음: 다음 시도에 반드시 풀리면(잠듦·얼음 3번째 턴) 기본값은 기술 사용
        const sure = ui != null && (wakeChance(side, ui) ?? 0) >= 100
        if (a.kind !== 'switch' && (st === 'slp' || st === 'frz') && !sure)
          Object.assign(a, { kind: 'cant', cantReason: st })
        else if (
          a.kind !== 'switch' &&
          ui != null &&
          LOAF_VOLATILES.some((k) => mon(side, ui).volatiles[k])
        )
          Object.assign(a, { kind: 'cant', cantReason: 'other' })
        else if (a.kind === 'cant') a.kind = 'move'
      })
    }
    // 상대 HP 는 게임 화면처럼 정수 % 로 맞춘다 (게임은 버림 표시 — utils/hpDisplay). 턴 끝 회복·반동 등은
    // 최대 HP(추정 범위의 가운데) 기준으로 실수치를 거쳐 계산해서 소수가 남는다(59% + 먹다남은음식 → 64.8%).
    //   화면 p% 는 실제 [p, p+1)% 라 계산은 p 에서 시작했어도 실제는 평균 p+0.5 → 반올림(= p+0.5 를 버림)
    //   단, 턴 시작에 가득 차 있었고 화면 % 를 입력한 적이 없으면 실제 값 그대로 → 버림 (100% − 5.96% → 94%)
    // 남아 있으면 최소 1%
    // 턴 끝 HP 변화가 기록한 비율만으로 설명되는지 (추정 최대 HP 로 다시 계산해 지금 값과 같으면)
    const explained = (i: number) => {
      const steps = hpSteps.get(i)
      const max = maxHp('opp', i)
      if (!steps?.length || !max) return false
      let v = hpStart.get(i)!
      for (const st of steps) {
        if (v <= 0) break
        const d =
          'frac' in st
            ? Math.sign(st.frac) * Math.max(1, Math.floor(max * Math.abs(st.frac)))
            : -statusDamage(max, st.status, st.ability, st.toxicTurn)
        v = Math.max(0, Math.min(100, v + (d * 100) / max))
      }
      return Math.abs(v - mon('opp', i).hp) < 1e-6
    }
    const checks = new Map<number, Omit<HpCheck, 'turn' | 'predicted'>>()
    for (const i of hpStart.keys())
      if (explained(i)) checks.set(i, { start: hpStart.get(i)!, steps: hpSteps.get(i)! })
    s.sides.opp.mons.forEach((m, i) => {
      if (m.hp <= 0) return
      const shown = fullOpp.has(i) ? Math.floor(m.hp + 1e-9) : Math.round(m.hp)
      m.hp = Math.min(100, Math.max(1, shown))
    })
    s.observedOrder = 'unknown' // 선후공 관찰은 턴마다 새로
    s.entryObs = {}
    s.turn += 1
    s.sides.opp.mons.forEach((m, i) => {
      const c = checks.get(i)
      m.hpCheck = c ? { ...c, turn: s.turn, predicted: m.hp } : null
    })
  }

  return {
    canUndo,
    undo,
    executeTurn,
  }
}

export type BattleTurn = ReturnType<typeof createTurn>
