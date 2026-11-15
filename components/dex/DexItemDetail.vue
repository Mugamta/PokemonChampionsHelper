<!--
  도구 도감 상세: 도구 하나의 분류(메가스톤·열매·지닌 도구)·상점 가격(VP)·설명·메가진화 대상과
  채용한 포켓몬(고른 시즌·월 사용률 통계에서 이 도구를 지닌 비율 순, public/data/stats/ — 통계 화면과 같은 데이터).
  기간 기본 = 현재 레귤레이션 시즌, 고른 기간은 도구를 바꿔도 유지. 포켓몬을 누르면 포켓몬 탭으로.
-->
<template>
  <div class="dex-detail">
    <section class="panel panel-pad head">
      <div class="name-row">
        <UiItemIcon :id="item.id" :size="40" />
        <h2 class="name">{{ gd.name('items', item.id) }}</h2>
        <span class="cat">{{ t('dex.it.cat.' + itemCategory(item)) }}</span>
      </div>
      <dl class="spec">
        <div>
          <dt>{{ t('dex.it.price') }}</dt>
          <dd v-if="item.price" class="num">{{ t('dex.it.vp', { n: item.price }) }}</dd>
          <dd v-else class="none">{{ t('dex.it.noPrice') }}</dd>
        </div>
      </dl>
      <p v-if="desc" class="desc">{{ desc }}</p>
      <div v-if="megas.length" class="megas">
        <span class="section-label">{{ t('dex.it.mega') }}</span>
        <NuxtLink v-for="m in megas" :key="m.to" class="mega" :to="{ query: { id: m.to } }">
          <UiPokeSprite :id="m.from" :size="32" />
          <span>{{ gd.name('pokemon', m.from) }}</span>
          <span class="muted">→</span>
          <UiPokeSprite :id="m.to" :size="32" />
          <span>{{ gd.name('pokemon', m.to) }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="panel panel-pad">
      <h3 class="panel-title">
        {{ t('dex.it.users') }}
        <span class="spacer" />
        <TeamUsageKindToggle />
        <select
          v-if="list.length"
          v-model="periodKey"
          class="field-input period"
          :aria-label="t('usageStats.period')"
        >
          <optgroup :label="t('usageStats.mode.season')">
            <option v-for="p in seasons" :key="statsKey(p)" :value="statsKey(p)">
              {{ periodLabel(p) }}
            </option>
          </optgroup>
          <optgroup :label="t('usageStats.mode.month')">
            <option v-for="p in months" :key="statsKey(p)" :value="statsKey(p)">
              {{ periodLabel(p) }}
            </option>
          </optgroup>
        </select>
      </h3>
      <p v-if="current" class="period-line muted">
        <b>{{ periodLabel(current) }}</b>
        <span class="num">{{ monthsText(current) }}</span>
        · {{ t('usageStats.battles', { n: current.battles.toLocaleString() }) }} ·
        {{ t('dex.mv.count', { n: users.length }) }}
      </p>
      <UiPageLoading v-if="index === undefined || (current && table === undefined)" />
      <div v-else-if="users.length" class="learners">
        <NuxtLink
          v-for="row in users"
          :key="row.id"
          class="learner"
          :to="{ query: { id: row.id } }"
        >
          <UiPokeSprite :id="row.id" :size="32" />
          <span class="nm">{{ gd.name('pokemon', row.id) }}</span>
          <span class="use num">{{ (row.use * 100).toFixed(1) }}%</span>
        </NuxtLink>
      </div>
      <p v-else class="muted small">{{ t('dex.it.noUsers') }}</p>
      <p class="note muted">{{ t('dex.it.usersNote') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUsageKind } from '~/composables/useUsageKind'
import { useUsageStats } from '~/composables/useUsageStats'
import { itemCategory } from '~/utils/itemInfo'
import type { Item } from '~/utils/types'
import { periodsOf, statsKey, type StatsMeta } from '~/utils/usageStats'

const props = defineProps<{ item: Item }>()
const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()

const desc = computed(() => gd.text('items', props.item.id))
// 메가스톤: 원종 → 메가 폼 (현재 데이터에 있는 폼만)
const megas = computed(() =>
  Object.entries(props.item.megaStone ?? {})
    .filter(([from, to]) => gd.pokemon(from) && gd.pokemon(to))
    .map(([from, to]) => ({ from, to })),
)

// ── 채용한 포켓몬 (시즌·월별 통계) ─────────────
const kind = useUsageKind()
const stats = useUsageStats()
const index = computed(() => stats.index())
const list = computed<StatsMeta[]>(() => index.value?.[kind.value] ?? [])
const seasons = computed(() => periodsOf(list.value, 'season'))
const months = computed(() => periodsOf(list.value, 'month'))
// 고른 기간 (statsKey). 없거나 목록에 없으면 현재 레귤레이션 시즌, 그것도 없으면 마지막 시즌
const picked = useState('dex-item-period', () => '')
const current = computed<StatsMeta | undefined>(
  () =>
    list.value.find((p) => statsKey(p) === picked.value) ??
    seasons.value.find((p) => p.reg === reg.active.value?.id) ??
    seasons.value.at(-1),
)
const periodKey = computed({
  get: () => (current.value ? statsKey(current.value) : ''),
  set: (v: string) => (picked.value = v),
})
const table = computed(() => stats.table(kind.value, current.value))
const users = computed(() =>
  (table.value?.pokemon ?? [])
    .map((m) => ({ id: m.id, use: m.items.find(([i]) => i === props.item.id)?.[1] ?? 0 }))
    .filter((r) => r.use > 0 && gd.pokemon(r.id))
    .sort((a, b) => b.use - a.use),
)
const periodLabel = (p: StatsMeta) =>
  p.period === 'season'
    ? t('usageStats.season', { reg: p.reg })
    : t('usageStats.month', { month: p.period, reg: p.reg })
const monthsText = (p: StatsMeta) =>
  p.months.length > 1 ? `${p.months[0]} ~ ${p.months.at(-1)}` : (p.months[0] ?? '')
</script>

<style scoped>
.dex-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.head {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 24px;
}
.cat {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--text-2);
  font-size: 12px;
}
.spec {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0;
}
.spec div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.spec dt {
  font-size: 11px;
  color: var(--text-3);
}
.spec dd {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
}
.spec dd.none {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-3);
  padding-top: 3px;
}
.desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-2);
}
.megas {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}
.mega {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 2px;
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
}
.mega:hover,
.learner:hover {
  background: var(--hover);
}
.learners {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 2px 8px;
}
.learner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}
.nm {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.use {
  font-size: 12px;
  color: var(--accent-2);
  font-weight: 700;
}
.period {
  width: auto;
  font-size: 12px;
  padding-top: 4px;
  padding-bottom: 4px;
}
.period-line {
  margin: 0 0 8px;
  font-size: 12px;
}
.period-line b {
  color: var(--text);
  margin-right: 6px;
}
.note {
  margin: 8px 0 0;
  font-size: 11px;
}
.small {
  font-size: 12px;
}
</style>
