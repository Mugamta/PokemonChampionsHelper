<!--
  성능표 · 내구: 포켓몬마다 물리/특수 내구 지수 (H × B(D) / 0.411, 파티 화면과 같은 식)를
  무투자 / H32 / H32+B(D)32 / H32+B(D)32 성격 보정 네 가지로. 방어·특방 랭크 선택. 계산: utils/perfTable.ts bulkRow
-->
<template>
  <section class="panel panel-pad perf-panel">
    <div class="opts">
      <div class="chip-row">
        <PerfRankStep v-model="rank" :label="t('perf.bulk.rank')" />
        <span class="spacer" />
        <span class="muted small">{{ t('perf.count', { n: rows.length }) }}</span>
      </div>
    </div>

    <div class="perf-scroll">
      <table class="perf-table">
        <thead>
          <tr>
            <th class="rk" rowspan="2">#</th>
            <th rowspan="2">{{ t('perf.col.mon') }}</th>
            <th v-for="side in SIDES" :key="side" colspan="4" class="group" :class="side">
              {{ t('perf.bulk.' + side) }}
            </th>
          </tr>
          <tr>
            <template v-for="side in SIDES" :key="side">
              <th v-for="(c, k) in BULK_CFGS" :key="c" class="num-col" :class="{ first: k === 0 }">
                <button
                  type="button"
                  class="sort"
                  :class="{ active: sort.side === side && sort.k === k }"
                  @click="sort = { side, k }"
                >
                  {{ t('perf.bulk.cfg.' + side + '.' + c) }}<span class="arrow">▼</span>
                </button>
              </th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in visible" :key="row.mon.id">
            <td class="rk num">{{ i + 1 }}</td>
            <td><PerfMonCell :mon="row.mon" /></td>
            <template v-for="side in SIDES" :key="side">
              <td
                v-for="(v, k) in row.r[side]"
                :key="k"
                class="num"
                :class="{ active: sort.side === side && sort.k === k, first: k === 0 }"
              >
                {{ v.toLocaleString() }}
              </td>
            </template>
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
import { BULK_CFGS, bulkRow } from '~/utils/perfTable'

const props = defineProps<{ mons: PerfMon[]; match: ((id: string) => boolean) | null }>()
const { t } = useI18n()

const SIDES = ['phys', 'spec'] as const
const rank = ref(0)
const sort = ref<{ side: (typeof SIDES)[number]; k: number }>({ side: 'phys', k: 2 })

const rows = computed(() => {
  const { side, k } = sort.value
  return props.mons
    .filter((m) => !props.match || props.match(m.id))
    .map((m) => ({ mon: m, r: bulkRow(m.form, rank.value) }))
    .sort((a, b) => b.r[side][k]! - a.r[side][k]!)
})
const { visible, sentinel } = useIncremental(rows)
</script>

<style scoped>
th.group {
  text-align: center;
  border-bottom: 1px solid var(--line-soft);
}
th.first,
td.first {
  border-left: 1px solid var(--line);
}
</style>
