<!-- 도구 선택. 메가스톤은 이 포켓몬용 스톤만 보여주고, 다른 슬롯에서 쓰는 도구는 제외 (도구 중복 금지) -->
<template>
  <v-autocomplete
    v-model="model"
    :items="items"
    item-title="title"
    item-value="value"
    :placeholder="t('common.item')"
    density="compact"
    variant="solo-filled"
    flat
    hide-details
    clearable
    auto-select-first
    :menu-props="{ maxHeight: 360 }"
  >
    <template #prepend-inner>
      <UiItemIcon
        v-if="model"
        :id="model"
        :size="24"
      />
    </template>
    <template #item="{ props: p, item }">
      <v-list-item
        v-bind="p"
        :title="undefined"
      >
        <div
          class="opt"
          :title="item.raw.desc"
        >
          <UiItemIcon
            :id="item.raw.value"
            :size="26"
          />
          <span class="opt-name">{{ item.raw.title }}</span>
          <span
            v-if="item.raw.mega"
            class="mega-tag"
          >MEGA</span>
        </div>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
const model = defineModel<string>({ default: '' })
const props = defineProps<{ species?: string; exclude?: string[] }>()
const { t } = useI18n()
const gd = useGameData()

const items = computed(() => {
  const all = gd.data.value?.items || {}
  const ex = new Set(props.exclude || [])
  const ids = Object.values(all)
    .filter((it) => (!it.megaStone || (props.species && it.megaStone[props.species])) && (!ex.has(it.id) || it.id === model.value))
    .map((it) => it.id)
  // 현재 값이 목록 조건에 안 맞아도(다른 포켓몬의 메가스톤 등) 이름으로 보이도록 포함
  if (model.value && !ids.includes(model.value)) ids.push(model.value)
  return gd
    .options('items', ids)
    .map((o) => ({ ...o, mega: !!all[o.value]?.megaStone, desc: gd.text('items', o.value) }))
    .sort((a, b) => Number(b.mega) - Number(a.mega))
})
</script>

<style scoped>
.opt { display: flex; align-items: center; gap: 8px; width: 100%; }
.opt-name { flex: 1; }
.mega-tag {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 4px;
  background: linear-gradient(90deg, #ff6ad5, #8c6cff);
  color: #fff;
}
</style>
