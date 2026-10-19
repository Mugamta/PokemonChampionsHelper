<!--
  파티 슬롯 편집 카드. 파티 화면(full)과 선출 화면의 상대 입력(compact) 양쪽에서 쓴다.
  slot 은 useTeam().slots 의 원소를 그대로 받아 직접 수정한다.
-->
<template>
  <article class="slot panel" :class="{ compact, narrow, empty: !slot.species }">
    <header class="slot-head">
      <!-- 번호는 선출 화면의 상대 입력에서만 (파티 화면에는 불필요) -->
      <span v-if="compact" class="slot-no num">{{ index + 1 }}</span>
      <UiPokeSprite :id="resolved?.species.id || null" :size="compact || narrow ? 56 : 84" />
      <div class="head-main">
        <TeamSpeciesPicker v-model="slot.species" :ids="speciesIds" :exclude="excludeSpecies" />
        <div v-if="resolved" class="head-meta">
          <UiTypeGroup :types="resolved.species.types" small />
          <label v-if="resolved.megaId" class="mega-switch">
            <input v-model="megaOn" type="checkbox" />
            <span>{{ megaOn ? gd.name('pokemon', resolved.megaId) : t('common.mega') }}</span>
          </label>
          <span
            v-if="resolved.formId"
            class="form-note small"
            :title="t('party.formNote.' + resolved.formId)"
            >{{ t('battle.form.' + resolved.formId)
            }}{{ resolved.isAlt ? '' : ` (${t('party.formOnAttack')})` }}</span
          >
          <span v-if="notAllowed" class="warn-text small">{{ t('party.notInRegulation') }}</span>
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
            <option v-if="resolved.isMega" :value="slot.ability">
              {{ gd.name('abilities', resolved.ability) }}
            </option>
            <option
              v-for="a in resolved.base.abilities"
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
          <span class="section-label">{{ t('common.item') }}</span>
          <TeamItemPicker v-model="slot.item" :species="slot.species" :exclude="excludeItems" />
        </label>
        <label class="fld">
          <span class="section-label">{{ t('common.nature') }}</span>
          <TeamNaturePicker v-model="slot.nature" />
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
        <div v-for="k in STAT_KEYS" :key="k" class="stat-row">
          <span class="stat-name">{{ t('stat.' + k) }}</span>
          <span v-if="!compact" class="base">
            <span class="num">{{ resolved.species.stats[k] }}</span>
            <span class="base-track">
              <span
                class="base-bar"
                :style="{
                  width: Math.min(100, (resolved.species.stats[k] / 180) * 100) + '%',
                }"
              />
            </span>
          </span>
          <input
            v-model.number="slot.sp[k]"
            type="number"
            min="0"
            :max="SP_PER_STAT_MAX"
            class="field-input sp num"
            :class="{ invalid: !spValid }"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <span class="actual num" :class="natureClass(k)">{{ resolved.stats[k] }}</span>
          <span v-if="!compact" class="extra">
            <template v-if="k === 'hp' && hpHint">
              <span :class="hpHint.ok ? 'good-text' : 'muted'"
                >{{ hpHint.label }} {{ hpHint.ok ? '✓' : '✗' }}</span
              >
            </template>
            <template v-else-if="k === 'def'"
              >{{ t('stat.physBulk') }} <b class="num">{{ bulk('def') }}</b></template
            >
            <template v-else-if="k === 'spd'"
              >{{ t('stat.specBulk') }} <b class="num">{{ bulk('spd') }}</b></template
            >
          </span>
        </div>
        <div class="sp-total" :class="{ 'bad-text': !spValid }">
          {{ t('stat.spTotal', { used: spTotal(slot.sp), max: SP_TOTAL_MAX }) }}
          <span v-if="spValid && spTotal(slot.sp) < SP_TOTAL_MAX" class="sp-left">{{
            t('stat.spLeft', { n: SP_TOTAL_MAX - spTotal(slot.sp) })
          }}</span>
          <span v-if="!spValid">
            · {{ t('stat.spOver', { per: SP_PER_STAT_MAX, max: SP_TOTAL_MAX }) }}</span
          >
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
          :ability="resolved.ability"
          :field="previewField"
          :show-info="!compact"
        />
      </div>

      <!-- 결정력 미리보기 조건: 누르면 떠 있는 창으로 (카드 높이가 바뀌지 않게). 켜 둔 조건은 버튼에 이름으로 표시 -->
      <div v-if="!compact" class="preview">
        <v-menu location="top start" :close-on-content-click="false" :offset="6">
          <template #activator="{ props: mp, isActive }">
            <button
              type="button"
              class="pv-toggle section-label"
              :class="{ open: isActive }"
              v-bind="mp"
            >
              {{ t('party.previewConditions') }}
              <span v-if="previewSummary" class="pv-on">{{ previewSummary }}</span>
            </button>
          </template>
          <div class="pv-pop">
            <div class="pv-group">
              <span class="pv-label">{{ t('weather.label') }}</span>
              <!-- 4칸 격자: 쾌청/큰가뭄, 비/폭우, 모래바람/난기류가 같은 세로줄 -->
              <div class="chip-row weather-grid">
                <button
                  v-for="w in WEATHERS"
                  :key="w"
                  type="button"
                  class="chip"
                  :class="{ active: preview.weather === w }"
                  @click="preview.weather = preview.weather === w ? '' : w"
                >
                  {{ t('weather.' + w) }}
                </button>
              </div>
            </div>
            <div class="pv-group">
              <span class="pv-label">{{ t('terrain.label') }}</span>
              <div class="chip-row">
                <button
                  v-for="tr in TERRAINS"
                  :key="tr"
                  type="button"
                  class="chip"
                  :class="{ active: preview.terrain === tr }"
                  @click="preview.terrain = preview.terrain === tr ? '' : tr"
                >
                  {{ t('terrain.' + tr) }}
                </button>
              </div>
            </div>
            <div class="pv-group">
              <span class="pv-label">{{ t('party.previewStatus') }}</span>
              <div class="chip-row">
                <button
                  v-for="s in ['brn', 'par'] as const"
                  :key="s"
                  type="button"
                  class="chip warn"
                  :class="{ active: preview.status === s }"
                  @click="preview.status = preview.status === s ? '' : s"
                >
                  {{ t('status.' + s) }}
                </button>
              </div>
            </div>
          </div>
        </v-menu>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import {
  STAT_KEYS,
  type StatKey,
  type Status,
  type TeamSlot,
  type Terrain,
  type Weather,
} from '~/utils/types'
import { SP_PER_STAT_MAX, SP_TOTAL_MAX, isSpValid, spTotal } from '~/utils/stats'
import { hpRemainderHint } from '~/utils/ko'

const slot = defineModel<TeamSlot>('slot', { required: true })
const megaOn = defineModel<boolean>('megaOn', { default: true })
defineProps<{
  index: number
  speciesIds: string[]
  excludeSpecies?: string[]
  excludeItems?: string[]
  compact?: boolean
  narrow?: boolean // 폭이 좁은 카드 (넓은 화면에서 파티 6장을 한 줄로 놓을 때)
  notAllowed?: boolean
}>()

const { t } = useI18n()
const gd = useGameData()
const calc = useTeamCalc()

const WEATHERS: Weather[] = ['sun', 'rain', 'sand', 'snow', 'harshsun', 'heavyrain', 'strongwinds']
const TERRAINS: Terrain[] = ['electric', 'grassy', 'misty', 'psychic']
const preview = reactive<{ weather: Weather; terrain: Terrain; status: Status }>({
  weather: '',
  terrain: '',
  status: '',
})
const previewField = computed(() => ({ weather: preview.weather, terrain: preview.terrain }))
const previewStatus = computed(() => preview.status)
// 켜 둔 조건 이름 (접힌 상태 요약용)
const previewSummary = computed(() =>
  [
    preview.weather && t('weather.' + preview.weather),
    preview.terrain && t('terrain.' + preview.terrain),
    preview.status && t('status.' + preview.status),
  ]
    .filter(Boolean)
    .join(' · '),
)

const resolved = computed(() => calc.resolve(slot.value, megaOn.value))
const learnset = computed(() => gd.learnset(slot.value.species))
const spValid = computed(() => isSpValid(slot.value.sp))
const hpHint = computed(() =>
  resolved.value
    ? hpRemainderHint(
        resolved.value.stats.hp,
        resolved.value.ability,
        slot.value.item,
        slot.value.moves,
      )
    : null,
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

const natureClass = (k: StatKey) => {
  const n = resolved.value?.nature
  return n?.plus === k ? 'up' : n?.minus === k ? 'down' : ''
}
// 내구 지수 = HP × 방어 / 0.411 (기존 계산식 유지)
const bulk = (k: 'def' | 'spd') => {
  const s = resolved.value?.stats
  return s ? Math.floor((s.hp * s[k]) / 0.411).toLocaleString() : 0
}
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
  height: 3px;
  background: var(--line-strong);
}
.slot.empty::before {
  opacity: 0.4;
}
.slot-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.slot-no {
  align-self: flex-start;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: var(--panel-3);
  font-size: 13px;
  font-weight: 800;
  color: var(--accent-text);
}
.head-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* 메가진화 스위치 유무와 관계없이 같은 높이 (옆 카드와 아래 줄이 맞도록) */
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
  padding: 2px 8px 2px 6px;
  border-radius: 999px;
  background: var(--faint);
  border: 1px solid var(--line-strong);
  color: var(--text-2);
  cursor: pointer;
}
.mega-switch:has(input:checked) {
  color: var(--accent-2);
  border-color: var(--accent-2);
}
.small {
  font-size: 11px;
}
.form-note {
  color: var(--accent-2);
  font-weight: 700;
  cursor: help;
}

.row3 {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 8px;
}
.row3 .fld:last-child {
  grid-column: span 2;
}
.fld {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.stats {
  display: grid;
  gap: 3px;
}
.stats-head,
.stat-row {
  display: grid;
  grid-template-columns: 56px 1fr 54px 44px 1.3fr;
  align-items: center;
  gap: 8px;
}
.stat-name {
  font-size: 12px;
  color: var(--text-2);
  font-weight: 600;
}
/* 종족값: 숫자(고정 폭) + 막대 (180 = 가득) */
.base {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.base .num {
  flex: 0 0 24px;
  text-align: right;
  font-size: 12px;
  color: var(--text-2);
}
.base-track {
  flex: 1;
  height: 7px;
  border-radius: 4px;
  background: var(--well);
  overflow: hidden;
}
.base-bar {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: color-mix(in srgb, var(--text-2) 55%, transparent);
}
.sp {
  padding: 3px 6px;
  text-align: center;
}
.actual {
  text-align: right;
  font-weight: 700;
  font-size: 15px;
}
.actual.up {
  color: var(--nature-up);
}
.actual.down {
  color: var(--nature-down);
}
.extra {
  font-size: 11px;
  color: var(--text-3);
}
.extra b {
  color: var(--text-2);
}
.sp-total {
  font-size: 11px;
  color: var(--text-3);
  text-align: right;
}
.sp-left {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  font-weight: 700;
  color: var(--warn);
}

.moves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.slot.narrow .row3,
.slot.narrow .moves {
  grid-template-columns: minmax(0, 1fr);
}
.slot.narrow .row3 .fld:last-child {
  grid-column: auto;
}
/* 좁은 카드(넓은 화면 파티 6장): 세로 공간 절약 — 기술 4개를 다 넣어도 FHD 한 화면에 */
.slot.narrow {
  padding: 10px 12px 8px;
  gap: 6px;
}
.slot.narrow .preview {
  padding-top: 5px;
}
/* 특성/도구/성격: 이름표를 칸 왼쪽에 */
.slot.narrow .row3 {
  gap: 5px;
}
.slot.narrow .fld {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.slot.narrow .fld > .section-label {
  flex: 0 0 46px;
  margin: 0;
}
.slot.narrow .fld > :not(.section-label) {
  flex: 1;
  min-width: 0;
}
/* 특성(기본 select)·도구·성격(Vuetify) 입력칸 높이를 같게 */
/* 높이를 고정하므로 위아래 여백은 0 (여백이 있으면 글자가 잘림) */
.row3 select.field-input {
  height: 36px;
  padding-top: 0;
  padding-bottom: 0;
}
.row3 :deep(.v-field__input) {
  min-height: 36px;
  padding-top: 5px;
  padding-bottom: 5px;
}
.slot.narrow .stats {
  gap: 1px;
}
.slot.narrow .sp {
  height: 23px;
}
.slot.narrow .row3 select.field-input {
  height: 34px;
}
.slot.narrow .row3 :deep(.v-field__input) {
  min-height: 34px;
  padding-top: 4px;
  padding-bottom: 4px;
}
.slot.narrow .extra {
  font-size: 10px;
  line-height: 1.1;
}
.slot.narrow .moves {
  gap: 4px;
}
.slot.narrow .stats-head,
.slot.narrow .stat-row {
  grid-template-columns: 38px minmax(0, 1fr) 44px 34px 56px;
  gap: 6px;
}
.slot.narrow .sp {
  padding: 1px 4px;
}
.slot.narrow .moves :deep(.v-field__input) {
  min-height: 34px;
  padding-top: 4px;
  padding-bottom: 4px;
}
.pv-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit; /* 크기·굵기는 .section-label 그대로 */
  cursor: pointer;
  text-align: left;
}
.pv-toggle::before {
  content: '▸';
  color: var(--text-3);
}
.pv-toggle.open::before {
  content: '▴';
}
.pv-toggle:hover {
  color: var(--text-2);
}
/* 떠 있는 창 (body 로 옮겨져서 카드 안 스타일과 무관) */
.pv-pop {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 330px;
  padding: 10px 12px;
  background: var(--panel-solid);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  box-shadow: var(--shadow);
}
.pv-on {
  background: var(--accent-2);
  color: var(--on-accent-2);
  border-radius: 999px;
  padding: 0 7px;
  font-size: 10px;
  letter-spacing: 0;
}
/* 조건 묶음: 왼쪽 이름표 + 칩 */
.pv-group {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}
.weather-grid {
  display: grid;
  grid-template-columns: repeat(4, max-content);
}
.pv-label {
  padding-top: 5px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
}
.preview {
  padding-top: 8px;
  border-top: 1px dashed var(--line);
}

/* compact: 선출 화면의 상대 입력 */
.slot.compact {
  padding: 10px;
  gap: 8px;
}
.compact .stats-head,
.compact .stat-row {
  grid-template-columns: 1fr 52px 44px;
}
.compact .stats {
  grid-template-columns: 1fr 1fr;
  column-gap: 14px;
}
.compact .stats-head {
  display: none;
}
.compact .sp-total {
  grid-column: span 2;
}
.compact .moves {
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

@media (max-width: 720px) {
  .row3 {
    grid-template-columns: 1fr;
  }
  .row3 .fld:last-child {
    grid-column: auto;
  }
  .moves {
    grid-template-columns: 1fr;
  }
  .stats-head,
  .stat-row {
    grid-template-columns: 48px 1fr 50px 40px;
  }
  .extra {
    display: none;
  }
}
</style>
