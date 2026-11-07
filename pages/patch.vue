<!--
  패치 내역: 레귤레이션마다 직전 레귤레이션과 비교해 바뀐 출전 포켓몬·메가진화·도구·기술 수치·습득 기술·종족값.
  데이터는 레귤레이션별로 덮어쓴 게임 데이터(useGameData().dataFor)를 utils/regulationData.ts 의 diffRegulations 로 비교.
  기술·특성의 동작(수치가 아닌 효과) 변경은 데이터에 없어서 표시하지 않는다.
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('patch.title') }}</h1>
        <p class="page-sub">{{ t('patch.sub') }}</p>
      </div>
    </div>

    <UiPageLoading v-if="!gd.ready.value" />
    <div v-else class="patch-list">
      <section v-for="e in entries" :key="e.reg.id" class="panel panel-pad patch">
        <h2 class="panel-title">
          <span class="reg-id">{{ e.reg.id }}</span>
          <span v-if="e.reg.version" class="ver num">{{ e.reg.version }}</span>
          <span class="phase" :class="reg.phase(e.reg)">{{
            t('regulation.' + reg.phase(e.reg))
          }}</span>
          <span class="period num muted">{{
            t('regulation.period', { start: e.reg.start, end: e.reg.end })
          }}</span>
          <span class="spacer" />
          <button
            type="button"
            class="btn btn-sm"
            :class="{ 'btn-primary': reg.active.value?.id === e.reg.id }"
            :disabled="reg.active.value?.id === e.reg.id"
            @click="reg.selectedId.value = e.reg.id"
          >
            {{ reg.active.value?.id === e.reg.id ? t('patch.viewing') : t('patch.view') }}
          </button>
        </h2>

        <!-- 첫 레귤레이션: 비교 대상이 없어서 규모만 -->
        <p v-if="!e.diff" class="muted small">
          {{ t('patch.first', { pokemon: e.reg.pokemon.length, megas: e.megas, items: e.items }) }}
        </p>
        <p v-else-if="e.empty" class="muted small">{{ t('patch.noChange') }}</p>
        <template v-else-if="e.diff">
          <div v-if="e.diff.pokemonAdded.length || e.diff.pokemonRemoved.length" class="group">
            <h3 class="section-label">{{ t('patch.pokemon') }}</h3>
            <div v-if="e.diff.pokemonAdded.length" class="row">
              <span class="mark good-text">+{{ e.diff.pokemonAdded.length }}</span>
              <div class="mons">
                <span v-for="id in e.diff.pokemonAdded" :key="id" class="mon">
                  <UiPokeSprite :id="id" :size="28" />{{ gd.name('pokemon', id) }}
                </span>
              </div>
            </div>
            <div v-if="e.diff.pokemonRemoved.length" class="row">
              <span class="mark bad-text">−{{ e.diff.pokemonRemoved.length }}</span>
              <div class="mons">
                <span v-for="id in e.diff.pokemonRemoved" :key="id" class="mon">
                  <UiPokeSprite :id="id" :size="28" />{{ gd.name('pokemon', id) }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="e.diff.megasAdded.length || e.diff.megasRemoved.length" class="group">
            <h3 class="section-label">{{ t('common.mega') }}</h3>
            <div v-if="e.diff.megasAdded.length" class="row">
              <span class="mark good-text">+{{ e.diff.megasAdded.length }}</span>
              <div class="mons">
                <span v-for="id in e.diff.megasAdded" :key="id" class="mon">
                  <UiPokeSprite :id="id" :size="28" />{{ gd.name('pokemon', id) }}
                </span>
              </div>
            </div>
            <div v-if="e.diff.megasRemoved.length" class="row">
              <span class="mark bad-text">−{{ e.diff.megasRemoved.length }}</span>
              <div class="mons">
                <span v-for="id in e.diff.megasRemoved" :key="id" class="mon">
                  <UiPokeSprite :id="id" :size="28" />{{ gd.name('pokemon', id) }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="e.diff.itemsAdded.length || e.diff.itemsRemoved.length" class="group">
            <h3 class="section-label">{{ t('common.item') }}</h3>
            <div v-if="e.diff.itemsAdded.length" class="row">
              <span class="mark good-text">+{{ e.diff.itemsAdded.length }}</span>
              <div class="mons">
                <span v-for="id in e.diff.itemsAdded" :key="id" class="mon">
                  <UiItemIcon :id="id" :size="24" />{{ gd.name('items', id) }}
                </span>
              </div>
            </div>
            <div v-if="e.diff.itemsRemoved.length" class="row">
              <span class="mark bad-text">−{{ e.diff.itemsRemoved.length }}</span>
              <div class="mons">
                <span v-for="id in e.diff.itemsRemoved" :key="id" class="mon">
                  <UiItemIcon :id="id" :size="24" />{{ gd.name('items', id) }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="e.diff.moveChanges.length" class="group">
            <h3 class="section-label">{{ t('patch.moveChanges') }}</h3>
            <div v-for="c in e.diff.moveChanges" :key="c.id" class="row">
              <span class="move-name">{{ gd.name('moves', c.id) }}</span>
              <div class="changes">
                <span v-for="f in c.changes" :key="f.key" class="change">
                  <template v-if="f.key === 'effects' || f.key === 'target'">{{
                    t('patch.field.' + f.key)
                  }}</template>
                  <template v-else>
                    {{ t('patch.field.' + f.key) }}
                    <span class="num">{{ moveValue(f.key, f.from) }}</span>
                    →
                    <b class="num">{{ moveValue(f.key, f.to) }}</b>
                  </template>
                </span>
              </div>
            </div>
          </div>

          <div v-if="e.diff.movesAdded.length || e.diff.movesRemoved.length" class="group">
            <h3 class="section-label">{{ t('patch.moves') }}</h3>
            <div v-if="e.diff.movesAdded.length" class="row">
              <span class="mark good-text">+{{ e.diff.movesAdded.length }}</span>
              <div class="mons">
                <span v-for="id in e.diff.movesAdded" :key="id" class="mon">{{
                  gd.name('moves', id)
                }}</span>
              </div>
            </div>
            <div v-if="e.diff.movesRemoved.length" class="row">
              <span class="mark bad-text">−{{ e.diff.movesRemoved.length }}</span>
              <div class="mons">
                <span v-for="id in e.diff.movesRemoved" :key="id" class="mon">{{
                  gd.name('moves', id)
                }}</span>
              </div>
            </div>
          </div>

          <!-- 습득 기술: 기술별로 묶음 (베어가르기를 여러 마리가 새로 배우는 경우 한 줄) -->
          <div v-if="e.learn.length" class="group">
            <h3 class="section-label">{{ t('patch.learnset') }}</h3>
            <div v-for="l in e.learn" :key="(l.added ? '+' : '-') + l.move" class="row">
              <span class="mark" :class="l.added ? 'good-text' : 'bad-text'">{{
                l.added ? '+' : '−'
              }}</span>
              <span class="move-name">{{ gd.name('moves', l.move) }}</span>
              <div class="mons">
                <span v-for="id in l.mons" :key="id" class="mon">
                  <UiPokeSprite :id="id" :size="28" />{{ gd.name('pokemon', id) }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="e.diff.pokemonChanges.length" class="group">
            <h3 class="section-label">{{ t('patch.pokemonChanges') }}</h3>
            <div v-for="c in e.diff.pokemonChanges" :key="c.id" class="row">
              <span class="mon">
                <UiPokeSprite :id="c.id" :size="28" />{{ gd.name('pokemon', c.id) }}
              </span>
              <div class="changes">
                <span v-for="f in c.changes" :key="f.key" class="change">
                  {{ pokemonLabel(f.key) }}
                  <span class="num">{{ pokemonValue(f.key, f.from) }}</span>
                  →
                  <b class="num">{{ pokemonValue(f.key, f.to) }}</b>
                </span>
              </div>
            </div>
          </div>
        </template>
      </section>

      <p class="muted small note">{{ t('patch.note') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  availableMegas,
  diffRegulations,
  isEmptyDiff,
  type RegulationDiff,
} from '~/utils/regulationData'

const { t } = useI18n()
const gd = useGameData()
const reg = useRegulation()

interface LearnRow {
  move: string
  added: boolean
  mons: string[]
}
// 습득 기술 변경을 기술별로 묶기 (추가 먼저, 많이 배우는 기술 먼저)
const groupLearn = (d: RegulationDiff): LearnRow[] => {
  const rows = new Map<string, LearnRow>()
  for (const c of d.learnsetChanges)
    for (const [list, added] of [
      [c.added, true],
      [c.removed, false],
    ] as const)
      for (const move of list) {
        const key = (added ? '+' : '-') + move
        if (!rows.has(key)) rows.set(key, { move, added, mons: [] })
        rows.get(key)!.mons.push(c.id)
      }
  return [...rows.values()].sort(
    (a, b) => Number(b.added) - Number(a.added) || b.mons.length - a.mons.length,
  )
}

// 최신 레귤레이션이 위로
const entries = computed(() => {
  if (!gd.ready.value) return []
  const list = reg.list.value
  return list
    .map((r, i) => {
      const cd = gd.dataFor(r.id)!
      const prev = list[i - 1]
      const diff = prev ? diffRegulations(gd.dataFor(prev.id)!, prev, cd, r) : null
      return {
        reg: r,
        diff,
        empty: !!diff && isEmptyDiff(diff),
        learn: diff ? groupLearn(diff) : [],
        megas: availableMegas(cd, r).length,
        items: Object.values(cd.items).filter((it) => !it.megaStone).length,
      }
    })
    .reverse()
})

const moveValue = (key: string, v: unknown) => {
  if (key === 'type') return gd.name('types', String(v))
  if (key === 'category') return t('category.' + String(v))
  if (key === 'accuracy') return v == null ? '—' : String(v)
  if (key === 'power') return v ? String(v) : '—'
  return String(v)
}
const pokemonLabel = (key: string) =>
  ['types', 'abilities', 'weight'].includes(key) ? t('patch.field.' + key) : t('stat.' + key)
const pokemonValue = (key: string, v: unknown) => {
  if (key === 'types') return (v as string[]).map((x) => gd.name('types', x)).join(' / ')
  if (key === 'abilities') return (v as string[]).map((x) => gd.name('abilities', x)).join(' / ')
  return String(v)
}
</script>

<style scoped>
.patch-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1200px;
}
.panel-title {
  flex-wrap: wrap;
}
.reg-id {
  font-size: 18px;
  font-weight: 800;
}
.ver {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-2);
}
.phase {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  color: var(--text-2);
}
.phase.current {
  border-color: var(--good);
  color: var(--good);
}
.period {
  font-size: 12px;
  font-weight: 500;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.group:first-of-type {
  border-top: 0;
  padding-top: 0;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
}
.mark {
  min-width: 34px;
  font-weight: 800;
  line-height: 28px;
}
.move-name {
  min-width: 120px;
  font-weight: 700;
  line-height: 28px;
}
.mons,
.changes {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  min-width: 0;
}
.mon {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  line-height: 28px;
  white-space: nowrap;
}
.row > .mon {
  min-width: 180px;
  font-weight: 700;
}
.change {
  line-height: 28px;
  white-space: nowrap;
}
.small {
  font-size: 13px;
}
.note {
  margin: 0;
}
@media (max-width: 600px) {
  .move-name,
  .row > .mon {
    min-width: 0;
  }
  .row {
    flex-wrap: wrap;
  }
}
</style>
