<!-- 도감 사용률 통계 기간 한 줄: "M-C 시즌 2026-09 ~ 2026-10 · 157,310배틀" (+ 슬롯) — useDexPeriod -->
<template>
  <p v-if="cur" class="period-line muted">
    <b>{{ p.periodLabel(cur) }}</b>
    <span class="num">{{ p.monthsText(cur) }}</span>
    · {{ t('usageStats.battles', { n: cur.battles.toLocaleString() }) }}
    <slot />
  </p>
</template>

<script setup lang="ts">
import { useDexPeriod } from '~/composables/useDexPeriod'

const { t } = useI18n()
const p = useDexPeriod()
const cur = computed(() => p.current.value)
</script>

<style scoped>
.period-line {
  margin: 0 0 8px;
  font-size: 12px;
}
.period-line b {
  color: var(--text);
  margin-right: 6px;
}
</style>
