<!-- 사용률 통계 종류 전환 (싱글 / 더블) — useUsageKind 공유 상태 -->
<template>
  <span class="usage-kind" role="group" :aria-label="t('usage.kind')">
    <button
      v-for="k in KINDS"
      :key="k"
      type="button"
      class="chip"
      :class="{ active: kind === k }"
      :aria-pressed="kind === k"
      @click="kind = k"
    >
      {{ t('usage.' + k) }}
    </button>
  </span>
</template>

<script setup lang="ts">
import { useUsageKind } from '~/composables/useUsageKind'

const { t } = useI18n()
const kind = useUsageKind()
const KINDS = ['single', 'double'] as const
</script>

<style scoped>
.usage-kind {
  display: inline-flex;
  gap: 4px;
}
</style>
