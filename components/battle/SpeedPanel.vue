<!--
  스피드 비교: 상대 스피드 구간(무보정 / 성격 보정 / 각각 + 스카프)을 막대로, 내 스피드를 세로선으로.
  선후공을 관찰하면(행동 패널) 맞지 않는 부분이 지워지고, 남은 구간으로 "스카프 아님" 같은 결론을 낸다.
  계산: useBattleAnalysis speedBands (useBattle speedRangesOf, utils/speedInference.ts)
-->
<template>
  <section class="panel panel-pad speed">
    <h3 class="panel-title">
      {{ t('battle.speed') }}
      <span v-if="an.trickRoom.value" class="tr-tag">{{ t('room.trickroom') }}</span>
      <span class="spacer" />
      <span v-if="sb?.pending" class="pending">{{ t('battle.speedPending') }}</span>
    </h3>

    <template v-if="sb">
      <div v-if="verdicts.length" class="verdicts">
        <span v-for="v in verdicts" :key="v.key" class="verdict" :class="v.tone">{{ v.text }}</span>
      </div>

      <div class="chart">
        <!-- 내 스피드 라벨 (세로선 위) -->
        <div class="row axis">
          <span />
          <span class="track">
            <span class="mine-label num" :style="lineStyle">{{ mineLabel }}</span>
          </span>
          <span />
        </div>
        <div
          v-for="band in sb.bands"
          :key="band.key"
          class="row"
          :class="{ excluded: !band.possible, newly: band.newlyExcluded }"
        >
          <span class="label">{{ t('battle.band.' + labelKey(band.key)) }}</span>
          <span class="track">
            <span class="bar full" :style="barStyle(band.full)" />
            <span v-if="band.possible" class="bar possible" :style="barStyle(band.possible)" />
            <span class="mine-line" :style="lineStyle" />
          </span>
          <span class="value num">
            <template v-if="band.possible">
              {{ rangeText(band.possible) }}
              <small v-if="!sb.transformed && band.sp && (band.sp[0] > 0 || band.sp[1] < 32)"
                >S{{
                  band.sp[0] === band.sp[1] ? band.sp[0] : `${band.sp[0]}~${band.sp[1]}`
                }}</small
              >
            </template>
            <span v-else class="ex">{{ t('battle.bandExcluded') }}</span>
          </span>
        </div>
      </div>
      <p class="hint muted">
        {{ t(sb.observed || sb.pending ? 'battle.speedHintNarrowed' : 'battle.speedHint') }}
      </p>
    </template>
    <p v-else class="muted small">
      {{ t('battle.pickOpp') }}
    </p>
  </section>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import type { useBattleAnalysis } from '~/composables/useBattleAnalysis'
import type { SpeedBandKey } from '~/utils/speedInference'

const props = defineProps<{
  b: ReturnType<typeof useBattle>
  an: ReturnType<typeof useBattleAnalysis>
}>()
const { t } = useI18n()
const gd = useGameData()

const sb = computed(() => props.an.speedBands.value)

// 가로축: 모든 구간과 내 스피드가 들어가는 범위 (양쪽 여유 6%)
const axis = computed(() => {
  const v = sb.value
  if (!v) return { min: 0, max: 1 }
  const lo = Math.min(v.mySpeed, ...v.bands.map((x) => x.full[0]))
  const hi = Math.max(v.mySpeed, ...v.bands.map((x) => x.full[1]))
  const pad = Math.max(4, (hi - lo) * 0.06)
  return { min: lo - pad, max: hi + pad }
})
const x = (v: number) => ((v - axis.value.min) / (axis.value.max - axis.value.min)) * 100
const barStyle = (r: [number, number]) => ({
  left: `${x(r[0])}%`,
  width: `max(4px, ${x(r[1]) - x(r[0])}%)`,
})
const lineStyle = computed(() => ({ left: `${x(sb.value?.mySpeed ?? 0)}%` }))
const rangeText = (r: [number, number]) => (r[0] === r[1] ? `${r[0]}` : `${r[0]}~${r[1]}`)
const labelKey = (k: SpeedBandKey) =>
  sb.value?.transformed ? (k === 'neutral' ? 'copy' : 'copyScarf') : k

const mineLabel = computed(() => {
  const mi = props.an.activeIdx('mine')
  const name = mi == null ? '' : gd.name('pokemon', props.b.resolveAt('mine', mi)?.species.id)
  return t('battle.speedMine', { name }) + ` ${sb.value?.mySpeed ?? ''}`
})

// 결론: 스카프 / 성격 보정 확정 여부, 모든 구간 제외
const verdicts = computed(() => {
  const v = sb.value?.verdict
  if (!v) return []
  if (v.none) return [{ key: 'none', text: t('battle.verdict.none'), tone: 'bad' }]
  const out: { key: string; text: string; tone: string }[] = []
  if (v.scarf === true) out.push({ key: 'scarf', text: t('battle.verdict.scarf'), tone: 'warn' })
  if (v.scarf === false)
    out.push({ key: 'noScarf', text: t('battle.verdict.noScarf'), tone: 'good' })
  if (v.plus === true) out.push({ key: 'plus', text: t('battle.verdict.plus'), tone: 'warn' })
  if (v.plus === false)
    out.push({ key: 'neutral', text: t('battle.verdict.neutral'), tone: 'good' })
  return out
})
</script>

<style scoped>
.speed {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel-title {
  margin: 0;
}
.tr-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--well);
  color: var(--text-2);
}
.pending {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}
.verdicts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.verdict {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.verdict.good {
  color: var(--good);
}
.verdict.warn {
  color: var(--warn);
}
.verdict.bad {
  color: var(--bad);
}
/* 이름 | 막대 | 범위. 행 사이 간격을 0 으로 해서 내 스피드 세로선이 이어 보이게 */
.chart {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) 96px;
  row-gap: 0;
}
.row {
  display: contents;
}
.label,
.value {
  font-size: 12px;
  padding: 5px 0;
  white-space: nowrap;
}
.label {
  color: var(--text-2);
  font-weight: 600;
}
.value {
  text-align: right;
  font-weight: 700;
}
.value small {
  margin-left: 4px;
  font-size: 10px;
  color: var(--text-3);
}
.ex {
  font-size: 11px;
  color: var(--text-3);
}
.track {
  position: relative;
  min-height: 26px;
}
.bar {
  position: absolute;
  top: 8px;
  height: 10px;
  border-radius: 5px;
}
.bar.full {
  background: var(--well-strong);
}
.bar.possible {
  background: var(--opp);
}
.row.excluded .label,
.row.excluded .value {
  opacity: 0.5;
}
.row.newly .bar.full {
  outline: 1px dashed var(--opp);
}
.mine-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--mine);
}
.axis .track {
  min-height: 18px;
}
.mine-label {
  position: absolute;
  bottom: 2px;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  color: var(--mine);
  white-space: nowrap;
}
.hint {
  margin: 0;
  font-size: 11px;
}
</style>
