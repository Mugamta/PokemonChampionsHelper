// composables/useIncremental.ts
// 긴 목록을 조금씩 그린다: 처음 step 개, 목록 끝(sentinel 요소)이 화면 근처에 오면 step 개씩 더.
// 목록이 바뀌면(검색·필터) 다시 처음 step 개부터. 사용: <div ref="sentinel" /> 를 목록 뒤에 둔다.

import type { Ref } from 'vue'

export function useIncremental<T>(list: Ref<T[]>, step = 80) {
  const limit = ref(step)
  const visible = computed(() => list.value.slice(0, limit.value))
  const hasMore = computed(() => limit.value < list.value.length)
  const sentinel = ref<HTMLElement | null>(null)
  const more = () => (limit.value += step)

  watch(list, () => (limit.value = step))

  const MARGIN = 800
  let io: IntersectionObserver | null = null
  onMounted(() => {
    io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting) && hasMore.value) more()
      },
      { rootMargin: `${MARGIN}px 0px` },
    )
    watch(
      sentinel,
      (el, old) => {
        if (old) io?.unobserve(old)
        if (el) io?.observe(el)
      },
      { immediate: true },
    )
  })
  // 더 그린 뒤에도 끝이 여전히 화면 근처면 한 번 더 (관찰자는 상태가 바뀔 때만 알려 줌)
  watch(limit, async () => {
    await nextTick()
    const el = sentinel.value
    if (el && hasMore.value && el.getBoundingClientRect().top < window.innerHeight + MARGIN) more()
  })
  onBeforeUnmount(() => io?.disconnect())

  return { visible, hasMore, sentinel, more }
}
