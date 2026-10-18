<!--
  선출 화면 (싱글 3마리 / 더블 4마리 공용)
  왼쪽: 내 파티 (눌러서 선출 순서 지정) · 가운데: 데미지 표 · 오른쪽: 상대 6마리 입력
  선출 전에는 내 파티 6마리 전체를 기준으로 표를 보여줘서 선출 판단에 쓸 수 있게 한다.
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">
          {{ t(mode === 'single' ? 'entry.titleSingle' : 'entry.titleDouble') }}
        </h1>
        <p class="page-sub">
          {{ t('entry.pickHint', { n: entry.max }) }}
        </p>
      </div>
      <div class="head-actions">
        <span
          v-if="blocker"
          class="warn-text small"
        >{{ blocker }}</span>
        <NuxtLink
          :to="`/${mode}/battle`"
          class="btn btn-primary"
          :class="{ disabled: !!blocker }"
          @click="(e: MouseEvent) => blocker && e.preventDefault()"
        >{{ t('entry.toBattle') }} →</NuxtLink>
      </div>
    </div>

    <div class="panel panel-pad field-panel">
      <BattleFieldBar
        v-model:weather="field.weather"
        v-model:terrain="field.terrain"
        v-model:crit="crit"
      />
    </div>

    <div class="layout">
      <section class="col mine-col">
        <h2 class="panel-title">
          {{ t('common.mine') }}
          <span class="spacer" />
          <span class="muted small num">{{ entry.picks.value.length }}/{{ entry.max }}</span>
        </h2>
        <TeamSlotCard
          v-for="(s, i) in mine.slots.value"
          :key="i"
          :slot="s"
          :mega-on="mine.megaOn.value[i]"
          :order="entry.order(i)"
          :dim="entry.isFull.value && entry.order(i) == null"
          :spread="mode === 'double'"
          :field="field"
          clickable
          @select="entry.toggle(i)"
        />
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
          <button
            type="button"
            class="tab"
            :class="{ active: dir === 'opp' }"
            @click="dir = 'opp'"
          >
            {{ t('common.opponent') }} → {{ t('common.mine') }}
          </button>
          <span
            v-if="mode === 'double'"
            class="muted small legend"
          >{{ t('entry.spreadLegend') }}</span>
        </div>

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
              :title="t('entry.oppToMine', { name: o ? gd.name('pokemon', o.species.id) : `${t('common.opponent')} ${i + 1}` })"
              :field="fieldState"
              :crit="crit"
              :doubles="mode === 'double'"
            />
          </template>
        </div>
      </section>

      <section class="col opp-col">
        <h2 class="panel-title">
          {{ t('entry.opponentTitle') }}
          <span class="spacer" />
          <button
            type="button"
            class="btn btn-sm btn-danger"
            @click="opp.reset()"
          >
            {{ t('common.reset') }}
          </button>
        </h2>
        <TeamSlotEditor
          v-for="(_, i) in opp.slots.value"
          :key="i"
          v-model:slot="opp.slots.value[i]!"
          v-model:mega-on="opp.megaOn.value[i]!"
          :index="i"
          :species-ids="reg.selectableSpecies.value"
          :exclude-species="opp.slots.value.filter((_, j) => j !== i).map((s) => s.species).filter(Boolean)"
          :exclude-items="opp.slots.value.filter((_, j) => j !== i).map((s) => s.item).filter(Boolean)"
          compact
        />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
// 같은 모듈에서 타입만 import 하면 자동 import 가 그 모듈의 함수를 건너뛰므로 함수도 명시적으로 import
import { useEntry, type BattleMode } from '~/composables/useEntry'
import type { Terrain, Weather } from '~/utils/types'

const props = defineProps<{ mode: BattleMode }>()
const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const calc = useTeamCalc()
const mine = useTeam('mine')
const opp = useTeam('opp')
const entry = useEntry(props.mode)

const field = reactive<{ weather: Weather; terrain: Terrain }>({ weather: '', terrain: '' })
const crit = ref(false)
const dir = ref<'mine' | 'opp'>('mine')
const fieldState = computed(() => ({ ...field, doubles: props.mode === 'double' }))

// 선출했으면 선출한 포켓몬만, 아니면 파티 전체
const myAttackers = computed(() => {
  const idx = entry.picks.value.length ? entry.picks.value : mine.slots.value.map((_, i) => i).filter((i) => mine.slots.value[i]!.species)
  return idx.map((i) => ({ i, r: calc.resolve(mine.slots.value[i], mine.megaOn.value[i]) }))
})
const oppResolved = computed(() => opp.slots.value.map((s, i) => calc.resolve(s, opp.megaOn.value[i])))

const blocker = computed(() => {
  if (!mine.isComplete.value) return t('home.partyIncomplete')
  if (!opp.slots.value.every((s) => s.species)) return t('entry.needOpponent')
  if (!entry.isFull.value) return t('entry.needPick', { n: entry.max })
  return ''
})
</script>

<style scoped>
.head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.head-actions .btn { text-decoration: none; }
.btn.disabled { opacity: 0.4; cursor: not-allowed; }
.small { font-size: 12px; }
.field-panel { margin-bottom: 14px; }
.layout { display: grid; grid-template-columns: 300px minmax(0, 1fr) 460px; gap: 14px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.panel-title { margin: 0; }
.center-col { position: sticky; top: 76px; max-height: calc(100vh - 92px); }
.tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tab {
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text-2);
  font: inherit; font-weight: 700; font-size: 13px;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.tab.active { background: var(--accent-2); border-color: var(--accent-2); color: #04131a; }
.legend { margin-left: auto; }
.matrices { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-right: 2px; }

@media (max-width: 1500px) {
  .layout { grid-template-columns: 280px minmax(0, 1fr); }
  .opp-col { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .opp-col .panel-title { grid-column: 1 / -1; }
}
@media (max-width: 1000px) {
  .layout { grid-template-columns: 1fr; }
  .center-col { position: static; max-height: none; }
  .mine-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mine-col .panel-title { grid-column: 1 / -1; }
  .opp-col { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .mine-col { grid-template-columns: 1fr; }
}
</style>
