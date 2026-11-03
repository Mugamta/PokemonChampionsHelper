<!-- VS 화면 결과 한 칸: 공격 → 방어 데미지 범위, %, 확정/난수 N타, 16단계 난수 -->
<template>
  <section class="result" :class="from">
    <header class="r-head">
      <UiPokeSprite :id="attacker?.species.id || null" :size="44" />
      <span class="arrow" aria-hidden="true">→</span>
      <UiPokeSprite :id="defender?.species.id || null" :size="44" />
      <div v-if="result" class="r-move">
        <span class="r-name">{{ gd.name('moves', result.moveId) }}</span>
        <span class="r-badges">
          <UiTypeBadge :type="result.cell.type" small />
          <UiCategoryBadge :category="gd.move(result.moveId)!.category" />
        </span>
      </div>
    </header>
    <template v-if="result">
      <UiDamageCell :cell="result.cell" show-eff class="big" />
      <p v-if="showRolls" class="rolls num" :title="t('vs.rolls')">
        {{ result.rolls.join(', ') }}
      </p>
    </template>
    <p v-else class="muted hint">{{ hint }}</p>
  </section>
</template>

<script setup lang="ts">
import type { ResolvedSlot } from '~/composables/useTeamCalc'
import type { VsResult } from '~/composables/useVs'
import type { VsSide } from '~/utils/vs'

const props = defineProps<{
  from: VsSide
  attacker: ResolvedSlot | null
  defender: ResolvedSlot | null
  result: VsResult | null
}>()
const { t } = useI18n()
const gd = useGameData()

// 난수 목록은 한 번의 데미지가 16가지일 때만 (효과 없음·탈·대타·변덕레이저는 표시와 맞지 않음)
const showRolls = computed(() => {
  const r = props.result
  return (
    !!r?.rolls.length &&
    !r.cell.immune &&
    !r.cell.disguise &&
    !r.cell.sub &&
    !r.cell.fickle &&
    r.rolls.some(Boolean)
  )
})
const hint = computed(() => {
  if (!props.attacker || !props.defender) return t('vs.pickBoth')
  return t('vs.pickMove', { name: gd.name('pokemon', props.attacker.species.id) })
})
</script>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--well);
  border: 1px solid var(--line);
  border-left: 3px solid var(--mine);
  border-radius: var(--radius-sm);
}
.result.right {
  border-left-color: var(--opp);
}
.r-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.arrow {
  color: var(--text-3);
  font-weight: 800;
}
.r-move {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  text-align: right;
}
.r-name {
  font-weight: 800;
  font-size: 14px;
}
.r-badges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.big :deep(.dmg) {
  font-size: 26px;
  font-weight: 800;
}
.big :deep(.dmg-pct) {
  font-size: 15px;
  font-weight: 700;
}
.big :deep(.ko-tag) {
  font-size: 15px;
  margin-top: 2px;
  padding-left: 0;
}
.big :deep(.real),
.big :deep(.hits),
.big :deep(.eff) {
  font-size: 12px;
  padding-left: 0;
}
.rolls {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}
.hint {
  margin: 0;
  font-size: 13px;
}
</style>
