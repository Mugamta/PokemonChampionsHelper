// composables/battle/moves.ts
// 기술을 쓴 결과: 기술 효과 자동 반영(랭크·상태이상·날씨·필드·벽·설치기·매직미러·대타), 기술의 HP 효과(회복기·HP 소모·자기 기절),
// 맞은 직후(도구 소모·맞았을 때 특성), 공격한 쪽 HP 변화(반동·생명의구슬·접촉 데미지), 흡수 특성, 배분 추정 관측 기록.

import { critChance } from '~/utils/accuracy'
import { hasSecondary, hitInfo, RESIST_BERRIES, type DamageOptions } from '~/utils/damage'
import { holdsOnAtFull } from '~/utils/ko'
import { applyBoost, highestStat } from '~/utils/stats'
import { drainLostRange } from '~/utils/statInference'
import type { MoveEffect, RankKey } from '~/utils/types'
import {
  BASE_TURNS,
  EXTENDED_TURNS,
  HAZARD_MAX,
  SCREEN_TURNS,
  SCREENS,
  THAW_MOVES,
  zeroBoosts,
  type ActionState,
  type BattleSide,
  type StatObservation,
} from '~/utils/battleState'
import type { BattleCore } from '~/composables/battle/core'
import type { BattleQueries } from '~/composables/battle/queries'
import type { BattleField } from '~/composables/battle/field'
import type { BattleHp } from '~/composables/battle/hp'

export function createMoves(b: BattleCore & BattleQueries & BattleField & BattleHp) {
  const {
    gd,
    calc,
    state,
    mon,
    resolveAt,
    maxHp,
    isFainted,
    realHp,
    heldItem,
    guessedItem,
    quarterHp,
    behindSub,
    statusBlocked,
    combatantOf,
    fieldFor,
    allyOf,
    attackOpts,
    attractable,
    replaceOptions,
    drainAfterOf,
    setWeather,
    setTerrain,
    statChange,
    whiteHerb,
    loseHp,
    healHp,
    checkBerry,
    absorbHeal,
    inflictStatus,
    inflictYawn,
  } = b

  // 기술 자체의 HP 효과 (회복기·HP 소모·자기 기절·아픔나누기·힘흡수·희망사항 등). hitTargets: 맞은 상대 칸,
  // hit: 기술이 나갔는지 (빗나감·실패면 false), blocked: 대타에 막힌 상대
  const WEATHER_HEAL = new Set(['synthesis', 'morningsun', 'moonlight'])
  function hpMoveEffects(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    hitTargets: number[],
    hit: boolean,
    blocked: (tIdx: number) => boolean,
  ) {
    const s = state.value!
    const move = gd.move(moveId)
    const r = resolveAt(side, userIdx)
    if (!move || !r) return
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const um = mon(side, userIdx)
    const max = maxHp(side, userIdx)
    const cur = realHp(side, userIdx, um.hp)
    const slot = s.sides[side].active.indexOf(userIdx)
    const faint = () => (um.hp = 0)
    // 쓰기만 하면 (빗나가도): 철제광선 최대 HP 1/2(반올림, 매직가드 제외), 대폭발·자폭은 쓰러짐
    if (moveId === 'steelbeam' && r.ability !== 'magicguard')
      loseHp(side, userIdx, Math.round(max / 2))
    // 습기가 필드에 있으면 대폭발·자폭은 실패 (틀깨기면 무시)
    const damp = (['mine', 'opp'] as const).some((sd) =>
      s.sides[sd].active.some(
        (i) => i != null && !isFainted(sd, i) && resolveAt(sd, i)?.ability === 'damp',
      ),
    )
    if (
      (moveId === 'explosion' || moveId === 'selfdestruct') &&
      (!damp || r.ability === 'moldbreaker')
    )
      faint()
    if (!hit) return
    // 회복기: HP회복·날개쉬기 등 1/2, 생명의물방울 1/4 (아군도), 광합성·아침햇살·달의불빛은 날씨에 따라,
    // 꿀꺽은 비축 수에 따라 (1 → 1/4, 2 → 1/2, 3 → 전부). 회복봉인이면 없음
    const healEff = move.effects.find((e) => e.type === 'heal')
    let ratio = healEff?.type === 'heal' ? healEff.ratio : 0
    if (WEATHER_HEAL.has(moveId)) {
      const w = fieldFor(side, userIdx).weather ?? ''
      ratio = w === 'sun' || w === 'harshsun' ? 2 / 3 : w ? 1 / 4 : 1 / 2
    }
    if (moveId === 'swallow') ratio = [0, 1 / 4, 1 / 2, 1][um.volatiles.stockpile || 0] ?? 0
    if (ratio) {
      const ally = moveId === 'lifedew' ? allyOf(side, slot) : null
      for (const i of [userIdx, ally]) {
        if (i == null || isFainted(side, i) || mon(side, i).volatiles.healblock) continue
        healHp(side, i, Math.round(maxHp(side, i) * ratio))
      }
    }
    // 치유파동: 대상 1/2 (메가런처 3/4)
    if (moveId === 'healpulse')
      for (const tIdx of hitTargets)
        if (!mon(foe, tIdx).volatiles.healblock)
          healHp(
            foe,
            tIdx,
            Math.round(maxHp(foe, tIdx) * (r.ability === 'megalauncher' ? 0.75 : 0.5)),
          )
    // HP 소모: 배수의진 1/2 → 공격 최대 (HP 가 1/2 이하이거나 이미 최대면 실패), 스케일노이즈 1/3 (1/3 이하면 실패),
    // 저주(고스트 타입) 1/2 → 대상 저주. 고스트가 아니면 공격·방어 +1, 스피드 −1
    if (moveId === 'bellydrum') {
      const cost = Math.floor(max / 2)
      if (cur > cost && um.boosts.atk < 6) {
        loseHp(side, userIdx, cost)
        statChange(side, userIdx, 'atk', 12)
      }
    }
    if (moveId === 'clangoroussoul' && cur > Math.floor(max / 3))
      loseHp(side, userIdx, Math.floor(max / 3))
    if (moveId === 'curse') {
      if (r.species.types.includes('ghost')) {
        const tIdx = hitTargets[0]
        if (tIdx != null && !mon(foe, tIdx).volatiles.curse) {
          loseHp(side, userIdx, Math.floor(max / 2))
          mon(foe, tIdx).volatiles.curse = 1
        }
      } else {
        statChange(side, userIdx, 'atk', 1, undefined, true)
        statChange(side, userIdx, 'def', 1, undefined, true)
        statChange(side, userIdx, 'spe', -1)
      }
    }
    // 아픔나누기: 둘의 HP 합의 절반으로 (대타면 실패). 상대 HP 는 추정 최대 HP 기준
    if (moveId === 'painsplit')
      for (const tIdx of hitTargets) {
        if (blocked(tIdx)) continue
        const t = mon(foe, tIdx)
        const avg = Math.floor((cur + realHp(foe, tIdx, t.hp)) / 2)
        const set = (sd: BattleSide, i: number) => {
          const mx = maxHp(sd, i)
          mon(sd, i).hp = sd === 'mine' ? Math.min(mx, avg) : Math.min(100, (avg / (mx || 1)) * 100)
        }
        set(side, userIdx)
        set(foe, tIdx)
        checkBerry(side, userIdx)
        checkBerry(foe, tIdx)
      }
    // 힘흡수: 대상의 공격 실능치(랭크 반영)만큼 회복하고 대상 공격 −1 (이미 −6 이거나 대타면 실패)
    if (moveId === 'strengthsap')
      for (const tIdx of hitTargets) {
        const t = mon(foe, tIdx)
        if (blocked(tIdx) || (t.boosts.atk ?? 0) <= -6) continue
        const atk = applyBoost(resolveAt(foe, tIdx)?.stats.atk ?? 0, t.boosts.atk ?? 0)
        statChange(foe, tIdx, 'atk', -1, [side, userIdx])
        absorbHeal(side, userIdx, foe, tIdx, atk)
      }
    // 희망사항: 다음 턴 끝에 이 칸의 포켓몬이 쓴 포켓몬 최대 HP 1/2 회복 (이미 걸려 있으면 실패)
    if (moveId === 'wish' && slot >= 0) {
      const w = (s.sides[side].wishes ??= {})
      if (!w[slot]) w[slot] = { turn: s.turn, hp: Math.floor(max / 2) }
    }
    // 자기 기절: 추억의선물·목숨던지기 (맞혔을 때), 치유소원 (교체할 포켓몬이 있을 때 → 다음에 나오는 포켓몬 전부 회복)
    if ((moveId === 'memento' || moveId === 'finalgambit') && hitTargets.length) faint()
    if (moveId === 'healingwish' && replaceOptions(side).length && slot >= 0) {
      faint()
      const hw = (s.sides[side].healingWish ??= [])
      if (!hw.includes(slot)) hw.push(slot)
    }
  }

  // ── 공격한 쪽 HP 변화 ─────────────
  // 기술을 쓴 뒤 (맞힌 데미지 합 dealt, 실수치): 반동(돌머리·매직가드 제외, 반올림 최소 1) → 생명의구슬(최대 HP 1/10,
  // 매직가드·우격다짐으로 부가효과가 없어진 기술 제외) → 조개껍질방울(1/8 회복, 회복봉인 제외)
  function afterAttack(moveId: string, side: BattleSide, userIdx: number, dealt: number) {
    const move = gd.move(moveId)
    const r = resolveAt(side, userIdx)
    if (!move || !r || dealt <= 0 || isFainted(side, userIdx)) return
    const ab = r.ability
    const recoil = move.effects.find((e) => e.type === 'recoil')
    if (recoil?.type === 'recoil' && ab !== 'rockhead' && ab !== 'magicguard')
      loseHp(side, userIdx, Math.max(1, Math.round(dealt * recoil.ratio)))
    const item = heldItem(side, userIdx)
    const max = maxHp(side, userIdx)
    if (
      item === 'lifeorb' &&
      ab !== 'magicguard' &&
      !(ab === 'sheerforce' && hasSecondary(move)) &&
      !isFainted(side, userIdx)
    )
      loseHp(side, userIdx, Math.max(1, Math.floor(max / 10)))
    if (item === 'shellbell' && !mon(side, userIdx).volatiles.healblock)
      healHp(side, userIdx, Math.max(1, Math.floor(dealt / 8)))
  }
  // 맞은 쪽 때문에 공격한 쪽이 잃는 HP: 접촉이면 까칠한피부 1/8·울퉁불퉁멧 1/6 (타수만큼, 가변 타수는 1타로),
  // 쓰러뜨리면 유폭(접촉) 1/4·내용물분출(맞기 전 HP 만큼). 매직가드면 없음
  function hitPunish(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    foe: BattleSide,
    tIdx: number,
    hpBefore: number,
  ) {
    const move = gd.move(moveId)
    const ur = resolveAt(side, userIdx)
    const tr = resolveAt(foe, tIdx)
    if (!move || !ur || !tr || isFainted(side, userIdx) || ur.ability === 'magicguard') return
    const max = maxHp(side, userIdx)
    const fainted = hpBefore > 0 && mon(foe, tIdx).hp <= 0
    let lose = 0
    if (move.flags.includes('contact')) {
      const atkC = combatantOf(side, userIdx, undefined, true)
      const info = atkC ? hitInfo(move, atkC, false) : null
      const hits = info && info.min === info.max ? info.max : 1
      if (tr.ability === 'roughskin' || tr.ability === 'ironbarbs')
        lose += Math.floor(max / 8) * hits
      if (heldItem(foe, tIdx) === 'rockyhelmet') lose += Math.floor(max / 6) * hits
      if (tr.ability === 'aftermath' && fainted) lose += Math.floor(max / 4)
    }
    if (tr.ability === 'innardsout' && fainted) lose += realHp(foe, tIdx, hpBefore)
    loseHp(side, userIdx, lose)
  }
  // 흡수 특성: 저수·건조피부(물), 축전(전기), 흙먹기(땅) 타입 기술을 맞으면 데미지 대신 최대 HP 1/4 회복
  const ABSORB_TYPE: Record<string, string> = {
    waterabsorb: 'water',
    dryskin: 'water',
    voltabsorb: 'electric',
    eartheater: 'ground',
  }
  function absorbAbility(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    foe: BattleSide,
    tIdx: number,
  ) {
    const tr = resolveAt(foe, tIdx)
    const want = tr ? ABSORB_TYPE[tr.ability] : undefined
    if (!want || isFainted(foe, tIdx) || mon(foe, tIdx).volatiles.healblock) return
    const atkC = combatantOf(side, userIdx, undefined, true)
    const defC = combatantOf(foe, tIdx)
    const c = atkC && defC ? calc.cell(moveId, atkC, defC, fieldFor(foe, tIdx)) : null
    if (c?.immune && c.type === want) healHp(foe, tIdx, Math.floor(maxHp(foe, tIdx) / 4))
  }

  const THAWS_TARGET = (moveId: string) => {
    const mv = gd.move(moveId)
    return !!mv && mv.category !== 'status' && (mv.type === 'fire' || THAW_MOVES.has(moveId))
  }

  // 기술의 효과 자동 반영. targets: 맞은 상대 칸들 (광역기면 여럿), hit: 기술이 맞았는지 (빗나감·실패·데미지 0 이면 false)
  //   랭크 변화·상태이상·혼란: 확정 효과와 확률 100% 부가효과만 (나머지 확률 효과는 "이번 턴 확률 효과"로 보여 주고 직접 입력)
  //   공격기의 효과는 맞혔을 때만, 상성상 무효인 상대에게는 없음. 부가효과는 우격다짐이면 없음, 맞는 쪽 인분이면 막음
  //   변화기는 황금몸이 막음. 반사 가능한 변화기는 매직미러가 쓴 쪽에게 되돌림 (틀깨기면 되돌리지 않음)
  function applyMoveEffects(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    targetIdx: number | null,
    targets: number[] = targetIdx == null ? [] : [targetIdx],
    hit = true,
  ) {
    const move = gd.move(moveId)
    if (!move) return
    const s = state.value!
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const user = resolveAt(side, userIdx)
    const damaging = move.category !== 'status'
    // 맞은 상대 (공격기는 상성 무효 제외, 변화기는 황금몸 제외)
    const hitTargets = !hit
      ? []
      : targets.filter((tIdx) => {
          const tr = resolveAt(foe, tIdx)
          if (!damaging) return tr?.ability !== 'goodasgold' || move.target === 'self'
          const atkC = combatantOf(side, userIdx, undefined, true)
          const defC = combatantOf(foe, tIdx)
          const c = atkC && defC ? calc.cell(moveId, atkC, defC, fieldFor(foe, tIdx)) : null
          return !c?.immune
        })
    // 매직미러: 이 상대 칸이 되돌리는지 / 상대 필드에 거는 기술(스텔스록 등)을 되돌리는지
    const reflectable =
      !damaging && move.flags.includes('reflectable') && user?.ability !== 'moldbreaker'
    const bounces = (tIdx: number) => reflectable && resolveAt(foe, tIdx)?.ability === 'magicbounce'
    const sideBounced = s.sides[foe].active.some(
      (i) => i != null && !isFainted(foe, i) && bounces(i),
    )
    // 대타: 상대에게 거는 효과(랭크 하락·상태이상·혼란·씨뿌리기·하품, 공격기 부가효과)를 막음 (매직미러로 되돌린 건 제외)
    const blocked = (tIdx: number) => !bounces(tIdx) && behindSub(side, userIdx, foe, tIdx, moveId)
    for (const e of move.effects as MoveEffect[]) {
      if (e.type === 'boost' || e.type === 'status' || e.type === 'volatile') {
        const chance = 'chance' in e ? e.chance : undefined
        if (chance && chance < 100) continue
        if (chance && user?.ability === 'sheerforce') continue
        const onSelf = e.target === 'self'
        // 공격기: 자기 효과(니트로차지 등)는 하나라도 맞혔을 때, 상대 효과는 맞은 상대에게
        if (damaging && !hitTargets.length) continue
        if (!damaging && !hit) continue
        // [받는 쪽, 칸, 건 쪽(상대가 내린 랭크면)] — 매직미러면 쓴 쪽이 받고 건 쪽은 매직미러 포켓몬
        const list: [BattleSide, number, [BattleSide, number] | undefined][] = onSelf
          ? [[side, userIdx, undefined]]
          : hitTargets
              .filter((tIdx) => !blocked(tIdx))
              .map((tIdx) =>
                bounces(tIdx) ? [side, userIdx, [foe, tIdx]] : [foe, tIdx, [side, userIdx]],
              )
        for (const [tSide, tIdx, src] of list) {
          if (!onSelf && chance && resolveAt(foe, tIdx)?.ability === 'shielddust') continue
          if (e.type === 'boost') {
            for (const [k, v] of Object.entries(e.stats)) {
              if (k in zeroBoosts()) statChange(tSide, tIdx, k as RankKey, v || 0, src, true)
            }
            whiteHerb(tSide, tIdx)
          } else if (e.type === 'status') inflictStatus(tSide, tIdx, e.status)
          else if (e.type === 'volatile' && e.status !== 'flinch') {
            // 혼란·도발·앙코르·트집·사슬묶기·헤롱헤롱·회복봉인·조이기류·문어굳히기·소금절이 (이미 걸렸으면 그대로)
            // 마이페이스는 혼란, 둔감은 도발·헤롱헤롱 무효
            const tm = mon(tSide, tIdx)
            const ab = resolveAt(tSide, tIdx)?.ability
            // 헤롱헤롱은 서로 다른 성별일 때만 (성별을 모르면 자동으로 걸지 않고 행동 아래 체크로)
            const other = src ?? [side, userIdx]
            const immune =
              (e.status === 'confusion' && ab === 'owntempo') ||
              ((e.status === 'taunt' || e.status === 'attract') && ab === 'oblivious') ||
              (e.status === 'attract' && attractable(other[0], other[1], tSide, tIdx) !== 'yes')
            if (!tm.volatiles[e.status] && !immune) tm.volatiles[e.status] = 1
          }
        }
      } else if (e.type === 'weather' && !s.weather.permanent)
        setWeather(e.key, { item: user?.slot.item, by: [side, userIdx] })
      else if (e.type === 'terrain') setTerrain(e.key, user?.slot.item, [side, userIdx])
      else if (e.type === 'room') s.rooms[e.key] = { cur: 0, total: BASE_TURNS }
      else if (e.type === 'side') {
        const sd = s.sides[e.side === 'self' || (e.side === 'foe' && sideBounced) ? side : foe]
        if (SCREENS.has(e.key)) {
          const ext =
            (e.key === 'reflect' || e.key === 'lightscreen' || e.key === 'auroraveil') &&
            user?.slot.item === 'lightclay'
          sd.screens[e.key] = {
            cur: 0,
            total: ext ? EXTENDED_TURNS : (SCREEN_TURNS[e.key] ?? BASE_TURNS),
          }
        } else
          sd.hazards[e.key] = Math.min(
            e.maxStack ?? HAZARD_MAX[e.key] ?? 1,
            (sd.hazards[e.key] || 0) + 1,
          )
      } else if (e.type === 'recharge' && hitTargets.length) {
        // 빗나가거나 무효면 반동 없음
        mon(side, userIdx).volatiles.mustrecharge = 1
      }
    }
    if (moveId === 'haze')
      for (const sd of Object.values(s.sides))
        for (const i of sd.active) if (i != null) sd.mons[i]!.boosts = zeroBoosts()
    if (moveId === 'fairylock') s.fairyLock = 2
    // 씨뿌리기: 맞은 상대에게 (풀 타입·이미 심어짐이면 실패, 매직미러면 쓴 쪽에게). 턴 끝에 1/8 흡수
    if (moveId === 'leechseed')
      for (const tIdx of hitTargets) {
        if (blocked(tIdx)) continue
        const bounce = bounces(tIdx)
        const [tSide, tI, fromSide] = bounce ? [side, userIdx, foe] : [foe, tIdx, side]
        const tm = mon(tSide, tI)
        if (tm.volatiles.leechseed || resolveAt(tSide, tI)?.species.types.includes('grass'))
          continue
        tm.volatiles.leechseed = 1
        const fromIdx = bounce ? tIdx : userIdx
        tm.seedFrom = Math.max(0, s.sides[fromSide].active.indexOf(fromIdx))
      }
    if (moveId === 'ingrain' || moveId === 'aquaring') mon(side, userIdx).volatiles[moveId] = 1
    // 하품: 맞은 상대를 졸음으로 (매직미러면 쓴 쪽에게 되돌아감)
    if (moveId === 'yawn')
      for (const tIdx of hitTargets) {
        if (blocked(tIdx)) continue
        if (bounces(tIdx)) inflictYawn(side, userIdx)
        else inflictYawn(foe, tIdx)
      }
    if (moveId === 'chillyreception')
      setWeather('snow', { item: user?.slot.item, by: [side, userIdx] })

    const um = mon(side, userIdx)
    hpMoveEffects(moveId, side, userIdx, hitTargets, hit, blocked)
    // 잠자기: HP 를 모두 회복하고 2턴 잠듦 (다른 상태이상은 풀림). HP 가 가득이거나 이미 잠듦·잠들 수 없으면 실패
    if (moveId === 'rest' && hit && um.status !== 'slp') {
      const max = side === 'mine' ? maxHp(side, userIdx) : 100
      const prev = um.status
      um.status = ''
      const blockedSleep = statusBlocked(side, userIdx, 'slp')
      um.status = prev
      if (um.hp < max && !blockedSleep)
        Object.assign(um, { hp: max, status: 'slp', toxicTurn: 0, restSleep: true })
    }
    // 대타출동: 최대 HP 1/4 를 깎아 대타 (HP 가 1/4 이하이거나 이미 대타면 실패)
    if (moveId === 'substitute' && hit && !um.volatiles.substitute) {
      const q = quarterHp(side, userIdx)
      if (um.hp > q) {
        um.hp -= q
        um.volatiles.substitute = q
      }
    }
    // 꼬리자르기: 최대 HP 1/2(올림)를 깎아 대타를 만듦 → 교체로 나오는 포켓몬이 대타를 받음 (교체 처리에서)
    if (moveId === 'shedtail' && hit && !um.volatiles.substitute) {
      const cost = side === 'mine' ? Math.ceil(maxHp(side, userIdx) / 2) : 50
      if (um.hp > cost) {
        um.hp -= cost
        um.volatiles.substitute = quarterHp(side, userIdx)
      }
    }
    // 멸망의노래: 필드의 모든 포켓몬이 카운트 3 (턴 끝마다 줄고 0 이면 쓰러짐). 방음은 쓴 포켓몬이 아니면 무효
    if (moveId === 'perishsong' && hit)
      for (const sd of ['mine', 'opp'] as const)
        for (const i of s.sides[sd].active) {
          if (i == null || isFainted(sd, i) || mon(sd, i).volatiles.perishsong) continue
          if (!(sd === side && i === userIdx) && resolveAt(sd, i)?.ability === 'soundproof')
            continue
          mon(sd, i).volatiles.perishsong = 4
        }
    // 전자부유: 5턴 동안 땅에 있지 않음 (뿌리박기·중력이면 실패)
    if (
      moveId === 'magnetrise' &&
      hit &&
      !um.volatiles.magnetrise &&
      !um.volatiles.ingrain &&
      !s.rooms.gravity
    )
      um.volatiles.magnetrise = 1
    // 소란: 3턴. 그동안 아무도 잠들지 않고 잠든 포켓몬은 깨어남 (방음 제외)
    if (moveId === 'uproar' && hitTargets.length && !um.volatiles.uproar) {
      um.volatiles.uproar = 1
      for (const sd of ['mine', 'opp'] as const)
        for (const i of s.sides[sd].active) {
          if (i == null || mon(sd, i).status !== 'slp') continue
          if (resolveAt(sd, i)?.ability !== 'soundproof')
            Object.assign(mon(sd, i), { status: '', toxicTurn: 0 })
        }
    }
  }

  // 데미지를 받은 직후 (입력한 데미지가 있을 때만). hpBefore 는 받기 전 HP (mine: 실수치, opp: %)
  //   도구: 반감열매(해당 타입 효과굉장, 노말은 그냥) / 풍선 / 기합의띠(만피에서 HP 1. 상대는 100% → 1% 이하로 남으면,
  //     도구를 확정하지 않았어도 추측 도구가 기합의띠면 확정하고 소모)
  //   맞은 쪽 특성: 분노의경혈(급소에 맞고 버티면 공격 +6) 지구력(방어+1) 깨어진갑옷(물리: 방어−1 스피드+2) 정의의마음(악: 공격+1) 열교환(불꽃: 공격+1)
  //     발끈(HP 절반 이하로: 특공+1) 모래뿜기(모래바람) 넘치는씨(그래스필드) 전기로바꾸기(충전) 독치장(물리: 공격 측에 독압정)
  //   공격한 쪽: 자기과신(쓰러뜨리면 공격+1)
  function onHit(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    tSide: BattleSide,
    targetIdx: number,
    hpBefore: number,
    crit = false, // 입력에서 급소 체크 (반드시 급소인 경우는 아래에서 판정)
  ) {
    const t = mon(tSide, targetIdx)
    const r = resolveAt(tSide, targetIdx)
    const move = gd.move(moveId)
    const atk = combatantOf(side, userIdx, undefined, true)
    const def = combatantOf(tSide, targetIdx)
    const c = atk && def && move ? calc.cell(moveId, atk, def, fieldFor(tSide, targetIdx)) : null
    if (!r || !move || !c || c.immune) return
    const full = tSide === 'mine' ? maxHp(tSide, targetIdx) : 100
    const alive = t.hp > 0
    const item = t.itemGone ? '' : r.slot.item
    if (item && RESIST_BERRIES[item] === c.type && (c.effectiveness > 1 || c.type === 'normal'))
      t.itemGone = true
    else if (item === 'airballoon') t.itemGone = true
    else if (item === 'focussash' && tSide === 'mine' && hpBefore >= full && t.hp === 1)
      t.itemGone = true
    else if (tSide === 'opp' && hpBefore >= full && t.hp > 0 && t.hp <= 1) {
      const sash = item === 'focussash' || (!item && guessedItem(targetIdx) === 'focussash')
      if (sash && !t.itemGone) {
        if (!t.itemKnown) Object.assign(t, { item: 'focussash', itemKnown: true })
        t.itemGone = true
      }
    }

    const ab = r.ability
    const physical = move.category === 'physical'
    // 탈(따라큐): 공격을 한 번 받으면 풀린 모습으로 (틀깨기 공격이면 탈은 그대로)
    if (ab === 'disguise' && !t.alt && atk?.ability !== 'moldbreaker') t.alt = true
    if (alive) {
      if (
        ab === 'angerpoint' &&
        (crit ||
          (!!atk && !!def && critChance(move, atk, def, attackOpts(side, userIdx, moveId)) >= 1))
      )
        t.boosts.atk = 6
      if (ab === 'stamina') statChange(tSide, targetIdx, 'def', 1)
      if (ab === 'weakarmor' && physical) {
        statChange(tSide, targetIdx, 'def', -1)
        statChange(tSide, targetIdx, 'spe', 2)
      }
      if (ab === 'justified' && c.type === 'dark') statChange(tSide, targetIdx, 'atk', 1)
      if (ab === 'thermalexchange' && c.type === 'fire') statChange(tSide, targetIdx, 'atk', 1)
      if (ab === 'berserk' && hpBefore * 2 > full && t.hp * 2 <= full)
        statChange(tSide, targetIdx, 'spa', 1)
      if (ab === 'electromorphosis') t.volatiles.charge = 1
    }
    if (ab === 'sandspit' && !state.value!.weather.permanent)
      setWeather('sand', { item, by: [tSide, targetIdx] })
    if (ab === 'seedsower') setTerrain('grassy', item, [tSide, targetIdx])
    if (ab === 'toxicdebris' && physical && side !== tSide) {
      const hz = state.value!.sides[side].hazards
      hz.toxicspikes = Math.min(2, (hz.toxicspikes || 0) + 1)
    }
    if (!alive && side !== tSide) {
      const u = resolveAt(side, userIdx)
      if (u?.ability === 'moxie') statChange(side, userIdx, 'atk', 1)
      // 천정부지(메가저리더프): 가장 높은 능력 +1
      if (u?.ability === 'eelevate') statChange(side, userIdx, highestStat(u.stats), 1)
    }
  }

  // ── 상대 배분 추정용 관측 ─────────────
  // 상대 실능치만으로 설명할 수 없는 기술은 제외 (상대 공격·방어를 쓰는 기술, 고정 데미지, 스피드 의존, 조건부 위력)
  const UNESTIMABLE = new Set([
    'foulplay',
    'bodypress',
    'shellsidearm',
    'gyroball',
    'electroball',
    'seismictoss',
    'nightshade',
    'superfang',
    'ruination',
    'finalgambit',
    'endeavor',
    'counter',
    'mirrorcoat',
    'metalburst',
    'comeuppance',
    'beatup',
    'spitup',
    'ficklebeam',
    'assurance',
    'stompingtantrum',
    'temperflare',
    'lashout',
    'round',
  ])
  function recordObservation(
    side: BattleSide,
    a: ActionState,
    userIdx: number,
    foe: BattleSide,
    targetIdx: number,
    opts: DamageOptions,
  ) {
    const move = gd.move(a.move)
    if (!move || move.category === 'status' || UNESTIMABLE.has(a.move) || !a.amount) return
    const oppIdx = side === 'mine' ? targetIdx : userIdx
    const mineIdx = side === 'mine' ? userIdx : targetIdx
    if (side === 'mine' && foe !== 'opp') return
    const om = mon('opp', oppIdx)
    const mm = mon('mine', mineIdx)
    if (om.transform) return // 변신한 상대의 실능치는 내 포켓몬에서 복사한 값
    // 연속기는 맞은 횟수를 알 수 없어 제외
    const atkC = combatantOf(side, userIdx, undefined, true)
    if (!atkC || hitInfo(move, atkC, !!opts.spread).max > 1) return
    // 탈이 막은 공격은 최대 HP 1/8 고정이라 실능치와 무관
    const tm = mon(foe, targetIdx)
    if (
      resolveAt(foe, targetIdx)?.ability === 'disguise' &&
      !tm.alt &&
      atkC.ability !== 'moldbreaker'
    )
      return
    // 쓰러뜨렸으면 알 수 있는 건 "남은 HP 이상" 뿐 → 입력값이 남은 HP 보다 커도 남은 HP 로 기록
    const left = side === 'mine' ? om.hp : mm.hp
    // 내 포켓몬이 HP 가득에서 기합의띠·옹골참으로 1 남았으면 이것도 "그 이상" 만 안다
    const defC = side === 'opp' ? combatantOf('mine', mineIdx) : null
    const heldOn = !!defC && holdsOnAtFull(atkC, defC) && a.amount === left - 1
    const ko = a.amount >= left || heldOn
    const obs: StatObservation = {
      kind: side === 'mine' ? 'dealt' : 'taken',
      move: a.move,
      amount: ko && !heldOn ? left : a.amount,
      ko,
      crit: !!a.crit,
      mine: {
        idx: mineIdx,
        megaOn: mm.megaOn,
        alt: mm.alt,
        transform: mm.transform ? { ...mm.transform } : null,
        boosts: { ...mm.boosts },
        status: mm.status,
        hp: mm.hp,
        itemGone: mm.itemGone,
      },
      opp: {
        megaOn: om.megaOn,
        alt: om.alt,
        boosts: { ...om.boosts },
        status: om.status,
        hpPct: om.hp,
        itemGone: om.itemGone,
      },
      field: fieldFor(foe, targetIdx),
      opts,
    }
    // 내 흡수기: 입력한 흡수 후 HP − 지금 HP = 회복량 → 상대가 잃은 실수치 HP 범위 (가득 찼으면 회복량이 잘려서 모름)
    const after = drainAfterOf(side, userIdx, targetIdx, a)
    const eff = move.effects.find((e) => e.type === 'drain')
    if (after != null && eff?.type === 'drain' && after < maxHp('mine', mineIdx)) {
      const bigRoot = heldItem('mine', mineIdx) === 'bigroot'
      const range = drainLostRange(after - mm.hp, eff.ratio, bigRoot)
      if (range) obs.drainLost = range
    }
    om.obs = [...(om.obs ?? []), obs]
  }

  return {
    hpMoveEffects,
    afterAttack,
    hitPunish,
    absorbAbility,
    THAWS_TARGET,
    applyMoveEffects,
    onHit,
    recordObservation,
  }
}

export type BattleMoves = ReturnType<typeof createMoves>
