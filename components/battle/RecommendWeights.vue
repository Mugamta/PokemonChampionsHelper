<!--
  추천 플레이 가중치 입력 (싱글·더블 공용): 미리 정한 값(공격적 / 기본 / 신중) + 항목별 숫자 입력. localStorage 저장
-->
<template>
  <div class="weights">
    <div class="presets" role="group" :aria-label="t('battle.rec.w.preset')">
      <button
        v-for="k in WEIGHT_PRESET_KEYS"
        :key="k"
        type="button"
        class="btn btn-sm"
        :class="{ 'btn-on': current === k }"
        :title="t(`battle.rec.w.presets.${k}Hint`)"
        @click="rw.applyPreset(k)"
      >
        {{ t(`battle.rec.w.presets.${k}`) }}
      </button>
      <span v-if="!current" class="muted small">{{ t('battle.rec.w.custom') }}</span>
    </div>
    <div class="grid">
      <label v-for="k in WEIGHT_KEYS" :key="k" class="weight">
        <span>{{ t(`battle.rec.w.${k}`) }}</span>
        <input
          class="field-input"
          type="number"
          min="0"
          :max="k === 'plausible' ? 1 : undefined"
          :step="k === 'plausible' ? 0.05 : 0.1"
          :value="rw.weights.value[k]"
          @change="rw.set(k, ($event.target as HTMLInputElement).value)"
        />
        <small class="muted">{{ t(`battle.rec.w.${k}Hint`) }}</small>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRecWeights } from '~/composables/useRecommend'
import { WEIGHT_KEYS, WEIGHT_PRESET_KEYS, presetOf } from '~/utils/recommend'

const { t } = useI18n()
const rw = useRecWeights()
const current = computed(() => presetOf(rw.weights.value))
</script>

<style scoped>
.weights {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--line-strong);
}
.presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.small {
  font-size: 12px;
}
.btn-on {
  border-color: var(--accent-2);
  color: var(--accent-2);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  align-items: end;
}
.weight {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
}
.weight .field-input {
  width: 100%;
}
.weight small {
  font-weight: 400;
  font-size: 11px;
  line-height: 1.3;
}
</style>
