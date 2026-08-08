<template>
  <div class="battle-page">
    <!-- 좌측: 내 파티 (읽기 전용, 카드 하나로 묶음) -->
    <section class="battle-left">
      <h3 class="battle-title">내 파티</h3>
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
            <span class="text-line">{{ selectedPokemon[index - 1] || '미선택' }}</span>
          </div>

          <div class="mine-stats">
            <span
              v-for="stat in statKeys"
              :key="stat.key"
              class="text-line"
              :style="{
                color: stat.key === 'H' ? '#fff' :
                  getMineNatureMultiplier(index - 1, stat.key) === 1.1 ? 'red' :
                  getMineNatureMultiplier(index - 1, stat.key) === 0.9 ? 'blue' : '#fff'
              }"
            >
              {{ stat.name }} {{ calcStats[index - 1]?.[stat.key] ?? 0 }}
              <span class="ev-tag">(+{{ inputStats[index - 1]?.[stat.key] ?? 0 }})</span>
            </span>
          </div>

          <div class="mine-moves">
            <div
              v-for="(move, k) in selectedMoves[index - 1]"
              :key="k"
              class="mine-move-row"
            >
              <span class="text-line">{{ move || '-' }}</span>
              <div v-if="move" class="mine-move-info-row">
                <span class="move-info-text">{{ formatMoveInfo(move) }}</span>
                <span class="move-damage">{{ getMineBaseDamage(index - 1, k) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 가운데: 계산 결과 (추후 채울 영역) -->
    <section class="battle-center">
      <h3 class="battle-title">계산 결과</h3>
      <!-- TODO: 배틀 계산 결과 표시 -->
    </section>

    <!-- 우측: 상대 파티 (partySelect.vue처럼 입력 가능, 메가진화 지원) -->
    <section class="battle-right">
      <h3 class="battle-title">상대 파티</h3>
      <div class="right-grid">
        <template v-for="index in 6" :key="'opponent-' + index">
          <div class="cell cell-name">
            <img
              :src="opponentSprite(index - 1)"
              class="opp-sprite"
              @error="$event.target.src = pokemonImg"
            >
            <v-autocomplete
              v-model="oppSelectedPokemon[index - 1]"
              :items="pokemonNames"
              label="포켓몬 선택"
              density="compact"
              hide-details
              class="opp-field"
            />
            <span
              v-if="oppSelectedPokemon[index - 1]"
              class="opp-ability-text"
            >
              {{ oppAbilityText(index - 1) }}
            </span>
          </div>

          <div class="cell cell-tool-nature">
            <div class="tool-row">
              <img
                :src="opponentItemSprite(index - 1)"
                class="opp-item-sprite"
                @error="$event.target.src = pokemonImg"
              >
              <select
                v-model="oppSelectedTool[index - 1]"
                class="opp-tool-select"
                @change="oppOnToolChange(index - 1)"
              >
                <option value="" disabled>도구</option>
                <option v-for="t in oppToolOptions(index - 1)" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>

            <select
              v-model="oppSelectedNature[index - 1]"
              :disabled="!oppSelectedPokemon[index - 1]"
              class="opp-nature-select"
              @change="calculateAllOppStats(index - 1)"
            >
              <option v-for="n in natureOptions" :key="n" :value="n">
                {{ natureLabel(n) }}
              </option>
            </select>
          </div>

          <div class="cell cell-evs">
            <div
              v-for="stat in statKeys"
              :key="stat.key"
              class="ev-row"
            >
              <span class="ev-label">{{ stat.key }}</span>
              <input
                v-model.number="oppInputStats[index - 1][stat.key]"
                type="number"
                min="0"
                max="32"
                class="ev-input"
                :class="getOppInputClass(index - 1)"
                @input="updateSingleOppStat(index - 1, stat.key)"
              >
              <span class="ev-arrow">→</span>
              <span
                class="ev-result"
                :style="{
                  color: getOppNatureMultiplier(index - 1, stat.key) === 1.1 ? 'red' :
                    getOppNatureMultiplier(index - 1, stat.key) === 0.9 ? 'blue' : 'white'
                }"
              >
                {{ oppCalcStats[index - 1]?.[stat.key] || 0 }}
              </span>
            </div>
          </div>

          <div class="cell cell-opp-moves">
            <div
              v-for="k in 4"
              :key="k"
              class="opp-move-row"
            >
              <v-autocomplete
                v-model="oppSelectedMoves[index - 1][k - 1]"
                :disabled="!oppSelectedPokemon[index - 1]"
                :items="opponentMoveOptions(index - 1)"
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
        </template>
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

const mySprite = (index) => {
  const name = selectedPokemon.value[index]
  const data = name ? pokemonMap.value[name] : null
  return data?.id
    ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png`
    : pokemonImg
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

  const power = move.Power || 0
  const moveType = move.Type || ''
  const moveCategory = move.Category || ''
  const stab = true
  const attack = moveCategory === '물리'
    ? calcStats.value[index]?.A || 0
    : calcStats.value[index]?.C || 0
  const ability = selectedAbility.value[index]
  const item = selectedTool.value[index]

  // 날씨/필드/상태이상은 이 화면에 없어 빈 값으로 전달
  return calculateBaseDamage(power, attack, stab, moveType, moveCategory, ability, '', item, '', '')
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

const getOppMegaData = (index) => {
  const name = oppSelectedPokemon.value[index]
  const tool = oppSelectedTool.value[index]
  if (!name || !tool) return null
  const list = MegaEvolutionMap[name]
  if (!list) return null
  return list.find((m) => m.stoneName === tool) || null
}

const oppDisplayName = (index) => {
  const mega = getOppMegaData(index)
  return mega ? mega.megaName : (oppSelectedPokemon.value[index] || '')
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
  if (mega) {
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
  if (!megaList || megaList.length === 0) return base
  const stoneNames = megaList.map((m) => m.stoneName)
  return [...stoneNames, ...base]
}

const opponentMoveOptions = (index) => {
  const name = oppSelectedPokemon.value[index]
  return pokemonMap.value[name]?.moves || []
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

  const power = move.Power || 0
  const moveType = move.Type || ''
  const moveCategory = move.Category || ''
  const stab = true
  const attack = moveCategory === '물리'
    ? oppCalcStats.value[index]?.A || 0
    : oppCalcStats.value[index]?.C || 0
  const ability = oppAbilityText(index)
  const item = oppSelectedTool.value[index]

  return calculateBaseDamage(power, attack, stab, moveType, moveCategory, ability, '', item, '', '')
}

// 상대 포켓몬이 바뀌면 나머지 입력값 초기화 (특성은 종족 첫 특성으로)
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
        oppCalcStats.value[index] = { H: 0, A: 0, B: 0, C: 0, D: 0, S: 0 }
        if (name) {
          const abilities = pokemonMap.value[name]?.abilities || []
          oppSelectedAbility.value[index] = abilities[0] || ''
        } else {
          oppSelectedAbility.value[index] = ''
        }
      }
    })
  }
)
</script>

<style scoped>
.battle-page {
  display: flex;
  gap: 16px;
  padding: 16px;
  align-items: flex-start;
}

.battle-left {
  flex: 2;
}

.battle-right {
  flex: 3;
}

.battle-center {
  flex: 1;
  min-width: 120px;
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
  gap: 6px;
}

.mine-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  border: 2px solid #000;
  border-radius: 6px;
  background: #666;
  width: fit-content;
}

.mine-name-box,
.mine-stats,
.mine-moves {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.mine-name-box {
  align-items: center;
  width: 64px;
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
  gap: 1px;
}

.mine-move-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── 우측 ─────────────────────────── */
.right-grid {
  display: grid;
  grid-template-columns: auto auto auto 1fr;
  gap: 6px;
  align-items: stretch; /* 셀들이 같은 행 높이에 맞춰 늘어나야 justify-content:center가 먹힘 */
}

.cell {
  padding: 6px;
  border: 2px solid #000;
  border-radius: 6px;
  background: #666;
  display: flex;
  flex-direction: column;
  justify-content: center; /* 실능치 블록 vs 기술 블록 세로 중앙정렬 */
  gap: 4px;
}

.cell-name {
  align-items: center;
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

.tool-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.opp-item-sprite {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border: 2px solid #333;
  border-radius: 6px;
  background: #e8e8e8;
  flex-shrink: 0;
}

/* 도구 select: 짧게 */
.opp-tool-select {
  width: 90px;
  font-size: 11px;
  padding: 3px;
}

/* 성격 select: 라벨이 안 잘리게 넓게 */
.opp-nature-select {
  width: 220px;
  font-size: 12px;
  padding: 4px;
  font-family: monospace;
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

.cell-opp-moves {
  gap: 6px;
}

.opp-move-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* 기술 select: 짧게 다듬기 */
.opp-move-select {
  width: 90px;
  font-size: 12px;
}

.opp-move-info {
  display: flex;
  align-items: center;
  gap: 8px;
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

@media (max-width: 768px) {
  .battle-page {
    flex-direction: column;
  }

  .right-grid {
    grid-template-columns: 1fr;
  }
}
</style>