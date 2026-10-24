<!--
  Vuetify 입력칸(v-autocomplete / v-select, density compact · solo-filled · flat)의 겉모습만 같은 클래스로 그린 가벼운 자리표시.
  파티·선출 화면에는 입력칸이 40개 넘게 있어서 전부 Vuetify 로 그리면 화면 전환이 수백 ms 느려진다.
  마우스로 누르거나 Tab 으로 포커스하면 activate 를 보내고, 부모(useLazyField)가 그 칸만 진짜 입력칸으로 바꿔서 연다.
-->
<template>
  <div
    class="v-input v-input--horizontal v-input--center-affix v-input--indent-details v-input--density-compact v-locale--is-ltr v-text-field"
    :class="[
      themeClass,
      kind === 'select'
        ? ['v-select v-select--single', { 'v-select--selected v-select--selection-slot': dirty }]
        : 'v-autocomplete v-autocomplete--single',
      { 'v-input--dirty': dirty, 'v-input--disabled': disabled },
    ]"
    @mousedown="onMousedown"
  >
    <div class="v-input__control">
      <div
        class="v-field v-field--active v-field--appended v-field--center-affix v-field--flat v-field--no-label v-field--variant-solo-filled v-locale--is-ltr"
        :class="[
          themeClass,
          {
            'v-field--dirty': dirty,
            'v-field--prepended': prependIcon || $slots['prepend-inner'],
            'v-field--disabled': disabled,
          },
        ]"
      >
        <div class="v-field__overlay" />
        <div class="v-field__loader" />
        <div v-if="prependIcon || $slots['prepend-inner']" class="v-field__prepend-inner">
          <i
            v-if="prependIcon"
            class="mdi v-icon notranslate v-icon--size-default"
            :class="[prependIcon, themeClass]"
            aria-hidden="true"
          />
          <slot name="prepend-inner" />
        </div>
        <div class="v-field__field">
          <div class="v-field__input">
            <div
              v-if="dirty"
              :class="kind === 'select' ? 'v-select__selection' : 'v-autocomplete__selection'"
            >
              <slot name="selection">
                <span class="v-autocomplete__selection-text">{{ text }}</span>
              </slot>
            </div>
            <input
              size="1"
              type="text"
              readonly
              :placeholder="dirty ? undefined : placeholder"
              :disabled="disabled"
              @focus="emit('activate')"
            />
          </div>
        </div>
        <div v-if="clearable && dirty && !disabled" class="v-field__clearable">
          <i
            class="mdi-close-circle mdi v-icon notranslate v-icon--size-default v-icon--clickable"
            :class="themeClass"
            role="button"
            :aria-label="vt('$vuetify.input.clear', placeholder ?? '')"
            @mousedown.stop.prevent
            @click.stop="emit('clear')"
          />
        </div>
        <div class="v-field__append-inner">
          <slot name="append-inner" />
          <i
            class="mdi-menu-down mdi v-icon notranslate v-icon--size-default"
            :class="[
              themeClass,
              kind === 'select'
                ? 'v-select__menu-icon'
                : 'v-icon--clickable v-autocomplete__menu-icon',
            ]"
            aria-hidden="true"
          />
        </div>
        <div class="v-field__outline" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale, useTheme } from 'vuetify'

const props = defineProps<{
  kind?: 'autocomplete' | 'select'
  text?: string // 선택된 값의 표시 이름 (selection 슬롯이 없을 때)
  dirty: boolean // 값이 있음
  placeholder?: string
  prependIcon?: string // 'mdi-magnify' 등
  clearable?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ activate: []; clear: [] }>()
const theme = useTheme()
const { t: vt } = useLocale()
const themeClass = computed(() => `v-theme--${theme.name.value}`)

// 마우스: 이 자리표시에 포커스를 주지 않고 바로 진짜 입력칸으로 바꾼다 (부모가 포커스·목록 열기)
const onMousedown = (e: MouseEvent) => {
  if (props.disabled || e.button !== 0) return
  e.preventDefault()
  emit('activate')
}
</script>
