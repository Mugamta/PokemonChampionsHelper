<!--
  포켓몬 타입 배지 묶음 + 방어 상성 툴팁.
  배지에 마우스를 올리면 그 타입 하나의 상성, 복합 타입은 두 배지를 묶은 영역(테두리·가운데 +)에 올리면 합친 상성.
-->
<template>
  <v-tooltip location="bottom" :open-delay="150" class="type-tip-overlay">
    <template #activator="{ props: act }">
      <span
        class="type-group"
        :class="{ dual: types.length > 1 }"
        v-bind="act"
        @mouseleave="hovered = null"
      >
        <template v-for="(ty, i) in types" :key="ty">
          <span v-if="i" class="joint" @mouseenter="hovered = null">+</span>
          <UiTypeBadge
            :type="ty"
            :small="small"
            @mouseenter="hovered = ty"
            @mouseleave="hovered = null"
          />
        </template>
      </span>
    </template>
    <UiTypeTip
      mode="defense"
      :types="hovered ? [hovered] : types"
      :hint="hovered && types.length > 1 ? t('typeTip.combinedHint') : undefined"
    />
  </v-tooltip>
</template>

<script setup lang="ts">
import type { TypeId } from '~/utils/types'

defineProps<{ types: TypeId[]; small?: boolean }>()
const { t } = useI18n()
// 마우스가 올라간 배지 (없으면 묶음 전체 = 합친 상성)
const hovered = ref<TypeId | null>(null)
</script>

<style scoped>
.type-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  cursor: help;
}
/* 복합 타입: 두 배지를 묶는 영역 */
.type-group.dual {
  padding: 1px 2px;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
}
.joint {
  padding: 0 2px;
  font-size: 10px;
  font-weight: 800;
  color: var(--text-3);
}
.type-group.dual:hover {
  border-color: var(--text-3);
}
</style>
