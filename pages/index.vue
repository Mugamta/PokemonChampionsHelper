<template>
  <div class="page home">
    <section class="hero panel">
      <div class="hero-text">
        <p class="eyebrow">POKÉMON CHAMPIONS</p>
        <h1 class="hero-title">
          {{ t('app.title') }}
        </h1>
        <p class="tagline">
          {{ t('home.tagline') }}
        </p>
        <div class="hero-actions">
          <NuxtLink to="/party" class="btn btn-primary">{{ t('home.start') }} →</NuxtLink>
          <NuxtLink to="/help" class="btn btn-ghost">{{ t('home.helpTitle') }}</NuxtLink>
        </div>
      </div>
      <HomeUsageTop class="showcase" />
    </section>

    <section v-if="reg.active.value" class="reg-card panel panel-pad">
      <span class="section-label">{{ t('home.regulationNow') }}</span>
      <div class="reg-row">
        <span class="reg-id">{{ reg.active.value.id }}</span>
        <span class="reg-badge">{{ t('regulation.' + reg.phase(reg.active.value)) }}</span>
        <span class="muted">{{
          t('regulation.period', {
            start: reg.formatDate(reg.active.value.startDate),
            end: reg.formatDate(reg.active.value.endDate),
          })
        }}</span>
        <span class="muted"
          >· {{ t('regulation.count', { n: reg.active.value.pokemon.length }) }}</span
        >
      </div>
    </section>

    <section class="modes">
      <NuxtLink v-for="m in modes" :key="m.to" :to="m.to" class="mode panel" :class="m.tone">
        <span class="mode-icon">{{ m.icon }}</span>
        <h2 class="mode-title">
          {{ t(m.title) }}
        </h2>
        <p class="mode-desc">
          {{ t(m.desc) }}
        </p>
        <div v-if="m.progress" class="progress">
          <div class="dots">
            <span
              v-for="(s, i) in mine.slots.value"
              :key="i"
              class="dot"
              :class="{ on: !!s.species }"
            >
              <UiPokeSprite v-if="s.species" :id="s.species" :size="30" />
            </span>
          </div>
          <span class="muted small">{{ mine.filled.value }}/6</span>
        </div>
        <p v-else-if="m.needParty && !mine.isComplete.value" class="warn-text small">
          {{ t('home.partyIncomplete') }}
        </p>
      </NuxtLink>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const reg = useRegulation()
const mine = useTeam('mine')

const modes = [
  {
    to: '/party',
    icon: '◆',
    title: 'home.partyTitle',
    desc: 'home.partyDesc',
    tone: 'gold',
    progress: true,
  },
  {
    to: '/single',
    icon: '①',
    title: 'home.singleTitle',
    desc: 'home.singleDesc',
    tone: 'cyan',
    needParty: true,
  },
  {
    to: '/double',
    icon: '②',
    title: 'home.doubleTitle',
    desc: 'home.doubleDesc',
    tone: 'pink',
    needParty: true,
  },
  { to: '/stats', icon: '▤', title: 'home.perfTitle', desc: 'home.perfDesc', tone: 'green' },
  { to: '/help', icon: '?', title: 'home.helpTitle', desc: 'home.helpDesc', tone: 'plain' },
]
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.3fr);
  align-items: center;
  gap: 24px;
  padding: 36px;
  overflow: hidden;
  background: var(--hero-bg);
}
.hero::after {
  content: '';
  position: absolute;
  right: -120px;
  bottom: -160px;
  width: 460px;
  height: 460px;
  border-radius: 50%;
  border: 46px solid var(--faint);
}
.eyebrow {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: 0.3em;
  color: var(--accent-text);
  font-size: 12px;
}
.hero-title {
  font-family: var(--font-display);
  font-size: clamp(30px, 4vw, 52px);
  line-height: 1.05;
  margin: 8px 0 12px;
  font-weight: 800;
}
.tagline {
  color: var(--text-2);
  font-size: 16px;
  max-width: 520px;
  margin: 0 0 22px;
}
.hero-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.hero-actions .btn {
  text-decoration: none;
  padding: 11px 20px;
  font-size: 15px;
}
.showcase {
  position: relative;
  z-index: 1;
}

.reg-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.reg-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.reg-id {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 800;
}
.reg-badge {
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(61, 220, 151, 0.18);
  color: var(--good);
}

.modes {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}
.mode {
  position: relative;
  padding: 20px;
  text-decoration: none;
  color: var(--text);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition:
    transform 0.15s,
    border-color 0.15s;
  overflow: hidden;
}
.mode:hover {
  transform: translateY(-3px);
  border-color: var(--line-strong);
}
.mode-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  font-weight: 800;
  font-size: 18px;
  background: var(--panel-3);
}
.gold .mode-icon {
  background: linear-gradient(135deg, #ffd84a, #ff9d00);
  color: #241400;
}
.cyan .mode-icon {
  background: linear-gradient(135deg, #4cc9f0, #4361ee);
  color: #fff;
}
.pink .mode-icon {
  background: linear-gradient(135deg, #ff6ad5, #8c6cff);
  color: #fff;
}
.green .mode-icon {
  background: linear-gradient(135deg, #3ddc97, #1f9d8b);
  color: #fff;
}
.mode-title {
  font-family: var(--font-display);
  font-size: 19px;
  margin: 4px 0 0;
}
.mode-desc {
  color: var(--text-2);
  font-size: 13px;
  margin: 0;
  line-height: 1.55;
}
.progress {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dots {
  display: flex;
  gap: 4px;
}
.dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--hover);
  border: 1px dashed var(--line-strong);
  display: grid;
  place-items: center;
}
.dot.on {
  border-style: solid;
  border-color: transparent;
  background: transparent;
}
.small {
  font-size: 12px;
  margin: 0;
}

@media (max-width: 1100px) {
  .modes {
    grid-template-columns: repeat(2, 1fr);
  }
  /* 5개라 마지막(사용법)은 한 줄 전체 */
  .mode:last-child {
    grid-column: 1 / -1;
  }
  .hero {
    grid-template-columns: 1fr;
    padding: 24px;
  }
}
@media (max-width: 600px) {
  .modes {
    grid-template-columns: 1fr;
  }
}
</style>
