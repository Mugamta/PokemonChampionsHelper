<!-- 데미지 표 한 칸: 데미지 범위 + % + 확정/난수 N타 (또는 연속기 KO 타수)
     + 실전 KO 확률(명중·급소·변덕레이저 포함, 마우스를 올리면 명중률·급소율) -->
<template>
  <div v-if="cell" class="dcell" :class="{ compact }">
    <template v-if="cell.immune">
      <span class="muted">{{ t('common.immune') }}</span>
    </template>
    <template v-else>
      <span class="dmg" :class="{ 'dmg-lethal': cell.lethal }">{{ cell.min }}~{{ cell.max }}</span>
      <span class="dmg-pct num">{{ pct(cell.pctMin) }}~{{ pct(cell.pctMax) }}%</span>
      <span
        v-if="koText"
        class="ko-tag"
        :class="{ sure: cell.ko?.guaranteed && cell.ko.hits === 1 }"
        >{{ koText }}</span
      >
      <span v-if="realText" class="real" :title="realHint">{{ realText }}</span>
      <span v-else-if="cell.hitChance < 1" class="muted hits">{{
        t('battle.acc', { p: pctInt(cell.hitChance) })
      }}</span>
      <span v-if="cell.fickle" class="muted hits">{{ t('battle.fickle') }}</span>
      <span v-if="cell.hits" class="muted hits">{{ hitsText }}</span>
      <span v-if="cell.disguise" class="muted hits" :title="t('battle.disguiseHint')">{{
        t('battle.disguise')
      }}</span>
      <!-- 확정 전 상대 도구의 추측을 지녔다면 (본 결과에는 넣지 않음) -->
      <span v-if="guessText" class="muted hits" :title="t('battle.guessHint')">{{
        guessText
      }}</span>
      <span v-if="cell.sub" class="muted hits" :title="t('battle.subHint', { hp: cell.sub.hp })">{{
        t('battle.subCell', { hp: cell.sub.hp })
      }}</span>
      <span
        v-if="showEff && cell.effectiveness !== 1"
        class="eff"
        :class="cell.effectiveness > 1 ? 'up' : 'down'"
        >×{{ cell.effectiveness }}</span
      >
    </template>
  </div>
  <span v-else class="muted">-</span>
</template>

<script setup lang="ts">
import type { Cell, CellGuess } from '~/composables/useTeamCalc'
import { pct } from '~/composables/useTeamCalc'

const props = defineProps<{ cell: Cell | null; compact?: boolean; showEff?: boolean }>()
const { t } = useI18n()
const gd = useGameData()

// 확정/난수 N타 (연속기는 KO 타수)
const koLabel = (c: Pick<Cell, 'ko' | 'koHit'>) => {
  if (c.koHit) {
    if (c.koHit.worst === c.koHit.best) return t('battle.multiHit.koAt', { n: c.koHit.best })
    if (c.koHit.worst)
      return t('battle.multiHit.koRange', { min: c.koHit.best, max: c.koHit.worst })
    return t('battle.multiHit.koFrom', { n: c.koHit.best })
  }
  if (!c.ko) return ''
  return c.ko.guaranteed
    ? t('battle.ko.sure', { n: c.ko.hits })
    : t('battle.ko.chance', {
        n: c.ko.hits,
        p: c.ko.percent < 0.1 ? '<0.1' : c.ko.percent.toFixed(1),
      })
}
const koText = computed(() => (props.cell ? koLabel(props.cell) : ''))
const guessText = computed(() => {
  const g: CellGuess | null | undefined = props.cell?.guess
  if (!g) return ''
  const ko = koLabel(g)
  return (
    t('battle.guessCell', {
      item: gd.name('items', g.item),
      pmin: pct(g.pctMin),
      pmax: pct(g.pctMax),
    }) + (ko ? ` · ${ko}` : '')
  )
})
// 실전 KO: 명중이나 급소·무작위 위력 때문에 확률이 달라질 때만
const pctInt = (v: number) => Number((v * 100).toFixed(v < 0.1 ? 1 : 0))
const realText = computed(() => {
  const c = props.cell
  if (!c || c.koReal == null || !c.ko) return ''
  if (Math.abs(c.koReal - c.ko.percent) < 0.05) return ''
  return t('battle.ko.real', {
    p: c.koReal >= 99.95 ? '100' : c.koReal < 0.1 ? '<0.1' : c.koReal.toFixed(1),
  })
})
const realHint = computed(() => {
  const c = props.cell
  if (!c) return ''
  return (
    t('battle.ko.realHint', {
      n: c.ko?.hits ?? 1,
      acc: pctInt(c.hitChance),
      crit: pctInt(c.critChance),
    }) + (c.fickle ? ` · ${t('battle.fickle')}` : '')
  )
})
const hitsText = computed(() => {
  const h = props.cell?.hits
  if (!h) return ''
  return h.min === h.max
    ? t('battle.multiHit.fixed', { n: h.min })
    : t('battle.multiHit.range', { min: h.min, max: h.max })
})
</script>

<style scoped>
.real {
  font-size: 10px;
  font-weight: 700;
  color: var(--warn);
  cursor: help;
}
.dcell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  line-height: 1.25;
}
.dcell.compact {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 6px;
}
.dmg {
  font-size: 14px;
}
.dmg-pct {
  font-size: 12px;
}
.hits {
  font-size: 11px;
}
.eff {
  font-size: 10px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 4px;
}
.eff.up {
  color: var(--good);
}
.eff.down {
  color: var(--text-3);
}
</style>
