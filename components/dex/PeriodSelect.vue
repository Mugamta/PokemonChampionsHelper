<!--
  도감 사용률 통계 기간 고르기 — 레귤레이션 칩(M-A · M-B · M-C) + 그 레귤레이션의 시즌 전체 / 월 칩.
  useDexPeriod 공유 상태 (포켓몬·기술·도구 탭이 같은 기간)
-->
<template>
  <span
    v-if="p.seasons.value.length"
    class="period"
    role="group"
    :aria-label="t('usageStats.period')"
  >
    <span class="grp">
      <button
        v-for="s in p.seasons.value"
        :key="s.reg"
        type="button"
        class="chip"
        :class="{ active: cur?.reg === s.reg }"
        :aria-pressed="cur?.reg === s.reg"
        :title="p.monthsText(s)"
        @click="p.selectReg(s.reg)"
      >
        {{ s.reg }}
      </button>
    </span>
    <span v-if="cur" class="grp sub">
      <button
        type="button"
        class="chip"
        :class="{ active: cur.period === 'season' }"
        :aria-pressed="cur.period === 'season'"
        :title="p.periodLabel(seasonOf(cur.reg) ?? cur)"
        @click="p.selectReg(cur.reg)"
      >
        {{ t('dex.period.season') }}
      </button>
      <button
        v-for="m in p.monthsOf(cur.reg)"
        :key="m.period"
        type="button"
        class="chip"
        :class="{ active: cur.period === m.period }"
        :aria-pressed="cur.period === m.period"
        :title="p.periodLabel(m)"
        @click="p.select(m)"
      >
        {{ p.monthShort(m.period) }}
      </button>
    </span>
  </span>
</template>

<script setup lang="ts">
import { useDexPeriod } from '~/composables/useDexPeriod'

const { t } = useI18n()
const p = useDexPeriod()
const cur = computed(() => p.current.value)
const seasonOf = (reg: string) => p.seasons.value.find((s) => s.reg === reg)
</script>

<style scoped>
.period {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}
.grp {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.grp.sub {
  padding-left: 10px;
  border-left: 1px solid var(--line);
}
</style>
