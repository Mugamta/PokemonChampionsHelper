<template>
  <span
    class="item-icon"
    :style="{ width: size + 'px', height: size + 'px' }"
    :title="id ? name('items', id) : ''"
  >
    <img
      v-if="id && !failed"
      :src="itemSprite(id)"
      :alt="name('items', id)"
      loading="lazy"
      @error="failed = true"
    >
  </span>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ id?: string | null; size?: number }>(), { id: null, size: 28 })
const { itemSprite, name } = useGameData()
const failed = ref(false)
watch(() => props.id, () => (failed.value = false))
</script>

<style scoped>
.item-icon { display: inline-grid; place-items: center; flex-shrink: 0; }
.item-icon img { width: 100%; height: 100%; object-fit: contain; }
</style>
