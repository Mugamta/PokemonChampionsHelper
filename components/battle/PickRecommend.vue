<!--
  선출 화면의 선출·선두 추천 (composables/usePickRecommend.ts)
  버튼을 누르면 계산해서 상위 조합 3개를 보여 주고, "적용"하면 그 순서로 선출 (첫 번째 = 선두, 더블은 두 마리)
-->
<template>
  <div class="pick-rec">
    <button
      type="button"
      class="btn btn-sm"
      :class="{ 'btn-on': open }"
      :title="t('entry.rec.hint')"
      @click="toggle"
    >
      {{ t('entry.rec.title') }}
    </button>
    <div v-if="open" class="box">
      <p v-if="!result" class="muted small">{{ t('entry.rec.none') }}</p>
      <template v-else>
        <p class="muted small">{{ t('entry.rec.hint') }}</p>
        <ol class="list">
          <li v-for="(p, k) in result.plans" :key="k" class="plan" :class="{ top: k === 0 }">
            <div class="head">
              <span class="rank">{{ k + 1 }}</span>
              <span class="mons">
                <span v-for="(s, i) in p.slots" :key="s" class="mon">
                  <UiPokeSprite :id="mineSpecies(s)" :size="24" />
                  {{ mineName(s) }}
                  <span v-if="i < p.leads.length" class="tag">{{ t('entry.rec.lead') }}</span>
                </span>
              </span>
              <span class="spacer" />
              <span class="score" :class="tone(p.score)">{{ signed(p.score) }}</span>
              <button type="button" class="btn btn-sm apply" @click="apply(p.slots)">
                {{ t('entry.rec.apply') }}
              </button>
            </div>
            <!-- 1위 조합: 상대마다 가장 잘 받는 포켓몬 (불리하면 붉게) -->
            <p v-if="k === 0" class="answers">
              <span
                v-for="(a, j) in p.answers"
                :key="j"
                :class="a.by < 0 ? 'hidden' : a.value < 0 ? 'bad-text' : ''"
              >
                <template v-if="a.by >= 0">
                  {{ oppName(result.opp[j]!) }} ← {{ mineName(result.mine[a.by]!) }}
                </template>
              </span>
            </p>
          </li>
        </ol>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEntry, type BattleMode } from '~/composables/useEntry'
import { usePickRecommend, type PickRecommendation } from '~/composables/usePickRecommend'
import type { FieldState } from '~/utils/damage'

const props = defineProps<{ mode: BattleMode; field: FieldState }>()
const { t } = useI18n()
const gd = useGameData()
const mine = useTeam('mine')
const opp = useTeam('opp')
const entry = useEntry(props.mode)
const pr = usePickRecommend(props.mode)

const open = ref(false)
const result = ref<PickRecommendation | null>(null)
// 누를 때 계산 (파티·필드를 바꾸면 다시 눌러서)
const toggle = () => {
  open.value = !open.value
  if (open.value) result.value = pr.compute(props.field)
}
const apply = (slots: number[]) => {
  entry.picks.value = [...slots]
  open.value = false
}
const mineSpecies = (i: number) => mine.slots.value[i]?.species || ''
const mineName = (i: number) => gd.name('pokemon', mine.slots.value[i]?.species)
const oppName = (i: number) => gd.name('pokemon', opp.slots.value[i]?.species)
const signed = (v: number) => {
  const n = Math.round(v * 100)
  return n > 0 ? `+${n}` : String(n)
}
const tone = (v: number) => (v > 0.05 ? 'good-text' : v < -0.05 ? 'bad-text' : '')
</script>

<style scoped>
.pick-rec {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.box {
  padding: 8px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--line-strong);
  background: var(--well);
}
.small {
  font-size: 12px;
  margin: 0 0 6px;
}
.btn-on {
  border-color: var(--accent-2);
  color: var(--accent-2);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.plan {
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
}
.plan.top {
  border-color: var(--accent);
}
.head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.rank {
  font-weight: 800;
  color: var(--text-3);
}
.mons {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
}
.mon {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.tag {
  font-size: 10px;
  font-weight: 800;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
}
.spacer {
  flex: 1;
}
.score {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.apply {
  padding: 0 8px;
  font-size: 11px;
}
.answers {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-2);
}
.hidden {
  display: none;
}
</style>
