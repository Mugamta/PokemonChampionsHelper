<!--
  공격자 1마리 → 방어자 여러 마리 데미지 표.
  행 = 공격자의 기술 (더블에서 광역기는 '광역 0.75배' / '단일 1배' 두 줄), 열 = 방어자.
-->
<template>
  <div class="matrix">
    <div class="m-head">
      <UiPokeSprite :id="attacker?.species.id || null" :size="36" />
      <span class="m-title">{{ title }}</span>
    </div>
    <div class="m-scroll">
      <table>
        <thead>
          <tr>
            <th class="mv-col" />
            <th v-for="(d, j) in defenders" :key="j">
              <div class="def-head">
                <UiPokeSprite :id="d?.species.id || null" :size="34" />
                <span class="def-name">{{ d ? gd.name('pokemon', d.species.id) : '—' }}</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i">
            <td class="mv-col">
              <span class="dot" :style="{ background: `var(--t-${row.type})` }" />
              <span class="mv-name">{{ row.label }}</span>
            </td>
            <td v-for="(d, j) in defenders" :key="j">
              <UiDamageCell
                :cell="
                  attacker && d
                    ? calc.cell(row.move, attackerC!, defC(d), field, { crit, spread: row.spread })
                    : null
                "
                show-eff
              />
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="defenders.length + 1" class="muted empty-row">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTeamCalc, type ResolvedSlot } from '~/composables/useTeamCalc'
import { effectiveMoveType, type FieldState } from '~/utils/damage'
import type { Move } from '~/utils/types'

const props = defineProps<{
  attacker: ResolvedSlot | null
  defenders: (ResolvedSlot | null)[]
  title: string
  field: FieldState
  crit?: boolean
  doubles?: boolean
}>()
const { t } = useI18n()
const gd = useGameData()
const calc = useTeamCalc()

const attackerC = computed(() =>
  props.attacker ? calc.combatant(calc.attackForm(props.attacker)) : null,
)
const defC = (d: ResolvedSlot) => calc.combatant(d)

// 스킨류 특성(메가 포함)으로 바뀐 기술 타입
const typeOf = (mv: Move) =>
  props.attacker
    ? effectiveMoveType(mv, props.attacker.ability, props.field, props.attacker.species)
    : mv.type
const rows = computed(() => {
  const out: { move: string; label: string; type: string; spread: boolean }[] = []
  for (const m of props.attacker?.slot.moves || []) {
    const mv = gd.move(m)
    if (!mv || mv.category === 'status') continue
    const name = gd.name('moves', m)
    if (props.doubles && isSpreadMove(mv)) {
      out.push({
        move: m,
        label: t('entry.spreadRow', { move: name }),
        type: typeOf(mv),
        spread: true,
      })
      out.push({
        move: m,
        label: t('entry.singleRow', { move: name }),
        type: typeOf(mv),
        spread: false,
      })
    } else {
      out.push({ move: m, label: name, type: typeOf(mv), spread: false })
    }
  }
  return out
})
</script>

<style scoped>
.matrix {
  flex-shrink: 0;
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.m-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--faint);
  border-bottom: 1px solid var(--line);
}
.m-title {
  font-weight: 800;
  font-size: 14px;
}
.m-scroll {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}
th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: top;
  text-align: left;
}
th {
  font-weight: 600;
  color: var(--text-2);
}
.def-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 92px;
}
.def-name {
  font-size: 11px;
  white-space: nowrap;
}
.mv-col {
  min-width: 132px;
  white-space: nowrap;
  position: sticky;
  left: 0;
  background: var(--panel-solid);
  z-index: 1;
}
td.mv-col {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.mv-name {
  font-weight: 700;
}
.empty-row {
  text-align: center;
}
tr:hover td {
  background: var(--faint);
}
</style>
