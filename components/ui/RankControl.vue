<!-- 랭크 표시 + 조절 (▲▲▼ 화살표 6칸) -->
<template>
  <div class="rank-grid">
    <div v-for="k in BOOST_KEYS" :key="k" class="rank-row">
      <span class="rank-name">{{ t('stat.' + k) }}</span>
      <span class="arrows" :class="{ neg: (boosts[k] || 0) < 0 }">
        <span
          v-for="n in 6"
          :key="n"
          class="arrow"
          :class="{ on: n <= Math.abs(boosts[k] || 0) }"
          >{{ (boosts[k] || 0) < 0 ? '▼' : '▲' }}</span
        >
      </span>
      <span class="val num" :class="{ pos: (boosts[k] || 0) > 0, neg: (boosts[k] || 0) < 0 }"
        >{{ (boosts[k] || 0) > 0 ? '+' : '' }}{{ boosts[k] || 0 }}</span
      >
      <span class="btns">
        <button
          type="button"
          class="rb"
          :disabled="(boosts[k] || 0) >= 6"
          @click="emit('change', k, 1)"
        >
          +
        </button>
        <button
          type="button"
          class="rb"
          :disabled="(boosts[k] || 0) <= -6"
          @click="emit('change', k, -1)"
        >
          −
        </button>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BOOST_KEYS, type BoostKey, type BoostTable } from '~/utils/types'

defineProps<{ boosts: Partial<BoostTable> }>()
const emit = defineEmits<{ change: [key: BoostKey, delta: number] }>()
const { t } = useI18n()
</script>

<style scoped>
.rank-grid {
  display: grid;
  gap: 3px;
}
.rank-row {
  display: grid;
  grid-template-columns: 48px 1fr 28px auto;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.rank-name {
  color: var(--text-2);
}
.arrows {
  display: flex;
  gap: 1px;
  font-size: 10px;
  color: var(--rank-off);
}
.arrow.on {
  color: var(--good);
}
.arrows.neg .arrow.on {
  color: var(--bad);
}
.val {
  text-align: right;
  font-weight: 700;
  color: var(--text-3);
}
.val.pos {
  color: var(--good);
}
.val.neg {
  color: var(--bad);
}
.btns {
  display: flex;
  gap: 2px;
}
.rb {
  width: 22px;
  height: 20px;
  border-radius: 5px;
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--text);
  cursor: pointer;
  line-height: 1;
}
.rb:disabled {
  opacity: 0.3;
  cursor: default;
}
@media (pointer: coarse) {
  .rank-grid {
    gap: 6px;
  }
  .rb {
    width: 34px;
    height: 30px;
    font-size: 15px;
  }
}
.rb:hover:not(:disabled) {
  border-color: var(--accent-2);
}
</style>
