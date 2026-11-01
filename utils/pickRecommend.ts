// utils/pickRecommend.ts — 선출 · 선두 추천 (순수 계산)
// 내 포켓몬 i × 상대 포켓몬 j 의 1:1 맞대결 값 value[i][j] (−1 ~ 1, utils/recommend duelValue) 와
// 상대 포켓몬이 나올 정도(oppWeight, 사용률 통계)로 선출 조합마다 점수를 매긴다.
//   조합 점수 = Σ_j 상대 비중 × (MAX_SHARE × 조합 안 최선의 맞대결 + (1 − MAX_SHARE) × 조합 평균)
//     → 상대마다 받아 낼 포켓몬이 하나는 있는가 + 조합 전체가 고르게 버티는가
//   선두 점수 = Σ_j 상대 비중 × 선두 중 최선의 맞대결 (더블은 선두 2마리)

export const MAX_SHARE = 0.6

export interface PickPlan {
  picks: number[] // 선출 순서 (앞에서부터 선두) — value 의 행 번호
  leads: number[]
  score: number // 조합 점수 (상대 비중 합으로 나눈 값, −1 ~ 1)
  leadScore: number
  // 상대 포켓몬마다 조합 안에서 가장 잘 받는 내 포켓몬과 그 값 (oppWeight 가 0 이면 -1)
  answers: { by: number; value: number }[]
}

// n 개 중 k 개 조합
export function combinations(n: number, k: number): number[][] {
  const out: number[][] = []
  const cur: number[] = []
  const go = (start: number) => {
    if (cur.length === k) {
      out.push([...cur])
      return
    }
    for (let i = start; i < n; i++) {
      cur.push(i)
      go(i + 1)
      cur.pop()
    }
  }
  if (k <= n) go(0)
  return out
}

// 점수 높은 순 상위 top 개. pick = 선출 수, lead = 선두 수
export function recommendPicks(
  value: number[][],
  oppWeight: number[],
  pick: number,
  lead: number,
  top = 3,
): PickPlan[] {
  const n = value.length
  const k = Math.min(pick, n)
  const total = oppWeight.reduce((a, v) => a + Math.max(0, v), 0) || 1
  const weighted = (fn: (j: number) => number) =>
    oppWeight.reduce((a, w, j) => a + (w > 0 ? w * fn(j) : 0), 0) / total
  const plans = combinations(n, k).map((set): PickPlan => {
    const score = weighted((j) => {
      const vs = set.map((i) => value[i]![j]!)
      const best = Math.max(...vs)
      const mean = vs.reduce((a, v) => a + v, 0) / vs.length
      return MAX_SHARE * best + (1 - MAX_SHARE) * mean
    })
    // 선두: 조합 안에서 lead 마리
    let leads: number[] = []
    let leadScore = -Infinity
    for (const ls of combinations(set.length, Math.min(lead, set.length))) {
      const L = ls.map((x) => set[x]!)
      const s = weighted((j) => Math.max(...L.map((i) => value[i]![j]!)))
      if (s > leadScore) {
        leadScore = s
        leads = L
      }
    }
    const answers = oppWeight.map((w, j) => {
      if (w <= 0) return { by: -1, value: 0 }
      let by = set[0]!
      for (const i of set) if (value[i]![j]! > value[by]![j]!) by = i
      return { by, value: value[by]![j]! }
    })
    return {
      picks: [...leads, ...set.filter((i) => !leads.includes(i))],
      leads,
      score,
      leadScore,
      answers,
    }
  })
  return plans.sort((a, b) => b.score - a.score || b.leadScore - a.leadScore).slice(0, top)
}
