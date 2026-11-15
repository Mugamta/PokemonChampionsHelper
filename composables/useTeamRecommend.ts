// composables/useTeamRecommend.ts
// 추천 파티 만들기 다이얼로그(components/team/Recommend*.vue) 공용 상태 + 자료. 고르는 규칙은 utils/teamRecommend.ts
// 자료 = 최신 통계: 사용률 표(useAutoSet().table, 파티 화면 싱글/더블 토글) + 같은 달 대면(stats/*-vs.json)
// 설정은 localStorage 'pch-team-rec-v1' 에 저장, 모드·첫 포켓몬·뺀 포켓몬·직접 고른 포켓몬은 다이얼로그를 다시 열어도 유지

import { useAutoSet } from '~/composables/useAutoSet'
import { useUsageStats } from '~/composables/useUsageStats'
import { normalizeRecSettings, type RecBase, type RecSettings } from '~/utils/teamRecommend'
import { slotSpecies } from '~/utils/teamSuggest'

const SETTINGS_KEY = 'pch-team-rec-v1'

export type RecMode = 'auto' | 'manual'

export function useTeamRecommend() {
  const gd = useGameData()
  const reg = useRegulation()
  const auto = useAutoSet()
  const stats = useUsageStats()

  // ── 설정 ─────────────
  const settings = useState<RecSettings>('team-rec-settings', () => {
    try {
      return normalizeRecSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'))
    } catch {
      return normalizeRecSettings(null)
    }
  })
  const setSetting = (k: keyof RecSettings, v: unknown) => {
    settings.value = normalizeRecSettings({ ...settings.value, [k]: v })
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
    } catch {
      // 저장할 수 없는 환경 — 이번 화면에서만 유지
    }
  }
  const resetSettings = () => {
    settings.value = normalizeRecSettings(null)
    try {
      localStorage.removeItem(SETTINGS_KEY)
    } catch {
      // 무시
    }
  }

  // ── 상태 ─────────────
  const mode = useState<RecMode>('team-rec-mode', () => 'auto')
  const lead = useState('team-rec-lead', () => '') // 자동: 첫 포켓몬 (폼 id)
  const excluded = useState<string[]>('team-rec-excluded', () => []) // 자동: 뺀 포켓몬
  const members = useState<string[]>('team-rec-members', () => []) // 직접: 고른 포켓몬 (폼 id)

  // ── 자료 ─────────────
  const table = auto.table
  const source = auto.source
  // 고를 수 있는 포켓몬: 통계 표에 있는 폼 (메가 폼 포함) 중 출전 가능한 것
  const ids = computed(() => {
    const tb = table.value
    const data = gd.data.value
    if (!tb || !data) return []
    return Object.keys(tb.pokemon).filter(
      (id) => data.pokemon[id] && reg.isAllowed(slotSpecies(data.pokemon, id)),
    )
  })
  // 사용률 표와 같은 달의 대면 자료 (undefined = 받는 중, null = 없음). 기간 정보는 통계 목록(stats/index.json)에서
  const vs = computed(() => {
    const tb = table.value
    const kind = source.value?.kind
    const r = reg.active.value?.id
    if (!tb || !r || !kind) return null
    const index = stats.index()
    if (index === undefined) return undefined
    const meta = index?.[kind]?.find((m) => m.reg === r && m.period === tb.month)
    return meta ? stats.vs(kind, meta) : null
  })
  // 계산 입력 (자료가 다 오기 전이면 null)
  const base = computed((): RecBase | null => {
    const tb = table.value
    const data = gd.data.value
    if (!tb || !data || vs.value === undefined) return null
    return {
      table: tb,
      vs: vs.value,
      pokemon: data.pokemon,
      allowed: reg.isAllowed,
      settings: settings.value,
    }
  })

  // 같은 종(전국도감 번호)이 이미 있는지
  const sameSpecies = (team: readonly string[], id: string) => {
    const num = gd.pokemon(id)?.num
    return team.some((m) => gd.pokemon(m)?.num === num)
  }

  return {
    settings,
    setSetting,
    resetSettings,
    mode,
    lead,
    excluded,
    members,
    table,
    source,
    ids,
    vs,
    base,
    sameSpecies,
  }
}
