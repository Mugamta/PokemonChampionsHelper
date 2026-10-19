<!-- 성격 선택: 이름 | 올라가는 능력치 | 내려가는 능력치 를 칸으로 나눠 목록에서 줄이 맞게 -->
<template>
  <v-select
    v-model="model"
    :items="items"
    item-title="title"
    item-value="value"
    density="compact"
    variant="solo-filled"
    flat
    hide-details
    :menu-props="{ maxHeight: 420 }"
    class="nature-picker"
  >
    <template #selection="{ item }">
      <span class="nat">
        <span class="nat-name">{{ (item as NatureItem).title }}</span>
        <span v-if="(item as NatureItem).plus" class="nat-up"
          >{{ (item as NatureItem).plus }}↑</span
        >
        <span v-if="(item as NatureItem).minus" class="nat-down"
          >{{ (item as NatureItem).minus }}↓</span
        >
      </span>
    </template>
    <template #item="{ props: p, item }">
      <v-list-item v-bind="p" :title="undefined">
        <div class="opt">
          <span class="opt-name">{{ (item as NatureItem).title }}</span>
          <span class="opt-up">{{
            (item as NatureItem).plus ? (item as NatureItem).plus + '↑' : ''
          }}</span>
          <span class="opt-down">{{
            (item as NatureItem).minus ? (item as NatureItem).minus + '↓' : ''
          }}</span>
        </div>
      </v-list-item>
    </template>
  </v-select>
</template>

<script setup lang="ts">
import type { BoostKey } from '~/utils/types'

interface NatureItem {
  value: string
  title: string
  plus: string // 'A' 등 짧은 능력치 이름 (무보정이면 '')
  minus: string
}

const model = defineModel<string>({ default: 'serious' })
const { t } = useI18n()
const gd = useGameData()

const ORDER: BoostKey[] = ['atk', 'def', 'spa', 'spd', 'spe']
// 무보정 1개 + 올라가는 능력치(A→S) 순, 같은 그룹은 내려가는 능력치 순
const items = computed<NatureItem[]>(() => {
  const boosted = Object.values(gd.data.value?.natures || {})
    .filter((n) => n.plus && n.minus)
    .sort(
      (a, b) =>
        ORDER.indexOf(a.plus!) * 10 +
        ORDER.indexOf(a.minus!) -
        (ORDER.indexOf(b.plus!) * 10 + ORDER.indexOf(b.minus!)),
    )
    .map((n) => ({
      value: n.id,
      title: gd.name('natures', n.id),
      plus: t('stat.short.' + n.plus),
      minus: t('stat.short.' + n.minus),
    }))
  return [{ value: 'serious', title: t('common.neutralNature'), plus: '', minus: '' }, ...boosted]
})
</script>

<style scoped>
.nat {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.nat-name {
  font-weight: 600;
}
.nat-up,
.opt-up {
  color: var(--nature-up);
  font-weight: 700;
  font-size: 12px;
}
.nat-down,
.opt-down {
  color: var(--nature-down);
  font-weight: 700;
  font-size: 12px;
}
/* 목록: 이름 | ↑ | ↓ 고정 폭 칸 */
.opt {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px 30px;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.opt-up,
.opt-down {
  text-align: left;
}
</style>
