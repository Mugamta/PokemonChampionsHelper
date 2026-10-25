<!-- 도구 선택. 메가스톤은 이 포켓몬용 스톤만 보여주고, 다른 슬롯에서 쓰는 도구는 제외 (도구 중복 금지) -->
<template>
  <UiLazyField
    v-if="!live"
    :dirty="!!model"
    :text="gd.name('items', model)"
    :placeholder="t('common.item')"
    clearable
    @activate="activate"
    @clear="model = ''"
  >
    <template v-if="model" #prepend-inner>
      <UiItemIcon :id="model" :size="24" />
    </template>
  </UiLazyField>
  <v-autocomplete
    v-else
    ref="real"
    v-model="selected"
    v-model:menu="menu"
    :items="items"
    item-title="title"
    item-value="value"
    :placeholder="t('common.item')"
    persistent-placeholder
    density="compact"
    variant="solo-filled"
    flat
    hide-details
    clearable
    auto-select-first
    :menu-props="{ maxHeight: 360 }"
  >
    <template #prepend-inner>
      <UiItemIcon v-if="model" :id="model" :size="24" />
    </template>
    <template #item="{ props: p, item }">
      <v-list-item v-bind="p" :title="undefined">
        <div class="opt" :title="item.desc">
          <UiItemIcon :id="item.value" :size="26" />
          <span class="opt-name">{{ item.title }}</span>
          <span v-if="item.mega" class="mega-tag">MEGA</span>
          <span v-if="item.share != null" class="share num">{{ item.share }}%</span>
        </div>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
const model = defineModel<string>({ default: '' })
// 빈 값은 '' 로 저장하지만 Vuetify 에는 null 로 넘긴다 ('' 를 선택된 값으로 봐서 안내 문구가 안 보임)
const selected = computed({
  get: () => model.value || null,
  set: (v: string | null) => (model.value = v ?? ''),
})
// usage: 도구별 사용률 (0~1). 주면 비율을 붙이고 많이 쓴 순으로 위에 (배틀 화면 상대 도구 확정). 메가스톤은 항상 맨 위
const props = defineProps<{
  species?: string
  exclude?: string[]
  usage?: Record<string, number>
}>()
const { t } = useI18n()
const gd = useGameData()

// 처음엔 가벼운 자리표시, 누르거나 포커스하면 진짜 입력칸 (화면 전환 속도, composables/useLazyField.ts)
const { live, menu, real, activate } = useLazyField()

const items = computed(() => {
  const all = gd.data.value?.items || {}
  const ex = new Set(props.exclude || [])
  const ids = Object.values(all)
    .filter(
      (it) =>
        (!it.megaStone || (props.species && it.megaStone[props.species])) &&
        (!ex.has(it.id) || it.id === model.value),
    )
    .map((it) => it.id)
  // 현재 값이 목록 조건에 안 맞아도(다른 포켓몬의 메가스톤 등) 이름으로 보이도록 포함
  if (model.value && !ids.includes(model.value)) ids.push(model.value)
  return gd
    .options('items', ids)
    .map((o) => {
      const u = props.usage?.[o.value]
      return {
        ...o,
        mega: !!all[o.value]?.megaStone,
        desc: gd.text('items', o.value),
        usage: u ?? -1,
        share: u == null ? null : Number((u * 100).toFixed(1)),
      }
    })
    .sort((a, b) => Number(b.mega) - Number(a.mega) || b.usage - a.usage)
})
</script>

<style scoped>
.opt {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.opt-name {
  flex: 1;
}
.share {
  font-size: 11px;
  color: var(--text-3);
}
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
