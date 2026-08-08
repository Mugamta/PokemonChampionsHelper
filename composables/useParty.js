export const useParty = () => {
  // Nuxt useState: SSR-safe하게 앱 전역에서 공유되는 상태
  const selectedPokemon = useState('party-selectedPokemon', () => Array(6).fill(''))

  const isPartyComplete = computed(() =>
    selectedPokemon.value.every((name) => !!name)
  )

  return { selectedPokemon, isPartyComplete }
}