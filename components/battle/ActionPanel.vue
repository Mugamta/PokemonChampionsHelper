<!-- 이번 턴 행동 입력 (진영별 필드 칸마다 기술/교체) + 결과 입력 + 적용/되돌리기 -->
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
          <div v-for="(a, slot) in s.actions[side]" :key="slot" class="act">
            <div v-if="b.N > 1" class="slot-who">
              <UiPokeSprite :id="userOf(side, slot)?.species.id || null" :size="28" />
              <span>{{
                userOf(side, slot) ? gd.name('pokemon', userOf(side, slot)!.species.id) : '—'
              }}</span>
            </div>
            <div class="kind">
              <button
                type="button"
                class="chip"
                :class="{ active: a.kind === 'move' }"
                @click="setKind(a, 'move')"
              >
                {{ t('battle.useMove') }}
              </button>
              <button
                type="button"
                class="chip"
                :class="{ active: a.kind === 'switch' }"
                :disabled="b.switchBlocked(side, slot)"
                :title="b.switchBlocked(side, slot) ? t('battle.switchBlocked') : undefined"
                @click="setKind(a, 'switch')"
              >
                {{ t('battle.switch') }}
              </button>
              <button
                type="button"
                class="chip"
                :class="{ active: a.kind === 'cant' }"
                :title="t('battle.cantHint')"
                @click="setKind(a, 'cant')"
              >
                {{ t('battle.cant') }}
              </button>
            </div>

            <template v-if="a.kind === 'switch'">
              <select v-model="a.switchTo" class="field-input">
                <option :value="null" disabled>
                  {{ t('battle.switchTo') }}
                </option>
                <option
                  v-for="i in benchOf(side)"
                  :key="i"
                  :value="i"
                  :disabled="b.isFainted(side, i)"
                >
                  {{ gd.name('pokemon', b.resolveAt(side, i)?.species.id) }}
                </option>
              </select>
            </template>

            <!-- 행동 불가 (잠듦·얼음 등). 깨어나서 기술을 썼으면 "기술 사용"으로 → 상태이상이 풀림 -->
            <template v-else-if="a.kind === 'cant'">
              <div class="chip-row">
                <button
                  v-for="r in CANT_REASONS"
                  :key="r"
                  type="button"
                  class="chip"
                  :class="{ active: a.cantReason === r }"
                  @click="a.cantReason = r"
                >
                  {{ t('battle.cantReason.' + r) }}
                </button>
              </div>
              <!-- 혼란 자해·기타: 스스로 잃은 HP (내 쪽 실수치, 상대 %) -->
              <div v-if="CANT_DAMAGE_REASONS.has(a.cantReason)" class="amount">
                <span class="section-label">{{ t('battle.selfDamage') }}</span>
                <BattleDamageInput v-model="a.amount" v-bind="selfHpOf(side, slot)" />
                <span
                  v-if="a.cantReason === 'confusion' && confusionText(side, slot)"
                  class="muted small"
                >
                  {{ confusionText(side, slot) }}
                </span>
              </div>
              <p class="muted small cant-hint">{{ t('battle.cantHint') }}</p>
            </template>

            <template v-else>
              <div class="move-row">
                <select
                  :value="a.via || a.move"
                  class="field-input"
                  :disabled="!userOf(side, slot) || !!encoreOf(side, slot)"
                  @change="onMove(side, slot, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">
                    {{ t('common.move') }}
                  </option>
                  <template v-for="g in moveGroups(side, slot)" :key="g.key">
                    <optgroup v-if="g.label" :label="g.label">
                      <option v-for="o in g.items" :key="o.value" :value="o.value">
                        {{ o.label }}
                      </option>
                    </optgroup>
                    <template v-else>
                      <option v-for="o in g.items" :key="o.value" :value="o.value">
                        {{ o.label }}
                      </option>
                    </template>
                  </template>
                </select>
                <select
                  v-if="b.N > 1"
                  v-model.number="a.target"
                  class="field-input target"
                  :title="t('battle.target')"
                >
                  <option v-for="k in b.N" :key="k" :value="k - 1">
                    → {{ targetName(side, k - 1) }}
                  </option>
                </select>
              </div>
              <!-- 잠꼬대·흉내내기: 실제로 나간 기술 (데미지·효과는 이 기술로) -->
              <div v-if="CALLER_MOVES.has(a.via || a.move)" class="called-row">
                <span class="section-label">{{ t('battle.calledMove') }}</span>
                <select
                  :value="a.via ? a.move : ''"
                  class="field-input"
                  @change="onCalled(side, slot, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">{{ t('battle.calledUnknown') }}</option>
                  <template v-for="g in calledGroups(side, slot)" :key="g.key">
                    <optgroup :label="g.label">
                      <option v-for="o in g.items" :key="o.value" :value="o.value">
                        {{ o.label }}
                      </option>
                    </optgroup>
                  </template>
                </select>
              </div>
              <p v-if="encoreOf(side, slot)" class="warn-text small">
                {{
                  t('battle.encoreLocked', {
                    move: gd.name('moves', encoreOf(side, slot)),
                    n: encoreLeft(side, slot),
                  })
                }}
              </p>
              <p v-if="mustSleep(side, slot)" class="bad-text small">
                ⚠ {{ t('battle.sleepNoWake') }}
              </p>
              <label v-if="canMega(side, slot)" class="mega">
                <input v-model="a.useMega" type="checkbox" />
                {{ t('battle.useMega') }}
              </label>
              <!-- 먼저 맞고 반드시 쓰러짐: 기술이 나가지 않으므로 입력 없음 (선공기를 고르면 다시 판정) -->
              <p v-if="faintsFirst(side, slot)" class="muted small">
                {{ t('battle.faintsFirst') }}
              </p>
              <!-- 깨어나지 못하는 시도: 기술이 나가지 않으므로 데미지·효과 입력 없음 (메가진화는 기술보다 먼저라 그대로) -->
              <template v-else-if="!mustSleep(side, slot)">
                <!-- 변화기: 데미지 입력 없이 빗나감·실패만 -->
                <div v-if="b.isStatusMove(a.move)" class="amount-head">
                  <label class="crit" :title="t('battle.missedHint')">
                    <input v-model="a.missed" type="checkbox" />
                    {{ t('battle.missed') }}
                  </label>
                </div>
                <div v-else class="amount">
                  <span class="section-label amount-head"
                    >{{ amountLabel(side, a.target, slot) }}
                    <!-- 급소였으면 체크 (상대 추정에 반영) / 빗나감·실패 -->
                    <label class="crit" :title="t('battle.critHint')">
                      <input v-model="a.crit" type="checkbox" />
                      {{ t('common.crit') }}
                    </label>
                    <label class="crit" :title="t('battle.missedHint')">
                      <input v-model="a.missed" type="checkbox" />
                      {{ t('battle.missed') }}
                    </label>
                    <!-- 데미지 / 체력 전후 입력 방식 (전체 공통) -->
                    <button
                      type="button"
                      class="chip mode-chip"
                      :class="{ active: dmgMode === 'hp' }"
                      :title="t('battle.hpModeHint')"
                      @click="dmgMode = dmgMode === 'hp' ? 'damage' : 'hp'"
                    >
                      {{ t('battle.hpMode') }}
                    </button>
                  </span>
                  <BattleDamageInput
                    v-model="a.amount"
                    v-bind="hpOf(side, a.target, slot)"
                    :disabled="a.missed"
                    :locked="fixedOf(side, slot) != null"
                  />
                  <span v-if="subText(side, slot, a.target)" class="muted small">
                    {{ subText(side, slot, a.target) }}
                  </span>
                  <span v-if="warnText(side, slot, a.target, a.amount)" class="bad-text small">
                    {{ warnText(side, slot, a.target, a.amount) }}
                  </span>
                </div>
                <!-- 내 흡수기: 흡수로 회복한 직후 HP (상대가 잃은 실수치 HP → 상대 HP 배분 추정) -->
                <div v-if="side === 'mine' && b.drainObservable(slot)" class="amount">
                  <span class="section-label" :title="t('battle.drainAfterHint')">{{
                    t('battle.drainAfter')
                  }}</span>
                  <div class="drain-pair">
                    <input
                      :value="selfHpOf(side, slot).current"
                      type="number"
                      class="field-input num"
                      disabled
                    />
                    <span class="muted">→</span>
                    <input
                      v-model.number="a.drainAfter"
                      type="number"
                      min="0"
                      :max="selfHpOf(side, slot).max"
                      step="1"
                      class="field-input num"
                      :placeholder="t('battle.hpAfter')"
                    />
                    <span v-if="typeof a.drainAfter === 'number'" class="muted small num">
                      +{{ Math.max(0, a.drainAfter - selfHpOf(side, slot).current) }}
                    </span>
                  </div>
                </div>
                <!-- 이 기술·도구·특성으로 생긴 부가효과: 확정(100%)은 체크 고정(자동 반영), 확률 효과는 생겼으면 체크 -->
                <div
                  v-if="
                    inflictOpts(side, slot, a.target).length ||
                    sureOpts(side, slot, a.target).length
                  "
                  class="fx-row"
                >
                  <span class="section-label">{{
                    t('battle.inflictOnTarget', { name: targetName(side, a.target, slot) })
                  }}</span>
                  <label
                    v-for="k in sureOpts(side, slot, a.target)"
                    :key="'s' + k"
                    class="crit sure"
                    :title="t('battle.fxSure')"
                  >
                    <input type="checkbox" checked disabled />
                    {{ fxLabel(k) }}
                  </label>
                  <label v-for="k in inflictOpts(side, slot, a.target)" :key="k" class="crit">
                    <input
                      type="checkbox"
                      :checked="(a.inflicts ?? []).includes(k)"
                      @change="toggleFx(a, 'inflicts', k)"
                    />
                    {{ fxLabel(k) }}
                  </label>
                </div>
                <!-- 접촉 → 맞은 쪽 특성(정전기 등)으로 공격한 쪽에게 생긴 효과 -->
                <div v-if="contactOpts(side, slot).length" class="fx-row">
                  <span class="section-label">{{
                    t(side === 'opp' ? 'battle.contactInflict' : 'battle.contactInflictMine', {
                      ability: contactAbility(side, slot),
                    })
                  }}</span>
                  <label v-for="k in contactOpts(side, slot)" :key="k" class="crit">
                    <input
                      type="checkbox"
                      :checked="(a.contactInflicts ?? []).includes(k)"
                      @change="toggleFx(a, 'contactInflicts', k)"
                    />
                    {{ fxLabel(k) }}
                  </label>
                </div>
                <!-- 더블 광역기: 다른 상대 칸이 받은 피해 -->
                <div v-if="spreadOther(side, slot) != null" class="amount">
                  <span class="section-label">{{ amountLabel(side, 1 - a.target, slot) }}</span>
                  <BattleDamageInput
                    v-model="a.amount2"
                    v-bind="hpOf(side, 1 - a.target, slot)"
                    :disabled="a.missed"
                  />
                  <span v-if="subText(side, slot, 1 - a.target)" class="muted small">
                    {{ subText(side, slot, 1 - a.target) }}
                  </span>
                  <span v-if="warnText(side, slot, 1 - a.target, a.amount2)" class="bad-text small">
                    {{ warnText(side, slot, 1 - a.target, a.amount2) }}
                  </span>
                </div>
                <div
                  v-if="
                    spreadOther(side, slot) != null &&
                    (inflictOpts(side, slot, 1 - a.target).length ||
                      sureOpts(side, slot, 1 - a.target).length)
                  "
                  class="fx-row"
                >
                  <span class="section-label">{{
                    t('battle.inflictOnTarget', { name: targetName(side, 1 - a.target, slot) })
                  }}</span>
                  <label
                    v-for="k in sureOpts(side, slot, 1 - a.target)"
                    :key="'s' + k"
                    class="crit sure"
                    :title="t('battle.fxSure')"
                  >
                    <input type="checkbox" checked disabled />
                    {{ fxLabel(k) }}
                  </label>
                  <label v-for="k in inflictOpts(side, slot, 1 - a.target)" :key="k" class="crit">
                    <input
                      type="checkbox"
                      :checked="(a.inflicts2 ?? []).includes(k)"
                      @change="toggleFx(a, 'inflicts2', k)"
                    />
                    {{ fxLabel(k) }}
                  </label>
                </div>
                <!-- 공격 후 교체: 상대 (드래곤테일·울부짖기 / 탈출버튼·위기회피), 자기 (유턴 등 / 상대 레드카드) -->
                <label v-if="b.canForceSwitch(side, slot)" class="after-switch">
                  <span class="section-label">{{ t('battle.foeSwitch') }}</span>
                  <select v-model="a.foeSwitch" class="field-input">
                    <option :value="null">{{ t('battle.noSwitch') }}</option>
                    <option v-for="i in b.benchOf(foeOf(side))" :key="i" :value="i">
                      {{ gd.name('pokemon', b.resolveAt(foeOf(side), i)?.species.id) }}
                    </option>
                  </select>
                </label>
                <label v-if="b.canSelfSwitch(side, slot)" class="after-switch">
                  <span class="section-label">{{ t('battle.selfSwitch') }}</span>
                  <select v-model="a.selfSwitch" class="field-input">
                    <option :value="null">{{ t('battle.noSwitch') }}</option>
                    <option v-for="i in b.benchOf(side)" :key="i" :value="i">
                      {{ gd.name('pokemon', b.resolveAt(side, i)?.species.id) }}
                    </option>
                  </select>
                </label>
                <div
                  v-if="b.N > 1 && b.allyOf(side, slot) != null && b.hitsAlly(a.move)"
                  class="amount ally"
                >
                  <span class="section-label">{{
                    t(side === 'mine' ? 'battle.allyDamageMine' : 'battle.allyDamageOpp', {
                      name: allyName(side, slot),
                    })
                  }}</span>
                  <input
                    v-model.number="a.allyAmount"
                    type="number"
                    min="0"
                    :max="side === 'mine' ? b.maxHp('mine', b.allyOf(side, slot)!) : 100"
                    :step="side === 'mine' ? 1 : 0.1"
                    class="field-input num"
                    :placeholder="side === 'mine' ? '0' : '0~100'"
                  />
                  <UiDamageCell :cell="an.allyCell(side, slot)" compact />
                </div>
                <div
                  v-if="side === 'mine' && slot === s.focus.mine && an.mineActionPreview.value"
                  class="preview"
                >
                  <UiDamageCell :cell="an.mineActionPreview.value" compact />
                </div>
                <div
                  v-if="side === 'opp' && slot === s.focus.opp && an.oppActionPreview.value"
                  class="preview"
                >
                  <UiDamageCell :cell="an.oppActionPreview.value" compact />
                </div>
                <div v-if="slot === s.focus[side] && an.riskLines(side).length" class="risk">
                  <div v-for="(l, i) in an.riskLines(side)" :key="i">
                    {{ line(l) }}
                  </div>
                </div>
              </template>
            </template>
          </div>
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
        <!-- 상대 도구 확정: 이번 턴에 드러난 도구 (먹다남은음식 회복·하양허브·반감열매·그라운드코트 등) -->
        <div v-for="oi in itemTargets" :key="oi" class="item-confirm">
          <span class="section-label" :title="t('battle.itemConfirmHint')">{{
            t('battle.itemConfirm', { name: oppName(oi) })
          }}</span>
          <div class="ic-row">
            <TeamItemPicker
              :model-value="confirmedItem(oi)"
              :species="b.oppSlots.value[oi]?.species"
              :usage="usageOf(oi)?.itemUsage"
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
import {
  CALLER_MOVES,
  CANT_DAMAGE_REASONS,
  CANT_REASONS,
  parseBoostKey,
  type ActionState,
  type BattleSide,
  type useBattle,
} from '~/composables/useBattle'
import type { useBattleAnalysis } from '~/composables/useBattleAnalysis'
import { isSpreadMove } from '~/utils/damage'

const props = defineProps<{
  b: ReturnType<typeof useBattle>
  an: ReturnType<typeof useBattleAnalysis>
}>()
const { t } = useI18n()
const gd = useGameData()
const line = useLine()
const oppTeam = useTeam('opp')
const s = computed(() => props.b.state.value!)

const userIdx = (side: BattleSide, slot: number) => s.value.sides[side].active[slot] ?? null
const userOf = (side: BattleSide, slot: number) => props.b.resolveAt(side, userIdx(side, slot))
const benchOf = (side: BattleSide) =>
  s.value.sides[side].mons
    .map((_, i) => i)
    .filter(
      (i) =>
        !s.value.sides[side].active.includes(i) &&
        (side === 'mine' || props.b.oppSlots.value[i]?.species),
    )
const foeOf = (side: BattleSide): BattleSide => (side === 'mine' ? 'opp' : 'mine')
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
// 더블: 광역기가 맞히는 다른 상대 칸 (없으면 null)
const spreadOther = (side: BattleSide, slot: number) => {
  if (props.b.N < 2) return null
  const a = s.value.actions[side][slot]
  if (!a || a.kind !== 'move' || !a.move || props.b.isStatusMove(a.move)) return null
  if (!isSpreadMove(gd.move(a.move))) return null
  const foe = foeOf(side)
  const i = s.value.sides[foe].active[1 - a.target]
  return i != null && !props.b.isFainted(foe, i) ? i : null
}
const allyName = (side: BattleSide, slot: number) =>
  gd.name('pokemon', props.b.resolveAt(side, props.b.allyOf(side, slot))?.species.id)
// slot 을 주면 그 행동이 실제로 맞히는 포켓몬 (교체·교체기로 들어오는 포켓몬), 아니면 지금 그 칸의 포켓몬
const targetName = (side: BattleSide, k: number, slot?: number) => {
  const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
  const i = slot == null ? (s.value.sides[foe].active[k] ?? null) : hitIdx(side, slot, k)
  const r = props.b.resolveAt(foe, i)
  return r ? gd.name('pokemon', r.species.id) : '—'
}
// 데미지 입력칸 제목: "○○에게 입힌 데미지 (%)" / "○○이(가) 받은 데미지" (맞는 포켓몬을 모르면 이름 없이)
const amountLabel = (side: BattleSide, k: number, slot: number) => {
  const name = targetName(side, k, slot)
  if (name === '—') return t(side === 'mine' ? 'battle.dealtPct' : 'battle.takenDmg')
  return t(side === 'mine' ? 'battle.dealtPctTo' : 'battle.takenDmgTo', { name })
}
// 잠든 뒤 첫 시도(잠자기는 2번째까지)는 반드시 행동 불가 → 잠꼬대·코골기 외 기술은 나가지 않음 (턴 적용도 같은 규칙)
const mustSleep = (side: BattleSide, slot: number) => {
  const a = s.value.actions[side][slot]
  const i = userIdx(side, slot)
  return !!a && a.kind === 'move' && i != null && props.b.sleepsThrough(side, i, a.via || a.move)
}
// 메가진화는 진영당 한 번: 이미 메가진화했거나, 더블에서 다른 칸이 이번 턴 메가진화를 체크했으면 없음
const canMega = (side: BattleSide, slot: number) => {
  const i = userIdx(side, slot)
  if (i == null) return false
  const other = s.value.actions[side][1 - slot]
  return !!userOf(side, slot)?.megaId && props.b.canMegaEvolve(side, i) && !other?.useMega
}

// 행동 종류를 바꾸면 입력한 HP 값은 비움 (기술 데미지 ↔ 행동 불가로 잃은 HP 는 단위가 다름)
const setKind = (a: ActionState, kind: ActionState['kind']) => {
  if (a.kind !== kind) a.amount = null
  a.kind = kind
}

// 앙코르 중이면 쓸 수 있는 기술 하나 ('' = 고정 아님)
const encoreOf = (side: BattleSide, slot: number) => {
  const i = userIdx(side, slot)
  return i == null ? '' : props.b.encoreMove(side, i)
}
// 기술 선택지. 내 쪽: 정해둔 4개 기술 / 상대: 배울 수 있는 기술 전체를
//   확정(이번 배틀에서 쓴 기술) → 후보(상대 파티에 적어 둔 기술 + 사용률 높은 순) → 그 외(이름순) 로 묶고 사용률을 붙임.
//   상대 기술을 고르면 상대 파티의 기술 칸에도 들어감 (onMove). 앙코르 중이면 그 기술 하나
interface MoveOpt {
  value: string
  label: string
}
const encoreLeft = (side: BattleSide, slot: number) => {
  const i = userIdx(side, slot)
  return i == null ? 0 : props.b.encoreTurnsLeft(side, i)
}
const moveGroups = (side: BattleSide, slot: number, ignoreEncore = false) => {
  const r = userOf(side, slot)
  if (!r) return []
  const em = ignoreEncore ? '' : encoreOf(side, slot)
  if (em) return [{ key: 'encore', label: '', items: [{ value: em, label: gd.name('moves', em) }] }]
  // 내 쪽 / 변신한 상대(복사한 기술 = 내 포켓몬의 기술): 정해진 기술만
  if (side === 'mine' || s.value.sides.opp.mons[userIdx(side, slot)!]?.transform) {
    const items = r.slot.moves
      .filter(Boolean)
      .map((v) => ({ value: v, label: gd.name('moves', v) }))
    return [{ key: 'mine', label: '', items }]
  }
  const i = userIdx(side, slot)!
  const share = usageOf(i)?.moveUsage ?? {}
  const opt = (v: string): MoveOpt => {
    const p = share[v]
    const name = gd.name('moves', v)
    return { value: v, label: p == null ? name : `${name} (${Number((p * 100).toFixed(1))}%)` }
  }
  const learn = new Set(gd.learnset(r.base.id))
  const om = s.value.sides.opp.mons[i]
  const used = [...new Set([...Object.keys(om?.ppUsed ?? {}), ...(om?.movesSeen ?? [])])]
  const likely = [
    ...r.slot.moves.filter((m) => m && !used.includes(m)),
    ...Object.keys(share)
      .filter((m) => learn.has(m) && !used.includes(m) && !r.slot.moves.includes(m))
      .sort((x, y) => share[y]! - share[x]!),
  ]
  const taken = new Set([...used, ...likely])
  const rest = gd
    .options(
      'moves',
      [...learn].filter((m) => !taken.has(m)),
    )
    .map((o) => opt(o.value))
  return [
    { key: 'used', label: t('battle.moveGroup.used'), items: used.map(opt) },
    { key: 'likely', label: t('battle.moveGroup.likely'), items: likely.map(opt) },
    { key: 'rest', label: t('battle.moveGroup.rest'), items: rest },
  ].filter((g) => g.items.length)
}
// 잠꼬대: 자기 기술 중 하나 (잠꼬대·흉내내기 제외) / 흉내내기: 직전에 나간 기술 + 그 외 전체
const calledGroups = (side: BattleSide, slot: number) => {
  const a = s.value.actions[side][slot]!
  const caller = a.via || a.move
  const notCaller = (o: MoveOpt) => !CALLER_MOVES.has(o.value)
  if (caller === 'sleeptalk')
    return moveGroups(side, slot, true)
      .map((g) => ({
        ...g,
        label: g.label || t('battle.moveGroup.own'),
        items: g.items.filter(notCaller),
      }))
      .filter((g) => g.items.length)
  const last = s.value.lastUsedMove || ''
  const all = gd
    .options('moves', Object.keys(gd.data.value?.moves ?? {}))
    .filter((o) => o.value !== last && !CALLER_MOVES.has(o.value))
    .map((o) => ({ value: o.value, label: o.title }))
  return [
    ...(last
      ? [
          {
            key: 'last',
            label: t('battle.moveGroup.lastUsed'),
            items: [{ value: last, label: gd.name('moves', last) }],
          },
        ]
      : []),
    { key: 'all', label: t('battle.moveGroup.rest'), items: all },
  ]
}
// 나간 기술을 고르면 move = 그 기술, via = 부른 기술 (비우면 부른 기술만)
const onCalled = (side: BattleSide, slot: number, moveId: string) => {
  const a = s.value.actions[side][slot]!
  const caller = a.via || a.move
  // 상대 잠꼬대로 나간 기술은 그 상대의 기술 → 상대 파티 기술 칸에도 (흉내내기는 아님)
  onMove(side, slot, moveId || caller, caller === 'sleeptalk')
  a.via = moveId ? caller : ''
}
const onMove = (side: BattleSide, slot: number, moveId: string, writeTeam = true) => {
  const a = s.value.actions[side][slot]!
  a.move = moveId
  a.via = ''
  // 기술이 바뀌면 확률 효과 체크는 비움, 변화기면 데미지 입력도 비움
  if (props.b.isStatusMove(moveId))
    Object.assign(a, { amount: null, amount2: null, allyAmount: null, crit: false })
  a.inflicts = []
  a.inflicts2 = []
  a.contactInflicts = []
  if (side !== 'opp' || !moveId || !writeTeam) return
  const i = userIdx(side, slot)
  const team = i == null ? null : oppTeam.slots.value[i]
  if (!team || team.moves.includes(moveId)) return
  const empty = team.moves.findIndex((m) => !m)
  team.moves[empty === -1 ? 3 : empty] = moveId
}

// 앙코르에 걸리면 행동 칸의 기술을 그 기술로 맞춤 (기술 사용일 때)
watch(
  () =>
    (['mine', 'opp'] as const).flatMap((side) =>
      s.value.actions[side].map(
        (a, slot) => [side, slot, a.kind, a.via || a.move, encoreOf(side, slot)] as const,
      ),
    ),
  (list) => {
    for (const [side, slot, kind, move, em] of list)
      if (kind === 'move' && em && move !== em) onMove(side, slot, em)
  },
  { immediate: true },
)

// 상대 도구 확정 대상: 필드에 있는 상대 + 이번 턴 교체로 들어오는 상대 (교체 / 유턴·바톤터치 등 / 내가 강제 교체)
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
// 특성·도구 선택지: 사용률 통계(이 배틀 모드·현재 레귤레이션)에 있는 특성은 비율을 붙임
const reg = useRegulation()
const usageOf = (oi: number) => {
  const table = reg.active.value
    ? gd.data.value?.usage?.[props.b.N === 1 ? 'single' : 'double']?.[reg.active.value.id]
    : undefined
  return table?.pokemon[props.b.oppSlots.value[oi]?.species ?? '']
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
      abilitiesOf(oi).length > 1 &&
      (!s.value.sides.opp.mons[oi]?.abilityKnown || pickedThisTurn.value.ability.has(oi)),
  ),
)
const confirmedItem = (oi: number) =>
  s.value.sides.opp.mons[oi]?.itemKnown ? props.b.oppItemOf(oi) : ''

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
// 맞는 쪽(상대 필드 k칸)의 지금 HP: 내 기술 → 상대 %(0~100), 상대 기술 → 내 실수치.
// 더블에서 같은 상대가 이번 턴 먼저 맞으면 그 뒤 HP 를 "맞기 전" 기본값으로
//   맞는 포켓몬은 그 칸이 이번 턴 교체하거나 먼저 교체기(배턴터치 등)로 물러나면 들어오는 포켓몬
const hitIdx = (side: BattleSide, slot: number, k: number) =>
  props.b.hitTarget(side, slot, props.b.turnOrder(), k).idx
const hpOf = (side: BattleSide, k: number, slot: number) => {
  const foe = foeOf(side)
  const i = hitIdx(side, slot, k)
  const now = i == null ? 0 : s.value.sides[foe].mons[i]!.hp
  const hp = props.b.N > 1 ? Math.max(0, now - props.b.earlierDamage(side, slot, k)) : now
  return side === 'mine'
    ? { unit: 'pct' as const, current: hp, max: 100 }
    : { unit: 'hp' as const, current: hp, max: i == null ? 0 : props.b.maxHp('mine', i) }
}
// 입력한 데미지가 계산 범위 밖이면 경고 (막지는 않음 — 도구·특성·급소를 잘못 알고 있을 수 있음)
const warnText = (side: BattleSide, slot: number, k: number, amount: number | null) => {
  const w = props.an.amountWarning(side, slot, k, amount, hpOf(side, k, slot).current)
  return w ? t('battle.amountWarn', { ...w, unit: side === 'mine' ? '%' : '' }) : ''
}
// ── 이번 턴 확률 효과 체크 ─────────────
// 맞는 상대(k칸): hitIdx (교체·교체기로 들어오는 포켓몬 포함)
const inflictOpts = (side: BattleSide, slot: number, k: number) =>
  props.b.possibleInflicts(side, slot, hitIdx(side, slot, k))
// 맞으면 반드시 생기는 효과 (매지컬플레임 특공 −1 등) — 체크 고정으로 표시만
const sureOpts = (side: BattleSide, slot: number, k: number) =>
  props.b.sureInflicts(side, slot, hitIdx(side, slot, k))
const contactOpts = (side: BattleSide, slot: number) => {
  const a = s.value.actions[side][slot]
  return a ? props.b.possibleContactInflicts(side, slot, hitIdx(side, slot, a.target)) : []
}
const contactAbility = (side: BattleSide, slot: number) => {
  const a = s.value.actions[side][slot]
  const r = a ? props.b.resolveAt(foeOf(side), hitIdx(side, slot, a.target)) : null
  return r ? gd.name('abilities', r.ability) : ''
}
// 랭크 변화 키는 "특방 −1" / "자신 공격 +1"
const fxLabel = (k: string) => {
  const bk = parseBoostKey(k)
  if (bk) {
    const text = bk.stats
      .map(([st, v]) => `${t('stat.' + st)} ${v > 0 ? '+' : '−'}${Math.abs(v)}`)
      .join(' ')
    return bk.target === 'self' ? `${t('battle.fxSelf')} ${text}` : text
  }
  return fxStatusLabel(k)
}
const fxStatusLabel = (k: string) =>
  k === 'flinch'
    ? t('battle.chance.flinch')
    : k === 'confusion' || k === 'attract'
      ? t('volatile.' + k)
      : t('status.' + k)
type FxKey = 'inflicts' | 'inflicts2' | 'contactInflicts'
const toggleFx = (a: ActionState, key: FxKey, k: string) => {
  const list = a[key] ?? []
  a[key] = list.includes(k) ? list.filter((x) => x !== k) : [...list, k]
}

// 행동 불가로 스스로 잃은 HP 입력칸 (내 쪽 실수치, 상대 %)
const selfHpOf = (side: BattleSide, slot: number) => {
  const i = userIdx(side, slot)
  const hp = i == null ? 0 : s.value.sides[side].mons[i]!.hp
  return side === 'mine'
    ? { unit: 'hp' as const, current: hp, max: i == null ? 0 : props.b.maxHp('mine', i) }
    : { unit: 'pct' as const, current: hp, max: 100 }
}
const confusionText = (side: BattleSide, slot: number) => {
  const i = userIdx(side, slot)
  const r = i == null ? null : props.b.confusionRange(side, i)
  if (!r) return ''
  const u = side === 'mine' ? '' : '%'
  return t('battle.confusionRange', { min: r[0] + u, max: r[1] + u })
}
// ── 결과가 정해진 데미지 ─────────────
// 분석 대상 칸: 먼저 맞고 반드시 쓰러져 행동 못 함 / 데미지가 하나로 정해짐(반드시 쓰러뜨림·기합의띠로 1 남김)
const faintsFirst = (side: BattleSide, slot: number) =>
  slot === s.value.focus[side] && props.an.faintsFirst.value === side
const fixedOf = (side: BattleSide, slot: number) =>
  slot === s.value.focus[side] ? props.an.fixedAmount(side) : null
// 정해지면 채우고, 풀리면 자동으로 채운 값만 지운다
const autoFilled: Partial<Record<BattleSide, number>> = {}
watch(
  () => (['mine', 'opp'] as const).map((side) => fixedOf(side, s.value.focus[side])),
  (vals) => {
    ;(['mine', 'opp'] as const).forEach((side, i) => {
      const a = s.value.actions[side][s.value.focus[side]]
      const v = vals[i]
      if (a?.kind !== 'move') return
      if (v != null) {
        if (a.amount !== v) a.amount = v
        autoFilled[side] = v
      } else if (autoFilled[side] != null) {
        if (a.amount === autoFilled[side]) a.amount = null
        delete autoFilled[side]
      }
    })
  },
  { immediate: true },
)
// 맞는 상대(k칸)가 대타 뒤에 있으면 안내 (입력한 데미지는 대타가 받음)
const subText = (side: BattleSide, slot: number, k: number) => {
  const a = s.value.actions[side][slot]
  const ui = userIdx(side, slot)
  const foe = foeOf(side)
  const ti = hitIdx(side, slot, k)
  if (!a?.move || gd.move(a.move)?.category === 'status') return ''
  if (ui == null || ti == null || !props.b.behindSub(side, ui, foe, ti, a.move)) return ''
  const sub = s.value.sides[foe].mons[ti]!.volatiles.substitute!
  return t('battle.subTarget', { hp: foe === 'mine' ? sub : `${Math.round(sub * 10) / 10}%` })
}

const errMax = computed(() => {
  const slot = s.value.actions.opp.findIndex((x) => x.kind === 'move' && x.amount != null)
  const target = slot < 0 ? null : hitIdx('opp', slot, s.value.actions.opp[slot]!.target)
  return target != null ? props.b.maxHp('mine', target) : 0
})
</script>

<style scoped>
.mode-chip {
  min-height: 20px;
  padding: 0 7px;
  font-size: 11px;
}
.cant-hint {
  margin: 4px 0 0;
}
.after-switch {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
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
.act {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--line);
}
.slot-who {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 13px;
}
.kind {
  display: flex;
  gap: 6px;
}
.move-row {
  display: flex;
  gap: 6px;
}
.called-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}
.move-row .target {
  width: auto;
  max-width: 45%;
}
.mega {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--mega);
}
.amount {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.amount.ally {
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 181, 71, 0.08);
  border: 1px dashed rgba(255, 181, 71, 0.4);
}
.preview {
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(76, 201, 240, 0.08);
}
.amount-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.crit.sure {
  cursor: default;
  color: var(--text-2);
}
.crit {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  font-size: 11px;
  letter-spacing: 0;
  cursor: pointer;
}
.risk {
  font-size: 12px;
  color: var(--warn);
  background: rgba(255, 181, 71, 0.08);
  border-radius: 8px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fx-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}
.fx-row .crit {
  margin-left: 0;
}
.inflict {
  display: flex;
  flex-direction: column;
  gap: 3px;
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
.item-confirm {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.drain-pair {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto;
  align-items: center;
  gap: 6px;
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
