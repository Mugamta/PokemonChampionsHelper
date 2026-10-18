<!-- 필드 상태: 날씨 / 필드 / 공간 / 양쪽 설치 효과 + 경과 턴 -->
<template>
  <section class="panel panel-pad field">
    <h3 class="panel-title">
      {{ t('battle.field') }}
      <span class="spacer" />
      <span class="turn num">{{ t('battle.turn', { n: s.turn }) }}</span>
    </h3>

    <div class="row">
      <span class="section-label">{{ t('weather.label') }}</span>
      <div class="chip-row">
        <button
          v-for="w in WEATHERS"
          :key="w"
          type="button"
          class="chip"
          :class="{ active: s.weather.key === w }"
          @click="b.toggleWeather(w)"
        >{{ t('weather.' + w) }}</button>
      </div>
      <BattleTurnCounter
        v-if="s.weather.key"
        :counter="s.weather"
        :infinite="s.weather.permanent"
        @adjust="(d) => b.adjustCounter(s.weather, d)"
      />
    </div>

    <div class="row">
      <span class="section-label">{{ t('terrain.label') }}</span>
      <div class="chip-row">
        <button
          v-for="tr in TERRAINS"
          :key="tr"
          type="button"
          class="chip"
          :class="{ active: s.terrain.key === tr }"
          @click="b.toggleTerrain(tr)"
        >{{ t('terrain.' + tr) }}</button>
      </div>
      <BattleTurnCounter
        v-if="s.terrain.key"
        :counter="s.terrain"
        @adjust="(d) => b.adjustCounter(s.terrain, d)"
      />
    </div>

    <div class="row">
      <span class="section-label">{{ t('room.label') }}</span>
      <div class="chip-row">
        <button
          v-for="rm in ROOMS"
          :key="rm"
          type="button"
          class="chip"
          :class="{ active: !!s.rooms[rm] }"
          @click="b.toggleRoom(rm)"
        >
          {{ t('room.' + rm) }}<template v-if="s.rooms[rm]"> {{ s.rooms[rm]!.cur }}/{{ s.rooms[rm]!.total }}</template>
        </button>
      </div>
    </div>

    <div
      v-for="side in (['mine', 'opp'] as const)"
      :key="side"
      class="row"
    >
      <span
        class="section-label side-label"
        :class="side"
      >{{ t(side === 'mine' ? 'battle.mySide' : 'battle.oppSide') }}</span>
      <div class="chip-row">
        <button
          v-for="c in SIDE_CONDITIONS"
          :key="c"
          type="button"
          class="chip"
          :class="{ active: !!s.sides[side].screens[c] || !!s.sides[side].hazards[c] }"
          @click="b.toggleSideCondition(side, c)"
        >
          {{ t('side.' + c) }}<template v-if="s.sides[side].screens[c]"> {{ s.sides[side].screens[c]!.cur }}/{{ s.sides[side].screens[c]!.total }}</template><template v-else-if="(s.sides[side].hazards[c] || 0) > 1"> ×{{ s.sides[side].hazards[c] }}</template>
        </button>
      </div>
    </div>

    <p
      v-if="s.fairyLock > 0"
      class="warn-text small"
    >
      {{ t('battle.fairyLock', { n: s.fairyLock }) }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { ROOMS, type useBattle } from '~/composables/useBattle'
import type { Terrain, Weather } from '~/utils/types'

const props = defineProps<{ b: ReturnType<typeof useBattle> }>()
const { t } = useI18n()
const s = computed(() => props.b.state.value!)
const WEATHERS: Weather[] = ['sun', 'rain', 'sand', 'snow', 'harshsun', 'heavyrain', 'strongwinds']
const TERRAINS: Terrain[] = ['electric', 'grassy', 'misty', 'psychic']
const SIDE_CONDITIONS = ['reflect', 'lightscreen', 'auroraveil', 'tailwind', 'safeguard', 'stealthrock', 'spikes', 'toxicspikes', 'stickyweb']
</script>

<style scoped>
.field { display: flex; flex-direction: column; gap: 10px; }
.panel-title { margin: 0; }
.turn {
  font-size: 13px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
}
.row { display: flex; flex-direction: column; gap: 5px; }
.side-label.mine { color: var(--mine); }
.side-label.opp { color: var(--opp); }
.small { font-size: 12px; margin: 0; }
</style>
