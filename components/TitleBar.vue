<!-- Title Bar -->
<template>
  <header
    style="
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 16px;
      background: #333;
      color: #fff;
      flex-wrap: wrap;
    "
  >
    <NuxtLink
      to="/"
      style="margin: 0; color: #fff; text-decoration: none;"
    >
      <h2 style="margin: 0;">
        포켓몬 챔피언스 헬퍼
      </h2>
    </NuxtLink>

    <div style="display:flex; align-items:center; gap:4px; flex-wrap: wrap;">
      <!-- 로딩 상태 -->
      <div
        v-if="isLoadingPokemon || isLoadingRegulations"
        style="display:flex; align-items:center; gap:4px; font-size:12px; color:#ffeb3b;"
      >
        <v-progress-circular
          indeterminate
          size="16"
          width="2"
          color="#ffeb3b"
        />
        <span>
          데이터 로딩 중
          <template v-if="isLoadingPokemon">({{ loadedCount }} / {{ totalCount }})</template>
        </span>
      </div>

      <button
        v-if="showPartyResetButton"
        :style="{
          fontSize: '12px',
          padding: '6px 12px',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          background: '#c0392b',
          color: '#fff',
          whiteSpace: 'nowrap'
        }"
        @click="onResetParty"
      >
        파티 초기화
      </button>


      <button
        v-if="showEntryButton"
        :disabled="!isPartyComplete"
        :style="{
          fontSize: '12px',
          padding: '6px 12px',
          border: 'none',
          borderRadius: '4px',
          cursor: isPartyComplete ? 'pointer' : 'not-allowed',
          background: isPartyComplete ? '#4caf50' : '#555',
          color: '#fff',
          whiteSpace: 'nowrap'
        }"
        @click="goToEntrySelect"
      >
        선출 화면으로
      </button>

      <button
        v-if="showPartyButton"
        :disabled="!isPartyComplete"
        :style="{
          fontSize: '12px',
          padding: '6px 12px',
          border: 'none',
          borderRadius: '4px',
          cursor: isPartyComplete ? 'pointer' : 'not-allowed',
          background: isPartyComplete ? '#4caf50' : '#555',
          color: '#fff',
          whiteSpace: 'nowrap'
        }"
        @click="goToPartySelect"
      >
        파티 선택 화면으로
      </button>

      <button
        v-if="showBattleButton"
        :disabled="!isEntryComplete"
        :style="{
          fontSize: '12px',
          padding: '6px 12px',
          border: 'none',
          borderRadius: '4px',
          cursor: isEntryComplete ? 'pointer' : 'not-allowed',
          background: isEntryComplete ? '#4caf50' : '#555',
          color: '#fff',
          whiteSpace: 'nowrap'
        }"
        @click="goToSingleBattle"
      >
        싱글 배틀 시작
      </button>

      <button
        v-if="showBattleButton"
        :disabled="!isEntryComplete"
        :style="{
          fontSize: '12px',
          padding: '6px 12px',
          border: 'none',
          borderRadius: '4px',
          cursor: isEntryComplete ? 'pointer' : 'not-allowed',
          background: isEntryComplete ? '#4caf50' : '#555',
          color: '#fff',
          whiteSpace: 'nowrap'
        }"
        @click="goToDoubleBattle"
      >
        더블 배틀 시작
      </button>

      <!-- 현재 시각 -->
      <span style="font-size:12px; color:#ccc; white-space:nowrap;">
        {{ formattedTime }}
      </span>

      <!-- 레귤레이션 선택 -->
      <select
        :value="selectValue"
        style="font-size:12px; padding:4px;"
        @change="onRegulationChange($event.target.value)"
      >
        <option value="auto">
          자동 (현재 시각 기준)
        </option>
        <option
          v-for="(reg, idx) in regulations"
          :key="reg.fileName"
          :value="idx"
        >
          {{ reg.rules }} ({{ reg.period }})
        </option>
      </select>

      <nav>
        <NuxtLink
          to="/"
          style="margin-left: 12px; color: #fff; text-decoration: none;"
        >
          홈
        </NuxtLink>
        <NuxtLink
          to="/about"
          style="margin-left: 12px; color: #fff; text-decoration: none;"
        >
          소개
        </NuxtLink>
        <NuxtLink
          to="/contact"
          style="margin-left: 12px; color: #fff; text-decoration: none;"
        >
          문의
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'

const { isLoadingPokemon, isLoadingRegulations, loadedCount, totalCount, loadPokemonList, loadRegulations, currentTime } = useEligiblePokemon()
const { regulations, selectedRegulationIndex, selectRegulation, useAutoRegulation, startClock, allowedDexIds } = useRegulations()
const router = useRouter()
const route = useRoute()

const { isPartyComplete, resetParty } = useParty()
const onResetParty = () => {
  if (window.confirm('파티를 초기화할까요? 저장된 선택 내용이 모두 사라집니다.')) {
    resetParty()
  }
}

// 선출 화면(entrySelect.vue)에서 쓰는 전역 상태를 그대로 참조해서
// 배틀 시작 가능 여부(상대 6마리 전부 선택 + 내 선출 3마리 확정)를 판단
const { selectedMineIndices } = useMineOrderSelection()
const { selectedPokemon: oppSelectedPokemonForCheck } = useOpponentParty()

const isOppPartyComplete = computed(() =>
  oppSelectedPokemonForCheck.value.every((name) => !!name)
)
const isMineEntrySelected = computed(() => selectedMineIndices.value.length === 3)
const isEntryComplete = computed(() => isOppPartyComplete.value && isMineEntrySelected.value)

const pad = (n) => String(n).padStart(2, '0')

const formattedTime = computed(() => {
  const t = currentTime.value
  return `${t.getFullYear()}/${pad(t.getMonth() + 1)}/${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`
})

const selectValue = computed(() =>
  selectedRegulationIndex.value === null ? 'auto' : String(selectedRegulationIndex.value)
)

const onRegulationChange = (value) => {
  if (value === 'auto') {
    useAutoRegulation()
  } else {
    selectRegulation(Number(value))
  }
}

// 파티 화면은 메인, 선출 화면에서 가능
const showPartyButton = computed(() => route.path === '/' || route.path === '/entrySelect')
const showPartyResetButton = computed(() => route.path === '/partySelect')
// 선출 화면은 파티, 배틀 화면에서 가능
const showEntryButton = computed(() => route.path === '/partySelect' || route.path === '/singleBattle' || route.path === '/doubleBattle')
// 배틀 화면은 선출 화면에서만 가능
const showBattleButton = computed(() => route.path === '/entrySelect')

const goToPartySelect = () => {
  if (!isPartyComplete.value) return
  router.push('/partySelect')
}

const goToEntrySelect = () => {
  if (!isPartyComplete.value) return
  router.push('/entrySelect')
}

const goToSingleBattle = () => {
  if (!isEntryComplete.value) return
  router.push('/singleBattle')
}

const goToDoubleBattle = () => {
  if (!isEntryComplete.value) return
  router.push('/doubleBattle')
}

onMounted(async () => {
  startClock()
  await loadRegulations()
  const ids = Array.from(allowedDexIds.value)
  await loadPokemonList(ids)
})
</script>