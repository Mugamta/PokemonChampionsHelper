<!--
  패치 내역의 포켓몬 목록: 도감 번호 순, grouped 면 세대별로 줄을 나눔. 누르면 도감(포켓몬 탭)으로.
-->
<template>
  <div v-if="grouped" class="gens">
    <div v-for="g in groups" :key="g.gen" class="gen-row">
      <span class="gen muted">{{ t('patch.gen', { n: g.gen }) }}</span>
      <div class="mons">
        <NuxtLink
          v-for="id in g.ids"
          :key="id"
          class="mon link"
          :to="{ path: '/dex', query: { id } }"
        >
          <UiPokeSprite :id="id" :size="28" />{{ gd.name('pokemon', id) }}
        </NuxtLink>
      </div>
    </div>
  </div>
  <div v-else class="mons">
    <NuxtLink v-for="id in sorted" :key="id" class="mon link" :to="{ path: '/dex', query: { id } }">
      <UiPokeSprite :id="id" :size="28" />{{ gd.name('pokemon', id) }}
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { groupByGeneration } from '~/utils/regulationData'

const props = defineProps<{ ids: readonly string[]; grouped?: boolean }>()
const { t } = useI18n()
const gd = useGameData()

const numOf = (id: string) => gd.pokemon(id)?.num ?? 9999
const groups = computed(() => groupByGeneration(props.ids, numOf))
const sorted = computed(() => [...props.ids].sort((a, b) => numOf(a) - numOf(b)))
</script>

<style scoped>
.gens {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.gen-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.gen {
  flex: none;
  min-width: 48px;
  font-size: 11px;
  font-weight: 700;
  line-height: 28px;
}
.mons {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  min-width: 0;
}
.mon {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  line-height: 28px;
  white-space: nowrap;
}
.link {
  color: var(--text);
  text-decoration: none;
  border-radius: 6px;
  padding-right: 4px;
}
.link:hover {
  background: var(--hover);
}
</style>
