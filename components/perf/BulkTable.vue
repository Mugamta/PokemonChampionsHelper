<!--
  성능표 · 내구: H32 실능치, B32 / D32 실능치, 내구 지수 (H×B, H×D). 성격 보정(방어·특방 +10%)은 선택.
  계산: utils/perfTable.ts bulkRow
-->
<template>
  <section class="panel panel-pad perf-panel">
    <div class="opts">
      <div class="chip-row">
        <label class="check">
          <input v-model="plus" type="checkbox" />
          {{ t('perf.bulk.plus') }}
        </label>
        <span class="spacer" />
        <span class="muted small">{{ t('perf.count', { n: rows.length }) }}</span>
      </div>
    </div>

    <div class="perf-scroll">
      <table class="perf-table">
        <thead>
          <tr>
            <th class="rk">#</th>
            <th>{{ t('perf.col.mon') }}</th>
            <th v-for="c in COLS" :key="c" class="num-col">
              <button
                type="button"
                class="sort"
                :class="{ active: sortKey === c }"
                @click="sortKey = c"
              >
                {{ t('perf.bulk.' + c) }}<span class="arrow">▼</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in visible" :key="row.mon.id">
            <td class="rk num">{{ i + 1 }}</td>
            <td><PerfMonCell :mon="row.mon" /></td>
            <td
              v-for="c in COLS"
              :key="c"
              class="num"
              :class="{ active: sortKey === c, big: c === 'phys' || c === 'spec' }"
            >
              {{ row.r[c].toLocaleString() }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="muted empty">{{ t('perf.empty') }}</p>
      <div ref="sentinel" />
    </div>
    <p class="note muted">{{ t('perf.bulk.note') }}</p>
  </section>
</template>

<script setup lang="ts">
import type { PerfMon } from '~/composables/usePerfList'
import { useIncremental } from '~/composables/useIncremental'
import { bulkRow, type BulkRow } from '~/utils/perfTable'

const props = defineProps<{ mons: PerfMon[]; match: ((id: string) => boolean) | null }>()
const { t } = useI18n()

const COLS = ['hp', 'def', 'spd', 'phys', 'spec'] as const
const plus = ref(false)
const sortKey = ref<keyof BulkRow>('phys')

const rows = computed(() =>
  props.mons
    .filter((m) => !props.match || props.match(m.id))
    .map((m) => ({ mon: m, r: bulkRow(m.form, plus.value) }))
    .sort((a, b) => b.r[sortKey.value] - a.r[sortKey.value]),
)
const { visible, sentinel } = useIncremental(rows)
</script>

<style scoped>
td.big {
  font-weight: 800;
}
</style>
