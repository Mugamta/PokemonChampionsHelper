<!--
  추천 플레이 (싱글): 내 기술·교체마다 이번 턴 결과를 점수로 매긴 순위 (composables/useRecommend.ts)
  행동 패널의 "추천 플레이" 버튼으로 여는 다이얼로그 안의 내용. 열려 있는 동안만 계산한다 (닫으면 v-if 로 내림)
  가중치는 펼쳐서 바꿀 수 있음 (RecommendWeights), 1턴 / 2턴 / 3턴 앞 선택 (localStorage 저장). 1턴 결과를 먼저 보여 주고 깊은 계산은 이어서.
  상대 예상 선택지를 누르면 비중 조정 (RecommendOppChips). 상위 3개와 추천·안전만 자세히, 나머지는 한 줄 (눌러서 펼침)
-->
<template>
  <section class="panel panel-pad rec">
    <h3 class="panel-title">
      {{ t('battle.rec.title') }}
      <span class="spacer" />
      <span class="depth" role="group" :aria-label="t('battle.rec.depth')">
        <button
          v-for="d in [1, 2, 3] as const"
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

      <p v-if="!r" class="muted small">{{ t('battle.rec.none') }}</p>
      <template v-else>
        <p class="muted small">
          {{ t(r.mode === 'replace' ? 'battle.rec.replaceHint' : 'battle.rec.hint') }}
        </p>
        <p v-if="rec.pending.value" class="status small" role="status">
          {{ t('battle.rec.pending') }}
        </p>
        <p v-else-if="r.endgame" class="status small">
          {{ t('battle.rec.endgame', { n: r.depth }) }}
        </p>
        <BattleRecommendOppChips
          v-if="r.mode === 'turn'"
          :b="b"
          :oi="r.oi"
          :opp="r.opp"
          :label="t('battle.rec.oppExpect')"
        />
        <ol class="list">
          <li
            v-for="(x, k) in r.ranked"
            :key="x.index"
            class="row"
            :class="{
              best: x.index === r.best,
              safe: x.index === r.safe,
              compact: !expanded(x, k),
            }"
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
                <span v-if="r.endgame" class="win" :title="t('battle.rec.winHint')">
                  {{ t('battle.rec.win', { p: pct(x.summary.win) }) }}
                </span>
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
              <button
                v-if="!expanded(x, k)"
                type="button"
                class="unfold"
                :aria-label="t('battle.rec.unfold')"
                @click="opened.add(x.index)"
              >
                {{ t('battle.rec.unfold') }}
              </button>
              <template v-else>
                <p class="detail">
                  <span v-for="(d, i) in details(x)" :key="i" :class="d.tone">{{ d.text }}</span>
                </p>
                <!-- 왜 이 순위인가: 1위는 2위보다, 나머지는 1위보다 어느 항목에서 차이가 나는가 -->
                <p v-if="why(x, k)" class="detail why">{{ why(x, k) }}</p>
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
              </template>
            </div>
          </li>
        </ol>
      </template>
      <BattleRecommendLog :b="b" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { useBattle } from '~/composables/useBattle'
import { useRecLabels } from '~/composables/useRecLabels'
import { useRecWeights, useRecommend, type Recommendation } from '~/composables/useRecommend'
import type { ScoreParts } from '~/utils/recommend'

const props = defineProps<{ b: ReturnType<typeof useBattle> }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const rec = useRecommend(props.b)
// 다이얼로그가 열려 있는 동안만 이 컴포넌트가 있으므로 바로 계산
rec.enabled.value = true
const rw = useRecWeights()
const { mineName, oppLabel, planLabel, signed } = useRecLabels(props.b)
const r = computed(() => rec.result.value)
const showWeights = ref(false)
const showHelp = ref(false)

type RankedRow = Recommendation['ranked'][number]

// ── 펼쳐 볼 줄 ─────────────
// 상위 EXPANDED 개와 추천·안전은 자세히, 나머지는 한 줄 (눌러서 펼침)
const EXPANDED = 3
const opened = reactive(new Set<number>())
const expanded = (x: RankedRow, k: number) =>
  k < EXPANDED || x.index === r.value?.best || x.index === r.value?.safe || opened.has(x.index)

// ── 내 선택지 ─────────────
const opt = (i: number) => r.value!.options[i]!
// 교체·교체기면 들어가는 포켓몬 그림
const spriteOf = (i: number) => {
  const o = opt(i)
  const to = o.kind === 'switch' ? o.to : o.pivotTo
  return to == null ? null : props.b.resolveAt('mine', to)?.species.id || null
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
    : a.kind === 'move' &&
        a.move === o.move &&
        a.useMega === o.mega &&
        (o.pivotTo == null || a.selfSwitch === o.pivotTo)
}
const pct = (v: number) => Math.round(v * 100)
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

// 점수 구성 차이: 1위는 2위와, 나머지는 1위와 비교해 차이가 큰 항목부터 (0.01 미만은 빼고 최대 3개)
const PART_KEYS: (keyof ScoreParts)[] = ['damage', 'ko', 'hazard', 'future']
const why = (x: RankedRow, k: number) => {
  const ranked = r.value?.ranked ?? []
  const base = k === 0 ? ranked[1] : ranked[0]
  if (!base) return ''
  const diffs = PART_KEYS.map((p) => ({
    p,
    d: x.summary.parts[p] - base.summary.parts[p],
  }))
    .filter((v) => Math.abs(v.d) >= 0.01)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 3)
  if (!diffs.length) return ''
  const list = diffs.map((v) => `${t(`battle.rec.part.${v.p}`)} ${signed(v.d)}`).join(' · ')
  return t(k === 0 ? 'battle.rec.whyBest' : 'battle.rec.whyVsBest', { list })
}

// ── 추천 기록 ─────────────
// 이번 턴 결과를 배틀 상태에 남김 (턴을 적용하면 기록으로 옮겨짐 — 추천과 실제 행동 비교)
watch(
  [r, rec.pending],
  () => {
    const s = props.b.state.value
    const x = r.value
    if (!s || !x || x.mode !== 'turn' || rec.pending.value) return
    const expected = new Map(x.ranked.map((row) => [row.index, row.expected]))
    s.recNote = {
      turn: s.turn,
      depth: x.depth,
      slots: [
        {
          slot: 0,
          best: x.best,
          safe: x.safe,
          options: x.options.map((pick, i) => ({ pick, expected: expected.get(i) ?? 0 })),
        },
      ],
    }
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
.status {
  color: var(--accent-2);
  font-weight: 700;
}
.btn-on {
  border-color: var(--accent-2);
  color: var(--accent-2);
}
.help {
  color: var(--text-2);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--well);
  line-height: 1.5;
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
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}
.row.compact {
  padding: 4px 10px;
}
.unfold {
  margin-top: 2px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-3);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.unfold:hover {
  color: var(--text-2);
}
.label {
  font-weight: 800;
  color: var(--text);
  min-width: 0;
  overflow-wrap: anywhere;
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
.win {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
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
.why {
  color: var(--text-3);
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
