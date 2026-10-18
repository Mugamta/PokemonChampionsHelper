export default defineNuxtConfig({
  modules: ['vuetify-nuxt-module', '@nuxtjs/i18n'],

  ssr: false, // 실시간 시계 등 클라이언트 전용 데이터의 하이드레이션 불일치 방지

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'Pokémon Champions Helper',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;800&family=Noto+Sans+KR:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap',
        },
      ],
    },
  },

  vuetify: {
    vuetifyOptions: {
      theme: {
        defaultTheme: 'champions',
        themes: {
          champions: {
            dark: true,
            colors: {
              background: '#0b1020',
              surface: '#141b33',
              'surface-variant': '#1d2647',
              primary: '#ffcb05',
              secondary: '#4cc9f0',
              error: '#ff5c7a',
              warning: '#ffb547',
              success: '#3ddc97',
            },
          },
        },
      },
    },
  },

  // 화면 문구 다국어 (게임 데이터 이름은 public/data/names.{locale}.json 을 useGameData 가 따로 로드)
  i18n: {
    strategy: 'no_prefix', // GitHub Pages 정적 배포라서 URL은 그대로 두고 쿠키로 언어 유지
    defaultLocale: 'ko',
    langDir: 'locales',
    locales: [
      { code: 'ko', language: 'ko-KR', name: '한국어', file: 'ko.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'ja', language: 'ja-JP', name: '日本語', file: 'ja.json' },
    ],
    detectBrowserLanguage: { useCookie: true, cookieKey: 'pch_lang', redirectOn: 'root', fallbackLocale: 'ko' },
  },

  nitro: {
    preset: 'github_pages',
  },
})
