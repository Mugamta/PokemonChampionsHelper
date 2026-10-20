<!--
  결정력 미리보기 조건 (날씨 / 필드 / 상태이상 / 공격·특공 랭크). 파티 카드에서 팝오버 안 또는 카드 안(inline)에 그대로 쓴다.
  inline: 카드 폭이 좁아서 이름표를 위에, 칩을 작게, 필드는 짧은 이름(이름표가 "필드"라서). 칩마다 전체 이름은 title 로
-->
<template>
  <div class="pv" :class="{ inline }">
    <div class="pv-group">
      <span class="pv-label">{{ t('weather.label') }}</span>
      <!-- 4칸 격자: 쾌청/큰가뭄, 비/폭우, 모래바람/난기류가 같은 세로줄 -->
      <div class="chip-row weather-grid">
        <button
          v-for="w in WEATHERS"
          :key="w"
          type="button"
          class="chip"
          :class="{ active: weather === w }"
          :title="inline ? t('weather.' + w) : undefined"
          @click="weather = weather === w ? '' : w"
        >
          {{ t('weather.' + w) }}
        </button>
      </div>
    </div>
    <div class="pv-group">
      <span class="pv-label">{{ t('terrain.label') }}</span>
      <div class="chip-row" :class="{ 'terrain-grid': inline }">
        <button
          v-for="tr in TERRAINS"
          :key="tr"
          type="button"
          class="chip"
          :class="{ active: terrain === tr }"
          :title="inline ? t('terrain.' + tr) : undefined"
          @click="terrain = terrain === tr ? '' : tr"
        >
          {{ t((inline ? 'terrain.short.' : 'terrain.') + tr) }}
        </button>
      </div>
    </div>
    <div class="pv-group">
      <span class="pv-label">{{ t('party.previewStatus') }}</span>
      <div class="chip-row">
        <button
          v-for="s in ['brn', 'par'] as const"
          :key="s"
          type="button"
          class="chip warn"
          :class="{ active: status === s }"
          @click="status = status === s ? '' : s"
        >
          {{ t('status.' + s) }}
        </button>
      </div>
    </div>
    <div class="pv-group">
      <span class="pv-label">{{ t('party.previewRank') }}</span>
      <div class="ranks">
        <span v-for="k in RANK_KEYS" :key="k" class="rank" :class="{ on: ranks[k] !== 0 }">
          <span class="rank-name">{{ t('stat.' + k) }}</span>
          <button type="button" class="rb" :disabled="ranks[k] <= -6" @click="step(k, -1)">
            −
          </button>
          <span class="rank-val num">{{ ranks[k] > 0 ? '+' : '' }}{{ ranks[k] }}</span>
          <button type="button" class="rb" :disabled="ranks[k] >= 6" @click="step(k, 1)">+</button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Status, Terrain, Weather } from '~/utils/types'

defineProps<{ inline?: boolean }>()
const weather = defineModel<Weather>('weather', { required: true })
const terrain = defineModel<Terrain>('terrain', { required: true })
const status = defineModel<Status>('status', { required: true })
// 공격·특공 랭크 (−6 ~ +6). 바디프레스는 방어를 쓰므로 영향 없음
const ranks = defineModel<{ atk: number; spa: number }>('ranks', { required: true })
const RANK_KEYS = ['atk', 'spa'] as const
const step = (k: (typeof RANK_KEYS)[number], d: number) =>
  (ranks.value = { ...ranks.value, [k]: Math.max(-6, Math.min(6, ranks.value[k] + d)) })
const { t } = useI18n()

const WEATHERS: Weather[] = ['sun', 'rain', 'sand', 'snow', 'harshsun', 'heavyrain', 'strongwinds']
const TERRAINS: Terrain[] = ['electric', 'grassy', 'misty', 'psychic']
</script>

<style scoped>
.pv {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* 조건 묶음: 왼쪽 이름표 + 칩 */
.pv-group {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}
.weather-grid {
  display: grid;
  grid-template-columns: repeat(4, max-content);
}
.pv-label {
  padding-top: 5px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
}
/* 랭크: 공격 [−] +2 [+]  특공 [−] 0 [+] */
.ranks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.rank {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--text-2);
}
.rank-name {
  font-weight: 700;
  margin-right: 2px;
}
.rank-val {
  min-width: 22px;
  text-align: center;
  font-weight: 800;
}
.rank.on .rank-val {
  color: var(--accent-2);
}
.rb {
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid var(--line-strong);
  background: var(--faint);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.rb:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
/* 카드 안: 이름표를 칩 위에, 칩을 작게, 날씨는 4칸이 카드 폭에 맞게 */
.inline {
  gap: 5px;
}
.inline .pv-group {
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
}
.inline .pv-label {
  padding-top: 0;
  font-size: 10px;
}
.inline .chip-row {
  gap: 3px;
}
/* 4칸: 글자 길이만큼, 카드보다 넓으면 그때만 줄어듦 (잘린 이름은 title 로) */
.inline .weather-grid,
.inline .terrain-grid {
  display: grid;
  grid-template-columns: repeat(4, auto);
  justify-content: start;
}
.inline .chip {
  min-width: 0;
  padding: 2px 5px;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
