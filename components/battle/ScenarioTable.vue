<!-- 예상 데미지: 내 포켓몬(미리보기 대상)의 기술 × 상대 후보, 칸마다 상대 배분 4가지 시나리오.
     아직 메가진화하지 않은 쪽은 메가 폼도 함께 (내 쪽 = 미리보기 버튼 추가, 상대 = 열 추가) -->
<template>
  <section class="panel panel-pad">
    <h3 class="panel-title">
      {{ t('battle.expected') }}
      <span v-if="attacker" class="muted sub">{{
        t('battle.expectedVs', { name: gd.name('pokemon', attacker.species.id) })
      }}</span>
      <span class="spacer" />
      <label class="crit"><input v-model="crit" type="checkbox" /> {{ t('common.crit') }}</label>
    </h3>
    <div class="who">
      <button
        v-for="w in roster"
        :key="w.key"
        type="button"
        class="who-btn"
        :class="{ active: w.idx === previewIdx && !!w.mega === previewMega }"
        :title="gd.name('pokemon', b.resolveAt('mine', w.idx, w.mega)?.species.id)"
        @click="pick(w.idx, !!w.mega)"
      >
        <UiPokeSprite
          :id="b.resolveAt('mine', w.idx, w.mega)?.species.id || null"
          :size="34"
          :fainted="b.isFainted('mine', w.idx)"
        />
      </button>
    </div>
    <div v-if="attacker" class="scroll">
      <table>
        <thead>
          <tr>
            <th />
            <th v-for="c in oppCols" :key="c.key">
              <div class="col-head">
                <UiPokeSprite
                  :id="b.resolveAt('opp', c.oi, c.mega)?.species.id || null"
                  :size="34"
                  :fainted="b.isFainted('opp', c.oi)"
                />
                <span>{{ gd.name('pokemon', b.resolveAt('opp', c.oi, c.mega)?.species.id) }}</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="mv in attackMoves" :key="mv">
            <td class="mv">
              <span class="dot" :style="{ background: `var(--t-${moveType(mv)})` }" />{{
                gd.name('moves', mv)
              }}
            </td>
            <td v-for="c in oppCols" :key="c.key">
              <div v-for="sc in DEF_SCENARIOS" :key="sc" class="sc-line">
                <span class="sc-label">{{ t('battle.scenario.' + sc) }}</span>
                <UiDamageCell
                  :cell="an.mineVsScenario(previewIdx!, mv, c.oi, sc, crit, previewMega, c.mega)"
                  compact
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import { DEF_SCENARIOS, type useBattleAnalysis } from '~/composables/useBattleAnalysis'
import { effectiveMoveType } from '~/utils/damage'

const props = defineProps<{
  b: ReturnType<typeof useBattle>
  an: ReturnType<typeof useBattleAnalysis>
}>()
const { t } = useI18n()
const gd = useGameData()
const s = computed(() => props.b.state.value!)
const crit = ref(false)

// 내 로스터 + 아직 메가진화하지 않았고 메가진화할 수 있는 포켓몬은 메가 폼 버튼도
const roster = computed(() =>
  s.value.sides.mine.mons.flatMap((_, i) =>
    props.an.megaPreviewable('mine', i)
      ? [
          { key: `${i}`, idx: i },
          { key: `${i}m`, idx: i, mega: true },
        ]
      : [{ key: `${i}`, idx: i }],
  ),
)
const previewIdx = computed(() => s.value.preview ?? props.an.activeIdx('mine'))
// 메가 폼 버튼을 골랐는지 (메가진화가 더는 안 되면 기본 폼으로)
const megaPick = ref(false)
const previewMega = computed(
  () =>
    megaPick.value &&
    previewIdx.value != null &&
    props.an.megaPreviewable('mine', previewIdx.value),
)
const pick = (i: number, mega: boolean) => {
  s.value.preview = i
  megaPick.value = mega
}
const attacker = computed(() =>
  props.b.resolveAt('mine', previewIdx.value, previewMega.value || undefined),
)
// 스킨류 특성(메가 포함)으로 바뀐 기술 타입
const moveType = (id: string) => {
  const m = gd.move(id)
  return m && attacker.value
    ? effectiveMoveType(m, attacker.value.ability, props.b.fieldFor('opp'), attacker.value.species)
    : m?.type
}
const attackMoves = computed(() =>
  (attacker.value?.slot.moves || []).filter((m) => m && gd.move(m)?.category !== 'status'),
)

// 선출 마릿수만큼 상대가 확인되면 그 포켓몬만, 아니면 상대 6마리 전부 (메가진화 가능하면 메가 폼 열 추가)
const oppCols = computed(() => {
  const rev = s.value.sides.opp.revealed
  const need = props.b.N === 1 ? 3 : 4
  const all = props.b.oppSlots.value
    .map((_, i) => i)
    .filter((i) => props.b.oppSlots.value[i]?.species)
  return (rev.length >= need ? rev : all).flatMap((oi) =>
    props.an.megaPreviewable('opp', oi)
      ? [
          { key: `${oi}`, oi },
          { key: `${oi}m`, oi, mega: true },
        ]
      : [{ key: `${oi}`, oi }],
  )
})
</script>

<style scoped>
.panel-title {
  margin-bottom: 8px;
}
.sub {
  font-size: 12px;
  font-weight: 600;
}
.crit {
  font-size: 12px;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  cursor: pointer;
}
.who {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}
.who-btn {
  border: 1px solid var(--line);
  background: var(--well);
  border-radius: 10px;
  padding: 2px;
  cursor: pointer;
}
.who-btn.active {
  border-color: var(--mine);
  box-shadow: 0 0 0 1px var(--mine);
}
.scroll {
  overflow-x: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 12px;
}
th,
td {
  padding: 6px;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: top;
  text-align: left;
}
.col-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  min-width: 150px;
}
.mv {
  white-space: nowrap;
  font-weight: 700;
  position: sticky;
  left: 0;
  background: var(--panel-solid);
}
.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 6px;
}
.sc-line {
  display: grid;
  grid-template-columns: 74px 1fr;
  gap: 4px;
  align-items: baseline;
  padding: 1px 0;
}
.sc-label {
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
}
</style>
