// composables/battle/hp.ts
// 포켓몬 하나의 상태 변화: 랭크(특성·하양허브 반응 포함), HP 회복·감소(회복 열매), 턴 끝 회복·데미지, 흡수, 상태이상·졸음, PP.

import { isGrounded } from '~/utils/damage'
import type { HpStep } from '~/utils/hpDisplay'
import { clampBoost } from '~/utils/stats'
import type { RankKey, Status } from '~/utils/types'
import { BLOCK_FOE_DROPS, BLOCK_STAT_DROP, type BattleSide } from '~/utils/battleState'
import type { BattleCore } from '~/composables/battle/core'
import type { BattleQueries } from '~/composables/battle/queries'

export function createHp(b: BattleCore & BattleQueries) {
  const {
    gd,
    state,
    mon,
    resolveAt,
    maxHp,
    isFainted,
    realHp,
    heldItem,
    statusBlocked,
    combatantOf,
    fieldFor,
    maxPp,
    ppUsedOf,
  } = b

  // 배틀 중 자동으로 생기는 랭크 변화 (수동 조절 changeBoost 와 구분)
  //   심술꾸러기: 반대로 / source(상대가 내린 경우): 클리어바디류·괴력집게·부풀린가슴 무효, 미러아머 반사,
  //   실제로 내려가면 오기(공격 +2)·승기(특공 +2), 하양허브는 내려간 능력치를 되돌리고 소모
  //   batch: 기술 하나의 여러 능력치 변화를 한꺼번에 처리할 때 (하양허브는 끝난 뒤 whiteHerb 로 한 번만)
  function statChange(
    side: BattleSide,
    idx: number,
    key: RankKey,
    delta: number,
    source?: [BattleSide, number],
    batch = false,
  ) {
    const r = resolveAt(side, idx)
    const m = mon(side, idx)
    const ab = r?.ability || ''
    if (ab === 'contrary') delta = -delta
    if (delta < 0 && source) {
      if (BLOCK_FOE_DROPS.has(ab) || BLOCK_STAT_DROP[ab] === key) return
      if (ab === 'mirrorarmor') return statChange(source[0], source[1], key, delta)
    }
    const before = m.boosts[key] ?? 0
    m.boosts[key] = clampBoost(before + delta)
    if (m.boosts[key]! >= before) return
    m.turnLowered = true
    if (source && ab === 'defiant') statChange(side, idx, 'atk', 2)
    if (source && ab === 'competitive') statChange(side, idx, 'spa', 2)
    if (!batch) whiteHerb(side, idx)
  }
  function whiteHerb(side: BattleSide, idx: number) {
    const m = mon(side, idx)
    if (m.itemGone || resolveAt(side, idx)?.slot.item !== 'whiteherb') return
    const lowered = (Object.keys(m.boosts) as RankKey[]).filter((k) => (m.boosts[k] ?? 0) < 0)
    if (!lowered.length) return
    for (const k of lowered) m.boosts[k] = 0
    m.itemGone = true
  }

  // ── 턴 끝 회복·데미지 ─────────────
  // 상태이상 데미지(독·화상)는 따로. frac: 최대 HP 대비 (+ 회복 / − 데미지).
  //   날씨 특성: 젖은접시(비 +1/16) 아이스바디(설경 +1/16) 건조피부(비 +1/8, 쾌청 −1/8) / 포이즌힐(독 +1/8)
  //   그래스필드(땅에 있음 +1/16) / 도구: 먹다남은음식 +1/16, 검은진흙(독 타입 +1/16, 아니면 −1/8)
  //     — 상대는 도구가 확인됐을 때만 (itemKnown), 도구를 잃었거나 매직룸·서투름이면 없음
  //   아쿠아링·뿌리박기 +1/16 / 씨뿌리기 −1/8 (심은 상대가 그만큼 회복, 해감액이면 그쪽이 데미지)
  //   저주 −1/4 / 악몽(잠듦) −1/4 / 소금절이 −1/16 (물·강철 −1/8)
  //   모래바람 −1/16 (바위·땅·강철, 모래 특성·방진, 방진고글 제외) / 날씨부정·에어록이 필드에 있으면 날씨 효과 없음
  //   회복봉인이면 회복 없음, 매직가드면 데미지 없음
  type Residual = { key: string; frac: number }
  function residualPlan(side: BattleSide, idx: number): Residual[] {
    const s = state.value!
    const m = mon(side, idx)
    const r = resolveAt(side, idx)
    if (!r || m.hp <= 0) return []
    const out: Residual[] = []
    const ab = r.ability
    // 날씨부정·에어록이 필드에 있으면 날씨 효과 없음
    const noWeather = (['mine', 'opp'] as const).some((sd) =>
      s.sides[sd].active.some(
        (i) =>
          i != null &&
          !isFainted(sd, i) &&
          ['cloudnine', 'airlock'].includes(resolveAt(sd, i)?.ability ?? ''),
      ),
    )
    // 이번 턴 끝에 끝나는 날씨는 효과 없이 가라앉는다 (모래바람이 그친 턴은 데미지 없음)
    const ending = !s.weather.permanent && s.weather.cur + 1 >= s.weather.total
    const w = noWeather || ending ? '' : s.weather.key
    const rain = w === 'rain' || w === 'heavyrain'
    const sun = w === 'sun' || w === 'harshsun'
    if (ab === 'raindish' && rain) out.push({ key: 'raindish', frac: 1 / 16 })
    if (ab === 'icebody' && w === 'snow') out.push({ key: 'icebody', frac: 1 / 16 })
    if (ab === 'dryskin' && rain) out.push({ key: 'dryskin', frac: 1 / 8 })
    if (ab === 'dryskin' && sun) out.push({ key: 'dryskin', frac: -1 / 8 })
    // 모래바람: 바위·땅·강철 타입과 모래숨기·모래헤치기·모래의힘·방진·매직가드, 방진고글이면 없음
    if (
      w === 'sand' &&
      !r.species.types.some((t) => t === 'rock' || t === 'ground' || t === 'steel') &&
      !['sandveil', 'sandrush', 'sandforce', 'overcoat'].includes(ab) &&
      !(r.slot.item === 'safetygoggles' && !m.itemGone)
    )
      out.push({ key: 'sand', frac: -1 / 16 })
    if (ab === 'poisonheal' && (m.status === 'psn' || m.status === 'tox'))
      out.push({ key: 'poisonheal', frac: 1 / 8 })
    const c = combatantOf(side, idx)
    if (s.terrain.key === 'grassy' && c && isGrounded(c, fieldFor(side, idx)))
      out.push({ key: 'grassy', frac: 1 / 16 })
    const item = r.slot.item
    const itemOn =
      !m.itemGone && !s.rooms.magicroom && ab !== 'klutz' && (side === 'mine' || !!m.itemKnown)
    if (itemOn && item === 'leftovers') out.push({ key: 'leftovers', frac: 1 / 16 })
    if (itemOn && item === 'blacksludge')
      out.push({
        key: 'blacksludge',
        frac: r.species.types.includes('poison') ? 1 / 16 : -1 / 8,
      })
    if (m.volatiles.aquaring) out.push({ key: 'aquaring', frac: 1 / 16 })
    if (m.volatiles.ingrain) out.push({ key: 'ingrain', frac: 1 / 16 })
    if (m.volatiles.leechseed) out.push({ key: 'leechseed', frac: -1 / 8 })
    // 조이기류(김밥말이·회오리불꽃 등) 1/8
    if (m.volatiles.partiallytrapped) out.push({ key: 'partiallytrapped', frac: -1 / 8 })
    // 저주(고스트) 1/4, 악몽(잠듦) 1/4, 소금절이 1/16 (물·강철 1/8) — 챔피언스 수치
    if (m.volatiles.curse) out.push({ key: 'curse', frac: -1 / 4 })
    if (m.volatiles.nightmare && m.status === 'slp') out.push({ key: 'nightmare', frac: -1 / 4 })
    if (m.volatiles.saltcure)
      out.push({
        key: 'saltcure',
        frac: r.species.types.some((t) => t === 'water' || t === 'steel') ? -1 / 8 : -1 / 16,
      })
    return out.filter(
      (x) => (x.frac > 0 ? !m.volatiles.healblock : ab !== 'magicguard') && x.frac !== 0,
    )
  }
  // HP 를 최대 HP 의 frac 만큼 바꾸고 바뀐 실제 HP 를 돌려줌 (mine: 실수치, opp: %)
  function changeHpFrac(side: BattleSide, idx: number, frac: number): number {
    const m = mon(side, idx)
    const max = maxHp(side, idx)
    if (!max) return 0
    const amount = Math.max(1, Math.floor(max * Math.abs(frac)))
    const before = m.hp
    if (side === 'mine') m.hp = Math.max(0, Math.min(max, m.hp + Math.sign(frac) * amount))
    else m.hp = Math.max(0, Math.min(100, m.hp + (Math.sign(frac) * amount * 100) / max))
    const diff = Math.abs(m.hp - before)
    return side === 'mine' ? diff : (diff / 100) * max
  }
  // 실제 HP(hp) 만큼 회복 (씨뿌리기 흡수)
  function healHp(side: BattleSide, idx: number, hp: number) {
    const m = mon(side, idx)
    const max = maxHp(side, idx)
    if (!max || m.hp <= 0 || hp <= 0) return
    if (side === 'mine') m.hp = Math.min(max, m.hp + Math.round(hp))
    else m.hp = Math.min(100, m.hp + (hp / max) * 100)
  }
  // 실제 HP(hp) 만큼 잃음 (반동·접촉 데미지·HP 소모 등). 상대는 추정 최대 HP 기준 %. 절반 이하가 되면 회복 열매
  function loseHp(side: BattleSide, idx: number, hp: number) {
    const m = mon(side, idx)
    const max = maxHp(side, idx)
    if (!max || m.hp <= 0 || hp <= 0) return
    if (side === 'mine') m.hp = Math.max(0, m.hp - Math.round(hp))
    else m.hp = Math.max(0, m.hp - (hp / max) * 100)
    checkBerry(side, idx)
  }
  // 회복 열매: HP 가 절반 이하가 되면 자뭉열매 최대 HP 1/4, 오랭열매 10 (숙성 2배, 볼주머니 +1/3).
  // 상대 필드에 긴장감이 있거나 회복봉인이면 먹지 않음
  const UNNERVE = new Set(['unnerve', 'asoneglastrier', 'asonespectrier'])
  function checkBerry(side: BattleSide, idx: number) {
    const m = mon(side, idx)
    const r = resolveAt(side, idx)
    const max = maxHp(side, idx)
    if (!r || m.hp <= 0 || !max || m.volatiles.healblock) return
    const item = heldItem(side, idx)
    if (item !== 'sitrusberry' && item !== 'oranberry') return
    if (side === 'mine' ? m.hp * 2 > max : m.hp > 50) return
    const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
    const unnerved = state.value!.sides[foe].active.some(
      (i) => i != null && !isFainted(foe, i) && UNNERVE.has(resolveAt(foe, i)?.ability || ''),
    )
    if (unnerved) return
    let amt = item === 'sitrusberry' ? Math.floor(max / 4) : 10
    if (r.ability === 'ripen') amt *= 2
    m.itemGone = true
    healHp(side, idx, amt)
    if (r.ability === 'cheekpouch') healHp(side, idx, Math.floor(max / 3))
  }
  // 빼앗아 회복 (흡수기·힘흡수): 큰뿌리 1.3배, 회복봉인이면 없음, 대상이 해감액이면 그만큼 데미지(매직가드면 없음)
  function absorbHeal(
    side: BattleSide,
    userIdx: number,
    foe: BattleSide,
    tIdx: number,
    hp: number,
  ) {
    const u = mon(side, userIdx)
    if (hp <= 0 || u.hp <= 0) return
    const ur = resolveAt(side, userIdx)
    if (resolveAt(foe, tIdx)?.ability === 'liquidooze') {
      if (ur?.ability !== 'magicguard') loseHp(side, userIdx, hp)
      return
    }
    if (u.volatiles.healblock) return
    const amt = heldItem(side, userIdx) === 'bigroot' ? Math.floor((hp * 5324 + 2047) / 4096) : hp
    healHp(side, userIdx, amt)
  }
  // log: 이 포켓몬 HP 를 바꾼 비율 (턴 끝 HP 관측용)
  function applyResidual(side: BattleSide, idx: number, log?: HpStep[]) {
    const s = state.value!
    for (const x of residualPlan(side, idx)) {
      if (mon(side, idx).hp <= 0) break
      log?.push({ frac: x.frac })
      const lost = changeHpFrac(side, idx, x.frac)
      if (x.key !== 'leechseed') continue
      // 씨뿌리기: 심은 쪽 칸의 포켓몬이 뺏은 만큼 회복 (해감액이면 데미지)
      const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
      const act = s.sides[foe].active
      const to = act[mon(side, idx).seedFrom ?? 0] ?? act.find((i) => i != null)
      if (to == null || isFainted(foe, to)) continue
      if (resolveAt(side, idx)?.ability === 'liquidooze') {
        const max = maxHp(foe, to)
        if (max) changeHpFrac(foe, to, -lost / max)
      } else if (!mon(foe, to).volatiles.healblock) healHp(foe, to, lost)
    }
  }

  // 흡수기 (기가드레인·드레인펀치·드레인키스 등): 대상이 실제로 잃은 HP(쓰러뜨리면 남은 HP까지, 대타면 대타가 받은 만큼)의
  // ratio 만큼 회복 (반올림, 최소 1). 큰뿌리 1.3배, 회복봉인이면 없음, 대상이 해감액이면 그만큼 데미지(매직가드면 없음).
  // lost: 대상 단위 (상대 = %, 내 쪽 = 실수치). 상대 HP 실수치는 추정 최대 HP 기준
  function drainHeal(
    moveId: string,
    side: BattleSide,
    userIdx: number,
    foe: BattleSide,
    tIdx: number,
    lost: number,
  ) {
    const eff = gd.move(moveId)?.effects.find((e) => e.type === 'drain')
    const ratio = eff?.type === 'drain' ? eff.ratio : 0
    if (!ratio || lost <= 0) return
    const dealt = realHp(foe, tIdx, lost)
    if (dealt > 0) absorbHeal(side, userIdx, foe, tIdx, Math.max(1, Math.round(dealt * ratio)))
  }

  function inflictStatus(side: BattleSide, idx: number, st: Exclude<Status, ''>) {
    if (statusBlocked(side, idx, st)) return
    const m = mon(side, idx)
    m.status = st
    m.toxicTurn = 0
    m.restSleep = false
  }
  // n 만큼 PP 를 씀 (0 아래로는 안 내려감). 과사열매: PP 가 0 이 되면 10 회복하고 소모
  function spendPp(side: BattleSide, idx: number, moveId: string, n: number) {
    const m = mon(side, idx)
    const max = maxPp(side, idx, moveId)
    const used = { ...ppUsedOf(side, idx) }
    used[moveId] = Math.min(max || Infinity, (used[moveId] ?? 0) + n)
    if (max && used[moveId]! >= max && heldItem(side, idx) === 'leppaberry') {
      used[moveId] = max - Math.min(max, 10)
      m.itemGone = true
    }
    if (m.transform) m.tfPpUsed = used
    else m.ppUsed = used
  }
  // 하품: 졸음 상태로 (이미 졸음이거나 잠들 수 없으면 실패). 다음 턴 끝에 잠듦
  function inflictYawn(side: BattleSide, idx: number) {
    const m = mon(side, idx)
    if (m.volatiles.yawn || statusBlocked(side, idx, 'slp')) return
    m.volatiles.yawn = 1
  }

  return {
    statChange,
    whiteHerb,
    residualPlan,
    changeHpFrac,
    healHp,
    loseHp,
    checkBerry,
    absorbHeal,
    applyResidual,
    drainHeal,
    inflictStatus,
    spendPp,
    inflictYawn,
  }
}

export type BattleHp = ReturnType<typeof createHp>
