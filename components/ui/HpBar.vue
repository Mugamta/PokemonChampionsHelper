<!-- HP 바 (게임처럼 50% 이하 노랑, 20% 이하 빨강) -->
<template>
  <div class="hp">
    <div class="track">
      <div
        class="fill"
        :class="level"
        :style="{ width: Math.max(0, Math.min(100, percent)) + '%' }"
      />
    </div>
    <span v-if="label" class="label num">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ percent: number; label?: string }>()
const level = computed(() => (props.percent > 50 ? 'high' : props.percent > 20 ? 'mid' : 'low'))
</script>

<style scoped>
.hp {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.track {
  height: 8px;
  border-radius: 6px;
  background: var(--well-strong);
  border: 1px solid var(--line);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 6px;
  transition:
    width 0.35s ease,
    background 0.35s;
}
.high {
  background: linear-gradient(90deg, #2fd27d, #6cf0a8);
}
.mid {
  background: linear-gradient(90deg, #f4b82b, #ffd86b);
}
.low {
  background: linear-gradient(90deg, #f0405e, #ff7d93);
}
.label {
  font-size: 12px;
  color: var(--text-2);
}
</style>
