<!-- pages/singleBattle.vue -->
<template>
  <div class="sb-page">
    <!-- 좌상단: 내 기술 목록 + 데미지 -->
    <section class="sb-panel sb-panel--moves sb-cell-mine-moves">
      <h4 class="sb-panel-title">
        포켓몬 기술 목록과 데미지
      </h4>

      <div
        v-if="activeMineIndex === null"
        class="sb-select-row"
      >
        <button
          v-for="idx in orderedMineIndices"
          :key="'mine-pick-' + idx"
          type="button"
          class="sb-pick-btn"
          @click="selectMine(idx)"
        >
          <img
            :src="mySprite(idx)"
            class="sb-pick-sprite"
            @error="$event.target.src = pokemonImg"
          >
          <span class="sb-pick-name">{{ selectedPokemon[idx] || '-' }}</span>
        </button>
      </div>

      <div
        v-else
        class="sb-move-list"
      >
        <div
          v-for="k in 4"
          :key="'mine-atk-' + k"
          class="sb-move-row"
        >
          <span class="sb-move-name">{{ selectedMoves[activeMineIndex]?.[k - 1] || '-' }}</span>
          <template v-if="activeOppIndex !== null && mineCell(k - 1)">
            <span :class="['sb-dmg', { 'sb-dmg--crit': showCrit }]">
              {{ mineCell(k - 1).dmgMin }}~{{ mineCell(k - 1).dmgMax }}
            </span>
            <span class="sb-pct">
              {{ mineCell(k - 1).pctMin }}~{{ mineCell(k - 1).pctMax }}%
            </span>
          </template>
          <span
            v-else
            class="sb-dmg-empty"
          >-</span>
        </div>
      </div>
    </section>

    <!-- 중상단: 날씨, 필드, 룸 -->
    <section class="sb-panel sb-panel--field sb-cell-field">
      <!-- 날씨: 쾌청/큰가뭄 세로쌍, 비/폭우 세로쌍 -->
      <div class="sb-field-row">
        <span class="sb-field-label">날씨</span>
        <div class="sb-weather-buttons">
          <div class="sb-weather-row">
            <button
              v-for="w in ['없음', '쾌청', '비', '모래바람', '눈']"
              :key="w"
              type="button"
              class="sb-field-btn"
              :class="{ active: battleWeather === w }"
              @click="toggleBattleWeather(w)"
            >
              {{ w }}
            </button>
          </div>
          <div class="sb-weather-row">
            <button
              v-for="w in ['난기류', '큰가뭄', '폭우']"
              :key="w"
              type="button"
              class="sb-field-btn"
              :class="{ active: battleWeather === w }"
              @click="toggleBattleWeather(w)"
            >
              {{ w }}
            </button>
          </div>
        </div>
        <div
          v-if="battleWeather !== '없음'"
          class="sb-turn-counter"
        >
          <button
            type="button"
            @click="changeExtendableTurn(weatherTurn, -1)"
          >
            -
          </button>
          <span>{{ weatherTurn.current }}/{{ weatherTurn.total }}</span>
          <button
            type="button"
            @click="changeExtendableTurn(weatherTurn, 1)"
          >
            +
          </button>
        </div>
      </div>

      <!-- 필드 -->
      <div class="sb-field-row">
        <span class="sb-field-label">필드</span>
        <div class="sb-field-buttons">
          <button
            v-for="f in fieldOptions"
            :key="f"
            type="button"
            class="sb-field-btn"
            :class="{ active: battleField === f }"
            @click="toggleBattleField(f)"
          >
            {{ f }}
          </button>
        </div>
        <div
          v-if="battleField !== '없음'"
          class="sb-turn-counter"
        >
          <button
            type="button"
            @click="changeExtendableTurn(fieldTurn, -1)"
          >
            -
          </button>
          <span>{{ fieldTurn.current }}/{{ fieldTurn.total }}</span>
          <button
            type="button"
            @click="changeExtendableTurn(fieldTurn, 1)"
          >
            +
          </button>
        </div>
      </div>

      <!-- 공간변화 -->
      <div class="sb-field-row">
        <span class="sb-field-label">공간변화</span>
        <div class="sb-field-buttons">
          <button
            v-for="r in roomOptions"
            :key="r"
            type="button"
            class="sb-field-btn"
            :class="{ active: !!activeRooms[r] }"
            @click="toggleRoom(r)"
          >
            {{ r }}
          </button>
        </div>
      </div>
      <div
        v-if="Object.keys(activeRooms).length"
        class="sb-room-status-list"
      >
        <div
          v-for="(val, name) in activeRooms"
          :key="'room-status-' + name"
          class="sb-turn-counter"
        >
          <span>{{ name }}</span>
          <button
            type="button"
            @click="changeRoomTurn(name, -1)"
          >
            -
          </button>
          <span>{{ val.current }}/{{ val.total }}</span>
          <button
            type="button"
            @click="changeRoomTurn(name, 1)"
          >
            +
          </button>
        </div>
      </div>

      <label class="sb-crit-toggle">
        <input
          v-model="showCrit"
          type="checkbox"
        >
        급소(치명타)
      </label>
    </section>

    <!-- 우상단: 상대 카드 + 랭크업 상태 -->
    <section class="sb-panel sb-panel--opp-status sb-cell-opp-status">
      <div
        v-if="activeOppIndex === null"
        class="sb-select-row"
      >
        <button
          v-for="i in 6"
          :key="'opp-pick-' + i"
          type="button"
          class="sb-pick-btn"
          :disabled="!oppSelectedPokemon[i - 1]"
          @click="selectOpp(i - 1)"
        >
          <img
            :src="opponentSprite(i - 1)"
            class="sb-pick-sprite"
            @error="$event.target.src = pokemonImg"
          >
          <span class="sb-pick-name">{{ oppSelectedPokemon[i - 1] || '-' }}</span>
        </button>
      </div>

      <template v-else>
        <div class="sb-status-card">
          <img
            :src="opponentSprite(activeOppIndex)"
            class="sb-status-sprite"
            @error="$event.target.src = pokemonImg"
          >
          <div class="sb-status-info">
            <span class="sb-status-name">{{ oppDisplayName(activeOppIndex) }}</span>
            <label
              v-if="getOppMegaData(activeOppIndex)"
              class="sb-mega-toggle"
            >
              <input
                v-model="oppMegaToggle[activeOppIndex]"
                type="checkbox"
              >
              메가진화
            </label>
            <div class="sb-hp-bar-bg">
              <div
                class="sb-hp-bar-fill"
                :style="{ width: oppHpBarPercent + '%' }"
              />
            </div>
            <span class="sb-hp-text">{{ Math.max(0, Math.round(oppCurrentHpMin[activeOppIndex] ?? 0)) }}~{{ Math.max(0, Math.round(oppCurrentHpMax[activeOppIndex] ?? 0)) }}/{{ oppMaxHp }} ({{ oppHpPercentMin }}~{{ oppHpPercentMax }}%)</span>
          </div>

          <div class="sb-swap-area">
            <button
              type="button"
              class="sb-change-btn"
              @click="oppSwapOpen = !oppSwapOpen"
            >
              교체
            </button>
            <div
              v-if="oppSwapOpen"
              class="sb-swap-list"
            >
              <button
                v-for="i in 6"
                v-show="i - 1 !== activeOppIndex && oppSelectedPokemon[i - 1]"
                :key="'opp-swap-' + i"
                type="button"
                class="sb-pick-btn"
                @click="selectOpp(i - 1)"
              >
                <img
                  :src="opponentSprite(i - 1)"
                  class="sb-pick-sprite"
                  @error="$event.target.src = pokemonImg"
                >
                <span class="sb-pick-name">{{ oppSelectedPokemon[i - 1] }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="sb-rank-box">
          <div
            v-for="stat in rankStatKeys"
            :key="'opp-rank-' + stat.key"
            class="sb-rank-row"
          >
            <span class="sb-rank-name">{{ stat.name }}</span>
            <span class="sb-rank-arrows">
              <span
                v-for="n in 6"
                :key="'arrow-' + n"
                class="sb-arrow"
                :class="{
                  'sb-arrow--pos': oppRanks[stat.key] > 0 && isRankArrowFilled(oppRanks[stat.key], n),
                  'sb-arrow--neg': oppRanks[stat.key] < 0 && isRankArrowFilled(oppRanks[stat.key], n),
                }"
              >{{ rankArrowChar(oppRanks[stat.key]) }}</span>
            </span>
            <span class="sb-rank-value">{{ oppRanks[stat.key] >= 0 ? '+' : '' }}{{ oppRanks[stat.key] }}</span>
            <span class="sb-rank-btns">
              <button
                type="button"
                class="sb-rank-btn"
                @click="changeRank(oppRanks, stat.key, 1)"
              >
                ▲
              </button>
              <button
                type="button"
                class="sb-rank-btn"
                @click="changeRank(oppRanks, stat.key, -1)"
              >
                ▼
              </button>
            </span>
          </div>
        </div>
      </template>
    </section>

    <!-- 좌하단: 내 랭크업 상태 + 내 카드 -->
    <section class="sb-panel sb-panel--mine-status sb-cell-mine-status">
      <template v-if="activeMineIndex !== null">
        <div class="sb-rank-box">
          <div
            v-for="stat in rankStatKeys"
            :key="'mine-rank-' + stat.key"
            class="sb-rank-row"
          >
            <span class="sb-rank-name">{{ stat.name }}</span>
            <span class="sb-rank-arrows">
              <span
                v-for="n in 6"
                :key="'arrow-' + n"
                class="sb-arrow"
                :class="{
                  'sb-arrow--pos': mineRanks[stat.key] > 0 && isRankArrowFilled(mineRanks[stat.key], n),
                  'sb-arrow--neg': mineRanks[stat.key] < 0 && isRankArrowFilled(mineRanks[stat.key], n),
                }"
              >{{ rankArrowChar(mineRanks[stat.key]) }}</span>
            </span>
            <span class="sb-rank-value">{{ mineRanks[stat.key] >= 0 ? '+' : '' }}{{ mineRanks[stat.key] }}</span>
            <span class="sb-rank-btns">
              <button
                type="button"
                class="sb-rank-btn"
                @click="changeRank(mineRanks, stat.key, 1)"
              >
                ▲
              </button>
              <button
                type="button"
                class="sb-rank-btn"
                @click="changeRank(mineRanks, stat.key, -1)"
              >
                ▼
              </button>
            </span>
          </div>
        </div>

        <div class="sb-status-card">
          <img
            :src="mySprite(activeMineIndex)"
            class="sb-status-sprite"
            @error="$event.target.src = pokemonImg"
          >
          <div class="sb-status-info">
            <span class="sb-status-name">{{ mineDisplayName(activeMineIndex) }}</span>
            <label
              v-if="getMineMegaData(activeMineIndex)"
              class="sb-mega-toggle"
            >
              <input
                v-model="mineMegaToggle[activeMineIndex]"
                type="checkbox"
              >
              메가진화
            </label>
            <div class="sb-hp-bar-bg">
              <div
                class="sb-hp-bar-fill"
                :style="{ width: mineHpPercent + '%' }"
              />
            </div>
            <span class="sb-hp-text">{{ Math.round(mineCurrentHp[activeMineIndex] || 0) }}/{{ mineMaxHp }} ({{ mineHpPercent }}%)</span>
          </div>

          <div class="sb-swap-area">
            <button
              type="button"
              class="sb-change-btn"
              @click="mineSwapOpen = !mineSwapOpen"
            >
              교체
            </button>
            <div
              v-if="mineSwapOpen"
              class="sb-swap-list"
            >
              <button
                v-for="idx in orderedMineIndices"
                v-show="idx !== activeMineIndex"
                :key="'mine-swap-' + idx"
                type="button"
                class="sb-pick-btn"
                @click="selectMine(idx)"
              >
                <img
                  :src="mySprite(idx)"
                  class="sb-pick-sprite"
                  @error="$event.target.src = pokemonImg"
                >
                <span class="sb-pick-name">{{ selectedPokemon[idx] }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
      <div
        v-else
        class="sb-placeholder"
      >
        왼쪽 위에서 내 포켓몬을 선택하세요
      </div>
    </section>

    <section class="sb-panel sb-cell-empty sb-panel--action-log">
      <div class="sb-action-block">
        <h5 class="sb-action-title">
          내 행동
        </h5>
        <div class="sb-action-type-row">
          <label>
            <input
              v-model="mineAction.type"
              type="radio"
              value="교체"
            >
            교체
          </label>
          <label>
            <input
              v-model="mineAction.type"
              type="radio"
              value="기술사용"
            >
            기술 사용
          </label>
        </div>

        <div
          v-if="mineAction.type === '교체'"
          class="sb-action-detail"
        >
          <select v-model="mineAction.targetIndex">
            <option
              :value="null"
              disabled
            >
              포켓몬 선택
            </option>
            <option
              v-for="idx in orderedMineIndices"
              :key="'mine-act-target-' + idx"
              :value="idx"
              :disabled="idx === activeMineIndex"
            >
              {{ selectedPokemon[idx] }}
            </option>
          </select>
        </div>

        <div
          v-else
          class="sb-action-detail"
        >
          <select
            v-model.number="mineAction.moveIndex"
            :disabled="activeMineIndex === null"
          >
            <option
              v-for="k in 4"
              :key="'mine-act-move-' + k"
              :value="k - 1"
            >
              {{ selectedMoves[activeMineIndex]?.[k - 1] || '-' }}
            </option>
          </select>
          <label
            v-if="activeMineIndex !== null && getMineMegaData(activeMineIndex)"
            class="sb-mega-toggle"
          >
            <input
              v-model="mineAction.useMega"
              type="checkbox"
            > 메가진화 사용
          </label>
        </div>
      </div>

      <div class="sb-action-block">
        <h5 class="sb-action-title">
          상대 행동
        </h5>
        <div class="sb-action-type-row">
          <label>
            <input
              v-model="oppAction.type"
              type="radio"
              value="교체"
            >
            교체
          </label>
          <label>
            <input
              v-model="oppAction.type"
              type="radio"
              value="기술사용"
            >
            기술 사용
          </label>
        </div>

        <div
          v-if="oppAction.type === '교체'"
          class="sb-action-detail"
        >
          <select v-model="oppAction.targetIndex">
            <option
              :value="null"
              disabled
            >
              포켓몬 선택
            </option>
            <option
              v-for="i in 6"
              :key="'opp-act-target-' + i"
              :value="i - 1"
              :disabled="i - 1 === activeOppIndex || !oppSelectedPokemon[i - 1]"
            >
              {{ oppSelectedPokemon[i - 1] || '-' }}
            </option>
          </select>
        </div>

        <div
          v-else
          class="sb-action-detail"
        >
          <select
            v-model.number="oppAction.moveIndex"
            :disabled="activeOppIndex === null"
          >
            <option
              v-for="k in 4"
              :key="'opp-act-move-' + k"
              :value="k - 1"
            >
              {{ oppSelectedMoves[activeOppIndex]?.[k - 1] || '-' }}
            </option>
          </select>
          <label
            v-if="activeOppIndex !== null && getOppMegaData(activeOppIndex)"
            class="sb-mega-toggle"
          >
            <input
              v-model="oppAction.useMega"
              type="checkbox"
            > 메가진화 사용
          </label>
          <input
            v-model.number="oppAction.damageTaken"
            type="number"
            min="0"
            placeholder="받은 데미지"
            class="sb-dmg-input"
          >
        </div>
      </div>
      <button
        type="button"
        class="sb-execute-btn"
        @click="executeTurn"
      >
        이번 턴 적용
      </button>
    </section>


    <!-- 우하단: 상대 기술 목록 + 데미지 -->
    <section class="sb-panel sb-panel--moves sb-cell-opp-moves">
      <h4 class="sb-panel-title">
        포켓몬 기술 목록과 데미지
      </h4>
      <div
        v-if="activeOppIndex === null"
        class="sb-placeholder"
      >
        오른쪽 위에서 상대 포켓몬을 선택하세요
      </div>
      <div
        v-else
        class="sb-move-list"
      >
        <div
          v-for="k in 4"
          :key="'opp-atk-' + k"
          class="sb-move-row"
        >
          <span class="sb-move-name">{{ oppSelectedMoves[activeOppIndex]?.[k - 1] || '-' }}</span>
          <template v-if="activeMineIndex !== null && oppCell(k - 1)">
            <span :class="['sb-dmg', { 'sb-dmg--crit': showCrit }]">
              {{ oppCell(k - 1).dmgMin }}~{{ oppCell(k - 1).dmgMax }}
            </span>
            <span class="sb-pct">
              {{ oppCell(k - 1).pctMin }}~{{ oppCell(k - 1).pctMax }}%
            </span>
          </template>
          <span
            v-else
            class="sb-dmg-empty"
          >-</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { calculateStat } from '@/utils/stat'
import { calculateDamage } from '@/utils/move'
import { MegaEvolutionMap } from '@/data/mega-evolutions'
import { getMoveData } from '@/utils/move-info'

const mineAction = reactive({ type: '기술사용', moveIndex: 0, targetIndex: null, useMega: false })
const oppAction = reactive({ type: '기술사용', moveIndex: 0, targetIndex: null, useMega: false, damageTaken: 0 })

const config = useRuntimeConfig()
const pokemonImg = (config.app.baseURL || '/') + 'pokemon.webp'

const { pokemonMap } = useEligiblePokemon()

const {
  selectedPokemon,
  selectedAbility,
  selectedNature,
  selectedTool,
  selectedMoves,
  inputStats,
  calcStats,
} = useParty()

const {
  selectedPokemon: oppSelectedPokemon,
  selectedAbility: oppSelectedAbility,
  selectedNature: oppSelectedNature,
  selectedTool: oppSelectedTool,
  selectedMoves: oppSelectedMoves,
  inputStats: oppInputStats,
  calcStats: oppCalcStats,
} = useOpponentParty()

const { selectedMineIndices } = useMineOrderSelection()

// entrySelect에서 1,2,3번으로 고른 순서 그대로의 index 배열
const orderedMineIndices = computed(() => [...selectedMineIndices.value])

const activeMineIndex = ref(null)
const activeOppIndex = ref(null)
const mineSwapOpen = ref(false)
const oppSwapOpen = ref(false)
const showCrit = ref(false)

// ── 메가진화 판정 ─────────────
const getMineMegaData = (index) => {
  const name = selectedPokemon.value[index]
  const tool = selectedTool.value[index]
  if (!name || !tool) return null
  const list = MegaEvolutionMap[name]
  if (!list) return null
  return list.find((m) => m.stoneName === tool) || null
}
const getOppMegaData = (index) => {
  const name = oppSelectedPokemon.value[index]
  const tool = oppSelectedTool.value[index]
  if (!name || !tool) return null
  const list = MegaEvolutionMap[name]
  if (!list) return null
  return list.find((m) => m.stoneName === tool) || null
}

// ── 슬롯별 상태 저장(체력/메가진화 토글) — 교체해도 유지됨 ─────────────
const mineCurrentHp = reactive({})
const mineMegaToggle = reactive({})
const oppMegaToggle = reactive({})

// 기존 oppCurrentHp = reactive({}) 를 아래 두 개로 교체
const oppCurrentHpMin = reactive({})
const oppCurrentHpMax = reactive({})

const buildDisplayStats = (name, mega, calcStatsRef, index, natureRef, itemRef, evsRef) => {
  if (mega) return calcStatsRef.value[index] || {}
  const data = name ? pokemonMap.value[name] : null
  if (!data?.stats) return calcStatsRef.value[index] || {}
  const natureName = natureRef.value[index]?.replace(/\([^)]*\)/g, '') || '무보정'
  const itemName = itemRef.value[index] || ''
  const keys = ['H', 'A', 'B', 'C', 'D', 'S']
  const result = {}
  keys.forEach((k) => {
    result[k] = calculateStat(k, data.stats[k] || 0, evsRef.value[index]?.[k] || 0, natureName, itemName, '')
  })
  return result
}

const mineDisplayStats = (index) => {
  const mega = getMineMegaData(index)
  const toggled = mineMegaToggle[index] !== false // 기본값 true
  return buildDisplayStats(selectedPokemon.value[index], mega && toggled, calcStats, index, selectedNature, selectedTool, inputStats)
}
const oppDisplayStats = (index) => {
  const mega = getOppMegaData(index)
  const toggled = oppMegaToggle[index] !== false
  return buildDisplayStats(oppSelectedPokemon.value[index], mega && toggled, oppCalcStats, index, oppSelectedNature, oppSelectedTool, oppInputStats)
}

const ensureMineHpInit = (index) => {
  if (mineCurrentHp[index] === undefined) {
    mineCurrentHp[index] = mineDisplayStats(index)?.H || 0
  }
  if (mineMegaToggle[index] === undefined) {
    mineMegaToggle[index] = true
  }
}
const ensureOppHpInit = (index) => {
  const maxHp = oppDisplayStats(index)?.H || 0
  if (oppCurrentHpMin[index] === undefined) oppCurrentHpMin[index] = maxHp
  if (oppCurrentHpMax[index] === undefined) oppCurrentHpMax[index] = maxHp
  if (oppMegaToggle[index] === undefined) oppMegaToggle[index] = true
}

const selectMine = (idx) => {
  ensureMineHpInit(idx)
  activeMineIndex.value = idx
  mineSwapOpen.value = false
}
const selectOpp = (idx) => {
  ensureOppHpInit(idx)
  activeOppIndex.value = idx
  oppSwapOpen.value = false
}

watch(
  orderedMineIndices,
  (list) => {
    if (list.length === 0) {
      activeMineIndex.value = null
      return
    }
    if (activeMineIndex.value === null || !list.includes(activeMineIndex.value)) {
      selectMine(list[0])
    }
  },
  { immediate: true },
)

const mineMaxHp = computed(() => (activeMineIndex.value === null ? 0 : (mineDisplayStats(activeMineIndex.value)?.H || 0)))
const oppMaxHp = computed(() => (activeOppIndex.value === null ? 0 : (oppDisplayStats(activeOppIndex.value)?.H || 0)))
const mineHpPercent = computed(() => {
  if (activeMineIndex.value === null || !mineMaxHp.value) return 0
  return Math.round(((mineCurrentHp[activeMineIndex.value] || 0) / mineMaxHp.value) * 100)
})
const oppHpPercentMin = computed(() => {
  if (activeOppIndex.value === null || !oppMaxHp.value) return 0
  return Math.max(0, Math.round(((oppCurrentHpMin[activeOppIndex.value] ?? 0) / oppMaxHp.value) * 100))
})
const oppHpPercentMax = computed(() => {
  if (activeOppIndex.value === null || !oppMaxHp.value) return 0
  return Math.max(0, Math.round(((oppCurrentHpMax[activeOppIndex.value] ?? 0) / oppMaxHp.value) * 100))
})
const oppHpBarPercent = computed(() => (oppHpPercentMin.value + oppHpPercentMax.value) / 2)

// ── 날씨 / 필드 / 룸 + 턴 카운터 ─────────────
const fieldOptions = ['일렉트릭필드', '그래스필드', '미스트필드', '사이코필드']

const battleWeather = ref('없음')
const battleField = ref('없음')

const weatherTurn = reactive({ current: 0, total: 5 })
const fieldTurn = reactive({ current: 0, total: 5 })

const changeTurn = (target, delta) => {
  target.current = Math.min(target.total, Math.max(0, target.current + delta))
}

const WEATHER_BASE_TOTAL = 5
const WEATHER_EXTENDED_TOTAL = 8

// 날씨/필드 전용: 기본치(5턴)에서 +를 누르면 total이 8로 늘어남 (도구로 연장되는 경우 표현)
const changeExtendableTurn = (target, delta) => {
  if (delta > 0) {
    if (target.current >= target.total && target.total < WEATHER_EXTENDED_TOTAL) {
      target.total = WEATHER_EXTENDED_TOTAL
    }
    target.current = Math.min(target.total, target.current + 1)
  } else {
    target.current = Math.max(0, target.current - 1)
  }
}

const toggleBattleWeather = (v) => {
  battleWeather.value = v === '없음' ? '없음' : (battleWeather.value === v ? '없음' : v)
  weatherTurn.current = 0
  weatherTurn.total = WEATHER_BASE_TOTAL
}
const toggleBattleField = (v) => {
  battleField.value = battleField.value === v ? '없음' : v
  fieldTurn.current = 0
  fieldTurn.total = WEATHER_BASE_TOTAL
}
const roomOptions = ['매직룸', '트릭룸', '원더룸', '중력']
const activeRooms = reactive({}) // { [이름]: { current, total } } — 여러 개 동시 선택 가능

const toggleRoom = (name) => {
  if (activeRooms[name]) {
    delete activeRooms[name]
  } else {
    activeRooms[name] = { current: 0, total: 5 }
  }
}
const changeRoomTurn = (name, delta) => {
  const r = activeRooms[name]
  if (!r) return
  r.current = Math.min(r.total, Math.max(0, r.current + delta))
}
// 교체 → 기술사용 순으로 처리
const executeTurn = () => {
  // 1. 교체가 최우선
  if (mineAction.type === '교체' && mineAction.targetIndex !== null) {
    selectMine(mineAction.targetIndex)
  }
  if (oppAction.type === '교체' && oppAction.targetIndex !== null) {
    selectOpp(oppAction.targetIndex)
  }

  // 2. 기술 사용 — 메가진화를 쓴다고 체크했으면 이번 턴부터 계속 메가진화 상태로 유지
  if (mineAction.type === '기술사용') {
    if (mineAction.useMega && activeMineIndex.value !== null) {
      mineMegaToggle[activeMineIndex.value] = true
    }
    const cell = mineCell(mineAction.moveIndex)
    if (cell && activeOppIndex.value !== null) {
      const oi = activeOppIndex.value
      // 내가 입힌 데미지는 정확히 모르므로, 예상 데미지 범위만큼 상대 체력 범위를 줄임
      oppCurrentHpMin[oi] = Math.max(0, (oppCurrentHpMin[oi] ?? 0) - cell.dmgMax)
      oppCurrentHpMax[oi] = Math.max(0, (oppCurrentHpMax[oi] ?? 0) - cell.dmgMin)
    }
  }

  if (oppAction.type === '기술사용') {
    if (oppAction.useMega && activeOppIndex.value !== null) {
      oppMegaToggle[activeOppIndex.value] = true
    }
    // 상대가 준 데미지는 실제 게임 화면을 보고 입력한 정확한 값이므로 그대로 차감
    if (activeMineIndex.value !== null) {
      const mi = activeMineIndex.value
      mineCurrentHp[mi] = Math.max(0, (mineCurrentHp[mi] || 0) - (Number(oppAction.damageTaken) || 0))
    }
  }

  // 3. 날씨/필드/공간변화 턴 진행
  if (battleWeather.value !== '없음') changeExtendableTurn(weatherTurn, 1)
  if (battleField.value !== '없음') changeExtendableTurn(fieldTurn, 1)
  Object.keys(activeRooms).forEach((name) => changeRoomTurn(name, 1))

  // 4. 다음 턴 입력을 위해 데미지 입력값 초기화
  oppAction.damageTaken = 0
}

// ── 랭크업 ─────────────
const rankStatKeys = [
  { key: 'A', name: '공격' },
  { key: 'B', name: '방어' },
  { key: 'C', name: '특수공격' },
  { key: 'D', name: '특수방어' },
]
const mineRanks = reactive({ A: 0, B: 0, C: 0, D: 0 })
const oppRanks = reactive({ A: 0, B: 0, C: 0, D: 0 })

const changeRank = (target, key, delta) => {
  target[key] = Math.min(6, Math.max(-6, target[key] + delta))
}
const rankMultiplier = (stage) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage))

// 6개 삼각형 중 몇 번째까지 채울지 / 방향(위·아래) 문자
const rankArrowChar = (rank) => (rank < 0 ? '▼' : '▲')
const isRankArrowFilled = (rank, n) => n <= Math.abs(rank)

const mineDisplayName = (index) => {
  const mega = getMineMegaData(index)
  const toggled = mineMegaToggle[index] !== false
  return mega && toggled ? mega.megaName : (selectedPokemon.value[index] || '')
}
const oppDisplayName = (index) => {
  const mega = getOppMegaData(index)
  const toggled = oppMegaToggle[index] !== false
  return mega && toggled ? mega.megaName : (oppSelectedPokemon.value[index] || '')
}

const mySprite = (index) => {
  const mega = getMineMegaData(index)
  const toggled = mineMegaToggle[index] !== false
  if (mega && toggled) return `${config.app.baseURL || '/'}pokemon_sprites/${mega.id}.png`
  const data = pokemonMap.value[selectedPokemon.value[index]]
  return data?.id ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png` : pokemonImg
}
const opponentSprite = (index) => {
  const mega = getOppMegaData(index)
  const toggled = oppMegaToggle[index] !== false
  if (mega && toggled) return `${config.app.baseURL || '/'}pokemon_sprites/${mega.id}.png`
  const data = pokemonMap.value[oppSelectedPokemon.value[index]]
  return data?.id ? `${config.app.baseURL || '/'}pokemon_sprites/${data.id}.png` : pokemonImg
}

const buildCell = (move, atkStats, defStats, atkKey, defKey, atkRank, defRank, ability, item) => {
  const category = move.Category
  const attack = (atkStats?.[atkKey] || 0) * rankMultiplier(atkRank)
  const defense = (defStats?.[defKey] || 0) * rankMultiplier(defRank)
  const dmg = calculateDamage(move.Power || 0, attack, defense, true, move.Type || '', category, ability, battleWeather.value, item, '', battleField.value, 50)
  const defHp = defStats?.H || 0
  const dmgMin = showCrit.value ? dmg.critMin : dmg.min
  const dmgMax = showCrit.value ? dmg.critMax : dmg.max
  return {
    dmgMin,
    dmgMax,
    pctMin: defHp > 0 ? ((dmgMin / defHp) * 100).toFixed(1) : '0.0',
    pctMax: defHp > 0 ? ((dmgMax / defHp) * 100).toFixed(1) : '0.0',
  }
}

const mineCell = (moveIndex) => {
  if (activeMineIndex.value === null || activeOppIndex.value === null) return null
  const moveName = selectedMoves.value[activeMineIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'
  return buildCell(
    move,
    mineDisplayStats(activeMineIndex.value),
    oppDisplayStats(activeOppIndex.value),
    atkKey, defKey,
    mineRanks[atkKey], oppRanks[defKey],
    selectedAbility.value[activeMineIndex.value],
    selectedTool.value[activeMineIndex.value],
  )
}

const oppCell = (moveIndex) => {
  if (activeMineIndex.value === null || activeOppIndex.value === null) return null
  const moveName = oppSelectedMoves.value[activeOppIndex.value]?.[moveIndex]
  if (!moveName) return null
  const move = getMoveData(moveName)
  if (!move || move.Category === '변화') return null
  const atkKey = move.Category === '물리' ? 'A' : 'C'
  const defKey = move.Category === '물리' ? 'B' : 'D'
  const mega = getOppMegaData(activeOppIndex.value)
  const toggled = oppMegaToggle[activeOppIndex.value] !== false
  const ability = (mega && toggled) ? mega.ability : oppSelectedAbility.value[activeOppIndex.value]
  return buildCell(
    move,
    oppDisplayStats(activeOppIndex.value),
    mineDisplayStats(activeMineIndex.value),
    atkKey, defKey,
    oppRanks[atkKey], mineRanks[defKey],
    ability,
    oppSelectedTool.value[activeOppIndex.value],
  )
}
</script>

<style scoped>
.sb-page {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) 300px minmax(320px, 1fr);
  grid-template-rows: 1fr 1fr;
  grid-template-areas:
    "mineMoves  field       oppStatus"
    "mineStatus fieldBottom oppMoves";
  gap: 12px;
  padding: 8px;
  min-height: calc(100vh - 64px);
  box-sizing: border-box;
}
.sb-cell-mine-moves  { grid-area: mineMoves; }
.sb-cell-field        { grid-area: field; }
.sb-cell-opp-status  { grid-area: oppStatus; }
.sb-cell-mine-status { grid-area: mineStatus; }
.sb-cell-empty        { grid-area: fieldBottom; }
.sb-cell-opp-moves   { grid-area: oppMoves; }

.sb-panel { background:#555; border-radius:6px; padding:8px; color:#fff; min-height:60px; height:100%; box-sizing:border-box; }
.sb-panel--action-log { display:flex; flex-direction:column; gap:12px; }
.sb-action-block { display:flex; flex-direction:column; gap:6px; }
.sb-action-title { margin:0; font-size:12px; color:#ffeb3b; }
.sb-action-type-row { display:flex; gap:12px; font-size:11px; }
.sb-action-detail { display:flex; align-items:center; gap:10px; }
.sb-action-detail select { font-size:11px; padding:2px 4px; }

/* 기술목록 패널: 셀 높이를 채우지 않고 내용에 맞춰 짧게 */
.sb-panel--moves { align-self:start; height:auto; }

.sb-panel--field { display:flex; flex-direction:column; gap:10px; }
.sb-panel--opp-status,
.sb-panel--mine-status { display:flex; flex-direction:column; gap:8px; justify-content: space-between; }

.sb-panel-title { margin:0 0 6px 0; font-size:13px; }

.sb-select-row { display:flex; flex-wrap:wrap; gap:6px; }
.sb-pick-btn { display:flex; flex-direction:column; align-items:center; gap:2px; background:#444; border:1px solid #777; border-radius:6px; padding:4px; cursor:pointer; color:#fff; width:60px; }
.sb-pick-btn:disabled { opacity:0.3; cursor:default; }
.sb-pick-sprite { width:40px; height:40px; object-fit:cover; }
.sb-pick-name { font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:56px; }

.sb-change-btn { font-size:10px; background:#333; color:#fff; border:1px solid #888; border-radius:4px; padding:4px 8px; cursor:pointer; white-space:nowrap; }

.sb-move-list { display:flex; flex-direction:column; gap:6px; }
.sb-move-row { display:flex; align-items:center; gap:8px; }
.sb-move-name { flex:1; font-size:12px; }
.sb-dmg { font-weight:bold; font-size:12px; }
.sb-dmg--crit { color:#ff5252; }
.sb-pct { font-size:9px; color:#aaa; }
.sb-dmg-empty { color:#888; }

.sb-field-row { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.sb-field-label { font-size:10px; color:#ccc; width: 26px; }
.sb-field-buttons { display:flex; flex-wrap:wrap; gap:2px; }
.sb-weather-buttons { display:flex; flex-direction:column; gap:2px; }
.sb-weather-row { display:flex; gap:2px; flex-wrap:wrap; }
.sb-field-btn { font-size:10px; padding:2px 6px; border:1px solid #999; border-radius:4px; cursor:pointer; background:#444; color:#fff; }
.sb-field-btn.active { background:#4caf50; }
.sb-crit-toggle { display:flex; align-items:center; gap:4px; font-size:12px; color:#ffeb3b; cursor:pointer; }

.sb-turn-counter { display:flex; align-items:center; gap:4px; font-size:10px; color:#ccc; margin-left:4px; }
.sb-turn-counter button { font-size:10px; width:16px; height:16px; line-height:1; border:1px solid #888; background:#444; color:#fff; cursor:pointer; border-radius:3px; }

.sb-status-name { font-size:13px; font-weight:bold; }
.sb-mega-toggle { display:flex; align-items:center; gap:4px; font-size:10px; color:#ffeb3b; cursor:pointer; }
.sb-hp-bar-bg { width:100%; height:8px; background:#222; border-radius:4px; overflow:hidden; }
.sb-hp-bar-fill { height:100%; background:linear-gradient(90deg,#8bc34a,#4caf50); }
.sb-hp-text { font-size:10px; color:#ccc; }

.sb-status-card { display:flex; flex-direction:row; align-items:flex-start; gap:8px; }
.sb-status-sprite { width:56px; height:56px; object-fit:cover; border:2px solid #333; border-radius:6px; background:#e8e8e8; flex-shrink:0; }
.sb-status-info { display:flex; flex-direction:column; gap:2px; width:140px; min-width:0; } /* 체력바가 가로 전체를 차지하지 않도록 폭 고정 */
.sb-swap-area { position:relative; flex-shrink:0; }
.sb-swap-list { position:absolute; right:0; top:110%; z-index:5; width:180px; display:flex; flex-wrap:wrap; gap:6px; padding:6px; background:#444; border-radius:6px; box-shadow:0 4px 10px rgba(0,0,0,0.4); }

.sb-rank-box { display:flex; flex-direction:column; gap:4px; }
.sb-rank-row { display:flex; align-items:center; gap:4px; }
.sb-rank-name { width:60px; font-size:11px; }
.sb-rank-arrows { display:flex; gap:1px; font-size:10px; width:66px; }
.sb-arrow { color:#666; }
.sb-arrow--pos { color:#f44336; }
.sb-arrow--neg { color:#2196f3; }
.sb-rank-value { width:24px; text-align:right; font-size:11px; }
.sb-rank-btns { display:flex; flex-direction:column; }
.sb-rank-btn { font-size:8px; line-height:8px; padding:0 3px; border:1px solid #888; background:#444; color:#fff; cursor:pointer; }

.sb-placeholder { font-size:12px; color:#aaa; padding:12px; }
.sb-dmg-input { width:70px; font-size:11px; padding:2px 4px; }
.sb-execute-btn {
  align-self: flex-start;
  font-size:12px;
  padding:6px 14px;
  border:none;
  border-radius:4px;
  background:#4caf50;
  color:#fff;
  cursor:pointer;
}
.sb-room-status-list { display:flex; flex-wrap:wrap; gap:8px; margin-top:2px; }
</style>