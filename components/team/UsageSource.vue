<!-- 사용률 통계 출처·시점 한 줄 (현재 레귤레이션). 통계가 없으면 규칙 배치 안내 -->
<template>
  <p class="usage-src">
    <template v-if="src">
      {{
        t('usage.source', {
          kind: t('usage.' + src.kind),
          format: src.format,
          month: src.month,
          battles: src.battles.toLocaleString(),
        })
      }}
      <a :href="src.url" target="_blank" rel="noopener">smogon.com/stats</a>
    </template>
    <template v-else>{{ t('usage.none') }}</template>
  </p>
</template>

<script setup lang="ts">
import type { UsageKind } from '~/utils/autoSet'

const props = defineProps<{ kind?: UsageKind }>()
const { t } = useI18n()
const src = useAutoSet(() => props.kind).source
</script>

<style scoped>
.usage-src {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-3);
}
.usage-src a {
  color: var(--text-2);
}
</style>
