<!--
  상대 능력 추정: 주고받은 데미지를 쌓아서 상대의 내구(HP·방어·특방, 내구 지수)와 공격(실능치, 도구 후보) 범위를 좁힌다.
  관측은 "이번 턴 적용" 때 저장 (내가 준 % → 내구, 내가 받은 HP → 공격, 턴 끝 HP 를 게임 값으로 고침 → HP). 계산: composables/useOppEstimate.ts
-->
<template>
  <section class="panel panel-pad est">
    <h3 class="panel-title">
      {{ t('battle.est.title') }}
      <span v-if="name" class="who">{{ name }}</span>
      <span class="spacer" />
      <button
        v-if="oi != null && (count > 0 || observed)"
        type="button"
        class="btn btn-sm"
        @click="b.resetEstimate(oi)"
      >
        {{ t('battle.est.reset') }}
      </button>
    </h3>

    <p v-if="oi == null" class="muted small">{{ t('battle.pickOpp') }}</p>
    <p v-else-if="transformed" class="muted small">{{ t('battle.est.transformed') }}</p>
    <template v-else-if="e">
      <div class="blocks">
        <!-- 내구: 내가 준 데미지(%) -->
        <div class="blk">
          <span class="section-label"
            >{{ t('battle.est.bulk') }}
            <small>{{ t('battle.est.obs', { n: e.dealt + e.hpChecks }) }}</small></span
          >
          <p v-if="!e.bulk.feasible" class="warn-text small">{{ t('battle.est.infeasible') }}</p>
          <dl v-else>
            <dt>HP</dt>
            <dd class="num">{{ rangeText(e.bulk.hp) }}</dd>
            <dt>{{ t('stat.def') }}</dt>
            <dd class="num">{{ rangeText(e.bulk.def) }}</dd>
            <dt>{{ t('stat.spd') }}</dt>
            <dd class="num">{{ rangeText(e.bulk.spd) }}</dd>
            <dt>{{ t('battle.est.physIndex') }}</dt>
            <dd class="num">{{ rangeText(e.bulk.physIndex, true) }}</dd>
            <dt>{{ t('battle.est.specIndex') }}</dt>
            <dd class="num">{{ rangeText(e.bulk.specIndex, true) }}</dd>
          </dl>
        </div>
        <!-- 공격: 내가 받은 데미지(HP) -->
        <div class="blk">
          <span class="section-label"
            >{{ t('battle.est.attack') }}
            <small>{{ t('battle.est.obs', { n: e.taken }) }}</small></span
          >
          <p v-if="attackInfeasible" class="warn-text small">{{ t('battle.est.infeasible') }}</p>
          <dl v-else>
            <template v-for="cat in ['atk', 'spa'] as const" :key="cat">
              <dt>{{ t('stat.' + cat) }}</dt>
              <dd class="num">
                <template v-if="e[cat]">
                  {{ rangeText(e[cat]!.stat) }}
                  <small v-if="showEffective(cat)"
                    >{{ t('battle.est.effective') }} {{ rangeText(e[cat]!.effective) }}</small
                  >
                </template>
                <template v-else>—</template>
              </dd>
            </template>
            <dt>{{ t('common.item') }}</dt>
            <dd class="items">
              <template v-if="e.taken">
                <span v-for="it in e.items" :key="it || 'none'" class="item-chip">{{
                  it ? gd.name('items', it) : t('battle.est.noItem')
                }}</span>
                <small v-if="e.itemsFixed" class="muted">{{ t('battle.est.itemFixed') }}</small>
              </template>
              <template v-else>—</template>
            </dd>
          </dl>
          <p v-if="e.scarfRuledOut" class="good-text small">{{ t('battle.est.scarfRuledOut') }}</p>
        </div>
      </div>
      <p class="note muted">{{ t('battle.est.note') }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import type { Range } from '~/utils/statInference'

const props = defineProps<{ b: ReturnType<typeof useBattle> }>()
const { t } = useI18n()
const gd = useGameData()

// 분석 대상 칸의 상대. 추정은 배틀 계산과 같은 것 (useBattle 이 관측이 바뀔 때만 다시 계산)
const oi = computed(() => {
  const s = props.b.state.value
  return s ? (s.sides.opp.active[s.focus.opp] ?? null) : null
})
const mon = computed(() =>
  oi.value == null ? null : props.b.state.value!.sides.opp.mons[oi.value],
)
const transformed = computed(() => !!mon.value?.transform)
const observed = computed(() => !!mon.value?.speedSp)
const name = computed(() =>
  oi.value == null ? '' : gd.name('pokemon', props.b.resolveAt('opp', oi.value)?.species.id),
)
const e = computed(() => (oi.value == null ? null : props.b.oppEstimate(oi.value)))
const count = computed(() => (e.value ? e.value.dealt + e.value.hpChecks + e.value.taken : 0))
const attackInfeasible = computed(
  () => !!e.value && e.value.taken > 0 && !e.value.atk?.feasible && !e.value.spa?.feasible,
)
// 도구 후보가 "없음" 하나뿐이면 실효 공격 = 실능치라 따로 안 보여줌
const showEffective = (cat: 'atk' | 'spa') => {
  const s = e.value?.[cat]
  return (
    !!s?.effective && !!s.stat && (s.effective.min !== s.stat.min || s.effective.max !== s.stat.max)
  )
}

// 범위 표시: 관측이 없으면 "—", 같으면 한 값
const rangeText = (r: Range | null, big = false) => {
  if (!r) return '—'
  const f = (v: number) => (big ? v.toLocaleString() : String(v))
  return r.min === r.max ? f(r.min) : `${f(r.min)}~${f(r.max)}`
}
</script>

<style scoped>
.est {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.panel-title {
  margin: 0;
}
.who {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}
.blocks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.blk {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.section-label small {
  margin-left: 4px;
  font-weight: 600;
  letter-spacing: 0;
}
dl {
  margin: 0;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 3px 10px;
  font-size: 12px;
}
dt {
  color: var(--text-3);
  font-weight: 600;
}
dd {
  margin: 0;
  font-weight: 700;
  text-align: right;
}
dd small {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
}
.items {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 3px;
  font-weight: 600;
}
.item-chip {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--well);
  color: var(--text-2);
}
.small {
  font-size: 12px;
  margin: 0;
}
.note {
  margin: 0;
  font-size: 11px;
}
@media (max-width: 600px) {
  .blocks {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
