export const useMineOrderSelection = () => {
  // Nuxt useState: 앱 전역에서 같은 인스턴스를 공유 (entrySelect.vue ↔ singleBattle.vue)
  const selectedMineIndices = useState('mineOrderSelection', () => [])

  const MAX_MINE_SELECT = 3

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