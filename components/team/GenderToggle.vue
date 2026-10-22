<!--
  성별 선택 (헤롱헤롱·헤롱헤롱바디 판정용). 성별이 정해진 종(수컷만/암컷만)은 기호만, 무성은 표시 없음.
  둘 다 가능한 종은 ♂/♀ 를 고르고, 고른 것을 다시 누르면 "모름"으로.
-->
<template>
  <span v-if="fixed === 'N'" />
  <span v-else-if="fixed" class="gender fixed" :class="fixed" :title="t('gender.fixed')">{{
    symbol(fixed)
  }}</span>
  <span
    v-else
    class="gender-pick"
    :class="{ missing: required && !model }"
    :title="t('gender.hint')"
  >
    <button
      v-for="g in ['M', 'F'] as const"
      :key="g"
      type="button"
      class="gender-btn"
      :class="[g, { active: model === g }]"
      :aria-label="t('gender.' + g)"
      :aria-pressed="model === g"
      @click="model = model === g ? '' : g"
    >
      {{ symbol(g) }}
    </button>
  </span>
</template>

<script setup lang="ts">
import type { Gender } from '~/utils/types'

// required: 성별을 꼭 골라야 함 (내 파티) → 안 골랐으면 강조
const props = defineProps<{ species: string; required?: boolean }>()
const model = defineModel<Gender>({ default: '' })
const { t } = useI18n()
const gd = useGameData()

const fixed = computed(() => gd.pokemon(props.species)?.gender ?? '')
const symbol = (g: 'M' | 'F') => (g === 'M' ? '♂' : '♀')
</script>

<style scoped>
.gender {
  font-weight: 800;
  font-size: 14px;
}
.gender.M,
.gender-btn.M.active {
  color: var(--mine);
}
.gender.F,
.gender-btn.F.active {
  color: var(--opp);
}
.gender-pick {
  display: inline-flex;
  gap: 2px;
}
.gender-btn {
  min-width: 22px;
  height: 20px;
  padding: 0 4px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--text-3);
  font-weight: 800;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.gender-pick.missing .gender-btn {
  border-color: var(--bad);
}
.gender-btn.active {
  border-color: currentColor;
  background: var(--panel-3);
}
</style>
