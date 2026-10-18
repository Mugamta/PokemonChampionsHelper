// mode: 'single' | 'double'
// 싱글(3마리)과 더블(4마리)이 서로 다른 useState 키를 쓰도록 분리해서,
// 더블에서 4마리를 고른 뒤 싱글 화면으로 돌아가도 서로 영향을 주지 않습니다.
// - singleEntrySelect.vue / singleBattle.vue → useMineOrderSelection('single')
// - doubleEntrySelect.vue / doubleBattle.vue → useMineOrderSelection('double')
export const useMineOrderSelection = (mode = 'single') => {
  const isDouble = mode === 'double'
  const MAX_MINE_SELECT = isDouble ? 4 : 3
  const stateKey = isDouble ? 'mineOrderSelectionDouble' : 'mineOrderSelectionSingle'

  // Nuxt useState: 앱 전역에서 같은 인스턴스를 공유 (같은 mode를 쓰는 화면끼리만 공유됨)
  const selectedMineIndices = useState(stateKey, () => [])

  const isMineSelected = (index) => selectedMineIndices.value.includes(index)

  const getMineOrder = (index) => {
    const pos = selectedMineIndices.value.indexOf(index)
    return pos === -1 ? null : pos + 1
  }

  const toggleMineSelect = (index) => {
    const pos = selectedMineIndices.value.indexOf(index)
    if (pos !== -1) {
      selectedMineIndices.value.splice(pos, 1) // 다시 누르면 해제, 뒤 순서는 자동으로 당겨짐
      return
    }
    if (selectedMineIndices.value.length >= MAX_MINE_SELECT) return
    selectedMineIndices.value.push(index)
  }

  return { selectedMineIndices, isMineSelected, getMineOrder, toggleMineSelect }
}