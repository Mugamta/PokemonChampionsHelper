// composables/useVs.ts
// VS 화면(1:1 계산기) 상태 + 계산. 왼쪽·오른쪽 포켓몬이 서로를 공격한 결과와 행동 순서를 만든다.
// 상태는 localStorage 'pch-vs-v1' 에 자동 저장. 계산은 파티·배틀 화면과 같은 useTeamCalc.

import { useTeamCalc, type Cell } from '~/composables/useTeamCalc'
import { calcDamage, isSpreadMove } from '~/utils/damage'
import { effectiveSpeed } from '~/utils/stats'
import { emptySlot, STAT_KEYS } from '~/utils/types'
import {
  emptyVs,
  emptyVsField,
  emptyVsMon,
  hpFromPct,
  vsFieldState,
  vsOrder,
  vsPriority,
  type VsMon,
  type VsSide,
  type VsState,
} from '~/utils/vs'

const STORAGE_KEY = 'pch-vs-v1'
let hydrated = false

export interface VsResult {
  moveId: string
  cell: Cell
  rolls: number[] // 16단계 난수 (연속기면 비움: 합계가 cell 에 있음)
}

const restoreMon = (saved: Partial<VsMon> | undefined): VsMon => {
  const empty = emptyVsMon()
  return {
    ...empty,
    ...saved,
    slot: { ...emptySlot(), ...saved?.slot },
    boosts: { ...empty.boosts, ...saved?.boosts },
  }
}

export function useVs() {
  const state = useState<VsState>('vs', emptyVs)
  const gd = useGameData()
  const calc = useTeamCalc()

  if (import.meta.client && !hydrated) {
    hydrated = true
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      if (saved) {
        const field = emptyVsField()
        state.value = {
          left: restoreMon(saved.left),
          right: restoreMon(saved.right),
          field: {
            ...field,
            ...saved.field,
            rooms: { ...field.rooms, ...saved.field?.rooms },
          },
        }
      }
    } catch {
      // 저장분이 깨졌으면 무시
    }
    watch(
      state,
      (v) => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
        } catch {
          // 저장 실패(용량 초과/차단)는 무시
        }
      },
      { deep: true },
    )
  }

  const resolvedOf = (side: VsSide) => {
    const m = state.value[side]
    return calc.resolve(m.slot, m.megaOn, m.altOn ?? undefined)
  }
  const left = computed(() => resolvedOf('left'))
  const right = computed(() => resolvedOf('right'))
  const resolved = (side: VsSide) => (side === 'left' ? left.value : right.value)

  // 포켓몬을 바꾸면 특성·도구·기술·전투 상태 초기화 (능력 포인트는 유지). 지우면 전부 초기화
  const setSpecies = (side: VsSide, id: string | null) => {
    const m = state.value[side]
    const species = id ?? ''
    if (m.slot.species === species) return
    const fresh = emptyVsMon()
    m.slot.species = species
    m.slot.gender = ''
    m.slot.ability = gd.pokemon(species)?.abilities[0] ?? ''
    m.slot.item = ''
    m.slot.moves = ['', '', '', '']
    m.megaOn = true
    m.altOn = null
    m.status = ''
    m.boosts = fresh.boosts
    m.hpPct = 100
    if (!species) {
      m.slot.nature = 'serious'
      for (const k of STAT_KEYS) m.slot.sp[k] = 0
    }
  }

  const swap = () => {
    const { left: l, right: r } = state.value
    state.value.left = r
    state.value.right = l
  }
  const reset = () => (state.value = emptyVs())

  // from 이 to 를 공격한 결과 (양쪽 포켓몬과 from 의 공격 기술이 있어야 함)
  const attack = (from: VsSide, to: VsSide): VsResult | null => {
    const a = resolved(from)
    const d = resolved(to)
    const moveId = state.value[from].slot.moves[0]
    const move = gd.move(moveId)
    const chart = gd.data.value?.types.chart
    if (!a || !d || !moveId || !move || !chart) return null
    const mf = state.value[from]
    const mt = state.value[to]
    const atkForm = calc.attackForm(a)
    const atk = calc.combatant(atkForm, {
      status: mf.status,
      boosts: mf.boosts,
      hp: hpFromPct(atkForm.stats.hp, mf.hpPct),
    })
    const def = calc.combatant(d, {
      status: mt.status,
      boosts: mt.boosts,
      hp: hpFromPct(d.stats.hp, mt.hpPct),
    })
    const field = vsFieldState(state.value.field, mt)
    const opts = {
      crit: mf.crit,
      helpingHand: state.value.field.doubles && mf.helpingHand,
      spread: state.value.field.doubles && isSpreadMove(move, { attacker: atk, field }),
    }
    const cell = calc.cell(moveId, atk, def, field, opts)
    if (!cell) return null
    return {
      moveId,
      cell,
      rolls: cell.hits ? [] : calcDamage(move, atk, def, chart, field, opts).rolls,
    }
  }
  const leftToRight = computed(() => attack('left', 'right'))
  const rightToLeft = computed(() => attack('right', 'left'))

  // 실전 스피드 (랭크·도구·특성·상태이상·순풍)
  const speedOf = (side: VsSide) => {
    const r = resolved(side)
    if (!r) return null
    const m = state.value[side]
    const f = state.value.field
    return effectiveSpeed(r.stats.spe, {
      boost: m.boosts.spe,
      item: f.rooms.magicroom ? '' : r.slot.item,
      status: m.status,
      ability: r.ability,
      weather: f.weather,
      terrain: f.terrain,
      tailwind: m.tailwind,
    })
  }
  const speed = computed(() => {
    const l = speedOf('left')
    const r = speedOf('right')
    if (l == null || r == null) return null
    const priorityOf = (side: VsSide) => {
      const m = state.value[side]
      return vsPriority(gd.move(m.slot.moves[0]), resolved(side)!.ability, m.hpPct >= 100)
    }
    return {
      left: l,
      right: r,
      ...vsOrder(
        { speed: l, priority: priorityOf('left') },
        { speed: r, priority: priorityOf('right') },
        state.value.field.rooms.trickroom,
      ),
    }
  })

  return { state, left, right, resolved, setSpecies, swap, reset, leftToRight, rightToLeft, speed }
}
