<!--
  선출 화면에서 접어 둔 포켓몬 슬롯 한 줄: 번호(상대) / 선출 순서(내 쪽) · 스프라이트 · 이름·성별 · 도구 · 펼치기 버튼.
  내 쪽은 줄을 누르면 선출 토글(select), 상대는 펼침(expand). warn: 성별 미입력 등 붉은 테두리
-->
<template>
  <div
    class="mini panel"
    :class="{ picked: order != null, dim, warn }"
    role="button"
    tabindex="0"
    @click="activate"
    @keydown.enter.prevent="activate"
  >
    <span v-if="index != null" class="no num">{{ index + 1 }}</span>
    <UiPokeSprite :id="r?.species.id || null" :size="32" />
    <span class="name">
      {{ r ? gd.name('pokemon', r.species.id) : t('common.empty')
      }}<span v-if="genderMark" class="gender-mark">{{ genderMark }}</span>
    </span>
    <UiItemIcon v-if="slot.item" :id="slot.item" :size="18" />
    <span v-if="order != null" class="order num">{{ order }}</span>
    <button
      type="button"
      class="unfold"
      :title="t('entry.unfold')"
      :aria-label="t('entry.unfold')"
      @click.stop="emit('expand')"
    >
      ▾
    </button>
  </div>
</template>

<script setup lang="ts">
import type { TeamSlot } from '~/utils/types'

const props = defineProps<{
  slot: TeamSlot
  megaOn?: boolean
  altOn?: boolean | null
  index?: number // 상대 슬롯 번호 (0부터)
  order?: number | null // 내 쪽 선출 순서
  selectable?: boolean
  dim?: boolean
  warn?: boolean
}>()
const emit = defineEmits<{ select: []; expand: [] }>()
const activate = () => (props.selectable ? emit('select') : emit('expand'))
const { t } = useI18n()
const gd = useGameData()
const calc = useTeamCalc()
const r = computed(() => calc.resolve(props.slot, props.megaOn ?? true, props.altOn ?? undefined))
const genderMark = computed(() => {
  const g = gd.pokemon(props.slot.species)?.gender ?? props.slot.gender
  return g === 'M' ? '♂' : g === 'F' ? '♀' : ''
})
</script>

<style scoped>
.mini {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  min-width: 0;
}
.mini:hover {
  border-color: var(--line-strong);
}
.picked {
  border-color: var(--accent-text);
  box-shadow: 0 0 0 1px var(--accent);
}
.dim {
  opacity: 0.55;
}
.warn {
  border-color: var(--bad);
  box-shadow: 0 0 0 1px var(--bad);
}
.no {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
  background: var(--well);
  color: var(--text-2);
  flex: none;
}
.name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gender-mark {
  margin-left: 3px;
  color: var(--text-3);
  font-weight: 800;
}
.order {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 800;
  flex: none;
}
.unfold {
  border: 1px solid var(--line);
  background: var(--well);
  color: var(--text-2);
  border-radius: 6px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  flex: none;
  font: inherit;
  line-height: 1;
}
.unfold:hover {
  background: var(--hover);
}
</style>
