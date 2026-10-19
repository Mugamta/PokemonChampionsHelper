// 화면 테마: 낮 / 밤 / 시스템 설정(기본). localStorage 'pch_theme' 에 저장.
// <html data-theme="light|dark"> 로 assets/css/main.css 의 토큰이 바뀌고, Vuetify 테마(목록 메뉴 등)도 같이 바꾼다.
// 화면이 그려지기 전에 적용해서 깜빡임이 없게 플러그인에서 처리한다. 헤더는 useState('theme-mode') 만 바꾼다.

import type { ThemeMode } from '~/composables/useThemeMode'

const KEY = 'pch_theme'
const VUETIFY_THEME = { dark: 'champions', light: 'championsLight' } as const

export default defineNuxtPlugin((nuxtApp) => {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(KEY)
  } catch {
    // 저장소 접근 불가 시 무시
  }
  const mode = useState<ThemeMode>('theme-mode', () =>
    saved === 'light' || saved === 'dark' ? saved : 'system',
  )
  const systemLight = window.matchMedia('(prefers-color-scheme: light)')
  const effective = () =>
    mode.value === 'system' ? (systemLight.matches ? 'light' : 'dark') : mode.value

  let vuetify: { theme: { change: (name: string) => void } } | null = null
  const apply = () => {
    const theme = effective()
    document.documentElement.dataset.theme = theme
    vuetify?.theme.change(VUETIFY_THEME[theme])
  }
  apply()

  nuxtApp.hook('vuetify:ready', (v) => {
    vuetify = v
    apply()
  })
  systemLight.addEventListener('change', apply)
  watch(mode, (m) => {
    apply()
    try {
      if (m === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, m)
    } catch {
      // 무시
    }
  })
})
