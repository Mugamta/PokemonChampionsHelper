// composables/useUsageStats.ts
// 시즌별·월별 사용률 정리 (통계 화면 전용) — public/data/stats/ 를 필요할 때 받아 앱 전역에서 공유한다.
// 목록(index)과 추이(trend-{kind})는 통계 화면을 열 때, 순위표는 고른 기간마다 받는다. 형식: utils/usageStats.ts

import type { UsageKind } from '~/utils/autoSet'
import {
  statsFile,
  type StatsIndex,
  type StatsMeta,
  type StatsTable,
  type StatsTrend,
} from '~/utils/usageStats'

// 받는 중인 파일 (같은 파일을 두 번 받지 않게)
const loading = new Map<string, Promise<unknown>>()

export function useUsageStats() {
  // 파일 이름 → 내용 (null = 받기 실패 / 파일 없음)
  const files = useState<Record<string, unknown>>('usage-stats', () => ({}))
  const { asset } = usePublicAsset()
  const buildId = useRuntimeConfig().public.buildId as string | undefined

  const fetchFile = <T>(file: string): Promise<T | null> => {
    if (file in files.value) return Promise.resolve(files.value[file] as T | null)
    let p = loading.get(file) as Promise<T | null> | undefined
    if (!p) {
      p = fetch(asset(`data/${file}`) + (buildId ? `?v=${buildId}` : ''))
        .then((res) => (res.ok ? (res.json() as Promise<T>) : null))
        .then((v) => (v ? markRaw(v as object) : null) as T | null)
        .catch(() => null)
        .then((v) => {
          files.value = { ...files.value, [file]: v }
          loading.delete(file)
          return v
        })
      loading.set(file, p)
    }
    return p
  }
  // 반응형 조회: 아직 없으면 받기 시작하고 undefined (받으면 다시 계산됨), 실패면 null
  const get = <T>(file: string): T | null | undefined => {
    if (!(file in files.value)) {
      void fetchFile<T>(file)
      return undefined
    }
    return files.value[file] as T | null
  }

  return {
    index: () => get<StatsIndex>('stats/index.json'),
    trend: (kind: UsageKind) => get<StatsTrend>(`stats/trend-${kind}.json`),
    table: (kind: UsageKind, meta: StatsMeta | undefined) =>
      meta ? get<StatsTable>(statsFile(kind, meta)) : undefined,
  }
}
