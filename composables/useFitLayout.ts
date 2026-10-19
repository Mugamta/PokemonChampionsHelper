// composables/useFitLayout.ts
// 넓은 화면(PC)에서 페이지를 화면 높이에 맞추는 배치인지. assets/css/main.css "PC 한 화면 배치" 의 미디어쿼리와 같은 조건.
// CSS 만으로 못 하는 배치 변경(패널을 다른 열로 옮기기, 표를 탭으로 묶기)에 쓴다.

export const FIT_QUERY = '(min-width: 1400px) and (min-height: 700px)'

export function useFitLayout() {
  const fit = ref(false)
  if (import.meta.client) {
    const mq = window.matchMedia(FIT_QUERY)
    fit.value = mq.matches
    const onChange = (e: MediaQueryListEvent) => (fit.value = e.matches)
    mq.addEventListener('change', onChange)
    onScopeDispose(() => mq.removeEventListener('change', onChange))
  }
  return fit
}
