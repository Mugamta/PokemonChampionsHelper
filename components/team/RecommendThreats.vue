<!-- 추천 파티 다이얼로그: 멤버들에게 두루 강한 상대 목록 (물러나게 하는 멤버와 비율 → 가장 잘 맡는 멤버) -->
<template>
  <div v-if="threats.length" class="threats">
    <span class="section-label" :title="t('party.rec.threatsHint')">{{ title }}</span>
    <ul>
      <li v-for="th in threats" :key="th.id" class="threat small">
        <TeamRecommendChip :id="th.id" :disabled="!canAdd?.(th.id)" @add="emit('add', $event)" />
        <span class="beats">
          <span v-for="[m, v] in th.beats" :key="m"
            >{{ gd.name('pokemon', m) }} <span class="bad-text">{{ pct(v) }}</span></span
          >
        </span>
        <!-- 맡는 멤버는 한 덩어리로 (줄이 길면 통째로 다음 줄) -->
        <span class="cover">
          <span class="arrow">→</span>
          <template v-if="th.by">
            <UiPokeSprite :id="th.by" :size="24" />
            <span>{{
              t('party.rec.coveredBy', { name: gd.name('pokemon', th.by), pct: pct(th.byOut) })
            }}</span>
          </template>
          <span v-else class="muted">{{ t('party.rec.uncovered') }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { RecThreat } from '~/utils/teamRecommend'

defineProps<{ threats: RecThreat[]; title: string; canAdd?: (id: string) => boolean }>()
const emit = defineEmits<{ add: [id: string] }>()
const { t } = useI18n()
const gd = useGameData()
const pct = (v: number) => `${Math.round(v * 100)}%`
</script>

<style scoped>
.threats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.small {
  font-size: 12px;
}
.threat {
  display: flex;
  align-items: center;
  gap: 6px 8px;
  flex-wrap: wrap;
}
.beats {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  color: var(--text-2);
}
.bad-text {
  font-weight: 700;
}
.cover {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.arrow {
  color: var(--text-3);
}
</style>
