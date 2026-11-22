<!--
  도감 포켓몬 상세 오른쪽: 순위·채용률의 월별 / 시즌별 추이 그래프 (싱글/더블은 useUsageKind).
  위 = 채용률, 아래 = 순위 (1위가 위) — 축이 다른 두 값이라 한 그래프에 겹치지 않고 x 축을 공유하는 두 칸으로.
  월별은 레귤레이션 경계에 점선, 고른 기간(useDexPeriod)의 레귤레이션 칸을 옅게 칠한다. 점을 누르면 그 기간으로.
  데이터: public/data/stats/trend-{kind}.json (index 목록 순서대로 [순위, 채용률] | 0)
-->
<template>
  <div class="trend">
    <div class="trend-head">
      <span class="section-label">{{ t('dex.trend.title') }}</span>
      <span class="spacer" />
      <span class="modes" role="group" :aria-label="t('dex.trend.title')">
        <button
          v-for="m in MODES"
          :key="m"
          type="button"
          class="chip"
          :class="{ active: mode === m }"
          :aria-pressed="mode === m"
          @click="mode = m"
        >
          {{ t('usageStats.mode.' + m) }}
        </button>
      </span>
    </div>

    <p v-if="trend === undefined" class="muted small">…</p>
    <p v-else-if="!pts.some((x) => x.v)" class="muted small">{{ t('dex.noUsage') }}</p>
    <div v-else class="plot" @mouseleave="hover = -1">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        :aria-label="ariaLabel"
        class="svg"
        @mousemove="onMove"
        @click="onClick"
      >
        <!-- 고른 레귤레이션 칸 -->
        <rect
          v-if="band"
          :x="band.x"
          :y="U_TOP - 4"
          :width="band.w"
          :height="R_BOT - U_TOP + 8"
          class="band"
        />
        <!-- 칸 이름 + 눈금 -->
        <text :x="0" :y="U_TOP - 8" class="ttl">{{ t('usageStats.col.usage') }}</text>
        <text :x="0" :y="R_TOP - 8" class="ttl">{{ t('usageStats.col.rank') }}</text>
        <line :x1="L" :x2="W - R" :y1="U_TOP" :y2="U_TOP" class="grid" />
        <line :x1="L" :x2="W - R" :y1="U_BOT" :y2="U_BOT" class="axis" />
        <text :x="L - 4" :y="U_TOP + 3" class="tick end">{{ pctTick(uMax) }}</text>
        <text :x="L - 4" :y="U_BOT + 3" class="tick end">0%</text>
        <line :x1="L" :x2="W - R" :y1="R_TOP" :y2="R_TOP" class="grid" />
        <line :x1="L" :x2="W - R" :y1="R_BOT" :y2="R_BOT" class="grid" />
        <text :x="L - 4" :y="R_TOP + 3" class="tick end">1</text>
        <text :x="L - 4" :y="R_BOT + 3" class="tick end">{{ rMax }}</text>
        <!-- 레귤레이션 경계 (월별) -->
        <line
          v-for="b in bounds"
          :key="'b' + b"
          :x1="b"
          :x2="b"
          :y1="U_TOP - 4"
          :y2="R_BOT + 4"
          class="bound"
        />
        <!-- 레귤레이션 이름 (월별: 칸 가운데 위) -->
        <text v-for="g in groups" :key="'g' + g.reg + g.x" :x="g.x" :y="H - 2" class="tick mid reg">
          {{ g.reg }}
        </text>
        <!-- x 눈금 -->
        <text v-for="(pt, i) in pts" :key="'x' + i" :x="xs[i]" :y="X_LBL" class="tick mid">
          {{ xLabel(pt.meta) }}
        </text>
        <!-- 십자선 -->
        <line
          v-if="hover >= 0"
          :x1="xs[hover]"
          :x2="xs[hover]"
          :y1="U_TOP - 4"
          :y2="R_BOT + 4"
          class="cross"
        />
        <!-- 선 -->
        <path :d="path((v) => uy(v[1]))" class="line" />
        <path :d="path((v) => ry(v[0]))" class="line" />
        <!-- 점 -->
        <template v-for="(pt, i) in pts" :key="'p' + i">
          <template v-if="pt.v">
            <circle
              :cx="xs[i]"
              :cy="uy(pt.v[1])"
              :r="isCur(pt.meta) || hover === i ? 5 : 4"
              class="dot"
              :class="{ cur: isCur(pt.meta) }"
            />
            <circle
              :cx="xs[i]"
              :cy="ry(pt.v[0])"
              :r="isCur(pt.meta) || hover === i ? 5 : 4"
              class="dot"
              :class="{ cur: isCur(pt.meta) }"
            />
          </template>
        </template>
      </svg>
      <div
        v-if="hover >= 0 && pts[hover]"
        class="tip"
        :class="{ right: xs[hover]! > W / 2 }"
        :style="{ left: (xs[hover]! / W) * 100 + '%' }"
      >
        <b>{{ period.periodLabel(pts[hover]!.meta) }}</b>
        <template v-if="pts[hover]!.v">
          <span class="num">{{ t('usageStats.rank', { n: pts[hover]!.v![0] }) }}</span>
          <span class="num">{{ pct(pts[hover]!.v![1]) }}</span>
        </template>
        <span v-else class="muted">{{ t('dex.trend.none') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDexPeriod } from '~/composables/useDexPeriod'
import { useUsageStats } from '~/composables/useUsageStats'
import { isSeason, statsKey, type StatsMeta } from '~/utils/usageStats'

const props = defineProps<{ monId: string }>()
const { t } = useI18n()
const period = useDexPeriod()
const stats = useUsageStats()

const MODES = ['month', 'season'] as const
const mode = useState<(typeof MODES)[number]>('dex-trend-mode', () => 'month')

// ── 자료 ─────────────
const trend = computed(() => stats.trend(period.kind.value))
// 이 모드의 기간 + [순위, 채용률] (그 기간 순위표에 없으면 null)
const pts = computed(() => {
  const row = trend.value?.[props.monId]
  return period.list.value
    .map((meta, i) => ({ meta, v: row?.[i] || null }))
    .filter((x) => isSeason(x.meta) === (mode.value === 'season'))
})

// ── 좌표 ─────────────
const W = 380
const L = 30 // y 눈금 자리
const R = 10
const U_TOP = 18
const U_BOT = 74
const R_TOP = 100
const R_BOT = 156
const X_LBL = R_BOT + 16
const H = X_LBL + 14

const xs = computed(() => {
  const n = pts.value.length
  const w = W - L - R
  return pts.value.map((_, i) => (n <= 1 ? L + w / 2 : L + (i * w) / (n - 1)))
})
const uMax = computed(() => {
  const m = Math.max(0, ...pts.value.map((x) => x.v?.[1] ?? 0))
  // 눈금이 깔끔하게: 5% 단위로 올림 (5% 미만이면 1% 단위)
  const step = m < 0.05 ? 0.01 : 0.05
  return Math.max(step, Math.ceil((m * 1.05) / step) * step)
})
const rMax = computed(() => Math.max(5, ...pts.value.map((x) => x.v?.[0] ?? 0)))
const uy = (u: number) => U_BOT - (u / uMax.value) * (U_BOT - U_TOP)
const ry = (r: number) => R_TOP + ((r - 1) / (rMax.value - 1)) * (R_BOT - R_TOP)

// 순위표에 없는 기간에서는 선을 끊는다
const path = (y: (v: [number, number]) => number) => {
  let d = ''
  let open = false
  pts.value.forEach((pt, i) => {
    if (!pt.v) return void (open = false)
    d += `${open ? 'L' : 'M'}${xs.value[i]!.toFixed(1)},${y(pt.v).toFixed(1)}`
    open = true
  })
  return d
}

// 월별: 레귤레이션 경계·이름 / 시즌별: x 눈금이 곧 레귤레이션
const segs = computed(() => {
  if (mode.value === 'season') return []
  const out: { reg: string; from: number; to: number }[] = []
  pts.value.forEach((pt, i) => {
    const last = out.at(-1)
    if (last?.reg === pt.meta.reg) last.to = i
    else out.push({ reg: pt.meta.reg, from: i, to: i })
  })
  return out
})
const half = computed(() =>
  pts.value.length > 1 ? (W - L - R) / (pts.value.length - 1) / 2 : (W - L - R) / 2,
)
const bounds = computed(() => segs.value.slice(1).map((s) => xs.value[s.from]! - half.value))
const groups = computed(() =>
  segs.value.map((s) => ({ reg: s.reg, x: (xs.value[s.from]! + xs.value[s.to]!) / 2 })),
)
const band = computed(() => {
  const cur = period.current.value
  const s = segs.value.find((x) => x.reg === cur?.reg)
  if (!s) return null
  const x0 = Math.max(L, xs.value[s.from]! - half.value)
  const x1 = Math.min(W - R, xs.value[s.to]! + half.value)
  return { x: x0, w: x1 - x0 }
})

const xLabel = (m: StatsMeta) => (isSeason(m) ? m.reg : period.monthShort(m.period))
const isCur = (m: StatsMeta) =>
  !!period.current.value && statsKey(m) === statsKey(period.current.value)

// ── 마우스 ─────────────
const hover = ref(-1)
const nearest = (e: MouseEvent) => {
  const svg = e.currentTarget as SVGSVGElement
  const box = svg.getBoundingClientRect()
  const x = ((e.clientX - box.left) / box.width) * W
  let best = -1
  let bd = Infinity
  xs.value.forEach((xi, i) => {
    const d = Math.abs(xi - x)
    if (d < bd) [best, bd] = [i, d]
  })
  return best
}
const onMove = (e: MouseEvent) => (hover.value = nearest(e))
const onClick = (e: MouseEvent) => {
  const pt = pts.value[nearest(e)]
  if (pt) period.select(pt.meta)
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const pctTick = (v: number) => `${Math.round(v * 100)}%`
const ariaLabel = computed(() =>
  pts.value
    .map(
      (pt) =>
        `${period.periodLabel(pt.meta)}: ${
          pt.v ? `${t('usageStats.rank', { n: pt.v[0] })} ${pct(pt.v[1])}` : '—'
        }`,
    )
    .join(', '),
)
</script>

<style scoped>
.trend {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.trend-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.modes {
  display: inline-flex;
  gap: 4px;
}
.modes .chip {
  padding: 2px 8px;
  font-size: 11px;
}
.plot {
  position: relative;
}
.svg {
  display: block;
  width: 100%;
  height: auto;
  cursor: pointer;
}
.ttl {
  font-size: 10px;
  font-weight: 700;
  fill: var(--text-2);
}
.tick {
  font-size: 10px;
  fill: var(--text-3);
}
.tick.end {
  text-anchor: end;
}
.tick.mid {
  text-anchor: middle;
}
.tick.reg {
  font-weight: 700;
  fill: var(--text-2);
}
.grid {
  stroke: var(--line-soft);
  stroke-width: 1;
}
.axis {
  stroke: var(--line-strong);
  stroke-width: 1;
}
.bound {
  stroke: var(--line-strong);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.band {
  fill: var(--hover);
}
.cross {
  stroke: var(--text-3);
  stroke-width: 1;
}
.line {
  fill: none;
  stroke: var(--accent-2);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.dot {
  fill: var(--accent-2);
  stroke: var(--panel-solid);
  stroke-width: 2;
}
.dot.cur {
  fill: var(--accent);
}
.tip {
  position: absolute;
  top: 0;
  transform: translateX(8px);
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--panel-solid);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow);
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}
.tip.right {
  transform: translateX(calc(-100% - 8px));
}
.small {
  font-size: 12px;
  margin: 0;
}
</style>
