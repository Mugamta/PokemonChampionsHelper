// composables/useLazyField.ts
// 입력칸을 처음엔 가벼운 자리표시(components/ui/LazyField.vue)로 그리고, 처음 누르거나 포커스할 때 진짜 Vuetify 입력칸으로 바꾼다.
// v-autocomplete 하나가 컴포넌트 20여 개라서 파티·선출 화면(입력칸 40여 개)을 한 번에 그리면 화면 전환이 느려진다.
//
// 사용: <UiLazyField v-if="!live" ... @activate="activate" />
//       <v-autocomplete v-else ref="real" v-model:menu="menu" :menu-props="menuProps" ...>

import { computed, nextTick, ref, watch } from 'vue'

// 목록이 아래로 열릴 때 최소 높이. 아래 공간이 이보다 작을 때만 위로 연다
const MIN_BELOW = 200
const GAP = 12

export function useLazyField(maxHeight = 360) {
  const live = ref(false) // 한 번 바뀌면 계속 진짜 입력칸
  const menu = ref(false)
  const real = ref<{ focus: () => void; $el?: Element } | null>(null)

  const activate = async () => {
    if (live.value) return
    live.value = true
    await nextTick()
    real.value?.focus()
    menu.value = true
  }

  // ── 목록 높이 ─────
  // Vuetify 는 목록이 화면 아래로 넘치면 위로 뒤집어 연다 (입력칸은 아래, 목록은 위로 갈라져 보임).
  // 열 때 입력칸 아래 남은 공간에 맞춰 높이를 줄여서 되도록 아래로 열리게 한다
  const height = ref(maxHeight)
  watch(
    menu,
    (open) => {
      if (!open) return
      const el = real.value?.$el
      if (!(el instanceof Element)) return
      const below = window.innerHeight - el.getBoundingClientRect().bottom - GAP
      height.value = below >= MIN_BELOW ? Math.min(maxHeight, below) : maxHeight
    },
    { flush: 'sync' },
  )
  const menuProps = computed(() => ({ maxHeight: height.value }))

  return { live, menu, real, activate, menuProps }
}
