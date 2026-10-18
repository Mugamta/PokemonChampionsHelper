<!-- 포켓몬 선택 (스프라이트 + 타입 표시, 이름 검색) -->
<template>
  <v-autocomplete
    v-model="model"
    :items="items"
    item-title="title"
    item-value="value"
    :placeholder="label ?? t('common.pokemon')"
    density="compact"
    variant="solo-filled"
    flat
    hide-details
    clearable
    auto-select-first
    :menu-props="{ maxHeight: 360 }"
    class="species-picker"
  >
    <template #item="{ props: p, item }">
      <v-list-item
        v-bind="p"
        :title="undefined"
      >
        <div class="opt">
          <UiPokeSprite
            :id="item.raw.value"
            :size="34"
          />
          <span class="opt-name">{{ item.raw.title }}</span>
          <span class="opt-types">
            <UiTypeBadge
              v-for="ty in item.raw.types"
              :key="ty"
              :type="ty"
              small
            />
          </span>
        </div>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
const model = defineModel<string>({ default: '' })
const props = defineProps<{ ids: string[]; exclude?: string[]; label?: string }>()
const { t } = useI18n()
const gd = useGameData()

const items = computed(() => {
  const ex = new Set(props.exclude || [])
  return gd
    .options('pokemon', props.ids.filter((id) => !ex.has(id) || id === model.value))
    .map((o) => ({ ...o, types: gd.pokemon(o.value)?.types || [] }))
})
</script>

<style scoped>
.opt { display: flex; align-items: center; gap: 8px; width: 100%; }
.opt-name { flex: 1; font-weight: 600; }
.opt-types { display: flex; gap: 3px; }
</style>
