<!--
  추천 플레이: 상대 포켓몬 하나의 예상 선택지 칩 (싱글·더블 공용).
  누르면 비중 조정 (보통 → 자주 씀 → 안 씀, 이번 배틀 동안만). 비중이 낮은 것은 접어 둠 (직접 조정한 것은 항상 보임)
-->
<template>
  <div class="opp-line">
    <span class="section-label">{{ label }}</span>
    <button
      v-for="(o, i) in shown"
      :key="i"
      type="button"
      class="opp-move"
      :class="[{ sw: o.kind === 'switch' }, prefOf(o) && `pref-${prefOf(o)}`]"
      :title="t('battle.rec.prefHint')"
      @click="prefs.cycle(sig, oi, o)"
    >
      {{ oppLabel(o) }} {{ Math.round(o.weight * 100) }}%
      <span v-if="prefOf(o)" class="pref-tag">{{ t(`battle.rec.pref.${prefOf(o)}`) }}</span>
    </button>
    <button v-if="hidden" type="button" class="btn btn-sm more" @click="all = !all">
      {{ all ? t('battle.rec.less') : t('battle.rec.more', { n: hidden }) }}
    </button>
    <button v-if="hasPrefs" type="button" class="btn btn-sm more" @click="clearMine">
      {{ t('battle.rec.prefReset') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import { useRecLabels } from '~/composables/useRecLabels'
import { useRecOppPrefs, type OppOption } from '~/composables/useRecommend'

const props = defineProps<{
  b: ReturnType<typeof useBattle>
  oi: number // 상대 로스터 번호
  opp: (OppOption & { weight: number })[]
  label: string
}>()
const { t } = useI18n()
const prefs = useRecOppPrefs()
const { oppLabel } = useRecLabels(props.b)

const sig = computed(() => props.b.state.value?.signature ?? '')
const prefOf = (o: OppOption) => prefs.prefOf(sig.value, props.oi, o)
const hasPrefs = computed(() =>
  Object.keys(prefs.prefsFor(sig.value)).some((k) => k.startsWith(`${props.oi}|`)),
)
// 이 상대 포켓몬의 조정만 지움
const clearMine = () => {
  const map = { ...prefs.prefsFor(sig.value) }
  for (const k of Object.keys(map)) if (k.startsWith(`${props.oi}|`)) delete map[k]
  prefs.store.value = { sig: sig.value, map }
}

const MIN_SHOWN = 0.03
const all = ref(false)
const sorted = computed(() => [...props.opp].sort((a, b) => b.weight - a.weight))
const byDefault = (o: OppOption & { weight: number }) => o.weight >= MIN_SHOWN || !!prefOf(o)
const shown = computed(() => (all.value ? sorted.value : sorted.value.filter(byDefault)))
const hidden = computed(() => sorted.value.filter((o) => !byDefault(o)).length)
</script>

<style scoped>
.opp-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
}
.opp-move {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--text-2);
  background: none;
  font: inherit;
  cursor: pointer;
}
.opp-move.sw {
  border-style: dashed;
}
.opp-move.pref-up {
  border-color: var(--accent);
  color: var(--text);
}
.opp-move.pref-off {
  opacity: 0.55;
  text-decoration: line-through;
}
.pref-tag {
  font-size: 10px;
  font-weight: 800;
  margin-left: 2px;
}
.more {
  padding: 0 8px;
  font-size: 11px;
}
</style>
