// composables/useTopTeams.ts
// 상위 유저 파티 (public/data/teams/) — 상위 파티 화면을 열 때 목록(index)을, 고른 종류·레귤레이션마다 파티 파일을 받는다.
// 형식·고르기: utils/topTeams.ts. 파티 → 내 파티 슬롯은 toSlots (드러나지 않은 부분은 사용률 통계 배치)

import { toValue, type MaybeRefOrGetter } from 'vue'
import { useAutoSet } from '~/composables/useAutoSet'
import type { UsageKind } from '~/utils/autoSet'
import { withRevealed, type TopTeam, type TopTeamsFile, type TopTeamsIndex } from '~/utils/topTeams'

const loading = new Map<string, Promise<unknown>>()

export function useTopTeams(kind: MaybeRefOrGetter<UsageKind>) {
  // 파일 이름 → 내용 (null = 받기 실패 / 파일 없음)
  const files = useState<Record<string, unknown>>('top-teams', () => ({}))
  const { asset } = usePublicAsset()
  const buildId = useRuntimeConfig().public.buildId as string | undefined
  const gd = useGameData()
  const auto = useAutoSet(kind)

  // 반응형 조회: 아직 없으면 받기 시작하고 undefined (받으면 다시 계산됨), 실패면 null
  const get = <T>(file: string): T | null | undefined => {
    if (file in files.value) return files.value[file] as T | null
    if (!loading.has(file)) {
      const p = fetch(asset(`data/teams/${file}`) + (buildId ? `?v=${buildId}` : ''))
        .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
        .then((v) => (v ? markRaw(v as object) : null))
        .catch(() => null)
        .then((v) => {
          files.value = { ...files.value, [file]: v }
          loading.delete(file)
        })
      loading.set(file, p)
    }
    return undefined
  }

  // 파티 → 내 파티 6칸. 메가진화한 포켓몬은 메가 폼 기준 통계 배치, 드러난 도구·특성·기술·성별을 덮어씀
  const toSlots = async (team: TopTeam) => {
    await auto.ready()
    const slots = auto.slotsFor(team.mons.map((m) => m.mega ?? m.id))
    return slots.map((slot, i) =>
      withRevealed(slot, team.mons[i]!, gd.pokemon(slot.species)?.abilities ?? []),
    )
  }

  return {
    index: () => get<TopTeamsIndex>('index.json'),
    file: (reg: string | undefined) =>
      reg ? get<TopTeamsFile>(`${toValue(kind)}-${reg}.json`) : undefined,
    toSlots,
  }
}
