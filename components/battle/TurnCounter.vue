<!-- 경과 턴 표시 + 조절 (최대치에서 + 를 누르면 8턴으로 연장) -->
<template>
  <div class="counter">
    <button
      type="button"
      class="cb"
      :disabled="infinite"
      @click="emit('adjust', -1)"
    >
      −
    </button>
    <span class="num">{{ infinite ? '∞' : `${counter.cur}/${counter.total}` }}</span>
    <button
      type="button"
      class="cb"
      :disabled="infinite"
      @click="emit('adjust', 1)"
    >
      +
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ counter: { cur: number; total: number }; infinite?: boolean }>()
const emit = defineEmits<{ adjust: [delta: number] }>()
</script>

<style scoped>
.counter { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; }
.cb {
  width: 24px; height: 22px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--text);
  cursor: pointer;
}
.cb:disabled { opacity: 0.35; cursor: default; }
</style>
