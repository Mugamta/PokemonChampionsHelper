<template>
  <div class="page doc">
    <h1 class="page-title">
      {{ t('about.title') }}
    </h1>
    <section class="panel panel-pad">
      <p>{{ t('about.body1') }}</p>
      <p>{{ t('about.body2') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
</script>

<style scoped>
.doc { max-width: 900px; display: flex; flex-direction: column; gap: 14px; }
p { color: var(--text-2); line-height: 1.7; margin: 0 0 10px; }
p:last-child { margin: 0; }
</style>
