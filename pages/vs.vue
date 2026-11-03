<!--
  VS: 두 포켓몬을 양쪽에 두고 서로를 공격한 결과를 바로 비교하는 1:1 계산기.
  포켓몬·특성·기술은 현재 레귤레이션에서 쓸 수 있는 것만. 상태·계산: composables/useVs.ts
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('vs.title') }}</h1>
        <p class="page-sub">{{ t('vs.sub') }}</p>
      </div>
      <div class="head-actions">
        <button type="button" class="btn btn-sm" @click="vs.swap()">⇄ {{ t('vs.swap') }}</button>
        <button type="button" class="btn btn-sm btn-danger" @click="onReset">
          {{ t('common.reset') }}
        </button>
      </div>
    </div>

    <div class="vs-layout">
      <VsMonPanel side="left" class="mon fit-scroll" />

      <div class="center fit-scroll">
        <div class="results">
          <VsResultCard
            from="left"
            :attacker="vs.left.value"
            :defender="vs.right.value"
            :result="vs.leftToRight.value"
          />
          <VsResultCard
            from="right"
            :attacker="vs.right.value"
            :defender="vs.left.value"
            :result="vs.rightToLeft.value"
          />
          <p v-if="speed" class="speed">
            <span class="section-label">{{ t('stat.spe') }}</span>
            <b class="num left-c">{{ speed.left }}</b>
            <span class="muted">:</span>
            <b class="num right-c">{{ speed.right }}</b>
            <span class="speed-order">{{ orderText }}</span>
          </p>
        </div>

        <section class="panel panel-pad shared">
          <h2 class="panel-title">{{ t('vs.shared') }}</h2>
          <div class="row">
            <span class="section-label">{{ t('weather.label') }}</span>
            <div class="chip-row">
              <button
                v-for="w in WEATHERS"
                :key="w"
                type="button"
                class="chip"
                :class="{ active: field.weather === w }"
                @click="field.weather = field.weather === w ? '' : w"
              >
                {{ t('weather.' + w) }}
              </button>
            </div>
          </div>
          <div class="row">
            <span class="section-label">{{ t('terrain.label') }}</span>
            <div class="chip-row">
              <button
                v-for="tr in TERRAINS"
                :key="tr"
                type="button"
                class="chip"
                :class="{ active: field.terrain === tr }"
                @click="field.terrain = field.terrain === tr ? '' : tr"
              >
                {{ t('terrain.' + tr) }}
              </button>
            </div>
          </div>
          <div class="row">
            <span class="section-label">{{ t('room.label') }}</span>
            <div class="chip-row">
              <button
                v-for="rm in ROOM_KEYS"
                :key="rm"
                type="button"
                class="chip"
                :class="{ active: field.rooms[rm] }"
                @click="field.rooms[rm] = !field.rooms[rm]"
              >
                {{ t('room.' + rm) }}
              </button>
            </div>
          </div>
          <div class="row">
            <span class="section-label">{{ t('vs.format') }}</span>
            <div class="chip-row">
              <button
                type="button"
                class="chip"
                :class="{ active: !field.doubles }"
                @click="field.doubles = false"
              >
                {{ t('nav.single') }}
              </button>
              <button
                type="button"
                class="chip"
                :class="{ active: field.doubles }"
                :title="t('vs.doubleHint')"
                @click="field.doubles = true"
              >
                {{ t('nav.double') }}
              </button>
            </div>
          </div>
        </section>
      </div>

      <VsMonPanel side="right" class="mon fit-scroll" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVs } from '~/composables/useVs'
import { ROOMS } from '~/utils/battleState'
import type { Terrain, Weather } from '~/utils/types'
import type { VsField } from '~/utils/vs'

definePageMeta({ fit: true })

const { t } = useI18n()
const gd = useGameData()
const vs = useVs()

const WEATHERS: Weather[] = ['sun', 'rain', 'sand', 'snow', 'harshsun', 'heavyrain', 'strongwinds']
const TERRAINS: Terrain[] = ['electric', 'grassy', 'misty', 'psychic']

const ROOM_KEYS = ROOMS as (keyof VsField['rooms'])[]

const field = computed(() => vs.state.value.field)
const speed = computed(() => vs.speed.value)
const orderText = computed(() => {
  const s = speed.value
  if (!s) return ''
  if (!s.first) return t('vs.order.tie')
  const r = vs.resolved(s.first)
  return t('vs.order.' + s.reason, { name: r ? gd.name('pokemon', r.species.id) : '' })
})

const onReset = () => {
  if (window.confirm(t('vs.resetConfirm'))) vs.reset()
}
</script>

<style scoped>
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.vs-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}
/* 좁은 화면: 결과 → 양쪽 포켓몬 → 공용 상태 순서 (입력하면서 결과를 위에서 확인) */
.center {
  display: contents;
}
.results {
  grid-column: 1 / -1;
  order: -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.speed {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  padding: 8px 12px;
  background: var(--well);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-size: 14px;
}
.left-c {
  color: var(--mine);
}
.right-c {
  color: var(--opp);
}
.speed-order {
  margin-left: auto;
  font-weight: 700;
  font-size: 13px;
}
.shared {
  grid-column: 1 / -1;
  order: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.panel-title {
  margin: 0;
}
@media (max-width: 760px) {
  .vs-layout,
  .results {
    grid-template-columns: minmax(0, 1fr);
  }
}
/* 넓은 화면: 왼쪽 포켓몬 | 결과 + 공용 상태 | 오른쪽 포켓몬 */
@media (min-width: 1400px) {
  .vs-layout {
    grid-template-columns: minmax(0, 1fr) minmax(440px, 0.85fr) minmax(0, 1fr);
    max-width: 1960px;
    width: 100%;
    margin: 0 auto;
  }
  .center {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .results {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (min-width: 1400px) and (min-height: 700px) {
  .vs-layout {
    flex: 1;
    min-height: 0;
    align-items: stretch;
  }
  .mon {
    align-self: start;
    max-height: 100%;
  }
}
</style>
