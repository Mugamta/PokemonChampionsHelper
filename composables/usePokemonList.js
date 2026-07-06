// composables/usePokemonList.js
// 전체 포켓몬 스탯 데이터를 앱 전역(useState)에 한 번만 로드해서 공유합니다.
// 여러 컴포넌트에서 이 함수를 호출해도 실제 fetch는 최초 1회만 일어납니다.

export function usePokemonList() {
  const pokemons = useState('pkmn-all-list', () => [])
  const pokemonMap = useState('pkmn-all-map', () => ({}))
  const isLoading = useState('pkmn-loading', () => true)
  const loadedCount = useState('pkmn-loaded-count', () => 0)
  const totalCount = useState('pkmn-total-count', () => 0)
  const isLoaded = useState('pkmn-loaded-flag', () => false)

  const START_ID = 1
  const END_ID = 1023

  const loadPokemonList = async () => {
    // 이미 로드됐거나 로딩 중이면 다시 실행하지 않음 (중복 fetch 방지)
    if (isLoaded.value || (isLoading.value && pokemons.value.length === 0 && loadedCount.value > 0)) {
      return
    }
    if (isLoaded.value) return

    isLoading.value = true
    loadedCount.value = 0
    totalCount.value = END_ID - START_ID + 1

    const fetchOne = async (id) => {
      try {
        const res = await fetch(`/pokemon_list/${id}.json`)
        if (res.ok) {
          return await res.json()
        }
        return null
      } catch {
        return null
      } finally {
        loadedCount.value += 1
      }
    }

    try {
      const ids = []
      for (let i = START_ID; i <= END_ID; i++) ids.push(i)

      const results = await Promise.all(ids.map(fetchOne))
      const validResults = results.filter(Boolean)

      pokemons.value = validResults
      pokemonMap.value = Object.fromEntries(validResults.map((p) => [p.name, p]))
      isLoaded.value = true
    } finally {
      isLoading.value = false
    }
  }

  return {
    pokemons,
    pokemonMap,
    isLoading,
    loadedCount,
    totalCount,
    loadPokemonList,
  }
}
