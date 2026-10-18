<!-- 필드에 나와 있는 포켓몬 1마리: HP / 실능치 / 랭크 / 상태이상 / 특수상태 / 메가진화 -->
<template>
  <div
    class="mon panel"
    :class="[side, { focused, clickable: selectable }]"
    @click="selectable && emit('focus')"
  >
    <template v-if="idx != null && r && m">
      <div class="head">
        <UiPokeSprite
          :id="r.species.id"
          :size="76"
          :fainted="m.hp <= 0"
        />
        <div class="ident">
          <div class="name-row">
            <span class="name">{{ gd.name('pokemon', r.species.id) }}</span>
            <span
              v-if="statusText"
              class="status-pill"
              :class="m.status"
            >{{ statusText }}</span>
          </div>
          <div class="types">
            <UiTypeBadge
              v-for="ty in r.species.types"
              :key="ty"
              :type="ty"
              small
            />
          </div>
          <div class="sub">
            <UiItemIcon
              v-if="r.slot.item"
              :id="r.slot.item"
              :size="18"
            />
            <span>{{ gd.name('items', r.slot.item) || '—' }}</span>
            <span class="sep">·</span>
            <span :title="gd.text('abilities', r.ability)">{{ gd.name('abilities', r.ability) }}</span>
          </div>
          <label
            v-if="megaAvailable"
            class="mega"
            @click.stop
          >
            <input
              type="checkbox"
              :checked="m.megaOn"
              @change="b.setMega(side, idx, ($event.target as HTMLInputElement).checked)"
            >
            {{ t('common.mega') }}
          </label>
        </div>
      </div>

      <div
        class="hp-row"
        @click.stop
      >
        <UiHpBar
          :percent="hpPercent"
          class="bar"
        />
        <div class="hp-edit">
          <template v-if="side === 'mine'">
            <input
              v-model.number="m.hp"
              type="number"
              min="0"
              :max="max"
              class="field-input hp-in num"
            >
            <span class="muted num">/ {{ max }}</span>
          </template>
          <template v-else>
            <input
              v-model.number="m.hp"
              type="number"
              min="0"
              max="100"
              step="0.1"
              class="field-input hp-in num"
            >
            <span class="muted num">% ({{ an.oppHpRange(idx).min }}~{{ an.oppHpRange(idx).max }}/{{ max }})</span>
          </template>
        </div>
      </div>

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
            v-if="k !== 'hp' && m.boosts[k as BoostKey]"
            class="st-b num"
            :class="m.boosts[k as BoostKey] > 0 ? 'pos' : 'neg'"
          >{{ applyBoost(r.stats[k], m.boosts[k as BoostKey]) }}</span>
        </div>
      </div>

      <div
        class="lower"
        @click.stop
      >
        <UiRankControl
          :boosts="m.boosts"
          @change="(k, d) => b.changeBoost(side, idx!, k, d)"
        />
        <div class="conds">
          <div class="chip-row">
            <button
              v-for="s in STATUSES"
              :key="s"
              type="button"
              class="chip warn"
              :class="{ active: m.status === s }"
              @click="b.setStatus(side, idx!, s)"
            >{{ s === 'tox' && m.status === 'tox' ? `${t('status.tox')} ${m.toxicTurn + 1}/16` : t('status.' + s) }}</button>
          </div>
          <details class="vol">
            <summary class="section-label">
              {{ t('battle.conditions') }}
              <span
                v-if="volList.length"
                class="vol-count"
              >{{ volList.length }}</span>
            </summary>
            <div
              v-for="g in VOLATILE_GROUPS"
              :key="g.label"
              class="vol-group"
            >
              <span class="muted small">{{ t('volatile.' + g.label) }}</span>
              <div class="chip-row">
                <button
                  v-for="v in g.items"
                  :key="v"
                  type="button"
                  class="chip"
                  :class="{ active: !!m.volatiles[v] }"
                  @click="b.toggleVolatile(side, idx!, v)"
                >{{ volLabel(v) }}</button>
              </div>
            </div>
          </details>
          <div
            v-if="volList.length"
            class="chip-row"
          >
            <span
              v-for="v in volList"
              :key="v"
              class="vol-tag"
            >{{ volLabel(v) }}</span>
          </div>
        </div>
      </div>
    </template>
    <div
      v-else
      class="empty-state"
    >
      {{ t(side === 'mine' ? 'battle.pickActive' : 'battle.pickOpp') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { VOLATILE_DURATION, VOLATILE_GROUPS, STATUSES, type BattleSide, type useBattle } from '~/composables/useBattle'
import type { useBattleAnalysis } from '~/composables/useBattleAnalysis'
import { applyBoost } from '~/utils/stats'
import { STAT_KEYS, type BoostKey } from '~/utils/types'

const props = defineProps<{
  b: ReturnType<typeof useBattle>
  an: ReturnType<typeof useBattleAnalysis>
  side: BattleSide
  slot: number
  focused?: boolean
  selectable?: boolean
}>()
const emit = defineEmits<{ focus: [] }>()
const { t } = useI18n()
const gd = useGameData()

const idx = computed(() => props.b.state.value!.sides[props.side].active[props.slot] ?? null)
const m = computed(() => (idx.value == null ? null : props.b.state.value!.sides[props.side].mons[idx.value]!))
const r = computed(() => props.b.resolveAt(props.side, idx.value))
const max = computed(() => r.value?.stats.hp || 0)
const hpPercent = computed(() => (!m.value ? 0 : props.side === 'opp' ? m.value.hp : max.value ? (m.value.hp / max.value) * 100 : 0))
const megaAvailable = computed(() => !!r.value?.megaId && !m.value?.megaUsed)
const statusText = computed(() => (m.value?.status ? t('status.' + m.value.status) : ''))
const volList = computed(() => Object.keys(m.value?.volatiles || {}))
const volLabel = (v: string) => {
  const turn = m.value?.volatiles[v]
  if (!turn) return t('volatile.' + v)
  const total = VOLATILE_DURATION[v]
  return `${t('volatile.' + v)} ${total == null ? '∞' : `${turn}/${total}`}`
}
</script>

<style scoped>
.mon { padding: 12px; display: flex; flex-direction: column; gap: 10px; position: relative; overflow: hidden; }
.mon::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; }
.mon.mine::before { background: var(--mine); }
.mon.opp::before { background: var(--opp); }
.mon.clickable { cursor: pointer; }
.mon.focused { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.head { display: flex; gap: 12px; align-items: center; }
.ident { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.name-row { display: flex; align-items: center; gap: 6px; }
.name { font-size: 18px; font-weight: 800; font-family: var(--font-display); }
.status-pill { font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: var(--warn); color: #241400; }
.status-pill.brn { background: #ff7a3d; }
.status-pill.par { background: #f7d02c; }
.status-pill.psn, .status-pill.tox { background: #b55cd6; color: #fff; }
.status-pill.slp { background: #8e9bb3; }
.status-pill.frz { background: #6cd3f5; }
.types { display: flex; gap: 3px; }
.sub { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-2); flex-wrap: wrap; }
.sep { color: var(--text-3); }
.mega { display: inline-flex; gap: 5px; align-items: center; font-size: 12px; font-weight: 700; color: #ff9be6; cursor: pointer; }
.hp-row { display: flex; flex-direction: column; gap: 5px; }
.bar :deep(.track) { height: 10px; }
.hp-edit { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.hp-in { width: 72px; padding: 3px 6px; text-align: right; }
.stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; text-align: center; }
.st { background: rgba(0, 0, 0, 0.22); border-radius: 6px; padding: 3px 0; display: flex; flex-direction: column; }
.st-k { font-size: 10px; color: var(--text-3); font-weight: 700; }
.st-v { font-size: 14px; font-weight: 700; }
.st-v.up { color: var(--nature-up); }
.st-v.down { color: var(--nature-down); }
.st-b { font-size: 10px; font-weight: 700; }
.st-b.pos { color: var(--good); }
.st-b.neg { color: var(--bad); }
.lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 12px; }
.conds { display: flex; flex-direction: column; gap: 6px; }
.vol summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 6px; }
.vol summary::-webkit-details-marker { display: none; }
.vol summary::before { content: '▸'; color: var(--text-3); }
.vol[open] summary::before { content: '▾'; }
.vol-count { background: var(--accent-2); color: #04131a; border-radius: 999px; padding: 0 6px; font-size: 10px; }
.vol-group { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
.vol-tag { font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: rgba(76, 201, 240, 0.18); color: var(--accent-2); }
.small { font-size: 11px; }
@media (max-width: 700px) { .lower { grid-template-columns: 1fr; } }
</style>
