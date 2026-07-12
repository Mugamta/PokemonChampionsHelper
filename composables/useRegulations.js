// composables/useRegulations.js
// public/regulation/*.json 을 읽어서 (기간별 참가 가능 포켓몬 목록) 전역 상태로 관리합니다.
// - index.json 에 파일명 목록이 있어야 합니다 (정적 호스팅은 폴더 목록을 직접 조회할 수 없기 때문).
// - 현재 시각에 맞는 레귤레이션을 자동으로 찾고, 사용자가 수동으로 다른 걸 선택할 수도 있습니다.

function parsePeriod(periodStr) {
  // "2026/04/08 00:00 ~ 2026/06/17 10:59" 형태 파싱
  const [startStr, endStr] = periodStr.split('~').map((s) => s.trim())

  const toDate = (s) => {
    const [datePart, timePart] = s.split(' ')
    const [y, m, d] = datePart.split('/').map(Number)
    const [hh, mm] = (timePart || '00:00').split(':').map(Number)
    return new Date(y, m - 1, d, hh, mm, 0)
  }

  return { start: toDate(startStr), end: toDate(endStr) }
}

export function useRegulations() {
  const regulations = useState('reg-list', () => [])
  const isLoadingRegulations = useState('reg-loading', () => true)
  const isRegulationsLoaded = useState('reg-loaded-flag', () => false)
  const hasStartedLoadingRegulations = useState('reg-load-started', () => false)
  const selectedRegulationIndex = useState('reg-selected-index', () => null) // null = 자동(시간 기준)
  const currentTime = useState('reg-current-time', () => new Date())

  // GitHub Pages 서브 경로(/PokemonChampionsHelper/) 대응
  const config = useRuntimeConfig()
  const baseURL = config.app.baseURL || '/'

  const loadRegulations = async () => {
    if (isRegulationsLoaded.value || hasStartedLoadingRegulations.value) return
    hasStartedLoadingRegulations.value = true

    isLoadingRegulations.value = true
    try {
      const indexRes = await fetch(`${baseURL}regulation/index.json`)
      const fileNames = indexRes.ok ? await indexRes.json() : []

      const items = await Promise.all(
        fileNames.map(async (fileName) => {
          try {
            const res = await fetch(`${baseURL}regulation/${fileName}`)
            if (!res.ok) return null
            const data = await res.json()
            const { start, end } = parsePeriod(data.period)
            return { ...data, fileName, start, end }
          } catch {
            return null
          }
        })
      )

      regulations.value = items.filter(Boolean).sort((a, b) => a.start - b.start)
      isRegulationsLoaded.value = true
    } finally {
      isLoadingRegulations.value = false
    }
  }

  // 1초마다 현재 시각 갱신 (헤더 시계 + 자동 레귤레이션 판정에 사용)
  let timerHandle = null
  const startClock = () => {
    if (timerHandle) return
    currentTime.value = new Date()
    timerHandle = setInterval(() => {
      currentTime.value = new Date()
    }, 1000)
  }

  // 현재 시각 기준으로 유효한 레귤레이션
  const timeMatchedRegulation = computed(() => {
    const now = currentTime.value
    return regulations.value.find((r) => now >= r.start && now <= r.end) || null
  })

  // 실제로 화면에 적용할 레귤레이션 (수동 선택 우선, 없으면 시간 기준)
  const activeRegulation = computed(() => {
    if (
      selectedRegulationIndex.value !== null &&
      regulations.value[selectedRegulationIndex.value]
    ) {
      return regulations.value[selectedRegulationIndex.value]
    }
    return timeMatchedRegulation.value
  })

  const selectRegulation = (index) => {
    selectedRegulationIndex.value = index
  }

  const useAutoRegulation = () => {
    selectedRegulationIndex.value = null
  }

  return {
    regulations,
    isLoadingRegulations,
    currentTime,
    activeRegulation,
    timeMatchedRegulation,
    selectedRegulationIndex,
    loadRegulations,
    startClock,
    selectRegulation,
    useAutoRegulation,
  }
}