<template>
  <header class="app-header">
    <div class="bar">
      <NuxtLink
        to="/"
        class="brand"
      >
        <span class="logo">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M12 2a10 10 0 0 1 10 10h-6.2a3.9 3.9 0 0 0-7.6 0H2A10 10 0 0 1 12 2Z"
              fill="#ff3d3d"
            />
            <path
              d="M2 12h6.2a3.9 3.9 0 0 0 7.6 0H22a10 10 0 0 1-20 0Z"
              fill="#f2f4ff"
            />
            <circle
              cx="12"
              cy="12"
              r="2.4"
              fill="#f2f4ff"
              stroke="#0b1020"
              stroke-width="1.6"
            />
          </svg>
        </span>
        <span class="brand-text">
          <span class="brand-top">POKÉMON</span>
          <span class="brand-main">CHAMPIONS HELPER</span>
        </span>
      </NuxtLink>

      <nav class="nav">
        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="nav-link"
          :class="{ active: isActive(l.to) }"
        >{{ t(l.label) }}</NuxtLink>
      </nav>

      <div class="tools">
        <div
          class="reg"
          :title="t('regulation.label')"
        >
          <select
            :value="reg.selectedId.value ?? 'auto'"
            class="reg-select"
            @change="onRegChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="auto">
              {{ t('regulation.auto') }}{{ reg.active.value && !reg.selectedId.value ? ` · ${reg.active.value.id}` : '' }}
            </option>
            <option
              v-for="r in reg.list.value"
              :key="r.id"
              :value="r.id"
            >
              {{ r.id }} · {{ t('regulation.' + reg.phase(r)) }}
            </option>
          </select>
          <span class="clock num">{{ clock }}</span>
        </div>
        <div
          class="lang"
          role="group"
          :aria-label="t('app.language')"
        >
          <button
            v-for="l in locales"
            :key="l.code"
            type="button"
            class="lang-btn"
            :class="{ active: locale === l.code }"
            @click="setLocale(l.code)"
          >{{ l.code.toUpperCase() }}</button>
        </div>
      </div>
    </div>
    <div
      v-if="gd.loading.value"
      class="loading-line"
    />
  </header>
</template>

<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()
const route = useRoute()
const gd = useGameData()
const reg = useRegulation()
const mine = useTeam('mine')

const links = [
  { to: '/party', label: 'nav.party' },
  { to: '/single', label: 'nav.single' },
  { to: '/double', label: 'nav.double' },
  { to: '/help', label: 'nav.help' },
]
const isActive = (to: string) => route.path === to || route.path.startsWith(to + '/')

const pad = (n: number) => String(n).padStart(2, '0')
const clock = computed(() => {
  const d = reg.now.value
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})
const onRegChange = (v: string) => (reg.selectedId.value = v === 'auto' ? null : v)

onMounted(async () => {
  reg.startClock()
  await gd.load()
  await migrateLegacyTeam(gd, mine)
})
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(7, 11, 24, 0.78);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.bar {
  max-width: 1760px;
  margin: 0 auto;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 18px;
}
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); }
.logo svg { width: 32px; height: 32px; filter: drop-shadow(0 2px 6px rgba(255, 61, 61, 0.35)); }
.brand-text { display: flex; flex-direction: column; line-height: 1; font-family: var(--font-display); }
.brand-top { font-size: 10px; font-weight: 700; letter-spacing: 0.24em; color: var(--accent); }
.brand-main { font-size: 17px; font-weight: 800; letter-spacing: 0.04em; }

.nav { display: flex; gap: 4px; }
.nav-link {
  text-decoration: none;
  color: var(--text-2);
  font-weight: 700;
  font-size: 14px;
  padding: 7px 14px;
  border-radius: 999px;
  transition: background 0.15s, color 0.15s;
}
.nav-link:hover { color: var(--text); background: rgba(255, 255, 255, 0.05); }
.nav-link.active { color: var(--accent-ink); background: var(--accent); }

.tools { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.reg { display: flex; align-items: center; gap: 8px; }
.reg-select {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.reg-select option { background: var(--panel-solid); }
.clock { font-size: 13px; color: var(--text-3); }
.lang { display: flex; background: var(--panel-2); border: 1px solid var(--line); border-radius: 999px; padding: 2px; }
.lang-btn {
  border: 0;
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  padding: 4px 9px;
  border-radius: 999px;
  cursor: pointer;
}
.lang-btn.active { background: var(--accent-2); color: #04131a; }

.loading-line {
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  background-size: 50% 100%;
  animation: slide 1.1s linear infinite;
}
@keyframes slide { from { background-position: -50% 0; } to { background-position: 150% 0; } }

@media (max-width: 1100px) {
  .bar { flex-wrap: wrap; gap: 10px; }
  .nav { order: 3; width: 100%; overflow-x: auto; }
  .clock { display: none; }
}
@media (max-width: 600px) {
  .brand-main { font-size: 14px; }
  .tools { gap: 6px; }
  .reg-select { max-width: 150px; }
}
</style>
