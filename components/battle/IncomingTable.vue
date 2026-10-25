<!-- 상대(분석 대상)의 기술 4개 × 내 로스터 받는 데미지. 기술은 여기서 바로 고칠 수 있다 (상대 파티에 저장).
     아직 메가진화하지 않은 쪽은 메가 폼도 함께 (내 쪽 = 열 추가, 상대 = 기술 줄 추가) -->
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
                :ability="attacker?.ability"
                :species="attacker?.species"
                :field="b.fieldFor('mine')"
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
          <template v-if="oppMega">
            <tr>
              <td class="mv-col">
                <div class="att">
                  <UiPokeSprite :id="b.resolveAt('opp', oi, true)?.species.id || null" :size="34" />
                  <span>{{ gd.name('pokemon', b.resolveAt('opp', oi, true)?.species.id) }}</span>
                </div>
              </td>
              <td v-for="c in cols" :key="c.key" />
            </tr>
            <tr v-for="mv in oppSlot.moves.filter(Boolean)" :key="'m' + mv">
              <td class="mv-col mega-mv">{{ gd.name('moves', mv) }}</td>
              <td v-for="c in cols" :key="c.key">
                <UiDamageCell
                  :cell="an.oppVsMine(oi, mv, c.idx, crit, c.mega, false, true)"
                  show-eff
                />
              </td>
            </tr>
          </template>
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
// 기술 타입 표시용: 공격할 때의 폼·특성 (스킨류·오라휠·킬가르도 블레이드폼 등)
const attacker = computed(() =>
  oi.value == null ? null : (props.b.combatantOf('opp', oi.value, undefined, true) ?? null),
)
const oppSlot = computed(() => (oi.value == null ? null : oppTeam.slots.value[oi.value]))

// 내 로스터 전체 + 아직 메가진화하지 않았고 메가진화할 수 있는 포켓몬(대기 중 포함)은 메가 상태 열 추가
const cols = computed(() => {
  const out: { key: string; idx: number; mega?: boolean }[] = []
  s.value.sides.mine.mons.forEach((_, i) => {
    out.push({ key: `${i}`, idx: i })
    if (props.an.megaPreviewable('mine', i)) out.push({ key: `${i}m`, idx: i, mega: true })
  })
  return out
})
// 상대가 아직 메가진화 전이면 메가 폼의 기술 줄도
const oppMega = computed(() => oi.value != null && props.an.megaPreviewable('opp', oi.value))
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
.mega-mv {
  padding-left: 16px;
  color: var(--text-2);
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
