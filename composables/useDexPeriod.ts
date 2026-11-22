// composables/useDexPeriod.ts
// 도감(포켓몬·기술·도구 탭)의 사용률 통계 기간: 시즌(레귤레이션, 달 합산) 또는 월. 세 탭이 같은 선택을 공유한다.
// 데이터는 통계 화면과 같은 public/data/stats/ (useUsageStats). 싱글/더블은 useUsageKind.
// 기본 = 현재 레귤레이션 시즌, 없으면 마지막 시즌.

import { useUsageKind } from '~/composables/useUsageKind'
import { useUsageStats } from '~/composables/useUsageStats'
import { periodsOf, statsKey, type StatsMeta, type StatsMon } from '~/utils/usageStats'

export function useDexPeriod() {
  const { t, locale } = useI18n()
  const reg = useRegulation()
  const kind = useUsageKind()
  const stats = useUsageStats()

  const index = computed(() => stats.index())
  const list = computed<StatsMeta[]>(() => index.value?.[kind.value] ?? [])
  const seasons = computed(() => periodsOf(list.value, 'season'))
  const months = computed(() => periodsOf(list.value, 'month'))
  // 고른 기간 (statsKey, 빈 문자열 = 기본)
  const picked = useState('dex-period', () => '')
  const current = computed<StatsMeta | undefined>(
    () =>
      list.value.find((p) => statsKey(p) === picked.value) ??
      seasons.value.find((p) => p.reg === reg.active.value?.id) ??
      seasons.value.at(-1),
  )
  const periodKey = computed({
    get: () => (current.value ? statsKey(current.value) : ''),
    set: (v: string) => (picked.value = v),
  })
  // 순위표 (받는 중 undefined, 없음 null)
  const table = computed(() => stats.table(kind.value, current.value))
  const loading = computed(
    () => index.value === undefined || (!!current.value && table.value === undefined),
  )
  // 포켓몬 id → [순위, 통계]
  const byId = computed(() => {
    const m = new Map<string, { rank: number; mon: StatsMon }>()
    table.value?.pokemon.forEach((mon, i) => m.set(mon.id, { rank: i + 1, mon }))
    return m
  })

  // 칩 고르기: 레귤레이션(시즌) → 그 레귤레이션의 시즌 전체 / 월
  const monthsOf = (regId: string) => months.value.filter((m) => m.reg === regId)
  const select = (p: StatsMeta) => (picked.value = statsKey(p))
  // 레귤레이션을 바꾸면 그 시즌 전체
  const selectReg = (regId: string) => {
    const s = seasons.value.find((x) => x.reg === regId)
    if (s) select(s)
  }
  // 월 짧은 이름 (4월 / Apr / 4月)
  const monthShort = (period: string) => {
    const [y, m] = period.split('-').map(Number)
    if (!y || !m) return period
    return new Intl.DateTimeFormat(locale.value, { month: 'short', timeZone: 'UTC' }).format(
      Date.UTC(y, m - 1, 1),
    )
  }

  const periodLabel = (p: StatsMeta) =>
    p.period === 'season'
      ? t('usageStats.season', { reg: p.reg })
      : t('usageStats.month', { month: p.period, reg: p.reg })
  const monthsText = (p: StatsMeta) =>
    p.months.length > 1 ? `${p.months[0]} ~ ${p.months.at(-1)}` : (p.months[0] ?? '')

  return {
    kind,
    list,
    seasons,
    months,
    current,
    periodKey,
    table,
    loading,
    byId,
    periodLabel,
    monthsText,
    monthsOf,
    select,
    selectReg,
    monthShort,
  }
}
