<!--
  통계 화면 포켓몬 상세의 대면 칸: 고른 기간에 이 포켓몬이 상대하기 어려운/쉬운 상대(물러난 비율 높은/낮은 순)와
  상대 하나를 골라 양쪽 기록 보기(A vs B). 상대를 누르면 A vs B 에 들어감. 데이터: useUsageStats().vs, utils/usageStats.ts
-->
<template>
  <div class="matchups">
    <h3 class="section-label">{{ t('matchup.title') }}</h3>
    <UiPageLoading v-if="vs === undefined" />
    <p v-else-if="!rows?.length" class="muted small">{{ t('matchup.none') }}</p>
    <template v-else>
      <div class="cols">
        <div v-for="col in cols" :key="col.dir" class="col">
          <span class="col-title" :class="col.dir">{{ t('matchup.' + col.dir) }}</span>
          <button
            v-for="m in col.list"
            :key="m.id"
            type="button"
            class="mrow"
            :class="{ active: m.id === opp }"
            @click="opp = m.id"
          >
            <UiPokeSprite :id="m.id" :size="28" />
            <span class="lbl">{{ gd.name('pokemon', m.id) }}</span>
            <span class="n muted num">{{ m.n.toLocaleString() }}</span>
            <span class="bar-wrap"><span class="bar" :style="{ width: pct(m.out) }" /></span>
            <span class="val num">{{ pct(m.out) }}</span>
          </button>
        </div>
      </div>
      <p class="note muted">{{ t('matchup.listNote') }}</p>

      <div class="pair">
        <span class="section-label">{{ t('matchup.pair') }}</span>
        <TeamSpeciesPicker v-model="opp" :ids="oppIds" :label="t('matchup.pickOpp')" />
        <UsageMatchupLine v-if="opp" :a="monId" :b="opp" :vs="vs" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useUsageKind } from '~/composables/useUsageKind'
import { useUsageStats } from '~/composables/useUsageStats'
import { rankedMatchups, type StatsMeta } from '~/utils/usageStats'

const props = defineProps<{ monId: string; current: StatsMeta }>()
const { t } = useI18n()
const gd = useGameData()
const kind = useUsageKind()
const stats = useUsageStats()

const vs = computed(() => stats.vs(kind.value, props.current))
const rows = computed(() => vs.value?.[props.monId])
const cols = computed(() => [
  { dir: 'hard', list: rankedMatchups(rows.value, 'hard') },
  { dir: 'easy', list: rankedMatchups(rows.value, 'easy') },
])
// A vs B 상대: 이 포켓몬과 맞대결 기록이 있는 포켓몬 (맞대결 많은 순 → 이름 검색)
const oppIds = computed(() => (rows.value ?? []).map((r) => r[0]).filter((id) => gd.pokemon(id)))
const opp = ref('')
watch(
  () => props.monId,
  () => (opp.value = ''),
)
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
</script>

<style scoped>
.matchups {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.section-label {
  margin: 0;
}
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 6px 18px;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.col-title {
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 2px;
}
.col-title.hard {
  color: var(--bad);
}
.col-title.easy {
  color: var(--good);
}
.mrow {
  appearance: none;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.mrow:hover {
  background: var(--hover);
}
.mrow.active {
  background: var(--panel-3);
  box-shadow: inset 3px 0 0 var(--accent-2);
}
.lbl {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.n {
  font-size: 11px;
}
.bar-wrap {
  width: 60px;
  height: 6px;
  border-radius: 3px;
  background: var(--well-strong);
  overflow: hidden;
  flex: none;
}
.bar {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--bad);
}
.val {
  width: 46px;
  text-align: right;
  font-weight: 700;
  flex: none;
}
.pair {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
  max-width: 520px;
}
.note {
  margin: 0;
  font-size: 11px;
}
.small {
  margin: 0;
  font-size: 12px;
}
</style>
