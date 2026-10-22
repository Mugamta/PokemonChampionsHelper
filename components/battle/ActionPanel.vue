<!-- 이번 턴 행동 입력 (진영별 필드 칸마다 기술/교체) + 결과 입력 + 적용/되돌리기 -->
<template>
  <section class="panel panel-pad actions">
    <h3 class="panel-title">
      {{ t('battle.actions') }}
      <span class="spacer" />
      <span class="turn num">{{ t('battle.turn', { n: s.turn }) }}</span>
    </h3>

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
                :value="a.move"
                class="field-input"
                :disabled="!userOf(side, slot)"
                @change="onMove(side, slot, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">
                  {{ t('common.move') }}
                </option>
                <option v-for="mv in moveOptions(side, slot)" :key="mv" :value="mv">
                  {{ gd.name('moves', mv) }}
                </option>
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
            <label v-if="canMega(side, slot)" class="mega">
              <input v-model="a.useMega" type="checkbox" />
              {{ t('battle.useMega') }}
            </label>
            <!-- 변화기: 데미지 입력 없이 빗나감·실패만 -->
            <div v-if="b.isStatusMove(a.move)" class="amount-head">
              <label class="crit" :title="t('battle.missedHint')">
                <input v-model="a.missed" type="checkbox" />
                {{ t('battle.missed') }}
              </label>
            </div>
            <div v-else class="amount">
              <span class="section-label amount-head"
                >{{
                  spreadOther(side, slot) != null
                    ? t(side === 'mine' ? 'battle.dealtPctTo' : 'battle.takenDmgTo', {
                        name: targetName(side, a.target),
                      })
                    : t(side === 'mine' ? 'battle.dealtPct' : 'battle.takenDmg')
                }}
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
              />
              <span v-if="subText(side, slot, a.target)" class="muted small">
                {{ subText(side, slot, a.target) }}
              </span>
            </div>
            <!-- 이 기술·도구·특성으로 맞은 쪽에게 생긴 확률 효과 (생길 수 있는 것만, 확정 효과는 자동) -->
            <div v-if="inflictOpts(side, slot, a.target).length" class="fx-row">
              <span class="section-label">{{
                t('battle.inflictOnTarget', { name: targetName(side, a.target) })
              }}</span>
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
              <span class="section-label">{{
                t(side === 'mine' ? 'battle.dealtPctTo' : 'battle.takenDmgTo', {
                  name: targetName(side, 1 - a.target),
                })
              }}</span>
              <BattleDamageInput
                v-model="a.amount2"
                v-bind="hpOf(side, 1 - a.target, slot)"
                :disabled="a.missed"
              />
              <span v-if="subText(side, slot, 1 - a.target)" class="muted small">
                {{ subText(side, slot, 1 - a.target) }}
              </span>
            </div>
            <div
              v-if="spreadOther(side, slot) != null && inflictOpts(side, slot, 1 - a.target).length"
              class="fx-row"
            >
              <span class="section-label">{{
                t('battle.inflictOnTarget', { name: targetName(side, 1 - a.target) })
              }}</span>
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
            <div v-if="slot === s.focus[side] && an.riskLines(side).length" class="risk">
              <div v-for="(l, i) in an.riskLines(side)" :key="i">
                {{ line(l) }}
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="observe">
      <span class="section-label">{{ t('battle.observeOrder') }}</span>
      <!-- 한쪽만 교체: 교체가 항상 먼저라 그쪽으로 고정 / 둘 다 교체: 먼저 교체한 쪽을 고름 (나가는 포켓몬의 스피드) -->
      <div class="chip-row">
        <button
          v-for="v in ['mine', 'opp'] as const"
          :key="v"
          type="button"
          class="chip"
          :class="{ active: switchFixed ? switchFixed === v : s.observedOrder === v }"
          :disabled="!!switchFixed"
          @click="s.observedOrder = s.observedOrder === v ? 'unknown' : v"
        >
          {{ t(v === 'mine' ? 'battle.iMovedFirst' : 'battle.oppMovedFirst') }}
        </button>
        <span v-if="switchFixed || bothSwitch" class="order-note">{{
          t(switchFixed ? 'battle.orderSwitchFixed' : 'battle.orderBothSwitch')
        }}</span>
      </div>
      <BattleEntryOrder :b="b" />
      <!-- 상대 도구 확정: 이번 턴에 드러난 도구 (먹다남은음식 회복·하양허브·반감열매·그라운드코트 등) -->
      <div class="item-confirm">
        <span class="section-label" :title="t('battle.itemConfirmHint')">{{
          t('battle.itemConfirm')
        }}</span>
        <div v-for="oi in oppActive" :key="oi" class="ic-row">
          <span v-if="oppActive.length > 1" class="ic-name">{{
            gd.name('pokemon', b.resolveAt('opp', oi)?.species.id)
          }}</span>
          <TeamItemPicker
            :model-value="confirmedItem(oi)"
            :species="b.oppSlots.value[oi]?.species"
            @update:model-value="(v: string) => b.confirmItem('opp', oi, v)"
          />
        </div>
      </div>
      <!-- 상대 특성 확정: 등장 문구·특성 발동으로 드러난 특성 (특성이 2개 이상인 포켓몬만) -->
      <div v-if="abilityTargets.length" class="item-confirm">
        <span class="section-label" :title="t('battle.abilityConfirmHint')">{{
          t('battle.abilityConfirm')
        }}</span>
        <div v-for="oi in abilityTargets" :key="oi" class="ic-row">
          <span v-if="abilityTargets.length > 1" class="ic-name">{{
            gd.name('pokemon', b.resolveAt('opp', oi)?.species.id)
          }}</span>
          <select
            class="field-input"
            :value="b.oppAbilityOf(oi)"
            @change="b.confirmAbility(oi, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              {{
                t('battle.abilityUnknown', {
                  name: gd.name('abilities', b.oppSlots.value[oi]?.ability || ''),
                })
              }}
            </option>
            <option v-for="a in abilitiesOf(oi)" :key="a" :value="a">
              {{ gd.name('abilities', a) }}
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

    <div class="exec">
      <button type="button" class="btn" :disabled="!b.canUndo.value" @click="b.undo()">
        ◀ {{ t('battle.undo') }}
      </button>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!!b.validationError.value"
        @click="b.executeTurn()"
      >
        {{ t('battle.apply') }} ▶
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  CANT_DAMAGE_REASONS,
  CANT_REASONS,
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
const targetName = (side: BattleSide, k: number) => {
  const foe: BattleSide = side === 'mine' ? 'opp' : 'mine'
  const r = props.b.resolveAt(foe, s.value.sides[foe].active[k] ?? null)
  return r ? gd.name('pokemon', r.species.id) : '—'
}
const canMega = (side: BattleSide, slot: number) => {
  const i = userIdx(side, slot)
  if (i == null) return false
  const m = s.value.sides[side].mons[i]!
  return !!userOf(side, slot)?.megaId && !m.megaUsed
}

// 행동 종류를 바꾸면 입력한 HP 값은 비움 (기술 데미지 ↔ 행동 불가로 잃은 HP 는 단위가 다름)
const setKind = (a: ActionState, kind: ActionState['kind']) => {
  if (a.kind !== kind) a.amount = null
  a.kind = kind
}

// 내 쪽: 정해둔 4개 기술 / 상대: 배울 수 있는 기술 전체 (선택하면 상대 파티의 기술 칸에 확정)
const moveOptions = (side: BattleSide, slot: number) => {
  const r = userOf(side, slot)
  if (!r) return []
  if (side === 'mine') return r.slot.moves.filter(Boolean)
  const known = r.slot.moves.filter(Boolean)
  const rest = gd
    .options(
      'moves',
      gd.learnset(r.base.id).filter((m) => !known.includes(m)),
    )
    .map((o) => o.value)
  return [...known, ...rest]
}
const onMove = (side: BattleSide, slot: number, moveId: string) => {
  const a = s.value.actions[side][slot]!
  a.move = moveId
  // 기술이 바뀌면 확률 효과 체크는 비움, 변화기면 데미지 입력도 비움
  if (props.b.isStatusMove(moveId))
    Object.assign(a, { amount: null, amount2: null, allyAmount: null, crit: false })
  a.inflicts = []
  a.inflicts2 = []
  a.contactInflicts = []
  if (side !== 'opp' || !moveId) return
  const i = userIdx(side, slot)
  const team = i == null ? null : oppTeam.slots.value[i]
  if (!team || team.moves.includes(moveId)) return
  const empty = team.moves.findIndex((m) => !m)
  team.moves[empty === -1 ? 3 : empty] = moveId
}

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
const abilitiesOf = (oi: number) => [
  ...new Set(props.b.resolveAt('opp', oi, false)?.base.abilities ?? []),
]
const abilityTargets = computed(() =>
  oppActive.value.filter((oi) => !props.b.isFainted('opp', oi) && abilitiesOf(oi).length > 1),
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
const hpOf = (side: BattleSide, k: number, slot: number) => {
  const foe = foeOf(side)
  const i = s.value.sides[foe].active[k] ?? null
  const now = i == null ? 0 : s.value.sides[foe].mons[i]!.hp
  const hp = props.b.N > 1 ? Math.max(0, now - props.b.earlierDamage(side, slot, k)) : now
  return side === 'mine'
    ? { unit: 'pct' as const, current: hp, max: 100 }
    : { unit: 'hp' as const, current: hp, max: i == null ? 0 : props.b.maxHp('mine', i) }
}
// ── 이번 턴 확률 효과 체크 ─────────────
// 맞는 상대(k칸): 그 칸이 이번 턴 교체하면 들어오는 포켓몬
const targetIdxOf = (side: BattleSide, k: number) => {
  const foe = foeOf(side)
  const fa = s.value.actions[foe][k]
  return fa?.kind === 'switch' && fa.switchTo != null
    ? fa.switchTo
    : (s.value.sides[foe].active[k] ?? null)
}
const inflictOpts = (side: BattleSide, slot: number, k: number) =>
  props.b.possibleInflicts(side, slot, targetIdxOf(side, k))
const contactOpts = (side: BattleSide, slot: number) => {
  const a = s.value.actions[side][slot]
  return a ? props.b.possibleContactInflicts(side, slot, targetIdxOf(side, a.target)) : []
}
const contactAbility = (side: BattleSide, slot: number) => {
  const a = s.value.actions[side][slot]
  const r = a ? props.b.resolveAt(foeOf(side), targetIdxOf(side, a.target)) : null
  return r ? gd.name('abilities', r.ability) : ''
}
const fxLabel = (k: string) =>
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
// 맞는 상대(k칸)가 대타 뒤에 있으면 안내 (입력한 데미지는 대타가 받음)
const subText = (side: BattleSide, slot: number, k: number) => {
  const a = s.value.actions[side][slot]
  const ui = userIdx(side, slot)
  const foe = foeOf(side)
  const ti = s.value.sides[foe].active[k]
  if (!a?.move || gd.move(a.move)?.category === 'status') return ''
  if (ui == null || ti == null || !props.b.behindSub(side, ui, foe, ti, a.move)) return ''
  const sub = s.value.sides[foe].mons[ti]!.volatiles.substitute!
  return t('battle.subTarget', { hp: foe === 'mine' ? sub : `${Math.round(sub * 10) / 10}%` })
}

const errMax = computed(() => {
  const a = s.value.actions.opp.find((x) => x.kind === 'move' && x.amount != null)
  const target = a ? s.value.sides.mine.active[a.target] : null
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
.ic-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ic-row > :last-child {
  flex: 1;
  min-width: 0;
}
.ic-name {
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
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
