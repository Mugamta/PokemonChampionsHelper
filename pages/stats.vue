<!--
  포켓몬 성능표: 현재 레귤레이션 출전 가능 포켓몬(메가진화 포함)의 내구 / 결정력 / 스피드.
  탭은 주소(?tab=)에 남겨서 공유·새로고침해도 유지. 계산: utils/perfTable.ts, 목록: composables/usePerfList.ts
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('perf.title') }}</h1>
        <p class="page-sub">
          {{
            t('perf.sub', {
              reg: reg.active.value?.id ?? t('regulation.none'),
              n: mons.length,
            })
          }}
        </p>
      </div>
    </div>

    <div class="toolbar">
      <div class="tab-row" role="tablist">
        <button
          v-for="k in TABS"
          :key="k"
          type="button"
          role="tab"
          class="tab-btn"
          :aria-selected="tab === k"
          :class="{ active: tab === k }"
          @click="tab = k"
        >
          {{ t('perf.tab.' + k) }}
        </button>
      </div>
      <input
        v-model="query"
        type="search"
        class="field-input search"
        :placeholder="t('perf.search')"
        :aria-label="t('perf.search')"
      />
    </div>

    <PerfBulkTable v-if="tab === 'bulk'" :mons="mons" :match="match" />
    <PerfPowerTable v-else-if="tab === 'power'" :mons="mons" :match="match" />
    <PerfSpeedTable v-else :mons="mons" :match="match" />
  </div>
</template>

<script setup lang="ts">
import { usePerfList } from '~/composables/usePerfList'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const reg = useRegulation()
const { mons, matcher } = usePerfList()

const TABS = ['bulk', 'power', 'speed'] as const
type Tab = (typeof TABS)[number]
const tab = computed<Tab>({
  get: () => {
    const q = route.query.tab
    return TABS.includes(q as Tab) ? (q as Tab) : 'bulk'
  },
  set: (v) => router.replace({ query: { ...route.query, tab: v } }),
})

const query = ref('')
const match = computed(() => matcher(query.value))
</script>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.search {
  width: min(320px, 100%);
}
</style>
