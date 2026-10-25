<!-- 이번 턴 행동 입력 (진영별 필드 칸마다 BattleActionSlot) + 선후공 관찰 · 상대 확정 + 적용/되돌리기 -->
<template>
  <section class="panel panel-pad actions">
    <h3 class="panel-title">
      {{ t('battle.actions') }}
      <span class="spacer" />
      <span class="turn num">{{ t('battle.turn', { n: s.turn }) }}</span>
    </h3>

    <!-- 배틀 종료: 행동 입력 대신 결과 (이전 턴으로 되돌리면 다시 입력 가능) -->
    <div v-if="b.battleResult.value" class="result" :class="b.battleResult.value">
      <strong>{{ t('battle.result.' + b.battleResult.value) }}</strong>
      <span class="muted small">{{ t('battle.result.hint') }}</span>
    </div>
    <template v-else>
      <div class="sides">
        <div v-for="side in ['mine', 'opp'] as const" :key="side" class="side" :class="side">
          <h4 class="side-title">
            {{ t(side === 'mine' ? 'battle.myAction' : 'battle.oppAction') }}
          </h4>
          <BattleActionSlot
            v-for="(_, slot) in s.actions[side]"
            :key="slot"
            :slot="slot"
            :b="b"
            :an="an"
            :side="side"
            :usage="usageTable"
          />
        </div>
      </div>

      <div class="observe">
        <span class="section-label">{{ t('battle.observeOrder') }}</span>
        <!-- 순서가 이미 정해지면 고정 (한쪽만 교체 / 우선도 차이 / 스피드 범위로 확정) / 둘 다 교체: 먼저 교체한 쪽을 고름 -->
        <div class="chip-row">
          <button
            v-for="v in ['mine', 'opp'] as const"
            :key="v"
            type="button"
            class="chip"
            :class="{ active: orderFixed ? orderFixed.side === v : s.observedOrder === v }"
            :disabled="!!orderFixed"
            @click="s.observedOrder = s.observedOrder === v ? 'unknown' : v"
          >
            {{ t(v === 'mine' ? 'battle.iMovedFirst' : 'battle.oppMovedFirst') }}
          </button>
          <span v-if="orderFixed || bothSwitch" class="order-note">{{
            orderFixed ? t(orderFixed.key, orderFixed.params ?? {}) : t('battle.orderBothSwitch')
          }}</span>
        </div>
        <BattleEntryOrder :b="b" />
        <BattleOppConfirm :b="b" :usage="usageTable" />
      </div>

      <div v-if="an.statusForecast.value.length" class="status-fc">
        <div v-for="(l, i) in an.statusForecast.value" :key="i">
          {{ line(l) }}
        </div>
      </div>

      <p v-if="b.validationError.value" class="bad-text small">
        ⚠ {{ t('battle.' + b.validationError.value, { max: errMax }) }}
      </p>
      <p v-else-if="orderNeeded" class="bad-text small">⚠ {{ t('battle.orderRequired') }}</p>
    </template>

    <div class="exec">
      <button type="button" class="btn" :disabled="!b.canUndo.value" @click="b.undo()">
        ◀ {{ t('battle.undo') }}
      </button>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!!b.validationError.value || orderNeeded"
        @click="b.executeTurn()"
      >
        {{ t('battle.apply') }} ▶
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import type { useBattleAnalysis } from '~/composables/useBattleAnalysis'
import type { BattleSide } from '~/utils/battleState'

const props = defineProps<{
  b: ReturnType<typeof useBattle>
  an: ReturnType<typeof useBattleAnalysis>
}>()
const { t } = useI18n()
const gd = useGameData()
const line = useLine()
const s = computed(() => props.b.state.value!)

const userIdx = (side: BattleSide, slot: number) => s.value.sides[side].active[slot] ?? null
// 분석 대상 칸의 교체 여부: 한쪽만 교체면 그쪽이 먼저(고정), 둘 다 교체면 교체 순서를 관찰
const focusSwitch = (side: BattleSide) =>
  s.value.actions[side][s.value.focus[side]]?.kind === 'switch'
const bothSwitch = computed(() => focusSwitch('mine') && focusSwitch('opp'))
const switchFixed = computed<BattleSide | null>(() =>
  bothSwitch.value ? null : focusSwitch('mine') ? 'mine' : focusSwitch('opp') ? 'opp' : null,
)
// 선후공이 이미 정해진 경우 (관찰할 게 없음): 한쪽만 교체 / 우선도가 다름 /
// 우선도가 같고 스피드 범위로 확정 + 동속·(나중에 움직일 쪽의) 선제공격손톱·퀵드로 가능성 없음
const orderFixed = computed<{
  side: BattleSide
  key: string
  params?: Record<string, string | number>
} | null>(() => {
  if (switchFixed.value) return { side: switchFixed.value, key: 'battle.orderSwitchFixed' }
  const ms = s.value.focus.mine
  const os = s.value.focus.opp
  const ma = s.value.actions.mine[ms]
  const oa = s.value.actions.opp[os]
  const mi = userIdx('mine', ms)
  const oi = userIdx('opp', os)
  // 기술을 아직 안 골랐으면 우선도 0 으로 보고 판정 (예상 흐름과 같은 기준)
  if (ma?.kind !== 'move' || oa?.kind !== 'move') return null
  if (mi == null || oi == null || props.b.isFainted('mine', mi) || props.b.isFainted('opp', oi))
    return null
  const pm = props.b.movePriority('mine', mi, ma.via || ma.move)
  const po = props.b.movePriority('opp', oi, oa.via || oa.move)
  if (pm !== po) return { side: pm > po ? 'mine' : 'opp', key: 'battle.orderPriorityFixed' }
  const so = props.b.speedOrder(
    mi,
    oi,
    props.b.turnMega('mine', ms, mi),
    props.b.turnMega('opp', os, oi),
  )
  if (!so || (so.first !== 'mine' && so.first !== 'opp') || so.random || so.tiePossible) return null
  return {
    side: so.first,
    key: 'battle.orderSpeedFixed',
    params: { span: `${so.span[0]}–${so.span[1]}`, my: so.mySpeed },
  }
})
// 같은 우선도인데 스피드 범위로 선후공을 알 수 없으면(걸침·반드시 동속) 본 순서를 골라야 적용할 수 있다.
// 상대 배분을 추측해 순서를 정하지 않는다
const orderNeeded = computed(() => {
  if (orderFixed.value || s.value.observedOrder !== 'unknown') return false
  const ms = s.value.focus.mine
  const os = s.value.focus.opp
  const ma = s.value.actions.mine[ms]
  const oa = s.value.actions.opp[os]
  const mi = userIdx('mine', ms)
  const oi = userIdx('opp', os)
  if (ma?.kind !== 'move' || oa?.kind !== 'move' || !ma.move || !oa.move) return false
  if (mi == null || oi == null || props.b.isFainted('mine', mi) || props.b.isFainted('opp', oi))
    return false
  // 한쪽이 깨어나지 못하면 순서와 무관
  if (
    props.b.sleepsThrough('mine', mi, ma.via || ma.move) ||
    props.b.sleepsThrough('opp', oi, oa.via || oa.move)
  )
    return false
  if (
    props.b.movePriority('mine', mi, ma.via || ma.move) !==
    props.b.movePriority('opp', oi, oa.via || oa.move)
  )
    return false
  const so = props.b.speedOrder(
    mi,
    oi,
    props.b.turnMega('mine', ms, mi),
    props.b.turnMega('opp', os, oi),
  )
  return so?.first !== 'mine' && so?.first !== 'opp'
})
// 순서가 정해졌는데 예전에 고른 관찰이 남아 있으면 지운다 (스피드 범위를 잘못 좁히지 않게)
watch(
  () => !!orderFixed.value,
  (fixed) => {
    if (fixed && s.value.observedOrder !== 'unknown') s.value.observedOrder = 'unknown'
  },
  { immediate: true },
)

// 특성·도구·기술 선택지의 사용률 통계 (이 배틀 모드·현재 레귤레이션)
const reg = useRegulation()
const usageTable = computed(() =>
  gd.usageTable(props.b.N === 1 ? 'single' : 'double', reg.active.value?.id),
)

// 데미지 입력 방식 (DamageInput 과 공유)
const dmgMode = useState<'damage' | 'hp'>('battle-dmg-mode', () => 'damage')
// 고른 방식은 브라우저에 기억 (새로고침해도 유지)
onMounted(() => {
  try {
    if (localStorage.getItem('pch_dmg_mode') === 'hp') dmgMode.value = 'hp'
  } catch {
    // 저장소 차단은 무시
  }
})
watch(dmgMode, (v) => {
  try {
    localStorage.setItem('pch_dmg_mode', v)
  } catch {
    // 무시
  }
})

const errMax = computed(() => {
  const slot = s.value.actions.opp.findIndex((x) => x.kind === 'move' && x.amount != null)
  const target =
    slot < 0
      ? null
      : props.b.hitTarget('opp', slot, props.b.turnOrder(), s.value.actions.opp[slot]!.target).idx
  return target != null ? props.b.maxHp('mine', target) : 0
})
</script>

<style scoped>
.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-title {
  margin: 0;
}
.turn {
  font-size: 13px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--panel-3);
  color: var(--text);
}
.sides {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--well);
  border: 1px solid var(--line);
}
.side.mine {
  border-top: 3px solid var(--mine);
}
.side.opp {
  border-top: 3px solid var(--opp);
}
.side-title {
  margin: 0;
  font-size: 14px;
}
.observe {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.order-note {
  font-size: 12px;
  color: var(--text-3);
}
.status-fc {
  font-size: 12px;
  color: var(--warn);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.small {
  font-size: 12px;
  margin: 0;
}
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px 12px;
  text-align: center;
}
.result strong {
  font-size: 20px;
}
.result.win strong {
  color: var(--good);
}
.result.lose strong {
  color: var(--bad);
}
.exec {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.exec .btn-primary {
  flex: 1;
  justify-content: center;
  font-size: 15px;
  padding: 10px;
}
@media (max-width: 700px) {
  .sides {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
