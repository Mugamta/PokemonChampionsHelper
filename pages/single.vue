<template>
  <div style="display:flex; gap:16px;">
    
    <!-- 좌측 -->
    <div style="flex:1; display:flex; flex-direction:column; gap:16px;">
      <div v-for="index in 6" :key="'left'+index"
           style="display:flex; border:2px solid #000; padding:12px; gap:16px;">

        <!-- 포켓몬 선택 -->
        <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
          <img src="https://via.placeholder.com/120"
               style="width:80px; height:80px; object-fit:cover;" />

          <input
            v-model="search[index - 1]"
            placeholder="포켓몬 검색"
            style="width:100px; font-size:12px;"
          />

          <select
            v-model="selectedPokemon[index - 1]"
            style="width:100px; font-size:12px;"
          >
            <option disabled value="">포켓몬 선택</option>
            <option v-for="p in filteredPokemonNames(index - 1)" :key="p">
              {{ p }}
            </option>
          </select>

          <!-- 특성 -->
          <select style="width:100px; font-size:12px;">
            <option disabled selected>특성 선택</option>
            <option v-for="a in abilityOptions(index - 1)" :key="a">
              {{ a }}
            </option>
          </select>
        </div>

        <!-- 도구 -->
        <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
          <img src="https://via.placeholder.com/80"
               style="width:80px; height:80px; object-fit:cover;" />

          <select style="width:90px; font-size:12px;">
            <option selected disabled>도구 선택</option>
            <option v-for="t in toolOptions" :key="t">{{ t }}</option>
          </select>
        </div>

        <!-- 능력치 -->
        <div style="flex:1;">
          <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:6px 12px;">
            <div v-for="(stat, j) in stats" :key="j"
                 style="display:flex; justify-content:space-between; align-items:center;">
              
              <span style="font-size:12px; white-space:nowrap;">
                {{ stat.key }} ({{ stat.name }})
              </span>

              <input type="number" min="0" max="32" value="0" style="width:60px;" />
            </div>
          </div>
        </div>

        <!-- 기술 -->
        <div style="display:flex; gap:8px; align-items:center;">
          <div v-for="k in 4" :key="k"
               style="display:flex; flex-direction:column; font-size:12px; align-items:center;">
            <span>{{ k }}번째 기술</span>
            <select style="width:13ch;">
              <option selected disabled>선택</option>
              <option v-for="m in moveOptions(index - 1)" :key="m">{{ m }}</option>
            </select>
          </div>
        </div>

      </div>
    </div>

    <!-- 중앙 -->
    <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:6px; border:2px dashed #aaa;">
      <div v-for="(line, idx) in centerTexts" :key="idx">
        {{ line }}
      </div>
    </div>

    <!-- 우측 -->
    <div style="flex:1; display:flex; flex-direction:column; gap:16px;">
      <div v-for="i in 6" :key="'right'+i"
           style="display:flex; border:2px solid #000; padding:12px; gap:16px;">

        <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
          <img src="https://via.placeholder.com/120"
               style="width:80px; height:80px; object-fit:cover;" />

          <select style="width:100px; font-size:12px;">
            <option disabled selected>포켓몬 선택</option>
            <option v-for="p in pokemonNames" :key="p">{{ p }}</option>
          </select>
        </div>

      </div>
    </div>

  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'

export const stats = [
  { key: 'H', name: '체력' },
  { key: 'A', name: '공격' },
  { key: 'B', name: '방어' },
  { key: 'C', name: '특수공격' },
  { key: 'D', name: '특수방어' },
  { key: 'S', name: '스피드' }
]

export const toolOptions = ['생명의구슬','기합의띠','먹다남은음식']

export const setup = () => {
  const pokemons = ref([])
  const pokemonMap = ref({})

  const pokemonNames = ref([])

  const search = ref(Array(6).fill(''))
  const selectedPokemon = ref(Array(6).fill(''))

  const loadPokemon = async () => {
    const MAX_ID = 1025

    const results = await Promise.all(
      Array.from({ length: MAX_ID }, (_, i) =>
        fetch(`/pokemon_list/${i + 1}.json`).then(r => r.json())
      )
    )

    pokemons.value = results

    pokemonMap.value = Object.fromEntries(
      results.map(p => [p.name, p])
    )

    pokemonNames.value = results.map(p => p.name)
  }

  const filteredPokemonNames = (i) => {
    const query = search.value[i]?.toLowerCase() || ''
    return pokemonNames.value.filter(name =>
      name.toLowerCase().includes(query)
    )
  }

  const abilityOptions = (i) => {
    const name = selectedPokemon.value[i]
    return pokemonMap.value[name]?.abilities || []
  }

  const moveOptions = (i) => {
    const name = selectedPokemon.value[i]
    return pokemonMap.value[name]?.moves || []
  }

  const centerTexts = [
    '포켓몬 A가 포켓몬 B를 반드시 선제 공격으로 난수 1타로 잡는다.',
    '포켓몬 B가 포켓몬 C가 스피드 노력치 22 이하인 경우 선제 공격으로 확 1타로 잡는다.',
    '포켓몬 C가 포켓몬 D가 성격 무보정인 경우 확 1타로 잡는다.'
  ]

  onMounted(loadPokemon)

  return {
    stats,
    toolOptions,
    pokemonNames,
    search,
    selectedPokemon,
    filteredPokemonNames,
    abilityOptions,
    moveOptions,
    centerTexts
  }
}

export default { setup }
</script>