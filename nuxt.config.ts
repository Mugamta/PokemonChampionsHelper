export default defineNuxtConfig({
  modules: ['vuetify-nuxt-module', '@nuxtjs/i18n'],

  ssr: false, // 실시간 시계 등 클라이언트 전용 데이터의 하이드레이션 불일치 방지

  css: ['~/assets/css/main.css'],

  // 빌드마다 바뀌는 값: 게임 데이터 주소에 붙여서 배포 직후 브라우저가 예전 JSON(캐시 10분)을 쓰지 않게 함
  runtimeConfig: {
    public: { buildId: (process.env.GITHUB_SHA || String(Date.now())).slice(0, 12) },
  },

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
          // 낮 테마 (plugins/theme.client.ts 에서 전환)
          championsLight: {
            dark: false,
            colors: {
              background: '#f5f7fc',
              surface: '#ffffff',
              'surface-variant': '#eef1f8',
              primary: '#ffcb05',
              secondary: '#1aa3d4',
              error: '#db2f4d',
              warning: '#c27700',
              success: '#11995f',
            },
          },
        },
      },
    },
  },

  // 화면 문구 다국어 (게임 데이터 이름은 public/data/names.{locale}.json 을 useGameData 가 따로 로드)
  i18n: {
    strategy: 'no_prefix', // GitHub Pages 정적 배포라서 URL은 그대로 두고 쿠키로 언어 유지
    defaultLocale: 'en',
    langDir: 'locales',
    locales: [
      { code: 'ko', language: 'ko-KR', name: '한국어', file: 'ko.ts' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.ts' },
      { code: 'ja', language: 'ja-JP', name: '日本語', file: 'ja.ts' },
    ],
    // 모듈의 언어 감지/리다이렉트는 끈다: 정적 빌드(prerender) 시 모든 HTML 이 "Redirecting..." 으로 생성되는 문제가 있음.
    // 대신 plugins/locale.client.ts 에서 저장된 언어 → 브라우저 언어 순으로 고른다.
    detectBrowserLanguage: false,
  },

  nitro: {
    preset: 'github_pages',
  },

  // 재설계 전 URL(북마크) → 새 URL. 정적 배포라서 서버 리다이렉트 대신 라우터 리다이렉트로 처리
  hooks: {
    'pages:extend'(pages) {
      const legacy: Record<string, string> = {
        '/partySelect': '/party',
        '/entrySelect': '/single',
        '/singleEntrySelect': '/single',
        '/singleBattle': '/single/battle',
        '/doubleEntrySelect': '/double',
      }
      for (const [path, redirect] of Object.entries(legacy)) pages.push({ path, redirect })
    },
  },
})
