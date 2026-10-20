<!--
  읽기 전용 포켓몬 카드 (선출 화면의 내 파티, 배틀 화면의 대기 포켓몬)
  megaToggle: 메가진화 전/후 토글 (선출 화면 — 메가진화 전 모습으로 싸우는 경우도 표에서 보기 위해).
  formToggle: 배틀 폼 토글 (킬가르도·돌핀맨·모르페코, 캐스퐁은 날씨 버튼 → update:weather).
  토글(체크박스)을 안에 넣어야 해서 눌리는 카드도 <button> 대신 role="button" div 로 만든다.
-->
<template>
  <div
    class="card panel"
    :class="{ picked: order != null, clickable, dim, fainted }"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    :aria-pressed="clickable ? order != null : undefined"
    @click="clickable && emit('select')"
    @keydown.enter.prevent="clickable && emit('select')"
    @keydown.space.prevent="clickable && emit('select')"
  >
    <span v-if="order != null" class="order num">{{ order }}</span>
    <div v-if="r" class="top">
      <UiPokeSprite :id="r.species.id" :size="compact ? 48 : 64" :fainted="fainted" />
      <div class="ident">
        <span class="name">{{ gd.name('pokemon', r.species.id) }}</span>
        <span class="types">
          <UiTypeGroup :types="typesInWeather(r.species, r.ability, field?.weather ?? '')" small />
          <label v-if="megaToggle && r.megaId" class="mega-switch" @click.stop @keydown.stop>
            <input
              type="checkbox"
              :checked="megaOn ?? true"
              @change="emit('update:megaOn', ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ t('common.mega') }}</span>
          </label>
          <TeamFormToggle
            v-if="formToggle"
            :r="r"
            :alt-on="altOn ?? null"
            :weather="field?.weather ?? ''"
            @update:alt-on="emit('update:altOn', $event)"
            @update:weather="emit('update:weather', $event)"
          />
        </span>
        <span class="sub">
          <UiItemIcon v-if="r.slot.item" :id="r.slot.item" :size="18" />
          <span class="muted">{{ gd.name('items', r.slot.item) }}</span>
        </span>
        <span class="sub muted" :title="gd.text('abilities', r.ability)">{{
          gd.name('abilities', r.ability)
        }}</span>
      </div>
    </div>
    <div v-else class="top empty-top">
      <UiPokeSprite :size="compact ? 48 : 64" />
      <span class="muted">{{ t('common.empty') }}</span>
    </div>

    <slot name="extra" />

    <template v-if="r && !compact">
      <div class="stats">
        <div v-for="k in STAT_KEYS" :key="k" class="st">
          <span class="st-k">{{ t('stat.short.' + k) }}</span>
          <span
            class="st-v num"
            :class="r.nature?.plus === k ? 'up' : r.nature?.minus === k ? 'down' : ''"
            >{{ r.stats[k] }}</span
          >
          <span v-if="r.slot.sp[k]" class="st-sp num">+{{ r.slot.sp[k] }}</span>
        </div>
      </div>
      <div class="moves">
        <div v-for="(m, i) in r.slot.moves" :key="i" class="mv" :title="gd.text('moves', m)">
          <template v-if="m">
            <span class="dot" :style="{ background: `var(--t-${moveType(m)})` }" />
            <span class="mv-name">{{ gd.name('moves', m) }}</span>
            <span v-if="spread && isSpread(m)" class="spread-tag">{{ t('entry.spreadTag') }}</span>
            <span class="mv-pow num">{{ calc.power(r, m, field)?.toLocaleString() ?? '' }}</span>
          </template>
          <span v-else class="muted">-</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { STAT_KEYS, type TeamSlot, type Weather } from '~/utils/types'
import { effectiveMoveType, typesInWeather, type FieldState } from '~/utils/damage'

const props = defineProps<{
  slot: TeamSlot
  megaOn?: boolean
  order?: number | null
  clickable?: boolean
  compact?: boolean
  dim?: boolean
  fainted?: boolean
  spread?: boolean // 더블: 광역기 표시
  field?: FieldState
  megaToggle?: boolean
  altOn?: boolean | null // 배틀 폼 (null = 기본값)
  formToggle?: boolean
}>()
const emit = defineEmits<{
  select: []
  'update:megaOn': [on: boolean]
  'update:altOn': [on: boolean | null]
  'update:weather': [w: Weather]
}>()
const { t } = useI18n()
const gd = useGameData()
const calc = useTeamCalc()

const r = computed(() => calc.resolve(props.slot, props.megaOn ?? true, props.altOn ?? undefined))
// 스킨류 특성(메가 포함)으로 바뀐 기술 타입
const moveType = (id: string) => {
  const m = gd.move(id)
  return m && r.value
    ? effectiveMoveType(m, r.value.ability, props.field, r.value.species)
    : m?.type
}
const isSpread = (m: string) => isSpreadMove(gd.move(m))
</script>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  text-align: left;
  color: var(--text);
  font: inherit;
  width: 100%;
  overflow: hidden;
}
.card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--line-strong);
}
.clickable {
  cursor: pointer;
  transition:
    border-color 0.15s,
    transform 0.1s,
    box-shadow 0.15s;
}
.clickable:hover {
  border-color: var(--line-strong);
}
.clickable:focus-visible {
  outline: 2px solid var(--accent-2);
  outline-offset: 2px;
}
.picked {
  border-color: var(--accent-text);
  box-shadow:
    0 0 0 1px var(--accent),
    0 8px 24px rgba(255, 203, 5, 0.15);
}
.dim {
  opacity: 0.55;
}
.fainted {
  opacity: 0.45;
}
.order {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
  font-size: 14px;
}
.top {
  display: flex;
  gap: 10px;
  align-items: center;
}
.empty-top {
  opacity: 0.6;
}
.ident {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.name {
  font-weight: 800;
  font-size: 15px;
}
.types {
  display: flex;
  align-items: center;
  gap: 3px;
}
.mega-switch {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 0 7px 0 5px;
  border-radius: 999px;
  background: var(--faint);
  border: 1px solid var(--line-strong);
  color: var(--text-2);
  cursor: pointer;
}
.mega-switch input {
  margin: 0;
}
.mega-switch:has(input:checked) {
  color: var(--accent-2);
  border-color: var(--accent-2);
}
.sub {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stats {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 2px;
  text-align: center;
}
.st {
  display: flex;
  flex-direction: column;
  background: var(--well);
  border-radius: 6px;
  padding: 3px 0;
}
.st-k {
  font-size: 10px;
  color: var(--text-3);
  font-weight: 700;
}
.st-v {
  font-size: 13px;
  font-weight: 700;
}
.st-v.up {
  color: var(--nature-up);
}
.st-v.down {
  color: var(--nature-down);
}
.st-sp {
  font-size: 9px;
  color: var(--text-3);
}
.moves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px 10px;
}
.mv {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  min-width: 0;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.mv-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mv-pow {
  color: var(--text-2);
  font-weight: 700;
  font-size: 11px;
}
.spread-tag {
  font-size: 9px;
  font-weight: 800;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--well);
  color: var(--text-2);
}
</style>
