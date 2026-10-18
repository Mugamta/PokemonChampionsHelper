<!-- 기술 분류 (물리/특수/변화) 작은 아이콘 -->
<template>
  <span
    class="cat"
    :class="category"
    :title="t('category.' + category)"
  >{{ t('category.' + category) }}</span>
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
.physical { background: #c92112; color: #ffe7d6; }
.special { background: #4f5870; color: #dfe8ff; }
.status { background: #8c888c; color: #fff; }
</style>
