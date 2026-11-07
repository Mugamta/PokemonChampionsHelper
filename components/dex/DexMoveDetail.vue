<!--
  기술 도감 상세: 기술 하나의 타입·분류·위력·명중·PP·우선도·대상·성질(접촉 등)·설명·부가효과와
  배우는 포켓몬(현재 레귤레이션 출전 가능, 사용률 통계에서 이 기술을 넣은 비율 순).
  포켓몬을 누르면 포켓몬 탭으로. 문구: utils/moveInfo.ts
-->
<template>
  <div class="dex-detail">
    <section class="panel panel-pad head">
      <div class="name-row">
        <h2 class="name">{{ gd.name('moves', move.id) }}</h2>
        <UiTypeBadge :type="move.type" />
        <UiCategoryBadge :category="move.category" />
      </div>
      <dl class="spec">
        <div>
          <dt>{{ t('common.power') }}</dt>
          <dd class="num">{{ move.power || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('common.accuracy') }}</dt>
          <dd class="num">
            {{
              !hasAccuracyCol(move)
                ? '—'
                : move.accuracy == null
                  ? t('dex.neverMiss')
                  : move.accuracy
            }}
          </dd>
        </div>
        <div>
          <dt>{{ t('common.pp') }}</dt>
          <dd class="num">{{ move.pp }}</dd>
        </div>
        <div>
          <dt>{{ t('common.priority') }}</dt>
          <dd class="num">{{ move.priority > 0 ? '+' + move.priority : move.priority }}</dd>
        </div>
        <div class="wide">
          <dt>{{ t('dex.mv.target') }}</dt>
          <dd>{{ t('dex.mv.targets.' + move.target) }}</dd>
        </div>
      </dl>
      <p v-if="desc" class="desc">{{ desc }}</p>
    </section>

    <section class="panel panel-pad">
      <h3 class="panel-title">{{ t('dex.mv.effects') }}</h3>
      <ul v-if="effects.length" class="fx">
        <li v-for="(e, i) in effects" :key="i">{{ e }}</li>
      </ul>
      <p v-else class="muted small">{{ t('dex.mv.noEffects') }}</p>
      <template v-if="flags.length">
        <span class="section-label">{{ t('dex.mv.flags') }}</span>
        <div class="flags">
          <span v-for="f in flags" :key="f" class="flag" :title="flagHint(f)">{{
            t('dex.mv.flag.' + f)
          }}</span>
        </div>
      </template>
    </section>

    <section class="panel panel-pad">
      <h3 class="panel-title">
        {{ t('dex.mv.learners') }}
        <span class="spacer" />
        <TeamUsageKindToggle />
        <span class="muted small">{{ t('dex.mv.count', { n: learnerRows.length }) }}</span>
      </h3>
      <div v-if="learnerRows.length" class="learners">
        <NuxtLink
          v-for="row in learnerRows"
          :key="row.id"
          class="learner"
          :to="{ query: { id: row.id } }"
        >
          <UiPokeSprite :id="row.id" :size="32" />
          <span class="nm">{{ gd.name('pokemon', row.id) }}</span>
          <span v-if="row.use != null" class="use num">{{ (row.use * 100).toFixed(1) }}%</span>
        </NuxtLink>
      </div>
      <p v-else class="muted small">{{ t('dex.mv.noLearners') }}</p>
      <p v-if="usageTable" class="note muted">
        {{ t('dex.mv.learnersNote', { reg: usageTable.reg, month: usageTable.month }) }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useUsageKind } from '~/composables/useUsageKind'
import { pickUsageTable } from '~/utils/autoSet'
import { effectLabels, FLAG_RELATED, hasAccuracyCol, shownFlags } from '~/utils/moveInfo'
import type { Move } from '~/utils/types'

const props = defineProps<{ move: Move; learners: string[] }>()
const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()

const desc = computed(() => gd.text('moves', props.move.id))
const effects = computed(() => effectLabels(props.move, t, (id) => gd.name('moves', id)))
const flags = computed(() => shownFlags(props.move))
// 툴팁: 성질 설명 + 반응하는 특성·도구 (현재 데이터에 있는 것만)
const flagHint = (f: string) => {
  const d = gd.data.value
  const names = (FLAG_RELATED[f] ?? [])
    .filter((x) => d?.[x.kind]?.[x.id])
    .map((x) => gd.name(x.kind, x.id))
  const hint = t('dex.mv.flagHint.' + f)
  return names.length ? t('dex.mv.related', { hint, names: names.join(', ') }) : hint
}

// 사용률 통계 (현재 레귤레이션, 없으면 가장 최근 달)
const kind = useUsageKind()
const usageTable = computed(() => {
  const p = pickUsageTable(gd.usageMeta(kind.value), reg.active.value?.id)
  const table = p && gd.usageTable(kind.value, p.reg)
  return table ? { reg: p.reg, month: table.month, pokemon: table.pokemon } : null
})
// 이 기술을 넣은 비율 순 (통계에 없으면 도감 번호 순 — learners 가 이미 번호 순)
const learnerRows = computed(() => {
  const pk = usageTable.value?.pokemon
  return props.learners
    .map((id, i) => ({ id, i, use: pk?.[id]?.moveUsage?.[props.move.id] ?? null }))
    .sort((a, b) => (b.use ?? -1) - (a.use ?? -1) || a.i - b.i)
})
</script>

<style scoped>
.dex-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.head {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 24px;
}
.spec {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0;
}
.spec div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.spec dt {
  font-size: 11px;
  color: var(--text-3);
}
.spec dd {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
}
.spec .wide dd {
  font-size: 14px;
  font-weight: 700;
  padding-top: 3px;
}
.desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-2);
}
.fx {
  margin: 0 0 10px;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.7;
}
.flags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin-top: 4px;
}
.flag {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  color: var(--text-2);
  font-size: 12px;
  cursor: help;
}
.learners {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 2px 8px;
}
.learner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}
.learner:hover {
  background: var(--hover);
}
.nm {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.use {
  font-size: 12px;
  color: var(--accent-2);
  font-weight: 700;
}
.note {
  margin: 8px 0 0;
  font-size: 11px;
}
.small {
  font-size: 12px;
}
</style>
