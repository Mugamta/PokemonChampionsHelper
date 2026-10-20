<!-- 성능표 랭크 (−6 ~ +6). label: 어떤 능력치 랭크인지 (B·D / A·C / S) -->
<template>
  <span class="rank" :class="{ on: rank !== 0 }">
    <span class="name">{{ label }}</span>
    <button type="button" class="rb" :disabled="rank <= -6" @click="rank -= 1">−</button>
    <span class="val num">{{ rank > 0 ? '+' : '' }}{{ rank }}</span>
    <button type="button" class="rb" :disabled="rank >= 6" @click="rank += 1">+</button>
    <button v-if="rank !== 0" type="button" class="reset" @click="rank = 0">0</button>
  </span>
</template>

<script setup lang="ts">
defineProps<{ label: string }>()
const rank = defineModel<number>({ default: 0 })
</script>

<style scoped>
.rank {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}
.name {
  font-weight: 700;
  margin-right: 2px;
}
.val {
  min-width: 24px;
  text-align: center;
  font-weight: 800;
}
.rank.on .val {
  color: var(--accent-2);
}
.rb,
.reset {
  appearance: none;
  height: 22px;
  min-width: 22px;
  border-radius: 6px;
  border: 1px solid var(--line-strong);
  background: var(--faint);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.reset {
  font-size: 10px;
  color: var(--text-3);
}
.rb:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
