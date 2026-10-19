<!-- 상대(분석 대상)의 기술 4개 × 내 로스터 받는 데미지. 기술은 여기서 바로 고칠 수 있다 (상대 파티에 저장) -->
<template>
  <section class="panel panel-pad">
    <h3 class="panel-title">
      {{ t('battle.oppMoves') }}
      <span class="spacer" />
      <label class="crit"><input v-model="crit" type="checkbox" /> {{ t('common.crit') }}</label>
    </h3>
    <p v-if="oi == null || !oppSlot" class="muted small">
      {{ t('battle.pickOpp') }}
    </p>
    <div v-else class="scroll">
      <table>
        <thead>
          <tr>
            <th class="mv-col">
              <div class="att">
                <UiPokeSprite :id="b.resolveAt('opp', oi)?.species.id || null" :size="34" />
                <span>{{ gd.name('pokemon', b.resolveAt('opp', oi)?.species.id) }}</span>
              </div>
            </th>
            <th v-for="c in cols" :key="c.key">
              <div class="col-head">
                <UiPokeSprite
                  :id="b.resolveAt('mine', c.idx, c.mega)?.species.id || null"
                  :size="34"
                  :fainted="b.isFainted('mine', c.idx)"
                />
                <span>{{
                  gd.name('pokemon', b.resolveAt('mine', c.idx, c.mega)?.species.id)
                }}</span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in 4" :key="k">
            <td class="mv-col">
              <TeamMovePicker
                v-model="oppSlot.moves[k - 1]"
                :learnset="gd.learnset(oppSlot.species)"
                :exclude="oppSlot.moves.filter((_, j) => j !== k - 1)"
              />
            </td>
            <td v-for="c in cols" :key="c.key">
              <UiDamageCell
                v-if="oppSlot.moves[k - 1]"
                :cell="an.oppVsMine(oi, oppSlot.moves[k - 1]!, c.idx, crit, c.mega)"
                show-eff
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import type { useBattleAnalysis } from '~/composables/useBattleAnalysis'

const props = defineProps<{
  b: ReturnType<typeof useBattle>
  an: ReturnType<typeof useBattleAnalysis>
}>()
const { t } = useI18n()
const gd = useGameData()
const oppTeam = useTeam('opp')
const crit = ref(false)
const s = computed(() => props.b.state.value!)

const oi = computed(() => props.an.activeIdx('opp'))
const oppSlot = computed(() => (oi.value == null ? null : oppTeam.slots.value[oi.value]))

// 내 로스터 전체 + 필드의 내 포켓몬이 아직 메가진화 전이면 메가 상태 열 추가
const cols = computed(() => {
  const out: { key: string; idx: number; mega?: boolean }[] = []
  s.value.sides.mine.mons.forEach((m, i) => {
    out.push({ key: `${i}`, idx: i })
    const active = s.value.sides.mine.active.includes(i)
    if (active && !m.megaOn && props.b.resolveAt('mine', i, true)?.isMega)
      out.push({ key: `${i}m`, idx: i, mega: true })
  })
  return out
})
</script>

<style scoped>
.panel-title {
  margin-bottom: 8px;
}
.crit {
  font-size: 12px;
  display: inline-flex;
  gap: 5px;
  align-items: center;
  cursor: pointer;
}
.small {
  font-size: 12px;
  margin: 0;
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
.mv-col {
  min-width: 210px;
  position: sticky;
  left: 0;
  background: var(--panel-solid);
  z-index: 1;
}
.att {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 800;
  color: var(--opp);
}
.col-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  min-width: 104px;
}
</style>
