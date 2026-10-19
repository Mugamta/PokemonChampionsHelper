<!--
  성능표 · 스피드 순위: 실수치가 같은 (종족값, 투자, 배율, 필드) 묶음을 한 줄로, 빠른 순.
  투자 5가지(S0 / S32 / S32+ / 스카프 S32 / 스카프 S32+) × 특성 보정 유무 × 없음 / 순풍 / 끈적끈적네트.
  포켓몬마다 배율의 출처(구애스카프 / 특성)를 태그로. 계산: utils/perfTable.ts speedEntries, speedGroups
-->
<template>
  <section class="panel panel-pad perf-panel">
    <div class="opts">
      <div class="chip-row">
        <span class="section-label">{{ t('perf.speed.cfgLabel') }}</span>
        <button
          v-for="c in SPEED_CFGS"
          :key="c"
          type="button"
          class="chip"
          :class="{ active: cfgs.has(c) }"
          @click="toggle(cfgs, c)"
        >
          {{ t('perf.speed.cfg.' + c) }}
        </button>
      </div>
      <div class="chip-row">
        <span class="section-label">{{ t('perf.speed.fieldLabel') }}</span>
        <button
          v-for="f in SPEED_FIELDS"
          :key="f"
          type="button"
          class="chip"
          :class="{ active: fields.has(f) }"
          @click="toggle(fields, f)"
        >
          {{ fieldText(f, true) }}
        </button>
        <label class="check">
          <input v-model="withAbility" type="checkbox" />
          {{ t('perf.speed.ability') }}
        </label>
        <label v-if="match" class="check">
          <input v-model="onlyMatch" type="checkbox" />
          {{ t('perf.speed.onlyMatch') }}
        </label>
        <span class="spacer" />
        <span class="muted small">{{ t('perf.count', { n: groups.length }) }}</span>
      </div>
      <p class="legend muted">{{ t('perf.speed.legend') }}</p>
    </div>

    <div class="sp-list">
      <div class="sp-row sp-head">
        <span>{{ t('perf.speed.base') }}</span>
        <span>{{ t('perf.speed.mult') }}</span>
        <span>{{ t('perf.speed.speed') }}</span>
        <span>{{ t('perf.col.mon') }}</span>
        <span>{{ t('perf.speed.fieldLabel') }}</span>
      </div>
      <div v-for="g in visible" :key="g.key" class="sp-row">
        <span class="base num"
          >{{ g.base }}<b v-if="g.sp === 's32plus'" class="plus">+</b
          ><small v-else-if="g.sp === 's0'" class="s0">S0</small></span
        >
        <span class="mult num" :class="{ none: isOne(g.mult) }">{{ multText(g.mult) }}</span>
        <span class="speed num">{{ g.speed }}</span>
        <span class="mons">
          <span
            v-for="e in g.entries"
            :key="e.id + '|' + e.ability + '|' + e.scarf"
            class="mon-chip"
            :class="{ hit: match?.(e.id) }"
          >
            <UiPokeSprite :id="e.id" :size="26" />
            <span class="no num">#{{ byId.get(e.id)?.num }}</span>
            <span class="nm">{{ gd.name('pokemon', e.id) }}</span>
            <span v-if="byId.get(e.id)?.isNew" class="new">{{ t('perf.new') }}</span>
            <span v-if="e.scarf" class="tag">{{ gd.name('items', 'choicescarf') }}</span>
            <span v-if="e.ability" class="tag ab" :title="gd.text('abilities', e.ability)">{{
              gd.name('abilities', e.ability)
            }}</span>
          </span>
        </span>
        <span class="field" :class="g.field">{{ fieldText(g.field) }}</span>
      </div>
      <p v-if="!groups.length" class="muted empty">{{ t('perf.empty') }}</p>
      <div ref="sentinel" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PerfMon } from '~/composables/usePerfList'
import { useIncremental } from '~/composables/useIncremental'
import {
  SPEED_CFGS,
  SPEED_FIELDS,
  speedEntries,
  speedGroups,
  type SpeedCfg,
  type SpeedEntry,
  type SpeedField,
} from '~/utils/perfTable'

const props = defineProps<{ mons: PerfMon[]; match: ((id: string) => boolean) | null }>()
const { t } = useI18n()
const gd = useGameData()

const cfgs = ref(new Set<SpeedCfg>(SPEED_CFGS))
const fields = ref(new Set<SpeedField>(SPEED_FIELDS))
const withAbility = ref(true)
const onlyMatch = ref(true)
const toggle = <T,>(set: Set<T>, v: T) => (set.has(v) ? set.delete(v) : set.add(v))

const byId = computed(() => new Map(props.mons.map((m) => [m.id, m])))
// 모든 포켓몬의 경우 (메가진화는 스카프 없음)
const entries = computed(() => props.mons.flatMap((m) => speedEntries(m.form, m.id, !m.form.mega)))

const cfgOf = (e: SpeedEntry): SpeedCfg =>
  e.scarf ? (e.sp === 's32plus' ? 'scarfPlus' : 'scarf') : e.sp
const groups = computed(() => {
  const list = speedGroups(
    entries.value.filter(
      (e) =>
        cfgs.value.has(cfgOf(e)) && fields.value.has(e.field) && (withAbility.value || !e.ability),
    ),
  )
  const m = props.match
  return m && onlyMatch.value ? list.filter((g) => g.entries.some((e) => m(e.id))) : list
})
const { visible, sentinel } = useIncremental(groups)

const isOne = (v: number) => Math.abs(v - 1) < 1e-9
const multText = (v: number) =>
  isOne(v) ? '—' : `×${Number.isInteger(v) ? v : Number(v.toFixed(2))}`
const fieldText = (f: SpeedField, chip = false) =>
  f === 'tailwind'
    ? t('side.tailwind')
    : f === 'web'
      ? t('side.stickyweb')
      : chip
        ? t('perf.speed.fieldNone')
        : '—'
</script>

<style scoped>
.legend {
  margin: 0;
  font-size: 11px;
}
.sp-list {
  display: flex;
  flex-direction: column;
}
.sp-row {
  display: grid;
  grid-template-columns: 64px 56px 60px minmax(0, 1fr) 96px;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--line-soft);
  content-visibility: auto;
  contain-intrinsic-size: auto 44px;
}
.sp-head {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
  border-bottom-color: var(--line);
  content-visibility: visible;
}
.sp-head > :last-child {
  text-align: right;
}
.sp-row:not(.sp-head):hover {
  background: var(--hover);
}
.base {
  font-weight: 800;
  font-size: 15px;
}
.plus {
  color: var(--nature-up);
}
.s0 {
  margin-left: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-3);
}
.mult {
  font-weight: 700;
  color: var(--accent-2);
}
.mult.none {
  color: var(--text-3);
}
.speed {
  font-weight: 800;
  font-size: 16px;
}
.mons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.mon-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 2px;
  border-radius: 999px;
  background: var(--faint);
  border: 1px solid var(--line-soft);
  font-size: 12px;
  white-space: nowrap;
}
.mon-chip.hit {
  border-color: var(--accent-2);
  background: var(--hover);
  box-shadow: 0 0 0 1px var(--accent-2);
}
.no {
  font-size: 10px;
  color: var(--text-3);
}
.nm {
  font-weight: 700;
}
.new {
  font-size: 9px;
  font-weight: 800;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
}
.tag {
  font-size: 10px;
  font-weight: 700;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--well);
  color: var(--text-2);
}
.tag.ab {
  color: var(--accent-2);
}
.field {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  text-align: right;
}
.field.tailwind {
  color: var(--good);
}
.field.web {
  color: var(--bad);
}
@media (max-width: 700px) {
  .sp-row {
    grid-template-columns: 56px 48px 1fr auto;
    grid-template-areas:
      'base mult speed field'
      'mons mons mons mons';
    row-gap: 6px;
  }
  .sp-head {
    display: none;
  }
  .base {
    grid-area: base;
  }
  .mult {
    grid-area: mult;
  }
  .speed {
    grid-area: speed;
  }
  .mons {
    grid-area: mons;
  }
  .field {
    grid-area: field;
  }
}
</style>
