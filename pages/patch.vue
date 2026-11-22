<!--
  패치 내역: 레귤레이션마다 직전 레귤레이션과 비교해 바뀐 출전 포켓몬·메가진화·도구·기술 수치·습득 기술·종족값.
  데이터는 레귤레이션별로 덮어쓴 게임 데이터(useGameData().dataFor)를 utils/regulationData.ts 의 diffRegulations 로 비교
  (composables/usePatchHistory.ts — 도감의 포켓몬·기술·도구별 패치 이력과 공유).
  기술·특성의 동작(수치가 아닌 효과) 변경은 데이터에 없어서 표시하지 않는다.
  첫 레귤레이션(개막)은 빈 레귤레이션과 비교해 처음 나온 포켓몬·메가진화·도구·기술을 전부 "추가"로 보여준다.
  포켓몬은 도감 번호 순(추가·제외 목록은 세대별), 포켓몬·기술·도구를 누르면 도감의 해당 탭으로.
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

        <!-- 첫 레귤레이션(개막): 규모 + 처음 나온 것 전부 -->
        <p v-if="e.first" class="muted small first">
          {{ t('patch.first', { pokemon: e.reg.pokemon.length, megas: e.megas, items: e.items }) }}
        </p>
        <p v-if="e.empty" class="muted small">{{ t('patch.noChange') }}</p>
        <template v-else>
          <div v-if="e.diff.pokemonAdded.length || e.diff.pokemonRemoved.length" class="group">
            <h3 class="section-label">{{ t('patch.pokemon') }}</h3>
            <div v-if="e.diff.pokemonAdded.length" class="row">
              <span class="mark good-text">+{{ e.diff.pokemonAdded.length }}</span>
              <PatchMonList :ids="e.diff.pokemonAdded" grouped />
            </div>
            <div v-if="e.diff.pokemonRemoved.length" class="row">
              <span class="mark bad-text">−{{ e.diff.pokemonRemoved.length }}</span>
              <PatchMonList :ids="e.diff.pokemonRemoved" grouped />
            </div>
          </div>

          <div v-if="e.diff.megasAdded.length || e.diff.megasRemoved.length" class="group">
            <h3 class="section-label">{{ t('common.mega') }}</h3>
            <div v-if="e.diff.megasAdded.length" class="row">
              <span class="mark good-text">+{{ e.diff.megasAdded.length }}</span>
              <PatchMonList :ids="e.diff.megasAdded" grouped />
            </div>
            <div v-if="e.diff.megasRemoved.length" class="row">
              <span class="mark bad-text">−{{ e.diff.megasRemoved.length }}</span>
              <PatchMonList :ids="e.diff.megasRemoved" grouped />
            </div>
          </div>

          <div v-if="e.diff.itemsAdded.length || e.diff.itemsRemoved.length" class="group">
            <h3 class="section-label">{{ t('common.item') }}</h3>
            <div v-if="e.diff.itemsAdded.length" class="row">
              <span class="mark good-text">+{{ e.diff.itemsAdded.length }}</span>
              <div class="mons">
                <NuxtLink
                  v-for="id in e.diff.itemsAdded"
                  :key="id"
                  class="mon link"
                  :to="itemLink(id)"
                >
                  <UiItemIcon :id="id" :size="24" />{{ gd.name('items', id) }}
                </NuxtLink>
              </div>
            </div>
            <div v-if="e.diff.itemsRemoved.length" class="row">
              <span class="mark bad-text">−{{ e.diff.itemsRemoved.length }}</span>
              <div class="mons">
                <NuxtLink
                  v-for="id in e.diff.itemsRemoved"
                  :key="id"
                  class="mon link"
                  :to="itemLink(id)"
                >
                  <UiItemIcon :id="id" :size="24" />{{ gd.name('items', id) }}
                </NuxtLink>
              </div>
            </div>
          </div>

          <div v-if="e.diff.moveChanges.length" class="group">
            <h3 class="section-label">{{ t('patch.moveChanges') }}</h3>
            <div v-for="c in e.diff.moveChanges" :key="c.id" class="row">
              <NuxtLink class="move-name link" :to="moveLink(c.id)">{{
                gd.name('moves', c.id)
              }}</NuxtLink>
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
                <NuxtLink
                  v-for="id in e.diff.movesAdded"
                  :key="id"
                  class="mon link"
                  :to="moveLink(id)"
                  >{{ gd.name('moves', id) }}</NuxtLink
                >
              </div>
            </div>
            <div v-if="e.diff.movesRemoved.length" class="row">
              <span class="mark bad-text">−{{ e.diff.movesRemoved.length }}</span>
              <div class="mons">
                <NuxtLink
                  v-for="id in e.diff.movesRemoved"
                  :key="id"
                  class="mon link"
                  :to="moveLink(id)"
                  >{{ gd.name('moves', id) }}</NuxtLink
                >
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
              <NuxtLink class="move-name link" :to="moveLink(l.move)">{{
                gd.name('moves', l.move)
              }}</NuxtLink>
              <PatchMonList :ids="l.mons" />
            </div>
          </div>

          <div v-if="e.diff.pokemonChanges.length" class="group">
            <h3 class="section-label">{{ t('patch.pokemonChanges') }}</h3>
            <div v-for="c in byNum(e.diff.pokemonChanges)" :key="c.id" class="row">
              <NuxtLink class="mon link" :to="{ path: '/dex', query: { id: c.id } }">
                <UiPokeSprite :id="c.id" :size="28" />{{ gd.name('pokemon', c.id) }}
              </NuxtLink>
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
import { usePatchHistory } from '~/composables/usePatchHistory'
import { availableMegas, isEmptyDiff, type RegulationDiff } from '~/utils/regulationData'

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

// 최신 레귤레이션이 위로 (비교는 usePatchHistory 가 레귤레이션마다 한 번만)
const history = usePatchHistory()
const entries = computed(() =>
  history.entries.value
    .map((h) => {
      const r = reg.list.value.find((x) => x.id === h.reg)!
      return {
        reg: r,
        first: h.first,
        diff: h.diff,
        empty: isEmptyDiff(h.diff),
        learn: groupLearn(h.diff),
        megas: availableMegas(h.data, r).length,
        items: Object.values(h.data.items).filter((it) => !it.megaStone).length,
      }
    })
    .reverse(),
)

// 도감으로 (포켓몬은 PatchMonList)
const moveLink = (id: string) => ({ path: '/dex', query: { tab: 'moves', move: id } })
const itemLink = (id: string) => ({ path: '/dex', query: { tab: 'items', item: id } })
// 종족값 등 변경: 도감 번호 순
const byNum = <T extends { id: string }>(list: T[]) =>
  [...list].sort((a, b) => (gd.pokemon(a.id)?.num ?? 0) - (gd.pokemon(b.id)?.num ?? 0))

const { moveValue, pokemonLabel, pokemonValue } = history
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
.link {
  color: var(--text);
  text-decoration: none;
  border-radius: 6px;
  padding-right: 4px;
}
.link:hover {
  background: var(--hover);
  color: var(--accent-text);
}
.first {
  margin: 0 0 8px;
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
