// 화면 전환 로딩 표시: 다른 페이지로 이동할 때 useState('page-loading') 을 켜고,
// 오버레이가 한 번 그려진 뒤에 이동을 진행한다 (새 페이지를 만드는 동안은 메인 스레드가 막혀서 미리 그려 둬야 보인다).
// 새 페이지가 다 만들어지면(page:finish) 끈다. 오버레이는 components/ui/PageLoading.vue (layouts/default.vue).

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const loading = useState('page-loading', () => false)

  // rAF 는 그리기 직전, 그 안의 setTimeout 은 그린 직후에 실행된다
  const nextPaint = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

  router.beforeEach(async (to, from) => {
    // 첫 진입(레이아웃의 게임 데이터 로딩이 대신 보임)과 같은 페이지 안의 쿼리·해시 변경은 제외
    if (!from.matched.length || to.path === from.path) return
    loading.value = true
    await nextPaint()
  })
  nuxtApp.hook('page:finish', () => {
    loading.value = false
  })
  router.afterEach((_to, _from, failure) => {
    if (failure) loading.value = false
  })
  router.onError(() => {
    loading.value = false
  })
})
