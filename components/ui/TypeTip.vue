<!--
  타입 상성 툴팁 내용 (타입 상성표만, 특성 무시)
  defense: 이 타입(복합이면 합친) 포켓몬이 받을 때 — 약점 ×4 / ×2, 반감 ×½ / ×¼, 무효
  attack: 이 타입 기술로 공격할 때 — 효과 굉장 / 별로 / 없음
-->
<template>
  <div class="tt">
    <div class="tt-head">
      <span class="tt-types">
        <template v-for="(ty, i) in types" :key="ty">
          <span v-if="i" class="tt-plus">+</span>
          <UiTypeBadge :type="ty" small />
        </template>
      </span>
      <span class="tt-title">{{
        t(mode === 'attack' ? 'typeTip.attack' : 'typeTip.defense')
      }}</span>
    </div>
    <p v-if="note" class="tt-note">{{ note }}</p>
    <div v-for="row in rows" :key="row.key" class="tt-row">
      <span class="tt-label" :class="row.tone">{{ t('typeTip.' + row.key) }}</span>
      <span class="tt-badges">
        <UiTypeBadge v-for="ty in row.types" :key="ty" :type="ty" small />
      </span>
    </div>
    <p v-if="hint" class="tt-hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { attackProfile, defenseProfile } from '~/utils/typeCheck'
import type { TypeId } from '~/utils/types'

const props = defineProps<{
  mode: 'attack' | 'defense'
  types: TypeId[]
  note?: string // 예: 스킨 특성으로 타입이 바뀐 경우
  hint?: string
}>()
const { t } = useI18n()
const gd = useGameData()

const rows = computed(() => {
  const chart = gd.data.value?.types.chart
  if (!chart || !props.types.length) return []
  if (props.mode === 'attack') {
    const p = attackProfile(props.types[0]!, chart)
    return [
      { key: 'super', types: p.x2, tone: 'good' },
      { key: 'notVery', types: p.x05, tone: 'dim' },
      { key: 'noEffect', types: p.x0, tone: 'dim' },
    ].filter((r) => r.types.length)
  }
  const p = defenseProfile(props.types, chart)
  return [
    { key: 'weak4', types: p.x4, tone: 'bad' },
    { key: 'weak2', types: p.x2, tone: 'bad' },
    { key: 'resist2', types: p.x05, tone: 'good' },
    { key: 'resist4', types: p.x025, tone: 'good' },
    { key: 'immune', types: p.x0, tone: 'good' },
  ].filter((r) => r.types.length)
})
</script>

<style scoped>
.tt {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-width: 320px;
}
.tt-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--line);
}
.tt-types {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.tt-plus {
  font-size: 10px;
  color: var(--text-3);
}
.tt-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
}
.tt-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 6px;
  align-items: start;
}
.tt-label {
  font-size: 11px;
  font-weight: 700;
  padding-top: 1px;
}
.tt-label.bad {
  color: var(--bad);
}
.tt-label.good {
  color: var(--good);
}
.tt-label.dim {
  color: var(--text-3);
}
.tt-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.tt-note,
.tt-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-3);
}
</style>
