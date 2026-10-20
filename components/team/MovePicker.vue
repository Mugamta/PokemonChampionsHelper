<!-- 기술 선택 (타입/분류/위력 표시). 선택된 기술 아래에 정보 한 줄 -->
<template>
  <div class="move-picker">
    <v-autocomplete
      v-model="selected"
      :items="items"
      item-title="title"
      item-value="value"
      :placeholder="t('common.move')"
      persistent-placeholder
      density="compact"
      variant="solo-filled"
      flat
      hide-details
      clearable
      auto-select-first
      :disabled="disabled"
      :menu-props="{ maxHeight: 380 }"
    >
      <!-- 결정력은 입력칸 안 오른쪽에 (아래 정보 줄이 한 줄에 들어가도록) -->
      <template v-if="showInfo && move && power != null" #append-inner>
        <span class="decisive" :title="hitsTitle"
          >{{ t('common.decisive') }} <b class="num">{{ power.toLocaleString() }}</b></span
        >
      </template>
      <template #item="{ props: p, item }">
        <v-list-item v-bind="p" :title="undefined">
          <div class="opt" :title="item.desc">
            <UiTypeBadge :type="typeOf(item.value) || item.type" small />
            <span class="opt-name">{{ item.title }}</span>
            <UiCategoryBadge :category="item.category" />
            <span class="opt-pow num">{{ item.power || '—' }}</span>
          </div>
        </v-list-item>
      </template>
    </v-autocomplete>
    <!-- 기술을 안 골라도 정보 줄 자리를 비워 둔다 (옆 카드와 줄이 맞도록) -->
    <div v-if="showInfo && !move" class="info" />
    <div v-else-if="move && showInfo" class="info">
      <!-- 기술 타입에 마우스를 올리면 공격 상성 (스킨류로 바뀐 경우 바뀐 타입 기준) -->
      <v-tooltip location="bottom" :open-delay="150" class="type-tip-overlay">
        <template #activator="{ props: act }">
          <UiTypeBadge
            v-bind="act"
            :type="shownType!"
            small
            class="move-type"
            :class="{ changed: shownType !== move.type }"
          />
        </template>
        <UiTypeTip mode="attack" :types="[shownType!]" :note="changedNote" />
      </v-tooltip>
      <!-- 기술 설명은 타입 배지를 뺀 나머지에만 (타입 상성 툴팁과 겹치지 않게) -->
      <span class="info-rest" :title="gd.text('moves', move.id)">
        <UiCategoryBadge :category="move.category" />
        <span v-if="move.power"
          >{{ t('common.power') }} <b class="num">{{ move.power }}</b></span
        >
        <span v-if="hitsLabel" :title="hitsTitle"
          ><b class="num">{{ hitsLabel }}</b></span
        >
        <span
          >{{ t('common.accuracy') }} <b class="num">{{ move.accuracy ?? '—' }}</b></span
        >
        <span
          >{{ t('common.pp') }}
          <b class="num">{{ move.pp }}{{ move.ppEstimated ? '*' : '' }}</b></span
        >
        <span v-if="move.priority" class="prio"
          >{{ t('common.priority') }}
          <b class="num">{{ move.priority > 0 ? '+' : '' }}{{ move.priority }}</b></span
        >
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { effectiveMoveType, type FieldState } from '~/utils/damage'
import type { Pokemon } from '~/utils/types'
import type { HitsUsed } from '~/utils/perfTable'

const model = defineModel<string>({ default: '' })
// 빈 값은 '' 로 저장하지만 Vuetify 에는 null 로 넘긴다 ('' 를 선택된 값으로 봐서 안내 문구가 안 보임)
const selected = computed({
  get: () => model.value || null,
  set: (v: string | null) => (model.value = v ?? ''),
})
const props = defineProps<{
  learnset: string[]
  exclude?: string[]
  disabled?: boolean
  power?: number | null
  hits?: HitsUsed | null // 연속기 타수 (결정력은 전체 타수 합, 무작위면 기댓값)
  showInfo?: boolean
  ability?: string // 기술을 쓰는 포켓몬의 특성 (메가 적용 후). 스킨류면 노말 기술 타입이 바뀜
  species?: Pokemon | null // 기술을 쓰는 폼 (오라휠·레이징불처럼 폼에 따라 타입이 바뀌는 기술)
  field?: FieldState
}>()
const { t } = useI18n()
const gd = useGameData()

const move = computed(() => gd.move(model.value))
// 특성/날씨/필드로 바뀐 타입
const typeOf = (id: string) => {
  const m = gd.move(id)
  return m ? effectiveMoveType(m, props.ability || '', props.field, props.species) : null
}
const shownType = computed(() => (move.value ? typeOf(move.value.id) : null))
// 특성으로 타입이 바뀐 경우 설명 (예: 페어리스킨: 노말 → 페어리 타입)
const changedNote = computed(() =>
  move.value && shownType.value && shownType.value !== move.value.type
    ? t('party.typeChanged', {
        ability: gd.name('abilities', props.ability),
        from: gd.name('types', move.value.type),
        to: gd.name('types', shownType.value),
      })
    : undefined,
)
// 연속기 타수: 고정이면 "n회", 무작위면 "최소~최대회" (부자유친은 특성으로 보이므로 생략)
const hitsLabel = computed(() => {
  const h = props.hits
  if (!h || h.parentalBond) return ''
  return h.min === h.max
    ? t('perf.hits', { n: h.max })
    : t('perf.hitsRange', { min: h.min, max: h.max })
})
// 타수가 무작위면 결정력이 기댓값 기준임을 알림
const hitsTitle = computed(() => {
  const h = props.hits
  if (!h || h.outcomes.length < 2) return undefined
  const pct = (p: number) => Number((p * 100).toFixed(1))
  const exp = t('perf.hitsExp', { n: Number(h.expHits.toFixed(2)) })
  const dist =
    h.outcomes.length > 4
      ? exp
      : h.outcomes.map((o) => t('perf.hitPct', { n: o.hits, p: pct(o.p) })).join(' · ') +
        ' → ' +
        exp
  return t('party.hitsPowerHint', { dist })
})
const items = computed(() => {
  const ex = new Set((props.exclude || []).filter(Boolean))
  const ids = props.learnset.filter((m) => !ex.has(m) || m === model.value)
  // 습득 기술에 없는 값(예전 데이터 등)도 이름으로 보이도록 포함
  if (model.value && gd.move(model.value) && !ids.includes(model.value)) ids.push(model.value)
  return gd.options('moves', ids).map((o) => {
    const m = gd.move(o.value)!
    return {
      ...o,
      type: m.type,
      category: m.category,
      power: m.power,
      desc: gd.text('moves', o.value),
    }
  })
})
</script>

<style scoped>
.move-picker {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.opt {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.opt-name {
  flex: 1;
}
.opt-pow {
  width: 28px;
  text-align: right;
  color: var(--text-2);
  font-size: 12px;
}
.info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 18px;
  gap: 4px 8px;
  font-size: 11px;
  color: var(--text-3);
  padding: 0 4px;
}
/* 배치는 .info 의 flex 를 그대로 따르고 툴팁(title)만 나눔 */
.info-rest {
  display: contents;
}
/* 특성으로 바뀐 타입 (마우스를 올리면 설명) */
.move-type {
  cursor: help;
}
.changed {
  box-shadow: 0 0 0 1px var(--text-2);
}
.info b {
  color: var(--text-2);
  font-weight: 700;
}
.prio {
  color: var(--text);
  font-weight: 700;
}
.decisive {
  font-size: 11px;
  white-space: nowrap;
  color: var(--text-3);
  margin-right: 2px;
}
.decisive b {
  color: var(--text);
}
</style>
