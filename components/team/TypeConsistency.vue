<!--
  파티 일관성 한 줄: 어떤 타입의 공격이 내 파티 "전원"에게 1배 이상 들어가는지.
  "모든 포켓몬이 [땅] 타입 공격에 4배 이상, [불꽃][물] 타입 공격에 2배 이상, ... 의 피해를 입습니다"
  메가 미리보기 상태의 타입·특성, 부유·풍선·흡수/반감 특성 반영 (utils/typeCheck.ts)
-->
<template>
  <p v-if="members.length" class="consistency">
    <template v-if="groups.length">
      <span>{{ t('party.consistency.lead') }}</span>
      <template v-for="(g, i) in groups" :key="g.n">
        <span v-if="i">{{ t('party.consistency.sep') }}</span>
        <i18n-t keypath="party.consistency.group" tag="span" scope="global">
          <template #types>
            <span class="types">
              <UiTypeBadge v-for="ty in g.types" :key="ty" :type="ty" small :title="detail(ty)" />
            </span>
          </template>
          <template #n>
            <b class="num" :class="{ bad: g.n >= 2 }">{{ g.n }}</b>
          </template>
        </i18n-t>
      </template>
      <span>{{ t('party.consistency.tail') }}</span>
      <span v-if="members.length < 6" class="muted">
        {{ t('party.consistency.basis', { n: members.length }) }}</span
      >
    </template>
    <span v-else class="muted">{{ t('party.consistency.none') }}</span>
  </p>
</template>

<script setup lang="ts">
import { useTeamCalc } from '~/composables/useTeamCalc'
import { consistentTypes, multLabel, teamTypeCheck } from '~/utils/typeCheck'
import type { TeamSlot, TypeId } from '~/utils/types'

const props = defineProps<{ slots: TeamSlot[]; megaOn: boolean[] }>()
const { t } = useI18n()
const gd = useGameData()
const calc = useTeamCalc()

// 파티에 들어 있는 포켓몬 (메가 미리보기 상태 반영)
const members = computed(() =>
  props.slots
    .map((s, i) => calc.resolve(s, props.megaOn[i] ?? true))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => calc.combatant(r)),
)
const rows = computed(() =>
  gd.data.value ? teamTypeCheck(members.value, gd.data.value.types.chart) : [],
)
const groups = computed(() => {
  const c = consistentTypes(rows.value)
  return [
    { n: 4, types: c.x4 },
    { n: 2, types: c.x2 },
    { n: 1, types: c.x1 },
  ].filter((g) => g.types.length)
})

// 배지에 마우스를 올리면 포켓몬별 배율
const detail = (type: TypeId) => {
  const row = rows.value.find((r) => r.type === type)
  if (!row) return ''
  return members.value
    .map((m, i) => `${gd.name('pokemon', m.species.id)} ×${multLabel(row.cells[i]!.mult) || '1'}`)
    .join(' · ')
}
</script>

<style scoped>
/* 문장으로 흐르게 (띄어쓰기는 문구에 포함) */
.consistency {
  margin: 0;
  font-size: 13px;
  line-height: 1.9;
  color: var(--text-2);
}
.types {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  vertical-align: middle;
  margin-right: 2px;
}
.types :deep(.type-badge) {
  cursor: help;
}
b {
  color: var(--text);
}
b.bad {
  color: var(--bad);
}
</style>
