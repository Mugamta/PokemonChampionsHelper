<!--
  포켓몬 도감: 현재 레귤레이션 출전 가능 포켓몬(메가진화 포함)을 골라 종족값·실능치·내구(도구·특성 반영)와
  배운 기술 전부의 위력·명중·PP·결정력·사용률을 본다. 고른 포켓몬은 주소(?id=)에 남김.
  목록: composables/usePerfList.ts (성능표와 같은 목록), 상세: components/dex/DexDetail.vue
  기술 탭(?tab=moves&move=): 출전 가능 포켓몬이 배우는 기술 전부 — 설명·부가효과·PP·배우는 포켓몬
  (components/dex/DexMoveDetail.vue)
  도구 탭(?tab=items&item=): 현재 레귤레이션 도구 전부 — 설명·상점 가격·채용한 포켓몬 (components/dex/DexItemDetail.vue)
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('dex.title') }}</h1>
        <p class="page-sub">
          <template v-if="tab === 'moves'">
            {{ t('dex.mv.sub', { reg: regId, n: moveList.length }) }}
          </template>
          <template v-else-if="tab === 'items'">
            {{ t('dex.it.sub', { reg: regId, n: itemList.length }) }}
          </template>
          <template v-else>{{ t('dex.sub', { reg: regId, n: mons.length }) }}</template>
        </p>
      </div>
    </div>

    <div class="tab-row dex-tabs" role="tablist" :aria-label="t('dex.title')">
      <button
        v-for="k in TABS"
        :key="k"
        type="button"
        role="tab"
        class="tab-btn"
        :class="{ active: tab === k }"
        :aria-selected="tab === k"
        @click="tab = k"
      >
        {{ t('dex.tab.' + k) }}
      </button>
    </div>

    <div v-if="tab === 'items'" class="dex-layout">
      <aside class="panel dex-list">
        <input
          v-model="itemQuery"
          type="search"
          class="field-input"
          :placeholder="t('dex.it.search')"
          :aria-label="t('dex.it.search')"
        />
        <select v-model="itemCat" class="field-input filter-one" :aria-label="t('dex.it.category')">
          <option value="">{{ t('dex.it.allCats') }}</option>
          <option v-for="c in ITEM_CATEGORIES" :key="c" :value="c">
            {{ t('dex.it.cat.' + c) }}
          </option>
        </select>
        <div ref="itemListEl" class="list-scroll">
          <button
            v-for="it in shownItems"
            :key="it.id"
            type="button"
            class="dex-item item-row"
            :class="{ active: it.id === selectedItem?.id }"
            @click="itemId = it.id"
          >
            <UiItemIcon :id="it.id" :size="24" />
            <span class="nm grow">{{ gd.name('items', it.id) }}</span>
            <span class="pw num">{{ it.price ?? '' }}</span>
          </button>
          <p v-if="!shownItems.length" class="muted empty">—</p>
        </div>
      </aside>
      <DexItemDetail v-if="selectedItem" :key="selectedItem.id" :item="selectedItem" />
    </div>

    <div v-else-if="tab === 'moves'" class="dex-layout">
      <aside class="panel dex-list">
        <input
          v-model="moveQuery"
          type="search"
          class="field-input"
          :placeholder="t('dex.mv.search')"
          :aria-label="t('dex.mv.search')"
        />
        <div class="filters">
          <select v-model="moveType" class="field-input" :aria-label="t('perf.col.type')">
            <option value="">{{ t('dex.mv.allTypes') }}</option>
            <option v-for="ty in TYPE_ORDER" :key="ty" :value="ty">
              {{ gd.name('types', ty) }}
            </option>
          </select>
          <select v-model="moveCat" class="field-input" :aria-label="t('dex.mv.category')">
            <option value="">{{ t('dex.mv.allCats') }}</option>
            <option v-for="c in CATS" :key="c" :value="c">{{ t('category.' + c) }}</option>
          </select>
        </div>
        <div ref="moveListEl" class="list-scroll">
          <button
            v-for="m in shownMoves"
            :key="m.id"
            type="button"
            class="dex-item"
            :class="{ active: m.id === selectedMove?.id }"
            @click="moveId = m.id"
          >
            <span class="type-dot" :style="{ background: `var(--t-${m.type})` }" />
            <span class="nm grow">{{ gd.name('moves', m.id) }}</span>
            <span class="pw num">{{ m.power || '' }}</span>
          </button>
          <p v-if="!shownMoves.length" class="muted empty">—</p>
        </div>
      </aside>
      <DexMoveDetail
        v-if="selectedMove"
        :key="selectedMove.id"
        :move="selectedMove"
        :learners="learners.get(selectedMove.id) ?? []"
      />
    </div>

    <div v-else class="dex-layout">
      <aside class="panel dex-list">
        <input
          v-model="query"
          type="search"
          class="field-input"
          :placeholder="t('perf.search')"
          :aria-label="t('perf.search')"
        />
        <div ref="listEl" class="list-scroll">
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
      <DexDetail v-if="selected" :key="selected.id" :mon="selected" @move="openMove" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePerfList } from '~/composables/usePerfList'
import { ITEM_CATEGORIES, itemCategory } from '~/utils/itemInfo'
import { learnerMap } from '~/utils/moveInfo'
import { TYPE_ORDER } from '~/utils/typeCheck'
import type { Item, Move } from '~/utils/types'

const { t, locale } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const route = useRoute()
const router = useRouter()
const { mons, matcher } = usePerfList()

const regId = computed(() => reg.active.value?.id ?? t('regulation.none'))

// ── 탭 (포켓몬 / 기술 / 도구) ─────────────
const TABS = ['pokemon', 'moves', 'items'] as const
type Tab = (typeof TABS)[number]
const tab = computed<Tab>({
  get: () => TABS.find((k) => k === route.query.tab) ?? 'pokemon',
  set: (v) => router.replace({ query: { ...route.query, tab: v === 'pokemon' ? undefined : v } }),
})

// 다른 화면(성능표·첫 화면)에서 넘어오면 목록에서 고른 항목이 보이게 (목록 안에서만 스크롤)
const scrollToActive = async (box: HTMLElement | null) => {
  await nextTick()
  const el = box?.querySelector<HTMLElement>('.dex-item.active')
  if (!box || !el) return
  const top = el.offsetTop - box.offsetTop
  if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight)
    box.scrollTop = top - box.clientHeight / 2 + el.offsetHeight / 2
}

// ── 포켓몬 ─────────────
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

const listEl = ref<HTMLElement | null>(null)
watch(
  () => [selected.value?.id, tab.value],
  () => scrollToActive(listEl.value),
  { immediate: true, flush: 'post' },
)

// ── 기술 ─────────────
// 출전 가능 포켓몬(메가 제외 — 습득 기술이 원종과 같음)이 배우는 기술 → 배우는 포켓몬
const learners = computed(() =>
  learnerMap(mons.value.map((m) => ({ id: m.id, learnset: m.learnset, mega: !!m.form.mega }))),
)
const moveList = computed(() =>
  [...learners.value.keys()]
    .map((mid) => gd.move(mid))
    .filter((m): m is Move => !!m)
    .sort((a, b) => gd.name('moves', a.id).localeCompare(gd.name('moves', b.id), locale.value)),
)
const CATS = ['physical', 'special', 'status'] as const
const moveQuery = ref('')
const moveType = ref('')
const moveCat = ref('')
// 검색: 현재 언어 이름 또는 id (공백·대소문자 무시)
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.()]/g, '')
const shownMoves = computed(() => {
  const q = norm(moveQuery.value)
  return moveList.value.filter(
    (m) =>
      (!moveType.value || m.type === moveType.value) &&
      (!moveCat.value || m.category === moveCat.value) &&
      (!q || norm(gd.name('moves', m.id)).includes(q) || m.id.includes(q)),
  )
})
const moveId = computed<string>({
  get: () => (typeof route.query.move === 'string' ? route.query.move : ''),
  set: (v) => router.replace({ query: { ...route.query, move: v } }),
})
const selectedMove = computed(
  () => moveList.value.find((m) => m.id === moveId.value) ?? moveList.value[0],
)

const moveListEl = ref<HTMLElement | null>(null)
watch(
  () => [selectedMove.value?.id, tab.value],
  () => scrollToActive(moveListEl.value),
  { immediate: true, flush: 'post' },
)

// ── 도구 ─────────────
// 현재 레귤레이션 도구 (이름 순)
const itemList = computed<Item[]>(() =>
  Object.values(gd.data.value?.items ?? {}).sort((a, b) =>
    gd.name('items', a.id).localeCompare(gd.name('items', b.id), locale.value),
  ),
)
const itemQuery = ref('')
const itemCat = ref('')
const shownItems = computed(() => {
  const q = norm(itemQuery.value)
  return itemList.value.filter(
    (it) =>
      (!itemCat.value || itemCategory(it) === itemCat.value) &&
      (!q || norm(gd.name('items', it.id)).includes(q) || it.id.includes(q)),
  )
})
const itemId = computed<string>({
  get: () => (typeof route.query.item === 'string' ? route.query.item : ''),
  set: (v) => router.replace({ query: { ...route.query, item: v } }),
})
const selectedItem = computed(
  () => itemList.value.find((it) => it.id === itemId.value) ?? itemList.value[0],
)

const itemListEl = ref<HTMLElement | null>(null)
watch(
  () => [selectedItem.value?.id, tab.value],
  () => scrollToActive(itemListEl.value),
  { immediate: true, flush: 'post' },
)

// 포켓몬 기술표에서 기술 이름을 누르면 기술 탭으로 (검색·거르기는 풀어서 목록에 보이게)
const openMove = (mid: string) => {
  moveQuery.value = ''
  moveType.value = ''
  moveCat.value = ''
  router.push({ query: { ...route.query, tab: 'moves', move: mid } })
}
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
/* 목록이 300개가 넘어서 화면 밖 항목은 레이아웃·그리기를 건너뛴다 (높이 = 스프라이트 32 + 위아래 여백 2) */
.dex-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 36px;
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
.dex-tabs {
  margin-bottom: 12px;
}
.filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.filters .field-input {
  min-width: 0;
  font-size: 12px;
}
/* 기술 목록 줄 (스프라이트가 없어서 낮음) */
.type-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.dex-item:has(.type-dot) {
  contain-intrinsic-size: auto 26px;
  padding: 4px 6px;
}
/* 도구 목록 줄 (아이콘 24) */
.dex-item.item-row {
  contain-intrinsic-size: auto 28px;
}
.filter-one {
  font-size: 12px;
}
.grow {
  flex: 1;
}
.pw {
  font-size: 11px;
  color: var(--text-3);
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
