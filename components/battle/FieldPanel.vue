<!--
  필드 상태: 날씨 / 필드 / 공간 + 양 진영 상태(벽·순풍·설치기)
  part: all = 전부 (좁은 화면) / global = 날씨·필드·공간만 가로 배치 (넓은 화면 가운데 위)
        mine·opp = 그 진영 상태만 (넓은 화면 양쪽 열)
-->
<template>
  <section class="panel panel-pad field" :class="'part-' + part">
    <h3 class="panel-title">
      {{ title }}
      <span class="spacer" />
      <span v-if="showGlobal" class="turn num">{{ t('battle.turn', { n: s.turn }) }}</span>
    </h3>

    <div v-if="showGlobal" class="globals">
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
          >
            {{ t('weather.' + w) }}
          </button>
          <BattleTurnCounter
            v-if="s.weather.key"
            :counter="s.weather"
            :infinite="s.weather.permanent"
            @adjust="(d) => b.adjustCounter(s.weather, d)"
          />
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
            :class="{ active: s.terrain.key === tr }"
            @click="b.toggleTerrain(tr)"
          >
            {{ t('terrain.' + tr) }}
          </button>
          <BattleTurnCounter
            v-if="s.terrain.key"
            :counter="s.terrain"
            @adjust="(d) => b.adjustCounter(s.terrain, d)"
          />
        </div>
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
            {{ t('room.' + rm)
            }}<template v-if="s.rooms[rm]">
              {{ s.rooms[rm]!.cur }}/{{ s.rooms[rm]!.total }}</template
            >
          </button>
        </div>
      </div>
    </div>

    <div v-for="side in sides" :key="side" class="row">
      <span v-if="part === 'all'" class="section-label side-label" :class="side">{{
        t(side === 'mine' ? 'battle.mySide' : 'battle.oppSide')
      }}</span>
      <div class="chip-row">
        <button
          v-for="c in SIDE_CONDITIONS"
          :key="c"
          type="button"
          class="chip"
          :class="{ active: !!s.sides[side].screens[c] || !!s.sides[side].hazards[c] }"
          @click="b.toggleSideCondition(side, c)"
        >
          {{ t('side.' + c)
          }}<template v-if="s.sides[side].screens[c]">
            {{ s.sides[side].screens[c]!.cur }}/{{ s.sides[side].screens[c]!.total }}</template
          ><template v-else-if="(s.sides[side].hazards[c] || 0) > 1">
            ×{{ s.sides[side].hazards[c] }}</template
          >
        </button>
      </div>
    </div>

    <p v-if="showGlobal && s.fairyLock > 0" class="warn-text small">
      {{ t('battle.fairyLock', { n: s.fairyLock }) }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { ROOMS, type BattleSide, type useBattle } from '~/composables/useBattle'
import type { Terrain, Weather } from '~/utils/types'

const props = withDefaults(
  defineProps<{ b: ReturnType<typeof useBattle>; part?: 'all' | 'global' | BattleSide }>(),
  { part: 'all' },
)
const { t } = useI18n()
const s = computed(() => props.b.state.value!)
const showGlobal = computed(() => props.part === 'all' || props.part === 'global')
const sides = computed<BattleSide[]>(() =>
  props.part === 'all' ? ['mine', 'opp'] : props.part === 'global' ? [] : [props.part],
)
const title = computed(() =>
  props.part === 'mine'
    ? t('battle.mySide')
    : props.part === 'opp'
      ? t('battle.oppSide')
      : t('battle.field'),
)
const WEATHERS: Weather[] = ['sun', 'rain', 'sand', 'snow', 'harshsun', 'heavyrain', 'strongwinds']
const TERRAINS: Terrain[] = ['electric', 'grassy', 'misty', 'psychic']
const SIDE_CONDITIONS = [
  'reflect',
  'lightscreen',
  'auroraveil',
  'tailwind',
  'safeguard',
  'stealthrock',
  'spikes',
  'toxicspikes',
  'stickyweb',
]
</script>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.panel-title {
  margin: 0;
}
.turn {
  font-size: 13px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--panel-3);
  color: var(--text);
}
.globals {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.side-label.mine {
  color: var(--mine);
}
.side-label.opp {
  color: var(--opp);
}
/* 진영 패널: 제목에 진영 색 */
.part-mine .panel-title {
  color: var(--mine);
}
.part-opp .panel-title {
  color: var(--opp);
}
/* 가운데 위 (넓은 화면): 날씨 / 필드 / 공간을 이름표 + 칩 한 줄씩, 줄을 맞춰 좁게 */
.part-global {
  gap: 6px;
  padding-top: 10px;
  padding-bottom: 10px;
}
.part-global .globals {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 5px 12px;
  align-items: center;
}
.part-global .row {
  display: contents;
}
.small {
  font-size: 12px;
  margin: 0;
}
</style>
