<!--
  도감 기술표: 이 포켓몬이 배우는 기술 전부. 위력 / 명중(명중 랭크·특성·도구 반영) / PP / 우선도 /
  결정력(배분·성격·공격·특공 랭크·도구·특성 반영, 연속기는 기댓값 — 파티 화면과 같은 기준) / 사용률(통계에 있는 기술).
  열 머리를 누르면 정렬, 분류·통계 기술만 거르기
-->
<template>
  <section class="panel panel-pad perf-panel">
    <h3 class="panel-title">
      {{ t('dex.moves') }}
      <span class="spacer" />
      <span class="muted small">{{ t('perf.count', { n: rows.length }) }}</span>
    </h3>
    <div class="chip-row">
      <button
        v-for="c in CATS"
        :key="c"
        type="button"
        class="chip"
        :class="{ active: cat === c }"
        @click="cat = c"
      >
        {{ c === 'all' ? t('dex.allMoves') : t('category.' + c) }}
      </button>
      <label v-if="usage" class="check">
        <input v-model="onlyUsed" type="checkbox" />
        {{ t('dex.onlyUsed') }}
      </label>
    </div>
    <div class="perf-scroll">
      <table class="perf-table moves">
        <thead>
          <tr>
            <th>
              <button
                type="button"
                class="sort"
                :class="{ active: sort === 'name' }"
                @click="sortBy('name')"
              >
                {{ t('common.move') }}<span class="arrow">▼</span>
              </button>
            </th>
            <th>{{ t('perf.col.type') }}</th>
            <th />
            <th v-for="c in NUM_COLS" :key="c" class="num-col">
              <button type="button" class="sort" :class="{ active: sort === c }" @click="sortBy(c)">
                {{ colLabel(c) }}<span class="arrow">▼</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="mv" :title="gd.text('moves', row.id)">{{ gd.name('moves', row.id) }}</td>
            <td><UiTypeBadge :type="row.type" small /></td>
            <td><UiCategoryBadge :category="row.category" /></td>
            <td class="num">{{ row.power || '—' }}</td>
            <td class="num" :class="{ changed: row.accChanged }">
              {{ row.acc == null ? t('dex.neverMiss') : row.acc }}
            </td>
            <td class="num">{{ row.pp }}</td>
            <td class="num">{{ row.priority > 0 ? '+' + row.priority : row.priority || '' }}</td>
            <td class="num strong" :class="{ changed: row.boosted }">
              {{ row.decisive?.toLocaleString() ?? '—' }}
            </td>
            <td class="num">
              <span v-if="row.usage != null" class="use">
                <span class="use-bar" :style="{ width: Math.min(100, row.usage * 100) + '%' }" />
                <span class="use-val">{{ (row.usage * 100).toFixed(1) }}%</span>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="note muted">{{ t('dex.movesNote') }}</p>
  </section>
</template>

<script setup lang="ts">
import { useTeamCalc, type ResolvedSlot } from '~/composables/useTeamCalc'
import { shownAccuracy } from '~/utils/dex'
import type { Move } from '~/utils/types'

const props = defineProps<{
  r: ResolvedSlot | null
  baseId: string
  ranks: { atk: number; spa: number; accuracy: number }
  usage: Record<string, number> | null
}>()
const { t } = useI18n()
const gd = useGameData()
const calc = useTeamCalc()

const CATS = ['all', 'physical', 'special', 'status'] as const
const NUM_COLS = ['power', 'acc', 'pp', 'priority', 'decisive', 'usage'] as const
type SortKey = 'name' | (typeof NUM_COLS)[number]
const cat = ref<(typeof CATS)[number]>('all')
const onlyUsed = ref(false)
const sort = ref<SortKey>('decisive')
const sortBy = (k: SortKey) => (sort.value = k)
const colLabel = (c: (typeof NUM_COLS)[number]) =>
  c === 'acc'
    ? t('common.accuracy')
    : c === 'decisive'
      ? t('common.decisive')
      : c === 'usage'
        ? t('dex.usageCol')
        : t('common.' + c)

const moves = computed(() =>
  gd
    .learnset(props.baseId)
    .map((id) => gd.move(id))
    .filter((m): m is Move => !!m),
)

const rows = computed(() => {
  const r = props.r
  if (!r) return []
  const atkC = calc.combatant(calc.attackForm(r), { boosts: { accuracy: props.ranks.accuracy } })
  const boosts = { atk: props.ranks.atk, spa: props.ranks.spa }
  const out = moves.value
    .filter((m) => cat.value === 'all' || m.category === cat.value)
    .filter((m) => !onlyUsed.value || props.usage?.[m.id] != null)
    .map((m) => {
      const acc = shownAccuracy(m, atkC)
      const base = m.accuracy == null ? null : m.accuracy
      const used = m.category === 'physical' ? props.ranks.atk : props.ranks.spa
      return {
        id: m.id,
        type: m.type,
        category: m.category,
        power: m.power,
        acc,
        accChanged: acc != null && base != null && acc !== Math.min(100, base),
        pp: m.pp,
        priority: m.priority,
        decisive: m.category === 'status' ? null : calc.power(r, m.id, {}, undefined, boosts),
        boosted: m.category !== 'status' && used !== 0,
        usage: props.usage?.[m.id] ?? null,
      }
    })
  const name = (id: string) => gd.name('moves', id)
  const val = (x: (typeof out)[number]): number => {
    switch (sort.value) {
      case 'power':
        return x.power || -1
      case 'acc':
        return x.acc ?? 101
      case 'pp':
        return x.pp
      case 'priority':
        return x.priority
      case 'usage':
        return x.usage ?? -1
      default:
        return x.decisive ?? -1
    }
  }
  return out.sort((a, b) =>
    sort.value === 'name'
      ? name(a.id).localeCompare(name(b.id))
      : val(b) - val(a) ||
        (b.usage ?? -1) - (a.usage ?? -1) ||
        name(a.id).localeCompare(name(b.id)),
  )
})
</script>

<style scoped>
.chip-row {
  margin-bottom: 8px;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}
.mv {
  font-weight: 700;
  white-space: nowrap;
}
.strong {
  font-weight: 800;
}
.changed {
  color: var(--accent-2);
}
.use {
  position: relative;
  display: inline-flex;
  justify-content: flex-end;
  min-width: 64px;
  border-radius: 4px;
  overflow: hidden;
}
.use-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--accent-2) 22%, transparent);
}
.use-val {
  position: relative;
  padding: 0 4px;
}
.note {
  margin: 8px 0 0;
  font-size: 11px;
}
.small {
  font-size: 12px;
}
</style>
