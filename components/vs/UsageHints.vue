<!--
  VS 화면 한쪽 포켓몬의 사용률 통계: 많이 쓴 특성(특성이 여러 개일 때)·배분(성격 + 능력 포인트) 상위 3개.
  누르면 그 특성·배분을 바로 적용. 통계 = 현재 레귤레이션(없으면 가장 최근 달), 싱글/더블은 useUsageKind.
-->
<template>
  <div v-if="r" class="usage-hints">
    <div class="hint-head">
      <span class="section-label">{{ t('vs.usage.title') }}</span>
      <TeamUsageKindToggle />
    </div>
    <p v-if="!form" class="muted small">{{ t('vs.usage.none') }}</p>
    <template v-else>
      <div v-if="abilityRows.length > 1" class="hint-row">
        <span class="lbl muted">{{ t('common.ability') }}</span>
        <div class="chip-row">
          <button
            v-for="a in abilityRows"
            :key="a.id"
            type="button"
            class="chip"
            :class="{ active: mon.slot.ability === a.id }"
            :title="gd.text('abilities', a.id)"
            @click="mon.slot.ability = a.id"
          >
            {{ gd.name('abilities', a.id) }}<span class="num pct">{{ pct(a.use) }}</span>
          </button>
        </div>
      </div>
      <div v-if="spreadRows.length" class="hint-row">
        <span class="lbl muted">{{ t('vs.usage.spread') }}</span>
        <!-- 한 줄 = 성격 | 능력 포인트(0 이 아닌 것만) | 비율 -->
        <div class="spreads">
          <button
            v-for="s in spreadRows"
            :key="s.key"
            type="button"
            class="spread"
            :class="{ active: isCurrent(s) }"
            @click="apply(s)"
          >
            <b class="sp-nature">{{ gd.name('natures', s.nature) }}</b>
            <span class="sp-points">
              <span v-for="p in spTokens(s.sp)" :key="p.k" class="sp-tok">
                <span class="sp-k">{{ t('stat.short.' + p.k) }}</span>
                <b class="num">{{ p.v }}</b>
              </span>
            </span>
            <span class="num sp-pct">{{ pct(s.use) }}</span>
          </button>
        </div>
      </div>
      <p class="note muted">{{ t('vs.usage.note', { reg: form.reg, month: form.month }) }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useUsageKind } from '~/composables/useUsageKind'
import { useVs } from '~/composables/useVs'
import { pickUsageTable } from '~/utils/autoSet'
import { STAT_KEYS } from '~/utils/types'
import { parseSpread } from '~/utils/usageStats'
import type { VsSide } from '~/utils/vs'

const props = defineProps<{ side: VsSide }>()
const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const vs = useVs()
const kind = useUsageKind()

const mon = computed(() => vs.state.value[props.side])
const r = computed(() => vs.resolved(props.side))

// 이 포켓몬의 통계: 배분은 지금 폼(메가면 메가 폼, 통계에 없으면 원종), 특성은 원종 (메가는 특성 고정)
const form = computed(() => {
  const p = pickUsageTable(gd.usageMeta(kind.value), reg.active.value?.id)
  const table = p && gd.usageTable(kind.value, p.reg)
  const cur = r.value
  if (!table || !cur) return null
  const base = table.pokemon[cur.base.id]
  const shown = (cur.isMega ? table.pokemon[cur.species.id] : null) ?? base
  if (!shown) return null
  return { reg: p.reg, month: table.month, base, shown }
})
const abilityRows = computed(() => {
  const cur = r.value
  if (!cur || cur.isMega) return []
  const use = form.value?.base?.abilityUsage ?? {}
  return cur.base.abilities.map((id) => ({ id, use: use[id] ?? 0 })).sort((a, b) => b.use - a.use)
})
const spreadRows = computed(() =>
  (form.value?.shown.spreads ?? []).map(([key, use]) => ({ key, use, ...parseSpread(key) })),
)

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
// 0 이 아닌 능력 포인트만 (예: H 2 · A 32 · S 32)
const spTokens = (sp: number[]) =>
  STAT_KEYS.map((k, j) => ({ k, v: sp[j] ?? 0 })).filter((p) => p.v > 0)
const isCurrent = (s: { nature: string; sp: number[] }) =>
  mon.value.slot.nature === s.nature && STAT_KEYS.every((k, j) => mon.value.slot.sp[k] === s.sp[j])
const apply = (s: { nature: string; sp: number[] }) => {
  mon.value.slot.nature = s.nature
  STAT_KEYS.forEach((k, j) => (mon.value.slot.sp[k] = s.sp[j] ?? 0))
}
</script>

<style scoped>
.usage-hints {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.hint-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.hint-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.lbl {
  flex: none;
  min-width: 40px;
  font-size: 11px;
  font-weight: 700;
  line-height: 26px;
}
.pct {
  margin-left: 6px;
  font-size: 11px;
  opacity: 0.8;
}
/* 배분: 칸을 맞춘 줄 목록 (성격 | 능력 포인트 | 비율) */
.spreads {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.spread {
  appearance: none;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.spread:hover {
  background: var(--hover);
}
.spread.active {
  background: var(--panel-3);
  border-color: var(--accent-2);
}
.sp-points {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
}
.sp-tok {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
}
.sp-k {
  font-size: 11px;
  color: var(--text-3);
}
.sp-pct {
  font-weight: 700;
  color: var(--accent-2);
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
