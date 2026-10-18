<template>
  <div class="page doc">
    <h1 class="page-title">
      {{ t('help.title') }}
    </h1>

    <section class="panel panel-pad">
      <h2 class="panel-title">
        {{ t('help.flowTitle') }}
      </h2>
      <ol class="steps">
        <li
          v-for="(k, i) in ['flow1', 'flow2', 'flow3']"
          :key="k"
        >
          <span class="step-no num">{{ i + 1 }}</span>
          <span>{{ t('help.' + k) }}</span>
        </li>
      </ol>
    </section>

    <section class="panel panel-pad">
      <h2 class="panel-title">
        {{ t('help.calcTitle') }}
      </h2>
      <ul>
        <li>{{ t('help.calc1') }}</li>
        <li>{{ t('help.calc2') }}</li>
        <li>{{ t('help.calc3') }}</li>
      </ul>
    </section>

    <section class="panel panel-pad">
      <h2 class="panel-title">
        {{ t('help.dataTitle') }}
      </h2>
      <ul>
        <li>{{ t('help.data1') }}</li>
        <li>{{ t('help.data2') }}</li>
      </ul>
    </section>

    <section class="panel panel-pad">
      <h2 class="panel-title">
        {{ t('help.limitsTitle') }}
      </h2>
      <ul>
        <li>{{ t('help.limits1') }}</li>
        <li>{{ t('help.limits2') }}</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
</script>

<style scoped>
.doc { max-width: 900px; display: flex; flex-direction: column; gap: 14px; }
ul { margin: 0; padding-left: 20px; color: var(--text-2); line-height: 1.7; }
.steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; color: var(--text-2); line-height: 1.6; }
.steps li { display: flex; gap: 12px; align-items: flex-start; }
.step-no {
  flex-shrink: 0;
  width: 28px; height: 28px;
  border-radius: 50%;
  display: grid; place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
}
</style>
