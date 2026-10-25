<template>
  <div class="page doc">
    <h1 class="page-title">
      {{ t('about.title') }}
    </h1>
    <section class="panel panel-pad">
      <p>{{ t('about.body1') }}</p>
      <p>{{ t('about.body2') }}</p>
    </section>
    <!-- 데이터 출처: 게임 데이터 / 이름·설명 / 아이콘 / 사용률 통계 (레귤레이션별 포맷·자료 월) -->
    <section class="panel panel-pad">
      <h2 class="panel-title">{{ t('about.sourcesTitle') }}</h2>
      <ul class="sources">
        <li>{{ t('about.srcGame') }}</li>
        <li>{{ t('about.srcNames') }}</li>
        <li>{{ t('about.srcSprites') }}</li>
        <li>
          {{ t('about.srcUsage') }}
          <a href="https://www.smogon.com/stats/" target="_blank" rel="noopener"
            >smogon.com/stats</a
          >
          <ul v-if="usageRows.length">
            <li v-for="u in usageRows" :key="u.key">
              {{
                t('about.usageRow', {
                  reg: u.reg,
                  format: u.format,
                  month: u.month,
                  battles: u.battles.toLocaleString(),
                })
              }}
            </li>
          </ul>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const gd = useGameData()
// 레귤레이션별 사용률 통계 (포맷·자료 월·배틀 수)
const usageRows = computed(() =>
  (['single', 'double'] as const).flatMap((kind) =>
    Object.entries(gd.usageMeta(kind)).map(([reg, u]) => ({
      key: kind + reg,
      reg: `${reg} ${t('usage.' + kind)}`,
      format: u.format,
      month: u.month,
      battles: u.battles,
    })),
  ),
)
</script>

<style scoped>
.doc {
  max-width: 900px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
p {
  color: var(--text-2);
  line-height: 1.7;
  margin: 0 0 10px;
}
p:last-child {
  margin: 0;
}
.sources {
  margin: 0;
  padding-left: 18px;
  color: var(--text-2);
  line-height: 1.8;
}
.sources a {
  color: var(--accent);
}
</style>
