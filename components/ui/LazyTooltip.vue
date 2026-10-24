<!--
  처음 마우스를 올릴 때 만드는 v-tooltip. 툴팁을 띄울 요소(부모 요소)의 자식으로 둔다 (activator="parent").
  v-tooltip 은 하나에 컴포넌트 5개 + 오버레이 div 라서, 성능표처럼 행마다 있으면 화면 전환이 눈에 띄게 느려진다.
  내용(기본 슬롯)도 열려 있을 때만 그린다 (Vuetify 가 마운트 직후 내용을 미리 만들어 두는 것 방지).
  나머지 속성(location, class 등)은 v-tooltip 에 그대로 넘어간다.
-->
<template>
  <v-tooltip v-if="armed" v-model="open" activator="parent" :open-delay="openDelay" v-bind="$attrs">
    <template #default="{ isActive }">
      <slot v-if="isActive.value" />
    </template>
  </v-tooltip>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ openDelay?: number }>(), { openDelay: 150 })

const armed = ref(false)
const open = ref(false)
const vm = getCurrentInstance()
let parent: HTMLElement | null = null
let hovering = false
let timer: ReturnType<typeof setTimeout> | undefined

// 첫 진입: 툴팁을 만들고, 그동안 지난 진입은 Vuetify 가 못 봤으므로 지연 뒤에도 올려져 있으면 직접 연다.
// 그 뒤로는 Vuetify 가 부모 요소의 마우스 이벤트로 열고 닫는다
const onEnter = () => {
  hovering = true
  if (armed.value) return
  armed.value = true
  timer = setTimeout(() => {
    if (hovering) open.value = true
  }, props.openDelay)
}
const onLeave = () => (hovering = false)

onMounted(() => {
  parent = (vm?.vnode.el as Node | null)?.parentElement ?? null
  parent?.addEventListener('mouseenter', onEnter)
  parent?.addEventListener('mouseleave', onLeave)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  parent?.removeEventListener('mouseenter', onEnter)
  parent?.removeEventListener('mouseleave', onLeave)
})
</script>
