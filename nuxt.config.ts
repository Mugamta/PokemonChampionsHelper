export default defineNuxtConfig({
	modules: ['vuetify-nuxt-module'],

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