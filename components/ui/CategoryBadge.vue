<!-- 기술 분류 (물리/특수/변화) 작은 아이콘 -->
<template>
  <span class="cat" :class="category" :title="t('category.' + category)">{{
    t('category.' + category)
  }}</span>
</template>

<script setup lang="ts">
defineProps<{ category: string }>()
const { t } = useI18n()
</script>

<style scoped>
.cat {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 4px;
  line-height: 16px;
  white-space: nowrap;
}
.physical,
.special,
.status {
  border: 1px solid var(--line-strong);
  color: var(--text-2);
  line-height: 14px;
}
</style>
