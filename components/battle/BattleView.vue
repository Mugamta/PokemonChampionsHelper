<!--
  배틀 화면 (싱글 1:1 / 더블 2:2 공용)
  왼쪽: 내 필드 + 대기 · 가운데: 필드/스피드/행동/예상 흐름 · 오른쪽: 상대 필드 + 확인된/후보 포켓몬
  아래: 예상 데미지 표 (내 공격 시나리오 / 상대 기술)
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">
          {{ t(mode === 'single' ? 'battle.titleSingle' : 'battle.titleDouble') }}
        </h1>
        <p
          v-if="b.N > 1"
          class="page-sub"
        >
          {{ t('battle.focusHint') }}
        </p>
      </div>
      <div class="head-actions">
        <NuxtLink
          :to="`/${mode}`"
          class="btn btn-sm"
        >← {{ t('nav.entry') }}</NuxtLink>
        <button
          type="button"
          class="btn btn-sm btn-danger"
          @click="onReset"
        >
          {{ t('common.reset') }}
        </button>
      </div>
    </div>

    <div
      v-if="blocked"
      class="panel empty-state"
    >
      <p>{{ blocked }}</p>
      <NuxtLink
        :to="`/${mode}`"
        class="btn btn-primary"
      >{{ t(mode === 'single' ? 'entry.titleSingle' : 'entry.titleDouble') }}</NuxtLink>
    </div>

    <template v-else-if="b.state.value">
      <div class="layout">
        <section class="col">
          <BattleMonPanel
            v-for="k in b.N"
            :key="'m' + k"
            :b="b"
            :an="an"
            side="mine"
            :slot="k - 1"
            :focused="b.N > 1 && s.focus.mine === k - 1"
            :selectable="b.N > 1"
            @focus="s.focus.mine = k - 1"
          />
          <div class="bench">
            <span class="section-label">{{ t('battle.bench') }}</span>
            <TeamSlotCard
              v-for="i in mineBench"
              :key="i"
              :slot="b.mineSlots.value[i]!"
              :mega-on="s.sides.mine.mons[i]!.megaOn"
              :fainted="b.isFainted('mine', i)"
              compact
              clickable
              @select="s.preview = i"
            >
              <template #extra>
                <UiHpBar
                  :percent="(s.sides.mine.mons[i]!.hp / Math.max(1, b.maxHp('mine', i))) * 100"
                  :label="`${s.sides.mine.mons[i]!.hp}/${b.maxHp('mine', i)}`"
                />
              </template>
            </TeamSlotCard>
          </div>
        </section>

        <section class="col center">
          <BattleFieldPanel :b="b" />
          <BattleActionPanel
            :b="b"
            :an="an"
          />
          <BattleForecastPanel :an="an" />
          <BattleSpeedPanel
            :b="b"
            :an="an"
          />
        </section>

        <section class="col">
          <BattleMonPanel
            v-for="k in b.N"
            :key="'o' + k"
            :b="b"
            :an="an"
            side="opp"
            :slot="k - 1"
            :focused="b.N > 1 && s.focus.opp === k - 1"
            :selectable="b.N > 1"
            @focus="s.focus.opp = k - 1"
          />
          <div class="opp-list panel panel-pad">
            <span class="section-label">{{ t('battle.revealed') }}</span>
            <div class="mini-row">
              <button
                v-for="i in s.sides.opp.revealed"
                :key="i"
                type="button"
                class="mini"
                :class="{ active: s.sides.opp.active.includes(i) }"
                :disabled="b.isFainted('opp', i)"
                @click="b.sendOut('opp', s.focus.opp, i)"
              >
                <UiPokeSprite
                  :id="b.resolveAt('opp', i)?.species.id || null"
                  :size="40"
                  :fainted="b.isFainted('opp', i)"
                />
                <span>{{ gd.name('pokemon', b.resolveAt('opp', i)?.species.id) }}</span>
                <UiHpBar :percent="s.sides.opp.mons[i]!.hp" />
              </button>
              <span
                v-if="!s.sides.opp.revealed.length"
                class="muted small"
              >—</span>
            </div>
            <template v-if="s.sides.opp.revealed.length < (b.N === 1 ? 3 : 4)">
              <span class="section-label">{{ t('battle.candidates') }}</span>
              <div class="mini-row">
                <button
                  v-for="i in oppCandidates"
                  :key="i"
                  type="button"
                  class="mini cand"
                  @click="b.sendOut('opp', s.focus.opp, i)"
                >
                  <UiPokeSprite
                    :id="b.resolveAt('opp', i)?.species.id || null"
                    :size="40"
                  />
                  <span>{{ gd.name('pokemon', b.resolveAt('opp', i)?.species.id) }}</span>
                </button>
              </div>
            </template>
          </div>
        </section>
      </div>

      <div class="tables">
        <BattleScenarioTable
          :b="b"
          :an="an"
        />
        <BattleIncomingTable
          :b="b"
          :an="an"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useEntry, type BattleMode } from '~/composables/useEntry'
import { useBattle } from '~/composables/useBattle'
import { useBattleAnalysis } from '~/composables/useBattleAnalysis'

const props = defineProps<{ mode: BattleMode }>()
const { t } = useI18n()
const gd = useGameData()
const entry = useEntry(props.mode)
const opp = useTeam('opp')
const b = useBattle(props.mode)
const an = useBattleAnalysis(b)

const blocked = computed(() => {
  if (!entry.isFull.value) return t('entry.needPick', { n: entry.max })
  if (!opp.slots.value.every((s) => s.species)) return t('entry.needOpponent')
  return ''
})
watchEffect(() => {
  if (!blocked.value) b.ensure()
})
const s = computed(() => b.state.value!)

const mineBench = computed(() => s.value.sides.mine.mons.map((_, i) => i).filter((i) => !s.value.sides.mine.active.includes(i)))
const oppCandidates = computed(() =>
  b.oppSlots.value.map((_, i) => i).filter((i) => b.oppSlots.value[i]?.species && !s.value.sides.opp.revealed.includes(i)),
)
const onReset = () => {
  if (window.confirm(t('battle.resetConfirm'))) b.reset()
}
</script>

<style scoped>
.head-actions { display: flex; gap: 8px; }
.head-actions .btn { text-decoration: none; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.empty-state .btn { text-decoration: none; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.bench { display: flex; flex-direction: column; gap: 8px; }
.opp-list { display: flex; flex-direction: column; gap: 8px; }
.mini-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.mini {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.2);
  color: var(--text);
  font: inherit; font-size: 11px; font-weight: 700;
  cursor: pointer;
}
.mini:hover:not(:disabled) { border-color: var(--opp); }
.mini.active { border-color: var(--opp); box-shadow: 0 0 0 1px var(--opp); }
.mini.cand { opacity: 0.75; border-style: dashed; }
.mini:disabled { opacity: 0.4; cursor: default; }
.mini :deep(.hp) { width: 100%; }
.small { font-size: 12px; }
.tables { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }

@media (max-width: 1400px) {
  .layout { grid-template-columns: 1fr 1fr; }
  .center { grid-column: 1 / -1; order: 3; }
  .tables { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
