export const useMineOrderSelection = (maxCount = 3) => {
  // Nuxt useState: 앱 전역에서 같은 인스턴스를 공유 (singleEntrySelect.vue/doubleEntrySelect.vue ↔ singleBattle.vue/doubleBattle.vue)
  // 주의: 싱글(3마리)과 더블(4마리)이 이 상태를 공유하므로, 더블에서 4마리를 선택한 뒤
  // 싱글 화면으로 넘어가면 배열 길이가 3을 초과한 상태로 남아있을 수 있습니다.
  // 필요하다면 화면 진입 시(entrySelect 계열의 onMounted 등) 초과분을 잘라내는 처리를 추가하세요.
  const selectedMineIndices = useState('mineOrderSelection', () => [])

  const MAX_MINE_SELECT = maxCount

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