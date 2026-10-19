<template>
  <!-- fit: 넓은 화면에서 페이지를 화면 높이에 고정 (definePageMeta({ fit: true }), assets/css/main.css 참고) -->
  <div class="shell" :class="{ fit: route.meta.fit }">
    <AppHeader />
    <main class="content">
      <slot v-if="ready" />
      <div v-else class="boot">
        <v-progress-circular indeterminate color="primary" size="56" width="5" />
        <span>{{ t('app.loading') }}</span>
      </div>
    </main>
    <footer class="footer">
      <span>{{ t('footer.rights') }}</span>
      <span class="tm">{{ t('footer.trademark') }}</span>
      <nav class="footer-links">
        <NuxtLink to="/about">{{ t('nav.about') }}</NuxtLink>
        <NuxtLink to="/contact">{{ t('nav.contact') }}</NuxtLink>
      </nav>
    </footer>
  </div>
</template>

<script setup lang="ts">
const { t, locale } = useI18n()
const { ready } = useGameData()
const route = useRoute()
useHead({ htmlAttrs: { lang: locale } })
</script>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.content {
  flex: 1;
}
.boot {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-2);
}
.footer {
  border-top: 1px solid var(--line);
  padding: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  justify-content: center;
  font-size: 12px;
  color: var(--text-3);
}
.footer-links {
  display: flex;
  gap: 12px;
}
.footer-links a {
  color: var(--text-2);
  text-decoration: none;
}
.footer-links a:hover {
  color: var(--accent-text);
}
</style>
