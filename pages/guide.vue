<!--
  도움말 (인게임 규칙): 자속·타입 상성·타입별 특징·상태이상·날씨·필드·급소·랭크·행동 순서·더블·메가진화.
  문구는 i18n guide.sec.<id>.items (배열), 타입별 특징은 guide.typeNote.<type> / 날씨·필드·공간은 guide.typeField.<type>.
  상성표·타입 조합 배율·타입별 무효는 게임 데이터의 상성표(types.chart)로 그린다.
  (앱 사용법은 pages/help.vue)
-->
<template>
  <div class="page doc">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('guide.title') }}</h1>
        <p class="page-sub">{{ t('guide.sub') }}</p>
      </div>
    </div>

    <nav class="panel panel-pad toc" :aria-label="t('guide.toc')">
      <a v-for="id in SECTIONS" :key="id" :href="'#' + id" class="chip" @click.prevent="jump(id)">
        {{ t('guide.sec.' + id + '.title') }}
      </a>
    </nav>

    <section v-for="id in SECTIONS" :id="id" :key="id" class="panel panel-pad">
      <h2 class="panel-title">{{ t('guide.sec.' + id + '.title') }}</h2>
      <ul>
        <li v-for="(line, i) in items('guide.sec.' + id + '.items')" :key="i">{{ line }}</li>
      </ul>

      <!-- 타입 상성: 상성표 + 타입 조합 배율 -->
      <template v-if="id === 'types' && chart">
        <h3 class="sub-title">{{ t('guide.chartTitle') }}</h3>
        <p class="hint muted">{{ t('guide.chartHint') }}</p>
        <div class="chart-scroll">
          <table class="chart">
            <thead>
              <tr>
                <th />
                <th v-for="d in TYPE_ORDER" :key="d" class="col-head" :title="gd.name('types', d)">
                  <span class="col-type" :style="{ background: `var(--t-${d})` }">{{
                    short(d)
                  }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in TYPE_ORDER" :key="a">
                <th class="row-head"><UiTypeBadge :type="a" small /></th>
                <td
                  v-for="d in TYPE_ORDER"
                  :key="d"
                  :class="cellClass(mult(a, [d]))"
                  :title="cellTitle(a, d)"
                >
                  {{ cellText(mult(a, [d])) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 class="sub-title">{{ t('guide.calcTitle') }}</h3>
        <p class="hint muted">{{ t('guide.calcHint') }}</p>
        <div class="pick">
          <button
            v-for="ty in TYPE_ORDER"
            :key="ty"
            type="button"
            class="pick-btn"
            :class="{ on: picked.includes(ty) }"
            :aria-pressed="picked.includes(ty)"
            @click="togglePick(ty)"
          >
            <UiTypeBadge :type="ty" small />
          </button>
        </div>
        <dl v-if="picked.length" class="calc">
          <div v-for="g in calcGroups" :key="g.m">
            <dt :class="cellClass(g.m)">×{{ fmt(g.m) }}</dt>
            <dd>
              <template v-if="g.types.length">
                <UiTypeBadge v-for="ty in g.types" :key="ty" :type="ty" small />
              </template>
              <span v-else class="muted">{{ t('guide.calcNone') }}</span>
            </dd>
          </div>
        </dl>
      </template>

      <!-- 타입별 특징: 무효(상성표에서) + 문구 + 날씨·필드·공간 효과 -->
      <div v-if="id === 'typeNotes' && chart" class="perf-scroll">
        <table class="perf-table notes">
          <thead>
            <tr>
              <th>{{ t('guide.typeCol') }}</th>
              <th>{{ t('guide.immuneCol') }}</th>
              <th>{{ t('guide.notesCol') }}</th>
              <th>{{ t('guide.fieldCol') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ty in TYPE_ORDER" :key="ty">
              <td><UiTypeBadge :type="ty" small /></td>
              <td>
                <div class="immune">
                  <UiTypeBadge v-for="a in immuneTo(ty)" :key="a" :type="a" small />
                  <span v-if="!immuneTo(ty).length" class="muted">—</span>
                </div>
              </td>
              <td>
                <ul v-if="items('guide.typeNote.' + ty).length" class="note-list">
                  <li v-for="(line, i) in items('guide.typeNote.' + ty)" :key="i">{{ line }}</li>
                </ul>
                <span v-else class="muted">—</span>
              </td>
              <td>
                <ul v-if="items('guide.typeField.' + ty).length" class="note-list">
                  <li v-for="(line, i) in items('guide.typeField.' + ty)" :key="i">{{ line }}</li>
                </ul>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { TYPE_ORDER } from '~/utils/typeCheck'
import type { TypeId } from '~/utils/types'

const { t, tm, rt, locale } = useI18n()
const gd = useGameData()

const SECTIONS = [
  'stats',
  'stab',
  'types',
  'typeNotes',
  'status',
  'weather',
  'terrain',
  'grounded',
  'crit',
  'ranks',
  'order',
  'damage',
  'doubles',
  'mega',
] as const

// i18n 배열 문구 → 문자열 목록
const items = (key: string): string[] => {
  const v = tm(key) as unknown
  return Array.isArray(v) ? v.map((m) => rt(m)) : []
}

// 목차: 헤더 높이만큼 띄워서 이동
const jump = (id: string) => {
  const el = document.getElementById(id)
  if (!el) return
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' })
}

// ── 상성 ─────────────
const chart = computed(() => gd.data.value?.types.chart ?? null)
const mult = (atk: TypeId, defs: TypeId[]) =>
  defs.reduce((p, d) => p * (chart.value?.[atk]?.[d] ?? 1), 1)
const fmt = (m: number) => (m === 0.5 ? '½' : m === 0.25 ? '¼' : String(m))
const cellText = (m: number) => (m === 1 ? '' : fmt(m))
const cellClass = (m: number) =>
  m === 0 ? 'm0' : m >= 4 ? 'm4' : m > 1 ? 'm2' : m <= 0.25 ? 'm025' : m < 1 ? 'm05' : 'm1'
const cellTitle = (a: TypeId, d: TypeId) =>
  t('guide.chartCell', {
    atk: gd.name('types', a),
    def: gd.name('types', d),
    m: mult(a, [d]),
  })
// 열 머리: 한/일은 앞 2글자, 영어는 3글자
const short = (ty: TypeId) => gd.name('types', ty).slice(0, locale.value === 'en' ? 3 : 2)

// 타입 조합 (최대 2개, 세 번째를 고르면 가장 먼저 고른 것을 뺌)
const picked = ref<TypeId[]>([])
const togglePick = (ty: TypeId) => {
  const p = picked.value
  picked.value = p.includes(ty) ? p.filter((x) => x !== ty) : [...p.slice(-1), ty]
}
const calcGroups = computed(() =>
  [4, 2, 0.5, 0.25, 0].map((m) => ({
    m,
    types: TYPE_ORDER.filter((a) => mult(a, picked.value) === m),
  })),
)

// 이 타입이 무효로 받는 공격 타입
const immuneTo = (ty: TypeId) => TYPE_ORDER.filter((a) => mult(a, [ty]) === 0)
</script>

<style scoped>
.doc {
  max-width: 1000px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.page-head {
  margin-bottom: 0;
}
.toc {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.toc .chip {
  text-decoration: none;
}
section {
  scroll-margin-top: 80px;
}
ul {
  margin: 0;
  padding-left: 20px;
  color: var(--text-2);
  line-height: 1.7;
}
.sub-title {
  margin: 16px 0 2px;
  font-size: 14px;
  font-weight: 800;
}
.hint {
  margin: 0 0 8px;
  font-size: 12px;
}
.chart-scroll {
  overflow-x: auto;
}
.chart {
  border-collapse: collapse;
  font-size: 12px;
}
.chart th,
.chart td {
  border: 1px solid var(--line-soft);
  padding: 0;
}
.chart td {
  width: 30px;
  height: 24px;
  text-align: center;
  font-weight: 800;
}
.row-head {
  padding: 1px 4px !important;
  text-align: left;
}
.col-head {
  vertical-align: bottom;
}
.col-type {
  display: block;
  padding: 2px 0;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
}
.m4,
.m2 {
  color: var(--bad);
}
.m4 {
  background: color-mix(in srgb, var(--bad) 30%, transparent);
}
.m2 {
  background: color-mix(in srgb, var(--bad) 14%, transparent);
}
.m05,
.m025 {
  color: var(--good);
}
.m05 {
  background: color-mix(in srgb, var(--good) 14%, transparent);
}
.m025 {
  background: color-mix(in srgb, var(--good) 30%, transparent);
}
.m0 {
  color: var(--text-3);
  background: var(--hover);
}
.pick {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pick-btn {
  appearance: none;
  border: 2px solid transparent;
  background: none;
  padding: 1px;
  border-radius: 8px;
  cursor: pointer;
  opacity: 0.55;
}
.pick-btn.on {
  border-color: var(--accent-2);
  opacity: 1;
}
.pick-btn:hover {
  opacity: 1;
}
.calc {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 10px 0 0;
}
.calc div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.calc dt {
  width: 44px;
  flex: none;
  text-align: center;
  font-weight: 800;
  border-radius: 6px;
  padding: 1px 0;
}
.calc dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.notes td {
  vertical-align: top;
  white-space: normal;
}
.immune {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.note-list {
  padding-left: 16px;
  line-height: 1.6;
  font-size: 13px;
}
</style>
