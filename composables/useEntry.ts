// composables/useEntry.ts
// 선출 순서 (내 파티 인덱스 배열). 싱글 3마리 / 더블 4마리, 모드별로 따로 저장해서 서로 영향 없음.

export type BattleMode = 'single' | 'double'
export const PICK_COUNT: Record<BattleMode, number> = { single: 3, double: 4 }

export function useEntry(mode: BattleMode) {
  const picks = useState<number[]>(`entry-${mode}`, () => [])
  const max = PICK_COUNT[mode]

  const toggle = (i: number) => {
    const at = picks.value.indexOf(i)
    if (at !== -1)
      picks.value.splice(at, 1) // 해제하면 뒤 순서가 당겨짐
    else if (picks.value.length < max) picks.value.push(i)
  }
  const order = (i: number) => {
    const at = picks.value.indexOf(i)
    return at === -1 ? null : at + 1
  }
  const isFull = computed(() => picks.value.length === max)

  return { picks, max, toggle, order, isFull }
}
