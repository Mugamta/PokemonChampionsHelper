<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">
          {{ t('party.title') }}
        </h1>
        <p class="page-sub">
          {{ t('party.subtitle') }}
        </p>
      </div>
      <div class="head-actions">
        <span class="muted small">✓ {{ t('party.saved') }}</span>
        <button
          type="button"
          class="btn btn-sm btn-danger"
          @click="onReset"
        >
          {{ t('common.reset') }}
        </button>
        <NuxtLink
          to="/single"
          class="btn btn-primary"
          :class="{ disabled: !mine.isComplete.value }"
          @click="guard"
        >{{ t('party.toSingle') }}</NuxtLink>
        <NuxtLink
          to="/double"
          class="btn btn-primary"
          :class="{ disabled: !mine.isComplete.value }"
          @click="guard"
        >{{ t('party.toDouble') }}</NuxtLink>
      </div>
    </div>

    <div class="grid">
      <TeamSlotEditor
        v-for="(_, i) in mine.slots.value"
        :key="i"
        v-model:slot="mine.slots.value[i]!"
        v-model:mega-on="mine.megaOn.value[i]!"
        :index="i"
        :species-ids="reg.selectableSpecies.value"
        :exclude-species="others(i, 'species')"
        :exclude-items="others(i, 'item')"
        :not-allowed="!!mine.slots.value[i]!.species && !reg.isAllowed(mine.slots.value[i]!.species)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const reg = useRegulation()
const mine = useTeam('mine')

// 같은 파티 안에서 포켓몬/도구 중복 금지 (다른 슬롯에서 쓴 값 제외)
const others = (i: number, key: 'species' | 'item') =>
  mine.slots.value.filter((_, j) => j !== i).map((s) => s[key]).filter(Boolean)

const onReset = () => {
  if (window.confirm(t('party.resetConfirm'))) mine.reset()
}
const guard = (e: MouseEvent) => {
  if (!mine.isComplete.value) e.preventDefault()
}
</script>

<style scoped>
.head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.head-actions .btn { text-decoration: none; }
.btn.disabled { opacity: 0.4; pointer-events: auto; cursor: not-allowed; }
.small { font-size: 12px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 1400px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
</style>
