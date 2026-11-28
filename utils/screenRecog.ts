// 화면 인식 (선출 화면 스크린샷 → 상대 6마리 / 내 6마리)
// 브라우저 API 없이 RGBA 픽셀 배열만 다루는 순수 계산. 이미지 디코딩·스프라이트 축소·OCR 은 composables/useScreenRecog.ts.
//
// 방법: 게임 선출 화면의 아이콘은 앱의 포켓몬 스프라이트(공식 메뉴 스프라이트)와 같은 그림이다.
// ① 색으로 칸(상대 = 진홍, 내 쪽 = 보라 / 고른 칸 연두)을 찾고
// ② 6칸이 공유하는 아이콘 크기·위치를 고른 뒤 (칸마다 따로 맞추면 엉뚱한 큰 스프라이트가 배경에 맞는다)
// ③ 스프라이트를 칸 바탕색 위에 합성해서 화면과 비교한다 (투명한 부분도 비교 → 윤곽·크기가 다른 포켓몬이 밀려남).

export interface Rgba {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export type RecogSide = 'opp' | 'mine'
/** size×size 로 줄인 스프라이트 (RGBA) */
export interface IconTemplate {
  id: string
  data: Uint8ClampedArray | Uint8Array
}
export interface IconGeometry {
  /** 칸 높이 대비 아이콘 한 변 */
  size: number
  /** 칸 기준 아이콘 중심 (칸 높이 단위, x 는 상대 = 왼쪽 끝 기준 / 내 쪽 = 오른쪽 끝 기준) */
  cx: number
  cy: number
}
export interface IconCandidate {
  id: string
  /** 픽셀당 색 차이 (RGB 거리, 낮을수록 비슷함) */
  score: number
}
export interface SlotMatch {
  panel: Rect
  icon: Rect
  candidates: IconCandidate[]
}

// ── 칸 색 ─────────────────────────────────────────────
// 상대 칸 = 진홍 (예: 137,3,55 / 169,10,34), 내 칸 = 보라 (105,90,220), 고른 칸 = 연두 (200,240,40)
const isOppPanel = (r: number, g: number, b: number) =>
  r > 85 && g < 45 && b < 120 && r - g > 70 && r > b * 1.3
const isMinePanel = (r: number, g: number, b: number) =>
  (b > 150 && r > 50 && r < 160 && g < b - 70 && r < b - 40) || // 보라
  (g > 190 && r > 140 && b < 130 && g > r) // 연두 (지금 고른 칸)

// 칸 안에서 아이콘 위치 (두 해상도·비율의 스크린샷에서 잰 값. 공통 배치 탐색의 출발점)
export const DEFAULT_GEOMETRY: Record<RecogSide, IconGeometry> = {
  opp: { size: 0.95, cx: 1.0, cy: 0.52 },
  mine: { size: 1.2, cx: 0.45, cy: 0.5 },
}

// ── ① 칸 찾기 ─────────────────────────────────────────────

/**
 * 한쪽 6칸의 위치. 못 찾으면 null.
 * 상대는 화면 오른쪽 절반, 내 쪽은 왼쪽 절반에서 칸 색이 많은 열 범위 → 그 범위에서 칸 색이 많은 행의 덩어리 6개.
 */
export function findPanels(img: Rgba, side: RecogSide): Rect[] | null {
  const { data, width: W, height: H } = img
  const test = side === 'opp' ? isOppPanel : isMinePanel
  const x0 = side === 'opp' ? Math.floor(W * 0.5) : 0
  const x1 = side === 'opp' ? W : Math.ceil(W * 0.5)
  const mask = new Uint8Array(W * H)
  const col = new Float64Array(W)
  for (let y = 0; y < H; y++)
    for (let x = x0; x < x1; x++) {
      const j = (y * W + x) * 4
      if (test(data[j]!, data[j + 1]!, data[j + 2]!)) {
        mask[y * W + x] = 1
        col[x]!++
      }
    }
  // 열: 칸 색이 화면 높이의 20% 이상인 열의 연속 범위 중 가장 넓은 것
  // (아이콘이 지나가는 열은 칸 색이 거의 없으므로 화면 폭 8% 이하의 틈은 이어 붙인다)
  const colRun = longestRun(col, x0, x1, H * 0.2, W * 0.08)
  if (!colRun || colRun[1] - colRun[0] < W * 0.05) return null
  const [cl, cr] = colRun
  // 행: 그 범위에서 칸 색 비율 20% 이상인 연속 행 덩어리
  const rowFrac = new Float64Array(H)
  for (let y = 0; y < H; y++) {
    let n = 0
    for (let x = cl; x < cr; x++) n += mask[y * W + x]!
    rowFrac[y] = n / (cr - cl)
  }
  const runs: [number, number][] = []
  let start = -1
  for (let y = 0; y <= H; y++) {
    const on = y < H && rowFrac[y]! >= 0.2
    if (on && start < 0) start = y
    if (!on && start >= 0) {
      if (y - start >= H * 0.04) runs.push([start, y])
      start = -1
    }
  }
  const six = pickSixPanels(runs)
  if (!six) return null
  // 6칸은 세로로 줄 맞춰 있으므로 좌우 끝은 6칸의 중앙값 (레이저 이펙트 등으로 한 칸만 길게 잡히는 것 방지)
  const edges = six.map(([top, bottom]) => panelEdges(img, side, top, bottom, cl, cr, x0, x1))
  const left = median(edges.map((e) => e[0]))
  const right = median(edges.map((e) => e[1]))
  return six.map(([top, bottom]) => ({ x: left, y: top, w: right - left, h: bottom - top }))
}

// 흰 테두리·사선 (내 칸의 양 끝)
const isLight = (r: number, g: number, b: number) => r > 170 && g > 160 && b > 200

/**
 * 칸 좌우 끝. 칸 높이 안에서 칸 색(+ 흰 테두리)이 20% 이상인 열을 칸으로 보고,
 * 열 범위 가운데에서 바깥으로 훑되 아이콘이 가린 구간(칸 높이의 0.8배까지)은 건너뛴다.
 */
function panelEdges(
  img: Rgba,
  side: RecogSide,
  top: number,
  bottom: number,
  cl: number,
  cr: number,
  x0: number,
  x1: number,
): [number, number] {
  const { data, width: W } = img
  const test = side === 'opp' ? isOppPanel : isMinePanel
  const h = bottom - top
  const on = (x: number) => {
    let n = 0
    for (let y = top; y < bottom; y++) {
      const j = (y * W + x) * 4
      const r = data[j]!
      const g = data[j + 1]!
      const b = data[j + 2]!
      if (test(r, g, b) || isLight(r, g, b)) n++
    }
    return n >= h * 0.2
  }
  const gap = Math.round(h * 0.8)
  const scan = (from: number, step: 1 | -1, lim: number) => {
    let edge = from
    let miss = 0
    for (let x = from; step > 0 ? x < lim : x >= lim; x += step) {
      if (on(x)) {
        edge = x
        miss = 0
      } else if (++miss > gap) break
    }
    return edge
  }
  const mid = Math.round((cl + cr) / 2)
  return [scan(mid, -1, x0), scan(mid, 1, x1) + 1]
}

function longestRun(
  arr: Float64Array,
  a: number,
  b: number,
  min: number,
  maxGap: number,
): [number, number] | null {
  const runs: [number, number][] = []
  let s = -1
  for (let i = a; i <= b; i++) {
    const on = i < b && arr[i]! >= min
    if (on && s < 0) s = i
    if (!on && s >= 0) {
      const last = runs[runs.length - 1]
      if (last && s - last[1] <= maxGap) last[1] = i
      else runs.push([s, i])
      s = -1
    }
  }
  let best: [number, number] | null = null
  for (const r of runs) if (!best || r[1] - r[0] > best[1] - best[0]) best = r
  return best
}

// 행 덩어리 중 높이·간격이 고른 연속 6개 (위아래의 이름 띠·"선택 완료" 띠를 빼기 위해)
function pickSixPanels(runs: [number, number][]): [number, number][] | null {
  if (runs.length < 6) return null
  let best: [number, number][] | null = null
  let bestCost = Infinity
  for (let i = 0; i + 6 <= runs.length; i++) {
    const g = runs.slice(i, i + 6)
    const hs = g.map(([a, b]) => b - a)
    const pitch = g.slice(1).map(([a], k) => a - g[k]![0])
    const spread = (v: number[]) => {
      const m = v.reduce((s, x) => s + x, 0) / v.length
      return Math.max(...v.map((x) => Math.abs(x - m))) / m
    }
    const cost = spread(hs) + spread(pitch)
    if (cost < bestCost) {
      bestCost = cost
      best = g
    }
  }
  return bestCost < 0.6 ? best : null
}

// ── ②③ 아이콘 비교 ─────────────────────────────────────────────

const CLAMP = 3 * 100 * 100 // 한 픽셀 차이 상한 (이펙트·글자에 가린 픽셀이 점수를 지배하지 않게)

/**
 * 아이콘 창(x0,y0,size)과 스프라이트를 바탕색 bg 위에 합성한 것의 평균 제곱 차.
 * clip 밖 픽셀은 세지 않는다 (내 쪽 아이콘은 칸보다 크게 그려지고 칸 밖이 잘린다).
 */
export function iconDiff(
  img: Rgba,
  tpl: Uint8ClampedArray | Uint8Array,
  size: number,
  x0: number,
  y0: number,
  bg: [number, number, number],
  clip: Rect,
): number {
  const { data, width: W, height: H } = img
  const xa = Math.max(0, x0, clip.x)
  const ya = Math.max(0, y0, clip.y)
  const xb = Math.min(W, x0 + size, clip.x + clip.w)
  const yb = Math.min(H, y0 + size, clip.y + clip.h)
  if (xb - xa < size * 0.5 || yb - ya < size * 0.5) return CLAMP
  let sum = 0
  for (let sy = ya; sy < yb; sy++) {
    const ty = sy - y0
    for (let sx = xa; sx < xb; sx++) {
      const i = (ty * size + (sx - x0)) * 4
      const a = tpl[i + 3]! / 255
      const j = (sy * W + sx) * 4
      const dr = a * tpl[i]! + (1 - a) * bg[0] - data[j]!
      const dg = a * tpl[i + 1]! + (1 - a) * bg[1] - data[j + 1]!
      const db = a * tpl[i + 2]! + (1 - a) * bg[2] - data[j + 2]!
      sum += Math.min(dr * dr + dg * dg + db * db, CLAMP)
    }
  }
  return sum / ((xb - xa) * (yb - ya))
}

/** 사각형 테두리 픽셀의 채널별 중앙값 = 칸 바탕색 */
export function borderColor(img: Rgba, r: Rect): [number, number, number] {
  const { data, width: W, height: H } = img
  const ch: number[][] = [[], [], []]
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const j = (y * W + x) * 4
    for (let c = 0; c < 3; c++) ch[c]!.push(data[j + c]!)
  }
  for (let k = 0; k < r.w; k++) {
    add(r.x + k, r.y)
    add(r.x + k, r.y + r.h - 1)
  }
  for (let k = 0; k < r.h; k++) {
    add(r.x, r.y + k)
    add(r.x + r.w - 1, r.y + k)
  }
  const med = (a: number[]) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1]! : 0)
  return [med(ch[0]!), med(ch[1]!), med(ch[2]!)]
}

const intersect = (a: Rect, b: Rect): Rect => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  }
}
/** 칸 안쪽 (테두리 선 제외) */
const inner = (p: Rect): Rect => {
  const k = Math.max(1, Math.round(p.h * 0.08))
  return { x: p.x + k, y: p.y + k, w: p.w - 2 * k, h: p.h - 2 * k }
}

/** 칸 + 배치 → 아이콘 창 (정수 좌표) */
export function iconRect(panel: Rect, side: RecogSide, g: IconGeometry, size: number): Rect {
  const cx = side === 'opp' ? panel.x + g.cx * panel.h : panel.x + panel.w - g.cx * panel.h
  const cy = panel.y + g.cy * panel.h
  return { x: Math.round(cx - size / 2), y: Math.round(cy - size / 2), w: size, h: size }
}

/** 배치 탐색 범위: 칸 높이 기준 크기 배율·중심 이동 (기본 배치 주변, 1단계 = 절반 해상도라 성기게) */
export function geometryCandidates(side: RecogSide): IconGeometry[] {
  const d = DEFAULT_GEOMETRY[side]
  const out: IconGeometry[] = []
  for (const ds of [-0.16, -0.08, 0, 0.08, 0.16])
    for (const dx of [-0.24, -0.12, 0, 0.12, 0.24])
      for (const dy of [-0.08, 0, 0.08])
        out.push({ size: d.size + ds, cx: d.cx + dx, cy: d.cy + dy })
  return out
}

/** 1단계에서 고른 배치 주변 (2단계 = 원래 해상도) */
function geometryNeighbors(g: IconGeometry): IconGeometry[] {
  const out: IconGeometry[] = []
  for (const ds of [-0.04, 0, 0.04])
    for (const dx of [-0.06, 0, 0.06])
      for (const dy of [-0.04, 0, 0.04])
        out.push({ size: g.size + ds, cx: g.cx + dx, cy: g.cy + dy })
  return out
}

/** 가로세로 절반으로 줄인 이미지 (2×2 평균) */
export function halve(img: Rgba): Rgba {
  const W = img.width >> 1
  const H = img.height >> 1
  const out = new Uint8ClampedArray(W * H * 4)
  const s = img.data
  const SW = img.width
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = (2 * y * SW + 2 * x) * 4
      const b = a + SW * 4
      const o = (y * W + x) * 4
      for (let c = 0; c < 4; c++)
        out[o + c] = (s[a + c]! + s[a + 4 + c]! + s[b + c]! + s[b + 4 + c]!) >> 2
    }
  return { data: out, width: W, height: H }
}

/** 칸 높이 → 이 배치의 아이콘 한 변 (픽셀) */
export const iconSize = (panels: Rect[], g: IconGeometry) =>
  Math.max(8, Math.round(median(panels.map((p) => p.h)) * g.size))

function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b)
  return s[s.length >> 1]!
}

/**
 * 6칸 아이콘 매칭.
 * templatesAt(size) = 후보 스프라이트를 size×size 로 줄인 목록 (호출 쪽이 크기별로 캐시, 크기와 상관없이 같은 순서).
 * 1단계 (절반 해상도): 배치 후보마다 칸별 최소 차이의 합 → 가장 작은 배치, 그 배치에서 칸마다 후보를 shortlist 개로 좁힘.
 * 2단계 (원래 해상도): 그 배치 주변에서 좁힌 후보만으로 배치를 다시 고르고, ±1px 로 순위.
 */
export function matchIcons(
  img: Rgba,
  panels: Rect[],
  side: RecogSide,
  templatesAt: (size: number) => IconTemplate[],
  top = 5,
  shortlist = 24,
): SlotMatch[] {
  // 칸 p(원래 좌표), 배치 g, 축척 scale → 비교할 창·잘라낼 범위·바탕색
  const windowOf = (im: Rgba, p: Rect, g: IconGeometry, scale: number) => {
    const size = Math.max(4, Math.round(iconSize(panels, g) / scale))
    const q = { x: p.x / scale, y: p.y / scale, w: p.w / scale, h: p.h / scale }
    const r = iconRect(q, side, g, size)
    const clip = inner({
      x: Math.round(q.x),
      y: Math.round(q.y),
      w: Math.round(q.w),
      h: Math.round(q.h),
    })
    const vis = intersect(r, clip)
    return { size, r, clip, bg: borderColor(im, vis.w > 2 && vis.h > 2 ? vis : r) }
  }
  // 칸 하나의 후보별 차이 (idx = 비교할 후보 번호, 없으면 전부)
  const scores = (
    im: Rgba,
    p: Rect,
    g: IconGeometry,
    scale: number,
    idx?: number[],
    jitter = 0,
  ) => {
    const w = windowOf(im, p, g, scale)
    const tpls = templatesAt(w.size)
    return (idx ?? tpls.map((_, k) => k)).map((k) => {
      let m = Infinity
      for (let dy = -jitter; dy <= jitter; dy++)
        for (let dx = -jitter; dx <= jitter; dx++)
          m = Math.min(m, iconDiff(im, tpls[k]!.data, w.size, w.r.x + dx, w.r.y + dy, w.bg, w.clip))
      return { k, m }
    })
  }
  const small = halve(img)
  let coarseBest: IconGeometry | null = null
  let coarseSum = Infinity
  for (const g of geometryCandidates(side)) {
    let sum = 0
    for (const p of panels) {
      sum += Math.min(...scores(small, p, g, 2).map((s) => s.m))
      if (sum >= coarseSum) break
    }
    if (sum < coarseSum) {
      coarseSum = sum
      coarseBest = g
    }
  }
  const lists = panels.map((p) =>
    scores(small, p, coarseBest!, 2)
      .sort((a, b) => a.m - b.m)
      .slice(0, shortlist)
      .map((s) => s.k),
  )
  let g = coarseBest!
  let bestSum = Infinity
  for (const n of geometryNeighbors(coarseBest!)) {
    let sum = 0
    for (let i = 0; i < panels.length && sum < bestSum; i++)
      sum += Math.min(...scores(img, panels[i]!, n, 1, lists[i]).map((s) => s.m))
    if (sum < bestSum) {
      bestSum = sum
      g = n
    }
  }
  return panels.map((p, i) => {
    const w = windowOf(img, p, g, 1)
    const tpls = templatesAt(w.size)
    const candidates = scores(img, p, g, 1, lists[i], 1)
      .sort((a, b) => a.m - b.m)
      .slice(0, top)
      .map((s) => ({ id: tpls[s.k]!.id, score: Math.round(Math.sqrt(s.m)) }))
    return { panel: p, icon: w.r, candidates }
  })
}

/**
 * 인식 결과를 믿을 만한지: 1순위가 2순위보다 충분히 낫다 (실제 스크린샷에서 맞힌 경우 2순위/1순위 ≈ 1.4~2.5).
 */
export const isConfident = (c: IconCandidate[]) => c.length < 2 || c[1]!.score >= c[0]!.score * 1.25

// ── OCR 글자 → 이름 맞추기 ─────────────────────────────────────────────

/** 비교용으로 공백·기호를 뺀 소문자 */
export const normalizeName = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·・.,:;'"`’()[\]{}\-_/\\|!?~<>«»「」『』]/g, '')

/** 편집 거리 (한글은 음절 단위) */
export function editDistance(a: string, b: string): number {
  const A = [...a]
  const B = [...b]
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j)
  for (let i = 1; i <= A.length; i++) {
    const cur = [i]
    for (let j = 1; j <= B.length; j++)
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (A[i - 1] === B[j - 1] ? 0 : 1),
      )
    prev = cur
  }
  return prev[B.length]!
}

/** 비교용 이름: 폼 표시 "(알로라의 모습)" 같은 괄호를 뺀 것 (게임 선출 화면은 종 이름만 보여 준다) */
export const baseName = (s: string) => s.replace(/[(（][^)）]*[)）]/g, '').trim()

/** OCR 한 줄 정리: 큰 공백 뒤(성별 기호 등 잡음)를 버리고 앞뒤 기호 제거 */
export const cleanOcrLine = (s: string) =>
  (s.split(/\s{2,}/)[0] ?? '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim()

/** 글자와 이름의 틀린 비율 (0 = 같음) */
export const nameRate = (text: string, name: string) => {
  const q = normalizeName(text)
  const n = normalizeName(baseName(name))
  if (!q || !n) return 1
  return editDistance(q, n) / Math.max(q.length, n.length)
}

/**
 * 아이콘 후보 + OCR 로 읽은 이름 → 종 id.
 * 아이콘 후보(이미 모양이 비슷한 것만) 중 이름이 1순위보다 2글자 이상 덜 틀린 것이 있으면 그것
 * (로토무 폼처럼 아이콘이 잘려 비슷한 경우. OCR 이 흐려도 후보끼리 비교라 틀린 비율 70% 까지 허용),
 * 아이콘 후보에 없어도 전체 이름 중 거의 같은 것(틀린 비율 20% 이하)이 있으면 그것. 아니면 아이콘 1순위.
 */
export function pickWithOcr(
  candidates: IconCandidate[],
  text: string,
  nameOf: (id: string) => string,
  allIds: string[],
): string {
  const top = candidates[0]?.id ?? ''
  const q = normalizeName(cleanOcrLine(text))
  if (!q) return top
  // 후보끼리는 틀린 글자 수로 비교 (비율은 긴 이름이 유리해서 '로로' → 로토무 2 / 프로스트로토무 5 가 비슷해짐)
  const rated = candidates.map((c) => {
    const n = normalizeName(baseName(nameOf(c.id)))
    const d = editDistance(q, n)
    return { id: c.id, d, r: d / Math.max(q.length, n.length, 1) }
  })
  const first = rated[0]
  let best = first
  for (const x of rated) if (x.d < best!.d) best = x
  if (first && best && best.d <= first.d - 2 && best.r <= 0.7) return best.id
  if (!first || first.r <= 0.2) return top
  let all: { id: string; r: number } | null = null
  for (const id of allIds) {
    const r = nameRate(q, nameOf(id))
    if (!all || r < all.r) all = { id, r }
  }
  return all && all.r <= 0.2 ? all.id : top
}

/**
 * OCR 로 읽은 도구 이름 → 가장 가까운 도구 id 들 (틀린 비율 50% 이하일 때만, 없으면 빈 배열).
 * 동점이면 전부 (리자몽나이트 X/Y 처럼 끝 글자를 못 읽은 경우 하나로 단정하지 않음)
 */
export function pickItem(text: string, items: [string, string][]): string[] {
  const q = cleanOcrLine(text)
  if (!q) return []
  let best: string[] = []
  let bestRate = Infinity
  for (const [id, nm] of items) {
    const r = nameRate(q, nm)
    if (r < bestRate - 1e-9) {
      bestRate = r
      best = [id]
    } else if (Math.abs(r - bestRate) < 1e-9) best.push(id)
  }
  return bestRate <= 0.5 ? best : []
}

// ── OCR 전처리 · 칸 안의 글자 위치 ─────────────────────────────────────────────

/** 내 칸에서 이름 줄 / 도구 줄 (칸 기준 비율, 아이콘 앞까지) */
export function textLines(p: Rect): { name: Rect; item: Rect } {
  const right = p.x + p.w - p.h * 1.3
  const line = (y0: number, y1: number, x0: number): Rect => {
    const x = p.x + p.w * x0
    return { x, y: p.y + p.h * y0, w: Math.max(1, right - x), h: p.h * (y1 - y0) }
  }
  return { name: line(0.06, 0.52, 0.105), item: line(0.5, 0.96, 0.195) }
}

/**
 * OCR 입력: 회색조로 바꾸고 글자가 밝으면(보라 칸의 흰 글자) 반전해서 "밝은 바탕 + 어두운 글자"로.
 * 글자 밝기는 Otsu 문턱으로 나눈 두 무리 중 적은 쪽 = 글자로 판단. 이진화는 하지 않는다 (Tesseract 가 직접 하는 쪽이 더 잘 읽음).
 */
export function ocrPrep(img: Rgba): Uint8ClampedArray {
  const n = img.width * img.height
  const L = new Uint8Array(n)
  const hist = new Array<number>(256).fill(0)
  for (let k = 0; k < n; k++) {
    const v = Math.round(
      0.299 * img.data[k * 4]! + 0.587 * img.data[k * 4 + 1]! + 0.114 * img.data[k * 4 + 2]!,
    )
    L[k] = v
    hist[v]!++
  }
  const th = otsu(hist, n)
  let bright = 0
  for (let k = 0; k < n; k++) if (L[k]! > th) bright++
  const invert = bright < n / 2
  const out = new Uint8ClampedArray(n * 4)
  for (let k = 0; k < n; k++) {
    const v = invert ? 255 - L[k]! : L[k]!
    out[k * 4] = out[k * 4 + 1] = out[k * 4 + 2] = v
    out[k * 4 + 3] = 255
  }
  return out
}

function otsu(hist: number[], n: number) {
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]!
  let sB = 0
  let wB = 0
  let best = 0
  let th = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!
    if (!wB) continue
    const wF = n - wB
    if (!wF) break
    sB += t * hist[t]!
    const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2
    if (v > best) {
      best = v
      th = t
    }
  }
  return th
}

// ── 성별 기호 (상대 칸) ─────────────────────────────────────────────

/**
 * 상대 칸의 성별 기호: 타입 아이콘 아래(칸 높이 기준 x 1.87, y 0.76 근처)의 파랑 ♂ / 빨강 ♀ 픽셀 수.
 * 성별 없는 포켓몬은 기호가 없다 → ''.
 */
export function genderMark(img: Rgba, p: Rect): '' | 'M' | 'F' {
  const { data, width: W, height: H } = img
  const cx = p.x + p.h * 1.87
  const cy = p.y + p.h * 0.76
  const r = p.h * 0.2
  let blue = 0
  let red = 0
  for (let y = Math.max(0, Math.round(cy - r)); y < Math.min(H, Math.round(cy + r)); y++)
    for (let x = Math.max(0, Math.round(cx - r)); x < Math.min(W, Math.round(cx + r)); x++) {
      const j = (y * W + x) * 4
      const R = data[j]!
      const G = data[j + 1]!
      const B = data[j + 2]!
      if (B > 170 && R < 110 && G < 160 && B - R > 90) blue++
      else if (R > 190 && G < 90 && B < 110) red++
    }
  const min = r * r * 0.15
  if (blue >= min && blue > red * 2) return 'M'
  if (red >= min && red > blue * 2) return 'F'
  return ''
}
