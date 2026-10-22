<!-- 첫 화면 사용률 상위 6마리: 통계 자료 월·레귤레이션, 채용률, 가장 많이 쓴 도구·배분·기술(+결정력) -->
<template>
  <div v-if="picked" class="usage-top">
    <div class="ut-head">
      <span class="section-label">{{ t('home.usageTitle', { n: top.length }) }}</span>
      <TeamUsageKindToggle />
      <span class="ut-meta">
        {{ t('usage.' + kind) }} ·
        {{
          t('home.usageMeta', {
            reg: picked!.reg,
            month: picked!.table.month,
            battles: picked!.table.battles.toLocaleString(),
          })
        }}
        · <a href="https://www.smogon.com/stats/" target="_blank" rel="noopener">Smogon</a>
      </span>
    </div>
    <div class="ut-grid">
      <div
        v-for="(u, i) in top"
        :key="u.id"
        class="ut-mon float"
        :style="{ animationDelay: `${i * 0.35}s` }"
      >
        <UiPokeSprite :id="u.id" :size="i % 3 === 0 ? 96 : 84" />
        <span class="ut-name">
          <span class="ut-rank num">{{ i + 1 }}</span> {{ gd.name('pokemon', u.id) }}
        </span>
        <span class="ut-usage num">{{ pctText(u.usage) }}</span>

        <span v-if="u.item" class="ut-row" :title="t('home.usageItem')">
          <UiItemIcon :id="u.item" :size="18" />
          <span :class="{ 'ut-boost': u.scarf || u.vest }">{{ gd.name('items', u.item) }}</span>
          <span class="ut-pct num">{{ pctText(u.itemShare) }}</span>
        </span>
        <span v-if="u.nature" class="ut-row" :title="t('home.usageSpread')">
          <b>{{ gd.name('natures', u.nature) }}</b>
          <span class="num">{{ spText(u.sp) }}</span>
          <span class="ut-pct num">{{ pctText(u.spreadShare) }}</span>
        </span>
        <span v-if="u.stats" class="ut-row ut-stats">
          {{ t('stat.physBulk') }} <b class="num">{{ u.stats.phys.toLocaleString() }}</b>
          {{ t('stat.specBulk') }}
          <b class="num" :class="{ 'ut-boost': u.vest }">{{ u.stats.spec.toLocaleString() }}</b>
          {{ t('stat.spe') }} <b class="num" :class="{ 'ut-boost': u.scarf }">{{ u.stats.spe }}</b>
        </span>
        <span v-if="u.move" class="ut-row" :title="t('home.usageMove')">
          <b>{{ gd.name('moves', u.move) }}</b>
          <span class="ut-pct num">{{ pctText(u.moveShare) }}</span>
          <template v-if="u.power">
            · {{ t('common.decisive') }} <b class="num">{{ u.power.toLocaleString() }}</b>
          </template>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUsageKind } from '~/composables/useUsageKind'
import { pickUsageTable, topUsage } from '~/utils/autoSet'
import { bulkIndex } from '~/utils/perfTable'
import { effectiveSpeed } from '~/utils/stats'
import { STAT_KEYS, emptySlot, type StatTable, type TeamSlot } from '~/utils/types'

const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const calc = useTeamCalc()

// 현재 레귤레이션의 통계, 없으면 가장 최근 달 자료
const kind = useUsageKind()
const picked = computed(() =>
  pickUsageTable(gd.data.value?.usage?.[kind.value], reg.active.value?.id),
)

const top = computed(() => {
  const p = picked.value
  if (!p) return []
  return topUsage(p.table, 6)
    .filter((u) => gd.pokemon(u.id))
    .map((u) => {
      const form = gd.pokemon(u.id)!
      // 슬롯은 원종 id + 메가스톤 (메가 폼은 도구로 결정), 배틀 폼(블레이드폼 등)도 원종으로
      const species = form.mega?.from ?? form.battleForm?.from ?? u.id
      const item = form.mega?.item ?? u.items[0] ?? ''
      const move = u.moves[0] ?? ''
      const sp = u.sp ?? []
      const slot: TeamSlot = {
        ...emptySlot(),
        species,
        item,
        ability: form.mega ? '' : u.ability,
        nature: u.nature ?? '',
        sp: Object.fromEntries(STAT_KEYS.map((k, j) => [k, sp[j] ?? 0])) as StatTable,
        moves: [move, '', '', ''],
      }
      const r = calc.resolve(slot)
      // 구애스카프·돌격조끼는 빨간색으로, 스피드·특수내구에 1.5배 반영
      const scarf = item === 'choicescarf'
      const vest = item === 'assaultvest'
      return {
        id: u.id,
        usage: u.usage,
        item: u.items[0] ?? '',
        itemShare: u.itemShare?.[0],
        scarf,
        vest,
        nature: u.nature,
        sp: u.sp,
        spreadShare: u.spreadShare,
        move,
        moveShare: u.moveShare?.[0],
        // 이 배분의 물리내구·특수내구 (H × 방어(특방) ÷ 0.411)·스피드 실능치 (메가 폼 기준, 도구 반영)
        stats: r && {
          phys: bulkIndex(r.stats.hp, r.stats.def),
          spec: bulkIndex(r.stats.hp, vest ? Math.floor(r.stats.spd * 1.5) : r.stats.spd),
          spe: scarf ? effectiveSpeed(r.stats.spe, { item }) : r.stats.spe,
        },
        power: move ? calc.power(r, move) : null,
      }
    })
})

const pctText = (v?: number) => (v == null ? '' : `${(v * 100).toFixed(1)}%`)
// 0 이 아닌 능력 포인트만 (예: H2 A32 S32)
const spText = (sp?: number[]) =>
  (sp ?? [])
    .map((v, j) => (v ? `${t('stat.short.' + STAT_KEYS[j])}${v}` : ''))
    .filter(Boolean)
    .join(' ')
</script>

<style scoped>
.usage-top {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.ut-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 4px 10px;
  text-align: center;
}
.ut-meta {
  font-size: 12px;
  color: var(--text-3);
}
.ut-meta a {
  color: var(--text-2);
}
.ut-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 8px;
}
/* 배경 없이 떠다니는 포켓몬 + 아래에 통계 */
.ut-mon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 0;
  text-align: center;
}
.float {
  animation: bob 3.2s ease-in-out infinite;
}
@keyframes bob {
  50% {
    transform: translateY(-8px);
  }
}
.ut-name {
  font-weight: 800;
  font-size: 14px;
  line-height: 1.25;
}
.ut-rank {
  font-family: var(--font-display);
  color: var(--accent-text);
}
.ut-usage {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
  line-height: 1.1;
  color: var(--accent-text);
}
.ut-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0 5px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-2);
}
.ut-row b {
  color: var(--text);
}
.ut-row .ut-boost {
  color: var(--bad);
}
.ut-pct {
  color: var(--text-3);
}

@media (prefers-reduced-motion: reduce) {
  .float {
    animation: none;
  }
}
@media (max-width: 600px) {
  .ut-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ut-row {
    font-size: 11px;
  }
}
</style>
