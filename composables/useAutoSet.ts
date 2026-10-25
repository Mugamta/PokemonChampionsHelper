// composables/useAutoSet.ts
// 상대 포켓몬 자동 배치 (선출 화면). 현재 레귤레이션의 사용률 통계(public/data/usage/)가 있으면 그것을 우선,
// 없으면 utils/autoSet.ts 의 규칙. 여기서는 게임 데이터로 입력을 만들고 슬롯에 넣는다.
// kind: 싱글 / 더블 통계 (선출 화면은 배틀 모드, 생략하면 사용자가 고른 종류 — useUsageKind)

import { toValue, type MaybeRefOrGetter } from 'vue'
import { useUsageKind } from '~/composables/useUsageKind'
import { autoSet, exclusiveMoves, usageSet, type UsageKind } from '~/utils/autoSet'
import { emptySlot, type Move, type TeamSlot } from '~/utils/types'

export function useAutoSet(kind?: MaybeRefOrGetter<UsageKind | undefined>) {
  const pref = useUsageKind()
  const usageKind = computed(() => toValue(kind) ?? pref.value)
  const gd = useGameData()
  const calc = useTeamCalc()
  const reg = useRegulation()
  // 전용기 (종 → 그 종만 배우는 기술). 데이터가 바뀔 때만 다시 계산
  const exclusive = computed(() =>
    gd.data.value ? exclusiveMoves(gd.data.value.pokemon) : new Map<string, Set<string>>(),
  )

  // 현재 레귤레이션의 사용률 통계 표 (아직 받는 중이면 undefined → 받으면 다시 계산)
  const table = computed(() => gd.usageTable(usageKind.value, reg.active.value?.id))
  // 표를 다 받을 때까지 기다림 (통계가 없으면 바로). 자동 배치 전에 — 받기 전에 배치하면 규칙 배치가 들어감
  const ready = () => gd.loadUsage(usageKind.value, reg.active.value?.id).then(() => undefined)
  // 통계 출처·시점 (Smogon 월별 통계, Pokémon Showdown 챔피언스 싱글/더블 포맷). 통계가 없으면 null
  const source = computed(() => {
    const t = reg.active.value ? gd.usageMeta(usageKind.value)[reg.active.value.id] : undefined
    return t
      ? {
          kind: usageKind.value,
          format: t.format,
          month: t.month,
          battles: t.battles,
          url: `https://www.smogon.com/stats/${t.month}/`,
        }
      : null
  })
  // 통계 정보 (원종·메가 폼 중 많이 쓴 쪽). 통계가 없으면 null
  const usageInfo = (speciesId: string) => {
    const base = gd.pokemon(speciesId)
    const t = table.value
    if (!base || !t) return null
    const counts = [base.id, ...(base.megas ?? [])].map((id) => t.pokemon[id]?.count ?? 0)
    const count = Math.max(...counts)
    return count ? { count, month: t.month } : null
  }

  // 포켓몬 하나의 자동 배치 결과 (데이터가 없으면 null). taken: 같은 파티의 다른 포켓몬 도구
  // usageOnly: 통계가 없으면 null (규칙 배치를 쓰지 않음)
  const build = (speciesId: string, taken: readonly string[] = [], usageOnly = false) => {
    const base = gd.pokemon(speciesId)
    const data = gd.data.value
    if (!base || !data) return null
    // 규칙 배치: 메가진화가 있으면 메가스톤 (여러 개면 첫 번째)
    const megaId = base.megas?.find((id) => gd.pokemon(id)?.mega?.item)
    const item = (megaId && gd.pokemon(megaId)?.mega?.item) || ''
    const r = calc.resolve({ ...emptySlot(), species: speciesId, item }, true)
    if (!r) return null
    const moves = gd
      .learnset(speciesId)
      .map((id) => gd.move(id))
      .filter((m): m is Move => !!m)
    const rules = autoSet({
      base,
      form: r.species,
      atkForm: calc.attackForm(r).species,
      item,
      moves,
      natures: data.natures,
      exclusive: exclusive.value.get(base.base || base.id),
    })
    // 사용률 통계가 있으면 우선
    const fromUsage = usageSet(base, table.value, data.pokemon, rules, taken)
    if (usageOnly) return fromUsage
    return fromUsage ?? { ...rules, source: 'rules' }
  }

  // 슬롯에 적용 (포켓몬은 그대로, 특성·도구·성격·능력 포인트·기술을 덮어씀)
  const apply = (slot: TeamSlot, taken: readonly string[] = [], usageOnly = false) => {
    const s = slot.species ? build(slot.species, taken, usageOnly) : null
    if (!s) return
    slot.ability = s.ability
    slot.item = s.item
    slot.nature = s.nature
    slot.sp = { ...s.sp }
    slot.moves = [...s.moves]
  }

  return { build, apply, ready, usageInfo, source }
}
