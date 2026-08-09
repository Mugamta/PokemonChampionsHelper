<template>
  <div class="party-container">
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
      class="party-grid"
    >
      <div
        v-for="index in 6"
        :key="'left' + index"
        class="party-card"
      >
        <!-- 사진 + 포켓몬 선택 + 특성 -->
        <div class="card-block1">
          <img
            :src="pokemonSprite(index - 1)"
            class="area-sprite"
            style="width:160px; height:160px; object-fit:cover; border: 2px solid #333; border-radius: 6px; background: #e8e8e8;"
            @error="$event.target.src = pokemonImg"
          >
          <v-autocomplete
            v-model="selectedPokemon[index - 1]"
            :items="availablePokemonNames(index - 1)"
            label="포켓몬 선택"
            density="compact"
            hide-details
            class="area-select-pokemon"
            style="width: 160px;"
            :menu-props="{
              location: 'end top',
              offset: [0, 8]
            }"
            @update:model-value="quickBlur"
          >
            <template #selection="{ item }">
              <span
                style="
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      width: 100%;
      line-height: 1.2;
    "
              >
                {{ getMegaData(index - 1) ? displayName(index - 1) : item }}
              </span>
            </template>
          </v-autocomplete>

          <select 
            v-model="selectedAbility[index - 1]"
            :disabled="!selectedPokemon[index - 1] || !!getMegaData(index - 1)"
            :title="getMegaData(index - 1) ? '메가진화 중에는 특성이 고정됩니다' : ''"
            class="area-select-ability"
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

        <!-- 도구 + 날씨/필드/상태이상 + 성격 -->
        <div class="card-block2">
          <div class="card-block2-top">
            <div class="card-tool-row">
              <img
                :src="itemSprite(index - 1)"
                class="area-item"
                style="width:80px; height:80px; object-fit:cover; border: 2px solid #333; border-radius: 6px; background: #e8e8e8; flex-shrink:0;"
                @error="$event.target.src = pokemonImg"
              >
              <select 
                v-model="selectedTool[index - 1]" 
                class="area-select-tool"
                style="width:144px; font-size:12px; padding: 4px;"
                @change="onToolChange(index - 1)"
              >
                <option
                  value=""
                  disabled
                >
                  도구 선택
                </option>
                <option
                  v-for="t in toolOptions(index - 1)"
                  :key="t"
                  :value="t"
                >
                  {{ t }}
                </option>
              </select>
            </div>

            <div
              class="card-weather-row"
              style="display:flex; flex-direction:column; gap:1px; width:260px;"
            >
              <span style="font-size:10px; color:#ccc;">날씨</span>
              <div style="display:flex; flex-wrap:wrap; gap:2px;">
                <button
                  v-for="w in weatherOptions"
                  :key="w"
                  type="button"
                  :style="{
                    fontSize: '10px',
                    padding: '2px 6px',
                    border: '1px solid #999',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: selectedWeather[index - 1] === w ? '#4caf50' : '#444',
                    color: '#fff'
                  }"
                  @click="toggleWeather(index - 1, w)"
                >
                  {{ w }}
                </button>
              </div>
            </div>

            <div
              class="card-field-row"
              style="display:flex; flex-direction:column; gap:1px; width:260px;"
            >
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

            <div
              class="card-status-row"
              style="display:flex; flex-direction:column; gap:1px; width:260px;"
            >
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

          <div
            class="card-nature"
            style="display:flex; flex-direction:column; gap:2px;"
          >
            <span style="font-size:11px; color:#ccc; text-align:center;">성격</span>
            <select 
              v-model="selectedNature[index - 1]"
              :disabled="!selectedPokemon[index - 1]"
              class="area-select-nature"
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

        <!-- 노력치 / 실수치 / 내구력 -->
        <div class="card-block3">
          <!-- 체력 % 슬라이더 -->
          <div
            class="hp-percent-block"
            style="display:flex; gap:4px; margin-bottom:10px;"
          >
            <span style="font-size:10px; white-space:nowrap;">
              체력 {{ selectedHpPercent[index - 1] }}% ({{ currentHp(index - 1) }} / {{ calcStats[index - 1]?.H || 0 }})
            </span>
            <input
              v-model.number="selectedHpPercent[index - 1]"
              type="range"
              min="1"
              max="100"
              step="1"
              :disabled="!selectedPokemon[index - 1]"
              style="width:50%;"
            >
          </div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <div
              v-for="(stat, j) in stats"
              :key="j"
              class="stat-row"
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

              <div
                class="stat-result"
                style="display:flex; align-items:center; gap:4px; font-size:12px; flex-wrap: wrap; max-width: 136px;"
              >
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

        <!-- 기술 + 결정력 -->
        <div class="card-block4">
          <div
            v-for="k in 4"
            :key="k"
            class="move-row"
          >
            <div class="move-select-row">
              <span style="color:#666;">→</span>
              <v-autocomplete
                v-model="selectedMoves[index - 1][k - 1]"
                :disabled="!selectedPokemon[index - 1]"
                :items="moveOptions(index - 1)"
                density="compact"
                hide-details
                menu-icon=""
                class="area-move-select"
                style="width:120px; font-size:12px;"
              />
            </div>
            <div class="move-info-row">
              <span class="move-info-text">{{ formatMoveInfo(selectedMoves[index - 1][k - 1]) }}</span>
              <span class="move-damage">{{ getBaseDamage(index - 1, k - 1) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 모바일에서만 보이는 하단 배틀 버튼 -->
    <div class="mobile-battle-bar">
      <button
        :disabled="!isPartyComplete"
        class="mobile-battle-button"
        @click="goToBattle"
      >
        선출 화면으로
      </button>
    </div>
  </div>
</template>

<script>
import { ref, watch } from 'vue'
import { items } from '@/data/item';
import { calculateStat } from '@/utils/stat';
import { calculateBaseDamage } from '@/utils/move';
import { moves } from '@/data/moves';
import { Nature, NatureMap } from '@/data/nature';
import { MegaEvolutionMap } from '@/data/mega-evolutions';
import { formatMoveInfo } from '@/utils/move-info'

export default {
  setup() {
    // GitHub Pages 서브 경로 대응: public 폴더 이미지도 baseURL을 직접 붙여야 함
    const config = useRuntimeConfig()
    const pokemonImg = (config.app.baseURL || '/') + 'pokemon.webp'

    // 도구(선택된 메가스톤 이름)에 해당하는 메가진화 데이터 반환.
    // 폼이 여러 개인 포켓몬(리자몽나이트X/Y 등)은 스톤 이름으로 정확히 어느 폼인지 구분한다.
    const getMegaData = (index) => {
      const name = selectedPokemon.value[index]
      const tool = selectedTool.value[index]
      if (!name || !tool) return null
      const list = MegaEvolutionMap[name]
      if (!list) return null
      return list.find((m) => m.stoneName === tool) || null
    }

    // 표시용 이름: 메가진화 중이면 메가진화 이름, 아니면 원래 이름
    const displayName = (index) => {
      const mega = getMegaData(index)
      return mega ? mega.megaName : (selectedPokemon.value[index] || '')
    }

    // 메가진화 상태와 selectedAbility를 동기화. 메가진화 중이면 특성을 고정값으로 강제하고,
    // 메가진화가 풀리면(도구 변경 등) 원래 종족의 첫 번째 특성으로 되돌린다.
    const syncMegaAbility = (index) => {
      const mega = getMegaData(index)
      if (mega) {
        selectedAbility.value[index] = mega.ability
        return
      }
      const name = selectedPokemon.value[index]
      if (!name) return
      const abilities = pokemonMap.value[name]?.abilities || []
      // 지금 선택된 특성이 메가진화 전용 특성이었거나(=원래 목록에 없음) 비어있으면 기본 특성으로 복귀
      if (!selectedAbility.value[index] || !abilities.includes(selectedAbility.value[index])) {
        selectedAbility.value[index] = abilities[0] || ''
      }
    }

    // 도구 선택 변경 핸들러: 메가진화 여부가 바뀔 수 있으므로 특성 동기화 후 능력치 재계산
    const onToolChange = (index) => {
      syncMegaAbility(index)
      calculateAllStats(index)
    }

    // 미리 public/pokemon_sprites/{id}.png 로 받아둔 로컬 스프라이트 사용 (download:sprites 스크립트로 준비)
    const pokemonSprite = (index) => {
      const mega = getMegaData(index)
      if (mega) {
        return `${config.app.baseURL || '/'}pokemon_sprites/${mega.id}.png`
      }
      const name = selectedPokemon.value[index]
      const data = name ? pokemonMap.value[name] : null
      return data?.id
        ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png`
        : pokemonImg
    }

    // 선택된 도구의 스프라이트.
    // 도구가 '메가스톤'이면 포켓몬별 실제 스톤 이미지(public/mega_stone_sprites/{stone}.png, download:mega-stones 스크립트로 준비)를,
    // 그 외 도구는 기존처럼 공용 아이템 스프라이트(public/item_sprites/{한글이름}.png, download:item-sprites 스크립트로 준비)를 사용
    const itemSprite = (index) => {
      const tool = selectedTool.value[index]
      if (!tool) return pokemonImg

      const mega = getMegaData(index)
      if (mega) {
        return mega.stone
          ? `${config.app.baseURL || '/'}mega_stone_sprites/${mega.stone}.png`
          : pokemonImg // 스톤명이 아직 확인 안 된 종(Champions 신규종 등)은 기본 이미지로 대체
      }

      return `${config.app.baseURL || '/'}item_sprites/${encodeURIComponent(tool)}.png`
    }

    // 선택된 포켓몬에게 메가진화가 있으면, 공용 '메가스톤' 항목 대신 실제 스톤 이름들(폼별로 여러 개일 수 있음)을 노출.
    // 그리고 이미 다른 슬롯에서 선택된 도구는 목록에서 제외해 도구 중복 선출을 막는다(자기 자신이 이미 고른 값은 유지).
    const toolOptions = (index) => {
      const name = selectedPokemon.value[index]
      const megaList = name ? MegaEvolutionMap[name] : null
      const base = itemList.filter((t) => t !== '메가스톤')
      const all = !megaList || megaList.length === 0
        ? base
        : [...megaList.map((m) => m.stoneName), ...base]

      const usedElsewhere = selectedTool.value.filter(
        (t, i) => i !== index && t && t !== '없음'
      )
      return all.filter((t) => t === selectedTool.value[index] || !usedElsewhere.includes(t))
    }

    // 이미 다른 슬롯에 선택된 포켓몬(종족 기준)은 후보에서 제외해 중복 선출을 막는다.
    // selectedPokemon에는 메가진화 여부와 무관하게 항상 원래 종족명이 저장되므로
    // (메가진화 여부는 selectedTool로 구분), 이 필터만으로 라이츄/메가라이츄X/메가라이츄Y처럼
    // 실제로는 같은 종족인 조합의 중복도 함께 방지된다.
    const availablePokemonNames = (index) => {
      const selected = selectedPokemon.value
      return pokemonNames.value.filter(
        (name) => name === selected[index] || !selected.includes(name)
      )
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

    const quickBlur = () => {
      // 선택하자마자 브라우저에서 포커싱된 input 요소를 즉시 해제
      setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
      }, 50) // Vuetify 내부 포커스 유지 로직보다 한 발 늦게 실행되도록 지연시간 부여
    }

    // 변경
    const search = ref(Array(6).fill(''))
    const {
      selectedPokemon,
      selectedAbility,
      selectedNature,
      selectedTool,
      selectedMoves,
      inputStats,
      calcStats,
      isPartyComplete,
    } = useParty()

    // 날씨 / 필드 / 상태이상 (슬롯별 선택)
    const weatherOptions = ['쾌청', '큰가뭄', '비', '폭우', '모래바람', '눈', '난기류']
    const fieldOptions = ['일렉트릭필드', '그래스필드', '미스트필드', '사이코필드']
    const statusOptions = ['마비', '화상']

    const selectedWeather = ref(Array(6).fill('없음'))
    const selectedField = ref(Array(6).fill('없음'))
    const selectedStatus = ref(Array(6).fill('없음'))

    // 체력 % (1~100), 슬롯별로 현재 체력 비율을 표시/설정하기 위한 상태
    const selectedHpPercent = ref(Array(6).fill(100))

    const currentHp = (index) => {
      const maxHp = calcStats.value[index]?.H || 0
      const percent = selectedHpPercent.value[index] || 100
      return Math.floor((maxHp * percent) / 100)
    }

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

      const mega = getMegaData(pokemonIndex)
      const Base_Stat = (mega ? mega.stats[statKey] : pokemonData.stats[statKey]) || 0 // 종족값(메가진화 중이면 메가 종족값)
      const Stat_Points = inputStats.value[pokemonIndex][statKey] || 0 // 노력치
      const Nature = selectedNature.value[pokemonIndex]?.replace(/\([^)]*\)/g, '') || '무보정' // 성격
      const Item = selectedTool.value[pokemonIndex] || '' // 도구
      const Status = selectedStatus.value[pokemonIndex] // 상태이상

      const result = calculateStat(statKey, Base_Stat, Stat_Points, Nature, Item, Status)
      calcStats.value[pokemonIndex][statKey] = result
    }

    const calculateAllStats = (pokemonIndex) => {
      const keys = ['H', 'A', 'B', 'C', 'D', 'S']
      keys.forEach(key => updateSingleStat(pokemonIndex, key))
    }

    // 날씨/필드/상태이상 버튼: 이미 선택된 걸 다시 누르면 '없음'(선택 해제)으로 토글
    const toggleWeather = (pokemonIndex, value) => {
      selectedWeather.value[pokemonIndex] = selectedWeather.value[pokemonIndex] === value ? '없음' : value
      calculateAllStats(pokemonIndex)
    }

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
      const moveCategory = move.Category || ''
      const stab = true // 자속보정 수정필
      const attack = move.Category === '물리' ? calcStats.value[pokemonIndex]?.A || 0 : calcStats.value[pokemonIndex]?.C || 0
      const ability = selectedAbility.value[pokemonIndex]
      const weather = selectedWeather.value[pokemonIndex] // 슬롯별 선택값 (없음/쾌청/비/모래바람/눈/큰가뭄/폭우/난기류)
      const item = selectedTool.value[pokemonIndex]
      const status = selectedStatus.value[pokemonIndex]
      const field = selectedField.value[pokemonIndex]

      return calculateBaseDamage(power, attack, stab, moveType, moveCategory, ability, weather, item, status, field)
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
              selectedHpPercent.value[index] = 100
              calculateAllStats(index)
            } else {
              selectedAbility.value[index] = ''
              selectedNature.value[index] = '무보정'
              selectedTool.value[index] = ''
              selectedMoves.value[index] = Array(4).fill('')
              selectedHpPercent.value[index] = 100
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

    // 메가진화 중이면 특성 선택지를 고정 특성 하나로만 제한
    const abilityOptions = (i) => {
      const mega = getMegaData(i)
      if (mega) return [mega.ability]
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

    const router = useRouter()
    const goToBattle = () => {
      if (!isPartyComplete.value) return
      router.push('/entrySelect')
    }

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
      selectedHpPercent,
      currentHp,
      selectedMoves,
      filteredPokemonNames,
      availablePokemonNames,
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
      toolOptions,
      displayName,
      getMegaData,
      onToolChange,
      updateSingleStat,
      calculateAllStats,
      toggleWeather,
      toggleField,
      toggleStatus,
      getNatureMultiplier,
      calcDurability,
      checkHpCondition,
      getBaseDamage,
      getInputClass,
      isPartyComplete,
      goToBattle,
      quickBlur,
      formatMoveInfo,
    }
  }
}
</script>
<style>
.v-autocomplete__selection-text {
  font-size: 12px !important;
}

.v-autocomplete .v-field__input {
  flex-wrap: nowrap !important;
}
/* 합이 64일 때 적용할 스타일 */
.red-input {
  border-color: red !important;
  color: red;
  background-color: #fff0f0; /* 배경색도 살짝 변경 예시 */
}

.party-container {
  display: flex;
  gap: 8px;
  padding: 8px;
  min-height: 300px;
}

.party-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.party-card {
  display: flex;
  border: 2px solid #000;
  padding: 12px;
  gap: 6px;
  box-sizing: border-box;
  background: #666;
  overflow-x: auto;
}

.card-block1,
.card-block2,
.card-block3,
.card-block4 {
  flex-shrink: 0;
}

.move-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.move-select-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.move-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 28px; /* 화살표 폭만큼 들여쓰기 */
}

.move-info-text {
  font-size: 10px;
  color: #ccc;
  white-space: nowrap;
}

.move-damage {
  font-size: 12px;
  color: #ffeb3b;
  white-space: nowrap;
}

.mobile-battle-bar {
  display: none;
}

@media (max-width: 768px) {
  .party-container {
    flex-direction: column;
  }

  .party-grid {
    grid-template-columns: 1fr; /* 카드 6개 세로로 쌓기 */
  }

  /* 카드 자체를 2열 grid로: 이미지 2개 → 선택박스 2개 → 특성/성격 2개 → 스탯/기술 2개 → 날씨/필드/상태이상 전체폭 */
  .party-card {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      "sprite item"
      "select-pokemon select-tool"
      "select-ability select-nature"
      "stats moves"
      "weather weather"
      "field field"
      "status status";
    gap: 10px;
    overflow-x: visible;
    align-items: center; /* 실능치 블록과 기술 블록을 세로 중앙정렬 */
  }

  /* 원래 그룹핑 wrapper들은 시각적 박스 없이, 자식들을 grid의 직속 아이템으로 승격 */
  .card-block1,
  .card-block2,
  .card-block2-top,
  .card-tool-row {
    display: contents;
  }

  .area-sprite {
    grid-area: sprite;
    width: 100% !important;
    max-width: 200px;
    height: auto !important;
    aspect-ratio: 1 / 1;
    justify-self: center;
  }

  .area-item {
    grid-area: item;
    width: 100% !important;
    max-width: 200px;
    height: auto !important;
    aspect-ratio: 1 / 1;
    justify-self: center;
  }

  .area-select-pokemon {
    grid-area: select-pokemon;
    width: 100% !important;
  }

  .area-select-tool {
    grid-area: select-tool;
    width: 100% !important;
  }

  .area-select-ability {
    grid-area: select-ability;
    width: 100% !important;
  }

  .card-nature {
    grid-area: select-nature;
    width: 100% !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 8px !important;
  }

  .area-select-nature {
    width: 100% !important;
  }

  .card-block3 {
    grid-area: stats;
  }

  .card-block4 {
    grid-area: moves;
  }

  .card-weather-row,
  .card-field-row,
  .card-status-row {
    width: 100% !important;
  }

  .card-weather-row { grid-area: weather; }
  .card-field-row { grid-area: field; }
  .card-status-row { grid-area: status; }

  /* 스탯/기술 줄이 컬럼 폭보다 넓어지면 줄바꿈 되도록 */
  .stat-row,
  .move-row {
    flex-wrap: wrap;
  }

  .stat-result {
    max-width: 100% !important;
  }

  .area-move-select {
    width: auto !important;
    flex: 1;
  }

  .mobile-battle-bar {
    display: block;
    padding: 12px 0;
  }

  .mobile-battle-button {
    width: 100%;
    padding: 12px;
    font-size: 14px;
    border: none;
    border-radius: 6px;
    background: #4caf50;
    color: #fff;
    cursor: pointer;
  }

  .mobile-battle-button:disabled {
    background: #555;
    cursor: not-allowed;
  }
}
</style>