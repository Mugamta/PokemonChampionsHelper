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
        <!-- 안내 / 준비 완료: 두 문구를 같은 칸에 겹쳐 두고 하나만 보이게 → 파티가 완성돼도 줄 높이가 그대로 (레이아웃 안 밀림) -->
        <p class="page-sub sub-stack" aria-live="polite">
          <span :class="{ off: mine.isComplete.value || genderNames }">{{
            t('party.subtitle')
          }}</span>
          <!-- 성별을 안 고른 포켓몬이 있으면 그 이름 -->
          <span class="warn-text" :class="{ off: mine.isComplete.value || !genderNames }">{{
            t('party.genderMissing', { names: genderNames })
          }}</span>
          <span class="ready" :class="{ off: !mine.isComplete.value }"
            >✓ {{ t('party.ready') }}</span
          >
        </p>
      </div>
      <div class="head-actions">
        <span class="muted small" :title="t('usage.kindHint')">{{ t('usage.kind') }}</span>
        <TeamUsageKindToggle />
        <!-- 빈 슬롯을 사용률 통계(함께 쓴 비율)로 채움 -->
        <button
          type="button"
          class="btn btn-sm"
          :disabled="!auto.source.value || mine.filled.value >= 6"
          :title="
            t('party.usageFillHint', {
              format: auto.source.value?.format ?? '',
              month: auto.source.value?.month ?? '',
            })
          "
          @click="fillByUsage"
        >
          {{ t('party.usageFill') }}
        </button>
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

    <div ref="bodyEl" class="party-body fit-scroll">
      <div ref="gridEl" class="grid">
        <TeamSlotEditor
          v-for="(_, i) in mine.slots.value"
          :key="i"
          v-model:slot="mine.slots.value[i]!"
          v-model:mega-on="mine.megaOn.value[i]!"
          v-model:alt-on="mine.altOn.value[i]!"
          :index="i"
          :narrow="fit"
          :species-ids="reg.selectableSpecies.value"
          :exclude-species="others(i, 'species')"
          :exclude-items="others(i, 'item')"
          :not-allowed="
            !!mine.slots.value[i]!.species && !reg.isAllowed(mine.slots.value[i]!.species)
          "
          :preview-inline="pvInline"
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
const gd = useGameData()
const fit = useFitLayout()
const auto = useAutoSet()

// 같은 파티 안에서 포켓몬/도구 중복 금지 (다른 슬롯에서 쓴 값 제외)
const others = (i: number, key: 'species' | 'item') =>
  mine.slots.value
    .filter((_, j) => j !== i)
    .map((s) => s[key])
    .filter(Boolean)

// ── 결정력 미리보기 조건 펼치기 ─────────────
// 넓은 화면 한 화면 배치에서 카드 아래에 남는 공간이 펼친 조건 높이보다 크면 카드 안에 펼친다 (작은 화면은 지금처럼 팝오버).
// 펼친 상태에서도 "접었을 때의 카드 높이"(= 지금 높이 − 펼쳐서 늘어난 만큼)로 판단해서 펼침/접힘이 번갈아 바뀌지 않게 한다.
const bodyEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const pvInline = ref(false)
const pvHeight = { collapsed: 0, inline: 0 } // 조건 영역(.preview) 높이 실측값
const PV_EXTRA_GUESS = 150 // 아직 펼쳐 본 적이 없을 때 늘어날 높이 추정
const measurePreview = () => {
  const body = bodyEl.value
  const grid = gridEl.value
  if (!fit.value || !body || !grid) {
    pvInline.value = false
    return
  }
  const pv = grid.querySelector<HTMLElement>('.preview')
  if (pv) pvHeight[pvInline.value ? 'inline' : 'collapsed'] = pv.offsetHeight
  const extra =
    pvHeight.inline && pvHeight.collapsed ? pvHeight.inline - pvHeight.collapsed : PV_EXTRA_GUESS
  const collapsedGrid = grid.offsetHeight - (pvInline.value ? extra : 0)
  pvInline.value = body.clientHeight - collapsedGrid >= extra + 8
}
let ro: ResizeObserver | null = null
let raf = 0
const schedule = () => {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(measurePreview)
}
onMounted(() => {
  ro = new ResizeObserver(schedule)
  watch(
    [bodyEl, gridEl],
    ([b, g], old) => {
      for (const el of old ?? []) if (el) ro?.unobserve(el)
      if (b) ro?.observe(b)
      if (g) ro?.observe(g)
      schedule()
    },
    { immediate: true },
  )
})
watch(fit, schedule)
onBeforeUnmount(() => {
  ro?.disconnect()
  cancelAnimationFrame(raf)
})

// 빈 슬롯을 통계로 채움 (슬롯 객체를 통째로 바꿈 → SlotEditor 가 포켓몬 변경으로 보고 초기화하지 않음)
const fillByUsage = async () => {
  await auto.ready()
  for (const [i, slot] of auto.suggest(mine.slots.value)) {
    mine.slots.value[i] = slot
    mine.megaOn.value[i] = true
    mine.altOn.value[i] = null
  }
}

const onReset = () => {
  if (window.confirm(t('party.resetConfirm'))) mine.reset()
}
const genderNames = computed(() =>
  mine.missingGender.value.map((i) => gd.name('pokemon', mine.slots.value[i]!.species)).join(', '),
)
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
.sub-stack {
  display: grid;
}
.sub-stack > span {
  grid-area: 1 / 1;
}
.sub-stack > .off {
  visibility: hidden;
}
.ready {
  color: var(--good);
  font-weight: 600;
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
