<!-- 포켓몬 선택 (스프라이트 + 타입 표시, 이름 검색) -->
<template>
  <UiLazyField
    v-if="!live"
    :dirty="!!model"
    :text="gd.name('pokemon', model)"
    :placeholder="label ?? t('common.pokemon')"
    :prepend-icon="mdiMagnify"
    clearable
    class="species-picker"
    @activate="activate"
    @clear="model = ''"
  />
  <v-autocomplete
    v-else
    ref="real"
    v-model="selected"
    v-model:menu="menu"
    :items="items"
    item-title="title"
    item-value="value"
    :placeholder="label ?? t('common.pokemon')"
    persistent-placeholder
    density="compact"
    variant="solo-filled"
    flat
    hide-details
    clearable
    auto-select-first
    :prepend-inner-icon="mdiMagnify"
    :menu-props="{ maxHeight: 360 }"
    class="species-picker"
  >
    <template #item="{ props: p, item }">
      <v-list-item v-bind="p" :title="undefined">
        <div class="opt">
          <UiPokeSprite :id="item.value" :size="34" />
          <span class="opt-name">{{ item.title }}</span>
          <span class="opt-types">
            <UiTypeBadge v-for="ty in item.types" :key="ty" :type="ty" small />
          </span>
        </div>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
const model = defineModel<string>({ default: '' })
// 빈 값은 '' 로 저장하지만 Vuetify 에는 null 로 넘긴다 ('' 를 선택된 값으로 봐서 안내 문구가 안 보임)
const selected = computed({
  get: () => model.value || null,
  set: (v: string | null) => (model.value = v ?? ''),
})
const props = defineProps<{ ids: string[]; exclude?: string[]; label?: string }>()
const { t } = useI18n()
const gd = useGameData()

// 처음엔 가벼운 자리표시, 누르거나 포커스하면 진짜 입력칸 (화면 전환 속도, composables/useLazyField.ts)
const { live, menu, real, activate } = useLazyField()

const items = computed(() => {
  const ex = new Set(props.exclude || [])
  return gd
    .options(
      'pokemon',
      props.ids.filter((id) => !ex.has(id) || id === model.value),
    )
    .map((o) => ({ ...o, types: gd.pokemon(o.value)?.types || [] }))
})
</script>

<style scoped>
/* 카드 안에서 바로 눈에 띄도록 다른 입력칸보다 강조 (진한 테두리 + 돋보기 + 굵은 이름, 포커스 때 청록) */
.species-picker :deep(.v-field) {
  background: var(--field-bg) !important;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text-2) 55%, transparent);
}
.species-picker :deep(.v-field--focused) {
  box-shadow: inset 0 0 0 2px var(--accent-2);
}
.species-picker :deep(.v-field__input) {
  font-weight: 700;
  font-size: 15px;
}
.species-picker :deep(.v-field__prepend-inner .v-icon) {
  color: var(--text-2);
  opacity: 0.9;
}
.opt {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.opt-name {
  flex: 1;
  font-weight: 600;
}
.opt-types {
  display: flex;
  gap: 3px;
}
</style>
