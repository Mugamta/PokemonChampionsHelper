<template>
  <span
    class="type-badge"
    :class="{ small }"
    :style="{ background: `var(--t-${type})` }"
  >{{ name('types', type) }}</span>
</template>

<script setup lang="ts">
defineProps<{ type: string; small?: boolean }>()
const { name } = useGameData()
</script>

<style scoped>
.type-badge.small { min-width: 40px; padding: 0 6px; font-size: 10px; }
</style>
