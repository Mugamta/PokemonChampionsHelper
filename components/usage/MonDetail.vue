<!--
  사용률 통계 화면의 포켓몬 상세: 고른 기간의 순위·채용률, 기술·도구·특성·배분·함께 쓴 포켓몬 비율, 월별 순위 추이.
  함께 쓴 포켓몬을 누르면 그 포켓몬으로 (select). 데이터 형식: utils/usageStats.ts
-->
<template>
  <section class="panel panel-pad detail">
    <div class="head">
      <UiPokeSprite :id="mon.id" :size="72" />
      <div class="grow">
        <h2 class="title">
          {{ gd.name('pokemon', mon.id) }}
          <span v-for="ty in types" :key="ty"><UiTypeBadge :type="ty" small /></span>
        </h2>
        <p class="meta num">
          <b class="rank">{{ t('usageStats.rank', { n: rank }) }}</b>
          <span v-if="changeLabel" class="chg" :class="changeCls">{{ changeLabel }}</span>
          ·
          <span :title="t('usageStats.usageHint')"
            >{{ t('usageStats.col.usage') }} <b>{{ pct(mon.usage) }}</b></span
          >
          · {{ t('usageStats.col.count') }} {{ mon.count.toLocaleString() }}
        </p>
      </div>
      <NuxtLink :to="{ path: '/dex', query: { id: mon.id } }" class="btn btn-sm">
        {{ t('usageStats.toDex') }}
      </NuxtLink>
    </div>

    <div class="grid">
      <div class="block">
        <h3 class="section-label">{{ t('usageStats.moves') }}</h3>
        <div v-for="[k, v] in mon.moves" :key="k" class="share">
          <span class="type-dot" :style="{ background: `var(--t-${gd.move(k)?.type})` }" />
          <span class="lbl">{{ gd.name('moves', k) }}</span>
          <span class="bar-wrap"><span class="bar" :style="{ width: pct(v) }" /></span>
          <span class="val num">{{ pct(v) }}</span>
        </div>
      </div>

      <div class="block">
        <h3 class="section-label">{{ t('usageStats.items') }}</h3>
        <div v-for="[k, v] in mon.items" :key="k" class="share">
          <UiItemIcon :id="k" :size="20" />
          <span class="lbl">{{ gd.name('items', k) }}</span>
          <span class="bar-wrap"><span class="bar" :style="{ width: pct(v) }" /></span>
          <span class="val num">{{ pct(v) }}</span>
        </div>
        <h3 class="section-label sub">{{ t('usageStats.abilities') }}</h3>
        <div v-for="[k, v] in mon.abilities" :key="k" class="share">
          <span class="lbl">{{ gd.name('abilities', k) }}</span>
          <span class="bar-wrap"><span class="bar" :style="{ width: pct(v) }" /></span>
          <span class="val num">{{ pct(v) }}</span>
        </div>
      </div>

      <div class="block">
        <h3 class="section-label">{{ t('usageStats.spreads') }}</h3>
        <div v-for="[k, v] in mon.spreads" :key="k" class="share">
          <span class="lbl">
            <b>{{ gd.name('natures', parseSpread(k).nature) }}</b>
            <span class="num sp">{{ spText(parseSpread(k).sp) }}</span>
          </span>
          <span class="val num">{{ pct(v) }}</span>
        </div>
        <p v-if="!mon.spreads.length" class="muted small">—</p>
        <h3 class="section-label sub">{{ t('usageStats.teammates') }}</h3>
        <button
          v-for="[k, v] in mon.teammates"
          :key="k"
          type="button"
          class="share mate"
          @click="emit('select', k)"
        >
          <UiPokeSprite :id="k" :size="28" />
          <span class="lbl">{{ gd.name('pokemon', k) }}</span>
          <span class="val num">{{ pct(v) }}</span>
        </button>
      </div>

      <div class="block">
        <h3 class="section-label">{{ t('usageStats.trend') }}</h3>
        <div
          v-for="p in trend"
          :key="p.reg + p.period"
          class="share trend-row"
          :class="{ cur: current.months.includes(p.period) && current.reg === p.reg }"
        >
          <span class="lbl num"
            >{{ p.period }} <span class="muted">{{ p.reg }}</span></span
          >
          <span class="rk num">{{ p.rank ? t('usageStats.rank', { n: p.rank }) : '—' }}</span>
          <span class="bar-wrap"><span class="bar" :style="{ width: trendWidth(p.usage) }" /></span>
          <span class="val num">{{ p.rank ? pct(p.usage) : '' }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { STAT_KEYS } from '~/utils/types'
import { parseSpread, type RankChange, type StatsMeta, type StatsMon } from '~/utils/usageStats'

const props = defineProps<{
  mon: StatsMon
  rank: number
  change: RankChange
  trend: { reg: string; period: string; rank: number; usage: number }[]
  current: StatsMeta
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { t } = useI18n()
const gd = useGameData()

const types = computed(() => gd.pokemon(props.mon.id)?.types ?? [])
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
// 0 이 아닌 능력 포인트만 (예: H2 A32 S32)
const spText = (sp: number[]) =>
  sp
    .map((v, j) => (v ? `${t('stat.short.' + STAT_KEYS[j])}${v}` : ''))
    .filter(Boolean)
    .join(' ')
const changeLabel = computed(() => {
  const c = props.change
  if (c === null) return ''
  if (c === 'new') return t('usageStats.new')
  return c > 0 ? `▲${c}` : c < 0 ? `▼${-c}` : '–'
})
const changeCls = computed(() => {
  const c = props.change
  return c === 'new' ? 'is-new' : typeof c === 'number' ? (c > 0 ? 'up' : c < 0 ? 'down' : '') : ''
})
// 추이 막대: 이 포켓몬의 가장 높은 채용률 = 끝까지
const trendMax = computed(() => Math.max(...props.trend.map((p) => p.usage), 0.0001))
const trendWidth = (u: number) => `${(u / trendMax.value) * 100}%`
</script>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.grow {
  flex: 1;
  min-width: 0;
}
.title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 800;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.meta {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-2);
}
.meta .rank {
  color: var(--accent-text);
}
.chg {
  margin-left: 4px;
  font-size: 12px;
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
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px 18px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.section-label {
  margin: 0 0 4px;
}
.section-label.sub {
  margin-top: 10px;
}
.share {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  min-height: 24px;
}
.lbl {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sp {
  margin-left: 6px;
  color: var(--text-2);
  font-size: 12px;
}
.bar-wrap {
  width: 70px;
  height: 6px;
  border-radius: 3px;
  background: var(--well-strong);
  overflow: hidden;
  flex: none;
}
.bar {
  display: block;
  height: 100%;
  background: var(--accent-2);
  border-radius: 3px;
}
.val {
  width: 48px;
  text-align: right;
  font-weight: 700;
  flex: none;
}
.type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.mate {
  appearance: none;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  padding: 0 4px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.mate:hover {
  background: var(--hover);
}
.trend-row .rk {
  width: 44px;
  text-align: right;
  font-size: 12px;
  color: var(--text-2);
}
.trend-row.cur {
  background: var(--panel-3);
  border-radius: 6px;
  box-shadow: inset 3px 0 0 var(--accent-2);
  padding-left: 4px;
}
.small {
  font-size: 12px;
  margin: 0;
}
</style>
