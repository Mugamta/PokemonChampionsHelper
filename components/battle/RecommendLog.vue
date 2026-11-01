<!--
  추천 기록: 추천 플레이를 연 턴마다 추천 1위와 실제로 고른 행동 (배틀 상태 log, 턴을 적용할 때 남김)
  추천과 다르게 고른 턴을 강조하고, 고른 행동의 점수가 추천보다 얼마나 낮았는지 표시
-->
<template>
  <div v-if="rows.length" class="rec-log">
    <div class="head">
      <span class="section-label">{{ t('battle.rec.log.title') }}</span>
      <span class="muted small">
        {{ t('battle.rec.log.summary', { n: rows.length, k: differ }) }}
      </span>
    </div>
    <ol class="list">
      <li v-for="r in rows" :key="r.key" class="row" :class="{ differ: r.differ }">
        <span class="turn num">{{ t('battle.turn', { n: r.turn }) }}</span>
        <span v-if="r.who" class="who">{{ r.who }}</span>
        <span>
          {{ t('battle.rec.log.best', { plan: r.best, score: r.bestScore }) }}
        </span>
        <span v-if="r.differ" class="chosen">
          {{ t('battle.rec.log.chosen', { plan: r.chosen, score: r.chosenScore }) }}
        </span>
        <span v-else class="muted">{{ t('battle.rec.log.same') }}</span>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import { useRecLabels } from '~/composables/useRecLabels'
import type { LoggedAction, RecSlotNote } from '~/utils/battleState'

const props = defineProps<{ b: ReturnType<typeof useBattle> }>()
const { t } = useI18n()
const L = useRecLabels(props.b)

// 행동 입력 → 추천 선택지 (같은 기술·교체 대상·교체기 대상·메가진화, 더블은 대상 칸도)
const matches = (o: RecSlotNote['options'][number], a: LoggedAction) => {
  const p = o.pick
  return p.kind === 'switch'
    ? a.kind === 'switch' && a.switchTo === p.to
    : a.kind === 'move' &&
        a.move === p.move &&
        (p.pivotTo == null || a.selfSwitch === p.pivotTo) &&
        p.mega === a.mega &&
        (o.target == null || a.target == null || o.target === a.target)
}
const chosenOf = (rec: RecSlotNote, a: LoggedAction | undefined) =>
  a ? rec.options.findIndex((o) => matches(o, a)) : -1

const rows = computed(() => {
  const double = props.b.N > 1
  return (props.b.state.value?.log ?? []).flatMap((x) =>
    (x.rec?.slots ?? [])
      .filter((sl) => sl.best >= 0)
      .map((sl) => {
        const a = x.mine[sl.slot]
        const k = chosenOf(sl, a)
        const best = sl.options[sl.best]!
        const chosen = k >= 0 ? sl.options[k]! : null
        const who = double && a?.idx != null ? L.mineName(a.idx) : ''
        const plan = (o: RecSlotNote['options'][number]) =>
          o.target != null && double
            ? `${L.planLabel(o.pick)} ${t('battle.rec.target', { name: targetName(x.turn, o.target) })}`
            : L.planLabel(o.pick)
        return {
          key: `${x.turn}-${sl.slot}`,
          turn: x.turn,
          who,
          best: plan(best),
          bestScore: L.signed(best.expected),
          differ: k !== sl.best,
          chosen: chosen
            ? plan(chosen)
            : a?.kind === 'cant'
              ? t('battle.rec.log.cant')
              : t('battle.rec.log.other'),
          chosenScore: chosen ? L.signed(chosen.expected) : '?',
        }
      }),
  )
})
// 그 턴 상대 필드 칸의 포켓몬 (기록에 남은 상대 행동으로)
const targetName = (turn: number, slot: number) => {
  const x = props.b.state.value?.log?.find((l) => l.turn === turn)
  const idx = x?.opp[slot]?.idx
  return idx != null ? L.oppName(idx) : '?'
}
const differ = computed(() => rows.value.filter((r) => r.differ).length)
</script>

<style scoped>
.rec-log {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}
.small {
  font-size: 12px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--text-2);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.row.differ {
  background: var(--well);
}
.turn {
  font-weight: 800;
  color: var(--text-3);
  min-width: 42px;
}
.who {
  font-weight: 700;
  color: var(--text);
}
.chosen {
  color: var(--accent-2);
  font-weight: 700;
}
</style>
