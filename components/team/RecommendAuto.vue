<!--
  추천 파티 — 자동 추천 (RecommendDialog 의 탭). 첫 포켓몬을 고르면 핵심(함께 자주 쓰인 포켓몬) + 대비(핵심에게 두루 강한
  상대를 물러나게 하는 포켓몬)로 6마리 (utils/teamRecommend.ts recommendTeam, 설정은 RecommendSettings).
  "빼기"로 후보에서 빼고 다시 고름. 적용은 부모 → emit('apply', 폼 id 목록)
-->
<template>
  <div class="mode-body">
    <div class="lead-row">
      <span class="section-label">{{ t('party.rec.lead') }}</span>
      <TeamSpeciesPicker
        v-model="rec.lead.value"
        :ids="rec.ids.value"
        :label="t('party.rec.leadHint')"
      />
    </div>

    <div class="body-scroll">
      <p v-if="!rec.lead.value" class="muted small">{{ t('party.rec.pickFirst') }}</p>
      <p v-else-if="!rec.base.value" class="muted small">{{ t('party.rec.loading') }}</p>
      <template v-else-if="result">
        <p v-if="!rec.vs.value" class="warn-text small">{{ t('party.rec.noVs') }}</p>
        <ol class="picks">
          <li v-for="(p, i) in result.picks" :key="p.id" class="pick" :class="p.role">
            <UiPokeSprite :id="p.id" :size="40" />
            <div class="pick-main">
              <div class="pick-head">
                <strong>{{ gd.name('pokemon', p.id) }}</strong>
                <span class="types">
                  <UiTypeBadge
                    v-for="ty in gd.pokemon(p.id)?.types ?? []"
                    :key="ty"
                    :type="ty"
                    small
                  />
                </span>
                <span class="tag" :class="p.role">{{ t('party.rec.role.' + p.role) }}</span>
              </div>
              <div class="reasons small">
                <span v-if="p.mates.length" class="reason mate">
                  {{ t('party.rec.mate') }}
                  <span v-for="[m, v] in p.mates" :key="m" class="ref"
                    >{{ gd.name('pokemon', m) }} {{ pct(v) }}</span
                  >
                </span>
                <span v-if="p.counters.length" class="reason counter">
                  {{ t('party.rec.counter') }}
                  <span v-for="[m, v] in p.counters" :key="m" class="ref"
                    >{{ gd.name('pokemon', m) }} {{ pct(v) }}</span
                  >
                </span>
                <span v-if="i > 0 && !p.mates.length && !p.counters.length" class="muted">
                  {{ t('party.rec.usageOnly') }}
                </span>
              </div>
            </div>
            <button
              v-if="i > 0"
              type="button"
              class="chip"
              :title="t('party.rec.excludeHint')"
              @click="rec.excluded.value.push(p.id)"
            >
              {{ t('party.rec.exclude') }}
            </button>
          </li>
        </ol>

        <TeamRecommendThreats :threats="result.threats" :title="t('party.rec.threats')" />

        <div v-if="rec.excluded.value.length" class="chip-row small">
          <span class="muted">{{ t('party.rec.excluded') }}</span>
          <button
            v-for="id in rec.excluded.value"
            :key="id"
            type="button"
            class="chip"
            :title="t('party.rec.restoreHint')"
            @click="rec.excluded.value.splice(rec.excluded.value.indexOf(id), 1)"
          >
            {{ gd.name('pokemon', id) }} ✕
          </button>
        </div>
      </template>
    </div>

    <div class="foot">
      <button
        type="button"
        class="btn btn-sm"
        :disabled="!result"
        :title="t('party.rec.toManualHint')"
        @click="toManual"
      >
        {{ t('party.rec.toManual') }}
      </button>
      <span class="spacer" />
      <span class="muted small">{{ t('party.rec.applyHint') }}</span>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!result || !result.picks.length"
        @click="emit('apply', forms)"
      >
        {{ t('party.rec.apply') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTeamRecommend } from '~/composables/useTeamRecommend'
import { recommendTeam } from '~/utils/teamRecommend'

const emit = defineEmits<{ apply: [forms: string[]] }>()
const { t } = useI18n()
const gd = useGameData()
const rec = useTeamRecommend()

watch(rec.lead, () => (rec.excluded.value = []))
// 표에 없는 폼이 남아 있으면 비움 (통계 종류를 바꾼 경우)
watch(
  rec.ids,
  (ids) => {
    if (rec.lead.value && ids.length && !ids.includes(rec.lead.value)) rec.lead.value = ''
  },
  { immediate: true },
)

const result = computed(() => {
  const base = rec.base.value
  if (!rec.lead.value || !base) return null
  return recommendTeam({ ...base, members: [rec.lead.value], exclude: rec.excluded.value })
})
const forms = computed(() => result.value?.picks.map((p) => p.id) ?? [])

// 이 결과를 직접 고르기에서 이어서 고치기
const toManual = () => {
  rec.members.value = [...forms.value]
  rec.mode.value = 'manual'
}

const pct = (v: number) => `${Math.round(v * 100)}%`
</script>

<style scoped>
.lead-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.picks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pick {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--well);
  border: 1px solid var(--line-soft);
}
.pick.lead {
  border-color: var(--accent-2);
}
.pick-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pick-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.types {
  display: flex;
  gap: 3px;
}
.tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-2);
}
.tag.counter {
  color: var(--good);
}
.reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--text-2);
}
.reason {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  align-items: center;
}
.reason.mate::before,
.reason.counter::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.reason.mate::before {
  background: var(--accent-2);
}
.reason.counter::before {
  background: var(--good);
}
.ref {
  color: var(--text);
  font-weight: 600;
}
</style>
