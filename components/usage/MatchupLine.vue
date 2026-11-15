<!--
  두 포켓몬의 대면 통계 한 덩어리: 맞대결 수 + 양쪽이 각각 물러난(쓰러짐 + 교체) 비율.
  통계 화면 대면 칸(A vs B)과 VS 화면에서 같이 쓴다. 데이터: utils/usageStats.ts matchupOf
-->
<template>
  <div class="mu">
    <p v-if="!ab && !ba" class="muted small">{{ t('matchup.noPair') }}</p>
    <template v-else>
      <p class="mu-n muted">
        {{ t('matchup.count', { n: n.toLocaleString() }) }}
        <template v-if="label"> · {{ label }}</template>
      </p>
      <div v-for="row in rows" :key="row.id" class="mu-row">
        <UiPokeSprite :id="row.id" :size="28" />
        <span class="mu-name">{{ gd.name('pokemon', row.id) }}</span>
        <template v-if="row.m">
          <span class="mu-bar"><span :style="{ width: pct(row.m.out) }" /></span>
          <span class="mu-out num">{{ t('matchup.out', { p: pct(row.m.out) }) }}</span>
          <span v-if="row.m.ko != null" class="mu-split muted num">
            {{ t('matchup.split', { ko: pct(row.m.ko), sw: pct(row.m.sw ?? 0) }) }}
          </span>
        </template>
        <span v-else class="muted small">—</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { matchupOf, type StatsVs } from '~/utils/usageStats'

const props = defineProps<{
  a: string
  b: string
  vs: StatsVs | null | undefined
  label?: string
}>()
const { t } = useI18n()
const gd = useGameData()

const ab = computed(() => matchupOf(props.vs, props.a, props.b))
const ba = computed(() => matchupOf(props.vs, props.b, props.a))
const n = computed(() => ab.value?.n ?? ba.value?.n ?? 0)
const rows = computed(() => [
  { id: props.a, m: ab.value },
  { id: props.b, m: ba.value },
])
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
</script>

<style scoped>
.mu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mu-n {
  margin: 0 0 2px;
  font-size: 12px;
}
.mu-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  flex-wrap: wrap;
}
.mu-name {
  min-width: 90px;
  font-weight: 700;
}
.mu-bar {
  width: 70px;
  height: 6px;
  border-radius: 3px;
  background: var(--well-strong);
  overflow: hidden;
}
.mu-bar span {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--bad);
}
.mu-out {
  font-weight: 700;
}
.mu-split {
  font-size: 11px;
}
.small {
  margin: 0;
  font-size: 12px;
}
</style>
