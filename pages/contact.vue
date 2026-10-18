<template>
  <div class="page doc">
    <h1 class="page-title">
      {{ t('contact.title') }}
    </h1>
    <section class="panel panel-pad">
      <p>{{ t('contact.body') }}</p>
      <a
        href="https://github.com/Mugamta/PokemonChampionsHelper/issues"
        target="_blank"
        rel="noopener"
        class="btn btn-primary"
      >{{ t('contact.github') }} ↗</a>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
</script>

<style scoped>
.doc { max-width: 900px; display: flex; flex-direction: column; gap: 14px; }
p { color: var(--text-2); line-height: 1.7; margin: 0 0 14px; }
.btn { text-decoration: none; }
</style>
