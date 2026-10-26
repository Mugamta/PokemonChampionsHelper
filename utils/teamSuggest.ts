// utils/teamSuggest.ts — 사용률 통계로 파티 채우기 (파티 화면 빈 슬롯)
// Smogon 통계에는 완성된 파티(6마리 조합) 통계가 없어서, 포켓몬마다 "같은 파티에 함께 쓴 비율"(UsageSet.teammates)로
// 한 마리씩 고른다 (실제로 누가 쓴 파티가 아니라 함께 쓴 빈도로 만든 조합).
//   점수 = 지금 파티 멤버들과 함께 쓴 비율의 평균 ÷ 후보 팀 채용률^SUGGEST_USAGE_POWER
//   (비율만 쓰면 무엇을 넣어도 상위 메타 포켓몬만 붙고, 채용률로 다 나누면 표본이 적은 포켓몬이 튀어서 그 중간)
//   점수가 같으면 (함께 쓴 기록이 없으면 0) 채용률 높은 순. 파티에 통계가 있는 포켓몬이 없으면 채용률 1위부터
//   같은 종(전국도감 번호가 같은 폼·메가 폼)은 한 마리만

import type { UsageTable } from './autoSet'
import type { Pokemon } from './types'

export const SUGGEST_USAGE_POWER = 0.5

export interface SuggestInput {
  table: UsageTable
  pokemon: Record<string, Pokemon>
  members: readonly string[] // 이미 파티에 있는 포켓몬 (폼 id — 메가진화하면 메가 폼). 통계에 없어도 같은 종 제외에 씀
  allowed: (species: string) => boolean // 슬롯에 넣을 id(메가 폼은 원종)로 출전 가능 여부
  count: number // 더 고를 수
}

// 슬롯에 넣는 id (메가 폼 → 원종)
export const slotSpecies = (pokemon: Record<string, Pokemon>, form: string) =>
  pokemon[form]?.mega?.from ?? form

// 고른 폼 id (고른 순서). 후보가 모자라면 count 보다 적을 수 있다
export function suggestTeam(input: SuggestInput): string[] {
  const { table, pokemon, allowed } = input
  const team = [...input.members]
  const nums = new Set(team.map((id) => pokemon[id]?.num))
  const usage = (id: string) => table.pokemon[id]?.usage ?? 0
  const picked: string[] = []
  while (picked.length < input.count) {
    const scored = team.filter((id) => table.pokemon[id])
    let best: string | undefined
    let bestScore = -1
    for (const [id, u] of Object.entries(table.pokemon)) {
      const p = pokemon[id]
      if (!p || nums.has(p.num) || !allowed(slotSpecies(pokemon, id))) continue
      const share = scored.length
        ? scored.reduce((a, m) => a + (table.pokemon[m]!.teammates?.[id] ?? 0), 0) / scored.length
        : 0
      const score = share / Math.pow(Math.max(u.usage ?? 0, 1e-4), SUGGEST_USAGE_POWER)
      if (score > bestScore || (score === bestScore && best && usage(id) > usage(best))) {
        best = id
        bestScore = score
      }
    }
    if (!best) break
    picked.push(best)
    team.push(best)
    nums.add(pokemon[best]!.num)
  }
  return picked
}
