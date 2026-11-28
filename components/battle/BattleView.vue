<!--
  배틀 화면 (싱글 1:1 / 더블 2:2 공용)
  왼쪽: 내 필드 + 대기 · 가운데: 필드/스피드/행동/예상 흐름 · 오른쪽: 상대 필드 + 확인된/후보 포켓몬
  가운데 아래 탭: 예상 데미지 / 상대 기술 / 스피드 비교 / 상대 능력 추정 (매 턴 꼭 보지 않아도 되는 것은 탭 안에)
  넓은 화면(useFitLayout): 화면 높이에 맞추고 열마다 스크롤. 날씨/필드/공간은 가운데 위,
  진영 상태(벽·설치기)는 각 진영 열
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">
          {{ t(mode === 'single' ? 'battle.titleSingle' : 'battle.titleDouble') }}
        </h1>
        <p v-if="b.N > 1" class="page-sub">
          {{ t('battle.focusHint') }}
        </p>
      </div>
      <div class="head-actions">
        <NuxtLink :to="`/${mode}`" class="btn btn-sm">← {{ t('nav.entry') }}</NuxtLink>
        <!-- 정정 모드: 필드 포켓몬을 바꿔도 교체 효과(설치기·등장 특성·물러남 효과) 없이 상태만 고침 -->
        <button
          v-if="b.state.value && !b.staleReason.value"
          type="button"
          class="btn btn-sm"
          :class="{ 'btn-edit-on': b.editMode.value }"
          :title="t('battle.editModeHint')"
          @click="b.editMode.value = !b.editMode.value"
        >
          ✎ {{ t(b.editMode.value ? 'battle.editModeOn' : 'battle.editMode') }}
        </button>
        <button type="button" class="btn btn-sm btn-danger" @click="onReset">
          {{ t('common.reset') }}
        </button>
      </div>
    </div>

    <!-- 선출만 덜 됨: 화면을 옮기지 않고 여기서 바로 고름 (다 고르면 배틀 시작) -->
    <div v-if="blocked === 'pick'" class="panel panel-pad pick-here">
      <div class="pick-head">
        <span class="section-label">{{ t('entry.pickHint', { n: entry.max }) }}</span>
        <span class="muted small num">{{ entry.picks.value.length }}/{{ entry.max }}</span>
      </div>
      <BattlePickRecommend :mode="mode" :field="pickField" />
      <div class="pick-grid">
        <template v-for="(sl, i) in mine.slots.value" :key="i">
          <BattleSlotMini
            v-if="sl.species"
            :slot="sl"
            :mega-on="mine.megaOn.value[i]"
            :alt-on="mine.altOn.value[i]"
            :order="entry.order(i)"
            selectable
            no-expand
            @select="entry.toggle(i)"
          />
        </template>
      </div>
    </div>

    <div v-else-if="blocked" class="panel empty-state">
      <p>{{ blocked }}</p>
      <NuxtLink :to="`/${mode}`" class="btn btn-primary">{{
        t(mode === 'single' ? 'entry.titleSingle' : 'entry.titleDouble')
      }}</NuxtLink>
    </div>

    <!-- 진행 중인 배틀의 구성이 바뀜 → 이어갈 수 없음, 확인 후 초기화 -->
    <div v-else-if="b.staleReason.value" class="panel empty-state stale" role="alert">
      <p class="bad-text">⚠ {{ t('battle.stale.title') }}</p>
      <p>{{ t('battle.stale.' + b.staleReason.value) }}</p>
      <button type="button" class="btn btn-primary" @click="b.reset()">
        {{ t('battle.stale.confirm') }}
      </button>
    </div>

    <template v-else-if="b.state.value">
      <p v-if="b.editMode.value" class="edit-banner">✎ {{ t('battle.editModeBanner') }}</p>
      <div class="layout">
        <section class="col fit-scroll">
          <BattleMonPanel
            v-for="k in b.N"
            :key="'m' + k"
            :slot="k - 1"
            :b="b"
            :an="an"
            side="mine"
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
              @select="
                b.editMode.value ? b.sendOut('mine', s.focus.mine, i, 'correct') : (s.preview = i)
              "
            >
              <template #extra>
                <UiHpBar
                  :percent="(s.sides.mine.mons[i]!.hp / Math.max(1, b.maxHp('mine', i))) * 100"
                  :label="`${s.sides.mine.mons[i]!.hp}/${b.maxHp('mine', i)}`"
                />
              </template>
            </TeamSlotCard>
          </div>
          <BattleFieldPanel v-if="fit" :b="b" part="mine" />
        </section>

        <section class="col center fit-scroll">
          <BattleFieldPanel :b="b" :part="fit ? 'global' : 'all'" />
          <BattleReplacePanel :b="b" />
          <BattleActionPanel :b="b" :an="an" />
          <BattleForecastPanel :an="an" />
          <div class="tab-row">
            <button
              v-for="tb in TABS"
              :key="tb.key"
              type="button"
              class="tab-btn"
              :class="{ active: tableTab === tb.key }"
              @click="tableTab = tb.key"
            >
              {{ t(tb.label) }}
            </button>
          </div>
          <BattleScenarioTable v-if="tableTab === 'scenario'" :b="b" :an="an" />
          <BattleIncomingTable v-else-if="tableTab === 'incoming'" :b="b" :an="an" />
          <BattleSpeedPanel v-else-if="tableTab === 'speed'" :b="b" :an="an" />
          <BattleEstimatePanel v-else :b="b" />
        </section>

        <section class="col fit-scroll">
          <BattleMonPanel
            v-for="k in b.N"
            :key="'o' + k"
            :slot="k - 1"
            :b="b"
            :an="an"
            side="opp"
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
                @click="b.sendOut('opp', s.focus.opp, i, b.editMode.value ? 'correct' : 'switch')"
              >
                <UiPokeSprite
                  :id="b.resolveAt('opp', i)?.species.id || null"
                  :size="40"
                  :fainted="b.isFainted('opp', i)"
                />
                <span>{{ gd.name('pokemon', b.resolveAt('opp', i)?.species.id) }}</span>
                <UiHpBar :percent="s.sides.opp.mons[i]!.hp" />
              </button>
              <span v-if="!s.sides.opp.revealed.length" class="muted small">—</span>
            </div>
            <template v-if="s.sides.opp.revealed.length < (b.N === 1 ? 3 : 4)">
              <span class="section-label">{{ t('battle.candidates') }}</span>
              <div class="mini-row">
                <button
                  v-for="i in oppCandidates"
                  :key="i"
                  type="button"
                  class="mini cand"
                  @click="b.sendOut('opp', s.focus.opp, i, b.editMode.value ? 'correct' : 'switch')"
                >
                  <UiPokeSprite :id="b.resolveAt('opp', i)?.species.id || null" :size="40" />
                  <span>{{ gd.name('pokemon', b.resolveAt('opp', i)?.species.id) }}</span>
                </button>
              </div>
            </template>
          </div>
          <BattleFieldPanel v-if="fit" :b="b" part="opp" />
        </section>
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
const fit = useFitLayout()
type TableTab = 'scenario' | 'incoming' | 'speed' | 'estimate'
const tableTab = ref<TableTab>('scenario')
const TABS: { key: TableTab; label: string }[] = [
  { key: 'scenario', label: 'battle.expected' },
  { key: 'incoming', label: 'battle.oppMoves' },
  { key: 'speed', label: 'battle.speed' },
  { key: 'estimate', label: 'battle.est.title' },
]

// 'pick' = 선출만 덜 됨 (이 화면에서 바로 고름), 그 외 문구 = 선출 화면으로 돌아가야 함
const blocked = computed(() => {
  if (!opp.slots.value.every((s) => s.species)) return t('entry.needOpponent')
  if (!entry.isFull.value) return 'pick'
  return ''
})
const mine = useTeam('mine')
const pickField = computed(() => ({
  weather: '' as const,
  terrain: '' as const,
  doubles: props.mode === 'double',
}))
watchEffect(() => {
  if (!blocked.value) b.ensure()
})
const s = computed(() => b.state.value!)

const mineBench = computed(() =>
  s.value.sides.mine.mons.map((_, i) => i).filter((i) => !s.value.sides.mine.active.includes(i)),
)
const oppCandidates = computed(() =>
  b.oppSlots.value
    .map((_, i) => i)
    .filter((i) => b.oppSlots.value[i]?.species && !s.value.sides.opp.revealed.includes(i)),
)
const onReset = () => {
  if (window.confirm(t('battle.resetConfirm'))) b.reset()
}
</script>

<style scoped>
.head-actions {
  display: flex;
  gap: 8px;
}
.head-actions .btn {
  text-decoration: none;
}
.edit-banner {
  margin: 0 0 10px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--warn);
  color: var(--warn);
  font-size: 12px;
  font-weight: 700;
}
.btn-edit-on {
  border-color: var(--warn);
  color: var(--warn);
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.empty-state .btn {
  text-decoration: none;
}
.pick-here {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
}
.pick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.bench {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.opp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mini-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.mini-row .mini {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--well);
  color: var(--text);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.mini-row .mini:hover:not(:disabled) {
  border-color: var(--opp);
}
.mini-row .mini.active {
  border-color: var(--opp);
  box-shadow: 0 0 0 1px var(--opp);
}
.mini-row .mini.cand {
  opacity: 0.75;
  border-style: dashed;
}
.mini-row .mini:disabled {
  opacity: 0.4;
  cursor: default;
}
.mini-row .mini :deep(.hp) {
  width: 100%;
}
.small {
  font-size: 12px;
}

@media (max-width: 1400px) {
  .layout {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .center {
    grid-column: 1 / -1;
    order: 3;
  }
}
@media (max-width: 860px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  /* 한 줄 배치에서는 매 턴 입력하는 행동 패널을 필드 상태보다 위로 */
  .center > .actions {
    order: -2;
  }
  .center > .fc {
    order: -1;
  }
}

/* 넓은 화면: 화면 높이에 맞추고 세 열이 따로 스크롤 (assets/css/main.css "PC 한 화면 배치") */
@media (min-width: 1400px) and (min-height: 700px) {
  .layout {
    flex: 1;
    min-height: 0;
    grid-template-columns: minmax(380px, 0.8fr) minmax(0, 1.5fr) minmax(380px, 0.8fr);
    align-items: stretch;
  }
  .col {
    padding-right: 2px;
  }
  .center {
    grid-column: auto;
    order: 0;
  }
}
</style>
