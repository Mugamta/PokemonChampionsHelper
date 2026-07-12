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
  const hasStartedLoading = useState('pkmn-load-started', () => false)

  // GitHub Pages 서브 경로(/PokemonChampionsHelper/) 대응: fetch는 baseURL을 자동으로 안 붙여줘서 직접 붙여야 함
  const config = useRuntimeConfig()
  const baseURL = config.app.baseURL || '/'

  const START_ID = 1
  const END_ID = 1023

  const loadPokemonList = async () => {
    // hasStartedLoading을 맨 처음, await 이전에 동기적으로 세팅해서
    // 거의 동시에 여러 컴포넌트가 호출해도 두 번째 호출은 확실히 막힘
    if (isLoaded.value || hasStartedLoading.value) return
    hasStartedLoading.value = true

    isLoading.value = true
    loadedCount.value = 0
    totalCount.value = END_ID - START_ID + 1

    const fetchOne = async (id) => {
      try {
        const res = await fetch(`${baseURL}pokemon_list/${id}.json`)
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

      // 한꺼번에 1000개+ 를 쏘면 브라우저가 ERR_INSUFFICIENT_RESOURCES로 거부하므로
      // 동시에 최대 CONCURRENCY개씩만 실행되도록 제한
      const CONCURRENCY = 20
      const results = new Array(ids.length)
      let cursor = 0

      const worker = async () => {
        while (cursor < ids.length) {
          const current = cursor++
          results[current] = await fetchOne(ids[current])
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker)
      )

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