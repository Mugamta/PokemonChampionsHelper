// composables/useLazyField.ts
// 입력칸을 처음엔 가벼운 자리표시(components/ui/LazyField.vue)로 그리고, 처음 누르거나 포커스할 때 진짜 Vuetify 입력칸으로 바꾼다.
// v-autocomplete 하나가 컴포넌트 20여 개라서 파티·선출 화면(입력칸 40여 개)을 한 번에 그리면 화면 전환이 느려진다.
//
// 사용: <UiLazyField v-if="!live" ... @activate="activate" /> <v-autocomplete v-else ref="real" v-model:menu="menu" ...>

import { nextTick, ref } from 'vue'

export function useLazyField() {
  const live = ref(false) // 한 번 바뀌면 계속 진짜 입력칸
  const menu = ref(false)
  const real = ref<{ focus: () => void } | null>(null)

  const activate = async () => {
    if (live.value) return
    live.value = true
    await nextTick()
    real.value?.focus()
    menu.value = true
  }

  return { live, menu, real, activate }
}
