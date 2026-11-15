<!-- 도감 사용률 통계 기간 고르기 (시즌 / 월) — useDexPeriod 공유 상태 -->
<template>
  <select
    v-if="p.list.value.length"
    v-model="p.periodKey.value"
    class="field-input period"
    :aria-label="t('usageStats.period')"
  >
    <optgroup :label="t('usageStats.mode.season')">
      <option v-for="s in p.seasons.value" :key="statsKey(s)" :value="statsKey(s)">
        {{ p.periodLabel(s) }}
      </option>
    </optgroup>
    <optgroup :label="t('usageStats.mode.month')">
      <option v-for="m in p.months.value" :key="statsKey(m)" :value="statsKey(m)">
        {{ p.periodLabel(m) }}
      </option>
    </optgroup>
  </select>
</template>

<script setup lang="ts">
import { useDexPeriod } from '~/composables/useDexPeriod'
import { statsKey } from '~/utils/usageStats'

const { t } = useI18n()
const p = useDexPeriod()
</script>

<style scoped>
.period {
  width: auto;
  font-size: 12px;
  padding-top: 4px;
  padding-bottom: 4px;
}
</style>
