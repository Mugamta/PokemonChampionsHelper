<!--
  데미지 입력칸. 두 가지 방식 (전역 토글, useState 'battle-dmg-mode'):
    데미지: 깎인 양을 바로 입력
    체력 전후: 맞기 전 HP → 맞은 뒤 HP 를 입력하면 차이를 데미지로 (전은 비우면 지금 HP)
  unit: pct = 상대 HP %(0~100, 소수 1자리) / hp = 내 HP 실수치(정수)
  내 HP(hp)는 오차가 없어서 "전"은 지금 HP 로 고정. locked: 결과가 하나로 정해져 부모가 값을 채움 (수정 불가)
-->
<template>
  <div v-if="mode === 'hp'" class="hp-pair">
    <input
      v-if="unit === 'hp' || locked"
      :value="fmt(current)"
      type="number"
      class="field-input num"
      :title="t('battle.hpBefore')"
      disabled
    />
    <input
      v-else
      v-model.number="before"
      type="number"
      min="0"
      :max="max"
      :step="step"
      class="field-input num"
      :placeholder="fmt(current)"
      :title="t('battle.hpBefore')"
      :disabled="disabled"
    />
    <span class="arrow">→</span>
    <input
      v-if="locked"
      :value="model == null ? '' : fmt(Math.max(0, current - model))"
      type="number"
      class="field-input num"
      :title="t('battle.hpAfter')"
      disabled
    />
    <input
      v-else
      v-model.number="after"
      type="number"
      min="0"
      :max="max"
      :step="step"
      class="field-input num"
      :placeholder="t('battle.hpAfter')"
      :title="t('battle.hpAfter')"
      :disabled="disabled"
    />
    <!-- 상대 %는 화면에 정수(버림)로만 보여서 실제 데미지는 ±1%p 범위 (배분 추정은 utils/hpDisplay 로 정확히) -->
    <span
      v-if="model != null"
      class="delta num"
      :title="unit === 'pct' ? t('battle.pctRangeHint') : undefined"
      >−{{ fmt(model)
      }}<template v-if="unit === 'pct'">
        ({{ fmt(Math.max(0, model - 1)) }}~{{ fmt(Math.min(100, model + 1)) }})</template
      ></span
    >
  </div>
  <input
    v-else
    v-model.number="model"
    type="number"
    min="0"
    :max="unit === 'pct' ? 100 : undefined"
    :step="step"
    class="field-input num"
    :placeholder="unit === 'pct' ? '0~100' : '0'"
    :disabled="disabled || locked"
  />
</template>

<script setup lang="ts">
const model = defineModel<number | null>({ default: null })
const props = defineProps<{
  unit: 'pct' | 'hp'
  current: number // 맞는 쪽의 지금 HP (pct: %, hp: 실수치)
  max: number // 최대 (pct: 100, hp: 최대 HP)
  disabled?: boolean
  locked?: boolean
}>()
const { t } = useI18n()
const mode = useState<'damage' | 'hp'>('battle-dmg-mode', () => 'damage')

// 데미지 직접 입력은 0.1 단위, 체력 전후는 화면에 보이는 정수 그대로
const step = computed(() => (props.unit === 'pct' && mode.value === 'damage' ? 0.1 : 1))
const round = (v: number) => (props.unit === 'pct' ? Math.round(v * 10) / 10 : Math.round(v))
const fmt = (v: number) => String(round(v))

const before = ref<number | null>(null)
const after = ref<number | null>(null)
// 전·후가 바뀌면 데미지 = 전 − 후 (전을 비우면 지금 HP)
// (v-model.number 은 칸을 비우면 '' 가 된다)
const num = (v: number | null) => (v == null || (v as unknown) === '' ? null : v)
watch([before, after], () => {
  const a = num(after.value)
  if (a == null) {
    model.value = null
    return
  }
  model.value = round(Math.max(0, (num(before.value) ?? props.current) - a))
})
// 턴이 끝나 입력값이 초기화되면 전·후도 비움
watch(model, (v) => {
  if (v == null && after.value != null) {
    before.value = null
    after.value = null
  }
})
</script>

<style scoped>
.hp-pair {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  align-items: center;
  gap: 6px;
}
.arrow {
  color: var(--text-3);
}
.delta {
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
}
</style>
