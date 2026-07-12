export default defineNuxtConfig({
	modules: ['vuetify-nuxt-module'],

	ssr: false,   // ← 추가: 실시간 시계 등 클라이언트 전용 데이터의 하이드레이션 불일치 방지

	vuetify: {
		vuetifyOptions: {
			theme: {
				defaultTheme: 'dark'
			}
		}
	},

	nitro: {
		preset: 'github_pages'
	}
})