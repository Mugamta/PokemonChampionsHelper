<template>
  <div style="display:flex; gap:8px; padding:8px; min-height: 300px;">
    <div
      v-if="isLoading"
      style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; padding: 100px 0; gap:8px;"
    >
      <v-progress-circular
        indeterminate
        color="primary"
        size="64"
        width="6"
      />
      <span style="color:#ccc; font-size:14px;">포켓몬 데이터를 불러오는 중... ({{ loadedCount }} / {{ totalCount }})</span>
    </div>

    <div
      v-else
      style="flex:1; display:grid; grid-template-columns: repeat(2, 1fr); gap:6px;"
    >
      <div
        v-for="index in 6"
        :key="'left' + index"
        style="display:flex; border:2px solid #000; padding:12px; gap:6px; box-sizing: border-box; background: #666; overflow-x: auto;"
      >
        <div style="display:flex; flex-direction:column; gap:6px; align-items:center; flex-shrink:0;">
          <img
            :src="pokemonSprite(index - 1)"
            style="width:160px; height:160px; object-fit:cover; border: 2px solid #333; border-radius: 6px; background: #e8e8e8;"
            @error="$event.target.src = pokemonImg"
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
              value=""
              disabled
            >
              특성
            </option>
            <option
              v-for="a in abilityOptions(index - 1)"
              :key="a"
              :value="a"
            >
              {{ a }}
            </option>
          </select>
        </div>

        <div style="display:flex; flex-direction:column; justify-content:space-between; height: 160px; align-items:center; padding: 4px 0; margin-right: 6px; flex-shrink:0;">
          <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
            <div style="display:flex; align-items:center; gap:6px; width:260px;">
              <img
                :src="itemSprite(index - 1)"
                style="width:80px; height:80px; object-fit:cover; border: 2px solid #333; border-radius: 6px; background: #e8e8e8; flex-shrink:0;"
                @error="$event.target.src = pokemonImg"
              >
              <select 
                v-model="selectedTool[index - 1]" 
                style="width:144px; font-size:12px; padding: 4px;"
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

            <select
              v-model="selectedWeather[index - 1]"
              style="width:260px; font-size:11px; padding: 4px;"
              @change="calculateAllStats(index - 1)"
            >
              <option
                v-for="w in weatherOptions"
                :key="w"
                :value="w"
              >
                {{ w }}
              </option>
            </select>

            <div style="display:flex; flex-direction:column; gap:1px; width:260px;">
              <span style="font-size:10px; color:#ccc;">필드</span>
              <div style="display:flex; flex-wrap:wrap; gap:2px;">
                <button
                  v-for="f in fieldOptions"
                  :key="f"
                  type="button"
                  :style="{
                    fontSize: '10px',
                    padding: '2px 6px',
                    border: '1px solid #999',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: selectedField[index - 1] === f ? '#4caf50' : '#444',
                    color: '#fff'
                  }"
                  @click="toggleField(index - 1, f)"
                >
                  {{ f }}
                </button>
              </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:1px; width:260px;">
              <span style="font-size:10px; color:#ccc;">상태이상</span>
              <div style="display:flex; flex-wrap:wrap; gap:2px;">
                <button
                  v-for="s in statusOptions"
                  :key="s"
                  type="button"
                  :style="{
                    fontSize: '10px',
                    padding: '2px 6px',
                    border: '1px solid #999',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: selectedStatus[index - 1] === s ? '#4caf50' : '#444',
                    color: '#fff'
                  }"
                  @click="toggleStatus(index - 1, s)"
                >
                  {{ s }}
                </button>
              </div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:11px; color:#ccc; text-align:center;">성격</span>
            <select 
              v-model="selectedNature[index - 1]"
              :disabled="!selectedPokemon[index - 1]"
              style="width:260px; font-size:12px; padding: 4px; font-family: monospace; text-align: center;"
              @change="calculateAllStats(index - 1)"
            >
              <option
                v-for="n in natureOptions"
                :key="n"
                :value="n"
                style="text-align: center;"
              >
                {{ natureLabel(n) }}
              </option>
            </select>
          </div>
        </div>

        <div style="width: 265px; flex-shrink:0;">
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div
              v-for="(stat, j) in stats"
              :key="j"
              style="display:flex; align-items:center; gap:6px;"
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
                :class="getInputClass(index)"
                @input="updateSingleStat(index - 1, stat.key)"
              >

              <div style="display:flex; align-items:center; gap:4px; font-size:12px; flex-wrap: wrap; max-width: 136px;">
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
                  v-if="stat.key === 'H' && checkHpCondition(index - 1)" 
                  style="font-size: 11px; color: #ffeb3b; margin-left: 4px; white-space: normal; max-width: 90px;"
                >
                  {{ checkHpCondition(index - 1) }}
                </span>

                <span 
                  v-if="stat.key === 'B' || stat.key === 'D'" 
                  style="font-size: 11px; color: #ddd; margin-left: 4px; white-space: normal; max-width: 90px;"
                >
                  [{{ stat.key === 'B' ? '물리' : '특수' }}: {{ calcDurability(index - 1, stat.key) }}]
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
          <div
            v-for="k in 4"
            :key="k"
            style="display:flex; align-items:center; gap:12px;"
          >
            <span style="color:#666;">→</span>

            <v-autocomplete
              v-model="selectedMoves[index - 1][k - 1]"
              :disabled="!selectedPokemon[index - 1]"
              :items="moveOptions(index - 1)"
              density="compact"
              hide-details
              menu-icon=""
              style="width:120px; font-size:12px;"
            />

            <span
              style="
                width:40px;
                text-align:right;
                font-size:12px;
                color:#ffeb3b;
              "
            >
              {{ getBaseDamage(index - 1, k - 1) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, watch, computed } from 'vue'
import { items } from '@/data/item';
import { calculateStat } from '@/utils/stat';
import { calculateBaseDamage } from '@/utils/move';
import { moves } from '@/data/moves';
import { Nature, NatureMap } from '@/data/nature';

export default {
  setup() {
    // GitHub Pages 서브 경로 대응: public 폴더 이미지도 baseURL을 직접 붙여야 함
    const config = useRuntimeConfig()
    const pokemonImg = (config.app.baseURL || '/') + 'pokemon.webp'

    // 미리 public/pokemon_sprites/{id}.png 로 받아둔 로컬 스프라이트 사용 (download:sprites 스크립트로 준비)
    const pokemonSprite = (index) => {
      const name = selectedPokemon.value[index]
      const data = name ? pokemonMap.value[name] : null
      return data?.id
        ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png`
        : pokemonImg
    }

    // 선택된 도구의 스프라이트 (public/item_sprites/{한글이름}.png, download:item-sprites 스크립트로 준비)
    const itemSprite = (index) => {
      const tool = selectedTool.value[index]
      return tool
        ? `${config.app.baseURL || '/'}item_sprites/${encodeURIComponent(tool)}.png`
        : pokemonImg
    }
    const stats = [
      { key: 'H', name: '체력' },
      { key: 'A', name: '공격' },
      { key: 'B', name: '방어' },
      { key: 'C', name: '특수공격' },
      { key: 'D', name: '특수방어' },
      { key: 'S', name: '스피드' }
    ]

    const itemList = [...items]

    // NatureMap에서 up/down이 둘 다 없는(효과 없는) 성격들은 '무보정' 하나로 묶어서 표시
    const natureOptions = [
      '무보정',
      ...Nature.filter((n) => {
        const effect = NatureMap[n]
        return effect && effect.up && effect.down
      }),
    ]

    const STAT_LABELS = { A: '공격', B: '방어', C: '특수공격', D: '특수방어', S: '스피드' }

    // 한글은 일반 스페이스(半角)로 패딩하면 폭이 안 맞아서, 한글 한 글자와 폭이 같은
    // 전각공백(U+3000)으로 채워서 정렬을 맞춘다.
    const FULL_SPACE = '\u3000'
    const padFull = (str, width) => str + FULL_SPACE.repeat(Math.max(0, width - str.length))

    // 성격 select 옵션 라벨: 성격명은 5자, 능력치명은 4자 폭으로 맞춰서 괄호 위치를 정렬
    const natureLabel = (natureName) => {
      const paddedName = padFull(natureName, 5)
      const effect = NatureMap[natureName]
      if (!effect || !effect.up || !effect.down) return paddedName

      const upLabel = padFull(STAT_LABELS[effect.up], 4)
      const downLabel = padFull(STAT_LABELS[effect.down], 4)
      return `${paddedName}(${upLabel}↑ ${downLabel}↓)`
    }

    // 전역 저장소에서 포켓몬 데이터 + 로딩 상태 가져오기 (여기서 fetch 하지 않음)
    const {
      pokemonMap,
      pokemonNames,
      isLoadingPokemon: isLoading,
      loadedCount,
      totalCount,
    } = useEligiblePokemon()

    const search = ref(Array(6).fill(''))
    const selectedPokemon = ref(Array(6).fill(''))
    const selectedAbility = ref(Array(6).fill('특성'))
    const selectedNature = ref(Array(6).fill('무보정'))
    
    // 도구 및 기술의 상태 추적을 위한 상태 선언
    const selectedTool = ref(Array(6).fill(''))

    // 날씨 / 필드 / 상태이상 (슬롯별 선택)
    const weatherOptions = ['없음', '쾌청', '비', '모래바람', '눈', '큰가뭄', '폭우', '난기류']
    const fieldOptions = ['일렉트릭필드', '그래스필드', '미스트필드', '사이코필드']
    const statusOptions = ['마비', '화상']

    const selectedWeather = ref(Array(6).fill('없음'))
    const selectedField = ref(Array(6).fill('없음'))
    const selectedStatus = ref(Array(6).fill('없음'))
    const selectedMoves = ref(Array(6).fill(null).map(() => Array(4).fill('')))

    const inputStats = ref(
      Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
    )

    const calcStats = ref(
      Array(6).fill(null).map(() => ({ H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }))
    )

    const getNatureMultiplier = (pokemonIndex, statKey) => {
      const natureName = selectedNature.value[pokemonIndex] || '무보정'
      const natureEffect = NatureMap[natureName]
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
      const Nature = selectedNature.value[pokemonIndex]?.replace(/\([^)]*\)/g, '') || '무보정' // 성격
      const Item = selectedTool.value[pokemonIndex] || '' // 도구

      const result = calculateStat(statKey, Base_Stat, Stat_Points, Nature, Item)
      calcStats.value[pokemonIndex][statKey] = result
    }

    const calculateAllStats = (pokemonIndex) => {
      const keys = ['H', 'A', 'B', 'C', 'D', 'S']
      keys.forEach(key => updateSingleStat(pokemonIndex, key))
    }

    // 필드/상태이상 버튼: 이미 선택된 걸 다시 누르면 '없음'(선택 해제)으로 토글
    const toggleField = (pokemonIndex, value) => {
      selectedField.value[pokemonIndex] = selectedField.value[pokemonIndex] === value ? '없음' : value
      calculateAllStats(pokemonIndex)
    }

    const toggleStatus = (pokemonIndex, value) => {
      selectedStatus.value[pokemonIndex] = selectedStatus.value[pokemonIndex] === value ? '없음' : value
      calculateAllStats(pokemonIndex)
    }

    const getInputClass = (index) => {
      const rowData = inputStats.value[index - 1];
  
      if (!rowData) return '';

      // 객체의 모든 Value('A', 'B' 등의 숫자 값)를 더함 -> 노력치의 합
      const totalSum = Object.values(rowData).reduce((sum, value) => {
        return sum + (Number(value) || 0); // 숫자가 아닐 경우를 대비해 예외 처리
      }, 0);
      
      const maxValue = Math.max(...Object.values(rowData))

      // 합이 66을 넘으면 'red-input' 클래스 반환, 아니면 빈 문자열
      return totalSum > 66 || maxValue > 32 ? 'red-input' : '';
    };

    // 내구력 계산 함수
    const calcDurability = (pokemonIndex, statKey) => {
      const hp = calcStats.value[pokemonIndex]?.H || 0
      const defense = calcStats.value[pokemonIndex]?.[statKey] || 0
      
      if (hp === 0 || defense === 0) return 0
      return Math.floor((hp * defense) / 0.411)
    }

    const getBaseDamage = (pokemonIndex, moveIndex) => {
      const moveName = selectedMoves.value[pokemonIndex]?.[moveIndex]

      if (!moveName) {
        return ''
      }

      const move = moves[moveName] || {} 
      const power = move.Power || 0
      const moveType = move.Type || ''
      const stab = true // 자속보정 수정필
      const attack = move.Category === '물리' ? calcStats.value[pokemonIndex]?.A || 0 : calcStats.value[pokemonIndex]?.C || 0
      const ability = selectedAbility.value[pokemonIndex]
      const weather = selectedWeather.value[pokemonIndex] // 슬롯별 선택값 (없음/쾌청/비/모래바람/눈)
      const item = selectedTool.value[pokemonIndex]

      return calculateBaseDamage(power, attack, stab, moveType, ability, weather, item)
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
        return hp % 16 === 0 ? '16n' : ''
      }

      // 4순위: 기술 리스트 중 [대타출동] 검사
      if (moves.includes('대타출동')) {
        return hp % 16 === 1 ? '16n+1' : ''
      }

      // 5순위: 기술 리스트 중 [씨뿌리기] 검사
      if (moves.includes('씨뿌리기')) {
        return (hp + 1) % 8 === 0 ? '8n-1 O' : '8n-1 X'
      }

      // 6순위: 위 조건에 모두 충족되지 않을 때의 기본값
      return (hp + 1) % 16 === 0 ? '16n-1' : ''
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
              selectedNature.value[index] = '무보정'
              selectedTool.value[index] = ''
              selectedMoves.value[index] = Array(4).fill('')
              calculateAllStats(index)
            } else {
              selectedAbility.value[index] = ''
              selectedNature.value[index] = '무보정'
              selectedTool.value[index] = ''
              selectedMoves.value[index] = Array(4).fill('')
              inputStats.value[index] = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }
              calcStats.value[index] = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }
            }
          }
        })
      }
    )

    // 레귤레이션이 바뀌어 선택 가능한 포켓몬 목록(pokemonNames)이 바뀌면,
    // 이미 골라둔 포켓몬이 새 목록에 없으면 선택 해제 (위 watch가 능력치/기술 등도 같이 초기화해줌)
    watch(pokemonNames, (newNames) => {
      selectedPokemon.value.forEach((name, index) => {
        if (name && !newNames.includes(name)) {
          selectedPokemon.value[index] = ''
        }
      })
    })

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

    // 전역 저장소가 아직 안 채워졌으면 로드 트리거 (이미 로드됐으면 내부적으로 아무 일도 안 함)
    // 포켓몬 데이터 로딩은 헤더(TitleBar)에서 레귤레이션 로딩 후 필요한 번호만 트리거함.
    // 여기서 파라미터 없이 부르면 레귤레이션 로딩보다 먼저 실행되어 전체 범위로 잠겨버릴 수 있어서 호출하지 않음.

    return {
      stats,
      itemList,
      natureOptions,
      natureLabel,
      selectedNature,
      pokemonNames,
      search,
      selectedPokemon,
      selectedAbility,
      selectedTool,
      weatherOptions,
      fieldOptions,
      statusOptions,
      selectedWeather,
      selectedField,
      selectedStatus,
      selectedMoves,
      filteredPokemonNames,
      abilityOptions,
      moveOptions,
      centerTexts,
      calcStats,
      inputStats,
      isLoading,
      loadedCount,
      totalCount,
      pokemonImg,
      pokemonSprite,
      itemSprite,
      updateSingleStat,
      calculateAllStats,
      toggleField,
      toggleStatus,
      getNatureMultiplier,
      calcDurability,
      checkHpCondition,
      getBaseDamage,
      getInputClass,
    }
  }
}
</script>
<style>
.v-autocomplete__selection-text {
	font-size: 12px !important;
}
/* 합이 64일 때 적용할 스타일 */
.red-input {
  border-color: red !important;
  color: red;
  background-color: #fff0f0; /* 배경색도 살짝 변경 예시 */
}
</style>