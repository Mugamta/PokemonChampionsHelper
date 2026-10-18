<!-- 읽기 전용 포켓몬 카드 (선출 화면의 내 파티, 배틀 화면의 대기 포켓몬) -->
<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="card panel"
    :class="{ picked: order != null, clickable, dim, fainted }"
    :style="accentStyle"
    @click="clickable && emit('select')"
  >
    <span
      v-if="order != null"
      class="order num"
    >{{ order }}</span>
    <div
      v-if="r"
      class="top"
    >
      <UiPokeSprite
        :id="r.species.id"
        :size="compact ? 48 : 64"
        :fainted="fainted"
      />
      <div class="ident">
        <span class="name">{{ gd.name('pokemon', r.species.id) }}</span>
        <span class="types">
          <UiTypeBadge
            v-for="ty in r.species.types"
            :key="ty"
            :type="ty"
            small
          />
        </span>
        <span class="sub">
          <UiItemIcon
            v-if="r.slot.item"
            :id="r.slot.item"
            :size="18"
          />
          <span class="muted">{{ gd.name('items', r.slot.item) }}</span>
        </span>
        <span
          class="sub muted"
          :title="gd.text('abilities', r.ability)"
        >{{ gd.name('abilities', r.ability) }}</span>
      </div>
    </div>
    <div
      v-else
      class="top empty-top"
    >
      <UiPokeSprite :size="compact ? 48 : 64" />
      <span class="muted">{{ t('common.empty') }}</span>
    </div>

    <slot name="extra" />

    <template v-if="r && !compact">
      <div class="stats">
        <div
          v-for="k in STAT_KEYS"
          :key="k"
          class="st"
        >
          <span class="st-k">{{ t('stat.short.' + k) }}</span>
          <span
            class="st-v num"
            :class="r.nature?.plus === k ? 'up' : r.nature?.minus === k ? 'down' : ''"
          >{{ r.stats[k] }}</span>
          <span
            v-if="r.slot.sp[k]"
            class="st-sp num"
          >+{{ r.slot.sp[k] }}</span>
        </div>
      </div>
      <div class="moves">
        <div
          v-for="(m, i) in r.slot.moves"
          :key="i"
          class="mv"
          :title="gd.text('moves', m)"
        >
          <template v-if="m">
            <span
              class="dot"
              :style="{ background: `var(--t-${gd.move(m)?.type})` }"
            />
            <span class="mv-name">{{ gd.name('moves', m) }}</span>
            <span
              v-if="spread && isSpread(m)"
              class="spread-tag"
            >{{ t('entry.spreadTag') }}</span>
            <span class="mv-pow num">{{ calc.power(r, m, field)?.toLocaleString() ?? '' }}</span>
          </template>
          <span
            v-else
            class="muted"
          >-</span>
        </div>
      </div>
    </template>
  </component>
</template>

<script setup lang="ts">
import { STAT_KEYS, type TeamSlot } from '~/utils/types'
import type { FieldState } from '~/utils/damage'

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
}>()
const emit = defineEmits<{ select: [] }>()
const { t } = useI18n()
const gd = useGameData()
const calc = useTeamCalc()

const r = computed(() => calc.resolve(props.slot, props.megaOn ?? true))
const isSpread = (m: string) => isSpreadMove(gd.move(m))

const accentStyle = computed(() => {
  const types = r.value?.species.types || []
  const a = types[0] ? `var(--t-${types[0]})` : 'var(--line-strong)'
  const b = types[1] ? `var(--t-${types[1]})` : a
  return { '--slot-a': a, '--slot-b': b }
})
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
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, var(--slot-a), var(--slot-b));
}
.clickable { cursor: pointer; transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s; }
.clickable:hover { border-color: var(--line-strong); }
.picked { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), 0 8px 24px rgba(255, 203, 5, 0.15); }
.dim { opacity: 0.55; }
.fainted { opacity: 0.45; }
.order {
  position: absolute;
  top: 8px; right: 10px;
  width: 26px; height: 26px;
  border-radius: 50%;
  display: grid; place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
  font-size: 14px;
}
.top { display: flex; gap: 10px; align-items: center; }
.empty-top { opacity: 0.6; }
.ident { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.name { font-weight: 800; font-size: 15px; }
.types { display: flex; gap: 3px; }
.sub { display: flex; align-items: center; gap: 4px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; text-align: center; }
.st { display: flex; flex-direction: column; background: rgba(0, 0, 0, 0.2); border-radius: 6px; padding: 3px 0; }
.st-k { font-size: 10px; color: var(--text-3); font-weight: 700; }
.st-v { font-size: 13px; font-weight: 700; }
.st-v.up { color: var(--nature-up); }
.st-v.down { color: var(--nature-down); }
.st-sp { font-size: 9px; color: var(--text-3); }
.moves { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px; }
.mv { display: flex; align-items: center; gap: 5px; font-size: 12px; min-width: 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.mv-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mv-pow { color: var(--accent); font-size: 11px; }
.spread-tag { font-size: 9px; font-weight: 800; padding: 0 4px; border-radius: 4px; background: rgba(255, 106, 213, 0.2); color: #ff9be6; }
</style>
