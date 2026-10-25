// composables/battle/entry.ts
// 등장과 교체: 필드에 내보내기(물러남·등장 효과·설치기), 변신(메타몽), 위협, 등장 특성(날씨·필드),
// 동시 등장 묶음(선두·쓰러진 뒤 교체 — 발동 순서 관찰로 상대 스피드 구간을 좁힘), 상대 도구·특성 확정.

import { isGrounded } from '~/utils/damage'
import { fullRanges, narrowRanges, type SpeedRanges } from '~/utils/speedInference'
import {
  BASE_TURNS,
  ENTRY_MESSAGE,
  EXTENDED_TURNS,
  INTIMIDATE_IMMUNE,
  PRIMAL_ABILITY,
  TERRAIN_ABILITY,
  WEATHER_ABILITY,
  WEATHER_ROCK,
  zeroBoosts,
  type BattleSide,
  type EntryBatch,
  type EntryPair,
} from '~/utils/battleState'
import type { BattleCore } from '~/composables/battle/core'
import type { BattleOrder } from '~/composables/battle/order'
import type { BattleQueries } from '~/composables/battle/queries'
import type { BattleField } from '~/composables/battle/field'
import type { BattleHp } from '~/composables/battle/hp'

export function createEntry(b: BattleCore & BattleOrder & BattleQueries & BattleField & BattleHp) {
  const {
    N,
    gd,
    state,
    slotsOf,
    mon,
    resolveAt,
    ownAbility,
    maxHp,
    isFainted,
    isLeadPhase,
    foeOf,
    combatantOf,
    fieldFor,
    allyOf,
    pushHistory,
    speedOf,
    speedEnvOf,
    speedOrder,
    setWeather,
    clearWeather,
    setTerrain,
    statChange,
    healHp,
  } = b

  // how: 'switch' = 실제 교체 (물러남·등장 효과, 설치기), 'correct' = 정정 (필드에 있는 포켓몬만 바꾸고 효과 없음)
  // defer: 등장 특성을 바로 발동하지 않음 (함께 등장하는 포켓몬과 스피드 순으로 따로 발동)
  function sendOut(
    side: BattleSide,
    slot: number,
    idx: number,
    how: 'switch' | 'correct' = 'switch',
    defer = false,
  ) {
    const s = state.value!
    const sd = s.sides[side]
    if (isFainted(side, idx) || sd.active.includes(idx)) return
    const prev = sd.active[slot]
    const lead = isLeadPhase()
    if (how === 'correct' && !lead) {
      sd.active[slot] = idx
      if (side === 'opp' && !sd.revealed.includes(idx)) sd.revealed.push(idx)
      return
    }
    // 선두를 고르는 중에 바꾸면, 앞서 고른 포켓몬의 위협으로 바뀐 상대 랭크와 그 포켓몬으로의 변신을 되돌린다
    if (lead && prev != null)
      for (const fi of s.sides[foeOf(side)].active) {
        if (fi == null) continue
        const fm = mon(foeOf(side), fi)
        fm.boosts = zeroBoosts()
        if (fm.transform?.side === side && fm.transform.idx === prev) fm.transform = null
      }
    if (prev != null) {
      const out = sd.mons[prev]!
      out.boosts = zeroBoosts() // 교체 시 랭크·특수 상태 초기화
      out.volatiles = {}
      out.lastMove = ''
      out.moveStreak = 0
      out.transform = null // 변신은 물러나면 풀린다
      out.tfPpUsed = {}
      // 배틀 폼: 팔라피는 한 번 물러나면 마이티폼으로 고정, 킬가르도는 물러나면 실드폼, 모르페코는 배부른모양
      const outAbility = resolveAt(side, prev)?.ability
      if (outAbility === 'zerotohero') out.alt = true
      // 재생력: 물러나면 최대 HP 1/3 회복 (선두 고르기 제외)
      if (outAbility === 'regenerator' && !lead && out.hp > 0)
        healHp(side, prev, Math.floor(maxHp(side, prev) / 3))
      if (outAbility === 'stancechange' || outAbility === 'hungerswitch') out.alt = false
      if (s.weather.source && s.weather.source[0] === side && s.weather.source[1] === prev)
        clearWeather()
      s.observedOrder = 'unknown'
    }
    sd.active[slot] = idx
    sd.mons[idx]!.enteredTurn = lead ? 0 : s.turn
    // 치유소원: 이 칸에 나온 포켓몬이 HP·상태이상 모두 회복
    const hw = sd.healingWish?.indexOf(slot) ?? -1
    if (hw >= 0 && !lead) {
      sd.healingWish!.splice(hw, 1)
      Object.assign(sd.mons[idx]!, {
        hp: side === 'mine' ? maxHp(side, idx) : 100,
        status: '',
        toxicTurn: 0,
      })
    }
    // 설치기: 실제로 교체해 들어올 때 (선두 고르기·정정은 제외)
    if (!lead) entryHazards(side, idx)
    if (side === 'opp' && !sd.revealed.includes(idx)) sd.revealed.push(idx)
    // 선두는 양쪽이 동시에 등장 → 필드의 모든 포켓몬을 스피드 순으로 다시 발동
    if (lead) leadEntry(side, idx)
    else if (!defer) onEnter(side, idx, true)
    // 괴짜: 맞은편 상대로 변신
    if (ownAbility(side, idx) === 'imposter') imposter(side, slot)
    // 선두는 동시에 등장 → 이미 나와 있는 상대의 위협도 이 포켓몬에게 적용,
    // 상대 쪽 괴짜 메타몽이 이 칸을 맞은편으로 두고 아직 변신 전이면 지금 변신
    if (lead) {
      const foe = foeOf(side)
      s.sides[foe].active.forEach((fi, fSlot) => {
        if (fi == null) return
        if (resolveAt(foe, fi)?.ability === 'intimidate') intimidate(foe, fi, idx)
        if (
          !mon(foe, fi).transform &&
          ownAbility(foe, fi) === 'imposter' &&
          acrossSlot(fSlot) === slot
        )
          transformInto(foe, fi, side, idx)
      })
    }
  }

  // ── 설치기 (교체로 들어올 때) ─────────────
  // 스텔스록 = 최대 HP × 1/8 × 바위 상성, 압정뿌리기 = 1/8·1/6·1/4 (겹수), 독압정 = 독 / 2겹 맹독
  // (땅에 있는 독 타입이 밟으면 사라짐, 강철·이미 상태이상·신비의부적·미스트필드는 무효), 끈적끈적네트 = 스피드 −1.
  // 압정·독압정·네트는 땅에 있는 포켓몬만 (비행·부유·풍선 등 제외). 매직가드는 데미지 없음
  function entryHazards(side: BattleSide, idx: number) {
    const s = state.value!
    const sd = s.sides[side]
    const hz = sd.hazards
    if (!Object.keys(hz).length) return
    const c = combatantOf(side, idx)
    if (!c || !gd.data.value) return
    const m = mon(side, idx)
    const max = c.stats.hp
    const field = fieldFor(side, idx)
    const grounded = isGrounded(c, field)
    const magicGuard = c.ability === 'magicguard'
    let dmg = 0
    if (hz.stealthrock && !magicGuard) {
      const rock = gd.data.value.types.chart.rock || {}
      const eff = c.species.types.reduce((e, t) => e * (rock[t] ?? 1), 1)
      dmg += Math.floor((max * eff) / 8)
    }
    if (hz.spikes && grounded && !magicGuard)
      dmg += Math.floor(max / [8, 8, 6, 4][Math.min(3, hz.spikes)]!)
    if (dmg)
      m.hp =
        side === 'mine' ? Math.max(0, m.hp - dmg) : Math.max(0, m.hp - (dmg / (max || 1)) * 100)
    if (hz.toxicspikes && grounded && m.hp > 0) {
      if (c.species.types.includes('poison')) delete hz.toxicspikes
      else if (
        !c.species.types.includes('steel') &&
        !m.status &&
        !sd.screens.safeguard &&
        field.terrain !== 'misty'
      ) {
        m.status = hz.toxicspikes >= 2 ? 'tox' : 'psn'
        m.toxicTurn = 0
      }
    }
    if (hz.stickyweb && grounded && m.hp > 0) {
      const foe = foeOf(side)
      const fi = s.sides[foe].active.find((x) => x != null)
      statChange(side, idx, 'spe', -1, fi != null ? [foe, fi] : undefined)
    }
  }

  // ── 변신 (메타몽) ─────────────
  // 괴짜는 맞은편(더블에서는 대각선) 상대로 변신 — Showdown imposter: foe.active[N - 1 - 자기 칸]
  const acrossSlot = (slot: number) => N - 1 - slot
  function imposter(side: BattleSide, slot: number) {
    const s = state.value!
    const idx = s.sides[side].active[slot]
    const foe = foeOf(side)
    const tIdx = s.sides[foe].active[acrossSlot(slot)]
    if (idx != null && tIdx != null) transformInto(side, idx, foe, tIdx)
  }
  // 상대의 종·타입·특성·기술·실능치(HP 제외)·랭크를 복사 (도구·HP 는 자기 것). 이미 변신한 쪽끼리는 실패
  function transformInto(side: BattleSide, idx: number, tSide: BattleSide, tIdx: number) {
    const m = mon(side, idx)
    const t = mon(tSide, tIdx)
    if (m.transform || t.transform || isFainted(tSide, tIdx)) return false
    m.transform = { side: tSide, idx: tIdx, megaOn: t.megaOn, alt: t.alt }
    m.tfPpUsed = {}
    m.boosts = { ...t.boosts }
    onEnter(side, idx, true) // 복사한 특성 발동 (위협·날씨 등)
    return true
  }
  // 변신할 수 있는 포켓몬 (괴짜 메타몽 / 변신 기술을 가진 포켓몬)
  const canTransform = (side: BattleSide, idx: number) =>
    ownAbility(side, idx) === 'imposter' || !!slotsOf(side)[idx]?.moves.includes('transform')
  // 화면에서 직접: 맞은편 상대로 변신 / 변신 해제
  const toggleTransform = (side: BattleSide, idx: number) => {
    const m = mon(side, idx)
    if (m.transform) {
      m.transform = null
      m.tfPpUsed = {}
      return
    }
    const slot = state.value!.sides[side].active.indexOf(idx)
    if (slot >= 0) imposter(side, slot)
  }

  // 위협: 상대 필드 전체(onlyTarget 지정 시 그 포켓몬만) 공격 −1. 특성/도구에 따른 반응 포함
  function intimidate(side: BattleSide, idx: number, onlyTarget?: number) {
    const foe = foeOf(side)
    for (const fi of state.value!.sides[foe].active) {
      if (fi == null || isFainted(foe, fi) || (onlyTarget != null && fi !== onlyTarget)) continue
      const ab = resolveAt(foe, fi)?.ability || ''
      if (ab === 'guarddog') {
        statChange(foe, fi, 'atk', 1)
        continue
      }
      if (INTIMIDATE_IMMUNE.has(ab) || mon(foe, fi).volatiles.substitute) continue
      statChange(foe, fi, 'atk', -1, [side, idx])
      if (ab === 'rattled') statChange(foe, fi, 'spe', 1)
    }
  }

  // 등장 시 특성 발동 (날씨/필드/위협). 원시 날씨는 다른 날씨로 덮이지 않는다.
  // entering = 실제 등장/메가진화 (메가 미리보기 토글에서는 위협을 발동하지 않음)
  function onEnter(side: BattleSide, idx: number, entering = false) {
    onEnterField(side, idx)
    const ab = resolveAt(side, idx)?.ability
    if (entering && ab === 'intimidate') intimidate(side, idx)
    // 대접: 등장하면 아군 최대 HP 1/4 회복
    if (entering && ab === 'hospitality') {
      const slot = state.value!.sides[side].active.indexOf(idx)
      const ally = slot >= 0 ? allyOf(side, slot) : null
      if (ally != null && !isFainted(side, ally) && !mon(side, ally).volatiles.healblock)
        healHp(side, ally, Math.floor(maxHp(side, ally) / 4))
    }
  }
  // 날씨·필드 특성 (동시 등장 순서를 고치면 이 부분만 다시 발동)
  function onEnterField(side: BattleSide, idx: number) {
    const s = state.value!
    const r = resolveAt(side, idx)
    if (!r) return
    const ab = r.ability
    if (PRIMAL_ABILITY[ab])
      setWeather(PRIMAL_ABILITY[ab]!, { permanent: true, source: [side, idx] })
    else if (WEATHER_ABILITY[ab] && !s.weather.permanent)
      setWeather(WEATHER_ABILITY[ab]!, { item: r.slot.item, by: [side, idx] })
    if (TERRAIN_ABILITY[ab]) setTerrain(TERRAIN_ABILITY[ab]!, r.slot.item, [side, idx])
  }

  // ── 동시 등장 ─────────────
  // 함께 등장한 포켓몬의 특성은 스피드 순으로 발동 (트릭룸이면 느린 쪽부터) → 나중에 발동한 날씨·필드가 남는다.
  // 내 쪽 × 상대 쪽은 관찰한 순서(entryObs) → speedOrder(상대 스피드 구간)로 정해지면 그 순서 → 상대 스피드 범위의 가운데 (임시, 본 순서를 고르면 다시)
  const entryKey = (mi: number, oi: number) => `${mi}:${oi}`
  const announces = (side: BattleSide, idx: number) => {
    const r = resolveAt(side, idx)
    if (!r) return false
    if (side === 'mine' || r.isMega || r.transformedFrom || mon(side, idx).abilityKnown)
      return ENTRY_MESSAGE.has(r.ability)
    return r.base.abilities.some((a) => ENTRY_MESSAGE.has(a))
  }
  // 등장 직전 상태 기준 (날씨·필드가 아직 안 바뀐 때 부른다)
  const entryPairs = (entrants: readonly [BattleSide, number][]): EntryPair[] => {
    const pairs: EntryPair[] = []
    for (const [ms, mi] of entrants)
      for (const [os, oi] of entrants) {
        if (ms !== 'mine' || os !== 'opp' || !announces('mine', mi) || !announces('opp', oi))
          continue
        const se = speedEnvOf(oi)
        if (!se) continue
        const so = speedOrder(mi, oi)
        pairs.push({
          mi,
          oi,
          auto: so?.first ?? null,
          tiePossible: !!so?.tiePossible,
          base: se.base,
          env: se.env,
          mySpeed: speedOf('mine', mi),
        })
      }
    return pairs
  }
  // 짝의 먼저 발동한 쪽: 관찰 → 스피드 판정 (동속·모름이면 null)
  const entryFirst = (p: EntryPair): BattleSide | null => {
    const o = state.value!.entryObs?.[entryKey(p.mi, p.oi)]
    return o ?? (p.auto === 'mine' || p.auto === 'opp' ? p.auto : null)
  }
  const orderEntrants = (entrants: readonly [BattleSide, number][], pairs: EntryPair[]) => {
    const tr = !!state.value!.rooms.trickroom
    return [...entrants].sort((x, y) => {
      if (x[0] !== y[0]) {
        const [m, o] = x[0] === 'mine' ? [x, y] : [y, x]
        const p = pairs.find((q) => q.mi === m[1] && q.oi === o[1])
        const f = p && entryFirst(p)
        if (f) return f === x[0] ? -1 : 1
      }
      const d = speedOf(x[0], x[1]) - speedOf(y[0], y[1])
      return (tr ? d : -d) || (x[0] === 'mine' ? -1 : 1)
    })
  }
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
  const copyField = () => ({
    weather: clone(state.value!.weather),
    terrain: clone(state.value!.terrain),
  })
  // 등장 직전 날씨·필드로 되돌리고 순서대로 발동. fresh: 처음 발동하는 포켓몬 (위협 포함), 나머지는 날씨·필드만 다시
  function runEntry(batch: EntryBatch, fresh: (side: BattleSide, idx: number) => boolean) {
    const s = state.value!
    s.weather = clone(batch.before.weather)
    s.terrain = clone(batch.before.terrain)
    for (const [side, idx] of orderEntrants(batch.entrants, batch.pairs))
      if (fresh(side, idx)) onEnter(side, idx, true)
      else onEnterField(side, idx)
  }
  // 관찰한 발동 순서로 상대 스피드 구간 좁히기 (등장 직전 구간에서 다시 계산 → 관찰을 바꿔도 됨)
  function applyEntryNarrowing(batch: EntryBatch) {
    const obs = state.value!.entryObs ?? {}
    for (const oi of new Set(batch.pairs.map((p) => p.oi))) {
      let r = batch.oppBefore[oi] ?? null
      for (const p of batch.pairs) {
        const o = obs[entryKey(p.mi, p.oi)]
        if (p.oi !== oi || !o || p.env.fixedStat != null) continue
        r = narrowRanges(r ?? fullRanges(), p.base, p.env, p.mySpeed, (o === 'opp') !== batch.tr)
      }
      mon('opp', oi).speedSp = r
    }
  }
  const newBatch = (entrants: [BattleSide, number][], before: EntryBatch['before']): EntryBatch => {
    const pairs = entryPairs(entrants)
    const oppBefore: Record<number, SpeedRanges | null> = {}
    for (const p of pairs) oppBefore[p.oi] = mon('opp', p.oi).speedSp
    return { entrants, before, oppBefore, tr: !!state.value!.rooms.trickroom, pairs }
  }
  // 고칠 수 있는 묶음을 버림. 관찰로 좁혔던 상대 스피드 구간은 되돌림 (선두를 다시 고를 때)
  const dropEntry = () => {
    const s = state.value!
    if (s.entry)
      for (const [oi, r] of Object.entries(s.entry.oppBefore)) mon('opp', +oi).speedSp = r
    s.entry = null
    s.entryObs = {}
  }
  // 선두: 지금 필드에 있는 양쪽 포켓몬 전부가 동시에 등장 (날씨·필드 없음에서 시작). 방금 나온 포켓몬만 위협 발동
  function leadEntry(side: BattleSide, idx: number) {
    const s = state.value!
    dropEntry()
    const before: EntryBatch['before'] = {
      weather: { key: '', cur: 0, total: BASE_TURNS, permanent: false, source: null, by: null },
      terrain: { key: '', cur: 0, total: BASE_TURNS, by: null },
    }
    s.weather = clone(before.weather)
    s.terrain = clone(before.terrain)
    const entrants: [BattleSide, number][] = []
    for (const sd of ['mine', 'opp'] as const)
      for (const i of s.sides[sd].active) if (i != null) entrants.push([sd, i])
    const batch = newBatch(entrants, before)
    runEntry(batch, (sd, i) => sd === side && i === idx)
    s.entry = batch.pairs.length ? batch : null
  }
  // 쓰러진 뒤 교체: 고른 포켓몬을 한 번에 내보냄 (양쪽이면 스피드 순 발동, 순서는 다음 턴 적용 전까지 고칠 수 있음)
  function replaceFainted(choices: { side: BattleSide; slot: number; idx: number }[]) {
    const s = state.value!
    if (!choices.length) return
    pushHistory()
    dropEntry()
    const entrants: [BattleSide, number][] = []
    for (const c of choices) {
      if (isFainted(c.side, c.idx) || s.sides[c.side].active.includes(c.idx)) continue
      sendOut(c.side, c.slot, c.idx, 'switch', true)
      entrants.push([c.side, c.idx])
    }
    const batch = newBatch(entrants, copyField())
    runEntry(batch, () => true)
    s.entry = batch.pairs.length ? batch : null
  }
  // 등장 특성 발동 순서 관찰 입력 (unknown = 지움). 고칠 수 있는 묶음이면 날씨·필드를 다시 발동하고 구간을 다시 좁힘.
  // 이번 턴 교체(예정)끼리는 저장만 해 두고 턴 적용 때 반영
  function setEntryOrder(mi: number, oi: number, v: 'mine' | 'opp' | 'unknown') {
    const s = state.value!
    const obs = (s.entryObs ??= {})
    if (v === 'unknown') delete obs[entryKey(mi, oi)]
    else obs[entryKey(mi, oi)] = v
    const batch = s.entry
    if (batch?.pairs.some((p) => p.mi === mi && p.oi === oi)) {
      runEntry(batch, () => false)
      applyEntryNarrowing(batch)
    }
  }
  // 지금 보여 줄 짝: 고칠 수 있는 묶음, 없으면 이번 턴 교체 예정끼리 (기술을 쓰기 전 양쪽 다 교체)
  const entryPairsNow = computed(() => {
    const s = state.value
    if (!s) return []
    if (s.entry?.pairs.length) return s.entry.pairs
    const planned: [BattleSide, number][] = []
    for (const side of ['mine', 'opp'] as const)
      s.actions[side].forEach((a) => {
        if (a.kind === 'switch' && a.switchTo != null) planned.push([side, a.switchTo])
      })
    return planned.some((e) => e[0] === 'mine') && planned.some((e) => e[0] === 'opp')
      ? entryPairs(planned)
      : []
  })
  // 고칠 수 있는 묶음에 상대 oi 가 있으면 등장 직전 상태로 되돌려 짝(스피드 판정)을 다시 만들고 다시 발동.
  // 등장 뒤 드러난 특성·도구(스카프 아님 확정 등)로 발동 순서가 정해질 수 있어서. 묶음에 없으면 false
  function refreshEntry(oi: number, fresh: (side: BattleSide, idx: number) => boolean) {
    const s = state.value!
    const batch = s.entry
    if (!batch?.entrants.some(([sd, i]) => sd === 'opp' && i === oi)) return false
    for (const [o, r] of Object.entries(batch.oppBefore)) mon('opp', +o).speedSp = r
    s.weather = clone(batch.before.weather)
    s.terrain = clone(batch.before.terrain)
    batch.pairs = entryPairs(batch.entrants)
    for (const p of batch.pairs)
      if (!(p.oi in batch.oppBefore)) batch.oppBefore[p.oi] = mon('opp', p.oi).speedSp
    runEntry(batch, fresh)
    applyEntryNarrowing(batch)
    return true
  }
  const entryObsOf = (mi: number, oi: number) =>
    state.value?.entryObs?.[entryKey(mi, oi)] ?? 'unknown'

  // 상대 도구 확정 (이번 턴 행동 입력 중 도구가 드러났을 때: 먹다남은음식 회복·하양허브·그라운드코트 등).
  // 배틀 상태에만 저장 (선출 화면 파티의 도구는 그대로) → 이번 턴 처리부터 반영 (턴 끝 회복 등). item = '' 이면 확정 취소
  // (그라운드코트·바위는 그 포켓몬이 깐 필드·날씨만 연장. 깐 포켓몬을 모르면(직접 켬) 연장한다고 본다)
  const confirmItem = (side: BattleSide, idx: number, item: string) => {
    const m = mon(side, idx)
    if (!slotsOf(side)[idx]) return
    if (!item) {
      m.itemKnown = false
      delete m.item
      if (side === 'opp') refreshEntry(idx, () => false)
      return
    }
    m.item = item
    m.itemGone = false
    m.itemKnown = true
    // 스카프 여부가 정해져 동시 등장 특성 발동 순서가 확정될 수 있음 (연장 바위·그라운드코트 처리보다 먼저)
    if (side === 'opp') refreshEntry(idx, () => false)
    // 그라운드코트·날씨 연장 바위: 이 포켓몬이 깐 필드·날씨가 5턴이면 8턴으로 (안 끝나는 걸 보고 확정하는 경우)
    const st = state.value!
    const mine = (by?: [BattleSide, number] | null) => !by || (by[0] === side && by[1] === idx)
    const tr = st.terrain
    if (item === 'terrainextender' && tr.key && tr.total === BASE_TURNS && mine(tr.by))
      tr.total = EXTENDED_TURNS
    const w = st.weather
    if (
      w.key &&
      !w.permanent &&
      WEATHER_ROCK[w.key] === item &&
      w.total === BASE_TURNS &&
      mine(w.by)
    )
      w.total = EXTENDED_TURNS
  }

  // 상대 특성 확정 ('' = 확정 취소). 특성이 바뀌면: 이 포켓몬의 예전 특성이 깐 날씨·필드는 지우고,
  // 방금 나온 포켓몬(이번 턴 또는 지난 턴에 등장)이면 새 특성의 등장 효과(날씨·필드·위협)를 지금 적용.
  // 동시 등장 묶음에 들어 있으면 짝·발동 순서도 다시 계산. 잘못 추측해 이미 적용된 위협은 되돌리지 않음 (랭크를 직접 고침)
  const confirmAbility = (idx: number, ability: string) => {
    const s = state.value!
    const m = mon('opp', idx)
    if (!slotsOf('opp')[idx]) return
    const before = resolveAt('opp', idx)?.ability ?? ''
    if (ability) Object.assign(m, { ability, abilityKnown: true })
    else {
      m.abilityKnown = false
      delete m.ability
    }
    const after = resolveAt('opp', idx)?.ability ?? ''
    if (after === before) return
    const own = (by?: [BattleSide, number] | null) => !!by && by[0] === 'opp' && by[1] === idx
    if (WEATHER_ABILITY[before] === s.weather.key && own(s.weather.by) && !s.weather.permanent)
      clearWeather()
    if (TERRAIN_ABILITY[before] === s.terrain.key && own(s.terrain.by))
      Object.assign(s.terrain, { key: '', cur: 0, total: BASE_TURNS, by: null })
    const active = s.sides.opp.active.includes(idx) && !isFainted('opp', idx)
    if (!active || m.enteredTurn < s.turn - 1) return
    if (!refreshEntry(idx, (sd, i) => sd === 'opp' && i === idx)) onEnter('opp', idx, true)
  }

  return {
    sendOut,
    entryHazards,
    acrossSlot,
    imposter,
    transformInto,
    canTransform,
    toggleTransform,
    intimidate,
    onEnter,
    onEnterField,
    entryPairs,
    orderEntrants,
    copyField,
    runEntry,
    applyEntryNarrowing,
    newBatch,
    dropEntry,
    leadEntry,
    replaceFainted,
    setEntryOrder,
    entryPairsNow,
    refreshEntry,
    entryObsOf,
    confirmItem,
    confirmAbility,
  }
}

export type BattleEntry = ReturnType<typeof createEntry>
