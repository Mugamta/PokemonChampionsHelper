// 언어 선택: localStorage 에 저장된 값 → 브라우저 언어(ko/ja/en) → 기본 ko
// (@nuxtjs/i18n 의 detectBrowserLanguage 는 정적 빌드와 충돌해서 끄고 직접 처리)

const KEY = 'pch_lang'
const SUPPORTED = ['ko', 'en', 'ja'] as const

export default defineNuxtPlugin(async (nuxtApp) => {
  const i18n = nuxtApp.$i18n as { locale: { value: string }; setLocale: (l: string) => Promise<void> }
  let saved: string | null = null
  try {
    saved = localStorage.getItem(KEY)
  } catch {
    // 저장소 접근 불가 시 무시
  }
  const browser = (navigator.languages || [navigator.language]).map((l) => l.slice(0, 2).toLowerCase()).find((l) => (SUPPORTED as readonly string[]).includes(l))
  const target = saved && (SUPPORTED as readonly string[]).includes(saved) ? saved : browser || 'ko'
  if (target !== i18n.locale.value) await i18n.setLocale(target)

  nuxtApp.hook('i18n:localeSwitched', ({ newLocale }: { newLocale: string }) => {
    try {
      localStorage.setItem(KEY, newLocale)
    } catch {
      // 무시
    }
  })
})
