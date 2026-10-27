<!-- 상대 도구·특성 확정 (이번 턴에 드러난 것): 필드에 있는 상대 + 이번 턴 교체로 들어오는 상대 -->
<template>
  <div class="opp-confirm">
    <!-- 상대 도구 확정: 이번 턴에 드러난 도구 (먹다남은음식 회복·하양허브·반감열매·그라운드코트 등) -->
    <div v-for="oi in itemTargets" :key="oi" class="item-confirm">
      <span class="section-label" :title="t('battle.itemConfirmHint')">{{
        t('battle.itemConfirm', { name: oppName(oi) })
      }}</span>
      <div class="ic-row">
        <TeamItemPicker
          :model-value="confirmedItem(oi)"
          :species="b.oppSlots.value[oi]?.species"
          :usage="itemUsageOf(oi)"
          @update:model-value="(v: string) => onConfirmItem(oi, v)"
        />
      </div>
    </div>
    <!-- 상대 특성 확정: 등장 문구·특성 발동으로 드러난 특성 (특성이 2개 이상인 포켓몬만) -->
    <div v-for="oi in abilityTargets" :key="oi" class="item-confirm">
      <span class="section-label" :title="t('battle.abilityConfirmHint')">{{
        t('battle.abilityConfirm', { name: oppName(oi) })
      }}</span>
      <div class="ic-row">
        <select
          class="field-input"
          :value="b.oppAbilityOf(oi)"
          @change="onConfirmAbility(oi, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ t('battle.abilityUnknown') }}</option>
          <option v-for="a in abilitiesOf(oi)" :key="a" :value="a">
            {{ abilityLabel(oi, a) }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import { formItemUsage, type UsageTable } from '~/utils/autoSet'

const props = defineProps<{
  b: ReturnType<typeof useBattle>
  usage?: UsageTable // 이 배틀 모드·현재 레귤레이션의 사용률 통계
}>()
const { t } = useI18n()
const gd = useGameData()
const s = computed(() => props.b.state.value!)

// 상대 도구 확정 대상: 필드에 있는 상대 + 이번 턴 교체로 들어오는 상대 (교체 / 유턴·배턴터치 등 / 내가 강제 교체)
const oppActive = computed(() => {
  const ids: (number | null)[] = [...s.value.sides.opp.active]
  for (const a of s.value.actions.opp) {
    if (a.kind === 'switch') ids.push(a.switchTo)
    else ids.push(a.selfSwitch)
  }
  for (const a of s.value.actions.mine) ids.push(a.foeSwitch)
  return [...new Set(ids)].filter(
    (i): i is number =>
      i != null && !!props.b.oppSlots.value[i]?.species && !props.b.isFainted('opp', i),
  )
})
// 특성을 확정할 수 있는 상대 (원종 특성이 2개 이상, 쓰러지지 않음)
const oppName = (oi: number) => gd.name('pokemon', props.b.resolveAt('opp', oi)?.species.id)
const abilitiesOf = (oi: number) => [
  ...new Set(props.b.resolveAt('opp', oi, false)?.base.abilities ?? []),
]
// 이번 턴에 확정을 고른 칸 (잘못 고른 걸 고칠 수 있게 턴이 끝날 때까지는 계속 보여 준다)
const pickedThisTurn = ref({ item: new Set<number>(), ability: new Set<number>() })
watch(
  () => s.value.turn,
  () => (pickedThisTurn.value = { item: new Set(), ability: new Set() }),
)
const onConfirmItem = (oi: number, v: string) => {
  pickedThisTurn.value.item.add(oi)
  props.b.confirmItem('opp', oi, v)
}
const onConfirmAbility = (oi: number, v: string) => {
  pickedThisTurn.value.ability.add(oi)
  props.b.confirmAbility(oi, v)
}
// 지난 턴까지 이미 확정된 상대는 확정 칸을 숨긴다
const itemTargets = computed(() =>
  oppActive.value.filter(
    (oi) => !s.value.sides.opp.mons[oi]?.itemKnown || pickedThisTurn.value.item.has(oi),
  ),
)
// 도구는 원종 + 메가 폼 통계를 합쳐서 (메가스톤 비율이 나오게)
const usageOf = (oi: number) => props.usage?.pokemon[props.b.oppSlots.value[oi]?.species ?? '']
const itemUsageOf = (oi: number) => {
  const base = gd.pokemon(props.b.oppSlots.value[oi]?.species ?? '')
  return base ? formItemUsage(base, props.usage) : undefined
}
const abilityLabel = (oi: number, a: string) => {
  const share = usageOf(oi)?.abilityUsage?.[a]
  const name = gd.name('abilities', a)
  return share == null ? name : `${name} (${Number((share * 100).toFixed(1))}%)`
}
const abilityTargets = computed(() =>
  oppActive.value.filter(
    (oi) =>
      !props.b.isFainted('opp', oi) &&
      !props.b.resolveAt('opp', oi)?.isMega && // 메가진화하면 특성은 메가 폼 하나로 고정
      abilitiesOf(oi).length > 1 &&
      (!s.value.sides.opp.mons[oi]?.abilityKnown || pickedThisTurn.value.ability.has(oi)),
  ),
)
const confirmedItem = (oi: number) =>
  s.value.sides.opp.mons[oi]?.itemKnown ? props.b.oppItemOf(oi) : ''
</script>

<style scoped>
.opp-confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.opp-confirm:empty {
  display: none;
}
.item-confirm {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ic-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ic-row > :last-child {
  flex: 1;
  min-width: 0;
}
</style>
