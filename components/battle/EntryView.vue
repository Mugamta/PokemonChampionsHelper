<!--
  선출 화면 (싱글 3마리 / 더블 4마리 공용)
  왼쪽: 내 파티 (눌러서 선출 순서 지정) · 가운데: 데미지 표 · 오른쪽: 상대 6마리 입력
  선출 전에는 내 파티 6마리 전체를 기준으로 표를 보여줘서 선출 판단에 쓸 수 있게 한다.
  할 일이 보이도록 위에 단계(상대 입력 → 선출 → 배틀 시작)를 두고, 자세한 정보는 기본으로 접어 둔다
  (내 파티 = 한 줄, 상대 = 포켓몬 이름 줄만, 데미지 칸 = % 와 KO 판정만, 계산 조건 = 버튼 안).
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">
          {{ t(mode === 'single' ? 'entry.titleSingle' : 'entry.titleDouble') }}
        </h1>
        <ol class="steps">
          <li
            v-for="(st, k) in steps"
            :key="st.key"
            :class="{ done: st.done, now: k === stepNow }"
            :title="st.hint"
          >
            <span class="step-no num">{{ st.done ? '✓' : k + 1 }}</span>
            <span>{{ st.label }}</span>
            <span v-if="st.count" class="num step-count">{{ st.count }}</span>
          </li>
        </ol>
      </div>
      <div class="head-actions">
        <!-- 성별 미입력 (내 쪽은 파티 완성 조건이라 막음, 상대는 경고만) -->
        <span v-if="mineGenderNames" class="warn-text small">{{
          t('party.genderMissing', { names: mineGenderNames })
        }}</span>
        <span v-if="oppGenderNames" class="warn-text small">{{
          t('entry.oppGenderMissing', { names: oppGenderNames })
        }}</span>
        <!-- 상대 입력·선출이 덜 된 것은 위 단계 표시로 보이므로 그 외(파티 미완성)만 -->
        <span v-if="blocker === partyBlocker" class="warn-text small">{{ blocker }}</span>
        <NuxtLink
          :to="`/${mode}/battle`"
          class="btn btn-primary"
          :class="{ disabled: !!blocker }"
          @click="(e: MouseEvent) => blocker && e.preventDefault()"
          >{{ t('entry.toBattle') }} →</NuxtLink
        >
      </div>
    </div>

    <div class="layout">
      <section class="col mine-col fit-scroll">
        <h2 class="panel-title">
          {{ t('common.mine') }}
          <span class="spacer" />
          <span class="muted small num">{{ entry.picks.value.length }}/{{ entry.max }}</span>
          <button type="button" class="btn btn-sm" @click="foldAll('mine')">
            {{ allFolded('mine') ? t('entry.unfoldAll') : t('entry.foldAll') }}
          </button>
        </h2>
        <!-- 선출·선두 추천 (누를 때 계산) -->
        <BattlePickRecommend :mode="mode" :field="fieldState" />
        <template v-for="(s, i) in mine.slots.value" :key="i">
          <BattleSlotMini
            v-if="folded.mine[i]"
            :slot="s"
            :mega-on="mine.megaOn.value[i]"
            :alt-on="mine.altOn.value[i]"
            :order="entry.order(i)"
            :dim="entry.isFull.value && entry.order(i) == null"
            :warn="mine.missingGender.value.includes(i)"
            selectable
            @select="entry.toggle(i)"
            @expand="folded.mine[i] = false"
          />
          <div v-else class="slot-wrap" :class="{ warn: mine.missingGender.value.includes(i) }">
            <TeamSlotCard
              :slot="s"
              v-model:mega-on="mine.megaOn.value[i]"
              v-model:alt-on="mine.altOn.value[i]"
              mega-toggle
              form-toggle
              :order="entry.order(i)"
              :dim="entry.isFull.value && entry.order(i) == null"
              :spread="mode === 'double'"
              :field="field"
              clickable
              @select="entry.toggle(i)"
              @update:weather="field.weather = $event"
            />
            <button
              type="button"
              class="fold-btn"
              :title="t('entry.fold')"
              :aria-label="t('entry.fold')"
              @click="folded.mine[i] = true"
            >
              ▴
            </button>
          </div>
        </template>
      </section>

      <section class="col center-col">
        <div class="tabs">
          <button
            type="button"
            class="tab"
            :class="{ active: dir === 'mine' }"
            @click="dir = 'mine'"
          >
            {{ t('common.mine') }} → {{ t('common.opponent') }}
          </button>
          <button type="button" class="tab" :class="{ active: dir === 'opp' }" @click="dir = 'opp'">
            {{ t('common.opponent') }} → {{ t('common.mine') }}
          </button>
          <span class="spacer" />
          <!-- 계산 조건 (날씨·필드·급소): 평소엔 버튼 하나, 누르면 고르는 창 -->
          <v-menu location="bottom end" :close-on-content-click="false" :offset="6">
            <template #activator="{ props: mp }">
              <button type="button" class="tab cond-btn" :class="{ on: !!condSummary }" v-bind="mp">
                {{ t('entry.conditions') }}: {{ condSummary || t('entry.conditionsNone') }}
              </button>
            </template>
            <div class="panel panel-pad cond-pop">
              <BattleFieldBar
                v-model:weather="field.weather"
                v-model:terrain="field.terrain"
                v-model:crit="crit"
              />
            </div>
          </v-menu>
          <label class="detail-toggle" :title="t('common.detailHint')">
            <input v-model="prefs.damageDetail" type="checkbox" />
            {{ t('common.detail') }}
          </label>
        </div>
        <p v-if="mode === 'double'" class="muted small legend">{{ t('entry.spreadLegend') }}</p>

        <div class="matrices">
          <template v-if="dir === 'mine'">
            <BattleDamageMatrix
              v-for="a in myAttackers"
              :key="'m' + a.i"
              :attacker="a.r"
              :defenders="oppResolved"
              :title="t('entry.mineToOpp', { name: a.r ? gd.name('pokemon', a.r.species.id) : '' })"
              :field="fieldState"
              :crit="crit"
              :doubles="mode === 'double'"
            />
          </template>
          <template v-else>
            <BattleDamageMatrix
              v-for="(o, i) in oppResolved"
              :key="'o' + i"
              :attacker="o"
              :defenders="myAttackers.map((a) => a.r)"
              :title="
                t('entry.oppToMine', {
                  name: o ? gd.name('pokemon', o.species.id) : `${t('common.opponent')} ${i + 1}`,
                })
              "
              :field="fieldState"
              :crit="crit"
              :doubles="mode === 'double'"
            />
          </template>
        </div>
      </section>

      <section class="col opp-col fit-scroll">
        <h2 class="panel-title">
          {{ t('entry.opponentTitle') }}
          <span class="spacer" />
          <!-- 게임 선출 화면 스크린샷으로 상대 6마리 입력 -->
          <BattleScreenRecog @apply="applyRecog" />
          <button
            type="button"
            class="btn btn-sm"
            :title="t('entry.autoSetHint')"
            :disabled="!opp.filled.value"
            @click="autoSetAll"
          >
            {{ t('entry.autoSet') }}
          </button>
          <button type="button" class="btn btn-sm btn-danger" @click="opp.reset()">
            {{ t('common.reset') }}
          </button>
          <button type="button" class="btn btn-sm" @click="foldAll('opp')">
            {{ allFolded('opp') ? t('entry.unfoldAll') : t('entry.foldAll') }}
          </button>
        </h2>
        <!-- 접힌 상태 = 포켓몬 이름 줄만 (특성·도구·배분·기술은 고르면 자동 배치, 펼치면 고칠 수 있음) -->
        <template v-for="(_, i) in opp.slots.value" :key="i">
          <div class="slot-wrap opp-wrap" :class="{ warn: oppMissingGender.includes(i) }">
            <TeamSlotEditor
              v-model:slot="opp.slots.value[i]!"
              v-model:mega-on="opp.megaOn.value[i]!"
              v-model:alt-on="opp.altOn.value[i]!"
              v-model:field-weather="field.weather"
              :usage-kind="mode"
              :index="i"
              auto-set
              :species-ids="reg.selectableSpecies.value"
              :exclude-species="
                opp.slots.value
                  .filter((_, j) => j !== i)
                  .map((s) => s.species)
                  .filter(Boolean)
              "
              :exclude-items="
                opp.slots.value
                  .filter((_, j) => j !== i)
                  .map((s) => s.item)
                  .filter(Boolean)
              "
              compact
              :brief="folded.opp[i]"
            />
            <button
              v-if="opp.slots.value[i]!.species"
              type="button"
              class="fold-btn"
              :title="t(folded.opp[i] ? 'entry.unfold' : 'entry.fold')"
              :aria-label="t(folded.opp[i] ? 'entry.unfold' : 'entry.fold')"
              @click="folded.opp[i] = !folded.opp[i]"
            >
              {{ folded.opp[i] ? '▾' : '▴' }}
            </button>
          </div>
        </template>
        <!-- 자동 배치에 쓰는 사용률 통계의 출처·시점 -->
        <TeamUsageSource :kind="mode" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
// 같은 모듈에서 타입만 import 하면 자동 import 가 그 모듈의 함수를 건너뛰므로 함수도 명시적으로 import
import { useEntry, type BattleMode } from '~/composables/useEntry'
import type { Gender, Terrain, Weather } from '~/utils/types'

const props = defineProps<{ mode: BattleMode }>()
const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const calc = useTeamCalc()
const mine = useTeam('mine')
const opp = useTeam('opp')
const entry = useEntry(props.mode)
const auto = useAutoSet(props.mode)
// 상대 파티 전체를 자동 배치로 다시 채움 (포켓몬을 고를 때도 자동으로 채워진다)
const autoSetAll = async () => {
  await auto.ready()
  opp.slots.value.forEach((s, i) => {
    if (!s.species) return
    // 도구 중복 금지: 앞 슬롯들이 이미 고른 도구는 피함
    auto.apply(
      s,
      opp.slots.value.filter((_, j) => j < i).map((x) => x.item),
    )
    opp.megaOn.value[i] = true
  })
}

// 스크린샷 인식 결과 적용: 종을 바꾸면 슬롯 편집기가 자동 배치하고 성별을 비우므로, 성별은 그다음에 넣는다
const applyRecog = async (mons: { species: string; gender: Gender }[]) => {
  mons.forEach((m, i) => {
    const s = opp.slots.value[i]
    if (s && m.species) s.species = m.species
  })
  await nextTick()
  mons.forEach((m, i) => {
    const s = opp.slots.value[i]
    if (s && m.species === s.species && m.gender && !gd.pokemon(m.species)?.gender)
      s.gender = m.gender
  })
}

const field = reactive<{ weather: Weather; terrain: Terrain }>({ weather: '', terrain: '' })
const crit = ref(false)
const dir = ref<'mine' | 'opp'>('mine')
const fieldState = computed(() => ({ ...field, doubles: props.mode === 'double' }))
const prefs = useViewPrefs()
// 계산 조건 버튼에 켜 둔 조건 이름
const condSummary = computed(() =>
  [
    field.weather && t('weather.' + field.weather),
    field.terrain && t('terrain.' + field.terrain),
    crit.value && t('common.crit'),
  ]
    .filter(Boolean)
    .join(' · '),
)

// ── 단계: 상대 입력 → 선출 → 배틀 시작 (지금 할 단계를 강조) ─────────────
const oppFilled = computed(() => opp.slots.value.filter((s) => s.species).length)
const steps = computed(() => [
  {
    key: 'opp',
    label: t('entry.step.opp'),
    count: `${oppFilled.value}/6`,
    done: oppFilled.value === 6,
    hint: t('entry.needOpponent'),
  },
  {
    key: 'pick',
    label: t('entry.step.pick'),
    count: `${entry.picks.value.length}/${entry.max}`,
    done: entry.isFull.value,
    hint: t('entry.pickHint', { n: entry.max }),
  },
  { key: 'start', label: t('entry.toBattle'), count: '', done: false, hint: '' },
])
const stepNow = computed(() => steps.value.findIndex((s) => !s.done))

// 선출했으면 선출한 포켓몬만, 아니면 파티 전체
const myAttackers = computed(() => {
  const idx = entry.picks.value.length
    ? entry.picks.value
    : mine.slots.value.map((_, i) => i).filter((i) => mine.slots.value[i]!.species)
  return idx.map((i) => ({
    i,
    r: calc.resolve(mine.slots.value[i], mine.megaOn.value[i], mine.altOn.value[i] ?? undefined),
  }))
})
const oppResolved = computed(() =>
  opp.slots.value.map((s, i) =>
    calc.resolve(s, opp.megaOn.value[i], opp.altOn.value[i] ?? undefined),
  ),
)

// ── 슬롯 접기 (기본 = 접힘, 화면을 옮겨도 유지) ─────────────
// 내 쪽 = 한 줄(BattleSlotMini), 상대 = 포켓몬 이름 줄만(TeamSlotEditor brief)
const folded = useState('entry-folded', () => ({
  mine: Array(6).fill(true) as boolean[],
  opp: Array(6).fill(true) as boolean[],
}))
const allFolded = (side: 'mine' | 'opp') => folded.value[side].every(Boolean)
const foldAll = (side: 'mine' | 'opp') => {
  folded.value[side] = Array(6).fill(!allFolded(side))
}

// ── 성별 미입력 (선출 전에 확인할 수 있는 정보) ─────────────
// 내 쪽은 파티 완성 조건(useTeam.missingGender), 상대는 성별이 둘 다 가능한 종인데 안 고른 슬롯 → 붉은 테두리 + 경고(막지는 않음)
const oppMissingGender = computed(() =>
  opp.slots.value
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => {
      const p = s.species ? gd.pokemon(s.species) : null
      return !!p && !p.gender && !s.gender
    })
    .map(({ i }) => i),
)
const namesOf = (slots: { species: string }[], idx: number[]) =>
  idx.map((i) => gd.name('pokemon', slots[i]!.species)).join(', ')
const mineGenderNames = computed(() => namesOf(mine.slots.value, mine.missingGender.value))
const oppGenderNames = computed(() => namesOf(opp.slots.value, oppMissingGender.value))

const partyBlocker = computed(() => t('home.partyIncomplete'))
const blocker = computed(() => {
  // 성별만 빠졌으면 위의 성별 안내로 충분 (버튼은 막지만 문구는 하나만)
  const onlyGender =
    mine.slots.value.every((s) => s.species && s.moves.some(Boolean)) &&
    mine.missingGender.value.length > 0
  if (onlyGender) return ' '
  if (!mine.isComplete.value) return partyBlocker.value
  if (!opp.slots.value.every((s) => s.species)) return t('entry.needOpponent')
  if (!entry.isFull.value) return t('entry.needPick', { n: entry.max })
  return ''
})
</script>

<style scoped>
.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.head-actions .btn {
  text-decoration: none;
}
/* 펼친 슬롯: 오른쪽 위 접기 버튼, 성별 미입력은 붉은 테두리 */
.slot-wrap {
  position: relative;
  border-radius: var(--radius);
}
.slot-wrap.warn > :first-child {
  border-color: var(--bad);
  box-shadow: 0 0 0 1px var(--bad);
}
.fold-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  border: 1px solid var(--line);
  background: var(--well);
  color: var(--text-2);
  border-radius: 6px;
  width: 22px;
  height: 22px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  line-height: 1;
}
.fold-btn:hover {
  background: var(--hover);
}
/* 내 카드의 선출 순서 배지·상대 입력의 머리줄이 접기 버튼과 겹치지 않게 */
.slot-wrap :deep(.order) {
  right: 34px;
}
.opp-wrap :deep(.slot-head) {
  padding-right: 24px;
}
.btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.small {
  font-size: 12px;
}
/* 단계 표시: 지금 할 단계는 강조, 끝난 단계는 ✓ */
.steps {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
}
.steps li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 4px 5px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--text-3);
  font-size: 13px;
  font-weight: 700;
}
.step-no {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--well);
  font-size: 11px;
}
.step-count {
  font-size: 12px;
  color: var(--text-3);
}
.steps li.done {
  color: var(--text-2);
}
.steps li.done .step-no {
  background: var(--faint);
  color: var(--accent-text);
}
.steps li.now {
  color: var(--text);
  border-color: var(--accent-text);
  box-shadow: 0 0 0 1px var(--accent);
}
.steps li.now .step-no {
  background: var(--accent);
  color: var(--accent-ink);
}
.tabs .spacer {
  flex: 1;
}
.cond-btn {
  font-weight: 600;
}
.cond-btn.on {
  border-color: var(--accent-2);
  color: var(--text);
}
.cond-pop {
  max-width: 560px;
}
.detail-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
  cursor: pointer;
}
.layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 460px;
  gap: 14px;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.panel-title {
  margin: 0;
}
.center-col {
  position: sticky;
  top: 76px;
  max-height: calc(100vh - 92px);
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.tab {
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text-2);
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.tab.active {
  background: var(--accent-2);
  border-color: var(--accent-2);
  color: var(--on-accent-2);
}
.legend {
  margin: 0;
}
.matrices {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  padding-right: 2px;
}

@media (max-width: 1500px) {
  .layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }
  .opp-col {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .opp-col .panel-title {
    grid-column: 1 / -1;
  }
}
@media (max-width: 1000px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .center-col {
    position: static;
    max-height: none;
  }
  .mine-col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .mine-col .panel-title {
    grid-column: 1 / -1;
  }
  .opp-col {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .mine-col {
    grid-template-columns: 1fr;
  }
}

/* 넓은 화면: 화면 높이에 맞추고 세 열이 따로 스크롤 (assets/css/main.css "PC 한 화면 배치") */
@media (min-width: 1400px) and (min-height: 700px) {
  .layout {
    flex: 1;
    min-height: 0;
    grid-template-columns: 300px minmax(0, 1fr) 440px;
    align-items: stretch;
  }
  .col {
    padding-right: 2px;
  }
  .center-col {
    position: static;
    max-height: none;
    min-height: 0;
  }
  .opp-col {
    display: flex;
    grid-column: auto;
  }
}
</style>
