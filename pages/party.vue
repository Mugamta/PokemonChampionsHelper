<template>
  <div class="page">
    <div class="page-head">
      <div>
        <!-- 제목 옆: 어떤 타입의 공격이 파티 전원에게 1배 이상 들어가는지 -->
        <div class="title-row">
          <h1 class="page-title">
            {{ t('party.title') }}
          </h1>
          <TeamTypeConsistency :slots="mine.slots.value" :mega-on="mine.megaOn.value" />
        </div>
        <!-- 안내는 파티가 덜 찼을 때만 -->
        <p v-if="!mine.isComplete.value" class="page-sub">
          {{ t('party.subtitle') }}
        </p>
      </div>
      <div class="head-actions">
        <span class="muted small">✓ {{ t('party.saved') }}</span>
        <button type="button" class="btn btn-sm btn-danger" @click="onReset">
          {{ t('common.reset') }}
        </button>
        <NuxtLink
          to="/single"
          class="btn btn-primary"
          :class="{ disabled: !mine.isComplete.value }"
          @click="guard"
          >{{ t('party.toSingle') }}</NuxtLink
        >
        <NuxtLink
          to="/double"
          class="btn btn-primary"
          :class="{ disabled: !mine.isComplete.value }"
          @click="guard"
          >{{ t('party.toDouble') }}</NuxtLink
        >
      </div>
    </div>

    <div class="party-body fit-scroll">
      <div class="grid">
        <TeamSlotEditor
          v-for="(_, i) in mine.slots.value"
          :key="i"
          v-model:slot="mine.slots.value[i]!"
          v-model:mega-on="mine.megaOn.value[i]!"
          :index="i"
          :narrow="fit"
          :species-ids="reg.selectableSpecies.value"
          :exclude-species="others(i, 'species')"
          :exclude-items="others(i, 'item')"
          :not-allowed="
            !!mine.slots.value[i]!.species && !reg.isAllowed(mine.slots.value[i]!.species)
          "
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 넓은 화면에서 한 화면 배치 (layouts/default.vue)
definePageMeta({ fit: true })

const { t } = useI18n()
const reg = useRegulation()
const mine = useTeam('mine')
const fit = useFitLayout()

// 같은 파티 안에서 포켓몬/도구 중복 금지 (다른 슬롯에서 쓴 값 제외)
const others = (i: number, key: 'species' | 'item') =>
  mine.slots.value
    .filter((_, j) => j !== i)
    .map((s) => s[key])
    .filter(Boolean)

const onReset = () => {
  if (window.confirm(t('party.resetConfirm'))) mine.reset()
}
const guard = (e: MouseEvent) => {
  if (!mine.isComplete.value) e.preventDefault()
}
</script>

<style scoped>
.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 18px;
  row-gap: 2px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.head-actions .btn {
  text-decoration: none;
}
.btn.disabled {
  opacity: 0.4;
  pointer-events: auto;
  cursor: not-allowed;
}
.small {
  font-size: 12px;
}
.party-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
/* 넓은 화면: 6장을 한 줄로 (assets/css/main.css "PC 한 화면 배치") */
@media (min-width: 1400px) and (min-height: 700px) {
  .party-body {
    flex: 1;
    gap: 6px;
  }
  .grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
    align-items: stretch; /* 카드 높이를 가장 긴 카드에 맞춤 */
    /* 행 높이는 내용 기준 (카드가 overflow: hidden 이라 기본값이면 그리드 높이에 눌려 아래가 잘림). 넘치면 그리드가 스크롤 */
    grid-auto-rows: max-content;
    align-content: start;
  }
  /* 아직 포켓몬을 안 고른 카드는 늘이지 않음 */
  .grid > .slot.empty {
    align-self: start;
  }
}
@media (max-width: 1400px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
