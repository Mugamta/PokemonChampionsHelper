// composables/useViewPrefs.ts
// 선출·배틀 화면에서 기본으로 접어 두는 정보의 "자세히 보기" 설정. localStorage 'pch_view' 에 저장.
//  damageDetail: 데미지 칸에 데미지 수치·실전 KO·상성 배율 등까지 (끄면 % 와 확정/난수 N타만)
//  scenarioSplit: 배틀 예상 데미지를 상대 배분 4가지로 나눠서 (끄면 범위 하나로 합침)

export interface ViewPrefs {
  damageDetail: boolean
  scenarioSplit: boolean
}

const KEY = 'pch_view'
const DEFAULTS: ViewPrefs = { damageDetail: false, scenarioSplit: false }
let hydrated = false

export function useViewPrefs() {
  const prefs = useState<ViewPrefs>('view-prefs', () => ({ ...DEFAULTS }))
  if (import.meta.client && !hydrated) {
    hydrated = true
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (saved && typeof saved === 'object') prefs.value = { ...DEFAULTS, ...saved }
    } catch {
      // 저장분이 깨졌으면 기본값
    }
    watch(
      prefs,
      (v) => {
        try {
          localStorage.setItem(KEY, JSON.stringify(v))
        } catch {
          // 저장 실패는 무시
        }
      },
      { deep: true },
    )
  }
  return prefs
}
