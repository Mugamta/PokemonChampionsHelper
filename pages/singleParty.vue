<template>
  <div style="display:flex; gap:16px; padding:16px;">
    <div style="flex:1; display:grid; grid-template-columns: repeat(2, 1fr); gap:16px;">
      <div
        v-for="index in 6"
        :key="'left' + index"
        style="display:flex; border:2px solid #000; padding:12px; gap:16px; box-sizing: border-box; background: #666;"
      >
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

        <div style="display:flex; flex-direction:column; justify-content:space-between; height: 160px; align-items:center; padding: 4px 0;">
          <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
            <img
              src="/public/pokemon.webp"
              style="width:80px; height:80px; object-fit:cover;"
            >
            <select 
              v-model="selectedTool[index - 1]" 
              style="width:90px; font-size:12px; padding: 4px;"
              @change="calculateAllStats(index - 1)"
            >
              <option
                value=""
                disabled
              >
                도구 선택
              </option>
              <option
                v-for="t in itemList"
                :key="t"
                :value="t"
              >
                {{ t }}
              </option>
            </select>
          </div>

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

                <span 
                  v-if="stat.key === 'H'" 
                  style="font-size: 11px; color: #ffeb3b; margin-left: 8px; white-space: nowrap;"
                >
                  {{ checkHpCondition(index - 1) }}
                </span>

                <span 
                  v-if="stat.key === 'B' || stat.key === 'D'" 
                  style="font-size: 11px; color: #ddd; margin-left: 8px; white-space: nowrap;"
                >
                  [{{ stat.key === 'B' ? '물리' : '특수' }}: {{ calcDurability(index - 1, stat.key) }}]
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px;">
          <div
            v-for="k in 4"
            :key="k"
            style="display:flex; align-items:center; gap:12px;"
          >
            <span
              style="
				width: 50px;
				font-size: 12px;
				text-align: right;
				white-space: nowrap;
			"
            >
              기술{{ k }}
            </span>

            <span style="color:#666;">
              →
            </span>

            <v-autocomplete
              :disabled="!selectedPokemon[index - 1]"
              :items="moveOptions(index - 1)"
              density="compact"
              hide-details
              menu-icon=""
              style="width:175px; font-size:12px;"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch } from 'vue'
import { items } from '@/data/item';
import { calculateStat } from '@/utils/stat';

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

    const itemList = [...items]

    const natureOptions = [
      '무보정',
      '외로움(공격↑ 방어↓)', '고집(공격↑ 특공↓)', '개구쟁이(공격↑ 특방↓)', '용감(공격↑ 스피드↓)', '------------------------------',
      '대담(방어↑ 공격↓)', '장난꾸러기(방어↑ 특공↓)', '촐랑(방어↑ 특방↓)', '무사태평(방어↑ 스피드↓)', '------------------------------',
      '조심(특공↑ 공격↓)', '의젓(특공↑ 방어↓)', '덜렁(특공↑ 특방↓)', '냉정(특공↑ 스피드↓)', '------------------------------',
      '차분(특방↑ 공격↓)', '얌전(특방↑ 방어↓)', '신중(특방↑ 특공↓)', '건방(특방↑ 스피드↓)', '------------------------------',
      '겁쟁이(스피드↑ 공격↓)', '성급(스피드↑ 방어↓)', '명랑(스피드↑ 특공↓)', '천진난만(스피드↑ 특방↓)'
    ]

    const natures = {
      '무보정': {},
      '외로움(공격↑ 방어↓)': { up: 'A', down: 'B' }, '고집(공격↑ 특공↓)': { up: 'A', down: 'C' }, '개구쟁이(공격↑ 특방↓)': { up: 'A', down: 'D' }, '용감(공격↑ 스피드↓)': { up: 'A', down: 'S' },
      '대담(방어↑ 공격↓)': { up: 'B', down: 'A' }, '장난꾸러기(방어↑ 특공↓)': { up: 'B', down: 'C' }, '촐랑(방어↑ 특방↓)': { up: 'B', down: 'D' }, '무사태평(스피드↑ 방어↓)': { up: 'B', down: 'S' },
      '조심(특공↑ 공격↓)': { up: 'C', down: 'A' }, '의젓(특공↑ 방어↓)': { up: 'C', down: 'B' }, '덜렁(특공↑ 특방↓)': { up: 'C', down: 'D' }, '냉정(특공↑ 스피드↓)': { up: 'C', down: 'S' },
      '차분(특공↑ 공격↓)': { up: 'D', down: 'A' }, '얌전(특방↑ 방어↓)': { up: 'D', down: 'B' }, '신중(특방↑ 특공↓)': { up: 'D', down: 'C' }, '건방(특방↑ 스피드↓)': { up: 'D', down: 'S' },
      '겁쟁이(스피드↑ 공격↓)': { up: 'S', down: 'A' }, '성급(스피드↑ 방어↓)': { up: 'S', down: 'B' }, '명랑(스피드↑ 특공↓)': { up: 'S', down: 'B' }, '천진난만(스피드↑ 특방↓)': { up: 'S', down: 'C' },
    }

    const pokemons = ref([])
    const pokemonMap = ref({})
    const pokemonNames = ref([])

    const search = ref(Array(6).fill(''))
    const selectedPokemon = ref(Array(6).fill(''))
    const selectedAbility = ref(Array(6).fill(''))
    const selectedNature = ref(Array(6).fill('노력'))
    
    // 도구 및 기술의 상태 추적을 위한 상태 선언
    const selectedTool = ref(Array(6).fill(''))
    const selectedMoves = ref(Array(6).fill(null).map(() => Array(4).fill('')))

    const START_ID = 987
    const END_ID = 1010

    const inputStats = ref(
      Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
    )

    const calcStats = ref(
      Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
    )

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

      const Base_Stat = pokemonData.stats[statKey] || 0 // 종족값
      const Stat_Points = inputStats.value[pokemonIndex][statKey] || 0 // 노력치
      const Nature = selectedNature.value[pokemonIndex]?.replace(/\([^)]*\)/g, '') || '노력' // 성격
      const Item = selectedTool.value[pokemonIndex] || '' // 도구

      const result = calculateStat(statKey, Base_Stat, Stat_Points, Nature, Item)
      calcStats.value[pokemonIndex][statKey] = result
    }

    const calculateAllStats = (pokemonIndex) => {
      const keys = ['H', 'A', 'B', 'C', 'D', 'S']
      keys.forEach(key => updateSingleStat(pokemonIndex, key))
    }

    // 내구력 계산 함수
    const calcDurability = (pokemonIndex, statKey) => {
      const hp = calcStats.value[pokemonIndex]?.H || 0
      const defense = calcStats.value[pokemonIndex]?.[statKey] || 0
      
      if (hp === 0 || defense === 0) return 0
      return Math.floor((hp * defense) / 0.411)
    }

    // HP 조정 배수 순차 판정 함수
    const checkHpCondition = (pokemonIndex) => {
      const hp = calcStats.value[pokemonIndex]?.H || 0
      if (hp === 0) return ''

      const ability = selectedAbility.value[pokemonIndex]
      const tool = selectedTool.value[pokemonIndex]
      const moves = selectedMoves.value[pokemonIndex] || []

      // 1순위: 특성 [재생력] 검사
      if (ability === '재생력') {
        return hp % 3 === 0 ? '3n O' : '3n X'
      }

      // 2순위: 특성 [포이즌힐] 검사
      if (ability === '포이즌힐') {
        return hp % 8 === 1 ? '8n+1 O' : '8n+1 X'
      }

      // 3순위: 도구 [먹다남은음식], [검은진흙] 검사
      if (tool === '먹다남은음식' || tool === '검은진흙') {
        return hp % 16 === 0 ? '16n O' : '16n X'
      }

      // 4순위: 기술 리스트 중 [대타출동] 검사
      if (moves.includes('대타출동')) {
        return hp % 16 === 1 ? '16n+1 O' : '16n+1 X'
      }

      // 5순위: 기술 리스트 중 [씨뿌리기] 검사
      if (moves.includes('씨뿌리기')) {
        return (hp + 1) % 8 === 0 ? '8n-1 O' : '8n-1 X'
      }

      // 6순위: 위 조건에 모두 충족되지 않을 때의 기본값
      return (hp + 1) % 16 === 0 ? '16n-1 O' : '16n-1 X'
    }

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
              selectedTool.value[index] = ''
              selectedMoves.value[index] = Array(4).fill('')
              calculateAllStats(index)
            } else {
              selectedAbility.value[index] = ''
              selectedNature.value[index] = '노력'
              selectedTool.value[index] = ''
              selectedMoves.value[index] = Array(4).fill('')
              inputStats.value[index] = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }
              calcStats.value[index] = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }
            }
          }
        })
      }
    )

    const loadPokemon = async () => {
      const validResults = []
      for (let i = START_ID; i <= END_ID; i++) {
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
      itemList,
      natureOptions,
      selectedNature,
      pokemonNames,
      search,
      selectedPokemon,
      selectedAbility,
      selectedTool,
      selectedMoves,
      filteredPokemonNames,
      abilityOptions,
      moveOptions,
      centerTexts,
      calcStats,
      inputStats,
      updateSingleStat,
      calculateAllStats,
      getNatureMultiplier,
      calcDurability,
      checkHpCondition
    }
  }
}
</script>
<style>
.v-autocomplete__selection-text {
	font-size: 12px !important;
}
</style>