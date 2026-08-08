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

  const isPartyComplete = computed(() => selectedPokemon.value.every((name) => !!name))

  return {
    selectedPokemon,
    selectedAbility,
    selectedNature,
    selectedTool,
    selectedMoves,
    inputStats,
    calcStats,
    isPartyComplete,
  }
}