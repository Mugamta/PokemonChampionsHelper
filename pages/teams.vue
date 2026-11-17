<!--
  상위 유저 파티: Pokémon Showdown 레이팅 배틀 리플레이에서 모은 상위 플레이어의 파티 (싱글/더블).
  기준 = 레이팅 이상(이 파티로 한 배틀 중 최고 배틀 전 레이팅) 또는 래더 순위 TOP N(자료를 받은 날 기준 플레이어 순위).
  싱글/더블은 통계 화면과 같은 선택(useUsageKind), 레귤레이션·기준은 주소(?reg=&by=&v=)에 남김.
  데이터: composables/useTopTeams.ts (public/data/teams/), 고르기: utils/topTeams.ts, 카드: components/teams/TeamCard.vue
-->
<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ t('topTeams.title') }}</h1>
        <p class="page-sub">
          {{ t('topTeams.sub') }} ·
          <a href="https://replay.pokemonshowdown.com/" target="_blank" rel="noopener"
            >Pokémon Showdown</a
          >
        </p>
      </div>
    </div>

    <UiPageLoading v-if="!gd.ready.value || index === undefined" />
    <p v-else-if="!regs.length" class="panel panel-pad muted">{{ t('topTeams.noData') }}</p>
    <template v-else>
      <!-- 1줄: 레이팅/순위 기준 · 싱글/더블 (+ 포켓몬 검색), 2줄: 레귤레이션 · 기준 값 -->
      <div class="toolbar">
        <div class="tab-row" role="tablist">
          <button
            v-for="b in BYS"
            :key="b"
            type="button"
            role="tab"
            class="tab-btn"
            :aria-selected="by === b"
            :class="{ active: by === b }"
            @click="setQuery({ by: b, v: undefined })"
          >
            {{ t('topTeams.by.' + b) }}
          </button>
        </div>
        <TeamUsageKindToggle class="kind" />
        <input
          v-model="query"
          type="search"
          class="field-input search"
          :placeholder="t('topTeams.search')"
          :aria-label="t('topTeams.search')"
        />
      </div>
      <div class="toolbar">
        <div class="chip-row" role="group" :aria-label="t('regulation.label')">
          <button
            v-for="r in regs"
            :key="r"
            type="button"
            class="chip"
            :class="{ active: r === regId }"
            :aria-pressed="r === regId"
            @click="setQuery({ reg: r })"
          >
            {{ t('usageStats.season', { reg: r }) }}
          </button>
        </div>
        <div class="chip-row steps" role="group" :aria-label="t('topTeams.by.' + by)">
          <template v-if="by === 'rating'">
            <button
              v-for="v in [0, ...steps]"
              :key="v"
              type="button"
              class="chip"
              :class="{ active: v === filter.min }"
              :aria-pressed="v === filter.min"
              @click="setQuery({ v: v ? String(v) : undefined })"
            >
              {{ v ? t('topTeams.ratingMin', { n: v }) : t('topTeams.all') }}
            </button>
          </template>
          <template v-else>
            <button
              v-for="v in RANK_STEPS"
              :key="v"
              type="button"
              class="chip"
              :class="{ active: v === filter.top }"
              :aria-pressed="v === filter.top"
              @click="setQuery({ v: String(v) })"
            >
              {{ t('topTeams.rankTop', { n: v }) }}
            </button>
          </template>
        </div>
      </div>

      <UiPageLoading v-if="file === undefined" />
      <p v-else-if="!file" class="panel panel-pad muted">{{ t('topTeams.noData') }}</p>
      <template v-else>
        <p class="summary muted">
          {{
            t('topTeams.summary', {
              replays: file.replays.toLocaleString(),
              date: file.fetched,
              n: shown.length,
            })
          }}
          <br />
          <span class="note">{{ t('topTeams.note') }}</span>
        </p>
        <p v-if="!shown.length" class="panel panel-pad muted">{{ t('topTeams.none') }}</p>
        <div class="team-list">
          <TeamsTeamCard
            v-for="team in shown.slice(0, limit)"
            :key="team.player + team.replays[0]"
            :team="team"
            @import="importTeam(team)"
          />
        </div>
        <button
          v-if="shown.length > limit"
          type="button"
          class="btn btn-ghost more"
          @click="limit += PAGE"
        >
          {{ t('topTeams.more', { n: shown.length - limit }) }}
        </button>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useTopTeams } from '~/composables/useTopTeams'
import { useUsageKind } from '~/composables/useUsageKind'
import {
  filterTeams,
  RANK_STEPS,
  ratingSteps,
  sortTeams,
  type TeamFilter,
  type TopTeam,
} from '~/utils/topTeams'
import { emptySlot, type TeamSlot } from '~/utils/types'

const { t, locale } = useI18n()
const gd = useGameData()
const reg = useRegulation()
const route = useRoute()
const router = useRouter()
const kind = useUsageKind()
const top = useTopTeams(kind)
const mine = useTeam('mine')

// ── 레귤레이션 ─────────────
const index = computed(() => top.index())
// 레귤레이션 목록 순서대로 자료가 있는 것만
const regs = computed(() => {
  const have = index.value?.[kind.value] ?? {}
  return reg.list.value.map((r) => r.id).filter((id) => have[id])
})
const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
// 주소에 없거나 자료가 없으면 현재 레귤레이션, 그것도 없으면 마지막
const regId = computed(() => {
  const list = regs.value
  if (list.includes(q('reg'))) return q('reg')
  const cur = reg.active.value?.id
  return cur && list.includes(cur) ? cur : list.at(-1)
})
const file = computed(() => top.file(regId.value))
const setQuery = (patch: Record<string, string | undefined>) =>
  router.replace({ query: { ...route.query, ...patch } })

// ── 기준 ─────────────
const BYS = ['rating', 'rank'] as const
const by = computed(() => (q('by') === 'rank' ? 'rank' : 'rating'))
const steps = computed(() => ratingSteps(file.value?.teams ?? []))
const filter = computed<TeamFilter & { min?: number; top?: number }>(() => {
  const v = Number(q('v'))
  if (by.value === 'rank')
    return { by: 'rank', top: (RANK_STEPS as readonly number[]).includes(v) ? v : 100 }
  return { by: 'rating', min: steps.value.includes(v) ? v : 0 }
})

// ── 포켓몬 검색 (이름 일부, 종·메가 폼 모두) ─────────────
const query = ref('')
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.()]/g, '')
const matchIds = (team: TopTeam, s: string) =>
  team.mons.some((m) =>
    [m.id, m.mega].some((id) => id && (id.includes(s) || norm(gd.name('pokemon', id)).includes(s))),
  )

const PAGE = 30
const limit = ref(PAGE)
const shown = computed(() => {
  void locale.value
  const s = norm(query.value)
  const list = filterTeams(file.value?.teams ?? [], filter.value)
  return sortTeams(s ? list.filter((tm) => matchIds(tm, s)) : list, filter.value)
})
watch([regId, filter, query, kind], () => (limit.value = PAGE))

// ── 내 파티로 가져오기 ─────────────
const importTeam = async (team: TopTeam) => {
  if (mine.filled.value > 0 && !window.confirm(t('topTeams.importConfirm'))) return
  const slots: TeamSlot[] = await top.toSlots(team)
  mine.slots.value.forEach((_, i) => {
    mine.slots.value[i] = slots[i] ?? emptySlot()
    mine.megaOn.value[i] = true
    mine.altOn.value[i] = null
  })
  await router.push('/party')
}
</script>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.kind {
  padding-left: 10px;
  border-left: 1px solid var(--line);
}
.search {
  width: min(240px, 100%);
  margin-left: auto;
}
.steps {
  padding-left: 10px;
  border-left: 1px solid var(--line);
}
.summary {
  margin: 0 0 12px;
  font-size: 13px;
}
.note {
  font-size: 12px;
}
.team-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.more {
  display: block;
  margin: 14px auto 0;
}
</style>
