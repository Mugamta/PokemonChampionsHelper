<!-- 동시 등장 특성 발동 순서 (선두 / 쓰러진 뒤 교체 / 같은 턴 교체). 양쪽 다 등장 문구가 나오는 특성일 때만.
     스피드로 정해지면 안내, 사용자가 본 순서를 고르면 날씨·필드를 다시 발동하고 상대 스피드 구간을 좁힌다 -->
<template>
  <div v-if="pairs.length" class="entry-order">
    <span class="section-label" :title="t('battle.entryOrderHint')">{{
      t('battle.entryOrder')
    }}</span>
    <div v-for="p in pairs" :key="p.mi + ':' + p.oi" class="eo-row">
      <span v-if="pairs.length > 1" class="eo-who">
        {{ name('mine', p.mi) }} · {{ name('opp', p.oi) }}
      </span>
      <div class="chip-row">
        <button
          v-for="v in ['mine', 'opp'] as const"
          :key="v"
          type="button"
          class="chip"
          :class="{ active: (fixedOf(p) ?? b.entryObsOf(p.mi, p.oi)) === v }"
          :disabled="!!fixedOf(p)"
          @click="b.setEntryOrder(p.mi, p.oi, b.entryObsOf(p.mi, p.oi) === v ? 'unknown' : v)"
        >
          {{ t(v === 'mine' ? 'battle.entryMineFirst' : 'battle.entryOppFirst') }}
        </button>
      </div>
      <span class="eo-auto">{{ autoText(p) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import type { BattleSide, EntryPair } from '~/utils/battleState'

const props = defineProps<{ b: ReturnType<typeof useBattle> }>()
const { t } = useI18n()
const gd = useGameData()

const pairs = computed(() => props.b.entryPairsNow.value)
const name = (side: BattleSide, idx: number) =>
  gd.name('pokemon', props.b.resolveAt(side, idx)?.species.id)
// 스피드로 순서가 확정 (동속 가능성 없음) → 칩을 그쪽으로 고정 (특성 발동은 선제공격손톱·퀵드로와 무관)
const fixedOf = (p: EntryPair): BattleSide | null =>
  (p.auto === 'mine' || p.auto === 'opp') && !p.tiePossible ? p.auto : null
// 확정됐는데 예전에 고른 관찰이 남아 있으면 지운다 (스피드 구간을 잘못 좁히지 않게)
watch(
  pairs,
  (ps) => {
    for (const p of ps)
      if (fixedOf(p) && props.b.entryObsOf(p.mi, p.oi) !== 'unknown')
        props.b.setEntryOrder(p.mi, p.oi, 'unknown')
  },
  { immediate: true },
)
const autoText = (p: EntryPair) =>
  p.auto === 'mine' || p.auto === 'opp'
    ? t('battle.entryAuto', { name: name(p.auto, p.auto === 'mine' ? p.mi : p.oi) })
    : p.auto === 'tie'
      ? t('battle.entryTie')
      : t('battle.entryUnknown')
</script>

<style scoped>
.entry-order {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.eo-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}
.eo-who {
  font-size: 12px;
  font-weight: 700;
}
.eo-auto {
  color: var(--text-3);
  font-size: 12px;
}
</style>
