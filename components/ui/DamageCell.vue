<!-- 데미지 표 한 칸: 데미지 범위 + % + 확정/난수 N타 (또는 연속기 KO 타수) -->
<template>
  <div
    v-if="cell"
    class="dcell"
    :class="{ compact }"
  >
    <template v-if="cell.immune">
      <span class="muted">{{ t('common.immune') }}</span>
    </template>
    <template v-else>
      <span
        class="dmg"
        :class="{ 'dmg-lethal': cell.lethal }"
      >{{ cell.min }}~{{ cell.max }}</span>
      <span
        class="dmg-pct num"
        :class="{ 'dmg-lethal': cell.lethal }"
      >{{ pct(cell.pctMin) }}~{{ pct(cell.pctMax) }}%</span>
      <span
        v-if="koText"
        class="ko-tag"
        :class="{ sure: cell.ko?.guaranteed && cell.ko.hits === 1 }"
      >{{ koText }}</span>
      <span
        v-if="cell.hits"
        class="muted hits"
      >{{ hitsText }}</span>
      <span
        v-if="showEff && cell.effectiveness !== 1"
        class="eff"
        :class="cell.effectiveness > 1 ? 'up' : 'down'"
      >×{{ cell.effectiveness }}</span>
    </template>
  </div>
  <span
    v-else
    class="muted"
  >-</span>
</template>

<script setup lang="ts">
import type { Cell } from '~/composables/useTeamCalc'
import { pct } from '~/composables/useTeamCalc'

const props = defineProps<{ cell: Cell | null; compact?: boolean; showEff?: boolean }>()
const { t } = useI18n()

const koText = computed(() => {
  const c = props.cell
  if (!c) return ''
  if (c.koHit) {
    if (c.koHit.worst === c.koHit.best) return t('battle.multiHit.koAt', { n: c.koHit.best })
    if (c.koHit.worst) return t('battle.multiHit.koRange', { min: c.koHit.best, max: c.koHit.worst })
    return t('battle.multiHit.koFrom', { n: c.koHit.best })
  }
  if (!c.ko) return ''
  return c.ko.guaranteed ? t('battle.ko.sure', { n: c.ko.hits }) : t('battle.ko.chance', { n: c.ko.hits, p: c.ko.percent.toFixed(1) })
})
const hitsText = computed(() => {
  const h = props.cell?.hits
  if (!h) return ''
  return h.min === h.max ? t('battle.multiHit.fixed', { n: h.min }) : t('battle.multiHit.range', { min: h.min, max: h.max })
})
</script>

<style scoped>
.dcell { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; line-height: 1.25; }
.dcell.compact { flex-direction: row; flex-wrap: wrap; align-items: baseline; column-gap: 6px; }
.dmg { font-size: 14px; }
.dmg-pct { font-size: 12px; }
.hits { font-size: 11px; }
.eff { font-size: 10px; font-weight: 700; padding: 0 4px; border-radius: 4px; }
.eff.up { background: rgba(61, 220, 151, 0.18); color: var(--good); }
.eff.down { background: rgba(125, 136, 179, 0.18); color: var(--text-3); }
</style>
