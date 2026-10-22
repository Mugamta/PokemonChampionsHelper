<!--
  포켓몬 도감: 현재 레귤레이션 출전 가능 포켓몬(메가진화 포함)을 골라 종족값·실능치·내구(도구·특성 반영)와
  배운 기술 전부의 위력·명중·PP·결정력·사용률을 본다. 고른 포켓몬은 주소(?id=)에 남김.
  목록: composables/usePerfList.ts (성능표와 같은 목록), 상세: components/dex/DexDetail.vue
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('dex.title') }}</h1>
        <p class="page-sub">
          {{ t('dex.sub', { reg: reg.active.value?.id ?? t('regulation.none'), n: mons.length }) }}
        </p>
      </div>
    </div>

    <div class="dex-layout">
      <aside class="panel dex-list">
        <input
          v-model="query"
          type="search"
          class="field-input"
          :placeholder="t('perf.search')"
          :aria-label="t('perf.search')"
        />
        <div class="list-scroll">
          <button
            v-for="m in shown"
            :key="m.id"
            type="button"
            class="dex-item"
            :class="{ active: m.id === selected?.id }"
            @click="id = m.id"
          >
            <span class="no num">{{ m.num }}</span>
            <UiPokeSprite :id="m.id" :size="32" />
            <span class="nm">{{ gd.name('pokemon', m.id) }}</span>
          </button>
          <p v-if="!shown.length" class="muted empty">—</p>
        </div>
      </aside>
      <DexDetail v-if="selected" :key="selected.id" :mon="selected" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePerfList } from '~/composables/usePerfList'

const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const route = useRoute()
const router = useRouter()
const { mons, matcher } = usePerfList()

const query = ref('')
const shown = computed(() => {
  const m = matcher(query.value)
  return m ? mons.value.filter((x) => m(x.id)) : mons.value
})
const id = computed<string>({
  get: () => (typeof route.query.id === 'string' ? route.query.id : ''),
  set: (v) => router.replace({ query: { ...route.query, id: v } }),
})
// 주소에 없거나 목록에 없으면 첫 포켓몬
const selected = computed(() => mons.value.find((m) => m.id === id.value) ?? mons.value[0])
</script>

<style scoped>
.dex-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.dex-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  position: sticky;
  top: 70px;
}
.list-scroll {
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dex-item {
  appearance: none;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.dex-item:hover {
  background: var(--hover);
}
.dex-item.active {
  background: var(--panel-3);
  box-shadow: inset 3px 0 0 var(--accent-2);
}
.no {
  width: 30px;
  font-size: 11px;
  color: var(--text-3);
}
.nm {
  font-size: 13px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  padding: 8px;
}
@media (max-width: 900px) {
  .dex-layout {
    grid-template-columns: 1fr;
  }
  .dex-list {
    position: static;
  }
  .list-scroll {
    max-height: 200px;
  }
}
</style>
