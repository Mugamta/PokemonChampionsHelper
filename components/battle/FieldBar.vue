<!-- 데미지 계산 조건: 날씨 / 필드 / 급소 (선출 화면) -->
<template>
  <div class="field-bar">
    <div class="grp">
      <span class="section-label">{{ t('weather.label') }}</span>
      <div class="chip-row">
        <button
          v-for="w in WEATHERS"
          :key="w"
          type="button"
          class="chip"
          :class="{ active: weather === w }"
          @click="weather = weather === w ? '' : w"
        >
          {{ t('weather.' + w) }}
        </button>
      </div>
    </div>
    <div class="grp">
      <span class="section-label">{{ t('terrain.label') }}</span>
      <div class="chip-row">
        <button
          v-for="tr in TERRAINS"
          :key="tr"
          type="button"
          class="chip"
          :class="{ active: terrain === tr }"
          @click="terrain = terrain === tr ? '' : tr"
        >
          {{ t('terrain.' + tr) }}
        </button>
      </div>
    </div>
    <label class="crit">
      <input v-model="crit" type="checkbox" />
      <span>{{ t('common.crit') }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import type { Terrain, Weather } from '~/utils/types'

const weather = defineModel<Weather>('weather', { default: '' })
const terrain = defineModel<Terrain>('terrain', { default: '' })
const crit = defineModel<boolean>('crit', { default: false })
const { t } = useI18n()
const WEATHERS: Weather[] = ['sun', 'rain', 'sand', 'snow', 'harshsun', 'heavyrain', 'strongwinds']
const TERRAINS: Terrain[] = ['electric', 'grassy', 'misty', 'psychic']
</script>

<style scoped>
.field-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 18px;
}
.grp {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.crit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  margin-left: auto;
}
.crit input {
  accent-color: var(--bad);
}
</style>
