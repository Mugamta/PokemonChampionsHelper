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
              @click="a.kind = 'move'"
            >
              {{ t('battle.useMove') }}
            </button>
            <button
              type="button"
              class="chip"
              :class="{ active: a.kind === 'switch' }"
              :disabled="s.fairyLock > 0"
              @click="a.kind = 'switch'"
            >
              {{ t('battle.switch') }}
            </button>
            <button
              type="button"
              class="chip"
              :class="{ active: a.kind === 'cant' }"
              :title="t('battle.cantHint')"
              @click="a.kind = 'cant'"
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
            <div class="amount">
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
                v-bind="hpOf(side, a.target)"
                :disabled="a.missed"
              />
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
                v-bind="hpOf(side, 1 - a.target)"
                :disabled="a.missed"
              />
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

        <label class="inflict">
          <span class="section-label">{{
            t(side === 'mine' ? 'battle.inflictMine' : 'battle.inflictOpp')
          }}</span>
          <select v-model="s.inflict[side]" class="field-input">
            <option value="">{{ t('common.none') }}</option>
            <optgroup :label="t('battle.conditions')">
              <option v-for="st in STATUSES" :key="st" :value="st">{{ t('status.' + st) }}</option>
            </optgroup>
            <optgroup v-for="g in VOLATILE_GROUPS" :key="g.label" :label="t('volatile.' + g.label)">
              <option v-for="v in g.items" :key="v" :value="v">{{ t('volatile.' + v) }}</option>
            </optgroup>
          </select>
        </label>
      </div>
    </div>

    <div class="observe">
      <span class="section-label">{{ t('battle.observeOrder') }}</span>
      <div class="chip-row">
        <button
          type="button"
          class="chip"
          :class="{ active: s.observedOrder === 'mine' }"
          @click="s.observedOrder = s.observedOrder === 'mine' ? 'unknown' : 'mine'"
        >
          {{ t('battle.iMovedFirst') }}
        </button>
        <button
          type="button"
          class="chip"
          :class="{ active: s.observedOrder === 'opp' }"
          @click="s.observedOrder = s.observedOrder === 'opp' ? 'unknown' : 'opp'"
        >
          {{ t('battle.oppMovedFirst') }}
        </button>
      </div>
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
  CANT_REASONS,
  STATUSES,
  VOLATILE_GROUPS,
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
// 더블: 광역기가 맞히는 다른 상대 칸 (없으면 null)
const spreadOther = (side: BattleSide, slot: number) => {
  if (props.b.N < 2) return null
  const a = s.value.actions[side][slot]
  if (!a || a.kind !== 'move' || !a.move || !isSpreadMove(gd.move(a.move))) return null
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
const confirmedItem = (oi: number) =>
  s.value.sides.opp.mons[oi]?.itemKnown ? (props.b.oppSlots.value[oi]?.item ?? '') : ''

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
// 맞는 쪽(상대 필드 k칸)의 지금 HP: 내 기술 → 상대 %(0~100), 상대 기술 → 내 실수치
const hpOf = (side: BattleSide, k: number) => {
  const foe = foeOf(side)
  const i = s.value.sides[foe].active[k] ?? null
  const hp = i == null ? 0 : s.value.sides[foe].mons[i]!.hp
  return side === 'mine'
    ? { unit: 'pct' as const, current: hp, max: 100 }
    : { unit: 'hp' as const, current: hp, max: i == null ? 0 : props.b.maxHp('mine', i) }
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
