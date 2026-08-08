export const useOpponentParty = () => {
  const selectedPokemon = useState('opponent-selectedPokemon', () => Array(6).fill(''))
  const selectedAbility = useState('opponent-selectedAbility', () => Array(6).fill(''))
  const selectedNature = useState('opponent-selectedNature', () => Array(6).fill('무보정'))
  const selectedTool = useState('opponent-selectedTool', () => Array(6).fill(''))
  const selectedMoves = useState('opponent-selectedMoves', () =>
    Array(6).fill(null).map(() => Array(4).fill(''))
  )
  const inputStats = useState('opponent-inputStats', () =>
    Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
  )
  const calcStats = useState('opponent-calcStats', () =>
    Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
  )

  return {
    selectedPokemon,
    selectedAbility,
    selectedNature,
    selectedTool,
    selectedMoves,
    inputStats,
    calcStats,
  }
}