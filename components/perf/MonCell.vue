<!-- 성능표의 포켓몬 칸: 스프라이트 · 도감 번호 · 이름 · 신규 배지 · 타입. 누르면 그 포켓몬의 도감으로 -->
<template>
  <NuxtLink :to="{ path: '/dex', query: { id: mon.id } }" class="mon-cell" :title="t('home.toDex')">
    <UiPokeSprite :id="mon.id" :size="36" />
    <div class="txt">
      <span class="top">
        <span class="no num">#{{ mon.num }}</span>
        <span class="nm">{{ gd.name('pokemon', shownId) }}</span>
        <span v-if="mon.isNew" class="new">{{ t('perf.new') }}</span>
      </span>
      <UiTypeGroup :types="mon[form ?? 'form'].types" small />
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { PerfMon } from '~/composables/usePerfList'

// form: 이 표에서 계산에 쓴 폼. 원종과 다르면 그 폼 이름으로 (예: 킬가르도 (블레이드폼))
const props = defineProps<{ mon: PerfMon; form?: 'form' | 'atkForm' }>()
const { t } = useI18n()
const gd = useGameData()
const shownId = computed(() => props.mon[props.form ?? 'form'].id)
</script>

<style scoped>
.mon-cell {
  color: inherit;
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.top {
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}
.no {
  font-size: 10px;
  color: var(--text-3);
}
.nm {
  font-weight: 700;
  font-size: 13px;
}
.mon-cell:hover .nm {
  text-decoration: underline;
  color: var(--accent-2);
}
.new {
  font-size: 9px;
  font-weight: 800;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
}
</style>
