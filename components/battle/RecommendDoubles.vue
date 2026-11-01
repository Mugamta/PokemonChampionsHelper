<!--
  추천 플레이 (더블): 두 칸 조합 추천 + 내 필드 칸마다 선택지 순위 (composables/useRecommend.ts 의 doubles, 1턴 앞 근사)
  행동 패널의 "추천 플레이" 버튼으로 여는 다이얼로그 안의 내용. 열려 있는 동안만 계산한다.
  한 대상 기술은 상대 칸마다 한 줄, "적용"은 그 칸의 행동(대상 포함)으로 넣음. 조합의 "둘 다 적용"은 두 칸 모두 넣고 닫음.
  쓰러진 칸은 들어갈 포켓몬 순위 (적용 없음 — 싱글과 같음). 상대 예상 선택지 칩을 누르면 비중 조정
-->
<template>
  <section class="panel panel-pad rec">
    <h3 class="panel-title">
      {{ t('battle.rec.title') }}
      <span class="spacer" />
      <button
        type="button"
        class="btn btn-sm"
        :class="{ 'btn-on': showWeights }"
        @click="showWeights = !showWeights"
      >
        {{ t('battle.rec.weights') }}
      </button>
      <button
        type="button"
        class="btn btn-sm"
        :class="{ 'btn-on': showHelp }"
        :aria-label="t('battle.rec.help')"
        :title="t('battle.rec.help')"
        @click="showHelp = !showHelp"
      >
        ?
      </button>
      <button
        type="button"
        class="btn btn-sm"
        :aria-label="t('battle.rec.close')"
        @click="emit('close')"
      >
        ✕
      </button>
    </h3>
    <div class="body-scroll">
      <BattleRecommendWeights v-if="showWeights" />
      <p v-if="showHelp" class="help small">{{ t('battle.rec.scoreHelp') }}</p>
      <p class="muted small">{{ t('battle.rec.doublesHint') }}</p>
      <p v-if="rec.pending.value" class="status small" role="status">
        {{ t('battle.rec.pending') }}
      </p>
      <p v-else-if="!r" class="muted small">{{ t('battle.rec.none') }}</p>
      <template v-if="r">
        <!-- 상대 포켓몬마다 예상 선택지 (내 두 포켓몬 합쳐서) -->
        <BattleRecommendOppChips
          v-for="f in r.foes"
          :key="f.slot"
          :b="b"
          :oi="f.oi"
          :opp="f.opp"
          :label="t('battle.rec.oppVs', { name: oppName(f.oi) })"
        />

        <!-- 두 칸 조합 -->
        <div v-if="r.combos.length" class="slot combos">
          <h4 class="slot-title">{{ t('battle.rec.combos') }}</h4>
          <ol class="list">
            <li v-for="(c, k) in r.combos" :key="k" class="row" :class="{ best: k === 0 }">
              <span class="rank">{{ k + 1 }}</span>
              <div class="body">
                <div class="head">
                  <span v-for="p in c.picks" :key="p.slot" class="pick">
                    <UiPokeSprite :id="speciesOf(slotOf(p.slot).mi)" :size="22" />
                    {{ planText(slotOf(p.slot), planOf(p)) }}
                  </span>
                  <span class="spacer" />
                  <span class="score" :class="tone(c.expected)">{{ signed(c.expected) }}</span>
                  <button
                    v-if="comboApplicable(c)"
                    type="button"
                    class="btn btn-sm apply"
                    :class="{ 'btn-on': comboChosen(c) }"
                    :title="t('battle.rec.applyBothHint')"
                    @click="applyCombo(c)"
                  >
                    {{ t(comboChosen(c) ? 'battle.rec.applied' : 'battle.rec.applyBoth') }}
                  </button>
                </div>
                <p v-if="Math.abs(c.focus) >= 0.01" class="detail" :class="tone(c.focus)">
                  {{ t('battle.rec.focus', { p: signed(c.focus) }) }}
                </p>
              </div>
            </li>
          </ol>
        </div>

        <!-- 칸마다 -->
        <div v-for="sl in r.slots" :key="sl.slot" class="slot">
          <h4 class="slot-title">
            <UiPokeSprite :id="speciesOf(sl.mi)" :size="28" />
            {{ mineName(sl.mi) }}
            <span v-if="sl.mode === 'replace'" class="muted small">
              {{ t('battle.rec.replaceHint') }}
            </span>
          </h4>
          <ol class="list">
            <li
              v-for="{ p, k } in shown(sl)"
              :key="k"
              class="row"
              :class="{ best: k === 0, safe: k === sl.safe && k !== 0 }"
            >
              <span class="rank">{{ k + 1 }}</span>
              <div class="body">
                <div class="head">
                  <UiPokeSprite v-if="spriteOf(p)" :id="spriteOf(p)" :size="24" />
                  <span class="label">{{ planLabel(p.option) }}</span>
                  <span v-if="p.target != null && manyFoes" class="target">
                    {{ t('battle.rec.target', { name: oppName(foeAt(p.target)) }) }}
                  </span>
                  <span v-if="k === 0" class="tag tag-best">{{ t('battle.rec.best') }}</span>
                  <span v-if="sl.mode === 'turn' && k === sl.safe" class="tag tag-safe">
                    {{ t('battle.rec.safe') }}
                  </span>
                  <span class="spacer" />
                  <span class="score" :class="tone(p.expected)">{{ signed(p.expected) }}</span>
                  <button
                    v-if="sl.mode === 'turn'"
                    type="button"
                    class="btn btn-sm apply"
                    :class="{ 'btn-on': chosen(sl.slot, p) }"
                    :title="t('battle.rec.applyHint')"
                    @click="apply(sl.slot, p)"
                  >
                    {{ t(chosen(sl.slot, p) ? 'battle.rec.applied' : 'battle.rec.apply') }}
                  </button>
                </div>
                <p class="detail">
                  <span v-for="(d, i) in details(sl, p)" :key="i" :class="d.tone">
                    {{ d.text }}
                  </span>
                </p>
              </div>
            </li>
          </ol>
          <button
            v-if="sl.plans.length > SHOWN"
            type="button"
            class="btn btn-sm more"
            @click="toggleAll(sl.slot)"
          >
            {{
              all[sl.slot]
                ? t('battle.rec.less')
                : t('battle.rec.more', { n: sl.plans.length - shown(sl).length })
            }}
          </button>
        </div>
      </template>
      <BattleRecommendLog :b="b" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import { useRecLabels } from '~/composables/useRecLabels'
import {
  useRecommend,
  type DoublesCombo,
  type DoublesPlan,
  type DoublesSlot,
} from '~/composables/useRecommend'

const props = defineProps<{ b: ReturnType<typeof useBattle> }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const rec = useRecommend(props.b)
// 다이얼로그가 열려 있는 동안만 이 컴포넌트가 있으므로 바로 계산
rec.enabled.value = true
const { mineName, oppName, planLabel, signed } = useRecLabels(props.b)
const r = computed(() => rec.doubles.value)
const showWeights = ref(false)
const showHelp = ref(false)

// 칸마다 상위 SHOWN 개 + 안전 추천 (펼치면 전부)
const SHOWN = 6
const all = ref<Record<number, boolean>>({})
const toggleAll = (slot: number) => (all.value = { ...all.value, [slot]: !all.value[slot] })
const shown = (sl: DoublesSlot) =>
  sl.plans
    .map((p, k) => ({ p, k }))
    .filter(({ k }) => all.value[sl.slot] || k < SHOWN || k === sl.safe)
const foeAt = (slot: number) => r.value?.foes.find((f) => f.slot === slot)?.oi ?? -1
const speciesOf = (i: number) => props.b.resolveAt('mine', i)?.species.id || ''
const spriteOf = (p: DoublesPlan) => {
  const to = p.option.kind === 'switch' ? p.option.to : p.option.pivotTo
  return to == null ? null : speciesOf(to) || null
}
const slotOf = (slot: number) => r.value!.slots.find((x) => x.slot === slot)!
const planOf = (p: DoublesCombo['picks'][number]) => slotOf(p.slot).plans[p.plan]!
// 상대 필드에 둘 이상일 때만 대상 표시
const manyFoes = computed(() => (r.value?.foes.length ?? 0) > 1)
const planText = (sl: DoublesSlot, p: DoublesPlan) =>
  p.target != null && manyFoes.value
    ? `${planLabel(p.option)} ${t('battle.rec.target', { name: oppName(foeAt(p.target)) })}`
    : planLabel(p.option)

const pct = (v: number) => Math.round(v * 100)
const tone = (v: number) => (v > 0.05 ? 'good-text' : v < -0.05 ? 'bad-text' : '')
// 한 줄 요약: 선공 · 주는/받는 데미지 · 쓰러뜨림/쓰러짐 · 최악
const details = (sl: DoublesSlot, p: DoublesPlan) => {
  const s = p.summary
  const out: { text: string; tone?: string }[] = []
  if (sl.mode === 'replace') {
    if (s.myLoss >= 0.01) out.push({ text: t('battle.rec.hazard', { p: pct(s.myLoss) }) })
    return out
  }
  if (s.pFirst != null) out.push({ text: t('battle.rec.first', { p: pct(s.pFirst) }) })
  if (s.oppLoss >= 0.01) out.push({ text: t('battle.rec.dealt', { p: pct(s.oppLoss) }) })
  if (s.oppKo >= 0.01)
    out.push({ text: t('battle.rec.ko', { p: pct(Math.min(1, s.oppKo)) }), tone: 'good-text' })
  out.push({ text: t('battle.rec.taken', { p: pct(s.myLoss) }) })
  if (s.myKo >= 0.01)
    out.push({ text: t('battle.rec.fainted', { p: pct(s.myKo) }), tone: 'bad-text' })
  if (p.allyLoss >= 0.01)
    out.push({ text: t('battle.rec.allyHit', { p: signed(-p.allyLoss) }), tone: 'bad-text' })
  out.push({ text: t('battle.rec.worstScore', { score: signed(p.worst) }) })
  return out
}

// ── 행동 칸에 넣기 ─────────────
// 그 칸의 행동에 넣기 (데미지 등 입력은 비움). 두 칸을 다 넣을 수 있게 닫지 않음
const action = (slot: number) => props.b.state.value?.actions.mine[slot]
const apply = (slot: number, p: DoublesPlan) => {
  const a = action(slot)
  const o = p.option
  if (!a) return
  const clear = { amount: null, amount2: null, allyAmount: null, crit: false, missed: false }
  if (o.kind === 'switch') Object.assign(a, { ...clear, kind: 'switch', switchTo: o.to })
  else
    Object.assign(a, {
      ...clear,
      kind: 'move',
      move: o.move,
      via: '',
      target: p.target ?? a.target,
      useMega: o.mega,
      selfSwitch: o.pivotTo ?? null,
    })
}
const chosen = (slot: number, p: DoublesPlan) => {
  const a = action(slot)
  const o = p.option
  if (!a) return false
  return o.kind === 'switch'
    ? a.kind === 'switch' && a.switchTo === o.to
    : a.kind === 'move' &&
        a.move === o.move &&
        a.useMega === o.mega &&
        (p.target == null || a.target === p.target) &&
        (o.pivotTo == null || a.selfSwitch === o.pivotTo)
}
// 조합: 두 칸 모두 이번 턴 행동일 때만 넣을 수 있음 (쓰러진 칸 교체는 싱글처럼 직접)
const comboApplicable = (c: DoublesCombo) => c.picks.every((p) => slotOf(p.slot).mode === 'turn')
const comboChosen = (c: DoublesCombo) => c.picks.every((p) => chosen(p.slot, planOf(p)))
const applyCombo = (c: DoublesCombo) => {
  for (const p of c.picks) apply(p.slot, planOf(p))
  emit('close')
}

// ── 추천 기록 ─────────────
// 이번 턴 결과를 배틀 상태에 남김 (턴을 적용하면 기록으로 옮겨짐 — 추천과 실제 행동 비교)
watch(
  [r, rec.pending],
  () => {
    const s = props.b.state.value
    const x = r.value
    if (!s || !x || rec.pending.value) return
    const slots = x.slots
      .filter((sl) => sl.mode === 'turn' && sl.plans.length)
      .map((sl) => ({
        slot: sl.slot,
        best: 0,
        safe: sl.safe,
        options: sl.plans.map((p) => ({ pick: p.option, target: p.target, expected: p.expected })),
      }))
    s.recNote = slots.length ? { turn: s.turn, depth: 1, slots } : null
  },
  { immediate: true },
)
</script>

<style scoped>
.rec {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(88vh, 900px);
  background: var(--panel-solid);
}
.body-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  min-height: 0;
}
.rec .panel-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.spacer {
  flex: 1;
}
.small {
  font-size: 12px;
  margin: 0;
}
.help {
  color: var(--text-2);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--well);
  line-height: 1.5;
}
.status {
  color: var(--accent-2);
  font-weight: 700;
}
.btn-on {
  border-color: var(--accent-2);
  color: var(--accent-2);
}
.slot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
}
.combos {
  border-color: var(--accent);
}
.slot-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 14px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
}
.row.best {
  border-color: var(--accent);
}
.row.safe {
  border-color: var(--accent-2);
}
.rank {
  font-weight: 800;
  color: var(--text-3);
}
.body {
  flex: 1;
  min-width: 0;
}
.head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
}
.label {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.pick {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 700;
  margin-right: 6px;
}
.target {
  font-size: 12px;
  color: var(--text-2);
}
.tag {
  font-size: 10px;
  font-weight: 800;
  padding: 0 5px;
  border-radius: 999px;
}
.tag-best {
  background: var(--accent);
  color: var(--accent-ink);
}
.tag-safe {
  border: 1px solid var(--accent-2);
  color: var(--accent-2);
}
.score {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.apply {
  padding: 0 8px;
  font-size: 11px;
}
.detail {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-2);
}
.more {
  align-self: flex-start;
}
</style>
