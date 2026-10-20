<!--
  배틀 폼 토글 (메가진화와 별개). 파티 카드 / 선출 카드에서 쓴다.
  - 두 가지 폼(킬가르도 블레이드폼 / 돌핀맨 마이티폼 / 모르페코 배고픈모양): 체크 = 그 폼으로 계산 (altOn)
  - 캐스퐁: 모습이 날씨로 정해져서 보통 / 태양 / 빗방울 / 설운 버튼이 날씨(weather)를 바꾼다
-->
<template>
  <span v-if="isCastform" class="form-seg" :title="t('party.formNote.castform')" @click.stop>
    <button
      v-for="f in CASTFORM"
      :key="f"
      type="button"
      class="seg"
      :class="{ on: current === f }"
      @click="pick(f)"
    >
      {{ t('form.castform.' + f) }}
    </button>
  </span>
  <label
    v-else-if="r.formId"
    class="form-switch"
    :title="t('party.formNote.' + r.formId)"
    @click.stop
    @keydown.stop
  >
    <input
      type="checkbox"
      :checked="r.isAlt"
      @change="altOn = ($event.target as HTMLInputElement).checked"
    />
    <span>{{ t('battle.form.' + r.formId) }}</span>
    <small v-if="!r.isAlt && r.ability === 'stancechange'">({{ t('party.formOnAttack') }})</small>
  </label>
</template>

<script setup lang="ts">
import type { ResolvedSlot } from '~/composables/useTeamCalc'
import { forecastForm } from '~/utils/damage'
import type { Weather } from '~/utils/types'

const props = defineProps<{ r: ResolvedSlot }>()
const altOn = defineModel<boolean | null>('altOn', { default: null })
const weather = defineModel<Weather>('weather', { default: '' })
const { t } = useI18n()

const CASTFORM = ['normal', 'sunny', 'rainy', 'snowy'] as const
type CastForm = (typeof CASTFORM)[number]
const WEATHER_OF: Record<Exclude<CastForm, 'normal'>, Weather> = {
  sunny: 'sun',
  rainy: 'rain',
  snowy: 'snow',
}
const isCastform = computed(() => props.r.ability === 'forecast')
const current = computed<CastForm>(() => {
  const id = forecastForm(props.r.ability, weather.value)
  return id ? (id.replace('castform', '') as CastForm) : 'normal'
})
// 보통 = 캐스퐁 모습을 바꾸는 날씨를 끈다 (모래바람·난기류는 그대로)
const pick = (f: CastForm) => {
  if (f === 'normal') {
    if (current.value !== 'normal') weather.value = ''
  } else weather.value = WEATHER_OF[f]
}
</script>

<style scoped>
.form-switch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 0 7px 0 5px;
  border-radius: 999px;
  background: var(--faint);
  border: 1px solid var(--line-strong);
  color: var(--text-2);
  cursor: pointer;
  white-space: nowrap;
}
.form-switch input {
  margin: 0;
}
.form-switch:has(input:checked) {
  color: var(--accent-2);
  border-color: var(--accent-2);
}
.form-switch small {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
}
.form-seg {
  display: inline-flex;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  overflow: hidden;
}
.seg {
  appearance: none;
  border: 0;
  background: var(--faint);
  color: var(--text-2);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 0 7px;
  cursor: pointer;
  white-space: nowrap;
}
.seg + .seg {
  border-left: 1px solid var(--line);
}
.seg.on {
  background: var(--accent-2);
  color: var(--on-accent-2);
}
</style>
