<!-- 기술 선택 (타입/분류/위력 표시). 선택된 기술 아래에 정보 한 줄 -->
<template>
  <div class="move-picker">
    <v-autocomplete
      v-model="model"
      :items="items"
      item-title="title"
      item-value="value"
      :placeholder="t('common.move')"
      density="compact"
      variant="solo-filled"
      flat
      hide-details
      clearable
      auto-select-first
      :disabled="disabled"
      :menu-props="{ maxHeight: 380 }"
    >
      <template #prepend-inner>
        <span
          v-if="move"
          class="type-dot"
          :style="{ background: `var(--t-${move.type})` }"
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
            <UiTypeBadge
              :type="item.raw.type"
              small
            />
            <span class="opt-name">{{ item.raw.title }}</span>
            <UiCategoryBadge :category="item.raw.category" />
            <span class="opt-pow num">{{ item.raw.power || '—' }}</span>
          </div>
        </v-list-item>
      </template>
    </v-autocomplete>
    <div
      v-if="move && showInfo"
      class="info"
      :title="gd.text('moves', move.id)"
    >
      <UiTypeBadge
        :type="move.type"
        small
      />
      <UiCategoryBadge :category="move.category" />
      <span v-if="move.power">{{ t('common.power') }} <b class="num">{{ move.power }}</b></span>
      <span>{{ t('common.accuracy') }} <b class="num">{{ move.accuracy ?? '—' }}</b></span>
      <span>{{ t('common.pp') }} <b class="num">{{ move.pp }}{{ move.ppEstimated ? '*' : '' }}</b></span>
      <span
        v-if="move.priority"
        class="prio"
      >{{ t('common.priority') }} <b class="num">{{ move.priority > 0 ? '+' : '' }}{{ move.priority }}</b></span>
      <span
        v-if="power != null"
        class="decisive"
      >{{ t('common.decisive') }} <b class="num">{{ power.toLocaleString() }}</b></span>
    </div>
  </div>
</template>

<script setup lang="ts">
const model = defineModel<string>({ default: '' })
const props = defineProps<{ learnset: string[]; exclude?: string[]; disabled?: boolean; power?: number | null; showInfo?: boolean }>()
const { t } = useI18n()
const gd = useGameData()

const move = computed(() => gd.move(model.value))
const items = computed(() => {
  const ex = new Set((props.exclude || []).filter(Boolean))
  const ids = props.learnset.filter((m) => !ex.has(m) || m === model.value)
  // 습득 기술에 없는 값(예전 데이터 등)도 이름으로 보이도록 포함
  if (model.value && gd.move(model.value) && !ids.includes(model.value)) ids.push(model.value)
  return gd
    .options('moves', ids)
    .map((o) => {
      const m = gd.move(o.value)!
      return { ...o, type: m.type, category: m.category, power: m.power, desc: gd.text('moves', o.value) }
    })
})
</script>

<style scoped>
.move-picker { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.type-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.opt { display: flex; align-items: center; gap: 8px; width: 100%; }
.opt-name { flex: 1; }
.opt-pow { width: 28px; text-align: right; color: var(--text-2); font-size: 12px; }
.info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 11px;
  color: var(--text-3);
  padding: 0 4px;
}
.info b { color: var(--text-2); font-weight: 700; }
.prio { color: var(--accent-2); font-weight: 700; }
.decisive { margin-left: auto; color: var(--text-2); }
.decisive b { color: var(--accent); }
</style>
