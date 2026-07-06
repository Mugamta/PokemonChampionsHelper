<template>
  <header
    style="
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      background: #333;
      color: #fff;
      margin-bottom: 10px;
      flex-wrap: wrap;
      gap: 8px;
    "
  >
    <NuxtLink to="/" style="margin: 0; color: #fff; text-decoration: none;">
      <h2 style="margin: 0;">포켓몬 챔피언스 헬퍼</h2>
    </NuxtLink>

    <div style="display:flex; align-items:center; gap:20px; flex-wrap: wrap;">
      <!-- 로딩 상태 -->
      <div
        v-if="isLoadingPokemon || isLoadingRegulations"
        style="display:flex; align-items:center; gap:6px; font-size:12px; color:#ffeb3b;"
      >
        <v-progress-circular indeterminate size="16" width="2" color="#ffeb3b" />
        <span>
          데이터 로딩 중
          <template v-if="isLoadingPokemon">({{ loadedCount }} / {{ totalCount }})</template>
        </span>
      </div>

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
        <option value="auto">자동 (현재 시각 기준)</option>
        <option v-for="(reg, idx) in regulations" :key="reg.fileName" :value="idx">
          {{ reg.rules }} ({{ reg.period }})
        </option>
      </select>

      <nav>
        <NuxtLink to="/" style="margin-left: 12px; color: #fff; text-decoration: none;">홈</NuxtLink>
        <NuxtLink to="/about" style="margin-left: 12px; color: #fff; text-decoration: none;">소개</NuxtLink>
        <NuxtLink to="/contact" style="margin-left: 12px; color: #fff; text-decoration: none;">문의</NuxtLink>
      </nav>
    </div>
  </header>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'

const {
  isLoadingPokemon,
  isLoadingRegulations,
  loadedCount,
  totalCount,
  loadPokemonList,
  loadRegulations,
  currentTime,
} = useEligiblePokemon()

const { regulations, selectedRegulationIndex, selectRegulation, useAutoRegulation, startClock } =
  useRegulations()

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

onMounted(() => {
  startClock()
  loadRegulations()
  loadPokemonList()
})
</script>