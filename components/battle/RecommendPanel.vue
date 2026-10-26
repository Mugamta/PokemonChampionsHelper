<!--
  추천 플레이 (싱글): 내 기술·교체마다 이번 턴 결과를 점수로 매긴 순위 (composables/useRecommend.ts)
  행동 패널의 "추천 플레이" 버튼으로 여는 다이얼로그 안의 내용. 열려 있는 동안만 계산한다 (닫으면 v-if 로 내림)
  가중치는 펼쳐서 바꿀 수 있음, 1턴 / 2턴 앞 선택 (localStorage 저장)
-->
<template>
  <section class="panel panel-pad rec">
    <h3 class="panel-title">
      {{ t('battle.rec.title') }}
      <span class="spacer" />
      <span class="depth" role="group" :aria-label="t('battle.rec.depth')">
        <button
          v-for="d in [1, 2] as const"
          :key="d"
          type="button"
          class="btn btn-sm"
          :class="{ 'btn-on': rw.depth.value === d }"
          :title="t(`battle.rec.depth${d}Hint`)"
          @click="rw.setDepth(d)"
        >
          {{ t(`battle.rec.depth${d}`) }}
        </button>
      </span>
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
        :aria-label="t('battle.rec.close')"
        @click="emit('close')"
      >
        ✕
      </button>
    </h3>
    <div class="body-scroll">
      <!-- 가중치 -->
      <div v-if="showWeights" class="weights">
        <label v-for="k in WEIGHT_KEYS" :key="k" class="weight">
          <span>{{ t(`battle.rec.w.${k}`) }}</span>
          <input
            class="field-input"
            type="number"
            min="0"
            :max="k === 'plausible' ? 1 : undefined"
            :step="k === 'plausible' ? 0.05 : 0.1"
            :value="rw.weights.value[k]"
            @change="rw.set(k, ($event.target as HTMLInputElement).value)"
          />
          <small class="muted">{{ t(`battle.rec.w.${k}Hint`) }}</small>
        </label>
        <button type="button" class="btn btn-sm" @click="rw.reset()">
          {{ t('battle.rec.w.reset') }}
        </button>
      </div>

      <p v-if="!r" class="muted small">{{ t('battle.rec.none') }}</p>
      <template v-else>
        <p class="muted small">
          {{ t(r.mode === 'replace' ? 'battle.rec.replaceHint' : 'battle.rec.hint') }}
        </p>
        <p v-if="r.mode === 'turn'" class="opp-line">
          <span class="section-label">{{ t('battle.rec.oppExpect') }}</span>
          <span
            v-for="(o, i) in oppSorted"
            :key="i"
            class="opp-move"
            :class="{ sw: o.kind === 'switch' }"
          >
            {{ oppLabel(o) }} {{ Math.round(o.weight * 100) }}%
          </span>
        </p>
        <ol class="list">
          <li
            v-for="(x, k) in r.ranked"
            :key="x.index"
            class="row"
            :class="{ best: x.index === r.best, safe: x.index === r.safe }"
          >
            <span class="rank">{{ k + 1 }}</span>
            <div class="body">
              <div class="head">
                <UiPokeSprite v-if="spriteOf(x.index)" :id="spriteOf(x.index)" :size="28" />
                <span class="label">{{ label(x.index) }}</span>
                <span v-if="x.index === r.best" class="tag tag-best">{{
                  t('battle.rec.best')
                }}</span>
                <span v-if="x.index === r.safe" class="tag tag-safe">{{
                  t('battle.rec.safe')
                }}</span>
                <span class="spacer" />
                <span class="score" :class="tone(x.expected)">{{ signed(x.expected) }}</span>
                <button
                  v-if="r.mode === 'turn'"
                  type="button"
                  class="btn btn-sm apply"
                  :class="{ 'btn-on': chosen(x.index) }"
                  :title="t('battle.rec.applyHint')"
                  @click="apply(x.index)"
                >
                  {{ t(chosen(x.index) ? 'battle.rec.applied' : 'battle.rec.apply') }}
                </button>
              </div>
              <p class="detail">
                <span v-for="(d, i) in details(x)" :key="i" :class="d.tone">{{ d.text }}</span>
              </p>
              <p v-if="x.summary.next" class="detail next">
                {{
                  t('battle.rec.next', {
                    name: mineName(x.summary.next.mi),
                    plan: planLabel(x.summary.next.option),
                  })
                }}
              </p>
              <p
                v-if="r.mode === 'turn' && x.worstAgainst >= 0 && r.opp.length > 1"
                class="detail worst"
              >
                {{
                  t('battle.rec.worst', {
                    move: oppLabel(r.opp[x.worstAgainst]!),
                    score: signed(x.worst),
                  })
                }}
              </p>
            </div>
          </li>
        </ol>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import {
  useRecWeights,
  useRecommend,
  type MineOption,
  type OppOption,
  type Recommendation,
} from '~/composables/useRecommend'
import { WEIGHT_KEYS } from '~/utils/recommend'

const props = defineProps<{ b: ReturnType<typeof useBattle> }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const gd = useGameData()
const rec = useRecommend(props.b)
// 다이얼로그가 열려 있는 동안만 이 컴포넌트가 있으므로 바로 계산
rec.enabled.value = true
const rw = useRecWeights()
const r = computed(() => rec.result.value)
const showWeights = ref(false)

type RankedRow = Recommendation['ranked'][number]

const oppSorted = computed(() => [...(r.value?.opp ?? [])].sort((a, b) => b.weight - a.weight))
const opt = (i: number) => r.value!.options[i]!
const mineName = (idx: number) => gd.name('pokemon', props.b.resolveAt('mine', idx)?.species.id)
const oppLabel = (o: OppOption) =>
  o.kind === 'switch'
    ? t('battle.rec.switchTo', {
        name: gd.name('pokemon', props.b.resolveAt('opp', o.to)?.species.id),
      })
    : gd.name('moves', o.move)
// 교체·교체기면 들어가는 포켓몬 그림
const spriteOf = (i: number) => {
  const o = opt(i)
  const to = o.kind === 'switch' ? o.to : o.pivotTo
  return to == null ? null : props.b.resolveAt('mine', to)?.species.id || null
}
const planLabel = (o: MineOption) => {
  if (o.kind === 'switch') return t('battle.rec.switchTo', { name: mineName(o.to) })
  let name = gd.name('moves', o.move)
  if (o.pivotTo != null) name = t('battle.rec.pivot', { move: name, name: mineName(o.pivotTo) })
  return o.mega ? t('battle.rec.mega', { move: name }) : name
}
const label = (i: number) => planLabel(opt(i))
// 이번 턴 내 행동 칸에 넣기 (데미지 등 입력은 비움) 후 닫기
const action = () => props.b.state.value?.actions.mine[0]
const apply = (i: number) => {
  const a = action()
  const o = opt(i)
  if (!a) return
  const clear = { amount: null, amount2: null, allyAmount: null, crit: false, missed: false }
  if (o.kind === 'switch') Object.assign(a, { ...clear, kind: 'switch', switchTo: o.to })
  else
    Object.assign(a, {
      ...clear,
      kind: 'move',
      move: o.move,
      via: '',
      target: 0,
      useMega: o.mega,
      selfSwitch: o.pivotTo ?? null,
    })
  // 넣은 행동을 바로 볼 수 있게 닫기
  emit('close')
}
// 지금 행동 칸이 이 선택지인가
const chosen = (i: number) => {
  const a = action()
  const o = opt(i)
  if (!a) return false
  return o.kind === 'switch'
    ? a.kind === 'switch' && a.switchTo === o.to
    : a.kind === 'move' && a.move === o.move && (o.pivotTo == null || a.selfSwitch === o.pivotTo)
}
const pct = (v: number) => Math.round(v * 100)
const signed = (v: number) => {
  const n = Math.round(v * 100)
  return n > 0 ? `+${n}` : String(n)
}
const tone = (v: number) => (v > 0.05 ? 'good-text' : v < -0.05 ? 'bad-text' : '')

// 한 줄 요약: 선공 확률 · 주는/받는 데미지 · 쓰러뜨림/쓰러짐 확률 · 설치기 · 턴 뒤 맞대결
const details = (x: RankedRow) => {
  const s = x.summary
  const out: { text: string; tone?: string }[] = []
  if (s.pFirst != null) out.push({ text: t('battle.rec.first', { p: pct(s.pFirst) }) })
  if (r.value?.mode === 'turn') {
    if (s.pFirst != null) out.push({ text: t('battle.rec.dealt', { p: pct(s.oppLoss) }) })
    if (s.oppKo >= 0.01)
      out.push({ text: t('battle.rec.ko', { p: pct(s.oppKo) }), tone: 'good-text' })
    out.push({ text: t('battle.rec.taken', { p: pct(s.myLoss) }) })
    if (s.myKo >= 0.01)
      out.push({ text: t('battle.rec.fainted', { p: pct(s.myKo) }), tone: 'bad-text' })
    if (Math.abs(s.utility) >= 0.01)
      out.push({
        text: t('battle.rec.utility', { p: signed(s.utility) }),
        tone: s.utility > 0 ? 'good-text' : 'bad-text',
      })
  } else if (s.myLoss >= 0.01) out.push({ text: t('battle.rec.hazard', { p: pct(s.myLoss) }) })
  out.push(
    s.duel > 0.15
      ? { text: t('battle.rec.duelGood'), tone: 'good-text' }
      : s.duel < -0.15
        ? { text: t('battle.rec.duelBad'), tone: 'bad-text' }
        : { text: t('battle.rec.duelEven') },
  )
  return out
}
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
  gap: 8px;
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
.btn-on {
  border-color: var(--accent-2);
  color: var(--accent-2);
}
.weights {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  align-items: end;
  padding: 8px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--line-strong);
}
.weight {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
}
.weight .field-input {
  width: 100%;
}
.weight small {
  font-weight: 400;
  font-size: 11px;
  line-height: 1.3;
}
.opp-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
}
.opp-move {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--text-2);
}
.opp-move.sw {
  border-style: dashed;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--well);
}
.row.best {
  border-color: var(--accent);
}
.row.safe:not(.best) {
  border-color: var(--accent-2);
}
.rank {
  font-weight: 800;
  color: var(--text-3);
  min-width: 14px;
}
.body {
  flex: 1;
  min-width: 0;
}
.head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.label {
  font-weight: 800;
  color: var(--text);
}
.tag {
  font-size: 11px;
  font-weight: 800;
  padding: 0 6px;
  border-radius: 999px;
}
.tag-best {
  background: var(--accent);
  color: var(--accent-ink);
}
.tag-safe {
  background: var(--accent-2);
  color: var(--on-accent-2);
}
.apply {
  padding: 0 8px;
  font-size: 11px;
}
.score {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.detail {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-2);
}
.worst {
  color: var(--text-3);
}
.next {
  color: var(--accent-2);
}
.depth {
  display: inline-flex;
  gap: 2px;
}
</style>
