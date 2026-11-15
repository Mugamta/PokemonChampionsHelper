<!-- 추천 파티 다이얼로그의 포켓몬 칩 (스프라이트 + 이름 + 비율). 누르면 추가 (disabled 면 그냥 표시) -->
<template>
  <button
    type="button"
    class="rchip"
    :class="{ static: disabled }"
    :disabled="disabled"
    :title="disabled ? undefined : t('party.rec.addTip')"
    @click="emit('add', id)"
  >
    <UiPokeSprite :id="id" :size="22" />
    <span class="nm">{{ gd.name('pokemon', id) }}</span>
    <span v-if="ratio != null" class="pc" :class="tone">{{ Math.round(ratio * 100) }}%</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{ id: string; ratio?: number; disabled?: boolean; tone?: 'bad' | 'good' }>()
const emit = defineEmits<{ add: [id: string] }>()
const { t } = useI18n()
const gd = useGameData()
</script>

<style scoped>
.rchip {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px 1px 2px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--faint);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.rchip:hover:not(:disabled) {
  border-color: var(--accent-2);
  background: var(--hover);
}
.rchip.static {
  cursor: default;
  opacity: 0.7;
}
.nm {
  font-weight: 600;
}
.pc {
  color: var(--text-2);
}
.pc.bad {
  color: var(--bad);
  font-weight: 700;
}
.pc.good {
  color: var(--good);
  font-weight: 700;
}
</style>
