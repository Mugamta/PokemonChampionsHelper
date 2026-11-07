// 화면 전환 로딩 표시: 다른 페이지로 이동할 때 useState('page-loading') 에 이동할 경로를 넣고,
// 오버레이가 한 번 그려진 뒤에 이동을 진행한다 (새 페이지를 만드는 동안은 메인 스레드가 막혀서 미리 그려 둬야 보인다).
// 새 페이지가 다 만들어지면 끈다. 오버레이는 components/ui/PageLoading.vue (layouts/default.vue).

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const loading = useState<string | null>('page-loading', () => null)

  // rAF 는 그리기 직전, 그 안의 setTimeout 은 그린 직후에 실행된다
  const nextPaint = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)))

  router.beforeEach(async (to, from) => {
    // 첫 진입(레이아웃의 게임 데이터 로딩이 대신 보임)과 같은 페이지 안의 이동(쿼리·해시 변경)은 제외.
    // 경로 문자열이 아니라 페이지(라우트 레코드)로 비교한다: GitHub Pages 는 첫 진입 주소를 /guide/ 로 바꾸고
    // 앱 안의 이동은 /guide 라서, 문자열로 비교하면 같은 페이지인데 켜지고 새 페이지가 안 만들어져 꺼지지 않았다
    if (!from.matched.length || to.matched.at(-1) === from.matched.at(-1)) return
    loading.value = to.path
    await nextPaint()
  })
  const done = () => {
    loading.value = null
  }
  // page:finish 는 새 페이지를 만들 때만 온다. 같은 페이지를 다시 쓰는 경우는 page:loading:end 만 오므로 둘 다 받는다
  nuxtApp.hook('page:finish', done)
  nuxtApp.hook('page:loading:end', done)
  router.afterEach((_to, _from, failure) => {
    if (failure) done()
  })
  router.onError(done)
})
