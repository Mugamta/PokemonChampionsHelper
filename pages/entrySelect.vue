<!-- entrySelect.vue -->
<template>
  <div class="battle-page">
    <!-- 좌측: 내 파티 (읽기 전용, 카드 하나로 묶음) -->
    <section class="battle-left">
      <div class="left-list">
        <div
          v-for="index in 6"
          :key="'mine-' + index"
          class="mine-card"
          :class="{ 'mine-card--selected': isMineSelected(index - 1) }"
          @click="toggleMineSelect(index - 1)"
        >
          <span
            v-if="getMineOrder(index - 1)"
            class="mine-order-badge"
          >
            {{ getMineOrder(index - 1) }}
          </span>
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

      <div class="matrix-header-row">
        <h3 class="battle-title">
          데미지 예상 표
        </h3>
        <label class="crit-toggle">
          <input
            v-model="showCrit"
            type="checkbox"
          >
          급소
        </label>
      </div>
      <div class="dmg-matrix-wrap">
        <!-- 좌측 → 우측 -->
        <div
          v-for="mIdx in selectedMineIndices"
          :key="'atk-mine-' + mIdx"
          class="matrix-block"
        >
          <h4 class="matrix-title">
            {{ mineDisplayName(mIdx) || '미선택' }} → 상대
          </h4>
          <table class="dmg-table">
            <thead>
              <tr>
                <th>기술</th>
                <th
                  v-for="oIdx in 6"
                  :key="'opp-head-' + oIdx"
                >
                  {{ oppDisplayName(oIdx - 1) || ('상대' + oIdx) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="k in 4"
                :key="'mine-move-' + k"
              >
                <td class="dmg-move-name">
                  {{ selectedMoves[mIdx]?.[k - 1] || '-' }}
                </td>
                <td
                  v-for="oIdx in 6"
                  :key="'mine-cell-' + oIdx"
                >
                  <template v-if="getMineToOppCell(mIdx, oIdx - 1, k - 1, showCrit)">
                    <div :class="['dmg-value', { 'dmg-value--crit': showCrit }]">
                      {{ getMineToOppCell(mIdx, oIdx - 1, k - 1, showCrit).dmgMin }}~{{ getMineToOppCell(mIdx, oIdx - 1, k - 1, showCrit).dmgMax }}
                    </div>
                    <div class="dmg-percent">
                      {{ getMineToOppCell(mIdx, oIdx - 1, k - 1, showCrit).pctMin }}~{{ getMineToOppCell(mIdx, oIdx - 1, k - 1, showCrit).pctMax }}%
                    </div>
                  </template>
                  <template v-else>
                    -
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 우측 → 좌측 -->
        <div
          v-for="oIdx in 6"
          :key="'atk-opp-' + oIdx"
          class="matrix-block"
        >
          <h4 class="matrix-title">
            {{ oppDisplayName(oIdx - 1) || ('상대' + oIdx) }} → 내 파티
          </h4>
          <table class="dmg-table">
            <thead>
              <tr>
                <th>기술</th>
                <th
                  v-for="mIdx in selectedMineIndices"
                  :key="'mine-head-' + mIdx"
                >
                  {{ mineDisplayName(mIdx) || '미선택' }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="k in 4"
                :key="'opp-move-' + k"
              >
                <td class="dmg-move-name">
                  {{ oppSelectedMoves[oIdx - 1]?.[k - 1] || '-' }}
                </td>
                <td
                  v-for="mIdx in selectedMineIndices"
                  :key="'opp-cell-' + mIdx"
                >
                  <template v-if="getOppToMineCell(oIdx - 1, mIdx, k - 1, showCrit)">
                    <div :class="['dmg-value', { 'dmg-value--crit': showCrit }]">
                      {{ getOppToMineCell(oIdx - 1, mIdx, k - 1, showCrit).dmgMin }}~{{ getOppToMineCell(oIdx - 1, mIdx, k - 1, showCrit).dmgMax }}
                    </div>
                    <div class="dmg-percent">
                      {{ getOppToMineCell(oIdx - 1, mIdx, k - 1, showCrit).pctMin }}~{{ getOppToMineCell(oIdx - 1, mIdx, k - 1, showCrit).pctMax }}%
                    </div>
                  </template>
                  <template v-else>
                    -
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
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
            <!-- 1행: 포켓몬 사진, 포켓몬 select -->
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
                style="width: 154px;"
                :menu-props="{
                  location: 'bottom',
                  offset: [0, 4]
                }"
              >
                <template #selection="{ item }">
                  <span class="opp-select-text">
                    {{ getOppMegaData(index - 1) ? oppDisplayName(index - 1) : item }}
                  </span>
                </template>
              </v-autocomplete>
            </div>

            <!-- 2행: 메가진화 체크박스 + 특성 -->
            <div class="opp-row opp-row-ability">
              <span class="opp-mega-slot">
                <label
                  v-if="getOppMegaData(index - 1)"
                  class="mega-toggle"
                >
                  <input
                    v-model="oppMegaToggle[index - 1]"
                    type="checkbox"
                  >
                  메가진화
                </label>
              </span>
              <select
                v-model="oppSelectedAbility[index - 1]"
                :disabled="!oppSelectedPokemon[index - 1] || !!getOppMegaData(index - 1)"
                :title="abilityDescription(oppSelectedAbility[index - 1])"
                class="opp-ability-select"
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

            <!-- 4행: 성격 (그리드 무시하고 전체 폭 사용) -->
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
                style="padding-top: 0px; padding-bottom: 0px; padding-right: 0px; margin: 0px; border: 0px"
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
                :menu-props="{
                  location: 'bottom',
                  offset: [0, 4]
                }"
              >
                <template #selection="{ item }">
                  <span class="opp-move-select-text">{{ item }}</span>
                </template>
              </v-autocomplete>
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
import { calculateBaseDamage, calculateDamage } from '@/utils/move'
import { natureOptions, natureLabel } from '@/utils/nature-label'
import { formatMoveInfo, getMoveData } from '@/utils/move-info'
import { NatureMap } from '@/data/nature'
import { MegaEvolutionMap } from '@/data/mega-evolutions'
import { abilities } from '@/data/abilities'

const MAX_MINE_SELECT = 3
const selectedMineIndices = ref([]) // 클릭한 순서대로 index(0~5) 저장

const isMineSelected = (index) => selectedMineIndices.value.includes(index)

const getMineOrder = (index) => {
  const pos = selectedMineIndices.value.indexOf(index)
  return pos === -1 ? null : pos + 1
}

const toggleMineSelect = (index) => {
  const pos = selectedMineIndices.value.indexOf(index)
  if (pos !== -1) {
    selectedMineIndices.value.splice(pos, 1) // 다시 누르면 해제, 뒤 순서는 자동으로 당겨짐
    return
  }
  if (selectedMineIndices.value.length >= MAX_MINE_SELECT) return // 3개 초과 선택 무시
  selectedMineIndices.value.push(index)
}

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
const showCrit = ref(false)

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

// ── 좌측(선택된 최대 3마리) → 우측 6마리 매트릭스 ─────────────
const getMineToOppDamage = (mineIndex, oppIndex, moveIndex) => {
  const moveName = selectedMoves.value[mineIndex]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  if (!oppSelectedPokemon.value[oppIndex]) return null

  const attackerStats = mineDisplayStats(mineIndex)
  const defenderStats = oppDisplayStats(oppIndex)
  const category = move.Category
  const attack = category === '물리' ? attackerStats?.A || 0 : attackerStats?.C || 0
  const defense = category === '물리' ? defenderStats?.B || 0 : defenderStats?.D || 0
  const ability = selectedAbility.value[mineIndex]
  const item = selectedTool.value[mineIndex]

  return calculateDamage(
    move.Power || 0, attack, defense, true, move.Type || '', category,
    ability, battleWeather.value, item, '', battleField.value, 50
  )
}

// ── 우측 6마리 → 좌측(선택된 최대 3마리) 매트릭스 ─────────────
const getOppToMineDamage = (oppIndex, mineIndex, moveIndex) => {
  const moveName = oppSelectedMoves.value[oppIndex]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  if (!selectedPokemon.value[mineIndex]) return null

  const attackerStats = oppDisplayStats(oppIndex)
  const defenderStats = mineDisplayStats(mineIndex)
  const category = move.Category
  const attack = category === '물리' ? attackerStats?.A || 0 : attackerStats?.C || 0
  const defense = category === '물리' ? defenderStats?.B || 0 : defenderStats?.D || 0
  const ability = oppAbilityText(oppIndex)
  const item = oppSelectedTool.value[oppIndex]

  return calculateDamage(
    move.Power || 0, attack, defense, true, move.Type || '', category,
    ability, battleWeather.value, item, '', battleField.value, 50
  )
}

// 좌측 → 우측 셀 (데미지 + 체력 퍼센트, 치명타 반영)
const getMineToOppCell = (mineIndex, oppIndex, moveIndex, crit) => {
  const dmg = getMineToOppDamage(mineIndex, oppIndex, moveIndex)
  if (!dmg) return null
  const defHp = oppDisplayStats(oppIndex)?.H || 0
  const dmgMin = crit ? dmg.critMin : dmg.min
  const dmgMax = crit ? dmg.critMax : dmg.max
  const pctMin = defHp > 0 ? ((dmgMin / defHp) * 100).toFixed(1) : '0.0'
  const pctMax = defHp > 0 ? ((dmgMax / defHp) * 100).toFixed(1) : '0.0'
  return { dmgMin, dmgMax, pctMin, pctMax }
}

// 우측 → 좌측 셀 (데미지 + 체력 퍼센트, 치명타 반영)
const getOppToMineCell = (oppIndex, mineIndex, moveIndex, crit) => {
  const dmg = getOppToMineDamage(oppIndex, mineIndex, moveIndex)
  if (!dmg) return null
  const defHp = mineDisplayStats(mineIndex)?.H || 0
  const dmgMin = crit ? dmg.critMin : dmg.min
  const dmgMax = crit ? dmg.critMax : dmg.max
  const pctMin = defHp > 0 ? ((dmgMin / defHp) * 100).toFixed(1) : '0.0'
  const pctMax = defHp > 0 ? ((dmgMax / defHp) * 100).toFixed(1) : '0.0'
  return { dmgMin, dmgMax, pctMin, pctMax }
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
  return totalSum > 66 || maxValue > 32 ? 'red-input' : ''
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
  padding: 2px 8px;
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

/* ── 좌/우 리스트 공통 ─────────────────────────── */
/* 주의: right-list는 이 아래에서 다시 선언하지 말 것 (중복 선언이 gap을 덮어써서 버그의 원인이었음) */
.left-list {
  display: flex;
  flex-direction: column;
  gap: 4px; /* 좌우 카드 세로 간격 통일 */
  align-items: flex-start; /* 카드가 리스트 폭 방향으로 늘어나지 않도록 */
}
.right-list {
  display: flex;
  flex-direction: column;
  gap: 4px; /* 좌우 카드 세로 간격 통일 */
  align-items: flex-start; /* 카드가 리스트 폭 방향으로 늘어나지 않도록 */
}

.mine-card {
  position: relative;
  min-height: 140px;
  min-width: 600px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 12px;
  border: 2px solid #000;
  border-radius: 6px;
  background: #666;
  width: fit-content;
  flex: 0 0 auto; /* 남는 세로 공간을 차지하며 늘어나지 않도록 고정 */
  cursor: pointer;
  outline: 2px solid transparent;
  transition: outline-color 0.15s ease;
}

.mine-card--selected {
  outline: 3px solid #4caf50;
}

.mine-order-badge {
  position: absolute;
  top: 4px;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #4caf50;
  color: #fff;
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
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

.opp-item-sprite {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border: 2px solid #333;
  border-radius: 6px;
  background: #e8e8e8;
}

/* ── 우측: 상대 파티 카드 ─────────────────────────── */
.opp-card {
  min-height: 140px;
  min-width: 600px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 1px 4px;
  border-radius: 6px;
  background: #666;
  width: fit-content;
  flex-wrap: wrap; /* 좁은 화면에서 줄바꿈 허용 */
  flex: 0 0 auto; /* 남는 세로 공간을 차지하며 늘어나지 않도록 고정 */
}

/* 좌측 블록: 사진/select열 + 특성/도구/성격select열이 세로로 정렬되도록 grid 사용 */
.opp-left-box {
  display: grid;
  grid-template-columns: 54px 1fr; /* 좌측열 고정폭 = 사진/체크박스/도구아이콘과 동일 */
  align-items: center;
  align-content: start; /* 핵심 수정: 카드 세로 공간이 남아도 grid 행 사이를 stretch로 벌리지 않도록 고정 */
  row-gap: 2px;
  column-gap: 6px;
}

/* opp-row는 실제 박스를 만들지 않고 자식들을 그대로 grid 아이템으로 노출 */
.opp-row {
  display: contents;
}

.opp-row-nature {
  display: flex;             /* contents 대신 실제 박스로 */
  grid-column: 1 / -1;       /* 그리드 두 칼럼 전체를 차지 */
  align-items: center;
}

.opp-nature-select {
  width: 100%;                /* 확보된 전체 폭을 그대로 사용 */
  font-size: 12px;
  padding: 4px;
  font-family: monospace;
}

.opp-sprite,
.opp-mega-slot,
.opp-tool-icon-slot,
.opp-nature-slot {
  justify-self: center; /* 좌측 열 안에서 가운데 정렬 */
}

.opp-row-pokemon .opp-sprite {
  width: 54px;
  height: 54px;
}

.opp-sprite {
  width: 54px;
  height: 54px;
  object-fit: cover;
  border: 2px solid #333;
  border-radius: 6px;
  background: #e8e8e8;
}

.opp-field {
  width: 100%;
  min-width: 0;      /* flex/grid 자식이 내용 크기만큼 커지는 걸 방지 */
  font-size: 12px;
}
.opp-field :deep(.v-field__input) {
  min-width: 0;
}

.opp-mega-slot {
  display: inline-flex;
  align-items: center;
}

.text-line {
  font-size: 12px;
  color: #fff;
  white-space: nowrap;
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
  gap: 0px;
  flex-shrink: 0;
}

.ev-input {
  width: 44px;
  border: 1px solid #ccc;
  padding: 2px;
  font-size: 12px; /* 원하는 크기로 조절 */
}
.red-input {
  border-color: red !important;
  color: red;
  background-color: #fff0f0;
}

.ev-arrow {
  height: 20px;
  color: #666;
}

.opp-moves-box {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex-shrink: 0;
}

.opp-move-row {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.opp-move-select {
  width: 130px !important;
  max-width: 130px !important;
  min-width: 0 !important;
}

.opp-move-select :deep(.v-field) {
  min-width: 0 !important;
  min-height: 20px !important;
  height: 20px !important;
  overflow: hidden;
}

.opp-move-select :deep(.v-field__field) {
  min-width: 0 !important;
  min-height: 20px !important;
  height: 20px !important;
}

.opp-move-select :deep(.v-field__input) {
  min-width: 0 !important;
  min-height: 20px !important;
  height: 20px !important;

  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-left: 6px !important;
  padding-right: 2px !important;

  flex-wrap: nowrap !important;
  overflow: hidden;
}

.opp-move-select :deep(.v-field__input) {
  padding-left: 6px;
  padding-right: 2px;
  padding-top: 0px;
  padding-bottom: 0px;
  min-height: 20px;
  height: 20px;
  flex-wrap: nowrap !important;
}

.opp-move-select-text {
  display: block;
  font-size: 12px;
  line-height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.opp-move-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 10px;
  line-height: 10px;
}

.move-info-text {
  font-size: 9px;
  color: #ccc;
  white-space: nowrap;
  line-height: 10px;
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

.opp-ability-select {
  font-size: 12px;
  width: 100%;
}

.opp-tool-select {
  width: 100%; /* 100px → 130px, 7글자까지 안 잘리도록 */
  font-size: 12px;
  padding: 3px;
}

.opp-tool-icon-slot {
  width: 54px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.move-damage {
  font-size: 9px;
  color: #ffeb3b;
  white-space: nowrap;
  line-height: 10px;
}

.battle-field-controls {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}
.field-control-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
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
.opp-select-text {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  min-width: 0;
  line-height: 1.2;
}

.stats-header-row-left { display:flex; align-items:center; gap:4px; }
.stats-header-row-right { display:flex; align-items:center; gap:45px; }
.stats-header-name-left { width: 54px; }
.stats-header-name-right { width: 10px; }
.stats-header-label { width: 32px; font-size: 9px; color: #888; text-align: right; }
.mine-stat-row { display:flex; align-items:center; gap:4px; }
.stat-name-label { width: 54px; font-size: 10px; color: #fff; white-space: nowrap; }
.stat-value { width: 32px; text-align: right; font-weight: bold; font-size: 12px; }

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
.dmg-matrix-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-x: auto;
}
.matrix-block {
  min-width: 0;
}
.matrix-title {
  color: #fff;
  font-size: 13px;
  margin: 0 0 4px 0;
}
.dmg-table {
  border-collapse: collapse;
  font-size: 11px;
  color: #fff;
  width: 100%;
}
.dmg-table th,
.dmg-table td {
  border: 1px solid #555;
  padding: 3px 6px;
  text-align: center;
  white-space: nowrap;
}
.dmg-table th {
  background: #444;
}
.dmg-move-name {
  text-align: left;
  color: #ccc;
}
.matrix-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.matrix-header-row .battle-title {
  margin: 0;
}
.crit-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #ffeb3b;
  cursor: pointer;
}

.dmg-value {
  font-weight: bold;
  color: #fff;
}
.dmg-value--crit {
  color: #ff5252; /* 급소 시 빨간색으로 강조 */
}
.dmg-percent {
  font-size: 9px;
  color: #aaa;
}
</style>