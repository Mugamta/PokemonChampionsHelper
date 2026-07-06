// composables/useEligiblePokemon.js
// 전체 포켓몬 목록 + 현재 활성 레귤레이션을 조합해서, select에 넣을 이름 목록을 만듭니다.
// 주의: 레귤레이션 코드("0026-001")는 폼까지 구분하지만, 현재 포켓몬 데이터는 도감번호(id)만
// 있어서 폼 구분 없이 도감번호 단위로만 매칭합니다.

export function useEligiblePokemon() {
  const { pokemons, pokemonMap, isLoading: isLoadingPokemon, loadedCount, totalCount, loadPokemonList } =
    usePokemonList()
  const { activeRegulation, isLoadingRegulations, loadRegulations, currentTime } =
    useRegulations()

  const eligibleDexIds = computed(() => {
    if (!activeRegulation.value) return null // 레귤레이션이 없으면 전체 허용
    return new Set(
      activeRegulation.value.pokemon_list.map((code) => parseInt(code.split('-')[0], 10))
    )
  })

  const eligiblePokemons = computed(() => {
    if (!eligibleDexIds.value) return pokemons.value
    return pokemons.value.filter((p) => eligibleDexIds.value.has(p.id))
  })

  const pokemonNames = computed(() => eligiblePokemons.value.map((p) => p.name))

  return {
    pokemonMap,
    pokemonNames,
    eligiblePokemons,
    isLoadingPokemon,
    isLoadingRegulations,
    loadedCount,
    totalCount,
    loadPokemonList,
    loadRegulations,
    activeRegulation,
    currentTime,
  }
}
