<template>
  <div class="battle-page">
    <!-- 좌측: 내 파티 (읽기 전용, 카드 하나로 묶음) -->
    <section class="battle-left">
      <div class="left-list">
        <div
          v-for="index in 6"
          :key="'mine-' + index"
          class="mine-card"
        >
          <div class="mine-name-box">
            <img
              :src="mySprite(index - 1)"
              class="mine-sprite"
              @error="$event.target.src = pokemonImg"
            >
            <span class="text-line">{{ mineDisplayName(index - 1) || '미선택' }}</span>

            <div
              v-if="selectedTool[index - 1]"
              class="mine-tool-box"
            >
              <img
                :src="mineItemSprite(index - 1)"
                class="mine-tool-sprite"
                @error="$event.target.src = pokemonImg"
              >
              <span class="text-line-small">{{ selectedTool[index - 1] }}</span>
            </div>

            <label
              v-if="getMineMegaData(index - 1)"
              class="mega-toggle"
            >
              <input
                v-model="mineMegaToggle[index - 1]"
                type="checkbox"
              >
              메가진화 반영
            </label>
          </div>

          <div class="mine-stats">
            <div class="stats-header-row-left">
              <span class="stats-header-name-left" />
              <span class="stats-header-label">실능치</span>
              <span class="stats-header-label">노력치</span>
            </div>
            <div
              v-for="stat in statKeys"
              :key="stat.key"
              class="mine-stat-row"
            >
              <span class="stat-name-label">{{ stat.name }}</span>
              <span
                class="stat-value"
                :style="{
                  color: stat.key === 'H' ? '#fff' :
                    getMineNatureMultiplier(index - 1, stat.key) === 1.1 ? 'red' :
                    getMineNatureMultiplier(index - 1, stat.key) === 0.9 ? 'blue' : '#fff'
                }"
              >
                {{ mineDisplayStats(index - 1)[stat.key] ?? 0 }}
              </span>
              <span class="ev-tag">+{{ inputStats[index - 1]?.[stat.key] ?? 0 }}</span>
            </div>
          </div>

          <div class="mine-moves">
            <div
              v-for="(move, k) in selectedMoves[index - 1]"
              :key="k"
              class="mine-move-row"
            >
              <div class="move-name-line">
                <span class="text-line">{{ move || '-' }}</span>
                <span class="move-damage">{{ getMineBaseDamage(index - 1, k) }}</span>
              </div>
              <span class="move-info-text">{{ formatMoveInfo(move) }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 가운데: 계산 결과 (추후 채울 영역) -->
    <section class="battle-center">
      <div class="battle-field-controls">
        <div class="field-control-row">
          <span class="field-control-label">날씨</span>
          <div class="field-control-buttons">
            <button
              v-for="w in weatherOptions"
              :key="w"
              type="button"
              class="field-control-btn"
              :class="{ active: battleWeather === w }"
              @click="toggleBattleWeather(w)"
            >
              {{ w }}
            </button>
          </div>
        </div>
        <div class="field-control-row">
          <span class="field-control-label">필드</span>
          <div class="field-control-buttons">
            <button
              v-for="f in fieldOptions"
              :key="f"
              type="button"
              class="field-control-btn"
              :class="{ active: battleField === f }"
              @click="toggleBattleField(f)"
            >
              {{ f }}
            </button>
          </div>
        </div>
      </div>

      <h3 class="battle-title">
        계산 결과
      </h3>
      <!-- TODO: 배틀 계산 결과 표시 -->
    </section>

    <!-- 우측: 상대 파티 (partySelect.vue처럼 입력 가능, 메가진화 지원) -->
    <section class="battle-right">
      <div class="right-list">
        <div
          v-for="index in 6"
          :key="'opponent-' + index"
          class="opp-card"
        >
          <div class="opp-left-box">
            <!-- 1행: 메가진화 반영 -->
            <div class="opp-row opp-row-mega">
              <label
                v-if="getOppMegaData(index - 1)"
                class="mega-toggle"
              >
                <input
                  v-model="oppMegaToggle[index - 1]"
                  type="checkbox"
                >
                메가진화 반영
              </label>
            </div>

            <!-- 2행: 포켓몬 사진, 포켓몬 select, 특성 -->
            <div class="opp-row opp-row-pokemon">
              <img
                :src="opponentSprite(index - 1)"
                class="opp-sprite"
                @error="$event.target.src = pokemonImg"
              >
              <v-autocomplete
                v-model="oppSelectedPokemon[index - 1]"
                :items="oppAvailablePokemonNames(index - 1)"
                label="포켓몬 선택"
                density="compact"
                hide-details
                class="opp-field"
                style="width: 140px;"
              />
            </div>

            <div>
              <select
                v-model="oppSelectedAbility[index - 1]"
                :disabled="!oppSelectedPokemon[index - 1] || !!getOppMegaData(index - 1)"
                :title="abilityDescription(oppSelectedAbility[index - 1])"
                class="opp-ability-select"
                style="margin-left: 70px;"
              >
                <option
                  value=""
                  disabled
                >
                  특성
                </option>
                <option
                  v-for="a in oppAbilityOptions(index - 1)"
                  :key="a"
                  :value="a"
                  :title="abilityDescription(a)"
                >
                  {{ a }}
                </option>
              </select>
            </div>

            <!-- 3행: 도구 사진, 도구 select -->
            <!-- 3행: 도구 사진, 도구 select -->
            <div class="opp-row opp-row-tool">
              <span class="opp-tool-icon-slot">
                <img
                  :src="opponentItemSprite(index - 1)"
                  class="opp-item-sprite-small"
                  @error="$event.target.src = pokemonImg"
                >
              </span>
              <select
                v-model="oppSelectedTool[index - 1]"
                class="opp-tool-select"
                @change="oppOnToolChange(index - 1)"
              >
                <option
                  value=""
                  disabled
                >
                  도구
                </option>
                <option
                  v-for="t in oppToolOptions(index - 1)"
                  :key="t"
                  :value="t"
                >
                  {{ t }}
                </option>
              </select>
            </div>

            <!-- 4행: 성격 -->
            <div class="opp-row opp-row-nature">
              <select
                v-model="oppSelectedNature[index - 1]"
                :disabled="!oppSelectedPokemon[index - 1]"
                class="opp-nature-select"
                @change="calculateAllOppStats(index - 1)"
              >
                <option
                  v-for="n in natureOptions"
                  :key="n"
                  :value="n"
                >
                  {{ natureLabel(n) }}
                </option>
              </select>
            </div>
          </div>

          <div class="opp-evs-box">
            <div class="stats-header-row-right">
              <span class="stats-header-name-right" />
              <span class="stats-header-label">노력치</span>
              <span class="stats-header-label">실능치</span>
            </div>
            <div
              v-for="stat in statKeys"
              :key="stat.key"
              class="mine-stat-row"
            >
              <span class="stat-name-label">{{ stat.name }}</span>
              <input
                v-model.number="oppInputStats[index - 1][stat.key]"
                type="number"
                min="0"
                max="32"
                class="ev-input"
                :class="getOppInputClass(index - 1)"
                style="padding-top: 0px; padding-bottom: 0px; padding-right: 0px; margin: 0px;"
                @input="updateSingleOppStat(index - 1, stat.key)"
              >
              <span class="ev-arrow">→</span>
              <span
                class="stat-value"
                :style="{
                  color: getOppNatureMultiplier(index - 1, stat.key) === 1.1 ? 'red' :
                    getOppNatureMultiplier(index - 1, stat.key) === 0.9 ? 'blue' : 'white'
                }"
              >
                {{ oppDisplayStats(index - 1)[stat.key] ?? 0 }}
              </span>
            </div>
          </div>

          <div class="opp-moves-box">
            <div
              v-for="k in 4"
              :key="k"
              class="opp-move-row"
              style="align-items: start;"
            >
              <v-autocomplete
                v-model="oppSelectedMoves[index - 1][k - 1]"
                :disabled="!oppSelectedPokemon[index - 1]"
                :items="opponentMoveOptions(index - 1, k - 1)"
                density="compact"
                hide-details
                menu-icon=""
                class="opp-move-select"
              />
              <div class="opp-move-info">
                <span class="move-info-text">{{ formatMoveInfo(oppSelectedMoves[index - 1][k - 1]) }}</span>
                <span class="move-damage">{{ getOppBaseDamage(index - 1, k - 1) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { items } from '@/data/item'
import { calculateStat } from '@/utils/stat'
import { calculateBaseDamage } from '@/utils/move'
import { natureOptions, natureLabel } from '@/utils/nature-label'
import { formatMoveInfo, getMoveData } from '@/utils/move-info'
import { NatureMap } from '@/data/nature'
import { MegaEvolutionMap } from '@/data/mega-evolutions'
import { abilities } from '@/data/abilities'
const abilityDescription = (name) => abilities[name] || ''

const oppAvailablePokemonNames = (index) => {
  const selected = oppSelectedPokemon.value
  return pokemonNames.value.filter(
    (name) => name === selected[index] || !selected.includes(name)
  )
}

const config = useRuntimeConfig()
const pokemonImg = (config.app.baseURL || '/') + 'pokemon.webp'
const itemList = [...items]

const statKeys = [
  { key: 'H', name: '체력' },
  { key: 'A', name: '공격' },
  { key: 'B', name: '방어' },
  { key: 'C', name: '특수공격' },
  { key: 'D', name: '특수방어' },
  { key: 'S', name: '스피드' },
]
const weatherOptions = ['쾌청', '큰가뭄', '비', '폭우', '모래바람', '눈', '난기류']
const fieldOptions = ['일렉트릭필드', '그래스필드', '미스트필드', '사이코필드']

const battleWeather = ref('없음')
const battleField = ref('없음')

const toggleBattleWeather = (value) => {
  battleWeather.value = battleWeather.value === value ? '없음' : value
}
const toggleBattleField = (value) => {
  battleField.value = battleField.value === value ? '없음' : value
}

// ── 메가진화 반영 시 실능치 재계산 공용 함수 (mine/opp 둘 다 사용) ─────────────
const computeStatsFromBase = (baseStats, evs, natureName, itemName, statusName) => {
  const keys = ['H', 'A', 'B', 'C', 'D', 'S']
  const result = {}
  keys.forEach((key) => {
    result[key] = calculateStat(key, baseStats?.[key] || 0, evs?.[key] || 0, natureName, itemName, statusName)
  })
  return result
}

// ── 내 파티 (partySelect.vue에서 고른 값, 읽기 전용) ─────────────
const {
  selectedPokemon,
  selectedAbility,
  selectedNature,
  selectedTool,
  selectedMoves,
  inputStats,
  calcStats,
} = useParty()

const { pokemonMap, pokemonNames } = useEligiblePokemon()

// 메가스톤을 지닌 경우 "메가진화 반영" 체크박스로 실능치/스프라이트를 토글 (기본 true = 기존 동작 유지)
const mineMegaToggle = ref(Array(6).fill(true))

const getMineMegaData = (index) => {
  const name = selectedPokemon.value[index]
  const tool = selectedTool.value[index]
  if (!name || !tool) return null
  const list = MegaEvolutionMap[name]
  if (!list) return null
  return list.find((m) => m.stoneName === tool) || null
}

const mineDisplayName = (index) => {
  const mega = getMineMegaData(index)
  return mega && mineMegaToggle.value[index] ? mega.megaName : (selectedPokemon.value[index] || '')
}

const mineDisplayStats = (index) => {
  const mega = getMineMegaData(index)
  if (mega && mineMegaToggle.value[index]) {
    return calcStats.value[index] || {} // partySelect.vue에서 이미 메가 종족값으로 계산해 둔 값
  }
  const name = selectedPokemon.value[index]
  const data = name ? pokemonMap.value[name] : null
  if (!data || !data.stats) return calcStats.value[index] || {}
  const natureName = selectedNature.value[index]?.replace(/\([^)]*\)/g, '') || '무보정'
  const itemName = selectedTool.value[index] || ''
  return computeStatsFromBase(data.stats, inputStats.value[index], natureName, itemName, '')
}

const mySprite = (index) => {
  const mega = getMineMegaData(index)
  if (mega && mineMegaToggle.value[index]) {
    return `${config.app.baseURL || '/'}pokemon_sprites/${mega.id}.png`
  }
  const name = selectedPokemon.value[index]
  const data = name ? pokemonMap.value[name] : null
  return data?.id
    ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png`
    : pokemonImg
}

// 지닌 도구 사진 (토글과 무관하게 실제 지닌 도구를 그대로 표시)
const mineItemSprite = (index) => {
  const tool = selectedTool.value[index]
  if (!tool) return pokemonImg
  const mega = getMineMegaData(index)
  if (mega) {
    return mega.stone
      ? `${config.app.baseURL || '/'}mega_stone_sprites/${mega.stone}.png`
      : pokemonImg
  }
  return `${config.app.baseURL || '/'}item_sprites/${encodeURIComponent(tool)}.png`
}

const getMineNatureMultiplier = (index, statKey) => {
  const natureName = selectedNature.value[index] || '무보정'
  const natureEffect = NatureMap[natureName]
  if (!natureEffect) return 1.0
  if (natureEffect.up === statKey) return 1.1
  if (natureEffect.down === statKey) return 0.9
  return 1.0
}

const getMineBaseDamage = (index, moveIndex) => {
  const moveName = selectedMoves.value[index]?.[moveIndex]
  if (!moveName) return ''
  const move = getMoveData(moveName)
  if (!move) return ''
  if (move.Category === '변화') return '' // 변화 기술은 결정력 표시 안 함

  const power = move.Power || 0
  const moveType = move.Type || ''
  const moveCategory = move.Category || ''
  const stab = true
  const stats = mineDisplayStats(index)
  const attack = moveCategory === '물리' ? stats?.A || 0 : stats?.C || 0
  const ability = selectedAbility.value[index]
  const item = selectedTool.value[index]

  // 날씨/필드/상태이상은 이 화면에 없어 빈 값으로 전달
  return calculateBaseDamage(power, attack, stab, moveType, moveCategory, ability, battleWeather.value, item, '', battleField.value)
}

// ── 상대 파티 (이 화면에서 직접 입력, 메가진화 지원) ─────────────
const {
  selectedPokemon: oppSelectedPokemon,
  selectedAbility: oppSelectedAbility,
  selectedNature: oppSelectedNature,
  selectedTool: oppSelectedTool,
  selectedMoves: oppSelectedMoves,
  inputStats: oppInputStats,
  calcStats: oppCalcStats,
} = useOpponentParty()

const oppMegaToggle = ref(Array(6).fill(true))

const getOppMegaData = (index) => {
  const name = oppSelectedPokemon.value[index]
  const tool = oppSelectedTool.value[index]
  if (!name || !tool) return null
  const list = MegaEvolutionMap[name]
  if (!list) return null
  return list.find((m) => m.stoneName === tool) || null
}

const oppDisplayStats = (index) => {
  const mega = getOppMegaData(index)
  if (mega && oppMegaToggle.value[index]) {
    return oppCalcStats.value[index] || {}
  }
  const name = oppSelectedPokemon.value[index]
  const data = name ? pokemonMap.value[name] : null
  if (!data || !data.stats) return oppCalcStats.value[index] || {}
  const natureName = oppSelectedNature.value[index]?.replace(/\([^)]*\)/g, '') || '무보정'
  const itemName = oppSelectedTool.value[index] || ''
  return computeStatsFromBase(data.stats, oppInputStats.value[index], natureName, itemName, '')
}

const oppDisplayName = (index) => {
  const mega = getOppMegaData(index)
  return mega && oppMegaToggle.value[index] ? mega.megaName : (oppSelectedPokemon.value[index] || '')
}

const oppAbilityOptions = (index) => {
  const mega = getOppMegaData(index)
  if (mega) return [mega.ability]
  const name = oppSelectedPokemon.value[index]
  return pokemonMap.value[name]?.abilities || []
}

const oppAbilityText = (index) => {
  const mega = getOppMegaData(index)
  if (mega) return mega.ability
  return oppSelectedAbility.value[index] || ''
}

const syncOppMegaAbility = (index) => {
  const mega = getOppMegaData(index)
  if (mega) {
    oppSelectedAbility.value[index] = mega.ability
    return
  }
  const name = oppSelectedPokemon.value[index]
  if (!name) return
  const abilities = pokemonMap.value[name]?.abilities || []
  if (!oppSelectedAbility.value[index] || !abilities.includes(oppSelectedAbility.value[index])) {
    oppSelectedAbility.value[index] = abilities[0] || ''
  }
}

const oppOnToolChange = (index) => {
  syncOppMegaAbility(index)
  calculateAllOppStats(index)
}

const opponentSprite = (index) => {
  const mega = getOppMegaData(index)
  if (mega && oppMegaToggle.value[index]) {
    return `${config.app.baseURL || '/'}pokemon_sprites/${mega.id}.png`
  }
  const name = oppSelectedPokemon.value[index]
  const data = name ? pokemonMap.value[name] : null
  return data?.id
    ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png`
    : pokemonImg
}

const opponentItemSprite = (index) => {
  const tool = oppSelectedTool.value[index]
  if (!tool) return pokemonImg

  const mega = getOppMegaData(index)
  if (mega) {
    return mega.stone
      ? `${config.app.baseURL || '/'}mega_stone_sprites/${mega.stone}.png`
      : pokemonImg
  }

  return `${config.app.baseURL || '/'}item_sprites/${encodeURIComponent(tool)}.png`
}

const oppToolOptions = (index) => {
  const name = oppSelectedPokemon.value[index]
  const megaList = name ? MegaEvolutionMap[name] : null
  const base = itemList.filter((t) => t !== '메가스톤')
  const allOptions = (!megaList || megaList.length === 0)
    ? base
    : [...megaList.map((m) => m.stoneName), ...base]

  const usedTools = oppSelectedTool.value.filter((t, i) => i !== index && t)
  return allOptions.filter((t) => t === oppSelectedTool.value[index] || !usedTools.includes(t))
}

const opponentMoveOptions = (index, moveIndex) => {
  const name = oppSelectedPokemon.value[index]
  const allMoves = pokemonMap.value[name]?.moves || []
  const usedMoves = oppSelectedMoves.value[index]?.filter((m, i) => i !== moveIndex && m) || []
  return allMoves.filter((m) => !usedMoves.includes(m))
}

const getOppNatureMultiplier = (index, statKey) => {
  const natureName = oppSelectedNature.value[index] || '무보정'
  const natureEffect = NatureMap[natureName]
  if (!natureEffect) return 1.0
  if (natureEffect.up === statKey) return 1.1
  if (natureEffect.down === statKey) return 0.9
  return 1.0
}

const updateSingleOppStat = (index, statKey) => {
  const name = oppSelectedPokemon.value[index]
  if (!name) return
  const data = pokemonMap.value[name]
  if (!data || !data.stats) {
    oppCalcStats.value[index][statKey] = 0
    return
  }
  const mega = getOppMegaData(index)
  const baseStat = (mega ? mega.stats[statKey] : data.stats[statKey]) || 0
  const evPoints = oppInputStats.value[index][statKey] || 0
  const nature = oppSelectedNature.value[index]?.replace(/\([^)]*\)/g, '') || '무보정'
  const item = oppSelectedTool.value[index] || ''

  oppCalcStats.value[index][statKey] = calculateStat(statKey, baseStat, evPoints, nature, item)
}

const calculateAllOppStats = (index) => {
  statKeys.forEach(({ key }) => updateSingleOppStat(index, key))
}

const getOppInputClass = (index) => {
  const rowData = oppInputStats.value[index]
  if (!rowData) return ''
  const totalSum = Object.values(rowData).reduce((sum, value) => sum + (Number(value) || 0), 0)
  const maxValue = Math.max(...Object.values(rowData))
  return totalSum >= 66 || maxValue > 32 ? 'red-input' : ''
}

const getOppBaseDamage = (index, moveIndex) => {
  const moveName = oppSelectedMoves.value[index]?.[moveIndex]
  if (!moveName) return ''
  const move = getMoveData(moveName)
  if (!move) return ''
  if (move.Category === '변화') return '' // 변화 기술은 결정력 표시 안 함

  const power = move.Power || 0
  const moveType = move.Type || ''
  const moveCategory = move.Category || ''
  const stab = true
  const stats = oppDisplayStats(index)
  const attack = moveCategory === '물리' ? stats?.A || 0 : stats?.C || 0
  const ability = oppAbilityText(index)
  const item = oppSelectedTool.value[index]

  return calculateBaseDamage(power, attack, stab, moveType, moveCategory, ability, battleWeather.value, item, '', battleField.value)
}

// 상대 포켓몬이 바뀌면 나머지 입력값 초기화 (특성은 종족 첫 특성으로) + 실능치 정상 계산
watch(
  () => [...oppSelectedPokemon.value],
  (newVal, oldVal) => {
    if (!oldVal) return
    newVal.forEach((name, index) => {
      if (name !== oldVal[index]) {
        oppSelectedNature.value[index] = '무보정'
        oppSelectedTool.value[index] = ''
        oppSelectedMoves.value[index] = Array(4).fill('')
        oppInputStats.value[index] = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }
        oppMegaToggle.value[index] = true
        if (name) {
          const abilities = pokemonMap.value[name]?.abilities || []
          oppSelectedAbility.value[index] = abilities[0] || ''
        } else {
          oppSelectedAbility.value[index] = ''
        }
        calculateAllOppStats(index) // ← 하드코딩된 0 대신 정상 계산 호출 (버그 수정)
      }
    })
  }
)
</script>

<style scoped>
.battle-page {
  display: flex;
  gap: 4px;
  padding: 8px;
  align-items: flex-start;
}

.battle-left {
  flex: 1;
}

.battle-right {
  flex: 1;
}

.battle-center {
  flex: 10;
  border: 2px dashed #555;
  border-radius: 6px;
  min-height: 300px;
}

.battle-title {
  margin: 0 0 8px 0;
  color: #fff;
  font-size: 16px;
}

/* ── 좌측 ─────────────────────────── */
.left-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mine-card {
  min-width: 600px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 12px;
  border: 2px solid #000;
  border-radius: 6px;
  background: #666;
  width: fit-content;
}

.mine-name-box {
  min-width: 100px;
}

.mine-name-box,
.mine-stats,
.mine-moves {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.mine-sprite {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border: 2px solid #333;
  border-radius: 6px;
  background: #e8e8e8;
}

.ev-tag {
  font-size: 10px;
  color: #aaa;
  margin-left: 4px;
}

.mine-move-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.move-name-line {
  min-width: 300px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.move-info-text {
  white-space: normal; /* 설명이 길어도 줄바꿈 허용 */
  min-height: 12px; /* 설명 없을 때도 높이 유지 */
}

.mine-move-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 14px; /* 기술 선택 전/후 레이아웃 동일하게 유지 */
}

/* ── 도구 표시 / 메가 토글 (mine & opp 공통) ─────────────── */
/* 아래 블록을 스타일시트에서 찾아서 통째로 이걸로 교체하세요 */

/* ── 도구 표시 / 메가 토글 (mine 전용) ─────────────── */
.mine-tool-box {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mine-tool-sprite {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border: 1px solid #333;
  border-radius: 4px;
  background: #e8e8e8;
  flex-shrink: 0;
}

.text-line-small {
  font-size: 10px;
  color: #ccc;
  white-space: nowrap;
}

.mega-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #ffeb3b;
  white-space: nowrap;
  cursor: pointer;
}

.opp-row-mega {
  height: 18px;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.opp-item-sprite {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border: 2px solid #333;
  border-radius: 6px;
  background: #e8e8e8;
}

.opp-nature-select {
  width: 160px;
  font-size: 11px;
  padding: 4px;
  font-family: monospace;
}

/* ── 우측: 상대 파티 카드 ─────────────────────────── */
.right-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.opp-card {
  min-width: 800px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 8px;
  border: 2px solid #000;
  border-radius: 6px;
  background: #666;
  width: fit-content;
  flex-wrap: wrap; /* 좁은 화면에서 줄바꿈 허용 */
}

.opp-left-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.opp-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.opp-row-mega {
  min-height: 18px; /* 메가진화 없는 포켓몬도 행 높이 유지 */
}

.opp-row-pokemon .opp-sprite {
  width: 64px;
  height: 64px;
}

.opp-name-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  width: 140px;
}

.opp-sprite {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border: 2px solid #333;
  border-radius: 6px;
  background: #e8e8e8;
}

.opp-field {
  width: 140px;
  font-size: 12px;
}

.opp-ability-text {
  font-size: 11px;
  color: #ffeb3b;
}

.text-line {
  font-size: 12px;
  color: #fff;
  white-space: nowrap;
}

.opp-tool-nature-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

/* 성격 select: 라벨이 안 잘리게 넓게 */
.opp-nature-select {
  width: 220px;
  font-size: 12px;
  padding: 4px;
  font-family: monospace;
}

.opp-evs-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.ev-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ev-label {
  font-size: 12px;
  width: 16px;
}

.ev-input {
  width: 44px;
  border: 1px solid #ccc;
  padding: 2px;
}

.red-input {
  border-color: red !important;
  color: red;
  background-color: #fff0f0;
}

.ev-arrow {
  color: #666;
}

.ev-result {
  font-size: 12px;
  font-weight: bold;
  width: 32px;
  text-align: right;
}

.opp-moves-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

/* 기술 select 오른쪽에 위력/명중률/PP → 결정력이 나오도록 가로 배치 */
.opp-move-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.opp-move-select {
  width: 95px;
  font-size: 12px;
}
.opp-move-select :deep(.v-field__input) {
  padding-left: 6px;
  padding-right: 2px;
  padding-top: 0px;
  padding-bottom: 0px;
  min-height: 30px;
}

.opp-move-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 14px; /* 기술 선택 전/후 행 높이 동일하게 유지 */
}

.move-info-text {
  font-size: 10px;
  color: #ccc;
  white-space: nowrap;
}

.opp-item-sprite-small {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border: 1px solid #333;
  border-radius: 4px;
  background: #e8e8e8;
  flex-shrink: 0;
}
.opp-tool-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.opp-tool-box {
  display: flex;
  align-items: center;
  justify-content: center;
}

.opp-ability-select {
  font-size: 12px;
  width: 140px;
}
.opp-tool-select {
  width: 100px;
  font-size: 12px;
  padding: 3px;
}
.opp-nature-select {
  font-size: 12px; /* 11px → 12px */
}
.opp-tool-icon-slot {
  width: 64px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.move-damage {
  font-size: 12px;
  color: #ffeb3b;
  white-space: nowrap;
}

.battle-field-controls {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.field-control-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.field-control-label {
  font-size: 10px;
  color: #ccc;
}
.field-control-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.field-control-btn {
  font-size: 10px;
  padding: 2px 6px;
  border: 1px solid #999;
  border-radius: 4px;
  cursor: pointer;
  background: #444;
  color: #fff;
}
.field-control-btn.active {
  background: #4caf50;
}

.stats-header-row-left { display:flex; align-items:center; gap:4px; }
.stats-header-row-right { display:flex; align-items:center; gap:45px; }
.stats-header-name-left { width: 60px; }
.stats-header-name-right { width: 10px; }
.stats-header-label { width: 32px; font-size: 9px; color: #888; text-align: right; }
.mine-stat-row { display:flex; align-items:center; gap:4px; }
.stat-name-label { width: 60px; font-size: 12px; color: #fff; white-space: nowrap; }
.stat-value { width: 32px; text-align: right; font-weight: bold; font-size: 12px; }
.ev-header-row { display:flex; align-items:center; gap:4px; }
.ev-header-label { font-size: 9px; color: #888; width: 44px; text-align: center; }
@media (max-width: 768px) {
  .battle-page {
    flex-direction: column;
  }

  .opp-card {
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
  }
}
</style>