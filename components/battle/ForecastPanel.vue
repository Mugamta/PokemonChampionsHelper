<!-- ① 이번 턴 예상 흐름 / ② 실전 배분 시나리오 흐름 (참고용이라 기본으로 접어 둠) -->
<template>
  <section
    v-if="
      an.forecast.value.length ||
      an.scenarioFlows.value.length ||
      an.chanceLines.value.length ||
      an.pendingLines.value.length
    "
    class="panel panel-pad fc"
  >
    <div v-if="an.forecast.value.length" class="block">
      <h4 class="fc-title">
        {{ t('battle.forecastTitle') }}
      </h4>
      <p v-for="(l, i) in an.forecast.value" :key="i" class="fc-line">
        {{ line(l) }}
      </p>
    </div>
    <!-- 턴 끝 예정 (하품 등) -->
    <div v-if="an.pendingLines.value.length" class="block">
      <h4 class="fc-title">
        {{ t('battle.pending.title') }}
      </h4>
      <p v-for="(l, i) in an.pendingLines.value" :key="i" class="fc-line">
        {{ line(l) }}
      </p>
    </div>
    <!-- 이번 턴 확률 효과 (부가효과·변덕레이저·변덕쟁이) -->
    <div v-if="an.chanceLines.value.length" class="block">
      <h4 class="fc-title">
        {{ t('battle.chance.title') }}
      </h4>
      <p v-for="(l, i) in an.chanceLines.value" :key="i" class="fc-line">
        {{ line(l) }}
      </p>
    </div>
    <details v-if="an.scenarioFlows.value.length" class="block ref">
      <summary class="fc-title">
        {{ t('battle.scenarioTitle') }}
        <span class="count num">{{ an.scenarioFlows.value.length }}</span>
      </summary>
      <div v-for="f in an.scenarioFlows.value" :key="f.title" class="flow">
        <span class="flow-title">{{ t(f.title) }}</span>
        <p v-for="(l, i) in f.lines" :key="i" class="fc-line">
          {{ line(l) }}
        </p>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import type { useBattleAnalysis } from '~/composables/useBattleAnalysis'

defineProps<{ an: ReturnType<typeof useBattleAnalysis> }>()
const { t } = useI18n()
const line = useLine()
</script>

<style scoped>
.fc {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.fc-title {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text);
}
.ref .fc-title {
  color: var(--text-2);
}
.ref summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.ref summary::-webkit-details-marker {
  display: none;
}
.ref summary::before {
  content: '▸';
  color: var(--text-3);
}
.ref[open] summary {
  margin-bottom: 6px;
}
.ref[open] summary::before {
  content: '▾';
}
.count {
  font-size: 11px;
  color: var(--text-3);
}
.fc-line {
  margin: 0 0 3px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}
.flow {
  padding: 6px 0;
  border-top: 1px dashed var(--line);
}
.flow-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text);
}
</style>
