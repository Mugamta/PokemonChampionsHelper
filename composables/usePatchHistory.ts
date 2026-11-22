// composables/usePatchHistory.ts
// 레귤레이션마다 직전 레귤레이션과의 차이 (패치 내역 화면 + 도감의 포켓몬·기술·도구별 패치 이력).
// 비교는 레귤레이션 데이터 객체(useGameData().dataFor, 같은 레귤레이션이면 같은 객체)마다 한 번만 한다.

import {
  diffRegulations,
  openingDiff,
  type RegDiffEntry,
  type RegulationDiff,
} from '~/utils/regulationData'
import type { GameData } from '~/utils/types'

// 레귤레이션 데이터 → (직전 레귤레이션 id, 개막이면 '') → diff
const cache = new WeakMap<GameData, Map<string, RegulationDiff>>()

export function usePatchHistory() {
  const gd = useGameData()
  const reg = useRegulation()

  // 오래된 레귤레이션부터
  const entries = computed<RegDiffEntry[]>(() => {
    if (!gd.ready.value) return []
    const list = reg.list.value
    return list.map((r, i) => {
      const cd = gd.dataFor(r.id)!
      const prev = list[i - 1]
      let byPrev = cache.get(cd)
      if (!byPrev) cache.set(cd, (byPrev = new Map()))
      const key = prev?.id ?? ''
      let diff = byPrev.get(key)
      if (!diff) {
        diff = prev ? diffRegulations(gd.dataFor(prev.id)!, prev, cd, r) : openingDiff(cd, r)
        byPrev.set(key, diff)
      }
      return { reg: r.id, first: !prev, diff, data: cd }
    })
  })

  // ── 바뀐 값 표시 ─────────────
  const { t } = useI18n()
  const moveValue = (key: string, v: unknown) => {
    if (key === 'type') return gd.name('types', String(v))
    if (key === 'category') return t('category.' + String(v))
    if (key === 'accuracy') return v == null ? '—' : String(v)
    if (key === 'power') return v ? String(v) : '—'
    return String(v)
  }
  const pokemonLabel = (key: string) =>
    ['types', 'abilities', 'weight'].includes(key) ? t('patch.field.' + key) : t('stat.' + key)
  const pokemonValue = (key: string, v: unknown) => {
    if (key === 'types') return (v as string[]).map((x) => gd.name('types', x)).join(' / ')
    if (key === 'abilities') return (v as string[]).map((x) => gd.name('abilities', x)).join(' / ')
    return String(v)
  }

  return { entries, moveValue, pokemonLabel, pokemonValue }
}
