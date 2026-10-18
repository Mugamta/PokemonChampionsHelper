<!--
  파티 슬롯 편집 카드. 파티 화면(full)과 선출 화면의 상대 입력(compact) 양쪽에서 쓴다.
  slot 은 useTeam().slots 의 원소를 그대로 받아 직접 수정한다.
-->
<template>
  <article
    class="slot panel"
    :class="{ compact, empty: !slot.species }"
    :style="accentStyle"
  >
    <header class="slot-head">
      <span class="slot-no num">{{ index + 1 }}</span>
      <UiPokeSprite
        :id="resolved?.species.id || null"
        :size="compact ? 56 : 84"
      />
      <div class="head-main">
        <TeamSpeciesPicker
          v-model="slot.species"
          :ids="speciesIds"
          :exclude="excludeSpecies"
        />
        <div
          v-if="resolved"
          class="head-meta"
        >
          <UiTypeBadge
            v-for="ty in resolved.species.types"
            :key="ty"
            :type="ty"
            small
          />
          <label
            v-if="resolved.megaId"
            class="mega-switch"
          >
            <input
              v-model="megaOn"
              type="checkbox"
            >
            <span>{{ megaOn ? gd.name('pokemon', resolved.megaId) : t('common.mega') }}</span>
          </label>
          <span
            v-if="notAllowed"
            class="warn-text small"
          >{{ t('party.notInRegulation') }}</span>
        </div>
      </div>
    </header>

    <template v-if="slot.species && resolved">
      <div class="row3">
        <label class="fld">
          <span class="section-label">{{ t('common.ability') }}</span>
          <select
            v-model="slot.ability"
            class="field-input"
            :disabled="resolved.isMega"
            :title="gd.text('abilities', resolved.ability)"
          >
            <option
              v-if="resolved.isMega"
              :value="slot.ability"
            >{{ gd.name('abilities', resolved.ability) }}</option>
            <option
              v-for="a in resolved.base.abilities"
              v-else
              :key="a"
              :value="a"
              :title="gd.text('abilities', a)"
            >{{ gd.name('abilities', a) }}</option>
          </select>
        </label>
        <label class="fld">
          <span class="section-label">{{ t('common.item') }}</span>
          <TeamItemPicker
            v-model="slot.item"
            :species="slot.species"
            :exclude="excludeItems"
          />
        </label>
        <label class="fld">
          <span class="section-label">{{ t('common.nature') }}</span>
          <select
            v-model="slot.nature"
            class="field-input"
          >
            <option
              v-for="n in natureOptions"
              :key="n.value"
              :value="n.value"
            >{{ n.title }}</option>
          </select>
        </label>
      </div>

      <div class="stats">
        <div class="stats-head section-label">
          <span />
          <span v-if="!compact">{{ t('stat.base') }}</span>
          <span>{{ t('stat.sp') }}</span>
          <span>{{ t('stat.actual') }}</span>
          <span v-if="!compact" />
        </div>
        <div
          v-for="k in STAT_KEYS"
          :key="k"
          class="stat-row"
        >
          <span class="stat-name">{{ t('stat.' + k) }}</span>
          <span
            v-if="!compact"
            class="base"
          >
            <span
              class="base-bar"
              :style="{ width: Math.min(100, (resolved.species.stats[k] / 180) * 100) + '%', background: statColor(resolved.species.stats[k]) }"
            />
            <span class="num">{{ resolved.species.stats[k] }}</span>
          </span>
          <input
            v-model.number="slot.sp[k]"
            type="number"
            min="0"
            :max="SP_PER_STAT_MAX"
            class="field-input sp num"
            :class="{ invalid: !spValid }"
            @focus="($event.target as HTMLInputElement).select()"
          >
          <span
            class="actual num"
            :class="natureClass(k)"
          >{{ resolved.stats[k] }}</span>
          <span
            v-if="!compact"
            class="extra"
          >
            <template v-if="k === 'hp' && hpHint">
              <span :class="hpHint.ok ? 'good-text' : 'muted'">{{ hpHint.label }} {{ hpHint.ok ? '✓' : '✗' }}</span>
            </template>
            <template v-else-if="k === 'def'">{{ t('stat.physBulk') }} <b class="num">{{ bulk('def') }}</b></template>
            <template v-else-if="k === 'spd'">{{ t('stat.specBulk') }} <b class="num">{{ bulk('spd') }}</b></template>
          </span>
        </div>
        <div
          class="sp-total"
          :class="{ 'bad-text': !spValid }"
        >
          {{ t('stat.spTotal', { used: spTotal(slot.sp), max: SP_TOTAL_MAX }) }}
          <span v-if="!spValid"> · {{ t('stat.spOver', { per: SP_PER_STAT_MAX, max: SP_TOTAL_MAX }) }}</span>
        </div>
      </div>

      <div class="moves">
        <TeamMovePicker
          v-for="(_, i) in slot.moves"
          :key="i"
          v-model="slot.moves[i]"
          :learnset="learnset"
          :exclude="slot.moves.filter((_, j) => j !== i)"
          :power="calc.power(resolved, slot.moves[i]!, previewField, previewStatus)"
          :show-info="!compact"
        />
      </div>

      <div
        v-if="!compact"
        class="preview"
      >
        <span class="section-label">{{ t('party.previewConditions') }}</span>
        <div class="chip-row">
          <button
            v-for="w in WEATHERS"
            :key="w"
            type="button"
            class="chip"
            :class="{ active: preview.weather === w }"
            @click="preview.weather = preview.weather === w ? '' : w"
          >{{ t('weather.' + w) }}</button>
        </div>
        <div class="chip-row">
          <button
            v-for="tr in TERRAINS"
            :key="tr"
            type="button"
            class="chip"
            :class="{ active: preview.terrain === tr }"
            @click="preview.terrain = preview.terrain === tr ? '' : tr"
          >{{ t('terrain.' + tr) }}</button>
          <button
            v-for="s in ['brn', 'par'] as const"
            :key="s"
            type="button"
            class="chip warn"
            :class="{ active: preview.status === s }"
            @click="preview.status = preview.status === s ? '' : s"
          >{{ t('status.' + s) }}</button>
        </div>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import { STAT_KEYS, type BoostKey, type StatKey, type Status, type TeamSlot, type Terrain, type Weather } from '~/utils/types'
import { SP_PER_STAT_MAX, SP_TOTAL_MAX, isSpValid, spTotal } from '~/utils/stats'
import { hpRemainderHint } from '~/utils/ko'

const slot = defineModel<TeamSlot>('slot', { required: true })
const megaOn = defineModel<boolean>('megaOn', { default: true })
const props = defineProps<{
  index: number
  speciesIds: string[]
  excludeSpecies?: string[]
  excludeItems?: string[]
  compact?: boolean
  notAllowed?: boolean
}>()

const { t } = useI18n()
const gd = useGameData()
const calc = useTeamCalc()

const WEATHERS: Weather[] = ['sun', 'rain', 'sand', 'snow', 'harshsun', 'heavyrain', 'strongwinds']
const TERRAINS: Terrain[] = ['electric', 'grassy', 'misty', 'psychic']
const preview = reactive<{ weather: Weather; terrain: Terrain; status: Status }>({ weather: '', terrain: '', status: '' })
const previewField = computed(() => ({ weather: preview.weather, terrain: preview.terrain }))
const previewStatus = computed(() => preview.status)

const resolved = computed(() => calc.resolve(slot.value, megaOn.value))
const learnset = computed(() => gd.learnset(slot.value.species))
const spValid = computed(() => isSpValid(slot.value.sp))
const hpHint = computed(() =>
  resolved.value ? hpRemainderHint(resolved.value.stats.hp, resolved.value.ability, slot.value.item, slot.value.moves) : null,
)

// 포켓몬이 바뀌면 특성/도구/기술 초기화 (능력 포인트는 유지). 지우면 전부 초기화.
// 슬롯 객체 자체가 교체된 경우(저장분 복원/이전 버전 데이터 이전)는 사용자가 바꾼 게 아니므로 건드리지 않는다.
let lastSlot = slot.value
watch(
  () => slot.value.species,
  (id, prev) => {
    if (lastSlot !== slot.value) {
      lastSlot = slot.value
      return
    }
    if (id === prev) return
    const p = gd.pokemon(id)
    slot.value.ability = p?.abilities[0] || ''
    slot.value.item = ''
    slot.value.moves = ['', '', '', '']
    if (!id) {
      slot.value.nature = 'serious'
      for (const k of STAT_KEYS) slot.value.sp[k] = 0
    }
    megaOn.value = true
  },
)

const natureOptions = computed(() => {
  const natures = Object.values(gd.data.value?.natures || {})
  const neutral = { value: 'serious', title: t('common.neutralNature') }
  const boosted = natures
    .filter((n) => n.plus && n.minus)
    .map((n) => ({
      value: n.id,
      title: `${gd.name('natures', n.id)} (${t('stat.short.' + n.plus)}↑ ${t('stat.short.' + n.minus)}↓)`,
      order: ['atk', 'def', 'spa', 'spd', 'spe'].indexOf(n.plus as BoostKey) * 10 + ['atk', 'def', 'spa', 'spd', 'spe'].indexOf(n.minus as BoostKey),
    }))
    .sort((a, b) => a.order - b.order)
  return [neutral, ...boosted]
})

const natureClass = (k: StatKey) => {
  const n = resolved.value?.nature
  return n?.plus === k ? 'up' : n?.minus === k ? 'down' : ''
}
// 내구 지수 = HP × 방어 / 0.411 (기존 계산식 유지)
const bulk = (k: 'def' | 'spd') => {
  const s = resolved.value?.stats
  return s ? Math.floor((s.hp * s[k]) / 0.411).toLocaleString() : 0
}
const statColor = (v: number) => (v >= 130 ? '#3ddc97' : v >= 100 ? '#9be15d' : v >= 70 ? '#ffcb05' : '#ff7a5c')

const accentStyle = computed(() => {
  const types = resolved.value?.species.types || []
  const a = types[0] ? `var(--t-${types[0]})` : 'var(--line-strong)'
  const b = types[1] ? `var(--t-${types[1]})` : a
  return { '--slot-a': a, '--slot-b': b }
})
</script>

<style scoped>
.slot {
  position: relative;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}
.slot::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: linear-gradient(90deg, var(--slot-a), var(--slot-b));
}
.slot.empty::before { opacity: 0.4; }
.slot-head { display: flex; align-items: center; gap: 10px; }
.slot-no {
  align-self: flex-start;
  width: 24px; height: 24px;
  border-radius: 7px;
  display: grid; place-items: center;
  background: var(--panel-3);
  font-size: 13px; font-weight: 800;
  color: var(--accent);
}
.head-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.head-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.mega-switch {
  display: inline-flex; align-items: center; gap: 5px;
  margin-left: 4px;
  font-size: 12px; font-weight: 700;
  padding: 2px 8px 2px 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 106, 213, 0.18), rgba(140, 108, 255, 0.18));
  border: 1px solid rgba(190, 120, 255, 0.4);
  cursor: pointer;
}
.small { font-size: 11px; }

.row3 { display: grid; grid-template-columns: 1fr 1.4fr; gap: 8px; }
.row3 .fld:last-child { grid-column: span 2; }
.fld { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

.stats { display: grid; gap: 3px; }
.stats-head, .stat-row {
  display: grid;
  grid-template-columns: 56px 1fr 54px 44px 1.3fr;
  align-items: center;
  gap: 8px;
}
.stat-name { font-size: 12px; color: var(--text-2); font-weight: 600; }
.base { position: relative; height: 18px; display: flex; align-items: center; }
.base-bar { position: absolute; left: 0; top: 4px; bottom: 4px; border-radius: 4px; opacity: 0.55; }
.base .num { position: relative; font-size: 12px; padding-left: 4px; }
.sp { padding: 3px 6px; text-align: center; }
.actual { text-align: right; font-weight: 700; font-size: 15px; }
.actual.up { color: var(--nature-up); }
.actual.down { color: var(--nature-down); }
.extra { font-size: 11px; color: var(--text-3); }
.extra b { color: var(--text-2); }
.sp-total { font-size: 11px; color: var(--text-3); text-align: right; }

.moves { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.preview { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px dashed var(--line); }

/* compact: 선출 화면의 상대 입력 */
.slot.compact { padding: 10px; gap: 8px; }
.compact .stats-head, .compact .stat-row { grid-template-columns: 1fr 52px 44px; }
.compact .stats { grid-template-columns: 1fr 1fr; column-gap: 14px; }
.compact .stats-head { display: none; }
.compact .sp-total { grid-column: span 2; }
.compact .moves { grid-template-columns: 1fr 1fr; gap: 6px; }

@media (max-width: 720px) {
  .row3 { grid-template-columns: 1fr; }
  .row3 .fld:last-child { grid-column: auto; }
  .moves { grid-template-columns: 1fr; }
  .stats-head, .stat-row { grid-template-columns: 48px 1fr 50px 40px; }
  .extra { display: none; }
}
</style>
