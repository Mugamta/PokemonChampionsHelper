<!-- 필드에 나와 있는 포켓몬 1마리: HP / 실능치 / 랭크 / 상태이상 / 특수상태 / 메가진화 -->
<template>
  <div
    class="mon panel"
    :class="[side, { focused, clickable: selectable }]"
    @click="selectable && emit('focus')"
  >
    <template v-if="idx != null && r && m">
      <div class="head">
        <UiPokeSprite :id="r.species.id" :size="76" :fainted="m.hp <= 0" />
        <div class="ident">
          <div class="name-row">
            <span class="name">{{ gd.name('pokemon', r.species.id) }}</span>
            <span v-if="r.transformedFrom" class="tf-tag">{{
              t('battle.transformedFrom', { name: gd.name('pokemon', r.transformedFrom) })
            }}</span>
            <span v-if="statusText" class="status-pill" :class="m.status">{{ statusText }}</span>
          </div>
          <div class="types">
            <UiTypeGroup
              :types="typesInWeather(r.species, r.ability, b.fieldFor(side).weather ?? '')"
              small
            />
            <!-- 캐스퐁: 날씨로 정해진 모습 -->
            <span v-if="r.ability === 'forecast'" class="cast-form">{{
              t('form.castform.' + castform)
            }}</span>
          </div>
          <div class="sub">
            <button
              v-if="shownItem && !r.isMega"
              type="button"
              class="item-btn"
              :class="{ gone: m.itemGone }"
              :title="t(m.itemGone ? 'battle.itemRestore' : 'battle.itemGoneHint')"
              @click.stop="b.toggleItemGone(side, idx)"
            >
              <UiItemIcon :id="shownItem" :size="18" />
              <span>{{ gd.name('items', shownItem) }}</span>
              <span v-if="m.itemGone" class="gone-tag">{{ t('battle.itemGone') }}</span>
              <span v-else-if="side === 'opp' && m.itemKnown" class="known-tag">{{
                t('battle.itemKnown')
              }}</span>
              <span v-else-if="itemGuessed" class="guess-tag" :title="t('battle.itemGuessHint')">{{
                t('battle.itemGuess')
              }}</span>
            </button>
            <template v-else>
              <UiItemIcon v-if="shownItem" :id="shownItem" :size="18" />
              <span>{{ gd.name('items', shownItem) || '—' }}</span>
            </template>
            <span class="sep">·</span>
            <span :title="gd.text('abilities', r.ability)">{{
              gd.name('abilities', r.ability)
            }}</span>
            <span v-if="side === 'opp' && m.abilityKnown" class="known-tag">{{
              t('battle.itemKnown')
            }}</span>
            <span
              v-else-if="abilityGuessed"
              class="guess-tag"
              :title="t('battle.abilityGuessHint')"
              >{{ t('battle.itemGuess') }}</span
            >
          </div>
          <label v-if="megaAvailable" class="mega" @click.stop>
            <input
              type="checkbox"
              :checked="m.megaOn"
              @change="b.setMega(side, idx, ($event.target as HTMLInputElement).checked)"
            />
            {{ t('common.mega') }}
          </label>
          <!-- 변신: 괴짜는 등장 시 자동, 직접 켜면 맞은편 상대로 변신 -->
          <label
            v-if="b.canTransform(side, idx)"
            class="mega form"
            :title="t('battle.transformHint')"
            @click.stop
          >
            <input
              type="checkbox"
              :checked="!!m.transform"
              @change="b.toggleTransform(side, idx)"
            />
            {{ t('battle.transform') }}
          </label>
          <label
            v-if="r.formId && !m.transform"
            class="mega form"
            :title="t('battle.formHint.' + r.formId)"
            @click.stop
          >
            <input
              type="checkbox"
              :checked="m.alt"
              @change="b.setAlt(side, idx, ($event.target as HTMLInputElement).checked)"
            />
            {{ t('battle.form.' + r.formId) }}
          </label>
        </div>
      </div>

      <div class="hp-row" @click.stop>
        <UiHpBar :percent="hpPercent" class="bar" />
        <div class="hp-edit">
          <template v-if="side === 'mine'">
            <input
              v-model.number="m.hp"
              type="number"
              min="0"
              :max="max"
              class="field-input hp-in num"
            />
            <span class="muted num">/ {{ max }}</span>
          </template>
          <template v-else>
            <input
              v-model.number="m.hp"
              type="number"
              min="0"
              max="100"
              step="0.1"
              class="field-input hp-in num"
              :title="m.hpCheck ? t('battle.hpCheckHint') : undefined"
            />
            <span class="muted num"
              >% ({{ an.oppHpRange(idx).min }}~{{ an.oppHpRange(idx).max }}/{{ max }})</span
            >
          </template>
        </div>
      </div>

      <div class="stats">
        <div v-for="k in STAT_KEYS" :key="k" class="st">
          <span class="st-k">{{ t('stat.short.' + k) }}</span>
          <span
            class="st-v num"
            :class="[
              r.nature?.plus === k ? 'up' : r.nature?.minus === k ? 'down' : '',
              { range: !!oppBounds },
            ]"
            :title="oppBounds ? t('battle.oppStatHint') : undefined"
            >{{ statText(k) }}</span
          >
          <span v-if="spText(k)" class="st-sp num" :title="t('battle.spHint')">{{
            spText(k)
          }}</span>
          <span
            v-if="k !== 'hp' && m.boosts[k as BoostKey]"
            class="st-b num"
            :class="m.boosts[k as BoostKey] > 0 ? 'pos' : 'neg'"
            >{{ statText(k, m.boosts[k as BoostKey]) }}</span
          >
        </div>
      </div>

      <!-- 기술과 남은 PP (상대는 이번 배틀에서 쓴 기술 = 확정, 모르는 칸은 ?) -->
      <div
        v-if="moveList.length"
        class="moves-pp"
        :title="t(side === 'opp' ? 'battle.ppHintOpp' : 'battle.ppHint')"
      >
        <span
          v-for="(mv, i) in moveList"
          :key="mv.id || 'unknown' + i"
          class="mv-chip"
          :class="{ unknown: !mv.id, out: mv.id && mv.left <= 0 }"
        >
          <template v-if="mv.id"
            >{{ gd.name('moves', mv.id) }} <b class="num">{{ mv.left }}/{{ mv.max }}</b></template
          >
          <template v-else>?</template>
        </span>
      </div>

      <div class="lower" @click.stop>
        <UiRankControl :boosts="m.boosts" @change="(k, d) => b.changeBoost(side, idx!, k, d)" />
        <div class="conds">
          <div class="chip-row">
            <button
              v-for="s in STATUSES"
              :key="s"
              type="button"
              class="chip warn"
              :class="{ active: m.status === s }"
              @click="b.setStatus(side, idx!, s)"
            >
              {{
                s === 'tox' && m.status === 'tox'
                  ? `${t('status.tox')} ${Math.min(15, m.toxicTurn + 1)}/16`
                  : (s === 'slp' || s === 'frz') && m.status === s && m.toxicTurn
                    ? t('status.turns', { status: t('status.' + s), n: m.toxicTurn })
                    : t('status.' + s)
              }}
            </button>
          </div>
          <details class="vol">
            <summary class="section-label">
              {{ t('battle.conditions') }}
              <span v-if="volList.length" class="vol-count">{{ volList.length }}</span>
            </summary>
            <div v-for="g in VOLATILE_GROUPS" :key="g.label" class="vol-group">
              <span class="muted small">{{ t('volatile.' + g.label) }}</span>
              <div class="chip-row">
                <button
                  v-for="v in g.items"
                  :key="v"
                  type="button"
                  class="chip"
                  :class="{ active: !!m.volatiles[v] }"
                  @click="b.toggleVolatile(side, idx!, v)"
                >
                  {{ volLabel(v) }}
                </button>
              </div>
            </div>
          </details>
          <div v-if="volList.length" class="chip-row">
            <span v-for="v in volList" :key="v" class="vol-tag">{{ volLabel(v) }}</span>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="empty-state">
      {{ t(side === 'mine' ? 'battle.pickActive' : 'battle.pickOpp') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import { VOLATILE_DURATION, VOLATILE_GROUPS, STATUSES, type BattleSide } from '~/utils/battleState'
import type { useBattleAnalysis } from '~/composables/useBattleAnalysis'
import { spRangeOf } from '~/utils/statInference'
import { applyBoost } from '~/utils/stats'
import { STAT_KEYS, type BoostKey, type StatKey } from '~/utils/types'
import { forecastForm, typesInWeather } from '~/utils/damage'

const props = defineProps<{
  b: ReturnType<typeof useBattle>
  an: ReturnType<typeof useBattleAnalysis>
  side: BattleSide
  slot: number
  focused?: boolean
  selectable?: boolean
}>()
const emit = defineEmits<{ focus: [] }>()
const { t } = useI18n()
const gd = useGameData()

const idx = computed(() => props.b.state.value!.sides[props.side].active[props.slot] ?? null)
const m = computed(() =>
  idx.value == null ? null : props.b.state.value!.sides[props.side].mons[idx.value]!,
)
const r = computed(() => props.b.resolveAt(props.side, idx.value))
const castform = computed(() => {
  const id = forecastForm(r.value?.ability ?? '', props.b.fieldFor(props.side).weather ?? '')
  return id ? id.replace('castform', '') : 'normal'
})
const max = computed(() => r.value?.stats.hp || 0)
// 상대 실능치는 추정 범위 (선출 화면의 배분은 쓰지 않음). 변신 중이면 복사한 실능치라 null
const oppBounds = computed(() =>
  props.side === 'opp' && idx.value != null ? props.b.oppBoundsNow(idx.value) : null,
)
const statText = (k: StatKey, boost = 0) => {
  const bd = oppBounds.value
  const one = (v: number) => (k === 'hp' ? v : applyBoost(v, boost))
  if (!bd) return String(one(r.value!.stats[k]))
  const lo = one(bd[k].min)
  const hi = one(bd[k].max)
  return lo === hi ? String(lo) : `${lo}~${hi}`
}
// 능력 포인트: 내 쪽은 입력값, 상대는 추정 실능치 범위에 들어가는 SP 범위. 변신 중이면 복사한 실능치라 없음
const spText = (k: StatKey) => {
  const rr = r.value
  if (!rr || m.value?.transform) return ''
  if (props.side === 'mine') return `(+${rr.slot.sp[k]})`
  const bd = oppBounds.value
  const sp = bd ? spRangeOf(k, rr.species.stats[k], bd[k]) : null
  if (!sp) return ''
  return sp.min === sp.max ? `(+${sp.min})` : `(+${sp.min}~${sp.max})`
}
// 기술별 남은 PP. 내 포켓몬의 기술(내 쪽, 또는 내 포켓몬으로 변신한 상대)은 정해진 기술 /
// 상대의 기술(상대, 또는 상대로 변신한 내 포켓몬)은 쓴 기술·잠꼬대로 드러난 기술(확정) + 모르는 칸(?)을 4칸까지.
// 변신 중이면 복사한 기술이라 PP 5 (useBattle.maxPp)
const moveList = computed(() => {
  const rr = r.value
  const i = idx.value
  if (!rr || !m.value || i == null) return []
  const tf = m.value.transform
  const used = props.b.ppUsedOf(props.side, i)
  const knownSet = tf ? tf.side === 'mine' : props.side === 'mine'
  const ids = knownSet
    ? rr.slot.moves.filter(Boolean)
    : [...new Set([...Object.keys(used), ...(tf ? [] : (m.value.movesSeen ?? []))])]
  const list = ids.map((id) => {
    const max = props.b.maxPp(props.side, i, id)
    return { id, max, left: Math.max(0, max - (used[id] ?? 0)) }
  })
  if (!knownSet) while (list.length < 4) list.push({ id: '', max: 0, left: 0 })
  return list
})
const hpPercent = computed(() =>
  !m.value ? 0 : props.side === 'opp' ? m.value.hp : max.value ? (m.value.hp / max.value) * 100 : 0,
)
// 보여 줄 도구: 계산에 쓰는 도구(내 쪽 / 상대 확정·메가스톤), 없으면 상대의 추측 도구
const shownItem = computed(
  () =>
    r.value?.slot.item ||
    (props.side === 'opp' && idx.value != null ? props.b.guessedItem(idx.value) : ''),
)
const itemGuessed = computed(() => props.side === 'opp' && !r.value?.slot.item && !!shownItem.value)
// 상대 특성이 확정 전 추측 (메가진화 폼은 특성이 하나라 제외)
const abilityGuessed = computed(
  () => props.side === 'opp' && !r.value?.isMega && new Set(r.value?.base.abilities ?? []).size > 1,
)
// 메가진화는 진영당 한 번 (다른 포켓몬이 이미 메가진화했으면 토글 없음)
const megaAvailable = computed(
  () => !!r.value?.megaId && !m.value?.megaUsed && !props.b.sideMegaUsed(props.side),
)
// 잠듦·얼음은 행동하지 못한 턴 수도 (풀릴 확률은 예상 흐름의 "이번 턴 확률 효과")
const statusText = computed(() => {
  const st = m.value?.status
  if (!st) return ''
  if ((st === 'slp' || st === 'frz') && m.value!.toxicTurn)
    return t('status.turns', { status: t('status.' + st), n: m.value!.toxicTurn })
  return t('status.' + st)
})
const volList = computed(() => Object.keys(m.value?.volatiles || {}))
const volLabel = (v: string) => {
  const turn = m.value?.volatiles[v]
  if (!turn) return t('volatile.' + v)
  if (v === 'stockpile') return `${t('volatile.' + v)} ×${turn}` // 비축은 횟수
  if (v === 'yawn') return t(turn >= 2 ? 'volatile.yawnSoon' : 'volatile.yawn') // 졸음
  if (v === 'mustrecharge' || v === 'truant') return t('volatile.' + v) // 반동·게으름 (턴 수 표시 없음)
  // 대타: 남은 대타 HP (내 쪽 실수치, 상대 %) / 멸망의노래: 남은 카운트
  if (v === 'substitute')
    return `${t('volatile.' + v)} ${props.side === 'mine' ? turn : `${Math.round(turn * 10) / 10}%`}`
  if (v === 'perishsong') return `${t('volatile.' + v)} ${turn}`
  const total = VOLATILE_DURATION[v]
  return `${t('volatile.' + v)} ${total == null ? '∞' : `${turn}/${total}`}`
}
</script>

<style scoped>
.guess-tag {
  font-size: 10px;
  color: var(--text-3);
  border: 1px dashed var(--line);
  border-radius: 4px;
  padding: 0 3px;
}
.known-tag {
  font-size: 10px;
  color: var(--accent);
}
.mon {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  overflow: hidden;
}
.mon::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
}
.mon.mine::before {
  background: var(--mine);
}
.mon.opp::before {
  background: var(--opp);
}
.mon.clickable {
  cursor: pointer;
}
.mon.focused {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.ident {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.name {
  font-size: 18px;
  font-weight: 800;
  font-family: var(--font-display);
}
.status-pill {
  font-size: 11px;
  font-weight: 800;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--warn);
  color: #241400;
}
.status-pill.brn {
  background: #ff7a3d;
}
.status-pill.par {
  background: #f7d02c;
}
.status-pill.psn,
.status-pill.tox {
  background: #b55cd6;
  color: #fff;
}
.status-pill.slp {
  background: #8e9bb3;
}
.status-pill.frz {
  background: #6cd3f5;
}
.cast-form {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-2);
}
.types {
  display: flex;
  gap: 3px;
}
.sub {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
  flex-wrap: wrap;
}
.sep {
  color: var(--text-3);
}
.tf-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--well);
  color: var(--text-2);
}
.item-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.item-btn:hover span:first-of-type {
  text-decoration: underline dotted;
}
.item-btn.gone {
  opacity: 0.55;
}
.item-btn.gone span:first-of-type {
  text-decoration: line-through;
}
.gone-tag {
  font-size: 10px;
  font-weight: 800;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 92, 122, 0.2);
  color: var(--bad);
}
.mega {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--mega);
  cursor: pointer;
}
.mega.form {
  color: var(--accent-2);
}
.hp-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.bar :deep(.track) {
  height: 10px;
}
.hp-edit {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.hp-in {
  width: 72px;
  padding: 3px 6px;
  text-align: right;
}
.stats {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 3px;
  text-align: center;
}
.st {
  background: var(--well);
  border-radius: 6px;
  padding: 3px 0;
  display: flex;
  flex-direction: column;
}
.st-k {
  font-size: 10px;
  color: var(--text-3);
  font-weight: 700;
}
.st-v {
  font-size: 14px;
  font-weight: 700;
}
.st-v.range {
  font-size: 11px;
  white-space: nowrap;
}
.st-v.up {
  color: var(--nature-up);
}
.st-v.down {
  color: var(--nature-down);
}
.moves-pp {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
}
.mv-chip {
  background: var(--well);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}
.mv-chip b {
  color: var(--text-2);
}
.mv-chip.unknown {
  justify-content: center;
  color: var(--text-3);
}
.mv-chip.out b {
  color: var(--bad);
}
.st-sp {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  white-space: nowrap;
}
.st-b {
  font-size: 10px;
  font-weight: 700;
}
.st-b.pos {
  color: var(--good);
}
.st-b.neg {
  color: var(--bad);
}
.lower {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 12px;
}
.conds {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.vol summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.vol summary::-webkit-details-marker {
  display: none;
}
.vol summary::before {
  content: '▸';
  color: var(--text-3);
}
.vol[open] summary::before {
  content: '▾';
}
.vol-count {
  background: var(--accent-2);
  color: var(--on-accent-2);
  border-radius: 999px;
  padding: 0 6px;
  font-size: 10px;
}
.vol-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
}
.vol-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(76, 201, 240, 0.18);
  color: var(--accent-2);
}
.small {
  font-size: 11px;
}
@media (max-width: 700px) {
  .lower {
    grid-template-columns: 1fr;
  }
}
</style>
