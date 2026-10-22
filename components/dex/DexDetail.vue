<!--
  도감 상세: 포켓몬 하나의 종족값·실능치(배분·성격·랭크 반영)·스피드(도구 반영)·내구·타입별 실질 내구와 기술표.
  처음에는 사용률 통계의 배분(성격·능력 포인트·특성·도구)으로 채우고, 없으면 무보정·능력 포인트 0.
  메가진화 폼은 메가스톤·메가 특성으로 고정. 계산: utils/dex.ts, useTeamCalc
-->
<template>
  <div class="dex-detail">
    <section class="panel panel-pad head">
      <UiPokeSprite :id="mon.id" :size="96" />
      <div class="head-info">
        <div class="name-row">
          <span class="no num">No.{{ mon.num }}</span>
          <h2 class="name">{{ gd.name('pokemon', mon.id) }}</h2>
          <UiTypeBadge v-for="ty in form.types" :key="ty" :type="ty" />
        </div>
        <div class="abilities">
          <span class="section-label">{{ t('common.ability') }}</span>
          <span
            v-for="a in abilityList"
            :key="a"
            class="ab"
            :class="{ on: a === r?.ability }"
            :title="gd.text('abilities', a)"
            >{{ gd.name('abilities', a) }}</span
          >
        </div>
        <div class="kind-row">
          <TeamUsageKindToggle />
        </div>
        <p v-if="usage" class="usage-line">
          {{
            t('dex.usage', {
              kind: t('usage.' + kind),
              pct: pct(usage.usage),
              month: usageTable!.month,
              reg: usageTable!.reg,
            })
          }}
        </p>
        <p v-else class="usage-line muted">{{ t('dex.noUsage') }}</p>
      </div>
    </section>

    <!-- 배분·도구·특성·랭크 -->
    <section class="panel panel-pad cfg">
      <h3 class="panel-title">
        {{ t('dex.settings') }}
        <span class="spacer" />
        <button v-if="usage" type="button" class="chip" @click="applyUsage">
          {{ t('dex.applyUsage') }}
        </button>
        <button type="button" class="chip" @click="resetCfg">{{ t('dex.resetCfg') }}</button>
      </h3>
      <div class="cfg-grid">
        <label class="fld">
          <span class="section-label">{{ t('common.nature') }}</span>
          <TeamNaturePicker v-model="cfg.nature" />
        </label>
        <label class="fld">
          <span class="section-label">{{ t('common.item') }}</span>
          <span v-if="megaItem" class="fixed">
            <UiItemIcon :id="megaItem" :size="22" /> {{ gd.name('items', megaItem) }}
          </span>
          <TeamItemPicker v-else v-model="cfg.item" :species="baseId" />
        </label>
        <label class="fld">
          <span class="section-label">{{ t('common.ability') }}</span>
          <span v-if="megaItem" class="fixed" :title="t('dex.abilityFixed')">
            {{ gd.name('abilities', r?.ability ?? '') }}
          </span>
          <select v-else v-model="cfg.ability" class="field-input">
            <option v-for="a in abilityList" :key="a" :value="a">
              {{ gd.name('abilities', a) }}
            </option>
          </select>
        </label>
      </div>
      <div class="ranks">
        <PerfRankStep
          v-for="k in RANK_KEYS"
          :key="k"
          v-model="cfg.ranks[k]"
          :label="k === 'accuracy' ? t('stat.accuracy') : t('stat.short.' + k)"
        />
      </div>
    </section>

    <!-- 능력치 -->
    <section class="panel panel-pad">
      <h3 class="panel-title">
        {{ t('dex.stats') }}
        <span class="spacer" />
        <span class="sp-total num" :class="{ 'bad-text': spUsed > SP_TOTAL_MAX }">
          {{ t('stat.spTotal', { used: spUsed, max: SP_TOTAL_MAX }) }}
        </span>
      </h3>
      <table class="stat-table">
        <thead>
          <tr>
            <th />
            <th class="bar-col">{{ t('stat.base') }}</th>
            <th class="n">{{ t('stat.sp') }}</th>
            <th class="n">{{ t('stat.actual') }}</th>
            <th class="n">{{ t('dex.ranked') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in STAT_KEYS" :key="k">
            <th class="sk" :class="natureMark(k)">{{ t('stat.' + k) }}</th>
            <td class="bar-col">
              <div class="bar-wrap">
                <span class="base num">{{ form.stats[k] }}</span>
                <span class="track">
                  <span
                    class="bar"
                    :style="{
                      width: Math.min(100, (form.stats[k] / 200) * 100) + '%',
                      background: barColor(form.stats[k]),
                    }"
                  />
                </span>
              </div>
            </td>
            <td class="n">
              <input
                v-model.number="cfg.sp[k]"
                type="number"
                min="0"
                :max="SP_PER_STAT_MAX"
                class="field-input sp-in num"
                :aria-label="t('stat.sp') + ' ' + t('stat.' + k)"
              />
            </td>
            <td class="n num strong">{{ r?.stats[k] ?? '—' }}</td>
            <td class="n num" :class="{ changed: shownStat(k) !== r?.stats[k] }">
              {{ shownStat(k) }}
            </td>
          </tr>
          <tr class="total">
            <th>{{ t('dex.total') }}</th>
            <td class="bar-col num">{{ bst }}</td>
            <td colspan="3" />
          </tr>
        </tbody>
      </table>
      <p v-if="speedNote" class="note muted">{{ speedNote }}</p>
    </section>

    <!-- 내구 -->
    <section class="panel panel-pad">
      <h3 class="panel-title">{{ t('dex.bulk') }}</h3>
      <div class="bulk-row">
        <span
          >{{ t('stat.physBulk') }} <b class="num">{{ bulk.phys.toLocaleString() }}</b></span
        >
        <span
          >{{ t('stat.specBulk') }} <b class="num">{{ bulk.spec.toLocaleString() }}</b></span
        >
      </div>
      <span class="section-label" :title="t('dex.typeBulkHint')">{{ t('dex.typeBulk') }}</span>
      <div class="perf-scroll">
        <table class="perf-table type-bulk">
          <thead>
            <tr>
              <th>{{ t('perf.col.type') }}</th>
              <th class="num-col">{{ t('dex.mult') }}</th>
              <th class="num-col">{{ t('stat.physBulk') }}</th>
              <th class="num-col">{{ t('stat.specBulk') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in typeRows" :key="row.type">
              <td><UiTypeBadge :type="row.type" small /></td>
              <td class="num" :class="multClass(row.mult)">×{{ fmtMult(row.mult) }}</td>
              <td class="num">{{ row.phys?.toLocaleString() ?? t('dex.immune') }}</td>
              <td class="num">{{ row.spec?.toLocaleString() ?? t('dex.immune') }}</td>
              <td class="muted small">
                <template v-if="row.berry">{{ gd.name('items', cfg.item) }} ×2</template>
                <template v-else-if="row.source">{{ gd.name('abilities', row.source) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <DexMoves :r="r" :base-id="baseId" :ranks="cfg.ranks" :usage="usage?.moveUsage ?? null" />
  </div>
</template>

<script setup lang="ts">
import type { PerfMon } from '~/composables/usePerfList'
import { useTeamCalc } from '~/composables/useTeamCalc'
import { useUsageKind } from '~/composables/useUsageKind'
import { pickUsageTable } from '~/utils/autoSet'
import { dexBulk, typeBulk } from '~/utils/dex'
import { applyBoost, effectiveSpeed, SP_PER_STAT_MAX, SP_TOTAL_MAX, spTotal } from '~/utils/stats'
import { emptySlot, STAT_KEYS, type StatKey, type StatTable, type TeamSlot } from '~/utils/types'

const props = defineProps<{ mon: PerfMon }>()
const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const calc = useTeamCalc()

const RANK_KEYS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy'] as const
type RankKey = (typeof RANK_KEYS)[number]

const self = computed(() => gd.pokemon(props.mon.id)!)
const baseId = computed(() => self.value.mega?.from ?? props.mon.id)
const megaItem = computed(() => self.value.mega?.item ?? '')
const abilityList = computed(() => [...new Set(self.value.abilities)])

// 사용률 통계 (현재 레귤레이션, 없으면 가장 최근 달) — 메가는 메가 폼 줄
const kind = useUsageKind()
const usageTable = computed(() => {
  const p = pickUsageTable(gd.data.value?.usage?.[kind.value], reg.active.value?.id)
  return p ? { reg: p.reg, month: p.table.month, pokemon: p.table.pokemon } : null
})
const usage = computed(() => usageTable.value?.pokemon[props.mon.id] ?? null)

const zeroSp = (): StatTable => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
const zeroRanks = (): Record<RankKey, number> => ({
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
  accuracy: 0,
})
const cfg = reactive({
  nature: 'serious',
  item: '',
  ability: abilityList.value[0] ?? '',
  sp: zeroSp(),
  ranks: zeroRanks(),
})
const resetCfg = () =>
  Object.assign(cfg, {
    nature: 'serious',
    item: '',
    ability: abilityList.value[0] ?? '',
    sp: zeroSp(),
    ranks: zeroRanks(),
  })
// 통계 배분: 성격 + 능력 포인트 + 특성 + 가장 많이 쓴 도구 (메가 폼은 원종 특성을 쓰지 않음)
const applyUsage = () => {
  const u = usage.value
  if (!u) return
  if (u.nature && u.sp?.length === 6) {
    cfg.nature = u.nature
    cfg.sp = Object.fromEntries(STAT_KEYS.map((k, i) => [k, u.sp![i] ?? 0])) as StatTable
  }
  if (abilityList.value.includes(u.ability)) cfg.ability = u.ability
  cfg.item = u.items[0] ?? ''
}
applyUsage()
// 싱글 ↔ 더블을 바꾸면 그 통계 배분으로 다시 채움 (랭크는 그대로)
watch(kind, applyUsage)

const slot = computed<TeamSlot>(() => ({
  ...emptySlot(),
  species: baseId.value,
  item: megaItem.value || cfg.item,
  ability: megaItem.value ? '' : cfg.ability,
  nature: cfg.nature,
  sp: Object.fromEntries(
    STAT_KEYS.map((k) => [k, Math.max(0, Math.min(SP_PER_STAT_MAX, Number(cfg.sp[k]) || 0))]),
  ) as StatTable,
}))
const r = computed(() => calc.resolve(slot.value))
const form = computed(() => r.value?.species ?? self.value)
const bst = computed(() => STAT_KEYS.reduce((s, k) => s + form.value.stats[k], 0))
const spUsed = computed(() => spTotal(cfg.sp))

// 성격 보정 표시 (↑ / ↓)
const natureMark = (k: StatKey) => {
  const n = gd.data.value?.natures[cfg.nature]
  return n?.plus === k ? 'up' : n?.minus === k ? 'down' : ''
}
// 랭크 반영 (스피드는 도구·특성까지 — 구애스카프 등)
const shownStat = (k: StatKey) => {
  const st = r.value?.stats[k]
  if (st == null) return '—'
  if (k === 'hp') return st
  if (k === 'spe')
    return effectiveSpeed(st, {
      boost: cfg.ranks.spe,
      item: slot.value.item,
      ability: r.value!.ability,
    })
  return applyBoost(st, cfg.ranks[k])
}
const speedNote = computed(() => (slot.value.item === 'choicescarf' ? t('dex.scarfNote') : ''))

const bulk = computed(() => (r.value ? dexBulk(r.value.stats, cfg.ranks) : { phys: 0, spec: 0 }))
// 타입별 실질 내구: 1배가 아닌 타입 + 반감열매가 발동하는 타입
const typeRows = computed(() => {
  const d = gd.data.value
  if (!r.value || !d) return []
  return typeBulk(calc.combatant(r.value), d.types.chart, bulk.value)
    .filter((row) => row.mult !== 1 || row.berry)
    .sort((a, b) => b.mult - a.mult)
})
const fmtMult = (m: number) =>
  Number.isInteger(m) ? String(m) : String(Math.round(m * 1000) / 1000)
const multClass = (m: number) => (m > 1 ? 'weak' : m < 1 ? 'resist' : '')

const pct = (v?: number) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const barColor = (v: number) =>
  v >= 130 ? 'var(--good)' : v >= 100 ? 'var(--accent-2)' : v >= 70 ? 'var(--accent)' : 'var(--bad)'
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
  align-items: center;
  gap: 16px;
}
.head-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
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
.no {
  color: var(--text-3);
  font-size: 12px;
}
.abilities {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 13px;
}
.ab {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--text-2);
}
.ab.on {
  border-color: var(--accent-2);
  color: var(--text);
  font-weight: 700;
}
.kind-row {
  display: flex;
}
.usage-line {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}
.cfg-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.fixed {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  font-weight: 700;
}
.ranks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 10px;
}
.stat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.stat-table th,
.stat-table td {
  padding: 3px 6px;
  border-bottom: 1px solid var(--line-soft);
}
.stat-table thead th {
  font-size: 11px;
  color: var(--text-3);
  text-align: left;
}
.stat-table .n {
  text-align: right;
  width: 80px;
}
.sk {
  text-align: left;
  width: 64px;
  font-weight: 700;
}
.sk.up {
  color: var(--nature-up);
}
.sk.down {
  color: var(--nature-down);
}
.bar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.base {
  width: 32px;
  text-align: right;
}
.track {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--hover);
  overflow: hidden;
}
.bar {
  display: block;
  height: 100%;
  border-radius: 4px;
}
.sp-in {
  width: 64px;
  padding: 2px 6px;
  text-align: right;
}
.strong {
  font-weight: 800;
}
.changed {
  color: var(--accent-2);
  font-weight: 800;
}
.total th,
.total td {
  font-weight: 800;
  border-bottom: 0;
}
.sp-total {
  font-size: 12px;
  font-weight: 700;
}
.note {
  margin: 6px 0 0;
  font-size: 12px;
}
.bulk-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  font-size: 14px;
  margin-bottom: 10px;
}
.type-bulk td.weak {
  color: var(--bad);
  font-weight: 800;
}
.type-bulk td.resist {
  color: var(--good);
  font-weight: 800;
}
.small {
  font-size: 11px;
}
@media (max-width: 700px) {
  .cfg-grid {
    grid-template-columns: 1fr;
  }
  .head {
    align-items: flex-start;
  }
}
</style>
