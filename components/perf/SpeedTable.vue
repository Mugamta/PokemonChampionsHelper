<!--
  성능표 · 스피드: 포켓몬마다 S0 / S32 / S32+성격 / 스카프 S32 / 스카프 S32+성격 실수치.
  스피드 특성(쓱쓱·엽록소·곡예 등)이 있으면 특성 보정 줄을 따로 (특성 태그). 메가진화는 스카프 칸 없음.
  스피드 랭크 선택. 계산: utils/perfTable.ts speedRows
-->
<template>
  <section class="panel panel-pad perf-panel">
    <div class="opts">
      <div class="chip-row">
        <PerfRankStep v-model="rank" :label="t('perf.speed.rank')" />
        <label class="check">
          <input v-model="withAbility" type="checkbox" />
          {{ t('perf.speed.ability') }}
        </label>
        <span class="spacer" />
        <span class="muted small">{{ t('perf.count', { n: rows.length }) }}</span>
      </div>
      <p class="legend muted">{{ t('perf.speed.legend') }}</p>
    </div>

    <div class="perf-scroll">
      <table class="perf-table">
        <thead>
          <tr>
            <th class="rk">#</th>
            <th>{{ t('perf.col.mon') }}</th>
            <th class="num-col">{{ t('perf.speed.base') }}</th>
            <th v-for="(c, k) in SPEED_CFGS" :key="c" class="num-col">
              <button
                type="button"
                class="sort"
                :class="{ active: sortK === k }"
                @click="sortK = k"
              >
                {{ t('perf.speed.cfg.' + c) }}<span class="arrow">▼</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in visible" :key="row.key">
            <td class="rk num">{{ i + 1 }}</td>
            <td>
              <div class="mon">
                <PerfMonCell :mon="row.mon" />
                <span
                  v-if="row.ability"
                  class="tag ab"
                  :title="gd.text('abilities', row.ability)"
                  >{{ gd.name('abilities', row.ability) }}</span
                >
              </div>
            </td>
            <td class="num base">{{ row.mon.form.stats.spe }}</td>
            <td v-for="(v, k) in row.values" :key="k" class="num" :class="{ active: sortK === k }">
              {{ v ?? '—' }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="muted empty">{{ t('perf.empty') }}</p>
      <div ref="sentinel" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PerfMon } from '~/composables/usePerfList'
import { useIncremental } from '~/composables/useIncremental'
import { SPEED_CFGS, speedRows } from '~/utils/perfTable'

const props = defineProps<{ mons: PerfMon[]; match: ((id: string) => boolean) | null }>()
const { t } = useI18n()
const gd = useGameData()

const rank = ref(0) // 스피드 랭크
const withAbility = ref(true) // 특성 보정 줄 보이기
const sortK = ref(2)

const rows = computed(() => {
  const k = sortK.value
  return props.mons
    .filter((m) => !props.match || props.match(m.id))
    .flatMap((m) =>
      speedRows(m.form, !m.form.mega, rank.value)
        .filter((r) => withAbility.value || !r.ability)
        .map((r) => ({ key: `${m.id}|${r.ability}`, mon: m, ...r })),
    )
    .sort(
      (a, b) =>
        (b.values[k] ?? -1) - (a.values[k] ?? -1) || b.mon.form.stats.spe - a.mon.form.stats.spe,
    )
})
const { visible, sentinel } = useIncremental(rows)
</script>

<style scoped>
.legend {
  margin: 0;
  font-size: 11px;
}
.mon {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tag {
  font-size: 10px;
  font-weight: 700;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--well);
  white-space: nowrap;
}
.tag.ab {
  color: var(--accent-2);
}
td.base {
  color: var(--text-3);
}
</style>
