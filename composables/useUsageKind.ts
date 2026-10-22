// composables/useUsageKind.ts
// 사용률 통계 종류 선택 (싱글 / 더블). 첫 화면 TOP 6 · 도감 · 파티 화면 "통계 추천"이 같이 쓰고 브라우저에 기억한다.
// 선출 화면은 그 화면의 배틀 모드를 그대로 쓴다 (useAutoSet(mode))

import type { UsageKind } from '~/utils/autoSet'

const KEY = 'pch_usage_kind'
let hydrated = false

export function useUsageKind() {
  const kind = useState<UsageKind>('usage-kind', () => 'single')
  if (import.meta.client && !hydrated) {
    hydrated = true
    try {
      const v = localStorage.getItem(KEY)
      if (v === 'single' || v === 'double') kind.value = v
    } catch {
      // 저장소 차단
    }
    watch(kind, (v) => {
      try {
        localStorage.setItem(KEY, v)
      } catch {
        // 저장 실패 무시
      }
    })
  }
  return kind
}
