// composables/usePerfList.ts
// 포켓몬 성능표(pages/stats.vue)에 올릴 포켓몬: 현재 레귤레이션 출전 가능 포켓몬 + 그 메가진화.
// 배틀 폼(돌핀맨 마이티폼 / 킬가르도 블레이드폼)은 따로 줄을 만들지 않고 원종 줄에서 계산 폼으로만 쓴다.
// 게임 데이터는 바뀌지 않으므로 반응형 프록시를 벗긴(toRaw) 객체를 넘긴다 — 수백 마리 × 기술 계산에서
// 속성 하나하나가 의존성으로 추적되면 몇 배 느려진다.

import { useTeamCalc } from '~/composables/useTeamCalc'
import { emptySlot, type Pokemon, type TeamSlot } from '~/utils/types'

export interface PerfMon {
  id: string // 표에 올린 id (원종 또는 메가 폼)
  num: number
  form: Pokemon // 내구·스피드 계산 폼 (돌핀맨 → 마이티폼)
  atkForm: Pokemon // 결정력 계산 폼 (킬가르도 → 블레이드폼)
  learnset: string[]
  isNew: boolean // 직전 레귤레이션에 없던 포켓몬 (메가는 원종 기준) 또는 새로 추가된 메가스톤의 메가
}

export function usePerfList() {
  const gd = useGameData()
  const reg = useRegulation()
  const calc = useTeamCalc()
  const { locale } = useI18n()

  // 직전 레귤레이션에 없던 원종
  const newIds = computed(() => {
    const a = reg.active.value
    const list = reg.list.value
    const prev = a ? list[list.findIndex((r) => r.id === a.id) - 1] : null
    if (!a || !prev) return new Set<string>()
    const old = new Set(prev.pokemon)
    return new Set(a.pokemon.filter((id) => !old.has(id)))
  })

  // 파티 계산과 같은 규칙으로 폼 결정 (메가는 원종 + 메가스톤 슬롯으로)
  const formsOf = (p: Pokemon) => {
    const slot: TeamSlot = {
      ...emptySlot(),
      species: p.mega?.from ?? p.id,
      item: p.mega?.item ?? '',
      ability: p.abilities[0] ?? '',
    }
    const r = calc.resolve(slot, true)
    return {
      form: toRaw(r?.species ?? p),
      atkForm: toRaw(r ? calc.attackForm(r).species : p),
    }
  }

  const mons = computed<PerfMon[]>(() => {
    const d = gd.data.value
    if (!d) return []
    return Object.values(d.pokemon)
      .filter((p) => !p.battleForm?.from && reg.isAllowed(p.id))
      .map((p) => ({
        id: p.id,
        num: p.num,
        ...formsOf(p),
        learnset: toRaw(gd.learnset(p.id)),
        isNew:
          newIds.value.has(p.mega?.from ?? p.id) ||
          (!!p.mega && !!reg.active.value?.newMegaStones?.includes(p.mega.item)),
      }))
      .sort((a, b) => a.num - b.num || (a.form.mega ? 1 : 0) - (b.form.mega ? 1 : 0))
  })

  // 검색: 현재 언어 이름 또는 id (공백·대소문자 무시)
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.()]/g, '')
  const matcher = (query: string) => {
    const q = norm(query)
    if (!q) return null
    void locale.value
    return (id: string) => norm(gd.name('pokemon', id)).includes(q) || id.includes(q)
  }

  return { mons, matcher }
}
