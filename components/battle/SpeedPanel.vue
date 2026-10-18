<!-- 스피드 비교: 내 실제 스피드 vs 상대 배분 시나리오. 관찰 결과와 모순되는 시나리오는 취소선 -->
<template>
  <section class="panel panel-pad">
    <h3 class="panel-title">
      {{ t('battle.speed') }}
      <span
        v-if="an.trickRoom.value"
        class="tr-tag"
      >{{ t('room.trickroom') }}</span>
    </h3>
    <p
      v-if="an.inferredOppSpeed.value"
      class="inferred"
    >
      {{ t('battle.speedInferred', { kind: t(an.inferredOppSpeed.value.type === 'min' ? 'battle.min' : 'battle.max'), value: an.inferredOppSpeed.value.value }) }}
    </p>
    <div
      v-if="rows.length"
      class="rows"
    >
      <div
        v-for="row in rows"
        :key="row.key"
        class="row"
        :class="{ mine: row.mine, excluded: row.excluded }"
      >
        <span class="label">{{ row.label }}<span
          v-if="row.excluded"
          class="ex"
        > · {{ t('battle.speedExcluded') }}</span></span>
        <span class="bar-wrap"><span
          class="bar"
          :style="{ width: (row.value / maxValue) * 100 + '%' }"
        /></span>
        <span class="val num">{{ row.value }}</span>
      </div>
    </div>
    <p
      v-else
      class="muted small"
    >
      {{ t('battle.pickOpp') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import type { useBattleAnalysis } from '~/composables/useBattleAnalysis'

const props = defineProps<{ b: ReturnType<typeof useBattle>; an: ReturnType<typeof useBattleAnalysis> }>()
const { t } = useI18n()
const gd = useGameData()

const rows = computed(() => {
  const mi = props.an.activeIdx('mine')
  if (mi == null || !props.an.oppSpeedRows.value.length) return []
  const mineName = gd.name('pokemon', props.b.resolveAt('mine', mi)?.species.id)
  const out = [{ key: 'mine', label: t('battle.speedMine', { name: mineName }), value: props.an.speedOf('mine', mi), mine: true, excluded: false }]
  for (const r of props.an.oppSpeedRows.value) {
    out.push({ key: r.key, label: t('battle.speedOpp', { label: t('battle.' + r.key) }), value: r.value, mine: false, excluded: props.an.speedExcluded(r.raw) })
  }
  return out.sort((a, b) => b.value - a.value)
})
const maxValue = computed(() => Math.max(1, ...rows.value.map((r) => r.value)))
</script>

<style scoped>
.panel-title { margin-bottom: 8px; }
.tr-tag { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: #c85cff; color: #fff; }
.inferred { margin: 0 0 8px; font-size: 12px; color: var(--accent-2); font-weight: 700; }
.rows { display: flex; flex-direction: column; gap: 4px; }
.row { display: grid; grid-template-columns: minmax(0, 1.4fr) 1fr 44px; align-items: center; gap: 8px; font-size: 13px; }
.label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-2); }
.bar-wrap { height: 6px; background: rgba(0, 0, 0, 0.35); border-radius: 4px; overflow: hidden; }
.bar { display: block; height: 100%; background: var(--opp); border-radius: 4px; }
.val { text-align: right; font-weight: 800; }
.row.mine .label { color: var(--mine); font-weight: 800; }
.row.mine .bar { background: var(--mine); }
.row.excluded { opacity: 0.4; }
.row.excluded .label { text-decoration: line-through; }
.ex { font-size: 10px; }
.small { font-size: 12px; margin: 0; }
</style>
