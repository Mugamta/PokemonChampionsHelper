<!--
  VS 화면 한쪽 포켓몬: 포켓몬·특성·도구·성격, 기술 1개(이 포켓몬이 배우는 공격 기술만),
  능력 포인트·랭크, 현재 HP·상태이상, 이 포켓몬 쪽 진영 상태.
-->
<template>
  <article class="panel vs-mon" :class="[side, { empty: !r }]">
    <header class="head">
      <UiPokeSprite :id="r?.species.id || null" :size="72" />
      <div class="head-main">
        <TeamSpeciesPicker
          :model-value="mon.slot.species"
          :ids="reg.selectableSpecies.value"
          @update:model-value="vs.setSpecies(side, $event)"
        />
        <div v-if="r" class="head-meta">
          <TeamGenderToggle v-model="mon.slot.gender" :species="mon.slot.species" />
          <UiTypeGroup :types="shownTypes" small />
          <label v-if="r.megaId" class="mega-switch">
            <input v-model="mon.megaOn" type="checkbox" />
            <span>{{ mon.megaOn ? gd.name('pokemon', r.megaId) : t('common.mega') }}</span>
          </label>
          <TeamFormToggle
            v-model:alt-on="mon.altOn"
            v-model:weather="vs.state.value.field.weather"
            :r="r"
          />
          <span v-if="!reg.isAllowed(mon.slot.species)" class="warn-text small">{{
            t('party.notInRegulation')
          }}</span>
        </div>
      </div>
    </header>

    <template v-if="r">
      <div class="row3">
        <label class="fld">
          <span class="section-label">{{ t('common.ability') }}</span>
          <select
            v-model="mon.slot.ability"
            class="field-input"
            :disabled="r.isMega"
            :title="gd.text('abilities', r.ability)"
          >
            <option v-if="r.isMega" :value="mon.slot.ability">
              {{ gd.name('abilities', r.ability) }}
            </option>
            <option
              v-for="a in r.base.abilities"
              v-else
              :key="a"
              :value="a"
              :title="gd.text('abilities', a)"
            >
              {{ gd.name('abilities', a) }}
            </option>
          </select>
        </label>
        <label class="fld">
          <span class="section-label">{{ t('common.nature') }}</span>
          <TeamNaturePicker v-model="mon.slot.nature" />
        </label>
        <label class="fld wide">
          <span class="section-label">{{ t('common.item') }}</span>
          <TeamItemPicker v-model="mon.slot.item" :species="mon.slot.species" />
        </label>
      </div>

      <div class="fld">
        <span class="section-label">{{ t('common.move') }}</span>
        <TeamMovePicker
          v-model="mon.slot.moves[0]"
          :learnset="attackMoves"
          :power="calc.power(r, mon.slot.moves[0], field, mon.status, mon.boosts)"
          :hits="calc.hits(r, mon.slot.moves[0])"
          :ability="r.ability"
          :species="calc.attackForm(r).species"
          :field="field"
          show-info
        />
      </div>

      <div class="stats">
        <div class="stat-row section-label">
          <span />
          <span>{{ t('stat.base') }}</span>
          <span class="sp-head">{{ t('stat.sp') }}</span>
          <span class="ta-right">{{ t('stat.actual') }}</span>
          <span class="ta-center">{{ t('party.previewRank') }}</span>
        </div>
        <div v-for="k in STAT_KEYS" :key="k" class="stat-row">
          <span class="stat-name">{{ t('stat.' + k) }}</span>
          <span class="base num">{{ r.species.stats[k] }}</span>
          <input
            v-model.number="mon.slot.sp[k]"
            type="range"
            min="0"
            :max="SP_PER_STAT_MAX"
            class="sp-range"
            :aria-label="t('stat.' + k) + ' ' + t('stat.sp')"
          />
          <input
            v-model.number="mon.slot.sp[k]"
            type="number"
            min="0"
            :max="SP_PER_STAT_MAX"
            class="field-input sp num"
            :class="{ invalid: !spValid }"
            :aria-label="t('stat.' + k) + ' ' + t('stat.sp')"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <span class="actual num" :class="natureClass(k)">{{ r.stats[k] }}</span>
          <span v-if="k !== 'hp'" class="rank" :class="{ on: mon.boosts[k] !== 0 }">
            <button type="button" class="rb" :disabled="mon.boosts[k] <= -6" @click="step(k, -1)">
              −
            </button>
            <span class="rank-val num">{{ mon.boosts[k] > 0 ? '+' : '' }}{{ mon.boosts[k] }}</span>
            <button type="button" class="rb" :disabled="mon.boosts[k] >= 6" @click="step(k, 1)">
              +
            </button>
          </span>
        </div>
        <div class="sp-total" :class="{ 'bad-text': !spValid }">
          <span>
            {{ t('stat.spTotal', { used: spTotal(mon.slot.sp), max: SP_TOTAL_MAX }) }}
            <template v-if="!spValid">
              · {{ t('stat.spOver', { per: SP_PER_STAT_MAX, max: SP_TOTAL_MAX }) }}</template
            >
          </span>
          <span>
            {{ t('stat.physBulk') }} <b class="num">{{ bulk('def') }}</b> · {{ t('stat.specBulk') }}
            <b class="num">{{ bulk('spd') }}</b>
          </span>
        </div>
      </div>

      <div class="cond">
        <span class="section-label">{{ t('vs.hp') }}</span>
        <div class="hp-row">
          <input
            v-model.number="mon.hpPct"
            type="range"
            min="1"
            max="100"
            class="hp-range"
            :aria-label="t('vs.hp')"
          />
          <span class="hp-val num"
            >{{ mon.hpPct }}% ({{ hpFromPct(r.stats.hp, mon.hpPct) }}/{{ r.stats.hp }})</span
          >
        </div>
        <span class="section-label">{{ t('party.previewStatus') }}</span>
        <div class="chip-row">
          <button
            v-for="s in STATUSES"
            :key="s"
            type="button"
            class="chip warn"
            :class="{ active: mon.status === s }"
            @click="mon.status = mon.status === s ? '' : s"
          >
            {{ t('status.' + s) }}
          </button>
        </div>
        <span class="section-label">{{ t('vs.sideState') }}</span>
        <div class="chip-row">
          <button
            type="button"
            class="chip"
            :class="{ active: mon.crit }"
            :title="t('vs.critHint')"
            @click="mon.crit = !mon.crit"
          >
            {{ t('common.crit') }}
          </button>
          <button
            v-for="c in SIDE_CHIPS"
            :key="c.key"
            type="button"
            class="chip"
            :class="{ active: mon[c.key] }"
            @click="mon[c.key] = !mon[c.key]"
          >
            {{ t('side.' + c.label) }}
          </button>
          <template v-if="vs.state.value.field.doubles">
            <button
              type="button"
              class="chip"
              :class="{ active: mon.helpingHand }"
              @click="mon.helpingHand = !mon.helpingHand"
            >
              {{ gd.name('moves', 'helpinghand') }}
            </button>
            <button
              type="button"
              class="chip"
              :class="{ active: mon.friendGuard }"
              @click="mon.friendGuard = !mon.friendGuard"
            >
              {{ gd.name('abilities', 'friendguard') }}
            </button>
          </template>
        </div>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import { useTeamCalc } from '~/composables/useTeamCalc'
import { useVs } from '~/composables/useVs'
import { typesInWeather } from '~/utils/damage'
import { SP_PER_STAT_MAX, SP_TOTAL_MAX, clampBoost, isSpValid, spTotal } from '~/utils/stats'
import { STAT_KEYS, type BoostKey, type StatKey } from '~/utils/types'
import { hpFromPct, vsFieldState, type VsSide } from '~/utils/vs'

const props = defineProps<{ side: VsSide }>()
const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const calc = useTeamCalc()
const vs = useVs()

const STATUSES = ['brn', 'par', 'psn', 'tox', 'slp', 'frz'] as const
const SIDE_CHIPS = [
  { key: 'reflect', label: 'reflect' },
  { key: 'lightScreen', label: 'lightscreen' },
  { key: 'auroraVeil', label: 'auroraveil' },
  { key: 'tailwind', label: 'tailwind' },
] as const

const mon = computed(() => vs.state.value[props.side])
const r = computed(() => vs.resolved(props.side))
// 결정력 표시용 (방어 측과 무관)
const field = computed(() => vsFieldState(vs.state.value.field))
const shownTypes = computed(() =>
  r.value ? typesInWeather(r.value.species, r.value.ability, field.value.weather ?? '') : [],
)
// 이 포켓몬이 포켓몬 챔피언스에서 배우는 기술 중 공격 기술만 (변화기는 데미지가 없음)
const attackMoves = computed(() =>
  gd.learnset(mon.value.slot.species).filter((id) => {
    const m = gd.move(id)
    return !!m && m.category !== 'status'
  }),
)
const spValid = computed(() => isSpValid(mon.value.slot.sp))
const step = (k: BoostKey, d: number) => {
  mon.value.boosts[k] = clampBoost(mon.value.boosts[k] + d)
}
const natureClass = (k: StatKey) => {
  const n = r.value?.nature
  return n?.plus === k ? 'up' : n?.minus === k ? 'down' : ''
}
// 내구 지수 = HP × 방어 / 0.411 (파티 화면과 같은 식)
const bulk = (k: 'def' | 'spd') => {
  const s = r.value?.stats
  return s ? Math.floor((s.hp * s[k]) / 0.411).toLocaleString() : 0
}
</script>

<style scoped>
.vs-mon {
  position: relative;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* 왼쪽·오른쪽 구분 (결과 칸과 같은 색) */
.vs-mon::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: var(--mine);
}
.vs-mon.right::before {
  background: var(--opp);
}
.vs-mon.empty::before {
  opacity: 0.4;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.head-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.head-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 26px;
}
.mega-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 4px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.row3 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.wide {
  grid-column: 1 / -1;
}
.fld {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-row {
  display: grid;
  grid-template-columns: 52px 44px minmax(0, 1fr) 58px 44px 92px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.stat-row.section-label {
  font-size: 11px;
}
.ta-right {
  text-align: right;
}
.ta-center {
  text-align: center;
}
.stat-name {
  font-weight: 700;
  color: var(--text-2);
}
.base {
  color: var(--text-3);
}
.sp-head {
  grid-column: span 2;
}
.sp {
  padding: 3px 6px;
}
.sp-range {
  min-width: 0;
  width: 100%;
  accent-color: var(--accent-2);
}
.actual {
  font-weight: 800;
  text-align: right;
}
.actual.up {
  color: var(--nature-up);
}
.actual.down {
  color: var(--nature-down);
}
.rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.rank-val {
  min-width: 24px;
  text-align: center;
  font-weight: 800;
  color: var(--text-3);
}
.rank.on .rank-val {
  color: var(--accent-2);
}
.rb {
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--faint);
  color: var(--text-2);
  font: inherit;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
}
.rb:hover:not(:disabled) {
  border-color: var(--line-strong);
  color: var(--text);
}
.rb:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.sp-total {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 2px 10px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-3);
}
.cond {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.hp-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hp-range {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent-2);
}
.hp-val {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
@media (max-width: 520px) {
  /* 휴대폰: 슬라이더는 빼고 숫자 입력만 */
  .stat-row {
    grid-template-columns: 44px 40px minmax(44px, 1fr) 36px 86px;
    gap: 5px;
  }
  .sp-range {
    display: none;
  }
  .sp-head {
    grid-column: auto;
  }
}
</style>
