<!-- 추천 파티 설정 (핵심 수 · 위협 수 · 대비 비중 · 메가 최대 수). localStorage 저장 (composables/useTeamRecommend.ts) -->
<template>
  <div class="settings">
    <div class="grid">
      <label v-for="k in NUM_KEYS" :key="k" class="setting">
        <span>{{ t(`party.rec.s.${k}`) }}</span>
        <input
          class="field-input"
          type="number"
          :min="REC_LIMITS[k][0]"
          :max="REC_LIMITS[k][1]"
          :step="REC_LIMITS[k][2]"
          :value="rec.settings.value[k]"
          @change="rec.setSetting(k, ($event.target as HTMLInputElement).value)"
        />
        <small class="muted">{{ t(`party.rec.s.${k}Hint`) }}</small>
      </label>
      <label class="setting wide">
        <span>{{
          t('party.rec.s.counterValue', {
            c: Math.round(rec.settings.value.counter * 100),
            m: Math.round((1 - rec.settings.value.counter) * 100),
          })
        }}</span>
        <input
          type="range"
          :min="REC_LIMITS.counter[0]"
          :max="REC_LIMITS.counter[1]"
          :step="REC_LIMITS.counter[2]"
          :value="rec.settings.value.counter"
          @input="rec.setSetting('counter', ($event.target as HTMLInputElement).value)"
        />
        <small class="muted">{{ t('party.rec.s.counterHint') }}</small>
      </label>
    </div>
    <div class="foot">
      <button type="button" class="btn btn-sm" @click="rec.resetSettings()">
        {{ t('party.rec.s.reset') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTeamRecommend } from '~/composables/useTeamRecommend'
import { REC_LIMITS } from '~/utils/teamRecommend'

const NUM_KEYS = ['coreMates', 'threats', 'maxMega'] as const
const { t } = useI18n()
const rec = useTeamRecommend()
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--line-strong);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  align-items: start;
}
.setting {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
}
.setting.wide {
  grid-column: 1 / -1;
}
.setting .field-input,
.setting input[type='range'] {
  width: 100%;
}
.setting input[type='range'] {
  accent-color: var(--accent-2);
}
.setting small {
  font-weight: 400;
  font-size: 11px;
  line-height: 1.3;
}
.foot {
  display: flex;
  justify-content: flex-end;
}
</style>
