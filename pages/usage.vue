<!--
  사용률 통계: Smogon 월별 통계를 시즌(레귤레이션, 달 합산)별·월별 순위표로 정리.
  싱글/더블은 첫 화면·도감과 같은 선택(useUsageKind), 모드·기간·고른 포켓몬은 주소(?mode=&reg=&period=&id=)에 남김.
  데이터: composables/useUsageStats.ts (public/data/stats/), 계산: utils/usageStats.ts, 상세: components/usage/MonDetail.vue
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('usageStats.title') }}</h1>
        <p class="page-sub">
          {{ t('usageStats.sub') }} ·
          <a href="https://www.smogon.com/stats/" target="_blank" rel="noopener">Smogon</a>
        </p>
      </div>
      <TeamUsageKindToggle />
    </div>

    <UiPageLoading v-if="!gd.ready.value || index === undefined" />
    <p v-else-if="!list.length" class="panel panel-pad muted">{{ t('usageStats.none') }}</p>
    <template v-else>
      <div class="toolbar">
        <div class="tab-row" role="tablist">
          <button
            v-for="k in MODES"
            :key="k"
            type="button"
            role="tab"
            class="tab-btn"
            :aria-selected="mode === k"
            :class="{ active: mode === k }"
            @click="setMode(k)"
          >
            {{ t('usageStats.mode.' + k) }}
          </button>
        </div>
        <div class="chip-row periods" role="group" :aria-label="t('usageStats.period')">
          <button
            v-for="p in periods"
            :key="statsKey(p)"
            type="button"
            class="chip"
            :class="{ active: current && statsKey(p) === statsKey(current) }"
            :aria-pressed="!!current && statsKey(p) === statsKey(current)"
            @click="setPeriod(p)"
          >
            {{ periodLabel(p) }}
          </button>
        </div>
        <input
          v-model="query"
          type="search"
          class="field-input search"
          :placeholder="t('perf.search')"
          :aria-label="t('perf.search')"
        />
      </div>

      <p v-if="current" class="summary muted">
        <b class="cur">{{ periodLabel(current) }}</b>
        <span class="num">{{ monthsText(current) }}</span>
        · {{ t('usageStats.battles', { n: current.battles.toLocaleString() }) }}
        <template v-if="table">
          · {{ t('usageStats.count', { n: table.pokemon.length }) }}
        </template>
        ·
        {{
          prev ? t('usageStats.compare', { period: periodLabel(prev) }) : t('usageStats.noCompare')
        }}
      </p>

      <div class="usage-layout">
        <section class="panel rank-panel">
          <UiPageLoading v-if="table === undefined" />
          <p v-else-if="!table" class="muted empty">{{ t('usageStats.none') }}</p>
          <div v-else class="perf-scroll">
            <table class="perf-table rank-table">
              <thead>
                <tr>
                  <th class="rk">{{ t('usageStats.col.rank') }}</th>
                  <th class="chg" :title="t('usageStats.changeHint')">
                    {{ t('usageStats.col.change') }}
                  </th>
                  <th>{{ t('usageStats.col.pokemon') }}</th>
                  <th class="num-col" :title="t('usageStats.usageHint')">
                    {{ t('usageStats.col.usage') }}
                  </th>
                  <th class="num-col cnt">{{ t('usageStats.col.count') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in rows"
                  :key="r.mon.id"
                  class="rank-row"
                  :class="{ active: r.mon.id === selected?.mon.id }"
                  tabindex="0"
                  @click="id = r.mon.id"
                  @keydown.enter="id = r.mon.id"
                >
                  <td class="rk num">{{ r.rank }}</td>
                  <td class="chg num" :class="changeClass(r.change)">
                    {{ changeText(r.change) }}
                  </td>
                  <td>
                    <span class="mon">
                      <UiPokeSprite :id="r.mon.id" :size="32" />
                      <span class="nm">{{ gd.name('pokemon', r.mon.id) }}</span>
                    </span>
                  </td>
                  <td class="num usage-cell">
                    <span class="usage-in">
                      <span class="bar-wrap">
                        <span class="bar" :style="{ width: barWidth(r.mon.usage) }" />
                      </span>
                      <span class="val">{{ pct(r.mon.usage) }}</span>
                    </span>
                  </td>
                  <td class="num cnt muted">{{ r.mon.count.toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="!rows.length" class="muted empty">—</p>
          </div>
        </section>

        <UsageMonDetail
          v-if="selected && current"
          :key="statsKey(current) + selected.mon.id"
          :mon="selected.mon"
          :rank="selected.rank"
          :change="selected.change"
          :trend="monthTrend(trend ?? undefined, list, selected.mon.id)"
          :current="current"
          @select="id = $event"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useUsageKind } from '~/composables/useUsageKind'
import { useUsageStats } from '~/composables/useUsageStats'
import {
  monthTrend,
  periodsOf,
  previousPeriod,
  rankChange,
  statsKey,
  type RankChange,
  type StatsMeta,
  type StatsMode,
} from '~/utils/usageStats'

const { t, locale } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const route = useRoute()
const router = useRouter()
const kind = useUsageKind()
const stats = useUsageStats()

// ── 기간 ─────────────
const MODES = ['season', 'month'] as const satisfies readonly StatsMode[]
const index = computed(() => stats.index())
const list = computed<StatsMeta[]>(() => index.value?.[kind.value] ?? [])
const trend = computed(() => stats.trend(kind.value))

const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
const mode = computed<StatsMode>(() => (q('mode') === 'month' ? 'month' : 'season'))
const periods = computed(() => periodsOf(list.value, mode.value))
// 주소의 기간이 없거나 목록에 없으면: 시즌 = 현재 레귤레이션(없으면 마지막), 월 = 가장 최근 달
const current = computed<StatsMeta | undefined>(() => {
  const ps = periods.value
  const hit = ps.find((p) => p.reg === q('reg') && p.period === q('period'))
  if (hit) return hit
  const regId = reg.active.value?.id
  if (mode.value === 'season') return ps.find((p) => p.reg === regId) ?? ps.at(-1)
  return ps.at(-1)
})
const prev = computed(() => current.value && previousPeriod(list.value, current.value))

const setMode = (m: StatsMode) =>
  router.replace({ query: { ...route.query, mode: m, reg: undefined, period: undefined } })
const setPeriod = (p: StatsMeta) =>
  router.replace({ query: { ...route.query, reg: p.reg, period: p.period } })

const periodLabel = (p: StatsMeta) =>
  p.period === 'season'
    ? t('usageStats.season', { reg: p.reg })
    : t('usageStats.month', { month: p.period, reg: p.reg })
const monthsText = (p: StatsMeta) =>
  p.months.length > 1 ? `${p.months[0]} ~ ${p.months.at(-1)}` : (p.months[0] ?? '')

// ── 순위표 ─────────────
const table = computed(() => stats.table(kind.value, current.value))
const ranked = computed(() =>
  (table.value?.pokemon ?? [])
    .filter((m) => gd.pokemon(m.id))
    .map((mon, i) => ({
      mon,
      rank: i + 1,
      change: rankChange(trend.value ?? undefined, list.value, prev.value, mon.id, i + 1),
    })),
)
const query = ref('')
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.()]/g, '')
const rows = computed(() => {
  const s = norm(query.value)
  if (!s) return ranked.value
  void locale.value
  return ranked.value.filter(
    (r) => norm(gd.name('pokemon', r.mon.id)).includes(s) || r.mon.id.includes(s),
  )
})
const topUsage = computed(() => ranked.value[0]?.mon.usage || 1)
const barWidth = (u: number) => `${Math.min(100, (u / topUsage.value) * 100)}%`
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const changeText = (c: RankChange) =>
  c === null ? '' : c === 'new' ? t('usageStats.new') : c > 0 ? `▲${c}` : c < 0 ? `▼${-c}` : '–'
const changeClass = (c: RankChange) =>
  c === 'new' ? 'is-new' : typeof c === 'number' ? (c > 0 ? 'up' : c < 0 ? 'down' : '') : ''

// ── 고른 포켓몬 (없으면 1위) ─────────────
const id = computed<string>({
  get: () => q('id'),
  set: (v) => router.replace({ query: { ...route.query, id: v } }),
})
const selected = computed(() => ranked.value.find((r) => r.mon.id === id.value) ?? ranked.value[0])
</script>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.periods {
  flex: 1;
}
.search {
  width: min(240px, 100%);
}
.summary {
  margin: 0 0 12px;
  font-size: 13px;
}
.summary .cur {
  color: var(--text);
  margin-right: 6px;
}
.usage-layout {
  display: grid;
  grid-template-columns: minmax(0, 560px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.rank-panel {
  padding: 6px 4px;
  max-height: calc(100vh - 150px);
  overflow-y: auto;
  position: sticky;
  top: 70px;
}
.rank-panel .empty {
  padding: 24px 0;
  text-align: center;
  margin: 0;
}
/* 300줄 넘는 표라 화면 밖 줄은 그리기를 건너뜀 (높이 = 스프라이트 32 + 위아래 여백) */
.rank-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 43px;
  cursor: pointer;
}
.rank-row.active {
  background: var(--panel-3);
  box-shadow: inset 3px 0 0 var(--accent-2);
}
.rank-table .chg {
  width: 44px;
  font-size: 11px;
  text-align: center;
}
.chg.up {
  color: var(--good);
}
.chg.down {
  color: var(--bad);
}
.chg.is-new {
  color: var(--accent-text);
  font-weight: 800;
}
.mon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.nm {
  font-weight: 600;
  white-space: nowrap;
}
.usage-cell {
  width: 130px;
}
.usage-in {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.bar-wrap {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--well-strong);
  overflow: hidden;
}
.bar {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--accent-2);
}
.usage-cell .val {
  width: 44px;
  font-weight: 700;
}
.cnt {
  width: 80px;
  font-size: 12px;
}
@media (max-width: 960px) {
  .usage-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .rank-panel {
    position: static;
    max-height: 60vh;
  }
}
/* 폰 폭: 사용 수·막대를 빼서 이름 칸 확보 */
@media (max-width: 560px) {
  .cnt,
  .bar-wrap {
    display: none;
  }
  .usage-cell {
    width: auto;
  }
  .nm {
    white-space: normal;
  }
}
</style>
