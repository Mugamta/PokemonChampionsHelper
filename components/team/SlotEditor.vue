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
          <!-- 성별 (헤롱헤롱·헤롱헤롱바디 판정) -->
          <TeamGenderToggle v-model="slot.gender" :species="slot.species" :required="!autoSet" />
          <UiTypeGroup :types="shownTypes" small />
          <label v-if="resolved.megaId" class="mega-switch">
            <input v-model="megaOn" type="checkbox" />
            <span>{{ megaOn ? gd.name('pokemon', resolved.megaId) : t('common.mega') }}</span>
          </label>
          <!-- 배틀 폼 (킬가르도·돌핀맨·모르페코 체크 / 캐스퐁은 날씨 버튼) -->
          <TeamFormToggle v-model:alt-on="altOn" v-model:weather="castWeather" :r="resolved" />
          <span v-if="notAllowed" class="warn-text small">{{ t('party.notInRegulation') }}</span>
          <!-- 상대 파티: 자동 배치 기준 (사용률 통계 / 규칙) — 어느 쪽이든 추측 -->
          <span
            v-if="autoSet && slot.species"
            class="basis-tag"
            :title="
              usage
                ? t('usage.basisStatsHint', {
                    month: usage.month,
                    count: usage.count.toLocaleString(),
                  })
                : t('usage.basisRulesHint')
            "
            >{{
              usage ? t('usage.basisStats', { month: usage.month }) : t('usage.basisRules')
            }}</span
          >
          <!-- 내 파티: 사용률 통계 기준 추천 배치 (통계가 있는 포켓몬만) -->
          <button
            v-if="!autoSet && usage"
            type="button"
            class="btn btn-sm usage-btn"
            :title="
              t('party.usageHint', {
                format: auto.source.value?.format ?? '',
                month: usage.month,
                count: usage.count.toLocaleString(),
              })
            "
            @click="applyUsage"
          >
            {{ t('party.usageApply') }}
          </button>
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
          :power="calc.power(resolved, slot.moves[i]!, previewField, previewStatus, preview.ranks)"
          :hits="calc.hits(resolved, slot.moves[i]!)"
          :ability="resolved.ability"
          :species="calc.attackForm(resolved).species"
          :field="previewField"
          :show-info="!compact"
        />
      </div>

      <!-- 결정력 미리보기 조건. 화면에 남는 공간이 있으면 카드 안에 펼치고(previewInline),
           없으면 누르면 떠 있는 창으로 (카드 높이가 바뀌지 않게). 켜 둔 조건은 버튼에 이름으로 표시 -->
      <div v-if="!compact" class="preview" :class="{ inline: previewInline }">
        <template v-if="previewInline">
          <span class="section-label">{{ t('party.previewConditions') }}</span>
          <TeamPreviewConditions
            v-model:weather="preview.weather"
            v-model:terrain="preview.terrain"
            v-model:status="preview.status"
            v-model:ranks="preview.ranks"
            inline
          />
        </template>
        <v-menu v-else location="top start" :close-on-content-click="false" :offset="6">
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
          <TeamPreviewConditions
            v-model:weather="preview.weather"
            v-model:terrain="preview.terrain"
            v-model:status="preview.status"
            v-model:ranks="preview.ranks"
            class="pv-pop"
          />
        </v-menu>
      </div>
    </template>
  </article>
</template>

<script setup lang="ts">
import type { UsageKind } from '~/utils/autoSet'
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
import { typesInWeather } from '~/utils/damage'

const slot = defineModel<TeamSlot>('slot', { required: true })
const megaOn = defineModel<boolean>('megaOn', { default: true })
const props = defineProps<{
  index: number
  speciesIds: string[]
  excludeSpecies?: string[]
  excludeItems?: string[]
  compact?: boolean
  narrow?: boolean // 폭이 좁은 카드 (넓은 화면에서 파티 6장을 한 줄로 놓을 때)
  notAllowed?: boolean
  previewInline?: boolean // 결정력 미리보기 조건을 카드 안에 펼침 (파티 화면에 남는 공간이 있을 때)
  autoSet?: boolean // 포켓몬을 고르면 특성·도구·성격·능력 포인트·기술 자동 배치 (선출 화면 상대 파티)
  usageKind?: UsageKind // 사용률 통계 종류 (선출 화면 = 배틀 모드, 생략하면 사용자가 고른 종류)
}>()

const { t } = useI18n()
const gd = useGameData()
const calc = useTeamCalc()
const auto = useAutoSet(() => props.usageKind)

const preview = reactive<{
  weather: Weather
  terrain: Terrain
  status: Status
  ranks: { atk: number; spa: number }
}>({
  weather: '',
  terrain: '',
  status: '',
  ranks: { atk: 0, spa: 0 },
})
const previewField = computed(() => ({ weather: preview.weather, terrain: preview.terrain }))
const previewStatus = computed(() => preview.status)
// 켜 둔 조건 이름 (접힌 상태 요약용)
const previewSummary = computed(() =>
  [
    preview.weather && t('weather.' + preview.weather),
    preview.terrain && t('terrain.' + preview.terrain),
    preview.status && t('status.' + preview.status),
    ...(['atk', 'spa'] as const)
      .filter((k) => preview.ranks[k])
      .map((k) => `${t('stat.' + k)}${preview.ranks[k] > 0 ? '+' : ''}${preview.ranks[k]}`),
  ]
    .filter(Boolean)
    .join(' · '),
)

// 배틀 폼 (null = 기본값). 포켓몬을 바꾸면 기본값으로
const altOn = defineModel<boolean | null>('altOn', { default: null })
// 선출 화면(compact)의 화면 전체 날씨. 캐스퐁 모습 버튼이 바꾼다 (파티 화면은 카드의 미리보기 날씨)
const fieldWeather = defineModel<Weather>('fieldWeather', { default: '' })
const castWeather = computed<Weather>({
  get: () => (props.compact ? fieldWeather.value : preview.weather),
  set: (w) => {
    if (props.compact) fieldWeather.value = w
    else preview.weather = w
  },
})
const resolved = computed(() => calc.resolve(slot.value, megaOn.value, altOn.value ?? undefined))
// 캐스퐁은 날씨에 맞는 타입으로 표시
const shownTypes = computed(() =>
  resolved.value
    ? typesInWeather(resolved.value.species, resolved.value.ability, castWeather.value)
    : [],
)
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
// autoSet 이면 초기화 대신 자동 배치 (utils/autoSet.ts).
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
    slot.value.gender = '' // 포켓몬이 바뀌면 성별은 다시 고름 (정해진 종은 데이터를 따름)
    megaOn.value = true
    altOn.value = null
    if (id && props.autoSet) {
      const target = slot.value
      void auto.ready().then(() => {
        if (target === slot.value && target.species === id) auto.apply(target, props.excludeItems)
      })
      return
    }
    const p = gd.pokemon(id)
    slot.value.ability = p?.abilities[0] || ''
    slot.value.item = ''
    slot.value.moves = ['', '', '', '']
    if (!id) {
      slot.value.nature = 'serious'
      for (const k of STAT_KEYS) slot.value.sp[k] = 0
    }
  },
)

// 사용률 통계 기준 추천: 특성·도구·성격·능력 포인트·기술을 덮어씀 (기술이 이미 있으면 확인)
const usage = computed(() => (slot.value.species ? auto.usageInfo(slot.value.species) : null))
const applyUsage = () => {
  if (slot.value.moves.some(Boolean) && !window.confirm(t('party.usageConfirm'))) return
  auto.apply(slot.value, props.excludeItems, true)
  megaOn.value = true
}

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
.basis-tag {
  font-size: 10px;
  color: var(--text-3);
  border: 1px dashed var(--line);
  border-radius: 4px;
  padding: 0 4px;
  white-space: nowrap;
}
/* 사용률 통계 추천 버튼 (카드 머리 줄에 들어가도록 작게) */
.usage-btn {
  min-height: 22px;
  padding: 0 8px;
  font-size: 11px;
}
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
.preview {
  padding-top: 8px;
  border-top: 1px dashed var(--line);
}
.preview.inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
