<template>
  <header class="app-header">
    <div class="bar">
      <NuxtLink to="/" class="brand">
        <span class="logo">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2a10 10 0 0 1 10 10h-6.2a3.9 3.9 0 0 0-7.6 0H2A10 10 0 0 1 12 2Z"
              fill="#ff3d3d"
            />
            <path d="M2 12h6.2a3.9 3.9 0 0 0 7.6 0H22a10 10 0 0 1-20 0Z" fill="#f2f4ff" />
            <circle cx="12" cy="12" r="2.4" fill="#f2f4ff" stroke="#0b1020" stroke-width="1.6" />
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
          >{{ t(l.label) }}</NuxtLink
        >
      </nav>

      <div class="tools">
        <div class="reg" :title="t('regulation.label')">
          <select
            :value="reg.selectedId.value ?? 'auto'"
            class="reg-select"
            @change="onRegChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="auto">
              {{ t('regulation.auto')
              }}{{
                reg.active.value && !reg.selectedId.value
                  ? ` · ${reg.active.value.id} (${regPeriod(reg.active.value)})`
                  : ''
              }}
            </option>
            <option v-for="r in reg.list.value" :key="r.id" :value="r.id">
              {{ r.id }} · {{ t('regulation.' + reg.phase(r)) }} ({{ regPeriod(r) }})
            </option>
          </select>
          <div class="times num">
            <span class="clock">{{ clock }}</span>
            <span v-if="usagePeriod" class="usage-period" :title="usagePeriod.hint">{{
              usagePeriod.label
            }}</span>
          </div>
        </div>
        <div class="lang theme" role="group" :aria-label="t('theme.label')">
          <button
            v-for="m in THEME_MODES"
            :key="m"
            type="button"
            class="lang-btn theme-btn"
            :class="{ active: themeMode === m }"
            :title="t('theme.' + m)"
            :aria-label="t('theme.' + m)"
            @click="themeMode = m"
          >
            <svg v-if="m === 'light'" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" />
              <path
                d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"
              />
            </svg>
            <svg v-else-if="m === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4.5" width="18" height="12" rx="2" />
              <path d="M8.5 20h7M12 16.5V20" />
            </svg>
          </button>
        </div>
        <div class="lang" role="group" :aria-label="t('app.language')">
          <button
            v-for="l in locales"
            :key="l.code"
            type="button"
            class="lang-btn"
            :class="{ active: locale === l.code }"
            @click="setLocale(l.code)"
          >
            {{ l.code.toUpperCase() }}
          </button>
        </div>
      </div>
    </div>
    <div v-if="gd.loading.value" class="loading-line" />
  </header>
</template>

<script setup lang="ts">
import { THEME_MODES, useThemeMode } from '~/composables/useThemeMode'
import { useUsageKind } from '~/composables/useUsageKind'
import { usageMonthRange } from '~/utils/autoSet'

const { t, locale, locales, setLocale } = useI18n()
const route = useRoute()
const gd = useGameData()
const reg = useRegulation()
const mine = useTeam('mine')
const themeMode = useThemeMode()
const usageKind = useUsageKind()

const links = [
  { to: '/party', label: 'nav.party' },
  { to: '/single', label: 'nav.single' },
  { to: '/double', label: 'nav.double' },
  { to: '/stats', label: 'nav.stats' },
  { to: '/vs', label: 'nav.vs' },
  { to: '/dex', label: 'nav.dex' },
  { to: '/patch', label: 'nav.patch' },
  { to: '/guide', label: 'nav.guide' },
  { to: '/help', label: 'nav.help' },
]
const isActive = (to: string) => route.path === to || route.path.startsWith(to + '/')

const pad = (n: number) => String(n).padStart(2, '0')
const clock = computed(() => {
  const d = reg.now.value
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
})
const regPeriod = (r: { start: string; end: string }) =>
  t('regulation.period', { start: r.start, end: r.end })
// 현재 레귤레이션 통계의 수집 기간 (Smogon 월별 통계 = 그 달 전체). 통계가 없으면 표시 안 함
const usagePeriod = computed(() => {
  const id = reg.active.value?.id
  const meta = id ? gd.usageMeta(usageKind.value)[id] : undefined
  if (!meta) return null
  return {
    label: t('usage.period', { period: regPeriod(usageMonthRange(meta.month)) }),
    hint: t('usage.periodHint', {
      kind: t('usage.' + usageKind.value),
      format: meta.format,
      battles: meta.battles.toLocaleString(),
    }),
  }
})
const onRegChange = (v: string) => (reg.selectedId.value = v === 'auto' ? null : v)
// 고른 레귤레이션의 데이터(습득 기술·기술 수치·도구)로 앱 전체를 바꾼다
watch(
  () => reg.active.value?.id ?? null,
  (id) => gd.setRegulation(id),
  { immediate: true },
)

onMounted(async () => {
  reg.startClock()
  await gd.load()
  await migrateLegacyTeam(gd, mine)
  // 현재 레귤레이션의 사용률 표(싱글·더블)는 화면을 먼저 보여 준 뒤 미리 받아 둔다 (자동 배치·통계 추천·첫 화면 TOP 6)
  for (const kind of ['single', 'double'] as const) void gd.loadUsage(kind, reg.active.value?.id)
})
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--header-bg);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}
.bar {
  max-width: 2400px;
  margin: 0 auto;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  /* 레귤레이션 선택칸에 기간이 들어가 넓으므로, 한 줄에 안 들어가면 오른쪽 도구를 다음 줄로 */
  flex-wrap: wrap;
  gap: 8px 18px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
}
.logo svg {
  width: 32px;
  height: 32px;
  filter: drop-shadow(0 2px 6px rgba(255, 61, 61, 0.35));
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1;
  font-family: var(--font-display);
}
.brand-top {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: var(--accent-text);
}
.brand-main {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.nav {
  display: flex;
  gap: 4px;
}
.nav-link {
  text-decoration: none;
  color: var(--text-2);
  font-weight: 700;
  font-size: 14px;
  padding: 7px 14px;
  border-radius: 999px;
  white-space: nowrap;
  transition:
    background 0.15s,
    color 0.15s;
}
.nav-link:hover {
  color: var(--text);
  background: var(--hover);
}
.nav-link.active {
  color: var(--accent-ink);
  background: var(--accent);
}

.tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.reg {
  display: flex;
  align-items: center;
  gap: 8px;
}
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
.reg-select option {
  background: var(--panel-solid);
}
.times {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.25;
  white-space: nowrap;
}
.clock {
  font-size: 13px;
  color: var(--text-3);
}
.usage-period {
  font-size: 11px;
  color: var(--text-3);
}
.lang {
  display: flex;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px;
}
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
.theme-btn {
  display: inline-flex;
  align-items: center;
  padding: 4px 7px;
}
.theme-btn svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.lang-btn.active {
  background: var(--accent-2);
  color: var(--on-accent-2);
}

.loading-line {
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  background-size: 50% 100%;
  animation: slide 1.1s linear infinite;
}
@keyframes slide {
  from {
    background-position: -50% 0;
  }
  to {
    background-position: 150% 0;
  }
}

@media (max-width: 1100px) {
  .bar {
    gap: 10px;
  }
  .nav {
    order: 3;
    width: 100%;
    overflow-x: auto;
  }
  .clock {
    display: none;
  }
  .reg-select {
    max-width: 300px;
  }
}
@media (max-width: 600px) {
  /* 휴대폰에서는 헤더가 화면의 1/6 을 차지하므로 따라오지 않게 */
  .app-header {
    position: static;
  }
  .brand-main {
    font-size: 14px;
  }
  .tools {
    flex-wrap: wrap;
    gap: 6px;
  }
  .reg {
    flex-wrap: wrap;
  }
  .reg-select {
    max-width: 150px;
  }
}
</style>
