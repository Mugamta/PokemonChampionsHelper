const STORAGE_KEY = 'pokemon-champions-my-party'
let hydrated = false // 앱 로드당 한 번만 localStorage에서 복원/watch 등록

const emptyParty = () => ({
  selectedPokemon: Array(6).fill(''),
  selectedAbility: Array(6).fill(''),
  selectedNature: Array(6).fill('무보정'),
  selectedTool: Array(6).fill(''),
  selectedMoves: Array(6).fill(null).map(() => Array(4).fill('')),
  inputStats: Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 })),
  calcStats: Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 })),
})

export const useParty = () => {
  const selectedPokemon = useState('party-selectedPokemon', () => Array(6).fill(''))
  const selectedAbility = useState('party-selectedAbility', () => Array(6).fill(''))
  const selectedNature = useState('party-selectedNature', () => Array(6).fill('무보정'))
  const selectedTool = useState('party-selectedTool', () => Array(6).fill(''))
  const selectedMoves = useState('party-selectedMoves', () =>
    Array(6).fill(null).map(() => Array(4).fill(''))
  )
  const inputStats = useState('party-inputStats', () =>
    Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
  )
  const calcStats = useState('party-calcStats', () =>
    Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
  )

  const saveToStorage = () => {
    if (!import.meta.client) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedPokemon: selectedPokemon.value,
        selectedAbility: selectedAbility.value,
        selectedNature: selectedNature.value,
        selectedTool: selectedTool.value,
        selectedMoves: selectedMoves.value,
        inputStats: inputStats.value,
        calcStats: calcStats.value,
      }))
    } catch (e) {
      // 저장 실패(용량 초과 등)는 무시하고 진행
    }
  }

  // 클라이언트에서 최초 1회만: localStorage 복원 + 변경 감지 저장 등록
  if (import.meta.client && !hydrated) {
    hydrated = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.selectedPokemon) selectedPokemon.value = saved.selectedPokemon
        if (saved.selectedAbility) selectedAbility.value = saved.selectedAbility
        if (saved.selectedNature) selectedNature.value = saved.selectedNature
        if (saved.selectedTool) selectedTool.value = saved.selectedTool
        if (saved.selectedMoves) selectedMoves.value = saved.selectedMoves
        if (saved.inputStats) inputStats.value = saved.inputStats
        if (saved.calcStats) calcStats.value = saved.calcStats
      }
    } catch (e) {
      // 저장된 값이 손상됐으면 무시하고 기본값 유지
    }

    watch(
      [selectedPokemon, selectedAbility, selectedNature, selectedTool, selectedMoves, inputStats, calcStats],
      saveToStorage,
      { deep: true }
    )
  }

  const resetParty = () => {
    const fresh = emptyParty()
    selectedPokemon.value = fresh.selectedPokemon
    selectedAbility.value = fresh.selectedAbility
    selectedNature.value = fresh.selectedNature
    selectedTool.value = fresh.selectedTool
    selectedMoves.value = fresh.selectedMoves
    inputStats.value = fresh.inputStats
    calcStats.value = fresh.calcStats

    if (import.meta.client) {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch (e) {
        // 무시
      }
    }
  }

  // 포켓몬이 6마리 모두 선택되어 있고, 각 포켓몬이 기술을 1개 이상 갖고 있어야 완료로 간주
  const isPartyComplete = computed(() =>
    selectedPokemon.value.every(
      (name, i) => !!name && (selectedMoves.value[i] || []).some((m) => !!m)
    )
  )

  return {
    selectedPokemon,
    selectedAbility,
    selectedNature,
    selectedTool,
    selectedMoves,
    inputStats,
    calcStats,
    isPartyComplete,
    resetParty,
  }
}