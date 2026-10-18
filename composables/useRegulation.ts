// composables/useRegulation.ts
// 레귤레이션(기간별 출전 가능 포켓몬). 현재 시각으로 자동 선택하거나 사용자가 고를 수 있다.
// 데이터: public/data/regulations.json (scripts/build-data.mjs 가 public/regulation/*.json 에서 생성)

let clockTimer: ReturnType<typeof setInterval> | null = null

const parseDate = (s: string) => {
  const [d, t] = s.trim().split(' ')
  const [y, m, day] = (d || '').split('/').map(Number)
  const [hh, mm] = (t || '00:00').split(':').map(Number)
  return new Date(y!, (m || 1) - 1, day || 1, hh || 0, mm || 0)
}

export function useRegulation() {
  const gd = useGameData()
  const selectedId = useState<string | null>('reg-selected', () => null) // null = 현재 기간 자동
  const now = useState('reg-now', () => new Date())

  const startClock = () => {
    if (clockTimer || !import.meta.client) return
    now.value = new Date()
    clockTimer = setInterval(() => (now.value = new Date()), 1000)
  }

  const list = computed(() =>
    (gd.data.value?.regulations || []).map((r) => ({ ...r, startDate: parseDate(r.start), endDate: parseDate(r.end) })),
  )
  const timeMatched = computed(() => list.value.find((r) => now.value >= r.startDate && now.value <= r.endDate) || null)
  const active = computed(() => (selectedId.value ? list.value.find((r) => r.id === selectedId.value) : null) || timeMatched.value)

  const phase = (r: { startDate: Date; endDate: Date }) =>
    now.value < r.startDate ? 'upcoming' : now.value > r.endDate ? 'ended' : 'current'

  // 활성 레귤레이션이 없으면(기간 사이 공백) 데이터에 있는 모든 포켓몬 허용
  const allowed = computed(() => (active.value ? new Set(active.value.pokemon) : null))
  const isAllowed = (id: string) => {
    if (!allowed.value) return true
    if (allowed.value.has(id)) return true
    const from = gd.pokemon(id)?.mega?.from
    return !!from && allowed.value.has(from)
  }
  // 슬롯에서 고를 수 있는 포켓몬 (메가 폼 제외 — 메가는 도구로 결정)
  const selectableSpecies = computed(() =>
    Object.values(gd.data.value?.pokemon || {})
      .filter((p) => !p.mega && isAllowed(p.id))
      .map((p) => p.id),
  )

  return { list, active, selectedId, now, startClock, phase, isAllowed, selectableSpecies }
}
