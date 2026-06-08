<template>
  <div style="display:flex; gap:16px; padding:16px;">
    <div style="flex:1; display:grid; grid-template-columns: repeat(2, 1fr); gap:16px;">
      <div
        v-for="index in 6"
        :key="'left' + index"
        style="display:flex; border:2px solid #000; padding:12px; gap:16px; box-sizing: border-box; background: #666;"
      >
        <!-- 포켓몬 및 특성 선택 -->
        <div style="display:flex; flex-direction:column; gap:6px; align-items:center;">
          <img
            src="/public/pokemon.webp"
            style="width:160px; height:160px; object-fit:cover;"
          >
          <v-autocomplete
            v-model="selectedPokemon[index - 1]"
            :items="pokemonNames"
            label="포켓몬 선택"
            density="compact"
            hide-details
            style="width: 160px;"
            :menu-props="{
              location: 'end top',
              offset: [0, 8]
            }"
          />
          
          <select 
            v-model="selectedAbility[index - 1]"
            :disabled="!selectedPokemon[index - 1]"
            style="width:160px; font-size:12px; padding: 4px;"
          >
            <option
              v-for="a in abilityOptions(index - 1)"
              :key="a"
              :value="a"
            >
              {{ a }}
            </option>
          </select>
        </div>

        <!-- 도구 및 성격 선택 영역 (상하 벌리기 정렬 적용) -->
        <div style="display:flex; flex-direction:column; justify-content:space-between; height: 160px; align-items:center; padding: 4px 0;">
          <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
            <img
              src="/public/pokemon.webp"
              style="width:80px; height:80px; object-fit:cover;"
            >
            <select style="width:90px; font-size:12px; padding: 4px;">
              <option
                disabled
                selected
              >
                도구 선택
              </option>
              <option
                v-for="t in toolOptions"
                :key="t"
              >
                {{ t }}
              </option>
            </select>
          </div>

          <!-- 성격 선택 -->
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:11px; color:#555; text-align:center;">성격</span>
            <select 
              v-model="selectedNature[index - 1]"
              :disabled="!selectedPokemon[index - 1]"
              style="width:120px; font-size:12px; padding: 4px;"
              @change="calculateAllStats(index - 1)"
            >
              <option
                v-for="n in natureOptions"
                :key="n"
                :value="n"
              >
                {{ n }}
              </option>
            </select>
          </div>
        </div>

        <!-- 능력치 입력 및 실능치 출력 영역 (성격 보정 색상 반영) -->
        <div style="flex:1;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div
              v-for="(stat, j) in stats"
              :key="j"
              style="display:flex; align-items:center; gap:12px;"
            >
              <span style="font-size:12px; white-space:nowrap; width: 70px;">
                {{ stat.key }} ({{ stat.name }})
              </span>

              <input
                v-model.number="inputStats[index - 1][stat.key]"
                type="number"
                min="0"
                max="32"
                style="width:50px; border: 1px solid #ccc; padding: 2px;"
                @input="updateSingleStat(index - 1, stat.key)"
              >

              <div style="display:flex; align-items:center; gap:4px; font-size:12px;">
                <span style="color: #666;">→</span>
                <span 
                  style="font-weight: bold; width: 35px; text-align: right;"
                  :style="{ 
                    color: getNatureMultiplier(index - 1, stat.key) === 1.1 ? 'red' : 
                      getNatureMultiplier(index - 1, stat.key) === 0.9 ? 'blue' : 'white' 
                  }"
                >
                  {{ calcStats[index - 1]?.[stat.key] || 0 }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 기술 선택 영역 (가로 정렬) -->
        <div style="display:flex; flex-direction:column; gap:8px; justify-content:center;">
          <div
            v-for="k in 4"
            :key="k"
            style="display:flex; align-items:center; gap:8px; font-size:12px;"
          >
            <span style="white-space:nowrap; width: 65px;">{{ k }}번째 기술</span>
            <select 
              :disabled="!selectedPokemon[index - 1]"
              style="width:14ch; padding: 2px;"
            >
              <option
                disabled
                selected
                value=""
              >
                선택
              </option>
              <option
                v-for="m in moveOptions(index - 1)"
                :key="m"
                :value="m"
              >
                {{ m }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch } from 'vue'

export default {
  setup() {
    const stats = [
      { key: 'H', name: '체력' },
      { key: 'A', name: '공격' },
      { key: 'B', name: '방어' },
      { key: 'C', name: '특수공격' },
      { key: 'D', name: '특수방어' },
      { key: 'S', name: '스피드' }
    ]

    const toolOptions = [
      '생명의구슬',
      '기합의띠',
      '먹다남은음식'
    ]

    const natureOptions = [
      '노력, 온순, 수줍음, 성실, 변덕 (무보정)',
      '외로움(공격↑ 방어↓)', '고집(공격↑ 특공↓)', '개구쟁이(공격↑ 특방↓)', '용감(공격↑ 스피드↓)',
      '대담(방어↑ 공격↓)', '장난꾸러기(방어↑ 특공↓)', '촐랑(방어↑ 특방↓)', '무사태평(방어↑ 스피드↓)',
      '조심(특공↑ 공격↓)', '의젓(특공↑ 방어↓)', '덜렁(특공↑ 특방↓)', '냉정(특공↑ 스피드↓)',
      '차분(특방↑ 공격↓)', '얌전(특방↑ 방어↓)', '신중(특방↑ 특공↓)', '건방(특방↑ 스피드↓)',
      '겁쟁이(스피드↑ 공격↓)', '성급(스피드↑ 방어↓)', '명랑(스피드↑ 특공↓)', '천진난만(스피드↑ 특방↓)'
    ]

    const natures = {
      '노력, 온순, 수줍음, 성실, 변덕 (무보정)': {},
      '외로움(공격↑ 방어↓)': { up: 'A', down: 'B' }, '고집(공격↑ 특공↓)': { up: 'A', down: 'C' }, '개구쟁이(공격↑ 특방↓)': { up: 'A', down: 'D' }, '용감(공격↑ 스피드↓)': { up: 'A', down: 'S' },
      '대담(방어↑ 공격↓)': { up: 'B', down: 'A' }, '장난꾸러기(방어↑ 특공↓)': { up: 'B', down: 'C' }, '촐랑(방어↑ 특방↓)': { up: 'B', down: 'D' }, '무사태평(스피드↑ 방어↓)': { up: 'B', down: 'S' },
      '조심(특공↑ 공격↓)': { up: 'C', down: 'A' }, '의젓(방어↑ 특방↓)': { up: 'C', down: 'B' }, '덜렁(방어↑ 특방↓)': { up: 'C', down: 'D' }, '냉정(특공↑ 스피드↓)': { up: 'C', down: 'S' },
      '차분(특공↑ 스피드↓)': { up: 'D', down: 'A' }, '얌전(방어↑ 특방↓)': { up: 'D', down: 'B' }, '신중(특방↑ 스피드↓)': { up: 'D', down: 'C' }, '건방(스피드↑ 공격↓)': { up: 'D', down: 'S' },
      '겁쟁이(스피드↑ 방어↓)': { up: 'S', down: 'A' }, '명랑(스피드↑ 방어↓)': { up: 'S', down: 'B' }, '천진난만(특공↑ 스피드↓)': { up: 'S', down: 'C' }, '성실(공격↑ 방어↓)': { up: 'S', down: 'D' }
    }

    const pokemons = ref([])
    const pokemonMap = ref({})
    const pokemonNames = ref([])

    const search = ref(Array(6).fill(''))
    const selectedPokemon = ref(Array(6).fill(''))
    const selectedAbility = ref(Array(6).fill(''))
    const selectedNature = ref(Array(6).fill('노력'))
    const MAX_ID = 30 // 1010

    const inputStats = ref(
      Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
    )

    const calcStats = ref(
      Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
    )

    // 성격 보정수치 산출 함수
    const getNatureMultiplier = (pokemonIndex, statKey) => {
      const natureName = selectedNature.value[pokemonIndex] || '노력'
      const natureEffect = natures[natureName]
      if (!natureEffect) return 1.0

      if (natureEffect.up === statKey) return 1.1
      if (natureEffect.down === statKey) return 0.9
      return 1.0
    }

    const updateSingleStat = (pokemonIndex, statKey) => {
      const pokemonName = selectedPokemon.value[pokemonIndex]
      if (!pokemonName) return

      const pokemonData = pokemonMap.value[pokemonName]
      if (!pokemonData || !pokemonData.stats) {
        calcStats.value[pokemonIndex][statKey] = 0
        return
      }

      const baseStat = pokemonData.stats[statKey] || 0
      const iv = 31 
      const championsEv = inputStats.value[pokemonIndex][statKey] || 0 

      let result = 0

      if (statKey === 'H') {
        const baseHp = Math.floor(((baseStat * 2 + iv) * 50) / 100) + 50 + 10
        result = baseHp + championsEv
        if (baseStat === 1) result = 1
      } else {
        const natureValue = getNatureMultiplier(pokemonIndex, statKey)
        const baseOther = Math.floor((Math.floor(((baseStat * 2 + iv) * 50) / 100) + 5) * natureValue)
        result = baseOther + championsEv
      }

      calcStats.value[pokemonIndex][statKey] = result
    }

    const calculateAllStats = (pokemonIndex) => {
      const keys = ['H', 'A', 'B', 'C', 'D', 'S']
      keys.forEach(key => updateSingleStat(pokemonIndex, key))
    }

    // 얕은 복사 방식으로 싱크를 맞춘 단일 watch
    watch(
      () => [...selectedPokemon.value],
      (newVal, oldVal) => {
        if (!oldVal) return
        newVal.forEach((pokemon, index) => {
          if (pokemon !== oldVal[index]) {
            if (pokemon) {
              const abilities = pokemonMap.value[pokemon]?.abilities || []
              selectedAbility.value[index] = abilities[0] || ''
              selectedNature.value[index] = '노력'
              calculateAllStats(index)
            } else {
              selectedAbility.value[index] = ''
              selectedNature.value[index] = '노력'
              inputStats.value[index] = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }
              calcStats.value[index] = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }
            }
          }
        })
      }
    )

    const loadPokemon = async () => {
      const validResults = []
      for (let i = 1; i <= MAX_ID; i++) {
        try {
          const res = await fetch(`/pokemon_list/${i}.json`)
          if (!res.ok) continue
          validResults.push(await res.json())
        } catch {
          continue
        }
      }
      pokemons.value = validResults
      pokemonMap.value = Object.fromEntries(validResults.map(p => [p.name, p]))
      pokemonNames.value = validResults.map(p => p.name)
    }

    const filteredPokemonNames = (i) => {
      const query = search.value[i]?.toLowerCase() || ''
      return pokemonNames.value.filter(name => name.toLowerCase().includes(query))
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
      natureOptions,
      selectedNature,
      pokemonNames,
      search,
      selectedPokemon,
      selectedAbility,
      filteredPokemonNames,
      abilityOptions,
      moveOptions,
      centerTexts,
      calcStats,
      inputStats,
      updateSingleStat,
      calculateAllStats,
      getNatureMultiplier
    }
  }
}
</script>