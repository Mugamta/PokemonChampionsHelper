<!--
  상위 유저 파티 하나: 순위·플레이어·레이팅·전적·리플레이 링크 + 6마리(메가·도구·특성·드러난 기술·선출 횟수).
  드러나지 않은 도구·특성은 "?" (특성이 하나뿐인 폼은 그 특성) — 가져오기는 부모(pages/teams.vue)가 한다 → emit('import')
-->
<template>
  <article class="team-card panel">
    <header class="tc-head">
      <span class="tc-rank num" :class="{ none: !team.rank }" :title="t('topTeams.rankHint')">
        {{ team.rank ? t('topTeams.rankLabel', { n: team.rank }) : '—' }}
      </span>
      <span class="tc-player">{{ team.player }}</span>
      <span class="tc-rating num" :title="t('topTeams.ratingHint')">
        {{ t('topTeams.rating') }} <b>{{ team.rating }}</b>
      </span>
      <span class="tc-meta muted num">
        {{ t('topTeams.record', { games: team.games, wins: team.wins }) }} ·
        {{ t('topTeams.last', { date: dateText(team.last) }) }}
      </span>
      <span class="tc-links">
        <a
          v-for="(id, i) in team.replays"
          :key="id"
          :href="`https://replay.pokemonshowdown.com/${id}`"
          target="_blank"
          rel="noopener"
          class="tc-replay"
          :title="t('topTeams.replay', { n: i + 1 })"
          >▶{{ i + 1 }}</a
        >
      </span>
      <button type="button" class="btn btn-sm btn-primary tc-import" @click="emit('import')">
        {{ t('topTeams.import') }}
      </button>
    </header>

    <div class="tc-mons">
      <div v-for="m in team.mons" :key="m.id" class="tc-mon" :class="{ benched: !m.brought }">
        <div class="tc-top">
          <UiPokeSprite :id="m.mega ?? m.id" :size="48" />
          <div class="tc-name-wrap">
            <span class="tc-name">{{ gd.name('pokemon', m.id) }}</span>
            <span class="tc-sub num muted">
              <span v-if="m.mega" class="tc-mega">{{ t('topTeams.mega') }}</span>
              {{ t('topTeams.brought', { n: m.brought, games: team.games }) }}
            </span>
          </div>
        </div>
        <div class="tc-row" :title="t('topTeams.itemLabel')">
          <template v-if="m.item">
            <UiItemIcon :id="m.item" :size="18" />
            <span>{{ gd.name('items', m.item) }}</span>
          </template>
          <span v-else class="unknown" :title="t('topTeams.unknown')"
            >{{ t('topTeams.item') }} ?</span
          >
        </div>
        <div class="tc-row" :title="t('topTeams.abilityLabel')">
          <span v-if="abilityOf(m)">{{ gd.name('abilities', abilityOf(m)!) }}</span>
          <span v-else class="unknown" :title="t('topTeams.unknown')"
            >{{ t('topTeams.ability') }} ?</span
          >
        </div>
        <ul class="tc-moves">
          <li v-for="mv in m.moves" :key="mv">
            <UiTypeBadge v-if="gd.move(mv)" :type="gd.move(mv)!.type" small class="tc-type" />{{
              gd.name('moves', mv)
            }}
          </li>
          <li v-for="n in 4 - m.moves.length" :key="'u' + n" class="unknown">—</li>
        </ul>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { knownAbility, type TopTeam, type TopTeamMon } from '~/utils/topTeams'

defineProps<{ team: TopTeam }>()
const emit = defineEmits<{ import: [] }>()
const { t } = useI18n()
const gd = useGameData()

// 드러나지 않았어도 특성이 하나뿐이면 (메가 폼 포함) 그 특성
const abilityOf = (m: TopTeamMon) => knownAbility(m, (id) => gd.pokemon(id)?.abilities)

const pad = (n: number) => String(n).padStart(2, '0')
const dateText = (sec: number) => {
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}
</script>

<style scoped>
.team-card {
  padding: 10px 12px 12px;
}
.tc-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-bottom: 10px;
}
.tc-rank {
  min-width: 52px;
  font-weight: 800;
  color: var(--accent-text);
}
.tc-rank.none {
  color: var(--text-3);
}
.tc-player {
  font-weight: 700;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.tc-rating b {
  font-size: 15px;
}
.tc-meta {
  font-size: 12px;
}
.tc-links {
  display: inline-flex;
  gap: 6px;
  font-size: 12px;
}
.tc-replay {
  text-decoration: none;
}
.tc-import {
  margin-left: auto;
}
.tc-mons {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}
.tc-mon {
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 6px 8px 8px;
  min-width: 0;
  font-size: 12px;
}
/* 한 번도 선출하지 않은 포켓몬은 흐리게 */
.tc-mon.benched {
  opacity: 0.6;
}
.tc-top {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}
.tc-name-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.tc-name {
  font-weight: 700;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.tc-sub {
  font-size: 11px;
}
.tc-mega {
  color: var(--mega);
  font-weight: 800;
  margin-right: 4px;
}
.tc-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;
}
.unknown {
  color: var(--text-3);
}
.tc-moves {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tc-moves li {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 18px;
}
.tc-type {
  flex: none;
}
@media (max-width: 1100px) {
  .tc-mons {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .tc-mons {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tc-import {
    margin-left: 0;
  }
}
</style>
